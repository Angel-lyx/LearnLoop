#!/usr/bin/env node
// 文档校验：确保产品设计文档结构完整、链接有效、代码块闭合。
// 用法：node scripts/check-docs.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "docs/product-design.md";

const REQUIRED_SECTIONS = [
  "产品定位",
  "核心闭环",
  "功能结构",
  "必修成绩",
  "综测",
  "保研综合成绩",
  "录入 · 识别 · 确认",
  "主页与今日任务",
  "页面结构",
  "AI 能力与边界",
  "数据与存储",
  "技术方向",
  "迭代计划",
  "非目标",
  "主要风险",
];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

// 1. 文件存在
const abs = resolve(root, DOC);
if (!existsSync(abs)) {
  console.error(`FAIL 找不到文档：${DOC}`);
  process.exit(1);
}
const text = readFileSync(abs, "utf8");

// 2. 必填章节齐全
for (const s of REQUIRED_SECTIONS) {
  if (!text.includes(s)) fail(`缺少章节：${s}`);
}

// 3. 标题层级从 h1 开始，且全篇只有一个一级标题
const h1 = text.match(/^# .+$/gm) ?? [];
if (h1.length !== 1) fail(`应只有 1 个一级标题，实际 ${h1.length} 个`);
if (!/^# /.test(text.trimStart())) fail("文档应以一级标题开头");

// 4. 代码块成对闭合
const fences = (text.match(/^```/gm) ?? []).length;
if (fences % 2 !== 0) fail(`代码块未闭合（\`\`\` 出现 ${fences} 次，应为偶数）`);

// 5. 相对链接可解析
const links = [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
for (const href of links) {
  if (/^(https?:|mailto:|#)/.test(href)) continue;
  const target = resolve(dirname(abs), href.split("#")[0]);
  if (!existsSync(target)) fail(`链接指向不存在的文件：${href}`);
}

// 6. 表格行格式：同一张表内列数一致
const lines = text.split(/\r?\n/);
let inTable = false;
let cols = 0;
lines.forEach((line, i) => {
  const isRow = /^\s*\|.*\|\s*$/.test(line);
  if (isRow) {
    const n = line.trim().replace(/^\||\|$/g, "").split("|").length;
    if (!inTable) {
      inTable = true;
      cols = n;
    } else if (n !== cols) {
      fail(`第 ${i + 1} 行表格列数 ${n} 与表头 ${cols} 不一致`);
    }
  } else {
    inTable = false;
  }
});

if (errors.length) {
  console.error(`FAIL 文档校验未通过（${errors.length} 项）：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`PASS ${DOC}：章节 ${REQUIRED_SECTIONS.length}/${REQUIRED_SECTIONS.length}，链接 ${links.length}，代码块 ${fences / 2} 对`);
