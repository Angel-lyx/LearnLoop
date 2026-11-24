import type { AnnotationPage, Material } from "../types";

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

async function upload<T>(path: string, file: File): Promise<T> {
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
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};

export const materialsApi = {
  list: (subjectId: number) => api.get<Material[]>(`/subjects/${subjectId}/materials`),
  get: (materialId: number) => api.get<Material>(`/materials/${materialId}`),
  upload: (subjectId: number, file: File) =>
    upload<Material>(`/subjects/${subjectId}/materials`, file),
  remove: (materialId: number) => api.delete(`/materials/${materialId}`),
  fileUrl: (materialId: number) => `/api/materials/${materialId}/file`,
  annotations: (materialId: number) =>
    api.get<AnnotationPage[]>(`/materials/${materialId}/annotations`),
  saveAnnotations: (materialId: number, page: number, payload: string) =>
    api.put<AnnotationPage>(`/materials/${materialId}/annotations/${page}`, { payload }),
};
