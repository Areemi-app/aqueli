/**
 * Contacts cités par « @Léa » dans les saisies rapides (tâches, événements, projets) : les noms
 * reconnus pour chaque contact, et la liaison de l'élément créé à ses contacts (table des liens).
 */
import { useCallback, useMemo } from "react";
import type { ItemRef } from "../links/links";
import { useLinksIfAny } from "../links/LinksProvider";
import type { ContactRef } from "../tasks/quickAdd";
import { contactName } from "./contacts";
import { useContactsIfAny } from "./ContactsProvider";

/** Contacts citables : nom complet d'abord, puis prénom, nom et société. */
export function useContactRefs(): ContactRef[] {
  // Tous les espaces : un contact d'un autre espace se cite aussi.
  const contacts = useContactsIfAny()?.contacts;
  return useMemo(
    () =>
      (contacts ?? []).map((c) => ({
        id: c.id,
        names: [contactName(c), c.firstName, c.lastName, c.company].map((n) => n.trim()).filter(Boolean),
      })),
    [contacts],
  );
}

/** Relie un élément aux contacts cités (chacun une fois). */
export function useLinkContacts(): (item: ItemRef, contactIds: readonly string[]) => Promise<void> {
  const links = useLinksIfAny();
  return useCallback(
    async (item, contactIds) => {
      if (!links) return;
      for (const id of new Set(contactIds)) await links.link(item, { kind: "contact", id });
    },
    [links],
  );
}

/** Nom affiché d'un contact cité (pastille de l'aperçu). */
export function useContactLabel(): (id: string) => string {
  const contacts = useContactsIfAny()?.contacts;
  return useCallback((id) => {
    const c = contacts?.find((x) => x.id === id);
    return c ? contactName(c) : "";
  }, [contacts]);
}
