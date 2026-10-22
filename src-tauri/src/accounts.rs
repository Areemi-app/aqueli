//! Comptes de ce PC : chaque personne a son compte (pseudo, mot de passe, clé de récupération,
//! Windows Hello), chiffré à part. Pas d'adresse e-mail ni de serveur : tout reste sur ce PC.
//!
//! Le registre `comptes.json`, à la racine du dossier des données, liste les comptes et celui
//! qui s'ouvre. Le premier compte (« principal ») vit à la racine, comme avant les comptes
//! multiples : une installation existante n'a aucun fichier déplacé. Les comptes ajoutés vivent
//! dans `comptes/<identifiant>`. Le pseudo et l'image de profil sont des préférences du compte
//! (`displayName`, `avatar`), lisibles avant le déverrouillage.
//!
//! Changer de compte redémarre Aqueli : dossier, préférences, rappels et coffre se rechargent
//! d'un bloc, sans état d'un compte qui traînerait dans l'autre.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::files::{shred, write_atomic};

pub const REGISTRY_FILE: &str = "comptes.json";
pub const ACCOUNTS_FOLDER: &str = "comptes";
/// Identifiant du compte qui vit à la racine du dossier des données.
pub const MAIN_ID: &str = "principal";
/// Marque laissée par un changement de compte : le redémarrage affiche la fenêtre, même si
/// Aqueli avait été lancé discrètement au démarrage de Windows.
const SWITCH_FLAG: &str = "changement-de-compte";
/// Fichiers de la racine communs à tous les comptes (jamais effacés avec le compte principal).
const SHARED_FILES: [&str; 4] = [REGISTRY_FILE, crate::data_location::POINTER_FILE, SWITCH_FLAG, "icone-notifications.png"];
/// Fichiers qui montrent qu'un compte existe à la racine (installation d'avant les comptes).
const ACCOUNT_MARKERS: [&str; 5] = ["coffre.json", "coffre-secours.json", "aqueli.db", "aqualis.db", crate::prefs::PREFS_FILE];
/// Nombre de comptes au plus sur un PC.
pub const MAX_ACCOUNTS: usize = 20;
/// Noms déjà pris dans Documents\Aqueli.
const RESERVED_FOLDERS: [&str; 4] = ["import", "traités", "guide d'import", "import guide"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    /// Dossier du compte dans Documents\Aqueli (import) ; vide pour le compte principal, ou tant
    /// qu'il n'a pas servi.
    #[serde(default)]
    pub dossier: String,
    #[serde(default)]
    pub cree: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub actif: String,
    /// Compte ouvert avant un ajout : « Annuler » y revient.
    #[serde(default)]
    pub precedent: String,
    #[serde(default)]
    pub comptes: Vec<Entry>,
}

fn valid_id(id: &str) -> bool {
    id == MAIN_ID || (id.len() == 12 && id.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()))
}

/// Dossier d'un compte.
pub fn dir_of(root: &Path, id: &str) -> PathBuf {
    if id == MAIN_ID {
        root.to_path_buf()
    } else {
        root.join(ACCOUNTS_FOLDER).join(id)
    }
}

/// Un compte existe à la racine : coffre, base ou préférences d'une installation précédente.
fn main_in_use(root: &Path) -> bool {
    ACCOUNT_MARKERS.iter().any(|f| root.join(f).exists())
}

/// Le compte a un coffre (sinon il attend sa création).
pub fn has_vault(dir: &Path) -> bool {
    dir.join("coffre.json").exists() || dir.join("coffre-secours.json").exists()
}

