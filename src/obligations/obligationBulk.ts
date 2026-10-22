/** Actions sur plusieurs obligations sélectionnées (Ctrl+clic, Maj+clic) : barre et clic droit. */
import { useBulk } from "../app/bulk";
import { ICONS } from "../components/icons";
import type { SelectionAction } from "../components/SelectionBar";
import { KEYS } from "../lib/itemKeys";
import type { Obligation } from "./obligations";
import { useObligations } from "./ObligationsProvider";
import { tr, trn } from "../i18n/i18n";

export function useObligationBulk(): (obligations: readonly Obligation[]) => SelectionAction[] {
  const { pay, remove } = useObligations();
  const bulk = useBulk();
  return (obligations) => {
    // « Obligation payée. », « 3 obligations payées. »
    const act = (list: readonly Obligation[], said: (n: number) => string, undo: string, fn: (o: Obligation) => Promise<unknown>) => () =>
      void bulk(said(list.length), undo, async () => {
        for (const o of list) await fn(o);
      });
    const toPay = obligations.filter((o) => o.status === "a-faire");
    return [
      {
        label: tr("Marquer comme payées"),
        icon: ICONS.check,
        disabled: toPay.length === 0,
        run: act(toPay, (n) => trn(n, "Obligation payée.", "{n} obligations payées."), tr("obligations payées"), (o) => pay(o)),
      },
      { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: act(obligations, (n) => trn(n, "Obligation supprimée.", "{n} obligations supprimées."), tr("suppression des obligations"), (o) => remove(o)) },
    ];
  };
}
