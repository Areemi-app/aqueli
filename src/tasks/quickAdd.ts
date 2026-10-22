/**
 * Saisie intelligente (cahier des charges § 4.2) : « Appeler le garage vendredi 14h
 * #voiture !haute » donne le titre, l'échéance, l'étiquette et la priorité.
 *
 * Reconnus : aujourd'hui, demain, après-demain, ce soir, un jour de la semaine (« lundi
 * prochain »), « dans 3 jours / 2 semaines / 1 mois », « semaine prochaine », « le 5 »,
 * « 12/10 » (ou « 10/24 » mois/jour quand le jour dépasse 12), « 2026-10-24 », « 1er novembre » ;
 * 14h, 14h30, « à 9 h 15 », 18:45, midi ; #étiquette (toutes écritures) ;
 * !haute, !moyenne, !basse (ou !!!) ; @contact (le contact est relié, son nom reste dans le
 * titre) ; +espace (ou @espace si aucun contact ne porte ce nom) ; répétitions : « chaque lundi »,
 * « tous les 2 mardis », « en semaine », « le dernier vendredi du mois », « 3 jours après achèvement »…
 *
 * L'anglais est compris aussi, quelle que soit la langue de l'interface : « Call the garage
 * Friday 2pm #car !high », today, tomorrow, next Monday, in 3 days, next week, on the 5th,
 * 1 November, 2:30pm, noon, every Monday, weekdays, the last Friday of the month,
 * 3 days after completion… Les jours s'écrivent en entier (« Monday », jamais « Mon »).
 */
import { addDays, addMonths, dayKey, fromDayKey, makeDay, weekday, type DayKey } from "./day";
import type { Recurrence } from "./recurrence";

export type Priority = 0 | 1 | 2 | 3;

export interface QuickAddToken {
  kind: "tag" | "priority" | "space" | "contact" | "repeat" | "date" | "time";
  /** Texte reconnu, tel que saisi. */
  text: string;
}

export interface QuickAddResult {
  title: string;
  dueDate: DayKey | null;
  dueTime: string | null;
  priority: Priority;
  tags: string[];
  spaceId: string | null;
  /** Contacts cités par « @Léa » (dans l'ordre), à relier à l'élément créé. */
  contactIds: string[];
  recurrence: Recurrence | null;
  tokens: QuickAddToken[];
}

export interface SpaceRef {
  id: string;
  name: string;
}

/** Contact citable par « @… » : son nom complet, son prénom, sa société… (le premier d'abord). */
export interface ContactRef {
  id: string;
  names: readonly string[];
}

// Limites de mot tenant compte des lettres accentuées (\b ne connaît que l'ASCII).
const WORD = "\\p{L}\\p{M}\\p{N}_";
const START = `(?<![${WORD}])`;
const END = `(?![${WORD}])`;
const PREFIX = "(?:(?:le|pour|avant|d['’]ici)\\s+)?";
const AT = "(?:(?:à|a|vers|avant|at|around|by)\\s+)";
const EN_PREFIX = "(?:(?:on|by|for|before|due)\\s+)?";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const NUMBERS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};
/** Début (sans accent) de chaque mois, dans l'ordre. */
const MONTH_STARTS = ["janv", "fev", "mars", "avr", "mai", "juin", "juil", "aou", "sep", "oct", "nov", "dec"];
const MONTHS =
  "janvier|janv\\.?|f[eé]vrier|f[eé]vr?\\.?|mars|avril|avr\\.?|mai|juin|juillet|juil\\.?|ao[uû]t|septembre|sept\\.?|octobre|oct\\.?|novembre|nov\\.?|d[eé]cembre|d[eé]c\\.?";

// Anglais.
const EN_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const EN_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const EN_MONTH_STARTS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const EN_MONTHS =
  "january|jan\\.?|february|feb\\.?|march|mar\\.?|april|apr\\.?|may|june|jun\\.?|july|jul\\.?|august|aug\\.?|september|sept?\\.?|october|oct\\.?|november|nov\\.?|december|dec\\.?";
