//! Langue de l'interface pour les quelques textes écrits par le cœur : menu de l'icône près de
//! l'horloge, notifications, titres de fenêtres et fenêtres de Windows (ouvrir, enregistrer).
//! La langue est la préférence « langue » écrite par l'interface ; avant qu'elle existe, celle
//! de Windows si Aqueli la parle, l'anglais sinon.

use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::commands::DataDir;
use crate::prefs::{self, Prefs};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    Fr,
    En,
    Es,
    Pt,
    De,
    It,
    Nl,
    Pl,
    Ru,
    Uk,
    Tr,
    Hi,
    Id,
    Vi,
    Zh,
    Ja,
    Ko,
}

/// Langues autres que le français, dans l'ordre des colonnes de `TEXTS`.
const OTHERS: [(Lang, &str); 16] = [
    (Lang::En, "en"),
    (Lang::Es, "es"),
    (Lang::Pt, "pt"),
    (Lang::De, "de"),
    (Lang::It, "it"),
    (Lang::Nl, "nl"),
    (Lang::Pl, "pl"),
    (Lang::Ru, "ru"),
    (Lang::Uk, "uk"),
    (Lang::Tr, "tr"),
    (Lang::Hi, "hi"),
    (Lang::Id, "id"),
    (Lang::Vi, "vi"),
    (Lang::Zh, "zh"),
    (Lang::Ja, "ja"),
    (Lang::Ko, "ko"),
];

impl Lang {
    /// Code de la préférence (« fr », « en », « es »…).
    pub fn from_code(code: &str) -> Option<Lang> {
        if code == "fr" {
            return Some(Lang::Fr);
        }
        OTHERS.iter().find(|(_, c)| *c == code).map(|(l, _)| *l)
    }

    /// Code de la préférence de cette langue.
    pub fn code(self) -> &'static str {
        OTHERS.iter().find(|(l, _)| *l == self).map_or("fr", |(_, c)| c)
    }

    /// Colonne de la langue dans `TEXTS` (aucune pour le français, la langue des clés).
    fn column(self) -> Option<usize> {
        OTHERS.iter().position(|(l, _)| *l == self)
    }

    /// Langue d'après l'identifiant principal de Windows (10 bits de poids faible du LANGID).
    fn from_windows(primary: u16) -> Lang {
        match primary {
            0x0c => Lang::Fr,
            0x0a => Lang::Es,
            0x16 => Lang::Pt,
            0x07 => Lang::De,
            0x10 => Lang::It,
            0x13 => Lang::Nl,
            0x15 => Lang::Pl,
            0x19 => Lang::Ru,
            0x22 => Lang::Uk,
            0x1f => Lang::Tr,
            0x39 => Lang::Hi,
            0x21 => Lang::Id,
            0x2a => Lang::Vi,
            0x04 => Lang::Zh,
            0x11 => Lang::Ja,
            0x12 => Lang::Ko,
            _ => Lang::En,
        }
    }
}

/// Langue par défaut : celle choisie au début de l'installation, sinon celle de Windows, si
/// Aqueli la parle ; l'anglais sinon.
pub fn system() -> Lang {
    #[cfg(windows)]
    {
        // SAFETY: simple lecture d'un réglage de Windows, sans argument.
        let id = installer_choice().unwrap_or_else(|| u32::from(unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() }));
        Lang::from_windows((id & 0x3ff) as u16)
    }
    #[cfg(not(windows))]
    Lang::En
}

/// Langue choisie dans l'installateur : identifiant Windows de la langue, noté par
/// `installateur/crochets.nsh` (valeur « LangueInstallation » de la clé d'Aqueli).
#[cfg(windows)]
fn installer_choice() -> Option<u32> {
    use windows::core::w;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let mut value = 0u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY: `value` et `size` vivent pendant l'appel ; la taille est celle d'un DWORD.
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Aqueli"),
            w!("LangueInstallation"),
            RRF_RT_REG_DWORD,
            None,
            Some((&mut value as *mut u32).cast()),
            Some(&mut size),
        )
    };
    (result == ERROR_SUCCESS && value != 0).then_some(value)
}

/// Langue des préférences données (celle de Windows si aucune n'est encore notée).
pub fn from_prefs(prefs: &Prefs) -> Lang {
    prefs.get("langue").and_then(|v| v.as_str()).and_then(Lang::from_code).unwrap_or_else(system)
}

/// Langue enregistrée dans le dossier des données.
pub fn current(dir: &Path) -> Lang {
    from_prefs(&prefs::load(dir))
}

