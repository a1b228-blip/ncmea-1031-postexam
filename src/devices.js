// 考場儀器寫實模型：生理監視器（會跳的心電圖）、雙筒對比劑注射器、控制台電腦（CT／MRI 操作畫面）、
// 鍵盤滑鼠、智慧型手機、血氧機。全部以「考場配置圖座標」建模（1 單位約 2 公分），
// 由 world.js 的 item() 整組縮小放進林口座標。正面一律朝 -z（＝林口的西側，進門方向）。
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const cache = new Map();
const M = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.08, ...o }));
  return cache.get(k);
};
const shade = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };
const rbox = (w, h, d, r, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2) * 0.999), mat);
const cylM = (r1, r2, h, mat, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

function canvasTex(w, h) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { cv, g: cv.getContext("2d"), t };
}
// 螢幕面板（朝 -z）
function screen(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex.t, toneMapped: false }));
  m.rotation.y = Math.PI; return m;
}
const FONT = (px, w = 700) => `${w} ${px}px "PingFang TC","Helvetica Neue",Arial,sans-serif`;

// ---------- 螢幕內容 ----------
// 生理監視器：心電圖、血氧波形、呼吸、數值（動態）
const pm = canvasTex(640, 440);
function ecg(p) {
  p %= 1;
  if (p < 0.08) return 0;
  if (p < 0.16) return 0.12 * Math.sin(((p - 0.08) / 0.08) * Math.PI);
  if (p < 0.27) return 0;
  if (p < 0.29) return -0.12 * ((p - 0.27) / 0.02);
  if (p < 0.32) return -0.12 + 1.12 * ((p - 0.29) / 0.03);
  if (p < 0.35) return 1 - 1.3 * ((p - 0.32) / 0.03);
  if (p < 0.38) return -0.3 + 0.3 * ((p - 0.35) / 0.03);
  if (p < 0.5) return 0;
  if (p < 0.66) return 0.26 * Math.sin(((p - 0.5) / 0.16) * Math.PI);
  return 0;
}
// 安妮的生理監視器（獨立螢幕）：mode normal／af／arrest，hr 可以慢慢往下掉（數值為示意）
export const annieVitals = { mode: "normal", hr: 78 };
const pmA = canvasTex(640, 440);
export const annieMonitorCanvas = pmA.cv;
const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function qrs(d) {                                   // d：離 R 波的距離（單位：一個心跳）
  if (d < -0.045 || d > 0.06) return 0;
  if (d < -0.02) return -0.12 * ((d + 0.045) / 0.025);
  if (d < 0) return -0.12 + 1.12 * ((d + 0.02) / 0.02);
  if (d < 0.025) return 1 - 1.3 * (d / 0.025);
  return -0.3 + 0.3 * ((d - 0.025) / 0.035);
}
function ecgAF(p, hr) {                             // AF：沒有 P 波、基線細顫、R-R 間隔不規則
  let v = 0.05 * Math.sin(p * 41) + 0.035 * Math.sin(p * 67 + 1.3) + 0.03 * Math.sin(p * 23 + 0.7);
  const mean = 78 / Math.max(hr, 20);
  let b = 0.15;
  for (let k = 0; b < p + 0.2 && k < 60; k++) { v += qrs(p - b); b += mean * (0.55 + 0.9 * rnd(k)); }
  return v;
}
const pleth = (p) => { p %= 1; return p < 0.35 ? Math.sin((p / 0.35) * Math.PI / 2) : Math.max(0, 1 - (p - 0.35) / 0.65 * 1.1 + 0.12 * Math.sin(((p - 0.35) / 0.2) * Math.PI) * (p < 0.55 ? 1 : 0)); };
function drawPM(t, scr = pm, v = null) {
  const { g } = scr, W = 640, H = 440, mode = v?.mode ?? "normal";
  g.fillStyle = "#03060a"; g.fillRect(0, 0, W, H);
  const alarm = mode !== "normal" && Math.floor(t * 2) % 2 === 0;
  g.fillStyle = mode === "normal" ? "#16213a" : alarm ? "#b91c1c" : "#450a0a"; g.fillRect(0, 0, W, 34);
  g.fillStyle = "#e2e8f0"; g.font = FONT(18, 600); g.textAlign = "left";
  g.fillText(mode === "af" ? "警報　AF／心跳變慢（示意）" : mode === "arrest" ? "警報　心跳停止（示意）" : v ? "成人　監測中（示意）" : "成人　監測中", 12, 24);
  g.textAlign = "right"; g.fillText("12:40", W - 12, 24);
  const flat = () => 0;
  const ecgF = mode === "af" ? (p) => ecgAF(p, v.hr) : mode === "arrest" ? (p) => 0.02 * Math.sin(p * 9) : ecg;
  const sweep = ((t * 0.18) % 1) * 430;
  const wave = (y0, amp, f, color, rate, lw = 3) => {
    g.strokeStyle = color; g.lineWidth = lw; g.beginPath();
    for (let x = 0; x <= 430; x += 2) {
      if (Math.abs(x - sweep) < 14) { g.stroke(); g.beginPath(); continue; }
      const y = y0 - f((x / 430) * rate + (x > sweep ? -1 : 0) * 0) * amp;
      x === 0 || Math.abs(x - sweep) < 16 ? g.moveTo(10 + x, y) : g.lineTo(10 + x, y);
    }
    g.stroke();
  };
  g.font = FONT(15, 700); g.textAlign = "left";
  g.fillStyle = "#22c55e"; g.fillText("II", 14, 58); wave(150, 85, ecgF, "#22c55e", 4.2);
  g.fillStyle = "#22d3ee"; g.fillText("Pleth", 14, 212); wave(290, 62, mode === "arrest" ? flat : pleth, "#22d3ee", mode === "af" ? 4.2 * v.hr / 78 : 4.2);
  g.fillStyle = "#facc15"; g.fillText("Resp", 14, 338); wave(410, 26, (p) => 0.5 + 0.5 * Math.sin(p * Math.PI * 2), "#facc15", 1.3, 2.5);
  g.strokeStyle = "#1e293b"; g.lineWidth = 2; g.beginPath(); g.moveTo(452, 40); g.lineTo(452, H - 6); g.stroke();
  const num = (label, v, unit, y, c, size = 64) => {
    g.textAlign = "left"; g.fillStyle = c; g.font = FONT(16, 700); g.fillText(label, 464, y - size + 6);
    g.font = FONT(size, 800); g.fillText(v, 470, y); g.font = FONT(14, 600); g.fillText(unit, 470 + g.measureText(v).width + 6, y);
  };
  const hr = !v ? "78" : mode === "arrest" ? "--" : String(Math.round(v.hr));
  num("HR", hr, "bpm", 112, mode !== "normal" ? "#f87171" : "#22c55e", 70);
  num("SpO₂", mode === "arrest" ? "--" : "98", "%", 216, "#22d3ee", 66);
  num("NIBP", mode === "arrest" ? "--" : "118/76", "", 316, "#f87171", 40);
  num("RR", mode === "arrest" ? "--" : "18", "/min", 410, "#facc15", 48);
  scr.t.needsUpdate = true;
}
// 血氧機小螢幕
const ox = canvasTex(256, 160);
function drawOX(t) {
  const { g } = ox;
  g.fillStyle = "#03060a"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#22d3ee"; g.font = FONT(16, 700); g.textAlign = "left"; g.fillText("SpO₂ %", 12, 26); g.fillText("PR", 160, 26);
  g.font = FONT(64, 800); g.fillText("98", 10, 92); g.fillStyle = "#22c55e"; g.font = FONT(42, 800); g.fillText("78", 160, 86);
  const h = 40 * pleth(t * 1.3);
  g.fillStyle = "#22d3ee"; g.fillRect(12, 150 - h, 230 * 0.06, h);
  g.strokeStyle = "#22d3ee"; g.lineWidth = 2.5; g.beginPath();
  for (let x = 0; x < 200; x += 3) { const y = 148 - 34 * pleth(t * 1.3 - x / 120); x ? g.lineTo(40 + x, y) : g.moveTo(40 + x, y); }
  g.stroke();
  ox.t.needsUpdate = true;
}
// 注射器控制面板
const inj = canvasTex(320, 200);
(() => {
  const { g } = inj;
  g.fillStyle = "#0b1220"; g.fillRect(0, 0, 320, 200);
  g.fillStyle = "#1e3a5f"; g.fillRect(0, 0, 320, 32); g.fillStyle = "#e2e8f0"; g.font = FONT(17, 700); g.textAlign = "left"; g.fillText("CT 雙筒注射器", 12, 23);
  g.fillStyle = "#22c55e"; g.textAlign = "right"; g.fillText("READY", 308, 23);
  const row = (k, name, ml, c, y) => {
    g.textAlign = "left"; g.fillStyle = c; g.font = FONT(22, 800); g.fillText(k, 14, y);
    g.fillStyle = "#cbd5e1"; g.font = FONT(16, 600); g.fillText(name, 44, y);
    g.fillStyle = "#fff"; g.font = FONT(26, 800); g.textAlign = "right"; g.fillText(ml, 306, y);
    g.fillStyle = "#1e293b"; g.fillRect(14, y + 8, 292, 8); g.fillStyle = c; g.fillRect(14, y + 8, 292 * 0.7, 8);
  };
  row("A", "對比劑", "80 mL", "#f59e0b", 72); row("B", "生理食鹽水", "40 mL", "#38bdf8", 124);
  g.fillStyle = "#94a3b8"; g.font = FONT(16, 600); g.textAlign = "left"; g.fillText("流速 4.0 mL/s　壓力上限 300 psi", 14, 182);
})();

