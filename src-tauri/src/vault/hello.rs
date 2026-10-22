//! Windows Hello, vu par le coffre.
//!
//! Windows garde pour Aqueli une clé RSA dans la puce de sécurité (TPM), utilisable
//! seulement après le visage, l'empreinte ou le code PIN. Le coffre lui fait signer un
//! défi aléatoire : la signature RSA (PKCS#1 v1.5) est toujours la même pour un même
//! défi, et son empreinte SHA-256 sert de clé pour enfermer la clé maîtresse.
//! Sans la puce et sans le geste Windows Hello, cette clé est impossible à retrouver.

use sha2::{Digest, Sha256};
use zeroize::Zeroizing;

use super::crypto::{SecretKey, KEY_LEN};

pub const CHALLENGE_LEN: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HelloError {
    /// Windows Hello n'est pas configuré sur ce PC.
    Unsupported,
    /// La personne a annulé la vérification.
    Cancelled,
    /// La clé Windows Hello d'Aqueli n'existe plus (code PIN réinitialisé, par exemple).
    NotFound,
    Failed(String),
}

/// Ce que le coffre attend de Windows Hello. Remplacé par un faux dans les tests.
pub trait HelloProvider {
    fn is_supported(&self) -> bool;
    /// Crée (ou remplace) la clé d'Aqueli ; Windows demande le geste Windows Hello.
    fn create(&self) -> Result<(), HelloError>;
    /// Signe `challenge` avec la clé d'Aqueli ; Windows demande le geste Windows Hello.
    fn sign(&self, challenge: &[u8]) -> Result<Vec<u8>, HelloError>;
    fn delete(&self);
}

/// Clé d'enfermement tirée de la signature.
pub fn key_from_signature(signature: &[u8]) -> SecretKey {
    let digest = Sha256::digest(signature);
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    key.copy_from_slice(&digest);
    key
}

/// Faux Windows Hello pour les tests : « signe » de façon déterministe avec un secret.
#[cfg(test)]
pub mod fake {
    use std::cell::RefCell;

    use super::*;

    pub struct FakeHello {
        pub secret: RefCell<Option<[u8; 16]>>,
        pub cancel_next: RefCell<bool>,
        pub supported: bool,
    }

    impl Default for FakeHello {
        fn default() -> Self {
            Self { secret: RefCell::new(None), cancel_next: RefCell::new(false), supported: true }
        }
    }

    impl FakeHello {
        pub fn new() -> Self {
            Self::default()
        }
    }

    impl HelloProvider for FakeHello {
        fn is_supported(&self) -> bool {
            self.supported
        }

        fn create(&self) -> Result<(), HelloError> {
            if !self.supported {
                return Err(HelloError::Unsupported);
            }
            let secret = super::super::crypto::random_bytes::<16>().unwrap();
            *self.secret.borrow_mut() = Some(secret);
            Ok(())
        }

        fn sign(&self, challenge: &[u8]) -> Result<Vec<u8>, HelloError> {
            if self.cancel_next.replace(false) {
                return Err(HelloError::Cancelled);
            }
            let secret = self.secret.borrow().ok_or(HelloError::NotFound)?;
            let mut hasher = Sha256::new();
            hasher.update(secret);
            hasher.update(challenge);
            Ok(hasher.finalize().to_vec())
        }

        fn delete(&self) {
            *self.secret.borrow_mut() = None;
        }
    }
}
