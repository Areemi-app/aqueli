import { describe, expect, it } from "vitest";
import { isoWeek } from "./calendarSettings";
import { parseQuickEvent } from "./quickEvent";

// Vendredi 9 octobre 2026, 10 h.
const NOW = new Date(2026, 9, 9, 10, 0);
const SPACES = [
  { id: "perso", name: "Perso" },
  { id: "sante", name: "Santé" },
];
const parse = (text: string, duration = 60) => parseQuickEvent(text, NOW, SPACES, duration);

describe("événement en une phrase", () => {
  it("lit le titre, le jour et l'heure, avec la durée par défaut", () => {
    expect(parse("Dîner avec Paul vendredi 20h")).toMatchObject({ title: "Dîner avec Paul", startDate: "2026-10-09", startTime: "20:00", endDate: "2026-10-09", endTime: "21:00" });
    expect(parse("Dentiste le 15/11 à 9h30 @Santé", 30)).toMatchObject({ title: "Dentiste", startDate: "2026-11-15", startTime: "09:30", endTime: "10:00", spaceId: "sante" });
  });

  it("lit une plage horaire, y compris au-delà de minuit", () => {
    expect(parse("Réunion lundi 14h-16h30")).toMatchObject({ title: "Réunion", startDate: "2026-10-12", startTime: "14:00", endTime: "16:30" });
    expect(parse("Soirée samedi de 22h à 1h")).toMatchObject({ startDate: "2026-10-10", startTime: "22:00", endDate: "2026-10-11", endTime: "01:00" });
  });

  it("sans heure, dure la journée ; sans date, est aujourd'hui ; garde la répétition", () => {
    expect(parse("Anniversaire de Léa le 12/10")).toMatchObject({ startDate: "2026-10-12", startTime: null, endTime: null });
    expect(parse("Appeler maman 18h")).toMatchObject({ startDate: "2026-10-09", startTime: "18:00" });
    expect(parse("Yoga chaque mardi 18h30")?.recurrence).toMatchObject({ kind: "weekly" });
    expect(parse("   ")).toBeNull();
  });

  it("calcule le numéro de semaine ISO", () => {
    expect(isoWeek("2026-10-08")).toBe(41);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2024-12-30")).toBe(1);
  });
});

describe("événement en une phrase, en anglais", () => {
  it("lit le jour, l'heure et la plage horaire", () => {
    expect(parse("Dinner with Paul Friday 8pm")).toMatchObject({ title: "Dinner with Paul", startDate: "2026-10-09", startTime: "20:00", endTime: "21:00" });
    expect(parse("Meeting Monday 2pm-4pm")).toMatchObject({ title: "Meeting", startDate: "2026-10-12", startTime: "14:00", endTime: "16:00" });
    expect(parse("Call 2-4pm")).toMatchObject({ title: "Call", startTime: "14:00", endTime: "16:00" });
    expect(parse("Brunch 11-1pm")).toMatchObject({ startTime: "11:00", endTime: "13:00" });
    expect(parse("Party Saturday 10pm-1am")).toMatchObject({ startDate: "2026-10-10", startTime: "22:00", endDate: "2026-10-11", endTime: "01:00" });
    expect(parse("Class from 9:30 to 11:00")).toMatchObject({ title: "Class", startTime: "09:30", endTime: "11:00" });
    expect(parse("Yoga every Tuesday 6:30pm")).toMatchObject({ title: "Yoga", startTime: "18:30", recurrence: { kind: "weekly", days: [2] } });
  });
});
