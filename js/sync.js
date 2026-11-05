// js/sync.js — Mise en miroir de l'écran du PC maître sur les autres appareils
// -----------------------------------------------------------------------------
// Rôle injecté par servAcc.js dans window.SYNC_ROLE :
//   'master' : l'appareil qui tourne sur le PC serveur. L'appli fonctionne
//              normalement ; ce script envoie un instantané de la page (DOM,
//              styles, défilement, champs de formulaire) à chaque changement.
//   'viewer' : tous les autres appareils. Ils ne chargent PAS app.js (pas de
//              connexion requise) : ils reçoivent l'instantané et mettent leur
//              page à jour avec un diff DOM (pas de clignotement, les animations
//              CSS et les vidéos ne redémarrent pas à chaque mise à jour).
// Si window.SYNC_ROLE est absent (ex. Live Server), ce script ne fait rien.
//
// Optimisations de latence / charge (v2) :
//  - le maître ne calcule ni n'envoie RIEN tant qu'aucun appareil ne regarde, et
//    envoie un instantané frais dès qu'un appareil arrive ;
//  - un simple défilement part dans un message minuscule ('view') au lieu de
//    renvoyer toute la page ; le viewer ne reconstruit pas le DOM si le contenu
//    n'a pas changé ;
//  - plus de re-clonage de la page toutes les secondes : un test léger des champs
//    de formulaire (toutes les 400 ms) remplace le filet de sécurité d'avant ;
//  - la cadence des instantanés complets s'adapte au coût réel de la page ;
//  - le viewer ré-applique la position de défilement quand la mise en page
//    change (images, polices, redimensionnement) ;
//  - reconnexion plus rapide (plafond 2 s, immédiate au retour sur l'onglet).
// -----------------------------------------------------------------------------
(function () {
    'use strict';

    const ROLE = window.SYNC_ROLE;
    if (ROLE !== 'master' && ROLE !== 'viewer') return;

    const WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/sync';
    const MIN_INTERVAL_MS = 80;     // cadence max des instantanés complets (s'allonge si la page est lourde)
    const MAX_INTERVAL_MS = 400;    // ... sans jamais dépasser ceci
    const VIEW_INTERVAL_MS = 30;    // cadence max des messages "défilement seul" (très légers)
    const RESEND_CHECK_MS = 400;    // filet de sécurité : champs modifiés par script, canvas… (test léger)
    const RETRY_MAX_MS = 2000;      // plafond du délai de reconnexion
    // Diagnostic : ouvrir la page avec ?syncdebug=1 affiche les temps de calcul dans la pastille
    const PRUNE_MIN_DESC = 40;      // un bloc caché n'est élagué que s'il contient au moins ce nombre d'éléments
    const PRUNE_MAX_DEPTH = 5;      // profondeur maximale de recherche des blocs cachés
    // Plein écran NATIF (requestFullscreen) : c'est un état du navigateur, absent du DOM, donc invisible pour les
    // autres écrans. Le maître ajoute alors, dans l'instantané seulement (sa propre page n'est pas touchée), la classe
    // de repli CSS que l'appli utilise déjà pour imiter le plein écran (voir style.css : .lyrics-css-fullscreen...).
    const FS_CLASS = { 'song-content-display': 'lyrics-css-fullscreen', 'editor-container': 'editor-css-fullscreen' };
    const DEBUG = /[?&]syncdebug(=1|&|$)/.test(location.search);

    // ---------------------------------------------------------------
    // Pastille d'état (Shadow DOM : n'interfère ni avec la page ni avec le CSS)
    // ---------------------------------------------------------------
    const badge = (function () {
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
        const root = host.attachShadow({ mode: 'closed' });
        root.innerHTML =
            '<style>' +
            '.b{position:fixed;right:8px;bottom:8px;font:12px/1.3 system-ui,sans-serif;background:rgba(0,0,0,.7);' +
            'color:#fff;padding:4px 10px;border-radius:12px;white-space:nowrap}' +
            '.b.center{right:auto;bottom:auto;left:50%;top:50%;transform:translate(-50%,-50%);font-size:20px;padding:14px 24px;border-radius:14px}' +
            '.b.hide{display:none}' +
            '</style><div class="b hide"></div>';
        const el = root.querySelector('.b');
        document.documentElement.appendChild(host);
        let hideTimer = null;
        return {
            set(text, mode, autoHideMs) {
                clearTimeout(hideTimer);
                el.textContent = text;
                el.className = 'b ' + (mode || 'corner');
                if (autoHideMs) hideTimer = setTimeout(() => { el.className = 'b hide'; }, autoHideMs);
            },
        };
    })();

    // ===============================================================
    //  MAÎTRE
    // ===============================================================
    function startMaster() {
        // <style>/<link> déjà présents au chargement : seuls ceux ajoutés ensuite par l'appli sont envoyés
        const initialHeadNodes = new Set(document.head.querySelectorAll('style, link[rel="stylesheet"]'));
        const touched = new Set();              // éléments défilés par l'utilisateur
        const inertDoc = document.implementation.createHTMLDocument(''); // clone sans chargement de ressources
        let ws = null, lastSent = '', lastView = '', timer = null, lastRun = 0, retry = 500, retryTimer = null, viewers = 0;
        let domDirty = true;     // le DOM (ou un champ) a changé : instantané complet nécessaire
        let viewDirty = false;   // seul le défilement a changé : message léger suffisant
        let forceFull = false;   // un appareil vient d'arriver : instantané complet même s'il est identique au précédent
        let fullInterval = MIN_INTERVAL_MS;   // s'adapte au temps de construction d'un instantané
        let lastFp = '', tick = 0, lastCost = 0, lastSize = 0;

        const attrMap = el => {
            const m = {};
            for (const a of el.attributes) m[a.name] = a.value;
            return m;
        };
        const ratio = (pos, max) => (max > 0 ? pos / max : 0);

        // Blocs CACHÉS (display:none) volumineux : onglets inactifs, fenêtres modales... Le viewer les
        // afficherait cachés lui aussi, inutile de lui en envoyer le contenu (ni de le calculer, le
        // transmettre, l'analyser). Dès qu'un bloc est affiché, l'attribut style/class change, donc un
        // nouvel instantané le contient. L'élément lui-même et ses attributs restent envoyés.
        function findPruned() {
            const out = new Set();
            const walk = (el, depth) => {
                for (const c of el.children) {
                    if (c.tagName === 'SCRIPT' || !c.firstElementChild) continue;
                    if (getComputedStyle(c).display === 'none') {
                        if (c.getElementsByTagName('*').length >= PRUNE_MIN_DESC) out.add(c);
                        continue;                       // caché : inutile de descendre
                    }
                    if (depth < PRUNE_MAX_DEPTH) walk(c, depth + 1);
                }
            };
            walk(document.body, 1);
            return out;
        }

        let lastPruned = new Set(), prunedChars = 0;   // blocs élagués dans le DERNIER instantané (buildView doit s'y conformer)

        function buildSnapshot() {
            const body = document.body;
            const pruned = findPruned();
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement || null;
            const live = body.querySelectorAll('*');
            const clone = inertDoc.importNode(body, true);
            const copy = clone.querySelectorAll('*');

            const toRemove = [], toReplace = [], toEmpty = [], els = [];
            let idx = 0; // index hors <script> (identique côté viewer, où il n'y a aucun script)
            let skip = 0; // descendants d'un bloc élagué : absents côté viewer, on les saute

            for (let i = 0; i < live.length; i++) {
                if (skip > 0) { skip--; continue; }
                const a = live[i], b = copy[i];
                const tag = a.tagName;
                if (tag === 'SCRIPT') { toRemove.push(b); continue; }

                if (touched.has(a)) {
                    els.push([idx,
                        ratio(a.scrollLeft, a.scrollWidth - a.clientWidth),
                        ratio(a.scrollTop, a.scrollHeight - a.clientHeight)]);
                }
                idx++;

                // Ajustement à la page (1 ou 2 colonnes) : chaque écran le recalcule avec ses propres dimensions
                // (voir viewerFit) ; la classe du maître n'est donc pas envoyée.
                if (a.id === 'song-content-display') { b.classList.remove('lyrics-fit-on'); b.classList.remove('lyrics-fit-2col'); }

                if (fsEl && a === fsEl) {          // plein écran natif : reproduit côté écrans déportés
                    const cls = FS_CLASS[a.id];
                    if (cls) b.classList.add(cls); else b.setAttribute('data-sync-fs', '');
                }

                if (tag === 'INPUT') {
                    const type = (a.type || '').toLowerCase();
                    if (type === 'password' || type === 'file') b.removeAttribute('value'); // jamais diffusés
                    else if (type === 'checkbox' || type === 'radio') {
                        if (a.checked) b.setAttribute('checked', ''); else b.removeAttribute('checked');
                    } else b.setAttribute('value', a.value);
                } else if (tag === 'TEXTAREA') {
                    b.textContent = a.value;
                } else if (tag === 'OPTION') {
                    if (a.selected) b.setAttribute('selected', ''); else b.removeAttribute('selected');
                }
                if (pruned.has(a)) { skip = a.getElementsByTagName('*').length; toEmpty.push(b); continue; }
                if (tag === 'CANVAS') {
                    try {
                        const img = inertDoc.createElement('img');
                        for (const at of a.attributes) img.setAttribute(at.name, at.value);
                        img.setAttribute('src', a.toDataURL());
                        img.setAttribute('data-was-canvas', '');
                        toReplace.push([b, img]);
                    } catch (_) { /* canvas "tainted" : ignoré */ }
                }
            }
            toReplace.forEach(([b, img]) => b.replaceWith(img));
            toRemove.forEach(b => b.remove());
            if (DEBUG) { prunedChars = 0; toEmpty.forEach(b => { prunedChars += b.innerHTML.length; }); }
            toEmpty.forEach(b => { while (b.firstChild) b.removeChild(b.firstChild); });   // blocs cachés : contenu non envoyé
            lastPruned = pruned;
            touched.forEach(el => { if (!body.contains(el)) touched.delete(el); });

            const styles = [], links = [];
            document.head.querySelectorAll('style').forEach(s => { if (!initialHeadNodes.has(s)) styles.push(s.textContent); });
            document.head.querySelectorAll('link[rel="stylesheet"]').forEach(l => { if (!initialHeadNodes.has(l)) links.push(l.href); });

            const se = document.scrollingElement || document.documentElement;
            return {
                t: 'snap',
                title: document.title,
                html: attrMap(document.documentElement),
                bodyAttrs: attrMap(body),
                body: clone.innerHTML,
                styles, links,
                win: [ratio(se.scrollLeft, se.scrollWidth - se.clientWidth),
                      ratio(se.scrollTop, se.scrollHeight - se.clientHeight)],
                els,
            };
        }

        // Défilement seul : même indexation que buildSnapshot, mais sans cloner la page
        function buildView() {
            const body = document.body;
            const live = body.querySelectorAll('*');
            const els = [];
            let idx = 0, skip = 0;
            for (let i = 0; i < live.length; i++) {
                if (skip > 0) { skip--; continue; }
                const a = live[i];
                if (a.tagName === 'SCRIPT') continue;
                if (touched.has(a)) {
                    els.push([idx,
                        ratio(a.scrollLeft, a.scrollWidth - a.clientWidth),
                        ratio(a.scrollTop, a.scrollHeight - a.clientHeight)]);
                }
                idx++;
                if (lastPruned.has(a)) skip = a.getElementsByTagName('*').length;
            }
            touched.forEach(el => { if (!body.contains(el)) touched.delete(el); });
            const se = document.scrollingElement || document.documentElement;
            return {
                t: 'view',
                win: [ratio(se.scrollLeft, se.scrollWidth - se.clientWidth),
                      ratio(se.scrollTop, se.scrollHeight - se.clientHeight)],
                els,
            };
        }

        function flush() {
            if (!ws || ws.readyState !== 1) return;
            if (ws.bufferedAmount > 2 * 1024 * 1024) { setTimeout(schedule, 250); return; } // appareil/réseau lent : on réessaie
            if (!viewers && !forceFull) return;      // personne ne regarde : on ne calcule rien (état conservé)

            if (domDirty || forceFull) {
                const forced = forceFull;
                domDirty = false; viewDirty = false; forceFull = false;
                const t0 = performance.now();
                let msg;
                try { msg = JSON.stringify(buildSnapshot()); }
                catch (err) { console.warn('[sync] instantané impossible :', err); domDirty = true; return; }
                // cadence adaptative : la synchro ne mobilise jamais plus d'~1/4 du temps de la page
                const cost = performance.now() - t0;
                fullInterval = Math.round(Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, (fullInterval + cost * 3) / 2)));
                if (DEBUG) { lastCost = Math.round(cost); lastSize = msg.length; updateBadge(); }
                if (forced || msg !== lastSent) { lastSent = msg; lastView = ''; ws.send(msg); }
            } else if (viewDirty) {
                viewDirty = false;
                const msg = JSON.stringify(buildView());
                if (msg !== lastView) { lastView = msg; ws.send(msg); }
            }
        }

        function schedule() {
            if (timer) return;
            const gap = domDirty || forceFull ? fullInterval : VIEW_INTERVAL_MS;
            timer = setTimeout(() => { timer = null; lastRun = Date.now(); flush(); },
                Math.max(0, gap - (Date.now() - lastRun)));
        }
        const markDom = () => { domDirty = true; if (viewers) schedule(); };
        const markView = () => { viewDirty = true; if (viewers) schedule(); };

        function updateBadge() {
            if (ws && ws.readyState === 1) badge.set('● Maître — ' + viewers + ' appareil' + (viewers > 1 ? 's' : '') +
                (DEBUG ? ' · instantané ' + lastCost + ' ms, ' + Math.round(lastSize / 1024) + ' Ko (élagué ' + Math.round(prunedChars / 1024) + ' Ko)' : ''), 'corner');
            else badge.set('⚠ Synchro hors ligne', 'corner');
        }

        function connect() {
            if (ws && ws.readyState <= 1) return;
            clearTimeout(retryTimer);
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { retry = 500; lastSent = ''; lastView = ''; domDirty = true; updateBadge(); };
            ws.onmessage = e => {
                try {
                    const m = JSON.parse(e.data);
                    if (m.t === 'status') {
                        const more = m.viewers > viewers;
                        viewers = m.viewers; updateBadge();
                        // un appareil arrive (ou le maître vient de se (re)connecter avec des appareils déjà là) :
                        // on lui envoie tout de suite un instantané frais
                        if (more) { forceFull = true; domDirty = true; schedule(); }
                    }
                } catch (_) {}
            };
            ws.onclose = () => {
                viewers = 0; updateBadge();
                retryTimer = setTimeout(connect, retry); retry = Math.min(retry * 2, RETRY_MAX_MS);
            };
            ws.onerror = () => { try { ws.close(); } catch (_) {} };
        }

        // Valeurs des champs : elles changent sans événement ni mutation quand l'appli les remplit par script
        function formFingerprint() {
            let f = '';
            document.querySelectorAll('input,textarea,select').forEach(e => {
                const type = (e.type || '').toLowerCase();
                f += (type === 'checkbox' || type === 'radio' ? (e.checked ? '1' : '0')
                    : type === 'password' || type === 'file' ? '' : e.value) + '\u0001';
            });
            return f;
        }

        new MutationObserver(markDom).observe(document.documentElement,
            { subtree: true, childList: true, attributes: true, characterData: true });
        ['input', 'change', 'click', 'keyup', 'transitionend', 'animationend', 'load'].forEach(ev =>
            document.addEventListener(ev, markDom, true));
        window.addEventListener('scroll', e => {
            const t = e.target;
            if (t && t.nodeType === 1) touched.add(t);
            markView();
        }, true);
        window.addEventListener('resize', markDom);
        document.addEventListener('fullscreenchange', markDom);          // entrée/sortie du plein écran natif
        document.addEventListener('webkitfullscreenchange', markDom);
        setInterval(() => {
            if (!viewers) return;
            tick++;
            const fp = formFingerprint();
            if (fp !== lastFp) { lastFp = fp; markDom(); }
            else if (tick % 3 === 0 && document.querySelector('canvas')) markDom();   // canvas : pas observable
        }, RESEND_CHECK_MS);

        const reconnectNow = () => { if (!ws || ws.readyState > 1) { clearTimeout(retryTimer); retry = 500; connect(); } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnectNow(); });
        window.addEventListener('online', reconnectNow);

        connect();
    }

    // ===============================================================
    //  VIEWER (écran d'affichage)
    // ===============================================================
    function startViewer() {
        const css = document.createElement('style');
        css.textContent =
            'html:not([data-sync-ready]) body{visibility:hidden}' +
            'body *{pointer-events:none!important;-webkit-user-select:none;user-select:none}';
        document.head.appendChild(css);
        badge.set('En attente du PC maître…', 'center');

        const dynStyle = document.createElement('style');
        document.head.appendChild(dynStyle);
        const addedLinks = new Set();
        let ws = null, retry = 500, retryTimer = null, pendingSnap = null, pendingView = null, raf = 0,
            gotFirst = false, mastersOnline = true, lastBody = null;

        // ---- Diff DOM --------------------------------------------------
        function syncAttrs(el, src) {
            for (const a of Array.from(el.attributes)) {
                if (!src.hasAttribute(a.name)) el.removeAttribute(a.name);
            }
            for (const a of Array.from(src.attributes)) {
                if (/^on/i.test(a.name)) continue; // pas de gestionnaires d'événements côté viewer
                if (el.getAttribute(a.name) !== a.value) {
                    if (a.namespaceURI) el.setAttributeNS(a.namespaceURI, a.name, a.value);
                    else el.setAttribute(a.name, a.value);
                }
            }
        }
        function syncMapAttrs(el, map, keep) {
            for (const a of Array.from(el.attributes)) {
                if (!(a.name in map) && !(keep && keep.includes(a.name))) el.removeAttribute(a.name);
            }
            for (const name in map) {
                if (/^on/i.test(name)) continue;
                if (el.getAttribute(name) !== map[name]) el.setAttribute(name, map[name]);
            }
        }
        function sameKind(a, b) {
            if (a.nodeType !== b.nodeType) return false;
            if (a.nodeType !== 1) return true;
            return a.tagName === b.tagName && (a.id || '') === (b.id || '');
        }
        function patch(cur, src) {
            if (cur.nodeType !== 1) {
                if (cur.nodeValue !== src.nodeValue) cur.nodeValue = src.nodeValue;
                return;
            }
            syncAttrs(cur, src);
            const tag = cur.tagName;
            if (tag === 'INPUT') {
                const type = (cur.getAttribute('type') || '').toLowerCase();
                if (type === 'checkbox' || type === 'radio') cur.checked = src.hasAttribute('checked');
                else if (type !== 'file' && type !== 'password') {
                    const v = src.getAttribute('value') || '';
                    if (cur.value !== v) cur.value = v;
                }
                return;
            }
            if (tag === 'TEXTAREA') {
                if (cur.value !== src.textContent) cur.value = src.textContent;
                return;
            }
            if (tag === 'OPTION') cur.selected = src.hasAttribute('selected');
            morphChildren(cur, src);
        }
        // Valeur/état des champs : ce sont des PROPRIÉTÉS, que la comparaison d'attributs ne voit pas.
        function syncControls(srcRoot) {
            const liveC = document.body.querySelectorAll('input,textarea,option');
            const srcC = srcRoot.querySelectorAll('input,textarea,option');
            if (liveC.length !== srcC.length) return;       // structures différentes : patch() s'en est déjà chargé
            for (let i = 0; i < liveC.length; i++) {
                const cur = liveC[i], src = srcC[i], tag = cur.tagName;
                if (tag === 'INPUT') {
                    const type = (cur.getAttribute('type') || '').toLowerCase();
                    if (type === 'checkbox' || type === 'radio') { const c = src.hasAttribute('checked'); if (cur.checked !== c) cur.checked = c; }
                    else if (type !== 'file' && type !== 'password') { const v = src.getAttribute('value') || ''; if (cur.value !== v) cur.value = v; }
                } else if (tag === 'TEXTAREA') {
                    if (cur.value !== src.textContent) cur.value = src.textContent;
                } else {
                    const sel = src.hasAttribute('selected'); if (cur.selected !== sel) cur.selected = sel;
                }
            }
        }
        function morphChildren(live, next) {
            const nk = next.childNodes;
            for (let i = 0; i < nk.length; i++) {
                const n = nk[i];
                const cur = live.childNodes[i];
                if (!cur) { live.appendChild(document.importNode(n, true)); continue; }
                if (sameKind(cur, n)) {
                    // bloc identique (comparaison native, très rapide) : rien à faire. C'est ce qui rend la mise à jour
                    // proportionnelle à ce qui a changé et non à la taille de la page (décisif sur un PC lent).
                    // Les valeurs de champs (propriétés) sont resynchronisées à part : voir syncControls().
                    if (cur.nodeType === 1 && cur.isEqualNode(n)) continue;
                    patch(cur, n); continue;
                }
                if (n.nodeType === 1 && n.id) { // élément à id déplacé : on le retrouve plutôt que de le recréer
                    let found = null;
                    for (let j = i + 1; j < live.childNodes.length; j++) {
                        const c = live.childNodes[j];
                        if (c.nodeType === 1 && c.id === n.id && c.tagName === n.tagName) { found = c; break; }
                    }
                    if (found) { live.insertBefore(found, cur); patch(found, n); continue; }
                }
                live.insertBefore(document.importNode(n, true), cur);
            }
            while (live.childNodes.length > nk.length) live.removeChild(live.lastChild);
        }

        // ---- Défilement : mémorisé et ré-appliqué quand la mise en page change ----
        // (images, polices, redimensionnement : sans cela, la position en proportion
        // dérive jusqu'au prochain défilement du maître)
        // ---- Mode léger (appareils lents) ----------------------------------------------------
        // Le viewer rejoue les animations CSS de l'appli (fond karaoké animé, pulsation de l'accord suivant,
        // flash de la nouvelle ligne, transitions, défilement doux...). Sur un processeur graphique faible
        // chacune coûte des images perdues. Ce mode les coupe : l'affichage reste identique, sans animation.
        //   ?lite=1 dans l'adresse : forcé (mémorisé sur cet appareil)   ?lite=0 : jamais (mémorisé)
        //   sans choix : activé automatiquement (et mémorisé) si l'appareil se fige de façon répétée.
        const LITE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;' +
            'scroll-behavior:auto!important;filter:none!important}';
        let litePref = null;                     // '1' forcé, '0' interdit, 'auto' activé automatiquement, null non décidé
        try {
            const q = location.search.match(/[?&]lite=(0|1)(&|$)/);
            if (q) { litePref = q[1]; localStorage.setItem('syncLite', litePref); }
            else litePref = localStorage.getItem('syncLite');
        } catch (_) {}
        let lite = false;
        const liteStyle = document.createElement('style');
        liteStyle.id = 'sync-lite'; liteStyle.textContent = LITE_CSS;
        function setLite(on) { if (on === lite) return; lite = on; if (on) document.head.appendChild(liteStyle); else liteStyle.remove(); }
        if (litePref === '1' || litePref === 'auto') setLite(true);

        // ---- Diagnostic (?syncdebug=1) + détection des saccades ----
        const dbg = { read: 0, upd: 0, kb: 0, maxApply: 0, lastMaxApply: 0, worstFrame: 0, slowFrames: 0 };
        function showDebug() {
            badge.set('● Synchronisé · lecture ' + dbg.read + ' + MAJ ' + dbg.upd + ' ms · ' + dbg.kb + ' Ko · pire MAJ ' +
                Math.max(dbg.maxApply, dbg.lastMaxApply) + ' ms · pire image ' + dbg.worstFrame + ' ms (' + dbg.slowFrames +
                ' > 100 ms)' + (lite ? ' · mode léger' : '') +
                (fitSig && typeof LyricsFit !== 'undefined' ? ' · texte : ' + LyricsFit.label(fitLay) : ''), 'corner');
        }
        // Mesure l'écart entre images affichées : une saccade perçue = un grand écart, quelle qu'en soit la cause.
        // Tourne seulement tant que des mises à jour arrivent (sauf en mode diagnostic) : pas de coût au repos.
        let lastApplyAt = 0, monRunning = false, monLast = 0, winStart = 0, winWorst = 0, winSlow = 0;
        const stalls = [];
        function monLoop(now) {
            const d = now - monLast; monLast = now;
            if (!document.hidden && d < 5000) {
                if (d > winWorst) winWorst = d;
                if (d > 100) winSlow++;
                if (d > 500 && now > 8000) {       // (on ignore les 8 premières secondes : chargement initial)
                    stalls.push(now);
                    while (stalls.length && now - stalls[0] > 60000) stalls.shift();
                    if (!lite && litePref !== '0' && litePref !== '1' && stalls.length >= 3) {
                        try { localStorage.setItem('syncLite', 'auto'); } catch (_) {}
                        litePref = 'auto'; setLite(true);
                        badge.set('● Mode léger activé (appareil lent) — ajoutez ?lite=0 à l\'adresse pour le refuser', 'corner', 8000);
                    }
                }
            }
            if (now - winStart > 10000) {
                dbg.worstFrame = Math.round(winWorst); dbg.slowFrames = winSlow;
                dbg.lastMaxApply = dbg.maxApply; dbg.maxApply = 0;
                winWorst = 0; winSlow = 0; winStart = now;
                if (DEBUG) showDebug();
            }
            if (DEBUG || performance.now() - lastApplyAt < 2000) requestAnimationFrame(monLoop); else monRunning = false;
        }
        function ensureMonitor() {
            if (monRunning) return;
            monRunning = true; monLast = winStart = performance.now(); requestAnimationFrame(monLoop);
        }
        if (DEBUG) ensureMonitor();

        let scrollState = null, reapplyRaf = 0, elList = null;   // elList : liste des éléments, recalculée seulement si le DOM a changé
        function applyScroll() {
            if (!scrollState) return;
            const { els, win } = scrollState;
            const lyr = fitLay && fitLay.scroll ? document.getElementById('song-content-display') : null;
            const following = !!(lyr && lyr.classList.contains('lyrics-css-fullscreen') && followLyrics(lyr));
            if (els && els.length) {
                const list = elList || (elList = document.body.querySelectorAll('*'));
                els.forEach(([i, rx, ry]) => {
                    const el = list[i];
                    if (!el) return;
                    if (following && el === lyr) return;        // position suivie sur la ligne en cours, pas celle du maître
                    const mx = el.scrollWidth - el.clientWidth, my = el.scrollHeight - el.clientHeight;
                    if (mx > 0) el.scrollLeft = rx * mx;
                    if (my > 0) el.scrollTop = ry * my;
                });
            }
            const se = document.scrollingElement || document.documentElement;
            const mx = se.scrollWidth - se.clientWidth, my = se.scrollHeight - se.clientHeight;
            if (win) {
                if (mx > 0) se.scrollLeft = win[0] * mx;
                if (my > 0) se.scrollTop = win[1] * my;
            }
        }
        function reapplyScrollSoon() {
            if (reapplyRaf || !scrollState) return;
            reapplyRaf = requestAnimationFrame(() => { reapplyRaf = 0; viewerFit(false); applyScroll(); });
        }
        window.addEventListener('load', reapplyScrollSoon);
        window.addEventListener('resize', reapplyScrollSoon);
        document.addEventListener('load', reapplyScrollSoon, true);   // images, iframes…
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(reapplyScrollSoon);

        // ---- Plein écran paroles : ajustement à la page, recalculé avec les dimensions de CET écran ----
        // Le maître a choisi sa disposition (1 ou 2 colonnes) pour SON écran. Ici on refait la même décision
        // (js/lyrics-fit.js, même module) pour celui-ci, sans jamais recopier celle du maître. La disposition est
        // portée par une feuille de style propre au viewer (#sync-fit) : le DOM recopié n'est pas touché.
        const fitStyle = document.createElement('style');
        fitStyle.id = 'sync-fit';
        const LYRICS_FS = '#song-content-display.lyrics-css-fullscreen';
        let fitLay = null, fitSig = '';           // fitLay : { cols, scale, scroll } — scroll = ne tient pas (défilement)
        function viewerFit(force) {
            if (typeof LyricsFit === 'undefined') return;
            const el = document.getElementById('song-content-display');
            if (!el || !el.classList.contains('lyrics-css-fullscreen')) {      // pas de plein écran paroles : affichage normal
                if (fitSig !== '') { fitStyle.textContent = ''; fitSig = ''; fitLay = null; }
                return;
            }
            const sig = LyricsFit.signature(el);
            if (!force && sig === fitSig) return;                              // rien n'a changé : pas de nouvelle mesure
            fitSig = sig;
            if (!fitStyle.parentNode) document.head.appendChild(fitStyle);
            const lay = LyricsFit.fit(el, LyricsFit.makeApplier(el, fitStyle, LYRICS_FS, null));
            if (lay) fitLay = lay;
            elList = null;                                                     // la disposition a changé
        }
        // Écran trop petit pour tout afficher : le maître (plus grand) ne défile peut-être pas, donc rien à recopier.
        // On garde alors visible la ligne en cours (accord actif de la lecture), comme le fait le maître en défilement.
        function followLyrics(el) {
            const b = el.querySelector('.chord-active-scroll');
            if (!b) return false;
            const max = el.scrollHeight - el.clientHeight;
            if (max > 0) el.scrollTop = Math.min(max, Math.max(0, b.offsetTop - el.clientHeight / 2 + b.offsetHeight / 2));
            return true;
        }

        // ---- Application d'un instantané ----------------------------------
        function apply(m) {
            lastApplyAt = performance.now(); ensureMonitor();
            document.title = m.title || document.title;
            syncMapAttrs(document.documentElement, m.html || {}, ['data-sync-ready']);
            syncMapAttrs(document.body, m.bodyAttrs || {});

            const joined = (m.styles || []).join('\n');
            if (dynStyle.textContent !== joined) dynStyle.textContent = joined;
            (m.links || []).forEach(href => {
                if (addedLinks.has(href)) return;
                addedLinks.add(href);
                const l = document.createElement('link');
                l.rel = 'stylesheet'; l.href = href;
                document.head.appendChild(l);
            });

            // contenu inchangé (ex. seul le défilement a bougé) : inutile de reconstruire le DOM
            if (m.body !== lastBody) {
                lastBody = m.body;
                const t0 = DEBUG ? performance.now() : 0;
                const doc = new DOMParser().parseFromString('<!DOCTYPE html><html><body>' + m.body + '</body></html>', 'text/html');
                const t1 = DEBUG ? performance.now() : 0;
                morphChildren(document.body, doc.body);
                syncControls(doc.body);
                elList = null;                      // le DOM a pu changer : la liste d'éléments mise en cache est périmée
                viewerFit(false);                   // plein écran paroles : ajustement à la page de CET écran
                if (DEBUG) {
                    const read = Math.round(t1 - t0), upd = Math.round(performance.now() - t1);
                    dbg.read = read; dbg.upd = upd; dbg.kb = Math.round(m.body.length / 1024);
                    if (read + upd > dbg.maxApply) dbg.maxApply = read + upd;
                    showDebug();
                }
            }

            document.querySelectorAll('video,audio').forEach(v => {
                v.muted = true; // le son vient uniquement du PC maître
                if (v.hasAttribute('autoplay') && v.paused) v.play().catch(() => {});
            });

            // défilement (en proportion : les écrans n'ont pas la même taille)
            scrollState = { els: m.els, win: m.win };
            applyScroll();

            document.documentElement.setAttribute('data-sync-ready', '1');
            if (!gotFirst) { gotFirst = true; badge.set('● Synchronisé', 'corner', 2500); }
        }

        let lastViewApply = 0, viewTimer = 0;
        function run() {
            raf = 0;
            const snap = pendingSnap, view = pendingView;
            if (!snap && view && lite) {           // mode léger : défilement seul appliqué au plus toutes les 120 ms (moins de repeints)
                const wait = 120 - (performance.now() - lastViewApply);
                if (wait > 0) {
                    if (!viewTimer) viewTimer = setTimeout(() => { viewTimer = 0; if (!raf) raf = requestAnimationFrame(run); }, wait);
                    return;                        // pendingView est conservé : seule la dernière position compte
                }
            }
            pendingSnap = pendingView = null;
            try {
                if (snap) apply(snap);
                if (view) { scrollState = { els: view.els, win: view.win }; applyScroll(); }
                if (snap || view) lastViewApply = performance.now();
            } catch (err) { console.error('[sync] application impossible :', err); }
        }
        function enqueue(m) {
            if (m.t === 'snap') { pendingSnap = m; pendingView = null; }   // un instantané complet contient déjà le défilement
            else pendingView = m;
            if (!raf) raf = requestAnimationFrame(run);
        }

        function connect() {
            if (ws && ws.readyState <= 1) return;
            clearTimeout(retryTimer);
            ws = new WebSocket(WS_URL);
            ws.onopen = () => { retry = 500; if (!gotFirst) badge.set('En attente du PC maître…', 'center'); };
            ws.onmessage = e => {
                let m;
                try { m = JSON.parse(e.data); } catch (_) { return; }
                if (m.t === 'snap' || m.t === 'view') enqueue(m);
                else if (m.t === 'status') {
                    mastersOnline = m.masters > 0;
                    if (!mastersOnline && gotFirst) badge.set('⚠ PC maître hors ligne', 'corner');
                    else if (mastersOnline && gotFirst) badge.set('● Synchronisé', 'corner', 2500);
                }
            };
            ws.onclose = () => {
                badge.set(gotFirst ? '⚠ Connexion perdue — reconnexion…' : 'Connexion au serveur…', gotFirst ? 'corner' : 'center');
                retryTimer = setTimeout(connect, retry); retry = Math.min(retry * 2, RETRY_MAX_MS);
            };
            ws.onerror = () => { try { ws.close(); } catch (_) {} };
        }
        const reconnectNow = () => { if (!ws || ws.readyState > 1) { clearTimeout(retryTimer); retry = 500; connect(); } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnectNow(); });
        window.addEventListener('online', reconnectNow);
        connect();
    }

    if (ROLE === 'master') startMaster(); else startViewer();
})();
