/** Contacts enregistrés dans la base chiffrée (src-tauri/src/data/contacts.rs). */
import { invoke } from "@tauri-apps/api/core";
import { asDataError } from "../lib/dataError";
import { demo } from "../lib/demo";
import { inTauri } from "../lib/windowControls";
import { addDays, dayKey } from "../tasks/day";
import { EMPTY_CONTACT, type Contact, type ContactGroup, type ContactGroupInput, type ContactInput, type Interaction, type InteractionInput } from "./contacts";

export interface ContactsApi {
  list(): Promise<Contact[]>;
  create(contact: ContactInput): Promise<Contact>;
  update(id: string, contact: ContactInput): Promise<Contact>;
  remove(id: string): Promise<void>;
  restore(id: string): Promise<Contact>;
  groups(): Promise<ContactGroup[]>;
  createGroup(group: ContactGroupInput): Promise<ContactGroup>;
  updateGroup(id: string, group: ContactGroupInput): Promise<ContactGroup>;
  /** Retire la catégorie ; ses contacts restent, sans catégorie. */
  removeGroup(id: string): Promise<void>;
  /** Nouvel ordre (glisser-déposer). */
  reorderGroups(ids: string[]): Promise<void>;
  /** Enregistre un export (.vcf ou .csv) dans un fichier choisi ; chemin, ou `null` si annulé. */
  exportFile(name: string, format: "vcf" | "csv", content: string): Promise<string | null>;
  /** Échanges d'un contact, du plus récent au plus ancien. */
  interactions(contactId: string): Promise<Interaction[]>;
  /** Note un échange ; renvoie le contact (dernier échange à jour). */
  addInteraction(contactId: string, interaction: InteractionInput): Promise<Contact>;
  deleteInteraction(id: string): Promise<Contact>;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw asDataError(e);
  }
}

const tauriApi: ContactsApi = {
  list: () => call("contacts_list"),
  create: (contact) => call("contacts_create", { contact }),
  update: (id, contact) => call("contacts_update", { id, contact }),
  remove: (id) => call("contacts_delete", { id }),
  restore: (id) => call("contacts_restore", { id }),
  groups: () => call("contact_groups_list"),
  createGroup: (group) => call("contact_groups_create", { group }),
  updateGroup: (id, group) => call("contact_groups_update", { id, group }),
  removeGroup: (id) => call("contact_groups_delete", { id }),
  reorderGroups: (ids) => call("order_save", { kind: "categories-contacts", ids }),
  exportFile: (name, format, content) => call("export_file", { name, format, content }),
  interactions: (contactId) => call("contact_interactions_list", { contactId }),
  addInteraction: (contactId, interaction) => call("contact_interactions_add", { contactId, interaction }),
  deleteInteraction: (id) => call("contact_interactions_delete", { id }),
};

