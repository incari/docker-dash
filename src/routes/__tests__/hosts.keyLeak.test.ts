/**
 * A saved server's key only ever travels to the address it was saved with.
 *
 * The hub sends the key as a bearer header to whatever URL a host has, and
 * "an empty key means keep the saved one" is how editing a server works. Put
 * together, pointing a saved server at a different address without a key used
 * to send that server's key to the new address - which is to say, to anyone
 * who could reach the hub's own unauthenticated API.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-keyleak-test-"));
process.env.DB_PATH = path.join(tmpDir, "test.db");
delete process.env.API_KEY;
process.env.HOST_TIMEOUT_MS = "800";
process.env.HOST_CACHE_MS = "0";

vi.mock("../../config/docker.js", () => ({
  docker: {
    listContainers: async () => [],
    getContainer: () => ({ inspect: async () => ({}) }),
  },
}));

const { db, initializeSchema } = await import("../../config/database.js");
const { ensureLocalHost } = await import("../../hosts/registry.js");
const { default: hostsRouter } = await import("../hosts.js");
const express = (await import("express")).default;

let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;

/** Stands in for an attacker's machine: records what the hub sends it. */
let sinkUrl: string;
let sink: http.Server;
const seen: string[] = [];

beforeAll(async () => {
  initializeSchema();
  ensureLocalHost();

  const app = express();
  app.use(express.json());
  app.use(hostsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

  sink = http.createServer((req, res) => {
    seen.push(req.headers.authorization || "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, containers: 0 }));
  });
  sink.listen(0);
  await new Promise<void>((resolve) => sink.once("listening", () => resolve()));
  const sinkAddress = sink.address();
  sinkUrl = `http://127.0.0.1:${typeof sinkAddress === "object" && sinkAddress ? sinkAddress.port : 0}`;
});

afterAll(() => {
  server?.close();
  sink?.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let nasId: number;

beforeEach(() => {
  seen.length = 0;
  db.prepare("DELETE FROM hosts WHERE id != 1").run();
  const result = db
    .prepare(
      `INSERT INTO hosts (name, type, url, api_key, position, enabled)
       VALUES ('NAS', 'agent', 'http://nas.local:3080', 'nas-secret', 1, 1)`,
    )
    .run();
  nasId = Number(result.lastInsertRowid);
});

describe("testing a server", () => {
  it("sends the saved key to the saved address", async () => {
    db.prepare("UPDATE hosts SET url = ? WHERE id = ?").run(sinkUrl, nasId);

    const res = await fetch(`${baseUrl}/api/hosts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nasId }),
    });

    expect((await res.json()).ok).toBe(true);
    expect(seen).toEqual(["Bearer nas-secret"]);
  });

  it("refuses to send the saved key to a different address", async () => {
    const res = await fetch(`${baseUrl}/api/hosts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nasId, url: sinkUrl }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error_code).toBe("key_required");
    expect(seen).toEqual([]);
  });

  it("uses a typed key for a new address", async () => {
    const res = await fetch(`${baseUrl}/api/hosts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: nasId, url: sinkUrl, api_key: "typed-key" }),
    });

    expect((await res.json()).ok).toBe(true);
    expect(seen).toEqual(["Bearer typed-key"]);
  });
});

describe("editing a server", () => {
  it("will not move a saved key to a new address", async () => {
    const res = await fetch(`${baseUrl}/api/hosts/${nasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sinkUrl }),
    });

    expect(res.status).toBe(400);
    const row = db
      .prepare("SELECT url, api_key FROM hosts WHERE id = ?")
      .get(nasId) as { url: string; api_key: string };
    expect(row).toEqual({ url: "http://nas.local:3080", api_key: "nas-secret" });
  });

  it("changes the address when a key comes with it", async () => {
    const res = await fetch(`${baseUrl}/api/hosts/${nasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: sinkUrl, api_key: "new-key" }),
    });

    expect(res.status).toBe(200);
    const row = db
      .prepare("SELECT url, api_key FROM hosts WHERE id = ?")
      .get(nasId) as { url: string; api_key: string };
    expect(row).toEqual({ url: sinkUrl, api_key: "new-key" });
  });

  it("still lets a name or colour change leave the key alone", async () => {
    const res = await fetch(`${baseUrl}/api/hosts/${nasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Storage", color: "#22c55e" }),
    });

    expect(res.status).toBe(200);
    const row = db
      .prepare("SELECT name, api_key FROM hosts WHERE id = ?")
      .get(nasId) as { name: string; api_key: string };
    expect(row).toEqual({ name: "Storage", api_key: "nas-secret" });
  });
});

describe("server addresses", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data",
    "0.0.0.0:3080",
    "ftp://nas.local",
  ])("refuses %s", async (url) => {
    const res = await fetch(`${baseUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad", url, api_key: "k" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts a private LAN address, which is where the servers are", async () => {
    const res = await fetch(`${baseUrl}/api/hosts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pi", url: "192.168.1.10:3080", api_key: "k" }),
    });
    expect(res.status).toBe(200);
  });
});
