"use client";
import { useEffect, useRef } from "react";

const W0 = 1280, H0 = 832;

/**
 * The design is a fixed 1280x832 canvas. It is scaled to fit the window, and the canvas itself grows
 * to the window's shape so there are no empty bars at the edges: the 1280x832 frame sits in the middle,
 * and edge-to-edge pieces (sidebar, wave art) stretch out using these CSS variables, in canvas pixels:
 *   --dx / --dy  extra space on each side of the frame (left/right, top/bottom)
 *   --sc         how much bigger the canvas is than 1280x832 (the larger of width and height ratios)
 */
export function Stage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const k = Math.min(innerWidth / W0, innerHeight / H0);
      const W = innerWidth / k, H = innerHeight / k; // one of these equals the design size, the other is larger
      const s = el.style;
      s.width = `${W}px`;
      s.height = `${H}px`;
      s.transform = `translate(-50%,-50%) scale(${k})`;
      s.setProperty("--dx", `${(W - W0) / 2}px`);
      s.setProperty("--dy", `${(H - H0) / 2}px`);
      s.setProperty("--sc", String(Math.max(W / W0, H / H0)));
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return (
    <div className="shell">
      <div className="stage" ref={ref}>
        <div className="frame">{children}</div>
      </div>
    </div>
  );
}
