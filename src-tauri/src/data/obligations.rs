//! Obligations (cahier des charges § 4.4) : échéances administratives et contractuelles
//! (impôts, factures, abonnements, assurances…) : organisme, référence, montant,
//! périodicité, échéance, date limite de résiliation, statut ; corbeille de 30 jours.
//!
//! Une obligation périodique payée passe à l'échéance suivante, au même jour du mois
//! (le dernier jour si le mois est plus court) ; une obligation ponctuelle devient « payée ».
//! Chaque paiement est gardé (historique). Une obligation en prélèvement automatique se paie
//! d'elle-même à son échéance (`autopay`).

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::recurrence::{days_in_month, Day};
use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{clean_line, clean_notes, invalid, is_valid_date, random_id, space_exists, MAX_TITLE_CHARS, TRASH_SECONDS};
use super::DataError;

/// Catégories du cahier des charges.
pub const CATEGORIES: [&str; 10] =
    ["impots", "factures", "abonnements", "assurances", "contrats", "garanties", "identite", "sante", "vehicule", "logement"];
/// À faire, payée, résiliée.
pub const STATUSES: [&str; 3] = ["a-faire", "paye", "resilie"];
/// Périodicités proposées, en mois (mensuelle à annuelle).
pub const PERIODS: [u32; 5] = [1, 2, 3, 6, 12];
/// Montant : 100 millions d'euros au plus, en centimes.
pub const MAX_AMOUNT_CENTS: i64 = 10_000_000_000;
pub const MAX_ORGANIZATION_CHARS: usize = 200;
pub const MAX_REFERENCE_CHARS: usize = 100;
/// Nom d'une catégorie renommée.
pub const MAX_CATEGORY_LABEL_CHARS: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Obligation {
    pub id: String,
    pub title: String,
    pub category: String,
    pub organization: String,
    pub reference: String,
    pub amount_cents: Option<i64>,
    /// Tous les combien de mois ; ponctuelle si absente.
    pub period_months: Option<u32>,
    pub due_date: String,
    /// Jour du mois des échéances (le dernier jour si le mois est plus court).
    pub anchor_day: u32,
    /// Date limite de résiliation (reconduction tacite).
    pub cancel_by: Option<String>,
    pub status: String,
    pub space_id: Option<String>,
    /// Couleur choisie (« #rrggbb »), sinon celle de la catégorie.
    pub color: Option<String>,
    pub notes: String,
    /// Dernier paiement enregistré (« Payé »).
    pub last_paid_on: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Prélèvement automatique : payée d'elle-même à son échéance.
    pub auto_pay: bool,
}

/// Paiement enregistré d'une obligation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: i64,
    pub obligation_id: String,
    /// Échéance réglée.
    pub due_date: String,
    /// Jour du paiement (l'échéance, pour un prélèvement automatique).
    pub paid_on: String,
    pub amount_cents: Option<i64>,
    /// Prélèvement automatique.
    pub auto: bool,
}

/// Champs modifiables d'une obligation, envoyés par l'interface.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObligationInput {
    pub title: String,
    pub category: String,
    #[serde(default)]
    pub organization: String,
    #[serde(default)]
    pub reference: String,
    #[serde(default)]
    pub amount_cents: Option<i64>,
    #[serde(default)]
    pub period_months: Option<u32>,
    pub due_date: String,
    #[serde(default)]
    pub cancel_by: Option<String>,
    pub status: String,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub auto_pay: bool,
}

fn date(text: &str, field: &str) -> Result<Day, DataError> {
    Day::parse(text).filter(|_| is_valid_date(text)).ok_or_else(|| invalid(field))
}

fn optional_line(text: &str, max: usize, field: &str) -> Result<String, DataError> {
    if text.trim().is_empty() {
        Ok(String::new())
    } else {
        clean_line(text, max, field)
    }
}

