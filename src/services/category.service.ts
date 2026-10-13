import { prisma } from "../prisma";

export class CategoryService {
  static async getAll() {
    return prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { reports: true },
        },
      },
    });
  }

  static async getById(id: string) {
    return prisma.category.findUnique({
      where: { id },
    });
  }
}
