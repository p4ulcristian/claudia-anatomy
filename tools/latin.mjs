// Sets each structure's Latin name (`latin` in models/index.json) to the official Terminologia
// Anatomica 2nd edition (TA2, 2019) term, replacing the Latin tools/index.mjs took from Z-Anatomy's
// TA2 table (which has typos, garbled rows, rows naming another structure and rows of its own).
//
//   node tools/latin.mjs <models dir>                        apply data/ta2-latin.json
//   node tools/latin.mjs <models dir> --resolve <ta2.json>   resolve the names again, then apply
//
// Run it after tools/index.mjs and before tools/names.mjs. Only `latin` changes. The resolved
// names are kept in data/ta2-latin.json (committed: per English name the Latin and the TA2 IDs it
// came from), so a rebuild needs only that file. A name missing from it stops the build: resolve
// again.
//
// <ta2.json> is the official TA2 list as published by the TA2 Viewer
// (https://ta2viewer.openanatomy.org): the JSON.parse string literal in its main.*.chunk.js
// (main.0f36751c.chunk.js, from byte 1139), 7,112 entries {id, level, parent, term: {la, en |
// en_US + en_GB}, synonyms?: {la, en}, ...}. It is not committed.
//
// Per English name (left and right share one), the first of these that gives a Latin name wins:
//   term     a TA2 term's English (en, en_US or en_GB) is the name, or the name less " muscle";
//   synonym  the same with TA2's English synonyms;
//            names compare case-insensitively with spaces collapsed. More than one entry is
//            accepted only when they all have the same Latin (the same term listed in two places);
//            a term match wins over a synonym match (Retina, Ulnotriquetral ligament).
//   alias    the name is a damaged or variant form of a TA2 English term (list below, checked by
//            hand), looked up as a term or synonym;
//   rule     a member of a series TA2 names only in part (ribs, phalanges, teeth...), or a part of
//            a TA2 structure, composed from the official siblings (rules below, each naming the
//            TA2 entries it follows);
//   kept     not in TA2, Z-Anatomy's Latin is correct Latin for it (list below);
//   none     null: no official term, and Z-Anatomy's Latin (if any) is not a correct name.
// The official Latin is used as TA2 writes it (TA2's own word order, "flexor radialis carpi"), the
// first letter capitalised.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, "..", "data", "ta2-latin.json");

const args = process.argv.slice(2);
const outDir = args[0];
const resolveAt = args.indexOf("--resolve");
const ta2File = resolveAt >= 0 ? args[resolveAt + 1] : null;
if (!outDir || (resolveAt >= 0 && !ta2File)) {
  console.error("usage: node tools/latin.mjs <models dir> [--resolve <ta2.json>]");
  process.exit(1);
}
const indexFile = path.join(outDir, "index.json");
const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));

// ---- Hand-checked lists ------------------------------------------------------------------------

