# 從模擬到實戰：情境模擬競賽中的教學技巧與團隊學習

NCMEA 1031 情境模擬競賽｜考後 3D 報告簡報

NCMEA 醫事放射組第二場（2026.10.31 林口長庚）考後報告，19 頁 3D 互動簡報：當天流程、考場實況（CT／MRI 左右雙畫面）、急救與家屬安撫、Debrief、TRM、ISBAR、考點總整理。

**網址：https://a1b228-blip.github.io/ncmea-1031-postexam/**

## 操作
- 開場載入畫面跑到 100%（約 127 MB），出現「按 → 開始」再按 →，音樂會同時響起
- → ／空白鍵／滑鼠點擊：下一步　← ：上一步
- F：全螢幕　M：靜音　Home：回封面
- P：效能模式（舊電腦畫面卡頓時：關閉陰影、降低解析度）
- 第 6 頁看考場：方向鍵走動，Enter 下一頁
- 建議用電腦版 Chrome 或 Edge；4:3 投影機會保持 16:9 並上下留黑邊

## 離線播放
`bash scripts/package.sh` 產生播放版資料夾，Windows 雙擊 `Start-Windows.bat`、Mac 雙擊 `Start-Mac.command`（不要直接點 index.html）。

## 開發
`npm install` → 改 `src/*.js` 後 `npm run build`（產生 `dist/deck.js`）→ `python3 serve.py 8785` 預覽。

## 素材來源
- 3D 人物：MakeHuman Community（CC0）；醫師袍 3D 素材：Mindfront（CC-BY），MakeHuman Community — 詳見 `assets/people/授權紀錄.md`
- 背景音樂：Pixabay（Pixabay Content License）— 詳見 `assets/music/授權紀錄.md`
- 第 5 頁大螢幕：主辦單位 NCMEA 原始投影片與 S1000 介紹影片
- 語音：Edge-TTS 生成；程式庫：three.js（MIT）、GSAP
