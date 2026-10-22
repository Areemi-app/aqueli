import { act, render } from "@testing-library/react";
import { clearUndo, popUndo, replay, undoCount } from "../app/undo";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskInput } from "./tasks";

const notify = vi.fn();
const play = vi.fn();
vi.mock("../app/ToastProvider", () => ({ useToast: () => notify }));
vi.mock("../sound/SoundProvider", () => ({ useSound: () => ({ play }) }));
vi.mock("../spaces/SpacesProvider", () => ({ useSpaces: () => ({ filter: "tous" }) }));
vi.mock("../lib/useNow", () => ({ useNow: () => new Date(2026, 8, 27, 10, 0) }));
vi.mock("../navigation/NavigationProvider", () => ({ useNavigation: () => ({ go: () => {} }) }));
vi.mock("../habits/HabitsProvider", () => ({
  useHabits: () => ({
    habits: [
      {
        id: "h1",
        name: "Lire",
        icon: "livre",
        color: null,
        kind: "oui-non",
        negative: false,
        target: 1,
        unit: "",
        frequency: { kind: "quotidien" },
        reminder: "21:00",
        spaceId: null,
        position: 0,
        archived: false,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    checks: new Map(),
    loaded: true,
    setValue: () => Promise.resolve(),
  }),
}));
vi.mock("../contacts/ContactsProvider", () => ({
  useContacts: () => ({
    contacts: [
      { id: "c1", firstName: "Léa", lastName: "", company: "", phones: [], emails: [], address: "", birthday: null, notes: "", tags: [], photo: null, color: null, favorite: false, spaceId: null, fields: [], groupId: null, style: null, createdAt: 0, updatedAt: 0 },
    ],
    loaded: true,
  }),
  useContactsIfAny: () => null,
}));
vi.mock("../documents/DocumentsProvider", () => ({ useDocuments: () => ({ documents: [], loaded: true }), useDocumentsIfAny: () => null }));
vi.mock("../journal/JournalProvider", () => ({ useJournal: () => ({ pages: new Map(), loaded: true }) }));
vi.mock("../focus/FocusProvider", () => {
  const timer = {
    phase: "concentration",
    status: "en-cours",
    endsAt: Date.now() + 600_000,
    remaining: 1_500_000,
    cycle: 1,
    startedAt: Date.now(),
    taskId: null,
    plan: { focus: 25, pause: 5, longPause: 15, every: 4 },
  };
  return { useFocus: () => ({ timer, settings: { autoContinue: false } }), useFocusIfAny: () => null };
});

/** Faux cœur : chaque appel est noté, et ses réponses peuvent être retardées. */
const server = vi.hoisted(() => {
  const state = {
    tasks: [] as Task[],
    log: [] as string[],
    delays: [] as number[],
    refuse: false,
  };
  const later = <T,>(value: () => T) =>
    new Promise<T>((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(value());
        } catch (e) {
          reject(e);
        }
      }, state.delays.shift() ?? 0),
    );
  return {
    state,
    api: {
      list: () => {
        state.log.push("list");
        return later(() => structuredClone(state.tasks));
      },
      update: (id: string, input: TaskInput) => {
        state.log.push(`update:start:${input.priority}:${input.tags.join(",")}`);
        return later(() => {
          if (state.refuse) throw { code: "invalid", field: "title" };
          state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, ...input } : t));
          state.log.push(`update:end:${input.priority}:${input.tags.join(",")}`);
          return structuredClone(state.tasks.find((t) => t.id === id)!);
        });
      },
      setDone: (id: string, done: boolean) =>
        later(() => {
          state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, doneAt: done ? 1 : null } : t));
          return { task: structuredClone(state.tasks.find((t) => t.id === id)!), created: null, removed: null };
        }),
      create: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
    },
  };
});
vi.mock("./api", () => ({ tasksApi: server.api }));
const syncReminders = vi.fn(async (_list: unknown[]) => {});
vi.mock("./remindersApi", () => ({ syncReminders: (list: unknown[]) => syncReminders(list), missedWindow: async () => null }));

