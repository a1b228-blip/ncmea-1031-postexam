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
const load = (id) => { if (!cache.has(id)) cache.set(id, loader.loadAsync(`assets/people/${id}.glb`)); return cache.get(id); };
export const PEOPLE_INFO = {
  dingchen: { name: "鼎晨", h: 1.75 }, xiaohua: { name: "曉鏵", h: 1.6 }, ruiyi: { name: "瑞益", h: 1.72 }, yunding: { name: "云玎", h: 1.55 },
  son: { name: "兒子", h: 1.8 }, xiudi: { name: "秀蒂", h: 1.55 },
  examiner: { h: 1.7 }, examiner2: { h: 1.58 }, examiner3: { h: 1.74 }, examiner4: { h: 1.62 }, doctor: { h: 1.76 }, medic_m: { h: 1.73 }, medic_f: { h: 1.61 }, other_m: { h: 1.71 }, other_f: { h: 1.6 },
};
const all = [];
const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

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
  });
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
// 姿勢表：手臂往前抬＝繞 X 負角度；往外張＝左手繞 Z 正角度、右手繞 Z 負角度；手肘彎＝繞 X 負角度；彎腰＝繞 X 正角度
function arms(P, t) {
  const s = Math.sin, w = P.walkAmp;
  const swing = s(P.phase) * 0.38 * w;
  let L = { up: swing, out: 0.06, el: -0.15 }, R = { up: -swing, out: 0.06, el: -0.15 }, spine = 0;
  if (w < 0.5) {
    switch (P.pose) {
      case "phone": R = { up: -0.35, out: 0.25, el: -2.35 }; break;
      case "cpr": L = { up: -1.15, out: -0.18, el: 0 }; R = { up: -1.15, out: -0.18, el: 0 }; spine = 0.42; break;
      case "bvm": L = { up: -0.95, out: -0.05, el: -0.75 }; R = { up: -0.95, out: -0.05, el: -0.75 }; spine = 0.25; break;
      case "calm": L = { up: -0.55, out: 0.1, el: -0.55 + s(t * 3) * 0.12 }; R = { up: -0.55, out: 0.1, el: -0.55 - s(t * 3) * 0.12 }; break;
      case "teach": R = { up: -0.55 + s(t * 2.2) * 0.12, out: 0.15, el: -1.0 }; break;
      case "angry": L = { up: -1.9 + s(t * 7) * 0.5, out: 0.35, el: -0.9 }; R = { up: -1.9 - s(t * 7) * 0.5, out: 0.35, el: -0.9 }; spine = 0.08; break;
      case "sit": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.45, out: 0.05, el: -1.0 }; break;
      case "sitTalk": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.8 + s(t * 2.6) * 0.18, out: 0.18, el: -1.15 + s(t * 3.3) * 0.25 }; spine = 0.06; break;
    }
  }
  if (P.pose === "wand") R = { up: -0.95, out: 0.08, el: -0.35 };     // 右手拿探測棒往前伸（走路時也保持）
  rotate(P, "upperarm_l", [[X, L.up], [Z, L.out]]); rotate(P, "upperarm_r", [[X, R.up], [Z, -R.out]]);
  rotate(P, "lowerarm_l", [[X, L.el]]); rotate(P, "lowerarm_r", [[X, R.el]]);
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
  }
}
