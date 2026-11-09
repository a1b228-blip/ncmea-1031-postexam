// 畫面框：整份簡報固定 16:9。螢幕不是 16:9（例如 4:3 投影機、超寬螢幕）時，置中並在上下（或左右）留黑邊，
// 3D 構圖與文字位置跟 1920×1080 完全一樣，不會被裁掉或互相重疊。
// 位置寫進 CSS 變數 --vx --vy --vw --vh（deck.css 用它擺 3D 畫布、HUD 等）。
export const view = { x: 0, y: 0, w: innerWidth, h: innerHeight };
function update() {
  const W = innerWidth, H = innerHeight, w = Math.min(W, Math.round((H * 16) / 9)), h = Math.min(H, Math.round((W * 9) / 16));
  Object.assign(view, { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h });
  const s = document.documentElement.style;
  s.setProperty("--vx", `${view.x}px`); s.setProperty("--vy", `${view.y}px`); s.setProperty("--vw", `${w}px`); s.setProperty("--vh", `${h}px`);
}
update();
addEventListener("resize", update);                 // 這個模組最先載入 → 比其他 resize 處理先執行
