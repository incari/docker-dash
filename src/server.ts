/**
 * Docker Dashboard Server - Main Entry Point
 *
 * This file initializes the Express server, sets up middleware,
 * mounts all route modules, and starts the application.
 */

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Configuration
import { PORT, initializeSchema } from "./config/index.js";
import { uploadDir, upload } from "./config/multer.js";

// Database
import { runMigrations } from "./database/index.js";

// Routes
import {
  containersRouter,
  uploadsRouter,
  sectionsRouter,
  shortcutsRouter,
  settingsRouter,
} from "./routes/index.js";

// ES module equivalents of __dirname and __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to frontend build
const frontendPath = path.join(__dirname, "../dist");

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend build
app.use(express.static(frontendPath));

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// Initialize database schema
initializeSchema();

// Run migrations
await runMigrations();

// Upload endpoint (needs upload middleware)
app.post("/api/upload", upload.single("image"), (req, res): void => {
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
});

// Mount route modules
app.use(containersRouter);
app.use(uploadsRouter);
app.use(sectionsRouter);
app.use(shortcutsRouter);
app.use(settingsRouter);

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

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Docker Dashboard running on http://0.0.0.0:${PORT}`);
});