/** Contacts d'exemple pour l'aperçu dans un navigateur (développement seulement). */
function createPreviewApi(): ContactsApi {
  const now = () => Math.floor(Date.now() / 1000);
  const soon = addDays(dayKey(new Date()), 3).slice(5);
  let seq = 0;
  const make = (input: Partial<ContactInput> & { lastContact?: string | null }): Contact => {
    seq += 1;
    return { ...EMPTY_CONTACT, lastContact: null, ...input, id: `apercu-ct${seq}`, createdAt: now() - 1000 + seq, updatedAt: now() };
  };
  let contacts: Contact[] = [
    make({
      firstName: demo("Léa", "Lea"),
      lastName: "Bernard",
      phones: [{ label: "Mobile", value: demo("06 12 34 56 78", "07700 900123") }],
      emails: [{ label: "Personnel", value: demo("lea.bernard@exemple.fr", "lea.bernard@example.com") }],
      birthday: `2016-${soon}`,
      tags: [demo("famille", "family")],
      favorite: true,
      spaceId: "famille",
      address: demo("12 rue des Lilas\n75011 Paris", "12 Lilac Grove\nBristol BS6 5AA"),
      notes: demo("Aime les tulipes et le thé vert.", "Loves tulips and green tea."),
      keepInTouch: 14,
      lastContact: addDays(dayKey(new Date()), -20),
      fields: [
        { label: demo("Code d'entrée", "Door code"), value: "4589", icon: "cle", color: "#7a5ce6" },
        { label: demo("Pointure", "Shoe size"), value: demo("38", "5"), icon: "sport", color: "#16a3a3" },
      ],
    }),
    make({ company: demo("Garage Dupont", "Hill Street Garage"), phones: [{ label: "Travail", value: demo("01 23 45 67 89", "0117 496 0123") }], tags: [demo("artisan", "trades")], spaceId: "perso" }),
    make({ firstName: "Camille", lastName: "Martin", company: demo("Agence Horizon", "Horizon Studio"), emails: [{ label: "Travail", value: demo("camille.martin@exemple.fr", "camille.martin@example.com") }], birthday: "--03-21", tags: [demo("pro", "work")], spaceId: "travail" }),
    make({ firstName: "Paul", lastName: demo("Durand", "Bennett"), groupId: "apercu-cg1", phones: [{ label: "Mobile", value: demo("07 98 76 54 32", "07700 900456") }], birthday: "1958-11-02", tags: [demo("famille", "family")], spaceId: "famille", keepInTouch: 30 }),
    make({ firstName: "Dr Sophie", lastName: demo("Lefèvre", "Hughes"), phones: [{ label: "Travail", value: demo("01 44 55 66 77", "0117 496 0789") }], address: demo("Cabinet médical, 4 place de la Mairie", "Park Lane Surgery, 4 Market Square"), spaceId: "sante" }),
  ];
  const deleted = new Map<string, Contact>();
  let groups: ContactGroup[] = [{ id: "apercu-cg1", name: demo("Voisins", "Neighbours"), color: "#2fae4a", icon: "maison", position: 0 }];
  const find = (id: string) => {
    const c = contacts.find((x) => x.id === id);
    if (!c) throw asDataError({ code: "notFound" });
    return c;
  };
  let exchanges: Interaction[] = [
    { id: "apercu-ech1", contactId: contacts[0]!.id, day: addDays(dayKey(new Date()), -20), kind: "appel", note: demo("Nouvelles de la rentrée.", "Caught up after the summer holidays."), createdAt: now() },
  ];
  const withLast = (id: string): Contact => {
    const days = exchanges.filter((e) => e.contactId === id).map((e) => e.day).sort();
    const c = { ...find(id), lastContact: days[days.length - 1] ?? null };
    contacts = contacts.map((x) => (x.id === id ? c : x));
    return c;
  };
  return {
    list: async () => contacts,
    create: async (input) => {
      const c = make(input);
      contacts = [...contacts, c];
      return c;
    },
    update: async (id, input) => {
      // Notes nettoyées comme par le cœur (`clean_notes`).
      const c = { ...find(id), ...input, notes: input.notes.trimEnd().replace(/\r\n/g, "\n"), updatedAt: now() };
      contacts = contacts.map((x) => (x.id === id ? c : x));
      return c;
    },
    remove: async (id) => {
      deleted.set(id, find(id));
      contacts = contacts.filter((c) => c.id !== id);
    },
    restore: async (id) => {
      const c = deleted.get(id);
      if (!c) throw asDataError({ code: "notFound" });
      contacts = [...contacts, c];
      return c;
    },
    groups: async () => groups,
    createGroup: async (input) => {
      const g = { ...input, name: input.name.trim(), id: `apercu-cg${Date.now()}`, position: groups.length };
      groups = [...groups, g];
      return g;
    },
    updateGroup: async (id, input) => {
      const g = { ...groups.find((x) => x.id === id)!, ...input, name: input.name.trim() };
      groups = groups.map((x) => (x.id === id ? g : x));
      return g;
    },
    reorderGroups: async (ids) => {
      groups = groups.map((x) => (ids.includes(x.id) ? { ...x, position: ids.indexOf(x.id) } : x)).sort((a, b) => a.position - b.position);
    },
    removeGroup: async (id) => {
      groups = groups.filter((g) => g.id !== id);
      contacts = contacts.map((c) => (c.groupId === id ? { ...c, groupId: null } : c));
    },
    // Aperçu : le fichier n'est pas écrit, son chemin est imité.
    exportFile: async (name, format) => `C:\\Users\\…\\Documents\\${name}.${format}`,
    interactions: async (contactId) => exchanges.filter((e) => e.contactId === contactId).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt),
    addInteraction: async (contactId, input) => {
      exchanges = [...exchanges, { ...input, id: `apercu-ech${Date.now()}`, contactId, createdAt: now() }];
      return withLast(contactId);
    },
    deleteInteraction: async (id) => {
      const e = exchanges.find((x) => x.id === id);
      if (!e) throw asDataError({ code: "notFound" });
      exchanges = exchanges.filter((x) => x.id !== id);
      return withLast(e.contactId);
    },
  };
}

export const contactsApi: ContactsApi = inTauri || !import.meta.env.DEV ? tauriApi : createPreviewApi();