/** « 5 », « 5th », « 1st », « 22nd ». */
const EN_DAY_NUMBER = "(\\d{1,2})(?:st|nd|rd|th)?";

/** Minuscules sans accents : « Santé » → « sante ». */
function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Numéro du mois, nom français ou anglais. */
function monthNumber(word: string): number {
  const w = plain(word).replace(".", "");
  const fr = MONTH_STARTS.findIndex((start) => w.startsWith(start)) + 1;
  return fr || EN_MONTH_STARTS.findIndex((start) => w.startsWith(start)) + 1;
}

function dayNumber(text: string): number {
  return text === "1er" ? 1 : Number(text);
}

/** La date donnée cette année, ou l'an prochain si elle est déjà passée. */
function nextYearly(today: DayKey, month: number, day: number): DayKey | null {
  const year = Number(today.slice(0, 4));
  const thisYear = makeDay(year, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return makeDay(year + 1, month, day);
}

/** Le jour N de ce mois, ou des mois suivants s'il est passé (ou n'existe pas). */
function nextMonthly(today: DayKey, day: number): DayKey | null {
  const [year = 1970, month = 1] = today.split("-").map(Number);
  for (let k = 0; k < 13; k++) {
    const first = new Date(year, month - 1 + k, 1);
    const candidate = makeDay(first.getFullYear(), first.getMonth() + 1, day);
    if (candidate && candidate >= today) return candidate;
  }
  return null;
}

/** Groupe capturé, ou chaîne vide s'il est absent. */
const g = (m: RegExpExecArray, i: number): string => m[i] ?? "";

interface Rule<T> {
  re: RegExp;
  resolve: (m: RegExpExecArray) => T | null;
}

function dateRules(today: DayKey): Rule<DayKey>[] {
  const rx = (source: string) => new RegExp(source, "giu");
  return [
    { re: rx(`${START}${PREFIX}(?:aujourd['’]hui|auj|ce\\s+soir)${END}`), resolve: () => today },
    { re: rx(`${START}${PREFIX}apr[eè]s[-\\s]demain${END}`), resolve: () => addDays(today, 2) },
    { re: rx(`${START}${PREFIX}demain${END}`), resolve: () => addDays(today, 1) },
    {
      re: rx(`${START}${PREFIX}(${WEEKDAYS.join("|")})(\\s+prochain)?${END}`),
      resolve: (m) => {
        const diff = (WEEKDAYS.indexOf(g(m, 1).toLowerCase()) - weekday(today) + 7) % 7;
        return addDays(today, m[2] && diff === 0 ? 7 : diff);
      },
    },
    {
      re: rx(`${START}dans\\s+(\\d{1,3}|${Object.keys(NUMBERS).join("|")})\\s+(jours?|semaines?|mois)${END}`),
      resolve: (m) => {
        const n = NUMBERS[g(m, 1).toLowerCase()] ?? Number(g(m, 1));
        const unit = g(m, 2).toLowerCase();
        if (unit.startsWith("jour")) return addDays(today, n);
        if (unit.startsWith("semaine")) return addDays(today, 7 * n);
        return addMonths(today, n);
      },
    },
    {
      re: rx(`${START}(?:pour\\s+)?(?:la\\s+)?semaine\\s+prochaine${END}`),
      resolve: () => addDays(today, (1 - weekday(today) + 7) % 7 || 7),
    },
    {
      re: rx(`${START}${PREFIX}(1er|\\d{1,2})\\s+(${MONTHS})(?:\\s+(\\d{4}))?(?![${WORD}])`),
      resolve: (m) => {
        const month = monthNumber(g(m, 2));
        if (m[3]) return makeDay(Number(m[3]), month, dayNumber(g(m, 1)));
        return nextYearly(today, month, dayNumber(g(m, 1)));
      },
    },
    {
      // Date complète « 2026-10-24 » ou « 2026/10/24 » (l'ordre des langues d'Asie de l'Est).
      re: rx(`${START}${PREFIX}(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${END}`),
      resolve: (m) => makeDay(Number(m[1]), Number(m[2]), Number(m[3])),
    },
    {
      re: rx(`${START}${PREFIX}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${END}`),
      resolve: (m) => {
        let day = Number(m[1]);
        let month = Number(m[2]);
        // « 10/24 » (mois/jour, l'ordre de nombreuses langues) : compris quand le jour dépasse 12.
        if (month > 12 && day <= 12) [day, month] = [month, day];
        if (!m[3]) return nextYearly(today, month, day);
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return makeDay(year, month, day);
      },
    },
    { re: rx(`${START}le\\s+(1er|\\d{1,2})${END}`), resolve: (m) => nextMonthly(today, dayNumber(g(m, 1))) },
    // Anglais.
    { re: rx(`${START}${EN_PREFIX}(?:today|tonight|this\\s+evening)${END}`), resolve: () => today },
    { re: rx(`${START}${EN_PREFIX}(?:the\\s+)?day\\s+after\\s+tomorrow${END}`), resolve: () => addDays(today, 2) },
    { re: rx(`${START}${EN_PREFIX}tomorrow${END}`), resolve: () => addDays(today, 1) },
    {
      re: rx(`${START}${EN_PREFIX}(next\\s+)?(${EN_WEEKDAYS.join("|")})${END}`),
      resolve: (m) => {
        const diff = (EN_WEEKDAYS.indexOf(g(m, 2).toLowerCase()) - weekday(today) + 7) % 7;
        return addDays(today, m[1] && diff === 0 ? 7 : diff);
      },
    },
    {
      re: rx(`${START}in\\s+(\\d{1,3}|an?|${Object.keys(EN_NUMBERS).join("|")})\\s+(days?|weeks?|months?)${END}`),
      resolve: (m) => {
        const word = g(m, 1).toLowerCase();
        const n = word === "a" || word === "an" ? 1 : (EN_NUMBERS[word] ?? Number(word));
        const unit = g(m, 2).toLowerCase();
        if (unit.startsWith("day")) return addDays(today, n);
        if (unit.startsWith("week")) return addDays(today, 7 * n);
        return addMonths(today, n);
      },
    },
    { re: rx(`${START}${EN_PREFIX}next\\s+week${END}`), resolve: () => addDays(today, (1 - weekday(today) + 7) % 7 || 7) },
    {
      // « 1 November », « 1st of November 2026 »
      re: rx(`${START}${EN_PREFIX}(?:the\\s+)?${EN_DAY_NUMBER}\\s+(?:of\\s+)?(${EN_MONTHS})(?:,?\\s+(\\d{4}))?(?![${WORD}])`),
      resolve: (m) => {
        const month = monthNumber(g(m, 2));
        if (m[3]) return makeDay(Number(m[3]), month, Number(m[1]));
        return nextYearly(today, month, Number(m[1]));
      },
    },
    {
      // « November 1 », « November 1st, 2026 »
      re: rx(`${START}${EN_PREFIX}(${EN_MONTHS})\\s+${EN_DAY_NUMBER}(?:,?\\s+(\\d{4}))?${END}`),
      resolve: (m) => {
        const month = monthNumber(g(m, 1));
        if (m[3]) return makeDay(Number(m[3]), month, Number(m[2]));
        return nextYearly(today, month, Number(m[2]));
      },
    },
    { re: rx(`${START}(?:on\\s+)?the\\s+(\\d{1,2})(?:st|nd|rd|th)${END}`), resolve: (m) => nextMonthly(today, Number(m[1])) },
  ];
}

function time(hours: number, minutes: number): string | null {
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const TIME_RULES: Rule<string>[] = [
  { re: new RegExp(`${START}${AT}?(\\d{1,2})h(\\d{2})?${END}`, "giu"), resolve: (m) => time(Number(m[1]), Number(m[2] ?? 0)) },
  { re: new RegExp(`${START}${AT}(\\d{1,2})\\s*h\\s*(\\d{2})?${END}`, "giu"), resolve: (m) => time(Number(m[1]), Number(m[2] ?? 0)) },
  { re: new RegExp(`${START}${AT}?(\\d{1,2}):(\\d{2})${END}`, "giu"), resolve: (m) => time(Number(m[1]), Number(m[2])) },
  {
    re: new RegExp(`${START}(?:(?:à|a|vers)\\s+)?(midi|minuit)${END}`, "giu"),
    resolve: (m) => (g(m, 1).toLowerCase() === "midi" ? "12:00" : "00:00"),
  },
  // Anglais : « 2pm », « 2:30 pm », « at 9am », « noon ».
  {
    re: new RegExp(`${START}${AT}?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)${END}`, "giu"),
    resolve: (m) => {
      const hours = Number(m[1]);
      if (hours < 1 || hours > 12) return null;
      const pm = g(m, 3).toLowerCase() === "pm";
      return time((hours % 12) + (pm ? 12 : 0), Number(m[2] ?? 0));
    },
  },
  {
    re: new RegExp(`${START}(?:(?:at|around)\\s+)?(noon|midday|midnight)${END}`, "giu"),
    resolve: (m) => (g(m, 1).toLowerCase() === "midnight" ? "00:00" : "12:00"),
  },
];

interface Found<T> {
  index: number;
  length: number;
  text: string;
  value: T;
}

/** Première occurrence reconnue (la plus à gauche, puis la plus longue). */
function findFirst<T>(text: string, rules: Rule<T>[]): Found<T> | null {
  let best: Found<T> | null = null;
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    for (let m = rule.re.exec(text); m; m = rule.re.exec(text)) {
      const value = rule.resolve(m);
      if (value === null) continue;
      const found = { index: m.index, length: m[0].length, text: m[0], value };
      if (!best || found.index < best.index || (found.index === best.index && found.length > best.length)) {
        best = found;
      }
      break;
    }
  }
  return best;
}

const DAY_NAME = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?";
const DAY_LIST = `${DAY_NAME}(?:(?:\\s*,\\s*|\\s+et\\s+)${DAY_NAME})*`;
const COUNT = `(\\d{1,3}|${Object.keys(NUMBERS).join("|")})`;
const NTH: Record<string, number> = {
  "1er": 1,
  premier: 1,
  "2e": 2,
  "2ème": 2,
  deuxième: 2,
  second: 2,
  "3e": 3,
  "3ème": 3,
  troisième: 3,
  "4e": 4,
  "4ème": 4,
  quatrième: 4,
  dernier: -1,
};

const count = (text: string) => NUMBERS[text.toLowerCase()] ?? EN_NUMBERS[text.toLowerCase()] ?? Number(text);
const daysIn = (text: string) =>
  [...text.matchAll(/lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/giu)].map((m) => WEEKDAYS.indexOf(m[0].toLowerCase()));

// Anglais.
const EN_DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?";
const EN_DAY_LIST = `${EN_DAY}(?:(?:\\s*,\\s*(?:and\\s+)?|\\s+and\\s+)${EN_DAY})*`;
const EN_COUNT = `(\\d{1,3}|${Object.keys(EN_NUMBERS).join("|")})`;
const EN_NTH: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, last: -1 };
const daysInEn = (text: string) =>
  [...text.matchAll(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/giu)].map((m) => EN_WEEKDAYS.indexOf(m[0].toLowerCase()));

