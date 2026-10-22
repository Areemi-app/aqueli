//! Budget léger (cahier des charges § 4.15) : dépenses et revenus par catégorie, budget mensuel
//! par catégorie, sans aucun lien bancaire. Les abonnements viennent des Obligations (calculés
//! par l'interface) ; les dépenses supprimées passent 30 jours à la corbeille.
//!
//! Opérations récurrentes (salaire, loyer…) : l'opération d'origine porte la répétition (tous
//! les N mois, jusqu'à une date) ; chaque échéance devient une opération réelle le jour venu
//! (`generate`), rattachée à sa série. Les mois passés restent ainsi tels quels, et une échéance
//! se modifie seule.

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::obligations::PERIODS;
use super::recurrence::{days_in_month, Day};
use super::spaces::clean_color;
use super::symbols::check_symbol;
use super::tasks::{self, clean_line, clean_notes, invalid, is_valid_date, space_exists, TRASH_SECONDS};
use super::DataError;

pub const MAX_CATEGORIES: usize = 60;
pub const MAX_TRANSACTIONS: usize = 100_000;
pub const MAX_LABEL_CHARS: usize = 200;
/// Un million d'euros au plus par opération.
pub const MAX_AMOUNT_CENTS: i64 = 100_000_000;
pub const KINDS: [&str; 2] = ["depense", "revenu"];

/// Catégories proposées au départ (créées par la migration de la base).
pub const DEFAULT_CATEGORIES: [(&str, &str, &str, &str, &str); 17] = [
    ("cat-courses", "Courses", "depense", "#2fae4a", "panier"),
    ("cat-logement", "Logement", "depense", "#e0671f", "maison"),
    ("cat-transports", "Transports", "depense", "#2d6ff0", "voiture"),
    ("cat-sante", "Santé", "depense", "#e04848", "sante"),
    ("cat-loisirs", "Loisirs", "depense", "#7a5ce6", "musique"),
    ("cat-restaurants", "Restaurants", "depense", "#e89a1c", "cuisine"),
    ("cat-vetements", "Vêtements", "depense", "#d9567a", "cadeau"),
    ("cat-cadeaux", "Cadeaux", "depense", "#c2479a", "cadeau"),
    ("cat-divers", "Divers", "depense", "#5a7d99", "etoile"),
    ("cat-salaire", "Salaire", "revenu", "#1f9a6e", "argent"),
    ("cat-autres-revenus", "Autres revenus", "revenu", "#16a3a3", "banque"),
    // Ajoutées en version 19 de la base (retour d'essai du 02/10/2026).
    ("cat-activite", "Activité indépendante", "revenu", "#2d6ff0", "ordinateur"),
    ("cat-aides", "Aides et allocations", "revenu", "#7a5ce6", "famille"),
    ("cat-remboursements", "Remboursements", "revenu", "#0a9fd8", "facture"),
    ("cat-ventes", "Ventes", "revenu", "#e0671f", "panier"),
    ("cat-cadeaux-recus", "Cadeaux reçus", "revenu", "#d9567a", "cadeau"),
    ("cat-placements", "Épargne et placements", "revenu", "#2fae4a", "graphique"),
];

