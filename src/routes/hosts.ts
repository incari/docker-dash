/**
 * Server management: the list of Docker hosts this dashboard reads.
 *
 * The local daemon is row 1 and can be renamed but not removed - remove it and
 * the dashboard would have nothing to show on the machine it is installed on.
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { db } from "../config/database.js";
import {
  LOCAL_HOST_ID,
  clearBackoff,
  getHost,
  listHosts,
  forgetHostStatus,
  toHostResponse,
} from "../hosts/registry.js";
import {
  forgetHostContainers,
  getAllContainers,
  invalidateContainerCache,
  pingHost,
} from "../hosts/client.js";
import { forgetDockerClients } from "../hosts/dockerClients.js";
import { HostUrlError, parseHostUrl } from "../hosts/hostUrl.js";
import { invalidateAutoSync } from "../hosts/syncState.js";
import type { CreateHostBody, HostRow, UpdateHostBody } from "../types/index.js";

const router: RouterType = Router();

/**
 * The stored form of an address, or the reason it cannot be stored, ready to
 * send back as a 400.
 */
function normalizeHostUrl(
  raw: string | undefined,
): { url: string } | { error: string; error_code: string } {
  try {
    return { url: parseHostUrl(raw).url };
  } catch (error) {
    if (error instanceof HostUrlError) {
      return { error: error.message, error_code: error.code };
    }
    throw error;
  }
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

// Every server, with whether it answered the last time it was read
router.get("/api/hosts", (_req: Request, res: Response) => {
  try {
    res.json(listHosts().map(toHostResponse));
  } catch (error) {
    console.error("Failed to fetch hosts:", error);
    res.status(500).json({ error: "Failed to fetch hosts" });
  }
});

/**
 * Try a server's address before it is saved.
 *
 * Takes the address from the body rather than the database, so the form can
 * report a bad one while the person is still typing it. `id` alone re-tests a
 * server that is already saved.
 */
router.post(
  "/api/hosts/test",
  async (req: Request, res: Response): Promise<void> => {
    const { id, url } = req.body as {
      id?: number;
      url?: string;
    };

    try {
      const saved = id ? getHost(Number(id)) : null;

      if (saved?.type === "local") {
        res.json(await pingHost(saved));
        return;
      }

      const normalized = normalizeHostUrl(url ?? saved?.url ?? "");
      if ("error" in normalized) {
        res.status(400).json({ ok: false, ...normalized });
        return;
      }

      if (saved) clearBackoff(saved.id);

      res.json(
        await pingHost({
          id: saved?.id ?? 0,
          type: "docker",
          url: normalized.url,
        }),
      );
    } catch (error) {
      console.error("Failed to test host:", error);
      res.status(500).json({ ok: false, error: "Failed to reach the server" });
    }
  },
);

// Add a server
router.post("/api/hosts", (req: Request, res: Response): void => {
  const { name, url, hostname, color, enabled } = req.body as CreateHostBody;

  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    res.status(400).json({ error: "A name is required" });
    return;
  }

  const normalized = normalizeHostUrl(url);
  if ("error" in normalized) {
    res.status(400).json(normalized);
    return;
  }

  try {
    const nextPosition =
      (
        db.prepare("SELECT MAX(position) as max FROM hosts").get() as {
          max: number | null;
        }
      ).max ?? 0;

    const result = db
      .prepare(
        `INSERT INTO hosts (name, type, url, hostname, color, position, enabled)
         VALUES (?, 'docker', ?, ?, ?, ?, ?)`,
      )
      .run(
        trimmedName,
        normalized.url,
        (hostname || "").trim() || null,
        (color || "").trim() || null,
        nextPosition + 1,
        parseBoolean(enabled, true) ? 1 : 0,
      );

    invalidateContainerCache();
    // A server nobody has read yet has containers nobody has a shortcut for.
    invalidateAutoSync();
    const created = getHost(Number(result.lastInsertRowid)) as HostRow;
    res.json(toHostResponse(created));
  } catch (error) {
    console.error("Failed to create host:", error);
    res.status(500).json({ error: "Failed to add the server" });
  }
});

