import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.criteriaCategory.findMany({
      where: { companyId: req.companyId },
      include: {
        criteria: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { sortOrder: "asc" },
    });

    success(res, categories);
  } catch (err) {
    console.error("Get criteria error:", err);
    error(res, "Mezonlarni olishda xatolik");
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;

    if (!name) {
      error(res, "Kategoriya nomi kiritilishi shart", 400);
      return;
    }

    const category = await prisma.criteriaCategory.create({
      data: {
        name,
        description: description || null,
        companyId: req.companyId!,
      },
      include: { criteria: true },
    });

    success(res, category, 201);
  } catch (err) {
    console.error("Create category error:", err);
    error(res, "Kategoriya yaratishda xatolik");
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const category = await prisma.criteriaCategory.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!category) {
      error(res, "Kategoriya topilmadi", 404);
      return;
    }

    const updated = await prisma.criteriaCategory.update({
      where: { id },
      data: { name, description },
      include: { criteria: true },
    });

    success(res, updated);
  } catch (err) {
    console.error("Update category error:", err);
    error(res, "Kategoriyani yangilashda xatolik");
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const category = await prisma.criteriaCategory.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!category) {
      error(res, "Kategoriya topilmadi", 404);
      return;
    }

    if (category.name === "Boshqa") {
      error(res, "'Boshqa' kategoriyasi standart kategoriya — uni o'chirib bo'lmaydi", 400);
      return;
    }

    // Cascade o'chirish - mezonlar ham o'chadi
    await prisma.criteria.deleteMany({ where: { categoryId: id } });
    await prisma.criteriaCategory.delete({ where: { id } });

    success(res, { message: "Kategoriya o'chirildi" });
  } catch (err) {
    console.error("Delete category error:", err);
    error(res, "Kategoriyani o'chirishda xatolik");
  }
};

export const createCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, name, description, weight } = req.body;

    if (!categoryId || !name || !description) {
      error(res, "Barcha maydonlar to'ldirilishi shart", 400);
      return;
    }

    const category = await prisma.criteriaCategory.findFirst({
      where: { id: categoryId, companyId: req.companyId },
    });

    if (!category) {
      error(res, "Kategoriya topilmadi", 404);
      return;
    }

    const criteria = await prisma.criteria.create({
      data: {
        name,
        description,
        weight: weight || 20,
        categoryId,
      },
    });

    success(res, criteria, 201);
  } catch (err) {
    console.error("Create criteria error:", err);
    error(res, "Mezon yaratishda xatolik");
  }
};

export const updateCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, weight } = req.body;

    const criteria = await prisma.criteria.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!criteria || criteria.category.companyId !== req.companyId) {
      error(res, "Mezon topilmadi", 404);
      return;
    }

    const updated = await prisma.criteria.update({
      where: { id },
      data: { name, description, weight },
    });

    success(res, updated);
  } catch (err) {
    console.error("Update criteria error:", err);
    error(res, "Mezonni yangilashda xatolik");
  }
};

export const deleteCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const criteria = await prisma.criteria.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!criteria || criteria.category.companyId !== req.companyId) {
      error(res, "Mezon topilmadi", 404);
      return;
    }

    await prisma.criteria.delete({ where: { id } });

    success(res, { message: "Mezon o'chirildi" });
  } catch (err) {
    console.error("Delete criteria error:", err);
    error(res, "Mezonni o'chirishda xatolik");
  }
};

export const reorder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, type } = req.body as { ids: string[]; type?: "category" | "criteria" };
    if (!ids || !Array.isArray(ids)) {
      error(res, "ids kerak", 400);
      return;
    }

    if (type === "category") {
      for (let i = 0; i < ids.length; i++) {
        await prisma.criteriaCategory.update({
          where: { id: ids[i] },
          data: { sortOrder: i + 1 },
        });
      }
    } else {
      for (let i = 0; i < ids.length; i++) {
        await prisma.criteria.update({
          where: { id: ids[i] },
          data: { sortOrder: i + 1 },
        });
      }
    }

    success(res, { message: "Tartib saqlandi" });
  } catch (err) {
    console.error("Reorder criteria error:", err);
    error(res, "Tartibni saqlashda xatolik");
  }
};
