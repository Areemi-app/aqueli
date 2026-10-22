import { useEffect } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { SelectRow } from "../components/SelectRow";
import { SwitchRow } from "../components/Switch";
import { formatSize } from "../backups/backupsApi";
import { KEYS } from "../lib/itemKeys";
import { useImport } from "./ImportProvider";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

const AFTER = [
  { value: "supprimer", label: tr("Supprimer le fichier") },
  { value: "ranger", label: tr("Ranger dans Import\\Traités") },
] as const;

/** Paramètres › Import : dossier d'import, guide, import d'un fichier. */
export function ImportPanel() {
  const { status, pending, prefs, setPrefs, open, pick, refresh, reveal } = useImport();
  const itemMenu = useItemMenu();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="settings-section">
      <p className="settings-intro">
        <Sentences text={tr("Tâches, notes, contacts et autres éléments s'importent depuis un classeur Excel (.xlsx), un fichier CSV ou un fichier texte (.txt, .md). Les agendas (.ics) et les carnets de contacts (.vcf) s'importent aussi. Un aperçu montre ce qui sera créé, avant toute validation.")} />
      </p>

      <h2 className="settings-heading">{tr("Importer")}</h2>
      <div className="settings-card glass">
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Importer un fichier")}</span>
            <span className="setting-desc">{tr("Un fichier peut aussi être glissé sur la fenêtre d'Aqueli.")}</span>
          </div>
          <button type="button" className="btn-gel btn-gel--sm" onClick={() => void pick()}>
            <Icon d={ICONS.importFile} size={15} stroke={2.2} />
            {tr("Importer un fichier…")}
          </button>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Dossier d'import")}</span>
            <span className="setting-desc import-path">{status?.folder ?? "Documents\\Aqueli\\Import"}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => reveal("dossier")}>
            <Icon d={ICONS.folder} size={15} stroke={2.2} />
            {tr("Ouvrir le dossier")}
          </button>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Guide d'import")}</span>
            <span className="setting-desc">{tr("Préparer un fichier : colonnes reconnues, formats de date, valeurs acceptées.")}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => reveal("guide")}>
            <Icon d={ICONS.file} size={15} stroke={2.2} />
            {tr("Ouvrir le guide")}
          </button>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <span className="setting-label">{tr("Modèles et exemples")}</span>
            <span className="setting-desc">{tr("Classeur Excel prêt à remplir, classeur d'exemple, modèles CSV et fichier texte d'exemple.")}</span>
          </div>
          <button type="button" className="btn-glass btn-glass--sm" onClick={() => reveal("modeles")}>
            <Icon d={ICONS.folder} size={15} stroke={2.2} />
            {tr("Ouvrir les modèles")}
          </button>
        </div>
      </div>

      <h2 className="settings-heading">{tr("Fichiers en attente")}</h2>
      <div className="settings-card glass backup-list" role="list" aria-label={tr("Fichiers en attente")}>
        {pending.length === 0 && <p className="setting-desc backup-empty">{tr("Aucun fichier dans le dossier d'import.")}</p>}
        {pending.map((f) => (
          <div
            key={f.path}
            role="listitem"
            className="setting-row backup-row"
            {...itemMenu(() => [{ label: tr("Afficher l'aperçu"), icon: ICONS.eye, shortcut: KEYS.open, run: () => open(f) }])}
          >
            <div className="setting-text">
              <span className="setting-label">{f.name}</span>
              <span className="setting-desc">
                {formatSize(f.size)}{tr(" · déposé le")}{" "}
                {new Date(f.modified * 1000).toLocaleString(locale(), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => open(f)}>
              {tr("Afficher l'aperçu")}
            </button>
          </div>
        ))}
      </div>

      <h2 className="settings-heading">{tr("Réglages")}</h2>
      <div className="settings-card glass">
        <SwitchRow
          label={tr("Surveiller le dossier d'import")}
          description={tr("Un message s'affiche quand un fichier y est déposé.")}
          checked={prefs.watch}
          onChange={(watch) => setPrefs({ watch })}
        />
        <SelectRow
          label={tr("Après l'import")}
          description={tr("Le dossier d'import n'est pas chiffré. Un fichier choisi ailleurs reste à sa place.")}
          value={prefs.keepFiles ? "ranger" : "supprimer"}
          options={AFTER}
          onChange={(v) => setPrefs({ keepFiles: v === "ranger" })}
        />
      </div>
    </div>
  );
}
