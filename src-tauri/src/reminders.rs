//! Programmateur des rappels. L'interface lui confie les rappels à venir (heure, tâche,
//! titre) ; il les déclenche à l'heure, même quand Aqueli est verrouillé.
//!
//! Sur le disque (`rappels.json`, à côté du compte), seules les heures sont gardées, sans
//! titre ni identifiant : après un redémarrage de Windows, les rappels arrivent sous la forme
//! « Rappel Aqueli », avant même le premier déverrouillage.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::files::write_atomic;

pub const REMINDERS_FILE: &str = "rappels.json";
/// Au-delà, les rappels arrivés en même temps (après une mise en veille) sont regroupés.
pub const MAX_SEPARATE: usize = 3;
/// « Reporter » : 10 minutes.
pub const SNOOZE_SECONDS: i64 = 10 * 60;

/// Rappel confié par l'interface.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderInput {
    /// Secondes Unix.
    pub at: i64,
    pub task_id: String,
    pub title: String,
    /// Échéance lisible : « Aujourd'hui · 14:00 ».
    pub when: String,
}

/// Rappel programmé ; sans tâche ni titre quand il vient du disque.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reminder {
    pub at: i64,
    pub task: Option<(String, String, String)>,
}

impl Reminder {
    pub fn task_id(&self) -> Option<&str> {
        self.task.as_ref().map(|(id, _, _)| id.as_str())
    }
}

/// Ce qu'affiche une notification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Notice {
    /// Rappel(s) sans titre : Aqueli est verrouillé, ou le titre n'est pas connu.
    Masked { count: usize },
    /// Trop de rappels à la fois : une seule notification.
    Many { count: usize },
    Task { id: String, title: String, when: String },
}

/// Notifications à afficher pour les rappels arrivés à échéance.
pub fn notices(due: &[Reminder], hide_titles: bool) -> Vec<Notice> {
    let (known, unknown): (Vec<&Reminder>, Vec<&Reminder>) = due.iter().partition(|r| r.task.is_some() && !hide_titles);
    let mut list = Vec::new();
    if !unknown.is_empty() {
        list.push(Notice::Masked { count: unknown.len() });
    }
    if known.len() > MAX_SEPARATE {
        list.push(Notice::Many { count: known.len() });
    } else {
        for r in known {
            if let Some((id, title, when)) = &r.task {
                list.push(Notice::Task { id: id.clone(), title: title.clone(), when: when.clone() });
            }
        }
    }
    list
}

/// Programmateur partagé par les commandes, le fil des rappels et les notifications.
pub struct ReminderState(pub Mutex<Scheduler>);

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    instants: Vec<i64>,
    fired_until: i64,
}

pub struct Scheduler {
    file: PathBuf,
    entries: Vec<Reminder>,
    /// Rappels reportés : ils survivent à une nouvelle liste envoyée par l'interface.
    snoozed: Vec<Reminder>,
    /// Derniers rappels affichés avec leur tâche (pour « Reporter »), en mémoire seulement.
    recent: Vec<Reminder>,
    /// Tous les rappels jusqu'à cet instant ont été traités.
    fired_until: i64,
    /// Instant jusqu'où les rappels avaient été traités avant ce lancement : ceux d'après,
    /// déjà passés, ont été manqués pendant qu'Aqueli ne tournait pas.
    missed_since: i64,
    /// Lancement d'Aqueli : les rappels manqués sont ceux d'avant cet instant.
    launched_at: i64,
    /// « Ne pas déranger » (séance de Focus) : les rappels attendent jusqu'à cet instant.
    quiet_until: i64,
}

impl Scheduler {
    /// Reprend les heures enregistrées. Les rappels passés pendant l'absence d'Aqueli ne
    /// sont pas affichés en notification : l'interface les signale au déverrouillage.
    pub fn load(dir: &Path, now: i64) -> Self {
        let file = dir.join(REMINDERS_FILE);
        let stored: Stored = fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        let missed_since = if stored.fired_until > 0 { stored.fired_until.min(now) } else { now };
        let entries = stored.instants.into_iter().filter(|at| *at > now).map(|at| Reminder { at, task: None }).collect();
        let scheduler = Scheduler { file, entries, snoozed: Vec::new(), recent: Vec::new(), fired_until: now, missed_since, launched_at: now, quiet_until: 0 };
        scheduler.persist();
        scheduler
    }

    pub fn missed_since(&self) -> i64 {
        self.missed_since
    }

    pub fn launched_at(&self) -> i64 {
        self.launched_at
    }

