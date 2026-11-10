# 用 Blender 重做考場儀器（2026-11-10 起，一件一件做），匯出 GLB 給簡報用。
# 執行：Blender -b --python make_props.py -- <輸出資料夾> [儀器名稱…]
# 座標：直接用 world.js 的「考場配置圖座標」（x、z＝配置圖、y＝高度，單位同原本方塊版本），簡報裡放進同一個 item() 群組就會在原位。
#   Blender 是 Z 朝上：配置圖 (x, 高度 y, z) → Blender (x, -z, y)；匯出 glTF（Y 朝上）時會自動換回來。
import bpy, bmesh, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/props"
WANT = set(argv[1:])
os.makedirs(OUT, exist_ok=True)

def reset():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)

def P(x, y, z):            # 配置圖座標 → Blender 座標
    return (x, -z, y)

_mats = {}
def mat(name, color, rough=0.45, metal=0.0, emit=None, strength=2.0):
    if name in _mats: return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = strength
    _mats[name] = m; return m

def finish(o, m, bevel=0.0, seg=4, smooth=True):
    o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = seg; b.limit_method = "ANGLE"
    if smooth:
        for poly in o.data.polygons: poly.use_smooth = True
        try: o.data.set_sharp_from_angle(angle=math.radians(40))
        except Exception: pass
    return o

def box(name, x1, z1, x2, z2, y1, y2, m, bevel=0.0, seg=4):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = name
    o.scale = ((x2 - x1), (z2 - z1), (y2 - y1)); o.location = P((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, seg)

def cyl_z(name, x, y, z, r, depth, m, verts=64, bevel=0.0):     # 圓柱沿配置圖 z 方向（機架孔方向）
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.object; o.name = name; o.rotation_euler = (math.radians(90), 0, 0); o.location = P(x, y, z)
    bpy.ops.object.transform_apply(rotation=True)
    return finish(o, m, bevel)

def boolean_diff(o, cutter):
    mod = o.modifiers.new("cut", "BOOLEAN"); mod.operation = "DIFFERENCE"; mod.object = cutter; mod.solver = "EXACT"
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cutter, do_unlink=True)

def export(name):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), use_selection=True, export_format="GLB",
                              export_apply=True, export_yup=True, export_animations=False)
    print("EXPORTED", name, flush=True)

# ------------------------------------------------------------------------------------------------
# CT 掃描儀（原本：world.js「CT 掃描儀」item(747, 405)）
#   機架：寬 92、高 80、深 24，前面（朝檢查床、配置圖 -z）在 z=423；孔中心高 44、半徑 23
#   檢查床：底座 x 736–758、z 360–402、高 0–26；床面 x 734–760、z 350–439、高 26–30（病人躺的高度不能變）
# ------------------------------------------------------------------------------------------------
def ct_scanner():
    reset()
    cx, zf, zb = 747, 423, 447
    white = mat("ct_white", (0.86, 0.87, 0.88), 0.32)
    grey = mat("ct_grey", (0.46, 0.49, 0.53), 0.45)
    dark = mat("ct_dark", (0.10, 0.11, 0.13), 0.4)
    bore = mat("ct_bore", (0.70, 0.72, 0.74), 0.5)
    ring = mat("ct_ring", (0.98, 0.45, 0.09), 0.35, emit=(0.98, 0.45, 0.09), strength=1.6)     # 保留原本的橘色光環（大家認得出是 CT）
    screen = mat("ct_screen", (0.02, 0.05, 0.09), 0.2, emit=(0.15, 0.55, 0.95), strength=1.2)
    laser = mat("ct_laser", (1, 0.1, 0.1), 0.3, emit=(1, 0.08, 0.05), strength=4)
    cushion = mat("ct_cushion", (0.13, 0.16, 0.22), 0.65)
    rail = mat("ct_rail", (0.62, 0.64, 0.67), 0.25, metal=0.6)

    # 機架外殼：圓角方塊挖掉孔，前後邊緣導圓角
    g = box("gantry", cx - 46, zf, cx + 46, zb, 3, 80, white)
    boolean_diff(g, cyl_z("cutter", cx, 44, (zf + zb) / 2, 23, 40, white))
    b = g.modifiers.new("bevel", "BEVEL"); b.width = 5; b.segments = 6; b.limit_method = "ANGLE"
    # 底座（深色踢腳）
    box("gantry_base", cx - 40, zf + 2, cx + 40, zb - 2, 0, 4, grey, bevel=1.2)
    # 前面板：稍微凸出的淺灰面板＋孔周圍內襯
    front = box("front_panel", cx - 40, zf - 1.2, cx + 40, zf + 0.5, 10, 76, mat("ct_panel", (0.93, 0.94, 0.95), 0.28), bevel=0)
    boolean_diff(front, cyl_z("cutter2", cx, 44, zf, 27, 6, white))
    tube = cyl_z("bore_tube", cx, 44, (zf + zb) / 2, 23.2, 23, bore, verts=72)
    boolean_diff(tube, cyl_z("cutter3", cx, 44, (zf + zb) / 2, 22.2, 30, bore, verts=72))
    # 橘色光環＋孔口的灰色邊
    bpy.ops.mesh.primitive_torus_add(major_radius=25.2, minor_radius=1.1, major_segments=72, minor_segments=12)
    t = bpy.context.object; t.name = "ring"; t.rotation_euler = (math.radians(90), 0, 0); t.location = P(cx, 44, zf - 1.6); finish(t, ring)
    bpy.ops.mesh.primitive_torus_add(major_radius=23.4, minor_radius=0.9, major_segments=72, minor_segments=10)
    t = bpy.context.object; t.name = "bore_lip"; t.rotation_euler = (math.radians(90), 0, 0); t.location = P(cx, 44, zf - 1.2); finish(t, grey)
    # 前面兩側的操作面板（小螢幕＋按鍵）
    for s in (-1, 1):
        x = cx + s * 33
        box(f"panel_{s}", x - 6, zf - 2.6, x + 6, zf - 1.0, 58, 66, dark, bevel=0.6)
        box(f"panel_screen_{s}", x - 5, zf - 2.9, x + 5, zf - 2.5, 59.5, 65, screen)
        for i in range(3):
            box(f"btn_{s}_{i}", x - 4 + i * 3.2, zf - 2.9, x - 2.4 + i * 3.2, zf - 2.4, 55.5, 57, mat("ct_btn", (0.2, 0.75, 0.45), 0.4, emit=(0.1, 0.6, 0.3), strength=0.8))
    # 定位雷射（孔上方的小紅點）
    box("laser", cx - 1.2, zf - 2.0, cx + 1.2, zf - 1.0, 70.5, 72, laser)
    # 背面散熱格柵（細條）
    for i in range(6):
        box(f"vent_{i}", cx - 30 + i * 12, zb + 0.5, cx - 22 + i * 12, zb + 1.2, 60, 70, grey)

    # 檢查床：底座（上窄下寬的圓角柱）＋床面（金屬滑軌＋深色床墊＋頭靠）
    box("table_foot", 734, 362, 760, 400, 0, 3, grey, bevel=1.0)
    box("table_column", 737, 365, 757, 398, 3, 24, white, bevel=3, seg=5)
    box("table_carriage", 735, 352, 759, 438, 24, 26.6, rail, bevel=0.8)
    box("table_cushion", 734, 350, 760, 439, 26.6, 30, cushion, bevel=1.4, seg=5)
    box("table_head", 739, 431, 755, 439, 29.6, 31.2, mat("ct_head", (0.2, 0.24, 0.31), 0.6), bevel=1.2)
    for s in (-1, 1):                                    # 床兩側的扶手滑軌
        box(f"side_rail_{s}", cx + s * 13.4 - 0.4, 356, cx + s * 13.4 + 0.4, 420, 25, 27.5, rail, bevel=0.2)
    export("ct_scanner")

