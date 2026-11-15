"use client";
import { Icon } from "./Icon";

// Moon button: switches between dark (default) and light. Filled while dark is on. Remembered per browser.
export function ThemeButton() {
  function toggle() {
    const d = document.documentElement;
    const light = d.dataset.theme === "light"; // dark unless the user picked light
    d.dataset.theme = light ? "dark" : "light";
    try { localStorage.setItem("pinbox-theme-v2", d.dataset.theme); } catch {}
  }
  return (
    <button className="tool theme-btn" style={{ left: 26 }} onClick={toggle} title="Switch light / dark mode" aria-label="Switch light or dark mode">
      <Icon name="moon" />
    </button>
  );
}
