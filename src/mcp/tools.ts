/**
 * The MCP tools: everything a person can do in the dashboard, phrased for an
 * agent.
 *
 * Creating containers is deliberately not here. The dashboard links to and
 * starts/stops what already runs; an agent gets the same reach as the UI and
 * no more.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ApiError, type DashboardApi } from "./api.js";
import {
  extractImageName,
  getContainerBaseName,
} from "../utils/containerMatching.js";
import {
  getDockerIconVaultUrl,
  isCustomMappingIcon,
  urlExists,
} from "../utils/dockerIconVault.js";
import { isUserChosenIcon } from "../utils/iconOwnership.js";
import type {
  HostResponse,
  SectionRow,
  SettingsRow,
  ShortcutRow,
} from "../types/index.js";

/**
 * The Lucide icons the frontend can draw by name (AVAILABLE_ICONS in
 * frontend/src/constants/icons.ts). Any other name renders as "Server", so an
 * agent has to pick from this list. A test keeps the two in step.
 */
export const LUCIDE_ICON_NAMES = [
  "Server", "Database", "Cloud", "Code", "Film", "Download", "Home", "Shield",
  "Globe", "Terminal", "Box", "Bug", "Gamepad", "Music", "File", "Folder",
  "LayoutDashboard", "Layers", "Video", "Wifi", "Lock", "HardDrive",
  "Activity", "Bell", "Mail", "Calendar", "Book", "Camera", "Zap", "Network",
  "Cpu", "Radio", "Tv", "Headphones", "Rss", "Archive", "Key", "Users",
  "MessageSquare", "Search", "Wrench", "Package", "Smartphone", "Monitor",
  "Gauge",
] as const;

const DEFAULT_ICON = "Server";

/** A container as GET /api/containers returns it. */
interface ApiContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  description: string;
  ports: Array<{ private: number; public?: number; type: string }>;
  composeProject: string | null;
  composeService: string | null;
  hostId: number;
  hostName: string;
}

interface UploadedImage {
  filename: string;
  url: string;
}

const INSTRUCTIONS = `Docker Dashboard: a page of shortcuts (tiles) that open the web UIs of Docker containers, across one or more servers.

Model:
- Server (host): a Docker daemon. id 1 is the machine the dashboard runs on; others are reached over ssh:// or tcp://.
- Shortcut: a tile. It opens either a PORT on its server's hostname, or a full URL. It may be linked to a container (container_name) on its server, which gives it a running/stopped state and start/stop/restart buttons.
- Section: a named group of shortcuts. Shortcuts with no section are shown ungrouped. Order inside a section is by position.
- Icon: a Lucide name from a fixed list, an image URL, or an uploaded image ("uploads/<file>").

Working well:
- Start with get_dashboard and list_containers.
- A container often publishes several ports and only one is its web UI. list_containers shows every published port per container; set the right one with update_shortcut { port }. Known UI ports help (e.g. Jellyfin 8096, Portainer 9000/9443, Home Assistant 8123, Grafana 3000).
- Use sync_containers to create shortcuts for containers that have none, then fix names, ports, icons and groups.
- Use find_missing_icons to find tiles with a generic or broken icon and the icon the dashboard would suggest for each.
- delete_shortcut on a container's shortcut also stops auto-sync from re-creating it. Prefer it over leaving duplicates.
- Nothing here creates, removes or reconfigures containers themselves.`;

function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * Run a tool body, turning API refusals into tool errors the model can read
 * and correct itself from, instead of protocol errors it cannot.
 */
function run<A>(
  body: (args: A) => Promise<unknown>,
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return ok(await body(args));
    } catch (error) {
      if (error instanceof ApiError) {
        return fail(`${error.message} (HTTP ${error.status})`);
      }
      if (error instanceof ToolError) return fail(error.message);
      throw error;
    }
  };
}

class ToolError extends Error {}