# ------------------------------------------------------------------------------------------------
# MRI 掃描儀（原本：world.js「MRI 掃描儀」item(338, 420)）
#   磁體：寬 96、高 86、深 46，前面（朝檢查床、配置圖 -z）在 z=404；孔中心高 46、半徑 22；原本有紫色光環
#   檢查床：底座 x 327–349、z 344–404、高 0–26；床面 x 325–351、z 296–430、高 26–30（安妮躺的高度不能變，頭朝磁體）
# ------------------------------------------------------------------------------------------------
def cone_z(name, x, y, z, r_front, r_back, depth, m, verts=72):   # 圓錐沿配置圖 z：前面（-z）半徑 r_front、後面 r_back
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r_front, radius2=r_back, depth=depth)
    o = bpy.context.object; o.name = name; o.rotation_euler = (math.radians(90), 0, 0); o.location = P(x, y, z)
    bpy.ops.object.transform_apply(rotation=True)
    return finish(o, m)

def apply_mod(o, name):
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=name)

def mri_scanner():
    reset()
    cx, zf, zb, by, br = 338, 404, 452, 46, 22
    white = mat("mri_white", (0.90, 0.91, 0.93), 0.28)
    cover = mat("mri_cover", (0.95, 0.96, 0.97), 0.22)
    grey = mat("mri_grey", (0.50, 0.53, 0.58), 0.45)
    dark = mat("mri_dark", (0.10, 0.11, 0.14), 0.4)
    liner = mat("mri_liner", (0.82, 0.84, 0.87), 0.4)
    purple = mat("mri_purple", (0.42, 0.20, 0.92), 0.3, emit=(0.42, 0.16, 0.95), strength=0.9)   # 保留原本的紫色光環（大家認得出是 MRI）
    glow = mat("mri_glow", (0.85, 0.92, 1.0), 0.3, emit=(0.80, 0.90, 1.0), strength=2.5)       # 孔內照明
    screen = mat("mri_screen", (0.02, 0.05, 0.09), 0.2, emit=(0.30, 0.65, 1.0), strength=1.2)
    btn = mat("mri_btn", (0.2, 0.75, 0.45), 0.4, emit=(0.1, 0.6, 0.3), strength=0.8)
    yellow = mat("mri_yellow", (0.98, 0.78, 0.08), 0.4)
    cushion = mat("mri_cushion", (0.18, 0.30, 0.52), 0.65)
    rail = mat("mri_rail", (0.70, 0.72, 0.75), 0.3)

    # 磁體外殼：大圓角方塊（先導角再挖孔），孔口做成喇叭狀往內收
    mag = box("magnet", cx - 48, zf, cx + 48, zb, 2, 88, white, bevel=14, seg=8); apply_mod(mag, "bevel")
    boolean_diff(mag, cyl_z("cut_bore", cx, by, (zf + zb) / 2, br, 70, white))
    boolean_diff(mag, cone_z("cut_flare_f", cx, by, zf + 3.5, 30, br, 9, white))
    boolean_diff(mag, cone_z("cut_flare_b", cx, by, zb - 3.5, br, 30, 9, white))
    # 前蓋：比磁體略小的淺色面板（孔口周圍），讓正面有層次
    fc = box("front_cover", cx - 42, zf - 1.5, cx + 42, zf + 1, 8, 84, cover, bevel=10, seg=8); apply_mod(fc, "bevel")
    boolean_diff(fc, cyl_z("cut_fc", cx, by, zf, 30.5, 10, cover))
    # 孔內襯（淺灰管）＋喇叭口內面
    tube = cyl_z("bore_liner", cx, by, (zf + zb) / 2, br + 0.2, zb - zf - 6, liner, verts=96)
    boolean_diff(tube, cyl_z("cut_liner", cx, by, (zf + zb) / 2, br - 0.6, 80, liner, verts=96))
    # 孔口紫色光環（前、後）
    for z, r in ((zf - 2.0, 32.0), (zb + 1.0, 30.5)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=1.7, major_segments=96, minor_segments=12)
        t = bpy.context.object; t.name = "ring"; t.rotation_euler = (math.radians(90), 0, 0); t.location = P(cx, by, z); finish(t, purple)
    # 孔內頂部的照明燈條
    box("bore_light", cx - 5, zf + 6, cx + 5, zb - 6, by + br - 1.4, by + br - 0.7, glow)
    # 前面兩側的操作鍵盤（小螢幕＋按鍵），在孔口外側、病人床的高度附近
    for s in (-1, 1):
        x = cx + s * 38
        box(f"panel_{s}", x - 4.5, zf - 3.2, x + 4.5, zf - 1.2, 34, 46, dark, bevel=0.8)
        box(f"panel_screen_{s}", x - 4, zf - 3.5, x + 4, zf - 3.1, 40, 45, screen)
        for i in range(3):
            box(f"btn_{s}_{i}", x - 3.6 + i * 2.8, zf - 3.5, x - 2.0 + i * 2.8, zf - 3.0, 36, 37.6, btn)
    # 頂部中央的狀態顯示窗
    box("status", cx - 9, zf - 2.2, cx + 9, zf - 0.8, 78.5, 83, dark, bevel=0.8)
    box("status_screen", cx - 8, zf - 2.5, cx + 8, zf - 2.1, 79.3, 82.2, screen)
    # 黃色三角形警示貼紙（只有圖形、不放文字）
    for s in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=5, depth=0.3)
        t = bpy.context.object; t.name = f"warn_{s}"; t.rotation_euler = (math.radians(90), 0, 0); t.location = P(cx + s * 36, 72, zf - 1.8)
        bpy.ops.object.transform_apply(rotation=True); finish(t, yellow, smooth=False)
        bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=2.6, depth=0.3)
        t = bpy.context.object; t.name = f"warn_in_{s}"; t.rotation_euler = (math.radians(90), 0, 0); t.location = P(cx + s * 36, 71.6, zf - 1.95)
        bpy.ops.object.transform_apply(rotation=True); finish(t, dark, smooth=False)
    # 底部深色踢腳
    box("magnet_base", cx - 44, zf + 4, cx + 44, zb - 4, 0, 4, grey, bevel=1.2)

    # 檢查床：底座＋白色圓角柱＋滑軌＋藍色床墊＋頭靠（頭朝磁體那端）
    box("table_foot", cx - 13, 346, cx + 13, 402, 0, 3, grey, bevel=1.0)
    box("table_column", cx - 11, 349, cx + 11, 401, 3, 24, white, bevel=4, seg=6)
    box("table_carriage", cx - 12, 298, cx + 12, 429, 24, 26.6, rail, bevel=0.8)
    box("table_cushion", cx - 13, 296, cx + 13, 430, 26.6, 30, cushion, bevel=1.4, seg=5)
    box("table_head", cx - 8, 420, cx + 8, 430, 29.6, 31.0, mat("mri_head", (0.12, 0.20, 0.36), 0.6), bevel=1.0)
    for s in (-1, 1):                                    # 床兩側扶手滑軌（只在磁體外）
        box(f"side_rail_{s}", cx + s * 13.4 - 0.4, 300, cx + s * 13.4 + 0.4, 396, 25, 27.5, rail, bevel=0.2)
    export("mri_scanner")

