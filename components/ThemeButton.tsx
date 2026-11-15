"use client";
import { Icon } from "./Icon";

// Gear button: switches between dark (default) and light. Remembered per browser.
export function ThemeButton() {
  function toggle() {
    const d = document.documentElement;
    const light = d.dataset.theme === "light"; // dark unless the user picked light
    d.dataset.theme = light ? "dark" : "light";
    try { localStorage.setItem("pinbox-theme-v2", d.dataset.theme); } catch {}
  }
  return (
    <button className="tool" style={{ left: 26 }} onClick={toggle} title="Settings: switch theme" aria-label="Switch theme">
      <Icon name="gear" />
    </button>
  );
}
