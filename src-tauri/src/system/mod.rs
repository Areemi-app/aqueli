//! Liaisons avec Windows : Windows Hello, session Windows, notifications, démarrage
//! automatique et arrière-plan.

#[cfg(windows)]
pub mod autostart;
/// Lancement à l'ouverture de la session Linux (`~/.config/autostart`).
#[cfg(target_os = "linux")]
#[path = "autostart_linux.rs"]
pub mod autostart;
pub mod background;
pub mod discreet;
#[cfg(windows)]
pub mod dialogs;
/// Fenêtres de choix de fichiers de Linux (GTK, portail du bureau).
#[cfg(target_os = "linux")]
#[path = "dialogs_linux.rs"]
pub mod dialogs;
#[cfg(windows)]
pub mod hello;
pub mod hotkey;
pub mod alerts;
#[cfg(windows)]
pub mod notify;
/// Notifications du bureau Linux (D-Bus, `org.freedesktop.Notifications`).
#[cfg(target_os = "linux")]
pub mod notify_linux;
#[cfg(windows)]
pub mod session;
/// Session Linux : verrouillage et veille (logind).
#[cfg(target_os = "linux")]
#[path = "session_linux.rs"]
pub mod session;

/// Hors de Windows, Windows Hello n'existe pas : le mot de passe reste la seule clé.
#[cfg(not(windows))]
pub mod hello {
    use crate::vault::hello::{HelloError, HelloProvider};

    pub struct WindowsHello {
        /// Nom de la clé du compte, sans usage hors de Windows.
        #[allow(dead_code)]
        pub names: Vec<String>,
    }

    impl HelloProvider for WindowsHello {
        fn is_supported(&self) -> bool {
            false
        }
        fn create(&self) -> Result<(), HelloError> {
            Err(HelloError::Unsupported)
        }
        fn sign(&self, _challenge: &[u8]) -> Result<Vec<u8>, HelloError> {
            Err(HelloError::Unsupported)
        }
        fn delete(&self) {}
    }
}