# ------------------------------------------------------------------------------------------------
# 抗磁推床（原本：devices.js mrStretcherWithAnne()；座標＝那個函式的本地座標：長軸沿 x、床頭在 -x、y＝高度）
#   床墊頂面高 28（安妮躺在 (2, 28, 0)，不能變）；床欄 z ±13.5、高 32；輪子 x ±38、z ±10
#   抗磁：鋁合金＋塑膠，不用鐵；側面貼綠色 MR Safe 標示
# ------------------------------------------------------------------------------------------------
def cyl_between(name, a, b, r, m, verts=16):          # a、b＝(x, 高度, z)
    va, vb = Vector(P(*a)), Vector(P(*b)); d = vb - va
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=verts)
    o = bpy.context.object; o.name = name; o.location = (va + vb) / 2
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); bpy.ops.object.transform_apply(rotation=True)
    return finish(o, m)

def sphere(name, c, r, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=16, ring_count=8); o = bpy.context.object; o.name = name; o.location = P(*c)
    return finish(o, m)

def mr_stretcher():
    reset()
    alu = mat("str_alu", (0.78, 0.80, 0.83), 0.3, metal=0.7)
    plastic = mat("str_plastic", (0.88, 0.89, 0.91), 0.45)
    grey = mat("str_grey", (0.42, 0.45, 0.50), 0.5)
    dark = mat("str_dark", (0.14, 0.16, 0.19), 0.6)
    rubber = mat("str_rubber", (0.09, 0.10, 0.11), 0.8)
    mattress = mat("str_mattress", (0.80, 0.76, 0.96), 0.75)       # 原本的淡紫色床墊
    seam = mat("str_seam", (0.62, 0.58, 0.80), 0.8)
    pillow = mat("str_pillow", (0.97, 0.97, 0.98), 0.9)
    green = mat("str_green", (0.10, 0.62, 0.30), 0.5)
    white = mat("str_white", (0.98, 0.98, 0.98), 0.5)
    pedal = mat("str_pedal", (0.20, 0.45, 0.85), 0.5)

    # 四個萬向輪：輪子＋輪叉＋轉軸
    for x in (-38, 38):
        for z in (-10, 10):
            w = cyl_z(f"wheel_{x}_{z}", x, 2.4, z, 2.4, 1.4, rubber, verts=24)
            cyl_z(f"hub_{x}_{z}", x, 2.4, z, 1.0, 1.7, alu, verts=16)
            for s in (-1, 1):
                box(f"fork_{x}_{z}_{s}", x - 1.0, z + s * 0.95 - 0.25, x + 1.0, z + s * 0.95 + 0.25, 2.2, 5.6, grey, bevel=0.15)
            box(f"forktop_{x}_{z}", x - 1.2, z - 1.2, x + 1.2, z + 1.2, 5.4, 6.2, grey, bevel=0.2)
    # 底座：鋁框＋塑膠外罩
    box("base_frame", -42, -11, 42, 11, 6, 8, alu, bevel=0.6)
    box("base_cover", -30, -9, 30, 9, 8, 10, plastic, bevel=1.2)
    # 兩支升降柱（伸縮護套一節一節）
    for x in (-24, 24):
        for i in range(5):
            r = 3.6 - i * 0.18
            cyl_between(f"bellow_{x}_{i}", (x, 10 + i * 2.2, 0), (x, 11.8 + i * 2.2, 0), r, plastic, verts=28)
        cyl_between(f"col_top_{x}", (x, 21, 0), (x, 21.5, 0), 3.0, grey, verts=28)
    # 腳踏板（升降／煞車）
    for x, z in ((-34, -11.5), (34, 11.5), (-34, 11.5), (34, -11.5)):
        box(f"pedal_{x}_{z}", x - 2.4, z - 1.2, x + 2.4, z + 1.2, 7.6, 8.8, pedal, bevel=0.3)
    # 床板＋床墊（圓角、有縫線分節）＋枕頭
    box("deck", -47, -13, 47, 13, 21, 24, alu, bevel=1.0)
    box("mattress", -45, -12, 45, 12, 24, 28, mattress, bevel=1.6, seg=5)
    for x in (-15, 15):
        box(f"seam_{x}", x - 0.25, -12.1, x + 0.25, 12.1, 26.5, 28.05, seam)
    box("pillow", -45, -10, -31, 10, 27.9, 30.9, pillow, bevel=1.4, seg=6)
    # 兩側床欄：上下兩根橫桿＋立柱（位置同原本 z ±13.5、高 32）
    for z in (-13.5, 13.5):
        for h in (32, 29.2):
            cyl_between(f"rail_{z}_{h}", (-26, h, z), (34, h, z), 0.5, alu)
        for x in (-24, -4, 16, 32):
            cyl_between(f"post_{z}_{x}", (x, 24, z), (x, 32, z), 0.45, alu)
        sphere(f"railend_a_{z}", (-26, 32, z), 0.65, grey); sphere(f"railend_b_{z}", (34, 32, z), 0.65, grey)
    # 床頭、床尾推把（U 形）
    for x, s in ((-47, -1), (47, 1)):
        xo = x + s * 3.5
        for z in (-9, 9):
            cyl_between(f"handle_up_{x}_{z}", (x, 23, z), (xo, 34, z), 0.6, alu)
        cyl_between(f"handle_bar_{x}", (xo, 34, -9.5), (xo, 34, 9.5), 0.7, dark)
        for z in (-9, 9): sphere(f"handle_j_{x}_{z}", (xo, 34, z), 0.7, alu)
    # 側面綠色 MR Safe 標示（綠底白框＋白色「MR」字樣，即標準 MR Safe 標示的樣式）
    for z, s in ((-13, -1), (13, 1)):
        z1, z2 = sorted((z, z + s * 0.25)); box(f"mr_label_{z}", -4.5, z1, 4.5, z2, 21.15, 23.85, white)
        z1, z2 = sorted((z + s * 0.25, z + s * 0.35)); box(f"mr_label_in_{z}", -4.2, z1, 4.2, z2, 21.35, 23.65, green)
        bpy.ops.object.text_add(); t = bpy.context.object; t.data.body = "MR"; t.data.align_x = "CENTER"; t.data.align_y = "CENTER"
        t.data.size = 1.8; t.data.extrude = 0.05
        bpy.ops.object.convert(target="MESH"); t = bpy.context.object; t.name = f"mr_text_{z}"
        # 文字原本在 XY 平面朝 +Z：轉成貼在側面朝外（配置 z 的 s 方向）
        t.rotation_euler = (math.radians(90), 0, math.radians(180) if s < 0 else 0); t.location = P(0, 22.5, z + s * 0.42)
        bpy.ops.object.transform_apply(rotation=True); finish(t, white, smooth=False)
    export("mr_stretcher")

