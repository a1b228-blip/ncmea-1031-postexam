# 用 MPFB（MakeHuman for Blender）依使用者描述產生 1031 考後簡報的主角，匯出 GLB 並渲染一張排排站的預覽圖。
# 執行：Blender -b --python make_people.py -- <輸出資料夾>
import bpy, sys, os, math, json
from mathutils import Vector

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/people"
os.makedirs(OUT, exist_ok=True)

from bl_ext.user_default.mpfb.services import HumanService, AssetService, RigService
from mathutils import Matrix

# 清掉 Blender 預設場景（方塊、燈、相機）
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)

# ---- 人物設定（身高 cm；weight＝MakeHuman 體重 0..1，0.5＝標準；color＝衣服顏色（線性色彩），None＝保留原本材質） ----
BLUE = (0.025, 0.08, 0.34, 1)     # 放射師藍色制服
PINK = (0.80, 0.30, 0.42, 1)      # 護理師
GOWN = (0.33, 0.56, 0.64, 1)      # 病人服（淺藍綠）
TOP_M, TOP_F = "elvs_crude_t-shirt_male", "joepal_crude_t-shirt_female"
PANTS = "toigo_wool_pants"
GLASSES = "spamrakuen_tbm_glasses_frames_01"

PEOPLE = [
    dict(id="dingchen", name="鼎晨", gender=1, age=0.55, height=175, weight=0.5,  hair="short02", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, BLUE), (PANTS, BLUE)], glasses=True),
    dict(id="xiaohua",  name="曉鏵", gender=0, age=0.52, height=160, weight=0.5,  hair="ponytail01", skin="young_asian_female", tint=None,
         clothes=[(TOP_F, PINK), (PANTS, PINK)], glasses=True),
    dict(id="ruiyi",    name="瑞益", gender=1, age=0.58, height=172, weight=0.62, hair="short04", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, BLUE), (PANTS, BLUE)], glasses=True),
    dict(id="yunding",  name="云玎", gender=0, age=0.52, height=155, weight=0.8,  hair="ponytail01", skin="young_asian_female", tint=(0.78, 0.66, 0.56),
         clothes=[(TOP_F, BLUE), (PANTS, BLUE)], glasses=False),
    dict(id="son",      name="兒子", gender=1, age=0.62, height=180, weight=0.78, hair="short02", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, GOWN), (PANTS, GOWN)], glasses=True),
    dict(id="xiudi",    name="秀蒂", gender=0, age=0.62, height=155, weight=0.5,  hair="long01", skin="young_asian_female", tint=None,
         clothes=[("toigo_shift_dress", None)], glasses=True),
]
TEAL = (0.02, 0.22, 0.26, 1)      # 999 急救團隊
WHITE = (0.80, 0.82, 0.84, 1)     # 醫師
# 配角（使用者說隨機製作即可）：考官、醫師、999 隊員、其他隊伍
EXTRA = [
    dict(id="examiner", name="考官", gender=1, age=0.68, height=170, weight=0.6, hair="short01", skin="middleage_asian_male", tint=None,
         clothes=[("male_elegantsuit01", None)], glasses=True),
    # Debrief 教室的另外 3 位考官（隨機）
    dict(id="examiner2", name="考官", gender=0, age=0.66, height=158, weight=0.55, hair="bob02", skin="middleage_asian_female", tint=None,
         clothes=[("female_elegantsuit01", None)], glasses=True),
    dict(id="examiner3", name="考官", gender=1, age=0.62, height=174, weight=0.65, hair="short04", skin="middleage_asian_male", tint=None,
         clothes=[("male_casualsuit05", None)], glasses=False),
    dict(id="examiner4", name="考官", gender=0, age=0.6, height=162, weight=0.5, hair="long01", skin="middleage_asian_female", tint=None,
         clothes=[("female_elegantsuit01", None)], glasses=True),
    dict(id="doctor", name="醫師", gender=1, age=0.6, height=176, weight=0.55, hair="short03", skin="middleage_asian_male", tint=None,
         clothes=[(TOP_M, (0.30, 0.45, 0.66, 1)), (PANTS, (0.04, 0.05, 0.07, 1)),
                  ("mindfront_cardigan_long_open_front", (0.92, 0.93, 0.94, 1))], glasses=False),   # 白色醫師袍（長版開襟外套改白色，CC-BY Mindfront）
    dict(id="medic_m", name="急救隊員", gender=1, age=0.5, height=173, weight=0.5, hair="short01", skin="young_asian_male", tint=None,
         clothes=[(TOP_M, TEAL), (PANTS, TEAL)], glasses=False),
    dict(id="medic_f", name="急救隊員", gender=0, age=0.5, height=161, weight=0.5, hair="bob01", skin="young_asian_female", tint=None,
         clothes=[(TOP_F, TEAL), (PANTS, TEAL)], glasses=False),
    dict(id="other_m", name="其他隊伍", gender=1, age=0.5, height=171, weight=0.55, hair="short03", skin="young_asian_male", tint=None,
         clothes=[("male_casualsuit02", None)], glasses=False),
    dict(id="other_f", name="其他隊伍", gender=0, age=0.5, height=160, weight=0.5, hair="bob02", skin="young_asian_female", tint=None,
         clothes=[("female_casualsuit01", None)], glasses=False),
]
if os.environ.get("EXTRA"): PEOPLE = EXTRA
ONLY = os.environ.get("ONLY")       # 只做某幾位（逗號分隔 id）
if ONLY: PEOPLE = [p for p in PEOPLE if p["id"] in ONLY.split(",")]

