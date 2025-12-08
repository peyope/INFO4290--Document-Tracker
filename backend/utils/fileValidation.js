// backend/utils/fileValidation.js
import path from "path";

// Allowed MIME types
export const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "text/plain",
];

// Allowed extensions for extra safety
export const allowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".txt",
];

// Maximum file size (10 MB)
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Multer file filter for validating MIME type + extension.
 */
export function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (!allowedExtensions.includes(ext)) {
    return cb(
      new Error(`Invalid file extension: ${ext}. Allowed: ${allowedExtensions.join(", ")}`),
      false
    );
  }

  if (!allowedMimeTypes.includes(mime)) {
    return cb(
      new Error(`Invalid file type: ${mime}. Allowed: ${allowedMimeTypes.join(", ")}`),
      false
    );
  }

  cb(null, true);
}