/// Vérifie et nettoie tous les champs. `current_space` : espace actuel, gardé même s'il a
/// été supprimé depuis.
fn clean_input(conn: &Connection, input: &ObligationInput, current_space: Option<&str>) -> Result<ObligationInput, DataError> {
    let title = clean_line(&input.title, MAX_TITLE_CHARS, "title")?;
    if !CATEGORIES.contains(&input.category.as_str()) {
        return Err(invalid("category"));
    }
    if !STATUSES.contains(&input.status.as_str()) {
        return Err(invalid("status"));
    }
    if input.amount_cents.is_some_and(|a| !(0..=MAX_AMOUNT_CENTS).contains(&a)) {
        return Err(invalid("amount"));
    }
    if input.period_months.is_some_and(|p| !PERIODS.contains(&p)) {
        return Err(invalid("period"));
    }
    let due = date(&input.due_date, "dueDate")?;
    let cancel_by = match &input.cancel_by {
        Some(text) => {
            let day = date(text, "cancelBy")?;
            if day > due {
                return Err(invalid("cancelBy"));
            }
            Some(day.format())
        }
        None => None,
    };
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    Ok(ObligationInput {
        title,
        category: input.category.clone(),
        organization: optional_line(&input.organization, MAX_ORGANIZATION_CHARS, "organization")?,
        reference: optional_line(&input.reference, MAX_REFERENCE_CHARS, "reference")?,
        amount_cents: input.amount_cents,
        period_months: input.period_months,
        due_date: due.format(),
        cancel_by,
        status: input.status.clone(),
        space_id: input.space_id.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        notes: clean_notes(&input.notes)?,
        auto_pay: input.auto_pay,
    })
}

/// `months` mois plus tard, au jour `anchor` (le dernier jour si le mois est plus court).
pub fn add_months(day: Day, months: u32, anchor: u32) -> Day {
    let index = day.year * 12 + i64::from(day.month) - 1 + i64::from(months);
    let year = index.div_euclid(12);
    let month = index.rem_euclid(12) as u32 + 1;
    Day { year, month, day: anchor.min(days_in_month(year, month)) }
}

const COLUMNS: &str = "id, title, category, organization, reference, amount_cents, period_months, due_date, cancel_by, \
                       status, space_id, color, notes, last_paid_on, created_at, updated_at, anchor_day, auto_pay";

fn from_row(row: &Row) -> rusqlite::Result<Obligation> {
    Ok(Obligation {
        id: row.get(0)?,
        title: row.get(1)?,
        category: row.get(2)?,
        organization: row.get(3)?,
        reference: row.get(4)?,
        amount_cents: row.get(5)?,
        period_months: row.get(6)?,
        due_date: row.get(7)?,
        cancel_by: row.get(8)?,
        status: row.get(9)?,
        space_id: row.get(10)?,
        color: row.get(11)?,
        notes: row.get(12)?,
        last_paid_on: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        anchor_day: row.get(16)?,
        auto_pay: row.get(17)?,
    })
}

/// Obligation hors corbeille.
pub fn get(conn: &Connection, id: &str) -> Result<Obligation, DataError> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM obligations WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        from_row,
    )
    .optional()?
    .ok_or(DataError::NotFound)
}

/// Toutes les obligations. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Obligation>, DataError> {
    conn.execute(
        "DELETE FROM obligations WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
        params![now as i64 - TRASH_SECONDS],
    )?;
    conn.execute("DELETE FROM obligation_payments WHERE obligation_id NOT IN (SELECT id FROM obligations)", [])?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM obligations WHERE deleted_at IS NULL ORDER BY due_date, id"
    ))?;
    let rows = stmt.query_map([], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &ObligationInput, now: u64) -> Result<Obligation, DataError> {
    let o = clean_input(conn, input, None)?;
    let id = random_id()?;
    let anchor = Day::parse(&o.due_date).map_or(1, |d| d.day);
    conn.execute(
        "INSERT INTO obligations (id, title, category, organization, reference, amount_cents, period_months, due_date,
                                  anchor_day, cancel_by, status, space_id, color, notes, created_at, updated_at, auto_pay)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16)",
        params![
            id,
            o.title,
            o.category,
            o.organization,
            o.reference,
            o.amount_cents,
            o.period_months,
            o.due_date,
            anchor,
            o.cancel_by,
            o.status,
            o.space_id,
            o.color,
            o.notes,
            now as i64,
            o.auto_pay
        ],
    )?;
    get(conn, &id)
}

