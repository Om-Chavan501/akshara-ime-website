/**
 * Fails the build if any source file references a CSS custom property that nothing defines.
 *
 * This exists because of a real bug that shipped: `gap: var(--space-2) var(--space-5)` in the
 * support console, where the spacing scale has no `--space-5`. An invalid value doesn't
 * degrade — the browser drops the whole declaration — so the gap silently became zero and a
 * label collided with its value. The same typo was already live on the homepage.
 *
 * That's the dangerous shape here: a misspelt token produces no error anywhere, just layout
 * that's quietly wrong on one property. Catching it needs a check, not more care.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const DEFINING_FILES = ["src/styles/tokens.css", "src/styles/global.css"];
const SOURCE_GLOBS = ["src/**/*.astro", "src/**/*.tsx", "src/**/*.ts", "src/**/*.css"];

const DEFINE_RE = /--([a-z0-9-]+)\s*:/g;
const USE_RE = /var\(\s*--([a-z0-9-]+)/g;

const defined = new Set();
for (const file of DEFINING_FILES) {
  for (const m of readFileSync(file, "utf8").matchAll(DEFINE_RE)) defined.add(m[1]);
}

const failures = [];
for (const pattern of SOURCE_GLOBS) {
  for (const file of globSync(pattern)) {
    const source = readFileSync(file, "utf8");
    // A file may define its own properties — including via inline style="--x: …" attributes.
    // Anything defined anywhere in the same file counts as known.
    const local = new Set([...source.matchAll(DEFINE_RE)].map((m) => m[1]));

    // Astro's `define:vars={{ mark: …, word: … }}` emits `--mark`/`--word` at build time, so
    // those keys are defined even though the source never writes them with a `--` prefix.
    for (const block of source.matchAll(/define:vars=\{\{([\s\S]*?)\}\}/g)) {
      for (const key of block[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)) local.add(key[1]);
    }

    for (const m of source.matchAll(USE_RE)) {
      const name = m[1];
      if (defined.has(name) || local.has(name)) continue;
      const line = source.slice(0, m.index).split("\n").length;
      failures.push(`${file}:${line}  --${name}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Undefined CSS custom properties (the declaration will be dropped):\n");
  for (const f of [...new Set(failures)]) console.error("  " + f);
  console.error(`\n${failures.length} reference(s). Add the token, or use an existing one.`);
  process.exit(1);
}

console.log("✓ every var(--…) reference resolves to a defined token");
