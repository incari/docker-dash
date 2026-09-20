/**
 * Stopping cleanly.
 *
 * Docker sends SIGTERM and waits ten seconds before SIGKILL. What should happen
 * in those seconds is: stop accepting new requests, let the ones in flight
 * finish, close the database, exit. What used to happen is that a SIGTERM
 * listener closed the database and nothing else - and because installing a
 * listener removes Node's default exit, the process stayed up for the full ten
 * seconds answering every request with an error, while /health still said 200.
 */

import type { Server } from "http";
import { closeDatabase } from "./config/database.js";

/** How long in-flight requests get before the process exits anyway. */
const GRACE_MS = parseInt(process.env.SHUTDOWN_GRACE_MS || "8000", 10);

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

function finish(code: number): never {
  closeDatabase();
  process.exit(code);
}

/**
 * Wire a running server to the signals and failures that should end it.
 */
export function installLifecycleHandlers(server: Server): void {
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SHUTDOWN] ${signal} received, draining...`);

    // Stop accepting, then wait only for connections that are mid-request.
    // Without closeIdleConnections an idle keep-alive connection - which every
    // open dashboard tab holds - would keep the server open until the timeout.
    server.close(() => {
      console.log("[SHUTDOWN] All requests finished");
      finish(0);
    });
    server.closeIdleConnections?.();

    // A request that never ends must not outlast Docker's patience.
    const timer = setTimeout(() => {
      console.warn(
        `[SHUTDOWN] Still busy after ${GRACE_MS}ms, closing anyway`,
      );
      server.closeAllConnections?.();
      finish(0);
    }, GRACE_MS);
    timer.unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  /**
   * A promise nobody caught.
   *
   * Node's default is to terminate. For a dashboard that is the wrong trade:
   * the process state is almost always fine - some caller simply forgot an
   * await - and going down takes the whole fleet view with it. So it is logged
   * loudly and the process stays up.
   */
  process.on("unhandledRejection", (reason) => {
    console.error("[CRASH] Unhandled promise rejection:", reason);
  });

  /**
   * A throw that reached the top of the stack.
   *
   * Here the state really is unknown, so the process exits and lets the
   * restart policy bring back a clean one - but not before saying why, which
   * is the part that was missing.
   */
  process.on("uncaughtException", (error) => {
    console.error("[CRASH] Uncaught exception:", error);
    if (shuttingDown) return;
    shuttingDown = true;
    finish(1);
  });
}
