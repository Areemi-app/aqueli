//! Sauvegardes automatiques (cahier des charges § 9) : une par jour tant qu'Aqueli est ouvert, dans
//! %APPDATA%\Aqueli\Sauvegardes et, si elle est choisie et branchée, dans une destination externe
//! (clé USB, disque) ; conservation des 7 derniers jours, 4 dernières semaines et 12 derniers mois.
//! Les fichiers sont ceux de `vault::backup` : chiffrés, sans donnée lisible.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::commands::{DataDir, VaultState};
use crate::data::recurrence::Day;
use crate::diagnostic::note;
use crate::files::write_atomic;
use crate::vault::backup::{self, Manifest};
use crate::vault::VaultError;

pub const FOLDER: &str = "Sauvegardes";
pub const EXTENSION: &str = "aqueli";
const SETTINGS_FILE: &str = "sauvegardes.json";
/// Une sauvegarde automatique si la précédente a plus de 20 heures (« chaque jour »).
const DAILY_SECONDS: u64 = 20 * 3600;
/// Rappel si aucune sauvegarde externe depuis 30 jours.
pub const EXTERNAL_REMINDER_SECONDS: u64 = 30 * 86_400;
/// Conservation : 7 jours, 4 semaines, 12 mois.
const KEEP_DAYS: usize = 7;
const KEEP_WEEKS: usize = 4;
const KEEP_MONTHS: usize = 12;

/// Réglages des sauvegardes (fichier du cœur, sans donnée personnelle).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Dossier externe choisi (clé USB, disque), s'il y en a un.
    #[serde(default)]
    pub destination: Option<String>,
    #[serde(default)]
    pub last_auto: u64,
    #[serde(default)]
    pub last_external: u64,
    /// Première sauvegarde : le rappel de sauvegarde externe attend 30 jours d'usage.
    #[serde(default)]
    pub first_backup: u64,
}

impl Settings {
    /// Aucune sauvegarde externe depuis 30 jours, après 30 jours d'usage.
    pub fn external_reminder(&self, now: u64) -> bool {
        self.first_backup > 0
            && now.saturating_sub(self.first_backup) >= EXTERNAL_REMINDER_SECONDS
            && now.saturating_sub(self.last_external) >= EXTERNAL_REMINDER_SECONDS
    }
}

fn settings_path(dir: &Path) -> PathBuf {
    dir.join(SETTINGS_FILE)
}

pub fn load_settings(dir: &Path) -> Settings {
    fs::read(settings_path(dir)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_settings(dir: &Path, settings: &Settings) -> Result<(), VaultError> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|_| VaultError::Io { detail: "réglages".into() })?;
    write_atomic(&settings_path(dir), &bytes)?;
    Ok(())
}

pub fn local_folder(dir: &Path) -> PathBuf {
    dir.join(FOLDER)
}

/// Destination externe, si elle est choisie et accessible (clé branchée).
pub fn available_destination(settings: &Settings) -> Option<PathBuf> {
    settings.destination.as_ref().map(PathBuf::from).filter(|p| p.is_dir())
}

/// Date et heure locales : (« 2026-09-29 », « 2026-09-29 09h30 »).
pub fn local_now() -> (String, String) {
    #[cfg(windows)]
    {
        // SAFETY : simple lecture de l'heure locale de Windows.
        let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
        let day = format!("{:04}-{:02}-{:02}", t.wYear, t.wMonth, t.wDay);
        let stamp = format!("{day} {:02}h{:02}", t.wHour, t.wMinute);
        (day, stamp)
    }
    #[cfg(not(windows))]
    {
        let days = crate::unix_now().div_euclid(86_400);
        let day = Day::from_days(days).format();
        (day.clone(), day)
    }
}

/// Sauvegardes automatiques à garder, la plus récente d'abord : la plus récente de chacun des
/// 7 derniers jours, des 4 dernières semaines et des 12 derniers mois qui ont une sauvegarde.
pub fn keep_mask(days: &[Day]) -> Vec<bool> {
    let mut keep = vec![false; days.len()];
    let mut rule = |key: &dyn Fn(Day) -> i64, count: usize| {
        let mut seen = HashSet::new();
        for (i, d) in days.iter().enumerate() {
            if seen.len() >= count {
                break;
            }
            if seen.insert(key(*d)) {
                keep[i] = true;
            }
        }
    };
    rule(&|d| d.to_days(), KEEP_DAYS);
    rule(&|d| d.week_index(), KEEP_WEEKS);
    rule(&|d| d.month_index(), KEEP_MONTHS);
    keep
}

/// Sauvegardes d'un dossier, les plus récentes d'abord.
pub fn list(folder: &Path) -> Vec<(PathBuf, Manifest)> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut found: Vec<(PathBuf, Manifest)> = entries
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == EXTENSION))
        .filter_map(|p| backup::read_manifest(&p).ok().map(|m| (p, m)))
        .collect();
    found.sort_by_key(|(_, m)| std::cmp::Reverse(m.created_at));
    found
}

