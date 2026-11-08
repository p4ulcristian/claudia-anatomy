// Joins the exporters' index-<k>.json and index-curves.json files into index.json (by system, then id).
//   node tools/merge.mjs <raw dir>
import fs from "node:fs";
import path from "node:path";
const [dir] = process.argv.slice(2);
const parts = fs.readdirSync(dir).filter((f) => /^index-.+\.json$/.test(f));
const all = parts.flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
all.sort((a, b) => (a.system + "/" + a.id).localeCompare(b.system + "/" + b.id));
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(all));
console.log(parts.length, "workers,", all.length, "structures");