// 控制台電腦畫面：考場實際畫面（TWGH 系統首頁：電腦斷層掃描系統／PACS 影像系統／檢驗報告查詢系統）
const consoleTex = (() => {
  const t = new THREE.TextureLoader().load("assets/console-screen.png");
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
})();
// PACS 看胸部 X 光（示意）：左側選單與首頁相同，選到 PACS 影像系統，右側顯示胸部正面 X 光
export const pacsTex = (() => {
  const s = canvasTex(1918, 1005), { g } = s, W = 1918, H = 1005;
  g.fillStyle = "#f8fafc"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#e2e8f0"; g.fillRect(236, 0, 2, H);
  g.font = "italic 600 40px Helvetica, Arial"; g.fillStyle = "#94a3b8"; g.fillText("TWGH", 70, 62);
  g.fillStyle = "#dbeafe"; g.fillRect(10, 430, 216, 170);
  [["電腦斷層", "掃描系統", 340], ["PACS", "影像系統", 515], ["檢驗報告", "查詢系統", 690]].forEach(([a, b, y], i) => {
    g.fillStyle = i === 1 ? "#1d4ed8" : "#64748b"; g.font = FONT(30, 600); g.textAlign = "center";
    g.fillText(a, 118, y); g.fillText(b, 118, y + 44);
  });
  g.textAlign = "left";
  g.fillStyle = "#0b0b0b"; g.fillRect(260, 20, W - 280, H - 40);
  g.fillStyle = "#cbd5e1"; g.font = FONT(26, 600); g.fillText("PACS 影像系統　｜　Chest PA", 290, 66);
  // 胸部 X 光（示意）
  const cx = 1090, cy = 540, gr = g.createRadialGradient(cx, cy, 60, cx, cy, 430);
  gr.addColorStop(0, "#3a3a3a"); gr.addColorStop(1, "#111"); g.fillStyle = gr; g.fillRect(560, 100, 1060, 860);
  g.fillStyle = "#1b1b1b"; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 180, cy + 10, 160, 300, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "rgba(220,220,220,.55)"; g.lineWidth = 12;
  for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 150, cy - 250 + i * 58, 190, 46, sx * 0.18, sx > 0 ? Math.PI * 1.05 : -Math.PI * 0.05, sx > 0 ? Math.PI * 1.95 : Math.PI * 0.95, sx < 0); g.stroke(); }
  g.fillStyle = "rgba(225,225,225,.8)"; g.fillRect(cx - 18, 140, 36, 760);
  g.fillStyle = "rgba(200,200,200,.5)"; g.beginPath(); g.ellipse(cx + 70, cy + 150, 150, 120, 0.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(230,230,230,.7)"; g.lineWidth = 16; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 40, 210); g.quadraticCurveTo(cx + sx * 220, 170, cx + sx * 380, 230); g.stroke(); }
  g.fillStyle = "#e5e7eb"; g.font = FONT(30, 800); g.fillText("R", 600, 150);
  return s.t;
})();
const keysTex = (() => {
  const s = canvasTex(256, 96), { g } = s;
  g.fillStyle = "#1f2937"; g.fillRect(0, 0, 256, 96); g.fillStyle = "#4b5563";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) g.fillRect(5 + c * 16.6, 6 + r * 17.5, 14, 14);
  g.fillRect(60, 6 + 4 * 17.5, 120, 14);
  return s;
})();
const phoneTex = (() => {
  const s = canvasTex(160, 320), { g } = s;
  const grd = g.createLinearGradient(0, 0, 160, 320); grd.addColorStop(0, "#1e3a8a"); grd.addColorStop(1, "#0f172a");
  g.fillStyle = grd; g.fillRect(0, 0, 160, 320);
  g.fillStyle = "#fff"; g.textAlign = "center"; g.font = FONT(46, 300); g.fillText("12:40", 80, 92); g.font = FONT(14, 500); g.fillText("10月31日 星期六", 80, 116);
  g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.roundRect(14, 230, 132, 46, 12); g.fill();
  g.fillStyle = "#fff"; g.font = FONT(13, 600); g.fillText("分機 / 999", 80, 259);
  return s;
})();

