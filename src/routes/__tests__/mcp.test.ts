/**
 * The MCP endpoint, driven by a real MCP client against the real routes.
 *
 * The tools are thin over the REST API, so what is worth pinning down is the
 * part they add: the token gate, partial updates that do not wipe the fields
 * left out, and ordering inside a section.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-mcp-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.UPLOAD_DIR = path.join(tmpDir, "images");

const TOKEN = "test-token";

const listContainers = vi.fn(async (): Promise<unknown[]> => []);

vi.mock("../../config/docker.js", () => ({
  docker: { listContainers: (...a: unknown[]) => listContainers(...(a as [])) },
}));
vi.mock("../../utils/dockerIconVault.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // Network lookups would make these tests flaky.
    getValidatedIconUrl: vi.fn(async () => "Server"),
    urlExists: vi.fn(async () => false),
    // Spelled out because vitest resolves this import to the stale
    // src/utils/dockerIconVault.js, which predates it.
    isCustomMappingIcon: vi.fn(() => false),
  };
});

const { db, initializeSchema } = await import("../../config/database.js");
const { ensureLocalHost } = await import("../../hosts/registry.js");
const { invalidateContainerCache } = await import("../../hosts/client.js");
const routes = await import("../index.js");
const { LUCIDE_ICON_NAMES } = await import("../../mcp/tools.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import(
  "@modelcontextprotocol/sdk/client/streamableHttp.js"
);
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
let client: InstanceType<typeof Client>;

beforeAll(async () => {
  initializeSchema();
  ensureLocalHost();
  const app = express();
  app.use(express.json());
  app.use(routes.hostsRouter);
  app.use(routes.containersRouter);
  app.use(routes.uploadsRouter);
  app.use(routes.sectionsRouter);
  app.use(routes.shortcutsRouter);
  app.use(routes.settingsRouter);
  app.use(routes.mcpRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  const a = server.address();
  baseUrl = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;

  process.env.MCP_TOKEN = TOKEN;
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  );
});

afterAll(async () => {
  await client?.close();
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.MCP_TOKEN = TOKEN;
  db.exec(
    "DELETE FROM shortcuts; DELETE FROM sections; DELETE FROM dismissed_containers;",
  );
  listContainers.mockResolvedValue([]);
  invalidateContainerCache();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
  };
  const text = result.content[0]?.text ?? "";
  if (result.isError) return { error: text };
  return JSON.parse(text);
}

function initialize(headers: Record<string, string>) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "curl", version: "0" },
      },
    }),
  });
}

describe("access", () => {
  it("is off without MCP_TOKEN", async () => {
    delete process.env.MCP_TOKEN;
    const res = await initialize({ Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(404);
  });

  it("refuses a missing or wrong token", async () => {
    expect((await initialize({})).status).toBe(401);
    expect(
      (await initialize({ Authorization: "Bearer nope" })).status,
    ).toBe(401);
  });

  it("answers with the right token", async () => {
    const res = await initialize({ Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(200);
  });
});

describe("tools", () => {
  it("does not offer to create containers", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("update_shortcut");
    expect(names.some((n) => /create_container|run_container|deploy/.test(n))).toBe(false);
  });

  it("creates a shortcut inside a section", async () => {
    const section = await call("create_section", { name: "Media" });
    const shortcut = await call("create_shortcut", {
      display_name: "Jellyfin",
      port: 8096,
      icon: "Film",
      section_id: section.id,
    });

    expect(shortcut).toMatchObject({
      display_name: "Jellyfin",
      port: 8096,
      icon: "Film",
      section_id: section.id,
    });

    const dashboard = await call("get_dashboard");
    expect(dashboard.sections[0].shortcuts.map((s: { id: number }) => s.id)).toEqual([
      shortcut.id,
    ]);
    expect(dashboard.ungrouped).toEqual([]);
  });

  it("changes only the port, keeping everything else", async () => {
    const created = await call("create_shortcut", {
      display_name: "Portainer",
      port: 8000,
      description: "Containers",
      icon: "https://example.com/portainer.png",
      is_favorite: true,
    });

    const updated = await call("update_shortcut", { id: created.id, port: 9443 });

    expect(updated).toMatchObject({
      port: 9443,
      display_name: "Portainer",
      description: "Containers",
      icon: "https://example.com/portainer.png",
      is_favorite: true,
    });
  });

  it("reports an unknown shortcut as a tool error", async () => {
    const result = await call("update_shortcut", { id: 999999, port: 80 });
    expect(result.error).toMatch(/No shortcut/);
  });

  it("orders shortcuts within a section", async () => {
    const section = await call("create_section", { name: "Tools" });
    const ids: number[] = [];
    for (const name of ["A", "B", "C"]) {
      ids.push(
        (await call("create_shortcut", { display_name: name, url: `https://${name}.example.com` })).id,
      );
    }

    await call("arrange_shortcuts", {
      section_id: section.id,
      shortcut_ids: [ids[2], ids[0], ids[1]],
    });

    const dashboard = await call("get_dashboard");
    expect(
      dashboard.sections[0].shortcuts.map((s: { display_name: string }) => s.display_name),
    ).toEqual(["C", "A", "B"]);
  });

  it("lists every published port so the UI one can be picked", async () => {
    listContainers.mockResolvedValue([
      {
        Id: "abc123def4567890",
        Names: ["/immich"],
        Image: "ghcr.io/immich-app/immich-server:release",
        State: "running",
        Status: "Up 1 hour",
        Labels: {},
        Ports: [
          { PrivatePort: 5432, PublicPort: 5432, Type: "tcp" },
          { PrivatePort: 2283, PublicPort: 2283, Type: "tcp" },
          { PrivatePort: 9000, Type: "tcp" },
        ],
      },
    ]);
    invalidateContainerCache();

    const [container] = await call("list_containers");
    expect(container.name).toBe("immich");
    // Every published port, so the web UI can be picked; 9000 is not
    // published and cannot be opened from a shortcut.
    expect(container.ports.map((p: { public: number }) => p.public).sort()).toEqual([
      2283, 5432,
    ]);
    expect(container.shortcut_ids).toEqual([]);
  });

  it("deleting a container's shortcut keeps auto-sync from bringing it back", async () => {
    const created = await call("create_shortcut", {
      display_name: "Sonarr",
      container_name: "sonarr",
      port: 8989,
    });
    await call("delete_shortcut", { id: created.id });

    const dismissed = db
      .prepare("SELECT container_match_name FROM dismissed_containers")
      .all();
    expect(dismissed).toEqual([{ container_match_name: "sonarr" }]);
  });

  it("finds generic and unknown icons", async () => {
    await call("create_shortcut", { display_name: "Generic", url: "https://a.example.com" });
    await call("create_shortcut", {
      display_name: "Typo",
      url: "https://b.example.com",
      icon: "Fillm",
    });
    await call("create_shortcut", {
      display_name: "Fine",
      url: "https://c.example.com",
      icon: "Film",
    });

    const result = await call("find_missing_icons", { check_urls: false });
    expect(
      result.shortcuts.map((s: { display_name: string; problem: string }) => [s.display_name, s.problem]),
    ).toEqual([
      ["Generic", "default_icon"],
      ["Typo", "unknown_icon_name"],
    ]);
  });

  it("uploads an icon and sets it on a shortcut", async () => {
    const created = await call("create_shortcut", {
      display_name: "Home",
      url: "https://home.example.com",
    });
    // 1x1 transparent PNG
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const result = await call("upload_icon", {
      data_base64: png,
      filename: "home.png",
      shortcut_id: created.id,
    });

    expect(result.icon).toMatch(/^uploads\/.+\.png$/);
    expect(fs.existsSync(path.join(tmpDir, "images", result.icon.slice("uploads/".length)))).toBe(true);
    const dashboard = await call("get_dashboard");
    expect(dashboard.ungrouped[0].icon).toBe(result.icon);
  });
});

describe("icon names", () => {
  it("match what the frontend can draw", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../frontend/src/constants/icons.ts"),
      "utf-8",
    );
    const block = source.match(/AVAILABLE_ICONS = \{([^}]*)\}/)?.[1] ?? "";
    const frontend = block
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect([...LUCIDE_ICON_NAMES].sort()).toEqual(frontend.sort());
  });
});
