/**
 * Fiche d'un contact : une carte d'identité compacte et colorée (bandeau du thème, photo, nom,
 * informations rangées en cases de couleur), puis ses notes, modifiables sur place, et les
 * éléments liés. Le thème de la carte accorde le bandeau et les couleurs de chaque information.
 */
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBulk } from "../app/bulk";
import { useToast } from "../app/ToastProvider";
import { useItemMenu } from "../components/ContextMenu";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { SymbolPicker } from "../components/SymbolPicker";
import { symbolPath } from "../components/symbols";
import { KEYS } from "../lib/itemKeys";
import { useNow } from "../lib/useNow";
import { LinksSection } from "../links/LinksSection";
import { getModule } from "../modules/modules";
import { useSpaces } from "../spaces/SpacesProvider";
import { dayKey, fromDayKey } from "../tasks/day";
import { ColorChoices } from "../components/ColorChoices";
import { MOTIF_PATHS } from "../theme/motifs";
import { bannerColors, CARD_INK, CARD_THEMES, cardInk, infoColor, styleFor, themeOf, type BannerId, type CardTheme } from "./cardStyles";
import { ageAt, contactName, daysUntilBirthday, INFO_STYLE, MAX_FIELDS, nextBirthday, parseBirthday, type Contact, type ContactField, type InfoKind } from "./contacts";
import { Avatar } from "./ContactEditor";
import { useContacts } from "./ContactsProvider";
import { KeepInTouch } from "./KeepInTouch";
import { locale, tr, trValue } from "../i18n/i18n";

/** Copie dans le presse-papiers, avec un message. */
export function useCopy(): (text: string, done: string) => void {
  const notify = useToast();
  return (text, done) => {
    navigator.clipboard
      .writeText(text)
      .then(() => notify(done))
      .catch(() => notify(tr("Copie impossible.")));
  };
}

/** « Aujourd'hui », « Demain », « Dans 12 jours ». */
export function inDays(n: number): string {
  return n === 0 ? tr("Aujourd'hui") : n === 1 ? tr("Demain") : tr("Dans {n} jours", { n });
}

const MONTH = new Intl.DateTimeFormat(locale(), { month: "long" });

/** Étoiles, feuilles et confettis du bandeau : placés une fois pour toutes. */
const SPOTS = [
  { x: 52, y: 12, s: 16, r: -15 },
  { x: 70, y: 30, s: 11, r: 20 },
  { x: 86, y: 14, s: 20, r: 40 },
  { x: 94, y: 52, s: 12, r: -30 },
  { x: 62, y: 62, s: 14, r: 10 },
  { x: 78, y: 78, s: 18, r: -45 },
  { x: 40, y: 34, s: 10, r: 60 },
];

/** Nuages du motif « Nuages » : position et taille. */
const CLOUDS: readonly [number, number, number][] = [
  [250, 12, 1.4], [330, 70, 0.9], [170, 96, 1.1], [300, 150, 1.6], [40, 150, 0.8], [110, 30, 0.7],
];

/** Motif du thème, en blanc translucide, posé sur son dégradé (toute la carte, ou l'aperçu). */
function BannerPattern({ banner }: { banner: BannerId }) {
  if (banner === "uni") return null;
  if (banner === "pois" || banner === "rayures" || banner === "losanges" || banner === "cercles") return <span className="id-card-texture" data-banner={banner} />;
  if (banner === "nuages") {
    return (
      <svg className="id-card-art" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        {CLOUDS.map(([x, y, k], i) => (
          <path key={i} className="id-cloud" transform={`translate(${x} ${y}) scale(${k})`} d="M10 30a12 12 0 0 1 6-22a16 16 0 0 1 30-2a11 11 0 0 1 16 10a9 9 0 0 1-2 18z" />
        ))}
      </svg>
    );
  }
  if (banner === "vagues") {
    return (
      <svg className="id-card-art" viewBox="0 0 400 220" preserveAspectRatio="none">
        <path className="id-wave id-wave--far" d="M0 150C70 118 150 176 230 146S350 96 400 118L400 220L0 220Z" />
        <path className="id-wave id-wave--near" d="M0 182C90 156 180 206 270 180S370 150 400 162L400 220L0 220Z" />
      </svg>
    );
  }
  if (banner === "bulles") {
    return (
      <>
        <span className="id-bubble id-bubble--a" />
        <span className="id-bubble id-bubble--b" />
        <span className="id-bubble id-bubble--c" />
        <span className="id-bubble id-bubble--d" />
        <span className="id-bubble id-bubble--e" />
      </>
    );
  }
  const path = banner === "etoiles" ? ICONS.sparkle : banner === "feuillage" ? MOTIF_PATHS.feuilles : banner === "coeurs" ? MOTIF_PATHS.coeurs : null;
  return (
    <span className="id-card-spots" aria-hidden="true">
      {SPOTS.map((p, i) =>
        path ? (
          <svg key={i} viewBox="0 0 24 24" width={p.s * (banner === "feuillage" ? 1.6 : 1)} height={p.s * (banner === "feuillage" ? 1.6 : 1)} style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `rotate(${p.r}deg)` }}>
            <path d={path} />
          </svg>
        ) : (
          <span key={i} className="id-confetti" data-shape={i % 3} style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `rotate(${p.r * 2}deg)` }} />
        ),
      )}
    </span>
  );
}

