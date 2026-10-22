/**
 * Lecture des valeurs d'un fichier importé : dates (y compris celles d'Excel), heures, durées,
 * montants, priorités, étiquettes, répétitions… Chaque fonction renvoie la valeur, ou un
 * `Bad` qui explique le refus. Fonctions pures.
 */
import { fold } from "../lib/fold";
import { parseAmount } from "../obligations/obligations";
import { dayKey, fromDayKey, makeDay, weekday, type DayKey } from "../tasks/day";
import { parseDateWords, parseRepeatWords, parseTimeWords, type Priority } from "../tasks/quickAdd";
import type { Frequency } from "../habits/habits";
import type { Recurrence } from "../tasks/recurrence";
import { tr } from "../i18n/i18n";

/** Valeur refusée, avec l'explication montrée dans l'aperçu. */
export class Bad {
  constructor(readonly message: string) {}
}

export const isBad = (value: unknown): value is Bad => value instanceof Bad;

/** « « texte » », raccourci s'il est long. */
export const quote = (text: string) => `« ${text.length > 40 ? `${text.slice(0, 39)}…` : text} »`;

/** Minuscules sans accents, apostrophes droites, espaces simples. */
export const key = (text: string) =>
  fold(text)
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// ——— Dates et heures ———

/** Jour 0 des dates d'Excel (calendrier 1900, ou 1904 sur certains classeurs Mac). */
const excelEpoch = (date1904: boolean) => (date1904 ? new Date(1904, 0, 1) : new Date(1899, 11, 30));

const SERIAL = /^\d+(\.\d+)?$/;

/** Date d'Excel (nombre de jours, décimales pour l'heure) entre 1927 et 2173. */
function excelSerial(text: string): number | null {
  if (!SERIAL.test(text)) return null;
  const n = Number(text);
  return n >= 10_000 && n < 100_000 ? n : null;
}

function serialDay(serial: number, date1904: boolean): DayKey {
  const date = excelEpoch(date1904);
  date.setDate(date.getDate() + Math.floor(serial));
  return dayKey(date);
}

