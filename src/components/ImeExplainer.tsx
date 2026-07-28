import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

/**
 * Expands "IME" into "Input Method Editor" and collapses it back.
 *
 * The brand demotes IME to a subordinate mark because it's jargon — a Marathi journalist has
 * no idea what an Input Method Editor is, while a developer does. This teaches the term and
 * justifies the demotion in one gesture, rather than leaving three unexplained letters in the
 * logo.
 *
 * Loops while in view. This is one of the few places a repeating animation earns its keep:
 * the expand/collapse IS the explanation, and someone arriving mid-cycle would otherwise see
 * three unexplained letters. It pauses when scrolled away so it isn't burning frames
 * off-screen, and holds expanded permanently under reduced motion.
 */

const PARTS = [
  { letter: "I", rest: "nput" },
  { letter: "M", rest: "ethod" },
  { letter: "E", rest: "ditor" },
];

export default function ImeExplainer() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "-15% 0px" });
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion: show the expanded form immediately and never collapse it. The
    // information is the point; the movement is decoration.
    if (reduced) { setExpanded(true); return; }

    // 3s expanded, 1.6s collapsed — long enough to read the words, short enough that the
    // collapsed "IME" state doesn't feel like the animation has stopped.
    let expandedNow = false;
    const tick = () => { expandedNow = !expandedNow; setExpanded(expandedNow); };
    const first = setTimeout(tick, 250);
    const loop = setInterval(tick, 2300);
    return () => { clearTimeout(first); clearInterval(loop); };
  }, [inView, reduced]);

  return (
    <div ref={ref} className="ime-explainer">
      <p className="ime-line" aria-hidden="true">
        {PARTS.map(({ letter, rest }, i) => (
          <span className="ime-part" key={letter}>
            <span className="ime-letter">{letter}</span>
            <motion.span
              className="ime-rest"
              initial={false}
              animate={{
                width: expanded ? "auto" : 0,
                opacity: expanded ? 1 : 0,
              }}
              transition={{
                duration: reduced ? 0 : 0.42,
                delay: reduced ? 0 : (expanded ? i * 0.09 : (2 - i) * 0.05),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {rest}
            </motion.span>
            {i < PARTS.length - 1 && <span className="ime-space">&nbsp;</span>}
          </span>
        ))}
      </p>

      {/* The animation is decorative; screen readers get the fact directly. */}
      <p className="sr-only">IME stands for Input Method Editor.</p>

      <p className="ime-caption muted">
        An <strong>Input Method Editor</strong> is the piece of macOS that turns what you type
        into the characters you want. It's how every language with more letters than keys
        works — Japanese, Chinese, Korean, and now Marathi.
      </p>

      <style>{`
        .ime-explainer { text-align: center; }
        .ime-line {
          font-family: "Inknut Antiqua", Georgia, serif;
          font-size: clamp(1.6rem, 5vw, var(--text-3xl));
          line-height: 1.25;
          margin: 0 auto var(--space-6);
          max-width: none;
          color: var(--text);
          white-space: nowrap;
        }
        .ime-part { display: inline-flex; align-items: baseline; }
        .ime-letter { color: var(--accent); font-weight: 600; }
        .ime-rest {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          vertical-align: baseline;
        }
        .ime-space { display: inline-block; width: 0.28em; }
        .ime-caption { margin: 0 auto; max-width: 54ch; }
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </div>
  );
}
