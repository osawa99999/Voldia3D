/* ============================================================================
   voldia_gm_intro.js — 3D生成方法ダイアログ(#gm-dlg)のイラスト連動。
   本体(voldia_main.js)は触らない。DOMのid/クラスだけを見て動く。
     ① 作成方法が「通常計算」のとき、ダイアログに gm-intro-off を付ける(CSSがイラストをスライド収納)。
     ② 入力欄・法面角度ボタンにフォーカス/マウスオーバーすると、イラストの該当部分をスポットライトする。
     ③ 各設定行のラベルに番号バッジ(1〜4)を付ける。
   前提のid: gm-dlg / gm-intro-fig / gm-intro-img / gm-hl / gm-mode-normal / gm-mode-doboku / gl-offset-mm / conc-thick / global-overdig / slope-angle-row
   画像: data/voldia_intro_img.js の INTRO_DOBOKU_B64(別ファイル)。
   ============================================================================ */
(function () {
  'use strict';
  var IMG_W = 390, IMG_H = 368; // 51回目: 絵の入れ替え(618x567 → 390x368)
  // 画像内のpx座標 [x1,y1,x2,y2]。丸数字の中心は ③(124.5,83.9) ①(338.1,97.1) ④(39.8,258.0) ②(316.7,298.9)(半径約21)を実測し、そのまわりの図(矢印・GL文字など)を含む範囲にした。
  // 51回目: 旧画像の範囲を「丸数字の中心からの相対位置×縮尺(新旧の丸の半径比0.605)」で新画像に移し、重ね描きで確認した。
  var REGIONS = { 1: [296, 61, 390, 171], 2: [234, 264, 351, 339], 3: [78, 51, 175, 139], 4: [4, 224, 106, 327] }; // 51回目: 光る枠を一回り大きくした(各辺+9px。画像の端はクリップ)

  function $(id) { return document.getElementById(id); }
  function pct(v, total) { return (v / total * 100).toFixed(3) + '%'; }

  function init() {
    var dlg = $('gm-dlg'), fig = $('gm-intro-fig'), img = $('gm-intro-img');
    if (!dlg || !fig || !img) return;
    if (typeof INTRO_DOBOKU_B64 === 'string') img.src = INTRO_DOBOKU_B64;

    // 番号ごとの「行」と、反応させる要素
    var rows = {
      1: $('gl-offset-mm') && $('gl-offset-mm').closest('.gm-row'),
      2: $('conc-thick') && $('conc-thick').closest('.gm-row'),
      3: $('global-overdig') && $('global-overdig').closest('.gm-row'),
      4: $('slope-angle-row')
    };

    // ③ 番号バッジ
    Object.keys(rows).forEach(function (n) {
      var row = rows[n]; if (!row || row.querySelector('.gm-no')) return;
      var lab = row.querySelector('.gm-lab'); if (!lab) return;
      var b = document.createElement('span'); b.className = 'gm-no'; b.setAttribute('aria-hidden', 'true'); b.textContent = n;
      lab.insertBefore(b, lab.firstChild);
    });

    // ② スポットライト
    var focusN = 0, hoverN = 0, shown = 0;
    function apply() {
      var n = hoverN || focusN;
      Object.keys(rows).forEach(function (k) { if (rows[k]) rows[k].classList.toggle('gm-row-hl', +k === n); });
      if (!n) { if (shown) { fig.removeAttribute('data-hl'); shown = 0; } return; }   // 位置は残したままフェードアウト
      var r = REGIONS[n];
      fig.style.setProperty('--hl-l', pct(r[0], IMG_W)); fig.style.setProperty('--hl-t', pct(r[1], IMG_H));
      fig.style.setProperty('--hl-w', pct(r[2] - r[0], IMG_W)); fig.style.setProperty('--hl-h', pct(r[3] - r[1], IMG_H));
      fig.setAttribute('data-hl', n); shown = n;
    }
    Object.keys(rows).forEach(function (k) {
      var row = rows[k]; if (!row) return; var n = +k;
      row.addEventListener('focusin', function () { focusN = n; apply(); });
      row.addEventListener('focusout', function (e) { if (!row.contains(e.relatedTarget)) { if (focusN === n) focusN = 0; apply(); } });
      row.addEventListener('mouseenter', function () { hoverN = n; apply(); });
      row.addEventListener('mouseleave', function () { if (hoverN === n) hoverN = 0; apply(); });
    });

    // ① 通常計算のときはイラストを収納
    var bn = $('gm-mode-normal'), bd = $('gm-mode-doboku');
    function syncMode() { dlg.classList.toggle('gm-intro-off', !!(bn && bn.classList.contains('on'))); }
    syncMode();
    if (window.MutationObserver) {
      var mo = new MutationObserver(syncMode);
      [bn, bd].forEach(function (b) { if (b) mo.observe(b, { attributes: true, attributeFilter: ['class'] }); });
    }
    // ダイアログが閉じる/再表示されたときにスポットライトが残らないように
    var ov = $('gm-overlay');
    if (ov && window.MutationObserver) new MutationObserver(function () { focusN = hoverN = 0; apply(); }).observe(ov, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
