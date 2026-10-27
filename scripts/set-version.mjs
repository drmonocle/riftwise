// Sets the app version everywhere scripts/check-version.mjs looks: npm run set-version -- 0.7.48
import { readFileSync, writeFileSync } from "node:fs";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || "")) {
  console.error("usage: npm run set-version -- <major.minor.patch>");
  process.exit(1);
}
const edit = (p, fn) => {
  const url = new URL(`../${p}`, import.meta.url);
  const before = readFileSync(url, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`${p}: version not found (or already ${v})`);
  writeFileSync(url, after);
};
// only the first "version" of the JSON files: the app's own, not a dependency's
edit("package.json", (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
edit("package-lock.json", (s) => s.replace(/("name": "riftwise-tauri",\s*"version": )"[^"]+"/g, `$1"${v}"`));
edit("src-tauri/tauri.conf.json", (s) => s.replace(/"version": "[^"]+"/, `"version": "${v}"`));
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = "[^"]+"/m, `version = "${v}"`));
edit("src-tauri/Cargo.lock", (s) => s.replace(/(name = "riftwise-tauri"\r?\nversion = )"[^"]+"/, `$1"${v}"`));
for (const svc of ["pages", "push", "sync"]) {
  edit(`server/${svc}/main.go`, (s) => s.replace(/^(\s*(?:const\s+)?version\s*=\s*)"[^"]+"/m, `$1"${v}"`));
}
console.log(`Version set to ${v}`);