// Z-Anatomy name -> the TA2 English it stands for.
const aliases = {
  "Olfactory nerve (I": ["olfactory nerve", "name cut at the cranial nerve number"],
  "Optic nerve (II": ["optic nerve", "name cut at the cranial nerve number"],
  "Oculomotor nerve (III": ["oculomotor nerve", "name cut at the cranial nerve number"],
  "Trochlear nerve (IV": ["trochlear nerve", "name cut at the cranial nerve number"],
  "Trigeminal nerve (V": ["trigeminal nerve", "name cut at the cranial nerve number"],
  "Abducens nerve (VI": ["abducens nerve", "name cut at the cranial nerve number"],
  "Facial nerve (VII": ["facial nerve", "name cut at the cranial nerve number"],
  "Glossopharyngeal nerve (IX": ["glossopharyngeal nerve", "name cut at the cranial nerve number"],
  "Vagus nerve (X": ["vagus nerve", "name cut at the cranial nerve number"],
  "Accessory nerve (XI": ["accessory nerve", "name cut at the cranial nerve number"],
  "Hypoglossal nerve (XII": ["hypoglossal nerve", "name cut at the cranial nerve number"],
  "Atlas (C1)": ["atlas", "TA2 1038, synonym vertebra C1"],
  "Axis (C2)": ["axis", "TA2 1050, synonym vertebra C2"],
  "Straight gyrus (Gyrus rectus)": ["straight gyrus", "the bracket is its Latin name"],
  "Central canal'": ["central canal", "stray apostrophe; the spinal cord's central canal"],
  "Posterior lateral nasal branches of sphenopalatine artery.": [
    "posterior lateral nasal branches of sphenopalatine artery", "stray full stop"],
  "Inferior vein of left ventricle (//Posterior ''": [
    "inferior vein of left ventricle", "the bracket is its other name (posterior vein)"],
  "Insular branches of middle cerebral artery (M2": [
    "insular branches of middle cerebral artery", "name cut at the segment (M2 = insular segment)"],
  "Insular branches of middle cerebral artery (M2-segment": [
    "insular branches of middle cerebral artery", "name cut at the segment (M2 = insular segment)"],
  "Accessory nucleus of oculomotor nerve": [
    "accessory nucleus of oculomotor nucleus", "TA2 5893's English says nucleus for nerve; its Latin says nervi"],
  "Sacrococcygeal symphysis": [
    "sacrococcygeal joint", "TA2 1688 is this joint, among the cartilaginous joints of the vertebral column"],
  "Subfacial prepatellar bursa": ["subfascial prepatellar bursa", "misspelt (subfacial)"],
  "Trochanteric bursa of gluteus medius muscle": [
    "trochanteric bursae of gluteus medius muscle", "TA2 2725 names these bursae in the plural"],
  "Tendon sheath of tibialis anterior": ["tendon sheath of tibialis anterior muscle", "TA2 2756"],
  "Tendon sheath - abd. pollicis longus - ext. pollicis brevis": [
    "tendon sheath of abductor pollicis longus and extensor pollicis brevis", "abbreviated; TA2 2577"],
};

// Not in TA2; Z-Anatomy's Latin is a correct name for the structure.
const kept = {
  "Intermediomedial nucleus": ["Nucleus intermediomedialis", "not in TA2 (its sibling nucleus intermediolateralis is, 6078)"],
};

// ---- Composition rules -------------------------------------------------------------------------

const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
  "tenth", "eleventh", "twelfth"];
// Latin ordinals 1-12: feminine nominative, feminine genitive, neuter nominative, masculine nominative.
const femNom = ["prima", "secunda", "tertia", "quarta", "quinta", "sexta", "septima", "octava", "nona",
  "decima", "undecima", "duodecima"];
const femGen = ["primae", "secundae", "tertiae", "quartae", "quintae", "sextae", "septimae", "octavae",
  "nonae", "decimae", "undecimae", "duodecimae"];
const neutNom = ["primum", "secundum", "tertium", "quartum", "quintum"];
const mascNom = ["primus", "secundus", "tertius"];
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const ord = (w) => ordinals.indexOf(w.toLowerCase());

// The digits in the genitive, as TA2 names them: hand 151-155 (pollex, index, digitus medius
// manus, digitus anularis, digitus minimus manus), foot 171-175 (hallux, digitus secundus /
// tertius / quartus pedis, digitus minimus pedis); genitives as in TA2 1842 (pollicis), 2515
// (indicis), 2529 (digiti minimi manus), 1971 (hallucis), 2679 (digiti minimi pedis).
const digitGen = {
  hand: ["pollicis", "indicis", "digiti medii manus", "digiti anularis", "digiti minimi manus"],
  foot: ["hallucis", "digiti secundi pedis", "digiti tertii pedis", "digiti quarti pedis", "digiti minimi pedis"],
};
const phalanx = { proximal: "proximalis", middle: "media", distal: "distalis" };

