// ════════════════════════════════════════════════════════════
//  Land Logic (r001, 34回目セッション新設)
//  ------------------------------------------------------------
//  目的: LandXML(TIN)出力に向けた試験用GLBを生成する、既存の表示/積算ロジック
//  (buildShellMesh・buildManifoldUnionGeom・buildExistingStructureOverlapMesh等)
//  とは完全に独立した別ファイル。既存ファイルへの変更は最小限の2点のみ
//  (voldia3d.js側、いずれも追記のみ・既存呼び出しへの影響なし):
//    ①土量計算完了時、計算に使ったfrustum一式とオフセットをwindowにキャッシュ
//    ②buildManifoldUnionGeomにGL蓋除去の可否を選べる第5引数(opts.removeGLCap)を追加
//
//  設計方針(マスターとの合意、2026-09-29):
//   ・通常(blue)+山留(purple)オブジェクト → 傾斜を強制ON、GL蓋は除去(蓋が消える)
//   ・既存躯体(gray)オブジェクト → 傾斜を強制ON、下端をサイト全体の最深値まで
//     延長(=「下端∞」の実装)、GL蓋は残す(床が消える。Manifold.differenceで
//     引かれる側になるため、床自体は結果に出てこない)
//   ・最終形状 = Manifold.difference([通常+山留のunion, 既存躯体のunion])
//   ・傾斜角度は3Dイメージで現在設定されている値(getSlopeRatio())をそのまま使う
//   ・卍のManifoldErrorは対象外と割り切る(マスター判断)
//
//  使い方(テスト段階): 3Dイメージで「土量計算」を実行した状態でShift+Lを押すと、
//  Test3D.glbがダウンロードされる。専用UIボタンは未設置(要望があれば追加)。
//
//  【未検証の注記】このファイルはNode.js上でManifold.union/differenceの
//  パイプライン自体が動くことは確認済み(簡易な箱2個での検証)だが、実際の
//  Voldiaデータ(複雑な多角形・複数オブジェクト・穴あり形状等)でのブラウザ実機
//  検証はまだ行っていない。特に「卍」以外でも、既存躯体の傾斜裾と掘削の傾斜面が
//  接触・タンジェントになる境界でManifoldErrorが出る可能性はゼロではない。
// ════════════════════════════════════════════════════════════

