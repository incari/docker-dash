/**
 * Reading containers from a host, whichever kind of host it is.
 *
 * Every host is a Docker daemon reached directly: the local one over this
 * process's own socket, the rest over ssh or through a socket proxy (see
 * dockerClients.ts). Callers do not care which: they get the same containers
 * back either way, and a host that cannot be reached fails on its own without
 * taking the other servers' containers down with it.
 */

import {
  listContainers,
  runContainerAction,
  type ContainerAction,
} from "./dockerOps.js";
import { READ_TIMEOUT_MS, buildDocker, dockerFor } from "./dockerClients.js";
import { HostUrlError } from "./hostUrl.js";
import { SshTransportError } from "./sshTransport.js";
import {
  LOCAL_HOST_ID,
  isBackingOff,
  listEnabledHosts,
  recordHostOffline,
  recordHostOnline,
} from "./registry.js";
import { isDockerUnavailable } from "../utils/dockerErrors.js";
import type { HostRow, NormalizedContainer } from "../types/index.js";

/**
 * How long a fan-out result is reused.
 *
 * The dashboard polls every 5 seconds per open tab, and each poll would
 * otherwise become one request per server per tab. Two seconds keeps the UI as
 * fresh as it was with a single host while collapsing the fan-out.
 */
const CONTAINER_CACHE_MS = parseInt(
  process.env.HOST_CACHE_MS || "2000",
  10,
);

/**
 * How long the whole fan-out may take before it answers with what it has.
 *
 * Backing off keeps a dead server from being read on every poll, but the read
 * that ends each backoff still has to happen, and while it is happening every
 * other server's containers are waiting behind it - measured at six seconds.
 * Past this deadline the slow server simply does not contribute to this
 * response; its request carries on in the background and its result decides
 * what the next one looks like.
 */
const FANOUT_DEADLINE_MS = parseInt(
  process.env.HOST_DEADLINE_MS || "2000",
  10,
);

let containerCache: { at: number; containers: NormalizedContainer[] } | null =
  null;
let inFlight: Promise<NormalizedContainer[]> | null = null;

/**
 * The last containers each host was known to have.
 *
 * Used only when a host misses the deadline, so a server that is merely slow
 * keeps its containers on screen instead of blinking out of existence every
 * few seconds. Cleared the moment it actually fails.
 */
const lastKnown = new Map<number, NormalizedContainer[]>();

/** Resolves to `value` after `ms`, without keeping the process alive. */
function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(value), ms);
    timer.unref?.();
  });
}

/**
 * Why a host could not be read.
 *
 * The browser shows these to the user in their own language, and the backend
 * has no translations, so every failure carries a code the frontend can look
 * up. The message stays as the fallback for anything unforeseen.
 */
export type HostErrorCode =
  | "no_url"
  | "legacy_agent"
  | "bad_url"
  | "bad_response"
  | "refused"
  | "dns"
  | "timeout"
  | "ssh_auth"
  | "ssh_host_key"
  | "no_docker_cli"
  | "socket_permission"
  | "forbidden"
  | "docker_down"
  | "unreachable";

export class HostRequestError extends Error {
  constructor(
    message: string,
    readonly code: HostErrorCode = "unreachable",
  ) {
    super(message);
  }
}

/** The code behind any failure, so the browser can phrase it itself. */
export function hostErrorCode(
  error: unknown,
  host?: Pick<HostRow, "type">,
): HostErrorCode {
  if (error instanceof HostRequestError) return error.code;
  return describeDockerFailure(error, host).code;
}

/**
 * Say why a daemon never answered.
 *
 * dockerode surfaces whatever the transport threw - a socket error for tcp://,
 * ssh's own complaint for ssh://, an HTTP status when a proxy says no - and
 * none of those tell the person adding a server what to fix on their own.
 */
export function describeDockerFailure(
  error: unknown,
  host?: Pick<HostRow, "type">,
): HostRequestError {
  if (error instanceof HostRequestError) return error;

  // The local socket refusing or missing is the ordinary case of Docker not
  // running on a laptop, not a network problem to go and debug.
  if (host?.type === "local" && isDockerUnavailable(error)) {
    return new HostRequestError(
      "Docker is not running on this server",
      "docker_down",
    );
  }

  if (error instanceof HostUrlError) {
    return new HostRequestError(error.message, error.code);
  }

  if (error instanceof SshTransportError) {
    return new HostRequestError(error.message, error.code);
  }

  const err = error as {
    code?: string;
    statusCode?: number;
    message?: string;
  };

  switch (err?.code) {
    case "ECONNREFUSED":
      return new HostRequestError(
        "Connection refused - nothing is listening on that address and port",
        "refused",
      );
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return new HostRequestError("That hostname does not resolve", "dns");
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
      return new HostRequestError(
        "The connection timed out - check the address and any firewall",
        "timeout",
      );
    default:
      break;
  }

  // docker-modem reports its own timeout as a plain message.
  if (err?.message && /timeout/i.test(err.message) && !err.statusCode) {
    return new HostRequestError(
      `No answer within ${Math.round(READ_TIMEOUT_MS / 1000)}s`,
      "timeout",
    );
  }

  // A socket proxy answers 403 for every section it was not told to open.
  if (err?.statusCode === 403) {
    return new HostRequestError(
      "The socket proxy refused this. Give it CONTAINERS=1, and POST=1 to start and stop.",
      "forbidden",
    );
  }

  if (isDockerUnavailable(error)) {
    return new HostRequestError(
      "Docker is not running on this server",
      "docker_down",
    );
  }

  return new HostRequestError(
    err?.message || "Unreachable",
    "unreachable",
  );
}

