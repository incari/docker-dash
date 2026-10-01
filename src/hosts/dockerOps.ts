/**
 * What the dashboard does with a Docker daemon, whichever one it is.
 *
 * Every function takes the client to use, so the local socket and a server
 * reached over ssh or a socket proxy run exactly the same code - see
 * dockerClients.ts for how each one is built.
 */

import Docker from "dockerode";
import {
  getContainerBaseName,
  orderPortsForDisplay,
} from "../utils/containerMatching.js";
import type { NormalizedContainer } from "../types/index.js";

export type ContainerAction = "start" | "stop" | "restart";

/** The three actions a host exposes, so a path segment can be validated. */
export const CONTAINER_ACTIONS: ContainerAction[] = [
  "start",
  "stop",
  "restart",
];

export function isContainerAction(value: string): value is ContainerAction {
  return (CONTAINER_ACTIONS as string[]).includes(value);
}

/**
 * Turn Docker's listing into the shape the dashboard uses everywhere.
 *
 * `hostId`/`hostName` are filled in by the caller: a daemon does not know which
 * row in the hosts table it is.
 */
export function normalizeContainer(
  c: Docker.ContainerInfo,
): Omit<NormalizedContainer, "hostId" | "hostName"> {
  const labels = c.Labels || {};
  const description =
    labels["org.opencontainers.image.description"] ||
    labels["description"] ||
    labels["com.docker.compose.project"] ||
    labels["maintainer"] ||
    "";

  // Ordered so the first entry is the port a shortcut should open (same
  // preference as selectPublishedPort): Docker reports Ports in arbitrary
  // order, so callers must not rely on Ports[0] being the web UI.
  const orderedPorts = orderPortsForDisplay(c.Ports).map((p) => ({
    private: p.private,
    public: p.public,
    type: p.type || "tcp",
  }));

  return {
    id: c.Id,
    name: c.Names && c.Names[0] ? c.Names[0].replace("/", "") : "unknown",
    image: c.Image,
    state: c.State,
    status: c.Status,
    description,
    ports: orderedPorts,
    rawPorts: (c.Ports || []).map((p) => ({
      PrivatePort: p.PrivatePort,
      PublicPort: p.PublicPort,
      Type: p.Type,
    })),
    composeProject: labels["com.docker.compose.project"] || null,
    composeService: labels["com.docker.compose.service"] || null,
  };
}

/** Every container on a daemon, running or not. */
export async function listContainers(
  docker: Docker,
): Promise<
  Array<Omit<NormalizedContainer, "hostId" | "hostName">>
> {
  const containers = (await docker.listContainers({ all: true })) || [];
  return containers.filter(Boolean).map(normalizeContainer);
}

/**
 * Find a container on a daemon by ID or by name.
 * Uses getContainerBaseName so a shortcut's stored name still matches after the
 * container is recreated with a replica suffix.
 */
export async function findContainer(
  docker: Docker,
  nameOrId: string,
): Promise<Docker.Container | null> {
  try {
    const container = docker.getContainer(nameOrId);
    await container.inspect();
    return container;
  } catch {
    // Not found by ID, try to find by name
  }

  const containers = await docker.listContainers({ all: true });
  const targetBaseName = getContainerBaseName(nameOrId);

  for (const c of containers) {
    const containerName = c.Names[0].replace(/^\//, "");
    const baseName = getContainerBaseName(containerName);
    if (baseName === targetBaseName || containerName === nameOrId) {
      return docker.getContainer(c.Id);
    }
  }

  return null;
}

/**
 * Run start/stop/restart against a daemon.
 * Returns false when no container matches, so the caller can answer 404.
 */
export async function runContainerAction(
  docker: Docker,
  nameOrId: string,
  action: ContainerAction,
): Promise<boolean> {
  const container = await findContainer(docker, nameOrId);
  if (!container) return false;

  if (action === "start") await container.start();
  else if (action === "stop") await container.stop();
  else await container.restart();

  return true;
}
