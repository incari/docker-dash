/**
 * The Docker daemon this process talks to over its own socket.
 *
 * Everything here used to live in routes/containers.ts. It moved because the
 * same code now has two callers: the hub, which reads its own daemon as host 1,
 * and the agent endpoints, which serve this daemon to a remote hub.
 */

import Docker from "dockerode";
import { docker } from "../config/docker.js";
import { getContainerBaseName } from "../utils/containerMatching.js";
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
 * `hostId`/`hostName` are filled in by the caller: the local daemon does not
 * know which row in the hosts table it is, and an agent does not know what the
 * hub decided to call it.
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

  const allPorts = (c.Ports || [])
    .filter((p) => p && p.PublicPort)
    .map((p) => ({
      private: p.PrivatePort,
      public: p.PublicPort!,
      type: p.Type,
    }));

  const uniquePorts: NormalizedContainer["ports"] = [];
  const seenPublicPorts = new Set<number>();
  for (const port of allPorts) {
    if (!seenPublicPorts.has(port.public)) {
      seenPublicPorts.add(port.public);
      uniquePorts.push(port);
    }
  }

  return {
    id: c.Id,
    name: c.Names && c.Names[0] ? c.Names[0].replace("/", "") : "unknown",
    image: c.Image,
    state: c.State,
    status: c.Status,
    description,
    ports: uniquePorts,
    rawPorts: (c.Ports || []).map((p) => ({
      PrivatePort: p.PrivatePort,
      PublicPort: p.PublicPort,
      Type: p.Type,
    })),
    composeProject: labels["com.docker.compose.project"] || null,
    composeService: labels["com.docker.compose.service"] || null,
  };
}

/** Every container on the local daemon, running or not. */
export async function listLocalContainers(): Promise<
  Array<Omit<NormalizedContainer, "hostId" | "hostName">>
> {
  const containers = (await docker.listContainers({ all: true })) || [];
  return containers.filter(Boolean).map(normalizeContainer);
}

/**
 * Find a container on the local daemon by ID or by name.
 * Uses getContainerBaseName so a shortcut's stored name still matches after the
 * container is recreated with a replica suffix.
 */
export async function findLocalContainer(
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
 * Run start/stop/restart against the local daemon.
 * Returns false when no container matches, so the caller can answer 404.
 */
export async function runLocalContainerAction(
  nameOrId: string,
  action: ContainerAction,
): Promise<boolean> {
  const container = await findLocalContainer(nameOrId);
  if (!container) return false;

  if (action === "start") await container.start();
  else if (action === "stop") await container.stop();
  else await container.restart();

  return true;
}
