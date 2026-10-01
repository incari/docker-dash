/**
 * Docker client configuration
 *
 * Two ways to reach the daemon:
 *
 *   DOCKER_SOCKET  - a Unix socket, the default. Bind-mounting the host's
 *                    socket hands this process full control of the daemon,
 *                    which is root on the host.
 *   DOCKER_HOST    - tcp://host:port, for a socket proxy such as
 *                    tecnativa/docker-socket-proxy. The proxy only lets through
 *                    the calls this dashboard needs (list, start, stop,
 *                    restart), so a compromised dashboard cannot run `docker
 *                    run --privileged`. See docker-compose.socket-proxy.yml.
 */

import Docker from "dockerode";

export function dockerOptionsFromEnv(): Docker.DockerOptions {
  const host = (process.env.DOCKER_HOST || "").trim();
  if (host) {
    const url = new URL(host.includes("://") ? host : `tcp://${host}`);
    return {
      host: url.hostname,
      port: parseInt(url.port || "2375", 10),
      protocol: url.protocol === "https:" ? "https" : "http",
    };
  }
  return { socketPath: process.env.DOCKER_SOCKET || "/var/run/docker.sock" };
}

export const docker = new Docker(dockerOptionsFromEnv());

export type DockerInstance = typeof docker;
