#!/usr/bin/env bash
# 启动单服务：FastAPI 同时托管前端产物，只开一个端口
# 手动运行：bash .devcontainer/start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8000}"

export DATA_DIR="${DATA_DIR:-$ROOT/backend/data}"
# Codespaces 转发出来的是 https 地址，Cookie 必须走 Secure
export SESSION_COOKIE_SECURE="${SESSION_COOKIE_SECURE:-true}"
# 端口是公开的，没有邀请码谁都能注册；改这里或启动前 export 一个自己的
export REGISTRATION_CODE="${REGISTRATION_CODE:-learnloop}"

if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  echo "还没装依赖，先运行：bash .devcontainer/setup.sh" >&2
  exit 1
fi

if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
  echo "前端还没打包，先运行：bash .devcontainer/setup.sh" >&2
  exit 1
fi

if pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
  echo "LearnLoop 已经在运行：http://localhost:$PORT"
  exit 0
fi

cd "$ROOT/backend"
mkdir -p "$DATA_DIR"
nohup ./.venv/bin/python -m uvicorn app.main:app \
  --host 0.0.0.0 --port "$PORT" --workers 1 \
  > /tmp/learnloop.log 2>&1 &

echo "LearnLoop 已启动：http://localhost:$PORT"
echo "日志：tail -f /tmp/learnloop.log"
