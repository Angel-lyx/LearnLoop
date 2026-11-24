#!/usr/bin/env bash
# Codespaces 首次创建时执行：装依赖 + 打包前端
# 手动重跑：bash .devcontainer/setup.sh
#
# 国内网络很慢时可以走镜像：
#   USE_CN_MIRROR=1 bash .devcontainer/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 默认走官方源；USE_CN_MIRROR=1 时换成清华 PyPI 和 npmmirror
PIP_INDEX=""
PNPM_REGISTRY=""
if [ "${USE_CN_MIRROR:-0}" = "1" ]; then
  PIP_INDEX="--index-url https://pypi.tuna.tsinghua.edu.cn/simple"
  PNPM_REGISTRY="--registry=https://registry.npmmirror.com"
  echo "==> 使用国内镜像源"
fi

echo "==> 安装后端依赖"
cd "$ROOT/backend"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC2086 # 需要按空格拆成多个参数
./.venv/bin/python -m pip install --quiet --upgrade pip $PIP_INDEX
# shellcheck disable=SC2086
./.venv/bin/python -m pip install --quiet $PIP_INDEX -r requirements.txt

echo "==> 安装前端依赖"
cd "$ROOT/frontend"
if ! command -v pnpm >/dev/null 2>&1; then
  # 有些镜像把 node 装在 /usr/local，全局安装需要 sudo
  # shellcheck disable=SC2086
  npm install -g pnpm@9 $PNPM_REGISTRY || sudo npm install -g pnpm@9 $PNPM_REGISTRY
fi
# shellcheck disable=SC2086
pnpm install --frozen-lockfile $PNPM_REGISTRY

echo "==> 打包前端（产物由后端托管）"
pnpm build

echo "==> 完成。接下来运行：bash .devcontainer/start.sh"
