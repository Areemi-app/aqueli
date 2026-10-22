import { describe, expect, it } from "vitest";
import {
  ageAt,
  birthdaysBetween,
  birthdayIn,
  birthdayLabel,
  birthdayTitle,
  contactName,
  daysUntilBirthday,
  EMPTY_CONTACT,
  initials,
  letterOf,
  matches,
  nextBirthday,
  nextContact,
  sinceLabel,
  sortContacts,
  toReconnect,
  type Contact,
} from "./contacts";
import { parseKeepReminderId, scheduleForKeepInTouch } from "./keepInTouchReminders";

const contact = (partial: Partial<Contact>): Contact => ({ ...EMPTY_CONTACT, id: "c", createdAt: 0, updatedAt: 0, lastContact: null, ...partial });

describe("contacts", () => {
  it("affiche un nom, des initiales et range par nom de famille", () => {
    const camille = contact({ firstName: "Camille", lastName: "Martin" });
    const garage = contact({ company: "Garage Dupont" });
    const elodie = contact({ firstName: "Élodie", lastName: "Arnaud" });
    expect(contactName(camille)).toBe("Camille Martin");
    expect(contactName(garage)).toBe("Garage Dupont");
    expect(initials(camille)).toBe("CM");
    expect(initials(garage)).toBe("GD");
    expect(initials(contact({ firstName: "élise" }))).toBe("É");
    expect(sortContacts([camille, garage, elodie]).map(contactName)).toEqual(["Élodie Arnaud", "Garage Dupont", "Camille Martin"]);
    expect(letterOf(elodie)).toBe("A");
    expect(letterOf(contact({ company: "3 Suisses" }))).toBe("#");
  });

  it("cherche dans le nom, la société, les e-mails, les étiquettes et les numéros", () => {
    const c = contact({ firstName: "Léa", company: "Mairie", emails: [{ label: "", value: "lea@exemple.fr" }], phones: [{ label: "Mobile", value: "06 12 34 56 78" }], tags: ["famille"] });
    expect(matches(c, "lea")).toBe(true);
    expect(matches(c, "mairie lea")).toBe(true);
    expect(matches(c, "famille")).toBe(true);
    expect(matches(c, "0612")).toBe(true);
    expect(matches(c, "12 34 56")).toBe(true);
    expect(matches(c, "paul")).toBe(false);
  });

  it("calcule les anniversaires, avec ou sans l'année", () => {
    expect(nextBirthday("1990-05-14", "2026-10-01")).toBe("2027-05-14");
    expect(nextBirthday("--10-01", "2026-10-01")).toBe("2026-10-01");
    expect(birthdayIn("--02-29", 2027)).toBe("2027-02-28");
    expect(birthdayIn("--02-29", 2028)).toBe("2028-02-29");
    expect(ageAt("1990-05-14", "2027-05-14")).toBe(37);
    expect(ageAt("--05-14", "2027-05-14")).toBeNull();
    expect(daysUntilBirthday("--10-03", "2026-10-01")).toBe(2);
    expect(birthdayLabel("--05-14")).toBe("14 mai");
    expect(birthdayLabel("1990-05-14")).toBe("14 mai 1990");
  });

  it("donne les anniversaires d'une période, y compris à cheval sur deux années", () => {
    const a = contact({ id: "a", firstName: "Léa", birthday: "2016-12-31" });
    const b = contact({ id: "b", firstName: "Paul", birthday: "--01-02" });
    const c = contact({ id: "c", firstName: "Zoé", birthday: null });
    const list = birthdaysBetween([a, b, c], "2026-12-30", "2027-01-05");
    expect(list.map((o) => [o.contact.id, o.day, o.age])).toEqual([
      ["a", "2026-12-31", 10],
      ["b", "2027-01-02", null],
    ]);
    expect(birthdayTitle(list[0]!)).toBe("Anniversaire de Léa (10 ans)");
    expect(birthdayTitle(list[1]!)).toBe("Anniversaire de Paul");
  });
});

