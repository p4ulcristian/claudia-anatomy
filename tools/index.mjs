// Builds models/index.json from the exporter's raw/index.json and Z-Anatomy's TA2 table: each
// structure's English name (without side), its Latin name (TA2, when the English name is in it),
// shape ("lines": a nerve's or vessel's centre lines, JSON, drawn as tubes; else a GLB mesh),
// side, system, tags, attachment kind, file, centre and size (metres, Y-up, facing +Z).
//
//   node tools/index.mjs <raw dir> <TA2 csv> <models dir>
import fs from "node:fs";
import path from "node:path";

const [rawDir, ta2File, outDir] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(path.join(rawDir, "index.json"), "utf8"));

// TA2.csv: one quoted line per term, fields separated by ";": TA2ID;English;Latin;...
const latinOf = new Map();
for (const line of fs.readFileSync(ta2File, "utf8").replace(/^﻿/, "").split(/\r?\n/).slice(1)) {
  const [, english, latin] = line.replace(/^"|"$/g, "").split(";");
  if (english && latin && !latinOf.has(english.toLowerCase())) latinOf.set(english.toLowerCase(), latin);
}

const index = raw.map((e) => {
  // Z-Anatomy brackets the parts of a bigger structure, "(Adductor minimus)": the name without them.
  const base = e.base.trim().replace(/^\(([^()]*)\)$/, "$1").trim();
  // TA2 has some terms with their brackets: the name as Z-Anatomy wrote it is tried first.
  const latin = [e.base.trim(), base, base.replace(/ muscle$/i, "")]
    .map((n) => latinOf.get(n.toLowerCase())).find(Boolean) ?? null;
  return { id: e.id, name: base, latin, side: e.side, system: e.system, tags: e.tags,
           ...(e.shape ? { shape: e.shape } : {}),
           ...(e.kind ? { kind: e.kind, n: e.n } : {}), file: e.file, centre: e.centre, size: e.size };
});
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ version: 1, unit: "m", up: "+y", front: "+z", structures: index }));
const withLatin = index.filter((e) => e.latin).length;
console.log(index.length, "structures,", withLatin, "with a Latin name");
