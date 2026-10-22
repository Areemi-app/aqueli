/**
 * Écran Contacts (cahier des charges § 4.12) : répertoire par lettre, favoris, anniversaires à
 * venir ; fiche avec coordonnées à copier, anniversaire, notes et éléments liés.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useBulk } from "../app/bulk";
import { useItemMenu, useScreenMenu, type MenuEntry } from "../components/ContextMenu";
import { EmptyState } from "../components/EmptyState";
import { ScreenTitle } from "../components/ScreenTitle";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Orb } from "../components/Orb";
import { SelectionBar, selectionEntries, useSelection } from "../components/SelectionBar";
import { symbolPath } from "../components/symbols";
import { Tabs, type TabItem } from "../components/Tabs";
import { KEYS } from "../lib/itemKeys";
import { dragLabel, startDrag } from "../lib/dragDrop";
import { usePinEntry } from "../pins/pins";
import { contactRequest, NEW_ITEM } from "../lib/request";
import { getModule } from "../modules/modules";
import { useNewItem } from "../shell/newItem";
import { useSpaces } from "../spaces/SpacesProvider";
import { dayKey, fromDayKey, type DayKey } from "../tasks/day";
import { useNow } from "../lib/useNow";
import {
  contactName,
  letterOf,
  matches,
  sinceLabel,
  toReconnect,
  upcomingBirthdays,
  INFO_STYLE,
  type BirthdayOccurrence,
  type Contact,
  type ContactGroup,
} from "./contacts";
import { ContactDetail, inDays, useCopy } from "./ContactCard";
import { CategoryChips, GroupDialog, type CategoryFilter } from "./ContactGroups";
import { Avatar, ContactEditor } from "./ContactEditor";
import { useContactBulk } from "./contactBulk";
import { ContactsExport } from "./ContactsExport";
import { useContacts } from "./ContactsProvider";
import { locale, tr, trn } from "../i18n/i18n";
import { Sentences } from "../components/Sentences";

type View = "tous" | "favoris" | "recontacter" | "anniversaires";
const VIEWS: readonly TabItem<View>[] = [
  { id: "tous", label: tr("Tous") },
  { id: "favoris", label: tr("Favoris") },
  { id: "recontacter", label: tr("À recontacter") },
  { id: "anniversaires", label: tr("Anniversaires") },
];


interface ContactRowProps {
  contact: Contact;
  selected: boolean;
  /** Pris dans une sélection de plusieurs contacts. */
  picked: boolean;
  /** Clic droit et touches d'un contact sélectionné parmi d'autres : actions de la sélection. */
  bulk: MenuEntry[] | null;
  detail: string;
  onSelect: (e: ReactMouseEvent | null) => void;
  onEdit: () => void;
  /** Glisser vers une catégorie. */
  onDrag: (e: ReactPointerEvent<HTMLElement>) => void;
}

