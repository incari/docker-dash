/**
 * Whether a hub may read this installation, and with which key.
 *
 * Two ways to configure it, and the environment wins:
 *
 *   API_KEY set    - agent mode is on and the key is exactly that. What a
 *                    compose file or a secrets manager wants, and unchangeable
 *                    from the dashboard.
 *   API_KEY empty  - the installation generates a key on first boot and keeps
 *                    it in its own database, so it can be copied out of the
 *                    dashboard instead of being invented in a terminal. Agent
 *                    mode stays OFF until someone switches it on here.
 *
 * Either way nothing is exposed by default: a fresh installation refuses every
 * request to /api/agent.
 */

import { randomBytes } from "crypto";
import { db } from "../config/database.js";
import { API_KEY } from "../config/index.js";

export interface AgentAccess {
  /** Whether /api/agent will serve a caller holding the key. */
  enabled: boolean;
  /** True when API_KEY is set, which makes the key read-only here. */
  managed_by_env: boolean;
  /** The key a hub has to present. */
  api_key: string;
}

function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function readSettings(): { api_key: string | null; agent_enabled: number } {
  const row = db
    .prepare("SELECT api_key, agent_enabled FROM settings WHERE id = 1")
    .get() as { api_key: string | null; agent_enabled: number } | undefined;

  return row ?? { api_key: null, agent_enabled: 0 };
}

/**
 * Make sure this installation has a key to offer.
 *
 * Called at boot so the dashboard always has something to show, even though the
 * key does nothing until agent mode is on. Generating it lazily on first view
 * would mean a GET that writes.
 */
export function ensureApiKey(): void {
  if (API_KEY) return;

  const existing = readSettings();
  if (existing.api_key) return;

  db.prepare(
    `INSERT INTO settings (id, api_key) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key,
                                   updated_at = CURRENT_TIMESTAMP`,
  ).run(generateKey());
}

export function getAgentAccess(): AgentAccess {
  if (API_KEY) {
    return { enabled: true, managed_by_env: true, api_key: API_KEY };
  }

  const settings = readSettings();
  return {
    enabled: settings.agent_enabled === 1,
    managed_by_env: false,
    api_key: settings.api_key ?? "",
  };
}

/**
 * Switch reading of this installation on or off.
 * Refused while API_KEY is set: the environment is the statement of intent
 * there, and a dashboard toggle that the next restart undoes is worse than no
 * toggle at all.
 */
export function setAgentEnabled(enabled: boolean): boolean {
  if (API_KEY) return false;

  ensureApiKey();
  db.prepare(
    `UPDATE settings SET agent_enabled = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
  ).run(enabled ? 1 : 0);
  return true;
}

/**
 * Replace the key.
 *
 * The point of a credential you can change is recovering from one that leaked,
 * so every hub still holding the old key stops being able to read this machine
 * the moment this returns.
 */
export function rotateApiKey(): string | null {
  if (API_KEY) return null;

  const key = generateKey();
  db.prepare(
    `INSERT INTO settings (id, api_key) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key,
                                   updated_at = CURRENT_TIMESTAMP`,
  ).run(key);
  return key;
}
