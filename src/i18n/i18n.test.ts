import { afterEach, describe, expect, it } from "vitest";
import { EN } from "./en";
import { fr, lang, LANGUAGES, locale, setLanguageForTests, systemLang, tr, trn, trValue } from "./i18n";
import { textId } from "./textId";

// Tout le code de l'interface (hors tests), lu comme du texte.
const SOURCES = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx", "!./en.ts", "!./i18n.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Arguments en littéraux "…" d'un appel `name(` : l'argument de rang `index` pour chaque appel. */
function literalArgs(source: string, name: string, indexes: readonly number[]): { keys: string[]; dynamic: number } {
  const keys: string[] = [];
  let dynamic = 0;
  const re = new RegExp(`(?<![\\w.])${name}\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 1;
    let arg = 0;
    const found = new Map<number, string>();
    const starts = new Map<number, number>([[0, i]]);
    while (i < source.length && depth > 0) {
      const c = source[i]!;
      if (c === '"' || c === "'" || c === "`") {
        const end = skipString(source, i);
        if (c === '"' && depth === 1 && source.slice(starts.get(arg)!, i).trim() === "") found.set(arg, JSON.parse(source.slice(i, end)) as string);
        i = end;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
      else if (c === "," && depth === 1) {
        arg++;
        starts.set(arg, i + 1);
      }
      i++;
    }
    for (const index of indexes) {
      const key = found.get(index);
      if (key === undefined) dynamic++;
      else keys.push(key);
    }
  }
  return { keys, dynamic };
}

