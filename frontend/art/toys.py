"""Lim's toy box, pre-rendered. Each catalog toy (`ITEMS` in `src/chat/world/spec.ts`) is modelled
by hand here after the concept sheet in `art/concepts/toybox.webp`, in its catalog colours, and
rendered as a turntable of sorbet plastic in the product studio of `studio.py`.

Headless:  blender -b -P art/toys.py -- <specs.json> <out-dir> [--only a,b] [--frames 24] [--samples 96] [--res 256]
Stage:     blender -b -P art/toys.py -- <specs.json> <out-dir> --mesh [--only a,b]
Live:      python3 art/bmcp.py exec <snippet that imports this module and calls shoot()>
"""

import argparse
import json
import math
import os
import random
import struct
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import studio  # noqa: E402

INK = '#2B2140'
#: Mesh density for the stage, as a share of the pictures', and the most triangles a stage toy keeps.
STAGE = 0.6
BUDGET = 3000
#: How a toy stands on the stage (Euler degrees), where the catalog body is posed unlike the toy built
#: here. Every other toy stands as built, without the turn its picture is taken at.
ON_STAGE = {'donut': (90, 0, 0), 'duck': (0, 0, 180), 'chili': (0, 0, 90)}


class Kit:
    """Everything a toy is made of goes under one root, so it can be framed and turned as one.
    `detail` below 1 builds the same toy from fewer polygons, for the stage."""

    def __init__(self, detail=1.0):
        self.root = bpy.data.objects.new('toy', None)
        bpy.context.scene.collection.objects.link(self.root)
        self.rng = random.Random(1)
        self.detail = detail

    @property
    def picture(self):
        return self.detail == 1

    def res(self, n, least, step=1):
        """`n` segments at this kit's detail, a multiple of `step` so patterns cut along whole faces."""
        if self.detail == 1:
            return n
        return max(least, round(n * self.detail / step) * step)

    def adopt(self, ob, mat=None, smooth=True, subsurf=0):
        if ob.name not in bpy.context.scene.collection.objects and not ob.users_collection:
            bpy.context.scene.collection.objects.link(ob)
        ob.parent = self.root
        if mat is not None and ob.type in ('MESH', 'CURVE'):
            ob.data.materials.clear()
            ob.data.materials.append(mat)
        if smooth and ob.type == 'MESH':
            ob.data.shade_smooth()
        if subsurf:
            m = ob.modifiers.new('smooth', 'SUBSURF')
            m.levels = 0
            m.render_levels = subsurf
        return ob

    def mesh(self, name, bm, mat, subsurf=0, smooth=True):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return self.adopt(ob, mat, smooth, subsurf)

    def sphere(self, mat, at=(0, 0, 0), r=1.0, scale=(1, 1, 1), rot=(0, 0, 0), shape=None, seg=64):
        bm = bmesh.new()
        seg = self.res(seg, 12, 6)
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0)
        if shape:
            for v in bm.verts:
                v.co = Vector(shape(v.co.copy()))
        M = Matrix.Translation(at) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((r * scale[0], r * scale[1], r * scale[2], 1))
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        return self.mesh('sphere', bm, mat)

    def torus(self, mat, at=(0, 0, 0), R=1.0, r=0.25, rot=(0, 0, 0), scale=(1, 1, 1), keep=None, seg=(96, 32)):
        bm = bmesh.new()
        n_u, n_v = self.res(seg[0], 16, 2), self.res(seg[1], 8, 2)
        grid = []
        for i in range(n_u):
            u = i / n_u * math.tau
            row = []
            for j in range(n_v):
                v = j / n_v * math.tau
                row.append(bm.verts.new(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v))))
            grid.append(row)
        for i in range(n_u):
            for j in range(n_v):
                bm.faces.new((grid[i][j], grid[(i + 1) % n_u][j], grid[(i + 1) % n_u][(j + 1) % n_v], grid[i][(j + 1) % n_v]))
        if keep:
            gone = [v for v in bm.verts if not keep(v.co, math.atan2(v.co.y, v.co.x))]
            bmesh.ops.delete(bm, geom=gone, context='VERTS')
        M = Matrix.Translation(at) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        return self.mesh('torus', bm, mat)

    def lathe(self, mat, profile, at=(0, 0, 0), seg=96, radial=None, rot=(0, 0, 0), subsurf=2, cap=True):
        """Spin a (radius, height) profile about Z. `radial(angle, height)` scales the radius per vertex (pleats, ribs)."""
        bm = bmesh.new()
        seg = self.res(seg, 16, 2)
        rings = []
        for (pr, pz) in profile:
            ring = []
            for i in range(seg):
                a = i / seg * math.tau
                k = radial(a, pz) if radial else 1.0
                ring.append(bm.verts.new((pr * k * math.cos(a), pr * k * math.sin(a), pz)))
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for i in range(seg):
                bm.faces.new((r0[i], r0[(i + 1) % seg], r1[(i + 1) % seg], r1[i]))
        if cap:
            for ring, flip in ((rings[0], True), (rings[-1], False)):
                if all(v.co.xy.length < 1e-6 for v in ring):
                    continue
                f = bm.faces.new(ring[::-1] if flip else ring)
                bmesh.ops.poke(bm, faces=[f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        M = Matrix.Translation(at) @ Euler(rot).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        return self.mesh('lathe', bm, mat, subsurf=subsurf)

    def box(self, mat, at=(0, 0, 0), dims=(1, 1, 1), bevel=0.1, rot=(0, 0, 0), segments=6):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        M = Matrix.Translation(at) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*dims, 1))
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        ob = self.mesh('box', bm, mat, smooth=True)
        b = ob.modifiers.new('round', 'BEVEL')
        b.width = bevel
        b.segments = self.res(segments, 2)
        b.limit_method = 'NONE'
        ob.modifiers.new('normals', 'WEIGHTED_NORMAL')
        return ob

    def slab(self, mat, outline, depth, at=(0, 0, 0), rot=(0, 0, 0), soft=0.45):
        """A flat shape with soft edges: `outline` is (x, z) points in the front plane, `depth` thick along y."""
        bm = bmesh.new()
        front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
        back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
        bm.faces.new(front)
        bm.faces.new(back[::-1])
        for i in range(len(outline)):
            j = (i + 1) % len(outline)
            bm.faces.new((front[i], front[j], back[j], back[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        M = Matrix.Translation(at) @ Euler(rot).to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        ob = self.mesh('slab', bm, mat)
        b = ob.modifiers.new('round', 'BEVEL')
        b.width = depth * soft
        b.segments = self.res(4, 2)
        b.limit_method = 'NONE'
        ob.modifiers.new('normals', 'WEIGHTED_NORMAL')
        return ob

    def tube(self, mat, points, radius, taper=None, order=4, steps=24):
        cu = bpy.data.curves.new('tube', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = radius
        cu.bevel_resolution = self.res(6, 2)
        cu.use_fill_caps = True
        cu.resolution_u = self.res(steps, min(6, steps))
        sp = cu.splines.new('NURBS')
        sp.points.add(len(points) - 1)
        for i, p in enumerate(points):
            sp.points[i].co = (*p, 1)
            if taper:
                sp.points[i].radius = taper(i / (len(points) - 1))
        sp.use_endpoint_u = True
        sp.order_u = min(order, len(points))
        ob = bpy.data.objects.new('tube', cu)
        bpy.context.scene.collection.objects.link(ob)
        return self.adopt(ob, mat, smooth=False)

    def rod(self, mat, a, b, r, verts=24):
        a, b = Vector(a), Vector(b)
        d = b - a
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=self.res(verts, 8), radius1=r, radius2=r, depth=d.length)
        M = Matrix.Translation((a + b) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
        ob = self.mesh('rod', bm, mat)
        bv = ob.modifiers.new('round', 'BEVEL')
        bv.width = r * 0.45
        bv.segments = self.res(4, 2)
        ob.modifiers.new('normals', 'WEIGHTED_NORMAL')
        return ob

    def bend(self, ob, angle, axis='Y', origin=None):
        m = ob.modifiers.new('bend', 'SIMPLE_DEFORM')
        m.deform_method = 'BEND'
        m.deform_axis = axis
        m.angle = math.radians(angle)
        if origin is not None:
            m.origin = origin
        return m

    def face(self, centre, normal, spread=0.16, eye=0.055, smile=True, blush='#FF9FB8', up=(0, 0, 1)):
        """Two glossy ink eyes, a little smile and blushed cheeks on a surface facing `normal`."""
        n = Vector(normal).normalized()
        upv = Vector(up)
        side = upv.cross(n).normalized() * -1
        upv = n.cross(side).normalized() * -1
        ink = studio.gloss('eye', INK, rough=0.06)
        for s in (-1, 1):
            p = Vector(centre) + side * spread * s + upv * spread * 0.25
            self.sphere(ink, at=p, r=eye, scale=(1, 1, 1.25), rot=n.to_track_quat('-Y', 'Z').to_euler(), seg=32)
            if blush:
                cheek = studio.gummy('blush', blush, sss=0.5, rough=0.5, coat=0.2)
                q = Vector(centre) + side * spread * s * 1.7 - upv * spread * 0.45 - n * eye * 0.4
                self.sphere(cheek, at=q, r=eye * 1.25, scale=(1.3, 0.35, 0.8), rot=n.to_track_quat('-Y', 'Z').to_euler(), seg=24)
        if smile:
            pts = []
            for i in range(7):
                t = (i / 6 - 0.5) * 2
                pts.append(tuple(Vector(centre) + side * t * spread * 0.45 - upv * (spread * 0.42 + (1 - t * t) * spread * 0.22) + n * 0.004))
            self.tube(ink, pts, eye * 0.22)


def puffy(shape):
    """`shapePoint` from `scene/items.ts` for the star and the heart, on a unit sphere."""
    def f(co):
        x, z, y = co.x, co.y, co.z
        n = Vector((x, y, z)).normalized()
        x, y, z = n.x, n.y, n.z
        if shape == 'star':
            a = math.atan2(y, x) - math.pi / 2
            seg = math.tau / 5
            k = abs((((a % seg) + seg) % seg) / (seg / 2) - 1)
            r = 0.52 + 0.48 * k ** 1.4
            return (x * r * 1.05, z * 0.46, y * r * 1.05)
        taper = 0.55 + 0.45 * smooth((y + 0.95) / 1.3)
        return (x * taper * 1.08, z * 0.55, y * 0.86 + 0.5 * math.sqrt(abs(x)) - 0.22)
    return f


def smooth(k):
    x = min(1.0, max(0.0, k))
    return x * x * (3 - 2 * x)


def colour(spec, i=0):
    return spec['parts'][i]['color']


def glow(m, hex_colour, strength):
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = studio.lin(hex_colour)
    b.inputs['Emission Strength'].default_value = strength
    return m


def film(name):
    m = studio.gloss(name, '#FFFFFF', rough=0.04)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 3.5
    noise.inputs['Detail'].default_value = 3
    noise.inputs['Distortion'].default_value = 1.5
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Object'], noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    stops = ('#FF9FC5', '#FFE08A', '#8FE3C0', '#9FC8FF', '#C7A8FF', '#FF9FC5')
    for _ in range(len(stops) - 2):
        ramp.color_ramp.elements.new(0.5)
    for i, (e, c) in enumerate(zip(ramp.color_ramp.elements, stops)):
        e.position = 0.25 + 0.5 * i / (len(stops) - 1)
        e.color = studio.lin(c)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = 0.15
    rim = nt.nodes.new('ShaderNodeLayerWeight')
    rim.inputs['Blend'].default_value = 0.3
    cover = nt.nodes.new('ShaderNodeMapRange')
    cover.inputs['To Min'].default_value = 0.12
    cover.inputs['To Max'].default_value = 0.85
    nt.links.new(rim.outputs['Facing'], cover.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(cover.outputs['Result'], mix.inputs['Fac'])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs['BSDF'], mix.inputs[1])
    nt.links.new(b.outputs['BSDF'], mix.inputs[2])
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


def waffle(m, groove, cells=7, pitch=26.0):
    """Diagonal waffle grooves round a cone standing on z: `cells` diamonds per half turn, `pitch` lines per unit of height."""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']

    def node(kind, op=None, *values):
        n = nt.nodes.new(kind)
        if op:
            n.operation = op
        for i, v in enumerate(values):
            if v is not None:
                n.inputs[i].default_value = v
        return n

    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Object'], sep.inputs[0])
    angle = node('ShaderNodeMath', 'ARCTAN2')
    nt.links.new(sep.outputs['Y'], angle.inputs[0])
    nt.links.new(sep.outputs['X'], angle.inputs[1])
    around = node('ShaderNodeMath', 'MULTIPLY', None, cells / math.pi)
    nt.links.new(angle.outputs[0], around.inputs[0])
    up = node('ShaderNodeMath', 'MULTIPLY', None, pitch)
    nt.links.new(sep.outputs['Z'], up.inputs[0])
    lines = []
    for op in ('ADD', 'SUBTRACT'):
        mix = node('ShaderNodeMath', op)
        nt.links.new(around.outputs[0], mix.inputs[0])
        nt.links.new(up.outputs[0], mix.inputs[1])
        wave = node('ShaderNodeMath', 'MULTIPLY', None, math.pi)
        nt.links.new(mix.outputs[0], wave.inputs[0])
        sine = node('ShaderNodeMath', 'SINE')
        nt.links.new(wave.outputs[0], sine.inputs[0])
        size = node('ShaderNodeMath', 'ABSOLUTE')
        nt.links.new(sine.outputs[0], size.inputs[0])
        lines.append(size)
    near = node('ShaderNodeMath', 'MINIMUM')
    nt.links.new(lines[0].outputs[0], near.inputs[0])
    nt.links.new(lines[1].outputs[0], near.inputs[1])
    flat = nt.nodes.new('ShaderNodeMapRange')
    flat.interpolation_type = 'SMOOTHSTEP'
    flat.inputs['From Min'].default_value = 0.08
    flat.inputs['From Max'].default_value = 0.3
    nt.links.new(near.outputs[0], flat.inputs['Value'])
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.inputs['A'].default_value = studio.lin(groove)
    tint.inputs['B'].default_value = b.inputs['Base Color'].default_value[:]
    nt.links.new(flat.outputs['Result'], tint.inputs['Factor'])
    nt.links.new(tint.outputs['Result'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.7
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(flat.outputs['Result'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m



def bean(k, spec):
    m = studio.gummy('bean', colour(spec), sss=0.45, rough=0.22, sparkle=0.4)
    def shape(co):
        n = co.normalized()
        return Vector((n.x * 1.3, n.y * 0.62, n.z * 0.56 + 0.34 * (1 - n.x * n.x) - 0.17))
    k.sphere(m, r=0.42, shape=shape, rot=(0.35, 0.0, math.radians(-20)))


def gumball(k, spec):
    m = studio.gummy('gumball', colour(spec), sss=0.55, rough=0.05, sss_scale=0.1)
    k.sphere(m, r=0.4)


def beach_ball(k, spec):
    """Six panels round the poles, each its own faces (so the stage mesh keeps them), and a white cap on each pole."""
    panels = ['#FF7E6B', '#FFFFFF', '#FFD978', '#FFFFFF', '#9FD3FF', '#FFFFFF']
    mats = {c: studio.gummy('beach', c, sss=0.15, rough=0.18) for c in dict.fromkeys(panels)}
    ball = k.sphere(mats[panels[0]], r=0.5, seg=96)
    ball.data.materials.clear()
    for m in mats.values():
        ball.data.materials.append(m)
    order = list(mats)
    for poly in ball.data.polygons:
        c = poly.center
        i = min(5, int((math.atan2(c.y, c.x) / math.tau + 0.5) * 6))
        poly.material_index = order.index(panels[i])
    cap = studio.gummy('cap', '#FFFFFF', sss=0.2, rough=0.2)
    k.sphere(cap, at=(0, 0, 0.497), r=0.1, scale=(1, 1, 0.22))
    k.sphere(cap, at=(0, 0, -0.497), r=0.1, scale=(1, 1, 0.22))
    for ob in list(k.root.children):
        ob.rotation_euler = (0.55, 0.0, 0.4)


def apple(k, spec):
    def shape(co):
        n = co.normalized()
        phi = math.acos(max(-1, min(1, n.z)))
        r = 1 - 0.2 * math.exp(-(phi / 0.42) ** 2) - 0.12 * math.exp(-((math.pi - phi) / 0.5) ** 2)
        r *= 1 + 0.05 * n.z
        return n * r * Vector((1, 1, 0.92))
    skin = studio.gummy('apple', colour(spec), sss=0.3, rough=0.2)
    k.sphere(skin, r=0.48, shape=shape)
    stem = studio.matte('stem', colour(spec, 1), rough=0.6, sss=0.1)
    k.tube(stem, [(0, 0, 0.3), (0.01, 0, 0.42), (0.05, 0, 0.55)], 0.03)
    leaf = studio.gummy('leaf', colour(spec, 2), sss=0.4, rough=0.3)
    ob = k.sphere(leaf, at=(0.16, 0, 0.53), r=0.15, scale=(1.0, 0.45, 0.08), rot=(0.1, -0.5, 0.2),
                  shape=lambda co: Vector((co.x, co.y * (1 - 0.6 * co.x * co.x), co.z)))
    k.bend(ob, 30, 'Y')


def donut(k, spec):
    R, r = 0.42, 0.21
    dough = studio.matte('dough', colour(spec, 1), rough=0.55, sss=0.35, bump=0.25, bump_scale=40)
    k.torus(dough, R=R, r=r, scale=(1, 1, 0.82))
    icing = studio.gummy('icing', colour(spec), sss=0.35, rough=0.2)

    def keep(co, u):
        local = Vector((co.x, co.y, 0)).length - R
        if local < 0:
            return co.z > r * (0.12 + 0.05 * math.sin(u * 5))
        drip = -0.35 + 0.2 * math.sin(u * 7) + 0.14 * math.sin(u * 13 + 1.7)
        return co.z > r * drip
    ic = k.torus(icing, R=R, r=r * 1.07, scale=(1, 1, 0.84), keep=keep)
    s = ic.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.018
    s.offset = 1
    ic.modifiers.new('smooth', 'SUBSURF').render_levels = 2
    cols = ['#FFD978', '#9FD3FF', '#FFFFFF', '#7FD6B5', '#C7B6FF', '#FF7E6B']
    mats = [studio.gummy('sprinkle', c, sss=0.15, rough=0.25) for c in cols]
    for i in range(60):
        u = k.rng.uniform(0, math.tau)
        v = k.rng.uniform(math.radians(20), math.radians(160))
        rr = r * 1.07 + 0.02
        p = Vector(((R + rr * math.cos(v)) * math.cos(u), (R + rr * math.cos(v)) * math.sin(u), rr * math.sin(v) * 0.84))
        a = k.rng.uniform(0, math.tau)
        d = Vector((math.cos(a), math.sin(a), 0)) * 0.03
        k.rod(k.rng.choice(mats), p - d, p + d, 0.011, verts=10)
    for ob in k.root.children:
        ob.rotation_euler = (0.45, 0, 0)


def cupcake(k, spec):
    liner = studio.matte('liner', colour(spec), rough=0.5, sss=0.25)
    k.lathe(liner, [(0.0, 0.0), (0.27, 0.0), (0.3, 0.02), (0.37, 0.3), (0.38, 0.32)], seg=128,
            radial=lambda a, z: 1 + 0.035 * (1 if (int(a / math.tau * 32) % 2) else -1) * smooth(z / 0.05), subsurf=1)
    cake = studio.matte('cake', '#C98E57', rough=0.7, sss=0.3, bump=0.3)
    k.sphere(cake, at=(0, 0, 0.31), r=0.36, scale=(1, 1, 0.25))
    frost = studio.gummy('frosting', colour(spec, 1), sss=0.4, rough=0.25)
    pts = []
    turns = 2.6
    for i in range(64):
        t = i / 63
        a = t * turns * math.tau
        rad = 0.3 * (1 - t) ** 0.9 + 0.02
        pts.append((rad * math.cos(a), rad * math.sin(a), 0.38 + t * 0.34))
    k.tube(frost, pts, 0.1, taper=lambda t: 1.0 - 0.55 * t)
    cherry = studio.gummy('cherry', colour(spec, 2), sss=0.3, rough=0.08)
    k.sphere(cherry, at=(0.0, 0.0, 0.8), r=0.085)
    stem = studio.matte('cstem', '#5A3A2A', rough=0.5)
    k.tube(stem, [(0, 0, 0.86), (0.02, 0.0, 0.95), (0.08, 0.02, 1.03)], 0.012)


def chili(k, spec):
    def shape(co):
        n = co.normalized()
        t = (n.z + 1) / 2
        w = 0.18 + 0.82 * smooth(t * 1.35)
        return Vector((n.x * w, n.y * w, n.z))
    body = studio.gummy('chili', colour(spec), sss=0.2, rough=0.1, sss_scale=0.02)
    ob = k.sphere(body, r=1, scale=(0.23, 0.23, 0.6), shape=shape)
    k.bend(ob, -120, 'X')
    cap = studio.gummy('calyx', '#3F8A3E', sss=0.3, rough=0.25)
    k.sphere(cap, at=(0, 0, 0.555), r=0.165, scale=(1, 1, 0.3))
    k.tube(cap, [(0, 0, 0.58), (0.0, 0.0, 0.66), (0.05, 0.0, 0.72), (0.1, 0.0, 0.72)], 0.035)
    for ob in k.root.children:
        ob.rotation_euler = (0, math.radians(62), math.radians(-20))


def party_hat(k, spec):
    m = studio.gummy('hat', colour(spec), sss=0.35, rough=0.25)
    k.lathe(m, [(0.0, 0.0), (0.4, 0.0), (0.41, 0.02), (0.06, 0.82), (0.0, 0.84)], seg=96, subsurf=2)
    star = studio.gummy('hatstar', colour(spec, 1), sss=0.3, rough=0.25)
    for i, (a, h) in enumerate(((-0.5, 0.2), (0.4, 0.28), (-0.05, 0.5), (1.1, 0.42), (-1.2, 0.38))):
        rad = 0.4 * (1 - h / 0.84) + 0.012
        c = Vector((math.sin(a) * rad, -math.cos(a) * rad, h))
        n = Vector((math.sin(a), -math.cos(a), 0.45)).normalized()
        sz = 0.12 * (1 - h * 0.8)
        k.sphere(star, at=c, r=sz, shape=puffy('star'), rot=n.to_track_quat('-Y', 'Z').to_euler())
        del i
    pom = studio.gummy('pom', colour(spec, 1), sss=0.4, rough=0.35)
    for i in range(26):
        d = Vector((k.rng.uniform(-1, 1), k.rng.uniform(-1, 1), k.rng.uniform(-0.4, 1))).normalized()
        k.sphere(pom, at=Vector((0, 0, 0.9)) + d * 0.07, r=0.045, seg=24)
    brim = studio.gummy('brim', colour(spec, 2), sss=0.4, rough=0.22)
    k.torus(brim, at=(0, 0, 0.03), R=0.41, r=0.055)


def crown(k, spec):
    gold = studio.gummy('gold', colour(spec), sss=0.3, rough=0.18, sparkle=0.28)
    bm = bmesh.new()
    seg = 160
    rings = []
    for (rad, lift) in ((0.4, 0.0), (0.4, 1.0)):
        ring = []
        for i in range(seg):
            a = i / seg * math.tau
            spike = max(0.0, math.cos(5 * a)) ** 3
            h = 0.22 + lift * (0.02 + 0.26 * spike) if lift else 0.0
            ring.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), h)))
        rings.append(ring)
    for i in range(seg):
        bm.faces.new((rings[0][i], rings[0][(i + 1) % seg], rings[1][(i + 1) % seg], rings[1][i]))
    ob = k.mesh('band', bm, gold)
    s = ob.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = 0.06
    s.offset = 0
    ob.modifiers.new('smooth', 'SUBSURF').render_levels = 2
    for i in range(5):
        a = i / 5 * math.tau
        k.sphere(gold, at=(0.4 * math.cos(a), 0.4 * math.sin(a), 0.53), r=0.05)
    k.torus(gold, at=(0, 0, 0.02), R=0.4, r=0.04)
    gem = studio.gummy('gem', colour(spec, 4), sss=0.1, rough=0.02, transmission=0.6)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.075)
    g = k.mesh('gem', bm, gem, smooth=False)
    g.location = (0, -0.43, 0.16)
    g.scale = (1, 0.5, 1.2)
    blue = studio.gummy('bluegem', '#9FD3FF', sss=0.1, rough=0.02, transmission=0.6)
    for a in (-0.9, 0.9):
        k.sphere(blue, at=(0.43 * math.sin(a), -0.43 * math.cos(a), 0.12), r=0.04, scale=(1, 0.6, 1))
    for ob in k.root.children:
        ob.rotation_euler = (0, 0, math.radians(18))


def sunglasses(k, spec):
    frame = studio.gloss('frame', colour(spec), rough=0.14)
    lens = studio.gloss('lens', '#120E1C', rough=0.02)
    for s in (-1, 1):
        k.box(frame, at=(s * 0.25, 0.0, 0.0), dims=(0.46, 0.08, 0.34), bevel=0.1)
        k.box(lens, at=(s * 0.25, -0.03, 0.0), dims=(0.38, 0.05, 0.26), bevel=0.085)
        k.box(frame, at=(s * 0.49, 0.34, 0.08), dims=(0.05, 0.68, 0.06), bevel=0.022, rot=(0, 0, s * -0.1))
    k.rod(frame, (-0.06, 0.0, 0.08), (0.06, 0.0, 0.08), 0.035)
    for ob in k.root.children:
        ob.rotation_euler = (math.radians(-4), 0, math.radians(-22))


def teddy(k, spec):
    fur = studio.gummy('fur', colour(spec), sss=0.4, rough=0.42, coat=0.35, sheen=0.4)
    pale = studio.gummy('muzzle', colour(spec, 4), sss=0.4, rough=0.45, coat=0.3, sheen=0.3)
    dark = studio.gummy('ear', colour(spec, 2), sss=0.4, rough=0.42, coat=0.3, sheen=0.4)
    k.sphere(fur, at=(0, 0, 0.27), r=0.27, scale=(1, 0.9, 1.0))
    k.sphere(pale, at=(0, -0.2, 0.27), r=0.17, scale=(1, 0.4, 1.1))
    k.sphere(fur, at=(0, 0, 0.66), r=0.24, scale=(1.08, 0.95, 0.95))
    for s in (-1, 1):
        k.sphere(fur, at=(s * 0.19, -0.02, 0.85), r=0.085, scale=(1, 0.75, 1))
        k.sphere(dark, at=(s * 0.19, -0.075, 0.85), r=0.05, scale=(1, 0.4, 1))
        k.sphere(fur, at=(s * 0.27, -0.06, 0.34), r=0.1, scale=(0.9, 0.9, 1.25), rot=(0, s * 0.5, 0))
        k.sphere(fur, at=(s * 0.15, -0.16, 0.08), r=0.11, scale=(1, 1.35, 0.8))
        k.sphere(pale, at=(s * 0.15, -0.3, 0.08), r=0.06, scale=(1, 0.3, 1))
    k.sphere(pale, at=(0, -0.2, 0.6), r=0.1, scale=(1.15, 0.7, 0.8))
    nose = studio.gloss('nose', INK, rough=0.08)
    k.sphere(nose, at=(0, -0.27, 0.63), r=0.035, scale=(1.3, 1, 0.85))
    k.face((0, -0.215, 0.7), (0, -1, 0.15), spread=0.1, eye=0.032, smile=False, blush=None)
    stitch = studio.gummy('stitch', '#8A5E3C', sss=0.1, rough=0.5, coat=0)
    for i in range(6):
        z = 0.88 - i * 0.035
        k.rod(stitch, (-0.012, -0.224 + i * 0.002, z), (0.012, -0.224 + i * 0.002, z - 0.012), 0.006, verts=8)
    for ob in k.root.children:
        ob.rotation_euler = (0, 0, math.radians(-16))


def pillow(k, spec):
    m = studio.gummy('pillow', '#CDBDFF', sss=0.45, rough=0.38, coat=0.4, sheen=0.4)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=16, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        puff = (1 - 0.82 * x * x) * (1 - 0.82 * y * y)
        v.co = Vector((x * 0.5 * (1 + 0.05 * (1 - y * y)), y * 0.36 * (1 + 0.05 * (1 - x * x)), z * 0.27 * puff + 0.2))
    k.mesh('pillow', bm, m, subsurf=2)
    thread = studio.gummy('thread', '#FFFFFF', sss=0.2, rough=0.4, coat=0)
    for i in range(44):
        t = i / 44 * math.tau
        x = math.copysign(abs(math.cos(t)) ** 0.25, math.cos(t)) * 0.46
        y = math.copysign(abs(math.sin(t)) ** 0.25, math.sin(t)) * 0.32
        p = Vector((x, y, 0.2 + 0.07))
        d = Vector((-math.sin(t) * 0.46, math.cos(t) * 0.32, 0)).normalized() * 0.014
        inward = -Vector((x, y, 0)).normalized() * 0.02
        k.rod(thread, p + inward - d, p + inward + d, 0.006, verts=8)
    button = studio.gummy('button', '#B9A6FF', sss=0.3, rough=0.25)
    k.sphere(button, at=(0, 0, 0.46), r=0.04, scale=(1, 1, 0.5))
    for ob in k.root.children:
        ob.rotation_euler = (math.radians(72), 0, math.radians(-32))


def drum(k, spec):
    shell = studio.gummy('shell', colour(spec), sss=0.3, rough=0.2)
    head = studio.matte('head', colour(spec, 1), rough=0.55, sss=0.3)
    gold = studio.gummy('gold', colour(spec, 2), sss=0.3, rough=0.18, sparkle=0.25)
    k.lathe(shell, [(0.0, 0.08), (0.4, 0.08), (0.4, 0.5), (0.0, 0.5)], subsurf=1)
    k.lathe(head, [(0.0, 0.52), (0.37, 0.52), (0.38, 0.5)], subsurf=1, cap=False)
    k.torus(gold, at=(0, 0, 0.5), R=0.41, r=0.04)
    k.torus(gold, at=(0, 0, 0.08), R=0.41, r=0.04)
    n = 7
    for i in range(n):
        a0, a1, a2 = (i / n) * math.tau, ((i + 0.5) / n) * math.tau, ((i + 1) / n) * math.tau
        p0 = (0.415 * math.cos(a0), 0.415 * math.sin(a0), 0.47)
        p1 = (0.415 * math.cos(a1), 0.415 * math.sin(a1), 0.11)
        p2 = (0.415 * math.cos(a2), 0.415 * math.sin(a2), 0.47)
        k.rod(gold, p0, p1, 0.009, verts=12)
        k.rod(gold, p1, p2, 0.009, verts=12)
        k.sphere(gold, at=p0, r=0.025, seg=24)
        k.sphere(gold, at=p1, r=0.025, seg=24)


def balloon(k, spec):
    def shape(co):
        n = co.normalized()
        pinch = 1 - 0.38 * smooth((-n.z - 0.2) / 0.8)
        return Vector((n.x * pinch, n.y * pinch, n.z * 1.12))
    latex = studio.gummy('latex', colour(spec), sss=0.2, rough=0.1)
    k.sphere(latex, at=(0, 0, 0.62), r=0.32, shape=shape)
    k.sphere(latex, at=(0, 0, 0.255), r=0.04, scale=(1, 1, 0.8))
    k.torus(latex, at=(0, 0, 0.232), R=0.03, r=0.018)
    cord = studio.matte('cord', '#FFF3DC', rough=0.5)
    pts = [(0, 0, 0.23)]
    for i in range(1, 11):
        t = i / 10
        pts.append((math.sin(t * 10) * 0.06 * (1 - t * 0.3), math.cos(t * 10) * 0.03, 0.23 - t * 0.22))
    k.tube(cord, pts, 0.008)


def duck(k, spec):
    yellow = studio.gummy('duck', colour(spec), sss=0.35, rough=0.15)
    beak = studio.gummy('beak', colour(spec, 2), sss=0.35, rough=0.2)
    def body(co):
        n = co.normalized()
        lift = 0.35 * smooth((n.x - 0.3) / 0.7) * smooth((n.z + 0.2) / 1.2)
        return Vector((n.x, n.y, n.z + lift))
    k.sphere(yellow, at=(0.0, 0, 0.2), r=0.3, scale=(1.15, 0.85, 0.72), shape=body)
    head = Vector((-0.17, 0, 0.53))
    k.sphere(yellow, at=head, r=0.2, scale=(1, 0.95, 1))
    k.sphere(beak, at=(-0.36, 0, 0.5), r=0.09, scale=(1.2, 1.0, 0.42), rot=(0, 0.12, 0))
    k.sphere(beak, at=(-0.34, 0, 0.465), r=0.07, scale=(1.1, 0.9, 0.3), rot=(0, 0.2, 0))
    for s in (-1, 1):
        k.sphere(yellow, at=(0.05, s * 0.235, 0.24), r=0.15, scale=(1.3, 0.35, 0.75), rot=(0, -0.3, 0))
    k.face(head + Vector((-0.15, 0, 0.07)), (-1, 0, 0.25), spread=0.085, eye=0.026, smile=False, blush='#FFB37A')
    for ob in k.root.children:
        ob.rotation_euler = (0, 0, math.radians(58))


def cactus(k, spec):
    green = studio.gummy('cactus', colour(spec, 1), sss=0.35, rough=0.28)
    ribs = lambda a, z: 1 + 0.06 * math.cos(a * 8)
    k.lathe(green, [(0.0, 0.3), (0.17, 0.3), (0.19, 0.4), (0.19, 0.78), (0.15, 0.88), (0.08, 0.93), (0.0, 0.94)], seg=96, radial=ribs, subsurf=2)
    for s, h, l in ((-1, 0.6, 0.18), (1, 0.52, 0.14)):
        pts = [(s * 0.12, 0, h), (s * 0.27, 0, h - 0.02), (s * 0.31, 0, h + 0.06), (s * 0.31, 0, h + l + 0.06)]
        k.tube(green, pts, 0.075)
        k.sphere(green, at=(s * 0.31, 0, h + l + 0.06), r=0.075)
    spine = studio.gummy('spine', '#FFF6D8', sss=0.2, rough=0.4)
    for i in range(34):
        a = k.rng.uniform(math.pi * 1.1, math.pi * 1.9)
        z = k.rng.uniform(0.4, 0.88)
        r = 0.205 * (1 + 0.06 * math.cos(round(a * 8 / math.tau) * math.tau / 8 * 8))
        k.sphere(spine, at=(r * math.cos(a), r * math.sin(a), z), r=0.008, seg=16)
    pot = studio.matte('pot', colour(spec), rough=0.55, sss=0.15, bump=0.15)
    k.lathe(pot, [(0.0, 0.0), (0.17, 0.0), (0.2, 0.02), (0.25, 0.3), (0.0, 0.3)], subsurf=1)
    k.torus(pot, at=(0, 0, 0.3), R=0.255, r=0.04, scale=(1, 1, 1.2))
    soil = studio.matte('soil', '#6B4A3A', rough=0.9, bump=0.5, bump_scale=120)
    k.lathe(soil, [(0.0, 0.315), (0.235, 0.315)], subsurf=0, cap=False)
    k.face((0, -0.2, 0.72), (0, -1, 0), spread=0.07, eye=0.025)


def ghost(k, spec):
    m = studio.gummy('ghost', colour(spec), sss=0.7, rough=0.3, transmission=0.12, sss_scale=0.12)
    def shape(co):
        n = co.normalized()
        if n.z >= 0:
            return Vector((n.x, n.y, n.z * 1.05))
        a = math.atan2(n.y, n.x)
        down = -n.z
        hem = 1.0 + 0.12 * math.cos(a * 6)
        flare = 1 + 0.12 * down
        return Vector((n.x / max(0.2, math.sqrt(1 - n.z * n.z)) * flare, n.y / max(0.2, math.sqrt(1 - n.z * n.z)) * flare, -down * 1.2 * hem))
    k.sphere(m, at=(0, 0, 0.42), r=0.3, shape=shape)
    for s in (-1, 1):
        k.sphere(m, at=(s * 0.31, -0.02, 0.36), r=0.08, scale=(1.2, 0.8, 0.7), rot=(0, s * -0.6, 0))
    k.face((0, -0.29, 0.5), (0, -1, 0.1), spread=0.1, eye=0.035)


def ice_cube(k, spec):
    ice = studio.glass('ice', colour(spec), rough=0.1, ior=1.31)
    k.box(ice, at=(0, 0, 0.26), dims=(0.52, 0.52, 0.52), bevel=0.08)
    air = studio.glass('air', '#FFFFFF', ior=1 / 1.31, rough=0.0)
    for i in range(14):
        c = (k.rng.uniform(-0.16, 0.16), k.rng.uniform(-0.16, 0.16), 0.26 + k.rng.uniform(-0.16, 0.16))
        k.sphere(air, at=c, r=k.rng.uniform(0.008, 0.025), seg=16)
    for ob in k.root.children:
        ob.rotation_euler = (0, 0, math.radians(24))


def star(k, spec):
    m = studio.gummy('star', colour(spec), sss=0.4, rough=0.2, sparkle=0.4)
    k.sphere(m, r=0.5, shape=puffy('star'), rot=(math.radians(-12), 0, 0))


def heart(k, spec):
    m = studio.gummy('heart', colour(spec), sss=0.4, rough=0.18, sparkle=0.25)
    k.sphere(m, r=0.48, shape=puffy('heart'), rot=(math.radians(-10), 0, 0))


def basketball(k, spec):
    ink = spec['parts'][0].get('ink', '#4A2F5C')
    m = studio.matte('basketball', colour(spec), rough=0.55, sss=0.15, bump=0.4, bump_scale=420)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexCoord')
    norm = nt.nodes.new('ShaderNodeVectorMath')
    norm.operation = 'NORMALIZE'
    nt.links.new(tex.outputs['Object'], norm.inputs[0])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(norm.outputs['Vector'], sep.inputs[0])
    lines = []
    for axis, off in (('X', 0.0), ('Z', 0.0), ('Y', 0.68)):
        ab = nt.nodes.new('ShaderNodeMath')
        ab.operation = 'ABSOLUTE'
        nt.links.new(sep.outputs[axis], ab.inputs[0])
        sub = nt.nodes.new('ShaderNodeMath')
        sub.operation = 'SUBTRACT'
        sub.inputs[1].default_value = off
        nt.links.new(ab.outputs[0], sub.inputs[0])
        ab2 = nt.nodes.new('ShaderNodeMath')
        ab2.operation = 'ABSOLUTE'
        nt.links.new(sub.outputs[0], ab2.inputs[0])
        lt = nt.nodes.new('ShaderNodeMath')
        lt.operation = 'LESS_THAN'
        lt.inputs[1].default_value = 0.03
        nt.links.new(ab2.outputs[0], lt.inputs[0])
        lines.append(lt)
    mask = lines[0]
    for other in lines[1:]:
        mx = nt.nodes.new('ShaderNodeMath')
        mx.operation = 'MAXIMUM'
        nt.links.new(mask.outputs[0], mx.inputs[0])
        nt.links.new(other.outputs[0], mx.inputs[1])
        mask = mx
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = studio.lin(colour(spec))
    mix.inputs['B'].default_value = studio.lin(ink)
    nt.links.new(mask.outputs[0], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    ob = k.sphere(m, r=0.47)
    ob.rotation_euler = (0.5, 0.3, 0.7)


def soccer_ball(k, spec):
    white = studio.gummy('white', colour(spec), sss=0.2, rough=0.3, coat=0.6)
    black = studio.gummy('black', spec['parts'][0].get('ink', INK), sss=0.1, rough=0.25, coat=0.6)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=0, radius=1.0)
    bmesh.ops.bevel(bm, geom=list(bm.verts), offset=0.33333 * 1.0515, affect='VERTICES', segments=1)
    for f in bm.faces:
        f.material_index = 1 if len(f.verts) == 5 else 0
    res = bmesh.ops.inset_individual(bm, faces=list(bm.faces), thickness=0.02, depth=-0.012)
    del res
    ob = k.mesh('soccer', bm, white, smooth=True)
    ob.data.materials.append(black)
    for poly in ob.data.polygons:
        poly.material_index = 1 if poly.loop_total == 5 else 0
    sub = ob.modifiers.new('round', 'SUBSURF')
    sub.levels = 0
    sub.render_levels = 3
    cast = ob.modifiers.new('ball', 'CAST')
    cast.factor = 1.0
    sub2 = ob.modifiers.new('smooth', 'SUBSURF')
    sub2.render_levels = 1
    sub2.levels = 0
    ob.scale = (0.46, 0.46, 0.46)
    ob.rotation_euler = (0.3, 0.2, 0.5)


def hoop(k, spec):
    u = 0.42
    white = studio.gloss('board', colour(spec), rough=0.2)
    coral = studio.gummy('rim', colour(spec, 1), sss=0.3, rough=0.18)
    lilac = studio.gummy('pole', colour(spec, 2), sss=0.35, rough=0.25)
    net = studio.matte('net', '#FFFFFF', rough=0.5)
    k.lathe(lilac, [(0.0, 0.0), (0.4 * u, 0.0), (0.42 * u, 0.04 * u), (0.4 * u, 0.1 * u), (0.0, 0.1 * u)], subsurf=1)
    k.rod(lilac, (0, 0.1 * u, 0.08 * u), (0, 0.1 * u, 2.25 * u), 0.08 * u)
    k.box(white, at=(0, 0.08 * u, 2.55 * u), dims=(1.6 * u, 0.1 * u, 1.1 * u), bevel=0.05 * u)
    for a, b in (((-0.32, 2.3), (0.32, 2.3)), ((-0.32, 2.3), (-0.32, 2.72)), ((0.32, 2.3), (0.32, 2.72)), ((-0.32, 2.72), (0.32, 2.72))):
        k.rod(coral, (a[0] * u, 0.02 * u, a[1] * u), (b[0] * u, 0.02 * u, b[1] * u), 0.028 * u, verts=12)
    k.torus(coral, at=(0, -0.42 * u, 2.2 * u), R=0.4 * u, r=0.045 * u)
    k.rod(coral, (0, 0.03 * u, 2.2 * u), (0, -0.03 * u, 2.2 * u), 0.05 * u)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=16, radius1=0.24 * u, radius2=0.38 * u, depth=0.55 * u)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-6], cuts=3)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, -0.42 * u, 1.93 * u))
    ob = k.mesh('net', bm, net, smooth=False)
    w = ob.modifiers.new('cord', 'WIREFRAME')
    w.thickness = 0.016 * u
    w.use_even_offset = True
    for o in k.root.children:
        o.rotation_euler = (0, 0, math.radians(-22))


