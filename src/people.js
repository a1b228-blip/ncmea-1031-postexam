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
  if (!cache.has(id)) cache.set(id, loader.loadAsync(`assets/people/${id}.glb`, onProgress).then(fixMaterials).catch((e) => { cache.delete(id); throw e; }));
  return cache.get(id);
};
// 修正 MakeHuman 匯出的材質：皮膚、頭髮、眉毛、睫毛、眼睛、鞋子都被標成「半透明＋不寫入深度」，
// 會把後腦勺內側畫到臉上（臉變黑、出現色塊）。改成「鏤空」：透明處挖掉、其餘實心，前後就不會錯亂；
// 皮膚、眼睛、鞋子再改成只畫正面（不會看到模型內側）。整份模型只修一次，複製出來的人物共用。
const FRONT_ONLY = /(^|\.)(body|high-poly|shoes\d*)$/i;
// 衣服疊層：彎腰時皮膚會從上衣透出來、上衣下襬和褲子互相穿插（出現白斑）→ 畫的時候上衣最優先、褲子其次（深度偏移，模型不變）
const TOP = /t-shirt|shirt|cardigan|scrub|jacket|coat|sweater|blouse|top/i, BOTTOM = /pants|trousers|jeans|skirt/i;
function fixMaterials(gltf) {
  const seen = new Set();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const layer = TOP.test(o.name) ? 2 : BOTTOM.test(o.name) ? 1 : 0;
    for (const m of [].concat(o.material)) {
      if (!m || seen.has(m)) continue; seen.add(m);
      if (layer) { m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -layer; m.needsUpdate = true; }
      if (!m.transparent) continue;
      m.transparent = false; m.depthWrite = true; m.alphaTest = 0.5;
      if (FRONT_ONLY.test(m.name)) m.side = THREE.FrontSide;
      m.needsUpdate = true;
    }
  });
  tuckShirt(gltf);
  return gltf;
}
// 上衣紮進褲子：上衣下襬原本垂在褲頭外 10 公分左右，彎腰時兩層互相穿插（褲子上出現白斑）。
// 把褲頭以下的上衣下襬往身體中心收 7%（約 1.4 公分），褲子就一直蓋在外面。長版外套（醫師）不動。
const TUCK_TOP = /t-shirt|scrub|shirt|blouse/i, TUCK_SKIP = /cardigan|coat|jacket|dress/i;
function tuckShirt(gltf) {
  const ms = []; gltf.scene.traverse((o) => { if (o.isMesh) ms.push(o); });
  const pants = ms.find((o) => BOTTOM.test(o.name)), tops = ms.filter((o) => TUCK_TOP.test(o.name) && !TUCK_SKIP.test(o.name));
  if (!pants || !tops.length) return;
  const pp = pants.geometry.attributes.position; let top = -Infinity;
  for (let i = 0; i < pp.count; i++) top = Math.max(top, pp.getY(i));
  let cx = 0, cz = 0, n = 0;                                  // 褲頭那一圈的中心（前後左右）
  for (let i = 0; i < pp.count; i++) if (pp.getY(i) > top - 0.04) { cx += pp.getX(i); cz += pp.getZ(i); n++; }
  cx /= n; cz /= n;
  for (const t of tops) {
    const p = t.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y > top + 0.005) continue;
      const w = Math.min(1, (top + 0.005 - y) / 0.025), k = 1 - 0.07 * w;   // 褲頭附近 2.5 公分慢慢收進去
      p.setX(i, cx + (p.getX(i) - cx) * k); p.setZ(i, cz + (p.getZ(i) - cz) * k);
    }
    p.needsUpdate = true; t.geometry.computeBoundingSphere();
  }
}
const load = (id, onProgress, tries = 3) => load1(id, onProgress).catch((e) => (tries > 1 ? new Promise((r) => setTimeout(r, 800)).then(() => load(id, onProgress, tries - 1)) : Promise.reject(e)));
export const loadPerson = load;
// 一般 3D 模型（Blender 做的考場儀器 assets/props/*.glb）：同一個檔只下載一次，失敗自動重試
const modelCache = new Map();
export function loadModel(url, onProgress, tries = 3) {
  if (!modelCache.has(url)) modelCache.set(url, loader.loadAsync(url, onProgress).catch((e) => { modelCache.delete(url); throw e; }));
  return modelCache.get(url).catch((e) => (tries > 1 ? new Promise((r) => setTimeout(r, 800)).then(() => loadModel(url, onProgress, tries - 1)) : Promise.reject(e)));
}
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

