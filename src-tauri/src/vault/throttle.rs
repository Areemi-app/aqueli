//! Délai croissant après plusieurs essais ratés (cahier des charges § 8) :
//! 5 essais libres, puis 30 s, 1 min, 5 min, 15 min, et 1 h au maximum.

pub const FREE_ATTEMPTS: u32 = 5;

/// Attente imposée (en secondes) après `failures` essais ratés d'affilée.
pub fn wait_after(failures: u32) -> u64 {
    match failures {
        0..=4 => 0,
        5 => 30,
        6 => 60,
        7 => 5 * 60,
        8 => 15 * 60,
        _ => 60 * 60,
    }
}

/// Nombre d'essais encore possibles avant la première attente.
pub fn attempts_left(failures: u32) -> u32 {
    FREE_ATTEMPTS.saturating_sub(failures)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cinq_essais_libres_puis_un_delai_croissant() {
        assert_eq!((0..5).map(wait_after).collect::<Vec<_>>(), vec![0, 0, 0, 0, 0]);
        assert_eq!(wait_after(5), 30);
        assert_eq!(wait_after(6), 60);
        assert_eq!(wait_after(7), 300);
        assert_eq!(wait_after(8), 900);
        assert_eq!(wait_after(9), 3600);
        assert_eq!(wait_after(500), 3600);
    }

    #[test]
    fn compte_les_essais_restants() {
        assert_eq!(attempts_left(0), 5);
        assert_eq!(attempts_left(4), 1);
        assert_eq!(attempts_left(5), 0);
        assert_eq!(attempts_left(9), 0);
    }
}
