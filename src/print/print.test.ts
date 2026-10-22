import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarPrintDoc, printRange } from "../calendar/calendarPrint";
import type { CalItem } from "../calendar/items";
import { listPrintDoc } from "../lists/listPrint";
import type { List, ListItem } from "../lists/lists";
import { obligationsPrintDoc } from "../obligations/obligationPrint";
import type { Obligation } from "../obligations/obligations";
import { tasksPrintDoc } from "../tasks/taskPrint";
import type { Task } from "../tasks/tasks";
import { buildSheet, printDoc, runPrint } from "./print";

const TODAY = "2026-10-05";
/** Les montants en euros portent des espaces insécables. */
const plain = (text: string | undefined) => text?.replace(/\s/g, " ");

const task = (title: string, t: Partial<Task> = {}): Task =>
  ({
    id: title,
    title,
    notes: "",
    spaceId: "perso",
    dueDate: null,
    dueTime: null,
    priority: 0,
    estimate: null,
    tags: [],
    subtasks: [],
    inbox: false,
    doneAt: null,
    createdAt: 1,
    updatedAt: 1,
    recurrence: null,
    color: null,
    reminder: null,
    projectId: null,
    doing: false,
    ...t,
  }) as Task;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("feuille imprimée", () => {
  it("reprend titre, sections, cases et détails, en texte seulement", () => {
    const sheet = buildSheet(
      {
        title: "Courses <b>",
        subtitle: "3 éléments",
        empty: "Aucun élément.",
        sections: [
          { heading: "Frais", rows: [{ text: "Lait", checked: true, meta: "1,20 €" }, { text: "Beurre", checked: false }] },
          { heading: "Vide", rows: [] },
        ],
      },
      new Date(2026, 9, 5),
    );
    expect(sheet.querySelector("h1")!.textContent).toBe("Courses <b>");
    expect(sheet.querySelector("b")).toBeNull();
    expect(sheet.querySelector(".view-print-sub")!.textContent).toBe("3 éléments · Imprimé le 5 octobre 2026");
    expect([...sheet.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Frais"]);
    const rows = [...sheet.querySelectorAll(".view-print-row")];
    expect(rows.map((r) => r.textContent)).toEqual(["✓Lait1,20 €", "Beurre"]);
    expect((rows[0] as HTMLElement).dataset.done).toBe("true");
  });

  it("annonce une vue vide, puis retire la feuille après l'impression", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    printDoc({ title: "Tâches", sections: [], empty: "Aucune tâche." });
    expect(print).toHaveBeenCalledOnce();
    expect(document.querySelector(".view-print-empty")!.textContent).toBe("Aucune tâche.");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector(".view-print")).toBeNull();
  });

  it("sans écran qui imprime, rien ne se passe", () => {
    expect(runPrint()).toBe(false);
  });
});

