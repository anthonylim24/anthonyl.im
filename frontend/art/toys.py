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

    def tube(self, mat, points, radius, taper=None, order=4):
        cu = bpy.data.curves.new('tube', 'CURVE')
        cu.dimensions = '3D'
        cu.bevel_depth = radius
        cu.bevel_resolution = self.res(6, 2)
        cu.use_fill_caps = True
        cu.resolution_u = self.res(24, 6)
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


BUILD = {
    'bean': bean, 'gumball': gumball, 'ball': beach_ball, 'apple': apple, 'donut': donut, 'cupcake': cupcake,
    'chili': chili, 'party hat': party_hat, 'crown': crown, 'sunglasses': sunglasses, 'teddy': teddy,
    'pillow': pillow, 'drum': drum, 'balloon': balloon, 'duck': duck, 'cactus': cactus, 'ghost': ghost,
    'ice cube': ice_cube, 'star': star, 'heart': heart, 'basketball': basketball, 'soccer ball': soccer_ball,
    'hoop': hoop, 'goal': goal,
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
