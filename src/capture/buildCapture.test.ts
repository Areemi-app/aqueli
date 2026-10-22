import { describe, expect, it } from "vitest";
import { buildCapture, eventCapture, noteCapture, taskCapture } from "./buildCapture";

// Mardi 29 septembre 2026, 10 h 20.
const NOW = new Date(2026, 8, 29, 10, 20);

describe("capture rapide", () => {
  it("une tâche sans date va dans la boîte de réception, avec ses étiquettes et sa priorité", () => {
    const c = taskCapture("Rappeler le plombier #maison !haute", NOW, 15);
    expect(c).toMatchObject({
      kind: "task",
      today: "2026-09-29",
      task: { title: "Rappeler le plombier", tags: ["maison"], priority: 3, dueDate: null, inbox: true, reminder: null },
    });
  });

  it("une tâche datée quitte la boîte de réception et reçoit le rappel par défaut si elle a une heure", () => {
    const c = taskCapture("Garage vendredi 14h", NOW, 15);
    expect(c).toMatchObject({ task: { title: "Garage", dueDate: "2026-10-02", dueTime: "14:00", inbox: false, reminder: 15 } });
  });

  it("une note prend sa première ligne pour titre", () => {
    const c = noteCapture("Idées cadeaux\nUn livre\n\nUne plante");
    expect(c?.kind).toBe("note");
    if (c?.kind !== "note") return;
    expect(c.body.title).toBe("Idées cadeaux");
    expect(c.body.plain).toBe("Un livre\nUne plante");
    expect(JSON.parse(c.body.content).content).toHaveLength(3);
    expect(noteCapture("Juste un titre")).toMatchObject({ body: { title: "Juste un titre", plain: "" } });
  });

  it("un événement : à l'heure saisie, sur la journée si une date seule, sinon à la prochaine heure", () => {
    expect(eventCapture("Dentiste jeudi 9h30", NOW, 30)).toMatchObject({
      event: { title: "Dentiste", startDate: "2026-10-01", startTime: "09:30", endDate: "2026-10-01", endTime: "10:30", reminder: 30 },
    });
    expect(eventCapture("Anniversaire de Léa le 5", NOW, 30)).toMatchObject({
      event: { startDate: "2026-10-05", startTime: null, endDate: "2026-10-05", endTime: null, reminder: null },
    });
    expect(eventCapture("Appel", NOW, null)).toMatchObject({ event: { startDate: "2026-09-29", startTime: "11:00", endTime: "12:00" } });
  });

  it("rien à enregistrer sans texte", () => {
    for (const kind of ["task", "note", "event"] as const) expect(buildCapture(kind, "   ", NOW, null)).toBeNull();
    expect(buildCapture("task", "#seulement", NOW, null)).toBeNull();
  });
});