/// Langue choisie, depuis l'application.
pub fn of(app: &AppHandle) -> Lang {
    app.try_state::<DataDir>().map_or(Lang::Fr, |dir| current(&dir.0))
}

/// Textes du cœur et leurs traductions : anglais, espagnol, portugais (Brésil), allemand, italien,
/// néerlandais, polonais, russe, ukrainien, turc, hindi, indonésien, vietnamien, chinois
/// simplifié, japonais, coréen.
#[rustfmt::skip]
const TEXTS: &[(&str, [&str; 16])] = &[
    // Icône près de l'horloge, fenêtres.
    ("Ouvrir Aqueli", ["Open Aqueli", "Abrir Aqueli", "Abrir o Aqueli", "Aqueli öffnen", "Apri Aqueli", "Aqueli openen", "Otwórz Aqueli", "Открыть Aqueli", "Відкрити Aqueli", "Aqueli'yi aç", "Aqueli खोलें", "Buka Aqueli", "Mở Aqueli", "打开 Aqueli", "Aqueli を開く", "Aqueli 열기"]),
    ("Capture rapide", ["Quick capture", "Captura rápida", "Captura rápida", "Schnellerfassung", "Cattura rapida", "Snel vastleggen", "Szybkie notowanie", "Быстрая запись", "Швидкий запис", "Hızlı ekleme", "त्वरित कैप्चर", "Tangkap cepat", "Ghi nhanh", "快速记录", "クイックキャプチャ", "빠른 기록"]),
    ("Verrouiller", ["Lock", "Bloquear", "Bloquear", "Sperren", "Blocca", "Vergrendelen", "Zablokuj", "Заблокировать", "Заблокувати", "Kilitle", "लॉक करें", "Kunci", "Khóa", "锁定", "ロック", "잠금"]),
    ("Quitter Aqueli", ["Quit Aqueli", "Salir de Aqueli", "Sair do Aqueli", "Aqueli beenden", "Esci da Aqueli", "Aqueli afsluiten", "Zamknij Aqueli", "Выйти из Aqueli", "Вийти з Aqueli", "Aqueli'den çık", "Aqueli बंद करें", "Keluar dari Aqueli", "Thoát Aqueli", "退出 Aqueli", "Aqueli を終了", "Aqueli 종료"]),
    ("Sans titre", ["Untitled", "Sin título", "Sem título", "Ohne Titel", "Senza titolo", "Zonder titel", "Bez tytułu", "Без названия", "Без назви", "Başlıksız", "बिना शीर्षक", "Tanpa judul", "Không có tiêu đề", "无标题", "無題", "제목 없음"]),
    // Notifications.
    ("Rappel Aqueli", ["Aqueli reminder", "Recordatorio de Aqueli", "Lembrete do Aqueli", "Aqueli-Erinnerung", "Promemoria di Aqueli", "Aqueli-herinnering", "Przypomnienie Aqueli", "Напоминание Aqueli", "Нагадування Aqueli", "Aqueli hatırlatıcısı", "Aqueli अनुस्मारक", "Pengingat Aqueli", "Lời nhắc Aqueli", "Aqueli 提醒", "Aqueli のリマインダー", "Aqueli 알림"]),
    ("rappels Aqueli", ["Aqueli reminders", "recordatorios de Aqueli", "lembretes do Aqueli", "Aqueli-Erinnerungen", "promemoria di Aqueli", "Aqueli-herinneringen", "przypomnienia Aqueli", "напоминания Aqueli", "нагадування Aqueli", "Aqueli hatırlatıcısı", "Aqueli अनुस्मारक", "pengingat Aqueli", "lời nhắc Aqueli", "条 Aqueli 提醒", "件の Aqueli リマインダー", "개의 Aqueli 알림"]),
    ("Ouvrez Aqueli pour voir la tâche.", ["Open Aqueli to see the task.", "Abre Aqueli para ver la tarea.", "Abra o Aqueli para ver a tarefa.", "Öffnen Sie Aqueli, um die Aufgabe zu sehen.", "Apri Aqueli per vedere l'attività.", "Open Aqueli om de taak te zien.", "Otwórz Aqueli, aby zobaczyć zadanie.", "Откройте Aqueli, чтобы увидеть задачу.", "Відкрийте Aqueli, щоб побачити завдання.", "Görevi görmek için Aqueli'yi açın.", "कार्य देखने के लिए Aqueli खोलें।", "Buka Aqueli untuk melihat tugas.", "Mở Aqueli để xem công việc.", "打开 Aqueli 查看任务。", "タスクを表示するには Aqueli を開いてください。", "작업을 보려면 Aqueli를 여세요."]),
    ("Ouvrez Aqueli pour voir les tâches.", ["Open Aqueli to see the tasks.", "Abre Aqueli para ver las tareas.", "Abra o Aqueli para ver as tarefas.", "Öffnen Sie Aqueli, um die Aufgaben zu sehen.", "Apri Aqueli per vedere le attività.", "Open Aqueli om de taken te zien.", "Otwórz Aqueli, aby zobaczyć zadania.", "Откройте Aqueli, чтобы увидеть задачи.", "Відкрийте Aqueli, щоб побачити завдання.", "Görevleri görmek için Aqueli'yi açın.", "कार्य देखने के लिए Aqueli खोलें।", "Buka Aqueli untuk melihat tugas-tugas.", "Mở Aqueli để xem các công việc.", "打开 Aqueli 查看任务。", "タスクを表示するには Aqueli を開いてください。", "작업을 보려면 Aqueli를 여세요."]),
    ("rappels", ["reminders", "recordatorios", "lembretes", "Erinnerungen", "promemoria", "herinneringen", "przypomnienia", "напоминания", "нагадування", "hatırlatıcı", "अनुस्मारक", "pengingat", "lời nhắc", "条提醒", "件のリマインダー", "개의 알림"]),
    ("Ouvrez Aqueli pour les voir.", ["Open Aqueli to see them.", "Abre Aqueli para verlos.", "Abra o Aqueli para vê-los.", "Öffnen Sie Aqueli, um sie zu sehen.", "Apri Aqueli per vederli.", "Open Aqueli om ze te zien.", "Otwórz Aqueli, aby je zobaczyć.", "Откройте Aqueli, чтобы их увидеть.", "Відкрийте Aqueli, щоб їх побачити.", "Görmek için Aqueli'yi açın.", "उन्हें देखने के लिए Aqueli खोलें।", "Buka Aqueli untuk melihatnya.", "Mở Aqueli để xem.", "打开 Aqueli 查看。", "表示するには Aqueli を開いてください。", "확인하려면 Aqueli를 여세요."]),
    ("Reporter 10 min", ["Snooze 10 min", "Posponer 10 min", "Adiar 10 min", "10 Min. später", "Rimanda di 10 min", "10 min uitstellen", "Odłóż o 10 min", "Отложить на 10 мин", "Відкласти на 10 хв", "10 dk ertele", "10 मिनट बाद", "Tunda 10 mnt", "Báo lại sau 10 phút", "推迟 10 分钟", "10 分後に再通知", "10분 후 다시 알림"]),
    ("Terminé", ["Done", "Hecho", "Concluído", "Erledigt", "Fatto", "Klaar", "Gotowe", "Готово", "Готово", "Bitti", "हो गया", "Selesai", "Xong", "完成", "完了", "완료"]),
    ("Ouvrir", ["Open", "Abrir", "Abrir", "Öffnen", "Apri", "Openen", "Otwórz", "Открыть", "Відкрити", "Aç", "खोलें", "Buka", "Mở", "打开", "開く", "열기"]),
    ("Notification d'essai", ["Test notification", "Notificación de prueba", "Notificação de teste", "Testbenachrichtigung", "Notifica di prova", "Testmelding", "Powiadomienie testowe", "Тестовое уведомление", "Тестове сповіщення", "Deneme bildirimi", "परीक्षण सूचना", "Notifikasi uji coba", "Thông báo thử", "测试通知", "テスト通知", "테스트 알림"]),
    ("Les rappels s'afficheront ainsi.", ["Reminders will appear like this.", "Los recordatorios se mostrarán así.", "Os lembretes aparecerão assim.", "So werden Erinnerungen angezeigt.", "I promemoria appariranno così.", "Herinneringen worden zo weergegeven.", "Przypomnienia będą wyglądać tak.", "Напоминания будут выглядеть так.", "Нагадування виглядатимуть так.", "Hatırlatıcılar böyle görünecek.", "अनुस्मारक इस तरह दिखेंगे।", "Pengingat akan tampil seperti ini.", "Lời nhắc sẽ hiển thị như thế này.", "提醒将这样显示。", "リマインダーはこのように表示されます。", "알림은 이렇게 표시됩니다."]),
    // Fenêtres de Windows.
    ("Nouvel emplacement des données", ["New data location", "Nueva ubicación de los datos", "Novo local dos dados", "Neuer Speicherort der Daten", "Nuova posizione dei dati", "Nieuwe locatie van de gegevens", "Nowa lokalizacja danych", "Новое расположение данных", "Нове розташування даних", "Verilerin yeni konumu", "डेटा का नया स्थान", "Lokasi data baru", "Vị trí dữ liệu mới", "新的数据位置", "データの新しい保存先", "새 데이터 위치"]),
    ("Destination des sauvegardes", ["Backup destination", "Destino de las copias de seguridad", "Destino dos backups", "Speicherort der Sicherungen", "Destinazione dei backup", "Locatie van de back-ups", "Miejsce kopii zapasowych", "Место для резервных копий", "Місце для резервних копій", "Yedeklerin konumu", "बैकअप का स्थान", "Tujuan cadangan", "Nơi lưu bản sao lưu", "备份位置", "バックアップの保存先", "백업 위치"]),
    ("Exporter le compte", ["Export account", "Exportar la cuenta", "Exportar a conta", "Konto exportieren", "Esporta l'account", "Account exporteren", "Eksportuj konto", "Экспортировать учётную запись", "Експортувати обліковий запис", "Hesabı dışa aktar", "खाता निर्यात करें", "Ekspor akun", "Xuất tài khoản", "导出账户", "アカウントをエクスポート", "계정 내보내기"]),
    ("Sauvegarde Aqueli", ["Aqueli backup", "Copia de seguridad de Aqueli", "Backup do Aqueli", "Aqueli-Sicherung", "Backup di Aqueli", "Aqueli-back-up", "Kopia zapasowa Aqueli", "Резервная копия Aqueli", "Резервна копія Aqueli", "Aqueli yedeği", "Aqueli बैकअप", "Cadangan Aqueli", "Bản sao lưu Aqueli", "Aqueli 备份", "Aqueli のバックアップ", "Aqueli 백업"]),
    ("Restaurer une sauvegarde", ["Restore a backup", "Restaurar una copia de seguridad", "Restaurar um backup", "Sicherung wiederherstellen", "Ripristina un backup", "Back-up terugzetten", "Przywróć kopię zapasową", "Восстановить резервную копию", "Відновити резервну копію", "Yedeği geri yükle", "बैकअप पुनर्स्थापित करें", "Pulihkan cadangan", "Khôi phục bản sao lưu", "恢复备份", "バックアップを復元", "백업 복원"]),
    ("Importer un fichier", ["Import a file", "Importar un archivo", "Importar um arquivo", "Datei importieren", "Importa un file", "Bestand importeren", "Importuj plik", "Импортировать файл", "Імпортувати файл", "Dosya içe aktar", "फ़ाइल आयात करें", "Impor berkas", "Nhập tệp", "导入文件", "ファイルをインポート", "파일 가져오기"]),
    (
        "Excel, CSV, texte, agenda ou contacts (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
        [
            "Excel, CSV, text, calendar or contacts (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, texto, calendario o contactos (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, texto, agenda ou contatos (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, Text, Kalender oder Kontakte (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, testo, calendario o contatti (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, tekst, agenda of contacten (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, tekst, kalendarz lub kontakty (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, текст, календарь или контакты (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, текст, календар або контакти (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, metin, takvim veya kişiler (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, टेक्स्ट, कैलेंडर या संपर्क (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, teks, kalender, atau kontak (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, văn bản, lịch hoặc danh bạ (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel、CSV、文本、日历或联系人 (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel、CSV、テキスト、カレンダー、連絡先 (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
            "Excel, CSV, 텍스트, 캘린더 또는 연락처 (*.xlsx, *.csv, *.txt, *.md, *.ics, *.vcf)",
        ],
    ),
    ("Ajouter des documents", ["Add documents", "Añadir documentos", "Adicionar documentos", "Dokumente hinzufügen", "Aggiungi documenti", "Documenten toevoegen", "Dodaj dokumenty", "Добавить документы", "Додати документи", "Belge ekle", "दस्तावेज़ जोड़ें", "Tambahkan dokumen", "Thêm tài liệu", "添加文档", "ドキュメントを追加", "문서 추가"]),
    ("Tous les fichiers", ["All files", "Todos los archivos", "Todos os arquivos", "Alle Dateien", "Tutti i file", "Alle bestanden", "Wszystkie pliki", "Все файлы", "Усі файли", "Tüm dosyalar", "सभी फ़ाइलें", "Semua berkas", "Tất cả tệp", "所有文件", "すべてのファイル", "모든 파일"]),
    ("Fichier", ["File", "Archivo", "Arquivo", "Datei", "File", "Bestand", "Plik", "Файл", "Файл", "Dosya", "फ़ाइल", "Berkas", "Tệp", "文件", "ファイル", "파일"]),
    ("Exporter le document", ["Export document", "Exportar el documento", "Exportar o documento", "Dokument exportieren", "Esporta il documento", "Document exporteren", "Eksportuj dokument", "Экспортировать документ", "Експортувати документ", "Belgeyi dışa aktar", "दस्तावेज़ निर्यात करें", "Ekspor dokumen", "Xuất tài liệu", "导出文档", "ドキュメントをエクスポート", "문서 내보내기"]),
    ("Exporter les documents", ["Export documents", "Exportar los documentos", "Exportar os documentos", "Dokumente exportieren", "Esporta i documenti", "Documenten exporteren", "Eksportuj dokumenty", "Экспортировать документы", "Експортувати документи", "Belgeleri dışa aktar", "दस्तावेज़ निर्यात करें", "Ekspor dokumen-dokumen", "Xuất các tài liệu", "导出文档", "ドキュメントをエクスポート", "문서 내보내기"]),
    ("Carnet de contacts (*.vcf)", ["Address book (*.vcf)", "Libreta de contactos (*.vcf)", "Agenda de contatos (*.vcf)", "Adressbuch (*.vcf)", "Rubrica (*.vcf)", "Adresboek (*.vcf)", "Książka adresowa (*.vcf)", "Адресная книга (*.vcf)", "Адресна книга (*.vcf)", "Adres defteri (*.vcf)", "पता पुस्तिका (*.vcf)", "Buku alamat (*.vcf)", "Sổ địa chỉ (*.vcf)", "通讯录 (*.vcf)", "アドレス帳 (*.vcf)", "주소록 (*.vcf)"]),
    ("Agenda (*.ics)", ["Calendar (*.ics)", "Calendario (*.ics)", "Agenda (*.ics)", "Kalender (*.ics)", "Calendario (*.ics)", "Agenda (*.ics)", "Kalendarz (*.ics)", "Календарь (*.ics)", "Календар (*.ics)", "Takvim (*.ics)", "कैलेंडर (*.ics)", "Kalender (*.ics)", "Lịch (*.ics)", "日历 (*.ics)", "カレンダー (*.ics)", "캘린더 (*.ics)"]),
    ("Document Markdown (*.md)", ["Markdown document (*.md)", "Documento Markdown (*.md)", "Documento Markdown (*.md)", "Markdown-Dokument (*.md)", "Documento Markdown (*.md)", "Markdown-document (*.md)", "Dokument Markdown (*.md)", "Документ Markdown (*.md)", "Документ Markdown (*.md)", "Markdown belgesi (*.md)", "Markdown दस्तावेज़ (*.md)", "Dokumen Markdown (*.md)", "Tài liệu Markdown (*.md)", "Markdown 文档 (*.md)", "Markdown ドキュメント (*.md)", "Markdown 문서 (*.md)"]),
    ("Texte (*.txt)", ["Text (*.txt)", "Texto (*.txt)", "Texto (*.txt)", "Text (*.txt)", "Testo (*.txt)", "Tekst (*.txt)", "Tekst (*.txt)", "Текст (*.txt)", "Текст (*.txt)", "Metin (*.txt)", "टेक्स्ट (*.txt)", "Teks (*.txt)", "Văn bản (*.txt)", "文本 (*.txt)", "テキスト (*.txt)", "텍스트 (*.txt)"]),
    ("Tableau CSV (*.csv)", ["CSV table (*.csv)", "Tabla CSV (*.csv)", "Tabela CSV (*.csv)", "CSV-Tabelle (*.csv)", "Tabella CSV (*.csv)", "CSV-tabel (*.csv)", "Tabela CSV (*.csv)", "Таблица CSV (*.csv)", "Таблиця CSV (*.csv)", "CSV tablosu (*.csv)", "CSV तालिका (*.csv)", "Tabel CSV (*.csv)", "Bảng CSV (*.csv)", "CSV 表格 (*.csv)", "CSV 表 (*.csv)", "CSV 표 (*.csv)"]),
    ("Exporter", ["Export", "Exportar", "Exportar", "Exportieren", "Esporta", "Exporteren", "Eksportuj", "Экспорт", "Експорт", "Dışa aktar", "निर्यात करें", "Ekspor", "Xuất", "导出", "エクスポート", "내보내기"]),
    ("Exporter le thème", ["Export theme", "Exportar el tema", "Exportar o tema", "Design exportieren", "Esporta il tema", "Thema exporteren", "Eksportuj motyw", "Экспортировать тему", "Експортувати тему", "Temayı dışa aktar", "थीम निर्यात करें", "Ekspor tema", "Xuất chủ đề", "导出主题", "テーマをエクスポート", "테마 내보내기"]),
    ("Thème Aqueli (*.aqtheme)", ["Aqueli theme (*.aqtheme)", "Tema de Aqueli (*.aqtheme)", "Tema do Aqueli (*.aqtheme)", "Aqueli-Design (*.aqtheme)", "Tema di Aqueli (*.aqtheme)", "Aqueli-thema (*.aqtheme)", "Motyw Aqueli (*.aqtheme)", "Тема Aqueli (*.aqtheme)", "Тема Aqueli (*.aqtheme)", "Aqueli teması (*.aqtheme)", "Aqueli थीम (*.aqtheme)", "Tema Aqueli (*.aqtheme)", "Chủ đề Aqueli (*.aqtheme)", "Aqueli 主题 (*.aqtheme)", "Aqueli テーマ (*.aqtheme)", "Aqueli 테마 (*.aqtheme)"]),
];

