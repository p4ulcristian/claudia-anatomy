// Adds Hungarian (`hu`) and German (`de`) names to models/index.json, from Wikidata (CC0), with
// the Wikidata item (`wikidata`, a QID) each one came from. No translation: a name is either a
// Wikidata label in that language or null.
//
//   node tools/names.mjs <models dir>                       apply data/wikidata-names.json
//   node tools/names.mjs <models dir> --refresh <TA2 csv>   look the names up again, then apply
//
// Run it after tools/index.mjs. The lookup is kept in data/wikidata-names.json (committed), so a
// rebuild gives the same names until someone refreshes it. Wikidata answers are cached under
// ~/.cache/claudia-anatomy/wikidata/ (delete that folder to fetch again).
//
// Matching, per English name (left and right share one item). Only items carrying a Terminologia
// Anatomica (TA98 P1323, TA2 P7173) or FMA (P1402) ID are candidates. Three ways to find them:
//   ta2:     the structure's TA2 ID (the TA2.csv row its Latin name came from) = the item's P7173
//   latin:   the structure's Latin name = the item's Latin label or a Latin alias
//   english: the structure's English name = the item's English label or an English alias
// Names compare case-insensitively, with spaces collapsed and hyphens dropped ("thoraco-acromial"
// = "thoracoacromial"). An item is accepted only when every way that found something includes it
// and at least one way found it alone; anything else (a tie, or two ways naming different items)
// is left null. One item matched by two different structures drops both.
//
// The labels were then read by hand; the ones below name another structure or are not a name
// at all, so they are left out (only while Wikidata still has that exact label: a corrected label
// comes through on the next refresh).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, "..", "data", "wikidata-names.json");
const cacheDir = path.join(os.homedir(), ".cache", "claudia-anatomy", "wikidata");
const userAgent = "claudia-anatomy/1.2 (https://github.com/p4ulcristian/claudia-anatomy; anatomy names lookup)";

const args = process.argv.slice(2);
const outDir = args[0];
const refresh = args.indexOf("--refresh");
const ta2File = refresh >= 0 ? args[refresh + 1] : null;
if (!outDir || (refresh >= 0 && !ta2File)) {
  console.error("usage: node tools/names.mjs <models dir> [--refresh <TA2 csv>]");
  process.exit(1);
}
const indexFile = path.join(outDir, "index.json");
const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));

const wrongLabels = [
  ["Q283673", "hu", "musculus semispinalis dorsi", "latissimus dorsi labelled as another muscle"],
  ["Q492482", "hu", "elülső agyi artéria", "posterior cerebral artery labelled anterior"],
  ["Q1571074", "hu", "symphisis.hu", "a web address, not a name"],
  ["Q579641", "hu", "ferde fejizom", "rectus capitis lateralis labelled oblique (ferde)"],
  ["Q838638", "hu", "musculus rotatores cervicis", "names only the cervical rotatores"],
  ["Q1089155", "hu", "kisujjtávolító izom", "the hand muscle's name on the foot muscle"],
  ["Q497563", "hu", "artera thoracica interna", "misspelt (artera)"],
  ["Q842547", "hu", "musculus puborectalis", "puborectalis on the pubo-analis item (TA2 2406)"],
  ["Q842547", "de", "Musculus puborectalis", "puborectalis on the pubo-analis item (TA2 2406)"],
  ["Q792567", "de", "Atlas", "the axis (C2) labelled as the atlas (C1)"],
  ["Q3356933", "de", "Dammbein", "not the hip bone (Hüftbein)"],
  ["Q5298800", "de", "Ligamentum ulnocarpale dorsale", "radiocarpal ligament labelled ulnocarpal"],
  ["Q5298810", "de", "dorsal tarsometatlig", "an abbreviation, not a name"],
  ["Q66514780", "de", "spinalis du thorax", "French, not German"],
  ["Q1978117", "de", "Nervus saphenush", "misspelt (saphenush)"],
  ["Q1978103", "de", "Nervus pectoralis", "names the pectoral nerves in general, not the medial one"],
  ["Q526920", "de", "Tränenwege", "the whole tear passages, not the nasolacrimal duct"],
  ["Q1079316", "de", "Sehbahn", "the whole visual pathway, not the optic tract"],
  ["Q1088126", "de", "Musculus splenius", "the whole splenius, not splenius capitis"],
  ["Q4115976", "de", "Superior sagittal sinus", "English, not German"],
];
// Matches where the item is a different structure than ours (its TA2 ID notwithstanding).
const wrongItems = [
  ["Olive", "Q5620438", "the item is the inferior olivary nucleus, not the olive"],
];

