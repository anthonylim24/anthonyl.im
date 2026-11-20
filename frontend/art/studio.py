"""Shared Blender set-up for the site's pre-rendered art: Cycles on the GPU, a soft product
studio (Poly Haven's CC0 `studio_small_08` for reflections, one large key from the upper left,
as on Lim's stage), a shadow catcher, a framing camera and the materials every subject shares.

Runs headless (`blender -b -P <subject>.py`) or inside a live Blender through the MCP add-on
(`python3 art/bmcp.py exec ...`), so it never resets the file or touches add-ons."""

import math
import os
import urllib.request

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
HDRI = 'studio_small_08'


def lin(hex_colour, alpha=1.0):
    h = hex_colour.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def hdri_path():
    folder = os.path.join(HERE, '.cache')
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{HDRI}_1k.hdr')
    if not os.path.exists(path):
        urllib.request.urlretrieve(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/{HDRI}_1k.hdr', path)
    return path


def reset(name='art'):
    """A fresh scene of our own, with every other datablock we made before removed."""
    scene = bpy.data.scenes.get(name) or bpy.data.scenes.new(name)
    if bpy.context.window:
        bpy.context.window.scene = scene
    for ob in list(scene.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.node_groups):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type != 'CPU'
        scene.cycles.device = 'GPU'
    except Exception:
        scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.max_bounces = 12
    scene.cycles.transparent_max_bounces = 16
    scene.cycles.transmission_bounces = 12
    scene.render.film_transparent = True
    scene.cycles.film_transparent_glass = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.3
    return scene


def size(scene, width, height, samples):
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples


def world(scene, strength=1.0, night=False):
    w = bpy.data.worlds.get('art-studio') or bpy.data.worlds.new('art-studio')
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(hdri_path(), check_existing=True)
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = (0, 0, math.radians(200))
    coord = nt.nodes.new('ShaderNodeTexCoord')
    nt.links.new(coord.outputs['Generated'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], env.inputs['Vector'])
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = lin('#8F86D6' if night else '#FFF4E8')
    nt.links.new(env.outputs['Color'], tint.inputs['A'])
    nt.links.new(tint.outputs['Result'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def area(name, at, target, energy, colour, sz, shadow=True):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.use_shadow = shadow
    data.color = lin(colour)[:3]
    data.shape = 'DISK'
    data.size = sz
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = at
    ob.rotation_euler = (Vector(target) - Vector(at)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def rig(target, radius, night=False):
    """One large soft key high on the upper left, a broad front light for the ambient the world no
    longer gives, a whisper of fill, a rim that outlines the top. Only the key casts shadows."""
    t = Vector(target)
    r = radius
    key = '#C9C2FF' if night else '#FFF3E6'
    area('key', t + Vector((-1.8 * r, -2.4 * r, 5.2 * r)), t, 130 * r * r, key, 3.2 * r)
    area('front', t + Vector((0.4 * r, -4.2 * r, 1.6 * r)), t, 110 * r * r, '#B8AEF0' if night else '#FFF4E8', 7.0 * r, shadow=False)
    area('fill', t + Vector((3.8 * r, -2.6 * r, 1.4 * r)), t, 22 * r * r, '#7A6CC8' if night else '#E4ECFF', 4.0 * r, shadow=False)
    area('rim', t + Vector((1.2 * r, 3.8 * r, 3.0 * r)), t, 90 * r * r, '#B9A8FF' if night else '#FFFFFF', 2.4 * r, shadow=False)


def catcher(z, radius, reach=2.0):
    me = bpy.data.meshes.new('shadow')
    s = radius * 60
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)])
    plane = bpy.data.objects.new('shadow', me)
    bpy.context.scene.collection.objects.link(plane)
    plane.is_shadow_catcher = True
    plane.visible_transmission = False
    plane.visible_glossy = False
    plane.data.materials.append(fade(radius, reach))
    return plane


def fade(radius, reach=2.0):
    """Shadow inside `radius`, none past `reach` times that, and none near the frame's edge, so a shadow never ends in a cut."""
    mat = bpy.data.materials.new('shadow-fade')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    far = nt.nodes.new('ShaderNodeVectorMath')
    far.operation = 'LENGTH'
    nt.links.new(coord.outputs['Object'], far.inputs[0])
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.interpolation_type = 'SMOOTHSTEP'
    ramp.inputs['From Min'].default_value = radius
    ramp.inputs['From Max'].default_value = radius * reach
    nt.links.new(far.outputs['Value'], ramp.inputs['Value'])
    centred = nt.nodes.new('ShaderNodeVectorMath')
    centred.operation = 'MULTIPLY_ADD'
    centred.inputs[1].default_value = (2, 2, 0)
    centred.inputs[2].default_value = (-1, -1, 0)
    nt.links.new(coord.outputs['Window'], centred.inputs[0])
    off = nt.nodes.new('ShaderNodeVectorMath')
    off.operation = 'ABSOLUTE'
    nt.links.new(centred.outputs['Vector'], off.inputs[0])
    xy = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(off.outputs['Vector'], xy.inputs[0])
    edge = nt.nodes.new('ShaderNodeMath')
    edge.operation = 'MAXIMUM'
    nt.links.new(xy.outputs['X'], edge.inputs[0])
    nt.links.new(xy.outputs['Y'], edge.inputs[1])
    border = nt.nodes.new('ShaderNodeMapRange')
    border.interpolation_type = 'SMOOTHSTEP'
    border.inputs['From Min'].default_value = 0.78
    border.inputs['From Max'].default_value = 0.98
    nt.links.new(edge.outputs['Value'], border.inputs['Value'])
    gone = nt.nodes.new('ShaderNodeMath')
    gone.operation = 'MAXIMUM'
    nt.links.new(ramp.outputs['Result'], gone.inputs[0])
    nt.links.new(border.outputs['Result'], gone.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(gone.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfDiffuse').outputs['BSDF'], mix.inputs[1])
    nt.links.new(nt.nodes.new('ShaderNodeHoldout').outputs['Holdout'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return mat


def camera(target, radius, fov=24, elevation=30, fill=1.0):
    """Look at `target` from the front, `elevation` degrees up, close enough that a sphere of `radius` fills the frame."""
    data = bpy.data.cameras.get('art-cam') or bpy.data.cameras.new('art-cam')
    data.lens_unit = 'FOV'
    data.angle = math.radians(fov)
    ob = bpy.data.objects.new('art-cam', data)
    bpy.context.scene.collection.objects.link(ob)
    d = radius / math.sin(math.radians(fov / 2)) / fill
    e = math.radians(elevation)
    ob.location = Vector(target) + Vector((0, -d * math.cos(e), d * math.sin(e)))
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()
    data.clip_start = d * 0.02
    data.clip_end = d * 20
    bpy.context.scene.camera = ob
    return ob


def _principled(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes['Principled BSDF']


def _sparkle(nt, b, amount, scale=320):
    """Sugar under the coat: each tiny cell tips the body's normal at random; the clear coat stays smooth."""
    tex = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.inputs['Scale'].default_value = scale
    nt.links.new(tex.outputs['Object'], vor.inputs['Vector'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    centre = nt.nodes.new('ShaderNodeVectorMath')
    centre.operation = 'SUBTRACT'
    centre.inputs[1].default_value = (0.5, 0.5, 0.5)
    nt.links.new(vor.outputs['Color'], centre.inputs[0])
    scale_v = nt.nodes.new('ShaderNodeVectorMath')
    scale_v.operation = 'SCALE'
    scale_v.inputs['Scale'].default_value = amount
    nt.links.new(centre.outputs['Vector'], scale_v.inputs[0])
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    nt.links.new(geo.outputs['Normal'], add.inputs[0])
    nt.links.new(scale_v.outputs['Vector'], add.inputs[1])
    norm = nt.nodes.new('ShaderNodeVectorMath')
    norm.operation = 'NORMALIZE'
    nt.links.new(add.outputs['Vector'], norm.inputs[0])
    nt.links.new(norm.outputs['Vector'], b.inputs['Normal'])
    nt.links.new(geo.outputs['Normal'], b.inputs['Coat Normal'])


def gummy(name, hex_colour, sss=0.35, rough=0.3, coat=1.0, sparkle=0.0, transmission=0.0, sheen=0.0, sss_scale=0.05):
    """Sorbet plastic: a saturated body that glows a little where it is thin, under a clear wet coat."""
    m, nt, b = _principled(name)
    c = lin(hex_colour)
    b.inputs['Base Color'].default_value = c
    b.inputs['Roughness'].default_value = rough
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.45, 0.3)
    b.inputs['Subsurface Scale'].default_value = sss_scale
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.05
    b.inputs['Transmission Weight'].default_value = transmission
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Tint'].default_value = c
    if sparkle:
        _sparkle(nt, b, sparkle)
    return m


def matte(name, hex_colour, rough=0.6, sss=0.1, bump=0.0, bump_scale=60):
    """Baked dough, felt, terracotta: no coat, a soft grain."""
    m, nt, b = _principled(name)
    b.inputs['Base Color'].default_value = lin(hex_colour)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Subsurface Weight'].default_value = sss
    b.inputs['Subsurface Scale'].default_value = 0.03
    if bump:
        tex = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = bump_scale
        noise.inputs['Detail'].default_value = 6
        nt.links.new(tex.outputs['Object'], noise.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.01
        nt.links.new(noise.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def glass(name, hex_colour, rough=0.03, ior=1.31):
    m, nt, b = _principled(name)
    b.inputs['Base Color'].default_value = lin(hex_colour)
    b.inputs['Roughness'].default_value = rough
    b.inputs['IOR'].default_value = ior
    b.inputs['Transmission Weight'].default_value = 1.0
    return m


def gloss(name, hex_colour, rough=0.15, metallic=0.0):
    m, nt, b = _principled(name)
    b.inputs['Base Color'].default_value = lin(hex_colour)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Coat Weight'].default_value = 0.8
    b.inputs['Coat Roughness'].default_value = 0.03
    return m


def bounds(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        if ob.type not in ('MESH', 'CURVE') or ob.hide_render:
            continue
        ev = ob.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            lo = Vector(min(lo[i], w[i]) for i in range(3))
            hi = Vector(max(hi[i], w[i]) for i in range(3))
        ev.to_mesh_clear()
    return lo, hi


def reach(objs, target):
    """How far the farthest point of `objs` is from `target`: the sphere that stays in frame all the way round."""
    deps = bpy.context.evaluated_depsgraph_get()
    t = Vector(target)
    far = 0.0
    for ob in objs:
        if ob.type not in ('MESH', 'CURVE') or ob.hide_render:
            continue
        ev = ob.evaluated_get(deps)
        me = ev.to_mesh()
        for v in me.vertices:
            far = max(far, ((ev.matrix_world @ v.co) - t).length)
        ev.to_mesh_clear()
    return far


def render(path, scene=None):
    scene = scene or bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=scene.name)
