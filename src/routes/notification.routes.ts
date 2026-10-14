import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import { notificationIdParamSchema } from "../validators/notification.validator";

const router = Router();

router.use(authMiddleware);

router.get("/", NotificationController.getNotifications);
router.get("/unread-count", NotificationController.getUnreadCount);
router.patch("/read-all", NotificationController.markAllAsRead);
router.patch(
  "/:id/read",
  validateRequest(notificationIdParamSchema, "params"),
  NotificationController.markAsRead
);

export default router;
