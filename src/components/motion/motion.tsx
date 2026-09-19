"use client";

import { AnimatePresence, motion, MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export const motionTokens = {
  fast: { duration: 0.14 },
  normal: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  slow: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
  spring: { type: "spring", stiffness: 420, damping: 34, mass: 0.7 } as const,
};

export { AnimatePresence, motion, MotionConfig, useReducedMotion };

export function MosaicMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={motionTokens.normal}>{children}</MotionConfig>;
}

/** A short, non-blocking route cue. It intentionally does not animate an exit. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  return <motion.div key={routeKey} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.normal}>
    {children}
  </motion.div>;
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reducedMotion = useReducedMotion();
  return <motion.div className={className} initial={reducedMotion ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ ...motionTokens.normal, delay }}>
    {children}
  </motion.div>;
}
