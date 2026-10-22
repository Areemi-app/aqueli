import { describe, expect, it } from "vitest";
import { parseQuickAdd, parseRepeatWords } from "./quickAdd";
import { recurrenceLabel, type Recurrence } from "./recurrence";

// Dimanche 27 septembre 2026, 10 h (comme la maquette Tâches).
const NOW = new Date(2026, 8, 27, 10, 0);
const SPACES = [
  { id: "perso", name: "Perso" },
  { id: "travail", name: "Travail" },
  { id: "sante", name: "Santé" },
  { id: "asso", name: "Associations sportives" },
];

const parse = (text: string) => parseQuickAdd(text, NOW, SPACES);

describe("saisie intelligente", () => {
  it("reconnaît l'exemple de la maquette", () => {
    const r = parse("Appeler le garage vendredi 14h #voiture !haute");
    expect(r.title).toBe("Appeler le garage");
    expect(r.dueDate).toBe("2026-10-02");
    expect(r.dueTime).toBe("14:00");
    expect(r.tags).toEqual(["voiture"]);
    expect(r.priority).toBe(3);
    expect(r.spaceId).toBeNull();
    expect(r.tokens.map((t) => t.kind)).toEqual(["tag", "priority", "date", "time"]);
  });

  it("laisse un titre simple intact", () => {
    const r = parse("  Appeler   le garage ");
    expect(r).toMatchObject({ title: "Appeler le garage", dueDate: null, dueTime: null, priority: 0, tags: [] });
    expect(r.tokens).toEqual([]);
  });

  it.each([
    ["Pain aujourd'hui", "2026-09-27"],
    ["Pain auj", "2026-09-27"],
    ["Pain ce soir", "2026-09-27"],
    ["Pain demain", "2026-09-28"],
    ["Pain après-demain", "2026-09-29"],
    ["Pain apres demain", "2026-09-29"],
    ["Pain dimanche", "2026-09-27"],
    ["Pain dimanche prochain", "2026-10-04"],
    ["Pain lundi", "2026-09-28"],
    ["Pain pour samedi", "2026-10-03"],
    ["Pain avant jeudi", "2026-10-01"],
    ["Pain dans 3 jours", "2026-09-30"],
    ["Pain dans deux semaines", "2026-10-11"],
    ["Pain dans 1 mois", "2026-10-27"],
    ["Pain semaine prochaine", "2026-09-28"],
    ["Pain le 5", "2026-10-05"],
    ["Pain le 30", "2026-09-30"],
    ["Pain 12/10", "2026-10-12"],
    ["Pain le 3/1", "2027-01-03"],
    ["Pain 12/10/27", "2027-10-12"],
    ["Pain 1er novembre", "2026-11-01"],
    ["Pain le 15 mai", "2027-05-15"],
    ["Pain 3 août 2027", "2027-08-03"],
    ["Pain 8 déc.", "2026-12-08"],
    ["Pain 8 dec", "2026-12-08"],
  ])("« %s » → %s", (text, date) => {
    const r = parse(text);
    expect(r.dueDate).toBe(date);
    expect(r.title).toBe("Pain");
  });

  it.each([
    ["Appel à 14h", "2026-09-27", "14:00"],
    ["Appel 14h30", "2026-09-27", "14:30"],
    ["Appel à 9 h 15", "2026-09-28", "09:15"],
    ["Appel 18:45", "2026-09-27", "18:45"],
    ["Appel à midi", "2026-09-27", "12:00"],
    ["Appel vers 11h", "2026-09-27", "11:00"],
    ["Appel demain à 8h", "2026-09-28", "08:00"],
  ])("« %s » → %s %s (une heure passée vise le lendemain)", (text, date, time) => {
    const r = parse(text);
    expect(r).toMatchObject({ title: "Appel", dueDate: date, dueTime: time });
  });

  it("reconnaît les priorités", () => {
    expect(parse("A !haute").priority).toBe(3);
    expect(parse("A !h").priority).toBe(3);
    expect(parse("A !!!").priority).toBe(3);
    expect(parse("A !moyenne").priority).toBe(2);
    expect(parse("A !basse").priority).toBe(1);
    expect(parse("A !Haute").title).toBe("A");
  });

  it("garde le point d'exclamation de la ponctuation française", () => {
    const r = parse("Super idée !");
    expect(r.priority).toBe(0);
    expect(r.title).toBe("Super idée !");
  });

  it("reconnaît plusieurs étiquettes, avec accents et hiérarchie", () => {
    const r = parse("Tailler la haie #maison/jardin #été #été");
    expect(r.tags).toEqual(["maison/jardin", "été"]);
    expect(r.title).toBe("Tailler la haie");
  });

  it("reconnaît un espace existant, sans tenir compte des accents ni des espaces", () => {
    expect(parse("Bilan @travail").spaceId).toBe("travail");
    expect(parse("Vaccin @sante").spaceId).toBe("sante");
    expect(parse("Match @associations-sportives").spaceId).toBe("asso");
    const unknown = parse("Écrire à @inconnu");
    expect(unknown.spaceId).toBeNull();
    expect(unknown.title).toBe("Écrire à @inconnu");
  });

  it("reconnaît un espace écrit avec +", () => {
    expect(parse("Bilan +travail").spaceId).toBe("travail");
    expect(parse("Match +associations-sportives demain").spaceId).toBe("asso");
    expect(parse("Appeler le +33 6 12").title).toBe("Appeler le +33 6 12");
  });

  it("relie les contacts cités par @, et garde leur nom dans le titre", () => {
    const contacts = [
      { id: "lea", names: ["Léa Bernard", "Léa"] },
      { id: "paul", names: ["Paul Durand", "Paul"] },
      { id: "paul2", names: ["Paul Martin", "Paul"] },
      { id: "garage", names: ["Garage Dupont", "Garage Dupont", "Garage Dupont"] },
      { id: "travail", names: ["Travail Sàrl", "Travail"] },
    ];
    const r = parseQuickAdd("Appeler @lea demain #famille", NOW, SPACES, contacts);
    expect(r.contactIds).toEqual(["lea"]);
    expect(r.title).toBe("Appeler lea");
    expect(r.tokens.map((t) => t.kind)).toEqual(["contact", "tag", "date"]);
    // Nom complet, avec ou sans tiret bas.
    expect(parseQuickAdd("Déjeuner avec @Paul_Durand", NOW, SPACES, contacts)).toMatchObject({ contactIds: ["paul"], title: "Déjeuner avec Paul Durand" });
    expect(parseQuickAdd("Rappeler @GarageDupont", NOW, SPACES, contacts).contactIds).toEqual(["garage"]);
    // Prénom porté par deux contacts : personne n'est relié.
    expect(parseQuickAdd("Voir @Paul", NOW, SPACES, contacts)).toMatchObject({ contactIds: [], title: "Voir @Paul" });
    // Un contact passe avant un espace du même nom ; « + » vise toujours l'espace.
    expect(parseQuickAdd("Facture @travail", NOW, SPACES, contacts)).toMatchObject({ contactIds: ["travail"], spaceId: null });
    expect(parseQuickAdd("Facture +travail", NOW, SPACES, contacts)).toMatchObject({ contactIds: [], spaceId: "travail" });
  });

  it("ne confond pas les mots ordinaires avec des dates", () => {
    expect(parse("Appeler le garage").title).toBe("Appeler le garage");
    expect(parse("Lire 2 h par jour").dueTime).toBeNull();
    expect(parse("Payer 14 euros").dueDate).toBeNull();
    expect(parse("Réserver le mardi gras").dueDate).toBe("2026-09-29");
    expect(parse("Commander 31/02").dueDate).toBeNull();
    expect(parse("Commander 31/02").title).toBe("Commander 31/02");
  });

  it("passe à l'année ou au mois suivant quand il le faut", () => {
    const december = new Date(2026, 11, 20, 10, 0);
    expect(parseQuickAdd("Loyer le 5", december, SPACES).dueDate).toBe("2027-01-05");
    expect(parseQuickAdd("Vœux 2/1", december, SPACES).dueDate).toBe("2027-01-02");
    expect(parseQuickAdd("Bilan dans 1 mois", new Date(2027, 0, 31, 9, 0), SPACES).dueDate).toBe("2027-02-28");
    const november = new Date(2026, 10, 10, 10, 0);
    expect(parseQuickAdd("Clôture le 31", november, SPACES).dueDate).toBe("2026-12-31");
    expect(parseQuickAdd("Soirée samedi", new Date(2026, 11, 31, 10, 0), SPACES).dueDate).toBe("2027-01-02");
  });

  it("ne garde que la première date", () => {
    const r = parse("Relancer lundi ou mardi");
    expect(r.dueDate).toBe("2026-09-28");
    expect(r.title).toBe("Relancer ou mardi");
  });

  it("fournit les pastilles d'aperçu", () => {
    const r = parse("Bilan @travail demain 9h #réunion !moyenne");
    expect(r.tokens).toEqual([
      { kind: "tag", text: "#réunion" },
      { kind: "priority", text: "!moyenne" },
      { kind: "space", text: "@travail" },
      { kind: "date", text: "demain" },
      { kind: "time", text: "9h" },
    ]);
  });
});

