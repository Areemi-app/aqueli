# Glossaire des traductions

Aqueli parle 17 langues : français (langue du code), anglais britannique (`src/i18n/en.ts`, indexé par le texte français) et 15 autres (`src/i18n/locales/<langue>.json`, indexés par l'identifiant du texte, `textId`). Ce glossaire fixe les mots à employer partout, pour que chaque langue reste cohérente d'un écran à l'autre.

**Ajouter ou modifier un texte** : écrire le texte français dans `tr()` ou `trn()`, sa traduction anglaise dans `en.ts`, puis `node scripts/i18n.mjs catalogue` ; `node scripts/i18n.mjs manquants <langue>` liste ce qui manque, `node scripts/i18n.mjs lot <langue> <n>` en extrait une série (identifiant, anglais, français) et `node scripts/i18n.mjs ajouter <langue> <fichier.json>` enregistre les traductions ; `node scripts/i18n.mjs bilan` donne l'avancement. Le test `src/i18n/i18n.test.ts` vérifie que chaque langue est complète, avec les mêmes accolades et les bonnes formes de pluriel (russe et ukrainien : one, few, many ; polonais : few, many).


Ton : sobre et formel, comme Windows dans chaque langue. Boutons : infinitif (es, pt, it, de, nl, pl : forme habituelle de Windows), impératif poli (ru/uk « вы », tr « -in », hi « आप », id « Anda », vi « bạn », ja です/ます, ko 합니다/하세요). es « tú », pt-BR « você », de « Sie », it « tu », nl « je ».
Garder tel quel : Aqueli, Ko-fi, Windows Hello, Excel, CSV, Ctrl/Alt/Maj→Shift selon la langue, {accolades}, %APPDATA%\\Aqueli.
Exemples de saisie rapide (« Appeler le garage vendredi 14h #voiture !haute ») : la saisie ne comprend les mots qu'en français et en anglais, mais les formes chiffrées partout. Écrire l'exemple dans la langue avec ces formes (« Werkstatt anrufen 24/10 14:00 #auto !!! », « Abendessen mit Paul 24/10 20:00 ») ; une répétition reste en anglais (« Yoga every Tuesday 18:30 ») ; un test (`src/i18n/examples.test.ts`) vérifie que les exemples se comprennent. Dans l'aide, « Dates et heures » décrit ces formes (24/10, 2026-10-24, 14:00, !!!, !high, +Espace).
Mots à double sens (contexte après « | ») : « Espace » = un espace d'Aqueli (es Espacio, de Bereich, ru Пространство, zh 空间…), « Espace|touche » = la touche ; « Taille » = taille de vêtement (fiche contact), « Taille|carte » et « Taille|fichier » = dimension ; « Tableau|vue » = tableau Kanban (Board) ; « Réduire|fenêtre » = réduire la fenêtre (Minimize) ; « Rétablir|défaut » = remettre la valeur d'origine (Reset, jamais « Redo »).
Phrases : toujours entières, valeurs entre accolades (jamais un morceau « Les  » + nombre + « plus récentes ») ; questions du Journal neutres en genre quand la langue le permet (pl « Co dzisiaj napawa cię dumą? », es « ¿Qué te enorgullece hoy? »).
Guillemets : es/it/ru/uk «…», pt/tr/hi/id/vi/zh “…”, de „…“, pl „…”, nl ‘…’, ja 「…」, ko ‘…’.
Pluriels (marques [one]/[other]) : pl, ru, uk → la clé [other] reçoit un objet {"few","many","other"} ; les autres langues une chaîne. zh, ja, ko, vi, id : la clé [other] sert aussi pour 1 (pas de pluriel).

Modules (Accueil, Bilan, Tâches, Calendrier, Obligations, Notes, Journal, Habitudes, Focus, Projets, Listes, Contacts, Documents, Objectifs, Budget, Corbeille, Paramètres) :
- es : Inicio, Balance, Tareas, Calendario, Obligaciones, Notas, Diario, Hábitos, Enfoque, Proyectos, Listas, Contactos, Documentos, Objetivos, Presupuesto, Papelera, Configuración
- pt : Início, Balanço, Tarefas, Calendário, Obrigações, Notas, Diário, Hábitos, Foco, Projetos, Listas, Contatos, Documentos, Metas, Orçamento, Lixeira, Configurações
- de : Start, Rückblick, Aufgaben, Kalender, Verpflichtungen, Notizen, Tagebuch, Gewohnheiten, Fokus, Projekte, Listen, Kontakte, Dokumente, Ziele, Budget, Papierkorb, Einstellungen
- it : Home, Bilancio, Attività, Calendario, Obblighi, Note, Diario, Abitudini, Focus, Progetti, Liste, Contatti, Documenti, Obiettivi, Budget, Cestino, Impostazioni
- nl : Start, Overzicht, Taken, Agenda, Verplichtingen, Notities, Dagboek, Gewoonten, Focus, Projecten, Lijsten, Contacten, Documenten, Doelen, Budget, Prullenbak, Instellingen
- pl : Start, Podsumowanie, Zadania, Kalendarz, Zobowiązania, Notatki, Dziennik, Nawyki, Skupienie, Projekty, Listy, Kontakty, Dokumenty, Cele, Budżet, Kosz, Ustawienia
- ru : Главная, Итоги, Задачи, Календарь, Обязательства, Заметки, Дневник, Привычки, Фокус, Проекты, Списки, Контакты, Документы, Цели, Бюджет, Корзина, Настройки
- uk : Головна, Підсумки, Завдання, Календар, Зобов'язання, Нотатки, Щоденник, Звички, Фокус, Проєкти, Списки, Контакти, Документи, Цілі, Бюджет, Кошик, Налаштування
- tr : Ana sayfa, Değerlendirme, Görevler, Takvim, Yükümlülükler, Notlar, Günlük, Alışkanlıklar, Odak, Projeler, Listeler, Kişiler, Belgeler, Hedefler, Bütçe, Çöp kutusu, Ayarlar
- hi : होम, समीक्षा, कार्य, कैलेंडर, दायित्व, नोट्स, डायरी, आदतें, फ़ोकस, प्रोजेक्ट, सूचियाँ, संपर्क, दस्तावेज़, लक्ष्य, बजट, रीसायकल बिन, सेटिंग्स
- id : Beranda, Ulasan, Tugas, Kalender, Kewajiban, Catatan, Jurnal, Kebiasaan, Fokus, Proyek, Daftar, Kontak, Dokumen, Sasaran, Anggaran, Tempat sampah, Pengaturan
- vi : Trang chủ, Tổng kết, Công việc, Lịch, Nghĩa vụ, Ghi chú, Nhật ký, Thói quen, Tập trung, Dự án, Danh sách, Danh bạ, Tài liệu, Mục tiêu, Ngân sách, Thùng rác, Cài đặt
- zh : 主页, 回顾, 任务, 日历, 账单与合同, 笔记, 日记, 习惯, 专注, 项目, 清单, 联系人, 文档, 目标, 预算, 回收站, 设置
- ja : ホーム, 振り返り, タスク, カレンダー, 支払いと契約, ノート, 日記, 習慣, 集中, プロジェクト, リスト, 連絡先, ドキュメント, 目標, 予算, ごみ箱, 設定
- ko : 홈, 돌아보기, 작업, 캘린더, 청구서와 계약, 노트, 일기, 습관, 집중, 프로젝트, 목록, 연락처, 문서, 목표, 예산, 휴지통, 설정

Termes (espace, thème, rappel, sauvegarde, capture rapide, palette de commandes, échéance, événement, étiquette, compte, mot de passe, clé de récupération, verrouiller, épingler, séance, modèle, carnet, obligation, opération (budget), dépense, revenu, catégorie) :
- es : espacio, tema, recordatorio, copia de seguridad, captura rápida, paleta de comandos, vencimiento, evento, etiqueta, cuenta, contraseña, clave de recuperación, bloquear, anclar, sesión, plantilla, cuaderno, obligación, operación, gasto, ingreso, categoría
- pt : espaço, tema, lembrete, backup, captura rápida, paleta de comandos, vencimento, evento, etiqueta, conta, senha, chave de recuperação, bloquear, fixar, sessão, modelo, caderno, obrigação, transação, despesa, receita, categoria
- de : Bereich, Design, Erinnerung, Sicherung, Schnellerfassung, Befehlspalette, Fälligkeit, Termin, Schlagwort, Konto, Passwort, Wiederherstellungsschlüssel, sperren, anheften, Sitzung, Vorlage, Notizbuch, Verpflichtung, Buchung, Ausgabe, Einnahme, Kategorie
- it : spazio, tema, promemoria, backup, cattura rapida, palette dei comandi, scadenza, evento, etichetta, account, password, chiave di recupero, bloccare, fissare, sessione, modello, taccuino, obbligo, movimento, spesa, entrata, categoria
- nl : ruimte, thema, herinnering, back-up, snel vastleggen, opdrachtenpalet, vervaldatum, afspraak, label, account, wachtwoord, herstelsleutel, vergrendelen, vastmaken, sessie, sjabloon, notitieboek, verplichting, transactie, uitgave, inkomst, categorie
- pl : przestrzeń, motyw, przypomnienie, kopia zapasowa, szybkie notowanie, paleta poleceń, termin, wydarzenie, etykieta, konto, hasło, klucz odzyskiwania, zablokuj, przypnij, sesja, szablon, notatnik, zobowiązanie, transakcja, wydatek, przychód, kategoria
- ru : пространство, тема, напоминание, резервная копия, быстрая запись, палитра команд, срок, событие, метка, учётная запись, пароль, ключ восстановления, заблокировать, закрепить, сеанс, шаблон, блокнот, обязательство, операция, расход, доход, категория
- uk : простір, тема, нагадування, резервна копія, швидкий запис, палітра команд, термін, подія, мітка, обліковий запис, пароль, ключ відновлення, заблокувати, закріпити, сеанс, шаблон, блокнот, зобов'язання, операція, витрата, дохід, категорія
- tr : alan, tema, hatırlatıcı, yedek, hızlı ekleme, komut paleti, son tarih, etkinlik, etiket, hesap, parola, kurtarma anahtarı, kilitle, sabitle, oturum, şablon, defter, yükümlülük, işlem, gider, gelir, kategori
- hi : स्पेस, थीम, अनुस्मारक, बैकअप, त्वरित कैप्चर, कमांड पैलेट, नियत तिथि, इवेंट, टैग, खाता, पासवर्ड, पुनर्प्राप्ति कुंजी, लॉक करें, पिन करें, सत्र, टेम्पलेट, नोटबुक, दायित्व, लेन-देन, खर्च, आय, श्रेणी
- id : ruang, tema, pengingat, cadangan, tangkap cepat, palet perintah, tenggat, acara, tag, akun, kata sandi, kunci pemulihan, kunci, sematkan, sesi, templat, buku catatan, kewajiban, transaksi, pengeluaran, pemasukan, kategori
- vi : không gian, chủ đề, lời nhắc, bản sao lưu, ghi nhanh, bảng lệnh, hạn, sự kiện, thẻ, tài khoản, mật khẩu, khóa khôi phục, khóa, ghim, phiên, mẫu, sổ tay, nghĩa vụ, giao dịch, khoản chi, khoản thu, danh mục
- zh : 空间, 主题, 提醒, 备份, 快速记录, 命令面板, 截止日期, 日程, 标签, 账户, 密码, 恢复密钥, 锁定, 固定, 时段, 模板, 笔记本, 事项, 收支记录, 支出, 收入, 类别
- ja : スペース, テーマ, リマインダー, バックアップ, クイックキャプチャ, コマンドパレット, 期限, 予定, タグ, アカウント, パスワード, 回復キー, ロック, ピン留め, セッション, テンプレート, ノートブック, 支払い項目, 取引, 支出, 収入, カテゴリ
- ko : 공간, 테마, 알림, 백업, 빠른 기록, 명령 팔레트, 마감일, 일정, 태그, 계정, 비밀번호, 복구 키, 잠금, 고정, 세션, 템플릿, 노트북, 항목, 거래, 지출, 수입, 카테고리

Thèmes Signature (Aqua, Jade, Glycine, Ambre, Nuage, Minuit) :
- es Aqua, Jade, Glicinia, Ámbar, Nube, Medianoche · pt Aqua, Jade, Glicínia, Âmbar, Nuvem, Meia-noite · de Aqua, Jade, Glyzinie, Bernstein, Wolke, Mitternacht · it Aqua, Giada, Glicine, Ambra, Nuvola, Mezzanotte
Apparence : es Apariencia, pt Aparência, de Darstellung, it Aspetto
- nl Aqua, Jade, Blauwe regen, Amber, Wolk, Middernacht ; Apparence = Vormgeving
- pl Aqua, Jadeit, Glicynia, Bursztyn, Chmura, Północ ; Apparence = Wygląd
- ru Aqua, Нефрит, Глициния, Янтарь, Облако, Полночь ; Apparence = Оформление ; Agenda (vue) = Расписание
- uk Aqua, Нефрит, Гліцинія, Бурштин, Хмара, Північ ; Apparence = Вигляд ; Agenda (vue) = Розклад
- tr Aqua, Yeşim, Mor salkım, Kehribar, Bulut, Gece yarısı ; Apparence = Görünüm
- hi Aqua, जेड, विस्टेरिया, अंबर, बादल, आधी रात ; Apparence = रूप-रंग
- id Aqua, Giok, Wisteria, Amber, Awan, Tengah malam ; Apparence = Tampilan
- vi Aqua, Ngọc bích, Tử đằng, Hổ phách, Mây, Nửa đêm ; Apparence = Giao diện ; Agenda (vue) = Lịch trình
- zh Aqua, 翡翠, 紫藤, 琥珀, 云朵, 午夜 ; Apparence = 外观 ; session Focus = 时段 ; vue Agenda = 日程列表
- ja Aqua, 翡翠, 藤, 琥珀, 雲, 真夜中 ; Apparence = 外観 ; étape (objectifs) = ステップ
- ko Aqua, 비취, 등나무, 호박, 구름, 자정 ; Apparence = 모양 ; étape (objectifs) = 단계

Thèmes Nuit étoilée / Cocon / Zen (Énergie = traduction existante de « Énergie ») :
- es Noche estrellada, Capullo, Zen · pt Noite estrelada, Casulo, Zen · de Sternennacht, Kokon, Zen · it Notte stellata, Bozzolo, Zen · nl Sterrennacht, Cocon, Zen · pl Gwiaździsta noc, Kokon, Zen
- ru Звёздная ночь, Кокон, Дзен · uk Зоряна ніч, Кокон, Дзен · tr Yıldızlı gece, Koza, Zen · hi तारों भरी रात, कोकून, ज़ेन · id Malam berbintang, Kepompong, Zen · vi Đêm đầy sao, Kén ấm, Thiền
- zh 星夜, 茧居, 禅意 · ja 星降る夜, コクーン, 禅 · ko 별이 빛나는 밤, 코쿤, 젠
Rendez-vous : ja 約束, zh 约会, ko 약속 ; agenda du planificateur : ja 予定, zh 日程, ko 일정 목록.
Étape de projet (milestone) = même mot que les étapes d'objectif (es etapa, de Etappe, it tappa, nl mijlpaal, pl etap, ru этап, uk етап, tr aşama, hi पड़ाव, id tahapan, vi mốc, zh 阶段, ja ステップ, ko 단계).
« Semaine {week} · {from} – {to} » : garder « · » entouré d'espaces (le code coupe sur « · »).
Thèmes Ardoise / Velours / Terracotta (son « Terre cuite ») :
- es Pizarra, Terciopelo, Terracota · pt Ardósia, Veludo, Terracota · de Schiefer, Samt, Terrakotta · it Ardesia, Velluto, Terracotta · nl Leisteen, Fluweel, Terracotta · pl Łupek, Aksamit, Terakota
- ru Сланец, Бархат, Терракота · uk Сланець, Оксамит, Теракота · tr Arduvaz, Kadife, Pişmiş toprak · hi स्लेट, मखमल, टेराकोटा · id Batu tulis, Beludru, Terakota · vi Đá phiến, Nhung, Đất nung
- zh 石板, 丝绒, 陶土 · ja スレート, ベルベット, テラコッタ · ko 슬레이트, 벨벳, 테라코타
Mot de confirmation « SUPPRIMER » (comparé après toUpperCase) : éviter i/ı en turc (« KALDIR »), mot en majuscules dans les langues à casse.
Touche Entrée : es « Intro » (corrigé), de « Eingabe », it « Invio », autres « Enter ». Toujours « Ctrl » (pas « Strg »).
