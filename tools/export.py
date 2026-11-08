# Dumps Z-Anatomy structures one raw file each (<system>/<id>.bin: float32 positions x,y,z then
# uint32 triangle indices), in body coordinates (metres, Y-up, facing +Z), and writes
# index.json: name, side, system, tags, attachment kind, vertex and triangle counts, centre and
# size per structure. tools/compress.mjs makes GLBs of them (Blender's own glTF export takes
# seconds per object in a file this big).
#
#   blender -b --disable-autoexec Startup.blend --python tools/export.py -- <out dir> [worker workers]
#
# With worker and workers (k n), only every n-th structure starting at k is dumped, into
# index-<k>.json: several Blenders can share the work (tools/merge.mjs joins the indexes).
#
# Systems exported (Z-Anatomy collection -> our system): see SYSTEMS. Group meshes (".g") and
# structures without faces are skipped, and so is the inner ear, whose Z-Anatomy model is
# non-commercial (CC BY-NC-SA 4.0).
import bpy, json, os, re, sys
import numpy as np

SYSTEMS = {
    "1: Skeletal system": "skeletal",
    "4: Muscular system": "muscular",
    "2: Muscular insertions": "attachment",
    "7: Nervous system & Sense organs": "nervous",
    "3: Joints": "joints",
}
SKIP_TAGS = set(SYSTEMS) | {"Bonus collection"}
INNER_EAR = re.compile(r"cochle|semicircular|vestibul|utricl|saccul|labyrinth|endolymph|perilymph|"
                       r"modiol|spiral (lamina|ligament|organ)|organ of corti|ampull", re.I)
ATTACH = re.compile(r"^(?P<base>.*)\.(?P<kind>[oe])(?P<n>\d*)(?P<side>[rl])?$")
SIDED = re.compile(r"^(?P<base>.*)\.(?P<side>[rl])$")


def parse(name, system):
    """base name, side (r, l or None) and, for an attachment, its kind and number."""
    if system == "attachment":
        m = ATTACH.match(name)
        if m:
            return (m["base"].strip("() "), m["side"], "origin" if m["kind"] == "o" else "insertion",
                    int(m["n"]) if m["n"] else 1)
    m = SIDED.match(name)
    if m:
        return m["base"], m["side"], None, None
    return name, None, None, None


def slug(name):
    s = name.lower().replace("(", "").replace(")", "").replace("*", "")
    s = re.sub(r"[^a-z0-9.]+", "-", s).strip("-")
    return s


def world_mesh(obj):
    """The object's evaluated mesh (modifiers applied) with its world transform baked in."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    me.transform(obj.matrix_world)
    return me


def dump_one(obj, path):
    """Writes the object's triangles to path. -> vertex count, triangle count, centre, size."""
    me = world_mesh(obj)
    me.calc_loop_triangles()
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    yup = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1).astype(np.float32)
    tri = np.empty(len(me.loop_triangles) * 3, dtype=np.uint32)
    me.loop_triangles.foreach_get("vertices", tri)
    with open(path, "wb") as f:
        f.write(yup.tobytes())
        f.write(tri.tobytes())
    lo, hi = yup.min(axis=0), yup.max(axis=0)
    bpy.data.meshes.remove(me)
    return len(yup), len(tri) // 3, [round(float(v), 4) for v in (lo + hi) / 2], [round(float(v), 4) for v in hi - lo]


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    out = args[0]
    worker, workers = (int(args[1]), int(args[2])) if len(args) > 2 else (0, 1)
    index, seen, i = [], set(), -1
    for coll, system in SYSTEMS.items():
        objs = [o for o in bpy.data.collections[coll].objects
                if o.type == "MESH" and len(o.data.polygons) > 0 and not o.name.endswith(".g")
                and not INNER_EAR.search(o.name)]
        os.makedirs(os.path.join(out, system), exist_ok=True)
        for o in objs:
            s = slug(o.name)
            if (system, s) in seen:
                continue
            seen.add((system, s))
            i += 1
            if i % workers != worker:
                continue
            base, side, kind, n = parse(o.name, system)
            nv, nt, centre, size = dump_one(o, os.path.join(out, system, s + ".bin"))
            tags = sorted({c.name for c in o.users_collection} - SKIP_TAGS)
            entry = {"id": s, "name": o.name, "base": base, "side": side, "system": system, "tags": tags,
                     "file": f"{system}/{s}.glb", "vertices": nv, "triangles": nt, "centre": centre, "size": size}
            if kind:
                entry.update({"kind": kind, "n": n})
            index.append(entry)
        print(f"{system}: {sum(1 for e in index if e['system'] == system)}", flush=True)
    with open(os.path.join(out, f"index-{worker}.json"), "w") as f:
        json.dump(index, f, indent=0)
    print("done", len(index), flush=True)


main()