function skipString(s: string, start: number): number {
  const quote = s[start];
  let i = start + 1;
  while (i < s.length && s[i] !== quote) {
    if (s[i] === "\\") i++;
    else if (quote === "`" && s[i] === "$" && s[i + 1] === "{") {
      // ${…} : saute l'expression (accolades équilibrées)
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s[i] === "{") depth++;
        else if (s[i] === "}") depth--;
        else if (s[i] === '"' || s[i] === "'" || s[i] === "`") {
          i = skipString(s, i);
          continue;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return i + 1;
}

function allKeys(): { keys: Map<string, string>; dynamic: string[] } {
  const keys = new Map<string, string>();
  const dynamic: string[] = [];
  for (const [file, source] of Object.entries(SOURCES)) {
    for (const [name, indexes] of [["tr", [0]], ["trn", [1, 2]], ["fr", [0]]] as const) {
      const found = literalArgs(source, name, indexes);
      for (const k of found.keys) if (!keys.has(k)) keys.set(k, file);
      if (found.dynamic > 0) dynamic.push(`${file} : ${name}(…) sans texte écrit`);
    }
  }
  return { keys, dynamic };
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("traduction anglaise", () => {
  const { keys, dynamic } = allKeys();

  it("chaque texte passé à tr, trn ou fr est écrit en toutes lettres", () => {
    expect(dynamic).toEqual([]);
    expect(keys.size).toBeGreaterThan(3000);
  });

  it("chaque texte de l'interface a sa traduction", () => {
    const missing = [...keys.entries()].filter(([k]) => !(k in EN)).map(([k, file]) => `${file} : ${k}`);
    expect(missing).toEqual([]);
  });

  it("une traduction garde les mêmes valeurs entre accolades", () => {
    // Seul le nombre {n} peut disparaître (« {n} fois par semaine » → « Once a week »).
    const same = (k: string, v: string) => placeholders(k).filter((p) => p !== "n" || placeholders(v).includes("n")).join() === placeholders(v).join();
    const wrong = Object.entries(EN).filter(([k, v]) => !same(k, v)).map(([k, v]) => `${k} → ${v}`);
    expect(wrong).toEqual([]);
  });

  it("aucune traduction vide", () => {
    expect(Object.entries(EN).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });
});

describe("tr et trn", () => {
  afterEach(() => setLanguageForTests("fr", null));

  it("en français, le texte tel quel avec ses valeurs", () => {
    expect(lang()).toBe("fr");
    expect(locale()).toBe("fr-FR");
    expect(tr("Rappel manqué : {title}", { title: "Pain" })).toBe("Rappel manqué : Pain");
    expect(tr("{a} et {inconnu}", { a: 1 })).toBe("1 et {inconnu}");
    expect([0, 1, 2].map((n) => trn(n, "{n} tâche", "{n} tâches"))).toEqual(["0 tâche", "1 tâche", "2 tâches"]);
  });

  it("en anglais, la traduction et le pluriel anglais", () => {
    setLanguageForTests("en", { "{n} tâche": "{n} task", "{n} tâches": "{n} tasks", Domicile: "Home", "Rappel manqué : {title}": "Missed reminder: {title}" });
    expect(locale()).toBe("en-GB");
    expect(tr("Rappel manqué : {title}", { title: "Bread" })).toBe("Missed reminder: Bread");
    expect([0, 1, 2].map((n) => trn(n, "{n} tâche", "{n} tâches"))).toEqual(["0 tasks", "1 task", "2 tasks"]);
    // Une valeur enregistrée reste en français ; elle s'affiche traduite, ou telle quelle si elle est libre.
    expect(fr("Domicile")).toBe("Domicile");
    expect([trValue("Domicile"), trValue("Chalet")]).toEqual(["Home", "Chalet"]);
    // Un texte sans traduction reste en français plutôt que de disparaître.
    expect(tr("Texte inconnu")).toBe("Texte inconnu");
  });
});

// Dictionnaires des autres langues, indexés par l'identifiant du texte français.
const LOCALE_FILES = import.meta.glob<Record<string, string | Record<string, string>>>("./locales/*.json", { import: "default", eager: true });
const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

describe("autres langues", () => {
  const ids = Object.keys(EN).map((k) => [textId(k), k] as const);

  it("deux textes ne partagent jamais un identifiant", () => {
    expect(new Set(ids.map(([id]) => id)).size).toBe(ids.length);
  });

  it("chaque langue proposée a son dictionnaire", () => {
    const codes = LANGUAGES.map((l) => l.id).filter((c) => c !== "fr" && c !== "en");
    expect(codes).toHaveLength(16);
    expect(codes.filter((c) => !LOCALE_FILES[`./locales/${c}.json`])).toEqual([]);
  });

  for (const [file, dict] of Object.entries(LOCALE_FILES)) {
    const code = file.replace(/^.*\/(\w+)\.json$/, "$1");
    it(`${code} : chaque texte traduit, avec les mêmes valeurs entre accolades`, () => {
      const problems: string[] = [];
      for (const [id, fr] of ids) {
        const value = dict[id];
        if (value === undefined) {
          problems.push(`manquant ${id} : ${fr}`);
          continue;
        }
        const forms = typeof value === "string" ? [value] : Object.entries(value).map(([form, text]) => {
          if (!PLURAL_FORMS.has(form)) problems.push(`forme inconnue « ${form} » ${id}`);
          return text;
        });
        for (const text of forms) {
          if (!text.trim()) problems.push(`vide ${id} : ${fr}`);
          const expected = placeholders(fr).filter((p) => p !== "n" || placeholders(text).includes("n")).join();
          if (expected !== placeholders(text).join()) problems.push(`accolades ${id} : ${fr} → ${text}`);
        }
      }
      const known = new Set(ids.map(([id]) => id));
      for (const id of Object.keys(dict)) if (!known.has(id)) problems.push(`inconnu ${id}`);
      expect(problems).toEqual([]);
    });
  }
});

describe("pluriels des autres langues", () => {
  afterEach(() => setLanguageForTests("fr", null));

  it("suivent les formes de chaque langue", () => {
    setLanguageForTests("ru", EN, {
      [textId("{n} tâche")]: "{n} задача",
      [textId("{n} tâches")]: { one: "{n} задача", few: "{n} задачи", many: "{n} задач", other: "{n} задачи" },
      [textId("Opération rangée.")]: "Операция перемещена.",
      [textId("{n} opérations rangées.")]: { one: "{n} операция перемещена.", few: "{n} операции перемещены.", many: "{n} операций перемещено." },
    });
    expect([1, 2, 5, 21, 22].map((n) => trn(n, "{n} tâche", "{n} tâches"))).toEqual(["1 задача", "2 задачи", "5 задач", "21 задача", "22 задачи"]);
    // Le texte écrit pour un seul élément ne sert que pour 1.
    expect([1, 21, 25].map((n) => trn(n, "Opération rangée.", "{n} opérations rangées."))).toEqual(["Операция перемещена.", "21 операция перемещена.", "25 операций перемещено."]);
    // Un texte pas encore traduit : l'anglais.
    expect(tr("Rappel manqué : {title}", { title: "X" })).toBe(EN["Rappel manqué : {title}"]!.replace("{title}", "X"));
  });

  it("une langue sans pluriel n'a qu'une forme", () => {
    setLanguageForTests("ja", EN, { [textId("{n} tâches")]: "{n} 件のタスク" });
    expect([1, 3].map((n) => trn(n, "{n} tâche", "{n} tâches"))).toEqual(["1 件のタスク", "3 件のタスク"]);
  });

  it("la langue de Windows, sinon l'anglais", () => {
    expect(systemLang("de-AT")).toBe("de");
    expect(systemLang("pt-PT")).toBe("pt");
    expect(systemLang("ar-SA")).toBe("ar");
    expect(systemLang("el-GR")).toBe("en");
    expect(systemLang("fr-CA")).toBe("fr");
  });
});
