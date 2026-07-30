import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * The hero's type-and-convert animation.
 *
 * Shows conversion happening *per keystroke* rather than as one transformation at the end,
 * because that is what the product actually does — typing `namask` really does put नमस्क् on
 * screen, since an input method converts continuously and commits on space.
 *
 * States are HARDCODED, not fetched. They were fetched from the live endpoint at first —
 * one request per phrase at mount — but that introduced a real bug: the animation's
 * character timer starts immediately while the network request is still in flight, so early
 * in the loop the display flips between "nothing yet" and the real per-character state once
 * it lands. For four fixed, known phrases that's pure risk for no benefit — nothing here is
 * user input, so there's nothing to compute at runtime.
 *
 * The values below are still verified against the real engine (not hand-typed) — see the
 * generation command in the comment above PHRASES — and scripts/verify-examples.mjs checks
 * the final forms on every build, so a scheme change that would break this can't ship silently.
 */

// Generated with:
//   curl -s -X POST https://vsckavugkyeoanbygpqt.supabase.co/functions/v1/transliterate \
//     -H "apikey: <anon>" -H "Content-Type: application/json" \
//     -d '{"text":"namaskaara","prefixes":true}'
const PHRASES: Array<{ typed: string; steps: string[] }> = [
  {
    typed: "namaskaara",
    steps: ["न्", "न", "नम्", "नम", "नमस्", "नमस्क्", "नमस्क", "नमस्का", "नमस्कार्", "नमस्कार"],
  },
  {
    typed: "maraaThI",
    steps: ["म्", "म", "मर्", "मर", "मरा", "मराट्", "मराठ्", "मराठी"],
  },
  {
    typed: "vaa~gmaya",
    steps: ["व्", "व", "वा", "वा", "वाङ्", "वाङ्म्", "वाङ्म", "वाङ्मय्", "वाङ्मय"],
  },
  {
    typed: "aapalaa",
    steps: ["अ", "आ", "आप्", "आप", "आपल्", "आपल", "आपला"],
  },
];

const TYPE_MS = 155;
const HOLD_COMPLETE = 1900;

export default function HeroDemo() {
  const reduced = useReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (reduced) { setCharCount(PHRASES[0].typed.length); return; }

    const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

    const phrase = PHRASES[phraseIndex];
    setCharCount(0);
    for (let c = 1; c <= phrase.typed.length; c++) at(c * TYPE_MS, () => setCharCount(c));
    at(phrase.typed.length * TYPE_MS + HOLD_COMPLETE, () =>
      setPhraseIndex((n) => (n + 1) % PHRASES.length));

    return clear;
  }, [phraseIndex, reduced]);

  const phrase = PHRASES[phraseIndex];
  const latin = phrase.typed.slice(0, charCount);
  const deva = charCount === 0 ? "" : phrase.steps[charCount - 1];
  const done = charCount === phrase.typed.length;

  return (
    <div className="herodemo" aria-hidden="true">
      <div className="hd-window">
        <div className="hd-bar">
          <span className="hd-dot" /><span className="hd-dot" /><span className="hd-dot" />
          <span className="hd-title">Notes</span>
          <span className="hd-ime">अ</span>
        </div>

        <div className="hd-body">
          <div className="hd-row">
            <span className="hd-label">you type</span>
            <span className="hd-latin">
              {latin}
              {!done && <span className="hd-caret" />}
            </span>
          </div>

          <div className="hd-rule" />

          <div className="hd-row">
            <span className="hd-label">you get</span>
            <span className="hd-deva deva" lang="mr">
              {/* NOT animated per keystroke. It was keyed on `deva`, so a fresh element
                  remounted on every single character (every 155ms), restarting its fade-in
                  each time -- that constant restart WAS the flicker being reported, not a
                  network artefact. A real IME doesn't animate every intermediate marked-text
                  update either; it just updates it. Keyed on phraseIndex instead, so there is
                  exactly one entrance animation per phrase (when it starts), and plain,
                  instant updates for every keystroke within it. */}
              <motion.span
                key={phraseIndex}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                {deva || " "}
              </motion.span>
              {done && (
                <motion.span
                  className="hd-commit"
                  initial={reduced ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  space to commit
                </motion.span>
              )}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .herodemo { width: 100%; max-width: 470px; margin-inline: auto; }
        .hd-window {
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: var(--shadow-lg);
        }
        .hd-bar {
          display: flex; align-items: center; gap: 6px;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-sunken);
          border-bottom: 1px solid var(--border);
        }
        .hd-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--border-strong); }
        .hd-title { margin-inline: auto; font-size: var(--text-xs); color: var(--text-subtle); }
        .hd-ime {
          font-family: "Inknut Antiqua", Georgia, serif;
          font-size: 11px; line-height: 1;
          background: var(--accent); color: var(--text-on-accent);
          padding: 4px 7px; border-radius: 5px;
        }

        .hd-body { padding: var(--space-6); display: grid; gap: var(--space-4); }
        .hd-row { display: grid; gap: var(--space-2); }
        .hd-label {
          font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--text-subtle);
        }
        .hd-latin {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: var(--text-lg); color: var(--text-muted);
          min-height: 1.7em; display: flex; align-items: center;
        }
        .hd-rule { height: 1px; background: var(--border); }
        .hd-deva {
          font-size: var(--text-2xl); color: var(--accent);
          min-height: 1.9em; display: flex; align-items: center; gap: var(--space-3);
          flex-wrap: wrap;
        }
        .hd-commit {
          font-family: "Anek Devanagari", system-ui, sans-serif;
          font-size: var(--text-xs); letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--text-subtle);
          border: 1px solid var(--border); border-radius: var(--radius-full);
          padding: 3px 9px;
        }
        .hd-caret {
          display: inline-block; width: 2px; height: 1.05em;
          background: var(--accent); margin-left: 2px;
          animation: hd-blink 1.05s steps(2, start) infinite;
        }
        @keyframes hd-blink { 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .hd-caret { animation: none; } }
      `}</style>
    </div>
  );
}
