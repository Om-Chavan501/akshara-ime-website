import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-triggered reveal. One component so every section shares the same rhythm — the UX
 * guidance is explicit that unified duration/easing tokens are what make motion feel
 * designed rather than assembled.
 *
 * Deliberately restrained. "Animate 1–2 key elements per view maximum" is a High-severity
 * rule, so this reveals a *section* as one unit (or staggers a small group), rather than
 * animating every element it contains. Everything that moves does so once, on entry, and
 * never loops: continuous animation is for loading indicators, not decoration.
 *
 * Values come from the design-system motion spec: 0.16/1/0.3/1 expo-out, ~400ms, y:16,
 * scale from 0.98, stagger 60ms.
 */

interface Props {
  children: ReactNode;
  /** Stagger index — for revealing a row of cards in sequence. */
  index?: number;
  /** Slight upward drift. Off for elements where movement would fight a sticky header. */
  y?: number;
  className?: string;
  /** Astro passes `class` verbatim to framework islands rather than renaming it to
      `className` — unlike a plain HTML tag, a component prop isn't auto-translated. Every
      call site in this project writes `class=`, so both are accepted here rather than
      leaving a silent no-op trap where the class is dropped. */
  class?: string;
  as?: "div" | "section" | "li" | "article";
}

export default function Reveal({
  children,
  index = 0,
  y = 16,
  className,
  class: classProp,
  as = "div",
}: Props) {
  const reduced = useReducedMotion();
  const cls = className ?? classProp ?? "";

  // Reduced motion means *no* transform and no delay — not a faster animation. Someone who
  // gets motion sick from a 400ms slide gets motion sick from a 100ms one.
  if (reduced) return <div className={cls}>{children}</div>;

  const MotionTag = motion[as];

  return (
    <MotionTag
      className={cls}
      initial={{ opacity: 0, y, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      /* once: true — a section that re-animates every time you scroll past is an irritant,
         and it has nothing new to say the second time. */
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{
        duration: 0.42,
        delay: index * 0.06,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </MotionTag>
  );
}
