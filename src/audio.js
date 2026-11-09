// 音效（WebAudio 即時合成，不需音檔）：預設開啟、按 M 靜音。
// 聲音原則：清亮、柔和、5 秒內淡出，不用持續低頻嗡鳴。
import { bindSrc } from "./preload.js";
let ctx = null, master = null, wet = null, muted = false;
let tickT = null, monT = null, monGet = null, pulseT = null, paT = null, paVoice = null, lineT = null, lineA = null;

function ensure() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return ctx; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
  // 柔和回音：延遲＋回授＋低通
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.26;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
  wet = ctx.createGain(); wet.gain.value = 0.35;
  wet.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master);
  return ctx;
}

function tone(freq, at, { dur = 2.2, vol = 0.12, type = "sine" } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(master); g.connect(wet);
  o.start(at); o.stop(at + dur + 0.05);
}

export const sfx = {
  unlock() { ensure(); },
  get muted() { return muted; },
  toggleMute() {
    muted = !muted;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    bgm.refresh();
    return muted;
  },
  // ---------- 情境音效層（疊在背景音樂上，跟畫面同步） ----------
  // 第 8 頁讀題幹：每秒一聲滴答，最後 5 秒變亮
  ticks(on, n = 30, delay = 0.6) {
    clearTimeout(tickT); tickT = null;
    if (!on) return;
    let i = 0;
    const next = () => {
      if (i++ >= n) { tickT = null; return; }
      if (ensure() && !muted) { const last = i > n - 5; tone(last ? 1760 : 1320, ctx.currentTime, { dur: 0.09, vol: last ? 0.05 : 0.03, type: "triangle" }); }
      tickT = setTimeout(next, 1000);
    };
    tickT = setTimeout(next, delay * 1000);
  },
  // 第 12 頁：生理監視器的「嗶」跟著心跳（get() 回傳 { mode, hr }）；AF 不規則；心跳停止＝三連音警報（只響 4 次）
  monitor(on, get) {
    if (!on) { clearTimeout(monT); monT = null; return; }
    monGet = get; if (monT) return;
    let alarms = 0;
    const beat = () => {
      const v = monGet();
      if (v.mode !== "arrest") alarms = 0;
      if (v.mode === "arrest") {
        if (alarms++ >= 4) { monT = setTimeout(beat, 500); return; }
        if (ensure() && !muted) [0, 0.2, 0.4].forEach((d) => tone(988, ctx.currentTime + d, { dur: 0.16, vol: 0.05, type: "triangle" }));
        monT = setTimeout(beat, 2600); return;
      }
      if (ensure() && !muted) tone(v.mode === "af" ? 880 : 988, ctx.currentTime, { dur: 0.13, vol: 0.045 });
      const jit = v.mode === "af" ? 0.7 + Math.random() * 0.6 : 1;
      monT = setTimeout(beat, (60000 / Math.max(30, v.hr)) * jit);
    };
    beat();
  },
  // 第 13 頁全院廣播：三音廣播鈴（下行）→ 廣播語音「地下室，MRI，999」×3（Edge-TTS 女聲＋廣播喇叭音色）
  paging() {
    this.stopPaging();
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    [784, 659.25, 523.25].forEach((f, i) => tone(f, t + i * 0.42, { dur: 1.5, vol: 0.085 }));
    bgm.duck(true);                                     // 廣播時背景音樂壓低
    paT = setTimeout(() => {
      paVoice ||= bindSrc(new Audio(), "assets/voice/pa_999.mp3");
      paVoice.currentTime = 0; paVoice.volume = 1;
      paVoice.onended = () => bgm.duck(false);
      paVoice.play().catch(() => bgm.duck(false));
    }, 1400);
  },
  // 第 14 頁兒子台詞（Edge-TTS YunJhe 男聲）：delay 秒後播，播放時背景音樂壓低
  line(path, delay = 0) {
    this.stopLine();
    if (!ensure() || muted) return;
    lineT = setTimeout(() => {
      lineA = bindSrc(new Audio(), path); lineA.volume = 1;
      bgm.duck(true);
      lineA.onended = () => bgm.duck(false);
      lineA.play().catch(() => bgm.duck(false));
    }, delay * 1000);
  },
  stopLine() {
    clearTimeout(lineT); lineT = null;
    if (lineA) { if (!lineA.paused) bgm.duck(false); lineA.pause(); lineA = null; }
  },
  stopPaging() {
    clearTimeout(paT); paT = null;
    if (paVoice && !paVoice.paused) { paVoice.pause(); bgm.duck(false); }
  },
  // 第 13、14 頁壓胸：每分鐘 110 下的低沉短促「咚」（不是持續嗡鳴）
  pulse(on) {
    if (!on) { clearInterval(pulseT); pulseT = null; return; }
    if (pulseT) return;
    pulseT = setInterval(() => {
      if (!ctx || muted) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
    }, 60000 / 110);
  },
  // 換頁鏡頭飛行：柔和風聲（濾波雜訊，掃頻後淡出）
  whoosh(dur = 1.6) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(380, t); bp.frequency.exponentialRampToValueAtTime(1300, t + dur * 0.45); bp.frequency.exponentialRampToValueAtTime(520, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  },
  // 逐步揭露：兩音清亮上行
  step() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    tone(784, t, { dur: 1.2, vol: 0.07 }); tone(1175, t + 0.07, { dur: 1.4, vol: 0.055 });
  },
  // 段落完成／抵達：上行琶音＋回音，約 3 秒淡出
  chime() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.09, { dur: 2.6 - i * 0.2, vol: 0.085 }));
  },
  // 片尾謝幕：清亮上行琶音＋柔和和弦，約 5 秒淡出
  finale() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, t + i * 0.14, { dur: 3.6 - i * 0.3, vol: 0.075 }));
    [523.25, 659.25, 783.99].forEach((f) => tone(f, t + 0.85, { dur: 4.2, vol: 0.035 }));
  },
  // Debrief 碼錶時間到：兩組短促的「嗶嗶」
  timerEnd() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    [0, 0.18, 0.55, 0.73].forEach((d) => tone(1318.5, t + d, { dur: 0.13, vol: 0.05, type: "triangle" }));
  },
  // 煙火：每朵一聲很輕的高音
  pop() {
    if (!ensure() || muted) return;
    tone(1400 + Math.random() * 700, ctx.currentTime, { dur: 0.9, vol: 0.022 });
  },
  // 收走手機：輕柔的「收納」兩音下行
  stow() {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    tone(988, t, { dur: 0.6, vol: 0.06, type: "triangle" }); tone(659, t + 0.12, { dur: 0.9, vol: 0.06, type: "triangle" });
  },
};

