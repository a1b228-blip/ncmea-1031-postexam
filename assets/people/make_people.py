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
BLUE = (0.20, 0.36, 0.68, 1)      # 放射師淺藍刷手服（2026-11-10 依使用者提供的團體照改淺藍）
NURSE_TOP = (0.82, 0.78, 0.80, 1); NURSE_PANTS = (0.64, 0.16, 0.22, 1)   # 護理師：淺色花紋上衣（簡化成淺色）＋粉紅褲
BLACK = (0.02, 0.02, 0.025, 1); BEIGE = (0.73, 0.61, 0.49, 1)           # 秀蒂：黑色上衣＋米色長褲
PINK = (0.80, 0.30, 0.42, 1)      # 護理師
GOWN = (0.33, 0.56, 0.64, 1)      # 病人服（淺藍綠）
TOP_M, TOP_F = "elvs_crude_t-shirt_male", "joepal_crude_t-shirt_female"
PANTS = "toigo_wool_pants"
GLASSES = "spamrakuen_tbm_glasses_frames_01"
THIN = (GLASSES, (0.13, 0.14, 0.15, 1))                                  # 槍灰色細鏡框（只有鏡框的款式；kwnet 那款鏡片跟鏡框同一個零件，改色會變墨鏡）
ROUND = (GLASSES, (0.03, 0.025, 0.02, 1))                                # 深色鏡框（toigo 圓框只出現一邊，不用）

