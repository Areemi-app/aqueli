//! Répétition des tâches (cahier des charges § 4.2) : chaque jour, jours ouvrés, tous les
//! 2 mardis, le dernier vendredi du mois, 3 jours après achèvement…
//!
//! Calculs sur des dates civiles, sans fuseau horaire : la date du jour vient de l'interface
//! (l'heure de ce PC).

use serde::{Deserialize, Serialize};

/// Date civile (année, mois 1 à 12, jour 1 à 31).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Day {
    pub year: i64,
    pub month: u32,
    pub day: u32,
}

pub fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

pub fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        _ => 28,
    }
}

impl Day {
    /// « AAAA-MM-JJ » d'une date réelle.
    pub fn parse(text: &str) -> Option<Day> {
        let bytes = text.as_bytes();
        if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
            return None;
        }
        let digits = |range: std::ops::Range<usize>| -> Option<i64> {
            let part = &text[range];
            part.chars().all(|c| c.is_ascii_digit()).then(|| part.parse().ok()).flatten()
        };
        let (year, month, day) = (digits(0..4)?, digits(5..7)? as u32, digits(8..10)? as u32);
        let valid = (1..=12).contains(&month) && (1..=days_in_month(year, month)).contains(&day);
        valid.then_some(Day { year, month, day })
    }

    pub fn format(&self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// Jours écoulés depuis le 1er janvier 1970 (algorithme de H. Hinnant).
    pub(crate) fn to_days(self) -> i64 {
        let y = if self.month <= 2 { self.year - 1 } else { self.year };
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let m = i64::from(self.month);
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + i64::from(self.day) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    pub(crate) fn from_days(days: i64) -> Day {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
        let year = yoe + era * 400 + i64::from(month <= 2);
        Day { year, month, day }
    }

    pub fn add_days(self, days: i64) -> Day {
        Day::from_days(self.to_days() + days)
    }

    /// Jours de `self` à `other` (négatif si `other` est avant).
    pub fn days_until(self, other: Day) -> i64 {
        other.to_days() - self.to_days()
    }

    /// 0 = dimanche … 6 = samedi.
    pub fn weekday(self) -> u32 {
        (self.to_days() + 4).rem_euclid(7) as u32
    }

    /// Numéro de la semaine (du lundi au dimanche) depuis 1970.
    pub(crate) fn week_index(self) -> i64 {
        (self.to_days() + 3).div_euclid(7)
    }

    pub(crate) fn month_index(self) -> i64 {
        self.year * 12 + i64::from(self.month) - 1
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Recurrence {
    /// Tous les `interval` jours.
    Daily { interval: u32 },
    /// Du lundi au vendredi.
    Weekdays,
    /// Toutes les `interval` semaines, les jours donnés (0 = dimanche … 6 = samedi).
    Weekly { interval: u32, days: Vec<u32> },
    /// Le jour `day` de chaque `interval` mois (le dernier jour si le mois est plus court).
    Monthly { interval: u32, day: u32 },
    /// Le `nth` (1 à 4, ou -1 pour le dernier) `weekday` de chaque `interval` mois.
    MonthlyNth { interval: u32, nth: i32, weekday: u32 },
    /// Toutes les `interval` années, le `day` du mois `month` (29 février : le 28 les autres années).
    Yearly { interval: u32, month: u32, day: u32 },
    /// `days` jours après l'achèvement.
    AfterDone { days: u32 },
}

/// Règle vérifiée et mise en forme (jours de la semaine triés, sans doublon), ou `None`.
pub fn clean(rule: &Recurrence) -> Option<Recurrence> {
    let ok = match rule {
        Recurrence::Daily { interval } => (1..=365).contains(interval),
        Recurrence::Weekdays => true,
        Recurrence::Weekly { interval, days } => {
            (1..=52).contains(interval) && !days.is_empty() && days.iter().all(|d| *d < 7)
        }
        Recurrence::Monthly { interval, day } => (1..=24).contains(interval) && (1..=31).contains(day),
        Recurrence::MonthlyNth { interval, nth, weekday } => {
            (1..=24).contains(interval) && matches!(nth, 1..=4 | -1) && *weekday < 7
        }
        Recurrence::Yearly { interval, month, day } => {
            (1..=10).contains(interval) && (1..=12).contains(month) && (1..=days_in_month(2000, *month)).contains(day)
        }
        Recurrence::AfterDone { days } => (1..=365).contains(days),
    };
    if !ok {
        return None;
    }
    Some(match rule {
        Recurrence::Weekly { interval, days } => {
            let mut days = days.clone();
            days.sort_unstable();
            days.dedup();
            Recurrence::Weekly { interval: *interval, days }
        }
        other => other.clone(),
    })
}

/// Vrai si `day` est une échéance de la série commencée à `anchor`.
fn matches(rule: &Recurrence, anchor: Day, day: Day) -> bool {
    let every = |steps: i64, interval: &u32| steps.rem_euclid(i64::from(*interval)) == 0;
    match rule {
        Recurrence::Daily { interval } => every(day.to_days() - anchor.to_days(), interval),
        Recurrence::Weekdays => (1..=5).contains(&day.weekday()),
        Recurrence::Weekly { interval, days } => {
            days.contains(&day.weekday()) && every(day.week_index() - anchor.week_index(), interval)
        }
        Recurrence::Monthly { interval, day: wanted } => {
            every(day.month_index() - anchor.month_index(), interval)
                && day.day == (*wanted).min(days_in_month(day.year, day.month))
        }
        Recurrence::MonthlyNth { interval, nth, weekday } => {
            let in_month = if *nth > 0 {
                (day.day - 1) / 7 + 1 == *nth as u32
            } else {
                day.day + 7 > days_in_month(day.year, day.month)
            };
            every(day.month_index() - anchor.month_index(), interval) && day.weekday() == *weekday && in_month
        }
        Recurrence::Yearly { interval, month, day: wanted } => {
            every(day.year - anchor.year, interval)
                && day.month == *month
                && day.day == (*wanted).min(days_in_month(day.year, *month))
        }
        Recurrence::AfterDone { .. } => false,
    }
}

/// Assez pour une règle annuelle tous les 10 ans.
const SEARCH_DAYS: i64 = 11 * 366;

/// Prochaine échéance après l'achèvement d'une occurrence.
///
/// - « N jours après achèvement » : à partir du jour d'achèvement.
/// - Sinon, la première échéance de la série après la date prévue ; une tâche en retard
///   ne rattrape pas les échéances manquées : au plus tôt aujourd'hui.
pub fn next_due(rule: &Recurrence, due: Option<Day>, today: Day, done_on: Day) -> Option<Day> {
    if let Recurrence::AfterDone { days } = rule {
        return Some(done_on.add_days(i64::from(*days)));
    }
    let anchor = due.unwrap_or(today);
    let after = anchor.max(today.add_days(-1));
    (1..=SEARCH_DAYS).map(|n| after.add_days(n)).find(|d| matches(rule, anchor, *d))
}

/// Première échéance à partir d'aujourd'hui (règle posée sur une tâche sans date).
pub fn first_due(rule: &Recurrence, today: Day) -> Option<Day> {
    if let Recurrence::AfterDone { .. } = rule {
        return Some(today);
    }
    (0..=SEARCH_DAYS).map(|n| today.add_days(n)).find(|d| matches(rule, today, *d))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(text: &str) -> Day {
        Day::parse(text).unwrap()
    }

    /// Dimanche 27 septembre 2026.
    const TODAY: &str = "2026-09-27";

    fn next(rule: Recurrence, due: &str) -> String {
        next_due(&rule, Some(d(due)), d(TODAY), d(TODAY)).unwrap().format()
    }

    #[test]
    fn les_dates_civiles_sont_exactes() {
        assert_eq!(d("2026-09-27").weekday(), 0, "dimanche");
        assert_eq!(d("2026-10-02").weekday(), 5, "vendredi");
        assert_eq!(d("2000-02-29").weekday(), 2, "mardi");
        assert_eq!(d("2026-12-31").add_days(1).format(), "2027-01-01");
        assert_eq!(d("2028-02-28").add_days(1).format(), "2028-02-29");
        assert_eq!(d("2026-03-01").add_days(-1).format(), "2026-02-28");
        assert_eq!(d("1970-01-01").to_days(), 0);
        assert!(Day::parse("2026-02-29").is_none());
        assert!(Day::parse("2026-13-01").is_none());
        for n in [-800_000i64, -1, 0, 59, 11_016, 20_723, 800_000] {
            assert_eq!(Day::from_days(n).to_days(), n);
        }
    }

    #[test]
    fn chaque_jour_et_tous_les_n_jours() {
        assert_eq!(next(Recurrence::Daily { interval: 1 }, TODAY), "2026-09-28");
        assert_eq!(next(Recurrence::Daily { interval: 3 }, TODAY), "2026-09-30");
        // En retard : l'occurrence du jour, sans rattraper les jours manqués.
        assert_eq!(next(Recurrence::Daily { interval: 1 }, "2026-09-24"), "2026-09-27");
        // Tous les 3 jours, le rythme est gardé : 23, 26, 29.
        assert_eq!(next(Recurrence::Daily { interval: 3 }, "2026-09-23"), "2026-09-29");
    }

    #[test]
    fn jours_ouvres() {
        assert_eq!(next(Recurrence::Weekdays, "2026-10-02"), "2026-10-05", "vendredi → lundi");
        assert_eq!(next(Recurrence::Weekdays, "2026-09-28"), "2026-09-29");
    }

    #[test]
    fn chaque_semaine() {
        let mardi = Recurrence::Weekly { interval: 1, days: vec![2] };
        assert_eq!(next(mardi, "2026-09-29"), "2026-10-06");
        let deux_mardis = Recurrence::Weekly { interval: 2, days: vec![2] };
        assert_eq!(next(deux_mardis, "2026-09-29"), "2026-10-13");
        let lundi_jeudi = Recurrence::Weekly { interval: 1, days: vec![1, 4] };
        assert_eq!(next(lundi_jeudi.clone(), "2026-09-28"), "2026-10-01");
        assert_eq!(next(lundi_jeudi, "2026-10-01"), "2026-10-05");
        let une_semaine_sur_deux = Recurrence::Weekly { interval: 2, days: vec![1, 4] };
        assert_eq!(next(une_semaine_sur_deux, "2026-10-01"), "2026-10-12");
        // Terminée en avance : la semaine suivante.
        let vendredi = Recurrence::Weekly { interval: 1, days: vec![5] };
        assert_eq!(next(vendredi, "2026-10-09"), "2026-10-16");
    }

    #[test]
    fn chaque_mois() {
        let le_31 = Recurrence::Monthly { interval: 1, day: 31 };
        assert_eq!(next(le_31.clone(), "2026-10-31"), "2026-11-30", "mois de 30 jours : le dernier jour");
        assert_eq!(next(le_31, "2026-11-30"), "2026-12-31", "puis de nouveau le 31");
        let tous_les_3_mois = Recurrence::Monthly { interval: 3, day: 15 };
        assert_eq!(next(tous_les_3_mois, "2026-10-15"), "2027-01-15");
        let dernier_vendredi = Recurrence::MonthlyNth { interval: 1, nth: -1, weekday: 5 };
        assert_eq!(next(dernier_vendredi, "2026-09-25"), "2026-10-30");
        let deuxieme_mardi = Recurrence::MonthlyNth { interval: 1, nth: 2, weekday: 2 };
        assert_eq!(next(deuxieme_mardi, "2026-10-13"), "2026-11-10");
    }

    #[test]
    fn chaque_annee() {
        let rule = Recurrence::Yearly { interval: 1, month: 2, day: 29 };
        assert_eq!(next_due(&rule, Some(d("2028-02-29")), d("2028-02-29"), d("2028-02-29")).unwrap().format(), "2029-02-28");
        let anniversaire = Recurrence::Yearly { interval: 1, month: 8, day: 3 };
        assert_eq!(next(anniversaire, "2026-08-03"), "2027-08-03");
    }

    #[test]
    fn apres_achevement() {
        let rule = Recurrence::AfterDone { days: 3 };
        assert_eq!(next_due(&rule, Some(d("2026-09-20")), d(TODAY), d(TODAY)).unwrap().format(), "2026-09-30");
    }

    #[test]
    fn sans_date_la_serie_commence_aujourd_hui() {
        let rule = Recurrence::Daily { interval: 1 };
        assert_eq!(next_due(&rule, None, d(TODAY), d(TODAY)).unwrap().format(), "2026-09-28");
        let lundi = Recurrence::Weekly { interval: 1, days: vec![1] };
        assert_eq!(first_due(&lundi, d(TODAY)).unwrap().format(), "2026-09-28");
        assert_eq!(first_due(&Recurrence::Daily { interval: 2 }, d(TODAY)).unwrap().format(), TODAY);
    }

    #[test]
    fn les_regles_invalides_sont_refusees() {
        assert!(clean(&Recurrence::Daily { interval: 0 }).is_none());
        assert!(clean(&Recurrence::Weekly { interval: 1, days: vec![] }).is_none());
        assert!(clean(&Recurrence::Weekly { interval: 1, days: vec![7] }).is_none());
        assert!(clean(&Recurrence::Monthly { interval: 1, day: 32 }).is_none());
        assert!(clean(&Recurrence::MonthlyNth { interval: 1, nth: 5, weekday: 1 }).is_none());
        assert!(clean(&Recurrence::Yearly { interval: 1, month: 2, day: 30 }).is_none());
        assert!(clean(&Recurrence::AfterDone { days: 0 }).is_none());
        assert_eq!(
            clean(&Recurrence::Weekly { interval: 1, days: vec![4, 1, 4] }),
            Some(Recurrence::Weekly { interval: 1, days: vec![1, 4] })
        );
    }

    #[test]
    fn les_regles_se_lisent_en_json() {
        let json = r#"{"kind":"monthlyNth","interval":1,"nth":-1,"weekday":5}"#;
        let rule: Recurrence = serde_json::from_str(json).unwrap();
        assert_eq!(rule, Recurrence::MonthlyNth { interval: 1, nth: -1, weekday: 5 });
        assert_eq!(serde_json::to_string(&Recurrence::AfterDone { days: 3 }).unwrap(), r#"{"kind":"afterDone","days":3}"#);
    }
}
