import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** True when the user asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Becomes true once the element has scrolled into view, and stays true. */
export function useInView<T extends Element>(threshold = 0.25, rootMargin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold, rootMargin]);
  return [ref, inView] as const;
}

/** Fades and lifts its children in once they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "section" }) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <Tag ref={ref as never} className={`reveal ${inView ? "is-in" : ""} ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number from `from` to `to` once `start` is true. Tabular figures
 * keep the width steady while it runs; reduced-motion users get the final value.
 */
export function CountUp({
  to,
  from = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1100,
  delay = 0,
  start = true,
}: {
  to: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  start?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(reduced ? to : from);
  useEffect(() => {
    if (!start || reduced) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      setValue(from + (to - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, reduced, from, to, duration, delay]);
  // Before it starts, hold the space with the final value but keep it invisible,
  // so a reader never sees a misleading 0 in place of a real figure.
  return (
    <span className={`nums ${!start && !reduced ? "opacity-0" : ""}`}>
      {prefix}
      {(start || reduced ? value : to).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** A number that counts up the first time it scrolls into view. */
export function CountUpInView(props: Omit<Parameters<typeof CountUp>[0], "start">) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.1, "0px");
  return (
    <span ref={ref}>
      <CountUp {...props} start={inView} />
    </span>
  );
}

/** A check mark whose stroke draws itself after `delay` ms. */
export function DrawnCheck({ className = "h-3.5 w-3.5", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" pathLength={1} className="draw" style={{ "--d": `${delay}ms` } as CSSProperties} />
    </svg>
  );
}
