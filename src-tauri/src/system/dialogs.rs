//! Fenêtres standard de Windows pour choisir un dossier (destination des sauvegardes), ouvrir
//! une sauvegarde ou enregistrer un export. Aucune bibliothèque supplémentaire : l'API de Windows
//! (`IFileOpenDialog`, `IFileSaveDialog`), déjà présente dans la bibliothèque `windows`.

use std::path::{Path, PathBuf};

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
use windows::Win32::UI::Shell::{
    FileOpenDialog, FileSaveDialog, IFileDialog, IFileOpenDialog, IFileSaveDialog, IShellItem, SHCreateItemFromParsingName, FOS_ALLOWMULTISELECT,
    FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
};

/// Ce qu'on choisit.
pub enum Pick<'a> {
    Folder { title: &'a str },
    /// `folder` : dossier affiché à l'ouverture (celui des sauvegardes).
    OpenFile { title: &'a str, filter: (&'a str, &'a str), folder: Option<&'a Path> },
    SaveFile { title: &'a str, filter: (&'a str, &'a str), default_name: &'a str, extension: &'a str },
}

/// Chemin du résultat d'une fenêtre, puis libère la chaîne allouée par Windows.
unsafe fn result_path(item: IShellItem) -> Option<PathBuf> {
    let name = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
    let path = name.to_string().ok().map(PathBuf::from);
    CoTaskMemFree(Some(name.0 as *const _));
    path
}

unsafe fn prepare(dialog: &IFileDialog, title: &str, filter: Option<(&str, &str)>) -> windows::core::Result<()> {
    dialog.SetTitle(&HSTRING::from(title))?;
    if let Some((name, spec)) = filter {
        let name = HSTRING::from(name);
        let spec = HSTRING::from(spec);
        let types = [COMDLG_FILTERSPEC { pszName: PCWSTR(name.as_ptr()), pszSpec: PCWSTR(spec.as_ptr()) }];
        dialog.SetFileTypes(&types)?;
    }
    Ok(())
}

/// Ouvre la fenêtre au-dessus de `owner` (fenêtre principale) et attend le choix. `None` :
/// la personne a annulé, ou la fenêtre n'a pas pu s'ouvrir.
pub fn pick(owner: isize, what: Pick) -> Option<PathBuf> {
    // SAFETY : appels COM sur le fil courant (initialisé ici, libéré à la fin), avec des chaînes
    // qui vivent jusqu'à la fin de chaque appel.
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let owner = (owner != 0).then_some(HWND(owner as *mut _));
        let result = (|| -> Option<PathBuf> {
            match what {
                Pick::Folder { title } => {
                    let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
                    let options = dialog.GetOptions().ok()?;
                    dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST).ok()?;
                    prepare(&dialog.clone().into(), title, None).ok()?;
                    dialog.Show(owner).ok()?;
                    result_path(dialog.GetResult().ok()?)
                }
                Pick::OpenFile { title, filter, folder } => {
                    let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
                    let options = dialog.GetOptions().ok()?;
                    dialog.SetOptions(options | FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST).ok()?;
                    prepare(&dialog.clone().into(), title, Some(filter)).ok()?;
                    if let Some(item) = folder.and_then(|f| SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(f.as_os_str()), None).ok()) {
                        let _ = dialog.SetFolder(&item);
                    }
                    dialog.Show(owner).ok()?;
                    result_path(dialog.GetResult().ok()?)
                }
                Pick::SaveFile { title, filter, default_name, extension } => {
                    let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).ok()?;
                    let options = dialog.GetOptions().ok()?;
                    dialog.SetOptions(options | FOS_FORCEFILESYSTEM | FOS_OVERWRITEPROMPT).ok()?;
                    prepare(&dialog.clone().into(), title, Some(filter)).ok()?;
                    dialog.SetFileName(&HSTRING::from(default_name)).ok()?;
                    dialog.SetDefaultExtension(&HSTRING::from(extension)).ok()?;
                    dialog.Show(owner).ok()?;
                    result_path(dialog.GetResult().ok()?)
                }
            }
        })();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

/// Fenêtre « Ouvrir » qui accepte plusieurs fichiers de tout type (documents) ; vide si la
/// personne a annulé.
pub fn pick_files(owner: isize, title: &str) -> Vec<PathBuf> {
    // SAFETY : comme `pick` ; chaque élément de la liste est lu pendant que la liste vit.
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let owner = (owner != 0).then_some(HWND(owner as *mut _));
        let result = (|| -> Option<Vec<PathBuf>> {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
            let options = dialog.GetOptions().ok()?;
            dialog.SetOptions(options | FOS_FORCEFILESYSTEM | FOS_FILEMUSTEXIST | FOS_ALLOWMULTISELECT).ok()?;
            prepare(&dialog.clone().into(), title, None).ok()?;
            dialog.Show(owner).ok()?;
            let items = dialog.GetResults().ok()?;
            let count = items.GetCount().ok()?;
            Some((0..count).filter_map(|i| items.GetItemAt(i).ok().and_then(|item| result_path(item))).collect())
        })();
        if initialized {
            CoUninitialize();
        }
        result.unwrap_or_default()
    }
}
