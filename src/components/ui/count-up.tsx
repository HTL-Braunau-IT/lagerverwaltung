"use client";

import * as React from "react";

type CountUpProps = {
  value: number;
  locale?: string;
  durationMs?: number;
  className?: string;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function CountUp({ value, locale = "de-AT", durationMs = 650, className }: CountUpProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const rootRef = React.useRef<HTMLSpanElement | null>(null);

  // Keep SSR/initial client render stable: show the final value as fallback.
  const formattedFinal = React.useMemo(
    () => value.toLocaleString(locale),
    [locale, value],
  );

  const [isClient, setIsClient] = React.useState(false);
  const [hasStarted, setHasStarted] = React.useState(false);
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => setIsClient(true), []);

  React.useEffect(() => {
    if (!isClient) return;
    if (prefersReducedMotion) return;
    if (hasStarted) return;

    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;

        setHasStarted(true);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasStarted, isClient, prefersReducedMotion]);

  React.useEffect(() => {
    if (!isClient) return;
    if (prefersReducedMotion) return;
    if (!hasStarted) return;

    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    setCurrent(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, hasStarted, isClient, prefersReducedMotion, value]);

  const formattedCurrent = React.useMemo(
    () => current.toLocaleString(locale),
    [current, locale],
  );

  if (!isClient || prefersReducedMotion) {
    return (
      <span ref={rootRef} className={className}>
        {formattedFinal}
      </span>
    );
  }

  return (
    <span ref={rootRef} className={className} suppressHydrationWarning>
      <span className={hasStarted ? "hidden" : ""}>{formattedFinal}</span>
      <span className={hasStarted ? "" : "hidden"}>{formattedCurrent}</span>
    </span>
  );
}