const norm = (s) => s.normalize("NFC").toLowerCase().replace(/[‐-―-]/g, "").replace(/\s+/g, " ").trim();

// ---- Wikidata ----------------------------------------------------------------------------------

async function sparql(name, query) {
  const file = path.join(cacheDir, `${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "application/sparql-results+json" } });
    if (res.ok) {
      const rows = (await res.json()).results.bindings.map((b) =>
        Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value.replace(/^http:\/\/www\.wikidata\.org\/entity\//, "")])));
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(rows));
      return rows;
    }
    if (attempt >= 4) throw new Error(`Wikidata ${name}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 15000 * attempt));
  }
}

const anatomical = "{ ?i wdt:P1402 [] } UNION { ?i wdt:P1323 [] } UNION { ?i wdt:P7173 [] }";

async function wikidata() {
  const items = new Map(); // QID -> { ta2: Set, labels: {en, la, hu, de}, aliases: {en: [], la: []} }
  const item = (q) => {
    if (!items.has(q)) items.set(q, { ta2: new Set(), labels: {}, aliases: { en: [], la: [] } });
    return items.get(q);
  };
  for (const r of await sparql("ta2", "SELECT ?i ?v WHERE { ?i wdt:P7173 ?v }")) item(r.i).ta2.add(r.v);
  for (const lang of ["en", "la", "hu", "de"]) {
    const q = `SELECT DISTINCT ?i ?v WHERE { ${anatomical} ?i rdfs:label ?v FILTER(LANG(?v) = "${lang}") }`;
    for (const r of await sparql(`label-${lang}`, q)) item(r.i).labels[lang] = r.v;
  }
  for (const lang of ["en", "la"]) {
    const q = `SELECT DISTINCT ?i ?v WHERE { ${anatomical} ?i skos:altLabel ?v FILTER(LANG(?v) = "${lang}") }`;
    for (const r of await sparql(`alias-${lang}`, q)) item(r.i).aliases[lang].push(r.v);
  }
  return items;
}

// ---- Lookup ------------------------------------------------------------------------------------

