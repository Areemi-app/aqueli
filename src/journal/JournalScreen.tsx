import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useToast } from "../app/ToastProvider";
import { markTitle } from "../calendar/specialDays";
import { useSpecialDays } from "../calendar/SpecialDaysProvider";
import { useItemMenu, useScreenMenu } from "../components/ContextMenu";
import { ScreenTitle } from "../components/ScreenTitle";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { useAnchoredPopover } from "../components/popover";
import { Select } from "../components/Select";
import { symbolPath } from "../components/symbols";
import { Tabs } from "../components/Tabs";
import { onBeforeLock } from "../lib/beforeLock";
import { KEYS } from "../lib/itemKeys";
import { readPref, writePref } from "../lib/storage";
import { printNote } from "../notes/notePrint";
import { runPrint, usePrint } from "../print/print";
import { imageToDataUrl, noteExtensions, type LinkHandlers } from "../notes/editor/extensions";
import { Toolbar } from "../notes/editor/Toolbar";
import { EMPTY_DOC, type DocNode } from "../notes/notes";
import { useNewItem } from "../shell/newItem";
import { addDays, dayKey, type DayKey } from "../tasks/day";
import {
  ACTIVITIES,
  activityEffects,
  activityOf,
  averageMood,
  deltaLabel,
  ENERGIES,
  longDay,
  monthGrid,
  moodCounts,
  moodOf,
  MOODS,
  moodTrend,
  onThisDay,
  promptFor,
  sortActivities,
  writingStreak,
  type JournalEntry,
  type JournalPage,
} from "./journal";
import { JOURNAL_REMINDER_TIMES, readJournalReminder, writeJournalReminder } from "./journalReminder";
import { onJournalRequest, takePendingJournal } from "./journalRequest";
import { useJournal } from "./JournalProvider";
import { EnergyPicker, MoodFace, MoodPicker } from "./MoodPicker";
import { locale, tr, trn } from "../i18n/i18n";
import { weekdayInitials } from "../i18n/calendarNames";

const SAVE_DELAY_MS = 700;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const PLACEHOLDER = tr("Écrire ici. « # » titre, « - » liste, « [ ] » case à cocher. Images collées ou glissées.");
const NO_LINKS: LinkHandlers = { items: () => [], show: () => undefined, create: async () => null };
const MONTH = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
const ACTIVITY_GROUPS = [...new Set(ACTIVITIES.map((a) => a.group))];
const REMINDER_OPTIONS = [
  { value: "", label: tr("Aucun rappel"), icon: ICONS.bell },
  ...JOURNAL_REMINDER_TIMES.map((t) => ({ value: t, label: tr("Rappel à {t}", { t }), icon: ICONS.bell })),
];
type SideTab = "calendrier" | "tendances";
const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: "calendrier", label: tr("Calendrier") },
  { id: "tendances", label: tr("Tendances") },
];
const PERIODS = [
  { value: "30", label: tr("30 jours") },
  { value: "90", label: tr("3 mois") },
  { value: "365", label: tr("1 an") },
];

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function parseDoc(content: string): DocNode {
  if (!content) return EMPTY_DOC;
  try {
    return JSON.parse(content) as DocNode;
  } catch {
    return EMPTY_DOC;
  }
}

