/**
 * Packages the Chrome Web Store build from an existing dist/.
 *
 *   npm run package:store
 *
 * The dev build lets the content script run on localhost and file:// so the
 * fixtures and mock draft work. A store build must not: broad host access is
 * the first thing review questions, and "read all local files" would need a
 * justification this extension cannot give. Only the Yahoo draft host remains.
 */
import { cp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");
const out = path.join(root, "dist-store");
const zip = path.join(root, "release", "fantasy-draft-copilot.zip");
const STORE_HOSTS = ["https://basketball.fantasysports.yahoo.com/*"];

await rm(out, { recursive: true, force: true });
await cp(dist, out, { recursive: true });

const manifestPath = path.join(out, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const script of manifest.content_scripts) script.matches = STORE_HOSTS;
manifest.host_permissions = STORE_HOSTS;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const leaked = JSON.stringify(manifest).match(/localhost|127\.0\.0\.1|file:\/\//);
if (leaked) throw new Error(`store manifest still references ${leaked[0]}`);

await mkdir(path.dirname(zip), { recursive: true });
await rm(zip, { force: true });
execFileSync("zip", ["-rq", zip, ".", "-x", ".*"], { cwd: out });

console.log(`✔ store package -> ${path.relative(root, zip)} (v${manifest.version})`);
console.log(`  content script runs on: ${manifest.content_scripts[0].matches.join(", ")}`);
