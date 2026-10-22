//! Commandes appelées par l'interface. Les opérations lentes (Argon2id) tournent sur un
//! fil séparé pour ne jamais figer la fenêtre. Les mots de passe reçus sont effacés de la
//! mémoire dès la fin de la commande et ne sont jamais journalisés.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroizing;

use rusqlite::Connection;

use crate::backups::{self, BackupInfo, PickedFile};
use crate::capture::{Capture, CaptureStatus, Outcome};
use crate::data::events::{self, Event, EventInput};
use crate::data::notes::{self, Note, NoteBody, NoteMeta, NoteSummary, NoteTemplate, NoteVersion, NoteVersionContent, Notebook, NotebookInput};
use crate::data::obligations::{self, CategoryCustom, Obligation, ObligationInput};
use crate::data::spaces::{self, Space};
use crate::data::tasks::{self, DoneResult, DoneTask, Task, TaskInput};
use crate::data::focus::{self, FocusSession};
use crate::data::habits::{self, Habit, HabitCheck, HabitInput};
use crate::data::journal::{self, JournalEntry, JournalInput, JournalSummary};
use crate::data::trash::{self, TrashItem};
use crate::data::contacts::{self, Contact, ContactGroup, ContactGroupInput, ContactInput};
use crate::data::documents::{self, Document, DocumentMeta, Folder, FolderInput};
use crate::data::links::{self, Link};
use crate::data::projects::{self, Milestone, MilestoneInput, Project, ProjectInput};
use crate::data::filters::{self, TaskFilter, TaskFilterInput};
use crate::data::security::{self, SecurityLog};
use crate::data::DataError;
use crate::import::{self, Batch, Created as Imported, ImportError, ImportFailure, ImportFile};
use crate::prefs::{self, Prefs, PrefsError};
use crate::reminders::{ReminderInput, ReminderState};
use crate::system::hotkey::{self, Hotkey, HotkeyError};
use crate::system::background::{BackgroundSettings, BackgroundState, StartHidden};
use crate::capture::PendingCaptures;
use crate::system::hello::WindowsHello;
use crate::vault::crypto;
use crate::vault::hello::{HelloProvider, CHALLENGE_LEN};
use crate::vault::backup::{self, Preview, Restored};
use crate::vault::{Vault, VaultError, VaultStatus};

pub struct VaultState(pub Mutex<Vault>);

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn internal(detail: &str) -> VaultError {
    VaultError::Io { detail: detail.into() }
}

/// Exécute `f` sur le coffre, hors du fil de l'interface.
async fn with_vault<T, F>(app: AppHandle, f: F) -> Result<T, VaultError>
where
    T: Send + 'static,
    F: FnOnce(&mut Vault) -> Result<T, VaultError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VaultState>();
        let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
        f(&mut vault)
    })
    .await
    .map_err(|_| internal("tâche du coffre interrompue"))?
}

#[tauri::command]
pub fn vault_status(state: State<'_, VaultState>, place: State<'_, crate::data_location::PlaceState>) -> Result<VaultStatus, VaultError> {
    let location = &place.0.location;
    if location.moved && !location.dir.exists() {
        return Err(VaultError::FolderMissing { path: location.dir.to_string_lossy().into_owned() });
    }
    let vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
    vault.status(now())
}

// ——— Emplacement des données ———

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPlace {
    path: String,
    /// Les données ne sont plus dans le dossier d'origine.
    moved: bool,
    /// Faux en développement (dossier jetable).
    movable: bool,
}

#[tauri::command]
pub fn data_location_get(place: State<'_, crate::data_location::PlaceState>) -> DataPlace {
    let p = &place.0;
    DataPlace { path: p.location.dir.to_string_lossy().into_owned(), moved: p.location.moved, movable: p.movable }
}

fn refused(e: crate::data_location::MoveError) -> VaultError {
    let (reason, detail) = e.parts();
    VaultError::MoveRefused { reason: reason.into(), detail }
}

/// Déplace les données (mot de passe exigé) vers un dossier choisi, ou les ramène au dossier
/// d'origine ; renvoie le nouvel emplacement (`None` : choix annulé). Aqueli redémarre ensuite.
#[tauri::command]
pub async fn data_move(app: AppHandle, password: String, to_default: bool) -> Result<Option<String>, VaultError> {
    let password = Zeroizing::new(password);
    let place = app.state::<crate::data_location::PlaceState>().0.clone();
    if !place.movable {
        return Err(VaultError::MoveRefused { reason: "developpement".into(), detail: String::new() });
    }
    let check = password.clone();
    with_vault(app.clone(), move |v| v.confirm_password(&check, now())).await?;
    let target = if to_default {
        Some(place.default_dir.clone())
    } else {
        let picker = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            #[cfg(windows)]
            let chosen = pick(&picker, crate::system::dialogs::Pick::Folder { title: crate::lang::text(crate::lang::of(&picker), "Nouvel emplacement des données") });
            #[cfg(not(windows))]
            let chosen: Option<PathBuf> = {
                let _ = &picker;
                None
            };
            chosen.map(|c| crate::data_location::target_in(&c))
        })
        .await
        .map_err(|_| internal("choix interrompu"))?
    };
    let Some(target) = target else {
        return Ok(None);
    };
    crate::data_location::check_target(&place.location.dir, &target, &place.default_dir).map_err(refused)?;
    let mover = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = mover.state::<VaultState>();
        let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
        // Base fermée pendant la copie : rien ne s'y écrit.
        vault.lock();
        crate::note_window::close_all(&mover);
        if let Err(e) = crate::data_location::move_data(&place.location.dir, &target, &place.default_dir) {
            // Rien n'a changé : le compte se rouvre là où il était.
            let _ = vault.unlock(&password, now());
            return Err(refused(e));
        }
        // Le coffre suit les données, puis Aqueli redémarre sur le nouvel emplacement.
        let mut moved = Vault::new(target.clone());
        #[cfg(windows)]
        moved.set_logon(crate::system::session::logon_marker());
        *vault = moved;
        // Fenêtre affichée au redémarrage, même après un démarrage discret avec Windows.
        crate::accounts::mark_switch(&target);
        let handle = mover.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            handle.restart();
        });
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| internal("déplacement interrompu"))?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    /// À montrer une seule fois à l'utilisateur ; n'est enregistrée nulle part.
    recovery_key: String,
}

/// Coffre tout juste ouvert : les éléments capturés pendant le verrouillage le rejoignent.
fn after_unlock(app: &AppHandle, vault: &mut Vault) {
    if let Some(conn) = vault.connection_mut() {
        crate::capture::flush(app, conn, now());
    }
    // Sauvegarde du jour si besoin, un peu après, sans ralentir l'ouverture.
    backups::check_soon(app);
    // Dossier d'import et guide à jour, sans ralentir l'ouverture.
    let handle = app.clone();
    std::thread::spawn(move || {
        if import::root(&handle).and_then(|root| import::prepare(&root, crate::lang::of(&handle))).is_err() {
            crate::diagnostic::note(&handle, "import : dossier indisponible");
        }
    });
}

#[tauri::command]
pub async fn vault_create(app: AppHandle, password: String) -> Result<Created, VaultError> {
    let password = Zeroizing::new(password);
    let handle = app.clone();
    with_vault(app, move |v| {
        let key = v.create(&password, now())?;
        after_unlock(&handle, v);
        Ok(Created { recovery_key: key.to_string() })
    })
    .await
}

#[tauri::command]
pub async fn vault_unlock(app: AppHandle, password: String) -> Result<(), VaultError> {
    let password = Zeroizing::new(password);
    let handle = app.clone();
    with_vault(app, move |v| {
        v.unlock(&password, now())?;
        after_unlock(&handle, v);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn vault_recover(app: AppHandle, recovery_key: String, new_password: String) -> Result<(), VaultError> {
    let recovery_key = Zeroizing::new(recovery_key);
    let new_password = Zeroizing::new(new_password);
    let handle = app.clone();
    with_vault(app, move |v| {
        v.recover(&recovery_key, &new_password, now())?;
        after_unlock(&handle, v);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn vault_change_password(app: AppHandle, current: String, new_password: String) -> Result<(), VaultError> {
    let current = Zeroizing::new(current);
    let new_password = Zeroizing::new(new_password);
    with_vault(app, move |v| {
        if !v.is_unlocked() {
            return Err(VaultError::Locked);
        }
        v.change_password(&current, &new_password, now())
    })
    .await
}

#[tauri::command]
pub async fn vault_new_recovery_key(app: AppHandle, password: String) -> Result<Created, VaultError> {
    let password = Zeroizing::new(password);
    with_vault(app, move |v| {
        let key = v.new_recovery_key(&password, now())?;
        Ok(Created { recovery_key: key.to_string() })
    })
    .await
}

/// Supprime définitivement le compte ouvert (mot de passe exigé) : base, serrures, réglages,
/// journal de diagnostic et, si demandé, ses sauvegardes de ce PC sont écrasés puis effacés ;
/// sa clé Windows Hello est retirée. Les autres comptes de ce PC et les copies faites ailleurs
/// (clé USB) restent. Renvoie vrai si Aqueli redémarre sur un autre compte.
#[tauri::command]
pub async fn account_delete(app: AppHandle, password: String, include_backups: bool) -> Result<bool, VaultError> {
    let password = Zeroizing::new(password);
    let active = app.state::<crate::accounts::ActiveAccount>().0.clone();
    let hello = hello_of(&app);
    let windows = app.clone();
    let handle = app.clone();
    let restart = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VaultState>();
        let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
        vault.confirm_password(&password, now())?;
        vault.lock();
        crate::note_window::close_all(&windows);
        {
            use crate::vault::hello::HelloProvider;
            hello.delete();
        }
        let io = |e: std::io::Error| VaultError::Io { detail: e.to_string() };
        crate::accounts::shred_account(&active.root, &active.id, include_backups).map_err(io)?;
        let mut registry = crate::accounts::load(&active.root);
        crate::accounts::forget(&active.root, &mut registry, &active.id).map_err(io)?;
        // Il reste d'autres comptes : Aqueli s'ouvre sur l'un d'eux.
        Ok::<bool, VaultError>(!registry.comptes.is_empty())
    })
    .await
    .map_err(|_| internal("suppression interrompue"))??;
    if restart {
        restart_soon(&handle);
    }
    Ok(restart)
}

// ——— Comptes de ce PC ———

/// Redémarre Aqueli un peu plus tard (l'interface a le temps de répondre), fenêtre affichée.
fn restart_soon(app: &AppHandle) {
    crate::accounts::mark_switch(&app.state::<crate::accounts::ActiveAccount>().0.root);
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        handle.restart();
    });
}

/// Un compte de l'écran de choix : pseudo et image de profil (préférences lisibles avant le
/// déverrouillage), et s'il a déjà son coffre.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    id: String,
    name: String,
    avatar: String,
    ready: bool,
    current: bool,
}

#[tauri::command]
pub fn accounts_list(app: AppHandle) -> Vec<AccountView> {
    let active = &app.state::<crate::accounts::ActiveAccount>().0;
    crate::accounts::load(&active.root)
        .comptes
        .iter()
        .map(|e| {
            let dir = crate::accounts::dir_of(&active.root, &e.id);
            let (name, avatar) = crate::accounts::profile(&crate::prefs::load(&dir));
            AccountView {
                id: e.id.clone(),
                name,
                avatar,
                ready: crate::accounts::has_vault(&dir),
                current: e.id == active.id,
            }
        })
        .collect()
}

/// Les captures rapides en attente iraient dans le compte suivant : le changement attend.
fn ensure_no_pending_capture(app: &AppHandle) -> Result<(), VaultError> {
    let count = app.state::<PendingCaptures>().0.lock().map(|l| l.len()).unwrap_or(0);
    if count > 0 {
        return Err(VaultError::CapturesPending { count });
    }
    Ok(())
}

/// Ferme le coffre et les notes ouvertes avant un redémarrage sur un autre compte (hors du fil
/// principal : le coffre peut être occupé par un déverrouillage en cours).
async fn close_for_switch(app: &AppHandle) -> Result<(), VaultError> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut vault) = handle.state::<VaultState>().0.lock() {
            vault.lock();
        }
        crate::note_window::close_all(&handle);
    })
    .await
    .map_err(|_| internal("fermeture interrompue"))
}

