//! Contacts (cahier des charges § 4.12) : nom, société, téléphones, e-mails, adresse,
//! anniversaire (avec ou sans l'année), notes, étiquettes, photo, favori, espace, informations
//! libres (« Code d'entrée », « Pointure »…), style de la fiche (palette, motifs), catégorie ;
//! corbeille de 30 jours. Les anniversaires vont au calendrier et aux rappels, calculés par l'interface.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, clean_notes, clean_tags, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_CONTACTS: usize = 5000;
pub const MAX_NAME_CHARS: usize = 100;
pub const MAX_COMPANY_CHARS: usize = 150;
pub const MAX_ENTRIES: usize = 10;
pub const MAX_LABEL_CHARS: usize = 30;
pub const MAX_PHONE_CHARS: usize = 40;
pub const MAX_EMAIL_CHARS: usize = 200;
pub const MAX_ADDRESS_CHARS: usize = 500;
/// Photo réduite par l'interface (image JPEG, PNG ou WebP en « data: »).
pub const MAX_PHOTO_CHARS: usize = 200_000;
pub const MAX_FIELDS: usize = 20;
pub const MAX_FIELD_LABEL_CHARS: usize = 40;
pub const MAX_FIELD_VALUE_CHARS: usize = 500;
pub const MAX_GROUPS: usize = 30;
pub const MAX_GROUP_NAME_CHARS: usize = 40;

/// Palettes des bulles d'informations, motifs de la bannière et des bulles (src/contacts/cardStyles.ts).
pub const PALETTES: [&str; 27] = [
    "arc-en-ciel",
    "ton-sur-ton",
    "ocean",
    "foret",
    "coucher-de-soleil",
    "pastel",
    "nuit",
    "agrumes",
    "classique",
    "lagon",
    "aurore",
    "sakura",
    "lavande",
    "corail",
    "menthe",
    "framboise",
    "cafe-creme",
    "ardoise",
    "tropiques",
    "glacier",
    "galaxie",
    "dunes",
    "cerise",
    "emeraude",
    "miel",
    "orage",
    "bonbon",
];
pub const BANNERS: [&str; 12] = ["vagues", "bulles", "pois", "rayures", "etoiles", "feuillage", "confettis", "coeurs", "losanges", "nuages", "cercles", "uni"];
pub const TILE_PATTERNS: [&str; 5] = ["filigrane", "pois", "lignes", "vague", "uni"];

/// Style de la fiche : palette des bulles, motif de la bannière, motif des bulles.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactStyle {
    pub palette: String,
    pub banner: String,
    pub tiles: String,
}

/// Catégorie de contacts (« Voisins », « Club de tennis »…).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactGroup {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ContactGroupInput {
    pub name: String,
    pub color: Option<String>,
    pub icon: Option<String>,
}

/// Téléphone ou e-mail, avec son libellé (« Mobile », « Travail »…).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    #[serde(default)]
    pub label: String,
    pub value: String,
}

/// Information libre de la fiche : intitulé, valeur, symbole et couleur de sa bulle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    #[serde(default)]
    pub label: String,
    pub value: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub company: String,
    pub phones: Vec<Entry>,
    pub emails: Vec<Entry>,
    pub address: String,
    /// « AAAA-MM-JJ », ou « --MM-JJ » sans l'année.
    pub birthday: Option<String>,
    pub notes: String,
    pub tags: Vec<String>,
    pub photo: Option<String>,
    pub color: Option<String>,
    pub favorite: bool,
    pub space_id: Option<String>,
    pub fields: Vec<Field>,
    pub group_id: Option<String>,
    pub style: Option<ContactStyle>,
    pub created_at: i64,
    pub updated_at: i64,
    /// « Rester en contact » : tous les combien de jours (7, 14, 30, 90, 180 ou 365).
    pub keep_in_touch: Option<u32>,
    /// Dernier échange noté (« AAAA-MM-JJ »), tiré des échanges.
    pub last_contact: Option<String>,
}

/// Fréquences proposées pour « Rester en contact », en jours.
pub const KEEP_IN_TOUCH: [u32; 6] = [7, 14, 30, 90, 180, 365];
/// Sortes d'échanges.
pub const INTERACTION_KINDS: [&str; 5] = ["appel", "message", "rencontre", "email", "autre"];
pub const MAX_INTERACTION_NOTE_CHARS: usize = 1000;
/// Échanges gardés par contact.
pub const MAX_INTERACTIONS: usize = 2000;

