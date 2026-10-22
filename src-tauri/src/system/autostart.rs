//! Lancement discret d'Aqueli à l'ouverture de la session Windows (valeur « Aqueli » de la
//! clé Run de l'utilisateur, la même que l'installateur crée et que le désinstallateur retire).

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ, RRF_RT_REG_SZ};

/// Argument de lancement : Aqueli démarre verrouillé, sans ouvrir de fenêtre.
pub const BACKGROUND_ARG: &str = "--arriere-plan";

const RUN_KEY: PCWSTR = w!(r"Software\Microsoft\Windows\CurrentVersion\Run");
const RUN_VALUE: PCWSTR = w!("Aqueli");
/// Choix de la personne, relu par l'installateur lors d'une mise à jour.
const CHOICE_KEY: PCWSTR = w!(r"Software\Aqueli");
const CHOICE_VALUE: PCWSTR = w!("DemarrageAuto");

fn set_string(key: PCWSTR, name: PCWSTR, value: &str) -> bool {
    let wide: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
    // SAFETY: `wide` (UTF-16 terminé par zéro) vit pendant tout l'appel ; taille en octets.
    unsafe {
        RegSetKeyValueW(HKEY_CURRENT_USER, key, name, REG_SZ.0, Some(wide.as_ptr().cast()), (wide.len() * 2) as u32)
            == ERROR_SUCCESS
    }
}

pub fn is_enabled() -> bool {
    // SAFETY: simple lecture de l'existence de la valeur.
    unsafe { RegGetValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE, RRF_RT_REG_SZ, None, None, None) == ERROR_SUCCESS }
}

/// Active ou désactive le lancement au démarrage, et retient ce choix.
pub fn set(enabled: bool) -> Result<(), String> {
    let done = if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        set_string(RUN_KEY, RUN_VALUE, &format!("\"{}\" {BACKGROUND_ARG}", exe.display()))
    } else {
        // SAFETY: suppression d'une valeur de la session ; absente, rien à faire.
        let result = unsafe { RegDeleteKeyValueW(HKEY_CURRENT_USER, RUN_KEY, RUN_VALUE) };
        result == ERROR_SUCCESS || !is_enabled()
    };
    set_string(CHOICE_KEY, CHOICE_VALUE, if enabled { "1" } else { "0" });
    if done {
        Ok(())
    } else {
        Err("réglage de Windows impossible à modifier".into())
    }
}
