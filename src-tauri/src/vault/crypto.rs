//! Briques cryptographiques du coffre : aléa du système, dérivation Argon2id,
//! chiffrement authentifié AES-256-GCM.

use aes_gcm::aead::{Aead, KeyInit, Nonce, Payload};
use aes_gcm::Aes256Gcm;
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;

/// Clé secrète de 256 bits, effacée de la mémoire dès qu'elle n'est plus utilisée.
pub type SecretKey = Zeroizing<[u8; KEY_LEN]>;

/// Échec cryptographique volontairement sans détail : on ne dit jamais pourquoi un
/// déchiffrement a échoué (mauvaise clé ou données modifiées, c'est pareil).
#[derive(Debug, PartialEq, Eq)]
pub struct CryptoError;

/// Réglages d'Argon2id, enregistrés avec le coffre pour pouvoir les renforcer plus tard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct KdfParams {
    pub memory_kib: u32,
    pub iterations: u32,
    pub lanes: u32,
}

impl KdfParams {
    /// 128 Mio de mémoire et 3 passes : plus du double des recommandations de l'OWASP,
    /// pour environ 0,15 s sur ce PC (moins d'une seconde sur un PC modeste).
    pub const STANDARD: KdfParams = KdfParams { memory_kib: 128 * 1024, iterations: 3, lanes: 1 };

    /// Réglage minuscule, réservé aux tests automatiques pour qu'ils restent rapides.
    #[cfg(test)]
    pub const FAST_FOR_TESTS: KdfParams = KdfParams { memory_kib: 64, iterations: 1, lanes: 1 };
}

/// Octets aléatoires fournis par Windows (générateur cryptographique du système).
pub fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).map_err(|_| CryptoError)?;
    Ok(bytes)
}

/// Nouvelle clé aléatoire de 256 bits.
pub fn random_key() -> Result<SecretKey, CryptoError> {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    getrandom::fill(key.as_mut()).map_err(|_| CryptoError)?;
    Ok(key)
}

/// Transforme un secret (mot de passe ou clé de récupération) en clé de 256 bits.
/// Argon2id rend chaque essai coûteux en temps et en mémoire, ce qui décourage
/// les attaques qui essaient des millions de mots de passe.
pub fn derive_key(secret: &[u8], salt: &[u8], params: KdfParams) -> Result<SecretKey, CryptoError> {
    let argon_params = Params::new(params.memory_kib, params.iterations, params.lanes, Some(KEY_LEN))
        .map_err(|_| CryptoError)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon_params);
    let mut out = Zeroizing::new([0u8; KEY_LEN]);
    argon
        .hash_password_into(secret, salt, out.as_mut())
        .map_err(|_| CryptoError)?;
    Ok(out)
}

/// Chiffre `plaintext` avec `key`. `context` n'est pas chiffré mais authentifié :
/// un bloc chiffré pour un usage ne peut pas être réutilisé pour un autre.
pub fn seal(key: &[u8; KEY_LEN], plaintext: &[u8], context: &[u8]) -> Result<([u8; NONCE_LEN], Vec<u8>), CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError)?;
    let nonce_bytes = random_bytes::<NONCE_LEN>()?;
    let nonce = Nonce::<Aes256Gcm>::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, Payload { msg: plaintext, aad: context })
        .map_err(|_| CryptoError)?;
    Ok((nonce_bytes, ciphertext))
}

/// Déchiffre un bloc produit par [`seal`]. Échoue si la clé, le contexte ou les données
/// ne correspondent pas exactement.
pub fn open(
    key: &[u8; KEY_LEN],
    nonce: &[u8],
    ciphertext: &[u8],
    context: &[u8],
) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| CryptoError)?;
    let nonce_bytes: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| CryptoError)?;
    let nonce = Nonce::<Aes256Gcm>::from(nonce_bytes);
    cipher
        .decrypt(&nonce, Payload { msg: ciphertext, aad: context })
        .map(Zeroizing::new)
        .map_err(|_| CryptoError)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfParams = KdfParams::FAST_FOR_TESTS;

    #[test]
    fn la_derivation_est_stable_pour_un_meme_sel() {
        let salt = [7u8; SALT_LEN];
        let a = derive_key(b"motdepasse", &salt, FAST).unwrap();
        let b = derive_key(b"motdepasse", &salt, FAST).unwrap();
        assert_eq!(*a, *b);
    }

    #[test]
    fn la_derivation_change_avec_le_sel_ou_le_secret() {
        let a = derive_key(b"motdepasse", &[1u8; SALT_LEN], FAST).unwrap();
        let b = derive_key(b"motdepasse", &[2u8; SALT_LEN], FAST).unwrap();
        let c = derive_key(b"motdepassf", &[1u8; SALT_LEN], FAST).unwrap();
        assert_ne!(*a, *b);
        assert_ne!(*a, *c);
    }

    #[test]
    fn chiffrer_puis_dechiffrer_rend_le_message() {
        let key = random_key().unwrap();
        let (nonce, sealed) = seal(&key, b"cle maitresse", b"contexte").unwrap();
        assert_ne!(&sealed[..], b"cle maitresse");
        let opened = open(&key, &nonce, &sealed, b"contexte").unwrap();
        assert_eq!(&opened[..], b"cle maitresse");
    }

    #[test]
    fn une_mauvaise_cle_est_refusee() {
        let key = random_key().unwrap();
        let other = random_key().unwrap();
        let (nonce, sealed) = seal(&key, b"secret", b"ctx").unwrap();
        assert_eq!(open(&other, &nonce, &sealed, b"ctx"), Err(CryptoError));
    }

    #[test]
    fn des_donnees_modifiees_ou_un_autre_contexte_sont_refuses() {
        let key = random_key().unwrap();
        let (nonce, mut sealed) = seal(&key, b"secret", b"mot-de-passe").unwrap();
        assert_eq!(open(&key, &nonce, &sealed, b"recuperation"), Err(CryptoError));
        sealed[0] ^= 1;
        assert_eq!(open(&key, &nonce, &sealed, b"mot-de-passe"), Err(CryptoError));
    }

    #[test]
    fn deux_chiffrements_du_meme_message_different() {
        let key = random_key().unwrap();
        let (n1, s1) = seal(&key, b"secret", b"ctx").unwrap();
        let (n2, s2) = seal(&key, b"secret", b"ctx").unwrap();
        assert_ne!(n1, n2);
        assert_ne!(s1, s2);
    }
}

#[cfg(test)]
mod timing {
    use super::*;

    /// Mesure le temps d'une dérivation de production (lancer avec --ignored).
    #[test]
    #[ignore]
    fn duree_d_une_derivation_standard() {
        let start = std::time::Instant::now();
        derive_key(b"Vagues et bulles 2026", &[3u8; SALT_LEN], KdfParams::STANDARD).unwrap();
        println!("Argon2id standard : {} ms", start.elapsed().as_millis());
    }
}
