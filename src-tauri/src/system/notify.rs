//! Notifications Windows des rappels, avec leurs boutons « Reporter 10 min » et « Terminé ».
//! Un clic ne fait effet que tant qu'Aqueli tourne (en arrière-plan le plus souvent).

use std::path::Path;

use tauri::{AppHandle, Emitter, Manager};
use windows::core::{Interface, HSTRING, IInspectable};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{
    NotificationSetting, ToastActivatedEventArgs, ToastNotification, ToastNotificationManager,
};
use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

use super::background;
use crate::reminders::{Notice, ReminderState};

/// Identifiant d'Aqueli pour Windows (le même que celui des raccourcis de l'installateur).
pub const APP_ID: &str = "fr.aqueli.desktop";
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

fn set_string(key: &HSTRING, name: &str, value: &str) {
    let wide: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
    // SAFETY: `wide` (UTF-16 terminé par zéro) vit pendant tout l'appel ; taille en octets.
    unsafe {
        let _ = RegSetKeyValueW(
            HKEY_CURRENT_USER,
            key,
            &HSTRING::from(name),
            REG_SZ.0,
            Some(wide.as_ptr().cast()),
            (wide.len() * 2) as u32,
        );
    }
}

/// Fait connaître Aqueli (nom et icône) au centre de notifications de Windows, aussi pour la
/// version de développement qui n'a pas de raccourci dans le menu Démarrer.
pub fn register(icon: &Path) {
    let key = HSTRING::from(format!(r"Software\Classes\AppUserModelId\{APP_ID}"));
    set_string(&key, "DisplayName", "Aqueli");
    set_string(&key, "IconUri", &icon.to_string_lossy());
    // SAFETY: simple réglage du processus en cours.
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(APP_ID));
    }
}

/// Texte sûr dans le XML de la notification.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

fn plural(count: usize, one: &str, many: &str) -> String {
    if count > 1 {
        format!("{count} {many}")
    } else {
        one.to_string()
    }
}

