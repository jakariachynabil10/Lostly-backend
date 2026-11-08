"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationIdParamSchema = exports.getNotificationsQuerySchema = void 0;
const zod_1 = require("zod");
exports.getNotificationsQuerySchema = zod_1.z.object({
    page: zod_1.z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: zod_1.z.string().optional().transform((val) => (val ? parseInt(val, 10) : 15)),
});
exports.notificationIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, "Notification ID is required"),
});