// ---------- 模型 ----------
// 有輪腳架底座（五爪＋輪子）
function castorBase(r, legs = 5) {
  const g = new THREE.Group(), metal = M(0x9aa3ad, { metalness: 0.6, roughness: 0.35 }), dark = M(0x1f2937);
  g.add(at(cylM(2.4, 2.8, 3, metal), 0, 3, 0));
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2, leg = new THREE.Mesh(new THREE.BoxGeometry(r, 1.4, 2.2), metal);
    leg.position.set(Math.cos(a) * r / 2, 3, Math.sin(a) * r / 2); leg.rotation.y = -a; g.add(leg);
    const w = cylM(1.3, 1.3, 1.2, dark, 14); w.rotation.z = Math.PI / 2; w.position.set(Math.cos(a) * r, 1.3, Math.sin(a) * r); g.add(w);
  }
  return g;
}

export function patientMonitor({ own = false } = {}) {
  const g = new THREE.Group(), white = M(0xeef1f4), grey = M(0x9aa3ad, { metalness: 0.55, roughness: 0.35 }), dark = M(0x1f2937);
  g.add(castorBase(13));
  g.add(at(cylM(1.2, 1.2, 64, grey), 0, 35, 0));
  g.add(at(rbox(9, 6, 6, 1, M(0x64748b)), 0, 44, 0));                         // 配件籃
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 6), grey), 0, 68, -2));   // 支架
  const head = new THREE.Group(); head.position.set(0, 76, -4); head.rotation.x = -0.12; g.add(head);
  head.add(rbox(28, 21, 7, 2, white));
  head.add(at(rbox(26, 18.5, 0.6, 0.5, dark), 0, 0, -3.4));
  const scr = screen(own ? pmA : pm, 23.4, 16.1); scr.position.set(0.2, 0.2, -3.75); head.add(scr); g.userData.screen = scr;   // 換 Blender 版本時保留這片會動的螢幕
  const handle = new THREE.Mesh(new THREE.TorusGeometry(6, 0.9, 10, 24, Math.PI), white); handle.position.set(0, 10.5, 0); head.add(handle);
  const knob = cylM(1.4, 1.4, 1.2, M(0x334155)); knob.rotation.x = Math.PI / 2; knob.position.set(12, -8.2, -3.8); head.add(knob);
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e })), 12, 8.6, -3.8));
  // 導線垂下
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(10, 66, -2), new THREE.Vector3(13, 52, -6), new THREE.Vector3(9, 40, -9)]), 16, 0.35, 6), M(0x111827));
  g.add(cable);
  return shade(g);
}