/** The fields an agent needs to reason about a tile, without the bookkeeping. */
function compactShortcut(s: ShortcutRow) {
  return {
    id: s.id,
    display_name: s.display_name,
    description: s.description || null,
    icon: s.icon,
    port: s.port,
    url: s.url,
    host_id: s.host_id,
    host_name: s.host_name ?? null,
    container_name: s.container_name,
    section_id: s.section_id,
    position: s.position,
    is_favorite: s.is_favorite === 1,
    use_tailscale: s.use_tailscale === 1,
  };
}

function shortcutLinksContainer(s: ShortcutRow, c: ApiContainer): boolean {
  const link = s.container_match_name || s.container_name;
  return (
    !!link &&
    s.host_id === c.hostId &&
    getContainerBaseName(link) === getContainerBaseName(c.name)
  );
}

async function getShortcut(api: DashboardApi, id: number): Promise<ShortcutRow> {
  const shortcut = (await api.get<ShortcutRow[]>("/api/shortcuts")).find(
    (s) => s.id === id,
  );
  if (!shortcut) throw new ToolError(`No shortcut with id ${id}`);
  return shortcut;
}

async function containersOrEmpty(api: DashboardApi): Promise<ApiContainer[]> {
  try {
    return await api.get<ApiContainer[]>("/api/containers");
  } catch {
    return [];
  }
}

/** The position after the last shortcut in a section (or among ungrouped). */
function nextPosition(shortcuts: ShortcutRow[], sectionId: number | null) {
  const inSection = shortcuts.filter(
    (s) => (s.section_id ?? null) === sectionId,
  );
  return inSection.reduce((max, s) => Math.max(max, s.position ?? 0), -1) + 1;
}

async function moveToSection(
  api: DashboardApi,
  id: number,
  sectionId: number | null,
): Promise<void> {
  if (sectionId !== null) {
    const sections = await api.get<SectionRow[]>("/api/sections");
    if (!sections.some((s) => s.id === sectionId)) {
      throw new ToolError(`No section with id ${sectionId}`);
    }
  }
  const shortcuts = await api.get<ShortcutRow[]>("/api/shortcuts");
  await api.put(`/api/shortcuts/${id}/section`, {
    section_id: sectionId,
    position: nextPosition(
      shortcuts.filter((s) => s.id !== id),
      sectionId,
    ),
  });
}

/**
 * An icon URL the dashboard would use for something called `name`, or null.
 * Custom mappings are trusted; a Homarr URL is only returned if it exists.
 */
async function resolveIconFor(name: string | null | undefined) {
  const url = getDockerIconVaultUrl(name);
  if (!url) return null;
  if (isCustomMappingIcon(url)) return url;
  if (await urlExists(url)) return url;
  // Some icons only exist as SVG.
  const svg = url.replace("/png/", "/svg/").replace(/\.png$/, ".svg");
  if (svg !== url && (await urlExists(svg))) return svg;
  return null;
}

async function suggestIcon(
  shortcut: ShortcutRow,
  containers: ApiContainer[],
): Promise<string | null> {
  const container = containers.find((c) => shortcutLinksContainer(shortcut, c));
  const candidates = [
    container ? extractImageName(container.image) : null,
    container?.name,
    shortcut.container_name,
    shortcut.display_name,
  ].filter((n): n is string => !!n);

  for (const name of [...new Set(candidates)]) {
    const icon = await resolveIconFor(name);
    if (icon) return icon;
  }
  return null;
}

const EXTENSION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const portSchema = z.number().int().min(1).max(65535);

