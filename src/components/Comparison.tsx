
/**
 * The strongest argument on the page: a word the alternatives actually get wrong.
 *
 * वाङ्मय is a fair test rather than a cherry-pick — a common Marathi word containing a
 * conjunct (ङ् + म) that suggestion-based transliteration reliably fumbles, because it is
 * guessing at a word from a rough phonetic sketch instead of following a defined scheme.
 * Typing `vangmay` into macOS's own Marathi transliteration offers वांगमय, वंगमय, वनगमय —
 * none of them right.
 *
 * Deliberately compares *approaches*, not named products. The complaint is structural: a
 * guesser can be wrong, and a layout has to be memorised. Naming vendors would make it a
 * cheap shot and would age badly.
 */

const APPROACHES = [
  {
    label: "English to Marathi transliteration",
    how: "macOS's built-in option",
    input: ["vangmay"],
    results: ["वांगमय", "वंगमय", "वनगमय"],
    verdict: "wrong",
    note: "It guesses. When the guess is wrong you're hunting a dropdown, and for anything with a conjunct it usually is.",
  },
  {
    label: "InScript keyboard",
    how: "Memorise a new layout",
    input: ["b", "e", "⇧U", "d", "c", "/"],
    results: ["वाङ्मय"],
    verdict: "learn",
    note: "Correct and fast — once you've learned where 48 characters live. That's weeks before you're useful.",
  },
  {
    label: "AksharaIME",
    how: "Spell it how it sounds",
    input: ["vaa~gmaya"],
    results: ["वाङ्मय"],
    verdict: "right",
    note: "Defined rules, not guesses. vaa → वा, ~g → ङ्, ma → म, ya → य. Nothing to pick, nothing to memorise.",
  },
];

export default function Comparison() {

  return (
    <div className="cmp">
      {APPROACHES.map((a, i) => (
        // Reveals via the CSS mechanism (see Reveal.astro), not Motion. As a Motion island
        // this section's three cards were server-rendered at `opacity: 0` and stayed blank
        // whenever JS didn't arrive — on the strongest argument on the page. Plain markup also
        // means it needs no client directive at all, so it now ships zero JavaScript.
        <div
          key={a.label}
          className={`cmp-card is-${a.verdict} reveal`}
          style={{ ["--reveal-i" as string]: i }}
        >
          <div className="cmp-head">
            <span className="cmp-how">{a.how}</span>
            <h3>{a.label}</h3>
          </div>

          <div className="cmp-io">
            <div className="cmp-input-group">
              {a.input.map((step, si) => (
                <code key={si} className="cmp-input">{step}</code>
              ))}
            </div>
            <span className="cmp-arrow" aria-hidden="true">→</span>
            <div className="cmp-results">
              {a.results.map((r) => (
                <span key={r} className="cmp-result deva" lang="mr">{r}</span>
              ))}
              {a.verdict === "wrong" && <span className="cmp-more">…and more</span>}
            </div>
          </div>

          <p className="cmp-note">{a.note}</p>

          <span className={`cmp-badge ${a.verdict}`}>
            {a.verdict === "wrong" ? "Not what you meant"
              : a.verdict === "learn" ? "Weeks to learn"
              : "Right, first time"}
          </span>
        </div>
      ))}

      <style>{`
        .cmp {
          display: grid;
          gap: var(--space-4);
          grid-template-columns: 1fr;
        }
        @media (min-width: 900px) {
          .cmp { grid-template-columns: repeat(3, 1fr); }
        }

        .cmp-card {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border);
          background: var(--bg-raised);
        }
        /* The winning card is raised rather than merely coloured — depth carries hierarchy
           where a colour swap alone would just look decorative. */
        .cmp-card.is-right {
          border-color: var(--accent);
          background: var(--bg-raised);
          box-shadow: var(--shadow-lg);
        }

        .cmp-how {
          font-size: var(--text-xs);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }
        .cmp-head h3 { font-size: var(--text-lg); margin-top: var(--space-1); }

        .cmp-io {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-4);
          border-radius: var(--radius);
          background: var(--bg-sunken);
          flex-wrap: wrap;
        }
        .cmp-input-group {
          display: flex; flex-wrap: wrap; gap: 5px; align-items: center; padding-top: 3px;
          max-width: 150px;
        }
        .cmp-input {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: var(--text-xs);
          background: var(--bg-raised);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 3px 7px;
          color: var(--text-muted);
        }
        .cmp-arrow { color: var(--text-subtle); padding-top: 2px; }
        .cmp-results { display: flex; flex-direction: column; gap: var(--space-1); }
        .cmp-result { font-size: var(--text-xl); line-height: 1.5; }

        .is-wrong .cmp-result { color: var(--danger); text-decoration: line-through;
                                text-decoration-thickness: 1px; opacity: 0.85; }
        .is-learn .cmp-result,
        .is-right .cmp-result { color: var(--accent); }

        .cmp-more { font-size: var(--text-xs); color: var(--text-subtle); }

        .cmp-note {
          font-size: var(--text-sm);
          color: var(--text-muted);
          margin: 0;
          flex: 1;
        }

        .cmp-badge {
          align-self: flex-start;
          font-size: var(--text-xs);
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 5px 11px;
          border-radius: var(--radius-full);
        }
        /* Never colour alone: each badge states its meaning in words too. */
        .cmp-badge.wrong { background: var(--danger-bg); color: var(--danger); }
        .cmp-badge.learn { background: var(--bg-sunken); color: var(--text-muted); }
        .cmp-badge.right { background: var(--accent); color: var(--text-on-accent); }
      `}</style>
    </div>
  );
}
