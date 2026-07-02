import api from "./api";
import { API_BASE_URL } from "./apiBase";
import { ApiResponse } from "../types";

export type LessonStatus = "processing" | "ready" | "failed";
export type AiStatus = "not_started" | "in_progress" | "completed";

export interface TestQuestion {
  q: string;
  options: string[];
  correctIdx?: number;
  explanation?: string;
  topicTimestamp?: number;
}

export interface ClientTestQuestion {
  q: string;
  options: string[];
  topicTimestamp?: number;
}

// ─── Kurslar (admin) ─────────────────────────────────────────
export interface CourseSummary {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  moduleCount: number;
  lessonCount: number;
  readyCount: number;
  processingCount: number;
  assignedCount: number;
  totalDurationSec: number;
}

export interface CourseAssignmentItem {
  id: string;
  courseId: string;
  managerId: string;
  assignedById: string | null;
  assignedAt: string;
  dueDate: string | null;
  manager: { id: string; name: string; role: string; photoUrl: string | null };
}

export interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  modules: LessonModuleSummary[];
  assignments: CourseAssignmentItem[];
}

// ─── Kurslar (manager) ───────────────────────────────────────
export interface MyCourseSummary {
  id: string | null; // null = orphan ("kursga tegishli bo'lmagan modullar")
  title: string;
  description: string | null;
  sortOrder: number;
  moduleCount: number;
  lessonCount: number;
  completedCount: number;
  totalDurationSec: number;
}

export interface LessonModuleSummary {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  sortOrder: number;
  createdAt: string;
  lessonCount: number;
  assignedCount: number;
  readyCount: number;
  processingCount: number;
  totalDurationSec: number;
}

export interface LessonModuleDetail {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  sortOrder: number;
  createdAt: string;
  lessons: LessonSummary[];
  assignments: Array<{
    id: string;
    managerId: string;
    assignedAt: string;
    dueDate: string | null;
    manager: { id: string; name: string; role: string; photoUrl: string | null };
  }>;
}

export interface MyModuleSummary {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  sortOrder: number;
  totalDurationSec: number;
  lessonCount: number;
  readyCount: number;
  completedCount: number;
  assignedAt: string;
  dueDate: string | null;
}

export interface LessonSummary {
  id: string;
  title: string;
  description: string | null;
  moduleId: string | null;
  videoDurationSec: number;
  status: LessonStatus;
  processingError: string | null;
  sortOrder: number;
  createdAt: string;
  testCount: number;
  assignedCount: number;
  startedCount: number;
}

export interface LessonDetailAdmin {
  id: string;
  companyId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  videoUrl: string;
  videoDurationSec: number;
  videoSizeBytes: number;
  transcription: string | null;
  testQuestions: TestQuestion[] | null;
  testPassScore: number;
  aiSystemPrompt: string | null;
  aiKeyTopics: string[] | null;
  status: LessonStatus;
  processingError: string | null;
  sortOrder: number;
  createdAt: string;
  assignments: Array<{
    id: string;
    managerId: string;
    assignedAt: string;
    dueDate: string | null;
    manager: { id: string; name: string; role: string; photoUrl: string | null };
  }>;
}

export interface LessonProgressItem {
  videoWatchedSec: number;
  videoMaxSec: number;
  videoCompleted: boolean;
  testAttempts: number;
  testBestScore: number | null;
  testPassed: boolean;
  aiStatus: AiStatus;
  aiScore: number | null;
  aiFeedback: string | null;
  aiStrengths: string[] | null;
  aiWeaknesses: string[] | null;
  finalScore: number | null;
  completedAt: string | null;
}

export interface MyLessonDetail {
  id: string;
  title: string;
  description: string | null;
  moduleId: string | null;
  nextLessonId: string | null;
  isLastInModule: boolean;
  videoDurationSec: number;
  status: LessonStatus;
  sortOrder: number;
  testPassScore: number;
  testCount: number;
  aiKeyTopics: string[] | null;
  locked: boolean;
  progress: LessonProgressItem;
}

