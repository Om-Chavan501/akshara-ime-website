import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/supabase";

/**
 * Try-before-you-buy.
 *
 * This is the most persuasive thing the site can do: the product's entire claim is that the
 * phonetic scheme is reproduced exactly, and nobody can evaluate that from prose. Letting
 * someone type their own words and watch them become Devanagari is the proof.
 *
 * Conversion runs server-side, so the rule table never reaches the browser — it's the one
 * asset that took real work to establish, and shipping it as JS would hand a competitor a
 * copy-paste head start.
 */

const SUGGESTIONS = [
  { typed: "namaskaara", got: "नमस्कार" },
  { typed: "maraaThI", got: "मराठी" },
  { typed: "jhaalM", got: "झालं" },
  { typed: "aamhI", got: "आम्ही" },
  { typed: "aapalaa", got: "आपला" },
];
const MAX = 120;

export default function TryIt() {
  const reduced = useReducedMotion();
  const [text, setText] = useState("namaskaara");
  const [out, setOut] = useState("नमस्कार");
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!text.trim()) { setOut(""); setState("idle"); return; }

    // Debounced: converting on every keystroke would fire a request per character, which is
    // wasteful and would trip the endpoint's own rate limit during normal typing.
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setState("working");
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/transliterate`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        // Out-of-order responses would make the output flicker backwards on fast typing.
        if (mine !== seq.current) return;
        if (!res.ok) { setState("error"); return; }
        const body = await res.json();
        setOut(body.result ?? "");
        setState("idle");
      } catch {
        if (mine === seq.current) setState("error");
      }
    }, 180);

    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="tryit">
      <div className="tryit-box">
        <label htmlFor="tryit-input">Type it how it sounds</label>
        <input
          ref={inputRef}
          id="tryit-input"
          type="text"
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="namaskaara"
          aria-describedby="tryit-help"
        />
        <p className="tryit-hint">Roman letters, spelled phonetically.</p>
        <div className="tryit-chips" role="group" aria-label="Example words">
          {SUGGESTIONS.map(({ typed }) => (
            <button
              key={typed}
              type="button"
              className="chip"
              onClick={() => { setText(typed); inputRef.current?.focus(); }}
            >
              {typed}
            </button>
          ))}
        </div>
      </div>

      <div className="tryit-arrow" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>

      <div className="tryit-box out">
        <label id="tryit-out-label">What you'd get</label>
        {/* aria-live so a screen-reader user hears the result without moving focus out of
            the input they're still typing in. */}
        <div
          className="tryit-result deva"
          role="status"
          aria-live="polite"
          aria-labelledby="tryit-out-label"
        >
          {out ? (
            <motion.span
              key={out}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {out}
            </motion.span>
          ) : (
            <span className="tryit-placeholder">Your Marathi appears here</span>
          )}
        </div>
        {state === "error" && (
          <p className="tryit-err" role="alert">
            Couldn't reach the converter just now. The app itself works entirely offline —
            this demo is the only part that needs a connection.
          </p>
        )}
      </div>

      <style>{`
        .tryit {
          display: grid;
          gap: var(--space-3);
          max-width: 560px;
          margin-inline: auto;
        }
        .tryit-box {
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
        }
        .tryit label {
          display: block;
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: var(--space-3);
        }
        .tryit input {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius);
          background: var(--bg);
          color: var(--text);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: var(--text-lg);
          min-height: 52px;
        }
        .tryit input:focus-visible { border-color: var(--accent); }

        .tryit-hint {
          font-size: var(--text-sm);
          color: var(--text-muted);
          margin: var(--space-4) 0 var(--space-2);
        }
        .tryit-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .chip {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: var(--text-sm);
          background: var(--bg-sunken);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          padding: 7px 14px;
          min-height: 36px;
          color: var(--text-muted);
          cursor: pointer;
          transition: border-color var(--duration-fast) var(--ease-out),
                      color var(--duration-fast) var(--ease-out),
                      background var(--duration-fast) var(--ease-out);
        }
        .chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); }
        .chip:active { transform: scale(0.96); }

        .tryit-arrow {
          display: grid;
          place-items: center;
          color: var(--text-subtle);
        }

        .tryit-box.out { background: var(--accent-subtle); border-color: transparent; }
        .tryit-result {
          /* Fixed min-height so the layout never jumps as the result changes length. */
          min-height: 2.4em;
          display: flex;
          align-items: center;
          font-size: var(--text-2xl);
          color: var(--accent);
          word-break: break-word;
        }
        .tryit-placeholder {
          font-size: var(--text-base);
          color: var(--text-subtle);
          font-family: "Anek Devanagari", system-ui, sans-serif;
        }
        .tryit-err {
          font-size: var(--text-sm);
          color: var(--danger);
          margin-top: var(--space-3);
        }
      `}</style>
    </div>
  );
}
