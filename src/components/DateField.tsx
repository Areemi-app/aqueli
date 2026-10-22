/**
 * Champ de date d'Aqueli, à la place de celui de Windows. On y saisit librement une date
 * (« demain », « lundi », « 15/11 », « 1er novembre 2026 »), ou on la choisit dans un petit
 * calendrier en verre : raccourcis (Aujourd'hui, Demain…), jours fériés et vacances marqués.
 *
 * Clavier : ↓ (ou Alt+↓) ouvre le calendrier ; flèches pour changer de jour, Page↑ Page↓ pour
 * changer de mois (avec Maj : d'année), Début et Fin pour le début et la fin de la semaine,
 * Entrée pour choisir, Échap pour fermer. Entrée dans le champ valide la date saisie.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { dayMarkAttributes } from "../calendar/dayMarkStyle";
import { useSpecialDaysIfAny } from "../calendar/SpecialDaysProvider";
import { monthGrid, startOfWeek } from "../calendar/view";
import { addDays, addMonths, dayKey, fromDayKey, isDayKey, weekday, type DayKey } from "../tasks/day";
import { parseDateWords } from "../tasks/quickAdd";
import { Icon } from "./Icon";
import { ICONS } from "./icons";
import { useAnchoredPopover } from "./popover";
import { locale, tr } from "../i18n/i18n";
import { weekdayInitials } from "../i18n/calendarNames";

const SHORT = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short" });
const WITH_YEAR = new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" });
const FULL = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const MONTH = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });

/** « ven. 9 oct. » cette année, « 9 oct. 2027 » sinon. */
export function formatDateField(day: DayKey, today: DayKey): string {
  return day.slice(0, 4) === today.slice(0, 4) ? SHORT.format(fromDayKey(day)) : WITH_YEAR.format(fromDayKey(day));
}

/** Date saisie : « 2026-10-09 », ou en mots (« demain », « 15/11 »…) ; `null` si illisible. */
export function readDate(text: string, today: DayKey): DayKey | null {
  const t = text.trim();
  if (isDayKey(t)) return t;
  return parseDateWords(t, today);
}

/** Raccourcis du calendrier : aujourd'hui, demain, lundi prochain, dans une semaine. */
export function quickDays(today: DayKey): { label: string; day: DayKey }[] {
  const monday = addDays(today, ((8 - weekday(today)) % 7) || 7);
  return [
    { label: tr("Aujourd'hui"), day: today },
    { label: tr("Demain"), day: addDays(today, 1) },
    { label: tr("Lundi prochain"), day: monday },
    { label: tr("Dans une semaine"), day: addDays(today, 7) },
  ];
}

interface DateFieldProps {
  id?: string;
  value: DayKey | "" | null;
  /** Nouvelle date, ou "" quand elle est retirée (champ facultatif). */
  onChange: (value: DayKey | "") => void;
  /** Nom lu par le Narrateur quand aucune étiquette ne désigne le champ. */
  label?: string;
  /** Classe du champ (« detail-input », « field-input »…), pour sa taille et son style. */
  className?: string;
  /** La date peut être retirée (« Aucune date »). */
  clearable?: boolean;
  min?: DayKey;
  max?: DayKey;
  disabled?: boolean;
  placeholder?: string;
}

