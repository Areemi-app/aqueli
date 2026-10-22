/**
 * « Ajouter un événement » en une phrase, en haut du calendrier : « Dîner avec @Paul vendredi
 * 20h » (le contact est relié), « Réunion lundi 14h-16h +Travail ». Ce qui est compris s'affiche à droite avant
 * l'ajout ; Entrée ajoute l'événement.
 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import type { SpaceRef } from "../tasks/quickAdd";
import { formatShortDay } from "../tasks/day";
import { parseQuickEvent, type QuickEvent } from "./quickEvent";
import { useContactRefs } from "../contacts/contactRefs";
import { tr } from "../i18n/i18n";

interface QuickEventFieldProps {
  spaces: readonly SpaceRef[];
  today: string;
  duration: number;
  onCreate: (event: QuickEvent) => void;
}

export function describeQuickEvent(q: QuickEvent, today: string): string {
  const day = formatShortDay(q.startDate, today);
  if (!q.startTime) return tr("{day} · journée", { day });
  const end = q.endDate !== q.startDate ? `${formatShortDay(q.endDate, today)} ${q.endTime}` : q.endTime;
  return `${day} · ${q.startTime} – ${end}`;
}

export function QuickEventField({ spaces, today, duration, onCreate }: QuickEventFieldProps) {
  const [text, setText] = useState("");
  const contacts = useContactRefs();
  const parsed = text.trim() ? parseQuickEvent(text, new Date(), spaces, duration, contacts) : null;
  return (
    <form
      className="cal-quick field-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed) return;
        onCreate(parsed);
        setText("");
      }}
    >
      <Icon d={ICONS.plus} size={15} stroke={2.6} />
      <input
        className="field-input"
        value={text}
        maxLength={300}
        placeholder={tr("Ajouter un événement : « Dîner avec Paul vendredi 20h »")}
        aria-label={tr("Ajouter un événement en une phrase")}
        aria-describedby={parsed ? "cal-quick-apercu" : undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && text) {
            e.stopPropagation();
            setText("");
          }
        }}
      />
      {parsed && (
        <span id="cal-quick-apercu" className="cal-quick-preview">
          {describeQuickEvent(parsed, today)}
        </span>
      )}
    </form>
  );
}
