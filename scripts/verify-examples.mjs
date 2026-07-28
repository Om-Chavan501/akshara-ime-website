/**
 * Verifies every transliteration example on the site against the real conversion engine.
 *
 * This exists because I shipped `maraaThii` and then `aamhii` — both wrong, both written
 * from memory, both the same mistake (the long-ī key is `ee`/`I`, never `ii`). A marketing
 * page that misrepresents how the product works is worse than one with fewer examples, and
 * "be more careful" is not a fix. Run in CI so it can't regress.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ENDPOINT = "https://vsckavugkyeoanbygpqt.supabase.co/functions/v1/transliterate";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzY2thdnVna3llb2FuYnlncHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjI2MDgsImV4cCI6MjEwMDUzODYwOH0.KY0LBXyfwfR-averiCtMGsOXXfWCA3UFSm4kaOu82r8";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

// Pairs are declared as { typed: "...", got: "..." } so they can be found mechanically.
const PAIR = /\{\s*typed:\s*"([^"]+)"\s*,\s*got:\s*"([^"]+)"\s*\}/g;

const files = walk("src").filter((f) => /\.(astro|tsx|ts)$/.test(f));
const pairs = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(PAIR)) pairs.push({ file: f, typed: m[1], got: m[2] });
}

if (pairs.length === 0) {
  console.error("No examples found — the pattern may have drifted. Failing loudly.");
  process.exit(1);
}

let bad = 0;
for (const p of pairs) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ text: p.typed }),
  });
  const { result } = await res.json();
  const ok = result === p.got;
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${p.typed.padEnd(14)} → ${result}${ok ? "" : `   (page claims "${p.got}")`}`);
}

console.log(`\n${pairs.length} examples checked, ${bad} wrong`);
process.exit(bad ? 1 : 0);