PEOPLE = [
    dict(id="dingchen", name="鼎晨", gender=1, age=0.55, height=175, weight=0.6,  hair="short01", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, BLUE), (PANTS, BLUE)], glasses=THIN),                  # 平頭、細框眼鏡、較壯
    dict(id="xiaohua",  name="曉鏵", gender=0, age=0.58, height=160, weight=0.5,  hair="ponytail01", skin="young_asian_female", tint=None,
         clothes=[(TOP_F, NURSE_TOP), (PANTS, NURSE_PANTS)], glasses=THIN),      # 頭髮往後綁、細框眼鏡
    dict(id="ruiyi",    name="瑞益", gender=1, age=0.55, height=172, weight=0.55, hair="short04", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, BLUE), (PANTS, BLUE)], glasses=THIN),                  # 短髮、細框眼鏡
    dict(id="yunding",  name="云玎", gender=0, age=0.52, height=155, weight=0.8,  hair="ponytail01", skin="young_asian_female", tint=(0.78, 0.66, 0.56),
         clothes=[(TOP_F, BLUE), (PANTS, BLUE)], glasses=False),                 # 綁髮、不戴眼鏡
    dict(id="son",      name="兒子", gender=1, age=0.62, height=180, weight=0.78, hair="short02", skin="young_asian_male",   tint=None,
         clothes=[(TOP_M, GOWN), (PANTS, GOWN)], glasses=True),
    dict(id="xiudi",    name="秀蒂", gender=0, age=0.6, height=155, weight=0.45, hair="long01", skin="young_asian_female", tint=None,
         clothes=[(TOP_F, BLACK), (PANTS, BEIGE)], glasses=ROUND),               # 深色直髮（bob02 是白色側分蓋眼，不像）、深色鏡框、黑上衣＋米色褲
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
# ---- 臉部設計（2026-11-10 加）：讓每個人臉型、眼睛、鼻子、嘴巴、下巴、眉毛都不一樣 ----
# 名稱前面是 eye-／cheek-／eye-bag 的會自動左右兩邊一起套（l-…、r-…）；brow＝眉毛款式（eyebrow001～012）
FACE = {
    # 主角（依使用者描述）
    "dingchen": dict(k=1, brow="eyebrow010", t={"head-round": .6, "head-scale-horiz-incr": .35, "cheek-volume-incr": .45, "chin-width-incr": .35,
                     "eye-scale-decr": .2, "nose-point-width-incr": .25, "mouth-angles-up": .35, "mouth-scale-horiz-incr": .15}),          # 圓寬臉、小眼、笑
    "ruiyi":    dict(k=1, brow="eyebrow006", t={"head-oval": .6, "head-scale-vert-incr": .25, "head-scale-horiz-decr": .25, "chin-prominent-incr": .35,
                     "chin-width-incr": .25, "cheek-bones-incr": .3, "ear-scale-incr": .45, "eyebrows-angle-up": .2, "mouth-angles-up": .25}),  # 長臉、下顎線明顯、耳朵較明顯
    "son":      dict(brow="eyebrow004", t={"head-round": .5, "head-fat-incr": .35, "cheek-volume-incr": .35, "chin-width-incr": .3, "chin-height-decr": .2,
                     "nose-point-width-incr": .3, "nose-scale-vert-decr": .2, "eye-scale-decr": .2, "mouth-lowerlip-volume-incr": .3, "eyebrows-angle-down": .3}),  # 圓臉（收斂一點）
    "xiaohua":  dict(k=1, brow="eyebrow003", t={"head-oval": .55, "head-scale-vert-incr": .2, "cheek-bones-incr": .2, "chin-prominent-incr": .2,
                     "eye-scale-decr": .1, "mouth-scale-horiz-decr": .1, "mouth-angles-up": .15}),                                     # 鵝蛋臉
    "yunding":  dict(k=1, brow="eyebrow007", t={"head-round": .85, "head-fat-incr": .6, "cheek-volume-incr": .6, "chin-width-incr": .3,
                     "eye-scale-decr": .1, "nose-point-width-incr": .3, "mouth-angles-up": .3, "eyebrows-angle-down": .1}),               # 圓臉、臉頰豐滿、笑
    "xiudi":    dict(k=1, brow="eyebrow002", t={"head-oval": .6, "head-scale-horiz-decr": .25, "cheek-bones-incr": .3, "chin-triangle": .3,
                     "eye-scale-incr": .1, "mouth-angles-up": .4, "mouth-scale-horiz-incr": .15}),                                     # 瘦長臉、笑容
    # 配角（隨機但彼此不同）
    "examiner":  dict(brow="eyebrow011", t={"head-rectangular": .6, "chin-width-incr": .3, "nose-hump-incr": .3, "eye-bag-incr": .4, "mouth-angles-down": .3, "eyebrows-trans-down": .2}),
    "examiner2": dict(brow="eyebrow003", t={"head-diamond": .5, "cheek-bones-incr": .4, "eye-scale-decr": .1, "nose-point-up": .2, "mouth-scale-horiz-decr": .2}),
    "examiner3": dict(brow="eyebrow012", t={"head-triangular": .5, "chin-prognathism-incr": .3, "nose-scale-depth-incr": .3, "eye-scale-incr": .2, "mouth-upperlip-volume-decr": .3, "eyebrows-angle-up": .2}),
    "examiner4": dict(brow="eyebrow005", t={"head-oval": .4, "head-scale-horiz-decr": .2, "eye-corner2-down": .2, "nose-scale-horiz-decr": .2, "mouth-lowerlip-volume-incr": .2, "mouth-angles-up": .2}),
    "doctor":    dict(brow="eyebrow008", t={"head-square": .4, "head-scale-vert-incr": .2, "nose-hump-incr": .2, "nose-scale-vert-incr": .3, "eye-bag-incr": .2, "chin-prominent-incr": .3}),
    "medic_m":   dict(brow="eyebrow010", t={"head-round": .3, "eye-scale-incr": .2, "nose-point-width-incr": .3, "mouth-scale-horiz-incr": .2}),
    "medic_f":   dict(brow="eyebrow002", t={"head-invertedtriangular": .4, "eye-corner2-up": .2, "nose-point-up": .3}),
    "other_m":   dict(brow="eyebrow006", t={"head-rectangular": .4, "chin-cleft-incr": .3, "eye-height2-decr": .3}),
    "other_f":   dict(brow="eyebrow004", t={"head-round": .4, "cheek-volume-incr": .3, "eye-scale-incr": .3}),
}
NOFACE = bool(os.environ.get("NOFACE"))     # 設了就照舊（做「修改前」對照用）
FACE_K = float(os.environ.get("FACE_K", "1.8"))   # 臉部調整強度倍數（第一版 1.0 太細微，看不出差別）
def face_targets(t, mult=None):
    out = []
    for k, v in t.items():
        v = min(1.0, v * (FACE_K if mult is None else mult))
        for name in ((f"l-{k}", f"r-{k}") if k.startswith(("eye-", "cheek-", "ear-")) else (k,)):
            out.append({"target": name, "value": v})
    return out