async function lookup() {
  // TA2.csv: one quoted line per term, fields separated by ";": TA2ID;English;Latin;...
  // IDs with a "*" are Z-Anatomy's own additions, not TA2's, so they are not looked up.
  const ta2Rows = fs.readFileSync(ta2File, "utf8").replace(/^﻿/, "").split(/\r?\n/)
    .map((l) => l.replace(/^"|"$/g, "").split(";")).filter(([id]) => /^\d+$/.test(id ?? ""));

  const items = await wikidata();
  const byTa2 = new Map(), byLatin = new Map(), byEnglish = new Map();
  const add = (map, key, q) => { if (!key) return; const k = norm(key); if (!map.has(k)) map.set(k, new Set()); map.get(k).add(q); };
  for (const [q, it] of items) {
    for (const id of it.ta2) add(byTa2, id, q);
    for (const l of [it.labels.la, ...it.aliases.la]) add(byLatin, l, q);
    for (const l of [it.labels.en, ...it.aliases.en]) add(byEnglish, l, q);
  }

  const names = {}, report = { conflicts: [], ties: [], wrongItems: [], droppedLabels: [] };
  const seen = new Set();
  for (const s of index.structures) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    // The TA2 row tools/index.mjs took the Latin name from: same English name, same Latin.
    const ta2Id = s.latin && [s.name, `(${s.name})`, s.name.replace(/ muscle$/i, "")]
      .map((n) => ta2Rows.find((r) => r[1]?.toLowerCase() === n.toLowerCase()))
      .find((r) => r && r[2] === s.latin)?.[0];
    const ways = {
      ta2: ta2Id ? byTa2.get(norm(ta2Id)) : undefined,
      latin: s.latin ? byLatin.get(norm(s.latin)) : undefined,
      english: byEnglish.get(norm(s.name)) ?? byEnglish.get(norm(s.name.replace(/ muscle$/i, ""))),
    };
    const found = Object.entries(ways).filter(([, set]) => set?.size);
    if (!found.length) continue;
    const common = [...found[0][1]].filter((q) => found.every(([, set]) => set.has(q)));
    const alone = found.filter(([, set]) => set.size === 1);
    const how = Object.fromEntries(found.map(([w, set]) => [w, [...set].sort()]));
    if (common.length !== 1) {
      report[common.length ? "ties" : "conflicts"].push({ name: s.name, latin: s.latin, ...how });
      continue;
    }
    if (!alone.length) { report.ties.push({ name: s.name, latin: s.latin, ...how }); continue; }
    const q = common[0], it = items.get(q);
    if (wrongItems.some(([n, w]) => n === s.name && w === q)) {
      report.wrongItems.push({ name: s.name, wikidata: q });
      continue;
    }
    const label = (lang) => {
      const v = it.labels[lang];
      if (!v) return null;
      if (wrongLabels.some(([w, l, text]) => w === q && l === lang && text === v)) {
        report.droppedLabels.push({ name: s.name, wikidata: q, lang, label: v });
        return null;
      }
      return v;
    };
    names[s.name] = { wikidata: q, hu: label("hu"), de: label("de"), via: alone.map(([w]) => w).sort() };
  }

  // One item for two different structures means one of the matches is wrong: both are dropped.
  const byItem = new Map();
  for (const [n, v] of Object.entries(names)) byItem.set(v.wikidata, [...(byItem.get(v.wikidata) ?? []), n]);
  report.shared = [];
  for (const [q, ns] of byItem) if (ns.length > 1) {
    report.shared.push({ wikidata: q, names: ns });
    for (const n of ns) delete names[n];
  }

  const sorted = Object.fromEntries(Object.keys(names).sort().map((n) => [n, names[n]]));
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify({
    source: "Wikidata (https://www.wikidata.org), CC0; labels in hu and de, matched by tools/names.mjs",
    retrieved: new Date().toISOString().slice(0, 10),
    names: sorted,
  }, null, 1) + "\n");
  fs.writeFileSync(path.join(cacheDir, "report.json"), JSON.stringify(report, null, 1));
  console.log(Object.keys(sorted).length, "names matched;", report.conflicts.length, "conflicts,",
    report.ties.length, "ties,", report.shared.length, "items shared by several names,",
    report.wrongItems.length, "wrong items,", report.droppedLabels.length, "wrong labels dropped (report in", path.join(cacheDir, "report.json") + ")");
}

// ---- Apply -------------------------------------------------------------------------------------

if (ta2File) await lookup();
const { names } = JSON.parse(fs.readFileSync(dataFile, "utf8"));
index.structures = index.structures.map((s) => {
  const { hu = null, de = null, wikidata = null } = names[s.name] ?? {};
  const { id, name, latin, hu: _h, de: _d, wikidata: _w, ...rest } = s;
  return { id, name, latin, hu, de, wikidata, ...rest };
});
fs.writeFileSync(indexFile, JSON.stringify(index));
const count = (f) => index.structures.filter((s) => s[f]).length;
console.log(index.structures.length, "structures:", count("wikidata"), "with a Wikidata item,",
  count("hu"), "with a Hungarian name,", count("de"), "with a German name");
