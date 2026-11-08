"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
exports.processUploadedFile = processUploadedFile;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const cloudinary_1 = require("cloudinary");
const env_1 = require("../config/env");
// Ensure local upload folder exists
const uploadsDir = path_1.default.resolve(__dirname, "../../uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Check if Cloudinary is configured
const isCloudinaryConfigured = Boolean(env_1.ENV.CLOUDINARY_CLOUD_NAME &&
    env_1.ENV.CLOUDINARY_API_KEY &&
    env_1.ENV.CLOUDINARY_API_SECRET);
if (isCloudinaryConfigured) {
    cloudinary_1.v2.config({
        cloud_name: env_1.ENV.CLOUDINARY_CLOUD_NAME,
        api_key: env_1.ENV.CLOUDINARY_API_KEY,
        api_secret: env_1.ENV.CLOUDINARY_API_SECRET,
    });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `lostly-${uniqueSuffix}${ext}`);
    },
});
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extname = allowedTypes.test(path_1.default.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error("Only image files (.jpg, .jpeg, .png, .webp, .gif) are supported"));
    },
});
async function processUploadedFile(file, req) {
    if (isCloudinaryConfigured) {
        try {
            const uploadResult = await cloudinary_1.v2.uploader.upload(file.path, {
                folder: "lostly_items",
            });
            // Optionally remove local file after cloudinary upload
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch {
                // ignore
            }
            return uploadResult.secure_url;
        }
        catch (error) {
            console.warn("Cloudinary upload failed, falling back to local storage URL:", error);
        }
    }
    // Fallback to local server URL
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return `${baseUrl}/uploads/${file.filename}`;
}
