/**
 * Moteur de thèmes : décide quel thème afficher maintenant.
 *
 * Priorité (docs/reference-projet.md) : thème choisi pour aujourd'hui > planning manuel >
 * fêtes > humeur > nuit > mode sombre de Windows > rotation aléatoire ou saison > thème préféré.
 * Une règle qui désigne un thème pas encore disponible est simplement ignorée.
 * Fonctions pures, sans horloge ni hasard cachés : tout arrive par `ctx`.
 */
import { isoWeek } from "../lib/dates";
import { tr } from "../i18n/i18n";
/** Identifiant de thème, y compris ceux qui ne sont pas encore disponibles (« noel », « zen »…). */
export type ThemeKey = string;

export type RotationFrequency = "ouverture" | "jour" | "semaine" | "mois";
export type RotationPool = "tous" | "clairs" | "sombres" | "selection";
export type Mood = "calme" | "motive" | "fatigue";

export interface ThemePeriod {
  id: string;
  /** « AAAA-MM-JJ », bornes incluses. */
  start: string;
  end: string;
  theme: ThemeKey;
}

export interface ThemeSettings {
  /** Thème préféré (mode fixe). */
  fixed: ThemeKey;
  auto: {
    enabled: boolean;
    holidays: boolean;
    mood: boolean;
    night: boolean;
    windowsDark: boolean;
    seasons: boolean;
  };
  rotation: {
    enabled: boolean;
    frequency: RotationFrequency;
    pool: RotationPool;
    selection: ThemeKey[];
  };
  planning: {
    enabled: boolean;
    /** Du lundi (0) au dimanche (6). */
    weekdays: (ThemeKey | null)[];
    periods: ThemePeriod[];
  };
  /** « Garder ce thème aujourd'hui » : prioritaire jusqu'à minuit. */
  forcedToday: { date: string; theme: ThemeKey } | null;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  fixed: "aqua",
  auto: { enabled: false, holidays: true, mood: true, night: true, windowsDark: false, seasons: true },
  rotation: { enabled: false, frequency: "jour", pool: "tous", selection: [] },
  planning: { enabled: false, weekdays: [null, null, null, null, null, null, null], periods: [] },
  forcedToday: null,
};

export interface RotationState {
  theme: ThemeKey | null;
  periodKey: string | null;
  /** Les 10 derniers thèmes tirés, du plus récent au plus ancien. */
  history: { theme: ThemeKey; date: string }[];
}

export const EMPTY_ROTATION: RotationState = { theme: null, periodKey: null, history: [] };
export const HISTORY_SIZE = 10;

export type ThemeReason =
  | "aujourdhui"
  | "planning-periode"
  | "planning-jour"
  | "fete"
  | "humeur"
  | "nuit"
  | "windows-sombre"
  | "rotation"
  | "saison"
  | "prefere";

/** Thème disponible, avec ce qu'il faut savoir pour la rotation. */
export interface AvailableTheme {
  id: ThemeKey;
  dark: boolean;
}

export interface ResolveContext {
  now: Date;
  available: readonly AvailableTheme[];
  windowsDark: boolean;
  mood: Mood | null;
  rotation: RotationState;
  /** Identifiant du lancement d'Aqueli (rotation « à chaque ouverture »). */
  launchId: string;
  random: () => number;
}

export interface Resolution {
  theme: ThemeKey;
  reason: ThemeReason;
  rotation: RotationState;
}