function ContactRow({ contact, selected, picked, bulk, detail, onSelect, onEdit, onDrag }: ContactRowProps) {
  const { update, remove, groups } = useContacts();
  const copy = useCopy();
  const itemMenu = useItemMenu();
  const pinEntry = usePinEntry();
  const phone = contact.phones[0]?.value;
  const menu = itemMenu(() => bulk ?? [
    { label: tr("Ouvrir"), icon: ICONS.enter, shortcut: KEYS.open, run: () => onSelect(null) },
    { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.rename, run: onEdit },
    { label: contact.favorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris"), icon: ICONS.star, run: () => void update(contact, { favorite: !contact.favorite }) },
    pinEntry({ kind: "contact", id: contact.id }),
    ...(phone ? [{ label: tr("Copier le numéro"), icon: ICONS.copy, run: () => copy(phone, tr("Numéro copié.")) }] : []),
    ...(groups.length > 0
      ? ([
          "separator",
          ...(contact.groupId ? [{ label: tr("Retirer de sa catégorie"), icon: ICONS.spaces, run: () => void update(contact, { groupId: null }) }] : []),
          ...groups
            .filter((g) => g.id !== contact.groupId)
            .map((g) => ({ label: tr("Ranger dans « {name} »", { name: g.name }), icon: symbolPath(g.icon, ICONS.spaces), run: () => void update(contact, { groupId: g.id }) })),
        ] as MenuEntry[])
      : []),
    "separator",
    { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => void remove(contact) },
  ]);
  return (
    <li
      className="contact-row"
      style={contact.color ? ({ "--row-color": contact.color } as CSSProperties) : undefined}
      data-selected={selected || undefined}
      data-picked={picked || undefined}
      aria-selected={selected || picked}
      tabIndex={0}
      onClick={onSelect}
      // Au clavier (flèches), le contact qui reçoit le focus s'affiche ; à la souris, c'est le clic.
      onFocus={(e) => e.currentTarget.matches(":focus-visible") && onSelect(null)}
      onPointerDown={onDrag}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      <Avatar contact={contact} size={34} />
      <span className="contact-row-text">
        <span className="contact-row-name">{contactName(contact)}</span>
        {detail && <span className="contact-row-detail">{detail}</span>}
      </span>
      {contact.favorite && <Icon d={ICONS.star} size={14} filled className="contact-star" />}
    </li>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const MONTH_TITLE = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
const DAY_NUMBER = new Intl.DateTimeFormat(locale(), { day: "numeric" });
const WEEKDAY_LONG = new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" });

/** Anniversaires à venir : le prochain en grand, puis mois par mois. */
function BirthdaysBoard({ onOpen, query }: { onOpen: (c: Contact) => void; query: string }) {
  const { visible } = useContacts();
  const today = dayKey(useNow());
  const list = useMemo(() => upcomingBirthdays(visible as Contact[], today, 366).filter((b) => matches(b.contact, query)), [visible, today, query]);
  const m = getModule("contacts");
  if (list.length === 0) {
    return (
      <section className="coming-soon glass habits-empty birthdays-empty">
        <Orb color={INFO_STYLE.birthday.color} icon={symbolPath("cadeau", m.icon)} size={100} />
        <h2 className="coming-title">{query ? tr("Aucun anniversaire trouvé") : tr("Aucun anniversaire")}</h2>
        <p className="settings-intro">{tr("La date d'anniversaire se renseigne dans la fiche de chaque contact.")}</p>
      </section>
    );
  }
  const [first, ...rest] = list;
  const daysTo = (day: DayKey) => Math.round((fromDayKey(day).getTime() - fromDayKey(today).getTime()) / 86_400_000);
  const months = new Map<string, BirthdayOccurrence[]>();
  for (const b of rest) months.set(b.day.slice(0, 7), [...(months.get(b.day.slice(0, 7)) ?? []), b]);
  const firstIn = daysTo(first!.day);
  return (
    <div className="birthdays-board" style={{ "--bday": INFO_STYLE.birthday.color, "--bday-2": INFO_STYLE.notes.color } as CSSProperties}>
      <button type="button" className="birthday-hero" data-today={firstIn === 0 || undefined} onClick={() => onOpen(first!.contact)}>
        <span className="birthday-confetti" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <span
              key={i}
              style={{ "--i": i, top: `${8 + ((i * 37) % 80)}%`, left: `${(i * 53) % 100}%`, background: `hsl(${i * 47} 80% 62%)` } as CSSProperties}
            />
          ))}
        </span>
        <Avatar contact={first!.contact} size={96} />
        <span className="birthday-hero-text">
          <span className="birthday-hero-when">{firstIn === 0 ? tr("Aujourd'hui") : inDays(firstIn)}</span>
          <span className="birthday-hero-name">{contactName(first!.contact)}</span>
          <span className="birthday-hero-detail">
            {capitalize(WEEKDAY_LONG.format(fromDayKey(first!.day)))}
            {first!.age !== null && first!.age > 0 ? tr(" · {age} ans", { age: first!.age }) : ""}
          </span>
        </span>
        <span className="birthday-hero-cake" aria-hidden="true">
          <Icon d={symbolPath("cadeau", ICONS.star)} size={44} stroke={1.6} />
        </span>
      </button>
      {[...months].map(([month, items]) => (
        <section key={month} className="birthday-month" aria-label={MONTH_TITLE.format(fromDayKey(`${month}-01`))}>
          <h3 className="birthday-month-title">{MONTH_TITLE.format(fromDayKey(`${month}-01`))}</h3>
          <ul className="birthday-cards">
            {items.map((b) => {
              const n = daysTo(b.day);
              return (
                <li key={`${b.contact.id}-${b.day}`}>
                  <button type="button" className="birthday-card" data-soon={n <= 7 || undefined} onClick={() => onOpen(b.contact)}>
                    <span className="birthday-day">
                      <span className="birthday-day-number">{DAY_NUMBER.format(fromDayKey(b.day))}</span>
                      <span className="birthday-day-weekday">{fromDayKey(b.day).toLocaleDateString(locale(), { weekday: "short" }).replace(".", "")}</span>
                    </span>
                    <Avatar contact={b.contact} size={40} />
                    <span className="birthday-card-text">
                      <span className="birthday-card-name">{contactName(b.contact)}</span>
                      <span className="birthday-card-detail">
                        {inDays(n)}
                        {b.age !== null && b.age > 0 ? tr(" · {age} ans", { age: b.age }) : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ContactsScreen() {
  const { visible, loaded, groups: contactGroups, update } = useContacts();
  const bulk = useBulk();
  const { filter } = useSpaces();
  const contactBulk = useContactBulk();
  const today = dayKey(useNow());
  const [pending] = useState(contactRequest.take);
  const [selectedId, setSelectedId] = useState<string | null>(pending === NEW_ITEM ? null : pending);
  const [editing, setEditing] = useState<Contact | "nouveau" | null>(pending === NEW_ITEM ? "nouveau" : null);
  const [view, setView] = useState<View>("tous");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("toutes");
  const [groupEdit, setGroupEdit] = useState<ContactGroup | "nouvelle" | null>(null);
  const [exporting, setExporting] = useState<{ contacts: readonly Contact[]; scope: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useNewItem(() => setEditing("nouveau"));
  const exportAll = () => setExporting({ contacts: visible, scope: filter === "tous" ? tr("tout le carnet") : tr("ceux de l'espace affiché") });
  useScreenMenu(() => [
    { label: tr("Nouveau contact"), icon: ICONS.plus, shortcut: KEYS.create, run: () => setEditing("nouveau") },
    { label: tr("Exporter les contacts…"), icon: ICONS.save, run: exportAll },
  ]);

  useEffect(
    () =>
      contactRequest.on((id) => {
        if (id === NEW_ITEM) setEditing("nouveau");
        else {
          setSelectedId(id);
          setView("tous");
          setQuery("");
        }
      }),
    [],
  );

  // Ctrl+F : recherche dans les contacts.
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

  const birthdays = useMemo(() => upcomingBirthdays(visible as Contact[], today, 366), [visible, today]);
  const groups = useMemo(() => {
    if (view === "anniversaires") return [];
    const list = visible.filter((c) => (view === "favoris" ? c.favorite : true) && (category === "toutes" || c.groupId === category) && matches(c, query));
    // À recontacter : une seule liste, du plus en retard au moins en retard.
    if (view === "recontacter") {
      const due = toReconnect(list, today);
      return due.length ? [{ letter: "", contacts: due }] : [];
    }
    const map = new Map<string, Contact[]>();
    for (const c of list) map.set(letterOf(c), [...(map.get(letterOf(c)) ?? []), c]);
    return [...map].map(([letter, contacts]) => ({ letter, contacts }));
  }, [visible, view, query, category, today]);
  const shown = view === "anniversaires" ? birthdays.filter((b) => matches(b.contact, query)).map((b) => b.contact) : groups.flatMap((g) => g.contacts);
  const selected = visible.find((c) => c.id === selectedId) ?? shown[0] ?? null;
  // Plusieurs contacts à la fois : Ctrl+clic, Maj+clic, Ctrl+A dans la liste.
  const pick = useSelection(
    view === "anniversaires" ? [] : shown.map((c) => c.id),
    selected?.id ?? null,
  );
  const picked = shown.filter((c) => pick.has(c.id));
  const bulkActions = contactBulk(picked);
  bulkActions.splice(bulkActions.length - 1, 0, { label: tr("Exporter…"), icon: ICONS.save, run: () => setExporting({ contacts: picked, scope: tr("la sélection") }) });
  const bulkEntries = pick.count > 1 ? selectionEntries(bulkActions) : null;

  // Glisser des contacts (ou la sélection) sur une catégorie, au-dessus de la liste.
  const dragContacts = (c: Contact) => (e: ReactPointerEvent<HTMLElement>) => {
    const moved = pick.has(c.id) && pick.count > 1 ? shown.filter((x) => pick.has(x.id)) : [c];
    const groupOf = (key: string) => key.slice("categorie:".length);
    startDrag(
      e,
      { kind: "contact", ids: moved.map((x) => x.id), label: dragLabel(moved.length, contactName(c), tr("contacts")), color: c.color },
      {
        canDrop: (key) => moved.some((x) => x.groupId !== groupOf(key)),
        onDrop: (key) => {
          const group = contactGroups.find((g) => g.id === groupOf(key));
          if (!group) return;
          const many = moved.length > 1;
          void bulk(many ? tr("{n} contacts rangés dans « {name} ».", { n: moved.length, name: group.name }) : tr("Contact rangé dans « {name} ».", { name: group.name }), tr("déplacement des contacts"), async () => {
            for (const x of moved) if (x.groupId !== group.id) await update(x, { groupId: group.id });
          });
        },
      },
    );
  };

  const onListKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(".contact-row")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const detailOf = (c: Contact) => (c.company && contactName(c) !== c.company ? c.company : (c.phones[0]?.value ?? c.emails[0]?.value ?? ""));
  const m = getModule("contacts");
  return (
    <div className="screen contacts-screen">
      <header className="tasks-header">
        <ScreenTitle module="contacts" />
        <Tabs items={VIEWS} value={view} onChange={setView} label={tr("Contacts affichés")} idPrefix="contacts" />
        <div className="field-box notes-search">
          <Icon d={ICONS.search} size={15} />
          <input
            ref={searchRef}
            type="search"
            className="field-input"
            placeholder={tr("Rechercher un contact")}
            aria-label={tr("Rechercher un contact")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
        <span className="tasks-header-spacer" />
        {visible.length > 0 && (
          <button type="button" className="btn-glass contacts-export" onClick={exportAll}>
            <Icon d={ICONS.save} size={15} stroke={2.4} />
            <span>{tr("Exporter")}</span>
          </button>
        )}
        <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")}>
          <Icon d={ICONS.plus} size={16} stroke={2.8} />
          <span>{tr("Nouveau contact")}</span>
        </button>
      </header>

      {loaded && visible.length === 0 ? (
        <section className="coming-soon glass habits-empty">
          <Orb color={m.color} icon={m.icon} size={110} />
          <h2 className="coming-title">{tr("Aucun contact")}</h2>
          <p className="settings-intro"><Sentences text={tr("Un carnet d'adresses personnel. Chaque fiche réunit les coordonnées, l'anniversaire et les éléments liés.")} /></p>
          <button type="button" className="btn-gel" onClick={() => setEditing("nouveau")}>
            <Icon d={ICONS.plus} size={16} stroke={2.8} />
            {tr("Nouveau contact")}
          </button>
        </section>
      ) : view === "anniversaires" ? (
        <BirthdaysBoard
          query={query}
          onOpen={(c) => {
            setSelectedId(c.id);
            setView("tous");
            setQuery("");
          }}
        />
      ) : (
        <div className="contacts-body">
          <section className="task-panel glass" id={`contacts-panel-${view}`} role="tabpanel" aria-labelledby={`contacts-tab-${view}`}>
            <CategoryChips contacts={visible} value={category} onChange={setCategory} onEdit={setGroupEdit} />
            <div
              className="task-scroll"
              onKeyDown={(e) => {
                pick.onListKeyDown(e);
                if (!e.defaultPrevented) onListKeys(e);
              }}
            >
              {loaded && shown.length === 0 && (
                <EmptyState
                  color={m.color}
                  icon={m.icon}
                  text={
                    query
                      ? tr("Aucun contact trouvé.")
                      : view === "favoris"
                        ? tr("Aucun favori.")
                        : view === "recontacter"
                          ? tr("Personne à recontacter. « Rester en contact », dans la fiche d'un contact, fixe la fréquence des nouvelles.")
                          : category !== "toutes"
                            ? tr("Aucun contact dans cette catégorie.")
                            : tr("Aucun contact.")
                  }
                  action={query || view !== "tous" ? undefined : { label: tr("Nouveau contact"), run: () => setEditing("nouveau") }}
                />
              )}
              {groups.map((g) => (
                  <section key={g.letter || "recontacter"} className="contact-group" aria-label={g.letter || tr("À recontacter")}>
                    {g.letter && <h3 className="contact-letter">{g.letter}</h3>}
                    <ul className="contact-rows">
                      {g.contacts.map((c) => (
                        <ContactRow
                          key={c.id}
                          contact={c}
                          selected={selected?.id === c.id}
                          picked={pick.has(c.id)}
                          bulk={pick.has(c.id) ? bulkEntries : null}
                          detail={view === "recontacter" ? (c.lastContact ? tr("Dernier échange {sinceLabel}", { sinceLabel: sinceLabel(c.lastContact, today) }) : tr("Aucun échange noté")) : detailOf(c)}
                          onSelect={(e) => {
                            if (!e || !pick.click(e, c.id)) setSelectedId(c.id);
                          }}
                          onEdit={() => setEditing(c)}
                          onDrag={dragContacts(c)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
            <SelectionBar count={pick.count} label={[tr("contact sélectionné"), tr("contacts sélectionnés")]} actions={bulkActions} onClear={pick.clear} />
            {pick.count === 0 && <div className="task-footer">{trn(visible.length, "{n} contact", "{n} contacts")}</div>}
          </section>
          <ContactDetail contact={selected} onEdit={setEditing} />
        </div>
      )}

      {groupEdit && <GroupDialog group={groupEdit === "nouvelle" ? undefined : groupEdit} onClose={() => setGroupEdit(null)} />}
      {exporting && <ContactsExport contacts={exporting.contacts} scope={exporting.scope} onClose={() => setExporting(null)} />}
      {editing && (
        <ContactEditor
          contact={editing === "nouveau" ? undefined : editing}
          onClose={(created) => {
            setEditing(null);
            if (created) {
              setSelectedId(created.id);
              setQuery("");
              setView("tous");
            }
          }}
        />
      )}
    </div>
  );
}

