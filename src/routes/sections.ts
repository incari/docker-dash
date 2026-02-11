/**
 * Section management routes
 */

import { Router, Request, Response } from "express";
import { db } from "../config/database.js";
import type { SectionRow, ReorderItem } from "../types/index.js";

const router = Router();

// Get all sections
router.get("/api/sections", (_req: Request, res: Response) => {
  try {
    const sections = db
      .prepare("SELECT * FROM sections ORDER BY position ASC")
      .all() as SectionRow[];
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sections" });
  }
});

// Create a section
router.post("/api/sections", (req: Request, res: Response): void => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Section name is required" });
    return;
  }

  try {
    const maxPos = db
      .prepare("SELECT MAX(position) as max FROM sections")
      .get() as { max: number | null };
    const position = (maxPos.max || -1) + 1;

    const result = db
      .prepare("INSERT INTO sections (name, position) VALUES (?, ?)")
      .run(name.trim(), position);

    res.json({
      id: result.lastInsertRowid,
      name: name.trim(),
      position,
      is_collapsed: 0,
    });
  } catch (error) {
    console.error("Failed to create section:", error);
    res.status(500).json({ error: "Failed to create section" });
  }
});

// Reorder sections (must be before :id route)
router.put("/api/sections/reorder", (req: Request, res: Response): void => {
  const { sections } = req.body as { sections: ReorderItem[] };

  if (!Array.isArray(sections)) {
    res
      .status(400)
      .json({ error: "Invalid request: sections must be an array" });
    return;
  }

  try {
    const updateStmt = db.prepare(
      "UPDATE sections SET position = ? WHERE id = ?",
    );
    const transaction = db.transaction((items: ReorderItem[]) => {
      for (const item of items) {
        updateStmt.run(item.position, item.id);
      }
    });

    transaction(sections);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reorder sections:", err);
    res.status(500).json({ error: "Failed to reorder sections" });
  }
});

// Update a section
router.put(
  "/api/sections/:id",
  (req: Request<{ id: string }>, res: Response): void => {
    const { id } = req.params;
    const { name, is_collapsed } = req.body;

    try {
      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (name !== undefined) {
        updates.push("name = ?");
        values.push(name.trim());
      }

      if (is_collapsed !== undefined) {
        updates.push("is_collapsed = ?");
        values.push(is_collapsed ? 1 : 0);
      }

      if (updates.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      values.push(parseInt(id, 10));
      db.prepare(`UPDATE sections SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to update section:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  },
);

// Delete a section
router.delete("/api/sections/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    db.prepare(
      "UPDATE shortcuts SET section_id = NULL WHERE section_id = ?",
    ).run(id);
    db.prepare("DELETE FROM sections WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete section:", error);
    res.status(500).json({ error: "Failed to delete section" });
  }
});

// Update shortcut's section
router.put("/api/shortcuts/:id/section", (req: Request, res: Response) => {
  const { id } = req.params;
  const { section_id, position } = req.body;

  try {
    if (position !== undefined) {
      db.prepare(
        "UPDATE shortcuts SET section_id = ?, position = ? WHERE id = ?",
      ).run(section_id || null, position, id);
    } else {
      db.prepare("UPDATE shortcuts SET section_id = ? WHERE id = ?").run(
        section_id || null,
        id,
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to update shortcut section:", error);
    res.status(500).json({ error: "Failed to update shortcut section" });
  }
});

export default router;
