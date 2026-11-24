# 前端构建 + 后端运行，产物在同一个镜像里，只暴露一个端口
FROM node:22-bookworm-slim AS web

RUN corepack enable
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# main.py 会从 /app/frontend/dist 托管前端，所以这里保持同样的相对路径
COPY --from=web /app/frontend/dist /app/frontend/dist

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8000

# SQLite 单文件库，必须单进程；多 worker 会写冲突
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
