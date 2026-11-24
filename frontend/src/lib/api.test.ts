import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, api, materialsApi, setUnauthorizedHandler } from "./api";

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
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

describe("会话失效", () => {
  it("业务接口返回 401 时通知上层退回登录页", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(
      async () =>
        new Response(JSON.stringify({ detail: "请先登录" }), { status: 401 }),
    );

    await expect(api.get("/subjects")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("登录接口的 401 是密码错误，不触发跳转", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(
      async () =>
        new Response(JSON.stringify({ detail: "用户名或密码不正确" }), {
          status: 401,
        }),
    );

    await expect(
      api.post("/auth/login", { username: "tester", password: "wrong" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("其他错误码不触发跳转", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(
      async () => new Response(JSON.stringify({ detail: "重名" }), { status: 409 }),
    );

    await expect(api.post("/subjects", { name: "x" })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("资料上传", () => {
  it("用 FormData 提交且不设置 JSON 头", async () => {
    const fetchMock = mockFetch(
      async () => new Response(JSON.stringify({ id: 9, kind: "pdf" }), { status: 201 }),
    );

    const file = new File(["%PDF-1.4"], "真题.pdf", { type: "application/pdf" });
    const created = await materialsApi.upload(3, file);

    expect(created).toEqual({ id: 9, kind: "pdf" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/subjects/3/materials");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect(init?.headers).toBeUndefined();
    expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
  });

  it("上传失败会抛出 ApiError", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ detail: "不支持的文件类型：.exe" }), {
          status: 400,
        }),
    );

    const file = new File(["MZ"], "virus.exe");
    await expect(materialsApi.upload(3, file)).rejects.toMatchObject({
      status: 400,
      message: "不支持的文件类型：.exe",
    });
  });
});