/// Catégories proposées depuis la version 19 de la base : ajoutées aux comptes existants.
pub const V19_CATEGORIES: [&str; 6] = ["cat-activite", "cat-aides", "cat-remboursements", "cat-ventes", "cat-cadeaux-recus", "cat-placements"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetCategory {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub color: Option<String>,
    pub icon: String,
    /// Budget du mois, en centimes (dépenses) ; nul s'il n'y en a pas.
    pub monthly_cents: Option<i64>,
    pub position: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CategoryInput {
    pub name: String,
    pub kind: String,
    pub color: Option<String>,
    pub icon: String,
    pub monthly_cents: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub day: String,
    /// Montant positif, en centimes.
    pub amount_cents: i64,
    pub kind: String,
    pub category_id: Option<String>,
    pub label: String,
    pub notes: String,
    pub space_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Répétition : tous les N mois (opération d'origine d'une série).
    pub repeat_months: Option<u32>,
    /// Dernière date possible d'une échéance (comprise).
    pub repeat_until: Option<String>,
    /// Prochaine échéance à créer.
    pub repeat_next: Option<String>,
    /// Opération d'origine, pour une échéance créée par la répétition.
    pub series_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct TransactionInput {
    pub day: String,
    pub amount_cents: i64,
    pub kind: String,
    pub category_id: Option<String>,
    pub label: String,
    pub notes: String,
    pub space_id: Option<String>,
    /// Tous les N mois (1, 2, 3, 6 ou 12) ; aucune : opération unique.
    pub repeat_months: Option<u32>,
    pub repeat_until: Option<String>,
}

// ——— Catégories ———

fn category_row(row: &Row) -> rusqlite::Result<BudgetCategory> {
    Ok(BudgetCategory {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        color: row.get(3)?,
        icon: row.get(4)?,
        monthly_cents: row.get(5)?,
        position: row.get(6)?,
    })
}

fn get_category(conn: &Connection, id: &str) -> Result<BudgetCategory, DataError> {
    conn.query_row("SELECT id, name, kind, color, icon, monthly_cents, position FROM budget_categories WHERE id = ?1", params![id], category_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

pub fn categories(conn: &Connection) -> Result<Vec<BudgetCategory>, DataError> {
    let mut stmt = conn.prepare("SELECT id, name, kind, color, icon, monthly_cents, position FROM budget_categories ORDER BY position, created_at")?;
    let rows = stmt.query_map([], category_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn clean_category(conn: &Connection, input: &CategoryInput, id: Option<&str>) -> Result<CategoryInput, DataError> {
    if !KINDS.contains(&input.kind.as_str()) {
        return Err(invalid("kind"));
    }
    let name = clean_line(&input.name, 60, "name")?;
    let taken: Option<String> = conn
        .query_row("SELECT id FROM budget_categories WHERE lower(name) = lower(?1) AND kind = ?2", params![name, input.kind], |r| r.get(0))
        .optional()?;
    if taken.is_some_and(|other| Some(other.as_str()) != id) {
        return Err(DataError::Duplicate { field: "name".into() });
    }
    if input.monthly_cents.is_some_and(|m| !(0..=MAX_AMOUNT_CENTS).contains(&m)) {
        return Err(invalid("monthlyCents"));
    }
    Ok(CategoryInput {
        name,
        kind: input.kind.clone(),
        color: input.color.as_deref().map(clean_color).transpose()?,
        icon: check_symbol(&input.icon, "icon")?,
        monthly_cents: input.monthly_cents.filter(|m| *m > 0),
    })
}

pub fn create_category(conn: &Connection, input: &CategoryInput, now: u64) -> Result<BudgetCategory, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM budget_categories", [], |r| r.get(0))?;
    if count as usize >= MAX_CATEGORIES {
        return Err(DataError::TooMany { max: MAX_CATEGORIES });
    }
    let c = clean_category(conn, input, None)?;
    let id = tasks::random_id()?;
    conn.execute(
        "INSERT INTO budget_categories (id, name, kind, color, icon, monthly_cents, position, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, c.name, c.kind, c.color, c.icon, c.monthly_cents, count, now as i64],
    )?;
    get_category(conn, &id)
}

pub fn update_category(conn: &Connection, id: &str, input: &CategoryInput) -> Result<BudgetCategory, DataError> {
    get_category(conn, id)?;
    let c = clean_category(conn, input, Some(id))?;
    conn.execute(
        "UPDATE budget_categories SET name = ?2, kind = ?3, color = ?4, icon = ?5, monthly_cents = ?6 WHERE id = ?1",
        params![id, c.name, c.kind, c.color, c.icon, c.monthly_cents],
    )?;
    get_category(conn, id)
}

/// Retire une catégorie : ses opérations restent, sans catégorie.
pub fn delete_category(conn: &Connection, id: &str) -> Result<(), DataError> {
    get_category(conn, id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("UPDATE transactions SET category_id = NULL WHERE category_id = ?1", params![id])?;
    tx.execute("DELETE FROM budget_categories WHERE id = ?1", params![id])?;
    tx.commit()?;
    Ok(())
}

// ——— Dépenses et revenus ———

fn clean_transaction(conn: &Connection, input: &TransactionInput, current_space: Option<&str>) -> Result<TransactionInput, DataError> {
    if !is_valid_date(&input.day) {
        return Err(invalid("day"));
    }
    if !(1..=MAX_AMOUNT_CENTS).contains(&input.amount_cents) {
        return Err(invalid("amountCents"));
    }
    if !KINDS.contains(&input.kind.as_str()) {
        return Err(invalid("kind"));
    }
    if let Some(cat) = &input.category_id {
        let kind: Option<String> = conn.query_row("SELECT kind FROM budget_categories WHERE id = ?1", params![cat], |r| r.get(0)).optional()?;
        if kind.as_deref() != Some(input.kind.as_str()) {
            return Err(invalid("categoryId"));
        }
    }
    if let Some(space) = &input.space_id {
        if Some(space.as_str()) != current_space && !space_exists(conn, space)? {
            return Err(invalid("space"));
        }
    }
    if input.repeat_months.is_some_and(|p| !PERIODS.contains(&p)) {
        return Err(invalid("repeatMonths"));
    }
    let repeat_until = match (input.repeat_months, input.repeat_until.as_deref()) {
        (Some(_), Some(until)) if !is_valid_date(until) || until < input.day.as_str() => return Err(invalid("repeatUntil")),
        (Some(_), until) => until.map(str::to_string),
        (None, _) => None,
    };
    Ok(TransactionInput {
        day: input.day.clone(),
        amount_cents: input.amount_cents,
        kind: input.kind.clone(),
        category_id: input.category_id.clone(),
        label: clean_line(&input.label, MAX_LABEL_CHARS, "label")?,
        notes: clean_notes(&input.notes)?,
        space_id: input.space_id.clone(),
        repeat_months: input.repeat_months,
        repeat_until,
    })
}

/// `months` mois après `start`, le même jour du mois (le dernier jour si le mois est plus court).
fn add_months(start: Day, months: i64) -> Day {
    let index = start.year * 12 + i64::from(start.month) - 1 + months;
    let (year, month) = (index.div_euclid(12), (index.rem_euclid(12) + 1) as u32);
    Day { year, month, day: start.day.min(days_in_month(year, month)) }
}

/// Échéance qui suit `after` dans une série commencée le `start`, tous les `period` mois.
fn next_occurrence(start: Day, period: u32, after: Day) -> Day {
    let period = i64::from(period.max(1));
    let elapsed = (after.year - start.year) * 12 + i64::from(after.month) - i64::from(start.month);
    let mut k = (elapsed / period).max(0) + 1;
    let mut next = add_months(start, k * period);
    while next <= after {
        k += 1;
        next = add_months(start, k * period);
    }
    next
}

const COLUMNS: &str = "id, day, amount_cents, kind, category_id, label, notes, space_id, created_at, updated_at, repeat_months, repeat_until, repeat_next, series_id";

fn transaction_row(row: &Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        day: row.get(1)?,
        amount_cents: row.get(2)?,
        kind: row.get(3)?,
        category_id: row.get(4)?,
        label: row.get(5)?,
        notes: row.get(6)?,
        space_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        repeat_months: row.get(10)?,
        repeat_until: row.get(11)?,
        repeat_next: row.get(12)?,
        series_id: row.get(13)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> Result<Transaction, DataError> {
    conn.query_row(&format!("SELECT {COLUMNS} FROM transactions WHERE id = ?1 AND deleted_at IS NULL"), params![id], transaction_row)
        .optional()?
        .ok_or(DataError::NotFound)
}

/// Opérations, de la plus récente à la plus ancienne. Vide au passage la corbeille de plus de 30 jours.
pub fn list(conn: &Connection, now: u64) -> Result<Vec<Transaction>, DataError> {
    conn.execute("DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ?1", params![now as i64 - TRASH_SECONDS])?;
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM transactions WHERE deleted_at IS NULL ORDER BY day DESC, created_at DESC"))?;
    let rows = stmt.query_map([], transaction_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create(conn: &Connection, input: &TransactionInput, now: u64) -> Result<Transaction, DataError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL", [], |r| r.get(0))?;
    if count as usize >= MAX_TRANSACTIONS {
        return Err(DataError::TooMany { max: MAX_TRANSACTIONS });
    }
    let t = clean_transaction(conn, input, None)?;
    let id = tasks::random_id()?;
    let next = repeat_next(&t, None);
    conn.execute(
        "INSERT INTO transactions (id, day, amount_cents, kind, category_id, label, notes, space_id, created_at, updated_at,
                                   repeat_months, repeat_until, repeat_next)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12)",
        params![id, t.day, t.amount_cents, t.kind, t.category_id, t.label, t.notes, t.space_id, now as i64, t.repeat_months, t.repeat_until, next],
    )?;
    get(conn, &id)
}

/// Prochaine échéance d'une série : la première après `last` (dernière échéance déjà créée) ou
/// après l'opération d'origine.
fn repeat_next(t: &TransactionInput, last: Option<&str>) -> Option<String> {
    let period = t.repeat_months?;
    let start = Day::parse(&t.day)?;
    let after = last.and_then(Day::parse).filter(|d| *d > start).unwrap_or(start);
    Some(next_occurrence(start, period, after).format())
}

pub fn update(conn: &Connection, id: &str, input: &TransactionInput, now: u64) -> Result<Transaction, DataError> {
    let current = get(conn, id)?;
    let t = clean_transaction(conn, input, current.space_id.as_deref())?;
    // Répétition inchangée : la prochaine échéance reste ; sinon elle suit la dernière déjà créée.
    let next = if t.repeat_months == current.repeat_months && t.day == current.day {
        current.repeat_next.clone().or_else(|| repeat_next(&t, None))
    } else {
        let last: Option<String> =
            conn.query_row("SELECT MAX(day) FROM transactions WHERE series_id = ?1 AND deleted_at IS NULL", params![id], |r| r.get(0))?;
        repeat_next(&t, last.as_deref())
    };
    conn.execute(
        "UPDATE transactions SET day = ?2, amount_cents = ?3, kind = ?4, category_id = ?5, label = ?6, notes = ?7, space_id = ?8, updated_at = ?9,
                                 repeat_months = ?10, repeat_until = ?11, repeat_next = ?12
         WHERE id = ?1",
        params![id, t.day, t.amount_cents, t.kind, t.category_id, t.label, t.notes, t.space_id, now as i64, t.repeat_months, t.repeat_until, next],
    )?;
    get(conn, id)
}

/// Crée les échéances arrivées jusqu'à `today` (compris) des opérations récurrentes. Une
/// opération identique déjà présente ce jour-là (saisie à la main, réimportée) n'est pas doublée.
pub fn generate(conn: &Connection, today: &str, now: u64) -> Result<Vec<Transaction>, DataError> {
    let today = Day::parse(today).ok_or_else(|| invalid("today"))?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM transactions
         WHERE deleted_at IS NULL AND repeat_months IS NOT NULL AND repeat_next IS NOT NULL AND repeat_next <= ?1"
    ))?;
    let due: Vec<Transaction> = stmt.query_map(params![today.format()], transaction_row)?.collect::<Result<_, _>>()?;
    let mut created = Vec::new();
    for t in due {
        let (Some(period), Some(start), Some(mut next)) = (t.repeat_months, Day::parse(&t.day), t.repeat_next.as_deref().and_then(Day::parse)) else {
            continue;
        };
        let until = t.repeat_until.as_deref().and_then(Day::parse);
        // Dix ans d'échéances mensuelles au plus d'un coup.
        for _ in 0..120 {
            if next > today || until.is_some_and(|u| next > u) {
                break;
            }
            let day = next.format();
            let twin: bool = conn.query_row(
                "SELECT COUNT(*) > 0 FROM transactions WHERE deleted_at IS NULL AND day = ?1 AND label = ?2 AND amount_cents = ?3 AND kind = ?4",
                params![day, t.label, t.amount_cents, t.kind],
                |r| r.get(0),
            )?;
            let count: i64 = conn.query_row("SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL", [], |r| r.get(0))?;
            if !twin && (count as usize) < MAX_TRANSACTIONS {
                let id = tasks::random_id()?;
                conn.execute(
                    "INSERT INTO transactions (id, day, amount_cents, kind, category_id, label, notes, space_id, created_at, updated_at, series_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10)",
                    params![id, day, t.amount_cents, t.kind, t.category_id, t.label, t.notes, t.space_id, now as i64, t.id],
                )?;
                created.push(get(conn, &id)?);
            }
            next = next_occurrence(start, period, next);
        }
        conn.execute("UPDATE transactions SET repeat_next = ?2 WHERE id = ?1", params![t.id, next.format()])?;
    }
    Ok(created)
}

pub fn delete(conn: &Connection, id: &str, now: u64) -> Result<(), DataError> {
    get(conn, id)?;
    conn.execute("UPDATE transactions SET deleted_at = ?2 WHERE id = ?1", params![id, now as i64])?;
    Ok(())
}

pub fn restore(conn: &Connection, id: &str, now: u64) -> Result<Transaction, DataError> {
    let changed = conn.execute(
        "UPDATE transactions SET deleted_at = NULL, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NOT NULL",
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

    fn spend(day: &str, cents: i64, category: Option<&str>) -> TransactionInput {
        TransactionInput { day: day.into(), amount_cents: cents, kind: "depense".into(), category_id: category.map(Into::into), label: "Marché".into(), ..Default::default() }
    }

    #[test]
    fn les_echeances_suivent_le_meme_jour_du_mois() {
        let d = |s: &str| Day::parse(s).unwrap();
        assert_eq!(next_occurrence(d("2026-01-31"), 1, d("2026-01-31")), d("2026-02-28"));
        assert_eq!(next_occurrence(d("2026-01-31"), 1, d("2026-02-28")), d("2026-03-31"));
        assert_eq!(next_occurrence(d("2026-01-15"), 3, d("2026-03-20")), d("2026-04-15"));
        assert_eq!(next_occurrence(d("2025-11-30"), 12, d("2025-11-30")), d("2026-11-30"));
    }

    #[test]
    fn une_operation_recurrente_cree_ses_echeances_le_jour_venu() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let salary = TransactionInput {
            day: "2026-07-28".into(),
            amount_cents: 245_000,
            kind: "revenu".into(),
            label: "Salaire".into(),
            repeat_months: Some(1),
            ..Default::default()
        };
        let origin = create(c, &salary, NOW).unwrap();
        assert_eq!(origin.repeat_next.as_deref(), Some("2026-08-28"));
        // Une échéance saisie à la main en septembre n'est pas doublée.
        create(c, &TransactionInput { day: "2026-09-28".into(), repeat_months: None, ..salary.clone() }, NOW).unwrap();
        let made = generate(c, "2026-10-01", NOW).unwrap();
        assert_eq!(made.iter().map(|t| t.day.as_str()).collect::<Vec<_>>(), ["2026-08-28"]);
        assert_eq!(made[0].series_id.as_deref(), Some(origin.id.as_str()));
        assert_eq!(made[0].repeat_months, None);
        assert_eq!(get(c, &origin.id).unwrap().repeat_next.as_deref(), Some("2026-10-28"));
        // Rien de plus le même jour ; l'échéance d'octobre arrive le 28.
        assert!(generate(c, "2026-10-01", NOW).unwrap().is_empty());
        assert_eq!(generate(c, "2026-10-28", NOW).unwrap().len(), 1);
        // Fin de la répétition : plus d'échéance après la date.
        update(c, &origin.id, &TransactionInput { repeat_until: Some("2026-11-30".into()), ..salary.clone() }, NOW).unwrap();
        assert_eq!(get(c, &origin.id).unwrap().repeat_next.as_deref(), Some("2026-11-28"));
        assert_eq!(generate(c, "2027-03-01", NOW).unwrap().len(), 1);
        // Répétition retirée : la série s'arrête.
        update(c, &origin.id, &TransactionInput { repeat_months: None, ..salary.clone() }, NOW).unwrap();
        assert_eq!(get(c, &origin.id).unwrap().repeat_next, None);
        // Valeurs refusées.
        assert_eq!(create(c, &TransactionInput { repeat_months: Some(5), ..salary.clone() }, NOW), Err(invalid("repeatMonths")));
        assert_eq!(create(c, &TransactionInput { repeat_until: Some("2026-01-01".into()), ..salary.clone() }, NOW), Err(invalid("repeatUntil")));
    }

    #[test]
    fn les_categories_de_depart_sont_la_et_se_reglent() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        let cats = categories(c).unwrap();
        assert_eq!(cats.len(), DEFAULT_CATEGORIES.len());
        let courses = cats.iter().find(|x| x.id == "cat-courses").unwrap();
        let input = CategoryInput { name: "Courses".into(), kind: "depense".into(), color: None, icon: "panier".into(), monthly_cents: Some(40_000) };
        assert_eq!(update_category(c, &courses.id, &input).unwrap().monthly_cents, Some(40_000));
        assert!(matches!(create_category(c, &input, NOW), Err(DataError::Duplicate { .. })));
        let t = create(c, &spend("2026-10-02", 4250, Some(&courses.id)), NOW).unwrap();
        delete_category(c, &courses.id).unwrap();
        assert_eq!(get(c, &t.id).unwrap().category_id, None, "l'opération reste, sans catégorie");
    }

    #[test]
    fn une_operation_est_verifiee_puis_va_a_la_corbeille() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert!(create(c, &spend("2026-13-01", 100, None), NOW).is_err());
        assert!(create(c, &spend("2026-10-01", 0, None), NOW).is_err(), "montant positif");
        assert!(create(c, &spend("2026-10-01", 100, Some("cat-salaire")), NOW).is_err(), "catégorie de revenus pour une dépense");
        let a = create(c, &spend("2026-10-01", 1250, Some("cat-courses")), NOW).unwrap();
        let b = create(c, &spend("2026-10-03", 990, None), NOW).unwrap();
        assert_eq!(list(c, NOW).unwrap().iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), [b.id.as_str(), a.id.as_str()], "la plus récente d'abord");
        delete(c, &a.id, NOW).unwrap();
        assert_eq!(list(c, NOW).unwrap().len(), 1);
        restore(c, &a.id, NOW).unwrap();
        delete(c, &a.id, NOW).unwrap();
        list(c, NOW + 31 * 86_400).unwrap();
        assert!(restore(c, &a.id, NOW).is_err(), "supprimée définitivement après 30 jours");
    }
}
