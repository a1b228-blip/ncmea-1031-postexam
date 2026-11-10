// 真人比例人物（MakeHuman／MPFB 產生的 GLB，見 assets/people/）
// makePerson(id) 先回傳一個空的 Group（程式可以立刻擺位置、轉方向），模型載入後才放進去。
// 人物在 Group 裡面向本地 +x（與原本的幾何人偶相同，face() 不用改）。
// 姿勢：setPose(g, "stand"|"phone"|"cpr"|"bvm"|"calm"|"angry"|"teach"|"sit"|"lie")；g.userData.person.bow＝鞠躬程度（0～1）
// 走路：每一格偵測人物的位置有沒有移動，有移動就自動擺手、邁步，不用改原本的走路程式。
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const U = 12.5;                                   // 1 公尺 ＝ 12.5 場景單位（與原本人偶、推床、檢查床的比例相符）
const loader = new GLTFLoader();
const cache = new Map();
// 同一個人物只下載一次；onProgress 給開場載入畫面算百分比（第一次呼叫時才會收到進度）
// 下載失敗時（例如網路中斷）把快取清掉並自動重試，最多 3 次
const load1 = (id, onProgress) => {
  if (!cache.has(id)) cache.set(id, loader.loadAsync(`assets/people/${id}.glb`, onProgress).catch((e) => { cache.delete(id); throw e; }));
  return cache.get(id);
};
const load = (id, onProgress, tries = 3) => load1(id, onProgress).catch((e) => (tries > 1 ? new Promise((r) => setTimeout(r, 800)).then(() => load(id, onProgress, tries - 1)) : Promise.reject(e)));
export const loadPerson = load;
export const PEOPLE_INFO = {
  dingchen: { name: "鼎晨", h: 1.75 }, xiaohua: { name: "曉鏵", h: 1.6 }, ruiyi: { name: "瑞益", h: 1.72 }, yunding: { name: "云玎", h: 1.55 },
  son: { name: "兒子", h: 1.8 }, xiudi: { name: "秀蒂", h: 1.55 },
  examiner: { h: 1.7 }, examiner2: { h: 1.58 }, examiner3: { h: 1.74 }, examiner4: { h: 1.62 }, doctor: { h: 1.76 }, medic_m: { h: 1.73 }, medic_f: { h: 1.61 }, other_m: { h: 1.71 }, other_f: { h: 1.6 },
};
const all = [];
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// 名字標籤（白底小膠囊，固定在頭頂上方）
function nameTag(text) {
  const cv = document.createElement("canvas"), g = cv.getContext("2d"), px = 56;
  g.font = `900 ${px}px "PingFang TC","Microsoft JhengHei",sans-serif`;
  const w = Math.ceil(g.measureText(text).width + px * 0.9), h = Math.ceil(px * 1.45);
  cv.width = w; cv.height = h;
  g.fillStyle = "rgba(255,255,255,.93)"; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
  g.font = `900 ${px}px "PingFang TC","Microsoft JhengHei",sans-serif`; g.fillStyle = "#0f172a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, toneMapped: false }));
  const k = 1.5 / h; s.scale.set(w * k, h * k, 1); s.renderOrder = 25;
  return s;
}

