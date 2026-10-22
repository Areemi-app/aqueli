import { ImageCropper, type CropFormat } from "../components/ImageCropper";
import { useId, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Checkbox } from "../components/Checkbox";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { ICONS } from "../components/icons";
import { Select } from "../components/SelectRow";
import { symbolPath } from "../components/symbols";
import { getModule } from "../modules/modules";
import { useSpaces } from "../spaces/SpacesProvider";
import { TASK_COLORS } from "../tasks/colors";
import { makeDay } from "../tasks/day";
import { EMAIL_LABELS, EMPTY_CONTACT, INFO_STYLE, initials, parseBirthday, PHONE_LABELS, toInput, type Contact, type ContactInput, type Entry } from "./contacts";
import { useContacts } from "./ContactsProvider";
import { locale, tr, trValue } from "../i18n/i18n";

const MONTH_NAME = new Intl.DateTimeFormat(locale(), { month: "long" });
const MONTHS = Array.from({ length: 12 }, (_, i) => MONTH_NAME.format(new Date(2000, i, 1)));
/** Photo d'un contact : un carré, vu en rond. */
const PHOTO_FORMAT: readonly CropFormat[] = [{ id: "carre", label: tr("Carré"), ratio: 1 }];

const DAY_OPTIONS = [{ value: "", label: tr("Jour") }, ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))];
const MONTH_OPTIONS = [{ value: "", label: tr("Mois") }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))];

/** Pastille d'un contact : sa photo, sinon ses initiales sur sa couleur. */
export function Avatar({ contact, size }: { contact: Pick<Contact, "photo" | "color" | "firstName" | "lastName" | "company">; size: number }) {
  if (contact.photo) return <img className="avatar" src={contact.photo} alt="" width={size} height={size} draggable={false} />;
  return (
    <span className="avatar avatar--initials" style={{ width: size, height: size, fontSize: size * 0.38, "--avatar-color": contact.color ?? getModule("contacts").color } as CSSProperties} aria-hidden="true">
      {initials(contact)}
    </span>
  );
}

function EntriesField({ label, entries, labels, type, onChange }: { label: string; entries: Entry[]; labels: readonly string[]; type: "tel" | "email"; onChange: (e: Entry[]) => void }) {
  const set = (i: number, changes: Partial<Entry>) => onChange(entries.map((e, n) => (n === i ? { ...e, ...changes } : e)));
  return (
    <fieldset className="contact-entries">
      <legend className="field-label">{label}</legend>
      {entries.map((e, i) => (
        <div key={i} className="contact-entry">
          <Select value={e.label || labels[0]!} options={labels.map((l) => ({ value: l, label: trValue(l) }))} label={tr("Type : {label} {x}", { label: label.toLowerCase(), x: i + 1 })} onChange={(v) => set(i, { label: v })} />
          <div className="field-box contact-entry-value">
            <input
              className="field-input"
              type={type}
              value={e.value}
              maxLength={type === "tel" ? 40 : 200}
              aria-label={`${label} ${i + 1}`}
              placeholder={type === "tel" ? "06 12 34 56 78" : "nom@exemple.fr"}
              onChange={(ev) => set(i, { value: ev.target.value })}
            />
          </div>
          <button type="button" className="icon-btn icon-btn--sm" aria-label={tr("Retirer : {label} {x}", { label: label.toLowerCase(), x: i + 1 })} onClick={() => onChange(entries.filter((_, n) => n !== i))}>
            <Icon d={ICONS.close} size={12} stroke={2.4} />
          </button>
        </div>
      ))}
      {entries.length < 10 && (
        <button type="button" className="link-btn contact-add-entry" onClick={() => onChange([...entries, { label: labels[0]!, value: "" }])}>
          <Icon d={ICONS.plus} size={12} stroke={2.6} />
          {type === "tel" ? tr("Ajouter un numéro") : tr("Ajouter une adresse e-mail")}
        </button>
      )}
    </fieldset>
  );
}

const PHONE = /^[\d\s+\-.()/]*\d[\d\s+\-.()/]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

interface ContactEditorProps {
  contact?: Contact;
  onClose: (created?: Contact) => void;
}

