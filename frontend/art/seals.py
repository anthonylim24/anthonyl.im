"""BreathFlow's badges as real wax seals: a puddle of wax in the badge's pigment, pressed with a stamp
that leaves a sunken field, a beaded ring and the badge's Fraunces monogram in relief.

Headless:  blender -b -P art/seals.py -- <seals.json> <out-dir> <font.ttf> [--samples 128] [--res 288]
"""

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio  # noqa: E402

HEIGHT = 0.2
PRESS = 0.05
FIELD = 0.7


def wax(hex_colour, lift=0.0):
    """Sealing wax. `lift` mixes it toward cream, for the raised design to catch the eye at badge size."""
    m, nt, b = studio._principled('wax')
    c, cream = studio.lin(hex_colour), studio.lin('#FFF1DC')
    b.inputs['Base Color'].default_value = tuple(x + (y - x) * lift for x, y in zip(c, cream))
    b.inputs['Roughness'].default_value = 0.4
    b.inputs['Subsurface Weight'].default_value = 0.25
    b.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
    b.inputs['Subsurface Scale'].default_value = 0.02
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 18
    noise.inputs['Detail'].default_value = 8
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.004
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def link(name, me, mat):
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def puddle(rng, mat):
    """An uneven disc of wax with two or three runs where it spread further, its edge rounded over."""
    waves = [(k, rng.uniform(0.008, 0.03) / k * 2, rng.uniform(0, math.tau)) for k in range(2, 8)]
    runs = [(rng.uniform(0, math.tau), rng.uniform(0.05, 0.11)) for _ in range(rng.randint(2, 3))]

    def edge(theta):
        r = 1 + sum(a * math.sin(k * theta + p) for k, a, p in waves)
        for at, amp in runs:
            d = math.atan2(math.sin(theta - at), math.cos(theta - at))
            r += amp * math.exp(-(d / 0.22) ** 2)
        return r

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=128, radius1=1, radius2=1, depth=HEIGHT)
    for v in bm.verts:
        r = edge(math.atan2(v.co.y, v.co.x))
        top = v.co.z > 0
        v.co.x *= r * (0.97 if top else 1.0)
        v.co.y *= r * (0.97 if top else 1.0)
        v.co.z += HEIGHT / 2
    me = bpy.data.meshes.new('puddle')
    bm.to_mesh(me)
    bm.free()
    ob = link('puddle', me, mat)
    bevel = ob.modifiers.new('round', 'BEVEL')
    bevel.width = 0.085
    bevel.segments = 6
    bevel.limit_method = 'ANGLE'
    ob.modifiers.new('smooth', 'SUBSURF').levels = 2
    press = bpy.data.meshes.new('press')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=FIELD, radius2=FIELD, depth=0.4)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, HEIGHT - PRESS + 0.2))
    bm.to_mesh(press)
    bm.free()
    stamp = bpy.data.objects.new('stamp', press)
    bpy.context.scene.collection.objects.link(stamp)
    stamp.hide_render = True
    cut = ob.modifiers.new('press', 'BOOLEAN')
    cut.operation = 'DIFFERENCE'
    cut.object = stamp
    cut.solver = 'EXACT'
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def ridge(rng, mat):
    """The wax the stamp squeezed up around itself."""
    curve = bpy.data.curves.new('ridge', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    pts = [(math.cos(t), math.sin(t)) for t in (i / 96 * math.tau for i in range(96))]
    spline.points.add(len(pts) - 1)
    for i, (x, y) in enumerate(pts):
        lift = 1 + 0.35 * math.sin(3 * i / 96 * math.tau + rng.uniform(0, 0.4))
        spline.points[i].co = ((FIELD + 0.035) * x, (FIELD + 0.035) * y, HEIGHT - 0.012, 1)
        spline.points[i].radius = lift
    spline.use_cyclic_u = True
    curve.bevel_depth = 0.028
    curve.bevel_resolution = 4
    ob = bpy.data.objects.new('ridge', curve)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def beads(mat):
    floor = HEIGHT - PRESS
    obs = []
    for i in range(44):
        t = i / 44 * math.tau
        me = bpy.data.meshes.new('bead')
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.022)
        bmesh.ops.translate(bm, verts=bm.verts, vec=(0.6 * math.cos(t), 0.6 * math.sin(t), floor))
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        obs.append(link('bead', me, mat))
    return obs


def monogram(letter, font, mat):
    curve = bpy.data.curves.new('monogram', 'FONT')
    curve.body = letter
    curve.font = bpy.data.fonts.load(font, check_existing=True)
    curve.size = 1.0
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.extrude = 0.03
    curve.bevel_depth = 0.008
    curve.bevel_resolution = 3
    ob = bpy.data.objects.new('monogram', curve)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (0, 0.02, HEIGHT - PRESS + 0.03)
    ob.data.materials.append(mat)
    return ob


def seal(spec, out, font, samples=128, res=288):
    scene = studio.reset()
    studio.size(scene, res, res, samples)
    rng = random.Random(spec['id'])
    mat = wax(spec['ink'])
    raised = wax(spec['ink'], lift=0.35)
    puddle(rng, mat)
    ridge(rng, mat)
    beads(raised)
    monogram(spec['letter'], font, raised)
    target = (0, 0, HEIGHT / 2)
    radius = 1.22
    studio.world(scene, strength=0.9)
    studio.rig(target, radius)
    studio.area('graze', (-3.4, 1.4, 0.9), target, 60, '#FFF3E6', 1.2)
    studio.catcher(0, 1.0, reach=1.3)
    studio.camera(target, radius, elevation=62)
    path = os.path.join(out, f"{spec['id']}.png")
    studio.render(path, scene)
    return path


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('specs')
    ap.add_argument('out')
    ap.add_argument('font')
    ap.add_argument('--only', default='')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--res', type=int, default=288)
    args = ap.parse_args(argv)
    with open(args.specs) as f:
        specs = json.load(f)
    only = [k for k in args.only.split(',') if k]
    os.makedirs(args.out, exist_ok=True)
    for spec in specs:
        if only and spec['id'] not in only:
            continue
        seal(spec, args.out, args.font, args.samples, args.res)
        print(f"[seals] {spec['id']}", flush=True)


if __name__ == '__main__' and '--' in sys.argv:
    main()