    /// Remplace les rappels programmés par ceux de l'interface.
    pub fn replace(&mut self, list: Vec<ReminderInput>) {
        self.entries = list
            .into_iter()
            .filter(|r| r.at > self.fired_until)
            .map(|r| Reminder { at: r.at, task: Some((r.task_id, r.title, r.when)) })
            .collect();
        self.entries.sort_by_key(|r| r.at);
        self.persist();
    }

    /// Reporte un rappel de 10 minutes.
    pub fn snooze(&mut self, task: Option<(String, String, String)>, now: i64) {
        self.snoozed.push(Reminder { at: now + SNOOZE_SECONDS, task });
        self.persist();
    }

    /// Notification d'essai, déclenchée comme un vrai rappel (Paramètres › Rappels).
    pub fn add_test(&mut self, at: i64, lang: crate::lang::Lang) {
        let task = (String::new(), crate::lang::text(lang, "Notification d'essai").to_string(), crate::lang::text(lang, "Les rappels s'afficheront ainsi.").to_string());
        self.snoozed.push(Reminder { at, task: Some(task) });
    }

    /// Nombre de rappels programmés et prochain instant (journal de diagnostic).
    pub fn summary(&self) -> (usize, Option<i64>) {
        let next = self.entries.iter().chain(&self.snoozed).map(|r| r.at).min();
        (self.entries.len() + self.snoozed.len(), next)
    }

    /// Reporte le dernier rappel affiché pour cette tâche (bouton « Reporter 10 min »).
    pub fn snooze_task(&mut self, task_id: &str, now: i64) -> bool {
        let task = self.recent.iter().rev().find(|r| r.task_id() == Some(task_id)).and_then(|r| r.task.clone());
        let found = task.is_some();
        if found {
            self.snooze(task, now);
        }
        found
    }

    /// « Ne pas déranger » jusqu'à `until` (fin de la séance de Focus) ; `None` : fin du silence.
    pub fn set_quiet(&mut self, until: Option<i64>) {
        self.quiet_until = until.unwrap_or(0);
    }

    /// Rappels arrivés à échéance depuis le dernier passage ; ils ne reviendront plus. Pendant
    /// une séance de Focus, ils attendent sa fin.
    pub fn due(&mut self, now: i64) -> Vec<Reminder> {
        if now < self.quiet_until {
            return Vec::new();
        }
        let mut due = Vec::new();
        for list in [&mut self.entries, &mut self.snoozed] {
            let (hit, keep): (Vec<Reminder>, Vec<Reminder>) = list.drain(..).partition(|r| r.at <= now);
            *list = keep;
            due.extend(hit);
        }
        self.fired_until = self.fired_until.max(now);
        due.sort_by_key(|r| r.at);
        if !due.is_empty() {
            self.recent.extend(due.iter().filter(|r| r.task.is_some()).cloned());
            let excess = self.recent.len().saturating_sub(50);
            self.recent.drain(..excess);
            self.persist();
        }
        due
    }

    /// Heures seulement, jamais de titre.
    fn persist(&self) {
        let mut instants: Vec<i64> = self.entries.iter().chain(&self.snoozed).map(|r| r.at).collect();
        instants.sort_unstable();
        instants.dedup();
        let stored = Stored { instants, fired_until: self.fired_until };
        if let Ok(bytes) = serde_json::to_vec(&stored) {
            if let Some(dir) = self.file.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let _ = write_atomic(&self.file, &bytes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_790_000_000;

    fn input(at: i64, id: &str) -> ReminderInput {
        ReminderInput { at, task_id: id.into(), title: format!("Tâche {id}"), when: "Aujourd'hui · 14:00".into() }
    }

    #[test]
    fn un_rappel_arrive_a_l_heure_une_seule_fois() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "a"), input(NOW + 120, "b")]);

