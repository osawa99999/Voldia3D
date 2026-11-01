// ============================================================
// r127(45回目): 差引後(C)の不良修正。C=A-Bだと、Aの外壁(山留バッチ角1°・微テーパー15mmで傾く)とBの壁(垂直)が食い違って5〜50mmの薄い楔が壁として残り、既存躯体の部分が底の抜けた箱になっていた(Voldia_261031_1806.vold)。
//   (B)関数が既存躯体の実体Gも返し、_buildNetMeshesは C=A-G を第一候補に(Gは掘削の外まで広がるので楔が出ない)。Gが無い/作れない/体積がA-Bと合わない時は従来のA-B。(A)(B)の出力・解析は無変更。前版=backup/voldia_export_r126b.js
// 現行バージョン: r049 (42回目: 縮退三角形(スリバー)判定に『実寸の高さ<60mm』を追加。長い壁を割った本物の法面の帯が「面積/最長辺²<0.01」で誤って除外され、壁ごと数量から消える不具合の修正。
//   該当箇所=土量計算/通常計算の面クラスタ化(isSliver判定)の1か所のみ。 r048 (41回目: GLBの材質色を濃いグレーに変更(全GLB出力共通。encodeMultiGLB内のGLB_BASE_COLOR)。r047 (41回目: ①ファイル名の日付を yymmdd_hhmm に統一(CSV・GLB・データ出力ZIP。名前を先頭・日付を後ろに) ②配置モードのiframe参照を voldia_placement_v0080.html に変更)。 r045 (40回目: 捨てコン+砕石・余掘りの読み取りをparseInputNum()経由に変更(桁区切り「1,000」を正しく数値化)、.vold読込は_setMmInput()で整形・負の値は0)。r044 (40回目: 配置モードのiframe参照を voldia_placement_v0079.html に変更=古いscriptタグ(404)を除去した版)。r043 (40回目: applyVoldData(data,opts)に{loadVec:false}を追加=元図の線を読み込まない選択に対応。loadVoldFileは呼び出し元が無くなったため削除)。r042 (40回目: .voldに作成方法(calcMode: 'normal'|'doboku')を保存・復元。3D生成方法ダイアログ用。他は無改造)。r041 (39回目: 書き込みのみだったtoolsLocked変数への代入1行を削除。他は無改造)。r040 (37回目セッション: 配置モードHTMLの参照をv0078に戻した(作業員はvoldia_models.jsに統合)。r038:  現状地盤GL(glOffsetMm)を.voldに保存・復元。r037:  (B)重複GLB(Voldia_OverlapForExcel)をrunCalcのfsキャッシュから作るようにした(GL≠0で深さ・形状が異常だった不具合)。r036:  配置モードの既存躯体も現状地盤GL≠0で「現状地盤=0」座標系に揃えた(voldia3d.js r107と対)。r035: 36回目セッション: 既存躯体の底面∞(doboku系統のみ)に対応 + トースト。r034=r033スリバー橋渡し+r096山留送信 を統合済み。ファイル名は固定)
// voldia_export.js — DXF/GLB/PDF/Excel出力+エビル(Evidence Builder)機能 (voldia3d_voldia_r104.jsより分離)
// ============================================================

async function exportCSV(){
  const sc=document.getElementById('sc-d').textContent||'未設定';
  // v0.0013: pts をmm座標で保存（モード非依存）
  // pxToMm(p.x) = p.x / RS / 72 * 25.4 * scaleDenom (通常)
  // pxToMm(p.x) = p.x / 72 * 25.4 * scaleDenom (方眼紙)
  // r013: 背景（PDF or 方眼紙）は、回転焼き込み後のpdfCvキャンバスをそのまま
  // ラスター画像として保存する。回転(bakeRotation)は既にpdfCv自体に焼き込み
  // 済みで元のPDFに戻って再描画する仕組みは無いため、「今キャンバスに
  // 描画されているもの」を保存するのが最もシンプルかつ正確（PDF/方眼紙の
  // 区別も、角度の別保存も不要になる）。
  const bgDataURL = (pdfW && pdfH) ? pdfCv.toDataURL('image/jpeg', 0.85) : null;
  // r013: 配置モードのオブジェクト状態も同梱する（iframeが開いていれば
  // postMessageで取得。開いていなければ配置モードのオブジェクトは無し扱い）
  const placementObjects = await requestPlacementState();
  const data={
    version:'VOLDIAM_v0.0018',
    scale:sc,
    scaleDenom:scaleDenom,
    gridPaperMode: _gridPaperActive||false, // モードフラグを保存
    concThick:( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick'))),
    // r074マスター指示: 土量計算のグローバル設定(勾配=法面角度・余掘り)もVoldファイルに保存する。
    // concThick(捨てコン+砕石)は既にr013時点から保存済みだったが、この2つは未保存だった。
    globalOverdig:( v => isNaN(v) ? 200 : Math.max(0,v))(parseInputNum(document.getElementById('global-overdig'))),
    slopeAngleDeg: (typeof slopeAngleDeg==='number' && !isNaN(slopeAngleDeg)) ? slopeAngleDeg : 45,
    // r038(37回目): 現状地盤GL(mm)もVoldファイルに保存する。従来は保存も復元もされず、読込後は
    // 入力欄の見た目と適用値(window._glOffsetMm)が食い違う原因になっていた。
    glOffsetMm: (typeof window._glOffsetMm==='number' && !isNaN(window._glOffsetMm)) ? window._glOffsetMm : 0,
    // r042(40回目): 「3D生成方法」ダイアログの作成方法(通常計算/土量計算)も保存する。捨てコン+砕石・余掘り・法面角度・GLは上で保存済み。
    calcMode: (window._genMode==='normal') ? 'normal' : 'doboku',
    backgroundImageDataURL: bgDataURL,
    placementObjects: placementObjects,
    surveyPts: (surveyPts||[]).map(p=>({x:pxToMm(p.x), y:pxToMm(p.y)})), // r024(AreCal移植): 測点もmm座標で保存
    yamadome: (yamadome && yamadome.pts && yamadome.pts.length>=3) ? {pts: yamadome.pts.map(p=>({x:pxToMm(p.x), y:pxToMm(p.y)}))} : null, // r037: 山留もmm座標で保存(従来保存されていなかったバグを修正)
    northAngleDeg: (typeof northAngleDeg==='number' && !isNaN(northAngleDeg)) ? northAngleDeg : 0, // r060: ノースアロー方位角（画面上=0°・時計回り正）
    originSurveyIdx: (typeof originSurveyIdx==='number' && surveyPts[originSurveyIdx]) ? originSurveyIdx : null, // r060: LandXML出力用の原点測点インデックス
    // r089(24回目・追加修正・項目5): 元図(PDFベクター)スナップ用の線データをmm座標で
    // 保存する。従来はvecSegsが未保存だったため、Vold読込後は「元図の線を読み取る」
    // 機能で使ったPDFファイル自体が無いと元図スナップが復元できなかった
    // (再度PDFを読み込み直す以外に手段が無く、実運用上ほぼ詰みだった)。
    // 線データ自体(端点座標のみ、単純な配列)を保存しておけば、PDF再読込なしで
    // そのまま復元できる。
    vecSegsMm: (vecSegs||[]).map(s=>({a:{x:pxToMm(s.a.x),y:pxToMm(s.a.y)},b:{x:pxToMm(s.b.x),y:pxToMm(s.b.y)}})),
    shapes:shapes.map(sh=>({
      type:sh.type,
      ptsMm:sh.pts.map(p=>({x:pxToMm(p.x), y:pxToMm(p.y)})), // mm座標で保存
      pts:sh.pts, // 後方互換のためpx座標も保持
      holesMm:sh.holesMm||[],
      holes:sh.holes||[],
      area:sh.area,
      depthBeam:sh.depthBeam,
      topLevel:sh.topLevel||'0',
      overdig:sh.overdig,
      noSlope:sh.noSlope,
      color:sh.color||'blue',
      enabled:sh.enabled!==false,
      name:sh.name||''
    }))
  };
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:'Voldia_'+getVoldiaTimestamp()+'.vold'});
  a.click();URL.revokeObjectURL(url);
  toast('📤 Voldファイル出力完了（背景・配置モードのオブジェクト含む）');
  if(placementObjects && placementObjects.length){
    setTimeout(()=>toast('⚠ 配置オブジェクトは正確に再現されない場合もあります', 3600), 1600);
  }
  // r088(24回目・項目4): 出力完了時点で「保存」ツールをキャンセルし、
  // ツール無選択状態に戻す(マスター指示)。
  if(typeof closeIoPanel==='function') closeIoPanel();
}
function loadBackgroundImageDataURL(dataURL){
  return new Promise((resolve)=>{
    if(!dataURL){ resolve(false); return; }
    const img=new Image();
    img.onload=()=>{
      pdfCv.width=img.naturalWidth; pdfCv.height=img.naturalHeight;
      pdfCtx.clearRect(0,0,pdfCv.width,pdfCv.height);
      pdfCtx.drawImage(img,0,0);
      pdfW=pdfCv.width; pdfH=pdfCv.height;
      pdfCv.style.width=pdfW+'px'; pdfCv.style.height=pdfH+'px';
      // r065: drawCv(図形描画オーバーレイ)のサイズをpdfCvにピッタリ合わせるだけの
      // 修正(r022)では、PDF読込・方眼紙モード開始時に設定される「用紙外周への
      // DRAW_MARGIN_RATIO(40%)ぶんの余白」が再現されず、Vold読込後だけ作図エリア外に
      // 図形を置けない不具合の原因になっていた(マスター報告、山留や配置モードの
      // 修正とは無関係の別バグと判明)。PDF読込・方眼紙モードと全く同じ計算式で
      // dcOffX/dcOffY・drawCvサイズ・位置・transformOriginを再現する。
      const DRAW_MARGIN_RATIO = 0.4;
      const dcOffX = Math.round(pdfW * DRAW_MARGIN_RATIO);
      const dcOffY = Math.round(pdfH * DRAW_MARGIN_RATIO);
      window._dcOffX = dcOffX; window._dcOffY = dcOffY;
      drawCv.width = pdfW + dcOffX * 2; drawCv.height = pdfH + dcOffY * 2;
      drawCv.style.width = drawCv.width + 'px'; drawCv.style.height = drawCv.height + 'px';
      drawCv.style.position = 'absolute';
      drawCv.style.left = (-dcOffX) + 'px';
      drawCv.style.top = (-dcOffY) + 'px';
      drawCv.style.transformOrigin = dcOffX + 'px ' + dcOffY + 'px';
      resolve(true);
    };
    img.onerror=()=>resolve(false);
    img.src=dataURL;
  });
}

// r013: importCSV(ボタン経由)とloadVoldFile(スタート画面ドロップ経由)の
// 共通処理。旧実装は「保存時のscaleDenomでmm→px変換する前に、まだ現在の
// (保存時と異なりうる)scaleDenomのままshapesを変換し、その後でapplyScale()
// を呼んでscaleDenomだけ差し替える」という順序になっており、保存時と読込時で
// スケールが異なる場合にshapesのpx座標がズレるバグがあった。ここでは
// 「先にスケールを確定→その後にmm→pxへ変換」の順序に修正している。
async function applyVoldData(data, opts){
  // r043: opts.loadVec===false の時だけ、保存されている元図の線(vecSegsMm)を読み込まない(Voldファイル読込ダイアログの「元図の線を読込む」)。省略時は従来どおり読み込む
  const _loadVec = !(opts && opts.loadVec===false);
  if(!data.shapes)throw new Error('shapes not found');
  pushUndo();
  await loadBackgroundImageDataURL(data.backgroundImageDataURL);
  _gridPaperActive = !!data.gridPaperMode;
  // r025(マスター指示): 従来はdata.scale(画面表示用の文字列、sc-dのtextContentを
  // そのまま保存したもの)をapplyScale()でパースしていたが、縮尺未設定のまま
  // 保存されると"未設定"という文字列が入り、パース失敗時にapplyScaleが警告のみ
  // 出して無言で何もせず終わるため、読込前の古いscaleDenomが残ってしまう
  // バグがあった(マスター報告「時々縮尺がおかしくなる」の原因と判明)。
  // 常に信頼できる数値data.scaleDenomを直接復元し、表示文字列は補助的に使う。
  if(data.scaleDenom && !isNaN(data.scaleDenom) && data.scaleDenom>0){
    scaleDenom = Math.max(1, data.scaleDenom);
    const dispStr = data.scale || ('1/'+Math.round(scaleDenom));
    document.getElementById('sc-input').value = dispStr;
    document.getElementById('sc-d').textContent = dispStr;
    hlScBtn(dispStr);
  } else if(data.scale){
    applyScale(data.scale); // scaleDenom未保存の旧形式ファイル向けフォールバック
  }
  // r026(30回目セッション、マスター指摘対応): if(data.concThick)だと
  // concThick===0(捨てコン+砕石=0mm、今回のマスターのテストデータがまさにこれ)が
  // JSでは falsy 扱いになり、条件がfalseになって復元がスキップされていた
  // (保存自体はr013時点からできていた=voldia_export.jsのsave側は元々正しい)。
  // globalOverdig/slopeAngleDeg側は既にtypeof+isNaNの正しい書き方だったので、
  // それに合わせる。
  if(typeof data.concThick==='number' && !isNaN(data.concThick)){
    if(typeof window._setMmInput==='function') window._setMmInput('conc-thick', data.concThick); // r045: 桁区切り表示・負の値は0(トーストなし)
    else document.getElementById('conc-thick').value = data.concThick;
  }
  // r074マスター指示: 余掘り・法面角度(勾配)もVoldファイルから復元する。
  // 旧バージョンのVoldファイル(これらのキーが無い)を読んでも壊れないよう、値が
  // 無い場合はUIのデフォルト値(#global-overdigのvalue属性・45°)をそのまま維持する。
  if(typeof data.globalOverdig==='number' && !isNaN(data.globalOverdig)){
    if(typeof window._setMmInput==='function') window._setMmInput('global-overdig', data.globalOverdig); // r045: 同上
    else document.getElementById('global-overdig').value = data.globalOverdig;
  }
  if(typeof data.slopeAngleDeg==='number' && !isNaN(data.slopeAngleDeg)){
    slopeAngleDeg = data.slopeAngleDeg;
    document.querySelectorAll('.slope-ang-btn').forEach(b=>{
      const on = parseInt(b.dataset.ang)===slopeAngleDeg;
      b.style.background = on ? 'var(--accent)' : '#2a2a2a';
      b.style.color = on ? '#000' : '#aaa';
      b.style.borderColor = on ? 'var(--accent)' : '#3a3a3a';
      b.style.fontWeight = on ? 'bold' : 'normal';
      b.classList.toggle('active', on);
    });
  }
  // r038(37回目): 現状地盤GLを復元する。キーが無い旧ファイルは0に戻す(直前に開いていたファイルの値が
  // 残って別ファイルの土量に混ざらないよう、「読込=状態を確定させる」扱いにする)。表示と適用値を必ず揃える。
  {
    const _g = (typeof data.glOffsetMm==='number' && !isNaN(data.glOffsetMm)) ? Math.round(data.glOffsetMm) : 0;
    window._glOffsetMm = _g;
    const _glEl = document.getElementById('gl-offset-mm');
    if(_glEl) _glEl.value = (_g>=0?'+':'') + _g;
  }
  // r042(40回目): 作成方法(calcMode)を復元。キーが無い旧ファイルは既定の土量計算に戻す(GLと同じく「読込=状態を確定」扱い)。
  {
    const _cm = (data.calcMode==='normal') ? 'normal' : 'doboku';
    window._genMode = _cm;
    if(typeof window._gmApplyMode==='function') window._gmApplyMode(_cm);
  }
  // r020(至急修正): 読込後にスタート画面の「PDFをD&D」表示が消えず、作図画面に
  // 進めなかったバグを修正。PDF読込(loadPDF)・方眼紙モード開始(startGridPaperMode)
  // は成功時にdrop-hintを隠しているが、applyVoldDataだけ隠し忘れていた。
  document.getElementById('drop-hint').style.display='none';
  document.getElementById('grid-paper-btn').style.display='none';
  if(typeof hideUiBlockOverlays==='function') hideUiBlockOverlays();

  // v0.0013: mm座標から現在モードのpx座標に変換
  const mmToPx=(mm)=>mm*RS*72/(25.4*scaleDenom);

  shapes=data.shapes.map(sh=>{
    let pts;
    if(sh.ptsMm && sh.ptsMm.length >= 3){
      pts = sh.ptsMm.map(p=>({x:mmToPx(p.x), y:mmToPx(p.y)}));
    } else {
      const savedDenom = data.scaleDenom||scaleDenom;
      const savedRS = 4;
      const ratio = (RS / savedRS) * (savedDenom / scaleDenom);
      pts = (sh.pts||[]).map(p=>({x:p.x*ratio, y:p.y*ratio}));
    }
    return {
      type:sh.type||'poly',
      pts,
      holesMm:sh.holesMm||[],
      holes:(sh.holes||[]).map(h=>h.map(p=>({x:mmToPx(p.x||0), y:mmToPx(p.y||0)}))),
      area:calcArea(pts),
      depthBeam:sh.depthBeam||'1800',
      topLevel:sh.topLevel||'0',
      overdig:sh.overdig||'0',
      noSlope:sh.noSlope!==undefined?sh.noSlope:true,
      color:sh.color||'blue',
      enabled:sh.enabled!==false,
      name:sh.name||''
    };
  });
  // r013: 同梱されていた配置モードのオブジェクトは、次に配置モードを
  // 開いた時に一度だけ復元する（今開いていなくても保留しておく）
  _pendingPlacementRestore = data.placementObjects || null;
  // r024(AreCal移植): 測点もmm→px変換して復元
  surveyPts = (data.surveyPts||[]).map(p=>({x:mmToPx(p.x), y:mmToPx(p.y)}));
  // r037: 山留もmm→px変換して復元(従来復元されていなかったバグを修正)
  yamadome = (data.yamadome && data.yamadome.pts && data.yamadome.pts.length>=3)
    ? {pts: data.yamadome.pts.map(p=>({x:mmToPx(p.x), y:mmToPx(p.y)}))}
    : null;
  {
    const yb=document.getElementById('yamadome-btn');
    if(yb){yb.style.opacity=yamadome?'0.4':'';}
  }
  // r060: ノースアロー方位角・原点測点インデックスの復元（旧形式ファイルは0/nullにフォールバック）
  northAngleDeg = (typeof data.northAngleDeg==='number' && !isNaN(data.northAngleDeg)) ? data.northAngleDeg : 0;
  originSurveyIdx = (typeof data.originSurveyIdx==='number' && surveyPts[data.originSurveyIdx]) ? data.originSurveyIdx : null;
  if(typeof updateNorthArrowUI==='function') updateNorthArrowUI();
  // r089(24回目・追加修正・項目5): 保存されていた元図ベクター線データ(mm座標)を
  // px座標に戻してvecSegs/vecPtsを復元し、buildVecGrid()で空間インデックスを
  // 再構築する。旧形式のVoldファイル(vecSegsMm未保存)はvecSegs=[]のままになり、
  // 元図スナップは単に効かない状態に留まる(壊れはしない)。
  if(_loadVec && data.vecSegsMm && data.vecSegsMm.length){
    vecSegs = data.vecSegsMm.map(s=>({
      a:{x:mmToPx(s.a.x), y:mmToPx(s.a.y)},
      b:{x:mmToPx(s.b.x), y:mmToPx(s.b.y)}
    }));
    const u=[];
    for(const l of vecSegs){
      for(const p of [l.a,l.b]){
        if(!u.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<2))u.push(p);
      }
    }
    vecPts=u;
    buildVecGrid();
  } else {
    vecPts=[];vecSegs=[];vecGrid=null;
  }
  // r041: toolsLocked=false; を削除(変数ごと廃止。voldia_main.js の【r042 削除一覧】参照)
  updSidebar();redraw();fitScreen();
  toast('📥 Voldファイル読込完了 — '+shapes.length+'図形'+(data.backgroundImageDataURL?'・背景あり':''));
}

