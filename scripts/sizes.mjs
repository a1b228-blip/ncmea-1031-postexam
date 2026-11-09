// 建置前先量好要預先載入的檔案大小（給載入畫面算百分比用）→ 寫到 src/preload-list.json
// npm run build 會自動先跑這支。
import { readdirSync, statSync, writeFileSync } from "node:fs";

const files = [];
const add = (dir, re) => { for (const f of readdirSync(dir).sort()) if (re.test(f)) files.push([`${dir}/${f}`, statSync(`${dir}/${f}`).size]); };
add("assets/people", /\.glb$/);
add("assets/music", /\.mp3$/);
add("assets/voice", /\.mp3$/);
add("assets/brief", /\.mp4$/);
writeFileSync("src/preload-list.json", JSON.stringify(files, null, 1) + "\n");
console.log(`preload-list.json：${files.length} 個檔案，共 ${(files.reduce((a, [, s]) => a + s, 0) / 1048576).toFixed(1)} MB`);