export interface MyLessonListItem {
  id: string;
  title: string;
  description: string | null;
  moduleId: string | null;
  videoDurationSec: number;
  status: LessonStatus;
  sortOrder: number;
  testCount: number;
  assignedAt: string;
  dueDate: string | null;
  videoCompleted: boolean;
  testPassed: boolean;
  testBestScore: number | null;
  aiStatus: AiStatus;
  aiScore: number | null;
  finalScore: number | null;
  completedAt: string | null;
  locked: boolean;
}

export interface LessonProgressRow {
  managerId: string;
  managerName: string;
  managerRole: string;
  photoUrl: string | null;
  assignedAt: string;
  dueDate: string | null;
  videoCompleted: boolean;
  testPassed: boolean;
  testBestScore: number | null;
  aiStatus: AiStatus;
  aiScore: number | null;
  finalScore: number | null;
  completedAt: string | null;
}

export interface TestStartResult {
  attemptStartedAt: string;
  orderIdxs: number[];
  optionsOrder: number[][];
  questions: ClientTestQuestion[];
  passScore: number;
}

export interface TestSubmitResult {
  score: number;
  passed: boolean;
  correctCount: number;
  total: number;
  bestScore: number;
  // No-spoil: to'g'ri javob KO'RSATILMAYDI. Faqat correct/incorrect + originalIdx (retry-wrong uchun).
  perQuestion: Array<{
    correct: boolean;
    originalIdx: number;
  }>;
  wrongQuestionIndices: number[];
}

export interface AiChatResult {
  reply: string;
  done: boolean;
}

export interface AiFinishResult {
  aiScore: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
}