function importCSV(){
  const f=document.getElementById('imp-in').files[0];
  if(!f)return;
  const r=new FileReader();
  r.onload=async e=>{
    try{
      const data=JSON.parse(e.target.result);
      await applyVoldData(data);
    }catch(ex){alert('読込エラー: '+ex.message);}
  };
  r.readAsText(f);
  document.getElementById('imp-in').value='';
}

// 【r043 削除】loadVoldFile(file): スタート画面のドロップ/選択から.voldを読み込んでいた関数(FileReader→JSON.parse→applyVoldData)。
//  Voldファイル読込ダイアログ化(voldia_main.js r046 _openVoldDialog)で、読込・解析・適用をmain側が行うようになり呼び出し元が無くなった。
//  (ボタン経由のimportCSVは別経路のまま残してある)

// ================================================================
//  Fix11: Excel出力（SheetJS CSV形式で代替、xlsxライブラリなし）
// ================================================================
function exportXlsx(){
  const sc=document.getElementById('sc-d').textContent||'未設定';
  const conc=( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
  const hdr=['オブジェクト名','色','面積(m2)','躯体下端GL-(mm)','余掘り(mm)','法面','実掘深さ(mm)','備考'];
  const rowsArr=[
    ['※ この表はオブジェクト単体の寸法です。Unionされた値ではありません。'],
    [],
    hdr
  ];
  shapes.forEach((sh,i)=>{
    const colName=SHAPE_COLORS[sh.color||'blue']?.label||sh.color||'青';
    const d=parseFloat(sh.depthBeam)||0;
    rowsArr.push([
      sh.name||('図形'+(i+1)),colName,sh.area.toFixed(4),
      sh.depthBeam||'1800',sh.overdig||'200',
      sh.noSlope?'なし（四角柱）':'あり（45°法面）',
      (d+conc).toString(),sh.enabled===false?'非表示':''
    ]);
  });
  rowsArr.push([]);
  rowsArr.push(['スケール',sc,'捨コン+砕石(mm)',conc.toString()]);
  rowsArr.push(['合計面積(m2)',calcSum().toFixed(4)]);
  const csvLines=rowsArr.map(r=>r.map(v=>{
    const s=String(v);
    return '"'+s.split('"').join('""')+'"';
  }).join(','));
  const csv='\uFEFF'+csvLines.join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:'VOLDIA_'+getVoldiaTimestamp()+'.csv'});
  a.click();URL.revokeObjectURL(url);
  toast('Excel用CSV出力完了（Excelで開けます）');
}

function exportDXF3D(){
  const fs=getAllFrustums();
  if(!fs.length){toast('⚠ 深さが入力された図形がありません','e');return;}
  const conc=getConcThick();
  const DXF_LAYER_TOP='00_Tenba';
  const DXF_LAYER_BOTTOM='00_Sitaba';

  function L(code,val){return code+'\r\n'+val+'\r\n';}
  let d='';
  d+=L(0,'SECTION');d+=L(2,'HEADER');
  d+=L(9,'$ACADVER');d+=L(1,'AC1009');
  d+=L(0,'ENDSEC');
  d+=L(0,'SECTION');d+=L(2,'TABLES');
  // r088(24回目・DXF不具合修正): レイヤー構成を「天端」「下端」の2層のみに簡素化。
  // 旧SLOPE(法面上端)・SLOPELN(法面稜線)は廃止(マスター指示)。
  // レイヤー名はASCII固定(00_Tenba/00_Sitaba)。この書き出し関数は最後に
  // charset=utf-8でエンコードしているが、R12(AC1009)のASCII DXFは本来
  // システムコードページ前提の仕様で、UTF-8の日本語レイヤー名は読み込み側の
  // CADソフトによって文字化けする実害リスクが高い(コードページ宣言$DWGCODEPAGEも
  // このwriterには無い)。安全側としてASCII名をデフォルトにした。日本語名
  // (00_天端/00_下端)に確実に対応させたい場合は別途相談。
  d+=L(0,'TABLE');d+=L(2,'LAYER');d+=L(70,'2');
  d+=L(0,'LAYER');d+=L(2,DXF_LAYER_TOP);   d+=L(70,'64');d+=L(62,'7');d+=L(6,'CONTINUOUS'); // 白:天端
  d+=L(0,'LAYER');d+=L(2,DXF_LAYER_BOTTOM);d+=L(70,'64');d+=L(62,'5');d+=L(6,'CONTINUOUS'); // 青:下端
  d+=L(0,'ENDTAB');
  d+=L(0,'TABLE');d+=L(2,'LTYPE');d+=L(70,'1');
  d+=L(0,'LTYPE');d+=L(2,'CONTINUOUS');d+=L(70,'64');d+=L(3,'Solid line');d+=L(72,'65');d+=L(73,'0');d+=L(40,'0.0');
  d+=L(0,'ENDTAB');
  d+=L(0,'ENDSEC');
  d+=L(0,'SECTION');d+=L(2,'BLOCKS');d+=L(0,'ENDSEC');
  d+=L(0,'SECTION');d+=L(2,'ENTITIES');

  const M=0.001; // mm→m

  function writePoly2D(layer,aci,pts,z){
    // r089(24回目・追加修正・項目1): ブラウザcanvas座標(Y下向き・原点左上)と
    // CAD座標(Y上向き・原点左下)のY軸方向が逆なため、DXF書き出し時にY符号を
    // 反転して合わせる。offsetPolygon等の輪郭計算はすべてこの反転より前の
    // 元座標系で完結しているので、ここで反転しても計算結果自体には影響しない
    // (ミラー変換は「内側/外側」の関係を保つため、オフセット方向も正しいまま)。
    d+=L(0,'POLYLINE');d+=L(8,layer);d+=L(62,aci);d+=L(6,'CONTINUOUS');
    d+=L(66,'1');d+=L(70,'1');
    d+=L(10,'0.0');d+=L(20,'0.0');d+=L(30,(z*M).toFixed(6));
    pts.forEach(p=>{
      d+=L(0,'VERTEX');d+=L(8,layer);
      d+=L(10,(p.x*M).toFixed(6));
      d+=L(20,(-p.y*M).toFixed(6));
      d+=L(30,(z*M).toFixed(6));
    });
    d+=L(0,'SEQEND');
  }

  fs.forEach((f)=>{
    // f.D は体積計算・3D表示用の「捨てコン+砕石込みの掘削深さ」。
    // DXF出力は躯体の実高さ（捨てコン等を含まない）で出す必要があるため、
    // ここだけ conc 厚みを差し引いた専用の深さを使う。
    const D=Math.max(0, f.D - conc); // 深さmm（捨てコン+砕石を除いた実高さ）
    // r088(24回目・DXF不具合修正): 天端Zが常に0固定になっていたバグを修正。
    // f.tl(オブジェクトごとの天端レベル、GL基準mm)をそのまま使う。
    // 下端Z = 天端 − 実高さ。
    const topZ = f.tl || 0;
    const bottomZ = topZ - D;
    // 天端ライン(00_天端)
    writePoly2D(DXF_LAYER_TOP,7,f.ptsMm,topZ);
    // 下端ライン(余掘り込みオフセット、00_下端)
    const bottomPts=offsetPolygon(f.ptsMm,f.OD);
    writePoly2D(DXF_LAYER_BOTTOM,5,bottomPts,bottomZ);
  });

  d+=L(0,'ENDSEC');d+=L(0,'EOF');

  const a=document.createElement('a');
  const ts=getVoldiaTimestamp();
  a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(d);
  a.download='Voldia_'+ts+'.DXF';
  a.click();
  toast('📐 DXF出力完了（R12互換・00_Tenba/00_Sitaba層）');
  // r088(24回目・項目4): 出力完了時点で「保存」ツールをキャンセルし、
  // ツール無選択状態に戻す(マスター指示)。
  if(typeof closeIoPanel==='function') closeIoPanel();
}

// GLB（ポリゴン実形状フラスタム）
function encodeMultiGLB(meshes){ // r048(41回目): 材質色を濃いグレーに変更(全GLB出力に共通: 通常計算/土量計算/データ出力ZIP)。下の GLB_BASE_COLOR 参照
  const enc=new TextEncoder();
  let binOffset=0;
  const bufViews=[],accessors=[],gltfMeshes=[],nodes=[],binParts=[];
  meshes.forEach((m,i)=>{
    const posB=m.positions.buffer.byteLength;
    // r030(30回目セッション、マスター指示「(A)は内側テクスチャ・(B)は外側テクスチャに
    // したい」への対応): エクスポート専用の巻き方向反転オプション。m.flipWindingが
    // trueの三角形は、頂点位置はそのままにindices内の2番目・3番目を入れ替えるだけで
    // 巻き方向(=法線の表裏)を反転できる。エビル(_evRunAnalysis)は面分類のために
    // 法線の向きを利用しているため、体積計算に使うGLB(buildVoldiaGLBBytes/
    // buildExistingStructureOverlapGLBBytesがそのまま返すglb/glbB)自体はここでは
    // 一切変更せず、ZIPに書き出す「見た目専用」のGLBだけをrunEvidenceAnalysis側で
    // 別途もう一度encodeMultiGLBに通して作る(meshesA/meshesBの生配列はr024で
    // 既に露出済みなので、そのコピーにflipWinding:trueを立てるだけで済む)。
    const srcIdx = m.indices;
    let outIdx = srcIdx;
    if(m.flipWinding){
      outIdx = new srcIdx.constructor(srcIdx.length);
      for(let t=0;t<srcIdx.length;t+=3){
        outIdx[t]=srcIdx[t]; outIdx[t+1]=srcIdx[t+2]; outIdx[t+2]=srcIdx[t+1];
      }
    }
    const idxB=outIdx.buffer.byteLength;
    let mnX=Infinity,mnY=Infinity,mnZ=Infinity,mxX=-Infinity,mxY=-Infinity,mxZ=-Infinity;
    for(let j=0;j<m.positions.length;j+=3){const x=m.positions[j],y=m.positions[j+1],z=m.positions[j+2];if(x<mnX)mnX=x;if(x>mxX)mxX=x;if(y<mnY)mnY=y;if(y>mxY)mxY=y;if(z<mnZ)mnZ=z;if(z>mxZ)mxZ=z;}
    bufViews.push({buffer:0,byteOffset:binOffset,byteLength:posB,target:34962});
    accessors.push({bufferView:bufViews.length-1,componentType:5126,count:m.positions.length/3,type:'VEC3',min:[mnX,mnY,mnZ],max:[mxX,mxY,mxZ]});
    binOffset+=posB;binParts.push(new Uint8Array(m.positions.buffer));
    // パディング（4バイトアライン）
    const posPad=(4-posB%4)%4;
    if(posPad>0){binOffset+=posPad;binParts.push(new Uint8Array(posPad));}
    bufViews.push({buffer:0,byteOffset:binOffset,byteLength:idxB,target:34963});
    // Uint32インデックス → componentType 5125
    accessors.push({bufferView:bufViews.length-1,componentType:5125,count:outIdx.length,type:'SCALAR'});
    binOffset+=idxB;binParts.push(new Uint8Array(outIdx.buffer));
    const idxPad=(4-idxB%4)%4;
    if(idxPad>0){binOffset+=idxPad;binParts.push(new Uint8Array(idxPad));}
    const pA=accessors.length-2,iA=accessors.length-1;
    gltfMeshes.push({name:m.name,primitives:[{attributes:{POSITION:pA},indices:iA,mode:4,material:0}]});
    nodes.push({name:m.name,mesh:i});
  });
  // r022(追5): マテリアル未指定だとビューア側の既定色（多くは白系）で表示され
  // 見えにくいという指摘への対応。濃い目のグレーのPBRマテリアルを付与する。
  // r048: 材質色=濃いグレー。glTFのbaseColorFactorはリニア値で、従来の(0.32,0.33,0.36)は見た目が約#999の明るいグレーのため、
  //   PowerPointで照明が当たると白っぽく、紙に印刷すると見にくかった(マスター指摘)。見た目で約#464646。濃く/薄くしたい時はこの3つの数値だけ変える(0に近いほど黒)。
  const GLB_BASE_COLOR=[0.06,0.06,0.065,1.0];
  const materials=[{name:'VOLDIA_Gray',pbrMetallicRoughness:{baseColorFactor:GLB_BASE_COLOR,metallicFactor:0.05,roughnessFactor:0.85}}];
  const json={asset:{version:'2.0',generator:'VOLDIAM v0.2.0'},scene:0,scenes:[{name:'VOLDIAM_Scene',nodes:nodes.map((_,i)=>i)}],nodes,meshes:gltfMeshes,materials,accessors,bufferViews:bufViews,buffers:[{byteLength:binOffset}]};
  const jb=enc.encode(JSON.stringify(json)),jp=Math.ceil(jb.length/4)*4,bp=Math.ceil(binOffset/4)*4;
  const tl=12+8+jp+8+bp,buf=new ArrayBuffer(tl),dv=new DataView(buf);let off=0;
  dv.setUint32(off,0x46546C67,true);off+=4;dv.setUint32(off,2,true);off+=4;dv.setUint32(off,tl,true);off+=4;
  dv.setUint32(off,jp,true);off+=4;dv.setUint32(off,0x4E4F534A,true);off+=4;
  const jv=new Uint8Array(buf,off,jp);jv.set(jb);for(let i=jb.length;i<jp;i++)jv[i]=0x20;off+=jp;
  dv.setUint32(off,bp,true);off+=4;dv.setUint32(off,0x004E4942,true);off+=4;
  const bv=new Uint8Array(buf,off,bp);let bo=0;for(const p of binParts){bv.set(p,bo);bo+=p.byteLength;}
  return buf;
}