describe("rappels des anniversaires", () => {
  it("rappelle le jour même ou la veille, à 9 h, sans revenir sur un rappel passé", async () => {
    const { scheduleForBirthdays, parseBirthdayReminderId } = await import("./birthdayReminders");
    const lea = contact({ id: "c1", firstName: "Léa", birthday: "2016-10-01" });
    const paul = contact({ id: "c2", firstName: "Paul", birthday: "--10-03" });
    const now = new Date(2026, 9, 1, 10, 0);
    expect(scheduleForBirthdays([lea, paul], 0, now, "2026-10-01")).toEqual([
      { at: new Date(2026, 9, 3, 9, 0).getTime() / 1000, taskId: "anniv:c2@2026-10-03", title: "Anniversaire de Paul", when: "Aujourd'hui" },
    ]);
    expect(scheduleForBirthdays([paul], 1, now, "2026-10-01")[0]).toMatchObject({ at: new Date(2026, 9, 2, 9, 0).getTime() / 1000, when: "Demain" });
    expect(scheduleForBirthdays([lea, paul], null, now, "2026-10-01")).toEqual([]);
    expect(parseBirthdayReminderId("anniv:c2@2026-10-03")).toBe("c2");
    expect(parseBirthdayReminderId("doc:x")).toBeNull();
  });
});

describe("informations libres", () => {
  it("se retrouvent par la recherche, intitulé comme valeur", () => {
    const lea = contact({ firstName: "Léa", fields: [{ label: "Code d'entrée", value: "B4589", icon: "cle", color: null }] });
    expect(matches(lea, "code entree")).toBe(true);
    expect(matches(lea, "b4589")).toBe(true);
    expect(matches(lea, "pointure")).toBe(false);
  });
});

describe("rester en contact", () => {
  it("calcule le prochain échange et la liste à recontacter", () => {
    const lea = contact({ id: "lea", firstName: "Léa", keepInTouch: 30, lastContact: "2026-09-01" });
    const paul = contact({ id: "paul", firstName: "Paul", keepInTouch: 7, lastContact: null });
    const zoe = contact({ id: "zoe", firstName: "Zoé", keepInTouch: 90, lastContact: "2026-09-20" });
    const sans = contact({ id: "sans", firstName: "Sans", lastContact: "2026-01-01" });
    expect(nextContact(lea)).toBe("2026-10-01");
    expect(nextContact(paul)).toBeNull();
    // Jamais contacté d'abord, puis le plus en retard ; Zoé n'est pas encore due, « Sans » n'est pas suivi.
    expect(toReconnect([zoe, lea, sans, paul], "2026-10-05").map((c) => c.id)).toEqual(["paul", "lea"]);
    expect(sinceLabel("2026-10-05", "2026-10-05")).toBe("aujourd'hui");
    expect(sinceLabel("2026-10-04", "2026-10-05")).toBe("hier");
    expect(sinceLabel("2026-09-20", "2026-10-05")).toBe("il y a 15 jours");
    expect(sinceLabel("2026-05-05", "2026-10-05")).toBe("il y a 5 mois");
  });

  it("rappelle le jour où un contact suivi est à recontacter", () => {
    const lea = contact({ id: "lea", firstName: "Léa", keepInTouch: 30, lastContact: "2026-09-10" });
    const now = new Date(2026, 9, 5, 8, 0);
    const list = scheduleForKeepInTouch([lea, contact({ id: "x", firstName: "X" })], true, now, "2026-10-05");
    expect(list).toEqual([{ at: Math.floor(new Date(2026, 9, 10, 10, 0).getTime() / 1000), taskId: "suivi:lea@2026-10-10", title: "Prendre des nouvelles de Léa", when: "Aujourd'hui" }]);
    expect(scheduleForKeepInTouch([lea], false, now, "2026-10-05")).toEqual([]);
    expect(parseKeepReminderId("suivi:lea@2026-10-10")).toBe("lea");
  });
});
