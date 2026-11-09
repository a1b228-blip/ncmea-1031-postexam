#!/bin/bash
# 1031 考後 3D 簡報：雙擊開始（Mac）。簡報進行中請不要關掉這個終端機視窗。
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1 || ! python3 -c "" >/dev/null 2>&1; then
  echo "這台 Mac 沒有 python3，請改用 Windows 電腦，或先安裝 Xcode 命令列工具（xcode-select --install）。"
  read -r -p "按 Enter 結束"; exit 1
fi
for PORT in 8785 8786 8787 8788 8789; do
  if ! lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then break; fi
done
echo ""
echo "  簡報網址：http://localhost:$PORT/"
echo "  簡報進行中請不要關掉這個視窗；要結束時關掉即可。"
echo ""
(sleep 1; open "http://localhost:$PORT/") &
exec python3 serve.py "$PORT"