// Voldia版: GLB生成ロジックを共通化（GLB保存ボタンと配置モード起動の両方から使う）
async function buildVoldiaGLBBytes(progressCb, excludeExistingStruct){
  // r019(29回目セッション): excludeExistingStructパラメータ追加。マスター実測データで、
  // このパラメータが実装漏れ(コメントにはr018で追加済みと記載されていたが実コードに
  // 存在せず)のまま既存躯体が常にGLBへ混入していたことが判明。エビル(_evRunAnalysis)は
  // ノード名を区別せず全メッシュの面を一律解析するため、既存躯体の底面が「掘削底」として
  // 加算され、かつ掘削(青)と既存躯体(グレー)の隣接境界に生じる余分な傾斜面まで
  // 「入隅部」として誤集計されていた(27回目セッションで特定済みの①②と同一の再発)。
  // runEvidenceAnalysis側でmode==='earthwork'の時だけtrueを渡す。
  const fs=getAllFrustums();if(!fs.length)throw new Error('図形がありません');
  let exportGeoms=null;
  let existingStructGeoms=null;
  if(_lastGeoms&&_lastGeoms.length>0){
    exportGeoms=_lastGeoms;
  }else{
    if(progressCb)progressCb(20,'Unionを計算中...');
    // r065(AIS修正案): GLB出力経路でも山留オフセットを渡す(fsは直前取得なので_offsetX/_offsetYが健在)
    const res=await buildUnionFrustumGeometry(fs, fs._offsetX||0, fs._offsetY||0);
    if(res.error)throw new Error(res.error);
    exportGeoms=res.unionGeoms||(res.unionGeom?[res.unionGeom]:res.geoms);
  }
  // r010(27回目セッション): 既存躯体だけは_lastExistingStructGeomsキャッシュに依存せず、
  // ここで毎回fsから直接作り直す。以前(19回目セッション)にも同種のキャッシュ起因の
  // 「配置モードだけ古い状態のまま」不具合が報告された地雷ポイントであり、既存躯体の
  // ジオメトリ生成自体は軽量(重いManifold Union計算を伴わない単純立体)なので、
  // キャッシュの恩恵よりも常に最新であることの安全性を優先する。
  // r011: getAllFrustums()が返す生のfrustumはD=tl-b+concVal(捨てコン厚さ込み)の
  // ままなので、runCalc()側のr005修正と同じ理屈で、既存躯体だけ捨てコン分を
  // 差し引いてD=tl-bに戻す(仕様通り「描いた形状そのまま」)。これを忘れていたため、
  // 配置モードの既存躯体だけ下端が捨てコン厚さ分(既定110mm)深くなり、地形の床面と
  // 高さが一致してz-fighting(白い板が浮いて見える不具合)を起こしていた。
  const _concVal = ( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
  // r035(36回目): 土量計算(doboku)後のみ、既存躯体の底面を最深まで延長(底面∞)。
  // 通常計算後(structure解析等)は従来通り。最深値の算出は共通関数に一本化(voldia3d.js r100)。
  const _siteBotEs = (window._lastCalcModeForPlacement === 'doboku')
    ? computeDobokuSiteBottomFromRaw(fs, _concVal, window._glOffsetMm||0) : null;
  existingStructGeoms = excludeExistingStruct ? [] : fs.filter(f=>f.color==='gray')
    .map(f => {
      let g = {...f, D: f.D - _concVal, noSlope:true, OD:0};
      // r036(37回目): 土量計算(doboku)でGL≠0の時は、runCalc本体(voldia3d.js r107)と同じ手順で
      // 既存躯体を「現状地盤=0」の座標系へ揃える(GL基準で切り下げ→-glOff平行移動)。
      // これを忘れると配置モードの既存躯体だけGL基準のままになり、青・山留と高さが食い違う。
      if(_siteBotEs !== null && window._glOffsetMm){
        const _glOff = window._glOffsetMm, _tl0 = g.tl||0, _bot = _tl0 - g.D;
        const _clip = Math.min(_tl0, _glOff);
        if(!(_clip - _bot > 0)) return null;                 // runCalcと同じ: 深さ0以下は対象外
        g = {...g, tl: _clip - _glOff, D: _clip - _bot};
      }
      if(_siteBotEs !== null) g = extendGrayToBottomMm(g, _siteBotEs);
      return buildFrustumGeometry(g);
    })
    .filter(g => g && g.positions && g.positions.length);
  if(!exportGeoms||!exportGeoms.length)throw new Error('先に「計算」ボタンを押してください');
  if(progressCb)progressCb(40,'メッシュを結合中...');
  let totalVerts=0,totalTris=0;
  for(const g of exportGeoms){totalVerts+=g.positions.length/3;totalTris+=g.indices.length/3;}
  const mergedPos=new Float32Array(totalVerts*3);
  const mergedIdx=new Uint32Array(totalTris*3);
  let vOff=0,iOff=0;
  for(const g of exportGeoms){
    const vc=g.positions.length/3;
    for(let j=0;j<g.positions.length;j++) mergedPos[vOff*3+j]=g.positions[j]*S;
    for(let j=0;j<g.indices.length;j++) mergedIdx[iOff+j]=g.indices[j]+vOff;
    vOff+=vc; iOff+=g.indices.length;
  }
  if(progressCb)progressCb(70,'GLBエンコード中...');
  const meshes=[{name:'Voldia_Union',positions:mergedPos,indices:mergedIdx}];
  // 26回目セッション新規: 既存躯体(グレー)はVoldia_Unionとは別の専用ノードとして
  // 出力する(r051のVoldia_FixedObjects分離と全く同じ理由: 掘削シェルと接続
  // しない独立ソリッドを混ぜると、配置モード側の境界ループ検出が誤動作するため)
  if(existingStructGeoms && existingStructGeoms.length){
    let esVerts=0, esTris=0;
    for(const g of existingStructGeoms){esVerts+=g.positions.length/3; esTris+=g.indices.length/3;}
    const esPos=new Float32Array(esVerts*3);
    const esIdx=new Uint32Array(esTris*3);
    let evOff=0, eiOff=0;
    for(const g of existingStructGeoms){
      const vc=g.positions.length/3;
      for(let j=0;j<g.positions.length;j++) esPos[evOff*3+j]=g.positions[j]*S;
      for(let j=0;j<g.indices.length;j++) esIdx[eiOff+j]=g.indices[j]+evOff;
      evOff+=vc; eiOff+=g.indices.length;
    }
    meshes.push({name:'Voldia_ExistingStructure', positions:esPos, indices:esIdx});
    totalVerts+=esVerts; totalTris+=esTris;
  }
  if(progressCb)progressCb(85,'バイナリ生成中...');
  const glb=encodeMultiGLB(meshes);
  // r024(30回目セッション、マスター指示): (A)+(B)合体GLBを別途組み立てられるよう、
  // エンコード前の生メッシュ配列(meshes)もそのまま返す。encodeMultiGLBは何度呼んでも
  // 副作用がない純粋関数なので、ここで返したmeshesと(B)側のmeshesを連結してもう一度
  // 呼べば合体GLBが作れる(バイナリ同士を後から結合するより安全・低リスク)。
  return {glb, meshes, totalVerts, totalTris, offsetX: fs._offsetX||0, offsetY: fs._offsetY||0};
}

// r019(29回目セッション、段階2): (B)専用 — 掘削∩既存躯体の重複ソリッドのみを
// 単体GLB化する。マスター方針(2026-09-15)により3D側の計算(_calcExistingStructureOverlapVolume
// など)とは完全に独立させ、voldia3d.js側で新設したbuildExistingStructureOverlapMesh
// (表示用オフセット非継承、実断面そのまま)をそのままGLB化するだけ。
// エビルの2パス目(B)用の入力として使う想定。重複が実在しない場合(overlap無し)はnullを返す。
// r020(29回目セッション): マスター実測データで発覚した2件のバグを修正。
// ①buildVoldiaGLBBytes(r011)と同じ理由で、getAllFrustums()が返す既存躯体のDは
//   D=tl-b+捨てコン厚さのままなので、捨てコン分を差し引いてD=tl-bに戻す必要が
//   あったのに、前回(段階2)は素通しにしていた
// ②もっと重大な見落とし: runCalc()内では計算モード(normal/doboku)に応じて
//   fs全体にnoSlope/OD(法面・余掘り)の上書きが適用されている(1970行目・1976行目)。
//   ところがこの関数はgetAllFrustums()の生フラスタムを直接使っていたため、
//   実際の掘削形状(法面あり・OD=200mm等)と全く違う、生データそのまま
//   (noSlope:true・OD:0)の形状で重複計算してしまっていた。マスターが実機で
//   「B側GLBが根切形状の外まではみ出て見える」と報告したのはこれが原因。
//   window._lastCalcModeForPlacementに直近runCalc()時のmodeが残るので、
//   同じ上書きロジックをここでも再現する(計算未実行でnullの場合は上書きなし)。
async function buildExistingStructureOverlapGLBBytes(progressCb){
  const calcMode = window._lastCalcModeForPlacement;
  let fs, excavFrustums, structFrustums;
  // r037(37回目): 土量計算(doboku)後は、runCalcが確定済みのfs(キャッシュ)をそのまま使う。
  // 旧実装は生frustum(getAllFrustums)から「天端0正規化・GL加算・既存躯体の切り下げ/平行移動・底面∞」を
  // 自前で再現していたが、現状地盤GL≠0の時に再現が食い違い、(B)だけ深さ・形状が異常になった
  // (掘削土量解析.glbのVoldia_OverlapForExcelで最深が-2.2mになっていた不具合。正しくは-0.7m)。
  // 体積計算(runCalc→buildUnionFrustumGeometry)と同じ入力を使うので、基準値との食い違いも原理的に起きない。
  const _cacheFs = window._lastCalcFrustumsForLandLogic;
  if(calcMode==='doboku' && Array.isArray(_cacheFs) && _cacheFs.length){
    fs = _cacheFs.slice();
    fs._offsetX = window._lastCalcOffsetXForLandLogic || 0;
    fs._offsetY = window._lastCalcOffsetYForLandLogic || 0;
    excavFrustums = fs.filter(f=>f.color!=='gray');
    structFrustums = fs.filter(f=>f.color==='gray');
    if(!structFrustums.length) return null;
  }else{
  const fsRaw=getAllFrustums(); if(!fsRaw.length) return null;
  fs = fsRaw;
  if(calcMode==='normal'){
    fs = fs.map(f=>({...f, noSlope:true}));
  } else if(calcMode==='doboku'){
    const globalOD=( v => isNaN(v) ? 200 : Math.max(0,v))(parseInputNum(document.getElementById('global-overdig')));
    fs = fs.map(f=>({...f, noSlope:(f.color==='purple'), OD:globalOD}));
  }
  fs._offsetX = fsRaw._offsetX; fs._offsetY = fsRaw._offsetY;

  excavFrustums = fs.filter(f=>f.color!=='gray');
  const _concVal = ( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
  structFrustums = fs.filter(f=>f.color==='gray').map(f=>({...f, D: f.D - _concVal}));
  if(!structFrustums.length) return null;
  // r035(36回目): 土量計算(doboku)後のみ、既存躯体の底面∞。この関数のfsは生frustum系の座標
  // (botDepth=D-tl)なので、同じ座標系の掘削+既存躯体から最深を求めて余白0で揃える。
  if(window._lastCalcModeForPlacement === 'doboku'){
    const _siteBotB = siteDeepestBottomMm(excavFrustums.concat(structFrustums));
    structFrustums = structFrustums.map(f => extendGrayToBottomMm(f, _siteBotB));
  }
  }
  if(progressCb) progressCb(20,'(B)重複ソリッドを計算中...');
  const geom = buildExistingStructureOverlapMesh(excavFrustums, structFrustums, fs._offsetX||0, fs._offsetY||0);
  if(!geom || !geom.attributes || !geom.attributes.position || !geom.attributes.position.count) return null;
  const rawPos = geom.attributes.position.array;
  const rawIdx = geom.index.array;
  const positions = new Float32Array(rawPos.length);
  for(let j=0;j<rawPos.length;j++) positions[j]=rawPos[j]*S;
  if(progressCb) progressCb(70,'(B)GLBエンコード中...');
  const meshes=[{name:'Voldia_OverlapForExcel', positions, indices: rawIdx}];
  const glb=encodeMultiGLB(meshes);
  // r127(45回目): 差引後(C)専用に、(B)と同じstructFrustumsから既存躯体(グレー)のソリッド(1個ずつ)も返す。
  // (C)=A-Bだと、Aの外壁(山留バッチ角1°・微テーパー15mmで傾く)とBの壁(垂直)が食い違い、差引後に5〜50mmの薄い楔が壁として残って
  // 既存躯体の部分が箱のように見える(底が抜けて見える)。既存躯体の実体Gは掘削の外まで広がっているので、A-Gなら楔が出ない。
  // (A)(B)の出力・解析にはこの戻り値は一切使わない。作れなければ空配列(=従来のA-B)。
  let structMeshes=[];
  try{
    structMeshes = structFrustums.map(f=>{
      const gg = buildFrustumGeometry({...f, noSlope:true, OD:0});
      if(!gg || !gg.positions || !gg.positions.length) return null;
      const gp = new Float32Array(gg.positions.length);
      for(let j=0;j<gp.length;j++) gp[j]=gg.positions[j]*S;
      return {name:'Voldia_ExistingStructure', positions:gp, indices:Uint32Array.from(gg.indices)};
    }).filter(Boolean);
  }catch(e){ console.warn('[C側] 既存躯体ソリッドの生成に失敗(従来のA-Bで続行):', e); structMeshes=[]; }
  // 【診断用・段階2検証後に撤去】既存躯体表示に使う正式な基準値
  // (window._lastCalcABBreakdown.existingOverlapM3、r017でrunCalc()内に既に用意されている
  // ものを流用)とこのGLBの体積を突き合わせ、法面込みでも一致するか確認する
  try{
    const _diagVol = _diagMeshVolume(geom);
    const _refVol = window._lastCalcABBreakdown ? window._lastCalcABBreakdown.existingOverlapM3 : null;
    console.log('[DIAG-B-GLB] 基準値(_lastCalcABBreakdown.existingOverlapM3)='+(_refVol==null?'未計算':_refVol.toFixed(4))+'m³ / (B)GLBメッシュ体積='+_diagVol.toFixed(4)+'m³'+(_refVol==null?'':' / 差='+(_diagVol-_refVol).toFixed(4)+'m³'));
  }catch(e){ console.warn('[DIAG-B-GLB] 検証ログでエラー:', e); }
  // r024(30回目セッション、マスター指示): (A)+(B)合体GLB組み立て用に生meshesも返す
  return {glb, meshes, structMeshes, totalVerts: positions.length/3, totalTris: rawIdx.length/3};
}

// r075: 通常計算後に配置モードを開く専用のGLB生成。
// 土量計算(buildVoldiaGLBBytes)は「Union結合済みの地形そのもの」を配置モードの地面として渡すが、
// 通常計算の_lastGeomsは各オブジェクトの押し出し立体そのものであり、これをそのまま地面として
// 渡すとオブジェクトの数だけy=0付近に別々の輪郭が発生し、配置モード側のcustomGround境界検出
// (面積最大ループ=外周とみなすヒューリスティック)が誤動作する。そこで
//  ①全オブジェクトのXZ包絡矩形ぴったりの単純な平面(Voldia_GLPlane)を「地面」として別メッシュで用意し、
//  ②押し出しオブジェクト自体(Voldia_FixedObjects)は別ノードとして同じGLBに含める
// という2ノード構成にし、配置モード側で名前によって処理を分岐させる(loadTerrainFromArrayBuffer参照)。
async function buildNormalCalcPlacementGLB(){
  const fs=getAllFrustums();if(!fs.length)throw new Error('図形がありません');
  let exportGeoms=null;
  if(_lastGeoms&&_lastGeoms.length>0){
    exportGeoms=_lastGeoms;
  }else{
    throw new Error('先に「計算」ボタンを押してください');
  }
  // 全オブジェクトのXZ包絡矩形を求める(生のmm座標系のまま)
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const g of exportGeoms){
    const pos=g.positions;
    for(let j=0;j<pos.length;j+=3){
      const x=pos[j], z=pos[j+2];
      if(x<minX)minX=x; if(x>maxX)maxX=x;
      if(z<minZ)minZ=z; if(z>maxZ)maxZ=z;
    }
  }
  if(!isFinite(minX)) throw new Error('図形の範囲を取得できませんでした');

  // ①GL平面(y=0、オブジェクト包絡矩形ぴったり。周辺拡張は配置モード側のcustomGroundに任せる)
  const planePosRaw=new Float32Array([
    minX,0,minZ,  maxX,0,minZ,  maxX,0,maxZ,  minX,0,maxZ
  ]);
  const planeIdx=new Uint32Array([0,1,2, 0,2,3]);
  const planePos=new Float32Array(planePosRaw.length);
  for(let j=0;j<planePosRaw.length;j++) planePos[j]=planePosRaw[j]*S;

  // ②押し出しオブジェクト本体(既存のUnion結合ロジックをそのまま流用)
  let totalVerts=0,totalTris=0;
  for(const g of exportGeoms){totalVerts+=g.positions.length/3;totalTris+=g.indices.length/3;}
  const objPos=new Float32Array(totalVerts*3);
  const objIdx=new Uint32Array(totalTris*3);
  let vOff=0,iOff=0;
  for(const g of exportGeoms){
    const vc=g.positions.length/3;
    for(let j=0;j<g.positions.length;j++) objPos[vOff*3+j]=g.positions[j]*S;
    for(let j=0;j<g.indices.length;j++) objIdx[iOff+j]=g.indices[j]+vOff;
    vOff+=vc; iOff+=g.indices.length;
  }

  // 次の段階(2026-08-25引継ぎ18回目マスター確定仕様): 通常計算は形状(体積・押し出し形)
  // 自体は変えない(mode==='normal'は非対象のまま)。その代わり、配置モードに設置される
  // Voldia_FixedObjects本体の「高さ」だけをGLオフセット分ずらす。
  //   GL+(地盤面が高い) → オブジェクトは相対的に下げる(Y減)
  //   GL-(地盤面が低い) → オブジェクトは相対的に上げる(Y増)
  // Y_new = Y_old − offsetMm。GLPlane(地面)側はy=0のまま動かさない。
  if(window._glOffsetMm){
    const offMmS = window._glOffsetMm * S;
    for(let j=1;j<objPos.length;j+=3){ objPos[j] -= offMmS; }
  }

  const meshes=[
    {name:'Voldia_GLPlane', positions:planePos, indices:planeIdx},
    {name:'Voldia_FixedObjects', positions:objPos, indices:objIdx}
  ];
  // 26回目セッション新規: 既存躯体(グレー)もVoldia_FixedObjectsと同じ理由
  // (境界検出誤動作防止)で別ノード化。GLオフセットもFixedObjectsと同様に適用する。
  // r010(27回目セッション): buildVoldiaGLBBytesと同様の理由で、キャッシュ
  // (_lastExistingStructGeoms)には依存せず、ここでfsから直接作り直す。
  // r011: 捨てコン厚さの除外漏れ修正(理由はbuildVoldiaGLBBytes側のr011コメント参照)
  const _concVal2 = ( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
  const _existingStructGeomsFresh = fs.filter(f=>f.color==='gray')
    .map(f => buildFrustumGeometry({...f, D: f.D - _concVal2, noSlope:true, OD:0}))
    .filter(g => g.positions && g.positions.length);
  if(_existingStructGeomsFresh.length){
    let esVerts=0, esTris=0;
    for(const g of _existingStructGeomsFresh){esVerts+=g.positions.length/3; esTris+=g.indices.length/3;}
    const esPos=new Float32Array(esVerts*3);
    const esIdx=new Uint32Array(esTris*3);
    let evOff=0, eiOff=0;
    for(const g of _existingStructGeomsFresh){
      const vc=g.positions.length/3;
      for(let j=0;j<g.positions.length;j++) esPos[evOff*3+j]=g.positions[j]*S;
      for(let j=0;j<g.indices.length;j++) esIdx[eiOff+j]=g.indices[j]+evOff;
      evOff+=vc; eiOff+=g.indices.length;
    }
    if(window._glOffsetMm){
      const offMmS = window._glOffsetMm * S;
      for(let j=1;j<esPos.length;j+=3){ esPos[j] -= offMmS; }
    }
    meshes.push({name:'Voldia_ExistingStructure', positions:esPos, indices:esIdx});
  }
  const glb=encodeMultiGLB(meshes);
  return {glb, offsetX: fs._offsetX||0, offsetY: fs._offsetY||0};
}

async function exportGLB(){
  const btn=document.getElementById('btn-glb');if(btn)btn.disabled=true;
  document.getElementById('exp-prog').classList.add('show');
  epSet(0,'Union水密メッシュを準備中...');
  await new Promise(r=>setTimeout(r,20));
  try{
    const {glb, totalVerts, totalTris} = await buildVoldiaGLBBytes(epSet);
    epSet(100,'完了！');
    const blob=new Blob([glb],{type:'model/gltf-binary'});
    const url=URL.createObjectURL(blob);
    const a=Object.assign(document.createElement('a'),{href:url,download:'VoldiaGLB_'+getVoldiaTimestamp()+'.glb'});
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    if(btn)btn.disabled=false;
    document.getElementById('exp-prog').classList.remove('show');
    toast(`📦 GLB出力完了（Union水密: ${totalVerts}頂点 / ${totalTris}三角形）`);
  }catch(e){
    console.error(e);
    document.getElementById('exp-prog').classList.remove('show');
    if(btn)btn.disabled=false;
    toast('⚠ Objectエラー！表示出来ません', 4000);
  }
}

// Voldia版: オブジェクト配置モード（開発中）を別タブで起動し、現在のGLBデータをpostMessageで渡す
// r126(44回目): 配置モードへ移る時の「読み込み中……」画面。初回は配置モードのiframe(three.js等をCDNから読む)が立ち上がるまで数秒、
//   画面が真っ暗に見えていた。地形GLBの生成開始〜配置モード側の準備完了(voldia-placement-ready)まで全面に出す。
//   万一の取りこぼしに備え、60秒で必ず消す。
function _pmLoadingShow(){
  let e=document.getElementById('pm-loading');
  if(!e){
    e=document.createElement('div'); e.id='pm-loading';
    e.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:100001;background:rgba(10,10,10,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#ddd;font-size:1.3em;letter-spacing:.12em;';
    e.innerHTML='<div class="bl-spin"></div><div>読み込み中……</div>';
    document.body.appendChild(e);
  }
  clearTimeout(window._pmLoadingTimer);
  window._pmLoadingTimer=setTimeout(_pmLoadingHide,60000);
}
function _pmLoadingHide(){
  clearTimeout(window._pmLoadingTimer);
  const e=document.getElementById('pm-loading'); if(e&&e.parentNode) e.parentNode.removeChild(e);
}
async function openPlacementMode(){
  const btn=document.getElementById('btn-placement');
  if(btn)btn.disabled=true;
  try{
    _pmLoadingShow(); // r126: 読み込み中……画面
    toast('🏗 配置モード用の地形データを準備中...', 2500);
    // r075: 通常計算後は「GL平面+押し出しオブジェクト固定表示」、土量計算後は従来通り地形Unionを渡す
    const _isNormalPlacement = (window._lastCalcModeForPlacement === 'normal');
    const {glb, offsetX, offsetY} = _isNormalPlacement
      ? await buildNormalCalcPlacementGLB()
      : await buildVoldiaGLBBytes(null); // encodeMultiGLB()は素のArrayBufferを返す
    // r035(36回目マスター仕様): 土量計算後の配置モードへ移動するたび、既存躯体が1個以上あれば
    // 毎回トーストを出す(底面∞の適用を知らせる。オブジェクトごとの印は付けない)。
    if(!_isNormalPlacement && getAllFrustums().some(f=>f.color==='gray')){
      toast('既存躯体の底面は、最深の掘削底まで∞(延長)として扱われます', 3600, 'graystruct');
    }

    // Voldia版: 同一ページ内にiframeでオーバーレイ表示（別タブ方式はポップアップブロック等が
    // 面倒なため見送り。iframeなら別タブと同じくJSのグローバル変数が衝突せず、テストも1画面で完結する）
    // r011: 「戻る」ボタンは配置モード側(#voldia-back-btn)の1つに統一。
    // 従来ここにあった本体側の赤い外側ボタンは、配置モードのPLANパネルに
    // 重なって表示される問題があったため撤去し、代わりに配置モード側の
    // ボタンが送るpostMessage('voldia-placement-close')をここで受け取って
    // オーバーレイを閉じる形にした。
    // r016: 従来は再オープンのたびにiframe.srcを再読込しており、地形は
    // 最新化される一方で配置済みオブジェクトが全て消えてしまっていた。
    // loadTerrainFromArrayBuffer()はplacedObjects配列に一切触れないことを
    // 確認済みなので、既存iframeは生かしたまま地形データだけpostMessageで
    // 直接送り直す形に変更し、配置済みオブジェクトをタブを閉じるまで
    // 保持できるようにした。
    let wrap=document.getElementById('placement-overlay');
    const isFirstOpen = !wrap;
    if(isFirstOpen){
      wrap=document.createElement('div');
      wrap.id='placement-overlay';
      wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:#000;';
      const iframe=document.createElement('iframe');
      iframe.id='placement-iframe';
      iframe.src='voldia_placement_v0080.html'; // r047(41回目): 左パネルに「範囲スクショ」を追加した版。 r044(40回目): v0078に残っていた古いscriptタグ(data/LOW_1TOKO_geo.js・data/voldia_worker_toko.js=r073で voldia_models.js に統合済み。404になっていた)を除去した版。r040(37回目)の「v0078のまま」はこれで更新
      iframe.style.cssText='width:100%;height:100%;border:none;';
      wrap.appendChild(iframe);
      document.body.appendChild(wrap);
    }else{
      wrap.style.display='block';
    }
    const iframeEl=document.getElementById('placement-iframe');
    // r076(21回目引継ぎ4回目・マスター報告「オブジェクトを置くまで矢印キーが効かない」):
    // 真因判明。display:noneで配置モードを閉じると、そのiframeはブラウザに
    // 強制的にフォーカスを外される(display:noneの要素はフォーカスを保持できない
    // 仕様のため)。その後display='block'で再表示しても、フォーカスは自動では
    // 戻ってこない(親ページ側に残ったまま)。そのためiframe内のwindow.keydown
    // リスナーはイベントを一切受け取れず、キャンバスを直接クリック(≒配置操作)
    // して初めてiframeへフォーカスが移り、動くように見えていた。
    // 対策: 表示するたびに明示的にiframeへフォーカスを戻す。
    iframeEl.focus();
    function onCloseMsg(ev){
      if(ev.source!==iframeEl.contentWindow) return;
      if(ev.data && ev.data.type==='voldia-placement-close'){
        wrap.style.display='none';
      }
    }
    window.addEventListener('message', onCloseMsg);

    if(!isFirstOpen){
      // r016: 2回目以降のオープン。iframeは生きたまま待機しているので、
      // readyハンドシェイクを待たずに地形データを直接送るだけでよい。
      iframeEl.contentWindow.postMessage({type:'voldia-terrain-glb', buffer:glb}, '*');
      // r025(マスター指示・追1): 測点の実座標も一緒に送る(mm→m変換はGLBと同じS=0.001)
      const __svPts_reopen = (surveyPts||[]).map((p,i)=>({no:i+1, x:(pxToMm(p.x)-offsetX)*S, z:(pxToMm(p.y)-offsetY)*S}));
      // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
      iframeEl.contentWindow.postMessage({type:'voldia-survey-points', points:__svPts_reopen,
        northAngleDeg: (typeof northAngleDeg==='number' && !isNaN(northAngleDeg)) ? northAngleDeg : 0}, '*');
      // r044: 山留ラインも配置モードへ送る(測点と同じオフセット/スケール変換)
      // r096(34回目セッション、マスター報告「山留を消しても配置モードにテクスチャが
      // 残留する」不具合対応): [FIX 19回目]で紫壁面(purple-walls)に施した修正と
      // 全く同じ原因だった——対象が無くなった(yamadome===null)場合にここの
      // postMessage自体をスキップしていたため、配置モード側に「もう無い」という
      // 情報が一度も届かず、古いテクスチャが消えずに残っていた。しかも[FIX 19回目]
      // のコメント自身が「以前は再計算時のみ更新される山留の反省を活かす」と
      // 書いていたにもかかわらず、山留自身はその教訓を反映されないまま放置されて
      // いた。purple-wallsと同じく、山留の有無にかかわらず必ず送り、無ければ
      // points:[]を送って配置モード側で確実にクリアさせる。
      const __ydLine_reopen = (typeof yamadome !== 'undefined' && yamadome && yamadome.pts && yamadome.pts.length>=3)
        ? yamadome.pts.map(p=>({x:(pxToMm(p.x)-offsetX)*S, z:(pxToMm(p.y)-offsetY)*S}))
        : [];
      // 追加2(2026-08-24 引継ぎ18回目): 配置モード側の地形レイキャストによる
      // 高さ推測(同じ形状のオブジェクトと重なると誤ヒットして山留が消える不具合の
      // 原因だった)をやめ、本体側の実寸値をそのまま渡す。
      iframeEl.contentWindow.postMessage({type:'voldia-yamadome-line', points:__ydLine_reopen,
        realYTop: window._lastYamadomeRealYTop, realYBot: window._lastYamadomeRealYBot,
        batterDeg: window._lastYamadomeBatterDeg}, '*');
      // 6D配置モード反映(2026-08-29 引継ぎ18回目マスター指示→26回目セッションで紫に移設): 紫壁面ハッチも
      // 山留と同じ考え方で配置モードへ送る。座標は既にfrustum正規化mm(=山留と同じ
      // 基準)なのでSを掛けるだけで良い(SC*p.x等、送信側で変換済み)。
      // [FIX 19回目 2026-08-30 マスター報告] 紫→青など、紫オブジェクトが
      // 無くなった(=positions.lengthが0になった)場合にここで送信自体をスキップして
      // いたため、配置モード側に「もう無い」という情報が届かず、古いハッチが
      // 消えずに残る不具合があった。空でも必ず送って、配置モード側で確実に
      // クリアできるようにする(以前は再計算時のみ更新される山留の反省を活かす)。
      iframeEl.contentWindow.postMessage({type:'voldia-purple-walls', positions: (window._lastPurpleWalls&&window._lastPurpleWalls.positions)||[], uv: (window._lastPurpleWalls&&window._lastPurpleWalls.uv)||[]}, '*');
      if(_pendingPlacementRestore){
        iframeEl.contentWindow.postMessage({type:'voldia-restore-placement-state', objects:_pendingPlacementRestore}, '*');
        _pendingPlacementRestore = null;
      }
      _pmLoadingHide(); // r126
      return;
    }

    let sent=false;
    function onMsg(ev){
      if(ev.source!==iframeEl.contentWindow || sent) return;
      if(ev.data && ev.data.type==='voldia-placement-ready'){
        sent=true;
        iframeEl.contentWindow.postMessage({type:'voldia-terrain-glb', buffer:glb}, '*');
        // r025(マスター指示・追1): 初回オープン時も同様に測点座標を送る
        const __svPts_first = (surveyPts||[]).map((p,i)=>({no:i+1, x:(pxToMm(p.x)-offsetX)*S, z:(pxToMm(p.y)-offsetY)*S}));
        // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
        iframeEl.contentWindow.postMessage({type:'voldia-survey-points', points:__svPts_first,
          northAngleDeg: (typeof northAngleDeg==='number' && !isNaN(northAngleDeg)) ? northAngleDeg : 0}, '*');
        // r044: 山留ラインも配置モードへ送る(測点と同じオフセット/スケール変換)
        // r096(34回目セッション): 上のreopen側と同じ理由で、初回オープン時も
        // 山留の有無にかかわらず必ず送る(無ければpoints:[])。
        const __ydLine_first = (typeof yamadome !== 'undefined' && yamadome && yamadome.pts && yamadome.pts.length>=3)
          ? yamadome.pts.map(p=>({x:(pxToMm(p.x)-offsetX)*S, z:(pxToMm(p.y)-offsetY)*S}))
          : [];
        iframeEl.contentWindow.postMessage({type:'voldia-yamadome-line', points:__ydLine_first,
          realYTop: window._lastYamadomeRealYTop, realYBot: window._lastYamadomeRealYBot,
          batterDeg: window._lastYamadomeBatterDeg}, '*');
        // 6D配置モード反映(2026-08-29 引継ぎ18回目マスター指示)
        // [FIX 19回目] 上と同じ理由で、空でも必ず送る。
        iframeEl.contentWindow.postMessage({type:'voldia-purple-walls', positions: (window._lastPurpleWalls&&window._lastPurpleWalls.positions)||[], uv: (window._lastPurpleWalls&&window._lastPurpleWalls.uv)||[]}, '*');
        // r013: プロジェクト読込直後の初回オープンなら、保存されていた
        // 配置オブジェクトも一緒に復元する(一度使ったらクリアして、以後の
        // 再オープンでは上書きしないようにする＝配置モード内での続きの
        // 編集を尊重する)
        if(_pendingPlacementRestore){
          iframeEl.contentWindow.postMessage({type:'voldia-restore-placement-state', objects:_pendingPlacementRestore}, '*');
          _pendingPlacementRestore = null;
        }
        clearInterval(retryTimer);
        window.removeEventListener('message', onMsg);
        _pmLoadingHide(); // r126: 配置モード側の準備完了(以降は配置モード側の#loadingが地形解析中を表示)
      }
    }
    window.addEventListener('message', onMsg);
    // iframeの初期化が間に合わない場合に備え、「準備できたら教えて」の合図を数回送る
    let retries=0;
    const retryTimer=setInterval(()=>{
      retries++;
      if(sent || retries>20){clearInterval(retryTimer); if(!sent) _pmLoadingHide(); return;}
      try{ iframeEl.contentWindow.postMessage({type:'voldia-request-ready'}, '*'); }catch(e){}
    }, 500);
  }catch(e){
    console.error(e);
    _pmLoadingHide(); // r126
    toast('⚠ Objectエラー！表示出来ません', 4000);
  }finally{
    if(btn)btn.disabled=false;
  }
}
// ════════════════════════════════════════════════════════════════
//  r126(44回目): (C)=(A)-(B) 差引後の形状を作る
//  ------------------------------------------------------------
//  マスター要望: データ出力のPDF/PNGは A(通常体積)・B(減算分) の2種類だけで、A-B(実際に掘る形)が出なかった。
//  A=グレー以外の掘削の形、B=既存躯体と掘削の重なりの形(Aに含まれる)なので、C=A-B をManifoldの差集合で作り、
//  A/Bと同じエビル解析(_evRunAnalysis→PNG/PDF)にかける。
//  ・向き: Aの元メッシュ(Voldia_Union)は外向き(体積+)。Cも外向きで返す(ZIPに書く表示用は他と同じくflipWinding)。
//  ・Manifoldが作れない/差が合わない時は null を返し、呼び出し側は(A)(B)だけの従来出力に戻る(失敗してもデータ出力全体は止めない)。
//  ・検証: A,Bそれぞれの体積と、C体積が『A-B』と0.5%以内(Bの2%以内で可)で合うことを確認してから採用する。
// ════════════════════════════════════════════════════════════════
// 開いた輪郭(境界エッジ)が水平な1枚の平面(GL面)上にある場合に、その平面でふたをする三角形を返す。閉じた立体なら null。
//   エビル用のAのGLBはGL面(天端)に天蓋が無い『上が開いたすり鉢』なので、Manifoldで差集合を取る間だけふさぐ必要がある。
function _capOpenTopTris(vp, tv){
  const E = new Set(); for(let t=0;t<tv.length;t+=3) for(let k=0;k<3;k++) E.add(tv[t+k]+'_'+tv[t+(k+1)%3]);
  const nxt = new Map(), bnd = [];
  for(let t=0;t<tv.length;t+=3) for(let k=0;k<3;k++){ const a=tv[t+k], b=tv[t+(k+1)%3]; if(!E.has(b+'_'+a)){ bnd.push([a,b]); if(!nxt.has(a)) nxt.set(a, []); nxt.get(a).push(b); } }
  if(!bnd.length) return null;
  const used = new Set(), loops = [];
  for(const [a0,b0] of bnd){
    if(used.has(a0+'_'+b0)) continue;
    const loop = [a0]; let a=a0, b=b0; used.add(a+'_'+b);
    for(let g=0; g<100000 && b!==a0; g++){ loop.push(b); const c=(nxt.get(b)||[]).find(x=>!used.has(b+'_'+x)); if(c===undefined) throw new Error('境界が閉じた輪にならない'); used.add(b+'_'+c); a=b; b=c; }
    loops.push(loop);
  }
  const y0 = vp[loops[0][0]*3+1];
  loops.forEach(lp => lp.forEach(v => { if(Math.abs(vp[v*3+1]-y0) > 1e-4) throw new Error('開口部が水平な平面上にない'); }));
  const xz = lp => lp.map(v => [vp[v*3], vp[v*3+2]]);
  const area = pts => { let s=0; for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; s += pts[i][0]*pts[j][1]-pts[j][0]*pts[i][1]; } return s/2; };
  const inside = (pt, pts) => { let c=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ if(((pts[i][1]>pt[1])!==(pts[j][1]>pt[1])) && (pt[0] < (pts[j][0]-pts[i][0])*(pt[1]-pts[i][1])/(pts[j][1]-pts[i][1])+pts[i][0])) c=!c; } return c; };
  const info = loops.map(lp => { const p = xz(lp); return {lp, p, a:Math.abs(area(p))}; }).sort((u,v) => v.a-u.a);
  info.forEach((u,i) => { u.depth = info.filter((w,k) => k!==i && w.a>u.a && inside(u.p[0], w.p)).length; });
  const caps = [];
  info.filter(u => u.depth%2===0).forEach(outer => {
    const holes = info.filter(h => h.depth===outer.depth+1 && inside(h.p[0], outer.p));
    const ring = outer.lp.slice(), flat = []; outer.p.forEach(q => flat.push(q[0], q[1]));
    const hi = [];
    holes.forEach(h => { hi.push(flat.length/2); h.lp.forEach(v => ring.push(v)); h.p.forEach(q => flat.push(q[0], q[1])); });
    const tr = earcut(flat, hi.length?hi:null, 2);
    if(!tr.length) throw new Error('ふた(天蓋)の三角形分割に失敗');
    for(let t=0;t<tr.length;t+=3){
      let a=ring[tr[t]], b=ring[tr[t+1]], c=ring[tr[t+2]];
      const ux=vp[b*3]-vp[a*3], uz=vp[b*3+2]-vp[a*3+2], wx=vp[c*3]-vp[a*3], wz=vp[c*3+2]-vp[a*3+2];
      if(uz*wx-ux*wz < 0){ const tmp=b; b=c; c=tmp; } // 法線が+y(上向き=外向き)になる向きに揃える
      caps.push(a,b,c);
    }
  });
  return {caps, y:y0};
}
function _meshToWeldedManifold(m, wasm, unifyOrient){
  const {Manifold, Mesh} = wasm;
  const P = m.positions, I = m.indices, map = new Map(), vp = [], tv = [];
  const vid = i => {
    const x=P[i*3], y=P[i*3+1], z=P[i*3+2];
    const k = Math.round(x*1e5)+'_'+Math.round(y*1e5)+'_'+Math.round(z*1e5); // 0.01mm(メートル単位の1e-5)で頂点を溶接
    let v = map.get(k); if(v === undefined){ v = vp.length/3; map.set(k, v); vp.push(x, y, z); } return v;
  };
  for(let t=0;t+2<I.length;t+=3){ const a=vid(I[t]), b=vid(I[t+1]), c=vid(I[t+2]); if(a===b||b===c||a===c) continue; tv.push(a,b,c); }
  // r127(45回目): 閉じた立体の三角形の向きを、辺を共有する隣どうしで幅優先に揃える(既存躯体ソリッドは上面と底面の巻きが同じ向きで、
  //   このままだとManifoldが非多様体と判定する)。全体の裏表は下の体積の符号で決まる。(A)(B)には使わない(unifyOrient=trueの時だけ)。
  if(unifyOrient){
    const nT=tv.length/3, tri=[]; for(let q=0;q<nT;q++) tri.push([tv[q*3],tv[q*3+1],tv[q*3+2]]);
    const em=new Map(); tri.forEach((tr,i)=>{ for(let k=0;k<3;k++){ const a=tr[k], b=tr[(k+1)%3], key=Math.min(a,b)+'_'+Math.max(a,b); let l=em.get(key); if(!l){ l=[]; em.set(key,l); } l.push(i); } });
    const seen=new Array(nT).fill(false);
    const fwd=(tr,a,b)=>{ for(let k=0;k<3;k++) if(tr[k]===a && tr[(k+1)%3]===b) return true; return false; };
    for(let s0=0;s0<nT;s0++){ if(seen[s0]) continue; seen[s0]=true; const st=[s0];
      while(st.length){ const i=st.pop(), tr=tri[i];
        for(let k=0;k<3;k++){ const a=tr[k], b=tr[(k+1)%3], key=Math.min(a,b)+'_'+Math.max(a,b);
          for(const j of em.get(key)){ if(j===i||seen[j]) continue; const u=tri[j]; if(fwd(u,a,b)) tri[j]=[u[0],u[2],u[1]]; seen[j]=true; st.push(j); } } } }
    tv.length=0; tri.forEach(tr=>{ tv.push(tr[0],tr[1],tr[2]); });
  }
  // 体積の符号は『開口面がy=0を通る』前提で発散定理が使えるとは限らないので、開口面があれば先にふたをしてから符号を見る
  const vol = () => { let v=0; for(let t=0;t<tv.length;t+=3){ const a=tv[t]*3, b=tv[t+1]*3, c=tv[t+2]*3;
    v += (vp[a]*(vp[b+1]*vp[c+2]-vp[b+2]*vp[c+1]) - vp[a+1]*(vp[b]*vp[c+2]-vp[b+2]*vp[c]) + vp[a+2]*(vp[b]*vp[c+1]-vp[b+1]*vp[c]))/6; } return v; };
  // 向きを外向きに揃える: まず今の向きでふたをして(ふたは+y向き)、体積が負なら全体を反転(=ふたも-y向きになるので、反転前にふたをするのが正しい向きになるよう下で再処理)
  let cap = null, capY = null;
  try{ cap = _capOpenTopTris(vp, tv); }catch(e){ throw e; }
  if(cap){
    // ふたは「+y向きが外向き」を仮定して作った。メッシュが逆向き(内向き)なら、ふたも含めて全体を反転した方が一貫する
    const n0 = tv.length; for(const x of cap.caps) tv.push(x);
    const v = vol();
    if(v < 0){ // 内向きだった: ふたを除いて元のメッシュを反転 → ふたをもう一度、今度は反転後の向きで作り直す
      tv.length = n0; for(let t=0;t<tv.length;t+=3){ const tmp=tv[t+1]; tv[t+1]=tv[t+2]; tv[t+2]=tmp; }
      const cap2 = _capOpenTopTris(vp, tv); for(const x of cap2.caps) tv.push(x); capY = cap2.y;
    }else capY = cap.y;
  }else{
    if(vol() < 0) for(let t=0;t<tv.length;t+=3){ const tmp=tv[t+1]; tv[t+1]=tv[t+2]; tv[t+2]=tmp; }
  }
  const man = new Manifold(new Mesh({numProp:3, vertProperties:new Float32Array(vp), triVerts:new Uint32Array(tv)}));
  if(man.status && man.status() !== 'NoError') throw new Error('Manifold変換に失敗: '+man.status());
  return {man, capY};
}
async function _buildNetMeshes(meshesA, meshesB, wasmOverride, meshesG){
  const wasm = wasmOverride || await _getManifoldWasm();
  const toDelete = []; let capYA = null;
  try{
    const mans = (arr, label, isA) => {
      const list = (arr||[]).filter(m => m && m.positions && m.indices && m.indices.length>=3 && m.name!=='Voldia_ExistingStructure').map(m => {
        const r=_meshToWeldedManifold(m, wasm); toDelete.push(r.man); if(isA && r.capY!==null) capYA = r.capY; return r.man; });
      if(!list.length) throw new Error(label+'のメッシュが空');
      return list.reduce((acc, x) => { if(!acc) return x; const u = acc.add(x); toDelete.push(u); return u; }, null);
    };
    const A = mans(meshesA, '(A)', true), B = mans(meshesB, '(B)', false);
    const vA = A.volume(), vB = B.volume();
    const expected = vA - vB, tol = Math.max(Math.abs(expected)*0.005, Math.abs(vB)*0.02, 1e-6);
    // r127(45回目): 第一候補は C=A-G(G=既存躯体の実体)。A-Bだと、Aの外壁(山留バッチ角1°・微テーパーで傾く)とBの壁(垂直)の食い違いで
    //   5〜50mmの薄い楔が残り、既存躯体の部分が底の抜けた箱に見える(Voldia_261031_1806.vold)。Gは掘削の外まで広がるので楔が出ない。
    //   Gが無い・Manifoldにできない・体積がA-Bと合わない時は、従来どおりC=A-Bに戻る(体積の検証は従来と同じtol)。
    let C = null, usedG = false;
    if(meshesG && meshesG.length){
      try{
        const gl = meshesG.filter(m => m && m.positions && m.indices && m.indices.length>=3).map(m => { const r=_meshToWeldedManifold(m, wasm, true); toDelete.push(r.man); return r.man; });
        if(gl.length){
          const G = gl.reduce((acc, x) => { if(!acc) return x; const u = acc.add(x); toDelete.push(u); return u; }, null);
          const cg = A.subtract(G); toDelete.push(cg);
          if((!cg.status || cg.status() === 'NoError')){
            const v = cg.volume();
            if(v > 0 && Math.abs(v - expected) <= tol){ C = cg; usedG = true; }
            else console.warn(`[C側] A-G の体積が合わないためA-Bに戻します: A-G=${v.toFixed(3)} A-B=${expected.toFixed(3)}`);
          }
        }
      }catch(e){ console.warn('[C側] A-G の生成に失敗、A-Bに戻します:', e); C = null; usedG = false; }
    }
    if(!C){ C = A.subtract(B); toDelete.push(C); }
    if(C.status && C.status() !== 'NoError') throw new Error('差集合の結果が不正: '+C.status());
    const vC = C.volume();
    // Bの一部がAの外にはみ出している場合は、はみ出し分だけ(A-C)がBより小さくなる。許容は上のtol。
    if(!(vC > 0) || Math.abs(vC - expected) > tol) throw new Error(`体積が合わない: A=${vA.toFixed(3)} B=${vB.toFixed(3)} C=${vC.toFixed(3)} (A-B=${expected.toFixed(3)})`);
    const gm = C.getMesh(), np = gm.numProp || 3, nv = gm.vertProperties.length/np;
    const pos = new Float32Array(nv*3);
    for(let i=0;i<nv;i++){ pos[i*3]=gm.vertProperties[i*np]; pos[i*3+1]=gm.vertProperties[i*np+1]; pos[i*3+2]=gm.vertProperties[i*np+2]; }
    // 差集合の間だけふさいでいたGL面の天蓋を取り除き、Aと同じ『上が開いたすり鉢』に戻す(上向きの水平面でGL面の高さにある三角形だけ)
    const idx = [];
    for(let t=0;t<gm.triVerts.length;t+=3){
      const a=gm.triVerts[t], b=gm.triVerts[t+1], c=gm.triVerts[t+2];
      if(capYA!==null){
        const ya=pos[a*3+1], yb=pos[b*3+1], yc=pos[c*3+1];
        if(Math.abs(ya-capYA)<1e-4 && Math.abs(yb-capYA)<1e-4 && Math.abs(yc-capYA)<1e-4){
          const ux=pos[b*3]-pos[a*3], uz=pos[b*3+2]-pos[a*3+2], wx=pos[c*3]-pos[a*3], wz=pos[c*3+2]-pos[a*3+2];
          if(uz*wx-ux*wz > 0) continue; // 上向きの天蓋面(法線y>0)は捨てる
        }
      }
      idx.push(a,b,c);
    }
    return {meshes:[{name:'Voldia_NetExcavation', positions:pos, indices:new Uint32Array(idx)}], volumeM3:vC, aM3:vA, bM3:vB, capped:capYA!==null, usedGray:usedG};
  }catch(e){
    console.warn('[C側] 差引後(A-B)の形状生成に失敗、(A)(B)のみで続行します:', e);
    return null;
  }finally{
    toDelete.forEach(x => { try{ x.delete(); }catch(e){} });
  }
}

function epSet(pct,msg){
  const b=document.getElementById('ep-bar'),el=document.getElementById('ep-msg');
  if(b)b.style.width=pct+'%';if(el)el.textContent=msg;
}

// ════════════════════════════════════════════════════════════════
//  r070: エビル(Evidence Builder)統合セクション
//  ------------------------------------------------------------
//  方針(マスター合意事項 2026-08-21): GLB経由のまま。
//  Voldiaが buildVoldiaGLBBytes() で書き出したGLBバイト列を、
//  配置モードと同じ r128系 THREE.GLTFLoader で読み込み、
//  エビル(Evidence_Builder_.html)の解析ロジックをほぼそのまま移植する。
//  Voldiaの本編シーン(threeS/threeC/threeR)には一切触れない、
//  完全に独立したオフスクリーンシーンで解析・PNG/PDF書き出しを行う。
//  ※このセクションは未実機確認。次回セッションでまとめてテストすること。
// ════════════════════════════════════════════════════════════════

let _evScene=null, _evRenderer=null, _evResultGroup=null, _evSubLabelGroup=null, _evFineLineGroup=null;
let _evAnalysisData=[], _evTotalModelArea=0, _evModelScaleSize=1, _evPendingSubLabels=[];
let _evGltfLoader=null;

function _evHashVertex(v){
  const precision=1000;
  return `${Math.round(v.x*precision)}_${Math.round(v.y*precision)}_${Math.round(v.z*precision)}`;
}

class _EvUnionFind{
  constructor(){ this.parent={}; }
  find(i){
    if(this.parent[i]===undefined) this.parent[i]=i;
    if(this.parent[i]===i) return i;
    return this.parent[i]=this.find(this.parent[i]);
  }
  union(i,j){
    const rootI=this.find(i), rootJ=this.find(j);
    if(rootI!==rootJ) this.parent[rootI]=rootJ;
  }
}

function _evCreateNumberLabel(number, targetScale, useDepthTest){
  const canvas=document.createElement('canvas');
  canvas.width=64; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.beginPath(); ctx.arc(32,32,30,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle='#ffffff'; ctx.stroke();
  ctx.fillStyle='#ffffff'; ctx.font='bold 28px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(number.toString(),32,34);
  const texture=new THREE.CanvasTexture(canvas);
  const material=new THREE.SpriteMaterial({map:texture, depthTest:useDepthTest, transparent:true});
  const sprite=new THREE.Sprite(material);
  if(!useDepthTest) sprite.renderOrder=999;
  sprite.scale.set(targetScale,targetScale,1);
  return sprite;
}

function _evCreateTinySubLabel(text, targetScale){
  const canvas=document.createElement('canvas');
  canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.font='bold 44px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.lineJoin='round'; ctx.lineWidth=2; ctx.strokeStyle='#ffffff';
  ctx.strokeText(text,128,32);
  ctx.fillStyle='#c0392b'; ctx.fillText(text,128,32);
  const texture=new THREE.CanvasTexture(canvas);
  texture.minFilter=THREE.LinearMipMapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  const material=new THREE.SpriteMaterial({map:texture, depthTest:false, transparent:true});
  const sprite=new THREE.Sprite(material);
  sprite.renderOrder=1000;
  sprite.scale.set(targetScale*4,targetScale,1);
  return sprite;
}

// r091(24回目・追加チェック項目1): 平面図(真上から見たPDF/PNG)上でサブフェイス
// 番号ラベルが重なる不具合の対策。柱が梁の真上にある等、異なる高さの要素でも
// XZ座標(平面上の位置)が近いと、真上から見た投影では見分けが付かなくなる。
// 全ラベル候補が出揃った時点で、既に配置済みのラベルとXZ平面上でAABB衝突判定を
// 行い、衝突する場合は元の位置を中心に螺旋状に候補点を試して空いている場所へ
// ずらす。ずらした場合は元の真の位置まで薄い引出線を引き、対応関係を保つ。
function _evResolveAndPlaceSubLabels(){
  const placed=[];
  _evPendingSubLabels.forEach(cand=>{
    // スプライト全体(targetScale*4 x targetScale)に対し、実際の文字幅は
    // やや小さいため0.85倍を目安の当たり判定とする
    const halfW=cand.tinyScale*4*0.5*0.85, halfH=cand.tinyScale*0.5*0.85;
    const collides=(x,z)=>placed.some(p=>Math.abs(x-p.fcx)<(halfW+p.halfW) && Math.abs(z-p.fcz)<(halfH+p.halfH));
    let px=cand.fcx, pz=cand.fcz, moved=false;
    if(collides(px,pz)){
      moved=true;
      const baseStep=Math.max(halfW,halfH)*1.4;
      outer:
      for(let ring=1;ring<=6;ring++){
        const radius=baseStep*ring, numAngles=8*ring;
        for(let i=0;i<numAngles;i++){
          const ang=(Math.PI*2*i)/numAngles;
          const tx=cand.fcx+Math.cos(ang)*radius, tz=cand.fcz+Math.sin(ang)*radius;
          if(!collides(tx,tz)){ px=tx; pz=tz; break outer; }
        }
      }
      // 6リング試しても空きが見つからない場合は最後の候補(密集地の外周)のまま採用
    }
    placed.push({fcx:px, fcz:pz, halfW, halfH});
    const tinyLabel=_evCreateTinySubLabel(cand.subNo, cand.tinyScale);
    tinyLabel.position.set(px, cand.fcy+(_evModelScaleSize*0.005), pz);
    _evSubLabelGroup.add(tinyLabel);
    if(moved){
      const lineGeom=new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cand.fcx, cand.fcy+(_evModelScaleSize*0.003), cand.fcz),
        new THREE.Vector3(px, cand.fcy+(_evModelScaleSize*0.003), pz)
      ]);
      const leaderLine=new THREE.Line(lineGeom, new THREE.LineBasicMaterial({color:0xc0392b, transparent:true, opacity:0.6}));
      leaderLine.renderOrder=999;
      _evSubLabelGroup.add(leaderLine);
    }
  });
}

