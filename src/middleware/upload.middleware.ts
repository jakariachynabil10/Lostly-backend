import multer from "multer";
import path from "path";
import fs from "fs";
import { v2 as cloudinary } from "cloudinary";
import { Request } from "express";
import { ENV } from "../config/env";

// Ensure local upload folder exists
const uploadsDir = path.resolve(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Check if Cloudinary is configured
const isCloudinaryConfigured = Boolean(
  ENV.CLOUDINARY_CLOUD_NAME &&
  ENV.CLOUDINARY_API_KEY &&
  ENV.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
    api_key: ENV.CLOUDINARY_API_KEY,
    api_secret: ENV.CLOUDINARY_API_SECRET,
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `lostly-${uniqueSuffix}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files (.jpg, .jpeg, .png, .webp, .gif) are supported"));
  },
});

export async function processUploadedFile(file: Express.Multer.File, req: Request): Promise<string> {
  if (isCloudinaryConfigured) {
    try {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: "lostly_items",
      });
      // Optionally remove local file after cloudinary upload
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
      return uploadResult.secure_url;
    } catch (error) {
      console.warn("Cloudinary upload failed, falling back to local storage URL:", error);
    }
  }

  // Fallback to local server URL
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/uploads/${file.filename}`;
}
