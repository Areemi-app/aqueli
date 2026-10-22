import { describe, expect, it } from "vitest";
import { COUNTRIES, countryHolidays, frenchMothersDay } from "./countries";
import { easter, nthWeekday, orthodoxEaster } from "./holidays";
import { schoolHolidays } from "./school";
import { dayMarks, DEFAULT_DAY_SETTINGS, holidaysBetween, markTitle, parseDaySettings, periodsBetween, type DaySettings } from "./specialDays";
import { TRADITIONS } from "./traditions";

const settings = (s: Partial<DaySettings> = {}): DaySettings => ({ ...DEFAULT_DAY_SETTINGS, ...s });
const named = (country: DaySettings["country"], year: number) => countryHolidays(country, year).map((h) => `${h.day} ${h.name}`);
const dayOf = (country: DaySettings["country"], year: number, name: string) => countryHolidays(country, year).filter((h) => h.name === name).map((h) => h.day);

describe("calculs de dates", () => {
  it("calcule Pâques, et Pâques orthodoxe", () => {
    expect(easter(2024)).toBe("2024-03-31");
    expect(easter(2025)).toBe("2025-04-20");
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    expect(orthodoxEaster(2024)).toBe("2024-05-05");
    expect(orthodoxEaster(2025)).toBe("2025-04-20");
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
  });

  it("trouve le n-ième jour de la semaine d'un mois, ou le dernier", () => {
    expect(nthWeekday(2026, 11, 4, 4)).toBe("2026-11-26"); // Thanksgiving
    expect(nthWeekday(2026, 1, 1, 3)).toBe("2026-01-19");
    expect(nthWeekday(2026, 5, 1, -1)).toBe("2026-05-25");
    expect(nthWeekday(2026, 3, 0, -1)).toBe("2026-03-29");
    expect(nthWeekday(2026, 10, 0, -1)).toBe("2026-10-25");
  });

  it("place la fête des mères française, décalée quand elle tombe à la Pentecôte", () => {
    expect(frenchMothersDay(2026)).toBe("2026-05-31");
    expect(frenchMothersDay(2034)).toBe("2034-06-04");
  });
});

