# 封面主視覺：匯入瀏覽器匯出的急救那一幕（hero_scene.glb），電影打光＋景深，用 Cycles 算圖
# 用法：Blender -b --python render_hero.py -- <輸出.png> <寬> <高> <取樣數> [鏡頭設定.json] [場景.glb]
import bpy, sys, os, math, json
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
out, RX, RY, SPP = argv[0], int(argv[1]), int(argv[2]), int(argv[3])
D = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(D, argv[4] if len(argv) > 4 else "hero_cam.json")))
GLB = os.path.join(D, argv[5] if len(argv) > 5 else "hero_scene.glb")
B = lambda p: Vector((p[0], -p[2], p[1]))            # three.js (x, y, z) → Blender (x, -z, y)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=GLB)
if C.get("ceiling"):                                  # 天花板（關起房間，光不會從天上漏進來）：[x1, z1, x2, z2, 高度]
    x1, z1, x2, z2, h = C["ceiling"]; bpy.ops.mesh.primitive_plane_add(size=1, location=B(((x1 + x2) / 2, h, (z1 + z2) / 2))); cp = bpy.context.object; cp.scale = (x2 - x1, z2 - z1, 1)
    cm = bpy.data.materials.new("ceil"); cm.use_nodes = True; cm.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.75, 0.77, 0.8, 1); cp.data.materials.append(cm)
sc = bpy.context.scene
# 鏡頭
cd = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cd); sc.collection.objects.link(cam); sc.camera = cam
cam.location = B(C["pos"]); cam.rotation_euler = (B(C["look"]) - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.lens = C.get("lens", 40); cd.shift_x = C.get("shift_x", 0); cd.shift_y = C.get("shift_y", 0); cd.clip_end = 5000
cd.dof.use_dof = True; cd.dof.focus_distance = (B(C["focus"]) - cam.location).length; cd.dof.aperture_fstop = C.get("fstop", 0.3)
# 燈光
def light(name, kind, p, e, col=(1, 1, 1), size=1, look=None, sx=None, sy=None, spot=None, blend=0.5, spread=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = e; ld.color = col
    if kind == "SPOT": ld.spot_size = math.radians(spot or 45); ld.spot_blend = blend
    if kind == "AREA":
        ld.shape = "RECTANGLE"; ld.size = sx or size; ld.size_y = sy or size
        if spread: ld.spread = math.radians(spread)
    elif kind in ("POINT", "SPOT"): ld.shadow_soft_size = size
    lo = bpy.data.objects.new(name, ld); lo.location = B(p); sc.collection.objects.link(lo)
    if look: lo.rotation_euler = (B(look) - lo.location).to_track_quat("-Z", "Y").to_euler()
    return lo
for L in C["lights"]: light(**L)
w = sc.world or bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = (*C.get("world", (0.08, 0.1, 0.14)), 1); bg.inputs[1].default_value = C.get("world_k", 1.0)
# 算圖設定
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU 不可用，改用 CPU", e)
sc.cycles.samples = SPP; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
sc.render.resolution_x = RX; sc.render.resolution_y = RY; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = C.get("look_name", "AgX - Medium High Contrast"); sc.view_settings.exposure = C.get("exposure", 0)
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = out
bpy.ops.render.render(write_still=True); print("RENDERED", out, flush=True)
