// 第 10 頁：控制台影像示意圖（不是真實病人影像）
//   CT：腹部橫切面，有對比劑（血管、腎臟、肝臟變亮）／沒有對比劑（一樣暗 → 懷疑 IV Loss）
//   MRI：腦部 T2 橫切面，清楚／躁動造成的重影與模糊

function ellipse(g, x, y, rx, ry, color, rot = 0) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }

// CT 腹部橫切面（觀看方向：病人右側在畫面左側）
export function drawCT(cv, { contrast }) {
  const g = cv.getContext("2d"), w = cv.width, h = cv.height, cx = w / 2, cy = h / 2 + 6, k = Math.min(w, h) / 300;
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  ellipse(g, cx, cy, 128 * k, 92 * k, "#5a5a5a");                       // 皮膚＋皮下脂肪
  ellipse(g, cx, cy, 116 * k, 82 * k, "#2e2e2e");
  ellipse(g, cx, cy + 4 * k, 104 * k, 72 * k, "#6d6d6d");                // 腹腔軟組織
  ellipse(g, cx - 46 * k, cy - 14 * k, 50 * k, 40 * k, contrast ? "#a9a9a9" : "#777", -0.3);   // 肝臟
  ellipse(g, cx + 50 * k, cy - 22 * k, 26 * k, 20 * k, contrast ? "#9a9a9a" : "#727272", 0.4);  // 脾臟
  for (const s of [-1, 1]) {                                              // 腎臟（皮質）
    ellipse(g, cx + s * 48 * k, cy + 26 * k, 15 * k, 22 * k, contrast ? "#ececec" : "#7b7b7b", s * 0.35);
    ellipse(g, cx + s * 46 * k, cy + 26 * k, 6 * k, 11 * k, contrast ? "#bdbdbd" : "#6e6e6e", s * 0.35);
  }
  ellipse(g, cx, cy + 50 * k, 20 * k, 17 * k, "#f2f2f2");                // 脊椎
  ellipse(g, cx, cy + 50 * k, 9 * k, 8 * k, "#9a9a9a");
  ellipse(g, cx + 12 * k, cy + 22 * k, 9 * k, 9 * k, contrast ? "#ffffff" : "#808080");   // 主動脈
  ellipse(g, cx - 14 * k, cy + 20 * k, 9 * k, 7 * k, contrast ? "#e0e0e0" : "#7a7a7a");   // 下腔靜脈
  g.strokeStyle = contrast ? "#d4d4d4" : "#6a6a6a"; g.lineWidth = 3 * k;  // 腸繫膜血管
  for (const [x1, y1, x2, y2] of [[8, 10, 30, -20], [12, 8, -6, -30], [14, 12, 46, 0]]) { g.beginPath(); g.moveTo(cx + x1 * k, cy + y1 * k); g.lineTo(cx + x2 * k, cy + y2 * k); g.stroke(); }
  g.fillStyle = "#cbd5e1"; g.font = `600 ${11 * k}px Helvetica, Arial`; g.fillText("R", 10 * k, cy); g.fillText("L", w - 18 * k, cy);
}

// MRI 腦部 T2 橫切面
function brain(g, w, h) {
  const cx = w / 2, cy = h / 2, k = Math.min(w, h) / 300;
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  ellipse(g, cx, cy, 104 * k, 128 * k, "#bdbdbd");                       // 頭皮
  ellipse(g, cx, cy, 98 * k, 122 * k, "#202020");                        // 顱骨（暗）
  ellipse(g, cx, cy, 92 * k, 116 * k, "#d9d9d9");                        // 腦脊髓液（T2 亮）
  ellipse(g, cx, cy, 87 * k, 111 * k, "#8e8e8e");                        // 灰質
  ellipse(g, cx, cy + 2 * k, 70 * k, 92 * k, "#5f5f5f");                 // 白質
  g.strokeStyle = "#8e8e8e"; g.lineWidth = 5 * k;                        // 腦溝
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 70 * k, cy + Math.sin(a) * 92 * k); g.lineTo(cx + Math.cos(a) * 84 * k, cy + Math.sin(a) * 106 * k); g.stroke(); }
  g.fillStyle = "#e8e8e8";                                               // 側腦室（T2 亮）
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 13 * k, cy - 4 * k, 8 * k, 34 * k, s * -0.18, 0, Math.PI * 2); g.fill(); }
  g.fillRect(cx - 2 * k, cy - 112 * k, 4 * k, 224 * k);                 // 大腦縱裂
  ellipse(g, cx, cy + 40 * k, 6 * k, 9 * k, "#e8e8e8");
}
export function drawMRI(cv, { blur }) {
  const g = cv.getContext("2d"), w = cv.width, h = cv.height;
  if (!blur) { brain(g, w, h); return; }
  const off = document.createElement("canvas"); off.width = w; off.height = h; brain(off.getContext("2d"), w, h);
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  g.filter = "blur(1.2px)"; g.drawImage(off, 0, 0);
  g.filter = "blur(1.5px)";
  for (const [dy, a] of [[-16, 0.3], [16, 0.3], [-32, 0.14], [32, 0.14]]) { g.globalAlpha = a; g.drawImage(off, 0, dy); }   // 相位方向重影（躁動）
  g.globalAlpha = 1; g.filter = "none";
}
