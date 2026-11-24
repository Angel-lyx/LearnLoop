// M2 冒烟：设置页填 Key → 学科错题页新增错题（图片识别 + AI 分析）→ 标记掌握 → 删除
// 前置：start backend(8000) / frontend(5173)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loginApi, loginBrowser } from "./auth.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.resolve("e2e/artifacts");

const ANALYSIS = {
  error_analysis: "把 0/0 型极限直接代入，忽略了等价无穷小替换的条件",
  solution: "sin(x)~x，因此 lim(x->0) sin(x)/x = 1",
  knowledge_points: ["极限", "等价无穷小"],
  variants: [
    { question: "求 lim(x->0) tan(x)/x", answer: "1" },
    { question: "求 lim(x->0) (1-cos x)/x^2", answer: "1/2" },
  ],
};

function ok(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await loginApi(BASE);

  const subject = await (
    await fetch(`${BASE}/api/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E错题-${Date.now()}` }),
    })
  ).json();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  await loginBrowser(page.context(), BASE);
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // 用路由拦截模拟大模型，避免真实计费
  await page.route("**/api/ai/analyze", (route) =>
    route.fulfill({ json: ANALYSIS, status: 200 }),
  );
  await page.route("**/api/ai/transcribe", (route) =>
    route.fulfill({ json: { text: "1. 求 lim(x->0) sin(x)/x" }, status: 200 }),
  );
  await page.route("**/api/settings/ai/test", (route) =>
    route.fulfill({ json: { ok: true }, status: 200 }),
  );

  // 1. 设置页（若用户已经配置了真实 Key，则跳过这一段，绝不覆盖用户密钥）
  const aiState = await (await fetch(`${BASE}/api/settings/ai`)).json();
  const keyWasConfigured = Boolean(aiState.configured);
  if (!keyWasConfigured) {
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("sk-...").fill("sk-e2e-dummy-1234567890");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.waitForSelector("text=已配置");
    ok(true, "设置页保存 API Key 后显示已配置");

    await page.getByRole("button", { name: "测试连接" }).click();
    await page.waitForSelector("text=连接成功");
    ok(true, "测试连接返回成功");
  } else {
    console.log("SKIP 已存在真实 API Key，跳过设置页测试（避免覆盖）");
  }

  // 2. 错题页
  await page.goto(`${BASE}/subjects/${subject.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "错题", exact: true }).click();
  await page.getByRole("button", { name: "新增错题" }).click();

  const fileInput = page.locator('input[type="file"]').last();
  await fileInput.setInputFiles({
    name: "题目.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake-png-bytes"),
  });
  await page.waitForFunction(
    () => (document.querySelector("textarea")?.value ?? "").includes("sin(x)/x"),
    { timeout: 10000 },
  );
  ok(true, "图片识别结果自动填入题干");

  await page.getByRole("button", { name: /AI 分析/ }).click();
  await page.waitForSelector("text=错误分析");
  ok(await page.locator("text=等价无穷小替换的条件").count() > 0, "AI 分析结果已展示");

  await page.getByRole("button", { name: "保存错题" }).click();
  await page.waitForSelector("text=未掌握");
  ok(true, "错题保存后出现在列表");

  await page.screenshot({ path: path.join(OUT, "m2-mistake-list.png") });

  await page.getByRole("button", { name: "查看" }).first().click();
  ok(await page.locator("text=同类变式题").count() > 0, "展开后可见变式题");
  await page.screenshot({ path: path.join(OUT, "m2-mistake-detail.png") });

  await page.getByRole("button", { name: "标记已掌握" }).click();
  await page.waitForSelector("text=已掌握");
  ok(true, "可以标记为已掌握");

  const listed = await (
    await fetch(`${BASE}/api/subjects/${subject.id}/mistakes`)
  ).json();
  ok(listed.length === 1 && listed[0].status === "mastered", "状态已持久化到后端");

  ok(errors.length === 0, `浏览器无 console 错误${errors.length ? "：" + errors.join(" | ") : ""}`);

  await browser.close();

  // 清理：删错题、学科、以及测试写入的 Key
  await fetch(`${BASE}/api/mistakes/${listed[0].id}`, { method: "DELETE" });
  await fetch(`${BASE}/api/subjects/${subject.id}`, { method: "DELETE" });
  if (!keyWasConfigured) {
    await fetch(`${BASE}/api/settings/ai`, { method: "DELETE" });
  }
  console.log("OK");
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});
