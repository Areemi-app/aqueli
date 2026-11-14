//! Raccourci global de la capture rapide (Ctrl+Alt+A par défaut, modifiable) : Windows le
//! transmet à Aqueli même quand un autre logiciel est au premier plan. Un fil dédié attend ses
//! messages ; changer de raccourci arrête ce fil et en lance un nouveau.

use std::sync::Mutex;
#[cfg(any(windows, target_os = "linux"))]
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

/// Linux sous X11 : `XGrabKey` sur la fenêtre racine (libX11 chargée à l'exécution par `x11-dl`,
/// déjà utilisé par Tauri). Sous Wayland, voir `portal`.
#[cfg(target_os = "linux")]
mod x11 {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::Duration;

    use x11_dl::xlib;

    use super::Hotkey;

    /// Fils en cours (numéro → demande d'arrêt).
    fn running() -> &'static Mutex<HashMap<u32, Arc<AtomicBool>>> {
        static RUNNING: OnceLock<Mutex<HashMap<u32, Arc<AtomicBool>>>> = OnceLock::new();
        RUNNING.get_or_init(Default::default)
    }
    static NEXT: AtomicU32 = AtomicU32::new(1);
    /// Combinaison déjà prise par un autre logiciel (erreur « BadAccess » de X).
    static TAKEN: AtomicBool = AtomicBool::new(false);

    unsafe extern "C" fn on_error(_: *mut xlib::Display, event: *mut xlib::XErrorEvent) -> std::os::raw::c_int {
        if !event.is_null() && (*event).error_code == xlib::BadAccess {
            TAKEN.store(true, Ordering::SeqCst);
        }
        0
    }

    /// Session Wayland : pas d'écoute globale du clavier par X.
    pub fn wayland() -> bool {
        std::env::var_os("WAYLAND_DISPLAY").is_some() || std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland")
    }

    /// Touche X (« keysym ») d'un code de touche virtuelle de Windows : lettre, chiffre, Espace,
    /// F1 à F12.
    pub fn keysym(key: u32) -> Option<u64> {
        match key {
            0x20 => Some(0x20),
            0x30..=0x39 => Some(u64::from(key)),
            0x41..=0x5A => Some(u64::from(key) + 0x20),
            0x70..=0x7B => Some(0xffbe + u64::from(key - 0x70)),
            _ => None,
        }
    }

    pub fn modifiers(h: &Hotkey) -> u32 {
        let mut m = 0;
        if h.ctrl {
            m |= xlib::ControlMask;
        }
        if h.alt {
            m |= xlib::Mod1Mask;
        }
        if h.shift {
            m |= xlib::ShiftMask;
        }
        if h.win {
            m |= xlib::Mod4Mask;
        }
        m
    }

    /// Sur le fil courant : prend la combinaison, envoie (numéro, réussite), puis appelle
    /// `pressed` à chaque appui jusqu'à l'arrêt demandé par `stop`. Sans affichage X, rien
    /// n'est envoyé (raccourci indisponible).
    pub fn run(h: Hotkey, ready: std::sync::mpsc::Sender<(u32, bool)>, pressed: impl Fn()) {
        if wayland() {
            return;
        }
        let (Ok(x), Some(sym)) = (xlib::Xlib::open(), keysym(h.key)) else {
            return;
        };
        // SAFETY : appels libX11 sur une connexion propre à ce fil, ouverte et fermée ici.
        unsafe {
            let display = (x.XOpenDisplay)(std::ptr::null());
            if display.is_null() {
                return;
            }
            let root = (x.XDefaultRootWindow)(display);
            let code = i32::from((x.XKeysymToKeycode)(display, sym));
            // Verr. Maj et Verr. Num ne doivent pas empêcher le raccourci.
            let masks: Vec<u32> = [0, xlib::LockMask, xlib::Mod2Mask, xlib::LockMask | xlib::Mod2Mask].iter().map(|extra| modifiers(&h) | extra).collect();
            TAKEN.store(false, Ordering::SeqCst);
            let previous = (x.XSetErrorHandler)(Some(on_error));
            for m in &masks {
                (x.XGrabKey)(display, code, *m, root, 0, xlib::GrabModeAsync, xlib::GrabModeAsync);
            }
            (x.XSync)(display, 0);
            let ok = code != 0 && !TAKEN.load(Ordering::SeqCst);
            let id = NEXT.fetch_add(1, Ordering::SeqCst);
            let stop = Arc::new(AtomicBool::new(false));
            if let Ok(mut list) = running().lock() {
                list.insert(id, stop.clone());
            }
            let _ = ready.send((id, ok));
            if ok {
                let mut event: xlib::XEvent = std::mem::zeroed();
                while !stop.load(Ordering::SeqCst) {
                    while (x.XPending)(display) > 0 {
                        (x.XNextEvent)(display, &mut event);
                        if event.get_type() == xlib::KeyPress {
                            pressed();
                        }
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            for m in &masks {
                (x.XUngrabKey)(display, code, *m, root);
            }
            (x.XSync)(display, 0);
            (x.XSetErrorHandler)(previous);
            (x.XCloseDisplay)(display);
            if let Ok(mut list) = running().lock() {
                list.remove(&id);
            }
        }
    }

    pub fn stop(id: u32) {
        if let Some(flag) = running().lock().ok().and_then(|list| list.get(&id).cloned()) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

/// Linux sous Wayland : une application ne peut pas écouter le clavier des autres. Le raccourci
/// passe par le portail du bureau (`org.freedesktop.portal.GlobalShortcuts` : KDE Plasma, GNOME 48
/// et suivants), qui demande l'accord de la personne la première fois, garde la combinaison et la
/// laisse modifier dans ses propres paramètres.
#[cfg(target_os = "linux")]
mod portal {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};

    use zbus::blocking::{Connection, Proxy};
    use zbus::zvariant::{ObjectPath, OwnedObjectPath, OwnedValue, Value};

    use super::Hotkey;

    const DESKTOP: &str = "org.freedesktop.portal.Desktop";
    const PATH: &str = "/org/freedesktop/portal/desktop";
    const SHORTCUTS: &str = "org.freedesktop.portal.GlobalShortcuts";
    /// Identifiant du raccourci auprès du portail.
    const ID: &str = "capture-rapide";

    /// Combinaison retenue par le bureau, comme il la décrit (« Ctrl+Alt+A »), une fois le
    /// raccourci accepté.
    pub static TRIGGER: Mutex<Option<String>> = Mutex::new(None);
    /// Session ouverte (connexion, chemin) et demande d'arrêt du fil qui l'écoute.
    static SESSION: Mutex<Option<(Connection, String, Arc<AtomicBool>)>> = Mutex::new(None);

    /// Combinaison proposée au bureau, au format des raccourcis XDG (« CTRL+ALT+a »).
    pub fn preferred_trigger(h: &Hotkey) -> Option<String> {
        let key = match h.key {
            0x20 => "space".to_string(),
            0x30..=0x39 => char::from_u32(h.key)?.to_string(),
            0x41..=0x5A => char::from_u32(h.key + 0x20)?.to_string(),
            0x70..=0x7B => format!("F{}", h.key - 0x6F),
            _ => return None,
        };
        let mods = [(h.ctrl, "CTRL"), (h.alt, "ALT"), (h.shift, "SHIFT"), (h.win, "LOGO")];
        let mut parts: Vec<String> = mods.iter().filter(|(on, _)| *on).map(|(_, name)| (*name).to_string()).collect();
        parts.push(key);
        Some(parts.join("+"))
    }

    /// Envoie une demande au portail et attend sa réponse (`Request.Response`), écoutée avant
    /// l'envoi sur son chemin connu d'avance (nom de la connexion et jeton) : les résultats si
    /// elle est acceptée.
    fn ask(conn: &Connection, token: &str, send: impl FnOnce() -> zbus::Result<()>) -> Option<HashMap<String, OwnedValue>> {
        let sender = conn.unique_name()?.as_str().trim_start_matches(':').replace('.', "_");
        let path = format!("{PATH}/request/{sender}/{token}");
        let request = Proxy::new(conn, DESKTOP, path.as_str(), "org.freedesktop.portal.Request").ok()?;
        let mut responses = request.receive_signal("Response").ok()?;
        send().ok()?;
        let message = responses.next()?;
        let (code, results): (u32, HashMap<String, OwnedValue>) = message.body().deserialize().ok()?;
        (code == 0).then_some(results)
    }

    /// Description de la combinaison donnée par le bureau dans la réponse à `BindShortcuts`.
    pub fn trigger_of(results: &HashMap<String, OwnedValue>) -> Option<String> {
        let Value::Array(list) = &**results.get("shortcuts")? else {
            return None;
        };
        list.iter().find_map(|item| {
            let Value::Structure(entry) = item else {
                return None;
            };
            let [Value::Str(id), Value::Dict(info)] = entry.fields() else {
                return None;
            };
            if id.as_str() != ID {
                return None;
            }
            info.iter().find_map(|(key, value)| {
                let value = if let Value::Value(inner) = value { &**inner } else { value };
                match (key, value) {
                    (Value::Str(key), Value::Str(text)) if key.as_str() == "trigger_description" => Some(text.to_string()),
                    _ => None,
                }
            })
        })
    }

    /// Sur le fil courant : ouvre une session du portail, envoie (numéro, réussite), demande le
    /// raccourci au bureau, puis appelle `pressed` à chaque appui jusqu'à l'arrêt.
    pub fn run(h: Hotkey, description: &str, ready: std::sync::mpsc::Sender<(u32, bool)>, pressed: impl Fn()) {
        let opened = (|| {
            let conn = Connection::session().ok()?;
            let portal = Proxy::new(&conn, DESKTOP, PATH, SHORTCUTS).ok()?;
            let options = HashMap::from([("handle_token", Value::from("aqueli_session")), ("session_handle_token", Value::from("aqueli"))]);
            let created = ask(&conn, "aqueli_session", || portal.call_method("CreateSession", &(options,)).map(|_| ()))?;
            let session = match &**created.get("session_handle")? {
                Value::Str(path) => path.to_string(),
                Value::ObjectPath(path) => path.to_string(),
                _ => return None,
            };
            Some((conn, portal, session))
        })();
        let Some((conn, portal, session)) = opened else {
            let _ = ready.send((0, false));
            return;
        };
        let stop = Arc::new(AtomicBool::new(false));
        if let Ok(mut current) = SESSION.lock() {
            *current = Some((conn.clone(), session.clone(), stop.clone()));
        }
        let Ok(activations) = portal.receive_signal("Activated") else {
            let _ = ready.send((0, false));
            return;
        };
        let _ = ready.send((0, true));

        let mut shortcut = HashMap::from([("description", Value::from(description))]);
        if let Some(trigger) = preferred_trigger(&h) {
            shortcut.insert("preferred_trigger", Value::from(trigger));
        }
        let Ok(path) = ObjectPath::try_from(session.as_str()) else {
            return;
        };
        let options = HashMap::from([("handle_token", Value::from("aqueli_bind"))]);
        // Le bureau peut demander son accord : la réponse arrive quand la personne a choisi.
        let bound = ask(&conn, "aqueli_bind", || portal.call_method("BindShortcuts", &(&path, vec![(ID, shortcut)], "", options)).map(|_| ()));
        let Some(results) = bound else {
            return;
        };
        if let Ok(mut trigger) = TRIGGER.lock() {
            *trigger = Some(trigger_of(&results).unwrap_or_default());
        }
        for message in activations {
            if stop.load(Ordering::SeqCst) {
                break;
            }
            if let Ok((from, id, _, _)) = message.body().deserialize::<(OwnedObjectPath, String, u64, HashMap<String, OwnedValue>)>() {
                if from.as_str() == session && id == ID {
                    pressed();
                }
            }
        }
    }

    /// Ferme la session du portail : le bureau cesse d'envoyer le raccourci.
    pub fn stop() {
        let Some((conn, session, stop)) = SESSION.lock().ok().and_then(|mut s| s.take()) else {
            return;
        };
        stop.store(true, Ordering::SeqCst);
        if let Ok(proxy) = Proxy::new(&conn, DESKTOP, session.as_str(), "org.freedesktop.portal.Session") {
            let _ = proxy.call_method("Close", &());
        }
        if let Ok(mut trigger) = TRIGGER.lock() {
            *trigger = None;
        }
    }
}

/// Session Wayland, où le raccourci dépend du bureau.
pub fn managed_by_desktop() -> bool {
    #[cfg(target_os = "linux")]
    return x11::wayland();
    #[cfg(not(target_os = "linux"))]
    false
}

/// Sous Wayland, ce que l'interface montre du raccourci : la combinaison retenue par le bureau
/// (vide s'il ne l'a pas décrite), ou rien s'il ne l'a pas acceptée ; et la commande à associer
/// soi-même à un raccourci du bureau.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopShortcut {
    pub trigger: Option<String>,
    pub command: String,
}

pub fn desktop() -> Option<DesktopShortcut> {
    #[cfg(target_os = "linux")]
    if managed_by_desktop() {
        let trigger = portal::TRIGGER.lock().ok().and_then(|t| t.clone());
        return Some(DesktopShortcut { trigger, command: crate::system::autostart::command(CAPTURE_ARG) });
    }
    None
}

/// Argument de lancement qui ouvre la capture rapide (Aqueli déjà ouvert ou non) : sous Wayland,
/// une commande à associer à un raccourci du bureau.
pub const CAPTURE_ARG: &str = "--capture-rapide";

/// Arrête le raccourci actif.
pub fn stop(app: &AppHandle) {
    let current = app.state::<HotkeyState>().0.lock().ok().and_then(|mut s| s.take());
    #[cfg(windows)]
    if let Some((thread, _)) = current {
        win::stop(thread);
    }
    #[cfg(target_os = "linux")]
    if let Some((id, _)) = current {
        if x11::wayland() {
            portal::stop();
        } else {
            x11::stop(id);
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    let _ = current;
}

/// Active `hotkey` à la place du raccourci actuel ; en cas d'échec, l'ancien reste actif.
pub fn register(app: &AppHandle, hotkey: Hotkey) -> Result<(), HotkeyError> {
    if !hotkey.is_valid() {
        return Err(HotkeyError::Invalid);
    }
    #[cfg(any(windows, target_os = "linux"))]
    {
        let previous = active(app);
        // Sous Wayland, la combinaison se règle dans les paramètres du bureau.
        if previous == Some(hotkey) || (previous.is_some() && managed_by_desktop()) {
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
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        let _ = app;
        Err(HotkeyError::Unsupported)
    }
}

#[cfg(any(windows, target_os = "linux"))]
fn start(app: &AppHandle, hotkey: Hotkey) -> Result<(), HotkeyError> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = app.clone();
    #[cfg(target_os = "linux")]
    let description = crate::lang::text(crate::lang::of(app), "Capture rapide");
    std::thread::spawn(move || {
        let pressed = || {
            let target = handle.clone();
            let _ = handle.run_on_main_thread(move || crate::capture::show(&target));
        };
        #[cfg(windows)]
        win::run(hotkey, tx, pressed);
        #[cfg(target_os = "linux")]
        if x11::wayland() {
            portal::run(hotkey, description, tx, pressed);
        } else {
            x11::run(hotkey, tx, pressed);
        }
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

    #[cfg(target_os = "linux")]
    #[test]
    fn sous_x11_les_touches_et_les_modificateurs_se_traduisent() {
        assert_eq!(x11::keysym(0x41), Some(0x61), "A → a");
        assert_eq!(x11::keysym(0x20), Some(0x20));
        assert_eq!(x11::keysym(0x35), Some(0x35));
        assert_eq!(x11::keysym(0x70), Some(0xffbe), "F1");
        assert_eq!(x11::keysym(0x7B), Some(0xffc9), "F12");
        assert_eq!(x11::keysym(0x0D), None);
        assert_eq!(x11::modifiers(&Hotkey::default()), x11_dl::xlib::ControlMask | x11_dl::xlib::Mod1Mask);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn sous_wayland_la_combinaison_proposee_suit_les_raccourcis_xdg() {
        assert_eq!(portal::preferred_trigger(&Hotkey::default()).as_deref(), Some("CTRL+ALT+a"));
        let all = Hotkey { ctrl: true, alt: true, shift: true, win: true, key: 0x20 };
        assert_eq!(portal::preferred_trigger(&all).as_deref(), Some("CTRL+ALT+SHIFT+LOGO+space"));
        assert_eq!(portal::preferred_trigger(&Hotkey { win: true, ctrl: false, alt: false, shift: false, key: 0x7B }).as_deref(), Some("LOGO+F12"));
        assert_eq!(portal::preferred_trigger(&Hotkey { key: 0x37, ..Hotkey::default() }).as_deref(), Some("CTRL+ALT+7"));
        assert_eq!(portal::preferred_trigger(&Hotkey { key: 0x0D, ..Hotkey::default() }), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn sous_wayland_la_combinaison_retenue_se_lit_dans_la_reponse_du_bureau() {
        use std::collections::HashMap;
        use zbus::zvariant::{OwnedValue, Value};
        let entry = |id: &str, trigger: &str| (id.to_string(), HashMap::from([("description".to_string(), Value::from("Capture rapide")), ("trigger_description".to_string(), Value::from(trigger.to_string()))]));
        let list = Value::from(vec![entry("autre", "Ctrl+B"), entry("capture-rapide", "Ctrl+Alt+A")]);
        let results = HashMap::from([("shortcuts".to_string(), OwnedValue::try_from(list).unwrap())]);
        assert_eq!(portal::trigger_of(&results).as_deref(), Some("Ctrl+Alt+A"));
        assert_eq!(portal::trigger_of(&HashMap::new()), None);
    }

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