/// Remplace tous les champs modifiables. Une nouvelle échéance donne le jour du mois des
/// échéances suivantes.
pub fn update(conn: &Connection, id: &str, input: &ObligationInput, now: u64) -> Result<Obligation, DataError> {
    let current = get(conn, id)?;
    let o = clean_input(conn, input, current.space_id.as_deref())?;
    conn.execute(
        "UPDATE obligations SET title = ?2, category = ?3, organization = ?4, reference = ?5, amount_cents = ?6,
                                period_months = ?7, cancel_by = ?9, status = ?10, space_id = ?11, color = ?12,
                                notes = ?13, updated_at = ?14, auto_pay = ?16,
                                anchor_day = CASE WHEN due_date = ?8 THEN anchor_day ELSE ?15 END,
                                due_date = ?8
         WHERE id = ?1",
        params![
            id,
            o.title,
            o.category,
            o.organization,
            o.reference,
            o.amount_cents,
            o.period_months,
            o.due_date,
            o.cancel_by,
            o.status,
            o.space_id,
            o.color,
            o.notes,
            now as i64,
            Day::parse(&o.due_date).map_or(1, |d| d.day),
            o.auto_pay
        ],
    )?;
    get(conn, id)
}

/// « Payé » : l'échéance suivante pour une obligation périodique (la date limite de
/// résiliation suit), sinon le statut « payée ». Une obligation résiliée ne se paie plus.
pub fn pay(conn: &Connection, id: &str, today: Day, now: u64) -> Result<Obligation, DataError> {
    settle(conn, id, today, now, false)
}

/// Règle l'échéance en cours et garde le paiement dans l'historique.
fn settle(conn: &Connection, id: &str, today: Day, now: u64, auto: bool) -> Result<Obligation, DataError> {
    let current = get(conn, id)?;
    if current.status == "resilie" {
        return Err(invalid("status"));
    }
    conn.execute(
        "INSERT INTO obligation_payments (obligation_id, due_date, paid_on, amount_cents, auto) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, current.due_date, today.format(), current.amount_cents, auto],
    )?;
    match current.period_months {
        Some(months) => {
            let anchor: u32 = conn.query_row("SELECT anchor_day FROM obligations WHERE id = ?1", params![id], |r| r.get(0))?;
            let due = date(&current.due_date, "dueDate")?;
            let next = add_months(due, months, anchor);
            let cancel_by = current.cancel_by.as_deref().and_then(Day::parse).map(|day| add_months(day, months, day.day).format());
            conn.execute(
                "UPDATE obligations SET due_date = ?2, cancel_by = ?3, status = 'a-faire', last_paid_on = ?4,
                                        updated_at = ?5
                 WHERE id = ?1",
                params![id, next.format(), cancel_by, today.format(), now as i64],
            )?;
        }
        None => {
            conn.execute(
                "UPDATE obligations SET status = 'paye', last_paid_on = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, today.format(), now as i64],
            )?;
        }
    }
    get(conn, id)
}

/// Prélèvements automatiques : les échéances arrivées jusqu'à `today` (compris) sont payées,
/// chacune à sa date. Renvoie les obligations changées.
pub fn autopay(conn: &Connection, today: Day, now: u64) -> Result<Vec<Obligation>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id FROM obligations WHERE deleted_at IS NULL AND auto_pay = 1 AND status = 'a-faire' AND due_date <= ?1 ORDER BY due_date",
    )?;
    let ids: Vec<String> = stmt.query_map(params![today.format()], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut changed = Vec::new();
    for id in ids {
        let mut o = get(conn, &id)?;
        // Dix ans d'échéances mensuelles au plus d'un coup.
        for _ in 0..120 {
            let Some(due) = Day::parse(&o.due_date).filter(|d| o.status == "a-faire" && *d <= today) else {
                break;
            };
            o = settle(conn, &id, due, now, true)?;
        }
        changed.push(o);
    }
    Ok(changed)
}

