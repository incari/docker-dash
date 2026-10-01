/**
 * Container routes.
 *
 * The dashboard reads every enabled server at once, so a container is only
 * identified by its ID together with the host it lives on: two servers can each
 * run a container called `nginx`, and Docker IDs are only unique per daemon.
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { getTailscaleIP } from "../utils/tailscale.js";
import { isContainerAction } from "../hosts/dockerOps.js";
import { getHost } from "../hosts/registry.js";
import {
  HostRequestError,
  findHostForContainer,
  getAllContainers,
  runHostContainerAction,
} from "../hosts/client.js";
import {
  isDockerUnavailable,
  logDockerUnavailable,
} from "../utils/dockerErrors.js";
import type { NormalizedContainer } from "../types/index.js";

const router: RouterType = Router();

/**
 * `rawPorts` exists so port selection can see private ports and the
 * published/exposed distinction. The browser has no use for it and caches every
 * container in IndexedDB, so it is dropped on the way out.
 */
function forBrowser(container: NormalizedContainer) {
  const { rawPorts, ...rest } = container;
  void rawPorts;
  return rest;
}

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

/**
 * Containers from every enabled server.
 *
 * A server that cannot be reached contributes nothing and its failure is
 * recorded against the host instead - GET /api/hosts reports it - so one dead
 * machine does not empty the dashboard.
 */
router.get(
  "/api/containers",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const containers = await getAllContainers();
      res.json(containers.map(forBrowser));
    } catch (error: unknown) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable("GET /api/containers");
        res.json([]);
        return;
      }
      console.error("Error fetching containers:", error);
      res.status(500).json({ error: "Failed to fetch containers" });
    }
  },
);

/**
 * Start, stop or restart a container on a named server.
 */
router.post(
  "/api/hosts/:hostId/containers/:id/:action",
  async (
    req: Request<{ hostId: string; id: string; action: string }>,
    res: Response,
  ): Promise<void> => {
    const { action } = req.params;

    if (!isContainerAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    const host = getHost(parseInt(req.params.hostId, 10));
    if (!host) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    try {
      const found = await runHostContainerAction(host, req.params.id, action);
      if (!found) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable(`POST /api/hosts/:hostId/containers/:id/${action}`);
        res.status(503).json({
          error: `Docker is not running on ${host.name}.`,
        });
        return;
      }
      if (error instanceof HostRequestError) {
        res.status(502).json({ error: `${host.name}: ${error.message}` });
        return;
      }
      console.error(`Error running ${action} on container:`, error);
      res.status(500).json({ error: `Failed to ${action} container` });
    }
  },
);

/**
 * The single-server form of the route above, kept working for anything holding
 * an older URL - a cached frontend, a bookmark, a script. The server is worked
 * out from the container ID.
 */
router.post(
  "/api/containers/:id/:action",
  async (
    req: Request<{ id: string; action: string }>,
    res: Response,
  ): Promise<void> => {
    const { action, id } = req.params;

    if (!isContainerAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    try {
      const match = await findHostForContainer(id);
      const host = match?.host ?? getHost(1);

      if (!host) {
        res.status(404).json({ error: "Container not found" });
        return;
      }

      const found = await runHostContainerAction(host, id, action);
      if (!found) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable(`POST /api/containers/:id/${action}`);
        res.status(503).json({
          error: "Docker is not running. Please start Docker Desktop.",
        });
        return;
      }
      if (error instanceof HostRequestError) {
        res.status(502).json({ error: error.message });
        return;
      }
      console.error(`Error running ${action} on container:`, error);
      res.status(500).json({ error: `Failed to ${action} container` });
    }
  },
);

export default router;
