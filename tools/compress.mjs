// Makes one compressed GLB per structure from the exporter's raw dumps: <raw>/<system>/<id>.bin
// (float32 positions, then uint32 triangle indices; counts in <raw>/index.json) ->
// <models>/<system>/<id>.glb. Very dense meshes simplified to MAX_TRIANGLES, positions quantized,
// meshopt-encoded (three.js decodes it with its MeshoptDecoder, no extra files). No normals are
// stored: the viewer computes smooth ones from the shared vertices (gltf-transform's normals()
// would unweld the mesh and give flat shading).
//
//   node tools/compress.mjs <raw dir> <models dir>
import fs from "node:fs";
import path from "node:path";
import { Document, Logger, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize, meshopt, simplify } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const MAX_TRIANGLES = 20000;
const [rawDir, outDir] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

/** A glTF document holding one mesh: positions and triangles from a raw dump. */
function documentOf(bytes, vertices, triangles) {
  const doc = new Document();
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const pos = new Float32Array(ab, 0, vertices * 3);
  const idx = new Uint32Array(ab, vertices * 12, triangles * 3);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer));
  const mesh = doc.createMesh().addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return doc;
}

const index = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf8"));
let done = 0, bytes = 0;
for (const e of index) {
  if (e.shape === "lines") {
    // A nerve's or vessel's centre lines: copied as they are (small JSON).
    const out = path.join(outDir, e.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(path.join(rawDir, e.file), out);
    bytes += fs.statSync(out).size;
    done++;
    continue;
  }
  const raw = fs.readFileSync(path.join(rawDir, e.system, e.id + ".bin"));
  const doc = documentOf(raw, e.vertices, e.triangles);
  const steps = [];
  if (e.triangles > MAX_TRIANGLES) {
    steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: MAX_TRIANGLES / e.triangles, error: 0.001 }));
  }
  steps.push(quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await doc.transform(...steps);
  const out = path.join(outDir, e.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  bytes += fs.statSync(out).size;
  if (++done % 250 === 0) console.log(done, "files,", (bytes / 1e6).toFixed(1), "MB");
}
console.log("compressed", done, "files,", (bytes / 1e6).toFixed(1), "MB");
