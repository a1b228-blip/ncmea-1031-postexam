import { GLTFExporter } from "../../node_modules/three/examples/jsm/exporters/GLTFExporter.js";
const T = window.__deck.W.THREE;
// 把畫面上某個範圍內看得到的東西（含擺好姿勢的人物）烘成世界座標的靜態網格，匯出 GLB 給 Blender
window.__heroExport = async function ({ box = [280, 296, 362, 374], ymax = 80, tallRooms = false, name = "hero_scene.glb" } = {}) {
  const W = window.__deck.W, scene = W.scene; scene.updateMatrixWorld(true);
  const out = new T.Scene(), v = new T.Vector3(), bb = new T.Box3();
  const R = new T.Box3(new T.Vector3(box[0], -5, box[1]), new T.Vector3(box[2], ymax, box[3]));
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  let n = 0, skipped = 0;
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !shown(o)) return;
    if (o.name === "wallBase" || o.name === "contactShadow") return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.transparent && m.opacity < 0.05)) return;
    bb.setFromObject(o); if (!bb.intersectsBox(R)) return;
    const src = o.geometry, pa = src.attributes.position; if (!pa) return;
    const g = new T.BufferGeometry(), pos = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); pos.set([v.x, v.y, v.z], i * 3); }
    g.setAttribute("position", new T.BufferAttribute(pos, 3));
    if (tallRooms) {                                       // 一般教室的矮牆（高 9、厚 2）拉成真實牆高 36
      let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); y0 = Math.min(y0, pos[i + 1]); y1 = Math.max(y1, pos[i + 1]); z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
      if (Math.abs(y0) < 0.05 && Math.abs(y1 - 9) < 0.05 && Math.min(x1 - x0, z1 - z0) <= 2.1 && Math.max(x1 - x0, z1 - z0) >= 10) for (let i = 1; i < pos.length; i += 3) pos[i] *= 4;
    }
    for (const k of ["uv", "color"]) if (src.attributes[k]) g.setAttribute(k, src.attributes[k].clone());
    if (src.index) g.setIndex(src.index.clone());
    for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    g.computeVertexNormals();
    // 衣服疊層：上衣、褲子都往外推約 0.9 公分（褲子再多一點）→ 彎腰時皮膚不會透出衣服；上衣下襬已在 people.js 紮進褲子
    const off = /t-shirt|shirt|cardigan|scrub|jacket|coat|sweater|blouse|top/i.test(o.name) ? 0.12 : /pants|trousers|jeans|skirt/i.test(o.name) ? 0.13 : 0;
    if (off) { const nn = g.attributes.normal.array; for (let i = 0; i < pos.length; i++) pos[i] += nn[i] * off; g.attributes.position.needsUpdate = true; }
    const m = new T.Mesh(g, o.material); m.name = (o.name || "m") + "_" + n++;
    out.add(m);
  });
  const ex = new GLTFExporter();
  const buf = await ex.parseAsync(out, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  const r = await fetch("http://localhost:8799/save?name=" + name, { method: "POST", body: buf });
  return { meshes: n, bytes: buf.byteLength, saved: await r.text() };
};
