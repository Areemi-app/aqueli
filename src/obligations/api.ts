/** Obligations enregistrées dans la base chiffrée (commandes du cœur, src-tauri/src/data/obligations.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError, type DataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import { addMonthsAnchored, type CategoryCustom, type Obligation, type ObligationInput, type Payment } from "./obligations";

export interface ObligationsApi {
  list(): Promise<Obligation[]>;
  create(obligation: ObligationInput): Promise<Obligation>;
  update(id: string, obligation: ObligationInput): Promise<Obligation>;
  /** « Payé » : échéance suivante (périodique) ou statut « payée ». */
  pay(id: string, today: DayKey): Promise<Obligation>;
  /** Prélèvements automatiques arrivés jusqu'à `today` ; obligations changées. */
  autopay(today: DayKey): Promise<Obligation[]>;
  /** Paiements d'une obligation, du plus récent au plus ancien. */
  payments(id: string): Promise<Payment[]>;
  /** Retire le dernier paiement (« Annuler » après « Payé »). */
  forgetPayment(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Obligation>;
  /** Catégories renommées ou recolorées. */
  categories(): Promise<CategoryCustom[]>;
  /** Sans nom ni couleur : la catégorie revient à l'origine. */
  customizeCategory(category: CategoryCustom): Promise<CategoryCustom>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: ObligationsApi = {
  list: () => call("obligations_list"),
  create: (obligation) => call("obligations_create", { obligation }),
  update: (id, obligation) => call("obligations_update", { id, obligation }),
  pay: (id, today) => call("obligations_pay", { id, today }),
  autopay: (today) => call("obligations_autopay", { today }),
  payments: (id) => call("obligations_payments", { id }),
  forgetPayment: (id) => call("obligations_forget_payment", { id }),
  remove: (id) => call("obligations_delete", { id }),
  restore: (id) => call("obligations_restore", { id }),
  categories: () => call("obligation_categories_list"),
  customizeCategory: (category) => call("obligation_categories_update", { category }),
};

/** Obligations d'exemple en mémoire pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): ObligationsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const today = dayKey(new Date());
  let seq = 0;
  const make = (input: Partial<ObligationInput> & Pick<ObligationInput, "title" | "category" | "dueDate">): Obligation => {
    seq += 1;
    return {
      id: `apercu-obl${seq}`,
      organization: "",
      reference: "",
      amountCents: null,
      periodMonths: null,
      cancelBy: null,
      status: "a-faire",
      spaceId: "perso",
      color: null,
      notes: "",
      autoPay: false,
      ...input,
      anchorDay: Number(input.dueDate.slice(8)),
      lastPaidOn: null,
      createdAt: now(),
      updatedAt: now(),
    };
  };
  let list: Obligation[] = [
    make({ title: demo("Loyer", "Rent"), category: "logement", organization: demo("Agence du Parc", "Parkside Lettings"), amountCents: 75000, periodMonths: 1, dueDate: addDays(today, 6), autoPay: true }),
    make({ title: demo("Assurance auto", "Car insurance"), category: "assurances", organization: demo("Maif", "Meadow Insurance"), reference: "AUTO-58213", amountCents: 4590, periodMonths: 1, dueDate: addDays(today, 12) }),
    make({
      title: demo("Box internet", "Broadband"),
      category: "abonnements",
      organization: demo("Orange", "Skyline Broadband"),
      amountCents: 2999,
      periodMonths: 1,
      dueDate: addDays(today, 18),
      cancelBy: addDays(today, 16),
    }),
    make({ title: demo("Musique en ligne", "Music streaming"), category: "abonnements", amountCents: 1099, periodMonths: 1, dueDate: addDays(today, -40), autoPay: true }),
    make({ title: demo("Taxe foncière", "Council Tax"), category: "impots", organization: demo("Finances publiques", "City Council"), amountCents: 112000, dueDate: addDays(today, 16) }),
    make({ title: demo("Contrôle technique", "MOT"), category: "vehicule", amountCents: 7800, dueDate: addDays(today, 45) }),
    make({ title: demo("Mutuelle", "Health insurance"), category: "sante", organization: demo("Harmonie", "Willow Health"), amountCents: 6200, periodMonths: 1, dueDate: addDays(today, -2) }),
    make({ title: demo("Passeport", "Passport"), category: "identite", reference: "22AB45612", dueDate: "2031-04-02" }),
    make({ title: demo("Garantie lave-linge", "Washing machine warranty"), category: "garanties", organization: demo("Darty", "Brightside Appliances"), dueDate: addDays(today, 300) }),
    make({ title: demo("Salle de sport", "Gym"), category: "abonnements", amountCents: 2990, periodMonths: 1, dueDate: addDays(today, 9), status: "resilie" }),
  ];
  const find = (id: string) => {
    const o = list.find((x) => x.id === id);
    if (!o) throw { code: "notFound" } satisfies DataError;
    return o;
  };
  const check = (input: ObligationInput): ObligationInput => {
    const title = input.title.split(/\s+/).filter(Boolean).join(" ");
    if (!title) throw { code: "invalid", field: "title" } satisfies DataError;
    if (input.cancelBy && input.cancelBy > input.dueDate) throw { code: "invalid", field: "cancelBy" } satisfies DataError;
    return { ...input, title };
  };
  const deleted = new Map<string, Obligation>();
  let custom: CategoryCustom[] = [];
  const replace = (o: Obligation) => {
    list = list.map((x) => (x.id === o.id ? o : x));
    return o;
  };
  let paymentSeq = 0;
  let paid: Payment[] = [];
  const settle = (id: string, day: DayKey, auto: boolean): Obligation => {
    const o = find(id);
    if (o.status === "resilie") throw { code: "invalid", field: "status" } satisfies DataError;
    paid = [{ id: ++paymentSeq, obligationId: id, dueDate: o.dueDate, paidOn: day, amountCents: o.amountCents, auto }, ...paid];
    if (o.periodMonths === null) return replace({ ...o, status: "paye", lastPaidOn: day });
    const cancelBy = o.cancelBy ? addMonthsAnchored(o.cancelBy, o.periodMonths, Number(o.cancelBy.slice(8))) : null;
    return replace({ ...o, dueDate: addMonthsAnchored(o.dueDate, o.periodMonths, o.anchorDay), cancelBy, lastPaidOn: day });
  };
  return {
    list: async () => list,
    create: async (input) => {
      const o = make(check(input));
      list = [...list, o];
      return o;
    },
    update: async (id, input) => {
      const current = find(id);
      const clean = check(input);
      const anchorDay = clean.dueDate === current.dueDate ? current.anchorDay : Number(clean.dueDate.slice(8));
      return replace({ ...current, ...clean, anchorDay, updatedAt: now() });
    },
    pay: async (id, day) => settle(id, day, false),
    autopay: async (day) => {
      const changed: Obligation[] = [];
      for (const o of list.filter((x) => x.autoPay && x.status === "a-faire" && x.dueDate <= day)) {
        let current = o;
        for (let i = 0; i < 120 && current.status === "a-faire" && current.dueDate <= day; i++) current = settle(o.id, current.dueDate, true);
        changed.push(current);
      }
      return changed;
    },
    payments: async (id) => paid.filter((p) => p.obligationId === id).sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.id - a.id),
    forgetPayment: async (id) => {
      const last = paid.filter((p) => p.obligationId === id).sort((a, b) => b.id - a.id)[0];
      paid = paid.filter((p) => p !== last);
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      list = list.filter((o) => o.id !== id);
    },
    restore: async (id) => {
      const o = deleted.get(id);
      if (!o) throw { code: "notFound" } satisfies DataError;
      deleted.delete(id);
      list = [...list, o];
      return o;
    },
    categories: async () => custom,
    customizeCategory: async (category) => {
      const label = category.label?.split(/\s+/).filter(Boolean).join(" ") || null;
      const clean = { ...category, label };
      custom = [...custom.filter((c) => c.id !== category.id), ...(label || clean.color || clean.icon ? [clean] : [])];
      return clean;
    },
  };
}

export const obligationsApi: ObligationsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
