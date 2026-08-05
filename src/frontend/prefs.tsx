"use client";

/**
 * Theme / density / motion preferences.
 *
 * These live on <html> as data attributes rather than in React state alone,
 * because globals.css keys off them (`[data-theme="dark"]`, `[data-density]`,
 * `[data-reduce-motion]`). The inline script in layout.tsx applies the stored
 * values before first paint so there is no flash of the wrong theme.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";
export type Density = "compact" | "default" | "roomy";

const KEY = "aurora.prefs";

interface Prefs {
  theme: Theme;
  density: Density;
  reduceMotion: boolean;
}

const DEFAULTS: Prefs = { theme: "light", density: "default", reduceMotion: false };

interface PrefsCtx extends Prefs {
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setDensity: (d: Density) => void;
  setReduceMotion: (v: boolean) => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

/** Applied both here and by the pre-paint script — keep the two in sync. */
function apply(p: Prefs) {
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.dataset.density = p.density;
  el.dataset.reduceMotion = String(p.reduceMotion);
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  // Read what the pre-paint script already applied, so React's view matches
  // the DOM instead of fighting it on hydration.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
      else {
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setPrefs({ ...DEFAULTS, theme: dark ? "dark" : "light" });
      }
    } catch {
      /* storage blocked — defaults are fine */
    }
  }, []);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <Ctx.Provider
      value={{
        ...prefs,
        setTheme: (theme) => update({ theme }),
        toggleTheme: () => update({ theme: prefs.theme === "dark" ? "light" : "dark" }),
        setDensity: (density) => update({ density }),
        setReduceMotion: (reduceMotion) => update({ reduceMotion }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs must be used inside <PrefsProvider>");
  return ctx;
}

/**
 * Runs before first paint. Inlined in <head> — deliberately terse, and
 * deliberately not importing anything.
 */
export const PREFS_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,r=localStorage.getItem(${JSON.stringify(KEY)}),p=r?JSON.parse(r):null;
var t=p&&p.theme?p.theme:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
d.dataset.theme=t;d.dataset.density=(p&&p.density)||'default';d.dataset.reduceMotion=String(!!(p&&p.reduceMotion));
}catch(e){document.documentElement.dataset.theme='light';}})();`;