// オフスクリーン解析用シーンを準備（Voldia本編の3Dビューとは完全に独立）
function _evEnsureScene(){
  if(_evScene) return;
  _evScene=new THREE.Scene();
  _evScene.background=new THREE.Color(0xffffff);
  _evScene.add(new THREE.AmbientLight(0xffffff,0.8));
  const dl=new THREE.DirectionalLight(0xffffff,0.7);
  dl.position.set(1,2,1);
  _evScene.add(dl);
  _evRenderer=new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  _evRenderer.setPixelRatio(1);
  _evResultGroup=new THREE.Group();
  _evSubLabelGroup=new THREE.Group();
  _evFineLineGroup=new THREE.Group(); // r072マスター指摘対応①: サブフェイス単位の細かい面分割線(PDF専用・デフォルト非表示)
  _evFineLineGroup.visible=false;
  _evScene.add(_evResultGroup, _evSubLabelGroup, _evFineLineGroup);
  if(!_evGltfLoader) _evGltfLoader=new THREE.GLTFLoader();
}

// エビル runAnalysis() の移植版。GLBバイト列(ArrayBuffer)を受け取りメッシュ解析する。
function _evRunAnalysis(mode, glbArrayBuffer){
  return new Promise((resolve,reject)=>{
    _evEnsureScene();
    _evGltfLoader.parse(glbArrayBuffer, '', (gltf)=>{
      try{
        const currentModel=gltf.scene;
        _evResultGroup.clear();
        _evSubLabelGroup.clear();
        _evFineLineGroup.clear();
        _evTotalModelArea=0;

        const box=new THREE.Box3().setFromObject(currentModel);
        const yBase=box.min.y;
        // r070(マスター指示): 基準地盤高の手入力UIは統合版では持たず、
        // エビル既定動作(未入力時にモデル最上面を自動適用)に合わせて box.max.y を直接使う
        const z0=box.max.y;

        _evModelScaleSize=Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z)||1;

        let faces=[];
        currentModel.updateMatrixWorld(true);
        currentModel.traverse((child)=>{
          if(child.isMesh){
            let geom=child.geometry.clone();
            geom.applyMatrix4(child.matrixWorld);
            if(geom.index) geom=geom.toNonIndexed();
            const pos=geom.attributes.position.array;
            for(let i=0;i<pos.length;i+=9){
              const v0=new THREE.Vector3(pos[i],pos[i+1],pos[i+2]);
              const v1=new THREE.Vector3(pos[i+3],pos[i+4],pos[i+5]);
              const v2=new THREE.Vector3(pos[i+6],pos[i+7],pos[i+8]);
              faces.push({v0,v1,v2});
            }
          }
        });

        faces.forEach((f,index)=>{
          f.id=index;
          const edge1=new THREE.Vector3().subVectors(f.v1,f.v0);
          const edge2=new THREE.Vector3().subVectors(f.v2,f.v0);
          f.normal=new THREE.Vector3().crossVectors(edge1,edge2).normalize();
          f.avgY=(f.v0.y+f.v1.y+f.v2.y)/3;
          f.projArea=0.5*Math.abs((f.v1.x-f.v0.x)*(f.v2.z-f.v0.z)-(f.v2.x-f.v0.x)*(f.v1.z-f.v0.z));
          f.distToOrigin=-f.normal.dot(f.v0);
          f.hasConvex=false; f.hasConcave=false;
          f.centroid=new THREE.Vector3().add(f.v0).add(f.v1).add(f.v2).divideScalar(3);

          // 【問題A・アイデア2対応・2026-08-24マスター指示】旧閾値0.01(約0.6度相当)は、
          // LandXML対策の垂直面回避ハック(noSlopeオブジェクトの微小テーパー、旧3°→今回の
          // 問題B対応で固定15mmオフセットに変更)による疑似壁まで「法面」と誤認識していた。
          // Voldiaで選択可能な法面角度は30/45/60/73度の4種類のみなので、最も急な73度でも
          // normal.y=cos(73°)≈0.29。微小テーパー分(深さにより変動するが実運用ではこれより
          // 十分小さい)との間に余裕を持たせ、0.2(約78度相当)を閾値とする。これにより
          // 疑似壁は確実にIGNORE(壁)扱いとなり、本物の法面(最大73度)は引き続きSLOPE判定される。
          const SLOPE_NORMAL_Y_THRESHOLD = 0.2;
          if(mode==='structure'){
            f.calcHeight=f.avgY-yBase;
            if(f.normal.y>0.99) f.type='UPWARD_FLAT';
            else if(f.normal.y>SLOPE_NORMAL_Y_THRESHOLD) f.type='UPWARD_SLOPE';
            else if(f.normal.y<-0.99) f.type='DOWNWARD_FLAT';
            else if(f.normal.y<-SLOPE_NORMAL_Y_THRESHOLD) f.type='DOWNWARD_SLOPE';
            else f.type='IGNORE';
          }else{
            const absNy=Math.abs(f.normal.y);
            if(absNy>0.99) f.type='BOTTOM';
            else if(absNy>SLOPE_NORMAL_Y_THRESHOLD) f.type='SLOPE';
            else f.type='IGNORE';
            f.calcHeight=z0-f.avgY;
          }

          // 【問題A・31回目セッション追記・マスター実機報告「山留面の角に②③のような
          // 極小スリバーが出る」への対応・真因特定】上記のSLOPE_NORMAL_Y_THRESHOLDは
          // 「テーパー分の傾き(深さDに対して15mm)」を前提に、辺沿いの疑似壁面を弾いて
          // いたが、山留(noSlope)オブジェクトの"角"だけは事情が違う。GL(z=0)蓋除去の
          // 数値安定化ハック(DOBOKU_VERTICAL_TAPER_FIXED_MM)が角の頂点だけ対角線状に
          // (X,Y,Z)三方向へ均等にズレるため、そこに生じる縫合三角形は「深さDに対する
          // 緩やかな傾き」ではなく、辺長10〜15mm程度の縮退した「くさび」になり、法線が
          // たまたま45度前後(=SLOPE_NORMAL_Y_THRESHOLDを普通に超える値)を向いてしまう。
          // 実機GLB(260925164720_Voldia_Earthworkexport.glb)をNode.jsで数値解析し、
          // この手の角の縫合三角形は最短辺が一律17.32mm(=√(10²+10²+10²)mm、ハックの
          // オフセット定数そのもの)である一方、本物の法面三角形は同じデータ中で最短辺
          // 740mm以上と、3桁違うことを確認した。この桁違いの差を利用し、法面/上向き
          // 法面/下向き法面と判定された面のうち、最短辺が極端に短い(=角の縫合三角形と
          // 断定できる)ものだけをIGNOREへ格下げする。メッシュ生成・Manifold・体積計算
          // ロジック自体には一切触れず、Excel集計とPDF/PNG平面図(共に本関数のfaces配列を
          // 元にしている)の両方から同時に除外できる。
          // 【問題A・31回目セッション追記2回目・マスター実機報告「旧2がまだ残る、
          // 3は別の場所を指すようになった」への対応】前回(最短辺100mm未満)の基準は
          // 「対角オフセットで3辺とも短くなる角の楔」は捕まえられたが、実機データで
          // 新たに見つかった別パターン——「1辺だけ本来の長さ(数m〜十数m)を保ったまま、
          // 残りがハックのオフセット分だけしかない、面積がほぼ0の"細長い"縮退三角形」
          // (今回のGLBの三角形15番、投影面積0.0625m²・最長辺12.5m・最短辺5.7m)は
          // 最短辺基準ではすり抜けてしまっていた。これは「辺の長さ」ではなく
          // 「面積÷最長辺²」という縮退度(アスペクト比の逆数相当)で見るべき問題。
          // 実機GLB(260925195829)の全SLOPE判定三角形をNode.js/Pythonで数値解析した
          // ところ、ハック由来の縮退三角形(9枚、今回新たに見つかった15番含む)は
          // この比が0.00057〜0.0028に collect し、本物の法面三角形(24枚)は最小でも
          // 0.0250と、約10倍の安全マージンを持って明確に分離することを確認した。
          const SLIVER_MIN_EDGE_MM = 100; // 角の楔(3辺とも短い)を弾く一次フィルタ(念のため残置)
          const SLIVER_AREA_RATIO = 0.01; // 面積/最長辺^2。実機データで縮退三角形0.0028以下・本物0.025以上と確認(10倍近いマージン)
          if(f.type==='SLOPE' || f.type==='UPWARD_SLOPE' || f.type==='DOWNWARD_SLOPE'){
            const e1=f.v0.distanceTo(f.v1), e2=f.v1.distanceTo(f.v2), e3=f.v2.distanceTo(f.v0);
            const minEdgeMm=Math.min(e1,e2,e3)*1000;
            const maxEdge=Math.max(e1,e2,e3);
            const triArea=new THREE.Vector3().crossVectors(
              new THREE.Vector3().subVectors(f.v1,f.v0),
              new THREE.Vector3().subVectors(f.v2,f.v0)
            ).length()*0.5;
            const areaRatio = maxEdge>1e-9 ? (triArea/(maxEdge*maxEdge)) : 0;
            // 【問題A・32回目セッション追記・マスター実機報告「②と⑤は同一平面のはずなのに
            // 別クラスタになる」への対応・真因特定】上のスリバー判定はtypeを直接'IGNORE'に
            // 書き換えていたため、この面が丸ごとfaces配列から消え、後続の辺共有隣接グラフ
            // (Union-Find)からも同時に消えていた。ところが実機データを解析したところ、
            // このスリバー面が「本物の同一平面上の2つの面(例:②③)を繋ぐ唯一の辺」を
            // 担っているケースがあり、スリバーを消すと同時にその2面の隣接関係も失われ、
            // 本来1つにまとまるべき面が孤立クラスタとして取り残されていた。
            // 「面積・数量には数えない」ことと「隣接グラフから消す」ことを同じ1回の操作
            // (type書き換え→配列除外)でやっていたのが構造的な原因。この2つの役割を
            // isSliverフラグで分離し、スリバー面はtypeをSLOPE系のまま維持して隣接グラフの
            // 「橋」としては機能させつつ、面積・高さ集計とサブフェイス表示からは除外する。
            // r049(42回目): 「面積/最長辺^2 < 0.01」だけで縮退と判定すると、長い壁(例:12.6m)を細かい帯に割った
            // 本物の法面の帯(高さ150〜166mm)まで縮退扱いになり、壁ごと数量から消えていた(1/193で右側の法面が欠け、
            // 212.789→196.593m³に減った。AutoCADは212.7874)。比は「長いほど小さくなる」ため長さに依存する指標で、
            // 縮退の本質(=実寸が極端に薄い)を見ていない。ハック由来の縮退三角形は高さ10〜41mm、本物の法面は最小78mm
            // (実機GLB 1/74・1/193の数値解析)なので、比の条件に『高さがSLIVER_MAX_ALTITUDE_MM未満』を加える。
            // 最短辺<100mm(角の楔)の条件は従来どおり。高さ=2×面積/最長辺。
            const altitudeMm = maxEdge>1e-9 ? (2*triArea/maxEdge)*1000 : 0;
            const SLIVER_MAX_ALTITUDE_MM = 60;
            if(minEdgeMm < SLIVER_MIN_EDGE_MM || (areaRatio < SLIVER_AREA_RATIO && altitudeMm < SLIVER_MAX_ALTITUDE_MM)) f.isSliver=true;
          }
        });

        // ★変更: スリバー面(isSliver)はtypeをSLOPE系のまま残すため、ここでのフィルタは
        // 従来通り「本物のIGNORE(法面としての傾き自体がない疑似壁など)」だけを除外する。
        // スリバー面は隣接グラフ構築のためにこの時点ではまだ含めておく。
        let facesForGraph;
        if(mode==='structure'){
          facesForGraph=faces.filter(f=>f.type!=='IGNORE' && f.projArea>0.001);
        }else{
          facesForGraph=faces.filter(f=>f.type!=='IGNORE' && f.projArea>0.001 && f.calcHeight>0.01);
        }
        faces=facesForGraph;
        // ★変更: 総面積にはスリバー面(橋渡し用に残しているだけの面)を含めない。
        faces.forEach(f=>{ if(!f.isSliver) _evTotalModelArea+=f.projArea; });

        const edges={};
        faces.forEach(f=>{
          const h0=_evHashVertex(f.v0), h1=_evHashVertex(f.v1), h2=_evHashVertex(f.v2);
          const addEdge=(ha,hb,vStart,vEnd)=>{
            const key=ha<hb?`${ha}|${hb}`:`${hb}|${ha}`;
            if(!edges[key]) edges[key]=[];
            edges[key].push({face:f, vDir:new THREE.Vector3().subVectors(vEnd,vStart)});
          };
          addEdge(h0,h1,f.v0,f.v1);
          addEdge(h1,h2,f.v1,f.v2);
          addEdge(h2,h0,f.v2,f.v0);
        });

        const uf=new _EvUnionFind();
        Object.values(edges).forEach(list=>{
          if(list.length===2){
            const f1=list[0].face, f2=list[1].face;
            if(f1.type===f2.type){
              const dot=f1.normal.dot(f2.normal);
              if(dot>0.99){
                if(mode==='structure'){
                  if(Math.abs(f1.distToOrigin-f2.distToOrigin)<0.05) uf.union(f1.id,f2.id);
                }else{
                  uf.union(f1.id,f2.id);
                }
              }else if(f1.type.includes('SLOPE') && !f1.isSliver && !f2.isSliver){
                // ★変更: スリバー面(退化三角形)は法線・辺方向のノイズが大きく、これを
                // 使って隣の本物の面の入隅/出隅を判定すると誤判定の元になるため、
                // どちらかがスリバーの場合はこの判定自体をスキップする(dot>0.99による
                // 上のマージ判定は影響を受けない=橋渡しは従来通り機能する)。
                const inPlaneVec=new THREE.Vector3().crossVectors(f1.normal,list[0].vDir).normalize();
                const sign=f2.normal.dot(inPlaneVec);
                if(sign<-0.001){ f1.hasConcave=true; f2.hasConcave=true; }
                else if(sign>0.001){ f1.hasConvex=true; f2.hasConvex=true; }
              }
            }
          }
        });

        const clusters={};
        faces.forEach(f=>{
          const rootId=uf.find(f.id);
          if(!clusters[rootId]) clusters[rootId]={type:f.type, projArea:0, hSum:0, hasConvex:false, hasConcave:false, faceCount:0, groupedFaces:[], renderFaces:[]};
          const c=clusters[rootId];
          // ★32回目セッション追記2: マスター実機報告「PNGで4-2と4-3の間に分割線が
          // 残る」への対応。前回の修正は「面積・高さ集計」と「隣接グラフの橋渡し」の
          // 役割は分離したが、「3D描画用ジオメトリ」からもスリバー面を一緒に除外して
          // いたため、スリバー面が元々埋めていた場所に本物の小さな隙間(穴)ができ、
          // EdgesGeometryがその穴の縁を正直に境界線として描いてしまっていた
          // (②と③が同一平面という事実自体には変わりなく、r072が想定していた
          // 「coplanarな内部辺は自動省略される」仕組みが、隙間のせいで機能しなかった
          // だけ)。renderFacesにはスリバーも含めて隙間なく埋め、面積・高さ集計と
          // Excel/PDFのサブフェイス行(groupedFaces)からは引き続き除外する。
          c.renderFaces.push(f);
          if(f.isSliver) return;
          c.projArea+=f.projArea; c.hSum+=f.calcHeight*f.projArea; c.faceCount++;
          c.groupedFaces.push(f);
          if(f.hasConvex) c.hasConvex=true;
          if(f.hasConcave) c.hasConcave=true;
        });

        _evAnalysisData=[];
        _evPendingSubLabels=[];
        let calcId=1, totalVolume=0;

        Object.values(clusters).forEach(c=>{
          if(c.projArea<0.01) return;
          const avgH=c.hSum/c.projArea;
          // r090(24回目・追加修正・項目12): 従来はearthwork(土量計算)限定のガードだった。
          // structure(通常計算)側でも、上部と下部の形状が同じ(=高さ差0)場合に
          // volume=0の計算が発生し、Excelに無意味な行が並ぶ・PDF/PNGの番号が
          // 同一座標に重複して読めなくなる、という不具合の報告を受け、mode制限を撤廃。
          // structure側もcalcHeight=avgY-yBaseなので、avgH≈0は「この面がちょうど
          // 基準面上にある=この面が寄与する柱体積は実質0」を正しく表しており、
          // 除外の理屈はearthwork側と同じ。
          if(avgH<=0.001) return;

          let hSeed=calcId*15485863;
          hSeed=(hSeed^(hSeed>>>13))*2654435761;
          hSeed=(hSeed^(hSeed>>>15));
          const hue=(hSeed>>>0)/4294967296;
          const highlightColor=new THREE.Color().setHSL(hue,0.85,0.55);
          const hexColor='#'+highlightColor.getHexString();

          const positions=[];
          // ★変更: 描画ジオメトリはgroupedFaces(数量集計用・スリバー除外済み)ではなく
          // renderFaces(スリバーも含む・隙間なし)から作る。数量・サブフェイス行への
          // 影響はゼロ(そちらは引き続きgroupedFacesを参照)。
          c.renderFaces.forEach(f=>{
            positions.push(f.v0.x,f.v0.y,f.v0.z, f.v1.x,f.v1.y,f.v1.z, f.v2.x,f.v2.y,f.v2.z);
          });
          const geom=new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
          geom.computeVertexNormals();

          const defaultOpacityValue=(mode==='structure')?30:75;
          const mat=new THREE.MeshLambertMaterial({color:highlightColor, side:THREE.DoubleSide, transparent:true, opacity:defaultOpacityValue/100, depthWrite:(mode!=='structure')});
          const mesh=new THREE.Mesh(geom,mat);
          if(c.type.includes('FLAT')||c.type==='BOTTOM') mesh.position.y+=0.02;
          // r070マスター指摘対応: PDF出力で面分割線が見えない件 → WebGLのlinewidthは
          // ほぼ全環境で1px固定される「1pxの壁」が原因(voldia3d.js内の別処理で既知の問題)。
          // 同一LineSegmentsを微小オフセットで5枚重ね描画し、モデル寸法に比例した
          // 太さ(どの縮尺でも書き出し解像度に対して数px相当)を確保する。
          const edgesGeo=new THREE.EdgesGeometry(geom);
          const edgeMat=new THREE.LineBasicMaterial({color:0x222222, linewidth:1});
          const _evLineW=_evModelScaleSize*0.0008;
          [[0,0],[_evLineW,0],[-_evLineW,0],[0,_evLineW],[0,-_evLineW]].forEach(([ox,oz])=>{
            const ln=new THREE.LineSegments(edgesGeo, edgeMat);
            ln.position.set(ox,0,oz);
            mesh.add(ln);
          });
          _evResultGroup.add(mesh);

          // r072マスター指摘対応①: 上のedgesGeoはクラスター(番号1個分)の外周だけしか出ない
          // (coplanarな内部三角形の境目はEdgesGeometryの仕様上省略される)。
          // そのため中の小さいサブフェイス番号(例:"7-3")がどの三角形を指すか分からなかった。
          // → PDF専用でWireframeGeometry(全三角形の辺を省略なしで出す)を別レイヤーに追加し、
          // isPdfMode時のみ表示する。
          const fineWireGeo=new THREE.WireframeGeometry(geom);
          const fineWireMat=new THREE.LineBasicMaterial({color:0x555555, linewidth:1, transparent:true, opacity:0.8});
          const _evFineLineW=_evModelScaleSize*0.0003;
          [[0,0],[_evFineLineW,0],[-_evFineLineW,0]].forEach(([ox,oz])=>{
            const fln=new THREE.LineSegments(fineWireGeo, fineWireMat);
            fln.position.set(ox, mesh.position.y, oz);
            _evFineLineGroup.add(fln);
          });

          let maxFace=c.groupedFaces[0];
          for(const f of c.groupedFaces){ if(f.projArea>maxFace.projArea) maxFace=f; }
          const fx=(maxFace.v0.x+maxFace.v1.x+maxFace.v2.x)/3;
          const fy=(maxFace.v0.y+maxFace.v1.y+maxFace.v2.y)/3;
          const fz=(maxFace.v0.z+maxFace.v1.z+maxFace.v2.z)/3;

          let objScale=Math.sqrt(c.projArea)*0.6;
          const minScale=_evModelScaleSize*0.025, maxScale=_evModelScaleSize*0.10;
          objScale=Math.max(minScale, Math.min(maxScale, objScale));
          const useDepthTest=(mode==='earthwork');
          const labelSprite=_evCreateNumberLabel(calcId, objScale, useDepthTest);
          labelSprite.position.set(fx, fy+(_evModelScaleSize*0.02), fz);
          _evResultGroup.add(labelSprite);

          const S=c.projArea;
          let calcType,note,K;
          if(mode==='structure'){
            if(c.type.includes('UPWARD')){
              calcType=c.type.includes('FLAT')?'天端・上部水平面':'上部斜面';
              note='正射投影鉛直柱体積算定 (加算)'; K=1.0;
            }else{
              calcType=c.type.includes('FLAT')?'天井・下部水平面':'下部斜面';
              note='正射投影鉛直柱体積算定 (控除)'; K=-1.0;
            }
          }else{
            if(c.type==='BOTTOM'){
              calcType='掘削底'; note='水平面鉛直柱体体積算定 (直柱体)'; K=1.0;
            }else{
              if(c.hasConcave&&c.hasConvex){ calcType='複雑法面'; note='複合傾斜面截頭柱体体積算定 (斜柱体)'; K=0.5; }
              else if(c.hasConcave||c.hasConvex){ calcType=c.hasConvex?'出隅部':'入隅部'; note='三次元不整角錐体積算定 (錐体分割)'; K=1/3; }
              else{ calcType='直線法面'; note='単一傾斜面截頭柱体体積算定 (斜柱体)'; K=0.5; }
            }
          }

          const displayH=avgH/Math.abs(K);
          const volume=S*displayH*K;

          const subFacesData=[];
          c.groupedFaces.forEach((f,idx)=>{
            const subS=f.projArea, subAvgH=f.calcHeight;
            const subDisplayH=subAvgH/Math.abs(K);
            const subVol=subS*subDisplayH*K;
            const subNo=`${calcId}-${idx+1}`;
            // r089(24回目・追加修正・項目11): 従来の「底辺×高さ÷2」は、高さの方が
            // 面積から逆算(2*area/base)された値だったため、検証者から見ると
            // 循環参照(面積の根拠が面積そのもの)になっており「根拠が無い」との
            // 指摘を受けた。実測可能な三角形の3辺の長さ(平面投影・XZ平面)に
            // 差し替える。第三者がこの3辺からヘロンの公式で独立に面積を
            // 検算できるようにするのが狙い。
            const dx01=f.v1.x-f.v0.x, dz01=f.v1.z-f.v0.z, side01=Math.sqrt(dx01*dx01+dz01*dz01);
            const dx12=f.v2.x-f.v1.x, dz12=f.v2.z-f.v1.z, side12=Math.sqrt(dx12*dx12+dz12*dz12);
            const dx20=f.v0.x-f.v2.x, dz20=f.v0.z-f.v2.z, side20=Math.sqrt(dx20*dx20+dz20*dz20);
            const areaFormula=`${side01.toFixed(3)}+${side12.toFixed(3)}+${side20.toFixed(3)}`;
            const h0=mode==='structure'?f.v0.y-yBase:z0-f.v0.y;
            const h1=mode==='structure'?f.v1.y-yBase:z0-f.v1.y;
            const h2=mode==='structure'?f.v2.y-yBase:z0-f.v2.y;
            const hFormula=`(${h0.toFixed(3)} + ${h1.toFixed(3)} + ${h2.toFixed(3)}) / 3 / ${Math.abs(K).toFixed(3)}`;

            if(subS>_evTotalModelArea*0.0001){
              const fcx=(f.v0.x+f.v1.x+f.v2.x)/3, fcy=(f.v0.y+f.v1.y+f.v2.y)/3, fcz=(f.v0.z+f.v1.z+f.v2.z)/3;
              let tinyScale=Math.sqrt(subS)*0.2;
              const minTinyScale=_evModelScaleSize*0.005, maxTinyScale=_evModelScaleSize*0.02;
              tinyScale=Math.max(minTinyScale, Math.min(maxTinyScale, tinyScale));
              // r091(24回目・追加チェック項目1): ここで即座にスプライトを追加せず、
              // 候補として一旦貯める。理由: 別クラスター(例: 柱)が別クラスター
              // (例: その真下の梁)の真上/真下にあると、上から見た平面図(PDF/PNG)では
              // XZ座標がほぼ一致し、ラベル同士が重なって読めなくなる不具合が
              // 報告された。全候補が出揃ってから衝突検出→ずらし処理を行うため、
              // ここでは位置とサイズの情報だけを記録する。
              _evPendingSubLabels.push({fcx, fcy, fcz, subNo, tinyScale});
            }

            subFacesData.push({subNo, id:f.id, areaFormula, hFormula, S:subS, H:subDisplayH, K, V:subVol});
          });

          _evAnalysisData.push({no:calcId++, type:calcType, location:`自動抽出グループ (面数:${c.faceCount})`, S, H:displayH, K, volume, note, color:hexColor, subFaces:subFacesData});
          totalVolume+=volume;
        });

        // r091(24回目・追加チェック項目1): 全サブラベル候補が出揃ったので、
        // 平面図(XZ)上での重なりを検出してずらし、実際にスプライト/引出線を生成する。
        _evResolveAndPlaceSubLabels();

        resolve({totalVolume, count:_evAnalysisData.length});
      }catch(err){ reject(err); }
    }, (err)=>reject(err));
  });
}

