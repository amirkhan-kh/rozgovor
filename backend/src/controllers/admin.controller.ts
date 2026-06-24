import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { signToken } from "../utils/jwt";
import { success, error } from "../utils/response";

// POST /admin/login
export const adminLogin = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, "Username va parol kiritilishi kerak", 400);
  }

  const admin = await prisma.superAdmin.findUnique({ where: { username } });
  if (!admin) {
    return error(res, "Login yoki parol noto'g'ri", 401);
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return error(res, "Login yoki parol noto'g'ri", 401);
  }

  const token = signToken(admin.id, "admin");

  return success(res, { token, admin: { id: admin.id, name: admin.name, username: admin.username } });
};

// GET /admin/me
export const adminMe = async (req: Request, res: Response) => {
  const admin = await prisma.superAdmin.findUnique({
    where: { id: req.adminId },
    select: { id: true, name: true, username: true, createdAt: true },
  });

  if (!admin) {
    return error(res, "Admin topilmadi", 404);
  }

  return success(res, admin);
};

// GET /admin/companies
export const getCompanies = async (req: Request, res: Response) => {
  const companies = await prisma.company.findMany({
    include: {
      _count: {
        select: {
          managers: true,
          audioFiles: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = companies.map((c) => ({
    id: c.id,
    name: c.name,
    username: c.username,
    plan: c.plan,
    totalLimitHours: c.totalLimitHours,
    isActive: c.isActive,
    managerLimit: c.managerLimit,
    audioLimitPerManager: c.audioLimitPerManager,
    managersCount: c._count.managers,
    audioCount: c._count.audioFiles,
    createdAt: c.createdAt,
  }));

  return success(res, result);
};

// POST /admin/companies
export const createCompany = async (req: Request, res: Response) => {
  const { name, username, password, totalLimitHours, managerLimit, audioLimitPerManager } = req.body;

  if (!name || !username || !password) {
    return error(res, "Name, username va parol kiritilishi kerak", 400);
  }

  const existing = await prisma.company.findUnique({ where: { username } });
  if (existing) {
    return error(res, "Bu username allaqachon mavjud", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const company = await prisma.company.create({
    data: {
      name,
      username,
      password: hashedPassword,
      totalLimitHours: totalLimitHours ?? 500,
      managerLimit: managerLimit ?? 20,
      audioLimitPerManager: audioLimitPerManager ?? 100,
      criteria: {
        create: [
          {
            name: "Salomlashish",
            description: "Mijoz bilan salomlashish sifati",
            criteria: {
              create: [
                { name: "O'zini tanishtirish", description: "Menejer o'zini to'liq tanishtirdimi", weight: 20 },
                { name: "Kompaniyani tanishtirish", description: "Kompaniya nomini aytdimi", weight: 20 },
              ],
            },
          },
          {
            name: "Ehtiyojni aniqlash",
            description: "Mijoz ehtiyojini aniqlash",
            criteria: {
              create: [
                { name: "Savollar berish", description: "Ochiq savollar berdimi", weight: 20 },
                { name: "Faol tinglash", description: "Mijozni diqqat bilan tingladimi", weight: 20 },
              ],
            },
          },
          {
            name: "Mahsulot taqdimoti",
            description: "Mahsulot yoki xizmatni taqdim etish",
            criteria: {
              create: [
                { name: "Foyda va afzalliklar", description: "Mahsulot foydalarini tushuntirdimi", weight: 20 },
                { name: "Narx taqdimoti", description: "Narxni to'g'ri taqdim etdimi", weight: 20 },
              ],
            },
          },
          {
            name: "E'tirozlar bilan ishlash",
            description: "Mijoz e'tirozlarini hal qilish",
            criteria: {
              create: [
                { name: "E'tirozni qabul qilish", description: "E'tirozni tingladi va tushundimi", weight: 20 },
                { name: "Javob berish", description: "E'tirozga professional javob berdimi", weight: 20 },
              ],
            },
          },
          {
            name: "Yakunlash",
            description: "Suhbatni yakunlash",
            criteria: {
              create: [
                { name: "Keyingi qadam", description: "Keyingi qadamni belgiladimi", weight: 20 },
                { name: "Xayrlashish", description: "Mijoz bilan xayrlashdimi", weight: 20 },
              ],
            },
          },
        ],
      },
    },
  });

  return success(res, { id: company.id, name: company.name, username: company.username }, 201);
};

// PUT /admin/companies/:id
export const updateCompany = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, username, totalLimitHours, managerLimit, audioLimitPerManager, isActive } = req.body;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return error(res, "Kompaniya topilmadi", 404);
  }

  if (username && username !== company.username) {
    const existing = await prisma.company.findUnique({ where: { username } });
    if (existing) {
      return error(res, "Bu username allaqachon mavjud", 400);
    }
  }

  const updated = await prisma.company.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(username !== undefined && { username }),
      ...(totalLimitHours !== undefined && { totalLimitHours }),
      ...(managerLimit !== undefined && { managerLimit }),
      ...(audioLimitPerManager !== undefined && { audioLimitPerManager }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return success(res, {
    id: updated.id,
    name: updated.name,
    username: updated.username,
    totalLimitHours: updated.totalLimitHours,
    managerLimit: updated.managerLimit,
    audioLimitPerManager: updated.audioLimitPerManager,
    isActive: updated.isActive,
  });
};

// PUT /admin/companies/:id/toggle
export const toggleCompany = async (req: Request, res: Response) => {
  const { id } = req.params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return error(res, "Kompaniya topilmadi", 404);
  }

  const updated = await prisma.company.update({
    where: { id },
    data: { isActive: !company.isActive },
  });

  return success(res, { id: updated.id, isActive: updated.isActive });
};

// DELETE /admin/companies/:id
export const deleteCompany = async (req: Request, res: Response) => {
  const { id } = req.params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return error(res, "Kompaniya topilmadi", 404);
  }

  await prisma.$transaction(async (tx) => {
    // Delete analyses linked to this company's audio files
    await tx.analysis.deleteMany({
      where: { audioFile: { companyId: id } },
    });

    // Delete audio files
    await tx.audioFile.deleteMany({ where: { companyId: id } });

    // Delete managers
    await tx.manager.deleteMany({ where: { companyId: id } });

    // Delete criteria (cascades to Criteria via onDelete: Cascade)
    await tx.criteriaCategory.deleteMany({ where: { companyId: id } });

    // Delete amo credentials
    await tx.amoCredential.deleteMany({ where: { companyId: id } });

    // Delete company
    await tx.company.delete({ where: { id } });
  });

  return success(res, { message: "Kompaniya o'chirildi" });
};

// GET /admin/companies/:id
export const getCompanyDetail = async (req: Request, res: Response) => {
  const { id } = req.params;

  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      managers: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          _count: { select: { audioFiles: true } },
        },
      },
      _count: {
        select: {
          managers: true,
          audioFiles: true,
        },
      },
      amocrm: {
        select: { id: true, domain: true },
      },
    },
  });

  if (!company) {
    return error(res, "Kompaniya topilmadi", 404);
  }

  const analysisCount = await prisma.analysis.count({
    where: { audioFile: { companyId: id } },
  });

  const managers = company.managers.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    isActive: m.isActive,
    audioCount: m._count.audioFiles,
  }));

  return success(res, {
    id: company.id,
    name: company.name,
    username: company.username,
    plan: company.plan,
    totalLimitHours: company.totalLimitHours,
    isActive: company.isActive,
    managerLimit: company.managerLimit,
    audioLimitPerManager: company.audioLimitPerManager,
    telegramId: company.telegramId,
    telegramEnabled: company.telegramEnabled,
    sendEachAnalysis: company.sendEachAnalysis,
    dailySummaryEnabled: company.dailySummaryEnabled,
    createdAt: company.createdAt,
    managers,
    managersCount: company._count.managers,
    audioCount: company._count.audioFiles,
    analysisCount,
    amocrm: company.amocrm || null,
    amocrmConnected: !!company.amocrm,
  });
};

