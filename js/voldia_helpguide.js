/* Voldia 45回目: マスターのArecal側Claude姉さんが作った HelpGuide_portable_v02.js をそのまま取り込み。変更は CFG の上書き口(window.HELPGUIDE_CFG)の1か所だけ。
   読み込む側(Voldia_v0147.html / voldia_placement_v0083.html)が、このファイルより前に window.HELPGUIDE_CFG を定義する。 */
/* ============================================================================
   HelpGuide (操作ガイド「簡単な説明」) — portable, dependency-free, single file.
   Origin: Arecal_Touch A079 (verified there by the owner on a real PC). Generalised for reuse (e.g. Voldia).
   v02: label "簡単な説明（F1）" (PC) / "簡単な説明" (touch); footer = left "F1 キーで開閉" + right-aligned [前へ][n / N][次へ];
        minimum content size (MIN_W x MIN_H); "読み込み中……" while images load; image load-error message.

   What it does
   - Shows a slide-image guide (Explan/Explan_1.png, Explan_2.png ... consecutive numbering) in a
     Document Picture-in-Picture window (always-on-top OS-level small window, Chrome/Edge 116+),
     so it never hides behind the main window while the user keeps working in the app.
   - Falls back to an in-page, draggable, NON-modal floating panel when Document PiP is unavailable
     (other browsers / touch devices / request refused / construction error).
   - F1 toggles it (browser help is suppressed). Optional start-screen button and work-time button.
   - Toast "...F1キーで呼び出せます" only when the USER closes it (x button / PiP window close),
     never when closed with F1 or by code.

   Integration: paste this whole file inside a <script> near the end of <body> (after the app's own
   scripts), then edit only the CFG block. Public API: window.HelpGuide = {toggle, open, close, syncStart, setDir(Voldia追加)}.
   All ids/classes are prefixed "hg-" to avoid collisions.
   ============================================================================ */
