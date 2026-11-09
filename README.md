# claudia-anatomy

Human anatomy as one small 3D file per structure, with a name index, for the 3D scenes of
[Claudia](https://github.com/p4ulcristian/claudia). A scene asks for structures by name
(`{shape: "anatomy", ref: "femur", side: "right"}`) and Claudia loads just those files.

## What is here

- `models/index.json`: every structure: `id`, English `name`, `latin` (the official Terminologia
  Anatomica 2nd edition term, TA2 2019, in TA2's own word order; null when there is none; see
  below), Hungarian `hu` and German `de` (Wikidata labels, null when
  there is none) with `wikidata`, the Wikidata item they came from (a QID, null when no item
  matched without doubt), `side` (`r`, `l` or none), `system` (`skeletal`,
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
- `data/ta2-latin.json`: the Latin names as resolved (per English name: the Latin, the TA2 IDs it
  came from and how), so a rebuild gives the same Latin.
- `data/wikidata-names.json`: the Hungarian and German names as last looked up (per English name),
  so a rebuild gives the same names.
- `tools/`: how the files are made from Z-Anatomy's Blender file (below).

Releases are git tags (`v1.0.0`, …); Claudia pins one and fetches files from it.

## Making the files

```sh
npm install --include=dev
# 1. dump raw geometry (several Blenders share the work: worker k of n)
for k in 0 1 2 3; do blender -b --disable-autoexec Startup.blend --python tools/export.py -- raw $k 4 & done; wait
blender -b --disable-autoexec Startup.blend --python tools/export_curves.py -- raw   # nerves, vessels
node tools/merge.mjs raw
# 2. compress to GLB, 3. build the index (Z-Anatomy's TA2 table gives a first Latin name)
node tools/compress.mjs raw models
node tools/index.mjs raw TA2.csv models
node tools/latin.mjs models              # official TA2 Latin from data/ta2-latin.json
node tools/names.mjs models              # Hungarian and German names from data/wikidata-names.json
node tools/apple.mjs raw models          # 4. the Apple copies
```

`node tools/latin.mjs models --resolve ta2.json` resolves the Latin names again from the official TA2
list and rewrites `data/ta2-latin.json`. `ta2.json` is that list as the TA2 Viewer
(<https://ta2viewer.openanatomy.org>) publishes it: the `JSON.parse` string in its
`main.*.chunk.js` (7,112 entries); it is not kept here. A structure gets the TA2 term whose English
name or English synonym is its own (also tried without " muscle"; a term outranks a synonym; only
one Latin name may come out). Damaged or variant Z-Anatomy names are looked up under the TA2
English listed in `tools/latin.mjs`. Members of a series TA2 names only in part (ribs 3-12, costal
cartilages, metacarpals and metatarsals, phalanges, vertebrae, intervertebral discs, teeth) and
joint capsules, intrarenal arteries and left/right vessels are composed from the official
siblings, each rule naming the TA2 entries it follows. A structure with none of these keeps
Z-Anatomy's Latin only where that is a correct name for it (listed in `tools/latin.mjs`), else
null. Z-Anatomy's own TA2 table is not trusted for the Latin: it has typos, garbled rows, rows
carrying another structure's Latin and rows of its own.

`node tools/names.mjs models --refresh TA2.csv` looks the Hungarian and German names up again on
Wikidata (answers cached in `~/.cache/claudia-anatomy/wikidata/`) and rewrites
`data/wikidata-names.json`. A structure gets the item whose TA2 ID, Latin label or English label is
its own, only when every one of those that finds an item finds that item; the labels are Wikidata's
as they are (no translation), less the ones `tools/names.mjs` lists as checked and wrong.
`data/wikidata-names.json` was made with the Latin of v1.2.0 (Z-Anatomy's table); it is kept as it
is: a refresh with the TA2 Latin would match 27 names differently (15 more, 12 fewer), and none of
the kept matches was found wrong.

## Licence and attribution

The models in `models/` are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They are adapted from:

- **Z-Anatomy** (<https://github.com/Z-Anatomy/Models-of-human-anatomy>), CC BY-SA 4.0, which
  derives its models from
- **BodyParts3D**, © The Database Center for Life Science, licensed under CC Attribution-Share
  Alike 2.1 Japan (<https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>).

The Latin names are from **Terminologia Anatomica, 2nd edition** (TA2, 2019), Federative
International Programme for Anatomical Terminology (FIPAT), as published by the TA2 Viewer
(<https://ta2viewer.openanatomy.org>); some are composed from its terms (see `tools/latin.mjs`).

The Hungarian and German names and the `wikidata` item IDs are from **Wikidata**
(<https://www.wikidata.org>), CC0 1.0.

Changes made here: each structure exported on its own with its world transform applied and its
modifiers evaluated, converted to glTF binary; meshes over 20,000 triangles simplified to
20,000; positions quantized and meshopt-compressed; Latin names set to Terminologia Anatomica
2nd edition (above);
Hungarian and German names added from Wikidata.
Z-Anatomy's inner ear models (licensed non-commercially) are left out, as are its kidney models
and heart (not exported in this version) and its helper objects (group meshes, text labels, curves).

There is no warranty: these are educational models of one adult male body, not a clinical
reference.
