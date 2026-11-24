# 协作说明

给加进来的组员看的。照着做就行，不需要问人。

## 一、谁有什么权限

| 能力 | 仓库所有者（Owner） | 协作者（Collaborator / Write） |
|---|---|---|
| 看代码、下载 zip、clone | ✅ | ✅ |
| 改代码并推送到 `main` | ✅ | ✅ |
| 开自己的 Codespace 跑项目 | ✅ | ✅（**算自己的额度**） |
| 用别人已经跑起来的网页 | — | 要链接 + 邀请码，**和协作者身份无关** |
| 进别人的 Codespace、看别人的账号和资料 | 只有本人能进自己的 | ❌ |
| 改仓库设置、可见性、加人、删仓库 | ✅ | ❌ |
| 花别人的 Codespaces 额度 | — | ❌ 各花各的 |

**一句话**：协作者 = 能改代码，但碰不到别人的机器和数据。别人部署好的网页，协作者也只是个普通用户。

## 二、三种改法，按上手难度排

### 1. 网页上直接改（零安装，适合改文档）

把仓库地址里的 `github.com` 换成 `github.dev`：

```
https://github.dev/Angel-lyx/LearnLoop
```

打开的是网页版 VS Code：点开文件 → 改 → `Ctrl + S` → 左侧「源代码管理」图标 → 填一句提交说明 → `Commit & Push`。

能改文件，**但跑不了程序**。

### 2. 开自己的 Codespace（能改也能跑，推荐）

仓库页 → 绿色 `Code` → `Codespaces` → `Create codespace on main`。

3–5 分钟自动装好环境，之后：

```bash
bash .devcontainer/start.sh     # 启动，看 http://localhost:8000
```

改完在左侧「源代码管理」里提交并推送。

### 3. 本地 clone（正规做法，需要装 Git）

```bash
git clone https://github.com/Angel-lyx/LearnLoop.git
cd LearnLoop
```

## 三、两条必须守的规矩

**1. 改之前先拉，改完再推。**

```bash
git pull
git add -A
git commit -m "说清楚改了什么"
git push
```

两个人同时改同一个文件，后推的会被拒。被拒了先 `git pull` 再 `git push`，不要强推。

**2. 不要提交这些东西。**

`.env`、`backend/data/`、`node_modules/`、`frontend/dist/` 已经在 `.gitignore` 里了，别加 `-f` 强行提交。仓库里的 API Key 一旦推上去，等于公开给全世界。

## 四、本地怎么跑

```bash
# 后端
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt   # Linux/macOS 用 .venv/bin/python
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000

# 前端（另开终端）
cd frontend
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173 ，第一次先注册一个账号。

## 五、提交前跑一遍测试

```bash
cd backend && .venv/Scripts/python.exe -m pytest    # 153 项
cd frontend && pnpm test                            # 54 项
cd frontend && pnpm build                           # 类型检查 + 打包
```

测试不过就不要推 `main`。

## 六、代码在哪

| 目录 | 内容 |
|---|---|
| `backend/app/routers/` | 各个接口：认证、学科、资料、错题、考试、任务、导图、保研、搜索、备份 |
| `backend/app/models.py` | 数据库表结构 |
| `backend/app/services/` | LLM 调用、复习计划排期、成绩计算 |
| `backend/tests/` | pytest |
| `frontend/src/pages/` | 页面 |
| `frontend/src/components/` | 布局、批注器、导图、播放器 |
| `frontend/src/stores/` | Zustand 状态 |
| `docs/` | 产品设计文档 |