describe("répétitions reconnues", () => {
  it.each([
    ["Méditer chaque jour", { kind: "daily", interval: 1 }],
    ["Méditer tous les jours", { kind: "daily", interval: 1 }],
    ["Réviser tous les 3 jours", { kind: "daily", interval: 3 }],
    ["Rapport en semaine", { kind: "weekdays" }],
    ["Rapport les jours ouvrés", { kind: "weekdays" }],
    ["Poubelles chaque lundi", { kind: "weekly", interval: 1, days: [1] }],
    ["Poubelles tous les lundis", { kind: "weekly", interval: 1, days: [1] }],
    ["Sport chaque lundi et jeudi", { kind: "weekly", interval: 1, days: [1, 4] }],
    ["Sport tous les lundis, mercredis et vendredis", { kind: "weekly", interval: 1, days: [1, 3, 5] }],
    ["Piano tous les 2 mardis", { kind: "weekly", interval: 2, days: [2] }],
    ["Ménage chaque semaine", { kind: "weekly", interval: 1, days: [0] }],
    ["Ménage toutes les deux semaines", { kind: "weekly", interval: 2, days: [0] }],
    ["Bilan le dernier vendredi du mois", { kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 }],
    ["Point le 1er lundi de chaque mois", { kind: "monthlyNth", interval: 1, nth: 1, weekday: 1 }],
    ["Point le deuxième mardi du mois", { kind: "monthlyNth", interval: 1, nth: 2, weekday: 2 }],
    ["Relevé chaque mois", { kind: "monthly", interval: 1, day: 27 }],
    ["Relevé tous les 3 mois", { kind: "monthly", interval: 3, day: 27 }],
    ["Bilan chaque année", { kind: "yearly", interval: 1, month: 9, day: 27 }],
    ["Arroser 3 jours après achèvement", { kind: "afterDone", days: 3 }],
    ["Arroser une semaine après l'achèvement", { kind: "afterDone", days: 7 }],
  ])("« %s »", (text, rule) => {
    const r = parse(text);
    expect(r.recurrence).toEqual(rule);
    expect(r.title).toBe(text.split(" ")[0]);
  });

  it("prend le jour du mois ou la date donnés", () => {
    expect(parse("Loyer le 5 chaque mois").recurrence).toEqual({ kind: "monthly", interval: 1, day: 5 });
    expect(parse("Loyer le 5 chaque mois").dueDate).toBe("2026-10-05");
    expect(parse("Fête chaque année le 3 août").recurrence).toEqual({ kind: "yearly", interval: 1, month: 8, day: 3 });
    expect(parse("Ménage chaque semaine vendredi").recurrence).toEqual({ kind: "weekly", interval: 1, days: [5] });
  });

  it("laisse le cœur choisir la première échéance, heure comprise", () => {
    const r = parse("Poubelles chaque lundi à 7h");
    expect(r).toMatchObject({ title: "Poubelles", dueDate: null, dueTime: "07:00" });
    expect(r.tokens.map((t) => t.kind)).toEqual(["repeat", "time"]);
  });

  it("ne voit pas de répétition dans une phrase ordinaire", () => {
    expect(parse("Appeler le garage lundi").recurrence).toBeNull();
    expect(parse("Lire chaque page").recurrence).toBeNull();
  });
});