fn io_error(e: std::io::Error) -> VaultError {
    VaultError::Io { detail: e.to_string() }
}

/// Ouvre un autre compte de ce PC : Aqueli se verrouille puis redémarre sur lui.
#[tauri::command]
pub async fn accounts_switch(app: AppHandle, id: String) -> Result<(), VaultError> {
    let active = app.state::<crate::accounts::ActiveAccount>().0.clone();
    if id == active.id {
        return Ok(());
    }
    ensure_no_pending_capture(&app)?;
    let mut registry = crate::accounts::load(&active.root);
    if !crate::accounts::select(&active.root, &mut registry, &id).map_err(io_error)? {
        return Err(VaultError::AccountUnknown);
    }
    close_for_switch(&app).await?;
    restart_soon(&app);
    Ok(())
}

/// Ajoute un compte : Aqueli redémarre sur lui, pour choisir son pseudo et son mot de passe.
#[tauri::command]
pub async fn accounts_add(app: AppHandle) -> Result<(), VaultError> {
    let active = app.state::<crate::accounts::ActiveAccount>().0.clone();
    ensure_no_pending_capture(&app)?;
    let mut registry = crate::accounts::load(&active.root);
    if registry.comptes.len() >= crate::accounts::MAX_ACCOUNTS {
        return Err(VaultError::TooManyAccounts { max: crate::accounts::MAX_ACCOUNTS });
    }
    crate::accounts::add(&active.root, &mut registry, now()).map_err(io_error)?;
    close_for_switch(&app).await?;
    restart_soon(&app);
    Ok(())
}

/// Abandonne un compte ajouté dont le coffre n'a pas été créé, et revient au compte d'avant.
/// Les sauvegardes gardées dans son dossier restent.
#[tauri::command]
pub async fn accounts_cancel_new(app: AppHandle) -> Result<(), VaultError> {
    let active = app.state::<crate::accounts::ActiveAccount>().0.clone();
    let dir = crate::accounts::dir_of(&active.root, &active.id);
    let mut registry = crate::accounts::load(&active.root);
    let others = registry.comptes.iter().any(|e| e.id != active.id);
    if crate::accounts::has_vault(&dir) || !others {
        return Err(VaultError::AccountUnknown);
    }
    ensure_no_pending_capture(&app)?;
    close_for_switch(&app).await?;
    crate::accounts::shred_account(&active.root, &active.id, false).map_err(io_error)?;
    crate::accounts::forget(&active.root, &mut registry, &active.id).map_err(io_error)?;
    restart_soon(&app);
    Ok(())
}

/// Windows Hello du compte ouvert (chaque compte a sa clé).
fn hello_of(app: &AppHandle) -> WindowsHello {
    WindowsHello { names: app.state::<crate::accounts::ActiveAccount>().0.hello_names() }
}

/// Exécute un appel Windows Hello (qui attend le geste de la personne) hors du coffre.
async fn with_hello<T, F>(app: &AppHandle, f: F) -> Result<T, VaultError>
where
    T: Send + 'static,
    F: FnOnce(&WindowsHello) -> Result<T, VaultError> + Send + 'static,
{
    let hello = hello_of(app);
    tauri::async_runtime::spawn_blocking(move || f(&hello))
        .await
        .map_err(|_| internal("tâche Windows Hello interrompue"))?
}

#[tauri::command]
pub async fn hello_supported(app: AppHandle) -> bool {
    with_hello(&app, |hello| Ok(hello.is_supported())).await.unwrap_or(false)
}

#[tauri::command]
pub async fn vault_hello_enable(app: AppHandle) -> Result<(), VaultError> {
    with_vault(app.clone(), |v| if v.is_unlocked() { Ok(()) } else { Err(VaultError::Locked) }).await?;
    let (challenge, signature) = with_hello(&app, |hello| {
        if !hello.is_supported() {
            return Err(VaultError::HelloUnsupported);
        }
        hello.create()?;
        let challenge = crypto::random_bytes::<CHALLENGE_LEN>()?;
        let signature = Zeroizing::new(hello.sign(&challenge)?);
        Ok((challenge, signature))
    })
    .await?;
    with_vault(app, move |v| v.enable_hello_with(&challenge, &signature, now())).await
}

#[tauri::command]
pub async fn vault_hello_disable(app: AppHandle) -> Result<(), VaultError> {
    with_vault(app.clone(), |v| v.disable_hello(now())).await?;
    with_hello(&app, |hello| {
        hello.delete();
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn vault_unlock_hello(app: AppHandle) -> Result<(), VaultError> {
    let challenge = with_vault(app.clone(), |v| v.hello_challenge(now())).await?;
    let signature = with_hello(&app, move |hello| Ok(Zeroizing::new(hello.sign(&challenge)?))).await?;
    let handle = app.clone();
    with_vault(app, move |v| {
        v.unlock_with_hello_signature(&signature, now())?;
        after_unlock(&handle, v);
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn vault_lock(app: AppHandle, state: State<'_, VaultState>) -> Result<(), VaultError> {
    let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
    vault.lock();
    crate::note_window::close_all(&app);
    Ok(())
}

// ——— Espaces ———

/// Exécute `f` sur la base ouverte, hors du fil de l'interface.
async fn with_db<T, F>(app: AppHandle, f: F) -> Result<T, DataError>
where
    T: Send + 'static,
    F: FnOnce(&mut Connection) -> Result<T, DataError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VaultState>();
        let mut vault = state
            .0
            .lock()
            .map_err(|_| DataError::Database { detail: "coffre indisponible".into() })?;
        let conn = vault.connection_mut().ok_or(DataError::Locked)?;
        f(conn)
    })
    .await
    .map_err(|_| DataError::Database { detail: "tâche interrompue".into() })?
}

#[tauri::command]
pub async fn spaces_list(app: AppHandle) -> Result<Vec<Space>, DataError> {
    with_db(app, |c| spaces::list(c)).await
}

#[tauri::command]
pub async fn spaces_create(app: AppHandle, name: String, color: String, icon: String) -> Result<Space, DataError> {
    with_db(app, move |c| spaces::create(c, &name, &color, &icon, now())).await
}

#[tauri::command]
pub async fn spaces_update(
    app: AppHandle,
    id: String,
    name: String,
    color: String,
    icon: String,
) -> Result<Space, DataError> {
    with_db(app, move |c| spaces::update(c, &id, &name, &color, &icon)).await
}

#[tauri::command]
pub async fn spaces_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| spaces::delete(c, &id)).await
}

#[tauri::command]
pub async fn spaces_restore(app: AppHandle, space: SpaceInput) -> Result<Space, DataError> {
    with_db(app, move |c| spaces::restore(c, &space.into(), now())).await
}

#[tauri::command]
pub async fn spaces_reorder(app: AppHandle, ids: Vec<String>) -> Result<Vec<Space>, DataError> {
    with_db(app, move |c| spaces::reorder(c, &ids)).await
}

/// Espace renvoyé par l'interface pour « Annuler » une suppression.
#[derive(serde::Deserialize)]
pub struct SpaceInput {
    id: String,
    name: String,
    color: String,
    icon: String,
    position: i64,
}

impl From<SpaceInput> for Space {
    fn from(s: SpaceInput) -> Self {
        Space { id: s.id, name: s.name, color: s.color, icon: s.icon, position: s.position }
    }
}

/// Dossier des données (%APPDATA%\Aqueli), où sont rangées les préférences d'affichage.
pub struct DataDir(pub PathBuf);

#[tauri::command(async)]
pub fn prefs_load(dir: State<'_, DataDir>) -> Prefs {
    prefs::load(&dir.0)
}

#[tauri::command(async)]
pub fn prefs_save(app: AppHandle, dir: State<'_, DataDir>, prefs: Prefs) -> Result<(), PrefsError> {
    let before = crate::lang::current(&dir.0);
    prefs::save(&dir.0, &prefs)?;
    // Langue changée : le menu de l'icône et le titre de la capture rapide suivent.
    let after = crate::lang::from_prefs(&prefs);
    if after != before {
        crate::system::background::retitle(&app, after);
    }
    Ok(())
}

// ——— Tâches ———

#[tauri::command]
pub async fn tasks_list(app: AppHandle, done_since: i64) -> Result<Vec<Task>, DataError> {
    with_db(app, move |c| tasks::list(c, done_since, now())).await
}

/// Tâches terminées avant `before` (identifiant, date, espace, projet) : avancement et Bilan.
#[tauri::command]
pub async fn tasks_done_before(app: AppHandle, before: i64) -> Result<Vec<DoneTask>, DataError> {
    with_db(app, move |c| tasks::done_before(c, before)).await
}

// `today` : date du jour sur ce PC (« AAAA-MM-JJ »), pour les échéances des tâches répétées.

#[tauri::command]
pub async fn tasks_create(app: AppHandle, task: TaskInput, today: String) -> Result<Task, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| tasks::create(c, &task, now(), today)).await
}

#[tauri::command]
pub async fn tasks_update(app: AppHandle, id: String, task: TaskInput, today: String) -> Result<Task, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| tasks::update(c, &id, &task, now(), today)).await
}

#[tauri::command]
pub async fn tasks_set_done(app: AppHandle, id: String, done: bool, today: String) -> Result<DoneResult, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| tasks::set_done(c, &id, done, now(), today)).await
}

#[tauri::command]
pub async fn tasks_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| tasks::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn tasks_restore(app: AppHandle, id: String) -> Result<Task, DataError> {
    with_db(app, move |c| tasks::restore(c, &id, now())).await
}

// ——— Événements du calendrier ———

#[tauri::command]
pub async fn events_list(app: AppHandle) -> Result<Vec<Event>, DataError> {
    with_db(app, move |c| events::list(c, now())).await
}

#[tauri::command]
pub async fn events_create(app: AppHandle, event: EventInput) -> Result<Event, DataError> {
    with_db(app, move |c| events::create(c, &event, now())).await
}

