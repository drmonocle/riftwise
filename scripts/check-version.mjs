// Fails if the app version differs anywhere it is written down: package.json (+ lock), tauri.conf.json, Cargo.toml
// (+ lock) and the three Go services, whose health checks report it so you can tell what is running.
// Change them all at once with: npm run set-version -- 0.7.48
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const lock = JSON.parse(read("package-lock.json"));
const goVersion = (svc) => /^\s*(?:const\s+)?version\s*=\s*"([^"]+)"/m.exec(read(`server/${svc}/main.go`))?.[1];

const versions = {
  "package.json": JSON.parse(read("package.json")).version,
  "package-lock.json": lock.version,
  'package-lock.json packages[""]': lock.packages?.[""]?.version,
  "tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "Cargo.toml": /^version\s*=\s*"([^"]+)"/m.exec(read("src-tauri/Cargo.toml"))?.[1],
  "Cargo.lock": /name = "riftwise-tauri"\r?\nversion = "([^"]+)"/.exec(read("src-tauri/Cargo.lock"))?.[1],
  "server/pages": goVersion("pages"),
  "server/push": goVersion("push"),
  "server/sync": goVersion("sync"),
};
if (new Set(Object.values(versions)).size !== 1) {
  console.error("Version mismatch:", versions);
  process.exit(1);
}
console.log(`Versions in sync: ${versions["package.json"]}`);