/// Retire les sauvegardes automatiques au-delà de la conservation (les autres restent).
pub fn prune(folder: &Path) -> usize {
    let autos: Vec<(PathBuf, Manifest)> = list(folder).into_iter().filter(|(_, m)| m.origin == "automatique").collect();
    let days: Vec<Day> = autos.iter().map(|(_, m)| Day::parse(&m.local_day).unwrap_or(Day { year: 1970, month: 1, day: 1 })).collect();
    let keep = keep_mask(&days);
    let mut removed = 0;
    for ((path, _), keep) in autos.iter().zip(keep) {
        if !keep && fs::remove_file(path).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Nom de fichier libre : « Aqueli 2026-09-29 09h30.aqueli », puis « … (2) ».
fn free_name(folder: &Path, stamp: &str, suffix: &str) -> PathBuf {
    let base = format!("Aqueli {stamp}{suffix}");
    let mut path = folder.join(format!("{base}.{EXTENSION}"));
    let mut n = 2;
    while path.exists() {
        path = folder.join(format!("{base} ({n}).{EXTENSION}"));
        n += 1;
    }
    path
}

/// Une sauvegarde de la liste.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub created_at: u64,
    pub origin: String,
    pub size: u64,
    pub app_version: String,
    /// Sur la destination externe.
    pub external: bool,
}

pub fn describe(path: &Path, m: &Manifest) -> BackupInfo {
    info(path, m, false)
}

fn info(path: &Path, m: &Manifest, external: bool) -> BackupInfo {
    BackupInfo {
        path: path.to_string_lossy().into_owned(),
        file_name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        created_at: m.created_at,
        origin: m.origin.clone(),
        size: fs::metadata(path).map(|md| md.len()).unwrap_or(m.db_size),
        app_version: m.app_version.clone(),
        external,
    }
}

/// Sauvegardes de ce PC et de la destination externe (sans doublon), les plus récentes d'abord.
pub fn all(dir: &Path) -> Vec<BackupInfo> {
    let settings = load_settings(dir);
    let mut out: Vec<BackupInfo> = list(&local_folder(dir)).iter().map(|(p, m)| info(p, m, false)).collect();
    if let Some(dest) = available_destination(&settings) {
        for (p, m) in list(&dest) {
            if !out.iter().any(|b| b.file_name == info(&p, &m, true).file_name) {
                out.push(info(&p, &m, true));
            }
        }
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.created_at));
    out
}

/// Vrai si `path` est une sauvegarde d'un dossier d'Aqueli (liste, suppression).
pub fn is_known(dir: &Path, path: &Path) -> bool {
    let settings = load_settings(dir);
    let in_folder = |folder: &Path| path.parent().is_some_and(|p| p == folder);
    path.extension().is_some_and(|e| e == EXTENSION)
        && (in_folder(&local_folder(dir)) || available_destination(&settings).is_some_and(|d| in_folder(&d)))
}

/// Fait une sauvegarde maintenant (Aqueli déverrouillé) : sur ce PC, et sur la destination
/// externe si elle est branchée. Renvoie la sauvegarde de ce PC et la copie externe.
pub fn run(app: &AppHandle, origin: &str) -> Result<(BackupInfo, bool), VaultError> {
    let dir = app.state::<DataDir>().0.clone();
    let (day, stamp) = local_now();
    let now = crate::unix_now().max(0) as u64;
    let version = app.package_info().version.to_string();
    let bytes = {
        let state = app.state::<VaultState>();
        let mut vault = state.0.lock().map_err(|_| VaultError::Io { detail: "coffre indisponible".into() })?;
        vault.backup(origin, &day, &version, now)?
    };
    let folder = local_folder(&dir);
    fs::create_dir_all(&folder)?;
    let suffix = match origin {
        "avant-restauration" => " avant restauration",
        "manuelle" => " manuelle",
        _ => "",
    };
    let path = free_name(&folder, &stamp, suffix);
    write_atomic(&path, &bytes)?;
    prune(&folder);

    let mut settings = load_settings(&dir);
    let mut external = false;
    if let Some(dest) = available_destination(&settings) {
        if write_atomic(&free_name(&dest, &stamp, suffix), &bytes).is_ok() {
            prune(&dest);
            settings.last_external = now;
            external = true;
        } else {
            note(app, "sauvegarde : destination externe inaccessible");
        }
    }
    if origin == "automatique" {
        settings.last_auto = now;
    }
    if settings.first_backup == 0 {
        settings.first_backup = now;
    }
    save_settings(&dir, &settings)?;
    let manifest = backup::read_manifest(&path)?;
    Ok((info(&path, &manifest, false), external))
}