/** Création ou modification d'une fiche de contact. */
export function ContactEditor({ contact, onClose }: ContactEditorProps) {
  const { create, update, groups } = useContacts();
  const { spaces, filter } = useSpaces();
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ContactInput>(() => (contact ? toInput(contact) : { ...EMPTY_CONTACT, spaceId: filter !== "tous" ? filter : (spaces[0]?.id ?? null) }));
  const initial = parseBirthday(form.birthday);
  const [day, setDay] = useState(initial ? String(initial.day) : "");
  const [month, setMonth] = useState(initial ? String(initial.month) : "");
  const [year, setYear] = useState(initial?.year ? String(initial.year) : "");
  const [tags, setTags] = useState(form.tags.join(", "));
  const [photoError, setPhotoError] = useState("");
  const [cropping, setCropping] = useState<File | string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<ContactInput>) => setForm((f) => ({ ...f, ...changes }));

  const birthday = (() => {
    if (!day && !month && !year) return { value: null, ok: true };
    if (!day || !month) return { value: null, ok: false };
    const y = year.trim() ? Number(year) : 2000;
    const valid = makeDay(y, Number(month), Number(day)) !== null && (!year.trim() || (Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear()));
    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");
    return { value: year.trim() ? `${y}-${mm}-${dd}` : `--${mm}-${dd}`, ok: valid };
  })();

  const phones = form.phones.filter((p) => p.value.trim());
  const emails = form.emails.filter((e) => e.value.trim());
  const errors = [
    !form.firstName.trim() && !form.lastName.trim() && !form.company.trim() ? tr("Nom ou société manquant.") : null,
    phones.some((p) => !PHONE.test(p.value.trim())) ? tr("Numéro de téléphone illisible.") : null,
    emails.some((e) => !EMAIL.test(e.value.trim())) ? tr("Adresse e-mail illisible.") : null,
    !birthday.ok ? tr("Date d'anniversaire incomplète ou impossible.") : null,
  ].filter((e): e is string => e !== null);
  const [tried, setTried] = useState(false);
  const touched = tried || form.firstName || form.lastName || form.company;

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    setPhotoError("");
    setCropping(file);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (errors.length > 0) {
      setTried(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const input: ContactInput = {
      ...form,
      phones: phones.map((p) => ({ ...p, value: p.value.trim() })),
      emails: emails.map((m) => ({ ...m, value: m.value.trim() })),
      birthday: birthday.value,
      tags: tags
        .split(/[\s,;]+/)
        .map((t) => t.replace(/^#+/, "").trim())
        .filter(Boolean),
    };
    let created: Contact | null = null;
    if (contact) await update(contact, input);
    else created = await create(input);
    setBusy(false);
    onClose(created ?? undefined);
  };

  return (
    <Dialog title={contact ? tr("Modifier le contact") : tr("Nouveau contact")} onClose={() => onClose()} className="dialog--contact">
      <form className="event-form contact-editor" onSubmit={(e) => void submit(e)} noValidate>
        <div className="contact-identity">
          <div className="contact-photo">
            <Avatar contact={form} size={76} />
            <div className="contact-photo-actions">
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                {form.photo ? tr("Changer la photo") : tr("Ajouter une photo")}
              </button>
              {form.photo && (
                <button type="button" className="link-btn" onClick={() => setCropping(form.photo)}>
                  {tr("Recadrer")}
                </button>
              )}
              {form.photo && (
                <button type="button" className="link-btn" onClick={() => set({ photo: null })}>
                  {tr("Retirer")}
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              hidden
              onChange={(e) => {
                choosePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {photoError && <p className="form-error">{photoError}</p>}
            {cropping && (
              <ImageCropper
                source={cropping}
                formats={PHOTO_FORMAT}
                round
                maxSide={320}
                maxChars={200_000}
                onDone={(data) => {
                  set({ photo: data });
                  setCropping(null);
                }}
                onCancel={() => setCropping(null)}
              />
            )}
          </div>
          <div className="contact-names">
            <div className="field">
              <label htmlFor={`${ids}-prenom`} className="field-label">
                {tr("Prénom")}
              </label>
              <div className="field-box">
                <input id={`${ids}-prenom`} className="field-input" value={form.firstName} maxLength={100} autoComplete="off" onChange={(e) => set({ firstName: e.target.value })} data-autofocus />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${ids}-nom`} className="field-label">
                {tr("Nom")}
              </label>
              <div className="field-box">
                <input id={`${ids}-nom`} className="field-input" value={form.lastName} maxLength={100} autoComplete="off" onChange={(e) => set({ lastName: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${ids}-societe`} className="field-label">
                {tr("Société")}
              </label>
              <div className="field-box">
                <input id={`${ids}-societe`} className="field-input" value={form.company} maxLength={150} autoComplete="off" onChange={(e) => set({ company: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <div className="ce-columns">
        <section className="ce-block" style={{ "--info-color": INFO_STYLE.phone.color } as CSSProperties} aria-labelledby={`${ids}-coordonnees`}>
          <h3 id={`${ids}-coordonnees`} className="ce-block-title">
            <span className="bento-icon" aria-hidden="true">
              <Icon d={symbolPath(INFO_STYLE.phone.symbol, ICONS.notes)} size={14} stroke={2.2} />
            </span>
            {tr("Coordonnées")}
          </h3>
        <EntriesField label={tr("Téléphones")} entries={form.phones} labels={PHONE_LABELS} type="tel" onChange={(phones) => set({ phones })} />
        <EntriesField label={tr("E-mails")} entries={form.emails} labels={EMAIL_LABELS} type="email" onChange={(emails) => set({ emails })} />

        <div className="field">
          <label htmlFor={`${ids}-adresse`} className="field-label">
            {tr("Adresse")}
          </label>
          <textarea id={`${ids}-adresse`} className="detail-notes" rows={2} maxLength={500} value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        </section>

        <section className="ce-block" style={{ "--info-color": INFO_STYLE.birthday.color } as CSSProperties} aria-labelledby={`${ids}-classement`}>
          <h3 id={`${ids}-classement`} className="ce-block-title">
            <span className="bento-icon" aria-hidden="true">
              <Icon d={symbolPath(INFO_STYLE.birthday.symbol, ICONS.calendar)} size={14} stroke={2.2} />
            </span>
            {tr("Anniversaire et classement")}
          </h3>
        <fieldset className="contact-birthday">
          <legend className="field-label">{tr("Anniversaire")}</legend>
          <Select value={day} options={DAY_OPTIONS} label={tr("Jour de l'anniversaire")} onChange={setDay} />
          <Select value={month} options={MONTH_OPTIONS} label={tr("Mois de l'anniversaire")} onChange={setMonth} />
          <div className="field-box contact-year">
            <input
              className="field-input"
              inputMode="numeric"
              maxLength={4}
              placeholder={tr("Année")}
              aria-label={tr("Année de naissance (facultative)")}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </fieldset>

        <div className="habit-grid">
          <div className="field contact-tags">
            <label htmlFor={`${ids}-etiquettes`} className="field-label">
              {tr("Étiquettes")}
            </label>
            <div className="field-box">
              <input id={`${ids}-etiquettes`} className="field-input" value={tags} placeholder={tr("famille, pro, artisan")} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          {groups.length > 0 && (
            <div className="habit-space">
              <span className="field-label">{tr("Catégorie")}</span>
              <Select
                value={form.groupId ?? ""}
                options={[{ value: "", label: tr("Aucune catégorie") }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                label={tr("Catégorie")}
                onChange={(v) => set({ groupId: v || null })}
              />
            </div>
          )}
          <div className="habit-space">
            <span className="field-label">{tr("Espace")}</span>
            <Select
              value={form.spaceId ?? ""}
              options={[{ value: "", label: tr("Aucun espace") }, ...spaces.map((s) => ({ value: s.id, label: s.name }))]}
              label={tr("Espace")}
              onChange={(v) => set({ spaceId: v || null })}
            />
          </div>
          <Checkbox checked={form.favorite} onChange={(favorite) => set({ favorite })} label={tr("Favori")} />
        </div>

        <fieldset className="picker">
            <legend className="field-label">{tr("Couleur de la carte")}</legend>
            <div className="picker-grid" role="radiogroup" aria-label={tr("Couleur de la carte")}>
              {TASK_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c.value}
                  aria-label={c.label}
                  title={c.label}
                  className="swatch-button"
                  style={{ background: c.value }}
                  onClick={() => set({ color: c.value })}
                >
                  {form.color === c.value && <Icon d={ICONS.check} size={14} stroke={3.4} />}
                </button>
              ))}
            </div>
          </fieldset>
        </section>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-notes`} className="field-label">
            {tr("Notes")}
          </label>
          <textarea id={`${ids}-notes`} className="detail-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>

        {touched && errors.length > 0 && <p className="form-error">{errors[0]}</p>}
        <div className="onb-actions">
          <button type="button" className="btn-glass" onClick={() => onClose()}>
            {tr("Annuler")}
          </button>
          <button type="submit" className="btn-gel" disabled={busy}>
            {contact ? tr("Enregistrer") : tr("Créer")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