/** Répétition reconnue ; le jour du mois ou de la semaine peut dépendre de l'échéance, connue après. */
type PendingRecurrence = (base: DayKey) => Recurrence;

const RECURRENCE_RULES: Rule<PendingRecurrence>[] = (() => {
  const rx = (source: string) => new RegExp(`${START}${source}${END}`, "giu");
  const dom = (base: DayKey) => fromDayKey(base).getDate();
  return [
    { re: rx("(?:chaque\\s+jour|tous\\s+les\\s+jours|quotidiennement)"), resolve: () => () => ({ kind: "daily", interval: 1 }) },
    { re: rx(`tous\\s+les\\s+${COUNT}\\s+jours`), resolve: (m) => () => ({ kind: "daily", interval: count(g(m, 1)) }) },
    {
      re: rx("(?:en\\s+semaine|(?:les\\s+)?jours\\s+ouvr(?:[ée]s|ables)|du\\s+lundi\\s+au\\s+vendredi)"),
      resolve: () => () => ({ kind: "weekdays" }),
    },
    {
      re: rx(`tous\\s+les\\s+${COUNT}\\s+(${DAY_NAME})`),
      resolve: (m) => () => ({ kind: "weekly", interval: count(g(m, 1)), days: daysIn(g(m, 2)) }),
    },
    { re: rx(`(?:chaque|tous\\s+les)\\s+${DAY_LIST}`), resolve: (m) => () => ({ kind: "weekly", interval: 1, days: daysIn(m[0]) }) },
    {
      re: rx("(?:chaque\\s+semaine|toutes\\s+les\\s+semaines|hebdomadairement)"),
      resolve: () => (base) => ({ kind: "weekly", interval: 1, days: [weekday(base)] }),
    },
    {
      re: rx(`toutes\\s+les\\s+${COUNT}\\s+semaines`),
      resolve: (m) => (base) => ({ kind: "weekly", interval: count(g(m, 1)), days: [weekday(base)] }),
    },
    // Formes écrites par l'application (recurrenceLabel) : elles se relisent à l'import.
    {
      re: rx(`toutes\\s+les\\s+${COUNT}\\s+semaines\\s*(?:[:,]\\s*|\\s+les?\\s+)?(${DAY_LIST})`),
      resolve: (m) => () => ({ kind: "weekly", interval: count(g(m, 1)), days: daysIn(g(m, 2)) }),
    },
    {
      re: rx(`le\\s+(1er|\\d{1,2})\\s+de\\s+chaque\\s+mois`),
      resolve: (m) => () => ({ kind: "monthly", interval: 1, day: dayNumber(g(m, 1)) }),
    },
    {
      re: rx(`le\\s+(1er|\\d{1,2})\\s*,?\\s+tous\\s+les\\s+${COUNT}\\s+mois`),
      resolve: (m) => () => ({ kind: "monthly", interval: count(g(m, 2)), day: dayNumber(g(m, 1)) }),
    },
    {
      re: rx(`le\\s+(${Object.keys(NTH).join("|")})\\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s*,?\\s+tous\\s+les\\s+${COUNT}\\s+mois`),
      resolve: (m) => () => ({
        kind: "monthlyNth",
        interval: count(g(m, 3)),
        nth: NTH[g(m, 1).toLowerCase()] ?? 1,
        weekday: WEEKDAYS.indexOf(g(m, 2).toLowerCase()),
      }),
    },
    {
      re: rx(`(?:chaque\\s+ann[ée]e|tous\\s+les\\s+ans)\\s*,?\\s+le\\s+(1er|\\d{1,2})\\s+(${MONTHS})`),
      resolve: (m) => () => ({ kind: "yearly", interval: 1, month: monthNumber(g(m, 2)), day: dayNumber(g(m, 1)) }),
    },
    {
      re: rx(`tous\\s+les\\s+${COUNT}\\s+ans\\s*,?\\s+le\\s+(1er|\\d{1,2})\\s+(${MONTHS})`),
      resolve: (m) => () => ({ kind: "yearly", interval: count(g(m, 1)), month: monthNumber(g(m, 3)), day: dayNumber(g(m, 2)) }),
    },
    {
      re: rx(`le\\s+(${Object.keys(NTH).join("|")})\\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+(?:du|de\\s+chaque)\\s+mois`),
      resolve: (m) => () => ({
        kind: "monthlyNth",
        interval: 1,
        nth: NTH[g(m, 1).toLowerCase()] ?? 1,
        weekday: WEEKDAYS.indexOf(g(m, 2).toLowerCase()),
      }),
    },
    {
      re: rx("(?:chaque\\s+mois|tous\\s+les\\s+mois|mensuellement)"),
      resolve: () => (base) => ({ kind: "monthly", interval: 1, day: dom(base) }),
    },
    {
      re: rx(`tous\\s+les\\s+${COUNT}\\s+mois`),
      resolve: (m) => (base) => ({ kind: "monthly", interval: count(g(m, 1)), day: dom(base) }),
    },
    {
      re: rx("(?:chaque\\s+ann[ée]e|tous\\s+les\\s+ans|annuellement)"),
      resolve: () => (base) => ({ kind: "yearly", interval: 1, month: fromDayKey(base).getMonth() + 1, day: dom(base) }),
    },
    {
      re: rx(`${COUNT}\\s+(jours?|semaines?)\\s+apr[eè]s\\s+(?:l['’])?ach[eè]vement`),
      resolve: (m) => () => ({ kind: "afterDone", days: count(g(m, 1)) * (g(m, 2).toLowerCase().startsWith("semaine") ? 7 : 1) }),
    },
    // Anglais, dont les formes écrites par l'application en anglais (recurrenceLabel).
    { re: rx("(?:every\\s+day|each\\s+day|daily)"), resolve: () => () => ({ kind: "daily", interval: 1 }) },
    { re: rx(`every\\s+${EN_COUNT}\\s+days`), resolve: (m) => () => ({ kind: "daily", interval: count(g(m, 1)) }) },
    { re: rx("(?:(?:on\\s+|every\\s+)?weekdays|every\\s+weekday|monday\\s+to\\s+friday)"), resolve: () => () => ({ kind: "weekdays" }) },
    {
      re: rx(`every\\s+${EN_COUNT}\\s+(${EN_DAY})`),
      resolve: (m) => () => ({ kind: "weekly", interval: count(g(m, 1)), days: daysInEn(g(m, 2)) }),
    },
    { re: rx(`(?:every|each)\\s+${EN_DAY_LIST}`), resolve: (m) => () => ({ kind: "weekly", interval: 1, days: daysInEn(m[0]) }) },
    { re: rx("(?:every\\s+week|each\\s+week|weekly)"), resolve: () => (base) => ({ kind: "weekly", interval: 1, days: [weekday(base)] }) },
    { re: rx(`every\\s+${EN_COUNT}\\s+weeks`), resolve: (m) => (base) => ({ kind: "weekly", interval: count(g(m, 1)), days: [weekday(base)] }) },
    {
      re: rx(`every\\s+${EN_COUNT}\\s+weeks\\s*(?::\\s*|\\s+on\\s+)(${EN_DAY_LIST})`),
      resolve: (m) => () => ({ kind: "weekly", interval: count(g(m, 1)), days: daysInEn(g(m, 2)) }),
    },
    {
      re: rx(`(?:on\\s+)?the\\s+${EN_DAY_NUMBER}\\s+of\\s+(?:every|each)\\s+month`),
      resolve: (m) => () => ({ kind: "monthly", interval: 1, day: Number(g(m, 1)) }),
    },
    {
      re: rx(`the\\s+${EN_DAY_NUMBER}\\s*,?\\s+every\\s+${EN_COUNT}\\s+months`),
      resolve: (m) => () => ({ kind: "monthly", interval: count(g(m, 2)), day: Number(g(m, 1)) }),
    },
    {
      re: rx(`(?:on\\s+)?(?:the\\s+)?(${Object.keys(EN_NTH).join("|")})\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s*,?\\s+every\\s+${EN_COUNT}\\s+months`),
      resolve: (m) => () => ({ kind: "monthlyNth", interval: count(g(m, 3)), nth: EN_NTH[g(m, 1).toLowerCase()] ?? 1, weekday: EN_WEEKDAYS.indexOf(g(m, 2).toLowerCase()) }),
    },
    {
      re: rx(`(?:on\\s+)?(?:the\\s+)?(${Object.keys(EN_NTH).join("|")})\\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\s+of\\s+(?:the|every|each)\\s+month`),
      resolve: (m) => () => ({ kind: "monthlyNth", interval: 1, nth: EN_NTH[g(m, 1).toLowerCase()] ?? 1, weekday: EN_WEEKDAYS.indexOf(g(m, 2).toLowerCase()) }),
    },
    { re: rx("(?:every\\s+month|each\\s+month|monthly)"), resolve: () => (base) => ({ kind: "monthly", interval: 1, day: dom(base) }) },
    { re: rx(`every\\s+${EN_COUNT}\\s+months`), resolve: (m) => (base) => ({ kind: "monthly", interval: count(g(m, 1)), day: dom(base) }) },
    {
      re: rx(`(?:every\\s+year|each\\s+year|yearly|annually)\\s*,?\\s+on\\s+(?:the\\s+)?${EN_DAY_NUMBER}\\s+(?:of\\s+)?(${EN_MONTHS})`),
      resolve: (m) => () => ({ kind: "yearly", interval: 1, month: monthNumber(g(m, 2)), day: Number(g(m, 1)) }),
    },
    {
      re: rx(`every\\s+${EN_COUNT}\\s+years\\s*,?\\s+on\\s+(?:the\\s+)?${EN_DAY_NUMBER}\\s+(?:of\\s+)?(${EN_MONTHS})`),
      resolve: (m) => () => ({ kind: "yearly", interval: count(g(m, 1)), month: monthNumber(g(m, 3)), day: Number(g(m, 2)) }),
    },
    {
      re: rx("(?:every\\s+year|each\\s+year|yearly|annually)"),
      resolve: () => (base) => ({ kind: "yearly", interval: 1, month: fromDayKey(base).getMonth() + 1, day: dom(base) }),
    },
    {
      re: rx(`${EN_COUNT}\\s+(days?|weeks?)\\s+after\\s+completion`),
      resolve: (m) => () => ({ kind: "afterDone", days: count(g(m, 1)) * (g(m, 2).toLowerCase().startsWith("week") ? 7 : 1) }),
    },
  ];
})();

