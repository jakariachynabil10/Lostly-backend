"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const env_1 = require("./config/env");
exports.app = (0, express_1.default)();
// Security headers
exports.app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
// CORS configuration
exports.app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            env_1.ENV.FRONTEND_URL,
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ];
        if (allowedOrigins.includes(origin) ||
            origin.startsWith("http://localhost:")) {
            return callback(null, true);
        }
        return callback(null, true); // Permissive in dev
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// Body parser
exports.app.use(express_1.default.json({ limit: "10mb" }));
exports.app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
// Static uploads serving
const uploadsDir = path_1.default.resolve(__dirname, "../uploads");
exports.app.use("/uploads", express_1.default.static(uploadsDir));
// Health check
exports.app.get("/api/health", (_req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
    });
});
// Mount API routes
exports.app.use("/api", routes_1.default);
// 404 handler
exports.app.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: "Endpoint not found",
        errors: [],
    });
});
// Centralized error handler
exports.app.use(error_middleware_1.errorHandler);