/// Copie la dernière sauvegarde de ce PC sur la destination externe, si elle est branchée et
/// n'a rien reçu depuis un jour (clé branchée après coup).
pub fn copy_to_destination(app: &AppHandle, dir: &Path, now: u64) {
    let mut settings = load_settings(dir);
    let Some(dest) = available_destination(&settings) else {
        return;
    };
    if now.saturating_sub(settings.last_external) < DAILY_SECONDS {
        return;
    }
    let Some((latest, manifest)) = list(&local_folder(dir)).into_iter().next() else {
        return;
    };
    if manifest.created_at <= settings.last_external {
        return;
    }
    let target = dest.join(latest.file_name().unwrap_or_default());
    if target.exists() || fs::copy(&latest, &target).is_ok() {
        prune(&dest);
        settings.last_external = now;
        let _ = save_settings(dir, &settings);
        note(app, "sauvegarde copiée sur la destination externe");
    }
}

/// Une sauvegarde est-elle due, et la faire ; puis la copie externe éventuelle.
pub fn check(app: &AppHandle) {
    let dir = app.state::<DataDir>().0.clone();
    let now = crate::unix_now().max(0) as u64;
    let unlocked = app.state::<VaultState>().0.lock().map(|v| v.is_unlocked()).unwrap_or(false);
    if unlocked && now.saturating_sub(load_settings(&dir).last_auto) >= DAILY_SECONDS {
        match run(app, "automatique") {
            Ok(_) => note(app, "sauvegarde automatique faite"),
            Err(_) => note(app, "sauvegarde automatique impossible"),
        }
    }
    copy_to_destination(app, &dir, now);
}

/// Toutes les 10 minutes (et peu après un déverrouillage) : sauvegarde du jour si besoin.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(600));
        check(&app);
    });
}

/// Peu après un déverrouillage, sans le ralentir.
pub fn check_soon(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(20));
        check(&handle);
    });
}

/// Dernier fichier choisi par la personne (restauration depuis un fichier).
#[derive(Default)]
pub struct PickedFile(pub Mutex<Option<PathBuf>>);

#[cfg(test)]
mod tests {
    use super::*;

    fn days(list: &[&str]) -> Vec<Day> {
        list.iter().map(|d| Day::parse(d).unwrap()).collect()
    }

    #[test]
    fn garde_7_jours_4_semaines_et_12_mois() {
        // Une sauvegarde par jour pendant 400 jours, la plus récente d'abord.
        let start = Day::parse("2026-09-29").unwrap();
        let all: Vec<Day> = (0..400).map(|i| start.add_days(-i)).collect();
        let keep = keep_mask(&all);
        let kept: Vec<String> = all.iter().zip(&keep).filter(|(_, k)| **k).map(|(d, _)| d.format()).collect();
        // Les 7 derniers jours…
        assert_eq!(&kept[..7], &["2026-09-29", "2026-09-28", "2026-09-27", "2026-09-26", "2026-09-25", "2026-09-24", "2026-09-23"]);
        // … au plus 7 + 4 + 12 sauvegardes, dont une de chacun des 12 derniers mois.
        assert!(kept.len() <= 23, "{kept:?}");
        let months: HashSet<&str> = kept.iter().map(|d| &d[..7]).collect();
        assert_eq!(months.len(), 12);
        assert!(kept.contains(&"2025-10-31".to_string()), "la plus récente d'octobre 2025");
        assert!(!kept.contains(&"2025-09-30".to_string()), "treizième mois : retirée");
    }

    #[test]
    fn plusieurs_sauvegardes_le_meme_jour_ne_gardent_que_la_plus_recente() {
        let keep = keep_mask(&days(&["2026-09-29", "2026-09-29", "2026-09-28"]));
        assert_eq!(keep, vec![true, false, true]);
    }

    #[test]
    fn un_long_arret_ne_fait_pas_tout_supprimer() {
        // Aqueli non ouvert pendant un an : les sauvegardes d'avant restent (une par mois).
        let keep = keep_mask(&days(&["2026-09-29", "2025-06-10", "2025-06-09", "2025-05-01"]));
        assert_eq!(keep, vec![true, true, true, true]);
    }

    #[test]
    fn le_rappel_de_sauvegarde_externe_attend_30_jours_d_usage() {
        let day = 86_400;
        let mut s = Settings { first_backup: 1_000_000, ..Default::default() };
        assert!(!s.external_reminder(1_000_000 + 10 * day), "10 jours d'usage");
        assert!(s.external_reminder(1_000_000 + 31 * day));
        s.last_external = 1_000_000 + 20 * day;
        assert!(!s.external_reminder(1_000_000 + 31 * day), "copie externe récente");
        assert!(!Settings::default().external_reminder(10_000_000), "aucune sauvegarde encore");
    }

    #[test]
    fn les_reglages_se_relisent_et_un_nom_libre_est_trouve() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_settings(dir.path()), Settings::default());
        let s = Settings { destination: Some("E:\\Sauvegardes".into()), last_auto: 5, last_external: 3, first_backup: 1 };
        save_settings(dir.path(), &s).unwrap();
        assert_eq!(load_settings(dir.path()), s);
        let first = free_name(dir.path(), "2026-09-29 09h30", "");
        fs::write(&first, b"x").unwrap();
        assert!(free_name(dir.path(), "2026-09-29 09h30", "").ends_with("Aqueli 2026-09-29 09h30 (2).aqueli"));
    }
}
