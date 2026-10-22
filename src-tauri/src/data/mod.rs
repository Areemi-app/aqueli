//! Données de l'utilisateur, lues et écrites dans la base chiffrée une fois le coffre ouvert.

pub mod budget;
pub mod contacts;
pub mod documents;
pub mod events;
pub mod filters;
pub mod focus;
pub mod goals;
pub mod habits;
pub mod journal;
pub mod links;
pub mod lists;
pub mod notes;
pub mod obligations;
pub mod order;
pub mod projects;
pub mod spaces;
pub mod symbols;
pub mod recurrence;
pub mod reviews;
pub mod security;
pub mod settings;
pub mod tasks;
pub mod trash;
pub mod wallpapers;

use serde::Serialize;

/// Erreurs des opérations sur les données, envoyées à l'interface qui les traduit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DataError {
    /// Le coffre est verrouillé.
    Locked,
    NotFound,
    /// Valeur refusée ; `field` nomme le champ concerné.
    Invalid { field: String },
    /// Un élément porte déjà ce nom.
    Duplicate { field: String },
    /// Il faut garder au moins un espace.
    LastSpace,
    /// Nombre maximal atteint.
    TooMany { max: usize },
    Database { detail: String },
}

impl From<rusqlite::Error> for DataError {
    fn from(e: rusqlite::Error) -> Self {
        DataError::Database { detail: e.to_string() }
    }
}