# ------------------------------------------------------------------------------------------------
# 急救車（原本：devices.js crashCart()；本地座標：正面（抽屜）朝 -z、y＝高度）
#   車身 x ±15、z ±11、高 3–41；上層托盤 32×24、高 40.5–42.5；推把在 +x 側；輪子 x ±12、z ±8
#   托盤上：電擊器（左，x -6）、甦醒球（右，x 8）
# ------------------------------------------------------------------------------------------------
def crash_cart():
    reset()
    red = mat("cart_red", (0.78, 0.08, 0.08), 0.35)
    red2 = mat("cart_red2", (0.62, 0.05, 0.06), 0.4)
    alu = mat("cart_alu", (0.72, 0.74, 0.77), 0.3, metal=0.7)
    grey = mat("cart_grey", (0.45, 0.48, 0.52), 0.45)
    dark = mat("cart_dark", (0.10, 0.11, 0.13), 0.6)
    rubber = mat("cart_rubber", (0.08, 0.08, 0.09), 0.8)
    yellow = mat("cart_yellow", (0.98, 0.78, 0.10), 0.4)
    screen = mat("cart_screen", (0.02, 0.05, 0.08), 0.2, emit=(0.15, 0.85, 0.45), strength=1.0)
    blue = mat("cart_blue", (0.15, 0.36, 0.85), 0.6)
    clear = mat("cart_clear", (0.55, 0.85, 0.60), 0.4)
    board = mat("cart_board", (0.95, 0.55, 0.10), 0.5)
    tags = [mat(f"cart_tag{i}", c, 0.5) for i, c in enumerate([(0.95, 0.95, 0.95), (0.25, 0.55, 0.95), (0.20, 0.70, 0.40), (0.98, 0.80, 0.15), (0.95, 0.95, 0.95)])]

    # 輪子（萬向輪）＋底盤
    for x in (-12, 12):
        for z in (-8, 8):
            bpy.ops.mesh.primitive_cylinder_add(radius=1.6, depth=1.3, vertices=20)
            w = bpy.context.object; w.name = f"wheel_{x}_{z}"; w.rotation_euler = (0, math.radians(90), 0); w.location = P(x, 1.7, z)
            bpy.ops.object.transform_apply(rotation=True); finish(w, rubber)
            box(f"fork_{x}_{z}", x - 1.1, z - 0.6, x + 1.1, z + 0.6, 1.8, 3.4, grey, bevel=0.15)
    box("chassis", -15.5, -11.5, 15.5, 11.5, 3.2, 5, grey, bevel=0.6)
    # 車身：紅色外殼（圓角）、四個角的鋁護角
    box("body", -15, -11, 15, 11, 5, 40.5, red, bevel=1.2, seg=4)
    for x in (-15, 15):
        for z in (-11, 11):
            box(f"corner_{x}_{z}", x - 0.9, z - 0.9, x + 0.9, z + 0.9, 4.5, 40.6, alu, bevel=0.5, seg=3)
    # 正面五層抽屜：抽屜面板＋鋁把手＋彩色標籤條（不放文字）
    rows = [(6, 11.5), (12.3, 17.8), (18.6, 24.1), (24.9, 32.4), (33.2, 39.6)]
    for i, (y1, y2) in enumerate(rows):
        box(f"drawer_{i}", -13.6, -11.6, 13.6, -11.0, y1, y2, red2, bevel=0.3)
        box(f"handle_{i}", -6, -12.5, 6, -11.6, y2 - 1.9, y2 - 1.1, alu, bevel=0.25)
        box(f"tag_{i}", 8, -11.75, 12.5, -11.55, y1 + 1, y1 + 2.6, tags[i])
    # 抽屜封條鎖（右上角小黃片）
    box("seal", 12.6, -12.1, 13.6, -11.5, 37.2, 38.6, yellow, bevel=0.1)
    # 上層托盤：鋁面＋四周凸邊
    box("tray", -16, -12, 16, 12, 40.5, 41.6, alu, bevel=0.6)
    for (x1, z1, x2, z2) in ((-16, -12, 16, -11.2), (-16, 11.2, 16, 12), (-16, -12, -15.2, 12), (15.2, -12, 16, 12)):
        box(f"lip_{x1}_{z1}", x1, z1, x2, z2, 41.6, 42.6, alu, bevel=0.2)
    # 推把（+x 側，U 形）
    for z in (-6, 6):
        box(f"handle_arm_{z}", 15, z - 0.6, 18.5, z + 0.6, 33.4, 34.6, alu, bevel=0.3)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=13.5, vertices=16)
    h = bpy.context.object; h.name = "push_bar"; h.rotation_euler = (math.radians(90), 0, 0); h.location = P(18.7, 34, 0)
    bpy.ops.object.transform_apply(rotation=True); finish(h, dark)
    # 背面：CPR 背板（橘色）
    box("cpr_board", -13, 11.1, 13, 12.3, 10, 38, board, bevel=0.6)
    # 左側：銳器收集盒（黃底紅蓋）
    box("sharps", -18.2, -5, -15.2, 3, 26, 34, yellow, bevel=0.5)
    box("sharps_lid", -18.4, -5.2, -15.0, 3.2, 34, 35.4, mat("cart_lid", (0.85, 0.12, 0.10), 0.4), bevel=0.4)

    # 電擊器（原本位置 x -6、托盤上；黃色機身＋深色螢幕＋按鍵＋兩片電擊板）
    box("defib", -12.5, -5, 0.5, 5, 41.6, 48.6, yellow, bevel=1.0, seg=4)
    box("defib_face", -11.8, -5.4, -0.2, -4.8, 42.5, 48, dark, bevel=0.3)
    box("defib_screen", -11.2, -5.6, -4.5, -5.3, 43.3, 47.4, screen)
    for i, c in enumerate([(0.9, 0.15, 0.1), (0.15, 0.75, 0.3), (0.95, 0.75, 0.1)]):
        box(f"defib_btn_{i}", -3.6, -5.6, -1.2, -5.3, 46.3 - i * 1.6, 47.3 - i * 1.6, mat(f"cart_db{i}", c, 0.4, emit=c, strength=0.6))
    for x in (-9.5, -3.5):
        box(f"paddle_{x}", x - 2.4, -3, x + 2.4, 3.5, 48.6, 50, dark, bevel=0.5)
        box(f"paddle_grip_{x}", x - 0.8, -1.5, x + 0.8, 2, 50, 51.2, grey, bevel=0.3)

    # 甦醒球（原本位置 x 8、z 2；藍色球體＋面罩＋儲氧袋）
    bpy.ops.mesh.primitive_uv_sphere_add(radius=3.2, segments=24, ring_count=12)
    b = bpy.context.object; b.name = "bvm_bag"; b.scale = (1.6, 1, 1); b.location = P(7, 45.4, 2)
    bpy.ops.object.transform_apply(scale=True); finish(b, blue)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=2.8, radius2=1.0, depth=2.6)
    m = bpy.context.object; m.name = "bvm_mask"; m.rotation_euler = (0, math.radians(-90), 0); m.location = P(13.4, 45.4, 2)
    bpy.ops.object.transform_apply(rotation=True); finish(m, mat("cart_mask", (0.85, 0.90, 0.95), 0.3))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.9, depth=2, vertices=16)
    v = bpy.context.object; v.name = "bvm_valve"; v.rotation_euler = (0, math.radians(90), 0); v.location = P(12, 45.4, 2)
    bpy.ops.object.transform_apply(rotation=True); finish(v, dark)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.2, segments=16, ring_count=8)
    r = bpy.context.object; r.name = "bvm_reservoir"; r.scale = (1.4, 0.9, 0.8); r.location = P(3, 43.6, 7)
    bpy.ops.object.transform_apply(scale=True); finish(r, clear)
    export("crash_cart")

