import { app } from "./app";
import { ENV } from "./config/env";
import { prisma } from "./prisma";

const server = app.listen(ENV.PORT, () => {
  console.log(`🚀 Lostly Backend Server running on http://localhost:${ENV.PORT}`);
  console.log(`📡 Health Check: http://localhost:${ENV.PORT}/api/health`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || "development"}`);
});

const gracefulShutdown = async () => {
  console.log("\nShutting down server gracefully...");
  server.close(async () => {
    await prisma.$disconnect();
    console.log("Database disconnected. Server terminated.");
    process.exit(0);
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
