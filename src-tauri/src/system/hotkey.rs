//! Raccourci global de la capture rapide (Ctrl+Alt+A par défaut, modifiable) : Windows le
//! transmet à Aqueli même quand un autre logiciel est au premier plan. Un fil dédié attend ses
//! messages ; changer de raccourci arrête ce fil et en lance un nouveau.

use std::sync::Mutex;
#[cfg(windows)]
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Nom de la préférence (fichier des préférences d'affichage, écrit par l'interface).
pub const PREF_KEY: &str = "raccourciCapture";

/// Combinaison de touches ; `key` : code de touche virtuelle de Windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkey {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    pub key: u32,
}

impl Default for Hotkey {
    /// Ctrl+Alt+A (« A comme Aqueli ») : Ctrl+Alt+Espace et Alt+Espace servent déjà à
    /// d'autres logiciels (assistants), et AltGr+A ne donne aucun caractère en AZERTY.
    fn default() -> Self {
        Hotkey { ctrl: true, alt: true, shift: false, win: false, key: 0x41 }
    }
}

impl Hotkey {
    /// Ctrl, Alt ou Windows, avec une lettre, un chiffre, Espace ou F1 à F12.
    pub fn is_valid(&self) -> bool {
        let key = self.key == 0x20
            || (0x30..=0x39).contains(&self.key)
            || (0x41..=0x5A).contains(&self.key)
            || (0x70..=0x7B).contains(&self.key);
        key && (self.ctrl || self.alt || self.win)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum HotkeyError {
    /// Combinaison refusée (sans Ctrl, Alt ou Windows, ou touche non prise en charge).
    Invalid,
    /// Un autre logiciel utilise déjà cette combinaison.
    Taken,
    Unsupported,
}

/// Identifiant du fil qui attend le raccourci, et raccourci actif.
#[derive(Default)]
pub struct HotkeyState(pub Mutex<Option<(u32, Hotkey)>>);

/// Raccourci actif, s'il y en a un.
pub fn active(app: &AppHandle) -> Option<Hotkey> {
    app.state::<HotkeyState>().0.lock().ok().and_then(|s| s.map(|(_, h)| h))
}

/// Raccourci enregistré dans les préférences, sinon celui par défaut.
pub fn from_prefs(prefs: &crate::prefs::Prefs) -> Hotkey {
    prefs
        .get(PREF_KEY)
        .and_then(|v| serde_json::from_value::<Hotkey>(v.clone()).ok())
        .filter(Hotkey::is_valid)
        .unwrap_or_default()
}

#[cfg(windows)]
mod win {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, MOD_WIN,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, PeekMessageW, PostThreadMessageW, MSG, PM_NOREMOVE, WM_HOTKEY, WM_QUIT, WM_USER};

    use super::Hotkey;

    fn modifiers(h: &Hotkey) -> HOT_KEY_MODIFIERS {
        let mut m = MOD_NOREPEAT;
        if h.ctrl {
            m |= MOD_CONTROL;
        }
        if h.alt {
            m |= MOD_ALT;
        }
        if h.shift {
            m |= MOD_SHIFT;
        }
        if h.win {
            m |= MOD_WIN;
        }
        m
    }

    /// Sur le fil courant : enregistre le raccourci, envoie (fil, réussite), puis appelle
    /// `pressed` à chaque appui jusqu'à l'arrêt demandé par `stop`.
    pub fn run(h: Hotkey, ready: std::sync::mpsc::Sender<(u32, bool)>, pressed: impl Fn()) {
        // SAFETY : appels Win32 sur le fil courant, avec des structures locales valides.
        unsafe {
            let mut msg = MSG::default();
            // Crée la file de messages du fil avant d'annoncer son identifiant.
            let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
            let ok = RegisterHotKey(None, 1, modifiers(&h), h.key).is_ok();
            let _ = ready.send((GetCurrentThreadId(), ok));
            if !ok {
                return;
            }
            loop {
                let got = GetMessageW(&mut msg, None, 0, 0);
                if got.0 <= 0 {
                    break;
                }
                if msg.message == WM_HOTKEY {
                    pressed();
                }
            }
            let _ = UnregisterHotKey(None, 1);
        }
    }

    pub fn stop(thread: u32) {
        // SAFETY : simple message envoyé au fil qui attend le raccourci.
        unsafe {
            let _ = PostThreadMessageW(thread, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

/// Arrête le raccourci actif.
pub fn stop(app: &AppHandle) {
    let current = app.state::<HotkeyState>().0.lock().ok().and_then(|mut s| s.take());
    #[cfg(windows)]
    if let Some((thread, _)) = current {
        win::stop(thread);
    }
    #[cfg(not(windows))]
    let _ = current;
}

/// Active `hotkey` à la place du raccourci actuel ; en cas d'échec, l'ancien reste actif.
pub fn register(app: &AppHandle, hotkey: Hotkey) -> Result<(), HotkeyError> {
    if !hotkey.is_valid() {
        return Err(HotkeyError::Invalid);
    }
    #[cfg(windows)]
    {
        let previous = active(app);
        if previous == Some(hotkey) {
            return Ok(());
        }
        stop(app);
        match start(app, hotkey) {
            Ok(()) => Ok(()),
            Err(e) => {
                if let Some(old) = previous {
                    let _ = start(app, old);
                }
                Err(e)
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err(HotkeyError::Unsupported)
    }
}

#[cfg(windows)]
fn start(app: &AppHandle, hotkey: Hotkey) -> Result<(), HotkeyError> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    std::thread::spawn(move || {
        win::run(hotkey, tx, || {
            let target = handle.clone();
            let _ = handle.run_on_main_thread(move || crate::capture::show(&target));
        });
    });
    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok((thread, true)) => {
            if let Ok(mut state) = app.state::<HotkeyState>().0.lock() {
                *state = Some((thread, hotkey));
            }
            Ok(())
        }
        Ok((_, false)) => Err(HotkeyError::Taken),
        Err(_) => Err(HotkeyError::Unsupported),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_combinaison_demande_ctrl_alt_ou_windows_et_une_touche_prise_en_charge() {
        assert!(Hotkey::default().is_valid());
        assert!(Hotkey { ctrl: false, alt: false, win: true, shift: false, key: 0x4E }.is_valid(), "Windows+N");
        assert!(!Hotkey { ctrl: false, alt: false, win: false, shift: true, key: 0x20 }.is_valid(), "Maj seule");
        assert!(!Hotkey { key: 0x0D, ..Hotkey::default() }.is_valid(), "Entrée");
        assert!(Hotkey { key: 0x7B, ..Hotkey::default() }.is_valid(), "F12");
    }

    #[test]
    fn le_raccourci_se_lit_dans_les_preferences() {
        let mut prefs = crate::prefs::Prefs::new();
        assert_eq!(from_prefs(&prefs), Hotkey::default());
        prefs.insert(PREF_KEY.into(), serde_json::json!({ "ctrl": true, "alt": false, "shift": true, "win": false, "key": 75 }));
        assert_eq!(from_prefs(&prefs), Hotkey { ctrl: true, alt: false, shift: true, win: false, key: 75 });
        prefs.insert(PREF_KEY.into(), serde_json::json!({ "ctrl": false, "alt": false, "shift": true, "win": false, "key": 75 }));
        assert_eq!(from_prefs(&prefs), Hotkey::default(), "refusé : le raccourci par défaut");
    }
}
