/**
 * Configuration exports
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export {
  db,
  initializeSchema,
  getTableInfo,
  columnExists,
} from "./database.js";
export { docker } from "./docker.js";
export { upload, uploadDir } from "./multer.js";

export const PORT = parseInt(process.env.PORT || "3000", 10);

/**
 * Key a remote hub must present to read this installation's Docker daemon.
 *
 * Setting it here turns agent mode on and pins the key, which is what a
 * compose file or a secrets manager wants. Left empty, the installation
 * generates its own key and keeps agent mode off until it is switched on from
 * the dashboard - see hosts/agentAccess.ts.
 */
export const API_KEY = (process.env.API_KEY || "").trim();

/** What this machine calls itself when a hub asks. */
export const HOST_NAME = (process.env.HOST_NAME || "").trim();

/**
 * Reported to a hub on /api/agent/ping, so a fleet can be checked for nodes
 * running an old build. Read from package.json rather than hard-coded, because
 * npm_package_version is only set when the server is started through a script.
 */
export const VERSION: string = (() => {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      fs.readFileSync(path.join(here, "../../package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version || "unknown";
  } catch {
    return process.env.npm_package_version || "unknown";
  }
})();
