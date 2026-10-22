import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onDataAdded } from "../app/background";
import { useToast } from "../app/ToastProvider";
import { recordUndo } from "../app/undo";
import { mergeOrder } from "../lib/dragDrop";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { contactsApi } from "./api";
import { sortContacts, toInput, type Contact, type ContactGroup, type ContactGroupInput, type ContactInput, type Interaction, type InteractionInput } from "./contacts";
import { tr } from "../i18n/i18n";

interface ContactsContextValue {
  /** Tous les contacts, par ordre alphabétique. */
  contacts: readonly Contact[];
  /** Contacts de l'espace choisi dans la barre de titre. */
  visible: readonly Contact[];
  loaded: boolean;
  create: (input: ContactInput) => Promise<Contact | null>;
  update: (contact: Contact, changes: Partial<ContactInput>) => Promise<void>;
  /** Met le contact à la corbeille, avec « Annuler ». */
  remove: (contact: Contact) => Promise<void>;
  /** Catégories de contacts. */
  groups: readonly ContactGroup[];
  createGroup: (input: ContactGroupInput) => Promise<ContactGroup | null>;
  updateGroup: (group: ContactGroup, input: ContactGroupInput) => Promise<void>;
  /** Retire la catégorie ; ses contacts restent, sans catégorie (« Annuler » la rétablit). */
  removeGroup: (group: ContactGroup) => Promise<void>;
  /** Nouvel ordre d'une partie (glisser-déposer) ; les autres gardent leur place. Ctrl+Z le défait. */
  reorderGroups: (ids: string[]) => Promise<void>;
  /** Note un échange (appel, message…) ; « Annuler » le retire. */
  addInteraction: (contact: Contact, input: InteractionInput) => Promise<boolean>;
  /** Retire un échange, avec « Annuler ». */
  removeInteraction: (interaction: Interaction) => Promise<boolean>;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const { filter } = useSpaces();

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const reload = useCallback(async () => {
    const [list, cats] = await enqueue(() => Promise.all([contactsApi.list(), contactsApi.groups()]));
    setContacts(sortContacts(list));
    setGroups([...cats].sort((a, b) => a.position - b.position));
  }, [enqueue]);

  useEffect(() => {
    reload()
      .catch((err: DataError) => notify(dataErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [reload, notify]);
  useEffect(() => onDataAdded("contact", () => void reload().catch(() => undefined)), [reload]);

  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const value = useMemo<ContactsContextValue>(() => {
    const fail = (err: unknown) => notify(dataErrorMessage(err as DataError));
    const put = (c: Contact) => setContacts((list) => sortContacts(list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));
    const remove = async (contact: Contact) => {
      try {
        await enqueue(() => contactsApi.remove(contact.id));
      } catch (err) {
        fail(err);
        return;
      }
      setContacts((list) => list.filter((c) => c.id !== contact.id));
      notify(tr("Contact supprimé."), {
        label: tr("Annuler|action"),
        undo: tr("suppression du contact"),
        run: () => {
          enqueue(() => contactsApi.restore(contact.id))
            .then(put)
            .catch(fail);
        },
      });
    };
    const update = async (contact: Contact, changes: Partial<ContactInput>) => {
      const base = contactsRef.current.find((c) => c.id === contact.id) ?? contact;
      recordUndo(tr("modification du contact"), () => update(base, toInput(base)), `contact:${base.id}`);
      put({ ...base, ...changes });
      try {
        put(await enqueue(() => contactsApi.update(base.id, { ...toInput(base), ...changes })));
      } catch (err) {
        fail(err);
        await reload().catch(() => undefined);
      }
    };
    const updateGroup = async (group: ContactGroup, input: ContactGroupInput) => {
      try {
        const g = await enqueue(() => contactsApi.updateGroup(group.id, input));
        setGroups((list) => list.map((x) => (x.id === g.id ? g : x)));
        recordUndo(tr("modification de la catégorie"), () => updateGroup(g, { name: group.name, color: group.color, icon: group.icon }));
      } catch (err) {
        fail(err);
      }
    };
    const removeGroup = async (group: ContactGroup) => {
      const members = contactsRef.current.filter((c) => c.groupId === group.id);
      try {
        await enqueue(() => contactsApi.removeGroup(group.id));
      } catch (err) {
        fail(err);
        return;
      }
      setGroups((list) => list.filter((g) => g.id !== group.id));
      setContacts((list) => list.map((c) => (c.groupId === group.id ? { ...c, groupId: null } : c)));
      notify(tr("Catégorie supprimée."), {
        label: tr("Annuler|action"),
        undo: tr("suppression de la catégorie"),
        run: () => {
          void (async () => {
            const again = await enqueue(() => contactsApi.createGroup({ name: group.name, color: group.color, icon: group.icon }));
            for (const c of members) await enqueue(() => contactsApi.update(c.id, { ...toInput(c), groupId: again.id }));
            await reload();
          })().catch(fail);
        },
      });
    };
    return {
      reorderGroups: async (part: string[]) => {
        const before = groups.map((x) => x.id);
        const ids = mergeOrder(before, part);
        if (ids.join() === before.join()) return;
        const apply = async (order: string[]) => {
          setGroups((list) => [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((x, position) => ({ ...x, position })));
          await enqueue(() => contactsApi.reorderGroups(order));
        };
        try {
          await apply(ids);
          recordUndo(tr("déplacement de la catégorie"), () => apply(before));
        } catch (err) {
          fail(err);
        }
      },
      contacts,
      groups,
      updateGroup,
      removeGroup,
      createGroup: async (input) => {
        try {
          const g = await enqueue(() => contactsApi.createGroup(input));
          setGroups((list) => [...list, g]);
          recordUndo(tr("ajout de la catégorie"), () => removeGroup(g));
          return g;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      visible: filter === "tous" ? contacts : contacts.filter((c) => c.spaceId === filter),
      loaded,
      create: async (input) => {
        try {
          const c = await enqueue(() => contactsApi.create(input));
          put(c);
          recordUndo(tr("ajout du contact"), () => remove(c));
          return c;
        } catch (err) {
          fail(err);
          return null;
        }
      },
      update,
      remove,
      addInteraction: async (contact, input) => {
        try {
          const before = new Set((await enqueue(() => contactsApi.interactions(contact.id))).map((i) => i.id));
          put(await enqueue(() => contactsApi.addInteraction(contact.id, input)));
          const added = (await enqueue(() => contactsApi.interactions(contact.id))).find((i) => !before.has(i.id));
          if (added) recordUndo(tr("échange noté"), () => enqueue(() => contactsApi.deleteInteraction(added.id)).then(put));
          return true;
        } catch (err) {
          fail(err);
          return false;
        }
      },
      removeInteraction: async (interaction) => {
        try {
          put(await enqueue(() => contactsApi.deleteInteraction(interaction.id)));
        } catch (err) {
          fail(err);
          return false;
        }
        notify(tr("Échange supprimé."), {
          label: tr("Annuler|action"),
          undo: tr("suppression de l'échange"),
          run: () => {
            enqueue(() => contactsApi.addInteraction(interaction.contactId, { day: interaction.day, kind: interaction.kind, note: interaction.note }))
              .then(put)
              .catch(fail);
          },
        });
        return true;
      },
    };
  }, [contacts, groups, loaded, filter, enqueue, notify, reload]);

  return <ContactsContext.Provider value={value}>{children}</ContactsContext.Provider>;
}

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts doit être utilisé dans ContactsProvider");
  return ctx;
}

export function useContactsIfAny(): ContactsContextValue | null {
  return useContext(ContactsContext);
}
