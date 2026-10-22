/**
 * Les exemples de saisie rapide affichés dans chaque langue (aide de la capture, du champ des
 * tâches et du calendrier) doivent marcher tels quels : date et heure en chiffres, #étiquette, !!!.
 */
import { describe, expect, it } from "vitest";
import { parseQuickEvent } from "../calendar/quickEvent";
import { parseQuickAdd } from "../tasks/quickAdd";
import { textId } from "./textId";

const LOCALES = import.meta.glob<Record<string, string | Record<string, string>>>("./locales/*.json", { import: "default", eager: true });
const NOW = new Date(2026, 9, 21, 9);
const text = (dict: Record<string, unknown>, fr: string) => String(dict[textId(fr)] ?? "");
/** Ce qui est entre les guillemets de la langue. */
const quoted = (sentence: string) => /[«“„‘「]\s*([^»”“’」]+?)\s*[»”“’」]/u.exec(sentence)?.[1] ?? "";

describe("exemples de saisie rapide dans chaque langue", () => {
  for (const [file, dict] of Object.entries(LOCALES)) {
    const lang = file.replace(/^.*\/(\w+)\.json$/, "$1");
    it(`${lang} : l'exemple de tâche donne la date, l'heure, l'étiquette et la priorité`, () => {
      for (const example of [text(dict, "Appeler le garage vendredi 14h #voiture !haute"), quoted(text(dict, "Ajouter une tâche : « Appeler le garage vendredi 14h #voiture !haute »"))]) {
        const r = parseQuickAdd(example, NOW, []);
        expect(r, example).toMatchObject({ dueDate: "2026-10-24", dueTime: "14:00", priority: 3 });
        expect(r.tags, example).toHaveLength(1);
        expect(r.title.trim(), example).not.toBe("");
        expect(r.title, example).not.toMatch(/\d|#|!/);
      }
    });

    it(`${lang} : les exemples d'événement donnent le jour et l'heure`, () => {
      const dinner = parseQuickEvent(quoted(text(dict, "Ajouter un événement : « Dîner avec Paul vendredi 20h »")), NOW, [], 60);
      expect(dinner).toMatchObject({ startDate: "2026-10-24", startTime: "20:00" });
      const dentist = parseQuickEvent(text(dict, "Dentiste jeudi 9h30"), NOW, [], 60);
      expect(dentist).toMatchObject({ startDate: "2026-10-23", startTime: "09:30" });
    });
  }
});

describe("dates en chiffres comprises dans toutes les langues", () => {
  it("lit jour/mois, mois/jour quand le jour dépasse 12, et l'année d'abord", () => {
    expect(parseQuickAdd("Appeler 24/10", NOW, []).dueDate).toBe("2026-10-24");
    expect(parseQuickAdd("Appeler 10/24", NOW, []).dueDate).toBe("2026-10-24");
    expect(parseQuickAdd("Appeler 2026-11-03", NOW, []).dueDate).toBe("2026-11-03");
    expect(parseQuickAdd("Appeler 2026/11/03", NOW, []).dueDate).toBe("2026-11-03");
  });

  it("reconnaît une étiquette dans les écritures à signes combinés", () => {
    expect(parseQuickAdd("गैराज को फ़ोन करना #कार", NOW, []).tags).toEqual(["कार"]);
  });
});
