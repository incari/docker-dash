/**
 * Export and import of the dashboard's own data.
 *
 * Upgrades migrate the database in place and cannot be undone, so this gives
 * users a copy they control - to keep before upgrading, to move between
 * instances, or to restore from.
 */

import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { db } from "../config/database.js";
import { createBackup } from "../database/backup.js";
import { LOCAL_HOST_ID } from "../hosts/registry.js";
import { parseHostUrl } from "../hosts/hostUrl.js";

const router: RouterType = Router();

/** Bumped when the shape below changes, so an import can refuse what it cannot read. */
const EXPORT_VERSION = 2;

/** Versions this build can still read. 1 predates multi-host. */
const READABLE_VERSIONS = [1, 2];

interface ExportedSection {
  id: number;
  name: string;
  position: number;
  is_collapsed: number;
}

/**
 * A server, by its address.
 *
 * There is no secret to leave out: an ssh key lives in the container's ~/.ssh
 * and a socket proxy has none. A server exported before the agent was retired
 * still carries its http:// address, and comes back disabled until someone
 * points it at the daemon instead.
 */
interface ExportedHost {
  id: number;
  name: string;
  type: string;
  url: string | null;
  hostname: string | null;
  color: string | null;
  position: number;
}

interface ExportedDismissal {
  host_id: number;
  container_match_name: string;
  display_name: string | null;
}

interface ExportedShortcut {
  host_id: number;
  display_name: string;
  description: string | null;
  icon: string | null;
  icon_type: string | null;
  port: number | null;
  url: string | null;
  container_name: string | null;
  container_match_name: string | null;
  compose_project: string | null;
  section_id: number | null;
  position: number;
  is_favorite: number;
  use_tailscale: number;
}