describe("répétitions écrites par l'application", () => {
  it("se relisent toutes (export puis import d'un tableau)", () => {
    const rules: Recurrence[] = [
      { kind: "daily", interval: 1 },
      { kind: "daily", interval: 3 },
      { kind: "weekdays" },
      { kind: "weekly", interval: 1, days: [1, 4] },
      { kind: "weekly", interval: 2, days: [2] },
      { kind: "weekly", interval: 2, days: [2, 5] },
      { kind: "monthly", interval: 1, day: 5 },
      { kind: "monthly", interval: 3, day: 1 },
      { kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 },
      { kind: "monthlyNth", interval: 2, nth: 2, weekday: 1 },
      { kind: "yearly", interval: 1, month: 10, day: 5 },
      { kind: "yearly", interval: 2, month: 3, day: 1 },
      { kind: "afterDone", days: 3 },
    ];
    for (const rule of rules) expect(parseRepeatWords(recurrenceLabel(rule), "2026-10-05")).toEqual(rule);
  });

  it("« le 5 de chaque mois » se saisit aussi dans la saisie rapide", () => {
    const r = parseQuickAdd("Payer le loyer le 5 de chaque mois", new Date(2026, 9, 5, 9), []);
    expect(r.title).toBe("Payer le loyer");
    expect(r.recurrence).toEqual({ kind: "monthly", interval: 1, day: 5 });
  });
});