// Update a server
router.put(
  "/api/hosts/:id",
  (req: Request<{ id: string }>, res: Response): void => {
    const id = parseInt(req.params.id, 10);
    const host = getHost(id);

    if (!host) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    const { name, url, hostname, color, enabled, position } =
      req.body as UpdateHostBody;

    const trimmedName = name === undefined ? host.name : (name || "").trim();
    if (!trimmedName) {
      res.status(400).json({ error: "A name is required" });
      return;
    }

    // The local host is the socket this process already holds; an address for
    // it would be ignored, so one is not accepted.
    let nextUrl = host.url;
    if (host.type !== "local" && url !== undefined) {
      const normalized = normalizeHostUrl(url);
      if ("error" in normalized) {
        res.status(400).json(normalized);
        return;
      }
      nextUrl = normalized.url;
    }

    try {
      db.prepare(
        `UPDATE hosts
         SET name = ?, url = ?, hostname = ?, color = ?,
             position = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(
        trimmedName,
        nextUrl,
        hostname === undefined
          ? host.hostname
          : (hostname || "").trim() || null,
        color === undefined ? host.color : (color || "").trim() || null,
        position === undefined ? host.position : Number(position),
        parseBoolean(enabled, host.enabled === 1) ? 1 : 0,
        id,
      );

      invalidateContainerCache();

      // Only drop what is known about reachability when something that decides
      // it actually changed. Toggling anything else - a colour, a name - would
      // otherwise blank out a server that is plainly online until the next
      // read comes back.
      const enabledChanged =
        (parseBoolean(enabled, host.enabled === 1) ? 1 : 0) !== host.enabled;
      if (enabledChanged) {
        invalidateAutoSync();
      }

      const addressChanged = nextUrl !== host.url;
      if (addressChanged) {
        invalidateAutoSync();
        forgetHostStatus(id);
        forgetDockerClients(id);
        // Pointed somewhere else: what it used to have says nothing about
        // what is there now.
        forgetHostContainers(id);
      }

      res.json(toHostResponse(getHost(id) as HostRow));
    } catch (error) {
      console.error("Failed to update host:", error);
      res.status(500).json({ error: "Failed to update the server" });
    }
  },
);

/**
 * Try a failing server again straight away.
 *
 * A server that keeps failing is left alone for up to a minute at a time, which
 * is right for a machine that is off and wrong the moment someone switches it
 * back on. This is how they say so, instead of watching a card that will not
 * change for another fifty seconds.
 */
router.post(
  "/api/hosts/:id/retry",
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10);
    const host = getHost(id);

    if (!host) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    clearBackoff(id);
    invalidateContainerCache();
    // A server that is back has containers the dashboard has not seen.
    invalidateAutoSync();
    // Read now rather than on the next poll, so the answer is in this response.
    await getAllContainers({ fresh: true });

    res.json(toHostResponse(getHost(id) as HostRow));
  },
);

// Remove a server, and every shortcut that pointed at it
router.delete(
  "/api/hosts/:id",
  (req: Request<{ id: string }>, res: Response): void => {
    const id = parseInt(req.params.id, 10);

    if (id === LOCAL_HOST_ID) {
      res.status(400).json({
        error: "The local server cannot be removed. Disable it instead.",
      });
      return;
    }

    const host = getHost(id);
    if (!host) {
      res.status(404).json({ error: "Server not found" });
      return;
    }

    try {
      // Explicit rather than relying on ON DELETE CASCADE: databases upgraded
      // by migration 013 carry host_id without the foreign key, because SQLite
      // will not add a referencing column to an existing table.
      const removeHost = db.transaction(() => {
        db.prepare("DELETE FROM shortcuts WHERE host_id = ?").run(id);
        db.prepare("DELETE FROM dismissed_containers WHERE host_id = ?").run(id);
        db.prepare("DELETE FROM hosts WHERE id = ?").run(id);
      });
      removeHost();

      invalidateContainerCache();
      invalidateAutoSync();
      forgetHostStatus(id);
      forgetHostContainers(id);
      forgetDockerClients(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete host:", error);
      res.status(500).json({ error: "Failed to remove the server" });
    }
  },
);

export default router;