#[tauri::command]
pub async fn events_update(app: AppHandle, id: String, event: EventInput) -> Result<Event, DataError> {
    with_db(app, move |c| events::update(c, &id, &event, now())).await
}

#[tauri::command]
pub async fn events_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| events::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn events_restore(app: AppHandle, id: String) -> Result<Event, DataError> {
    with_db(app, move |c| events::restore(c, &id, now())).await
}

// ——— Obligations ———

#[tauri::command]
pub async fn obligations_list(app: AppHandle) -> Result<Vec<Obligation>, DataError> {
    with_db(app, move |c| obligations::list(c, now())).await
}

#[tauri::command]
pub async fn obligations_create(app: AppHandle, obligation: ObligationInput) -> Result<Obligation, DataError> {
    with_db(app, move |c| obligations::create(c, &obligation, now())).await
}

#[tauri::command]
pub async fn obligations_update(app: AppHandle, id: String, obligation: ObligationInput) -> Result<Obligation, DataError> {
    with_db(app, move |c| obligations::update(c, &id, &obligation, now())).await
}

#[tauri::command]
pub async fn obligations_pay(app: AppHandle, id: String, today: String) -> Result<Obligation, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| obligations::pay(c, &id, today, now())).await
}

/// Prélèvements automatiques arrivés jusqu'à `today` (date de ce PC).
#[tauri::command]
pub async fn obligations_autopay(app: AppHandle, today: String) -> Result<Vec<Obligation>, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| obligations::autopay(c, today, now())).await
}

#[tauri::command]
pub async fn obligations_payments(app: AppHandle, id: String) -> Result<Vec<obligations::Payment>, DataError> {
    with_db(app, move |c| obligations::payments(c, &id)).await
}

#[tauri::command]
pub async fn obligations_forget_payment(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| obligations::forget_last_payment(c, &id)).await
}

#[tauri::command]
pub async fn obligations_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| obligations::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn obligations_restore(app: AppHandle, id: String) -> Result<Obligation, DataError> {
    with_db(app, move |c| obligations::restore(c, &id, now())).await
}

#[tauri::command]
pub async fn obligation_categories_list(app: AppHandle) -> Result<Vec<CategoryCustom>, DataError> {
    with_db(app, |c| obligations::categories(c)).await
}

#[tauri::command]
pub async fn obligation_categories_update(app: AppHandle, category: CategoryCustom) -> Result<CategoryCustom, DataError> {
    with_db(app, move |c| obligations::customize_category(c, &category)).await
}

// ——— Notes ———

#[tauri::command]
pub async fn notes_list(app: AppHandle) -> Result<Vec<NoteSummary>, DataError> {
    with_db(app, |c| notes::list(c, now())).await
}

#[tauri::command]
pub async fn notes_get(app: AppHandle, id: String) -> Result<Note, DataError> {
    with_db(app, move |c| notes::get(c, &id)).await
}

#[tauri::command]
pub async fn notes_create(app: AppHandle, body: NoteBody, meta: NoteMeta) -> Result<NoteSummary, DataError> {
    with_db(app, move |c| notes::create(c, &body, &meta, now())).await
}

#[tauri::command]
pub async fn notes_update_body(app: AppHandle, window: tauri::Window, id: String, body: NoteBody) -> Result<NoteSummary, DataError> {
    let saved = with_db(app.clone(), move |c| notes::update_body(c, &id, &body, now())).await?;
    tell_main_note_changed(&app, &window, &saved.id);
    Ok(saved)
}

#[tauri::command]
pub async fn notes_update_meta(app: AppHandle, window: tauri::Window, id: String, meta: NoteMeta) -> Result<NoteSummary, DataError> {
    let saved = with_db(app.clone(), move |c| notes::update_meta(c, &id, &meta)).await?;
    tell_main_note_changed(&app, &window, &saved.id);
    Ok(saved)
}

#[tauri::command]
pub async fn notes_delete(app: AppHandle, window: tauri::Window, id: String) -> Result<(), DataError> {
    let deleted = id.clone();
    with_db(app.clone(), move |c| notes::delete(c, &id, now())).await?;
    tell_main_note_changed(&app, &window, &deleted);
    Ok(())
}

/// Modification faite dans une fenêtre de note : la fenêtre principale relit ses notes.
fn tell_main_note_changed(app: &AppHandle, window: &tauri::Window, id: &str) {
    if window.label() != "main" {
        let _ = app.emit_to("main", crate::note_window::SAVED_EVENT, id.to_string());
    }
}

// ——— Note dans sa propre fenêtre ———

#[tauri::command]
pub async fn note_window_open(app: AppHandle, id: String, title: String) -> Result<(), DataError> {
    if !crate::note_window::is_note_id(&id) {
        return Err(DataError::Invalid { field: "id".into() });
    }
    let title: String = title.chars().filter(|c| !c.is_control()).take(80).collect();
    let title = if title.trim().is_empty() { crate::lang::text(crate::lang::of(&app), "Sans titre").to_string() } else { title.trim().to_string() };
    crate::note_window::open(&app, &id, &title).map_err(|_| DataError::Database { detail: "fenêtre indisponible".into() })
}

/// Notes ouvertes dans leur fenêtre.
#[tauri::command]
pub fn note_windows_list(app: AppHandle) -> Vec<String> {
    crate::note_window::open_notes(&app)
}

/// Ferme la fenêtre d'une note (« Ramener ici »).
#[tauri::command]
pub fn note_window_close(app: AppHandle, id: String) {
    if let Some(window) = app.get_webview_window(&crate::note_window::label_of(&id)) {
        let _ = window.destroy();
    }
}

/// Avant un verrouillage : les fenêtres de note enregistrent ce qui est en cours de saisie.
#[tauri::command]
pub async fn note_windows_flush(app: AppHandle) {
    let open = crate::note_window::open_notes(&app);
    if open.is_empty() {
        return;
    }
    for id in open {
        let _ = app.emit_to(crate::note_window::label_of(&id).as_str(), crate::note_window::FLUSH_EVENT, ());
    }
    // Attente hors des fils de l'interface : les fenêtres de note ont le temps d'écrire.
    let _ = tauri::async_runtime::spawn_blocking(|| std::thread::sleep(std::time::Duration::from_millis(400))).await;
}

/// La personne travaille dans une fenêtre de note : le verrouillage automatique attend.
#[tauri::command]
pub fn note_window_activity(app: AppHandle) {
    let _ = app.emit_to("main", crate::note_window::ACTIVITY_EVENT, ());
}

/// Ouvre une note dans la fenêtre principale (lien suivi depuis une fenêtre de note) ;
/// `close` : la fenêtre de note se ferme (« Ramener dans Aqueli »).
#[tauri::command]
pub fn note_window_show_in_main(app: AppHandle, window: tauri::Window, id: String, close: bool) {
    if !crate::note_window::is_note_id(&id) {
        return;
    }
    let _ = app.emit_to("main", crate::note_window::OPEN_EVENT, id);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        crate::system::discreet::protect(&main);
    }
    if close && crate::note_window::note_of(window.label()).is_some() {
        let _ = window.destroy();
    }
}

#[tauri::command]
pub async fn notes_restore(app: AppHandle, id: String) -> Result<NoteSummary, DataError> {
    with_db(app, move |c| notes::restore(c, &id)).await
}

#[tauri::command]
pub async fn notes_search(app: AppHandle, query: String) -> Result<Vec<String>, DataError> {
    with_db(app, move |c| notes::search(c, &query)).await
}

#[tauri::command]
pub async fn note_versions_list(app: AppHandle, id: String) -> Result<Vec<NoteVersion>, DataError> {
    with_db(app, move |c| notes::versions(c, &id)).await
}

#[tauri::command]
pub async fn note_versions_get(app: AppHandle, id: String, version: i64) -> Result<NoteVersionContent, DataError> {
    with_db(app, move |c| notes::version(c, &id, version)).await
}

#[tauri::command]
pub async fn note_versions_restore(app: AppHandle, id: String, version: i64) -> Result<Note, DataError> {
    with_db(app, move |c| notes::restore_version(c, &id, version, now())).await
}

#[tauri::command]
pub async fn notebooks_list(app: AppHandle) -> Result<Vec<Notebook>, DataError> {
    with_db(app, |c| notes::notebooks(c)).await
}

#[tauri::command]
pub async fn notebooks_create(app: AppHandle, notebook: NotebookInput) -> Result<Notebook, DataError> {
    with_db(app, move |c| notes::create_notebook(c, &notebook, now())).await
}

#[tauri::command]
pub async fn notebooks_update(app: AppHandle, id: String, notebook: NotebookInput) -> Result<Notebook, DataError> {
    with_db(app, move |c| notes::update_notebook(c, &id, &notebook)).await
}

#[tauri::command]
pub async fn notebooks_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| notes::delete_notebook(c, &id, now())).await
}

#[tauri::command]
pub async fn notebooks_restore(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| notes::restore_notebook(c, &id)).await
}

#[tauri::command]
pub async fn note_templates_list(app: AppHandle) -> Result<Vec<NoteTemplate>, DataError> {
    with_db(app, |c| notes::templates(c)).await
}

#[tauri::command]
pub async fn note_templates_create(app: AppHandle, name: String, content: String) -> Result<NoteTemplate, DataError> {
    with_db(app, move |c| notes::create_template(c, &name, &content, now())).await
}

#[tauri::command]
pub async fn note_templates_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| notes::delete_template(c, &id)).await
}

// ——— Rappels et arrière-plan ———

#[tauri::command]
pub fn reminders_sync(app: AppHandle, state: State<'_, ReminderState>, reminders: Vec<ReminderInput>) -> Result<(), String> {
    let mut scheduler = state.0.lock().map_err(|_| "rappels indisponibles".to_string())?;
    scheduler.replace(reminders);
    let (count, next) = scheduler.summary();
    drop(scheduler);
    let next = next.map_or("aucun".to_string(), |at| format!("dans {} s", at - crate::unix_now()));
    crate::diagnostic::note(&app, &format!("rappels programmés : {count}, prochain {next}"));
    Ok(())
}

/// Période pendant laquelle Aqueli ne tournait pas : ses rappels ont été manqués.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MissedWindow {
    since: i64,
    until: i64,
}

#[tauri::command]
pub fn reminders_missed(state: State<'_, ReminderState>) -> Result<MissedWindow, String> {
    let scheduler = state.0.lock().map_err(|_| "rappels indisponibles".to_string())?;
    Ok(MissedWindow { since: scheduler.missed_since(), until: scheduler.launched_at() })
}

#[tauri::command]
/// Notification d'essai dans 20 secondes, par le même chemin qu'un vrai rappel : on peut
/// fermer la fenêtre entre-temps pour essayer la version « Rappel Aqueli ».
pub fn reminders_test(app: AppHandle, state: State<'_, ReminderState>) -> Result<(), String> {
    let mut scheduler = state.0.lock().map_err(|_| "rappels indisponibles".to_string())?;
    scheduler.add_test(crate::unix_now() + 20, crate::lang::of(&app));
    drop(scheduler);
    crate::diagnostic::note(&app, "notification d'essai programmée dans 20 s");
    Ok(())
}

