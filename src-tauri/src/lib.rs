//! Cœur d'Aqueli : fenêtre, coffre-fort chiffré et commandes appelées par l'interface.

mod accounts;
mod backups;
mod capture;
mod focus_mini;
mod note_window;
mod commands;
mod data;
mod data_location;
mod diagnostic;
mod files;
mod lang;
mod import;
mod legacy;
mod prefs;
mod reminders;
mod system;
pub mod vault;

use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use commands::{DataDir, VaultState};
use reminders::{ReminderState, Scheduler};
use capture::PendingCaptures;
use system::background::{self, BackgroundSettings, BackgroundState, StartHidden};
use system::hotkey::{self, HotkeyState};
use vault::Vault;

/// Secondes Unix, maintenant.
pub(crate) fn unix_now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64)
}

/// Aqueli a été lancé au démarrage de Windows, sans fenêtre.
fn started_hidden() -> bool {
    std::env::args().any(|a| a == "--arriere-plan")
}

/// Nom du dossier des données, dans %APPDATA%.
const DATA_FOLDER: &str = "Aqueli";

/// Dossier des données : %APPDATA%\Aqueli (cahier des charges § 9), repris de l'ancien nom
/// au besoin, ou l'emplacement choisi dans les Paramètres (data_location.rs). En développement
/// seulement, AQUELI_DATA_DIR permet de tester sur un dossier jetable (sans déplacement possible).
fn data_place(app: &tauri::App) -> Result<data_location::Place, Box<dyn std::error::Error>> {
    #[cfg(debug_assertions)]
    if let Some(dir) = std::env::var_os("AQUELI_DATA_DIR") {
        let dir = std::path::PathBuf::from(dir);
        let location = data_location::Location { dir: dir.clone(), moved: false };
        return Ok(data_location::Place { default_dir: dir, location, movable: false });
    }
    let base = app.path().data_dir()?;
    let default_dir = legacy::adopt_dir(&base.join(legacy::OLD_DATA_FOLDER), &base.join(DATA_FOLDER));
    let location = data_location::resolve(&default_dir);
    Ok(data_location::Place { default_dir, location, movable: true })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    // Position de la fenêtre et préférences d'affichage enregistrées sous l'ancien nom.
    legacy::adopt_app_folders(&context.config().identifier);

    tauri::Builder::default()
        // Doit être la première extension : un second lancement ne fait que ramener la fenêtre.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| background::show_main(app)))
        // Taille, position et état agrandi retenus d'une ouverture à l'autre.
        // La fenêtre reste cachée jusqu'à ce que l'interface soit dessinée (pas de flash blanc).
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !(StateFlags::VISIBLE | StateFlags::DECORATIONS))
                // La capture rapide se place elle-même, sur l'écran de la souris.
                .with_denylist(&[capture::WINDOW])
                .build(),
        )
        .setup(|app| {
            let place = data_place(app)?;
            // Racine des données : registre des comptes, compte principal et dossier « comptes ».
            let root = place.location.dir.clone();
            // Données déplacées sur un disque débranché : rien n'est créé à leur place.
            let missing = place.location.moved && !root.exists();
            let account = accounts::load(&root).actif;
            let dir = accounts::dir_of(&root, &account);
            app.manage(data_location::PlaceState(place));
            app.manage(accounts::ActiveAccount(accounts::Active { root: root.clone(), id: account }));
            app.manage(DataDir(dir.clone()));
            app.manage(ReminderState(Mutex::new(Scheduler::load(&dir, unix_now()))));
            app.manage(BackgroundState(Mutex::new(BackgroundSettings::default())));
            // Après un changement de compte, la fenêtre s'affiche même si Aqueli avait démarré
            // discrètement avec Windows.
            let switched = accounts::take_switch(&root);
            let hidden = started_hidden() && !switched;
            app.manage(StartHidden(hidden));
            app.manage(PendingCaptures(Mutex::new(Vec::new())));
            app.manage(focus_mini::MiniLatest::default());
            app.manage(HotkeyState::default());
            app.manage(backups::PickedFile::default());
            app.manage(import::ChosenFiles::default());

            // Notifications Windows : nom et icône d'Aqueli.
            #[cfg(windows)]
            {
                // À la racine : commune à tous les comptes.
                let icon = root.join("icone-notifications.png");
                if !icon.exists() && !missing {
                    let _ = std::fs::create_dir_all(&root);
                    let _ = files::write_atomic(&icon, include_bytes!("../icons/128x128.png"));
                }
                system::notify::register(&icon);
            }
            background::install_tray(app)?;
            background::start_reminders(app.handle().clone());
            // Sauvegarde automatique quotidienne, tant qu'Aqueli est déverrouillé.
            backups::start(app.handle().clone());

            // Capture rapide : raccourci global, et fenêtre préparée un peu après le démarrage
            // pour s'ouvrir sans attendre.
            let saved = prefs::load(&dir);
            // Mode discret dès l'ouverture de la fenêtre, avant tout affichage.
            system::discreet::set(app.handle(), system::discreet::from_prefs(&saved));
            if hotkey::register(app.handle(), hotkey::from_prefs(&saved)).is_err() {
                diagnostic::note(app.handle(), "capture rapide : raccourci indisponible");
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                let target = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    let _ = capture::prepare(&target);
                });
            });
            let mut vault = Vault::new(dir);
            // Windows Hello n'est accepté que dans la session Windows du dernier mot de passe.
            #[cfg(windows)]
            vault.set_logon(system::session::logon_marker());
            app.manage(VaultState(Mutex::new(vault)));

            // Verrouillage d'Aqueli avec celui de Windows (Win+L) et à la mise en veille.
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                system::session::watch(app.handle(), &window);
            }

            // Fermer la fenêtre la cache (et verrouille) : Aqueli reste en arrière-plan.
            if let Some(window) = app.get_webview_window("main") {
                let target = window.clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => background::on_close_requested(&target, api),
                    // Fichier glissé sur la fenêtre : l'interface pourra le lire pour l'importer.
                    tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => import::remember(target.app_handle(), paths),
                    _ => {}
                });
            }

            // Filet de sécurité : si l'interface ne s'affiche pas d'elle-même, on montre la fenêtre
            // (sauf lancement discret au démarrage de Windows).
            if let Some(window) = app.get_webview_window("main").filter(|_| !hidden) {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                        let _ = window.set_focus();
                        system::discreet::protect(&window);
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::vault_create,
            commands::vault_unlock,
            commands::vault_recover,
            commands::vault_change_password,
            commands::vault_new_recovery_key,
            commands::hello_supported,
            commands::vault_hello_enable,
            commands::vault_hello_disable,
            commands::vault_unlock_hello,
            commands::vault_lock,
            commands::accounts_list,
            commands::accounts_switch,
            commands::accounts_add,
            commands::accounts_cancel_new,
            commands::capture_submit,
            commands::capture_status,
            commands::capture_hide,
            commands::capture_show,
            commands::hotkey_get,
            commands::hotkey_set,
            commands::backups_status,
            commands::backups_list,
            commands::backups_create,
            commands::backups_preview,
            commands::backups_restore,
            commands::backups_delete,
            commands::backups_choose_destination,
            commands::backups_clear_destination,
            commands::backups_export,
            commands::backups_pick_file,
            commands::backups_open_folder,
            commands::support_open,
            commands::import_status,
            commands::import_pick_file,
            commands::import_describe,
            commands::import_read,
            commands::import_apply,
            commands::import_undo,
            commands::import_finish,
            commands::import_open,
            commands::reminders_quiet,
            commands::journal_list,
            commands::journal_get,
            commands::journal_save,
            commands::journal_delete,
            commands::journal_restore,
            commands::journal_search,
            commands::habits_list,
            commands::habits_checks,
            commands::habits_create,
            commands::habits_update,
            commands::habits_archive,
            commands::habits_reorder,
            commands::order_save,
            commands::habits_check,
            commands::habits_skip,
            commands::habits_delete,
            commands::habits_restore,
            commands::focus_list,
            commands::focus_add,
            commands::focus_delete,
            commands::focus_by_task,
            commands::trash_list,
            commands::trash_restore,
            commands::trash_purge,
            commands::trash_empty,
            commands::projects_list,
            commands::projects_create,
            commands::projects_create_from,
            commands::projects_update,
            commands::projects_archive,
            commands::projects_reorder,
            commands::projects_delete,
            commands::projects_restore,
            commands::milestones_list,
            commands::milestones_create,
            commands::milestones_update,
            commands::milestones_done,
            commands::milestones_delete,
            commands::links_list,
            commands::links_add,
            commands::links_remove,
            commands::contacts_list,
            commands::contacts_create,
            commands::contacts_update,
            commands::contacts_delete,
            commands::contacts_restore,
            commands::contact_interactions_list,
            commands::contact_interactions_add,
            commands::contact_interactions_delete,
            commands::documents_list,
            commands::folders_list,
            commands::folders_create,
            commands::folders_update,
            commands::folders_delete,
            commands::documents_pick,
            commands::documents_add,
            commands::documents_read,
            commands::documents_export,
            commands::documents_export_many,
            commands::wallpaper_get,
            commands::wallpaper_set,
            commands::wallpaper_delete,
            commands::setting_get,
            commands::setting_set,
            commands::theme_export,
            commands::export_file,
            commands::security_log,
            commands::discreet_set,
            commands::discreet_window,
            commands::account_delete,
            commands::data_location_get,
            commands::data_move,
            commands::note_window_open,
            commands::note_windows_list,
            commands::note_window_close,
            commands::note_windows_flush,
            commands::note_window_activity,
            commands::note_window_show_in_main,
            commands::task_filters_list,
            commands::task_filters_create,
            commands::task_filters_update,
            commands::task_filters_delete,
            commands::task_filters_reorder,
            commands::contact_groups_list,
            commands::contact_groups_create,
            commands::contact_groups_update,
            commands::contact_groups_delete,
            commands::lists_list,
            commands::lists_create,
            commands::lists_update,
            commands::lists_archive,
            commands::lists_delete,
            commands::lists_restore,
            commands::list_items_list,
            commands::list_items_create,
            commands::list_items_update,
            commands::list_items_delete,
            commands::list_items_reorder,
            commands::budget_categories_list,
            commands::budget_categories_create,
            commands::budget_categories_update,
            commands::budget_categories_delete,
            commands::transactions_list,
            commands::transactions_create,
            commands::transactions_update,
            commands::transactions_delete,
            commands::transactions_restore,
            commands::transactions_generate,
            commands::goals_list,
            commands::goals_create,
            commands::goals_update,
            commands::goals_delete,
            commands::goals_restore,
            commands::goal_steps_list,
            commands::goal_steps_create,
            commands::goal_steps_update,
            commands::goal_steps_done,
            commands::goal_steps_delete,
            commands::goal_entries_list,
            commands::goal_entries_create,
            commands::goal_entries_delete,
            commands::reviews_list,
            commands::reviews_save,
            commands::documents_update,
            commands::documents_delete,
            commands::documents_restore,
            commands::focus_mini_open,
            commands::focus_mini_close,
            commands::focus_mini_publish,
            commands::focus_mini_current,
            commands::focus_mini_command,
            commands::note_folders_list,
            commands::note_folders_create,
            commands::note_folders_update,
            commands::note_folders_delete,
            commands::spaces_list,
            commands::spaces_create,
            commands::spaces_update,
            commands::spaces_delete,
            commands::spaces_restore,
            commands::spaces_reorder,
            commands::tasks_list,
            commands::tasks_done_before,
            commands::tasks_create,
            commands::tasks_update,
            commands::tasks_set_done,
            commands::tasks_delete,
            commands::tasks_restore,
            commands::events_list,
            commands::events_create,
            commands::events_update,
            commands::events_delete,
            commands::events_restore,
            commands::obligations_list,
            commands::obligations_create,
            commands::obligations_update,
            commands::obligations_pay,
            commands::obligations_autopay,
            commands::obligations_payments,
            commands::obligations_forget_payment,
            commands::obligations_delete,
            commands::obligations_restore,
            commands::obligation_categories_list,
            commands::obligation_categories_update,
            commands::notes_list,
            commands::notes_get,
            commands::notes_create,
            commands::notes_update_body,
            commands::notes_update_meta,
            commands::notes_delete,
            commands::notes_restore,
            commands::notes_search,
            commands::note_versions_list,
            commands::note_versions_get,
            commands::note_versions_restore,
            commands::notebooks_list,
            commands::notebooks_create,
            commands::notebooks_update,
            commands::notebooks_delete,
            commands::notebooks_restore,
            commands::note_templates_list,
            commands::note_templates_create,
            commands::note_templates_delete,
            commands::prefs_load,
            commands::prefs_save,
            commands::reminders_sync,
            commands::reminders_missed,
            commands::reminders_test,
            commands::background_settings_set,
            commands::app_start_hidden,
            commands::autostart_get,
            commands::autostart_set,
            commands::language_default,
        ])
        .build(context)
        .expect("Aqueli n'a pas pu démarrer")
        .run(|app, event| {
            // À la fermeture, le coffre est verrouillé proprement : la base termine ses
            // écritures en cours et la clé maîtresse est effacée de la mémoire.
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut vault) = app.state::<VaultState>().0.lock() {
                    vault.lock();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    /// Chaque commande enregistrée ici est déclarée dans build.rs et autorisée par une
    /// permission (capabilities/*.json) : sinon Tauri la refuse dans l'application installée.
    #[test]
    fn chaque_commande_est_declaree_et_autorisee() {
        let lib = include_str!("lib.rs");
        let start = lib.find("generate_handler![").expect("liste des commandes");
        let end = start + lib[start..].find(']').expect("fin de la liste");
        let commands: Vec<&str> = lib[start..end]
            .split(',')
            .filter_map(|c| c.trim().rsplit("::").next())
            .map(str::trim)
            .filter(|c| !c.is_empty() && !c.contains('['))
            .collect();
        assert!(commands.len() > 100);
        let build = include_str!("../build.rs");
        let capabilities = [
            include_str!("../capabilities/default.json"),
            include_str!("../capabilities/capture.json"),
            include_str!("../capabilities/focus-mini.json"),
            include_str!("../capabilities/note.json"),
        ]
        .concat();
        for command in commands {
            assert!(build.contains(&format!("\"{command}\"")), "{command} absente de build.rs");
            let permission = format!("\"allow-{}\"", command.replace('_', "-"));
            assert!(capabilities.contains(&permission), "{command} sans permission");
        }
    }
}