export function pulseOximeter() {
  const g = new THREE.Group(), white = M(0xf1f5f9), grey = M(0x9aa3ad, { metalness: 0.55, roughness: 0.35 });
  g.add(castorBase(9));
  g.add(at(cylM(1, 1, 44, grey), 0, 25, 0));
  const head = new THREE.Group(); head.position.set(0, 50, -2); head.rotation.x = -0.15; g.add(head);
  head.add(rbox(14, 10, 5, 1.6, white));
  const scr = screen(ox, 11, 6.9); scr.position.set(0, 0.6, -2.55); head.add(scr);
  const probe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(6, 46, -1), new THREE.Vector3(9, 36, -5), new THREE.Vector3(6, 28, -7)]), 12, 0.3, 6), M(0x1f2937));
  g.add(probe); g.add(at(rbox(2.2, 1.6, 3.2, 0.6, M(0x2563eb)), 6, 27.4, -7));
  return shade(g);
}

// 雙筒對比劑注射器（立架式）：A 筒對比劑（琥珀色）、B 筒生理食鹽水；管路接到檢查床方向（-x）
export function contrastInjector() {
  const g = new THREE.Group(), white = M(0xf4f6f8), grey = M(0x9aa3ad, { metalness: 0.55, roughness: 0.35 });
  g.add(castorBase(13));
  g.add(at(cylM(2.2, 2.6, 56, grey), 0, 31, 0));
  g.add(at(rbox(6, 5, 6, 1.2, white), 0, 60, 0));                                // 關節
  const arm = at(rbox(16, 3.4, 4, 1.2, white), -7, 62, 0); g.add(arm);           // 橫臂
  const head = new THREE.Group(); head.position.set(-15, 63, 0); head.rotation.z = 0.5; g.add(head);  // 注射頭朝 -x 往下傾
  head.add(rbox(14, 9, 16, 2.4, white));
  head.add(at(rbox(8, 0.6, 10, 0.3, M(0x0b1220)), 2, 4.6, 0));
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.6), new THREE.MeshBasicMaterial({ map: inj.t, toneMapped: false }));
  disp.rotation.x = -Math.PI / 2; disp.rotation.z = -Math.PI / 2; disp.position.set(2, 4.95, 0); head.add(disp); g.userData.screen = disp;   // 換 Blender 版本時保留這片螢幕
  const glass = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false });
  for (const [z, fluid] of [[-4, 0xf59e0b], [4, 0x38bdf8]]) {
    const s = cylM(2.6, 2.6, 16, glass, 24); s.rotation.z = Math.PI / 2; s.position.set(-15, 0, z); head.add(s);
    const f = cylM(2.3, 2.3, 11, M(fluid, { roughness: 0.25, emissive: fluid, emissiveIntensity: 0.25 }), 24); f.rotation.z = Math.PI / 2; f.position.set(-17, 0, z); head.add(f);
    const tip = cylM(0.6, 1.6, 2.6, glass, 16); tip.rotation.z = Math.PI / 2; tip.position.set(-24.2, 0, z); head.add(tip);
    const plunger = cylM(2.3, 2.3, 1.2, M(0x334155), 20); plunger.rotation.z = Math.PI / 2; plunger.position.set(-10.5, 0, z); head.add(plunger);
  }
  head.add(at(rbox(3, 10, 14, 1, M(0xcbd5e1)), -7, 0, 0));                       // 筒座
  // 延長管：從針筒前端彎到檢查床（-x 方向、下方）
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-36, 49, 0), new THREE.Vector3(-41, 42, 6), new THREE.Vector3(-40, 35, 16), new THREE.Vector3(-36, 31.4, 30)]), 30, 0.45, 8), M(0xe0f2fe, { transparent: true, opacity: 0.7 }));
  g.add(tube);
  return shade(g);
}

// 智慧型手機（平放桌上）
export function smartphone() {
  const g = new THREE.Group();
  g.add(rbox(4.2, 0.5, 8.6, 0.5, M(0x111827, { roughness: 0.3, metalness: 0.4 })));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 8.1), new THREE.MeshBasicMaterial({ map: phoneTex.t, toneMapped: false }));
  s.rotation.x = -Math.PI / 2; s.rotation.z = Math.PI; s.position.y = 0.27; g.add(s);
  return shade(g);
}

