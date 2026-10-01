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
    // 既存躯体(gray): 「元の高さ分だけ傾斜」+「そこから下は元の断面のまま垂直に延長」の2段構成。
    // r003(実機検証で判明・修正): 単純にDを全体最深まで拡大すると、傾斜オフセット計算式
    // (offsetDist = OD + ratio*D*勾配比)のDにもその巨大な値が使われてしまい、天端の
    // オフセットが実際の構造物の高さに対して不釣り合いに巨大化し、「逆勾配」に見える
    // 異常な形になっていた。傾斜は元のD(実際の高さ)のまま計算させ、元の下端から先は
    // noSlope:trueの別frustumとして元の断面(OD)のまま垂直に延長する。
    const grayGroupSrc = fs.filter(f=>f.color==='gray');
    const grayGroup = [];
    grayGroupSrc.forEach(f=>{
      const origTl = f.tl||0, origD = f.D;
      const origBotMm = origD - origTl; // 元の下端(GLからの深さmm)
      const targetBotMm = siteMaxDepthMm + MARGIN_MM;
      grayGroup.push(Object.assign({}, f, { noSlope:false })); // ①元の高さ分、傾斜あり、Dは元のまま
      if(targetBotMm > origBotMm){
        const extTl = origTl - origD; // 延長パーツの天端=元の下端の位置になるようtlを設定
        const extD  = targetBotMm + extTl;
        grayGroup.push(Object.assign({}, f, { noSlope:true, OD:f.OD, tl:extTl, D:extD })); // ②元の断面のまま垂直延長
      }
    });

    if(!excavGroup.length){
      console.warn('[LAND-LOGIC] 通常/山留オブジェクトが1つもありません');
      return;
    }
    console.log(`[LAND-LOGIC] 通常+山留=${excavGroup.length}個 / 既存躯体=${grayGroup.length}個 (下端延長=${siteMaxDepthMm+MARGIN_MM}mm)`);

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

    if(grayGroup.length){
      const retGray = await buildManifoldUnionGeom(grayGroup, true, offsetX, offsetY, {removeGLCap:false});
      if(!retGray){
        console.warn('[LAND-LOGIC] 既存躯体グループのビルドに失敗しました。通常+山留のみで出力します');
      }else{
        const wasm = await _getManifoldWasm();
        const { Manifold, Mesh } = wasm;
        const manExcav = new Manifold(new Mesh({vertProperties:retExcav.positions, triVerts:retExcav.cyanIndices, numProp:3}));
        const manGray  = new Manifold(new Mesh({vertProperties:retGray.positions,  triVerts:retGray.cyanIndices,  numProp:3}));
        console.log('[LAND-LOGIC] 通常+山留 status=', manExcav.status(), ' 既存躯体 status=', manGray.status());
        const diff = Manifold.difference([manExcav, manGray]);
        console.log('[LAND-LOGIC] difference status=', diff.status());
        if(diff.status() !== 'NoError'){
          console.warn('[LAND-LOGIC] difference演算がエラーを返したため、通常+山留のみで出力します:', diff.status());
        }else{
          const rm = diff.getMesh();
          finalPositions = rm.vertProperties;
          finalIndices = rm.triVerts;
        }
        manExcav.delete(); manGray.delete(); diff.delete();
      }
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
