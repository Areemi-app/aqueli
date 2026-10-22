//! Windows Hello réel : clé « KeyCredential » d'Aqueli, gardée par Windows dans la puce
//! de sécurité (TPM) et utilisable seulement après le visage, l'empreinte ou le code PIN.

use std::time::{Duration, Instant};

use windows::core::{Array, HSTRING};
use windows::Security::Credentials::{
    KeyCredential, KeyCredentialCreationOption, KeyCredentialManager, KeyCredentialStatus,
};
use windows::Security::Cryptography::CryptographicBuffer;
use windows::Win32::UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow};
use windows::core::w;

use crate::vault::hello::{HelloError, HelloProvider};

/// Windows Hello d'un compte : sa clé porte son nom (`accounts::Active::hello_names`), la
/// première étant celle créée ; les suivantes, d'anciens noms encore acceptés.
pub struct WindowsHello {
    pub names: Vec<String>,
}

fn failed(e: windows::core::Error) -> HelloError {
    HelloError::Failed(e.message().to_string())
}

fn check(status: KeyCredentialStatus) -> Result<(), HelloError> {
    match status {
        KeyCredentialStatus::Success => Ok(()),
        KeyCredentialStatus::UserCanceled | KeyCredentialStatus::UserPrefersPassword => Err(HelloError::Cancelled),
        KeyCredentialStatus::NotFound => Err(HelloError::NotFound),
        other => Err(HelloError::Failed(format!("statut Windows Hello {}", other.0))),
    }
}

/// Clé du compte, ou à défaut celle créée sous un ancien nom.
fn open_credential(names: &[String]) -> Result<KeyCredential, HelloError> {
    for name in names {
        let opened = KeyCredentialManager::OpenAsync(&HSTRING::from(name.as_str())).and_then(|op| op.join()).map_err(failed)?;
        match check(opened.Status().map_err(failed)?) {
            Ok(()) => return opened.Credential().map_err(failed),
            Err(HelloError::NotFound) => continue,
            Err(e) => return Err(e),
        }
    }
    Err(HelloError::NotFound)
}

/// La fenêtre « Sécurité Windows » s'ouvre parfois derrière Aqueli : on la ramène devant.
fn bring_prompt_forward() {
    std::thread::spawn(|| {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(4) {
            // SAFETY: appels Win32 sans pointeur à gérer ; la fenêtre peut ne pas exister.
            unsafe {
                if let Ok(hwnd) = FindWindowW(w!("Credential Dialog Xaml Host"), None) {
                    if !hwnd.is_invalid() {
                        let _ = SetForegroundWindow(hwnd);
                        return;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
}

impl HelloProvider for WindowsHello {
    fn is_supported(&self) -> bool {
        KeyCredentialManager::IsSupportedAsync().and_then(|op| op.join()).unwrap_or(false)
    }

    fn create(&self) -> Result<(), HelloError> {
        if !self.is_supported() {
            return Err(HelloError::Unsupported);
        }
        bring_prompt_forward();
        let result = KeyCredentialManager::RequestCreateAsync(
            &HSTRING::from(self.names.first().map(String::as_str).unwrap_or("Aqueli")),
            KeyCredentialCreationOption::ReplaceExisting,
        )
        .and_then(|op| op.join())
        .map_err(failed)?;
        check(result.Status().map_err(failed)?)
    }

    fn sign(&self, challenge: &[u8]) -> Result<Vec<u8>, HelloError> {
        let credential = open_credential(&self.names)?;
        let data = CryptographicBuffer::CreateFromByteArray(challenge).map_err(failed)?;
        bring_prompt_forward();
        let signed = credential.RequestSignAsync(&data).and_then(|op| op.join()).map_err(failed)?;
        check(signed.Status().map_err(failed)?)?;
        let buffer = signed.Result().map_err(failed)?;
        let mut bytes = Array::<u8>::new();
        CryptographicBuffer::CopyToByteArray(&buffer, &mut bytes).map_err(failed)?;
        Ok(bytes.to_vec())
    }

    fn delete(&self) {
        for name in &self.names {
            let _ = KeyCredentialManager::DeleteAsync(&HSTRING::from(name.as_str())).and_then(|op| op.join());
        }
    }
}
