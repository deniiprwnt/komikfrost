"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

/**
 * Samakan bar sistem (status bar iOS standalone + theme-color browser)
 * dengan tema aplikasi — bukan tema OS. Dipanggil tiap tema dibaca/diubah.
 * iOS 26+: bar transparan di atas konten — dark pakai black-translucent
 * (teks putih), light pakai default (teks hitam).
 */
function syncMeta(theme: Theme) {
  const setMeta = (name: string, content: string) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };
  setMeta(
    "apple-mobile-web-app-status-bar-style",
    theme === "dark" ? "black-translucent" : "default",
  );
  setMeta("theme-color", theme === "dark" ? "#0c1114" : "#eef2f3");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("bk-theme") as Theme | null;
    const initial: Theme = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    syncMeta(initial);
  }, []);

  const toggle = () => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      localStorage.setItem("bk-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      syncMeta(next);
      return next;
    });
  };

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
