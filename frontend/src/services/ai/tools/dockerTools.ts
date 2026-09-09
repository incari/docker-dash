/**
 * Docker Tools for AI Agent
 * Defines safe tool/function definitions for Docker operations
 */

import { containersApi, shortcutsApi } from "../../api";
import type { Tool } from "../types";
import { SafetyLevel } from "../types";

/**
 * Find containers by name (partial match)
 * @param name - Container name to search for
 * @returns Array of matching containers
 */
async function findContainersByName(params: { name: string }): Promise<any> {
  const containers = await containersApi.getAll();
  const searchTerm = params.name.toLowerCase();
  
  const matches = containers.filter((container) =>
    container.name.toLowerCase().includes(searchTerm)
  );

  return {
    found: matches.length,
    containers: matches.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      status: c.status,
      image: c.image,
    })),
  };
}

/**
 * Get health status of a specific container
 * @param containerId - Container ID
 * @returns Container health information
 */
async function getContainerHealth(params: { containerId: string }): Promise<any> {
  const containers = await containersApi.getAll();
  const container = containers.find((c) => c.id === params.containerId);

  if (!container) {
    throw new Error(`Container with ID ${params.containerId} not found`);
  }

  return {
    id: container.id,
    name: container.name,
    state: container.state,
    status: container.status,
    isRunning: container.state === "running",
    ports: container.ports,
  };
}

/**
 * List all Docker containers
 * @returns All containers with their status
 */
async function listAllContainers(): Promise<any> {
  const containers = await containersApi.getAll();

  const running = containers.filter((c) => c.state === "running");
  const stopped = containers.filter((c) => c.state !== "running");

  return {
    total: containers.length,
    running: running.length,
    stopped: stopped.length,
    containers: containers.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      status: c.status,
      image: c.image,
    })),
  };
}

/**
 * Get container logs (last N lines)
 * @param containerId - Container ID
 * @param lines - Number of lines to retrieve (default: 50)
 * @returns Container logs
 */
async function getContainerLogs(params: {
  containerId: string;
  lines?: number;
}): Promise<any> {
  // Note: This would require a backend endpoint to fetch logs
  // For now, return a placeholder
  return {
    containerId: params.containerId,
    lines: params.lines || 50,
    message: "Log retrieval requires backend implementation",
    logs: [],
  };
}

/**
 * List all shortcuts
 * @returns All shortcuts in the dashboard
 */
async function listShortcuts(): Promise<any> {
  const shortcuts = await shortcutsApi.getAll();

  return {
    total: shortcuts.length,
    shortcuts: shortcuts.map((s) => ({
      id: s.id,
      name: s.display_name,
      description: s.description,
      url: s.url,
      containerName: s.container_name,
      isFavorite: s.is_favorite,
    })),
  };
}

/**
 * Open a container URL (requires confirmation)
 * @param url - URL to open
 * @returns Confirmation that URL will be opened
 */
async function openContainerUrl(params: { url: string }): Promise<any> {
  // This will trigger a confirmation modal
  return {
    action: "open_url",
    url: params.url,
    message: `Ready to open: ${params.url}`,
  };
}

/**
 * Start a Docker container (requires confirmation)
 * @param containerId - Container ID to start
 * @returns Confirmation result
 */
async function startContainer(params: { containerId: string }): Promise<any> {
  await containersApi.start(params.containerId);
  return {
    success: true,
    containerId: params.containerId,
    message: "Container started successfully",
  };
}

/**
 * Stop a Docker container (requires confirmation)
 * @param containerId - Container ID to stop
 * @returns Confirmation result
 */
async function stopContainer(params: { containerId: string }): Promise<any> {
  await containersApi.stop(params.containerId);
  return {
    success: true,
    containerId: params.containerId,
    message: "Container stopped successfully",
  };
}

/**
 * Restart a Docker container (requires confirmation)
 * @param containerId - Container ID to restart
 * @returns Confirmation result
 */
async function restartContainer(params: { containerId: string }): Promise<any> {
  await containersApi.restart(params.containerId);
  return {
    success: true,
    containerId: params.containerId,
    message: "Container restarted successfully",
  };
}

/**
 * Available Docker tools for the AI agent
 * Each tool has a name, description, parameters schema, safety level, and execute function
 */
export const dockerTools: Tool[] = [
  {
    name: "findContainersByName",
    description: "Search for Docker containers by name (partial match supported)",
    parameters: {
      name: {
        type: "string",
        description: "Container name or partial name to search for",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.SAFE,
    execute: findContainersByName,
  },
  {
    name: "getContainerHealth",
    description: "Get detailed health and status information for a specific container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container to check",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.SAFE,
    execute: getContainerHealth,
  },
  {
    name: "listAllContainers",
    description: "List all Docker containers with their current status",
    parameters: {},
    safetyLevel: SafetyLevel.SAFE,
    execute: listAllContainers,
  },
  {
    name: "getContainerLogs",
    description: "Retrieve recent logs from a container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container",
        required: true,
      },
      lines: {
        type: "number",
        description: "Number of log lines to retrieve (default: 50)",
        required: false,
      },
    },
    safetyLevel: SafetyLevel.SAFE,
    execute: getContainerLogs,
  },
  {
    name: "listShortcuts",
    description: "List all shortcuts in the dashboard",
    parameters: {},
    safetyLevel: SafetyLevel.SAFE,
    execute: listShortcuts,
  },
  {
    name: "openContainerUrl",
    description: "Open a container's URL in a new tab",
    parameters: {
      url: {
        type: "string",
        description: "The URL to open",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.REQUIRES_CONFIRMATION,
    execute: openContainerUrl,
  },
  {
    name: "startContainer",
    description: "Start a stopped Docker container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container to start",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.REQUIRES_CONFIRMATION,
    execute: startContainer,
  },
  {
    name: "stopContainer",
    description: "Stop a running Docker container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container to stop",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.REQUIRES_CONFIRMATION,
    execute: stopContainer,
  },
  {
    name: "restartContainer",
    description: "Restart a Docker container",
    parameters: {
      containerId: {
        type: "string",
        description: "The ID of the container to restart",
        required: true,
      },
    },
    safetyLevel: SafetyLevel.REQUIRES_CONFIRMATION,
    execute: restartContainer,
  },
];

/**
 * Get a tool by name
 * @param name - Tool name
 * @returns Tool definition or undefined
 */
export function getToolByName(name: string): Tool | undefined {
  return dockerTools.find((tool) => tool.name === name);
}

