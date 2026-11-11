#!/bin/bash
# 整理「播放版」資料夾：只放播放需要的檔案＋雙擊啟動程式，複製到任何電腦都能開。
# 用法：bash scripts/package.sh [輸出資料夾]（預設：../1031考後簡報_播放版）
set -e
cd "$(dirname "$0")/.."
OUT="${1:-../1031考後簡報_播放版}"
npm run build >/dev/null
rm -rf "$OUT"; mkdir -p "$OUT/dist" "$OUT/assets/people" "$OUT/assets/music" "$OUT/assets/voice" "$OUT/assets/brief"
cp index.html deck.css serve.py "$OUT/"
cp dist/deck.js "$OUT/dist/"
cp assets/console-screen.png "$OUT/assets/"
if [ -d assets/cover ]; then mkdir -p "$OUT/assets/cover"; cp assets/cover/*.jpg "$OUT/assets/cover/"; fi   # 封面主視覺（Blender 劇照）
cp assets/people/*.glb "$OUT/assets/people/"
if [ -d assets/people/expr ]; then mkdir -p "$OUT/assets/people/expr"; cp assets/people/expr/*.glb "$OUT/assets/people/expr/"; fi   # 動態表情
if [ -d assets/props ]; then mkdir -p "$OUT/assets/props"; cp assets/props/*.glb "$OUT/assets/props/"; fi   # Blender 重做的考場儀器
cp assets/music/*.mp3 "$OUT/assets/music/"
cp assets/voice/*.mp3 "$OUT/assets/voice/"
cp assets/brief/*.jpg assets/brief/*.mp4 "$OUT/assets/brief/"
cp assets/people/授權紀錄.md "$OUT/assets/people/"; cp assets/music/授權紀錄.md "$OUT/assets/music/"
cp package/serve.ps1 package/Start-Windows.bat package/Start-Mac.command package/使用說明.txt "$OUT/"
chmod +x "$OUT/Start-Mac.command"
# Windows 的 .bat／.ps1 用 CRLF 換行
for f in "$OUT/Start-Windows.bat" "$OUT/serve.ps1"; do perl -pi -e 's/\r?\n/\r\n/' "$f"; done
echo "播放版：$(cd "$OUT" && pwd)（$(du -sh "$OUT" | cut -f1)）"
