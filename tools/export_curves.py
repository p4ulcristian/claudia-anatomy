# Dumps Z-Anatomy's nerves and vessels (curve objects) as centre lines: <out>/<system>/<id>.json
# {"lines": [[x,y,z, x,y,z, ...], ...]} in body coordinates (metres, Y-up, facing +Z), each line
# one chain of the evaluated curve; and index-curves.json with each one's name, side, system, tags,
# centre and size. The viewer draws them as tubes of a thickness it chooses (Z-Anatomy's own are
# 0.5 mm, too thin to see in a whole limb).
#
#   blender -b --disable-autoexec Startup.blend --python tools/export_curves.py -- <out dir>
import bpy, json, os, re, sys

SYSTEMS = {
    "7: Nervous system & Sense organs": "nervous",
    "5: Cardiovascular system": "vascular",
}
SKIP_TAGS = set(SYSTEMS) | {"Bonus collection"}
INNER_EAR = re.compile(r"cochle|semicircular|vestibul|utricl|saccul|labyrinth|endolymph|perilymph|"
                       r"modiol|spiral (lamina|ligament|organ)|organ of corti|ampull", re.I)
SIDED = re.compile(r"^(?P<base>.*)\.(?P<side>[rl])$")


def slug(name):
    s = name.lower().replace("(", "").replace(")", "").replace("*", "")
    return re.sub(r"[^a-z0-9.]+", "-", s).strip("-")


def centre_lines(obj):
    """The curve's splines as chains of points (world, Y-up): a Bézier spline sampled at its own
    resolution, a poly or NURBS spline by its points."""
    from mathutils import Vector
    from mathutils.geometry import interpolate_bezier
    mw = obj.matrix_world
    res = max(2, obj.data.resolution_u)
    lines, pts = [], []
    for sp in obj.data.splines:
        if sp.type == "BEZIER":
            bp = list(sp.bezier_points)
            seq = []
            for a, b in zip(bp, bp[1:] + (bp[:1] if sp.use_cyclic_u else [])):
                seg = interpolate_bezier(a.co, a.handle_right, b.handle_left, b.co, res + 1)
                seq.extend(seg if not seq else seg[1:])
        else:
            seq = [Vector(p.co[:3]) for p in sp.points]
        world = [mw @ v for v in seq]
        yup = [(v.x, v.z, -v.y) for v in world]
        if len(yup) > 1:
            lines.append([round(c, 4) for p in yup for c in p])
            pts.extend(yup)
    return lines, pts


def main():
    out = sys.argv[sys.argv.index("--") + 1]
    index = []
    for coll, system in SYSTEMS.items():
        os.makedirs(os.path.join(out, system), exist_ok=True)
        for o in bpy.data.collections[coll].objects:
            if o.type != "CURVE" or INNER_EAR.search(o.name):
                continue
            lines, pts = centre_lines(o)
            if not lines:
                continue
            s = slug(o.name)
            with open(os.path.join(out, system, s + ".json"), "w") as f:
                json.dump({"lines": lines}, f, separators=(",", ":"))
            lo = [min(p[i] for p in pts) for i in range(3)]
            hi = [max(p[i] for p in pts) for i in range(3)]
            m = SIDED.match(o.name)
            index.append({"id": s, "name": o.name, "base": (m["base"] if m else o.name).strip("() "),
                          "side": m["side"] if m else None, "system": system,
                          "tags": sorted({c.name for c in o.users_collection} - SKIP_TAGS),
                          "file": f"{system}/{s}.json", "shape": "lines",
                          "centre": [round((lo[i] + hi[i]) / 2, 4) for i in range(3)],
                          "size": [round(hi[i] - lo[i], 4) for i in range(3)]})
        print(system, sum(1 for e in index if e["system"] == system), flush=True)
    with open(os.path.join(out, "index-curves.json"), "w") as f:
        json.dump(index, f)
    print("done", len(index), flush=True)


main()
