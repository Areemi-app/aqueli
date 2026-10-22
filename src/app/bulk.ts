import { useCallback } from "react";
import { useToast } from "./ToastProvider";
import { collectUndo } from "./undo";
import { tr } from "../i18n/i18n";

/**
 * Action sur les éléments sélectionnés : chacun passe par son fournisseur de données comme d'habitude,
 * mais un seul message s'affiche à la fin (« 3 tâches supprimées. »), avec un « Annuler » (et
 * un Ctrl+Z) qui défait tout d'un coup.
 */
export function useBulk(): (message: string, undoLabel: string, work: () => Promise<unknown>) => Promise<void> {
  const notify = useToast();
  return useCallback(
    async (message, undoLabel, work) => {
      const run = await collectUndo(work);
      notify(message, run ? { label: tr("Annuler|action"), undo: undoLabel, run } : undefined);
    },
    [notify],
  );
}

/** « 3 tâches », « 1 note ». */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}