if os.environ.get("EXTRA"): PEOPLE = EXTRA
if os.environ.get("ALL"): PEOPLE = PEOPLE + EXTRA
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

def build(p, x, extra=None):
    info = HumanService._create_default_human_info_dict()
    info["name"] = p["id"]
    info["phenotype"].update(gender=p["gender"], age=p["age"], weight=p["weight"], muscle=0.5, height=0.5,
                             race={"asian": 1.0, "caucasian": 0.0, "african": 0.0})
    info["rig"] = "game_engine"
    info["eyes"] = find("eyes", "high-poly"); info["eyes_material_type"] = "MAKESKIN"
    face = None if NOFACE else FACE.get(p["id"])
    info["eyebrows"] = find("eyebrows", face["brow"] if face else "eyebrow001"); info["eyelashes"] = find("eyelashes", "eyelashes01")
    if face: info["targets"] = face_targets(face["t"], face.get("k"))
    if extra: info["targets"] = info.get("targets", []) + [{"target": k, "value": v} for k, v in extra.items()]   # 表情單元（臉部動作）
    info["hair"] = find("hair", p["hair"])
    info["teeth"] = ""; info["tongue"] = ""
    info["skin_mhmat"] = find_skin(p["skin"]); info["skin_material_type"] = "MAKESKIN"
    gl = (GLASSES, (0.015, 0.015, 0.02, 1)) if p["glasses"] is True else p["glasses"] or None
    info["clothes"] = [find("clothes", c) for c, _ in p["clothes"]] + [find("clothes", "shoes02")] + ([find("clothes", gl[0])] if gl else [])
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
    # 眼鏡：鏡框改成指定顏色（鏡片部分也一起變成同色細框，看得清楚）
    for o in children(root):
        if gl and o.type == "MESH" and gl[0] in o.name:
            o.data.materials.clear(); o.data.materials.append(solid(gl[1], 0.35))
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

# ---- 表情（EXPR=1）：每人每種表情各輸出一個「只有臉」的小檔（body＋眉毛＋睫毛＋骨架，沒有材質貼圖），
#      簡報裡拿來跟一般模型相減，變成可以 0～1 慢慢變化的臉部變形；另外拍大頭照給使用者確認 ----
# 表情單元（MakeHuman expression units，0～1）
EXPRS = {
    "worried": {"eyebrows-left-inner-up": 1.0, "eyebrows-right-inner-up": 1.0, "mouth-depression": .5, "mouth-compression": .3},          # 焦慮、擔心
    "panic":   {"eyebrows-left-up": .6, "eyebrows-right-up": .6, "eyebrows-left-inner-up": .6, "eyebrows-right-inner-up": .6,
                "eye-left-opened-up": .55, "eye-right-opened-up": .55, "mouth-open": .35},                                                    # 慌張
    "shout":   {"eyebrows-left-down": .85, "eyebrows-right-down": .85, "eye-left-slit": .3, "eye-right-slit": .3, "mouth-open": .75,
                "mouth-retraction": .4, "nose-left-dilatation": .4, "nose-right-dilatation": .4},                                            # 生氣大吼
    "concern": {"eyebrows-left-inner-up": .75, "eyebrows-right-inner-up": .75, "mouth-compression": .3},                                       # 安撫時擔心
    "focus":   {"eyebrows-left-down": .35, "eyebrows-right-down": .35, "eye-left-slit": .2, "eye-right-slit": .2, "mouth-compression": .45},  # 急救專注、咬緊牙
    "smile":   {"mouth-corner-puller": .7, "mouth-upward-retraction": .2, "eye-left-slit": .15, "eye-right-slit": .15},                      # 謝幕微笑
    "serious": {"eyebrows-left-down": .2, "eyebrows-right-down": .2, "mouth-depression": .25},                                               # 考官嚴肅
}
EXPR_SET = {"son": ["worried", "panic", "shout", "smile"], "dingchen": ["concern", "focus", "smile"], "ruiyi": ["focus", "smile"],
            "yunding": ["focus", "smile"], "xiaohua": ["focus", "smile"],
            "examiner": ["serious"], "examiner2": ["serious"], "examiner3": ["serious"], "examiner4": ["serious"]}
