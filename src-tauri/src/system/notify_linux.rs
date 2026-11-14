//! Notifications du bureau Linux pour les rappels : service `org.freedesktop.Notifications`
//! (GNOME, KDE, Xfce…), par D-Bus, avec les boutons « Reporter 10 min » et « Terminé » quand le
//! bureau montre des boutons. `zbus` fait déjà partie de Tauri sous Linux.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::AppHandle;
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::Value;

use super::alerts;
use crate::reminders::Notice;

const SERVICE: &str = "org.freedesktop.Notifications";
const PATH: &str = "/org/freedesktop/Notifications";

/// Connexion à la session et notifications d'Aqueli encore affichées : numéro donné par le bureau
/// → arguments du clic sur la notification elle-même.
struct Desktop {
    conn: Connection,
    shown: Mutex<HashMap<u32, String>>,
}

static DESKTOP: OnceLock<Option<Desktop>> = OnceLock::new();
static ICON: OnceLock<PathBuf> = OnceLock::new();

/// Icône d'Aqueli dans les notifications (fichier écrit au démarrage, comme sous Windows).
pub fn set_icon(icon: &Path) {
    let _ = ICON.set(icon.to_path_buf());
}

fn desktop(app: &AppHandle) -> Option<&'static Desktop> {
    DESKTOP
        .get_or_init(|| {
            let conn = Connection::session().ok()?;
            listen(app.clone(), conn.clone());
            Some(Desktop { conn, shown: Mutex::new(HashMap::new()) })
        })
        .as_ref()
}

/// Texte sûr là où le bureau lit du balisage (gras, liens) dans le corps de la notification.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Boutons au format du bureau : clé, libellé, clé, libellé… ; « default » est le clic sur la
/// notification elle-même.
fn actions(content: &alerts::Content) -> Vec<String> {
    let mut list = vec!["default".to_string(), String::new()];
    for (arguments, label) in &content.actions {
        list.push(arguments.clone());
        list.push(label.clone());
    }
    list
}

/// Clics sur les notifications : le bureau les annonce à toute la session ; seules celles
/// d'Aqueli (numéros gardés dans `shown`) sont suivies.
fn listen(app: AppHandle, conn: Connection) {
    std::thread::spawn(move || {
        let Ok(proxy) = Proxy::new(&conn, SERVICE, PATH, SERVICE) else {
            return;
        };
        let (Ok(invoked), Ok(closed)) = (proxy.receive_signal("ActionInvoked"), proxy.receive_signal("NotificationClosed")) else {
            return;
        };
        let forget = std::thread::spawn(move || {
            for message in closed {
                if let (Ok((id, _reason)), Some(Some(desktop))) = (message.body().deserialize::<(u32, u32)>(), DESKTOP.get()) {
                    if let Ok(mut shown) = desktop.shown.lock() {
                        shown.remove(&id);
                    }
                }
            }
        });
        for message in invoked {
            let Ok((id, key)) = message.body().deserialize::<(u32, String)>() else {
                continue;
            };
            let Some(Some(desktop)) = DESKTOP.get() else {
                continue;
            };
            let launch = desktop.shown.lock().ok().and_then(|mut shown| shown.remove(&id));
            if let Some(launch) = launch {
                alerts::on_activated(&app, if key == "default" { &launch } else { &key });
            }
        }
        let _ = forget.join();
    });
}

/// Affiche une notification du bureau ; l'erreur dit pourquoi (jamais le texte du rappel).
pub fn show(app: &AppHandle, notice: &Notice) -> Result<(), String> {
    let desktop = desktop(app).ok_or("bus de session introuvable")?;
    let content = alerts::content(notice, crate::lang::of(app));
    let icon = ICON.get().map(|p| format!("file://{}", p.display())).unwrap_or_default();
    let mut hints: HashMap<&str, Value> = HashMap::new();
    hints.insert("urgency", Value::U8(1));
    let proxy = Proxy::new(&desktop.conn, SERVICE, PATH, SERVICE).map_err(|e| e.to_string())?;
    // Délai 0 : la notification reste jusqu'à ce qu'on la ferme, comme un rappel de Windows.
    let id: u32 = proxy
        .call("Notify", &("Aqueli", 0u32, icon.as_str(), content.title.as_str(), escape(&content.body), actions(&content), hints, 0i32))
        .map_err(|e| e.to_string())?;
    if let Ok(mut shown) = desktop.shown.lock() {
        shown.insert(id, content.launch);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lang::Lang;

    #[test]
    fn les_boutons_partent_par_paires_cle_libelle() {
        let content = alerts::content(&Notice::Task { id: "a1".into(), title: "Pain".into(), when: "14:00".into() }, Lang::Fr);
        assert_eq!(actions(&content), ["default", "", "reporter:a1", "Reporter 10 min", "terminer:a1", "Terminé"]);
    }

    #[test]
    fn le_corps_est_protege_du_balisage() {
        assert_eq!(escape("Pain & <lait>"), "Pain &amp; &lt;lait&gt;");
    }
}