// 控制台：辦公桌＋單螢幕電腦＋主機＋鍵盤滑鼠＋手機＋緊急停止盒（＋CT 有對講麥克風）
export function workstation(w, d, kind) {
  const g = new THREE.Group(), top = 34;
  const wood = M(0xb08d6a, { roughness: 0.7 }), frame = M(0x9aa3ad, { metalness: 0.5, roughness: 0.4 }), dark = M(0x1f2937, { roughness: 0.4 });
  g.add(at(rbox(w, 2.4, d, 0.8, wood), 0, top - 1.2, 0));
  g.add(at(rbox(w * 0.28, top - 3, d - 4, 0.6, M(0xd6cbbd)), -w / 2 + w * 0.16, (top - 3) / 2, 0));   // 抽屜櫃
  for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, 0.5, 0.6), frame), -w / 2 + w * 0.16, 6 + i * 9, -d / 2 + 1.6));
  for (const z of [-d / 2 + 2, d / 2 - 2]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.6, top - 2.4, 1.6), frame), w / 2 - 2, (top - 2.4) / 2, z));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 14, 0.8), M(0xcfc5b8)), w * 0.14, top - 10, d / 2 - 2));  // 擋板
  g.add(at(rbox(8, 18, 18, 1, dark), w / 2 - 10, 9.5, 2));                      // 電腦主機（桌下）
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 })), w / 2 - 10, 15, -7.1));
  // 單一螢幕（畫面比例與實際畫面相同 1918×1005）
  {
    const mon = new THREE.Group(); mon.position.set(0, top, d / 2 - 7); g.add(mon);
    mon.add(at(rbox(10, 0.8, 7, 0.4, dark), 0, 0.4, 0));
    mon.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.6, 9, 1.2), dark), 0, 5, 0.9));
    mon.add(at(rbox(31.4, 17, 1.4, 0.5, dark), 0, 15, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(30, 15.7), new THREE.MeshBasicMaterial({ map: consoleTex, toneMapped: false }));
    scr.rotation.y = Math.PI; scr.position.set(0, 15.2, -0.72); mon.add(scr); g.userData.screen = scr;
  }
  // 鍵盤、滑鼠
  const kb = rbox(19, 0.9, 6.4, 0.35, M(0x111827)); kb.position.set(-2, top + 0.45, -d / 2 + 8); g.add(kb);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(18.4, 6), new THREE.MeshStandardMaterial({ map: keysTex.t, roughness: 0.6 }));
  keys.rotation.x = -Math.PI / 2; keys.rotation.z = Math.PI; keys.position.set(-2, top + 0.92, -d / 2 + 8); g.add(keys);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), M(0x111827, { roughness: 0.3 })); mouse.scale.set(1, 0.55, 1.5); mouse.position.set(11, top + 0.7, -d / 2 + 8); g.add(mouse);
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 6), M(0x334155)), 11, top + 0.1, -d / 2 + 8));
  // 手機
  const ph = smartphone(); ph.position.set(w / 2 - 9, top + 0.25, -d / 2 + 8); ph.rotation.y = 0.35; g.add(ph);
  // 緊急停止／操作盒
  const box = at(rbox(7, 2.4, 5, 0.6, M(0xe5e7eb)), -w / 2 + 9, top + 1.2, -d / 2 + 8); g.add(box);
  g.add(at(cylM(1.3, 1.5, 1.4, M(0xdc2626, { roughness: 0.35 })), -w / 2 + 7.2, top + 3, -d / 2 + 8));
  g.add(at(cylM(0.9, 0.9, 0.6, M(0x16a34a)), -w / 2 + 10.6, top + 2.6, -d / 2 + 8));
  if (kind === "ct") {                                                          // 對講麥克風（鵝頸）
    g.add(at(cylM(2, 2.4, 1, dark), -w / 2 + 20, top + 0.5, d / 2 - 4));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-w / 2 + 20, top + 1, d / 2 - 4), new THREE.Vector3(-w / 2 + 20, top + 9, d / 2 - 5), new THREE.Vector3(-w / 2 + 19, top + 12, d / 2 - 9)]), 12, 0.35, 6), dark));
    g.add(at(cylM(0.8, 0.8, 2, dark), -w / 2 + 19, top + 12.4, d / 2 - 10));
  }
  return shade(g);
}

// 每幀更新動態螢幕（約每 60 毫秒重畫一次）
let last = 0;
export function animateDevices(now) {
  if (now - last < 60) return; last = now;
  const t = now / 1000; drawPM(t); drawPM(t, pmA, annieVitals); drawOX(t);
}
drawPM(0); drawOX(0);

