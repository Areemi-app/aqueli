import { describe, expect, it } from "vitest";
import { parseHabitReminderId, scheduleForHabits } from "./habitReminders";
import { indexChecks, type Habit } from "./habits";

// Jeudi 1er octobre 2026, 15 h.
const TODAY = "2026-10-01";
const NOW = new Date(2026, 9, 1, 15, 0);

function habit(partial: Partial<Habit>): Habit {
  return {
    id: "h",
    name: "Boire de l'eau",
    icon: "sante",
    color: null,
    kind: "oui-non",
    negative: false,
    target: 1,
    unit: "",
    frequency: { kind: "quotidien" },
    reminder: "20:00",
    moment: null,
    spaceId: null,
    position: 0,
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe("rappels des habitudes", () => {
  it("rappelle aujourd'hui et demain, sauf une habitude déjà tenue ou un jour non prévu", () => {
    const habits = [
      habit({ id: "eau" }),
      habit({ id: "lire", reminder: "09:00" }), // 9 h est passé aujourd'hui
      habit({ id: "fait" }),
      habit({ id: "lundi", frequency: { kind: "jours", days: [1] } }),
      habit({ id: "vendredi", frequency: { kind: "jours", days: [5] } }),
      habit({ id: "sans", reminder: null }),
      habit({ id: "archive", archived: true }),
    ];
    const checks = indexChecks([{ habitId: "fait", day: TODAY, value: 1 }]);
    const list = scheduleForHabits(habits, checks, NOW, TODAY);
    expect(list.map((r) => r.taskId)).toEqual([
      "habitude:eau@2026-10-01",
      "habitude:eau@2026-10-02",
      "habitude:lire@2026-10-02",
      "habitude:fait@2026-10-02",
      "habitude:vendredi@2026-10-02",
    ]);
    expect(list[0]).toMatchObject({ at: new Date(2026, 9, 1, 20, 0).getTime() / 1000, title: "Boire de l'eau", when: "Aujourd'hui · 20:00" });
    expect(list[1]!.when).toBe("Demain · 20:00");
  });

  it("ne rappelle plus une habitude hebdomadaire dont l'objectif de la semaine est atteint", () => {
    const sport = habit({ id: "sport", frequency: { kind: "semaine", times: 2 } });
    const checks = indexChecks([
      { habitId: "sport", day: "2026-09-28", value: 1 },
      { habitId: "sport", day: "2026-09-30", value: 1 },
    ]);
    expect(scheduleForHabits([sport], checks, NOW, TODAY)).toEqual([]);
  });

  it("retrouve l'habitude et le jour d'un rappel", () => {
    expect(parseHabitReminderId("habitude:abc@2026-10-01")).toEqual({ habitId: "abc", day: "2026-10-01" });
    expect(parseHabitReminderId("evt:abc@2026-10-01")).toBeNull();
    expect(parseHabitReminderId("habitude:abc")).toBeNull();
  });
});