(function(){
  // r004(実機検証で判明・修正): 既存躯体を「傾斜frustum」+「noSlope:true延長frustum」の
  // 2個をbuildManifoldUnionGeomのUnionで繋ぐ方式は、noSlope全般に自動で乗る
  // DOBOKU_VERTICAL_TAPER_FIXED_MM(数値安定化用の固定15mmテーパー)が延長パーツ側にも
  // 独立にかかってしまい、傾斜パーツの下端(offset=OD)と延長パーツの上端
  // (offset=OD+15mm)の間に15mm程度のズレが生まれ、Unionでの溶接が甘くなって
  // 「2つの物体」に見える不具合があった(マスター実機報告・2026-09-29)。
  // 対策: Unionに頼らず、offsetPolygon()を直接2回呼んで(天端用・元の下端用)
  // 1つの頂点配列で「天端キャップ→傾斜側面→元の下端(=延長部の断面と共有、継ぎ目なし)
  // →垂直側面→深い底キャップ」を直接縫う、単一の水密メッシュとして構築する。
  function buildGrayPlugMesh(f, targetBotMm){
    if(f.holesMm && f.holesMm.length){
      console.warn('[LAND-LOGIC] 穴(holesMm)を持つ既存躯体は今回未対応のため、このオブジェクトはスキップします');
      return null;
    }
    const SC = 0.001; // mm→m
    const origD = f.D, origTl = f.tl||0;
    
    // 【AIS修正】CSG演算での共平面（重なり）干渉を防ぐため、1mmのブーリアンマージンを追加
    const BOOLEAN_MARGIN = 1.0; 
    const topOffset = (f.OD||0) + origD * getSlopeRatio() + BOOLEAN_MARGIN;
    const botOffset = (f.OD||0) + BOOLEAN_MARGIN;
    const topRing = offsetPolygon(f.ptsMm, topOffset);
    const botRing = offsetPolygon(f.ptsMm, botOffset); // 元の下端。延長部の断面としてそのまま共有する
    const n = topRing.length;
    if(botRing.length !== n){
      console.warn('[LAND-LOGIC] 天端/下端オフセットで頂点数が変化した(自己交差)ため、このオブジェクトはスキップします');
      return null;
    }
    
    // 【AIS修正】天端も確実に突き抜けさせるために上方向へマージンを追加
    const yTop  = (-origTl - BOOLEAN_MARGIN) * SC;
    const yBot  = (origD - origTl) * SC;
    const yDeep = (targetBotMm - origTl) * SC;

    const positions = [];
    topRing.forEach(p=>positions.push(p.x*SC, yTop, p.y*SC));
    botRing.forEach(p=>positions.push(p.x*SC, yBot, p.y*SC));
    botRing.forEach(p=>positions.push(p.x*SC, yDeep, p.y*SC)); // 深い底(XYはbotRingと同一)
    
    // 【AIS修正】側面①のねじれ解消用。四角形の重心(Center)の頂点インデックス開始位置を定義
    const T=0, B=n, D=2*n, C=3*n; 
    
    // 重心(Center)頂点の計算と追加 (側面①用)
    for(let i=0; i<n; i++){
        const j = (i+1)%n;
        const px = (topRing[i].x + topRing[j].x + botRing[j].x + botRing[i].x) / 4 * SC;
        const py = (yTop + yTop + yBot + yBot) / 4;
        const pz = (topRing[i].y + topRing[j].y + botRing[j].y + botRing[i].y) / 4 * SC;
        positions.push(px, py, pz);
    }

    const idx = [];

    const flatTop=[]; topRing.forEach(p=>flatTop.push(p.x,p.y));
    const flatBot=[]; botRing.forEach(p=>flatBot.push(p.x,p.y));

    // 天端キャップ(上向き)
    const capTop = earcut(flatTop, null, 2);
    for(let i=0;i<capTop.length;i+=3){ idx.push(T+capTop[i], T+capTop[i+2], T+capTop[i+1]); }

    // 側面①: 天端→元の下端(傾斜) - 【AIS修正】対角線分割をやめ、重心(Center)に向かう4分割でねじれを殺す
    for(let i=0;i<n;i++){ const j=(i+1)%n;
      const c_idx = C + i;
      // 面の表裏を維持するため、外周のループ順 (T+i -> T+j -> B+j -> B+i -> T+i) に沿って三角形を張る
      idx.push(T+i, T+j, c_idx);
      idx.push(T+j, B+j, c_idx);
      idx.push(B+j, B+i, c_idx);
      idx.push(B+i, T+i, c_idx);
    }
    
    // 側面②: 元の下端→深い底(垂直延長、上下でXYが完全に同一なためねじれは生じない。元のまま)
    for(let i=0;i<n;i++){ const j=(i+1)%n;
      idx.push(B+i, D+j, D+i);
      idx.push(B+i, B+j, D+j);
    }
    // 深い底キャップ(下向き)
    const capDeep = earcut(flatBot, null, 2);
    for(let i=0;i<capDeep.length;i+=3){ idx.push(D+capDeep[i], D+capDeep[i+1], D+capDeep[i+2]); }

    return { vertProperties: new Float32Array(positions), triVerts: new Uint32Array(idx), numProp: 3 };
  }

  function _llReady(){
    const modal = document.getElementById('calc-modal');
    return !!(modal && modal.classList.contains('show') && window._lastCalcModeForPlacement === 'doboku');
  }

  document.addEventListener('keydown', function(e){
    if(e.key !== 'L' && e.key !== 'l') return;
    if(!e.shiftKey) return;
    if(!_llReady()){
      console.log('[LAND-LOGIC] Shift+Lは「3Dイメージで土量計算を実行した直後」のみ有効です');
      return;
    }
    e.preventDefault();
    buildAndDownloadLandLogicGLB().catch(function(err){
      console.error('[LAND-LOGIC] 生成に失敗しました:', err);
      alert('Land Logic生成に失敗しました。コンソールのログを確認してください。');
    });
  });

  async function buildAndDownloadLandLogicGLB(){
    const fs = window._lastCalcFrustumsForLandLogic;
    const offsetX = window._lastCalcOffsetXForLandLogic;
    const offsetY = window._lastCalcOffsetYForLandLogic;
    if(!fs || !fs.length){
      console.warn('[LAND-LOGIC] frustumデータがありません(先に3Dイメージで土量計算を実行してください)');
      return;
    }
    console.log(`[LAND-LOGIC] 開始: frustum総数=${fs.length}`);

    // サイト全体の最深値(GLからのmm)を求める(既存躯体の「下端∞」実装に使う)
    let siteMaxDepthMm = 0;
    fs.forEach(f=>{ const botMm=f.D-(f.tl||0); if(botMm>siteMaxDepthMm) siteMaxDepthMm=botMm; });
    const MARGIN_MM = 1000; // サイト最深よりさらに1m深くまで延長し、確実に「突き抜け」させる

    // 通常(blue)+山留(purple): 傾斜を強制ON(土量計算では山留のみ強制垂直になっているため上書き)
    const excavGroup = fs.filter(f=>f.color!=='gray').map(f=>Object.assign({}, f, {noSlope:false}));
    // 既存躯体(gray): r004(実機検証で判明・修正)。buildGrayPlugMeshで1個ずつ、
    // Unionに頼らない単一の水密メッシュとして直接構築する(詳細は関数のコメント参照)。
    const targetBotMm = siteMaxDepthMm + MARGIN_MM;
    const grayGroupSrc = fs.filter(f=>f.color==='gray');
    const grayMeshes = grayGroupSrc.map(f=>buildGrayPlugMesh(f, targetBotMm)).filter(Boolean);

    if(!excavGroup.length){
      console.warn('[LAND-LOGIC] 通常/山留オブジェクトが1つもありません');
      return;
    }
    console.log(`[LAND-LOGIC] 通常+山留=${excavGroup.length}個 / 既存躯体=${grayMeshes.length}個 (下端延長=${targetBotMm}mm)`);

    // r002(実機検証で判明・修正): Manifold-3Dの`Manifold`クラスは完全に閉じた
    // ソリッドしか受け付けない。GL蓋を除去した「上から覗き込む」表示用の開いた
    // 器のままdifferenceに渡すと即座に"Not manifold"で例外になる。差分演算は
    // 必ず閉じたソリッド同士(removeGLCap:false)で行い、蓋の除去は差分結果に
    // 対して最後にこちらで手動で行う。
    const retExcav = await buildManifoldUnionGeom(excavGroup, true, offsetX, offsetY, {removeGLCap:false});
    if(!retExcav){
      console.warn('[LAND-LOGIC] 通常+山留グループのビルドに失敗しました');
      return;
    }

    let finalPositions = retExcav.positions;
    let finalIndices = retExcav.cyanIndices;

    if(grayMeshes.length){
      const wasm = await _getManifoldWasm();
      const { Manifold, Mesh } = wasm;
      const manExcav = new Manifold(new Mesh({vertProperties:retExcav.positions, triVerts:retExcav.cyanIndices, numProp:3}));
      const manGrayList = grayMeshes.map(m=>new Manifold(new Mesh(m)));
      console.log('[LAND-LOGIC] 通常+山留 status=', manExcav.status(), ' 既存躯体 status=', manGrayList.map(m=>m.status()));
      // 既存躯体が複数ある場合はまずそれらをUnion(別々の実体同士の結合なので、
      // 1個の実体内で継ぎ目を作る今回の問題とは別物で、Union自体は問題ない)
      const manGrayUnioned = manGrayList.length>1 ? Manifold.union(manGrayList) : manGrayList[0];
      const diff = Manifold.difference([manExcav, manGrayUnioned]);
      console.log('[LAND-LOGIC] difference status=', diff.status());
      if(diff.status() !== 'NoError'){
        console.warn('[LAND-LOGIC] difference演算がエラーを返したため、通常+山留のみで出力します:', diff.status());
      }else{
        const rm = diff.getMesh();
        finalPositions = rm.vertProperties;
        finalIndices = rm.triVerts;
      }
      manExcav.delete(); manGrayList.forEach(m=>m.delete());
      if(manGrayList.length>1) manGrayUnioned.delete();
      diff.delete();
    }

    // 差分完了後、最後にGL(y=0)の蓋だけ落として「上から覗き込む」表示にする
    // (buildManifoldUnionGeom側の自動除去は使わず、ここで手動で行う)
    const EPS_Y = 1e-5;
    const cleanIdx = [];
    let removedCapFinal = 0, removedDegenerate = 0;
    for(let i=0;i<finalIndices.length;i+=3){
      const a=finalIndices[i], b=finalIndices[i+1], c=finalIndices[i+2];
      if(a===b || b===c || c===a){ removedDegenerate++; continue; }
      const y0=finalPositions[a*3+1], y1=finalPositions[b*3+1], y2=finalPositions[c*3+1];
      if(Math.abs(y0)<EPS_Y && Math.abs(y1)<EPS_Y && Math.abs(y2)<EPS_Y){ removedCapFinal++; continue; }
      cleanIdx.push(a,b,c);
    }
    console.log(`[LAND-LOGIC] 最終三角形=${cleanIdx.length/3} (蓋除去=${removedCapFinal} 縮退除去=${removedDegenerate})`);

    const glbBytes = encodeMultiGLB([{
      positions: finalPositions,
      indices: new Uint32Array(cleanIdx),
      name: 'LandLogic_Test'
    }]);
    const blob = new Blob([glbBytes], {type:'model/gltf-binary'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Test3D.glb';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[LAND-LOGIC] Test3D.glb をダウンロードしました');
  }

  // コンソールから手動でも呼べるようにしておく(Shift+L無しでのデバッグ用)
  window._buildAndDownloadLandLogicGLB = buildAndDownloadLandLogicGLB;
})();