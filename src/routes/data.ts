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
import { isValidUrl, normalizeUrl, isValidPort } from "../utils/validators.js";
import { normalizeHostUrl } from "../utils/hostUrl.js";

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
 * A server, without its token.
 *
 * The token is deliberately left out: an export is a file the user downloads,
 * mails to themselves and keeps in a drive, and a secret that can stop
 * containers on another machine does not belong in it. Imported servers come
 * back disabled, and each one starts being read again as soon as its token is
 * entered.
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

/**
 * Check an export file the way the forms check their input.
 *
 * The create and edit routes refuse a shortcut whose URL is not http(s), and
 * the hosts routes refuse an address that is not one either. An import that
 * wrote rows straight into the database skipped both, and a shortcut's URL
 * ends up in an <a href> - so a file with "javascript:" in it was a stored
 * XSS waiting for a click. Everything is checked before anything is deleted,
 * and the whole file is refused on the first problem: a half-imported file
 * is harder to reason about than a rejected one.
 */
class ImportValidationError extends Error {}

const MAX_TEXT = 500;
const LUCIDE_NAME = /^[A-Za-z][A-Za-z0-9]*$/;
const UPLOADED_ICON = /^uploads\/[A-Za-z0-9._-]+$/;

function text(value: unknown, what: string, required = false): string | null {
  if (value == null || value === "") {
    if (required) throw new ImportValidationError(`${what} is required`);
    return null;
  }
  if (typeof value !== "string") {
    throw new ImportValidationError(`${what} must be text`);
  }
  if (value.length > MAX_TEXT) {
    throw new ImportValidationError(`${what} is longer than ${MAX_TEXT} characters`);
  }
  return value;
}

function integer(value: unknown, what: string, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ImportValidationError(`${what} must be a whole number`);
  }
  return value;
}

function flag(value: unknown, what: string): number {
  if (value == null || value === 0 || value === false) return 0;
  if (value === 1 || value === true) return 1;
  throw new ImportValidationError(`${what} must be 0 or 1`);
}

function httpUrl(value: unknown, what: string): string | null {
  const raw = text(value, what);
  if (raw == null) return null;
  if (!isValidUrl(raw)) {
    throw new ImportValidationError(`${what} is not an http(s) URL: ${raw}`);
  }
  return normalizeUrl(raw);
}