/** Heure d'une fraction de jour (0,5 → « 12:00 »). */
function fractionTime(fraction: number): string {
  const minutes = Math.round(fraction * 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function checkYear(day: DayKey | null, text: string): DayKey | Bad {
  if (!day) return new Bad(tr("Date impossible : {quote}.", { quote: quote(text) }));
  const year = Number(day.slice(0, 4));
  return year >= 1900 && year <= 2999 ? day : new Bad(tr("Date hors limites : {quote}.", { quote: quote(text) }));
}

export interface DateOptions {
  today: DayKey;
  date1904?: boolean;
}

/** « 03/10/2026 », « 3-10-26 », « 2026-10-03 », « 3 octobre 2026 », « demain », date d'Excel. */
export function parseDay(text: string, { today, date1904 = false }: DateOptions): DayKey | Bad {
  const t = text.trim();
  const serial = excelSerial(t);
  if (serial !== null) return serialDay(serial, date1904);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return checkYear(makeDay(Number(m[1]), Number(m[2]), Number(m[3])), t);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(t);
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return checkYear(makeDay(year, Number(m[2]), Number(m[1])), t);
  }
  // Mots de la saisie rapide : « demain », « 15/11 », « 1er novembre 2026 »…
  const words = parseDateWords(t.replace(/^(?:le|du)\s+/i, ""), today);
  if (words) return checkYear(words, t);
  return new Bad(tr("Date illisible : {quote}.", { quote: quote(t) }));
}

/** « 14:00 », « 14h », « 9 h 15 », « 14:00:00 », « midi », fraction de jour d'Excel. */
export function parseTime(text: string): string | Bad {
  const t = text.trim();
  if (SERIAL.test(t)) {
    const n = Number(t);
    // Fraction de jour, ou date et heure d'Excel (on garde l'heure).
    if (n < 1 || excelSerial(t) !== null) return fractionTime(n - Math.floor(n));
    // « 14 » : 14 heures.
    if (Number.isInteger(n) && n <= 23) return `${String(n).padStart(2, "0")}:00`;
  }
  const m = /^(\d{1,2})\s*[h:.]\s*(\d{2})?(?::\d{2})?$/i.exec(t);
  if (m) {
    const hours = Number(m[1]);
    const minutes = Number(m[2] ?? 0);
    if (hours <= 23 && minutes <= 59) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return new Bad(tr("Heure impossible : {quote}.", { quote: quote(t) }));
  }
  return parseTimeWords(t) ?? new Bad(tr("Heure illisible : {quote}.", { quote: quote(t) }));
}

const TIME_PART = String.raw`\d{1,2}\s*[h:]\s*(?:\d{2})?(?::\d{2})?|midi|minuit`;
const RANGE = new RegExp(String.raw`^(${TIME_PART})\s*(?:-|–|à|a)\s*(${TIME_PART})$`, "i");

export interface TimeRange {
  start: string;
  end: string | null;
}

/** « 09:30-10:00 », « 9h30 à 10h », ou une heure seule. */
export function parseTimeRange(text: string): TimeRange | Bad {
  const t = text.trim().replace(/^de\s+/i, "");
  const m = RANGE.exec(t);
  if (m) {
    const start = parseTime(m[1]!);
    const end = parseTime(m[2]!);
    if (isBad(start)) return start;
    if (isBad(end)) return end;
    return { start, end };
  }
  const start = parseTime(t);
  return isBad(start) ? start : { start, end: null };
}

export interface DateTime {
  day: DayKey;
  start: string | null;
  end: string | null;
}

const TRAILING_TIME = new RegExp(String.raw`(?:\s+|T)(?:(?:à|a|de)\s+)?((?:${TIME_PART})(?:\s*(?:-|–|à|a)\s*(?:${TIME_PART}))?)$`, "i");

/** Date suivie éventuellement d'une heure ou d'un créneau : « 08/10/2026 09:30-10:00 ». */
export function parseDateTime(text: string, options: DateOptions): DateTime | Bad {
  const t = text.trim();
  const serial = excelSerial(t);
  if (serial !== null) {
    const fraction = serial - Math.floor(serial);
    return { day: serialDay(serial, options.date1904 ?? false), start: fraction > 0 ? fractionTime(fraction) : null, end: null };
  }
  const m = TRAILING_TIME.exec(t);
  if (m) {
    const day = parseDay(t.slice(0, m.index), options);
    if (!isBad(day)) {
      const range = parseTimeRange(m[1]!);
      if (isBad(range)) return range;
      return { day, ...range };
    }
  }
  const day = parseDay(t, options);
  return isBad(day) ? day : { day, start: null, end: null };
}

// ——— Durées ———

const UNITS: [RegExp, number][] = [
  [/^(?:min|mins|minutes?|mn|m)$/, 1],
  [/^(?:h|heures?|hours?|hrs?)$/, 60],
  [/^(?:j|jours?|d|days?)$/, 24 * 60],
  [/^(?:sem|semaines?|wk|weeks?)$/, 7 * 24 * 60],
];

/** Durée en minutes : « 30 », « 30 min », « 1 h 30 », « 1h30 », « 1,5 h », « 2 jours », « 1:30 ». */
export function parseDuration(text: string): number | Bad {
  const t = key(text);
  let m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)\s*h\s*(\d{1,2})(?:\s*(?:min|mn|m))?$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  if (/^\d+$/.test(t)) return Number(t);
  m = /^(\d+(?:[.,]\d+)?)\s*([a-z]+)$/.exec(t);
  const unit = m && UNITS.find(([re]) => re.test(m![2]!));
  if (m && unit) return Math.round(Number(m[1]!.replace(",", ".")) * unit[1]);
  return new Bad(tr("Durée illisible : {quote}.", { quote: quote(text.trim()) }));
}