// ---------- 動態表情（2026-11-10）----------
// assets/people/expr/<id>-<表情>.glb：Blender 輸出的「只有臉」版本（make_people.py EXPR=1），跟一般模型相減 → 臉部變形（morph），
// 表情之間以每秒約 4 的速度慢慢變過去。同一個人的所有分身共用同一份變形資料。
export const EXPR_SET = { son: ["worried", "panic", "shout", "smile"], dingchen: ["concern", "focus", "smile"], ruiyi: ["focus", "smile"],
  yunding: ["focus", "smile"], xiaohua: ["focus", "smile"], examiner: ["serious"], examiner2: ["serious"], examiner3: ["serious"], examiner4: ["serious"] };
const EXPR_DEFAULT = { examiner: "serious", examiner2: "serious", examiner3: "serious", examiner4: "serious" };   // 考官一整場都嚴肅
const exprCache = new Map();
function loadExpr(id) {
  if (!EXPR_SET[id]) return null;
  if (!exprCache.has(id)) exprCache.set(id, Promise.all([load(id), ...EXPR_SET[id].map((n) => load(`expr/${id}-${n}`))]).then(([base, ...vars]) => {
    const meshes = {};
    base.scene.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });
    const n = vars.length;
    for (const b of Object.values(meshes)) {
      const bp = b.geometry.attributes.position;
      const slots = vars.map(() => null);
      vars.forEach((v, k) => v.scene.traverse((o) => {
        if (!o.isMesh || o.name !== b.name) return;
        const vp = o.geometry.attributes.position;
        if (vp.count !== bp.count) { console.warn("表情頂點數不同，略過", id, b.name); return; }
        const d = new Float32Array(bp.count * 3);
        for (let i = 0; i < bp.count; i++) { d[i * 3] = vp.getX(i) - bp.getX(i); d[i * 3 + 1] = vp.getY(i) - bp.getY(i); d[i * 3 + 2] = vp.getZ(i) - bp.getZ(i); }
        slots[k] = new THREE.Float32BufferAttribute(d, 3);
      }));
      if (!slots.some(Boolean)) continue;
      b.geometry.morphAttributes.position = slots.map((a) => a || new THREE.Float32BufferAttribute(new Float32Array(bp.count * 3), 3));
      b.geometry.morphTargetsRelative = true;
    }
    return { names: EXPR_SET[id], n };
  }).catch((e) => { console.warn("表情載入失敗：", id, e); return null; }));
  return exprCache.get(id);
}
export const setExpr = (g, name) => { const P = g?.userData?.person; if (P) P.expr = name || null; };

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
      o.castShadow = !/eyebrow|eyelash/i.test(o.material?.name || ""); o.receiveShadow = true; o.frustumCulled = false;   // 眉毛、睫毛是透明小方片，不投影子（否則眼睛周圍會有一條黑帶）
      if (tint && o.material?.name?.toLowerCase().includes("cloth")) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); }
    });
    g.add(m); P.model = m;
    P.expr ??= EXPR_DEFAULT[id] || null;
    loadExpr(id)?.then((info) => {
      if (!info) return;
      const ms = []; m.traverse((o) => { if (o.isMesh && o.geometry.morphAttributes.position) { o.updateMorphTargets(); ms.push(o); } });
      P.exprNames = info.names; P.exprMeshes = ms; P.exprW = info.names.map(() => 0);
    });
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
    try { dress(P, m); } catch (e) { console.warn("配件失敗：", id, e); }
  }).catch((e) => console.warn("人物載入失敗：", id, e));
  all.push(P);
  return g;
}
export const setPose = (g, pose) => { const P = g?.userData?.person; if (P) P.pose = pose; };

