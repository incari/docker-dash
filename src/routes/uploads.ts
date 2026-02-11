/**
 * Upload management routes
 */

import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { uploadDir } from "../config/multer.js";
import { db } from "../config/database.js";

const router = Router();

interface UploadedFile {
  filename: string;
  url: string;
  uploadedAt: Date;
}

// Get list of uploaded images
router.get("/api/uploads", (_req: Request, res: Response): void => {
  try {
    if (!fs.existsSync(uploadDir)) {
      res.json([]);
      return;
    }

    const files = fs.readdirSync(uploadDir);
    const imageFiles: UploadedFile[] = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return [
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".svg",
          ".webp",
          ".ico",
        ].includes(ext);
      })
      .map((file) => ({
        filename: file,
        url: `uploads/${file}`,
        uploadedAt: fs.statSync(path.join(uploadDir, file)).mtime,
      }))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    res.json(imageFiles);
  } catch (error) {
    console.error("Error listing uploaded images:", error);
    res.status(500).json({ error: "Failed to list uploaded images" });
  }
});

// Delete an uploaded image
router.delete(
  "/api/uploads/:filename",
  (req: Request<{ filename: string }>, res: Response): void => {
    try {
      const { filename } = req.params;
      const { force } = req.query;

      // Security: prevent path traversal attacks
      if (
        filename.includes("..") ||
        filename.includes("/") ||
        filename.includes("\\")
      ) {
        res.status(400).json({ error: "Invalid filename" });
        return;
      }

      const filePath = path.join(uploadDir, filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      // Check if any shortcuts are using this image
      const shortcutsUsingImage = db
        .prepare("SELECT id, display_name FROM shortcuts WHERE icon = ?")
        .all(`uploads/${filename}`) as Array<{
        id: number;
        display_name: string;
      }>;

      if (shortcutsUsingImage.length > 0 && force !== "true") {
        res.status(409).json({
          error: "Image is in use",
          shortcuts: shortcutsUsingImage,
        });
        return;
      }

      // If force=true, update all shortcuts using this image to use default icon
      if (force === "true" && shortcutsUsingImage.length > 0) {
        const updateStmt = db.prepare(
          "UPDATE shortcuts SET icon = ? WHERE icon = ?",
        );
        updateStmt.run("Server", `uploads/${filename}`);
      }

      // Delete the file
      fs.unlinkSync(filePath);
      res.json({ success: true, message: "Image deleted successfully" });
    } catch (error) {
      console.error("Error deleting uploaded image:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  },
);

export default router;