export function DateField({ id, value, onChange, label, className, clearable, min, max, disabled, placeholder = tr("Aucune date") }: DateFieldProps) {
  const today = dayKey(new Date());
  const current = value || null;
  const shown = current ? formatDateField(current, today) : "";
  const [text, setText] = useState(shown);
  const [edited, setEdited] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<DayKey>(current ?? today);
  const [cursor, setCursor] = useState<DayKey>(current ?? today);
  const [inGrid, setInGrid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const special = useSpecialDaysIfAny();

  // La valeur change ailleurs (autre champ, annulation) : le texte suit, sauf pendant la saisie.
  useEffect(() => {
    if (!edited) setText(shown);
  }, [shown, edited]);

  const close = useCallback(() => {
    setOpen(false);
    setInGrid(false);
  }, []);
  const place = useAnchoredPopover(open, inputRef, popRef, close, { height: 380, minWidth: 286 });

  const allowed = (day: DayKey) => (!min || day >= min) && (!max || day <= max);
  const pick = (day: DayKey | "") => {
    setEdited(false);
    close();
    if (day === "" ? current !== null : day !== current) onChange(day);
    setText(day ? formatDateField(day, today) : "");
    inputRef.current?.focus();
  };
  const openAt = (focusGrid: boolean) => {
    if (disabled) return;
    const start = current ?? today;
    setMonth(start);
    setCursor(start);
    setOpen(true);
    setInGrid(focusGrid);
  };

  // Ce qui est saisi est lu en quittant le champ ou avec Entrée ; illisible, l'ancienne date revient.
  const commitText = () => {
    if (!edited) return;
    setEdited(false);
    if (text.trim() === "" && clearable) {
      if (current !== null) onChange("");
      return;
    }
    const day = readDate(text, today);
    if (day && allowed(day)) {
      if (day !== current) onChange(day);
      setText(formatDateField(day, today));
    } else setText(shown);
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "F4") {
      e.preventDefault();
      openAt(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitText();
      close();
    } else if (e.key === "Escape" && (open || edited)) {
      e.preventDefault();
      e.stopPropagation();
      setEdited(false);
      setText(shown);
      close();
    }
  };

  const moveCursor = (day: DayKey) => {
    setCursor(day);
    if (day.slice(0, 7) !== month.slice(0, 7)) setMonth(day);
  };
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => DayKey> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
      Home: () => startOfWeek(cursor),
      End: () => addDays(startOfWeek(cursor), 6),
    };
    const move = moves[e.key];
    if (move) moveCursor(move());
    else if (e.key === "Enter" || e.key === " ") {
      if (allowed(cursor)) pick(cursor);
    } else if (e.key === "Escape") {
      close();
      inputRef.current?.focus();
    } else if (e.key === "Tab") {
      close();
      inputRef.current?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Au clavier, le jour courant du calendrier reçoit le focus.
  useEffect(() => {
    if (open && inGrid) gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();
  }, [open, inGrid, cursor, month]);

  const grid = monthGrid(month);
  const marks = useMemo(() => (open && special ? special.marks(grid[0]!, grid[41]!) : null), [open, special, grid[0]]);
  const monthKey = month.slice(0, 7);

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        className={className ? `${className} date-field` : "date-field"}
        type="text"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        placeholder={clearable ? placeholder : undefined}
        title={current ? FULL.format(fromDayKey(current)) : undefined}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
        }}
        onClick={() => !open && openAt(false)}
        onBlur={(e) => {
          if (!popRef.current?.contains(e.relatedTarget as Node)) commitText();
        }}
        onKeyDown={onInputKey}
      />
      {open &&
        createPortal(
          <div ref={popRef} className="date-pop glass-popover" style={place} role="dialog" aria-labelledby={titleId}>
            <div className="date-quick">
              {quickDays(today).map((q) => (
                <button key={q.label} type="button" className="date-chip" disabled={!allowed(q.day)} onClick={() => pick(q.day)}>
                  {q.label}
                </button>
              ))}
              {clearable && (
                <button type="button" className="date-chip date-chip--clear" onClick={() => pick("")}>
                  {tr("Aucune date")}
                </button>
              )}
            </div>
            <div className="date-head">
              <button type="button" className="icon-btn icon-btn--xs" aria-label={tr("Mois précédent")} onClick={() => setMonth(addMonths(month, -1))}>
                <Icon d={ICONS.arrowLeft} size={12} stroke={2.4} />
              </button>
              <span id={titleId} className="date-title" aria-live="polite">
                {MONTH.format(fromDayKey(month))}
              </span>
              <button type="button" className="icon-btn icon-btn--xs" aria-label={tr("Mois suivant")} onClick={() => setMonth(addMonths(month, 1))}>
                <Icon d={ICONS.arrowRight} size={12} stroke={2.4} />
              </button>
            </div>
            <div className="mini-month-head" aria-hidden="true">
              {weekdayInitials().map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div ref={gridRef} className="mini-month-grid date-grid" role="group" aria-labelledby={titleId} onKeyDown={onGridKey}>
              {grid.map((day) => {
                const mark = marks?.get(day);
                const spoken = FULL.format(fromDayKey(day));
                return (
                  <button
                    key={day}
                    type="button"
                    className="mini-day"
                    data-day={day}
                    data-out={day.slice(0, 7) !== monthKey || undefined}
                    data-today={day === today || undefined}
                    data-selected={day === current || undefined}
                    {...dayMarkAttributes(mark)}
                    title={mark?.label}
                    aria-label={mark ? `${spoken}, ${mark.label}` : spoken}
                    aria-pressed={day === current}
                    aria-current={day === today ? "date" : undefined}
                    disabled={!allowed(day)}
                    tabIndex={day === cursor ? 0 : -1}
                    onClick={() => pick(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
