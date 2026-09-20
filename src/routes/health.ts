/**
 * Liveness for whoever is watching: Docker's HEALTHCHECK, a reverse proxy, an
 * orchestrator.
 *
 * It answers 200 only while this process can actually serve. That used to be an
 * unconditional 200, which meant the healthcheck could never fail and a wedged
 * container was never restarted - the shutdown bug above was invisible to it.
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { isDatabaseHealthy } from "../config/database.js";
import { isShuttingDown } from "../lifecycle.js";

const router: RouterType = Router();

router.get("/health", (_req: Request, res: Response) => {
  // Draining: the server is finishing what it has and wants no new traffic.
  // Saying so lets a proxy take it out of rotation before it stops listening.
  if (isShuttingDown()) {
    res.status(503).type("text").send("SHUTTING DOWN");
    return;
  }

  if (!isDatabaseHealthy()) {
    res.status(503).type("text").send("DATABASE UNAVAILABLE");
    return;
  }

  res.status(200).type("text").send("OK");
});

export default router;