export function makePerson(id, { label = true, tint = null } = {}) {
  const g = new THREE.Group();
  const info = PEOPLE_INFO[id] || { h: 1.7 };
  const P = { id, g, pose: "stand", bow: 0, phase: 0, move: 0, last: null, bones: null, model: null };
  g.userData.person = P;
  if (label && info.name) { const s = nameTag(info.name); s.position.y = info.h * U + 1.6; g.add(s); P.tag = s; }
  load(id).then((gltf) => {
    const m = cloneSkinned(gltf.scene);
    m.scale.setScalar(U); m.rotation.y = Math.PI / 2;        // 模型面向 +z → 轉成面向 Group 的 +x
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      if (tint && o.material?.name?.toLowerCase().includes("cloth")) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); }
    });
    g.add(m); P.model = m;
    // 骨頭：記下靜止姿勢，並算出「模型座標的轉軸」換到每根骨頭父層座標的方法
    m.updateMatrixWorld(true);
    const qRootInv = m.getWorldQuaternion(new THREE.Quaternion()).invert();
    const bones = {};
    m.traverse((o) => {
      if (!o.isBone) return;
      const qp = o.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(qRootInv).invert();   // 模型座標 → 父層座標
      bones[o.name] = { b: o, rest: o.quaternion.clone(), toParent: qp };
    });
    P.bones = bones;
  }).catch((e) => console.warn("人物載入失敗：", id, e));
  all.push(P);
  return g;
}
export const setPose = (g, pose) => { const P = g?.userData?.person; if (P) P.pose = pose; };
// 某根骨頭的世界座標（模型還沒載入時回傳 null）
export function boneWorld(g, name, out) { const B = g?.userData?.person?.bones?.[name]; return B ? B.b.getWorldPosition(out) : null; }
export const personOf = (g) => g?.userData?.person;

