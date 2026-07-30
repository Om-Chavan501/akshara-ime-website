/**
 * Downloads the released installer into `public/download/` so the site serves it from its own
 * domain.
 *
 * Why not just link GitHub directly, as the site did until now: a paying customer downloading
 * a keystroke-level system extension saw a personal repo, a *website* repo, and a version tag
 * in the URL bar. It also broke the download button — `download` is ignored on a cross-origin
 * link, so the click navigated to GitHub and left a blank tab behind.
 *
 * Why not commit the .pkg: it is ~4 MB per release and git keeps every one of them forever.
 * Fetching at build time costs one request and keeps the repo the size of a website.
 *
 * The version comes from `public/appcast.json`, which the running apps already poll to decide
 * whether an update exists. One source of truth: it is not possible for the site to offer a
 * different build from the one it tells installed copies to go and get.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = "Om-Chavan501/akshara-ime-website";
const ASSET = "AksharaIME-Installer.pkg";
const OUT_DIR = join("public", "download");

const { latest_version: version } = JSON.parse(
  readFileSync(join("public", "appcast.json"), "utf8"),
);
if (!version) {
  console.error("appcast.json has no latest_version — cannot tell which build to fetch.");
  process.exit(1);
}

const url = `https://github.com/${REPO}/releases/download/v${version}/${ASSET}`;
const out = join(OUT_DIR, ASSET);

const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`Could not fetch ${url} — HTTP ${res.status}.`);
  // Hard failure on purpose. A silent skip would publish a site whose only download link is a
  // 404, which is worse than not deploying: the page would look entirely fine.
  process.exit(1);
}

const bytes = Buffer.from(await res.arrayBuffer());
if (bytes.length < 500_000) {
  console.error(`Refusing to publish a ${bytes.length}-byte installer — that is not a .pkg.`);
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(out, bytes);
console.log(`✓ v${version} installer → ${out} (${(bytes.length / 1e6).toFixed(1)} MB)`);
