import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./i18n";

const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const nsis = conf.bundle.windows.nsis as { languages: string[]; customLanguageFiles: Record<string, string>; displayLanguageSelector: boolean };

/** Textes d'un fichier de langue de l'installateur : clé → texte. */
const strings = (lang: string) => {
  const source = readFileSync(`src-tauri/${nsis.customLanguageFiles[lang]}`, "utf8");
  const lines = source.split(/\r?\n/).filter((l) => l.startsWith("LangString "));
  return new Map(
    lines.map((l) => {
      const m = l.match(/^LangString (\w+) \$\{LANG_(\w+)\} "(.*)"$/);
      expect(m, `${lang} : ${l}`).not.toBeNull();
      expect(m![2], `${lang} : ${l}`).toBe(lang.toUpperCase());
      return [m![1]!, m![3]!] as const;
    }),
  );
};

describe("installateur", () => {
  it("propose au lancement chacune des langues d'Aqueli", () => {
    expect(nsis.displayLanguageSelector).toBe(true);
    expect(nsis.languages).toHaveLength(LANGUAGES.length);
    expect(Object.keys(nsis.customLanguageFiles).sort()).toEqual([...nsis.languages].sort());
  });

  it("a les mêmes textes dans chaque langue", () => {
    const reference = [...strings("English").keys()].sort();
    for (const lang of nsis.languages) {
      const texts = strings(lang);
      expect([...texts.keys()].sort(), lang).toEqual(reference);
      for (const [key, text] of texts) {
        expect(text.trim(), `${lang} ${key}`).not.toBe("");
        // Un guillemet droit fermerait le texte NSIS avant la fin.
        expect(text.replace(/\$\\"/g, ""), `${lang} ${key}`).not.toMatch(/"/);
      }
      expect(texts.get("aqWelcomeText"), lang).toContain("$(^ClickNext)");
    }
  });
});
