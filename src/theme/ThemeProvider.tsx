import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { applyTheme } from "./applyTheme";
import {
  DEFAULT_THEME_SETTINGS,
  EMPTY_ROTATION,
  dateKey,
  resolveTheme,
  surprise,
  type ResolveContext,
  type RotationState,
  type ThemeReason,
  type ThemeSettings,
  type Mood,
} from "./engine";
import { DEFAULT_THEME_ID, THEMES, getTheme, isThemeId, type AnyThemeId, type ThemeDef } from "./themes";
import { buildCustomTheme, cleanCustomThemes, isCustomThemeList, type CustomTheme } from "./custom";
import { subscribeWallpapers, wallpaperUrls } from "./wallpapers";
import { readPref, writePref } from "../lib/storage";

interface ThemeContextValue {
  /** Thème affiché. */
  theme: ThemeDef;
  themes: readonly ThemeDef[];
  /** Pourquoi ce thème est affiché (règle du moteur). */
  reason: ThemeReason;
  settings: ThemeSettings;
  /** Modifie les réglages ; le thème « gardé pour aujourd'hui » est alors oublié, pour que
   *  le nouveau réglage se voie tout de suite. */
  updateSettings: (update: (current: ThemeSettings) => ThemeSettings) => void;
  rotationHistory: RotationState["history"];
  /** Choisit le thème préféré et l'affiche tout de suite. */
  setThemeId: (id: AnyThemeId) => void;
  /** Thèmes personnels (éditeur de thème). */
  customThemes: readonly CustomTheme[];
  /** Ajoute ou remplace un thème personnel. */
  saveCustomTheme: (theme: CustomTheme) => void;
  /** Retire un thème personnel ; s'il était le thème préféré, son thème de départ le remplace. */
  removeCustomTheme: (id: string) => void;
  /** Aperçu en direct (éditeur de thème) ; nul pour revenir au thème choisi. */
  previewTheme: (theme: ThemeDef | null) => void;
  /** « Garder ce thème aujourd'hui ». */
  keepToday: () => void;
  /** Revient au thème préféré pour aujourd'hui. */
  backToPreferred: () => void;
  /** « Surprends-moi » : un autre thème, au hasard. */
  surpriseMe: () => void;
  /** Humeur du jour saisie dans le Journal (gardée en mémoire seulement). */
  setMood: (mood: Mood | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Identifiant de ce lancement d'Aqueli (rotation « à chaque ouverture »). */
const LAUNCH_ID = Date.now().toString(36);
const CUSTOM_PREF = "themesPerso";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Réglages enregistrés, complétés par les valeurs par défaut (ajouts des versions futures). */
function loadSettings(): ThemeSettings {
  const saved = readPref<Record<string, unknown> | null>("reglagesTheme", null, (v): v is Record<string, unknown> =>
    isObject(v),
  );
  if (!saved) {
    // Première utilisation du moteur : on reprend le thème choisi aux étapes précédentes.
    return { ...structuredClone(DEFAULT_THEME_SETTINGS), fixed: readPref("theme", DEFAULT_THEME_ID, isThemeId) };
  }
  const d = DEFAULT_THEME_SETTINGS;
  const s = saved as Partial<ThemeSettings>;
  const weekdays = Array.isArray(s.planning?.weekdays) ? s.planning.weekdays.slice(0, 7) : d.planning.weekdays;
  return {
    fixed: typeof s.fixed === "string" ? s.fixed : d.fixed,
    auto: { ...d.auto, ...(isObject(s.auto) ? s.auto : {}) },
    rotation: { ...d.rotation, ...(isObject(s.rotation) ? s.rotation : {}) },
    planning: {
      ...d.planning,
      ...(isObject(s.planning) ? s.planning : {}),
      weekdays: [...weekdays, ...d.planning.weekdays].slice(0, 7),
      periods: Array.isArray(s.planning?.periods) ? s.planning.periods : [],
    },
    forcedToday: isObject(s.forcedToday) ? (s.forcedToday as ThemeSettings["forcedToday"]) : null,
  };
}

function isRotation(value: unknown): value is RotationState {
  return isObject(value) && Array.isArray(value.history);
}

function isEditing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
}

function motionReduced(): boolean {
  return document.documentElement.dataset.reduceMotion === "true";
}

function useWindowsDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings);
  const [rotation, setRotation] = useState<RotationState>(() =>
    readPref("rotationTheme", EMPTY_ROTATION, isRotation),
  );
  const windowsDark = useWindowsDark();
  const [mood, setMood] = useState<Mood | null>(null);
  const [minute, setMinute] = useState(0);
  const [custom, setCustom] = useState<CustomTheme[]>(() => cleanCustomThemes(readPref(CUSTOM_PREF, [], isCustomThemeList)));
  const [preview, setPreview] = useState<ThemeDef | null>(null);
  const urls = useSyncExternalStore(subscribeWallpapers, wallpaperUrls);
  const customDefs = useMemo(() => custom.map((c) => buildCustomTheme(c, urls.get(c.id) ?? null)), [custom, urls]);
  const allThemes = useMemo(() => [...customDefs, ...THEMES], [customDefs]);
  const available = useMemo(() => allThemes.map((t) => ({ id: t.id, dark: t.dark })), [allThemes]);
  const known = useCallback((id: string): id is AnyThemeId => isThemeId(id) || custom.some((c) => c.id === id), [custom]);
  useEffect(() => writePref(CUSTOM_PREF, custom), [custom]);
  // Un changement demandé par la personne s'applique tout de suite, même pendant une saisie.
  const userChange = useRef(false);

  const context = useCallback(
    (rot: RotationState): ResolveContext => ({
      now: new Date(),
      available,
      windowsDark,
      mood,
      rotation: rot,
      launchId: LAUNCH_ID,
      random: Math.random,
    }),
    [windowsDark, mood, available],
  );

  const resolution = useMemo(() => resolveTheme(settings, context(rotation)), [settings, rotation, context, minute]);
  const [appliedId, setAppliedId] = useState<AnyThemeId>(() => (known(resolution.theme) ? resolution.theme : DEFAULT_THEME_ID));

  // Le moteur est réévalué chaque minute (nuit, fêtes, planning…).
  useEffect(() => {
    const timer = window.setInterval(() => setMinute((m) => m + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Un nouveau tirage de rotation est retenu d'une ouverture à l'autre.
  useEffect(() => {
    if (resolution.rotation !== rotation) setRotation(resolution.rotation);
  }, [resolution.rotation, rotation]);

  useEffect(() => writePref("rotationTheme", rotation), [rotation]);
  useEffect(() => writePref("reglagesTheme", settings), [settings]);

  // Applique le thème décidé, avec un fondu de 0,4 s ; jamais au milieu d'une saisie.
  useEffect(() => {
    const target = resolution.theme;
    if (!known(target) || target === appliedId) return;
    if (!userChange.current && isEditing()) return; // réessayé à la prochaine réévaluation
    userChange.current = false;
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      flushSync(() => setAppliedId(target));
    };
    const canFade =
      !motionReduced() && document.visibilityState === "visible" && typeof document.startViewTransition === "function";
    if (!canFade) {
      // Sans fondu, le changement suit simplement le rendu (flushSync est réservé au fondu).
      applied = true;
      setAppliedId(target);
      return;
    }
    const transition = document.startViewTransition(apply);
    // Fondu abandonné (fenêtre masquée, autre changement de thème) : rien à signaler.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
    // Fenêtre réduite ou masquée : le fondu ne démarre jamais, on applique sans lui.
    window.setTimeout(() => {
      if (!applied) {
        transition.skipTransition();
        apply();
      }
    }, 300);
  }, [resolution.theme, appliedId, known]);

  // L'aperçu de l'éditeur l'emporte, le temps de régler le thème.
  const theme = preview ?? customDefs.find((t) => t.id === appliedId) ?? getTheme(appliedId);
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const changeSettings = useCallback((update: (current: ThemeSettings) => ThemeSettings) => {
    userChange.current = true;
    setSettings((current) => update(structuredClone(current)));
  }, []);

  const updateSettings = useCallback(
    (update: (current: ThemeSettings) => ThemeSettings) =>
      changeSettings((s) => ({ ...update(s), forcedToday: null })),
    [changeSettings],
  );

  const setThemeId = useCallback(
    (id: AnyThemeId) => {
      changeSettings((s) => {
        s.fixed = id;
        s.forcedToday = null;
        // Si une règle prioritaire afficherait un autre thème, on garde celui-ci pour aujourd'hui.
        if (resolveTheme(s, context(rotation)).theme !== id) {
          s.forcedToday = { date: dateKey(new Date()), theme: id };
        }
        return s;
      });
    },
    [changeSettings, context, rotation],
  );

  const keepToday = useCallback(() => {
    changeSettings((s) => ({ ...s, forcedToday: { date: dateKey(new Date()), theme: appliedId } }));
  }, [changeSettings, appliedId]);

  const backToPreferred = useCallback(() => {
    changeSettings((s) => {
      // Sans règle prioritaire, il suffit d'oublier le thème gardé pour aujourd'hui.
      const unforced = { ...s, forcedToday: null };
      const shown = resolveTheme(unforced, context(rotation)).theme;
      return shown === s.fixed ? unforced : { ...s, forcedToday: { date: dateKey(new Date()), theme: s.fixed } };
    });
  }, [changeSettings, context, rotation]);

  const surpriseMe = useCallback(() => {
    const next = surprise(settings, context(rotation), appliedId);
    const picked = next.theme;
    if (!picked) return;
    userChange.current = true;
    if (settings.rotation.enabled) setRotation(next);
    // Une règle prioritaire l'emporterait : le tirage est gardé pour aujourd'hui.
    const wouldShow = resolveTheme(
      { ...settings, forcedToday: null },
      context(settings.rotation.enabled ? next : rotation),
    ).theme;
    if (wouldShow !== picked) {
      setSettings((s) => ({ ...s, forcedToday: { date: dateKey(new Date()), theme: picked } }));
    } else if (settings.forcedToday) {
      setSettings((s) => ({ ...s, forcedToday: null }));
    }
  }, [settings, context, rotation, appliedId]);

  const saveCustomTheme = useCallback((c: CustomTheme) => {
    userChange.current = true;
    setCustom((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
  }, []);

  const removeCustomTheme = useCallback(
    (id: string) => {
      const gone = custom.find((c) => c.id === id);
      if (!gone) return;
      setCustom((list) => list.filter((c) => c.id !== id));
      if (settings.fixed === id || appliedId === id) setThemeId(gone.base);
    },
    [custom, settings.fixed, appliedId, setThemeId],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themes: allThemes,
      reason: resolution.reason,
      settings,
      updateSettings,
      rotationHistory: rotation.history,
      setThemeId,
      keepToday,
      backToPreferred,
      surpriseMe,
      setMood,
      customThemes: custom,
      saveCustomTheme,
      removeCustomTheme,
      previewTheme: setPreview,
    }),
    [
      theme,
      allThemes,
      custom,
      saveCustomTheme,
      removeCustomTheme,
      resolution.reason,
      settings,
      updateSettings,
      rotation.history,
      setThemeId,
      keepToday,
      backToPreferred,
      surpriseMe,
    ],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé dans ThemeProvider");
  return ctx;
}
