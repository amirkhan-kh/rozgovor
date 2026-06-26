import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import managersRoutes from "./routes/managers";
import criteriaRoutes from "./routes/criteria";
import profileRoutes from "./routes/profile";
import productsRoutes from "./routes/products";
import audioRoutes from "./routes/audio";
import publicRoutes from "./routes/public";
import amocrmRoutes from "./routes/amocrm";
import dashboardRoutes from "./routes/dashboard";
import ratingRoutes from "./routes/rating";
import summariesRoutes from "./routes/summaries";
import voronkaRoutes from "./routes/voronka";
import plansRoutes from "./routes/plans";
import coachRoutes from "./routes/coach";
import pipelineMappingRoutes from "./routes/pipeline-mapping";
import voiceExamRoutes from "./routes/voice-exam";
import voiceTestRoutes from "./routes/voice-test";
import examStatsRoutes from "./routes/exam-stats";
import featurePermissionsRoutes from "./routes/feature-permissions";
// import adminRoutes from "./routes/admin"; // Super admin — keyinroq
import funnelRoutes from "./routes/funnel";
import leadsRoutes from "./routes/leads";
import knowledgeRoutes from "./routes/knowledge";
import playlistsRoutes from "./routes/playlists";
import searchRoutes from "./routes/search";
import salesRoutes from "./routes/sales";
import analyticsRoutes from "./routes/analytics";
import auditRoutes from "./routes/audit";
import clientsRoutes from "./routes/clients";
import scenariosRoutes from "./routes/scenarios";
import agentsRoutes from "./routes/agents";
import lessonsRoutes from "./routes/lessons";
import myLessonsRoutes from "./routes/my-lessons";
import permissionsRoutes from "./routes/permissions";
import custdevRoutes from "./routes/custdev";
import activitiesRoutes from "./routes/activities";
import departmentsRoutes from "./routes/departments";
import managerVideosRoutes from "./routes/manager-videos";
import certificatesRoutes from "./routes/certificates";
import webhooksRoutes from "./routes/webhooks";
import legalRoutes from "./routes/legal";
import announcementsRoutes from "./routes/announcements";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://localhost:5173",
      "https://salesaiasosit.vercel.app",
    ];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Barcha originlarga ruxsat
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/managers", managersRoutes);
app.use("/api/criteria", criteriaRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/amocrm", amocrmRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/rating", ratingRoutes);
app.use("/api/summaries", summariesRoutes);
app.use("/api/voronka", voronkaRoutes);
app.use("/api/plans", plansRoutes);
app.use("/api/coach", coachRoutes);
app.use("/api/pipeline-mapping", pipelineMappingRoutes);
app.use("/api/voice-exam", voiceExamRoutes);
app.use("/api/voice-test", voiceTestRoutes);
app.use("/api/funnel", funnelRoutes);
app.use("/api/leads", leadsRoutes);
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/scenarios", scenariosRoutes);
app.use("/api/exam-stats", examStatsRoutes);
app.use("/api/feature-permissions", featurePermissionsRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/lessons", lessonsRoutes);
app.use("/api/my/lessons", myLessonsRoutes);
app.use("/api/permissions", permissionsRoutes);
app.use("/api/custdev", custdevRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/departments", departmentsRoutes);
// Wave 4 — Manager Celebration Videos (VEO 3 + ffmpeg music mix).
// Ikki namespace ichida: /api/managers/:id/... va /api/manager-videos/:videoId/...
app.use("/api/webhooks", webhooksRoutes);
app.use("/api", managerVideosRoutes);
app.use("/api/certificates", certificatesRoutes);
app.use("/api/legal", legalRoutes);
app.use("/api/announcements", announcementsRoutes);
// app.use("/api/admin", adminRoutes); // Super admin — keyinroq

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Celebration videos — statik fayl
// eslint-disable-next-line @typescript-eslint/no-var-requires
app.use("/videos", express.static(require("path").join(__dirname, "../public/videos"), { maxAge: "1d" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export default app;
