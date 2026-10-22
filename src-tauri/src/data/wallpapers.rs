//! Fonds d'écran des thèmes personnels (éditeur de thème). L'image, réduite par l'interface,
//! est rangée dans la base chiffrée : elle ne s'affiche qu'une fois le compte déverrouillé.
//! Le réglage du thème (couleurs, flou…) reste dans les préférences.

use rusqlite::{params, Connection, OptionalExtension};

use super::DataError;

/// Autant de fonds que de thèmes personnels.
pub const MAX_WALLPAPERS: usize = 12;
/// Image JPEG, PNG ou WebP en « data: », réduite à 2560 px de côté par l'interface.
pub const MAX_WALLPAPER_CHARS: usize = 8_000_000;

fn invalid(field: &str) -> DataError {
    DataError::Invalid { field: field.into() }
}

/// Identifiant d'un thème personnel : « perso-» suivi de 6 à 20 lettres minuscules ou chiffres.
pub fn is_theme_id(id: &str) -> bool {
    id.strip_prefix("perso-")
        .is_some_and(|rest| (6..=20).contains(&rest.len()) && rest.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()))
}

pub fn is_image(value: &str) -> bool {
    let Some(data) = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"].iter().find_map(|p| value.strip_prefix(p)) else {
        return false;
    };
    value.len() <= MAX_WALLPAPER_CHARS && !data.is_empty() && data.chars().all(|c| c.is_ascii_alphanumeric() || "+/=".contains(c))
}

pub fn get(conn: &Connection, id: &str) -> Result<Option<String>, DataError> {
    if !is_theme_id(id) {
        return Err(invalid("id"));
    }
    Ok(conn.query_row("SELECT data FROM wallpapers WHERE id = ?1", params![id], |r| r.get(0)).optional()?)
}

/// Enregistre (ou remplace) le fond d'écran d'un thème personnel.
pub fn set(conn: &Connection, id: &str, data: &str, now: u64) -> Result<(), DataError> {
    if !is_theme_id(id) {
        return Err(invalid("id"));
    }
    if !is_image(data) {
        return Err(invalid("data"));
    }
    let exists: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM wallpapers WHERE id = ?1)", params![id], |r| r.get(0))?;
    if !exists {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM wallpapers", [], |r| r.get(0))?;
        if count as usize >= MAX_WALLPAPERS {
            return Err(DataError::TooMany { max: MAX_WALLPAPERS });
        }
    }
    conn.execute(
        "INSERT INTO wallpapers (id, data, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        params![id, data, now as i64],
    )?;
    Ok(())
}

pub fn delete(conn: &Connection, id: &str) -> Result<(), DataError> {
    if !is_theme_id(id) {
        return Err(invalid("id"));
    }
    conn.execute("DELETE FROM wallpapers WHERE id = ?1", params![id])?;
    Ok(())
}

/// Contenu d'un fichier .aqtheme à exporter : du texte JSON raisonnable.
pub fn is_theme_file(content: &str) -> bool {
    content.len() <= MAX_WALLPAPER_CHARS + 10_000 && content.trim_start().starts_with('{') && content.contains("\"aqueli-theme\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn un_fond_s_enregistre_se_remplace_et_s_efface() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert_eq!(get(c, "perso-abc12345").unwrap(), None);
        set(c, "perso-abc12345", "data:image/jpeg;base64,AAAA", NOW).unwrap();
        set(c, "perso-abc12345", "data:image/png;base64,BBBB", NOW).unwrap();
        assert_eq!(get(c, "perso-abc12345").unwrap().as_deref(), Some("data:image/png;base64,BBBB"));
        delete(c, "perso-abc12345").unwrap();
        assert_eq!(get(c, "perso-abc12345").unwrap(), None);
    }

    #[test]
    fn seules_les_images_et_les_identifiants_attendus_passent() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let c = vault.connection_mut().unwrap();
        assert!(set(c, "aqua", "data:image/jpeg;base64,AAAA", NOW).is_err());
        assert!(set(c, "perso-../x", "data:image/jpeg;base64,AAAA", NOW).is_err());
        assert!(set(c, "perso-abc12345", "data:text/html;base64,AAAA", NOW).is_err());
        assert!(set(c, "perso-abc12345", "data:image/jpeg;base64,<script>", NOW).is_err());
        for i in 0..MAX_WALLPAPERS {
            set(c, &format!("perso-fond{i:04}"), "data:image/jpeg;base64,AAAA", NOW).unwrap();
        }
        assert!(matches!(set(c, "perso-fond9999", "data:image/jpeg;base64,AAAA", NOW), Err(DataError::TooMany { .. })));
        assert!(is_theme_file("{\"format\":\"aqueli-theme\"}"));
        assert!(!is_theme_file("MZ binaire"));
    }
}
