#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 错误: 未检测到 Node.js 环境，请先安装 Node.js (>= 18.0): https://nodejs.org/"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 正在安装生产依赖..."
  npm install --omit=dev
fi

echo "🚀 正在启动红果短剧桌面播放器..."
node src/server/index.js &
SERVER_PID=$!

# 等待端口监听后自动在系统默认浏览器打开
sleep 1
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:8899"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:8899"
fi

echo "🎬 播放器已在后台启动 (PID: $SERVER_PID)，访问地址: http://127.0.0.1:8899"
wait $SERVER_PID