#[tauri::command]
pub fn background_settings_set(
    state: State<'_, BackgroundState>,
    keep_in_background: bool,
    hide_titles_when_locked: bool,
) -> Result<(), String> {
    let mut settings = state.0.lock().map_err(|_| "réglages indisponibles".to_string())?;
    *settings = BackgroundSettings { keep_in_background, hide_titles_when_locked };
    Ok(())
}

#[tauri::command]
pub fn app_start_hidden(state: State<'_, StartHidden>) -> bool {
    state.0
}

/// Lancement au démarrage de Windows : seulement pour la version installée (la version de
/// développement ne doit jamais s'inscrire au démarrage).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    supported: bool,
    enabled: bool,
}

const AUTOSTART_SUPPORTED: bool = cfg!(all(windows, not(debug_assertions)));

#[tauri::command]
pub fn autostart_get() -> AutostartStatus {
    #[cfg(windows)]
    let enabled = crate::system::autostart::is_enabled();
    #[cfg(not(windows))]
    let enabled = false;
    AutostartStatus { supported: AUTOSTART_SUPPORTED, enabled }
}

#[tauri::command]
pub fn autostart_set(enabled: bool) -> Result<AutostartStatus, String> {
    if !AUTOSTART_SUPPORTED {
        return Err("disponible dans la version installée".into());
    }
    #[cfg(windows)]
    crate::system::autostart::set(enabled)?;
    let _ = enabled;
    Ok(autostart_get())
}

/// Langue proposée tant qu'aucune n'est choisie : celle de l'installation, sinon celle de Windows.
#[tauri::command]
pub fn language_default() -> &'static str {
    crate::lang::system().code()
}

// ——— Capture rapide ———

/// Enregistre l'élément saisi dans la capture rapide ; s'il est verrouillé, Aqueli le garde en
/// mémoire jusqu'au déverrouillage.
#[tauri::command]
pub async fn capture_submit(app: AppHandle, capture: Capture) -> Result<Outcome, DataError> {
    let item = capture.clone();
    match with_db(app.clone(), move |c| crate::capture::save(c, &item, now())).await {
        Ok(()) => {
            crate::capture::announce(&app, &capture);
            Ok(Outcome::Saved)
        }
        Err(DataError::Locked) if crate::capture::keep(&app, capture) => Ok(Outcome::Pending),
        Err(DataError::Locked) => Err(DataError::TooMany { max: crate::capture::MAX_PENDING }),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn capture_status(app: AppHandle, state: State<'_, VaultState>) -> CaptureStatus {
    let locked = state.0.lock().map(|mut v| v.connection_mut().is_none()).unwrap_or(true);
    CaptureStatus { locked, pending: crate::capture::pending(&app) }
}

#[tauri::command]
pub fn capture_hide(app: AppHandle) {
    crate::capture::hide(&app);
}

/// Ouvre la capture rapide (palette, Accueil). Asynchrone, car la fenêtre peut être à créer
/// (voir `focus_mini_open`).
#[tauri::command]
pub async fn capture_show(app: AppHandle) {
    crate::capture::show(&app);
}

#[tauri::command]
pub fn hotkey_get(app: AppHandle) -> Option<Hotkey> {
    hotkey::active(&app)
}

/// Change le raccourci de la capture rapide ; l'interface l'enregistre dans ses préférences.
#[tauri::command]
pub fn hotkey_set(app: AppHandle, hotkey: Hotkey) -> Result<(), HotkeyError> {
    hotkey::register(&app, hotkey)
}

// ——— Sauvegardes ———

/// État des sauvegardes pour Paramètres › Sauvegardes et le rappel de sauvegarde externe.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    last_auto: u64,
    last_external: u64,
    destination: Option<String>,
    destination_available: bool,
    folder: String,
    /// Aucune sauvegarde externe depuis 30 jours (ou jamais).
    external_reminder: bool,
}

#[tauri::command]
pub fn backups_status(dir: State<'_, DataDir>) -> BackupStatus {
    let settings = backups::load_settings(&dir.0);
    let now = now();
    let external_reminder = settings.external_reminder(now);
    BackupStatus {
        external_reminder,
        last_auto: settings.last_auto,
        last_external: settings.last_external,
        destination_available: backups::available_destination(&settings).is_some(),
        destination: settings.destination,
        folder: backups::local_folder(&dir.0).to_string_lossy().into_owned(),
    }
}

#[tauri::command(async)]
pub fn backups_list(dir: State<'_, DataDir>) -> Vec<BackupInfo> {
    backups::all(&dir.0)
}

/// Page de soutien du projet, ouverte dans le navigateur de Windows. L'adresse est fixe :
/// l'interface ne peut rien faire ouvrir d'autre, et Aqueli lui-même ne se connecte à rien.
const SUPPORT_URL: &str = "https://ko-fi.com/areemi";

#[tauri::command(async)]
pub fn support_open() -> Result<(), VaultError> {
    crate::files::open_with_windows(std::path::Path::new(SUPPORT_URL))?;
    Ok(())
}

/// Ouvre le dossier des sauvegardes de ce PC dans l'Explorateur.
#[tauri::command(async)]
pub fn backups_open_folder(dir: State<'_, DataDir>) -> Result<(), VaultError> {
    let folder = backups::local_folder(&dir.0);
    std::fs::create_dir_all(&folder)?;
    crate::files::open_with_windows(&folder)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedBackup {
    backup: BackupInfo,
    /// Copiée aussi sur la destination externe.
    external: bool,
}

/// « Sauvegarder maintenant ».
#[tauri::command]
pub async fn backups_create(app: AppHandle) -> Result<CreatedBackup, VaultError> {
    tauri::async_runtime::spawn_blocking(move || backups::run(&app, "manuelle"))
        .await
        .map_err(|_| internal("sauvegarde interrompue"))?
        .map(|(backup, external)| CreatedBackup { backup, external })
}

/// Une sauvegarde est lisible depuis l'interface si elle est dans un dossier d'Aqueli, ou si
/// la personne vient de la choisir.
fn allowed_backup(app: &AppHandle, path: &str) -> Result<PathBuf, VaultError> {
    let path = PathBuf::from(path);
    let dir = app.state::<DataDir>().0.clone();
    let picked = app.state::<PickedFile>().0.lock().ok().and_then(|p| p.clone());
    if backups::is_known(&dir, &path) || picked.as_ref() == Some(&path) {
        Ok(path)
    } else {
        Err(VaultError::NotFound)
    }
}

fn read_backup(path: &Path) -> Result<backup::BackupFile, VaultError> {
    backup::decode(&std::fs::read(path)?)
}

/// Aperçu d'une sauvegarde : son contenu (nombre d'éléments). Sans `password`, la clé du
/// compte ouvert ; `None` : autre compte, son mot de passe est demandé.
#[tauri::command]
pub async fn backups_preview(app: AppHandle, path: String, password: Option<String>) -> Result<Option<Preview>, VaultError> {
    let path = allowed_backup(&app, &path)?;
    let password = password.map(Zeroizing::new);
    with_vault(app, move |v| {
        let file = read_backup(&path)?;
        v.backup_preview(&file, password.as_deref().map(|p| p.as_str()))
    })
    .await
}

/// Restaure une sauvegarde. Les données actuelles sont d'abord sauvegardées (« avant
/// restauration »). Aqueli reste ouvert sur les données restaurées.
#[tauri::command]
pub async fn backups_restore(app: AppHandle, path: String, password: Option<String>) -> Result<Restored, VaultError> {
    let path = allowed_backup(&app, &path)?;
    let password = password.map(Zeroizing::new);
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let file = read_backup(&path)?;
        let unlocked = handle.state::<VaultState>().0.lock().map(|v| v.is_unlocked()).unwrap_or(false);
        if unlocked {
            backups::run(&handle, "avant-restauration")?;
        }
        let state = handle.state::<VaultState>();
        let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
        let restored = vault.restore(&file, password.as_deref().map(|p| p.as_str()), now())?;
        crate::diagnostic::note(&handle, "sauvegarde restaurée");
        Ok(restored)
    })
    .await
    .map_err(|_| internal("restauration interrompue"))?
}

#[tauri::command]
pub fn backups_delete(app: AppHandle, path: String) -> Result<(), VaultError> {
    let dir = app.state::<DataDir>().0.clone();
    let path = PathBuf::from(path);
    if !backups::is_known(&dir, &path) {
        return Err(VaultError::NotFound);
    }
    std::fs::remove_file(path)?;
    Ok(())
}

/// Fenêtre principale, propriétaire des fenêtres de choix de Windows.
fn owner(app: &AppHandle) -> isize {
    #[cfg(windows)]
    {
        app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map_or(0, |h| h.0 as isize)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        0
    }
}

#[cfg(windows)]
fn pick(app: &AppHandle, what: crate::system::dialogs::Pick) -> Option<PathBuf> {
    crate::system::dialogs::pick(owner(app), what)
}

/// Choisit la destination externe (clé USB, disque) et y copie la dernière sauvegarde.
#[tauri::command]
pub async fn backups_choose_destination(app: AppHandle) -> Result<Option<String>, VaultError> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let chosen = pick(&app, crate::system::dialogs::Pick::Folder { title: crate::lang::text(crate::lang::of(&app), "Destination des sauvegardes") });
        #[cfg(not(windows))]
        let chosen: Option<PathBuf> = None;
        let Some(mut folder) = chosen else {
            return Ok(None);
        };
        // Un compte ajouté range ses sauvegardes dans un sous-dossier à son nom : deux comptes
        // sur la même clé USB ne trient jamais les sauvegardes l'un de l'autre.
        let active = app.state::<crate::accounts::ActiveAccount>().0.clone();
        let dir = app.state::<DataDir>().0.clone();
        let (pseudo, _) = crate::accounts::profile(&crate::prefs::load(&dir));
        if let Some(name) = crate::accounts::documents_folder(&active.root, &active.id, &pseudo) {
            folder = folder.join(name);
            std::fs::create_dir_all(&folder).map_err(|e| VaultError::Io { detail: e.to_string() })?;
        }
        let mut settings = backups::load_settings(&dir);
        settings.destination = Some(folder.to_string_lossy().into_owned());
        settings.last_external = 0;
        backups::save_settings(&dir, &settings)?;
        backups::copy_to_destination(&app, &dir, now());
        Ok(settings.destination)
    })
    .await
    .map_err(|_| internal("choix interrompu"))?
}

#[tauri::command]
pub fn backups_clear_destination(dir: State<'_, DataDir>) -> Result<(), VaultError> {
    let mut settings = backups::load_settings(&dir.0);
    settings.destination = None;
    backups::save_settings(&dir.0, &settings)
}

