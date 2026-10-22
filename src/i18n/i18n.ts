/**
 * Langue de l'interface. Le code est écrit en français ; chaque texte affiché passe par
 * `tr("Texte en français")`. L'anglais a son dictionnaire indexé par le texte français (`en.ts`) ;
 * les autres langues ont le leur dans `locales/<code>.json`, indexé par l'identifiant court du
 * texte (`textId`). Seul le dictionnaire de la langue choisie est chargé (avec l'anglais en
 * secours pour un texte pas encore traduit).
 *
 * Les valeurs variables s'écrivent entre accolades : `tr("Rappel manqué : {title}", { title })`.
 * Les pluriels passent par `trn(n, "{n} tâche", "{n} tâches")`, qui suit la règle de chaque langue
 * (Intl.PluralRules) : la forme « une » reçoit le premier texte, toutes les autres le second, dont
 * la traduction peut détailler chaque forme ({ one, few, many, other }) pour le russe, le polonais…
 *
 * Un même mot français qui se traduit de deux façons reçoit un contexte après « | » :
 * `tr("Annuler|action")` s'affiche « Annuler » en français, « Undo » en anglais (« Cancel » sans contexte).
 *
 * La langue est une préférence (« langue ») lue avant le premier affichage ; la changer
 * recharge la fenêtre, si bien que les textes calculés une fois au chargement suivent aussi.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { flushPrefs, readPref, writePref } from "../lib/storage";
import { textId } from "./textId";

export type Lang = "en" | "fr" | "es" | "pt" | "de" | "it" | "ru" | "uk" | "pl" | "nl" | "zh" | "ja" | "ko" | "hi" | "id" | "tr" | "vi";
export type Vars = Record<string, string | number | null | undefined>;

/** Une traduction : un texte, ou les formes d'un pluriel selon la catégorie de la langue. */
export type Entry = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Dictionary = Readonly<Record<string, Entry>>;

/** Langues proposées, chacune écrite dans sa propre langue ; l'anglais d'abord, la langue internationale. */
export const LANGUAGES: readonly { id: Lang; label: string; locale: string }[] = [
  { id: "en", label: "English", locale: "en-GB" },
  { id: "fr", label: "Français", locale: "fr-FR" },
  { id: "es", label: "Español", locale: "es-ES" },
  { id: "pt", label: "Português (Brasil)", locale: "pt-BR" },
  { id: "de", label: "Deutsch", locale: "de-DE" },
  { id: "it", label: "Italiano", locale: "it-IT" },
  { id: "nl", label: "Nederlands", locale: "nl-NL" },
  { id: "pl", label: "Polski", locale: "pl-PL" },
  { id: "ru", label: "Русский", locale: "ru-RU" },
  { id: "uk", label: "Українська", locale: "uk-UA" },
  { id: "tr", label: "Türkçe", locale: "tr-TR" },
  { id: "hi", label: "हिन्दी", locale: "hi-IN" },
  { id: "id", label: "Bahasa Indonesia", locale: "id-ID" },
  { id: "vi", label: "Tiếng Việt", locale: "vi-VN" },
  { id: "zh", label: "中文（简体）", locale: "zh-CN" },
  { id: "ja", label: "日本語", locale: "ja-JP" },
  { id: "ko", label: "한국어", locale: "ko-KR" },
];

const PREF = "langue";
const isLang = (v: unknown): v is Lang => LANGUAGES.some((l) => l.id === v);

/** Dictionnaires des langues autres que le français et l'anglais, chargés à la demande. */
const LOCALES = import.meta.glob<Dictionary>("./locales/*.json", { import: "default" });

let current: Lang = "fr";
/** Anglais : indexé par le texte français. */
let english: Readonly<Record<string, string>> | null = null;
/** Autre langue : indexée par l'identifiant du texte. */
let local: Dictionary | null = null;
let plurals = new Intl.PluralRules("fr-FR");

/** Langue d'un nouvel utilisateur : celle de Windows si Aqueli la parle, l'anglais sinon. */
export function systemLang(language = typeof navigator === "undefined" ? "" : (navigator.language ?? "")): Lang {
  const primary = language.toLowerCase().split(/[-_]/)[0] ?? "";
  return isLang(primary) ? primary : "en";
}