// POST /admin/companies/:id/amocrm
export const setAmoCrmCredentials = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { domain, clientId, clientSecret, redirectUri, authorizationCode, accessToken, refreshToken } = req.body;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    return error(res, "Kompaniya topilmadi", 404);
  }

  if (!domain) {
    return error(res, "Domain kiritilishi kerak", 400);
  }

  let finalAccessToken = accessToken;
  let finalRefreshToken = refreshToken;
  let expiresAt = new Date(Date.now() + 86400 * 1000); // default 1 day

  if (authorizationCode) {
    try {
      const tokenResponse = await axios.post(`https://${domain}/oauth2/access_token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: redirectUri,
      });

      finalAccessToken = tokenResponse.data.access_token;
      finalRefreshToken = tokenResponse.data.refresh_token;
      expiresAt = new Date(Date.now() + tokenResponse.data.expires_in * 1000);
    } catch (err: any) {
      const message = err.response?.data?.detail || "AmoCRM token olishda xatolik";
      return error(res, message, 400);
    }
  }

  if (!finalAccessToken || !finalRefreshToken) {
    return error(res, "Access token va refresh token kiritilishi kerak", 400);
  }

  const credentials = await prisma.amoCredential.upsert({
    where: { companyId: id },
    update: {
      domain,
      clientId: clientId || "",
      clientSecret: clientSecret || "",
      redirectUri: redirectUri || "",
      accessToken: finalAccessToken,
      refreshToken: finalRefreshToken,
      expiresAt,
    },
    create: {
      companyId: id,
      domain,
      clientId: clientId || "",
      clientSecret: clientSecret || "",
      redirectUri: redirectUri || "",
      accessToken: finalAccessToken,
      refreshToken: finalRefreshToken,
      expiresAt,
    },
  });

  return success(res, { id: credentials.id, domain: credentials.domain, connected: true });
};