def goal(k, spec):
    u = 0.42
    white = studio.gloss('frame', colour(spec), rough=0.22)
    net = studio.matte('net', '#FFFFFF', rough=0.5)
    w, h, back = 1.25 * u, 1.65 * u, 0.9 * u
    r = 0.06 * u
    for a, b in zip([(-w, 0, 0), (-w, 0, h), (w, 0, h)], [(-w, 0, h), (w, 0, h), (w, 0, 0)]):
        k.rod(white, a, b, r)
    for x in (-w, w):
        k.sphere(white, at=(x, 0, h), r=r)
        k.rod(white, (x, 0, h), (x, back, 0.3 * h), r * 0.7)
        k.rod(white, (x, 0, 0.01), (x, back, 0.01), r * 0.7)
        k.rod(white, (x, back, 0.3 * h), (x, back, 0.01), r * 0.7)
    k.rod(white, (-w, back, 0.01), (w, back, 0.01), r * 0.7)
    k.rod(white, (-w, back, 0.3 * h), (w, back, 0.3 * h), r * 0.7)
    for verts in (
        [(-w, 0, h), (w, 0, h), (w, back, 0.3 * h), (-w, back, 0.3 * h)],
        [(-w, back, 0.3 * h), (w, back, 0.3 * h), (w, back, 0), (-w, back, 0)],
        [(-w, 0, h), (-w, back, 0.3 * h), (-w, back, 0), (-w, 0, 0)],
        [(w, 0, h), (w, back, 0.3 * h), (w, back, 0), (w, 0, 0)],
    ):
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in verts]
        bm.faces.new(vs)
        bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=9, use_grid_fill=True)
        ob = k.mesh('net', bm, net, smooth=False)
        wf = ob.modifiers.new('cord', 'WIREFRAME')
        wf.thickness = 0.012 * u
        wf.use_boundary = False
    for o in k.root.children:
        o.rotation_euler = (0, 0, math.radians(24))