/** Activités du jour : celles choisies (un clic les retire), puis la liste complète, par groupes. */
function ActivityPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const place = useAnchoredPopover(open, anchorRef, popRef, close, { height: 380, minWidth: 340 });
  useEffect(() => {
    if (open) popRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  const toggle = (id: string) => onChange(sortActivities(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]));
  return (
    <div className="journal-activities">
      {value.map((id) => {
        const a = activityOf(id);
        if (!a) return null;
        return (
          <button key={id} type="button" className="chip-btn journal-activity" title={tr("Retirer « {label} »", { label: a.label })} aria-label={tr("Retirer « {label} »", { label: a.label })} onClick={() => toggle(id)}>
            <Icon d={symbolPath(a.icon, ICONS.sparkle)} size={14} stroke={2.2} />
            {a.label}
          </button>
        );
      })}
      <button
        ref={anchorRef}
        type="button"
        className="chip-btn journal-activity-add"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon d={value.length === 0 ? ICONS.plus : ICONS.pencil} size={13} stroke={2.4} />
        {value.length === 0 ? tr("Ajouter") : tr("Modifier")}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="journal-activity-pop glass-popover"
            role="dialog"
            aria-label={tr("Activités du jour")}
            style={place}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                anchorRef.current?.focus();
              }
            }}
          >
            {ACTIVITY_GROUPS.map((g) => (
              <div key={g} className="journal-activity-group" role="group" aria-label={g}>
                <span className="journal-activity-group-title">{g}</span>
                <div className="journal-activity-grid">
                  {ACTIVITIES.filter((a) => a.group === g).map((a) => (
                    <button key={a.id} type="button" className="journal-activity-option" aria-pressed={value.includes(a.id)} onClick={() => toggle(a.id)}>
                      <span className="journal-activity-icon">
                        <Icon d={symbolPath(a.icon, ICONS.sparkle)} size={18} stroke={2} />
                      </span>
                      <span className="journal-activity-name">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Page d'un jour : chargée, puis modifiable ; rechargée vide après une suppression. */
function JournalPageView({ day, onDay }: { day: DayKey; onDay: (day: DayKey) => void }) {
  const { load } = useJournal();
  const [entry, setEntry] = useState<JournalEntry | null | undefined>(undefined);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setEntry(undefined);
    load(day)
      .then((e) => alive && setEntry(e))
      .catch(() => alive && setEntry(null));
    return () => {
      alive = false;
    };
  }, [day, load, version]);
  if (entry === undefined) return <section className="journal-page glass" aria-busy="true" />;
  return <PageEditor key={`${day}:${version}`} day={day} entry={entry} onDay={onDay} onRemoved={() => setVersion((v) => v + 1)} />;
}

interface PageEditorProps {
  day: DayKey;
  entry: JournalEntry | null;
  onDay: (day: DayKey) => void;
  onRemoved: () => void;
}

function PageEditor({ day, entry, onDay, onRemoved }: PageEditorProps) {
  const { save, remove } = useJournal();
  const notify = useToast();
  const today = dayKey(new Date());
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(entry?.energy ?? null);
  const [gratitudes, setGratitudes] = useState<string[]>(() => [...(entry?.gratitudes ?? []), "", "", ""].slice(0, 3));
  const [activities, setActivities] = useState<string[]>(entry?.activities ?? []);
  const [status, setStatus] = useState<"" | "attente" | "enregistre">("");
  const editorRef = useRef<Editor | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Valeurs à jour pour l'enregistrement différé.
  const fields = useRef<Pick<JournalPage, "mood" | "energy" | "gratitudes" | "activities">>({ mood, energy, gratitudes, activities });
  fields.current = { mood, energy, gratitudes, activities };
  const dirty = useRef(false);
  const timer = useRef(0);
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const e = editorRef.current;
    await save(day, {
      ...fields.current,
      content: e && !e.isEmpty ? JSON.stringify(e.getJSON()) : "",
      plain: e?.getText({ blockSeparator: "\n" }) ?? "",
    });
    setStatus("enregistre");
  }, [day, save]);
  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus("attente");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  }, [flush]);
  useEffect(() => onBeforeLock(flush), [flush]);
  useEffect(() => () => void flush(), [flush]);

  const insertImages = useCallback(
    (files: FileList | null | undefined, at?: number): boolean => {
      const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return false;
      for (const file of images) {
        if (file.size > MAX_IMAGE_BYTES) {
          notify(tr("Image trop volumineuse (20 Mo au plus)."));
          continue;
        }
        imageToDataUrl(file)
          .then((src) => {
            const node = { type: "image", attrs: { src, alt: file.name } };
            const e = editorRef.current;
            if (!e) return;
            if (at !== undefined) e.chain().insertContentAt(at, node).run();
            else e.chain().focus().insertContent(node).run();
          })
          .catch(() => notify(tr("Image illisible.")));
      }
      return true;
    },
    [notify],
  );

  const editor = useEditor(
    {
      extensions: noteExtensions({ placeholder: PLACEHOLDER, links: NO_LINKS }),
      content: parseDoc(entry?.content ?? ""),
      injectCSS: false,
      editorProps: {
        attributes: { class: "note-content journal-content", "aria-label": tr("Texte de la page"), spellcheck: "true" },
        handlePaste: (_view, event) => insertImages(event.clipboardData?.files),
        handleDrop: (view, event) => insertImages(event.dataTransfer?.files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos),
      },
      onUpdate: () => schedule(),
      onBlur: () => void flush(),
    },
    [day],
  );
  editorRef.current = editor;

  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    schedule();
  };
  // Ctrl+P : la page, avec son humeur, ses activités et ses gratitudes avant le texte.
  usePrint(() => () => {
    const { mood: m, energy: en, gratitudes: g, activities: acts } = fields.current;
    const line = (text: string): DocNode => ({ type: "paragraph", content: [{ type: "text", text }] });
    const intro: DocNode[] = [];
    const feeling = [m ? tr("Humeur : {mood}", { mood: moodOf(m)?.label }) : "", en ? tr("Énergie : {energy}", { energy: ENERGIES[en - 1]?.label }) : ""].filter(Boolean).join(" · ");
    if (feeling) intro.push(line(feeling));
    if (acts.length > 0) intro.push(line(tr("Activités : {x}", { x: acts.map((id) => activityOf(id)?.label ?? id).join(", ") })));
    const thanks = g.map((x) => x.trim()).filter(Boolean);
    if (thanks.length > 0) {
      intro.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: tr("Gratitudes") }] });
      intro.push({ type: "bulletList", content: thanks.map((t) => ({ type: "listItem", content: [line(t)] })) });
    }
    const body = (editorRef.current?.getJSON() as DocNode | undefined)?.content ?? [];
    printNote(capitalize(longDay(day)), { type: "doc", content: [...intro, ...body] });
  });

  const prompt = promptFor(day);
  const usePrompt = () => {
    editor?.chain().focus("end").insertContent([{ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: prompt }] }, { type: "paragraph" }]).run();
  };

  return (
    <section className="journal-page glass" aria-label={tr("Page du {longDay}", { longDay: longDay(day) })}>
      <div className="journal-page-head">
        <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Jour précédent")} title={tr("Jour précédent")} onClick={() => onDay(addDays(day, -1))}>
          <Icon d={ICONS.arrowLeft} size={16} stroke={2.2} />
        </button>
        <h2 className="journal-date">
          {capitalize(longDay(day))}
          {day === today && <span className="journal-today">{tr("Aujourd'hui")}</span>}
        </h2>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label={tr("Jour suivant")}
          title={tr("Jour suivant")}
          disabled={day >= today}
          onClick={() => onDay(addDays(day, 1))}
        >
          <Icon d={ICONS.arrowRight} size={16} stroke={2.2} />
        </button>
        <span className="journal-status" aria-live="polite">
          {status === "attente" ? tr("Enregistrement…") : status === "enregistre" ? tr("Enregistré") : ""}
        </span>
        {entry && (
          <button
            type="button"
            className="icon-btn icon-btn--sm"
            aria-label={tr("Supprimer la page")}
            title={tr("Supprimer la page")}
            onClick={() => {
              dirty.current = false;
              window.clearTimeout(timer.current);
              void remove(day).then(onRemoved);
            }}
          >
            <Icon d={ICONS.trash} size={15} stroke={2.2} />
          </button>
        )}
      </div>

      <div className="journal-scroll">
        <div className="journal-fields">
          <div className="journal-field">
            <span className="journal-label">{tr("Humeur")}</span>
            <MoodPicker value={mood} onChange={change(setMood)} />
          </div>
          <div className="journal-field">
            <span className="journal-label">{tr("Énergie")}</span>
            <EnergyPicker value={energy} onChange={change(setEnergy)} />
          </div>
        </div>

        <div className="journal-field">
          <span className="journal-label">{tr("Activités")}</span>
          <ActivityPicker value={activities} onChange={change(setActivities)} />
        </div>

        <div className="journal-field">
          <span className="journal-label">{tr("Trois gratitudes")}</span>
          <div className="journal-gratitudes">
            {gratitudes.map((g, i) => (
              <label key={i} className="journal-gratitude">
                <span className="journal-gratitude-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="field-box">
                <input
                  className="field-input"
                  value={g}
                  maxLength={300}
                  placeholder={i === 0 ? tr("Une chose agréable de la journée") : ""}
                  aria-label={tr("Gratitude {x}", { x: i + 1 })}
                  onChange={(e) => {
                    const next = [...gratitudes];
                    next[i] = e.target.value;
                    setGratitudes(next);
                    schedule();
                  }}
                  onBlur={() => void flush()}
                />
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="journal-prompt">
          <Icon d={ICONS.sparkle} size={15} filled stroke={0} />
          <span className="journal-prompt-text">{prompt}</span>
          <button type="button" className="link-btn" onClick={usePrompt}>
            {tr("Répondre")}
          </button>
        </div>

        {editor && <Toolbar editor={editor} onImage={() => fileRef.current?.click()} />}
        <EditorContent editor={editor} className="journal-editor" />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            insertImages(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}

/** Calendrier des humeurs du mois ; un clic ouvre la page du jour. */
function MoodCalendar({ day, onDay }: { day: DayKey; onDay: (day: DayKey) => void }) {
  const { pages } = useJournal();
  const itemMenu = useItemMenu();
  const today = dayKey(new Date());
  const [month, setMonth] = useState(() => day.slice(0, 7));
  useEffect(() => setMonth(day.slice(0, 7)), [day]);
  const [year, m] = month.split("-").map(Number) as [number, number];
  const weeks = monthGrid(year, m);
  const first = `${month}-01`;
  // Jours fériés et fêtes (les périodes de vacances laissent la place aux humeurs).
  const special = useSpecialDays().marks(first, addDays(first, 40));
  const shift = (n: number) => {
    const d = new Date(year, m - 1 + n, 1);
    setMonth(dayKey(d).slice(0, 7));
  };
  return (
    <div className="journal-calendar glass">
      <div className="journal-calendar-head">
        <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Mois précédent")} onClick={() => shift(-1)}>
          <Icon d={ICONS.arrowLeft} size={14} stroke={2.2} />
        </button>
        <span className="journal-calendar-title">{MONTH.format(new Date(year, m - 1, 1))}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Mois suivant")} disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}>
          <Icon d={ICONS.arrowRight} size={14} stroke={2.2} />
        </button>
      </div>
      <div className="journal-grid" role="grid" aria-label={tr("Humeurs du mois")}>
        {weekdayInitials().map((w, i) => (
          <span key={i} className="journal-weekday" aria-hidden="true">
            {w}
          </span>
        ))}
        {weeks.flat().map((d, i) => {
          if (!d) return <span key={`v${i}`} />;
          const p = pages.get(d);
          const mood = moodOf(p?.mood ?? null);
          const mark = special.get(d);
          const holiday = mark && mark.level !== "periode" ? mark : undefined;
          const label = [longDay(d), mood ? tr("humeur : {mood}", { mood: mood.label }) : p ? tr("page écrite") : "", markTitle(holiday)].filter(Boolean).join(" · ");
          return (
            <button
              key={d}
              type="button"
              className="journal-cell"
              data-today={d === today || undefined}
              data-selected={d === day || undefined}
              data-written={p ? "" : undefined}
              data-future={d > today || undefined}
              disabled={d > today}
              aria-label={label}
              title={label}
              style={mood ? ({ "--mood": mood.color } as CSSProperties) : holiday ? ({ "--holiday": holiday.color } as CSSProperties) : undefined}
              data-mood={mood ? "" : undefined}
              data-holiday={holiday ? "" : undefined}
              onClick={() => onDay(d)}
              {...itemMenu(() => [{ label: p ? tr("Ouvrir la page") : tr("Écrire ce jour-là"), icon: p ? ICONS.enter : ICONS.pencil, shortcut: KEYS.open, run: () => onDay(d) }])}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Humeur dans le temps : un point par jour (par 3 jours sur 3 mois, par semaine sur un an). */
function MoodChart({ days }: { days: number }) {
  const { pages } = useJournal();
  const today = dayKey(new Date());
  const trend = moodTrend(pages, today, days);
  const size = days <= 31 ? 1 : days <= 92 ? 3 : 7;
  const buckets: { day: DayKey; mood: number | null }[] = [];
  for (let i = trend.length % size; i < trend.length; i += size) {
    const slice = trend.slice(Math.max(0, i), i + size);
    const rated = slice.filter((d) => d.mood !== null);
    buckets.push({ day: slice[0]!.day, mood: rated.length ? rated.reduce((a, d) => a + d.mood!, 0) / rated.length : null });
  }
  const W = 300;
  const H = 96;
  const x = (i: number) => (buckets.length <= 1 ? W / 2 : (i / (buckets.length - 1)) * (W - 16) + 8);
  const y = (mood: number) => 8 + ((5 - mood) / 4) * (H - 16);
  const points = buckets.map((b, i) => (b.mood === null ? null : { x: x(i), y: y(b.mood), mood: b.mood, day: b.day }));
  const path = points
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const rated = points.filter(Boolean).length;
  if (rated === 0) return <p className="journal-trend-empty">{tr("Aucune humeur notée sur la période.")}</p>;
  return (
    <svg className="journal-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={size === 1 ? tr("Humeur des {days} derniers jours, {rated} jours notés", { days, rated }) : tr("Humeur des {days} derniers jours, {rated} points", { days, rated })}>
      {[1, 2, 3, 4, 5].map((m) => (
        <line key={m} x1="0" x2={W} y1={y(m)} y2={y(m)} className="journal-chart-grid" />
      ))}
      <path d={path} className="journal-chart-line" />
      {points.map((p) =>
        p ? (
          <circle key={p.day} cx={p.x} cy={p.y} r={size === 1 ? 3.4 : 3} className="journal-chart-dot" style={{ "--mood": moodOf(Math.round(p.mood))?.color } as CSSProperties}>
            <title>{tr("{label} : {value}", { label: longDay(p.day), value: moodOf(Math.round(p.mood))?.label ?? "" })}</title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}

/** Tendances : humeur dans le temps, répartition des humeurs, humeur selon les activités. */
function JournalTrends({ onActivity }: { onActivity: (id: string) => void }) {
  const { pages } = useJournal();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState(() => readPref("journalPeriode", "30", (v): v is string => PERIODS.some((p) => p.value === v)));
  const days = Number(period);
  const from = addDays(today, 1 - days);
  const inPeriod = [...pages.values()].filter((p) => p.day >= from && p.day <= today);
  const counts = moodCounts(inPeriod);
  const max = Math.max(1, ...counts);
  const effects = activityEffects(inPeriod).slice(0, 8);
  const average = averageMood(inPeriod);
  return (
    <div className="journal-trends glass">
      <div className="journal-trends-head">
        <span className="journal-label">{tr("Humeur")}</span>
        <Select
          value={period}
          options={PERIODS}
          label={tr("Période")}
          className="journal-period"
          onChange={(v) => {
            setPeriod(v);
            writePref("journalPeriode", v);
          }}
        />
      </div>
      <MoodChart days={days} />
      <div className="journal-mood-counts" aria-label={tr("Répartition des humeurs")}>
        {[...MOODS].reverse().map((m) => {
          const n = counts[m.value - 1]!;
          return (
            <div key={m.value} className="journal-mood-count" title={trn(n, "{mood} : {n} jour", "{mood} : {n} jours", { mood: m.label })}>
              <MoodFace value={m.value} size={20} />
              <span className="journal-mood-bar">
                <span className="journal-mood-fill" style={{ width: `${(n / max) * 100}%`, "--mood": m.color } as CSSProperties} />
              </span>
              <span className="journal-mood-n">{n}</span>
            </div>
          );
        })}
      </div>
      {average !== null && <p className="journal-trend-note">{tr("Humeur moyenne : {mood}.", { mood: moodOf(average)?.label.toLowerCase() })}</p>}
      <span className="journal-label">{tr("Humeur selon les activités")}</span>
      {effects.length === 0 ? (
        <p className="journal-trend-empty">{tr("Pas encore assez de jours notés avec des activités (3 par activité).")}</p>
      ) : (
        <ul className="journal-effects">
          {effects.map((e) => (
            <li key={e.activity.id}>
              <button
                type="button"
                className="journal-effect"
                onClick={() => onActivity(e.activity.id)}
                title={tr("Afficher les {days} pages avec « {label} »", { days: e.days, label: e.activity.label })}
              >
                <Icon d={symbolPath(e.activity.icon, ICONS.sparkle)} size={15} stroke={2.2} />
                <span className="journal-effect-name">{e.activity.label}</span>
                <span className="journal-effect-days">{tr("{n} j", { n: e.days })}</span>
                <span className="journal-effect-delta" data-sign={e.delta >= 0.05 ? "plus" : e.delta <= -0.05 ? "moins" : undefined}>
                  {deltaLabel(e.delta)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Série de jours écrits, pages et humeur du mois, souvenirs des années passées ; tendances. */
function JournalSide({ day, onDay, onActivity }: { day: DayKey; onDay: (day: DayKey) => void; onActivity: (id: string) => void }) {
  const { pages } = useJournal();
  const today = dayKey(new Date());
  const tabsId = useId();
  const [tab, setTab] = useState<SideTab>(() => readPref<SideTab>("journalVolet", "calendrier", (v): v is SideTab => v === "calendrier" || v === "tendances"));
  const month = day.slice(0, 7);
  const ofMonth = [...pages.values()].filter((p) => p.day.startsWith(month));
  const streak = writingStreak(new Set(pages.keys()), today);
  const average = averageMood(ofMonth);
  const memories = onThisDay(pages, day);
  return (
    <aside className="journal-side">
      <Tabs
        items={SIDE_TABS}
        value={tab}
        onChange={(t) => {
          setTab(t);
          writePref("journalVolet", t);
        }}
        label={tr("Volet du journal")}
        idPrefix={tabsId}
      />
      {tab === "tendances" ? (
        <div role="tabpanel" id={`${tabsId}-panel-tendances`} aria-labelledby={`${tabsId}-tab-tendances`} className="journal-side-panel">
          <JournalTrends onActivity={onActivity} />
        </div>
      ) : (
        <div role="tabpanel" id={`${tabsId}-panel-calendrier`} aria-labelledby={`${tabsId}-tab-calendrier`} className="journal-side-panel">
          <MoodCalendar day={day} onDay={onDay} />
          <div className="journal-stats glass">
            <div className="journal-stat">
              <span className="journal-stat-value">{streak}</span>
              <span className="journal-stat-label">{trn(streak, "jour d'affilée", "jours d'affilée")}</span>
            </div>
            <div className="journal-stat">
              <span className="journal-stat-value">{ofMonth.length}</span>
              <span className="journal-stat-label">{trn(ofMonth.length, "page ce mois", "pages ce mois")}</span>
            </div>
            <div className="journal-stat">
              {average ? <MoodFace value={average} size={30} /> : <span className="journal-stat-value">–</span>}
              <span className="journal-stat-label">{tr("humeur du mois")}</span>
            </div>
          </div>
          {memories.length > 0 && (
            <div className="journal-memory glass">
              <span className="journal-memory-title">
                <Icon d={ICONS.history} size={14} stroke={2.2} />
                {tr("Ce jour-là")}
              </span>
              {memories.slice(0, 4).map(({ years, page }) => (
                <button key={page.day} type="button" className="journal-memory-item" onClick={() => onDay(page.day)}>
                  <span className="journal-memory-when">
                    {years === 1 ? tr("Il y a un an") : tr("Il y a {years} ans", { years })}
                    {page.mood !== null && <MoodFace value={page.mood} size={16} />}
                  </span>
                  <span className="journal-memory-text">
                    {page.excerpt || page.gratitudes.join(" · ") || page.activities.map((id) => activityOf(id)?.label).filter(Boolean).join(", ") || moodOf(page.mood)?.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

/** Résultats de la recherche dans le journal, ou pages d'une activité. */
function SearchResults({ days, onDay, title, onClose }: { days: DayKey[]; onDay: (day: DayKey) => void; title?: string; onClose?: () => void }) {
  const { pages } = useJournal();
  const itemMenu = useItemMenu();
  const count = days.length === 0 ? tr("Aucune page trouvée.") : trn(days.length, "{n} page", "{n} pages");
  return (
    <aside className="journal-side">
      <div className="journal-results glass">
        <div className="journal-results-head">
          <span className="journal-label">{title ? `${title} · ${count}` : count}</span>
          {onClose && (
            <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Fermer")} title={tr("Fermer")} onClick={onClose}>
              <Icon d={ICONS.close} size={13} stroke={2.4} />
            </button>
          )}
        </div>
        <ul className="journal-result-list">
          {days.map((d) => {
            const p = pages.get(d);
            const mood = moodOf(p?.mood ?? null);
            return (
              <li key={d}>
                <button type="button" className="journal-result" onClick={() => onDay(d)} {...itemMenu(() => [{ label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => onDay(d) }])}>
                  {mood && <MoodFace value={mood.value} size={22} />}
                  <span className="journal-result-text">
                    <span className="journal-result-day">{longDay(d)}</span>
                    <span className="journal-result-excerpt">{p?.excerpt}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

export function JournalScreen() {
  const { search } = useJournal();
  const [day, setDay] = useState<DayKey>(() => takePendingJournal() ?? dayKey(new Date()));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DayKey[] | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [reminder, setReminder] = useState(readJournalReminder);
  const { pages } = useJournal();
  const searchRef = useRef<HTMLInputElement>(null);
  const today = dayKey(new Date());
  const activityDays = useMemo(
    () => (activity ? [...pages.values()].filter((p) => p.activities.includes(activity)).map((p) => p.day).reverse() : null),
    [activity, pages],
  );

  useEffect(() => onJournalRequest(setDay), []);
  // Ctrl+N : la page du jour, prête à écrire (curseur dans son premier champ).
  const writeToday = () => {
    setDay(dayKey(new Date()));
    window.setTimeout(() => document.querySelector<HTMLElement>(".journal-page :is(input, textarea, [contenteditable='true'])")?.focus(), 80);
  };
  useNewItem(writeToday);
  useScreenMenu(() => [
    { label: tr("Écrire dans le journal"), icon: ICONS.pencil, shortcut: KEYS.create, run: writeToday },
    { label: tr("Aller à aujourd'hui"), icon: ICONS.today, disabled: day === today, run: () => setDay(today) },
    { label: tr("Rechercher dans le journal"), icon: ICONS.search, shortcut: KEYS.find, run: () => searchRef.current?.focus() },
    "separator",
    { label: tr("Imprimer…"), icon: ICONS.printer, shortcut: KEYS.print, run: () => void runPrint() },
  ]);

  // Ctrl+F : recherche dans le journal.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      search(q)
        .then((days) => alive && setResults(days))
        .catch(() => alive && setResults([]));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, search]);

  const open = useMemo(() => (d: DayKey) => setDay(d > today ? today : d), [today]);

  return (
    <div className="screen journal-screen">
      <header className="tasks-header">
        <ScreenTitle module="journal" />
        <button type="button" className="btn-glass btn-glass--sm" disabled={day === today} onClick={() => setDay(today)}>
          {tr("Aujourd'hui")}
        </button>
        <span className="tasks-header-spacer" />
        <Select
          value={reminder ?? ""}
          options={REMINDER_OPTIONS}
          label={tr("Rappel d'écriture")}
          className="journal-reminder"
          onChange={(v) => {
            const time = v || null;
            setReminder(time);
            writeJournalReminder(time);
          }}
        />
        <label className="journal-search">
          <Icon d={ICONS.search} size={15} stroke={2.2} />
          <input
            ref={searchRef}
            type="search"
            className="journal-search-input"
            placeholder={tr("Rechercher dans le journal")}
            aria-label={tr("Rechercher dans le journal")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActivity(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
        </label>
      </header>
      <div className="journal-body">
        <JournalPageView day={day} onDay={open} />
        {results ? (
          <SearchResults days={results} onDay={open} />
        ) : activityDays && activity ? (
          <SearchResults days={activityDays} onDay={open} title={activityOf(activity)?.label} onClose={() => setActivity(null)} />
        ) : (
          <JournalSide day={day} onDay={open} onActivity={setActivity} />
        )}
      </div>
    </div>
  );
}

