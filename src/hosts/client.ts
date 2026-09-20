/**
 * Reading containers from a host, whichever kind of host it is.
 *
 * A `local` host goes straight to the Docker socket. An `agent` host is another
 * docker-dash installation, reached over HTTP at /api/agent with a shared
 * token. Callers do not care which: they get the same containers back either
 * way, and a host that cannot be reached fails on its own without taking the
 * other servers' containers down with it.
 */

import {
  listLocalContainers,
  runLocalContainerAction,
  type ContainerAction,
} from "./localDocker.js";
import {
  LOCAL_HOST_ID,
  isBackingOff,
  listEnabledHosts,
  recordHostOffline,
  recordHostOnline,
} from "./registry.js";
import { isDockerUnavailable } from "../utils/dockerErrors.js";
import type { HostRow, NormalizedContainer } from "../types/index.js";

/** A remote server that is down must not hold the whole dashboard hostage. */
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.HOST_TIMEOUT_MS || "6000",
  10,
);

/**
 * How long a fan-out result is reused.
 *
 * The dashboard polls every 5 seconds per open tab, and each poll would
 * otherwise become one HTTP request per server per tab. Two seconds keeps the
 * UI as fresh as it was with a single host while collapsing the fan-out.
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
  | "key_rejected"
  | "not_an_agent"
  | "bad_response"
  | "refused"
  | "dns"
  | "timeout"
  | "tls"
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
export function hostErrorCode(error: unknown): HostErrorCode {
  if (error instanceof HostRequestError) return error.code;
  if (isDockerUnavailable(error)) return "docker_down";
  return "unreachable";
}

function agentBaseUrl(host: HostRow): string {
  const base = (host.url || "").trim().replace(/\/+$/, "");
  if (!base) {
    throw new HostRequestError("This server has no URL configured", "no_url");
  }
  return base;
}

/**
 * Say why a request never got an answer.
 *
 * fetch reports every transport failure as "fetch failed" and hides the real
 * reason in `cause`, which would leave the person adding a server staring at a
 * message that does not distinguish a typo in the URL from a closed port.
 */
function describeFetchFailure(error: unknown): HostRequestError {
  if (error instanceof Error && error.name === "AbortError") {
    return new HostRequestError(
      `No answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`,
      "timeout",
    );
  }

  const cause = (error as { cause?: { code?: string; message?: string } })
    ?.cause;

  switch (cause?.code) {
    case "ECONNREFUSED":
      return new HostRequestError(
        "Connection refused - nothing is listening on that address and port",
        "refused",
      );
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return new HostRequestError("That hostname does not resolve", "dns");
    case "ETIMEDOUT":
      return new HostRequestError(
        "The connection timed out - check the address and any firewall",
        "timeout",
      );
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return new HostRequestError(
        "The TLS certificate was rejected. Use http:// or a certificate this machine trusts.",
        "tls",
      );
    default:
      break;
  }

  return new HostRequestError(
    cause?.message ||
      (error instanceof Error ? error.message : "Unreachable"),
    "unreachable",
  );
}

/**
 * One request to a remote agent, with a timeout and messages that say what the
 * person has to fix rather than quoting a status code at them.
 */
async function agentRequest<T>(
  host: HostRow,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${agentBaseUrl(host)}/api/agent${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers || {}),
        Accept: "application/json",
        Authorization: `Bearer ${host.api_key || ""}`,
      },
    });
  } catch (error) {
    throw describeFetchFailure(error);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new HostRequestError(
      "The API key was rejected by this server. Copy the key from that server's own dashboard, under Servers.",
      "key_rejected",
    );
  }
  if (response.status === 404) {
    throw new HostRequestError(
      "This server is not set up to be read by a hub. Switch it on in its own dashboard, under Servers, and make sure it runs docker-dash 0.3 or newer.",
      "not_an_agent",
    );
  }
  if (!response.ok) {
    throw new HostRequestError(
      `Server answered ${response.status}`,
      response.status === 503 ? "docker_down" : "bad_response",
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new HostRequestError(
      "This server answered something that is not JSON - is the URL pointing at docker-dash?",
      "bad_response",
    );
  }
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
  if (host.type === "local") {
    return withHost(host, await listLocalContainers());
  }

  const containers = await agentRequest<
    Array<Omit<NormalizedContainer, "hostId" | "hostName">>
  >(host, "/containers");

  if (!Array.isArray(containers)) {
    throw new HostRequestError(
      "This server did not return a container list",
      "bad_response",
    );
  }

  return withHost(host, containers);
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
          // A local daemon that is simply not running is the ordinary case on
          // a laptop, and says so rather than looking like a broken
          // configuration.
          const message = isDockerUnavailable(error)
            ? "Docker is not running on this server"
            : error instanceof Error
              ? error.message
              : "Unreachable";
          recordHostOffline(host.id, message, hostErrorCode(error));
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

  if (host.type === "local") {
    return runLocalContainerAction(containerId, action);
  }

  try {
    await agentRequest(
      host,
      `/containers/${encodeURIComponent(containerId)}/${action}`,
      { method: "POST" },
    );
    return true;
  } catch (error) {
    if (
      error instanceof HostRequestError &&
      error.message.startsWith("Server answered 404")
    ) {
      return false;
    }
    throw error;
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
 * Check a server before it is saved, using credentials that are not in the
 * database yet.
 */
export async function pingHost(
  host: Pick<HostRow, "id" | "name" | "type" | "url" | "api_key">,
): Promise<{
  ok: boolean;
  containers?: number;
  name?: string;
  version?: string;
  error?: string;
  error_code?: HostErrorCode;
}> {
  try {
    if (host.type === "local") {
      const containers = await listLocalContainers();
      return { ok: true, containers: containers.length };
    }

    const result = await agentRequest<{
      ok: boolean;
      name?: string;
      version?: string;
      containers?: number;
    }>(host as HostRow, "/ping");

    return {
      ok: true,
      containers: result.containers,
      name: result.name,
      version: result.version,
    };
  } catch (error) {
    return {
      ok: false,
      error: isDockerUnavailable(error)
        ? "Docker is not running on this server"
        : error instanceof Error
          ? error.message
          : "Unreachable",
      error_code: hostErrorCode(error),
    };
  }
}

export { LOCAL_HOST_ID };