// 在骨頭靜止姿勢上，依序繞「模型座標」的軸轉動（rots＝[[軸, 角度], …]）
const _q = new THREE.Quaternion(), _a = new THREE.Vector3();
function rotate(P, name, rots) {
  const B = P.bones[name]; if (!B) return;
  B.b.quaternion.copy(B.rest);
  for (const [axis, ang] of rots) {
    if (!ang) continue;
    _a.copy(axis).applyQuaternion(B.toParent);
    B.b.quaternion.premultiply(_q.setFromAxisAngle(_a, ang));
  }
}
const TUNE = {}; if (typeof window !== "undefined") window.__poseTune = TUNE;
// 姿勢表：手臂往前抬＝繞 X 負角度；往外張＝左手繞 Z 正角度、右手繞 Z 負角度；手肘彎＝繞 X 負角度；彎腰＝繞 X 正角度
function arms(P, t) {
  const s = Math.sin, w = P.walkAmp;
  const swing = s(P.phase) * 0.38 * w;
  let L = { up: swing, out: 0.06, el: -0.15 }, R = { up: -swing, out: 0.06, el: -0.15 }, spine = 0;
  if (w < 0.5) {
    switch (P.pose) {
      case "phone": R = { up: -1.2, out: 0.37, tw: 0.98, el: -2.33 }; break;            // 手機貼右耳、手肘在側邊（數值用骨頭位置算出來）
      case "cpr": L = { up: -1.15, out: -0.18, el: 0 }; R = { up: -1.15, out: -0.18, el: 0 }; spine = 0.42; break;
      case "bvm": L = { up: -0.95, out: -0.05, el: -0.75 }; R = { up: -0.95, out: -0.05, el: -0.75 }; spine = 0.25; break;
      case "calm": L = { up: -0.55, out: 0.1, el: -0.55 + s(t * 3) * 0.12 }; R = { up: -0.55, out: 0.1, el: -0.55 - s(t * 3) * 0.12 }; break;
      case "teach": R = { up: -0.95 + s(t * 2.2) * 0.1, out: 0.12, tw: 0.35, el: -0.85 + s(t * 3) * 0.15 }; L = { up: -0.5, out: 0.05, tw: 0.25, el: -1.2 + s(t * 2.6) * 0.1 }; break;   // 雙手在胸前比劃說明
      case "angry": L = { up: -1.9 + s(t * 7) * 0.5, out: 0.35, el: -0.9 }; R = { up: -1.9 - s(t * 7) * 0.5, out: 0.35, el: -0.9 }; spine = 0.08; break;
      case "sit": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.45, out: 0.05, el: -1.0 }; break;
      case "score": L = { up: -0.16, out: -0.2, tw: 0.55, el: -0.6, ey: -0.42 }; R = { up: -0.3 + s(t * 1.3) * 0.03, out: -0.25, tw: 0.4, el: -0.5 + s(t * 7) * 0.05, ey: -0.07 }; break;   // 考官：左手托評分夾板（腰前）、右手寫字（數值用骨頭位置算出來）
      case "hold": L = { up: -0.16, out: -0.2, tw: 0.55, el: -0.6, ey: -0.42 }; R = { up: -0.3, out: -0.25, tw: 0.4, el: -0.5, ey: -0.07 }; break;                                     // 拿著單子看（同意書）
      case "sitTalk": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.8 + s(t * 2.6) * 0.18, out: 0.18, el: -1.15 + s(t * 3.3) * 0.25 }; spine = 0.06; break;
    }
  }
  if (P.pose === "wand") R = { up: -0.95, out: 0.08, el: -0.35 };     // 右手拿探測棒往前伸（走路時也保持）
  const tune = w < 0.5 && TUNE[P.pose];                                 // 除錯用：window.__poseTune 即時調整角度
  if (tune) { if (tune.L) L = { ...L, ...tune.L }; if (tune.R) R = { ...R, ...tune.R }; if (tune.spine != null) spine = tune.spine; }
  // tw＝上臂往身體中線轉（水平方向），ey＝前臂往內轉（手往臉靠）；沒寫就是 0
  rotate(P, "upperarm_l", [[X, L.up], [Z, L.out], [Y, -(L.tw || 0)]]); rotate(P, "upperarm_r", [[X, R.up], [Z, -R.out], [Y, R.tw || 0]]);
  rotate(P, "lowerarm_l", [[X, L.el], [Y, -(L.ey || 0)]]); rotate(P, "lowerarm_r", [[X, R.el], [Y, R.ey || 0]]);
  const bow = P.bow * 1.05;
  rotate(P, "spine_01", [[X, spine * 0.5 + bow * 0.45]]); rotate(P, "spine_02", [[X, spine * 0.5 + bow * 0.35]]); rotate(P, "neck_01", [[X, bow * 0.2]]);
}
function legs(P) {
  if (P.pose === "sit" || P.pose === "sitTalk") {
    rotate(P, "thigh_l", [[X, -1.5]]); rotate(P, "thigh_r", [[X, -1.5]]);
    rotate(P, "calf_l", [[X, 1.5]]); rotate(P, "calf_r", [[X, 1.5]]);
    return;
  }
  const w = P.walkAmp, sl = Math.sin(P.phase), sr = -sl;
  rotate(P, "thigh_l", [[X, -sl * 0.45 * w]]); rotate(P, "thigh_r", [[X, -sr * 0.45 * w]]);
  rotate(P, "calf_l", [[X, Math.max(0, -Math.cos(P.phase)) * 0.7 * w]]); rotate(P, "calf_r", [[X, Math.max(0, Math.cos(P.phase)) * 0.7 * w]]);
}
const _p = new THREE.Vector3();
// 每一格呼叫：偵測移動 → 走路相位；套用姿勢
export function updatePeople(dt, t) {
  for (const P of all) {
    if (!P.bones) continue;
    let vis = true; for (let o = P.g; o; o = o.parent) if (!o.visible) { vis = false; break; }
    if (!vis) { P.last = null; continue; }
    P.g.getWorldPosition(_p);
    const d = P.last && P.pose !== "lie" && P.pose !== "sit" && P.pose !== "sitTalk" ? Math.hypot(_p.x - P.last.x, _p.z - P.last.z) : 0;
    P.last = P.last || new THREE.Vector3(); P.last.copy(_p);
    const moving = d > 0.02 && d < 8;                           // 太大的跳動＝瞬間移位，不算走路
    P.move += ((moving ? 1 : 0) - P.move) * Math.min(1, dt * 8);
    P.walkAmp = P.move;
    if (moving) P.phase += d * 0.42;
    else P.phase += (Math.round(P.phase / Math.PI) * Math.PI - P.phase) * Math.min(1, dt * 6);   // 停下來時把腳收回
    arms(P, t); legs(P);
    if (P.tag) placeTag(P);
    phoneProp(P);
    sheetProp(P);
  }
}
// 打電話：右手拿一支手機（掛在手掌骨頭上，單位＝公尺）
const PHONE = { size: [0.075, 0.15, 0.012], at: [0, 0.09, 0.03], rot: [0, 0, 0] };
if (typeof window !== "undefined") window.__phone = PHONE;   // 除錯用：即時調整位置
let phoneGeo = null, phoneMat = null, screenMat = null;
function phoneProp(P) {
  const on = P.pose === "phone" && P.walkAmp < 0.5;
  if (!on && !P.phone) return;
  if (!P.phone) {
    const hand = P.bones.hand_r?.b; if (!hand) return;
    phoneGeo ||= new THREE.BoxGeometry(1, 1, 1);
    phoneMat ||= new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.4 });
    screenMat ||= new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const ph = new THREE.Group(), body = new THREE.Mesh(phoneGeo, phoneMat), scr = new THREE.Mesh(phoneGeo, screenMat);
    scr.scale.set(0.85, 0.85, 0.2); scr.position.z = 0.55; body.add(scr);
    body.castShadow = true; ph.add(body); ph.userData.body = body; hand.add(ph); P.phone = ph;
  }
  P.phone.visible = on;
  if (on) { const b = P.phone.userData.body; b.scale.set(...PHONE.size); P.phone.position.set(...PHONE.at); P.phone.rotation.set(...PHONE.rot); }
}
// 考官的評分夾板（score）／考生手上的單子（hold）：掛在左手掌骨頭上（單位＝公尺）
const SHEET = { at: [0.02, 0.1, 0.06], rot: [0.6, -0.3, 0.3], board: [0.24, 0.32, 0.012], paper: [0.21, 0.29, 0.004] };
if (typeof window !== "undefined") window.__sheet = SHEET;
let boardMat = null, paperMat = null;
function sheetProp(P) {
  const kind = P.walkAmp < 0.5 ? (P.pose === "score" ? "board" : P.pose === "hold" ? "paper" : null) : (P.pose === "score" ? "board" : null);   // 走路時考官仍拿著夾板
  if (!kind && !P.sheet) return;
  if (!P.sheet) {
    const hand = P.bones.hand_l?.b; if (!hand) return;
    phoneGeo ||= new THREE.BoxGeometry(1, 1, 1);
    boardMat ||= new THREE.MeshStandardMaterial({ color: 0x8b5e34, roughness: 0.6 });
    paperMat ||= new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const g = new THREE.Group(), board = new THREE.Mesh(phoneGeo, boardMat), paper = new THREE.Mesh(phoneGeo, paperMat);
    board.castShadow = paper.castShadow = true; g.add(board, paper); g.userData = { board, paper }; hand.add(g); P.sheet = g;
  }
  const g = P.sheet; g.visible = !!kind; if (!kind) return;
  g.position.set(...SHEET.at); g.rotation.set(...SHEET.rot);
  g.userData.board.visible = kind === "board"; g.userData.board.scale.set(...SHEET.board);
  g.userData.paper.scale.set(...SHEET.paper); g.userData.paper.position.z = kind === "board" ? 0.009 : 0;
}
// 名字標籤跟著頭走：坐著、躺著、鞠躬時都停在頭頂正上方固定距離（原本固定用站姿身高，坐下時會浮太高）
const _h = new THREE.Vector3(), _s = new THREE.Vector3();
function placeTag(P) {
  const head = P.bones.head; if (!head) return;
  head.b.getWorldPosition(_h);                         // 會一路更新到人物 Group 的世界矩陣（不用整棵樹重算）
  P.g.getWorldScale(_s);
  _h.y += 2.9 * _s.y;                                  // 頭骨在頭的下半部 → 往上約 23 公分到頭頂上方
  P.tag.position.copy(P.g.worldToLocal(_h));
}
