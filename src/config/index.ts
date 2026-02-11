/**
 * Configuration exports
 */

export {
  db,
  initializeSchema,
  getTableInfo,
  columnExists,
} from "./database.js";
export { docker } from "./docker.js";
export { upload, uploadDir } from "./multer.js";

export const PORT = parseInt(process.env.PORT || "3000", 10);
