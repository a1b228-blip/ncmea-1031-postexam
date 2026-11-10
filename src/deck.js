// 1031 考後報告 3D 簡報：換頁引擎（參考藥劑科 RPA 第三版「走廊模式」）
// 整份簡報是同一個 3D 世界（林口長庚整層樓＋考場），每一頁、每一步鏡頭停在不同位置，換頁時連續飛行。
// 操作：→／空白鍵／點擊 下一步，← 上一步，M 靜音，F 全螢幕，Home 回封面。
import { view } from "./view.js";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { createWorld } from "./world.js";
import { sfx, bgm } from "./audio.js";
import { createExplore } from "./explore.js";
import { drawCT, drawMRI } from "./scanImages.js";
import { annieMonitorCanvas, annieVitals } from "./devices.js";
import { preloadAll } from "./preload.js";

gsap.registerPlugin(SplitText);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

const W = createWorld($("#stage"));
const { THREE, camera } = W;
const V = (a) => new THREE.Vector3(...a);

// ---------- 舞台縮放（1600×900，等比例） ----------
const deck = $("#deck");
function fit() { deck.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1600, innerHeight / 900)})`; }
fit(); addEventListener("resize", fit);

// ---------- 鏡頭站點 ----------
const POSE = {
  cover: { pos: [-330, 400, 860], look: [170, 0, 330] },
  coverStart: { pos: [-470, 560, 1060], look: [170, 0, 340] },
  checkin: { pos: [650, 300, 470], look: [830, 0, 105] },
  checkinNear: { pos: [700, 220, 340], look: [805, 0, 80] },
  team: { pos: [290, 360, 480], look: [340, 0, 92] },
  obs: { pos: [330, 250, 520], look: [120, 10, 345] },
  obsInside: { pos: [232, 40, 356], look: [20, 30, 336] },
  obsInside2: { pos: [176, 36, 356], look: [20, 32, 330] },
  briefView: { pos: [150, 28, 360], look: [20, 30.5, 358] },   // 坐在觀眾席後方看大螢幕（看得到考官與講台）
  briefClose: { pos: [96, 33, 352], look: [20, 33, 352] },     // 推近：螢幕填滿畫面，看得清楚內容
  screenNear: { pos: [86, 33, 352], look: [20, 33, 352] },     // 螢幕剛好填滿畫面
  liveView: W.LIVE_POSE,                                        // 與大螢幕畫面同一個鏡頭
  obsExam: { pos: [330, 330, 640], look: [300, 0, 290] },
  teamNear: { pos: [330, 340, 470], look: [390, 0, 92] },
  backOverview: { pos: [330, 430, 600], look: [430, 0, 175] },
  toDoor: { pos: [190, 400, 540], look: [330, 0, 170] },
  doorFP: { pos: [241, 28, 244], look: [292, 15, 256], fov: 55 },   // 第一人稱：站在隊員後方看題幹
  examSplit: { pos: [300, 360, 520], look: [330, 0, 285] },
  room2Near: { pos: [240, 290, 400], look: [345, 0, 112] },
  debrief: { pos: [300, 120, 540], look: [330, 4, 446] },        // Debrief 教室：從東南上方看長桌與走廊入口（左邊留給文字）
  debriefClose: { pos: [318, 58, 500], look: [345, 8, 442] },   // 拉近：看得到兩側的人與桌上的碼錶
  obsRest: { pos: [160, 50, 448], look: [76, 6, 372] },         // 回觀摩教室休息：看得到我們隊伍與秀蒂
  points: { pos: [262, 330, 520], look: [318, 0, 292] },        // 考點總整理：俯瞰整個考場（左邊留給文字卡）
};

// ---------- 各頁設定（每一步的 3D 狀態，後一步沿用前一步） ----------
const TEAM_ROOMS = ["team1", "team2", "team3", "team6", "team7", "team8"];
const SLIDES = {
  cover: {
    steps: [{ cam: "cover", layers: { building: 0, examBig: 1, exam: 0, eq: 0, teamTag: 0 }, hl: [], routes: [], figs: { team: { hide: true }, teacher: { hide: true } } }],
  },
  checkin: {
    steps: [
      { cam: "checkin", layers: { building: 1, examBig: 0 }, hl: ["checkin"], routes: ["checkin"], figs: { team: { route: "checkin", t: 0.1 }, teacher: { route: "checkin", t: 0 } } },
      { figs: { team: { route: "checkin", t: 1, dur: 2.6 }, teacher: { route: "checkin", t: 0.86, dur: 2.6 } }, sound: "chime" },
    ],
  },
  team: {
    steps: [
      { cam: "team", hl: [], routes: ["checkin", "toTeam"], figs: { team: { route: "toTeam", t: 1, dur: 3.2 }, teacher: { route: "toTeam", t: 0.93, dur: 3.2 } } },
      { hl: TEAM_ROOMS, layers: { teamTag: 1 } },
      { figs: { teacher: { route: "teacherOut", t: 1, dur: 3, fadeOut: true } } },
      {},
    ],
  },
  obs: {
    steps: [
      { cam: "obs", hl: ["obs"], routes: ["toObs"], figs: { team: { route: "toObs", t: 1, dur: 3.6 } } },
      { cam: "obsInside", hl: [], routes: [], audience: true, live: false, screen: 0, layers: { building: 0 }, figs: { team: { hide: true } } },
      { cam: "obsInside2" },
    ],
  },
  // 第 5 頁：考官上台，大螢幕播放參賽注意事項（每按一次換一張），最後切回考場即時畫面
  brief: {
    steps: [
      ...Array.from({ length: W.BRIEF_COUNT }, (_, i) => (i ? { screen: i, cam: "briefClose" } : { cam: "briefView" })),   // 觀摩教室的螢幕已經是考官說明封面
    ],
  },  // 第 5 頁：第一人稱走進考場（方向鍵／WASD 走動）
  explore: {
    explore: true,
    enterDelay: 1.5,                                     // 從考官說明頁進來時：飛入大螢幕、接到 CT 室後再顯示本頁文字
    steps: [{ live: false, screen: null, layers: { eq: 1, exam: 0, examBig: 0, building: 0, live: 0, teamTag: 0, audience: 0 } }],
  },
  // 第 6 頁：從考場拉高回俯瞰，隊員走回入闈教室 2 等待
  back: {
    steps: [
      { cam: "backOverview", layers: { eq: 0, building: 1, examBig: 1 }, hl: [], routes: ["backToTeam"], figs: { team: { route: "backToTeam", t: 1, dur: 4.6, delay: 0.8 } } },
      { cam: "room2Near", hl: ["team2"], layers: { examBig: 0 } },
      { sound: "chime" },
    ],
  },
  // 第 8 頁（第二幕）：走到考場門口 → 第一人稱看題幹 30 秒 → 考官指示兩兩分組 → 走進 CT／MRI
  exam: {
    steps: [
      { cam: "toDoor", hl: [], routes: ["toExamDoor"], layers: { examBig: 0 }, figs: { team: { route: "toExamDoor", t: 1, dur: 4.6, delay: 0.6 } } },
      { cam: "doorFP", routes: [], door: "door", walls: true, layers: { building: 0 }, figs: { team: { hide: true } } },
      {},
      { cam: "examSplit", door: "split", walls: false, hl: ["ct", "wait"], doorView: "mri", split: 0 },   // 分組說明：重點在 MRI → 只看 MRI 等候區
      { door: "spToCT", doorView: "dual", split: 0.5 },                                                  // 兒子走去 CT → 切成左 CT、右 MRI 兩個畫面
    ],
  },
  // 第 9 頁：兩間考場同時進行（左右雙畫面）
  dual: {
    // 41 考官遞單 → 0 病人辨識 → 42 拿同意書確認 → 43 CT 解釋檢查｜MRI 看 X 光＋金屬探測器 → 44 CT 躺床打針｜MRI 人工檢測 → 40 移除痠痛貼布、暖暖包
    steps: [{ dual: 41, door: null, doorView: null, hl: [], routes: [] }, { dual: 0 }, { dual: 42 }, { dual: 43 }, { dual: 44 }, { dual: 40 }],
  },
  // 第 10 頁：執行檢查與影像判讀（延續雙畫面）
  scan: {
    steps: [4, 5, 6, 7].map((d) => ({ dual: d })),
  },
  // 第 11 頁：發現異常後的處置與交班（延續雙畫面）
  handle: {
    steps: [8, 9, 10, 11].map((d) => ({ dual: d })),
  },
  // 第 12 頁：MRI 病人狀況改變（右邊 MRI 畫面放大）
  arrest: { split: 0.4, steps: [12, 13, 14].map((d) => ({ dual: d })) },
  // 第 13 頁：叫叫 CABD 急救、999、全院廣播、護理師支援交班
  cpr: { split: 0.4, steps: [15, 16, 17, 18, 19, 20, 21].map((d) => ({ dual: d })) },
  // 第 14 頁：兒子（CT 標準病人）衝到等候區大鬧、999 急救團隊到場、護理師交班
  // 兒子衝出 CT 室之後（第 3 步起）CT 室沒有人了 → 只留 MRI 單一畫面
  family: { split: 0.4, steps: [22, 23, 24, 25, 26].map((d) => ({ dual: d, ...(d >= 24 ? { split: 0 } : {}) })) },
  // 考試結束 → Debrief 教室（考官 4 位、考生 4 位面對面）→ 回觀摩教室休息
  debrief: {
    steps: [
      { dual: null, door: null, debrief: 0, cam: "debrief", hl: [], routes: [], audience: false },
      { debrief: 1, cam: "debriefClose" },
      { debrief: 2, cam: "debriefClose" },
      { debrief: 3, cam: "debrief" },
      { debrief: 4, cam: "obsRest", audience: true },
    ],
  },
  // 第 15 頁：TRM 評核重點（split 0＝整個畫面只用等候區鏡頭）
  trm: { split: 0, steps: [27, 28, 29, 30, 31].map((d, i) => ({ dual: d, ...(i ? {} : { audience: false }) })) },
  // 第 16 頁：ISBAR 五個交班時機（重播當時那一幕；dual 32–37 由 world.js 的 ISBAR_VIEW 對應）
  isbar: { split: 0, steps: [32, 33, 34, 35, 36, 37].map((d) => ({ dual: d })) },
  // 考點總整理：鏡頭俯瞰考場（考場在畫面右邊），每按一下亮一條考點，對應的房間跟著亮（MRI 第 3～5 條發生在等候區）
  points: {
    steps: [
      { dual: null, door: null, cam: "points", hl: [], routes: [], audience: false },
      { hl: ["ct"] }, { hl: ["ct"] }, { hl: ["mri"] }, { hl: ["mri"] }, { hl: ["wait"] }, { hl: ["wait"] }, { hl: ["wait"] },
    ],
  },
  // 第 17 頁：電影片尾（進頁自動播：謝幕鞠躬 → 名單捲動 → 結語＋煙火；→ 直接跳到最後一張）
  credits: { split: 0, steps: [{ dual: 38 }, { dual: 39 }] },

};

// ---------- 文字進入 3D：封面大標題立在場景裡 ----------
const T = THREE, UP = new T.Vector3(0, 1, 0);
const cssScene = new T.Scene(), css3d = new CSS3DRenderer();
css3d.domElement.id = "space";
document.body.insertBefore(css3d.domElement, deck);
const fitSpace = () => css3d.setSize(view.w, view.h);
fitSpace(); addEventListener("resize", fitSpace);
function lift(el, pose, { D, turn = 0, size = 1 }) {
  const sl = el.closest(".slide"), w = el.offsetWidth, h = el.offsetHeight;
  const u = (el.offsetLeft + w / 2) / 800 - 1, v = 1 - (el.offsetTop + h / 2) / 450;
  const p = V(pose.pos), f = V(pose.look).sub(p).normalize();
  const r = new T.Vector3().crossVectors(f, UP).normalize(), up = new T.Vector3().crossVectors(r, f);
  const tanV = Math.tan(T.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * (16 / 9);
  const wrap = document.createElement("div"); wrap.className = "space-item"; wrap.style.width = `${w}px`;
  el.style.cssText += ";position:relative;left:0;top:0;margin:0";
  wrap.appendChild(el);
  const o = new CSS3DObject(wrap);
  o.position.copy(p).addScaledVector(f, D).addScaledVector(r, u * D * tanH).addScaledVector(up, v * D * tanV);
  o.quaternion.setFromRotationMatrix(new T.Matrix4().lookAt(p, o.position, up)); // 面向鏡頭
  o.rotateY(turn);
  o.scale.setScalar(((2 * D * tanH) / 1600) * size);
  cssScene.add(o);
  sl._space = (sl._space || []).concat(wrap);
}

// ---------- 鏡頭飛行 ----------
const cam = { pos: V(POSE.coverStart.pos), look: V(POSE.coverStart.look) };
let flight = null;
function flyTo(name, animate, { arc: arcOpt, dur: durOpt, ease = "power2.inOut" } = {}) {
  const pose = POSE[name]; if (!pose) return;
  const toP = V(pose.pos), toL = V(pose.look), fromP = cam.pos.clone(), fromL = cam.look.clone();
  flight?.kill();
  if (!animate) { cam.pos.copy(toP); cam.look.copy(toL); return 0; }
  const dist = fromP.distanceTo(toP) + fromL.distanceTo(toL) * 0.5;
  if (dist < 1) return 0;
  const dur = durOpt ?? gsap.utils.clamp(1.4, 3.4, 1.2 + dist / 450), arc = arcOpt ?? Math.min(dist * 0.16, 150);
  const p = { t: 0 };
  flight = gsap.to(p, {
    t: 1, duration: dur, ease,
    onUpdate: () => { cam.pos.lerpVectors(fromP, toP, p.t); cam.pos.y += Math.sin(Math.PI * p.t) * arc; cam.look.lerpVectors(fromL, toL, p.t); },
  });
  return dur;                                                  // 換頁不再有風聲（使用者只要背景音樂）
}

// ---------- 飛入大螢幕：直線推進到螢幕填滿畫面，再無縫接到考場裡同一個鏡頭 ----------
let diving = false;
function flyIntoScreen(via, to, onDone) {
  diving = true;
  W.setLayer("live", false, 0.4);                              // 推進時先收掉螢幕上方的標籤
  W.fadeToLive(0.6);                                           // 投影片一邊淡成考場即時畫面
  const dur = flyTo(via, true, { arc: 0, dur: 1.1, ease: "power1.in" });   // 一邊推進到螢幕填滿畫面（不停頓）
  gsap.delayedCall(dur, () => {
    flyTo(to, false);                                          // 螢幕填滿畫面的瞬間，接到考場裡同一個鏡頭
    W.setLive(false); W.setScreen(null, false);                // 正在考試的人在閃光中離場，考場留給我們觀摩
    gsap.fromTo("#flash", { opacity: 0.4 }, { opacity: 0, duration: 0.5, ease: "power2.out" });
    onDone?.();
    diving = false;
  });
}

// ---------- 套用某一步的 3D 狀態 ----------
const slides = $$(".slide"), ids = slides.map((s) => s.dataset.id);
function stateAt(si, step) {
  const st = { layers: {}, figs: {} };
  for (let s = 0; s <= si; s++) {
    const steps = SLIDES[ids[s]]?.steps || [{}], last = s === si ? step : steps.length - 1;
    for (let k = 0; k <= last; k++) {
      const x = steps[k] || {};
      if (x.cam) st.cam = x.cam;
      st.via = s === si && k === step ? x.via : null;
      st.isNew = s === si && k === step;
      if (x.audience !== undefined) st.audience = x.audience;
      st.hideCards = s === si && !!x.hideCards ? true : (s === si ? st.hideCards : false);
      if (x.hl) st.hl = x.hl;
      if (x.routes) st.routes = x.routes;
      if (x.live !== undefined) st.live = x.live;
      if (x.screen !== undefined) st.screen = x.screen;
      if (x.door !== undefined) st.door = x.door;
      if (x.dual !== undefined) st.dual = x.dual;
      if (x.doorView !== undefined) st.doorView = x.doorView;
      if (x.debrief !== undefined) st.debrief = x.debrief;
      if (x.walls !== undefined) st.walls = x.walls;
      Object.assign(st.layers, x.layers || {});
      for (const [id, f] of Object.entries(x.figs || {})) st.figs[id] = { ...f, _new: s === si && k === step };
    }
  }
  return st;
}
const ROUTES = ["checkin", "toTeam", "teacherOut", "toObs", "obsToExam", "backToTeam", "toExamDoor"];
function apply3D(si, step, animate, prevSi) {
  const st = stateAt(si, step);
  const exploring = !!SLIDES[ids[si]]?.explore;
  const dive = exploring && animate && !X.active && ids[prevSi] === "brief";
  if (dive) {
    W.setExamWalls(true, 0.5);                                 // 推進途中考場牆先長高、變亮，螢幕畫面與落地畫面一致
    flyIntoScreen("screenNear", "liveView", () => { X.start(false); W.setLayer("eq", true, 0.8); });
  }
  else if (exploring) { if (!X.active) X.start(animate); }
  else {
    if (X.active) X.stop(animate);
    W.setExamWalls(!!st.walls, animate ? 1.2 : 0);
    const fov = POSE[st.cam]?.fov ?? 32;
    if (camera.fov !== fov) gsap.to(camera, { fov, duration: animate ? 1.4 : 0, ease: "power2.inOut", overwrite: "auto", onUpdate: () => camera.updateProjectionMatrix() });
    if (animate && st.via) flyIntoScreen(st.via, st.cam); else flyTo(st.cam, animate);
  }
  if (!exploring) W.setDoorScene(st.door ?? null, animate && st.isNew);
  // 左右畫面比例：某一步可以自己指定 split（例如第 14 頁兒子跑到 MRI 後只留 MRI 畫面）；同一頁換步時平滑滑動
  const stepSplit = SLIDES[ids[si]]?.steps?.[step]?.split ?? SLIDES[ids[si]]?.split ?? 0.5;
  W.setDualSplit(stepSplit, animate && si === prevSi ? 1.0 : 0);
  const dualPrev = W.isDual();
  W.setDual(st.dual ?? null, animate && st.isNew);
  W.setDoorView(st.dual == null ? st.doorView ?? null : null, animate && st.isNew);
  if (animate && dualPrev !== W.isDual()) gsap.fromTo("#flash", { opacity: 0.6 }, { opacity: 0, duration: 0.7, ease: "power2.out" });   // 切換雙畫面時閃一下
  W.setDebrief(st.debrief ?? null, animate && st.isNew);
  W.setAudience(!!st.audience);
  if (!dive) W.setScreen(st.screen ?? null, animate);       // 飛入時螢幕由 fadeToLive 慢慢換成即時畫面
  W.highlight(st.hl || []);
  if (!dive) W.setLive(!!st.live);
  if (st.live && st.cam === "liveView") W.setLayer("live", false, 0);
  for (const r of ROUTES) W.showRoute(r, (st.routes || []).includes(r), animate);
  for (const [l, on] of Object.entries(st.layers)) { if (dive && l === "eq") continue; W.setLayer(l, !!on, animate ? 0.6 : 0); }  // 飛入時標籤等落地才出現
  for (const id of ["team", "teacher", "team2"]) {
    const f = st.figs[id];
    if (!f) { W.placeFig(id, { hide: true }, false); continue; }
    const live = animate && f._new;
    W.placeFig(id, f.fadeOut && !live ? { hide: true } : f, live);
  }
}

// ---------- 頁面文字：逐步揭露 ----------
const splits = new Map();
function titleIn(sl) {
  const h = $("h2", sl); if (!h) return;
  if (!splits.has(h)) splits.set(h, new SplitText(h, { type: "chars", mask: "chars" }));
  gsap.fromTo(splits.get(h).chars, { yPercent: 110 }, { yPercent: 0, duration: 0.7, stagger: 0.03, ease: "power3.out", delay: 0.25 });
}
// 注意：不可對 3D 外框（.space-item）設定 transform，那是 CSS3DRenderer 在控制
const frags = (sl) => [...(sl._space || []).flatMap((w) => $$(".f", w)), ...$$(".f", sl)];
function showFrags(sl, step, animate) {
  for (const el of frags(sl)) {
    const s = +(el.dataset.s || 0), on = s <= step;
    if (!animate || !on || el._shown) { gsap.set(el, on ? { opacity: 1, y: 0, filter: "none" } : { opacity: 0 }); el._shown = on; continue; }
    el._shown = true;
    gsap.fromTo(el, { opacity: 0, y: 26, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out", delay: s === 0 ? 0.45 : 0.1 });
  }
}

// ---------- 第 3 頁：手機、3C 收走 ----------
function phonesStep(sl, on, animate) {
  const ph = $$(".phone", sl), box = $(".locker-box", sl), stamp = $(".stamp", sl);
  if (!ph.length) return;
  gsap.killTweensOf([...ph, stamp]);
  if (!on) { gsap.set(ph, { x: 0, y: 0, scale: 1, opacity: 1 }); gsap.set(stamp, { opacity: 0, scale: 1.6 }); return; }
  const bb = box.getBoundingClientRect(), k = Math.min(innerWidth / 1600, innerHeight / 900);
  const target = (el) => { const r = el.getBoundingClientRect(); return { x: (bb.left + bb.width / 2 - (r.left + r.width / 2)) / k, y: (bb.top + bb.height / 2 - (r.top + r.height / 2)) / k }; };
  const end = (el) => ({ ...target(el), scale: 0.3, opacity: 0 });
  if (!animate) { ph.forEach((el) => gsap.set(el, end(el))); gsap.set(stamp, { opacity: 1, scale: 1 }); return; }
  ph.forEach((el, i) => gsap.to(el, { ...end(el), duration: 0.8, delay: 0.5 + i * 0.18, ease: "power2.in", onComplete: () => sfx.stow() }));
  gsap.fromTo(stamp, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.45, delay: 0.5 + ph.length * 0.18 + 0.8, ease: "back.out(2)" });
}
// ---------- 第 8 頁：讀題幹 30 秒倒數 ----------
const stemTimer = $("#stemTimer"); let stemTw = null;
function stemCountdown(run) {
  stemTw?.kill(); stemTw = null;
  sfx.ticks(run);                                         // 每秒滴答（與倒數同步）
  const show = (v) => { stemTimer.textContent = `0:${String(Math.ceil(v)).padStart(2, "0")}`; stemTimer.classList.toggle("over", v <= 0); };
  if (!run) { show(30); return; }
  const c = { v: 30 }; show(30);
  stemTw = gsap.to(c, { v: 0, duration: 30, ease: "none", delay: 0.6, onUpdate: () => show(c.v), onComplete: () => sfx.chime() });
}
// ---------- 第 10 頁：控制台影像小視窗（示意圖） ----------
{
  const c = (id) => document.getElementById(id);
  drawCT(c("ctExpect"), { contrast: true }); drawCT(c("ctActual"), { contrast: false });
  drawMRI(c("mriClear"), { blur: false }); drawMRI(c("mriBlur"), { blur: true });
}
function scanHook(sl, step) {
  for (const ol of $$(".dual-list", sl)) {
    const items = $$("li", ol), now = Math.min(step, items.length - 1);
    items.forEach((li, i) => { li.className = i < now ? "done" : i === now ? "now" : ""; });
  }
  sl.dataset.step = step;                                   // 小視窗與警示依步驟切換（見 deck.css）
}
// ---------- 第 12、13 頁：清單（li 的 data-s＝從第幾步開始）、安妮監視器放大視窗 ----------
function listHook(sl, step) {
  for (const ol of $$(".dual-list", sl)) {
    const items = $$("li", ol); let now = 0;
    items.forEach((li, i) => { if (+(li.dataset.s ?? i) <= step) now = i; });
    items.forEach((li, i) => { li.className = i < now ? "done" : i === now ? "now" : ""; });
  }
  sl.dataset.step = step;
  const slot = $(".mw-slot", sl); if (slot && annieMonitorCanvas.parentNode !== slot) slot.appendChild(annieMonitorCanvas);
}
// ---------- 背景音樂：每頁（每一步）用哪一段 [檔名, 相對音量, 是否從頭播] ----------
function musicCue(id, step) {
  switch (id) {
    case "cover": return ["01_opening"];                                    // ① 開場
    case "exam": return step === 0 ? ["02_flow"] : step <= 2 ? ["03_countdown"] : ["04_exam"];   // ③ 讀題幹 30 秒 → 分組進考場
    case "dual": case "scan": case "handle": return ["04_exam"];             // ④ 考試進行
    case "arrest": return ["05_worse"];                                      // ⑤ 病況惡化
    case "cpr": return ["06_emergency"];                                     // ⑥ 急救高峰
    case "family": return ["06_emergency", step >= 3 ? 0.5 : 1];             //    999 團隊到場後慢慢收掉
    case "debrief": case "trm": case "isbar": case "points": return ["07_review"];         // ⑦-a Debrief、回顧
    case "credits": return ["08_credits", 1, true];                          // ⑦-b 片尾（每次進來從頭播）
    default: return ["02_flow"];                                             // ② 當天流程（第 2–7 頁）
  }
}

// ---------- Debrief：倒數碼錶（快轉）＋ERCP 依序亮起＋考官問題依序出現 ----------
let dbTw = null;
function stopDebriefTimer() { dbTw?.kill(); dbTw = null; }
function debriefHook(sl, step, animate) {
  stopDebriefTimer();
  sl.dataset.step = step;
  const now = Math.min(step, 3);
  $$(".db-list > li", sl).forEach((li) => { const s = +li.dataset.s; li.className = s < now ? "done" : s === now ? "now" : ""; });
  const big = $(".db-timer b", sl), cap = $(".db-timer span", sl), ercp = $$(".ercp i", sl), qs = $$(".qa p", sl);
  const show = (sec) => { const v = Math.max(0, Math.ceil(sec)); big.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; big.classList.toggle("low", v <= 10); W.setDebriefTimer(sec); };
  const mark = (els, k) => els.forEach((e, i) => e.classList.toggle("on", i <= k));
  cap.textContent = step === 2 ? "考官問答" : "團隊自行 debrief";
  if (step === 1 || step === 2) {
    const total = step === 1 ? 180 : 120, dur = step === 1 ? 10 : 8, els = step === 1 ? ercp : qs;
    mark(step === 1 ? qs : ercp, step === 1 ? -1 : 3);
    if (!animate) { show(0); mark(els, els.length - 1); return; }
    const c = { s: total }; show(total); mark(els, 0);
    dbTw = gsap.to(c, { s: 0, duration: dur, ease: "none", delay: 0.4,
      onUpdate: () => { show(c.s); mark(els, Math.min(els.length - 1, Math.floor((1 - c.s / total) * els.length))); },
      onComplete: () => sfx.timerEnd() });
    return;
  }
  show(step === 0 ? 180 : 0); mark(ercp, step >= 2 ? 3 : -1); mark(qs, step >= 3 ? 1 : -1);
}

// ---------- 第 17 頁：電影片尾（黑邊、變暗、名單捲動、結語、煙火） ----------
let crTl = null, fwRaf = 0;
function fwStop() { cancelAnimationFrame(fwRaf); fwRaf = 0; const c = $(".cr-fw"); c?.getContext("2d").clearRect(0, 0, c.width, c.height); }
function stopCredits() { crTl?.kill(); crTl = null; fwStop(); }
function fireworks(cv) {
  fwStop();
  const g = cv.getContext("2d"), parts = [], COLORS = ["#fcd34d", "#f9a8d4", "#93c5fd", "#86efac", "#fda4af", "#c4b5fd"];
  const t0 = performance.now(); let last = t0, next = 0, n = 0;
  const burst = () => {
    const x = Math.random() < 0.5 ? 160 + Math.random() * 380 : 1060 + Math.random() * 380, y = 130 + Math.random() * 280, c = COLORS[n++ % COLORS.length];
    for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 170; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c }); }
    sfx.pop();
  };
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), el = (now - t0) / 1000; last = now;
    if (el < 6 && el >= next) { burst(); next = el + 0.45 + Math.random() * 0.5; }
    g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.vx *= 0.985; p.vy = p.vy * 0.985 + 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.55;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      g.globalAlpha = p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 2.4, 0, 7); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (el < 6 || parts.length) fwRaf = requestAnimationFrame(tick); else { g.clearRect(0, 0, cv.width, cv.height); fwRaf = 0; }
  };
  fwRaf = requestAnimationFrame(tick);
}
function creditsHook(sl, step, animate) {
  stopCredits();
  const roll = $(".cr-roll", sl), end = $(".cr-end", sl), dim = $(".cr-dim", sl), [top, bot] = $$(".cr-bar", sl), H = roll.offsetHeight;
  const finale = () => { sfx.finale(); fireworks($(".cr-fw", sl)); };
  if (step === 1 || !animate) {                             // 最後一張（→ 跳過捲動，或倒退回來）
    gsap.set(top, { y: 100 }); gsap.set(bot, { y: -100 }); gsap.set(dim, { opacity: 0.55 }); gsap.set(roll, { y: -H - 60 });
    gsap.to(end, { opacity: 1, duration: animate ? 1 : 0 });
    if (animate) finale();
    return;
  }
  gsap.set([top, bot], { y: 0 }); gsap.set(dim, { opacity: 0 }); gsap.set(roll, { y: 900 }); gsap.set(end, { opacity: 0 });
  crTl = gsap.timeline();
  crTl.to(top, { y: 100, duration: 1.2, ease: "power2.inOut" }, 0.2).to(bot, { y: -100, duration: 1.2, ease: "power2.inOut" }, 0.2)   // 上下黑邊：電影寬銀幕
    .to(dim, { opacity: 0.55, duration: 3, ease: "sine.inOut" }, 5)                                          // 謝幕鞠躬後，3D 慢慢變暗
    .to(roll, { y: -H - 60, duration: (900 + H + 60) / 58, ease: "none" }, 5.6)                             // 名單由下往上捲
    .to(end, { opacity: 1, duration: 1.6, ease: "power2.out" }, ">-0.4")
    .call(finale, null, "<0.3");
}
const HOOKS = {
  credits: creditsHook,
  debrief: debriefHook,
  arrest: listHook,
  cpr: listHook,
  family: listHook,
  trm: (sl, step) => { sl.dataset.step = step; },
  points: (sl, step) => { $$(".pt-list li[data-s]", sl).forEach((li) => { const s = +li.dataset.s; li.className = s < step ? "done" : s === step ? "now" : ""; }); },          // 文字卡亮暗依步驟（見 deck.css）
  isbar: (sl, step) => { sl.dataset.step = step; $$(".isbar-list li", sl).forEach((li) => { const s = +li.dataset.s; li.className = s < step ? "done" : s === step ? "now" : ""; }); },
  scan: scanHook,
  handle: scanHook,
  dual: (sl, step) => { sl.dataset.step = step; $$(".dual-list li", sl).forEach((li) => { const s = +li.dataset.s; li.className = s < step ? "done" : s === step ? "now" : ""; }); },   // 同意書小視窗依步驟顯示（見 deck.css）
  exam: (sl, step, animate) => {
    if (step === 1) { if (animate) stemCountdown(true); } else if (step === 0) stemCountdown(false);
    $(".side", sl).classList.toggle("done", step >= 3);          // 分組之後收起題幹與考官卡，留位置給分組與標準病人
    sl.dataset.step = step;                                       // 第 4 步只看 MRI、第 5 步左右兩個畫面（鏡頭標籤見 deck.css）
  },
  brief: (sl, step, animate) => gsap.to($("h2", sl), { opacity: step >= 1 && step < W.BRIEF_COUNT ? 0 : 1, duration: animate ? 0.5 : 0 }),  // 推近看投影片時收起標題
  team: (sl, step, animate) => phonesStep(sl, step >= 3, animate && step === 3),
};

// ---------- 換頁 ----------
let si = 0, step = 0;
const nSteps = (i) => (SLIDES[ids[i]]?.steps || [{}]).length;
const chip = $("#chip"), pageno = $("#pageno"), bar = $("#progress i");
function render(prevSi, animate) {
  slides.forEach((s, i) => {
    const on = i === si;
    if (on && !s.classList.contains("active")) {
      const late = animate && SLIDES[ids[i]]?.enterDelay && ids[prevSi] === "brief" ? SLIDES[ids[i]].enterDelay : 0.15;
      s.classList.add("active"); gsap.fromTo(s, { opacity: 0 }, { opacity: 1, duration: animate ? 0.5 : 0, delay: animate ? late : 0 });
      (s._space || []).forEach((w) => { w.style.visibility = "visible"; });
      if (animate) titleIn(s);
    } else if (!on && s.classList.contains("active")) {
      s.classList.remove("active"); gsap.to(s, { opacity: 0, duration: animate ? 0.35 : 0 });
      (s._space || []).forEach((w) => gsap.to(w, { opacity: 0, duration: 0.4, onComplete: () => { w.style.visibility = "hidden"; } }));
      frags(s).forEach((el) => { el._shown = false; });
    }
  });
  const sl = slides[si];
  showFrags(sl, step, animate);
  apply3D(si, step, animate, prevSi);
  HOOKS[ids[si]]?.(sl, step, animate);
  // 背景音樂（依情境切換、交叉淡入淡出）＋與畫面同步的音效層
  const [mName, mLevel = 1, mRestart = false] = musicCue(ids[si], step);
  bgm.set(mName, { level: mLevel, restart: mRestart });
  sfx.monitor(ids[si] === "arrest", () => annieVitals);                       // 第 12 頁：監視器嗶聲跟著心跳變慢
  sfx.pulse((ids[si] === "cpr" && step >= 2) || ids[si] === "family");        // 第 13、14 頁：壓胸節奏
  if (animate && ids[si] === "cpr" && step === 4) setTimeout(() => sfx.paging(), 300);   // 全院廣播：廣播鈴＋「地下室，MRI，999」語音
  else if (ids[si] !== "cpr" || step < 4) sfx.stopPaging();                                // 倒退或離開第 13 頁就停掉廣播
  // 第 14 頁：兒子台詞語音（前 3 步各一句；delay＝配合 3D 動作的秒數，字幕見 index.html .son-line）
  const SON_LINE = [1.8, 0.3, 1.0];
  if (animate && ids[si] === "family" && step < 3) sfx.line(`assets/voice/son_${step + 1}.mp3`, SON_LINE[step]);
  else if (!animate || ids[si] !== "family" || step >= 3) sfx.stopLine();
  if (ids[si] !== "exam" && stemTw) stemCountdown(false);      // 離開第 8 頁就停掉倒數
  if (ids[si] !== "credits") stopCredits();
  if (ids[si] !== "debrief") stopDebriefTimer();                    // 離開第 17 頁就停掉片尾捲動與煙火
  const c = sl.dataset.chip || "";
  chip.textContent = c; chip.classList.toggle("on", !!c);
  pageno.textContent = `${si + 1} / ${slides.length}`;
  const total = slides.reduce((a, _, i) => a + nSteps(i), 0), done = slides.slice(0, si).reduce((a, _, i) => a + nSteps(i), 0) + step + 1;
  bar.style.width = `${(done / total) * 100}%`;
  document.body.dataset.slide = ids[si];
}
function go(dir) {
  sfx.unlock();
  const prev = si;
  if (dir > 0 && si === 0 && step === 0 && !bgm.started) { bgm.start(); return; }   // 封面第一次按 →：先放開場音樂，再按一次才往下
  if (dir > 0) {
    if (step < nSteps(si) - 1) step++;
    else if (si < slides.length - 1) { si++; step = 0; }
    else return;
    render(prev, true);                                        // 換頁、換步不再發出「叮」聲（使用者只要背景音樂）
  } else {
    if (step > 0) step--;
    else if (si > 0) { si--; step = nSteps(si) - 1; }
    else return;
    render(prev, false);
    if (SLIDES[ids[si]]?.explore) return;
    flight?.kill(); const st = stateAt(si, step); const dur = flyTo(st.cam, true);
    if (si !== prev) (slides[si]._space || []).forEach((w) => gsap.fromTo(w, { opacity: 0 }, { opacity: 1, duration: 0.8, delay: dur }));
  }
}
let loading = true;                                           // true＝載入中（不接受按鍵）；"ready"＝載完，等按 →
addEventListener("keydown", (e) => {
  if (loading) {
    e.preventDefault();
    if (e.key === "p" || e.key === "P") { setLite(!W.isLite(), true); return; }
    if (loading === "ready" && ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) dismissLoader();
    return;
  }
  if (diving) { e.preventDefault(); return; }               // 飛入大螢幕途中不接受按鍵
  if (X.active) {                                   // 探索中：方向鍵／WASD 走路，Enter／PageDown 下一頁
    if (X.keydown(e)) { e.preventDefault(); return; }
    if (["Enter", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); return; }
    if (["PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); return; }
  }
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(1); }
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(-1); }
  else if (e.key === "m" || e.key === "M") { $("#mute").classList.toggle("off", sfx.toggleMute()); }
  else if (e.key === "f" || e.key === "F") { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
  else if (e.key === "Home") { si = 0; step = 0; render(null, false); }
  else if (e.key === "p" || e.key === "P") setLite(!W.isLite(), true);
});
addEventListener("click", (e) => {
  if (loading) { if (loading === "ready") dismissLoader(); return; }
  if (!X.active && !e.target.closest("button,a")) go(1);
});
$("#mute").addEventListener("click", (e) => { e.stopPropagation(); sfx.unlock(); $("#mute").classList.toggle("off", sfx.toggleMute()); });

// ---------- 第 5 頁：第一人稱探索 HUD（所在位置、每間 3 分鐘倒數、小地圖） ----------
const ROOM_NAME = { ct: "CT 室（檢查室 A）", mri: "MRI 室（檢查室 B）", wait: "等候區", corr: "走道" };
const timers = { ct: 180, mri: 180 };
const exRoom = $("#exRoom"), exTimer = $("#exTimer"), mm = $("#minimap"), mctx = mm.getContext("2d");
const X = createExplore({ W, cam, camera, sfx, onRoom: (r) => {
  exRoom.textContent = ROOM_NAME[r] || "考場";
  exRoom.dataset.room = r || "";
} });
const _start = X.start;
X.start = (animate, o) => { timers.ct = 180; timers.mri = 180; exRoom.textContent = ROOM_NAME.ct; exRoom.dataset.room = "ct"; _start(animate, o); };
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function drawMinimap() {
  const ox = 284, oz = 197, k = mm.width / 164;
  const R = (x1, z1, x2, z2, c) => { mctx.fillStyle = c; mctx.fillRect((x1 - ox) * k, (z1 - oz) * k, (x2 - x1) * k, (z2 - z1) * k); };
  mctx.clearRect(0, 0, mm.width, mm.height);
  R(292, 205, 440, 270, "#f6b98c"); R(292, 270, 327, 300, "#d6dbe3"); R(292, 300, 344, 370, "#bfe0ad"); R(344, 300, 440, 370, "#c9b8f2");
  for (const o of W.obstacles) R(o[0], o[1], o[2], o[3], "rgba(30,41,59,.85)");
  R(286, 241, 294, 254, "#ef4444");
  mctx.font = `800 ${13}px "PingFang TC",sans-serif`; mctx.fillStyle = "#0f172a"; mctx.textAlign = "center";
  mctx.fillText("CT 室", (366 - ox) * k, (262 - oz) * k); mctx.fillText("MRI 室", (410 - ox) * k, (362 - oz) * k);
  mctx.fillText("等候區", (318 - ox) * k, (296 + 16 - oz) * k + 40); mctx.fillText("走道", (309 - ox) * k, (288 - oz) * k);
  const S = X.state, px = (S.x - ox) * k, pz = (S.z - oz) * k;
  mctx.save(); mctx.translate(px, pz); mctx.rotate(S.yaw);
  mctx.fillStyle = "rgba(56,189,248,.25)"; mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 34, -0.55, 0.55); mctx.closePath(); mctx.fill();
  mctx.fillStyle = "#0284c7"; mctx.strokeStyle = "#fff"; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(10, 0); mctx.lineTo(-7, -7); mctx.lineTo(-3, 0); mctx.lineTo(-7, 7); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

// ---------- 效能模式（P 切換；網址加 ?lite=1 也會開；會記住在這台電腦） ----------
const toast = $("#toast"); let toastT = 0;
function say(msg, sec = 3) { toast.textContent = msg; toast.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("on"), sec * 1000); }
function setLite(on, tell) {
  W.setLite(on);
  try { localStorage.setItem("deckLite", on ? "1" : "0"); } catch {}
  if (tell) say(on ? "效能模式：開（關閉陰影、降低解析度）" : "效能模式：關（完整畫質）");
}
{
  let saved = null; try { saved = localStorage.getItem("deckLite"); } catch {}
  if (new URLSearchParams(location.search).has("lite") || saved === "1") setLite(true);
}
// 畫面不順偵測：開始後若連續 5 秒平均低於每秒 24 格，提示一次可以按 P
const fps = { n: 0, t: 0, low: 0, told: false };
function watchFps(dt) {
  if (loading || fps.told || W.isLite()) return;
  fps.n++; fps.t += dt;
  if (fps.t < 1) return;
  const v = fps.n / fps.t; fps.n = 0; fps.t = 0;
  fps.low = v < 24 ? fps.low + 1 : 0;
  if (fps.low >= 5) { fps.told = true; say("畫面不夠順？按 P 開效能模式", 6); }
}

// ---------- 開始 ----------
lift($(".cover-title"), POSE.cover, { D: 520, turn: 0.18, size: 0.92 });
const t0 = performance.now();
gsap.ticker.add(() => {
  const now = performance.now(), t = (now - t0) / 1000, dt = (now - (window._lastT || now)) / 1000; window._lastT = now;
  W.frame(now);
  watchFps(dt);
  const walking = X.update(dt);
  if (walking) {
    const r = X.state.room;
    if (r in timers) {
      timers[r] = Math.max(0, timers[r] - dt);
      exTimer.textContent = timers[r] > 0 ? `觀摩剩餘 ${fmt(timers[r])}` : "時間到";
      exTimer.classList.toggle("over", timers[r] <= 0);
    } else exTimer.textContent = "";
    drawMinimap();
  }
  // 待機微幅漂移，讓畫面有呼吸感
  const k = X.active ? 0 : cam.pos.distanceTo(cam.look) / 500;
  camera.position.set(cam.pos.x + Math.sin(t * 0.13) * 7 * k, cam.pos.y + Math.sin(t * 0.21) * 3 * k, cam.pos.z + Math.cos(t * 0.11) * 6 * k);
  camera.lookAt(cam.look);
  if (W.isDual()) W.renderDual(); else W.renderer.render(W.scene, camera);
  css3d.render(cssScene, camera);
});
render(null, false);
gsap.set(slides[0], { opacity: 0 });
flyTo("cover", false); cam.pos.copy(V(POSE.coverStart.pos)); cam.look.copy(V(POSE.coverStart.look));
// 封面開場：載入畫面淡出後，鏡頭飛到封面位置
function intro() {
  gsap.to(slides[0], { opacity: 1, duration: 1.2, delay: 0.3 });
  flight = gsap.to(cam.pos, { x: POSE.cover.pos[0], y: POSE.cover.pos[1], z: POSE.cover.pos[2], duration: 4.5, ease: "power2.out" });
  gsap.to(cam.look, { x: POSE.cover.look[0], y: POSE.cover.look[1], z: POSE.cover.look[2], duration: 4.5, ease: "power2.out" });
}

// ---------- 開場載入畫面：全部素材載完才能開始 ----------
const ld = $("#loader");
if (location.protocol === "file:") {
  $(".ld-warn", ld).textContent = "請雙擊 Start-Windows.bat（Mac：Start-Mac.command）開啟；直接點 index.html 會載不到人物與音樂";
}
preloadAll(({ ratio, failed, phase }) => {
  const pct = Math.floor(ratio * 100);
  $(".ld-bar i", ld).style.width = `${pct}%`;
  $(".ld-pct", ld).textContent = `${pct}%`;
  $(".ld-msg", ld).textContent = phase === "prepare" ? "準備人物模型" : "載入中";
  if (failed) $(".ld-warn", ld).textContent = `有 ${failed} 個素材載入失敗，仍可開始`;
}).then(({ failed }) => {
  ld.classList.add("ready"); loading = "ready";
  $(".ld-msg", ld).textContent = failed ? "載入完成（部分素材失敗）" : "載入完成";
  $(".ld-pct", ld).textContent = "100%"; $(".ld-bar i", ld).style.width = "100%";
});
function dismissLoader() {
  loading = false;
  ld.classList.add("hide");
  sfx.unlock(); bgm.start();                                   // 這一下按鍵同時讓開場音樂響起
  intro();
}
// 除錯用：直接跳到某頁某步（不播動畫）
const jumpTo = (id, k = 0) => { const p = si; si = Math.max(0, ids.indexOf(id)); step = Math.min(k, nSteps(si) - 1); render(p, false); flyTo(stateAt(si, step).cam, false); };
window.__deck = { go, W, cam, X, bgm, setLite, jumpTo };