def find(sub, name):
    for cand in (f"{name}/{name}.mhclo", f"{name}.mhclo", name):
        if AssetService.find_asset_absolute_path(cand, asset_subdir=sub):
            return cand
    raise RuntimeError(f"找不到素材 {sub}/{name}")

def find_skin(name):
    for cand in (f"{name}/{name}.mhmat", f"{name}.mhmat"):
        if AssetService.find_asset_absolute_path(cand, asset_subdir="skins"):
            return cand
    raise RuntimeError(f"找不到皮膚 {name}")

def solid(color, rough=0.8):
    m = bpy.data.materials.new("cloth"); m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value = color; b.inputs["Roughness"].default_value = rough
    return m

def children(obj):
    out = []
    for o in bpy.data.objects:
        p = o.parent
        while p:
            if p == obj: out.append(o); break
            p = p.parent
    return out

def build(p, x):
    info = HumanService._create_default_human_info_dict()
    info["name"] = p["id"]
    info["phenotype"].update(gender=p["gender"], age=p["age"], weight=p["weight"], muscle=0.5, height=0.5,
                             race={"asian": 1.0, "caucasian": 0.0, "african": 0.0})
    info["rig"] = "game_engine"
    info["eyes"] = find("eyes", "high-poly"); info["eyes_material_type"] = "MAKESKIN"
    info["eyebrows"] = find("eyebrows", "eyebrow001"); info["eyelashes"] = find("eyelashes", "eyelashes01")
    info["hair"] = find("hair", p["hair"])
    info["teeth"] = ""; info["tongue"] = ""
    info["skin_mhmat"] = find_skin(p["skin"]); info["skin_material_type"] = "MAKESKIN"
    info["clothes"] = [find("clothes", c) for c, _ in p["clothes"]] + [find("clothes", "shoes02")] + ([find("clothes", GLASSES)] if p["glasses"] else [])
    st = HumanService.get_default_deserialization_settings(); st["subdiv_levels"] = 0
    body = HumanService.deserialize_from_dict(info, st)
    rig = body.parent if body.parent and body.parent.type == "ARMATURE" else None
    root = rig or body
    # 衣服改成制服顏色（物件名稱裡含素材名稱）
    print("CHILDREN", p["id"], [o.name for o in children(root)], flush=True)
    for o in children(root):
        if o.type != "MESH": continue
        for cname, col in p["clothes"]:
            if col and cname.lower() in o.name.lower():
                o.data.materials.clear(); o.data.materials.append(solid(col))
    # 外套（醫師袍）沿法線往外撐 1.5 公分，避免裡面的衣服穿出來
    for o in children(root):
        if o.type == "MESH" and "cardigan" in o.name:
            d = o.modifiers.new("撐開", "DISPLACE"); d.strength = 0.015; d.mid_level = 0.0
    # 眼鏡：鏡框改成深色，看得清楚
    for o in children(root):
        if o.type == "MESH" and GLASSES in o.name:
            o.data.materials.clear(); o.data.materials.append(solid((0.015, 0.015, 0.02, 1), 0.35))
    # 膚色偏深：在接到 Base Color 的皮膚貼圖後面乘上顏色
    if p["tint"]:
        for m in body.data.materials:
            nt = m.node_tree
            for n in nt.nodes:
                if n.type != "BSDF_PRINCIPLED" or not n.inputs["Base Color"].links: continue
                src = n.inputs["Base Color"].links[0].from_socket
                mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
                mix.inputs["Factor"].default_value = 1.0; mix.inputs[7].default_value = (*p["tint"], 1)
                nt.links.new(src, mix.inputs[6]); nt.links.new(mix.outputs[2], n.inputs["Base Color"])
                print("TINT", p["id"], m.name, src.node.name, flush=True)
    # 手臂放下（自然站姿），並設成骨架的靜止姿勢：網頁裡走路、鞠躬都以這個姿勢為基準
    if rig:
        def rot_world(bone, axis, ang):
            pb = rig.pose.bones[bone]; M = rig.matrix_world; mw = M @ pb.matrix; loc = mw.to_translation()
            pb.matrix = M.inverted() @ (Matrix.Translation(loc) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-loc) @ mw)
            bpy.context.view_layer.update()
        def point(bone, target):                       # 把骨頭轉到指向 target（世界座標方向）
            pb = rig.pose.bones[bone]; M = rig.matrix_world
            h = M @ pb.head; v = ((M @ pb.tail) - h).normalized()
            q = v.rotation_difference(Vector(target).normalized())
            pb.matrix = M.inverted() @ (Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ M @ pb.matrix)
            bpy.context.view_layer.update()
        for side in ("l", "r"):
            sx = 1 if (rig.matrix_world @ rig.pose.bones[f"upperarm_{side}"].head).x > 0 else -1
            point(f"upperarm_{side}", (sx * 0.16, 0.02, -1))       # 上臂自然下垂、稍微離開身體
            point(f"lowerarm_{side}", (sx * 0.08, -0.16, -1))      # 前臂微微往前
        bpy.context.view_layer.objects.active = rig
        RigService.apply_pose_as_rest_pose(rig)
    # 依實際身高縮放
    bpy.context.view_layer.update()
    zs = [ (body.matrix_world @ v.co).z for v in body.data.vertices ]
    h = max(zs) - min(zs)
    k = (p["height"] / 100) / h
    root.scale = (root.scale[0] * k,) * 3
    root.location.x = x
    return root, body

