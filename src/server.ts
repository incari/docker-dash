/**
 * Docker Dashboard Server - Main Entry Point
 *
 * This file initializes the Express server, sets up middleware,
 * mounts all route modules, and starts the application.
 */

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Configuration
import { PORT, initializeSchema } from "./config/index.js";
import {
  uploadDir,
  upload,
  rejectNonImageUpload,
  uploadErrorHandler,
} from "./config/multer.js";

// Database
import { runMigrations } from "./database/index.js";

// Process lifecycle
import { installLifecycleHandlers } from "./lifecycle.js";

// Hosts
import { ensureLocalHost } from "./hosts/registry.js";
import { ensureApiKey } from "./hosts/agentAccess.js";

// Routes
import {
  agentRouter,
  containersRouter,
  healthRouter,
  hostsRouter,
  uploadsRouter,
  sectionsRouter,
  shortcutsRouter,
  settingsRouter,
  dataRouter,
} from "./routes/index.js";

// ES module equivalents of __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Path to the frontend build.
 *
 * A directory of its own, beside the compiled backend rather than mixed into
 * it: serving them from one folder meant GET /server.js handed out the
 * backend. The Dockerfile copies the Vite output here.
 */
const frontendPath =
  process.env.FRONTEND_DIR || path.join(__dirname, "../public");

// Create Express app
const app = express();

// Behind a reverse proxy the client address is in X-Forwarded-For, and the
// rate limits below would otherwise count every visitor as the proxy.
if (process.env.TRUST_PROXY) {
  const hops = parseInt(process.env.TRUST_PROXY, 10);
  app.set("trust proxy", Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
}

app.disable("x-powered-by");

/**
 * Security headers.
 *
 * This dashboard has no login, so the browser's own rules are what keeps a
 * page in another tab from driving it: no cross-origin reads (there is no CORS
 * header any more - the frontend is same-origin and never needed one), no
 * framing (clickjacking a "Stop" button), and a content-security-policy that
 * refuses inline scripts, so an icon URL or an imported file cannot become
 * code on this origin.
 *
 * Deliberately absent: HSTS and upgrade-insecure-requests. The usual install
 * is plain HTTP on a LAN, and either header would be remembered by the browser
 * for the whole hostname - including the other services whose ports the
 * shortcuts open.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        // React and framer-motion set style attributes; a nonce cannot cover
        // those, and this directive does not let scripts in.
        "style-src": ["'self'", "'unsafe-inline'"],
        // Icons come from the Homarr CDN, from any URL the user pastes - LAN
        // services are plain http - and from uploads on this origin.
        "img-src": ["'self'", "data:", "blob:", "https:", "http:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "manifest-src": ["'self'"],
        "worker-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
    // Same answer as frame-ancestors above, for browsers that only read this.
    frameguard: { action: "deny" },
    crossOriginEmbedderPolicy: false,
    hsts: false,
  }),
);

app.use(express.json());

// Serve static files from frontend build
app.use(express.static(frontendPath));

/**
 * Serve uploaded files.
 *
 * Whatever is in this folder is treated as an untrusted download: no sniffing a
 * .png into HTML, and a CSP that sandboxes the response so that even a file
 * from before extensions were checked - an SVG with a script, say - runs
 * nothing and sees nothing of this origin if opened directly.
 */
app.use(
  "/uploads",
  express.static(uploadDir, {
    index: false,
    dotfiles: "deny",
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    },
  }),
);

// Initialize database schema
initializeSchema();

// Run migrations
await runMigrations();

// A database that predates the hosts table, or one edited by hand, still needs
// the local server to exist before any shortcut can point at it.
ensureLocalHost();

// Give this installation a key of its own, ready to be copied into a hub. It
// does nothing until reading this server is switched on.
ensureApiKey();

/**
 * Rate limits, on the endpoints where a loop would cost something: outbound
 * connections, disk, or a full rewrite of the database. The dashboard's own
 * polling of /api/containers and /api/hosts is not limited.
 */
const limiter = (max: number, what: string) =>
  rateLimit({
    windowMs: 60_000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: `Too many ${what} - try again in a minute` },
  });

app.use("/api/agent", limiter(300, "requests"));
app.use("/api/upload", limiter(30, "uploads"));
app.use("/api/hosts/test", limiter(20, "connection tests"));
app.use("/api/import", limiter(10, "imports"));

// Upload endpoint (needs upload middleware)
app.post(
  "/api/upload",
  upload.single("image"),
  rejectNonImageUpload,
  (req, res): void => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const imageUrl = `uploads/${req.file.filename}`;
    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
    });
  },
);

// Mount route modules
// Health first: whatever else is wrong, something has to be able to answer.
app.use(healthRouter);
// Agent next: it owns /api/agent and refuses anything without the key.
app.use(agentRouter);
app.use(hostsRouter);
app.use(containersRouter);
app.use(uploadsRouter);
app.use(sectionsRouter);
app.use(shortcutsRouter);
app.use(settingsRouter);
app.use(dataRouter);

// Catch-all route for SPA (React Router support)
app.get("*", (req, res): void => {
  // If it's an API request that didn't match anything above, 404 it
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
    res.status(404).json({ error: "Endpoint not found" });
    return;
  }

  // Serve index.html for all other requests (SPA routing)
  if (fs.existsSync(path.join(frontendPath, "index.html"))) {
    res.sendFile(path.join(frontendPath, "index.html"));
  } else {
    res.status(404).send("Frontend not built. Run npm run build.");
  }
});

// A refused upload answers with JSON, like every other error here.
app.use(uploadErrorHandler);

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Docker Dashboard running on http://0.0.0.0:${PORT}`);
});

// Stop cleanly on SIGTERM, and say something before dying on a crash.
installLifecycleHandlers(server);