describe("vues imprimées", () => {
  it("tâches : échéance, priorité, étiquettes, retard et sous-tâches", () => {
    const doc = tasksPrintDoc(
      "Tâches · Aujourd'hui",
      [
        { title: "En retard", tasks: [task("Facture", { dueDate: "2026-10-02", priority: 3, tags: ["maison"] })] },
        { title: "", tasks: [task("Valise", { dueDate: TODAY, dueTime: "18:00", subtasks: [{ id: "s", title: "Chargeur", done: true }] })] },
      ],
      TODAY,
      { spaceName: () => "Perso" },
    );
    expect(doc.sections[0]!.rows).toEqual([{ text: "Facture", checked: false, meta: "Ven. 2 oct. · Priorité haute · #maison · Perso", tone: "late" }]);
    expect(doc.sections[1]!.heading).toBeUndefined();
    expect(doc.sections[1]!.rows).toEqual([
      { text: "Valise", checked: false, meta: "Aujourd'hui · 18:00 · Perso", tone: undefined },
      { text: "Chargeur", checked: true, indent: true },
    ]);
  });

  it("liste de courses : rayons, colonnes et reste à acheter", () => {
    const list = {
      id: "l",
      name: "Courses",
      template: "courses",
      columns: [
        { id: "prix", name: "Prix", kind: "prix" },
        { id: "bio", name: "Bio", kind: "case" },
      ],
      sections: ["Frais", "Épicerie"],
    } as unknown as List;
    const item = (title: string, section: string | null, cells: ListItem["cells"], done = false) => ({ id: title, title, section, cells, done }) as ListItem;
    const all = [item("Lait", "Frais", { prix: 120, bio: true }), item("Riz", "Épicerie", { prix: 250 }, true), item("Piles", null, {})];
    const doc = listPrintDoc(list, [{ section: "Frais", items: [all[0]!] }, { section: "Épicerie", items: [all[1]!] }, { section: null, items: [all[2]!] }], all);
    expect(plain(doc.subtitle)).toBe("3 éléments · 1 fait · Reste à acheter : 1,20 €");
    expect(doc.sections.map((s) => s.heading)).toEqual(["Frais", "Épicerie", "Sans rayon"]);
    expect(plain(doc.sections[0]!.rows[0]!.meta)).toBe("1,20 € · Bio");
    expect(doc.sections[1]!.rows[0]!.checked).toBe(true);
  });

  it("calendrier : la semaine jour par jour, jours libres compris", () => {
    const items: CalItem[] = [
      { key: "e1", kind: "event", id: "e1", occurrence: null, title: "Dentiste", color: null, startDate: "2026-10-06", endDate: "2026-10-06", start: 570, end: 600, location: "Cabinet" },
      { key: "t1", kind: "task", id: "t1", occurrence: null, title: "Rendre le livre", color: null, startDate: "2026-10-08", endDate: "2026-10-08", start: null, end: null, location: "" },
    ];
    const week = calendarPrintDoc("semaine", TODAY, items);
    expect(week.title).toBe("Semaine du 5 oct. – 11 oct. 2026");
    expect(week.sections).toHaveLength(7);
    expect(week.sections[0]).toEqual({ heading: "Lundi 5 octobre", rows: [{ text: "Rien de prévu." }] });
    expect(week.sections[1]!.rows).toEqual([{ text: "Dentiste", meta: "09:30 – 10:00 · Cabinet" }]);
    expect(week.sections[3]!.rows).toEqual([{ text: "Rendre le livre", meta: "Tâche · Journée" }]);
    // Le mois imprimé ne reprend que ses propres jours, et seulement ceux occupés.
    expect(printRange("mois", TODAY)).toMatchObject({ from: "2026-10-01", to: "2026-10-31", title: "Octobre 2026" });
    expect(calendarPrintDoc("mois", TODAY, items).sections.map((s) => s.heading)).toEqual(["Mardi 6 octobre", "Jeudi 8 octobre"]);
  });

  it("obligations : sections, échéance, montant et préavis", () => {
    const o = (title: string, extra: Partial<Obligation>): Obligation =>
      ({ id: title, title, category: "abonnements", organization: "", reference: "", amountCents: null, periodMonths: null, dueDate: TODAY, anchorDay: 5, cancelBy: null, status: "a-faire", spaceId: null, color: null, notes: "", lastPaidOn: null, createdAt: 1, updatedAt: 1, ...extra }) as Obligation;
    const doc = obligationsPrintDoc("Obligations", [o("Box", { organization: "Opérateur", amountCents: 2999, periodMonths: 1, dueDate: "2026-10-03", cancelBy: "2026-10-20" }), o("Assurance", { category: "assurances", amountCents: 31200, periodMonths: 12, dueDate: "2026-12-01" })], TODAY);
    expect(plain(doc.subtitle)).toBe("Abonnements : 29,99 € par mois");
    expect(doc.sections.map((s) => s.heading)).toEqual(["En retard", "Plus tard"]);
    const row = doc.sections[0]!.rows[0]!;
    expect({ ...row, meta: plain(row.meta) }).toEqual({ text: "Box · Opérateur", meta: "En retard de 2 jours · 29,99 € (mensuelle) · Résiliation avant le mar. 20 oct.", tone: "late" });
  });
});