/// « Exporter le compte » : un fichier de sauvegarde là où la personne le choisit.
#[tauri::command]
pub async fn backups_export(app: AppHandle) -> Result<Option<String>, VaultError> {
    let logger = app.clone();
    let written = tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, VaultError> {
        let (day, _) = backups::local_now();
        #[cfg(windows)]
        let target = pick(
            &app,
            crate::system::dialogs::Pick::SaveFile {
                title: crate::lang::text(crate::lang::of(&app), "Exporter le compte"),
                filter: (crate::lang::text(crate::lang::of(&app), "Sauvegarde Aqueli"), "*.aqueli"),
                default_name: &format!("Aqueli export {day}.aqueli"),
                extension: backups::EXTENSION,
            },
        );
        #[cfg(not(windows))]
        let target: Option<PathBuf> = None;
        let Some(target) = target else {
            return Ok(None);
        };
        let version = app.package_info().version.to_string();
        let bytes = {
            let state = app.state::<VaultState>();
            let mut vault = state.0.lock().map_err(|_| internal("coffre indisponible"))?;
            vault.backup("export", &day, &version, now())?
        };
        crate::files::write_atomic(&target, &bytes)?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| internal("export interrompu"))??;
    if written.is_some() {
        note_export(logger, "Compte entier (sauvegarde chiffrée)".into()).await;
    }
    Ok(written)
}

/// « Restaurer depuis un fichier… » : choix d'une sauvegarde (clé USB, autre PC).
#[tauri::command]
pub async fn backups_pick_file(app: AppHandle) -> Result<Option<BackupInfo>, VaultError> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let chosen = pick(
            &app,
            crate::system::dialogs::Pick::OpenFile {
                title: crate::lang::text(crate::lang::of(&app), "Restaurer une sauvegarde"),
                filter: (crate::lang::text(crate::lang::of(&app), "Sauvegarde Aqueli"), "*.aqueli"),
                folder: Some(&backups::local_folder(&app.state::<DataDir>().0)),
            },
        );
        #[cfg(not(windows))]
        let chosen: Option<PathBuf> = None;
        let Some(path) = chosen else {
            return Ok(None);
        };
        let manifest = backup::read_manifest(&path)?;
        if let Ok(mut picked) = app.state::<PickedFile>().0.lock() {
            *picked = Some(path.clone());
        }
        Ok(Some(backups::describe(&path, &manifest)))
    })
    .await
    .map_err(|_| internal("choix interrompu"))?
}

// ——— Import ———

/// Dossier d'import, guide et fichiers en attente (Paramètres › Import, surveillance du dossier).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportStatus {
    folder: String,
    guide: String,
    files: Vec<ImportFile>,
}

fn unlocked(app: &AppHandle) -> Result<(), ImportError> {
    let state = app.state::<VaultState>();
    let open = state.0.lock().map(|mut v| v.connection_mut().is_some()).unwrap_or(false);
    if open {
        Ok(())
    } else {
        Err(ImportError::Locked)
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, ImportError> + Send + 'static) -> Result<T, ImportError> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|_| ImportError::Io)?
}

#[tauri::command]
pub async fn import_status(app: AppHandle) -> Result<ImportStatus, ImportError> {
    blocking(move || {
        let root = import::root(&app)?;
        let folder = import::folder(&root);
        std::fs::create_dir_all(&folder)?;
        Ok(ImportStatus {
            folder: folder.to_string_lossy().into_owned(),
            guide: import::guide_folder(&root, crate::lang::of(&app)).to_string_lossy().into_owned(),
            files: import::list(&folder),
        })
    })
    .await
}

/// « Importer un fichier » : fenêtre « Ouvrir » de Windows ; `None` si elle a été fermée.
#[tauri::command]
pub async fn import_pick_file(app: AppHandle) -> Result<Option<ImportFile>, ImportError> {
    blocking(move || {
        unlocked(&app)?;
        #[cfg(windows)]
        let chosen = pick(
            &app,
            crate::system::dialogs::Pick::OpenFile {
                title: crate::lang::text(crate::lang::of(&app), "Importer un fichier"),
                filter: (crate::lang::text(crate::lang::of(&app), "Excel, CSV, texte, agenda ou contacts (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)"), "*.xlsx;*.csv;*.txt;*.md;*.ics;*.vcf"),
                folder: None,
            },
        );
        #[cfg(not(windows))]
        let chosen: Option<PathBuf> = None;
        let Some(path) = chosen else {
            return Ok(None);
        };
        import::remember(&app, std::slice::from_ref(&path));
        let inside = import::allowed(&app, &path)?;
        Ok(Some(import::describe(&path, inside)?))
    })
    .await
}

/// Description d'un fichier glissé sur la fenêtre (retenu par le cœur au moment du dépôt).
#[tauri::command]
pub async fn import_describe(app: AppHandle, path: String) -> Result<ImportFile, ImportError> {
    blocking(move || {
        unlocked(&app)?;
        let path = PathBuf::from(path);
        let inside = import::allowed(&app, &path)?;
        import::describe(&path, inside)
    })
    .await
}

/// Contenu brut d'un fichier (10 Mo au plus), lu par l'interface.
#[tauri::command]
pub async fn import_read(app: AppHandle, path: String) -> Result<tauri::ipc::Response, ImportError> {
    blocking(move || {
        unlocked(&app)?;
        let path = PathBuf::from(path);
        import::allowed(&app, &path)?;
        Ok(tauri::ipc::Response::new(import::read(&path)?))
    })
    .await
}

/// Crée tous les éléments validés dans l'aperçu, en une fois.
#[tauri::command]
pub async fn import_apply(app: AppHandle, batch: Batch, today: String) -> Result<Imported, ImportFailure> {
    let today = tasks::parse_today(&today)?;
    let handle = app.clone();
    let created = tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<VaultState>();
        let mut vault = state
            .0
            .lock()
            .map_err(|_| DataError::Database { detail: "coffre indisponible".into() })?;
        let conn = vault.connection_mut().ok_or(DataError::Locked)?;
        import::apply(conn, &batch, now(), today)
    })
    .await
    .map_err(|_| DataError::Database { detail: "tâche interrompue".into() })??;
    let total = created.tasks.len() + created.events.len() + created.obligations.len() + created.notes.len();
    // Jamais le contenu ni le nom du fichier dans le journal : seulement le nombre.
    crate::diagnostic::note(&handle, &format!("import : {total} éléments"));
    Ok(created)
}

/// Annule un import : les éléments créés vont à la corbeille.
#[tauri::command]
pub async fn import_undo(app: AppHandle, created: Imported, restore: Option<import::Updates>, today: String) -> Result<(), DataError> {
    let today = tasks::parse_today(&today)?;
    let restore = restore.unwrap_or_default();
    with_db(app, move |c| import::undo(c, &created, &restore, now(), today)).await
}

/// Après l'import : supprime le fichier du dossier d'import, ou le range dans Import\Traités.
#[tauri::command]
pub async fn import_finish(app: AppHandle, path: String, keep: bool) -> Result<(), ImportError> {
    blocking(move || {
        unlocked(&app)?;
        let folder = import::folder(&import::root(&app)?);
        import::finish(&folder, Path::new(&path), keep)
    })
    .await
}

/// Ouvre le dossier d'import (« dossier »), le guide dans le navigateur (« guide ») ou le
/// dossier des modèles et exemples (« modeles »).
#[tauri::command]
pub async fn import_open(app: AppHandle, target: String) -> Result<(), ImportError> {
    blocking(move || {
        let root = import::root(&app)?;
        let lang = crate::lang::of(&app);
        let path = match target.as_str() {
            "guide" => {
                import::prepare(&root, lang)?;
                import::readme(&root, lang)
            }
            "modeles" => {
                import::prepare(&root, lang)?;
                import::guide_folder(&root, lang)
            }
            _ => {
                let folder = import::folder(&root);
                std::fs::create_dir_all(&folder)?;
                folder
            }
        };
        crate::files::open_with_windows(&path)?;
        Ok(())
    })
    .await
}

/// « Ne pas déranger » pendant une séance de Focus : les rappels attendent jusqu'à `until`
/// (secondes Unix) ; `None` : fin du silence.
#[tauri::command]
pub fn reminders_quiet(state: State<'_, ReminderState>, until: Option<i64>) -> Result<(), String> {
    let mut scheduler = state.0.lock().map_err(|_| "rappels indisponibles".to_string())?;
    scheduler.set_quiet(until);
    Ok(())
}

// ——— Journal ———

#[tauri::command]
pub async fn journal_list(app: AppHandle) -> Result<Vec<JournalSummary>, DataError> {
    with_db(app, |c| journal::list(c, now())).await
}

#[tauri::command]
pub async fn journal_get(app: AppHandle, day: String) -> Result<Option<JournalEntry>, DataError> {
    with_db(app, move |c| journal::get(c, &day)).await
}

#[tauri::command]
pub async fn journal_save(app: AppHandle, day: String, page: JournalInput) -> Result<Option<JournalSummary>, DataError> {
    with_db(app, move |c| journal::save(c, &day, &page, now())).await
}

#[tauri::command]
pub async fn journal_delete(app: AppHandle, day: String) -> Result<(), DataError> {
    with_db(app, move |c| journal::delete(c, &day, now())).await
}

#[tauri::command]
pub async fn journal_restore(app: AppHandle, day: String) -> Result<JournalSummary, DataError> {
    with_db(app, move |c| journal::restore(c, &day)).await
}

#[tauri::command]
pub async fn journal_search(app: AppHandle, query: String) -> Result<Vec<String>, DataError> {
    with_db(app, move |c| journal::search(c, &query)).await
}

// ——— Habitudes ———

#[tauri::command]
pub async fn habits_list(app: AppHandle) -> Result<Vec<Habit>, DataError> {
    with_db(app, |c| habits::list(c, now())).await
}

#[tauri::command]
pub async fn habits_checks(app: AppHandle, since: String) -> Result<Vec<HabitCheck>, DataError> {
    with_db(app, move |c| habits::checks(c, &since)).await
}

#[tauri::command]
pub async fn habits_create(app: AppHandle, habit: HabitInput) -> Result<Habit, DataError> {
    with_db(app, move |c| habits::create(c, &habit, now())).await
}

#[tauri::command]
pub async fn habits_update(app: AppHandle, id: String, habit: HabitInput) -> Result<Habit, DataError> {
    with_db(app, move |c| habits::update(c, &id, &habit, now())).await
}

#[tauri::command]
pub async fn habits_archive(app: AppHandle, id: String, archived: bool) -> Result<Habit, DataError> {
    with_db(app, move |c| habits::set_archived(c, &id, archived, now())).await
}

/// Ordre choisi à la souris : objectifs, dossiers, catégories (data/order.rs).
#[tauri::command]
pub async fn order_save(app: AppHandle, kind: String, ids: Vec<String>) -> Result<(), DataError> {
    with_db(app, move |c| crate::data::order::reorder(c, &kind, &ids)).await
}

#[tauri::command]
pub async fn habits_reorder(app: AppHandle, ids: Vec<String>) -> Result<(), DataError> {
    with_db(app, move |c| habits::reorder(c, &ids)).await
}

#[tauri::command]
pub async fn habits_check(app: AppHandle, habit_id: String, day: String, value: u32) -> Result<Option<HabitCheck>, DataError> {
    with_db(app, move |c| habits::set_check(c, &habit_id, &day, value)).await
}

