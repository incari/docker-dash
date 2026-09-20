/**
 * Stopping when told to.
 *
 * This spawns the real server rather than poking at a function, because the bug
 * it guards against was invisible at the unit level: a SIGTERM listener that
 * closed the database was enough to remove Node's default exit, so the process
 * stayed up for Docker's whole ten-second timeout, answering every request with
 * an error while /health still reported 200.
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "../..");

let child: ChildProcess | null = null;
let tmpDir: string | null = null;

afterEach(() => {
  child?.kill("SIGKILL");
  child = null;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

/** Boot the server on a free port and wait for it to say it is listening. */
async function startServer(): Promise<{ port: number; child: ChildProcess }> {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockerdash-lifecycle-"));
  const port = 3400 + Math.floor(Math.random() * 300);

  const proc = spawn(
    "node",
    ["--import", "tsx", path.join(repoRoot, "src/server.ts")],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        DB_PATH: path.join(tmpDir, "test.db"),
        UPLOAD_DIR: path.join(tmpDir, "images"),
        // Nothing here should depend on Docker being present.
        DOCKER_SOCKET: path.join(tmpDir, "absent.sock"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child = proc;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server did not start in time")),
      20_000,
    );
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Docker Dashboard running")) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited early with code ${code}`));
    });
  });

  return { port, child: proc };
}

function waitForExit(proc: ChildProcess, ms: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 0);
    });
  });
}

describe("shutting down", () => {
  it("exits on SIGTERM instead of lingering with a closed database", async () => {
    const { port, child: proc } = await startServer();

    const before = await fetch(`http://127.0.0.1:${port}/health`);
    expect(before.status).toBe(200);
    expect(await before.text()).toBe("OK");

    proc.kill("SIGTERM");

    // Docker waits ten seconds before SIGKILL; anything close to that is a
    // dashboard that is broken for the whole of every restart.
    const code = await waitForExit(proc, 9_000);
    expect(code).toBe(0);

    // And it really stopped listening, rather than exiting the event loop
    // while the socket stayed open.
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  }, 40_000);
});
