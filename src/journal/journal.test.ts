import { describe, expect, it } from "vitest";
import { SYMBOLS } from "../components/symbols";
import {
  ACTIVITIES,
  activityEffects,
  averageMood,
  deltaLabel,
  longDay,
  monthGrid,
  moodCounts,
  moodOf,
  moodTrend,
  oneYearBefore,
  onThisDay,
  promptFor,
  PROMPTS,
  plainText,
  sortActivities,
  themeMood,
  writingStreak,
  yearsBefore,
  type JournalSummary,
} from "./journal";
import { parseJournalReminderId, scheduleForJournal } from "./journalReminder";

describe("journal", () => {
  it("transmet une humeur au moteur de thèmes", () => {
    expect(themeMood(null)).toBeNull();
    expect(themeMood({ mood: null, energy: null })).toBeNull();
    expect(themeMood({ mood: 2, energy: 5 })).toBe("fatigue");
    expect(themeMood({ mood: 4, energy: 1 })).toBe("fatigue");
    expect(themeMood({ mood: 4, energy: 4 })).toBe("motive");
    expect(themeMood({ mood: null, energy: 5 })).toBe("motive");
    expect(themeMood({ mood: 3, energy: 3 })).toBe("calme");
    expect(themeMood({ mood: 5, energy: null })).toBe("calme");
    expect(moodOf(5)?.label).toBe("Très bien");
    expect(moodOf(null)).toBeNull();
  });

  it("propose une question d'écriture par jour", () => {
    expect(PROMPTS).toContain(promptFor("2026-10-01"));
    expect(promptFor("2026-10-01")).toBe(promptFor("2026-10-01"));
    expect(promptFor("2026-10-01")).not.toBe(promptFor("2026-10-02"));
  });

  it("dessine le mois du lundi au dimanche", () => {
    const october = monthGrid(2026, 10);
    expect(october[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(october.flat().filter(Boolean)).toHaveLength(31);
    expect(october.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid(2026, 2).flat().filter(Boolean)).toHaveLength(28);
  });

  it("compte la série de jours écrits", () => {
    const days = new Set(["2026-09-28", "2026-09-29", "2026-09-30"]);
    expect(writingStreak(days, "2026-10-01")).toBe(3);
    expect(writingStreak(new Set([...days, "2026-10-01"]), "2026-10-01")).toBe(4);
    expect(writingStreak(days, "2026-10-02")).toBe(0);
  });

  it("retrouve le même jour l'an passé, moyenne et date longue", () => {
    expect(oneYearBefore("2026-10-01")).toBe("2025-10-01");
    expect(oneYearBefore("2028-02-29")).toBe("2027-02-28");
    expect(averageMood([{ mood: 4 }, { mood: 5 }, { mood: null }])).toBe(5);
    expect(averageMood([])).toBeNull();
    expect(longDay("2026-10-01")).toBe("jeudi 1er octobre 2026");
    expect(longDay("2026-10-12")).toBe("lundi 12 octobre 2026");
  });
});

describe("texte brut d'une page", () => {
  it("rassemble le texte des blocs, sans la mise en forme", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Belle " }, { type: "text", text: "journée", marks: [{ type: "bold" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "marche" }] }] }] },
        { type: "paragraph", content: [{ type: "text", text: "a" }, { type: "hardBreak" }, { type: "text", text: "b" }] },
      ],
    };
    expect(plainText(JSON.stringify(doc))).toBe("Belle journée\nmarche\na\nb");
    expect(plainText("")).toBe("");
    expect(plainText("{pas du json")).toBe("");
  });
});

describe("activités et tendances", () => {
  const page = (day: string, mood: number | null, activities: string[] = []): JournalSummary => ({
    day,
    mood,
    energy: null,
    gratitudes: [],
    excerpt: "",
    updatedAt: 0,
    activities,
  });

  it("les activités ont un symbole connu et un identifiant accepté par le cœur", () => {
    const ids = SYMBOLS.map((s) => s.id);
    for (const a of ACTIVITIES) {
      expect(ids).toContain(a.icon);
      expect(a.id).toMatch(/^[a-z-]{1,24}$/);
    }
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length);
    expect(sortActivities(["sport", "inconnue", "famille"])).toEqual(["famille", "sport"]);
  });

  it("retrouve « ce jour-là » les années précédentes", () => {
    const pages = new Map([page("2025-10-01", 4), page("2023-10-01", 2), page("2025-10-02", 5)].map((p) => [p.day, p]));
    expect(onThisDay(pages, "2026-10-01").map((m) => [m.years, m.page.day])).toEqual([
      [1, "2025-10-01"],
      [3, "2023-10-01"],
    ]);
    expect(yearsBefore("2028-02-29", 4)).toBe("2024-02-29");
    expect(yearsBefore("2028-02-29", 1)).toBe("2027-02-28");
  });

  it("suit l'humeur jour après jour et compte chaque humeur", () => {
    const pages = new Map([page("2026-09-29", 2), page("2026-10-01", 5), page("2026-09-30", null, ["sport"])].map((p) => [p.day, p]));
    expect(moodTrend(pages, "2026-10-01", 4)).toEqual([
      { day: "2026-09-28", mood: null },
      { day: "2026-09-29", mood: 2 },
      { day: "2026-09-30", mood: null },
      { day: "2026-10-01", mood: 5 },
    ]);
    expect(moodCounts([...pages.values()])).toEqual([0, 1, 0, 0, 1]);
  });

  it("compare l'humeur des jours avec et sans chaque activité", () => {
    const pages = [
      page("2026-09-21", 5, ["sport"]),
      page("2026-09-22", 4, ["sport", "travail"]),
      page("2026-09-23", 5, ["sport"]),
      page("2026-09-24", 2, ["travail"]),
      page("2026-09-25", 2, ["travail"]),
      page("2026-09-26", 3, ["lecture"]),
      page("2026-09-27", null, ["sport"]),
    ];
    const effects = activityEffects(pages);
    // Moyenne de la période : 21 / 6 = 3,5 ; sport : 4,67 ; travail : 2,67 ; lecture : 1 seul jour.
    expect(effects.map((e) => e.activity.id)).toEqual(["sport", "travail"]);
    expect(effects[0]!.days).toBe(3);
    expect(deltaLabel(effects[0]!.delta)).toBe("+1,2");
    expect(deltaLabel(effects[1]!.delta)).toBe("−0,8");
    expect(deltaLabel(0.02)).toBe("0");
    expect(activityEffects([page("2026-09-21", null, ["sport"])])).toEqual([]);
  });
});

describe("rappel d'écriture", () => {
  it("rappelle chaque jour à l'heure choisie, sauf si la page est écrite", () => {
    const now = new Date(2026, 9, 1, 20, 0);
    const list = scheduleForJournal("21:00", (d) => d === "2026-10-02", now, "2026-10-01");
    expect(list).toHaveLength(6);
    expect(list[0]).toEqual({ at: Math.floor(new Date(2026, 9, 1, 21, 0).getTime() / 1000), taskId: "journal:2026-10-01", title: "Journal", when: "Page du jour" });
    expect(list.map((r) => r.taskId)).not.toContain("journal:2026-10-02");
    // Heure passée : le rappel du jour n'est plus programmé.
    expect(scheduleForJournal("08:00", () => false, now, "2026-10-01")[0]!.taskId).toBe("journal:2026-10-02");
    expect(scheduleForJournal(null, () => false, now, "2026-10-01")).toEqual([]);
    expect(parseJournalReminderId("journal:2026-10-01")).toBe("2026-10-01");
    expect(parseJournalReminderId("journal:../x")).toBeNull();
  });
});
