/** Actions sur plusieurs contacts sélectionnés (Ctrl+clic, Maj+clic) : barre et clic droit. */
import { useBulk } from "../app/bulk";
import { ICONS } from "../components/icons";
import type { SelectionAction } from "../components/SelectionBar";
import { KEYS } from "../lib/itemKeys";
import type { Contact } from "./contacts";
import { useContacts } from "./ContactsProvider";
import { tr, trn } from "../i18n/i18n";

export function useContactBulk(): (contacts: readonly Contact[]) => SelectionAction[] {
  const { update, remove, groups } = useContacts();
  const bulk = useBulk();
  return (contacts) => {
    // « Contact supprimé. », « 3 contacts supprimés. »
    const act = (said: (n: number) => string, undo: string, fn: (c: Contact) => Promise<unknown>) => () =>
      void bulk(said(contacts.length), undo, async () => {
        for (const c of contacts) await fn(c);
      });
    const allFavorite = contacts.every((c) => c.favorite);
    return [
      {
        label: allFavorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris"),
        icon: ICONS.star,
        run: act((n) => (allFavorite ? trn(n, "Contact retiré des favoris.", "{n} contacts retirés des favoris.") : trn(n, "Contact ajouté aux favoris.", "{n} contacts ajoutés aux favoris.")), tr("modification des contacts"), (c) => update(c, { favorite: !allFavorite })),
      },
      ...(groups.length > 0
        ? [
            {
              label: tr("Catégorie"),
              icon: ICONS.spaces,
              run: () => {},
              menu: () => [
                ...groups.map((g) => ({
                  label: tr("Ranger dans « {name} »", { name: g.name }),
                  icon: ICONS.spaces,
                  run: act((n) => trn(n, "Contact rangé.", "{n} contacts rangés."), tr("changement de catégorie"), (c) => update(c, { groupId: g.id })),
                })),
                { label: tr("Sans catégorie"), icon: ICONS.spaces, run: act((n) => trn(n, "Contact sorti de sa catégorie.", "{n} contacts sortis de leur catégorie."), tr("changement de catégorie"), (c) => update(c, { groupId: null })) },
              ],
            },
          ]
        : []),
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: act((n) => trn(n, "Contact supprimé.", "{n} contacts supprimés."), tr("suppression des contacts"), (c) => remove(c)) },
    ];
  };
}