def turn(k, degrees, tilt=(0, 0)):
    for ob in k.root.children:
        ob.rotation_euler = (math.radians(tilt[0]), math.radians(tilt[1]), math.radians(degrees))


def scaled(points, u):
    return [(r * u, z * u) for r, z in points]


def painted(k, name, bm, mats, smooth=True):
    """A mesh whose faces keep the `material_index` they were given in `bm`, into `mats`."""
    index = [f.material_index for f in bm.faces]
    ob = k.mesh(name, bm, mats[0], smooth=smooth)
    for m in mats[1:]:
        ob.data.materials.append(m)
    ob.data.polygons.foreach_set('material_index', index)
    return ob


def rocket(k, spec):
    u = 0.3
    red = studio.gummy('rocket', colour(spec), sss=0.3, rough=0.16)
    cream = studio.gummy('nose', colour(spec, 1), sss=0.35, rough=0.22)
    window = studio.gummy('porthole', colour(spec, 2), sss=0.2, rough=0.04, transmission=0.35)
    yellow = studio.gummy('fin', colour(spec, 3), sss=0.3, rough=0.2)
    k.lathe(red, scaled([(0.0, -1.0), (0.42, -1.0), (0.5, -0.94), (0.54, -0.6), (0.54, 1.0), (0.0, 1.0)], u), seg=48)
    k.lathe(cream, scaled([(0.0, 0.96), (0.54, 0.96), (0.5, 1.2), (0.4, 1.5), (0.27, 1.8), (0.12, 2.08), (0.0, 2.22)], u), seg=48, subsurf=1)
    k.torus(yellow, at=(0, 0, 0.97 * u), R=0.54 * u, r=0.055 * u, seg=(48, 12))
    k.rod(cream, (0, -0.3 * u, 0.35 * u), (0, -0.62 * u, 0.35 * u), 0.3 * u)
    k.sphere(window, at=(0, -0.62 * u, 0.35 * u), r=0.21 * u, scale=(1, 0.45, 1), seg=32)
    fin = [(0.35, 0.05), (0.66, -0.2), (0.96, -0.55), (1.17, -0.95), (1.3, -1.33), (1.06, -1.3), (0.8, -1.1), (0.53, -1.0), (0.35, -1.0)]
    for a in (90, 210, 330):
        k.slab(yellow, scaled(fin, u), 0.2 * u, rot=(0, 0, math.radians(a)))
    k.lathe(cream, scaled([(0.0, -0.95), (0.28, -0.95), (0.24, -1.05), (0.32, -1.2), (0.0, -1.2)], u), seg=32, subsurf=1)
    turn(k, -20)


