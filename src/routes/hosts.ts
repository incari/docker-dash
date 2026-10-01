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
import {
  getAgentAccess,
  rotateApiKey,
  setAgentEnabled,
} from "../hosts/agentAccess.js";
import { normalizeHostUrl } from "../utils/hostUrl.js";
import { invalidateAutoSync } from "../hosts/syncState.js";
import type { CreateHostBody, HostRow, UpdateHostBody } from "../types/index.js";

const router: RouterType = Router();

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
 * Try a server's address and key before it is saved.
 *
 * Takes the credentials from the body rather than the database, so the form can
 * report a bad key while the person is still typing it. `id` alone re-tests a
 * server that is already saved.
 */
router.post(
  "/api/hosts/test",
  async (req: Request, res: Response): Promise<void> => {
    const { id, url, api_key } = req.body as {
      id?: number;
      url?: string;
      api_key?: string;
    };

    try {
      const saved = id ? getHost(Number(id)) : null;

      if (saved?.type === "local") {
        res.json(await pingHost(saved));
        return;
      }

      const normalizedUrl = url ? normalizeHostUrl(url) : saved?.url || null;
      if (!normalizedUrl) {
        res.status(400).json({ ok: false, error: "A server address is required" });
        return;
      }

      // An empty key in the body means "keep the saved one": the browser is
      // never sent the key back, so a blank field is the normal state when
      // editing a server that already works. But the saved key only ever goes
      // to the saved address. Sending it to whatever URL is in the body would
      // hand that server's key to anyone who can reach this endpoint.
      const typedKey = api_key?.trim() || "";
      const savedKeyApplies =
        !!saved?.api_key && (!url || normalizedUrl === saved.url);
      const effectiveKey = typedKey || (savedKeyApplies ? saved.api_key! : "");

      if (!effectiveKey) {
        res.status(400).json({
          ok: false,
          error: "Enter that server's API key to test a new address",
          error_code: "key_required",
        });
        return;
      }

      if (saved) clearBackoff(saved.id);

      res.json(
        await pingHost({
          id: saved?.id ?? 0,
          name: saved?.name ?? "New server",
          type: "agent",
          url: normalizedUrl,
          api_key: effectiveKey,
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
  const { name, url, api_key, hostname, color, enabled } =
    req.body as CreateHostBody;

  const trimmedName = (name || "").trim();
  if (!trimmedName) {
    res.status(400).json({ error: "A name is required" });
    return;
  }

  const normalizedUrl = normalizeHostUrl(url || "");
  if (!normalizedUrl) {
    res.status(400).json({
      error: "A server address is required, for example http://192.168.1.10:3080",
    });
    return;
  }

  if (!(api_key || "").trim()) {
    res.status(400).json({
      error:
        "An API key is required. Copy it from that server's own dashboard, under Servers.",
    });
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
        `INSERT INTO hosts (name, type, url, api_key, hostname, color, position, enabled)
         VALUES (?, 'agent', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trimmedName,
        normalizedUrl,
        (api_key || "").trim(),
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

    const { name, url, api_key, hostname, color, enabled, position, agent_enabled } =
      req.body as UpdateHostBody;

    const trimmedName = name === undefined ? host.name : (name || "").trim();
    if (!trimmedName) {
      res.status(400).json({ error: "A name is required" });
      return;
    }

    // The local host is the socket this process already holds; an address or a
    // key for it would be ignored, so they are not accepted.
    let nextUrl = host.url;
    if (host.type === "agent" && url !== undefined) {
      nextUrl = normalizeHostUrl(url);
      if (!nextUrl) {
        res.status(400).json({ error: "That server address is not valid" });
        return;
      }
    }

    // A blank key leaves the stored one alone - the browser never receives it
    // and so cannot send it back. Unless the address changed: the stored key
    // belongs to the old address, and carrying it over would send it to the
    // new one on the next read.
    const typedKey = api_key && api_key.trim() ? api_key.trim() : "";
    if (host.type === "agent" && nextUrl !== host.url && !typedKey) {
      res.status(400).json({
        error:
          "Enter the server's API key again when changing its address. The saved key is only ever sent to the address it was saved with.",
      });
      return;
    }
    const nextApiKey =
      host.type === "agent" && typedKey ? typedKey : host.api_key;

    try {
      db.prepare(
        `UPDATE hosts
         SET name = ?, url = ?, api_key = ?, hostname = ?, color = ?,
             position = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(
        trimmedName,
        nextUrl,
        nextApiKey,
        hostname === undefined
          ? host.hostname
          : (hostname || "").trim() || null,
        color === undefined ? host.color : (color || "").trim() || null,
        position === undefined ? host.position : Number(position),
        parseBoolean(enabled, host.enabled === 1) ? 1 : 0,
        id,
      );

      // Only this machine can be opened up to a hub, and only when the key is
      // not pinned by the environment.
      if (host.type === "local" && agent_enabled !== undefined) {
        setAgentEnabled(parseBoolean(agent_enabled, false));
      }

      invalidateContainerCache();

      // Only drop what is known about reachability when something that decides
      // it actually changed. Toggling anything else - a colour, a name, whether
      // a hub may read this machine - would otherwise blank out a server that
      // is plainly online until the next read comes back.
      const enabledChanged =
        (parseBoolean(enabled, host.enabled === 1) ? 1 : 0) !== host.enabled;
      if (enabledChanged) {
        invalidateAutoSync();
      }

      const addressChanged = nextUrl !== host.url || nextApiKey !== host.api_key;
      if (addressChanged) {
        invalidateAutoSync();
        forgetHostStatus(id);
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

/**
 * This machine's own API key, for copying into a hub.
 *
 * Served on request rather than with every host listing, so it is not in a
 * response that every open tab fetches on a timer and that a proxy or browser
 * extension may log. Only the local host has a key to show; a remote server's
 * key never leaves this process.
 */
router.get(
  "/api/hosts/:id/api-key",
  (req: Request<{ id: string }>, res: Response): void => {
    const id = parseInt(req.params.id, 10);
    const host = getHost(id);

    if (!host || host.type !== "local") {
      res.status(404).json({
        error: "Only this machine's own key can be read from here.",
      });
      return;
    }

    const access = getAgentAccess();
    res.setHeader("Cache-Control", "no-store");
    res.json({ api_key: access.api_key });
  },
);

/**
 * Replace this machine's API key.
 *
 * A credential that cannot be changed is a credential you cannot recover from,
 * so this exists for the day one leaks. Every hub still holding the old key
 * stops being able to read this machine immediately.
 */
router.post(
  "/api/hosts/:id/api-key",
  (req: Request<{ id: string }>, res: Response): void => {
    const id = parseInt(req.params.id, 10);
    const host = getHost(id);

    if (!host || host.type !== "local") {
      res.status(404).json({
        error: "Only this machine's own key can be replaced from here.",
      });
      return;
    }

    const key = rotateApiKey();
    if (!key) {
      res.status(400).json({
        error:
          "This key comes from the API_KEY environment variable. Change it there instead.",
      });
      return;
    }

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
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete host:", error);
      res.status(500).json({ error: "Failed to remove the server" });
    }
  },
);

export default router;
