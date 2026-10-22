/** Actions sur plusieurs documents sélectionnés (Ctrl+clic, Maj+clic) : barre et clic droit. */
import { useBulk } from "../app/bulk";
import { ICONS } from "../components/icons";
import type { SelectionAction } from "../components/SelectionBar";
import { symbolPath } from "../components/symbols";
import { KEYS } from "../lib/itemKeys";
import type { Document } from "./documents";
import { useDocuments } from "./DocumentsProvider";
import { tr, trn } from "../i18n/i18n";

export function useDocumentBulk(): (docs: readonly Document[]) => SelectionAction[] {
  const { folders, update, remove, exportMany } = useDocuments();
  const bulk = useBulk();
  return (docs) => {
    // « Document rangé. », « 3 documents rangés. »
    const act = (said: (n: number) => string, undo: string, fn: (d: Document) => Promise<unknown>) => () =>
      void bulk(said(docs.length), undo, async () => {
        for (const d of docs) await fn(d);
      });
    const inFolder = docs.some((d) => d.folderId !== null);
    return [
      { label: tr("Exporter…"), icon: ICONS.importFile, run: () => void exportMany(docs) },
      ...(folders.length > 0 || inFolder
        ? [
            {
              label: tr("Déplacer"),
              icon: ICONS.folder,
              run: () => {},
              menu: () => [
                ...folders.map((f) => ({
                  label: tr("Ranger dans « {name} »", { name: f.name }),
                  icon: symbolPath(f.icon ?? "carnet", ICONS.folder),
                  run: act((n) => trn(n, "Document rangé.", "{n} documents rangés."), tr("rangement des documents"), (d) => update(d, { folderId: f.id })),
                })),
                ...(inFolder
                  ? [{ label: tr("Sortir du dossier"), icon: ICONS.folder, run: act((n) => trn(n, "Document sorti de son dossier.", "{n} documents sortis de leur dossier."), tr("rangement des documents"), (d) => update(d, { folderId: null })) }]
                  : []),
              ],
            },
          ]
        : []),
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: act((n) => trn(n, "Document supprimé.", "{n} documents supprimés."), tr("suppression des documents"), (d) => remove(d)) },
    ];
  };
}
