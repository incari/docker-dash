/**
 * Shortcut management routes
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { db } from "../config/database.js";
import { docker } from "../config/docker.js";
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
import {
  getContainerBaseName,
  extractImageName,
  generateContainerMatchName,
} from "../utils/containerMatching.js";
import {
  isDockerUnavailable,
  logDockerUnavailable,
} from "../utils/dockerErrors.js";
import type { ShortcutRow, ReorderItem } from "../types/index.js";

const router: RouterType = Router();

// Get all shortcuts
router.get("/api/shortcuts", (_req: Request, res: Response) => {
  try {
    const shortcuts = db
      .prepare(
        `
      SELECT s.*, sec.name as section_name
      FROM shortcuts s
      LEFT JOIN sections sec ON s.section_id = sec.id
      ORDER BY s.section_id ASC, s.position ASC, s.display_name ASC
    `,
      )
      .all() as ShortcutRow[];
    res.json(shortcuts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch shortcuts" });
  }
});

// Auto-sync containers to shortcuts
router.post(
  "/api/shortcuts/auto-sync",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      console.log(
        "[AUTO-SYNC] Starting auto-sync of containers to shortcuts...",
      );

      const containers = await docker.listContainers({ all: true });
      console.log("[AUTO-SYNC] Found", containers.length, "containers");

      const existingShortcuts = db
        .prepare(
          "SELECT id, container_name, container_match_name, display_name, container_id FROM shortcuts WHERE container_name IS NOT NULL",
        )
        .all() as Array<{
        id: number;
        container_name: string;
        container_match_name: string | null;
        display_name: string;
        container_id: string | null;
      }>;

      // Use container_match_name for stable matching, fall back to container_name
      const existingContainerNames = new Set(
        existingShortcuts.map(
          (s) => s.container_match_name || s.container_name,
        ),
      );
      console.log(
        "[AUTO-SYNC] Found",
        existingContainerNames.size,
        "existing container shortcuts",
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
        }
      >();

      for (const container of containers) {
        const containerName = container.Names[0].replace(/^\//, "");
        const containerBaseName = getContainerBaseName(containerName);
        const imageName = extractImageName(container.Image) || containerName;

        dockerContainerMap.set(containerBaseName, {
          id: container.Id,
          name: containerName,
          baseName: containerBaseName,
          imageName: imageName,
          port:
            container.Ports && container.Ports[0]
              ? container.Ports[0].PublicPort || null
              : null,
        });
      }

      let createdCount = 0;
      let updatedCount = 0;

      // Include container_match_name for stable matching across container restarts
      const insertStmt = db.prepare(
        "INSERT INTO shortcuts (display_name, container_name, container_match_name, description, icon, port, is_favorite) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
        const matchName =
          shortcut.container_match_name || shortcut.container_name;
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

        if (dockerContainer) {
          const needsUpdate = matchName !== matchKey;
          if (needsUpdate) {
            console.log(
              "[AUTO-SYNC] Updating shortcut:",
              shortcut.display_name,
            );
            // Also update container_match_name for stable matching
            const matchName = generateContainerMatchName(matchKey);
            updateStmt.run(
              dockerContainer.port,
              matchKey,
              matchName,
              shortcut.id,
            );
            updatedCount++;
          }
          dockerContainerMap.delete(matchKey);
        }
      }

      // Second pass: Create shortcuts for new containers
      for (const [baseName, containerData] of dockerContainerMap) {
        // Use validated icon URL (checks if Homarr URL exists before using)
        const icon = await getValidatedIconUrl(
          containerData.imageName,
          "Server",
        );
        console.log(
          "[AUTO-SYNC] Creating shortcut for container:",
          containerData.name,
          "with icon:",
          icon.startsWith("http") ? icon.substring(0, 50) + "..." : icon,
        );

        // Generate stable match name for container matching across restarts
        const matchName = generateContainerMatchName(containerData.name);
        insertStmt.run(
          containerData.name,
          baseName,
          matchName,
          icon,
          containerData.port,
          0,
        );
        createdCount++;
      }

      console.log(
        "[AUTO-SYNC] Auto-sync completed. Created",
        createdCount,
        "new shortcuts, updated",
        updatedCount,
      );
      res.json({
        success: true,
        created: createdCount,
        updated: updatedCount,
        total: containers.length,
        message: `Created ${createdCount} new shortcuts, updated ${updatedCount} existing shortcuts from ${containers.length} containers`,
      });
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
    } = req.body;

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

    // Auto-detect icon from container if not provided
    if (!icon && display_name) {
      try {
        const containers = await docker.listContainers({ all: true });
        const nameBaseName = getContainerBaseName(display_name.trim());

        const container = containers.find((c) => {
          const dockerName = c.Names[0].replace(/^\//, "");
          return getContainerBaseName(dockerName) === nameBaseName;
        });

        if (container) {
          const dockerName = container.Names[0].replace(/^\//, "");
          // Use validated icon URL to ensure Homarr icons exist
          iconValue = await getValidatedIconUrl(dockerName, "Server");
          if (!finalContainerName) {
            finalContainerName = getContainerBaseName(dockerName);
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
        "INSERT INTO shortcuts (display_name, description, icon, port, url, container_name, container_match_name, is_favorite, use_tailscale, compose_project) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const result = stmt.run(
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

      res.json({
        id: result.lastInsertRowid,
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

    if (!icon && display_name) {
      try {
        const containers = await docker.listContainers({ all: true });
        const nameBaseName = getContainerBaseName(display_name.trim());

        const container = containers.find((c) => {
          const dockerName = c.Names[0].replace(/^\//, "");
          return getContainerBaseName(dockerName) === nameBaseName;
        });

        if (container) {
          const dockerName = container.Names[0].replace(/^\//, "");
          // Use validated icon URL to ensure Homarr icons exist
          iconValue = await getValidatedIconUrl(dockerName, "Server");
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
        "UPDATE shortcuts SET display_name=?, description=?, icon=?, port=?, url=?, updated_at=CURRENT_TIMESTAMP";
      const params: (string | number | null)[] = [
        display_name ? display_name.trim() : display_name,
        cleanedDescription,
        iconValue,
        finalPort,
        finalUrl,
      ];

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
    db.prepare("DELETE FROM shortcuts WHERE id=?").run(id);
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

      res.json({
        needsMigration: shortcuts.length > 0,
        count: shortcuts.length,
        shortcuts: shortcuts.map((s) => ({
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
          `SELECT id, display_name, description, icon, container_name, container_match_name
           FROM shortcuts WHERE container_name IS NOT NULL`,
        )
        .all() as Array<{
        id: number;
        display_name: string;
        description: string;
        icon: string | null;
        container_name: string;
        container_match_name: string | null;
      }>;

      // Get running containers for better icon resolution
      let containers: Awaited<ReturnType<typeof docker.listContainers>> = [];
      try {
        containers = await docker.listContainers({ all: true });
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

        // Find matching container
        const container = containers.find((c) => {
          const containerName = c.Names[0].replace(/^\//, "");
          const baseName = getContainerBaseName(containerName);
          return baseName === matchName;
        });

        // Determine source name for icon resolution
        let sourceName: string;
        if (container) {
          sourceName =
            extractImageName(container.Image) ||
            container.Names[0].replace(/^\//, "");
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