function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

const PRIORITIES: Record<string, Priority> = { haute: 3, h: 3, "!!": 3, moyenne: 2, m: 2, basse: 1, b: 1, high: 3, medium: 2, med: 2, low: 1, l: 1 };

export function parseQuickAdd(input: string, now: Date, spaces: readonly SpaceRef[], contacts: readonly ContactRef[] = []): QuickAddResult {
  const today = dayKey(now);
  const tokens: QuickAddToken[] = [];
  let rest = ` ${input} `;
  const squash = (text: string) => plain(text).replace(/[^\p{L}\p{N}]/gu, "");

  // Contacts : « @Léa », « @Léa_Bernard », « @LéaBernard ». Le nom reste dans le titre, sans le @.
  // Un nom porté par plusieurs contacts ne relie personne (le nom complet départage).
  const contactIds: string[] = [];
  rest = rest.replace(/(\s)@([\p{L}\p{M}\p{N}_-]+)(?=\s)/gu, (all, space: string, word: string) => {
    const wanted = squash(word);
    if (!wanted) return all;
    const byFull = contacts.filter((c) => c.names[0] !== undefined && squash(c.names[0]) === wanted);
    const byAny = contacts.filter((c) => c.names.some((n) => squash(n) === wanted));
    const match = byFull.length === 1 ? byFull[0] : byAny.length === 1 ? byAny[0] : undefined;
    if (!match) return all;
    if (!contactIds.includes(match.id)) contactIds.push(match.id);
    tokens.push({ kind: "contact", text: `@${word}` });
    return `${space}${word.replace(/_/g, " ")}`;
  });

  // Étiquettes.
  const tags: string[] = [];
  rest = rest.replace(/(\s)#([\p{L}\p{M}\p{N}_\-/]+)(?=\s)/gu, (_all, space: string, tag: string) => {
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
    tokens.push({ kind: "tag", text: `#${tag}` });
    return space;
  });

  // Priorité (la première seulement) : « !haute » mais jamais le « ! » de la ponctuation.
  let priority: Priority = 0;
  const p = /\s!(haute|h|moyenne|m|basse|b|!!|high|medium|med|low|l)(?=\s)/iu.exec(rest);
  if (p) {
    priority = PRIORITIES[g(p, 1).toLowerCase()] ?? 0;
    tokens.push({ kind: "priority", text: p[0].trim() });
    rest = cut(rest, p.index, p[0].length);
  }

  // Espace : +nom d'un espace existant, sans accents ni séparateurs (ou @nom, l'ancienne
  // écriture, quand aucun contact ne porte ce nom).
  let spaceId: string | null = null;
  const spaceRe = /\s[+@]([\p{L}\p{M}\p{N}_-]+)(?=\s)/gu;
  for (let m = spaceRe.exec(rest); m; m = spaceRe.exec(rest)) {
    const wanted = squash(g(m, 1));
    const space = spaces.find((s) => squash(s.name) === wanted);
    if (space) {
      spaceId = space.id;
      tokens.push({ kind: "space", text: m[0].trim() });
      rest = cut(rest, m.index, m[0].length);
      break;
    }
  }

  // Répétition (avant la date : « chaque lundi » n'est pas « lundi »).
  let pending: PendingRecurrence | null = null;
  const repeat = findFirst(rest, RECURRENCE_RULES);
  if (repeat) {
    pending = repeat.value;
    tokens.push({ kind: "repeat", text: repeat.text.trim() });
    rest = cut(rest, repeat.index, repeat.length);
  }

  // Date.
  let dueDate: DayKey | null = null;
  const date = findFirst(rest, dateRules(today));
  if (date) {
    dueDate = date.value;
    tokens.push({ kind: "date", text: date.text.trim() });
    rest = cut(rest, date.index, date.length);
  }

  // Heure ; sans date, une heure déjà passée vise le lendemain (pour une tâche répétée, le
  // cœur choisit la première échéance).
  let dueTime: string | null = null;
  const hour = findFirst(rest, TIME_RULES);
  if (hour) {
    dueTime = hour.value;
    tokens.push({ kind: "time", text: hour.text.trim() });
    rest = cut(rest, hour.index, hour.length);
    if (!dueDate && !pending) {
      const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      dueDate = dueTime < current ? addDays(today, 1) : today;
    }
  }

  const title = rest
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/^[,;:–—-]+\s*|\s*[,;:–—-]+$/gu, "");

  const recurrence = pending ? pending(dueDate ?? today) : null;
  return { title, dueDate, dueTime, priority, tags, spaceId, contactIds, recurrence, tokens };
}

/** Valeur d'une règle qui reconnaît tout le texte, sinon `null` (import de fichiers). */
function whole<T>(text: string, rules: Rule<T>[]): T | null {
  const padded = ` ${text.trim()} `;
  const found = findFirst(padded, rules);
  if (!found) return null;
  return cut(padded, found.index, found.length).trim() === "" ? found.value : null;
}

/** Date seule : « demain », « lundi », « 15/11 », « 1er novembre 2026 ». */
export function parseDateWords(text: string, today: DayKey): DayKey | null {
  return whole(text, dateRules(today));
}

/** Heure seule : « 14h30 », « à 9 h 15 », « 18:45 », « midi ». */
export function parseTimeWords(text: string): string | null {
  return whole(text, TIME_RULES);
}

/** Répétition seule (« chaque lundi », « tous les 3 mois »), calée sur l'échéance `base`. */
export function parseRepeatWords(text: string, base: DayKey): Recurrence | null {
  const pending = whole(text, RECURRENCE_RULES);
  return pending ? pending(base) : null;
}