// エビル renderPlanView() の移植版。オフスクリーン専用シーンなので保存/復元は不要。
function _evRenderPlanView(exportWidth, isPdfMode){
  const box=new THREE.Box3().setFromObject(_evResultGroup);
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const savedMats=[];

  _evScene.background=new THREE.Color(0xffffff);
  if(isPdfMode){
    _evResultGroup.children.forEach(child=>{
      if(child.isMesh){
        savedMats.push({mesh:child, mat:child.material});
        child.material=new THREE.MeshBasicMaterial({color:0xffffff});
        child.children.forEach(c=>{ if(c.isLineSegments){ c.material.color.setHex(0x000000); c.visible=true; } });
      }else if(child.isSprite){ child.visible=false; }
    });
    // r072マスター指摘対応①④: PDFは細かいサブフェイス番号+その境界線を出す。
    // PNGは追2対応(大きい番号のみ)のため常にOFFにする。
    _evSubLabelGroup.visible=true;
    _evFineLineGroup.visible=true;
  }else{
    // r072マスター指摘対応(追2): PNGは①②など大きい番号だけでよい→細かい番号と細線を明示的に隠す
    _evSubLabelGroup.visible=false;
    _evFineLineGroup.visible=false;
  }

  const maxTexSize=_evRenderer.capabilities.maxTextureSize;
  const safeExportWidth=Math.min(exportWidth, maxTexSize);
  const safeExportHeight=Math.floor(safeExportWidth/1.414);
  _evRenderer.setSize(safeExportWidth, safeExportHeight, false);
  const aspect=safeExportWidth/safeExportHeight;

  const margin=1.05;
  const sizeX=size.x*margin, sizeZ=size.z*margin;
  let frustumHeight=sizeZ, frustumWidth=frustumHeight*aspect;
  if(frustumWidth<sizeX){ frustumWidth=sizeX; frustumHeight=frustumWidth/aspect; }

  const orthoCam=new THREE.OrthographicCamera(-frustumWidth/2,frustumWidth/2,frustumHeight/2,-frustumHeight/2, _evModelScaleSize*0.01, _evModelScaleSize*100);
  orthoCam.position.set(center.x, box.max.y+_evModelScaleSize*2.0, center.z);
  orthoCam.lookAt(center);

  _evRenderer.render(_evScene, orthoCam);
  const mimeType=isPdfMode?'image/jpeg':'image/png';
  const dataURL=_evRenderer.domElement.toDataURL(mimeType,1.0);

  if(isPdfMode){
    savedMats.forEach(item=>{
      if(item.mesh.material) item.mesh.material.dispose();
      item.mesh.material=item.mat;
      item.mesh.children.forEach(c=>{ if(c.isLineSegments) c.material.color.setHex(0x222222); });
    });
    _evResultGroup.children.forEach(child=>{ if(child.isSprite) child.visible=true; });
    _evSubLabelGroup.visible=false;
    _evFineLineGroup.visible=false;
  }
  return dataURL;
}

