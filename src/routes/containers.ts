/**
 * Docker container routes
 */

import { Router, Request, Response } from "express";
import Docker from "dockerode";
import { docker } from "../config/docker.js";
import { getTailscaleIP } from "../utils/tailscale.js";

const router = Router();

interface ContainerPort {
  private: number;
  public: number;
  type: string;
}

interface FormattedContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  description: string;
  ports: ContainerPort[];
}

/**
 * Helper function to find a container by name or ID
 */
async function findContainer(
  nameOrId: string,
): Promise<Docker.Container | null> {
  // First try to get container by ID directly
  try {
    const container = docker.getContainer(nameOrId);
    await container.inspect();
    return container;
  } catch {
    // Not found by ID, try to find by name
  }

  // Get container base name for matching
  const getContainerBaseName = (name: string): string => {
    if (!name) return name;
    return name.replace(/-\d+$/, "").toLowerCase();
  };

  // Try to find by container_name (base name)
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

// Health check for Docker
router.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Get Tailscale status
router.get("/api/tailscale", async (_req: Request, res: Response) => {
  try {
    const tailscaleIP = await getTailscaleIP();
    res.json({
      available: !!tailscaleIP,
      ip: tailscaleIP,
    });
  } catch (error) {
    console.error("Error checking Tailscale:", error);
    res.json({ available: false, ip: null });
  }
});

// Get all Docker containers
router.get(
  "/api/containers",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const containers = (await docker.listContainers({ all: true })) || [];
      const formatted: FormattedContainer[] = containers
        .map((c) => {
          if (!c) return null;

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

          const uniquePorts: ContainerPort[] = [];
          const seenPublicPorts = new Set<number>();
          for (const port of allPorts) {
            if (!seenPublicPorts.has(port.public)) {
              seenPublicPorts.add(port.public);
              uniquePorts.push(port);
            }
          }

          return {
            id: c.Id,
            name:
              c.Names && c.Names[0] ? c.Names[0].replace("/", "") : "unknown",
            image: c.Image,
            state: c.State,
            status: c.Status,
            description: description,
            ports: uniquePorts,
          };
        })
        .filter((c): c is FormattedContainer => c !== null);

      res.json(formatted);
    } catch (error: unknown) {
      const err = error as { code?: string; errno?: number };
      if (err.code === "ECONNREFUSED" || err.errno === -61) {
        console.warn("Docker is not running. Returning empty container list.");
        res.json([]);
        return;
      }
      console.error("Error fetching containers:", error);
      res.status(500).json({ error: "Failed to fetch containers" });
    }
  },
);

// Start a container
router.post(
  "/api/containers/:id/start",
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const container = await findContainer(req.params.id);
      if (!container) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      await container.start();
      res.json({ success: true });
    } catch (error) {
      console.error("Error starting container:", error);
      res.status(500).json({ error: "Failed to start container" });
    }
  },
);

// Stop a container
router.post(
  "/api/containers/:id/stop",
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const container = await findContainer(req.params.id);
      if (!container) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      await container.stop();
      res.json({ success: true });
    } catch (error) {
      console.error("Error stopping container:", error);
      res.status(500).json({ error: "Failed to stop container" });
    }
  },
);

// Restart a container
router.post(
  "/api/containers/:id/restart",
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    try {
      const container = await findContainer(req.params.id);
      if (!container) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      await container.restart();
      res.json({ success: true });
    } catch (error) {
      console.error("Error restarting container:", error);
      res.status(500).json({ error: "Failed to restart container" });
    }
  },
);

// Export the findContainer helper for use in other routes
export { findContainer };

export default router;