/** Durée estimée d'une tâche, 24 heures au plus. */
export function parseEstimate(text: string): number | Bad {
  const minutes = parseDuration(text);
  if (isBad(minutes)) return minutes;
  if (minutes <= 0 || minutes > 24 * 60) return new Bad(tr("Durée hors limites (24 h au plus)."));
  return minutes;
}

const NO = new Set(["aucun", "aucune", "non", "sans", "pas de rappel", "jamais", "-", "none", "no", "never", "no reminder"]);
const AT_TIME = new Set(["a l'heure", "a l'echeance", "au debut", "a l'heure du debut", "0", "maintenant", "on time", "at due time", "at the time", "at start", "now"]);

/** Rappel en minutes avant ; `null` : aucun rappel. */
export function parseReminder(text: string): number | null | Bad {
  const t = key(text)
    .replace(/^(?:rappel|reminder)\s*/, "")
    .replace(/\s*(?:avant|before)$/, "");
  if (NO.has(t)) return null;
  if (AT_TIME.has(t)) return 0;
  const minutes = parseDuration(t);
  if (isBad(minutes)) return new Bad(tr("Rappel illisible : {quote}.", { quote: quote(text.trim()) }));
  if (minutes > 7 * 24 * 60) return new Bad(tr("Rappel hors limites (7 jours au plus)."));
  return minutes;
}

// ——— Autres valeurs ———

const PRIORITIES: Record<string, Priority> = {
  haute: 3,
  h: 3,
  elevee: 3,
  forte: 3,
  urgent: 3,
  urgente: 3,
  "3": 3,
  moyenne: 2,
  m: 2,
  normale: 2,
  "2": 2,
  basse: 1,
  b: 1,
  faible: 1,
  "1": 1,
  aucune: 0,
  sans: 0,
  non: 0,
  "0": 0,
  // Anglais.
  high: 3,
  medium: 2,
  med: 2,
  normal: 2,
  low: 1,
  l: 1,
  none: 0,
};

/** « haute », « !moyenne », « basse », « aucune », 0 à 3, « !! ». */
export function parsePriority(text: string): Priority | Bad {
  const t = key(text);
  if (/^!{2,}$/.test(t)) return 3;
  const value = PRIORITIES[t.replace(/^!/, "").replace(/^(?:priorite|priority)\s+/, "")];
  return value ?? new Bad(tr("Priorité inconnue : {quote}.", { quote: quote(text.trim()) }));
}

const TAG = /^[\p{L}\p{N}_\-/]+$/u;

/** Étiquettes séparées par des virgules, des points-virgules ou des espaces, avec ou sans « # ». */
export function parseTags(text: string): string[] | Bad {
  const tags: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const tag = raw.replace(/^#+/, "");
    if (!tag) continue;
    if (!TAG.test(tag) || tag.length > 40) return new Bad(tr("Étiquette refusée : {quote}.", { quote: quote(raw) }));
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
  }
  return tags.length > 20 ? new Bad(tr("20 étiquettes au plus.")) : tags;
}

/** Séparateurs des milliers retirés : « 1.234,56 » (à la française) ou « 1,234.56 » (à l'anglaise). */
function withoutThousands(t: string): string {
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(t)) return t.replace(/\./g, "");
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(t)) return t.replace(/,/g, "");
  return t;
}

/** Symbole ou nom de l'euro, avant ou après le nombre (« 312 € », « €312 », « 45 EUR »). */
const withoutEuro = (t: string) => t.replace(/^€\s*/, "").replace(/\s*(?:€|eur|euros?)$/i, "").trim();

/** Montant en centimes : « 312 », « 45,90 € », « €45.90 », « 1 234,50 EUR », « 2,450.00 », 312.5 (Excel). */
export function parseMoney(text: string): number | Bad {
  let t = withoutThousands(withoutEuro(text.trim()));
  // Valeur d'Excel avec des décimales parasites (45.899999999).
  if (/^\d+\.\d{3,}$/.test(t)) t = Number(t).toFixed(2);
  const cents = parseAmount(t);
  if (cents === null || Number.isNaN(cents)) return new Bad(tr("Montant illisible : {quote}.", { quote: quote(text.trim()) }));
  if (cents > 10_000_000_000) return new Bad(tr("Montant hors limites."));
  return cents;
}

