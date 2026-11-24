#!/usr/bin/env bash
# Codespaces 首次创建时执行：装依赖 + 打包前端
# 手动重跑：bash .devcontainer/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 安装后端依赖"
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
./.venv/bin/python -m pip install --quiet --upgrade pip
./.venv/bin/python -m pip install --quiet -r requirements.txt

echo "==> 安装前端依赖"
cd "$ROOT/frontend"
if ! command -v pnpm >/dev/null 2>&1; then
  # 有些镜像把 node 装在 /usr/local，全局安装需要 sudo
  npm install -g pnpm@9 || sudo npm install -g pnpm@9
fi
pnpm install --frozen-lockfile

echo "==> 打包前端（产物由后端托管）"
pnpm build

echo "==> 完成。接下来运行：bash .devcontainer/start.sh"
