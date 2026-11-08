"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const prisma_1 = require("../prisma");
const client_1 = require("@prisma/client");
const email_1 = require("../utils/email");
const env_1 = require("../config/env");
class NotificationService {
    static async createNotification({ userId, type, title, message, link, sendEmail = true, }) {
        const notification = await prisma_1.prisma.notification.create({
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
        const eligibleEmailTypes = [
            client_1.NotificationType.MATCH_FOUND,
            client_1.NotificationType.CLAIM_RECEIVED,
            client_1.NotificationType.CLAIM_APPROVED,
            client_1.NotificationType.CLAIM_REJECTED,
        ];
        if (sendEmail && eligibleEmailTypes.includes(type)) {
            try {
                const user = await prisma_1.prisma.user.findUnique({
                    where: { id: userId },
                    select: { email: true, name: true },
                });
                if (user?.email) {
                    const emailLink = link
                        ? new URL(link, env_1.ENV.FRONTEND_URL).toString()
                        : undefined;
                    await (0, email_1.sendEmailSafely)({
                        to: user.email,
                        subject: `[Lostly] ${title}`,
                        text: `Hi ${user.name},\n\n${message}\n\n${emailLink ? `View details here: ${emailLink}\n\n` : ""}Lostly Matching & Recovery System`,
                    });
                }
            }
            catch (err) {
                console.warn("[NotificationService] Safe email dispatch caught:", err.message);
            }
        }
        return notification;
    }
    static async getUserNotifications(userId, options = {}) {
        const page = Math.max(1, Number(options.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(options.limit) || 15));
        const skip = (page - 1) * limit;
        const [notifications, total, unreadCount] = await Promise.all([
            prisma_1.prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            prisma_1.prisma.notification.count({ where: { userId } }),
            prisma_1.prisma.notification.count({ where: { userId, read: false } }),
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
    static async getUnreadCount(userId) {
        const count = await prisma_1.prisma.notification.count({
            where: { userId, read: false },
        });
        return { count };
    }
    static async markAsRead(notificationId, userId) {
        const notification = await prisma_1.prisma.notification.findFirst({
            where: { id: notificationId, userId },
        });
        if (!notification) {
            return null;
        }
        return prisma_1.prisma.notification.update({
            where: { id: notificationId },
            data: { read: true },
        });
    }
    static async markAllAsRead(userId) {
        const result = await prisma_1.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });
        return { updatedCount: result.count };
    }
}
exports.NotificationService = NotificationService;
