# claudia-anatomy

Human anatomy as one small 3D file per structure, with a name index, for the 3D scenes of
[Claudia](https://github.com/p4ulcristian/claudia). A scene asks for structures by name
(`{shape: "anatomy", ref: "femur", side: "right"}`) and Claudia loads just those files.

## What is here

- `models/index.json`: every structure: `id`, English `name`, `latin` (from Terminologia
  Anatomica 2, when the name is in it), `side` (`r`, `l` or none), `system` (`skeletal`,
  `muscular`, `nervous`, `joints`, `vascular`, `attachment`), `tags` (regions, compartments, nerve
  territories, as grouped in Z-Anatomy), `kind` (`origin` or `insertion`, for attachment
  patches), `file`, `centre` and `size`.
- `models/<system>/<id>.json`: a nerve's or vessel's centre lines (`{"lines": [[x,y,z, …], …]}`),
  drawn by the viewer as tubes of the thickness it chooses (Z-Anatomy's own are 0.5 mm).
- `models/<system>/<id>.glb`: one mesh per other structure, in body coordinates: metres, Y up, facing
  +Z, the body's right at -X, so files loaded together form one body. Positions are quantized and
  meshopt-compressed (three.js: `GLTFLoader` with `MeshoptDecoder`); normals are not stored.
- `models/apple/<system>/<id>.avz`: the same structures for Apple devices (Atlas Vivus), readable
  with only Apple's Compression framework: `"AVZ1"`, the inflated size (u32), then raw DEFLATE of
  `"AVM1"`, vertex and triangle counts, flags (bit 0: 32-bit indices), the box (min, max, f32),
  u16 positions quantized in the box, u16 or u32 indices. Nerves and vessels are tubes here
  (radius 2.5 / 3 mm). Format details in `tools/apple.mjs`.
- `tools/`: how the files are made from Z-Anatomy's Blender file (below).

Releases are git tags (`v1.0.0`, …); Claudia pins one and fetches files from it.

## Making the files

```sh
npm install --include=dev
# 1. dump raw geometry (several Blenders share the work: worker k of n)
for k in 0 1 2 3; do blender -b --disable-autoexec Startup.blend --python tools/export.py -- raw $k 4 & done; wait
blender -b --disable-autoexec Startup.blend --python tools/export_curves.py -- raw   # nerves, vessels
node tools/merge.mjs raw
# 2. compress to GLB, 3. build the index with Latin names from Z-Anatomy's TA2 table
node tools/compress.mjs raw models
node tools/index.mjs raw TA2.csv models
node tools/apple.mjs raw models          # 4. the Apple copies
```

## Licence and attribution

The models in `models/` are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They are adapted from:

- **Z-Anatomy** (<https://github.com/Z-Anatomy/Models-of-human-anatomy>), CC BY-SA 4.0, which
  derives its models from
- **BodyParts3D**, © The Database Center for Life Science, licensed under CC Attribution-Share
  Alike 2.1 Japan (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>).

Changes made here: each structure exported on its own with its world transform applied and its
modifiers evaluated, converted to glTF binary; meshes over 20,000 triangles simplified to
20,000; positions quantized and meshopt-compressed; Latin names added from Z-Anatomy's TA2 table.
Z-Anatomy's inner ear models (licensed non-commercially) are left out, as are its kidney models
and heart (not exported in this version) and its helper objects (group meshes, text labels, curves).

There is no warranty: these are educational models of one adult male body, not a clinical
reference.