/// Échange avec un contact : appel, message, rencontre…
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interaction {
    pub id: String,
    pub contact_id: String,
    pub day: String,
    pub kind: String,
    pub note: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct InteractionInput {
    pub day: String,
    pub kind: String,
    pub note: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ContactInput {
    pub first_name: String,
    pub last_name: String,
    pub company: String,
    pub phones: Vec<Entry>,
    pub emails: Vec<Entry>,
    pub address: String,
    pub birthday: Option<String>,
    pub notes: String,
    pub tags: Vec<String>,
    pub photo: Option<String>,
    pub color: Option<String>,
    pub favorite: bool,
    pub space_id: Option<String>,
    pub fields: Vec<Field>,
    pub group_id: Option<String>,
    pub style: Option<ContactStyle>,
    pub keep_in_touch: Option<u32>,
}

fn optional_line(text: &str, max: usize, field: &str) -> Result<String, DataError> {
    if text.trim().is_empty() {
        Ok(String::new())
    } else {
        clean_line(text, max, field)
    }
}

/// Anniversaire : date complète, ou jour et mois seuls (« --MM-JJ », le 29 février compris).
pub fn is_valid_birthday(text: &str) -> bool {
    match text.strip_prefix("--") {
        Some(rest) => is_valid_date(&format!("2000-{rest}")),
        None => is_valid_date(text),
    }
}

fn clean_entries(entries: &[Entry], max_chars: usize, field: &str, valid: impl Fn(&str) -> bool) -> Result<Vec<Entry>, DataError> {
    if entries.len() > MAX_ENTRIES {
        return Err(invalid(field));
    }
    let mut cleaned = Vec::new();
    for e in entries {
        if e.value.trim().is_empty() {
            continue;
        }
        let value = clean_line(&e.value, max_chars, field)?;
        if !valid(&value) {
            return Err(invalid(field));
        }
        cleaned.push(Entry { label: optional_line(&e.label, MAX_LABEL_CHARS, field)?, value });
    }
    Ok(cleaned)
}

/// Informations libres : une valeur chacune (les vides sont retirées), un intitulé, un symbole
/// et une couleur connus.
fn clean_fields(fields: &[Field]) -> Result<Vec<Field>, DataError> {
    if fields.len() > MAX_FIELDS {
        return Err(invalid("fields"));
    }
    let mut cleaned = Vec::new();
    for f in fields {
        if f.value.trim().is_empty() {
            continue;
        }
        cleaned.push(Field {
            label: optional_line(&f.label, MAX_FIELD_LABEL_CHARS, "fields")?,
            value: clean_line(&f.value, MAX_FIELD_VALUE_CHARS, "fields")?,
            icon: f.icon.as_deref().map(|i| check_symbol(i, "fields")).transpose()?,
            color: f.color.as_deref().map(clean_color).transpose()?,
        });
    }
    Ok(cleaned)
}

fn clean_style(style: &ContactStyle) -> Result<ContactStyle, DataError> {
    if !PALETTES.contains(&style.palette.as_str()) || !BANNERS.contains(&style.banner.as_str()) || !TILE_PATTERNS.contains(&style.tiles.as_str()) {
        return Err(invalid("style"));
    }
    Ok(style.clone())
}

fn group_exists(conn: &Connection, id: &str) -> Result<bool, DataError> {
    Ok(conn.query_row("SELECT 1 FROM contact_groups WHERE id = ?1", params![id], |_| Ok(())).optional()?.is_some())
}

fn is_phone(value: &str) -> bool {
    value.chars().any(|c| c.is_ascii_digit()) && value.chars().all(|c| c.is_ascii_digit() || " +-.()/".contains(c))
}

fn is_email(value: &str) -> bool {
    let mut parts = value.split('@');
    let (Some(user), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else { return false };
    !user.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.') && !value.contains(char::is_whitespace)
}

fn is_photo(value: &str) -> bool {
    let Some(data) = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"].iter().find_map(|p| value.strip_prefix(p)) else {
        return false;
    };
    value.len() <= MAX_PHOTO_CHARS && !data.is_empty() && data.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c))
}