// ——— Dates ———

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** « AAAA-MM-JJ » à l'heure locale. */
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** « MM-JJ », pour comparer des dates qui reviennent chaque année. */
function monthDay(date: Date): string {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Thème de la fête du jour (voir le tableau des thèmes), ou `null`. */
export function holidayTheme(date: Date): ThemeKey | null {
  const md = monthDay(date);
  if (md >= "12-26" || md <= "01-02") return "nouvel-an";
  if (md >= "12-01" && md <= "12-25") return "noel";
  if (md >= "02-07" && md <= "02-14") return "saint-valentin";
  if (md >= "10-24" && md <= "10-31") return "halloween";
  // Semaine de Pâques : du lundi précédent au lundi de Pâques.
  const easter = easterSunday(date.getFullYear());
  const key = dateKey(date);
  if (key >= dateKey(addDays(easter, -6)) && key <= dateKey(addDays(easter, 1))) return "paques";
  return null;
}

/** Thème de la saison (20/03, 21/06, 23/09, 21/12). */
export function seasonTheme(date: Date): ThemeKey {
  const md = monthDay(date);
  if (md >= "03-20" && md < "06-21") return "printemps";
  if (md >= "06-21" && md < "09-23") return "ete";
  if (md >= "09-23" && md < "12-21") return "automne";
  return "hiver";
}

const MOOD_THEMES: Record<Mood, ThemeKey> = { calme: "zen", motive: "energie", fatigue: "cocon" };

/** La nuit va de 21 h à 7 h. */
export function isNight(date: Date): boolean {
  const h = date.getHours();
  return h >= 21 || h < 7;
}

/** Période de rotation : un nouveau thème à chaque changement de clé. */
export function periodKey(frequency: RotationFrequency, now: Date, launchId: string): string {
  switch (frequency) {
    case "ouverture":
      return `ouverture:${launchId}`;
    case "jour":
      return `jour:${dateKey(now)}`;
    case "semaine": {
      // L'année de la semaine est celle de son jeudi (semaine ISO).
      const thursday = addDays(now, 3 - ((now.getDay() + 6) % 7));
      return `semaine:${thursday.getFullYear()}-${isoWeek(now)}`;
    }
    case "mois":
      return `mois:${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  }
}

// ——— Rotation ———

/**
 * Thèmes liés à une date (fêtes, saisons) : le changement automatique les affiche à leur date ;
 * le hasard ne les tire jamais ailleurs (Nouvel An en octobre), sauf s'ils sont cochés dans la sélection.
 */
const DATED_THEMES: ReadonlySet<ThemeKey> = new Set(["noel", "nouvel-an", "saint-valentin", "paques", "halloween", "printemps", "ete", "automne", "hiver"]);

export function rotationPool(settings: ThemeSettings, available: readonly AvailableTheme[]): ThemeKey[] {
  const { pool, selection } = settings.rotation;
  const chosen = available.filter((t) => {
    if (pool === "selection") return selection.includes(t.id);
    if (DATED_THEMES.has(t.id)) return false;
    if (pool === "clairs") return !t.dark;
    if (pool === "sombres") return t.dark;
    return true;
  });
  const undated = available.filter((t) => !DATED_THEMES.has(t.id));
  return (chosen.length > 0 ? chosen : undated.length > 0 ? undated : available).map((t) => t.id);
}

/** Tire un thème au hasard, jamais le même deux fois de suite (s'il y a le choix). */
export function pickDifferent(pool: readonly ThemeKey[], previous: ThemeKey | null, random: () => number): ThemeKey {
  const candidates = pool.length > 1 ? pool.filter((id) => id !== previous) : [...pool];
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index] ?? pool[0]!;
}

function withHistory(state: RotationState, theme: ThemeKey, now: Date, key: string): RotationState {
  return {
    theme,
    periodKey: key,
    history: [{ theme, date: dateKey(now) }, ...state.history].slice(0, HISTORY_SIZE),
  };
}

/** Thème de rotation pour la période en cours (nouveau tirage si la période a changé). */
export function rotate(settings: ThemeSettings, ctx: ResolveContext): RotationState {
  const key = periodKey(settings.rotation.frequency, ctx.now, ctx.launchId);
  const pool = rotationPool(settings, ctx.available);
  const current = ctx.rotation;
  if (current.periodKey === key && current.theme && pool.includes(current.theme)) return current;
  return withHistory(current, pickDifferent(pool, current.theme, ctx.random), ctx.now, key);
}

/** Thèmes clairs de la famille Signature : leur nuit est Minuit. */
const SIGNATURE_LIGHT: ReadonlySet<string> = new Set(["aqua", "jade", "glycine", "ambre", "nuage"]);

/** « Surprends-moi » : nouveau tirage immédiat, différent du thème affiché. */
export function surprise(settings: ThemeSettings, ctx: ResolveContext, shown: ThemeKey): RotationState {
  const key = periodKey(settings.rotation.frequency, ctx.now, ctx.launchId);
  const pool = rotationPool(settings, ctx.available);
  return withHistory(ctx.rotation, pickDifferent(pool, shown, ctx.random), ctx.now, key);
}

// ——— Décision ———

export function resolveTheme(settings: ThemeSettings, ctx: ResolveContext): Resolution {
  const has = (id: ThemeKey | null | undefined): id is ThemeKey => !!id && ctx.available.some((t) => t.id === id);
  const today = dateKey(ctx.now);
  const done = (theme: ThemeKey, reason: ThemeReason, rotation = ctx.rotation): Resolution => ({
    theme,
    reason,
    rotation,
  });

  if (settings.forcedToday?.date === today && has(settings.forcedToday.theme)) {
    return done(settings.forcedToday.theme, "aujourdhui");
  }

  if (settings.planning.enabled) {
    const period = settings.planning.periods.find((p) => p.start <= today && today <= p.end && has(p.theme));
    if (period) return done(period.theme, "planning-periode");
    const weekday = settings.planning.weekdays[(ctx.now.getDay() + 6) % 7];
    if (has(weekday)) return done(weekday, "planning-jour");
  }

  const auto = settings.auto;
  if (auto.enabled) {
    const holiday = holidayTheme(ctx.now);
    if (auto.holidays && has(holiday)) return done(holiday, "fete");
    const mood = ctx.mood ? MOOD_THEMES[ctx.mood] : null;
    if (auto.mood && has(mood)) return done(mood, "humeur");
    // La nuit d'un thème Signature est Minuit, son pendant sombre ; sinon Nuit étoilée.
    const night = SIGNATURE_LIGHT.has(settings.fixed) && has("minuit") ? "minuit" : "nuit-etoilee";
    if (auto.night && isNight(ctx.now) && has(night)) return done(night, "nuit");
    if (auto.windowsDark && ctx.windowsDark && has(night)) return done(night, "windows-sombre");
  }

  if (settings.rotation.enabled && ctx.available.length > 0) {
    const rotation = rotate(settings, ctx);
    if (rotation.theme) return done(rotation.theme, "rotation", rotation);
  } else if (auto.enabled && auto.seasons) {
    const season = seasonTheme(ctx.now);
    if (has(season)) return done(season, "saison");
  }

  return done(has(settings.fixed) ? settings.fixed : (ctx.available[0]?.id ?? "aqua"), "prefere");
}

/** Libellé court de la raison, pour « Thème actuel : Nuit étoilée (nuit) ». */
export function reasonLabel(reason: ThemeReason): string {
  switch (reason) {
    case "aujourdhui":
      return tr("choisi pour aujourd'hui");
    case "planning-periode":
      return tr("planning, période");
    case "planning-jour":
      return tr("planning, jour de la semaine");
    case "fete":
      return tr("fête");
    case "humeur":
      return tr("humeur du jour");
    case "nuit":
      return tr("nuit");
    case "windows-sombre":
      return tr("mode sombre de Windows");
    case "rotation":
      return tr("rotation aléatoire");
    case "saison":
      return tr("saison");
    case "prefere":
      return tr("thème préféré");
  }
}
