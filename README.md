# LearnLoop

面向本科生的「学习管理 + 保研规划」本地优先工作台：
资料 → 批注 → 错题 → 导图 → 复习计划 → 今日任务，另一条线是成绩单/加分材料 → 识别 → 确认 → 算分。

- 产品设计：[docs/product-design.md](docs/product-design.md)（Word 版：`docs/LearnLoop-产品设计文档.docx`）
- 技术栈：React 19 + TypeScript + Vite / FastAPI + SQLModel + SQLite / DeepSeek API

## 快速开始

```bash
# 1. 后端（首次需要建虚拟环境）
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# 2. 前端（另开一个终端）
cd frontend
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173 。

**第一次使用**：进入「设置」页，把 DeepSeek 的 API Key 粘进去保存，再点「测试连接」。
Key 只存本机数据库，不会打包进前端，也不会进 git。

## 功能

### 学习

- **学科**：自定义学科与颜色，每个学科下挂资料 / 错题 / 导图 / 考试
- **资料与批注**：上传 PDF、图片、Word、PPT；PDF 在线多色画笔、文字批注、橡皮擦、撤销重做；批注按页自动保存，原始文件永不修改
- **错题**：文字或图片/PDF 录入（OCR 自动转文字）→ AI 分析错因、给正确解法、出 3 道同类变式题 → 标记已掌握 / 删除
- **导图**：AI 综合资料、错题与考试生成可编辑思维导图，支持拖拽与保存
- **复习计划**：录入考试后，AI 先联网补充高频考点与真题资料，再结合你的资料、错题与考试范围倒排每日任务；给出专题覆盖表（高/中/低频），最近 10 天附可直接背的考点速览、易错点与自测题；计划落库可回看；今日任务自动汇总逾期项，勾选完成回写进度

### 保研

- **必修成绩**：录入课程（学分/成绩/必修或选修），自动算加权平均分与 4.0 制 GPA，只统计必修
- **综测**：按德智体美劳记录加分项并汇总；可粘贴学院细则让 AI 拆成「维度 + 名称 + 分值」的规则，确认后入库
- **综合成绩**：按学校权重合成（默认必修 70% + 综测 30%），可填目标分看差距

### 其他

- **全局搜索**：跨学科、资料、错题、导图检索
- **音乐播放器**：全站悬浮，上传本地音乐、播放列表、单曲/列表/随机、音量
- **备份**：设置页一键导出 zip（数据库 + 上传文件），可覆盖式导入恢复

## 目录结构

```
backend/            FastAPI 服务
  app/routers/      学科、资料、错题、考试、任务、导图、保研、搜索、备份
  app/services/     LLM 客户端、计划排期、成绩计算
  tests/            pytest（108 项）
  data/             运行时 SQLite 与上传文件（不提交）
frontend/           React 应用
  src/pages/        页面
  src/components/   布局、批注器、错题、导图、考试、播放器
  src/stores/       Zustand 状态
  e2e/              Playwright 冒烟测试
docs/               产品文档
scripts/            文档校验与转换脚本
```

## 测试

```bash
cd backend  && .venv/Scripts/python.exe -m pytest     # 108 passed
cd frontend && pnpm test                              # 38 passed
cd frontend && pnpm build                             # 类型检查 + 打包
node scripts/check-docs.mjs                           # 文档结构校验
```

浏览器端到端（先启动前后端）：

```bash
cd frontend
node e2e/smoke.mjs      # 资料批注：PDF 渲染、画笔、文字、橡皮擦、落库
node e2e/mistakes.mjs   # 设置 Key、错题识别与分析、掌握状态
node e2e/study.mjs      # 考试 → 复习计划 → 今日任务 → 导图保存
node e2e/research.mjs   # 必修成绩、综测加分、细则解析、综合成绩
node e2e/final.mjs      # 全局搜索、音乐播放器、备份导出
```

`final.mjs` 使用本机 Edge（`channel: msedge`），因为 Playwright 自带 Chromium 不含音频编解码。

## 说明

- 数据默认存本机 `backend/data/learnloop.db`，上传文件在 `backend/data/uploads/`
- 删除学科会级联删除其资料、错题、导图、考试与任务
- 批注是独立图层，擦除只作用于批注，PDF 原件不变
