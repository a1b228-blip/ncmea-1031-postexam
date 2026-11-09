// 開場載入畫面：把人物模型、背景音樂、廣播語音、說明影片全部先載完，才讓簡報開始。
// - 人物（.glb）：用 people.js 的同一個快取載入（載完也已經解析好，之後用到不會再下載）
// - 聲音、影片：整個檔案抓進記憶體（blob），再換給已經建立的 <audio>／<video>（bindSrc）
// 有檔案載入失敗也不會卡住：標註失敗數量，仍然可以開始。
import LIST from "./preload-list.json";
import { loadPerson } from "./people.js";

const blobs = new Map(), bound = new Map();
// 簡報裡的 <audio>／<video> 用這個設定來源：先用原本路徑，預先載入完成後自動換成記憶體裡的版本
export function bindSrc(el, path) {
  el.src = blobs.get(path) || path;
  if (!blobs.has(path)) { if (!bound.has(path)) bound.set(path, []); bound.get(path).push(el); }
  return el;
}
function swap(path, url) {
  blobs.set(path, url);
  for (const el of bound.get(path) || []) {
    if (!el.paused) continue;                       // 正在播放的不換（避免中斷）
    const t = el.currentTime; el.src = url; if (t) el.currentTime = t;
  }
  bound.delete(path);
}

// 下載失敗自動重試（最多 3 次）；重試時進度從 0 重新算
async function fetchBlob(path, onBytes, onRestart, tries = 3) {
  try { return await fetchOnce(path, onBytes); }
  catch (e) { if (tries <= 1) throw e; onRestart(); await new Promise((r) => setTimeout(r, 800)); return fetchBlob(path, onBytes, onRestart, tries - 1); }
}
async function fetchOnce(path, onBytes) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  const reader = res.body.getReader(), parts = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); onBytes(value.length); }
  return URL.createObjectURL(new Blob(parts, { type: res.headers.get("content-type") || "" }));
}

// onProgress({ ratio, failed, phase })；回傳 Promise（全部結束才 resolve，不會 reject）
export function preloadAll(onProgress) {
  const total = LIST.reduce((a, [, s]) => a + s, 0) || 1;
  const got = new Map(); let failed = 0, done = 0;
  const report = () => {
    const bytes = [...got.values()].reduce((a, b) => a + b, 0);
    onProgress({ ratio: Math.min(1, bytes / total), failed, phase: bytes >= total * 0.999 && done < LIST.length ? "prepare" : "load" });
  };
  const finish = (path, size) => { got.set(path, size); done++; report(); };
  const jobs = LIST.map(([path, size]) => {
    got.set(path, 0);
    const people = path.match(/^assets\/people\/(.+)\.glb$/);
    const job = people
      ? loadPerson(people[1], (e) => { got.set(path, Math.min(size, e.loaded)); report(); })
      : fetchBlob(path, (n) => { got.set(path, Math.min(size, got.get(path) + n)); report(); }, () => got.set(path, 0)).then((url) => swap(path, url));
    return job.then(() => finish(path, size), (err) => { console.warn("預先載入失敗：", path, err); failed++; finish(path, size); });
  });
  report();
  return Promise.all(jobs).then(() => ({ failed }));
}
