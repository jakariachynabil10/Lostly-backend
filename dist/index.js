"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./prisma");
const server = app_1.app.listen(env_1.ENV.PORT, () => {
    console.log(`🚀 Lostly Backend Server running on http://localhost:${env_1.ENV.PORT}`);
    console.log(`📡 Health Check: http://localhost:${env_1.ENV.PORT}/api/health`);
    console.log(`🔒 Environment: ${process.env.NODE_ENV || "development"}`);
});
const gracefulShutdown = async () => {
    console.log("\nShutting down server gracefully...");
    server.close(async () => {
        await prisma_1.prisma.$disconnect();
        console.log("Database disconnected. Server terminated.");
        process.exit(0);
    });
};
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
