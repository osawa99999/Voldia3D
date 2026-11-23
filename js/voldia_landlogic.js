// r018(50回目・修正提案書v002 1A): 測点が0個でもGLB・3D_DXF・LANDXMLを出せるように。原点=仮原点=オブジェクトの左上角(_llResolveOrigin が virtual:true を返し、_oxM/_ozM=0)。出力の中身(三角形・頂点の形)は変えない。前版=orig/voldia_landlogic_r017.js
// ════════════════════════════════════════════════════════════
//  Land Logic  ★現行バージョン: r015 (41回目セッション)
//   r017(41回目): GLBの色指定を削除(色は全GLB共通でvoldia_export.jsのencodeMultiGLB側に一本化=濃いグレー)
//   r016(41回目): GLB出力の三角形の向きを上向き(表)にそろえた(_llOrientUp)。PowerPointで上から見ると底面が透明に見えた不具合の修正。LANDXML側は元から向きを正規化済みなので無変更
//   r015(41回目): ①構築部分を_llBuildNorthUpMesh()に分離 ②LANDXML出力(buildAndDownloadLandXML)を新設(書式はcsv_to_landxml v2.5.11準拠。座標=北・東・標高[m]、原点=選択測点・北上げ済み)
//         ③GLBの出力名を Test3D_origin.glb → VoldiaGLB_yymmdd_hhmm.glb に変更 ④3D結果画面の「GLB出力」「LANDXML出力」ボタンから呼ばれる(Shift+Lは従来どおりGLB出力を直接実行)
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
//   r014(37回目): 倒し量を壁の高さ別の可変に(マスター案: 最小15mm・最大55mm)。式=clamp(5mm+10mm/m×高さ, 15, 55)。山留は自身の高さ、
//         既存躯体は見える高さ(=サイト最深)で決め、同じ傾きを延長後の深さ全体に掛ける。細い躯体は収縮量を短辺の40%までに制限。voldia3d.js r109が前提。
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
    // r018(50回目・1A): 測点が0個でも出力できる。原点(0,0)=「仮原点」=3Dのローカル座標の原点=全図形の外接矩形の左上角(余掘りぶん外へ広げた点)。
    //   .voldには保存しない(originSurveyIdxは触らない)。測点を後から置けば、通常どおりその測点が原点になる。
    if(pts.length === 0) return {ok:true, idx:-1, pt:null, auto:true, virtual:true};
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

  // r015(41回目): 構築(Manifold差分〜原点・北上回転)をこの関数に分離。GLB出力とLANDXML出力が同じメッシュを使う。
  // 成功: {positions(Float32Array: x=東E・y=高さ・z=-北N, 単位m, 原点=0), indices(Uint32Array), org} / 失敗: undefined(理由はtoast/consoleに出す)
  async function _llBuildNorthUpMesh(){
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
    // r011: 微テーパー量はvoldia3d.jsの変数LANDXML_MICRO_TAPER_MM(1か所管理)。読めない時だけ従来の10mm。
    const taperMm = (typeof window.LANDXML_MICRO_TAPER_MM === 'number' && window.LANDXML_MICRO_TAPER_MM > 0) ? window.LANDXML_MICRO_TAPER_MM : 10;
    // r014(37回目): 倒し量は壁の高さ別の可変(voldia3d.jsのwindow.LANDXML_TAPER: 最小15mm〜最大55mm、既定は5mm+10mm/m)。
    //   hMm: 壁の高さ[mm] → 天端側の水平オフセット[mm]。設定が読めない時だけ従来の固定値(taperMm)。
    const _TP = window.LANDXML_TAPER;
    const topOffsetMm = (hMm) => {
      if(!_TP) return taperMm;
      const v = _TP.baseMm + _TP.perMeterMm * (hMm/1000);
      return Math.min(_TP.maxMm, Math.max(_TP.minMm, v));
    };
    // r009: 紫(山留)は土量計算どおり「微テーパー垂直(noSlope)」のまま。法面(傾斜強制ON)にしない。
    //       青(通常)だけ傾斜を強制ON(土量計算では傾斜が効いている値をそのまま使う)。
    const excavGroup = fs.filter(f=>f.color!=='gray').map(f=>
      (f.color==='purple')
        ? Object.assign({}, f, {noSlope:true, taperMm:topOffsetMm(f.D)}) // r014: 山留(紫)は自身の壁の高さ(=D)で決める
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
      // r014: 既存躯体の見える壁の高さ≒サイト最深(siteMaxDepthMm)。その高さで倒し量を決め、同じ傾き(mm/mm)を
      //       延長後の深さD全体に掛ける(=見える部分で倒し量がちょうど topOffsetMm になる)。向きは負(天端が内へ狭まる, r013)。
      const _Dext = targetBotMm + (f.tl||0);
      let _gTaper = -(topOffsetMm(siteMaxDepthMm) / Math.max(siteMaxDepthMm, 1)) * _Dext;
      // 躯体が細いと内向きの収縮で潰れる(幅<収縮量×2でManifold不正)ため、収縮量を外形の短辺の40%までに制限する。
      if(f.ptsMm && f.ptsMm.length >= 3){
        let mnx=1e18,mxx=-1e18,mny=1e18,mxy=-1e18;
        f.ptsMm.forEach(p=>{ if(p.x<mnx)mnx=p.x; if(p.x>mxx)mxx=p.x; if(p.y<mny)mny=p.y; if(p.y>mxy)mxy=p.y; });
        const cap = 0.4 * Math.min(mxx-mnx, mxy-mny);
        if(-_gTaper > cap){ console.warn(`[LAND-LOGIC] 既存躯体が細いため倒し量を${(-_gTaper).toFixed(1)}→${cap.toFixed(1)}mmに制限しました`); _gTaper = -cap; }
      }
      grayGroup.push(Object.assign({}, f, {color:'blue', noSlope:true, OD:0, taperMm:_gTaper, D: _Dext})); // r013: 既存躯体は天端が内へ狭まる向き(負)=引かれる側がオーバーハングしない
    });

    if(!excavGroup.length){
      console.warn('[LAND-LOGIC] 通常/山留オブジェクトが1つもありません');
      return;
    }
    console.log(`[LAND-LOGIC] 通常+山留=${excavGroup.length}個 / 既存躯体=${grayGroup.length}個 (微テーパー=${_TP ? `可変 ${_TP.minMm}〜${_TP.maxMm}mm(${_TP.baseMm}mm+${_TP.perMeterMm}mm/m)` : taperMm+'mm固定'}・量子化=${window._vertexQuantMm}mm、下端延長=${targetBotMm}mm)`);
    excavGroup.filter(f=>f.color==='purple').forEach(f=>console.log(`[LAND-LOGIC]   山留 壁高さ=${Math.round(f.D)}mm → 倒し量=${f.taperMm.toFixed(1)}mm`));
    grayGroup.forEach(f=>console.log(`[LAND-LOGIC]   既存躯体 見える高さ=${Math.round(siteMaxDepthMm)}mm → 延長D=${Math.round(f.D)}mm全体で天端の内向き=${(-f.taperMm).toFixed(1)}mm`));

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
    // r018(50回目): 仮原点(測点なし)の時は 0。メッシュ座標は (X_mm - offsetX)/1000 なので、(0,0)がそのまま外接矩形の左上角。
    const _oxM = _org.virtual ? 0 : (_org.pt.x * _mmpx - offsetX) * 0.001;
    const _ozM = _org.virtual ? 0 : (_org.pt.y * _mmpx - offsetY) * 0.001;
    const _theta = (typeof northAngleDeg === 'number' && !isNaN(northAngleDeg)) ? northAngleDeg : 0;
    const _dms = (typeof degToDMSStr === 'function') ? degToDMSStr(_theta) : (_theta + '°');
    console.log(`[LAND-LOGIC] 原点=${_org.virtual?'仮原点(オブジェクトの左上角)':'測点No.'+(_org.idx+1)+(_org.auto?'(1個のため自動)':'')} 3D位置(x,z)=(${_oxM.toFixed(4)}, ${_ozM.toFixed(4)})m / 北方位角=${_dms} (${_theta.toFixed(6)}°)`);
    finalPositions = _llToNorthUp(finalPositions, _oxM, _ozM, _theta);
    { let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9,mny=1e9,mxy=-1e9;
      for(let i=0;i<finalPositions.length;i+=3){ const x=finalPositions[i],y=finalPositions[i+1],z=finalPositions[i+2];
        if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; if(z<mnz)mnz=z; if(z>mxz)mxz=z; }
      console.log(`[LAND-LOGIC] 出力範囲 東(E)=${mnx.toFixed(3)}〜${mxx.toFixed(3)} / 北(N)=${(-mxz).toFixed(3)}〜${(-mnz).toFixed(3)} / 高さ=${mny.toFixed(3)}〜${mxy.toFixed(3)} (m, 原点=0)`); }

    return { positions: finalPositions, indices: new Uint32Array(cleanIdx), org: _org };
  }

  // ── ダウンロード共通 ───────────────────────────────────
  function _llDownload(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function _llTs(){ return (typeof getVoldiaTimestamp === 'function') ? getVoldiaTimestamp() : 'nodate'; }

  // ── GLB出力(土量計算用 / 原点・北上げ済み) ─────────────────
  // r015: 出力ファイル名を VoldiaGLB_yymmdd_hhmm.glb に変更(旧 Test3D_origin.glb)。成功=true / 失敗=false
  // r016: 三角形の向きを「上向き(真上から見て反時計回り=表)」にそろえてから書き出す。
  //   Land Logicのメッシュは「掘削する土のかたまり」の外向き法線(底面は下向き)なので、そのまま書き出すと、
  //   PowerPointなど裏面を描かないビューアで上から見た時に、底面が裏面扱いになって透明に見えた(マスター指摘)。
  //   LANDXML出力と同じ規約(TINは上向き)にそろえる。真上から見て面積ほぼ0の面(垂直面)は向きを決められないので元のまま。
  function _llOrientUp(positions, indices){
    const out = new Uint32Array(indices.length);
    let flipped = 0, vertical = 0;
    for(let t = 0; t < indices.length; t += 3){
      const a = indices[t], b = indices[t+1], c = indices[t+2];
      const ax = positions[a*3], an = -positions[a*3+2];
      const cz = (positions[b*3] - ax) * (-positions[c*3+2] - an) - (positions[c*3] - ax) * (-positions[b*3+2] - an); // (東E,北N)平面の外積: >0 なら真上から見て反時計回り
      if(Math.abs(cz) / 2 < 1e-6){ out[t] = a; out[t+1] = b; out[t+2] = c; vertical++; }
      else if(cz < 0){ out[t] = a; out[t+1] = c; out[t+2] = b; flipped++; }
      else { out[t] = a; out[t+1] = b; out[t+2] = c; }
    }
    return { indices: out, flipped: flipped, vertical: vertical };
  }
  async function buildAndDownloadLandLogicGLB(){
    const m = await _llBuildNorthUpMesh();
    if(!m) return false;
    const up = _llOrientUp(m.positions, m.indices);
    console.log('[LAND-LOGIC] GLB: 三角形の向きを上向きにそろえました (反転=' + up.flipped + ' / 垂直面でそのまま=' + up.vertical + ')');
    const glbBytes = encodeMultiGLB([{
      positions: m.positions,
      indices: up.indices,
      name: 'LandLogic_Test'
    }]);
    const fname = 'VoldiaGLB_' + _llTs() + '.glb';
    _llDownload(new Blob([glbBytes], {type:'model/gltf-binary'}), fname);
    console.log('[LAND-LOGIC] ' + fname + ' をダウンロードしました');
    if(typeof toast === 'function') toast('📦 GLBを出力しました: ' + fname, 4000);
    return true;
  }

  // 47回目: 3D_DXF出力(土量計算)。GLB出力と同じ北上げ済みメッシュ・同じ向き(_llOrientUp=上面が表)を3DFACEで保存する。
  //   座標=原点が選んだ測点(0,0)・GL=0・北上げ済み。X=E, Y=N, Z=標高(単位は DXF3D_UNIT_SCALE: 既定m)。書き出しは voldia_export.js の buildDxf3DFaceText。
  async function buildAndDownloadLandLogicDXF(){
    if(typeof buildDxf3DFaceText !== 'function'){ if(typeof toast === 'function') toast('⚠ 出力モジュール(voldia_export.js)が読み込まれていません', 4000); return false; }
    const m = await _llBuildNorthUpMesh();
    if(!m) return false;
    const up = _llOrientUp(m.positions, m.indices);
    console.log('[LAND-LOGIC] 3D_DXF: 三角形の向きを上向きにそろえました (反転=' + up.flipped + ' / 垂直面でそのまま=' + up.vertical + ')');
    const r = buildDxf3DFaceText([{ layer: '3D_Earthwork', aci: 5, positions: m.positions, indices: up.indices }]);
    if(!r.faces){ if(typeof toast === 'function') toast('⚠ 出力できる面がありません', 4000); return false; }
    const fname = 'Voldia3D_' + _llTs() + '.DXF';
    _llDownload(new Blob([r.text], {type:'application/dxf'}), fname);
    console.log('[LAND-LOGIC] ' + fname + ' をダウンロードしました (3DFACE ' + r.faces + '面)');
    if(typeof toast === 'function') toast('🧊 3D_DXFを出力しました: ' + fname + '（' + r.faces + '面・単位m・原点=' + (m.org && m.org.virtual ? '仮原点(オブジェクトの左上角)' : '測点') + '）', 4000);
    return true;
  }

  // ── LANDXML出力 ───────────────────────────────────────
  // 書式・頂点/三角形の整理は csv_to_landxml v2.5.11(マスターの実績ツール)と同じ:
  //   LandXML 1.2 / 単位=メートル / Surface(TIN) / P=「北(Northing) 東(Easting) 標高」(小数4桁) / F=頂点番号3つ
  //   同一座標の頂点を統合 / 面積1e-4m²未満(縮退)の三角形と重複三角形を除外 / 未使用頂点を除いて番号を振り直す
  // 座標: Land Logicの北上げ済みメッシュ(x=東E, y=高さ, z=-北N)から N=-z, E=x, 標高=y。原点=選んだ測点(0,0)・GL=0。
  // 三角形の向き: 平面(E,N)を真上から見て反時計回り(=上向きの面)にそろえる。この変換は回転+移動のみ(行列式+1)なので
  //   元の向きは保たれるが、ソースの巻き方向に依存しないよう三角形ごとに明示的に正規化する(TINの規約)。
  function _llFix4(v){ const s = v.toFixed(4); return (s === '-0.0000') ? '0.0000' : s; }
  function _llMeshToLandXML(positions, indices, surfaceName){
    const EPS_AREA = 1e-4;                       // csv_to_landxmlと同じ(m²)
    const vmap = new Map(), verts = [];          // verts: {n,e,z,sn,se,sz}
    const idOf = function(vi){
      const E = Number(_llFix4(positions[vi*3])), Z = Number(_llFix4(positions[vi*3+1])), N = Number(_llFix4(-positions[vi*3+2]));
      const sn = _llFix4(-positions[vi*3+2]), se = _llFix4(positions[vi*3]), sz = _llFix4(positions[vi*3+1]);
      const key = sn + ',' + se + ',' + sz;
      let id = vmap.get(key);
      if(!id){ verts.push({n:N, e:E, z:Z, sn:sn, se:se, sz:sz}); id = verts.length; vmap.set(key, id); }
      return id;
    };
    const faces = [], faceSet = new Set();
    let skipDegenerate = 0, skipDup = 0, flipped = 0, vertical = 0;
    for(let i = 0; i < indices.length; i += 3){
      let a = idOf(indices[i]), b = idOf(indices[i+1]), c = idOf(indices[i+2]);
      if(a === b || b === c || c === a){ skipDegenerate++; continue; }
      const A = verts[a-1], B = verts[b-1], C = verts[c-1];
      const e1x = B.e-A.e, e1y = B.n-A.n, e1z = B.z-A.z, e2x = C.e-A.e, e2y = C.n-A.n, e2z = C.z-A.z;
      const cx = e1y*e2z - e1z*e2y, cy = e1z*e2x - e1x*e2z, cz = e1x*e2y - e1y*e2x; // cz>0: 真上から見て反時計回り
      if(Math.sqrt(cx*cx + cy*cy + cz*cz) / 2 < EPS_AREA){ skipDegenerate++; continue; }
      const key = [a, b, c].sort(function(p, q){ return p - q; }).join('-');
      if(faceSet.has(key)){ skipDup++; continue; }
      faceSet.add(key);
      if(Math.abs(cz) / 2 < 1e-6){ vertical++; }          // 真上から見て面積ほぼ0(=垂直面)。TINでは扱えない面なので件数だけ記録
      else if(cz < 0){ const t = b; b = c; c = t; flipped++; }
      faces.push([a, b, c]);
    }
    if(!faces.length) return null;
    // 未使用頂点を除いて番号を振り直す
    const used = new Set(); faces.forEach(function(f){ used.add(f[0]); used.add(f[1]); used.add(f[2]); });
    const sorted = Array.from(used).sort(function(p, q){ return p - q; });
    const remap = new Map(); const outVerts = [];
    sorted.forEach(function(old, idx){ remap.set(old, idx + 1); outVerts.push(verts[old-1]); });
    const pad = function(n){ return String(n).padStart(2, '0'); };
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate());
    const timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const esc = function(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); };
    const x = [];
    x.push('<?xml version="1.0" encoding="UTF-8"?>');
    x.push('<LandXML');
    x.push('  xmlns="http://www.landxml.org/schema/LandXML-1.2"');
    x.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    x.push('  xsi:schemaLocation="http://www.landxml.org/schema/LandXML-1.2 http://www.landxml.org/schema/LandXML-1.2/LandXML-1.2.xsd"');
    x.push('  date="' + dateStr + '"');
    x.push('  time="' + timeStr + '"');
    x.push('  version="1.2"');
    x.push('  language="English"');
    x.push('  readOnly="false">');
    x.push('  <Units>');
    x.push('    <Metric');
    x.push('      areaUnit="squareMeter"');
    x.push('      linearUnit="meter"');
    x.push('      volumeUnit="cubicMeter"');
    x.push('      temperatureUnit="celsius"');
    x.push('      pressureUnit="milliBars"');
    x.push('      diameterUnit="millimeter"');
    x.push('      angularUnit="decimal degrees"');
    x.push('      directionUnit="decimal degrees"');
    x.push('    />');
    x.push('  </Units>');
    x.push('  <Surfaces>');
    x.push('    <Surface name="' + esc(surfaceName) + '" desc="TIN Surface">');
    x.push('      <Definition surfType="TIN">');
    x.push('        <Pnts>');
    outVerts.forEach(function(v, i){ x.push('          <P id="' + (i+1) + '">' + v.sn + ' ' + v.se + ' ' + v.sz + '</P>'); });
    x.push('        </Pnts>');
    x.push('        <Faces>');
    faces.forEach(function(f){ x.push('          <F>' + remap.get(f[0]) + ' ' + remap.get(f[1]) + ' ' + remap.get(f[2]) + '</F>'); });
    x.push('        </Faces>');
    x.push('      </Definition>');
    x.push('    </Surface>');
    x.push('  </Surfaces>');
    x.push('</LandXML>');
    return { xml: x.join('\n') + '\n', vertCount: outVerts.length, faceCount: faces.length, skipDegenerate: skipDegenerate, skipDup: skipDup, flipped: flipped, vertical: vertical };
  }
  async function buildAndDownloadLandXML(){
    const m = await _llBuildNorthUpMesh();
    if(!m) return false;
    const r = _llMeshToLandXML(m.positions, m.indices, 'Voldia');
    if(!r){
      console.warn('[LAND-LOGIC] 有効な三角形が残らなかったためLANDXMLを出力しません');
      if(typeof toast === 'function') toast('⚠ 有効な三角形がありません。LANDXMLを出力できませんでした', 4000);
      return false;
    }
    console.log('[LAND-LOGIC] LANDXML: 頂点=' + r.vertCount + ' 三角形=' + r.faceCount + ' (縮退除外=' + r.skipDegenerate + ' 重複除外=' + r.skipDup + ' 向き反転=' + r.flipped + ' 真上から見て面積0(垂直面)=' + r.vertical + ')');
    if(r.vertical > 0) console.warn('[LAND-LOGIC] 垂直に近い面が' + r.vertical + '枚あります(TINでは扱えない形)。重機側で読めない場合はこの面が原因の可能性があります');
    const fname = 'VoldiaXML_' + _llTs() + '.xml';
    _llDownload(new Blob([r.xml], {type:'application/xml'}), fname);
    if(typeof toast === 'function') toast('🗺 LANDXMLを出力しました: ' + fname + '（頂点' + r.vertCount + '・三角形' + r.faceCount + '）', 5000);
    return true;
  }

  // コンソールから手動でも呼べるようにしておく(Shift+L無しでのデバッグ用)
  window._buildAndDownloadLandLogicGLB = buildAndDownloadLandLogicGLB;
  window._buildAndDownloadLandLogicDXF = buildAndDownloadLandLogicDXF;   // 47回目: 3D_DXF出力ボタン(voldia_main.js)から呼ぶ
  window._buildAndDownloadLandXML = buildAndDownloadLandXML;   // r015: LANDXML出力ボタン(voldia_main.js)から呼ぶ
  window._llMeshToLandXML = _llMeshToLandXML;                  // 検証用
  window._llOrientUp = _llOrientUp;                            // 検証用
  window._llBuildGLHoleLids = buildGLHoleLids;   // 検証用
  console.log('[LAND-LOGIC] r017 読み込み完了 (Shift+Lで実行 / 起動時の版確認用ログ。不要になったら削除可)');
})();