/** Aperçu miniature d'un thème : bandeau et pastilles des informations. */
function ThemePreview({ theme, cardColor }: { theme: CardTheme; cardColor: string }) {
  const [a, b] = bannerColors(theme, cardColor);
  return (
    <span className="idc-theme-preview" aria-hidden="true">
      <span className="idc-theme-banner" style={{ "--banner-a": a, "--banner-b": b } as CSSProperties}>
        <BannerPattern banner={theme.pattern} />
      </span>
      <span className="idc-theme-dots">
        {(["phone", "email", "birthday", "address", "company"] as InfoKind[]).map((k) => (
          <span key={k} style={{ background: infoColor(k, theme, cardColor) }} />
        ))}
      </span>
    </span>
  );
}

/** Bouton « Thème de la carte » : thème (bandeau et couleurs accordés) et couleur du contact. */
function CardStyler({ contact }: { contact: Contact }) {
  const { update, contacts } = useContacts();
  const bulk = useBulk();
  // Position du panneau, sous le bouton ; affiché par-dessus tout (la carte rogne ses bords).
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = at !== null;
  const current = themeOf(contact);
  const cardColor = contact.color ?? getModule("contacts").color;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setAt(null);
    };
    const close = () => setAt(null);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setAt(null);
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  const others = contacts.filter((c) => c.id !== contact.id && themeOf(c).id !== current.id);
  return (
    <>
      <button ref={button} type="button" className="idc-btn" aria-haspopup="dialog" aria-expanded={open} aria-label={tr("Thème de la carte")} title={tr("Thème de la carte")} onClick={toggle}>
        <Icon d={ICONS.palette} size={14} stroke={2.2} />
      </button>
      {at &&
        createPortal(
          <div
            ref={panel}
            className="card-styler glass-popover"
            style={{ top: at.top, right: at.right, maxHeight: `calc(100vh - ${at.top + 16}px)` }}
            role="dialog"
            aria-label={tr("Thème de la carte")}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setAt(null);
                button.current?.focus();
              }
            }}
          >
            <span className="card-styler-title">{tr("Thème de la carte")}</span>
            <div className="idc-themes" role="radiogroup" aria-label={tr("Thème de la carte")}>
              {CARD_THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={current.id === t.id} className="idc-theme" onClick={() => void update(contact, { style: styleFor(t) })}>
                  <ThemePreview theme={t} cardColor={cardColor} />
                  <span className="card-styler-label">{t.label}</span>
                </button>
              ))}
            </div>
            {others.length > 0 && (
              <button
                type="button"
                className="link-btn idc-apply-all"
                onClick={() =>
                  void bulk(tr("Thème « {label} » appliqué à {x} fiches.", { label: current.label, x: others.length + 1 }), tr("changement du thème des fiches"), async () => {
                    for (const c of others) await update(c, { style: styleFor(current) });
                  })
                }
              >
                {tr("Appliquer ce thème à toutes les fiches")}
              </button>
            )}
            <span className="card-styler-title">{tr("Couleur du contact")}</span>
            <p className="card-styler-hint">{tr("Initiales, liste et thèmes « Arc-en-ciel » et « Ton sur ton ».")}</p>
            <ColorChoices value={contact.color} label={tr("Couleur du contact")} onChange={(color) => void update(contact, { color })} />
          </div>,
          document.body,
        )}
    </>
  );
}

interface FieldProps {
  color: string;
  icon: string;
  label: string;
  children: ReactNode;
  /** Sur toute la largeur de la carte (adresse, e-mail long). */
  wide?: boolean;
  copy?: { text: string; done: string };
  menu?: ReturnType<ReturnType<typeof useItemMenu>>;
  onOpen?: () => void;
}

