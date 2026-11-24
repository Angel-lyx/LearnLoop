import type {
  AISettings,
  Analysis,
  AnnotationPage,
  Material,
  Mistake,
  Subject,
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

export const settingsApi = {
  read: () => api.get<AISettings>("/settings/ai"),
  saveKey: (apiKey: string) => api.put<AISettings>("/settings/ai", { api_key: apiKey }),
  clearKey: () => api.delete<AISettings>("/settings/ai"),
  test: () => api.post<{ ok: boolean }>("/settings/ai/test", {}),
};

export type { Subject };
