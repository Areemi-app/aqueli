import { Dialog } from "../components/Dialog";
import type { SeriesScope } from "./series";
import { tr } from "../i18n/i18n";

interface SeriesScopeDialogProps {
  action: "modifier" | "supprimer";
  onChoose: (scope: SeriesScope) => void;
  onClose: () => void;
}

/** Événement répété : la modification (ou la suppression) vaut pour une occurrence ou pour toutes. */
export function SeriesScopeDialog({ action, onChoose, onClose }: SeriesScopeDialogProps) {
  const choose = (scope: SeriesScope) => {
    onClose();
    onChoose(scope);
  };
  return (
    <Dialog title={action === "modifier" ? tr("Modifier l'événement répété") : tr("Supprimer l'événement répété")} onClose={onClose}>
      <div className="scope-choices">
        <button type="button" className="btn-glass scope-choice" onClick={() => choose("one")}>
          {tr("Cet événement")}
        </button>
        <button type="button" className="btn-glass scope-choice" onClick={() => choose("all")}>
          {tr("Tous les événements")}
        </button>
      </div>
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={onClose}>
          {tr("Annuler")}
        </button>
      </div>
    </Dialog>
  );
}
