/**
 * One dockerode client per server, built from the address stored for it.
 *
 * The local host keeps the client this process has always used, on its own
 * socket. Every other server is reached directly at its Docker API - over ssh
 * or through a socket proxy - with nothing of docker-dash installed there.
 *
 * Each server gets two clients that differ only in their timeout, because
 * dockerode applies it to every request. A listing has to give up quickly on a
 * machine that is unplugged, while stopping a container legitimately takes up
 * to Docker's own ten-second grace period.
 */

import Docker from "dockerode";
import { docker as localDocker } from "../config/docker.js";
import { parseHostUrl } from "./hostUrl.js";
import { createSshAgent } from "./sshTransport.js";
import type { HostRow } from "../types/index.js";

/** A remote server that is down must not hold the whole dashboard hostage. */
export const READ_TIMEOUT_MS = parseInt(
  process.env.HOST_TIMEOUT_MS || "6000",
  10,
);

/** Long enough for `docker stop`'s grace period and then some. */
export const ACTION_TIMEOUT_MS = 30_000;

type Purpose = "read" | "action";

const cache = new Map<string, Docker>();

function buildClient(url: string, timeout: number): Docker {
  const address = parseHostUrl(url);

  if (address.transport === "unix") {
    return new Docker({ socketPath: address.socketPath as string, timeout });
  }

  if (address.transport === "tcp") {
    return new Docker({
      protocol: "http",
      host: address.host,
      port: address.port as number,
      timeout,
    });
  }

  // Plain http over the ssh pipe: host and port only end up in the Host
  // header, which dial-stdio ignores.
  return new Docker({
    protocol: "http",
    host: "docker",
    port: 80,
    timeout,
    agent: createSshAgent(address, Math.min(timeout, READ_TIMEOUT_MS)),
  } as Docker.DockerOptions);
}

/** A client that is not cached, for trying out an address before saving it. */
export function buildDocker(
  host: Pick<HostRow, "type" | "url">,
  purpose: Purpose = "read",
): Docker {
  if (host.type === "local") return localDocker;
  return buildClient(
    host.url || "",
    purpose === "read" ? READ_TIMEOUT_MS : ACTION_TIMEOUT_MS,
  );
}

/**
 * The client for a host. Throws HostUrlError when the stored address cannot be
 * used, which is the state a server migrated from the old agent is left in.
 */
export function dockerFor(
  host: Pick<HostRow, "id" | "type" | "url">,
  purpose: Purpose = "read",
): Docker {
  if (host.type === "local") return localDocker;

  const url = host.url || "";
  // Keyed on the address, so re-pointing a server never reuses the old one.
  const key = `${host.id}|${purpose}|${url}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const client = buildDocker(host, purpose);
  for (const existing of cache.keys()) {
    if (existing.startsWith(`${host.id}|${purpose}|`)) cache.delete(existing);
  }
  cache.set(key, client);
  return client;
}

/** Drops a server's clients when it is removed or re-pointed. */
export function forgetDockerClients(hostId: number): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${hostId}|`)) cache.delete(key);
  }
}
