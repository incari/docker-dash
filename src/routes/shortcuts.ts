/**
 * Shortcut management routes
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { db } from "../config/database.js";
import { upload } from "../config/multer.js";
import {
  normalizeUrl,
  isValidUrl,
  cleanDescription,
  isValidPort,
} from "../utils/validators.js";
import {
  getDockerIconVaultUrl,
  getValidatedIconUrl,
  urlExists,
  isCustomMappingIcon,
} from "../utils/dockerIconVault.js";
import { isUserChosenIcon } from "../utils/iconOwnership.js";
import {
  getContainerBaseName,
  extractImageName,
  generateContainerMatchName,
  getPublishedPorts,
  selectPublishedPort,
} from "../utils/containerMatching.js";
import {
  isDockerUnavailable,
  logDockerUnavailable,
} from "../utils/dockerErrors.js";
import {
  LOCAL_HOST_ID,
  getHost,
  getHostStatus,
  listEnabledHosts,
  listHosts,
  resolveHostHostname,
} from "../hosts/registry.js";
import { getAllContainers } from "../hosts/client.js";
import {
  recentAutoSync,
  rememberAutoSync,
  type AutoSyncResult,
} from "../hosts/syncState.js";
import type {
  ShortcutRow,
  ReorderItem,
  HostRow,
  NormalizedContainer,
} from "../types/index.js";

const router: RouterType = Router();

/**
 * Auto-sync reads the shortcut table, then writes to it, with a network call
 * for the icon in between. Every dashboard that loads fires the endpoint, so
 * two of them overlapping both decided a container had no shortcut and both
 * created one - that is where the identical pairs of rows on the live server
 * came from. Run one sync at a time.
 */
let autoSyncQueue: Promise<unknown> = Promise.resolve();

function withAutoSyncLock<T>(task: () => Promise<T>): Promise<T> {
  const result = autoSyncQueue.then(task, task);
  autoSyncQueue = result.catch(() => undefined);
  return result;
}

/**
 * Stop auto-sync from recreating a shortcut the user deleted.
 * Keyed by (host, container_match_name) so the dismissal outlives the container
 * being recreated under a different name, without silencing a container of the
 * same name on another server.
 */
function rememberDismissedContainer(
  hostId: number,
  matchName: string,
  displayName: string,
): void {
  db.prepare(
    `INSERT INTO dismissed_containers (host_id, container_match_name, display_name)
     VALUES (?, ?, ?)
     ON CONFLICT(host_id, container_match_name) DO UPDATE SET
       display_name = excluded.display_name,
       dismissed_at = CURRENT_TIMESTAMP`,
  ).run(hostId, matchName, displayName);
}

/** Adding a shortcut back by hand undoes an earlier dismissal. */
function forgetDismissedContainer(
  hostId: number,
  matchName: string | null,
): void {
  if (!matchName) return;
  db.prepare(
    "DELETE FROM dismissed_containers WHERE host_id = ? AND container_match_name = ?",
  ).run(hostId, matchName);
}

/**
 * The server a request means, defaulting to the local one.
 *
 * A shortcut always belongs to a server; requests that predate multi-host - and
 * the custom URL shortcuts, which are not tied to a container at all - land on
 * the local host, which is where they were before.
 */
function resolveHostId(value: unknown): number {
  const parsed = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return LOCAL_HOST_ID;
  return getHost(parsed) ? parsed : LOCAL_HOST_ID;
}

/**
 * Get all shortcuts.
 *
 * Each row carries its server's name and the hostname its port-based link
 * should open, so a card can label itself and point at the right machine
 * without the browser having to join the two lists itself.
 */
