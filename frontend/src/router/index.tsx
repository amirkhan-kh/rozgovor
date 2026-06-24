import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../store/authStore";
import MainLayout from "../components/layout/MainLayout";
import LoginPage from "../pages/auth/LoginPage";
import Skeleton from "../components/ui/Skeleton";

// Default landing: Sotuv (admin/ROP), Audio (sotuvchi)
const RoleBasedIndex: React.FC = () => {
  const { userRole, managerUser } = useAuth();
  const role = userRole === "company" ? "admin" : (managerUser?.role || "sotuvchi");
  if (role === "sotuvchi") return <Navigate to="/audio" replace />;
  return <Navigate to="/sales" replace />;
};

// Direct imports — no lazy loading, no double skeleton
import SalesPage from "../pages/sales/SalesPage";
import SalesLeadsListPage from "../pages/sales/SalesLeadsListPage";
import SalesTasksListPage from "../pages/sales/SalesTasksListPage";
import AuditPage from "../pages/audit/AuditPage";
import ClientsPage from "../pages/clients/ClientsPage";
import ClientDetailPage from "../pages/clients/ClientDetailPage";
import RatingPage from "../pages/rating/RatingPage";
import SummariesPage from "../pages/summaries/SummariesPage";
import AudioFilesPage from "../pages/audio/AudioFilesPage";
import AudioUploadPage from "../pages/audio/AudioUploadPage";
import AudioDetailPage from "../pages/audio/AudioDetailPage";
import PublicAudioPage from "../pages/audio/PublicAudioPage";
import PublicTranscriptionPage from "../pages/audio/PublicTranscriptionPage";
import TranscriptionPage from "../pages/audio/TranscriptionPage";
import ProfilePage from "../pages/profile/ProfilePage";
import AnnouncementsPage from "../pages/announcements/AnnouncementsPage";
import ManagersPage from "../pages/managers/ManagersPage";
import ManagerDetailPage from "../pages/managers/ManagerDetailPage";
import CreateManagerPage from "../pages/managers/CreateManagerPage";
import EditManagerPage from "../pages/managers/EditManagerPage";
import PracticePage from "../pages/practice/PracticePage";
import BenchmarkPage from "../pages/benchmark/BenchmarkPage";
import RivalsPage from "../pages/rivals/RivalsPage";
import DesignSystemPage from "../pages/design-system/DesignSystemPage";
import ScriptsPage from "../pages/scripts/ScriptsPage";
import ScenarioPage from "../pages/scenario/ScenarioPage";
import VoronkalarPage from "../pages/voronka/VoronkalarPage";
import VoronkaDetailPage from "../pages/voronka/VoronkaDetailPage";
import ProductsPage from "../pages/products/ProductsPage";
import ProductDetailPage from "../pages/products/ProductDetailPage";
import CoachPage from "../pages/coach/CoachPage";
import ExamHomePage from "../pages/exam/ExamHomePage";
import ExamSessionPage from "../pages/exam/ExamSessionPage";
import ExamResultPage from "../pages/exam/ExamResultPage";
// Bosqich 2+3 yangi sahifalar
import LeadJourneyPage from "../pages/leads/LeadJourneyPage";
import ObjectionLibraryPage from "../pages/knowledge/ObjectionLibraryPage";
import TrackersPage from "../pages/knowledge/TrackersPage";
import PlaylistsPage from "../pages/playlists/PlaylistsPage";
import SearchPage from "../pages/search/SearchPage";
import AdminLessonsPage from "../pages/lessons/AdminLessonsPage";
import AdminLessonUploadPage from "../pages/lessons/AdminLessonUploadPage";
import AdminLessonDetailPage from "../pages/lessons/AdminLessonDetailPage";
import AdminModuleDetailPage from "../pages/lessons/AdminModuleDetailPage";
import AdminCourseDetailPage from "../pages/lessons/AdminCourseDetailPage";
import LessonsManagerDetailPage from "../pages/lessons/LessonsManagerDetailPage";
import LessonsMapPage from "../pages/lessons/LessonsMapPage";
import LessonDetailPage from "../pages/lessons/LessonDetailPage";
import ManagerModuleMapPage from "../pages/lessons/ManagerModuleMapPage";
import ManagerCourseModulesPage from "../pages/lessons/ManagerCourseModulesPage";
import ActivitiesPage from "../pages/activities/ActivitiesPage";
import CustdevListPage from "../pages/custdev/CustdevListPage";
import CustdevDetailPage from "../pages/custdev/CustdevDetailPage";
import CustdevInterviewPage from "../pages/custdev/CustdevInterviewPage";
import ManagerVideoDetailPage from "../pages/videos/ManagerVideoDetailPage";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <Skeleton className="w-12 h-12" rounded="xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <Skeleton className="w-12 h-12" rounded="xl" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />

        {/* Public share link — auth talab qilmaydi */}
        <Route path="/shared/audio/:token" element={<PublicAudioPage />} />
        <Route path="/shared/audio/:token/transcription" element={<PublicTranscriptionPage />} />

        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<RoleBasedIndex />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="sales/leads/:kind" element={<SalesLeadsListPage />} />
          <Route path="sales/tasks/:kind" element={<SalesTasksListPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="rating" element={<RatingPage />} />
          <Route path="summaries" element={<SummariesPage />} />
          <Route path="audio" element={<AudioFilesPage />} />
          <Route path="audio/upload" element={<AudioUploadPage />} />
          <Route path="audio/:id" element={<AudioDetailPage />} />
          <Route path="audio/:id/transcription" element={<TranscriptionPage />} />
          <Route path="scripts" element={<ScriptsPage />} />
          <Route path="scenario" element={<ScenarioPage />} />
          <Route path="managers" element={<ManagersPage />} />
          <Route path="managers/create" element={<CreateManagerPage />} />
          <Route path="managers/:id/edit" element={<EditManagerPage />} />
          <Route path="managers/:id" element={<ManagerDetailPage />} />
          <Route path="practice/:managerId" element={<PracticePage />} />
          <Route path="benchmark" element={<BenchmarkPage />} />
          <Route path="rivals" element={<RivalsPage />} />
          <Route path="design-system" element={<DesignSystemPage />} />
          <Route path="voronka" element={<VoronkalarPage />} />
          <Route path="voronka/:name" element={<VoronkaDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="exam" element={<ExamHomePage />} />
          <Route path="exam/result/:id" element={<ExamResultPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />

          {/* Bosqich 2+3 */}
          <Route path="leads/:leadId" element={<LeadJourneyPage />} />
          <Route path="knowledge/objections" element={<ObjectionLibraryPage />} />
          <Route path="knowledge/trackers" element={<TrackersPage />} />
          <Route path="playlists" element={<PlaylistsPage />} />
          <Route path="search" element={<SearchPage />} />

          {/* Darsliklar — 3 qatlam: Kurs → Modul → Darslar */}
          <Route path="admin/lessons" element={<AdminLessonsPage />} />
          <Route path="admin/lessons/new" element={<AdminLessonUploadPage />} />
          <Route path="admin/lessons/courses/:id" element={<AdminCourseDetailPage />} />
          <Route path="admin/lessons/modules/:id" element={<AdminModuleDetailPage />} />
          <Route path="admin/lessons/managers/:managerId" element={<LessonsManagerDetailPage />} />
          <Route path="admin/lessons/:id" element={<AdminLessonDetailPage />} />
          <Route path="lessons" element={<LessonsMapPage />} />
          <Route path="lessons/courses/:courseId" element={<ManagerCourseModulesPage />} />
          <Route path="lessons/modules/:moduleId" element={<ManagerModuleMapPage />} />
          <Route path="lessons/:id" element={<LessonDetailPage />} />

          {/* Activities — Zadachalar */}
          <Route path="activities" element={<ActivitiesPage />} />

          {/* Manager celebration videos — detail + editor */}
          <Route path="manager-videos/:videoId" element={<ManagerVideoDetailPage />} />

          {/* Custdev */}
          <Route path="custdev" element={<CustdevListPage />} />
          <Route path="custdev/:id" element={<CustdevDetailPage />} />
          <Route
            path="custdev/:id/interviews/:iid"
            element={<CustdevInterviewPage />}
          />
        </Route>

        {/* Exam session — fullscreen, MainLayout'siz */}
        <Route
          path="/exam/session/:id"
          element={
            <ProtectedRoute>
              <ExamSessionPage />
            </ProtectedRoute>
          }
        />

        {/* AI Chat — alohida fullscreen sahifa */}
        <Route
          path="/coach"
          element={
            <ProtectedRoute>
              <CoachPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;
