//! Session Linux : verrouillage d'Aqueli quand la session se verrouille (Super+L, économiseur
//! d'écran) ou que l'ordinateur se met en veille, d'après `logind` (bus système, service
//! `org.freedesktop.login1`, commun à GNOME, KDE et aux autres bureaux qui utilisent systemd).

use std::collections::HashMap;

use tauri::{AppHandle, Emitter, Manager};
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedObjectPath, OwnedValue};

use crate::commands::VaultState;

/// Événement envoyé à l'interface quand le système a provoqué le verrouillage (même nom que
/// sous Windows).
pub const SYSTEM_LOCK_EVENT: &str = "verrouillage-systeme";

const LOGIN: &str = "org.freedesktop.login1";

fn lock_everything(app: &AppHandle, why: &str) {
    if !super::background::settings(app).lock_with_windows {
        return;
    }
    crate::diagnostic::note(app, &format!("verrouillage avec la session : {why}"));
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Ok(mut vault) = handle.state::<VaultState>().0.lock() {
            vault.lock();
        }
    });
    crate::note_window::close_all(app);
    let _ = app.emit(SYSTEM_LOCK_EVENT, ());
}

/// `LockedHint` passé à vrai dans un changement de propriétés de la session.
fn locked(changed: &HashMap<String, OwnedValue>) -> bool {
    changed.get("LockedHint").and_then(|v| bool::try_from(v).ok()).unwrap_or(false)
}

/// Suit la session et la veille ; sans bus système (conteneur, autre init), rien ne change.
pub fn watch(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Ok(conn) = Connection::system() else {
            crate::diagnostic::note(&app, "verrouillage avec la session : bus système introuvable");
            return;
        };
        let Ok(manager) = Proxy::new(&conn, LOGIN, "/org/freedesktop/login1", "org.freedesktop.login1.Manager") else {
            return;
        };
        // Mise en veille : `PrepareForSleep(true)` juste avant.
        if let Ok(signals) = manager.receive_signal("PrepareForSleep") {
            let app = app.clone();
            std::thread::spawn(move || {
                for message in signals {
                    if message.body().deserialize::<bool>().unwrap_or(false) {
                        lock_everything(&app, "mise en veille");
                    }
                }
            });
        }
        let session: Option<OwnedObjectPath> = manager.call("GetSessionByPID", &(std::process::id())).ok();
        let Some(session) = session else {
            crate::diagnostic::note(&app, "verrouillage avec la session : session introuvable");
            return;
        };
        // Verrouillage demandé (`loginctl lock-session`, bureaux KDE ou Xfce) : signal `Lock`.
        if let Ok(signals) = Proxy::new(&conn, LOGIN, session.as_ref(), "org.freedesktop.login1.Session").and_then(|p| p.receive_signal("Lock")) {
            let app = app.clone();
            std::thread::spawn(move || {
                for _ in signals {
                    lock_everything(&app, "session verrouillée");
                }
            });
        }
        // Écran verrouillé par le bureau (GNOME, KDE) : propriété `LockedHint`.
        if let Ok(signals) = Proxy::new(&conn, LOGIN, session.as_ref(), "org.freedesktop.DBus.Properties").and_then(|p| p.receive_signal("PropertiesChanged")) {
            for message in signals {
                if let Ok((_, changed, _)) = message.body().deserialize::<(String, HashMap<String, OwnedValue>, Vec<String>)>() {
                    if locked(&changed) {
                        lock_everything(&app, "écran verrouillé");
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use zbus::zvariant::Value;

    #[test]
    fn seul_un_verrouillage_de_l_ecran_compte() {
        let with = |key: &str, value: Value| HashMap::from([(key.to_string(), OwnedValue::try_from(value).unwrap())]);
        assert!(locked(&with("LockedHint", Value::Bool(true))));
        assert!(!locked(&with("LockedHint", Value::Bool(false))));
        assert!(!locked(&with("IdleHint", Value::Bool(true))));
    }
}
