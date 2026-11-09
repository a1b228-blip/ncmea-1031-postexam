// 觀摩教室大螢幕：考官說明「擬真情境類競賽參賽注意事項說明」
// 直接播放主辦單位原始投影片（NCMEA醫事放射組第二場.pptx 匯出的 14 張圖，未改動內容）。
// 第 4 張的 S1000 介紹影片，在原投影片的影片框位置播放。
import * as THREE from "three";
import gsap from "gsap";
import { bgm } from "./audio.js";

const W = 1920, H = 1080, N = 14;
const SRC = Array.from({ length: N }, (_, i) => `assets/brief/s${String(i + 1).padStart(2, "0")}.jpg`);
const VIDEO = { slide: 3, src: "assets/brief/s04-video.mp4", rect: [354, 274, 1212, 682] };   // 原投影片影片框（1920×1080 座標）

export function createBriefing() {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const imgs = SRC.map((src) => { const im = new Image(); im.src = src; return im; });
  const video = Object.assign(document.createElement("video"), { src: VIDEO.src, playsInline: true, preload: "auto" });
  // 影片有聲音時，背景音樂自動壓低；停下或播完再恢復
  video.addEventListener("play", () => bgm.duck(!video.muted));
  for (const ev of ["pause", "ended"]) video.addEventListener(ev, () => bgm.duck(false));

  let cur = -1, tw = null;
  const ready = (i) => imgs[i].complete && imgs[i].naturalWidth > 0;
  function paint(i, alpha = 1) {
    if (!ready(i)) return;
    g.globalAlpha = alpha; g.drawImage(imgs[i], 0, 0, W, H);
    if (i === VIDEO.slide && video.readyState >= 2 && video.currentTime > 0) { const [x, y, w, h] = VIDEO.rect; g.drawImage(video, x, y, w, h); }
    g.globalAlpha = 1;
  }
  function stopVideo() { if (!video.paused) video.pause(); }
  function show(i, animate) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === cur) return;
    const prev = cur; cur = i;
    tw?.kill();
    if (i === VIDEO.slide) { video.currentTime = 0; video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }); }
    else stopVideo();
    if (!ready(i)) { imgs[i].onload = () => { if (cur === i) { paint(i); tex.needsUpdate = true; } }; return; }
    if (!animate || prev < 0 || !ready(prev)) { paint(i); tex.needsUpdate = true; return; }
    const p = { a: 0 };
    tw = gsap.to(p, { a: 1, duration: 0.5, ease: "power1.inOut", onUpdate: () => { paint(prev); paint(i, p.a); tex.needsUpdate = true; } });
  }
  // 影片播放中：每一格重畫影片框
  function update() {
    if (cur === VIDEO.slide && !video.paused && !tw?.isActive()) { paint(cur); tex.needsUpdate = true; }
  }
  imgs[0].onload = () => { if (cur === 0) { paint(0); tex.needsUpdate = true; } };
  show(0, false);
  return { texture: tex, show, update, stopVideo, count: N };
}