/**
 * Montant d'un relevé, avec son signe : « -42,50 », « −1 234,56 € », « +2 450,00 », « 1.234,56 ».
 * En centimes, négatif pour un débit.
 */
export function parseSignedMoney(text: string): number | Bad {
  let t = withoutEuro(text.trim());
  let sign = 1;
  const lead = /^([-−+])\s*/.exec(t);
  if (lead) {
    if (lead[1] !== "+") sign = -1;
    t = t.slice(lead[0].length);
  } else if (/^\(.*\)$/.test(t)) {
    sign = -1;
    t = t.slice(1, -1);
  } else if (/[-−]$/.test(t)) {
    sign = -1;
    t = t.slice(0, -1).trim();
  }
  // Séparateurs des milliers ; valeur d'Excel avec des décimales parasites.
  t = withoutThousands(withoutEuro(t));
  if (/^\d+\.\d{3,}$/.test(t)) t = Number(t).toFixed(2);
  const cents = parseAmount(t);
  if (cents === null || Number.isNaN(cents)) return new Bad(tr("Montant illisible : {quote}.", { quote: quote(text.trim()) }));
  if (cents > 10_000_000_000) return new Bad(tr("Montant hors limites."));
  return sign * cents;
}

/** Montant écrit comme tel dans une ligne de texte (« 312 € », « 19,99 EUR », « €2,450.00 »). */
export function looksLikeMoney(text: string): boolean {
  const t = text.trim();
  return (
    /^[-−+]?\s*\d[\d\s  ]*(?:[.,]\d{1,2})?\s*(?:€|eur|euros?)$/i.test(t) ||
    /^[-−+]?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*(?:€|eur|euros?)$/i.test(t) ||
    /^[-−+]?\s*€\s*\d[\d,]*(?:\.\d{1,2})?$/.test(t)
  );
}

const PERIODS: [RegExp, number | null][] = [
  [/^(?:ponctuel(?:le)?|unique|une (?:seule )?fois|aucune?|non|sans|one off|one-off|once|none|no)$/, null],
  [/^(?:mensuel(?:le)?|tous les mois|chaque mois|par mois|mois|monthly|every month|per month|month)$/, 1],
  [/^(?:bimestriel(?:le)?|bimonthly|every two months)$/, 2],
  [/^(?:trimestriel(?:le)?|trimestre|par trimestre|chaque trimestre|quarterly|quarter|every quarter|per quarter)$/, 3],
  [/^(?:semestriel(?:le)?|semestre|par semestre|chaque semestre|half yearly|half-yearly|every six months|twice a year)$/, 6],
  [/^(?:annuel(?:le)?|tous les ans|chaque annee|par an|annee|an|yearly|annual|annually|every year|per year|year)$/, 12],
];
const PERIOD_MONTHS = [1, 2, 3, 6, 12];

export function isPeriodText(text: string): boolean {
  return !isBad(parsePeriod(text)) && text.trim() !== "";
}

/** Périodicité d'une obligation, en mois ; `null` : ponctuelle. */
export function parsePeriod(text: string): number | null | Bad {
  const t = key(text);
  for (const [re, months] of PERIODS) if (re.test(t)) return months;
  const m = /^(?:tous les |chaque |every )?(\d{1,2})(?: mois| months)?$/.exec(t);
  if (m && PERIOD_MONTHS.includes(Number(m[1]))) return Number(m[1]);
  return new Bad(tr("Périodicité inconnue : {quote}.", { quote: quote(text.trim()) }));
}

const YES = new Set(["oui", "o", "vrai", "x", "1", "yes", "y", "true", "✓", "✔"]);
const NOT = new Set(["non", "n", "faux", "0", "no", "false", "-"]);

