/**
 * Shortcut management routes
 */

import { Router, Request, Response } from "express";
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
  getContainerIcon,
  normalizeContainerName,
  HOMARR_ICONS_BASE_URL,
  CUSTOM_ICON_MAPPINGS,
} from "../utils/dockerIconVault.js";
import type { ShortcutRow, ReorderItem } from "../types/index.js";

const router = Router();

/**
 * Normalize container name for fuzzy matching
 */
function normalizeContainerNameForMatching(name: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Extract base image name from Docker image string for icon matching
 */
function extractImageName(imageString: string | null): string | null {
  if (!imageString) return null;
  const withoutTag = imageString.split(":")[0];
  const parts = withoutTag.split("/");
  const imageName = parts[parts.length - 1];
  return imageName || null;
}

/**
 * Get container base name (without instance number suffix)
 */
function getContainerBaseName(name: string | null): string {
  if (!name) return "";
  return name.replace(/-\d+$/, "").toLowerCase();
}

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
          "SELECT id, container_name, display_name, container_id FROM shortcuts WHERE container_name IS NOT NULL",
        )
        .all() as Array<{
        id: number;
        container_name: string;
        display_name: string;
        container_id: string | null;
      }>;

      const existingContainerNames = new Set(
        existingShortcuts.map((s) => s.container_name),
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

      const insertStmt = db.prepare(
        "INSERT INTO shortcuts (display_name, container_name, description, icon, port, is_favorite) VALUES (?, ?, ?, ?, ?, ?)",
      );
      const updateStmt = db.prepare(
        "UPDATE shortcuts SET port = ?, container_name = ? WHERE id = ?",
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
        let dockerContainer = dockerContainerMap.get(shortcut.container_name);
        let matchKey = shortcut.container_name;

        if (
          !dockerContainer &&
          imageNameToBaseName.has(shortcut.container_name)
        ) {
          matchKey = imageNameToBaseName.get(shortcut.container_name)!;
          dockerContainer = dockerContainerMap.get(matchKey);
          if (dockerContainer) {
            console.log(
              "[AUTO-SYNC] Found legacy match by image name:",
              shortcut.container_name,
              "→",
              matchKey,
            );
          }
        }

        if (dockerContainer) {
          const needsUpdate = shortcut.container_name !== matchKey;
          if (needsUpdate) {
            console.log(
              "[AUTO-SYNC] Updating shortcut:",
              shortcut.display_name,
            );
            updateStmt.run(dockerContainer.port, matchKey, shortcut.id);
            updatedCount++;
          }
          dockerContainerMap.delete(matchKey);
        }
      }

      // Second pass: Create shortcuts for new containers
      for (const [baseName, containerData] of dockerContainerMap) {
        const icon = getContainerIcon(containerData.imageName, "Server");
        console.log(
          "[AUTO-SYNC] Creating shortcut for container:",
          containerData.name,
        );

        insertStmt.run(
          containerData.name,
          baseName,
          "",
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
      const err = error as { code?: string; errno?: number };
      if (err.code === "ECONNREFUSED" || err.errno === -61) {
        console.warn("[AUTO-SYNC] Docker is not running. Skipping auto-sync.");
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
    } = req.body;

    if (!display_name || !display_name.trim()) {
      res
        .status(400)
        .json({ error: "Display name is required and cannot be empty" });
      return;
    }

    if (!port && !url && !req.body.container_id) {
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
          iconValue = getContainerIcon(dockerName, "Server");
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

    try {
      const stmt = db.prepare(
        "INSERT INTO shortcuts (display_name, description, icon, port, url, container_name, is_favorite, use_tailscale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const result = stmt.run(
        display_name.trim(),
        cleanedDescription,
        iconValue,
        finalPort,
        finalUrl,
        finalContainerName,
        finalFavorite,
        finalUseTailscale,
      );

      res.json({
        id: result.lastInsertRowid,
        display_name: display_name.trim(),
        description: cleanedDescription,
        icon: iconValue,
        port: finalPort,
        url: finalUrl,
        container_name: finalContainerName,
        is_favorite: finalFavorite,
        use_tailscale: finalUseTailscale,
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
          iconValue = getContainerIcon(dockerName, "Server");
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
        sql += ", container_name=?";
        params.push(reqContainerName);
      }

      if (finalFavorite !== undefined) {
        sql += ", is_favorite=?";
        params.push(finalFavorite);
      }

      if (finalUseTailscale !== undefined) {
        sql += ", use_tailscale=?";
        params.push(finalUseTailscale);
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
        is_favorite: finalFavorite,
        use_tailscale: finalUseTailscale,
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

// Migrate shortcuts to use Homarr Dashboard Icons
router.post(
  "/api/shortcuts/migrate-icons",
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const shortcuts = db
        .prepare("SELECT * FROM shortcuts WHERE container_name IS NOT NULL")
        .all() as ShortcutRow[];

      if (shortcuts.length === 0) {
        res.json({
          success: true,
          message: "No shortcuts with containers found",
          updated: 0,
        });
        return;
      }

      let containers: Awaited<ReturnType<typeof docker.listContainers>> = [];
      try {
        containers = await docker.listContainers({ all: true });
      } catch (dockerError: unknown) {
        const err = dockerError as { code?: string; errno?: number };
        if (err.code === "ECONNREFUSED" || err.errno === -61) {
          console.warn("[HOMARR-ICONS] Migration: Docker is not running.");
          res.json({
            success: false,
            message:
              "Docker is not running. Please start Docker Desktop and try again.",
            updated: 0,
            total: shortcuts.length,
          });
          return;
        }
        throw dockerError;
      }

      let updatedCount = 0;
      let skippedCount = 0;
      const updateStmt = db.prepare(
        "UPDATE shortcuts SET icon = ? WHERE id = ?",
      );

      const urlExists = async (url: string): Promise<boolean> => {
        try {
          const response = await fetch(url, { method: "HEAD" });
          return response.ok;
        } catch {
          return false;
        }
      };

      for (const shortcut of shortcuts) {
        const container = containers.find((c) => {
          const containerName = c.Names[0].replace(/^\//, "");
          const baseName = getContainerBaseName(containerName);
          return baseName === shortcut.container_name;
        });

        let imageName: string;
        if (container) {
          imageName =
            extractImageName(container.Image) ||
            container.Names[0].replace(/^\//, "");
        } else {
          imageName = shortcut.container_name || shortcut.display_name;
        }

        const normalizedName = normalizeContainerName(imageName);
        let newIcon: string | null = null;

        if (CUSTOM_ICON_MAPPINGS[normalizedName]) {
          newIcon = CUSTOM_ICON_MAPPINGS[normalizedName];
        } else {
          const homarrIconUrl = `${HOMARR_ICONS_BASE_URL}/png/${normalizedName}.png`;
          const exists = await urlExists(homarrIconUrl);

          if (exists) {
            newIcon = homarrIconUrl;
          } else {
            skippedCount++;
            continue;
          }
        }

        if (newIcon && newIcon !== shortcut.icon) {
          updateStmt.run(newIcon, shortcut.id);
          updatedCount++;
        }
      }

      let message = "";
      if (updatedCount > 0 && skippedCount > 0) {
        message = `Updated ${updatedCount} icon(s) from Homarr Dashboard Icons. Preserved ${skippedCount} custom icon(s) with no Homarr match.`;
      } else if (updatedCount > 0) {
        message = `Successfully updated ${updatedCount} icon(s) from Homarr Dashboard Icons`;
      } else if (skippedCount > 0) {
        message = `No updates made. ${skippedCount} shortcut(s) already have custom icons or no Homarr match found.`;
      } else {
        message = "No changes were made";
      }

      res.json({
        success: true,
        message,
        updated: updatedCount,
        skipped: skippedCount,
        total: shortcuts.length,
      });
    } catch (error) {
      console.error("[HOMARR-ICONS] Error migrating icons:", error);
      res.status(500).json({ error: "Failed to migrate icons" });
    }
  },
);

export default router;
