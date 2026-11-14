//! Notifications Windows des rappels, avec leurs boutons « Reporter 10 min » et « Terminé ».
//! Un clic ne fait effet que tant qu'Aqueli tourne (en arrière-plan le plus souvent).

use std::path::Path;

use tauri::AppHandle;
use windows::core::{Interface, HSTRING, IInspectable};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::UI::Notifications::{
    NotificationSetting, ToastActivatedEventArgs, ToastNotification, ToastNotificationManager,
};
use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

use super::alerts;
use crate::reminders::Notice;

/// Identifiant d'Aqueli pour Windows (le même que celui des raccourcis de l'installateur).
pub const APP_ID: &str = "fr.aqueli.desktop";
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

/// Contenu XML de la notification (schéma « ToastGeneric » de Windows).
pub fn toast_xml(notice: &Notice, lang: crate::lang::Lang) -> String {
    let c = alerts::content(notice, lang);
    let actions: String = c
        .actions
        .iter()
        .map(|(arguments, label)| format!(r#"<action content="{}" arguments="{}" activationType="foreground"/>"#, escape(label), escape(arguments)))
        .collect();
    // Toutes les notifications sont des « rappels » pour Windows : elles restent à l'écran et
    // passent en mode « Ne pas déranger » si Windows y autorise les rappels. Ce scénario
    // exige au moins un bouton.
    format!(
        r#"<toast launch="{}" scenario="reminder"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual><actions>{actions}</actions></toast>"#,
        escape(&c.launch),
        escape(&c.title),
        escape(&c.body)
    )
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
                    alerts::on_activated(&handle, &arguments.to_string());
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