/// Texte du cœur dans la langue choisie (l'anglais en secours, sinon le français).
pub fn text(lang: Lang, fr: &'static str) -> &'static str {
    let Some(column) = lang.column() else { return fr };
    TEXTS.iter().find(|(f, _)| *f == fr).map_or(fr, |(_, all)| all[column])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Tous les `lang::text(…, "…")` du cœur ont leur traduction.
    #[test]
    fn chaque_texte_du_coeur_a_sa_traduction() {
        let mut missing = Vec::new();
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut stack = vec![dir];
        while let Some(d) = stack.pop() {
            for entry in std::fs::read_dir(&d).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().is_some_and(|e| e == "rs") && !path.ends_with("lang.rs") {
                    let source = std::fs::read_to_string(&path).unwrap();
                    for (i, _) in source.match_indices("lang::text(") {
                        // Le texte écrit en toutes lettres, sur la même ligne : lang::text(langue, "…").
                        let line = source[i..].lines().next().unwrap_or("");
                        let Some(open) = line.find(", \"") else { continue };
                        let rest = &line[open + 3..];
                        let Some(close) = rest.find('"') else { continue };
                        let fr = &rest[..close];
                        if !TEXTS.iter().any(|(f, _)| *f == fr) {
                            missing.push(format!("{}: {fr}", path.display()));
                        }
                    }
                }
            }
        }
        assert!(missing.is_empty(), "sans traduction : {missing:?}");
    }

    #[test]
    fn chaque_traduction_est_remplie() {
        for (fr, all) in TEXTS {
            assert!(all.iter().all(|t| !t.trim().is_empty()), "traduction vide : {fr}");
        }
    }

    #[test]
    fn la_langue_vient_des_preferences() {
        let mut prefs = Prefs::new();
        assert_eq!(from_prefs(&prefs), system());
        prefs.insert("langue".into(), "fr".into());
        assert_eq!(from_prefs(&prefs), Lang::Fr);
        prefs.insert("langue".into(), "en".into());
        assert_eq!(from_prefs(&prefs), Lang::En);
        prefs.insert("langue".into(), "ja".into());
        assert_eq!(from_prefs(&prefs), Lang::Ja);
        prefs.insert("langue".into(), "inconnue".into());
        assert_eq!(from_prefs(&prefs), system());
        assert_eq!(text(Lang::En, "Terminé"), "Done");
        assert_eq!(text(Lang::De, "Terminé"), "Erledigt");
        assert_eq!(text(Lang::Fr, "Terminé"), "Terminé");
        assert_eq!(text(Lang::En, "Inconnu"), "Inconnu");
    }

    #[test]
    fn la_langue_de_windows() {
        assert_eq!(Lang::from_windows(0x0c), Lang::Fr);
        assert_eq!(Lang::from_windows(0x07), Lang::De);
        assert_eq!(Lang::from_windows(0x11), Lang::Ja);
        // Une langue qu'Aqueli ne parle pas (l'arabe) : l'anglais.
        assert_eq!(Lang::from_windows(0x01), Lang::En);
    }
}
