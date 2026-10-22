/** Journal enregistré dans la base chiffrée (src-tauri/src/data/journal.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { fold } from "../lib/fold";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import type { JournalEntry, JournalPage, JournalSummary } from "./journal";

export interface JournalApi {
  list(): Promise<JournalSummary[]>;
  get(day: DayKey): Promise<JournalEntry | null>;
  /** `null` : la page, devenue vide, est retirée. */
  save(day: DayKey, page: JournalPage): Promise<JournalSummary | null>;
  remove(day: DayKey): Promise<void>;
  restore(day: DayKey): Promise<JournalSummary>;
  /** Jours dont la page contient la recherche (sans accents). */
  search(query: string): Promise<DayKey[]>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: JournalApi = {
  list: () => call("journal_list"),
  get: (day) => call("journal_get", { day }),
  save: (day, page) => call("journal_save", { day, page }),
  remove: (day) => call("journal_delete", { day }),
  restore: (day) => call("journal_restore", { day }),
  search: (query) => call("journal_search", { query }),
};

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** Pages d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): JournalApi {
  const today = dayKey(new Date());
  const pages = new Map<DayKey, JournalEntry>();
  const deleted = new Map<DayKey, JournalEntry>();
  const samples: [number, number, number, string, string[], string[]][] = [
    [1, 4, 4, demo("Longue marche au bord du canal. Fin de journée calme.", "Long walk along the canal. A quiet end to the day."), [demo("Le soleil d'automne", "The autumn sunshine"), demo("Un appel de Léa", "A call from Lea")], ["balade", "famille"]],
    [2, 3, 2, demo("Journée chargée, réunion qui a débordé.", "Busy day, the meeting ran over."), [demo("Un bon café", "A good coffee")], ["travail"]],
    [3, 5, 5, demo("Le projet a enfin avancé. Dîner avec des amis.", "The project finally moved forward. Dinner with friends."), [demo("Mes amis", "My friends"), demo("La musique", "The music"), demo("Le gâteau", "The cake")], ["travail", "amis", "sortie"]],
    [5, 2, 2, demo("Fatigué, rhume qui commence.", "Tired, a cold coming on."), [], ["travail", "sante"]],
    [6, 4, 3, demo("Rangement du garage, satisfaisant.", "Tidied the garage. Very satisfying."), [demo("Le calme du dimanche", "A calm Sunday")], ["menage", "famille"]],
    [8, 3, 3, demo("Rien de particulier.", "Nothing in particular."), [], ["travail", "ecrans"]],
    [365, 4, 4, demo("Premier jour de cours de piano.", "First piano lesson."), [demo("La patience du professeur", "The teacher's patience")], ["musique"]],
    [730, 5, 4, demo("Vacances à la mer.", "Holiday by the sea."), [demo("Le bruit des vagues", "The sound of the waves")], ["voyage", "famille"]],
  ];
  // Un mois de plus pour les tendances : humeur plus haute les jours de sport et de balade.
  const rhythm = [["sport"], ["travail"], ["travail", "ecrans"], ["balade", "amis"], ["travail"], ["sport", "famille"], ["repos", "lecture"]];
  for (let ago = 9; ago <= 45; ago++) {
    if (ago % 5 === 0) continue;
    const activities = rhythm[ago % rhythm.length]!;
    const mood = Math.min(5, 3 + (activities.includes("sport") || activities.includes("balade") ? 1 : 0) + (ago % 4 === 0 ? 1 : 0) - (activities.includes("ecrans") ? 1 : 0));
    samples.push([ago, mood, 3, "", [], activities]);
  }
  for (const [ago, mood, energy, text, gratitudes, activities] of samples) {
    const day = addDays(today, -ago);
    pages.set(day, { day, mood, energy, gratitudes, excerpt: text, updatedAt: Date.now() / 1000, content: text ? doc(text) : "", activities });
  }
  const summary = (e: JournalEntry): JournalSummary => {
    const { content: _c, ...s } = e;
    return s;
  };
  return {
    list: async () => [...pages.values()].map(summary).sort((a, b) => a.day.localeCompare(b.day)),
    get: async (day) => pages.get(day) ?? null,
    save: async (day, page) => {
      const gratitudes = page.gratitudes.map((g) => g.trim()).filter(Boolean);
      if (page.mood === null && page.energy === null && gratitudes.length === 0 && page.activities.length === 0 && !page.plain.trim()) {
        pages.delete(day);
        return null;
      }
      const entry: JournalEntry = {
        day,
        mood: page.mood,
        energy: page.energy,
        gratitudes,
        excerpt: page.plain.replace(/\s+/g, " ").trim().slice(0, 180),
        updatedAt: Date.now() / 1000,
        content: page.content,
        activities: [...new Set(page.activities)],
      };
      pages.set(day, entry);
      return summary(entry);
    },
    remove: async (day) => {
      const e = pages.get(day);
      if (e) deleted.set(day, e);
      pages.delete(day);
    },
    restore: async (day) => {
      const e = deleted.get(day);
      if (!e) throw asDataError({ code: "notFound" });
      pages.set(day, e);
      deleted.delete(day);
      return summary(e);
    },
    search: async (query) => {
      const q = fold(query.trim());
      return [...pages.values()].filter((p) => fold(`${p.excerpt} ${p.gratitudes.join(" ")}`).includes(q)).map((p) => p.day);
    },
  };
}

export const journalApi: JournalApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
