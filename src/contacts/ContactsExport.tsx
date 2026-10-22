/** Fenêtre « Exporter les contacts » : carnet .vcf ou tableau .csv, dans un fichier choisi. */
import { useState } from "react";
import { useToast } from "../app/ToastProvider";
import { Dialog } from "../components/Dialog";
import { Segmented } from "../components/Segmented";
import { dataErrorMessage, type DataError } from "../lib/dataError";
import { useSpaces } from "../spaces/SpacesProvider";
import { contactsApi } from "./api";
import type { Contact } from "./contacts";
import { toCsv, toVcf } from "./exportCards";
import { tr, trn } from "../i18n/i18n";

type Format = "vcf" | "csv";

const FORMATS: readonly { value: Format; label: string }[] = [
  { value: "vcf", label: tr("Carnet (.vcf)") },
  { value: "csv", label: tr("Tableau (.csv)") },
];

const HINTS: Record<Format, string> = {
  vcf: tr("Format lu par les téléphones, Gmail et Outlook."),
  csv: tr("Format lu par Excel. Il s'importe aussi dans Aqueli."),
};

export function ContactsExport({ contacts, scope, onClose }: { contacts: readonly Contact[]; scope: string; onClose: () => void }) {
  const { spaces } = useSpaces();
  const notify = useToast();
  const [format, setFormat] = useState<Format>("vcf");
  const [busy, setBusy] = useState(false);
  const n = contacts.length;

  const run = async () => {
    setBusy(true);
    try {
      const content = format === "vcf" ? toVcf(contacts) : toCsv(contacts, spaces);
      const path = await contactsApi.exportFile(tr("Contacts Aqueli"), format, content);
      if (path) {
        notify(n > 1 ? tr("{n} contacts exportés.", { n }) : tr("Contact exporté."));
        onClose();
      }
    } catch (err) {
      notify(dataErrorMessage(err as DataError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={tr("Exporter les contacts")} onClose={onClose}>
      <div className="settings-form">
        <p className="settings-intro">
          {trn(n, "{n} contact : {scope}.", "{n} contacts : {scope}.", { scope })}
        </p>
        <div className="field">
          <span className="field-label">{tr("Format")}</span>
          <Segmented value={format} options={FORMATS} label={tr("Format")} onChange={setFormat} />
          <p className="settings-hint">{HINTS[format]}</p>
        </div>
        <p className="settings-hint">{tr("Le fichier exporté n'est pas chiffré.")}</p>
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose} disabled={busy}>
            {tr("Annuler")}
          </button>
          <button type="button" className="btn-gel" onClick={() => void run()} disabled={busy || n === 0} data-autofocus>
            {tr("Exporter")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
