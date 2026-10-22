import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { COMMANDS, comboText, isCombo, resolveShortcuts, setActiveShortcuts, type CommandId, type Combo } from "../app/shortcuts";
import { readPref, writePref } from "../lib/storage";
import { inTauri } from "../lib/windowControls";
import { isModuleKey, type ModuleKey } from "../modules/modules";
import { avatarById } from "../accounts/avatars";

/** Tailles du texte proposées, en pourcentage de la taille normale (14 px). */
export const TEXT_SCALES = [90, 100, 115, 130] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Options d'accessibilité (elles suivent aussi les réglages de Windows) et modules affichés. */
export interface Preferences {
  reduceMotion: boolean;
  reduceTransparency: boolean;
  /** Contraste élevé : texte franc, contours marqués, surfaces opaques. */
  highContrast: boolean;
  textScale: TextScale;
  /** Modules masqués dans la barre latérale et la palette. */
  hiddenModules: ModuleKey[];
  /** Raccourcis choisis dans Paramètres › Clavier (les autres gardent leur valeur d'origine). */
  shortcuts: Partial<Record<CommandId, Combo>>;
  /** Mode discret : contenu des fenêtres exclu des captures et des partages d'écran (lu aussi par le cœur). */
  discreetMode: boolean;
  /**
   * Prénom choisi pour l'écran de verrouillage et l'Accueil (vide : aucun). Il doit se lire avant
   * le déverrouillage : c'est la seule donnée de la personne rangée hors de la base chiffrée, et
   * seulement si elle le saisit.
   */
  displayName: string;
  /** Image de profil du compte, choisie dans la banque d'images (src/accounts/avatars.ts ; vide : l'initiale). */
  avatar: string;
}

/** Longueur maximale du prénom affiché. */
export const MAX_DISPLAY_NAME = 40;

/** Prénom affiché nettoyé : espaces superflus retirés, longueur limitée. */
export const cleanDisplayName = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, MAX_DISPLAY_NAME);

const DEFAULTS: Preferences = {
  reduceMotion: false,
  reduceTransparency: false,
  highContrast: false,
  textScale: 100,
  hiddenModules: [],
  shortcuts: {},
  discreetMode: false,
  displayName: "",
  avatar: "",
};

/** Raccourcis enregistrés, sans les valeurs inconnues ou mal formées. */
function loadShortcuts(saved: unknown): Partial<Record<CommandId, Combo>> {
  if (!isObject(saved)) return {};
  const out: Partial<Record<CommandId, Combo>> = {};
  for (const c of COMMANDS) {
    const value = saved[c.id];
    if (isCombo(value)) out[c.id] = { ctrl: value.ctrl, alt: value.alt, shift: value.shift, key: value.key };
  }
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Préférences enregistrées, complétées par les valeurs par défaut (options ajoutées depuis). */
function loadPreferences(): Preferences {
  const saved = readPref<Record<string, unknown>>("preferences", {}, isObject);
  return {
    reduceMotion: typeof saved.reduceMotion === "boolean" ? saved.reduceMotion : DEFAULTS.reduceMotion,
    reduceTransparency:
      typeof saved.reduceTransparency === "boolean" ? saved.reduceTransparency : DEFAULTS.reduceTransparency,
    highContrast: typeof saved.highContrast === "boolean" ? saved.highContrast : DEFAULTS.highContrast,
    textScale: TEXT_SCALES.includes(saved.textScale as TextScale) ? (saved.textScale as TextScale) : DEFAULTS.textScale,
    hiddenModules: Array.isArray(saved.hiddenModules)
      ? saved.hiddenModules.filter(isModuleKey).filter((k) => k !== "accueil")
      : DEFAULTS.hiddenModules,
    shortcuts: loadShortcuts(saved.shortcuts),
    discreetMode: typeof saved.discreetMode === "boolean" ? saved.discreetMode : DEFAULTS.discreetMode,
    displayName: typeof saved.displayName === "string" ? cleanDisplayName(saved.displayName) : DEFAULTS.displayName,
    avatar: typeof saved.avatar === "string" && avatarById(saved.avatar) ? saved.avatar : DEFAULTS.avatar,
  };
}

function initialPreferences(): Preferences {
  const prefs = loadPreferences();
  setActiveShortcuts(resolveShortcuts(prefs.shortcuts));
  return prefs;
}

interface PreferencesContextValue {
  prefs: Preferences;
  /** Ce que Windows demande déjà (animations ou transparence réduites). */
  system: Pick<Preferences, "reduceMotion" | "reduceTransparency" | "highContrast">;
  /** Réglage réellement appliqué : le vôtre ou celui de Windows. */
  effective: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(initialPreferences);
  const systemMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const systemTransparency = useMediaQuery("(prefers-reduced-transparency: reduce)");
  // Thème à contraste de Windows (Paramètres › Accessibilité › Thèmes de contraste).
  const systemContrast = useMediaQuery("(prefers-contrast: more)");

  const system = useMemo(
    () => ({ reduceMotion: systemMotion, reduceTransparency: systemTransparency, highContrast: systemContrast }),
    [systemMotion, systemTransparency, systemContrast],
  );
  const effective = useMemo(
    () => ({
      reduceMotion: prefs.reduceMotion || system.reduceMotion,
      // Le contraste élevé rend aussi les surfaces opaques.
      reduceTransparency: prefs.reduceTransparency || system.reduceTransparency || prefs.highContrast || system.highContrast,
      highContrast: prefs.highContrast || system.highContrast,
      textScale: prefs.textScale,
      hiddenModules: prefs.hiddenModules,
      shortcuts: prefs.shortcuts,
      discreetMode: prefs.discreetMode,
      displayName: prefs.displayName,
      avatar: prefs.avatar,
    }),
    [prefs, system],
  );

  // Raccourcis en vigueur pour les touches de la fenêtre et les menus.
  useLayoutEffect(() => {
    setActiveShortcuts(resolveShortcuts(prefs.shortcuts));
  }, [prefs.shortcuts]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.reduceMotion = String(effective.reduceMotion);
    root.dataset.reduceTransparency = String(effective.reduceTransparency);
    root.dataset.highContrast = String(effective.highContrast);
  }, [effective]);

  // Mode discret : le cœur l'applique à toutes les fenêtres (et dès le démarrage suivant).
  useEffect(() => {
    if (inTauri) void invoke("discreet_set", { enabled: prefs.discreetMode }).catch(() => {});
  }, [prefs.discreetMode]);

  // Taille du texte : zoom de toute la fenêtre, comme Ctrl + molette.
  useEffect(() => {
    if (inTauri) void getCurrentWebview().setZoom(prefs.textScale / 100).catch(() => {});
  }, [prefs.textScale]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      prefs,
      system,
      effective,
      setPref: (key, v) =>
        setPrefs((current) => {
          const next = { ...current, [key]: v };
          writePref("preferences", next);
          // Tout de suite, pour les menus et libellés lus pendant le prochain affichage.
          if (key === "shortcuts") setActiveShortcuts(resolveShortcuts(next.shortcuts));
          return next;
        }),
    }),
    [prefs, system, effective],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences doit être utilisé dans PreferencesProvider");
  return ctx;
}

/** Raccourci en vigueur d'une commande, mis à jour dès qu'il change : « Ctrl+K ». */
export function useShortcut(id: CommandId, separator = "+"): string {
  const { prefs } = usePreferences();
  return comboText(resolveShortcuts(prefs.shortcuts)[id], separator);
}
