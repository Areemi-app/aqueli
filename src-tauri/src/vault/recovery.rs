//! Clé de récupération : 24 caractères faciles à recopier à la main
//! (alphabet de Crockford : pas de I, L, O ni U), soit 120 bits de hasard.
//! Elle s'affiche en 6 groupes de 4 : « K7PQ-2M9D-… ».

use zeroize::Zeroizing;

use super::crypto::{random_bytes, CryptoError};

const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
pub const RECOVERY_LEN: usize = 24;
const GROUP: usize = 4;

/// Tire une nouvelle clé de récupération (sans tirets).
pub fn generate() -> Result<Zeroizing<String>, CryptoError> {
    let bytes = Zeroizing::new(random_bytes::<RECOVERY_LEN>()?);
    // 256 est un multiple de 32 : prendre les 5 bits de poids faible ne favorise aucun caractère.
    let key: String = bytes.iter().map(|b| ALPHABET[(b & 31) as usize] as char).collect();
    Ok(Zeroizing::new(key))
}

/// « K7PQ2M9D… » → « K7PQ-2M9D-… ».
pub fn format(key: &str) -> Zeroizing<String> {
    let chars: Vec<char> = key.chars().collect();
    Zeroizing::new(
        chars
            .chunks(GROUP)
            .map(|c| c.iter().collect::<String>())
            .collect::<Vec<_>>()
            .join("-"),
    )
}

/// Nettoie une clé saisie : majuscules, sans espaces ni tirets, et corrige les
/// confusions courantes (O → 0, I et L → 1). `None` si ce n'est pas une clé valide.
pub fn normalize(input: &str) -> Option<Zeroizing<String>> {
    let mut out = Zeroizing::new(String::with_capacity(RECOVERY_LEN));
    for ch in input.chars() {
        let c = match ch.to_ascii_uppercase() {
            ' ' | '-' | '\t' => continue,
            'O' => '0',
            'I' | 'L' => '1',
            c => c,
        };
        if !c.is_ascii() || !ALPHABET.contains(&(c as u8)) {
            return None;
        }
        out.push(c);
    }
    (out.len() == RECOVERY_LEN).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_cle_fait_24_caracteres_de_l_alphabet() {
        let key = generate().unwrap();
        assert_eq!(key.len(), RECOVERY_LEN);
        assert!(key.bytes().all(|b| ALPHABET.contains(&b)));
    }

    #[test]
    fn deux_cles_sont_differentes() {
        assert_ne!(*generate().unwrap(), *generate().unwrap());
    }

    #[test]
    fn la_cle_s_affiche_en_six_groupes() {
        let formatted = format("ABCD0123EFGH4567JKMN89PQ");
        assert_eq!(*formatted, "ABCD-0123-EFGH-4567-JKMN-89PQ");
    }

    #[test]
    fn la_saisie_est_toleree() {
        let expected = "ABCD0123EFGH4567JKMN89PQ";
        assert_eq!(normalize("abcd-0123-efgh-4567-jkmn-89pq").unwrap().as_str(), expected);
        assert_eq!(normalize(" ABCD 0123 EFGH 4567 JKMN 89PQ ").unwrap().as_str(), expected);
        // O lu comme zéro, I et L lus comme un.
        assert_eq!(normalize("ABCDO123EFGH4567JKMN89PQ").unwrap().as_str(), expected);
        assert_eq!(
            normalize("ABCD0I23EFGH4567JKMN89PQ").unwrap().as_str(),
            "ABCD0123EFGH4567JKMN89PQ"
        );
    }

    #[test]
    fn une_saisie_incomplete_ou_etrange_est_refusee() {
        assert!(normalize("ABCD-0123").is_none());
        assert!(normalize("ABCD0123EFGH4567JKMN89PQR").is_none());
        assert!(normalize("ABCD0123EFGH4567JKMN89P!").is_none());
        assert!(normalize("ABCD0123EFGH4567JKMN89PÉ").is_none());
        assert!(normalize("ABCD0123EFGH4567JKMN89PU").is_none());
    }
}
