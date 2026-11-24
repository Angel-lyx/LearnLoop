import type {
  AISettings,
  Analysis,
  AnnotationPage,
  BonusItem,
  Course,
  Dimension,
  Exam,
  Material,
  MindMapDoc,
  Mistake,
  ResearchOverview,
  ScoreRule,
  Subject,
  Task,
} from "../types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let detail = response.statusText || "请求失败";
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail;
  } catch {
    // 响应体不是 JSON 时沿用状态文本
  }
  return new ApiError(response.status, detail);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api${path}`, { method: "POST", body: form });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};

export const materialsApi = {
  list: (subjectId: number) => api.get<Material[]>(`/subjects/${subjectId}/materials`),
  get: (materialId: number) => api.get<Material>(`/materials/${materialId}`),
  upload: (subjectId: number, file: File) =>
    postFile<Material>(`/subjects/${subjectId}/materials`, file),
  remove: (materialId: number) => api.delete(`/materials/${materialId}`),
  fileUrl: (materialId: number) => `/api/materials/${materialId}/file`,
  annotations: (materialId: number) =>
    api.get<AnnotationPage[]>(`/materials/${materialId}/annotations`),
  saveAnnotations: (materialId: number, page: number, payload: string) =>
    api.put<AnnotationPage>(`/materials/${materialId}/annotations/${page}`, { payload }),
};

export const mistakesApi = {
  list: (subjectId: number, status?: string) =>
    api.get<Mistake[]>(
      `/subjects/${subjectId}/mistakes${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  get: (mistakeId: number) => api.get<Mistake>(`/mistakes/${mistakeId}`),
  create: (subjectId: number, payload: unknown) =>
    api.post<Mistake>(`/subjects/${subjectId}/mistakes`, payload),
  update: (mistakeId: number, payload: unknown) =>
    api.patch<Mistake>(`/mistakes/${mistakeId}`, payload),
  remove: (mistakeId: number) => api.delete(`/mistakes/${mistakeId}`),
};

export const aiApi = {
  analyze: (question: string, answer = "") =>
    api.post<Analysis>("/ai/analyze", { question, answer }),
  transcribe: (file: File) => postFile<{ text: string }>("/ai/transcribe", file),
};

export const examsApi = {
  all: () => api.get<Exam[]>("/exams"),
  list: (subjectId: number) => api.get<Exam[]>(`/subjects/${subjectId}/exams`),
  create: (subjectId: number, payload: { title: string; exam_date: string; scope: string }) =>
    api.post<Exam>(`/subjects/${subjectId}/exams`, payload),
  remove: (examId: number) => api.delete(`/exams/${examId}`),
  plan: (examId: number) => api.post<Task[]>(`/exams/${examId}/plan`, {}),
};

export const tasksApi = {
  today: (day?: string) =>
    api.get<Task[]>(`/tasks${day ? `?day=${encodeURIComponent(day)}` : ""}`),
  create: (payload: { title: string; due_date: string; subject_id?: number }) =>
    api.post<Task>("/tasks", payload),
  update: (taskId: number, payload: { done?: boolean; title?: string }) =>
    api.patch<Task>(`/tasks/${taskId}`, payload),
  remove: (taskId: number) => api.delete(`/tasks/${taskId}`),
};

export const mapsApi = {
  list: (subjectId: number) => api.get<MindMapDoc[]>(`/subjects/${subjectId}/maps`),
  create: (subjectId: number, title: string) =>
    api.post<MindMapDoc>(`/subjects/${subjectId}/maps`, { title }),
  get: (mapId: number) => api.get<MindMapDoc>(`/maps/${mapId}`),
  update: (mapId: number, payload: { title?: string; data?: unknown }) =>
    api.patch<MindMapDoc>(`/maps/${mapId}`, payload),
  remove: (mapId: number) => api.delete(`/maps/${mapId}`),
  generate: (subjectId: number) =>
    api.post<MindMapDoc>(`/subjects/${subjectId}/maps/generate`, {}),
};

export const researchApi = {
  courses: () => api.get<Course[]>("/research/courses"),
  addCourse: (payload: Omit<Course, "id">) =>
    api.post<Course>("/research/courses", payload),
  removeCourse: (courseId: number) => api.delete(`/research/courses/${courseId}`),
  rules: () => api.get<ScoreRule[]>("/research/rules"),
  addRule: (payload: { dimension: Dimension; name: string; score: number }) =>
    api.post<ScoreRule>("/research/rules", payload),
  removeRule: (ruleId: number) => api.delete(`/research/rules/${ruleId}`),
  parseRules: (text: string) =>
    api.post<RuleDraft[]>("/research/rules/parse", { text }),
  parseRulesFile: (file: File) =>
    postFile<RuleDraft[]>("/research/rules/parse-file", file),
  parseBonusFile: (file: File) =>
    postFile<RuleDraft[]>("/research/bonus/parse-file", file),
  parseCourses: (text: string) =>
    api.post<CourseDraft[]>("/research/courses/parse", { text }),
  parseCoursesFile: (file: File) =>
    postFile<CourseDraft[]>("/research/courses/parse-file", file),
  bonus: () => api.get<BonusItem[]>("/research/bonus"),
  addBonus: (payload: { dimension: Dimension; title: string; score: number }) =>
    api.post<BonusItem>("/research/bonus", payload),
  removeBonus: (bonusId: number) => api.delete(`/research/bonus/${bonusId}`),
  weights: () => api.get<{ course_weight: number }>("/research/weights"),
  saveWeights: (courseWeight: number) =>
    api.put<{ course_weight: number }>("/research/weights", {
      course_weight: courseWeight,
    }),
  overview: () => api.get<ResearchOverview>("/research/overview"),
};

export interface RuleDraft {
  dimension: Dimension;
  name: string;
  score: number;
}

export interface CourseDraft {
  name: string;
  credits: number;
  score: number;
  category: "required" | "elective";
}

export interface SearchResult {
  subjects: { id: number; name: string; color: string }[];
  materials: { id: number; title: string; subject_id: number; kind: string }[];
  mistakes: { id: number; question: string; subject_id: number; status: string }[];
  maps: { id: number; title: string; subject_id: number }[];
}

export const searchApi = {
  query: (keyword: string) =>
    api.get<SearchResult>(`/search?q=${encodeURIComponent(keyword)}`),
};

export const backupApi = {
  exportUrl: "/api/backup/export",
  import: (file: File) =>
    postFile<{ ok: number; uploads: number }>("/backup/import", file),
};

export const settingsApi = {
  read: () => api.get<AISettings>("/settings/ai"),
  saveKey: (apiKey: string) => api.put<AISettings>("/settings/ai", { api_key: apiKey }),
  clearKey: () => api.delete<AISettings>("/settings/ai"),
  test: () => api.post<{ ok: boolean }>("/settings/ai/test", {}),
};

export type { Subject };
