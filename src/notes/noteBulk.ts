/** Actions sur plusieurs notes sélectionnées (Ctrl+clic, Maj+clic) : barre et clic droit. */
import { useBulk } from "../app/bulk";
import { ICONS } from "../components/icons";
import type { SelectionAction } from "../components/SelectionBar";
import { KEYS } from "../lib/itemKeys";
import { notebookTree, type Notebook, type NoteMeta, type NoteSummary } from "./notes";
import { useNotes } from "./NotesProvider";
import { tr, trn } from "../i18n/i18n";

/** « Maison › Cuisine » : chemin d'un carnet. */
function pathOf(book: Notebook, books: readonly Notebook[]): string {
  const names = [book.name];
  let parent = books.find((b) => b.id === book.parentId);
  while (parent) {
    names.unshift(parent.name);
    const up: string | null = parent.parentId;
    parent = books.find((b) => b.id === up);
  }
  return names.join(" › ");
}

export function useNoteBulk(): (notes: readonly NoteSummary[]) => SelectionAction[] {
  const { notebooks, updateMeta, remove } = useNotes();
  const bulk = useBulk();
  return (notes) => {
    // « Note épinglée. », « 3 notes épinglées. »
    const act = (list: readonly NoteSummary[], said: (n: number) => string, undo: string, fn: (n: NoteSummary) => Promise<unknown>) => () =>
      void bulk(said(list.length), undo, async () => {
        for (const n of list) await fn(n);
      });
    const meta = (said: (n: number) => string, changes: Partial<NoteMeta>, list = notes) => act(list, said, tr("modification des notes"), (n) => updateMeta(n, changes));
    const allPinned = notes.every((n) => n.pinned);
    const allFavorite = notes.every((n) => n.favorite);
    return [
      { label: allPinned ? tr("Désépingler") : tr("Épingler"), icon: ICONS.pin, run: meta(allPinned ? (n) => trn(n, "Note désépinglée.", "{n} notes désépinglées.") : (n) => trn(n, "Note épinglée.", "{n} notes épinglées."), { pinned: !allPinned }) },
      {
        label: allFavorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris"),
        icon: ICONS.star,
        run: meta(allFavorite ? (n) => trn(n, "Note retirée des favoris.", "{n} notes retirées des favoris.") : (n) => trn(n, "Note ajoutée aux favoris.", "{n} notes ajoutées aux favoris."), { favorite: !allFavorite }),
      },
      {
        label: tr("Déplacer"),
        icon: ICONS.notebook,
        run: () => {},
        menu: () => [
          ...notebookTree(notebooks).map(({ notebook: b }) => ({
            label: tr("Carnet « {path} »", { path: pathOf(b, notebooks) }),
            icon: ICONS.notebook,
            run: meta((n) => trn(n, "Note déplacée.", "{n} notes déplacées."), { notebookId: b.id }),
          })),
          "separator" as const,
          { label: tr("Sans carnet"), icon: ICONS.inbox, run: meta((n) => trn(n, "Note déplacée.", "{n} notes déplacées."), { notebookId: null }) },
        ],
      },
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: act(notes, (n) => trn(n, "Note supprimée.", "{n} notes supprimées."), tr("suppression des notes"), (n) => remove(n)) },
    ];
  };
}
