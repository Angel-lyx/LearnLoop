# LearnLoop

面向本科生的「学习管理 + 保研规划」本地优先工作台：
资料 → 批注 → 错题 → 导图 → 复习计划 → 今日任务，另一条线是成绩单/加分材料 → 识别 → 确认 → 算分。

支持多账号：每个人的学科、资料、错题、成绩互相隔离，登录后才能访问自己的数据。

- 产品设计：[docs/product-design.md](docs/product-design.md)（Word 版：`docs/LearnLoop-产品设计文档.docx`）
- 技术栈：React 19 + TypeScript + Vite / FastAPI + SQLModel + SQLite / DeepSeek API
- 部署形态：FastAPI 同时托管前端构建产物，一个端口 + 一块持久磁盘即可常驻运行

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

打开 http://127.0.0.1:5173 ，第一次先注册一个账号。

**第一次使用**：进入「设置」页，把 DeepSeek 的 API Key 粘进去保存，再点「测试连接」。
Key 只存在服务器上属于你的那条记录里，不会打包进前端，也不会进 git。

## 部署到服务器（电脑关机，手机照样用）

GitHub Pages 只能托管静态文件，跑不了这个项目的 FastAPI 后端。要让手机在电脑关机后仍能使用，
必须把后端放到一台 24 小时开机的机器上。项目已按「单服务」打包好，一个容器、一个端口、一块磁盘。

### 1. 准备机器

- 一台云服务器（国内学生机 2核2G 一年百来块；海外 VPS 约 $4/月），装好 Docker 与 docker compose
- 建议 4GB 以上磁盘：资料是 PDF/图片，会慢慢涨

### 2. 启动

```bash
git clone <你的仓库地址> learnloop
cd learnloop
mkdir -p data

# 邀请码：设了之后陌生人无法注册，务必改掉
REGISTRATION_CODE=换成你自己的邀请码 docker compose up -d --build
```

浏览器打开 `http://服务器IP:8000`，注册第一个账号即可。
（国内服务器不备案时用 `IP:端口` 访问完全够自用；要域名就继续下一步。）

### 3. 加 HTTPS（推荐）

手机浏览器装「添加到主屏幕」、Cookie 安全都要求 HTTPS。用仓库里现成的 Caddy 配置：

```bash
# 把域名 A 记录指向服务器 IP，然后：
DOMAIN=learn.example.com SESSION_COOKIE_SECURE=true \
  docker compose -f docker-compose.yml -f deploy/caddy.compose.yml up -d
```

Caddy 会自动申请 Let's Encrypt 证书，80/443 直接可用。

### 4. 手机上使用

用手机浏览器打开地址 → 菜单里选「添加到主屏幕」，之后像 App 一样从桌面图标进入。
界面在手机上会自动切换成「顶栏 + 底部导航」，不再显示桌面侧边栏。

### 5. 数据、升级与迁移

- `./data` 目录就是全部数据（`learnloop.db` + `uploads/`），备份这个目录或直接用「导出备份」都行
- 升级：`git pull && docker compose up -d --build`，数据不动
- **从单用户旧版本迁移**：先在本地旧库上启动新版本 → 注册一个账号（会自动认领旧数据）→ 设置页「导出备份」→ 到服务器注册账号后「导入备份」
- SQLite 单文件库，所以容器固定单进程（`--workers 1`）；几十个人用没问题，再多就该换 Postgres 了

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

- **账号**：注册/登录/改密，数据按账号隔离；`REGISTRATION_CODE` 可限制注册
- **全局搜索**：跨学科、资料、错题、导图检索
- **音乐播放器**：全站悬浮，上传本地音乐、播放列表、单曲/列表/随机、音量
- **备份**：设置页一键导出 zip（记录 + 上传文件），导入只覆盖当前账号

## 目录结构

```
backend/            FastAPI 服务
  app/routers/      认证、学科、资料、错题、考试、任务、导图、保研、搜索、备份
  app/services/     LLM 客户端、计划排期、成绩计算
  tests/            pytest（151 项）
  data/             运行时 SQLite 与上传文件（不提交）
frontend/           React 应用
  src/pages/        页面（含登录页）
  src/components/   布局、批注器、错题、导图、考试、播放器
  src/stores/       Zustand 状态（含账号）
  e2e/              Playwright 冒烟测试
docs/               产品文档
deploy/             Caddy 反代配置
scripts/            文档校验与转换脚本
```

## 测试

```bash
cd backend  && .venv/Scripts/python.exe -m pytest     # 151 passed
cd frontend && pnpm test                              # 54 passed
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

- 数据默认存本机 `backend/data/learnloop.db`，上传文件在 `backend/data/uploads/`；部署时由 `DATA_DIR` 指向挂载卷
- 每条业务数据都带 `user_id`，越权访问统一按 404 处理，不泄露 id 是否存在
- 备份是 `manifest.json` + 资料文件的 zip，导入只替换当前账号的数据，失败会整体回滚
- API Key 属于凭证，不进备份包；换机器后到设置页重新填写
- 删除学科会级联删除其资料、错题、导图、考试与任务
- 批注是独立图层，擦除只作用于批注，PDF 原件不变
