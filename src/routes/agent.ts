/**
 * Agent endpoints: this installation's Docker daemon, served to a remote hub.
 *
 * These live under their own /api/agent prefix rather than reusing /api/*
 * because the two have different callers and different trust. /api/* is the
 * browser sitting in front of this machine and stays open; /api/agent/* is
 * another docker-dash reaching in over the network and is refused unless it
 * presents the token this server was started with.
 *
 * Agent mode is off until it is switched on - either with the API_KEY
 * environment variable or from the dashboard - so an installation that was
 * never meant to be part of a fleet exposes nothing new.
 */

import { Router, Request, Response, NextFunction } from "express";
import type { Router as RouterType } from "express";
import { timingSafeEqual } from "crypto";
import { hostname } from "os";
import { HOST_NAME, VERSION } from "../config/index.js";
import { getAgentAccess } from "../hosts/agentAccess.js";
import {
  isContainerAction,
  listLocalContainers,
  runLocalContainerAction,
} from "../hosts/localDocker.js";
import {
  isDockerUnavailable,
  logDockerUnavailable,
} from "../utils/dockerErrors.js";

const router: RouterType = Router();

/** Constant-time compare, so a wrong key cannot be found one byte at a time. */
function keyMatches(expectedKey: string, provided: string): boolean {
  const expected = Buffer.from(expectedKey, "utf8");
  const actual = Buffer.from(provided, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const access = getAgentAccess();

  if (!access.enabled || !access.api_key) {
    res.status(404).json({
      error:
        "This server is not set up to be read by a hub. Switch it on in its own dashboard, under Servers, or set API_KEY.",
    });
    return;
  }

  const header = req.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!provided || !keyMatches(access.api_key, provided)) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  next();
}

router.use("/api/agent", requireApiKey);

/**
 * Reachability check. The hub calls this when a server is added, so the person
 * finds out the URL or token is wrong while they are still looking at the form.
 */
router.get(
  "/api/agent/ping",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const containers = await listLocalContainers();
      res.json({
        ok: true,
        name: HOST_NAME || hostname(),
        version: VERSION,
        containers: containers.length,
      });
    } catch (error) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable("GET /api/agent/ping");
        res.status(503).json({
          ok: false,
          error: "Docker is not running on this server",
        });
        return;
      }
      console.error("[AGENT] Ping failed:", error);
      res.status(500).json({ ok: false, error: "Failed to read Docker" });
    }
  },
);

router.get(
  "/api/agent/containers",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await listLocalContainers());
    } catch (error) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable("GET /api/agent/containers");
        res.status(503).json({
          error: "Docker is not running on this server",
        });
        return;
      }
      console.error("[AGENT] Failed to list containers:", error);
      res.status(500).json({ error: "Failed to fetch containers" });
    }
  },
);

router.post(
  "/api/agent/containers/:id/:action",
  async (
    req: Request<{ id: string; action: string }>,
    res: Response,
  ): Promise<void> => {
    const { id, action } = req.params;

    if (!isContainerAction(action)) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    try {
      const found = await runLocalContainerAction(id, action);
      if (!found) {
        res.status(404).json({ error: "Container not found" });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      if (isDockerUnavailable(error)) {
        logDockerUnavailable(`POST /api/agent/containers/:id/${action}`);
        res
          .status(503)
          .json({ error: "Docker is not running on this server" });
        return;
      }
      console.error(`[AGENT] Failed to ${action} container:`, error);
      res.status(500).json({ error: `Failed to ${action} container` });
    }
  },
);

export default router;