/// Contenu XML de la notification (schéma « ToastGeneric » de Windows).
pub fn toast_xml(notice: &Notice, lang: crate::lang::Lang) -> String {
    let t = |fr: &'static str| crate::lang::text(lang, fr);
    let text = |title: &str, body: &str| {
        format!(
            r#"<visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual>"#,
            escape(title),
            escape(body)
        )
    };
    // Toutes les notifications sont des « rappels » pour Windows : elles restent à l'écran et
    // passent en mode « Ne pas déranger » si Windows y autorise les rappels. Ce scénario
    // exige au moins un bouton.
    let open_only = format!(r#"<actions><action content="{}" arguments="ouvrir:" activationType="foreground"/></actions>"#, t("Ouvrir Aqueli"));
    match notice {
        Notice::Masked { count } => format!(
            r#"<toast launch="ouvrir:" scenario="reminder">{}{open_only}</toast>"#,
            text(
                &plural(*count, crate::lang::text(lang, "Rappel Aqueli"), crate::lang::text(lang, "rappels Aqueli")),
                if *count > 1 { crate::lang::text(lang, "Ouvrez Aqueli pour voir les tâches.") } else { crate::lang::text(lang, "Ouvrez Aqueli pour voir la tâche.") }
            )
        ),
        Notice::Many { count } => format!(
            r#"<toast launch="ouvrir:" scenario="reminder">{}{open_only}</toast>"#,
            text(&format!("{count} {}", crate::lang::text(lang, "rappels")), crate::lang::text(lang, "Ouvrez Aqueli pour les voir."))
        ),
        Notice::Task { id, title, when } if is_focus(id) => {
            let id = escape(id);
            format!(
                r#"<toast launch="ouvrir:{id}" scenario="reminder">{}<actions><action content="{}" arguments="ouvrir:{id}" activationType="foreground"/></actions></toast>"#,
                text(title, when),
                t("Ouvrir Aqueli")
            )
        }
        Notice::Task { id, title, when } => {
            let last = if is_task(id) { (crate::lang::text(lang, "Terminé"), "terminer") } else { (crate::lang::text(lang, "Ouvrir"), "ouvrir") };
            let id = escape(id);
            format!(
                r#"<toast launch="ouvrir:{id}" scenario="reminder">{}<actions><action content="{}" arguments="reporter:{id}" activationType="foreground"/><action content="{}" arguments="{}:{id}" activationType="foreground"/></actions></toast>"#,
                text(title, when),
                t("Reporter 10 min"),
                last.0,
                last.1
            )
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
fn on_activated(app: &AppHandle, arguments: &str) {
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

/// Affiche une notification Windows.
pub fn show(app: &AppHandle, notice: &Notice) -> windows::core::Result<()> {
    let xml = XmlDocument::new()?;
    xml.LoadXml(&HSTRING::from(toast_xml(notice, crate::lang::of(app))))?;
    let toast = ToastNotification::CreateToastNotification(&xml)?;
    let handle = app.clone();
    toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(move |_, args| {
        if let Some(args) = args.as_ref() {
            if let Ok(activated) = args.cast::<ToastActivatedEventArgs>() {
                if let Ok(arguments) = activated.Arguments() {
                    on_activated(&handle, &arguments.to_string());
                }
            }
        }
        Ok(())
    }))?;
    ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID))?.Show(&toast)
}

/// État des notifications d'Aqueli dans les réglages de Windows (journal de diagnostic).
pub fn setting_label() -> String {
    match ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(APP_ID)).and_then(|n| n.Setting()) {
        Ok(NotificationSetting::Enabled) => "autorisées".into(),
        Ok(NotificationSetting::DisabledForApplication) => "désactivées pour Aqueli".into(),
        Ok(NotificationSetting::DisabledForUser) => "désactivées pour toutes les applications".into(),
        Ok(NotificationSetting::DisabledByGroupPolicy) => "désactivées par une stratégie".into(),
        Ok(other) => format!("désactivées ({})", other.0),
        Err(e) => format!("état inconnu ({:#010x})", e.code().0),
    }
}

/// Nombre de notifications d'Aqueli présentes dans le centre de notifications.
pub fn history_count() -> Option<u32> {
    ToastNotificationManager::History().ok()?.GetHistoryWithId(&HSTRING::from(APP_ID)).ok()?.Size().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_titre_est_protege_dans_le_xml() {
        let xml = toast_xml(&Notice::Task { id: "a1".into(), title: "Pain & <lait>".into(), when: "Aujourd'hui · 14:00".into() }, crate::lang::Lang::Fr);
        assert!(xml.contains("Pain &amp; &lt;lait&gt;"));
        assert!(xml.contains("Aujourd&apos;hui"));
        assert!(xml.contains(r#"arguments="terminer:a1""#));
    }

    #[test]
    fn un_rendez_vous_s_ouvre_et_ne_se_termine_pas() {
        let xml = toast_xml(&Notice::Task { id: "evt:e1@2026-10-01".into(), title: "Dentiste".into(), when: "Demain · 09:30".into() }, crate::lang::Lang::Fr);
        assert!(xml.contains(r#"arguments="ouvrir:evt:e1@2026-10-01""#) && xml.contains("Reporter 10 min"));
        assert!(!xml.contains("terminer"));
        let bill = toast_xml(&Notice::Task { id: "obl:o1@2026-10-01:j7".into(), title: "Loyer".into(), when: "Dans 7 jours".into() }, crate::lang::Lang::Fr);
        assert!(bill.contains("Ouvrir") && !bill.contains("terminer"), "une obligation s'ouvre aussi");
    }

    #[test]
    fn une_notification_masquee_ne_dit_rien_de_la_tache() {
        let xml = toast_xml(&Notice::Masked { count: 1 }, crate::lang::Lang::Fr);
        assert!(xml.contains("Rappel Aqueli") && xml.contains("Ouvrez Aqueli pour voir la tâche."));
        assert!(xml.contains(r#"scenario="reminder""#), "un rappel pour Windows, comme les autres");
        assert!(xml.contains("Ouvrir Aqueli") && !xml.contains("terminer") && !xml.contains("reporter"));
        assert!(toast_xml(&Notice::Masked { count: 3 }, crate::lang::Lang::Fr).contains("3 rappels Aqueli"));
    }

    #[test]
    fn une_habitude_se_coche_et_le_focus_s_ouvre_seulement() {
        let habit = toast_xml(&Notice::Task { id: "habitude:h1".into(), title: "Boire de l'eau".into(), when: "Aujourd'hui · 10:00".into() }, crate::lang::Lang::Fr);
        assert!(habit.contains(r#"arguments="terminer:habitude:h1""#));
        let focus = toast_xml(&Notice::Task { id: "focus:fin".into(), title: "Séance terminée".into(), when: "Pause de 5 min".into() }, crate::lang::Lang::Fr);
        assert!(focus.contains("Ouvrir Aqueli") && !focus.contains("reporter") && !focus.contains("terminer"));
    }
}