describe("jours fériés par pays", () => {
  it("donne les 11 jours fériés de la France métropolitaine, chacun de sa couleur", () => {
    expect(named("fr", 2026)).toEqual([
      "2026-01-01 Jour de l'An",
      "2026-04-06 Lundi de Pâques",
      "2026-05-01 Fête du Travail",
      "2026-05-08 Victoire 1945",
      "2026-05-14 Ascension",
      "2026-05-25 Lundi de Pentecôte",
      "2026-07-14 Fête nationale",
      "2026-08-15 Assomption",
      "2026-11-01 Toussaint",
      "2026-11-11 Armistice 1918",
      "2026-12-25 Noël",
    ]);
    expect(new Set(countryHolidays("fr", 2026).map((h) => h.color)).size).toBe(11);
  });

  it("ajoute les jours propres à l'Alsace-Moselle et aux départements d'outre-mer", () => {
    expect(named("fr-alsace", 2026)).toEqual(expect.arrayContaining(["2026-04-03 Vendredi saint", "2026-12-26 Saint-Étienne"]));
    expect(dayOf("fr-reunion", 2026, "Abolition de l'esclavage")).toEqual(["2026-12-20"]);
    expect(dayOf("fr-mayotte", 2026, "Abolition de l'esclavage")).toEqual(["2026-04-27"]);
    expect(countryHolidays("fr-guadeloupe", 2026)).toHaveLength(12);
  });

  it("suit les règles mobiles des autres pays", () => {
    expect(dayOf("ca-qc", 2026, "Journée nationale des patriotes")).toEqual(["2026-05-18"]);
    expect(dayOf("ca-qc", 2026, "Action de grâce")).toEqual(["2026-10-12"]);
    expect(dayOf("ch-ge", 2026, "Jeûne genevois")).toEqual(["2026-09-10"]);
    expect(dayOf("ch-vd", 2026, "Lundi du Jeûne fédéral")).toEqual(["2026-09-21"]);
    expect(dayOf("us", 2026, "Thanksgiving")).toEqual(["2026-11-26"]);
    expect(dayOf("it", 2026, "Saint-François d'Assise")).toEqual(["2026-10-04"]);
    expect(dayOf("it", 2025, "Saint-François d'Assise")).toEqual([]);
    expect(dayOf("ma", 2026, "Fête de l'Unité")).toEqual(["2026-10-31"]);
  });

  it("remplace au Royaume-Uni les jours fériés tombés un week-end", () => {
    expect(named("gb", 2026)).toEqual(expect.arrayContaining(["2026-05-04 Jour férié de mai", "2026-05-25 Jour férié de printemps", "2026-08-31 Jour férié d'été"]));
    // Noël 2027 tombe un samedi : lundi 27 et mardi 28.
    expect(named("gb", 2027)).toEqual(expect.arrayContaining(["2027-12-27 Noël (jour de remplacement)", "2027-12-28 Lendemain de Noël (jour de remplacement)"]));
  });

  it("place les fêtes musulmanes au calendrier hégirien, avec une date indicative", () => {
    expect(dayOf("ma", 2026, "Aïd al-Fitr")).toEqual(["2026-03-20"]);
    expect(dayOf("ma", 2026, "Aïd al-Adha")).toEqual(["2026-05-27"]);
    expect(dayOf("tn", 2026, "Ras El Am El Hijri")).toEqual(["2026-06-16"]);
    expect(dayOf("dz", 2026, "Aïd al-Fitr (3e jour)")).toEqual(["2026-03-22"]);
    expect(dayOf("ci", 2026, "Lendemain de la Nuit du Destin")).toEqual(["2026-03-16"]);
    expect(countryHolidays("sn", 2026).find((h) => h.name === "Tabaski")?.note).toMatch(/indicative/);
  });

  it("a des pays aux identifiants uniques, et « Aucun jour férié » vide", () => {
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(COUNTRIES.length);
    expect(countryHolidays("aucun", 2026)).toEqual([]);
    for (const c of COUNTRIES) for (const h of c.holidays(2027)) expect(h.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("fêtes et traditions", () => {
  const days = (id: string, year: number) => TRADITIONS.find((t) => t.id === id)!.days(year, "fr").map((h) => `${h.day} ${h.name}`);
  const periods = (id: string, year: number) => TRADITIONS.find((t) => t.id === id)!.periods!(year).map((p) => `${p.name} ${p.from} ${p.to}`);

  it("calcule les fêtes juives, chinoises et musulmanes d'après leur calendrier", () => {
    expect(days("juive", 2026)).toEqual(expect.arrayContaining(["2026-09-12 Roch Hachana", "2026-09-21 Yom Kippour", "2026-04-02 Pessa'h", "2026-03-03 Pourim"]));
    expect(days("juive", 2027)).toEqual(expect.arrayContaining(["2027-03-23 Pourim"]));
    expect(periods("juive", 2026)).toEqual(expect.arrayContaining(["Hanoucca 2026-12-05 2026-12-12", "Pessa'h 2026-04-02 2026-04-09"]));
    expect(days("asiatique", 2026)).toEqual(expect.arrayContaining(["2026-02-17 Nouvel An lunaire", "2026-09-25 Fête de la mi-automne"]));
    expect(periods("musulmane", 2026)).toEqual(expect.arrayContaining(["Ramadan 2026-02-18 2026-03-19"]));
  });

  it("donne les périodes chrétiennes, et les dates usuelles selon le pays", () => {
    expect(periods("chretienne", 2026)).toEqual(["Carême 2026-02-18 2026-04-04", "Avent 2026-11-29 2026-12-24"]);
    expect(days("orthodoxe", 2026)).toEqual(expect.arrayContaining(["2026-04-12 Pâques orthodoxe"]));
    expect(days("populaire", 2026)).toEqual(
      expect.arrayContaining(["2026-03-29 Passage à l'heure d'été", "2026-10-25 Passage à l'heure d'hiver", "2026-05-31 Fête des mères", "2026-06-21 Fête des pères"]),
    );
    const quebec = TRADITIONS.find((t) => t.id === "populaire")!.days(2026, "ca-qc").map((h) => `${h.day} ${h.name}`);
    expect(quebec).toEqual(expect.arrayContaining(["2026-03-08 Passage à l'heure d'été", "2026-11-01 Passage à l'heure d'hiver", "2026-05-10 Fête des mères"]));
    expect(TRADITIONS.find((t) => t.id === "populaire")!.days(2026, "ma").some((h) => h.name.startsWith("Passage"))).toBe(false);
  });

  it("ne répète pas une fête déjà fériée dans le pays, même sous un autre nom", () => {
    const ascension = holidaysBetween(settings({ traditions: ["chretienne"] }), "2026-05-14", "2026-05-14");
    expect(ascension.map((h) => `${h.name} ${h.kind}`)).toEqual(["Ascension ferie"]);
    const tabaski = holidaysBetween(settings({ country: "sn", traditions: ["musulmane"] }), "2026-05-27", "2026-05-27");
    expect(tabaski.map((h) => h.name)).toEqual(["Tabaski"]);
    const moharram = holidaysBetween(settings({ country: "ma", traditions: ["musulmane"] }), "2026-06-16", "2026-06-16");
    expect(moharram.map((h) => h.name)).toEqual(["1er Moharram"]);
  });
});

describe("vacances scolaires", () => {
  it("donne les vacances des zones choisies, communes ou non", () => {
    expect(schoolHolidays([], "2026-09-01", "2027-08-31")).toEqual([]);
    const a = schoolHolidays(["A"], "2026-09-01", "2027-08-31").map((p) => `${p.name} ${p.detail} ${p.from} ${p.to}`);
    expect(a).toEqual([
      "Vacances de la Toussaint Toutes zones 2026-10-17 2026-11-01",
      "Vacances de Noël Toutes zones 2026-12-19 2027-01-03",
      "Vacances d'hiver Zone A 2027-02-13 2027-02-28",
      "Vacances de printemps Zone A 2027-04-10 2027-04-25",
      "Pont de l'Ascension Toutes zones 2027-05-06 2027-05-09",
      "Vacances d'été Toutes zones 2027-07-03 2027-09-01",
    ]);
  });

  it("ne montre les zones que pour la France métropolitaine", () => {
    expect(periodsBetween(settings({ country: "be", zones: ["A"] }), "2026-10-01", "2026-11-30")).toEqual([]);
    expect(periodsBetween(settings({ country: "fr-alsace", zones: ["B"] }), "2026-10-01", "2026-11-30")).toHaveLength(1);
  });
});

describe("marques des jours", () => {
  it("regroupe les zones en vacances le même jour et garde la couleur du jour férié", () => {
    const marks = dayMarks(settings({ zones: ["A", "B", "C"] }), "2026-02-21", "2026-02-23");
    expect(marks.get("2026-02-21")?.periods.map((p) => p.label)).toEqual(["Vacances d'hiver · Zones A, B et C"]);
    expect(marks.get("2026-02-23")?.periods.map((p) => p.label)).toEqual(["Vacances d'hiver · Zones B et C"]);
    const christmas = dayMarks(settings({ zones: ["C"] }), "2026-12-25", "2026-12-25").get("2026-12-25")!;
    expect(christmas).toMatchObject({ level: "ferie", color: "#1f9a6e" });
    expect(markTitle(christmas)).toBe("Noël");
    expect(christmas.label).toBe("Noël · Vacances de Noël · Toutes zones");
  });

  it("marque une fête d'une bulle cerclée et laisse les jours ordinaires de côté", () => {
    const marks = dayMarks(settings({ traditions: ["juive"] }), "2026-09-20", "2026-09-22");
    expect(marks.has("2026-09-20")).toBe(false);
    expect(marks.get("2026-09-21")).toMatchObject({ level: "fete", label: "Yom Kippour (la fête commence la veille au soir)" });
  });

  it("relit un réglage enregistré en ignorant ce qui n'est pas reconnu", () => {
    expect(parseDaySettings({ country: "be", zones: ["C", "Z", "A", "A"], traditions: ["juive", "inconnue"] })).toEqual({ country: "be", zones: ["A", "C"], traditions: ["juive"] });
    expect(parseDaySettings("n'importe quoi")).toEqual(DEFAULT_DAY_SETTINGS);
  });
});
