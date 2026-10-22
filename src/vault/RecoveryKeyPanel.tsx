import { useId, useState } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/aqueli-logo-256.png";
import { Checkbox } from "../components/Checkbox";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { formatRecoveryInput, recoveryGroups } from "./recoveryKey";
import { locale, tr } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

interface RecoveryKeyPanelProps {
  recoveryKey: string;
  /** Appelé une fois la clé vérifiée. */
  onVerified: () => void;
  verifyLabel?: string;
}

/** Feuille imprimable : seule chose visible à l'impression (voir @media print). */
function PrintSheet({ recoveryKey }: { recoveryKey: string }) {
  const today = new Intl.DateTimeFormat(locale()).format(new Date());
  return createPortal(
    <section className="print-sheet" aria-hidden="true">
      <img src={logo} alt="" className="print-logo" />
      <h1>{tr("Clé de récupération Aqueli")}</h1>
      <p className="print-key">{recoveryKey}</p>
      <p>{tr("Créée le {date}.", { date: today })}</p>
      <p>
        {tr("Cette clé permet d'accéder à vos données Aqueli en cas d'oubli du mot de passe. Conservez ce document en lieu sûr.")}
      </p>
    </section>,
    document.body,
  );
}

/**
 * Montre la clé de récupération une seule fois, propose de l'imprimer, puis vérifie
 * qu'elle a bien été notée en demandant un de ses groupes.
 */
export function RecoveryKeyPanel({ recoveryKey, onVerified, verifyLabel = tr("Vérifier") }: RecoveryKeyPanelProps) {
  const groups = recoveryGroups(recoveryKey);
  const [stage, setStage] = useState<"montrer" | "verifier">("montrer");
  const [noted, setNoted] = useState(false);
  // Groupe demandé à la vérification : un des groupes 2 à 6, tiré au hasard.
  const [askedIndex] = useState(() => 1 + Math.floor(Math.random() * (groups.length - 1)));
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const inputId = useId();
  const errorId = useId();

  if (stage === "montrer") {
    return (
      <div className="recovery">
        <p className="onb-text">
          <Sentences text={tr("Cette clé permet d'accéder à vos données en cas d'oubli du mot de passe. Conservez-la en lieu sûr. Elle ne sera plus affichée.")} />
        </p>
        <div className="recovery-key" aria-label={tr("Clé de récupération : {groups}", { groups: groups.join(" ") })} role="group">
          {groups.map((g, i) => (
            <span key={i} className="recovery-group">
              {g}
            </span>
          ))}
        </div>
        <button type="button" className="btn-glass" onClick={() => window.print()}>
          <Icon d={ICONS.printer} size={16} />
          {tr("Imprimer la clé")}
        </button>
        <Checkbox checked={noted} onChange={setNoted} label={tr("J'ai conservé ma clé de récupération")} />
        <div className="onb-actions">
          <button type="button" className="btn-gel" disabled={!noted} onClick={() => setStage("verifier")}>
            {tr("Continuer")}
          </button>
        </div>
        <PrintSheet recoveryKey={recoveryKey} />
      </div>
    );
  }

  const check = () => {
    if (typed.toUpperCase() === groups[askedIndex]) {
      onVerified();
    } else {
      setError(tr("Groupe incorrect."));
    }
  };

  return (
    <form
      className="recovery"
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
    >
      <p className="onb-text">
        {tr("Saisissez le groupe n° {n} de votre clé.", { n: askedIndex + 1 })}
      </p>
      <div className="field field--center">
        <label htmlFor={inputId} className="field-label">
          {tr("Groupe n° {n}", { n: askedIndex + 1 })}
        </label>
        <div className="field-box field-box--short" data-invalid={error ? true : undefined}>
          <input
            id={inputId}
            className="field-input field-input--code"
            value={typed}
            maxLength={4}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              // Mêmes tolérances que pour la clé entière (O lu comme 0, I et L comme 1).
              setTyped(formatRecoveryInput(e.target.value).replace(/-/g, "").slice(0, 4));
              setError("");
            }}
          />
        </div>
      </div>
      {error && (
        <p id={errorId} className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="onb-actions">
        <button type="button" className="btn-glass" onClick={() => setStage("montrer")}>
          {tr("Afficher la clé")}
        </button>
        <button type="submit" className="btn-gel" disabled={typed.length !== 4}>
          {verifyLabel}
        </button>
      </div>
    </form>
  );
}
