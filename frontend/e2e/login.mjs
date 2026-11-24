// 账号冒烟：注册 → 刷新仍在线 → 退出 → 错误密码 → 正确登录 → 深链接直接打开
// 用法：先启动服务（pnpm dev 或 uvicorn 托管 dist），再 node e2e/login.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.resolve("e2e/artifacts");
const ACCOUNT = {
  username: `e2e-ui-${Date.now()}`,
  password: "learnloop-ui-123",
};

function ok(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

const USERNAME_INPUT = "3–40 位，中文或字母数字";

async function submit(page) {
  await page.locator('button[type="submit"]').click();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. 未登录访问首页应该停在登录页
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(`input[placeholder="${USERNAME_INPUT}"]`);
  ok(true, "未登录时展示登录页");

  // 2. 注册第一个账号
  await page.getByRole("button", { name: "注册" }).click();
  await page.fill(`input[placeholder="${USERNAME_INPUT}"]`, ACCOUNT.username);
  await page.fill('input[placeholder="至少 8 位"]', ACCOUNT.password);
  await page.fill('input[placeholder="再输入一次"]', ACCOUNT.password);
  await submit(page);

  await page.waitForSelector("text=学习 → 批注 → 错题 → 复习 → 保研", { timeout: 15000 });
  ok(true, "注册后进入主界面");

  // 3. 刷新后仍在登录态（Cookie 生效）
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=学习 → 批注 → 错题 → 复习 → 保研", { timeout: 15000 });
  ok(true, "刷新后登录态保持");

  // 4. 退出登录
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForSelector(`input[placeholder="${USERNAME_INPUT}"]`, { timeout: 15000 });
  ok(true, "退出登录后回到登录页");

  // 5. 错误密码
  await page.fill(`input[placeholder="${USERNAME_INPUT}"]`, ACCOUNT.username);
  await page.fill('input[placeholder="输入密码"]', "wrong-password");
  await submit(page);
  await page.waitForSelector("text=用户名或密码不正确", { timeout: 15000 });
  ok(true, "错误密码有提示且不进入主界面");

  // 6. 正确密码
  await page.fill('input[placeholder="输入密码"]', ACCOUNT.password);
  await submit(page);
  await page.waitForSelector("text=学习 → 批注 → 错题 → 复习 → 保研", { timeout: 15000 });
  ok(true, "正确密码登录成功");

  // 7. 深链接直接打开（部署形态下由后端回退到 index.html）
  await page.goto(`${BASE}/subjects`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=学习 → 批注 → 错题 → 复习 → 保研", { timeout: 15000 });
  ok(true, "直接访问 /subjects 不会 404");

  await page.screenshot({ path: path.join(OUT, "login-flow.png"), fullPage: false });
  await browser.close();
  console.log(`\n账号流程通过，截图：${path.join(OUT, "login-flow.png")}`);
}

main().catch((error) => {
  console.error("FAILED:", error.message);
  process.exit(1);
});
