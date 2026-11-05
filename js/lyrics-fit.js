// js/lyrics-fit.js — ajustement à la page du texte en plein écran (paroles)
// -----------------------------------------------------------------------------
// Chargé sur TOUS les appareils (maître et écrans déportés), avant sync.js.
//
// En plein écran, le texte (#song-content-display) est présenté de la façon la plus
// confortable qui TIENNE SANS DÉFILEMENT : on cherche la plus grande taille de texte
// (de 100 % jusqu'à MIN_SCALE) qui tient en 1 colonne, puis en 2 colonnes (maximum) ;
// on garde 1 colonne sauf si 2 colonnes permettent un texte nettement plus grand.
// Si rien ne tient, même à la taille minimale : 1 colonne à taille normale avec défilement
// vertical, comme avant.
//
// La décision dépend des dimensions de l'écran qui affiche : le maître la prend avec la
// sienne (app.js : _fitLyricsFullscreen), chaque écran déporté la reprend avec la sienne
// (sync.js, qui n'exécute pas app.js). Les deux utilisent ce même module : une seule
// définition de la mise en page et une seule règle de décision.
//
// La taille du texte passe par une variable CSS (--lf, 1 = taille normale) lue par style.css
// pour TOUS les éléments du texte (lignes, accords, titres de sections) : ils restent
// proportionnés entre eux.
//
//   LyricsFit.fit(el, apply)      mesure et applique ; renvoie { cols, scale, scroll } (null si rien à mesurer)
//   LyricsFit.css(sel, layout)    règles CSS de la disposition pour le sélecteur sel
//   LyricsFit.makeApplier(...)    fabrique la fonction apply (feuille de style + classe facultative)
//   LyricsFit.signature(el)       empreinte (contenu + dimensions) : inutile de recalculer si inchangée
//   LyricsFit.label(layout)       libellé lisible (diagnostic)
// -----------------------------------------------------------------------------
(function () {
    'use strict';

    // Niveaux de taille essayés, du plus grand au plus petit (taille relative du texte).
    const MIN_SCALE = 0.6;                      // en dessous, le texte devient trop petit pour être lu à distance
    const STEP = 0.05;
    const SCALES = [];
    for (let s = 1; s >= MIN_SCALE - 1e-9; s -= STEP) SCALES.push(Math.round(s * 100) / 100);
    // 2 colonnes ne sont retenues que si elles permettent un texte au moins 12 points plus grand que 1 colonne :
    // à taille égale ou presque, 1 colonne est plus simple à lire (lignes entières, accords alignés).
    const TWO_COL_ADVANTAGE = 0.12;

    // column-fill: balance : les deux colonnes sont équilibrées. Les lignes (accords + paroles) ne sont jamais coupées
    // entre deux colonnes ; un cadre de section, lui, peut se poursuivre dans la colonne suivante (chaque morceau garde
    // son cadre complet : box-decoration-break: clone). Préfixes -webkit- pour Safari (iPad).
    const COLS = 'column-count:2 !important;-webkit-column-count:2 !important;' +
        'column-gap:4vw !important;-webkit-column-gap:4vw !important;column-fill:balance !important;';
    const KEEP = 'break-inside:avoid !important;-webkit-column-break-inside:avoid !important;page-break-inside:avoid !important;';
    const SPLIT_OK = 'break-inside:auto !important;-webkit-column-break-inside:auto !important;page-break-inside:auto !important;' +
        'box-decoration-break:clone !important;-webkit-box-decoration-break:clone !important;';

    // Sans défilement, les marges du plein écran sont inutiles : on garde en haut la place des boutons flottants
    // (« ♪ Scroll », « Fermer ») pour qu'ils ne recouvrent pas le texte, et on récupère le reste de l'écran.
    const FIT_PADDING = 'padding:52px 3vw 14px !important;';

    function css(sel, lay) {
        let out = sel + '{--lf:' + lay.scale + ' !important;' + FIT_PADDING + (lay.cols === 2 ? COLS : '') + '}';
        if (lay.cols === 2) {
            out += sel + '>*{' + KEEP + '}' +
                sel + '>.lyrics-section{' + SPLIT_OK + '}' +
                sel + '>.lyrics-section>*{' + KEEP + '}';
        }
        return out;
    }

    // Change quand le texte change (chanson, transposition, accords affichés/masqués) ou que la zone
    // change de taille (rotation, redimensionnement). Le surlignage (classes) ne la modifie pas.
    function signature(el) {
        return el.textContent.length + ':' + el.childElementCount + ':' + el.clientWidth + 'x' + el.clientHeight;
    }

    // Fabrique la fonction « apply » de fit() : écrit la disposition dans une feuille de style (styleEl)
    // pour le sélecteur sel ; si cls est fourni, l'élément porte aussi cette classe tant qu'une disposition
    // particulière est active (sel doit alors la contenir).
    function makeApplier(el, styleEl, sel, cls) {
        return function (lay) {
            const text = (lay.cols === 1 && lay.scale === 1) ? '' : css(sel, lay);
            if (styleEl.textContent !== text) styleEl.textContent = text;
            if (cls) el.classList.toggle(cls, text !== '');
        };
    }

    function fit(el, apply) {
        if (!el || !el.clientHeight || !el.clientWidth) return null;     // pas affiché : rien à mesurer
        const tryLayout = (cols, scale) => {
            apply({ cols, scale });
            if (el.scrollHeight > el.clientHeight + 1) return false;      // déborde vers le bas
            // Deux colonnes de hauteur imposée : si le texte ne tient pas, le navigateur ajoute des colonnes
            // débordantes vers la DROITE (scrollWidth augmente) au lieu d'allonger la page vers le bas.
            return cols === 1 || el.scrollWidth <= el.clientWidth + 1;
        };
        // Indice du plus grand niveau qui tient (le texte rétrécit avec la taille : recherche dichotomique), ou -1.
        const best = cols => {
            let lo = 0, hi = SCALES.length - 1;
            if (!tryLayout(cols, SCALES[hi])) return -1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (tryLayout(cols, SCALES[mid])) hi = mid; else lo = mid + 1;
            }
            return lo;
        };
        let lay;
        if (tryLayout(1, 1)) {
            lay = { cols: 1, scale: 1, scroll: false };                   // tient tel quel : cas courant des chansons courtes
        } else {
            const i1 = best(1), i2 = best(2);
            const s1 = i1 >= 0 ? SCALES[i1] : 0, s2 = i2 >= 0 ? SCALES[i2] : 0;
            if (i1 < 0 && i2 < 0) lay = { cols: 1, scale: 1, scroll: true };          // ne tient pas : défilement, comme avant
            else if (i2 >= 0 && s2 >= s1 + TWO_COL_ADVANTAGE - 1e-9) lay = { cols: 2, scale: s2, scroll: false };
            else if (i1 >= 0) lay = { cols: 1, scale: s1, scroll: false };
            else lay = { cols: 2, scale: s2, scroll: false };
        }
        apply(lay);
        return lay;
    }

    // Libellé lisible d'une disposition (diagnostic)
    function label(lay) {
        if (!lay) return '';
        if (lay.scroll) return 'défilement';
        return lay.cols + ' colonne' + (lay.cols > 1 ? 's' : '') + (lay.scale < 1 ? ', texte à ' + Math.round(lay.scale * 100) + ' %' : '');
    }

    window.LyricsFit = { css, signature, fit, makeApplier, label, SCALES, MIN_SCALE, TWO_COL_ADVANTAGE, CLASS_ON: 'lyrics-fit-on' };

    // Poste maître : la disposition est portée par une classe sur l'élément + une feuille de style (voir app.js). La
    // feuille est créée ici, avant sync.js, pour ne pas être envoyée aux écrans déportés comme style « dynamique ».
    const style = document.createElement('style');
    style.id = 'lyrics-fit-css';
    (document.head || document.documentElement).appendChild(style);
    window.LyricsFit.masterApplier = function (el) {
        return makeApplier(el, style, '#song-content-display.' + window.LyricsFit.CLASS_ON, window.LyricsFit.CLASS_ON);
    };
    window.LyricsFit.resetMaster = function (el) {
        style.textContent = '';
        if (el) el.classList.remove(window.LyricsFit.CLASS_ON);
    };
})();
