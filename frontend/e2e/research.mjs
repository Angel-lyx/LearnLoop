// M4 冒烟：必修成绩 → 综测加分 → 细则解析导入 → 综合成绩合成
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.resolve("e2e/artifacts");

function ok(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

async function resetData() {
  const [courses, bonus, rules] = await Promise.all([
    fetch(`${BASE}/api/research/courses`).then((r) => r.json()),
    fetch(`${BASE}/api/research/bonus`).then((r) => r.json()),
    fetch(`${BASE}/api/research/rules`).then((r) => r.json()),
  ]);
  for (const course of courses) {
    await fetch(`${BASE}/api/research/courses/${course.id}`, { method: "DELETE" });
  }
  for (const item of bonus) {
    await fetch(`${BASE}/api/research/bonus/${item.id}`, { method: "DELETE" });
  }
  for (const rule of rules) {
    await fetch(`${BASE}/api/research/rules/${rule.id}`, { method: "DELETE" });
  }
  await fetch(`${BASE}/api/research/weights`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course_weight: 0.7 }),
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await resetData();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.route("**/api/research/rules/parse", (route) =>
    route.fulfill({
      json: [
        { dimension: "智", name: "数学建模国一", score: 5 },
        { dimension: "德", name: "志愿服务满 50 小时", score: 2 },
      ],
      status: 200,
    }),
  );

  // 1. 必修成绩
  await page.goto(`${BASE}/research`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("课程名称").fill("高等数学");
  await page.getByPlaceholder("学分").fill("4");
  await page.getByPlaceholder("成绩").fill("90");
  await page.getByRole("button", { name: "添加课程" }).click();
  await page.waitForSelector("text=90.00");
  ok(true, "添加必修课后加权平均分更新为 90");

  const afterCourse = await (await fetch(`${BASE}/api/research/overview`)).json();
  ok(afterCourse.courses.count === 1 && afterCourse.courses.credits === 4, "必修统计正确");

  // 2. 综测
  await page.getByRole("button", { name: "综测", exact: true }).click();
  await page.getByPlaceholder("加分项，例如：数学建模国一").fill("数学建模省一");
  await page.getByPlaceholder("分值").fill("5");
  await page.getByRole("button", { name: "添加加分" }).click();
  await page.waitForSelector("text=+5");

  const afterBonus = await (await fetch(`${BASE}/api/research/overview`)).json();
  ok(afterBonus.zongce.total === 5, "综测总分累加为 5");
  ok(afterBonus.zongce.dimensions["智"] === 5, "智育维度累计正确");

  // 3. 细则解析
  await page
    .getByPlaceholder("例如：国家级学科竞赛一等奖 5 分；志愿服务满 50 小时 2 分……")
    .fill("国家级竞赛一等奖 5 分；志愿服务 50 小时 2 分");
  await page.getByRole("button", { name: "AI 解析细则" }).click();
  await page.waitForSelector("text=识别到 2 条");
  await page.getByRole("button", { name: "确认导入" }).click();
  await page.waitForTimeout(600);
  const rules = await (await fetch(`${BASE}/api/research/rules`)).json();
  ok(rules.length === 2, "解析出的规则已导入规则库");
  await page.screenshot({ path: path.join(OUT, "m4-zongce.png") });

  // 4. 综合成绩
  await page.getByRole("button", { name: "综合成绩", exact: true }).click();
  // 90 * 0.7 + 5 * 0.3 = 64.5
  await page.waitForSelector("text=64.5");
  ok(true, "综合成绩按权重合成为 64.5");

  await page.getByPlaceholder("例如 85").fill("80");
  await page.waitForSelector("text=还差");
  ok(true, "目标分差计算正常");
  await page.screenshot({ path: path.join(OUT, "m4-composite.png") });

  ok(errors.length === 0, `浏览器无 console 错误${errors.length ? "：" + errors.join(" | ") : ""}`);

  await browser.close();
  await resetData();
  console.log("OK");
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});
