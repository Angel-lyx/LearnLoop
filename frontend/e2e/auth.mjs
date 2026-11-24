// E2E 公共登录：接口脚本与浏览器都要先有会话，否则所有请求都是 401
import { request } from "playwright";

export const ACCOUNT = {
  username: process.env.E2E_USER ?? "e2e-tester",
  password: process.env.E2E_PASSWORD ?? "learnloop-e2e-123",
};

async function ensureAccount(context, base) {
  let response = await context.post(`${base}/api/auth/register`, { data: ACCOUNT });
  if (response.status() === 409) {
    response = await context.post(`${base}/api/auth/login`, { data: ACCOUNT });
  }
  if (!response.ok()) {
    throw new Error(`E2E 登录失败：${response.status()} ${await response.text()}`);
  }
}

/**
 * 登录一次，并给全局 fetch 补上 Cookie。
 * 这样原有脚本里的 `fetch(`${BASE}/api/...`)` 不用改。
 */
export async function loginApi(base) {
  const context = await request.newContext();
  await ensureAccount(context, base);

  const { cookies } = await context.storageState();
  const cookie = cookies.map((item) => `${item.name}=${item.value}`).join("; ");
  const original = globalThis.fetch;

  globalThis.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("cookie", cookie);
    return original(input, { ...init, headers });
  };

  return context;
}

/** 浏览器上下文与接口共用 Cookie 仓库，登录后页面直接进主界面 */
export async function loginBrowser(context, base) {
  await ensureAccount(context.request, base);
}