#[tauri::command]
pub async fn habits_skip(app: AppHandle, habit_id: String, day: String, skipped: bool) -> Result<Option<HabitCheck>, DataError> {
    with_db(app, move |c| crate::data::habits::set_skip(c, &habit_id, &day, skipped)).await
}

#[tauri::command]
pub async fn habits_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| habits::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn habits_restore(app: AppHandle, id: String) -> Result<Habit, DataError> {
    with_db(app, move |c| habits::restore(c, &id, now())).await
}

// ——— Focus ———

#[tauri::command]
pub async fn focus_list(app: AppHandle, since: String) -> Result<Vec<FocusSession>, DataError> {
    with_db(app, move |c| focus::list(c, &since)).await
}

#[tauri::command]
pub async fn focus_add(app: AppHandle, task_id: Option<String>, day: String, started_at: i64, minutes: u32, note: Option<String>) -> Result<FocusSession, DataError> {
    with_db(app, move |c| focus::add(c, task_id.as_deref(), &day, started_at, minutes, note.as_deref())).await
}

#[tauri::command]
pub async fn focus_delete(app: AppHandle, id: i64) -> Result<(), DataError> {
    with_db(app, move |c| focus::delete(c, id)).await
}

#[tauri::command]
pub async fn focus_by_task(app: AppHandle) -> Result<Vec<(String, u32)>, DataError> {
    with_db(app, |c| focus::minutes_by_task(c)).await
}

// ——— Corbeille ———

#[tauri::command]
pub async fn trash_list(app: AppHandle) -> Result<Vec<TrashItem>, DataError> {
    with_db(app, |c| trash::list(c)).await
}

#[tauri::command]
pub async fn trash_restore(app: AppHandle, kind: String, id: String) -> Result<(), DataError> {
    with_db(app, move |c| trash::restore(c, &kind, &id, now())).await
}

#[tauri::command]
pub async fn trash_purge(app: AppHandle, kind: String, id: String) -> Result<(), DataError> {
    with_db(app, move |c| trash::purge(c, &kind, &id)).await
}

#[tauri::command]
pub async fn trash_empty(app: AppHandle) -> Result<usize, DataError> {
    with_db(app, |c| trash::empty(c)).await
}

// ——— Projets ———

#[tauri::command]
pub async fn projects_list(app: AppHandle) -> Result<Vec<Project>, DataError> {
    with_db(app, |c| projects::list(c, now())).await
}

#[tauri::command]
pub async fn projects_create(app: AppHandle, project: ProjectInput) -> Result<Project, DataError> {
    with_db(app, move |c| projects::create(c, &project, now())).await
}

/// Projet créé d'après un modèle, avec ses tâches et ses jalons.
#[tauri::command]
pub async fn projects_create_from(
    app: AppHandle,
    project: ProjectInput,
    tasks: Vec<TaskInput>,
    milestones: Vec<MilestoneInput>,
    today: String,
) -> Result<Project, DataError> {
    let today = tasks::parse_today(&today)?;
    with_db(app, move |c| projects::create_with(c, &project, &tasks, &milestones, now(), today)).await
}

#[tauri::command]
pub async fn projects_update(app: AppHandle, id: String, project: ProjectInput) -> Result<Project, DataError> {
    with_db(app, move |c| projects::update(c, &id, &project, now())).await
}

#[tauri::command]
pub async fn projects_archive(app: AppHandle, id: String, archived: bool) -> Result<Project, DataError> {
    with_db(app, move |c| projects::set_archived(c, &id, archived, now())).await
}

#[tauri::command]
pub async fn projects_reorder(app: AppHandle, ids: Vec<String>) -> Result<(), DataError> {
    with_db(app, move |c| projects::reorder(c, &ids)).await
}

#[tauri::command]
pub async fn projects_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| projects::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn projects_restore(app: AppHandle, id: String) -> Result<Project, DataError> {
    with_db(app, move |c| projects::restore(c, &id, now())).await
}

#[tauri::command]
pub async fn milestones_list(app: AppHandle) -> Result<Vec<Milestone>, DataError> {
    with_db(app, |c| projects::milestones(c)).await
}

#[tauri::command]
pub async fn milestones_create(app: AppHandle, project_id: String, milestone: MilestoneInput) -> Result<Milestone, DataError> {
    with_db(app, move |c| projects::create_milestone(c, &project_id, &milestone, now())).await
}

#[tauri::command]
pub async fn milestones_update(app: AppHandle, id: String, milestone: MilestoneInput) -> Result<Milestone, DataError> {
    with_db(app, move |c| projects::update_milestone(c, &id, &milestone)).await
}

#[tauri::command]
pub async fn milestones_done(app: AppHandle, id: String, done: bool) -> Result<Milestone, DataError> {
    with_db(app, move |c| projects::set_milestone_done(c, &id, done, now())).await
}

#[tauri::command]
pub async fn milestones_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| projects::delete_milestone(c, &id)).await
}

// ——— Liens ———

#[tauri::command]
pub async fn links_list(app: AppHandle) -> Result<Vec<Link>, DataError> {
    with_db(app, |c| links::list(c)).await
}

#[tauri::command]
pub async fn links_add(app: AppHandle, link: Link) -> Result<Link, DataError> {
    with_db(app, move |c| links::add(c, &link.a_kind, &link.a_id, &link.b_kind, &link.b_id, now())).await
}

#[tauri::command]
pub async fn links_remove(app: AppHandle, link: Link) -> Result<(), DataError> {
    with_db(app, move |c| links::remove(c, &link.a_kind, &link.a_id, &link.b_kind, &link.b_id)).await
}

// ——— Contacts ———

#[tauri::command]
pub async fn contacts_list(app: AppHandle) -> Result<Vec<Contact>, DataError> {
    with_db(app, |c| contacts::list(c, now())).await
}

#[tauri::command]
pub async fn contacts_create(app: AppHandle, contact: ContactInput) -> Result<Contact, DataError> {
    with_db(app, move |c| contacts::create(c, &contact, now())).await
}

#[tauri::command]
pub async fn contacts_update(app: AppHandle, id: String, contact: ContactInput) -> Result<Contact, DataError> {
    with_db(app, move |c| contacts::update(c, &id, &contact, now())).await
}

#[tauri::command]
pub async fn contacts_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| contacts::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn contacts_restore(app: AppHandle, id: String) -> Result<Contact, DataError> {
    with_db(app, move |c| contacts::restore(c, &id, now())).await
}

#[tauri::command]
pub async fn contact_interactions_list(app: AppHandle, contact_id: String) -> Result<Vec<contacts::Interaction>, DataError> {
    with_db(app, move |c| contacts::interactions(c, &contact_id)).await
}

#[tauri::command]
pub async fn contact_interactions_add(app: AppHandle, contact_id: String, interaction: contacts::InteractionInput) -> Result<Contact, DataError> {
    with_db(app, move |c| contacts::add_interaction(c, &contact_id, &interaction, now())).await
}

#[tauri::command]
pub async fn contact_interactions_delete(app: AppHandle, id: String) -> Result<Contact, DataError> {
    with_db(app, move |c| contacts::delete_interaction(c, &id)).await
}

// ——— Documents ———

#[tauri::command]
pub async fn documents_list(app: AppHandle) -> Result<Vec<Document>, DataError> {
    with_db(app, |c| documents::list(c, now())).await
}

#[tauri::command]
pub async fn folders_list(app: AppHandle) -> Result<Vec<Folder>, DataError> {
    with_db(app, |c| documents::folders(c)).await
}

#[tauri::command]
pub async fn folders_create(app: AppHandle, folder: FolderInput) -> Result<Folder, DataError> {
    with_db(app, move |c| documents::create_folder(c, &folder, now())).await
}

#[tauri::command]
pub async fn folders_update(app: AppHandle, id: String, folder: FolderInput) -> Result<Folder, DataError> {
    with_db(app, move |c| documents::update_folder(c, &id, &folder)).await
}

#[tauri::command]
pub async fn folders_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| documents::delete_folder(c, &id)).await
}

/// « Ajouter des fichiers » : fenêtre « Ouvrir » de Windows, plusieurs fichiers possibles.
#[tauri::command]
pub async fn documents_pick(app: AppHandle) -> Result<Vec<String>, DataError> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let chosen = crate::system::dialogs::pick_files(owner(&app), crate::lang::text(crate::lang::of(&app), "Ajouter des documents"));
        #[cfg(not(windows))]
        let chosen: Vec<PathBuf> = Vec::new();
        import::remember(&app, &chosen);
        chosen.iter().map(|p| p.to_string_lossy().into_owned()).collect()
    })
    .await
    .map_err(|_| DataError::Database { detail: "choix interrompu".into() })
}

/// Fichier qui n'a pas pu être ajouté, et pourquoi (« tooLarge », « tooMany », « unreadable »).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefusedFile {
    pub name: String,
    pub reason: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddedDocuments {
    pub added: Vec<Document>,
    pub refused: Vec<RefusedFile>,
}

/// Nom gardé pour un fichier : 200 caractères au plus, extension comprise.
fn document_name(path: &Path) -> String {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if name.chars().count() <= documents::MAX_NAME_CHARS {
        return name;
    }
    let ext = documents::extension(&name);
    let keep = documents::MAX_NAME_CHARS - ext.len() - 1;
    let stem: String = name.chars().take(keep).collect();
    if ext.is_empty() { name.chars().take(documents::MAX_NAME_CHARS).collect() } else { format!("{stem}.{ext}") }
}

/// Copie dans la base chiffrée des fichiers choisis ou glissés par la personne.
#[tauri::command]
pub async fn documents_add(app: AppHandle, paths: Vec<String>, folder_id: Option<String>, space_id: Option<String>) -> Result<AddedDocuments, DataError> {
    let reader = app.clone();
    let files: Vec<(String, Result<Vec<u8>, &'static str>)> = tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .take(100)
            .map(|p| {
                let path = PathBuf::from(p);
                let name = document_name(&path);
                if !import::is_chosen(&reader, &path) {
                    return (name, Err("unreadable"));
                }
                let read = match std::fs::metadata(&path) {
                    Ok(meta) if meta.is_file() && meta.len() > documents::MAX_BYTES as u64 => Err("tooLarge"),
                    Ok(meta) if meta.is_file() => std::fs::read(&path).map_err(|_| "unreadable"),
                    _ => Err("unreadable"),
                };
                (name, read)
            })
            .collect()
    })
    .await
    .map_err(|_| DataError::Database { detail: "lecture interrompue".into() })?;
    with_db(app, move |c| {
        let mut result = AddedDocuments { added: Vec::new(), refused: Vec::new() };
        for (name, read) in files {
            let bytes = match read {
                Ok(bytes) => bytes,
                Err(reason) => {
                    result.refused.push(RefusedFile { name, reason });
                    continue;
                }
            };
            let meta = DocumentMeta { name: name.clone(), folder_id: folder_id.clone(), space_id: space_id.clone(), ..Default::default() };
            match documents::add(c, &bytes, &meta, now()) {
                Ok(doc) => result.added.push(doc),
                Err(DataError::TooMany { max }) if max == documents::MAX_BYTES => result.refused.push(RefusedFile { name, reason: "tooLarge" }),
                Err(DataError::TooMany { .. }) => result.refused.push(RefusedFile { name, reason: "tooMany" }),
                Err(DataError::Invalid { field }) if field == "name" => result.refused.push(RefusedFile { name, reason: "unreadable" }),
                Err(e) => return Err(e),
            }
        }
        Ok(result)
    })
    .await
}