fn clean_input(conn: &Connection, input: &ContactInput, current_space: Option<&str>) -> Result<ContactInput, DataError> {
    let first_name = optional_line(&input.first_name, MAX_NAME_CHARS, "firstName")?;
    let last_name = optional_line(&input.last_name, MAX_NAME_CHARS, "lastName")?;
    let company = optional_line(&input.company, MAX_COMPANY_CHARS, "company")?;
    if first_name.is_empty() && last_name.is_empty() && company.is_empty() {
        return Err(invalid("name"));
    }
    let address = input.address.replace("\r\n", "\n").trim().to_string();
    if address.chars().count() > MAX_ADDRESS_CHARS || address.chars().any(|c| c.is_control() && c != '\n') {
        return Err(invalid("address"));
    }
    if input.birthday.as_deref().is_some_and(|b| !is_valid_birthday(b)) {
        return Err(invalid("birthday"));
    }
    if input.photo.as_deref().is_some_and(|p| !is_photo(p)) {
        return Err(invalid("photo"));
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(ContactInput {
        first_name,
        last_name,
        company,
        phones: clean_entries(&input.phones, MAX_PHONE_CHARS, "phones", is_phone)?,
        emails: clean_entries(&input.emails, MAX_EMAIL_CHARS, "emails", is_email)?,
        address,
        birthday: input.birthday.clone(),
        notes: clean_notes(&input.notes)?,
        tags: clean_tags(&input.tags)?,
        photo: input.photo.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        favorite: input.favorite,
        space_id: input.space_id.clone(),
        fields: clean_fields(&input.fields)?,
        group_id: match &input.group_id {
            Some(g) if group_exists(conn, g)? => Some(g.clone()),
            Some(_) => return Err(invalid("group")),
            None => None,
        },
        style: input.style.as_ref().map(clean_style).transpose()?,
        keep_in_touch: match input.keep_in_touch {
            Some(days) if !KEEP_IN_TOUCH.contains(&days) => return Err(invalid("keepInTouch")),
            other => other,
        },
    })
}

const COLUMNS: &str = "id, first_name, last_name, company, phones, emails, address, birthday, notes, tags, photo, color, favorite, space_id, \
                       created_at, updated_at, fields, group_id, style, keep_in_touch, \
                       (SELECT MAX(day) FROM contact_interactions i WHERE i.contact_id = contacts.id)";

fn from_row(row: &Row) -> rusqlite::Result<Contact> {
    let phones: String = row.get(4)?;
    let emails: String = row.get(5)?;
    let tags: String = row.get(9)?;
    let fields: String = row.get(16)?;
    let style: Option<String> = row.get(18)?;
    Ok(Contact {
        id: row.get(0)?,
        first_name: row.get(1)?,
        last_name: row.get(2)?,
        company: row.get(3)?,
        phones: serde_json::from_str(&phones).unwrap_or_default(),
        emails: serde_json::from_str(&emails).unwrap_or_default(),
        address: row.get(6)?,
        birthday: row.get(7)?,
        notes: row.get(8)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        photo: row.get(10)?,
        color: row.get(11)?,
        favorite: row.get(12)?,
        space_id: row.get(13)?,
        fields: serde_json::from_str(&fields).unwrap_or_default(),
        group_id: row.get(17)?,
        style: style.and_then(|s| serde_json::from_str(&s).ok()),
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        keep_in_touch: row.get(19)?,
        last_contact: row.get(20)?,
    })
}

fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".into())
}

