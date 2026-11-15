"use client";
import { useEffect, useRef } from "react";

// The design is a fixed 1280x832 canvas. Scale it to fit the window, like the preview does.
export function Stage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const k = Math.min(innerWidth / 1280, innerHeight / 832);
      if (ref.current) ref.current.style.transform = `translate(-50%,-50%) scale(${k})`;
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return (
    <div className="shell">
      <div className="stage" ref={ref}>{children}</div>
    </div>
  );
}