/// Paiements d'une obligation, du plus récent au plus ancien.
pub fn payments(conn: &Connection, id: &str) -> Result<Vec<Payment>, DataError> {
    let mut stmt = conn.prepare(
        "SELECT id, obligation_id, due_date, paid_on, amount_cents, auto FROM obligation_payments
         WHERE obligation_id = ?1 ORDER BY paid_on DESC, id DESC LIMIT 240",
    )?;
    let rows = stmt.query_map(params![id], |r| {
        Ok(Payment { id: r.get(0)?, obligation_id: r.get(1)?, due_date: r.get(2)?, paid_on: r.get(3)?, amount_cents: r.get(4)?, auto: r.get(5)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Retire le dernier paiement enregistré (« Annuler » après « Payé »).
pub fn forget_last_payment(conn: &Connection, id: &str) -> Result<(), DataError> {
    conn.execute("DELETE FROM obligation_payments WHERE id = (SELECT MAX(id) FROM obligation_payments WHERE obligation_id = ?1)", params![id])?;
    Ok(())
}

/// Met l'obligation à la corbeille (restaurable pendant 30 jours).
pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE obligations SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

/// Sort l'obligation de la corbeille (bouton « Annuler »).
pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Obligation, DataError> {
    let changed = conn.execute(
        "UPDATE obligations SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
        params![id, now as i64],
    )?;
    if changed == 0 {
        return Err(DataError::NotFound);
    }
    get(conn, id)
}

/// Catégorie renommée, recolorée ou dotée d'un autre symbole ; les champs absents gardent
/// l'origine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCustom {
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

/// Catégories personnalisées (les autres gardent leur nom et leur couleur d'origine).
pub fn categories(conn: &Connection) -> Result<Vec<CategoryCustom>, DataError> {
    let mut stmt = conn.prepare("SELECT id, label, color, icon FROM obligation_categories ORDER BY id")?;
    let rows =
        stmt.query_map([], |r| Ok(CategoryCustom { id: r.get(0)?, label: r.get(1)?, color: r.get(2)?, icon: r.get(3)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Renomme, recolore ou change le symbole d'une catégorie ; sans rien de tout cela, elle
/// revient à l'origine.
pub fn customize_category(conn: &Connection, custom: &CategoryCustom) -> Result<CategoryCustom, DataError> {
    if !CATEGORIES.contains(&custom.id.as_str()) {
        return Err(invalid("category"));
    }
    let label = match custom.label.as_deref().map(str::trim) {
        Some(text) if !text.is_empty() => Some(clean_line(text, MAX_CATEGORY_LABEL_CHARS, "label")?),
        _ => None,
    };
    let color = custom.color.as_deref().map(clean_color).transpose()?;
    let icon = custom.icon.as_deref().map(|i| check_symbol(i, "icon")).transpose()?;
    if label.is_none() && color.is_none() && icon.is_none() {
        conn.execute("DELETE FROM obligation_categories WHERE id = ?1", params![custom.id])?;
    } else {
        conn.execute(
            "INSERT INTO obligation_categories (id, label, color, icon) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET label = excluded.label, color = excluded.color, icon = excluded.icon",
            params![custom.id, label, color, icon],
        )?;
    }
    Ok(CategoryCustom { id: custom.id.clone(), label, color, icon })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    fn open_vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        (dir, vault)
    }

    fn input(title: &str, category: &str, due: &str) -> ObligationInput {
        ObligationInput {
            title: title.into(),
            category: category.into(),
            due_date: due.into(),
            status: "a-faire".into(),
            ..Default::default()
        }
    }

    fn today() -> Day {
        Day::parse("2026-09-29").unwrap()
    }

    fn field(result: Result<Obligation, DataError>) -> String {
        match result {
            Err(DataError::Invalid { field }) => field,
            other => panic!("refus attendu, obtenu {other:?}"),
        }
    }

    #[test]
    fn une_obligation_est_nettoyee_et_relue() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let full = ObligationInput {
            organization: "  Maif ".into(),
            reference: "Contrat  123-456".into(),
            amount_cents: Some(4_590),
            period_months: Some(12),
            cancel_by: Some("2026-11-15".into()),
            space_id: Some("perso".into()),
            color: Some("#2D6FF0".into()),
            notes: "Habitation\r\n".into(),
            ..input("  Assurance   habitation ", "assurances", "2027-01-15")
        };
        let o = create(conn, &full, NOW).unwrap();
        assert_eq!(o.title, "Assurance habitation");
        assert_eq!((o.organization.as_str(), o.reference.as_str()), ("Maif", "Contrat 123-456"));
        assert_eq!((o.amount_cents, o.period_months), (Some(4_590), Some(12)));
        assert_eq!(o.color.as_deref(), Some("#2d6ff0"));
        assert_eq!(list(conn, NOW).unwrap(), vec![o]);
    }

    #[test]
    fn les_valeurs_incoherentes_sont_refusees() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        assert_eq!(field(create(conn, &input("A", "loisirs", "2026-10-01"), NOW)), "category");
        let period = ObligationInput { period_months: Some(5), ..input("A", "factures", "2026-10-01") };
        assert_eq!(field(create(conn, &period, NOW)), "period");
        let amount = ObligationInput { amount_cents: Some(-1), ..input("A", "factures", "2026-10-01") };
        assert_eq!(field(create(conn, &amount, NOW)), "amount");
        let late = ObligationInput { cancel_by: Some("2026-10-02".into()), ..input("A", "contrats", "2026-10-01") };
        assert_eq!(field(create(conn, &late, NOW)), "cancelBy");
        let status = ObligationInput { status: "oublie".into(), ..input("A", "factures", "2026-10-01") };
        assert_eq!(field(create(conn, &status, NOW)), "status");
    }

    #[test]
    fn payer_une_obligation_mensuelle_garde_le_jour_du_mois() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let rent = ObligationInput { period_months: Some(1), ..input("Loyer", "logement", "2027-01-31") };
        let o = create(conn, &rent, NOW).unwrap();
        let feb = pay(conn, &o.id, today(), NOW).unwrap();
        assert_eq!((feb.due_date.as_str(), feb.status.as_str()), ("2027-02-28", "a-faire"));
        assert_eq!(feb.last_paid_on.as_deref(), Some("2026-09-29"));
        assert_eq!(pay(conn, &o.id, today(), NOW).unwrap().due_date, "2027-03-31");
    }

    #[test]
    fn la_date_limite_de_resiliation_suit_l_echeance() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let yearly = ObligationInput {
            period_months: Some(12),
            cancel_by: Some("2026-11-15".into()),
            ..input("Box internet", "abonnements", "2027-01-15")
        };
        let o = pay(conn, &create(conn, &yearly, NOW).unwrap().id, today(), NOW).unwrap();
        assert_eq!((o.due_date.as_str(), o.cancel_by.as_deref()), ("2028-01-15", Some("2027-11-15")));
    }

    #[test]
    fn ponctuelle_payee_resiliee() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let tax = create(conn, &input("Taxe foncière", "impots", "2026-10-15"), NOW).unwrap();
        assert_eq!(pay(conn, &tax.id, today(), NOW).unwrap().status, "paye");
        let gym = ObligationInput { status: "resilie".into(), period_months: Some(1), ..input("Salle de sport", "abonnements", "2026-10-03") };
        let gym = create(conn, &gym, NOW).unwrap();
        assert_eq!(field(pay(conn, &gym.id, today(), NOW)), "status");
    }

    #[test]
    fn changer_l_echeance_change_le_jour_des_suivantes() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let o = create(conn, &ObligationInput { period_months: Some(1), ..input("Mutuelle", "sante", "2026-10-31") }, NOW).unwrap();
        let moved = ObligationInput { period_months: Some(1), ..input("Mutuelle", "sante", "2026-10-05") };
        update(conn, &o.id, &moved, NOW).unwrap();
        assert_eq!(pay(conn, &o.id, today(), NOW).unwrap().due_date, "2026-11-05");
    }

    #[test]
    fn une_categorie_se_renomme_se_recolore_et_se_retablit() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let custom = |label: Option<&str>, color: Option<&str>, icon: Option<&str>| CategoryCustom {
            id: "logement".into(),
            label: label.map(Into::into),
            color: color.map(Into::into),
            icon: icon.map(Into::into),
        };
        customize_category(conn, &custom(Some("  Maison  et jardin "), Some("#1F9A6E"), Some("feuille"))).unwrap();
        assert_eq!(categories(conn).unwrap(), vec![custom(Some("Maison et jardin"), Some("#1f9a6e"), Some("feuille"))]);
        customize_category(conn, &custom(Some(""), None, Some("cle"))).unwrap();
        assert_eq!(categories(conn).unwrap(), vec![custom(None, None, Some("cle"))], "le symbole seul suffit");
        customize_category(conn, &custom(None, None, None)).unwrap();
        assert!(categories(conn).unwrap().is_empty(), "sans nom, couleur ni symbole : retour à l'origine");
        assert_eq!(customize_category(conn, &custom(None, None, Some("inconnu"))), Err(DataError::Invalid { field: "icon".into() }));
        let unknown = CategoryCustom { id: "loisirs".into(), label: Some("Loisirs".into()), color: None, icon: None };
        assert_eq!(customize_category(conn, &unknown), Err(DataError::Invalid { field: "category".into() }));
    }

    #[test]
    fn corbeille_annuler_puis_vider_apres_30_jours() {
        let (_dir, vault) = open_vault();
        let conn = vault.connection().unwrap();
        let o = create(conn, &input("Passeport", "identite", "2031-04-02"), NOW).unwrap();
        delete(conn, &o.id, NOW).unwrap();
        assert!(list(conn, NOW).unwrap().is_empty());
        assert_eq!(restore(conn, &o.id, NOW).unwrap().id, o.id);
        delete(conn, &o.id, NOW).unwrap();
        list(conn, NOW + TRASH_SECONDS as u64 + 1).unwrap();
        assert_eq!(restore(conn, &o.id, NOW), Err(DataError::NotFound));
    }

    #[test]
    fn prelevement_automatique_et_historique_des_paiements() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let day = |s: &str| Day::parse(s).unwrap();
        let box_internet = ObligationInput {
            title: "Box internet".into(),
            category: "abonnements".into(),
            amount_cents: Some(2999),
            period_months: Some(1),
            due_date: "2026-08-05".into(),
            status: "a-faire".into(),
            auto_pay: true,
            ..Default::default()
        };
        let o = create(c, &box_internet, NOW).unwrap();
        assert!(o.auto_pay);
        // Le 10 octobre : août, septembre et octobre sont prélevés, chacun à sa date.
        let changed = autopay(c, day("2026-10-10"), NOW).unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].due_date, "2026-11-05");
        assert_eq!(changed[0].last_paid_on.as_deref(), Some("2026-10-05"));
        let history = payments(c, &o.id).unwrap();
        assert_eq!(history.iter().map(|p| p.paid_on.as_str()).collect::<Vec<_>>(), ["2026-10-05", "2026-09-05", "2026-08-05"]);
        assert!(history.iter().all(|p| p.auto && p.amount_cents == Some(2999)));
        assert!(autopay(c, day("2026-10-10"), NOW).unwrap().is_empty());
        // Paiement à la main, puis « Annuler » : le paiement sort de l'historique.
        let rent = create(c, &ObligationInput { auto_pay: false, title: "Loyer".into(), ..box_internet.clone() }, NOW).unwrap();
        assert!(autopay(c, day("2026-10-10"), NOW).unwrap().is_empty());
        pay(c, &rent.id, day("2026-08-06"), NOW).unwrap();
        assert!(!payments(c, &rent.id).unwrap()[0].auto);
        forget_last_payment(c, &rent.id).unwrap();
        assert!(payments(c, &rent.id).unwrap().is_empty());
    }

}
