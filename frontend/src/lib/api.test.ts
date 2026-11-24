import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api";

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api 请求封装", () => {
  it("GET 会拼上 /api 前缀并解析 JSON", async () => {
    const fetchMock = mockFetch(async () =>
      new Response(JSON.stringify({ id: 1, name: "高等数学" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await api.get<{ id: number; name: string }>("/subjects/1");

    expect(result).toEqual({ id: 1, name: "高等数学" });
    expect(fetchMock).toHaveBeenCalledWith("/api/subjects/1", expect.any(Object));
  });

  it("POST 会序列化请求体并带上 JSON 头", async () => {
    const fetchMock = mockFetch(async () =>
      new Response(JSON.stringify({ id: 2 }), { status: 201 }),
    );

    await api.post("/subjects", { name: "线性代数" });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "线性代数" }));
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("非 2xx 抛出 ApiError，并带上后端 detail", async () => {
    mockFetch(async () =>
      new Response(JSON.stringify({ detail: "学科名称已存在" }), { status: 409 }),
    );

    await expect(api.post("/subjects", { name: "重复" })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      message: "学科名称已存在",
    });
  });

  it("响应体不是 JSON 时用状态文本兜底", async () => {
    mockFetch(async () => new Response("boom", { status: 500, statusText: "Server Error" }));

    const error = await api.get("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Server Error");
  });

  it("204 响应返回 undefined 而不是解析 JSON", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(api.delete("/subjects/1")).resolves.toBeUndefined();
  });
});
