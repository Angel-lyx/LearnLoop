// 浏览器冒烟测试：上传 PDF → 打开阅读器 → 画笔 → 文字批注 → 校验已落库
// 用法：先启动 backend(8000) 与 frontend(5173)，再 node e2e/smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loginApi, loginBrowser } from "./auth.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const PDF_PATH = process.env.PDF_PATH ?? "C:/Users/liuyo/AppData/Local/Temp/learnloop_sample.pdf";
const OUT = path.resolve("e2e/artifacts");

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

async function createFixture() {
  const subject = await (
    await fetch(`${BASE}/api/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E-${Date.now()}`, color: "#4F7CFF" }),
    })
  ).json();

  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync(PDF_PATH)], { type: "application/pdf" }),
    "期中真题.pdf",
  );
  const material = await (
    await fetch(`${BASE}/api/subjects/${subject.id}/materials`, {
      method: "POST",
      body: form,
    })
  ).json();

  return { subject, material };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await loginApi(BASE);
  const { material } = await createFixture();
  console.log(`fixture: material #${material.id}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
  await loginBrowser(page.context(), BASE);
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
      console.log("CONSOLE ERROR:", msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    errors.push(String(err));
    console.log("PAGE ERROR:", err.message.slice(0, 300));
  });

  await page.goto(`${BASE}/materials/${material.id}`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.querySelectorAll("canvas").length >= 2,
    { timeout: 20000 },
  );
  await page.waitForFunction(
    () => (document.querySelector("canvas")?.width ?? 0) > 200,
    { timeout: 20000 },
  );

  const canvases = await page.evaluate(() => {
    const list = [...document.querySelectorAll("canvas")];
    return list.map((c) => ({ w: c.width, h: c.height, cls: c.className }));
  });
  assert(canvases.length >= 2, "PDF 画布与批注层都已创建");
  assert(canvases[0].w > 200 && canvases[0].h > 200, "PDF 画布尺寸正常");

  // 扫描件（JBIG2）依赖 wasm 解码器，静态资源缺失会导致整页空白
  for (const asset of ["pdfjs-wasm/jbig2.wasm", "pdfjs-cmaps/UniGB-UCS2-H.bcmap"]) {
    const response = await fetch(`${BASE}/${asset}`);
    assert(response.ok, `解码资源可访问：${asset}`);
  }

  const painted = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) nonWhite += 1;
    }
    return nonWhite;
  });
  assert(painted > 500, `PDF 已渲染出内容（非白像素 ${painted}）`);
  await page.screenshot({ path: path.join(OUT, "1-viewer.png") });

  const upper = page.locator(".upper-canvas").first();
  const box = await upper.boundingBox();
  assert(Boolean(box), "拿到批注层位置");
  assert(
    box.y >= 0 && box.y + box.height <= 1400,
    `批注层完整位于视口内（y=${Math.round(box.y)}…${Math.round(box.y + box.height)}）`,
  );

  // 选红色 + 粗笔 + 钢笔，验证颜色、粗细与笔型生效
  await page.getByRole("button", { name: "画笔颜色 红色" }).click();
  await page.getByRole("button", { name: "粗", exact: true }).click();
  await page.getByRole("button", { name: "钢笔", exact: true }).click();

  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(box.x + 60 + i * 14, box.y + 60 + i * 8);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);

  let annotations = await (
    await fetch(`${BASE}/api/materials/${material.id}/annotations`)
  ).json();
  assert(annotations.length === 1, "画笔批注已写入数据库");
  assert(
    JSON.parse(annotations[0].payload).some(
      (obj) => String(obj.type).toLowerCase() === "path",
    ),
    "保存内容里包含笔迹对象",
  );

  const stroke = JSON.parse(annotations[0].payload).find(
    (obj) => String(obj.type).toLowerCase() === "path",
  );
  assert(stroke?.stroke === "#EF4444", `笔迹颜色生效（${stroke?.stroke}）`);
  assert(Number(stroke?.strokeWidth) === 6, `笔迹粗细生效（${stroke?.strokeWidth}）`);
  assert(stroke?.opacity === 1, "钢笔为不透明笔迹");
  await page.screenshot({ path: path.join(OUT, "2-drawn.png") });

  await page.getByRole("button", { name: "文字", exact: true }).click();
  await page.mouse.click(box.x + 220, box.y + 220);
  await page.keyboard.type("极限存在条件");
  await page.mouse.click(box.x + 700, box.y + 700);
  await page.waitForTimeout(1200);

  annotations = await (
    await fetch(`${BASE}/api/materials/${material.id}/annotations`)
  ).json();
  const payload = JSON.parse(annotations[0].payload);
  assert(
    payload.some((obj) => String(obj.type).toLowerCase() === "textbox"),
    "文字批注已写入数据库",
  );
  assert(
    payload.some((obj) => (obj.text ?? "").includes("极限存在条件")),
    "文字内容正确保存",
  );
  assert(
    !payload.some((obj) => (obj.text ?? "").includes("输入批注")),
    "结束编辑时不会再留下占位文本框",
  );
  await page.screenshot({ path: path.join(OUT, "3-text.png") });

  await page.getByRole("button", { name: "橡皮擦", exact: true }).click();
  // 点在笔迹中点附近，验证擦除生效
  await page.mouse.click(box.x + 146, box.y + 110);
  await page.waitForTimeout(1200);

  annotations = await (
    await fetch(`${BASE}/api/materials/${material.id}/annotations`)
  ).json();
  const afterErase = JSON.parse(annotations[0].payload);
  assert(
    !afterErase.some((obj) => String(obj.type).toLowerCase() === "path"),
    "橡皮擦移除笔迹且已持久化",
  );
  assert(
    afterErase.some((obj) => String(obj.type).toLowerCase() === "textbox"),
    "擦除不影响文字批注",
  );
  await page.screenshot({ path: path.join(OUT, "4-erased.png") });

  assert(errors.length === 0, `浏览器无 console 错误${errors.length ? "：" + errors.join(" | ") : ""}`);

  console.log(`截图输出：${OUT}`);
  await browser.close();

  // 清理测试数据
  await fetch(`${BASE}/api/subjects/${material.subject_id}/materials`, { method: "GET" });
  await fetch(`${BASE}/api/materials/${material.id}`, { method: "DELETE" });
  console.log("OK");
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});