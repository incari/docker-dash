/**
 * The MCP endpoint, so an LLM agent can run the dashboard.
 *
 * Off unless MCP_TOKEN is set, and every request must carry it as a bearer
 * token. The rest of the API has no authentication and relies on the network
 * being trusted; this endpoint is meant to be handed to agents, so it does not.
 *
 * Stateless: each request gets its own server and transport. The tools hold no
 * state between calls, and there is nothing to clean up when a client vanishes.
 */

import crypto from "crypto";
import { Router, Request, Response } from "express";
import type { Router as RouterType } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDashboardApi } from "../mcp/api.js";
import { createDashboardMcpServer } from "../mcp/tools.js";

const router: RouterType = Router();

/** Compared as hashes so the check takes the same time whatever the length. */
function tokenMatches(header: string | undefined, token: string): boolean {
  const presented = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  const digest = (value: string) =>
    crypto.createHash("sha256").update(value).digest();
  return crypto.timingSafeEqual(digest(presented), digest(token));
}

function jsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

router.all("/mcp", async (req: Request, res: Response): Promise<void> => {
  // Read per request rather than at import, so it follows the environment the
  // process actually has - and tests can switch it.
  const token = process.env.MCP_TOKEN?.trim();
  if (!token) {
    jsonRpcError(res, 404, "MCP is disabled. Set MCP_TOKEN to enable it.");
    return;
  }

  if (!tokenMatches(req.headers.authorization, token)) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="docker-dash"');
    jsonRpcError(res, 401, "Missing or wrong bearer token");
    return;
  }

  // Without sessions there is no stream to open with GET and none to close
  // with DELETE.
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    jsonRpcError(res, 405, "Method not allowed");
    return;
  }

  // Loopback to the server that took this request, which serves /api too.
  const api = createDashboardApi(`http://127.0.0.1:${req.socket.localPort}`);
  const server = createDashboardMcpServer(api);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[MCP] Request failed:", error);
    if (!res.headersSent) jsonRpcError(res, 500, "Internal server error");
  }
});

export default router;