// Joints in the genitive, after the official nominative (checked against the list when resolving).
const joints = {
  "acromioclavicular joint": [1744, "articulatio acromioclavicularis", "articulationis acromioclavicularis"],
  "elbow joint": [1772, "articulatio cubiti", "articulationis cubiti"],
  "glenohumeral joint": [1764, "articulatio glenohumeralis", "articulationis glenohumeralis"],
  "hip joint": [1873, "articulatio coxae", "articulationis coxae"],
  "interphalangeal joint of great toe": [1971, "articulatio interphalangea hallucis", "articulationis interphalangeae hallucis"],
  "knee joint": [1883, "articulatio genus", "articulationis genus"],
  "radiocarpal joint": [1786, "articulatio radiocarpea", "articulationis radiocarpeae"],
  "sternoclavicular joint": [1750, "articulatio sternoclavicularis", "articulationis sternoclavicularis"],
  "superior tibiofibular joint": [1909, "articulatio tibiofibularis", "articulationis tibiofibularis"],
  "temporomandibular joint": [1622, "articulatio temporomandibularis", "articulationis temporomandibularis"],
  // Z-Anatomy's plain "interphalangeal joints" are the hand's (the foot's say "of foot").
  "distal interphalangeal joints": [1841, "articulationes interphalangeae distales manus", "articulationum interphalangearum distalium manus"],
  "distal interphalangeal joints of foot": [1970, "articulationes interphalangeae distales pedis", "articulationum interphalangearum distalium pedis"],
  "proximal interphalangeal joints": [1840, "articulationes interphalangeae proximales manus", "articulationum interphalangearum proximalium manus"],
  "proximal interphalangeal joints of foot": [1969, "articulationes interphalangeae proximales pedis", "articulationum interphalangearum proximalium pedis"],
  "metacarpophalangeal joints": [1835, "articulationes metacarpophalangeae", "articulationum metacarpophalangearum"],
  "metatarsophalangeal joints": [1964, "articulationes metatarsophalangeae", "articulationum metatarsophalangearum"],
};