(function () {
  'use strict';

  /* ===================== CFG — adjust for the host app ===================== */
  const CFG = Object.assign({
    DIR: 'Explan/',            // image folder, relative to the HTML file
    PREFIX: 'Explan_',         // Explan_1.png, Explan_2.png ... (no gaps!)
    EXT: '.png',
    MAX_PAGES: 30,
    TITLE: '簡単な説明',        // base label (alt text, touch-device label)
    KEY_SUFFIX: '（F1）',      // appended to TITLE on devices that have an F1 key (PiP title / panel title / buttons)
    KEY_HINT: 'キーで開閉',    // footer, left side: [F1] + this text (touch devices: not shown)
    LOADING: '読み込み中……',   // shown while the image list / an image is loading
    MIN_W: 380, MIN_H: 200,    // minimum CONTENT size (px): footer text+buttons never get squashed below this
    MIN_IMG_H: 130,            // minimum height of the image area (px)
    PIP_W: 480, PIP_H: 380,    // initial PiP size (px); the OS window is user-resizable
    PANEL_TOP: 70,             // in-page fallback: initial top (px)
    PANEL_RIGHT: 20,           // in-page fallback: initial right (px)  -> keep clear of the app's side panels
    START_BTN_PARENT: null,    // selector/element for a start-screen button (parent must be position:relative|absolute). null = none
    WORK_BTN_PARENT: null,     // selector/element to append a work-time button to. null = none
    START_VISIBLE: null,       // optional () => boolean : should the start-screen button be shown now? call HelpGuide.syncStart() when it changes
    TOAST_PC: '“簡単な説明”は作図モード中、F1キーで呼び出せます。',   // <- reword for the host app (e.g. 作業中)
    TOAST_TOUCH: '“簡単な説明”は、「簡単な説明」ボタンからいつでも呼び出せます。',
    toast: function (msg) {    // host app's toast function. A bare-identifier check also finds top-level const/let/function (not only window.toast). Falls back to console.
      if (typeof toast === 'function') toast(msg, 3500); else console.log('[HelpGuide]', msg);
    },
    isTouch: function () {     // touch devices have no F1 and no Document PiP -> in-page panel + button wording
      return /iPhone|iPad|Android/i.test(navigator.userAgent) ||
             (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
    },
    // theme (CSS variables). Orange example for Voldia: accent '#ff9800'
    ACCENT: '#4488cc', BG: '#1e1e2e', BG_DARK: '#12121f', BG_IMG: '#05050a', FG: '#cde',
    Z_INDEX: 10000,            // keep BELOW the host app's modal/confirm dialogs
    PAGES: 0                   // Voldia(45回目): 総ページ数(数 or フォルダごとの数)。0=不明(探査)。入れると探査を省いて高速化
  }, window.HELPGUIDE_CFG || {});   // Voldia(45回目): ホスト側HTMLの window.HELPGUIDE_CFG で上書き(本体は仕様書v02のまま)
  /* ========================================================================= */

  const touch = CFG.isTouch();
  const LABEL = CFG.TITLE + (touch ? '' : CFG.KEY_SUFFIX);   // "簡単な説明（F1）" on PC, "簡単な説明" on touch devices
  let slides = null, idx = 0, probing = false, dragging = false, dragOff = { x: 0, y: 0 }, pipWin = null, opening = false;

  /* ---------- CSS (injected once) ---------- */
  const css =
    '#hg-panel{--hg-accent:' + CFG.ACCENT + ';position:fixed;top:' + CFG.PANEL_TOP + 'px;right:' + CFG.PANEL_RIGHT + 'px;z-index:' + CFG.Z_INDEX + ';display:none;flex-direction:column;width:max-content;min-width:' + CFG.MIN_W + 'px;max-width:96vw;background:' + CFG.BG + ';border:1px solid var(--hg-accent);border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.55);user-select:none;-webkit-user-select:none;overflow:hidden;font-family:inherit;}' +
    '#hg-panel .hg-hd{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;background:' + CFG.BG_DARK + ';color:' + CFG.FG + ';border-bottom:1px solid #334;cursor:grab;touch-action:none;}' +
    '#hg-panel .hg-hd:active{cursor:grabbing;}' +
    '#hg-panel .hg-title{font-size:.85em;font-weight:700;}' +
    '#hg-panel .hg-x{background:transparent;border:none;color:#9ab;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px;}' +
    '#hg-panel .hg-x:hover{color:#fff;}' +
    '#hg-panel .hg-bd{display:flex;align-items:center;justify-content:center;background:' + CFG.BG_IMG + ';min-height:' + CFG.MIN_IMG_H + 'px;}' +
    '#hg-panel .hg-bd img{display:block;width:auto;height:auto;max-width:50vw;max-height:75vh;-webkit-user-drag:none;}' +
    '@media (max-width:800px){#hg-panel .hg-bd img{max-width:92vw;}}' +
    '#hg-panel .hg-msg{display:none;color:#9ab;padding:28px 22px;font-size:.85em;line-height:1.8;text-align:center;white-space:pre-wrap;}' +
    '#hg-panel .hg-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 10px;background:' + CFG.BG_DARK + ';border-top:1px solid #334;}' +
    '#hg-panel .hg-keyhint{font-size:.8em;color:#9ab;white-space:nowrap;}' +
    '#hg-panel .hg-keyhint kbd{font-family:inherit;font-weight:900;font-size:1.05em;color:var(--hg-accent);border:1px solid var(--hg-accent);border-radius:4px;padding:1px 6px;margin-right:2px;}' +
    '#hg-panel .hg-navgrp{display:flex;align-items:center;gap:8px;margin-left:auto;white-space:nowrap;}' +
    '#hg-panel .hg-nav{white-space:nowrap;padding:5px 12px;font-size:.82em;color:#f0f4f8;background:#334;border:1px solid #556;border-radius:4px;cursor:pointer;}' +
    '#hg-panel .hg-nav:disabled{opacity:.35;cursor:not-allowed;}' +
    '#hg-panel .hg-ind{font-size:.85em;color:#bcd;}' +
    '.hg-btn{padding:8px 14px;font-size:.9em;font-weight:700;color:#fff;background:' + CFG.ACCENT + ';border:1px solid rgba(255,255,255,.35);border-radius:8px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.45);}' +
    '.hg-btn:active{filter:brightness(1.25);}' +
    '#hg-start-btn{display:none;position:absolute;left:14px;bottom:14px;z-index:11;}' +
    '#hg-work-btn{width:100%;margin-top:8px;}';
  const styleEl = document.createElement('style'); styleEl.id = 'hg-style'; styleEl.textContent = css; document.head.appendChild(styleEl);

  /* ---------- DOM (appended to <body>, i.e. OUTSIDE the app's canvas containers so canvas pointer handlers never see it) ---------- */
  const panel = document.createElement('div'); panel.id = 'hg-panel';
  panel.innerHTML =
    '<div class="hg-hd"><span class="hg-title">' + LABEL + '</span><button type="button" class="hg-x" aria-label="閉じる">×</button></div>' +
    '<div class="hg-bd"><img alt="' + CFG.TITLE + '" draggable="false"><div class="hg-msg"></div></div>' +
    // footer: left = key hint (PC only), right = [前へ][n / N][次へ] grouped together
    '<div class="hg-ft">' + (touch ? '<span></span>' : '<span class="hg-keyhint"><kbd>F1</kbd> ' + CFG.KEY_HINT + '</span>') +
    '<span class="hg-navgrp"><button type="button" class="hg-nav hg-prev">◀ 前へ</button><span class="hg-ind">0 / 0</span><button type="button" class="hg-nav hg-next">次へ ▶</button></span></div>';
  document.body.appendChild(panel);
  const hdr = panel.querySelector('.hg-hd'), img = panel.querySelector('img'), msg = panel.querySelector('.hg-msg'),
        ind = panel.querySelector('.hg-ind'), bPrev = panel.querySelector('.hg-prev'), bNext = panel.querySelector('.hg-next'), bClose = panel.querySelector('.hg-x');

  /* ---------- slides ---------- */
  function clamp() {                       // in-page panel only: keep inside the viewport
    if (pipWin) return;
    const r = panel.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.left, innerWidth - r.width)), y = Math.max(0, Math.min(r.top, innerHeight - r.height));
    panel.style.left = x + 'px'; panel.style.top = y + 'px'; panel.style.right = 'auto';
  }
  let loadTimer = null;
  function showMsg(t) { img.style.display = 'none'; msg.style.display = 'block'; msg.textContent = t; }
  function render() {
    clearTimeout(loadTimer);
    if (slides === null) { showMsg(CFG.LOADING); ind.textContent = '… / …'; bPrev.disabled = bNext.disabled = true; return; }
    if (!slides.length) {
      showMsg('ガイド画像が見つかりません。\n' + CFG.DIR + CFG.PREFIX + '1' + CFG.EXT + ' から連番（' + CFG.PREFIX + '2' + CFG.EXT + '…）で配置してください。');
      ind.textContent = '0 / 0'; bPrev.disabled = bNext.disabled = true; return;
    }
    ind.textContent = (idx + 1) + ' / ' + slides.length + (probing ? '+' : '');   // Voldia: 探査中は「+」(まだ増えるかも)
    bPrev.disabled = (idx === 0); bNext.disabled = (idx === slides.length - 1);
    const url = slides[idx];
    img.onload = function () { clearTimeout(loadTimer); msg.style.display = 'none'; img.style.display = 'block'; clamp(); };   // image size changes the panel size
    img.onerror = function () { clearTimeout(loadTimer); showMsg('画像を読み込めませんでした。\n' + url); };
    if (img.getAttribute('src') === url && img.complete && img.naturalWidth > 0) { img.onload(); return; }   // already displayed: nothing to wait for
    // Only show "読み込み中……" if loading is actually slow (150 ms grace avoids flicker for cached images)
    loadTimer = setTimeout(function () { if (!(img.complete && img.naturalWidth > 0)) showMsg(CFG.LOADING); }, 150);
    img.src = url;
  }
  // A browser cannot list a folder: probe Explan_1, Explan_2 ... sequentially and stop at the first that fails to load.
  // URLs are stored ABSOLUTE so that they also resolve inside the PiP window (a different document).
  let probeGen = 0;   // Voldia(45回目): setDir()で探索をやり直した時、古い探索の結果を捨てるための番号
  // Voldia(45回目・高速化): 以前は「全ページを1枚ずつ最後まで読み込み、最後の404も待ってから」1ページ目を出していたため、GitHub Pages等で遅かった。
  //   (1) CFG.PAGES に総ページ数が入っていれば、探査せず即座に1ページ目を出し、2ページ目以降はバックグラウンドで先読みする(404の待ちも無い)。
  //       CFG.PAGES は数(全フォルダ共通)か、フォルダごとの数 { 'Explan_A/': 12, 'Explan_B/': 5, 'Explan_C/': 8 }。0または未指定=総数不明。
  //   (2) 総数が不明なら従来どおり探査するが、1ページ目が見つかった時点で表示を始める(残りは裏で探査を続け、見つかるたびに「n / m+」が増える)。
  function knownPages() {
    const p = CFG.PAGES, n = (typeof p === 'number') ? p : ((p && typeof p === 'object') ? p[CFG.DIR] : 0);
    return (n > 0) ? Math.min(Math.floor(n), CFG.MAX_PAGES) : 0;
  }
  function absUrl(url) { try { return new URL(url, document.baseURI).href; } catch (_) { return url; } }
  function probe() {
    if (probing) return;
    const gen = probeGen, known = knownPages();
    if (known > 0) {
      const urls = []; for (let i = 1; i <= known; i++) urls.push(absUrl(CFG.DIR + CFG.PREFIX + i + CFG.EXT));
      slides = urls; idx = 0; render();   // 1ページ目を今すぐ表示
      // 1ページ目が届いたら(失敗しても)、残りを並行して先読み
      const first = new Image();
      first.onload = first.onerror = function () { if (gen !== probeGen) return; urls.slice(1).forEach(function (u) { new Image().src = u; }); };
      first.src = urls[0];
      return;
    }
    probing = true;
    const found = []; let n = 1;
    const done = function () {
      if (gen !== probeGen) return;
      const wasNull = (slides === null);
      slides = found; probing = false; if (wasNull) idx = 0; render();
    };
    (function next() {
      if (gen !== probeGen) return;
      if (n > CFG.MAX_PAGES) { done(); return; }
      const url = CFG.DIR + CFG.PREFIX + n + CFG.EXT, im = new Image();
      im.onload = function () {
        if (gen !== probeGen) return;
        found.push(absUrl(url)); n++;
        if (found.length === 1) { slides = found; idx = 0; }   // 1ページ目が見つかった時点で表示を始める
        render();
        next();
      };
      im.onerror = done;
      im.src = url;
    })();
  }
  // Voldia(45回目): 画像フォルダを切り替えて1ページ目に戻す(モード切替用: Voldia=Explan_A/・3Dイメージ=Explan_B/・配置モード=Explan_C/)。開いていれば読み込み直す
  function setDir(dir) {
    if (dir === CFG.DIR) return;
    CFG.DIR = dir; probeGen++; slides = null; probing = false; idx = 0;
    if (isOpen()) { render(); probe(); }
  }

  /* ---------- Document Picture-in-Picture ---------- */
  const PIP_CSS =
    'html,body{margin:0!important;padding:0!important;height:100%!important;display:block!important;background:' + CFG.BG_IMG + '!important;}html{overflow:auto!important;}body{overflow:visible!important;}' +
    '#hg-panel{position:static!important;display:flex!important;flex-direction:column;width:100%!important;height:100%!important;min-width:' + CFG.MIN_W + 'px!important;min-height:' + CFG.MIN_H + 'px!important;max-width:none!important;border:none!important;border-radius:0!important;box-shadow:none!important;overflow:hidden!important;}' +
    '#hg-panel .hg-hd{display:none!important;}' +
    '#hg-panel .hg-bd{flex:1 1 auto!important;min-height:' + CFG.MIN_IMG_H + 'px!important;}' +
    '#hg-panel .hg-bd img{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;}';
  function pipSupported() { return !touch && ('documentPictureInPicture' in window) && typeof window.documentPictureInPicture.requestWindow === 'function'; }
  function isOpen() { return !!pipWin || panel.style.display === 'flex'; }
  function byeToast() { CFG.toast(touch ? CFG.TOAST_TOUCH : CFG.TOAST_PC); }
  function openInPage() { panel.style.display = 'flex'; render(); if (slides === null) probe(); clamp(); }
  function copyStyles(pw) {                // copy ALL parent styles into the PiP document, then our overrides last
    Array.from(document.styleSheets).forEach(function (ss) {
      try {
        const st = pw.document.createElement('style');
        st.textContent = Array.from(ss.cssRules).map(function (r) { return r.cssText; }).join('\n');
        pw.document.head.appendChild(st);
      } catch (_) {                        // cross-origin sheet: cssRules unreadable -> link it
        if (ss.href) { const lk = pw.document.createElement('link'); lk.rel = 'stylesheet'; lk.href = ss.href; pw.document.head.appendChild(lk); }
      }
    });
    const ov = pw.document.createElement('style'); ov.textContent = PIP_CSS; pw.document.head.appendChild(ov);
  }
  function attachPip(pw) {
    pipWin = pw;
    try { pw.document.title = LABEL; } catch (_) {}
    copyStyles(pw);
    panel.style.display = 'flex';
    pw.document.body.appendChild(panel);   // MOVE the same DOM (listeners keep working; paging logic is unchanged)
    pw.addEventListener('pagehide', function () { restoreFromPip(true); });   // user closed the PiP window
    pw.addEventListener('keydown', onKey, true);                              // F1 also works while the PiP window is focused
    render(); if (slides === null) probe();
  }
  // Idempotent cleanup: move the DOM back to the parent document and reset flags. Safe to call any number of times.
  function restoreFromPip(byUser) {
    if (!pipWin) return;
    const pw = pipWin; pipWin = null;
    try { pw.removeEventListener('keydown', onKey, true); } catch (_) {}
    try { document.body.appendChild(panel); } catch (_) {}
    panel.style.display = 'none';
    if (byUser) byeToast();
  }
  function open() {
    if (isOpen() || opening) return;
    if (!pipSupported()) { openInPage(); return; }
    opening = true;
    // MUST be called synchronously from the user gesture (keydown/click): requestWindow needs transient activation.
    window.documentPictureInPicture.requestWindow({ width: CFG.PIP_W, height: CFG.PIP_H }).then(function (pw) {
      opening = false;
      try { attachPip(pw); }
      catch (e) { console.warn('HelpGuide: PiP setup failed, using in-page panel', e); try { restoreFromPip(false); pw.close(); } catch (_) {} openInPage(); }
    }).catch(function (err) {
      opening = false;
      console.warn('HelpGuide: Document PiP unavailable, using in-page panel', err);
      openInPage();
    });
  }
  function close(byButton) {
    if (pipWin) { const pw = pipWin; restoreFromPip(false); try { pw.close(); } catch (_) {} return; }
    panel.style.display = 'none';
    if (byButton) byeToast();
  }
  function toggle() { if (isOpen()) close(false); else open(); }

  /* ---------- events ---------- */
  bClose.addEventListener('click', function (e) { e.stopPropagation(); close(true); });
  bPrev.addEventListener('click', function (e) { e.stopPropagation(); if (slides && idx > 0) { idx--; render(); } });
  bNext.addEventListener('click', function (e) { e.stopPropagation(); if (slides && idx < slides.length - 1) { idx++; render(); } });
  // do not let panel interactions leak to the app's document-level handlers
  ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'dblclick', 'contextmenu'].forEach(function (t) { panel.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
  // drag (in-page fallback only; the PiP window is moved/resized by the OS frame). Pointer events = mouse/touch/pen.
  hdr.addEventListener('pointerdown', function (e) {
    if (e.target === bClose || (e.button !== undefined && e.button !== 0)) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px'; panel.style.right = 'auto';
    dragOff = { x: e.clientX - r.left, y: e.clientY - r.top }; dragging = true;
    try { hdr.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  hdr.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(e.clientX - dragOff.x, innerWidth - r.width)) + 'px';
    panel.style.top = Math.max(0, Math.min(e.clientY - dragOff.y, innerHeight - r.height)) + 'px';
  });
  const endDrag = function () { dragging = false; };
  hdr.addEventListener('pointerup', endDrag); hdr.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', function () { if (isOpen()) clamp(); });
  // F1: suppress the browser help; F1 types no character so it is fine inside inputs; ignore IME composition and key repeat.
  function onKey(e) { if (e.key !== 'F1' || e.isComposing) return; e.preventDefault(); if (e.repeat) return; toggle(); }
  window.addEventListener('keydown', onKey, true);
  // PiP never outlives the opener: close it when the main page goes away
  window.addEventListener('pagehide', function () { if (pipWin) { const pw = pipWin; restoreFromPip(false); try { pw.close(); } catch (_) {} } });

  /* ---------- optional buttons ---------- */
  const resolve = function (p) { return typeof p === 'string' ? document.querySelector(p) : p; };
  let startBtn = null;
  function syncStart() { if (startBtn) startBtn.style.display = (CFG.START_VISIBLE ? !!CFG.START_VISIBLE() : true) ? 'block' : 'none'; }
  const sp = resolve(CFG.START_BTN_PARENT);
  if (sp) {
    startBtn = document.createElement('button'); startBtn.id = 'hg-start-btn'; startBtn.type = 'button'; startBtn.className = 'hg-btn'; startBtn.textContent = LABEL;
    sp.appendChild(startBtn);
    ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'click'].forEach(function (t) { startBtn.addEventListener(t, function (e) { e.stopPropagation(); }); }); // do not trigger the host's click-to-open-file etc.
    startBtn.addEventListener('click', toggle);
    syncStart();
  }
  const wp = resolve(CFG.WORK_BTN_PARENT);
  if (wp) {
    const wb = document.createElement('button'); wb.id = 'hg-work-btn'; wb.type = 'button'; wb.className = 'hg-btn'; wb.textContent = LABEL;
    wb.addEventListener('click', toggle); wp.appendChild(wb);
  }

  window.HelpGuide = { toggle: toggle, open: open, close: function () { close(false); }, syncStart: syncStart, setDir: setDir };
})();
