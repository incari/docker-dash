/**
 * Settings management routes
 */

import { Router, Request, Response } from 'express';
import { db } from '../config/database.js';
import type { SettingsRow } from '../types/index.js';

const router = Router();

// Get user settings
router.get('/api/settings', (_req: Request, res: Response) => {
  try {
    let settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow | undefined;

    // If no settings exist, create default settings
    if (!settings) {
      db.prepare(`
        INSERT INTO settings (id, theme_primary, theme_background, view_mode, mobile_columns, migration_dismissed)
        VALUES (1, '#3b82f6', '#0f172a', 'default', 2, 0)
      `).run();
      settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as SettingsRow;
    }

    res.json(settings);
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update user settings
router.put('/api/settings', (req: Request, res: Response) => {
  const { theme_primary, theme_background, view_mode, mobile_columns, migration_dismissed } = req.body;

  try {
    const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();

    if (!existing) {
      db.prepare(`
        INSERT INTO settings (id, theme_primary, theme_background, view_mode, mobile_columns, migration_dismissed)
        VALUES (1, ?, ?, ?, ?, ?)
      `).run(
        theme_primary || '#3b82f6',
        theme_background || '#0f172a',
        view_mode || 'default',
        mobile_columns || 2,
        migration_dismissed || 0
      );
    } else {
      const updates: string[] = [];
      const values: (string | number)[] = [];

      if (theme_primary !== undefined) {
        updates.push('theme_primary = ?');
        values.push(theme_primary);
      }

      if (theme_background !== undefined) {
        updates.push('theme_background = ?');
        values.push(theme_background);
      }

      if (view_mode !== undefined) {
        updates.push('view_mode = ?');
        values.push(view_mode);
      }

      if (mobile_columns !== undefined) {
        updates.push('mobile_columns = ?');
        values.push(mobile_columns);
      }

      if (migration_dismissed !== undefined) {
        updates.push('migration_dismissed = ?');
        values.push(migration_dismissed);
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        db.prepare(`UPDATE settings SET ${updates.join(', ')} WHERE id = 1`).run(...values);
      }
    }

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json(settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;