# ------------------------------------------------------------------------------------------------
# 生理監視器（原本：devices.js patientMonitor()；本地座標：螢幕朝 -z、y＝高度）
#   機頭中心 (0, 76, -4)、往後仰 0.12 弧度；機頭 28×21×7；螢幕（簡報裡會動的波形，保留原本那片）在機頭本地 z -3.75、23.4×16.1
#   導線從機頭右下 (10, 64, -3) 出來；立桿 0–67、五腳輪座半徑 13；配件籃高 41–47
# ------------------------------------------------------------------------------------------------
from mathutils import Matrix

def rotate_about(objs, pivot, angle):              # 繞配置圖 x 軸（＝Blender X）轉
    p = Vector(P(*pivot)); M = Matrix.Translation(p) @ Matrix.Rotation(angle, 4, "X") @ Matrix.Translation(-p)
    for o in objs: o.matrix_world = M @ o.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

def tube(name, pts, r, m):                           # pts＝[(x, 高度, z)…]，平滑曲線管
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new("NURBS"); sp.points.add(len(pts) - 1); sp.use_endpoint_u = True; sp.order_u = 3
    for i, q in enumerate(pts): sp.points[i].co = (*P(*q), 1)
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.convert(target="MESH"); o = bpy.context.object
    return finish(o, m)

def patient_monitor():
    reset()
    white = mat("pm_white", (0.92, 0.93, 0.95), 0.35)
    grey2 = mat("pm_grey2", (0.70, 0.73, 0.77), 0.4)
    alu = mat("pm_alu", (0.72, 0.74, 0.77), 0.3, metal=0.7)
    dark = mat("pm_dark", (0.07, 0.08, 0.10), 0.35)
    knobm = mat("pm_knob", (0.20, 0.23, 0.28), 0.5)
    rubber = mat("pm_rubber", (0.08, 0.08, 0.09), 0.8)
    cable = mat("pm_cable", (0.07, 0.09, 0.11), 0.6)
    led = mat("pm_led", (0.13, 0.77, 0.37), 0.3, emit=(0.13, 0.85, 0.37), strength=2.0)
    lamp = mat("pm_lamp", (0.75, 0.85, 0.95), 0.25, emit=(0.55, 0.75, 1.0), strength=0.5)
    btnc = [(0.85, 0.15, 0.12), (0.95, 0.70, 0.10), (0.30, 0.32, 0.36), (0.30, 0.32, 0.36), (0.30, 0.32, 0.36)]

    # 五腳輪座
    cyl_between("hub", (0, 1.6, 0), (0, 4.6, 0), 2.7, alu, verts=24)
    for i in range(5):
        a = i / 5 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1); l = bpy.context.object; l.name = f"leg_{i}"
        l.scale = (13, 2.0, 1.2); l.location = P(math.cos(a) * 6.5, 3.2, math.sin(a) * 6.5); l.rotation_euler = (0, 0, -a)
        bpy.ops.object.transform_apply(scale=True, rotation=True); finish(l, alu, bevel=0.3)
        x, z = math.cos(a) * 13, math.sin(a) * 13
        box(f"caster_{i}", x - 0.8, z - 0.8, x + 0.8, z + 0.8, 2.2, 3.2, knobm, bevel=0.2)
        bpy.ops.mesh.primitive_cylinder_add(radius=1.3, depth=1.1, vertices=18)
        w = bpy.context.object; w.name = f"wheel_{i}"; w.rotation_euler = (0, math.radians(90), -a); w.location = P(x, 1.3, z)
        bpy.ops.object.transform_apply(rotation=True); finish(w, rubber)
    # 立桿＋高度調整環
    cyl_between("pole", (0, 4.6, 0), (0, 67, 0), 1.2, alu, verts=20)
    cyl_between("collar", (0, 28, 0), (0, 30.5, 0), 1.7, knobm, verts=20)
    # 配件籃（開口網籃）＋捲起來的備用導線
    box("basket_bottom", -4.5, -3, 4.5, 3, 41, 41.6, grey2, bevel=0.2)
    for (x1, z1, x2, z2) in ((-4.5, -3, 4.5, -2.6), (-4.5, 2.6, 4.5, 3), (-4.5, -3, -4.1, 3), (4.1, -3, 4.5, 3)):
        box(f"basket_wall_{x1}_{z1}", x1, z1, x2, z2, 41, 47, grey2, bevel=0.1)
    bpy.ops.mesh.primitive_torus_add(major_radius=2.4, minor_radius=0.35, major_segments=32, minor_segments=8)
    t = bpy.context.object; t.name = "coil"; t.location = P(0, 42.2, 0); finish(t, cable)
    box("basket_clamp", -1.6, 2.6, 1.6, 3.6, 43, 46, knobm, bevel=0.3)
    # 支架（立桿 → 機頭背面）
    box("mount", -1.6, -5, 1.6, 1, 66.5, 69.5, knobm, bevel=0.5)
    cyl_between("tilt_joint", (-2.4, 68, -4.6), (2.4, 68, -4.6), 1.3, alu)

    # 機頭（先照沒仰的位置做，最後整組繞 (0, 76, -4) 往後仰）
    hx, hy, hz = 0, 76, -4
    H = []
    H.append(box("head", -14, hz - 3.5, 14, hz + 3.5, hy - 10.5, hy + 10.5, white, bevel=2.0, seg=5))
    H.append(box("head_back", -10, hz + 3, 10, hz + 6, hy - 7.5, hy + 7.5, white, bevel=2.0, seg=5))
    H.append(box("bezel", -13, hz - 3.7, 13, hz - 3.3, hy - 9.25, hy + 9.25, dark, bevel=0.4))
    # 右下旋鈕（原本位置 12, -8.2）、右上綠燈（原本位置 12, 8.6）
    H.append(cyl_z("knob", 12, hy - 8.2, hz - 4.1, 1.4, 1.2, knobm, verts=24))
    H.append(cyl_z("knob_cap", 12, hy - 8.2, hz - 4.75, 0.7, 0.2, alu, verts=16))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=12, ring_count=6); s = bpy.context.object; s.name = "led"; s.location = P(12.2, hy + 8.6, hz - 3.8); H.append(finish(s, led))
    # 機頭下緣一排按鍵（紅＝警報暫停、黃＝靜音…只有顏色不放字）
    for i, c in enumerate(btnc):
        x = -11 + i * 2.6
        H.append(box(f"key_{i}", x - 0.9, hz - 3.9, x + 0.9, hz - 3.4, hy - 10.2, hy - 9.5, mat(f"pm_key{i}", c, 0.4)))
    # 頂部警示燈條＋背面提把
    H.append(box("alarm_lamp", -4.5, hz - 2.6, 4.5, hz + 0.6, hy + 10.2, hy + 11.6, lamp, bevel=0.5))
    for x in (-7, 7):
        H.append(box(f"handle_post_{x}", x - 0.8, hz + 1.6, x + 0.8, hz + 3.2, hy + 10, hy + 14, white, bevel=0.4))
    H.append(cyl_between("handle_bar", (-7.6, hy + 14, hz + 2.4), (7.6, hy + 14, hz + 2.4), 0.9, white))
    # 右下導線接頭座（導線從這裡出來）
    H.append(box("conn_block", 6.5, hz - 2.2, 13.5, hz + 2.2, hy - 12.4, hy - 10.2, grey2, bevel=0.5))
    for i, c in enumerate([(0.15, 0.4, 0.85), (0.9, 0.2, 0.2), (0.25, 0.25, 0.28)]):
        H.append(cyl_between(f"conn_{i}", (8 + i * 2.4, hy - 12.4, hz - 3 + 4), (8 + i * 2.4, hy - 13.4, hz - 3 + 4), 0.55, mat(f"pm_conn{i}", c, 0.4)))
    rotate_about(H, (hx, hy, hz), -0.12)

    # 垂下的導線（同原本）
    tube("cable", [(10, 66, -2), (13, 52, -6), (9, 40, -9)], 0.35, cable)
    export("patient_monitor")

