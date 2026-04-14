import { useEffect, useState } from "react";

/**
 * Returns a value [0..1] representing how far the user has scrolled
 * relative to `distance` px. Throttled via requestAnimationFrame.
 */
export function useScrollProgress(distance: number): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    function update() {
      const p = Math.min(1, Math.max(0, window.scrollY / distance));
      setProgress(p);
      raf = 0;
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [distance]);

  return progress;
}
