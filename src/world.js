// 3D 世界：林口長庚整層樓（入闈、報到、觀摩）＋考場實際配置（A＝CT、B＝MRI，MRI 設備放等候區）
// 座標：x、z ＝ 林口長庚平面圖像素（960×620，約 1 單位＝7 公分），y ＝ 高度。
// 考場內儀器用「考場配置圖」座標（與考後報告 report.html 相同）建模，再用 mapPt 換到林口座標。
import { view } from "./view.js";
import * as THREE from "three";
import gsap from "gsap";
import { createBriefing } from "./briefing.js";
import { makePerson, setPose, personOf, updatePeople, boneWorld, PEOPLE_INFO } from "./people.js";
import { patientMonitor, pulseOximeter, contrastInjector, workstation, animateDevices, crashCart, oxygenCylinder, wheelchair, mrStretcherWithAnne, metalDetector, ANNE_LEADS, handWand, pacsTex, annieVitals } from "./devices.js";

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const BG = 0x081322;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 1100, 2600);
  const camera = new THREE.PerspectiveCamera(32, view.w / view.h, 1, 6000);
  camera.layers.enable(1);                                             // 第 1 層＝文字標籤（大螢幕畫面不顯示）

  // ---------- 燈光 ----------
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1b2335, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(260, 900, 760);
  sun.target.position.set(480, 0, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 10, far: 3000 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // ---------- 基本形狀 ----------
  const matCache = new Map();
  const mat = (c, o = {}) => {
    const k = c + JSON.stringify(o);
    if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, metalness: 0.05, ...o }));
    return matCache.get(k);
  };
  function box(x1, z1, x2, z2, y1, y2, color, { shadow = true, parent = scene, m } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, y2 - y1, z2 - z1), m || mat(color));
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cyl(x, z, r, y1, y2, color, { parent = scene, r2 } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, y2 - y1, 24), mat(color));
    m.position.set(x, (y1 + y2) / 2, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }

  // ---------- 文字標籤（Sprite，依圖層淡入淡出） ----------
  const layers = {}; // name → [sprite]
  function label(text, x, y, z, { size = 9, bg = "rgba(255,255,255,.94)", fg = "#14213a", bold = true, border = null, layer = "building", parent = scene } = {}) {
    const s = 6, cv = document.createElement("canvas"), g = cv.getContext("2d");
    const px = 22 * s, font = `${bold ? 800 : 600} ${px}px "PingFang TC","Heiti TC","Microsoft JhengHei",sans-serif`;
    g.font = font;
    const lines = text.split("\n"), tw = Math.max(...lines.map((l) => g.measureText(l).width));
    const pad = px * 0.42, lh = px * 1.28;
    cv.width = Math.ceil(tw + pad * 2); cv.height = Math.ceil(lh * lines.length + pad);
    g.font = font; g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, px * 0.32); g.fill();
    if (border) { g.lineWidth = s * 2.2; g.strokeStyle = border; g.stroke(); }
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    lines.forEach((l, i) => g.fillText(l, cv.width / 2, pad * 0.5 + lh * (i + 0.5)));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const k = size / px; sp.scale.set(cv.width * k, cv.height * k, 1);
    sp.position.set(x, y, z); sp.renderOrder = 20; sp.layers.set(1); parent.add(sp);
    (layers[layer] ||= []).push(sp);
    return sp;
  }
  function setLayer(name, on, dur = 0.6) {
    for (const sp of layers[name] || []) {
      gsap.to(sp.material, { opacity: on ? 1 : 0, duration: dur, overwrite: true, onStart: () => { if (on) sp.visible = true; }, onComplete: () => { if (!on) sp.visible = false; } });
    }
  }

  // ---------- 林口長庚整層樓（依主辦單位平面圖命名） ----------
  box(-40, -40, 1000, 660, -6, -0.5, 0x1a2638, { shadow: false });
  box(0, 0, 960, 620, -0.5, 0, 0x2b3a50, { shadow: false });
  const CORR = 0x8fa0b8;
  for (const [x1, z1, x2, z2] of [[65, 59, 445, 88], [65, 170, 445, 200], [245, 200, 292, 475], [45, 475, 445, 500], [445, 70, 905, 105], [440, 0, 455, 500]])
    box(x1, z1, x2, z2, 0, 0.3, CORR, { shadow: false });

  const RH = 9, RW = 2, RC = 0x6b778a;
  const ROOMS = {}; // id → [x1,z1,x2,z2]
  function room(x1, z1, x2, z2, color, name, { size = 8.5, id } = {}) {
    box(x1, z1, x2, z2, 0, 0.5, color, { shadow: false });
    box(x1, z1, x2, z1 + RW, 0, RH, RC); box(x1, z2 - RW, x2, z2, 0, RH, RC);
    box(x1, z1, x1 + RW, z2, 0, RH, RC); box(x2 - RW, z1, x2, z2, 0, RH, RC);
    if (name) label(name, (x1 + x2) / 2, 16, (z1 + z2) / 2, { size, bold: false });
    if (id) ROOMS[id] = [x1, z1, x2, z2];
  }
  const TEAM = 0xfde68a, CLS = 0xc9d6ea, GREY = 0xb8c0cc;
  room(81, 13, 151, 59, GREY, "更衣室(女)");
  room(151, 13, 224, 59, TEAM, "入闈\n教室6", { id: "team6" }); room(224, 13, 297, 59, TEAM, "入闈\n教室7", { id: "team7" });
  room(297, 13, 370, 59, TEAM, "入闈\n教室8", { id: "team8" }); room(370, 13, 445, 59, CLS, "教室9");
  room(80, 88, 150, 134, GREY, "更衣室(女)");
  room(150, 88, 222, 134, TEAM, "入闈\n教室3", { id: "team3" }); room(222, 88, 295, 134, TEAM, "入闈\n教室2", { id: "team2" });
  room(295, 88, 365, 134, TEAM, "入闈\n教室1", { id: "team1" });
  room(455, 13, 530, 70, GREY, "更衣室(男)"); room(530, 13, 597, 70, CLS, "教室11"); room(597, 13, 665, 70, CLS, "教室12");
  room(665, 13, 720, 70, 0xd8c8f5, "控制室"); room(720, 13, 820, 70, 0xfef08a, "報到區", { size: 11, id: "checkin" });
  room(820, 13, 900, 70, 0xd1d5db, "廁所"); room(900, 13, 958, 100, 0xcbd5e1, "");
  room(245, 138, 362, 168, 0xb8c0cc, ""); room(390, 105, 440, 165, 0xb8c0cc, "");
  room(65, 140, 240, 170, 0xa9b4c4, "L棟電梯");
  room(65, 205, 245, 260, 0xb8c0cc, "樓梯"); room(50, 260, 245, 297, 0xcfe0bd, "教具間");
  room(10, 297, 245, 410, 0xbcd2ec, "競賽說明、觀摩教室", { size: 11, id: "obs" }); room(100, 420, 245, 475, 0xb8c0cc, "樓梯");
  room(292, 375, 440, 405, 0xcfe0bd, "教具間"); room(292, 410, 445, 475, 0xf7c7c7, "Debrief 教室", { size: 9 });
  room(45, 500, 180, 605, 0xf7c7c7, "評審委員休息室"); room(180, 500, 312, 605, 0xf7c7c7, "工作人員休息室");
  room(312, 500, 445, 605, 0xf7c7c7, "");
  room(455, 385, 520, 505, 0xb8c0cc, "樓梯"); room(525, 478, 580, 560, 0xfef9c3, "考官／標準化\n病人廁所", { size: 7 });
  room(620, 500, 735, 580, 0xa9b4c4, "K棟電梯");
  label("團隊入闈教室 1~3、6~8（各團隊一間）", 258, 30, -8, { size: 9, bg: "#fde047", fg: "#7f1d1d", layer: "teamTag" });
  setLayer("teamTag", false, 0);

  // 報到入口箭頭
  function arrow(cx, cz, len, rotDeg, color = 0xef4444, y = 1) {
    const L = len / 2, w = 2.4, hw = 5.5, hl = 7, s = new THREE.Shape();
    s.moveTo(-L, 0); s.lineTo(-L + hl, hw); s.lineTo(-L + hl, w); s.lineTo(L, w); s.lineTo(L, -w); s.lineTo(-L + hl, -w); s.lineTo(-L + hl, -hw); s.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.25 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -rotDeg * Math.PI / 180; m.position.set(cx, y, cz); scene.add(m); return m;
  }
  arrow(884, 146, 56, 45);
  label("報到入口", 935, 30, 196, { size: 10, bg: "#ef4444", fg: "#fff" });

  // ---------- 考場（模擬教室一、二）：實際配置 ----------
  const C = { ct: 0xf6b98c, mri: 0xc9b8f2, wait: 0xbfe0ad, corr: 0xd6dbe3 };
  const WH = 16, WC = 0x4a5568;
  // 考場牆：第一人稱觀摩時會長高成真實牆高（約 2.5 公尺），俯瞰時維持矮牆方便看
  const examWalls = [], obstacles = [];
  const wall = (x1, z1, x2, z2, h = WH) => { const m = box(x1, z1, x2, z2, 0, h, WC); m.userData.h = h; examWalls.push(m); obstacles.push([x1, z1, x2, z2]); return m; };
  box(292, 205, 440, 270, 0, 0.6, C.ct, { shadow: false });
  box(292, 270, 327, 300, 0, 0.6, C.corr, { shadow: false });
  { const m = box(327, 270, 440, 300, 0, 10, 0x7b8798); m.userData.h = 10; examWalls.push(m); obstacles.push([327, 270, 440, 300]); } // 中央影音控制室（非考區）
  box(292, 300, 344, 370, 0, 0.6, C.wait, { shadow: false });
  box(344, 300, 440, 370, 0, 0.6, C.mri, { shadow: false });
  wall(290, 203, 442, 207);
  wall(290, 203, 294, 241); wall(290, 254, 294, 372);                   // 西牆：進出大門直通 CT 室
  wall(438, 203, 442, 372);
  wall(327, 268, 440, 272); wall(327, 298, 440, 302);
  wall(290, 368, 442, 372);
  wall(344, 302, 351, 347, 12);                                          // 等候區／MRI 室隔間，南端留通道
  box(286, 329, 289.5, 340, 2, 13, 0xef4444);                           // 等候區外門封閉
  ROOMS.examAll = [290, 203, 442, 372]; ROOMS.ct = [292, 205, 440, 270]; ROOMS.mri = [344, 300, 440, 370];
  ROOMS.wait = [292, 300, 344, 370]; ROOMS.corr = [292, 270, 327, 300];
  arrow(274, 247.5, 26, 0, 0xef4444, 1);
  const examTag = (t, x, y, z, o = {}) => label(t, x, y, z, { layer: "exam", ...o });
  examTag("檢查室 A｜CT 室", 400, 44, 216, { size: 9, border: "#ea580c" });
  examTag("檢查室 B｜MRI 室", 410, 40, 356, { size: 9, border: "#7c3aed" });
  examTag("等候區", 318, 26, 366, { size: 7 });
  examTag("進出大門", 262, 30, 236, { size: 7.5, bg: "#ef4444", fg: "#fff" });
  examTag("中央影音控制室", 384, 22, 285, { size: 6.5, bold: false });
  label("考場", 366, 58, 288, { size: 13, bg: "#0ea5e9", fg: "#fff", layer: "examBig" });

  // ---------- 考場內儀器（考場配置圖座標 → 林口座標，整組等比例縮小） ----------
  const S = 0.3;
  const mapPt = (x, z) => [294 + (z - 166) / 286 * 144, x >= 550 ? 268 - (x - 635) / 225 * 61 : 368 - (x - 210) / 256 * 66];
  function item(ax, az, build) {
    const [X, Z] = mapPt(ax, az), g = new THREE.Group();
    const api = {
      box: (x1, z1, x2, z2, y1, y2, c, o = {}) => box(x1, z1, x2, z2, y1, y2, c, { parent: g, ...o }),
      cyl: (x, z, r, y1, y2, c, o = {}) => cyl(x, z, r, y1, y2, c, { parent: g, ...o }),
      add: (m) => { m.castShadow = m.receiveShadow = true; g.add(m); return m; },
    };
    build(api);
    g.scale.setScalar(S); g.rotation.y = Math.PI / 2;
    g.position.set(X - S * az, 0, Z + S * ax); scene.add(g);
    const bb = new THREE.Box3().setFromObject(g); obstacles.push([bb.min.x, bb.min.z, bb.max.x, bb.max.z]);
    return g;
  }
  const eqLabel = (t, ax, az, h, o = {}) => { const [X, Z] = mapPt(ax, az); return label(t, X, h, Z, { size: 5.2, layer: "eq", ...o }); };

  // CT 掃描儀（機架孔朝北，檢查床在北側）
  item(747, 405, ({ box, add }) => {
    const x1 = 706, x2 = 788, z1 = 356, z2 = 453, cx = (x1 + x2) / 2;
    const gw = 92, gh = 80, gd = 24, r = 10, s = new THREE.Shape();
    s.moveTo(-gw / 2 + r, 0); s.lineTo(gw / 2 - r, 0); s.quadraticCurveTo(gw / 2, 0, gw / 2, r);
    s.lineTo(gw / 2, gh - r); s.quadraticCurveTo(gw / 2, gh, gw / 2 - r, gh); s.lineTo(-gw / 2 + r, gh);
    s.quadraticCurveTo(-gw / 2, gh, -gw / 2, gh - r); s.lineTo(-gw / 2, r); s.quadraticCurveTo(-gw / 2, 0, -gw / 2 + r, 0);
    const hole = new THREE.Path(); hole.absarc(0, 44, 23, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: gd, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, curveSegments: 40 }), mat(0xf4f6f8));
    g.position.set(cx, 0, z2 - 6 - gd); add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(25, 2.2, 12, 48), mat(0xf97316, { emissive: 0xf97316, emissiveIntensity: 0.4 }));
    ring.position.set(cx, 44, z2 - 6 - gd - 2.5); add(ring);
    box(cx - 11, z1 + 4, cx + 11, z1 + 46, 0, 26, 0xd9dde3);
    box(cx - 13, z1 - 6, cx + 13, z2 - 14, 26, 30, 0xfafafa);
  });
  eqLabel("CT 掃描儀", 747, 440, 34);

  // 寫實儀器（devices.js）：放到考場配置圖座標 (x, z)，rot 為轉向（0＝正面朝林口西側）
  const place = (make, x, z, rot = 0) => item(x, z, ({ add }) => { const o = make(); o.position.set(x, 0, z); o.rotation.y = rot; add(o); });
  function consoleDesk(x1, z1, x2, z2, kind = "ct") { place(() => workstation(x2 - x1, z2 - z1, kind), (x1 + x2) / 2, (z1 + z2) / 2); }
  consoleDesk(729, 280, 811, 309); eqLabel("控制台＋手機", 770, 294, 22);
  const monitor = (x, z, rot = 0) => place(patientMonitor, x, z, rot);
  monitor(668, 360); eqLabel("生理監視器", 668, 360, 30);
  const injector = place(contrastInjector, 783, 345);                     // 對比劑打藥機（雙筒注射器）
  eqLabel("對比劑打藥機", 783, 345, 30);
  // 工作台：靠 CT 室北牆、大門旁；台面上放針頭與打針用品
  item(842, 226, ({ box, cyl, add }) => {
    const x1 = 828, x2 = 856, z1 = 190, z2 = 262, top = 36;
    box(x1, z1, x2, z2, top - 3, top, 0xe2e8f0);                                  // 台面
    for (const [x, z] of [[x1 + 2, z1 + 2], [x2 - 2, z1 + 2], [x1 + 2, z2 - 2], [x2 - 2, z2 - 2]]) cyl(x, z, 1.2, 0, top - 3, 0x94a3b8);
    box(x1 + 1, z1 + 1, x2 - 1, z2 - 1, 8, 10, 0xcbd5e1);                          // 下層架
    box(x1 + 4, z1 + 6, x2 - 6, z1 + 30, top, top + 1.5, 0x93c5fd);               // 治療盤
    const syr = (x, z, c) => {                                                     // 空針（橫放）：針筒＋針頭
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 11, 12), mat(0xf8fafc)); b.rotation.x = Math.PI / 2; b.position.set(x, top + 2.6, z); add(b);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 6), mat(0x9ca3af, { metalness: 0.8, roughness: 0.3 })); n.rotation.x = Math.PI / 2; n.position.set(x, top + 2.6, z + 8); add(n);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 2, 8), mat(c)); cap.rotation.x = Math.PI / 2; cap.position.set(x, top + 2.6, z - 6.5); add(cap);
    };
    syr(833, z1 + 14, 0x2563eb); syr(838, z1 + 14, 0x16a34a); syr(843, z1 + 14, 0xf59e0b); syr(848, z1 + 14, 0xdc2626);
    for (const [z, c] of [[z1 + 36, 0xfde68a], [z1 + 44, 0xbae6fd], [z1 + 52, 0xfbcfe8]]) box(x1 + 5, z, x1 + 16, z + 6, top, top + 5, c); // 針頭盒、靜脈留置針、酒精棉片
    box(x2 - 13, z1 + 36, x2 - 4, z1 + 50, top, top + 4, 0xffffff);              // 紗布、膠帶
    cyl(x2 - 8, z1 + 41, 1.6, top + 4, top + 5.2, 0xe5e7eb);
    box(x1 + 4, z2 - 16, x1 + 16, z2 - 4, top, top + 12, 0xfacc15);               // 針頭收集桶（尖銳物收集筒）
    box(x1 + 4, z2 - 16, x1 + 16, z2 - 4, top + 12, top + 14, 0xdc2626);
  });
  eqLabel("工作台：針頭、打針用品", 842, 226, 22);
  item(856, 331, ({ box, cyl }) => {                                     // 牆上氧氣
    box(852, 322, 859, 340, 36, 60, 0xe5e7eb); cyl(851, 331, 2.2, 40, 54, 0x16a34a);
  });
  eqLabel("牆上氧氣", 836, 331, 26);

  // MRI 掃描儀（孔朝北，檢查床由北側送入）
  item(338, 420, ({ box, add }) => {
    const cx = 338, gw = 96, gh = 86, r = 22, s = new THREE.Shape();
    s.moveTo(-gw / 2 + r, 0); s.lineTo(gw / 2 - r, 0); s.quadraticCurveTo(gw / 2, 0, gw / 2, r);
    s.lineTo(gw / 2, gh - r); s.quadraticCurveTo(gw / 2, gh, gw / 2 - r, gh); s.lineTo(-gw / 2 + r, gh);
    s.quadraticCurveTo(-gw / 2, gh, -gw / 2, gh - r); s.lineTo(-gw / 2, r); s.quadraticCurveTo(-gw / 2, 0, -gw / 2 + r, 0);
    const hole = new THREE.Path(); hole.absarc(0, 46, 22, 0, Math.PI * 2, true); s.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 46, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, curveSegments: 40 }), mat(0xf8fafc));
    m.position.set(cx, 0, 404); add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 2.4, 12, 48), mat(0x8b5cf6, { emissive: 0x8b5cf6, emissiveIntensity: 0.5 }));
    ring.position.set(cx, 46, 401); add(ring);
    box(cx - 11, 344, cx + 11, 404, 0, 26, 0xd9dde3);
    box(cx - 13, 296, cx + 13, 430, 26, 30, 0xfafafa);                  // 檢查床加長：病人可以整個躺在床上
  });
  eqLabel("MRI 掃描儀", 338, 432, 36);
  // 直接用林口座標擺放（X, Z），face：0＝正面朝北、-π/2＝朝東、π/2＝朝西、π＝朝南
  function placeL(make, X, Z, face = 0) {
    const g = new THREE.Group(), o = make(); o.rotation.y = face; g.add(o);
    g.scale.setScalar(S); g.position.set(X, 0, Z); scene.add(g);
    const bb = new THREE.Box3().setFromObject(g); obstacles.push([bb.min.x, bb.min.z, bb.max.x, bb.max.z]);
    return g;
  }
  const labelL = (t, X, Z, h, o = {}) => label(t, X, h, Z, { size: 5.2, layer: "eq", ...o });

  // MRI 室：控制台在 MRI 正前方、離隔間牆留站人的空間；操作者站在桌子與牆之間，面向 MRI（螢幕朝西對著操作者）
  const mriConsole = placeL(() => workstation(72, 24, "mri"), 367, 335, Math.PI / 2); labelL("控制台＋手機", 367, 335, 22);
  const mriScreen = mriConsole.children[0].userData.screen, homeTex = mriScreen.material.map;

  // 等候區（MRI 室外）：設備與輪椅全部靠後牆（南牆）一字排開、正面朝北；東側留通道往 MRI 室
  placeL(wheelchair, 300, 363.5); labelL("輪椅", 300, 363.5, 20);
  const cart = placeL(crashCart, 310.5, 364); labelL("急救車", 310.5, 364, 24, { bg: "#dc2626", fg: "#fff" });
  placeL(oxygenCylinder, 318.5, 365); labelL("氧氣鋼瓶", 318.5, 365, 28);
  const waitMon = placeL(() => patientMonitor({ own: true }), 325.5, 363.5); labelL("生理監視器（已接安妮）", 325.5, 363.5, 31);
  placeL(pulseOximeter, 332.5, 364.5); labelL("血氧機", 332.5, 364.5, 24);
  const detector = placeL(metalDetector, 338.5, 365); labelL("金屬掃描器", 338.5, 365, 27);
  const standWand = detector.children[0].userData.wand;
  // 抗磁推床在等候區中間，安妮躺在上面
  const stretcher = placeL(mrStretcherWithAnne, 319, 330); labelL("抗磁推床＋安妮", 319, 330, 19);
  const annie = stretcher.children[0].userData.anne, annieCables = [];
  // 等候區生理監視器已接到安妮：EKG 導線、血氧線、血壓管從監視器垂到地面再上到推床
  // 每個點用「監視器本地座標 m」或「安妮本地座標 a」表示：監視器或安妮移動時，導線跟著一起動（推進 MRI 室也不會斷）
  const [px, py, pz] = ANNE_LEADS.spo2, [cx, cy, cz] = ANNE_LEADS.cuff, EDGE = ["a", -16, 0.5, 14];
  const CABLES = [
    { r: 0.32, c: 0x1f2937, pts: [["m", 10, 64, -3], ["m", 12, 40, -12], ["m", 1.7, 2, -38.3], ["a", 8, -26, 40], ["a", 1.33, -14.7, 20.7], EDGE] },
    ...ANNE_LEADS.ecg.map(([x, z, c]) => ({ r: 0.14, c, pts: [EDGE, ["a", (x - 16) / 2, 8.5, (z + 14) / 2], ["a", x, 8, z]] })),
    { r: 0.2, c: 0x334155, pts: [["m", 10, 64, -3], ["m", 9, 42, -12], ["m", 5, 2, -35], ["a", 18, -26, 43.3], ["a", 11.3, -11.3, 18.7], ["a", px, py, pz]] },
    { r: 0.26, c: 0x64748b, pts: [["m", 10, 64, -3], ["m", 11, 44, -13], ["m", -3.3, 2, -41.7], ["a", -35.3, -26, 33.3], ["a", -43.7, -26, -20], ["a", -28.7, -8, -18.3], ["a", cx, cy + 2.6, cz]] },  // 從床頭繞到另一側手臂
  ];
  for (const cb of CABLES) { const m = new THREE.Mesh(new THREE.BufferGeometry(), mat(cb.c, { roughness: 0.6 })); m.castShadow = true; scene.add(m); annieCables.push(m); }
  const cablePt = ([k, x, y, z]) => (k === "m" ? waitMon.children[0] : annie).localToWorld(new THREE.Vector3(x, y, z));
  let cableKey = "";
  function updateCables(force) {
    waitMon.updateMatrixWorld(true); annie.updateMatrixWorld(true);
    const key = [...annie.matrixWorld.elements, ...waitMon.matrixWorld.elements].map((v) => v.toFixed(2)).join();
    if (!force && key === cableKey) return; cableKey = key;
    CABLES.forEach((cb, i) => { const m = annieCables[i]; m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cb.pts.map(cablePt)), 48, cb.r, 6); });
  }
  updateCables(true);
  // MRI 室的生理監視器：靠北牆、在 MRI 旁，螢幕朝南對著房間
  placeL(patientMonitor, 402, 307, Math.PI); labelL("生理監視器", 402, 307, 31);
  setLayer("eq", false, 0); setLayer("exam", false, 0);

  // ---------- 房間高亮（地面發光＋外框） ----------
  const hlObjs = {};
  function makeHL(id, color = 0x38bdf8) {
    const [x1, z1, x2, z2] = ROOMS[id], g = new THREE.Group();
    const base = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), base);
    plane.rotation.x = -Math.PI / 2; plane.position.set((x1 + x2) / 2, 1.2, (z1 + z2) / 2); g.add(plane);
    const edge = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    // 發光外框放在牆頂上方（不與牆面重疊，避免 z-fighting 閃爍）
    const exam = ["examAll", "ct", "mri", "wait", "corr"].includes(id), top = (exam ? 16 : 9) + 0.4, t = 3, o = 0.5, h = 1.6;
    for (const [a, b, c, d] of [[x1 - o, z1 - o, x2 + o, z1 - o + t], [x1 - o, z2 + o - t, x2 + o, z2 + o], [x1 - o, z1 - o, x1 - o + t, z2 + o], [x2 + o - t, z1 - o, x2 + o, z2 + o]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(c - a, h, d - b), edge); e.position.set((a + c) / 2, top + h / 2, (b + d) / 2); e.renderOrder = 6; g.add(e);
    }
    g.visible = false; scene.add(g);
    return (hlObjs[id] = { g, base, edge, on: false });
  }
  function highlight(ids, color) {
    const want = new Set(ids);
    for (const id of Object.keys(ROOMS)) {
      const on = want.has(id), h = hlObjs[id] || (on && makeHL(id, color));
      if (!h || h.on === on) continue;
      h.on = on;
      if (on) { h.g.visible = true; gsap.to(h.base, { opacity: 0.28, duration: 0.5 }); gsap.to(h.edge, { opacity: 0.95, duration: 0.5 }); }
      else { gsap.to([h.base, h.edge], { opacity: 0, duration: 0.4, onComplete: () => { if (!h.on) h.g.visible = false; } }); }
    }
  }

  // ---------- 動線（地面流動箭頭帶，可逐段畫出） ----------
  const chev = (() => {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64; const g = cv.getContext("2d");
    g.fillStyle = "rgba(56,189,248,.35)"; g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#e0f2fe"; g.beginPath(); g.moveTo(34, 10); g.lineTo(78, 32); g.lineTo(34, 54); g.lineTo(50, 32); g.closePath(); g.fill();
    const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const routes = {};
  function makeRoute(id, pts, { w = 6, y = 1.6 } = {}) {
    const P = [], L = [0];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let k = i ? 1 : 0; k <= n; k++) { const t = k / n; P.push([ax + (bx - ax) * t, az + (bz - az) * t]); if (P.length > 1) L.push(L[L.length - 1] + Math.hypot(P.at(-1)[0] - P.at(-2)[0], P.at(-1)[1] - P.at(-2)[1])); }
    }
    const pos = [], uv = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1], dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1, nx = -dz / d * w / 2, nz = dx / d * w / 2;
      const q = [[ax + nx, az + nz, L[i], 0], [ax - nx, az - nz, L[i], 1], [bx + nx, bz + nz, L[i + 1], 0], [bx - nx, bz - nz, L[i + 1], 1]];
      for (const k of [0, 1, 2, 2, 1, 3]) { pos.push(q[k][0], y, q[k][1]); uv.push(q[k][2] / 9, q[k][3]); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: chev, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 5; geo.setDrawRange(0, 0); m.visible = false; scene.add(m);
    return (routes[id] = { m, geo, n: pos.length / 3, P, L, total: L.at(-1), p: { v: 0 }, on: false });
  }
  function showRoute(id, on, animate) {
    const r = routes[id]; if (!r || r.on === on) return; r.on = on;
    gsap.killTweensOf(r.p);
    const upd = () => { r.geo.setDrawRange(0, Math.floor(r.n * r.p.v / 6) * 6); r.m.visible = r.p.v > 0; };
    if (!animate) { r.p.v = on ? 1 : 0; upd(); return; }
    gsap.to(r.p, { v: on ? 1 : 0, duration: on ? Math.min(2.6, 0.6 + r.total / 260) : 0.35, ease: "power1.inOut", onUpdate: upd });
  }
  const routePoint = (id, t) => {
    const r = routes[id], d = t * r.total; let i = r.L.findIndex((v) => v >= d); if (i <= 0) i = 1;
    const a = r.P[i - 1], b = r.P[i], s = (d - r.L[i - 1]) / ((r.L[i] - r.L[i - 1]) || 1);
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, Math.atan2(b[0] - a[0], b[1] - a[1])];
  };

  // ---------- 人物（隊伍標記、帶隊老師） ----------
  const figs = {};
  function person(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 15, 20), mat(color)); body.position.y = 7.5; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 16), mat(0xf1d3b6)); head.position.y = 18.6; head.castShadow = true; g.add(head);
    return g;
  }
  function makeTeam(other = false) {
    const g = new THREE.Group();
    const ringM = new THREE.MeshBasicMaterial({ color: other ? 0x94a3b8 : 0x38bdf8, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(13, 16, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 1.9; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(13, 48), new THREE.MeshBasicMaterial({ color: other ? 0x64748b : 0x0ea5e9, transparent: true, opacity: 0.3, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 1.8; g.add(disc);
    // 參賽隊員 4 人（鼎晨、瑞益、云玎、曉鏵），2×2 隊形；另一隊（一起看考場的隊伍）用配角模型
    const crew = other ? [["other_m", -4.8, 4.8], ["other_f", 4.8, 4.8], ["other_f", -4.8, -4.8], ["other_m", 4.8, -4.8]]
      : [["dingchen", -4.8, 4.8], ["ruiyi", 4.8, 4.8], ["yunding", -4.8, -4.8], ["xiaohua", 4.8, -4.8]];
    for (const [id, x, z] of crew) { const p = makePerson(id); p.scale.setScalar(0.72); p.position.set(x, 0, z); g.add(p); }
    gsap.to(ring.scale, { x: 1.25, y: 1.25, duration: 1.1, repeat: -1, yoyo: true, ease: "sine.inOut" });
    g.visible = false; scene.add(g); return g;
  }
  function makeTeacher() {
    const g = makePerson("xiudi");                      // 帶隊老師 秀蒂
    label("帶隊老師", 0, 25, 0, { size: 5.5, bg: "#f59e0b", fg: "#1f1300", layer: "fig", parent: g });
    g.visible = false; scene.add(g); return g;
  }
  figs.team = { g: makeTeam(), t: { v: 0 } };
  figs.teacher = { g: makeTeacher(), t: { v: 0 } };
  figs.team2 = { g: makeTeam(true), t: { v: 0 } };
  // fig 狀態：{ route, t(0~1), hide }；animate 時沿動線走到 t
  function placeFig(id, st, animate) {
    const f = figs[id]; gsap.killTweensOf(f.t);
    if (!st || st.hide) {
      if (f.g.visible && animate) gsap.to(f.g.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.5, onComplete: () => { f.g.visible = false; f.g.scale.setScalar(1); } });
      else f.g.visible = false;
      return;
    }
    const set = () => { const [x, z, a] = routePoint(st.route, f.t.v); f.g.position.set(x, 0, z); f.g.rotation.y = a; };
    const from = st.from ?? 0, to = st.t ?? 1;
    if (!f.g.visible) {
      f.g.visible = true; f.t.v = animate ? from : to;
      if (animate && st.pop) gsap.fromTo(f.g.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: "back.out(1.7)" }); else f.g.scale.setScalar(1);
    }
    if (f.route !== st.route) f.t.v = animate ? from : to;
    f.route = st.route;
    if (!animate) { f.t.v = to; set(); return; }
    set();
    gsap.to(f.t, { v: to, duration: st.dur ?? 2.4, ease: "power1.inOut", delay: st.delay ?? 0, onUpdate: set,
      onComplete: () => { if (st.fadeOut) placeFig(id, { hide: true }, true); } });
  }

  // ---------- 動線定義（林口座標） ----------
  makeRoute("checkin", [[912, 172], [872, 128], [845, 96], [790, 88], [770, 80]]);
  makeRoute("toTeam", [[770, 88], [600, 88], [447, 88], [447, 74], [300, 74], [262, 74]]);
  makeRoute("teacherOut", [[299, 74], [447, 74], [447, 88], [640, 88]]);
  makeRoute("toObs", [[262, 74], [447, 74], [447, 185], [268, 185], [268, 352], [205, 352]]);
  makeRoute("obsToExam", [[205, 352], [268, 352], [268, 247], [306, 247]]);
  makeRoute("backToTeam", [[306, 247], [268, 247], [268, 185], [447, 185], [447, 74], [240, 74], [240, 123]]);  // 看完考場回入闈教室 2
  makeRoute("toExamDoor", [[240, 123], [240, 74], [447, 74], [447, 185], [268, 185], [268, 247], [262, 247]]);  // 入闈教室 2 → 考場門口
  makeRoute("obs2ToExam", [[150, 352], [268, 352], [268, 268]], { w: 0.01 });

  // ---------- 觀摩教室：大禮堂座位＋前方大螢幕（播放考場即時畫面） ----------
  // 觀摩教室 x 10~245、z 297~410；螢幕在西側牆前、面向東，座位面向螢幕，中間留走道（z≈352）
  {
    const seatZ = [], rowX = [];
    for (let z = 306; z <= 400; z += 9) if (Math.abs(z - 352) > 8) seatZ.push(z);
    for (let x = 78; x <= 232; x += 13) rowX.push(x);
    const n = seatZ.length * rowX.length;
    const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(6.5, 6.5, 6.5), mat(0x3b5b7a), n);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 12, 6.5), mat(0x2f4a66), n);
    const m4 = new THREE.Matrix4(); let i = 0;
    for (const x of rowX) for (const z of seatZ) {
      m4.makeTranslation(x, 3.25, z); seat.setMatrixAt(i, m4);
      m4.makeTranslation(x + 3.6, 6, z); back.setMatrixAt(i, m4); i++;
    }
    for (const im of [seat, back]) { im.castShadow = im.receiveShadow = true; scene.add(im); }
  }
  const liveRT = new THREE.WebGLRenderTarget(768, 432, { samples: 4 });
  const brief = createBriefing();
  let scrMat, liveOverlay;
  const FP_START = { x: 312, z: 258, yaw: -0.36, pitch: -0.2, eye: 23, fov: 62 };
  const liveCam = new THREE.PerspectiveCamera(FP_START.fov, 16 / 9, 1, 2000);   // 與第一人稱同視角，飛入螢幕即無縫進入
  const fpLook = (p) => [p.x + Math.cos(p.yaw) * Math.cos(p.pitch) * 20, p.eye + Math.sin(p.pitch) * 20, p.z + Math.sin(p.yaw) * Math.cos(p.pitch) * 20];
  const LIVE_POSE = { pos: [FP_START.x, FP_START.eye, FP_START.z], look: fpLook(FP_START) };
  liveCam.position.set(...LIVE_POSE.pos); liveCam.lookAt(...LIVE_POSE.look);
  {
    const sx = 20, z1 = 318, z2 = 386, y1 = 14, y2 = 52;
    box(sx - 4, z1 - 3, sx, z2 + 3, y1 - 3, y2 + 3, 0x0b1220);                // 螢幕外框
    box(sx - 3, (z1 + z2) / 2 - 2, sx - 1, (z1 + z2) / 2 + 2, 0, y1 - 3, 0x334155); // 支架
    scrMat = new THREE.MeshBasicMaterial({ map: liveRT.texture });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, y2 - y1), scrMat);
    scr.rotation.y = Math.PI / 2; scr.position.set(sx + 0.2, (y1 + y2) / 2, (z1 + z2) / 2); scene.add(scr);
    // 疊在螢幕前的即時畫面：飛入時由投影片淡入成考場畫面（不會突然跳一格）
    liveOverlay = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, y2 - y1), new THREE.MeshBasicMaterial({ map: liveRT.texture, transparent: true, opacity: 0, depthWrite: false }));
    liveOverlay.rotation.y = Math.PI / 2; liveOverlay.position.set(sx + 0.35, (y1 + y2) / 2, (z1 + z2) / 2); liveOverlay.visible = false; scene.add(liveOverlay);
    label("● 考場即時畫面", sx + 2, y2 + 5.5, z2 - 12, { size: 3.6, bg: "#dc2626", fg: "#fff", layer: "live" });
  }
  // 正在考試的隊伍（只在大螢幕畫面出現時顯示）：CT 室 2 人、MRI 室 2 人
  const liveCrew = new THREE.Group();
  for (const [x, z, id] of [[392, 230, "other_m"], [384, 248, "other_f"], [392, 330, "other_m"], [378, 346, "other_f"]]) { const p = makePerson(id, { label: false }); p.position.set(x, 0, z); liveCrew.add(p); }
  liveCrew.visible = false; scene.add(liveCrew);
  let liveOn = false;
  function setLive(on) { liveOn = on; liveCrew.visible = on; setLayer("live", on, 0.5); }
  // 從投影片淡入成考場即時畫面（不顯示螢幕上方標籤）
  function fadeToLive(dur = 0.7) {
    liveOn = true; liveCrew.visible = true;
    liveOverlay.visible = true; gsap.fromTo(liveOverlay.material, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power1.inOut", overwrite: true });
  }
  function clearOverlay() { gsap.killTweensOf(liveOverlay.material); liveOverlay.material.opacity = 0; liveOverlay.visible = false; }
  setLayer("live", false, 0);

  // 觀摩教室裡坐著看大螢幕的人：我們的隊伍（放射師 3 藍＋護理師 1 粉）、一起看考場的另一隊（灰）、帶隊老師
  const SEAT_TOP = 6.5;
  function seated(id, label = true) {                  // 坐在座位上（臀部在座墊上），面向西邊的大螢幕
    const g = new THREE.Group(), p = makePerson(id, { label });
    const hip = 0.52 * (PEOPLE_INFO[id]?.h || 1.7) * 12.5;
    p.position.set(0.8, SEAT_TOP + 1.1 - hip, 0); p.rotation.y = Math.PI; setPose(p, "sit"); g.add(p);
    return g;
  }
  const audience = new THREE.Group();
  // 座位排在 z＝306、315…342、369、378…396（z≈352 是走道，沒有椅子）
  for (const [z, id] of [[369, "xiaohua"], [378, "dingchen"], [387, "ruiyi"], [396, "yunding"]]) { const p = seated(id); p.position.set(91, 0, z); audience.add(p); }
  for (const [z, id] of [[342, "other_m"], [333, "other_f"], [324, "other_f"], [315, "other_m"]]) { const p = seated(id, false); p.position.set(91, 0, z); audience.add(p); }
  const tch = seated("xiudi"); tch.position.set(117, 0, 396); audience.add(tch);
  label("帶隊老師", 117, 24, 396, { size: 3.2, bg: "#f59e0b", fg: "#1f1300", layer: "audience" });
  audience.visible = false; scene.add(audience); setLayer("audience", false, 0);
  function setAudience(on) { audience.visible = on; setLayer("audience", on, on ? 0.5 : 0); }

  // ---------- Debrief 教室（考試結束後）：長桌、兩側各 4 張椅子、桌上倒數碼錶 ----------
  // 考官坐北側（面向南）、考生坐南側（面向北）；考生順序 曉鏵、鼎晨、瑞益、云玎
  const debrief = new THREE.Group(); debrief.visible = false; scene.add(debrief);
  const DB_X = [345, 360, 375, 390], DB_ZN = 433, DB_ZS = 451, DB_ZT = 442, DB_CX = 367.5;
  {
    const wood = mat(0xd9c4a3, { roughness: 0.6 }), steel = mat(0x64748b, { metalness: 0.4, roughness: 0.5 }), seatM = mat(0x334155, { roughness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(70, 1, 11), wood); top.position.set(DB_CX, 9.4, DB_ZT); top.castShadow = top.receiveShadow = true; debrief.add(top);
    for (const dx of [-33, 33]) for (const dz of [-4.5, 4.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), steel); l.position.set(DB_CX + dx, 4.5, DB_ZT + dz); debrief.add(l); }
    for (const x of DB_X) for (const [z, back] of [[DB_ZN, -3.4], [DB_ZS, 3.4]]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 6), seatM); seat.position.set(x, 6, z); seat.castShadow = true; debrief.add(seat);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 1), seatM); bk.position.set(x, 10, z + back); bk.castShadow = true; debrief.add(bk);
      for (const dx of [-2.5, 2.5]) for (const dz of [-2.5, 2.5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 0.6), steel); l.position.set(x + dx, 2.75, z + dz); debrief.add(l); }
    }
    // 教室擺設：北牆白板（不寫字）＋掛鐘、考官面前評分夾板、每個座位一瓶水、角落盆栽
    const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; debrief.add(o); return o; };
    const white = mat(0xf8fafc, { roughness: 0.3 }), alu = mat(0xcbd5e1, { metalness: 0.6, roughness: 0.35 });
    add(new THREE.BoxGeometry(50, 19, 0.6), alu, DB_CX, 21, 411);                       // 白板外框
    add(new THREE.BoxGeometry(48, 17, 0.3), white, DB_CX, 21, 411.4);                   // 白板板面
    add(new THREE.BoxGeometry(30, 0.6, 1.6), alu, DB_CX, 11.4, 412);                    // 白板筆槽
    [[0x1d4ed8, -4], [0xdc2626, -1], [0x111827, 2]].forEach(([c, dx]) => add(new THREE.CylinderGeometry(0.25, 0.25, 2.4, 8), mat(c), DB_CX + dx, 11.95, 412).rotation.z = Math.PI / 2);
    const clock = add(new THREE.CylinderGeometry(3, 3, 0.5, 32), white, 425, 25, 411.3); clock.rotation.x = Math.PI / 2;
    const rim = add(new THREE.TorusGeometry(3, 0.3, 8, 32), mat(0x334155), 425, 25, 411.5);
    const hand = (len, ang) => { const h = add(new THREE.BoxGeometry(0.25, len, 0.1), mat(0x111827), 425, 25, 411.6); h.geometry.translate(0, len / 2, 0); h.rotation.z = ang; };
    hand(2.4, -0.9); hand(1.6, 2.2);
    const board = mat(0x8b5e34, { roughness: 0.6 }), paper = mat(0xffffff, { roughness: 0.8 });
    for (const x of DB_X) {
      add(new THREE.BoxGeometry(4, 0.25, 5.2), board, x, 10.05, DB_ZT - 2.6);            // 考官評分夾板
      add(new THREE.BoxGeometry(3.6, 0.1, 4.6), paper, x, 10.22, DB_ZT - 2.5);
      for (const dz of [-3.6, 3.6]) {                                                   // 每個座位一瓶水
        add(new THREE.CylinderGeometry(0.55, 0.55, 3, 12), mat(0x7dd3fc, { transparent: true, opacity: 0.55, roughness: 0.1 }), x + 2.6, 11.4, DB_ZT + dz);
        add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12), mat(0x2563eb), x + 2.6, 13.1, DB_ZT + dz);
      }
    }
    add(new THREE.CylinderGeometry(2.6, 2, 5, 16), mat(0xb45309, { roughness: 0.8 }), 437, 2.5, 418);   // 角落盆栽
    for (const [dx, dy, dz, r] of [[0, 9, 0, 4], [-2, 12, 1, 3], [2, 11.5, -1, 3.2], [0, 14.5, 0, 2.4]]) add(new THREE.SphereGeometry(r, 12, 10), mat(0x15803d, { roughness: 0.9 }), 437 + dx, dy, 418 + dz);
  }
  // 桌上的倒數碼錶（兩面都有數字，考官、考生都看得到）
  const timerCv = document.createElement("canvas"); timerCv.width = 320; timerCv.height = 140;
  const timerTex = new THREE.CanvasTexture(timerCv); timerTex.colorSpace = THREE.SRGBColorSpace;
  {
    const body = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.4, 2.2), mat(0x111827, { roughness: 0.4 })); body.position.set(DB_CX, 11.6, DB_ZT); debrief.add(body);
    for (const [dz, ry] of [[1.12, 0], [-1.12, Math.PI]]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 2.9), new THREE.MeshBasicMaterial({ map: timerTex, toneMapped: false }));
      face.position.set(DB_CX, 11.6, DB_ZT + dz); face.rotation.y = ry; debrief.add(face);
    }
  }
  function setDebriefTimer(sec) {
    const g = timerCv.getContext("2d"), v = Math.max(0, Math.ceil(sec));
    g.fillStyle = "#020617"; g.fillRect(0, 0, 320, 140);
    g.fillStyle = v <= 10 ? "#f87171" : "#4ade80"; g.font = '800 104px "SF Mono","Menlo",monospace'; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(`${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`, 160, 74);
    timerTex.needsUpdate = true;
  }
  setDebriefTimer(180);
  const sitAt = (id, x, z, north, label = true) => { const g = seated(id, label); g.position.set(x, 0, z); g.rotation.y = north ? -Math.PI / 2 : Math.PI / 2; debrief.add(g); return g; };
  const DB_EXAM = ["examiner", "examiner2", "examiner3", "examiner4"].map((id, i) => sitAt(id, DB_X[i], DB_ZN, false, false));   // 北側面向南
  const DB_CAND_IDS = ["xiaohua", "dingchen", "ruiyi", "yunding"];
  const DB_CAND = DB_CAND_IDS.map((id, i) => sitAt(id, DB_X[i], DB_ZS, true));                                         // 南側面向北
  const DB_WALK = DB_CAND_IDS.map((id) => { const m = makePerson(id); m.visible = false; debrief.add(m); return m; });   // 走進／走出用（站姿）
  const inner = (g) => g.children.find((c) => c.userData.person);
  let debTl = null;
  // step：null 不顯示｜0 走進來坐下｜1 團隊自行 debrief（考生輪流說話）｜2 考官問答（考官、考生輪流說話）｜3 考生起身走回觀摩教室｜4 已離開（只留考官）
  function setDebrief(step, animate) {
    debTl?.kill(); debTl = null;
    debrief.visible = step != null && step < 4;
    if (step == null) return;
    const talk = (list) => list.forEach((g) => setPose(inner(g), "sit"));
    talk(DB_EXAM); talk(DB_CAND);
    DB_WALK.forEach((m) => { m.visible = false; });
    DB_CAND.forEach((g) => { g.visible = step <= 2; });
    if (step === 0) setDebriefTimer(180);
    if (step >= 3) setDebriefTimer(0);
    if (step === 1 || step === 2) {                  // 說話輪替：step 1 只有考生；step 2 考官問、考生答
      const order = step === 1 ? DB_CAND : [DB_EXAM[0], DB_CAND[2], DB_EXAM[2], DB_CAND[0], DB_EXAM[1], DB_CAND[3], DB_EXAM[3], DB_CAND[1]];
      debTl = gsap.timeline({ repeat: -1 });
      order.forEach((g, i) => debTl.call(() => { talk(DB_EXAM); talk(DB_CAND); setPose(inner(g), "sitTalk"); }, null, i * 1.7));
      debTl.to({}, { duration: 1.7 }, (order.length - 1) * 1.7);
    }
    if (!animate) return;
    if (step === 0) {                                // 4 位考生從走廊走進來，走到自己的椅子後面坐下
      DB_CAND.forEach((g) => { g.visible = false; });
      const tl = debTl = gsap.timeline();
      DB_WALK.forEach((m, i) => {
        const x = DB_X[i], t0 = 0.3 + i * 0.7;
        tl.call(() => { m.visible = true; }, null, t0);
        walk(tl, m, [268, 400], [[268, 442], [300, 442], [326, 462], [x, 462], [x, DB_ZS + 4]], t0, [x, DB_ZT]);
        const arrive = t0 + (Math.hypot(0, 42) + 32 + Math.hypot(26, 20) + (x - 326) + (462 - DB_ZS - 4)) / 22;
        tl.call(() => { m.visible = false; DB_CAND[i].visible = true; }, null, arrive + 0.3);
      });
    }
    if (step === 3) {                                // 考生起身，從南側繞出教室，往北走回觀摩教室
      const tl = debTl = gsap.timeline();
      DB_WALK.forEach((m, i) => {
        const x = DB_X[i], t0 = 0.2 + (3 - i) * 0.5;
        m.visible = true; m.position.set(x, 0, DB_ZS + 4); face(m, x, DB_ZT);
        walk(tl, m, [x, DB_ZS + 4], [[x, 462], [326, 462], [300, 442], [268, 442], [268, 380]], t0, [268, 300]);
      });
    }
  }

  // 考官：站在大螢幕旁的講台說明注意事項（只在說明時出現）
  const examiner = new THREE.Group();
  {
    const p = makePerson("examiner", { label: false }); p.position.set(30, 0, 400); p.rotation.y = 0.64; setPose(p, "teach"); examiner.add(p);
    const podium = new THREE.Mesh(new THREE.BoxGeometry(8, 11, 10), mat(0x6b4f3a)); podium.position.set(36, 5.5, 398); podium.castShadow = true; examiner.add(podium);
  }
  examiner.visible = false; scene.add(examiner);
  // ---------- 考場門口：4 位隊員看題幹、考官在旁指示分組 ----------
  // 第一人稱站在隊員後方：看得到 4 個後腦勺（深色頭髮），前方是題幹看板，考官站在門的左邊
  function crewMember(color, nurse) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 14.5, 20), mat(color)); body.position.y = 7.25; body.castShadow = true; g.add(body);
    const face = new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 16), mat(0xf1d3b6)); face.position.set(0.45, 17.9, 0); g.add(face);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 16, -Math.PI / 2, Math.PI, 0, Math.PI * 0.62), mat(0x2b2018)); hair.position.set(0.1, 18.1, 0); g.add(hair);  // 後腦勺＋頭頂
    if (nurse) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, 1.6, 16), mat(0xffffff)); cap.position.y = 21.4; g.add(cap); }
    g.castShadow = true; return g;
  }
  // 放射師 1＋護理師 → CT 室（走到第 9 頁病人辨識的位置等兒子）；放射師 2、3 → MRI 等候區（安妮旁邊說明）
  // look：走到定點後面向哪裡
  const DOOR_CREW = [
    { c: 0x1d4ed8, at: [275, 243.5], path: [[284, 245], [298, 247], [312, 244], [322, 238], [352, 248], [386, 255]], look: [398, 249] },
    { c: 0xec4899, nurse: true, at: [275, 252], path: [[284, 250], [298, 249], [312, 251], [322, 254], [348, 251], [375, 247]], look: [398, 249] },
    { c: 0x1d4ed8, at: [267, 240], path: [[284, 244], [298, 247], [306, 260], [307, 288], [310, 312], [313, 320]], look: [313, 340] },
    { c: 0x1d4ed8, at: [267, 255.5], path: [[284, 251], [298, 250], [304, 262], [304, 290], [316, 306], [325, 320]], look: [325, 340] },
  ];
  // 標準病人：先在 MRI 等候區（安妮另一側）聽說明，聽完才走到隔壁 CT 室做電腦斷層
  const SP = { at: [319, 342], look: [319, 320], path: [[306, 344], [303, 318], [305, 290], [306, 262], [330, 247], [370, 240], [398, 249]], endLook: [386, 254] };   // 走到第 9 頁病人辨識的位置
  const doorScene = new THREE.Group(); doorScene.visible = false; scene.add(doorScene);
  // crew[0] 鼎晨（CT 放射師）、crew[1] 曉鏵（CT 護理師）、crew[2] 云玎（MRI 放射師，撥 999）、crew[3] 瑞益（MRI 放射師，壓胸）
  const CREW_IDS = ["dingchen", "xiaohua", "yunding", "ruiyi"];
  const crew = DOOR_CREW.map((d, i) => { const m = makePerson(CREW_IDS[i]); m.position.set(d.at[0], 0, d.at[1]); doorScene.add(m); return m; });
  const sp = makePerson("son"); sp.visible = false; doorScene.add(sp);     // 標準病人（兒子）
  {
    const ex = makePerson("examiner", { label: false }); ex.position.set(284, 0, 272); ex.rotation.y = Math.atan2(24, -12); doorScene.add(ex);      // 考官（面向隊員）
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 1.8), mat(0xffffff)); badge.position.set(2.7, 11.5, 0); ex.add(badge);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 3.8), mat(0x7c5c3b)); clip.position.set(3.4, 10, -1.8); clip.rotation.z = 0.5; ex.add(clip);
    // 題幹看板（立架＋紙），面向隊員（-x）
    const cv = document.createElement("canvas"); cv.width = 900; cv.height = 640; const g = cv.getContext("2d");
    g.fillStyle = "#fffdf7"; g.fillRect(0, 0, 900, 640);
    g.fillStyle = "#0f2a4a"; g.font = '900 64px "PingFang TC","Microsoft JhengHei",sans-serif'; g.fillText("題幹", 60, 110);
    g.fillStyle = "#cbd5e1"; g.fillRect(60, 140, 780, 4);
    g.fillStyle = "#1e293b"; g.font = '700 46px "PingFang TC","Microsoft JhengHei",sans-serif';
    ["一對父子來放射科做檢查。", "兒子要做電腦斷層，", "需打對比劑；", "父親失智，要做 Brain MRI，", "不打對比劑。"].forEach((t, i) => g.fillText(t, 60, 225 + i * 78));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(13, 9.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.rotation.y = -Math.PI / 2; board.position.set(284.4, 19, 261); doorScene.add(board);
    const backer = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 14), mat(0x334155)); backer.position.set(284.8, 19, 261); doorScene.add(backer);
    for (const dz of [-4, 4]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 15, 8), mat(0x64748b)); leg.position.set(285.4, 7.5, 261 + dz); leg.rotation.x = dz * 0.012; doorScene.add(leg); }
  }
  // mode：null 隱藏／"door" 門口看題幹／"split" 兩兩分組走進 CT 與 MRI 等候區／"spToCT" 標準病人走到 CT 室
  let crewTl = null;
  const face = (m, x, z) => { m.rotation.y = Math.atan2(-(z - m.position.z), x - m.position.x); };
  function walk(tl, m, from, path, t0, end, speed = 22) {
    let t = t0, [px, pz] = from;
    m.position.set(px, 0, pz);
    for (const [x, z] of path) {
      const dur = Math.hypot(x - px, z - pz) / speed;
      tl.call(() => face(m, x, z), null, t).to(m.position, { x, z, duration: dur, ease: "none" }, t);
      t += dur; px = x; pz = z;
    }
    if (end) tl.call(() => face(m, ...end), null, t);
  }
  function setDoorScene(mode, animate) {
    crewTl?.kill(); crewTl = null;
    doorScene.visible = !!mode;
    if (!mode) return;
    const door = mode === "door";
    DOOR_CREW.forEach((d, i) => {
      const m = crew[i];
      if (door) { m.position.set(d.at[0], 0, d.at[1]); m.rotation.y = 0; }
      else { const e = d.path.at(-1); m.position.set(e[0], 0, e[1]); face(m, ...d.look); }
    });
    sp.visible = !door;
    if (!door) {
      const e = mode === "spToCT" ? SP.path.at(-1) : SP.at;
      sp.position.set(e[0], 0, e[1]); face(sp, ...(mode === "spToCT" ? SP.endLook : SP.look));
    }
    if (!animate || door) return;
    crewTl = gsap.timeline();
    if (mode === "split") DOOR_CREW.forEach((d, i) => walk(crewTl, crew[i], d.at, d.path, i < 2 ? 0 : 0.5, d.look));
    else walk(crewTl, sp, SP.at, SP.path, 0.3, SP.endLook);
  }

  // ---------- 第 9 頁：兩間考場同時進行（左 CT 室、右 MRI 等候區，兩台監視器鏡頭） ----------
  const dualCam = { ct: new THREE.PerspectiveCamera(48, 1, 1, 2000), mri: new THREE.PerspectiveCamera(48, 1, 1, 2000) };
  const DUAL_POSE = {
    ct: { pos: [376, 112, 318], look: [378, 0, 250] },             // CT 室：看得到掃描儀、病人、控制台、工作台
    mri: [
      { pos: [343, 64, 369], look: [318, 2, 322] },                // 病人辨識、金屬探測
      { pos: [343, 64, 369], look: [318, 2, 322] },
      { pos: [333, 44, 318], look: [368, 12, 342] },               // 帶到 MRI 控制台（看 PACS 螢幕）
      { pos: [338, 50, 360], look: [318, 2, 326] },                // 人工檢查：拉近安妮
      { pos: [347, 78, 382], look: [392, 0, 334] },                // 第 10 頁：MRI 室（推床進來、過床、送進磁體）
      { pos: [347, 78, 382], look: [392, 0, 334] },
      { pos: [372, 52, 366], look: [408, 6, 334] },                // 躁動：拉近磁體
      { pos: [362, 60, 372], look: [398, 4, 334] },
      { pos: [347, 78, 382], look: [392, 0, 334] },                // 第 11 頁：進去看病人、回控制台打電話
      { pos: [347, 78, 382], look: [392, 0, 334] },
      { pos: [347, 78, 382], look: [392, 0, 334] },
      { pos: [347, 78, 382], look: [392, 0, 334] },
      { pos: [350, 80, 386], look: [388, 0, 336] },                // 12 MRI 室：監視器出現 AF
      { pos: [350, 74, 296], look: [321, 0, 327] },                // 13 起：等候區急救
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [350, 74, 296], look: [321, 0, 327] },
      { pos: [354, 138, 414], look: [334, 0, 334] },               // 14 起：從等候區南邊往北看（看得到兒子從走廊衝進來）
      { pos: [354, 138, 414], look: [334, 0, 334] },
      { pos: [322, 128, 410], look: [322, 0, 328] },               // 14 第 3 步起：只剩 MRI 單一畫面，等候區置中
      { pos: [322, 128, 410], look: [322, 0, 328] },
      { pos: [322, 128, 410], look: [322, 0, 328] },
      { pos: [292, 112, 398], look: [290, 0, 328] },               // 15 TRM：整個畫面只用這個鏡頭，等候區放在畫面右邊（左邊放文字卡）
      { pos: [292, 112, 398], look: [290, 0, 328] },
      { pos: [292, 112, 398], look: [290, 0, 328] },
      { pos: [292, 112, 398], look: [290, 0, 328] },
      { pos: [292, 112, 398], look: [290, 0, 328] },
    ],
  };

  const dualAim = { ct: { p: new THREE.Vector3(), l: new THREE.Vector3() }, mri: { p: new THREE.Vector3(), l: new THREE.Vector3() } };
  function aimDual(id, pose, animate) {
    const a = dualAim[id];
    if (!animate) { gsap.killTweensOf([a.p, a.l]); a.p.set(...pose.pos); a.l.set(...pose.look); return; }   // 先停掉還在跑的鏡頭移動（快速連按再倒退時）
    gsap.to(a.p, { x: pose.pos[0], y: pose.pos[1], z: pose.pos[2], duration: 1.6, ease: "power2.inOut", overwrite: true });
    gsap.to(a.l, { x: pose.look[0], y: pose.look[1], z: pose.look[2], duration: 1.6, ease: "power2.inOut", overwrite: true });
  }
  // 第 8 頁分組後：用第 9 頁同一組監視器鏡頭（"mri"＝分組說明時只看 MRI 等候區；"dual"＝兒子走去 CT，左右兩個畫面）
  // 單一 MRI 畫面時左邊有文字卡 → 看的點往左偏，讓等候區落在畫面右邊
  const DOOR_MRI_SOLO = { pos: [346, 70, 378], look: [304, 2, 330] };
  let doorView = null;
  function setDoorView(mode, animate) {
    const prev = doorView; doorView = mode || null;
    if (!doorView || dualOn) return;
    aimDual("ct", DUAL_POSE.ct, false);
    const pose = doorView === "dual" ? DUAL_POSE.mri[0] : DOOR_MRI_SOLO;
    aimDual("mri", pose, animate && prev != null);
  }
  const split = { v: 0.5 };
  // 左右畫面的比例（0＝只顯示右邊 MRI 鏡頭）；dur＞0 時平滑滑動
  function setDualSplit(r, dur = 0) {
    if (Math.abs(r - split.v) < 1e-4) return;
    gsap.killTweensOf(split);
    if (dur > 0) gsap.to(split, { v: r, duration: dur, ease: "power2.inOut" }); else split.v = r;
  }
  function renderDual() {
    const w = view.w, h = view.h, half = Math.floor(w * split.v);
    renderer.setScissorTest(true);
    for (const [id, x, vw] of [["ct", 0, half], ["mri", half, w - half]]) {
      if (vw <= 0) continue;                             // split 0：只畫右邊鏡頭（整個畫面）
      const c = dualCam[id], a = dualAim[id];
      c.aspect = vw / h; c.updateProjectionMatrix(); c.position.copy(a.p); c.lookAt(a.l);
      renderer.setViewport(x, 0, vw, h); renderer.setScissor(x, 0, vw, h); renderer.render(scene, c);
    }
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
  }
  // 頭上的小圖示（病人辨識打勾、說明對話框）
  function badge(text, bg, size = 1, fg = "#fff") {
    const cv = document.createElement("canvas"), g = cv.getContext("2d"), px = 64;
    g.font = `900 ${px}px "PingFang TC","Microsoft JhengHei",sans-serif`;
    const w = Math.ceil(g.measureText(text).width + px * 1.1), h = Math.ceil(px * 1.7);
    cv.width = w; cv.height = h + 22;
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 16, h - 2); g.lineTo(w / 2, h + 20); g.lineTo(w / 2 + 16, h - 2); g.fill();
    g.font = `900 ${px}px "PingFang TC","Microsoft JhengHei",sans-serif`; g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
    const k = 2.6 * size / h * 1.7; sp.scale.set(w * k / 1.7, (h + 22) * k / 1.7, 1); sp.renderOrder = 30; sp.visible = false; scene.add(sp);
    return sp;
  }
  const B = {
    idSP: badge("✓ 病人辨識", "#16a34a", 2), idAnne: badge("✓ 病人辨識", "#16a34a"),          // CT 鏡頭比較遠，CT 的圖示放大
    explain: badge("說明這次檢查", "#0284c7", 2), teach: badge("檢查前衛教", "#0284c7", 2),
    iv: badge("打上針頭", "#db2777", 2), line: badge("接上對比劑管路", "#d97706", 2),
    stopCT: badge("■ 停止檢查", "#dc2626", 2), swell: badge("手部腫、痛 → IV Loss", "#dc2626", 2),
    callCT: badge("☎ 跟臨床交班", "#0284c7", 2), teachIV: badge("衛教 IV Loss 處置", "#db2777", 2),
    lookMRI: badge("進去看病人狀況", "#7c3aed"), callMRI: badge("☎ 聯絡臨床醫師", "#7c3aed"),
    argue: badge("因 IV Loss 跟放射師爭執", "#dc2626", 2),
    af: badge("AF、心跳變慢", "#dc2626"), out: badge("意識改變 → 推到等候區", "#dc2626"), arrest: badge("心跳停止", "#dc2626"),
    call1: badge("叫：拍肩叫喚病人", "#ea580c"), call999: badge("☎ 叫：撥 999", "#ea580c"), cpr: badge("C：壓胸", "#dc2626"),
    bvm: badge("背板、BVM，氧氣開到最大", "#0284c7"), handoff: badge("放射師 → 護理師 交班，領導交給護理師", "#16a34a"), pads: badge("D：貼上貼片判讀（沒有電擊）", "#ca8a04"),
    sonUpset: badge("兒子得知父親在急救，情緒激動", "#dc2626", 1.4), calmCT: badge("CT 放射師先安撫兒子", "#0284c7", 1.4), runOut: badge("兒子衝出 CT 室", "#dc2626", 1.6),
    leader: badge("領導者：護理師", "#16a34a", 1.3), riot: badge("兒子衝進等候區大鬧", "#dc2626", 1.5), calmW: badge("CT 放射師追過來安撫", "#0284c7", 1.5),
    team999: badge("院內 999 急救團隊到場", "#7c3aed", 1.5), handoff999: badge("護理師 → 急救團隊 交班", "#16a34a", 1.5),
    crown: badge("👑 領導者", "#ca8a04", 1.6), endHand: badge("護理師 → 醫師 交班，考試結束", "#16a34a", 1.5),
    qCpr: badge("C：壓胸", "#dc2626", 1.6), qBvm: badge("背板、BVM，氧氣開到最大", "#0284c7", 1.6), qPads: badge("D：貼上貼片判讀（沒有電擊）", "#ca8a04", 1.6), detect: badge("金屬探測", "#7c3aed"), pacs: badge("PACS 看 X 光", "#7c3aed"), manual: badge("人工檢查", "#ea580c"),
    trapPatch: badge("⚠ 頸部痠痛貼布", "#dc2626"), trapWarmer: badge("⚠ 口袋暖暖包", "#dc2626"),
    trapTake: badge("移除痠痛貼布、暖暖包", "#ea580c"), trapDesk: badge("✓ 放在檢查控制台", "#16a34a"),
  };
  // 人工檢查部位（安妮身上，橘色圈）：頭、頸、雙手腕、口袋、腳
  const TRAP_RINGS = [1, 5];                                       // 頸部、右側口袋（發現陷阱的位置，圈變紅）
  const checkRings = [[310, 330], [313, 330], [319.5, 326], [319.5, 334], [323, 327.5], [323, 332.5], [331, 330]].map(([x, z]) => {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.32, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf97316, toneMapped: false }));   // 每個圈各自的材質
    r.rotation.x = -Math.PI / 2; r.position.set(x, 10.6, z); r.visible = false; scene.add(r); return r;
  });
  // ---------- 第 9 頁考題陷阱：頸部痠痛貼布、口袋暖暖包（可能有金屬成分；金屬探測器測不到，人工檢查才發現） ----------
  const trapPatch = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 3.4), mat(0xfbf7ee, { roughness: 0.9 }));
  const trapWarmer = new THREE.Group();
  { const pk = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 4.6), mat(0xf8fafc, { roughness: 0.6 })); trapWarmer.add(pk);
    const band = new THREE.Mesh(new THREE.BoxGeometry(6.42, 0.92, 1.2), mat(0xf97316)); band.position.z = -0.9; trapWarmer.add(band); }
  const TRAP_ON_ANNIE = { patch: [[-30, 5.55, 0], [0, 0, 0]], warmer: [[4, 7.1, 5.4], [0, 0.35, 0.12]] };   // 安妮本地座標：頸部正面、腹部右側口袋（露出一半）
  const TRAP_ON_DESK = { patch: [364.6, 10.75, 341.5], warmer: [364.6, 10.85, 344.4] };                        // MRI 檢查控制台桌面（空的一側）
  function trapsOnAnnie() {
    for (const [o, k] of [[trapPatch, "patch"], [trapWarmer, "warmer"]]) {
      gsap.killTweensOf(o.position); annie.add(o); o.position.set(...TRAP_ON_ANNIE[k][0]); o.rotation.set(...TRAP_ON_ANNIE[k][1]); o.scale.setScalar(1); o.visible = true;
    }
  }
  function trapsOnDesk() {
    for (const [o, k] of [[trapPatch, "patch"], [trapWarmer, "warmer"]]) {
      gsap.killTweensOf(o.position); scene.add(o); o.position.set(...TRAP_ON_DESK[k]); o.rotation.set(0, 0.2, 0); o.scale.setScalar(S); o.visible = true;
    }
  }
  trapsOnAnnie();
  // 瑞益手上的探測棒：每一格把握把放在右手骨頭的位置，棒身朝前下方（對著安妮），wandSweep.a＝左右掃動角度
  const wandHand = handWand(); wandHand.scale.setScalar(0.3); wandHand.visible = false; scene.add(wandHand);
  const wandSweep = { a: 0 }, _wh = new THREE.Vector3(), _wd = new THREE.Vector3(), _wy = new THREE.Vector3(0, 1, 0);
  function updateWand() {
    if (!wandHand.visible) return;
    const h = boneWorld(crew[3], "hand_r", _wh);
    const ry = crew[3].rotation.y + wandSweep.a, tilt = 0.75;              // 往下傾約 43°
    _wd.set(Math.cos(ry) * Math.cos(tilt), -Math.sin(tilt), -Math.sin(ry) * Math.cos(tilt));   // 棒身方向（握把 → 探測頭）
    if (!h) { _wh.set(crew[3].position.x, 10, crew[3].position.z); }
    wandHand.quaternion.setFromUnitVectors(_wy, _wd.clone().negate());     // 模型的 +y 指向握把
    wandHand.position.copy(_wh).addScaledVector(_wd, 4.8);                 // 握把中心（本地 y＝16×0.3）對在手上
  }
  const ivMark = new THREE.Group();
  { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4, 8), mat(0xf8fafc)); tube.rotation.z = Math.PI / 2; ivMark.add(tube);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 1.8), mat(0xfde68a)); tape.position.y = 0.3; ivMark.add(tape); }
  ivMark.position.set(0.6, 9.5, 3.5); ivMark.visible = false; sp.add(ivMark);
  const swell = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.55, toneMapped: false }));
  swell.position.set(0.6, 9.5, 3.9); swell.visible = false; sp.add(swell);
  gsap.to(swell.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });
  // CT 病人躺上 CT 床（頭朝機架、面朝上）；留置針在靠北側的手臂
  const SP_LIE = { pos: [398, 10.65, 237.6], rot: [Math.PI, 0, -Math.PI / 2] };   // 背部貼齊床面（床面 y＝9），腳跟在床尾內
  const IV_AT = new THREE.Vector3(407.5, 11.25, 234.1);
  // 對比劑管路：從打藥機延長管末端接到病人手上的留置針（逐段畫出）
  let ctLine = null, lineDX = 0;
  function lineGeo(dx) {
    injector.updateMatrixWorld(true);
    const a = injector.children[0].localToWorld(new THREE.Vector3(-36, 31.4, 30)), b = IV_AT.clone(); b.x += dx;
    const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3((a.x + b.x) / 2, Math.min(a.y, b.y) - 2, (a.z + b.z) / 2 + 1), new THREE.Vector3(b.x - 1.5, b.y + 1.2, b.z - 1.5), b]);
    return new THREE.TubeGeometry(curve, 60, 0.6, 8);
  }
  function contrastLine() {
    if (ctLine) return ctLine;
    const geo = lineGeo(0);
    ctLine = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.35, roughness: 0.4 }));
    ctLine.userData.n = geo.index.count; ctLine.visible = false; scene.add(ctLine);
    return ctLine;
  }
  function setLineDX(dx) {                              // 病人送進機架：管路末端跟著移動
    const l = contrastLine(); if (dx === lineDX) return; lineDX = dx;
    const range = { ...l.geometry.drawRange }; l.geometry.dispose(); l.geometry = lineGeo(dx); l.geometry.setDrawRange(range.start, range.count);
  }
  const lineDraw = (v) => { const l = contrastLine(); l.geometry.setDrawRange(0, Math.floor(l.userData.n * v / 6) * 6); l.visible = v > 0; };
  const standSP = () => { sp.rotation.set(0, 0, 0); sp.position.y = 0; };
  const lieSP = () => { sp.position.set(...SP_LIE.pos); sp.rotation.set(...SP_LIE.rot); };
  // 急救用品（掛在安妮本地座標上，安妮在推床上時位置剛好）
  const board = new THREE.Mesh(new THREE.BoxGeometry(44, 1.2, 26), mat(0xd97706, { roughness: 0.5 })); board.position.set(-10, -0.8, 0); board.visible = false; annie.add(board);
  const bvm = new THREE.Group();
  { const mask = new THREE.Mesh(new THREE.ConeGeometry(4.2, 4, 18), mat(0xe0f2fe, { transparent: true, opacity: 0.85 })); mask.rotation.z = Math.PI / 2; bvm.add(mask);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 12), mat(0x2563eb, { roughness: 0.6 })); bag.scale.set(2.1, 1, 1); bag.position.set(-10, 2, 0); bvm.add(bag); bvm.userData.bag = bag; }
  bvm.position.set(-38, 9, 0); bvm.visible = false; annie.add(bvm);
  const pads = new THREE.Group();
  for (const [x, z] of [[-17, -6], [-4, 7]]) { const pd = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 6), mat(0xf8fafc)); pd.position.set(x, 4.6, z); pads.add(pd); }
  pads.visible = false; annie.add(pads);
  let o2Line = null;
  function showO2(on) {                                  // 氧氣鋼瓶 → BVM 的氧氣管
    if (on && !o2Line) {
      annie.updateMatrixWorld(true);
      const a = new THREE.Vector3(318.5, 17, 365), b = bvm.localToWorld(new THREE.Vector3(-12, 2, 0));
      o2Line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, new THREE.Vector3(316, 3, 355), new THREE.Vector3(306, 3, 340), b]), 48, 0.35, 6), mat(0x22c55e, { roughness: 0.5 }));
      scene.add(o2Line);
    }
    if (o2Line) o2Line.visible = on;
  }
  let compressTw = null;
  function compress(on) { compressTw?.kill(); compressTw = null; crew[3].position.y = 0; if (on) compressTw = gsap.to(crew[3].position, { y: -1.3, duration: 0.27, repeat: -1, yoyo: true, ease: "sine.inOut" }); }
  let hrTw = null;
  function vitals(mode, hr, animateTo) { hrTw?.kill(); hrTw = null; annieVitals.mode = mode; annieVitals.hr = hr; if (animateTo != null) hrTw = gsap.to(annieVitals, { hr: animateTo, duration: 12, ease: "none" }); }
  // 各人在每一步的定點（x, z, 面向的點）
  const CT_SP = [398, 249, [386, 254]], CT_RAD = [386, 255, [398, 249]], CT_NURSE = [375, 247, [398, 249]];
  const CT_RAD_LIE = [408, 251, [408, 238]], CT_NURSE_IV = [407, 227.5, [407, 238]];
  const M_A = [313, 320, [313, 340]], M_A_CON = [357, 335, [380, 335]], M_B = [325, 320, [325, 340]], M_B_SWEPT = [331, 322, [331, 340]], M_B_MANUAL = [316, 323, [316, 340]];
  // 第 10 頁定點：CT 放射師、護理師回控制台；MRI 推床停在 MRI 檢查床南側，安妮過床到 MRI 床（頭朝磁體）
  const CT_RAD_CON = [347, 226, [360, 226]], CT_NURSE_CON = [347, 237, [360, 237]], SP_IN_DX = 8;
  const STR_HOME = [319, 330], STR_PARK = [395, 349], STR_PATH = [[319, 330], [319, 356], [392, 356], [395, 349]];
  const ANNIE_TABLE = [403, 9, 335], ANNIE_BORE = 412;     // 整個躺在 MRI 床上、頭朝磁體；送進去時頭部先進磁體
  const M_A_CON2 = [357, 330, [380, 330]], M_B_CON2 = [357, 342, [380, 342]];
  const MON_HOME = [325.5, 363.5], MON_DX = -23;
  const M_A_SIDE = [405, 344, [405, 330]], M_B_SIDE = [395, 326, [395, 340]];
  // 第 12、13 頁：安妮推回等候區；叫病人／壓胸的放射師（crew[3]）在推床南側胸口旁，撥 999 的放射師（crew[2]）撥完到床頭拿 BVM
  const MON_BACK = [STR_HOME[0] + MON_DX, STR_HOME[1]];
  const R_CPR = [315, 337, [315, 330]], R_HEAD = [300, 330, [319, 330]], R_PHONE = [357, 335, [380, 335]], N_ARRIVE = [328, 342, [319, 330]];
  const CART_HOME = [310.5, 364], CART_NEAR = [332, 352];
  // 第 14 頁：兒子（CT 標準病人）衝出 CT 室 → 走廊 → 等候區；999 急救團隊（醫師白衣＋2 位隊員）從走廊進來
  const team999 = ["doctor", "medic_m", "medic_f"].map((id) => { const m = makePerson(id, { label: false }); m.visible = false; scene.add(m); return m; });
  const SON_OUT = [[380, 240], [340, 246], [306, 250], [306, 292]], RAD_OUT_END = [306, 278];
  const SON_RIOT = [324, 314, [319, 330]], RAD_CALM = [314, 309, [324, 314]];
  const SON_ASIDE = [334, 303, [319, 330]], RAD_ASIDE = [327, 299, [334, 303]];
  const T999_IN = [[306, 250], [306, 290], [312, 312]];
  const T999 = [[337, 337, [328, 342]], [324, 320, [319, 330]], [312, 320, [319, 330]]];
  let sonShake = null;
  // 第 15 頁：領導者腳下的金色光圈（跟著 👑 領導者標記移動）
  const leadRing = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.6, 10, 40), new THREE.MeshBasicMaterial({ color: 0xfacc15, toneMapped: false }));
  leadRing.rotation.x = -Math.PI / 2; leadRing.position.y = 0.6; leadRing.visible = false; scene.add(leadRing);
  function annieBack() {                                // 安妮在推床上、推床回等候區中間，監視器在床頭旁
    annieHome(); waitMon.position.set(MON_BACK[0], 0, MON_BACK[1]); updateCables(true);
  }      // 第 11 頁：進 MRI 室看安妮（床的兩側）                       // 監視器跟在推床西側（床頭那一端）
  let annieJitter = null;
  function annieHome() {
    annieJitter?.kill(); annieJitter = null;
    if (annie.parent !== stretcher.children[0]) { stretcher.children[0].add(annie); }
    annie.position.set(2, 28, 0); annie.rotation.set(0, 0, 0); annie.scale.setScalar(1);
    stretcher.position.set(STR_HOME[0], 0, STR_HOME[1]);
    waitMon.position.set(MON_HOME[0], 0, MON_HOME[1]);
    updateCables(true);
  }
  function annieOnTable(x) {
    annieJitter?.kill(); annieJitter = null;
    if (annie.parent !== scene) scene.attach(annie);
    annie.position.set(x, ANNIE_TABLE[1], ANNIE_TABLE[2]); annie.rotation.set(0, Math.PI, 0); annie.scale.setScalar(S);
    stretcher.position.set(STR_PARK[0], 0, STR_PARK[1]);
    waitMon.position.set(STR_PARK[0] + MON_DX, 0, STR_PARK[1]);
    updateCables(true);
  }
  const putAt = (m, [x, z, look]) => { m.position.set(x, 0, z); face(m, ...look); };
  const over = (spr, m, h = 25) => { spr.position.set(m.position.x, h, m.position.z); };
  let dualTl = null, dualOn = false;
  // 第 16 頁：ISBAR 五個交班時機——人物直接回到當時那一步（src）的位置，鏡頭飛到該處，只留當時的交班標籤
  const ISBAR_VIEW = {
    32: { src: 26, cam: { pos: [300, 215, 420], look: [302, 0, 292] }, show: [] },                     // 總覽（考場在畫面右邊）
    33: { src: 10, cam: { pos: [332, 100, 400], look: [350, 4, 330] }, show: ["callMRI"], k: 1.8 },    // 1 MRI 躁動：聯絡臨床醫師
    34: { src: 20, cam: { pos: [292, 112, 398], look: [290, 0, 328] }, show: ["handoff"], k: 1.6 },    // 2 護理師支援：放射師交班
    35: { src: 26, cam: { pos: [292, 112, 398], look: [290, 0, 328] }, show: ["handoff999"] },         // 3 急救團隊到場：護理師跟醫師交班
    36: { src: 10, cam: { pos: [310, 110, 308], look: [328, 4, 234] }, show: ["callCT"] },             // 4 CT IV loss：跟臨床交班
    37: { src: 11, cam: { pos: [310, 110, 308], look: [328, 4, 234] }, show: ["teachIV"] },            // 5 IV loss 後續：衛教
  };
  // 第 17 頁片尾：所有人物在等候區推床南邊排成一排、面向鏡頭鞠躬，鏡頭再像升降臂一樣慢慢拉高
  const CUR_LOW = { pos: [319, 72, 400], look: [319, 10, 343] }, CUR_HIGH = { pos: [300, 300, 540], look: [325, 0, 300] };
  function curtain(step, animate) {
    const a = dualAim.mri, p0 = a.p.clone(), l0 = a.l.clone(), wasOn = dualOn;
    setDualCore(26, false);
    for (const b of Object.values(B)) b.visible = false;
    leadRing.visible = false; compress(false); showO2(false); bvm.visible = false;
    cart.position.set(338, 0, 308);                    // 急救車移到推床後面，不擋住謝幕的人
    const cast = [crew[2], crew[3], crew[0], sp, crew[1], ...team999];   // 三位放射師、兒子、護理師、醫師＋兩位隊員
    cast.forEach((m, i) => { m.visible = true; m.position.set(296 + i * 6.5, 0, 352); m.rotation.set(0, 0, 0); face(m, m.position.x, 430); setPose(m, "stand"); });
    if (!animate || step === 39) {
      if (animate && wasOn) { a.p.copy(p0); a.l.copy(l0); aimDual("mri", step === 39 ? CUR_HIGH : CUR_LOW, true); }
      else aimDual("mri", step === 39 ? CUR_HIGH : CUR_LOW, false);
      return;
    }
    gsap.killTweensOf([a.p, a.l]);
    if (wasOn) { a.p.copy(p0); a.l.copy(l0); } else { a.p.set(...CUR_LOW.pos); a.l.set(...CUR_LOW.look); }
    const tl = dualTl = gsap.timeline(), V3 = (v) => ({ x: v[0], y: v[1], z: v[2] });
    tl.to(a.p, { ...V3(CUR_LOW.pos), duration: 2.2, ease: "power2.inOut" }, 0).to(a.l, { ...V3(CUR_LOW.look), duration: 2.2, ease: "power2.inOut" }, 0);
    const bows = cast.map(personOf);
    tl.to(bows, { bow: 1, duration: 0.8, ease: "power2.out", stagger: 0.06 }, 2.6);            // 一起鞠躬（彎腰）
    tl.to(bows, { bow: 0, duration: 0.9, ease: "power2.inOut", stagger: 0.06 }, 4.2);
    tl.to(a.p, { ...V3(CUR_HIGH.pos), duration: 34, ease: "sine.inOut" }, 5.2).to(a.l, { ...V3(CUR_HIGH.look), duration: 34, ease: "sine.inOut" }, 5.2);
  }
  const TRAP_CAM = { pos: [336, 92, 398], look: [336, 4, 336] };   // 看得到安妮與 MRI 控制台
  function removeTraps(animate) {
    const a = dualAim.mri, p0 = a.p.clone(), l0 = a.l.clone(), wasOn = dualOn;
    setDualCore(3, false);
    for (const k of ["manual", "trapPatch", "trapWarmer", "detect", "pacs"]) B[k].visible = false;
    checkRings.forEach((r) => { r.visible = false; });
    if (animate && wasOn) { a.p.copy(p0); a.l.copy(l0); aimDual("mri", TRAP_CAM, true); } else aimDual("mri", TRAP_CAM, false);
    const DESK_STAND = [358, 347, [380, 345]];
    const deskBadge = () => { B.trapDesk.visible = true; B.trapDesk.position.set(352, 27, 350); };
    if (!animate) { trapsOnDesk(); putAt(crew[3], DESK_STAND); deskBadge(); return; }
    trapsOnAnnie(); B.trapDesk.visible = false;
    const tl = dualTl = gsap.timeline();
    const nW = annie.localToWorld(new THREE.Vector3(-30, 6, 0)), wW = annie.localToWorld(new THREE.Vector3(4, 7.5, 5.4));
    const hand = (o) => { crew[3].attach(o); gsap.to(o.position, { x: 2.6, y: 11, z: 0.8, duration: 0.5, ease: "power2.out" }); };   // 拿在手上
    putAt(crew[3], M_B_MANUAL);
    walk(tl, crew[3], [316, 323], [[nW.x, 323]], 0.2, [nW.x, 340]);                                     // 走到頸部旁
    tl.call(() => { B.trapTake.visible = true; over(B.trapTake, crew[3], 26); }, null, ">");
    tl.to(trapPatch.position, { y: "+=3", duration: 0.6, ease: "power2.out" }, ">+0.2");                // 撕下貼布
    tl.call(() => hand(trapPatch), null, ">");
    walk(tl, crew[3], [nW.x, 323], [[338, 323], [338, 338], [wW.x + 2, 338]], tl.duration() + 0.4, [wW.x, wW.z]);   // 繞到口袋那一側
    tl.to(trapWarmer.position, { y: "+=3", x: "+=1", duration: 0.6, ease: "power2.out" }, ">+0.2");      // 從口袋拿出暖暖包
    tl.call(() => hand(trapWarmer), null, ">");
    tl.call(() => { B.trapTake.visible = false; }, null, ">+0.3");
    walk(tl, crew[3], [wW.x + 2, 338], [[340, 352], [357, 352], DESK_STAND.slice(0, 2)], tl.duration() + 0.2, DESK_STAND[2]);   // 走到 MRI 控制台
    tl.call(() => {
      for (const [o, k] of [[trapPatch, "patch"], [trapWarmer, "warmer"]]) {
        scene.attach(o);
        gsap.to(o.position, { x: TRAP_ON_DESK[k][0], y: TRAP_ON_DESK[k][1], z: TRAP_ON_DESK[k][2], duration: 0.6, ease: "power2.inOut" });
        gsap.to(o.rotation, { x: 0, y: 0.2, z: 0, duration: 0.6 });
        gsap.to(o.scale, { x: S, y: S, z: S, duration: 0.6 });
      }
    }, null, ">+0.2");
    tl.call(deskBadge, null, ">+0.8");
  }
  function setDual(step, animate) {
    if (step === 38 || step === 39) return curtain(step, animate);
    if (step === 40) return removeTraps(animate);
    const iv = ISBAR_VIEW[step];
    if (!iv) return setDualCore(step, animate);
    const a = dualAim.mri, p0 = a.p.clone(), l0 = a.l.clone(), wasOn = dualOn;
    setDualCore(iv.src, false);                        // 人物、道具直接到當時那一步的位置（不重播走路）
    if (animate && wasOn) { a.p.copy(p0); a.l.copy(l0); aimDual("mri", iv.cam, true); } else aimDual("mri", iv.cam, false);
    for (const b of Object.values(B)) b.visible = false;
    for (const k of iv.show) { B[k].visible = true; B[k].userData.s0 ||= B[k].scale.clone(); B[k].scale.copy(B[k].userData.s0).multiplyScalar(iv.k || 1); if (animate) gsap.fromTo(B[k].material, { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 1.2 }); }
  }
  function setDualCore(step, animate) {
    dualTl?.kill(); dualTl = null;
    [...crew, ...team999, sp].forEach((m) => { m.rotation.x = 0; m.rotation.z = 0; gsap.killTweensOf(personOf(m)); personOf(m).bow = 0; });   // 第 17 頁鞠躬中途離開時還原
    sonShake?.kill(); sonShake = null;
    const was = dualOn; dualOn = step != null;
    if (!dualOn) {                                     // 離開第 9 頁：只還原第 9 頁自己改過的東西
      if (was) {
        team999.forEach((m) => { m.visible = false; }); leadRing.visible = false;
        for (const b of Object.values(B)) b.visible = false;
        checkRings.forEach((r) => { r.visible = false; });
        wandHand.visible = false; standWand.visible = true; ivMark.visible = false; mriScreen.material.map = homeTex;
        standSP(); lineDraw(0); setLineDX(0); annieHome(); swell.visible = false; trapsOnAnnie();
        board.visible = bvm.visible = pads.visible = false; showO2(false); compress(false); vitals("normal", 78); cart.position.set(CART_HOME[0], 0, CART_HOME[1]);
      }
      return;
    }
    doorScene.visible = true; sp.visible = true;
    for (const b of Object.values(B)) { b.visible = false; b.material.opacity = 1; if (b.userData.s0) b.scale.copy(b.userData.s0); }   // 第 16 頁放大過的標籤還原   // 上一步的淡入被中斷時，透明度要還原
    checkRings.forEach((r) => { r.visible = false; });
    aimDual("ct", DUAL_POSE.ct, false);
    aimDual("mri", DUAL_POSE.mri[step], animate && step > 0);
    if (!(animate && step > 0)) aimDual("mri", DUAL_POSE.mri[step], false);
    // 最終定點（不播動畫時直接到位）
    standSP(); putAt(sp, CT_SP); if (step >= 2) lieSP();
    if (step >= 4) sp.position.x = SP_LIE.pos[0] + SP_IN_DX;
    setLineDX(step >= 4 ? SP_IN_DX : 0);
    putAt(crew[0], step >= 4 ? CT_RAD_CON : step >= 2 ? CT_RAD_LIE : CT_RAD); putAt(crew[1], step >= 4 ? CT_NURSE_CON : step >= 2 ? CT_NURSE_IV : CT_NURSE);
    lineDraw(step >= 2 ? 1 : 0);
    if (step >= 4) annieOnTable(step === 5 || step === 6 ? ANNIE_BORE : ANNIE_TABLE[0]); else annieHome();
    if (step === 6) annieJitter = gsap.to(annie.rotation, { x: 0.06, z: 0.05, duration: 0.18, repeat: -1, yoyo: true, ease: "sine.inOut" });   // 病人躁動
    swell.visible = step >= 9;
    // 第 12、13 頁
    board.visible = bvm.visible = step >= 18; pads.visible = step >= 21; showO2(step >= 18); compress(false);
    { const c = step >= 21 ? CART_NEAR : CART_HOME; cart.position.set(c[0], 0, c[1]); }
    if (step < 12) vitals("normal", 78); else if (step === 12) vitals("af", 40); else if (step === 13) vitals("af", 40); else vitals("arrest", 0);
    if (step >= 8) {                                   // 第 11 頁：CT 病人退出機架；MRI 安妮在床上（已退出磁體）
      sp.position.x = SP_LIE.pos[0]; setLineDX(0);
      putAt(crew[0], step === 9 || step >= 12 ? CT_RAD_LIE : CT_RAD_CON); putAt(crew[1], step >= 19 ? N_ARRIVE : step >= 9 ? CT_NURSE_IV : CT_NURSE_CON);
    }
    if (step >= 13) annieBack();
    putAt(crew[2], step >= 18 ? R_HEAD : step >= 16 ? R_PHONE : step >= 13 ? R_HEAD : step === 12 ? M_A_SIDE : step === 8 ? M_A_SIDE : step >= 4 ? M_A_CON2 : step >= 2 ? M_A_CON : M_A);
    putAt(crew[3], step >= 13 ? R_CPR : step >= 8 ? M_B_SIDE : step >= 4 ? M_B_CON2 : step >= 3 ? M_B_MANUAL : step >= 1 ? M_B_SWEPT : M_B);
    if (step >= 17) compress(true);
    // 第 14 頁：兒子起身 → 衝出 CT 室 → 在等候區大鬧 → 被帶到旁邊；CT 放射師一路跟著安撫
    if (step >= 22) {
      standSP(); lineDraw(0);
      putAt(sp, step >= 25 ? SON_ASIDE : step === 24 ? SON_RIOT : step === 23 ? [...SON_OUT.at(-1), [306, 330]] : CT_SP);
      putAt(crew[0], step >= 25 ? RAD_ASIDE : step === 24 ? RAD_CALM : step === 23 ? [...RAD_OUT_END, [306, 300]] : CT_RAD);
      if (step === 24) sonShake = gsap.to(sp.rotation, { z: 0.1, duration: 0.16, repeat: -1, yoyo: true, ease: "sine.inOut" });
    }
    team999.forEach((m, i) => { m.visible = step >= 25; putAt(m, T999[i]); });
    if (step >= 26) face(crew[1], T999[0][0], T999[0][1]);
    // 姿勢：走路時會自動換成走路動作，停下來才擺出這些姿勢
    for (const m of [...crew, sp, ...team999]) setPose(m, "stand");
    if (step >= 2 && step < 22) setPose(sp, "lie");                       // 兒子躺在 CT 床上
    if (step === 1 || step === 2) { setPose(crew[3], "wand"); gsap.killTweensOf(wandSweep); wandSweep.a = 0; }   // 瑞益拿探測棒
    if (step >= 9 && step <= 11) setPose(crew[2], "phone");              // MRI：聯絡臨床醫師
    if (step === 10) setPose(crew[0], "phone");                          // CT：跟臨床交班
    if (step === 11 || step === 26) setPose(crew[1], "teach");           // 曉鏵衛教／跟醫師交班
    if (step === 16) setPose(crew[2], "phone");                          // 云玎撥 999
    if (step >= 17 && step <= 31) setPose(crew[3], "cpr");               // 瑞益壓胸
    if (step >= 18 && step <= 31) setPose(crew[2], "bvm");               // 云玎擠 BVM
    if (step === 22 || step === 24) setPose(crew[0], "calm");            // 鼎晨安撫兒子
    if (step === 22 || step === 24) setPose(sp, "angry");                // 兒子激動、大鬧
    wandHand.visible = step === 1 || step === 2; standWand.visible = !wandHand.visible;
    ivMark.visible = step >= 2;
    mriScreen.material.map = step >= 2 && step <= 3 ? pacsTex : homeTex;
    B.idSP.visible = B.idAnne.visible = step === 0;
    over(B.idSP, sp, 26); B.idAnne.position.set(319, 18, 330);
    if (step === 1) { B.explain.visible = true; over(B.explain, crew[0]); B.detect.visible = true; over(B.detect, crew[3]); }
    if (step === 2) { B.line.visible = true; B.line.position.set(402, 24, 232); B.pacs.visible = true; over(B.pacs, crew[2]); }
    if (step === 3) { B.teach.visible = true; over(B.teach, crew[0]); B.manual.visible = true; over(B.manual, crew[3]); checkRings.forEach((r) => { r.visible = true; }); }
    if (step <= 3) trapsOnAnnie(); else trapsOnDesk();
    checkRings.forEach((r, i) => r.material.color.set(step === 3 && TRAP_RINGS.includes(i) ? 0xef4444 : 0xf97316));
    if (step === 3) { const n = annie.localToWorld(new THREE.Vector3(-30, 6, 0)), w = annie.localToWorld(new THREE.Vector3(4, 7.5, 5.4));
      B.trapPatch.visible = B.trapWarmer.visible = true; B.trapPatch.position.set(n.x - 5, 18, n.z - 2); B.trapWarmer.position.set(w.x + 9, 18, w.z + 2); }
    if (step === 8) { B.stopCT.visible = true; over(B.stopCT, crew[0]); B.lookMRI.visible = true; B.lookMRI.position.set(400, 18, 335); }
    if (step === 9) { B.swell.visible = true; B.swell.position.set(400, 24, 230); }
    if (step === 10) { B.callCT.visible = true; over(B.callCT, crew[0]); }
    if (step === 11) { B.teachIV.visible = true; over(B.teachIV, crew[1], 27); }
    if (step >= 9 && step <= 11) { B.callMRI.visible = true; B.callMRI.position.set(366, 30, 336); }
    if (step >= 12 && step < 22) { B.argue.visible = true; B.argue.position.set(384, 24, 240); }
    const A = (b, x, y, z) => { b.visible = true; b.position.set(x, y, z); };
    if (step === 12) A(B.af, 372, 30, 349);
    if (step === 13) A(B.out, 319, 20, 330);
    if (step === 14) A(B.arrest, 296, 30, 330);
    if (step === 15) A(B.call1, 319, 20, 330);
    if (step === 16) A(B.call999, 357, 26, 335);
    if (step === 17) A(B.cpr, 315, 22, 337);
    if (step === 18) A(B.bvm, 304, 22, 330);
    if (step === 20) A(B.handoff, 328, 24, 342);
    if (step === 21) A(B.pads, 334, 22, 332);
    if (step >= 22 && step <= 25) A(B.leader, crew[1].position.x, 25, crew[1].position.z);
    if (step === 22) { A(B.sonUpset, 380, 36, 248); A(B.calmCT, 378, 26, 256); }
    if (step === 23) A(B.runOut, 370, 30, 246);
    if (step === 24) { A(B.riot, sp.position.x, 25, sp.position.z); A(B.calmW, crew[0].position.x, 35, crew[0].position.z); }
    if (step === 25) A(B.team999, T999[0][0], 37, T999[0][1]);
    if (step === 26) A(B.handoff999, 332, 26, 340);
    // 第 15 頁：領導者標記（壓胸的放射師 → 護理師）、最後交班給醫師；高品質急救亮起壓胸、BVM、貼片
    { const L = step === 28 ? crew[3] : step === 29 || step === 30 ? crew[1] : null;
      leadRing.visible = !!L; gsap.killTweensOf([leadRing.position, B.crown.position]);
      if (L) { A(B.crown, L.position.x, 26, L.position.z); leadRing.position.set(L.position.x, 0.6, L.position.z); } }
    if (step === 30) A(B.endHand, (crew[1].position.x + T999[0][0]) / 2, 40, (crew[1].position.z + T999[0][1]) / 2);
    if (step === 31) { A(B.qCpr, 315, 25, 340); A(B.qBvm, 300, 31, 330); A(B.qPads, 334, 24, 330); }
    if (!animate) return;
    // 動畫：從上一步的位置走到這一步
    const tl = dualTl = gsap.timeline();
    const pop = (spr, t) => { spr.scale.multiplyScalar(1); tl.fromTo(spr.material, { opacity: 0 }, { opacity: 1, duration: 0.4 }, t); };
    if (step === 0) { pop(B.idSP, 0.4); pop(B.idAnne, 0.7); }
    if (step === 1) {
      pop(B.explain, 0.3);
      // 放射師拿起探測棒，從安妮頭部掃到腳
      putAt(crew[3], M_B); wandHand.visible = false; standWand.visible = true; B.detect.visible = false;
      walk(tl, crew[3], [325, 320], [[338, 352]], 0.2, [338, 370]);
      tl.call(() => { standWand.visible = false; wandHand.visible = true; }, null, ">+0.2");
      walk(tl, crew[3], [338, 352], [[338, 322], [309, 322]], tl.duration() + 0.3, [309, 340]);
      tl.call(() => { B.detect.visible = true; }, null, ">");
      tl.to(crew[3].position, { x: 331, duration: 3.2, ease: "sine.inOut", onUpdate: () => over(B.detect, crew[3]) }, ">");
      tl.fromTo(wandSweep, { a: -0.35 }, { a: 0.35, duration: 0.4, repeat: 7, yoyo: true, ease: "sine.inOut" }, "<");
    }
    if (step === 2) {
      // CT：病人先躺上 CT 床 → 護理師到工作台拿針具、回來打上針頭 → 接上對比劑管路
      standSP(); putAt(sp, CT_SP); putAt(crew[0], CT_RAD); putAt(crew[1], CT_NURSE);
      ivMark.visible = false; lineDraw(0); B.line.visible = false;
      const lie = { k: 0 }, p0 = sp.position.clone();
      tl.to(lie, { k: 1, duration: 1.6, ease: "power2.inOut", onUpdate: () => {
        sp.position.lerpVectors(p0, new THREE.Vector3(...SP_LIE.pos), lie.k);
        sp.rotation.set(SP_LIE.rot[0] * lie.k, sp.rotation.y * (1 - lie.k), SP_LIE.rot[2] * lie.k);
      } }, 0.2);
      walk(tl, crew[0], [386, 255], [[402, 251]], 0.4, [402, 238]);
      walk(tl, crew[1], [375, 247], [[340, 222], [328, 218]], 0, [324, 212]);
      const back = tl.duration() + 0.6;
      walk(tl, crew[1], [328, 218], [[370, 226], [401, 227.5]], back, [401, 238]);
      tl.call(() => { ivMark.visible = true; B.iv.visible = true; B.iv.position.set(402, 24, 232); }, null, ">+0.3");
      const ln = { v: 0 };
      tl.to(ln, { v: 1, duration: 1.8, ease: "power1.inOut", onUpdate: () => lineDraw(ln.v) }, ">+0.8");
      tl.call(() => { B.iv.visible = false; B.line.visible = true; B.line.position.set(402, 24, 232); }, null, ">");
      // MRI：另一位放射師到 MRI 控制台，螢幕切到 PACS 看胸部 X 光
      putAt(crew[2], M_A); mriScreen.material.map = homeTex; B.pacs.visible = false;
      walk(tl, crew[2], [313, 320], [[340, 318], [340, 356], [357, 356], [357, 335]], 0.3, [380, 335]);
      tl.call(() => { mriScreen.material.map = pacsTex; B.pacs.visible = true; over(B.pacs, crew[2]); }, null, 0.3 + 4.2);
    }
    if (step === 4) {
      // CT：放射師、護理師回到控制台 → 檢查床把病人送進機架
      putAt(crew[0], CT_RAD_LIE); putAt(crew[1], CT_NURSE_IV); lieSP(); setLineDX(0);
      walk(tl, crew[0], [402, 251], [[372, 252], [349, 251], [347, 226]], 0, [360, 226]);
      walk(tl, crew[1], [401, 227.5], [[372, 247], [350, 248], [347, 237]], 0.3, [360, 237]);
      const sIn = { x: 0 };
      tl.to(sIn, { x: SP_IN_DX, duration: 1.8, ease: "power1.inOut", onUpdate: () => { sp.position.x = SP_LIE.pos[0] + sIn.x; setLineDX(Math.round(sIn.x * 4) / 4); } }, 3.2);
      // MRI：2 位放射師把安妮連推床推進 MRI 室 → 過床到 MRI 床 → 回控制台
      annieHome();
      tl.to(waitMon.position, { x: STR_HOME[0] + MON_DX, z: STR_HOME[1], duration: 1.4, ease: "power1.inOut" }, 2.6);   // 先把監視器推到推床旁
      putAt(crew[2], M_A_CON); putAt(crew[3], M_B_MANUAL);
      walk(tl, crew[3], [316, 323], [[303, 324], [303, 330]], 0, [319, 330]);
      walk(tl, crew[2], [357, 335], [[357, 357], [340, 357], [336, 340], [335, 330]], 0, [319, 330]);
      const t0 = 4.2, push = { t: 0 };
      const segs = []; let tot = 0;
      for (let i = 1; i < STR_PATH.length; i++) { const d = Math.hypot(STR_PATH[i][0] - STR_PATH[i - 1][0], STR_PATH[i][1] - STR_PATH[i - 1][1]); segs.push(d); tot += d; }
      const at = (t) => { let d = t * tot; for (let i = 0; i < segs.length; i++) { if (d <= segs[i] || i === segs.length - 1) { const a = STR_PATH[i], b = STR_PATH[i + 1], k = Math.min(1, d / segs[i]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; } d -= segs[i]; } };
      tl.to(push, { t: 1, duration: 6, ease: "power1.inOut", onUpdate: () => {
        const [x, z] = at(push.t); stretcher.position.set(x, 0, z);
        crew[3].position.set(x - 16, 0, z); crew[2].position.set(x + 17, 0, z); face(crew[3], x, z); face(crew[2], x, z);
        waitMon.position.set(x + MON_DX, 0, z);
      } }, t0);
      tl.call(() => { scene.attach(annie); }, null, t0 + 6.3);
      const tr = { k: 0 }; let from = null;
      tl.to(tr, { k: 1, duration: 1.6, ease: "power2.inOut", onUpdate: () => {
        if (annie.parent !== scene) scene.attach(annie);
        from ||= { p: annie.position.clone(), ry: annie.rotation.y };
        annie.position.set(from.p.x + (ANNIE_TABLE[0] - from.p.x) * tr.k, from.p.y + (ANNIE_TABLE[1] - from.p.y) * tr.k + Math.sin(Math.PI * tr.k) * 3, from.p.z + (ANNIE_TABLE[2] - from.p.z) * tr.k);
        annie.rotation.y = from.ry + (Math.PI - from.ry) * tr.k;
      } }, t0 + 6.4);
      walk(tl, crew[2], [STR_PARK[0] + 17, STR_PARK[1]], [[392, 362], [357, 362], [357, 330]], t0 + 8.3, [380, 330]);
      walk(tl, crew[3], [STR_PARK[0] - 16, STR_PARK[1]], [[379, 360], [357, 360], [357, 342]], t0 + 8.3, [380, 342]);
    }
    if (step === 5) {                                     // MRI：送進磁體開始掃描
      annieOnTable(ANNIE_TABLE[0]);
      tl.to(annie.position, { x: ANNIE_BORE, duration: 2.4, ease: "power1.inOut" }, 0.2);
    }
    if (step === 6) {                                     // MRI：病人躁動
      annieOnTable(ANNIE_BORE);
      annieJitter = gsap.to(annie.rotation, { x: 0.06, z: 0.05, duration: 0.18, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.4 });
    }
    if (step === 7) {                                     // MRI：立即停止掃描，檢查床退出磁體
      annieOnTable(ANNIE_BORE);
      tl.to(annie.position, { x: ANNIE_TABLE[0], duration: 2.2, ease: "power1.inOut" }, 0.6);
    }
    if (step === 8) {                                    // CT 停止檢查；MRI 放射師進去看病人
      pop(B.stopCT, 0.3);
      putAt(crew[2], M_A_CON2); putAt(crew[3], M_B_CON2); B.lookMRI.visible = false;
      walk(tl, crew[2], [357, 330], [[357, 358], [390, 358], [405, 344]], 0.2, [405, 330]);
      walk(tl, crew[3], [357, 342], [[357, 318], [390, 318], [395, 326]], 0.2, [395, 340]);
      tl.call(() => { B.lookMRI.visible = true; }, null, ">");
    }
    if (step === 9) {                                    // CT：病人退出機架，進去詢問 → 手部腫痛，確認 IV Loss；MRI：回控制台聯絡臨床醫師
      sp.position.x = SP_LIE.pos[0] + SP_IN_DX; setLineDX(SP_IN_DX); swell.visible = false; B.swell.visible = false;
      putAt(crew[0], CT_RAD_CON); putAt(crew[1], CT_NURSE_CON);
      const sOut = { x: SP_IN_DX };
      tl.to(sOut, { x: 0, duration: 1.8, ease: "power1.inOut", onUpdate: () => { sp.position.x = SP_LIE.pos[0] + sOut.x; setLineDX(Math.round(sOut.x * 4) / 4); } }, 0.2);
      walk(tl, crew[0], [347, 226], [[349, 251], [372, 252], [402, 251]], 0.4, [402, 238]);
      walk(tl, crew[1], [347, 237], [[345, 216], [380, 222], [401, 227.5]], 0.4, [401, 238]);
      tl.call(() => { swell.visible = true; B.swell.visible = true; B.swell.position.set(400, 24, 230); }, null, ">+0.3");
      putAt(crew[2], M_A_SIDE); B.callMRI.visible = false;
      walk(tl, crew[2], [405, 344], [[390, 358], [357, 358], [357, 330]], 0.3, [380, 330]);
      tl.call(() => { B.callMRI.visible = true; B.callMRI.position.set(366, 30, 336); }, null, 0.3 + 3.6);
    }
    if (step === 10) {                                   // CT：放射師回控制台打電話跟臨床交班
      putAt(crew[0], CT_RAD_LIE); B.callCT.visible = false;
      walk(tl, crew[0], [402, 251], [[372, 252], [349, 251], [347, 226]], 0.2, [360, 226]);
      tl.call(() => { B.callCT.visible = true; over(B.callCT, crew[0]); }, null, ">");
    }
    if (step === 11) pop(B.teachIV, 0.3);                // CT：護理師跟病人衛教 IV Loss 的處置
    if (step === 12) {                                   // MRI：監視器 AF、心跳 78 → 40；CT：標準病人跟放射師爭執
      vitals("af", 78, 40); pop(B.af, 0.3); pop(B.argue, 0.5);
      putAt(crew[0], CT_RAD_CON); walk(tl, crew[0], [347, 226], [[349, 251], [372, 252], [402, 251]], 0.2, [402, 238]);
      putAt(crew[2], M_A_CON2); walk(tl, crew[2], [357, 330], [[357, 358], [390, 358], [405, 344]], 0.4, [405, 330]);
    }
    if (step === 13) {                                   // MRI：意識改變 → 過床回推床、連同監視器推回等候區
      vitals("af", 40); annieOnTable(ANNIE_TABLE[0]); putAt(crew[2], M_A_SIDE); putAt(crew[3], M_B_SIDE); B.out.visible = false;
      const o = stretcher.children[0], dest = o.localToWorld(new THREE.Vector3(2, 28, 0));
      const tr = { k: 0 }; let from = null;
      tl.to(tr, { k: 1, duration: 1.6, ease: "power2.inOut", onUpdate: () => {
        from ||= { p: annie.position.clone(), ry: annie.rotation.y };
        annie.position.set(from.p.x + (dest.x - from.p.x) * tr.k, from.p.y + (dest.y - from.p.y) * tr.k + Math.sin(Math.PI * tr.k) * 3, from.p.z + (dest.z - from.p.z) * tr.k);
        annie.rotation.y = from.ry * (1 - tr.k);
      }, onComplete: () => { o.attach(annie); annie.position.set(2, 28, 0); annie.rotation.set(0, 0, 0); annie.scale.setScalar(1); } }, 0.3);
      const BACK = [[395, 349], [392, 356], [319, 356], [319, 330]], segs = []; let tot = 0;
      for (let i = 1; i < BACK.length; i++) { const dd = Math.hypot(BACK[i][0] - BACK[i - 1][0], BACK[i][1] - BACK[i - 1][1]); segs.push(dd); tot += dd; }
      const at = (t) => { let dd = t * tot; for (let i = 0; i < segs.length; i++) { if (dd <= segs[i] || i === segs.length - 1) { const a = BACK[i], b = BACK[i + 1], k = Math.min(1, dd / segs[i]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; } dd -= segs[i]; } };
      walk(tl, crew[3], [395, 326], [[380, 326], [379, 349]], 0.3, [395, 349]);
      walk(tl, crew[2], [405, 344], [[411, 349]], 0.3, [395, 349]);
      const push = { t: 0 };
      tl.to(push, { t: 1, duration: 6, ease: "power1.inOut", onUpdate: () => {
        const [x, z] = at(push.t); stretcher.position.set(x, 0, z); waitMon.position.set(x + MON_DX, 0, z);
        crew[3].position.set(x - 16, 0, z); crew[2].position.set(x + 17, 0, z); face(crew[3], x - 30, z); face(crew[2], x, z);
      } }, 2.3);
      walk(tl, crew[3], [303, 330], [[303, 337], [315, 337]], 8.5, [315, 330]);
      walk(tl, crew[2], [336, 330], [[336, 322], [300, 322], [300, 330]], 8.5, [319, 330]);
      tl.call(() => { B.out.visible = true; B.out.position.set(319, 20, 330); }, null, 8.4);
    }
    if (step === 14) { vitals("arrest", 0); pop(B.arrest, 0.2); }
    if (step === 15) {                                   // 叫：拍肩叫喚病人
      pop(B.call1, 0.2);
      tl.to(crew[3].rotation, { z: 0.18, duration: 0.25, repeat: 5, yoyo: true, ease: "sine.inOut" }, 0.3);
    }
    if (step === 16) {                                   // 叫：另一位放射師到 MRI 控制台用手機撥 999
      putAt(crew[2], R_HEAD); B.call999.visible = false;
      walk(tl, crew[2], [300, 330], [[300, 322], [340, 322], [340, 356], [357, 356], [357, 335]], 0.2, [380, 335]);
      tl.call(() => { B.call999.visible = true; B.call999.position.set(357, 26, 335); }, null, ">");
    }
    if (step === 17) { compress(true); pop(B.cpr, 0.2); }
    if (step === 18) {                                   // 撥完 999 → 拿背板、BVM，接上氧氣開到最大
      putAt(crew[2], R_PHONE); board.visible = bvm.visible = false; showO2(false); B.bvm.visible = false;
      walk(tl, crew[2], [357, 335], [[357, 356], [340, 356], [312, 356]], 0.2, [312, 364]);           // 急救車拿背板、BVM
      walk(tl, crew[2], [312, 356], [[318, 356]], tl.duration() + 0.6, [318, 365]);                   // 氧氣鋼瓶：接上、開到最大
      walk(tl, crew[2], [318, 356], [[300, 345], [300, 330]], tl.duration() + 0.6, [319, 330]);
      tl.call(() => { board.visible = bvm.visible = true; showO2(true); B.bvm.visible = true; B.bvm.position.set(304, 22, 330); }, null, ">+0.2");
    }
    if (step === 19) {                                   // 999 啟動、全院廣播 → 護理師從 CT 室過來支援
      putAt(crew[1], CT_NURSE_IV);
      walk(tl, crew[1], [401, 227.5], [[380, 222], [340, 246], [306, 250], [306, 290], [310, 315], [328, 342]], 1.2, [319, 330]);
    }
    if (step === 20) pop(B.handoff, 0.2);
    if (step === 21) {                                   // D：急救車推過來，貼上貼片判讀（沒有電擊）
      cart.position.set(CART_HOME[0], 0, CART_HOME[1]); pads.visible = false; B.pads.visible = false;
      tl.to(cart.position, { x: CART_NEAR[0], z: CART_NEAR[1], duration: 1.6, ease: "power1.inOut" }, 0.2);
      tl.call(() => { pads.visible = true; B.pads.visible = true; B.pads.position.set(334, 22, 332); }, null, 2.2);
    }
    if (step === 22) {                                   // CT：兒子從 CT 床起身、情緒激動；CT 放射師走過來先安撫
      lieSP(); putAt(crew[0], CT_RAD_LIE); B.sonUpset.visible = B.calmCT.visible = false;
      const up = { k: 1 }, pS = new THREE.Vector3(CT_SP[0], 0, CT_SP[1]), pL = new THREE.Vector3(...SP_LIE.pos);
      const yaw = Math.atan2(-(CT_SP[2][1] - CT_SP[1]), CT_SP[2][0] - CT_SP[0]);
      tl.to(up, { k: 0, duration: 1.4, ease: "power2.inOut", onUpdate: () => { sp.position.lerpVectors(pS, pL, up.k); sp.rotation.set(SP_LIE.rot[0] * up.k, yaw * (1 - up.k), SP_LIE.rot[2] * up.k); } }, 0.3);
      tl.call(() => { B.sonUpset.visible = true; }, null, 1.8);
      tl.to(sp.rotation, { z: 0.08, duration: 0.18, repeat: 5, yoyo: true, ease: "sine.inOut" }, 1.8);
      walk(tl, crew[0], [402, 251], [[386, 255]], 2.2, [398, 249]);
      tl.call(() => { B.calmCT.visible = true; }, null, ">+0.2");
    }
    if (step === 23) {                                   // CT：兒子衝出 CT 室，CT 放射師追出去
      putAt(sp, CT_SP); putAt(crew[0], CT_RAD); B.runOut.visible = false;
      walk(tl, sp, [CT_SP[0], CT_SP[1]], SON_OUT, 0.2, [306, 330], 40);
      walk(tl, crew[0], [CT_RAD[0], CT_RAD[1]], [[380, 240], [340, 246], [306, 250], RAD_OUT_END], 0.9, [306, 300], 34);
      tl.call(() => { B.runOut.visible = true; }, null, 1.2);
    }
    if (step === 24) {                                   // 等候區：兒子衝進來大鬧；CT 放射師追過來安撫
      B.riot.visible = B.calmW.visible = false;
      walk(tl, sp, SON_OUT.at(-1), [[312, 312], SON_RIOT.slice(0, 2)], 0.2, SON_RIOT[2], 40);
      walk(tl, crew[0], RAD_OUT_END, [[306, 292], [316, 306], RAD_CALM.slice(0, 2)], 0.6, RAD_CALM[2], 34);
      const tEnd = tl.duration();
      tl.call(() => { B.riot.visible = true; over(B.riot, sp, 25); }, null, tEnd - 1);
      tl.call(() => { B.calmW.visible = true; over(B.calmW, crew[0], 35); }, null, tEnd + 0.2);
    }
    if (step === 25) {                                   // 999 急救團隊從走廊進來；CT 放射師把兒子帶到旁邊
      B.team999.visible = false;
      putAt(sp, SON_RIOT); putAt(crew[0], RAD_CALM);
      walk(tl, crew[0], RAD_CALM.slice(0, 2), [RAD_ASIDE.slice(0, 2)], 0.3, RAD_ASIDE[2]);
      walk(tl, sp, SON_RIOT.slice(0, 2), [SON_ASIDE.slice(0, 2)], 0.6, SON_ASIDE[2]);
      team999.forEach((m, i) => walk(tl, m, [306, 250 - i * 9], [...T999_IN, T999[i].slice(0, 2)], 0.4 + i * 0.6, T999[i][2], 28));
      tl.call(() => { B.team999.visible = true; over(B.team999, team999[0], 37); }, null, tl.duration());
    }
    if (step === 26) {                                   // 護理師（領導者）轉向醫師交班
      face(crew[1], 319, 330);
      tl.call(() => face(crew[1], T999[0][0], T999[0][1]), null, 0.2);
      pop(B.handoff999, 0.4);
    }
    if (step === 28) pop(B.crown, 0.4);
    if (step === 29) {                                   // 領導者標記從壓胸的放射師移到護理師
      const n = crew[1].position;
      tl.fromTo([B.crown.position, leadRing.position], { x: crew[3].position.x, z: crew[3].position.z }, { x: n.x, z: n.z, duration: 1.4, ease: "power2.inOut" }, 0.3);
      tl.to(B.crown.position, { y: 32, duration: 0.7, yoyo: true, repeat: 1, ease: "sine.out" }, 0.3);
    }
    if (step === 30) pop(B.endHand, 0.4);
    if (step === 31) { pop(B.qCpr, 0.3); pop(B.qBvm, 0.7); pop(B.qPads, 1.1); }
    if (step === 3) {
      pop(B.teach, 0.3);
      putAt(crew[3], M_B_SWEPT); B.manual.visible = false; checkRings.forEach((r) => { r.visible = false; });
      walk(tl, crew[3], [331, 322], [[316, 323]], 0.2, [316, 340]);
      tl.call(() => { B.manual.visible = true; over(B.manual, crew[3]); }, null, ">");
      B.trapPatch.visible = B.trapWarmer.visible = false;
      checkRings.forEach((r, i) => tl.call(() => { r.visible = true; }, null, `>+${i ? 0.35 : 0.1}`));
      tl.call(() => { B.trapPatch.visible = true; }, null, ">+0.4"); tl.fromTo(B.trapPatch.material, { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<");
      tl.call(() => { B.trapWarmer.visible = true; }, null, ">+0.5"); tl.fromTo(B.trapWarmer.material, { opacity: 0 }, { opacity: 1, duration: 0.4 }, "<");
    }
  }

  // 大螢幕內容：null＝考場即時畫面；數字＝考官說明投影片第幾張
  function setScreen(i, animate = true) {
    examiner.visible = i != null;
    clearOverlay();
    if (i == null) { brief.stopVideo(); if (scrMat.map !== liveRT.texture) { scrMat.map = liveRT.texture; scrMat.toneMapped = true; scrMat.needsUpdate = true; } return; }
    brief.show(i, animate);
    if (scrMat.map !== brief.texture) { scrMat.map = brief.texture; scrMat.toneMapped = false; scrMat.needsUpdate = true; }   // 投影片保持原色
  }

  // ---------- 繪製 ----------
  // 效能模式（舊電腦）：關掉陰影、解析度降為 1 倍
  let lite = false;
  function setLite(on) {
    lite = !!on;
    sun.castShadow = !lite;
    renderer.setPixelRatio(lite ? 1 : Math.min(devicePixelRatio, 2));
    resize();
  }
  function resize() { renderer.setSize(view.w, view.h, false); camera.aspect = view.w / view.h; camera.updateProjectionMatrix(); }
  resize(); addEventListener("resize", resize);
  let t0 = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - t0) / 1000);
    chev.offset.x -= dt * 0.9; t0 = now;
    updatePeople(dt, now / 1000);
    if (bvm.visible) {                                   // BVM：每 6 秒擠球 2 下（配合 30：2），擠的時候球變扁
      const c = (now / 1000) % 6, k = (u) => (u > 0 && u < 0.7 ? Math.sin((u / 0.7) * Math.PI) : 0), q = Math.max(k(c), k(c - 1.1));
      bvm.userData.bag.scale.set(2.1 + q * 0.15, 1 - q * 0.38, 1 - q * 0.25);
    }
    updateWand();
    animateDevices(now);
    brief.update();
    if (dualOn) updateCables();
    if (liveOn) { renderer.setRenderTarget(liveRT); renderer.render(scene, liveCam); renderer.setRenderTarget(null); }
  }

  const wallMat = mat(WC), wallDark = new THREE.Color(WC), wallLight = new THREE.Color(0xd3d9e2);
  function setExamWalls(tall, dur = 1.4) {
    // 第一人稱：牆變亮、變高；儀器標籤縮小並會被牆擋住（不再穿牆顯示）
    const c = { t: tall ? 0 : 1 };
    gsap.to(c, { t: tall ? 1 : 0, duration: dur, onUpdate: () => wallMat.color.copy(wallDark).lerp(wallLight, c.t) });
    for (const sp of layers.eq || []) {
      sp.userData.s0 ||= sp.scale.clone();
      // 第一人稱：標籤固定螢幕大小（不因距離忽大忽小），被牆擋住就看不到
      sp.material.depthTest = tall; sp.material.sizeAttenuation = !tall; sp.material.needsUpdate = true;
      const k = tall ? 0.052 / sp.userData.s0.y : 1;
      sp.scale.set(sp.userData.s0.x * k, sp.userData.s0.y * k, 1);
    }
    for (const m of examWalls) {
      const k = tall ? 36 / m.userData.h : 1;
      gsap.to(m.scale, { y: k, duration: dur, ease: "power2.inOut" });
      gsap.to(m.position, { y: (m.userData.h * k) / 2, duration: dur, ease: "power2.inOut" });
    }
  }
  const EXAM_BOUNDS = [294, 207, 438, 368];

  return { setLite, isLite: () => lite, setDebrief, setDebriefTimer, THREE, renderer, scene, camera, setScreen, fadeToLive, setDoorScene, setDoorView, setDual, renderDual, isDual: () => dualOn || !!doorView, aimDual, dualCam, setDualSplit, BRIEF_COUNT: brief.count, setLayer, highlight, showRoute, placeFig, frame, setLive, setAudience, setExamWalls, obstacles, EXAM_BOUNDS, LIVE_POSE, FP_START, ROOMS, mapPt };
}
