//! Aqueli en arrière-plan : icône dans la zone de notification (près de l'horloge), fenêtre
//! qui se cache et se verrouille à la fermeture, et fil qui déclenche les rappels à l'heure.

use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, CloseRequestApi, Emitter, Manager, WebviewWindow};

use crate::commands::VaultState;
use crate::diagnostic::note;
use crate::reminders::{notices, ReminderState};

/// La fenêtre vient d'être montrée (icône, notification, second lancement).
pub const SHOWN_EVENT: &str = "fenetre-affichee";
/// La fenêtre a été fermée : Aqueli reste en arrière-plan, verrouillé.
pub const BACKGROUND_LOCK_EVENT: &str = "verrouillage-arriere-plan";
/// « Verrouiller » depuis l'icône.
pub const LOCK_REQUEST_EVENT: &str = "verrouillage-demande";

/// Réglages envoyés par l'interface (Paramètres › Rappels).
#[derive(Debug, Clone, Copy)]
pub struct BackgroundSettings {
    /// Fermer la fenêtre garde Aqueli en arrière-plan (sinon, Aqueli s'arrête).
    pub keep_in_background: bool,
    /// Les notifications ne montrent pas le titre des tâches quand Aqueli est verrouillé.
    pub hide_titles_when_locked: bool,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        BackgroundSettings { keep_in_background: true, hide_titles_when_locked: true }
    }
}

pub struct BackgroundState(pub Mutex<BackgroundSettings>);

/// Aqueli a été lancé au démarrage de Windows, sans fenêtre.
pub struct StartHidden(pub bool);

fn settings(app: &AppHandle) -> BackgroundSettings {
    app.state::<BackgroundState>().0.lock().map(|s| *s).unwrap_or_default()
}

/// Montre la fenêtre principale et la met au premier plan.
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        super::discreet::protect(&window);
        let _ = app.emit(SHOWN_EVENT, ());
    }
}

/// Entrées du menu de l'icône, gardées pour suivre un changement de langue.
struct TrayItems([MenuItem<tauri::Wry>; 4]);

const TRAY_TEXTS: [&str; 4] = ["Ouvrir Aqueli", "Capture rapide", "Verrouiller", "Quitter Aqueli"];

/// Icône près de l'horloge : clic pour ouvrir, menu pour le reste.
pub fn install_tray(app: &App) -> tauri::Result<()> {
    let lang = crate::lang::of(app.handle());
    let open = MenuItem::with_id(app, "ouvrir", crate::lang::text(lang, "Ouvrir Aqueli"), true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", crate::lang::text(lang, "Capture rapide"), true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "verrouiller", crate::lang::text(lang, "Verrouiller"), true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quitter", crate::lang::text(lang, "Quitter Aqueli"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture, &lock, &separator, &quit])?;
    app.manage(TrayItems([open.clone(), capture.clone(), lock.clone(), quit.clone()]));

    let mut tray = TrayIconBuilder::with_id("aqueli").tooltip("Aqueli").menu(&menu).show_menu_on_left_click(false);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id().as_ref() {
        "ouvrir" => show_main(app),
        "capture" => crate::capture::show(app),
        "verrouiller" => {
            let _ = app.emit(LOCK_REQUEST_EVENT, ());
        }
        "quitter" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

/// Nouvelle langue : menu de l'icône et titre de la fenêtre de capture rapide.
pub fn retitle(app: &AppHandle, lang: crate::lang::Lang) {
    if let Some(items) = app.try_state::<TrayItems>() {
        for (item, fr) in items.0.iter().zip(TRAY_TEXTS) {
            let _ = item.set_text(crate::lang::text(lang, fr));
        }
    }
    if let Some(window) = app.get_webview_window(crate::capture::WINDOW) {
        let _ = window.set_title(crate::lang::text(lang, "Capture rapide"));
    }
}

/// Fermer la fenêtre : Aqueli se cache et se verrouille, sauf si la personne a choisi de
/// vraiment quitter à la fermeture.
pub fn on_close_requested(window: &WebviewWindow, api: &CloseRequestApi) {
    let app = window.app_handle();
    if !settings(app).keep_in_background {
        return;
    }
    api.prevent_close();
    note(app, "fenêtre fermée : Aqueli reste en arrière-plan et se verrouille");
    let _ = window.hide();
    let handle = app.clone();
    // Le coffre est fermé sur un autre fil pour ne jamais bloquer la fenêtre.
    std::thread::spawn(move || {
        if let Ok(mut vault) = handle.state::<VaultState>().0.lock() {
            vault.lock();
        }
    });
    crate::note_window::close_all(app);
    let _ = app.emit(BACKGROUND_LOCK_EVENT, ());
}

/// Toutes les 15 secondes, affiche les rappels arrivés à l'heure.
pub fn start_reminders(app: AppHandle) {
    note(&app, "programmateur des rappels : démarré");
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        let now = crate::unix_now();
        let mut due = match app.state::<ReminderState>().0.lock() {
            Ok(mut scheduler) => scheduler.due(now),
            Err(_) => continue,
        };
        // Fin d'une séance de Focus : la fenêtre au premier plan l'annonce elle-même.
        let watching = app.get_webview_window("main").is_some_and(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false));
        if watching {
            due.retain(|r| !r.task_id().is_some_and(|id| id.starts_with("focus:")));
        }
        if due.is_empty() {
            continue;
        }
        let unlocked = app.state::<VaultState>().0.lock().map(|v| v.is_unlocked()).unwrap_or(false);
        let hide = !unlocked && settings(&app).hide_titles_when_locked;
        let state = if unlocked { "ouvert" } else { "verrouillé" };
        let titles = if hide { "masqués" } else { "affichés" };
        note(&app, &format!("rappels à l'heure : {} (Aqueli {state}, titres {titles})", due.len()));
        #[cfg(windows)]
        {
            use super::notify;
            note(&app, &format!("notifications dans Windows : {}", notify::setting_label()));
            for notice in notices(&due, hide) {
                let kind = notify::kind(&notice);
                match notify::show(&app, &notice) {
                    Ok(()) => note(&app, &format!("notification {kind} : transmise à Windows")),
                    Err(e) => note(&app, &format!("notification {kind} : refusée ({:#010x} {})", e.code().0, e.message())),
                }
            }
            std::thread::sleep(Duration::from_secs(2));
            let count = notify::history_count().map_or("inconnu".to_string(), |n| n.to_string());
            note(&app, &format!("centre de notifications : {count} notification(s) d'Aqueli"));
        }
        #[cfg(not(windows))]
        let _ = notices(&due, hide);
    });
}