/** Une case de la carte : pastille de couleur, intitulé, valeur, bouton « Copier ». */
function Field({ color, icon, label, children, wide, copy, menu, onOpen }: FieldProps) {
  const doCopy = useCopy();
  return (
    <li className="idc-field" data-wide={wide || undefined} style={{ "--f": color } as CSSProperties} {...menu}>
      <span className="idc-field-icon" aria-hidden="true">
        <Icon d={icon} size={14} stroke={2.2} />
      </span>
      {onOpen ? (
        <button type="button" className="idc-field-text idc-field-text--button" onClick={onOpen} title={tr("Modifier ({rename})", { rename: KEYS.rename })}>
          <span className="idc-field-label">{label}</span>
          <span className="idc-field-value">{children}</span>
        </button>
      ) : (
        <span className="idc-field-text">
          <span className="idc-field-label">{label}</span>
          <span className="idc-field-value">{children}</span>
        </span>
      )}
      {copy && (
        <button type="button" className="icon-btn icon-btn--sm idc-copy" aria-label={tr("Copier : {text}", { text: copy.text })} title={tr("Copier")} onClick={() => doCopy(copy.text, copy.done)}>
          <Icon d={ICONS.copy} size={13} stroke={2.2} />
        </button>
      )}
    </li>
  );
}