export function parseYesNo(text: string): boolean | Bad {
  const t = key(text);
  if (YES.has(t)) return true;
  if (NOT.has(t) || t === "") return false;
  return new Bad(tr("Valeur attendue : oui ou non ({quote}).", { quote: quote(text.trim()) }));
}

/** Répétitions exprimées comme une fréquence (« hebdomadaire »), calées sur `base`. */
function frequency(t: string, base: DayKey): Recurrence | null {
  const date = fromDayKey(base);
  if (/^(?:quotidien(?:ne)?|daily)$/.test(t)) return { kind: "daily", interval: 1 };
  if (/^(?:hebdomadaire|weekly)$/.test(t)) return { kind: "weekly", interval: 1, days: [weekday(base)] };
  if (/^(?:mensuel(?:le)?|monthly)$/.test(t)) return { kind: "monthly", interval: 1, day: date.getDate() };
  if (/^(?:annuel(?:le)?|yearly|annually)$/.test(t)) return { kind: "yearly", interval: 1, month: date.getMonth() + 1, day: date.getDate() };
  return null;
}

/** Répétition (« chaque lundi », « tous les 3 mois », « mensuelle ») ; `null` : aucune. */
export function parseRepeat(text: string, base: DayKey, allowAfterDone: boolean): Recurrence | null | Bad {
  const t = key(text);
  if (/^(?:non|aucune?|jamais|sans|ponctuel(?:le)?|une fois|no|none|never|once|one off|one-off)$/.test(t)) return null;
  const rule = frequency(t, base) ?? parseRepeatWords(text.trim(), base);
  if (!rule) return new Bad(tr("Répétition illisible : {quote}.", { quote: quote(text.trim()) }));
  if (rule.kind === "afterDone" && !allowAfterDone) return new Bad(tr("Répétition après achèvement réservée aux tâches."));
  return rule;
}

/** Vrai si le texte décrit une répétition (ligne de texte sans nom de champ). */
export function isRepeatText(text: string, base: DayKey): boolean {
  const t = key(text);
  return frequency(t, base) !== null || parseRepeatWords(text.trim(), base) !== null;
}

// ——— Habitudes ———

/** Jours de la semaine (0 = dimanche), d'après le début de leur nom (français, puis anglais). */
const WEEKDAYS: [RegExp, number][] = [
  [/^mon(?:day)?$/, 1],
  [/^tue(?:s(?:day)?)?$/, 2],
  [/^wed(?:nesday)?$/, 3],
  [/^thu(?:r(?:s(?:day)?)?)?$/, 4],
  [/^fri(?:day)?$/, 5],
  [/^sat(?:urday)?$/, 6],
  [/^sun(?:day)?$/, 0],
  [/^lu(?:n(?:di)?)?$/, 1],
  [/^ma(?:r(?:di)?)?$/, 2],
  [/^me(?:r(?:credi)?)?$/, 3],
  [/^je(?:u(?:di)?)?$/, 4],
  [/^ve(?:n(?:dredi)?)?$/, 5],
  [/^sa(?:m(?:edi)?)?$/, 6],
  [/^di(?:m(?:anche)?)?$/, 0],
];

/**
 * Fréquence d'une habitude : « Chaque jour », « 3 fois par semaine », « lun, mer, ven »,
 * « en semaine », « le week-end ». Vide : chaque jour.
 */
