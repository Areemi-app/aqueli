/**
 * « Rester en contact » dans la fiche d'un contact : fréquence choisie, dernier échange, date
 * à laquelle reprendre des nouvelles, et le fil des échanges (appels, messages, rencontres…),
 * gardés dans la base chiffrée (src-tauri/src/data/contacts.rs).
 */
import { useEffect, useId, useState, type CSSProperties, type FormEvent } from "react";
import { useItemMenu } from "../components/ContextMenu";
import { DateField } from "../components/DateField";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/Select";
import { symbolPath } from "../components/symbols";
import { KEYS } from "../lib/itemKeys";
import { useNow } from "../lib/useNow";
import { dayKey, formatShortDay, type DayKey } from "../tasks/day";
import { contactsApi } from "./api";
import { INTERACTION_KINDS, KEEP_IN_TOUCH, nextContact, sinceLabel, type Contact, type Interaction, type InteractionKind } from "./contacts";
import { useContacts } from "./ContactsProvider";
import { tr } from "../i18n/i18n";

/** Échanges affichés avant « Voir tout ». */
const SHOWN = 4;
const FREQUENCIES = KEEP_IN_TOUCH.map((k) => ({ value: k.days === null ? "" : String(k.days), label: k.label }));
const kindOf = (id: InteractionKind) => INTERACTION_KINDS.find((k) => k.id === id) ?? INTERACTION_KINDS[4]!;

export function KeepInTouch({ contact }: { contact: Contact }) {
  const { update, addInteraction, removeInteraction } = useContacts();
  const itemMenu = useItemMenu();
  const today = dayKey(useNow());
  const ids = useId();
  const [list, setList] = useState<Interaction[] | null>(null);
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const [kind, setKind] = useState<InteractionKind>("appel");
  const [day, setDay] = useState<DayKey>(today);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    contactsApi
      .interactions(contact.id)
      .then((l) => alive && setList(l))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [contact.id, contact.lastContact, version]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await addInteraction(contact, { day, kind, note: note.trim() })) {
      setNote("");
      setAdding(false);
      setVersion((v) => v + 1);
    }
  };

  const next = nextContact(contact);
  const due = contact.keepInTouch !== null && (next === null || next <= today);
  const shown = list ? (all ? list : list.slice(0, SHOWN)) : [];

  return (
    <section className="contact-notes contact-keep" style={{ "--info-color": "var(--aq-accent)" } as CSSProperties} aria-labelledby={`${ids}-titre`}>
      <div className="contact-keep-head">
        <h3 id={`${ids}-titre`} className="contact-notes-title">
          <span className="bento-icon" aria-hidden="true">
            <Icon d={symbolPath("discussion", ICONS.repeat)} size={15} stroke={2.1} />
          </span>
          {tr("Rester en contact")}
        </h3>
        <Select
          value={contact.keepInTouch === null ? "" : String(contact.keepInTouch)}
          options={FREQUENCIES}
          label={tr("Fréquence des nouvelles")}
          className="contact-keep-select"
          onChange={(v) => void update(contact, { keepInTouch: v ? Number(v) : null })}
        />
      </div>
      <p className="contact-keep-status" data-due={due || undefined}>
        {contact.lastContact ? tr("Dernier échange {sinceLabel}", { sinceLabel: sinceLabel(contact.lastContact, today) }) : tr("Aucun échange noté")}
        {contact.keepInTouch !== null && (due ? tr(" · à recontacter") : next ? tr(" · prochain vers le {replace}", { replace: formatShortDay(next, today).replace(/\.$/, "") }) : "")}
      </p>

      {adding ? (
        <form className="contact-keep-form" onSubmit={(e) => void submit(e)}>
          <div className="contact-keep-kinds" role="radiogroup" aria-label={tr("Sorte d'échange")}>
            {INTERACTION_KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} className="chip-btn contact-keep-kind" onClick={() => setKind(k.id)}>
                <Icon d={symbolPath(k.icon, ICONS.star)} size={13} stroke={2.2} />
                {k.label}
              </button>
            ))}
          </div>
          <div className="contact-keep-row-form">
            <div className="field-box contact-keep-day">
              <DateField id={`${ids}-jour`} className="field-input" value={day} max={today} label={tr("Jour de l'échange")} onChange={(v) => v && setDay(v)} />
            </div>
            <div className="field-box contact-keep-note">
              <input className="field-input" value={note} maxLength={1000} placeholder={tr("Note (facultatif)")} aria-label={tr("Note")} onChange={(e) => setNote(e.target.value)} data-autofocus />
            </div>
          </div>
          <div className="contact-keep-actions">
            <button type="button" className="btn-glass btn-glass--sm" onClick={() => setAdding(false)}>
              {tr("Annuler")}
            </button>
            <button type="submit" className="btn-gel btn-gel--sm">
              {tr("Noter")}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-glass btn-glass--sm contact-keep-add"
          onClick={() => {
            setDay(today);
            setAdding(true);
          }}
        >
          <Icon d={ICONS.plus} size={13} stroke={2.6} />
          {tr("Noter un échange")}
        </button>
      )}

      {shown.length > 0 && (
        <ul className="contact-keep-list" aria-label={tr("Échanges")}>
          {shown.map((i) => {
            const k = kindOf(i.kind);
            const menu = itemMenu(() => [
              {
                label: tr("Supprimer l'échange"),
                icon: ICONS.trash,
                shortcut: KEYS.remove,
                danger: true,
                run: () => void removeInteraction(i).then((ok) => ok && setVersion((v) => v + 1)),
              },
            ]);
            return (
              <li key={i.id} className="contact-keep-item" tabIndex={0} aria-label={`${k.label}, ${formatShortDay(i.day, today)}${i.note ? tr(" : ") + i.note : ""}`} {...menu}>
                <span className="contact-keep-icon" aria-hidden="true">
                  <Icon d={symbolPath(k.icon, ICONS.star)} size={13} stroke={2.2} />
                </span>
                <span className="contact-keep-text">
                  <span className="contact-keep-when">
                    {k.label} · {formatShortDay(i.day, today)}
                  </span>
                  {i.note && <span className="contact-keep-note-text">{i.note}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {list && list.length > SHOWN && (
        <button type="button" className="link-btn contact-keep-more" onClick={() => setAll((a) => !a)}>
          {all ? tr("Afficher moins") : tr("{n} de plus", { n: list.length - SHOWN })}
        </button>
      )}
    </section>
  );
}
