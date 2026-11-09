import { z } from "zod";

export const getNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

export const notificationIdParamSchema = z.object({
  id: z.string().min(1, "Notification ID is required"),
});
