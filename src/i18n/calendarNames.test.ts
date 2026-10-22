import { describe, expect, it } from "vitest";
import { weekdayInitials } from "./calendarNames";

describe("noms du calendrier", () => {
  it("donne les initiales des jours du lundi au dimanche, dans la langue de l'interface", () => {
    expect(weekdayInitials()).toEqual(["L", "M", "M", "J", "V", "S", "D"]);
  });
});
