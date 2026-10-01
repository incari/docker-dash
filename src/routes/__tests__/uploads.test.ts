/**
 * Uploads are served from the dashboard's own origin, so anything a browser
 * would run as code is an XSS on the page that controls the containers. The
 * declared type used to be the only check, and it is the client's to declare.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-uploads-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
process.env.UPLOAD_DIR = path.join(tmpDir, "images");

vi.mock("../../config/docker.js", () => ({
  docker: {
    listContainers: async () => [],
    getContainer: () => ({ inspect: async () => ({}) }),
  },
}));

vi.mock("../../utils/dockerIconVault.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getValidatedIconUrl: vi.fn(async () => "Server"),
    urlExists: vi.fn(async () => false),
  };
});

const { db, initializeSchema } = await import("../../config/database.js");
const { ensureLocalHost } = await import("../../hosts/registry.js");
const { upload, rejectNonImageUpload, uploadErrorHandler, uploadDir } =
  await import("../../config/multer.js");
const { default: shortcutsRouter } = await import("../shortcuts.js");
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const HTML = Buffer.from("<script>alert(document.domain)</script>");

beforeAll(async () => {
  initializeSchema();
  ensureLocalHost();

  const app = express();
  app.use(express.json());
  // The same chain server.ts mounts on /api/upload.
  app.post("/api/upload", upload.single("image"), rejectNonImageUpload, (req, res) => {
    res.json({ filename: req.file?.filename });
  });
  app.use(shortcutsRouter);
  app.use(uploadErrorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec("DELETE FROM shortcuts");
  for (const file of fs.readdirSync(uploadDir)) {
    fs.unlinkSync(path.join(uploadDir, file));
  }
});

function send(
  bytes: Buffer,
  filename: string,
  type: string,
  url = "/api/upload",
): Promise<Response> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type }), filename);
  form.append("display_name", "Test");
  form.append("port", "8080");
  return fetch(`${baseUrl}${url}`, { method: "POST", body: form });
}

describe("uploading an icon", () => {
  it("stores a real PNG under a generated name", async () => {
    const res = await send(PNG, "logo.png", "image/png");

    expect(res.status).toBe(200);
    const { filename } = (await res.json()) as { filename: string };
    expect(filename).toMatch(/^\d+-[0-9a-f]{12}\.png$/);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
  });

  it("refuses a file whose name would be served as a page", async () => {
    // The type says image; the name says HTML. Before, the name won and the
    // file was served as text/html from this origin.
    const res = await send(HTML, "evil.html", "image/png");

    expect(res.status).toBe(400);
    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });

  it("refuses an SVG, which is a script container as much as an image", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    const res = await send(svg, "icon.svg", "image/svg+xml");

    expect(res.status).toBe(400);
    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });

  it("deletes a file whose bytes are not the image it claimed to be", async () => {
    const res = await send(HTML, "fake.png", "image/png");

    expect(res.status).toBe(400);
    expect(fs.readdirSync(uploadDir)).toEqual([]);
  });

  it("applies the same checks to a shortcut's icon", async () => {
    const res = await send(HTML, "fake.png", "image/png", "/api/shortcuts");

    expect(res.status).toBe(400);
    expect(fs.readdirSync(uploadDir)).toEqual([]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM shortcuts").get()).toEqual({ n: 0 });
  });

  it("answers a refused upload with JSON rather than a stack trace", async () => {
    const res = await send(HTML, "evil.html", "text/html");

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error).toContain("Only image files");
  });
});
