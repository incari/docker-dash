/**
 * Multer configuration for file uploads
 *
 * Uploads are served back from the dashboard's own origin, so anything that a
 * browser would run as code - HTML, SVG with a script, a file whose name says
 * .png but whose bytes say otherwise - is an XSS on the page that controls the
 * containers. Three defences, in order:
 *
 *   1. The declared type and the original extension both have to be in the
 *      allow-list, and have to agree.
 *   2. The stored name is generated; nothing from the client's filename is
 *      kept. The extension comes from the declared type, never the upload.
 *   3. After the write, `rejectNonImageUpload` checks the file's magic bytes
 *      and deletes it if they do not match. The declared type is the client's
 *      word; this is the file's.
 *
 * SVG is not accepted any more: it is a script container as much as an image
 * format, and the icon set this dashboard draws from ships PNGs.
 */

import multer, { FileFilterCallback, MulterError } from "multer";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import { Request, Response, NextFunction } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload directory path
export const uploadDir =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../data/images");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
  }
}

/** Declared type -> the extension the stored file gets. */
const EXTENSION_FOR_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

/** Extensions a client may name its file with, per declared type. */
const ACCEPTED_EXTENSIONS: Record<string, string[]> = {
  ".png": ["image/png"],
  ".jpg": ["image/jpeg", "image/jpg"],
  ".jpeg": ["image/jpeg", "image/jpg"],
  ".gif": ["image/gif"],
  ".webp": ["image/webp"],
  ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
};

/** Every extension the dashboard will list and serve as an uploaded icon. */
export const SERVED_UPLOAD_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
];

export const UPLOAD_ERROR_MESSAGE =
  "Only image files are allowed (PNG, JPG, GIF, WebP, ICO)";

export class UploadRejectedError extends Error {
  readonly status = 400;
  constructor(message: string = UPLOAD_ERROR_MESSAGE) {
    super(message);
    this.name = "UploadRejectedError";
  }
}

const storage = multer.diskStorage({
  destination: (
    _req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void,
  ) => {
    cb(null, uploadDir);
  },
  filename: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void,
  ) => {
    const ext = EXTENSION_FOR_TYPE[file.mimetype];
    if (!ext) {
      cb(new UploadRejectedError(), "");
      return;
    }
    cb(null, `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`);
  },
});

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const typesForExt = ACCEPTED_EXTENSIONS[ext];
  if (typesForExt && typesForExt.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new UploadRejectedError());
};

// Multer upload instance
export const upload = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
    files: 1,
  },
});

/**
 * What the first bytes of each accepted format look like.
 * ICO has no magic worth the name (00 00 01 00) but it is all there is.
 */
function sniffImageType(header: Buffer): string | null {
  if (
    header.length >= 8 &&
    header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return ".png";
  }
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return ".jpg";
  }
  if (header.length >= 6) {
    const tag = header.subarray(0, 6).toString("latin1");
    if (tag === "GIF87a" || tag === "GIF89a") return ".gif";
  }
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString("latin1") === "RIFF" &&
    header.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return ".webp";
  }
  if (
    header.length >= 4 &&
    header[0] === 0x00 &&
    header[1] === 0x00 &&
    header[2] === 0x01 &&
    header[3] === 0x00
  ) {
    return ".ico";
  }
  return null;
}

/** Does the file on disk hold the format its stored extension promises? */
export function fileMatchesExtension(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(12);
    const read = fs.readSync(fd, header, 0, 12, 0);
    const sniffed = sniffImageType(header.subarray(0, read));
    if (!sniffed) return false;
    const stored = path.extname(filePath).toLowerCase();
    return sniffed === stored || (sniffed === ".jpg" && stored === ".jpeg");
  } catch {
    return false;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

/**
 * Runs after `upload.single()`. Deletes a file whose bytes are not the image
 * its declared type said it was, and answers 400 instead of continuing.
 */
export function rejectNonImageUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.file) {
    next();
    return;
  }
  if (fileMatchesExtension(req.file.path)) {
    next();
    return;
  }
  try {
    fs.unlinkSync(req.file.path);
  } catch {
    // Already gone, or never written; nothing else to do.
  }
  req.file = undefined;
  res.status(400).json({ error: UPLOAD_ERROR_MESSAGE });
}

/**
 * Turns a refused upload into a JSON 400 instead of Express's HTML stack trace.
 * Mounted after every route in server.ts.
 */
export function uploadErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof UploadRejectedError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image is too large (20 MB maximum)"
        : UPLOAD_ERROR_MESSAGE;
    res.status(400).json({ error: message });
    return;
  }
  next(err);
}
