// 第一人稱考場觀摩：像打電動一樣用鍵盤走動
//   ↑／W 前進、↓／S 後退、←→ 轉向、A／D 側移、Shift 加速、滑鼠拖曳看四周
// 牆壁與儀器會擋住，不會穿過去；只能在考場（CT 室、走道、等候區、MRI 室）裡走。
import gsap from "gsap";

export function createExplore({ W, cam, camera, sfx, onRoom }) {
  const EYE = 23, R = 3.6, SPEED = 26, TURN = 1.9;
  const S = { on: false, x: 312, z: 258, yaw: 0, pitch: -0.1, room: null };
  const keys = new Set();
  const B = W.EXAM_BOUNDS;

  function blocked(x, z) {
    if (x < B[0] + R || x > B[2] - R || z < B[1] + R || z > B[3] - R) return true;
    for (const o of W.obstacles) if (x > o[0] - R && x < o[2] + R && z > o[1] - R && z < o[3] + R) return true;
    return false;
  }
  function roomAt(x, z) {
    for (const id of ["ct", "corr", "wait", "mri"]) { const [x1, z1, x2, z2] = W.ROOMS[id]; if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return id; }
    return null;
  }
  const lookOf = () => [S.x + Math.cos(S.yaw) * Math.cos(S.pitch) * 20, EYE + Math.sin(S.pitch) * 20, S.z + Math.sin(S.yaw) * Math.cos(S.pitch) * 20];

  // 進入：鏡頭從目前位置降到眼睛高度，牆長高、視角放寬
  const START = { x: W.FP_START.x, z: W.FP_START.z, yaw: W.FP_START.yaw, pitch: W.FP_START.pitch };   // 與大螢幕畫面同一個鏡頭
  let enterTw = null;
  function start(animate, { dur = 1.8, ease = "power2.inOut" } = {}) {
    Object.assign(S, START); S.room = null;
    W.setExamWalls(true, animate ? dur : 0);
    const toP = [S.x, EYE, S.z], toL = lookOf();
    enterTw?.kill();
    if (!animate) { cam.pos.set(...toP); cam.look.set(...toL); camera.fov = 62; camera.updateProjectionMatrix(); S.on = true; return; }
    S.on = false;
    const tl = gsap.timeline({ onComplete: () => { S.on = true; } });
    tl.to(cam.pos, { x: toP[0], y: toP[1], z: toP[2], duration: dur, ease }, 0)
      .to(cam.look, { x: toL[0], y: toL[1], z: toL[2], duration: dur, ease }, 0)
      .to(camera, { fov: 62, duration: dur, ease, onUpdate: () => camera.updateProjectionMatrix() }, 0);
    enterTw = tl;
  }
  function stop(animate) {
    enterTw?.kill(); S.on = false; keys.clear();
    W.setExamWalls(false, animate ? 1.2 : 0);
    if (camera.fov !== 32) gsap.to(camera, { fov: 32, duration: animate ? 1.2 : 0, onUpdate: () => camera.updateProjectionMatrix() });
  }

  function update(dt) {
    if (!S.on) return false;
    dt = Math.min(dt, 0.05);
    const fwd = (keys.has("ArrowUp") || keys.has("w") ? 1 : 0) - (keys.has("ArrowDown") || keys.has("s") ? 1 : 0);
    const turn = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
    const side = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    S.yaw += turn * TURN * dt;
    const sp = SPEED * (keys.has("Shift") ? 1.8 : 1) * dt;
    const cx = Math.cos(S.yaw), cz = Math.sin(S.yaw);
    const dx = (cx * fwd - cz * side) * sp, dz = (cz * fwd + cx * side) * sp;
    if (dx && !blocked(S.x + dx, S.z)) S.x += dx;          // 分軸移動：撞牆時可以沿著牆滑動
    if (dz && !blocked(S.x, S.z + dz)) S.z += dz;
    const bob = fwd || side ? Math.sin(performance.now() / 140) * 0.35 : 0; // 走路時輕微上下晃
    cam.pos.set(S.x, EYE + bob, S.z); cam.look.set(...lookOf());
    const r = roomAt(S.x, S.z);
    if (r !== S.room) { S.room = r; onRoom?.(r); }
    return true;
  }

  // 鍵盤：探索中方向鍵與 WASD 給走路用
  const MOVE = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "Shift"]);
  const norm = (k) => (k.length === 1 ? k.toLowerCase() : k);
  function keydown(e) { const k = norm(e.key); if (!MOVE.has(k)) return false; keys.add(k); return true; }
  function keyup(e) { keys.delete(norm(e.key)); }
  addEventListener("keyup", keyup);
  addEventListener("blur", () => keys.clear());

  // 滑鼠拖曳看四周
  let drag = null;
  addEventListener("pointerdown", (e) => { if (S.on) drag = { x: e.clientX, y: e.clientY, yaw: S.yaw, pitch: S.pitch }; });
  addEventListener("pointermove", (e) => {
    if (!drag || !S.on) return;
    S.yaw = drag.yaw + (e.clientX - drag.x) * 0.005;
    S.pitch = Math.max(-0.9, Math.min(0.6, drag.pitch - (e.clientY - drag.y) * 0.004));
  });
  addEventListener("pointerup", () => { drag = null; });

  return { start, stop, update, keydown, state: S, get active() { return S.on || !!enterTw?.isActive(); } };
}