# ------------------------------------------------------------------------------------------------
# 對比劑打藥機（雙筒注射器，原本：devices.js contrastInjector()；本地座標：注射頭朝 -x、y＝高度）
#   五腳輪座半徑 13；立桿高 3–59；關節 (0, 60)；橫臂 x -15–1、高 62；注射頭中心 (-15, 63, 0)、繞 z 轉 0.5 往下傾
#   注射頭本地：機身 14×9×16；頂面螢幕（簡報裡畫的，保留原本那片）在 (2, 4.95, 0)；
#   兩支針筒沿 -x：A（z -4）對比劑琥珀色、B（z +4）生理食鹽水藍色；延長管同原本曲線，末端 (-36, 31.4, 30) 接到病人
# ------------------------------------------------------------------------------------------------
def rotate_axis(objs, pivot, angle, axis):
    p = Vector(P(*pivot)); M = Matrix.Translation(p) @ Matrix.Rotation(angle, 4, Vector(axis)) @ Matrix.Translation(-p)
    for o in objs: o.matrix_world = M @ o.matrix_world
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

def glass_mat(name, color, alpha):
    if name in _mats: return _mats[name]
    m = mat(name, color, 0.05); b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Alpha"].default_value = alpha
    try: m.surface_render_method = "BLENDED"
    except Exception: m.blend_method = "BLEND"
    return m

def cyl_x(name, x, y, z, r, depth, m, verts=32, r2=None):   # 沿本地 x 的圓柱／圓錐（r＝-x 端半徑）
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r2, radius2=r, depth=depth, vertices=verts)
    o = bpy.context.object; o.name = name; o.rotation_euler = (0, math.radians(-90), 0); o.location = P(x, y, z)
    bpy.ops.object.transform_apply(rotation=True)
    return finish(o, m)

def contrast_injector():
    reset()
    white = mat("inj_white", (0.94, 0.95, 0.96), 0.35)
    grey2 = mat("inj_grey2", (0.78, 0.80, 0.84), 0.4)
    alu = mat("inj_alu", (0.72, 0.74, 0.77), 0.3, metal=0.7)
    dark = mat("inj_dark", (0.06, 0.07, 0.10), 0.35)
    knobm = mat("inj_knob", (0.20, 0.23, 0.28), 0.5)
    rubber = mat("inj_rubber", (0.08, 0.08, 0.09), 0.8)
    glass = glass_mat("inj_glass", (0.88, 0.95, 1.0), 0.25)
    tubem = glass_mat("inj_tube", (0.88, 0.95, 1.0), 0.65)
    amber = mat("inj_amber", (0.96, 0.62, 0.04), 0.25, emit=(0.96, 0.62, 0.04), strength=0.35)
    saline = mat("inj_saline", (0.22, 0.74, 0.97), 0.25, emit=(0.22, 0.74, 0.97), strength=0.35)
    ringA = mat("inj_ringA", (0.96, 0.62, 0.04), 0.3, emit=(0.96, 0.62, 0.04), strength=1.2)
    ringB = mat("inj_ringB", (0.22, 0.74, 0.97), 0.3, emit=(0.22, 0.74, 0.97), strength=1.2)

    # 五腳輪座（同監視器）
    cyl_between("hub", (0, 1.6, 0), (0, 4.6, 0), 2.9, alu, verts=24)
    for i in range(5):
        a = i / 5 * math.tau
        bpy.ops.mesh.primitive_cube_add(size=1); l = bpy.context.object; l.name = f"leg_{i}"
        l.scale = (13, 2.0, 1.2); l.location = P(math.cos(a) * 6.5, 3.2, math.sin(a) * 6.5); l.rotation_euler = (0, 0, -a)
        bpy.ops.object.transform_apply(scale=True, rotation=True); finish(l, alu, bevel=0.3)
        x, z = math.cos(a) * 13, math.sin(a) * 13
        box(f"caster_{i}", x - 0.8, z - 0.8, x + 0.8, z + 0.8, 2.2, 3.2, knobm, bevel=0.2)
        bpy.ops.mesh.primitive_cylinder_add(radius=1.3, depth=1.1, vertices=18)
        w = bpy.context.object; w.name = f"wheel_{i}"; w.rotation_euler = (0, math.radians(90), -a); w.location = P(x, 1.3, z)
        bpy.ops.object.transform_apply(rotation=True); finish(w, rubber)
    # 立桿（下粗上細）＋電源盒＋高度調整環
    bpy.ops.mesh.primitive_cone_add(radius1=2.6, radius2=2.2, depth=54.4, vertices=28)
    o = bpy.context.object; o.name = "pole"; o.location = P(0, 4.6 + 27.2, 0); finish(o, alu)
    box("power_box", -4.5, -3.5, 4.5, 3.5, 12, 22, white, bevel=1.2, seg=4)
    box("power_led", -1, -3.7, 1, -3.4, 20, 20.8, mat("inj_led", (0.13, 0.77, 0.37), 0.3, emit=(0.13, 0.85, 0.37), strength=2.0))
    cyl_between("collar", (0, 44, 0), (0, 46.5, 0), 3.0, knobm, verts=24)
    # 關節＋橫臂
    box("joint", -3, -3, 3, 3, 57.5, 62.5, white, bevel=1.2, seg=4)
    cyl_z("joint_knob", 0, 60, -3.4, 1.4, 1.2, knobm, verts=20)
    box("arm", -15, -2, 1, 2, 60.3, 63.7, white, bevel=1.2, seg=4)

    # 注射頭（先照沒傾斜的位置做，最後整組繞 (-15, 63, 0) 轉 0.5）
    hx, hy, hz = -15, 63, 0
    H = [box("head", hx - 7, hz - 8, hx + 7, hz + 8, hy - 4.5, hy + 4.5, white, bevel=2.2, seg=5)]
    H.append(box("head_top", hx - 2, hz - 5, hx + 6, hz + 5, hy + 4.3, hy + 4.9, dark, bevel=0.25))      # 螢幕底框
    H.append(box("holder", hx - 8.5, hz - 7, hx - 5.5, hz + 7, hy - 5, hy + 5, grey2, bevel=0.8))         # 筒座（面板）
    # 側面手動旋鈕（推進／回抽）
    for z in (-8.3, 8.3):
        H.append(cyl_between(f"side_knob_{z}", (hx + 3, hy, z), (hx + 3, hy, z + (0.9 if z > 0 else -0.9)), 1.6, knobm, verts=24))
    for z, fluid, ring in ((-4, amber, ringA), (4, saline, ringB)):
        H.append(cyl_x(f"syringe_{z}", hx - 15, hy, z, 2.6, 16, glass, verts=32))              # 針筒外筒（透明）
        H.append(cyl_x(f"fluid_{z}", hx - 17, hy, z, 2.3, 11, fluid, verts=24))                # 藥液
        H.append(cyl_x(f"plunger_{z}", hx - 10.5, hy, z, 2.35, 1.2, knobm, verts=24))         # 推桿頭
        H.append(cyl_x(f"rod_{z}", hx - 8, hy, z, 0.7, 4, alu, verts=12))                       # 推桿
        H.append(cyl_x(f"tip_{z}", hx - 24.2, hy, z, 0.6, 2.6, glass, verts=16, r2=1.6))        # 錐形前端
        H.append(cyl_x(f"ring_{z}", hx - 9.2, hy, z, 2.9, 0.6, ring, verts=32))                 # 筒座發光環（A 琥珀、B 藍）
        H.append(cyl_x(f"luer_{z}", hx - 25.9, hy, z, 0.55, 1.0, grey2, verts=12))              # 接頭
    # 兩支針筒前端合流的 Y 形接頭
    H.append(cyl_between("y_a", (hx - 26.4, hy, -4), (hx - 29, hy, 0), 0.45, tubem))
    H.append(cyl_between("y_b", (hx - 26.4, hy, 4), (hx - 29, hy, 0), 0.45, tubem))
    rotate_axis(H, (hx, hy, hz), 0.5, (0, -1, 0))           # three.js 繞 z 轉 0.5 ＝ Blender 繞 -Y 轉 0.5

    # 延長管（同原本曲線）
    tube("ext_tube", [(-36, 49, 0), (-41, 42, 6), (-40, 35, 16), (-36, 31.4, 30)], 0.45, tubem)
    export("contrast_injector")