pub fn get(conn: &Connection, id: &str) -> Result<Contact, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM contacts WHERE id = ?1 AND deleted_at IS NULL"), params![id], from_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Contacts. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Contact>, DataError> {
    conn.execute("DELETE FROM contacts WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![now as i64 - TRASH_SECONDS])?;
    conn.execute("DELETE FROM contact_interactions WHERE contact_id NOT IN (SELECT id FROM contacts)", [])?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM contacts WHERE deleted_at IS NULL ORDER BY created_at, id"))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &ContactInput, now: u64) -> Result<Contact, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_CONTACTS {
        return Err(DataError::TooMany { max: MAX_CONTACTS });
    }
    let c = clean_input(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO contacts (id, first_name, last_name, company, phones, emails, address, birthday, notes, tags, photo,
                               color, favorite, space_id, created_at, updated_at, fields, group_id, style, keep_in_touch)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16, ?17, ?18, ?19)",
        params![
            id,
            c.first_name,
            c.last_name,
            c.company,
            json(&c.phones),
            json(&c.emails),
            c.address,
            c.birthday,
            c.notes,
            json(&c.tags),
            c.photo,
            c.color,
            c.favorite,
            c.space_id,
            now as i64,
            json(&c.fields),
            c.group_id,
            c.style.as_ref().map(json),
            c.keep_in_touch
        ],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, input: &ContactInput, now: u64) -> Result<Contact, DataError> {
    let current = get(conn, id)?;
    let c = clean_input(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE contacts SET first_name = ?2, last_name = ?3, company = ?4, phones = ?5, emails = ?6, address = ?7,
                             birthday = ?8, notes = ?9, tags = ?10, photo = ?11, color = ?12, favorite = ?13,
                             space_id = ?14, updated_at = ?15, fields = ?16, group_id = ?17, style = ?18, keep_in_touch = ?19
         WHERE id = ?1",
        params![
            id,
            c.first_name,
            c.last_name,
            c.company,
            json(&c.phones),
            json(&c.emails),
            c.address,
            c.birthday,
            c.notes,
            json(&c.tags),
            c.photo,
            c.color,
            c.favorite,
            c.space_id,
            now as i64,
            json(&c.fields),
            c.group_id,
            c.style.as_ref().map(json),
            c.keep_in_touch
        ],
    )?;
    get(conn, id)
}

// ——— Échanges ———

