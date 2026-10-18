import { prisma } from "../prisma";
import { NotificationType } from "@prisma/client";
import { sendEmailSafely } from "../utils/email";
import { ENV } from "../config/env";

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  sendEmail?: boolean;
}

export class NotificationService {
  static async createNotification({
    userId,
    type,
    title,
    message,
    link,
    sendEmail = true,
  }: CreateNotificationParams) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        link: link || null,
        read: false,
      },
    });

    // Email check for specified types
    const eligibleEmailTypes: NotificationType[] = [
      NotificationType.MATCH_FOUND,
      NotificationType.CLAIM_RECEIVED,
      NotificationType.CLAIM_APPROVED,
      NotificationType.CLAIM_REJECTED,
    ];

    if (sendEmail && eligibleEmailTypes.includes(type)) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, name: true },
        });

        if (user?.email) {
          const emailLink = link
            ? new URL(link, ENV.FRONTEND_URL).toString()
            : undefined;
          await sendEmailSafely({
            to: user.email,
            subject: `[Lostly] ${title}`,
            text: `Hi ${user.name},\n\n${message}\n\n${emailLink ? `View details here: ${emailLink}\n\n` : ""}Lostly Matching & Recovery System`,
          });
        }
      } catch (err: any) {
        console.warn(
          "[NotificationService] Safe email dispatch caught:",
          err.message,
        );
      }
    }

    return notification;
  }

  static async getUserNotifications(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 15));
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getUnreadCount(userId: string) {
    const count = await prisma.notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  static async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      return null;
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  static async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return { updatedCount: result.count };
  }
}
