import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import logo from "../assets/aqueli-logo-256.png";
import { onAppEvent } from "../app/background";
import { ContextMenuProvider } from "../components/ContextMenu";
import { Tabs } from "../components/Tabs";
import { PreferencesProvider } from "../prefs/PreferencesProvider";
import { readDefaultReminder } from "../tasks/reminderPrefs";
import { formatShortDay, dayKey } from "../tasks/day";
import { parseQuickAdd } from "../tasks/quickAdd";
import { ThemeProvider } from "../theme/ThemeProvider";
import { buildCapture, CAPTURE_KINDS, type CaptureKind } from "./buildCapture";
import { captureApi, type CaptureStatus } from "./captureApi";
import { tr } from "../i18n/i18n";

/** Événement envoyé par le cœur quand la fenêtre s'ouvre. */
const SHOWN = "capture-affichee";

const PLACEHOLDERS: Record<CaptureKind, string> = {
  task: tr("Appeler le garage vendredi 14h #voiture !haute"),
  note: tr("Titre de la note (Maj+Entrée : nouvelle ligne)"),
  event: tr("Dentiste jeudi 9h30"),
};

const DONE: Record<CaptureKind, string> = {
  task: tr("Tâche ajoutée."),
  note: tr("Note ajoutée."),
  event: tr("Événement ajouté."),
};

/** Petite fenêtre flottante : on tape, Entrée, et l'élément part. Tab change de type. */
function Capture() {
  const [kind, setKind] = useState<CaptureKind>("task");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<CaptureStatus>({ locked: false, pending: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const timer = useRef(0);

  const refresh = useCallback(() => {
    void captureApi.status().then(setStatus).catch(() => undefined);
  }, []);
  const focus = useCallback(() => {
    window.setTimeout(() => {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }, 30);
  }, []);

  useEffect(() => {
    refresh();
    focus();
    return onAppEvent(SHOWN, () => {
      window.clearTimeout(timer.current);
      setMessage(null);
      refresh();
      focus();
    });
  }, [refresh, focus]);

  const close = () => {
    window.clearTimeout(timer.current);
    setMessage(null);
    void captureApi.hide();
  };

  const parsed = useMemo(() => (kind === "note" ? null : parseQuickAdd(text, new Date(), [])), [kind, text]);
  const today = dayKey(new Date());
  const where = (() => {
    if (kind === "note") return tr("Notes, sans carnet");
    if (!parsed?.title) return kind === "task" ? tr("Boîte de réception") : tr("Calendrier");
    const when = parsed.dueDate ? formatShortDay(parsed.dueDate, today) : kind === "event" ? tr("Prochaine heure") : null;
    const parts = [when, parsed.dueTime, ...(kind === "task" ? parsed.tags.map((t) => `#${t}`) : [])].filter(Boolean);
    return parts.length ? parts.join(" · ") : kind === "task" ? tr("Boîte de réception") : tr("Calendrier");
  })();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const capture = buildCapture(kind, text, new Date(), readDefaultReminder());
    if (!capture || busy) return;
    setBusy(true);
    try {
      const outcome = await captureApi.submit(capture);
      setText("");
      setMessage(outcome === "pending" ? tr("Aqueli est verrouillé : l'élément sera ajouté au déverrouillage.") : DONE[kind]);
      timer.current = window.setTimeout(close, outcome === "pending" ? 1800 : 700);
    } catch {
      setMessage(tr("Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = CAPTURE_KINDS.findIndex((k) => k.id === kind);
      const next = CAPTURE_KINDS[(i + (e.shiftKey ? -1 : 1) + CAPTURE_KINDS.length) % CAPTURE_KINDS.length];
      if (next) setKind(next.id);
      focus();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="capture-shell" onKeyDown={onKeyDown}>
      <form className="capture-card" onSubmit={(e) => void submit(e)} aria-label={tr("Capture rapide")}>
        <div className="capture-head">
          <img className="capture-logo" src={logo} alt="" draggable={false} />
          <Tabs
            items={CAPTURE_KINDS}
            value={kind}
            onChange={(k) => {
              setKind(k);
              focus();
            }}
            label={tr("Type")}
            idPrefix="capture"
          />
          <span className="capture-where" aria-live="polite">
            {where}
          </span>
        </div>
        {kind === "note" ? (
          <textarea
            ref={fieldRef}
            className="capture-field capture-field--note"
            value={text}
            rows={2}
            maxLength={2000}
            placeholder={PLACEHOLDERS.note}
            aria-label={tr("Texte de la note")}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <input
            ref={fieldRef}
            className="capture-field"
            value={text}
            maxLength={500}
            placeholder={PLACEHOLDERS[kind]}
            aria-label={kind === "task" ? tr("Tâche") : tr("Événement")}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <div className="capture-foot">
          <span className="capture-message" role="status">
            {message ?? (status.locked ? tr("Aqueli est verrouillé : ce qui est ajouté sera enregistré au déverrouillage.") : "")}
          </span>
          <span className="capture-keys" aria-hidden="true">
            <kbd className="kbd">{tr("Tab")}</kbd>{tr(" type · ")}<kbd className="kbd">{tr("Entrée")}</kbd>{tr(" ajouter · ")}<kbd className="kbd">{tr("Échap")}</kbd>{tr(" fermer")}
          </span>
        </div>
      </form>
    </div>
  );
}

/** Fenêtre de capture : thème et taille du texte de l'application, rien d'autre. */
export function CaptureApp() {
  return (
    <PreferencesProvider>
      <ThemeProvider>
        <ContextMenuProvider>
          <Capture />
        </ContextMenuProvider>
      </ThemeProvider>
    </PreferencesProvider>
  );
}
