// M5 冒烟：全局搜索 → 音乐播放器上传/播放 → 备份导出
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { loginApi, loginBrowser } from "./auth.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const OUT = path.resolve("e2e/artifacts");

function ok(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`PASS ${message}`);
}

function silentWav(seconds = 4, rate = 8000) {
  const samples = seconds * rate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

async function cleanup() {
  const subjects = await (await fetch(`${BASE}/api/subjects`)).json();
  for (const item of subjects) {
    if (item.name.startsWith("E2E")) {
      await fetch(`${BASE}/api/subjects/${item.id}`, { method: "DELETE" });
    }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await loginApi(BASE);
  await cleanup();

  const subject = await (
    await fetch(`${BASE}/api/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E搜索-${Date.now()}` }),
    })
  ).json();

  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from("%PDF-1.4")], { type: "application/pdf" }),
    "极限真题.pdf",
  );
  await fetch(`${BASE}/api/subjects/${subject.id}/materials`, {
    method: "POST",
    body: form,
  });

  // 用本机 Edge：Playwright 自带 Chromium 不含音频编解码支持
  const browser = await chromium.launch({
    channel: "msedge",
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await loginBrowser(page.context(), BASE);
  const errors = [];
  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.log("PAGE ERROR:", err.message.slice(0, 200));
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
      console.log("CONSOLE ERROR:", msg.text().slice(0, 200));
    }
  });

  // 1. 全局搜索
  await page.goto(`${BASE}/search?q=${encodeURIComponent("极限")}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector("text=资料（");
  await page.waitForSelector("text=极限真题.pdf");
  ok(true, "搜索页命中资料");
  await page.getByRole("link", { name: "极限真题.pdf" }).first().click();
  await page.waitForURL(/\/materials\/\d+/);
  ok(true, "点击搜索结果可跳转到资料");
  await page.screenshot({ path: path.join(OUT, "m5-search.png") });

  // 2. 音乐播放器
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /音乐/ }).first().click();
  await page.waitForSelector("text=上传音乐");
  await page
    .locator('input[type="file"][accept="audio/*"]')
    .setInputFiles({
      name: "学习白噪音.wav",
      mimeType: "audio/wav",
      buffer: silentWav(4),
    });
  await page.waitForSelector("text=播放列表 1");
  ok(true, "音乐上传后进入播放列表");

  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.waitForSelector('button[aria-label="暂停"]', { timeout: 10000 });
  ok(true, "点击播放后进入播放状态");

  await page.getByRole("button", { name: "列表", exact: true }).click();
  await page.waitForSelector('button:has-text("单曲")');
  ok(true, "播放模式可切换");
  await page.screenshot({ path: path.join(OUT, "m5-player.png") });

  // 3. 备份导出
  const backup = await fetch(`${BASE}/api/backup/export`);
  const bytes = Buffer.from(await backup.arrayBuffer());
  ok(backup.status === 200 && bytes.slice(0, 2).toString() === "PK", "备份导出为 zip 包");

  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  const href = await page.getByRole("link", { name: "导出备份" }).getAttribute("href");
  ok(href === "/api/backup/export", "设置页提供备份导出入口");

  ok(errors.length === 0, `浏览器无 console 错误${errors.length ? "：" + errors.join(" | ") : ""}`);

  await browser.close();

  await fetch(`${BASE}/api/subjects/${subject.id}`, { method: "DELETE" });
  console.log("OK");
}

main().catch((err) => {
  console.error("E2E FAILED:", err.message);
  process.exit(1);
});