export function createDashboardMcpServer(api: DashboardApi): McpServer {
  const server = new McpServer(
    { name: "docker-dash", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  // ---------------------------------------------------------------- reading

  server.registerTool(
    "get_dashboard",
    {
      title: "Get dashboard",
      description:
        "The whole dashboard: sections in display order with their shortcuts, ungrouped shortcuts, the servers (with whether each is reachable) and the display settings.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    run(async () => {
      const [sections, shortcuts, hosts, settings] = await Promise.all([
        api.get<SectionRow[]>("/api/sections"),
        api.get<ShortcutRow[]>("/api/shortcuts"),
        api.get<HostResponse[]>("/api/hosts"),
        api.get<SettingsRow>("/api/settings"),
      ]);
      const byPosition = (a: ShortcutRow, b: ShortcutRow) =>
        (a.position ?? 0) - (b.position ?? 0);

      return {
        sections: sections.map((section) => ({
          id: section.id,
          name: section.name,
          position: section.position,
          collapsed: section.is_collapsed === 1,
          shortcuts: shortcuts
            .filter((s) => s.section_id === section.id)
            .sort(byPosition)
            .map(compactShortcut),
        })),
        ungrouped: shortcuts
          .filter(
            (s) =>
              s.section_id === null ||
              !sections.some((sec) => sec.id === s.section_id),
          )
          .sort(byPosition)
          .map(compactShortcut),
        hosts: hosts.map((h) => ({
          id: h.id,
          name: h.name,
          type: h.type,
          url: h.url,
          hostname: h.hostname,
          enabled: h.enabled,
          online: h.status.online,
          error: h.status.error,
        })),
        settings: {
          theme_primary: settings.theme_primary,
          theme_background: settings.theme_background,
          view_mode: settings.view_mode,
          mobile_columns: settings.mobile_columns,
        },
      };
    }),
  );

  server.registerTool(
    "list_containers",
    {
      title: "List containers",
      description:
        "Containers on every enabled server, with their published ports (best web UI guess first) and the ids of the shortcuts that point at them. ports[].public is the port on the server that a shortcut opens; the first entry is the dashboard's best guess at the web UI, but check it.",
      inputSchema: {
        host_id: z.number().int().optional().describe("Only this server"),
        only_running: z.boolean().optional(),
        without_shortcut: z
          .boolean()
          .optional()
          .describe("Only containers no shortcut points at"),
      },
      annotations: { readOnlyHint: true },
    },
    run(async ({ host_id, only_running, without_shortcut }) => {
      const [containers, shortcuts] = await Promise.all([
        api.get<ApiContainer[]>("/api/containers"),
        api.get<ShortcutRow[]>("/api/shortcuts"),
      ]);

      return containers
        .filter((c) => host_id === undefined || c.hostId === host_id)
        .filter((c) => !only_running || c.state === "running")
        .map((c) => ({
          id: c.id.slice(0, 12),
          name: c.name,
          image: c.image,
          state: c.state,
          status: c.status,
          host_id: c.hostId,
          host_name: c.hostName,
          compose_project: c.composeProject,
          ports: c.ports.map((p) => ({
            public: p.public,
            private: p.private,
            type: p.type,
          })),
          shortcut_ids: shortcuts
            .filter((s) => shortcutLinksContainer(s, c))
            .map((s) => s.id),
        }))
        .filter((c) => !without_shortcut || c.shortcut_ids.length === 0);
    }),
  );

  // -------------------------------------------------------------- shortcuts

  server.registerTool(
    "create_shortcut",
    {
      title: "Create shortcut",
      description:
        "Add a tile. Give a port (opened on the server's hostname) or a url; give container_name to link it to a container on that server. Without an icon, one is picked from the container when possible.",
      inputSchema: {
        display_name: z.string().min(1),
        host_id: z
          .number()
          .int()
          .optional()
          .describe("Server the port/container is on. Defaults to 1 (local)."),
        container_name: z.string().optional(),
        port: portSchema.optional(),
        url: z.string().optional().describe("Full URL, instead of a port"),
        description: z.string().optional(),
        icon: z
          .string()
          .optional()
          .describe("Lucide icon name, image URL, or uploads/<file>"),
        section_id: z.number().int().optional(),
        is_favorite: z.boolean().optional(),
        use_tailscale: z
          .boolean()
          .optional()
          .describe("Open the port on the Tailscale IP instead"),
      },
    },
    run(async ({ section_id, ...fields }) => {
      if (!fields.port && !fields.url && !fields.container_name) {
        throw new ToolError("Give a port, a url or a container_name");
      }
      const created = await api.post<{ id: number }>("/api/shortcuts", fields);
      if (section_id !== undefined) {
        await moveToSection(api, created.id, section_id);
      }
      return compactShortcut(await getShortcut(api, created.id));
    }),
  );

  server.registerTool(
    "update_shortcut",
    {
      title: "Update shortcut",
      description:
        "Change any field of a tile; fields left out keep their value. Use this to set the port that is really the container's web UI, rename, describe, re-icon, move to a section (null = ungrouped), or switch between port and url (set the other to null).",
      inputSchema: {
        id: z.number().int(),
        display_name: z.string().min(1).optional(),
        description: z.string().optional(),
        port: portSchema.nullable().optional(),
        url: z.string().nullable().optional(),
        icon: z.string().optional(),
        container_name: z
          .string()
          .nullable()
          .optional()
          .describe("Link to a container on the same server; null unlinks"),
        section_id: z.number().int().nullable().optional(),
        is_favorite: z.boolean().optional(),
        use_tailscale: z.boolean().optional(),
      },
      annotations: { idempotentHint: true },
    },
    run(async ({ id, section_id, ...patch }) => {
      const current = await getShortcut(api, id);

      // The route writes name, description, port and url on every call, and
      // re-derives the icon when none is sent, so send the stored values for
      // anything the agent did not mention.
      const body: Record<string, unknown> = {
        display_name: patch.display_name ?? current.display_name,
        description: patch.description ?? current.description ?? "",
        port: patch.port === undefined ? current.port : patch.port,
        url: patch.url === undefined ? current.url : patch.url,
        icon: patch.icon ?? current.icon ?? DEFAULT_ICON,
      };
      if (patch.container_name !== undefined) {
        body.container_name = patch.container_name;
      }
      if (patch.is_favorite !== undefined) body.is_favorite = patch.is_favorite;
      if (patch.use_tailscale !== undefined) {
        body.use_tailscale = patch.use_tailscale;
      }

      await api.put(`/api/shortcuts/${id}`, body);
      if (section_id !== undefined && section_id !== current.section_id) {
        await moveToSection(api, id, section_id);
      }
      return compactShortcut(await getShortcut(api, id));
    }),
  );

  server.registerTool(
    "delete_shortcut",
    {
      title: "Delete shortcut",
      description:
        "Remove a tile. If it was linked to a container, auto-sync will not re-create it. The container itself is not touched.",
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    run(async ({ id }) => {
      await getShortcut(api, id);
      await api.delete(`/api/shortcuts/${id}`);
      return { success: true, deleted: id };
    }),
  );

  server.registerTool(
    "sync_containers",
    {
      title: "Sync containers to shortcuts",
      description:
        "Create a shortcut for every container that has none (skipping ones whose shortcut was deleted on purpose) and fix ports of linked shortcuts whose port the container no longer publishes. Runs at most every few seconds; a repeat call reuses the last result.",
      inputSchema: {},
    },
    run(() => api.post("/api/shortcuts/auto-sync")),
  );

  // --------------------------------------------------------------- sections

  server.registerTool(
    "create_section",
    {
      title: "Create section",
      description: "Add a group, placed after the existing ones.",
      inputSchema: { name: z.string().min(1) },
    },
    run(({ name }) => api.post("/api/sections", { name })),
  );

  server.registerTool(
    "update_section",
    {
      title: "Update section",
      description: "Rename a group, or collapse/expand it.",
      inputSchema: {
        id: z.number().int(),
        name: z.string().min(1).optional(),
        collapsed: z.boolean().optional(),
      },
      annotations: { idempotentHint: true },
    },
    run(async ({ id, name, collapsed }) => {
      await api.put(`/api/sections/${id}`, { name, is_collapsed: collapsed });
      return { success: true };
    }),
  );

  server.registerTool(
    "delete_section",
    {
      title: "Delete section",
      description:
        "Remove a group. Its shortcuts are kept and become ungrouped.",
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    run(async ({ id }) => {
      await api.delete(`/api/sections/${id}`);
      return { success: true };
    }),
  );

  server.registerTool(
    "reorder_sections",
    {
      title: "Reorder sections",
      description: "Set the display order of groups, first to last.",
      inputSchema: { section_ids: z.array(z.number().int()).min(1) },
      annotations: { idempotentHint: true },
    },
    run(async ({ section_ids }) => {
      await api.put("/api/sections/reorder", {
        sections: section_ids.map((id, position) => ({ id, position })),
      });
      return { success: true };
    }),
  );

  server.registerTool(
    "arrange_shortcuts",
    {
      title: "Arrange shortcuts in a section",
      description:
        "Put these shortcuts in a section (null = ungrouped), in exactly this order. Shortcuts already in the section but not listed keep their place after these.",
      inputSchema: {
        section_id: z.number().int().nullable(),
        shortcut_ids: z.array(z.number().int()).min(1),
      },
      annotations: { idempotentHint: true },
    },
    run(async ({ section_id, shortcut_ids }) => {
      const [shortcuts, sections] = await Promise.all([
        api.get<ShortcutRow[]>("/api/shortcuts"),
        api.get<SectionRow[]>("/api/sections"),
      ]);
      if (section_id !== null && !sections.some((s) => s.id === section_id)) {
        throw new ToolError(`No section with id ${section_id}`);
      }
      const unknown = shortcut_ids.filter(
        (id) => !shortcuts.some((s) => s.id === id),
      );
      if (unknown.length) {
        throw new ToolError(`No shortcut with id ${unknown.join(", ")}`);
      }

      const rest = shortcuts
        .filter(
          (s) =>
            (s.section_id ?? null) === section_id &&
            !shortcut_ids.includes(s.id),
        )
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((s) => s.id);

      const ordered = [...shortcut_ids, ...rest];
      for (const [position, id] of ordered.entries()) {
        await api.put(`/api/shortcuts/${id}/section`, { section_id, position });
      }
      return { success: true, section_id, order: ordered };
    }),
  );

  // ------------------------------------------------------------------ icons

  server.registerTool(
    "find_missing_icons",
    {
      title: "Find missing icons",
      description:
        "Shortcuts whose icon is the generic default, an unknown name, an uploaded file that is gone, or an image URL that no longer loads, each with the icon the dashboard suggests (null when it has none - then use suggest_icon with another name, a Lucide name, or upload_icon). With apply=true, suggested icons are set; icons the user chose themselves are only replaced when they are broken.",
      inputSchema: {
        apply: z.boolean().optional(),
        check_urls: z
          .boolean()
          .optional()
          .describe("Also test image URLs (default true)"),
      },
    },
    run(async ({ apply, check_urls }) => {
      const [shortcuts, uploads, containers] = await Promise.all([
        api.get<ShortcutRow[]>("/api/shortcuts"),
        api.get<UploadedImage[]>("/api/uploads"),
        containersOrEmpty(api),
      ]);
      const uploaded = new Set(uploads.map((u) => u.url));
      const lucide = new Set<string>(LUCIDE_ICON_NAMES);

      const problems = await Promise.all(
        shortcuts.map(async (s) => {
          const icon = s.icon ?? "";
          let problem: string | null = null;
          if (!icon || icon === DEFAULT_ICON) problem = "default_icon";
          else if (icon.startsWith("uploads/")) {
            if (!uploaded.has(icon)) problem = "uploaded_file_missing";
          } else if (icon.startsWith("http")) {
            if (check_urls !== false && !(await urlExists(icon))) {
              problem = "image_url_broken";
            }
          } else if (!lucide.has(icon)) problem = "unknown_icon_name";

          if (!problem) return null;
          return {
            id: s.id,
            display_name: s.display_name,
            current_icon: s.icon,
            problem,
            suggested_icon: await suggestIcon(s, containers),
          };
        }),
      );
      const found = problems.filter((p) => p !== null);

      if (!apply) return { count: found.length, shortcuts: found };

      const applied: number[] = [];
      for (const item of found) {
        if (!item.suggested_icon) continue;
        const broken = item.problem !== "default_icon";
        // The bulk migration route refuses to replace a user-chosen icon, which
        // is right for a working one; a broken one is replaced explicitly.
        if (isUserChosenIcon(item.current_icon) && broken) {
          const current = await getShortcut(api, item.id);
          await api.put(`/api/shortcuts/${item.id}`, {
            display_name: current.display_name,
            description: current.description ?? "",
            port: current.port,
            url: current.url,
            icon: item.suggested_icon,
          });
          applied.push(item.id);
        } else {
          const result = await api.post<{ updated: number }>(
            "/api/shortcuts/migrate-icons",
            { updates: [{ id: item.id, icon_url: item.suggested_icon }] },
          );
          if (result.updated > 0) applied.push(item.id);
        }
      }
      return {
        count: found.length,
        applied,
        not_applied: found
          .filter((f) => !applied.includes(f.id))
          .map((f) => ({ id: f.id, display_name: f.display_name, problem: f.problem })),
      };
    }),
  );

  server.registerTool(
    "suggest_icon",
    {
      title: "Suggest icon",
      description: `Look up an icon for an app name (e.g. "jellyfin", "home-assistant", an image name) in the dashboard-icons set. Returns a verified image URL or null, plus the Lucide names usable as a fallback. Icons are browsable at https://github.com/homarr-labs/dashboard-icons.`,
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    run(async ({ name }) => ({
      icon_url: await resolveIconFor(name),
      lucide_icons: LUCIDE_ICON_NAMES,
    })),
  );

  server.registerTool(
    "upload_icon",
    {
      title: "Upload icon",
      description:
        "Store an image on the dashboard, from base64 data or by downloading a URL, and optionally set it as a shortcut's icon. Stored images keep working if the original site goes away. PNG, JPG, GIF, WebP, SVG or ICO, up to 5 MB.",
      inputSchema: {
        source_url: z.string().url().optional(),
        data_base64: z.string().optional(),
        filename: z
          .string()
          .optional()
          .describe("Needed with data_base64, for the file type (e.g. app.png)"),
        shortcut_id: z.number().int().optional(),
      },
    },
    run(async ({ source_url, data_base64, filename, shortcut_id }) => {
      let bytes: Buffer;
      let mime: string | undefined;
      let name = filename;

      if (source_url) {
        const res = await fetch(source_url);
        if (!res.ok) {
          throw new ToolError(`Download failed with HTTP ${res.status}`);
        }
        bytes = Buffer.from(await res.arrayBuffer());
        mime = res.headers.get("content-type")?.split(";")[0].trim();
        name ??= new URL(source_url).pathname.split("/").pop() || "icon";
      } else if (data_base64) {
        bytes = Buffer.from(data_base64.replace(/^data:[^,]+,/, ""), "base64");
      } else {
        throw new ToolError("Give source_url or data_base64");
      }

      if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new ToolError("Image is larger than 5 MB");
      }

      const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
      if (!mime || !mime.startsWith("image/")) mime = EXTENSION_MIME[ext];
      if (!mime) {
        throw new ToolError(
          "Unknown image type: give a filename ending in .png, .jpg, .gif, .webp, .svg or .ico",
        );
      }
      const extension =
        Object.entries(EXTENSION_MIME).find(([, m]) => m === mime)?.[0] ?? ext;

      const form = new FormData();
      form.append(
        "image",
        new Blob([new Uint8Array(bytes)], { type: mime }),
        `icon.${extension}`,
      );
      const uploaded = await api.upload<{ url: string }>("/api/upload", form);

      if (shortcut_id !== undefined) {
        const current = await getShortcut(api, shortcut_id);
        await api.put(`/api/shortcuts/${shortcut_id}`, {
          display_name: current.display_name,
          description: current.description ?? "",
          port: current.port,
          url: current.url,
          icon: uploaded.url,
        });
      }
      return { icon: uploaded.url, shortcut_id: shortcut_id ?? null };
    }),
  );

  // ------------------------------------------------------------- containers

  server.registerTool(
    "container_action",
    {
      title: "Start, stop or restart a container",
      description:
        "Run start, stop or restart on a container. The container is identified by id or name on a given server.",
      inputSchema: {
        host_id: z.number().int(),
        container: z.string().min(1).describe("Container id or name"),
        action: z.enum(["start", "stop", "restart"]),
      },
    },
    run(async ({ host_id, container, action }) => {
      await api.post(
        `/api/hosts/${host_id}/containers/${encodeURIComponent(container)}/${action}`,
      );
      return { success: true, host_id, container, action };
    }),
  );

  // ---------------------------------------------------------------- servers

  server.registerTool(
    "test_server",
    {
      title: "Test a server address",
      description:
        "Check that a Docker daemon answers at an address (ssh://user@host or tcp://host:2375) before adding it, or re-test a saved server by id.",
      inputSchema: {
        url: z.string().optional(),
        id: z.number().int().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    run(({ url, id }) => api.post("/api/hosts/test", { url, id })),
  );

  server.registerTool(
    "add_server",
    {
      title: "Add server",
      description:
        "Read another machine's Docker. url is ssh://user@host (preferred) or tcp://host:2375 (a socket proxy). hostname is what port-based shortcuts on it open, if different from the url's host.",
      inputSchema: {
        name: z.string().min(1),
        url: z.string().min(1),
        hostname: z.string().optional(),
        color: z.string().optional().describe("Badge colour, e.g. #22c55e"),
      },
    },
    run((body) => api.post("/api/hosts", body)),
  );

  server.registerTool(
    "update_server",
    {
      title: "Update server",
      description:
        "Rename, re-address, recolour, enable or disable a server. A disabled server is not read and its shortcuts stay.",
      inputSchema: {
        id: z.number().int(),
        name: z.string().min(1).optional(),
        url: z.string().optional(),
        hostname: z.string().optional(),
        color: z.string().optional(),
        enabled: z.boolean().optional(),
      },
      annotations: { idempotentHint: true },
    },
    run(({ id, ...body }) => api.put(`/api/hosts/${id}`, body)),
  );

  server.registerTool(
    "remove_server",
    {
      title: "Remove server",
      description:
        "Stop reading a server and delete every shortcut on it. The local server (id 1) cannot be removed. Prefer update_server { enabled: false } unless asked to remove it.",
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    run(({ id }) => api.delete(`/api/hosts/${id}`)),
  );

  // --------------------------------------------------------------- settings

  server.registerTool(
    "update_settings",
    {
      title: "Update display settings",
      description: "Change the dashboard's theme colours and card layout.",
      inputSchema: {
        theme_primary: z.string().optional().describe("Accent colour, hex"),
        theme_background: z.string().optional().describe("Background, hex"),
        view_mode: z
          .enum(["default", "compact", "icon", "list", "table"])
          .optional(),
        mobile_columns: z.union([z.literal(1), z.literal(2)]).optional(),
      },
      annotations: { idempotentHint: true },
    },
    run((body) => api.put("/api/settings", body)),
  );

  return server;
}