function withHost(
  host: HostRow,
  containers: Array<Omit<NormalizedContainer, "hostId" | "hostName">>,
): NormalizedContainer[] {
  return containers.map((c) => ({
    ...c,
    hostId: host.id,
    hostName: host.name,
  }));
}

/** Every container on one host. Throws when the host cannot be read. */
export async function fetchHostContainers(
  host: HostRow,
): Promise<NormalizedContainer[]> {
  return withHost(host, await listContainers(dockerFor(host)));
}

/**
 * Containers from every enabled host, in host order.
 *
 * Hosts are read in parallel and a failing one contributes nothing but its
 * status: a dead server leaves the rest of the fleet on screen instead of
 * emptying the dashboard. A host that has been failing is skipped outright
 * until its backoff expires, so it costs nothing at all rather than the
 * request timeout on every read.
 */
export async function fetchAllContainers(): Promise<NormalizedContainer[]> {
  const hosts = listEnabledHosts();

  const results = await Promise.all(
    hosts.map((host) => {
      if (isBackingOff(host)) {
        return [] as NormalizedContainer[];
      }

      // Never rejects: a host reports itself and contributes nothing on
      // failure, so one bad server cannot empty the dashboard.
      const read = (async () => {
        try {
          const containers = await fetchHostContainers(host);
          recordHostOnline(host.id, containers.length);
          lastKnown.set(host.id, containers);
          return containers;
        } catch (error) {
          const { message, code } = describeDockerFailure(error, host);
          recordHostOffline(host.id, message, code);
          lastKnown.delete(host.id);
          console.warn(`[HOSTS] ${host.name} unavailable: ${message}`);
          return [] as NormalizedContainer[];
        }
      })();

      return Promise.race([
        read,
        after(FANOUT_DEADLINE_MS, lastKnown.get(host.id) ?? []),
      ]);
    }),
  );

  return results.flat();
}

/** Fan-out result shared by everything that needs "all containers, roughly now". */
export async function getAllContainers(
  options: { fresh?: boolean } = {},
): Promise<NormalizedContainer[]> {
  if (!options.fresh && containerCache) {
    if (Date.now() - containerCache.at < CONTAINER_CACHE_MS) {
      return containerCache.containers;
    }
  }

  // Requests that arrive while a fan-out is running wait for it instead of
  // starting a second one - several browser tabs poll on the same interval.
  if (inFlight) return inFlight;

  inFlight = fetchAllContainers()
    .then((containers) => {
      containerCache = { at: Date.now(), containers };
      return containers;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Drops the cache so the next read reflects a change that just happened. */
export function invalidateContainerCache(): void {
  containerCache = null;
}

/** Drops what a host was last known to have, when it is removed or re-pointed. */
export function forgetHostContainers(hostId: number): void {
  lastKnown.delete(hostId);
}

/**
 * Start, stop or restart a container on a host.
 * Returns false when the host has no such container, so the caller can 404.
 */
export async function runHostContainerAction(
  host: HostRow,
  containerId: string,
  action: ContainerAction,
): Promise<boolean> {
  invalidateContainerCache();
  try {
    return await runContainerAction(
      dockerFor(host, "action"),
      containerId,
      action,
    );
  } catch (error) {
    // A container that is already in the state asked for is not a failure
    // anyone needs to hear about.
    if ((error as { statusCode?: number })?.statusCode === 304) return true;
    throw host.type === "local" ? error : describeDockerFailure(error, host);
  }
}

/**
 * Which host a container belongs to, for the legacy routes that only carry a
 * container ID. Answers from the cached fan-out, so it costs nothing when the
 * dashboard has just listed the containers - which it always has.
 */
export async function findHostForContainer(
  containerId: string,
): Promise<{ host: HostRow; container: NormalizedContainer } | null> {
  const containers = await getAllContainers();
  const match = containers.find((c) => c.id === containerId);
  if (!match) return null;

  const host = listEnabledHosts().find((h) => h.id === match.hostId);
  return host ? { host, container: match } : null;
}

/**
 * Check a server before it is saved, using an address that is not in the
 * database yet.
 */
export async function pingHost(
  host: Pick<HostRow, "id" | "type" | "url">,
): Promise<{
  ok: boolean;
  containers?: number;
  version?: string;
  error?: string;
  error_code?: HostErrorCode;
}> {
  try {
    // Uncached: an address being tried out may never be saved.
    const docker = buildDocker(host);
    const [version, containers] = await Promise.all([
      docker.version().catch(() => null),
      listContainers(docker),
    ]);
    return {
      ok: true,
      containers: containers.length,
      version: version?.Version,
    };
  } catch (error) {
    const failure = describeDockerFailure(error, host);
    return { ok: false, error: failure.message, error_code: failure.code };
  }
}

export { LOCAL_HOST_ID };