        assert!(s.due(NOW + 30).is_empty());
        let first = s.due(NOW + 60);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].task_id(), Some("a"));
        assert!(s.due(NOW + 61).is_empty(), "pas deux fois");
        assert_eq!(s.due(NOW + 500).len(), 1);
    }

    #[test]
    fn la_notification_d_essai_suit_le_chemin_d_un_vrai_rappel() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.add_test(NOW + 20, crate::lang::Lang::Fr);
        s.replace(Vec::new());
        assert_eq!(s.summary(), (1, Some(NOW + 20)), "un nouvel envoi de l'interface ne l'efface pas");
        assert!(s.due(NOW + 15).is_empty());
        let due = s.due(NOW + 30);
        assert_eq!(due.len(), 1);
        assert!(matches!(&notices(&due, true)[..], [Notice::Masked { count: 1 }]));
        assert_eq!(s.summary(), (0, None));
    }

    #[test]
    fn une_nouvelle_liste_ne_redonne_pas_un_rappel_deja_passe() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "a")]);
        s.due(NOW + 60);
        s.replace(vec![input(NOW + 60, "a"), input(NOW + 90, "b")]);
        let next = s.due(NOW + 100);
        assert_eq!(next.iter().map(|r| r.task_id()).collect::<Vec<_>>(), vec![Some("b")]);
    }

    #[test]
    fn le_disque_ne_garde_que_les_heures() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "secret")]);
        let text = fs::read_to_string(dir.path().join(REMINDERS_FILE)).unwrap();
        assert!(!text.contains("secret") && !text.contains("Tâche"), "ni identifiant ni titre : {text}");
        assert!(text.contains(&(NOW + 60).to_string()));
    }

    #[test]
    fn apres_un_redemarrage_les_rappels_arrivent_sans_titre() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "a"), input(NOW + 7200, "b")]);
        drop(s);

        let mut again = Scheduler::load(dir.path(), NOW + 30);
        let due = again.due(NOW + 60);
        assert_eq!(due, vec![Reminder { at: NOW + 60, task: None }]);
    }

    #[test]
    fn les_rappels_passes_pendant_l_absence_sont_manques_et_non_notifies() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "a"), input(NOW + 7200, "b")]);
        drop(s);

        // Aqueli relancé une heure plus tard : le rappel de NOW + 60 a été manqué.
        let mut later = Scheduler::load(dir.path(), NOW + 3600);
        assert_eq!(later.missed_since(), NOW);
        assert!(later.due(NOW + 3601).is_empty(), "pas de notification pour un rappel manqué");
        assert_eq!(later.due(NOW + 7200).len(), 1);
    }

    #[test]
    fn reporter_redonne_le_rappel_dix_minutes_plus_tard() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        let task = Some(("a".to_string(), "Garage".to_string(), "14:00".to_string()));
        s.snooze(task.clone(), NOW);
        s.replace(vec![]);
        assert!(s.due(NOW + SNOOZE_SECONDS - 1).is_empty());
        assert_eq!(s.due(NOW + SNOOZE_SECONDS), vec![Reminder { at: NOW + SNOOZE_SECONDS, task }]);
    }

    #[test]
    fn reporter_depuis_la_notification_retrouve_la_tache() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![input(NOW + 60, "a")]);
        s.due(NOW + 60);
        assert!(s.snooze_task("a", NOW + 70));
        assert!(!s.snooze_task("inconnue", NOW + 70));
        let again = s.due(NOW + 70 + SNOOZE_SECONDS);
        assert_eq!(again[0].task_id(), Some("a"));
    }

    fn fired(id: Option<&str>) -> Reminder {
        Reminder { at: NOW, task: id.map(|i| (i.to_string(), format!("Tâche {i}"), "14:00".to_string())) }
    }

    #[test]
    fn les_notifications_suivent_le_choix_de_masquer_les_titres() {
        let due = vec![fired(Some("a")), fired(Some("b"))];
        assert_eq!(notices(&due, true), vec![Notice::Masked { count: 2 }]);
        let shown = notices(&due, false);
        assert_eq!(shown.len(), 2);
        assert_eq!(shown[0], Notice::Task { id: "a".into(), title: "Tâche a".into(), when: "14:00".into() });
    }

    #[test]
    fn des_rappels_sans_titre_ou_trop_nombreux_sont_regroupes() {
        assert_eq!(notices(&[fired(None), fired(Some("a"))], false).first(), Some(&Notice::Masked { count: 1 }));
        let many: Vec<Reminder> = ["a", "b", "c", "d"].iter().map(|i| fired(Some(i))).collect();
        assert_eq!(notices(&many, false), vec![Notice::Many { count: 4 }]);
    }

    #[test]
    fn un_premier_lancement_ne_signale_rien_de_manque() {
        let dir = tempfile::tempdir().unwrap();
        let s = Scheduler::load(dir.path(), NOW);
        assert_eq!(s.missed_since(), NOW);
    }

    #[test]
    fn ne_pas_deranger_retient_les_rappels_jusqu_a_la_fin_de_la_seance() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Scheduler::load(dir.path(), NOW);
        s.replace(vec![ReminderInput { at: NOW + 60, task_id: "t".into(), title: "Appeler".into(), when: "Aujourd'hui".into() }]);
        s.set_quiet(Some(NOW + 1500));
        assert!(s.due(NOW + 120).is_empty());
        assert_eq!(s.due(NOW + 1500).len(), 1, "affiché à la fin de la séance");
        s.replace(vec![ReminderInput { at: NOW + 1600, task_id: "u".into(), title: "x".into(), when: "y".into() }]);
        s.set_quiet(Some(NOW + 3000));
        s.set_quiet(None);
        assert_eq!(s.due(NOW + 1601).len(), 1);
    }
}