router.get("/api/export", (_req: Request, res: Response): void => {
  try {
    const sections = db
      .prepare("SELECT id, name, position, is_collapsed FROM sections ORDER BY position")
      .all() as ExportedSection[];

    // Servers travel with the data, because a shortcut without its server is a
    // shortcut to nothing identifiable once more than one machine is involved.
    const hosts = db
      .prepare(
        `SELECT id, name, type, url, hostname, color, position
         FROM hosts ORDER BY position`,
      )
      .all() as ExportedHost[];

    // id is deliberately omitted for shortcuts: nothing references them, and
    // leaving them out avoids implying the ids are meaningful on import.
    const shortcuts = db
      .prepare(
        `SELECT host_id, display_name, description, icon, icon_type, port, url,
                container_name, container_match_name, compose_project,
                section_id, position, is_favorite, use_tailscale
         FROM shortcuts ORDER BY position`,
      )
      .all() as ExportedShortcut[];

    // Deletions have to travel with the data: auto-sync recreates a shortcut for
    // any container that lacks one, so restoring an export without these would
    // bring every deliberately deleted container back on the next sync.
    const dismissed_containers = db
      .prepare(
        "SELECT host_id, container_match_name, display_name FROM dismissed_containers",
      )
      .all() as ExportedDismissal[];

    const filename = `dockerdash-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({
      version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      hosts,
      sections,
      shortcuts,
      dismissed_containers,
    });
  } catch (err) {
    console.error("[EXPORT] Failed:", err);
    res.status(500).json({ error: "Failed to export data" });
  }
});

router.post("/api/import", async (req: Request, res: Response): Promise<void> => {
  const payload = req.body;

  if (!payload || typeof payload !== "object") {
    res.status(400).json({ error: "Request body must be an export file" });
    return;
  }
  if (!READABLE_VERSIONS.includes(payload.version)) {
    res.status(400).json({
      error: `Unsupported export version ${payload.version}; this build reads version ${READABLE_VERSIONS.join(" and ")}`,
    });
    return;
  }
  if (!Array.isArray(payload.shortcuts) || !Array.isArray(payload.sections)) {
    res.status(400).json({ error: "Export file is missing shortcuts or sections" });
    return;
  }

  try {
    // Import replaces everything, so keep a copy of what is being replaced.
    const backup = await createBackup("preimport");

    const insertDismissal = db.prepare(
      `INSERT OR REPLACE INTO dismissed_containers (host_id, container_match_name, display_name)
       VALUES (@host_id, @container_match_name, @display_name)`,
    );
    const insertHost = db.prepare(
      `INSERT INTO hosts (name, type, url, hostname, color, position, enabled)
       VALUES (@name, 'docker', @url, @hostname, @color, @position, @enabled)`,
    );
    const insertSection = db.prepare(
      `INSERT INTO sections (name, position, is_collapsed)
       VALUES (@name, @position, @is_collapsed)`,
    );
    const insertShortcut = db.prepare(
      `INSERT INTO shortcuts
         (host_id, display_name, description, icon, icon_type, port, url,
          container_name, container_match_name, compose_project,
          section_id, position, is_favorite, use_tailscale)
       VALUES
         (@host_id, @display_name, @description, @icon, @icon_type, @port, @url,
          @container_name, @container_match_name, @compose_project,
          @section_id, @position, @is_favorite, @use_tailscale)`,
    );

    const replaceAll = db.transaction(
      (
        hosts: ExportedHost[],
        sections: ExportedSection[],
        shortcuts: ExportedShortcut[],
        dismissals: ExportedDismissal[],
      ) => {
        db.prepare("DELETE FROM shortcuts").run();
        db.prepare("DELETE FROM sections").run();
        db.prepare("DELETE FROM dismissed_containers").run();
        // The local host stays: it is this machine's own Docker socket, and the
        // export's local host describes whatever machine it came from.
        db.prepare("DELETE FROM hosts WHERE id != ?").run(LOCAL_HOST_ID);

        // Remote servers get fresh ids, so every host_id in the file has to be
        // remapped. Anything the file does not account for - a version 1 export
        // with no servers at all - lands on the local host, which is where it
        // was before multi-host existed.
        const hostIdMap = new Map<number, number>();
        for (const host of hosts) {
          if (host.type === "local") {
            hostIdMap.set(host.id, LOCAL_HOST_ID);
            continue;
          }
          let url = host.url ?? null;
          let usable = true;
          try {
            url = parseHostUrl(url).url;
          } catch {
            usable = false;
          }
          const result = insertHost.run({
            name: host.name,
            url,
            enabled: usable ? 1 : 0,
            hostname: host.hostname ?? null,
            color: host.color ?? null,
            position: host.position ?? 0,
          });
          hostIdMap.set(host.id, Number(result.lastInsertRowid));
        }

        const mapHost = (id: number | null | undefined): number =>
          (id != null ? hostIdMap.get(id) : undefined) ?? LOCAL_HOST_ID;

        for (const dismissal of dismissals) {
          insertDismissal.run({
            host_id: mapHost(dismissal.host_id),
            container_match_name: dismissal.container_match_name,
            display_name: dismissal.display_name ?? null,
          });
        }

        // Sections get fresh ids, so shortcuts' section_id has to be remapped.
        const sectionIdMap = new Map<number, number>();
        for (const section of sections) {
          const result = insertSection.run({
            name: section.name,
            position: section.position ?? 0,
            is_collapsed: section.is_collapsed ?? 0,
          });
          sectionIdMap.set(section.id, Number(result.lastInsertRowid));
        }

        for (const shortcut of shortcuts) {
          insertShortcut.run({
            host_id: mapHost(shortcut.host_id),
            display_name: shortcut.display_name,
            description: shortcut.description ?? null,
            icon: shortcut.icon ?? null,
            icon_type: shortcut.icon_type ?? null,
            port: shortcut.port ?? null,
            url: shortcut.url ?? null,
            container_name: shortcut.container_name ?? null,
            container_match_name: shortcut.container_match_name ?? null,
            compose_project: shortcut.compose_project ?? null,
            section_id:
              shortcut.section_id != null
                ? (sectionIdMap.get(shortcut.section_id) ?? null)
                : null,
            position: shortcut.position ?? 0,
            is_favorite: shortcut.is_favorite ?? 0,
            use_tailscale: shortcut.use_tailscale ?? 0,
          });
        }
      },
    );

    // Exports written before dismissals or servers were included carry none.
    const importedHosts: ExportedHost[] = Array.isArray(payload.hosts)
      ? payload.hosts
      : [];

    replaceAll(
      importedHosts,
      payload.sections,
      payload.shortcuts,
      Array.isArray(payload.dismissed_containers)
        ? payload.dismissed_containers
        : [],
    );

    const remoteHosts = importedHosts.filter((h) => h.type !== "local").length;
    const hostNote = remoteHosts
      ? `. ${remoteHosts} server(s) were restored but are switched off until you enter their token - exports never carry tokens.`
      : "";

    res.json({
      success: true,
      sections: payload.sections.length,
      shortcuts: payload.shortcuts.length,
      hosts: remoteHosts,
      backup,
      message: `Imported ${payload.shortcuts.length} shortcuts and ${payload.sections.length} sections${hostNote}`,
    });
  } catch (err) {
    console.error("[IMPORT] Failed:", err);
    res.status(500).json({ error: "Failed to import data" });
  }
});

export default router;
