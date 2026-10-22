//! Session Windows : identifiant de la session en cours, et verrouillage d'Aqueli quand
//! Windows se verrouille (Win+L) ou se met en veille.

use std::sync::OnceLock;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::core::PWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::RemoteDesktop::{
    WTSFreeMemory, WTSQuerySessionInformationW, WTSRegisterSessionNotification, WTSSessionInfo, NOTIFY_FOR_THIS_SESSION,
    WTSINFOW, WTS_CURRENT_SESSION,
};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{PBT_APMSUSPEND, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK};

use crate::commands::VaultState;

/// Événement envoyé à l'interface quand Windows a provoqué le verrouillage.
pub const SYSTEM_LOCK_EVENT: &str = "verrouillage-systeme";

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Heure d'ouverture de la session Windows en cours : elle change à chaque connexion.
/// 0 si elle est inconnue (Windows Hello est alors refusé, le mot de passe reste demandé).
pub fn logon_marker() -> u64 {
    let mut buffer = PWSTR::null();
    let mut size = 0u32;
    // SAFETY: Windows alloue `buffer` (une structure WTSINFOW) ; il est libéré par WTSFreeMemory.
    unsafe {
        if WTSQuerySessionInformationW(None, WTS_CURRENT_SESSION, WTSSessionInfo, &mut buffer, &mut size).is_err()
            || buffer.is_null()
        {
            return 0;
        }
        let logon = if size as usize >= std::mem::size_of::<WTSINFOW>() {
            (*(buffer.0 as *const WTSINFOW)).LogonTime
        } else {
            0
        };
        WTSFreeMemory(buffer.0.cast());
        u64::try_from(logon).unwrap_or(0)
    }
}

fn lock_everything(app: &AppHandle) {
    // Le coffre est fermé sur un autre fil pour ne jamais bloquer la fenêtre.
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Ok(mut vault) = handle.state::<VaultState>().0.lock() {
            vault.lock();
        }
    });
    crate::note_window::close_all(app);
    let _ = app.emit(SYSTEM_LOCK_EVENT, ());
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    _data: usize,
) -> LRESULT {
    let session_locked = msg == WM_WTSSESSION_CHANGE && wparam.0 as u32 == WTS_SESSION_LOCK;
    let suspending = msg == WM_POWERBROADCAST && wparam.0 as u32 == PBT_APMSUSPEND;
    if session_locked || suspending {
        if let Some(app) = APP.get() {
            lock_everything(app);
        }
    }
    // SAFETY: on transmet le message au traitement normal de la fenêtre.
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

/// Écoute le verrouillage de Windows et la mise en veille sur la fenêtre principale.
pub fn watch(app: &AppHandle, window: &WebviewWindow) {
    let _ = APP.set(app.clone());
    let Ok(hwnd) = window.hwnd() else { return };
    // SAFETY: `hwnd` est la fenêtre principale, vivante pendant toute l'exécution ; ces appels
    // se font sur le fil qui la possède (configuration de Tauri).
    unsafe {
        let _ = WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);
        let _ = SetWindowSubclass(hwnd, Some(window_proc), 1, 0);
    }
}