/// Échanges d'un contact, du plus récent au plus ancien.
pub fn interactions(conn: &Connection, contact_id: &str) -> Result<Vec<Interaction>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, contact_id, day, kind, note, created_at FROM contact_interactions WHERE contact_id = ?1 ORDER BY day DESC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![contact_id], |r| {
        Ok(Interaction { id: r.get(0)?, contact_id: r.get(1)?, day: r.get(2)?, kind: r.get(3)?, note: r.get(4)?, created_at: r.get(5)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Note un échange ; renvoie le contact (dernier échange à jour).
pub fn add_interaction(conn: &Connection, contact_id: &str, input: &InteractionInput, now: u64) -> Result<Contact, DataError> {
    get(conn, contact_id)?;
    if !super::tasks::is_valid_date(&input.day) {
        return Err(invalid("day"));
    }
    if !INTERACTION_KINDS.contains(&input.kind.as_str()) {
        return Err(invalid("kind"));
    }
    let note = clean_notes(&input.note)?;
    if note.chars().count() > MAX_INTERACTION_NOTE_CHARS {
        return Err(invalid("note"));
    }
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM contact_interactions WHERE contact_id = ?1", params![contact_id], |r| r.get(0))?;
    if count as usize >= MAX_INTERACTIONS {
        return Err(DataError::TooMany { max: MAX_INTERACTIONS });
    }
    conn.execute(
        "INSERT INTO contact_interactions (id, contact_id, day, kind, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![tasks::random_id()?, contact_id, input.day, input.kind, note, now as i64],
    )?;
    get(conn, contact_id)
}

/// Retire un échange ; renvoie le contact.
pub fn delete_interaction(conn: &Connection, id: &str) -> Result<Contact, DataError> {
    let contact_id: String = conn
        .query_row("SELECT contact_id FROM contact_interactions WHERE id = ?1", params![id], |r| r.get(0))
        .optional()?
        .ok_or(DataError::NotFound)?;
    conn.execute("DELETE FROM contact_interactions WHERE id = ?1", params![id])?;
    get(conn, &contact_id)
}

// ——— Catégories ———

fn group_row(row: &Row) -> rusqlite::Result<ContactGroup> {
    Ok(ContactGroup { id: row.get(0)?, name: row.get(1)?, color: row.get(2)?, icon: row.get(3)?, position: row.get(4)? })
}

fn get_group(conn: &Connection, id: &str) -> Result<ContactGroup, DataError> {
    conn.query_row("SELECT id, name, color, icon, position FROM contact_groups WHERE id = ?1", params![id], group_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

pub fn groups(conn: &Connection) -> Result<Vec<ContactGroup>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, color, icon, position FROM contact_groups ORDER BY position, created_at")?;
    let rows = stmt.query_map([], group_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_group(conn: &Connection, input: &ContactGroupInput, id: Option<&str>) -> Result<ContactGroupInput, DataError> {
    let name = clean_line(&input.name, MAX_GROUP_NAME_CHARS, "name")?;
    let taken: Option<String> = conn.query_row("SELECT id FROM contact_groups WHERE lower(name) = lower(?1)", params![name], |r| r.get(0)).optional()?;
    if taken.is_some_and(|other| Some(other.as_str()) != id) {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    Ok(ContactGroupInput {
        name,
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: input.icon.as_deref().map(|i| check_symbol(i, "icon")).transpose()?,
    })
}

pub fn create_group(conn: &Connection, input: &ContactGroupInput, now: u64) -> Result<ContactGroup, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM contact_groups", [], |r| r.get(0))?;
    if count as usize >= MAX_GROUPS {
        return Err(DataError::TooMany { max: MAX_GROUPS });
    }
    let g = clean_group(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO contact_groups (id, name, color, icon, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, g.name, g.color, g.icon, count, now as i64],
    )?;
    get_group(conn, &id)
}

pub fn update_group(conn: &Connection, id: &str, input: &ContactGroupInput) -> Result<ContactGroup, DataError> {
    get_group(conn, id)?;
    let g = clean_group(conn, input, Some(id))?;
    conn.execute("UPDATE contact_groups SET name = ?2, color = ?3, icon = ?4 WHERE id = ?1", params![id, g.name, g.color, g.icon])?;
    get_group(conn, id)
}

/// Retire une catégorie : ses contacts restent, sans catégorie.
pub fn delete_group(conn: &Connection, id: &str) -> Result<(), DataError> {
    get_group(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE contacts SET group_id = NULL WHERE group_id = ?1", params![id])?;
    tx.execute("DELETE FROM contact_groups WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE contacts SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Contact, DataError> {
    let changed = conn.execute(
        "UPDATE contacts SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now as i64],
    )?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn entry(label: &str, value: &str) -> Entry {
        Entry { label: label.into(), value: value.into() }
    }

    #[test]
    fn les_categories_rangent_les_contacts_et_le_style_est_verifie() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let group = |name: &str| ContactGroupInput { name: name.into(), color: Some("#2fae4a".into()), icon: Some("personne".into()) };
        let voisins = create_group(c, &group(" Voisins "), NOW).unwrap();
        assert_eq!(voisins.name, "Voisins");
        assert!(matches!(create_group(c, &group("voisins"), NOW), Err(DataError::Duplicate { .. })));
        let style = ContactStyle { palette: "ocean".into(), banner: "pois".into(), tiles: "lignes".into() };
        let lea = create(c, &ContactInput { first_name: "Léa".into(), group_id: Some(voisins.id.clone()), style: Some(style.clone()), ..Default::default() }, NOW).unwrap();
        assert_eq!(lea.group_id.as_deref(), Some(voisins.id.as_str()));
        assert_eq!(lea.style, Some(style));
        let bad = ContactStyle { palette: "inconnue".into(), banner: "pois".into(), tiles: "lignes".into() };
        assert!(create(c, &ContactInput { first_name: "Paul".into(), style: Some(bad), ..Default::default() }, NOW).is_err());
        assert!(create(c, &ContactInput { first_name: "Paul".into(), group_id: Some("absent".into()), ..Default::default() }, NOW).is_err());
        update_group(c, &voisins.id, &group("Voisins du 3e")).unwrap();
        assert_eq!(groups(c).unwrap()[0].name, "Voisins du 3e");
        delete_group(c, &voisins.id).unwrap();
        assert!(groups(c).unwrap().is_empty());
        assert_eq!(get(c, &lea.id).unwrap().group_id, None, "le contact reste, sans catégorie");
    }

    #[test]
    fn les_informations_libres_sont_verifiees_et_gardees() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let field = |label: &str, value: &str, icon: Option<&str>| Field { label: label.into(), value: value.into(), icon: icon.map(Into::into), color: Some("#2fae4a".into()) };
        let input = ContactInput {
            first_name: "Léa".into(),
            fields: vec![field("Code d'entrée", "4589", Some("cle")), field("Vide", "  ", None), field("", "Pointure 38", None)],
            ..Default::default()
        };
        let lea = create(c, &input, NOW).unwrap();
        assert_eq!(lea.fields.len(), 2, "une information sans valeur est retirée");
        assert_eq!(lea.fields[0].icon.as_deref(), Some("cle"));
        assert_eq!(get(c, &lea.id).unwrap().fields, lea.fields);
        let bad = ContactInput { first_name: "Léa".into(), fields: vec![field("Code", "1", Some("inconnu"))], ..Default::default() };
        assert!(create(c, &bad, NOW).is_err(), "symbole inconnu refusé");
        let many = ContactInput { first_name: "Léa".into(), fields: vec![field("A", "1", None); MAX_FIELDS + 1], ..Default::default() };
        assert!(create(c, &many, NOW).is_err());
    }

    #[test]
    fn une_fiche_se_cree_avec_ses_coordonnees_verifiees() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let input = ContactInput {
            first_name: " Camille ".into(),
            last_name: "Martin".into(),
            phones: vec![entry("Mobile", "06 12 34 56 78"), entry("", "  ")],
            emails: vec![entry("Perso", "camille@example.fr")],
            address: "12 rue des Lilas\r\n75011 Paris".into(),
            birthday: Some("--02-29".into()),
            tags: vec!["famille".into()],
            space_id: Some("perso".into()),
            photo: Some("data:image/jpeg;base64,AAAA".into()),
            ..Default::default()
        };
        let contact = create(c, &input, NOW).unwrap();
        assert_eq!(contact.first_name, "Camille");
        assert_eq!(contact.phones, vec![entry("Mobile", "06 12 34 56 78")], "les lignes vides sont retirées");
        assert_eq!(contact.address, "12 rue des Lilas\n75011 Paris");

        let refused = |changes: ContactInput| create(c, &changes, NOW).unwrap_err();
        assert_eq!(refused(ContactInput::default()), invalid("name"));
        assert_eq!(refused(ContactInput { phones: vec![entry("", "appeler")], ..input.clone() }), invalid("phones"));
        assert_eq!(refused(ContactInput { emails: vec![entry("", "camille@")], ..input.clone() }), invalid("emails"));
        assert_eq!(refused(ContactInput { birthday: Some("--02-30".into()), ..input.clone() }), invalid("birthday"));
        assert_eq!(refused(ContactInput { photo: Some("javascript:alert(1)".into()), ..input.clone() }), invalid("photo"));
        assert!(create(c, &ContactInput { company: "Garage Dupont".into(), ..Default::default() }, NOW).is_ok(), "une société seule suffit");

        let favorite = update(c, &contact.id, &ContactInput { favorite: true, birthday: Some("1990-05-14".into()), ..input }, NOW + 1).unwrap();
        assert!(favorite.favorite);
        delete(c, &contact.id, NOW + 2).unwrap();
        assert_eq!(list(c, NOW + 2).unwrap().len(), 1);
        restore(c, &contact.id, NOW + 3).unwrap();
        assert_eq!(list(c, NOW + 3).unwrap().len(), 2);
    }

    #[test]
    fn rester_en_contact_et_echanges() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let lea = create(c, &ContactInput { first_name: "Léa".into(), keep_in_touch: Some(30), ..Default::default() }, NOW).unwrap();
        assert_eq!(lea.keep_in_touch, Some(30));
        assert_eq!(lea.last_contact, None);
        let call = InteractionInput { day: "2026-09-20".into(), kind: "appel".into(), note: "Nouvelles du travail".into() };
        assert_eq!(add_interaction(c, &lea.id, &call, NOW).unwrap().last_contact.as_deref(), Some("2026-09-20"));
        let older = InteractionInput { day: "2026-08-01".into(), kind: "rencontre".into(), note: String::new() };
        assert_eq!(add_interaction(c, &lea.id, &older, NOW).unwrap().last_contact.as_deref(), Some("2026-09-20"));
        let list = interactions(c, &lea.id).unwrap();
        assert_eq!(list.iter().map(|i| i.day.as_str()).collect::<Vec<_>>(), ["2026-09-20", "2026-08-01"]);
        assert_eq!(delete_interaction(c, &list[0].id).unwrap().last_contact.as_deref(), Some("2026-08-01"));
        // Valeurs refusées.
        assert!(add_interaction(c, &lea.id, &InteractionInput { kind: "pigeon".into(), ..call.clone() }, NOW).is_err());
        assert!(create(c, &ContactInput { first_name: "Paul".into(), keep_in_touch: Some(10), ..Default::default() }, NOW).is_err());
        assert_eq!(delete_interaction(c, "absent"), Err(DataError::NotFound));
    }

}
