// ════════════════════════════════════════════════════════════
//  Land Logic  ★現行バージョン: r013 (37回目セッション)
//   r001: 34回目新設 / r006: Y軸符号修正 / r007: 既存躯体を本番buildManifoldUnionGeom+noSlope微テーパー方式へ変更
//   r008: 微テーパーを10mm(頂点量子化単位の整数倍)に確定。voldia3d.js r099のf.taperMm対応が前提
//   r009: 紫(山留)は法面ではなく微テーパー垂直のまま出力 / 既存躯体の引き算でGL蓋に内側の穴(ドーナツ)ができたら蓋をする
//   r010(36回目): 頂点量子化(10mm格子)が微テーパー(10mm)を潰して「完全に垂直な面」(同一XZでYだけ違う頂点)を
//         作っていたため、Land Logicの構築時だけ頂点量子化を0にして微テーパーを保つ。
//         根拠(Node再現): 量子化10mm→完全垂直面が10枚(紫の露出壁・山留バッチ壁の上部)、量子化0→0枚(NoError)。
//         量子化0で構築/Manifold化に失敗した場合は従来の量子化で組み直し(警告ログ)。
//   r011(36回目): 微テーパー量(10mm)を、固定値ではなくvoldia3d.jsの変数LANDXML_MICRO_TAPER_MM(window経由)から読む。
//         変更は voldia3d.js の数値1か所だけでよい。量子化へフォールバックした時だけ、量子化単位の整数倍に切り上げて使う。
//         Shift+Lは日本語入力ON(IME)でも効くよう、物理キー(e.code==='KeyL')でも判定する。
//   r013(37回目): 既存躯体(gray)の微テーパーを負(天端が内へ狭まる)にした。掘削側(void)は天端が外へ広がるのが正しいが、
//         Manifold.differenceで引かれる側の既存躯体まで外へ広げると床の上へ張り出し、上から見て下向きの面(TIN規則違反)になるため。
//         量子化フォールバックの切り上げも符号を保つ形に修正(例: -4 → 0 になって潰れるのを防ぐ)。voldia3d.js r108が前提。
//   r012(37回目): 原点(0,0)と北上回転を出力に反映。原点=測点(1個なら自動/複数ならノースアロー設定で選択した測点)、
//         北=ノースアローの方位角(northAngleDeg: 画面上=0°・時計回り正)。出力GLBは「X=東(Easting)・Y=高さ(GL=0)・Z=-北(-Northing)」
//         =北が-Z方向(従来の画面上方向)に向く。LandXML化する時は E=X, N=-Z, Z=Y と読み替えるだけでよい。
//         測点が無い/複数で未選択の時は出力を止めてtoastで知らせる(原点なしGLBは出さない)。出力ファイル名はTest3D_origin.glb。
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
  // r007(35回目セッション): 既存躯体(gray)の手組みメッシュ(buildGrayPlugMesh、
  // r004〜r006)は廃止。理由: (1)傾斜が法面(getSlopeRatio)になっていたが、マスター
  // 仕様の「LandXML対応の傾斜」は山留・紫と同じ固定微テーパー
  // (DOBOKU_VERTICAL_TAPER_FIXED_MM=15mm、天端側のみ・深さ非依存)であり別物、
  // (2)手組みはY軸符号・巻き方向を2回間違えた(r005: 巻き方向、r006: Y軸符号)。
  // 本番の buildManifoldUnionGeom に noSlope:true のまま通す方式に変更した。
  // noSlopeの15mmは深さに依存しないため、深さだけを最深まで延長しても
  // 旧#3(巨大オフセット)は起きない。既存躯体は「引き算」される側(Manifold.difference)。


  // r009: GL(y=0)蓋の「内側の穴(ドーナツ)」を検出し、穴の蓋(下向きの面)を作る。
  //  - 既存躯体を引くと、GL蓋のうち既存躯体の天端の位置が抜ける。それが蓋の外周の内側に
  //    完全に囲まれた穴(ドーナツ)になった場合だけ蓋をする。外周に食い込むだけの欠け(穴でない)
  //    には蓋をしない。
  //  - 蓋は穴の輪郭の頂点をそのまま使う(新しい頂点を作らない)ので、隣の壁と辺が完全に一致する。
  //  - 向き: 最終出力ではGL蓋を落とすため、壁の上端の辺は壁側が(b→a)方向を使う。蓋はこれと
  //    逆の(a→b)方向で辺をたどる=面の向きは下向き(床と同じ向き)になる。
  //  戻り値: {tris:[頂点indexの3つ組の並び], holes:穴の数}
  function buildGLHoleLids(positions, indices){
    const EPS = 1e-5;
    const N = positions.length/3;
    const Y = i=>positions[i*3+1], X = i=>positions[i*3], Z = i=>positions[i*3+2];
    const shoe = (a,b,c)=> 0.5*((X(b)-X(a))*(Z(c)-Z(a)) - (Z(b)-Z(a))*(X(c)-X(a)));
    // 上向きGL蓋の三角形
    const edges = new Map();           // key(a*N+b) -> [a,b]
    let tSign = 0;
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i], b=indices[i+1], c=indices[i+2];
      if(Math.abs(Y(a))>=EPS || Math.abs(Y(b))>=EPS || Math.abs(Y(c))>=EPS) continue;
      const ny = (Z(b)-Z(a))*(X(c)-X(a)) - (X(b)-X(a))*(Z(c)-Z(a));
      if(!(ny>0)) continue;                       // 下向き/縮退はGL蓋ではない
      if(tSign===0) tSign = Math.sign(shoe(a,b,c));
      edges.set(a*N+b,[a,b]); edges.set(b*N+c,[b,c]); edges.set(c*N+a,[c,a]);
    }
    if(!edges.size) return {tris:[], holes:0};
    // 境界辺(逆向きの相方が無い辺)
    const out = new Map();                       // a -> [b,...]
    edges.forEach(([a,b])=>{
      if(!edges.has(b*N+a)){ if(!out.has(a)) out.set(a,[]); out.get(a).push(b); }
    });
    // 輪郭をたどる
    const loops = [];
    const used = new Set();
    out.forEach((bs,a0)=>{
      bs.forEach(b0=>{
        if(used.has(a0*N+b0)) return;
        const loop=[a0]; let a=a0, b=b0, guard=0;
        while(guard++ < 100000){
          used.add(a*N+b);
          if(b===a0) break;
          loop.push(b);
          const nexts = out.get(b) || [];
          let nb = -1;
          for(const c of nexts){ if(!used.has(b*N+c)){ nb=c; break; } }
          if(nb<0) break;
          a=b; b=nb;
        }
        loops.push(loop);
      });
    });
    // 穴 = GL蓋の三角形と符号が逆の輪郭
    const tris = []; let holes = 0;
    loops.forEach(loop=>{
      if(loop.length<3) return;
      let A=0;
      for(let i=0;i<loop.length;i++){ const p=loop[i], q=loop[(i+1)%loop.length]; A += X(p)*Z(q)-X(q)*Z(p); }
      A *= 0.5;
      if(Math.abs(A)<1e-9) return;
      if(Math.sign(A) === tSign) return;        // 外周(欠けを含む)。蓋は不要
      const flat=[]; loop.forEach(v=>flat.push(X(v),Z(v)));
      const tr = earcut(flat, null, 2);
      for(let k=0;k<tr.length;k+=3){
        let a=loop[tr[k]], b=loop[tr[k+1]], c=loop[tr[k+2]];
        if(Math.sign(shoe(a,b,c)) !== Math.sign(A)){ const t=b; b=c; c=t; }   // 輪郭と同じ向きに揃える
        tris.push(a,b,c);
      }
      holes++;
    });
    return {tris, holes};
  }

  // r010: Land Logic専用の構築。頂点量子化を一時的に0にして微テーパーを保つ(終わったら必ず元へ戻す)。
  // 量子化0の結果がManifold(水密)として成立しない/例外の場合だけ、従来の量子化(window._vertexQuantMm)で組み直す。
  async function _buildLL(group, offsetX, offsetY, label){
    const saved = window._vertexQuantMm;
    let ret = null;
    if(saved !== 0){
      window._vertexQuantMm = 0;
      try{
        ret = await buildManifoldUnionGeom(group, true, offsetX, offsetY, {removeGLCap:false});
        if(ret){
          const { Manifold, Mesh } = await _getManifoldWasm();
          const m = new Manifold(new Mesh({vertProperties:ret.positions, triVerts:ret.cyanIndices, numProp:3}));
          const st = m.status(); m.delete();
          if(st !== 'NoError'){ console.warn(`[LAND-LOGIC] ${label}: 量子化0の結果がManifoldとして不正(${st})のため、従来の量子化で組み直します`); ret = null; }
        }
      }catch(e){
        console.warn(`[LAND-LOGIC] ${label}: 量子化0での構築に失敗(${e && e.message})。従来の量子化で組み直します`);
        ret = null;
      }finally{
        window._vertexQuantMm = saved;
      }
      if(ret) console.log(`[LAND-LOGIC] ${label}: 頂点量子化0mmで構築(微テーパーを潰さないため。元の量子化=${saved}mm)`);
    }
    if(!ret){
      // 従来の量子化で組み直す時だけ、微テーパーを量子化単位qの整数倍に切り上げる(格子に丸められて潰れないように)
      const q = window._vertexQuantMm;
      const g2 = (q > 0) ? group.map(f => (typeof f.taperMm === 'number') ? Object.assign({}, f, {taperMm: Math.sign(f.taperMm) * Math.ceil(Math.abs(f.taperMm) / q) * q}) : f) : group;
      ret = await buildManifoldUnionGeom(g2, true, offsetX, offsetY, {removeGLCap:false});
    }
    return ret;
  }

  function _llReady(){
    const modal = document.getElementById('calc-modal');
    return !!(modal && modal.classList.contains('show') && window._lastCalcModeForPlacement === 'doboku');
  }

  document.addEventListener('keydown', function(e){
    // 日本語入力(IME)がONだとe.keyが'Process'等になり反応しないため、物理キー(e.code)でも判定する
    if(e.key !== 'L' && e.key !== 'l' && e.code !== 'KeyL') return;
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

  // ── r012: 原点測点の決定 ───────────────────────────────
  // 測点が1個→問答無用でそれが原点 / 複数→ノースアロー設定(🧭)で選んだ測点 / 0個または複数で未選択→null(出力を止める)
  function _llResolveOrigin(){
    const pts = (typeof surveyPts !== 'undefined' && Array.isArray(surveyPts)) ? surveyPts : [];
    if(pts.length === 0) return {ok:false, msg:'⚠ 測点がありません。📍測点設置で原点にする点を置いてください'};
    let idx = (typeof originSurveyIdx === 'number' && pts[originSurveyIdx]) ? originSurveyIdx : null;
    let auto = false;
    if(idx === null){
      if(pts.length === 1){ idx = 0; auto = true; }
      else return {ok:false, msg:'⚠ 測点が複数あります。ノースアロー設定(右上🧭)で原点にする測点を選んでください'};
    }
    return {ok:true, idx:idx, pt:pts[idx], auto:auto};
  }
  // ── r012: 原点を(0,0)にして、北が-Z方向を向くよう回転する ─────────
  // 入力pos: Voldia3D座標(x=2D右, z=2D下, 単位m)。thetaDeg: ノースアロー方位角(画面上=0°・時計回り正)。
  // 画面上の北単位ベクトルn=(sinθ,-cosθ)、東e=(cosθ,sinθ) → E=dx*cosθ+dz*sinθ, N=dx*sinθ-dz*cosθ
  // 出力: x=E, y=y(GL=0のまま), z=-N。この写像は回転+平行移動のみ(行列式+1)なので面の向き(巻き方向)は変わらない。
  function _llToNorthUp(pos, oxM, ozM, thetaDeg){
    const t = thetaDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const out = new Float32Array(pos.length);
    for(let i=0;i<pos.length;i+=3){
      const dx = pos[i] - oxM, dz = pos[i+2] - ozM;
      out[i]   = dx*c + dz*s;
      out[i+1] = pos[i+1];
      out[i+2] = -(dx*s - dz*c);
    }
    return out;
  }
  window._llToNorthUp = _llToNorthUp; // 検証用

  async function buildAndDownloadLandLogicGLB(){
    const fs = window._lastCalcFrustumsForLandLogic;
    const offsetX = window._lastCalcOffsetXForLandLogic;
    const offsetY = window._lastCalcOffsetYForLandLogic;
    if(!fs || !fs.length){
      console.warn('[LAND-LOGIC] frustumデータがありません(先に3Dイメージで土量計算を実行してください)');
      return;
    }
    // r012: 原点が決まらないなら、重い構築に入る前に止める
    const _org = _llResolveOrigin();
    if(!_org.ok){
      console.warn('[LAND-LOGIC] 原点が決まらないため出力を中止:', _org.msg);
      if(typeof toast === 'function') toast(_org.msg, 3500);
      return;
    }
    console.log(`[LAND-LOGIC] 開始: frustum総数=${fs.length}`);

    // サイト全体の最深値(GLからのmm)を求める(既存躯体の「下端∞」実装に使う)
    let siteMaxDepthMm = 0;
    fs.forEach(f=>{ const botMm=f.D-(f.tl||0); if(botMm>siteMaxDepthMm) siteMaxDepthMm=botMm; });
    const MARGIN_MM = 1000; // サイト最深よりさらに1m深くまで延長し、確実に「突き抜け」させる

    // 通常(blue)+山留(purple): 傾斜を強制ON(土量計算では山留のみ強制垂直になっているため上書き)
    // 微テーパー量(マスター仕様=10mm)。頂点量子化(window._vertexQuantMm)の格子に丸められても
    // 崩れないよう、必ず量子化単位qの整数倍にする(q=10なら10、q=5なら10、q=20なら20)。
    const _q = window._vertexQuantMm;
    // r011: 微テーパー量はvoldia3d.jsの変数LANDXML_MICRO_TAPER_MM(1か所管理)。読めない時だけ従来の10mm。
    const taperMm = (typeof window.LANDXML_MICRO_TAPER_MM === 'number' && window.LANDXML_MICRO_TAPER_MM > 0) ? window.LANDXML_MICRO_TAPER_MM : 10;
    // r009: 紫(山留)は土量計算どおり「微テーパー垂直(noSlope)」のまま。法面(傾斜強制ON)にしない。
    //       青(通常)だけ傾斜を強制ON(土量計算では傾斜が効いている値をそのまま使う)。
    const excavGroup = fs.filter(f=>f.color!=='gray').map(f=>
      (f.color==='purple')
        ? Object.assign({}, f, {noSlope:true, taperMm:taperMm})
        : Object.assign({}, f, {noSlope:false}));
    // 既存躯体(gray): r007。本番のbuildManifoldUnionGeomに通す。
    //  - noSlope:true  → 固定15mm微テーパー(山留・紫と同じLandXML対応の傾斜)
    //  - OD:0          → 既存躯体には余掘りを適用しない(確定仕様)
    //  - color:'blue'  → 紫(山留壁面ID追跡)扱いにならないよう通常色にする
    //  - D を延長      → 下端をサイト最深+MARGINまで(=「下端∞」)。tlは触らない
    const targetBotMm = siteMaxDepthMm + MARGIN_MM;
    const grayGroup = [];
    fs.filter(f=>f.color==='gray').forEach(f=>{
      if(f.holesMm && f.holesMm.length){
        console.warn('[LAND-LOGIC] 穴(holesMm)を持つ既存躯体は未対応(本番側もholesMm未対応)のため、このオブジェクトはスキップします');
        return;
      }
      grayGroup.push(Object.assign({}, f, {color:'blue', noSlope:true, OD:0, taperMm:-taperMm, D: targetBotMm + (f.tl||0)})); // r013: 既存躯体は天端が内へ狭まる向き(負)=引かれる側がオーバーハングしない
    });

    if(!excavGroup.length){
      console.warn('[LAND-LOGIC] 通常/山留オブジェクトが1つもありません');
      return;
    }
    console.log(`[LAND-LOGIC] 通常+山留=${excavGroup.length}個 / 既存躯体=${grayGroup.length}個 (noSlope・微テーパー=${taperMm}mm・量子化=${window._vertexQuantMm}mm、下端延長=${targetBotMm}mm)`);

    // r002(実機検証で判明・修正): Manifold-3Dの`Manifold`クラスは完全に閉じた
    // ソリッドしか受け付けない。GL蓋を除去した「上から覗き込む」表示用の開いた
    // 器のままdifferenceに渡すと即座に"Not manifold"で例外になる。差分演算は
    // 必ず閉じたソリッド同士(removeGLCap:false)で行い、蓋の除去は差分結果に
    // 対して最後にこちらで手動で行う。
    const retExcav = await _buildLL(excavGroup, offsetX, offsetY, '通常+山留');
    if(!retExcav){
      console.warn('[LAND-LOGIC] 通常+山留グループのビルドに失敗しました');
      return;
    }

    let finalPositions = retExcav.positions;
    let finalIndices = retExcav.cyanIndices;

    if(grayGroup.length){
      const retGray = await _buildLL(grayGroup, offsetX, offsetY, '既存躯体');
      if(!retGray){
        console.warn('[LAND-LOGIC] 既存躯体グループのビルドに失敗したため、通常+山留のみで出力します');
      }else{
        const wasm = await _getManifoldWasm();
        const { Manifold, Mesh } = wasm;
        const manExcav = new Manifold(new Mesh({vertProperties:retExcav.positions, triVerts:retExcav.cyanIndices, numProp:3}));
        const manGray  = new Manifold(new Mesh({vertProperties:retGray.positions,  triVerts:retGray.cyanIndices,  numProp:3}));
        console.log('[LAND-LOGIC] 通常+山留 status=', manExcav.status(), ' 既存躯体 status=', manGray.status());
        if(manExcav.status()!=='NoError' || manGray.status()!=='NoError'){
          console.warn('[LAND-LOGIC] 入力ソリッドがManifoldとして不正なため差分をスキップし、通常+山留のみで出力します');
        }else{
          const diff = Manifold.difference([manExcav, manGray]); // 通常+山留 − 既存躯体(引き算)
          console.log('[LAND-LOGIC] difference status=', diff.status());
          if(diff.status() !== 'NoError'){
            console.warn('[LAND-LOGIC] difference演算がエラーを返したため、通常+山留のみで出力します:', diff.status());
          }else{
            const rm = diff.getMesh();
            finalPositions = rm.vertProperties;
            finalIndices = rm.triVerts;
          }
          diff.delete();
        }
        manExcav.delete(); manGray.delete();
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
    // r009: GL蓋に内側の穴(ドーナツ)ができていたら、その穴だけ蓋をする(蓋除去のあとで追加)
    const lids = buildGLHoleLids(finalPositions, finalIndices);
    for(let i=0;i<lids.tris.length;i++) cleanIdx.push(lids.tris[i]);
    console.log(`[LAND-LOGIC] 穴の蓋: ${lids.holes}箇所 / 蓋の三角形=${lids.tris.length/3}`);
    console.log(`[LAND-LOGIC] 最終三角形=${cleanIdx.length/3} (蓋除去=${removedCapFinal} 縮退除去=${removedDegenerate})`);

    // r012: 原点(測点)を(0,0)にして北上回転(座標の意味はファイル先頭のr012コメント参照)
    const _mmpx = (25.4/72) * scaleDenom / RS;                       // voldia3d.jsと同じmm/px
    const _oxM = (_org.pt.x * _mmpx - offsetX) * 0.001;
    const _ozM = (_org.pt.y * _mmpx - offsetY) * 0.001;
    const _theta = (typeof northAngleDeg === 'number' && !isNaN(northAngleDeg)) ? northAngleDeg : 0;
    const _dms = (typeof degToDMSStr === 'function') ? degToDMSStr(_theta) : (_theta + '°');
    console.log(`[LAND-LOGIC] 原点=測点No.${_org.idx+1}${_org.auto?'(1個のため自動)':''} 3D位置(x,z)=(${_oxM.toFixed(4)}, ${_ozM.toFixed(4)})m / 北方位角=${_dms} (${_theta.toFixed(6)}°)`);
    finalPositions = _llToNorthUp(finalPositions, _oxM, _ozM, _theta);
    { let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9,mny=1e9,mxy=-1e9;
      for(let i=0;i<finalPositions.length;i+=3){ const x=finalPositions[i],y=finalPositions[i+1],z=finalPositions[i+2];
        if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; if(z<mnz)mnz=z; if(z>mxz)mxz=z; }
      console.log(`[LAND-LOGIC] 出力範囲 東(E)=${mnx.toFixed(3)}〜${mxx.toFixed(3)} / 北(N)=${(-mxz).toFixed(3)}〜${(-mnz).toFixed(3)} / 高さ=${mny.toFixed(3)}〜${mxy.toFixed(3)} (m, 原点=0)`); }

    const glbBytes = encodeMultiGLB([{
      positions: finalPositions,
      indices: new Uint32Array(cleanIdx),
      name: 'LandLogic_Test'
    }]);
    const blob = new Blob([glbBytes], {type:'model/gltf-binary'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'Test3D_origin.glb';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[LAND-LOGIC] Test3D_origin.glb をダウンロードしました');
  }

  // コンソールから手動でも呼べるようにしておく(Shift+L無しでのデバッグ用)
  window._buildAndDownloadLandLogicGLB = buildAndDownloadLandLogicGLB;
  window._llBuildGLHoleLids = buildGLHoleLids;   // 検証用
  console.log('[LAND-LOGIC] r013 読み込み完了 (Shift+Lで実行 / 起動時の版確認用ログ。不要になったら削除可)');
})();
