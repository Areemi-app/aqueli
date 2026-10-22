/**
 * Champ d'heure d'Aqueli, à la place de celui de Windows. On saisit « 14h30 », « 9 », « 1830 »
 * ou « midi », ou on choisit dans une liste en verre (tous les quarts d'heure). Avec `from`,
 * la liste part de cette heure et donne la durée (« 15:30 · 1 h 30 »), pour une heure de fin.
 *
 * Clavier : ↓ ouvre la liste, ↓ ↑ s'y déplacent, Entrée choisit (ou valide l'heure saisie),
 * Échap ferme.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { parseTimeWords } from "../tasks/quickAdd";
import { durationLabel } from "../lib/duration";
import { useAnchoredPopover } from "./popover";
import { tr } from "../i18n/i18n";

const pad = (n: number) => String(n).padStart(2, "0");
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Heure saisie, ramenée à « HH:MM » ; `null` si illisible. */
export function readTime(text: string): string | null {
  const t = text.trim().toLowerCase();
  let h: number | null = null;
  let m = 0;
  const digits = t.match(/^(\d{1,4})$/);
  const parts = t.match(/^(\d{1,2})\s*[:h.]\s*(\d{1,2})?$/);
  if (digits) {
    const d = digits[1]!;
    if (d.length <= 2) h = Number(d);
    else {
      h = Number(d.slice(0, d.length - 2));
      m = Number(d.slice(-2));
    }
  } else if (parts) {
    h = Number(parts[1]);
    m = parts[2] ? Number(parts[2]) : 0;
  } else return parseTimeWords(t);
  if (h === null || h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** « 30 min », « 1 h », « 1 h 30 ». */
export { durationLabel } from "../lib/duration";

/** Heures proposées : toute la journée, ou après `from` jusqu'à minuit. */
export function timeChoices(step: number, from?: string | null): { time: string; note?: string }[] {
  const start = from ? toMinutes(from) + step : 0;
  const list: { time: string; note?: string }[] = [];
  for (let m = from ? start : 0; m < 24 * 60; m += step) {
    list.push(from ? { time: toTime(m), note: durationLabel(m - toMinutes(from)) } : { time: toTime(m) });
  }
  return list;
}

interface TimeFieldProps {
  id?: string;
  value: string | null;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  /** Écart entre deux heures de la liste, en minutes. */
  step?: number;
  /** Heure de début : la liste part de là et montre la durée. */
  from?: string | null;
  disabled?: boolean;
  /** L'heure peut être retirée (champ vidé). */
  clearable?: boolean;
  placeholder?: string;
}

export function TimeField({ id, value, onChange, label, className, step = 15, from, disabled, clearable, placeholder = "--:--" }: TimeFieldProps) {
  const [text, setText] = useState(value ?? "");
  const [edited, setEdited] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const choices = timeChoices(step, from);

  useEffect(() => {
    if (!edited) setText(value ?? "");
  }, [value, edited]);

  const close = useCallback(() => setOpen(false), []);
  const place = useAnchoredPopover(open, inputRef, listRef, close, { height: 264, minWidth: from ? 150 : 96 });

  /** Option la plus proche d'une heure (la valeur, ou ce qui est saisi). */
  const nearest = (time: string | null) => {
    if (!time) return Math.max(0, choices.findIndex((c) => c.time >= (from ?? "08:00")));
    const i = choices.findIndex((c) => c.time >= time);
    return i < 0 ? choices.length - 1 : i;
  };

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  const commit = (time: string) => {
    setEdited(false);
    setText(time);
    close();
    if (time !== value) onChange(time);
  };
  const commitText = () => {
    if (!edited) return;
    setEdited(false);
    if (text.trim() === "" && clearable) {
      if (value) onChange("");
      return;
    }
    const time = readTime(text);
    if (time) {
      setText(time);
      if (time !== value) onChange(time);
    } else setText(value ?? "");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!open) {
        setActive(nearest(readTime(text) ?? value));
        setOpen(true);
      } else setActive((i) => Math.max(0, Math.min(choices.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
      handled();
    } else if (e.key === "Enter") {
      if (edited) {
        commitText();
        close();
      } else if (open && choices[active]) commit(choices[active]!.time);
      else return;
      handled();
    } else if (e.key === "Escape" && (open || edited)) {
      setEdited(false);
      setText(value ?? "");
      close();
      handled();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        className={className ? `${className} time-field` : "time-field"}
        type="text"
        inputMode="numeric"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          setEdited(true);
          const typed = readTime(e.target.value);
          if (typed) setActive(nearest(typed));
        }}
        onClick={() => {
          if (open) return;
          setActive(nearest(value));
          setOpen(true);
        }}
        onBlur={(e) => {
          if (!listRef.current?.contains(e.relatedTarget as Node)) {
            commitText();
            close();
          }
        }}
        onKeyDown={onKey}
      />
      {open &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className="select-list time-list glass-popover" style={place} aria-label={label ?? tr("Heures")}>
            {choices.map((c, i) => (
              <li
                key={c.time}
                id={`${listId}-${i}`}
                role="option"
                className="select-option"
                aria-selected={c.time === value}
                data-active={i === active || undefined}
                onPointerMove={() => i !== active && setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => commit(c.time)}
              >
                <span className="select-text">{c.time}</span>
                {c.note && <span className="time-note">{c.note}</span>}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