// Each rule: [name, pattern, (match, lookup) => {latin, ta2: [entries it follows]} | null, note].
const rules = [
  ["rib", /^(\w+) rib$/i, (m) => ord(m[1]) >= 0 &&
    { latin: `costa ${femNom[ord(m[1])]}`, ta2: [1107, 1111] },
    "costa + ordinal, as TA2 1107 costa prima, 1111 costa secunda"],
  ["costal cartilage", /^Costal cartilage of (\w+) rib$/i, (m) => ord(m[1]) >= 0 &&
    { latin: `cartilago costalis costae ${femGen[ord(m[1])]}`, ta2: [1140, 1107] },
    "TA2 1140 cartilago costalis + the rib (1107 costa prima) in the genitive"],
  ["metacarpal / metatarsal", /^(\w+) (metacarpal|metatarsal) bone$/i, (m) => ord(m[1]) >= 0 && ord(m[1]) < 5 &&
    { latin: `os ${neutNom[ord(m[1])]} ${m[2] === "metacarpal" ? "metacarpi" : "metatarsi"}`, ta2: [1269, 1500, 1502] },
    "as TA2 1269 os tertium metacarpi, 1500 os primum metatarsi, 1502 os quintum metatarsi"],
  ["phalanx", /^(Proximal|Middle|Distal) phalanx of (\w+) finger of (hand|foot)$/i, (m) => ord(m[2]) >= 0 && ord(m[2]) < 5 &&
    { latin: `phalanx ${phalanx[m[1].toLowerCase()]} ${digitGen[m[3]][ord(m[2])]}`,
      ta2: m[3] === "hand" ? [1277, 1278, 1279, 151, 152, 153, 154, 155] : [1510, 1511, 1512, 171, 172, 173, 174, 175] },
    "TA2 1277-1279 / 1510-1512 phalanx proximalis / media / distalis manus / pedis, with the digit (151-155, 171-175) in the genitive for manus / pedis"],
  ["vertebra", /^Vertebra ([CTL])(\d+)$/, (m) => {
    const n = Number(m[2]) - 1;
    if (m[1] === "C") return { latin: `vertebra cervicalis ${roman[n]}`, ta2: [1055] };
    if (m[1] === "T") return { latin: `vertebra thoracica ${femNom[n]}`, ta2: [1059, 1063] };
    return { latin: `vertebra lumbalis ${femNom[n]}`, ta2: [1068, 1063] };
  }, "cervical as TA2 1055 vertebra cervicalis VI; thoracic as 1063 vertebra thoracica prima; lumbar: 1068 vertebra lumbalis + ordinal as in 1063"],
  ["intervertebral disc", /^(Intervertebral disc|Nucleus pulposus) ([CTLS]\d+-[CTLS]\d+)$/, (m) =>
    ({ latin: `${m[1] === "Nucleus pulposus" ? "nucleus pulposus" : "discus intervertebralis"} ${m[2]}`,
       ta2: [m[1] === "Nucleus pulposus" ? 1686 : 1684, 1055] }),
    "TA2 1684 discus intervertebralis / 1686 nucleus pulposus + the vertebrae as TA2 labels them (1055 vertebra C6)"],
  ["tooth", /^(Upper|Lower) (medial incisor|lateral incisor|canine|first premolar|second premolar|first molar tooth|second molar tooth)$/i, (m) => {
    const jaw = m[1].toLowerCase() === "upper" ? "maxillaris" : "mandibularis";
    const [a, b] = m[2].toLowerCase().replace(/ tooth$/, "").split(" ");
    const kind = { incisor: "incisivus", canine: "caninus", premolar: "premolaris", molar: "molaris" }[b ?? a];
    const which = b ? (a === "medial" ? "medialis" : a === "lateral" ? "lateralis" : mascNom[ord(a)]) : null;
    return { latin: ["dens", kind, which, jaw].filter(Boolean).join(" "), ta2: [906, 907, 909, 910, 911, 902, 903] };
  }, "TA2 906-910 dens incisivus / caninus / premolaris / molaris, ordinal as 911 dens molaris tertius, jaw as 902 / 903 arcus dentalis maxillaris / mandibularis"],
  ["joint capsule", /^Articular capsules? of (.+)$/i, (m) => {
    const j = joints[m[1].toLowerCase()];
    if (!j) return null;
    const plural = /^articulationes/.test(j[1]);
    return { latin: `${plural ? "capsulae articulares" : "capsula articularis"} ${j[2]}`, ta2: [1536, j[0]] };
  }, "TA2 1536 capsula articularis + the official joint name in the genitive"],
  ["intrarenal arteries", /^Intrarenal arteries of (left|right) kidney$/i, (m) =>
    ({ latin: `arteriae intrarenales renis ${m[1].toLowerCase() === "left" ? "sinistri" : "dextri"}`, ta2: [4280, 5002, 5008] }),
    "TA2 4280 arteriae intrarenales + the kidney as in the veins' 5002 / 5008 venae intrarenales renis dextri / sinistri"],
  ["tendon", /^Tendon of (extensor digitorum longus)$/i, (m, lookup) => {
    const muscle = lookup(m[1]);
    if (muscle?.la !== "extensor longus digitorum") return null;
    return { latin: "tendo extensoris longi digitorum", ta2: [2010, muscle.id] };
  }, "TA2 2010 tendo + the muscle (2645 extensor longus digitorum) in the genitive"],
  ["left / right", /^(Left|Right) (.+)$/, (m, lookup) => {
    const t = lookup(m[2]);
    if (!t || !/^(arteria|vena) /.test(t.la)) return null; // feminine singular head nouns only
    return { latin: `${t.la} ${m[1] === "Left" ? "sinistra" : "dextra"}`, ta2: [t.id, 5006, 4182] };
  }, "the official term + sinistra / dextra, as TA2 5006 vena renalis sinistra, 4182 arteria subclavia dextra"],
];

// ---- Resolve -----------------------------------------------------------------------------------

