// app.js — v52
// FEAT : plein écran paroles — ajustement automatique à la page (voir _fitLyricsFullscreen et js/lyrics-fit.js) :
//        on cherche la plus grande taille de texte (100 % → 60 %) qui tient SANS défilement en 1 colonne, puis en
//        2 colonnes (maximum) ; 1 colonne est préférée sauf si 2 colonnes permettent un texte nettement plus grand.
//        Si rien ne tient : 1 colonne à taille normale avec défilement, comme avant. Une ligne n'est jamais coupée
//        entre deux colonnes. Recalculé à l'entrée en plein écran, au changement de contenu et au redimensionnement/
//        rotation. Les écrans déportés refont le même calcul avec leurs propres dimensions (sync.js).
// FEAT : texte affiché — cadre léger autour de chaque section (couplet vvvv, refrain rrrr, solo ssss, pont pppp),
//        mêmes couleurs que les mesures du panneau d'accords (voir formatSongContent, option { sections: true }
//        réservée à l'affichage : l'aperçu de l'éditeur garde une ligne = un élément, dont dépend le karaoké).
// FEAT : bouton "[|] Syllabe" dans l'éditeur, à côté de "🎤 Marquer" — insère
//        le séparateur de syllabe [|] à la position exacte du curseur (dans
//        un mot, contrairement aux boutons vvvv[]/pppp[] qui forcent un
//        début de ligne).
// FIX : un jeton composé uniquement de ponctuation, isolé par un espace (ex.
//        "Oh !" en typographie française) était compté comme un "mot" à
//        marquer dans _extractAllWords() — filtré désormais (au moins une
//        lettre ou un chiffre requis pour être considéré comme un mot).
// FIX (important) : surlignage du mot/syllabe dans l'aperçu (🎤 Marquer)
//        désynchronisé — deux causes combinées : (1) le balayage du texte
//        traversait aussi les badges d'accords, comptant "Em"/"Cmaj7" comme
//        des "mots" ; (2) un accord tombant AU MILIEU d'un mot (ex.
//        "lu{{Cmaj7}}mière") était recollé en un seul mot par l'extraction,
//        alors que le rendu le sépare physiquement en deux fragments de part
//        et d'autre du badge. _extractAllWords()/_getLyricLinesForAlignment()
//        remplacent maintenant {{accord}} par un ESPACE (pas une suppression)
//        pour que la segmentation corresponde à ce que produit réellement
//        renderLyricsWithBadges ; _highlightNextWord() ignore désormais le
//        texte des badges d'accords via un filtre de TreeWalker. Vérifié
//        avec un DOM réel (jsdom) sur l'exemple signalé.
// FIX (important) : 3 appels utilisaient encore les anciens noms
//        _highlightNextWordLine()/_highlightNextWordInPreview(), qui
//        n'existent plus depuis le passage à _highlightNextWord() (support
//        syllabes) — plantage garanti à l'exécution sur initWordTimestamping,
//        markWordTimestamp et l'import LRC. Corrigé aux 3 endroits ; ajout du
//        style CSS .karaoke-next-word qui manquait pour le surlignage
//        précis du mot/syllabe (seule la ligne avait un style).
// FEAT : reprise du marquage des paroles à partir du curseur (bouton
//        "▶ Au curseur") — repositionne uniquement le pointeur de
//        progression sur le mot situé à la ligne du curseur dans l'éditeur,
//        SANS toucher aux repères déjà posés (contrairement à 🎤 Marquer qui
//        repart de zéro) : pratique pour affiner une chanson déjà minutée.
// FIX (important) : karaokeLines/wordMarkLines référencent leurs lignes par
//        NUMÉRO — insérer ou supprimer une ligne au-dessus d'un repère (ex.
//        ajouter une section) décalait donc tous les repères en dessous vers
//        la mauvaise ligne. Ajout d'un réalignement automatique
//        (_remapMarkersIfNeeded, appelé à chaque frappe dans updatePreview) :
//        un instantané du contenu pour lequel les repères sont valides est
//        comparé au contenu courant ; si le nombre de lignes change, un
//        alignement de lignes (LCS) remappe le lineIndex de chaque repère
//        vers sa nouvelle position réelle. Un simple correctif de texte
//        (même nombre de lignes) ne déclenche AUCUN remappage, pour ne
//        jamais perdre un repère sur une modification anodine. Un repère
//        posé sur une ligne effectivement supprimée est retiré, avec un
//        message d'avertissement explicite.
// FEAT : décalage réglable ("Décalage au démarrage", en secondes, positif ou
//        négatif) dans la modale d'import LRC — appliqué à tous les repères
//        calculés (mots) avant leur enregistrement dans wordMarkLines, donc
//        automatiquement répercuté dans wordTimestamps à la sauvegarde de la
//        chanson. Temps jamais négatif (clampé à 0).
// FIX : quand ni les accords ni les paroles ne sont encore marqués, le radio
//        du mode karaoké retombait par défaut sur "Accords" (grisé) — il
//        affiche désormais "Paroles" par défaut dans ce cas, le marquage des
//        paroles (🎤 Marquer / import LRC) étant le point d'entrée le plus
//        naturel. Inchangé dans tous les autres cas (accords seuls → Accords,
//        les deux → Les 2).
// FEAT : l'import LRC (📥 Importer LRC) cale désormais le marquage
//        INDÉPENDANT des paroles (wordTimestamps / 🎤 Marquer) au lieu des
//        accords — le minutage LRC est par ligne, ce qui correspond bien
//        mieux à une répartition des mots dans chaque fenêtre de temps qu'à
//        une approximation par position d'accord. Le marquage par accord
//        (⏱ Marquer) n'est plus touché par cet import.
// FIX : les balises <link rel="imageN"/"KVideo" href="..."> (post-its
//        image/vidéo de l'éditeur) étaient lues comme des "mots" par le
//        marquage indépendant des paroles (🎤 Marquer) et par l'alignement
//        LRC (📥 Importer LRC) — même filtre que celui déjà appliqué dans
//        generateStandardPDF, désormais aussi dans _extractAllWords() et
//        _getLyricLinesForAlignment().
// FEAT : contrôle de vitesse de lecture du MP3 (0.5× à 1.5×, menu déroulant
//        à côté de ▶/⏸/⏹) — sans effet sur la justesse du calage
//        karaoké/défilement, qui se base sur la position audio
//        (currentTime), pas le temps réel écoulé. Réinitialisé à 1× à chaque
//        nouvelle chanson chargée, pour éviter qu'un ralenti ne reste
//        appliqué silencieusement à la chanson suivante.
// FIX (overlay karaoké) : la 3e ligne (next2) était bien plus petite que
//        prévu — la valeur "0.94em" utilisée se calculait par rapport à la
//        taille du parent #karaoke-lines, pas par rapport aux 38px propres à
//        .karaoke-line. Retrait de la surcharge : les 3 lignes ont maintenant
//        exactement la même taille (seule l'opacité distingue "next2").
// FIX : bouton 🎤 Karaoké qui restait grisé à la toute première chanson
//        ouverte tant que le MP3 n'était pas lancé manuellement une fois
//        (probablement une politique navigateur bloquant le préchargement
//        silencieux du MP3 avant tout geste utilisateur sur la page) — un
//        écouteur 'loadedmetadata' sur le lecteur audio rafraîchit désormais
//        l'état du bouton dès que des métadonnées sont réellement
//        disponibles, quel que soit le code qui les a déclenchées.
// FIX : le bouton 🎤 Karaoké ne s'activait que sur la présence du MP3, même
//        sans aucun marquage (accords ni paroles) — il faut désormais AUSSI
//        qu'au moins l'un des deux marquages existe (⏱ Marquer et/ou
//        🎤 Marquer), mêmes seuils que le radio Accords/Paroles/Les 2.
// FEAT (jauge liste) : dot Karaoké désormais "full" (vert vif) si accords ET
//        paroles sont minutés, "partial" (vert intermédiaire) si un seul des
//        deux, sur le même principe que la jauge MP3 complet/partiel —
//        song-gauge.css.
// FIX (overlay karaoké, mode "Les 2") : les lignes purement instrumentales
//        (ex. intro sans paroles) n'avaient aucun repère dans wordKaraokeLines
//        et disparaissaient donc complètement du défilement depuis le passage
//        au pilotage par les mots. _buildMergedTimingLines() fusionne
//        maintenant les repères de mots avec les repères d'accord des lignes
//        SANS aucun mot, pour que ces lignes restent affichées à leur tour.
// FIX (overlay karaoké) : taille de la 3e ligne d'aperçu (next2) ramenée à
//        quasiment la même taille que les autres lignes (0.94em au lieu de
//        0.62em) — seule l'opacité la distingue désormais comme "plus loin".
// FIX (overlay karaoké) : en mode "Les 2", la ligne suivante était annoncée
//        via les repères D'ACCORDS (souvent épars — parfois 1 seul par
//        phrase), ce qui la faisait arriver très en retard par rapport aux
//        mots réellement chantés. Elle est désormais pilotée par le minutage
//        des PAROLES (plus fin) dès qu'il est disponible ; les accords ne
//        servent plus qu'à surligner l'accord actif dans la ligne affichée.
// FEAT (overlay karaoké) : 3e ligne d'aperçu ("next2", sous "next") dans les
//        trois modes karaoké (Accords, Paroles, Les 2), pour donner plus de
//        temps d'anticipation à la lecture avant que chaque phrase ne
//        devienne active — affichage statique et discret, sans perturber
//        l'animation existante de la ligne "next".
// FEAT : système de marquage INDÉPENDANT des paroles, mot par mot — bouton
//        "🎤 Marquer" dans l'éditeur, sur le même principe que "⏱ Marquer"
//        mais totalement séparé : nouveau champ wordTimestamps (vs
//        karaokeTimestamps pour les accords), sans toucher au marquage par
//        accord ni à l'overlay karaoké existants. Prépare une future vue
//        karaoké "chant" dédiée (paroles seules, remplissage mot par mot).
//        Rechargement à l'édition (editSong), réinitialisation à la création
//        d'une nouvelle chanson (clearEditor), et sauvegarde (saveSong) avec
//        le même garde-fou anti-fuite entre chansons que karaokeTimestamps.
// FIX (éditeur) : l'aide-mémoire de durée d'accord insérait un espace entre
//        l'accord et sa durée ("{{Chord}} [1/2]") au lieu du format sans
//        espace utilisé partout ailleurs ("{{Chord}}[1/2]").
// FIX (générateur d'accord) : les frettes réellement jouées sont désormais
//        encodées RELATIVEMENT à la frette de départ (frette réelle −
//        (frette de départ − 1)), comme confirmé par l'usage réel de
//        chords.js — seules les cordes à vide (0) et muettes (-1) restent
//        inchangées.
// FEAT (éditeur) : générateur de diagramme d'accord (bouton "🎸 Accord") —
//        diagramme cliquable (case = pose la frette, O/X = corde
//        estompée/muette) qui génère le code au format
//        "Nom": [baseFret, [f1..f6]] à coller dans chords.js. Convention :
//        0 = à vide, -1 = muette, sinon numéro de frette absolu — à vérifier
//        avec un accord connu, chords.js n'étant pas accessible ici pour
//        confirmer la convention exacte attendue par son analyseur.
// FEAT (éditeur) : boutons d'insertion rrrr[]/ssss[] (Refrain/Solo), sur le
//        même principe que vvvv[]/pppp[] déjà existants ; + icône mémo 📌
//        (tooltip natif au survol, aucune place prise) rappelant la règle de
//        dédoublonnage par type des PDF "Accords" (vvvv/pppp uniquement).
// FIX (generateStandardPDF) : bug d'intégrité important — une section rendue
//        seule (mono, sans partenaire de paire) pouvait quand même se
//        retrouver coupée à cheval sur deux pages (ses premières lignes sur
//        une page, la fin sur la suivante, sans nouvel en-tête). Seules les
//        paires et l'auto-split réservaient leur hauteur à l'avance ; c'est
//        maintenant le cas pour TOUTE section rendue seule.
// FIX (generateStandardPDF) : les balises <link rel="imageN"/"KVideo"
//        href="..."> (post-its image/vidéo de l'éditeur) n'étaient filtrées
//        nulle part dans ce générateur PDF et s'imprimaient telles quelles
//        comme texte brut dans la page — elles sont désormais ignorées,
//        comme en mode défilement.
// FEAT (generateStandardPDF) : sections instrumentales courtes (Intro, Pont
//        composé d'une grille + "puis"/"× N"...) affichées sur une seule
//        ligne, nom + grille d'accords côte à côte dans le même cartouche,
//        au lieu d'un cartouche suivi d'une grille séparée en dessous —
//        gain de place notable, et ça libère de l'espace pour les sections
//        suivantes (évite par exemple qu'un Couplet 2 ne finisse par
//        déborder sur la page suivante juste à cause d'une intro trop
//        haute).
// FEAT (generateStandardPDF) : une section à paroles seule (sans partenaire
//        de paire) qui menace de forcer un saut de page peut désormais se
//        scinder elle-même en 2 colonnes internes — dernier recours, choisi
//        seulement quand ça évite réellement le saut de page, et seulement
//        si ses lignes tiennent en demi-largeur sans réduire la police.
//        La coupure tombe toujours ENTRE deux lignes, jamais au milieu de
//        l'une d'elles.
// FEAT (generateStandardPDF) : l'appariement en double colonne n'est plus un
//        simple scan glouton "sections adjacentes" — une analyse préalable
//        (programmation dynamique sur la chaîne des sections) choisit
//        l'arrangement qui maximise la place gagnée sur toute la chanson,
//        avec un critère d'équilibre de hauteur (la plus petite section d'une
//        paire doit faire au moins 55% de la plus grande). Corrige le cas
//        d'une courte intro appariée par défaut avec le couplet suivant (au
//        détriment d'un appariement bien plus pertinent, ex. Couplet 1 +
//        Couplet 2) : l'intro reste désormais seule sur sa ligne, et les
//        couplets/refrains de taille comparable s'apparient entre eux.
// FEAT (generateStandardPDF) : double colonne repensée en "paires de sections"
//        — deux sections ADJACENTES (couplet+couplet, refrain+couplet, etc.)
//        sont placées côte à côte UNIQUEMENT si chacune, prise individuel-
//        lement, tient en demi-largeur sans réduire sa police et reste sous
//        une hauteur raisonnable ; sinon chaque section garde son rendu
//        pleine largeur habituel. Remplace l'ancien mode "document entier en
//        deux colonnes" de la version précédente. Une section n'est jamais
//        coupée entre les deux colonnes d'une paire.
// FIX : suppression de la mention "Version finale différente" dans les
//        cartouches d'en-tête — elle s'affichait dès qu'un couplet/refrain de
//        même nom avait des paroles différentes, ce qui est le cas quasi
//        systématique et n'apportait donc aucune information utile.
// FEAT (generateStandardPDF) : mise en page à deux colonnes réintroduite, mais
//        seulement quand elle est réellement viable — on ne l'active que si
//        AUCUNE ligne de parole ne nécessiterait de réduire sa taille de
//        police pour tenir en demi-largeur (sinon : mono-colonne, comme avant
//        cette version). Une section (couplet, refrain, pont...) n'est jamais
//        coupée entre deux colonnes : sa hauteur totale est estimée à l'avance
//        et, si besoin, le rendu bascule à la colonne/page suivante AVANT de
//        commencer à la dessiner. Séparateur vertical discret entre les deux
//        colonnes quand ce mode est actif.
// FIX (generateStandardPDF) : artiste replacé à côté du titre ; mesure (ex.
//        "8/8") qui s'affichait en double supprimée (vraie icône vectorielle
//        dédiée à la place) ; trait sous les caractéristiques qui traversait
//        l'encadré Légende raccourci ; note "Version finale différente"
//        fusionnée dans le cartouche d'en-tête au lieu d'un encart séparé qui
//        répétait le nom de section ; sections sans paroles (Intro, ponts
//        instrumentaux) qui affichaient à tort "(suite)"/nom répété en carte
//        latérale décentrée (cause : annotations "puis"/"× 2" comptées comme
//        des paroles) ; suppression des découpages en double colonne
//        (aperçu couplet + sections longues) au profit d'un rendu mono-colonne
//        avec interlignes resserrées ; fond de surlignage des paroles qui
//        mordait sur les accords juste au-dessus ; symbole ♪ non supporté par
//        la police PDF standard remplacé par du texte ASCII dans le BPM.
// FIX : la ligne d'outils (.song-toolbar-row) réserve désormais de l'espace à
//        droite pour ne plus passer sous le module Métronome flottant
//        (position:absolute en haut à droite de .song-main).
// FEAT : ligne d'outils harmonisée sous le titre du display chanson —
//        contrôles (🎹 Piano, ⛶ plein écran) / étiquette 4 caractéristiques /
//        légende couleurs, répartis gauche-centre-droite sur une seule ligne,
//        taille de police unifiée à 14px (référence : la case "Piano").
// FEAT : étiquette regroupant Capo / Tonalité / BPM / Mesure sous le titre du
//        display chanson (_renderSongInfoBadge) — n'affiche que les champs
//        réellement renseignés, disparaît entièrement si aucun n'est présent.
// FEAT : durée [2/2] (accord tenu sur 2 mesures) — badge vert foncé dédié
//        (.chord-dur-double) dans le display des paroles, plus intense que le
//        [1/1] existant ; bouton "2/2" ajouté à l'aide-mémoire de l'éditeur.
// FIX : saveSong() recopiait les repères karaoké (karaokeTimestamps) de la
//        dernière chanson consultée dans une NOUVELLE chanson lorsque
//        currentSong n'avait pas été réinitialisé (ex : après avoir ouvert une
//        chanson puis cliqué "Nouvelle Chanson"). Le garde-fou compare
//        désormais editingFile au filename de currentSong avant de réutiliser
//        ses repères.
// FIX : clearEditor()/newSong() réinitialisent maintenant complètement l'état
//        (currentSong, editingFile, et les champs bpm / recommendedCapo qui
//        restaient affichés d'une chanson précédente) pour repartir d'une
//        nouvelle chanson totalement vierge. Bouton "Nouvelle Chanson" routé
//        via App.newSong() au lieu de App.showTab(1) brut.
// FIX : jauge liste — le dot Karaoké n'affiche vert plein que si des repères
//        ET un MP3 sont disponibles (karaoké-sync réellement jouable) ; s'il y
//        a des repères sans MP3, état "warn" orange (.sg-dot--warn) plutôt que
//        vert trompeur.
// app.js — v40
// FEAT : jauge MP3 — état "partiel" (N + Bch uniquement) coloré en bleu clair
//        intermédiaire, distinct du bleu vif "complet" (4 pistes).
// CONFIRMÉ : le plein écran éditeur cible #editor-container (éditeur + aperçu côte
//            à côte), utile pour voir l'aperçu pendant le marquage ⏱⚡ automatique.
// FIX : bulle "Durée" (accords éditeur) et tooltip post-it (display chanson)
//        invisibles en plein écran natif — ré-attachées dynamiquement à l'élément
//        en plein écran (document.fullscreenElement) au lieu de document.body,
//        qui n'est pas rendu par l'API Fullscreen pendant qu'un autre élément
//        est en plein écran.
// FEAT : badges d'accords (display chanson + scroll) colorés selon leur durée —
//        [1/1] dense, [1/2] estompé, [1/4] clair, autres [x/y] pâle, sans durée :
//        couleur distincte (ambre). Nécessitait que formatSongContent transmette
//        les durées intactes à renderLyricsWithBadges (elles étaient supprimées
//        avant l'appel).
// FIX : renderChordsLine (frame accords) n'exige plus que la somme des durées
//        d'une ligne soit un nombre entier de mesures — le reliquat forme un
//        dernier bloc (même incomplet), avec largeur de bloc proportionnelle à
//        la durée réelle plutôt qu'égale entre mesures.
// FEAT : balise [!] "PIVOT" (bouton 📌 dans l'infobulle Durée) — critère explicite
//        et indépendant de la durée pour désigner les accords qui ne doivent JAMAIS
//        être calculés automatiquement par ⏱⚡ (changements de rythme, rubato...).
// FEAT : marquage karaoké automatique (⏱⚡) basé sur BPM + durées [num/den] des
//        accords, avec ancres manuelles pour les changements de rythme. Le
//        marquage conventionnel (⏱ Marquer) reste inchangé, en parallèle.
// FEAT : contrôle MP3 (lecture/pause/stop) accessible depuis la barre d'outils éditeur
// FEAT : surlignage inline **choeur**/++lead++/--mutter--/&&libre&& (pastilles jauge)
// FIX-v3 detectMeasures+extractChords in generateChordsPDF
const App = {
    // Données
    songs: [],
    listSongs: [],
    _allListes: [],   // listes collectées depuis les JSONs chargés

    // ===== ÉTAT KARAOKÉ =====
    karaokeLines: [],       // [{key, lineIndex, chordIndex, chord, time}]
    _karaokeCurrentChordIdx: 0,  // index courant dans la liste des accords pendant le minutage
    karaokeParsedLines: [], // lignes de paroles parsées (texte + accords positionnés)
    karaokeActive: false,
    karaokeViewMode: 'text',  // 'text' (accords texte) ou 'diagram' (diagrammes guitare)
    karaokeRAF: null,
    // ===== FIN ÉTAT KARAOKÉ =====
    currentSong: null,
    originalContent: "", // Contenu original pour la réinitialisation
    notes: ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"],
    currentTransposition: 0, // Suivi du nombre de demi-tons de transposition actuelle

    // Équivalences pour la transposition
    noteEquivalents: {
        'C': { sharp: 'C#', flat: 'B' },
        'C#': { sharp: 'D', flat: 'C' },
        'Db': { sharp: 'D', flat: 'C' },
        'D': { sharp: 'D#', flat: 'Db' },
        'D#': { sharp: 'E', flat: 'D' },
        'Eb': { sharp: 'E', flat: 'D' },
        'E': { sharp: 'F', flat: 'Eb' },
        'F': { sharp: 'F#', flat: 'E' },
        'F#': { sharp: 'G', flat: 'F' },
        'Gb': { sharp: 'G', flat: 'F' },
        'G': { sharp: 'G#', flat: 'F#' },
        'G#': { sharp: 'A', flat: 'G' },
        'Ab': { sharp: 'A', flat: 'G' },
        'A': { sharp: 'A#', flat: 'G#' },
        'A#': { sharp: 'B', flat: 'A' },
        'Bb': { sharp: 'B', flat: 'A' },
        'B': { sharp: 'C', flat: 'A#' }
    },

    // Initialisation
    init() {
        this.loadSongsIndex();
        this.loadListsIndex();
        if (typeof ChordDB !== 'undefined') ChordDB.loadExternal();
        document.getElementById("song-editor").addEventListener("input", () => this.updatePreview());
        // ===== HELPER MESURES =====
        const editorTA = document.getElementById("song-editor");
        if (editorTA) {
            editorTA.addEventListener("click", () => this.chordDurationHelper(editorTA));
            editorTA.addEventListener("keyup",  () => this.chordDurationHelper(editorTA));
        }
        const editor = document.getElementById("editor");
        if (editor) {
            editor.addEventListener("input", () => this.updatePreview());
            editor.addEventListener("keyup", () => this.updatePreview());
        }
        // Préfixe pour le type de piste (ori, bch, bcg, bgu)
            prefix: "", // Valeur par défaut : "Normal"  
        // Suite
            this.initAudioControls(); // Initialiser les contrôles audio
        this.updateKaraokeButtonState(); // Griser le bouton karaoké si pas de MP3
        // Filet de sécurité : sur la toute première chanson ouverte, certains
        // navigateurs bloquent le préchargement silencieux du MP3 (cf.
        // prefetchMp3Duration) tant qu'aucun geste utilisateur n'a eu lieu sur la
        // page — le bouton karaoké restait alors grisé jusqu'à ce qu'on lance le
        // MP3 manuellement. En écoutant 'loadedmetadata' directement sur le
        // lecteur, on rafraîchit l'état du bouton dès que des métadonnées sont
        // réellement disponibles, quel que soit le code qui les a déclenchées
        // (préchargement silencieux OU clic manuel sur ▶).
        const hiddenAudioPlayerEl = document.getElementById('hiddenAudioPlayer');
        if (hiddenAudioPlayerEl) {
            hiddenAudioPlayerEl.addEventListener('loadedmetadata', () => this.updateKaraokeButtonState());
        }

        // Bouton Étude (tuto / kfn)
        const etudeButton = document.getElementById("etudeButton");
        if (etudeButton) {
            etudeButton.addEventListener("click", () => this.openEtude());
        }


        // Écouter les changements des radioboutons
        const trackTypeRadios = document.querySelectorAll('input[name="trackType"]');
        trackTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.updatePrefix());
        });

        // Initialiser le préfixe avec la valeur par défaut
        this.updatePrefix();
            
        // ===== METRONOME INIT =====
        this.metronome = { running:false, beat:0, timerId:null, audioCtx:null, bpm:80, beats:4 };
        // ===== FIN METRONOME INIT =====
        // Désactiver les boutons Auto-Scroll au démarrage
        const toggleButton = document.getElementById("toggleAutoScroll");
        if (toggleButton) {
            toggleButton.disabled = true;
            toggleButton.style.opacity = "0.5";
        }
        const scrollWithMP3Btn = document.getElementById("scrollWithMP3Btn");
        if (scrollWithMP3Btn) {
            scrollWithMP3Btn.disabled = true;
            scrollWithMP3Btn.style.opacity = "0.5";
        }

        // Écouter les changements de BPM
        const bpmInput = document.getElementById("bpm");
        if (bpmInput) {
            bpmInput.addEventListener("change", () => this.updateScrollSpeed());
        }

        // Initialiser le bouton PDF
        const generatePDFButton = document.getElementById("generatePDFButton");
        if (generatePDFButton) {
            generatePDFButton.addEventListener("click", () => this.generatePDF());
        }

        // Écouter le clic sur le bouton pour ouvrir les fichier Multimédia
        
        const openMP3Button = document.getElementById("openMP3Button"); // 1. Récupère l'élément HTML avec l'ID "openMP3Button"
        if (openMP3Button) {
            openMP3Button.addEventListener("click", () => this.openMP3File());
        } // 2. Vérifie qu'il existe & // 3. Attache un écouteur d'événement pour le clic

        const openGPButton = document.getElementById("openGPButton"); // 1. Récupère l'élément HTML avec l'ID "openGPButton"
        if (openGPButton) {
            openGPButton.addEventListener("click", () => this.openGPFile());
        } // 2. Vérifie qu'il existe & // 3. Attache un écouteur d'événement pour le clic

        const openMP4Button = document.getElementById("openMP4Button"); // 1. Récupère l'élément HTML avec l'ID "openMP4Button"
        if (openMP4Button) {
            openMP4Button.addEventListener("click", () => this.openMP4File());
        } // 2. Vérifie qu'il existe & // 3. Attache un écouteur d'événement pour le clic

        const openPDFButton = document.getElementById("openPDFButton"); // 1. Récupère l'élément HTML avec l'ID "openPDFButton"
        if (openPDFButton) {
            openPDFButton.addEventListener("click", () => this.openPDFFile());
        } // 2. Vérifie qu'il existe & // 3. Attache un écouteur d'événement pour le clic


        // Écouter le clic sur les boutons Auto-Scroll
        if (toggleButton) {
            toggleButton.addEventListener("click", () => this.toggleAutoScroll());
        }
        if (scrollWithMP3Btn) {
            scrollWithMP3Btn.addEventListener("click", () => this.toggleScrollWithMP3());
        }

        // Écouter le toggle pour afficher/masquer les accords
        const chordsToggle = document.getElementById("showChordsToggle");
        if (chordsToggle) {
            chordsToggle.addEventListener("change", () => this.toggleChordsVisibility());
        }

        // Écouter le toggle pour afficher/masquer le panneau des accords
        const chordsPanelToggle = document.getElementById("showChordsPanelToggle");
        if (chordsPanelToggle) {
            chordsPanelToggle.addEventListener("change", () => this.toggleChordsPanel());
        }

        // Case "Plein écran" de la frame accords (voir toggleChordsFullscreen)
        // Plein écran paroles : l'ajustement à la page dépend des dimensions de la zone (voir _fitLyricsFullscreen)
        const refitLyrics = () => {
            clearTimeout(this._lyricsFitTimer);
            this._lyricsFitTimer = setTimeout(() => this._fitLyricsFullscreen(true), 100);
        };
        window.addEventListener('resize', refitLyrics);
        document.addEventListener('fullscreenchange', refitLyrics);
        document.addEventListener('webkitfullscreenchange', refitLyrics);
        const chordsFsToggle = document.getElementById("chords-fullscreen-toggle");
        if (chordsFsToggle) {
            chordsFsToggle.addEventListener("change", () => this.toggleChordsFullscreen(chordsFsToggle.checked));
        }

        // Repositionner les post-it image si la fenêtre est redimensionnée (le texte
        // peut se ré-agencer différemment, ce qui déplace la position des lignes)
        let _postitResizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(_postitResizeTimer);
            _postitResizeTimer = setTimeout(() => { if (this.currentSong) this._renderPostits(); }, 150);
        });

    },

    // Charger l'index des chansons
    async loadSongsIndex() {
        try {
            const response = await fetch('data/songs-index.json?' + Date.now());
            this.songs = await response.json();
            // Charger les champs 'liste' depuis chaque JSON chanson en parallèle
            await this._loadListesFromSongs();
            this.displaySongs(this.songs);
            // Rafraîchir l'onglet Listes maintenant que song._liste est disponible
            // (loadListsIndex() a pu être appelé trop tôt depuis init(), avant que
            // this.songs / _allListes ne soient prêts)
            this.loadListsIndex();
        } catch (e) {
            this.showError("Impossible de charger l'index des chansons.");
        }
    },

    // Charge le champ 'liste' de chaque chanson et met à jour le dropdown filtre
    async _loadListesFromSongs() {
        const listesSet = new Set();
        // On charge les JSONs en parallèle (max 8 à la fois)
        const queue = [...this.songs];
        const MAX = 8;
        let running = 0;
        await new Promise(resolve => {
            if (!queue.length) { resolve(); return; }
            const next = () => {
                while (running < MAX && queue.length) {
                    const song = queue.shift();
                    running++;
                    fetch(`songs/${song.file}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => {
                            if (data && data.liste) {
                                data.liste.split(',').map(l => l.trim()).filter(Boolean)
                                    .forEach(l => listesSet.add(l));
                            }
                            // Stocker dans le song de l'index pour le filtrage / l'affichage
                            if (data && data.liste) song._liste = data.liste;
                            if (data) song.ok = !!data.ok;
                        })
                        .catch(() => {})
                        .finally(() => { running--; if (!queue.length && running === 0) resolve(); else next(); });
                }
            };
            next();
        });
        this._allListes = [...listesSet].sort((a, b) => a.localeCompare(b));
        this._populateListeFilter();
        this._populateListeAutocomplete();
    },

    // Remplit les dropdowns filtre (accueil + onglet listes) avec les listes connues
    _populateListeFilter() {
        ['liste-filter', 'list-liste-filter'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const current = sel.value;
            sel.innerHTML = '<option value="">— Toutes les listes —</option>';
            this._allListes.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l; opt.textContent = l;
                if (l === current) opt.selected = true;
                sel.appendChild(opt);
            });
        });
    },

    // Autocomplétion du champ liste dans l'éditeur
    _populateListeAutocomplete() {
        // Rien à faire ici — les suggestions sont rendues à la saisie
    },

    _listeSuggest(value) {
        const box = document.getElementById('liste-suggestions');
        if (!box) return;
        // Dernière valeur après la dernière virgule
        const parts = value.split(',');
        const current = parts[parts.length - 1].trim().toLowerCase();
        if (!current) { box.style.display = 'none'; return; }
        const matches = this._allListes.filter(l =>
            l.toLowerCase().includes(current) &&
            !parts.slice(0, -1).map(p => p.trim()).includes(l)
        );
        if (!matches.length) { box.style.display = 'none'; return; }
        box.innerHTML = matches.map(l =>
            `<div style="padding:7px 12px;cursor:pointer;font-size:13px;
                         border-bottom:1px solid #eef2f7;transition:background 0.1s;"
                 onmousedown="App._listePick('${l.replace(/'/g,"\'")}', this)"
                 onmouseenter="this.style.background='#e8eef7'"
                 onmouseleave="this.style.background=''">${l}</div>`
        ).join('');
        box.style.display = 'block';
    },

    _listePick(value, el) {
        const input = document.getElementById('song-liste');
        if (!input) return;
        const parts = input.value.split(',').map(p => p.trim()).filter(Boolean);
        parts[parts.length - 1] = value; // remplacer la dernière entrée partielle
        // Ajouter une virgule après pour inviter à la prochaine saisie
        input.value = parts.join(', ') + ', ';
        document.getElementById('liste-suggestions').style.display = 'none';
        input.focus();
    },

    _listeSuggestClose() {
        const box = document.getElementById('liste-suggestions');
        if (box) box.style.display = 'none';
    },

    // ===== JAUGES MÉDIAS DANS LA LISTE =====

    // Palier de couleur "chaleur" du badge d'ouvertures : un pas tous les 5
    // (0-4 neutre, 5-9, 10-14, ... jusqu'à 35+ qui plafonne au rouge le plus
    // chaud — au-delà, on n'invente pas de nouveau palier, la couleur la plus
    // chaude suffit à signaler "chanson très répétée"). Voir les 8 classes
    // .song-open-count--0 à --7 dans style.css pour les couleurs elles-mêmes.
    _openCountTier(count) {
        return Math.min(Math.floor(count / 5), 7);
    },

    _buildSongGaugeHTML(filename) {
        const dots = [
            { key: 'mp3',     label: 'MP3',        icon: '♪'  },
            { key: 'mp4',     label: 'MP4',         icon: '▶︎'  },
            { key: 'pdf',     label: 'PDF',         icon: '⊞'  },
            { key: 'gp',      label: 'Guitar Pro',  icon: '𝄢'  },
            { key: 'etude',   label: 'Étude',       icon: '⏵'  },
            { key: 'karaoke', label: 'Karaoké',     icon: '🎤' },
        ];
        // Compteur d'ouvertures (ce navigateur uniquement, voir _incrementOpenCount)
        // — affiché uniquement s'il y a au moins une ouverture, pour ne pas polluer
        // la liste de badges "0" sur toutes les chansons jamais consultées. Couleur
        // progressive vers le chaud selon _openCountTier ; largeur prévue en CSS
        // pour un compteur à 4 chiffres (jusqu'à 9999) sans déformer la ligne.
        const openCount = this._getOpenCount(filename);
        const openCountHtml = openCount > 0
            ? `<span class="song-open-count song-open-count--${this._openCountTier(openCount)}" title="Ouverte ${openCount} fois sur ce navigateur">🔁 ${openCount}</span>`
            : '';
        return `${openCountHtml}<span class="song-gauge">${
            dots.map(d =>
                `<span class="sg-dot sg-dot--unknown" data-type="${d.key}" title="${d.label}">${d.icon}</span>`
            ).join('')
        }</span>`;
    },

    _applySongGauge(item, status) {
        item.querySelectorAll('.sg-dot').forEach(dot => {
            const present = !!status[dot.dataset.type];
            dot.classList.remove('sg-dot--unknown', 'sg-dot--on', 'sg-dot--off', 'sg-dot--full', 'sg-dot--partial', 'sg-dot--warn');
            dot.classList.add(present ? 'sg-dot--on' : 'sg-dot--off');
            // Bleu plus vif sur le point MP3 quand les 4 pistes (N/bch/bcg/bgu) existent,
            // bleu un peu plus clair quand seules l'originale (N) et Bch existent.
            if (dot.dataset.type === 'mp3' && status.mp3Full) {
                dot.classList.add('sg-dot--full');
            } else if (dot.dataset.type === 'mp3' && status.mp3Partial) {
                dot.classList.add('sg-dot--partial');
            }
            // Karaoké : vert plein ("full") si accords ET paroles sont minutés, vert
            // intermédiaire ("partial") si un seul des deux. Des repères existent mais
            // sans MP3 associé : le karaoké-sync ne peut pas réellement se lancer →
            // état "warn" (orange) au lieu de vert. Voir _loadSongMediaStatus.
            if (dot.dataset.type === 'karaoke') {
                if (status.karaokeNoMp3) {
                    dot.classList.remove('sg-dot--off');
                    dot.classList.add('sg-dot--warn');
                    dot.title = 'Repères karaoké présents mais MP3 manquant';
                } else if (status.karaokeFull) {
                    dot.classList.add('sg-dot--full');
                    dot.title = 'Karaoké prêt — accords et paroles minutés';
                } else if (status.karaokePartial) {
                    dot.classList.add('sg-dot--partial');
                    dot.title = status._hasKaraokeTimestamps
                        ? 'Karaoké prêt — accords minutés seulement'
                        : 'Karaoké prêt — paroles minutées seulement';
                }
            }
        });
    },

    async _loadSongMediaStatus(file) {
        if (!this._songMediaCache) this._songMediaCache = {};
        if (this._songMediaCache[file]) return this._songMediaCache[file];
        const status = {
            mp3: false, mp3Full: false, mp3Partial: false, mp4: false, pdf: false, gp: false,
            etude: false, karaoke: false, karaokeNoMp3: false, karaokeFull: false, karaokePartial: false,
            _hasKaraokeTimestamps: false, _hasWordTimestamps: false,
        };
        // Étude & Karaoké → dans le JSON chanson
        try {
            const res = await fetch(`songs/${file}`);
            if (res.ok) {
                const data = await res.json();
                status.etude = !!(data.tuto || data.kfn);
                // On ne fixe pas encore status.karaoke ici : la présence de
                // karaokeTimestamps/wordTimestamps dans le JSON seule ne suffit pas à
                // garantir que le karaoké est réellement jouable (repères orphelins
                // possibles suite à une chanson dupliquée/mal réinitialisée).
                // Le statut final est calculé plus bas, une fois le MP3 vérifié.
                status._hasKaraokeTimestamps = !!(data.karaokeTimestamps && data.karaokeTimestamps.length);
                status._hasWordTimestamps = !!(data.wordTimestamps && data.wordTimestamps.length);
            }
        } catch (_) {}
        // MP3 / PDF / GP → via le serveur Node check-files
        let mp4Checked = false;
        try {
            const res = await fetch(
                `/check-files?song=${encodeURIComponent(file)}`
            );
            if (res.ok) {
                const f = await res.json();
                status.mp3 = !!(f.mp3 || f.mp3bch || f.mp3bcg || f.mp3bgu);
                // Jauge MP3 "pleine" : les 4 pistes (N/bch/bcg/bgu) existent toutes
                status.mp3Full = !!(f.mp3 && f.mp3bch && f.mp3bcg && f.mp3bgu);
                // Jauge MP3 "partielle" : seules l'originale (N) et Bch existent (pas bcg/bgu)
                status.mp3Partial = !status.mp3Full && !!(f.mp3 && f.mp3bch && !f.mp3bcg && !f.mp3bgu);
                status.mp4 = !!(f.mp4 || f.mp4Any);
                // Le serveur a déjà vérifié mp4K/mp4 et .mp4/.m4v : inutile de sonder
                mp4Checked = (f.mp4Any !== undefined);
                status.pdf = !!f.pdf;
                status.gp  = !!f.gp;
            }
        } catch (_) {}
        // Statut final du dot Karaoké : vert UNIQUEMENT si au moins un des deux
        // marquages (accords et/ou paroles) existe ET qu'un MP3 est disponible
        // (karaoké-sync réellement jouable) — vert plein ("full") si les DEUX
        // marquages sont présents, vert intermédiaire ("partial") si un seul des
        // deux. S'il y a des repères mais aucun MP3, le dot passe en état "warn"
        // (orange) au lieu de vert, plutôt que de laisser croire que le karaoké
        // est prêt à être lancé.
        const hasAnyMarking = status._hasKaraokeTimestamps || status._hasWordTimestamps;
        status.karaoke = hasAnyMarking && status.mp3;
        status.karaokeNoMp3 = hasAnyMarking && !status.mp3;
        status.karaokeFull = status._hasKaraokeTimestamps && status._hasWordTimestamps && status.mp3;
        status.karaokePartial = status.karaoke && !status.karaokeFull;
        // MP4 : vérification complémentaire côté client. Considéré présent si le
        // fichier basefilename.mp4 OU basefilename.m4v existe dans
        // songs/multimedia/mp4K OU songs/multimedia/mp4 (le serveur check-files
        // peut ne pas couvrir tous ces cas).
        if (!status.mp4 && !mp4Checked) {
            const base = file.replace('.json', '');
            status.mp4 = await this._probeMp4Exists(base);
        }
        this._songMediaCache[file] = status;
        return status;
    },

    // Sonde l'existence d'un MP4 pour une chanson en testant les emplacements/
    // extensions possibles (s'arrête au premier trouvé). Utilise HEAD pour ne pas
    // télécharger le fichier, juste vérifier sa présence.
    async _probeMp4Exists(base) {
        const candidates = [
            `songs/multimedia/mp4K/${base}.mp4`,
            `songs/multimedia/mp4K/${base}.m4v`,
            `songs/multimedia/mp4/${base}.mp4`,
            `songs/multimedia/mp4/${base}.m4v`,
        ];
        for (const url of candidates) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res.ok) return true;
            } catch (_) { /* candidat suivant */ }
        }
        return false;
    },

    // File throttlée (sans IntersectionObserver — plus fiable dans un conteneur scrollable interne)
    _loadSongGauges(container) {
        const items = [...container.querySelectorAll('.song-item[data-song-file]')];
        if (!items.length) return;
        const queue = [...items];
        let running = 0;
        const MAX = 4;
        const next = () => {
            while (running < MAX && queue.length) {
                const item = queue.shift();
                running++;
                this._loadSongMediaStatus(item.dataset.songFile).then(status => {
                    this._applySongGauge(item, status);
                    running--;
                    next();
                });
            }
        };
        next();
    },

    // ===== FIN JAUGES MÉDIAS =====

    // Charger l'onglet Listes depuis les données déjà en mémoire (this.songs + song._liste)
    // Plus besoin de liste-index.json
    async loadListsIndex() {
        // Les données sont déjà dans this.songs après loadSongsIndex()
        // On attend que _loadListesFromSongs ait fini si nécessaire
        this._populateListeListFilter();
        this.displayLists(this.songs);
    },

    // Remplit le dropdown filtre de l'onglet Listes
    _populateListeListFilter() {
        const sel = document.getElementById('list-liste-filter');
        if (!sel) return;
        const current = sel.value;
        sel.innerHTML = '<option value="">— Toutes les listes —</option>';
        this._allListes.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l; opt.textContent = l;
            if (l === current) opt.selected = true;
            sel.appendChild(opt);
        });
    },

    // Rechercher dans l'onglet Listes (texte + filtre liste)
    searchLists() {
        const term  = (document.getElementById("list-search-input")?.value || '').toLowerCase();
        const liste = (document.getElementById("list-liste-filter")?.value || '').trim();
        const filtered = this.songs.filter(song => {
            const matchText = !term ||
                song.title.toLowerCase().includes(term) ||
                song.artist.toLowerCase().includes(term);
            const matchListe = !liste || (song._liste || '').split(',')
                .map(l => l.trim()).includes(liste);
            return matchText && matchListe;
        });
        this.displayLists(filtered);
    },

    // Afficher les chansons de l'onglet Listes groupées par LISTE (champ song._liste)
    // Une chanson appartenant à plusieurs listes (séparées par des virgules) apparaît
    // dans chacun des blocs correspondants.
    // Couleurs spécifiques : liste 'cover' → teinte chaude, liste 'tri matelots' → teinte marine.
    displayLists(songs) {
        const songList = document.getElementById("list-song-list");
        if (!songList) return;
        songList.innerHTML = "";

        if (!songs || songs.length === 0) {
            songList.innerHTML = '<li class="no-results">Aucune chanson trouvée.</li>';
            return;
        }

        const SANS_LISTE = "Sans liste";
        const grouped = {};
        songs.forEach(song => {
            const listes = (song._liste || '').split(',').map(l => l.trim()).filter(Boolean);
            if (!listes.length) {
                (grouped[SANS_LISTE] = grouped[SANS_LISTE] || []).push(song);
            } else {
                listes.forEach(l => (grouped[l] = grouped[l] || []).push(song));
            }
        });

        // Tri alphabétique des listes, "Sans liste" toujours affiché en dernier
        const listeNames = Object.keys(grouped)
            .filter(l => l !== SANS_LISTE)
            .sort((a, b) => a.localeCompare(b));
        if (grouped[SANS_LISTE]) listeNames.push(SANS_LISTE);

        const grid = document.createElement("div");
        grid.className = "songs-grid";

        listeNames.forEach(listeName => {
            const lower = listeName.toLowerCase();
            const isCover    = lower.startsWith('cover');
            const isTrimat   = lower.startsWith('tri matelots');
            const isAcoustic = lower.startsWith('accoustique phil');

            const block = document.createElement("div");
            block.className = "artist-block" +
                (isCover ? " artist-block--cover" : "") +
                (isTrimat ? " artist-block--trimat" : "") +
                (isAcoustic ? " artist-block--acoustic" : "");

            const header = document.createElement("div");
            header.className = "artist-header" +
                (isCover ? " artist-header--cover" : "") +
                (isTrimat ? " artist-header--trimat" : "") +
                (isAcoustic ? " artist-header--acoustic" : "");
            header.textContent = listeName;
            block.appendChild(header);

            // Chansons triées par artiste puis titre à l'intérieur de chaque liste
            const sortedSongs = [...grouped[listeName]].sort((a, b) =>
                (a.artist || '').localeCompare(b.artist || '') ||
                (a.title  || '').localeCompare(b.title  || '')
            );

            sortedSongs.forEach(song => {
                const item = document.createElement("div");
                item.className = "song-item" + (song.ok ? " song-item--ok" : "");
                item.dataset.songFile = song.file;

                const titleSpan = document.createElement("span");
                titleSpan.className = "song-title-text";
                titleSpan.textContent = song.artist
                    ? `${song.title} — ${song.artist}`
                    : song.title;
                item.appendChild(titleSpan);

                if (song.capo && song.capo !== "0") {
                    const capo = document.createElement("span");
                    capo.className = "song-capo";
                    capo.textContent = " capo " + song.capo;
                    item.appendChild(capo);
                }

                item.insertAdjacentHTML('beforeend', this._buildSongGaugeHTML(song.file));
                item.onclick = () => { this._lastTab = 2; this.loadSong(song.file); };
                block.appendChild(item);
            });

            grid.appendChild(block);
        });

        songList.appendChild(grid);
        this._loadSongGauges(grid);
    },

    // Afficher la liste des chansons groupées par artiste en 3 colonnes
    displaySongs(songs) {
        const songList = document.getElementById("song-list");
        songList.innerHTML = "";

        if (songs.length === 0) {
            songList.innerHTML = '<li class="no-results">Aucune chanson trouvée.</li>';
            return;
        }

        // Grouper les chansons par artiste (ordre alphabétique)
        const grouped = songs.reduce((acc, song) => {
            const artist = song.artist || "Inconnu";
            if (!acc[artist]) acc[artist] = [];
            acc[artist].push(song);
            return acc;
        }, {});

        const artists = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

        // Conteneur 3 colonnes
        const grid = document.createElement("div");
        grid.className = "songs-grid";

        artists.forEach(artist => {
            const isCover = artist.toLowerCase().startsWith('cover');
            const block = document.createElement("div");
            block.className = "artist-block" + (isCover ? " artist-block--cover" : "");

            const header = document.createElement("div");
            header.className = "artist-header" + (isCover ? " artist-header--cover" : "");
            header.textContent = artist;
            block.appendChild(header);

            grouped[artist].forEach(song => {
                const item = document.createElement("div");
                item.className = "song-item";
                item.dataset.songFile = song.file;
                const titleSpan = document.createElement("span");
                titleSpan.className = "song-title-text";
                titleSpan.textContent = song.title;
                item.appendChild(titleSpan);
                if (song.capo && song.capo !== "0") {
                    const capo = document.createElement("span");
                    capo.className = "song-capo";
                    capo.textContent = " capo " + song.capo;
                    item.appendChild(capo);
                }
                item.insertAdjacentHTML('beforeend', this._buildSongGaugeHTML(song.file));
                item.onclick = () => { this._lastTab = 0; this.loadSong(song.file); };
                block.appendChild(item);
            });

            grid.appendChild(block);
        });

        songList.appendChild(grid);
        this._loadSongGauges(grid);
    },

    // Rechercher des chansons (filtre texte + liste)
    searchSongs() {
        const term  = (document.getElementById("search-input")?.value || '').toLowerCase();
        const liste = (document.getElementById("liste-filter")?.value || '').trim();
        const filteredSongs = this.songs.filter(song => {
            const matchText = !term ||
                song.title.toLowerCase().includes(term) ||
                song.artist.toLowerCase().includes(term);
            const matchListe = !liste || (song._liste || '').split(',')
                .map(l => l.trim()).includes(liste);
            return matchText && matchListe;
        });
        this.displaySongs(filteredSongs);
    },

    // Charger une chanson
    // ===== COMPTEUR D'OUVERTURES (par navigateur) =====
    // Suivi purement local (localStorage) du nombre de fois où chaque chanson a
    // été ouverte DEPUIS CE NAVIGATEUR — permet d'apprécier au fil du temps le
    // travail de répétition du groupe. Ce n'est PAS partagé entre les membres du
    // groupe ni entre appareils : l'app étant un site statique (voir saveSong,
    // qui déclenche un téléchargement manuel plutôt qu'un enregistrement serveur),
    // un compteur réellement partagé demanderait un petit service côté serveur.
    _getOpenCounts() {
        try {
            return JSON.parse(localStorage.getItem('songOpenCounts') || '{}');
        } catch (_) {
            return {};
        }
    },

    _getOpenCount(filename) {
        if (!filename) return 0;
        return this._getOpenCounts()[filename] || 0;
    },

    _incrementOpenCount(filename) {
        if (!filename) return 0;
        const counts = this._getOpenCounts();
        counts[filename] = (counts[filename] || 0) + 1;
        try { localStorage.setItem('songOpenCounts', JSON.stringify(counts)); } catch (_) { /* stockage plein ou indisponible : on continue sans compteur */ }
        return counts[filename];
    },

    // Remise à zéro du compteur d'ouvertures pour une chanson — appelée quand la
    // case 'OK' est décochée à l'enregistrement (voir saveSong) : la chanson
    // repart en phase de mise au point, ses ouvertures passées ne doivent plus
    // compter si elle est un jour re-marquée 'OK'.
    _resetOpenCount(filename) {
        if (!filename) return;
        const counts = this._getOpenCounts();
        if (!(filename in counts)) return; // déjà à zéro (ou jamais compté) : rien à faire
        delete counts[filename];
        try { localStorage.setItem('songOpenCounts', JSON.stringify(counts)); } catch (_) { /* stockage plein ou indisponible */ }
    },

    loadSong: async function(filename) {
        try {
            // Arrêter l'auto-scroll si une chanson est déjà en cours de lecture
            if (this.isAutoScrolling) {
               this.toggleAutoScroll(); // Cela arrêtera l'auto-scroll
            }

            const res = await fetch(`songs/${filename}`);
            if (!res.ok) throw new Error("Fichier non trouvé");
            this.currentSong = await res.json();
            this.originalContent = this.currentSong.content; // Sauvegarder l'original
            this.currentTransposition = 0; // Réinitialiser la transposition
            this._updateTransposeResetLabel();
            this.currentSong.content = this.originalContent; // Afficher l'original
            this.currentSong.filename = filename; // Stocker le nom du fichier
            // Compteur d'ouvertures (ce navigateur, voir plus haut) — ne compte QUE
            // les chansons déjà marquées 'OK' dans l'éditeur (outils réunis) : les
            // ouvertures pendant la mise au point (répétitions, ajustements du
            // marquage, essais…) ne doivent pas gonfler artificiellement le chiffre.
            if (this.currentSong.ok) {
                this._incrementOpenCount(filename);
            }
                    // Charger les valeurs des champs
            document.getElementById("capo").value = this.currentSong.capo || "";
            document.getElementById("recommendedCapo").value = this.currentSong.recommendedCapo || "";
            document.getElementById("bpm").value = this.currentSong.bpm || "";
            const songKeyEl1 = document.getElementById("song-key");
            if (songKeyEl1) songKeyEl1.value = this.currentSong.key || "";

            // Mettre à jour l'affichage de la vitesse
            document.getElementById("currentScrollSpeed").textContent = this.currentSong.bpm || this.defaultBPM;

            // Activer les boutons Auto-Scroll
            const toggleButton = document.getElementById("toggleAutoScroll");
            if (toggleButton) {
                toggleButton.disabled = false;
                toggleButton.style.opacity = "1";
            }
            const scrollWithMP3BtnLoad = document.getElementById("scrollWithMP3Btn");
            if (scrollWithMP3BtnLoad) {
                scrollWithMP3BtnLoad.disabled = false;
                scrollWithMP3BtnLoad.style.opacity = "1";
            }

            this.displaySong();
            // ===== PREFETCH MP3 DURATION =====
            this.mp3Duration = 0;
            // Nouvelle chanson : on ne peut plus faire confiance à l'ancien MP3 déjà
            // chargé dans le lecteur (celui de la chanson précédente, potentiellement
            // en pause) — voir _ensureCorrectMp3().
            this._loadedMp3Key = null;
            // Repartir sur une vitesse normale : éviter qu'un MP3 ralenti pour la
            // chanson précédente ne reste silencieusement appliqué à celle-ci.
            const audioPlayerForSpeed = document.getElementById('hiddenAudioPlayer');
            if (audioPlayerForSpeed) audioPlayerForSpeed.playbackRate = 1;
            const speedSelectReset = document.getElementById('mp3SpeedSelect');
            if (speedSelectReset) speedSelectReset.value = '1';
            this.prefetchMp3Duration(filename);
        } catch (e) {
            this.showError(`Impossible de charger la chanson : ${filename}`);
        }
    },

    // ===== PREFETCH MP3 DURATION =====
    prefetchMp3Duration: function(filename) {
        const base = filename.replace('.json', '');
        const allCandidates = {
            '':    `/songs/multimedia/mp3/${base}.mp3`,
            'bch': `/songs/multimedia/mp3/bch/Bch${base}.mp3`,
            'bcg': `/songs/multimedia/mp3/bcg/Bcg${base}.mp3`,
            'bgu': `/songs/multimedia/mp3/bgu/Bgu${base}.mp3`,
        };
        // La piste actuellement sélectionnée (N/bch/bcg/bgu) est essayée en premier ;
        // les autres ne servent que de repli si elle n'existe pas pour cette chanson.
        const order = [this.prefix, '', 'bch', 'bcg', 'bgu'].filter((v, i, a) => a.indexOf(v) === i);
        const candidates = order.map(p => allCandidates[p]).filter(Boolean);
        const candidatePrefixes = order.filter(p => allCandidates[p]);

        const tryNext = (index) => {
            if (index >= candidates.length) return;
            const probe = new Audio(); probe.preload = 'metadata';
            probe.addEventListener('loadedmetadata', () => {
                if (probe.duration && isFinite(probe.duration) && probe.duration > 0) {
                    this.mp3Duration = probe.duration;
                    const min = Math.floor(probe.duration / 60);
                    const sec = Math.floor(probe.duration % 60).toString().padStart(2, '0');
                    const el = document.getElementById("currentScrollSpeed");
                    if (el) el.textContent = `${min}:${sec}`;

                    // Charger silencieusement le MP3 dans le player principal
                    // (sans play) pour que ♪ Scroll et le bouton karaoké soient
                    // immédiatement disponibles sans action manuelle de l'utilisateur.
                    const audioPlayer = document.getElementById('hiddenAudioPlayer');
                    if (audioPlayer && (!audioPlayer.src || audioPlayer.src === window.location.href || audioPlayer.paused)) {
                        audioPlayer.src = candidates[index];
                        audioPlayer.load(); // précharge les métadonnées sans jouer
                        // Mémorise la piste réellement chargée, pour que _ensureCorrectMp3()
                        // sache si un rechargement est nécessaire ou non plus tard.
                        this._loadedMp3Key = this.currentSong ? `${this.currentSong.filename}|${candidatePrefixes[index]}` : null;
                        this.updateKaraokeButtonState();
                    }
                    probe.src = '';
                } else { probe.src = ''; tryNext(index + 1); }
            }, { once: true });
            probe.addEventListener('error', () => { probe.src = ''; tryNext(index + 1); }, { once: true });
            probe.src = candidates[index];
        };
        tryNext(0);
    },
    // ===== FIN PREFETCH MP3 DURATION =====

    // Afficher une chanson
    // Étiquette regroupant Capo / Tonalité / BPM / Mesure sous le titre.
    // N'affiche que les caractéristiques réellement renseignées pour la
    // chanson (pas de "—" pour un champ vide) ; l'étiquette entière disparaît
    // s'il n'y a strictement rien à montrer (cf. .song-info-badge:empty).
    _renderSongInfoBadge() {
        const badge = document.getElementById('song-info-badge');
        if (!badge || !this.currentSong) return;
        const s = this.currentSong;
        const items = [];
        if (s.capo)    items.push({ icon: '🎸', label: 'Capo',     value: s.capo });
        if (s.key)     items.push({ icon: '🎵', label: 'Tonalité', value: s.key });
        if (s.bpm)     items.push({ icon: '♩',  label: 'BPM',      value: s.bpm });
        if (s.timeSig) items.push({ icon: '𝄴',  label: 'Mesure',   value: s.timeSig });
        // Compteur d'ouvertures sur ce navigateur (voir _incrementOpenCount) —
        // toujours >= 1 ici puisque loadSong() vient d'incrémenter avant d'appeler
        // displaySong()/_renderSongInfoBadge().
        const openCount = this._getOpenCount(s.filename);
        if (openCount > 0) {
            items.push({ icon: '🔁', label: `Ouverte ${openCount} fois sur ce navigateur`, value: openCount });
        }
        badge.innerHTML = items.map(it =>
            `<span class="sib-item" title="${it.label}"><span class="sib-icon">${it.icon}</span><span class="sib-value">${it.value}</span></span>`
        ).join('');
    },

    displaySong() {
        document.getElementById("home-tab").style.display = "none";
        document.getElementById("editor-tab").style.display = "none";
        document.getElementById("lists-tab").style.display = "none";
        document.getElementById("song-display").style.display = "block";
        document.getElementById("sidebar").style.display = "block";
        // ===== METRONOME WIDGET =====
        this.renderMetronomeWidget();

        document.getElementById("song-title-display").textContent = `${this.currentSong.title} - ${this.currentSong.artist}`;
        this._renderSongInfoBadge();

        // ===== CASE À COCHER DIAGRAMMES PIANO (au lieu de guitare) =====
        if (!document.getElementById('chord-instrument-toggle')) {
            const controlsLeft = document.getElementById('song-controls-left');
            const label = document.createElement('label');
            label.title = "Afficher les diagrammes d'accords au clavier (piano) plutôt qu'au manche (guitare)";
            label.style.cssText = 'font-size:14px;font-weight:normal;cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:5px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = 'chord-instrument-toggle';
            cb.checked = (typeof ChordDB !== 'undefined') && ChordDB.getInstrument() === 'piano';
            cb.addEventListener('change', () => {
                if (typeof ChordDB !== 'undefined') ChordDB.setInstrument(cb.checked ? 'piano' : 'guitar');
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode('🎹 Piano'));
            if (controlsLeft) controlsLeft.appendChild(label);
        } else {
            // Rester synchro avec la préférence mémorisée si on change de chanson
            const cb = document.getElementById('chord-instrument-toggle');
            if (cb && typeof ChordDB !== 'undefined') cb.checked = ChordDB.getInstrument() === 'piano';
        }
        // ===== FIN CASE À COCHER PIANO =====

        // ===== BOUTON PLEIN ÉCRAN =====
        if (!document.getElementById('btn-fullscreen-lyrics')) {
            const controlsLeft = document.getElementById('song-controls-left');
            const btn = document.createElement('button');
            btn.id = 'btn-fullscreen-lyrics';
            btn.title = 'Plein écran paroles';
            btn.textContent = '⛶';
            btn.style.cssText = 'font-size:16px;line-height:1;background:none;border:none;cursor:pointer;opacity:0.6;display:inline-flex;align-items:center;';
            btn.addEventListener('click', () => this.toggleLyricsFullscreen());
            if (controlsLeft) controlsLeft.appendChild(btn);
        }
        // ===== FIN BOUTON PLEIN ÉCRAN =====

        document.getElementById("song-content-display").innerHTML = this.formatSongContent(this.currentSong.content, { sections: true });
        this._renderRythmDisplay();
        if (typeof ChordDB !== 'undefined') ChordDB.bindAll(document.getElementById("song-content-display"));
        this._fitLyricsFullscreen(true);   // si le plein écran paroles est actif : réajuste à la page
        this._renderPostits();
        document.getElementById("capo").value = this.currentSong.capo || "";
        document.getElementById("recommendedCapo").value = this.currentSong.recommendedCapo || "";
        document.getElementById("bpm").value = this.currentSong.bpm || "";
        const songKeyEl2 = document.getElementById("song-key");
        if (songKeyEl2) songKeyEl2.value = this.currentSong.key || "";

        // ===== SUGGESTION BPM =====
        // Afficher/masquer le bouton 🎯 (défini en dur dans index.html) selon la présence de timestamps
        {
            const bpmSuggestBtn = document.getElementById('btn-bpm-suggest');
            const bpmSuggestTip = document.getElementById('bpm-suggest-tip');
            const hasTs = !!(this.currentSong.karaokeTimestamps && this.currentSong.karaokeTimestamps.length >= 4);
            if (bpmSuggestBtn) bpmSuggestBtn.style.display = hasTs ? 'inline-block' : 'none';
            // Fermer l'éventuel tooltip résiduel d'une chanson précédente
            if (bpmSuggestTip) { bpmSuggestTip.style.display = 'none'; bpmSuggestTip.innerHTML = ''; }
        }
        // ===== FIN SUGGESTION BPM =====

        // ------------chords panel-------------------
        const displayChords = document.getElementById('display-chords');
        const lines = this.currentSong.content.split('\n');
        let chordsHtml = '';

        lines.forEach((line, lineIndex) => {
            const rendered = this.renderChordsLine(line);
            chordsHtml += rendered.replace(/^<div /, `<div data-line-index="${lineIndex}" `);
        });

        // Changement de chanson / re-rendu (transposition…) : on referme d'abord un
        // éventuel plein écran accords, dont le réagencement par sections déplace les
        // lignes de la frame et serait périmé après le remplacement du contenu.
        if (this._chordsFsActive) this._exitChordsFullscreen();
        displayChords.innerHTML = chordsHtml;
    //--------Fin chords panel-----------------------

        // Synchroniser la visibilité du panneau avec l'état de la case à cocher
        const chordsPanelToggle = document.getElementById("showChordsPanelToggle");
        const chordsPanel = document.querySelector(".song-layout .chords-panel");
        if (chordsPanel && chordsPanelToggle) {
            chordsPanel.style.display = chordsPanelToggle.checked ? "block" : "none";
        }

    // Afficher les boutons de transposition et de modification
        document.getElementById("transpose-down").style.display = "block";
        document.getElementById("transpose-up").style.display = "block";
        document.getElementById("transpose-reset").style.display = "block";
        document.getElementById("back-button").style.display = "block";
        document.getElementById("edit-button").style.display = "block";
        document.getElementById("save-button").style.display = "none";
        document.getElementById("clear-button").style.display = "none";

        // Vérifier les fichiers multimédia disponibles
        this.checkMediaFiles();
    },

    // Vérifier l'existence des fichiers multimédia et griser les boutons
    async checkMediaFiles() {
        if (!this.currentSong) return;

        // Réinitialiser tous les boutons comme actifs
        const btns = ['openMP3Button','openGPButton','openMP4Button','openPDFButton','etudeButton'];
        btns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
        });
        document.querySelectorAll('input[name="trackType"]').forEach(r => {
            r.disabled = false;
            r.parentElement.style.opacity = '1';
        });
        document.querySelectorAll('input[name="etudeType"]').forEach(r => {
            r.disabled = false;
            r.parentElement.style.opacity = '1';
        });

        // Vérifier tuto et kfn directement depuis currentSong (pas besoin du serveur)
        const hasTuto = !!this.currentSong.tuto;
        const hasKfn  = !!this.currentSong.kfn;

        document.querySelectorAll('input[name="etudeType"]').forEach(r => {
            const available = r.value === 'tuto' ? hasTuto : hasKfn;
            r.disabled = !available;
            r.parentElement.style.opacity = available ? '1' : '0.35';
            // Si le bouton sélectionné n'est pas disponible, basculer sur l'autre si dispo
            if (!available && r.checked) {
                const other = document.querySelector(`input[name="etudeType"][value="${r.value === 'tuto' ? 'kfn' : 'tuto'}"]`);
                if (other && (r.value === 'tuto' ? hasKfn : hasTuto)) other.checked = true;
            }
        });

        // Griser le bouton Étude si ni tuto ni kfn
        this.setButtonState('etudeButton', hasTuto || hasKfn);

        try {
            const res = await fetch(
                `/check-files?song=${encodeURIComponent(this.currentSong.filename)}`
            );
            if (!res.ok) return;
            const files = await res.json();

            // Bouton MP3 principal
            this.setButtonState('openMP3Button', files.mp3);

            // Radioboutons trackType
            const trackMap = { '': files.mp3, 'bch': files.mp3bch, 'bcg': files.mp3bcg, 'bgu': files.mp3bgu };
            document.querySelectorAll('input[name="trackType"]').forEach(r => {
                const available = trackMap[r.value] || false;
                r.disabled = !available;
                r.parentElement.style.opacity = available ? '1' : '0.35';
                // Si le bouton sélectionné n'est pas disponible, basculer sur N si dispo
                if (!available && r.checked) {
                    const normal = document.querySelector('input[name="trackType"][value=""]');
                    if (normal && files.mp3) normal.checked = true;
                }
            });

            // Bouton MP3 global : actif si au moins une piste existe
            const anyMp3 = files.mp3 || files.mp3bch || files.mp3bcg || files.mp3bgu;
            this.setButtonState('openMP3Button', anyMp3);
            this.setButtonState('openGPButton',  files.gp);
            this.setButtonState('openMP4Button', files.mp4);
            this.setButtonState('openPDFButton', files.pdf);

        } catch (e) {
            // Serveur Node non disponible : on laisse tout actif silencieusement
            console.warn('[checkMediaFiles] Serveur Node non disponible.');
        }
    },

    setButtonState(id, available) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = !available;
        btn.style.opacity = available ? '1' : '0.35';
        btn.style.cursor = available ? 'pointer' : 'not-allowed';
    },

    // Formater le contenu de la chanson pour l'affichage
    // -------------------------------------------------------
    // Rendu d'une ligne dans le panneau accords
    //
    // Algorithme :
    //  1. Extraire tous les tokens {{accord}} [n/d] de la ligne
    //  2. Regrouper en mesures : accumulation jusqu'à ce que la
    //     somme des ratios soit un entier (1, 2, 3…)
    //  3. Si tous les accords ont une durée ET forment au moins
    //     une mesure complète → affichage blocs mesures
    //  4. Sinon → affichage classique (rétrocompatible)
    // -------------------------------------------------------
    renderChordsLine: function(line) {
        // >>>> tablature : ligne vide dans la frame accords
        if (line.trim().startsWith('>>>>')) return `<div class="chord-line empty"></div>`;
        // <<<<  : masqué dans la frame accords (comme >>>>)
        if (line.trim().startsWith('<<<<')) return `<div class="chord-line empty"></div>`;
        // rrrr, ssss, vvvv, pppp : cadre style mesure avec couleur
        const pfxMap = {
            'rrrr': { color:'#069732', border:'#a5d6a7', bg:'#f0faf0' },
            'ssss': { color:'#060cc3', border:'#9fa8da', bg:'#f0f0fa' },
            'vvvv': { color:'#903c07', border:'#ffcc80', bg:'#fff8f0' },
            'pppp': { color:'#0a6c68', border:'#80cbc4', bg:'#f0fafa' },
        };
        const pfx = line.trim().substring(0, 4);
        if (pfxMap[pfx]) {
            const { color, border, bg } = pfxMap[pfx];
            const txt = line.trim().substring(4).replace(/\{\{[^}]+\}\}/g, '').trim();
            return `<div class="chord-section-badge" style="color:${color};border-color:${border};background:${bg};">${txt}</div>`;
        }
        // Extraire les tokens {{accord}} éventuellement suivis de [n/d]
        const tokenRegex = /\{\{([^}]+)\}\}(?:\s*\[(\d+)\/(\d+)\])?/g;
        const entries = [];
        let match;

        while ((match = tokenRegex.exec(line)) !== null) {
            const name = match[1];
            const num  = match[2] ? parseInt(match[2]) : null;
            const den  = match[3] ? parseInt(match[3]) : null;
            const hasDuration = num !== null && den !== null && den !== 0;
            entries.push({ name, num, den, ratio: hasDuration ? num / den : null });
        }

        if (entries.length === 0) return `<div class="chord-line empty"></div>`;

        // Vérifier que tous les accords ont une durée
        const allHaveDuration = entries.every(e => e.ratio !== null);
        if (!allHaveDuration) {
            // Mode classique
            return `<div class="chord-line">${entries.map(e => `<span>${e.name}</span>`).join('')}</div>`;
        }

        // Regrouper en mesures : on accumule jusqu'à ce que la somme soit un entier
        const measures = [];
        let current = [];
        let acc = 0;

        for (const e of entries) {
            current.push(e);
            acc += e.ratio;
            // Tolérance flottante : somme proche d'un entier ?
            if (Math.abs(acc - Math.round(acc)) < 0.001 && Math.round(acc) >= 1) {
                measures.push(current);
                current = [];
                acc = 0;
            }
        }

        // Le reliquat (accords ne complétant pas une mesure entière — ex: phrase
        // enjambant la coupure de ligne) forme quand même un dernier bloc "mesure",
        // même incomplet : chaque accord garde sa durée affichée plutôt que de faire
        // basculer TOUTE la ligne en mode classique (sans durées).
        if (current.length > 0) {
            measures.push(current);
        }

        // ── Mode mesure : un bloc par mesure sur la ligne ─────────────────
        // Largeur de chaque bloc proportionnelle à SA durée réelle (somme des ratios
        // qu'il contient) plutôt qu'une largeur égale — un dernier bloc incomplet
        // (reliquat de fin de ligne) occupe ainsi une place cohérente avec sa durée
        // réelle au lieu de fausser visuellement le rythme de la ligne.
        const measureRatios = measures.map(measure => measure.reduce((sum, e) => sum + e.ratio, 0));
        const totalRatio = measureRatios.reduce((a, b) => a + b, 0) || 1;
        const blocksHtml = measures.map((measure, i) => {
            const items = measure.map(e => {
                const pct = (e.ratio * 100).toFixed(1);
                const label = e.num === 1 ? `1/${e.den}` : `${e.num}/${e.den}`;
                return `<div class="measure-chord" style="flex: ${e.ratio};">
                            <div class="measure-chord-name">${e.name}</div>
                            <div class="measure-chord-dur">${label}</div>
                            <div class="measure-chord-bar" style="width:${pct}%"></div>
                        </div>`;
            }).join('');
            const blockPct = (measureRatios[i] / totalRatio * 100).toFixed(4);
            return `<div class="measure-block" style="flex: 0 0 calc(${blockPct}% - 6px);">${items}</div>`;
        }).join('');

        return `<div class="chord-line measure-line">${blocksHtml}</div>`;
    },

    // ===== RENDER LYRICS WITH BADGES =====
    // ===== SURLIGNAGE INLINE **choeur** / ++lead++ =====
    // Analyse un texte (paroles pures, sans balises {{accord}}) et repère les zones
    // encadrées par ** ** (choeur/2 voix, vert) ou ++ ++ (guitare lead, orange).
    // Retourne le texte NETTOYÉ de ses délimiteurs, la liste des zones surlignées
    // (positions dans le texte nettoyé), et une table de correspondance des positions
    // AVANT → APRÈS retrait des délimiteurs (nécessaire pour recaler les positions
    // des accords, calculées avant ce nettoyage).
    _extractHighlights(text) {
        const DELIMS = [
            { open: '**', cls: 'lyric-highlight-choeur' },
            { open: '++', cls: 'lyric-highlight-lead' },
            { open: '--', cls: 'lyric-highlight-mutter' },
            { open: '&&', cls: 'lyric-highlight-libre' },
        ];
        const marks = [];
        let clean = '';
        const offsetMap = [];
        const stack = [];

        let i = 0;
        while (i < text.length) {
            offsetMap[i] = clean.length;
            const d = DELIMS.find(d => text.startsWith(d.open, i));
            if (d) {
                const top = stack[stack.length - 1];
                if (top && top.cls === d.cls) {
                    marks.push({ start: top.cleanStart, end: clean.length, cls: top.cls });
                    stack.pop();
                } else {
                    stack.push({ cls: d.cls, cleanStart: clean.length });
                }
                i += d.open.length;
                continue;
            }
            clean += text[i];
            i++;
        }
        offsetMap[text.length] = clean.length;
        // Tolérance : délimiteur ouvrant oublié sans fermeture → surligne jusqu'à la fin
        while (stack.length) {
            const top = stack.pop();
            marks.push({ start: top.cleanStart, end: clean.length, cls: top.cls });
        }
        marks.sort((a, b) => a.start - b.start);
        return { clean, marks, offsetMap };
    },

    // Rend une plage [rangeStart, rangeEnd) de `text` en HTML, en ré-ouvrant/fermant
    // proprement les <mark> pour chaque zone surlignée qui chevauche cette plage —
    // essentiel quand un accord "coupe" une zone surlignée en plusieurs segments
    // HTML séparés (chacun doit porter son propre <mark> complet, faute de quoi le
    // navigateur referme le tag au mauvais endroit et casse la mise en forme).
    _renderTextWithMarks(text, marks, rangeStart, rangeEnd) {
        const relevant = marks.filter(m => m.end > rangeStart && m.start < rangeEnd);
        if (!relevant.length) return text.slice(rangeStart, rangeEnd);

        let html = '';
        let cursor = rangeStart;
        for (const m of relevant) {
            const s = Math.max(m.start, rangeStart);
            const e = Math.min(m.end, rangeEnd);
            if (s > cursor) html += text.slice(cursor, s);
            html += `<mark class="${m.cls}">${text.slice(s, e)}</mark>`;
            cursor = e;
        }
        if (cursor < rangeEnd) html += text.slice(cursor, rangeEnd);
        return html;
    },
    // ===== FIN SURLIGNAGE INLINE =====

    // Catégorise la durée d'un accord en classe CSS d'intensité de couleur :
    //   [2/2] vert foncé (2 mesures tenues) · [1/1] dense · [1/2] estompé ·
    //   [1/4] clair · autre [x/y] pâle · sans durée : distinctif
    _chordDurationClass(num, den) {
        if (num === null || den === null) return 'chord-dur-none';
        if (num === 2 && den === 2) return 'chord-dur-double';
        if (num === 1 && den === 1) return 'chord-dur-dense';
        if (num === 1 && den === 2) return 'chord-dur-medium';
        if (num === 1 && den === 4) return 'chord-dur-light';
        return 'chord-dur-pale';
    },

    renderLyricsWithBadges: function(line) {
        const re = /\{\{([^}]+)\}\}(?:\s*\[(\d+)\/(\d+)\])?/g;
        re.lastIndex = 0;
        const tokens = []; let m;
        while ((m = re.exec(line)) !== null)
            tokens.push({
                chord: m[1], start: m.index, end: m.index + m[0].length,
                num: m[2] ? parseInt(m[2], 10) : null,
                den: m[3] ? parseInt(m[3], 10) : null,
            });
        if (!tokens.length) {
            const { clean, marks } = this._extractHighlights(line);
            const html = this._renderTextWithMarks(clean, marks, 0, clean.length);
            return `<div class="lyrics-line">${html}</div>`;
        }
        let pureText = '', lastEnd = 0;
        const chordPos = [];
        for (const tok of tokens) {
            const before = line.slice(lastEnd, tok.start);
            chordPos.push({ chord: tok.chord, num: tok.num, den: tok.den, pos: pureText.length + before.length });
            pureText += before;
            lastEnd = tok.end;
        }
        pureText += line.slice(lastEnd);

        // Surlignages **choeur**/++lead++ : repérés sur le texte pur, puis les positions
        // des accords (calculées AVANT ce nettoyage) sont recalées sur le texte nettoyé.
        const { clean, marks, offsetMap } = this._extractHighlights(pureText);
        chordPos.forEach(cp => { cp.pos = offsetMap[cp.pos]; });
        pureText = clean;

        let html = '';
        const prefixEnd = chordPos[0].pos;
        if (prefixEnd > 0) {
            html += `<span class="lyric-segment"><span class="lyric-chord-badge lyric-chord-empty">&#8203;</span><span class="lyric-text">${this._renderTextWithMarks(pureText, marks, 0, prefixEnd)}</span></span>`;
        }
        for (let i = 0; i < chordPos.length; i++) {
            const posStart = chordPos[i].pos;
            const posEnd   = i + 1 < chordPos.length ? chordPos[i+1].pos : pureText.length;
            const txt = posEnd > posStart ? this._renderTextWithMarks(pureText, marks, posStart, posEnd) : '\u00a0';
            const durCls = this._chordDurationClass(chordPos[i].num, chordPos[i].den);
            html += `<span class="lyric-segment"><span class="lyric-chord-badge ${durCls}">${chordPos[i].chord}</span><span class="lyric-text">${txt}</span></span>`;
        }
        return `<div class="lyrics-block">${html}</div>`;
    },
    // ===== FIN RENDER LYRICS WITH BADGES =====

    // ===== POST-IT IMAGES DANS LES PAROLES =====
    // Balise dans le texte de la chanson : <link rel="image1" href="img/xxx.png">
    // (image2, image3... s'il y en a plusieurs). Invisible dans le texte (voir
    // formatSongContent, qui laisse juste un marqueur .postit-anchor à sa place) —
    // ne modifie ni le contenu des paroles ni le marquage karaoké existant.
    // Affiche une vignette flottante à droite, alignée sur la ligne où la balise a
    // été insérée ; comme elle est positionnée en absolu À L'INTÉRIEUR du conteneur
    // qui défile (#song-content-display), elle suit naturellement le scroll de sa
    // ligne, sans code de scroll dédié.
    _renderPostits() {
        const container = document.getElementById('song-content-display');
        if (!container) return;

        // Retirer les anciennes vignettes
        container.querySelectorAll('.postit-marker').forEach(el => el.remove());

        // Créer ou réutiliser le tooltip global (un seul pour tous les post-its).
        // En plein écran natif, seuls les éléments à l'intérieur de l'élément mis en
        // plein écran restent visibles à l'écran — le tooltip doit donc être ré-attaché
        // à ce conteneur (au lieu de document.body) tant que le plein écran est actif.
        const targetParent = document.fullscreenElement || document.body;
        let tooltip = document.getElementById('postit-tooltip-global');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id  = 'postit-tooltip-global';
            tooltip.className = 'postit-tooltip';
            tooltip.innerHTML = '<img src="" alt="post-it">';
            targetParent.appendChild(tooltip);
        } else if (tooltip.parentElement !== targetParent) {
            targetParent.appendChild(tooltip);
        }
        const tooltipImg = tooltip.querySelector('img');

        const anchors = container.querySelectorAll('.postit-anchor');
        if (!anchors.length) return;

        anchors.forEach(anchor => {
            const src = anchor.dataset.postitSrc;
            const marker = document.createElement('div');
            marker.className = 'postit-marker';
            marker.style.backgroundImage = `url("${src}")`;
            marker.title = anchor.dataset.postitId;
            marker.style.top = `${anchor.offsetTop}px`;

            // ── Tooltip pleine taille au survol ──────────────────────────
            marker.addEventListener('mouseenter', (e) => {
                tooltipImg.src = src;
                tooltip.style.display = 'block';
                this._positionPostitTooltip(tooltip, marker);
            });

            marker.addEventListener('mousemove', (e) => {
                this._positionPostitTooltip(tooltip, marker);
            });

            marker.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });

            container.appendChild(marker);
        });
    },

    // Positionne le tooltip à gauche du marker (ou à droite si pas de place),
    // en restant dans les limites du viewport.
    _positionPostitTooltip(tooltip, marker) {
        const rect  = marker.getBoundingClientRect();
        const tw    = tooltip.offsetWidth  || 400;
        const th    = tooltip.offsetHeight || 300;
        const vw    = window.innerWidth;
        const vh    = window.innerHeight;
        const gap   = 10;

        // Préférer à gauche du marker
        let left = rect.left - tw - gap;
        if (left < 8) left = rect.right + gap; // pas de place à gauche → droite
        if (left + tw > vw - 8) left = vw - tw - 8;

        // Centrer verticalement sur le marker, sans déborder
        let top = rect.top + (rect.height / 2) - (th / 2);
        if (top < 8) top = 8;
        if (top + th > vh - 8) top = vh - th - 8;

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top  = `${Math.round(top)}px`;
    },
    // ===== FIN POST-IT IMAGES =====

    // opts.sections : regroupe chaque section (en-tête rrrr/ssss/vvvv/pppp + lignes qui suivent) dans un bloc
    // <div class="lyrics-section sec-X"> encadré. Les lignes vides qui précèdent un en-tête (ou la fin) sont
    // supprimées : le cadre porte lui-même l'espacement. Sans option : une ligne source = un élément (aperçu).
    formatSongContent(content, opts) {
        const sections = !!(opts && opts.sections);
        const items = content.split('\n')
            .map(line => {
                if (line.trim() === '') return { html: '<br>', blank: true };
                // Balises <link ...> : jamais affichées telles quelles en mode défilement.
                // - rel="imageN" → laisse un marqueur invisible (position du post-it, voir
                //   _renderPostits()), sans altérer le texte ni le marquage environnant.
                // - autre rel (GPvideo, Kvideo, etc.) → totalement invisible (lu ailleurs,
                //   ex: openKaraoke()).
                if (/^<link\b[^>]*>$/i.test(line.trim())) {
                    const hrefM = line.match(/\bhref=["']([^"']+)["']/i);
                    const relM  = line.match(/\brel=["']([^"']+)["']/i);
                    if (hrefM && relM && /^image\d*$/i.test(relM[1])) {
                        return { html: `<span class="postit-anchor" data-postit-id="${relM[1]}" data-postit-src="${hrefM[1]}"></span>` };
                    }
                    return { html: '' };
                }
                if (line.trim().startsWith('>>>>')) return { html: `<div style="color: #black; background-color: #f0f0f0; font-style: normal; font-size: calc(14px * var(--lf, 1));">${line.trim().substring(4)}</div>` };
                if (line.trim().startsWith('<<<<')) return { html: `<div style="color: #420252; background-color: #efdbf2; font-style: normal; font-size: calc(22px * var(--lf, 1));">${line.trim().substring(4)}</div>` };
                if (line.trim().startsWith('rrrr')) return { html: `<div style="color: #069732; font-style: underline; font-size: calc(22px * var(--lf, 1));">${line.trim().substring(4)}</div>`, sec: 'r' };
                if (line.trim().startsWith('ssss')) return { html: `<div style="color: #060cc3; font-style: underline; font-size: calc(22px * var(--lf, 1));">${line.trim().substring(4)}</div>`, sec: 's' };
                if (line.trim().startsWith('vvvv')) return { html: `<div style="color: #903c07; font-style: underline; font-size: calc(22px * var(--lf, 1));">${line.trim().substring(4)}</div>`, sec: 'v' };
                if (line.trim().startsWith('pppp')) return { html: `<div style="color: #0a6c68; font-style: underline; font-size: calc(22px * var(--lf, 1));">${line.trim().substring(4)}</div>`, sec: 'p' };

                // Retirer la balise pivot [!] et les séparateurs de syllabe [|] (jamais
                // affichés) ; les durées [n/d], elles, sont conservées pour
                // renderLyricsWithBadges() qui les utilise pour colorer l'intensité des
                // badges d'accords selon leur durée. Les deux retraits se font AVANT tout
                // calcul de position d'accord, pour que ces balises ne décalent jamais rien.
                const lineNoPivot = line.replace(/\s*\[!\]/g, '').replace(/\[\|\]/g, '');
                if (this.showChords) {
                            return { html: this.renderLyricsWithBadges(lineNoPivot) };
                        } else {
                            const cleanLine = lineNoPivot.replace(/\s*\[\d+\/\d+\]/g, '');
                            const { lyrics } = this.extractChordsAndLyrics(cleanLine);
                            return { html: `<div class="lyrics-line">${lyrics}</div>` };
                        }


                // Extraire les accords et les paroles
                // const { chords, lyrics } = this.extractChordsSupAndLyrics(line);
                // return `<div style="margin-bottom: 10px; color: #f50606;" >${chords}<br></div><div>${lyrics}</div>`;
                // const { chords, lyrics } = this.extractChordsAndLyrics(line);
                // return `<div style="margin-bottom: 10px;">${lyrics}</div>`;
            });

        if (!sections) return items.map(it => it.html).join('');

        let out = '', open = false, pending = '';
        for (const it of items) {
            if (it.sec) {                                   // en-tête : ferme la section précédente, en ouvre une nouvelle
                if (open) out += '</div>';
                out += '<div class="lyrics-section sec-' + it.sec + '">' + it.html;
                open = true; pending = '';                  // lignes vides avant l'en-tête : remplacées par la marge du cadre
            } else if (it.blank) {
                pending += it.html;                         // gardée seulement si du texte suit dans la même section
            } else if (it.html !== '') {
                out += pending + it.html; pending = '';
            }
        }
        if (open) out += '</div>'; else out += pending;     // sans aucune section : rendu inchangé
        return out;
    },

    // Extraire les accords et les paroles d'une ligne (ancienne version, pour affichage au dessus des paroles
    extractChordsSupAndLyrics(line) {
        const chordRegex = /\{\{([^}]+)\}\}/g;
        let chords = '';
        let lyrics = line;
        let match;

        while ((match = chordRegex.exec(line)) !== null) {
            const chord = match[1];
            const startIndex = match.index;

            // Ajouter des espaces pour aligner les accords
            chords += ' '.repeat(startIndex - chords.length) + chord + ' ';
            lyrics = lyrics.replace(match[0], ''.repeat(chord.length));
        }

        return { chords, lyrics };
    },

    

    // Extraire les accords et les paroles
        extractChordsAndLyrics: function(line) {
            // Regex pour capturer les accords ET les lettres avant/après
            const chordRegex = /(\w?)\{\{([^}]+)\}\}(\w?)/g;
            let chords = '';
            let lyrics = '';
            let lastIndex = 0;
            let match;

            // On parcourt la ligne pour traiter chaque accord
            while ((match = chordRegex.exec(line)) !== null) {
                const beforeChar = match[1] || '';  // Lettre avant l'accord (ou vide)
                const chord = match[2];             // L'accord lui-même
                const afterChar = match[3] || '';   // Lettre après l'accord (ou vide)
                const startIndex = match.index;

                // 1. Ajouter le texte avant l'accord (non traité) à chords et lyrics
                const textBeforeMatch = line.substring(lastIndex, startIndex);
                chords += textBeforeMatch;
                lyrics += textBeforeMatch;

                // 2. Traiter l'accord et les lettres adjacentes
                // Pour chords : on ajoute l'accord normalement
                chords += ' '.repeat(beforeChar.length) + chord + ' ';

                // Pour lyrics : on surligne les lettres avant/après en vert
                if (beforeChar) {
                    lyrics += `<span style="color: red;">${beforeChar}</span>`;
                }
                // On remplace l'accord par des espaces (comme dans ton code original)
                lyrics += ''.repeat(chord.length);
                if (afterChar) {
                    lyrics += `<span style="color: red;">${afterChar}</span>`;
                }

                lastIndex = startIndex + match[0].length;
            }

            // Ajouter le reste de la ligne après le dernier accord
            if (lastIndex < line.length) {
                const remainingText = line.substring(lastIndex);
                chords += remainingText;
                lyrics += remainingText;
            }

            // Surlignages **choeur**/++lead++ sur le texte final des paroles
            const { clean, marks } = this._extractHighlights(lyrics);
            lyrics = this._renderTextWithMarks(clean, marks, 0, clean.length);

            return { chords, lyrics };
        },
        // Transposer les accords
        transpose: function(semitones) {
            if (!this.currentSong) {
                this.showError("Aucune chanson chargée.");
                return;
            }
            this.currentTransposition += semitones;
            this.currentSong.content = this.transposeContent(this.originalContent, this.currentTransposition);
            this._updateTransposeResetLabel();

            // Si on est dans l'éditeur, mettre à jour le textarea + aperçu sans basculer vers la vue chanson
            const editorTab = document.getElementById('editor-tab');
            if (editorTab && editorTab.style.display !== 'none') {
                document.getElementById('song-editor').value = this.currentSong.content;
                this.updatePreview();
            } else {
                this.displaySong();
            }
        },

        // Réinitialiser la transposition
        resetTranspose: function() {
            if (!this.currentSong) return;
            this.currentTransposition = 0;
            this.currentSong.content = this.originalContent;
            this._updateTransposeResetLabel();

            // Si on est dans l'éditeur, mettre à jour le textarea + aperçu sans basculer vers la vue chanson
            const editorTab = document.getElementById('editor-tab');
            if (editorTab && editorTab.style.display !== 'none') {
                document.getElementById('song-editor').value = this.currentSong.content;
                this.updatePreview();
            } else {
                this.displaySong();
            }
        },

        // Affiche le total cumulé de demi-tons transposés entre parenthèses sur le
        // bouton Réinitialiser (ex: "Réinitialiser (+3)"), rien entre parenthèses si 0.
        _updateTransposeResetLabel: function() {
            const btn = document.getElementById('transpose-reset');
            if (!btn) return;
            const n = this.currentTransposition || 0;
            btn.textContent = n === 0 ? 'Réinitialiser' : `Réinitialiser (${n > 0 ? '+' : ''}${n})`;
        },

    // Transposer le contenu (gère les accords complexes)
    transposeContent: function(content, semitones) {
        // Regex améliorée pour capturer les accords même collés à du texte
        // Explications :
        // - \{\{ : Début littéral "{{"
        // - ([%]?) : Caractère spécial optionnel (ex: %)
        // - ([A-G][b#]?) : Note principale (ex: F, Bb, C#)
        // - ([^}\/]*) : Suffixe (tout sauf "}" ou "/")
        // - (\/[A-G][b#]?)? : Basse alternée optionnelle (ex: /A, /Gb)
        // - \}\} : Fin littérale "}}"
        const chordRegex = /\{\{([%]?)([A-G][b#]?)([^}\/]*)(\/[A-G][b#]?)?\}\}/g;

        return content.replace(chordRegex, (match, specialChar, rootNote, suffix, bassPart) => {
            // Transposer la note principale
            const transposedRoot = this.transposeNote(rootNote, semitones);

            // Transposer la basse si elle existe
            let transposedBassPart = '';
            if (bassPart) {
                const bassNote = bassPart.substring(1); // Supprime le "/"
                const transposedBassNote = this.transposeNote(bassNote, semitones);
                transposedBassPart = `/${transposedBassNote}`;
            }

            // Reconstruire l'accord transposé
            return `{{${specialChar || ''}${transposedRoot}${suffix}${transposedBassPart}}}`;
        });
    },



    // Ouvrir la vidéo d'étude (tuto ou kfn) dans une modale
    openEtude: function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }

        // Récupérer le type sélectionné via le radiobouton
        const selected = document.querySelector('input[name="etudeType"]:checked');
        const type = selected ? selected.value : 'tuto';
        const url = this.currentSong[type];

        if (!url) {
            this.showError(`Aucune vidéo "${type}" disponible pour cette chanson.`);
            return;
        }

        // Vérifier si l'embed est désactivé pour ce type (ex: tuto_embed: false)
        const embedKey = `${type}_embed`;
        const canEmbed = this.currentSong[embedKey] !== false;

        if (!canEmbed) {
            // Ouvrir directement dans un nouvel onglet
            window.open(url, '_blank');
            return;
        }

        // Convertir l'URL YouTube courte en URL embed
        // https://youtu.be/ID  →  https://www.youtube.com/embed/ID
        const embedUrl = url
            .replace('https://youtu.be/', 'https://www.youtube.com/embed/')
            .replace(/\?.*$/, ''); // supprimer les paramètres si présents

        // Créer et afficher la modale
        const modal = document.getElementById('etude-modal');
        const iframe = document.getElementById('etude-iframe');
        const modalTitle = document.getElementById('etude-modal-title');

        modalTitle.textContent = `${this.currentSong.title} — ${type.toUpperCase()}`;
        iframe.src = embedUrl;
        modal.style.display = 'flex';
    },

    // Fermer la modale étude
    closeEtude: function() {
        const modal = document.getElementById('etude-modal');
        const iframe = document.getElementById('etude-iframe');
        iframe.src = ''; // stopper la lecture
        modal.style.display = 'none';
    },

    testTransposeAllCases: function() {
        const testCases = [
            // ===== NOTES SIMPLES (+5 demi-tons) =====
            { input: "{{C}}", semitones: 5, expected: "{{F}}" },
            { input: "{{C#}}", semitones: 5, expected: "{{F#}}" },
            { input: "{{D}}", semitones: 5, expected: "{{G}}" },
            { input: "{{D#}}", semitones: 5, expected: "{{G#}}" },
            { input: "{{E}}", semitones: 5, expected: "{{A}}" },
            { input: "{{F}}", semitones: 5, expected: "{{A#}}" },
            { input: "{{F#}}", semitones: 5, expected: "{{B}}" },
            { input: "{{G}}", semitones: 5, expected: "{{C}}" },
            { input: "{{G#}}", semitones: 5, expected: "{{C#}}" },
            { input: "{{A}}", semitones: 5, expected: "{{D}}" },
            { input: "{{A#}}", semitones: 5, expected: "{{D#}}" },
            { input: "{{B}}", semitones: 5, expected: "{{E}}" },

            // ===== NOTES SIMPLES (-5 demi-tons) =====
            { input: "{{C}}", semitones: -5, expected: "{{G}}" },
            { input: "{{C#}}", semitones: -5, expected: "{{G#}}" },
            { input: "{{D}}", semitones: -5, expected: "{{A}}" },
            { input: "{{D#}}", semitones: -5, expected: "{{A#}}" },
            { input: "{{E}}", semitones: -5, expected: "{{B}}" },
            { input: "{{F}}", semitones: -5, expected: "{{C}}" },
            { input: "{{F#}}", semitones: -5, expected: "{{C#}}" },
            { input: "{{G}}", semitones: -5, expected: "{{D}}" },
            { input: "{{G#}}", semitones: -5, expected: "{{D#}}" },
            { input: "{{A}}", semitones: -5, expected: "{{E}}" },
            { input: "{{A#}}", semitones: -5, expected: "{{F}}" },
            { input: "{{B}}", semitones: -5, expected: "{{F#}}" },

            // ===== ACCORDS SIMPLES (+5 demi-tons) =====
            { input: "{{Cm}}", semitones: 5, expected: "{{Fm}}" },
            { input: "{{C#m}}", semitones: 5, expected: "{{F#m}}" },
            { input: "{{Dm7}}", semitones: 5, expected: "{{Gm7}}" },
            { input: "{{Fmaj7}}", semitones: 5, expected: "{{A#maj7}}" },
            { input: "{{Bb}}", semitones: 5, expected: "{{Eb}}" }, // Bb → Eb (car Bb est un bémol)
            { input: "{{Eb}}", semitones: 5, expected: "{{Ab}}" }, // Eb → Ab

            // ===== ACCORDS SIMPLES (-5 demi-tons) =====
            { input: "{{Cm}}", semitones: -5, expected: "{{Gm}}" },
            { input: "{{C#m}}", semitones: -5, expected: "{{G#m}}" },
            { input: "{{Dm7}}", semitones: -5, expected: "{{Am7}}" },
            { input: "{{Fmaj7}}", semitones: -5, expected: "{{Cmaj7}}" },
            { input: "{{Bb}}", semitones: -5, expected: "{{F}}" }, // Bb → F (car Bb → A → G# → G → F)
            { input: "{{Eb}}", semitones: -5, expected: "{{Ab}}" }, // Eb → Ab (car Eb → D → D# → E → F → F# → G → G# → A → A# → B → C → C# → Db → **Ab**)

            // ===== ACCORDS AVEC BASSE (+5 demi-tons) =====
            { input: "{{Am7/D#}}", semitones: 5, expected: "{{Dm7/G#}}" },
            { input: "{{G#/C}}", semitones: 5, expected: "{{C#/F}}" },
            { input: "{{Bbmaj7/B}}", semitones: 5, expected: "{{Ebmaj7/E}}" },
            { input: "{{C/E}}", semitones: 5, expected: "{{F/A#}}" },
            { input: "{{F#m7/A#}}", semitones: 5, expected: "{{Bm7/D#}}" },

            // ===== ACCORDS AVEC BASSE (-5 demi-tons) =====
            { input: "{{Am7/D#}}", semitones: -5, expected: "{{Em7/A#}}" },
            { input: "{{G#/C}}", semitones: -5, expected: "{{D#/G}}" },
            { input: "{{Bbmaj7/B}}", semitones: -5, expected: "{{Fmaj7/F#}}" },
            { input: "{{C/E}}", semitones: -5, expected: "{{G/B}}" },
            { input: "{{F#m7/A#}}", semitones: -5, expected: "{{C#m7/E}}" },

            // ===== ACCORDS COMPLEXES (+5 demi-tons) =====
            { input: "{{F(sus4)}}", semitones: 5, expected: "{{A#(sus4)}}" },
            { input: "{{C#m7b5}}", semitones: 5, expected: "{{F#m7b5}}" },
            { input: "{{G7b9}}", semitones: 5, expected: "{{C7b9}}" },
            { input: "{{A(sus4)/D}}", semitones: 5, expected: "{{D(sus4)/G}}" },

            // ===== ACCORDS COMPLEXES (-5 demi-tons) =====
            { input: "{{F(sus4)}}", semitones: -5, expected: "{{C(sus4)}}" },
            { input: "{{C#m7b5}}", semitones: -5, expected: "{{G#m7b5}}" },
            { input: "{{G7b9}}", semitones: -5, expected: "{{D7b9}}" },
            { input: "{{A(sus4)/D}}", semitones: -5, expected: "{{E(sus4)/A}}" }
        ];

        console.log("🔍 Début des tests de transposition (±5 demi-tons)...");
        let allPassed = true;
        testCases.forEach(test => {
            const result = this.transposeContent(test.input, test.semitones);
            const success = result === test.expected;
            if (!success) allPassed = false;
            console.log(
                `${success ? '✅' : '❌'} ${test.input} (${test.semitones > 0 ? '+' : ''}${test.semitones}) → ${result} ` +
                `(attendu: ${test.expected})`
            );
        });
        console.log(allPassed ? "🎉 Tous les tests ont réussi !" : "⚠️ Certains tests ont échoué.");
    },    

    // Transposer une note individuelle

    transposeNote: function(note, semitones) {
        // Échelle chromatique avec dièses ET bémols
        const chromaticScale = [
            { sharp: 'C', flat: 'C' },
            { sharp: 'C#', flat: 'Db' },
            { sharp: 'D', flat: 'D' },
            { sharp: 'D#', flat: 'Eb' },
            { sharp: 'E', flat: 'E' },
            { sharp: 'F', flat: 'F' },
            { sharp: 'F#', flat: 'Gb' },
            { sharp: 'G', flat: 'G' },
            { sharp: 'G#', flat: 'Ab' },
            { sharp: 'A', flat: 'A' },
            { sharp: 'A#', flat: 'Bb' },
            { sharp: 'B', flat: 'B' }
        ];

        // Trouver l'index de la note (en dièse ou bémol)
        let currentIndex = -1;
        for (let i = 0; i < chromaticScale.length; i++) {
            if (chromaticScale[i].sharp === note || chromaticScale[i].flat === note) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex === -1) {
            console.warn(`Note inconnue : ${note}`);
            return note;
        }

        // Calculer le nouvel index
        let newIndex = (currentIndex + semitones + 12) % 12;

        // Retourner la note dans le même format que l'entrée
        // Si l'entrée était en dièse (ex: F#), retourner en dièse (ex: G#)
        // Si l'entrée était en bémol (ex: Gb), retourner en bémol (ex: Ab)
        const inputUsesFlat = note.endsWith('b') && note !== 'B';
        const inputUsesSharp = note.endsWith('#');

        if (inputUsesFlat) {
            return chromaticScale[newIndex].flat;
        } else if (inputUsesSharp) {
            return chromaticScale[newIndex].sharp;
        } else {
            // Si la note n'a pas de bémol/dièse (ex: C, D, E), retourner en dièse par défaut
            return chromaticScale[newIndex].sharp;
        }
    },

    // Mettre à jour l'aperçu
    // ===== RÉALIGNEMENT DES REPÈRES KARAOKÉ APRÈS ÉDITION DU CONTENU =====
    // karaokeLines/wordMarkLines référencent leurs lignes par NUMÉRO (lineIndex).
    // Insérer ou supprimer une ligne au-dessus d'un repère (ex. ajouter
    // "vvvv[Couplet 2]") décale donc tous les repères en dessous vers la
    // mauvaise ligne. On détecte ce décalage en comparant le contenu actuel à
    // un instantané du contenu pour lequel les repères sont connus valides, et
    // on remappe automatiquement leur lineIndex via un alignement de lignes
    // (LCS) — jamais au prix de perdre des repères sur un simple correctif de
    // faute de frappe (voir garde "même nombre de lignes" ci-dessous).
    _computeLineMapping(oldLines, newLines) {
        const n = oldLines.length, m = newLines.length;
        const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        const mapping = {}; // ancien lineIndex -> nouveau lineIndex (-1 si la ligne a disparu)
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (oldLines[i] === newLines[j]) { mapping[i] = j; i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) { mapping[i] = -1; i++; }
            else { j++; }
        }
        while (i < n) { mapping[i] = -1; i++; }
        return mapping;
    },

    _remapMarkersIfNeeded(newContent) {
        const oldContent = this._markersContentSnapshot;
        if (oldContent === null || oldContent === undefined || oldContent === newContent) {
            this._markersContentSnapshot = newContent;
            return;
        }
        const hasMarkers = (this.karaokeLines && this.karaokeLines.length) || (this.wordMarkLines && this.wordMarkLines.length);
        if (!hasMarkers) { this._markersContentSnapshot = newContent; return; }

        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        if (oldLines.length === newLines.length) {
            // Aucune ligne insérée ou supprimée : les numéros de ligne restent
            // valides tels quels (simple correctif de texte sur une ligne
            // existante, par ex.) — on ne remappe surtout rien ici, pour ne
            // jamais perdre un repère sur une modification anodine.
            this._markersContentSnapshot = newContent;
            return;
        }

        const mapping = this._computeLineMapping(oldLines, newLines);
        const remap = (arr) => {
            if (!arr || !arr.length) return arr;
            const kept = [];
            let dropped = 0;
            for (const marker of arr) {
                const newIdx = mapping[marker.lineIndex];
                if (newIdx === undefined || newIdx === -1) { dropped++; continue; }
                if (newIdx === marker.lineIndex) { kept.push(marker); continue; }
                const newKey = marker.key.replace(/^\d+_/, newIdx + '_');
                kept.push({ ...marker, lineIndex: newIdx, key: newKey });
            }
            return { kept, dropped };
        };

        let totalDropped = 0;
        if (this.karaokeLines && this.karaokeLines.length) {
            const r = remap(this.karaokeLines);
            this.karaokeLines = r.kept;
            totalDropped += r.dropped;
        }
        if (this.wordMarkLines && this.wordMarkLines.length) {
            const r = remap(this.wordMarkLines);
            this.wordMarkLines = r.kept;
            totalDropped += r.dropped;
        }
        this._allChordsForKaraoke = null; // sera recalculé au prochain ⏱ Marquer
        this._allWordsForKaraoke = null;  // sera recalculé au prochain 🎤 Marquer
        this._markersContentSnapshot = newContent;

        if (totalDropped > 0) {
            const msg = `⚠️ Réorganisation détectée : ${totalDropped} repère(s) sur une ligne supprimée ont été retirés (les autres ont été réalignés automatiquement).`;
            const kDisplay = document.getElementById('karaokeTimerDisplay');
            const wDisplay = document.getElementById('wordTimerDisplay');
            if (kDisplay) kDisplay.textContent = msg;
            if (wDisplay) wDisplay.textContent = msg;
        }
        this._updateMarkingHint();
    },

    updatePreview() {
        const content = document.getElementById("song-editor").value;
        this._remapMarkersIfNeeded(content);
        document.getElementById("song-preview").innerHTML = this.formatSongContent(content);
        // -----------------------------
        const editor = document.getElementById('song-editor');
        const text = editor.value;

        const chordsPanel = document.getElementById('transposed-chords');

        /* découpe lignes */
        const lines = text.split('\n');

        let chordsHtml = '';

        lines.forEach(line => {

            /* recherche accords dans la ligne */
            const chordMatches = line.match(/\{\{(.*?)\}\}/g) || [];

            /* nettoyage */
            const chords = chordMatches.map(chord =>
                chord.replace('{{', '').replace('}}', '')
            );

            /* ligne accords */
            if (chords.length > 0) {

                chordsHtml += `
                    <div class="chord-line">
                        ${chords.map(ch => `<span>${ch}</span>`).join('')}
                    </div>
                `;

            } else {

                /* ligne vide pour garder synchro */
                chordsHtml += `<div class="chord-line empty"></div>`;
            }
        });

        chordsPanel.innerHTML = chordsHtml;
        //------------------------------
    },

    // Extraction accords + paroles pour le PDF
    extractChordsAndLyricsForPDF: function(line) {
        if (!line) return { chords: [], lyrics: "" };
        // Supprimer balises HTML et tokens [n/d]
        const clean = line.replace(/<[^>]*>/g, '').replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g, '');
        const chords = [];
        const chordRe = /\{\{([^}]+)\}\}/g;
        let m;
        while ((m = chordRe.exec(clean)) !== null) chords.push(m[1]);
        // Supprimer TOUS les {{...}} des paroles en une seule passe, ainsi que les
        // délimiteurs de surlignage **choeur**/++lead++/--mutter--/&&libre&& (pas de
        // mise en forme possible dans le texte brut du PDF, donc on les retire
        // simplement plutôt que de les laisser apparaître tels quels)
        const lyrics = clean.replace(/\{\{[^}]+\}\}/g, '').replace(/\*\*|\+\+|--|&&/g, '').replace(/\s+/g, ' ').trim();
        return { chords, lyrics };
    },

    // ===== DETECT MEASURES (shared helper) =====
    detectMeasures: function(line) {
        const re=/\{\{([^}]+)\}\}(?:\s*\[(\d+)\/(\d+)\])?/g,entries=[];let t;re.lastIndex=0;
        while((t=re.exec(line))!==null){
            const n=t[2]?parseInt(t[2]):null,d=t[3]?parseInt(t[3]):null;
            entries.push({name:t[1],ratio:(n&&d)?n/d:null});
        }
        if(!entries.length||!entries.every(e=>e.ratio!==null))return null;
        const measures=[];let cur=[],acc=0;
        for(const e of entries){cur.push(e);acc+=e.ratio;
            if(Math.abs(acc-Math.round(acc))<0.001&&Math.round(acc)>=1){measures.push(cur);cur=[];acc=0;}}
        return cur.length===0&&measures.length>0?measures:null;
    },

        // ===== GENERATE PDF =====
    generatePDF: function() {
        if (!this.currentSong) { this.showError("Aucune chanson chargée."); return; }
        const pdfTypeRadio = document.querySelector('input[name="pdfType"]:checked');
        const pdfMode = pdfTypeRadio ? pdfTypeRadio.value : 'ori';
        if (pdfMode === 'acc') { this.generateChordsPDF(); return; }
        if (pdfMode === 'acc2') { this.generateChordsPDF2Col(); return; }
        this.generateStandardPDF();
    },

    // ===== GENERATE PDF STANDARD (paroles + accords, 1 colonne, optimisé 1-2 pages) =====
    // Objectifs :
    //  - tenir une chanson sur 1 page (2 max) en dédoublonnant les sections identiques
    //    (Couplet 2 identique à Couplet 1, Refrain répété, etc.) via une "frise" de
    //    navigation compacte plutôt que de tout réimprimer ;
    //  - remplacer les délimiteurs **chœur**/++lead++/--mutter--/&&libre&& par un
    //    surlignage coloré fidèle à leurs couleurs dans l'app (voir style.css /
    //    song-gauge.css) plutôt que de simplement les retirer ;
    //  - reprendre le style visuel du gabarit fourni (icônes de section dessinées en
    //    vectoriel — les polices PDF standard ne supportent pas les emojis —, encadré
    //    légende, cartouches de section colorées, frise "déjà vu / identique").
    generateStandardPDF: function() {
    const detectMeasures = this.detectMeasures.bind(this);
    const extractHighlights = this._extractHighlights.bind(this);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const title  = this.currentSong.title  || "Sans titre";
    const artist = this.currentSong.artist || "Artiste inconnu";
    const capo   = parseInt(this.currentSong.capo) || 0;
    const bpm    = this.currentSong.bpm || '';
    const timeSig = this.currentSong.timeSig || '';
    const date   = new Date().toLocaleDateString('fr-FR');

    const PM = 12, pageW = 210, pageH = 297;
    const contentW = pageW - PM * 2;
    const yTop = 46, yMax = 280;
    let y = yTop;

    // ---------- palettes ----------
    const SECTION_STYLES = {
        rrrr:   { rgb: [0, 128, 0],    bg: [232, 245, 233], label: 'Refrain'  },
        ssss:   { rgb: [6, 12, 195],   bg: [232, 234, 246], label: 'Solo'     },
        vvvv:   { rgb: [144, 60, 7],   bg: [255, 243, 224], label: 'Couplet'  },
        pppp:   { rgb: [10, 108, 104], bg: [224, 242, 241], label: 'Pont'     },
        '<<<<': { rgb: [66, 2, 82],    bg: [239, 219, 242], label: ''         },
        '>>>>': { rgb: [80, 80, 80],   bg: [240, 240, 240], label: ''         },
        '':     { rgb: [70, 70, 70],   bg: [240, 240, 240], label: ''         },
    };
    const MARK_COLORS = {
        'lyric-highlight-choeur': { bg: [208, 232, 248], text: [26, 90, 138]  },
        'lyric-highlight-lead':   { bg: [255, 224, 178], text: [122, 64, 16]  },
        'lyric-highlight-mutter': { bg: [250, 212, 212], text: [138, 32, 32]  },
        'lyric-highlight-libre':  { bg: [232, 216, 244], text: [90, 26, 138]  },
    };
    const REPEAT_STYLE = { rgb: [200, 50, 50], bg: [255, 235, 235], border: [255, 107, 107] };
    const CHORD_COLOR = [25, 60, 180];

    // ---------- icônes vectorielles ----------
    const drawIcon = (type, cx, cy, s, color) => {
        doc.setDrawColor(...color); doc.setFillColor(...color); doc.setLineWidth(0.35);
        if (type === 'guitar') {
            doc.ellipse(cx, cy + s * 0.14, s * 0.30, s * 0.20, 'S');
            doc.line(cx - s * 0.05, cy - s * 0.10, cx - s * 0.30, cy - s * 0.48);
            doc.circle(cx - s * 0.30, cy - s * 0.48, s * 0.06, 'S');
        } else if (type === 'solo') {
            // deux croches liées : distingue "Guitare / Solo" de l'icône Intro
            doc.circle(cx - s * 0.16, cy + s * 0.20, s * 0.11, 'F');
            doc.circle(cx + s * 0.16, cy + s * 0.26, s * 0.11, 'F');
            doc.line(cx - s * 0.10, cy + s * 0.16, cx - s * 0.10, cy - s * 0.40);
            doc.line(cx + s * 0.22, cy + s * 0.22, cx + s * 0.22, cy - s * 0.30);
            doc.line(cx - s * 0.10, cy - s * 0.40, cx + s * 0.22, cy - s * 0.30);
        } else if (type === 'mic') {
            doc.roundedRect(cx - s * 0.14, cy - s * 0.42, s * 0.28, s * 0.46, s * 0.14, s * 0.14, 'S');
            doc.line(cx, cy + s * 0.04, cx, cy + s * 0.30);
            doc.line(cx - s * 0.16, cy + s * 0.30, cx + s * 0.16, cy + s * 0.30);
        } else if (type === 'repeat') {
            doc.circle(cx, cy, s * 0.30, 'S');
            doc.triangle(cx + s * 0.24, cy - s * 0.14, cx + s * 0.40, cy - s * 0.02, cx + s * 0.22, cy + s * 0.10, 'F');
        } else if (type === 'pause') {
            doc.rect(cx - s * 0.20, cy - s * 0.26, s * 0.14, s * 0.52, 'F');
            doc.rect(cx + s * 0.06, cy - s * 0.26, s * 0.14, s * 0.52, 'F');
        } else if (type === 'capo') {
            doc.roundedRect(cx - s * 0.32, cy - s * 0.10, s * 0.64, s * 0.20, s * 0.08, s * 0.08, 'F');
            doc.line(cx - s * 0.32, cy - s * 0.30, cx - s * 0.32, cy + s * 0.30);
            doc.line(cx + s * 0.32, cy - s * 0.30, cx + s * 0.32, cy + s * 0.30);
        } else if (type === 'key') {
            doc.circle(cx - s * 0.18, cy + s * 0.18, s * 0.16, 'S');
            doc.line(cx - s * 0.03, cy + s * 0.06, cx + s * 0.36, cy - s * 0.32);
            doc.line(cx + s * 0.22, cy - s * 0.18, cx + s * 0.30, cy - s * 0.10);
        } else if (type === 'timesig') {
            // Icône vectorielle minimaliste (mesure / portée), plutôt que de
            // redessiner la valeur elle-même en gros chiffres — ce qui la
            // dupliquait avec le texte affiché juste à côté.
            doc.setLineWidth(0.35);
            doc.line(cx - s * 0.32, cy - s * 0.20, cx + s * 0.32, cy - s * 0.20);
            doc.line(cx - s * 0.32, cy + s * 0.20, cx + s * 0.32, cy + s * 0.20);
            doc.line(cx - s * 0.32, cy - s * 0.20, cx - s * 0.32, cy + s * 0.20);
            doc.line(cx + s * 0.32, cy - s * 0.20, cx + s * 0.32, cy + s * 0.20);
        } else if (type === 'metronome') {
            doc.triangle(cx - s * 0.26, cy + s * 0.34, cx + s * 0.26, cy + s * 0.34, cx, cy - s * 0.36, 'S');
            doc.line(cx, cy - s * 0.10, cx + s * 0.14, cy + s * 0.28);
        }
        doc.setFillColor(0, 0, 0); doc.setDrawColor(0, 0, 0);
    };

    // ---------- en-tête ----------
    doc.setFontSize(20); doc.setFont("helvetica", "bold");
    doc.text(title.toUpperCase(), PM, 16);
    // Largeur du titre mesurée à sa propre taille de police (20pt) pour un
    // positionnement fiable de l'artiste juste à côté, quel que soit le titre.
    const titleW = doc.getTextWidth(title.toUpperCase());
    doc.setFontSize(12); doc.setFont("helvetica", "italic"); doc.setTextColor(90, 90, 90);
    doc.text(artist, PM + titleW + 4, 16);
    doc.setTextColor(0, 0, 0);

    // Ligne de caractéristiques (capo / tonalité / mesure / tempo)
    // Priorité au champ dédié "Tonalité" (song-key) ; à défaut, estimation à
    // partir du premier accord de la grille (moins fiable, gardé pour les
    // chansons enregistrées avant l'ajout de ce champ).
    const songKey = (this.currentSong.key || '').trim();
    const keyGuess = songKey || (() => {
        const m = (this.currentSong.content || '').match(/\{\{([^}]+)\}\}/);
        return m ? m[1] : '';
    })();
    const infoItems = [];
    if (capo > 0) infoItems.push({ icon: 'capo', txt: `Capo : ${capo}` });
    if (keyGuess) infoItems.push({ icon: 'key', txt: `Tonalité : ${keyGuess}` });
    // "timesig" a désormais une icône vectorielle dédiée (voir drawIcon) — le
    // texte affiché à côté est bien la seule occurrence de la valeur.
    if (timeSig)  infoItems.push({ icon: 'timesig', txt: timeSig });
    // \u266A (croche) n'existe pas dans le jeu de caractères des polices
    // standard jsPDF (WinAnsi) : le glyphe est mal résolu et corrompt le texte
    // à l'extraction. On reste en ASCII pur.
    if (bpm)      infoItems.push({ icon: 'metronome', txt: `${bpm} BPM` });
    let infoX = PM;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    infoItems.forEach((it, i) => {
        drawIcon(it.icon, infoX + 3, 24.5, 6, [70, 70, 70]);
        doc.setTextColor(50, 50, 50);
        if (it.txt) doc.text(it.txt, infoX + 8, 26);
        const w = 8 + doc.getTextWidth(it.txt) + 9;
        infoX += w;
        if (i < infoItems.length - 1) {
            doc.setDrawColor(210, 210, 210); doc.line(infoX - 5, 22, infoX - 5, 28);
        }
    });
    doc.setTextColor(0, 0, 0);

    // Encadré légende (haut droite)
    const legendItems = [
        { icon: 'guitar', txt: 'Intro' },
        { icon: 'mic',    txt: 'Chant' },
        { icon: 'solo',   txt: 'Guitare / Solo' },
        { icon: 'repeat', txt: 'Répéter' },
        { icon: 'pause',  txt: 'Pause / Break' },
    ];
    const legW = 42, legRowH = 5, legPadV = 2.6;
    const legX = pageW - PM - legW, legY = 8;
    const legHeight = legPadV * 2 + 5 + legendItems.length * legRowH;
    doc.setDrawColor(200, 200, 200); doc.setFillColor(250, 250, 251); doc.setLineWidth(0.3);
    doc.roundedRect(legX, legY, legW, legHeight, 1.5, 1.5, 'FD');
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(90, 90, 90);
    doc.text('LÉGENDE', legX + legW / 2, legY + 4.6, { align: 'center' });
    let legLineY = legY + 4.6 + legPadV;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6);
    legendItems.forEach(it => {
        drawIcon(it.icon, legX + 5.5, legLineY + 1, 4.6, [90, 90, 90]);
        doc.setTextColor(70, 70, 70);
        doc.text(it.txt, legX + 10, legLineY + 1.9);
        legLineY += legRowH;
    });
    doc.setTextColor(0, 0, 0);

    // Trait sous les caractéristiques : arrêté avant l'encadré légende (qui
    // descend jusqu'à legY+legHeight) pour ne plus le traverser.
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
    doc.line(PM, 35, legX - 4, 35);
    y = 42;

    // ---------- gestion de colonne ----------
    // Par défaut le rendu est mono-colonne pleine largeur. Le mode deux
    // colonnes n'est activé que ponctuellement, par renderPairAt(), pour deux
    // sections adjacentes identifiées comme éligibles (cf. plus bas) — jamais
    // pour l'ensemble du document. X()/W() donnent la position/largeur de
    // dessin courante ; checkPage() reste un simple saut de page classique.
    let twoColMode = false, curCol = 0;
    const COL_GAP2 = 8;
    const colW2 = (contentW - COL_GAP2) / 2;
    const X = () => !twoColMode ? PM : (curCol === 0 ? PM : PM + colW2 + COL_GAP2);
    const W = () => !twoColMode ? contentW : colW2;

    const checkPage = (h) => {
        if (y + h > yMax) {
            doc.addPage();
            y = 15;
        }
    };

    // ---------- 1) découpage du contenu en sections ----------
    const LOWER_PFX = ['rrrr', 'ssss', 'vvvv', 'pppp'];
    const rawLines = (this.currentSong.content || '').split('\n');
    const sections = [];
    let current = null;
    const openSection = (pfx, rest) => {
        const bracket = rest.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
        const label = bracket ? bracket[1].trim() : rest.trim();
        current = { pfx, label, lines: [] };
        sections.push(current);
    };
    for (const raw of rawLines) {
        const trimmed = raw.trim();
        // Balises <link rel="imageN"/"KVideo" href="..."> : utilisées pour insérer
        // des post-its image/vidéo dans l'éditeur, jamais du texte à afficher —
        // elles n'étaient filtrées nulle part dans ce générateur PDF et
        // s'imprimaient donc telles quelles comme texte brut. cf. le filtre
        // équivalent du mode défilement (recherche "jamais affichées telles
        // quelles" plus haut dans ce fichier).
        if (/^<link\b[^>]*>$/i.test(trimmed)) continue;
        if (trimmed === '') { if (current) current.lines.push(''); continue; }
        const pfx4 = trimmed.substring(0, 4);
        const pfx4L = pfx4.toLowerCase();
        if (LOWER_PFX.includes(pfx4L)) { openSection(pfx4L, trimmed.substring(4)); continue; }
        if (pfx4 === '>>>>' || pfx4 === '<<<<') { openSection(pfx4, trimmed.substring(4)); continue; }
        if (!current) openSection('', '');
        current.lines.push(raw);
    }
    if (sections.length && !sections[0].label) sections[0].label = 'Intro';
    if (!sections.length) { doc.save(this.currentSong.filename.replace('.json', '.pdf')); return; }

    // ---------- 2) analyse de chaque section ----------
    const cleanForSignature = (line) => line
        .replace(/\s*(?:\[!\])/g, '')
        .replace(/<[^>]*>/g, '')
        .trim();
    const lineHasLyricWords = (line) => {
        const noChords = line.replace(/\{\{[^}]+\}\}/g, '').replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g, '').replace(/\*\*|\+\+|--|&&/g, '').trim();
        if (!noChords) return false;
        // Annotations structurelles ("puis", "× 2", "x2"...) : ce sont des
        // indications de séquence, pas des paroles chantées. Sans ce filtre,
        // une section purement instrumentale (Intro, Pont) qui contient juste
        // ce type d'annotation entre deux grilles de mesures se retrouvait
        // classée à tort comme "ayant des paroles" (voir section.hasLyrics),
        // ce qui déclenchait le rendu en carte latérale "(suite)" au lieu du
        // rendu pleine largeur, aligné à gauche, attendu pour l'instrumental.
        if (/^(puis\s*:?|ensuite\s*:?|×\s*\d+|x\s*\d+)$/i.test(noChords)) return false;
        return true;
    };
    sections.forEach(s => {
        s.signature = s.lines.map(cleanForSignature).join('\n').replace(/\s+/g, ' ').trim();
        s.autoLabel = !s.label; // pas de libellé explicite dans la source ([Label])
        if (!s.label) s.label = (SECTION_STYLES[s.pfx] && SECTION_STYLES[s.pfx].label) || 'Section';
        s.labelRoot = s.label.replace(/\s*\d+\s*$/, '').trim().toLowerCase();
        const lbl = s.labelRoot;
        const hasLyrics = s.lines.some(lineHasLyricWords) && s.pfx !== '>>>>';
        if (/intro|outro/.test(lbl)) s.icon = 'guitar';
        else if (/solo|pont|bridge/.test(lbl) && !hasLyrics) s.icon = 'solo';
        else if (hasLyrics) s.icon = 'mic';
        else s.icon = 'solo';
        s.hasLyrics = hasLyrics;
    });
    // Numérotation automatique ("Couplet 1", "Couplet 2"...) quand plusieurs
    // sections du même type n'ont pas de libellé explicite dans la source.
    {
        const typeCounts = {}, typeIdx = {};
        sections.forEach(s => { if (s.autoLabel) typeCounts[s.labelRoot] = (typeCounts[s.labelRoot] || 0) + 1; });
        sections.forEach(s => {
            if (s.autoLabel && typeCounts[s.labelRoot] > 1) {
                typeIdx[s.labelRoot] = (typeIdx[s.labelRoot] || 0) + 1;
                s.label = `${s.label} ${typeIdx[s.labelRoot]}`;
            }
        });
    }

    // ---------- 3) fusion des répétitions immédiates ----------
    const merged = [];
    for (const s of sections) {
        const prev = merged[merged.length - 1];
        if (prev && s.signature !== '' && prev.signature === s.signature) {
            prev.repeatCount = (prev.repeatCount || 1) + 1;
            continue;
        }
        s.repeatCount = 1;
        merged.push(s);
    }

    // ---------- 3bis) (ancienne fonctionnalité d'aperçu en vis-à-vis retirée) ----------
    // L'aperçu "Couplet N ↓" en carte latérale a été supprimé avec le passage en
    // mono-colonne (cf. Cas B/C plus bas). `absorbedAsCompanion` reste déclaré
    // (référencé plus loin) mais volontairement vide : chaque section garde son
    // propre rendu, la frise "Identique à ..." suffit à signaler les doublons.
    const sigKey = (s) => `${s.labelRoot}::${s.signature}`;
    const absorbedAsCompanion = new Set();

    // ---------- 4) plan de rendu : dédoublonnage + frise de navigation ----------
    const renderPlan = [];
    const firstBySignature = new Map();
    const firstByLabelRoot = new Map();
    let roadmapBuf = [];
    const flushRoadmap = () => {
        if (roadmapBuf.length) { renderPlan.push({ type: 'roadmap', items: roadmapBuf }); roadmapBuf = []; }
    };
    for (let i = 0; i < merged.length; i++) {
        const s = merged[i];
        if (absorbedAsCompanion.has(i)) continue; // déjà montré en vis-à-vis de son couplet d'origine
        const isExactRepeat = s.signature !== '' && firstBySignature.has(sigKey(s));
        if (isExactRepeat) {
            const orig = firstBySignature.get(sigKey(s));
            roadmapBuf.push({
                label: s.label + (s.repeatCount > 1 ? ` ×${s.repeatCount}` : ''),
                note: `Identique à ${orig.label}`,
                icon: s.icon,
            });
            continue;
        }
        // Remarque : un couplet/refrain du même nom (verse 2, verse 3...) mais aux
        // paroles différentes n'est PAS signalé comme "variante" — dans la grande
        // majorité des chansons, chaque couplet/refrain diffère du précédent,
        // rendre cette mention systématique n'apportait aucune information utile
        // et encombrait chaque cartouche d'en-tête pour rien.
        flushRoadmap();
        renderPlan.push({ type: 'section', data: s });
        if (s.signature !== '') firstBySignature.set(sigKey(s), s);
        if (s.labelRoot) firstByLabelRoot.set(s.labelRoot, s);
    }
    flushRoadmap();

    // ---------- 5) fonctions de dessin du contenu ----------
    const FS = 10.5;

    const drawHighlightedText = (text, marks, x0, yPos, fs, font = 'helvetica') => {
        if (!text) return;
        doc.setFontSize(fs);
        const sorted = marks.slice().sort((a, b) => a.start - b.start);
        const segs = []; let idx = 0;
        for (const mk of sorted) {
            if (mk.start > idx) segs.push({ start: idx, end: mk.start, cls: null });
            segs.push({ start: mk.start, end: mk.end, cls: mk.cls });
            idx = mk.end;
        }
        if (idx < text.length) segs.push({ start: idx, end: text.length, cls: null });
        let curX = x0;
        for (const seg of segs) {
            const segText = text.slice(seg.start, seg.end);
            if (!segText) continue;
            doc.setFont(font, seg.cls ? 'bold' : 'normal');
            doc.setFontSize(fs);
            const w = doc.getTextWidth(segText);
            if (seg.cls && MARK_COLORS[seg.cls]) {
                const c = MARK_COLORS[seg.cls];
                doc.setFillColor(...c.bg);
                doc.roundedRect(curX - 0.3, yPos - fs * 0.34 - 0.2, w + 0.6, fs * 0.46 + 0.4, 0.6, 0.6, 'F');
                doc.setTextColor(...c.text);
            } else {
                doc.setTextColor(0, 0, 0);
            }
            doc.text(segText, curX, yPos);
            curX += w;
        }
        doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
    };

    // Ligne avec accords {{...}} positionnés au-dessus des paroles — désormais
    // paramétrable en x/largeur pour permettre les mises en page à deux colonnes.
    // Retourne la hauteur utilisée (mm) sans présumer d'un `y` global.
    const measureChordLyricLine = (rawLine, maxW, fsBase) => {
        const withoutPivot = rawLine.replace(/\s*\[!\]/g, '').replace(/\[\|\]/g, '');
        const re = /\{\{([^}]+)\}\}(?:\s*\[(\d+)\/(\d+)\])?/g;
        re.lastIndex = 0;
        const tokens = []; let m;
        while ((m = re.exec(withoutPivot)) !== null) tokens.push({ chord: m[1], start: m.index, end: m.index + m[0].length });
        let pureText = '', lastEnd = 0; const chordPos = [];
        for (const tok of tokens) {
            const before = withoutPivot.slice(lastEnd, tok.start);
            chordPos.push({ chord: tok.chord, pos: pureText.length + before.length });
            pureText += before; lastEnd = tok.end;
        }
        pureText += withoutPivot.slice(lastEnd);
        pureText = pureText.replace(/\s*\[\d+\/\d+\]/g, '');
        const { clean, marks, offsetMap } = extractHighlights(pureText);
        chordPos.forEach(cp => { cp.pos = offsetMap[cp.pos] !== undefined ? offsetMap[cp.pos] : clean.length; });
        let fs = fsBase;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
        while (fs > 6.5 && doc.getTextWidth(clean) > maxW) { fs -= 0.5; doc.setFontSize(fs); }
        return { clean, marks, chordPos, fs, rowH: chordPos.length ? fs * 0.78 + 2.1 : fs * 0.55 + 1.9 };
    };

    const drawChordLyricLineAt = (rawLine, x, yPos, maxW, fsBase) => {
        const { clean, marks, chordPos, fs, rowH } = measureChordLyricLine(rawLine, maxW, fsBase);
        if (!clean.trim() && !chordPos.length) return 0;
        // Ratio relevé à 0.75 (au lieu de 0.56) : le fond arrondi d'un mot en
        // surlignage colorée remonte de fs*0.34mm au-dessus de sa ligne de base
        // (cf. drawHighlightedText) — à 0.56 ce fond mordait sur le bas des
        // accords dessinés juste au-dessus, qui se retrouvaient partiellement
        // masqués par la couleur de fond.
        const lyricY = yPos + (chordPos.length ? rowH * 0.78 : rowH * 0.68);
        if (chordPos.length) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
            const chFs = Math.max(fs - 2.5, 6.5);
            for (const cp of chordPos) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
                const xOff = doc.getTextWidth(clean.slice(0, cp.pos));
                doc.setFont('helvetica', 'bold'); doc.setFontSize(chFs); doc.setTextColor(...CHORD_COLOR);
                doc.text(cp.chord, x + xOff, yPos + rowH * 0.30);
            }
            doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
        }
        if (clean.trim()) drawHighlightedText(clean, marks, x, lyricY, fs);
        return rowH;
    };

    // Wrapper qui garde la sémantique historique (mutate `y`), mais dessine
    // dans la colonne courante (pleine largeur si mode mono, X()/W() sinon).
    const drawChordLyricLine = (rawLine) => {
        const probe = measureChordLyricLine(rawLine, W(), FS);
        if (!probe.clean.trim() && !probe.chordPos.length) return;
        checkPage(probe.rowH);
        drawChordLyricLineAt(rawLine, X(), y, W(), FS);
        y += probe.rowH;
    };

    // Ligne "tablature" (>>>>) ou texte libre sans accord
    const measurePlainLine = (rawLine, isTab, maxW) => {
        const withoutTokens = rawLine.replace(/\s*(?:\[!\]|\[\d+\/\d+\])/g, '').replace(/<[^>]*>/g, '');
        const { clean, marks } = extractHighlights(withoutTokens);
        const font = isTab ? 'courier' : 'helvetica';
        let fs = isTab ? 8 : FS;
        doc.setFont(font, 'normal'); doc.setFontSize(fs);
        while (fs > 6 && doc.getTextWidth(clean) > maxW) { fs -= 0.5; doc.setFontSize(fs); }
        return { clean, marks, fs, font, rowH: 5.3 };
    };
    const drawPlainLineAt = (rawLine, isTab, x, yPos, maxW) => {
        const { clean, marks, fs, font, rowH } = measurePlainLine(rawLine, isTab, maxW);
        if (!clean.trim()) return 0;
        if (isTab) doc.setTextColor(110, 110, 110);
        drawHighlightedText(clean, marks, x, yPos + 3.8, fs, font);
        doc.setTextColor(0, 0, 0);
        return rowH;
    };
    const drawPlainLine = (rawLine, isTab) => {
        const probe = measurePlainLine(rawLine, isTab, W());
        if (!probe.clean.trim()) return;
        checkPage(probe.rowH);
        drawPlainLineAt(rawLine, isTab, X(), y, W());
        y += probe.rowH;
    };

    // ---------- grille de mesures compacte (encadré + notation "| Acc | Acc |") ----------
    // Remplace l'ancienne grille de pastilles colorées par un encadré sobre,
    // de taille modeste, qui reprend la notation "barres de mesure" du gabarit
    // fourni. `repeatCount` affiche un "× N" à droite de l'encadré.
    const buildMeasureRows = (measures, width, fs) => {
        doc.setFont('courier', 'bold'); doc.setFontSize(fs);
        const chordStr = (m) => m.map(e => e.name).join(' ');
        const rows = []; let row = '|', rowW = doc.getTextWidth('|');
        for (const m of measures) {
            const piece = ` ${chordStr(m)} |`;
            const pw = doc.getTextWidth(piece);
            if (rowW + pw > width - 6 && row !== '|') { rows.push(row); row = '|'; rowW = doc.getTextWidth('|'); }
            row += piece; rowW += pw;
        }
        rows.push(row);
        return rows;
    };
    const drawMeasureBarAt = (measures, x, yPos, width, repeatCount) => {
        let fs = 10.5;
        let rows = buildMeasureRows(measures, width, fs);
        while (rows.length > 2 && fs > 7) { fs -= 0.5; rows = buildMeasureRows(measures, width, fs); }
        const lineH = fs * 0.42 + 2.6;
        const padV = 2.4;
        const boxH = rows.length * lineH + padV * 2 - (lineH - fs * 0.42 - 1);
        doc.setDrawColor(195, 205, 215); doc.setFillColor(249, 250, 252); doc.setLineWidth(0.3);
        doc.roundedRect(x, yPos, width, boxH, 1.3, 1.3, 'FD');
        doc.setFont('courier', 'bold'); doc.setTextColor(...CHORD_COLOR);
        let ry = yPos + padV + fs * 0.34;
        rows.forEach(r => { doc.setFontSize(fs); doc.text(r, x + 3, ry); ry += lineH; });
        doc.setTextColor(0, 0, 0);
        if (repeatCount > 1) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...REPEAT_STYLE.rgb);
            doc.text(`× ${repeatCount}`, x + width - 2.5, yPos + boxH - 2, { align: 'right' });
            doc.setTextColor(0, 0, 0);
        }
        return boxH;
    };
    // Usage colonne courante (pleine largeur en mono, X()/W() en double colonne)
    const drawMeasureBar = (measures, repeatCount) => {
        // estimation de hauteur pour le saut de page
        let fs = 10.5, rows = buildMeasureRows(measures, W(), fs);
        while (rows.length > 2 && fs > 7) { fs -= 0.5; rows = buildMeasureRows(measures, W(), fs); }
        const lineH = fs * 0.42 + 2.6, estH = rows.length * lineH + 2.4 * 2;
        checkPage(estH + 4);
        const boxH = drawMeasureBarAt(measures, X(), y, W(), repeatCount);
        y += boxH + 4;
    };

    // ---------- 6) cartouche d'en-tête de section ----------
    const drawSectionHeader = (section) => {
        const style = SECTION_STYLES[section.pfx] || SECTION_STYLES[''];
        const label = section.label || style.label || 'Section';
        const suffix = section.repeatCount > 1 ? ` ×${section.repeatCount}` : '';
        const text = label + suffix;
        const iconSize = 6, padH = 4;
        const bx = X(), bw = W();
        doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
        checkPage(9);
        y += 5;
        const boxY = y - 8.4 / 2 - 1.2;
        doc.setFillColor(...style.bg); doc.setDrawColor(...style.rgb); doc.setLineWidth(0.4);
        doc.roundedRect(bx, boxY, bw, 8.4, 1.6, 1.6, 'FD');
        drawIcon(section.icon, bx + padH + iconSize / 2 - 1, y - 1.4, iconSize, style.rgb);
        doc.setTextColor(...style.rgb);
        doc.text(text, bx + padH + iconSize + 2, y);
        doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
        y += 6.5;
    };

    // ---------- 7) frise de navigation ----------
    const drawRoadmap = (items) => {
        const rowH = 11, gapArrow = 4;
        const bx = X(), bw = W();
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
        const widths = items.map(it => Math.min(doc.getTextWidth(it.label) + 5, 55));
        const totalW = widths.reduce((a, b) => a + b, 0) + gapArrow * (items.length - 1);
        checkPage(rowH + 6);
        y += 2;
        let x = bx + Math.max(0, (bw - totalW) / 2);
        if (totalW > bw) x = bx;
        items.forEach((it, i) => {
            const w = widths[i];
            doc.setFillColor(...REPEAT_STYLE.bg); doc.setDrawColor(...REPEAT_STYLE.border); doc.setLineWidth(0.35);
            doc.roundedRect(x, y - 4.5, w, rowH - 3, 1.4, 1.4, 'FD');
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...REPEAT_STYLE.rgb);
            doc.text(it.label, x + w / 2, y, { align: 'center', maxWidth: w - 2 });
            doc.setFontSize(5.6); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 100, 100);
            doc.text(it.note, x + w / 2, y + 3, { align: 'center', maxWidth: w - 2 });
            doc.setTextColor(0, 0, 0);
            x += w;
            if (i < items.length - 1) {
                doc.setDrawColor(...REPEAT_STYLE.rgb); doc.setLineWidth(0.5);
                doc.line(x + 0.5, y - 1, x + gapArrow - 0.5, y - 1);
                x += gapArrow;
            }
        });
        y += rowH;
    };

    // ---------- 8) classification des lignes d'une section ----------
    // segs: 'blank' | 'measure' (grille rythmique instrumentale) | 'line' (parole, avec ou sans accords)
    const classifyLines = (lines) => {
        const segs = [];
        for (const raw of lines) {
            if (raw.trim() === '') { segs.push({ type: 'blank' }); continue; }
            if (/\{\{[^}]+\}\}/.test(raw) && !lineHasLyricWords(raw)) {
                const measures = detectMeasures(raw);
                if (measures) { segs.push({ type: 'measure', measures, raw }); continue; }
            }
            segs.push({ type: 'line', raw });
        }
        return segs;
    };

    // Si plusieurs blocs `measure` consécutifs sont rythmiquement identiques (ex :
    // la même grille de 4 mesures écrite deux fois de suite dans la source), on les
    // affiche une seule fois avec un "× N" plutôt que de les mettre bout à bout.
    // Vrai si la section a une "coda" instrumentale finale (cf. renderSectionBody
    // Cas B) — l'auto-split ne gère que le Cas C simple, par prudence.
    const hasTrailingMeasuresOf = (section) => {
        const segs = classifyLines(section.lines);
        let codaStart = segs.length;
        while (codaStart > 0 && (segs[codaStart - 1].type === 'measure' || segs[codaStart - 1].type === 'blank')) codaStart--;
        return codaStart < segs.length && segs.slice(codaStart).some(s => s.type === 'measure');
    };

    // Hauteur estimée d'une section rendue en auto-split (2 colonnes internes).
    const estimateSelfSplitHeightAt = (section, width) => {
        const segs = classifyLines(section.lines);
        const isTab = section.pfx === '>>>>';
        const totalBodyH = estimateSeqHeight(segs, width, isTab, false);
        return 11.5 + totalBodyH / 2 + 3;
    };

    const collapseRepeats = (measureSegs) => {
        if (measureSegs.length >= 2) {
            const sig = (m) => m.map(e => e.name).join('|');
            const first = measureSegs[0].measures.map(sig).join(',');
            if (measureSegs.every(s => s.measures.map(sig).join(',') === first)) {
                return { measures: measureSegs[0].measures, repeatCount: measureSegs.length };
            }
        }
        return { measures: measureSegs.flatMap(s => s.measures), repeatCount: 1 };
    };

    // ---------- estimation de hauteur (utilisée pour la viabilité et le
    // placement "toute la section dans la même colonne" du mode double colonne) ----------
    const estimateMeasureBarH = (measures, width) => {
        let fs = 10.5, rows = buildMeasureRows(measures, width, fs);
        while (rows.length > 2 && fs > 7) { fs -= 0.5; rows = buildMeasureRows(measures, width, fs); }
        const lineH = fs * 0.42 + 2.6;
        return rows.length * lineH + 2.4 * 2 + 4; // +4 : marge appliquée après chaque grille (cf. drawMeasureBar)
    };
    const estimateSeqHeight = (segsList, width, isTab, groupMeasures) => {
        let h = 0, i = 0;
        while (i < segsList.length) {
            const seg = segsList[i];
            if (seg.type === 'blank') { h += 2; i++; continue; }
            if (seg.type === 'measure') {
                if (groupMeasures) {
                    const group = [];
                    while (i < segsList.length && segsList[i].type === 'measure') { group.push(segsList[i]); i++; }
                    const { measures } = collapseRepeats(group);
                    h += estimateMeasureBarH(measures, width);
                } else {
                    h += estimateMeasureBarH(seg.measures, width);
                    i++;
                }
                continue;
            }
            if (/\{\{[^}]+\}\}/.test(seg.raw)) h += measureChordLyricLine(seg.raw, width, FS).rowH;
            else h += measurePlainLine(seg.raw, isTab, width).rowH;
            i++;
        }
        return h;
    };

    // ---------- viabilité "double colonne" d'UNE section à une largeur donnée ----------
    // Vraie seulement si aucune de ses lignes de parole n'aurait besoin de
    // réduire sa taille de police pour tenir dans cette largeur.
    const sectionFitsAtWidth = (section, width) => {
        const isTab = section.pfx === '>>>>';
        for (const raw of section.lines) {
            if (raw.trim() === '') continue;
            if (/\{\{[^}]+\}\}/.test(raw) && !lineHasLyricWords(raw)) continue; // grille de mesures : non concernée
            if (/\{\{[^}]+\}\}/.test(raw)) {
                if (measureChordLyricLine(raw, width, FS).fs < FS) return false;
            } else {
                if (measurePlainLine(raw, isTab, width).fs < (isTab ? 8 : FS)) return false;
            }
        }
        return true;
    };

    // ---------- hauteur estimée d'UNE section à une largeur donnée ----------
    const estimateSectionHeightAt = (section, width) => {
        const segs = classifyLines(section.lines);
        const isTab = section.pfx === '>>>>';
        let estH = 11.5; // hauteur fixe du cartouche d'en-tête (drawSectionHeader)
        if (!section.hasLyrics) {
            if (getCompactInstrumentalLine(section, width)) return 11.5; // tient sur une seule ligne
            estH += estimateSeqHeight(segs, width, isTab, true);
            return estH;
        }
        let codaStart = segs.length;
        while (codaStart > 0 && (segs[codaStart - 1].type === 'measure' || segs[codaStart - 1].type === 'blank')) codaStart--;
        const hasTrailingMeasures = codaStart < segs.length && segs.slice(codaStart).some(s => s.type === 'measure');
        const bodySegs = hasTrailingMeasures ? segs.slice(0, codaStart) : segs;
        const codaSegs = hasTrailingMeasures ? segs.slice(codaStart).filter(s => s.type === 'measure') : [];
        const bodyHasContent = bodySegs.some(s => s.type !== 'blank');
        if (hasTrailingMeasures && bodyHasContent) {
            estH += estimateSeqHeight(bodySegs, width, isTab, false) + 6.5;
            estH += estimateMeasureBarH(collapseRepeats(codaSegs).measures, width);
        } else {
            estH += estimateSeqHeight(bodySegs, width, isTab, false);
        }
        return estH;
    };

    // ---------- rendu du corps d'UNE section dans la colonne courante (X()/W()) ----------
    // Rendu séquentiel d'une liste de segments dans la colonne courante
    // (mono pleine largeur, ou l'une des deux colonnes d'une paire / d'un
    // auto-split). Factorisé pour être partagé entre Cas C et l'auto-split.
    const renderSegList = (segsList, isTab) => {
        for (const seg of segsList) {
            if (seg.type === 'blank') { y += 2; continue; }
            if (seg.type === 'measure') { drawMeasureBar(seg.measures, 1); continue; }
            if (/\{\{[^}]+\}\}/.test(seg.raw)) drawChordLyricLine(seg.raw);
            else drawPlainLine(seg.raw, isTab);
        }
    };

    // Trouve le point de coupe (entre deux segments, jamais au milieu de l'un
    // d'eux) le plus équilibré pour scinder une liste de segments en 2 moitiés
    // de hauteur comparable à une largeur donnée.
    const splitSegsByHeight = (segsList, width, isTab) => {
        const heights = segsList.map(seg => {
            if (seg.type === 'blank') return 2;
            if (seg.type === 'measure') return estimateMeasureBarH(seg.measures, width);
            if (/\{\{[^}]+\}\}/.test(seg.raw)) return measureChordLyricLine(seg.raw, width, FS).rowH;
            return measurePlainLine(seg.raw, isTab, width).rowH;
        });
        const total = heights.reduce((a, b) => a + b, 0);
        let acc = 0, cut = segsList.length;
        for (let k = 0; k < segsList.length; k++) {
            acc += heights[k];
            if (acc >= total / 2) { cut = k + 1; break; }
        }
        return cut;
    };

    // ---------- ligne compacte pour section instrumentale courte ----------
    // Si une section sans paroles (Intro, Pont...) ne contient qu'une grille de
    // mesures (éventuellement précédée/suivie d'annotations courtes comme
    // "puis" ou "× 2"), on peut tout tenir sur UNE seule ligne, juste après le
    // nom de la section, au lieu d'un cartouche + une grille dessinée en
    // dessous. Retourne les morceaux à afficher si ça tient dans `width`,
    // sinon null (on retombe alors sur le rendu séquentiel habituel).
    const getCompactInstrumentalLine = (section, width) => {
        if (section.hasLyrics) return null;
        const segs = classifyLines(section.lines).filter(s => s.type !== 'blank');
        if (!segs.length) return null;
        const parts = [];
        let i = 0;
        while (i < segs.length) {
            if (segs[i].type === 'measure') {
                const group = [];
                while (i < segs.length && segs[i].type === 'measure') { group.push(segs[i]); i++; }
                const { measures, repeatCount } = collapseRepeats(group);
                let txt = '| ' + measures.map(m => m.map(e => e.name).join(' ')).join(' | ') + ' |';
                if (repeatCount > 1) txt += ` ×${repeatCount}`;
                parts.push({ text: txt, mono: true });
                continue;
            }
            const raw = segs[i].raw.trim();
            // Uniquement des annotations structurelles courtes ("puis", "× 2"...) —
            // une vraie ligne de texte plus longue disqualifie le mode compact.
            if (!/^(puis\s*:?|ensuite\s*:?|×\s*\d+|x\s*\d+)$/i.test(raw)) return null;
            parts.push({ text: raw, mono: false });
            i++;
        }
        const style = SECTION_STYLES[section.pfx] || SECTION_STYLES[''];
        const label = section.label || style.label || 'Section';
        const iconSize = 6, padH = 4;
        doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
        let usedW = padH + iconSize + 2 + doc.getTextWidth(label) + 4;
        for (const p of parts) {
            doc.setFont(p.mono ? 'courier' : 'helvetica', p.mono ? 'bold' : 'italic');
            doc.setFontSize(p.mono ? 8.5 : 7.5);
            usedW += doc.getTextWidth(p.text) + 3;
        }
        if (usedW > width - padH) return null;
        return parts;
    };

    const drawCompactInstrumentalHeader = (section, parts) => {
        const style = SECTION_STYLES[section.pfx] || SECTION_STYLES[''];
        const label = section.label || style.label || 'Section';
        const iconSize = 6, padH = 4;
        const bx = X(), bw = W();
        doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
        checkPage(9);
        y += 5;
        const boxY = y - 8.4 / 2 - 1.2;
        doc.setFillColor(...style.bg); doc.setDrawColor(...style.rgb); doc.setLineWidth(0.4);
        doc.roundedRect(bx, boxY, bw, 8.4, 1.6, 1.6, 'FD');
        drawIcon(section.icon, bx + padH + iconSize / 2 - 1, y - 1.4, iconSize, style.rgb);
        doc.setTextColor(...style.rgb);
        doc.text(label, bx + padH + iconSize + 2, y);
        let cx = bx + padH + iconSize + 2 + doc.getTextWidth(label) + 4;
        doc.setTextColor(80, 80, 80);
        for (const p of parts) {
            doc.setFont(p.mono ? 'courier' : 'helvetica', p.mono ? 'bold' : 'italic');
            doc.setFontSize(p.mono ? 8.5 : 7.5);
            doc.text(p.text, cx, y);
            cx += doc.getTextWidth(p.text) + 3;
        }
        doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
        y += 6.5;
    };

    const renderSectionBody = (section) => {
        const segs = classifyLines(section.lines);

        // Repère la "coda" instrumentale finale (ex : reprise d'accords après le
        // dernier couplet chanté d'un refrain) : un ou plusieurs blocs `measure`
        // consécutifs en toute fin de section, précédés d'au moins une ligne chantée.
        let codaStart = segs.length;
        while (codaStart > 0 && (segs[codaStart - 1].type === 'measure' || segs[codaStart - 1].type === 'blank')) codaStart--;
        const hasTrailingMeasures = codaStart < segs.length && segs.slice(codaStart).some(s => s.type === 'measure');
        const bodySegs = hasTrailingMeasures ? segs.slice(0, codaStart) : segs;
        const codaSegs = hasTrailingMeasures ? segs.slice(codaStart).filter(s => s.type === 'measure') : [];
        const bodyHasContent = bodySegs.some(s => s.type !== 'blank');

        // Cas A — section purement instrumentale (Intro / Pont / Outro), sans
        // paroles chantées : rendu séquentiel, aligné à gauche. Gère aussi bien
        // une grille de mesures unique qu'un mélange grilles + annotations
        // structurelles ("puis", "× 2"...) dans leur ordre d'origine — jamais de
        // répétition du nom de section. Si tout tient sur une ligne, la grille
        // est affichée directement à côté du nom (cf. getCompactInstrumentalLine).
        if (!section.hasLyrics) {
            const compact = getCompactInstrumentalLine(section, W());
            if (compact) { drawCompactInstrumentalHeader(section, compact); return; }
            drawSectionHeader(section);
            let i = 0;
            while (i < segs.length) {
                if (segs[i].type === 'blank') { y += 2; i++; continue; }
                if (segs[i].type === 'measure') {
                    const group = [];
                    while (i < segs.length && segs[i].type === 'measure') { group.push(segs[i]); i++; }
                    const { measures, repeatCount } = collapseRepeats(group);
                    drawMeasureBar(measures, repeatCount);
                    continue;
                }
                drawPlainLine(segs[i].raw, section.pfx === '>>>>');
                i++;
            }
            return;
        }

        drawSectionHeader(section);

        // Cas B — coda instrumentale en fin de section (ex. Refrain → reprise d'accords) :
        // rendu séquentiel, plus de carte latérale ni de répétition du nom de
        // section (juste un petit séparateur "puis" aligné à gauche).
        if (hasTrailingMeasures && bodyHasContent) {
            renderSegList(bodySegs, section.pfx === '>>>>');
            doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(130, 130, 130);
            checkPage(6);
            y += 1;
            doc.text('puis', X(), y + 3);
            doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal');
            y += 5.5;
            const { measures: codaMeasures, repeatCount } = collapseRepeats(codaSegs);
            drawMeasureBar(codaMeasures, repeatCount);
            return;
        }

        // Cas C — rendu simple (mono-colonne, ou une des deux colonnes d'une paire).
        renderSegList(bodySegs, section.pfx === '>>>>');
    };

    // ---------- une section trop longue toute seule, scindée en 2 colonnes ----------
    // Dernier recours pour éviter un saut de page : uniquement pour une section
    // à paroles (Cas C, sans coda) dont les lignes tiennent en demi-largeur sans
    // réduire la police. Le point de coupe tombe toujours ENTRE deux lignes,
    // jamais au milieu de l'une d'elles.
    const renderSectionSelfSplit = (section) => {
        drawSectionHeader(section);
        const segs = classifyLines(section.lines);
        const isTab = section.pfx === '>>>>';
        const nonBlank = segs.filter(s => s.type !== 'blank');
        if (nonBlank.length < 4) { renderSegList(segs, isTab); return; } // trop court, pas utile de scinder
        const cut = splitSegsByHeight(segs, colW2, isTab);
        const leftSegs = segs.slice(0, cut), rightSegs = segs.slice(cut);
        const startY = y;
        twoColMode = true; curCol = 0; y = startY;
        renderSegList(leftSegs, isTab);
        const yLeft = y;
        curCol = 1; y = startY;
        renderSegList(rightSegs, isTab);
        const yRight = y;
        twoColMode = false; curCol = 0;
        doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.2);
        doc.line(PM + colW2 + COL_GAP2 / 2, startY - 3, PM + colW2 + COL_GAP2 / 2, Math.max(yLeft, yRight) - 2);
        doc.setDrawColor(0, 0, 0);
        y = Math.max(yLeft, yRight) + 2;
    };



    // ---------- rendu d'une paire de sections adjacentes, côte à côte ----------
    const renderPair = (secA, secB) => {
        const startY = y;
        twoColMode = true;
        curCol = 0; y = startY;
        renderSectionBody(secA);
        const yA = y;
        curCol = 1; y = startY;
        renderSectionBody(secB);
        const yB = y;
        twoColMode = false; curCol = 0;
        const bottom = Math.max(yA, yB);
        // séparateur vertical, seulement sur la hauteur réelle de cette paire
        doc.setDrawColor(215, 215, 215); doc.setLineWidth(0.2);
        doc.line(PM + colW2 + COL_GAP2 / 2, startY - 3, PM + colW2 + COL_GAP2 / 2, bottom - 2);
        doc.setDrawColor(0, 0, 0);
        y = bottom + 2;
    };

    // ---------- 9) analyse préalable : meilleur arrangement des paires ----------
    // Apparier bêtement chaque section avec sa voisine directe est trompeur :
    // une intro d'une ligne, adjacente à un couplet de 8 lignes, "tient" tout
    // à fait en demi-largeur — mais l'apparier gâche une colonne (grand vide
    // sous l'intro) ET empêche ce couplet de s'apparier avec le suivant, bien
    // plus proche en hauteur, qui aurait donné un bien meilleur résultat.
    // On calcule donc, pour CHAQUE paire de sections adjacentes possible, le
    // gain réel de place qu'apparier apporterait par rapport à les rendre
    // chacune pleine largeur, puis on choisit par programmation dynamique
    // l'arrangement qui maximise le gain total sur toute la chanson (un
    // schéma classique de type "activity selection" sur une chaîne).
    const MAX_PAIR_H = yMax - 42;
    const MIN_PAIR_SAVING = 15; // mm : sous ce seuil, apparier n'apporte rien de notable
    const PAIR_OVERHEAD = 3;    // mm : léger coût de mise en page d'une paire (marges, séparateur)
    const MIN_PAIR_BALANCE = 0.55; // la plus petite des deux doit faire au moins 55% de la plus grande
    const n = renderPlan.length;
    const heightAt2 = new Array(n).fill(0);
    const fitsAt2 = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
        if (renderPlan[i].type === 'section') {
            heightAt2[i] = estimateSectionHeightAt(renderPlan[i].data, colW2);
            fitsAt2[i] = sectionFitsAtWidth(renderPlan[i].data, colW2);
        }
    }
    const pairSavingAt = (i) => {
        if (renderPlan[i].type !== 'section' || renderPlan[i + 1]?.type !== 'section') return -Infinity;
        const hA = heightAt2[i], hB = heightAt2[i + 1];
        if (!fitsAt2[i] || !fitsAt2[i + 1] || hA > MAX_PAIR_H || hB > MAX_PAIR_H) return -Infinity;
        // Une section courte à côté d'une bien plus longue "économise" de la
        // place sur le papier, mais laisse un grand vide visuel sous elle — et
        // prive surtout la section longue d'un partenaire de taille comparable
        // (ex. Couplet 2) qui aurait donné un bien meilleur résultat. On exige
        // donc un minimum d'équilibre entre les deux hauteurs, pas seulement un
        // gain d'espace positif.
        if (Math.min(hA, hB) / Math.max(hA, hB) < MIN_PAIR_BALANCE) return -Infinity;
        return (hA + hB) - Math.max(hA, hB) - PAIR_OVERHEAD;
    };
    const dp = new Array(n + 1).fill(0);
    const dpChoice = new Array(n).fill('solo');
    for (let i = n - 1; i >= 0; i--) {
        dp[i] = dp[i + 1]; // option "solo" par défaut
        if (i + 1 < n) {
            const saving = pairSavingAt(i);
            if (saving >= MIN_PAIR_SAVING && saving + dp[i + 2] > dp[i]) {
                dp[i] = saving + dp[i + 2];
                dpChoice[i] = 'pair';
            }
        }
    }

    // ---------- rendu du plan, selon l'arrangement retenu ----------
    for (let idx = 0; idx < renderPlan.length; idx++) {
        const item = renderPlan[idx];
        if (item.type === 'roadmap') { drawRoadmap(item.items); continue; }

        if (dpChoice[idx] === 'pair') {
            const hA = heightAt2[idx], hB = heightAt2[idx + 1];
            checkPage(Math.max(hA, hB) + PAIR_OVERHEAD);
            renderPair(item.data, renderPlan[idx + 1].data);
            idx++; // la section suivante vient d'être rendue avec celle-ci
            continue;
        }

        const section = item.data;
        // Section seule qui n'a pas trouvé de partenaire : si elle est sur le
        // point de forcer un saut de page (gros vide en bas de la page en
        // cours), et qu'elle s'y prête (paroles tenant en demi-largeur sans
        // réduire la police, pas de coda finale), on la scinde elle-même en 2
        // colonnes plutôt que de la renvoyer intégralement page suivante.
        let monoH = null;
        if (section.hasLyrics && !hasTrailingMeasuresOf(section) && sectionFitsAtWidth(section, colW2)) {
            monoH = estimateSectionHeightAt(section, contentW);
            if (y + monoH > yMax) {
                const splitH = estimateSelfSplitHeightAt(section, colW2);
                if (y + splitH <= yMax) { renderSectionSelfSplit(section); continue; }
            }
        }
        // Intégrité de section pour le rendu mono classique : sans cette
        // réservation, seules les paires et l'auto-split garantissaient qu'une
        // section ne soit jamais coupée à cheval sur un saut de page — une
        // section rendue seule pouvait donc quand même se retrouver scindée
        // (ses premières lignes sur une page, la fin sur la suivante).
        if (monoH === null) monoH = estimateSectionHeightAt(section, contentW);
        checkPage(monoH + 2);
        renderSectionBody(section);
    }

    // ---------- pied de page ----------
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
        doc.setPage(p); doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(160, 160, 160);
        doc.text(`${title} \u2014 ${artist}  |  p.${p}/${total}`, 105, 293, { align: "center" });
    }
        doc.save(this.currentSong.filename.replace('.json', '.pdf'));
    },
    // ===== FIN GENERATE PDF STANDARD =====

    generateChordsPDF: function() {
        if (!this.currentSong) return;
        const detectMeasures = this.detectMeasures.bind(this);
        const extractChords = (line) => {
            const re=/\{\{([^}]+)\}\}/g,ch=[];let m;
            while((m=re.exec(line))!==null)ch.push(m[1]); return ch;
        };
        const { jsPDF } = window.jspdf;
        const title  = this.currentSong.title  || "Sans titre";
        const artist = this.currentSong.artist || "Artiste inconnu";
        const capo   = parseInt(this.currentSong.capo) || 0;
        const bpm    = this.currentSong.bpm    || '';
        const date   = new Date().toLocaleDateString('fr-FR');
        const PM=12, blkH=9, lineH=5.5, emptyH=2.5, yStart=43, yMax=284;

        // Déduplication par TYPE :
        // - vvvv + [Couplet ou [Verse  → imprimé une seule fois (toutes ces sections partagent le même groupe)
        // - pppp + [Pont, [Bridge ou [Chorus → imprimé une seule fois
        const VVVV_RE = /^\[(couplet|verse)/i;
        const PPPP_RE = /^\[(pont|bridge|chorus)/i;

        // Retourne la clé de groupe si la section est déduplicable, sinon null
        const dedupKey = (pfx, txt) => {
            if (pfx.toLowerCase() === 'vvvv' && VVVV_RE.test(txt.trim())) return 'vvvv:couplet';
            if (pfx.toLowerCase() === 'pppp' && PPPP_RE.test(txt.trim())) return 'pppp:pont';
            return null;
        };

        const doc2 = new jsPDF({ unit:'mm', format:'a4' });
        const chW2 = 210 - PM * 2;
        const chX2 = PM;

        // En-tête
        doc2.setFontSize(18); doc2.setFont("helvetica","bold");
        doc2.text(title, 105, 18, {align:"center"});
        doc2.setFontSize(14); doc2.setFont("helvetica","normal");
        doc2.text(artist, 105, 26, {align:"center"});
        let info2 = `Accords \u2014 G\u00e9n\u00e9r\u00e9 le ${date}`;
        if (capo > 0) info2 += `  |  Capo : ${capo}`;
        if (bpm)      info2 += `  |  BPM : ${bpm}`;
        doc2.setFontSize(9); doc2.text(info2, 105, 33, {align:"center"});
        doc2.setDrawColor(180,180,180); doc2.setLineWidth(0.3);
        doc2.line(10, 37, 200, 37);

        // Fonctions de dessin pour doc2 (mêmes algorithmes, largeur pleine page)
        const drawChords2 = (chords, y) => {
            if (!chords.length) return;
            doc2.setFontSize(10); doc2.setFont("helvetica","bold"); doc2.setTextColor(25,60,180);
            let cx = chX2;
            for (const chord of chords) {
                const cw = doc2.getTextWidth(chord) + 4;
                if (cx + cw > chX2 + chW2) break;
                doc2.setFillColor(220,228,255);
                doc2.setDrawColor(130,150,220); doc2.setLineWidth(0.3);
                doc2.roundedRect(cx - 0.5, y - 3.8, cw, 5, 1, 1, 'FD');
                doc2.setTextColor(25,60,180);
                doc2.text(chord, cx + 1.5, y);
                cx += cw + 2;
            }
            doc2.setTextColor(0,0,0); doc2.setFont("helvetica","normal");
        };

        // drawMeasures2 : chaque mesure occupe exactement 25% de la largeur (4 par ligne max)
        const drawMeasures2 = (measures, startY) => {
            const barH=1.2, mGap=4;
            const mW = (chW2 - mGap * 3) / 4; // largeur fixe = quart de la colonne
            let mx = chX2, curY = startY, col = 0;
            for (const measure of measures) {
                // Nouvelle ligne si déjà 4 mesures sur cette ligne
                if (col === 4) {
                    col = 0; mx = chX2; curY += blkH + 3;
                    checkPage2(blkH + 3);
                }
                let cx = mx;
                for (const e of measure) {
                    const cw = Math.max(mW * e.ratio - 0.3, 2);
                    doc2.setFillColor(255,255,255); doc2.setDrawColor(180,220,180); doc2.setLineWidth(0.15);
                    doc2.roundedRect(cx, curY-blkH+1, cw, blkH, 0.5, 0.5, 'FD');
                    doc2.setFontSize(10); doc2.setFont("helvetica","bold"); doc2.setTextColor(27,94,32);
                    doc2.text(e.name, cx+cw/2, curY-2.5, {align:"center"});
                    const lbl=Math.abs(e.ratio-0.5)<0.001?"1/2":Math.abs(e.ratio-0.25)<0.001?"1/4":
                              Math.abs(e.ratio-0.75)<0.001?"3/4":Math.abs(e.ratio-1/3)<0.001?"1/3":
                              Math.abs(e.ratio-2/3)<0.001?"2/3":`${Math.round(e.ratio*100)}%`;
                    doc2.setFontSize(4.5); doc2.setFont("helvetica","normal"); doc2.setTextColor(150,150,150);
                    doc2.text(lbl, cx+cw/2, curY-0.3, {align:"center"});
                    doc2.setFillColor(102,187,106);
                    doc2.rect(cx, curY+1-barH, cw*e.ratio, barH, 'F'); cx += mW*e.ratio;
                }
                mx += mW + mGap; col++; // avance d'1/4 + gap
            }
            doc2.setTextColor(0,0,0); doc2.setFont("helvetica","normal");
            // Retourner la hauteur totale utilisée
            return Math.ceil(measures.length / 4) * (blkH + 3);
        };

        const fitText2 = (text, maxW, fs, font='helvetica', style='normal') => {
            if (!text) return '';
            doc2.setFontSize(fs); doc2.setFont(font, style);
            while (text.length > 1 && doc2.getTextWidth(text) > maxW) text = text.slice(0,-1);
            return text;
        };

        let y2 = yStart;
        const checkPage2 = (h) => { if (y2+h > yMax) { doc2.addPage(); y2=15; } };

        const pfxMap2 = {
            //'>>>>': {font:'courier',   size:8,  rgb:[80,80,80],   lineAdv:5},
            //'<<<<': {font:'helvetica', size:11, rgb:[66,2,82],    lineAdv:7},
            'rrrr': {font:'helvetica', size:10, rgb:[0,128,0],    lineAdv:7},
            'ssss': {font:'helvetica', size:10, rgb:[6,12,195],   lineAdv:7},
            'vvvv': {font:'helvetica', size:10, rgb:[144,60,7],   lineAdv:7},
            'pppp': {font:'helvetica', size:10, rgb:[10,108,104], lineAdv:7},
        };

        const printedSections = new Set();
        let skipAccords = false;

        for (const line of this.currentSong.content.split('\n')) {
            if (line.trim() === '') { y2 += emptyH; continue; }
            const pfx = line.trim().substring(0,4).toLowerCase();
            console.log('[PDF] pfx=', JSON.stringify(pfx), 'inMap=', !!pfxMap2[pfx], 'skip=', skipAccords, 'line=', line.trim().substring(0,30));

            if (pfxMap2[pfx]) {
                const {font, size, rgb, lineAdv} = pfxMap2[pfx];
                const txt = line.trim().substring(4)
                    .replace(/\{\{[^}]+\}\}/g,'').replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g,'')
                    .replace(/<[^>]*>/g,'').trim();

                const key = dedupKey(pfx, txt);
                if (key) {
                    if (printedSections.has(key)) {
                        // Déjà imprimé ce type → titre orangé + skip accords
                        skipAccords = true;
                        checkPage2(lineAdv + 3);
                        if (txt) {
                            const dupTxt = '[<] ' + txt;
                            doc2.setFontSize(size - 1); doc2.setFont(font, 'bold');
                            const tw2 = doc2.getTextWidth(dupTxt);
                            const bW2 = Math.min(tw2 + 6, chW2);
                            const bH2 = (size-1)*0.4 + 3.6;
                            const bX2 = (210 - bW2) / 2;
                            const bY2 = y2 - (size-1)*0.35 - 1.8;
                            doc2.setFillColor(255,235,235);
                            doc2.setDrawColor(255,107,107);
                            doc2.setLineWidth(0.4);
                            doc2.roundedRect(bX2, bY2, bW2, bH2, 1.5, 1.5, 'FD');
                            doc2.setTextColor(200,50,50);
                            doc2.text(dupTxt, 105, y2, {align:"center"});
                            doc2.setTextColor(0,0,0); doc2.setFont("helvetica","normal");
                        }
                        y2 += lineAdv;
                        continue;
                    }
                    printedSections.add(key);
                    skipAccords = false;
                } else {
                    skipAccords = false;
                }

                checkPage2(lineAdv + 4);
                if (txt) {
                    const pfxStyle = 'bold';
                    doc2.setFontSize(size); doc2.setFont(font, pfxStyle);
                    const tw = doc2.getTextWidth(txt);
                    const padH = 3, padV = 1.8;
                    const boxW = Math.min(tw + padH * 2, chW2);
                    const boxH = size * 0.4 + padV * 2;
                    const boxX = (210 - boxW) / 2;
                    const boxY = y2 - size * 0.35 - padV;
                    const bgMap = {
                        'rrrr': [232,245,233],
                        'ssss': [232,234,246],
                        'vvvv': [255,243,224],
                        'pppp': [224,242,241],
                    };
                    const bg = bgMap[pfx] || [245,245,245];
                    doc2.setFillColor(...bg);
                    doc2.setDrawColor(...rgb);
                    doc2.setLineWidth(0.4);
                    doc2.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5, 'FD');
                    doc2.setTextColor(...rgb);
                    doc2.text(txt, 105, y2, {align:"center"});
                    doc2.setTextColor(0,0,0); doc2.setFont("helvetica","normal");
                }
                y2 += lineAdv;
                continue;
            }

            if (skipAccords) continue;

            const measures2 = detectMeasures(line);
            const chords2   = extractChords(line);
            const hasChords2 = chords2.length > 0 || measures2 !== null;
            if (!hasChords2) continue;

            if (measures2) {
                const totalH = Math.ceil(measures2.length / 4) * (blkH + 3);
                checkPage2(totalH);
                drawMeasures2(measures2, y2);
                y2 += totalH;
            } else if (chords2.length) {
                checkPage2(lineH);
                drawChords2(chords2, y2);
                y2 += lineH;
            }
        }

        const total2 = doc2.internal.getNumberOfPages();
        for (let p=1; p<=total2; p++) {
            doc2.setPage(p); doc2.setFontSize(7); doc2.setFont("helvetica","normal"); doc2.setTextColor(160,160,160);
            doc2.text(`${title} \u2014 ${artist} (Accords)  |  p.${p}/${total2}`, 105, 293, {align:"center"});
        }
        doc2.save(this.currentSong.filename.replace('.json','.pdf'));
    },
    // ===== FIN GENERATE PDF =====

    // ===== GENERATE CHORDS PDF 2 COLONNES =====
    generateChordsPDF2Col: function() {
        if (!this.currentSong) return;
        const detectMeasures = this.detectMeasures.bind(this);
        const extractChords = (line) => {
            const re=/\{\{([^}]+)\}\}/g,ch=[];let m;
            while((m=re.exec(line))!==null)ch.push(m[1]); return ch;
        };
        const { jsPDF } = window.jspdf;
        const title  = this.currentSong.title  || "Sans titre";
        const artist = this.currentSong.artist || "Artiste inconnu";
        const capo   = parseInt(this.currentSong.capo) || 0;
        const bpm    = this.currentSong.bpm    || '';
        const date   = new Date().toLocaleDateString('fr-FR');

        const VVVV_RE = /^\[(couplet|verse)/i;
        const PPPP_RE = /^\[(pont|bridge|chorus)/i;
        const dedupKey = (pfx, txt) => {
            if (pfx.toLowerCase() === 'vvvv' && VVVV_RE.test(txt.trim())) return 'vvvv:couplet';
            if (pfx.toLowerCase() === 'pppp' && PPPP_RE.test(txt.trim())) return 'pppp:pont';
            return null;
        };

        const doc3 = new jsPDF({ unit:'mm', format:'a4' });
        const PM=10, GAP=8;
        const colW = (210 - 2*PM - GAP) / 2;   // ≈ 91mm
        const col0X = PM, col1X = PM + colW + GAP;
        const blkH=9, lineH=5.5, emptyH=2, yStart=43, yMax=284;

        // En-tête
        doc3.setFontSize(18); doc3.setFont("helvetica","bold");
        doc3.text(title, 105, 18, {align:"center"});
        doc3.setFontSize(14); doc3.setFont("helvetica","normal");
        doc3.text(artist, 105, 26, {align:"center"});
        let info3 = `Accords 2 col. — Généré le ${date}`;
        if (capo > 0) info3 += `  |  Capo : ${capo}`;
        if (bpm)      info3 += `  |  BPM : ${bpm}`;
        doc3.setFontSize(9); doc3.text(info3, 105, 33, {align:"center"});
        doc3.setDrawColor(180,180,180); doc3.setLineWidth(0.3);
        doc3.line(10, 37, 200, 37);

        const drawSep = () => {
            doc3.setDrawColor(210,210,210); doc3.setLineWidth(0.2);
            doc3.line(PM + colW + GAP/2, 37, PM + colW + GAP/2, yMax + 5);
        };
        drawSep();

        let curCol = 0, y3 = yStart;
        const colX = () => curCol === 0 ? col0X : col1X;

        const checkPage3 = (h) => {
            if (y3 + h > yMax) {
                if (curCol === 0) { curCol = 1; y3 = yStart; }
                else { doc3.addPage(); drawSep(); curCol = 0; y3 = yStart; }
            }
        };

        const fitText3 = (text, maxW, fs, font='helvetica', style='normal') => {
            if (!text) return '';
            doc3.setFontSize(fs); doc3.setFont(font, style);
            while (text.length > 1 && doc3.getTextWidth(text) > maxW) text = text.slice(0,-1);
            return text;
        };

        const drawChords3 = (chords, y) => {
            if (!chords.length) return;
            doc3.setFontSize(9); doc3.setFont("helvetica","bold"); doc3.setTextColor(25,60,180);
            let cx = colX();
            for (const chord of chords) {
                const cw = doc3.getTextWidth(chord) + 4;
                if (cx + cw > colX() + colW) break;
                doc3.setFillColor(220,228,255);
                doc3.setDrawColor(130,150,220); doc3.setLineWidth(0.3);
                doc3.roundedRect(cx-0.5, y-3.5, cw, 4.8, 1, 1, 'FD');
                doc3.setTextColor(25,60,180);
                doc3.text(chord, cx+1.5, y);
                cx += cw + 2;
            }
            doc3.setTextColor(0,0,0); doc3.setFont("helvetica","normal");
        };

        const drawMeasures3 = (measures, startY) => {
            // 4 mesures par ligne dans chaque colonne
            const mPerRow = 4;
            const mGap = 2;
            const mW = (colW - mGap * (mPerRow - 1)) / mPerRow;
            const barH = 1.2;
            let mx = colX(), curY3 = startY, col3 = 0;
            for (const measure of measures) {
                if (col3 === mPerRow) {
                    col3 = 0; mx = colX(); curY3 += blkH + 3;
                    checkPage3(blkH + 3);
                }
                let cx = mx;
                for (const e of measure) {
                    const cw = Math.max(mW * e.ratio - 0.3, 2);
                    doc3.setFillColor(255,255,255); doc3.setDrawColor(180,220,180); doc3.setLineWidth(0.15);
                    doc3.roundedRect(cx, curY3-blkH+1, cw, blkH, 0.5, 0.5, 'FD');
                    doc3.setFontSize(8); doc3.setFont("helvetica","bold"); doc3.setTextColor(27,94,32);
                    doc3.text(e.name, cx+cw/2, curY3-2.5, {align:"center"});
                    const lbl=Math.abs(e.ratio-0.5)<0.001?"1/2":Math.abs(e.ratio-0.25)<0.001?"1/4":
                              Math.abs(e.ratio-0.75)<0.001?"3/4":Math.abs(e.ratio-1/3)<0.001?"1/3":
                              Math.abs(e.ratio-2/3)<0.001?"2/3":`${Math.round(e.ratio*100)}%`;
                    doc3.setFontSize(4.5); doc3.setFont("helvetica","normal"); doc3.setTextColor(150,150,150);
                    doc3.text(lbl, cx+cw/2, curY3-0.3, {align:"center"});
                    doc3.setFillColor(102,187,106);
                    doc3.rect(cx, curY3+1-barH, cw*e.ratio, barH, 'F'); cx += mW*e.ratio;
                }
                mx += mW + mGap; col3++;
            }
            doc3.setTextColor(0,0,0); doc3.setFont("helvetica","normal");
            return Math.ceil(measures.length / mPerRow) * (blkH + 3);
        };

        const pfxMap3 = {
            'rrrr': {font:'helvetica', size:10, rgb:[0,128,0],    lineAdv:7},
            'ssss': {font:'helvetica', size:10, rgb:[6,12,195],   lineAdv:7},
            'vvvv': {font:'helvetica', size:10, rgb:[144,60,7],   lineAdv:7},
            'pppp': {font:'helvetica', size:10, rgb:[10,108,104], lineAdv:7},
        };

        const printedSections3 = new Set();
        let skipAccords3 = false, sectionStarted = false;
        const sectionGap = 4; // espace visuel (mm) entre sections

        for (const line of this.currentSong.content.split('\n')) {
            // Lignes vides : petit espace seulement si une section a déjà commencé
            if (line.trim() === '') {
                if (sectionStarted) y3 += emptyH;
                continue;
            }
            const pfx = line.trim().substring(0,4).toLowerCase();

            if (pfxMap3[pfx]) {
                const {font, size, rgb, lineAdv} = pfxMap3[pfx];
                const txt = line.trim().substring(4)
                    .replace(/\{\{[^}]+\}\}/g,'').replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g,'')
                    .replace(/<[^>]*>/g,'').trim();
                const key = dedupKey(pfx, txt);

                if (!key || !printedSections3.has(key)) {
                    if (sectionStarted) {
                        // Ajouter un espace entre sections ; sauter de colonne/page
                        // seulement si le contenu ne rentre plus
                        if (y3 + sectionGap + lineAdv > yMax) {
                            if (curCol === 0) { curCol = 1; y3 = yStart; }
                            else { doc3.addPage(); drawSep(); curCol = 0; y3 = yStart; }
                        } else {
                            y3 += sectionGap;
                        }
                    }
                    sectionStarted = true;
                }

                if (key) {
                    if (printedSections3.has(key)) {
                        skipAccords3 = true;
                        checkPage3(lineAdv + 3);
                        if (txt) {
                            const dupTxt = '[<] ' + txt;
                            doc3.setFontSize(size-1); doc3.setFont(font,'bold');
                            const tw2 = doc3.getTextWidth(dupTxt);
                            const bW2 = Math.min(tw2+6, colW);
                            const bH2 = (size-1)*0.4 + 3.6;
                            const bX2 = colX() + (colW - bW2) / 2;
                            const bY2 = y3 - (size-1)*0.35 - 1.8;
                            doc3.setFillColor(255,235,235); doc3.setDrawColor(255,107,107); doc3.setLineWidth(0.4);
                            doc3.roundedRect(bX2, bY2, bW2, bH2, 1.5, 1.5, 'FD');
                            doc3.setTextColor(200,50,50);
                            doc3.text(dupTxt, colX() + colW/2, y3, {align:"center"});
                            doc3.setTextColor(0,0,0); doc3.setFont("helvetica","normal");
                        }
                        y3 += lineAdv; continue;
                    }
                    printedSections3.add(key);
                    skipAccords3 = false;
                } else {
                    skipAccords3 = false;
                }

                checkPage3(lineAdv + 4);
                if (txt) {
                    doc3.setFontSize(size); doc3.setFont(font,'bold');
                    const tw = doc3.getTextWidth(txt);
                    const padH=3, padV=1.8;
                    const boxW = Math.min(tw + padH*2, colW);
                    const boxH = size*0.4 + padV*2;
                    const boxX = colX() + (colW - boxW) / 2;
                    const boxY = y3 - size*0.35 - padV;
                    const bgMap3 = {
                        'rrrr':[232,245,233],'ssss':[232,234,246],
                        'vvvv':[255,243,224],'pppp':[224,242,241],
                    };
                    doc3.setFillColor(...(bgMap3[pfx]||[245,245,245]));
                    doc3.setDrawColor(...rgb); doc3.setLineWidth(0.4);
                    doc3.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5, 'FD');
                    doc3.setTextColor(...rgb);
                    doc3.text(txt, colX() + colW/2, y3, {align:"center"});
                    doc3.setTextColor(0,0,0); doc3.setFont("helvetica","normal");
                }
                y3 += lineAdv; continue;
            }

            if (skipAccords3) continue;

            const measures3 = detectMeasures(line);
            const chords3   = extractChords(line);
            const hasChords3 = chords3.length > 0 || measures3 !== null;
            if (!hasChords3) continue;

            if (measures3) {
                const totalH3 = Math.ceil(measures3.length / 4) * (blkH + 3);
                checkPage3(totalH3);
                drawMeasures3(measures3, y3);
                y3 += totalH3;
            } else if (chords3.length) {
                checkPage3(lineH);
                drawChords3(chords3, y3);
                y3 += lineH;
            }
        }

        const total3 = doc3.internal.getNumberOfPages();
        for (let p=1; p<=total3; p++) {
            doc3.setPage(p); doc3.setFontSize(7); doc3.setFont("helvetica","normal"); doc3.setTextColor(160,160,160);
            doc3.text(`${title} — ${artist} (Accords 2 col.)  |  p.${p}/${total3}`, 105, 293, {align:"center"});
        }
        doc3.save(this.currentSong.filename.replace('.json','_acc2col.pdf'));
    },
    // ===== FIN GENERATE CHORDS PDF 2 COLONNES =====

    // Ouvrir les fichiers Multimedia associés à la chanson

    // Mettre à jour le préfixe en fonction du radiobouton sélectionné
    updatePrefix: function() {
        const selectedOption = document.querySelector('input[name="trackType"]:checked');
        if (selectedOption) {
            this.prefix = selectedOption.value;
            // La piste choisie a changé : le MP3 actuellement chargé (s'il y en a un)
            // ne correspond plus forcément à la sélection — voir _ensureCorrectMp3().
            this._loadedMp3Key = null;
            console.log("Préfixe mis à jour :", this.prefix); // Optionnel : pour le débogage
        }
    },

    // Chemin du MP3 correspondant à la chanson courante ET à la piste sélectionnée
    // (N / bch / bcg / bgu) — source unique utilisée par openMP3File() et
    // _ensureCorrectMp3() pour éviter toute divergence entre les deux.
    _expectedMp3Path: function() {
        if (!this.currentSong || !this.currentSong.filename) return null;
        const baseFilename = this.currentSong.filename.replace('.json', '.mp3');
        const mp3Filename = `${this.prefix || ''}${baseFilename}`;
        switch (this.prefix) {
            case "bch": return `/songs/multimedia/mp3/bch/${mp3Filename}`;
            case "bcg": return `/songs/multimedia/mp3/bcg/${mp3Filename}`;
            case "bgu": return `/songs/multimedia/mp3/bgu/${mp3Filename}`;
            default:    return `/songs/multimedia/mp3/${mp3Filename}`;
        }
    },

    // S'assure que le MP3 chargé dans le lecteur caché correspond bien à la
    // chanson ET à la piste (N/bch/bcg/bgu) actuellement sélectionnées, et le
    // recharge sinon — évite de rejouer par erreur le MP3 d'une chanson
    // précédente restée chargée (ex: karaoké interrompu sans avoir été arrêté).
    // Ne lance PAS la lecture (chargement silencieux uniquement).
    _ensureCorrectMp3: async function() {
        if (!this.currentSong) return false;
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer) return false;

        const expectedKey = `${this.currentSong.filename}|${this.prefix}`;
        if (this._loadedMp3Key === expectedKey && audioPlayer.src && audioPlayer.src !== window.location.href) {
            return true; // déjà le bon fichier, rien à refaire
        }

        const mp3Path = this._expectedMp3Path();
        if (!mp3Path) return false;

        audioPlayer.pause();
        if (this._currentMp3BlobUrl) {
            URL.revokeObjectURL(this._currentMp3BlobUrl);
            this._currentMp3BlobUrl = null;
        }
        try {
            await this._loadAndPlayMp3(mp3Path, audioPlayer, { autoPlay: false });
            this._loadedMp3Key = expectedKey;
            return !!(audioPlayer.src && audioPlayer.src !== window.location.href);
        } catch (e) {
            return false;
        }
    },

    // Initialiser les boutons de contrôle audio
    // Met à jour l'état du bouton Karaoké selon la présence d'un MP3 chargé
    updateKaraokeButtonState: function() {
        const btn = document.getElementById('karaokeButton');
        if (!btn) return;
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        const hasMp3 = audioPlayer && audioPlayer.src && audioPlayer.src !== window.location.href;
        // Le bouton n'est vraiment utile que si, en plus du MP3, AU MOINS un des
        // deux marquages (accords ⏱ et/ou paroles 🎤) a été effectué — mêmes seuils
        // que _updateKaraokeModeAvailability, pour rester cohérent avec les options
        // du radio Accords/Paroles/Les 2.
        const song = this.currentSong;
        const hasAcc = !!(song && song.karaokeTimestamps && song.karaokeTimestamps.length >= 4);
        const hasWords = !!(song && song.wordTimestamps && song.wordTimestamps.length);
        const canOpen = hasMp3 && (hasAcc || hasWords);
        btn.disabled = !canOpen;
        btn.style.opacity = canOpen ? '' : '0.4';
        btn.title = !hasMp3
            ? 'Chargez un MP3 pour activer le karaoké'
            : (canOpen ? 'Lancer le karaoké' : "Marquez d'abord les accords (⏱) et/ou les paroles (🎤) dans l'éditeur");
        this._updateKaraokeModeAvailability();
    },

    // Active/désactive chaque option Accords/Paroles/Les 2 selon les données
    // réellement disponibles pour la chanson affichée, et choisit automatiquement
    // le meilleur mode par défaut (garde le choix de l'utilisateur s'il reste valide).
    _updateKaraokeModeAvailability: function() {
        const song = this.currentSong;
        const hasAcc = !!(song && song.karaokeTimestamps && song.karaokeTimestamps.length >= 4);
        const hasWords = !!(song && song.wordTimestamps && song.wordTimestamps.length);
        const hasBoth = hasAcc && hasWords;

        const accEl = document.getElementById('karaokeModeAcc');
        const parolesEl = document.getElementById('karaokeModeParoles');
        const bothEl = document.getElementById('karaokeModeBoth');
        if (!accEl || !parolesEl || !bothEl) return;

        accEl.disabled = !hasAcc;
        parolesEl.disabled = !hasWords;
        bothEl.disabled = !hasBoth;
        [accEl, parolesEl, bothEl].forEach(el => {
            const label = el.closest('label');
            if (label) { label.style.opacity = el.disabled ? '0.35' : ''; label.style.cursor = el.disabled ? 'not-allowed' : 'pointer'; }
        });

        const current = this.karaokeContentMode;
        const currentStillValid =
            (current === 'acc' && hasAcc) ||
            (current === 'paroles' && hasWords) ||
            (current === 'both' && hasBoth);
        if (!currentStillValid) {
            // Ordre de préférence par défaut : les deux marquages > accords seuls >
            // paroles seules > AUCUN marquage. Dans ce dernier cas (page fraîchement
            // ouverte, rien encore marqué), on affiche "Paroles" plutôt que "Accords"
            // comme option par défaut (grisée) : le marquage des paroles (🎤 Marquer /
            // import LRC) est désormais le point d'entrée le plus naturel.
            this.karaokeContentMode = hasBoth ? 'both' : (hasAcc ? 'acc' : 'paroles');
        }
        const toCheck = document.getElementById(
            this.karaokeContentMode === 'both' ? 'karaokeModeBoth' :
            this.karaokeContentMode === 'paroles' ? 'karaokeModeParoles' : 'karaokeModeAcc'
        );
        if (toCheck) toCheck.checked = true;
    },

    _setKaraokeContentMode: function(mode) {
        this.karaokeContentMode = mode;
    },

    initAudioControls: function() {
        const playButton = document.getElementById("playMP3Button");
        const pauseButton = document.getElementById("pauseMP3Button");
        const stopButton = document.getElementById("stopMP3Button");
        const audioPlayer = document.getElementById("hiddenAudioPlayer");

        if (playButton && audioPlayer) {
            playButton.addEventListener("click", () => {
                audioPlayer.play().catch(e => this.showError("Erreur de lecture : " + e.message));
            });
        }

        if (pauseButton && audioPlayer) {
            pauseButton.addEventListener("click", () => {
                audioPlayer.pause();
            });
        }

        if (stopButton && audioPlayer) {
            stopButton.addEventListener("click", () => {
                audioPlayer.pause();
                audioPlayer.currentTime = 0;
                // Libérer le blob MP3 en mémoire
                if (this._currentMp3BlobUrl) {
                    URL.revokeObjectURL(this._currentMp3BlobUrl);
                    this._currentMp3BlobUrl = null;
                    audioPlayer.src = '';
                }
            });
        }

        // Vitesse de lecture (0.5× à 1.5×) : sans effet sur la justesse du calage
        // karaoké/défilement, qui se base sur audioPlayer.currentTime (position dans
        // l'audio) et non sur le temps réel écoulé — utile pour travailler lentement
        // un passage difficile.
        const speedSelect = document.getElementById('mp3SpeedSelect');
        if (speedSelect && audioPlayer) {
            speedSelect.addEventListener('change', () => {
                audioPlayer.playbackRate = parseFloat(speedSelect.value) || 1;
            });
        }

        // Synchroniser l'icône du bouton MP3 de l'éditeur (▶/⏸) avec l'état réel de
        // lecture, quel que soit l'endroit d'où la lecture a été démarrée/arrêtée.
        const editorMp3Btn = document.getElementById('editor-mp3-toggle');
        if (editorMp3Btn && audioPlayer) {
            audioPlayer.addEventListener('play', () => {
                editorMp3Btn.textContent = '⏸ MP3';
                editorMp3Btn.title = 'Pause MP3';
            });
            audioPlayer.addEventListener('pause', () => {
                editorMp3Btn.textContent = '▶ MP3';
                editorMp3Btn.title = 'Lecture MP3';
            });
        }

        this._bindMp3SeekControl('editorMp3Seek', 'editorMp3TimeCurrent', 'editorMp3TimeTotal');
        this._bindMp3SeekControl('sidebarMp3Seek', 'sidebarMp3TimeCurrent', 'sidebarMp3TimeTotal');
    },

    // ===== BARRE(S) DE POSITIONNEMENT MP3 =====
    // Permet de repositionner la lecture n'importe où dans le morceau (curseur
    // glissé ou boutons ⏪/⏩ 5s), sans devoir réécouter depuis le début pour
    // reprendre un marquage (⏱/🎤) à un endroit précis, ou retravailler un
    // passage particulier en répétition — gain de temps direct. Utilisée à 3
    // endroits (éditeur, panneau latéral de la fiche chanson, overlay karaoké) :
    // _bindMp3SeekControl peut être appelée plusieurs fois avec des ids
    // différents, chaque barre restant indépendante dans le DOM mais pilotant
    // et lisant TOUJOURS le même <audio> caché (voir initAudioControls) — donc
    // toutes restent synchronisées entre elles et avec le défilement auto
    // (qui lit lui aussi audioPlayer.currentTime via l'évènement timeupdate,
    // voir startAutoScroll) quel que soit l'endroit d'où on agit.
    _bindMp3SeekControl(seekId, curId, totId) {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        const seek = document.getElementById(seekId);
        if (!audioPlayer || !seek) return;
        const curEl = curId ? document.getElementById(curId) : null;
        const totEl = totId ? document.getElementById(totId) : null;

        const fmt = (s) => {
            if (!isFinite(s) || s < 0) s = 0;
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${String(sec).padStart(2, '0')}`;
        };

        // Remplissage visuel de la barre (voir style.css : dégradé piloté par cette
        // variable CSS) — Chrome/Safari n'ont pas d'équivalent à ::-moz-range-progress
        // de Firefox, cette variable + un background en dégradé est la technique
        // standard pour obtenir un rendu "rempli" cohérent sur tous les navigateurs.
        const updateFill = () => {
            const max = parseFloat(seek.max) || 0;
            const pct = max > 0 ? (parseFloat(seek.value) / max) * 100 : 0;
            seek.style.setProperty('--range-progress', pct + '%');
        };

        // Pendant qu'on fait glisser le curseur, timeupdate ne doit pas réécraser
        // sa position (sinon il "saute" pendant le glissé) — on ne resynchronise
        // qu'une fois relâché.
        let dragging = false;
        seek.addEventListener('pointerdown', () => { dragging = true; });
        seek.addEventListener('pointerup', () => { dragging = false; });
        seek.addEventListener('input', () => {
            if (curEl) curEl.textContent = fmt(parseFloat(seek.value));
            updateFill();
        });
        seek.addEventListener('change', () => {
            audioPlayer.currentTime = parseFloat(seek.value) || 0;
        });

        audioPlayer.addEventListener('loadedmetadata', () => {
            seek.max = audioPlayer.duration || 0;
            if (totEl) totEl.textContent = fmt(audioPlayer.duration);
            updateFill();
        });
        audioPlayer.addEventListener('timeupdate', () => {
            if (dragging) return;
            seek.value = audioPlayer.currentTime;
            if (curEl) curEl.textContent = fmt(audioPlayer.currentTime);
            updateFill();
        });
        // 'emptied' se déclenche quand src est vidé (bouton ⏹, voir initAudioControls
        // plus haut, qui libère le blob MP3) — sans ça la barre garderait affichée la
        // position/durée du morceau précédent après un Stop.
        audioPlayer.addEventListener('emptied', () => {
            seek.max = 0;
            seek.value = 0;
            if (curEl) curEl.textContent = '0:00';
            if (totEl) totEl.textContent = '0:00';
            updateFill();
        });

        updateFill(); // état initial (au cas où l'audio a déjà des métadonnées avant ce binding)
    },

    // Avance/recule la lecture de `deltaSeconds` (négatif pour reculer), sans
    // dépasser les bornes du morceau — utilisé par les boutons ⏪/⏩ (éditeur,
    // panneau latéral, overlay karaoké).
    seekMp3(deltaSeconds) {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer) return;
        const dur = isFinite(audioPlayer.duration) ? audioPlayer.duration : Infinity;
        audioPlayer.currentTime = Math.min(Math.max(0, audioPlayer.currentTime + deltaSeconds), dur);
    },

    // Positionnement par clic direct sur la barre de progression de l'overlay
    // karaoké (proportionnel à la largeur cliquée) — le seul endroit où le
    // seek se fait par clic sur une barre de progression plutôt qu'un
    // <input type="range"> dédié, par manque de place dans cette interface
    // volontairement épurée (plein écran, peu de contrôles visibles).
    seekKaraokeProgress(event) {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        const bar = document.getElementById('karaoke-progress-bar');
        if (!audioPlayer || !bar || !isFinite(audioPlayer.duration) || audioPlayer.duration <= 0) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        audioPlayer.currentTime = ratio * audioPlayer.duration;
    },
    // ===== FIN BARRE(S) DE POSITIONNEMENT MP3 =====



    openMP3File: function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }

        const mp3Path = this._expectedMp3Path();

        // Récupérer l'élément audio caché
        const audioPlayer = document.getElementById("hiddenAudioPlayer");

        // Arrêter toute lecture en cours
        audioPlayer.pause();
        audioPlayer.currentTime = 0;

        // Libérer l'éventuel blob précédent pour éviter les fuites mémoire
        if (this._currentMp3BlobUrl) {
            URL.revokeObjectURL(this._currentMp3BlobUrl);
            this._currentMp3BlobUrl = null;
        }

        this.updateKaraokeButtonState();
        this._loadedMp3Key = `${this.currentSong.filename}|${this.prefix}`;
        this._loadAndPlayMp3(mp3Path, audioPlayer, { autoPlay: true });
    },

    // Charge le MP3 via fetch (blob en mémoire) pour éviter les décrochages
    // réseau sur tablette (iPad Safari). Affiche une barre de progression pendant
    // le téléchargement, puis lance la lecture une fois le fichier entièrement reçu.
    _loadAndPlayMp3: async function(mp3Path, audioPlayer, options = {}) {
        const autoPlay = options.autoPlay !== false; // true par défaut (comportement historique)
        const speedDisplay  = document.getElementById("currentScrollSpeed");
        const scrollLabel   = document.getElementById("scrollSpeedDisplay");

        // Indicateur de chargement dans le widget durée
        if (speedDisplay) speedDisplay.textContent = '⏳ …';

        try {
            const response = await fetch(mp3Path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Lire le flux par morceaux pour afficher la progression
            const contentLength = response.headers.get('Content-Length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                if (total > 0 && speedDisplay) {
                    const pct = Math.round((received / total) * 100);
                    speedDisplay.textContent = `⏳ ${pct}%`;
                }
            }

            // Assembler le blob et créer un object URL local
            const blob = new Blob(chunks, { type: 'audio/mpeg' });
            const blobUrl = URL.createObjectURL(blob);
            this._currentMp3BlobUrl = blobUrl;

            audioPlayer.src = blobUrl;
            audioPlayer.load();

            // Récupérer la durée dès que les métadonnées sont disponibles
            const onMeta = () => {
                const dur = audioPlayer.duration;
                if (!dur || !isFinite(dur) || dur <= 0) {
                    audioPlayer.addEventListener('durationchange', onMeta, { once: true });
                    return;
                }
                this.mp3Duration = dur;
                const min = Math.floor(dur / 60);
                const sec = Math.floor(dur % 60).toString().padStart(2, '0');
                if (speedDisplay) speedDisplay.textContent = `${min}:${sec}`;
                if (scrollLabel) scrollLabel.title = 'Durée du MP3';
            };
            audioPlayer.addEventListener('loadedmetadata', onMeta, { once: true });

            // Surveillance des décrochages résiduels (réseau coupé après blob ← ne devrait pas arriver)
            const onStall = () => {
                console.warn('[MP3] stall détecté — tentative de reprise');
                audioPlayer.play().catch(() => {});
            };
            audioPlayer.removeEventListener('stall', this._mp3StallHandler);
            this._mp3StallHandler = onStall;
            audioPlayer.addEventListener('stall', onStall);

            if (autoPlay) {
                await audioPlayer.play();
                console.log('[MP3] Lecture démarrée depuis blob local');
            }
            this.updateKaraokeButtonState();

        } catch (err) {
            console.error('[MP3] Erreur de chargement :', err);
            // Fallback : lecture directe via URL réseau (comportement original)
            if (speedDisplay) speedDisplay.textContent = '⚠ réseau';
            audioPlayer.src = mp3Path;
            audioPlayer.addEventListener('loadedmetadata', () => {
                const dur = audioPlayer.duration;
                if (isFinite(dur) && dur > 0) {
                    this.mp3Duration = dur;
                    const min = Math.floor(dur / 60);
                    const sec = Math.floor(dur % 60).toString().padStart(2, '0');
                    if (speedDisplay) speedDisplay.textContent = `${min}:${sec}`;
                }
            }, { once: true });
            if (autoPlay) {
                audioPlayer.play().catch(e => this.showError('Impossible de lire le fichier MP3. ' + e.message));
            } else {
                audioPlayer.load();
            }
        }
    },

    openGPFile: function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }

        const gpFilename = this.currentSong.filename.replace('.json', '.gp');

        fetch(`http://${window.location.hostname}:3001/open-gp?file=${encodeURIComponent(gpFilename)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    this.showError(`Impossible d'ouvrir Guitar Pro : ${data.error}`);
                }
            })
            .catch(() => {
                this.showError("Le serveur local (server.js) ne semble pas démarré. Lance 'node server.js' dans ton terminal.");
            });
    },

        openMP4File: function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }

        const songFilename = this.currentSong.filename // || this.currentSong.title;
        let baseFilename = songFilename.replace('.json', '.mp4');

        // Remplacer les espaces par %20 pour l'URL
        //baseFilename = encodeURIComponent(baseFilename);
        //this.showError(baseFilename);
        //this.showError(this.currentSong.filename);

        // Utiliser http://localhost:8000 au lieu de file://
        const mp4Path = `/songs/multimedia/mp4/${baseFilename}`;

        window.open(mp4Path, '_blank');
    },

        openPDFFile: async function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }
        const pdfTypeRadio = document.querySelector('input[name="pdfType"]:checked');
        const pdfMode = pdfTypeRadio ? pdfTypeRadio.value : 'ori';
        const baseFilename = this.currentSong.filename.replace('.json', '.pdf');
        const subFolder = pdfMode === 'acc' ? 'acc/' : '';
        const pdfPath = `/songs/multimedia/pdf/${subFolder}${baseFilename}`;

        // Vérifier si le fichier existe avant d'ouvrir
        try {
            const check = await fetch(
                `/check-files?song=${encodeURIComponent(this.currentSong.filename)}`
            );
            if (check.ok) {
                const files = await check.json();
                const exists = pdfMode === 'acc' ? files.pdfacc : files.pdf;
                if (!exists) {
                    this.showError(`Fichier PDF "${pdfMode === 'acc' ? 'accords' : 'original'}" non trouvé.\nGénérez-le d'abord avec le bouton "Générer PDF".`);
                    return;
                }
            }
        } catch(e) {
            // Serveur Node non dispo : on tente quand même l'ouverture
        }
        window.open(pdfPath, '_blank');
    },

    //auto scroll

    // Propriétés pour l'auto-scroll
    autoScrollInterval: null,
    isAutoScrolling: false,
    defaultBPM: 200, // Vitesse par défaut

    // Toggle Auto-Scroll
    toggleAutoScroll: function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée. Veuillez charger une chanson d'abord.");
            return;
        }
        if (this.isAutoScrolling) {
            this._stopAutoScroll();
            return;
        }
        // Forcer le mode sans MP3 : mettre le player en pause
        // pour que startAutoScroll choisisse le mode timer.
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (audioPlayer && !audioPlayer.paused) audioPlayer.pause();

        this._startCountdown(() => {
            this.startAutoScroll();
            this.isAutoScrolling = true;
            this._setScrollBtnsActive(true);
        });
    },

    // Lance le MP3 depuis le début PUIS démarre le scroll (mode karaoke-sync ou audio)
    toggleScrollWithMP3: async function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }
        if (this.isAutoScrolling) {
            this._stopAutoScroll();
            return;
        }
        // S'assurer que c'est bien le MP3 de CETTE chanson et de la piste sélectionnée
        // (N/bch/bcg/bgu) qui est chargé — pas celui d'une chanson précédente restée
        // en pause dans le lecteur.
        const ok = await this._ensureCorrectMp3();
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!ok || !audioPlayer || !audioPlayer.src || audioPlayer.src === window.location.href) {
            this.showError("Aucun MP3 disponible pour cette chanson.");
            return;
        }
        audioPlayer.currentTime = 0;
        this._startCountdown(() => {
            audioPlayer.play()
                .then(() => {
                    this.startAutoScroll();
                    this.isAutoScrolling = true;
                    this._setScrollBtnsActive(true);
                })
                .catch(e => this.showError("Erreur lecture MP3 : " + e.message));
        });
    },

    // ── Décompte BPM avant le scroll ─────────────────────────────────────
    // Bipe sur le tempo de la chanson (Web Audio API) et affiche le chiffre
    // en overlay. Appelle onDone() quand le décompte est terminé.
    // Nombre de temps = numérateur de la mesure (ex: 4 pour 4/4, 3 pour 3/4).
    _startCountdown(onDone) {
        // BPM depuis la chanson ou défaut
        const bpm  = Math.max(40, Math.min(240,
            parseInt(this.currentSong && this.currentSong.bpm) || 100));
        const beatMs = 60000 / bpm; // ms par noire

        // Nombre de beats du décompte = numérateur de la mesure
        const timeSig = (this.currentSong && this.currentSong.timeSig) || '4/4';
        const beats   = parseInt(timeSig.split('/')[0]) || 4;

        // Créer ou réutiliser l'overlay
        let overlay = document.getElementById('countdown-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'countdown-overlay';
            overlay.style.cssText = `
                position:fixed; inset:0; z-index:10002;
                display:flex; flex-direction:column;
                align-items:center; justify-content:center;
                background:rgba(0,0,0,0.55);
                pointer-events:none;
                font-family:Arial,sans-serif;
            `;
            document.body.appendChild(overlay);
        }
        // Le décompte doit rester visible quand le scroll est lancé depuis un plein écran
        // (frame accords ou paroles) : z-index au-dessus d'eux (10000/10001) et, en plein écran
        // NATIF, rattachement à l'élément plein écran — seul son contenu est affiché alors.
        {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            const host = fsEl || document.body;
            if (overlay.parentNode !== host) host.appendChild(overlay);
        }

        // Contexte audio Web Audio API
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = AudioCtx ? new AudioCtx() : null;

        const _bip = (isFirst) => {
            if (!ctx) return;
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type      = 'sine';
            o.frequency.value = isFirst ? 1100 : 880; // aigu sur le 1
            g.gain.setValueAtTime(0.35, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            o.start(); o.stop(ctx.currentTime + 0.13);
        };

        const _show = (num, isFirst) => {
            overlay.innerHTML = `
                <div style="
                    font-size:clamp(80px,18vw,180px);
                    font-weight:900;
                    color:${isFirst ? '#7daa80' : '#fff'};
                    line-height:1;
                    text-shadow:0 4px 32px rgba(0,0,0,0.6);
                    animation:cdPop .15s ease-out;
                ">${num}</div>
                <div style="
                    font-size:clamp(14px,2vw,22px);
                    color:rgba(255,255,255,0.7);
                    margin-top:12px;
                    letter-spacing:.1em;
                ">${bpm} BPM · ${timeSig}</div>`;
        };

        // Injecter l'animation si pas déjà présente
        if (!document.getElementById('cd-style')) {
            const s = document.createElement('style');
            s.id = 'cd-style';
            s.textContent = `
                @keyframes cdPop {
                    from { transform:scale(1.4); opacity:.5; }
                    to   { transform:scale(1);   opacity:1;  }
                }`;
            document.head.appendChild(s);
        }

        overlay.style.display = 'flex';

        let beat = 0;
        _show(beats - beat, beat === 0);
        _bip(beat === 0);
        beat++;

        const iv = setInterval(() => {
            if (beat < beats) {
                const remaining = beats - beat;
                _show(remaining, remaining === beats); // vert sur le 1er (= numéro plein)
                _bip(remaining === beats);
                beat++;
            } else {
                // Fin du décompte
                clearInterval(iv);
                this._countdownInterval = null;
                overlay.style.display = 'none';
                if (ctx) ctx.close().catch(() => {});
                this._countdownAudioCtx = null;
                onDone();
            }
        }, beatMs);
        this._countdownInterval = iv;
        this._countdownAudioCtx = ctx;

        // Permettre l'annulation avec Échap
        const onKey = (e) => {
            if (e.key === 'Escape') {
                clearInterval(iv);
                this._countdownInterval = null;
                overlay.style.display = 'none';
                if (ctx) ctx.close().catch(() => {});
                this._countdownAudioCtx = null;
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey, { once: true });
    },

    // Met les deux boutons en état actif (vert ⏸) ou les réinitialise
    _setScrollBtnsActive: function(active) {
        const btn1 = document.getElementById('scrollWithMP3Btn');
        const btn2 = document.getElementById('toggleAutoScroll');
        // Boutons ♪ Scroll des plein écrans (accords, paroles) : même état que btn1
        const fsBtns = document.querySelectorAll('.fs-scroll-btn');
        if (active) {
            if (btn1) { btn1.innerHTML = '⏸ ♪'; btn1.classList.add('scroll-btn--active'); }
            if (btn2) { btn2.innerHTML = '⏸ ▶'; btn2.classList.add('scroll-btn--active'); }
            fsBtns.forEach(b => { b.innerHTML = '⏸ ♪'; b.classList.add('scroll-btn--active'); });
        } else {
            if (btn1) { btn1.innerHTML = '♪ Scroll'; btn1.classList.remove('scroll-btn--active'); }
            if (btn2) { btn2.innerHTML = '▶ Scroll'; btn2.classList.remove('scroll-btn--active'); }
            fsBtns.forEach(b => { b.innerHTML = '♪ Scroll'; b.classList.remove('scroll-btn--active'); });
        }
    },

    // Démarrer l'auto-scroll synchronisé
    // Scroll manuel d'un badge vers le centre de son conteneur scrollable,
    // sans toucher au body ni à aucun autre ancêtre.
    // Surligne l'accord actif dans les DEUX panneaux et scrolle chacun.
    _applyChordHighlight(activeIdx, badgeIndex, markers, lyricsEl, chordsEl) {
        // -- Panneau paroles --
        const badges = Array.from(
            lyricsEl.querySelectorAll('.lyric-chord-badge:not(.lyric-chord-empty)')
        );
        lyricsEl.querySelectorAll('.chord-active-scroll, .chord-sung-scroll')
            .forEach(el => el.classList.remove('chord-active-scroll', 'chord-sung-scroll'));

        if (activeIdx >= 0) {
            for (let i = 0; i <= activeIdx; i++) {
                const bi = badgeIndex[i];
                if (bi == null || bi >= badges.length) continue;
                badges[bi].classList.add(i < activeIdx ? 'chord-sung-scroll' : 'chord-active-scroll');
            }
            const activeBi = badgeIndex[activeIdx];
            if (activeBi != null && activeBi < badges.length)
                this._scrollBadgeIntoContainer(badges[activeBi], lyricsEl);
        }

        // -- Panneau accords --
        if (!chordsEl) return;
        chordsEl.querySelectorAll('.chord-active-scroll, .chord-sung-scroll')
            .forEach(el => el.classList.remove('chord-active-scroll', 'chord-sung-scroll'));
        if (activeIdx < 0) return;

        const marker  = markers[activeIdx];
        const chordsLine = chordsEl.querySelector(`[data-line-index="${marker.lineIndex}"]`);
        if (!chordsLine) return;

        // Surligner la ligne entière
        chordsLine.classList.add('chord-active-scroll');

        // Surligner l'accord actif (chordIndex dans la ligne). En mode "mesures" les accords
        // sont des .measure-chord-name (des <div>, pas des <span>) : sans ce cas, seule la
        // ligne entière était surlignée et jamais l'accord précis.
        const measureNames = chordsLine.querySelectorAll('.measure-chord-name');
        const chordEls = measureNames.length
            ? Array.from(measureNames)
            : Array.from(chordsLine.querySelectorAll('span'))
                .filter(s => s.textContent.trim() && !s.querySelector('span'));
        const activeSpan = chordEls[marker.chordIndex];
        if (activeSpan) activeSpan.classList.add('chord-active-scroll');

        // Scroller le panneau accords
        this._scrollBadgeIntoContainer(chordsLine, chordsEl);
    },

    _scrollBadgeIntoContainer(badge, container) {
        const badgeTop    = badge.offsetTop;
        const badgeHeight = badge.offsetHeight;
        const containerH  = container.clientHeight;
        const target      = badgeTop - (containerH / 2) + (badgeHeight / 2);
        container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    },

    startAutoScroll: function() {
        const chordsElement = document.getElementById("display-chords");
        const lyricsElement = document.getElementById("song-content-display");
        const audioPlayer   = document.getElementById("hiddenAudioPlayer");

        if (!chordsElement || !lyricsElement) return;

        // ---------------------------------------------------------------
        // MODE KARAOKÉ-SYNC : timestamps d'accords disponibles → scroll
        // et surlignage accord par accord, centré verticalement.
        // ---------------------------------------------------------------
        const timestamps = this.currentSong?.karaokeTimestamps;
        if (
            timestamps && timestamps.length &&
            audioPlayer && !audioPlayer.paused &&
            isFinite(audioPlayer.duration) && audioPlayer.duration > 0
        ) {
            this._syncMode = 'karaoke';

            // Trier les repères par temps croissant
            const markers = [...timestamps].sort((a, b) => a.time - b.time);

            // Récupérer tous les badges d'accords dans #song-content-display une seule fois
            // Chaque badge est un .lyric-chord-badge non vide, dans l'ordre du DOM (= ordre de la chanson)
            const _getBadges = () =>
                Array.from(lyricsElement.querySelectorAll('.lyric-chord-badge:not(.lyric-chord-empty)'));

            // Supprimer toute surbrillance précédente
            const _clearHighlights = () => {
                lyricsElement.querySelectorAll('.chord-active-scroll, .chord-sung-scroll')
                    .forEach(el => el.classList.remove('chord-active-scroll', 'chord-sung-scroll'));
            };

            // Index du dernier repère actif affiché (évite les mises à jour inutiles)
            let _lastActiveIdx = -2; // -2 = jamais initialisé

            this._syncHandler = () => {
                const dur = audioPlayer.duration;
                if (!dur || !isFinite(dur) || dur <= 0) return;

                const t = audioPlayer.currentTime;

                // Affichage temps restant
                const remaining = dur - t;
                const min = Math.floor(remaining / 60);
                const sec = Math.floor(remaining % 60).toString().padStart(2, '0');
                const speedDisplay = document.getElementById("currentScrollSpeed");
                if (speedDisplay) speedDisplay.textContent = `-${min}:${sec}`;

                // Compensation de la latence d'affichage :
                // on avance artificiellement le temps de lecture de HIGHLIGHT_OFFSET
                // pour que le badge s'allume légèrement avant le temps théorique.
                const HIGHLIGHT_OFFSET = 0.3; // secondes (ajustable)
                const tLook = t + HIGHLIGHT_OFFSET;

                // Trouver le repère actif (le dernier dont le temps <= tLook)
                let activeIdx = -1;
                for (let i = 0; i < markers.length; i++) {
                    if (markers[i].time <= tLook) activeIdx = i;
                    else break;
                }

                // Rien de nouveau à afficher
                if (activeIdx === _lastActiveIdx) return;
                _lastActiveIdx = activeIdx;

                if (activeIdx < 0) return;

                if (!this._karaokeBadgeMap || this._karaokeBadgeMap.markerCount !== markers.length) {
                    // Reconstruire la carte marker → badgeIndex
                    // Les markers ont {lineIndex, chordIndex} dans l'ordre de la chanson.
                    // On les trie d'abord par (lineIndex, chordIndex) pour avoir l'ordre DOM.
                    const sortedByPos = [...markers].map((m, origIdx) => ({ ...m, origIdx }))
                        .sort((a, b) => a.lineIndex !== b.lineIndex
                            ? a.lineIndex - b.lineIndex
                            : a.chordIndex - b.chordIndex);
                    // badgeIndex[origIdx] = index dans badges[]
                    const badgeIndex = new Array(markers.length);
                    sortedByPos.forEach((m, badgePos) => { badgeIndex[m.origIdx] = badgePos; });
                    this._karaokeBadgeMap = { badgeIndex, markerCount: markers.length };
                }

                const { badgeIndex } = this._karaokeBadgeMap;

                // Surligner + scroller les deux panneaux
                this._applyChordHighlight(activeIdx, badgeIndex, markers, lyricsElement, chordsElement);

                if (t >= dur) this._stopAutoScroll();
            };

            audioPlayer.addEventListener('timeupdate', this._syncHandler);
            audioPlayer.addEventListener('ended', () => this._stopAutoScroll(), { once: true });

            // Remettre les deux panneaux en haut
            lyricsElement.scrollTop = 0;
            chordsElement.scrollTop = 0;
            return;
        }

        // ---------------------------------------------------------------
        // MODE AUDIO : MP3 en cours mais pas de timestamps → scroll linéaire
        // ---------------------------------------------------------------
        if (audioPlayer && !audioPlayer.paused && isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
            this._syncMode = 'audio';

            this._syncHandler = () => {
                const dur = audioPlayer.duration;
                if (!dur || !isFinite(dur) || dur <= 0) return;
                const progress = audioPlayer.currentTime / dur;
                lyricsElement.scrollTop = progress * (lyricsElement.scrollHeight - lyricsElement.clientHeight);
                chordsElement.scrollTop = progress * (chordsElement.scrollHeight - chordsElement.clientHeight);

                const remaining = dur - audioPlayer.currentTime;
                const min = Math.floor(remaining / 60);
                const sec = Math.floor(remaining % 60).toString().padStart(2, '0');
                const speedDisplay = document.getElementById("currentScrollSpeed");
                if (speedDisplay) speedDisplay.textContent = `-${min}:${sec}`;

                if (progress >= 1) this._stopAutoScroll();
            };

            audioPlayer.addEventListener('timeupdate', this._syncHandler);
            audioPlayer.addEventListener('ended', () => this._stopAutoScroll(), { once: true });

            lyricsElement.scrollTop = 0;
            chordsElement.scrollTop = 0;
            return;
        }

        // ---------------------------------------------------------------
        // MODE FALLBACK : timer basé sur la durée MP3 stockée ou le BPM
        // ---------------------------------------------------------------
        this._syncMode = 'timer';

        const tsMarkers = this.currentSong?.karaokeTimestamps;
        const hasTimestamps = tsMarkers && tsMarkers.length > 0;

        lyricsElement.scrollTop = 0;
        chordsElement.scrollTop = 0;

        // ── MODE TIMESTAMP SANS MP3 ──────────────────────────────────────
        // Même comportement que le mode karaoke-sync (MP3 + timestamps) :
        // scroll piloté exclusivement par scrollIntoView({ block:'center' })
        // sur l'accord actif — pas de scrollTop linéaire.
        if (hasTimestamps) {
            const timerMarkers = [...tsMarkers].sort((a, b) => a.time - b.time);

            // Précalculer l'index de badge DOM pour chaque repère (ordre ligne+chordIndex)
            const sorted = timerMarkers.map((m, i) => ({ ...m, _i: i }))
                .sort((a, b) => a.lineIndex !== b.lineIndex
                    ? a.lineIndex - b.lineIndex : a.chordIndex - b.chordIndex);
            const badgeMap = new Array(timerMarkers.length);
            sorted.forEach((m, badgePos) => { badgeMap[m._i] = badgePos; });

            let lastActiveIdx = -2;
            const timerStart = Date.now();
            const HIGHLIGHT_OFFSET = 0.3;

            // Durée totale pour arrêter proprement le scroll en fin de morceau
            let totalMs;
            if (this.mp3Duration && this.mp3Duration > 0) {
                totalMs = this.mp3Duration * 1000;
            } else {
                // Estimer depuis le dernier timestamp + un peu de marge
                const lastT = timerMarkers[timerMarkers.length - 1].time;
                totalMs = (lastT + 8) * 1000;
            }

            this.autoScrollInterval = setInterval(() => {
                const tVirtual = (Date.now() - timerStart) / 1000 + HIGHLIGHT_OFFSET;

                // Arrêt en fin de durée
                if (tVirtual - HIGHLIGHT_OFFSET >= totalMs / 1000) {
                    this._stopAutoScroll();
                    return;
                }

                // Repère actif
                let activeIdx = -1;
                for (let i = 0; i < timerMarkers.length; i++) {
                    if (timerMarkers[i].time <= tVirtual) activeIdx = i;
                    else break;
                }

                if (activeIdx === lastActiveIdx) return;
                lastActiveIdx = activeIdx;

                // Surligner + scroller les deux panneaux
                this._applyChordHighlight(activeIdx, badgeMap, timerMarkers, lyricsElement, chordsElement);
            }, 50);
            return;
        }

        // ── MODE LINÉAIRE SANS TIMESTAMPS ────────────────────────────────
        const lyricsMax = lyricsElement.scrollHeight - lyricsElement.clientHeight;
        const chordsMax = chordsElement.scrollHeight - chordsElement.clientHeight;
        const maxScrollHeight = Math.max(lyricsMax, chordsMax) || 1;

        let totalDurationMs;
        if (this.mp3Duration && this.mp3Duration > 0) {
            totalDurationMs = this.mp3Duration * 1000;
        } else {
            const bpm = parseInt(document.getElementById("bpm")?.value) || this.defaultBPM;
            totalDurationMs = (maxScrollHeight / 2) * (30000 / bpm);
        }

        const scrollInterval = 50;
        const totalTicks = totalDurationMs / scrollInterval;
        const scrollStep = maxScrollHeight / totalTicks;
        this.scrollProgress = 0;

        this.autoScrollInterval = setInterval(() => {
            this.scrollProgress += scrollStep / maxScrollHeight;
            lyricsElement.scrollTop = this.scrollProgress * lyricsMax;
            chordsElement.scrollTop = this.scrollProgress * chordsMax;
            if (this.scrollProgress >= 1) this._stopAutoScroll();
        }, scrollInterval);
    },

    // Arrêter l'auto-scroll proprement (tous modes)
    _stopAutoScroll: function() {
        const audioPlayer = document.getElementById("hiddenAudioPlayer");
        if (this._syncHandler && audioPlayer) {
            audioPlayer.removeEventListener('timeupdate', this._syncHandler);
            this._syncHandler = null;
        }
        clearInterval(this.autoScrollInterval);
        this.autoScrollInterval = null;
        this.isAutoScrolling = false;
        this.scrollProgress = 0;
        this._karaokeBadgeMap = null;

        // Retirer les surbrillances dans les deux panneaux
        ['#song-content-display', '#display-chords'].forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.querySelectorAll('.chord-active-scroll, .chord-sung-scroll')
                .forEach(e => e.classList.remove('chord-active-scroll', 'chord-sung-scroll'));
        });

        this._syncMode = null;

        // Restaurer l'affichage BPM/durée
        const bpm = this.currentSong?.bpm || this.defaultBPM;
        const speedDisplay = document.getElementById("currentScrollSpeed");
        if (speedDisplay) {
            if (this.mp3Duration > 0) {
                const min = Math.floor(this.mp3Duration / 60);
                const sec = Math.floor(this.mp3Duration % 60).toString().padStart(2, '0');
                speedDisplay.textContent = `${min}:${sec}`;
            } else {
                speedDisplay.textContent = bpm + ' bpm';
            }
        }

        this._setScrollBtnsActive(false);
    },

    // Mettre à jour la vitesse de défilement quand BPM change
    updateScrollSpeed: function() {
        if (this.isAutoScrolling && this._syncMode === 'timer') {
            this._stopAutoScroll();
            this.isAutoScrolling = true;
            this.startAutoScroll();
            this._setScrollBtnsActive(true);
        }
    },
    // fin auto scroll

    // ===== METRONOME =====
    renderMetronomeWidget: function() {
        // Injecter dans .song-main (frame paroles), pas dans #song-display
        const songMain = document.querySelector('.song-main');
        if (!songMain) return;
        let w = document.getElementById('metronome-widget');
        if (!w) {
            w = document.createElement('div'); w.id = 'metronome-widget'; w.className = 'metronome-widget';
            songMain.appendChild(w);
        }
        const bpm = (this.currentSong && this.currentSong.bpm) ? parseInt(this.currentSong.bpm) : 80;
        this.metronome.bpm = bpm;
        const beats = this.metronome.beats || 4;
        w.style.display = 'block';
        w.innerHTML = `
            <div class="metro-header">
                <span class="metro-title">♩ Métronome</span>
                <button class="metro-close" id="metro-close-btn">✕</button>
            </div>
            <div class="metro-beats" id="metro-beats">
                ${Array.from({length:beats},(_,i)=>`<div class="metro-beat" id="metro-beat-${i}"></div>`).join('')}
            </div>
            <div class="metro-controls">
                <button class="metro-btn" id="metro-toggle">▶</button>
                <div class="metro-bpm-group">
                    <input type="range" id="metro-bpm-slider" min="40" max="220" value="${bpm}" class="metro-slider">
                    <span id="metro-bpm-display">${bpm} BPM</span>
                </div>
                <div class="metro-sig">
                    <button class="metro-sig-btn" id="metro-beats-minus">−</button>
                    <span id="metro-sig-display">${beats}/4</span>
                    <button class="metro-sig-btn" id="metro-beats-plus">+</button>
                </div>
            </div>`;
        document.getElementById('metro-toggle').onclick    = () => this.toggleMetronome();
        document.getElementById('metro-close-btn').onclick = () => this.stopMetronome(true);
        document.getElementById('metro-bpm-slider').oninput = (e) => {
            this.metronome.bpm = parseInt(e.target.value);
            document.getElementById('metro-bpm-display').textContent = this.metronome.bpm + ' BPM';
            if (this.metronome.running) { this.stopMetronome(false); this.startMetronome(); }
        };
        document.getElementById('metro-beats-minus').onclick = () => {
            if (this.metronome.beats > 2) { this.metronome.beats--; this.renderMetronomeWidget(); if (this.metronome.running) { this.stopMetronome(false); this.startMetronome(); } }
        };
        document.getElementById('metro-beats-plus').onclick = () => {
            if (this.metronome.beats < 8) { this.metronome.beats++; this.renderMetronomeWidget(); if (this.metronome.running) { this.stopMetronome(false); this.startMetronome(); } }
        };
    },
    toggleMetronome: function() { this.metronome.running ? this.stopMetronome(false) : this.startMetronome(); },
    startMetronome: function() {
        if (!this.metronome.audioCtx) this.metronome.audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        this.metronome.beat = 0; this.metronome.running = true;
        const btn = document.getElementById('metro-toggle'); if (btn) btn.textContent = '⏹';
        const tick = () => {
            if (!this.metronome.running) return;
            const beat=this.metronome.beat, beats=this.metronome.beats, isFirst=beat===0;
            const ctx=this.metronome.audioCtx, osc=ctx.createOscillator(), gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = isFirst ? 880 : 440;
            gain.gain.setValueAtTime(isFirst?0.6:0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+(isFirst?0.08:0.05));
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.1);
            for (let i=0;i<beats;i++) { const el=document.getElementById(`metro-beat-${i}`); if(el) el.classList.remove('active','first'); }
            const ab = document.getElementById(`metro-beat-${beat}`);
            if (ab) { ab.classList.add('active'); if(isFirst) ab.classList.add('first'); setTimeout(()=>ab.classList.remove('active','first'),150); }
            this.metronome.beat = (beat+1)%beats;
            this.metronome.timerId = setTimeout(tick, 60000/this.metronome.bpm);
        };
        tick();
    },
    stopMetronome: function(hide) {
        this.metronome.running=false; clearTimeout(this.metronome.timerId); this.metronome.beat=0;
        const btn=document.getElementById('metro-toggle'); if(btn) btn.textContent='▶';
        for(let i=0;i<this.metronome.beats;i++){const el=document.getElementById(`metro-beat-${i}`);if(el)el.classList.remove('active','first');}
        if (hide) { const w=document.getElementById('metronome-widget'); if(w) w.style.display='none'; }
    },
    // ===== FIN METRONOME =====

    // Propriété pour suivre l'état du toggle
    showChords: true, // Par défaut, on affiche les accords

    // Fonction pour basculer l'affichage des accords
    toggleChordsVisibility: function() {
        this.showChords = !this.showChords;
        if (this.currentSong) {
            this.displaySong();
        }
    },

    // Fonction pour basculer l'affichage du panneau des accords
    toggleChordsPanel: function() {
        const panel = document.querySelector(".song-layout .chords-panel");
        if (panel) {
            panel.style.display = panel.style.display === "none" ? "block" : "none";
        }
    },

    // Sauvegarder une chanson
    async saveSong() {
        const title = document.getElementById("song-title").value.trim();
        const artist = document.getElementById("song-artist").value.trim();
        const capo = document.getElementById("capo").value.trim();
        const content = document.getElementById("song-editor").value.trim();
        const recommendedCapo = document.getElementById("recommendedCapo").value.trim();
        const bpm     = document.getElementById("bpm").value.trim();
        const timeSig = document.getElementById("time-sig").value.trim();
        const keyEl   = document.getElementById("song-key");
        const key     = keyEl ? keyEl.value.trim() : "";
        const liste   = document.getElementById("song-liste").value
            .split(',').map(l => l.trim()).filter(Boolean).join(', ');
        const rythm   = document.getElementById("song-rythm").value.trim();
        const tuto = document.getElementById("song-tuto").value.trim();
        const kfn  = document.getElementById("song-kfn").value.trim();
        const tutoEmbed = document.getElementById("song-tuto-embed").checked;
        const kfnEmbed = document.getElementById("song-kfn-embed").checked;
        const ok = document.getElementById("song-ok").checked;

         if (!title || !artist || !content) {
            this.showError("Veuillez remplir tous les champs.");
            return;
        }

        const filename = this.formatFilename(title);
        const songData = { title, artist, capo, content, recommendedCapo, bpm };
        if (timeSig) songData.timeSig = timeSig;
        if (key)     songData.key     = key;
        if (liste)   songData.liste   = liste;
        if (rythm)   songData.rythm   = rythm;
        if (tuto) { songData.tuto = tuto; songData.tuto_embed = tutoEmbed; }
        if (kfn)  { songData.kfn = kfn;   songData.kfn_embed  = kfnEmbed; }
        if (ok)   { songData.ok = true; }
        else {
            // Case 'OK' décochée : la chanson repasse en phase de mise au point —
            // remise à zéro du compteur d'ouvertures (voir _resetOpenCount), pour
            // qu'un futur re-marquage 'OK' reparte sur un décompte propre plutôt
            // que d'hériter des ouvertures d'avant la reprise en main.
            this._resetOpenCount(filename);
        }
        if (this.karaokeLines && this.karaokeLines.length) {
            songData.karaokeTimestamps = this.karaokeLines;
        } else if (
            this.editingFile &&
            this.currentSong &&
            this.currentSong.filename === this.editingFile &&
            this.currentSong.karaokeTimestamps
        ) {
            // Ne récupérer les repères de currentSong QUE si on édite bien CETTE
            // même chanson (filename identique à editingFile). Sans ce garde-fou,
            // une nouvelle chanson créée juste après avoir consulté une autre
            // chanson héritait par erreur des repères karaoké de cette dernière
            // (régression constatée sur "ma place dans le trafic").
            songData.karaokeTimestamps = this.currentSong.karaokeTimestamps;
        }
        // wordTimestamps : marquage indépendant des paroles (mot par mot), même
        // garde-fou que karaokeTimestamps ci-dessus.
        if (this.wordMarkLines && this.wordMarkLines.length) {
            songData.wordTimestamps = this.wordMarkLines;
        } else if (
            this.editingFile &&
            this.currentSong &&
            this.currentSong.filename === this.editingFile &&
            this.currentSong.wordTimestamps
        ) {
            songData.wordTimestamps = this.currentSong.wordTimestamps;
        }
        

        // Sauvegarder le fichier — enregistrement automatique via l'API pour
        // tout le monde (admin compris) : le serveur écrit dans le répertoire
        // maître pour l'admin, dans le répertoire personnel pour les autres
        // (voir AccordsAuth.saveMySong / servAcc.js). Plus de téléchargement
        // ni de collage manuel dans data/songs-index.json.
        const indexEntryObj = { title, artist, capo, bpm, recommendedCapo, file: filename };

        if (window.AccordsAuth) {
            try {
                await window.AccordsAuth.saveMySong(filename, songData, indexEntryObj);
                alert("Chanson sauvegardée !");
            } catch (e) {
                this.showError("Impossible de sauvegarder la chanson : " + e.message);
                return;
            }
        } else {
            // Filet de sécurité si auth-gate.js n'est pas chargé (ancien
            // comportement, à ne plus utiliser normalement).
            this.downloadFile(JSON.stringify(songData, null, 2), filename, "application/json");
            const indexEntry = `  {\n    "title": "${title}",\n    "artist": "${artist}",\n    "capo": "${capo}",\n    "bpm": "${bpm}",\n   "recommendedCapo": "${recommendedCapo}",\n    "file": "${filename}"\n  }`;
            try {
                await navigator.clipboard.writeText(indexEntry);
                alert("Chanson sauvegardée !\nCopiez l'entrée suivante dans data/songs-index.json :\n\n" + indexEntry);
            } catch (e) {
                alert("Chanson sauvegardée !\nAjoutez manuellement cette entrée à data/songs-index.json :\n\n" + indexEntry);
            }
        }

        // Recharger l'index des chansons
        this.loadSongsIndex();
        this.showTab(0);
    },

    // Supprimer la chanson actuellement en cours d'édition (répertoire maître
    // pour l'admin, répertoire personnel sinon) — action irréversible, confirmée
    // par un message d'avertissement explicite avant tout appel serveur.
    async deleteSong() {
        if (!this.editingFile) return; // sécurité : rien à supprimer (nouvelle chanson)

        const title = document.getElementById("song-title").value.trim() || this.editingFile;
        const confirmed = confirm(
            `Supprimer définitivement "${title}" ?\n\n` +
            `Cette action est irréversible : la chanson sera retirée de votre répertoire` +
            (window.AccordsAuth && window.AccordsAuth.currentUser && window.AccordsAuth.currentUser.role === 'admin'
                ? " (répertoire maître, visible par tous les comptes)."
                : " personnel.")
        );
        if (!confirmed) return;

        try {
            if (window.AccordsAuth) {
                await window.AccordsAuth.deleteMySong(this.editingFile);
            }
            alert(`"${title}" a été supprimée.`);
        } catch (e) {
            this.showError("Impossible de supprimer la chanson : " + e.message);
            return;
        }

        this.clearEditor();
        this.loadSongsIndex();
        this.showTab(0);
    },

    // Télécharger un fichier
    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Formater le nom de fichier
    formatFilename(title) {
        return title.toLowerCase()
            .replace(/[^a-z0-9éèàùêâîôûç -]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') + ".json";
    },

    // Afficher un onglet
    showTab(tabIndex) {
        document.getElementById("home-tab").style.display   = tabIndex === 0 ? "block" : "none";
        document.getElementById("editor-tab").style.display = tabIndex === 1 ? "block" : "none";
        document.getElementById("lists-tab").style.display  = tabIndex === 2 ? "block" : "none";
        document.getElementById("song-display").style.display = "none";

        // La barre d'outils à gauche n'a d'utilité qu'en mode édition ou à l'ouverture
        // d'une chanson (cf. displaySong()) : masquée sur Accueil et Listes.
        document.getElementById("sidebar").style.display = tabIndex === 1 ? "block" : "none";

        // Classe active : ordre HTML des boutons 0=Accueil 1=Listes 2=NvlleChanson
        const btnOrder = [0, 2, 1];
        document.querySelectorAll('#tabs .tab').forEach((btn, i) =>
            btn.classList.toggle('active', btnOrder[tabIndex] === i)
        );

        document.getElementById("transpose-down").style.display  = tabIndex === 1 ? "block" : "none";
        document.getElementById("transpose-up").style.display    = tabIndex === 1 ? "block" : "none";
        document.getElementById("transpose-reset").style.display = tabIndex === 1 ? "block" : "none";
        document.getElementById("back-button").style.display  = "none";
        document.getElementById("edit-button").style.display  = "none";
        document.getElementById("save-button").style.display  = tabIndex === 1 ? "block" : "none";
        document.getElementById("clear-button").style.display = tabIndex === 1 ? "block" : "none";
        // Le bouton Supprimer n'a de sens qu'en modification d'une chanson
        // existante (this.editingFile) — pas lors de la création d'une nouvelle.
        document.getElementById("delete-button").style.display = (tabIndex === 1 && this.editingFile) ? "block" : "none";
    },

    // Retour à l'accueil
    goBack() {
        this.showTab(this._lastTab ?? 0);
    },

    // Charger la chanson courante dans l'éditeur pour modification
    editSong() {
        if (!this.currentSong) return;

        document.getElementById("song-title").value      = this.currentSong.title || "";
        document.getElementById("song-artist").value     = this.currentSong.artist || "";
        document.getElementById("capo").value            = this.currentSong.capo || "";
        document.getElementById("recommendedCapo").value = this.currentSong.recommendedCapo || "";
        document.getElementById("bpm").value             = this.currentSong.bpm || "";
        document.getElementById("time-sig").value        = this.currentSong.timeSig || "";
        const songKeyEditEl = document.getElementById("song-key");
        if (songKeyEditEl) songKeyEditEl.value = this.currentSong.key || "";
        document.getElementById("song-liste").value      = this.currentSong.liste || "";
        document.getElementById("song-rythm").value      = this.currentSong.rythm || "";
        this._updateRythmPreview(this.currentSong.rythm || "");
        document.getElementById("song-editor").value     = this.originalContent || this.currentSong.content || "";
        document.getElementById("song-tuto").value        = this.currentSong.tuto || "";
        document.getElementById("song-kfn").value         = this.currentSong.kfn || "";
        document.getElementById("song-tuto-embed").checked = this.currentSong.tuto_embed !== false;
        document.getElementById("song-kfn-embed").checked  = this.currentSong.kfn_embed !== false;
        document.getElementById("song-ok").checked = !!this.currentSong.ok;

        // Stocker le nom de fichier pour la sauvegarde
        this.editingFile = this.currentSong.filename;

        // Recharger les repères karaoké existants
        this.karaokeLines = this.currentSong.karaokeTimestamps
            ? [...this.currentSong.karaokeTimestamps]
            : [];
        this._allChordsForKaraoke = null;  // sera recalculé au premier ⏱ Marquer
        this._karaokeCurrentChordIdx = 0;
        const display = document.getElementById('karaokeTimerDisplay');
        if (display) display.textContent = this.karaokeLines.length
            ? `${this.karaokeLines.length} repères existants — appuyez sur ⏱ Marquer pour continuer`
            : '';

        // Recharger le minutage des paroles existant (système indépendant)
        this.wordMarkLines = this.currentSong.wordTimestamps
            ? [...this.currentSong.wordTimestamps]
            : [];
        this._allWordsForKaraoke = null;  // sera recalculé au premier 🎤 Marquer
        this._wordCurrentIdx = 0;
        const wordDisplay = document.getElementById('wordTimerDisplay');
        if (wordDisplay) wordDisplay.textContent = this.wordMarkLines.length
            ? `${this.wordMarkLines.length} mots déjà minutés — appuyez sur 🎤 Marquer pour continuer`
            : '';
        this._updateMarkingHint();

        // Instantané du contenu pour lequel karaokeLines/wordMarkLines ci-dessus sont
        // connus valides — sert de référence à _remapMarkersIfNeeded() pour détecter
        // et compenser un décalage de ligne causé par une édition ultérieure.
        this._markersContentSnapshot = this.currentSong.content || '';

        this.updatePreview();
        this.showTab(1);
    },

    // Effacer l'éditeur
    clearEditor() {
        document.getElementById("song-title").value = "";
        document.getElementById("song-artist").value = "";
        document.getElementById("capo").value = "";
        document.getElementById("recommendedCapo").value = "";
        document.getElementById("bpm").value = "";
        document.getElementById("time-sig").value = "";
        const songKeyClearEl = document.getElementById("song-key");
        if (songKeyClearEl) songKeyClearEl.value = "";
        document.getElementById("song-liste").value = "";
        document.getElementById("song-rythm").value = "";
        const rp = document.getElementById("rythm-preview-editor");
        if (rp) rp.innerHTML = "";
        document.getElementById("song-editor").value = "";
        document.getElementById("song-preview").innerHTML = "";
        document.getElementById("song-tuto").value = "";
        document.getElementById("song-kfn").value = "";
        document.getElementById("song-tuto-embed").checked = true;
        document.getElementById("song-kfn-embed").checked = true;
        document.getElementById("song-ok").checked = false;
        this.karaokeLines = [];
        this.wordMarkLines = [];
        // Détacher complètement toute référence à une chanson précédemment
        // consultée/éditée : sans ça, currentSong/editingFile restaient sur
        // l'ancienne chanson et saveSong() pouvait lui réemprunter ses
        // repères karaoké lors de la création d'une nouvelle chanson.
        this.currentSong = null;
        this.editingFile = null;
        this._karaokeCurrentChordIdx = 0;
        this._allChordsForKaraoke = null;
        this._wordCurrentIdx = 0;
        this._allWordsForKaraoke = null;
        this._markersContentSnapshot = null;
        const display = document.getElementById('karaokeTimerDisplay');
        if (display) display.textContent = '';
        const wordDisplay = document.getElementById('wordTimerDisplay');
        if (wordDisplay) wordDisplay.textContent = '';
        this._updateMarkingHint();
    },

    // Ouvrir l'onglet "Nouvelle Chanson" en partant d'un état totalement
    // vierge (formulaire vide + aucune référence à une chanson précédente).
    // À utiliser à la place d'un simple showTab(1) pour ce bouton.
    newSong() {
        this.clearEditor();
        this.showTab(1);
    },

    // Insérer {{}} à la position du curseur dans l'éditeur
    // ===== HELPER MESURES =====
    chordDurationHelper: function(textarea) {
        const pos = textarea.selectionStart, text = textarea.value;
        const before = text.slice(0, pos);
        const openIdx = before.lastIndexOf('{{');
        if (openIdx === -1) { this._hideChordHelper(); return; }
        const closeIdx = text.indexOf('}}', openIdx);
        if (closeIdx === -1 || pos > closeIdx + 20) { this._hideChordHelper(); return; }
        if (!text.slice(openIdx + 2, closeIdx).trim()) { this._hideChordHelper(); return; }
        this._showChordHelper(this._getCaretCoords(textarea, closeIdx + 2), openIdx, closeIdx, textarea);
    },
    _showChordHelper: function(coords, openIdx, closeIdx, textarea) {
        // En plein écran natif, seuls les éléments à l'intérieur de l'élément mis en
        // plein écran restent visibles à l'écran — la bulle doit donc être ré-attachée
        // à ce conteneur (au lieu de document.body) tant que le plein écran est actif.
        const targetParent = document.fullscreenElement || document.body;
        let b = document.getElementById('chord-helper-bubble');
        if (!b) {
            b = document.createElement('div'); b.id = 'chord-helper-bubble'; b.className = 'chord-helper-bubble';
            targetParent.appendChild(b);
            document.addEventListener('mousedown', (e) => { if (!b.contains(e.target) && e.target !== textarea) this._hideChordHelper(); });
        } else if (b.parentElement !== targetParent) {
            targetParent.appendChild(b);
        }
        // Détecter si cet accord est déjà marqué PIVOT (balise [!] après la durée éventuelle)
        const afterTag = textarea.value.slice(closeIdx + 2);
        const isPivot = /^\s*(?:\[\d+\/\d+\]\s*)?\[!\]/.test(afterTag);

        b.innerHTML = '<span class="chord-helper-label">Durée :</span>' +
            ['2/2','1/1','1/2','1/4','3/4','1/3','2/3','1/8','3/8'].map(f => `<button class="chord-helper-btn" data-frac="${f}">${f}</button>`).join('') +
            '<button class="chord-helper-clear">✕</button>' +
            `<button class="chord-helper-pivot${isPivot ? ' active' : ''}" title="Marquer/démarquer cet accord comme PIVOT : jamais calculé automatiquement par ⏱⚡, attend toujours un marquage manuel (utile pour les changements de rythme).">📌 Pivot</button>`;
        // position:fixed = relatif au viewport, donc pas besoin d'ajouter le scroll
        // de la page (et ça reste correct quel que soit le conteneur parent actuel).
        const r = textarea.getBoundingClientRect();
        b.style.left = (r.left + coords.left) + 'px';
        b.style.top  = (r.top  + coords.top  - 42) + 'px';
        b.style.display = 'flex';
        b.querySelectorAll('.chord-helper-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const t = textarea.value, f = btn.dataset.frac;
                const after = t.slice(closeIdx + 2).replace(/^\s*\[\d+\/\d+\]/, '');
                textarea.value = t.slice(0, closeIdx + 2) + `[${f}]` + after;
                textarea.setSelectionRange(closeIdx + 2 + `[${f}]`.length, closeIdx + 2 + `[${f}]`.length);
                textarea.dispatchEvent(new Event('input')); this._hideChordHelper();
            };
        });
        b.querySelector('.chord-helper-clear').onclick = (e) => {
            e.stopPropagation();
            const t = textarea.value;
            textarea.value = t.slice(0, closeIdx + 2) + t.slice(closeIdx + 2).replace(/^\s*\[\d+\/\d+\]/, '');
            textarea.dispatchEvent(new Event('input')); this._hideChordHelper();
        };
        b.querySelector('.chord-helper-pivot').onclick = (e) => {
            e.stopPropagation();
            const t = textarea.value;
            const after = t.slice(closeIdx + 2);
            const durMatch = after.match(/^\s*\[\d+\/\d+\]/);
            const durPart = durMatch ? durMatch[0] : '';
            const rest = after.slice(durPart.length);
            const hasPivot = /^\s*\[!\]/.test(rest);
            const restWithoutPivot = rest.replace(/^\s*\[!\]/, '');
            const newTag = hasPivot ? '' : ' [!]';
            textarea.value = t.slice(0, closeIdx + 2) + durPart + newTag + restWithoutPivot;
            const newPos = closeIdx + 2 + durPart.length + newTag.length;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input')); this._hideChordHelper();
        };
    },
    _hideChordHelper: function() { const b = document.getElementById('chord-helper-bubble'); if (b) b.style.display = 'none'; },
    _getCaretCoords: function(textarea, pos) {
        const d = document.createElement('div'), s = window.getComputedStyle(textarea);
        ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','padding','border','boxSizing','whiteSpace','wordWrap','overflowWrap','width'].forEach(p => d.style[p] = s[p]);
        d.style.cssText += ';position:absolute;visibility:hidden;white-space:pre-wrap;top:0;left:0';
        document.body.appendChild(d); d.textContent = textarea.value.slice(0, pos);
        const sp = document.createElement('span'); sp.textContent = '|'; d.appendChild(sp);
        const c = { left: sp.offsetLeft - textarea.scrollLeft, top: sp.offsetTop - textarea.scrollTop };
        document.body.removeChild(d); return c;
    },
    // ===== FIN HELPER MESURES =====

    insertAccolades() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end   = textarea.selectionEnd;
        const value = textarea.value;
        const selected = value.substring(start, end);

        // Si du texte est sélectionné, l'entourer de {{}} sinon juste insérer {{}}
        const insertion = `{{${selected}}}`;
        textarea.value = value.substring(0, start) + insertion + value.substring(end);

        // Replacer le curseur entre les accolades si rien n'était sélectionné
        const cursorPos = selected.length > 0 ? start + insertion.length : start + 2;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();

        // Mettre à jour l'aperçu
        this.updatePreview();
    },

    // Recherche la page Wikipedia la plus pertinente pour `query` sur le
    // Wikipedia de langue `lang`, renvoie son titre exact (nécessaire pour
    // l'API "summary" ci-dessous) ou null si rien trouvé.
    // origin=* : autorise l'appel direct depuis le navigateur (CORS anonyme),
    // c'est le paramètre standard documenté par l'API MediaWiki pour ce cas.
    async _searchWikipediaTitle(query, lang) {
        const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const hit = data && data.query && data.query.search && data.query.search[0];
        return hit ? hit.title : null;
    },

    // Résout puis récupère le résumé (texte brut, sans balisage wiki, prêt à
    // insérer tel quel) de la page Wikipedia la plus pertinente pour `query`.
    // Essaie d'abord le Wikipedia francophone, puis l'anglophone si aucune page
    // n'est trouvée côté fr — beaucoup d'artistes n'ont pas de fiche en français.
    async _fetchWikipediaSummary(query) {
        for (const lang of ['fr', 'en']) {
            const title = await this._searchWikipediaTitle(query, lang);
            if (!title) continue;
            const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (data && data.extract) return data.extract;
        }
        return null;
    },

    // Insère la présentation Wikipedia de l'artiste (champ Artiste requis) EN
    // FIN de texte, quelle que soit la position du curseur — comme pour la
    // balise Kvideo (voir insertKvideoTag) : l'insérer ailleurs décalerait le
    // numéro des lignes situées en dessous et désynchroniserait les repères
    // déjà marqués (⏱ / 🎤). Chaque ligne du résumé est préfixée par >>>> — le
    // même préfixe "tablature" que le fondu musical qu'il remplace — pour
    // qu'elle soit affichée à part (fond gris) et jamais traitée comme des
    // paroles ou un accord (marquage, PDF, karaoké).
    async insertWikiSummary() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;

        const artistInput = document.getElementById('song-artist');
        const artist = artistInput ? artistInput.value.trim() : '';
        if (!artist) {
            this.showError("Renseignez d'abord le champ Artiste pour rechercher sa présentation Wikipedia.");
            return;
        }

        const btn = document.getElementById('insertWikiBtn');
        const originalLabel = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Recherche…'; }

        try {
            const summary = await this._fetchWikipediaSummary(artist);
            if (!summary) {
                this.showError(`Aucune page Wikipedia trouvée pour "${artist}".`);
                return;
            }

            const lines = summary.split('\n').map(l => l.trim()).filter(Boolean);
            const block = ['', '', ...lines.map(l => `>>>>${l}`)].join('\n');

            const value = textarea.value;
            const sep = (value.length === 0 || value.endsWith('\n')) ? '' : '\n';
            textarea.value = value + sep + block;
            const endPos = textarea.value.length;
            textarea.setSelectionRange(endPos, endPos);
            textarea.focus();
            this.updatePreview();
        } catch (err) {
            console.error(err);
            this.showError('Impossible de récupérer la présentation Wikipedia (connexion ou service indisponible).');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
        }
    },

    // Insère la balise vidéo de fond karaoké TOUJOURS en fin de texte (jamais à la
    // position du curseur) : placée ailleurs, elle décalerait le numéro des lignes
    // situées en dessous et désynchroniserait les repères déjà marqués (⏱).
    insertKvideoTag() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;

        const tag = '<link rel="Kvideo" href="songs/multimedia/mp4K/kvideo.m4v">';

        if (textarea.value.includes(tag)) {
            this.showError('Cette balise Kvideo est déjà présente dans le texte.');
            return;
        }

        const value = textarea.value;
        const sep = (value.length === 0 || value.endsWith('\n')) ? '' : '\n';
        textarea.value = value + sep + tag;

        const pos = textarea.value.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
        this.updatePreview();
    },

    // Insère un post-it image (<link rel="imageN" href="img/...">) à la position du
    // CURSEUR (contrairement à Kvideo, ce marqueur doit être sur la ligne précise à
    // laquelle le post-it doit rester associé à l'affichage — voir _renderPostits()).
    // ATTENTION : comme pour toute balise <link>, l'insérer au milieu d'un texte déjà
    // marqué (⏱ karaoké) décale le numéro des lignes suivantes et peut désynchroniser
    // les repères déjà posés plus bas dans le texte.
    insertPostitTag() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;

        // Prochain numéro d'image libre (image1, image2, ...) en fonction de ce qui
        // existe déjà dans le texte
        const existingNums = [...textarea.value.matchAll(/rel=["']image(\d*)["']/gi)]
            .map(m => parseInt(m[1] || '1', 10));
        const nextNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;

        const filename = prompt(
            "Nom du fichier image (à déposer dans le dossier img/ de votre serveur) :",
            `image${nextNum}.png`
        );
        if (!filename) return;

        const tag = `<link rel="image${nextNum}" href="img/${filename}">`;

        const pos2 = textarea.selectionStart;
        const value = textarea.value;
        const before = value.slice(0, pos2);
        const after = value.slice(pos2);
        // Toujours sur sa propre ligne, sans toucher au texte existant autour
        const needsNlBefore = before.length > 0 && !before.endsWith('\n');
        const needsNlAfter = after.length > 0 && !after.startsWith('\n');
        const insertion = (needsNlBefore ? '\n' : '') + tag + (needsNlAfter ? '\n' : '');

        textarea.value = before + insertion + after;
        const newPos = before.length + insertion.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
        this.updatePreview();
    },
    // Insérer un préfixe de section (vvvv ou pppp) avec curseur entre les crochets
    // Insère le séparateur de syllabe [|] à la position du curseur (à l'intérieur
    // d'un mot, contrairement à insertPrefix qui force un début de ligne) — sert
    // à marquer les paroles syllabe par syllabe plutôt que mot par mot, cf.
    // _extractAllWords().
    insertSyllableSeparator() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;
        const pos = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        const insertion = '[|]';
        textarea.value = value.substring(0, pos) + insertion + value.substring(end);
        const cursorPos = pos + insertion.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
        this.updatePreview();
    },

    insertPrefix(prefix) {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;

        const pos   = textarea.selectionStart;
        const value = textarea.value;

        // S'assurer qu'on est en début de ligne
        const before = value.substring(0, pos);
        const needsNewline = before.length > 0 && !before.endsWith('\n');
        const insertion = (needsNewline ? '\n' : '') + prefix + '[]';

        textarea.value = value.substring(0, pos) + insertion + value.substring(pos);

        // Positionner le curseur entre [ et ]
        const cursorPos = pos + insertion.length - 1;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.focus();
        this.updatePreview();
    },

    // ===== MODULE KARAOKÉ =====

    // Trouve l'index de la ligne de contenu où se trouve le curseur dans l'éditeur
    _getCurrentLineIndex(textarea) {
        const pos = textarea.selectionStart;
        const before = textarea.value.substring(0, pos);
        return before.split('\n').length - 1;
    },

    // ===== MARQUAGE INDÉPENDANT DES PAROLES (mot par mot) =====
    // Système séparé de celui des accords (⏱ Marquer / karaokeTimestamps) : il
    // alimente une future vue karaoké "chant" dédiée, sans toucher au marquage
    // par accord existant. Stocké dans un champ distinct : wordTimestamps.

    // Construit le texte "pur" d'une ligne de paroles, avec EXACTEMENT les mêmes
    // suppressions que renderLyricsWithBadges()/formatSongContent() appliquent avant
    // affichage : {{Accord}} (+ durée [n/d] éventuellement collée) totalement
    // supprimé — SANS espace de remplacement, comme dans le rendu réel — pivot [!]
    // et délimiteurs de surlignage **/++/--/&& retirés. Les séparateurs de syllabe
    // [|] sont volontairement CONSERVÉS ici (contrairement au DOM, qui ne les
    // affiche jamais) : ils sont traités séparément lors du découpage en syllabes,
    // pour connaître leur position exacte dans le mot nettoyé.
    // Supprimer l'accord SANS espace (au lieu d'un espace comme avant) est le
    // correctif clé : un accord tombant au milieu d'un mot (ex. "n{{D2}}o") ne le
    // scinde donc plus en deux "mots" ("n" / "o") lors de l'extraction — exactement
    // comme il ne le scinde pas visuellement dans le texte réellement affiché
    // (seul un badge s'intercale entre les deux fragments, le texte, lui, est bien
    // "no" continu).
    _purifyLyricLine(line) {
        return line
            .replace(/\{\{[^}]+\}\}(?:\s*\[\d+\/\d+\])?/g, '')
            .replace(/\s*\[!\]/g, '')
            .replace(/\*\*|\+\+|--|&&/g, '');
    },

    // Découpe un texte "pur" (voir _purifyLyricLine) en mots marquables, en gardant
    // pour chacun sa position EXACTE [start,end) dans ce texte (espace interne et
    // ponctuation recollée compris) — pas une nouvelle chaîne reconstruite, pour
    // que ces positions restent utilisables telles quelles pour cibler la bonne
    // portion de texte à surligner, que ce texte pur vienne de la ligne source
    // (extraction, cf. _extractAllWords) ou du texte concaténé du DOM (surlignage,
    // cf. _highlightNextWord) — les deux étant construits selon les mêmes règles.
    //
    // Un jeton composé UNIQUEMENT de ponctuation (aucune lettre/chiffre) n'est pas
    // un mot en soi :
    // - s'il est isolé au milieu de la ligne (un autre mot suit) → c'est un artefact
    //   typographique flottant (ex. "Que vida !  Que triste" → le "!" du milieu,
    //   détaché par un double espace) → il est ignoré purement et simplement ;
    // - s'il est en toute fin de ligne (rien ne suit) → il termine réellement le
    //   dernier mot (ex. "triste !") → on étend le mot précédent pour l'englober,
    //   sans quoi cette ponctuation ne serait ni affichée ni comptée nulle part.
    _tokenizeLyricWordSpans(pureText) {
        const hasLetterOrDigit = w => /[\p{L}\p{N}]/u.test(w);
        const re = /\S+/g;
        const raw = [];
        let m;
        while ((m = re.exec(pureText)) !== null) raw.push({ text: m[0], start: m.index, end: m.index + m[0].length });

        const words = [];
        raw.forEach((tok, i) => {
            if (hasLetterOrDigit(tok.text)) { words.push({ start: tok.start, end: tok.end }); return; }
            const isLast = i === raw.length - 1;
            if (isLast && words.length > 0) {
                words[words.length - 1].end = tok.end;
            }
            // sinon : ponctuation isolée au milieu de la ligne → ignorée
        });
        return words;
    },

    // Extrait les unités marquables (mots, ou syllabes si le mot contient des
    // séparateurs [|]) avec leur position exacte. Ex: "cha[|]leu[|]reux" donne 3
    // unités ("cha", "leu", "reux") au lieu d'une seule ("chaleureux").
    // - charStart/charEnd : position de l'unité DANS le mot nettoyé (sans les [|]),
    //   utilisée par _highlightNextWord() pour cibler la bonne portion de texte
    //   dans l'aperçu.
    // - key : format "L_W" (identique à avant) pour un mot à une seule syllabe —
    //   compatibilité totale avec les wordTimestamps déjà enregistrés ; "L_W_S"
    //   uniquement quand le mot est effectivement découpé en plusieurs syllabes.
    _extractAllWords(content) {
        const result = [];
        content.split('\n').forEach((line, lineIndex) => {
            const trimmed = line.trim();
            if (!trimmed || /^(vvvv|pppp|rrrr|ssss|>>>>|<<<<)/.test(trimmed)) return;
            // Balises <link rel="imageN"/"KVideo" href="..."> : post-its image/vidéo
            // de l'éditeur, jamais des paroles à marquer (même filtre que celui
            // appliqué dans generateStandardPDF pour la même raison).
            if (/^<link\b[^>]*>$/i.test(trimmed)) return;
            const pure = this._purifyLyricLine(line);
            if (!pure.trim()) return; // ligne purement instrumentale : pas de mots à marquer
            const spans = this._tokenizeLyricWordSpans(pure);
            spans.forEach((span, wordIndex) => {
                const rawWord = pure.slice(span.start, span.end);
                if (!rawWord.includes('[|]')) {
                    result.push({ lineIndex, wordIndex, syllableIndex: 0, word: rawWord, charStart: 0, charEnd: rawWord.length });
                    return;
                }
                const syllables = rawWord.split('[|]').filter(s => s.length > 0);
                let pos = 0;
                syllables.forEach((syl, syllableIndex) => {
                    result.push({ lineIndex, wordIndex, syllableIndex, word: syl, charStart: pos, charEnd: pos + syl.length });
                    pos += syl.length;
                });
            });
        });
        return result;
    },

    // Initialise le minutage des paroles : extrait tous les mots et remet l'index à 0
    initWordTimestamping() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;
        this._allWordsForKaraoke = this._extractAllWords(textarea.value);
        this._wordCurrentIdx = 0;
        this.wordMarkLines = [];
        const display = document.getElementById('wordTimerDisplay');
        if (display) display.textContent =
            `Prêt — ${this._allWordsForKaraoke.length} mots à minuter. Lancez le MP3 puis appuyez sur 🎤 Marquer.`;
        this._highlightNextWord(this._allWordsForKaraoke[0]);
    },

    // Retire le surlignage précédent (mot/syllabe) posé par _highlightNextWord — on
    // "déballe" le span temporaire pour ne jamais laisser le DOM de l'aperçu modifié
    // de façon permanente (aucun impact sur le rendu partagé avec le reste de l'app).
    _clearWordHighlightSpan() {
        // Un mot peut être surligné sur PLUSIEURS fragments (voir _highlightNextWord :
        // un accord au milieu d'un mot le scinde en plusieurs nœuds texte dans le DOM),
        // donc on "déballe" tous les fragments portant la classe, pas seulement l'ancien
        // span unique repéré par son id.
        document.querySelectorAll('.karaoke-next-word').forEach(span => {
            const parent = span.parentNode;
            if (!parent) return;
            parent.replaceChild(document.createTextNode(span.textContent), span);
            parent.normalize();
        });
    },

    // Met en évidence le mot (ou la syllabe exacte si le mot est découpé par [|])
    // à venir dans l'aperçu — sur le même principe que _highlightNextChordInPreview,
    // mais sans dépendre de badges déjà encapsulés : on parcourt les nœuds texte de
    // la ligne, on compte les mots séparés par des espaces jusqu'à wordIndex, puis on
    // enveloppe temporairement la sous-portion [charStart, charEnd) correspondante.
    _highlightNextWord(wordInfo) {
        document.querySelectorAll('.karaoke-next-word-line').forEach(el => el.classList.remove('karaoke-next-word-line'));
        this._clearWordHighlightSpan();
        if (!wordInfo) return;
        const preview = document.getElementById('song-preview');
        if (!preview) return;
        const previewChildren = Array.from(preview.childNodes);
        const targetLineEl = previewChildren[wordInfo.lineIndex];
        if (!targetLineEl || targetLineEl.nodeType !== Node.ELEMENT_NODE) return;
        targetLineEl.classList.add('karaoke-next-word-line');

        // Ignorer le texte des badges d'accords (noms d'accords, pas des paroles) —
        // sans ce filtre, "Em"/"Cmaj7" etc. étaient comptés comme des "mots",
        // désynchronisant tout le comptage des mots réels qui les suivent. On
        // concatène ensuite tous les fragments de texte restants, DANS L'ORDRE du
        // DOM, sans rien insérer entre eux : cela reconstitue exactement le même
        // texte "pur" que _purifyLyricLine()/_extractAllWords() (un accord ne
        // laisse ni trou ni espace, tout comme dans le rendu réel), donc le même
        // découpage en mots (_tokenizeLyricWordSpans) y retrouve les mots dans le
        // même ordre, aux mêmes index — plus de désynchronisation possible entre
        // l'extraction et l'aperçu.
        const walker = document.createTreeWalker(targetLineEl, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const el = node.parentElement;
                return (el && el.classList && el.classList.contains('lyric-chord-badge'))
                    ? NodeFilter.FILTER_SKIP
                    : NodeFilter.FILTER_ACCEPT;
            },
        });
        const nodes = [];
        let domPure = '';
        let node;
        while ((node = walker.nextNode())) {
            const start = domPure.length;
            domPure += node.textContent;
            nodes.push({ node, start, end: domPure.length });
        }

        const spans = this._tokenizeLyricWordSpans(domPure);
        const target = spans[wordInfo.wordIndex];
        if (!target) return;
        const cs = wordInfo.charStart ?? 0;
        const ce = wordInfo.charEnd ?? (target.end - target.start);
        const hlStart = target.start + cs;
        const hlEnd = target.start + ce;

        // La portion à surligner peut être répartie sur PLUSIEURS nœuds texte si un
        // accord tombe au milieu (ex. le badge "D2" au milieu de "no") — chaque
        // fragment concerné reçoit alors son propre <span class="karaoke-next-word">,
        // le badge s'intercalant naturellement entre eux visuellement.
        let firstSpan = null;
        nodes.forEach(({ node: n, start, end }) => {
            const segStart = Math.max(start, hlStart);
            const segEnd = Math.min(end, hlEnd);
            if (segEnd <= segStart) return; // ce nœud n'est pas concerné par le surlignage
            const localStart = segStart - start;
            const localEnd = segEnd - start;
            const text = n.textContent;
            const before = text.slice(0, localStart);
            const middle = text.slice(localStart, localEnd);
            const after = text.slice(localEnd);

            const span = document.createElement('span');
            span.className = 'karaoke-next-word';
            span.textContent = middle;
            if (!firstSpan) { span.id = 'karaoke-next-word-span'; firstSpan = span; }

            const parent = n.parentNode;
            const afterNode = document.createTextNode(after);
            parent.replaceChild(afterNode, n);
            parent.insertBefore(span, afterNode);
            if (before) parent.insertBefore(document.createTextNode(before), span);
        });

        if (firstSpan) {
            const previewRect = preview.getBoundingClientRect();
            const spanRect = firstSpan.getBoundingClientRect();
            const offset = (spanRect.top - previewRect.top) + preview.scrollTop
                - (preview.clientHeight / 2) + (spanRect.height / 2);
            preview.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
        }
    },

    // Ré-extrait la liste des mots si besoin (ex. après un remap de lignes qui a
    // invalidé le cache), SANS toucher à wordMarkLines ni _wordCurrentIdx — à la
    // différence d'initWordTimestamping() qui repart intentionnellement à zéro.
    _ensureWordsExtracted() {
        if (this._allWordsForKaraoke) return;
        const textarea = document.getElementById('song-editor');
        this._allWordsForKaraoke = textarea ? this._extractAllWords(textarea.value) : [];
    },

    // ▶ Reprendre le marquage des paroles à partir du curseur : utile pour
    // affiner une chanson déjà (partiellement) minutée sans tout reprendre
    // depuis le début. Ne touche PAS aux repères déjà posés (contrairement à
    // initWordTimestamping) — seul le pointeur de progression est déplacé ;
    // 🎤 Marquer écrasera ensuite les repères existants à partir de ce point,
    // au fil de la lecture.
    resumeWordTimestampingFromCursor() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;
        this._ensureWordsExtracted();
        const allWords = this._allWordsForKaraoke;
        if (!allWords.length) { this.showError("Aucune parole trouvée dans cette chanson."); return; }

        const cursorLine = this._getCurrentLineIndex(textarea);
        // Premier mot/syllabe dont la ligne est à ou après le curseur ; si le
        // curseur est après la dernière ligne marquable, on reprend au dernier mot.
        let idx = allWords.findIndex(w => w.lineIndex >= cursorLine);
        if (idx === -1) idx = allWords.length - 1;
        this._wordCurrentIdx = idx;

        const target = allWords[idx];
        const display = document.getElementById('wordTimerDisplay');
        if (display) display.textContent =
            `▶ Reprise au curseur — prochain mot : "${target.word}" (ligne ${target.lineIndex + 1}, ${allWords.length - idx} restants). Lancez le MP3 puis 🎤 Marquer.`;
        this._highlightNextWord(target);
    },

    // 🎤 Marquer le timestamp du mot courant (indépendant du marquage par accord)
    markWordTimestamp() {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer || !audioPlayer.src || audioPlayer.readyState < 1) {
            this.showError("Chargez et démarrez le MP3 avant de marquer les paroles.");
            return;
        }

        this._ensureWordsExtracted();
        const allWords = this._allWordsForKaraoke;
        if (!allWords.length) { this.showError("Aucune parole trouvée dans cette chanson."); return; }

        const idx = this._wordCurrentIdx;
        if (idx >= allWords.length) {
            const display = document.getElementById('wordTimerDisplay');
            if (display) display.textContent = `✅ Tous les ${allWords.length} mots ont été minutés ! Sauvegardez.`;
            return;
        }

        const target = allWords[idx];
        const time = audioPlayer.currentTime;
        // Compatibilité : clé "L_W" (comme avant) pour un mot à une seule syllabe,
        // "L_W_S" uniquement si le mot est effectivement découpé en syllabes — sinon
        // un ré-marquage d'une chanson déjà minutée créerait des doublons au lieu de
        // mettre à jour les repères existants.
        const hasSiblingSyllables = allWords.some(w =>
            w !== target && w.lineIndex === target.lineIndex && w.wordIndex === target.wordIndex);
        const key = hasSiblingSyllables
            ? `${target.lineIndex}_${target.wordIndex}_${target.syllableIndex}`
            : `${target.lineIndex}_${target.wordIndex}`;

        if (!this.wordMarkLines) this.wordMarkLines = [];
        const existing = this.wordMarkLines.findIndex(w => w.key === key);
        if (existing >= 0) {
            this.wordMarkLines[existing].time = time;
            // Ce mot est désormais minuté à la voix, précisément — s'il provenait d'un
            // import LRC (source: 'lrc', estimation arithmétique), ce repère n'est plus
            // une approximation : on retire le marqueur pour que la ligne redevienne
            // éligible au surlignage mot par mot dès qu'assez de mots de la ligne sont
            // ainsi affinés (voir _isWordTimingEmpirical).
            delete this.wordMarkLines[existing].source;
        }
        else this.wordMarkLines.push({
            key, lineIndex: target.lineIndex,
            wordIndex: target.wordIndex,
            syllableIndex: target.syllableIndex,
            word: target.word, time,
        });

        this._wordCurrentIdx++;
        const next = allWords[this._wordCurrentIdx];

        const min = Math.floor(time / 60);
        const sec = (time % 60).toFixed(1).padStart(4, '0');
        const display = document.getElementById('wordTimerDisplay');
        const remaining = allWords.length - this._wordCurrentIdx;
        if (display) display.textContent = next
            ? `✓ "${target.word}" @ ${min}:${sec} → prochain : "${next.word}" (${remaining} restants)`
            : `✅ Dernier mot "${target.word}" minuté ! Sauvegardez.`;
        this._updateMarkingHint();

        this._highlightNextWord(next || null);
    },

    // Extrait tous les accords du contenu complet avec leur position exacte
    // ===== CORRECTION AUTOMATIQUE DES REPÈRES APRÈS ÉDITION DU TEXTE =====
    // Les repères (karaokeLines / wordMarkLines) référencent une ligne par son
    // NUMÉRO (lineIndex) dans le contenu. Insérer ou supprimer une ligne
    // au-dessus (ex. ajouter "vvvv[Couplet 2]") décale tous les numéros de
    // ligne qui suivent — sans correction, les repères existants pointeraient
    // alors sur les mauvaises lignes. On corrige ça par un diff des lignes
    // (alignement LCS) entre le contenu au moment du dernier marquage connu
    // et le contenu actuel, pour remapper chaque repère vers sa nouvelle
    // position — plutôt que de tenter un rapprochement approximatif par texte
    // de mot/accord (ambigu en cas de paroles répétées).

    // Alignement LCS (Longest Common Subsequence) entre deux tableaux de lignes.
    // Retourne une Map(ancien lineIndex -> nouveau lineIndex) pour les lignes
    // identiques trouvées dans les deux versions, dans le même ordre relatif.
    _diffLineIndexMap(oldLines, newLines) {
        const m = oldLines.length, n = newLines.length;
        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
        for (let i = m - 1; i >= 0; i--) {
            for (let j = n - 1; j >= 0; j--) {
                dp[i][j] = oldLines[i] === newLines[j]
                    ? dp[i + 1][j + 1] + 1
                    : Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
        const map = new Map();
        let i = 0, j = 0;
        while (i < m && j < n) {
            if (oldLines[i] === newLines[j]) {
                map.set(i, j);
                i++; j++;
            } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                i++; // ligne supprimée dans le nouveau contenu
            } else {
                j++; // ligne insérée dans le nouveau contenu
            }
        }
        return map;
    },

    // Remappe le lineIndex de chaque repère selon le diff oldContent -> newContent.
    // Les repères dont la ligne d'origine a disparu (modifiée ou supprimée) sont
    // retirés — impossible de les relocaliser de façon fiable — et comptés dans
    // droppedCount pour en avertir l'utilisateur.
    _repairMarkerLineIndices(markers, oldContent, newContent) {
        if (!markers || !markers.length || oldContent === newContent) return { repaired: markers || [], droppedCount: 0 };
        const map = this._diffLineIndexMap(oldContent.split('\n'), newContent.split('\n'));
        const repaired = [];
        let droppedCount = 0;
        for (const mk of markers) {
            if (map.has(mk.lineIndex)) repaired.push({ ...mk, lineIndex: map.get(mk.lineIndex) });
            else droppedCount++;
        }
        return { repaired, droppedCount };
    },

    // À appeler avant toute utilisation des repères (marquage, sauvegarde) : compare
    // le contenu actuel de l'éditeur au dernier "instantané" connu, répare
    // karaokeLines/wordMarkLines si le texte a changé entre-temps, puis met
    // l'instantané à jour. Sans effet si rien n'a changé.
    _ensureMarkersInSync() {
        const editor = document.getElementById('song-editor');
        if (!editor) return;
        const current = editor.value;
        let warnings = [];

        if (this._chordMarkSnapshotContent != null && this._chordMarkSnapshotContent !== current
            && this.karaokeLines && this.karaokeLines.length) {
            const { repaired, droppedCount } = this._repairMarkerLineIndices(this.karaokeLines, this._chordMarkSnapshotContent, current);
            this.karaokeLines = repaired;
            // Recalculé directement ici (plutôt que mis à null) : initKaraokeTimestamping()
            // réinitialiserait karaokeLines/l'index à zéro si on la laissait le refaire.
            this._allChordsForKaraoke = this._extractAllChords(current);
            this._karaokeCurrentChordIdx = repaired.length;
            if (droppedCount > 0) warnings.push(`${droppedCount} repère(s) accord perdu(s) (ligne modifiée/supprimée)`);
        }
        this._chordMarkSnapshotContent = current;

        if (this._wordMarkSnapshotContent != null && this._wordMarkSnapshotContent !== current
            && this.wordMarkLines && this.wordMarkLines.length) {
            const { repaired, droppedCount } = this._repairMarkerLineIndices(this.wordMarkLines, this._wordMarkSnapshotContent, current);
            this.wordMarkLines = repaired;
            this._allWordsForKaraoke = this._extractAllWords(current);
            this._wordCurrentIdx = repaired.length;
            if (droppedCount > 0) warnings.push(`${droppedCount} repère(s) parole perdu(s) (ligne modifiée/supprimée)`);
        }
        this._wordMarkSnapshotContent = current;

        if (warnings.length) {
            const msg = `⚠️ Texte modifié depuis le dernier marquage : repères réajustés automatiquement. ${warnings.join(' — ')}. Vérifiez avec ⏱/🎤 Marquer avant de sauvegarder.`;
            const kDisplay = document.getElementById('karaokeTimerDisplay');
            const wDisplay = document.getElementById('wordTimerDisplay');
            if (kDisplay) kDisplay.textContent = msg;
            if (wDisplay) wDisplay.textContent = msg;
        }
    },

    _extractAllChords(content) {
        const result = [];
        content.split('\n').forEach((line, lineIndex) => {
            const trimmed = line.trim();
            if (!trimmed || /^(vvvv|pppp|rrrr|ssss|>>>>|<<<<)/.test(trimmed)) return;
            // Capture la durée [num/den] éventuellement accolée à l'accord (ex: {{Am}} [1/4])
            // — posée via l'infobulle "Durée" (chordDurationHelper). Nécessaire au
            // marquage automatique (voir markKaraokeTimestampAuto), qui calcule le
            // temps des accords suivants à partir de cette durée + du BPM.
            // Capture aussi la balise PIVOT [!] (indépendante de la durée) : un accord
            // marqué pivot n'est JAMAIS calculé automatiquement, même si la durée du
            // précédent le permettrait — il attend toujours un nouveau marquage manuel
            // (ex: changement de rythme, rubato, reprise de contrôle voulue).
            const re = /\{\{([^}]+)\}\}(?:\s*\[(\d+)\/(\d+)\])?(\s*\[!\])?/g;
            let m, chordIndex = 0;
            while ((m = re.exec(line)) !== null) {
                result.push({
                    lineIndex, chordIndex, chord: m[1], fullLine: line,
                    durationNum: m[2] ? parseInt(m[2], 10) : null,
                    durationDen: m[3] ? parseInt(m[3], 10) : null,
                    isPivot: !!m[4],
                });
                chordIndex++;
            }
        });
        return result;
    },

    // Initialise le minutage karaoké : extrait tous les accords et remet l'index à 0
    initKaraokeTimestamping() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;
        this._allChordsForKaraoke = this._extractAllChords(textarea.value);
        this._karaokeCurrentChordIdx = 0;
        this.karaokeLines = [];
        const display = document.getElementById('karaokeTimerDisplay');
        if (display) display.textContent =
            `Prêt — ${this._allChordsForKaraoke.length} accords à minuter. Lancez le MP3 puis appuyez sur ⏱ Marquer.`;
        // Surligner le premier accord dans l'aperçu
        this._highlightNextChordInPreview(this._allChordsForKaraoke[0]);
    },

    // Ré-extrait la liste des accords si besoin (ex. après un remap de lignes qui a
    // invalidé le cache), SANS toucher à karaokeLines ni _karaokeCurrentChordIdx — à
    // la différence d'initKaraokeTimestamping() qui repart intentionnellement à zéro.
    // Symétrique de _ensureWordsExtracted() côté paroles.
    _ensureChordsExtracted() {
        if (this._allChordsForKaraoke) return;
        const textarea = document.getElementById('song-editor');
        this._allChordsForKaraoke = textarea ? this._extractAllChords(textarea.value) : [];
    },

    // ▶ Reprendre le marquage des accords à partir du curseur : utile pour affiner
    // une chanson déjà (partiellement) minutée sans tout reprendre depuis le début.
    // Ne touche PAS aux repères déjà posés (contrairement à initKaraokeTimestamping)
    // — seul le pointeur de progression est déplacé ; ⏱ Marquer (ou ⏱⚡ auto BPM)
    // écrasera ensuite les repères existants à partir de ce point, au fil de la
    // lecture. Symétrique de resumeWordTimestampingFromCursor() côté paroles.
    resumeChordTimestampingFromCursor() {
        const textarea = document.getElementById('song-editor');
        if (!textarea) return;
        this._ensureChordsExtracted();
        const allChords = this._allChordsForKaraoke;
        if (!allChords.length) { this.showError("Aucun accord trouvé dans cette chanson."); return; }

        const cursorLine = this._getCurrentLineIndex(textarea);
        // Premier accord dont la ligne est à ou après le curseur ; si le curseur est
        // après la dernière ligne marquable, on reprend au dernier accord.
        let idx = allChords.findIndex(c => c.lineIndex >= cursorLine);
        if (idx === -1) idx = allChords.length - 1;
        this._karaokeCurrentChordIdx = idx;

        const target = allChords[idx];
        const display = document.getElementById('karaokeTimerDisplay');
        if (display) display.textContent =
            `▶ Reprise au curseur — prochain accord : "${target.chord}" (ligne ${target.lineIndex + 1}, ${allChords.length - idx} restants). Lancez le MP3 puis ⏱ Marquer.`;
        this._highlightNextChordInPreview(target);
    },

    // Met en évidence le prochain accord à marquer dans l'aperçu (song-preview)
    // en ajoutant la classe CSS 'karaoke-next-chord' sur le badge correspondant.
    _highlightNextChordInPreview(chordInfo) {
        // Retirer l'ancien surlignage
        document.querySelectorAll('.karaoke-next-chord').forEach(el => el.classList.remove('karaoke-next-chord'));
        document.querySelectorAll('.karaoke-next-line').forEach(el => el.classList.remove('karaoke-next-line'));
        if (!chordInfo) return;

        // L'aperçu est rendu ligne par ligne ; chaque ligne de paroles devient
        // un .lyrics-block ou .lyrics-line dans #song-preview.
        // On reparcourt le contenu pour trouver le bon élément DOM.
        const preview = document.getElementById('song-preview');
        if (!preview) return;

        // Compter les lignes non-skip jusqu'à lineIndex pour retrouver l'élément dans le DOM
        const content = document.getElementById('song-editor').value;
        const rawLines = content.split('\n');

        // Construire la liste des lignes rendues dans l'ordre (en ignorant les lignes vides → <br>)
        // Chaque ligne produit exactement un enfant direct dans #song-preview
        const previewChildren = Array.from(preview.childNodes);

        // Trouver l'enfant correspondant à lineIndex
        // formatSongContent produit : '' → <br>, sinon un <div>
        // Donc l'index dans previewChildren == lineIndex
        const targetLineEl = previewChildren[chordInfo.lineIndex];
        if (!targetLineEl) return;

        // Surligner la ligne entière
        if (targetLineEl.nodeType === Node.ELEMENT_NODE) {
            targetLineEl.classList.add('karaoke-next-line');
        }

        // Trouver le badge de l'accord dans cette ligne
        // Les badges sont des .lyric-chord-badge dans l'ordre de gauche à droite
        if (targetLineEl.nodeType === Node.ELEMENT_NODE) {
            const badges = targetLineEl.querySelectorAll('.lyric-chord-badge:not(.lyric-chord-empty)');
            const targetBadge = badges[chordInfo.chordIndex];
            if (targetBadge) {
                targetBadge.classList.add('karaoke-next-chord');
                // Scroller UNIQUEMENT l'intérieur de l'aperçu (#song-preview) pour rendre
                // l'accord visible, sans laisser scrollIntoView() remonter aussi le
                // conteneur parent #main-content (qui décalait tout le haut de page).
                const previewRect = preview.getBoundingClientRect();
                const badgeRect = targetBadge.getBoundingClientRect();
                const offset = (badgeRect.top - previewRect.top) + preview.scrollTop
                    - (preview.clientHeight / 2) + (badgeRect.height / 2);
                preview.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
            }
        }
    },

    // ⏱ Marquer le timestamp de l'accord courant (index interne, indépendant du curseur)
    markKaraokeTimestamp() {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer || !audioPlayer.src || audioPlayer.readyState < 1) {
            this.showError("Chargez et démarrez le MP3 avant de marquer les repères.");
            return;
        }

        // Répare les repères existants si le texte a été modifié depuis le dernier
        // marquage (lignes insérées/supprimées) avant de continuer.
        this._ensureMarkersInSync();

        // Initialiser la liste des accords si pas encore fait
        if (!this._allChordsForKaraoke) this.initKaraokeTimestamping();
        const allChords = this._allChordsForKaraoke;
        if (!allChords.length) { this.showError("Aucun accord trouvé dans cette chanson."); return; }

        const idx = this._karaokeCurrentChordIdx;
        if (idx >= allChords.length) {
            const display = document.getElementById('karaokeTimerDisplay');
            if (display) display.textContent = `✅ Tous les ${allChords.length} accords ont été minutés ! Sauvegardez.`;
            return;
        }

        const target = allChords[idx];
        const time   = audioPlayer.currentTime;
        const key    = `${target.lineIndex}_${target.chordIndex}`;

        if (!this.karaokeLines) this.karaokeLines = [];
        const existing = this.karaokeLines.findIndex(k => k.key === key);
        if (existing >= 0) this.karaokeLines[existing].time = time;
        else this.karaokeLines.push({
            key, lineIndex: target.lineIndex,
            chordIndex: target.chordIndex,
            chord: target.chord, time
        });

        // Avancer l'index interne
        this._karaokeCurrentChordIdx++;
        const next = allChords[this._karaokeCurrentChordIdx];

        const min = Math.floor(time / 60);
        const sec = (time % 60).toFixed(1).padStart(4, '0');
        const display = document.getElementById('karaokeTimerDisplay');
        const remaining = allChords.length - this._karaokeCurrentChordIdx;
        if (display) display.textContent = next
            ? `✓ [${target.chord}] @ ${min}:${sec} → prochain : [${next.chord}] (${remaining} restants)`
            : `✅ Dernier accord [${target.chord}] minuté ! Sauvegardez.`;
        this._updateMarkingHint();

        // Déplacer le curseur du textarea vers la ligne du prochain accord (indicatif)
        if (next) {
            const textarea = document.getElementById('song-editor');
            if (textarea) {
                const lines = textarea.value.split('\n');
                let charPos = 0;
                for (let i = 0; i < next.lineIndex; i++) charPos += lines[i].length + 1;
                textarea.setSelectionRange(charPos, charPos);
                textarea.scrollTop = textarea.scrollHeight * (next.lineIndex / lines.length);
            }
        }

        // Mettre en évidence le prochain accord dans l'aperçu
        this._highlightNextChordInPreview(next || null);
    },

    // Convertit une durée notée [num/den] (fraction d'une ronde, ex: 1/4 = noire,
    // 1/2 = blanche...) en secondes, à un BPM donné. 1 ronde = 4 temps (noires).
    _fractionToSeconds(num, den, bpm) {
        if (!num || !den || !bpm) return null;
        const beats = (num / den) * 4;
        return beats * (60 / bpm);
    },

    // ⏱⚡ Marquage AUTOMATIQUE : marque l'accord courant (comme ⏱ Marquer) à la
    // position MP3 actuelle — ce point sert d'ANCRE — puis calcule et marque tout
    // seul le temps des accords suivants à partir de leur durée [num/den] (posée via
    // l'infobulle "Durée") et du BPM de la chanson, tant que chaque accord rencontré
    // porte bien une durée. Le calcul s'arrête au premier accord sans durée notée
    // (à marquer manuellement, ou à re-synchroniser plus tard avec ce même bouton —
    // un nouvel appui pose une nouvelle ancre à l'endroit où l'on s'est arrêté, utile
    // en cas de changement de rythme). Le marquage conventionnel (⏱ Marquer) reste
    // inchangé et disponible en parallèle.
    markKaraokeTimestampAuto() {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer || !audioPlayer.src || audioPlayer.readyState < 1) {
            this.showError("Chargez et démarrez le MP3 avant de marquer les repères.");
            return;
        }

        const bpmField = document.getElementById('bpm');
        const bpm = parseFloat((bpmField && bpmField.value) || (this.currentSong && this.currentSong.bpm) || '');
        if (!bpm || bpm <= 0) {
            this.showError("Renseignez le BPM de la chanson pour utiliser le marquage automatique.");
            return;
        }

        if (!this._allChordsForKaraoke) this.initKaraokeTimestamping();
        const allChords = this._allChordsForKaraoke;
        if (!allChords.length) { this.showError("Aucun accord trouvé dans cette chanson."); return; }

        let idx = this._karaokeCurrentChordIdx;
        if (idx >= allChords.length) {
            const display = document.getElementById('karaokeTimerDisplay');
            if (display) display.textContent = `✅ Tous les ${allChords.length} accords ont été minutés ! Sauvegardez.`;
            return;
        }

        if (!this.karaokeLines) this.karaokeLines = [];
        const setMark = (chordInfo, time) => {
            const key = `${chordInfo.lineIndex}_${chordInfo.chordIndex}`;
            const existing = this.karaokeLines.findIndex(k => k.key === key);
            if (existing >= 0) this.karaokeLines[existing].time = time;
            else this.karaokeLines.push({
                key, lineIndex: chordInfo.lineIndex,
                chordIndex: chordInfo.chordIndex,
                chord: chordInfo.chord, time
            });
        };

        // 1) Ancre : l'accord courant, marqué à la position réelle du MP3
        const anchor = allChords[idx];
        let time = audioPlayer.currentTime;
        setMark(anchor, time);
        let autoCount = 0;

        // 2) Propagation automatique tant que l'accord qui vient d'être placé porte
        // une durée exploitable, ET que l'accord suivant n'est pas marqué PIVOT
        // (auquel cas on s'arrête volontairement avant lui, même si le calcul serait
        // possible — il attend un nouveau marquage manuel, ex: changement de rythme).
        let cur = anchor;
        idx++;
        while (idx < allChords.length) {
            const nextChord = allChords[idx];
            if (nextChord.isPivot) break; // frontière explicite : ne jamais auto-calculer un pivot
            const dur = this._fractionToSeconds(cur.durationNum, cur.durationDen, bpm);
            if (dur === null) break;
            time += dur;
            cur = nextChord;
            setMark(cur, time);
            autoCount++;
            idx++;
        }

        this._karaokeCurrentChordIdx = idx;
        const next = allChords[idx];

        const fmt = (t) => `${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
        const display = document.getElementById('karaokeTimerDisplay');
        const remaining = allChords.length - idx;
        if (display) display.textContent = next
            ? `⚡ [${anchor.chord}] @ ${fmt(audioPlayer.currentTime)} + ${autoCount} accord(s) calculé(s) → prochain : [${next.chord}] (${remaining} restants)`
            : `✅ Dernier accord [${cur.chord}] minuté (dont ${autoCount} calculé(s)) ! Sauvegardez.`;
        this._updateMarkingHint();

        // Déplacer le curseur du textarea vers la ligne du prochain accord (indicatif)
        if (next) {
            const textarea = document.getElementById('song-editor');
            if (textarea) {
                const lines = textarea.value.split('\n');
                let charPos = 0;
                for (let i = 0; i < next.lineIndex; i++) charPos += lines[i].length + 1;
                textarea.setSelectionRange(charPos, charPos);
                textarea.scrollTop = textarea.scrollHeight * (next.lineIndex / lines.length);
            }
        }

        this._highlightNextChordInPreview(next || null);
    },

    // Réinitialise TOUS les repères de marquage (accords ⏱ ET paroles 🎤) de la
    // chanson en cours d'édition — utile après une modification du contenu
    // (ajout/suppression de ligne, section raccourcie…) qui aurait désynchronisé
    // les repères existants (voir le cas "hurt" : lignes décalées après coupe du
    // pont). Ne touche ni au texte de la chanson ni aux autres métadonnées.
    resetKaraokeMarking() {
        const hasChords = this.karaokeLines && this.karaokeLines.length;
        const hasWords = this.wordMarkLines && this.wordMarkLines.length;
        if (!hasChords && !hasWords) {
            this.showError('Aucun repère de marquage (accords ou paroles) à effacer pour cette chanson.');
            return;
        }
        if (!confirm("Effacer TOUS les repères de marquage (accords ET paroles) de cette chanson ?\n\nLe texte lui-même n'est pas modifié — seul le minutage est remis à zéro. Cette action n'est effective qu'après enregistrement.")) return;

        this.karaokeLines = [];
        this._karaokeCurrentChordIdx = 0;
        this._allChordsForKaraoke = null;
        this.wordMarkLines = [];
        this._wordCurrentIdx = 0;
        this._allWordsForKaraoke = null;

        // saveSong() retombe sur currentSong.karaokeTimestamps/wordTimestamps si
        // karaokeLines/wordMarkLines sont vides ET qu'on édite le même fichier
        // (garde-fou anti-héritage entre chansons, voir saveSong) — sans ceci,
        // cette remise à zéro serait silencieusement annulée à la sauvegarde.
        if (this.currentSong) {
            delete this.currentSong.karaokeTimestamps;
            delete this.currentSong.wordTimestamps;
        }

        const display = document.getElementById('karaokeTimerDisplay');
        if (display) display.textContent = '';
        const wordDisplay = document.getElementById('wordTimerDisplay');
        if (wordDisplay) wordDisplay.textContent = '';
        this._updateMarkingHint();
    },

    // ===== MODULE IMPORT LRC =====
    // Ouvre la modale d'import LRC
    // ===== GÉNÉRATEUR DE DIAGRAMME D'ACCORD =====
    // Construit le code à coller dans chords.js à partir d'un diagramme cliquable.
    // Convention : frets[i] = 0 (à vide), -1 (corde estompée/muette), ou N (frette N).
    // Ordre des cordes : grave → aiguë (Mi La Ré Sol Si Mi), comme dans l'exemple fourni.

    openChordGenerator() {
        this._chordGen = {
            baseFret: 1,
            frets: [0, 0, 0, 0, 0, 0],
            muted: [false, false, false, false, false, false],
        };
        const nameInput = document.getElementById('chordgen-name');
        if (nameInput) nameInput.value = '';
        const baseInput = document.getElementById('chordgen-basefret');
        if (baseInput) baseInput.value = '1';
        const modal = document.getElementById('chord-gen-modal');
        if (modal) modal.style.display = 'flex';
        this._chordGenRenderDiagram();
        this._chordGenUpdateCode();
    },

    closeChordGenerator() {
        const modal = document.getElementById('chord-gen-modal');
        if (modal) modal.style.display = 'none';
    },

    _chordGenBaseFretChange(value) {
        const n = Math.max(1, parseInt(value, 10) || 1);
        this._chordGen.baseFret = n;
        this._chordGenRenderDiagram();
        this._chordGenUpdateCode();
    },

    _chordGenToggleMute(stringIdx) {
        const g = this._chordGen;
        g.muted[stringIdx] = !g.muted[stringIdx];
        this._chordGenRenderDiagram();
        this._chordGenUpdateCode();
    },

    _chordGenSetFret(stringIdx, fretNum) {
        const g = this._chordGen;
        g.muted[stringIdx] = false;
        g.frets[stringIdx] = (g.frets[stringIdx] === fretNum) ? 0 : fretNum;
        this._chordGenRenderDiagram();
        this._chordGenUpdateCode();
    },

    _chordGenRenderDiagram() {
        const container = document.getElementById('chordgen-diagram');
        if (!container) return;
        const g = this._chordGen;
        const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
        const NUM_FRETS = 5;
        const cellSize = 34;

        let html = '<table style="border-collapse:collapse;">';

        // Ligne des labels de cordes
        html += '<tr>';
        html += '<td></td>';
        STRING_LABELS.forEach(lbl => {
            html += `<td style="text-align:center; font-size:11px; color:#888; padding-bottom:2px;">${lbl}</td>`;
        });
        html += '</tr>';

        // Ligne "à vide / muette" (O / X)
        html += '<tr>';
        html += '<td></td>';
        for (let s = 0; s < 6; s++) {
            const isMuted = g.muted[s];
            const isOpenActive = !isMuted && g.frets[s] === 0;
            const bg = isMuted ? '#f8d7da' : (isOpenActive ? '#d4edd4' : '#f0f2f5');
            const color = isMuted ? '#a33' : (isOpenActive ? '#2d6a30' : '#999');
            const label = isMuted ? 'X' : 'O';
            html += `<td style="padding:2px;"><div onclick="App._chordGenToggleMute(${s})"
                style="width:${cellSize}px; height:22px; display:flex; align-items:center; justify-content:center;
                cursor:pointer; background:${bg}; color:${color}; font-weight:bold; font-size:12px;
                border-radius:4px; border:1px solid #ccc; user-select:none;">${label}</div></td>`;
        }
        html += '</tr>';

        // Lignes de frettes
        for (let row = 0; row < NUM_FRETS; row++) {
            const fretNum = g.baseFret + row;
            html += '<tr>';
            html += `<td style="font-size:11px; color:#888; text-align:right; padding-right:4px;">${fretNum}</td>`;
            for (let s = 0; s < 6; s++) {
                const active = !g.muted[s] && g.frets[s] === fretNum;
                const bg = active ? '#8fcdf2' : '#fff';
                const border = active ? '#1a5a8a' : '#ccc';
                html += `<td style="padding:2px;"><div onclick="App._chordGenSetFret(${s}, ${fretNum})"
                    style="width:${cellSize}px; height:${cellSize}px; cursor:pointer; background:${bg};
                    border:2px solid ${border}; border-radius:4px;"></div></td>`;
            }
            html += '</tr>';
        }
        html += '</table>';
        container.innerHTML = html;
    },

    _chordGenUpdateCode() {
        const g = this._chordGen;
        if (!g) return;
        const nameInput = document.getElementById('chordgen-name');
        const codeEl = document.getElementById('chordgen-code');
        if (!codeEl) return;
        const name = nameInput ? (nameInput.value || 'NomAccord') : 'NomAccord';
        // Les valeurs du tableau sont RELATIVES à la frette de départ : on
        // retranche (baseFret - 1) à chaque note réellement jouée, pour que la
        // 1ère frette affichée dans le diagramme corresponde à la valeur 1.
        // Les cordes à vide (0) et muettes (-1) ne sont jamais décalées.
        const values = g.frets.map((f, i) => {
            if (g.muted[i]) return -1;
            if (f === 0) return 0;
            return f - (g.baseFret - 1);
        });
        codeEl.value =
            `"${name}": [\n` +
            `    ${g.baseFret},\n` +
            `    [\n` +
            `      ${values.join(',\n      ')}\n` +
            `    ]\n` +
            `  ],`;
    },

    copyChordGenCode() {
        const codeEl = document.getElementById('chordgen-code');
        const btn = document.getElementById('chordgen-copy-btn');
        if (!codeEl || !codeEl.value) return;
        const flash = () => {
            if (!btn) return;
            const original = btn.textContent;
            btn.textContent = '✓ Copié !';
            setTimeout(() => { btn.textContent = original; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(codeEl.value).then(flash).catch(() => {
                codeEl.select();
                document.execCommand('copy');
                flash();
            });
        } else {
            codeEl.select();
            document.execCommand('copy');
            flash();
        }
    },


    openLRCImportModal() {
        if (!this.currentSong && !this.editingFile && !document.getElementById('song-editor').value.trim()) {
            this.showError("Ouvrez ou créez d'abord une chanson dans l'éditeur.");
            return;
        }
        const modal = document.getElementById('lrc-import-modal');
        if (modal) modal.style.display = 'flex';
        const statusEl = document.getElementById('lrc-import-status');
        if (statusEl) statusEl.textContent = '';
        const ta = document.getElementById('lrc-import-textarea');
        if (ta) ta.value = '';
        const offsetEl = document.getElementById('lrc-offset');
        if (offsetEl) offsetEl.value = '0';
    },

    closeLRCImportModal() {
        const modal = document.getElementById('lrc-import-modal');
        if (modal) modal.style.display = 'none';
    },

    // Recherche un fichier LRC synchronisé sur l'API publique de LRCLib.net
    async searchLRCLib() {
        const title = (document.getElementById('song-title').value || '').trim();
        const artist = (document.getElementById('song-artist').value || '').trim();
        const statusEl = document.getElementById('lrc-import-status');

        if (!title) {
            this.showError("Renseignez au moins le titre de la chanson avant de chercher sur LRCLib.");
            return;
        }
        if (statusEl) statusEl.textContent = '🔎 Recherche sur LRCLib.net…';

        try {
            const audioPlayer = document.getElementById('hiddenAudioPlayer');
            const duration = audioPlayer && isFinite(audioPlayer.duration) ? audioPlayer.duration : null;

            const params = new URLSearchParams({ track_name: title });
            if (artist) params.set('artist_name', artist);

            const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const results = await res.json();

            if (!Array.isArray(results) || !results.length) {
                if (statusEl) statusEl.textContent = "Aucun résultat trouvé sur LRCLib pour ce titre/artiste.";
                return;
            }

            // Préférer un résultat avec paroles synchronisées, et dont la durée
            // est proche de celle du MP3 déjà chargé (±3s) si on en a une.
            let best = null;
            if (duration) {
                best = results.find(r => r.syncedLyrics && Math.abs((r.duration || 0) - duration) <= 3);
            }
            if (!best) best = results.find(r => r.syncedLyrics);

            if (!best) {
                if (statusEl) statusEl.textContent = "Résultats trouvés mais aucun n'a de paroles synchronisées (LRC).";
                return;
            }

            const ta = document.getElementById('lrc-import-textarea');
            if (ta) ta.value = best.syncedLyrics;
            const durTxt = best.duration ? ` (${Math.round(best.duration)}s)` : '';
            if (statusEl) statusEl.textContent =
                `✓ Trouvé : "${best.trackName}" — ${best.artistName}${durTxt}. Vérifiez le texte puis cliquez sur Importer.`;
        } catch (e) {
            if (statusEl) statusEl.textContent = "Erreur lors de la recherche LRCLib : " + e.message +
                " (vérifiez votre connexion ou collez le LRC manuellement).";
        }
    },

    // Parse un texte LRC en liste {time (secondes), text} triée par temps
    _parseLRC(lrcText) {
        const tagRe = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;
        const out = [];
        lrcText.split('\n').forEach(line => {
            tagRe.lastIndex = 0;
            const times = [];
            let m;
            while ((m = tagRe.exec(line)) !== null) {
                times.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
            }
            if (!times.length) return; // ignore métadonnées [ar:..], [ti:..], lignes vides, etc.
            const text = line.replace(tagRe, '').trim();
            times.forEach(time => out.push({ time, text }));
        });
        out.sort((a, b) => a.time - b.time);
        return out;
    },

    // Extrait les lignes de paroles "pures" (sans accords/durées) avec leur lineIndex d'origine,
    // dans le même ordre que celles affichées — sert à l'alignement séquentiel avec le LRC.
    _getLyricLinesForAlignment(content) {
        const out = [];
        content.split('\n').forEach((line, lineIndex) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (/^(vvvv|pppp|rrrr|ssss|>>>>|<<<<)/.test(trimmed)) return;
            // Balises <link rel="imageN"/"KVideo" href="..."> : post-its image/vidéo,
            // jamais des paroles à aligner (même filtre que _extractAllWords).
            if (/^<link\b[^>]*>$/i.test(trimmed)) return;
            const pure = line.replace(/\{\{[^}]+\}\}/g, ' ').replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g, '').trim();
            if (!pure) return; // ligne uniquement composée d'accords (instrumental) : pas de paroles à aligner
            out.push({ lineIndex, text: pure });
        });
        return out;
    },

    // Applique le texte LRC saisi/collé dans la modale
    applyLRCImport() {
        const ta = document.getElementById('lrc-import-textarea');
        if (!ta || !ta.value.trim()) {
            this.showError("Collez un texte LRC ou cherchez-en un sur LRCLib avant d'importer.");
            return;
        }
        const offsetEl = document.getElementById('lrc-offset');
        const offset = offsetEl ? (parseFloat(offsetEl.value) || 0) : 0;
        this.importLRCTimestamps(ta.value, offset);
    },

    // Cœur de l'import : aligne les lignes LRC avec les lignes de paroles ChordPro,
    // puis répartit les mots de chaque ligne dans l'intervalle de temps correspondant.
    // offsetSeconds (optionnel, peut être négatif) décale TOUS les repères calculés —
    // utile quand le LRC démarre en avance/retard par rapport au MP3.
    importLRCTimestamps(lrcText, offsetSeconds = 0) {
        const editor = document.getElementById('song-editor');
        if (!editor) return;
        const content = editor.value;

        const lrcLines = this._parseLRC(lrcText);
        if (!lrcLines.length) {
            this.showError("Aucun timestamp LRC valide trouvé (format attendu : [mm:ss.xx] texte).");
            return;
        }
        // Décalage appliqué directement aux temps LRC sources : se propage
        // naturellement à la fenêtre de chaque ligne et donc à tous les mots
        // qui y sont répartis. Jamais de temps négatif.
        if (offsetSeconds) {
            lrcLines.forEach(l => { l.time = Math.max(0, l.time + offsetSeconds); });
        }

        const lyricLines = this._getLyricLinesForAlignment(content);
        if (!lyricLines.length) {
            this.showError("Aucune ligne de paroles trouvée dans l'éditeur.");
            return;
        }

        // L'import cale désormais le marquage des PAROLES (wordMarkLines), pas les
        // accords : le minutage LRC est par ligne, ce qui correspond bien mieux à
        // une répartition des mots (granularité fine, système indépendant du
        // marquage par accord) qu'à une approximation par position d'accord.
        const allWords = this._extractAllWords(content);
        if (!allWords.length) {
            this.showError("Aucune parole trouvée dans cette chanson.");
            return;
        }

        // Alignement séquentiel : la i-ème ligne de paroles correspond à la i-ème ligne LRC.
        // (Le nombre de lignes peut différer légèrement entre la source LRC et le ChordPro :
        // on aligne sur le minimum et l'utilisateur affine ensuite avec 🎤 Marquer.)
        const n = Math.min(lyricLines.length, lrcLines.length);
        const lineWindow = {}; // lineIndex -> { start, end }
        for (let i = 0; i < n; i++) {
            const start = lrcLines[i].time;
            const end = (i + 1 < lrcLines.length) ? lrcLines[i + 1].time : start + 4; // fenêtre par défaut pour la dernière ligne
            lineWindow[lyricLines[i].lineIndex] = { start, end: Math.max(end, start + 0.3) };
        }

        // Regrouper les mots par ligne pour répartir leur position dans la fenêtre de temps
        const wordsByLine = {};
        allWords.forEach(w => (wordsByLine[w.lineIndex] = wordsByLine[w.lineIndex] || []).push(w));

        this.wordMarkLines = [];
        let matched = 0;
        allWords.forEach(w => {
            const win = lineWindow[w.lineIndex];
            if (!win) return; // ligne sans correspondance LRC (ex. ligne instrumentale en trop)
            const lineWords = wordsByLine[w.lineIndex];
            const pos = lineWords.indexOf(w);
            // Répartit les mots sur 90% de la fenêtre, en gardant une marge avant la ligne suivante
            const frac = lineWords.length > 1 ? pos / lineWords.length : 0;
            const time = win.start + frac * (win.end - win.start) * 0.9;
            const key = `${w.lineIndex}_${w.wordIndex}`;
            // source: 'lrc' distingue un repère estimé automatiquement (réparti
            // arithmétiquement sur la fenêtre de la ligne, cf. `frac` ci-dessus — donc
            // approximatif) d'un repère réellement minuté au mot près via 🎤 Marquer.
            // Sert en lecture karaoké (voir openKaraoke/_karaokeLoopWords) à savoir si
            // l'on peut se fier au découpage mot par mot ou s'il vaut mieux afficher la
            // ligne entière (moins précis mais visuellement plus fidèle qu'un surlignage
            // mot par mot qui ne serait pas vraiment synchronisé avec la voix).
            this.wordMarkLines.push({ key, lineIndex: w.lineIndex, wordIndex: w.wordIndex, word: w.word, time, source: 'lrc' });
            matched++;
        });

        // L'index repart à 0 pour permettre d'affiner précisément avec 🎤 Marquer si besoin
        this._allWordsForKaraoke = allWords;
        this._wordCurrentIdx = 0;
        const offsetTxt = offsetSeconds ? ` (décalage de ${offsetSeconds > 0 ? '+' : ''}${offsetSeconds}s appliqué)` : '';
        const display = document.getElementById('wordTimerDisplay');
        if (display) display.textContent =
            `📥 ${matched}/${allWords.length} mots pré-minutés depuis le LRC (alignement séquentiel sur ${n} lignes)${offsetTxt}. ` +
            `Affinez avec 🎤 Marquer si besoin, puis sauvegardez.`;
        this._updateMarkingHint();

        this._highlightNextWord(allWords[0]);
        this.closeLRCImportModal();
    },
    // ===== FIN MODULE IMPORT LRC =====

    // "Marquage ligne" : construit un marquage des PAROLES quasi instantané en
    // réutilisant le temps du PREMIER accord déjà marqué (⏱, chordIndex 0) sur
    // chaque ligne comme instant de départ de cette ligne — une seule entrée
    // (le premier mot) par ligne, pas un vrai marquage mot par mot. Nécessite
    // donc que les accords soient déjà marqués. Comme pour un import LRC
    // (source: 'lrc'), la ligne s'affichera entière en lecture karaoké plutôt
    // qu'avec un surlignage mot par mot (voir _isWordTimingEmpirical) — logique,
    // puisqu'on ne connaît que l'instant de départ de la ligne, pas celui de
    // chacun de ses mots.
    markLinesFromChords() {
        if (!this.currentSong) { this.showError('Aucune chanson chargée.'); return; }
        if (!this.karaokeLines || !this.karaokeLines.length) {
            this.showError("Marquez d'abord les accords (⏱) : ce bouton réutilise le temps du 1er accord de chaque ligne.");
            return;
        }
        if (this.wordMarkLines && this.wordMarkLines.length) {
            if (!confirm('Un marquage des paroles existe déjà pour cette chanson.\n\nLe remplacer par un marquage ligne par ligne basé sur les accords ?')) return;
        }

        const content = document.getElementById('song-editor').value;
        const allWords = this._extractAllWords(content);

        // Premier mot (wordIndex 0, syllableIndex 0) de chaque ligne de paroles.
        const firstWordByLine = new Map();
        allWords.forEach(w => {
            if (w.wordIndex === 0 && w.syllableIndex === 0 && !firstWordByLine.has(w.lineIndex)) {
                firstWordByLine.set(w.lineIndex, w);
            }
        });

        // Temps du premier accord (chordIndex 0) marqué sur chaque ligne.
        const firstChordTimeByLine = new Map();
        this.karaokeLines.forEach(c => {
            if (c.chordIndex !== 0) return;
            const existing = firstChordTimeByLine.get(c.lineIndex);
            if (existing === undefined || c.time < existing) firstChordTimeByLine.set(c.lineIndex, c.time);
        });

        const result = [];
        let skipped = 0;
        firstWordByLine.forEach((w, lineIndex) => {
            const time = firstChordTimeByLine.get(lineIndex);
            if (time === undefined) { skipped++; return; }
            result.push({ key: `${lineIndex}_0`, lineIndex, wordIndex: 0, syllableIndex: 0, word: w.word, time, source: 'line' });
        });
        result.sort((a, b) => a.time - b.time);

        if (!result.length) {
            this.showError("Aucune ligne de paroles n'a de 1er accord marqué — marquez d'abord les accords (⏱).");
            return;
        }

        this.wordMarkLines = result;
        this._allWordsForKaraoke = allWords;
        this._wordCurrentIdx = 0;
        const display = document.getElementById('wordTimerDisplay');
        if (display) display.textContent =
            `📏 ${result.length} ligne(s) marquée(s) depuis le 1er accord de chacune` +
            (skipped ? ` (${skipped} ligne(s) sans accord marqué ignorée(s))` : '') +
            `. Affinez avec 🎤 Marquer si besoin, puis sauvegardez.`;
        this._updateMarkingHint();
    },

    // Parse le contenu d'une chanson en lignes de paroles (texte + accords positionnés)
    // Ignore les lignes de section (vvvv, pppp, etc.) et tablature (>>>>, <<<<)
    // Retourne un tableau aligné sur les index de ligne du textarea d'origine
    // Recherche dans le texte de la chanson une balise du type :
    //   <link rel="..." href="mp4/MaVideo.mp4">
    // servant à associer une vidéo de fond au mode Karaoké (la valeur de l'attribut
    // rel n'a pas d'importance, SAUF rel="imageN" qui est réservé aux post-it — voir
    // _renderPostits() — et donc exclu ici pour ne jamais être pris pour une vidéo).
    // Retourne l'URL (href) ou null si absente. Cette balise n'est jamais affichée
    // (ni en mode défilement, ni dans les paroles du karaoké) — voir
    // formatSongContent() et _parseKaraokeLines().
    _extractGPVideo(content) {
        if (!content) return null;
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!/^<link\b[^>]*>$/i.test(trimmed)) continue;
            const hrefM = trimmed.match(/\bhref=["']([^"']+)["']/i);
            if (!hrefM) continue;
            const relM = trimmed.match(/\brel=["']([^"']+)["']/i);
            if (relM && /^image\d*$/i.test(relM[1])) continue; // réservé aux post-it
            return hrefM[1];
        }
        return null;
    },

    _parseKaraokeLines(content) {
        return content.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed === ''
                || /^(vvvv|pppp|rrrr|ssss|>>>>|<<<<)/.test(trimmed)
                || /^<link\b[^>]*\bhref=/i.test(trimmed)) {
                return { type: 'skip', raw: line };
            }
            // Retirer aussi les délimiteurs de surlignage **choeur**/++lead++/--mutter--/
            // &&libre&& — mais en conservant, via _extractHighlights, la zone qu'ils
            // délimitaient (marks) pour pouvoir colorer les mots concernés en lecture
            // karaoké (voir plus bas) au lieu de simplement perdre l'information comme
            // avant. Le séparateur de syllabe [|] (voir insertSyllableSeparator) n'est
            // lui aussi qu'un marqueur d'édition — jamais affiché dans l'éditeur/l'aperçu
            // (cf. formatSongContent) — il manquait ici, ce qui le faisait apparaître
            // littéralement en lecture karaoké.
            const stage1 = line.replace(/\s*(?:\[\d+\/\d+\]|\[!\])/g, '').replace(/\[\|\]/g, '');
            const { clean: cleanLine, marks } = this._extractHighlights(stage1);
            const re = /\{\{([^}]+)\}\}/g;
            let m, lastEnd = 0, pureText = '';
            const chordPos = [];
            // cleanToPure[i] : position dans pureText correspondant à la position i dans
            // cleanLine — nécessaire pour recaler les zones surlignées (marks, calculées
            // en coordonnées cleanLine) une fois les accords retirés de pureText.
            const cleanToPure = [];
            while ((m = re.exec(cleanLine)) !== null) {
                const before = cleanLine.slice(lastEnd, m.index);
                for (let k = 0; k <= before.length; k++) cleanToPure[lastEnd + k] = pureText.length + k;
                for (let k = m.index; k < m.index + m[0].length; k++) cleanToPure[k] = pureText.length + before.length;
                chordPos.push({ chord: m[1], pos: pureText.length + before.length });
                pureText += before;
                lastEnd = m.index + m[0].length;
            }
            {
                const tail = cleanLine.slice(lastEnd);
                for (let k = 0; k <= tail.length; k++) cleanToPure[lastEnd + k] = pureText.length + k;
                pureText += tail;
            }
            const pureMarks = marks.map(mk => ({ start: cleanToPure[mk.start], end: cleanToPure[mk.end], cls: mk.cls }));

            // Associer chaque accord à un "porteur" : le mot qui le suit immédiatement,
            // ou un mot fantôme dédié s'il n'y a pas de mot disponible (fin de ligne,
            // ligne instrumentale, ou plusieurs accords sur la même position).
            const wordMatches = [...pureText.matchAll(/\S+/g)];
            const baseWords = wordMatches.map(wm3 => ({
                text: wm3[0], start: wm3.index, chord: null, used: false,
                hl: (pureMarks.find(pm => wm3.index >= pm.start && wm3.index < pm.end) || {}).cls || null,
            }));

            // Construire la liste finale en une seule passe ordonnée par position
            const items = [
                ...baseWords.map(w => ({ kind: 'word', pos: w.start, text: w.text, hl: w.hl })),
                ...chordPos.map(cp => ({ kind: 'chord', pos: cp.pos, chord: cp.chord })),
            // Tiebreaker : à position égale, chord avant word ; deux chords → 0 (stable, ordre d'origine préservé)
            ].sort((a, b) => a.pos - b.pos || (a.kind === b.kind ? 0 : a.kind === 'chord' ? -1 : 1));

            const finalWords = [];
            const realWordMap = []; // realWordMap[n] = index dans finalWords du n-ième VRAI mot
            let pendingChord = null;
            items.forEach(item => {
                if (item.kind === 'chord') {
                    if (pendingChord) {
                        // Deux accords sans mot entre eux : le premier obtient un porteur fantôme
                        finalWords.push({ text: '\u00A0\u00A0\u00A0', chord: pendingChord, hl: null });
                    }
                    pendingChord = item.chord;
                } else {
                    realWordMap.push(finalWords.length);
                    finalWords.push({ text: item.text, chord: pendingChord, hl: item.hl });
                    pendingChord = null;
                }
            });
            // Accord(s) restant après le dernier mot (fin de ligne ou ligne instrumentale)
            if (pendingChord) {
                finalWords.push({ text: '\u00A0\u00A0\u00A0', chord: pendingChord, hl: null });
            }

            return {
                type: 'lyrics',
                words: finalWords.map(w => ({ text: w.text, chord: w.chord, hl: w.hl })),
                realWordMap,
            };
        });
    },


    // Ouvre la vue Karaoké plein écran pour la chanson actuellement affichée
    // true si le minutage des paroles ne contient QUE des repères "approximatifs" —
    // issus d'un import LRC (source: 'lrc', voir importLRCTimestamps) ou d'un
    // marquage ligne par ligne depuis les accords (source: 'line', voir
    // markLinesFromChords) — jamais affinés au mot près. Dès qu'au moins un mot de
    // la chanson a été minuté/réaffiné manuellement (🎤 Marquer), le marqueur
    // 'source' est retiré (voir markWordTimestamp) et cette fonction redevient false.
    _isWordTimingEmpirical(wordTs) {
        return !!(wordTs && wordTs.length && wordTs.every(w => w.source === 'lrc' || w.source === 'line'));
    },

    // Affiche le rappel générique "Lancez le MP3 puis appuyez sur ⏱ ou 🎤" dans
    // l'encadré Lecteur audio — UNE SEULE fois pour toute la chanson (au lieu d'un
    // texte dupliqué dans chaque encadré Marquage), et seulement tant qu'AUCUN
    // repère n'existe encore (ni accord, ni parole) : dès qu'un marquage a démarré,
    // les encadrés Marquage affichent eux-mêmes leur propre progression, le rappel
    // n'a alors plus lieu d'être.
    _updateMarkingHint() {
        const hint = document.getElementById('markingHintDisplay');
        if (!hint) return;
        const noChordMarks = !this.karaokeLines || this.karaokeLines.length === 0;
        const noWordMarks = !this.wordMarkLines || this.wordMarkLines.length === 0;
        hint.textContent = (noChordMarks && noWordMarks) ? 'Lancez le MP3 puis appuyez sur ⏱ ou 🎤' : '';
    },

    openKaraoke: async function() {
        if (!this.currentSong) {
            this.showError("Aucune chanson chargée.");
            return;
        }
        const mode = this.karaokeContentMode || 'acc';
        const timestamps = this.currentSong.karaokeTimestamps;
        const wordTs = this.currentSong.wordTimestamps;

        if (mode === 'paroles') {
            if (!wordTs || !wordTs.length) {
                this.showError("Cette chanson n'a pas de minutage des paroles. Ouvrez-la dans l'éditeur, chargez le MP3, et utilisez le bouton 🎤 Marquer sur chaque mot.");
                return;
            }
        } else {
            if (!timestamps || !timestamps.length) {
                this.showError("Cette chanson n'a pas de repères karaoké. Ouvrez-la dans l'éditeur, chargez le MP3, et utilisez le bouton ⏱ Marquer sur chaque ligne.");
                return;
            }
            if (mode === 'both' && (!wordTs || !wordTs.length)) {
                this.showError("Mode \"Les 2\" indisponible : il manque le minutage des paroles (🎤 Marquer) pour cette chanson. Lancement en mode Accords seul.");
                this.karaokeContentMode = 'acc';
            }
        }
        this._karaokeActiveMode = this.karaokeContentMode; // figé pour la durée de cette session karaoké

        this.karaokeLines = timestamps ? [...timestamps].sort((a, b) => a.time - b.time) : [];
        // wordKaraokeLines : toujours préparé s'il existe, utilisé en mode "paroles"
        // (pilote seul la progression) et en mode "both" (surlignage additionnel).
        this.wordKaraokeLines = wordTs ? [...wordTs].sort((a, b) => a.time - b.time) : [];
        // Si TOUT le minutage vient d'un import LRC jamais affiné (approximatif), on
        // affiche les lignes en entier plutôt qu'un surlignage mot par mot qui donnerait
        // une fausse impression de précision (voir _isWordTimingEmpirical).
        this._wordTimingEmpirical = this._isWordTimingEmpirical(wordTs);
        this.karaokeParsedLines = this._parseKaraokeLines(this.currentSong.content);
        // Fil de pilotage fusionné pour le mode "Les 2" : le minutage des paroles est
        // plus fin, mais une ligne purement instrumentale (ex. intro "| Cmaj7 |", sans
        // aucun mot chanté) n'existe QUE dans karaokeLines — sans cette fusion, une
        // telle ligne ne devenait jamais "courante" ni "suivante" et disparaissait
        // purement et simplement de l'affichage en mode "Les 2".
        this._mergedTimingLines = this._buildMergedTimingLines();

        // Repartir en mode texte à chaque ouverture
        this.karaokeViewMode = 'text';
        const toggleBtn = document.getElementById('karaoke-toggle-view');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '🎸 Diagrammes';
            // Sans objet en mode "paroles" (pas d'accords affichés) : masqué.
            toggleBtn.style.display = mode === 'paroles' ? 'none' : '';
        }

        document.getElementById('karaoke-title').textContent =
            `${this.currentSong.title} — ${this.currentSong.artist}`;
        document.getElementById('karaoke-overlay').style.display = 'flex';
        this._bodyScrollLock();

        // Vidéo de fond optionnelle (balise <link href="...">) : préparée (source
        // chargée, affichée) mais pas encore lancée — la lecture démarre après le
        // décompte, en même temps que le MP3.
        const videoBg = document.getElementById('karaoke-video-bg');
        const videoScrim = document.getElementById('karaoke-video-scrim');
        const videoHref = this._extractGPVideo(this.currentSong.content);
        if (videoBg && videoScrim) {
            if (videoHref) {
                if (videoBg.getAttribute('src') !== videoHref) videoBg.setAttribute('src', videoHref);
                videoBg.pause();
                videoBg.currentTime = 0;
                videoBg.style.display = 'block';
                videoScrim.style.display = 'block';
            } else {
                videoBg.pause();
                videoBg.removeAttribute('src');
                videoBg.load();
                videoBg.style.display = 'none';
                videoScrim.style.display = 'none';
            }
        }

        const audioPlayer = document.getElementById('hiddenAudioPlayer');

        this.karaokeActive = false; // pas encore actif tant que le décompte n'est pas fini
        this._karaokeDisplayedLineIndex = null;
        this._karaokeDisplayedNextLineIndex = null;
        this._karaokeDisplayedNext2LineIndex = null;
        const curLineEl0 = document.getElementById('karaoke-line-current');
        const nextLineEl0 = document.getElementById('karaoke-line-next');
        const prevLineEl0 = document.getElementById('karaoke-line-prev');
        if (curLineEl0) { curLineEl0.innerHTML = ''; curLineEl0.classList.remove('karaoke-line-arrive'); }
        if (nextLineEl0) { nextLineEl0.innerHTML = ''; nextLineEl0.style.opacity = ''; nextLineEl0.style.filter = ''; nextLineEl0.style.transform = ''; }
        if (prevLineEl0) { prevLineEl0.innerHTML = ''; prevLineEl0.style.opacity = ''; prevLineEl0.style.filter = ''; prevLineEl0.style.transform = ''; prevLineEl0.style.transition = ''; }

        // Décompte au tempo (BPM / mesure de la chanson), puis démarrage synchronisé
        // de l'audio, de la vidéo de fond éventuelle et de la boucle d'affichage.
        // On s'assure d'abord que c'est bien le MP3 de CETTE chanson et de la piste
        // sélectionnée (N/bch/bcg/bgu) qui est chargé — pas celui d'une chanson
        // précédente restée en pause dans le lecteur.
        await this._ensureCorrectMp3();
        if (audioPlayer) audioPlayer.currentTime = 0;

        this._startCountdown(() => {
            this.karaokeActive = true;
            if (videoHref) videoBg.play().catch(() => {});
            if (audioPlayer && audioPlayer.src) audioPlayer.play().catch(() => {});
            if (this._karaokeActiveMode === 'paroles') this._karaokeLoopWords();
            else this._karaokeLoop();
        });
    },

    closeKaraoke() {
        // Annuler un éventuel décompte BPM en cours (fermeture pendant le compte à rebours)
        if (this._countdownInterval) {
            clearInterval(this._countdownInterval);
            this._countdownInterval = null;
            const cdOverlay = document.getElementById('countdown-overlay');
            if (cdOverlay) cdOverlay.style.display = 'none';
            if (this._countdownAudioCtx) { this._countdownAudioCtx.close().catch(() => {}); this._countdownAudioCtx = null; }
        }
        this.karaokeActive = false;
        if (this.karaokeRAF) cancelAnimationFrame(this.karaokeRAF);
        document.getElementById('karaoke-overlay').style.display = 'none';
        this._bodyScrollUnlock();
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (audioPlayer) audioPlayer.pause();
        const videoBg = document.getElementById('karaoke-video-bg');
        if (videoBg) videoBg.pause();
        // NB : on ne révoque pas le blob ici — l'utilisateur peut vouloir reprendre la lecture
    },

    // Trouve l'index du repère karaoké actif pour un temps donné
    _findKaraokeIndex(time) {
        let idx = -1;
        for (let i = 0; i < this.karaokeLines.length; i++) {
            if (this.karaokeLines[i].time <= time) idx = i;
            else break;
        }
        return idx;
    },

    // Équivalent de _findKaraokeIndex, mais sur les repères de PAROLES (wordKaraokeLines)
    // — système totalement indépendant du minutage par accord.
    _findWordKaraokeIndex(time) {
        let idx = -1;
        for (let i = 0; i < this.wordKaraokeLines.length; i++) {
            if (this.wordKaraokeLines[i].time <= time) idx = i;
            else break;
        }
        return idx;
    },

    // Équivalent de _findKaraokeIndex, mais sur le fil fusionné (_mergedTimingLines)
    // utilisé par le mode "Les 2" — voir _buildMergedTimingLines.
    _findMergedKaraokeIndex(time) {
        let idx = -1;
        for (let i = 0; i < this._mergedTimingLines.length; i++) {
            if (this._mergedTimingLines[i].time <= time) idx = i;
            else break;
        }
        return idx;
    },

    // Construit le HTML d'une ligne karaoké avec accords au-dessus et surlignage mot par mot
    // Construit le HTML d'une ligne karaoké : l'accord guide l'affichage,
    // les paroles sont affichées statiquement (aucun surlignage mot par mot),
    // SAUF en mode "Les 2" où sungWordSet ajoute un surlignage progressif mot par
    // mot (issu du minutage indépendant des paroles) par-dessus l'accord actif.
    _renderKaraokeLine(parsedLine, activeKey, sungWordSet) {
        if (!parsedLine || parsedLine.type !== 'lyrics') return '';
        const wordsList = parsedLine.words;
        if (!wordsList.length) return '';

        // activeKey : index (dans wordsList) du mot porteur de l'accord actif, ou -1
        return wordsList.map((w, i) => {
            const isActive = i === activeKey;
            const chordCls = isActive ? 'karaoke-chord--active' : '';
            const chordHtml = w.chord
                ? `<span class="karaoke-chord ${chordCls}">${w.chord}</span>`
                : '<span class="karaoke-chord">&nbsp;</span>';
            const sungCls = (sungWordSet && sungWordSet.has(i)) ? ' sung' : '';
            // hl : **choeur**/++lead++/--mutter--/&&libre&& (voir _parseKaraokeLines) —
            // même classe que dans l'aperçu éditeur (lyric-highlight-*), colorée
            // différemment ici pour rester lisible sur fond sombre (voir index.html).
            const hlCls = w.hl ? ` ${w.hl}` : '';
            return `<span class="karaoke-word">${chordHtml}<span class="karaoke-text${sungCls}${hlCls}">${w.text}</span></span>`;
        }).join('');
    },

    // Bascule entre le mode texte (noms d'accords) et le mode diagrammes (SVG)
    toggleKaraokeView() {
        this.karaokeViewMode = this.karaokeViewMode === 'text' ? 'diagram' : 'text';
        const btn = document.getElementById('karaoke-toggle-view');
        if (btn) {
            btn.classList.toggle('active', this.karaokeViewMode === 'diagram');
            btn.textContent = this.karaokeViewMode === 'diagram' ? '🔤 Texte' : '🎸 Diagrammes';
        }
        if (this.karaokeActive) this._karaokeLoop();
    },

    // Rendu d'une ligne en mode diagrammes : SVG du manche au lieu du nom texte
    _renderKaraokeLineDiagram(parsedLine, activeKey) {
        if (!parsedLine || parsedLine.type !== 'lyrics') return '';
        const wordsList = parsedLine.words;
        if (!wordsList.length) return '';

        return wordsList.map((w, i) => {
            const isActive = i === activeKey;
            const hlCls = w.hl ? ` ${w.hl}` : '';
            if (!w.chord) {
                return `<span class="karaoke-word"><span class="karaoke-diagram-placeholder"></span><span class="karaoke-text${hlCls}">${w.text}</span></span>`;
            }
            const svg = (typeof ChordDB !== 'undefined') ? ChordDB.buildDiagramSVG(w.chord) : '';
            const diagramCls = isActive ? 'karaoke-diagram-svg active' : 'karaoke-diagram-svg';
            const nameCls = isActive ? 'karaoke-chord-name active' : 'karaoke-chord-name';
            const diagramHtml = svg
                ? `<span class="${diagramCls}">${svg}</span><span class="${nameCls}">${w.chord}</span>`
                : `<span class="karaoke-diagram-placeholder"></span><span class="${nameCls}">${w.chord}</span>`;
            return `<span class="karaoke-word karaoke-word--diagram">${diagramHtml}<span class="karaoke-text${hlCls}">${w.text}</span></span>`;
        }).join('');
    },

    // Boucle d'animation principale du karaoké (requestAnimationFrame)
    // Fusionne wordKaraokeLines avec les repères d'accord des lignes purement
    // instrumentales (sans aucun mot chanté, donc absentes de wordKaraokeLines),
    // pour que le mode "Les 2" puisse quand même s'arrêter dessus.
    _buildMergedTimingLines() {
        if (!this.wordKaraokeLines.length) return this.karaokeLines;
        const linesWithWords = new Set(this.wordKaraokeLines.map(w => w.lineIndex));
        const instrumentalMarkers = this.karaokeLines.filter(m => !linesWithWords.has(m.lineIndex));
        return [...this.wordKaraokeLines, ...instrumentalMarkers].sort((a, b) => a.time - b.time);
    },

    _karaokeLoop() {
        if (!this.karaokeActive) return;
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        const time = audioPlayer ? audioPlayer.currentTime : 0;
        const duration = audioPlayer ? audioPlayer.duration : 0;

        // En mode "Les 2", les accords sont souvent bien plus épars que les mots
        // (parfois 1 seul accord pour toute une phrase) : s'appuyer sur eux pour
        // décider QUAND la ligne suivante devient la ligne courante faisait arriver
        // celle-ci très en retard (parfois quand la phrase était presque terminée).
        // On utilise donc le minutage des PAROLES — plus fin — pour piloter la
        // progression de ligne dès qu'il est disponible ; les accords ne servent
        // plus qu'à déterminer quel accord est actif sur la ligne courante.
        const useWordTiming = this._karaokeActiveMode === 'both' && this.wordKaraokeLines.length > 0;
        const timingLines = useWordTiming ? this._mergedTimingLines : this.karaokeLines;
        const idx = useWordTiming ? this._findMergedKaraokeIndex(time) : this._findKaraokeIndex(time);
        const curMarker = idx >= 0 ? timingLines[idx] : null;

        const curLineEl  = document.getElementById('karaoke-line-current');
        const nextLineEl = document.getElementById('karaoke-line-next');
        const next2LineEl = document.getElementById('karaoke-line-next2');
        const fillEl     = document.getElementById('karaoke-progress-fill');

        const renderFn = this.karaokeViewMode === 'diagram'
            ? this._renderKaraokeLineDiagram.bind(this)
            : this._renderKaraokeLine.bind(this);

        let curParsed = null, nextParsed = null, next2Parsed = null, activeKey = -1;
        let curLineIndex = -1, nextLineIndex = -1, next2LineIndex = -1;
        // Progression (0 → 1) entre le début de la ligne courante et le début de la
        // ligne suivante : sert à faire "monter en intensité lumineuse" la ligne
        // suivante à mesure qu'on s'en approche.
        let nextFrac = 0;

        if (curMarker) {
            curParsed = this.karaokeParsedLines[curMarker.lineIndex];
            curLineIndex = curMarker.lineIndex;

            // Heure de début de la ligne courante = heure du PREMIER repère de cette
            // ligne (une ligne peut porter plusieurs accords/mots successifs).
            let lineStartIdx = idx;
            while (lineStartIdx > 0 && timingLines[lineStartIdx - 1].lineIndex === curLineIndex) {
                lineStartIdx--;
            }
            const lineStartTime = timingLines[lineStartIdx].time;

            // Vraie ligne suivante = premier repère appartenant à une ligne DIFFÉRENTE
            // (on saute les éventuels autres repères de la ligne courante), pour que la
            // ligne "à venir" ne change qu'une fois par ligne de parole.
            let nextIdx = idx + 1;
            while (nextIdx < timingLines.length && timingLines[nextIdx].lineIndex === curLineIndex) {
                nextIdx++;
            }
            const nextMarker = nextIdx < timingLines.length ? timingLines[nextIdx] : null;
            if (nextMarker) {
                nextParsed = this.karaokeParsedLines[nextMarker.lineIndex];
                nextLineIndex = nextMarker.lineIndex;
                const span = nextMarker.time - lineStartTime;
                nextFrac = span > 0 ? Math.min(1, Math.max(0, (time - lineStartTime) / span)) : 1;

                // Ligne d'après (aperçu supplémentaire, cf. karaoke-line--next2) : premier
                // repère appartenant à une ligne différente de la courante ET de "next".
                let next2Idx = nextIdx + 1;
                while (next2Idx < timingLines.length &&
                       (timingLines[next2Idx].lineIndex === curLineIndex || timingLines[next2Idx].lineIndex === nextLineIndex)) {
                    next2Idx++;
                }
                const next2Marker = next2Idx < timingLines.length ? timingLines[next2Idx] : null;
                if (next2Marker) {
                    next2Parsed = this.karaokeParsedLines[next2Marker.lineIndex];
                    next2LineIndex = next2Marker.lineIndex;
                }
            }

            // Retrouver l'accord actif sur la ligne courante : le dernier repère
            // d'accord (karaokeLines, indépendant de timingLines ci-dessus) dont le
            // temps est passé et qui appartient à cette même ligne.
            let activeChordMarker = null;
            for (const m of this.karaokeLines) {
                if (m.lineIndex === curLineIndex && m.time <= time) {
                    if (!activeChordMarker || m.time > activeChordMarker.time) activeChordMarker = m;
                }
            }
            if (activeChordMarker && curParsed && curParsed.words) {
                let seen = 0;
                for (let i = 0; i < curParsed.words.length; i++) {
                    if (curParsed.words[i].chord !== null) {
                        if (seen === activeChordMarker.chordIndex) { activeKey = i; break; }
                        seen++;
                    }
                }
            }
        } else {
            const firstMarker = timingLines[0];
            if (firstMarker) {
                nextParsed = this.karaokeParsedLines[firstMarker.lineIndex];
                nextLineIndex = firstMarker.lineIndex;
                nextFrac = firstMarker.time > 0 ? Math.min(1, Math.max(0, time / firstMarker.time)) : 1;

                let next2Idx = 1;
                while (next2Idx < timingLines.length && timingLines[next2Idx].lineIndex === nextLineIndex) next2Idx++;
                const next2Marker = next2Idx < timingLines.length ? timingLines[next2Idx] : null;
                if (next2Marker) {
                    next2Parsed = this.karaokeParsedLines[next2Marker.lineIndex];
                    next2LineIndex = next2Marker.lineIndex;
                }
            }
        }

        const prevLineEl = document.getElementById('karaoke-line-prev');
        const GAP = 40; // doit correspondre au 'gap' CSS de #karaoke-lines

        // Mode "Les 2" uniquement : surlignage progressif mot par mot sur la ligne
        // courante, à partir du minutage INDÉPENDANT des paroles (wordKaraokeLines),
        // en plus de l'accord actif déjà géré ci-dessus.
        let sungWordSet = null;
        if (this._karaokeActiveMode === 'both' && curParsed && curParsed.realWordMap && this.wordKaraokeLines.length) {
            sungWordSet = new Set();
            for (const wl of this.wordKaraokeLines) {
                if (wl.lineIndex !== curLineIndex || wl.time > time) continue;
                const finalIdx = curParsed.realWordMap[wl.wordIndex];
                if (finalIdx !== undefined) sungWordSet.add(finalIdx);
            }
        }

        if (curLineEl && curLineIndex !== this._karaokeDisplayedLineIndex) {
            const hadPrevious = this._karaokeDisplayedLineIndex !== null && curLineEl.innerHTML;

            if (hadPrevious && prevLineEl) {
                // La ligne qui vient d'être lue s'en va vers le haut avec la même animation
                // que celle qui arrive (translation + luminosité), mais inversée : elle perd
                // en intensité au lieu d'en gagner.
                const travel = curLineEl.offsetHeight + GAP;
                prevLineEl.style.transition = 'none';
                prevLineEl.innerHTML = curLineEl.innerHTML;
                prevLineEl.style.transform = 'translateY(0)';
                prevLineEl.style.opacity = '1';
                prevLineEl.style.filter = 'brightness(1)';
                void prevLineEl.offsetWidth; // force le reflow pour armer la transition
                prevLineEl.style.transition = 'transform 0.55s ease, opacity 0.55s ease, filter 0.55s ease';
                prevLineEl.style.transform = `translateY(${(-travel).toFixed(1)}px)`;
                prevLineEl.style.opacity = '0.08';
                prevLineEl.style.filter = 'brightness(0.45)';
            }

            // Ligne courante : contenu remplacé directement (pas de déplacement), avec
            // un pulse lumineux net pour bien marquer son arrivée.
            this._karaokeDisplayedLineIndex = curLineIndex;
            curLineEl.innerHTML = curParsed ? renderFn(curParsed, activeKey, sungWordSet) : '';
            curLineEl.classList.remove('karaoke-line-arrive');
            void curLineEl.offsetWidth; // force le reflow pour pouvoir rejouer l'animation
            curLineEl.classList.add('karaoke-line-arrive');
        } else if (curLineEl && curParsed) {
            // Même ligne : on rafraîchit quand même le surlignage de l'accord actif.
            curLineEl.innerHTML = renderFn(curParsed, activeKey, sungWordSet);
        }

        if (nextLineEl) {
            const isNewNextLine = nextLineIndex !== this._karaokeDisplayedNextLineIndex;
            if (isNewNextLine) {
                this._karaokeDisplayedNextLineIndex = nextLineIndex;
                nextLineEl.innerHTML = nextParsed ? renderFn(nextParsed, -1) : '';
            }
            if (nextParsed) {
                // Courbe d'accélération : la ligne suivante doit être bien visible BIEN
                // avant l'instant de bascule (surtout quand le repère de son 1er accord
                // arrive tard, en fin de phrase courante) — on "brûle" donc vite le début
                // de la progression au lieu de suivre nextFrac de façon linéaire, tout en
                // arrivant pile à son état final (position centrale, pleine intensité)
                // exactement à l'instant de la bascule (revealFrac(1) = 1).
                const revealFrac = Math.pow(Math.min(1, Math.max(0, nextFrac)), 0.4);

                // Distance parcourue par la ligne suivante : elle part d'une position plus
                // basse (deux lignes sous la ligne lue) et remonte progressivement jusqu'à
                // sa position de repos naturelle — UNE ligne sous la ligne courante — sans
                // jamais rejoindre ni superposer celle-ci. Basée sur sa propre hauteur pour
                // rester juste quel que soit le mode d'affichage (texte / diagrammes).
                const travel = nextLineEl.offsetHeight + GAP;
                nextLineEl.style.transform = `translateY(${(travel * (1 - revealFrac)).toFixed(1)}px)`;
                nextLineEl.style.opacity   = (0.28 + 0.72 * revealFrac).toFixed(2);
                nextLineEl.style.filter    = `brightness(${(1 + revealFrac * 0.6).toFixed(2)})`;
            } else {
                nextLineEl.style.transform = 'translateY(0)';
                nextLineEl.style.opacity = 0;
            }
        }

        // Ligne d'aperçu supplémentaire (celle d'après "next") : donne davantage de
        // temps pour l'anticiper visuellement, affichage statique (fondu simple au
        // changement de contenu, pas de montée en intensité comme la ligne "next").
        if (next2LineEl && next2LineIndex !== this._karaokeDisplayedNext2LineIndex) {
            this._karaokeDisplayedNext2LineIndex = next2LineIndex;
            next2LineEl.style.opacity = '0';
            next2LineEl.innerHTML = next2Parsed ? renderFn(next2Parsed, -1) : '';
            requestAnimationFrame(() => { next2LineEl.style.opacity = next2Parsed ? '0.22' : '0'; });
        }

        if (fillEl && duration > 0 && isFinite(duration)) {
            fillEl.style.width = `${Math.min(100, (time / duration) * 100)}%`;
        }

        // Fermeture auto à la fin du morceau
        if (audioPlayer && audioPlayer.ended) {
            this.closeKaraoke();
            return;
        }

        this.karaokeRAF = requestAnimationFrame(() => this._karaokeLoop());
    },

    // ===== MODE "PAROLES" SEULES (indépendant du minutage par accord) =====

    // Rendu d'une ligne en mode "Paroles" seules : pas d'accords, juste le texte,
    // avec le mot en cours d'articulation (activeIdx) et les mots déjà chantés
    // (sungWordSet) mis en valeur — façon karaoké chant classique.
    // wholeLineActive : true quand le minutage n'est qu'une estimation LRC non
    // affinée (voir _isWordTimingEmpirical) — tous les mots réels de la ligne sont
    // alors affichés "active" ensemble (la phrase entière), plutôt qu'un surlignage
    // mot par mot qui suggérerait à tort une précision à la syllabe près.
    _renderKaraokeLineWordsOnly(parsedLine, sungWordSet, activeIdx, wholeLineActive) {
        if (!parsedLine || parsedLine.type !== 'lyrics') return '';
        const wordsList = parsedLine.words;
        if (!wordsList.length) return '';
        return wordsList.map((w, i) => {
            if (w.text === '\u00A0\u00A0\u00A0') return ''; // porteur d'accord fantôme : sans objet ici
            let cls = '';
            if (wholeLineActive) cls = ' active';
            else if (i === activeIdx) cls = ' active';
            else if (sungWordSet && sungWordSet.has(i)) cls = ' sung';
            const hlCls = w.hl ? ` ${w.hl}` : '';
            return `<span class="karaoke-word"><span class="karaoke-text-only${cls}${hlCls}">${w.text}</span></span>`;
        }).join('');
    },

    // Boucle d'animation dédiée au mode "Paroles" seules — même mécanique visuelle
    // que _karaokeLoop (lignes prev/cur/next, montée en intensité) mais pilotée par
    // wordKaraokeLines (minutage indépendant des paroles) au lieu des accords.
    _karaokeLoopWords() {
        if (!this.karaokeActive) return;
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        const time = audioPlayer ? audioPlayer.currentTime : 0;
        const duration = audioPlayer ? audioPlayer.duration : 0;

        const idx = this._findWordKaraokeIndex(time);
        const curMarker = idx >= 0 ? this.wordKaraokeLines[idx] : null;

        const curLineEl  = document.getElementById('karaoke-line-current');
        const nextLineEl = document.getElementById('karaoke-line-next');
        const next2LineEl = document.getElementById('karaoke-line-next2');
        const fillEl     = document.getElementById('karaoke-progress-fill');

        let curParsed = null, nextParsed = null, next2Parsed = null, activeIdx = -1, sungWordSet = null;
        let curLineIndex = -1, nextLineIndex = -1, next2LineIndex = -1;
        let nextFrac = 0;

        if (curMarker) {
            curParsed = this.karaokeParsedLines[curMarker.lineIndex];
            curLineIndex = curMarker.lineIndex;

            let lineStartIdx = idx;
            while (lineStartIdx > 0 && this.wordKaraokeLines[lineStartIdx - 1].lineIndex === curLineIndex) {
                lineStartIdx--;
            }
            const lineStartTime = this.wordKaraokeLines[lineStartIdx].time;

            let nextIdx = idx + 1;
            while (nextIdx < this.wordKaraokeLines.length && this.wordKaraokeLines[nextIdx].lineIndex === curLineIndex) {
                nextIdx++;
            }
            const nextMarker = nextIdx < this.wordKaraokeLines.length ? this.wordKaraokeLines[nextIdx] : null;
            if (nextMarker) {
                nextParsed = this.karaokeParsedLines[nextMarker.lineIndex];
                nextLineIndex = nextMarker.lineIndex;
                const span = nextMarker.time - lineStartTime;
                nextFrac = span > 0 ? Math.min(1, Math.max(0, (time - lineStartTime) / span)) : 1;

                // Ligne d'aperçu supplémentaire (cf. karaoke-line--next2), même principe
                // que dans _karaokeLoop : plus de temps pour l'anticiper visuellement.
                let next2Idx = nextIdx + 1;
                while (next2Idx < this.wordKaraokeLines.length &&
                       (this.wordKaraokeLines[next2Idx].lineIndex === curLineIndex || this.wordKaraokeLines[next2Idx].lineIndex === nextLineIndex)) {
                    next2Idx++;
                }
                const next2Marker = next2Idx < this.wordKaraokeLines.length ? this.wordKaraokeLines[next2Idx] : null;
                if (next2Marker) {
                    next2Parsed = this.karaokeParsedLines[next2Marker.lineIndex];
                    next2LineIndex = next2Marker.lineIndex;
                }
            }

            if (curParsed && curParsed.realWordMap) {
                const finalIdx = curParsed.realWordMap[curMarker.wordIndex];
                if (finalIdx !== undefined) activeIdx = finalIdx;
                sungWordSet = new Set();
                for (const wl of this.wordKaraokeLines) {
                    if (wl.lineIndex !== curLineIndex || wl.time > time) continue;
                    const fi = curParsed.realWordMap[wl.wordIndex];
                    if (fi !== undefined) sungWordSet.add(fi);
                }
            }
        } else {
            const firstMarker = this.wordKaraokeLines[0];
            if (firstMarker) {
                nextParsed = this.karaokeParsedLines[firstMarker.lineIndex];
                nextLineIndex = firstMarker.lineIndex;
                nextFrac = firstMarker.time > 0 ? Math.min(1, Math.max(0, time / firstMarker.time)) : 1;

                let next2Idx = 1;
                while (next2Idx < this.wordKaraokeLines.length && this.wordKaraokeLines[next2Idx].lineIndex === nextLineIndex) next2Idx++;
                const next2Marker = next2Idx < this.wordKaraokeLines.length ? this.wordKaraokeLines[next2Idx] : null;
                if (next2Marker) {
                    next2Parsed = this.karaokeParsedLines[next2Marker.lineIndex];
                    next2LineIndex = next2Marker.lineIndex;
                }
            }
        }

        const renderFn = (parsed, sungSet, active, wholeLine) => this._renderKaraokeLineWordsOnly(parsed, sungSet, active, wholeLine);
        const prevLineEl = document.getElementById('karaoke-line-prev');
        const GAP = 40; // doit correspondre au 'gap' CSS de #karaoke-lines

        if (curLineEl && curLineIndex !== this._karaokeDisplayedLineIndex) {
            const hadPrevious = this._karaokeDisplayedLineIndex !== null && curLineEl.innerHTML;
            if (hadPrevious && prevLineEl) {
                const travel = curLineEl.offsetHeight + GAP;
                prevLineEl.style.transition = 'none';
                prevLineEl.innerHTML = curLineEl.innerHTML;
                prevLineEl.style.transform = 'translateY(0)';
                prevLineEl.style.opacity = '1';
                prevLineEl.style.filter = 'brightness(1)';
                void prevLineEl.offsetWidth;
                prevLineEl.style.transition = 'transform 0.55s ease, opacity 0.55s ease, filter 0.55s ease';
                prevLineEl.style.transform = `translateY(${(-travel).toFixed(1)}px)`;
                prevLineEl.style.opacity = '0.08';
                prevLineEl.style.filter = 'brightness(0.45)';
            }
            this._karaokeDisplayedLineIndex = curLineIndex;
            curLineEl.innerHTML = curParsed ? renderFn(curParsed, sungWordSet, activeIdx, this._wordTimingEmpirical) : '';
            curLineEl.classList.remove('karaoke-line-arrive');
            void curLineEl.offsetWidth;
            curLineEl.classList.add('karaoke-line-arrive');
        } else if (curLineEl && curParsed) {
            curLineEl.innerHTML = renderFn(curParsed, sungWordSet, activeIdx, this._wordTimingEmpirical);
        }

        if (nextLineEl) {
            const isNewNextLine = nextLineIndex !== this._karaokeDisplayedNextLineIndex;
            if (isNewNextLine) {
                this._karaokeDisplayedNextLineIndex = nextLineIndex;
                nextLineEl.innerHTML = nextParsed ? renderFn(nextParsed, null, -1) : '';
            }
            if (nextParsed) {
                const revealFrac = Math.pow(Math.min(1, Math.max(0, nextFrac)), 0.4);
                const travel = nextLineEl.offsetHeight + GAP;
                nextLineEl.style.transform = `translateY(${(travel * (1 - revealFrac)).toFixed(1)}px)`;
                nextLineEl.style.opacity   = (0.28 + 0.72 * revealFrac).toFixed(2);
                nextLineEl.style.filter    = `brightness(${(1 + revealFrac * 0.6).toFixed(2)})`;
            } else {
                nextLineEl.style.transform = 'translateY(0)';
                nextLineEl.style.opacity = 0;
            }
        }

        // Ligne d'aperçu supplémentaire (celle d'après "next") : voir _karaokeLoop.
        if (next2LineEl && next2LineIndex !== this._karaokeDisplayedNext2LineIndex) {
            this._karaokeDisplayedNext2LineIndex = next2LineIndex;
            next2LineEl.style.opacity = '0';
            next2LineEl.innerHTML = next2Parsed ? renderFn(next2Parsed, null, -1) : '';
            requestAnimationFrame(() => { next2LineEl.style.opacity = next2Parsed ? '0.22' : '0'; });
        }

        if (fillEl && duration > 0 && isFinite(duration)) {
            fillEl.style.width = `${Math.min(100, (time / duration) * 100)}%`;
        }

        if (audioPlayer && audioPlayer.ended) {
            this.closeKaraoke();
            return;
        }

        this.karaokeRAF = requestAnimationFrame(() => this._karaokeLoopWords());
    },

    // ===== FIN MODULE KARAOKÉ =====

    // ===== PLEIN ÉCRAN PAROLES =====
    // Bascule plein écran sur #song-content-display :
    //   1. API native requestFullscreen() (tablette, navigateur moderne)
    //   2. Fallback CSS position:fixed si l'API est indisponible ou refusée
    toggleLyricsFullscreen() {
        const el = document.getElementById('song-content-display');
        if (!el) return;

        const btn = document.getElementById('btn-fullscreen-lyrics');
        const isCSSFullscreen = el.classList.contains('lyrics-css-fullscreen');
        const isNativeFS = !!document.fullscreenElement;

        // --- Sortie plein écran ---
        if (isNativeFS || isCSSFullscreen) {
            if (isNativeFS && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            this._exitLyricsCSSFullscreen();
            return;
        }

        // --- Entrée plein écran : essayer l'API native d'abord ---
        const requestFS = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.mozRequestFullScreen
            || el.msRequestFullscreen;

        if (requestFS) {
            requestFS.call(el).then(() => {
                // API native OK : ajouter quand même le bouton fermer flottant
                this._injectFullscreenCloseBtn();
                if (btn) { btn.textContent = '✕'; btn.title = 'Quitter le plein écran'; btn.style.opacity = '1'; }
                this._fitLyricsFullscreen(true);
                this._renderPostits(); // le passage plein écran peut changer le retour à la ligne du texte
                // Quand l'utilisateur appuie sur Échap, nettoyer l'UI
                const onFsChange = () => {
                    if (!document.fullscreenElement) {
                        this._exitLyricsCSSFullscreen();
                        document.removeEventListener('fullscreenchange', onFsChange);
                        document.removeEventListener('webkitfullscreenchange', onFsChange);
                    }
                };
                document.addEventListener('fullscreenchange', onFsChange);
                document.addEventListener('webkitfullscreenchange', onFsChange);
            }).catch(() => {
                // API refusée (ex: iframe, politique navigateur) → fallback CSS
                this._enterLyricsCSSFullscreen(el, btn);
            });
        } else {
            // Navigateur sans API → fallback CSS direct
            this._enterLyricsCSSFullscreen(el, btn);
        }
    },

    _enterLyricsCSSFullscreen(el, btn) {
        el.classList.add('lyrics-css-fullscreen');
        this._injectFullscreenCloseBtn();
        if (btn) { btn.textContent = '✕'; btn.title = 'Quitter le plein écran'; btn.style.opacity = '1'; }
        this._bodyScrollLock();
        this._fitLyricsFullscreen(true);
        this._renderPostits();
    },

    _exitLyricsCSSFullscreen() {
        const el = document.getElementById('song-content-display');
        if (el) { el.classList.remove('lyrics-css-fullscreen'); if (typeof LyricsFit !== 'undefined') LyricsFit.resetMaster(el); }
        this._lyricsFitSig = ''; this._lyricsFitKey = '';
        this._bodyScrollUnlock();
        const closeBtn = document.getElementById('lyrics-fs-close');
        if (closeBtn) closeBtn.remove();
        const fsScrollBtn = document.getElementById('lyrics-fs-scroll');
        if (fsScrollBtn) fsScrollBtn.remove();
        const btn = document.getElementById('btn-fullscreen-lyrics');
        if (btn) { btn.textContent = '⛶'; btn.title = 'Plein écran paroles'; btn.style.opacity = '0.6'; }
        this._renderPostits(); // re-parente le tooltip post-it vers document.body
        this._renderPostits();
    },

    _bodyScrollLock() {
        if (this._scrollLockActive) return;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const sbWidth = window.innerWidth - document.documentElement.clientWidth;
        this._scrollLockScrollY = scrollY;
        document.body.style.position    = 'fixed';
        document.body.style.top         = `-${scrollY}px`;
        document.body.style.left        = '0';
        document.body.style.right       = '0';
        document.body.style.overflow    = 'hidden';
        if (sbWidth > 0) document.body.style.paddingRight = `${sbWidth}px`;
        this._scrollLockActive = true;
    },

    _bodyScrollUnlock() {
        if (!this._scrollLockActive) return;
        const scrollY = this._scrollLockScrollY || 0;
        document.body.style.position    = '';
        document.body.style.top         = '';
        document.body.style.left        = '';
        document.body.style.right       = '';
        document.body.style.overflow    = '';
        document.body.style.paddingRight = '';
        window.scrollTo({ top: scrollY, behavior: 'instant' });
        this._scrollLockActive  = false;
        this._scrollLockScrollY = 0;
    },

    // Bouton ♪ Scroll (lance le MP3 depuis le début + défilement) dans le plein écran paroles.
    // Placé DANS #song-content-display (et non dans body comme le bouton Fermer) : en plein
    // écran natif seul le contenu de l'élément est affiché.
    _injectFullscreenScrollBtn() {
        const el = document.getElementById('song-content-display');
        if (!el || document.getElementById('lyrics-fs-scroll')) return;
        const b = document.createElement('button');
        b.id = 'lyrics-fs-scroll';
        b.type = 'button';
        b.className = 'fs-scroll-btn';
        b.title = 'Lancer le MP3 depuis le début et démarrer le scroll';
        b.innerHTML = this.isAutoScrolling ? '⏸ ♪' : '♪ Scroll';
        if (this.isAutoScrolling) b.classList.add('scroll-btn--active');
        b.addEventListener('click', () => this.toggleScrollWithMP3());
        el.appendChild(b);
    },

    _injectFullscreenCloseBtn() {
        this._injectFullscreenScrollBtn();
        if (document.getElementById('lyrics-fs-close')) return;
        const el = document.getElementById('song-content-display');
        if (!el) return;
        const close = document.createElement('button');
        close.id = 'lyrics-fs-close';
        close.textContent = '✕ Fermer';
        close.style.cssText = `
            position:fixed; top:12px; right:16px; z-index:10001;
            background:rgba(0,0,0,0.55); color:#fff;
            border:none; border-radius:20px;
            padding:8px 18px; font-size:15px; cursor:pointer;
            backdrop-filter:blur(4px);
        `;
        close.addEventListener('click', () => {
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            this._exitLyricsCSSFullscreen();
        });
        document.body.appendChild(close);
    },
    // ===== AJUSTEMENT À LA PAGE (plein écran paroles) =====
    // En plein écran (natif ou repli CSS), on cherche la disposition la plus confortable qui tienne SANS défilement :
    // la plus grande taille de texte (100 % → 60 %) en 1 colonne, puis en 2 colonnes (maximum) ; 1 colonne est préférée
    // sauf si 2 colonnes permettent un texte nettement plus grand. Si rien ne tient, on garde 1 colonne à taille normale
    // avec défilement (comportement d'origine). La décision est prise par LyricsFit (js/lyrics-fit.js), le même module
    // que celui utilisé par sync.js pour refaire ce calcul sur chaque écran déporté : leurs dimensions diffèrent de
    // celles de ce poste. La disposition est portée par la classe lyrics-fit-on et la feuille #lyrics-fit-css.
    _isLyricsFullscreenActive() {
        const el = document.getElementById('song-content-display');
        return !!el && (el.classList.contains('lyrics-css-fullscreen')
            || document.fullscreenElement === el || document.webkitFullscreenElement === el);
    },

    // force = true : recalcule même si le contenu et les dimensions n'ont pas changé.
    _fitLyricsFullscreen(force) {
        const el = document.getElementById('song-content-display');
        if (!el || typeof LyricsFit === 'undefined') return;
        if (!this._isLyricsFullscreenActive()) {          // hors plein écran : affichage normal (taille et colonnes d'origine)
            if (el.classList.contains(LyricsFit.CLASS_ON)) LyricsFit.resetMaster(el);
            this._lyricsFitSig = ''; this._lyricsFitKey = ''; this._lyricsFitLayout = null;
            return;
        }
        const sig = LyricsFit.signature(el);
        if (!force && sig === this._lyricsFitSig) return;
        this._lyricsFitSig = sig;
        const lay = LyricsFit.fit(el, LyricsFit.masterApplier(el));
        this._lyricsFitLayout = lay;                       // (consultable pour le diagnostic)
        const key = lay ? lay.cols + '/' + lay.scale + '/' + lay.scroll : '';
        if (key !== this._lyricsFitKey) { this._lyricsFitKey = key; this._renderPostits(); }   // les ancres des post-its ont bougé
    },
    // ===== FIN AJUSTEMENT À LA PAGE =====

    // ===== FIN PLEIN ÉCRAN PAROLES =====

    // ===== PLEIN ÉCRAN ACCORDS =====
    // Case à cocher dans l'en-tête de la frame accords (#song-chords-panel). Cochée :
    //   1. la frame passe en plein écran (overlay CSS fixe, + API native requestFullscreen
    //      en complément quand elle est disponible pour masquer aussi la barre du navigateur) ;
    //   2. son contenu est réagencé : la chanson est découpée en sections (couplet, refrain,
    //      pont, solo… repérées par les marqueurs vvvv/pppp/rrrr/ssss) présentées sous forme de
    //      cartes qui se répartissent en colonnes ;
    //   3. la taille des accords est ajustée automatiquement (_fitChordsFullscreen) pour que
    //      TOUTE la chanson tienne dans la fenêtre sans défilement.
    // Les lignes d'accords sont DÉPLACÉES (pas clonées) dans les cartes : elles gardent leur
    // data-line-index et leurs classes, donc le surlignage de l'accord en cours pendant la
    // lecture MP3 (voir _applyChordHighlight) continue de fonctionner dans cette vue.
    toggleChordsFullscreen(enable) {
        const panel = document.getElementById('song-chords-panel');
        if (!panel) return;
        const isActive = !!this._chordsFsActive;
        if (enable === undefined) enable = !isActive;
        if (enable === isActive) return;
        if (enable) this._enterChordsFullscreen(panel);
        else this._exitChordsFullscreen();
    },

    _enterChordsFullscreen(panel) {
        const display = document.getElementById('display-chords');
        if (!display || !this.currentSong) return;

        this._buildChordsFullscreenLayout(display);
        panel.classList.add('cfs-active');
        this._chordsFsActive = true;
        this._bodyScrollLock();

        const titleEl = document.getElementById('chords-fs-title');
        const mainTitle = document.getElementById('song-title-display');
        if (titleEl && mainTitle) titleEl.textContent = mainTitle.textContent;
        this._setScrollBtnsActive(!!this.isAutoScrolling); // bouton ♪ Scroll de l'en-tête : état courant

        // Plein écran natif en complément (l'overlay CSS couvre déjà la fenêtre : s'il est
        // refusé — iframe, politique du navigateur — on n'a rien de plus à faire).
        const requestFS = panel.requestFullscreen || panel.webkitRequestFullscreen
            || panel.mozRequestFullScreen || panel.msRequestFullscreen;
        this._chordsFsNative = false;
        if (requestFS) {
            try {
                const res = requestFS.call(panel);
                if (res && res.then) {
                    res.then(() => { this._chordsFsNative = true; this._fitChordsFullscreen(); })
                       .catch(() => {});
                } else {
                    this._chordsFsNative = true;
                }
            } catch (_) { /* refusé : overlay CSS seul */ }
        }

        // Ajustement initial (après application des classes) puis à chaque changement de
        // taille de la fenêtre (passage en plein écran natif, rotation de la tablette…).
        this._fitChordsFullscreen();
        requestAnimationFrame(() => this._fitChordsFullscreen());

        let resizeTimer = null;
        this._chordsFsOnResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this._fitChordsFullscreen(), 80);
        };
        this._chordsFsOnKey = (e) => { if (e.key === 'Escape') this._exitChordsFullscreen(); };
        this._chordsFsOnFsChange = () => {
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            if (!fsEl && this._chordsFsNative) this._exitChordsFullscreen();
        };
        window.addEventListener('resize', this._chordsFsOnResize);
        document.addEventListener('keydown', this._chordsFsOnKey);
        document.addEventListener('fullscreenchange', this._chordsFsOnFsChange);
        document.addEventListener('webkitfullscreenchange', this._chordsFsOnFsChange);
    },

    _exitChordsFullscreen() {
        const panel = document.getElementById('song-chords-panel');
        const display = document.getElementById('display-chords');
        const wasActive = !!this._chordsFsActive;
        this._chordsFsActive = false;

        window.removeEventListener('resize', this._chordsFsOnResize);
        document.removeEventListener('keydown', this._chordsFsOnKey);
        document.removeEventListener('fullscreenchange', this._chordsFsOnFsChange);
        document.removeEventListener('webkitfullscreenchange', this._chordsFsOnFsChange);

        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl && fsEl === panel) {
            const exitFS = document.exitFullscreen || document.webkitExitFullscreen;
            if (exitFS) { try { const r = exitFS.call(document); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
        }
        this._chordsFsNative = false;

        if (panel) panel.classList.remove('cfs-active');
        if (display) this._restoreChordsLayout(display);
        if (wasActive) this._bodyScrollUnlock();

        const cb = document.getElementById('chords-fullscreen-toggle');
        if (cb) cb.checked = false;
    },

    // Découpe la frame en sections et les range dans des cartes (cf. commentaire du module).
    _buildChordsFullscreenLayout(display) {
        if (this._cfsOriginalNodes) return; // déjà réagencé
        const nodes = Array.from(display.children);
        this._cfsOriginalNodes = nodes;

        const sections = [];
        let cur = null;
        nodes.forEach(node => {
            if (node.classList.contains('chord-section-badge')) {
                cur = { badge: node, lines: [] };
                sections.push(cur);
                return;
            }
            // Lignes sans accord (paroles seules, tablature, balises <link>…) : sans objet ici
            if (node.classList.contains('empty')) return;
            if (!cur) { cur = { badge: null, lines: [] }; sections.push(cur); }
            cur.lines.push(node);
        });

        const frag = document.createDocumentFragment();
        sections.forEach(sec => {
            if (!sec.lines.length) return; // section sans accord : pas de carte vide
            const card = document.createElement('div');
            card.className = 'cfs-section';
            if (sec.badge) {
                // La carte reprend la teinte de la section (même code couleur que l'étiquette :
                // couplet orange, refrain vert, pont turquoise, solo bleu).
                if (sec.badge.style.borderColor) card.style.borderColor = sec.badge.style.borderColor;
                if (sec.badge.style.background)  card.style.background  = sec.badge.style.background;
                card.appendChild(sec.badge);
            }
            sec.lines.forEach(l => card.appendChild(l));
            frag.appendChild(card);
        });

        display.textContent = '';
        if (!frag.childNodes.length) {
            const msg = document.createElement('div');
            msg.className = 'cfs-empty';
            msg.textContent = 'Aucun accord dans cette chanson.';
            frag.appendChild(msg);
        }
        display.appendChild(frag);
        display.classList.add('cfs-flow');
    },

    // Remet les lignes dans leur ordre d'origine (déplacement inverse, rien n'est recréé).
    _restoreChordsLayout(display) {
        if (!this._cfsOriginalNodes) return;
        display.textContent = '';
        this._cfsOriginalNodes.forEach(n => display.appendChild(n));
        this._cfsOriginalNodes = null;
        display.classList.remove('cfs-flow');
        ['height', 'overflow-x', '--cfs-scale', '--cfs-cardw'].forEach(p => display.style.removeProperty(p));
    },

    // Cherche la plus grande échelle (taille des accords + nombre de colonnes) pour laquelle
    // toutes les cartes tiennent dans la zone disponible, sans défilement : dichotomie sur
    // l'échelle, chaque essai recalculant le nombre de colonnes et la largeur des cartes.
    _fitChordsFullscreen() {
        const panel = document.getElementById('song-chords-panel');
        const display = document.getElementById('display-chords');
        if (!panel || !display || !this._chordsFsActive || !display.classList.contains('cfs-flow')) return;

        const header = panel.querySelector('.chords-panel-header');
        const cs = getComputedStyle(panel);
        const availH = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
            - (header ? header.offsetHeight + parseFloat(getComputedStyle(header).marginBottom || 0) : 0);
        display.style.height = Math.max(120, availH) + 'px';
        display.style.overflowX = 'hidden';

        const W = display.clientWidth;
        const BASE_CARD_W = 290; // largeur d'une carte à l'échelle 1 (px)
        const apply = (scale) => {
            const gap = 12 * scale;
            const cols = Math.max(1, Math.floor((W + gap) / (BASE_CARD_W * scale + gap)));
            const cardW = (W - (cols - 1) * gap) / cols;
            display.style.setProperty('--cfs-scale', scale.toFixed(3));
            display.style.setProperty('--cfs-cardw', cardW.toFixed(1) + 'px');
            return display.scrollWidth <= display.clientWidth + 1
                && display.scrollHeight <= display.clientHeight + 1;
        };

        let lo = 0.4, hi = 2.6, best = lo;
        for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            if (apply(mid)) { best = mid; lo = mid; } else { hi = mid; }
        }
        // Même la plus petite échelle ne suffit pas (chanson très longue) : on la garde et on
        // autorise le défilement horizontal plutôt que de couper du contenu.
        if (!apply(best)) display.style.overflowX = 'auto';
    },
    // ===== FIN PLEIN ÉCRAN ACCORDS =====

    // ===== PLEIN ÉCRAN ÉDITEUR =====
    // Même principe que le plein écran paroles (API native + repli CSS), appliqué
    // au textarea #song-editor.
    toggleEditorFullscreen() {
        const el = document.getElementById('editor-container');
        if (!el) return;

        const btn = document.getElementById('btn-fullscreen-editor');
        const isCSSFullscreen = el.classList.contains('editor-css-fullscreen');
        const isNativeFS = !!document.fullscreenElement;

        // --- Sortie plein écran ---
        if (isNativeFS || isCSSFullscreen) {
            if (isNativeFS && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            this._exitEditorCSSFullscreen();
            return;
        }

        // --- Entrée plein écran : essayer l'API native d'abord ---
        const requestFS = el.requestFullscreen
            || el.webkitRequestFullscreen
            || el.mozRequestFullScreen
            || el.msRequestFullscreen;

        if (requestFS) {
            requestFS.call(el).then(() => {
                this._injectEditorFullscreenCloseBtn();
                if (btn) { btn.textContent = '✕'; btn.title = 'Quitter le plein écran'; btn.style.opacity = '1'; }
                const editorEl = document.getElementById('song-editor');
                if (editorEl) editorEl.focus();
                const onFsChange = () => {
                    if (!document.fullscreenElement) {
                        this._exitEditorCSSFullscreen();
                        document.removeEventListener('fullscreenchange', onFsChange);
                        document.removeEventListener('webkitfullscreenchange', onFsChange);
                    }
                };
                document.addEventListener('fullscreenchange', onFsChange);
                document.addEventListener('webkitfullscreenchange', onFsChange);
            }).catch(() => {
                // API refusée (ex: iframe, politique navigateur) → fallback CSS
                this._enterEditorCSSFullscreen(el, btn);
            });
        } else {
            // Navigateur sans API → fallback CSS direct
            this._enterEditorCSSFullscreen(el, btn);
        }
    },

    _enterEditorCSSFullscreen(el, btn) {
        el.classList.add('editor-css-fullscreen');
        this._injectEditorFullscreenCloseBtn();
        if (btn) { btn.textContent = '✕'; btn.title = 'Quitter le plein écran'; btn.style.opacity = '1'; }
        this._bodyScrollLock();
        const editorEl = document.getElementById('song-editor');
        if (editorEl) editorEl.focus();
    },

    _exitEditorCSSFullscreen() {
        const el = document.getElementById('editor-container');
        if (el) el.classList.remove('editor-css-fullscreen');
        this._bodyScrollUnlock();
        const closeBtn = document.getElementById('editor-fs-close');
        if (closeBtn) closeBtn.remove();
        const btn = document.getElementById('btn-fullscreen-editor');
        if (btn) { btn.textContent = '⛶'; btn.title = 'Plein écran édition'; btn.style.opacity = '0.6'; }
    },

    _injectEditorFullscreenCloseBtn() {
        if (document.getElementById('editor-fs-close')) return;
        const close = document.createElement('button');
        close.id = 'editor-fs-close';
        close.textContent = '✕ Fermer';
        close.style.cssText = `
            position:fixed; top:12px; right:16px; z-index:10001;
            background:rgba(0,0,0,0.55); color:#fff;
            border:none; border-radius:20px;
            padding:8px 18px; font-size:15px; cursor:pointer;
            backdrop-filter:blur(4px);
        `;
        close.addEventListener('click', () => {
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            this._exitEditorCSSFullscreen();
        });
        document.body.appendChild(close);
    },
    // ===== FIN PLEIN ÉCRAN ÉDITEUR =====

    // ===== LECTURE MP3 DEPUIS L'ÉDITEUR (accessible aussi en plein écran) =====
    // Réutilise le même <audio> caché que les contrôles de la sidebar : l'état
    // (piste chargée, position de lecture) reste cohérent quel que soit l'endroit
    // depuis lequel on démarre/arrête la lecture.
    toggleEditorMp3() {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer) return;
        if (!audioPlayer.src || audioPlayer.src === window.location.href) {
            // Rien n'est encore chargé : ouvrir le MP3 de la chanson (piste sélectionnée)
            this.openMP3File();
            return;
        }
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => this.showError('Erreur de lecture : ' + e.message));
        } else {
            audioPlayer.pause();
        }
    },

    stopEditorMp3() {
        const audioPlayer = document.getElementById('hiddenAudioPlayer');
        if (!audioPlayer) return;
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    },
    // ===== FIN LECTURE MP3 ÉDITEUR =====

    // ===== ESTIMATION BPM DEPUIS TIMESTAMPS KARAOKÉ =====
    // Analyse les intervalles entre accords consécutifs pour déduire le tempo.
    // Méthode :
    //   1. Calcule les intervalles Δt entre chaque paire d'accords adjacents
    //   2. Convertit en BPM instantané (60/Δt), filtre les pauses inter-couplets
    //   3. Construit un histogramme sur une grille de BPM musicalement sensés
    //      (multiples de 1 entre 50 et 220, puis fusion des harmoniques ×2/÷2)
    //   4. Retourne le mode de l'histogramme et la plage de confiance
    // Retourne plusieurs candidats BPM triés par plausibilité musicale.
    // Approche : l'intervalle médian entre accords donne un "BPM de base" (souvent
    // 1/2 mesure, 1 mesure, etc.). On teste tous les multiplicateurs entiers jusqu'à
    // ce que le candidat sorte de la plage 55-220 BPM, et on les présente tous.
    estimateBpmCandidates() {
        const ts = this.currentSong && this.currentSong.karaokeTimestamps;
        if (!ts || ts.length < 4) return null;

        // Trier par time (et non par position DOM)
        const sorted = [...ts].sort((a, b) => a.time - b.time);

        // Intervalles consécutifs (ignorer doublons <80ms et pauses >8s)
        const intervals = [];
        for (let i = 1; i < sorted.length; i++) {
            const dt = sorted[i].time - sorted[i - 1].time;
            if (dt >= 0.08 && dt <= 8.0) intervals.push(dt);
        }
        if (intervals.length < 3) return null;

        // Médiane robuste (insensible aux valeurs aberrantes)
        const sorted_iv = [...intervals].sort((a, b) => a - b);
        const mid = Math.floor(sorted_iv.length / 2);
        const medianInterval = sorted_iv.length % 2
            ? sorted_iv[mid]
            : (sorted_iv[mid - 1] + sorted_iv[mid]) / 2;

        const baseBpm = 60 / medianInterval;

        // Générer tous les candidats par multiplication
        const candidates = [];
        for (let mult = 1; mult <= 12; mult++) {
            const raw = baseBpm * mult;
            if (raw < 55 || raw > 220) continue;
            // Snap musical : arrondi à 1 BPM, puis à 2 si très proche
            const snapped = Math.round(raw);
            const snap5   = Math.round(raw / 5) * 5;
            const bpm     = Math.abs(snap5 - raw) <= 1.5 ? snap5 : snapped;
            // Score de plausibilité : pénaliser les gros multiplicateurs,
            // favoriser les zones de tempo les plus courantes (80-160)
            const zonePenalty = (bpm >= 80 && bpm <= 160) ? 0 : 1;
            const score = Math.abs(bpm - raw) + mult * 0.5 + zonePenalty;
            candidates.push({ bpm, mult, raw, score });
        }
        if (!candidates.length) return null;

        candidates.sort((a, b) => a.score - b.score);
        return { candidates, count: intervals.length, medianInterval };
    },

    // Affiche le panneau de suggestion BPM avec tous les candidats
    suggestBpmFromTimestamps() {
        const result = this.estimateBpmCandidates();
        if (!result || !result.candidates.length) {
            this.showError("Pas assez de timestamps pour estimer le BPM (minimum 4 accords minutés).");
            return;
        }

        const tip = document.getElementById('bpm-suggest-tip');
        if (!tip) return;

        const { candidates, count, medianInterval } = result;
        // Afficher jusqu'à 6 candidats
        const shown = candidates.slice(0, 6);

        const btns = shown.map(c => `
            <button onclick="app.applyBpmSuggestion(${c.bpm})"
                title="×${c.mult} (intervalle médian ${medianInterval.toFixed(2)}s)"
                style="background:#4a7fd4;color:#fff;border:none;border-radius:10px;
                       padding:3px 10px;font-size:13px;cursor:pointer;margin:2px;
                       opacity:${c === shown[0] ? '1' : '0.65'};">
                ${c.bpm}
            </button>`).join('');

        tip.style.cssText = `
            display:block; padding:6px 10px;
            background:#f0f4ff; border:1.5px solid #6c8ebf;
            border-radius:10px; font-size:12px;
            box-sizing:border-box; width:100%;
        `;
        tip.innerHTML = `
            <span style="color:#555;font-size:12px;">Tempos possibles (${count} intervalles, médiane ${medianInterval.toFixed(2)}s) :</span><br>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:2px;align-items:center;">
                ${btns}
                <button onclick="app.closeBpmTip()"
                    style="background:none;border:none;cursor:pointer;font-size:14px;color:#aaa;margin-left:6px">✕</button>
            </div>
        `;
    },

    closeBpmTip() {
        const tip = document.getElementById('bpm-suggest-tip');
        if (tip) { tip.style.display = 'none'; tip.innerHTML = ''; }
    },

    // Applique le BPM suggéré dans le champ BPM (éditeur) et met à jour le métronome
    applyBpmSuggestion(bpm) {
        // Mettre à jour dans currentSong (utilisé par le métronome et le scroll)
        if (this.currentSong) this.currentSong.bpm = String(bpm);
        // Mettre à jour le champ éditeur si visible
        const bpmInput = document.getElementById('bpm');
        if (bpmInput) {
            bpmInput.value = bpm;
            bpmInput.dispatchEvent(new Event('change'));
        }
        // Affichage dans le widget durée de la vue lecture
        const speedDisplay = document.getElementById('currentScrollSpeed');
        if (speedDisplay) speedDisplay.textContent = bpm + ' bpm';
        // Mettre à jour le métronome si ouvert
        this.metronome.bpm = bpm;
        const slider = document.getElementById('metro-bpm-slider');
        if (slider) { slider.value = bpm; slider.dispatchEvent(new Event('input')); }
        this.closeBpmTip();
    },
    // ===== FIN ESTIMATION BPM =====

    // =============================================
    //   DIAGRAMME RYTHMIQUE
    //   b=bas (downstroke), h=haut (upstroke), g=ghost (muté)
    //   virgule = croche, / = mesure
    // =============================================
    _parseRythm(str) {
        if (!str || !str.trim()) return [];
        return str.split('/').map((mStr, mIdx) => {
            // Tokeniser en respectant les codes à 2 lettres (gh, gb) avant b, h, g seuls
            const tokens = [];
            const raw = mStr.split(',');
            raw.forEach(s => {
                const t = s.trim().toLowerCase();
                if (t) tokens.push(t); // 'b', 'h', 'g', 'gh', 'gb'
            });
            return tokens.map((type, i) => ({
                type,                               // 'b','h','g','gh','gb'
                beat: Math.floor(i / 2) + 1,
                subbeat: i % 2 === 0 ? '1' : '+',
                measureIdx: mIdx,
                strokeIdx: i,
            }));
        });
    },

    _rythmArrowSVG(type) {
        // isDown : b, gb (ghost bas), g (ghost sans direction = bas par défaut)
        const isDown  = type === 'b' || type === 'gb' || type === 'g';
        const isGhost = type === 'g' || type === 'gh' || type === 'gb';
        const color   = isGhost ? 'rgba(255,255,255,0.22)' : '#e8e8e8';
        const w = 22, h = 38;
        if (isDown) {
            return `<svg width="${w}" height="${h}" viewBox="0 0 22 38" xmlns="http://www.w3.org/2000/svg">
                <line x1="11" y1="2" x2="11" y2="26" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
                <polygon points="11,36 3,20 19,20" fill="${color}"/>
            </svg>`;
        } else {
            return `<svg width="${w}" height="${h}" viewBox="0 0 22 38" xmlns="http://www.w3.org/2000/svg">
                <line x1="11" y1="36" x2="11" y2="12" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
                <polygon points="11,2 3,18 19,18" fill="${color}"/>
            </svg>`;
        }
    },

    _buildRythmDiagram(str, timeSig) {
        const measures = this._parseRythm(str);
        if (!measures.length || !measures[0].length) return '';
        let html = '<div class="rythm-diagram">';
        measures.forEach((strokes, mIdx) => {
            if (mIdx > 0) html += '<div class="rythm-bar-sep"></div>';
            const byBeat = {};
            strokes.forEach(s => {
                if (!byBeat[s.beat]) byBeat[s.beat] = [];
                byBeat[s.beat].push(s);
            });
            Object.keys(byBeat).map(Number).sort((a,b)=>a-b).forEach(beat => {
                const beatStrokes = byBeat[beat];
                html += '<div class="rythm-beat"><div style="display:flex;gap:2px;">';
                beatStrokes.forEach(s => {
                    const title = s.type==='b'  ? '↓ bas'          :
                                   s.type==='h'  ? '↑ haut'         :
                                   s.type==='gb' ? '↓ ghost bas'    :
                                   s.type==='gh' ? '↑ ghost haut'   : '↓ ghost (muté)';
                    html += `<div class="rythm-stroke" title="${title}">${this._rythmArrowSVG(s.type)}</div>`;
                });
                html += `</div><div class="rythm-beat-label">${beat}&nbsp;${beatStrokes.length > 1 ? '+' : ''}</div></div>`;
            });
        });
        html += '</div>';
        return html;
    },

    _updateRythmPreview(value) {
        const preview = document.getElementById('rythm-preview-editor');
        if (!preview) return;
        const timeSig = document.getElementById('time-sig')?.value || '4/4';
        preview.innerHTML = value.trim() ? this._buildRythmDiagram(value, timeSig) : '';
    },

    _renderRythmDisplay() {
        const el = document.getElementById('rythm-display');
        if (!el) return;
        const rythm = this.currentSong && this.currentSong.rythm;
        if (!rythm) { el.innerHTML = ''; return; }
        el.innerHTML = this._buildRythmDiagram(rythm, this.currentSong.timeSig || '4/4');
    },

    // Afficher une erreur
    showError(message) {
        alert(`Erreur : ${message}`);
    }
};

// Initialiser l'application — exposée globalement pour que auth-gate.js
// puisse déclencher App.init() lui-même, une fois la connexion vérifiée
// (voir js/auth-gate.js). Si auth-gate.js n'est pas chargé pour une raison
// quelconque, on garde l'ancien comportement en secours (démarrage direct).
window.App = App;
document.addEventListener('DOMContentLoaded', () => {
    if (window.AccordsAuth) {
        window.AccordsAuth.onReady(() => App.init());
    } else {
        App.init();
    }
});