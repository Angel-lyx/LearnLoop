# LearnLoop

面向本科生的「学习管理 + 保研规划」本地优先工作台。

- 产品设计：[docs/product-design.md](docs/product-design.md)（Word 版：`docs/LearnLoop-产品设计文档.docx`）
- 技术栈：React 19 + TypeScript + Vite / FastAPI + SQLModel + SQLite / DeepSeek API

## 目录结构

```
backend/            FastAPI 服务
  app/              配置、数据库、模型、路由
  tests/            pytest 测试
  data/             运行时 SQLite（不提交）
frontend/           React 应用
  src/pages/        页面
  src/components/   布局与通用组件
  src/stores/       Zustand 状态
  src/lib/          API 封装
docs/               产品文档
scripts/            文档校验与转换脚本
```

## 开发

首次准备：

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
copy .env.example .env        # 填入 DEEPSEEK_API_KEY

cd ../frontend
pnpm install
```

启动（两个终端）：

```bash
# 终端 1
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# 终端 2
cd frontend
pnpm dev
```

打开 http://127.0.0.1:5173 。前端通过 Vite 代理把 `/api` 转发到 8000。

## 测试

```bash
cd backend  && .venv/Scripts/python.exe -m pytest
cd frontend && pnpm test
cd frontend && pnpm build          # 类型检查 + 打包
node scripts/check-docs.mjs        # 文档结构校验
```

## 进度

| 里程碑 | 状态 |
|---|---|
| M1 学科管理 / 资料批注 | 进行中（学科管理已完成） |
| M2 录入·识别·确认、错题 | 未开始 |
| M3 导图、复习计划、今日任务 | 未开始 |
| M4 必修成绩、综测、综合成绩 | 未开始 |
| M5 音乐播放器、搜索、备份 | 未开始 |

## 注意

- `DEEPSEEK_API_KEY` 只放在 `backend/.env`，不进前端、不进 git。
- 数据默认存本机 `backend/data/learnloop.db`，备份即拷贝该文件。