export const lessonsService = {
  // ─── Kurslar (admin/ROP/boss) ─────────────────────────────────
  async listCourses(): Promise<CourseSummary[]> {
    const { data } = await api.get<ApiResponse<CourseSummary[]>>("/lessons/courses");
    return data.data;
  },

  async getCourse(id: string): Promise<CourseDetail> {
    const { data } = await api.get<ApiResponse<CourseDetail>>(`/lessons/courses/${id}`);
    return data.data;
  },

  async createCourse(
    title: string,
    description?: string
  ): Promise<{ id: string; title: string; sortOrder: number }> {
    const { data } = await api.post<ApiResponse<{ id: string; title: string; sortOrder: number }>>(
      "/lessons/courses",
      { title, description }
    );
    return data.data;
  },

  async updateCourse(
    id: string,
    patch: Partial<{ title: string; description: string | null; sortOrder: number }>
  ): Promise<{ id: string }> {
    const { data } = await api.patch<ApiResponse<{ id: string }>>(
      `/lessons/courses/${id}`,
      patch
    );
    return data.data;
  },

  async removeCourse(id: string): Promise<void> {
    await api.delete(`/lessons/courses/${id}`);
  },

  // ─── Kursga manager biriktirish (yangi birlamchi yo'l) ─────────
  async listCourseAssignments(id: string): Promise<CourseAssignmentItem[]> {
    const { data } = await api.get<ApiResponse<CourseAssignmentItem[]>>(
      `/lessons/courses/${id}/assignments`
    );
    return data.data;
  },

  async assignCourse(
    id: string,
    managerIds: string[],
    dueDate?: string
  ): Promise<{ assigned: number }> {
    const { data } = await api.post<ApiResponse<{ assigned: number }>>(
      `/lessons/courses/${id}/assign`,
      { managerIds, dueDate }
    );
    return data.data;
  },

  async unassignCourse(id: string, managerId: string): Promise<void> {
    await api.delete(`/lessons/courses/${id}/assign/${managerId}`);
  },

  // ─── Kurslar (manager) ────────────────────────────────────────
  async myCourses(): Promise<MyCourseSummary[]> {
    const { data } = await api.get<ApiResponse<MyCourseSummary[]>>("/my/lessons/courses");
    return data.data;
  },

  // ─── Modullar (admin/ROP/boss) ────────────────────────────────
  async listModules(courseId?: string): Promise<LessonModuleSummary[]> {
    const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
    const { data } = await api.get<ApiResponse<LessonModuleSummary[]>>(`/lessons/modules${qs}`);
    return data.data;
  },

  async getModule(id: string): Promise<LessonModuleDetail> {
    const { data } = await api.get<ApiResponse<LessonModuleDetail>>(`/lessons/modules/${id}`);
    return data.data;
  },

  async createModule(
    title: string,
    description?: string,
    courseId?: string
  ): Promise<{ id: string; title: string; sortOrder: number; courseId: string | null }> {
    const { data } = await api.post<
      ApiResponse<{ id: string; title: string; sortOrder: number; courseId: string | null }>
    >("/lessons/modules", { title, description, courseId });
    return data.data;
  },

  async updateModule(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      sortOrder: number;
      courseId: string | null;
    }>
  ): Promise<{ id: string }> {
    const { data } = await api.patch<ApiResponse<{ id: string }>>(
      `/lessons/modules/${id}`,
      patch
    );
    return data.data;
  },

  async removeModule(id: string): Promise<void> {
    await api.delete(`/lessons/modules/${id}`);
  },

  async assignModule(
    id: string,
    managerIds: string[],
    dueDate?: string
  ): Promise<{ assigned: number }> {
    const { data } = await api.post<ApiResponse<{ assigned: number }>>(
      `/lessons/modules/${id}/assign`,
      { managerIds, dueDate }
    );
    return data.data;
  },

  async unassignModule(id: string, managerId: string): Promise<void> {
    await api.delete(`/lessons/modules/${id}/assign/${managerId}`);
  },

  // ─── Manager tomon modullar ───────────────────────────────────
  async myModules(courseId?: string): Promise<MyModuleSummary[]> {
    const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
    const { data } = await api.get<ApiResponse<MyModuleSummary[]>>(`/my/lessons/modules${qs}`);
    return data.data;
  },

  // ─── Darslar (admin/ROP/boss) ────────────────────────────────
  async list(moduleId?: string): Promise<LessonSummary[]> {
    const qs = moduleId ? `?moduleId=${encodeURIComponent(moduleId)}` : "";
    const { data } = await api.get<ApiResponse<LessonSummary[]>>(`/lessons${qs}`);
    return data.data;
  },

  async get(id: string): Promise<LessonDetailAdmin> {
    const { data } = await api.get<ApiResponse<LessonDetailAdmin>>(`/lessons/${id}`);
    return data.data;
  },

  async create(
    file: File,
    title: string,
    description?: string,
    moduleId?: string,
    onProgress?: (pct: number) => void
  ): Promise<{ id: string; status: LessonStatus }> {
    const formData = new FormData();
    formData.append("video", file);
    formData.append("title", title);
    if (description) formData.append("description", description);
    if (moduleId) formData.append("moduleId", moduleId);
    const { data } = await api.post<ApiResponse<{ id: string; status: LessonStatus }>>(
      "/lessons",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }
    );
    return data.data;
  },

  async update(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      testQuestions: TestQuestion[];
      aiSystemPrompt: string;
      aiKeyTopics: string[];
      sortOrder: number;
    }>
  ): Promise<{ id: string }> {
    const { data } = await api.patch<ApiResponse<{ id: string }>>(`/lessons/${id}`, patch);
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/lessons/${id}`);
  },

  async reprocess(id: string): Promise<void> {
    await api.post(`/lessons/${id}/reprocess`);
  },

  async replaceVideo(
    id: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ status: string }> {
    const formData = new FormData();
    formData.append("video", file);
    const { data } = await api.post<ApiResponse<{ status: string }>>(
      `/lessons/${id}/replace-video`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }
    );
    return data.data;
  },

  async assign(id: string, managerIds: string[], dueDate?: string): Promise<{ assigned: number }> {
    const { data } = await api.post<ApiResponse<{ assigned: number }>>(
      `/lessons/${id}/assign`,
      { managerIds, dueDate }
    );
    return data.data;
  },

  async unassign(id: string, managerId: string): Promise<void> {
    await api.delete(`/lessons/${id}/assign/${managerId}`);
  },

  async progress(id: string): Promise<{ lesson: any; rows: LessonProgressRow[] }> {
    const { data } = await api.get<ApiResponse<{ lesson: any; rows: LessonProgressRow[] }>>(
      `/lessons/${id}/progress`
    );
    return data.data;
  },

  // Manager side
  async myList(moduleId?: string): Promise<MyLessonListItem[]> {
    const qs = moduleId ? `?moduleId=${encodeURIComponent(moduleId)}` : "";
    const { data } = await api.get<ApiResponse<MyLessonListItem[]>>(`/my/lessons${qs}`);
    return data.data;
  },

  async myGet(id: string): Promise<MyLessonDetail> {
    const { data } = await api.get<ApiResponse<MyLessonDetail>>(`/my/lessons/${id}`);
    return data.data;
  },

  async videoProgress(id: string, watchedSec: number, maxSec: number): Promise<void> {
    await api.post(`/my/lessons/${id}/video-progress`, { watchedSec, maxSec });
  },

  async testStart(id: string): Promise<TestStartResult> {
    const { data } = await api.post<ApiResponse<TestStartResult>>(`/my/lessons/${id}/test-start`);
    return data.data;
  },

  async testRetryWrong(id: string, wrongQuestionIndices: number[]): Promise<TestStartResult> {
    const { data } = await api.post<ApiResponse<TestStartResult>>(
      `/my/lessons/${id}/test-retry-wrong`,
      { wrongQuestionIndices }
    );
    return data.data;
  },

  async testSubmit(
    id: string,
    orderIdxs: number[],
    optionsOrder: number[][],
    answers: number[]
  ): Promise<TestSubmitResult> {
    const { data } = await api.post<ApiResponse<TestSubmitResult>>(
      `/my/lessons/${id}/test-submit`,
      { orderIdxs, optionsOrder, answers }
    );
    return data.data;
  },

  async aiChat(id: string, message?: string): Promise<AiChatResult> {
    const { data } = await api.post<ApiResponse<AiChatResult>>(
      `/my/lessons/${id}/ai-chat`,
      { message }
    );
    return data.data;
  },

  async aiFinish(id: string): Promise<AiFinishResult> {
    const { data } = await api.post<ApiResponse<AiFinishResult>>(`/my/lessons/${id}/ai-finish`);
    return data.data;
  },

  videoStreamUrl(id: string, token: string): string {
    return `${API_BASE_URL}/my/lessons/${id}/video-stream?token=${encodeURIComponent(token)}`;
  },

  adminVideoStreamUrl(id: string, token: string): string {
    return `${API_BASE_URL}/lessons/${id}/video-stream?token=${encodeURIComponent(token)}`;
  },

  async allManagerStats(): Promise<{
    managers: Array<{
      managerId: string;
      name: string;
      role: string;
      photoUrl: string | null;
      assignedCount: number;
      completedCount: number;
      videoCompletedCount: number;
      testPassedCount: number;
      aiCompletedCount: number;
      avgFinalScore: number;
      avgTestScore: number;
      avgAiScore: number;
      watchedSec: number;
      lastActivityAt: string | null;
    }>;
    overall: {
      totalManagers: number;
      activeManagers: number;
      avgCompletionRate: number;
    };
  }> {
    const { data } = await api.get<ApiResponse<any>>(`/lessons/managers/all-stats`);
    return data.data;
  },

  async managerStats(managerId: string): Promise<{
    manager: { id: string; name: string; role: string; photoUrl: string | null };
    summary: { total: number; completed: number; avgFinalScore: number };
    lessons: Array<{
      lessonId: string;
      title: string;
      videoDurationSec: number;
      sortOrder: number;
      status: LessonStatus;
      videoCompleted: boolean;
      testPassed: boolean;
      testBestScore: number | null;
      aiStatus: AiStatus;
      aiScore: number | null;
      finalScore: number | null;
      completedAt: string | null;
    }>;
  }> {
    const { data } = await api.get<ApiResponse<any>>(`/lessons/manager/${managerId}/stats`);
    return data.data;
  },
};