/** Un rendez-vous dans trois heures, avec un rappel à l'heure. */
const soon = new Date(Date.now() + 3 * 3600 * 1000);
const soonDay = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, "0")}-${String(soon.getDate()).padStart(2, "0")}`;
const soonTime = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
vi.mock("../calendar/api", () => ({
  eventsApi: {
    list: async () => [
      {
        id: "e1",
        title: "Dentiste",
        location: "",
        notes: "",
        spaceId: null,
        startDate: soonDay,
        startTime: soonTime,
        endDate: soonDay,
        endTime: "23:59",
        color: null,
        reminder: 0,
        recurrence: null,
        exceptions: [],
        repeatUntil: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  },
}));

/** Une obligation due dans deux jours : son rappel J-1 part aussi. */
const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
const dueDay = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, "0")}-${String(inTwoDays.getDate()).padStart(2, "0")}`;
vi.mock("../obligations/api", () => ({
  obligationsApi: {
    list: async () => [
      {
        id: "o1",
        title: "Loyer",
        category: "logement",
        organization: "",
        reference: "",
        amountCents: 75000,
        periodMonths: 1,
        dueDate: dueDay,
        anchorDay: Number(dueDay.slice(8)),
        cancelBy: null,
        status: "a-faire",
        spaceId: null,
        color: null,
        notes: "",
        lastPaidOn: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  },
}));

const { TasksProvider, useTasks } = await import("./TasksProvider");
const { ObligationsProvider } = await import("../obligations/ObligationsProvider");
const { EventsProvider } = await import("../calendar/EventsProvider");
const { RemindersBridge } = await import("../app/RemindersBridge");

const TASK: Task = {
  id: "t1",
  title: "Appeler le garage",
  notes: "",
  spaceId: null,
  dueDate: null,
  dueTime: null,
  startDate: null,
  priority: 0,
  estimate: null,
  tags: [],
  subtasks: [],
  recurrence: null,
  color: null,
  reminder: null,
  inbox: false,
  projectId: null,
  doing: false,
  doneAt: null,
  createdAt: 1,
  updatedAt: 1,
};

let ctx: ReturnType<typeof useTasks>;
function Probe() {
  ctx = useTasks();
  return null;
}

async function mount() {
  const view = render(
    <TasksProvider>
      <Probe />
    </TasksProvider>,
  );
  await act(() => new Promise((r) => setTimeout(r, 20)));
  return view;
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 120)));

beforeEach(() => {
  server.state.tasks = [structuredClone(TASK)];
  server.state.log = [];
  server.state.delays = [];
  server.state.refuse = false;
  notify.mockClear();
  play.mockClear();
  syncReminders.mockClear();
});

describe("enregistrement des tâches", () => {
  it("charge les tâches depuis la base", async () => {
    await mount();
    expect(ctx.loaded).toBe(true);
    expect(ctx.tasks.map((t) => t.title)).toEqual(["Appeler le garage"]);
  });

  it("deux changements rapprochés sont enregistrés dans l'ordre, sans se perdre", async () => {
    await mount();
    server.state.delays = [60, 0]; // la première réponse arrive la dernière
    act(() => {
      void ctx.update(ctx.tasks[0]!, { priority: 3 });
      void ctx.update(ctx.tasks[0]!, { tags: ["voiture"] });
    });
    expect(ctx.tasks[0]).toMatchObject({ priority: 3, tags: ["voiture"] });
    await settle();

    expect(server.state.log).toEqual([
      "list",
      "update:start:3:",
      "update:end:3:",
      "update:start:3:voiture",
      "update:end:3:voiture",
    ]);
    expect(server.state.tasks[0]).toMatchObject({ priority: 3, tags: ["voiture"] });
    expect(ctx.tasks[0]).toMatchObject({ priority: 3, tags: ["voiture"] });
  });

  it("un changement refusé est signalé et la liste relue depuis la base", async () => {
    await mount();
    server.state.refuse = true;
    await act(() => ctx.update(ctx.tasks[0]!, { priority: 2 }));
    await settle();

    expect(notify).toHaveBeenCalledWith("Le titre doit contenir de 1 à 500 caractères.");
    expect(server.state.log.filter((l) => l === "list")).toHaveLength(2);
    expect(ctx.tasks[0]?.priority).toBe(0);
  });

  it("terminer une tâche joue le son de la bulle et s'affiche tout de suite", async () => {
    await mount();
    server.state.delays = [50];
    act(() => {
      void ctx.setDone(ctx.tasks[0]!, true);
    });
    expect(play).toHaveBeenCalledWith("bulle");
    expect(ctx.tasks[0]?.doneAt).not.toBeNull();
    await settle();
    expect(server.state.tasks[0]?.doneAt).toBe(1);
  });
});

