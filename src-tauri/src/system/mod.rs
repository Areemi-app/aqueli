//! Liaisons avec Windows : Windows Hello, session Windows, notifications, démarrage
//! automatique et arrière-plan.

#[cfg(windows)]
pub mod autostart;
pub mod background;
pub mod discreet;
#[cfg(windows)]
pub mod dialogs;
#[cfg(windows)]
pub mod hello;
pub mod hotkey;
#[cfg(windows)]
pub mod notify;
#[cfg(windows)]
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
