//! Contenu des notifications de rappel, commun à Windows et à Linux : titre, texte, boutons, et
//! réponse à un clic. Chaque système l'affiche à sa façon (`notify.rs` pour Windows,
//! `notify_linux.rs` pour Linux).

use tauri::{AppHandle, Emitter, Manager};

use super::background;
use crate::reminders::{Notice, ReminderState};

/// « Terminé » depuis une notification : l'interface termine la tâche.
pub const DONE_EVENT: &str = "rappel-terminer";
/// Clic sur une notification : l'interface ouvre la tâche ou le rendez-vous.
pub const OPEN_EVENT: &str = "rappel-ouvrir";

/// Rappels des tâches (identifiant sans « : ») et des habitudes (« habitude:… ») : « Terminé »
/// les coche ; les autres (« evt:… » pour les rendez-vous, « obl:… » pour les obligations)
/// s'ouvrent au lieu de se terminer.
fn is_task(id: &str) -> bool {
    !id.contains(':') || id.starts_with("habitude:")
}

/// Fin d'une séance de Focus : ni « Reporter » ni « Terminé ».
fn is_focus(id: &str) -> bool {
    id.starts_with("focus:")
}

fn plural(count: usize, one: &str, many: &str) -> String {
    if count > 1 {
        format!("{count} {many}")
    } else {
        one.to_string()
    }
}

/// Ce que montre une notification. Les « arguments » (`ouvrir:…`, `reporter:…`, `terminer:…`)
/// reviennent à `on_activated` quand on clique.
#[derive(Debug, PartialEq)]
pub struct Content {
    /// Clic sur la notification elle-même.
    pub launch: String,
    pub title: String,
    pub body: String,
    /// Boutons : arguments, libellé.
    pub actions: Vec<(String, String)>,
}

pub fn content(notice: &Notice, lang: crate::lang::Lang) -> Content {
    let t = |fr: &'static str| crate::lang::text(lang, fr).to_string();
    let open_only = || vec![("ouvrir:".to_string(), t("Ouvrir Aqueli"))];
    match notice {
        Notice::Masked { count } => Content {
            launch: "ouvrir:".into(),
            title: plural(*count, crate::lang::text(lang, "Rappel Aqueli"), crate::lang::text(lang, "rappels Aqueli")),
            body: if *count > 1 { t("Ouvrez Aqueli pour voir les tâches.") } else { t("Ouvrez Aqueli pour voir la tâche.") },
            actions: open_only(),
        },
        Notice::Many { count } => Content {
            launch: "ouvrir:".into(),
            title: format!("{count} {}", crate::lang::text(lang, "rappels")),
            body: t("Ouvrez Aqueli pour les voir."),
            actions: open_only(),
        },
        Notice::Task { id, title, when } if is_focus(id) => Content {
            launch: format!("ouvrir:{id}"),
            title: title.clone(),
            body: when.clone(),
            actions: vec![(format!("ouvrir:{id}"), t("Ouvrir Aqueli"))],
        },
        Notice::Task { id, title, when } => {
            let last = if is_task(id) { (t("Terminé"), "terminer") } else { (t("Ouvrir"), "ouvrir") };
            Content {
                launch: format!("ouvrir:{id}"),
                title: title.clone(),
                body: when.clone(),
                actions: vec![(format!("reporter:{id}"), t("Reporter 10 min")), (format!("{}:{id}", last.1), last.0)],
            }
        }
    }
}

/// Genre de notification, pour le journal de diagnostic (jamais son texte).
pub fn kind(notice: &Notice) -> &'static str {
    match notice {
        Notice::Masked { .. } => "« Rappel Aqueli »",
        Notice::Many { .. } => "groupée",
        Notice::Task { .. } => "de tâche",
    }
}

/// Réponse à un clic sur la notification ou sur l'un de ses boutons.
pub fn on_activated(app: &AppHandle, arguments: &str) {
    let (action, id) = arguments.split_once(':').unwrap_or((arguments, ""));
    crate::diagnostic::note(app, &format!("notification : clic « {action} »"));
    match action {
        "reporter" => {
            let now = crate::unix_now();
            if let Ok(mut scheduler) = app.state::<ReminderState>().0.lock() {
                scheduler.snooze_task(id, now);
            }
        }
        "terminer" => {
            let _ = app.emit(DONE_EVENT, id.to_string());
        }
        _ => {
            background::show_main(app);
            if !id.is_empty() {
                let _ = app.emit(OPEN_EVENT, id.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lang::Lang;

    fn task(id: &str) -> Notice {
        Notice::Task { id: id.into(), title: "Pain & <lait>".into(), when: "Aujourd'hui · 14:00".into() }
    }

    #[test]
    fn une_tache_se_reporte_ou_se_termine() {
        let c = content(&task("a1"), Lang::Fr);
        assert_eq!(c.launch, "ouvrir:a1");
        assert_eq!(c.title, "Pain & <lait>");
        assert_eq!(c.actions, [("reporter:a1".to_string(), "Reporter 10 min".to_string()), ("terminer:a1".to_string(), "Terminé".to_string())]);
    }

    #[test]
    fn un_rendez_vous_et_une_obligation_s_ouvrent_et_ne_se_terminent_pas() {
        for id in ["evt:e1@2026-10-01", "obl:o1@2026-10-01:j7"] {
            let c = content(&task(id), Lang::Fr);
            assert_eq!(c.actions[1], (format!("ouvrir:{id}"), "Ouvrir".to_string()));
            assert!(c.actions.iter().all(|(a, _)| !a.starts_with("terminer")));
        }
    }

    #[test]
    fn une_notification_masquee_ne_dit_rien_de_la_tache() {
        let one = content(&Notice::Masked { count: 1 }, Lang::Fr);
        assert_eq!((one.title.as_str(), one.body.as_str()), ("Rappel Aqueli", "Ouvrez Aqueli pour voir la tâche."));
        assert_eq!(one.actions, [("ouvrir:".to_string(), "Ouvrir Aqueli".to_string())]);
        assert_eq!(content(&Notice::Masked { count: 3 }, Lang::Fr).title, "3 rappels Aqueli");
        assert_eq!(content(&Notice::Many { count: 7 }, Lang::Fr).title, "7 rappels");
    }

    #[test]
    fn une_habitude_se_coche_et_le_focus_s_ouvre_seulement() {
        assert_eq!(content(&task("habitude:h1"), Lang::Fr).actions[1].0, "terminer:habitude:h1");
        let focus = content(&task("focus:fin"), Lang::Fr);
        assert_eq!(focus.actions, [("ouvrir:focus:fin".to_string(), "Ouvrir Aqueli".to_string())]);
    }

    #[test]
    fn les_boutons_suivent_la_langue() {
        let c = content(&task("a1"), Lang::En);
        assert!(c.actions.iter().all(|(_, label)| !label.is_empty() && label != "Terminé"));
    }
}
