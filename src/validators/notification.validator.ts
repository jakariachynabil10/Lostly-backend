import { z } from "zod";

export const getNotificationsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 15)),
});

export const notificationIdParamSchema = z.object({
  id: z.string().min(1, "Notification ID is required"),
});