// エビル generateExcelData() の移植版
function _evGenerateExcelData(){
  const fontFamily="メイリオ";
  const headerStyle={fill:{fgColor:{rgb:"2C3E50"}}, font:{name:fontFamily,sz:10,color:{rgb:"FFFFFF"},bold:true}, alignment:{horizontal:"center",vertical:"center"}, border:{top:{style:"thin",color:{rgb:"000000"}},bottom:{style:"thin",color:{rgb:"000000"}}}};
  const parentStyle={fill:{fgColor:{rgb:"E8F8F5"}}, font:{name:fontFamily,sz:10,bold:true,color:{rgb:"111111"}}, alignment:{vertical:"center"}, border:{top:{style:"thin",color:{rgb:"BDC3C7"}},bottom:{style:"thin",color:{rgb:"BDC3C7"}}}};
  const parentNumStyle=Object.assign({},parentStyle,{alignment:{horizontal:"right",vertical:"center"}});
  const childStyle={font:{name:fontFamily,sz:10,color:{rgb:"555555"}}, alignment:{vertical:"center"}};
  const childNumStyle=Object.assign({},childStyle,{alignment:{horizontal:"right",vertical:"center"}});
  const totalStyle={fill:{fgColor:{rgb:"FADBD8"}}, font:{name:fontFamily,sz:10,bold:true,color:{rgb:"C0392B"}}, alignment:{vertical:"center"}, border:{top:{style:"double",color:{rgb:"C0392B"}},bottom:{style:"thin",color:{rgb:"C0392B"}}}};
  const totalNumStyle=Object.assign({},totalStyle,{alignment:{horizontal:"right",vertical:"center"}});

  const cautionStyle={font:{name:fontFamily,sz:11,bold:true,color:{rgb:"C0392B"}}, alignment:{horizontal:"left",vertical:"center"}};

  const sheetData=[
    // 新4(2026-08-28 引継ぎ18回目マスター指示): 出力データ冒頭に参考値注記を追加
    [{v:'このアプリの値は参考値です。値を使用する前に必ず、自分で確認をしましょう。',s:cautionStyle}],
    [],
    ['No.','ブロック種別 / 明細','箇所 / 平面積根拠','平面積 S (m²)','公式換算深さ H (m)','形状係数 K','体積 V (m³)','備考'].map(text=>({v:text,s:headerStyle}))
  ];
  let currentRow=4;

  _evAnalysisData.forEach(d=>{
    const childrenStartRow=currentRow+1, childrenEndRow=currentRow+d.subFaces.length;
    sheetData.push([
      {v:d.no.toString(),s:parentStyle},
      {v:d.type,s:parentStyle},
      {v:d.location,s:parentStyle},
      {t:'n',v:d.S,z:"0.000",f:`SUBTOTAL(9, D${childrenStartRow}:D${childrenEndRow})`,s:parentNumStyle},
      {t:'n',v:d.H,z:"0.000",s:parentNumStyle},
      {t:'n',v:d.K,z:"0.000",s:parentNumStyle},
      {t:'n',v:d.volume,z:"0.000",f:`SUBTOTAL(9, G${childrenStartRow}:G${childrenEndRow})`,s:parentNumStyle},
      {v:`${d.note}`,s:parentStyle}
    ]);
    currentRow++;
    d.subFaces.forEach((sub,idx)=>{
      const isLast=idx===d.subFaces.length-1;
      const branchChar=isLast?'└':'├';
      sheetData.push([
        {v:`  ${sub.subNo}`,s:childStyle},
        {v:`  ${branchChar} ポリゴン #${sub.id}`,s:childStyle},
        {v:`[3辺] ${sub.areaFormula}`,s:childStyle},
        {t:'n',v:sub.S,z:"0.000",s:childNumStyle},
        {t:'n',v:sub.H,z:"0.000",s:childNumStyle},
        {t:'n',v:sub.K,z:"0.000",s:childNumStyle},
        {t:'n',v:sub.V,z:"0.000",f:`D${currentRow}*E${currentRow}*F${currentRow}`,s:childNumStyle},
        {v:`[H根拠] ${sub.hFormula}`,s:childStyle}
      ]);
      currentRow++;
    });
  });

  const totalRowIndex=currentRow;
  sheetData.push([
    {v:'合計',s:totalStyle},{v:'',s:totalStyle},{v:'',s:totalStyle},{v:'',s:totalStyle},{v:'',s:totalStyle},
    {v:'総合計体積',s:totalStyle},
    {t:'n',v:0,z:"0.000",f:`SUBTOTAL(9, G4:G${totalRowIndex-1})`,s:totalNumStyle},
    {v:'',s:totalStyle}
  ]);

  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols']=[{wch:8},{wch:22},{wch:28},{wch:14},{wch:16},{wch:12},{wch:14},{wch:45}];
  XLSX.utils.book_append_sheet(wb, ws, "求積計算書 (明細ツリー)");
  // r028(30回目セッション、マスター指摘対応「Excelのオシャレ感が直ってない」・真因特定):
  // r027で_evMergeABExcel側にXLSX.read(...,{cellStyles:true})を追加したが、実際には
  // xlsx-js-style(v1.2.0)はcellStyles:trueを付けても読み込み時にfill色の一部しか
  // 復元できず、font(太字・文字色)やborder(罫線)は最初から失われる。しかも一度
  // read()で読み直した後にもう一度XLSX.write()すると、そのfillすら消えることを
  // Node.jsで実証確認した(xlsx-js-styleのread⇄writeはスタイルの往復に対応していない)。
  // つまり「バイナリに一度書き出してから読み直して束ねる」という設計自体がスタイル
  // 崩壊の原因であり、cellStyles:trueはその場しのぎにしかならない。
  // 対策: この関数の計算・スタイル定義(sheetData/headerStyle等)は一切変更せず、
  // 組み立て済みの生のワークシートオブジェクト(ws)自体も一緒に返すようにした。
  // 呼び出し元(_evMergeABExcel)はこのwsをそのまま新しいworkbookに追加するだけで
  // 済むため、バイナリへのシリアライズ→デシリアライズを一度も経由せず、
  // スタイルの欠落が原理的に起こり得ない。
  return {buffer: XLSX.write(wb,{bookType:'xlsx',type:'array'}), ws};
}