if os.environ.get("EXPR"):
    os.makedirs(os.path.join(OUT, "expr"), exist_ok=True); os.makedirs(os.path.join(OUT, "heads"), exist_ok=True)
    bpy.ops.object.light_add(type="AREA", location=(0, -3, 3)); bpy.context.object.data.energy = 300; bpy.context.object.data.size = 4
    bpy.ops.object.light_add(type="AREA", location=(-2, -2, 1.8)); bpy.context.object.data.energy = 120; bpy.context.object.data.size = 3
    w = bpy.context.scene.world or bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.85, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.render.resolution_x = 420; sc.render.resolution_y = 500
    bpy.ops.object.camera_add(); cam = bpy.context.object; cam.data.lens = 85; sc.camera = cam
    everyone = {q["id"]: q for q in PEOPLE + EXTRA}
    for pid, names in EXPR_SET.items():
        if ONLY and pid not in ONLY.split(","): continue
        for name in [None] + names:                     # None＝一般表情（大頭照對照用，不輸出檔案）
            p = everyone[pid]
            root, body = build(p, 0, EXPRS.get(name))
            bpy.context.view_layer.update()
            if name:
                bpy.ops.object.select_all(action="DESELECT"); root.select_set(True)
                for o in children(root):
                    if o.type == "MESH" and any(k in o.name.lower() for k in ("body", "eyebrow", "eyelash")): o.select_set(True)
                bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "expr", f"{pid}-{name}.glb"), use_selection=True, export_format="GLB",
                                          export_materials="NONE", export_apply=True, export_animations=False, export_yup=True)
            hz = p["height"] / 100 * 0.925
            cam.location = (0, -1.25, hz); cam.rotation_euler = (math.radians(90), 0, 0)
            sc.render.filepath = os.path.join(OUT, "heads", f"{pid}-{name or 'neutral'}.png"); bpy.ops.render.render(write_still=True)
            for o in [root] + children(root): bpy.data.objects.remove(o, do_unlink=True)
            print("EXPR", pid, name, flush=True)
    print("DONE", flush=True); sys.exit(0)

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

# 大頭照（HEADS=1）：每人一張臉部特寫，給使用者比較臉型
if os.environ.get("HEADS"):
    os.makedirs(os.path.join(OUT, "heads"), exist_ok=True)
    bpy.ops.object.light_add(type="AREA", location=(0, -3, 3)); bpy.context.object.data.energy = 300; bpy.context.object.data.size = 4
    bpy.ops.object.light_add(type="AREA", location=(-2, -2, 1.8)); bpy.context.object.data.energy = 120; bpy.context.object.data.size = 3
    w = bpy.context.scene.world or bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.85, 0.9, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    sc = bpy.context.scene; sc.render.engine = "BLENDER_EEVEE_NEXT"; sc.render.resolution_x = 420; sc.render.resolution_y = 500
    bpy.ops.object.camera_add(); cam = bpy.context.object; cam.data.lens = 85; sc.camera = cam
    for p, root in made:
        hz = p["height"] / 100 * 0.925
        cam.location = (root.location.x, -1.25, hz); cam.rotation_euler = (math.radians(90), 0, 0)
        sc.render.filepath = os.path.join(OUT, "heads", f"{p['id']}.png"); bpy.ops.render.render(write_still=True)
    print("DONE", flush=True); sys.exit(0)

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