describe("Ctrl+Z", () => {
  it("rend la tâche telle qu'avant la modification, sans inscrire l'annulation elle-même", async () => {
    clearUndo();
    await mount();
    await act(() => ctx.update(ctx.tasks[0]!, { priority: 3, tags: ["voiture"] }));
    await settle();
    const entry = popUndo();
    expect(entry?.label).toBe("modification de la tâche");
    await act(() => replay(entry!.run));
    await settle();
    expect(server.state.tasks[0]).toMatchObject({ priority: 0, tags: [] });
    expect(undoCount()).toBe(0);
  });

  it("rouvre une tâche terminée par erreur", async () => {
    clearUndo();
    await mount();
    await act(() => ctx.setDone(ctx.tasks[0]!, true));
    await settle();
    const entry = popUndo();
    expect(entry?.label).toBe("tâche terminée");
    await act(() => replay(entry!.run));
    await settle();
    expect(server.state.tasks[0]?.doneAt).toBeNull();
  });
});

describe("rappels confiés au cœur", () => {
  it("tâches, rendez-vous, obligations, habitudes et Focus partent ensemble, même si la fenêtre se ferme juste après le réglage", async () => {
    const view = render(
      <TasksProvider>
        <EventsProvider>
          <ObligationsProvider>
            <RemindersBridge />
            <Probe />
          </ObligationsProvider>
        </EventsProvider>
      </TasksProvider>,
    );
    await act(() => new Promise((r) => setTimeout(r, 20)));
    await settle();
    syncReminders.mockClear();
    act(() => {
      void ctx.update(ctx.tasks[0]!, { dueDate: soonDay, dueTime: soonTime, reminder: 0 });
    });
    view.unmount();
    expect(syncReminders).toHaveBeenCalledTimes(1);
    const sent = (syncReminders.mock.calls[0]?.[0] as { taskId: string }[]).map((r) => r.taskId);
    expect(sent.filter((id) => !id.startsWith("habitude:") && !id.startsWith("focus:")).sort()).toEqual([`evt:e1@${soonDay}`, `obl:o1@${dueDay}:e1`, "t1"]);
    expect(sent.some((id) => id.startsWith("habitude:h1@"))).toBe(true);
    expect(sent.filter((id) => id.startsWith("focus:"))).toEqual(["focus:fin", "focus:pause"]);
  });
});

describe("rappel par défaut", () => {
  it("s'ajoute quand une tâche reçoit une heure, d'où que vienne le changement", async () => {
    await mount();
    await act(() => ctx.update(ctx.tasks[0]!, { dueDate: "2026-09-27", dueTime: "14:30" }));
    expect(server.state.tasks[0]?.reminder).toBe(0);
  });

  it("ne remplace pas un rappel choisi en même temps", async () => {
    await mount();
    await act(() => ctx.update(ctx.tasks[0]!, { dueDate: "2026-09-27", dueTime: "14:30", reminder: 60 }));
    expect(server.state.tasks[0]?.reminder).toBe(60);
  });
});