def bubble_wand(k, spec):
    u = 0.3
    lilac = studio.gummy('wand', colour(spec), sss=0.35, rough=0.18)
    pink = studio.gummy('handle', colour(spec, 1), sss=0.35, rough=0.22)
    yellow = studio.gummy('knob', colour(spec, 2), sss=0.3, rough=0.18)
    R, r = 0.59 * u, 0.11 * u
    ring = k.torus(lilac, R=R, r=r, rot=(math.pi / 2, 0, 0), seg=(84, 16))
    for v in ring.data.vertices:
        a = math.atan2(v.co.z, v.co.x)
        c = Vector((R * math.cos(a), 0, R * math.sin(a)))
        v.co = c + (v.co - c) * (1 + 0.3 * max(0.0, math.cos(a * 14)) ** 6)
    k.sphere(lilac, at=(0, 0, -0.66 * u), r=0.13 * u, seg=32)
    k.lathe(pink, scaled([(0.0, -0.62), (0.1, -0.62), (0.11, -0.8), (0.14, -1.0), (0.14, -1.6), (0.12, -1.68), (0.0, -1.68)], u), seg=32)
    for z in (-1.12, -1.32, -1.52):
        k.torus(pink, at=(0, 0, z * u), R=0.14 * u, r=0.032 * u, seg=(32, 8))
    k.sphere(yellow, at=(0, 0, -1.78 * u), r=0.16 * u, seg=32)
    if k.picture:
        soap = film('soap')
        k.sphere(soap, r=R, scale=(1, 0.05, 1))
        k.sphere(soap, at=(0.74 * u, -0.25 * u, 0.62 * u), r=0.15 * u, seg=48)
        k.sphere(soap, at=(0.98 * u, -0.1 * u, 0.3 * u), r=0.09 * u, seg=32)
    turn(k, 28)


def snow_globe(k, spec):
    u = 0.3
    dome = studio.glass('globe', colour(spec), rough=0.0, ior=1.45)
    b = dome.node_tree.nodes['Principled BSDF']
    b.inputs['Thin Wall'].default_value = True
    b.inputs['Base Color'].default_value = studio.lin('#F2FAFF')
    k.sphere(dome, r=0.9 * u)
    wood = studio.gummy('wood', colour(spec, 1), sss=0.15, rough=0.35, coat=0.6)
    k.lathe(wood, scaled([(0.0, -1.37), (0.8, -1.37), (0.84, -1.32), (0.84, -1.18), (0.74, -0.86), (0.66, -0.76), (0.0, -0.76)], u), seg=48, subsurf=1)
    gold = studio.gummy('gold', colour(spec, 2), sss=0.3, rough=0.18, sparkle=0.25)
    k.torus(gold, at=(0, 0, -0.78 * u), R=0.74 * u, r=0.1 * u, scale=(1, 1, 0.8), seg=(64, 16))
    if k.picture:
        snow = studio.gummy('snow', '#FFFFFF', sss=0.5, rough=0.45, coat=0.0, sparkle=0.5)
        k.lathe(snow, scaled([(0.0, -0.48), (0.35, -0.5), (0.6, -0.58), (0.62, -0.63), (0.47, -0.77), (0.0, -0.77)], u))
        pine = studio.gummy('pine', colour(spec, 3), sss=0.3, rough=0.3)
        k.lathe(pine, scaled([(0.0, 0.1), (0.12, -0.1), (0.08, -0.1), (0.2, -0.3), (0.14, -0.3), (0.27, -0.55), (0.0, -0.55)], u), seg=48, subsurf=1)
        k.sphere(gold, at=(0, 0, 0.17 * u), r=0.09 * u, shape=puffy('star'))
        for _ in range(48):
            while True:
                p = Vector((k.rng.uniform(-0.8, 0.8), k.rng.uniform(-0.8, 0.8), k.rng.uniform(-0.42, 0.8)))
                if p.length < 0.78 and Vector((p.x, p.y)).length > 0.2:
                    break
            k.sphere(snow, at=p * u, r=k.rng.uniform(0.025, 0.045) * u, seg=12)


