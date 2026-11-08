"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryService = void 0;
const prisma_1 = require("../prisma");
class CategoryService {
    static async getAll() {
        return prisma_1.prisma.category.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: {
                    select: { reports: true },
                },
            },
        });
    }
    static async getById(id) {
        return prisma_1.prisma.category.findUnique({
            where: { id },
        });
    }
}
exports.CategoryService = CategoryService;