/// Contenu d'un document, pour l'aperçu.
#[tauri::command]
pub async fn documents_read(app: AppHandle, id: String) -> Result<tauri::ipc::Response, DataError> {
    with_db(app, move |c| documents::data(c, &id)).await.map(tauri::ipc::Response::new)
}

/// « Exporter » : copie en clair là où la personne le choisit ; `None` si elle a annulé.
#[tauri::command]
pub async fn documents_export(app: AppHandle, id: String) -> Result<Option<String>, DataError> {
    let reader = app.clone();
    let (doc, bytes) = with_db(reader, move |c| Ok((documents::get(c, &id)?, documents::data(c, &id)?))).await?;
    let logger = app.clone();
    let written = tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, DataError> {
        #[cfg(windows)]
        let target = {
            let (label, spec) = if doc.ext.is_empty() {
                (crate::lang::text(crate::lang::of(&app), "Tous les fichiers").to_string(), "*.*".to_string())
            } else {
                (format!("{} {} (*.{})", crate::lang::text(crate::lang::of(&app), "Fichier"), doc.ext.to_uppercase(), doc.ext), format!("*.{}", doc.ext))
            };
            pick(
                &app,
                crate::system::dialogs::Pick::SaveFile {
                    title: crate::lang::text(crate::lang::of(&app), "Exporter le document"),
                    filter: (&label, &spec),
                    default_name: &doc.name,
                    extension: &doc.ext,
                },
            )
        };
        #[cfg(not(windows))]
        let target: Option<PathBuf> = {
            let _ = (&app, &doc);
            None
        };
        let Some(target) = target else {
            return Ok(None);
        };
        std::fs::write(&target, &bytes).map_err(|_| DataError::Database { detail: "export".into() })?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| DataError::Database { detail: "export interrompu".into() })??;
    if written.is_some() {
        note_export(logger, "Document".into()).await;
    }
    Ok(written)
}

/// Exporte plusieurs documents dans un dossier choisi ; renvoie leur nombre (`None` : annulé).
/// Un fichier du même nom n'est jamais écrasé : « Bail (2).pdf ».
#[tauri::command]
pub async fn documents_export_many(app: AppHandle, ids: Vec<String>) -> Result<Option<usize>, DataError> {
    if ids.is_empty() || ids.len() > documents::MAX_DOCUMENTS {
        return Ok(Some(0));
    }
    let chooser = app.clone();
    let dir = tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let chosen = pick(&chooser, crate::system::dialogs::Pick::Folder { title: crate::lang::text(crate::lang::of(&chooser), "Exporter les documents") });
        #[cfg(not(windows))]
        let chosen: Option<PathBuf> = {
            let _ = &chooser;
            None
        };
        chosen
    })
    .await
    .map_err(|_| DataError::Database { detail: "export interrompu".into() })?;
    let Some(dir) = dir else {
        return Ok(None);
    };
    let mut written = 0;
    for id in ids {
        let reader = app.clone();
        let (doc, bytes) = with_db(reader, move |c| Ok((documents::get(c, &id)?, documents::data(c, &id)?))).await?;
        let target = documents::free_path(&dir, &documents::export_name(&doc.name, &doc.ext));
        tauri::async_runtime::spawn_blocking(move || std::fs::write(&target, &bytes))
            .await
            .map_err(|_| DataError::Database { detail: "export interrompu".into() })?
            .map_err(|_| DataError::Database { detail: "export".into() })?;
        written += 1;
    }
    if written > 0 {
        note_export(app, if written > 1 { format!("{written} documents") } else { "Document".into() }).await;
    }
    Ok(Some(written))
}

#[tauri::command]
pub async fn documents_update(app: AppHandle, id: String, document: DocumentMeta) -> Result<Document, DataError> {
    with_db(app, move |c| documents::update(c, &id, &document, now())).await
}

#[tauri::command]
pub async fn documents_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| documents::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn documents_restore(app: AppHandle, id: String) -> Result<Document, DataError> {
    with_db(app, move |c| documents::restore(c, &id, now())).await
}

// ——— Mini-lecteur du Focus ———

/// Asynchrone : sous Windows, créer une fenêtre depuis une commande synchrone bloque toute
/// l'application (la fenêtre principale attend la nouvelle, qui l'attend).
#[tauri::command]
pub async fn focus_mini_open(app: AppHandle) -> Result<(), String> {
    crate::focus_mini::open(&app).map_err(|_| "mini-lecteur indisponible".to_string())
}

#[tauri::command]
pub fn focus_mini_close(app: AppHandle) {
    crate::focus_mini::close(&app);
}

#[tauri::command]
pub fn focus_mini_publish(app: AppHandle, state: crate::focus_mini::MiniState) {
    crate::focus_mini::publish(&app, state);
}

#[tauri::command]
pub fn focus_mini_current(latest: State<'_, crate::focus_mini::MiniLatest>) -> Option<crate::focus_mini::MiniState> {
    latest.0.lock().ok().and_then(|s| s.clone())
}

#[tauri::command]
pub fn focus_mini_command(app: AppHandle, action: String) -> Result<(), String> {
    if !crate::focus_mini::is_action(&action) {
        return Err("action inconnue".into());
    }
    crate::focus_mini::command(&app, &action);
    Ok(())
}

// ——— Dossiers de carnets ———

#[tauri::command]
pub async fn note_folders_list(app: AppHandle) -> Result<Vec<notes::NoteFolder>, DataError> {
    with_db(app, |c| notes::folders(c)).await
}

#[tauri::command]
pub async fn note_folders_create(app: AppHandle, folder: notes::NoteFolderInput) -> Result<notes::NoteFolder, DataError> {
    with_db(app, move |c| notes::create_folder(c, &folder, now())).await
}

#[tauri::command]
pub async fn note_folders_update(app: AppHandle, id: String, folder: notes::NoteFolderInput) -> Result<notes::NoteFolder, DataError> {
    with_db(app, move |c| notes::update_folder(c, &id, &folder)).await
}

#[tauri::command]
pub async fn note_folders_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| notes::delete_folder(c, &id)).await
}

// ——— Thèmes personnels : fonds d'écran (base chiffrée) et fichier .aqtheme ———

#[tauri::command]
pub async fn wallpaper_get(app: AppHandle, id: String) -> Result<Option<String>, DataError> {
    with_db(app, move |c| crate::data::wallpapers::get(c, &id)).await
}

#[tauri::command]
pub async fn wallpaper_set(app: AppHandle, id: String, data: String) -> Result<(), DataError> {
    with_db(app, move |c| crate::data::wallpapers::set(c, &id, &data, now())).await
}

#[tauri::command]
pub async fn wallpaper_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| crate::data::wallpapers::delete(c, &id)).await
}

// ——— Réglages personnels (base chiffrée) ———

#[tauri::command]
pub async fn setting_get(app: AppHandle, key: String) -> Result<Option<String>, DataError> {
    with_db(app, move |c| crate::data::settings::get(c, &key)).await
}

#[tauri::command]
pub async fn setting_set(app: AppHandle, key: String, value: String) -> Result<(), DataError> {
    with_db(app, move |c| crate::data::settings::set(c, &key, &value)).await
}

/// Taille d'un fichier exporté, au plus.
const MAX_EXPORT: usize = 50 * 1024 * 1024;

/// Contenu d'un export : carnet vCard, agenda iCalendar, ou tableau CSV.
fn is_export(format: &str, content: &str) -> bool {
    content.len() <= MAX_EXPORT
        && match format {
            "vcf" => content.starts_with("BEGIN:VCARD") && content.trim_end().ends_with("END:VCARD"),
            "ics" => content.starts_with("BEGIN:VCALENDAR") && content.trim_end().ends_with("END:VCALENDAR"),
            "csv" | "md" | "txt" => !content.trim().is_empty(),
            _ => false,
        }
}

/// Enregistre un export préparé par l'interface (contacts en .vcf ou .csv, calendrier en .ics,
/// note en .md ou .txt)
/// dans un fichier choisi ; renvoie son chemin (`None` : annulé).
#[tauri::command]
pub async fn export_file(app: AppHandle, name: String, format: String, content: String) -> Result<Option<String>, DataError> {
    if !is_export(&format, &content) {
        return Err(DataError::Invalid { field: "content".into() });
    }
    let file_name = documents::export_name(&name, &format);
    let logger = app.clone();
    let kind = format.clone();
    let written = tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, DataError> {
        #[cfg(windows)]
        let target = pick(
            &app,
            crate::system::dialogs::Pick::SaveFile {
                title: crate::lang::text(crate::lang::of(&app), "Exporter"),
                filter: match format.as_str() {
                    "vcf" => (crate::lang::text(crate::lang::of(&app), "Carnet de contacts (*.vcf)"), "*.vcf"),
                    "ics" => (crate::lang::text(crate::lang::of(&app), "Agenda (*.ics)"), "*.ics"),
                    "md" => (crate::lang::text(crate::lang::of(&app), "Document Markdown (*.md)"), "*.md"),
                    "txt" => (crate::lang::text(crate::lang::of(&app), "Texte (*.txt)"), "*.txt"),
                    _ => (crate::lang::text(crate::lang::of(&app), "Tableau CSV (*.csv)"), "*.csv"),
                },
                default_name: &file_name,
                extension: &format,
            },
        );
        #[cfg(not(windows))]
        let target: Option<PathBuf> = {
            let _ = (&app, &file_name, &format);
            None
        };
        let Some(target) = target else {
            return Ok(None);
        };
        std::fs::write(&target, content.as_bytes()).map_err(|_| DataError::Database { detail: "export".into() })?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| DataError::Database { detail: "export interrompu".into() })??;
    if written.is_some() {
        note_export(logger, format!("Fichier .{kind}")).await;
    }
    Ok(written)
}

/// Note un export au journal de sécurité ; un échec n'annule pas l'export déjà écrit.
async fn note_export(app: AppHandle, what: String) {
    let _ = with_db(app, move |c| security::log_export(c, &what, now())).await;
}

// ——— Filtres de tâches enregistrés ———

#[tauri::command]
pub async fn task_filters_list(app: AppHandle) -> Result<Vec<TaskFilter>, DataError> {
    with_db(app, |c| filters::list(c)).await
}

#[tauri::command]
pub async fn task_filters_create(app: AppHandle, filter: TaskFilterInput) -> Result<TaskFilter, DataError> {
    with_db(app, move |c| filters::create(c, &filter, now())).await
}

#[tauri::command]
pub async fn task_filters_update(app: AppHandle, id: String, filter: TaskFilterInput) -> Result<TaskFilter, DataError> {
    with_db(app, move |c| filters::update(c, &id, &filter, now())).await
}

#[tauri::command]
pub async fn task_filters_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| filters::delete(c, &id)).await
}