// r019(29回目セッション、段階2): (A)(B)2つのxlsxバイナリ(それぞれ_evGenerateExcelData()の
// 戻り値そのまま)を1ワークブックにマージし、(A)-(B)の総合計シートを追加する。
// _evGenerateExcelData自体(エビル本体)は一切変更せず、出来上がった完成品を
// XLSX.read()で読み直して束ねるだけの、orchestrator層(呼び出し元)での組み立て処理。
// r028(30回目セッション、マスター指摘対応): 上記の「バイナリを読み直して束ねる」設計が
// スタイル崩壊の真因だったため、read()を廃止。_evGenerateExcelData()が計算と同時に
// 返すようになった生のワークシートオブジェクト(wsA/wsB)をそのまま受け取って
// 新しいworkbookに追加するだけにした。
// r126b(44回目・マスター要望): 差引後(C)の計算書も同じxlsxに入れる。wsC/totalCは省略可(Cが作れなかった時は従来どおり(A)(B)のみ)。
//   Cは(A)-(B)の形状を別に解析した結果なので、総合計(A)-(B)とは数値が少し違うことがある。総合計シートには参考行として並べるだけで、総合計の値は変えない。
function _evMergeABExcel(wsA, wsB, totalA, totalB, finalTotal, wsC, totalC){
  const summaryData = [
    ['項目', '体積(m³)'],
    ['(A) 基本形状', totalA],
    ['(B) 既存躯体重複(控除)', totalB],
    ['総合計 (A)-(B)', finalTotal]
  ];
  if(wsC) summaryData.push(['(C) 差引後の形状(参考・別解析)', totalC]);
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols']=[{wch:24},{wch:14}];
  // r029(30回目セッション、マスター報告「Excelに色が無い」の残り分・原因特定):
  // r028で(A)(B)シート自体のスタイル欠落は直っていたが、このメソッドが新規に組み立てる
  // 「総合計」シートには元々一度もスタイルを設定していなかった(単純な見落とし)。
  // マスターがブラウザ版で開いた時に最初に目に入るのはこの総合計シートである可能性が高く、
  // それで「色が無い」と見えていたと思われる。(A)(B)シートの見出し行と揃えたスタイルを
  // ここで新規に定義する(_evGenerateExcelData側のスタイル定義には一切触れていない)。
  const headerStyle = {
    fill:{fgColor:{rgb:"FF2C3E50"}},
    font:{bold:true, color:{rgb:"FFFFFFFF"}, sz:10, name:"メイリオ"},
    alignment:{horizontal:'center', vertical:'center'},
    border:{top:{style:'thin'}, bottom:{style:'thin'}}
  };
  const totalRowStyle = {
    fill:{fgColor:{rgb:"FFE8F8F5"}},
    font:{bold:true, sz:10, name:"メイリオ"},
    border:{top:{style:'thin'}, bottom:{style:'thin'}}
  };
  ['A1','B1'].forEach(ref=>{ if(wsSummary[ref]) wsSummary[ref].s = headerStyle; });
  ['A4','B4'].forEach(ref=>{ if(wsSummary[ref]) wsSummary[ref].s = totalRowStyle; });

  const merged = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(merged, wsSummary, "総合計");
  XLSX.utils.book_append_sheet(merged, wsA, "(A)基本形状");
  XLSX.utils.book_append_sheet(merged, wsB, "(B)既存躯体重複");
  if(wsC) XLSX.utils.book_append_sheet(merged, wsC, "(C)差引後"); // r126b
  return XLSX.write(merged, {bookType:'xlsx', type:'array'});
}