// ---------- 背景音樂（Pixabay 免費授權，見 assets/music/授權紀錄.md） ----------
// 各曲響度不同（-11 ～ -18 LUFS），GAIN 先把它們拉到差不多大聲；LEVEL＝整體背景音樂音量（壓在音效下面）
const GAIN = { "01_opening": 0.62, "02_flow": 0.46, "03_countdown": 0.71, "04_exam": 0.85, "05_worse": 0.67, "06_emergency": 0.74, "07_review": 1, "08_credits": 0.48 };
const LEVEL = 0.45, FADE = 1.6;
const tracks = {};
let curName = null, curLevel = 1, ducked = false;
const track = (name) => {
  if (!tracks[name]) {
    const a = bindSrc(new Audio(), `assets/music/${name}.mp3`);   // 載入畫面載完後自動換成記憶體裡的版本
    a.loop = name !== "08_credits"; a.preload = "auto"; a.volume = 0; a._target = 0;
    tracks[name] = a;
  }
  return tracks[name];
};
// 音量平滑變化：用一般計時器（分頁在背景時畫面更新會暫停，但音量仍要能淡入淡出）
function fadeTo(a, v, dur = FADE, onDone) {
  clearInterval(a._fade); a._target = v;
  const from = a.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
    a.volume = Math.max(0, Math.min(1, from + (v - from) * k));
    if (k >= 1) { clearInterval(a._fade); onDone?.(); }
  };
  a._fade = setInterval(step, 30); step();
}
const want = (name) => (muted ? 0 : GAIN[name] * LEVEL * curLevel * (ducked ? 0.2 : 1));
export const bgm = {
  // 切換到某一段音樂（交叉淡入淡出）；level＝這一段的相對音量；restart＝從頭播
  set(name, { level = 1, restart = false } = {}) {
    const same = name === curName;
    curLevel = level;
    if (!same && curName) { const old = track(curName); fadeTo(old, 0, FADE, () => { if (curName !== old._name) old.pause(); }); }
    curName = name;
    if (!name) return;
    const a = track(name); a._name = name;
    if (restart && !same) a.currentTime = 0;
    if (a.paused) a.play().then(() => { bgm.started = true; }).catch(() => {});   // 瀏覽器規定：第一次按鍵前不能出聲
    fadeTo(a, want(name), same ? 0.8 : FADE);
  },
  started: false,
  // 除錯用：目前每首的播放狀態與音量
  get state() { return { cur: curName, tracks: Object.fromEntries(Object.entries(tracks).map(([k, a]) => [k, { paused: a.paused, vol: +a.volume.toFixed(3), t: +a.currentTime.toFixed(1) }])) }; },
  // 封面第一次按鍵：先讓開場音樂響起（瀏覽器要按鍵後才能出聲）
  start() { this.started = true; if (curName) { const a = track(curName); a.play().catch(() => {}); fadeTo(a, want(curName)); } },
  // 播影片時把背景音樂壓低
  duck(on) { ducked = on; this.refresh(); },
  refresh() { if (curName) fadeTo(track(curName), want(curName), 0.4); },
};
