//! Capture rapide (cahier des charges § 5) : petite fenêtre flottante ouverte par un raccourci
//! global, depuis n'importe quel logiciel. Ce qui est saisi part dans la boîte de réception.
//! Si Aqueli est verrouillé, l'élément attend en mémoire (jamais sur le disque en clair) et
//! rejoint la base au déverrouillage suivant.

use std::sync::Mutex;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::data::events::{self, EventInput};
use crate::data::notes::{self, NoteBody, NoteMeta};
use crate::data::spaces;
use crate::data::tasks::{self, TaskInput};
use crate::data::DataError;
use crate::diagnostic::note;

pub const WINDOW: &str = "capture";
/// Un élément capturé vient d'entrer dans la base (charge utile : « task », « note », « event »).
pub const CAPTURED_EVENT: &str = "capture-ajoutee";
/// La fenêtre de capture vient d'être montrée.
pub const SHOWN_EVENT: &str = "capture-affichee";
/// Éléments gardés en mémoire en attendant le déverrouillage.
pub const MAX_PENDING: usize = 50;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Capture {
    Task { task: TaskInput, today: String },
    Note { body: NoteBody },
    Event { event: EventInput },
}

impl Capture {
    fn kind(&self) -> &'static str {
        match self {
            Capture::Task { .. } => "task",
            Capture::Note { .. } => "note",
            Capture::Event { .. } => "event",
        }
    }
}

/// Enregistré tout de suite, ou en attente du déverrouillage.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Saved,
    Pending,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub locked: bool,
    pub pending: usize,
}

pub struct PendingCaptures(pub Mutex<Vec<Capture>>);

/// Enregistre un élément capturé, dans le premier espace s'il n'en précise pas.
pub fn save(conn: &Connection, capture: &Capture, now: u64) -> Result<(), DataError> {
    let first_space = spaces::list(conn)?.into_iter().next().map(|s| s.id);
    match capture {
        Capture::Task { task, today } => {
            let today = tasks::parse_today(today)?;
            let input = TaskInput { space_id: task.space_id.clone().or(first_space), ..task.clone() };
            tasks::create(conn, &input, now, today)?;
        }
        Capture::Note { body } => {
            notes::create(conn, body, &NoteMeta { space_id: first_space, ..Default::default() }, now)?;
        }
        Capture::Event { event } => {
            let input = EventInput { space_id: event.space_id.clone().or(first_space), ..event.clone() };
            events::create(conn, &input, now)?;
        }
    }
    Ok(())
}

/// Garde un élément en attendant le déverrouillage ; faux si la file est pleine.
pub fn keep(app: &AppHandle, capture: Capture) -> bool {
    let state = app.state::<PendingCaptures>();
    let Ok(mut list) = state.0.lock() else {
        return false;
    };
    if list.len() >= MAX_PENDING {
        return false;
    }
    list.push(capture);
    true
}

pub fn pending(app: &AppHandle) -> usize {
    app.state::<PendingCaptures>().0.lock().map(|l| l.len()).unwrap_or(0)
}

/// Après un déverrouillage : les éléments capturés entre-temps rejoignent la base.
pub fn flush(app: &AppHandle, conn: &Connection, now: u64) {
    let state = app.state::<PendingCaptures>();
    let items = match state.0.lock() {
        Ok(mut list) => std::mem::take(&mut *list),
        Err(_) => return,
    };
    if items.is_empty() {
        return;
    }
    let saved = items.iter().filter(|item| save(conn, item, now).is_ok()).count();
    // Jamais le contenu dans le journal : seulement le nombre.
    note(app, &format!("captures en attente enregistrées : {saved} sur {}", items.len()));
}

/// Prévient la fenêtre principale qu'un élément vient d'entrer dans la base.
pub fn announce(app: &AppHandle, capture: &Capture) {
    let _ = app.emit_to("main", CAPTURED_EVENT, capture.kind());
}

/// Crée la fenêtre de capture, cachée : elle s'ouvre ensuite sans attendre.
pub fn prepare(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(WINDOW) {
        return Ok(window);
    }
    let window = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html#capture".into()))
        .title(crate::lang::text(crate::lang::of(app), "Capture rapide"))
        .inner_size(640.0, 214.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    // Elle se cache dès qu'on clique ailleurs, et ne se ferme jamais vraiment.
    let target = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(false) => {
            let _ = target.hide();
        }
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = target.hide();
        }
        _ => {}
    });
    Ok(window)
}

/// Au premier quart de l'écran où se trouve la souris, centrée.
fn place(window: &WebviewWindow) {
    let monitor = window
        .cursor_position()
        .ok()
        .and_then(|p| window.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else {
        return;
    };
    let area = monitor.size();
    let origin = monitor.position();
    let x = origin.x + (area.width.saturating_sub(size.width) / 2) as i32;
    let y = origin.y + (area.height / 4) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Ouvre la capture rapide au premier plan.
pub fn show(app: &AppHandle) {
    match prepare(app) {
        Ok(window) => {
            place(&window);
            let _ = window.show();
            crate::system::discreet::protect(&window);
            let _ = window.set_focus();
            let _ = app.emit_to(WINDOW, SHOWN_EVENT, ());
        }
        Err(_) => note(app, "capture rapide : fenêtre impossible à créer"),
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::crypto::KdfParams;
    use crate::vault::Vault;

    const NOW: u64 = 1_790_000_000;

    #[test]
    fn un_element_capture_va_dans_le_premier_espace() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::with_kdf(dir.path().to_path_buf(), KdfParams::FAST_FOR_TESTS);
        vault.create("mot de passe de test", NOW).unwrap();
        let conn = vault.connection_mut().unwrap();
        let first = spaces::list(conn).unwrap().into_iter().next().map(|s| s.id);

        let task: Capture = serde_json::from_value(serde_json::json!({
            "kind": "task",
            "today": "2026-09-29",
            "task": { "title": "Appeler le garage", "priority": 0, "tags": [], "subtasks": [], "inbox": true }
        }))
        .unwrap();
        save(conn, &task, NOW).unwrap();
        let saved = tasks::list(conn, 0, NOW).unwrap();
        assert_eq!((saved[0].title.as_str(), saved[0].inbox, saved[0].space_id.clone()), ("Appeler le garage", true, first.clone()));

        let note: Capture = serde_json::from_value(serde_json::json!({
            "kind": "note",
            "body": { "title": "Idée", "content": "{\"type\":\"doc\"}", "plain": "Un livre", "links": [] }
        }))
        .unwrap();
        save(conn, &note, NOW).unwrap();
        assert_eq!(notes::list(conn, NOW).unwrap()[0].space_id, first);

        let refused: Capture = serde_json::from_value(serde_json::json!({
            "kind": "event",
            "event": { "title": "", "startDate": "2026-09-30", "endDate": "2026-09-30" }
        }))
        .unwrap();
        assert!(save(conn, &refused, NOW).is_err(), "un titre vide est refusé");
        assert_eq!(refused.kind(), "event");
    }
}