/** Langue choisie au début de l'installation (sinon celle de Windows), donnée par le cœur. */
async function installLang(): Promise<Lang | null> {
  if (!isTauri()) return null;
  const code = await invoke<string>("language_default").catch(() => null);
  return isLang(code) ? code : null;
}

/** Lit la langue choisie (préférences déjà chargées) et charge sa traduction. */
export async function initLanguage(): Promise<void> {
  const saved = readPref<Lang | null>(PREF, null, (v): v is Lang | null => isLang(v));
  const next = saved ?? (await installLang()) ?? systemLang();
  // Langue jamais choisie : celle de l'installation (ou de Windows) est notée, pour que le cœur
  // (menu de l'icône, notifications) parle la même langue que l'interface.
  if (!saved) writePref(PREF, next);
  await load(next);
}

async function load(next: Lang): Promise<void> {
  current = next;
  plurals = new Intl.PluralRules(locale());
  if (typeof document !== "undefined") document.documentElement.lang = next;
  english = next === "fr" ? null : (await import("./en")).EN;
  const loader = LOCALES[`./locales/${next}.json`];
  local = next === "fr" || next === "en" || !loader ? null : await loader();
}

export function lang(): Lang {
  return current;
}

/** Langue et format régional des dates et des nombres. */
export function locale(): string {
  return LANGUAGES.find((l) => l.id === current)?.locale ?? "fr-FR";
}

/** Change de langue : la préférence est enregistrée, puis la fenêtre se recharge. */
export async function setLanguage(next: Lang): Promise<void> {
  if (next === current) return;
  writePref(PREF, next);
  await flushPrefs();
  window.location.reload();
}

/** Remplace {nom} par sa valeur ; une accolade inconnue reste telle quelle. */
function fill(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name] ?? "") : all));
}

/** « Annuler|action » → « Annuler ». */
const withoutContext = (text: string) => {
  const bar = text.indexOf("|");
  return bar < 0 ? text : text.slice(0, bar);
};

/** Traduction brute d'un texte : la langue choisie, l'anglais en secours, sinon le français. */
function lookup(fr: string): Entry {
  const own = local?.[textId(fr)];
  if (own !== undefined) return own;
  return english?.[fr] ?? withoutContext(fr);
}

const asText = (entry: Entry): string => (typeof entry === "string" ? entry : (entry.other ?? Object.values(entry)[0] ?? ""));

/** Texte de l'interface dans la langue choisie. */
export function tr(fr: string, vars?: Vars): string {
  const text = asText(lookup(fr));
  return vars ? fill(text, vars) : text;
}

/** Texte qui dépend d'un nombre : `{n}` reçoit le nombre. */
export function trn(n: number, one: string, many: string, vars?: Vars): string {
  const category = plurals.select(n);
  // La forme « une » ne vaut que pour 1 (et 0 en français) : en russe ou en ukrainien, 21 prend
  // la forme « one » du texte pluriel (« 21 задача »), pas le texte écrit pour un seul élément.
  const single = category === "one" && (Math.abs(n) === 1 || current === "fr" || current === "en");
  const entry = lookup(single ? one : many);
  const text = typeof entry === "string" ? entry : (entry[category] ?? entry.other ?? asText(entry));
  return fill(text, { n, ...vars });
}

/**
 * Texte proposé par Aqueli mais enregistré tel quel dans les données (type d'un numéro,
 * répétition…) : il reste en français, quelle que soit la langue, et s'affiche par `trValue`.
 */
export const fr = (text: string): string => text;

/** Valeur enregistrée, traduite si c'est un des textes proposés (`fr`) ; sinon telle quelle. */
export function trValue(text: string): string {
  if (current === "fr") return text;
  const own = local?.[textId(text)];
  if (own !== undefined) return asText(own);
  return english?.[text] ?? text;
}

/**
 * Texte d'un fichier exporté (colonnes d'un CSV) : en français, ou en anglais dans toute autre
 * langue, car l'import ne lit que ces deux langues et le fichier doit se réimporter.
 */
export function trExport(text: string): string {
  if (current === "fr") return text;
  return english?.[text] ?? withoutContext(text);
}

/** Pour les tests : langue et dictionnaires donnés directement. */
export function setLanguageForTests(next: Lang, dict: Readonly<Record<string, string>> | null, own: Dictionary | null = null): void {
  current = next;
  plurals = new Intl.PluralRules(locale());
  english = dict;
  local = own;
}