// エビル generatePDFData() の移植版
function _evGeneratePDFData(){
  const imgData=_evRenderPlanView(4096,true);
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a3"});
  doc.addImage(imgData,'JPEG',0,0,420,297);
  return doc.output('arraybuffer');
}

// r070マスター指摘対応②: データ出力完了時の目立つ注意書き付きダイアログ。
// 既存のconfirm-modal(HTML側で定義済み・_confirmQueueで直列化)を流用しつつ、
// このダイアログだけ横長・注意書き強調のためinnerHTMLとwidth指定を一時的に上書きする。
function _evShowCompleteDialog(summaryLine){
  const run = ()=> new Promise(resolve=>{
    const m=document.getElementById('confirm-modal');
    const c=m.querySelector('.modal-c');
    const msgEl=document.getElementById('confirm-modal-msg');
    const iconEl=document.getElementById('confirm-modal-icon');
    const prevWidth=c.style.width, prevMaxWidth=c.style.maxWidth;
    const prevWS=msgEl.style.whiteSpace, prevTA=msgEl.style.textAlign;
    const prevIcon=iconEl.textContent;

    c.style.width='560px'; c.style.maxWidth='92vw';
    msgEl.style.whiteSpace='normal'; msgEl.style.textAlign='left';
    iconEl.textContent='📊';
    msgEl.innerHTML =
      `<div style="text-align:center;font-weight:bold;font-size:1.05em;margin-bottom:10px;">データ出力が完了しました</div>`+
      `<div style="text-align:center;color:#b0bec5;font-size:.85em;margin-bottom:14px;">${summaryLine}</div>`+
      `<div style="background:#4a3300;border:1px solid #ffb300;border-radius:6px;padding:10px 14px;color:#ffd54f;font-weight:bold;font-size:.85em;line-height:1.7;">`+
      `⚠ 3D表示とExcelでは体積の計算方法が異なるため、多少の誤差が生じます`+
      `</div>`;

    m.style.display='flex';
    const yesBtn=document.getElementById('confirm-modal-yes');
    const noBtn=document.getElementById('confirm-modal-no');
    const prevLabel=yesBtn.textContent;
    yesBtn.textContent='OK';
    noBtn.style.display='none';
    const cleanup=()=>{
      m.style.display='none';
      yesBtn.textContent=prevLabel;
      noBtn.style.display='';
      msgEl.innerHTML='';
      msgEl.style.whiteSpace=prevWS; msgEl.style.textAlign=prevTA;
      iconEl.textContent=prevIcon;
      c.style.width=prevWidth; c.style.maxWidth=prevMaxWidth;
      resolve();
    };
    yesBtn.addEventListener('click',cleanup,{once:true});
  });
  const next=_confirmQueue.then(run);
  _confirmQueue=next.catch(()=>{});
  return next;
}

// メインエントリ: ボタンから呼ばれる。mode='structure'(躯体解析) or 'earthwork'(掘削土量解析)
async function runEvidenceAnalysis(mode){
  // 【問題A・将来課題の記録・2026-08-24マスター指示】現状はアイデア2(エビル側の
  // SLOPE判定閾値0.2)＋問題B(垂直面回避ハックの固定15mmオフセット化)のみ実装し、
  // アイデア3(エビル計算専用にテーパー0度の別GLBを都度再生成する案)は複雑さ・
  // Manifoldクラッシュリスクに対して得られる精度改善が小さいと判断し保留にしている。
  // ただし将来、現場データで想定外に大きい誤差や壁面誤認が再発した場合は、
  // アイデア3(buildManifoldUnionGeom等にテーパー無効化フラグを追加し、データ出力
  // ボタン押下時だけ表示用キャッシュ(_lastGeoms)をバイパスして再計算する方式)が
  // 次の一手になる。詳細な比較検討は「Voldia 3Dメッシュ生成およびエビル統合に
  // 関する改修方針.md」(2026-08-24マスター作成)を参照。
  const btnId=mode==='structure'?'btn-analyze-structure':'btn-analyze-earthwork';
  const btn=document.getElementById(btnId);
  const btnGlb=document.getElementById('btn-glb'); // r070: GLB出力は本機能に統合済み、単体ボタンはOFFのまま
  if(btn)btn.disabled=true;
  const epTitleEl=document.getElementById('exp-prog')?.querySelector('.ep-title');
  if(epTitleEl) epTitleEl.textContent='⚙ データ出力（Excel/PNG/PDF/GLB）生成中...';
  document.getElementById('exp-prog').classList.add('show');
  epSet(0,'Union水密メッシュを準備中...');
  await new Promise(r=>setTimeout(r,20));
  try{
    // r019(29回目セッション): 土量計算(earthwork)モードの時だけ既存躯体をGLBから除外。
    // 躯体解析(structure)モードは用途未確認のため従来通り(除外しない)を維持。
    const {glb, meshes: meshesA, totalVerts, totalTris}=await buildVoldiaGLBBytes(epSet, mode==='earthwork');
    epSet(45,'メッシュ解析中（面分類・グルーピング）...');
    await new Promise(r=>setTimeout(r,20));
    const {totalVolume, count}=await _evRunAnalysis(mode, glb);
    if(count===0){
      throw new Error('計算対象となる面が抽出できませんでした');
    }
    epSet(60,'Excel計算書を生成中...');
    await new Promise(r=>setTimeout(r,20));
    const {buffer: excelDataA, ws: wsExcelA} = _evGenerateExcelData();

    epSet(75,'配置図(PNG)を生成中...');
    await new Promise(r=>setTimeout(r,20));
    const pngDataUrlA=_evRenderPlanView(2048,false);
    const pngBase64A=pngDataUrlA.split(',')[1];

    epSet(88,'全明細CAD図面(PDF)を生成中...');
    await new Promise(r=>setTimeout(r,20));
    const pdfDataA=_evGeneratePDFData();

    // r019(29回目セッション、段階2): マスター方針(2026-09-15)に基づき、earthworkモードのみ
    // (B)既存躯体重複ソリッドを別GLB・別パスでエビル解析し、Excel/PNG/PDFを(A)(B)の2系統で
    // 出力、最終合計は(A)-(B)とする。_evRunAnalysis/_evGenerateExcelData/_evRenderPlanView/
    // _evGeneratePDFDataなどエビル本体は一切変更せず、同じAPIを2回叩くだけに留めている。
    // (B)側でエラーが出た場合はexcelData等をログに残しつつ(A)のみの出力にフォールバックする。
    //
    // r020(29回目セッション、緊急停止): マスター実測データで buildExistingStructureOverlapMesh
    // 自体の体積計算に系統的な誤差(法面区間で最大30〜40%の過小評価)があることが確定した。
    // 原因は「輪郭が区間内で連続的に変形するのに2端点だけ、または中点固定の押し出しで
    // loftしている」ことにあると特定できたが、修正版(細分化・段差スタック方式)も
    // 実データ検証(期待6.864m³に対し4.59〜5.60m³)でまだ合わず、今回のセッション内では
    // 直しきれなかった。誤った数値をExcelに出すのは「対処療法」そのものであり、
    // (A)のみの出力(r019で二重カウントは解消済み・信頼できる)にフォールバックする方が
    // 安全と判断し、(B)パイプライン全体を一時的に無効化する。
    // r021(30回目セッション): voldia3d.js側のbuildExistingStructureOverlapMesh内
    // emitLayer()にあった二重計上バグ(段差面の追加が不要かつ有害だった)を特定・修正した。
    // Node.jsでの合成データ検証(線形/非線形テーパーとも)では収束を確認できたが、
    // マスターの実測データ(法面あり・doboku)での最終確認はまだ済んでいない。
    // テストのためtrueに戻すが、[DIAG-B](voldia3d.js)と[DIAG-B-GLB](本ファイル)の
    // コンソールログで基準値6.864m³との一致を必ず確認してから本採用とすること。
    // 一致しない場合は速やかにfalseへ戻すこと(過去2回、机上の修正が実機で誤りと
    // 判明した実績があるため)。
    const B_PIPELINE_ENABLED = true;
    let totalVolumeB=0, glbB=null, meshesB=null, meshesG=null, excelDataB=null, wsExcelB=null, pngBase64B=null, pdfDataB=null;
    if(B_PIPELINE_ENABLED && mode==='earthwork'){
      try{
        epSet(90,'(B)既存躯体重複を解析中...');
        const bResult = await buildExistingStructureOverlapGLBBytes(epSet);
        if(bResult && bResult.glb){
          glbB = bResult.glb;
          meshesB = bResult.meshes;
          meshesG = bResult.structMeshes || null; // r127: (C)専用
          const evB = await _evRunAnalysis(mode, glbB);
          if(evB.count>0){
            totalVolumeB = evB.totalVolume;
            const excelResultB = _evGenerateExcelData();
            excelDataB = excelResultB.buffer;
            wsExcelB = excelResultB.ws;
            const pngDataUrlB=_evRenderPlanView(2048,false);
            pngBase64B = pngDataUrlB.split(',')[1];
            pdfDataB = _evGeneratePDFData();
          }
        }
      }catch(e){
        console.warn('[B側] 既存躯体重複の解析に失敗、(A)のみで続行します:', e);
        totalVolumeB=0; glbB=null; meshesB=null; meshesG=null; excelDataB=null; wsExcelB=null; pngBase64B=null; pdfDataB=null;
      }
    }
    const finalTotal = totalVolume - totalVolumeB;

    // r126(44回目・マスター要望): (C)=(A)-(B)=差引後の形状も、(A)(B)と同じ方法でPNG/PDF/GLBに出力する。
    // 既存の(A)(B)の解析・出力には一切触れず、(B)が出せた時だけ、同じAPI(_evRunAnalysis/_evRenderPlanView/_evGeneratePDFData)をもう1回叩く。
    // 失敗しても(A)(B)の出力は従来どおり(Cだけ出ない)。
    let meshesC=null, pngBase64C=null, pdfDataC=null, totalVolumeC=0, wsExcelC=null;
    if(mode==='earthwork' && glbB && meshesA && meshesB){
      try{
        epSet(93,'(C)差引後の形状を生成・解析中...');
        await new Promise(r=>setTimeout(r,20));
        const net = await _buildNetMeshes(meshesA, meshesB, undefined, meshesG);
        if(net){
          const glbC = encodeMultiGLB(net.meshes);
          const evC = await _evRunAnalysis(mode, glbC);
          if(evC.count>0){
            totalVolumeC = evC.totalVolume;
            wsExcelC = _evGenerateExcelData().ws; // A/Bと同じ手順(PNG/PDFの前にExcel用データ生成)。r126b(マスター要望): このwsを(C)差引後シートとしてxlsxにも入れる
            pngBase64C = _evRenderPlanView(2048,false).split(',')[1];
            pdfDataC = _evGeneratePDFData();
            meshesC = net.meshes;
            console.log(`[C側] 差引後(A-B): メッシュ体積 ${net.volumeM3.toFixed(3)}m³ / エビル解析合計 ${totalVolumeC.toFixed(3)}m³ / (A)-(B)エビル合計 ${finalTotal.toFixed(3)}m³`);
          }
        }
      }catch(e){
        console.warn('[C側] 差引後の解析に失敗、(A)(B)のみで続行します:', e);
        meshesC=null; pngBase64C=null; pdfDataC=null; totalVolumeC=0; wsExcelC=null;
      }
    }

    epSet(95,'ZIPに圧縮中...');
    await new Promise(r=>setTimeout(r,20));
    // r046(41回目): 命名規則を「Voldia_○○export_yymmdd_hhmm」(○○=Structure/Earthwork)に変更(マスター指示: 全出力ファイルを「名前_日付」+日付はyymmdd_hhmmに統一)。
    // 旧(r072): 「YYMMDDHHMMSS_Voldia_○○export」(日付が先頭・秒まで)
    const modeWord=(mode==='structure')?'Structure':'Earthwork';
    const baseName=`Voldia_${modeWord}export_${getVoldiaTimestamp()}`;
    // r025(30回目セッション、マスター指摘対応): ZIP内の各ファイルの更新日時をフォルダ名と
    // 同じJST時刻に揃える(voldia3d.js側のgetVoldiaZipDate()のコメント参照)
    const _zipDate=getVoldiaZipDate();

    const zip=new JSZip();
    // r030(30回目セッション、マスター指示「(A)は内側テクスチャ(すり鉢状)・(B)は
    // 外側テクスチャ(個体)にしたい」への対応): 実際にGLBをバイナリ解析し、発散定理で
    // 符号付き体積を計算して現状の巻き方向を確認した結果、(A)=Voldia_Unionは現状
    // OUTWARD(標準的な立体=外側から見える)、(B)=Voldia_OverlapForExcelは現状
    // INWARD(法線が反転=内側からしか見えない)と判明。マスターの要望とはちょうど逆
    // だったので、ZIPに書き出す表示用GLBだけ両方ともflipWinding:trueで反転する。
    // 体積計算(_evRunAnalysis)に使った glb/glbB 自体はここでは一切触れておらず、
    // ZIP用に meshesA/meshesB からもう一度encodeMultiGLBを呼び直しているだけなので、
    // 検証済みの体積の値には影響しない。
    const glbForZipA = meshesA ? encodeMultiGLB(meshesA.map(m=>({...m, flipWinding:true}))) : glb;
    const glbForZipB = meshesB ? encodeMultiGLB(meshesB.map(m=>({...m, flipWinding:true}))) : glbB;
    // r027(30回目セッション、マスター指示): ファイル名を日本語化。(A)=通常体積、
    // (B)=減算分。JSZipはUTF-8ファイル名をデフォルトで正しく扱う(Pythonのzipfileと
    // 違ってエンコーディングフラグを別途立てる必要はない)。
    if(excelDataB){
      const mergedExcel=_evMergeABExcel(wsExcelA, wsExcelB, totalVolume, totalVolumeB, finalTotal, wsExcelC, totalVolumeC);
      zip.file(`${baseName}.xlsx`, mergedExcel, {date:_zipDate});
      zip.file(`${baseName}_通常体積.png`, pngBase64A, {base64:true, date:_zipDate});
      zip.file(`${baseName}_減算分.png`, pngBase64B, {base64:true, date:_zipDate});
      zip.file(`${baseName}_通常体積.pdf`, pdfDataA, {date:_zipDate});
      zip.file(`${baseName}_減算分.pdf`, pdfDataB, {date:_zipDate});
      zip.file(`${baseName}_通常体積.glb`, glbForZipA, {date:_zipDate});
      zip.file(`${baseName}_減算分.glb`, glbForZipB, {date:_zipDate});
      // r126(44回目): (C)=(A)-(B) 差引後(実際に掘る形)。名前は (A)通常体積・(B)減算分 に並べて「差引後」
      if(pngBase64C && pdfDataC && meshesC){
        zip.file(`${baseName}_差引後.png`, pngBase64C, {base64:true, date:_zipDate});
        zip.file(`${baseName}_差引後.pdf`, pdfDataC, {date:_zipDate});
        zip.file(`${baseName}_差引後.glb`, encodeMultiGLB(meshesC.map(m=>({...m, flipWinding:true}))), {date:_zipDate});
      }
      // r024(30回目セッション、マスター指示): (A)+(B)合体GLBを追加。既存の2つの
      // encodeMultiGLB呼び出し結果(バイナリ)を後から結合するのではなく、それぞれが
      // 使った生メッシュ配列(meshesA/meshesB、ノード名で区別済み)をそのまま連結して
      // encodeMultiGLBをもう一度呼ぶだけ。エビル本体・(A)(B)個別の計算ロジックには
      // 一切触れていない(組み立て層のみの追加)。
      // r030: 合体版も表示用なので同様に両方flipWinding:trueで統一する。
      if(meshesA && meshesB){
        const glbCombined = encodeMultiGLB([...meshesA, ...meshesB].map(m=>({...m, flipWinding:true})));
        zip.file(`${baseName}.glb`, glbCombined, {date:_zipDate});
      }else{
        zip.file(`${baseName}.glb`, glbForZipA, {date:_zipDate}); // 万一meshesが取れなかった場合は(A)のみで代替
      }
    }else{
      zip.file(`${baseName}.xlsx`, excelDataA, {date:_zipDate});
      zip.file(`${baseName}.png`, pngBase64A, {base64:true, date:_zipDate});
      zip.file(`${baseName}.pdf`, pdfDataA, {date:_zipDate});
      zip.file(`${baseName}.glb`, glbForZipA, {date:_zipDate}); // r070(マスター指示): GLBも一緒に出力。(B)未使用時は(A)がそのまま唯一のGLB。r030でflipWinding適用
    }

    const zipBlob=await zip.generateAsync({type:'blob'});
    epSet(100,'完了！');
    const url=URL.createObjectURL(zipBlob);
    const a=Object.assign(document.createElement('a'),{href:url, download:`${baseName}.zip`});
    document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);

    document.getElementById('exp-prog').classList.remove('show');
    if(btn)btn.disabled=false;
    _evShowCompleteDialog(`${count}ブロック / 総合計 ${finalTotal.toFixed(2)} m³ / ${totalVerts}頂点`);
  }catch(e){
    console.error(e);
    document.getElementById('exp-prog').classList.remove('show');
    if(btn)btn.disabled=false;
    toast(`⚠ データ出力の生成に失敗しました: ${e.message||e}`, 4000);
  }
}
