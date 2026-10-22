/**
 * Aide intégrée (F1) : rubriques à gauche, groupées, avec une recherche ; à droite, le tutoriel de
 * la rubrique (introduction, « Les bases », « Pour aller plus loin ») et ses visites guidées.
 * « Raccourcis clavier » (Ctrl+/) liste tous les raccourcis en vigueur.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ShortcutMap } from "../app/shortcuts";
import { captureApi, hotkeyKeys } from "../capture/captureApi";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { ModuleChip } from "../components/ModuleChip";
import { fillShortcuts, HELP_GROUPS, HELP_TOPICS, searchHelp, SHORTCUTS_TOPIC, type HelpStep, type HelpTopic } from "./helpTopics";
import { ShortcutList } from "./ShortcutList";
import { getModule } from "../modules/modules";
import { requestTour } from "../tour/tourRequest";
import { tr } from "../i18n/i18n";

interface HelpDialogProps {
  topic: string;
  keys: ShortcutMap;
  onTopic: (id: string) => void;
  onClose: () => void;
  /** Ouvre Paramètres › Clavier. */
  onEditShortcuts: () => void;
}

/** Étapes numérotées d'une phase du tutoriel, reliées par un trait. */
function Steps({ steps, fill }: { steps: readonly HelpStep[]; fill: (text: string) => string }) {
  return (
    <ol className="help-steps">
      {steps.map((s, i) => (
        <li key={s.title} className="help-step">
          <span className="help-step-number" aria-hidden="true">
            {i + 1}
          </span>
          <div className="help-step-body">
            <h4 className="help-step-title">{fill(s.title)}</h4>
            {s.text.map((t) => (
              <p key={t}>{fill(t)}</p>
            ))}
            {s.example && (
              <p className="help-example">
                <span className="help-example-label">{tr("Exemple")}</span>
                <span className="help-example-text">{s.example}</span>
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Espaces insécables de la typographie française : « », : ; ! ? ne restent jamais seuls en bout de ligne. */
const nbsp = (text: string) => text.replace(/« /g, "«\u00a0").replace(/ ([»:;!?])/g, "\u00a0$1");

function TopicText({ topic, keys, capture }: { topic: HelpTopic; keys: ShortcutMap; capture: string }) {
  const fill = (text: string) => nbsp(fillShortcuts(text, keys, capture));
  return (
    <>
      <p className="help-intro">{fill(topic.intro)}</p>
      <section className="help-phase" data-phase="bases" aria-label={tr("Les bases")}>
        <h3 className="help-phase-title">
          <Icon d={ICONS.play} size={12} stroke={2.6} />
          {tr("Les bases")}
        </h3>
        <Steps steps={topic.basics} fill={fill} />
      </section>
      {topic.advanced.length > 0 && (
        <section className="help-phase" data-phase="avance" aria-label={tr("Pour aller plus loin")}>
          <h3 className="help-phase-title">
            <Icon d={ICONS.sparkle} size={13} stroke={2.2} />
            {tr("Pour aller plus loin")}
          </h3>
          <Steps steps={topic.advanced} fill={fill} />
        </section>
      )}
    </>
  );
}

export function HelpDialog({ topic, keys, onTopic, onClose, onEditShortcuts }: HelpDialogProps) {
  const [query, setQuery] = useState("");
  const [capture, setCapture] = useState<string[] | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    void captureApi
      .hotkey()
      .then((h) => setCapture(h ? hotkeyKeys(h) : null))
      .catch(() => setCapture(null));
  }, []);

  // Une autre rubrique : le texte repart du début.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [topic]);

  const shown = useMemo(() => searchHelp(query), [query]);
  const current = HELP_TOPICS.find((t) => t.id === topic) ?? HELP_TOPICS[0]!;
  const captureText = capture ? capture.join("+") : tr("Paramètres › Clavier");

  // ↑ ↓ passent d'une rubrique à l'autre dans la liste.
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const index = shown.findIndex((t) => t.id === current.id);
    const next = shown[Math.max(0, Math.min(shown.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    onTopic(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-topic="${next.id}"]`)?.focus();
  };

  return (
    <Dialog title={tr("Aide")} className="dialog--help" onClose={onClose}>
      <div className="help">
        <nav className="help-nav" aria-label={tr("Rubriques de l'aide")}>
          <div className="field-box help-search">
            <Icon d={ICONS.search} size={15} />
            <input
              type="search"
              className="field-input"
              value={query}
              placeholder={tr("Rechercher dans l'aide")}
              aria-label={tr("Rechercher dans l'aide")}
              onChange={(e) => {
                setQuery(e.target.value);
                const first = searchHelp(e.target.value)[0];
                if (first && !searchHelp(e.target.value).some((t) => t.id === current.id)) onTopic(first.id);
              }}
            />
          </div>
          <ul ref={listRef} className="help-topics" onKeyDown={onListKey}>
            {HELP_GROUPS.map((g) => {
              const topics = shown.filter((t) => t.group === g.key);
              if (topics.length === 0) return null;
              return [
                <li key={g.key} className="help-group" role="presentation">
                  {g.label}
                </li>,
                ...topics.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="help-topic"
                      data-topic={t.id}
                      aria-current={t.id === current.id ? "true" : undefined}
                      tabIndex={t.id === current.id ? 0 : -1}
                      onClick={() => onTopic(t.id)}
                    >
                      <ModuleChip color={t.color} icon={t.icon} size={24} />
                      <span>{t.title}</span>
                    </button>
                  </li>
                )),
              ];
            })}
            {shown.length === 0 && <li className="help-empty">{tr("Aucune rubrique trouvée.")}</li>}
          </ul>
        </nav>
        <article ref={contentRef} className="help-content" aria-label={current.title} tabIndex={-1}>
          <header className="help-title">
            <ModuleChip color={current.color} icon={current.icon} size={34} />
            <h2>{current.title}</h2>
          </header>
          {current.id === SHORTCUTS_TOPIC ? (
            <>
              <ShortcutList keys={keys} capture={capture} />
              <div className="help-footer">
                <button type="button" className="btn-glass" onClick={onEditShortcuts}>
                  <Icon d={ICONS.settings} size={15} stroke={2.2} />
                  {tr("Modifier les raccourcis")}
                </button>
              </div>
            </>
          ) : (
            <>
              <TopicText topic={current} keys={keys} capture={captureText} />
              {current.tours && (
                <div className="help-footer help-tours">
                  <span className="help-tours-label">{tr("Visite guidée :")}</span>
                  {current.tours.map((id) => (
                    <button key={id} type="button" className="btn-glass btn-glass--sm" onClick={() => requestTour(id)}>
                      <Icon d={ICONS.play} size={12} stroke={2.4} />
                      {id === "general" ? tr("Visite générale") : getModule(id).label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </article>
      </div>
    </Dialog>
  );
}