# ------------------------------------------------------------------------------------------------
# 氧氣鋼瓶（推車式，原本：devices.js oxygenCylinder()；本地座標：壓力錶朝 -z、y＝高度）
#   綠色鋼瓶 r5.5、高 3–51＋圓頂；閥門 y 55–59；壓力錶 (0, 60, -1.6)；推車底座 14×12、後輪 x ±6、z 5；立架 x ±5、z 6
#   氧氣管（簡報另外畫）從 (0, 56.7, 0) 接出
# ------------------------------------------------------------------------------------------------
def oxygen_cylinder():
    reset()
    green = mat("o2_green", (0.05, 0.42, 0.18), 0.3, metal=0.2)
    band = mat("o2_band", (0.93, 0.94, 0.95), 0.5)
    brass = mat("o2_brass", (0.70, 0.55, 0.30), 0.25, metal=0.85)
    frame = mat("o2_frame", (0.58, 0.61, 0.65), 0.35, metal=0.6)
    dark = mat("o2_dark", (0.10, 0.11, 0.13), 0.6)
    rubber = mat("o2_rubber", (0.08, 0.08, 0.09), 0.8)
    face = mat("o2_face", (0.97, 0.97, 0.97), 0.4)
    red = mat("o2_red", (0.86, 0.12, 0.10), 0.4)
    flow = glass_mat("o2_flow", (0.85, 0.95, 1.0), 0.35)
    knobg = mat("o2_knobg", (0.15, 0.70, 0.35), 0.4)

    # 推車：底板＋兩個後輪＋前面小腳＋立架＋上橫桿＋把手
    box("base", -7, -6, 7, 6, 1.4, 3.0, frame, bevel=0.5)
    for x in (-6, 6):
        bpy.ops.mesh.primitive_cylinder_add(radius=2.4, depth=1.4, vertices=24)
        w = bpy.context.object; w.name = f"wheel_{x}"; w.rotation_euler = (0, math.radians(90), 0); w.location = P(x + (0.9 if x > 0 else -0.9), 2.4, 5)
        bpy.ops.object.transform_apply(rotation=True); finish(w, rubber)
        cyl_between(f"hubcap_{x}", (x + (1.7 if x > 0 else -1.7), 2.4, 5), (x + (1.9 if x > 0 else -1.9), 2.4, 5), 1.0, frame)
        box(f"foot_{x}", x - 1, -6, x + 1, -4, 0, 1.4, rubber, bevel=0.3)
        cyl_between(f"upright_{x}", (x, 3, 6), (x, 52, 6), 0.6, frame, verts=12)
    cyl_between("top_bar", (-5, 51, 6), (5, 51, 6), 0.6, frame, verts=12)
    cyl_between("handle", (-5, 52, 6), (-5, 56, 9), 0.6, frame, verts=12)
    cyl_between("handle2", (5, 52, 6), (5, 56, 9), 0.6, frame, verts=12)
    cyl_between("grip", (-5.4, 56, 9), (5.4, 56, 9), 0.9, dark, verts=16)
    # 固定帶（兩條）
    for y in (18, 40):
        bpy.ops.mesh.primitive_torus_add(major_radius=5.8, minor_radius=0.35, major_segments=48, minor_segments=8)
        t = bpy.context.object; t.name = f"strap_{y}"; t.location = P(0, y, 0); finish(t, dark)
    # 鋼瓶：圓柱＋圓頂（肩部）＋白色標示帶（不放字）
    cyl_between("cyl", (0, 3, 0), (0, 51, 0), 5.5, green, verts=48)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5.5, segments=48, ring_count=24); s = bpy.context.object; s.name = "dome"
    s.location = P(0, 51, 0); finish(s, green)
    bpy.ops.object.mode_set(mode="EDIT"); bm = bmesh.from_edit_mesh(s.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS"); bmesh.update_edit_mesh(s.data); bpy.ops.object.mode_set(mode="OBJECT")
    cyl_between("label_band", (0, 30, 0), (0, 36, 0), 5.56, band, verts=48)
    cyl_between("neck", (0, 56, 0), (0, 57, 0), 1.8, green, verts=24)
    # 閥門＋調節器
    cyl_between("valve", (0, 55, 0), (0, 59, 0), 1.6, brass, verts=24)
    cyl_between("valve_wheel", (0, 59, 0), (0, 60, 0), 2.4, dark, verts=12)
    box("regulator", -1.4, -1.6, 1.4, 1.6, 56, 58.6, brass, bevel=0.4)
    # 壓力錶（朝 -z）：外框＋白色錶面＋紅色指針
    cyl_z("gauge_rim", 0, 60, -1.6, 2.7, 1.2, dark, verts=32)
    cyl_z("gauge_face", 0, 60, -2.25, 2.3, 0.1, face, verts=32)
    box("needle", 0.1, -2.4, 0.5, -2.3, 60, 62, red)
    cyl_between("gauge_stem", (0, 58.6, -0.8), (0, 59.2, -1.2), 0.6, brass)
    # 流量計（透明管＋浮球）＋綠色流量旋鈕＋出口接頭（氧氣管從這裡接出）
    # 流量計放在壓力錶右側（從正面看得到浮球；簡報裡轉旋鈕時浮球會升到頂＝開到最大）
    fx, fz = 4.8, -0.8
    cyl_between("flow_arm", (1.2, 57.6, -0.2), (fx, 57.6, fz), 0.5, brass, verts=12)
    cyl_between("flow_tube", (fx, 56.7, fz), (fx, 63, fz), 0.75, flow, verts=20)
    sphere("flow_ball", (fx, 59, fz), 0.5, mat("o2_ball", (0.95, 0.95, 0.95), 0.3))
    cyl_between("flow_cap", (fx, 63, fz), (fx, 63.8, fz), 0.9, brass, verts=20)
    knob = cyl_between("flow_knob", (fx, 55.4, fz), (fx, 56.7, fz), 1.15, knobg, verts=20)
    ribs = []
    for i in range(6):                                   # 旋鈕上的防滑凸紋（併進旋鈕，轉動時看得出來）
        a = i / 6 * math.tau
        ribs.append(box(f"knob_rib_{i}", fx + math.cos(a) * 1.15 - 0.15, fz + math.sin(a) * 1.15 - 0.15, fx + math.cos(a) * 1.15 + 0.15, fz + math.sin(a) * 1.15 + 0.15, 55.5, 56.6, knobg))
    bpy.ops.object.select_all(action="DESELECT")
    for o in ribs + [knob]: o.select_set(True)
    bpy.context.view_layer.objects.active = knob; bpy.ops.object.join()
    cyl_between("outlet", (0, 56.7, -1.5), (0, 56.7, -3.4), 0.45, brass, verts=12)
    export("oxygen_cylinder")

# ------------------------------------------------------------------------------------------------
# 輪椅（原本：devices.js wheelchair()；本地座標：座位朝 -z、y＝高度）
#   座墊 18×18、高 20；靠背在 z 9、高 21–39；大輪 x ±11、中心 (y 11.5, z 4)、半徑 11；手推圈在大輪外側 1.6
#   前小輪 x ±8、z -9、半徑 2.2；扶手高 27；推把高 40.5；腳踏板 x ±4、高 5、z -13
# ------------------------------------------------------------------------------------------------
def wheelchair():
    reset()
    frame = mat("wc_frame", (0.62, 0.65, 0.69), 0.3, metal=0.75)
    seat = mat("wc_seat", (0.12, 0.14, 0.18), 0.85)
    tyre = mat("wc_tyre", (0.07, 0.07, 0.08), 0.85)
    rimm = mat("wc_rim", (0.70, 0.72, 0.75), 0.25, metal=0.85)
    grip = mat("wc_grip", (0.08, 0.08, 0.09), 0.7)
    pad = mat("wc_pad", (0.16, 0.18, 0.22), 0.7)

    def ring(name, x, y, z, R, r, m, seg=64):           # 圓環在 y-z 平面（輪子）
        bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=12)
        t = bpy.context.object; t.name = name; t.rotation_euler = (0, math.radians(90), 0); t.location = P(x, y, z)
        bpy.ops.object.transform_apply(rotation=True); return finish(t, m)

    for s in (-1, 1):
        x = s * 11
        # 大輪：輪胎＋輪框＋輻條＋輪轂＋手推圈
        ring(f"tyre_{s}", x, 11.5, 4, 10.4, 1.0, tyre)
        ring(f"rim_{s}", x, 11.5, 4, 9.3, 0.35, rimm)
        for i in range(12):
            a = i / 12 * math.tau
            cyl_between(f"spoke_{s}_{i}", (x, 11.5, 4), (x, 11.5 + math.sin(a) * 9.1, 4 + math.cos(a) * 9.1), 0.12, rimm, verts=6)
        cyl_between(f"hub_{s}", (x - 0.9, 11.5, 4), (x + 0.9, 11.5, 4), 1.2, frame, verts=20)
        ring(f"pushrim_{s}", x + s * 1.6, 11.5, 4, 9.5, 0.4, rimm, seg=48)
        for i in range(6):
            a = i / 6 * math.tau
            cyl_between(f"pr_tab_{s}_{i}", (x, 11.5 + math.sin(a) * 9.5, 4 + math.cos(a) * 9.5), (x + s * 1.6, 11.5 + math.sin(a) * 9.5, 4 + math.cos(a) * 9.5), 0.2, rimm, verts=6)
        # 前小輪（萬向）：輪子＋叉＋轉軸
        cx = s * 8
        bpy.ops.mesh.primitive_cylinder_add(radius=2.2, depth=1.1, vertices=24)
        w = bpy.context.object; w.name = f"caster_{s}"; w.rotation_euler = (0, math.radians(90), 0); w.location = P(cx, 2.2, -9)
        bpy.ops.object.transform_apply(rotation=True); finish(w, tyre)
        for d in (-0.85, 0.85):
            box(f"cfork_{s}_{d}", cx + d - 0.2, -9.6, cx + d + 0.2, -8.4, 2.2, 5.6, frame)
        cyl_between(f"cstem_{s}", (cx, 5.6, -9), (cx, 7.5, -8.4), 0.5, frame)
        # 車架：前柱、座下橫管、後柱（靠背）、扶手支柱、推把
        cyl_between(f"front_post_{s}", (s * 9, 7.5, -8.4), (s * 9, 20, -8), 0.5, frame)
        cyl_between(f"seat_rail_{s}", (s * 9, 19.2, -9), (s * 9, 19.2, 9.6), 0.5, frame)
        cyl_between(f"low_rail_{s}", (s * 9, 7.5, -8.4), (s * 9, 9, 9.6), 0.5, frame)
        cyl_between(f"back_post_{s}", (s * 9, 9, 9.6), (s * 9, 40.5, 9.6), 0.55, frame)
        cyl_between(f"push_{s}", (s * 9, 40.5, 9.6), (s * 9, 40.5, 14), 0.55, frame)
        cyl_between(f"pgrip_{s}", (s * 9, 40.5, 11.2), (s * 9, 40.5, 14.4), 0.8, grip)
        cyl_between(f"arm_post_f_{s}", (s * 9.5, 19.2, -5), (s * 9.5, 27, -5), 0.45, frame)
        cyl_between(f"arm_post_b_{s}", (s * 9.5, 19.2, 7), (s * 9.5, 27, 7), 0.45, frame)
        box(f"arm_pad_{s}", s * 9.5 - 1.1, -7, s * 9.5 + 1.1, 9, 27, 28.4, pad, bevel=0.5)
        # 腳踏架＋腳踏板
        cyl_between(f"leg_rest_{s}", (s * 8.5, 19, -8.5), (s * 5.5, 5.5, -12), 0.45, frame)
        box(f"footplate_{s}", s * 4 - 3, -15.5, s * 4 + 3, -10.5, 4.6, 5.4, seat, bevel=0.3)
        # 煞車桿
        cyl_between(f"brake_{s}", (s * 9.6, 16, -1), (s * 9.6, 21, -3), 0.3, grip)
    # 座墊、靠背（布面，中間微凹用兩塊表現）
    box("seat_cushion", -9, -9, 9, 9, 19.2, 21.2, seat, bevel=0.8, seg=4)
    box("back_rest", -9, 9, 9, 10.4, 21, 39, seat, bevel=0.6, seg=4)
    cyl_between("back_bar", (-9, 38.5, 10), (9, 38.5, 10), 0.4, frame)
    cyl_between("cross_a", (-9, 9, 0), (9, 19.2, 6), 0.35, frame)        # 座下交叉折疊架
    cyl_between("cross_b", (9, 9, 0), (-9, 19.2, 6), 0.35, frame)
    export("wheelchair")

PROPS = {"ct_scanner": ct_scanner, "mri_scanner": mri_scanner, "mr_stretcher": mr_stretcher, "crash_cart": crash_cart, "patient_monitor": patient_monitor, "contrast_injector": contrast_injector, "oxygen_cylinder": oxygen_cylinder, "wheelchair": wheelchair}
for name, fn in PROPS.items():
    if WANT and name not in WANT: continue
    fn()
print("DONE", flush=True)