// ---------- 等候區設備（靠後牆）與推床上的安妮 ----------
// 急救車：正面四層抽屜、上層托盤放電擊器與甦醒球
export function crashCart() {
  const g = new THREE.Group(), red = M(0xdc2626, { roughness: 0.4 }), grey = M(0x9ca3af, { metalness: 0.5, roughness: 0.35 }), dark = M(0x1f2937);
  g.add(at(rbox(30, 38, 22, 1.5, red), 0, 22, 0));
  for (let i = 0; i < 4; i++) {
    g.add(at(rbox(27, 7.6, 0.8, 0.4, M(0xb91c1c)), 0, 8 + i * 9, -11.2));
    g.add(at(rbox(10, 1.2, 1.4, 0.5, M(0xf1f5f9)), 0, 9.8 + i * 9, -11.8));
  }
  g.add(at(rbox(32, 2, 24, 0.8, grey), 0, 41.5, 0));                              // 上層托盤
  for (const [x, z] of [[-12, -8], [12, -8], [-12, 8], [12, 8]]) { const w = cylM(1.6, 1.6, 1.4, dark, 14); w.rotation.z = Math.PI / 2; w.position.set(x, 1.8, z); g.add(w); }
  const bar = new THREE.Mesh(new THREE.TorusGeometry(5, 0.6, 8, 20, Math.PI), grey); bar.rotation.y = Math.PI / 2; bar.position.set(15.5, 34, 0); g.add(bar);
  g.add(at(rbox(13, 7, 10, 1.2, M(0xfacc15)), -6, 46, 0));                        // 電擊器
  g.add(at(rbox(8, 0.3, 5, 0.2, M(0x0b1220)), -6, 49.6, -1));
  const bag = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), M(0x2563eb, { roughness: 0.6 })); bag.scale.set(1.6, 1, 1); bag.position.set(8, 45.6, 2); g.add(bag); // 甦醒球
  g.add(at(cylM(2.2, 2.8, 2, M(0x334155)), 13.5, 45.6, 2));
  return shade(g);
}
// 氧氣鋼瓶（推車式，綠色鋼瓶＋壓力錶）
export function oxygenCylinder() {
  const g = new THREE.Group(), grey = M(0x9aa3ad, { metalness: 0.6, roughness: 0.35 }), dark = M(0x1f2937);
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 12), grey), 0, 2.2, 0));
  for (const x of [-6, 6]) { const w = cylM(2.4, 2.4, 1.4, dark, 16); w.rotation.z = Math.PI / 2; w.position.set(x, 2.4, 5); g.add(w); }
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 50, 1.2), grey), -5, 27, 6)); g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 50, 1.2), grey), 5, 27, 6));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 1.2), grey), 0, 51, 6));
  g.add(at(cylM(5.5, 5.5, 48, M(0x15803d, { roughness: 0.35, metalness: 0.2 }), 28), 0, 27, 0));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(5.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0x15803d, { roughness: 0.35 })), 0, 51, 0));
  g.add(at(cylM(1.6, 1.6, 4, M(0xb08d57, { metalness: 0.7, roughness: 0.3 })), 0, 57, 0));      // 閥門
  const gauge = cylM(2.6, 2.6, 1.2, M(0xf8fafc), 24); gauge.rotation.x = Math.PI / 2; gauge.position.set(0, 60, -1.6); g.add(gauge);
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.2), M(0xdc2626)), 0.4, 60.4, -2.3));
  return shade(g);
}
// 輪椅：大後輪＋手推圈、小前輪、扶手、腳踏板、推把（座位朝 -z）
export function wheelchair() {
  const g = new THREE.Group(), frame = M(0x9aa3ad, { metalness: 0.6, roughness: 0.35 }), seat = M(0x1f2937, { roughness: 0.8 }), tyre = M(0x111827);
  g.add(at(rbox(18, 1.6, 18, 0.6, seat), 0, 20, 0));
  g.add(at(rbox(18, 18, 1.4, 0.6, seat), 0, 30, 9));
  for (const s of [-1, 1]) {
    const x = s * 11;
    const w = new THREE.Mesh(new THREE.TorusGeometry(11, 1.2, 10, 36), tyre); w.rotation.y = Math.PI / 2; w.position.set(x, 11.5, 4); g.add(w);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.4, 6, 30), frame); rim.rotation.y = Math.PI / 2; rim.position.set(x + s * 1.6, 11.5, 4); g.add(rim);
    const hub = at(cylM(1.4, 1.4, 1.6, frame), x, 11.5, 4); hub.rotation.z = Math.PI / 2; g.add(hub);
    const c = cylM(2.2, 2.2, 1.2, tyre, 14); c.rotation.z = Math.PI / 2; c.position.set(s * 8, 2.2, -9); g.add(c);
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1, 18, 1), frame), s * 9, 11, -8));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 16), frame), s * 9.5, 27, 1));        // 扶手
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1, 10, 1), frame), s * 9.5, 22, -6));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1, 22, 1), frame), s * 9, 30, 9.6));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 5), frame), s * 9, 40.5, 11.5));          // 推把
    g.add(at(rbox(6, 0.8, 5, 0.3, seat), s * 4, 5, -13));                                        // 腳踏板
  }
  return shade(g);
}
// 安妮身上管線接點（anne() 的本地座標）：EKG 電極 [x, z, 夾子顏色]、血氧夾、血壓袖帶
export const ANNE_LEADS = {
  ecg: [[-25, -5, 0xf8fafc], [-25, 5, 0x111827], [-8, -5, 0x16a34a], [-8, 5, 0xdc2626]],
  spo2: [1, 2.6, 10], cuff: [-20, 2.4, -10],
};
// 安妮（CPR 急救假人，Resusci Anne 外型）：仰躺，長軸沿 x，頭在 -x、臉朝上
// 塑膠膚色＋模具臉（閉眼、微張的嘴）＋模具頭髮；藍色運動服外套敞開露出胸口（貼片、壓胸位置），藍色運動褲＋白色側條
// 尺寸與接點（胸口高度、手指、上臂、頭）跟原本一樣，導線、BVM、背板、壓胸動畫都不用重新對位
export function anne() {
  const g = new THREE.Group();
  const skin = M(0xeccbb0, { roughness: 0.42, metalness: 0.02 }), suit = M(0x1d4ed8, { roughness: 0.75 }), stripe = M(0xf8fafc, { roughness: 0.6 });
  const hair = M(0x5b4126, { roughness: 0.55 }), line = M(0x6b4a33, { roughness: 0.6 }), lip = M(0xc98b7f, { roughness: 0.45 }), dark = M(0x3b1f1a, { roughness: 0.7 });
  const add = (m) => { g.add(m); return m; }, rz = (m) => { m.rotation.z = Math.PI / 2; return m; };
  const ell = (r, sx, sy, sz, m, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m); o.scale.set(sx, sy, sz); return add(at(o, x, y, z)); };
  // 頭：橢圓頭型＋模具臉（下巴朝 +x、額頭朝 -x）；五官高度依頭型曲面（半徑 5.4×4.6×4.4）貼齊
  ell(5, 1.08, 0.92, 0.88, skin, -36, 4.6, 0);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(5.15, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);   // 模具頭髮：蓋住頭頂與後腦
  cap.scale.set(1.08, 0.92, 0.9); cap.rotation.z = Math.PI / 2 + 0.35; cap.position.set(-36.6, 4.3, 0); add(cap);
  for (const z of [-1.9, 1.9]) {
    add(at(rz(cylM(0.17, 0.17, 1.8, line, 6)), -37.2, 8.78, z)).rotation.set(Math.PI / 2, 0, 0.12 * Math.sign(z));   // 閉著的眼睛（眼線）
    ell(1, 0.5, 0.3, 1.05, skin, -37.45, 8.5, z);                                                                  // 眼皮隆起
    add(at(rz(cylM(0.14, 0.14, 1.9, line, 6)), -38.7, 8.12, z)).rotation.set(Math.PI / 2, 0, 0.1 * Math.sign(z));                       // 眉毛
    ell(1.1, 0.8, 1.2, 0.45, skin, -36.4, 4.7, z * 2.45);                                                           // 耳朵
  }
  ell(0.95, 1.6, 0.9, 0.85, skin, -35.5, 9.25, 0);                                                                   // 鼻子
  ell(1, 0.55, 0.3, 1.45, lip, -33.5, 8.55, 0);                                                                     // 嘴唇
  ell(0.6, 0.35, 0.2, 1.05, dark, -33.45, 8.78, 0);                                                                  // 微張的嘴（人工呼吸口）
  ell(1.4, 1, 0.7, 1.3, skin, -32, 7.1, 0);                                                                          // 下巴
  add(at(rz(cylM(2.5, 2.7, 5, skin)), -30, 3.2, 0));                                                                 // 頸
  // 胸口（CPR 按壓處）：塑膠皮膚＋乳頭、胸骨凹痕；外套從兩側敞開
  const chestParts = [add(at(rbox(24, 7, 16, 3, skin), -16, 3.8, 0))];               // 壓胸時這些會跟著下陷（見最後的 chest 群組）
  for (const z of [-3.6, 3.6]) chestParts.push(ell(0.45, 1, 0.3, 1, M(0xc9967e, { roughness: 0.5 }), -14, 7.3, z));
  chestParts.push(add(at(new THREE.Mesh(new THREE.BoxGeometry(5, 0.15, 0.5), M(0xdcb79b, { roughness: 0.5 })), -21, 7.32, 0)));
  for (const s of [-1, 1]) {
    add(at(rbox(25, 7.6, 3.2, 1.4, suit), -15.5, 3.8, s * 7.4));                       // 外套前襟（兩側）
    add(at(new THREE.Mesh(new THREE.BoxGeometry(25, 0.5, 0.35), stripe), -15.5, 7.45, s * 5.9));   // 拉鍊邊條
    ell(3.2, 1.1, 0.95, 1, suit, -26, 3.4, s * 8.6);                                   // 肩膀
    add(at(rbox(4, 2, 5.5, 0.8, suit), -28.6, 5.2, s * 4.4)).rotation.y = s * 0.35;    // 外套領子
  }
  add(at(rbox(12, 6.6, 15, 3, suit), 1, 3.6, 0));                                       // 腹部（外套下擺）
  add(at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.8, 15.4), stripe), 6.6, 3.6, 0));   // 腰部鬆緊帶
  // 雙腳：藍色運動褲＋白色側條＋黑色球鞋
  for (const z of [-4, 4]) {
    add(at(rz(cylM(2.8, 2.2, 32, suit, 16)), 22, 3, z));
    add(at(new THREE.Mesh(new THREE.BoxGeometry(31, 0.45, 0.45), stripe), 22, 3.4, z + Math.sign(z) * 2.45));
    add(at(rbox(3.4, 6.2, 4.2, 1.2, M(0x111827, { roughness: 0.5 })), 39, 4.5, z));
    add(at(rbox(3.6, 1, 4.4, 0.4, stripe), 39.2, 1.6, z));                               // 鞋底
  }
  // 雙手：藍色袖子＋白色袖口條＋塑膠手掌（血氧夾在右手指、血壓袖帶在左上臂，位置不變）
  for (const z of [-10, 10]) {
    add(at(rz(cylM(2.1, 1.7, 22, suit, 14)), -13, 2.4, z));
    add(at(rz(cylM(1.75, 1.75, 0.9, stripe, 14)), -1.6, 2.4, z));
    ell(1.7, 1.45, 0.55, 1, skin, 1.2, 2.2, z);
    ell(0.5, 1.6, 0.6, 0.6, skin, 0.4, 2.6, z + Math.sign(z) * 1.5);                    // 大拇指
  }
  const bodyParts = g.children.filter((o) => !chestParts.includes(o)), chestLook = [...chestParts];   // 換 Blender 版本時要藏起來的舊外觀（電極、血氧夾、袖帶不算）
  // 已接好生理監視器：胸前 4 片 EKG 電極、手指血氧夾、上臂血壓袖帶
  for (const [x, z, c] of ANNE_LEADS.ecg) {
    const pad = cylM(1.5, 1.5, 0.3, M(0xf8fafc), 16); pad.position.set(x, 7.45, z); g.add(pad);
    const clip = at(cylM(0.55, 0.55, 0.8, M(c), 10), x, 7.9, z); g.add(clip);
    chestParts.push(pad, clip);
  }
  g.add(at(rbox(2.6, 2, 2.2, 0.8, M(0x2563eb)), ...ANNE_LEADS.spo2));                    // 血氧夾（右手指）
  const cuff = cylM(2.8, 2.8, 6, M(0x475569, { roughness: 0.8 }), 18); cuff.rotation.z = Math.PI / 2; cuff.position.set(...ANNE_LEADS.cuff); g.add(cuff); // 血壓袖帶（左上臂）
  // 胸口群組：以胸口底部（高 0.3）為軸，壓胸時 scale.y 變小＝胸口往下陷（world.js compress）
  const chest = new THREE.Group(); chest.position.set(-16, 0.3, 0); g.add(chest); g.updateMatrixWorld(true);
  for (const m of chestParts) chest.attach(m);
  g.userData.chest = chest; g.userData.look = { body: bodyParts, chest: chestLook };
  return shade(g);
}
// 抗磁推床（MRI 專用、可進磁體室），床上躺安妮；長軸沿 x
export function mrStretcherWithAnne() {
  const g = new THREE.Group(), frame = M(0xcbd5e1, { metalness: 0.2, roughness: 0.4 }), dark = M(0x334155);
  for (const [x, z] of [[-38, -10], [38, -10], [-38, 10], [38, 10]]) { const w = cylM(2.4, 2.4, 1.6, dark, 14); w.rotation.x = Math.PI / 2; w.position.set(x, 2.4, z); g.add(w); }
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(84, 2.4, 20), frame), 0, 6, 0));
  for (const x of [-26, 26]) g.add(at(rbox(6, 14, 8, 1.2, frame), x, 14, 0));
  g.add(at(rbox(94, 3, 26, 1, M(0xe2e8f0)), 0, 22.5, 0));
  g.add(at(rbox(90, 4, 24, 2, M(0xddd6fe, { roughness: 0.8 })), 0, 26, 0));            // 床墊
  g.add(at(rbox(14, 3, 20, 1.5, M(0xf8fafc, { roughness: 0.9 })), -38, 29.4, 0));     // 枕頭
  for (const z of [-13.5, 13.5]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(60, 1.2, 1), frame), 4, 32, z));   // 床欄
  const a = anne(); a.position.set(2, 28, 0); g.add(a); g.userData.anne = a;
  return shade(g);
}
// 金屬掃描器（手持式，插在立架上）
export function metalDetector() {
  const g = new THREE.Group(), dark = M(0x334155), black = M(0x111827, { roughness: 0.4 });
  g.add(at(cylM(4, 4.6, 2.4, dark, 24), 0, 1.2, 0));
  g.add(at(cylM(1.1, 1.1, 32, M(0x64748b, { metalness: 0.6 })), 0, 18, 0));
  g.add(at(rbox(6, 4, 6, 1, dark), 0, 35, 0));
  const wand = wandParts(); wand.position.y = 47; g.add(wand); g.userData.wand = wand;   // 掃描棒（可拿起來）
  return shade(g);
}
// 手持金屬探測棒（掛在架上或拿在手上）：原點在探測棒中段
function wandParts() {
  const w = new THREE.Group(), black = M(0x111827, { roughness: 0.4 });
  w.add(rbox(4, 22, 2.2, 1.6, black));
  w.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.4, 14, 1.2), black), 0, 0, -0.6));
  w.add(at(rbox(3, 11, 3, 1.2, M(0xfacc15)), 0, 16, 0));                             // 握把
  w.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e })), 0, 9, -1.2));
  return w;
}
export function handWand() { return shade(wandParts()); }