// ---------- 衣服細節：識別證、胸前口袋＋筆、放射師的輻射劑量配章、護理師掛錶、考官識別證掛繩 ----------
// 在模型剛載入（標準站姿）時，從人物正前方往胸口打射線，找到衣服表面，把配件貼上去再掛到胸口骨頭（spine_03）上，之後彎腰、壓胸都會跟著動。不放文字。
const RADIO = { badge: 1, pocket: 1, dosi: 1 }, NURSE = { badge: 1, pocket: 1, watch: 1 }, EXAMINER = { lanyard: 1 }, STAFF = { badge: 1 };
const DRESS = { examiner: EXAMINER, examiner2: EXAMINER, examiner3: EXAMINER, examiner4: EXAMINER };   // 使用者指定：只留考官的掛繩識別證（放射師、護理師、醫師、隊員都不放配件）
const AM = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
const ACC = { white: AM(0xf8fafc), blue: AM(0x1d4ed8), photo: AM(0x94a3b8), dark: AM(0x334155), silver: AM(0xcbd5e1, { metalness: 0.6, roughness: 0.3 }),
  pen1: AM(0x111827), pen2: AM(0x1d4ed8), dosi: AM(0xe5e7eb), orange: AM(0xf97316), strap: AM(0x1e3a8a), green: AM(0x15803d) };
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
function badgeMesh(head) {                                 // 識別證：白卡＋上方色條＋照片位置＋夾子（+z 朝外）
  const g = new THREE.Group();
  g.add(bx(0.68, 1.0, 0.04, ACC.white), bx(0.68, 0.2, 0.05, head, 0, 0.4, 0.005), bx(0.26, 0.32, 0.05, ACC.photo, -0.13, 0.05, 0.005), bx(0.2, 0.12, 0.06, ACC.dark, 0, 0.56, 0));
  return g;
}
function dress(P, m) {
  const want = DRESS[P.id]; if (!want) return;
  const g = P.g, spine = P.bones.spine_03?.b; if (!spine) return;
  g.updateWorldMatrix(true, true);
  const skins = []; m.traverse((o) => { if (o.isSkinnedMesh && !/eyebrow|eyelash|eye|teeth|tongue|hair/i.test(o.name + (o.material?.name || ""))) { o.skeleton.update(); o.computeBoundingSphere(); skins.push(o); } });
  const hc = g.worldToLocal(spine.getWorldPosition(new THREE.Vector3())).y;   // 胸口高度（人物座標）
  const ray = new THREE.Raycaster(), nm = new THREE.Matrix3();
  const hit = (y, z) => {                                    // 人物座標：面向 +x、右手 +z
    const o = g.localToWorld(new THREE.Vector3(8, y, z)), d = g.localToWorld(new THREE.Vector3(-1, y, z)).sub(o).normalize();
    ray.set(o, d); const h = ray.intersectObjects(skins, false)[0]; if (!h) return null;
    const n = h.face.normal.clone().applyMatrix3(nm.getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(d) > 0) n.negate();
    return { p: h.point, n, mat: h.object.material };
  };
  const put = (obj, y, z, lift = 0.04) => {                 // 貼到衣服表面、正面朝外，再掛到胸口骨頭
    const h = hit(y, z); if (!h) return null;
    obj.position.copy(h.p).addScaledVector(h.n, lift); obj.lookAt(h.p.clone().addScaledVector(h.n, 2));
    obj.updateMatrixWorld(true); spine.attach(obj); return h;
  };
  if (want.pocket) {                                         // 左胸口袋：口袋上緣縫線＋兩支筆露出筆夾
    const seamM = new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.35 }), bodyM = new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.1 });
    put(bx(1.35, 1.35, 0.01, bodyM), hc + 0.08, -1.25, 0.015);                 // 口袋輪廓（淡淡一塊）
    put(bx(1.35, 0.07, 0.02, seamM), hc + 0.75, -1.25, 0.025);                 // 口袋上緣縫線
    for (const [dz, mt] of [[-0.28, ACC.pen1], [0.02, ACC.pen2]]) {           // 兩支筆只露出口袋上緣的筆蓋與筆夾
      const pen = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.4, 10), mt); c.position.y = 0.2; pen.add(c, bx(0.035, 0.28, 0.04, ACC.silver, 0, 0.2, 0.065));
      put(pen, hc + 0.72, -1.25 + dz, 0.06);
    }
  }
  if (want.badge) put(badgeMesh(ACC.blue), hc - 0.4, -1.25, 0.05);    // 識別證夾在口袋下緣
  if (want.dosi) { const d = new THREE.Group(); d.add(bx(0.4, 0.5, 0.1, ACC.dosi), bx(0.24, 0.16, 0.11, ACC.orange, 0, 0.08, 0.005), bx(0.16, 0.1, 0.12, ACC.dark, 0, 0.28, 0)); put(d, hc + 1.35, 1.15, 0.06); }   // 放射師：輻射劑量配章（右上胸、靠領口）
  if (want.watch) {                                          // 護理師：胸前掛錶
    const w = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24), ACC.silver); body.rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), AM(0xfde7c8)); face.position.z = 0.06;                   // 米色錶面＋指針（跟白上衣分得開）
    const hh = bx(0.03, 0.14, 0.01, ACC.dark, 0, 0.06, 0.065), mh = bx(0.025, 0.2, 0.01, ACC.dark, 0.06, 0.03, 0.066); mh.rotation.z = -1.1;
    w.add(body, face, hh, mh, bx(0.08, 0.35, 0.05, ACC.silver, 0, 0.42, 0));
    put(w, hc + 0.55, 1.2, 0.06);
  }
  if (want.lanyard) {                                        // 考官：掛繩＋識別證（胸前正中）
    const b = badgeMesh(ACC.green), h = put(b, hc - 0.85, 0, 0.06);
    if (h) for (const s of [-1, 1]) {
      const top = hit(hc + 2.9, s * 0.8); if (!top) continue;                    // 掛繩往上到脖子兩側
      const a = b.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0)).addScaledVector(h.n, 0.02), c = top.p.clone().addScaledVector(top.n, 0.06);
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, a.distanceTo(c), 8), ACC.strap);
      strap.position.copy(a).add(c).multiplyScalar(0.5); strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
      strap.updateMatrixWorld(true); spine.attach(strap);
    }
  }
}
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
// 拍肩姿勢（數值用骨頭位置算到雙手落在安妮兩肩）
const TAP = { R: { up: -0.337, out: -0.369, tw: 0.4, el: -1.457 }, L: { up: -1.7, out: 0.053, tw: 0.419, el: 0.05 }, spine: 0.9, neck: [0.3, -0.45] };   // 安妮頭朝東：左右手對調（鏡像）
if (typeof window !== "undefined") window.__tap = TAP;
// 搬背板＋BVM：右手垂下抓背板上緣（背板夾在右側）、左手在胸前拿 BVM
const CARRY = { R: { up: 0.05, out: 0.22, el: -0.1 }, L: { up: -0.7, out: 0.1, tw: 0.3, el: -1.3 } };
if (typeof window !== "undefined") window.__carry = CARRY;
const O2R = { up: -1.167, out: 0.389, tw: 0.3, el: -1.31 };   // 轉氧氣流量旋鈕的右手（數值用骨頭位置算出來）
if (typeof window !== "undefined") window.__o2r = O2R;
// 推急救車（右手扶車）、貼電擊貼片（雙手各按一片）：數值用骨頭位置算出來
const GUIDE = { up: 0.041, out: -0.066, tw: 0.075, el: -1.575 };
const PADS = { L: { up: -1.652, out: 0.176, tw: 0, el: -0.998 }, R: { up: -1.178, out: 0.295, tw: 0, el: -1.601 }, spine: 1.1 };   // 安妮頭朝東：左手右上胸（北）、右手左側胸（南）
if (typeof window !== "undefined") { window.__guide = GUIDE; window.__pads = PADS; }
// 姿勢表：手臂往前抬＝繞 X 負角度；往外張＝左手繞 Z 正角度、右手繞 Z 負角度；手肘彎＝繞 X 負角度；彎腰＝繞 X 正角度
function arms(P, t) {
  const s = Math.sin, w = P.walkAmp;
  const swing = s(P.phase) * 0.38 * w;
  let L = { up: swing, out: 0.06, el: -0.15 }, R = { up: -swing, out: 0.06, el: -0.15 }, spine = 0, neck = [0, 0];   // neck＝[低頭, 轉頭（正＝往左）]
  if (w < 0.5) {
    switch (P.pose) {
      case "phone": R = { up: -1.2, out: 0.37, tw: 0.98, el: -2.33 }; break;            // 手機貼右耳、手肘在側邊（數值用骨頭位置算出來）
      case "cpr": R = { up: -1.206, out: -0.67, tw: 0.3, el: 0 }; L = { up: -1.143, out: -0.691, tw: 0.3, el: -0.073 }; spine = 0.6 + (P.cprK || 0) * 0.05; break;   // 雙手交疊在胸骨下半段、手臂打直（數值用骨頭位置算出來）；cprK＝壓下的程度
      case "bvm": L = { up: -0.95, out: -0.05, el: -0.75 }; R = { up: -0.95, out: -0.05, el: -0.75 }; spine = 0.25; break;
      case "calm": L = { up: -0.55, out: 0.1, el: -0.55 + s(t * 3) * 0.12 }; R = { up: -0.55, out: 0.1, el: -0.55 - s(t * 3) * 0.12 }; break;
      case "teach": R = { up: -0.95 + s(t * 2.2) * 0.1, out: 0.12, tw: 0.35, el: -0.85 + s(t * 3) * 0.15 }; L = { up: -0.5, out: 0.05, tw: 0.25, el: -1.2 + s(t * 2.6) * 0.1 }; break;   // 雙手在胸前比劃說明
      case "angry": L = { up: -1.9 + s(t * 7) * 0.5, out: 0.35, el: -0.9 }; R = { up: -1.9 - s(t * 7) * 0.5, out: 0.35, el: -0.9 }; spine = 0.08; break;
      case "sit": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.45, out: 0.05, el: -1.0 }; break;
      case "score": L = { up: -0.16, out: -0.2, tw: 0.55, el: -0.6, ey: -0.42 }; R = { up: -0.3 + s(t * 1.3) * 0.03, out: -0.25, tw: 0.4, el: -0.5 + s(t * 7) * 0.05, ey: -0.07 }; break;   // 考官：左手托評分夾板（腰前）、右手寫字（數值用骨頭位置算出來）
      case "film": R = { up: -1.35, out: 0.05, tw: 0.2, el: -0.55 }; L = { up: -0.2, out: 0.1, el: -0.3 }; break;   // 兒子舉手機偷拍
      case "stop": R = { up: -1.5, out: 0.2, el: -0.1 }; L = { up: -0.35, out: 0.1, el: -0.4 }; break;             // 伸手制止
      case "hold": L = { up: -0.16, out: -0.2, tw: 0.55, el: -0.6, ey: -0.42 }; R = { up: -0.3, out: -0.25, tw: 0.4, el: -0.5, ey: -0.07 }; break;                                     // 拿著單子看（同意書）
      case "tap": case "lean": {                       // 叫：彎腰雙手放在病人兩肩（tap＝拍打、lean＝停在肩上探頭查看）
        const k = P.pose === "tap" ? Math.max(0, s(t * 12)) * 0.16 : 0;
        L = { ...TAP.L, el: TAP.L.el + k, up: TAP.L.up - k * 0.5 }; R = { ...TAP.R, el: TAP.R.el + k, up: TAP.R.up - k * 0.5 }; spine = TAP.spine; neck = TAP.neck; break;
      }
      case "reach": L = { up: -0.75, out: 0.12, el: -0.35 }; R = { up: -0.75, out: 0.12, el: -0.35 }; spine = 0.75; break;   // 彎腰從急救車拿東西
      case "o2": L = { ...CARRY.L }; R = { ...O2R }; spine = 0.08; break;   // 左手拿 BVM、右手轉氧氣流量旋鈕（背板夾在右腋下）
      case "pads": L = { ...PADS.L }; R = { ...PADS.R }; spine = PADS.spine; neck = [0.35, 0]; break;   // 彎腰把兩片電擊貼片貼到胸口
      case "nod": L = { up: -0.05, out: 0.08, el: -0.3 }; R = { up: -0.05, out: 0.08, el: -0.3 }; neck = [0.1 + Math.max(0, s(t * 5)) * 0.16, 0]; break;   // 聽交班：邊聽邊點頭
      case "sitTalk": L = { up: -0.45, out: 0.05, el: -1.0 }; R = { up: -0.8 + s(t * 2.6) * 0.18, out: 0.18, el: -1.15 + s(t * 3.3) * 0.25 }; spine = 0.06; break;
    }
  }
  if (P.pose === "wand") R = { up: -0.95, out: 0.08, el: -0.35 };     // 右手拿探測棒往前伸（走路時也保持）
  if (P.pose === "carry") { R = { ...CARRY.R }; L = { ...CARRY.L }; }   // 右手夾背板、左手拿 BVM（走路時也保持）
  if (P.pose === "guide") R = { ...GUIDE };                               // 右手扶著急救車上緣、車在右側一起走（走路時也保持）
  const tune = w < 0.5 && TUNE[P.pose];                                 // 除錯用：window.__poseTune 即時調整角度
  if (tune) { if (tune.L) L = { ...L, ...tune.L }; if (tune.R) R = { ...R, ...tune.R }; if (tune.spine != null) spine = tune.spine; if (tune.neck) neck = tune.neck; }
  if (P.headYaw) neck = [neck[0], neck[1] + P.headYaw];                // 轉頭說話（例如邊壓胸邊轉頭交班）；正＝往左
  // tw＝上臂往身體中線轉（水平方向），ey＝前臂往內轉（手往臉靠）；沒寫就是 0
  rotate(P, "upperarm_l", [[X, L.up], [Z, L.out], [Y, -(L.tw || 0)]]); rotate(P, "upperarm_r", [[X, R.up], [Z, -R.out], [Y, R.tw || 0]]);
  rotate(P, "lowerarm_l", [[X, L.el], [Y, -(L.ey || 0)]]); rotate(P, "lowerarm_r", [[X, R.el], [Y, R.ey || 0]]);
  fingers(P);
  const bow = P.bow * 1.05;
  rotate(P, "spine_01", [[X, spine * 0.5 + bow * 0.45]]); rotate(P, "spine_02", [[X, spine * 0.5 + bow * 0.35]]); rotate(P, "neck_01", [[X, bow * 0.2 + neck[0]], [Y, neck[1]]]);
}
// 手指：0＝攤平、1＝握拳。拿東西的姿勢握住（BVM、背板、旋鈕、急救車、手機、夾板、探測棒），其他時候自然微彎
const GRIP = {
  bvm: [0.65, 0.65], carry: [0.65, 0.9], o2: [0.65, 0.5], guide: [0.18, 0.55], cpr: [0.3, 0.3],
  phone: [0.18, 0.75], film: [0.18, 0.75], hold: [0.6, 0.5], score: [0.6, 0.55], wand: [0.18, 0.9],
  tap: [0.05, 0.05], pads: [0.0, 0.0], stop: [0.18, 0.05], teach: [0.2, 0.2], calm: [0.2, 0.2],
};
const FINGERS = ["index", "middle", "ring", "pinky"];
function fingers(P) {
  const w = P.walkAmp, g = (w < 0.5 || P.pose === "carry" || P.pose === "wand" || P.pose === "guide") && GRIP[P.pose] || [0.18, 0.18];
  for (const [side, c, sg] of [["l", g[0], -1], ["r", g[1], 1]]) {
    if (P.grip?.[side] === c) continue;                      // 沒變就不用重算
    for (const f of FINGERS) { rotate(P, `${f}_01_${side}`, [[Z, sg * c * 0.8]]); rotate(P, `${f}_02_${side}`, [[Z, sg * c]]); rotate(P, `${f}_03_${side}`, [[Z, sg * c * 0.7]]); }
    rotate(P, `thumb_01_${side}`, [[Y, sg * c * 0.4]]); rotate(P, `thumb_02_${side}`, [[Y, sg * c * 0.8]]); rotate(P, `thumb_03_${side}`, [[Y, sg * c * 0.6]]);
    (P.grip ||= {})[side] = c;
  }
}
function legs(P) {
  if (P.pose === "sit" || P.pose === "sitTalk") {
    const k = P.sitK ?? 1;                                   // sitK：0＝腿伸直、1＝坐姿（坐下、躺下時用來慢慢彎／伸直）
    rotate(P, "thigh_l", [[X, -1.5 * k]]); rotate(P, "thigh_r", [[X, -1.5 * k]]);
    rotate(P, "calf_l", [[X, 1.5 * k]]); rotate(P, "calf_r", [[X, 1.5 * k]]);
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
    if (P.exprMeshes) {                                  // 表情：每個表情的權重慢慢靠近目標（約 0.5 秒變完）
      const k = Math.min(1, dt * 4);
      P.exprNames.forEach((nm, i) => { const w = (P.exprW[i] += ((nm === P.expr ? 1 : 0) - P.exprW[i]) * k); for (const o of P.exprMeshes) o.morphTargetInfluences[i] = w; });
    }
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
  const on = (P.pose === "phone" || P.pose === "film") && P.walkAmp < 0.5;   // 打電話、偷拍都拿手機
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
