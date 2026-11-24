// M3 冒烟：录入考试 → 生成复习计划 → 今日任务勾选 → 导图页保存
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.resolve("e2e/artifacts");

function ok(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

function isoDaysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const subject = await (
    await fetch(`${BASE}/api/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E计划-${Date.now()}` }),
    })
  ).json();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  // 1. 录入考试
  await page.goto(`${BASE}/subjects/${subject.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "考试", exact: true }).click();
  await page.getByRole("button", { name: "录入考试" }).click();
  await page.getByPlaceholder("考试名称，例如：高等数学期中").fill("高等数学期中");
  await page.locator('input[type="date"]').fill(isoDaysFromNow(1));
  await page.getByPlaceholder("考试范围（可选）").fill("极限与导数");
  await page.getByRole("button", { name: "保存考试" }).click();
  await page.waitForSelector("text=还剩 1 天");
  ok(true, "考试录入成功并显示倒计时");

  // 2. 生成复习计划
  await page.getByRole("button", { name: "生成复习计划" }).click();
  await page.waitForSelector("text=已生成");
  ok(true, "复习计划生成成功");

  // 3. 复习计划页
  await page.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  const taskCount = await page.locator('input[type="checkbox"]').count();
  ok(taskCount >= 3, `今日任务列表有 ${taskCount} 条任务`);
  await page.locator('input[type="checkbox"]').first().check();
  await page.waitForTimeout(500);
  ok(true, "任务可以勾选完成");
  await page.screenshot({ path: path.join(OUT, "m3-review.png") });

  // 4. 主页统计
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=今日任务");
  ok(await page.locator("text=1 / ").count() > 0, "主页显示今日完成进度");

  // 5. 导图编辑与保存
  const mindmap = await (
    await fetch(`${BASE}/api/subjects/${subject.id}/maps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "极限复习导图" }),
    })
  ).json();

  await page.goto(`${BASE}/maps/${mindmap.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=极限复习导图", { timeout: 15000 });
  ok(true, "导图编辑器渲染出根节点");

  await page.getByRole("button", { name: "保存导图" }).click();
  await page.waitForSelector("text=已保存");
  ok(true, "导图保存成功");
  await page.screenshot({ path: path.join(OUT, "m3-mindmap.png") });

  ok(errors.length === 0, `浏览器无 console 错误${errors.length ? "：" + errors.join(" | ") : ""}`);

  await browser.close();

  // 清理
  await fetch(`${BASE}/api/maps/${mindmap.id}`, { method: "DELETE" });
  const exams = await (await fetch(`${BASE}/api/subjects/${subject.id}/exams`)).json();
  for (const exam of exams) {
    await fetch(`${BASE}/api/exams/${exam.id}`, { method: "DELETE" });
  }
  await fetch(`${BASE}/api/subjects/${subject.id}`, { method: "DELETE" });
  console.log("OK");
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});
