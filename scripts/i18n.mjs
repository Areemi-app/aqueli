#!/usr/bin/env node
/**
 * Catalogue des textes de l'interface et dictionnaires des langues.
 *
 *   node scripts/i18n.mjs catalogue              → écrit src/i18n/catalogue.json (tous les textes)
 *   node scripts/i18n.mjs manquants <langue>     → textes sans traduction dans locales/<langue>.json
 *   node scripts/i18n.mjs lot <langue> <n>       → les <n> premiers textes manquants (id, anglais, français)
 *   node scripts/i18n.mjs ajouter <langue> <f>   → ajoute les traductions du fichier JSON <f> ({ id: texte })
 *   node scripts/i18n.mjs bilan                  → nombre de textes traduits par langue
 *   node scripts/i18n.mjs nettoyer               → retire des dictionnaires les textes qui ne servent plus
 *
 * Le catalogue part du dictionnaire anglais (`src/i18n/en.ts`), qu'un test tient complet : chaque
 * texte passé à tr, trn ou fr y figure. Chaque entrée porte son identifiant (`textId`), le texte
 * français, le texte anglais et, pour un pluriel, sa forme (« one » ou « other »).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const LOCALES = path.join(SRC, "i18n", "locales");

/** Même calcul que src/i18n/textId.ts. */
export function textId(fr) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < fr.length; i++) {
    hash ^= fr.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

/** Dictionnaire anglais : texte français → anglais. */
function readEnglish() {
  const source = fs.readFileSync(path.join(SRC, "i18n", "en.ts"), "utf8");
  const start = source.indexOf("{", source.indexOf("export const EN"));
  const end = source.lastIndexOf("}");
  return new Function(`return ${source.slice(start, end + 1)}`)();
}

/** Fichiers de l'interface (hors tests et dictionnaires). */
function sourceFiles(dir = SRC, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== "en.ts") out.push(p);
  }
  return out;
}

/** Pluriels : les deux textes de chaque appel trn(n, "une forme", "les autres"). */
function pluralPairs() {
  const pairs = new Map();
  const literal = String.raw`"((?:[^"\\]|\\.)*)"`;
  const re = new RegExp(String.raw`(?<![\w.])trn\((?:[^,()]|\([^()]*\))+,\s*${literal}\s*,\s*${literal}`, "g");
  for (const file of sourceFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(re)) pairs.set(JSON.parse(`"${m[1]}"`), JSON.parse(`"${m[2]}"`));
  }
  return pairs;
}

export function catalogue() {
  const english = readEnglish();
  const pairs = pluralPairs();
  const others = new Set(pairs.values());
  return Object.entries(english).map(([fr, en]) => {
    const entry = { id: textId(fr), fr, en };
    if (pairs.has(fr)) entry.plural = "one";
    else if (others.has(fr)) entry.plural = "other";
    return entry;
  });
}

function readLocale(lang) {
  const file = path.join(LOCALES, `${lang}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function writeLocale(lang, dict) {
  // Ordre du catalogue, pour des différences lisibles d'une version à l'autre.
  const order = new Map(catalogue().map((e, i) => [e.id, i]));
  const sorted = Object.fromEntries(Object.entries(dict).sort(([a], [b]) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9)));
  fs.mkdirSync(LOCALES, { recursive: true });
  fs.writeFileSync(path.join(LOCALES, `${lang}.json`), `${JSON.stringify(sorted, null, 1)}\n`);
}

function missing(lang) {
  const dict = readLocale(lang);
  return catalogue().filter((e) => !(e.id in dict));
}

const [command, lang, arg] = process.argv.slice(2);
if (command === "catalogue") {
  const list = catalogue();
  const ids = new Set(list.map((e) => e.id));
  if (ids.size !== list.length) throw new Error("Deux textes partagent un identifiant.");
  fs.writeFileSync(path.join(SRC, "i18n", "catalogue.json"), `${JSON.stringify(list, null, 1)}\n`);
  console.log(`${list.length} textes.`);
} else if (command === "manquants") {
  const list = missing(lang);
  for (const e of list) console.log(`${e.id}\t${e.en}`);
  console.log(`${list.length} textes sans traduction en « ${lang} ».`);
} else if (command === "lot") {
  for (const e of missing(lang).slice(0, Number(arg) || 200)) {
    console.log(`${e.id}${e.plural ? ` [${e.plural}]` : ""}\t${e.en}\t⟨${e.fr}⟩`);
  }
} else if (command === "ajouter") {
  const dict = readLocale(lang);
  const added = JSON.parse(fs.readFileSync(arg, "utf8"));
  const known = new Set(catalogue().map((e) => e.id));
  const unknown = Object.keys(added).filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Identifiants inconnus : ${unknown.join(", ")}`);
  writeLocale(lang, { ...dict, ...added });
  console.log(`${Object.keys(added).length} traductions ajoutées en « ${lang} ».`);
} else if (command === "bilan") {
  const total = catalogue().length;
  for (const file of fs.existsSync(LOCALES) ? fs.readdirSync(LOCALES) : []) {
    const code = file.replace(/\.json$/, "");
    console.log(`${code}\t${total - missing(code).length} / ${total}`);
  }
} else if (command === "nettoyer") {
  const known = new Set(catalogue().map((e) => e.id));
  for (const file of fs.existsSync(LOCALES) ? fs.readdirSync(LOCALES) : []) {
    const code = file.replace(/\.json$/, "");
    const dict = readLocale(code);
    const kept = Object.fromEntries(Object.entries(dict).filter(([id]) => known.has(id)));
    writeLocale(code, kept);
    console.log(`${code}\t${Object.keys(dict).length - Object.keys(kept).length} textes retirés`);
  }
} else {
  console.log("Commandes : catalogue, manquants <langue>, lot <langue> <n>, ajouter <langue> <fichier>, bilan, nettoyer");
}