function resolve() {
  const ta2 = JSON.parse(fs.readFileSync(ta2File, "utf8"));
  const byId = new Map(ta2.map((e) => [e.id, e]));
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const terms = new Map(), synonyms = new Map();
  const add = (map, key, e) => { const k = norm(key); if (!map.has(k)) map.set(k, []); map.get(k).push(e); };
  for (const e of ta2) {
    for (const [lang, en] of Object.entries(e.term)) if (lang !== "la") add(terms, en, e);
    for (const en of e.synonyms?.en ?? []) add(synonyms, en, e);
  }
  // One Latin name for the English, or null. Several entries count as one when their Latin is the same.
  const lookup = (english) => {
    const forms = [english, english.replace(/ muscle$/i, "")];
    for (const map of [terms, synonyms]) for (const f of forms) {
      const found = map.get(norm(f));
      if (!found) continue;
      const las = new Set(found.map((e) => e.term.la));
      if (las.size !== 1) return { ambiguous: found.map((e) => e.id) };
      return { la: found[0].term.la, id: found[0].id, ids: found.map((e) => e.id), via: map === terms ? "term" : "synonym" };
    }
    return null;
  };
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  for (const [, [id, nominative]] of Object.entries(joints))
    if (byId.get(id)?.term.la !== nominative) throw new Error(`TA2 ${id} is not "${nominative}"`);

  const names = {}, ambiguous = [];
  for (const name of [...new Set(index.structures.map((s) => s.name))].sort()) {
    let r = lookup(name);
    if (r?.ambiguous) { ambiguous.push({ name, ta2: r.ambiguous }); r = null; }
    if (r) { names[name] = { latin: cap(r.la), ta2: r.ids, via: r.via }; continue; }
    if (aliases[name]) {
      const a = lookup(aliases[name][0]);
      if (!a || a.ambiguous) throw new Error(`alias of "${name}" does not resolve`);
      names[name] = { latin: cap(a.la), ta2: a.ids, via: "alias", note: aliases[name][1] };
      continue;
    }
    const ruled = rules.map(([rule, re, make]) => {
      const m = name.match(re);
      const made = m && make(m, (en) => { const t = lookup(en); return t && !t.ambiguous ? t : null; });
      return made && { latin: cap(made.latin), ta2: made.ta2, via: "rule", rule };
    }).find(Boolean);
    if (ruled) { names[name] = ruled; continue; }
    if (kept[name]) { names[name] = { latin: kept[name][0], ta2: null, via: "kept", note: kept[name][1] }; continue; }
    names[name] = { latin: null, ta2: null, via: "none" };
  }
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const source = "Terminologia Anatomica, 2nd edition (TA2, 2019), FIPAT, as published by the TA2 Viewer (https://ta2viewer.openanatomy.org); matched and composed by tools/latin.mjs";
  const lines = Object.entries(names).map(([n, v]) => `  ${JSON.stringify(n)}: ${JSON.stringify(v)}`);
  fs.writeFileSync(dataFile, `{\n "source": ${JSON.stringify(source)},\n "names": {\n${lines.join(",\n")}\n }\n}\n`);
  const count = (v) => Object.values(names).filter((n) => n.via === v).length;
  console.log(Object.keys(names).length, "names:", count("term"), "TA2 terms,", count("synonym"), "TA2 synonyms,",
    count("alias"), "aliases,", count("rule"), "composed by rule,", count("kept"), "kept,", count("none"), "without Latin;",
    ambiguous.length, "ambiguous", ambiguous.length ? JSON.stringify(ambiguous) : "");
}

// ---- Apply -------------------------------------------------------------------------------------

if (ta2File) resolve();
const { names } = JSON.parse(fs.readFileSync(dataFile, "utf8"));
const missing = [...new Set(index.structures.map((s) => s.name))].filter((n) => !(n in names));
if (missing.length) {
  console.error("not in data/ta2-latin.json (run with --resolve):", missing);
  process.exit(1);
}
for (const s of index.structures) s.latin = names[s.name].latin;
fs.writeFileSync(indexFile, JSON.stringify(index));
console.log(index.structures.length, "structures,", index.structures.filter((s) => s.latin).length, "with a Latin name");