def lava_lamp(k, spec):
    u = 0.3
    lilac = studio.gummy('lamp', colour(spec, 1), sss=0.25, rough=0.15, sparkle=0.25)
    k.lathe(lilac, scaled([(0.0, -1.85), (0.6, -1.85), (0.63, -1.79), (0.44, -1.0), (0.38, -0.94), (0.0, -0.94)], u), seg=48, subsurf=1)
    k.lathe(lilac, scaled([(0.0, 0.92), (0.34, 0.92), (0.32, 1.0), (0.15, 1.52), (0.08, 1.6), (0.0, 1.61)], u), seg=48, subsurf=1)
    liquid = studio.gummy('lava', colour(spec), sss=0.3, rough=0.05)
    nt = liquid.node_tree
    body = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeTexCoord').outputs['Object']
    stretch = nt.nodes.new('ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (1, 1, 0.55)
    nt.links.new(at, stretch.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 7
    noise.inputs['Detail'].default_value = 0
    nt.links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    blobs = nt.nodes.new('ShaderNodeMapRange')
    blobs.interpolation_type = 'SMOOTHSTEP'
    blobs.inputs['From Min'].default_value = 0.6
    blobs.inputs['From Max'].default_value = 0.63
    nt.links.new(noise.outputs['Fac'], blobs.inputs['Value'])
    height = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(at, height.inputs[0])
    pool = nt.nodes.new('ShaderNodeMapRange')
    pool.interpolation_type = 'SMOOTHSTEP'
    pool.inputs['From Min'].default_value = -0.8 * u
    pool.inputs['From Max'].default_value = -0.7 * u
    pool.inputs['To Min'].default_value = 1
    pool.inputs['To Max'].default_value = 0
    nt.links.new(height.outputs['Z'], pool.inputs['Value'])
    wax = nt.nodes.new('ShaderNodeMath')
    wax.operation = 'MAXIMUM'
    nt.links.new(blobs.outputs['Result'], wax.inputs[0])
    nt.links.new(pool.outputs['Result'], wax.inputs[1])
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.inputs['A'].default_value = studio.lin(colour(spec))
    tint.inputs['B'].default_value = studio.lin(colour(spec, 3))
    nt.links.new(wax.outputs[0], tint.inputs['Factor'])
    nt.links.new(tint.outputs['Result'], body.inputs['Base Color'])
    nt.links.new(tint.outputs['Result'], body.inputs['Emission Color'])
    lit = nt.nodes.new('ShaderNodeMapRange')
    lit.inputs['To Min'].default_value = 0.3
    lit.inputs['To Max'].default_value = 1.6
    nt.links.new(wax.outputs[0], lit.inputs['Value'])
    nt.links.new(lit.outputs['Result'], body.inputs['Emission Strength'])
    k.lathe(liquid, scaled([(0.0, -0.96), (0.38, -0.96), (0.48, -0.62), (0.5, -0.2), (0.44, 0.4), (0.33, 0.94), (0.0, 0.94)], u), seg=48)
    turn(k, 180)


def disco_ball(k, spec):
    u = 0.3
    tiles = [studio.gloss('mirror', colour(spec), rough=0.06, metallic=1.0), studio.gloss('grout', colour(spec, 1), rough=0.4)]
    tiles += [studio.gloss('tint', c, rough=0.06, metallic=1.0) for c in ('#FF9FC5', '#9FD3FF', '#FFD978', '#C7B6FF')]
    seg = k.res(36, 20, 2)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=u)
    gap = 0.12 * math.tau * u / seg
    for f in bm.faces:
        if len(f.verts) == 3:
            f.material_index = 1
    tiles_only = [f for f in bm.faces if len(f.verts) == 4]
    for f in bmesh.ops.inset_individual(bm, faces=tiles_only, thickness=gap, depth=gap * 0.3)['faces']:
        f.material_index = 1
    bm.faces.index_update()
    place = {f.index: n for n, f in enumerate(sorted(bm.faces, key=lambda f: tuple(round(c, 6) for c in f.calc_center_median())))}
    bm.faces.sort(key=lambda f: place[f.index])
    for f in bm.faces:
        if f.material_index == 0 and k.rng.random() < 0.16:
            f.material_index = k.rng.randrange(2, len(tiles))
    painted(k, 'disco', bm, tiles, smooth=False)
    cap = studio.gloss('cap', colour(spec, 1), rough=0.2, metallic=0.6)
    k.lathe(cap, scaled([(0.0, 0.92), (0.16, 0.92), (0.13, 1.18), (0.0, 1.2)], u), seg=24, subsurf=1)
    k.torus(cap, at=(0, 0, 1.26 * u), R=0.07 * u, r=0.025 * u, rot=(math.pi / 2, 0, 0), seg=(24, 8))
    if k.picture:
        spark = glow(studio.gummy('glint', '#FFFFFF', sss=0.0, rough=0.3), '#FFFFFF', 6.0)

        def glint(co):
            n = co.normalized()
            reach = 0.1 + 0.9 * abs(math.cos(2 * math.atan2(n.z, n.x))) ** 24
            return Vector((n.x * reach, n.y * 0.1, n.z * reach))
        for d, size in ((Vector((-0.45, -0.75, 0.5)), 0.3), (Vector((0.5, -0.8, -0.15)), 0.2)):
            d.normalize()
            k.sphere(spark, at=d * 1.03 * u, r=size * u, shape=glint, rot=d.to_track_quat('-Y', 'Z').to_euler())


def jack_in_the_box(k, spec):
    u = 0.3
    red = studio.gummy('jack', colour(spec), sss=0.3, rough=0.18)
    yellow = studio.gummy('lid', colour(spec, 1), sss=0.3, rough=0.2)
    lilac = studio.gummy('crank', colour(spec, 2), sss=0.3, rough=0.2)
    knob = studio.gummy('knob', colour(spec, 3), sss=0.3, rough=0.16)
    k.box(red, dims=(1.7 * u, 1.7 * u, 1.7 * u), bevel=0.14 * u)
    lift = math.radians(-9)
    hinge = Vector((0, 0.9 * u, 0.84 * u))
    k.box(yellow, at=hinge + Matrix.Rotation(lift, 3, 'X') @ Vector((0, -0.92 * u, 0.1 * u)), dims=(1.84 * u, 1.84 * u, 0.2 * u), bevel=0.07 * u, rot=(lift, 0, 0))
    k.box(studio.gloss('dark', INK, rough=0.3), at=(0, 0, 0.86 * u), dims=(1.5 * u, 1.5 * u, 0.04 * u), bevel=0.015 * u, segments=2)
    white = studio.gloss('peek', '#FFFFFF', rough=0.1)
    pupil = studio.gloss('pupil', INK, rough=0.06)
    for s in (-1, 1):
        k.sphere(white, at=(s * 0.2 * u, -0.66 * u, 0.98 * u), r=0.11 * u, scale=(1, 0.8, 1), seg=24)
        k.sphere(pupil, at=(s * 0.2 * u, -0.74 * u, 0.97 * u), r=0.055 * u, scale=(1, 0.6, 1), seg=24)
    k.sphere(yellow, at=(0, -0.87 * u, 0), r=0.42 * u, shape=puffy('star'), seg=36)
    k.sphere(lilac, at=(-0.87 * u, 0, -0.02 * u), r=0.38 * u, shape=puffy('heart'), rot=(0, 0, -math.pi / 2), seg=36)
    k.sphere(yellow, at=(0, 0.87 * u, 0), r=0.42 * u, shape=puffy('star'), rot=(0, 0, math.pi), seg=36)
    k.sphere(lilac, at=(0.86 * u, 0, 0.1 * u), r=0.17 * u, scale=(0.45, 1, 1), seg=24)
    k.rod(lilac, (0.85 * u, 0, 0.1 * u), (1.2 * u, 0, 0.1 * u), 0.08 * u, verts=16)
    k.sphere(lilac, at=(1.2 * u, 0, 0.1 * u), r=0.085 * u, seg=24)
    k.rod(lilac, (1.2 * u, 0, 0.1 * u), (1.2 * u, 0, -0.35 * u), 0.07 * u, verts=16)
    k.sphere(lilac, at=(1.2 * u, 0, -0.35 * u), r=0.075 * u, seg=24)
    k.rod(lilac, (1.2 * u, 0, -0.35 * u), (1.34 * u, 0, -0.35 * u), 0.06 * u, verts=16)
    k.sphere(knob, at=(1.4 * u, 0, -0.35 * u), r=0.14 * u, seg=32)
    turn(k, -38)


def rubber_chicken(k, spec):
    u = 0.3
    skin = studio.gummy('chicken', colour(spec), sss=0.35, rough=0.32, coat=0.4)
    nt = skin.node_tree
    bumps = nt.nodes.new('ShaderNodeTexVoronoi')
    bumps.inputs['Scale'].default_value = 90
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Object'], bumps.inputs['Vector'])
    raise_ = nt.nodes.new('ShaderNodeBump')
    raise_.inputs['Strength'].default_value = 0.25
    raise_.inputs['Distance'].default_value = 0.004
    raise_.invert = True
    nt.links.new(bumps.outputs['Distance'], raise_.inputs['Height'])
    nt.links.new(raise_.outputs['Normal'], nt.nodes['Principled BSDF'].inputs['Normal'])
    beak = studio.gummy('beak', colour(spec, 2), sss=0.3, rough=0.25)
    comb = studio.gummy('comb', colour(spec, 3), sss=0.3, rough=0.22)

    def body(co):
        n = co.normalized()
        t = (n.x + 1) / 2
        w = 0.72 + 0.28 * smooth(t * 1.4)
        return Vector((n.x * 1.0, n.y * 0.5 * w, n.z * 0.5 * w + 0.1 * smooth((0.25 - t) / 0.25)))
    k.sphere(skin, at=(-0.12 * u, 0, 0), r=u, shape=body)
    k.sphere(skin, at=(-1.02 * u, 0, 0.3 * u), r=0.16 * u, scale=(0.8, 0.7, 1.3), rot=(0, -0.5, 0), seg=32)
    for s in (-1, 1):
        k.sphere(skin, at=(-0.05 * u, s * 0.4 * u, 0.08 * u), r=0.36 * u, scale=(1, 0.22, 0.55), rot=(0, 0.35, 0), seg=32)
    k.tube(skin, [(0.62 * u, 0, 0.05 * u), (0.88 * u, 0, 0.16 * u), (1.1 * u, 0, 0.36 * u)], 0.17 * u, steps=8)
    k.sphere(skin, at=(1.22 * u, 0, 0.42 * u), r=0.36 * u, scale=(1.05, 0.9, 1), seg=48)
    for tilt, length in ((-0.38, 0.48), (0.5, 0.4)):
        jaw = k.lathe(beak, scaled([(0.0, 0.0), (0.17, 0.0), (0.0, length)], u), at=(1.5 * u, 0, 0.42 * u), rot=(0, math.pi / 2 + tilt, 0), seg=32)
        for v in jaw.data.vertices:
            v.co.y *= 1.25
    k.sphere(comb, at=(1.62 * u, 0, 0.42 * u), r=0.12 * u, scale=(1, 1.2, 0.9), seg=24)
    for x, z, s in ((1.06, 0.8, 0.1), (1.21, 0.86, 0.12), (1.36, 0.8, 0.1)):
        k.sphere(comb, at=(x * u, 0, z * u), r=s * u, scale=(1, 0.55, 1.15), seg=24)
    k.sphere(comb, at=(1.5 * u, 0, 0.14 * u), r=0.1 * u, scale=(0.7, 0.55, 1.3), seg=24)
    white = studio.gloss('white', '#FFFFFF', rough=0.1)
    ink = studio.gloss('eye', INK, rough=0.06)
    for s in (-1, 1):
        c = Vector((1.33 * u, s * 0.28 * u, 0.56 * u))
        k.sphere(white, at=c, r=0.13 * u, seg=24)
        k.sphere(ink, at=c + Vector((0.05 * u, s * 0.1 * u, -0.02 * u)), r=0.05 * u, seg=16)
    for x in (0.1, 0.45):
        hip = Vector((x * u, -0.18 * u, -0.3 * u))
        ankle = Vector(((x + 0.08) * u, -0.78 * u, -0.44 * u))
        k.tube(beak, [hip, (hip + ankle) / 2 + Vector((0, 0, 0.04 * u)), ankle], 0.05 * u, steps=8)
        for dx, dy in ((-0.13, -0.15), (0.0, -0.2), (0.13, -0.15)):
            k.rod(beak, ankle, ankle + Vector((dx * u, dy * u, -0.02 * u)), 0.04 * u, verts=8)
    turn(k, -28)


def magnet(k, spec):
    u = 0.3
    red = studio.gummy('magnet', colour(spec), sss=0.3, rough=0.14)
    steel = studio.gloss('steel', colour(spec, 1), rough=0.16, metallic=1.0)
    rho, a, b, leg = 0.6, 0.25, 0.24, 0.62
    n_leg, n_arc, cs = k.res(8, 4), k.res(48, 12), k.res(32, 12, 4)
    path = [((-rho, -leg + leg * i / n_leg), (-1, 0)) for i in range(n_leg)]
    path += [((rho * math.cos(t), rho * math.sin(t)), (math.cos(t), math.sin(t))) for t in (math.pi * (1 - i / n_arc) for i in range(n_arc + 1))]
    path += [((rho, -leg * i / n_leg), (1, 0)) for i in range(1, n_leg + 1)]
    bm = bmesh.new()
    rings = []
    for (px, pz), (nx, nz) in path:
        ring = []
        for j in range(cs):
            t = j / cs * math.tau
            sa = math.copysign(abs(math.cos(t)) ** 0.5, math.cos(t)) * a
            sb = math.copysign(abs(math.sin(t)) ** 0.5, math.sin(t)) * b
            ring.append(bm.verts.new(((px + nx * sa) * u, sb * u, (pz + nz * sa) * u)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for j in range(cs):
            bm.faces.new((r0[j], r0[(j + 1) % cs], r1[(j + 1) % cs], r1[j]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.mesh('horseshoe', bm, red)
    for s in (-1, 1):
        k.box(steel, at=(s * rho * u, 0, -0.86 * u), dims=((2 * a + 0.02) * u, (2 * b + 0.02) * u, 0.52 * u), bevel=0.06 * u)
    turn(k, -25)


def sparkler(k, spec):
    u = 0.3
    core = glow(studio.gummy('flare', '#FFF6D6', sss=0.4, rough=0.25), '#FFF1BF', 5.0)
    spark = glow(studio.gummy('spark', colour(spec), sss=0.4, rough=0.25), colour(spec), 0.9)
    k.sphere(core, r=0.19 * u, seg=32)
    golden = math.pi * (3 - math.sqrt(5))
    n = 16
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        d = Vector((math.cos(golden * i) * math.sqrt(1 - z * z), math.sin(golden * i) * math.sqrt(1 - z * z), z))
        length = 0.44 if i % 2 == 0 else 0.32
        k.lathe(spark, scaled([(0.0, 0.0), (0.06, 0.0), (0.015, length - 0.015), (0.0, length)], u), rot=d.to_track_quat('Z', 'Y').to_euler(), seg=16, subsurf=0)
    coat = studio.matte('coat', colour(spec, 1), rough=0.8, sss=0.05, bump=0.6, bump_scale=160)
    k.rod(coat, (0, 0, -0.15 * u), (0, 0, -1.6 * u), 0.1 * u, verts=16)
    wood = studio.gummy('handle', colour(spec, 2), sss=0.15, rough=0.4, coat=0.3)
    k.rod(wood, (0, 0, -1.56 * u), (0, 0, -2.0 * u), 0.13 * u, verts=16)
    if k.picture:
        for _ in range(12):
            d = Vector((k.rng.uniform(-1, 1), k.rng.uniform(-1, 1), k.rng.uniform(-0.4, 1))).normalized()
            k.sphere(core, at=d * k.rng.uniform(0.48, 0.6) * u, r=k.rng.uniform(0.025, 0.04) * u, seg=12)


def umbrella(k, spec):
    u = 0.3
    panels = [studio.gummy('canopy', colour(spec), sss=0.3, rough=0.22), studio.gummy('panel', '#FFF3DC', sss=0.3, rough=0.22)]
    ink = studio.gloss('shaft', colour(spec, 1), rough=0.12)
    yellow = studio.gummy('tip', colour(spec, 3), sss=0.3, rough=0.18)
    ribs = 8
    per, rings = k.res(10, 4, 2), k.res(16, 8)
    count = ribs * per
    bm = bmesh.new()
    top = bm.verts.new((0, 0, 0.55 * u))
    grid = []
    for i in range(1, rings + 1):
        t = i / rings
        row = []
        for j in range(count):
            a = j / count * math.tau
            s = (j % per) / per
            f = math.cos(math.pi / ribs) / math.cos((s - 0.5) * math.tau / ribs) * (1 + 0.035 * math.sin(math.pi * s) * t)
            z = 0.55 - 1.1 * t ** 1.8 + 0.12 * math.sin(math.pi * s) * t ** 6
            row.append(bm.verts.new((1.25 * t * f * math.cos(a) * u, 1.25 * t * f * math.sin(a) * u, z * u)))
        grid.append(row)
    for j in range(count):
        bm.faces.new((top, grid[0][j], grid[0][(j + 1) % count])).material_index = (j // per) % 2
    for r0, r1 in zip(grid, grid[1:]):
        for j in range(count):
            bm.faces.new((r0[j], r1[j], r1[(j + 1) % count], r0[(j + 1) % count])).material_index = (j // per) % 2
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    canopy = painted(k, 'canopy', bm, panels)
    sol = canopy.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.05 * u
    sol.offset = -1
    if k.picture:
        for i in range(ribs):
            a = i / ribs * math.tau
            k.sphere(yellow, at=(1.25 * math.cos(a) * u, 1.25 * math.sin(a) * u, -0.56 * u), r=0.06 * u, seg=24)
    k.sphere(yellow, at=(0, 0, 0.64 * u), r=0.1 * u, seg=32)
    k.rod(ink, (0, 0, 0.6 * u), (0, 0, -1.62 * u), 0.075 * u, verts=16)
    hook = [(0, -1.58), (0, -1.8), (0.03, -1.9), (0.1, -1.95), (0.22, -1.95), (0.3, -1.9), (0.33, -1.8), (0.33, -1.7)]
    k.tube(ink, [(x * u, 0, z * u) for x, z in hook], 0.08 * u, steps=8)
    turn(k, 15)


def kite(k, spec):
    u = 0.3
    sails = (studio.gummy('kite', colour(spec), sss=0.3, rough=0.25, coat=0.6), studio.gummy('sail', colour(spec, 1), sss=0.3, rough=0.25, coat=0.6))
    trim = studio.gummy('spar', '#FFF3DC', sss=0.3, rough=0.3)
    centre = Vector((0, 0, 0.3))
    tips = [Vector((0, 0, 1.13)), Vector((1.1, 0, 0.3)), Vector((0, 0, -1.13)), Vector((-1.1, 0, 0.3))]
    for i in range(4):
        corner = (centre, tips[i], tips[(i + 1) % 4])
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(p * u) for p in corner])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=k.res(10, 4), use_grid_fill=True)
        a, b, c = (p * u for p in corner)
        area = (b - a).cross(c - a).length
        for v in bm.verts:
            wa = (b - v.co).cross(c - v.co).length / area
            wb = (c - v.co).cross(a - v.co).length / area
            v.co.y = -0.14 * u * min(1.0, 27 * wa * wb * max(0.0, 1 - wa - wb)) ** 0.5
        sail = k.mesh('sail', bm, sails[i % 2])
        sol = sail.modifiers.new('thick', 'SOLIDIFY')
        sol.thickness = 0.06 * u
        sol.offset = 0
    for a, b in ((tips[0], tips[2]), (tips[1], tips[3])):
        k.rod(trim, (a.x * u, -0.02 * u, a.z * u), (b.x * u, -0.02 * u, b.z * u), 0.035 * u, verts=8)
    for i in range(4):
        a, b = tips[i] * u, tips[(i + 1) % 4] * u
        k.rod(trim, a, b, 0.04 * u, verts=8)
        k.sphere(trim, at=a, r=0.06 * u, seg=24)
    k.sphere(trim, at=(0, -0.04 * u, 0.3 * u), r=0.07 * u, seg=24)
    string = [(0, -1.13), (0.04, -1.22), (0.08, -1.36), (0.1, -1.5), (0.04, -1.64), (-0.04, -1.76), (-0.05, -1.84)]
    k.tube(trim, [(x * u, 0, z * u) for x, z in string], 0.03 * u, steps=6)

    def wing(co):
        n = co.normalized()
        w = 0.35 + 0.65 * smooth((n.x + 1) / 2)
        return Vector((n.x, n.y * w * 0.35, n.z * w))
    for (x, z), i in zip(((0.0, -1.2), (0.1, -1.5), (-0.05, -1.78)), (1, 2, 3)):
        bow = studio.gummy('bow', colour(spec, i), sss=0.3, rough=0.25)
        for s in (-1, 1):
            k.sphere(bow, at=((x + s * 0.14) * u, 0, z * u), r=0.14 * u, scale=(1, 1, 0.85), shape=wing, rot=(0, 0, 0 if s > 0 else math.pi), seg=24)
        k.sphere(bow, at=(x * u, 0, z * u), r=0.055 * u, seg=16)
    turn(k, 20)


def music_box(k, spec):
    u = 0.3
    pink = studio.gummy('musicbox', colour(spec), sss=0.3, rough=0.2)
    lid = studio.gloss('lid', colour(spec, 1), rough=0.18)
    dress = studio.gummy('dress', colour(spec, 2), sss=0.4, rough=0.3)
    skin = studio.gummy('skin', colour(spec, 3), sss=0.5, rough=0.35)
    gold = studio.gummy('gold', colour(spec, 4), sss=0.3, rough=0.18, sparkle=0.25)
    k.box(pink, dims=(1.9 * u, 1.4 * u, 1.2 * u), bevel=0.12 * u)
    k.box(lid, at=(0, 0, 0.68 * u), dims=(2.0 * u, 1.5 * u, 0.16 * u), bevel=0.07 * u)
    k.box(gold, at=(0, 0, 0.58 * u), dims=(1.94 * u, 1.44 * u, 0.06 * u), bevel=0.025 * u, segments=2)
    k.lathe(gold, scaled([(0.0, 0.76), (0.26, 0.76), (0.27, 0.8), (0.25, 0.83), (0.0, 0.83)], u), seg=32, subsurf=1)
    tutu = lambda a, z: 1 + (0.14 * math.cos(a * 9) if 0.96 * u < z < 1.04 * u else 0.0)
    k.lathe(dress, scaled([(0.0, 0.83), (0.05, 0.86), (0.06, 0.95), (0.25, 1.0), (0.08, 1.05), (0.1, 1.18), (0.05, 1.33), (0.0, 1.35)], u), seg=36, radial=tutu)
    k.sphere(skin, at=(0, 0, 1.45 * u), r=0.1 * u, seg=24)
    k.sphere(gold, at=(0, 0.02 * u, 1.55 * u), r=0.05 * u, seg=16)
    for s in (-1, 1):
        k.tube(skin, [(s * 0.06 * u, 0, 1.28 * u), (s * 0.15 * u, 0, 1.3 * u), (s * 0.22 * u, 0, 1.24 * u)], 0.022 * u, steps=6)
    note = studio.gloss('note', colour(spec, 1), rough=0.18)
    k.sphere(note, at=(-0.1 * u, -0.71 * u, -0.22 * u), r=0.13 * u, scale=(1.25, 0.4, 0.9), rot=(0, 0.45, 0), seg=32)
    k.rod(note, (0.04 * u, -0.71 * u, -0.18 * u), (0.04 * u, -0.71 * u, 0.32 * u), 0.035 * u, verts=8)
    k.tube(note, [(x * u, -0.71 * u, z * u) for x, z in ((0.04, 0.32), (0.14, 0.26), (0.22, 0.14), (0.18, 0.02))], 0.035 * u, steps=8)
    k.rod(gold, (0.93 * u, 0, 0), (1.22 * u, 0, 0), 0.06 * u, verts=12)
    k.sphere(gold, at=(1.22 * u, 0, 0), r=0.07 * u, seg=16)
    for s in (-1, 1):
        k.torus(gold, at=(1.3 * u, 0, s * 0.13 * u), R=0.1 * u, r=0.04 * u, rot=(math.pi / 2, 0, 0), seg=(24, 8))
    turn(k, -32)


def crystal(k, spec):
    u = 0.3
    gem = glow(studio.glass('crystal', colour(spec), rough=0.0, ior=1.9), colour(spec), 0.3)
    b = gem.node_tree.nodes['Principled BSDF']
    b.inputs['Transmission Dispersion Scale'].default_value = 1.0
    b.inputs['Transmission Dispersion Abbe Number'].default_value = 18
    bm = bmesh.new()

    def ring(r, z, shift):
        return [bm.verts.new((r * math.cos((i + shift) / 8 * math.tau) * u, r * math.sin((i + shift) / 8 * math.tau) * u, z * u)) for i in range(8)]

    def strip(lo, hi):
        for i in range(8):
            bm.faces.new((lo[i], lo[(i + 1) % 8], hi[i]))
            bm.faces.new((hi[i], lo[(i + 1) % 8], hi[(i + 1) % 8]))
    apex = bm.verts.new((0, 0, -0.9 * u))
    pavilion = ring(0.36, 0.0, 0)
    girdle = ring(0.7, 0.52, 0.5)
    band = ring(0.7, 0.6, 0.5)
    crown = ring(0.52, 0.88, 1.0)
    table = ring(0.36, 1.05, 1.5)
    for i in range(8):
        bm.faces.new((apex, pavilion[(i + 1) % 8], pavilion[i]))
        bm.faces.new((girdle[i], girdle[(i + 1) % 8], band[(i + 1) % 8], band[i]))
    strip(pavilion, girdle)
    strip(band, crown)
    strip(crown, table)
    bm.faces.new(table)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.mesh('gem', bm, gem, smooth=False)
    turn(k, 11)


def lantern(k, spec):
    u = 0.3
    paper = studio.gummy('paper', colour(spec), sss=0.6, rough=0.45, coat=0.2)
    nt = paper.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = studio.lin('#FFB27A')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Object'], sep.inputs[0])
    angle = nt.nodes.new('ShaderNodeMath')
    angle.operation = 'ARCTAN2'
    nt.links.new(sep.outputs['Y'], angle.inputs[0])
    nt.links.new(sep.outputs['X'], angle.inputs[1])
    ribs = nt.nodes.new('ShaderNodeMath')
    ribs.operation = 'MULTIPLY'
    ribs.inputs[1].default_value = 6
    nt.links.new(angle.outputs[0], ribs.inputs[0])
    wave = nt.nodes.new('ShaderNodeMath')
    wave.operation = 'SINE'
    nt.links.new(ribs.outputs[0], wave.inputs[0])
    size = nt.nodes.new('ShaderNodeMath')
    size.operation = 'ABSOLUTE'
    nt.links.new(wave.outputs[0], size.inputs[0])
    line = nt.nodes.new('ShaderNodeMapRange')
    line.interpolation_type = 'SMOOTHSTEP'
    line.inputs['From Min'].default_value = 0.03
    line.inputs['From Max'].default_value = 0.14
    nt.links.new(size.outputs[0], line.inputs['Value'])
    facing = nt.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = 0.45
    lit = nt.nodes.new('ShaderNodeMapRange')
    lit.inputs['To Min'].default_value = 3.2
    lit.inputs['To Max'].default_value = 0.6
    nt.links.new(facing.outputs['Facing'], lit.inputs['Value'])
    strength = nt.nodes.new('ShaderNodeMath')
    strength.operation = 'MULTIPLY'
    nt.links.new(lit.outputs['Result'], strength.inputs[0])
    nt.links.new(line.outputs['Result'], strength.inputs[1])
    nt.links.new(strength.outputs[0], b.inputs['Emission Strength'])
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.inputs['A'].default_value = studio.lin(colour(spec, 1))
    tint.inputs['B'].default_value = studio.lin(colour(spec))
    nt.links.new(line.outputs['Result'], tint.inputs['Factor'])
    nt.links.new(tint.outputs['Result'], b.inputs['Base Color'])
    t0 = math.asin(0.4 / 0.85)
    body = [(0.0, -0.95 * math.cos(t0))] + [(0.85 * math.sin(t), -0.95 * math.cos(t)) for t in (t0 + (math.pi - 2 * t0) * i / 14 for i in range(15))] + [(0.0, 0.95 * math.cos(t0))]
    k.lathe(paper, scaled(body, u), seg=96, radial=lambda a, z: 1 - 0.06 * (1 - abs(math.sin(a * 6))) ** 4, subsurf=0)
    red = studio.gummy('cap', colour(spec, 1), sss=0.3, rough=0.18)
    k.lathe(red, scaled([(0.0, 0.82), (0.44, 0.82), (0.47, 0.92), (0.42, 1.06), (0.0, 1.1)], u), seg=32, subsurf=1)
    k.lathe(red, scaled([(0.0, -1.1), (0.42, -1.06), (0.47, -0.92), (0.44, -0.82), (0.0, -0.82)], u), seg=32, subsurf=1)
    k.torus(red, at=(0, 0, 1.16 * u), R=0.07 * u, r=0.022 * u, rot=(math.pi / 2, 0, 0), seg=(24, 8))
    tassel = studio.gummy('tassel', colour(spec, 3), sss=0.3, rough=0.4, coat=0.2, sheen=0.5)
    k.sphere(tassel, at=(0, 0, -1.16 * u), r=0.08 * u, seg=24)
    k.lathe(tassel, scaled([(0.0, -1.2), (0.06, -1.22), (0.09, -1.4), (0.13, -1.66), (0.0, -1.7)], u), seg=32, radial=lambda a, z: 1 + 0.12 * math.cos(a * 12), subsurf=1)


def watermelon(k, spec):
    u = 0.3
    mats = [
        studio.gummy('melon', colour(spec), sss=0.5, rough=0.25, sparkle=0.2),
        studio.gummy('pith', '#F4F7DC', sss=0.4, rough=0.3),
        studio.gummy('rind', colour(spec, 1), sss=0.3, rough=0.25),
        studio.gummy('stripe', '#3F8A3E', sss=0.3, rough=0.25),
    ]
    apex, alpha, d = -0.8, math.radians(35.7), 0.3
    radii = [0.0, 0.5, 1.0, 1.4, 1.54, 1.6, 1.66, 1.8]
    na = k.res(24, 12, 2)

    def band(r):
        return 0 if r < 1.54 else 1 if r < 1.66 else 2

    bm = bmesh.new()
    sides = {}
    for y in (-d, d):
        tip = bm.verts.new((0, y * u, apex * u))
        grid = [[tip] * (na + 1)] + [[bm.verts.new((r * math.sin(b) * u, y * u, (apex + r * math.cos(b)) * u)) for b in (-alpha + 2 * alpha * j / na for j in range(na + 1))] for r in radii[1:]]
        sides[y] = grid
        for i in range(len(radii) - 1):
            for j in range(na):
                vs = list(dict.fromkeys((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])))
                bm.faces.new(vs if y < 0 else vs[::-1]).material_index = band((radii[i] + radii[i + 1]) / 2)
    front, back = sides[-d], sides[d]
    for j in range(na):
        bm.faces.new((front[-1][j], front[-1][j + 1], back[-1][j + 1], back[-1][j])).material_index = 3 if (j * 8 // na) % 2 else 2
    for i in range(len(radii) - 1):
        for j in (0, na):
            vs = (front[i][j], front[i + 1][j], back[i + 1][j], back[i][j])
            bm.faces.new(vs if j else vs[::-1]).material_index = band((radii[i] + radii[i + 1]) / 2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = painted(k, 'slice', bm, mats)
    bv = ob.modifiers.new('round', 'BEVEL')
    bv.width = 0.07 * u
    bv.segments = k.res(4, 2)
    bv.limit_method = 'ANGLE'
    ob.modifiers.new('normals', 'WEIGHTED_NORMAL')
    seed = studio.gloss('seed', colour(spec, 2), rough=0.08)

    def drop(co):
        n = co.normalized()
        return Vector((n.x * (0.55 + 0.45 * smooth((n.z + 1) / 1.4)), n.y, n.z))
    for x, z in ((0.0, -0.2), (-0.31, 0.15), (0.31, 0.15), (-0.57, 0.42), (0.57, 0.42), (0.0, 0.55)):
        tilt = math.atan2(x, z - apex)
        for y in (-d, d):
            k.sphere(seed, at=(x * u, y * u, z * u), r=0.075 * u, scale=(0.6, 0.35, 1.0), shape=drop, rot=(0, tilt, 0), seg=24)
    turn(k, 25, tilt=(0, 180))


def ice_cream(k, spec):
    u = 0.3
    wafer = waffle(studio.matte('cone', colour(spec), rough=0.55, sss=0.2), '#C98A5B', cells=7, pitch=15.0)
    k.lathe(wafer, scaled([(0.0, -0.95), (0.06, -0.9), (0.5, 0.84), (0.0, 0.84)], u), seg=64, subsurf=1)
    k.torus(wafer, at=(0, 0, 0.86 * u), R=0.5 * u, r=0.07 * u, seg=(48, 12))
    cream = studio.gummy('scoop', colour(spec, 1), sss=0.45, rough=0.3)

    def scoop(co):
        n = co.normalized()
        lip = math.exp(-((n.z + 0.45) / 0.18) ** 2)
        g = 1 + lip * (0.16 + 0.07 * math.sin(math.atan2(n.y, n.x) * 7))
        return Vector((n.x * g, n.y * g, n.z))
    k.sphere(cream, at=(0, 0, 1.2 * u), r=0.66 * u, scale=(1, 1, 0.88), shape=scoop, seg=54)
    k.tube(cream, [(0.36 * u, -0.32 * u, 0.95 * u), (0.4 * u, -0.36 * u, 0.8 * u), (0.42 * u, -0.37 * u, 0.66 * u)], 0.09 * u, steps=8)
    k.sphere(cream, at=(0.42 * u, -0.37 * u, 0.62 * u), r=0.11 * u, seg=24)
    cherry = studio.gummy('cherry', colour(spec, 2), sss=0.3, rough=0.08)
    k.sphere(cherry, at=(0, 0, 1.8 * u), r=0.15 * u, seg=32)
    k.tube(studio.matte('stem', '#5A3A2A', rough=0.5), [(0, 0, 1.92 * u), (0.02 * u, 0, 1.99 * u), (0.07 * u, 0.02 * u, 2.05 * u)], 0.012, steps=6)
    if k.picture:
        mats = [studio.gummy('sprinkle', c, sss=0.15, rough=0.25) for c in ('#FFD978', '#9FD3FF', '#FFFFFF', '#7FD6B5', '#C7B6FF')]
        for _ in range(22):
            a = k.rng.uniform(0, math.tau)
            e = k.rng.uniform(0.15, 1.2)
            p = Vector((math.cos(a) * math.cos(e) * 0.67, math.sin(a) * math.cos(e) * 0.67, 1.2 + math.sin(e) * 0.59)) * u
            t = k.rng.uniform(0, math.tau)
            step = Vector((math.cos(t), math.sin(t), 0)) * 0.035 * u
            k.rod(k.rng.choice(mats), p - step, p + step, 0.012 * u, verts=10)


def robot(k, spec):
    u = 0.3
    blue = studio.gummy('robot', colour(spec), sss=0.25, rough=0.18)
    steel = studio.gloss('steel', colour(spec, 1), rough=0.25, metallic=0.7)
    red = studio.gummy('bulb', colour(spec, 2), sss=0.3, rough=0.12)
    ink = studio.gloss('visor', colour(spec, 5), rough=0.08)
    k.box(blue, at=(0, 0, 0.1 * u), dims=(1.5 * u, 1.2 * u, 1.4 * u), bevel=0.14 * u)
    for s in (-1, 1):
        k.box(steel, at=(s * 0.38 * u, -0.06 * u, -0.7 * u), dims=(0.46 * u, 0.62 * u, 0.2 * u), bevel=0.07 * u)
    k.rod(steel, (0, 0, 0.75 * u), (0, 0, 0.92 * u), 0.24 * u)
    k.box(steel, at=(0, 0, 1.3 * u), dims=(1.1 * u, 1.0 * u, 0.9 * u), bevel=0.14 * u)
    k.box(ink, at=(0, -0.48 * u, 1.35 * u), dims=(0.8 * u, 0.08 * u, 0.28 * u), bevel=0.06 * u)
    eye = glow(studio.gummy('eye', colour(spec), sss=0.2, rough=0.1), '#CFEFFF', 4.0)
    for s in (-1, 1):
        k.sphere(eye, at=(s * 0.2 * u, -0.53 * u, 1.36 * u), r=0.07 * u, scale=(1, 0.5, 1), seg=24)
        k.rod(red, (s * 0.55 * u, 0, 1.3 * u), (s * 0.66 * u, 0, 1.3 * u), 0.12 * u, verts=16)
    k.rod(steel, (0, 0, 1.75 * u), (0, 0, 1.84 * u), 0.035 * u, verts=8)
    k.sphere(glow(studio.gummy('bulb', colour(spec, 2), sss=0.3, rough=0.12), colour(spec, 2), 0.8), at=(0, 0, 1.88 * u), r=0.1 * u, seg=24)
    k.box(steel, at=(0, -0.6 * u, 0.2 * u), dims=(0.95 * u, 0.06 * u, 0.75 * u), bevel=0.04 * u, segments=3)
    for x, c in ((-0.25, colour(spec, 2)), (0.0, '#FFD25E'), (0.25, '#7FD6B5')):
        k.sphere(studio.gummy('button', c, sss=0.3, rough=0.12), at=(x * u, -0.64 * u, 0.38 * u), r=0.08 * u, scale=(1, 0.6, 1), seg=18)
    for z in (0.14, 0.02, -0.1):
        k.box(ink, at=(0, -0.635 * u, z * u), dims=(0.6 * u, 0.03 * u, 0.05 * u), bevel=0.015 * u, segments=2)
    for s in (-1, 1):
        k.sphere(steel, at=(s * 0.86 * u, 0, 0.5 * u), r=0.15 * u, seg=32)
        k.rod(steel, (s * 0.95 * u, 0, 0.5 * u), (s * 0.95 * u, 0, -0.38 * u), 0.12 * u, verts=16)
        k.torus(steel, at=(s * 0.95 * u, 0, -0.5 * u), R=0.12 * u, r=0.045 * u, rot=(math.pi / 2, 0, 0), keep=lambda co, a: abs(a + math.pi / 2) > 0.65, seg=(32, 8))
        for e in (-1, 1):
            a = -math.pi / 2 + e * 0.65
            k.sphere(steel, at=((s * 0.95 + 0.12 * math.cos(a)) * u, 0, (-0.5 + 0.12 * math.sin(a)) * u), r=0.045 * u, seg=12)
    turn(k, -22)


def whoopee_cushion(k, spec):
    u = 0.3
    rubber = studio.gummy('whoopee', colour(spec), sss=0.35, rough=0.3, coat=0.5)

    def puff(co):
        n = co.normalized()
        return Vector((n.x, n.y, n.z * (1.2 if n.z > 0 else 0.8)))
    k.sphere(rubber, r=u, scale=(1.12, 1.0, 0.42), shape=puff, seg=54)
    k.torus(rubber, R=u, r=0.05 * u, scale=(1.12, 1.0, 1.0), seg=(64, 10))
    neck = k.lathe(rubber, scaled([(0.0, 0.8), (0.46, 0.8), (0.34, 1.0), (0.28, 1.2), (0.32, 1.42), (0.42, 1.52), (0.36, 1.58), (0.0, 1.58)], u), rot=(0, math.pi / 2, 0), seg=32)
    for v in neck.data.vertices:
        v.co.z *= 0.5
    k.sphere(studio.gloss('mouth', INK, rough=0.2), at=(1.57 * u, 0, 0), r=0.24 * u, scale=(0.18, 1, 0.42), seg=24)
    turn(k, -35)


def spinning_top(k, spec):
    u = 0.3
    gores = [studio.gummy('top', colour(spec), sss=0.3, rough=0.16), studio.gummy('gore', '#FFF3DC', sss=0.3, rough=0.16)]
    yellow = studio.gummy('rim', colour(spec, 1), sss=0.3, rough=0.18, sparkle=0.2)
    pink = studio.gummy('dome', colour(spec, 2), sss=0.35, rough=0.16)
    lilac = studio.gummy('stem', colour(spec, 3), sss=0.35, rough=0.2)
    onion = [(0.0, -0.6), (0.03, -0.59), (0.07, -0.53), (0.2, -0.42), (0.38, -0.28), (0.56, -0.12), (0.72, 0.06), (0.84, 0.24), (0.9, 0.4), (0.9, 0.5), (0.0, 0.5)]
    body = k.lathe(gores[0], scaled(onion, u), seg=80, subsurf=0)
    body.data.materials.append(gores[1])
    for poly in body.data.polygons:
        poly.material_index = math.floor(math.atan2(poly.center.y, poly.center.x) / (math.tau / 8)) % 2
    k.lathe(yellow, scaled([(0.84, 0.36), (0.93, 0.38), (0.97, 0.45), (0.93, 0.52), (0.84, 0.54)], u), seg=48, cap=False, subsurf=1)
    k.lathe(pink, scaled([(0.0, 0.5), (0.6, 0.55), (0.55, 0.75), (0.4, 0.92), (0.2, 1.02), (0.0, 1.05)], u), seg=48)
    k.rod(lilac, (0, 0, 0.95 * u), (0, 0, 1.5 * u), 0.1 * u, verts=16)
    k.sphere(lilac, at=(0, 0, 1.52 * u), r=0.14 * u, seg=32)
    k.sphere(studio.gloss('point', '#D9DCEB', rough=0.15, metallic=1.0), at=(0, 0, -0.56 * u), r=0.055 * u, seg=18)
    turn(k, 20, tilt=(10, 0))


def mushroom(k, spec):
    u = 0.3
    stem = studio.gummy('stalk', colour(spec), sss=0.45, rough=0.35, coat=0.4)
    cap = studio.gummy('cap', colour(spec, 1), sss=0.3, rough=0.16)
    spot = studio.gummy('spot', colour(spec, 2), sss=0.3, rough=0.25)
    k.lathe(stem, scaled([(0.0, -0.6), (0.46, -0.6), (0.49, -0.4), (0.41, 0.0), (0.35, 0.5), (0.0, 0.62)], u), seg=40)
    a, c, mid = 1.15, 0.87, 0.7
    dome = [(a * math.sin(t), mid + c * math.cos(t)) for t in (math.pi / 2 * i / 12 for i in range(13))]
    k.lathe(cap, scaled(dome + [(1.13, 0.62), (1.02, 0.58), (0.0, 0.58)], u), seg=80, subsurf=0)
    k.lathe(stem, scaled([(1.04, 0.6), (0.7, 0.57), (0.36, 0.55)], u), seg=40, cap=False, subsurf=0)
    for theta, phi, size in ((-130, 39, 0.2), (-54, 48, 0.18), (-87, 17, 0.16), (-10, 28, 0.18), (160, 30, 0.2), (95, 32, 0.18),
                             (40, 62, 0.15), (-100, 72, 0.14), (140, 66, 0.13), (-170, 8, 0.13), (-30, 6, 0.12), (60, 10, 0.13)):
        t, p = math.radians(theta), math.radians(phi)
        normal = Vector((math.cos(p) * math.cos(t) / a, math.cos(p) * math.sin(t) / a, math.sin(p) / c)).normalized()
        at = Vector((a * math.cos(p) * math.cos(t), a * math.cos(p) * math.sin(t), mid + c * math.sin(p))) - normal * 0.02
        k.sphere(spot, at=at * u, r=size * u, scale=(1, 1, 0.3), rot=normal.to_track_quat('Z', 'Y').to_euler(), seg=24)
    k.face((0, -0.41 * u, 0.05 * u), (0, -1, 0), spread=0.055, eye=0.022, smile=False)
    ink = studio.gloss('smile', INK, rough=0.06)
    k.tube(ink, [(t * 0.025, -0.413 * u, 0.05 * u - 0.024 - (1 - t * t) * 0.012) for t in (-1, -0.5, 0, 0.5, 1)], 0.022 * 0.22, steps=6)
    turn(k, -12)


BUILD = {
    'bean': bean, 'gumball': gumball, 'ball': beach_ball, 'apple': apple, 'donut': donut, 'cupcake': cupcake,
    'chili': chili, 'party hat': party_hat, 'crown': crown, 'sunglasses': sunglasses, 'teddy': teddy,
    'pillow': pillow, 'drum': drum, 'balloon': balloon, 'duck': duck, 'cactus': cactus, 'ghost': ghost,
    'ice cube': ice_cube, 'star': star, 'heart': heart, 'basketball': basketball, 'soccer ball': soccer_ball,
    'hoop': hoop, 'goal': goal, 'rocket': rocket, 'bubble wand': bubble_wand, 'snow globe': snow_globe,
    'lava lamp': lava_lamp, 'disco ball': disco_ball, 'jack-in-the-box': jack_in_the_box, 'rubber chicken': rubber_chicken,
    'magnet': magnet, 'sparkler': sparkler, 'umbrella': umbrella, 'kite': kite, 'music box': music_box, 'crystal': crystal,
    'lantern': lantern, 'watermelon': watermelon, 'ice cream': ice_cream, 'robot': robot, 'whoopee cushion': whoopee_cushion,
    'spinning top': spinning_top, 'mushroom': mushroom,
}


def slug(key):
    return key.replace(' ', '-')


def shoot(key, spec, out, frames=1, samples=96, res=256):
    """Build one toy, frame it and render `frames` steps of one turn into `out/<slug>/NN.png`."""
    scene = studio.reset()
    studio.size(scene, res, res, samples)
    kit = Kit()
    BUILD[key](kit, spec)
    bpy.context.view_layer.update()
    lo, hi = studio.bounds(kit.root.children_recursive)
    centre = (lo + hi) / 2
    pivot = bpy.data.objects.new('pivot', None)
    scene.collection.objects.link(pivot)
    kit.root.parent = pivot
    kit.root.location = (-centre.x, -centre.y, -lo.z)
    bpy.context.view_layer.update()
    span = hi - lo
    target = Vector((0, 0, span.z / 2))
    radius = max(0.12, studio.reach(kit.root.children_recursive, target)) * 1.04
    studio.world(scene, strength=0.9)
    studio.rig(target, radius)
    studio.catcher(0, radius * 0.6)
    studio.camera(target, radius, elevation=24, fill=0.92)
    folder = os.path.join(out, slug(key))
    os.makedirs(folder, exist_ok=True)
    for i in range(frames):
        pivot.rotation_euler = (0, 0, i / frames * math.tau)
        studio.render(os.path.join(folder, f'{i:02d}.png'), scene)
    return folder


def canonical(verts, tris):
    """Vertices sorted by position, each triangle turned to start at its lowest index, triangles
    sorted. Blender walks a mesh in a different order on each run, and this keeps a rerun's files
    byte for byte the same when the toy has not changed."""
    order = sorted(range(len(verts)), key=lambda i: tuple(round(c, 6) for c in verts[i]))
    new = [0] * len(verts)
    for n, o in enumerate(order):
        new[o] = n
    out = []
    for m, *t in tris:
        t = [new[i] for i in t]
        r = t.index(min(t))
        out.append((m, *t[r:], *t[:r]))
    return [verts[o] for o in order], sorted(out)


def export(key, spec, out):
    """Build one toy at stage detail and write `out/<slug>.mesh` for `chat/scene/toyMesh.ts`:
    the 'TOY1' tag; vertex, index and group counts; the bounds; per group its first index, index count
    and colour; then positions quantised to 16 bits within the bounds, and 16-bit triangle indices.
    Axes are three.js's (y up, the front toward +z), the toy stands on y = 0 centred on x and z."""
    studio.reset()
    kit = Kit(detail=STAGE)
    BUILD[key](kit, spec)
    for ob in kit.root.children:
        ob.rotation_euler = (0, 0, 0)
    kit.root.rotation_euler = [math.radians(a) for a in ON_STAGE.get(key, (0, 0, 0))]
    bpy.context.view_layer.update()
    lo, hi = studio.bounds(kit.root.children_recursive)
    centre = (lo + hi) / 2
    kit.root.location = (-centre.x, -centre.y, -lo.z)
    for ob in kit.root.children_recursive:
        for m in ob.modifiers:
            if m.type == 'SUBSURF':
                m.levels = min(m.render_levels, 1)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    palette = []
    bm = bmesh.new()
    for ob in sorted(kit.root.children_recursive, key=lambda o: o.name):
        if ob.type not in ('MESH', 'CURVE') or ob.hide_render:
            continue
        ev = ob.evaluated_get(deps)
        me = ev.to_mesh()
        part = bmesh.new()
        part.from_mesh(me)
        part.transform(ev.matrix_world)
        if ev.matrix_world.determinant() < 0:
            bmesh.ops.reverse_faces(part, faces=part.faces)
        slots = [s.material for s in ev.material_slots]
        for f in part.faces:
            colour = studio.hex_of(slots[f.material_index] if f.material_index < len(slots) else None)
            if colour not in palette:
                palette.append(colour)
            f.material_index = palette.index(colour)
        tmp = bpy.data.meshes.new('part')
        part.to_mesh(tmp)
        part.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        ev.to_mesh_clear()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    verts, tris = canonical([tuple(v.co) for v in bm.verts], [(f.material_index, *(v.index for v in f.verts)) for f in bm.faces])
    bm.free()
    whole = bpy.data.meshes.new('stage')
    whole.from_pydata(verts, [], [t[1:] for t in tris])
    for poly, t in zip(whole.polygons, tris):
        poly.material_index = t[0]
    ob = bpy.data.objects.new('stage', whole)
    bpy.context.scene.collection.objects.link(ob)
    if len(whole.polygons) > BUDGET:
        fewer = ob.modifiers.new('fewer', 'DECIMATE')
        fewer.ratio = BUDGET / len(whole.polygons)
        fewer.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    me.calc_loop_triangles()
    verts, tris = canonical([(v.co.x, v.co.z, -v.co.y) for v in me.vertices], [(t.material_index, *t.vertices) for t in me.loop_triangles])
    ev.to_mesh_clear()
    if len(verts) > 65535:
        sys.exit(f'[toys] {key}: {len(verts)} vertices is more than 16-bit indices hold')
    lo = [min(v[i] for v in verts) for i in range(3)]
    hi = [max(v[i] for v in verts) for i in range(3)]
    shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2]
    verts = [tuple(v[i] + shift[i] for i in range(3)) for v in verts]
    lo = [lo[i] + shift[i] for i in range(3)]
    hi = [hi[i] + shift[i] for i in range(3)]
    span = [max(1e-6, hi[i] - lo[i]) for i in range(3)]
    index, groups = [], []
    for m, colour in enumerate(palette):
        group = [i for t in tris if t[0] == m for i in t[1:]]
        if group:
            groups.append((len(index), len(group), int(colour[1:], 16)))
            index.extend(group)
    path = os.path.join(out, f'{slug(key)}.mesh')
    with open(path, 'wb') as f:
        f.write(b'TOY1')
        f.write(struct.pack('<3I', len(verts), len(index), len(groups)))
        f.write(struct.pack('<6f', *lo, *hi))
        for g in groups:
            f.write(struct.pack('<3I', *g))
        f.write(struct.pack(f'<{len(verts) * 3}H', *(round((v[i] - lo[i]) / span[i] * 65535) for v in verts for i in range(3))))
        f.write(struct.pack(f'<{len(index)}H', *index))
    return path, len(verts), len(index) // 3


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('specs')
    ap.add_argument('out')
    ap.add_argument('--only', default='')
    ap.add_argument('--frames', type=int, default=24)
    ap.add_argument('--samples', type=int, default=96)
    ap.add_argument('--res', type=int, default=256)
    ap.add_argument('--mesh', action='store_true')
    args = ap.parse_args(argv)
    with open(args.specs) as f:
        items = json.load(f)
    only = [k for k in args.only.split(',') if k]
    missing = [k for k in items if k not in BUILD]
    if missing:
        sys.exit(f'[toys] no model for: {", ".join(missing)}')
    for key, spec in items.items():
        if only and key not in only:
            continue
        if args.mesh:
            path, nv, nt = export(key, spec, args.out)
            print(f'[toys] {key}: {nv} vertices, {nt} triangles', flush=True)
            continue
        shoot(key, spec, args.out, args.frames, args.samples, args.res)
        print(f'[toys] {key}: {args.frames} frames', flush=True)


if __name__ == '__main__' and '--' in sys.argv:
    main()
