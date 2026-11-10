// js/lyrics-fit.js — ajustement à la page du texte en plein écran (paroles)
// -----------------------------------------------------------------------------
// Chargé sur TOUS les appareils (maître et écrans déportés), avant sync.js.
//
// En plein écran, le texte (#song-content-display) est présenté de la façon la plus
// confortable qui TIENNE SANS DÉFILEMENT : on cherche la plus grande taille de texte
// (de 100 % jusqu'à MIN_SCALE) qui tient en 1 colonne, puis en 2, 3 ou 4 colonnes (MAX_COLS) ;
// on garde le moins de colonnes possible, sauf si une colonne de plus permet un texte nettement plus grand.
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
//   LyricsFit.fitChords(...)      même principe pour le plein écran de la frame Accords (cartes par section)
//   LyricsFit.makeChordsApplier() fabrique la fonction apply de fitChords (feuille de style)
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
    // Nombre maximal de colonnes. Une chanson longue aux lignes courtes ne tient souvent qu'avec 3 ou 4 colonnes sur un
    // écran large (la hauteur dépend du NOMBRE de lignes, pas de leur longueur). Mettre 2 pour revenir à « 2 colonnes max ».
    const MAX_COLS = 4;
    // Une colonne de plus n'est retenue que si elle permet un texte au moins 12 points plus grand : à taille égale ou
    // presque, moins de colonnes est plus simple à lire (lignes entières, accords alignés).
    const COL_ADVANTAGE = 0.12;

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
        const cols = lay.cols >= 2 ? COLS.replace(/column-count:2/g, 'column-count:' + lay.cols).replace(/-webkit-column-count:2/g, '-webkit-column-count:' + lay.cols) : '';
        let out = sel + '{--lf:' + lay.scale + ' !important;' + FIT_PADDING + cols + '}';
        if (lay.cols >= 2) {
            out += sel + '>*{' + KEEP + '}' +
                sel + '>.lyrics-section{' + SPLIT_OK + '}' +
                sel + '>.lyrics-section>*{' + KEEP + '}' +
                // le titre d'une section reste avec la ligne qui le suit (jamais seul en bas d'une colonne)
                sel + '>.lyrics-section>:first-child{break-after:avoid !important;-webkit-column-break-after:avoid !important;}';
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
            let text = (lay.cols === 1 && lay.scale === 1) ? '' : css(sel, lay);
            // Pendant la MESURE, les vignettes de post-its sont masquées : ce sont des éléments positionnés en absolu, à une
            // position calculée pour l'ancienne mise en page ; une vignette placée loin dans la chanson gonflerait la hauteur
            // mesurée et ferait échouer tous les essais (les chansons avec post-its restaient alors toujours en 1 colonne).
            if (lay.probe) text += sel + ' .postit-marker{display:none !important}';
            if (styleEl.textContent !== text) styleEl.textContent = text;
            if (cls) el.classList.toggle(cls, text !== '');
        };
    }

    function fit(el, apply) {
        if (!el || !el.clientHeight || !el.clientWidth) return null;     // pas affiché : rien à mesurer
        const tryLayout = (cols, scale) => {
            apply({ cols, scale, probe: true });
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
            let chosen = null;                                            // { cols, scale } : disposition retenue jusqu'ici
            for (let c = 1; c <= MAX_COLS; c++) {
                if (chosen && chosen.scale >= 0.95) break;                // déjà quasi à taille normale : plus de colonnes n'apporterait rien
                const i = best(c);
                if (i < 0) continue;                                      // ne tient pas avec c colonnes, même à la taille minimale
                const sc = SCALES[i];
                if (!chosen || sc >= chosen.scale + COL_ADVANTAGE - 1e-9) chosen = { cols: c, scale: sc };
            }
            lay = chosen ? { cols: chosen.cols, scale: chosen.scale, scroll: false } : { cols: 1, scale: 1, scroll: true };  // sinon défilement, comme avant
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

    // ---------------------------------------------------------------------------------------------
    // Plein écran de la frame ACCORDS (cartes par section, voir app.js : toggleChordsFullscreen).
    // Même calcul que celui du maître, mais utilisable par chaque écran : le maître le faisait avec SES dimensions
    // et les écrans déportés en recopiaient les valeurs en pixels (cartes coupées sur un écran plus petit).
    // Dichotomie sur l'échelle (taille des accords) ; chaque essai recalcule le nombre de colonnes de cartes et leur largeur.
    // set(état) applique : { height, overflowX } au départ, { scale, cardW } à chaque essai, { overflowX: 'auto' } en dernier recours.
    function fitChords(panel, display, set) {
        const header = panel.querySelector('.chords-panel-header');
        const cs = getComputedStyle(panel);
        const availH = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
            - (header ? header.offsetHeight + parseFloat(getComputedStyle(header).marginBottom || 0) : 0);
        set({ height: Math.max(120, availH), overflowX: 'hidden' });

        const W = display.clientWidth;
        const BASE_CARD_W = 290;                                          // largeur d'une carte à l'échelle 1 (px)
        const probe = scale => {
            const gap = 12 * scale;
            const cols = Math.max(1, Math.floor((W + gap) / (BASE_CARD_W * scale + gap)));
            set({ scale, cardW: (W - (cols - 1) * gap) / cols });
            return display.scrollWidth <= display.clientWidth + 1 && display.scrollHeight <= display.clientHeight + 1;
        };
        let lo = 0.4, hi = 2.6, best = lo;
        for (let i = 0; i < 14; i++) {
            const mid = (lo + hi) / 2;
            if (probe(mid)) { best = mid; lo = mid; } else { hi = mid; }
        }
        // Même la plus petite échelle ne suffit pas (chanson très longue) : on la garde et on autorise le défilement
        // horizontal plutôt que de couper du contenu.
        if (!probe(best)) set({ overflowX: 'auto' });
        return best;
    }

    function chordsSignature(panel, display) {
        return display.textContent.length + ':' + display.childElementCount + ':' + panel.clientWidth + 'x' + panel.clientHeight;
    }

    // apply pour fitChords, écrite dans une feuille de style (les valeurs recopiées du maître sont ainsi surchargées)
    function makeChordsApplier(styleEl, sel) {
        const st = { height: null, overflowX: 'hidden', scale: null, cardW: null };
        return function (s) {
            Object.assign(st, s);
            styleEl.textContent = sel + '{' + (st.height != null ? 'height:' + st.height + 'px !important;' : '') +
                'overflow-x:' + st.overflowX + ' !important;' +
                (st.scale != null ? '--cfs-scale:' + st.scale.toFixed(3) + ' !important;--cfs-cardw:' + st.cardW.toFixed(1) + 'px !important;' : '') + '}';
        };
    }

    // ---------------------------------------------------------------------------------------------
    // Post-its : position de la vignette d'une ancre. Une vignette est en position absolue ; en plusieurs colonnes elle se
    // place au bord droit de la colonne qui contient son ancre (et non au bord droit de l'écran, loin de sa ligne).
    // Utilisé par le maître (app.js : _renderPostits) et par les écrans déportés (postitRules).
    // clamp = true quand le texte est ajusté à la page (pas de défilement) : une vignette (104 px de haut) dont l'ancre est
    // tout en bas d'une colonne est remontée pour rester dans la zone visible, au lieu de déborder et de faire défiler la page.
    function postitPos(container, anchor, markerW, clamp) {
        let top = anchor.offsetTop;
        if (clamp) top = Math.max(0, Math.min(top, container.clientHeight - 104 - 2));
        const cs = getComputedStyle(container);
        const n = parseInt(cs.columnCount, 10) || 1;                      // 'auto' (une seule colonne) -> 1
        if (n < 2) return { top, left: null };
        const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
        const gap = parseFloat(cs.columnGap) || 0;
        const colW = (container.clientWidth - pl - pr - gap * (n - 1)) / n;
        const idx = Math.max(0, Math.min(n - 1, Math.floor((anchor.offsetLeft - pl) / (colW + gap))));
        return { top, left: Math.round(pl + idx * (colW + gap) + colW - markerW - 6) };
    }

    // Règles CSS qui placent les vignettes recopiées du maître (positions calculées pour SON écran) selon la mise en page
    // de CET écran. Elles surchargent les valeurs en ligne (!important) sans toucher au DOM recopié.
    function postitRules(container, sel, clamp) {
        const anchors = {};
        container.querySelectorAll('.postit-anchor').forEach(a => { anchors[a.dataset.postitId] = a; });
        let out = '';
        container.querySelectorAll('.postit-marker').forEach(m => {
            const a = anchors[m.title];
            if (!a) return;
            const p = postitPos(container, a, m.offsetWidth || 104, clamp);
            out += sel + ' .postit-marker[title="' + m.title.replace(/["\\]/g, '\\$&') + '"]{top:' + p.top + 'px !important;' +
                (p.left !== null ? 'left:' + p.left + 'px !important;right:auto !important;' : 'left:auto !important;right:6px !important;') + '}';
        });
        return out;
    }

    window.LyricsFit = { css, signature, fit, makeApplier, label, fitChords, chordsSignature, makeChordsApplier, postitPos, postitRules,
        SCALES, MIN_SCALE, MAX_COLS, COL_ADVANTAGE, CLASS_ON: 'lyrics-fit-on' };

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