describe("saisie en anglais", () => {
  it("reconnaît l'exemple de l'interface anglaise", () => {
    const r = parse("Call the garage Friday 2pm #car !high");
    expect(r).toMatchObject({ title: "Call the garage", dueDate: "2026-10-02", dueTime: "14:00", tags: ["car"], priority: 3 });
  });

  it("lit les dates", () => {
    const due = (text: string) => parse(`Pay ${text}`).dueDate;
    expect(due("today")).toBe("2026-09-27");
    expect(due("tomorrow")).toBe("2026-09-28");
    expect(due("the day after tomorrow")).toBe("2026-09-29");
    expect(due("next Monday")).toBe("2026-09-28");
    expect(due("on Sunday")).toBe("2026-09-27");
    expect(due("next Sunday")).toBe("2026-10-04");
    expect(due("in 3 days")).toBe("2026-09-30");
    expect(due("in a week")).toBe("2026-10-04");
    expect(due("in two months")).toBe("2026-11-27");
    expect(due("next week")).toBe("2026-09-28");
    expect(due("on the 5th")).toBe("2026-10-05");
    expect(due("1 November")).toBe("2026-11-01");
    expect(due("the 1st of November 2027")).toBe("2027-11-01");
    expect(due("November 1st")).toBe("2026-11-01");
    expect(due("by 12/10")).toBe("2026-10-12");
  });

  it("lit les heures", () => {
    const at = (text: string) => parse(`Call ${text}`).dueTime;
    expect(at("2:30pm")).toBe("14:30");
    expect(at("at 9am")).toBe("09:00");
    expect(at("at 9 pm")).toBe("21:00");
    expect(at("12am")).toBe("00:00");
    expect(at("12pm")).toBe("12:00");
    expect(at("noon")).toBe("12:00");
    expect(at("at 18:45")).toBe("18:45");
    expect(at("13pm")).toBeNull();
  });

  it("lit les répétitions et les priorités", () => {
    expect(parse("Gym every Monday and Thursday").recurrence).toEqual({ kind: "weekly", interval: 1, days: [1, 4] });
    expect(parse("Bins every 2 Tuesdays").recurrence).toEqual({ kind: "weekly", interval: 2, days: [2] });
    expect(parse("Stand-up weekdays 9am")).toMatchObject({ title: "Stand-up", recurrence: { kind: "weekdays" }, dueTime: "09:00" });
    expect(parse("Review the last Friday of the month").recurrence).toEqual({ kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 });
    expect(parse("Water the plants 3 days after completion").recurrence).toEqual({ kind: "afterDone", days: 3 });
    expect(parse("Read every day").recurrence).toEqual({ kind: "daily", interval: 1 });
    expect([parse("A !medium").priority, parse("A !low").priority]).toEqual([2, 1]);
  });

  it("relit les répétitions écrites par l'interface anglaise", async () => {
    const { setLanguageForTests } = await import("../i18n/i18n");
    setLanguageForTests("en", {});
    try {
      const rules: Recurrence[] = [
        { kind: "daily", interval: 1 },
        { kind: "daily", interval: 3 },
        { kind: "weekdays" },
        { kind: "weekly", interval: 1, days: [1, 4] },
        { kind: "weekly", interval: 2, days: [2] },
        { kind: "weekly", interval: 2, days: [2, 5] },
        { kind: "monthly", interval: 1, day: 5 },
        { kind: "monthly", interval: 3, day: 1 },
        { kind: "monthlyNth", interval: 1, nth: -1, weekday: 5 },
        { kind: "monthlyNth", interval: 2, nth: 2, weekday: 1 },
        { kind: "yearly", interval: 1, month: 10, day: 5 },
        { kind: "yearly", interval: 2, month: 3, day: 1 },
        { kind: "afterDone", days: 3 },
        { kind: "afterDone", days: 1 },
      ];
      for (const rule of rules) expect(parseRepeatWords(recurrenceLabel(rule), "2026-10-05"), recurrenceLabel(rule)).toEqual(rule);
    } finally {
      setLanguageForTests("fr", null);
    }
  });
});