/// Lit le registre. Sans registre (installation d'avant les comptes, ou premier lancement), le
/// compte de la racine est le seul compte ; un registre abîmé est reconstruit de même.
pub fn load(root: &Path) -> Registry {
    let mut registry: Registry = fs::read(root.join(REGISTRY_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    let mut seen = std::collections::HashSet::new();
    registry.comptes.retain(|e| valid_id(&e.id) && seen.insert(e.id.clone()));
    registry.comptes.truncate(MAX_ACCOUNTS);
    // Les comptes ajoutés dont le dossier a disparu sont oubliés (seulement s'il est
    // introuvable : une lecture refusée un instant, par un antivirus, n'en retire aucun).
    registry
        .comptes
        .retain(|e| e.id == MAIN_ID || !matches!(fs::metadata(dir_of(root, &e.id)), Err(err) if err.kind() == std::io::ErrorKind::NotFound));
    // Un compte dont le coffre existe mais que le registre ne cite plus (registre perdu ou
    // abîmé) revient : ses données ne deviennent jamais invisibles.
    if let Ok(entries) = fs::read_dir(root.join(ACCOUNTS_FOLDER)) {
        let mut found: Vec<String> = entries
            .flatten()
            .filter_map(|e| e.file_name().to_str().map(str::to_string))
            .filter(|id| id != MAIN_ID && valid_id(id) && has_vault(&dir_of(root, id)))
            .filter(|id| !registry.comptes.iter().any(|e| &e.id == id))
            .collect();
        found.sort();
        for id in found.into_iter().take(MAX_ACCOUNTS.saturating_sub(registry.comptes.len())) {
            registry.comptes.push(Entry { id, dossier: String::new(), cree: 0 });
        }
    }
    let has_main = registry.comptes.iter().any(|e| e.id == MAIN_ID);
    if !has_main && (main_in_use(root) || registry.comptes.is_empty()) {
        registry.comptes.insert(0, Entry { id: MAIN_ID.into(), dossier: String::new(), cree: 0 });
    }
    if !registry.comptes.iter().any(|e| e.id == registry.actif) {
        registry.actif = registry.comptes.first().map(|e| e.id.clone()).unwrap_or_else(|| MAIN_ID.into());
    }
    if !registry.comptes.iter().any(|e| e.id == registry.precedent) || registry.precedent == registry.actif {
        registry.precedent = String::new();
    }
    registry
}

pub fn save(root: &Path, registry: &Registry) -> std::io::Result<()> {
    fs::create_dir_all(root)?;
    let bytes = serde_json::to_vec_pretty(registry).map_err(std::io::Error::other)?;
    write_atomic(&root.join(REGISTRY_FILE), &bytes)
}

fn new_id() -> std::io::Result<String> {
    let bytes = crate::vault::crypto::random_bytes::<6>().map_err(|_| std::io::Error::other("hasard indisponible"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Ajoute un compte vide (son coffre se crée ensuite) et en fait le compte ouvert.
pub fn add(root: &Path, registry: &mut Registry, now: u64) -> std::io::Result<String> {
    if registry.comptes.len() >= MAX_ACCOUNTS {
        return Err(std::io::Error::other("trop de comptes"));
    }
    let id = new_id()?;
    fs::create_dir_all(dir_of(root, &id))?;
    registry.comptes.push(Entry { id: id.clone(), dossier: String::new(), cree: now });
    registry.precedent = registry.actif.clone();
    registry.actif = id.clone();
    save(root, registry)?;
    Ok(id)
}

/// Compte à ouvrir au prochain démarrage.
pub fn select(root: &Path, registry: &mut Registry, id: &str) -> std::io::Result<bool> {
    if !registry.comptes.iter().any(|e| e.id == id) {
        return Ok(false);
    }
    if registry.actif != id {
        registry.precedent = String::new();
        registry.actif = id.to_string();
    }
    save(root, registry)?;
    Ok(true)
}

/// Retire un compte du registre ; le compte ouvert devient le précédent, ou le premier restant.
pub fn forget(root: &Path, registry: &mut Registry, id: &str) -> std::io::Result<()> {
    registry.comptes.retain(|e| e.id != id);
    if registry.actif == id {
        let back = registry.precedent.clone();
        registry.actif = if registry.comptes.iter().any(|e| e.id == back) {
            back
        } else {
            registry.comptes.first().map(|e| e.id.clone()).unwrap_or_else(|| MAIN_ID.into())
        };
    }
    registry.precedent = String::new();
    save(root, registry)
}

/// Écrase puis efface les fichiers d'un compte. Le compte principal laisse les fichiers communs
/// de la racine et les autres comptes ; `include_backups` : ses sauvegardes de ce PC aussi.
pub fn shred_account(root: &Path, id: &str, include_backups: bool) -> std::io::Result<()> {
    let dir = dir_of(root, id);
    if id != MAIN_ID {
        crate::files::shred_dir(&dir, include_backups)?;
        // Dossier retiré s'il est vide (les sauvegardes gardées y restent).
        let _ = fs::remove_dir(&dir);
        let _ = fs::remove_dir(root.join(ACCOUNTS_FOLDER));
        return Ok(());
    }
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name();
        let kind = entry.file_type()?;
        if kind.is_file() && !SHARED_FILES.iter().any(|f| name == *f) {
            shred(&entry.path())?;
        } else if kind.is_dir() && include_backups && name == crate::backups::FOLDER {
            crate::files::shred_dir(&entry.path(), true)?;
            fs::remove_dir(entry.path())?;
        }
    }
    Ok(())
}

/// Nom de dossier lisible tiré du pseudo (« Léa » → « Léa »), sans caractère interdit par
/// Windows ni nom déjà pris.
pub fn folder_name(pseudo: &str, taken: &[String]) -> String {
    let cleaned: String = pseudo
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let cleaned = cleaned.trim_end_matches('.').chars().take(40).collect::<String>();
    let reserved_windows = ["con", "prn", "aux", "nul"];
    let lower = cleaned.to_lowercase();
    let base = if cleaned.is_empty()
        || reserved_windows.contains(&lower.as_str())
        || (lower.len() == 4 && (lower.starts_with("com") || lower.starts_with("lpt")))
    {
        "Compte".to_string()
    } else {
        cleaned
    };
    let free = |name: &str| {
        let lower = name.to_lowercase();
        !RESERVED_FOLDERS.contains(&lower.as_str()) && !taken.iter().any(|t| t.to_lowercase() == lower)
    };
    if free(&base) {
        return base;
    }
    (2..).map(|n| format!("{base} {n}")).find(|n| free(n)).unwrap_or(base)
}

/// Dossier du compte dans Documents\Aqueli : la racine pour le compte principal, un dossier au
/// nom du pseudo pour les autres (fixé au premier usage, il ne suit pas un changement de pseudo).
pub fn documents_folder(root: &Path, id: &str, pseudo: &str) -> Option<String> {
    if id == MAIN_ID {
        return None;
    }
    let mut registry = load(root);
    let entry = registry.comptes.iter().find(|e| e.id == id)?;
    if !entry.dossier.is_empty() {
        return Some(entry.dossier.clone());
    }
    let taken: Vec<String> = registry.comptes.iter().map(|e| e.dossier.clone()).filter(|d| !d.is_empty()).collect();
    let name = folder_name(pseudo, &taken);
    // Sans pseudo encore (création du compte en cours), le nom n'est pas retenu.
    if pseudo.trim().is_empty() {
        return Some(name);
    }
    if let Some(entry) = registry.comptes.iter_mut().find(|e| e.id == id) {
        entry.dossier = name.clone();
    }
    let _ = save(root, &registry);
    Some(name)
}

/// Demande l'affichage de la fenêtre au redémarrage qui suit.
pub fn mark_switch(root: &Path) {
    let _ = write_atomic(&root.join(SWITCH_FLAG), b"1");
}

/// Vrai si le démarrage suit un changement de compte (la marque est retirée).
pub fn take_switch(root: &Path) -> bool {
    fs::remove_file(root.join(SWITCH_FLAG)).is_ok()
}

/// Pseudo et image de profil d'un compte, lus dans ses préférences (`preferences.displayName`,
/// `preferences.avatar`) : vides s'ils manquent ou sont mal formés.
pub fn profile(prefs: &crate::prefs::Prefs) -> (String, String) {
    let text = |key: &str, max: usize| -> String {
        prefs
            .get("preferences")
            .and_then(|p| p.get(key))
            .and_then(|v| v.as_str())
            .map(|s| s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(max).collect())
            .unwrap_or_default()
    };
    let avatar = text("avatar", 40);
    let avatar = if avatar.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') { avatar } else { String::new() };
    (text("displayName", 40), avatar)
}

/// Compte ouvert pendant cette session.
#[derive(Debug, Clone)]
pub struct Active {
    pub root: PathBuf,
    pub id: String,
}

pub struct ActiveAccount(pub Active);

impl Active {
    pub fn is_main(&self) -> bool {
        self.id == MAIN_ID
    }

    /// Nom de la clé Windows Hello du compte : celle d'avant les comptes pour le principal.
    pub fn hello_names(&self) -> Vec<String> {
        if self.is_main() {
            vec!["Aqueli".into(), crate::legacy::OLD_HELLO_KEY.into()]
        } else {
            vec![format!("Aqueli-{}", self.id)]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn une_installation_d_avant_les_comptes_garde_son_compte_a_la_racine() {
        let root = tempfile::tempdir().unwrap();
        touch(&root.path().join("coffre.json"));
        touch(&root.path().join("aqueli.db"));
        touch(&root.path().join("preferences.json"));
        let registry = load(root.path());
        assert_eq!(registry.actif, MAIN_ID);
        assert_eq!(registry.comptes.len(), 1);
        assert_eq!(dir_of(root.path(), &registry.actif), root.path());
        // Aucun fichier déplacé ni copié.
        assert!(root.path().join("aqueli.db").exists());
        assert!(!root.path().join(ACCOUNTS_FOLDER).exists());
    }

    #[test]
    fn un_premier_lancement_ouvre_le_compte_principal_a_creer() {
        let root = tempfile::tempdir().unwrap();
        let registry = load(root.path());
        assert_eq!(registry.actif, MAIN_ID);
        assert_eq!(registry.comptes.len(), 1);
    }

    #[test]
    fn un_registre_abime_est_reconstruit() {
        let root = tempfile::tempdir().unwrap();
        touch(&root.path().join("coffre.json"));
        fs::write(root.path().join(REGISTRY_FILE), b"{pas du json").unwrap();
        let registry = load(root.path());
        assert_eq!(registry.actif, MAIN_ID);
        let bad = r#"{"actif":"../x","comptes":[{"id":"../x"},{"id":"principal"},{"id":"principal"}]}"#;
        fs::write(root.path().join(REGISTRY_FILE), bad).unwrap();
        let registry = load(root.path());
        assert_eq!(registry.comptes.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec![MAIN_ID]);
        assert_eq!(registry.actif, MAIN_ID);
    }

    #[test]
    fn ajouter_un_compte_cree_son_dossier_et_l_ouvre_ensuite() {
        let root = tempfile::tempdir().unwrap();
        touch(&root.path().join("coffre.json"));
        let mut registry = load(root.path());
        let id = add(root.path(), &mut registry, 100).unwrap();
        assert!(valid_id(&id) && id != MAIN_ID);
        assert!(dir_of(root.path(), &id).is_dir());
        let again = load(root.path());
        assert_eq!(again.actif, id);
        assert_eq!(again.precedent, MAIN_ID);
        assert_eq!(again.comptes.len(), 2);
    }

    #[test]
    fn oublier_le_compte_ouvert_revient_au_precedent() {
        let root = tempfile::tempdir().unwrap();
        touch(&root.path().join("coffre.json"));
        let mut registry = load(root.path());
        let first = add(root.path(), &mut registry, 1).unwrap();
        select(root.path(), &mut registry, MAIN_ID).unwrap();
        let second = add(root.path(), &mut registry, 2).unwrap();
        forget(root.path(), &mut registry, &second).unwrap();
        assert_eq!(registry.actif, MAIN_ID);
        assert!(registry.comptes.iter().any(|e| e.id == first));
        assert!(!select(root.path(), &mut registry, &second).unwrap(), "compte oublié");
    }

    #[test]
    fn supprimer_le_compte_principal_laisse_les_autres_comptes_et_le_registre() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        for f in ["coffre.json", "aqueli.db", "preferences.json", "rappels.json", "emplacement.json", "icone-notifications.png"] {
            touch(&r.join(f));
        }
        touch(&r.join("Sauvegardes").join("a.aqueli"));
        let mut registry = load(r);
        let other = add(r, &mut registry, 1).unwrap();
        touch(&dir_of(r, &other).join("coffre.json"));
        shred_account(r, MAIN_ID, false).unwrap();
        assert!(!r.join("coffre.json").exists() && !r.join("aqueli.db").exists() && !r.join("rappels.json").exists());
        assert!(r.join(REGISTRY_FILE).exists() && r.join("emplacement.json").exists() && r.join("icone-notifications.png").exists());
        assert!(dir_of(r, &other).join("coffre.json").exists(), "l'autre compte reste");
        assert!(r.join("Sauvegardes").join("a.aqueli").exists(), "sauvegardes gardées");
        shred_account(r, MAIN_ID, true).unwrap();
        assert!(!r.join("Sauvegardes").exists());
        assert!(dir_of(r, &other).join("coffre.json").exists());
    }

    #[test]
    fn supprimer_un_compte_ajoute_ne_touche_que_son_dossier() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        touch(&r.join("coffre.json"));
        let mut registry = load(r);
        let other = add(r, &mut registry, 1).unwrap();
        let dir = dir_of(r, &other);
        touch(&dir.join("coffre.json"));
        touch(&dir.join("Sauvegardes").join("b.aqueli"));
        shred_account(r, &other, true).unwrap();
        forget(r, &mut registry, &other).unwrap();
        assert!(!dir.exists());
        assert!(r.join("coffre.json").exists());
        let again = load(r);
        assert_eq!(again.comptes.len(), 1);
        assert_eq!(again.actif, MAIN_ID);
    }

    #[test]
    fn le_compte_principal_supprime_ne_revient_pas_s_il_reste_d_autres_comptes() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        touch(&r.join("coffre.json"));
        let mut registry = load(r);
        let other = add(r, &mut registry, 1).unwrap();
        shred_account(r, MAIN_ID, true).unwrap();
        forget(r, &mut registry, MAIN_ID).unwrap();
        let again = load(r);
        assert_eq!(again.comptes.iter().map(|e| e.id.clone()).collect::<Vec<_>>(), vec![other.clone()]);
        assert_eq!(again.actif, other);
    }

    #[test]
    fn un_registre_perdu_retrouve_les_comptes_ajoutes() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        touch(&r.join("coffre.json"));
        let mut registry = load(r);
        let other = add(r, &mut registry, 1).unwrap();
        touch(&dir_of(r, &other).join("coffre.json"));
        // Compte ajouté puis abandonné avant sa création : pas de coffre, il ne revient pas.
        let empty = add(r, &mut registry, 2).unwrap();
        fs::remove_file(r.join(REGISTRY_FILE)).unwrap();
        let again = load(r);
        let ids: Vec<&str> = again.comptes.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids, vec![MAIN_ID, other.as_str()]);
        assert!(!ids.contains(&empty.as_str()));
    }

    #[test]
    fn le_nom_de_dossier_vient_du_pseudo_sans_caractere_interdit() {
        assert_eq!(folder_name("Léa", &[]), "Léa");
        assert_eq!(folder_name("  a/b:c*  ", &[]), "a b c");
        assert_eq!(folder_name("Léa", &["léa".into()]), "Léa 2");
        assert_eq!(folder_name("Import", &[]), "Import 2");
        assert_eq!(folder_name("CON", &[]), "Compte");
        assert_eq!(folder_name("...", &[]), "Compte");
        assert_eq!(folder_name("", &["Compte".into()]), "Compte 2");
    }

    #[test]
    fn le_dossier_documents_est_fixe_au_premier_usage() {
        let root = tempfile::tempdir().unwrap();
        let r = root.path();
        let mut registry = load(r);
        let id = add(r, &mut registry, 1).unwrap();
        assert_eq!(documents_folder(r, MAIN_ID, "Moi"), None);
        // Pas encore de pseudo : rien n'est retenu.
        assert_eq!(documents_folder(r, &id, "").as_deref(), Some("Compte"));
        assert_eq!(documents_folder(r, &id, "Léa").as_deref(), Some("Léa"));
        assert_eq!(documents_folder(r, &id, "Autre nom").as_deref(), Some("Léa"));
    }

    #[test]
    fn la_marque_de_changement_ne_sert_qu_une_fois() {
        let root = tempfile::tempdir().unwrap();
        assert!(!take_switch(root.path()));
        mark_switch(root.path());
        assert!(take_switch(root.path()));
        assert!(!take_switch(root.path()));
    }

    #[test]
    fn le_profil_vient_des_preferences_du_compte() {
        let prefs: crate::prefs::Prefs = serde_json::from_str(r#"{"preferences":{"displayName":"  Léa   M. ","avatar":"canard"}}"#).unwrap();
        assert_eq!(profile(&prefs), ("Léa M.".to_string(), "canard".to_string()));
        let odd: crate::prefs::Prefs = serde_json::from_str(r#"{"preferences":{"displayName":3,"avatar":"../x"}}"#).unwrap();
        assert_eq!(profile(&odd), (String::new(), String::new()));
        assert_eq!(profile(&crate::prefs::Prefs::new()), (String::new(), String::new()));
    }

    #[test]
    fn chaque_compte_a_sa_cle_windows_hello() {
        let main = Active { root: PathBuf::new(), id: MAIN_ID.into() };
        let other = Active { root: PathBuf::new(), id: "0123456789ab".into() };
        assert_eq!(main.hello_names()[0], "Aqueli");
        assert_eq!(other.hello_names(), vec!["Aqueli-0123456789ab".to_string()]);
    }
}
