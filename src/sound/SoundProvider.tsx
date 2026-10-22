import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readPref, writePref } from "../lib/storage";
import { isConcentrating } from "../focus/focusStore";
import { useTheme } from "../theme/ThemeProvider";
import { DEFAULT_SOUND_PREFS, isSoundPrefs, paletteFor, shouldPlay, soundEngine, type SoundName, type SoundPrefs } from "./sounds";

interface SoundContextValue {
  prefs: SoundPrefs;
  setPrefs: (update: (current: SoundPrefs) => SoundPrefs) => void;
  /** Joue un son si les réglages le permettent ; silence pendant une séance de Focus, sauf `inFocus`. */
  play: (name: SoundName, options?: { inFocus?: boolean }) => void;
  /** Joue un son pour l'essayer, même si sa catégorie est coupée. */
  preview: (name: SoundName) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

/** Éléments dont un clic fait entendre le petit son d'interface. */
const CLICKABLE = 'button, [role="tab"], [role="switch"], [role="option"], [role="menuitem"], [role="menuitemradio"]';

export function SoundProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [prefs, setPrefsState] = useState<SoundPrefs>(() => {
    const saved = readPref("sons", DEFAULT_SOUND_PREFS, isSoundPrefs);
    return { ...saved, categories: { ...DEFAULT_SOUND_PREFS.categories, ...saved.categories } };
  });

  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  // Un thème personnel emprunte les sons d'un des 20 thèmes.
  const themeRef = useRef<string>(theme.sounds ?? theme.id);
  themeRef.current = theme.sounds ?? theme.id;

  const play = useCallback((name: SoundName, options?: { inFocus?: boolean }) => {
    const p = prefsRef.current;
    if (isConcentrating() && !options?.inFocus) return;
    if (shouldPlay(p, name)) soundEngine.play(name, paletteFor(themeRef.current), p.volume);
  }, []);

  const preview = useCallback((name: SoundName) => {
    soundEngine.play(name, paletteFor(themeRef.current), prefsRef.current.volume || DEFAULT_SOUND_PREFS.volume);
  }, []);

  const setPrefs = useCallback((update: (current: SoundPrefs) => SoundPrefs) => {
    setPrefsState((current) => {
      const next = update(structuredClone(current));
      writePref("sons", next);
      return next;
    });
  }, []);

  // Son d'interface discret sur les boutons, onglets et interrupteurs.
  useEffect(() => {
    let last = 0;
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target.closest(CLICKABLE) : null;
      if (!target || target.closest("[data-sans-son]") || (target as HTMLButtonElement).disabled) return;
      const now = performance.now();
      if (now - last < 60) return;
      last = now;
      play("clic");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [play]);

  const value = useMemo(() => ({ prefs, setPrefs, play, preview }), [prefs, setPrefs, play, preview]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error("useSound doit être utilisé dans SoundProvider");
  return ctx;
}