made = []
for i, p in enumerate(PEOPLE):
    root, body = build(p, (i - (len(PEOPLE) - 1) / 2) * 0.75)
    made.append((p, root))
    print("BUILT", p["id"], root.name, flush=True)

# 貼圖縮到 1024，減少網頁檔案大小
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, int(1024 * img.size[1] / img.size[0]))

# 每人各自匯出 GLB（Y 軸朝上）
for p, root in made:
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for o in children(root): o.select_set(True)
    x0 = root.location.x; root.location.x = 0
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{p['id']}.glb"), use_selection=True, export_format="GLB",
                              export_image_format="JPEG", export_apply=True, export_animations=False, export_yup=True)
    root.location.x = x0

# 排排站預覽圖
bpy.ops.object.camera_add(location=(0, -7.5, 1.05), rotation=(math.radians(88), 0, 0))
cam = bpy.context.object; cam.data.lens = 42; bpy.context.scene.camera = cam
bpy.ops.object.light_add(type="AREA", location=(2, -4, 4)); bpy.context.object.data.energy = 900; bpy.context.object.data.size = 5
bpy.ops.object.light_add(type="AREA", location=(-3, -3, 2.5)); bpy.context.object.data.energy = 400; bpy.context.object.data.size = 4
w = bpy.context.scene.world or bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.85, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.render.resolution_x = 1600; sc.render.resolution_y = 900
sc.render.filepath = os.path.join(OUT, "lineup.png"); bpy.ops.render.render(write_still=True)
json.dump([{"id": p["id"], "name": p["name"], "x": root.location.x} for p, root in made], open(os.path.join(OUT, "lineup.json"), "w"), ensure_ascii=False)
print("DONE", flush=True)