router.get("/api/shortcuts", (_req: Request, res: Response) => {
  try {
    const shortcuts = db
      .prepare(
        `
      SELECT s.*, sec.name as section_name, h.name as host_name
      FROM shortcuts s
      LEFT JOIN sections sec ON s.section_id = sec.id
      LEFT JOIN hosts h ON s.host_id = h.id
      ORDER BY s.section_id ASC, s.position ASC, s.display_name ASC
    `,
      )
      .all() as ShortcutRow[];

    // resolveHostHostname has to parse the stored URL, which SQL cannot do.
    const hostnames = new Map<number, string | null>();
    for (const host of listHosts()) {
      hostnames.set(host.id, resolveHostHostname(host));
    }

    res.json(
      shortcuts.map((shortcut) => ({
        ...shortcut,
        host_hostname: hostnames.get(shortcut.host_id) ?? null,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch shortcuts" });
  }
});

/**
 * Find a container on one server by the name a shortcut goes by.
 *
 * Used when filling in an icon, where a wrong match is worse than no match: a
 * container called `nginx` on another server would hand this shortcut an icon
 * for something the user is not looking at.
 */
async function findContainerOnHost(
  hostId: number,
  name: string,
): Promise<NormalizedContainer | null> {
  const targetBaseName = getContainerBaseName(name);
  if (!targetBaseName) return null;

  const containers = await getAllContainers();
  return (
    containers.find(
      (c) =>
        c.hostId === hostId && getContainerBaseName(c.name) === targetBaseName,
    ) ?? null
  );
}

/**
 * Bring one server's containers onto the dashboard.
 *
 * Everything here is scoped to a single host, because a container name is only
 * unique within one Docker daemon: two servers can each run `nginx`, and a
 * dashboard-wide view of "is this container already covered by a shortcut"
 * would give the second server's nginx the first one's tile, and its port.
 */
async function syncHostShortcuts(
  host: HostRow,
  containers: NormalizedContainer[],
): Promise<{ created: number; updated: number; skipped: number }> {
  // Every shortcut on this host, not only the container-linked ones: a
  // shortcut added by hand has no container_name, and looking at the linked
  // rows alone is why a hand-made "coolify" tile and an auto-synced one ended
  // up side by side.
  const existingShortcuts = db
    .prepare(
      `SELECT id, display_name, container_name, container_match_name, port
       FROM shortcuts WHERE host_id = ?`,
    )
    .all(host.id) as Array<{
    id: number;
    display_name: string;
    container_name: string | null;
    container_match_name: string | null;
    port: number | null;
  }>;

  // A container is already on the dashboard if any shortcut points at it,
  // whether through its container link or just by being named after it.
  const claimedNames = new Set<string>();
  for (const shortcut of existingShortcuts) {
    const linked = shortcut.container_match_name || shortcut.container_name;
    if (linked) {
      claimedNames.add(getContainerBaseName(linked));
    }
    const fromDisplayName = getContainerBaseName(shortcut.display_name);
    if (fromDisplayName) {
      claimedNames.add(fromDisplayName);
    }
  }

  // Containers whose shortcut the user deleted stay deleted - on this server.
  const dismissedNames = new Set(
    (
      db
        .prepare(
          "SELECT container_match_name FROM dismissed_containers WHERE host_id = ?",
        )
        .all(host.id) as Array<{ container_match_name: string }>
    ).map((row) => row.container_match_name),
  );

  console.log(
    `[AUTO-SYNC] ${host.name}:`,
    claimedNames.size,
    "containers already have a shortcut,",
    dismissedNames.size,
    "dismissed",
  );

  // Build a map of container base names from Docker
  const dockerContainerMap = new Map<
    string,
    {
      id: string;
      name: string;
      baseName: string;
      imageName: string;
      port: number | null;
      publishedPorts: number[];
    }
  >();

  for (const container of containers) {
    const containerBaseName = getContainerBaseName(container.name);
    const imageName = extractImageName(container.image) || container.name;

    dockerContainerMap.set(containerBaseName, {
      id: container.id,
      name: container.name,
      baseName: containerBaseName,
      imageName: imageName,
      // Never Ports[0]: see selectPublishedPort.
      port: selectPublishedPort(container.rawPorts),
      publishedPorts: getPublishedPorts(container.rawPorts),
    });
  }

  let updatedCount = 0;
  let skippedCount = 0;

  // Include container_match_name for stable matching across container restarts.
  // Bound by name rather than by position: this statement previously took
  // seven placeholders and was called with six values, which shifted every
  // column after `description` and made auto-sync throw on the first insert.
  const insertStmt = db.prepare(
    `INSERT INTO shortcuts
       (host_id, display_name, container_name, container_match_name, description, icon, port, is_favorite)
     VALUES
       (@host_id, @display_name, @container_name, @container_match_name, @description, @icon, @port, @is_favorite)`,
  );
  const updateStmt = db.prepare(
    "UPDATE shortcuts SET port = ?, container_name = ?, container_match_name = ? WHERE id = ?",
  );

  // Build a reverse lookup: imageName → containerBaseName (for legacy matching)
  const imageNameToBaseName = new Map<string, string>();
  for (const [baseName, containerData] of dockerContainerMap) {
    if (containerData.imageName && containerData.imageName !== baseName) {
      imageNameToBaseName.set(containerData.imageName, baseName);
    }
  }

  // First pass: Update existing shortcuts
  for (const shortcut of existingShortcuts) {
    // Use container_match_name for stable matching, fall back to container_name
    const matchName = shortcut.container_match_name || shortcut.container_name;
    if (!matchName) continue;

    let dockerContainer = dockerContainerMap.get(matchName);
    let matchKey = matchName;

    if (!dockerContainer && imageNameToBaseName.has(matchName)) {
      matchKey = imageNameToBaseName.get(matchName)!;
      dockerContainer = dockerContainerMap.get(matchKey);
      if (dockerContainer) {
        console.log(
          "[AUTO-SYNC] Found legacy match by image name:",
          matchName,
          "→",
          matchKey,
        );
      }
    }

    if (!dockerContainer) continue;

    const needsRelink = matchName !== matchKey;
    // Only replace a port that cannot be right: it was never filled in,
    // or the container does not publish it any more. A port the container
    // still publishes may have been picked deliberately in the editor, so
    // it is left alone. Stopped containers publish nothing and so never
    // clear a port.
    const needsPort =
      dockerContainer.port !== null &&
      shortcut.port !== dockerContainer.port &&
      (shortcut.port === null ||
        !dockerContainer.publishedPorts.includes(shortcut.port));

    if (needsRelink || needsPort) {
      console.log(
        "[AUTO-SYNC] Updating shortcut:",
        shortcut.display_name,
        needsPort ? `(port → ${dockerContainer.port})` : "",
      );
      updateStmt.run(
        needsPort ? dockerContainer.port : shortcut.port,
        needsRelink ? matchKey : shortcut.container_name,
        needsRelink
          ? generateContainerMatchName(matchKey)
          : shortcut.container_match_name,
        shortcut.id,
      );
      updatedCount++;
    }

    dockerContainerMap.delete(matchKey);
  }

  // Drop containers that already have a shortcut or that the user
  // dismissed, so only genuinely new containers are left.
  for (const baseName of [...dockerContainerMap.keys()]) {
    if (dismissedNames.has(baseName)) {
      console.log("[AUTO-SYNC] Skipping dismissed container:", baseName);
      dockerContainerMap.delete(baseName);
      skippedCount++;
    } else if (claimedNames.has(baseName)) {
      console.log(
        "[AUTO-SYNC] Container already covered by a shortcut:",
        baseName,
      );
      dockerContainerMap.delete(baseName);
    }
  }

  // Second pass: Create shortcuts for new containers.
  // Icons are resolved first because the lookup hits the network, and
  // the inserts then happen in one transaction below.
  const pending: Array<{
    name: string;
    baseName: string;
    matchName: string;
    icon: string;
    port: number | null;
  }> = [];

  for (const [baseName, containerData] of dockerContainerMap) {
    // Use validated icon URL (checks if Homarr URL exists before using)
    const icon = await getValidatedIconUrl(containerData.imageName, "Server");
    console.log(
      "[AUTO-SYNC] Creating shortcut for container:",
      containerData.name,
      "on",
      host.name,
      "with icon:",
      icon.startsWith("http") ? icon.substring(0, 50) + "..." : icon,
    );

    pending.push({
      name: containerData.name,
      baseName,
      // Generate stable match name for container matching across restarts
      matchName: generateContainerMatchName(containerData.name),
      icon,
      port: containerData.port,
    });
  }

  // Re-check inside the transaction against a fresh read: another process
  // sharing this database file could have inserted while the icons above
  // were being fetched.
  const insertNewShortcuts = db.transaction((items: typeof pending): number => {
    const taken = new Set(
      (
        db
          .prepare(
            `SELECT container_match_name FROM shortcuts
             WHERE host_id = ? AND container_match_name IS NOT NULL`,
          )
          .all(host.id) as Array<{ container_match_name: string }>
      ).map((row) => row.container_match_name),
    );

    let inserted = 0;
    for (const item of items) {
      if (taken.has(item.matchName)) continue;
      insertStmt.run({
        host_id: host.id,
        display_name: item.name,
        container_name: item.baseName,
        container_match_name: item.matchName,
        // Auto-sync has nothing to describe a container with;
        // descriptions are filled in later by the icon migration.
        description: null,
        icon: item.icon,
        port: item.port,
        is_favorite: 0,
      });
      taken.add(item.matchName);
      inserted++;
    }
    return inserted;
  });

  return {
    created: insertNewShortcuts(pending),
    updated: updatedCount,
    skipped: skippedCount,
  };
}

// Auto-sync containers to shortcuts, across every server
router.post(
  "/api/shortcuts/auto-sync",
  async (_req: Request, res: Response): Promise<void> => {
    await withAutoSyncLock(async () => {
      try {
        // Checked inside the lock, so tabs that queued behind a sweep see its
        // result instead of each starting another one.
        const recent = recentAutoSync();
        if (recent) {
          console.log("[AUTO-SYNC] Skipped: synced recently");
          res.json({ ...recent, reused: true });
          return;
        }

        console.log(
          "[AUTO-SYNC] Starting auto-sync of containers to shortcuts...",
        );

        const hosts = listEnabledHosts();
        const containers = await getAllContainers({ fresh: true });
        console.log(
          "[AUTO-SYNC] Found",
          containers.length,
          "containers across",
          hosts.length,
          "servers",
        );

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const host of hosts) {
          const hostContainers = containers.filter(
            (c) => c.hostId === host.id,
          );

          // A server that could not be read returns nothing, which is
          // indistinguishable from a server with no containers. Syncing it
          // would be a no-op anyway, but skipping says so in the log.
          if (hostContainers.length === 0 && !getHostStatus(host.id).online) {
            console.log(
              `[AUTO-SYNC] Skipping ${host.name}: could not be read`,
            );
            continue;
          }

          const result = await syncHostShortcuts(host, hostContainers);
          created += result.created;
          updated += result.updated;
          skipped += result.skipped;
        }

        console.log(
          "[AUTO-SYNC] Auto-sync completed. Created",
          created,
          "new shortcuts, updated",
          updated,
          "skipped",
          skipped,
          "dismissed",
        );

        const result: AutoSyncResult = {
          success: true,
          created,
          updated,
          skipped,
          total: containers.length,
          message: `Created ${created} new shortcuts, updated ${updated} existing shortcuts from ${containers.length} containers`,
        };
        rememberAutoSync(result);
        res.json(result);
      } catch (error: unknown) {
        if (isDockerUnavailable(error)) {
          logDockerUnavailable("POST /api/shortcuts/auto-sync");
          res.json({
            success: true,
            created: 0,
            total: 0,
            message: "Docker is not running. No containers to sync.",
          });
          return;
        }
        console.error("[AUTO-SYNC] Auto-sync failed:", error);
        res.status(500).json({ error: "Failed to auto-sync containers" });
      }
    });
  },
);

// Create a shortcut
router.post(
  "/api/shortcuts",
  upload.single("image"),
  async (req: Request, res: Response): Promise<void> => {
    const {
      display_name,
      description,
      icon,
      port,
      url,
      container_name: reqContainerName,
      is_favorite,
      use_tailscale,
      compose_project,
      host_id,
    } = req.body;

    const hostId = resolveHostId(host_id);

    if (!display_name || !display_name.trim()) {
      res
        .status(400)
        .json({ error: "Display name is required and cannot be empty" });
      return;
    }

    // Allow shortcuts with just a container name (no port/URL required)
    // This enables adding containers as favorites even if they don't expose ports
    if (!port && !url && !reqContainerName && !req.body.container_id) {
      res
        .status(400)
        .json({ error: "Either Port, URL, or Container must be specified" });
      return;
    }

    if (port && !isValidPort(port)) {
      res
        .status(400)
        .json({ error: "Invalid port number. Must be between 1 and 65535" });
      return;
    }

    let finalUrl: string | null = null;
    if (url) {
      if (!isValidUrl(url)) {
        res.status(400).json({
          error:
            "Invalid URL format. Please enter a valid URL like example.com or https://example.com",
        });
        return;
      }
      finalUrl = normalizeUrl(url);
    }

    let iconValue = icon || "Server";
    let finalContainerName = reqContainerName || null;

    // Auto-detect icon from container if not provided. Only this server's
    // containers are considered: a container of the same name elsewhere is a
    // different thing and would lend the shortcut the wrong icon.
    if (!icon && display_name) {
      try {
        const container = await findContainerOnHost(
          hostId,
          display_name.trim(),
        );

        if (container) {
          // Use validated icon URL to ensure Homarr icons exist
          iconValue = await getValidatedIconUrl(container.name, "Server");
          if (!finalContainerName) {
            finalContainerName = getContainerBaseName(container.name);
          }
        }
      } catch (error) {
        console.error("Failed to fetch container for icon:", error);
      }
    }

    if (req.file) {
      iconValue = "uploads/" + req.file.filename;
    } else if (icon && icon.includes("http")) {
      if (!isValidUrl(icon)) {
        res.status(400).json({
          error:
            "Invalid icon URL format. Please enter a valid image URL like https://example.com/image.png",
        });
        return;
      }
      iconValue = normalizeUrl(icon);
    }

    const cleanedDescription = cleanDescription(description);
    const finalPort = port ? parseInt(port) : null;
    const finalFavorite =
      is_favorite === undefined
        ? 0
        : is_favorite === "true" || is_favorite === true || is_favorite === 1
          ? 1
          : 0;
    const finalUseTailscale =
      use_tailscale === "true" || use_tailscale === true || use_tailscale === 1
        ? 1
        : 0;

    const finalComposeProject = compose_project || null;
    // Generate stable match name for container matching
    const finalMatchName = finalContainerName
      ? generateContainerMatchName(finalContainerName)
      : null;

    try {
      const stmt = db.prepare(
        "INSERT INTO shortcuts (host_id, display_name, description, icon, port, url, container_name, container_match_name, is_favorite, use_tailscale, compose_project) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const result = stmt.run(
        hostId,
        display_name.trim(),
        cleanedDescription,
        iconValue,
        finalPort,
        finalUrl,
        finalContainerName,
        finalMatchName,
        finalFavorite,
        finalUseTailscale,
        finalComposeProject,
      );

      // Asking for this container back overrides an earlier deletion.
      forgetDismissedContainer(hostId, finalMatchName);

      res.json({
        id: result.lastInsertRowid,
        host_id: hostId,
        display_name: display_name.trim(),
        description: cleanedDescription,
        icon: iconValue,
        port: finalPort,
        url: finalUrl,
        container_name: finalContainerName,
        container_match_name: finalMatchName,
        is_favorite: finalFavorite,
        use_tailscale: finalUseTailscale,
        compose_project: finalComposeProject,
      });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Failed to create shortcut. Please try again." });
    }
  },
);

// Update a shortcut
router.put(
  "/api/shortcuts/:id",
  upload.single("image"),
  async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const { id } = req.params;
    const {
      display_name,
      description,
      icon,
      port,
      url,
      container_name: reqContainerName,
      is_favorite,
      use_tailscale,
      compose_project,
    } = req.body;

    if (display_name && !display_name.trim()) {
      res.status(400).json({ error: "Display name cannot be empty" });
      return;
    }

    if (port && !isValidPort(port)) {
      res
        .status(400)
        .json({ error: "Invalid port number. Must be between 1 and 65535" });
      return;
    }

    let finalUrl: string | null = null;
    if (url) {
      if (!isValidUrl(url)) {
        res.status(400).json({
          error:
            "Invalid URL format. Please enter a valid URL like example.com or https://example.com",
        });
        return;
      }
      finalUrl = normalizeUrl(url);
    }

    let iconValue = icon;

    const existing = db
      .prepare("SELECT icon, host_id FROM shortcuts WHERE id = ?")
      .get(id) as { icon: string | null; host_id: number } | undefined;

    const existingIcon = existing?.icon;
    // A shortcut does not move between servers: the container it points at
    // lives on one machine. The body may carry host_id because the create form
    // sends the same fields, and it is ignored here.
    const hostId = existing?.host_id ?? LOCAL_HOST_ID;

    // Regenerating from the container is a convenience for shortcuts that have
    // no icon yet. Doing it when the user already chose one - an upload or their
    // own URL - would silently throw their choice away on any edit that omits
    // the field.
    if (!icon && !req.file && display_name && !isUserChosenIcon(existingIcon)) {
      try {
        const container = await findContainerOnHost(
          hostId,
          display_name.trim(),
        );

        if (container) {
          // Use validated icon URL to ensure Homarr icons exist
          iconValue = await getValidatedIconUrl(container.name, "Server");
        }
      } catch (error) {
        console.error("Failed to fetch container for icon:", error);
      }
    }

    if (req.file) {
      iconValue = "uploads/" + req.file.filename;
    } else if (icon && icon.includes("http")) {
      if (!isValidUrl(icon)) {
        res.status(400).json({
          error:
            "Invalid icon URL format. Please enter a valid image URL like https://example.com/image.png",
        });
        return;
      }
      iconValue = normalizeUrl(icon);
    }

    const cleanedDescription = cleanDescription(description);
    const finalPort = port ? parseInt(port) : null;
    const finalFavorite =
      is_favorite === undefined
        ? undefined
        : is_favorite === "true" || is_favorite === true || is_favorite === 1
          ? 1
          : 0;
    const finalUseTailscale =
      use_tailscale === undefined
        ? undefined
        : use_tailscale === "true" ||
            use_tailscale === true ||
            use_tailscale === 1
          ? 1
          : 0;

    // Generate stable match name if container_name is being updated
    const matchName =
      reqContainerName !== undefined
        ? reqContainerName
          ? generateContainerMatchName(reqContainerName)
          : null
        : undefined;

    try {
      let sql =
        "UPDATE shortcuts SET display_name=?, description=?, port=?, url=?, updated_at=CURRENT_TIMESTAMP";
      const params: (string | number | null)[] = [
        display_name ? display_name.trim() : display_name,
        cleanedDescription,
        finalPort,
        finalUrl,
      ];

      // No icon in the request and none derived: keep whatever is stored rather
      // than overwriting it with undefined.
      if (iconValue !== undefined) {
        sql += ", icon=?";
        params.push(iconValue);
      }

      if (reqContainerName !== undefined) {
        sql += ", container_name=?, container_match_name=?";
        params.push(reqContainerName);
        params.push(matchName as string | null);
      }

      if (finalFavorite !== undefined) {
        sql += ", is_favorite=?";
        params.push(finalFavorite);
      }

      if (finalUseTailscale !== undefined) {
        sql += ", use_tailscale=?";
        params.push(finalUseTailscale);
      }

      if (compose_project !== undefined) {
        sql += ", compose_project=?";
        params.push(compose_project || null);
      }

      sql += " WHERE id=?";
      params.push(parseInt(id, 10));

      const stmt = db.prepare(sql);
      stmt.run(...params);

      // Pointing a shortcut at a container overrides an earlier deletion.
      forgetDismissedContainer(hostId, matchName ?? null);

      res.json({
        id,
        display_name: display_name ? display_name.trim() : display_name,
        description: cleanedDescription,
        icon: iconValue,
        port: finalPort,
        url: finalUrl,
        container_name: reqContainerName,
        container_match_name: matchName,
        is_favorite: finalFavorite,
        use_tailscale: finalUseTailscale,
        compose_project: compose_project || null,
      });
    } catch (error) {
      console.error(error);
      res
        .status(500)
        .json({ error: "Failed to update shortcut. Please try again." });
    }
  },
);

// Toggle favorite status
router.post(
  "/api/shortcuts/:id/favorite",
  (req: Request<{ id: string }>, res: Response): void => {
    const { id } = req.params;
    const { is_favorite } = req.body;
    const status = is_favorite === true || is_favorite === 1 ? 1 : 0;

    try {
      const numericId = parseInt(id, 10);
      db.prepare("UPDATE shortcuts SET is_favorite = ? WHERE id = ?").run(
        status,
        numericId,
      );
      res.json({ success: true, is_favorite: status });
    } catch (err) {
      console.error("[TOGGLE FAVORITE] Error:", err);
      res.status(500).json({ error: "Failed to update favorite status" });
    }
  },
);

// Reorder shortcuts
router.put("/api/shortcuts/reorder", (req: Request, res: Response): void => {
  const { shortcuts } = req.body as { shortcuts: ReorderItem[] };

  if (!Array.isArray(shortcuts)) {
    res
      .status(400)
      .json({ error: "Invalid request: shortcuts must be an array" });
    return;
  }

  try {
    const updateStmt = db.prepare(
      "UPDATE shortcuts SET position = ? WHERE id = ?",
    );
    const transaction = db.transaction((items: ReorderItem[]) => {
      for (const item of items) {
        updateStmt.run(item.position, item.id);
      }
    });

    transaction(shortcuts);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reorder shortcuts:", err);
    res.status(500).json({ error: "Failed to reorder shortcuts" });
  }
});

// Delete a shortcut
router.delete("/api/shortcuts/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const shortcut = db
      .prepare(
        "SELECT host_id, display_name, container_name, container_match_name FROM shortcuts WHERE id = ?",
      )
      .get(id) as
      | {
          host_id: number;
          display_name: string;
          container_name: string | null;
          container_match_name: string | null;
        }
      | undefined;

    db.prepare("DELETE FROM shortcuts WHERE id=?").run(id);

    // Deleting a container-linked shortcut is the only way the user can say
    // "I don't want this container on the dashboard". Without recording it,
    // auto-sync sees a container with no shortcut on the next startup and
    // creates it again, so the tile could never be removed for good.
    const link = shortcut?.container_match_name || shortcut?.container_name;
    if (link) {
      const matchName = getContainerBaseName(link);
      if (matchName) {
        rememberDismissedContainer(
          shortcut!.host_id,
          matchName,
          shortcut!.display_name,
        );
        console.log("[SHORTCUTS] Dismissed container:", matchName);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete shortcut" });
  }
});

// Check if migration is needed
router.get(
  "/api/shortcuts/check-migration",
  async (_req: Request, res: Response) => {
    try {
      const shortcuts = db
        .prepare(
          `
      SELECT id, display_name, description, icon FROM shortcuts
      WHERE container_name IS NOT NULL
      AND (icon NOT LIKE 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/%' OR icon IS NULL OR icon = 'Server')
    `,
        )
        .all() as Array<{
        id: number;
        display_name: string;
        description: string;
        icon: string;
      }>;

      // An icon the user uploaded or set themselves is not "unmigrated" - it is
      // their choice. Counting those made the migration modal open on its own
      // and offer to replace them.
      const candidates = shortcuts.filter((s) => !isUserChosenIcon(s.icon));

      res.json({
        needsMigration: candidates.length > 0,
        count: candidates.length,
        shortcuts: candidates.map((s) => ({
          id: s.id,
          display_name: s.display_name,
          description: s.description,
          icon: s.icon,
        })),
      });
    } catch (error) {
      console.error("Error checking migration:", error);
      res.status(500).json({ error: "Failed to check migration status" });
    }
  },
);

// Preview icon URLs for all container-linked shortcuts
router.get(
  "/api/shortcuts/preview-icons",
  async (_req: Request, res: Response) => {
    try {
      // Get ALL shortcuts with container_name (not just those needing migration)
      const shortcuts = db
        .prepare(
          `SELECT id, host_id, display_name, description, icon, container_name, container_match_name
           FROM shortcuts WHERE container_name IS NOT NULL`,
        )
        .all() as Array<{
        id: number;
        host_id: number;
        display_name: string;
        description: string;
        icon: string | null;
        container_name: string;
        container_match_name: string | null;
      }>;

      // Get running containers for better icon resolution. A server that is
      // down simply contributes none, and its shortcuts fall back to guessing
      // the icon from the stored name.
      let containers: NormalizedContainer[] = [];
      try {
        containers = await getAllContainers();
      } catch (dockerError: unknown) {
        if (isDockerUnavailable(dockerError)) {
          logDockerUnavailable("GET /api/shortcuts/preview-icons");
          // Continue without container info - we can still suggest icons
        } else {
          throw dockerError;
        }
      }

      // Build preview data for each shortcut (synchronous - no URL validation)
      const previews = shortcuts.map((shortcut) => {
        const matchName =
          shortcut.container_match_name || shortcut.container_name;

        // Find matching container, on the shortcut's own server
        const container = containers.find(
          (c) =>
            c.hostId === shortcut.host_id &&
            getContainerBaseName(c.name) === matchName,
        );

        // Determine source name for icon resolution
        let sourceName: string;
        if (container) {
          sourceName = extractImageName(container.image) || container.name;
        } else {
          sourceName = shortcut.container_name || shortcut.display_name;
        }

        // Get suggested icon URL
        const suggestedIcon = getDockerIconVaultUrl(sourceName);

        // Note: We don't validate URLs here to keep the response fast.
        // The frontend handles invalid URLs visually with onError fallback.

        return {
          id: shortcut.id,
          display_name: shortcut.display_name,
          container_name: shortcut.container_name,
          current_icon: shortcut.icon,
          suggested_icon: suggestedIcon,
          is_custom_mapping: suggestedIcon
            ? isCustomMappingIcon(suggestedIcon)
            : false,
        };
      });

      res.json({
        count: previews.length,
        shortcuts: previews,
      });
    } catch (error) {
      console.error("Error previewing icons:", error);
      res.status(500).json({ error: "Failed to preview icons" });
    }
  },
);

// Apply icon updates from the migration modal
// Accepts an array of {id, icon_url} objects with custom URLs per shortcut
router.post(
  "/api/shortcuts/migrate-icons",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { updates } = req.body as {
        updates: Array<{ id: number; icon_url: string }>;
      };

      if (!Array.isArray(updates) || updates.length === 0) {
        res.json({
          success: true,
          message: "No updates provided",
          updated: 0,
        });
        return;
      }

      const updateStmt = db.prepare(
        "UPDATE shortcuts SET icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      );

      let updatedCount = 0;
      let skippedCount = 0;

      for (const update of updates) {
        if (!update.id || !update.icon_url) {
          skippedCount++;
          continue;
        }

        // Validate URL if it's a Homarr CDN URL (custom URLs are trusted)
        if (update.icon_url.includes("homarr-labs/dashboard-icons")) {
          const exists = await urlExists(update.icon_url);
          if (!exists) {
            console.log(
              `[MIGRATE-ICONS] Skipping invalid Homarr URL for shortcut ${update.id}: ${update.icon_url}`,
            );
            skippedCount++;
            continue;
          }
        }

        // The modal only decides what is preselected; this is what actually
        // protects the data. An icon the user uploaded or set themselves is
        // never replaced by a bulk migration, whatever the request asks for.
        const current = db
          .prepare("SELECT icon FROM shortcuts WHERE id = ?")
          .get(update.id) as { icon: string | null } | undefined;

        if (
          current &&
          isUserChosenIcon(current.icon) &&
          current.icon !== update.icon_url
        ) {
          console.log(
            `[MIGRATE-ICONS] Keeping user-chosen icon for shortcut ${update.id}`,
          );
          skippedCount++;
          continue;
        }

        try {
          updateStmt.run(update.icon_url, update.id);
          updatedCount++;
        } catch (err) {
          console.error(
            `[MIGRATE-ICONS] Failed to update shortcut ${update.id}:`,
            err,
          );
          skippedCount++;
        }
      }

      let message = "";
      if (updatedCount > 0 && skippedCount > 0) {
        message = `Updated ${updatedCount} icon(s). Skipped ${skippedCount} invalid or failed update(s).`;
      } else if (updatedCount > 0) {
        message = `Successfully updated ${updatedCount} icon(s)`;
      } else if (skippedCount > 0) {
        message = `No updates made. ${skippedCount} update(s) were invalid or failed.`;
      } else {
        message = "No changes were made";
      }

      res.json({
        success: true,
        message,
        updated: updatedCount,
        skipped: skippedCount,
        total: updates.length,
      });
    } catch (error) {
      console.error("[MIGRATE-ICONS] Error applying icon updates:", error);
      res.status(500).json({ error: "Failed to apply icon updates" });
    }
  },
);

export default router;
