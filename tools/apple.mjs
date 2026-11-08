// Makes the Apple copy of every structure: apple/<system>/<id>.avz, which iOS reads with nothing
// but its own Compression framework (no glTF loader there). Nerves and vessels (centre lines) are
// made into tubes here: radius 2.5 mm (nerves) or 3 mm (vessels), 8 sides.
//
// .avz: "AVZ1", u32 size of the data below once inflated, then that data raw-DEFLATEd:
//   "AVM1", u32 vertexCount, u32 triangleCount, u32 flags (bit 0: 32-bit indices),
//   f32 min[3], f32 max[3] (metres, Y up, facing +Z, the body's right at -X),
//   u16 position[vertexCount * 3] (each axis quantized between min and max),
//   u16 or u32 index[triangleCount * 3].
// Normals are not stored; the app computes smooth ones.
//
//   node tools/apple.mjs <raw dir> <models dir>
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RADIUS = { nervous: 0.0025, vascular: 0.003 };
const SIDES = 8;
const [rawDir, modelsDir] = process.argv.slice(2);
const index = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf8"));

/** A raw dump's positions (Float32Array) and triangle indices (Uint32Array). */
function readRaw(e) {
  const b = fs.readFileSync(path.join(rawDir, e.system, e.id + ".bin"));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return { pos: new Float32Array(ab, 0, e.vertices * 3), idx: new Uint32Array(ab, e.vertices * 12, e.triangles * 3) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** One centre line (flat x,y,z array) as a tube: rings carried along by parallel transport. */
function tube(flat, r, pos, idx) {
  const pts = [];
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const p = [flat[i], flat[i + 1], flat[i + 2]];
    if (!pts.length || Math.hypot(...sub(p, pts[pts.length - 1])) > 1e-5) pts.push(p);
  }
  if (pts.length < 2) return;
  const base = pos.length / 3;
  let t = unit(sub(pts[1], pts[0]));
  let n = unit(cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  for (let i = 0; i < pts.length; i++) {
    const tNext = unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    n = unit(sub(n, tNext.map((c) => c * dot(n, tNext))));
    t = tNext;
    const b = cross(t, n);
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * 2 * Math.PI, c = Math.cos(a) * r, d = Math.sin(a) * r;
      pos.push(pts[i][0] + n[0] * c + b[0] * d, pts[i][1] + n[1] * c + b[1] * d, pts[i][2] + n[2] * c + b[2] * d);
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let s = 0; s < SIDES; s++) {
      const a = base + i * SIDES + s, b = base + i * SIDES + ((s + 1) % SIDES), c = a + SIDES, d = b + SIDES;
      idx.push(a, c, b, b, c, d);
    }
  }
}

/** A nerve's or vessel's centre lines as tube positions and indices. */
function tubes(e) {
  const { lines } = JSON.parse(fs.readFileSync(path.join(rawDir, e.file), "utf8"));
  const pos = [], idx = [];
  for (const l of lines) tube(l, RADIUS[e.system] ?? 0.0025, pos, idx);
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) };
}

/** The .avz bytes of a mesh. */
function encode({ pos, idx }) {
  const v = pos.length / 3, t = idx.length / 3, wide = v > 65535;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
  const raw = Buffer.alloc(4 + 12 + 24 + v * 6 + t * 3 * (wide ? 4 : 2));
  raw.write("AVM1", 0, "ascii");
  raw.writeUInt32LE(v, 4); raw.writeUInt32LE(t, 8); raw.writeUInt32LE(wide ? 1 : 0, 12);
  for (let k = 0; k < 3; k++) { raw.writeFloatLE(min[k], 16 + 4 * k); raw.writeFloatLE(max[k], 28 + 4 * k); }
  let o = 40;
  for (let i = 0; i < pos.length; i++) {
    const k = i % 3, span = max[k] - min[k] || 1;
    raw.writeUInt16LE(Math.round(((pos[i] - min[k]) / span) * 65535), o); o += 2;
  }
  for (const x of idx) { if (wide) { raw.writeUInt32LE(x, o); o += 4; } else { raw.writeUInt16LE(x, o); o += 2; } }
  const head = Buffer.alloc(8);
  head.write("AVZ1", 0, "ascii");
  head.writeUInt32LE(raw.length, 4);
  return Buffer.concat([head, zlib.deflateRawSync(raw, { level: 9 })]);
}

let done = 0, bytes = 0;
for (const e of index) {
  const out = path.join(modelsDir, "apple", e.system, e.id + ".avz");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = encode(e.shape === "lines" ? tubes(e) : readRaw(e));
  fs.writeFileSync(out, buf);
  bytes += buf.length;
  if (++done % 500 === 0) console.log(done, "files,", (bytes / 1e6).toFixed(1), "MB");
}
console.log("apple copies:", done, "files,", (bytes / 1e6).toFixed(1), "MB");