/** A Lucide icon name, an upload on this server, or an http(s) image URL. */
function icon(value: unknown): string | null {
  const raw = text(value, "icon");
  if (raw == null) return null;
  if (LUCIDE_NAME.test(raw) || UPLOADED_ICON.test(raw)) return raw;
  // Same rule as the shortcut form: only something that looks like a URL is
  // tried as one, so a path or a scheme of its own cannot slip through.
  if (/^https?:\/\//i.test(raw) && isValidUrl(raw)) return normalizeUrl(raw);
  throw new ImportValidationError(`icon is not an icon name, an upload or an http(s) URL: ${raw}`);
}

function validateHost(value: unknown, index: number): ExportedHost {
  if (!value || typeof value !== "object") {
    throw new ImportValidationError(`hosts[${index}] is not an object`);
  }
  const h = value as Record<string, unknown>;
  const type = h.type === "local" ? "local" : "agent";
  const url = type === "local" ? null : text(h.url, `hosts[${index}].url`);
  const normalizedUrl = url == null ? null : normalizeHostUrl(url);
  if (url != null && !normalizedUrl) {
    throw new ImportValidationError(`hosts[${index}].url is not a valid server address: ${url}`);
  }
  return {
    id: integer(h.id, `hosts[${index}].id`, index),
    name: text(h.name, `hosts[${index}].name`, true) as string,
    type,
    url: normalizedUrl,
    hostname: text(h.hostname, `hosts[${index}].hostname`),
    color: text(h.color, `hosts[${index}].color`),
    position: integer(h.position, `hosts[${index}].position`, 0),
  };
}

function validateSection(value: unknown, index: number): ExportedSection {
  if (!value || typeof value !== "object") {
    throw new ImportValidationError(`sections[${index}] is not an object`);
  }
  const s = value as Record<string, unknown>;
  return {
    id: integer(s.id, `sections[${index}].id`, index),
    name: text(s.name, `sections[${index}].name`, true) as string,
    position: integer(s.position, `sections[${index}].position`, 0),
    is_collapsed: flag(s.is_collapsed, `sections[${index}].is_collapsed`),
  };
}

function validateShortcut(value: unknown, index: number): ExportedShortcut {
  if (!value || typeof value !== "object") {
    throw new ImportValidationError(`shortcuts[${index}] is not an object`);
  }
  const s = value as Record<string, unknown>;
  const what = (field: string) => `shortcuts[${index}].${field}`;
  const port = s.port == null ? null : s.port;
  if (port != null && !(typeof port === "number" && isValidPort(port))) {
    throw new ImportValidationError(`${what("port")} must be between 1 and 65535`);
  }
  return {
    host_id: integer(s.host_id, what("host_id"), LOCAL_HOST_ID),
    display_name: text(s.display_name, what("display_name"), true) as string,
    description: text(s.description, what("description")),
    icon: icon(s.icon),
    icon_type: text(s.icon_type, what("icon_type")),
    port: port as number | null,
    url: httpUrl(s.url, what("url")),
    container_name: text(s.container_name, what("container_name")),
    container_match_name: text(s.container_match_name, what("container_match_name")),
    compose_project: text(s.compose_project, what("compose_project")),
    section_id:
      s.section_id == null ? null : integer(s.section_id, what("section_id"), 0),
    position: integer(s.position, what("position"), 0),
    is_favorite: flag(s.is_favorite, what("is_favorite")),
    use_tailscale: flag(s.use_tailscale, what("use_tailscale")),
  };
}

function validateDismissal(value: unknown, index: number): ExportedDismissal {
  if (!value || typeof value !== "object") {
    throw new ImportValidationError(`dismissed_containers[${index}] is not an object`);
  }
  const d = value as Record<string, unknown>;
  const what = (field: string) => `dismissed_containers[${index}].${field}`;
  return {
    host_id: integer(d.host_id, what("host_id"), LOCAL_HOST_ID),
    container_match_name: text(d.container_match_name, what("container_match_name"), true) as string,
    display_name: text(d.display_name, what("display_name")),
  };
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

  // Exports written before dismissals or servers were included carry none.
  let importedHosts: ExportedHost[];
  let sections: ExportedSection[];
  let shortcuts: ExportedShortcut[];
  let dismissals: ExportedDismissal[];
  try {
    importedHosts = (Array.isArray(payload.hosts) ? payload.hosts : []).map(validateHost);
    sections = (payload.sections as unknown[]).map(validateSection);
    shortcuts = (payload.shortcuts as unknown[]).map(validateShortcut);
    dismissals = (
      Array.isArray(payload.dismissed_containers) ? payload.dismissed_containers : []
    ).map(validateDismissal);
  } catch (err) {
    if (err instanceof ImportValidationError) {
      res.status(400).json({ error: `Export file rejected: ${err.message}` });
      return;
    }
    throw err;
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
       VALUES (@name, 'agent', @url, @hostname, @color, @position, 0)`,
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
          const result = insertHost.run({
            name: host.name,
            url: host.url ?? null,
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

    replaceAll(importedHosts, sections, shortcuts, dismissals);

    const remoteHosts = importedHosts.filter((h) => h.type !== "local").length;
    const hostNote = remoteHosts
      ? `. ${remoteHosts} server(s) were restored but are switched off until you enter their token - exports never carry tokens.`
      : "";

    res.json({
      success: true,
      sections: sections.length,
      shortcuts: shortcuts.length,
      hosts: remoteHosts,
      backup,
      message: `Imported ${shortcuts.length} shortcuts and ${sections.length} sections${hostNote}`,
    });
  } catch (err) {
    console.error("[IMPORT] Failed:", err);
    res.status(500).json({ error: "Failed to import data" });
  }
});

export default router;