export function parseHabitFrequency(text: string): Frequency | Bad {
  const t = key(text).replace(/\./g, "");
  if (!t || /^(?:chaque jour|tous les jours|quotidien(?:ne)?|journali(?:er|ere)|(?:1 fois |une fois )?par jour|every day|daily|each day)$/.test(t)) return { kind: "quotidien" };
  const times = /^(\d)\s*(?:fois|x|times?)?\s*(?:par|\/|a la|chaque|a|per|each) ?(?:semaine|week)$/.exec(t) ?? (/^(?:once|twice) (?:a|per) week$/.test(t) ? [t, t.startsWith("once") ? "1" : "2"] : null);
  if (times) {
    const n = Number(times[1]);
    return n >= 1 && n <= 7 ? { kind: "semaine", times: n } : new Bad(tr("De 1 à 7 fois par semaine."));
  }
  if (/^(?:en semaine|du lundi au vendredi|jours ouvres|jours de semaine|weekdays|on weekdays|monday to friday)$/.test(t)) return { kind: "jours", days: [1, 2, 3, 4, 5] };
  if (/^(?:le |les |at |on )?(?:the )?week[- ]?ends?$/.test(t)) return { kind: "jours", days: [6, 0] };
  const days: number[] = [];
  for (const word of t.replace(/^(?:le|les|chaque|tous les|every|each|on)\s+/, "").split(/[\s,;/+]+|\bet\b|\band\b/).filter(Boolean)) {
    const day = WEEKDAYS.find(([re]) => re.test(word.replace(/s$/, "")))?.[1];
    if (day === undefined) return new Bad(tr("Fréquence illisible : {quote}.", { quote: quote(text.trim()) }));
    if (!days.includes(day)) days.push(day);
  }
  return days.length > 0 ? { kind: "jours", days } : new Bad(tr("Fréquence illisible : {quote}.", { quote: quote(text.trim()) }));
}

// ——— Contacts ———

const MONTH_WORDS = ["janv", "fevr", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"];
const EN_MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Anniversaire : « 14/05/1990 », « 1990-05-14 », « 14 mai 1990 », date d'Excel ; sans l'année
 * (« 14/05 », « 14 mai ») : « --05-14 ».
 */
export function parseBirthday(text: string, date1904 = false): string | Bad {
  const t = text.trim();
  const bad = () => new Bad(tr("Anniversaire illisible : {quote}.", { quote: quote(t) }));
  const full = (y: number, m: number, d: number) => {
    const day = makeDay(y, m, d);
    return day && y >= 1900 && y <= new Date().getFullYear() ? day : bad();
  };
  const partial = (m: number, d: number) => (makeDay(2000, m, d) ? `--${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : bad());
  const serial = excelSerial(t);
  if (serial !== null) return serialDay(serial, date1904);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return full(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/.exec(t);
  if (m) return m[3] ? full(Number(m[3]), Number(m[2]), Number(m[1])) : partial(Number(m[2]), Number(m[1]));
  m = /^(1er|\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?,?(?:\s+(\d{4}))?$/.exec(key(t));
  if (m) {
    const word = m[2]!;
    const month =
      MONTH_WORDS.findIndex((w) => word.startsWith(w.slice(0, 3)) && w.startsWith(word.slice(0, 3))) + 1 ||
      EN_MONTH_WORDS.findIndex((w) => w.startsWith(word.slice(0, 3)) && word.slice(0, 3).length === 3) + 1;
    const day = m[1] === "1er" ? 1 : Number(m[1]);
    if (month > 0) return m[3] ? full(Number(m[3]), month, day) : partial(month, day);
  }
  // « May 14, 1990 », « May 14 »
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(key(t));
  if (m) {
    const word = m[1]!;
    const month = EN_MONTH_WORDS.findIndex((w) => w.startsWith(word.slice(0, 3)) && word.length >= 3) + 1;
    if (month > 0) return m[3] ? full(Number(m[3]), month, Number(m[2])) : partial(month, Number(m[2]));
  }
  return bad();
}

/** Plusieurs valeurs dans une cellule : séparées par « ; », « , » ou un retour à la ligne. */
export function splitValues(text: string): string[] {
  return text
    .split(/\s*[;\n]\s*|\s*,\s+(?=[^\d\s])|\s*,\s*(?=\S+@)/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export const isPhone = (value: string) => /\d/.test(value) && /^[\d\s+\-.()/]+$/.test(value);
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(value);
