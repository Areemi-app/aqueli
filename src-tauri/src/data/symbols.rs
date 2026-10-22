//! Symboles proposés pour ce qui se personnalise (espaces, catégories d'obligations,
//! carnets). Les dessins sont dans l'interface (src/components/symbols.ts) ; un test y vérifie
//! que les deux listes restent identiques.

use super::DataError;

pub const SYMBOLS: [&str; 174] = [
    "maison", "famille", "personne", "couple", "amis", "bebe", "enfant", "coeur", "cadeau", "cle", "porte", "lit",
    "canape", "lampe", "bougie", "plante", "arrosoir", "balai", "lessive", "panier", "valise", "ordinateur",
    "telephone", "ecole", "livre", "carnet", "idee", "outils", "graphique", "cible", "crayon", "dossier",
    "document", "trombone", "tableau", "presentation", "discussion", "calculatrice", "diplome", "badge", "code",
    "fusee", "argent", "banque", "facture", "contrat", "carte", "portemonnaie", "tirelire", "pieces", "euro",
    "pourcentage", "tendance", "balance", "tampon", "signature", "passeport", "parapluie", "bouclier", "garantie",
    "cadenas", "repetition", "sante", "pilule", "stethoscope", "pouls", "dent", "oeil", "thermometre", "seringue",
    "sommeil", "pesee", "sport", "course", "velo", "natation", "yoga", "ballon", "medaille", "trophee", "musique",
    "casque", "guitare", "micro", "film", "television", "theatre", "ticket", "lecture", "jeu", "puzzle", "des",
    "echecs", "photo", "palette", "pinceau", "fete", "cuisine", "restaurant", "cafe", "the", "vin", "bouteille",
    "pomme", "carotte", "pain", "fromage", "oeuf", "pizza", "gateau", "glace", "voyage", "avion", "voiture", "bus",
    "train", "bateau", "essence", "plan", "lieu", "boussole", "hotel", "tente", "palmier", "montagne", "feuille",
    "pousse", "arbre", "fleur", "soleil", "lune", "nuage", "pluie", "orage", "neige", "vent", "arcenciel", "vague",
    "goutte", "flamme", "eclair", "animal", "chat", "chien", "oiseau", "poisson", "lapin", "papillon", "tortue",
    "etoile", "drapeau", "calendrier", "horloge", "message", "enveloppe", "cloche", "epingle", "signet",
    "etiquette", "lien", "loupe", "coche", "info", "alerte", "sourire", "couronne", "diamant", "infini", "fleche",
    "cercle", "carre", "triangle", "losange", "hexagone",
];

/// Symbole connu ; `field` nomme le champ en cas de refus.
pub fn check_symbol(id: &str, field: &str) -> Result<String, DataError> {
    if SYMBOLS.contains(&id) {
        Ok(id.to_string())
    } else {
        Err(DataError::Invalid { field: field.into() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_liste_est_sans_doublon_et_refuse_l_inconnu() {
        let mut sorted = SYMBOLS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), SYMBOLS.len());
        assert_eq!(check_symbol("maison", "icon").unwrap(), "maison");
        assert!(matches!(check_symbol("inconnu", "icon"), Err(DataError::Invalid { field }) if field == "icon"));
    }
}