/** Carte d'identité du contact : bandeau du thème, photo, nom, informations en cases de couleur. */
function IdCard({ contact, onEdit, onAddField, onEditField }: { contact: Contact; onEdit: (c: Contact) => void; onAddField: () => void; onEditField: (i: number) => void }) {
  const { update, groups } = useContacts();
  const { spaces } = useSpaces();
  const copy = useCopy();
  const itemMenu = useItemMenu();
  const today = dayKey(useNow());
  const space = spaces.find((s) => s.id === contact.spaceId);
  const group = groups.find((g) => g.id === contact.groupId);
  const theme = themeOf(contact);
  const color = contact.color ?? getModule("contacts").color;
  const [a, b] = bannerColors(theme, color);
  // Encre du texte posé sur le dégradé : lisible d'un bout à l'autre (cardInk).
  const ink = cardInk(theme, color);
  const info = (kind: InfoKind) => ({ color: infoColor(kind, theme, color), icon: symbolPath(INFO_STYLE[kind].symbol, ICONS.star) });
  const name = contactName(contact);
  const next = nextBirthday(contact.birthday, today);
  const days = daysUntilBirthday(contact.birthday, today);
  const age = next ? ageAt(contact.birthday, next) : null;
  const born = parseBirthday(contact.birthday);
  const removeField = (index: number) => void update(contact, { fields: contact.fields.filter((_, i) => i !== index) });
  const stripe = (["phone", "email", "birthday", "address", "company", "tags"] as InfoKind[]).map((k) => infoColor(k, theme, color));

  return (
    <article
      className="idc"
      data-theme={theme.id}
      data-ink={ink}
      style={{ "--banner-a": a, "--banner-b": b, "--card-color": color, color: CARD_INK[ink] } as CSSProperties}
    >
      {/* Le thème couvre toute la carte : dégradé et motif ; seules les cases restent claires. */}
      <span className="idc-banner-pattern" aria-hidden="true">
        <BannerPattern banner={theme.pattern} />
      </span>
      <header className="idc-banner">
        <span className="idc-pills">
          {group && (
            <span className="idc-pill">
              <Icon d={symbolPath(group.icon, ICONS.spaces)} size={12} stroke={2.2} />
              {group.name}
            </span>
          )}
          {space && <span className="idc-pill">{space.name}</span>}
        </span>
        <span className="idc-actions">
          <CardStyler contact={contact} />
          <button type="button" className="idc-btn idc-btn--text" onClick={() => onEdit(contact)} title={tr("Modifier ({rename})", { rename: KEYS.rename })}>
            <Icon d={ICONS.pencil} size={13} stroke={2.2} />
            {tr("Modifier")}
          </button>
        </span>
      </header>

      <div className="idc-identity">
        <span className="idc-photo">
          <Avatar contact={{ ...contact, color }} size={72} />
        </span>
        <div className="idc-names">
          <h2 className="idc-name">
            {name}
            <button
              type="button"
              className="contact-star-toggle"
              aria-pressed={contact.favorite}
              aria-label={contact.favorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris")}
              title={contact.favorite ? tr("Retirer des favoris") : tr("Ajouter aux favoris")}
              onClick={() => void update(contact, { favorite: !contact.favorite })}
            >
              <Icon d={ICONS.star} size={20} filled={contact.favorite} stroke={1.9} />
            </button>
          </h2>
          {contact.company && name !== contact.company && (
            <p className="idc-company" style={{ "--f": infoColor("company", theme, color) } as CSSProperties}>
              <Icon d={symbolPath(INFO_STYLE.company.symbol, ICONS.star)} size={13} stroke={2.2} />
              {contact.company}
            </p>
          )}
          {contact.tags.length > 0 && (
            <p className="idc-tags" style={{ "--f": infoColor("tags", theme, color) } as CSSProperties}>
              {contact.tags.map((t) => (
                <span key={t} className="idc-tag">
                  #{t}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <ul className="idc-fields" aria-label={tr("Coordonnées")}>
        {contact.phones.map((p, i) => (
          <Field key={`t${i}`} {...info("phone")} label={p.label ? trValue(p.label) : INFO_STYLE.phone.label} copy={{ text: p.value, done: tr("Numéro copié.") }}>
            {p.value}
          </Field>
        ))}
        {contact.emails.map((e, i) => (
          <Field key={`e${i}`} {...info("email")} wide={e.value.length > 18} label={e.label ? tr("E-mail · {label}", { label: trValue(e.label).toLowerCase() }) : INFO_STYLE.email.label} copy={{ text: e.value, done: tr("Adresse e-mail copiée.") }}>
            {e.value}
          </Field>
        ))}
        {born && next && (
          <Field {...info("birthday")} label={INFO_STYLE.birthday.label}>
            {born.day} {MONTH.format(fromDayKey(next))}
            {born.year ? ` ${born.year}` : ""}
            {days !== null && (
              <span className="idc-field-extra">
                {inDays(days)}
                {age !== null && age > 0 ? tr(" · {age} ans", { age }) : ""}
              </span>
            )}
          </Field>
        )}
        {contact.address && (
          <Field {...info("address")} wide label={INFO_STYLE.address.label} copy={{ text: contact.address, done: tr("Adresse copiée.") }}>
            <span className="idc-lines">{contact.address}</span>
          </Field>
        )}
        {contact.fields.map((f, i) => (
          <Field
            key={`f${i}`}
            color={f.color ?? theme.field}
            icon={symbolPath(f.icon, ICONS.star)}
            label={f.label || tr("Information")}
            wide={f.value.length > 28}
            onOpen={() => onEditField(i)}
            menu={itemMenu(() => [
              { label: tr("Modifier"), icon: ICONS.pencil, shortcut: KEYS.rename, run: () => onEditField(i) },
              { label: tr("Copier"), icon: ICONS.copy, run: () => copy(f.value, tr("Information copiée.")) },
              "separator",
              { label: tr("Supprimer"), icon: ICONS.trash, shortcut: KEYS.remove, danger: true, run: () => removeField(i) },
            ])}
          >
            {f.value}
          </Field>
        ))}
        {contact.fields.length < MAX_FIELDS && (
          <li className="idc-add">
            <button type="button" onClick={onAddField} title={tr("Code d'entrée, pointure, allergies…")}>
              <Icon d={ICONS.plus} size={14} stroke={2.6} />
              {tr("Ajouter une information")}
            </button>
          </li>
        )}
      </ul>

      <footer className="idc-stripe" aria-hidden="true">
        {stripe.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </footer>
    </article>
  );
}

/** Une information libre (« Code d'entrée »), à ajouter ou modifier. */
function FieldDialog({ contact, index, onClose }: { contact: Contact; index: number | null; onClose: () => void }) {
  const { update } = useContacts();
  const current = index !== null ? contact.fields[index] : undefined;
  const [label, setLabel] = useState(current?.label ?? "");
  const [value, setValue] = useState(current?.value ?? "");
  const [icon, setIcon] = useState(current?.icon ?? "etoile");
  const [color, setColor] = useState<string | null>(current?.color ?? themeOf(contact).field);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) {
      setError(tr("Saisissez une valeur."));
      return;
    }
    const field: ContactField = { label: label.trim(), value: value.trim(), icon, color };
    const fields = index === null ? [...contact.fields, field] : contact.fields.map((f, i) => (i === index ? field : f));
    void update(contact, { fields });
    onClose();
  };
  return (
    <Dialog title={current ? tr("Information") : tr("Nouvelle information")} onClose={onClose}>
      <form className="settings-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-intitule`} className="field-label">
            {tr("Intitulé")}
          </label>
          <div className="field-box">
            <input
              id={`${ids}-intitule`}
              className="field-input"
              list={`${ids}-idees`}
              value={label}
              maxLength={40}
              autoComplete="off"
              placeholder={tr("Code d'entrée, pointure, allergies…")}
              onChange={(e) => setLabel(e.target.value)}
              data-autofocus
            />
            <datalist id={`${ids}-idees`}>
              {[tr("Code d'entrée"), tr("Pointure"), tr("Taille"), tr("Allergies"), tr("Plat préféré"), tr("Couleur préférée"), tr("Groupe sanguin"), tr("Site web"), tr("Numéro de client"), tr("Profession")].map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-valeur`} className="field-label">
            {tr("Valeur")}
          </label>
          <div className="field-box" data-invalid={error ? true : undefined}>
            <input
              id={`${ids}-valeur`}
              className="field-input"
              value={value}
              maxLength={500}
              autoComplete="off"
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{tr("Symbole")}</span>
          <SymbolPicker value={icon} onChange={setIcon} label={tr("Symbole de l'information")} color={color} />
        </div>
        <div className="field">
          <span className="field-label">{tr("Couleur")}</span>
          <ColorChoices value={color} onChange={setColor} label={tr("Couleur de l'information")} />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={onClose}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel">
            {current ? tr("Enregistrer") : tr("Ajouter")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Texte tel que le cœur l'enregistre (`clean_notes` : fin de texte sans espaces, retours à la ligne « \n »). */
export const storedNotes = (text: string) => text.trimEnd().replace(/\r\n/g, "\n");

/** Notes du contact, modifiables sur place : enregistrées après une courte pause de saisie. */
function NotesZone({ contact }: { contact: Contact }) {
  const { update } = useContacts();
  const [text, setText] = useState(contact.notes);
  const saved = useRef(contact.notes);
  const timer = useRef<number | undefined>(undefined);
  const ids = useId();
  // Une modification venue d'ailleurs (fiche, annulation) remplace le texte affiché. Le retour
  // de notre propre enregistrement, nettoyé par le cœur, ne le remplace pas : sinon l'espace tapé
  // juste avant la pause disparaîtrait et le curseur sauterait.
  useEffect(() => {
    if (contact.notes !== saved.current) {
      saved.current = contact.notes;
      setText(contact.notes);
    }
  }, [contact.notes]);
  const save = (value: string) => {
    window.clearTimeout(timer.current);
    const stored = storedNotes(value);
    if (stored === saved.current) return;
    saved.current = stored;
    void update(contact, { notes: value });
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const style = INFO_STYLE.notes;
  return (
    <section className="contact-notes" style={{ "--info-color": style.color } as CSSProperties} aria-labelledby={`${ids}-titre`}>
      <h3 id={`${ids}-titre`} className="contact-notes-title">
        <span className="bento-icon" aria-hidden="true">
          <Icon d={symbolPath(style.symbol, ICONS.notes)} size={15} stroke={2.1} />
        </span>
        {tr("Notes")}
      </h3>
      <textarea
        className="contact-notes-text"
        value={text}
        maxLength={20000}
        rows={Math.min(12, Math.max(3, text.split("\n").length + 1))}
        placeholder={tr("Idées de cadeaux, goûts, souvenirs…")}
        aria-labelledby={`${ids}-titre`}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => save(value), 800);
        }}
        onBlur={() => save(text)}
      />
    </section>
  );
}

/**
 * Fiche complète, sans grand panneau autour : la carte d'identité à gauche, et à côté (ou dessous
 * en fenêtre étroite) le suivi « Rester en contact », les notes et les éléments liés, chacun dans
 * son bloc.
 */
export function ContactDetail({ contact, onEdit }: { contact: Contact | null; onEdit: (c: Contact) => void }) {
  const [fieldEdit, setFieldEdit] = useState<number | "nouvelle" | null>(null);
  if (!contact) return <aside className="contact-detail contact-detail--empty glass habit-detail--empty">{tr("Aucun contact sélectionné.")}</aside>;
  return (
    <aside className="contact-detail" aria-label={contactName(contact)}>
      <div className="contact-detail-grid">
        <div className="contact-detail-card">
          <IdCard contact={contact} onEdit={onEdit} onAddField={() => setFieldEdit("nouvelle")} onEditField={setFieldEdit} />
        </div>
        <div className="contact-detail-side">
          <KeepInTouch key={`suivi-${contact.id}`} contact={contact} />
          <NotesZone key={contact.id} contact={contact} />
          <div className="contact-links">
            <LinksSection item={{ kind: "contact", id: contact.id }} kinds={["task", "event", "note", "project", "obligation", "document"]} title={tr("Éléments liés")} empty={tr("Aucun élément lié.")} />
          </div>
        </div>
      </div>
      {fieldEdit !== null && <FieldDialog contact={contact} index={fieldEdit === "nouvelle" ? null : fieldEdit} onClose={() => setFieldEdit(null)} />}
    </aside>
  );
}