#[tauri::command]
pub async fn task_filters_reorder(app: AppHandle, ids: Vec<String>) -> Result<Vec<TaskFilter>, DataError> {
    with_db(app, move |c| filters::reorder(c, &ids)).await
}

/// Mode discret : contenu des fenêtres exclu des captures et des partages d'écran.
#[tauri::command]
pub async fn discreet_set(app: AppHandle, enabled: bool) {
    crate::system::discreet::set(&app, enabled);
}

/// Une fenêtre qui vient de s'afficher d'elle-même (fenêtre principale, note) prend le réglage.
#[tauri::command]
pub async fn discreet_window(window: tauri::WebviewWindow) {
    crate::system::discreet::protect(&window);
}

/// Journal de sécurité : les événements les plus récents (Paramètres › Sécurité).
#[tauri::command]
pub async fn security_log(app: AppHandle, limit: u32) -> Result<SecurityLog, DataError> {
    with_db(app, move |c| security::list(c, limit)).await
}

/// Enregistre un thème personnel dans un fichier .aqtheme choisi ; renvoie son chemin (`None` : annulé).
#[tauri::command]
pub async fn theme_export(app: AppHandle, name: String, content: String) -> Result<Option<String>, DataError> {
    if !crate::data::wallpapers::is_theme_file(&content) {
        return Err(DataError::Invalid { field: "content".into() });
    }
    let file_name = documents::export_name(&name, "aqtheme");
    let logger = app.clone();
    let written = tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, DataError> {
        #[cfg(windows)]
        let target = pick(
            &app,
            crate::system::dialogs::Pick::SaveFile {
                title: crate::lang::text(crate::lang::of(&app), "Exporter le thème"),
                filter: (crate::lang::text(crate::lang::of(&app), "Thème Aqueli (*.aqtheme)"), "*.aqtheme"),
                default_name: &file_name,
                extension: "aqtheme",
            },
        );
        #[cfg(not(windows))]
        let target: Option<PathBuf> = {
            let _ = (&app, &file_name);
            None
        };
        let Some(target) = target else {
            return Ok(None);
        };
        std::fs::write(&target, content.as_bytes()).map_err(|_| DataError::Database { detail: "export".into() })?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|_| DataError::Database { detail: "export interrompu".into() })??;
    if written.is_some() {
        note_export(logger, "Thème (.aqtheme)".into()).await;
    }
    Ok(written)
}

// ——— Catégories de contacts ———

#[tauri::command]
pub async fn contact_groups_list(app: AppHandle) -> Result<Vec<ContactGroup>, DataError> {
    with_db(app, |c| contacts::groups(c)).await
}

#[tauri::command]
pub async fn contact_groups_create(app: AppHandle, group: ContactGroupInput) -> Result<ContactGroup, DataError> {
    with_db(app, move |c| contacts::create_group(c, &group, now())).await
}

#[tauri::command]
pub async fn contact_groups_update(app: AppHandle, id: String, group: ContactGroupInput) -> Result<ContactGroup, DataError> {
    with_db(app, move |c| contacts::update_group(c, &id, &group)).await
}

#[tauri::command]
pub async fn contact_groups_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| contacts::delete_group(c, &id)).await
}

// ——— Version 3 : listes ———

use crate::data::budget::{self, BudgetCategory, CategoryInput, Transaction, TransactionInput};
use crate::data::goals::{self, Goal, GoalEntry, GoalEntryInput, GoalInput, GoalStep, GoalStepInput};
use crate::data::lists::{self, List, ListInput, ListItem, ListItemInput};
use crate::data::reviews::{self, Review, ReviewInput};

#[tauri::command]
pub async fn lists_list(app: AppHandle) -> Result<Vec<List>, DataError> {
    with_db(app, |c| lists::lists(c, now())).await
}

#[tauri::command]
pub async fn lists_create(app: AppHandle, list: ListInput) -> Result<List, DataError> {
    with_db(app, move |c| lists::create_list(c, &list, now())).await
}

#[tauri::command]
pub async fn lists_update(app: AppHandle, id: String, list: ListInput) -> Result<List, DataError> {
    with_db(app, move |c| lists::update_list(c, &id, &list, now())).await
}

#[tauri::command]
pub async fn lists_archive(app: AppHandle, id: String, archived: bool) -> Result<List, DataError> {
    with_db(app, move |c| lists::set_archived(c, &id, archived, now())).await
}

#[tauri::command]
pub async fn lists_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| lists::delete_list(c, &id, now())).await
}

#[tauri::command]
pub async fn lists_restore(app: AppHandle, id: String) -> Result<List, DataError> {
    with_db(app, move |c| lists::restore_list(c, &id, now())).await
}

#[tauri::command]
pub async fn list_items_list(app: AppHandle) -> Result<Vec<ListItem>, DataError> {
    with_db(app, |c| lists::items(c)).await
}

#[tauri::command]
pub async fn list_items_create(app: AppHandle, list_id: String, item: ListItemInput) -> Result<ListItem, DataError> {
    with_db(app, move |c| lists::create_item(c, &list_id, &item, now())).await
}

#[tauri::command]
pub async fn list_items_update(app: AppHandle, id: String, item: ListItemInput) -> Result<ListItem, DataError> {
    with_db(app, move |c| lists::update_item(c, &id, &item, now())).await
}

#[tauri::command]
pub async fn list_items_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| lists::delete_item(c, &id)).await
}

#[tauri::command]
pub async fn list_items_reorder(app: AppHandle, list_id: String, ids: Vec<String>) -> Result<(), DataError> {
    with_db(app, move |c| lists::reorder_items(c, &list_id, &ids)).await
}

// ——— Version 3 : budget ———

#[tauri::command]
pub async fn budget_categories_list(app: AppHandle) -> Result<Vec<BudgetCategory>, DataError> {
    with_db(app, |c| budget::categories(c)).await
}

#[tauri::command]
pub async fn budget_categories_create(app: AppHandle, category: CategoryInput) -> Result<BudgetCategory, DataError> {
    with_db(app, move |c| budget::create_category(c, &category, now())).await
}

#[tauri::command]
pub async fn budget_categories_update(app: AppHandle, id: String, category: CategoryInput) -> Result<BudgetCategory, DataError> {
    with_db(app, move |c| budget::update_category(c, &id, &category)).await
}

#[tauri::command]
pub async fn budget_categories_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| budget::delete_category(c, &id)).await
}

#[tauri::command]
pub async fn transactions_list(app: AppHandle) -> Result<Vec<Transaction>, DataError> {
    with_db(app, |c| budget::list(c, now())).await
}

#[tauri::command]
pub async fn transactions_create(app: AppHandle, transaction: TransactionInput) -> Result<Transaction, DataError> {
    with_db(app, move |c| budget::create(c, &transaction, now())).await
}

#[tauri::command]
pub async fn transactions_update(app: AppHandle, id: String, transaction: TransactionInput) -> Result<Transaction, DataError> {
    with_db(app, move |c| budget::update(c, &id, &transaction, now())).await
}

#[tauri::command]
pub async fn transactions_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| budget::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn transactions_restore(app: AppHandle, id: String) -> Result<Transaction, DataError> {
    with_db(app, move |c| budget::restore(c, &id, now())).await
}

/// Échéances des opérations récurrentes arrivées jusqu'à `today` (date de ce PC).
#[tauri::command]
pub async fn transactions_generate(app: AppHandle, today: String) -> Result<Vec<Transaction>, DataError> {
    with_db(app, move |c| budget::generate(c, &today, now())).await
}

// ——— Version 3 : objectifs ———

#[tauri::command]
pub async fn goals_list(app: AppHandle) -> Result<Vec<Goal>, DataError> {
    with_db(app, |c| goals::list(c, now())).await
}

#[tauri::command]
pub async fn goals_create(app: AppHandle, goal: GoalInput) -> Result<Goal, DataError> {
    with_db(app, move |c| goals::create(c, &goal, now())).await
}

#[tauri::command]
pub async fn goals_update(app: AppHandle, id: String, goal: GoalInput) -> Result<Goal, DataError> {
    with_db(app, move |c| goals::update(c, &id, &goal, now())).await
}

#[tauri::command]
pub async fn goals_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| goals::delete(c, &id, now())).await
}

#[tauri::command]
pub async fn goals_restore(app: AppHandle, id: String) -> Result<Goal, DataError> {
    with_db(app, move |c| goals::restore(c, &id, now())).await
}

#[tauri::command]
pub async fn goal_steps_list(app: AppHandle) -> Result<Vec<GoalStep>, DataError> {
    with_db(app, |c| goals::steps(c)).await
}

#[tauri::command]
pub async fn goal_steps_create(app: AppHandle, goal_id: String, step: GoalStepInput) -> Result<GoalStep, DataError> {
    with_db(app, move |c| goals::create_step(c, &goal_id, &step)).await
}

#[tauri::command]
pub async fn goal_steps_update(app: AppHandle, id: String, step: GoalStepInput) -> Result<GoalStep, DataError> {
    with_db(app, move |c| goals::update_step(c, &id, &step)).await
}

#[tauri::command]
pub async fn goal_steps_done(app: AppHandle, id: String, done: bool) -> Result<GoalStep, DataError> {
    with_db(app, move |c| goals::set_step_done(c, &id, done, now())).await
}

#[tauri::command]
pub async fn goal_steps_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| goals::delete_step(c, &id)).await
}

#[tauri::command]
pub async fn goal_entries_list(app: AppHandle) -> Result<Vec<GoalEntry>, DataError> {
    with_db(app, |c| goals::entries(c)).await
}

#[tauri::command]
pub async fn goal_entries_create(app: AppHandle, goal_id: String, entry: GoalEntryInput) -> Result<GoalEntry, DataError> {
    with_db(app, move |c| goals::create_entry(c, &goal_id, &entry, now())).await
}

#[tauri::command]
pub async fn goal_entries_delete(app: AppHandle, id: String) -> Result<(), DataError> {
    with_db(app, move |c| goals::delete_entry(c, &id)).await
}

// ——— Version 3 : revues hebdomadaires ———

#[tauri::command]
pub async fn reviews_list(app: AppHandle) -> Result<Vec<Review>, DataError> {
    with_db(app, |c| reviews::list(c)).await
}

#[tauri::command]
pub async fn reviews_save(app: AppHandle, week: String, review: ReviewInput) -> Result<Review, DataError> {
    with_db(app, move |c| reviews::save(c, &week, &review, now())).await
}

#[cfg(test)]
mod tests {
    use super::is_export;

    #[test]
    fn un_export_n_accepte_que_les_formats_prevus() {
        assert!(is_export("vcf", "BEGIN:VCARD\r\nFN:A\r\nEND:VCARD\r\n"));
        assert!(!is_export("vcf", "FN:A"));
        assert!(is_export("ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR"));
        assert!(is_export("csv", "Nom;Téléphone"));
        assert!(is_export("md", "# Courses\n\n- pain"));
        assert!(is_export("txt", "Courses"));
        assert!(!is_export("md", "  \n"));
        assert!(!is_export("exe", "MZ"));
        assert!(!is_export("html", "<p>a</p>"));
    }
}
