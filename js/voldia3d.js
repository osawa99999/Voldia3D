// ============================================================
// voldia3d.js — 3D変換・体積計算ロジック本体 (voldia3d_voldia_r104.jsより分離)
// ============================================================

// 3D高さ逆算用：2D平面上での点Pから線分ABへの最短距離を求める
// 【問題B対応・2026-08-24マスター指示】LandXMLの垂直面回避ハック(noSlopeオブジェクトの
// 天端側だけ角度ベースの極小テーパーを持たせていた仕組み)を、深さに比例して天端のズレが
// 増大する角度指定方式から、深さによらず常に一定量だけ外側にオフセットする固定値方式に変更。
// 15mmという値は、(a)頂点量子化(既定10mm)で潰れて完全垂直に戻らない下限を確保しつつ、
// (b)土工の施工誤差(±30〜50mm)に対して十分小さい、という両方の条件から選定。
// buildManifoldUnionGeom内のcontourOf()と、下記isPointInsideFrustumExcavation()の
// 両方でこの値を使う(旧実装ではisPointInsideFrustumExcavation側だけ独自に
// window._vertexQuantMm+1という別の固定値を使っており、値がズレる余地があったため統一)。
const DOBOKU_VERTICAL_TAPER_FIXED_MM = 15;
// 追加(2026-08-28 引継ぎ18回目マスター指示): 3Dイメージの体積表示に桁区切りを
// 追加。数値が長くなってres-box幅(左パネル260px相当)からはみ出しそうな場合は
// 自動的に1段階フォントサイズを縮小する(.vol-bigの基準は2.2em)。
function _formatVolM3(v){
  return v.toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function _setResVolBig(numText){
  const el=document.getElementById('res-vol');
  if(!el)return;
  el.innerHTML = `${numText}<span>m³</span>`;
  el.style.fontSize = numText.length>9 ? '1.55em' : '';
}
// 新2(2026-08-28 引継ぎ18回目マスター指示→26回目セッションで紫に移設): 土量計算
// 実行時、紫(強制垂直)オブジェクトが存在する場合の注意トーストを起動(ページ読み込み)
// 毎に1回だけ出すためのフラグ
let _purpleCalcWarnShown = false;
// 3D空間上の点pt(m単位)がフラスタムfの3D掘削範囲(中空空間)内部にあるか判定
function isPointInsideFrustumExcavation(pt, f) {
  const S_CONV = 0.001;
  const zMm = -pt.y / S_CONV; // 高さY(m)を深さZ(mm、正値)に変換
  
  const topDepth = -(f.tl || 0);
  const botDepth = f.D - (f.tl || 0);
  
  // 相手のピットの深さ範囲外なら内部ではない
  // v0.0017: 境界上の点（天端・底面ちょうど）を「外部」扱いにする
  // 同一位置オブジェクトで境界上の重心が内部判定されて壁面が消える問題の対策
  if (zMm <= topDepth + 1e-6 || zMm >= botDepth - 1e-6) return false;
  
  // その深さでの2Dオフセット輪郭を正確に取得
  // r038: contourOf()と同じ「天端で最大・底面でゼロ」の極小テーパー式に統一
  // （体積計算側の関数は別系統なのでここは表示専用のdead判定にのみ影響）
  const fromTop = zMm - topDepth;
  const ratio = 1.0 - fromTop / f.D;
  // 【問題B対応】以前はここだけ window._vertexQuantMm+1 という独自の固定値を
  // 使っていたが、buildManifoldUnionGeom側のcontourOf()と値が食い違う余地が
  // あったため、共有定数DOBOKU_VERTICAL_TAPER_FIXED_MMに統一。
  const taper = f.noSlope
    ? DOBOKU_VERTICAL_TAPER_FIXED_MM
    : f.D * getSlopeRatio();
  let offsetDist = f.OD + ratio * taper;
  if(offsetDist < 0) offsetDist = 0;
  
  const contour = f.noSlope
    ? offsetPolygon(f.ptsMm, offsetDist, false, 1.5) // r040: 鋭角コーナー暴走防止（1.0だと別箇所で重複面が発生したため1.5に調整）
                                                       // r047追記: この1.5クランプは極端な鋭角(21度級)だと
                                                       // オフセット量が縮小しすぎる副作用あり。詳細はbuildManifoldUnionGeom
                                                       // 内の同パラメータ箇所のコメント・引継ぎMD参照。
    : offsetPolygon(f.ptsMm, offsetDist);
  // 2D平面上で点(mm)がポリゴンの内側にあるかを判定
  return pointInPoly(pt.x / S_CONV, pt.z / S_CONV, contour);
}


// 線分A(a1-a2)とB(b1-b2)の交点を計算
function getLineSegmentsIntersection(a1, a2, b1, b2) {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(det) < 1e-9) return null; // 平行な場合は交点なし

  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / det;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / det;

  // 線分の範囲内(0〜1)で交差しているか判定
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: a1.x + t * (a2.x - a1.x),
      y: a1.y + t * (a2.y - a1.y)
    };
  }
  return null;
}

// 多角形1と多角形2の全辺の交差(貫入交点)を抽出
function getPolygonIntersections(poly1, poly2) {
  const intersections = [];
  const n1 = poly1.length;
  const n2 = poly2.length;
  
  for (let i = 0; i < n1; i++) {
    const a1 = poly1[i];
    const a2 = poly1[(i + 1) % n1];
    for (let j = 0; j < n2; j++) {
      const b1 = poly2[j];
      const b2 = poly2[(j + 1) % n2];
      
      const pt = getLineSegmentsIntersection(a1, a2, b1, b2);
      if (pt) {
        intersections.push(pt);
      }
    }
  }
  return intersections;
}

// ────────────────────────────────────────────────────────────────
//  offsetPolygon: ポリゴンを外側にdist[mm]拡張
//  ★bisector法 / CW前提 / 反転なし / 元の頂点数保持
// ────────────────────────────────────────────────────────────────
// r040: maxExpandMult追加 — 鋭角コーナーでのマイター拡張上限倍率。
// デフォルト5は従来通り（全13箇所の既存呼び出しは無指定のため挙動不変）。
// buildManifoldUnionGeom内の極小テーパー計算は当初1.0を指定していたが、
// 別箇所で面の重複が発生したため1.5に調整済み（詳細は下記r040コメント参照）。
// 鋭角コーナーでの過剰なオフセット拡大（暴走頂点）を防止する。
//
// r047追記(17回目セッション): 1.5への緩和は「暴走防止」には効くが、逆に
// 21度程度の極端な鋭角コーナーでは移動量が縮小しすぎ、粗い頂点量子化
// (25mm/50mm)設定で丸めによりオフセットが完全に消える(=真の垂直面化、
// LandXML的に不可)ケースが確認された。マイター上限で止血する現方式は
// 「暴走防止」と「量子化後も一定量オフセットを残す」を同時に満たせない
// トレードオフがある。→ r048で下限保証(minOffsetMm)を追加して対応。
//
// r048追記(18回目セッション): ベベル中点方式そのもの（maxExpandMultの値や
// 発動条件)には一切手を入れない。地雷24（暴走防止しすぎの再発）を避けるため、
// 既存ロジックはそのまま生かし、「ベベル中点方式が発動し、かつ結果の移動量が
// minOffsetMm未満だった場合だけ、同じ方向を保ったまま長さをminOffsetMmまで
// 引き伸ばす」後処理を追加した。呼び出し元がminOffsetMmを指定しない限り
// （デフォルト0）既存13箇所の挙動は完全不変。呼び出し元(buildManifoldUnionGeom
// のcontourOf、天端=ratio≈1の時のみ)がquantMm/2+1mmを渡すことで、量子化後も
// 実移動量が生き残ることを保証する。底面(ratio=0)・中間z(他錐台クリップ用)には
// 意図的に適用しない＝「底面は元ポリゴンのまま」という既存契約を壊さないため。
//
// r046-fix: 鋭角コーナーでのマイター拡張が上限(maxExpandMult)に達した場合、
// 従来は「ビセクター方向へ固定倍率だけクランプする」という力技だった。
// これは倍率チューニングに頼る対症療法で、鋭角度合いによってはクランプ後も
// なお自己交差・スリバー面を誘発しうることが16回目セッションで判明した。
// 今回、これを「2辺それぞれの垂直オフセット点(B+n1*d, B+n2*d)の中点」を
// 採用する簡易ベベル（面取り）方式に置き換える。中点方式は三角不等式より
// 常に|オフセット量|≤|d|に自己制限され、鋭角になるほど自然にオフセット量が
// 縮小する（21.16度のような極端な鋭角でも暴走しない）。頂点数を変えずに
// 済むため、頂点数1:1対応を前提とする既存の全呼び出し元（壁面生成など）に
// 影響を与えずに適用できる一般解。倍率チューニング不要になったため、
// 発動条件(limit)自体は据え置きつつ、発動時の処理のみを差し替える。
// ────────────────────────────────────────────────────────────────
//  r038: 山留（yamadome）を使った垂直クリップ用の共通ヘルパー
//  「法面込みで完全に組んでから、深さに関係なく同じ平面位置で垂直にカット」
//  するため、各深さスライスの法面オフセット後の輪郭に対してこれを適用する
//  (深さで変わらない一定の山留ポリゴンとの交差を取るだけなので「垂直」になる)。
// ────────────────────────────────────────────────────────────────
function getYamadomeMmPolygon(offsetXmm, offsetYmm){
  offsetXmm = offsetXmm || 0; offsetYmm = offsetYmm || 0;
  if(typeof yamadome === 'undefined' || !yamadome || !yamadome.pts || yamadome.pts.length < 3) return null;
  const mmpx = (25.4/72) * scaleDenom / RS;
  const pts = yamadome.pts.map(p => ({x: p.x*mmpx - offsetXmm, y: p.y*mmpx - offsetYmm}));
  // r040: 巻き順をCCWに正規化する。_buildRingLoftMesh(蓋+側面のwatertight構築)は
  // 入力リングがCCWであることを暗黙に前提としており、CW(山留を時計回りに描いた場合)
  // だと蓋と側面の巻き順が噛み合わず非多様体(ManifoldError: Not manifold)になることが
  // 実機で判明・Node上での再現検証で確認済み。ここで一度だけ正規化しておけば、
  // このポリゴンを使う全ての箇所(垂直プリズム構築・ClipperLibクリップ両方)が安全になる。
  let signedArea = 0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i], b=pts[(i+1)%pts.length];
    signedArea += a.x*b.y - b.x*a.y;
  }
  return signedArea < 0 ? pts.slice().reverse() : pts;
}
function clipContourToYamadome(pts, SF, offsetXmm, offsetYmm){
  // r065(AIS修正案): 山留座標がワールド座標のまま(オフセット未考慮)で交差判定されており、
  // ローカル座標にオフセット済みのpts側とズレて体積計算結果が狂うバグを修正。
  // offsetXmm/offsetYmmは省略時0(=従来動作、後方互換維持)。
  const ydMm = getYamadomeMmPolygon(offsetXmm, offsetYmm);
  if(!ydMm || !pts || pts.length < 3) return pts;
  const cl = new ClipperLib.Clipper();
  cl.AddPath(pts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)})), ClipperLib.PolyType.ptSubject, true);
  cl.AddPath(ydMm.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)})), ClipperLib.PolyType.ptClip, true);
  const sol = new ClipperLib.Paths();
  cl.Execute(ClipperLib.ClipType.ctIntersection, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  if(!sol.length) return null;
  // 交差が複数領域に分裂した場合は面積最大の1つを採用(簡易対応)
  let best = sol[0], bestArea = 0;
  sol.forEach(p=>{
    let a=0;
    for(let i=0;i<p.length;i++){ const j=(i+1)%p.length; a += p[i].X*p[j].Y - p[j].X*p[i].Y; }
    a = Math.abs(a);
    if(a > bestArea){ bestArea=a; best=p; }
  });
  return best.map(p=>({x:p.X/SF, y:p.Y/SF}));
}
function offsetPolygon(pts, dist, isHole = false, maxExpandMult = 5, minOffsetMm = 0){
  // 入力点をクレンジング
  const cleanedPts = cleanPolygonPoints(pts);
  const p = normalizeCW(cleanedPts); 
  const n = p.length;
  if(n < 3) return cleanedPts.map(v=>({x:v.x,y:v.y}));
  
  const d = isHole ? -dist : dist;
  
  const out = [];
  for(let i=0; i<n; i++){
    const A=p[(i-1+n)%n], B=p[i], C=p[(i+1)%n];

    const ax=B.x-A.x, ay=B.y-A.y, al=Math.hypot(ax,ay)||1;
    const bx=C.x-B.x, by=C.y-B.y, bl=Math.hypot(bx,by)||1;
    const uax=ax/al, uay=ay/al;
    const ubx=bx/bl, uby=by/bl;

    const n1x= uay, n1y=-uax;
    const n2x= uby, n2y=-ubx;

    let ex=n1x+n2x, ey=n1y+n2y;
    const el=Math.hypot(ex,ey);
    if(el<1e-9){ex=n1x; ey=n1y;} else {ex/=el; ey/=el;}

    const dot=n1x*ex+n1y*ey;
    const m = dot > 0.15 ? d / dot : d;
    
    const limit = Math.abs(d) * maxExpandMult;
    let offX, offY;
    if(Math.abs(m) > limit){
      // r046-fix: 簡易ベベル（2辺の垂直オフセット点の中点）
      offX = (n1x+n2x)/2*d;
      offY = (n1y+n2y)/2*d;
      // r048: ベベル中点の移動量がminOffsetMm未満なら、同じ方向のまま引き伸ばす
      // （量子化グリッドの丸めで0mmに潰れる＝真の垂直面化、を防ぐための下限保証）
      if(minOffsetMm > 0){
        const mag = Math.hypot(offX, offY);
        if(mag > 1e-9 && mag < minOffsetMm){
          const scale = minOffsetMm / mag;
          offX *= scale;
          offY *= scale;
        } else if(mag <= 1e-9){
          // 完全退化（2辺の法線が真逆で中点が原点）: ビセクター方向(ex,ey)を
          // 符号付きdの向きにフォールバックとして採用する
          const sign = d >= 0 ? 1 : -1;
          offX = ex * minOffsetMm * sign;
          offY = ey * minOffsetMm * sign;
        }
      }
    } else {
      offX = ex*m;
      offY = ey*m;
    }
    
    out.push({x: B.x + offX, y: B.y + offY});
  }
  
  const finalOut = cleanPolygonPoints(out);
  return isHole ? finalOut.reverse() : finalOut;
}

// ────────────────────────────────────────────────────────────────
//  r067: offsetPolygon結果の自己交差サニタイズ + 円弧長リサンプル
//  （AIS_CrashTest2.vold「地雷①③」対応: コの字等の凹形状を法面/微小
//   テーパーでオフセットすると、bisector法(offsetPolygon)の性質上、
//   狭いノッチをオフセット量が超えた場合に自己交差した無効な輪郭が
//   返ることがある。この自己交差リングをそのままearcut→Manifoldに渡すと
//   「Not manifold」クラッシュ、または一部が正しくUnionされない不具合になる）
//
//  方針: offsetPolygon自体（既存13箇所の呼び出し・頂点数保持契約）には
//  一切手を入れない。呼び出し元(buildCappedFrustumMesh、doboku/normal両方に
//  地雷25対応で並行適用)側で、結果を受け取った直後にこのサニタイズを
//  追加で噛ませる後方互換設計。自己交差が無ければ元の頂点列をそのまま
//  返すため、既存の頂点数1:1側面ステッチには影響ゼロ。自己交差が実際に
//  検出された場合のみ、頂点数が変わり得るサニタイズ後の輪郭を返す。
// ────────────────────────────────────────────────────────────────
// r068: 深さ方向でオフセットの自己交差状況が変わる(コの字ノッチが途中の
// 深さで閉じる等)場合の分割数。固定値・可変長探索はしない(泥豪くさいが
// 確実、の方針)。値を大きくするほど精度は上がるがManifoldオブジェクト数
// ×このN倍で増えるため、あくまで自己交差検出時のみ発動するフォールバック。
const _SLICE_N = 16;
function _shoelaceAreaAbs(p){
  let a=0;
  for(let i=0;i<p.length;i++){
    const p0=p[i], p1=p[(i+1)%p.length];
    a += p0.x*p1.y - p1.x*p0.y;
  }
  return Math.abs(a/2);
}
// r068追記: コの字ノッチのオフセットが「自己交差する一歩手前」で止まると、
// ClipperLibのStrictlySimple自己Unionは(交差していないので)正しく"問題なし"
// と判定するが、実際にはノッチが幅ほぼ0mmまで狭まった「ピンチ点」を持つ
// 退化リングになっていることがある(AIS_CrashTest2「地雷①」の通常計算側で
// 実際に発生・確認済み)。これは面積比較では検出できない(面積はほぼ不変の
// ため)ので、非隣接な辺同士の最短距離を直接調べて別途検出する。
function _minNonAdjacentGapMm(ring){
  const n = ring.length;
  if(n < 4) return Infinity;
  function closestOnSeg(p, a, b){
    const abx=b.x-a.x, aby=b.y-a.y;
    const len2 = abx*abx+aby*aby;
    if(len2<1e-9) return a;
    let t = ((p.x-a.x)*abx + (p.y-a.y)*aby)/len2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x+abx*t, y: a.y+aby*t };
  }
  function dist(p,q){ return Math.hypot(p.x-q.x, p.y-q.y); }
  function segGap(a,b,c,d){
    return Math.min(
      dist(a, closestOnSeg(a,c,d)), dist(b, closestOnSeg(b,c,d)),
      dist(c, closestOnSeg(c,a,b)), dist(d, closestOnSeg(d,a,b))
    );
  }
  let minGap = Infinity;
  for(let i=0;i<n;i++){
    const a=ring[i], b=ring[(i+1)%n];
    for(let j=i+2;j<n;j++){
      if(i===0 && j===n-1) continue; // 先頭・末尾は隣接扱い
      const c=ring[j], d=ring[(j+1)%n];
      const gap = segGap(a,b,c,d);
      if(gap < minGap) minGap = gap;
    }
  }
  return minGap;
}
function _sanitizeOffsetRing(pts){
  if(!pts || pts.length < 3) return { pts, changed:false };
  const origArea = _shoelaceAreaAbs(pts);
  if(origArea < 1e-6) return { pts, changed:false };

  const SF = 10000; // 既存踏襲のClipperLib整数スケール
  const path = pts.map(p => ({X: Math.round(p.x*SF), Y: Math.round(p.y*SF)}));
  const cl = new ClipperLib.Clipper();
  cl.StrictlySimple = true; // 自己交差の無い単純多角形群を保証させる
  cl.AddPath(path, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  cl.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

  let best = null, bestArea = -1;
  const childs = tree.Childs();
  for(let i=0;i<childs.length;i++){
    const contour = childs[i].Contour().map(p=>({x:p.X/SF, y:p.Y/SF}));
    const a = _shoelaceAreaAbs(contour);
    if(a > bestArea){ bestArea = a; best = contour; }
  }
  if(!best || bestArea < 1e-6) return { pts, changed:false };

  const areaChanged = Math.abs(bestArea - origArea) / origArea >= 1e-4;
  const pinchGapMm = _minNonAdjacentGapMm(pts);
  const pinchThresholdMm = Math.max((window._vertexQuantMm||10) * 2, 20);
  const pinched = pinchGapMm < pinchThresholdMm;

  if(!areaChanged && !pinched){
    // 自己交差もピンチも無し。元の頂点列を無変更で返す(頂点数保持契約を維持)
    return { pts, changed:false };
  }
  if(areaChanged){
    console.warn(`[SANITIZE] オフセット輪郭の自己交差を検出・解消 (面積 ${origArea.toFixed(0)}→${bestArea.toFixed(0)}mm²、頂点数 ${pts.length}→${best.length})`);
  } else {
    console.warn(`[SANITIZE] オフセット輪郭にピンチ点を検出 (最短ギャップ${pinchGapMm.toFixed(1)}mm < 閾値${pinchThresholdMm}mm、頂点数${pts.length})`);
  }
  return { pts: best, changed:true };
}
// 自己交差サニタイズで頂点数が変わってしまった場合のみ使うフォールバック。
// 円弧長パラメータ化で両輪郭を同じN点にリサンプルし、側面ステッチ用の
// 対応関係を強制的に作る(泥臭いが確実な方法。通常経路には一切関与しない)。
function _resampleRingByArcLength(ring, n){
  const perim = [];
  let total = 0;
  for(let i=0;i<ring.length;i++){
    const a=ring[i], b=ring[(i+1)%ring.length];
    const d = Math.hypot(b.x-a.x, b.y-a.y);
    perim.push(d);
    total += d;
  }
  if(total < 1e-6) return ring.slice(0, n);
  const out = [];
  for(let k=0;k<n;k++){
    const target = total * k / n;
    let acc = 0, i = 0;
    while(i < ring.length && acc + perim[i] < target){ acc += perim[i]; i++; }
    if(i >= ring.length) i = ring.length - 1;
    const segLen = perim[i] || 1e-9;
    const t = (target - acc) / segLen;
    const a = ring[i], b = ring[(i+1)%ring.length];
    out.push({ x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
//  buildFrustumGeometry: ポリゴン実形状で錐台メッシュ生成
//  ★CW統一・i番同士1:1対応・ねじれ0保証
// ────────────────────────────────────────────────────────────────
function buildFrustumGeometry(f){
  // v0.0013: 縮退チェック（面積ゼロ・頂点不足）
  if(!f.ptsMm || f.ptsMm.length < 3) return {positions: new Float32Array(0), indices: new Uint32Array(0)};
  if((f.area||0) < 1e-6) return {positions: new Float32Array(0), indices: new Uint32Array(0)};
  if(f.D <= 0) return {positions: new Float32Array(0), indices: new Uint32Array(0)};
  if(f.ptsMm.some(p => isNaN(p.x) || isNaN(p.y))) return {positions: new Float32Array(0), indices: new Uint32Array(0)};

  // 頂点クレンジングを初期ポリゴンに適用し、潰れ面を防止
  const cleanedOuter = cleanPolygonPoints(f.ptsMm||[]);
  const outerBase = normalizeCW(cleanedOuter);
  
  const holesBase = (f.holesMm||[]).map(h=>{
    const cleanedH = cleanPolygonPoints(h);
    return polySignedArea(cleanedH)>0 ? cleanedH.slice().reverse() : cleanedH.slice();
  });
  
  const allPaths=[outerBase,...holesBase];
  const allBottom=[],allTop=[];

  allPaths.forEach((path,pIdx)=>{
    const isHole=pIdx>0;
    let distB, distT;
    if(!isHole){
      distB = f.OD;
      distT = f.noSlope ? f.OD : (f.OD + f.D * getSlopeRatio());
    } else {
      distB = f.OD;
      distT = f.noSlope ? f.OD : Math.max(0, f.OD - f.D * getSlopeRatio());
    }
    const bottom=offsetPolygon(path,distB,isHole);
    const top   =offsetPolygon(path,distT,isHole);
    // v0.0013: 頂点数不一致ガード（cleanPolygonPointsで頂点が減ることがある）
    // bottomとtopの頂点数が違う場合はpathの頂点数に揃える
    if(bottom.length !== top.length || bottom.length !== path.length){
      // pathから直接変位させる（cleanなし）
      const cx=path.reduce((s,p)=>s+p.x,0)/path.length;
      const cy=path.reduce((s,p)=>s+p.y,0)/path.length;
      const safeOffset=(d)=>path.map(p=>{
        const dx=p.x-cx, dy=p.y-cy, l=Math.hypot(dx,dy)||1;
        return {x:p.x+(dx/l)*d, y:p.y+(dy/l)*d};
      });
      const bPts = distB>0 ? safeOffset(distB) : path.map(p=>({x:p.x,y:p.y}));
      const tPts = distT>0 ? safeOffset(distT) : path.map(p=>({x:p.x,y:p.y}));
      bPts.forEach(p=>allBottom.push(p));
      tPts.forEach(p=>allTop.push(p));
    } else {
      bottom.forEach(p=>allBottom.push(p));
      top.forEach(p=>allTop.push(p));
    }
  });

  const n=allBottom.length;
  // NaNガード
  if(n===0 || n!==allTop.length) return {positions: new Float32Array(0), indices: new Uint32Array(0)};
  const pos = new Float32Array(n * 2 * 3);
  const tlY = f.tl || 0;

  for(let i=0; i<n; i++){
    pos[i*3]=allBottom[i].x; pos[i*3+1]=tlY-f.D; pos[i*3+2]=allBottom[i].y;
  }
  for(let i=0; i<n; i++){
    pos[(n+i)*3]=allTop[i].x; pos[(n+i)*3+1]=tlY; pos[(n+i)*3+2]=allTop[i].y;
  }

  const idx=[];
  const holeStarts = [];
  let vv=0;
  allPaths.forEach((path,pIdx)=>{
    if(pIdx>0) holeStarts.push(vv);
    vv+=path.length;
  });

  // 1. 底面の蓋（下向きCCW＝下向き外向き法線）
  const flatBot = [];
  allBottom.forEach(p=>flatBot.push(p.x, p.y));
  const trisBot=earcut(flatBot, holeStarts.length ? holeStarts : null, 2);
  for(let i=0; i<trisBot.length; i+=3){
    idx.push(trisBot[i], trisBot[i+2], trisBot[i+1]);
  }

  // 2. 上面の蓋（上から見てCCW＝上向き外向き法線。厳格に反転！）
  const flatTop = [];
  allTop.forEach(p=>flatTop.push(p.x, p.y));
  const trisTop=earcut(flatTop, holeStarts.length ? holeStarts : null, 2);
  for(let i=0; i<trisTop.length; i+=3){
    idx.push(n+trisTop[i], n+trisTop[i+2], n+trisTop[i+1]);
  }

  // 3. 側面スロープ壁
  let vOff=0;
  allPaths.forEach((path,pIdx)=>{
    const isHole=pIdx>0;
    const m=path.length;
    for(let i=0; i<m; i++){
      const curr=vOff+i, next=vOff+(i+1)%m;
      if(isHole){
        idx.push(curr, n+curr, next);
        idx.push(next, n+curr, n+next);
      }else{
        idx.push(curr, next, n+curr);
        idx.push(next, n+next, n+curr);
      }
    }
    vOff+=m;
  });

  return {positions: pos, indices: new Uint32Array(idx)};
}


// ████████████████████████████████████████████████████████████████
// ██  SECTION 3: 3Dシェルメッシュ生成（体積計算・GLB出力専用）  ██
// ████████████████████████████████████████████████████████████████
// ────────────────────────────────────────────────────────────────
//  buildShellMesh: v0.0007以前の実装だが、現在も buildUnionFrustumGeometry
//  （体積計算＝_calcVolumeFallback系）から現役で呼ばれ、GLB保存用の
//  unionGeoms（_lastGeoms）を生成している。
//  ★注意：3Dプレビュー表示（3D-r039時点）は完全に別系統の
//  buildManifoldUnionGeom が担っている。両者は独立しているため、
//  一方の修正がもう一方に影響することは無い（r038-r039で確認済み）。
// ────────────────────────────────────────────────────────────────
function buildShellMesh(frustums, offsetXmm, offsetYmm){
  const SF = 1000000; // 整数座標スケール（浮動小数点誤差排除）
  const positions = [];
  const indices   = [];

  // ── ヘルパー: 深さzでのフラスタムf断面輪郭（mm座標）を返す
  // zはGL下深さ(mm、正値)、tl考慮あり
  function frustumContourAtDepth(f, z){
    const topDepth = -(f.tl || 0);
    const botDepth = f.D - (f.tl || 0);
    if(z < topDepth - 1e-6 || z > botDepth + 1e-6) return null;
    let offsetDist;
    if(f.noSlope){
      offsetDist = f.OD;
    } else {
      const fromTop = z - topDepth;
      const ratio = 1.0 - fromTop / f.D;
      offsetDist = f.OD + ratio * f.D * getSlopeRatio();
      if(offsetDist < 0) offsetDist = 0;
    }
    return offsetDist > 0 ? clipContourToYamadome(offsetPolygon(f.ptsMm, offsetDist), SF, offsetXmm, offsetYmm) : clipContourToYamadome(f.ptsMm.map(p=>({x:p.x,y:p.y})), SF, offsetXmm, offsetYmm);
  }

  // ── ヘルパー: 深さzでの全フラスタムのClipper UNION輪郭リストを返す
  // [{outer:[{x,y}], holes:[[{x,y}]]}]
  function unionContoursAtDepth(z){
    const cl = new ClipperLib.Clipper();
    let added = false;
    frustums.forEach(f => {
      const contour = frustumContourAtDepth(f, z);
      if(!contour || contour.length < 3) return;
      cl.AddPath(
        contour.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)})),
        ClipperLib.PolyType.ptSubject, true
      );
      added = true;
    });
    if(!added) return [];
    const sol = new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctUnion, sol,
      ClipperLib.PolyFillType.pftPositive,
      ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }

  // ── ヘルパー: 3D頂点を追加してインデックスを返す (x,yはmm平面, depth=GL下深さmm)
  function addVertex(x, y, depth){
    const tlY = 0; // 天端は常にY=0
    positions.push(x, tlY - depth, y);
    return (positions.length / 3) - 1;
  }

  // ── ヘルパー: earcut三角分割して面を追加
  // outerPts=[{x,y}], holesPts=[[{x,y}]], depth=GL下深さ, flipNormal=底面用
  function addFace(outerPts, holesPts, depth, flipNormal){
    if(!outerPts || outerPts.length < 3) return;
    const baseIdx = positions.length / 3;
    const flat = [];
    const holeStarts = [];
    outerPts.forEach(p => flat.push(p.x, p.y));
    (holesPts||[]).forEach(h => {
      if(!h || h.length < 3) return;
      holeStarts.push(flat.length / 2);
      h.forEach(p => flat.push(p.x, p.y));
    });
    // 頂点を追加
    const allPts = [...outerPts, ...(holesPts||[]).flat()];
    allPts.forEach(p => addVertex(p.x, p.y, depth));
    const tris = earcut(flat, holeStarts.length ? holeStarts : null, 2);
    for(let i = 0; i < tris.length; i += 3){
      if(flipNormal){
        indices.push(baseIdx+tris[i], baseIdx+tris[i+2], baseIdx+tris[i+1]);
      } else {
        indices.push(baseIdx+tris[i], baseIdx+tris[i+1], baseIdx+tris[i+2]);
      }
    }
  }

  // ── ヘルパー: 2輪郭間のジッパーloft（側壁）
  // upperPts/lowerPts=[{x,y}], upperDepth/lowerDepth=GL下深さmm
  // 輪郭は頂点数が一致していなくても近傍マッチングで対応
  function addLoftWall(upperPts, lowerPts, upperDepth, lowerDepth){
    if(!upperPts || !lowerPts) return;
    const nu = upperPts.length;
    const nl = lowerPts.length;
    if(nu < 2 || nl < 2) return;

    // 頂点インデックスのベース
    const uBase = positions.length / 3;
    upperPts.forEach(p => addVertex(p.x, p.y, upperDepth));
    const lBase = positions.length / 3;
    lowerPts.forEach(p => addVertex(p.x, p.y, lowerDepth));

    // 輪郭の開始点を最近傍で合わせる（ねじれ防止）
    let bestOffset = 0;
    let bestDist = Infinity;
    for(let off = 0; off < nl; off++){
      const dx = upperPts[0].x - lowerPts[off].x;
      const dy = upperPts[0].y - lowerPts[off].y;
      const d = dx*dx + dy*dy;
      if(d < bestDist){ bestDist = d; bestOffset = off; }
    }

    // ジッパーloft: 2輪郭をトラバースしながら三角形を貼る
    let ui = 0, li = 0;
    const totalSteps = nu + nl;
    for(let step = 0; step < totalSteps; step++){
      const uNext = (ui + 1) % nu;
      const lNext = (li + 1) % nl;
      const lIdx  = (li + bestOffset) % nl;
      const lNextIdx = (lNext + bestOffset) % nl;

      if(ui < nu - 1 && li < nl - 1){
        // どちらを進むか: 対角線の長さで判断
        const du = Math.hypot(
          upperPts[uNext].x - lowerPts[lIdx].x,
          upperPts[uNext].y - lowerPts[lIdx].y);
        const dl = Math.hypot(
          upperPts[ui].x - lowerPts[lNextIdx].x,
          upperPts[ui].y - lowerPts[lNextIdx].y);
        if(du <= dl){
          indices.push(uBase+ui, lBase+lIdx, uBase+uNext);
          ui++;
        } else {
          indices.push(uBase+ui, lBase+lIdx, lBase+lNextIdx);
          li++;
        }
      } else if(ui < nu - 1){
        indices.push(uBase+ui, lBase+lIdx, uBase+uNext);
        ui++;
      } else if(li < nl - 1){
        indices.push(uBase+ui, lBase+lIdx, lBase+lNextIdx);
        li++;
      } else {
        break;
      }
    }
    // 最後の閉じ三角形
    indices.push(uBase+(nu-1), lBase+((bestOffset+nl-1)%nl), uBase+0);
    indices.push(uBase+0, lBase+((bestOffset+nl-1)%nl), lBase+bestOffset);
  }

  // ── ヘルパー: Clipper DIFFERENCE (A - B) → 残余輪郭リスト
  function clipperDifference(contoursA, contoursB){
    if(!contoursA.length) return [];
    if(!contoursB.length) return contoursA;
    const cl = new ClipperLib.Clipper();
    contoursA.forEach(item => {
      cl.AddPath(item.outer.map(p=>({X:Math.round(p.x*SF),Y:Math.round(p.y*SF)})),
        ClipperLib.PolyType.ptSubject, true);
    });
    contoursB.forEach(item => {
      cl.AddPath(item.outer.map(p=>({X:Math.round(p.x*SF),Y:Math.round(p.y*SF)})),
        ClipperLib.PolyType.ptClip, true);
    });
    const sol = new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctDifference, sol,
      ClipperLib.PolyFillType.pftPositive,
      ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }

  // ────────────────────────────────────
  //  メイン処理: 深さインターバルを収集
  // ────────────────────────────────────
  // 全フラスタムの底面深さ（ユニーク）を収集してソート
  const depthSet = new Set();
  depthSet.add(0); // 天端 (GL=0)
  frustums.forEach(f => {
    const botDepth = f.D - (f.tl || 0);
    depthSet.add(Math.round(botDepth * 100) / 100);
  });
  const sortedDepths = [...depthSet].sort((a,b) => a-b);
  // [0, d1, d2, ...] の形。インターバル = [sortedDepths[i], sortedDepths[i+1]]

  // 各インターバルで側壁を生成
  for(let i = 0; i < sortedDepths.length - 1; i++){
    const zA = sortedDepths[i];   // 上（GL下深さ mm）
    const zB = sortedDepths[i+1]; // 下

    const upperContours = unionContoursAtDepth(zA + 1e-3); // 微小+でエッジ回避
    const lowerContours = unionContoursAtDepth(zB - 1e-3);

    // ステップ面: zA での輪郭 - zB での輪郭（= 段差の水平面）
    // zA > 0 の場合のみ（上面=0はスキップ）
    if(zA > 1e-6){
      const stepFaces = clipperDifference(upperContours, lowerContours);
      stepFaces.forEach(item => {
        addFace(item.outer, item.holes, zA, false); // 下向き法線(上から見て穴の縁)
      });
    }

    // 側壁: 上輪郭→下輪郭のloft
    // 輪郭数が一致する場合は1:1対応, 異なる場合は各上輪郭に最近傍下輪郭をマッチ
    upperContours.forEach(upperItem => {
      // 最近傍の下輪郭を選択（重心距離）
      const uCx = upperItem.outer.reduce((s,p)=>s+p.x,0)/upperItem.outer.length;
      const uCy = upperItem.outer.reduce((s,p)=>s+p.y,0)/upperItem.outer.length;
      let bestLower = null, bestLowerDist = Infinity;
      lowerContours.forEach(lowerItem => {
        const lCx = lowerItem.outer.reduce((s,p)=>s+p.x,0)/lowerItem.outer.length;
        const lCy = lowerItem.outer.reduce((s,p)=>s+p.y,0)/lowerItem.outer.length;
        const d = Math.hypot(uCx-lCx, uCy-lCy);
        if(d < bestLowerDist){ bestLowerDist = d; bestLower = lowerItem; }
      });
      if(bestLower){
        addLoftWall(upperItem.outer, bestLower.outer, zA, zB);
      }
    });
  }

  // ── 底面: 最深インターバルの下輪郭をearcut
  const maxDepth = sortedDepths[sortedDepths.length - 1];
  const bottomContours = unionContoursAtDepth(maxDepth - 1e-3);
  bottomContours.forEach(item => {
    addFace(item.outer, item.holes, maxDepth, true); // flipNormal=true（下面）
  });

  // ── THREE.BufferGeometryに変換
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geom.computeVertexNormals();
  return geom;
}

// ────────────────────────────────────────────────────────────────
//  buildUnionFrustumGeometry: 計算エントリーポイント
//  体積計算（_calcVolumeFallback）を実行し、3D表示用データを返す。
//  3Dメッシュ本体は initThree_watertight → buildManifoldUnionGeom で生成。
// ────────────────────────────────────────────────────────────────
async function buildUnionFrustumGeometry(frustums, offsetXmm, offsetYmm){
  // 26回目セッション新規: 「既存躯体」機能 ― グレー色のオブジェクトは掘削対象
  // ではなく、既にそこにコンクリートがある扱い。個別ジオメトリ・体積計算からは
  // 分離し、後段で掘削体積との重複分だけを差し引く。
  const excavFrustums = frustums.filter(f => f.color !== 'gray');
  const structFrustums = frustums.filter(f => f.color === 'gray');

  // 個別ジオメトリ（表示用・デバッグ用に保持）
  const geoms = frustums.map(f => buildFrustumGeometry(f));

  // 体積計算: 層別スライス法（Fix11）
  // r065(AIS修正案): 山留オフセットをバケツリレーで橋渡し(致命的バグ修正)
  // ★_calcVolumeFallback自体は無改変(体積計算の正解関数)。既存躯体(グレー)は
  // 掘削対象外のため、ここではexcavFrustumsのみを渡す。
  const excavVol = _calcVolumeFallback(excavFrustums, offsetXmm, offsetYmm);
  let totalVol = excavVol;

  // 26回目セッション新規: 既存躯体が掘削形状と重なる分だけ、体積計算結果から
  // 差し引く(「そこには既にコンクリートがあるから体積がその分減る」)
  // r017(28回目セッション): マスター要望により、この2つの内訳((A)掘削のみ合計と
  // (B)既存躯体重複)をxlsx/PDF/PNG出力に別掲するため、totalVol算出と別に
  // それぞれ単独で保持しておく(既存の合算ロジック・最終値自体は変更なし)。
  let overlapVol = 0;
  if(structFrustums.length){
    overlapVol = _calcExistingStructureOverlapVolume(excavFrustums, structFrustums, offsetXmm, offsetYmm);
    totalVol = Math.max(0, totalVol - overlapVol);

    // 【診断用・段階1検証・r018】(B)専用メッシュの体積を発散定理で算出し、
    // 基準値(_calcExistingStructureOverlapVolumeの10mmスライス数値)と突き合わせる。
    // マスター実機確認後、撤去して次段階(GLB化・エビル連携)へ進む。
    try{
      const diagGeom = buildExistingStructureOverlapMesh(excavFrustums, structFrustums, offsetXmm, offsetYmm);
      const diagVolM3 = diagGeom ? _diagMeshVolume(diagGeom) : 0;
      console.log('[DIAG-B] 基準値(10mmスライス)=' + overlapVol.toFixed(4) + 'm³ / メッシュ体積(発散定理)=' + diagVolM3.toFixed(4) + 'm³ / 差=' + (diagVolM3-overlapVol).toFixed(4) + 'm³ / 頂点数=' + (diagGeom?diagGeom.attributes.position.count:0));
    }catch(e){
      console.warn('[DIAG-B] buildExistingStructureOverlapMeshでエラー:', e);
    }
  }

  // 外皮シェルメッシュ生成
  // 26回目セッション新規: 既存躯体(グレー)は掘削シェルの形成には参加させない
  // (excavFrustumsのみ渡す)。既存躯体自体はこの下で別途、シェルとは独立した
  // 「描いた形状そのまま」のジオメトリとしてunionGeomsに追加する。
  let shellGeom = null;
  try {
    shellGeom = buildShellMesh(excavFrustums, offsetXmm, offsetYmm);
  } catch(e) {
    console.warn('[buildShellMesh] Error:', e);
  }

  // THREE.BufferGeometry → {positions, indices} 形式に変換してunionGeomsとして返す
  const unionGeoms = [];
  if(shellGeom){
    const posAttr = shellGeom.getAttribute('position');
    const idxAttr = shellGeom.index;
    if(posAttr && idxAttr && idxAttr.count > 0){
      unionGeoms.push({
        positions: posAttr.array,
        indices: idxAttr.array,
        _threeGeom: shellGeom // initThree_watertightで直接使う用
      });
    }
  }
  // フォールバック: シェルメッシュ失敗時は従来の深さ別フラスタムジオメトリ
  if(!unionGeoms.length){
    console.warn('[buildUnionFrustumGeometry] Shell mesh failed, falling back to per-depth frustums');
    const SF2 = 10000;
    const depthGroups = new Map();
    excavFrustums.forEach(f => {
      const key = Math.round(f.D);
      if(!depthGroups.has(key)) depthGroups.set(key, []);
      depthGroups.get(key).push(f);
    });
    [...depthGroups.keys()].sort((a,b)=>a-b).forEach(depthKey => {
      const f0 = depthGroups.get(depthKey)[0];
      const cl = new ClipperLib.Clipper();
      depthGroups.get(depthKey).forEach(f => {
        const odPts = f.OD > 0 ? offsetPolygon(f.ptsMm, f.OD) : f.ptsMm;
        cl.AddPath(odPts.map(p=>({X:Math.round(p.x*SF2),Y:Math.round(p.y*SF2)})),
          ClipperLib.PolyType.ptSubject, true);
      });
      const sol = new ClipperLib.Paths();
      cl.Execute(ClipperLib.ClipType.ctUnion, sol,
        ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
      classifyPaths(sol, SF2).forEach(item => {
        unionGeoms.push(buildFrustumGeometry({
          ptsMm: item.outer,
          holesMm: item.holes,
          D: depthKey,
          tl: f0.tl || 0,
          OD: f0.OD,
          noSlope: depthGroups.get(depthKey).every(f=>f.noSlope)
        }));
      });
    });
  }

  // 26回目セッション新規: 既存躯体(グレー)のジオメトリは、掘削シェル(unionGeoms)
  // には混ぜない。r051の「Voldia_FixedObjectsをGL面境界ループ検出に混ぜると
  // 誤動作する」と全く同じ理由(既存躯体は掘削シェルと接続しない独立ソリッドの
  // ため、境界検出の辺カウントを狂わせる)。完全に別フィールドとして返す。
  const existingStructGeoms = structFrustums.map(f => buildFrustumGeometry({...f, noSlope:true, OD:0}))
    .filter(g => g.positions && g.positions.length);

  return {
    geoms,
    unionGeoms,
    existingStructGeoms,
    unionVol: totalVol,
    excavOnlyVol: excavVol,          // (A) 既存躯体を考慮しない掘削のみの合計
    existingStructOverlapVol: overlapVol, // (B) 掘削と重なる既存躯体の体積
    error: null
  };
}

// ────────────────────────────────────────────────────────────────
//  _calcVolumeFallback: 層別スライス法による体積計算
//  各深さスライスでClipper 2D UNIONを取り、面積×厚みを積算。

// ████████████████████████████████████████████████████████████████
// ██  SECTION 4: 体積計算・フラスタム・Three.js初期化            ██
// ██  _calcVolumeFallback / shapeToFrustum / showCalcModal      ██
// ██  initThree_preview / _initThreeBase / updOrbit3            ██
// ████████████████████████████████████████████████████████████████

//  法面（錐台）・異深さ・部分重複すべて正確に対応。
//  ★この関数は絶対に触らない（体積計算の正解）
// ────────────────────────────────────────────────────────────────
function _calcVolumeFallback(frustums, offsetXmm, offsetYmm){
  const SF = 10000;
  const SLICE_MM = 10; // スライス厚(mm)。精度↑=値小さく、速度↓

  // 全フラスタムのGL基準深さ範囲を求める
  // minTop: 最も高い天端のGL下深さ（天端+の場合は負値になる）
  const minTop   = Math.min(0, ...frustums.map(f => -(f.tl||0)));
  const maxDepth = Math.max(...frustums.map(f => f.D - (f.tl||0)));
  if(maxDepth <= minTop) return 0;

  let totalVol = 0;

  // GL上（天端+）も含めて全範囲をスライス
  for(let z0 = minTop; z0 < maxDepth; z0 += SLICE_MM){
    const z1 = Math.min(z0 + SLICE_MM, maxDepth);
    const zMid = (z0 + z1) / 2; // スライス中央のGL下深さ(mm、正値)
    const sliceH = z1 - z0;

    const cl = new ClipperLib.Clipper();
    let added = false;

    frustums.forEach(f => {
      const topDepth = -(f.tl||0);   // 天端のGL下深さ
      const botDepth = f.D - (f.tl||0); // 底面のGL下深さ

      if(zMid <= topDepth || zMid >= botDepth) return;

      // この深さでの断面オフセット距離（法面考慮）
      // r010: 穴は外周と逆テーパー（天端で無変位・深くなるほど痩せる＝
      // 3D表示側の設計仕様と揃える。外周のfromTop/ratioは無改変。VoldiaM側で
      // 見つかった修正の移植）
      const fromTop = zMid - topDepth;
      const ratio = 1.0 - fromTop / f.D;
      let offsetDistOuter, offsetDistHole;
      if(f.noSlope){
        offsetDistOuter = f.OD;
        offsetDistHole  = f.OD;
      } else {
        offsetDistOuter = f.OD + ratio * f.D * getSlopeRatio();
        offsetDistHole  = f.OD + (1.0 - ratio) * f.D * getSlopeRatio();
        if(offsetDistOuter < 0) offsetDistOuter = 0;
        if(offsetDistHole  < 0) offsetDistHole  = 0;
      }

      // --- 外周 ---
      let slicePts = offsetDistOuter > 0
        ? offsetPolygon(f.ptsMm, offsetDistOuter)
        : f.ptsMm;
      // r038: 山留がある場合、法面オフセット後の輪郭をここで垂直クリップ
      // (既存の体積計算ロジック自体は無改変。山留が無ければ完全に素通り)
      // r065(AIS修正案・致命的バグ修正): 山留座標がオフセット未考慮のワールド座標の
      // ままだったため、局所座標のslicePtsとズレて交差判定が崩れ、体積が大きく
      // 狂っていた。offsetXmm/offsetYmmを明示的に渡す。
      slicePts = clipContourToYamadome(slicePts, SF, offsetXmm, offsetYmm);
      if(!slicePts || slicePts.length < 3) return;

      const rawPath = slicePts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
      // ポリゴンの向きを正規化（CCW必須。CWだとpftPositiveで穴扱いになり面積0になる）
      let sa = 0;
      for(let i=0;i<rawPath.length;i++){
        const j=(i+1)%rawPath.length;
        sa += rawPath[i].X*rawPath[j].Y - rawPath[j].X*rawPath[i].Y;
      }
      if(sa < 0) rawPath.reverse(); // CW→CCWに反転
      cl.AddPath(rawPath, ClipperLib.PolyType.ptSubject, true);
      added = true;

      // --- 穴(holesMm): r010で新規追加。CWのまま(逆巻き)Subjectに追加し、
      // pftPositiveの巻き数計算で外周から自動減算させる。他フラスタムの
      // 外周がこの領域に重なっていれば正しく巻き数が相殺されず「その分は
      // 掘削されたまま」になる（隣の掘削が穴の位置まで被っていれば、穴が
      // 塞がっているのと同じ状態になるのが物理的に正しい挙動） ---
      if(f.holesMm && f.holesMm.length){
        f.holesMm.forEach(h => {
          const hPts = offsetDistHole > 0 ? offsetPolygon(h, offsetDistHole, true) : h;
          if(!hPts || hPts.length < 3) return;
          const rawHole = hPts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
          let saH = 0;
          for(let i=0;i<rawHole.length;i++){
            const j=(i+1)%rawHole.length;
            saH += rawHole[i].X*rawHole[j].Y - rawHole[j].X*rawHole[i].Y;
          }
          if(saH > 0) rawHole.reverse(); // CCW→CWに反転（外周と逆巻きに統一）
          cl.AddPath(rawHole, ClipperLib.PolyType.ptSubject, true);
          added = true;
        });
      }
    });

    if(!added) continue;

    const sol = new ClipperLib.Paths();
    cl.Execute(
      ClipperLib.ClipType.ctUnion, sol,
      ClipperLib.PolyFillType.pftPositive,
      ClipperLib.PolyFillType.pftPositive
    );

    // r010(VoldiaM側で発見された真因の移植): 同じ深さで複数のオブジェクトが
    // 隣接/近接して配置され、その隙間が完全に囲まれる（中央に穴ができる）
    // 配置になると、ClipperLibのUnion結果には「外周」と「穴」が別々のpathで
    // 返ってくる（互いに逆巻きになる）。従来はMath.abs(a)で全pathを無条件に
    // 加算していたため、この「穴」まで外周と同じ符号で足してしまい、
    // オブジェクトを追加して穴の形状が変わるだけで合計体積が大きくブレる
    // （追加したのに減る、等）バグの直接原因になっていた。符号を保持したまま
    // 合計すれば、Clipperが返す外周(+)と穴(-)の向きがそのまま正しく相殺される。
    let sliceArea = 0;
    sol.forEach(path => {
      let a = 0;
      for(let i=0; i<path.length; i++){
        const j=(i+1)%path.length;
        a += path[i].X * path[j].Y - path[j].X * path[i].Y;
      }
      sliceArea += a / 2 / (SF * SF); // ★abs()を取らない（符号を保持して穴を相殺）
    });
    sliceArea = Math.abs(sliceArea); // 全体としての正味面積は非負のはず（念のため）

    totalVol += sliceArea * sliceH;
  }
  return totalVol;
}

// ────────────────────────────────────────────────────────────────
//  26回目セッション新規: 「既存躯体」機能 ― 掘削形状(excavFrustums)と
//  既存躯体(structFrustums、色=purple移設後は"gray"のまま=既存躯体の意)が
//  重なる分の体積を、_calcVolumeFallbackと全く同じスライス幅・深さレンジの
//  考え方で算出する。★_calcVolumeFallback自体は一切改変しない(体積計算の
//  正解関数のため)。この関数は完全に外付けのサイドカーとして動作する。
//  既存躯体側はOD(余掘り)・法面を一切適用しない「描いた形状そのまま(天端・
//  下端も含む)」の垂直押し出しとして扱う(マスター仕様: 余掘りや捨てコン+
//  砕石は既存躯体には適用しない=無視)。
//  掘削側と既存躯体側、それぞれの断面をスライスごとにunionしたうえで
//  ctIntersection(交差)を取り、重なった面積だけを積算する。既存躯体が
//  掘削範囲の外にはみ出ている部分は交差面積0になるので過剰減算にならない。
// ────────────────────────────────────────────────────────────────
function _calcExistingStructureOverlapVolume(excavFrustums, structFrustums, offsetXmm, offsetYmm){
  if(!excavFrustums.length || !structFrustums.length) return 0;
  const SF = 10000;
  const SLICE_MM = 10;

  const allF = excavFrustums.concat(structFrustums);
  const minTop   = Math.min(0, ...allF.map(f => -(f.tl||0)));
  const maxDepth = Math.max(...allF.map(f => f.D - (f.tl||0)));
  if(maxDepth <= minTop) return 0;

  let overlapVol = 0;

  for(let z0 = minTop; z0 < maxDepth; z0 += SLICE_MM){
    const z1 = Math.min(z0 + SLICE_MM, maxDepth);
    const zMid = (z0 + z1) / 2;
    const sliceH = z1 - z0;

    // --- ①掘削側(excavFrustums)の断面をunion(_calcVolumeFallbackと同一ロジック) ---
    const clEx = new ClipperLib.Clipper();
    let addedEx = false;
    excavFrustums.forEach(f => {
      const topDepth = -(f.tl||0);
      const botDepth = f.D - (f.tl||0);
      if(zMid <= topDepth || zMid >= botDepth) return;
      const fromTop = zMid - topDepth;
      const ratio = 1.0 - fromTop / f.D;
      let offsetDistOuter, offsetDistHole;
      if(f.noSlope){
        offsetDistOuter = f.OD;
        offsetDistHole  = f.OD;
      } else {
        offsetDistOuter = f.OD + ratio * f.D * getSlopeRatio();
        offsetDistHole  = f.OD + (1.0 - ratio) * f.D * getSlopeRatio();
        if(offsetDistOuter < 0) offsetDistOuter = 0;
        if(offsetDistHole  < 0) offsetDistHole  = 0;
      }
      let slicePts = offsetDistOuter > 0 ? offsetPolygon(f.ptsMm, offsetDistOuter) : f.ptsMm;
      slicePts = clipContourToYamadome(slicePts, SF, offsetXmm, offsetYmm);
      if(!slicePts || slicePts.length < 3) return;
      const rawPath = slicePts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
      let sa=0;
      for(let i=0;i<rawPath.length;i++){ const j=(i+1)%rawPath.length; sa += rawPath[i].X*rawPath[j].Y - rawPath[j].X*rawPath[i].Y; }
      if(sa<0) rawPath.reverse();
      clEx.AddPath(rawPath, ClipperLib.PolyType.ptSubject, true);
      addedEx = true;
      if(f.holesMm && f.holesMm.length){
        f.holesMm.forEach(h=>{
          const hPts = offsetDistHole > 0 ? offsetPolygon(h, offsetDistHole, true) : h;
          if(!hPts || hPts.length<3) return;
          const rawHole = hPts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
          let saH=0;
          for(let i=0;i<rawHole.length;i++){ const j=(i+1)%rawHole.length; saH += rawHole[i].X*rawHole[j].Y - rawHole[j].X*rawHole[i].Y; }
          if(saH>0) rawHole.reverse();
          clEx.AddPath(rawHole, ClipperLib.PolyType.ptSubject, true);
        });
      }
    });
    if(!addedEx) continue;
    const solEx = new ClipperLib.Paths();
    clEx.Execute(ClipperLib.ClipType.ctUnion, solEx, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    if(!solEx.length) continue;

    // --- ②既存躯体側(structFrustums)の断面をunion(OD=0・法面無視、描いた形状そのまま) ---
    const clSt = new ClipperLib.Clipper();
    let addedSt = false;
    structFrustums.forEach(f => {
      const topDepth = -(f.tl||0);
      const botDepth = f.D - (f.tl||0);
      if(zMid <= topDepth || zMid >= botDepth) return;
      const rawPath = f.ptsMm.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
      let sa=0;
      for(let i=0;i<rawPath.length;i++){ const j=(i+1)%rawPath.length; sa += rawPath[i].X*rawPath[j].Y - rawPath[j].X*rawPath[i].Y; }
      if(sa<0) rawPath.reverse();
      clSt.AddPath(rawPath, ClipperLib.PolyType.ptSubject, true);
      addedSt = true;
      if(f.holesMm && f.holesMm.length){
        f.holesMm.forEach(h=>{
          const rawHole = h.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
          let saH=0;
          for(let i=0;i<rawHole.length;i++){ const j=(i+1)%rawHole.length; saH += rawHole[i].X*rawHole[j].Y - rawHole[j].X*rawHole[i].Y; }
          if(saH>0) rawHole.reverse();
          clSt.AddPath(rawHole, ClipperLib.PolyType.ptSubject, true);
        });
      }
    });
    if(!addedSt) continue;
    const solSt = new ClipperLib.Paths();
    clSt.Execute(ClipperLib.ClipType.ctUnion, solSt, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    if(!solSt.length) continue;

    // --- ③①と②の交差(重複部分)だけを面積計算して積算 ---
    const clInt = new ClipperLib.Clipper();
    clInt.AddPaths(solEx, ClipperLib.PolyType.ptSubject, true);
    clInt.AddPaths(solSt, ClipperLib.PolyType.ptClip, true);
    const solInt = new ClipperLib.Paths();
    clInt.Execute(ClipperLib.ClipType.ctIntersection, solInt, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);

    let sliceArea = 0;
    solInt.forEach(path=>{
      let a=0;
      for(let i=0;i<path.length;i++){ const j=(i+1)%path.length; a += path[i].X*path[j].Y - path[j].X*path[i].Y; }
      sliceArea += Math.abs(a)/2/(SF*SF);
    });

    overlapVol += sliceArea * sliceH;
  }
  return overlapVol;
}

// ────────────────────────────────────────────────────────────────
//  buildExistingStructureOverlapMesh: (B)専用 — 掘削∩既存躯体の水密ソリッド
//  r018(29回目セッション、段階1): マスター方針(2026-09-15)
//  「3Dイメージ側のスライス計算とExcel(エビル)側の計算は完全に別物」に基づき、
//  Excel専用のB(既存躯体重複分)ソリッドをbuildShellMeshのブレークポイント+loft
//  手法で新設。表示専用オフセット(z-fighting回避・LandXML用テーパー回避)は
//  一切継承しない。掘削側の法面自体は実形状なので反映するが、既存躯体側は
//  _calcExistingStructureOverlapVolumeと同じく「描いた形状そのまま」とする。
//  段階1の現時点では単体関数として作成のみ。GLB化・エビル連携は未着手
//  (_diagMeshVolumeで数値検証してから次段階へ進む)。
//
//  ★★★r021(30回目セッション)で根本原因を特定・修正(実機未確認)★★★
//  r020まで、本関数の体積は正解(6.864m³)に対し系統的に過小評価していた
//  (試行1=2端点直接loft: 5.60m³/-18%、試行2=細分化+段差スタック: -25〜33%)。
//  Node.jsで「100×100→80×80の2段テスト」等を使い切り分けた結果、原因は
//  addLoftWallの頂点対応や段差面の巻き方向ではなく、emitLayer内で
//  addLoftWall(topの全周→botの全周、斜めloft)に加えて
//  「stepFaces=clipperDifference(topContours,botContours)」という水平面を
//  "追加で"足していたことによる二重計上だったと判明した。addLoftWall1枚だけで
//  区間の体積は過不足なく表現できるため(単一フラスタムのbuildShellMeshと同原理)、
//  段差面は完全に不要かつ有害だった。証拠: stepFacesを完全に削除し
//  addLoftWallのみにしたところ、線形テーパーでは分割数Nによらず常に理論値と
//  厳密一致、非線形(sqrt)テーパーでもN=100で誤差0.02%以下まで収束することを
//  確認した。逆にstepFacesを残したままだと(flipNormalの向きを反転させても)、
//  Nを増やす=細分化を細かくするほど誤差が悪化する(試行1→試行2で悪化していたのは
//  これが理由)。今回はr020までの2行(stepFaces計算とaddFace呼び出し)を削除する
//  形でemitLayer内に修正済み。voldia_export.js側のB_PIPELINE_ENABLEDはテスト用に
//  trueへ戻したが、実機の[DIAG-B]/[DIAG-B-GLB]ログで基準値6.864m³との一致を
//  必ず確認すること(過去2回、机上では正しく見えた修正が実機検証で誤りと判明した
//  実績があるため、この修正も実機確認が済むまでは「たぶん直った」の域を出ない)。
// ────────────────────────────────────────────────────────────────
function buildExistingStructureOverlapMesh(excavFrustums, structFrustums, offsetXmm, offsetYmm){
  const SF = 1000000;
  const positions = [];
  const indices   = [];

  function addVertex(x, y, depth){
    positions.push(x, -depth, y);
    return (positions.length/3) - 1;
  }
  function addFace(outerPts, holesPts, depth, flipNormal){
    if(!outerPts || outerPts.length < 3) return;
    const baseIdx = positions.length/3;
    const flat=[]; const holeStarts=[];
    outerPts.forEach(p=>flat.push(p.x,p.y));
    (holesPts||[]).forEach(h=>{
      if(!h||h.length<3) return;
      holeStarts.push(flat.length/2);
      h.forEach(p=>flat.push(p.x,p.y));
    });
    const allPts=[...outerPts, ...(holesPts||[]).flat()];
    allPts.forEach(p=>addVertex(p.x,p.y,depth));
    const tris=earcut(flat, holeStarts.length?holeStarts:null, 2);
    for(let i=0;i<tris.length;i+=3){
      if(flipNormal) indices.push(baseIdx+tris[i], baseIdx+tris[i+2], baseIdx+tris[i+1]);
      else indices.push(baseIdx+tris[i], baseIdx+tris[i+1], baseIdx+tris[i+2]);
    }
  }
  // buildShellMeshのaddLoftWallと同一ロジック(流用元は変更しないため独立実装)
  function addLoftWall(upperPts, lowerPts, upperDepth, lowerDepth){
    if(!upperPts||!lowerPts) return;
    const nu=upperPts.length, nl=lowerPts.length;
    if(nu<2||nl<2) return;
    const uBase=positions.length/3;
    upperPts.forEach(p=>addVertex(p.x,p.y,upperDepth));
    const lBase=positions.length/3;
    lowerPts.forEach(p=>addVertex(p.x,p.y,lowerDepth));
    let bestOffset=0, bestDist=Infinity;
    for(let off=0; off<nl; off++){
      const dx=upperPts[0].x-lowerPts[off].x, dy=upperPts[0].y-lowerPts[off].y;
      const d=dx*dx+dy*dy;
      if(d<bestDist){bestDist=d;bestOffset=off;}
    }
    let ui=0, li=0;
    const totalSteps=nu+nl;
    for(let step=0; step<totalSteps; step++){
      const uNext=(ui+1)%nu, lNext=(li+1)%nl;
      const lIdx=(li+bestOffset)%nl, lNextIdx=(lNext+bestOffset)%nl;
      if(ui<nu-1 && li<nl-1){
        const du=Math.hypot(upperPts[uNext].x-lowerPts[lIdx].x, upperPts[uNext].y-lowerPts[lIdx].y);
        const dl=Math.hypot(upperPts[ui].x-lowerPts[lNextIdx].x, upperPts[ui].y-lowerPts[lNextIdx].y);
        if(du<=dl){ indices.push(uBase+ui, lBase+lIdx, uBase+uNext); ui++; }
        else{ indices.push(uBase+ui, lBase+lIdx, lBase+lNextIdx); li++; }
      } else if(ui<nu-1){ indices.push(uBase+ui, lBase+lIdx, uBase+uNext); ui++; }
      else if(li<nl-1){ indices.push(uBase+ui, lBase+lIdx, lBase+lNextIdx); li++; }
      else break;
    }
    indices.push(uBase+(nu-1), lBase+((bestOffset+nl-1)%nl), uBase+0);
    indices.push(uBase+0, lBase+((bestOffset+nl-1)%nl), lBase+bestOffset);
  }
  // r026(30回目セッション、マスター実機報告「ZIPが4ファイルしか出ない」への対応・
  // 根本原因特定): この関数のClipper呼び出しは全てpftPositiveフィルルールを
  // 使っているが、pftPositiveは入力パスがCCW(符号付き面積が正)である前提のルールで、
  // CW(符号付き面積が負)のパスを渡すと「内部」を一切検出できず、Union/Intersection/
  // Differenceの結果が常に0パスになる。実機のVoldiaが保存する図形の頂点順は
  // (画面のY軸下向き座標系に由来して)CWになっており、これをconsole.log等で
  // 実データそのまま検証したところ、purple∩grayのような明白に重複している矩形同士でも
  // Clipperが0パスを返すことをNode.js上で再現・確認した。同じ(B)機能でも、既に正しい
  // 値を出している_calcExistingStructureOverlapVolume()は、AddPathの直前に必ず
  // 符号付き面積を計算して負なら反転する処理を入れており(このtoClipPath/
  // toClipPathHoleはそれと同じ処理を関数化したもの)、この関数(buildExistingStructure
  // OverlapMesh)だけがその処理を欠いていた。r021の段差面二重計上バグとは完全に別の、
  // より根源的な「メッシュが常に空になる」バグで、r021修正の実機検証がずっとできず
  // (B)がZIPから常に欠落していた直接の原因はこちらだった。
  function toClipPath(pts){
    const raw = pts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
    let sa=0;
    for(let i=0;i<raw.length;i++){ const j=(i+1)%raw.length; sa += raw[i].X*raw[j].Y - raw[j].X*raw[i].Y; }
    if(sa<0) raw.reverse();
    return raw;
  }
  function toClipPathHole(pts){
    const raw = pts.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
    let sa=0;
    for(let i=0;i<raw.length;i++){ const j=(i+1)%raw.length; sa += raw[i].X*raw[j].Y - raw[j].X*raw[i].Y; }
    if(sa>0) raw.reverse(); // 穴は外周と逆巻きにする(_calcExistingStructureOverlapVolumeと同じ規約)
    return raw;
  }
  // r021: emitLayer側での唯一の呼び出し箇所を削除したため、この関数自体は
  // 現在未使用(二重計上バグの原因だった処理)。実機検証が完了して問題なければ
  // 次回セッションで関数ごと削除してよい。念のため今回は残してある。
  function clipperDifference(contoursA, contoursB){
    if(!contoursA.length) return [];
    if(!contoursB.length) return contoursA;
    const cl=new ClipperLib.Clipper();
    contoursA.forEach(item=>cl.AddPath(toClipPath(item.outer), ClipperLib.PolyType.ptSubject, true));
    contoursB.forEach(item=>cl.AddPath(toClipPath(item.outer), ClipperLib.PolyType.ptClip, true));
    const sol=new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctDifference, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }

  // ── 掘削側: 法面込みの実断面(表示用オフセットは含まない)
  function excavContourAtDepth(f, z){
    const topDepth=-(f.tl||0), botDepth=f.D-(f.tl||0);
    if(z<topDepth-1e-6 || z>botDepth+1e-6) return null;
    let offsetDist;
    if(f.noSlope){ offsetDist=f.OD; }
    else {
      const fromTop=z-topDepth, ratio=1.0-fromTop/f.D;
      offsetDist=f.OD+ratio*f.D*getSlopeRatio();
      if(offsetDist<0) offsetDist=0;
    }
    return offsetDist>0 ? clipContourToYamadome(offsetPolygon(f.ptsMm,offsetDist), SF, offsetXmm, offsetYmm)
                         : clipContourToYamadome(f.ptsMm.map(p=>({x:p.x,y:p.y})), SF, offsetXmm, offsetYmm);
  }
  function excavUnionAtDepth(z){
    const cl=new ClipperLib.Clipper(); let added=false;
    excavFrustums.forEach(f=>{
      const c=excavContourAtDepth(f,z);
      if(!c||c.length<3) return;
      cl.AddPath(toClipPath(c), ClipperLib.PolyType.ptSubject, true);
      added=true;
    });
    if(!added) return [];
    const sol=new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }

  // ── 既存躯体側: 描いた形状そのまま(法面・オフセット一切なし)
  function structContourAtDepth(f, z){
    const topDepth=-(f.tl||0), botDepth=f.D-(f.tl||0);
    if(z<topDepth-1e-6 || z>botDepth+1e-6) return null;
    return f.ptsMm.map(p=>({x:p.x,y:p.y}));
  }
  function structUnionAtDepth(z){
    const cl=new ClipperLib.Clipper(); let added=false;
    structFrustums.forEach(f=>{
      const c=structContourAtDepth(f,z);
      if(!c||c.length<3) return;
      cl.AddPath(toClipPath(c), ClipperLib.PolyType.ptSubject, true);
      added=true;
      (f.holesMm||[]).forEach(h=>{
        if(!h||h.length<3) return;
        cl.AddPath(toClipPathHole(h), ClipperLib.PolyType.ptSubject, true);
      });
    });
    if(!added) return [];
    const sol=new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }

  // ── 交差(重複)断面
  function overlapContoursAtDepth(z){
    const ex=excavUnionAtDepth(z), st=structUnionAtDepth(z);
    if(!ex.length || !st.length) return [];
    const cl=new ClipperLib.Clipper();
    ex.forEach(item=>{
      cl.AddPath(toClipPath(item.outer), ClipperLib.PolyType.ptSubject, true);
      item.holes.forEach(h=>cl.AddPath(toClipPathHole(h), ClipperLib.PolyType.ptSubject, true));
    });
    st.forEach(item=>{
      cl.AddPath(toClipPath(item.outer), ClipperLib.PolyType.ptClip, true);
      item.holes.forEach(h=>cl.AddPath(toClipPathHole(h), ClipperLib.PolyType.ptClip, true));
    });
    const sol=new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctIntersection, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    return classifyPaths(sol, SF);
  }
  function overlapAreaAtDepth(z){
    const c=overlapContoursAtDepth(z);
    let a=0;
    c.forEach(item=>{
      a += Math.abs(polySignedArea(item.outer));
      item.holes.forEach(h=>{ a -= Math.abs(polySignedArea(h)); });
    });
    return a;
  }

  // ── ① ブレークポイント収集(掘削・既存躯体それぞれの天端/下端)
  const depthSet=new Set();
  excavFrustums.forEach(f=>{ depthSet.add(-(f.tl||0)); depthSet.add(f.D-(f.tl||0)); });
  structFrustums.forEach(f=>{ depthSet.add(-(f.tl||0)); depthSet.add(f.D-(f.tl||0)); });
  let sortedDepths=[...depthSet].sort((a,b)=>a-b);
  if(sortedDepths.length<2) return null;

  // ── ② 各区間で重複面積の有無(0↔非0)が切り替わっていたら二分探索で境界を追加
  const EPS=1e-3;
  // r028(30回目セッション、マスター実機報告「面分割が崩れる/2-1の形状がおかしい」への
  // 対応・真因特定): マスター提供のAutoCAD正解形状(2609181326_AC_surface.csv)と
  // 実際のGLBをClaudeが数値比較した結果、体積は正しいが特定の三角形2〜3枚だけが
  // 平面から外れて歪んでいた。原因はFINE_STEP_MM=150mm固定刻みの機械的な細分化位置が、
  // 実際に交差輪郭のトポロジー(頂点構成)が変化する深さ(このケースではY=-315mm、
  // 掘削法面が既存躯体の入隅コーナーを実際に横切る瞬間)と一致していなかったこと。
  // 150mm刻みの層[300,450]がこの真の境界(315mm)をまたいでしまい、区間の上端と下端で
  // 頂点数が異なる交差輪郭同士をaddLoftWallが無理やり対応付けようとして、本来1枚の
  // 平面であるべき面に余計な三角形が混入していた。
  // 対策: 面積の有無(ゼロ⇄非ゼロ)の境界と全く同じ要領で、交差輪郭の「頂点構成
  // (輪郭の数×各輪郭の頂点数)」が変化する深さも二分探索で正確に特定し、そこにも
  // 区切り(ブレークポイント)を追加する。これにより、隣接するブレークポイントの間では
  // 交差輪郭のトポロジーが変化しないことが保証されるので、FINE_STEP_MMによる機械的な
  // 追加細分化は不要になった(単一フラスタムのbuildShellMeshと同じ理屈で、区間の
  // 上端・下端をaddLoftWall1回で直結するだけで正確かつトポロジー的にも安全)。
  function contourSignature(z){
    const c=overlapContoursAtDepth(z);
    let rings=0, n=0;
    c.forEach(item=>{ rings++; n+=item.outer.length; item.holes.forEach(h=>{rings++; n+=h.length;}); });
    return rings*10000+n;
  }
  const extraBreaks=[];
  for(let i=0;i<sortedDepths.length-1;i++){
    const zA=sortedDepths[i], zB=sortedDepths[i+1];
    const areaA=overlapAreaAtDepth(zA+EPS);
    const areaB=overlapAreaAtDepth(zB-EPS);
    if((areaA>1e-6) !== (areaB>1e-6)){
      let lo=zA, hi=zB, loHas=areaA>1e-6;
      for(let iter=0; iter<20 && (hi-lo)>1; iter++){
        const mid=(lo+hi)/2;
        const midHas=overlapAreaAtDepth(mid)>1e-6;
        if(midHas===loHas) lo=mid; else hi=mid;
      }
      extraBreaks.push(Math.round(((lo+hi)/2)*100)/100);
      continue; // 面積の有無自体が変わる境界は既に区切り済みなので、頂点構成チェックは不要
    }
    if(areaA<=1e-6) continue; // 区間内で重複自体が無いなら頂点構成の比較も不要
    const sigA=contourSignature(zA+EPS), sigB=contourSignature(zB-EPS);
    if(sigA===sigB) continue;
    let lo=zA, hi=zB, loSig=sigA;
    for(let iter=0; iter<44 && (hi-lo)>0.001; iter++){
      const mid=(lo+hi)/2;
      const midSig=contourSignature(mid);
      if(midSig===loSig) lo=mid; else hi=mid;
    }
    // r031(31回目セッション、マスター実機報告「まだ薄い面/自己交差が残る・法面が
    // 絡むと発生」への対応): 従来はこの区間の中点1点だけをブレークポイントとして
    // 追加していたが、それだと「輪郭の本数が変わる瞬間」の前後1mm幅がまるごと1個の
    // 区間として扱われ、その中で本数不一致(例: 法面オフセットで2つの掘削の輪郭が
    // 合体・分岐する瞬間、1輪郭↔2輪郭)のロフト処理が必要になってしまう。
    // lo(まだ変化前の本数側)とhi(既に変化後の本数側)の両方を境界として追加する
    // ことで、本数が食い違う区間を0.001mm未満の極薄い区間に閉じ込め、下のemitLayer
    // 側で「1:1で相互に一意対応する場合だけロフトし、それ以外(=本数不一致や
    // 分岐・合流中の曖昧な重なり)は無理にロフトせず両側とも蓋を閉じる」方針にする
    // (詳細はemitLayer内のコメント参照)。マスター提供の法面ありデータ
    // (Voldia_260924113736.vold・土量計算モード)で再現し、メッシュ体積とは独立な
    // 深さ方向の数値積分(シンプソン則)による検算とも0.001%未満の誤差で一致することを
    // 確認済み。
    extraBreaks.push(lo, hi);
  }
  extraBreaks.forEach(d=>depthSet.add(d));
  sortedDepths=[...depthSet].sort((a,b)=>a-b);

  // ── ③④⑤ 各ブレークポイント深さの交差輪郭を「1深さにつき1回だけ」評価してキャッシュする
  // r029(30回目セッション、マスター報告のGLB解析で発覚): r028の対策で大きな異常三角形は
  // 解消したが、Claudeが新しいGLBを数値解析したところ、幅0.09mm程度のごく細い異常三角形が
  // 1枚だけ残っていた(トポロジー境界のちょうど深さで、上側区間はzB-EPS、下側区間は
  // zA+EPSと、真の境界を挟んで反対側からそれぞれ評価していたため、輪郭が連続的に
  // 変化する区間ではごくわずかに違う座標になっていた)。対策: 各ブレークポイント深さの
  // 交差輪郭を配列に1回だけキャッシュし、隣り合う区間の「上端の下蓋」と「下端の上蓋」に
  // 同じキャッシュを使い回すことで、境界での座標の食い違いを原理的に無くした。
  // 最上端・最下端(区間の外側、重複の有無がゼロ⇄非ゼロに切り替わる可能性がある端点)だけは
  // 従来通りEPSだけ内側にずらして評価する。
  const layerContours = sortedDepths.map((z,i)=>{
    if(i===0) return overlapContoursAtDepth(z+EPS);
    if(i===sortedDepths.length-1) return overlapContoursAtDepth(z-EPS);
    return overlapContoursAtDepth(z);
  });

  // ── ③ 最上端で既に重複がある場合、上蓋を追加
  // (buildShellMeshと違い(B)は独立した水密ソリッドなので、天面も塞ぐ必要がある)
  const topContours=layerContours[0];
  topContours.forEach(item=>addFace(item.outer, item.holes, sortedDepths[0], false));

  // ── ④ 区間ごとにメッシュ生成
  // r028: 上記のトポロジー境界検出により、隣接ブレークポイント間は交差輪郭が
  // 同じ頂点構成のまま連続的に変形するとわかっているので、addLoftWall1回の直結で
  // 正確につなげる。FINE_STEP_MMによる機械的な追加細分化(r020〜r027)は廃止した。
  // r031(31回目セッション、マスター実機報告「Excel数量が大きく狂う/GLBが閉じて
  // いない/薄い面・自己交差がある」への対応・真因特定): 旧ロジックは区間の上端・
  // 下端で交差輪郭の本数が食い違っていても「本数が同じ」前提で重心最近傍の
  // top↔bot 1:1対応を強制していたため、(1)掘削が複数独立していて片方だけ先に
  // 底に到達するケースで、先に終わった側の輪郭が全く無関係な位置にある輪郭へ
  // 誤ってブリッジ結合され、かつ生き残った側の輪郭が二重に使われて非多様体
  // (重複面)になる、(2)法面(勾配)ありで2つの掘削オフセットが途中の深さで
  // 合体・分岐するケースで、1本の輪郭がその両方に対して丸ごとロフトされ、
  // これも非多様体・自己交差の薄い面になる、という2種類の不具合が起きていた。
  // 対策: 重心最近傍ではなく、Clipperの実交差面積(>0)でtop↔botの候補関係を
  // 判定したうえで、「相互に一意な1:1関係にある組」だけを壁でつなぐ。複数と
  // 重なる(=分岐/合流の最中)輪郭や、相手がいない輪郭は無理につなげず、その
  // 深さで個別に蓋を閉じる。分岐/合流点そのものは、r028の二分探索精度を
  // 1mm→0.001mm(hi側採用・lo/hi両方を境界に追加)に上げたことで極薄い区間に
  // 閉じ込められているため、蓋のみで済ませても体積誤差は実用上無視できるレベルに
  // 収まる(マスター提供の法面ありデータで検証: メッシュ体積とは独立な深さ方向の
  // 数値積分による検算と0.001%未満の誤差で一致・境界エッジ0・非多様体エッジ0)。
  function contoursOverlap(itemA, itemB){
    const cl=new ClipperLib.Clipper();
    cl.AddPath(toClipPath(itemA.outer), ClipperLib.PolyType.ptSubject, true);
    cl.AddPath(toClipPath(itemB.outer), ClipperLib.PolyType.ptClip, true);
    const sol=new ClipperLib.Paths();
    cl.Execute(ClipperLib.ClipType.ctIntersection, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
    if(!sol.length) return false;
    let area=0;
    sol.forEach(p=>{ let a=0; for(let i=0;i<p.length;i++){const j=(i+1)%p.length; a+=p[i].X*p[j].Y-p[j].X*p[i].Y;} area+=Math.abs(a); });
    return area>1e-3; // SF換算後のごく微小な誤差ノイズだけ弾く
  }
  // r032(33回目セッション、「2階建て問題」対応・Aプラン): 点pから多角形poly(境界線)までの最短距離
  function pointToPolyDist(p, poly){
    let best=Infinity;
    for(let i=0;i<poly.length;i++){
      const a=poly[i], b=poly[(i+1)%poly.length];
      const abx=b.x-a.x, aby=b.y-a.y;
      const apx=p.x-a.x, apy=p.y-a.y;
      const lenSq=abx*abx+aby*aby;
      let t = lenSq>1e-12 ? (apx*abx+apy*aby)/lenSq : 0;
      if(t<0) t=0; else if(t>1) t=1;
      const d=Math.hypot(p.x-(a.x+t*abx), p.y-(a.y+t*aby));
      if(d<best) best=d;
    }
    return best;
  }
  // r032(33回目セッション、「2階建て問題」対応・Aプラン、最終版):
  //
  // 【最初の実装(削除済み)が誤っていた理由】
  // 当初は「1個側の輪郭をN個の弧に分割し、各弧をaddLoftWallで"疑似的に閉じたループ"
  // として対応するN個側の輪郭にロフトする(閉じ目はピンチ点同士の小さな橋渡しになる
  // はず)」という設計だった。しかし実際にNode.jsで検証したところ、この「閉じ目」が
  // 全く小さくならないケースが実データに存在し、その閉じ目自体が水平に近い巨大な
  // 面(=新たな偽の「床」)になってしまい、体積(発散定理)まで狂わせるバグを
  // 作り込んでしまった(境界エッジ3・非多様体エッジ1、体積28.9m3 vs 正解33.47m3)。
  //
  // 原因: このデータは円ではなく矩形(掘削1=blue、掘削2=blue、構造物=gray、いずれも
  // 4頂点の長方形)。2つの掘削のオフセット矩形が合体/分岐する瞬間、実際には
  // 「点」でタンジェントになるのではなく「辺の一部」がタンジェントになる(直線同士が
  // 平行に触れる)。このため、合体時に隠れる/分離時に現れる境界は短い"点"ではなく
  // 長さのある"辺"(このデータでは約2.65m)になる。この「隠れた辺」の両端点
  // (crossP・crossQ)は本来top側輪郭(oneOuter)にも存在するはずの点だが、
  // Clipperのcollinear(同一直線上の点)簡略化によって片方が消えてしまっていた
  // ため、「1個の弧が自分自身に閉じる」という単純化が成り立たなかった。
  //
  // 【正しい設計】
  // 1. まずtop側輪郭とbot側輪郭のペア(m0,m1)から、辺同士が逆向き平行かつ位置が
  //    重なる「隠れた共有辺」を探す(findSharedHiddenEdge)。これがcrossP・crossQの
  //    実座標(mm)になる。
  // 2. crossP・crossQをm0・m1それぞれの輪郭に挿入する(既存頂点に十分近ければ
  //    挿入せず流用)。これでm0・m1はそれぞれ「露出している弧(oneOuter側と直結する
  //    部分)」と「隠れた辺(crossP-crossQを結ぶ1辺)」に明確に分かれる。
  // 3. crossP・crossQをoneOuter側にも同様に挿入する(oneOuterの境界のどこかに
  //    必ず乗っているはず。乗っていなければフォールバック)。
  // 4. oneOuterにもcrossP・crossQを挿入し、その2点でoneOuterを単純に2分割する
  //    (最近傍owner判定は使わない。P・Qは元々m0・m1双方の境界からの距離が
  //    ちょうど0になる点なので、「最も近いowner」判定に頼るとタイブレークの
  //    都合で意図しない側に取り込まれてしまうことがある。実データで確認・修正済み)。
  //    どちらの弧がmanyOuters[0]/[1]どちらに対応するかは、各弧の中間点で改めて
  //    最近傍判定する(中間点なら通常タイにならない)。
  // 5. 各弧(開いた鎖)と対応するm_k側の露出部分(開いた鎖)を、addLoftWallのような
  //    「両端を素直に対応させる」ロフト(openChainLoft、始点↔始点・終点↔終点を
  //    強制するのでbestOffset探索や閉じ目の追加は行わない)で直結する。
  //    → 蓋を一切作らず、水平面(BOTTOM/SLOPE誤分類)を生まない。
  // 6. 「隠れた辺」自体は、oneOuter側のcrossP-crossQという2点(zTop、oneOuterの
  //    実際の辺ではなく内部の仮想弦)と、実際の隠れた辺(zBot、2点)をopenChainLoft
  //    で直結する。この壁はxがほぼ一定・y(奥行き方向ではなくもう一方の平面軸)が
  //    変化する形になるため、ほぼ垂直(法線はSLOPE/IGNORE分類になる水平以外の
  //    向き)になり、Excel側で「床」として二重計上されることはない。
  //
  // 【対応範囲】このデータで確認されている「1個↔2個」のケースのみを正確に処理する。
  // 3個以上が絡む複雑なケースは、上記の共有辺検出やowner分割が期待通りにならない
  // 可能性が高いため、安全側フォールバック(従来の両側キャップ)に委ねる
  // (ドキュメント記載の許容範囲どおり)。
  function edgesAntiParallelOverlap(a1,a2,b1,b2,tol){
    const dax=a2.x-a1.x, day=a2.y-a1.y;
    const dbx=b2.x-b1.x, dby=b2.y-b1.y;
    const la=Math.hypot(dax,day), lb=Math.hypot(dbx,dby);
    if(la<1e-6||lb<1e-6) return null;
    const ux=dax/la, uy=day/la;
    const vx=dbx/lb, vy=dby/lb;
    const dot=ux*vx+uy*vy;
    if(dot > -0.995) return null; // ほぼ逆向き平行でなければ対象外
    function distToLine(p){ return Math.abs((p.x-a1.x)*uy - (p.y-a1.y)*ux); }
    if(distToLine(b1)>tol || distToLine(b2)>tol) return null;
    function proj(p){ return (p.x-a1.x)*ux + (p.y-a1.y)*uy; }
    const tb1=proj(b1), tb2=proj(b2);
    const lo=Math.max(0, Math.min(tb1,tb2)), hi=Math.min(la, Math.max(tb1,tb2));
    if(hi-lo < tol) return null; // 重なりがほぼ無い
    return [ {x:a1.x+ux*lo, y:a1.y+uy*lo}, {x:a1.x+ux*hi, y:a1.y+uy*hi} ];
  }
  function findSharedHiddenEdge(polyA, polyB, tol){
    for(let i=0;i<polyA.length;i++){
      const a1=polyA[i], a2=polyA[(i+1)%polyA.length];
      for(let j=0;j<polyB.length;j++){
        const b1=polyB[j], b2=polyB[(j+1)%polyB.length];
        const seg=edgesAntiParallelOverlap(a1,a2,b1,b2,tol);
        if(seg) return seg; // [P,Q]
      }
    }
    return null;
  }
  // pt を poly の境界上に挿入する(既存頂点に十分近ければ挿入せずそのindexを返す)。
  // 戻り値: {poly:新しい頂点配列, index:ptに対応するindex} または null(境界上にない)
  function insertPointOnPoly(poly, pt, tol){
    const n=poly.length;
    for(let i=0;i<n;i++){
      const a=poly[i], b=poly[(i+1)%n];
      if(Math.hypot(pt.x-a.x,pt.y-a.y)<tol) return {poly:poly.slice(), index:i};
      const abx=b.x-a.x, aby=b.y-a.y;
      const lenSq=abx*abx+aby*aby;
      if(lenSq<1e-9) continue;
      let t=((pt.x-a.x)*abx+(pt.y-a.y)*aby)/lenSq;
      if(t<0||t>1) continue;
      const projx=a.x+t*abx, projy=a.y+t*aby;
      if(Math.hypot(pt.x-projx,pt.y-projy)>tol) continue;
      if(Math.hypot(pt.x-b.x,pt.y-b.y)<tol) return {poly:poly.slice(), index:(i+1)%n};
      const newPoly=poly.slice(0,i+1).concat([{x:projx,y:projy}], poly.slice(i+1));
      return {poly:newPoly, index:i+1};
    }
    return null;
  }
  // idxP・idxQ(隠れた辺の両端、poly内で隣接しているはず)を除いた「露出run」を
  // 長い方の経路として取り出す(開いた鎖、idxPまたはidxQのどちらから始まるかは
  // startAtQで指定)
  function exposedRunExcludingEdge(poly, idxP, idxQ, startAtQ){
    const n=poly.length;
    const start = startAtQ ? idxQ : idxP;
    const end = startAtQ ? idxP : idxQ;
    const pts=[];
    let i=start;
    while(true){
      pts.push(poly[i]);
      if(i===end) break;
      i=(i+1)%n;
    }
    return pts;
  }
  function openChainLoft(upperPts, lowerPts, upperDepth, lowerDepth){
    if(!upperPts||!lowerPts) return;
    const nu=upperPts.length, nl=lowerPts.length;
    if(nu<1||nl<1) return;
    const uBase=positions.length/3;
    upperPts.forEach(p=>addVertex(p.x,p.y,upperDepth));
    const lBase=positions.length/3;
    lowerPts.forEach(p=>addVertex(p.x,p.y,lowerDepth));
    if(nu===1 && nl===1) return; // 縮退(実際には発生しない想定)
    let ui=0, li=0;
    const totalSteps=(nu-1)+(nl-1);
    for(let step=0; step<totalSteps; step++){
      if(ui<nu-1 && li<nl-1){
        const uNext=ui+1, lNext=li+1;
        const du=Math.hypot(upperPts[uNext].x-lowerPts[li].x, upperPts[uNext].y-lowerPts[li].y);
        const dl=Math.hypot(upperPts[ui].x-lowerPts[lNext].x, upperPts[ui].y-lowerPts[lNext].y);
        if(du<=dl){ indices.push(uBase+ui, lBase+li, uBase+uNext); ui++; }
        else{ indices.push(uBase+ui, lBase+li, lBase+lNext); li++; }
      } else if(ui<nu-1){ indices.push(uBase+ui, lBase+li, uBase+ui+1); ui++; }
      else if(li<nl-1){ indices.push(uBase+ui, lBase+li, lBase+li+1); li++; }
      else break;
    }
  }
  // manyOuters(ちょうど2個)とoneOuterから、隠れた共有辺を検出してcrossP/crossQを
  // 両側に挿入し、露出弧(oneOuter側2本・many側2本、計4本)と隠れた辺(1本)の
  // 開いた鎖ペアを組み立てる。成功時は{ arcsForOne:[open鎖0,1], arcsForMany:[open鎖0,1],
  //   hiddenOne:[crossP,crossQ], hiddenMany:[P,Q] }を返す。失敗時はnull。
  function buildTwoWaySplit(oneOuter, manyOuters){
    if(manyOuters.length!==2) return null;
    const TOL=5; // mm。実データで観測された0.001〜1mm程度のズレを吸収する
    const seg=findSharedHiddenEdge(manyOuters[0], manyOuters[1], TOL);
    if(!seg) return null;
    const [P,Q]=seg;
    const ins0P=insertPointOnPoly(manyOuters[0], P, TOL); if(!ins0P) return null;
    const ins0Q=insertPointOnPoly(ins0P.poly, Q, TOL); if(!ins0Q) return null;
    const ins1P=insertPointOnPoly(manyOuters[1], P, TOL); if(!ins1P) return null;
    const ins1Q=insertPointOnPoly(ins1P.poly, Q, TOL); if(!ins1Q) return null;
    // ins0Q.poly はins0P挿入後の配列に対する追加挿入なので、Pのindexがずれている
    // 可能性がある(Qがinsert時にPより手前に入った場合+1される)。安全のため
    // 挿入後の配列に対して再度Pの位置を特定し直す。
    function reindex(poly, pt, tol){
      for(let i=0;i<poly.length;i++){ if(Math.hypot(poly[i].x-pt.x,poly[i].y-pt.y)<tol) return i; }
      return -1;
    }
    const idx0P=reindex(ins0Q.poly, P, TOL), idx0Q=reindex(ins0Q.poly, Q, TOL);
    const idx1P=reindex(ins1Q.poly, P, TOL), idx1Q=reindex(ins1Q.poly, Q, TOL);
    if(idx0P<0||idx0Q<0||idx1P<0||idx1Q<0) return null;
    const poly0=ins0Q.poly, poly1=ins1Q.poly;
    // P・Qは m0/m1/oneOuter という3つの別々の輪郭にそれぞれ挿入するため、各輪郭
    // 自身の辺への射影計算(insertPointOnPoly内のt計算)の丸め誤差により、
    // 「同じはずのP」「同じはずのQ」が輪郭ごとにサブミクロン〜0.001mm程度ずれた
    // 別々の浮動小数点値になる。この差はfloat64では無害だが、最終メッシュの
    // 座標がFloat32Array(有効桁数7桁程度)に格納される際、独立に丸められた
    // 近接2値が別々のfloat32値に丸まってしまい、本来1本であるべき辺が別の頂点
    // 扱いになって境界エッジ(水密性エラー)として検出されてしまう不具合があった
    // (実データで確認・修正)。P・Qを使う全ての箇所で厳密に同一の座標(このP・Q
    // オブジェクトそのもの)を使うよう、各輪郭に挿入した箇所を後から上書きする。
    poly0[idx0P]=P; poly0[idx0Q]=Q; poly1[idx1P]=P; poly1[idx1Q]=Q;
    // P・Qがそれぞれの輪郭上で隣接しているか確認(隠れた辺そのもの)
    const n0=poly0.length, n1=poly1.length;
    const adj0PQ=((idx0P+1)%n0===idx0Q), adj0QP=((idx0Q+1)%n0===idx0P);
    const adj1PQ=((idx1P+1)%n1===idx1Q), adj1QP=((idx1Q+1)%n1===idx1P);
    if(!(adj0PQ||adj0QP) || !(adj1PQ||adj1QP)) return null; // 想定外の形状、フォールバック
    // 露出run: 隠れた辺(P→QまたはQ→P)を除いた長い経路
    const exposed0 = adj0PQ ? exposedRunExcludingEdge(poly0, idx0P, idx0Q, true)  // Q→...→P
                             : exposedRunExcludingEdge(poly0, idx0P, idx0Q, false); // P→...→Q
    const exposed1 = adj1PQ ? exposedRunExcludingEdge(poly1, idx1P, idx1Q, true)
                             : exposedRunExcludingEdge(poly1, idx1P, idx1Q, false);
    // exposed0は必ずP,Qのどちらかで始まりもう片方で終わる。exposed1と向きを
    // 揃える(exposed0がQ始まりP終わりなら、exposed1もQ始まりP終わりにする)
    function startsWithQ(run){ return Math.hypot(run[0].x-Q.x, run[0].y-Q.y) < TOL; }
    const e0StartsQ=startsWithQ(exposed0), e1StartsQ=startsWithQ(exposed1);
    const exposed1Aligned = (e0StartsQ===e1StartsQ) ? exposed1 : exposed1.slice().reverse();

    // oneOuter側にもP・Qを挿入する。r032初版はここでsplitContourByOwners
    // (最近傍owner判定)を再利用していたが、P・QはM0/M1双方の境界からの距離が
    // ちょうど0(タイ)になる点であるため、「最も近いowner」判定ではタイブレークの
    // 都合でP・Qのどちらか一方が本来の反対側の弧に取り込まれてしまい、弧の長さが
    // 合わなくなる不具合があった(実データで確認・修正)。P・Qは既に(many側の
    // 共有辺検出から)厳密な座標が分かっているので、owner判定に頼らず、oneOuter
    // 上のP・Qの位置で単純に2分割する(区間の途中にある代表点だけをowner判定して
    // どちらの弧がmanyOuters[0]/[1]どちらに対応するか決める)。
    const insOneP=insertPointOnPoly(oneOuter, P, TOL); if(!insOneP) return null;
    const insOneQ=insertPointOnPoly(insOneP.poly, Q, TOL); if(!insOneQ) return null;
    const oneOuterAug=insOneQ.poly;
    function reindexOne(pt){
      for(let i=0;i<oneOuterAug.length;i++){ if(Math.hypot(oneOuterAug[i].x-pt.x,oneOuterAug[i].y-pt.y)<TOL) return i; }
      return -1;
    }
    const idxOneP=reindexOne(P), idxOneQ=reindexOne(Q);
    if(idxOneP<0||idxOneQ<0||idxOneP===idxOneQ) return null;
    oneOuterAug[idxOneP]=P; oneOuterAug[idxOneQ]=Q; // 上と同じ理由でoneOuter側も厳密に同一座標へ上書き
    function pathForward(from,to){
      const n=oneOuterAug.length; const pts=[]; let i=from;
      while(true){ pts.push(oneOuterAug[i]); if(i===to) break; i=(i+1)%n; }
      return pts;
    }
    const pathQtoP=pathForward(idxOneQ, idxOneP); // Q→...→P
    const pathPtoQ=pathForward(idxOneP, idxOneQ); // P→...→Q
    if(pathQtoP.length<2 || pathPtoQ.length<2) return null; // どちらかが縮退(P,Qが隣接=弧が無い)
    // 代表点(各経路の中間点)がmanyOuters[0]/[1]のどちらに近いかでどちらの弧か判定
    function ownerOfPath(path){
      const mid=path[Math.floor(path.length/2)];
      const d0=pointToPolyDist(mid, manyOuters[0]), d1=pointToPolyDist(mid, manyOuters[1]);
      return d0<=d1 ? 0 : 1;
    }
    const ownerQtoP=ownerOfPath(pathQtoP), ownerPtoQ=ownerOfPath(pathPtoQ);
    if(ownerQtoP===ownerPtoQ) return null; // 2つの経路が同じowner側と判定=想定外
    // arc0はmanyOuters[0](=exposed0)に対応する弧、arc1はmanyOuters[1]に対応する弧。
    // 各経路はQ始まりまたはP始まりなので、対応するexposed側の始点(Q始まりかP始まりか)
    // に揃える。
    const pathByOwner=[ownerQtoP===0?pathQtoP:pathPtoQ, ownerQtoP===0?pathPtoQ:pathQtoP];
    function alignArcToExposed(arc, exposedRun){
      const arcStartsQ = Math.hypot(arc[0].x-Q.x, arc[0].y-Q.y) < TOL;
      const expStartsQ = startsWithQ(exposedRun);
      return (arcStartsQ===expStartsQ) ? arc : arc.slice().reverse();
    }
    const arc0=alignArcToExposed(pathByOwner[0], exposed0);
    const arc1=alignArcToExposed(pathByOwner[1], exposed1Aligned);
    if(!arc0||!arc1) return null;
    return {
      arcsForOne:[arc0, arc1],
      arcsForMany:[exposed0, exposed1Aligned],
      hiddenOne: e0StartsQ ? [Q,P] : [P,Q],
      hiddenMany: e0StartsQ ? [Q,P] : [P,Q],
      // r032追記: oneOuter・m0・m1それぞれのcrossP/crossQ挿入後の「フル」頂点配列。
      // 呼び出し側が、層境界を跨いで共有されているlayerContoursの実体(.outer)を
      // これで上書きするために使う(下記の事前パス参照)。
      oneOuterAug, manyAug:[poly0, poly1],
    };
  }
  // r032(33回目セッション、「2階建て問題」対応・Aプラン): 従来はtopMatchCount===1
  // かつbotMatchCount===1の「完全な1:1」だけをaddLoftWallで直結し、それ以外の
  // N:M不一致は問答無用で両側とも蓋(addFace)を閉じていた。しかし31回目セッションで
  // confinement区間(トポロジー変化点)を0.001mm未満に極薄化した結果、この
  // 「両側に蓋」自体が、水平投影面積を持つ余計な「床」ペアとしてExcel/PDFに
  // 二重・三重計上される直接原因になっていた(発散定理ベースの3D体積計算では
  // 上向き/下向きの蓋が符号で相殺されるため見えない。verify_like_excel.js参照。
  // 32回目セッションではこの検証方法の誤りに気づけず「直った」と誤診断した)。
  // 対策: overlapMat(top×botの重なり有無)を辺とする二部グラフの連結成分ごとに
  // 処理する方式に変更する。
  //   ・成分が「top1個・bot1個」→ 従来通りaddLoftWallで直結(蓋なし)
  //   ・成分が「top1個・bot2個」または「top2個・bot1個」→ buildTwoWaySplitで
  //     露出弧同士をopenChainLoftで直結し、隠れた辺(内部の仮想的な分離壁)も
  //     openChainLoftで直結する(蓋を一切作らない)
  //   ・それ以外(3個以上絡む複雑なケース、buildTwoWaySplitが失敗するケース)は、
  //     安全側フォールバックとして従来の「両側に蓋」を維持する(体積(発散定理)は
  //     破綻しないため安全。ただしExcel数量の過大計上リスクは残るため警告ログを
  //     出す。今回の再現データでは発生しない)
  function emitLayer(zTop, zBot, topContours, botContours){
    const hasTop=topContours.length>0, hasBot=botContours.length>0;
    if(!hasTop && !hasBot) return;
    const nT=topContours.length, nB=botContours.length;
    const overlapMat = topContours.map(t=>botContours.map(b=>contoursOverlap(t,b)));

    const parent=[];
    for(let i=0;i<nT+nB;i++) parent.push(i);
    function find(x){ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
    function union(a,b){ const ra=find(a), rb=find(b); if(ra!==rb) parent[ra]=rb; }
    for(let i=0;i<nT;i++) for(let j=0;j<nB;j++) if(overlapMat[i][j]) union(i, nT+j);

    const compMap=new Map(); // root -> {tops:[i...], bots:[j...]}
    for(let i=0;i<nT;i++){ const r=find(i); if(!compMap.has(r)) compMap.set(r,{tops:[],bots:[]}); compMap.get(r).tops.push(i); }
    for(let j=0;j<nB;j++){ const r=find(nT+j); if(!compMap.has(r)) compMap.set(r,{tops:[],bots:[]}); compMap.get(r).bots.push(j); }

    const topUsed=new Array(nT).fill(false), botUsed=new Array(nB).fill(false);

    compMap.forEach(comp=>{
      const {tops, bots}=comp;
      if(tops.length===1 && bots.length===1){
        addLoftWall(topContours[tops[0]].outer, botContours[bots[0]].outer, zTop, zBot);
        topUsed[tops[0]]=true; botUsed[bots[0]]=true;
        return;
      }
      if(tops.length===1 && bots.length===2){
        const oneOuter=topContours[tops[0]].outer;
        const manyOuters=[botContours[bots[0]].outer, botContours[bots[1]].outer];
        const split=buildTwoWaySplit(oneOuter, manyOuters);
        if(split){
          openChainLoft(split.arcsForOne[0], split.arcsForMany[0], zTop, zBot);
          openChainLoft(split.arcsForOne[1], split.arcsForMany[1], zTop, zBot);
          // r032: 「隠れた辺」(crossP-crossQ)自体をここで別途ロフトする壁は
          // 不要(むしろ有害)だった。理由: このzBotの2つのbot輪郭(m0・m1)は
          // 事前パスでcrossP/crossQを挿入済みのため、次の層(このzBotをtopとして
          // 使う下段のaddLoftWall)がm0・m1それぞれの完全な閉ループを下向きに
          // ロフトする際、m0側・m1側の両方が「自分自身の一部として」この
          // crossP-crossQ辺を作る(m0とm1はこの辺で隣接している別々の実体なので、
          // それぞれが独立してこの辺を1回ずつ計上する)。この2回で既にちょうど
          // 水密(edge multiplicity=2)になっており、ここでさらに3本目の橋渡し面を
          // 追加すると非多様体(3重使用)になってしまう(実データで確認・修正)。
          topUsed[tops[0]]=true; botUsed[bots[0]]=true; botUsed[bots[1]]=true;
          return;
        }
        console.warn('[既存躯体重複メッシュ] 1→2分岐の構築に失敗、両側キャップにフォールバック');
      } else if(bots.length===1 && tops.length===2){
        const oneOuter=botContours[bots[0]].outer;
        const manyOuters=[topContours[tops[0]].outer, topContours[tops[1]].outer];
        const split=buildTwoWaySplit(oneOuter, manyOuters);
        if(split){
          openChainLoft(split.arcsForMany[0], split.arcsForOne[0], zTop, zBot);
          openChainLoft(split.arcsForMany[1], split.arcsForOne[1], zTop, zBot);
          // r032: 上と対称の理由で、ここも「隠れた辺」の橋渡し面は追加しない
          // (このzTopの2つのtop輪郭自身が、それぞれ上の層への接続で
          // crossP-crossQ辺を1回ずつ計上し、合計2回で水密になる)。
          topUsed[tops[0]]=true; topUsed[tops[1]]=true; botUsed[bots[0]]=true;
          return;
        }
        console.warn('[既存躯体重複メッシュ] 2→1合流の構築に失敗、両側キャップにフォールバック');
      } else if(tops.length>1 && bots.length>1){
        console.warn('[既存躯体重複メッシュ] N:M(N>1,M>1)の複雑な合流/分岐、両側キャップにフォールバック(top×'+tops.length+', bot×'+bots.length+')');
      } else if(tops.length===1 && bots.length>2){
        console.warn('[既存躯体重複メッシュ] 1→'+bots.length+'(3個以上)の分岐、両側キャップにフォールバック');
      } else if(bots.length===1 && tops.length>2){
        console.warn('[既存躯体重複メッシュ] '+tops.length+'→1(3個以上)の合流、両側キャップにフォールバック');
      }
      // フォールバック: ここに来たtops/botsは未使用のまま残し、ループ後の
      // 「未使用分は蓋」処理(従来の挙動)に委ねる
    });

    topContours.forEach((item,i)=>{ if(!topUsed[i]) addFace(item.outer, item.holes, zTop, true); });
    botContours.forEach((item,j)=>{ if(!botUsed[j]) addFace(item.outer, item.holes, zBot, false); });
  }
  // r032(33回目セッション、「2階建て問題」対応・Aプラン、事前パス):
  // layerContours[i]は「層iの下蓋」と「層i+1の上蓋」の両方から共有参照される
  // オブジェクトである(r029のキャッシュ設計)。1↔2分岐/合流が絡む層をemitLayer
  // (メインループ)の中でその場処理すると、crossP/crossQの挿入がその場限りの
  // ローカル配列に留まり、「隣の単純な1:1区間」がまだ未augmented(挿入前)の
  // 輪郭を使ってしまう。その結果、本来1本であるべき辺が「未挿入側の直接の1本」と
  // 「挿入後側の2本に分かれた辺」という食い違う形になり、境界エッジ・非多様体エッジ
  // が発生することをNode.jsで確認した(実データで再現・修正)。
  // 対策: メインループの前に全層を一度スキャンし、1↔2分岐/合流が見つかった時点で
  // buildTwoWaySplitを呼び、成功したらcrossP/crossQ挿入後の頂点配列で
  // layerContours内の実体(.outer)を直接書き換えておく。これにより、隣接する
  // 単純な1:1区間のaddLoftWallも、メインループ側のbuildTwoWaySplit呼び出しも、
  // 常に同じ(挿入済みの)頂点配列を参照することになり、辺が正しく2回ずつ使われる
  // (水密になる)。
  for(let i=0;i<sortedDepths.length-1;i++){
    const topC=layerContours[i], botC=layerContours[i+1];
    if(topC.length===1 && botC.length===2){
      if(contoursOverlap(topC[0], botC[0]) && contoursOverlap(topC[0], botC[1])){
        const split=buildTwoWaySplit(topC[0].outer, [botC[0].outer, botC[1].outer]);
        if(split){ topC[0].outer=split.oneOuterAug; botC[0].outer=split.manyAug[0]; botC[1].outer=split.manyAug[1]; }
      }
    } else if(topC.length===2 && botC.length===1){
      if(contoursOverlap(topC[0], botC[0]) && contoursOverlap(topC[1], botC[0])){
        const split=buildTwoWaySplit(botC[0].outer, [topC[0].outer, topC[1].outer]);
        if(split){ botC[0].outer=split.oneOuterAug; topC[0].outer=split.manyAug[0]; topC[1].outer=split.manyAug[1]; }
      }
    }
  }
  for(let i=0;i<sortedDepths.length-1;i++){
    emitLayer(sortedDepths[i], sortedDepths[i+1], layerContours[i], layerContours[i+1]);
  }

  // ── ⑤ 最深端で重複が残っている場合、下蓋を追加(③と対称のエッジケース)
  const lastZ=sortedDepths[sortedDepths.length-1];
  const bottomContours=layerContours[layerContours.length-1];
  bottomContours.forEach(item=>addFace(item.outer, item.holes, lastZ, true));

  if(!positions.length) return null;

  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions),3));
  geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
  geom.computeVertexNormals();
  return geom;
}

// 【診断用・段階1検証後に撤去】メッシュの符号付き体積を発散定理で算出(mm³→m³)
function _diagMeshVolume(geom){
  if(!geom) return 0;
  const pos = geom.attributes.position.array;
  const idx = geom.index.array;
  let vol = 0;
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3, b=idx[i+1]*3, c=idx[i+2]*3;
    const ax=pos[a],ay=pos[a+1],az=pos[a+2];
    const bx=pos[b],by=pos[b+1],bz=pos[b+2];
    const cx=pos[c],cy=pos[c+1],cz=pos[c+2];
    vol += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
  }
  return Math.abs(vol) / 1e9;
}

// ────────────────────────────────────────────────────────────────
//  図形 → フラスタム変換
// ────────────────────────────────────────────────────────────────
function getJSTDateStr(){
  const d=new Date();
  const jst=new Date(d.getTime()+9*60*60*1000);
  return jst.toISOString().slice(0,10);
}
function getJSTTimestamp(){
  const d=new Date();
  const jst=new Date(d.getTime()+9*60*60*1000);
  return jst.toISOString().slice(0,19).replace(/[-:T]/g,'');
}
// r072マスター指定の命名規則(YYMMDDHHMMSS・12桁)用。Vold/DXF/データ出力の
// ファイル名をこれで統一する(getJSTTimestamp()は年4桁のため用途が別)。
function getVoldiaTimestamp(){
  const d=new Date();
  const jst=new Date(d.getTime()+9*60*60*1000);
  const s=jst.toISOString(); // "YYYY-MM-DDTHH:MM:SS.sssZ"
  return s.slice(2,4)+s.slice(5,7)+s.slice(8,10)+s.slice(11,13)+s.slice(14,16)+s.slice(17,19);
}
// r025(30回目セッション、マスター指摘対応): ZIP内の各ファイルの更新日時(JSZipが
// エクスプローラー等に表示する内部タイムスタンプ)が、フォルダ名(=getVoldiaTimestamp()の
// JST時刻)より9時間ズレる不具合の修正用。原因: JSZipはzip.file()の第3引数{date:...}を
// 省略するとnew Date()を渡した扱いになり、そのDateオブジェクトのローカルgetter
// (getFullYear/getHours等)でZIP内部の日時を作る。getVoldiaTimestamp()は
// 「d.getTime()+9時間」したDateをtoISOString()(常にUTC表記)で読むトリックなので
// ホストのシステムタイムゾーン設定に関係なく常に正しいJST文字列になるが、
// これをそのままzip.file()のdateオプションに渡すと、ホストのシステムタイムゾーンが
// 本当にJSTだった場合に「+9時間のトリック」と「ローカルgetterによる本来のJST変換」が
// 二重に効いてしまい、逆にズレる。今回の実機ではズレが「-9時間」（UTC時刻がそのまま
// 出ていた）だったので、このホストのシステムタイムゾーンはJSTではなくUTC設定だったと
// 判明した。d.getTimezoneOffset()（UTCとの差を分単位で返す。UTCなら0、JSTなら-540）を
// 使えば、ホストの実際のタイムゾーン設定が何であっても「ローカルgetterで読むと
// 必ずJST時刻になる」Dateオブジェクトを作れるので、それをこの関数で提供し、
// ZIP出力側(voldia_export.js)のzip.file()全箇所でdateオプションとして使うようにする。
function getVoldiaZipDate(){
  const d=new Date();
  return new Date(d.getTime()+9*60*60*1000+d.getTimezoneOffset()*60*1000);
}
function getConcThick(){
  const v = parseFloat(document.getElementById('conc-thick')?.value);
  return isNaN(v) ? 110 : v;
}
function getOuter(sh){ return sh.outer || sh.pts || []; }
// 図形から穴のリストを取り出す
function getHoles(sh){ return sh.holes || []; }

function calcAreaPts(pts){
  if(!pts||pts.length<3) return 0;
  let a=0; const n=pts.length;
  for(let i=0;i<n;i++){const j=(i+1)%n; a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}
  a=Math.abs(a)/2;
  return (a/(RS*RS) * Math.pow((25.4/72)*scaleDenom, 2)) / 1e6;
}



// r010: 自己交差の事前検出。offsetPolygon()は各頂点を局所的な二等分線方向へ
// ずらすだけでグローバルな自己交差解消は行わないため、複雑な凹形状では
// オフセット後リングが自己交差しうる。判定はClipperLibのSimplifyPolygon
// (Vatti法)に委ね、単純化前後で面積・輪郭数が変化したら自己交差ありとみなす。
function _ringSelfIntersects(ptsMm, SF){
  SF = SF || 1000;
  if(!ptsMm || ptsMm.length < 3) return false;
  const path = ptsMm.map(p=>({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
  let a0 = 0;
  for(let i=0;i<path.length;i++){
    const j=(i+1)%path.length;
    a0 += path[i].X*path[j].Y - path[j].X*path[i].Y;
  }
  const origArea = Math.abs(a0)/2;
  if(origArea < SF*SF*0.5) return false; // 1mm²未満の縮退形状は対象外（別途の面積0チェックに任せる）

  let simplified;
  try{
    simplified = ClipperLib.Clipper.SimplifyPolygon(path, ClipperLib.PolyFillType.pftNonZero);
  }catch(e){
    return false; // 判定不能時は誤検知(見た目には正常な図形が赤くなる)より見逃しを優先
  }
  if(!simplified || simplified.length !== 1) return true; // 単純化で複数ポリゴンに分裂＝自己交差
  let a1 = 0;
  const p2 = simplified[0];
  for(let i=0;i<p2.length;i++){
    const j=(i+1)%p2.length;
    a1 += p2[i].X*p2[j].Y - p2[j].X*p2[i].Y;
  }
  const simpArea = Math.abs(a1)/2;
  return Math.abs(simpArea - origArea) / origArea > 0.001; // 単純化で面積が0.1%超変化＝自己交差ループを切除した
}

// 図形1つ分（外周＋各穴）について、生の輪郭と「実際に計算で使われる
// 最大オフセット距離まで膨張させた輪郭」の両方を自己交差判定する。
// 最大オフセットで判定するのは、offsetPolygon()の局所二等分線方式は
// オフセット距離が大きいほど交差が発生・拡大しやすいため（最も条件が
// 厳しいケースを見ておけば、それより浅い深さは安全という考え方）。
function _shapeSelfIntersects(ptsMm, holesMm, o, D, noSlope){
  const maxOD = noSlope ? o : (o + D * getSlopeRatio());
  if(_ringSelfIntersects(ptsMm)) return true;
  if(maxOD > 0){
    const offsetOuter = offsetPolygon(ptsMm, maxOD);
    if(_ringSelfIntersects(offsetOuter)) return true;
  }
  for(const h of (holesMm||[])){
    if(_ringSelfIntersects(h)) return true;
    if(maxOD > 0){
      const offsetHole = offsetPolygon(h, maxOD, true);
      if(_ringSelfIntersects(offsetHole)) return true;
    }
  }
  return false;
}

function shapeToFrustum(sh){
  const outer = getOuter(sh);
  if(!outer || outer.length < 3) return null;
  
  if(sh.depthBeam==='' || sh.overdig==='') return null;
  const b = parseFloat(sh.depthBeam); // 符号付き（正=GL上、負=GL下）
  const o = parseFloat(sh.overdig);
  if(isNaN(b) || isNaN(o) || o < 0) return null;
  
  const c = ( v => isNaN(v) ? 110 : v)(parseFloat(document.getElementById('conc-thick').value));
  const tl = parseFloat(sh.topLevel)||0;
  // D = 天端(tl) - 下端(b) + 捨コン(c)
  // 例: tl=0, b=-1800 → D = 0-(-1800)+110 = 1910mm
  // 例: tl=+500, b=-500 → D = 500-(-500)+110 = 1110mm
  // 例: tl=+5000, b=+4000 → D = 5000-4000+110 = 1110mm（GL上のみ・根切は出てこない）
  const D = tl - b + c;
  if(D <= 0) return null; // 天端が下端以下 → 体積なし（根切不要）

  // r010(VoldiaM側の修正③移植): 保存済みの確定mm座標(sh.ptsMm/sh.holesMm)が
  // あれば最優先で使う。無ければ現在のスケールでpxから都度変換する。
  // ※現時点のVoldiaはsh.ptsMm/sh.holesMmを書き込む箇所がまだ無いため、
  // この分岐は今のところ常にfalseで実効は出ない（保存/読込コードの対応は
  // 別途要検討・今回未着手）。VoldiaMとロジックを揃えておくための移植。
  const holesPx = getHoles(sh);
  const ptsMm = (sh.ptsMm && sh.ptsMm.length === outer.length)
    ? sh.ptsMm.map(p => ({ x: p.x, y: p.y }))
    : outer.map(p => ({ x: pxToMm(p.x), y: pxToMm(p.y) }));
  const holesMm = (sh.holesMm && sh.holesMm.length === holesPx.length)
    ? sh.holesMm.map(h => h.map(p => ({ x: p.x, y: p.y })))
    : holesPx.map(h => h.map(p => ({ x: pxToMm(p.x), y: pxToMm(p.y) })));

  // r013: 自己交差の事前検出（第一段：生の外周のみ）。
  // ここではsh.noSlope/sh.overdigの「保存された値」しか見えないが、実際の
  // 計算モード別上書き(mode==='doboku'ならnoSlope強制false・OD=globalOD等、
  // runCalc内で後から適用される)を知らないため、オフセット後の判定はここでは
  // 行わない。生の外周が自己交差している場合はモードに関係なく常に無効なので、
  // それだけはここで即座に弾く。オフセット込みの本判定はruncalc内で計算モード
  // 別の最終OD/D/noSlopeが確定した後に行う。
  if(_ringSelfIntersects(ptsMm)){
    sh._voldiaGeoError = true;
    return null;
  }
  if(sh._voldiaGeoError) sh._voldiaGeoError = false; // 修正されていれば赤表示を解除

  return {
    ptsMm, 
    holesMm, 
    D: D,
    tl: tl,
    OD: o, 
    noSlope: sh.noSlope, 
    area: sh.area,
    color: sh.color || 'blue',
    x1: Math.min(...ptsMm.map(p => p.x)) - o,
    y1: Math.min(...ptsMm.map(p => p.y)) - o,
    x2: Math.max(...ptsMm.map(p => p.x)) + o,
    y2: Math.max(...ptsMm.map(p => p.y)) + o,
  };
}

function getAllFrustums(){
  const raw=shapes.map((sh,idx)=>{const f=shapeToFrustum(sh);if(f)f.srcIdx=idx;return f;}).filter(Boolean);
  if(!raw.length)return [];
  const minX=Math.min(...raw.map(f=>f.x1));
  const minY=Math.min(...raw.map(f=>f.y1));
  const result=raw.map(f=>({...f,
    x1:f.x1-minX,x2:f.x2-minX,y1:f.y1-minY,y2:f.y2-minY,
    ptsMm:f.ptsMm.map(p=>({x:p.x-minX,y:p.y-minY})),
    holesMm:(f.holesMm||[]).map(h=>h.map(p=>({x:p.x-minX,y:p.y-minY}))),
  }));
  // r034: 地形メッシュはここで(minX,minY)だけ原点方向にシフトされた「ローカル座標」で
  // 作られている。測点フラグなど、絶対mm座標(pxToMm)で計算した別の値をこの地形と
  // 突き合わせるには、同じだけシフトしてやる必要がある。呼び出し元がその差分を
  // 参照できるよう、戻り値の配列にオフセット値を生やしておく。
  result._offsetX=minX;
  result._offsetY=minY;
  return result;
}
function mm3ToM3(v){return v/1e9;}

// 解析的単独体積（錐台公式）
function singleFrustumVolumeMm3(f){
  // 底面ポリゴン面積（余掘り込み）
  const bpts = offsetPolygon(f.ptsMm, f.OD);
  let Ab=0;const nb=bpts.length;
  for(let i=0;i<nb;i++){const j=(i+1)%nb;Ab+=bpts[i].x*bpts[j].y-bpts[j].x*bpts[i].y;}
  Ab=Math.abs(Ab)/2;
  if(f.noSlope) return Ab * f.D;
  // 法面あり: 上面
  const tpts = offsetPolygon(f.ptsMm, f.OD+f.D*getSlopeRatio());
  let At=0;const nt=tpts.length;
  for(let i=0;i<nt;i++){const j=(i+1)%nt;At+=tpts[i].x*tpts[j].y-tpts[j].x*tpts[i].y;}
  At=Math.abs(At)/2;
  // プリズマトイド公式: V = h/6 * (Ab + At + 4*Am)
  // 中間面 = OD+D/2 でオフセット
  const mpts = offsetPolygon(f.ptsMm, f.OD+f.D*getSlopeRatio()/2);
  let Am=0;const nm=mpts.length;
  for(let i=0;i<nm;i++){const j=(i+1)%nm;Am+=mpts[i].x*mpts[j].y-mpts[j].x*mpts[i].y;}
  Am=Math.abs(Am)/2;
  return (f.D/6)*(Ab+At+4*Am);
}

function showCalcModal(){
  console.log("showCalcModal 実行開始");
  const modal = document.getElementById('calc-modal');
  if(!modal) {
    console.error("致命的エラー: HTML内に 'calc-modal' が見つかりません");
    return;
  }

  // 1. CSSクラスだけでなくstyleも直接指定して表示
  modal.style.display = 'flex'; 
  // ほんの一瞬待ってから opacity を変えないと、アニメーションが効かないの
  setTimeout(() => {
    modal.classList.add('show');
    console.log("モーダル表示クラス '.show' を追加しました");
  }, 10);

  // バージョン表示
  (()=>{
    let vEl=document.getElementById('voldia3d-ver');
    if(!vEl){
      vEl=document.createElement('div');
      vEl.id='voldia3d-ver';
      vEl.style.cssText='position:absolute;top:6px;right:48px;font-size:10px;color:#666;z-index:10;pointer-events:none;';
      modal.appendChild(vEl);
    }
    vEl.textContent=typeof VOLDIA3D_VER!=='undefined'?VOLDIA3D_VER:'?';
  })();

  // 2. UI表示の初期化
  document.getElementById('res-box').classList.remove('show');
  document.getElementById('rect-table-wrap').style.display='none';
  document.getElementById('btn-glb').classList.remove('show');
  const _bp=document.getElementById('btn-placement');if(_bp)_bp.classList.remove('show');
  window._lastCalcModeForPlacement=null;
  const _ba0=document.getElementById('btn-analyze-structure');if(_ba0)_ba0.classList.remove('show');
  const _be0=document.getElementById('btn-analyze-earthwork');if(_be0)_be0.classList.remove('show');
  ['btn-calc-run','btn-calc-doboku'].forEach(id=>{
    const b=document.getElementById(id);if(b){b.disabled=false;b.textContent=id==='btn-calc-doboku'?'⚡ 土量計算':'⚡ 通常計算';}
  });
  
  _lastGeoms = null;
  _lastExistingStructGeoms = [];
  resetCalcToSelect();
  _hideCalcProgress(); // r072: モーダルを開き直す際、前回の計算中表示が残っていれば消す

  console.log("3Dプレビュー準備開始...");
  setTimeout(() => {
    try {
      // v0.0013: resetCalcToSelect()内でinitThree_preview()が呼ばれるので重複しない
      console.log("3Dプレビュー準備完了");
    } catch(e) {
      console.error("3Dプレビュー中にエラーが発生しました:", e);
    }
  }, 150);
}

function closeCalcModal(){
  document.getElementById('calc-modal').classList.remove('show');
  disposeThree();
  // r089(24回目・追加修正・項目8): 3Dイメージ→Voldia本体へ戻る際も全ツールキャンセル
  if(typeof cancelAllTools==='function') cancelAllTools();
}

let _lastGeoms=null; // 計算済み水密ジオメトリ（GLB出力用）
// 26回目セッション新規: 既存躯体(グレー)の「描いた形状そのまま」ジオメトリ。
// _lastGeomsとは別枠で保持し、GLB出力時に専用ノード(Voldia_ExistingStructure)
// として分離出力する(r051のVoldia_FixedObjects分離と同じ理由・同じ扱い)。
let _lastExistingStructGeoms=[];
let _meshMaterials=[]; // 透過スライダー制御用マテリアル参照（現在アクティブなもの＝グラデ時はPhong/ソリッド時はBasic）
let _meshObjs=[]; // r038: ソリッド⇔グラデ切替時にマテリアルを丸ごと差し替えるためのメッシュ本体参照
let _edgeMaterials=[]; // r038: 透過スライダー連動でエッジ輝度を上げるための参照 [navyEdges用, navyEdgesThick用]
const _EDGE_BASE_RGB=[0x0a,0x1a,0x3a]; // エッジのベース色（ディープネイビー）

// 新8(2026-08-24 引継ぎ19回目): 「図形別(単独体積)」パネルの開閉トグル。デフォルト畳み。
function toggleRectTable(){
  const body=document.getElementById('rect-table-body');
  const arrow=document.getElementById('rect-table-arrow');
  const open = body.style.display==='none';
  body.style.display = open ? '' : 'none';
  arrow.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
}
// 新4(2026-08-24 引継ぎ19回目→v0091/r081でマスター指摘により入力仕様を修正):
// 現況地盤GLオフセット入力の検証。旧仕様は「+/-どちらも入力必須」だったが、
// 正しくは「+の入力は不要(未入力=正として扱う)・-は入力必須」。
// パース後は表示側で常に符号(+/-)を補って見せる(0は"+0"表示)。
// ★2026-08-25引継ぎ17回目でマスター仕様確定・実装済み: 土量計算モード
// (mode==='doboku')時のみ、fsの各frustumのD(深さ)に本値をそのまま加算する
// (calcAll()内、天端0正規化の直後)。通常計算・配置モードへの反映は別途相談(次の段階)。
window._glOffsetMm = 0;
function onGlOffsetChange(){
  const el = document.getElementById('gl-offset-mm');
  const v = el.value.trim();
  if(v===''){
    window._glOffsetMm = 0;
    el.value = '+0';
    return;
  }
  if(!/^[+-]?\d+$/.test(v)){
    toast('⚠️ GLオフセットは数値で入力してください（例: 200 / -200）');
    el.value = (window._glOffsetMm>=0?'+':'')+window._glOffsetMm;
    return;
  }
  const parsed = parseInt(v, 10);
  // r091(24回目・追加チェック項目2): 描画済みオブジェクトの下端の最小値より低い
  // GLオフセットは、どのオブジェクトとも交わらない位置に「現状地盤」を置くことに
  // なり物理的に無意味なため、入力を弾く。
  // 新11(2026-08-28 引継ぎ18回目マスター指示): 旧実装は上限をsh.topLevel(天端)の
  // 最大値から計算していたが、topLevelは未設定オブジェクトでは0にフォールバックする
  // フィールドであり、大量のオブジェクトの中に1つでも天端未設定/想定外の値がある
  // 場合に上限が実態とズレ、正当な入力値まで断続的に弾かれる不具合の原因になって
  // いた(1300オブジェクト規模のテストデータで発覚)。マスター指示により、上限は
  // オブジェクトの天端値に依存しない固定値(65535mm)に変更し、下限のみオブジェクト
  // 実データ(最低下端)から算出する。GLが高すぎてオブジェクトが土に埋まるケースは
  // 許容する(描いた側の責任とする)。
  const GL_OFFSET_MAX_MM = 65535;
  const enabledShapes = (typeof shapes!=='undefined' ? shapes : []).filter(sh=>sh.enabled!==false);
  if(enabledShapes.length){
    const bottoms = enabledShapes.map(sh=>parseFloat(sh.depthBeam)).filter(n=>!isNaN(n));
    const minBottom = bottoms.length ? Math.min(...bottoms) : -GL_OFFSET_MAX_MM;
    if(parsed > GL_OFFSET_MAX_MM || parsed < minBottom){
      toast(`⚠️ GLオフセットは ${minBottom}〜${GL_OFFSET_MAX_MM}mm の範囲で入力してください（下限は描画済みオブジェクトの下端最小値）`);
      el.value = (window._glOffsetMm>=0?'+':'')+window._glOffsetMm;
      return;
    }
  }
  window._glOffsetMm = parsed;
  el.value = (window._glOffsetMm>=0?'+':'')+window._glOffsetMm; // 常に符号を表示
}
function updMeshOpacity(val){
  const op=parseInt(val)/100;
  // r053: r052でdepthWrite:falseを常時適用したところ、不透明(100%)表示時にも
  // 同一メッシュ内の三角形描画順序次第で内部の面(底面/側面)が天端より後に
  // 描画されて「上書き」され、天端(蓋)が消えて見える回帰が発生した(問題4)。
  // 不透明に近い時(op>=0.99)はdepthWrite:trueに戻して正しい隠面消去を行い、
  // 透過度を上げた時(op<0.99)のみdepthWrite:falseにして奥を見えるようにする。
  const wantDepthWrite = op >= 0.99;
  // r045→6D改修(2026-08-28 引継ぎ18回目): 元はindex1固定決め打ちだったが、
  // 6DでpurpleWallMeshが加わり_meshMaterials/_meshObjsが3要素になり得るため、
  // 対応する_meshObjsがハッチテクスチャを持つか(userData.hatchMap)で汎用判定する。
  // ハッチ系メッシュ(山留/紫壁面)は「デフォルトで半透明(透過値-10くらい)」の
  // 要望に応じ、常にcyan側より10ポイント低いopacityを保つ。
  _meshMaterials.forEach((m,i)=>{
    const isHatch = !!(_meshObjs[i] && _meshObjs[i].userData && _meshObjs[i].userData.hatchMap);
    const opForThis = isHatch ? Math.max(0, op-0.1) : op;
    m.opacity=opForThis;
    if(m.depthWrite !== wantDepthWrite){ m.depthWrite = wantDepthWrite; }
    m.needsUpdate=true;
  });
  // r038 要望④→r025再修正: 面が透明になるほどエッジが同化して見えにくくなるため、
  // 透過度が上がる（op が小さくなる）ほどエッジの色を明るく・不透明度を上げる。
  // ※旧実装は不透明時(lift=0)点でも基準値0.95/0.6からスタートしており、
  // 透過を落とし始めた瞬間にほぼ全開で見えてしまっていた(マスター報告)。
  // 基準値を低く設定し、liftに対してリニアに立ち上がるよう修正。
  if(_edgeMaterials.length){
    const lift = 1-op; // op=1(不透明)→lift=0 / op=0.1(ほぼ透明)→lift=0.9
    const [br,bg,bb]=_EDGE_BASE_RGB;
    const r=Math.round(br+(255-br)*lift*0.75);
    const g=Math.round(bg+(255-bg)*lift*0.75);
    const b=Math.round(bb+(255-bb)*lift*0.75);
    const hex=(r<<16)|(g<<8)|b;
    if(_edgeMaterials[0]){ _edgeMaterials[0].color.setHex(hex); _edgeMaterials[0].opacity=Math.min(1,0.42+lift*0.58); _edgeMaterials[0].needsUpdate=true; }
    if(_edgeMaterials[1]){ _edgeMaterials[1].color.setHex(hex); _edgeMaterials[1].opacity=Math.min(1,0.22+lift*0.5); _edgeMaterials[1].needsUpdate=true; }
  }
  const el=document.getElementById('opacity-val');
  if(el) el.textContent=val+'%';
}

// v0.0013: ソリッド/グラデ切替
// v0.0014: 頂点クリーニングモード切替
// v0.0015: 穴あきリスクが高いため、デフォルトを'precise'（クリーニングなし）に変更
// スリバー対策はtriangle-levelフィルター（0.5mm最小高さ）に一本化
window._vertexCleanMode = 'precise'; // 'normal' or 'precise'

// r038 要望⑤: 「ソリッド」を名乗りつつ実際はPhongのshininess=120で光源グラデがかかったままだった問題を修正。
// MeshBasicMaterialは光源計算を一切行わないため、これに丸ごと差し替えることで真のフラット単色表示にする。
function toggleMeshSolid(){
  window._meshSolidMode = !window._meshSolidMode;
  const btn=document.getElementById('btn-solid-toggle');
  const curOp = _meshMaterials[0] ? _meshMaterials[0].opacity : (parseInt(document.getElementById('mesh-opacity')?.value||'72')/100);
  if(!_meshObjs.length){ return; } // 3D未生成時はガード

  if(window._meshSolidMode){
    // ソリッドモード: MeshBasicMaterialに差し替え → 光源グラデーション完全無視のフラット単色
    // r045→6D改修(2026-08-28 引継ぎ18回目): 元はindex1=redMesh固定決め打ちだったが、
    // 6DでpurpleWallMeshが追加され_meshObjsが[cyan,red,gray]の3要素になり得るため、
    // 「そのメッシュがハッチテクスチャを持つか(userData.hatchMap)」で汎用判定する
    // 方式に変更。山留のみ/紫のみ/両方どのケースでも正しく機能する。
    const solidColors = [0x8899aa, 0xffffff, 0xffffff];
    const newMats = _meshObjs.map((mesh,i)=>{
      const isRed = !!mesh.userData.hatchMap;
      const opForThis = isRed ? Math.max(0, curOp-0.1) : curOp;
      const bm = new THREE.MeshBasicMaterial({
        color: isRed ? 0xffffff : (solidColors[i]!==undefined?solidColors[i]:0x8899aa),
        map: isRed ? mesh.userData.hatchMap : null,
        opacity: opForThis, transparent: true, side: THREE.DoubleSide,
        depthWrite: opForThis >= 0.99, // r053: 不透明時は正しい隠面消去、透過時のみ奥を見せる
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
      try{ mesh.material.dispose(); }catch(e){}
      mesh.material = bm;
      return bm;
    });
    _meshMaterials = newMats;
    if(btn) btn.textContent='⬜ ソリッド → グラデ';
  } else {
    // グラデモード: 元のPhongマテリアル（ウォームゴールド系＋陰影）に戻す
    // r045→6D改修: 同上の理由でhatchMap有無による汎用判定に変更
    // r073(21回目引継ぎ・マスター指摘「グラデ→ソリッド→グラデで色が変わる」):
    // メイン形状(cyanMesh、isRed=false)の初期グラデーションは実際には
    // vertexColors(高さに応じた色分け, color:0xffffff, emissive:0x080604,
    // shininess:12)で作られているのに、ここでは単色オレンジ(0xffcc77,
    // emissive:0x221100, shininess:40, vertexColors未指定)を再構築していたため、
    // 一度ソリッドへ切り替えて戻すと高さグラデが失われ単色に変わっていた
    // (根本原因)。isRed=falseの側だけ、生成時と同じvertexColors設定に修正。
    const origColors=[0xffcc77,0xffffff,0xffffff];
    const newMats = _meshObjs.map((mesh,i)=>{
      const isRed = !!mesh.userData.hatchMap;
      const opForThis = isRed ? Math.max(0, curOp-0.1) : curOp;
      const pm = new THREE.MeshPhongMaterial({
        color: isRed ? 0xffffff : 0xffffff,
        vertexColors: !isRed, // r073: メイン形状は高さグラデ(vertexColors)を復元
        map: isRed ? mesh.userData.hatchMap : null,
        emissive: isRed ? 0x3a1400 : 0x080604, shininess: isRed ? 12 : 12,
        opacity: opForThis, transparent: true, side: THREE.DoubleSide,
        depthWrite: opForThis >= 0.99, // r053: 不透明時は正しい隠面消去、透過時のみ奥を見せる
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
      try{ mesh.material.dispose(); }catch(e){}
      mesh.material = pm;
      return pm;
    });
    _meshMaterials = newMats;
    if(btn) btn.textContent='🎨 グラデ → ソリッド';
  }
}

function resetCalcToSelect(){
  document.getElementById('calc-select-panel').style.display='';
  document.getElementById('calc-result-panel').style.display='none';
  document.getElementById('res-box').innerHTML='<div class="vol-big" id="res-vol">—<span>m³</span></div><div class="vol-label" id="res-vol-label">切土量（ブール和）</div><div class="vol-caution">⚠ このアプリの値は参考値です<br>値を使用する際は必ず<br>自分で確認をしましょう</div><div class="vol-detail" id="res-detail"></div>';
  document.getElementById('rect-table-wrap').style.display='none';
  document.getElementById('btn-glb').classList.remove('show');
  const _bp=document.getElementById('btn-placement');if(_bp)_bp.classList.remove('show');
  window._lastCalcModeForPlacement=null;
  const _ba1=document.getElementById('btn-analyze-structure');if(_ba1)_ba1.classList.remove('show');
  const _be1=document.getElementById('btn-analyze-earthwork');if(_be1)_be1.classList.remove('show');
  // r088(24回目・項目2): 透過スライダー/ソリッド-グラデ切替UIは計算結果表示中だけ
  // 出るのが正解なのに、「戻る」を押しても消えずに残っていたバグを修正。
  const _opCtrl=document.getElementById('opacity-ctrl');if(_opCtrl)_opCtrl.style.display='none';
  // v0.0013: showCalcModalのsetTimeoutで既にinitThree_previewが呼ばれてる
  // 戻るボタン時は3Dをリセットして個別カラーに戻す
  initThree_preview();
}
// ════════════════════════════════════════════════════════════
//  r063: スリバー面（極小・極細ポリゴン）の事前除外
//  幅5mm程度の斜めスリバーや9mm幅の量子化衝突ポリゴンが3D処理に混入すると
//  クラック・非多様体崩壊の原因になる(AIS_CrashTest.voldで確認)。
//  既存tryChamferMm(鋭角40°以下カット)では防げない: noSlopeはスキップ、
//  角度判定のため細長い矩形(内角90°)は素通り、入力前処理のためクリップ後に
//  動的発生したスリバーには効かない。実重機で施工不可能な極小形状は
//  LandXML出力上も無意味なため、doboku/normal分岐前(getAllFrustums()前)に
//  入力データの段階で一括除外する(表示ロジック分離は維持、二重実装回避)。
// ════════════════════════════════════════════════════════════
function _convexHull2D(pts){
  const p = [...pts].sort((a,b)=> a.x-b.x || a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const pt of p){
    while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],pt)<=0) lower.pop();
    lower.push(pt);
  }
  const upper=[];
  for(let i=p.length-1;i>=0;i--){
    const pt=p[i];
    while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],pt)<=0) upper.pop();
    upper.push(pt);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
// 回転キャリパー法: 凸包の各辺の法線方向へ全頂点を射影し、その射影幅の
// 最小値を「多角形の最小幅」とする。斜めのスリバー（例:対角線状の
// 細長い四角形）も、単純なバウンディングボックスの幅/高さでは検出できない
// ため、この方式が必須（AIS_CrashTest.voldのshape2で実証済み: bboxは
// 7000x7010mmだが実際の幅は約3.5mm）。
function _polygonMinWidthMm(ptsMm){
  const hull = _convexHull2D(ptsMm);
  const n = hull.length;
  if(n < 2) return 0;
  if(n === 2) return 0;
  let minWidth = Infinity;
  for(let i=0;i<n;i++){
    const a=hull[i], b=hull[(i+1)%n];
    const ex=b.x-a.x, ey=b.y-a.y;
    const len=Math.hypot(ex,ey);
    if(len<1e-9) continue;
    const nx=-ey/len, ny=ex/len;
    let minP=Infinity, maxP=-Infinity;
    hull.forEach(p=>{
      const proj = p.x*nx + p.y*ny;
      if(proj<minP) minP=proj;
      if(proj>maxP) maxP=proj;
    });
    const width = maxP-minP;
    if(width<minWidth) minWidth=width;
  }
  return minWidth;
}
// Voldia版: 3D構築失敗時の共通処理
//   どの図形が原因か、実際にManifold処理を行う関数(buildManifoldUnionGeom/buildSimpleExtrudeGeom)へ
//   1個ずつ単独で通し直して切り分ける（コの字など自己交差・非多様体を起こす形状は例外を投げる）
async function handle3DBuildFailure(fs, mode){
  document.getElementById('res-vol').innerHTML = `---<span>m³</span>`;
  document.getElementById('res-vol-label').textContent = '⚠ Objectエラー！表示出来ません';
  document.getElementById('res-detail').innerHTML = '';
  document.getElementById('res-box').classList.add('show');
  toast('⚠ Objectエラー！表示出来ません', 4000);

  try{
    const isDoboku = mode==='doboku';
    let flaggedAny=false;
    for(const f of fs){
      if(f.srcIdx==null) continue;
      try{
        const single = isDoboku
          ? await buildManifoldUnionGeom([f], true)
          : await buildSimpleExtrudeGeom([f]);
        if(!single) throw new Error('single build returned null');
      }catch(e2){
        if(shapes[f.srcIdx]){ shapes[f.srcIdx]._voldiaGeoError=true; flaggedAny=true; }
      }
    }
    if(flaggedAny){ updSidebar(); redraw(); }
    await customAlert('現在の機能では３D表示出来ない形状があります。分割してください。'
      + (flaggedAny ? '（該当オブジェクトを赤色で表示しました）' : ''));
  }catch(e3){
    console.error('原因切り分け診断でもエラー:', e3);
  }
}

async function runCalc(mode){
  // r075マスター指示: 2D画面で図形を選択したまま3Dイメージへ移動すると選択色が
  // 残ったままになる不具合の修正。3D計算実行時に必ず選択状態をクリアする。
  if(selectedSet.size>0){ clearSelection(); }
  // Voldia版: 前回計算で赤表示になったエラーフラグを一旦リセット（再計算で直っていれば消える）
  if(shapes.some(sh=>sh._voldiaGeoError)){
    shapes.forEach(sh=>{ sh._voldiaGeoError=false; });
    updSidebar(); redraw();
  }
  // v0.0009: 計算前に面積ゼロオブジェクトを自動削除
  {
    const MIN_AREA_M2 = 1e-4;
    const before = shapes.length;
    shapes = shapes.filter(sh => (sh.area||0) >= MIN_AREA_M2);
    const removed = before - shapes.length;
    if(removed > 0){
      updSidebar(); redraw();
      toast(`⚠️ 面積が小さすぎる図形を${removed}個削除しました`);
    }
  }
  // r063: スリバー面（面積0.05㎡以下 または 最小幅5cm以下）を事前除外。
  // どちらか一方だけでは不十分（例: 幅5mm×長さ14mの斜めスリバーは
  // 面積0.07㎡で面積フィルタ単体をすり抜けるが、幅フィルタで検知できる）。
  {
    const MIN_SLIVER_AREA_M2 = 0.05;
    const MIN_SLIVER_WIDTH_MM = 50;
    const before = shapes.length;
    const removedNames = [];
    shapes = shapes.filter(sh => {
      if(!sh.ptsMm || sh.ptsMm.length < 3) return true; // 別のガードに任せる
      const areaM2 = sh.area || 0;
      const widthMm = _polygonMinWidthMm(sh.ptsMm);
      const isSliver = areaM2 <= MIN_SLIVER_AREA_M2 || widthMm <= MIN_SLIVER_WIDTH_MM;
      if(isSliver){ removedNames.push(`${sh.name||'(無名)'}(面積${areaM2.toFixed(3)}㎡/幅${widthMm.toFixed(0)}mm)`); }
      return !isSliver;
    });
    const removed = before - shapes.length;
    if(removed > 0){
      updSidebar(); redraw();
      const shown = removedNames.slice(0,5).join('、') + (removedNames.length>5 ? ` 他${removedNames.length-5}件` : '');
      toast(`⚠️ 重機での施工が現実的に不可能な極小・極細図形を${removed}個除外しました: ${shown}`, 4200);
    }
  }
  let fs=getAllFrustums();
  // r042: fsはこの後、法面ON/OFF切替・捨てコン厚み調整・自己交差除外などのために
  // 何度も fs = fs.map(...)/filter(...) で再代入され、その都度「新しい配列」に
  // 置き換わる。getAllFrustums()が配列に生やした_offsetX/_offsetYは配列の
  // プロパティなので、この再代入のたびに消えてしまう(r041で見落としていたバグ)。
  // 山留クリップが最後まで正しいオフセットを使えるよう、ここで独立変数に退避する。
  const _yamadomeOffsetX = fs._offsetX || 0;
  const _yamadomeOffsetY = fs._offsetY || 0;
  // r013: shapeToFrustum内の自己交差事前検出（第一段：生の外周のみ）で
  // 新たに_voldiaGeoErrorが立った図形があれば、ここで画面に反映してブロック。
  // これは「保存された図形データそのものが自己交差している」ケース専用で、
  // 計算モード別の余掘り・法面オフセットを考慮した判定は、まだここでは
  // 行われていない（後段の計算モード確定後に別途チェックする）。
  if(shapes.some(sh=>sh._voldiaGeoError)){
    updSidebar(); redraw();
    const badNames = shapes.filter(sh=>sh._voldiaGeoError).map(sh=>sh.name||'(無名)');
    await customAlert(
      `この計算モードは自己交差する図形がある場合、計算出来ません\n\n`
      + `対象：${badNames.slice(0,5).join('、')}${badNames.length>5?` 他${badNames.length-5}件`:''}\n\n`
      + `計算出来ない図形は赤色にしたので、分割して描きなおしてください`
    );
    closeCalcModal();
    return;
  }
  const concVal=( v => isNaN(v) ? 110 : v)(parseFloat(document.getElementById('conc-thick').value));
  // Voldia版: 個別「垂直/法面」「余掘」UIを廃止し、計算モードで全オブジェクト一律に統一
  if(mode==='normal'){
    fs = fs.map(f=>({...f, noSlope:true}));
  } else if(mode==='doboku'){
    const globalOD=( v => isNaN(v) ? 200 : Math.max(0,v))(parseFloat(document.getElementById('global-overdig').value));
    // 6C(2026-08-28 引継ぎ18回目→26回目セッションで紫に移設): 従来は全オブジェクト
    // 一律noSlope:falseで個別の垂直指定が消し飛んでいた。紫色のオブジェクトだけ垂直面
    // (+DOBOKU_VERTICAL_TAPER_FIXED_MMの微勾配)にする条件分岐に変更。
    fs = fs.map(f=>({...f, noSlope:(f.color==='purple'), OD:globalOD}));
  }
  if(!fs.length){alert('深さが入力された図形がありません');return;}

  // v0.0010: 法面オブジェクトの鋭角チェック → ダイアログ → 一時カット or 削除
  {
    const THR_RAD = SHARP_ANGLE_DEG * Math.PI / 180;
    const MIN_MM  = 500; // カット後新辺の最小長さ 500mm

    // ptsMm(mm座標)に対してカットを試みる。
    // 戻り値: { pts: 結果頂点列(mm), ok: true=使用可, deleted: true=削除対象 }
    function tryChamferMm(ptsMm){
      let result = [...ptsMm];
      const maxIter = (result.length + 1) * 3;
      for(let iter = 0; iter < maxIter; iter++){
        if(result.length < 3) return {pts: result, ok: false, deleted: true};
        let found = false;
        const m = result.length;
        for(let i = 0; i < m; i++){
          const prev=result[(i-1+m)%m], cur=result[i], next=result[(i+1)%m];
          const ax=prev.x-cur.x, ay=prev.y-cur.y;
          const bx=next.x-cur.x, by=next.y-cur.y;
          const la=Math.hypot(ax,ay), lb=Math.hypot(bx,by);
          // ゼロ長辺 → この頂点は除去対象だが削除するとポリゴン崩壊する恐れあり
          if(la<1e-3||lb<1e-3){
            if(result.length<=3) return {pts:result, ok:false, deleted:true};
            result.splice(i,1); found=true; break;
          }
          const cosA=(ax*bx+ay*by)/(la*lb);
          const angle=Math.acos(Math.max(-1,Math.min(1,cosA)));
          if(angle>=THR_RAD) continue; // 鋭角でない → OK
          // カット量 t: 新辺 = 2t*sin(θ/2) >= MIN_MM
          const sinHalf=Math.sin(angle/2);
          const t_need=(sinHalf>1e-6)?(MIN_MM/(2*sinHalf)):MIN_MM;
          const tMax=Math.min(la*0.45, lb*0.45);
          if(t_need > tMax){
            // 500mm取れない → このフラスタムは削除
            return {pts:result, ok:false, deleted:true};
          }
          // カット実行
          result.splice(i,1,
            {x:cur.x+(ax/la)*t_need, y:cur.y+(ay/la)*t_need},
            {x:cur.x+(bx/lb)*t_need, y:cur.y+(by/lb)*t_need}
          );
          found=true; break;
        }
        if(!found) break; // 鋭角なし → 完了
      }
      if(result.length < 3) return {pts:result, ok:false, deleted:true};
      return {pts:result, ok:true, deleted:false};
    }

    // 事前チェック: 各フラスタムの結果を分類
    let hasSharps = false;
    let deletedCount = 0;
    const chamferResults = fs.map(f => {
      if(f.noSlope || !f.ptsMm || f.ptsMm.length < 3) return {f, action:'keep'};
      const {pts, ok, deleted} = tryChamferMm(f.ptsMm);
      if(deleted){ hasSharps=true; deletedCount++; return {f, action:'delete'}; }
      // ok=trueでも元と同じ場合はkeep
      const changed = pts.length !== f.ptsMm.length ||
        pts.some((p,i)=>Math.abs(p.x-(f.ptsMm[i]||{x:0}).x)>0.1||Math.abs(p.y-(f.ptsMm[i]||{x:0,y:0}).y)>0.1);
      if(!changed) return {f, action:'keep'};
      hasSharps=true;
      // 面積再計算
      let a2=0;
      for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;a2+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}
      const newAreaM2=Math.abs(a2)/2/1e6;
      if(newAreaM2<1e-4){deletedCount++; return {f, action:'delete'};}
      return {f: {...f, ptsMm:pts, area:newAreaM2}, action:'chamfer'};
    });

    if(hasSharps){
      const deletedNote = deletedCount > 0
        ? `<br><span style="color:#ef9a9a;font-weight:bold;">計算できないオブジェクト ${deletedCount}個 は削除します（赤色表示にします）。</span>`
        : '';
      await new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:30000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML=`
          <div style="background:#1e1e2e;border:1px solid #444;border-radius:10px;padding:28px 32px;max-width:440px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.6);">
            <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
            <div style="font-size:1rem;color:#e0e0e0;line-height:1.9;margin-bottom:20px;">
              法面オブジェクトに<strong style="color:#ffb74d;">鋭角部分（40°以下）</strong>が検知されました。<br>
              体積計算・3D表示の精度向上のため、<br>
              計算用データに自動カット処理を行います。${deletedNote}<br>
              <span style="font-size:.85rem;color:#9e9e9e;">※ 作図データは変更されません。</span>
            </div>
            <button id="sharp-ok-btn" style="background:#f57c00;color:#fff;border:none;border-radius:6px;padding:10px 36px;font-size:1rem;cursor:pointer;font-weight:bold;">はい</button>
          </div>`;
        document.body.appendChild(overlay);
        document.getElementById('sharp-ok-btn').onclick=()=>{document.body.removeChild(overlay);resolve();};
      });
      // r061: 鋭角処理で完全削除された図形は、自己交差(_voldiaGeoError)と同じ仕組みで
      // 赤色表示にする。計算は続行できても「この図形は鋭角のせいで消えた」と
      // 見た目でわかるようにするため、部分削除・全削除どちらのケースでも立てる。
      let sharpDeletedAny = false;
      chamferResults.forEach(r => {
        if(r.action === 'delete' && r.f.srcIdx != null && shapes[r.f.srcIdx]){
          shapes[r.f.srcIdx]._voldiaGeoError = true;
          sharpDeletedAny = true;
        }
      });
      if(sharpDeletedAny){ updSidebar(); redraw(); }
      // 結果を適用（削除はfilterで除外、カット済みはそのまま）
      fs = chamferResults
        .filter(r => r.action !== 'delete')
        .map(r => r.f);
    }
  }

  // v0.0011: 鋭角削除後にfsが空になった場合は計算中止
  if(!fs.length){
    const overlay2 = document.createElement('div');
    overlay2.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:30000;display:flex;align-items:center;justify-content:center;';
    overlay2.innerHTML=`
      <div style="background:#1e1e2e;border:1px solid #444;border-radius:10px;padding:28px 32px;max-width:400px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.6);">
        <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
        <div style="font-size:1rem;color:#e0e0e0;line-height:1.8;margin-bottom:20px;">
          鋭角処理により計算対象が<br>すべて除外されました。<br>
          <span style="font-size:.85rem;color:#9e9e9e;">対象の図形は赤色にしたので、分割して描きなおしてください。</span>
        </div>
        <button id="no-fs-ok" style="background:#555;color:#fff;border:none;border-radius:6px;padding:10px 36px;font-size:1rem;cursor:pointer;">閉じる</button>
      </div>`;
    document.body.appendChild(overlay2);
    document.getElementById('no-fs-ok').onclick=()=>document.body.removeChild(overlay2);
    return;
  }
  const btn=document.getElementById(mode==='doboku'?'btn-calc-doboku':'btn-calc-run');
  btn.disabled=true; btn.textContent='計算中...';
  // r072(21回目引継ぎ・マスター要望「3Dイメージ作成に時間がかかる場合があるので
  // 計算中と画面に出したい」): ボタン文字の変化だけでは気づきにくいため、
  // 計算モーダル内に大きめの「計算中...」オーバーレイを表示する。3Dイメージが
  // 実際に画面へ表示された時点(initThree_watertight完了 or エラー)で即座に消す。
  _showCalcProgress();
  // r073(21回目引継ぎ・マスター指摘「オーバーレイが表示される前にフリーズが先に
  // 来る」): _showCalcProgress()でDOMを更新しても、直後に重い同期処理へ突入すると
  // ブラウザが再描画(ペイント)する前にメインスレッドが専有されてしまい、
  // 「フリーズ→計算中表示→即消える→結果表示」という体感になっていた。
  // ここで一度イベントループへ制御を返し、2回のrequestAnimationFrameで
  // 確実に1フレーム分の描画を挟んでから重い処理に入るようにする。
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  document.getElementById('calc-select-panel').style.display='none';
  document.getElementById('calc-result-panel').style.display='';
  // r003根治修正: 既存躯体(グレー)は「余掘り・法面・捨てコン+砕石は無視、
  // 描いた形状そのまま(天端・下端含む)」の仕様のはずだったが、実際には
  // このすぐ下のモード別調整(特に土量計算側の「天端をGL=0に強制正規化」処理)が
  // 色に関係なく全フラスタムに一律適用されていたため、既存躯体の天端(topLevel)を
  // 何mmに変更しても3D上は常にGL(0)基準にリセットされてしまう不具合があった
  // (マスター実機報告: 「天端の数字を変えても3Dは全部天端がGLの値になる」)。
  // 土量計算側の重複体積計算(_calcExistingStructureOverlapVolume)もこの正規化後の
  // フラスタムを使っていたため、天端が0でない既存躯体では重複体積の計算自体も
  // ズレていた可能性がある。ここで既存躯体だけを退避し、捨てコン加算分だけ
  // (通常計算と同じ理屈で)相殺してモード非依存のD=tl-bに揃え、天端正規化・
  // 地盤面より上の除外など、これ以降のモード別調整を一切適用せずに末尾で合流させる。
  // r015(28回目セッション): 上記のうち「GLオフセットの反映」だけは除外し過ぎだった。
  // マスター実機検証(GL±1000で既存躯体のtl/Dが本当に無変化なことをログで確認済み)を
  // 受けての指摘: 「2Dで描いた下端が正解値であり、GLが変わったら他のオブジェクトと
  // 同じ数値だけ全オブジェクトが上下するべき。既存躯体だけ動かないのはおかしい」との
  // 仕様確定を受け、天端の強制ゼロ化(バグ本体、除外を維持)とGLオフセットの反映を
  // 切り分け、GLオフセットは青(掘削)と全く同じ式(D+=glOff)を既存躯体にも適用した。
  // r016(28回目セッション、r015の訂正): しかしr015の式は「天端0固定・下端側が動く」
  // 青の内部実装をそのまま既存躯体に流用したため、絶対に動いてはいけない下端まで
  // 動いてしまい、「地中に埋まっている予定の既存躯体の大きさが変わる」誤りだと
  // マスターが指摘。最終仕様: 既存躯体は天端・下端とも「描いた値を厳守」。ただし
  // 天端が現況地盤GLの値より上にある場合だけ、GLより上(地上に露出している扱いの
  // 部分)を天端側から切り落とす(下端方向へ伸ばすことは絶対にしない、片側クリップ
  // のみ)。具体的な計算式は下記GLオフセット適用ブロック内(letに変更、doboku・
  // GLオフセット指定時のみ調整)。
  let _grayFsUntouched = fs.filter(f=>f.color==='gray')
    .map(f=>({...f, D: f.D - concVal}))
    .filter(f=>f.D>0);
  fs = fs.filter(f=>f.color!=='gray');
  // v0.0012: 通常計算は捨コン+砕石を深さに含めない
  // v0.0014: 通常計算は余掘り(OD)も含まない
  if(mode==='normal'){
    fs = fs.map(f => ({...f, D: f.D - concVal, OD: 0})).filter(f => f.D > 0);
  }
  // 土量計算: 天端 > 0 の場合は天端を基準（0）にカット。天端 < 0 はそのまま
  if(mode==='doboku'){
    // r049: 床付けレベル(depthBeam = tl - D + concVal)が地盤面(GL=0)以上の
    // オブジェクトを計算前に明示的に除外する。
    //   ・depthBeam >= concVal → 天端カット後 D<=0 になり従来から無言で消えていた
    //   ・0 <= depthBeam < concVal → 天端カット後に極薄スライバー(数mm〜concVal未満)が残り、
    //     頂点量子化(10/25/50mm)と衝突して非多様体崩壊を起こすことがある(要実機確認の既知課題)
    // 通常計算(mode==='normal')側にはこのガードを適用しない
    // （通常計算では地盤面より上にオブジェクトを描く使い方が普通にあり得るため、
    //   ユーザーが誤って土量計算ボタンを押した時だけ弾いて教えてあげる）。
    const excludedNames=[];
    fs = fs.filter(f=>{
      const b = f.tl - f.D + concVal; // depthBeamを逆算
      if(b >= 0){ excludedNames.push(f.name || '(無名)'); return false; }
      return true;
    });
    if(excludedNames.length){
      const shown = excludedNames.slice(0,5).join('、') + (excludedNames.length>5 ? ` 他${excludedNames.length-5}件` : '');
      toast(`⚠ 地盤面より上のオブジェクト(${excludedNames.length}件: ${shown})は土量計算対象外のため除外しました`, 3600);
    }
    fs = fs.map(f => {
      const tl=f.tl||0;
      if(tl===0) return f;
      return {...f, D: f.D - tl, tl: 0};
    }).filter(f=>f.D>0);
    // 新4(2026-08-25引継ぎ17回目マスター指示): 現況地盤GLオフセットの反映。
    // 「土量計算は常にGL±0まで掘る計算」という前提はそのまま(天端は上で既に0へ正規化済み)、
    // 掘削の深さ(=下端)だけをオフセット分ずらす、というマスター確定仕様。
    //   GL+100(地盤面が高い) → 掘削深度が深くなる → 下端-100 ⇔ D+100(体積↑)
    //   GL-200(地盤面が低い) → 掘削深度が浅くなる → 下端+200 ⇔ D-200(体積↓)
    // 天端は動かさない(=0のまま)ので、下端=0-D。下端_new = 下端_old − offsetMm を
    // Dの式に展開すると D_new = D_old + offsetMm の一本にまとまる(符号分岐が不要)。
    // ★通常計算(mode==='normal')側にはこの調整を適用しない(マスター確定仕様:
    //   通常計算は3D形状表示のみが目的でGL反映は不要なため)。
    if(window._glOffsetMm){
      const glOff = window._glOffsetMm;
      const excludedGL=[];
      fs = fs.map(f => ({...f, D: f.D + glOff})).filter(f=>{
        if(f.D <= 0){ excludedGL.push(f.name || '(無名)'); return false; }
        return true;
      });
      // r016(28回目セッション): r015で「青と全く同じ式(D+=glOff)」を既存躯体にも
      // 適用したところ、マスター実機検証で「地中に埋まっている予定の既存躯体の
      // 大きさが変わってしまう」誤りが発覚。青のD+=glOffは天端を0固定にした状態で
      // 下端側を動かす実装のため、既存躯体にそのまま適用すると絶対に動かしてはいけない
      // 下端まで動いてしまっていた。マスター確定仕様: 既存躯体は天端・下端とも
      // 「描いた値を厳守」。ただし天端が現況地盤GLの値より上にある場合だけは、
      // GLより上の部分は現況地盤面より外(地上)にあり土量計算上の掘削対象外の
      // 領域なので、天端をGLの値まで切り下げる(＝GLより下側にはみ出させて
      // 伸ばすことはしない。切るだけの片側クリップ)。下端は常に不動。
      _grayFsUntouched = _grayFsUntouched.map(f => {
        const bottom = (f.tl||0) - f.D; // 描いた通りの不動の下端
        const clippedTl = Math.min(f.tl||0, glOff);
        return {...f, tl: clippedTl, D: clippedTl - bottom};
      }).filter(f=>{
        if(f.D <= 0){ excludedGL.push(f.name || '(無名、既存躯体)'); return false; }
        return true;
      });
      if(excludedGL.length){
        const shown = excludedGL.slice(0,5).join('、') + (excludedGL.length>5 ? ` 他${excludedGL.length-5}件` : '');
        toast(`⚠ GLオフセット適用後に深さが0以下になったオブジェクト(${excludedGL.length}件: ${shown})は計算対象外のため除外しました`, 3600);
      }
    }
    // r038: 山留クリップは「法面込みで完全に組んでから深さごとに垂直カット」する方式に
    // 変更したため、ここでの平面(2D footprint)事前クリップは廃止。
    // 実際のクリップは _calcVolumeFallback と buildShellMesh 内で、
    // 各深さスライスの法面オフセット後の輪郭に対して行う(getYamadomeMmPolygon/
    // clipContourToYamadome 参照)。
  }
  // r003: 上記モード別調整から除外しておいた既存躯体(グレー)をここで合流。
  // 自己交差チェックなど、色を問わず必要な後続処理はここから先で通常通り適用される。
  fs = fs.concat(_grayFsUntouched);
  // r013: 自己交差の事前検出（第二段：計算モード別の最終OD/D/noSlopeが
  // 確定した後の本判定）。ここまでのfsは、mode==='doboku'ならnoSlope強制
  // false・OD=globalOD、mode==='normal'ならOD=0等の上書きが全て適用済み。
  // 「保存時はnoSlope+余掘り0で自己交差していなかった図形が、土量計算では
  // 強制的に法面+全体余掘りを付けられた結果、オフセット後に自己交差する」
  // ケースは、この段階でのf.OD/f.D/f.noSlopeを見ないと判定できない
  // （第一段のshapeToFrustum内チェックは保存された生の値しか知らないため
  // このケースを見逃す）。
  {
    const badFs = fs.filter(f => _shapeSelfIntersects(f.ptsMm, f.holesMm, f.OD, f.D, f.noSlope));
    if(badFs.length){
      const badIdx = new Set(badFs.map(f=>f.srcIdx));
      badFs.forEach(f => { if(shapes[f.srcIdx]) shapes[f.srcIdx]._voldiaGeoError = true; });
      fs = fs.filter(f => !badIdx.has(f.srcIdx));
      updSidebar(); redraw();
      const badNames = badFs.map(f => (shapes[f.srcIdx]&&shapes[f.srcIdx].name) || '(無名)');
      await customAlert(
        `この計算モードは自己交差する図形がある場合、計算出来ません\n\n`
        + `対象：${badNames.slice(0,5).join('、')}${badNames.length>5?` 他${badNames.length-5}件`:''}\n\n`
        + `計算出来ない図形は赤色にしたので、分割して描きなおしてください`
      );
      // r016: ダイアログを閉じた後は計算パネル全体を閉じて作図モードへ戻す
      // （btn状態のリセットは、パネルが次に開かれた時のため念のため行う）
      btn.disabled=false; btn.textContent=mode==='doboku'?'⚡ 土量計算':'⚡ 通常計算';
      closeCalcModal();
      return;
    }
  }
  // 新3(2026-08-28 引継ぎ18回目マスター指示→26回目セッションで紫に移設): 毎回出る
  // 「値は参考値です」トーストはres-box常設の.vol-cautionに一本化するため廃止。
  // 代わりに、土量計算で紫(垂直面強制)オブジェクトが存在する場合のみ、起動
  // (ページ読み込み)毎に1回だけ目立つ横長トーストで注意喚起する。
  if(mode==='doboku' && !_purpleCalcWarnShown && fs.some(f=>f.color==='purple')){
    _purpleCalcWarnShown = true;
    toast('紫色に設定したオブジェクトは強制的に垂直面となります。', 4800, 'large');
    await new Promise(r=>setTimeout(r,50));
  }

  try{
    // 26回目セッション新規: 「単独合計」表は掘削オブジェクトの重複具合を見るための
    // 指標。既存躯体(グレー)は掘削対象ではなく、余掘り・法面も適用されない
    // (仕様: 描いた形状そのまま)ため、そのまま f.OD/f.noSlope を使うと
    // (特に土量計算モードでは紫だけがnoSlope強制になったことで)グレーが
    // 法面付き掘削体積として単独合計に混入し、重複削減率が歪む。行の表示自体は
    // 「その既存躯体の実体積」として意味があるので残しつつ、OD:0・noSlope:true
    // (=既存躯体の正しい体積規約)で計算し直し、単独合計・重複削減率の集計からは除外する。
    const singleVols=fs.map(f=> mm3ToM3(singleFrustumVolumeMm3(f.color==='gray' ? {...f, noSlope:true, OD:0} : f)));
    const sumM3=fs.reduce((s,f,i)=> f.color==='gray' ? s : s+singleVols[i], 0);

    const result=await buildUnionFrustumGeometry(fs, _yamadomeOffsetX, _yamadomeOffsetY);
    if(result.error) throw new Error(result.error);

    const unionM3 = mm3ToM3(result.unionVol);
    const overM3  = Math.max(0, sumM3 - unionM3);
    const ratio   = sumM3 > 0 ? (overM3 / sumM3 * 100) : 0;
    // r017(28回目セッション): マスター要望対応。「単独合計/重複削減」は掘削同士の
    // 重なりを見るための従来指標(既存躯体は元々除外済み)で意味が違うため、
    // 既存躯体の内訳は別立てで新設する。(A)=既存躯体を考慮しない掘削のみの
    // 合計、(B)=掘削と重なる既存躯体の体積。最終値(≒{unionM3})は従来通りA-B。
    const excavOnlyM3 = mm3ToM3(result.excavOnlyVol);
    const existingOverlapM3 = mm3ToM3(result.existingStructOverlapVol);
    window._lastCalcABBreakdown = { excavOnlyM3, existingOverlapM3, totalM3: unionM3 };

    _lastGeoms = result.unionGeoms;
    _lastExistingStructGeoms = result.existingStructGeoms || [];

    // r010: VoldiaM側で見つかった体積計算バグ(Math.abs()による穴符号消失/
    // holesMm無視)の修正・移植を確認できたため、土量計算も実数値表示に復活。
    // 「精度確認中のため非表示」の代わりに、UI側res-boxに常設した
    // 「⚠ 数値は参考値です」の注意書きで一本化する。
    if(mode==='doboku'){
      // r072マスター指示追7: エビル(データ出力)側の値と厳密には一致しないため、
      // どちらも100%正解ではないことが伝わるよう先頭に「≒」を付ける
      _setResVolBig(`≒${_formatVolM3(unionM3)}`);
      document.getElementById('res-vol-label').textContent = '切土量（ブール和）';
      document.getElementById('res-detail').innerHTML = `
        <div class="di"><span>単独合計</span><span class="dv">${sumM3.toFixed(3)} m³</span></div>
        <div class="di"><span>重複削減</span><span class="dv warn">-${overM3.toFixed(3)} m³</span></div>
        <div class="di"><span>重複率</span><span class="dv warn">${ratio.toFixed(1)} %</span></div>
        ${existingOverlapM3>0 ? `
        <div class="di"><span>(A)掘削のみ合計</span><span class="dv">${excavOnlyM3.toFixed(3)} m³</span></div>
        <div class="di"><span>(B)既存躯体重複</span><span class="dv warn">-${existingOverlapM3.toFixed(3)} m³</span></div>` : ''}
        <div class="di"><span>捨コン+砕石</span><span class="dv hi">+${concVal}mm 適用済</span></div>
        ${window._glOffsetMm ? `<div class="di"><span>現状地盤GL</span><span class="dv hi">${window._glOffsetMm>=0?'+':''}${window._glOffsetMm}mm 適用済</span></div>` : ''}`;
      document.getElementById('rect-table-wrap').style.display='none';
    }else{
      _setResVolBig(`≒${_formatVolM3(unionM3)}`);
      document.getElementById('res-vol-label').textContent = '合成体積（ブール和）';
      document.getElementById('res-detail').innerHTML = `
        <div class="di"><span>単独合計</span><span class="dv">${sumM3.toFixed(3)} m³</span></div>
        <div class="di"><span>重複削減</span><span class="dv warn">-${overM3.toFixed(3)} m³</span></div>
        <div class="di"><span>重複率</span><span class="dv warn">${ratio.toFixed(1)} %</span></div>
        <div class="di"><span>捨コン+砕石</span><span class="dv hi">除外（オブジェクト高さのみ）</span></div>`;
    }
    document.getElementById('res-box').classList.add('show');

    const tbody=document.getElementById('rect-tbody');
    tbody.innerHTML='';
    fs.forEach((f,i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>No.${i+1}</td>
        <td>${f.area.toFixed(4)}</td>
        <td>${f.D.toFixed(0)}${mode==='doboku' ? `<span style="color:#4fc3f7"> (+${concVal})</span>` : ''}</td>
        <td class="rn">${mode==='doboku' ? '---' : singleVols[i].toFixed(3)}</td>`;
      tbody.appendChild(tr);
    });

    document.getElementById('rect-table-wrap').style.display=(mode==='doboku')?'none':'';
    // r070(マスター指示): 単体GLB保存ボタンは一旦OFF（機能自体は残置、exportGLB()はエビル統合側から呼ばれ続ける）
    // 旧: if(mode!=='doboku'){ document.getElementById('btn-glb').classList.add('show'); }
    // r075: 通常計算後にも配置モードボタンを表示できるようにする(GL平面+押し出しオブジェクトの固定配置モード)
    { const _bp2=document.getElementById('btn-placement'); if(_bp2)_bp2.classList.add('show'); }
    window._lastCalcModeForPlacement = mode; // r075: openPlacementMode()がどちらのGLB生成経路を使うか判定するために保持
    // r070: エビル統合 — 通常計算/土量計算それぞれに対応するデータ出力解析ボタンを表示
    if(mode==='normal'){ const _ba=document.getElementById('btn-analyze-structure'); if(_ba)_ba.classList.add('show'); }
    if(mode==='doboku'){ const _be=document.getElementById('btn-analyze-earthwork'); if(_be)_be.classList.add('show'); }
    
    // 3Dプレビューを更新（計算後: 個別深さで色分け表示）
    // pane が確実にレイアウト済みになってから呼ぶ
    const _ru=result, _fs=fs, _mode=mode;
    setTimeout(async ()=>{
      try{
        await initThree_watertight(_ru.unionGeoms, _ru.geoms, _fs, _mode==='doboku', _yamadomeOffsetX, _yamadomeOffsetY);
      }catch(e4){
        console.error(e4);
        await handle3DBuildFailure(_fs);
      }finally{
        _hideCalcProgress(); // r072: 3Dイメージ表示(成功/失敗いずれか確定)で即消す
      }
    }, 80);

  }catch(e){
    console.error(e);
    _hideCalcProgress(); // r072: buildUnionFrustumGeometry自体が失敗した場合もここで消す
    await handle3DBuildFailure(fs, mode);
  }
  btn.disabled=false;btn.textContent=mode==='doboku'?'土量 再計算':'再計算';
}

// r072(21回目引継ぎ): 計算中オーバーレイの表示/非表示。calc-modal内に重ねて
// 表示するため、要素は初回呼び出し時に遅延生成しcalc-modalへappendする。
function _showCalcProgress(){
  let el = document.getElementById('calc-progress-overlay');
  const modal = document.getElementById('calc-modal');
  if(!el && modal){
    el = document.createElement('div');
    el.id = 'calc-progress-overlay';
    el.style.cssText = 'position:absolute;inset:0;z-index:19999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);pointer-events:none;';
    el.innerHTML = '<div style="background:#1e1e2e;border:1px solid #555;border-radius:10px;padding:22px 40px;font-size:1.15rem;color:#fff;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,.6);">⏳ 計算中...</div>';
    modal.appendChild(el);
  }
  if(el) el.style.display = 'flex';
}
function _hideCalcProgress(){
  const el = document.getElementById('calc-progress-overlay');
  if(el) el.style.display = 'none';
}

// Three.js// Three.js
let threeR=null,threeS=null,threeC=null,threeAnim=null;
let threeGrid=null; // r035: 基準高さ(GL=y0)メッシュ表示ON/OFF用の参照保持
let orTh=0.6,orPh=0.65,orR=50,orCX=0,orCY=0,orCZ=0;
let drag3=null,pan3=null;
// 26回目セッション新規: 従来grayは未定義でblueにフォールバックしていた(バグ)。
// 「既存躯体」機能で3D表示に常時グレーを使うため新規追加。#909090は仮値、
// マスター実機確認後に微調整の可能性あり。
const SHAPE_COLORS_3D={blue:0x00c8ff, green:0x00dc64, yellow:0xdcc800, purple:0xb43cff, gray:0x909090};
const S=0.001; // mm→m

  // ★ v0.0016 根治修正: THREE.EdgesGeometryは内部でエッジ配列をソートしており、
  //   Manifold由来の複雑な統合メッシュ（頂点順序がソート済みに近い巨大配列）を渡すと
  //   ブラウザのソート実装が最悪ケース（再帰しすぎ）で落ちることが実機で複数箇所確認された。
  //   try/catchでは再帰が深すぎてcatch自体に入る前に再度落ちるケースがあるため、
  //   EdgesGeometryを一切使わない非再帰・非ソートの自前実装に置き換える。
  function computeEdgesGeometrySafe(geometry, angleThresholdDeg) {
    const angleThreshold = angleThresholdDeg * Math.PI / 180;
    const posAttr = geometry.attributes.position;
    const idxAttr = geometry.index;
    const pos = posAttr.array;
    const idx = idxAttr ? idxAttr.array : null;
    const triCount = idx ? (idx.length / 3) : (pos.length / 9);

    const faceNormals = new Float64Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = idx ? idx[t*3]   : t*3;
      const i1 = idx ? idx[t*3+1] : t*3+1;
      const i2 = idx ? idx[t*3+2] : t*3+2;
      const ax = pos[i0*3], ay = pos[i0*3+1], az = pos[i0*3+2];
      const bx = pos[i1*3], by = pos[i1*3+1], bz = pos[i1*3+2];
      const cx = pos[i2*3], cy = pos[i2*3+1], cz = pos[i2*3+2];
      const abx = ax - bx, aby = ay - by, abz = az - bz;
      const cbx = cx - bx, cby = cy - by, cbz = cz - bz;
      let nx = cby*abz - cbz*aby;
      let ny = cbz*abx - cbx*abz;
      let nz = cbx*aby - cby*abx;
      const len = Math.hypot(nx, ny, nz) || 1;
      faceNormals[t*3] = nx/len; faceNormals[t*3+1] = ny/len; faceNormals[t*3+2] = nz/len;
    }

    const edgeMap = new Map();
    for (let t = 0; t < triCount; t++) {
      const tri = [idx ? idx[t*3] : t*3, idx ? idx[t*3+1] : t*3+1, idx ? idx[t*3+2] : t*3+2];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e+1)%3];
        const key = a < b ? (a + '_' + b) : (b + '_' + a);
        const rec = edgeMap.get(key);
        if (!rec) { edgeMap.set(key, { a, b, n1: t, n2: -1 }); }
        else { rec.n2 = t; }
      }
    }

    const positions = [];
    edgeMap.forEach(function(rec) {
      let isEdge = true;
      if (rec.n2 !== -1) {
        const dot = faceNormals[rec.n1*3]*faceNormals[rec.n2*3] + faceNormals[rec.n1*3+1]*faceNormals[rec.n2*3+1] + faceNormals[rec.n1*3+2]*faceNormals[rec.n2*3+2];
        const clamped = Math.min(1, Math.max(-1, dot));
        isEdge = Math.acos(clamped) > angleThreshold;
      }
      if (isEdge) {
        positions.push(pos[rec.a*3], pos[rec.a*3+1], pos[rec.a*3+2], pos[rec.b*3], pos[rec.b*3+1], pos[rec.b*3+2]);
      }
    });

    const edgesGeo = new THREE.BufferGeometry();
    edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return edgesGeo;
  }

  // ★ v0.0017: computeEdgesGeometrySafe自体もFirefox実機の巨大・複雑なメッシュで
  //   再現不能なクラッシュを起こすことが配置モード側で確認された。三角形数が
  //   多すぎる場合はエッジ線の生成自体をスキップ＋try/catchの二重の安全網にする。
  function computeEdgesGeometrySafeGuarded(geometry, angleThresholdDeg, triLimit) {
    const idxAttr = geometry.index;
    const triCount = idxAttr ? (idxAttr.count / 3) : (geometry.attributes.position.count / 3);
    if (triCount > (triLimit || 8000)) {
      console.warn('[EDGE-CP] 三角形数が多すぎるため(' + triCount + ')、エッジ線の生成をスキップしました');
      const empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return empty;
    }
    try {
      return computeEdgesGeometrySafe(geometry, angleThresholdDeg);
    } catch (err) {
      console.warn('[EDGE-CP] computeEdgesGeometrySafeが失敗したため、エッジ線なしで続行します:', err);
      const empty = new THREE.BufferGeometry();
      empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      return empty;
    }
  }

function buildFrustumMesh3(f,color){
  const geo=new THREE.BufferGeometry();
  const {positions,indices}=buildFrustumGeometry(f);
  // v0.0013: 空ジオメトリはスキップ
  if(!positions || positions.length === 0 || !indices || indices.length === 0) return null;
  // NaNチェック
  if(Array.from(positions).some(v => isNaN(v))) return null;
  // mm→m
  const posM=new Float32Array(positions.length);
  for(let i=0;i<positions.length;i++)posM[i]=positions[i]*S;
  geo.setAttribute('position',new THREE.BufferAttribute(posM,3));
  geo.setIndex(new THREE.BufferAttribute(indices,1));
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshPhongMaterial({color,opacity:.65,transparent:true,side:THREE.DoubleSide}));
  const eg=computeEdgesGeometrySafeGuarded(geo, 30, 4000);
  const el=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color,opacity:.8,transparent:true}));
  const g=new THREE.Group();g.add(mesh);g.add(el);return g;
}

function initThree_preview(){
  const fs=getAllFrustums();
  const objs=fs.map((f)=>buildFrustumMesh3(f, SHAPE_COLORS_3D[f.color||'blue']||SHAPE_COLORS_3D.blue))
    .filter(Boolean); // v0.0013: null（縮退フラスタム）を除外
  _initThreeBase(objs,fs);
}

// r045: 山留断面用の「粗目の縦格子ハッチ」テクスチャ。UVはメートル/0.4mで
// 正規化済みなので、このテクスチャ自体は1タイル=1縞ぶんのシンプルな柄でよく、
// RepeatWrappingで自然にタイリングされる。
function _buildYamadomeHatchTexture(){
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0,0,64,64);
  ctx.fillStyle = 'rgba(255,120,40,0.95)';
  ctx.fillRect(0, 0, 22, 64); // 縦棒(縞)。残りは透明のまま=粗目の格子に見える
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
async function initThree_watertight(unionGeoms, indivGeoms, frustums, isDoboku, yamadomeOffsetX, yamadomeOffsetY){
  if(!frustums || !frustums.length) return;

  const S_CONV = 0.001;
  const epsilon = 1e-4;

  // 1.【元オブジェクト消去】古い躯体形状(四角)を非表示化
  _initThreeBase([], frustums);

  // 26回目セッション新規: 既存躯体(グレー)は掘削キャビティのunion/押し出し
  // パイプラインには参加させず、常時グレーの独立ブロックとして別途表示する。
  // (地雷回避: buildManifoldUnionGeom/buildSimpleExtrudeGeom内部の重複ヘルパー
  // 群には一切手を入れず、こちらの呼び出し元側でfrustumsを絞るだけに留める)
  const excavFrustumsForMesh = frustums.filter(f => f.color !== 'gray');
  const structFrustumsForMesh = frustums.filter(f => f.color === 'gray');

  // 2. 新・法面外皮（TINメッシュデータ）を呼び出し
  // r035: 課題②対応 — 通常計算(isDoboku=false)は土量計算専用の
  // buildManifoldUnionGeomではなく、独立押し出しジオメトリの
  // buildSimpleExtrudeGeomに分岐させる（土量計算側は無改変）。
  console.log('[CP-5] buildManifoldUnionGeom 呼び出し直前');
  let result = excavFrustumsForMesh.length
    ? (isDoboku
        ? await buildManifoldUnionGeom(excavFrustumsForMesh, isDoboku, yamadomeOffsetX, yamadomeOffsetY)
        : await buildSimpleExtrudeGeom(excavFrustumsForMesh))
    : null;
  console.log('[CP-6] buildManifoldUnionGeom/buildSimpleExtrudeGeom 呼び出し直後 result=', !!result);
  // 26回目セッション新規: 掘削対象オブジェクトが1つも無く(全て既存躯体のみ)、
  // resultがnullでも、既存躯体だけは表示できるよう空の器で処理を継続する。
  if(!result){
    if(!structFrustumsForMesh.length) return;
    result = { positions: new Float32Array(0), cyanIndices: new Uint32Array(0), redIndices: new Uint32Array(0) };
  }

  const pos = result.positions;
  let cyanIdxFinal = result.cyanIndices;
  let redIdxFinal = result.redIndices; // r057: 断面ハッチ用の分類が消滅したため常に空。cleanupNearVertices等の既存シグネチャ維持のためだけに残す

  // v0.0014: 頂点クリーニング（普通モード）— 近接頂点(デフォルト30mm)を結合して
  // 極細スリバー三角形・面を除去する。高精度モードでは無効化。
  let finalPos = pos;
  console.log('[CP-7] cleanupNearVertices 呼び出し前 vertexCleanMode=', window._vertexCleanMode);
  if(window._vertexCleanMode !== 'precise'){
    const cleanResult = cleanupNearVertices(pos, cyanIdxFinal, redIdxFinal, 0.005); // v0.0015: 30mm→5mmに縮小（穴あき対策）
    console.log('[CP-8] cleanupNearVertices 完了');
    finalPos = cleanResult.positions;
    cyanIdxFinal = cleanResult.cyanIndices;
    redIdxFinal = cleanResult.redIndices;

    // r034追記: buildManifoldUnionGeom内で非多様体エッジをTジャンクション修復して
    // 「0本」を確認しても、この後段cleanupNearVertices(5mm結合)がノーチェックで
    // 再び頂点を統合するため、ここで再崩壊していないか改めて検証する。
    (function verifyManifoldAfterCleanup(){
      function ek(i,j){ return i<j ? `${i}_${j}` : `${j}_${i}`; }
      const em = new Map();
      [cyanIdxFinal, redIdxFinal].forEach(idxArr=>{
        for(let t=0;t<idxArr.length;t+=3){
          const tri=[idxArr[t],idxArr[t+1],idxArr[t+2]];
          for(let e=0;e<3;e++){
            const a=tri[e], b=tri[(e+1)%3];
            if(a===b) continue;
            const k=ek(a,b);
            em.set(k,(em.get(k)||0)+1);
          }
        }
      });
      let remain=0, openTop=0;
      const GL_EPS=1e-3;
      em.forEach((cnt,k)=>{
        if(cnt===1){
          const [ia,ib]=k.split('_').map(Number);
          const ya=finalPos[ia*3+1], yb=finalPos[ib*3+1];
          if(Math.abs(ya)<GL_EPS && Math.abs(yb)<GL_EPS){ openTop++; return; }
          remain++;
        }
      });
      console.log(`[POST-CLEANUP-CHECK] cleanupNearVertices(5mm)後: 天端除外${openTop}本, 非多様体候補${remain}本`);
      if(remain>0) console.warn(`[POST-CLEANUP-CHECK] cleanupNearVertices(5mm)が非多様体エッジを再発生させています`);
    })();
  }

  // ── GLB出力用に _lastGeoms を更新 ──────────────────────
  // buildManifoldUnionGeom の頂点はm単位。
  // _lastGeoms は mm単位（exportGLB 内で ×S=0.001 してm変換する）。
  // → 1/S_CONV = 1000 倍してmmに戻す。
  {
    const mergedIdx = new Uint32Array(cyanIdxFinal.length + redIdxFinal.length);
    mergedIdx.set(cyanIdxFinal);
    mergedIdx.set(redIdxFinal, cyanIdxFinal.length);
    const posMm = new Float32Array(finalPos.length);
    for(let i = 0; i < finalPos.length; i++) posMm[i] = finalPos[i] / S_CONV; // m → mm
    _lastGeoms = [{ positions: posMm, indices: mergedIdx }];
  }

  // 26回目セッション新規: 既存躯体(グレー)は配置モードの地面/躯体GLBにも
  // 含める(マスター指示: 体積とは無関係、通常の地面や躯体を表示するのと同じ
  // 段階でオブジェクトを作るだけでよい)。ただし_lastGeoms(掘削シェル本体)には
  // 混ぜない — r051のVoldia_FixedObjects分離と同じ理由(既存躯体は掘削シェルと
  // 接続しない独立ソリッドのため、配置モード側の境界ループ検出の辺カウントを
  // 狂わせる)。完全に別変数_lastExistingStructGeomsに保持し、GLB出力時に
  // 専用ノード(Voldia_ExistingStructure)として分離出力する。
  if(structFrustumsForMesh.length){
    const esPositionsMm = [];
    const esIndicesMm = [];
    structFrustumsForMesh.forEach(f=>{
      const {positions: p, indices: idx} = buildFrustumGeometry({...f, noSlope:true, OD:0});
      if(!p || !p.length || !idx || !idx.length) return;
      const base = esPositionsMm.length / 3;
      for(let i=0;i<p.length;i++) esPositionsMm.push(p[i]);
      for(let i=0;i<idx.length;i++) esIndicesMm.push(idx[i]+base);
    });
    _lastExistingStructGeoms = esPositionsMm.length
      ? [{ positions: new Float32Array(esPositionsMm), indices: new Uint32Array(esIndicesMm) }]
      : [];
  } else {
    _lastExistingStructGeoms = [];
  }

  // r065: cyanGeo/redGeoを別々にcomputeVertexNormals()すると、cyan/red境界にある
  // 共有頂点の法線が「自分の色の三角形群」だけから平均されてしまい、本来滑らかで
  // あるべき稜線に不自然な折れ目が出る（マスター報告のグラデーション異常の原因）。
  // 位置バッファ(finalPos)はcyan/redで共有済みなので、結合トポロジで法線を1回だけ
  // 計算し、両ジオメトリに同じ法線バッファを配布することで解消する。
  console.log('[CP-9] 法線計算用ジオメトリ構築開始 頂点数=', finalPos.length/3);
  const _allIdxForNormals = new Uint32Array(cyanIdxFinal.length + redIdxFinal.length);
  _allIdxForNormals.set(cyanIdxFinal);
  _allIdxForNormals.set(redIdxFinal, cyanIdxFinal.length);
  const _normalCalcGeo = new THREE.BufferGeometry();
  _normalCalcGeo.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  _normalCalcGeo.setIndex(new THREE.BufferAttribute(_allIdxForNormals, 1));
  console.log('[CP-10] computeVertexNormals() 呼び出し直前');
  _normalCalcGeo.computeVertexNormals();
  console.log('[CP-11] computeVertexNormals() 完了');
  const _sharedNormalAttr = _normalCalcGeo.getAttribute('normal');
  // r065(AIS修正案): 法線抽出用の一時BufferGeometryが破棄されずVRAMに残り続け、
  // 3D計算を繰り返すたびにメモリが増大するリークの原因だった。属性抽出後に破棄する。
  _normalCalcGeo.dispose();

  // r025(マスター指示): 高さで色分け(#786108低〜#FFDD81高)した頂点カラーに、
  // flatShading(面ごとの単一法線)で一方向光源による陰影を掛け合わせる。
  // MeshPhongMaterialはvertexColors+flatShadingを同時指定でき、smoothな
  // Phong補間ではなく面単位でパキッとした陰影になる。
  let _minY = Infinity, _maxY = -Infinity;
  for (let i = 1; i < finalPos.length; i += 3) {
    if (finalPos[i] < _minY) _minY = finalPos[i];
    if (finalPos[i] > _maxY) _maxY = finalPos[i];
  }
  const _yRange = Math.max(1e-6, _maxY - _minY);
  const _colLow = [0x78/255, 0x61/255, 0x08/255], _colHigh = [0xff/255, 0xdd/255, 0x81/255];
  const _heightColors = new Float32Array(finalPos.length);
  for (let i = 0, v = 0; i < finalPos.length; i += 3, v++) {
    const t = Math.min(1, Math.max(0, (finalPos[i+1] - _minY) / _yRange));
    _heightColors[i]   = _colLow[0] + (_colHigh[0]-_colLow[0]) * t;
    _heightColors[i+1] = _colLow[1] + (_colHigh[1]-_colLow[1]) * t;
    _heightColors[i+2] = _colLow[2] + (_colHigh[2]-_colLow[2]) * t;
  }

  // (A) 元コーナー頂点のみの面 — 薄いウォームオレンジ
  const cyanGeo = new THREE.BufferGeometry();
  cyanGeo.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  cyanGeo.setAttribute('normal', _sharedNormalAttr);
  cyanGeo.setAttribute('color', new THREE.BufferAttribute(_heightColors, 3));
  cyanGeo.setIndex(new THREE.BufferAttribute(cyanIdxFinal, 1));
  // スライダー現在値を取得
  const _sldrVal = parseInt(document.getElementById('mesh-opacity')?.value||'72')/100;
  // v0.0015: AIS提案③ — polygonOffsetで面をカメラから奥に押しやり、エッジを手前に確実表示
  const _cyanMat = new THREE.MeshPhongMaterial({
    color: 0xffffff, vertexColors: true, flatShading: true,
    emissive: 0x080604, shininess: 12,
    opacity: _sldrVal, transparent: true, side: THREE.DoubleSide,
    depthWrite: _sldrVal >= 0.99, // r053: 不透明時は正しい隠面消去、透過時のみ奥を見せる
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });
  console.log('[CP-12] cyanMesh 生成直前');
  const cyanMesh = new THREE.Mesh(cyanGeo, _cyanMat);
  console.log('[CP-13] cyanMesh 生成完了');

  // (B) 山留による切断面 — r057: Manifold出力三角形の分類をやめ、山留境界線＋
  // バッチ角＋実際の深さから直接組んだ独立オーバーレイ(result.yamadomeOverlay、
  // 配置モードと同じ構築方式)を使う。cyanGeoとは頂点バッファを共有しない
  // (境界線ベースの確定形状なので、共有頂点による法線補間は不要かつ無関係)。
  const _hatchTex = _buildYamadomeHatchTexture();
  const _ydOv = result.yamadomeOverlay;
  // 追加2(2026-08-24 引継ぎ18回目): 配置モードは後から(runCalcとは別タイミングで)
  // 開かれるため、resultのローカル変数のままだと参照できない。openPlacementMode()
  // からも見えるよう、モジュールレベルのグローバルにキャッシュしておく。
  window._lastYamadomeRealYTop = result.yamadomeRealYTop;
  window._lastYamadomeRealYBot = result.yamadomeRealYBot;
  window._lastYamadomeBatterDeg = result.yamadomeBatterDeg;
  window._lastPurpleWalls = result.purpleWallsForPlacement || null; // 6D配置モード反映用
  let redMesh = null;
  if(_ydOv && _ydOv.positions.length > 0){
    const redGeo = new THREE.BufferGeometry();
    redGeo.setAttribute('position', new THREE.BufferAttribute(_ydOv.positions, 3));
    redGeo.setAttribute('uv', new THREE.BufferAttribute(_ydOv.uv, 2));
    redGeo.computeVertexNormals();
    const _redMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, map: _hatchTex, vertexColors: false, flatShading: true,
      emissive: 0x3a1400, shininess: 12,
      // r045: 「デフォルトで半透明(透過値-10くらい)」— updMeshOpacity側で
      // このマテリアルだけ常に-10%オフセットして適用するので、ここでの初期値も揃える。
      opacity: Math.max(0, _sldrVal - 0.1), transparent: true, side: THREE.DoubleSide,
      depthWrite: _sldrVal >= 0.99, // r053: 不透明時は正しい隠面消去、透過時のみ奥を見せる
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    });
    redMesh = new THREE.Mesh(redGeo, _redMat);
    redMesh.userData.hatchMap = _hatchTex; // r045: グラデ⇔ソリッド切替時にマテリアルを丸ごと差し替えてもハッチを維持するための参照
  }
  console.log('[CP-14] redMesh 生成完了 (山留あり=', !!redMesh, ')');

  // 6D(2026-08-28 引継ぎ18回目): 紫(強制垂直)オブジェクトの壁面ハッチ。
  // 山留のredMeshと全く同じ構築パターン(同じハッチテクスチャ・同じ
  // マテリアル設定)を流用し、result.purpleWallOverlayからMeshを作る。
  const _gwOv = result.purpleWallOverlay;
  let purpleWallMesh = null;
  if(_gwOv && _gwOv.positions.length > 0){
    const gwGeo = new THREE.BufferGeometry();
    gwGeo.setAttribute('position', new THREE.BufferAttribute(_gwOv.positions, 3));
    gwGeo.setAttribute('uv', new THREE.BufferAttribute(_gwOv.uv, 2));
    gwGeo.computeVertexNormals();
    const _gwMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, map: _hatchTex, vertexColors: false, flatShading: true,
      emissive: 0x3a1400, shininess: 12,
      opacity: Math.max(0, _sldrVal - 0.1), transparent: true, side: THREE.DoubleSide,
      depthWrite: _sldrVal >= 0.99,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
    });
    purpleWallMesh = new THREE.Mesh(gwGeo, _gwMat);
    purpleWallMesh.userData.hatchMap = _hatchTex;
  }
  console.log('[CP-14b] purpleWallMesh 生成完了 (紫あり=', !!purpleWallMesh, ')');

  // 26回目セッション新規: 既存躯体(グレー)ブロックを1つの結合メッシュとして生成。
  // 「余掘り・法面・捨てコン+砕石は無視、描いた形状そのまま(天端・下端含む)」
  // の仕様どおり、各フラスタムをnoSlope:true・OD:0で上書きしてから
  // buildFrustumGeometry()に渡す(既存のフラスタム押し出しロジックをそのまま流用、
  // 新規の3D生成コードは書かない=地雷回避)。
  // 26回目セッション実機バグ修正: 初回実機確認でrender()が毎フレーム
  // 「bufferData: src: Cannot be null」で落ちる不具合が発覚。redMesh/
  // purpleWallMeshと違いuv属性を付けていなかった点、および空データ時の
  // ガードが甘かった点を疑い、同じ防御(uv属性付与・try/catch)に揃えた。
  let existingStructMesh = null;
  if(structFrustumsForMesh.length){
    try {
      const esPositions = [];
      const esIndices = [];
      structFrustumsForMesh.forEach(f=>{
        const {positions: p, indices: idx} = buildFrustumGeometry({...f, noSlope:true, OD:0});
        if(!p || !p.length || !idx || !idx.length) return;
        const base = esPositions.length / 3;
        for(let i=0;i<p.length;i++) esPositions.push(p[i]*S_CONV);
        for(let i=0;i<idx.length;i++) esIndices.push(idx[i]+base);
      });
      console.log('[CP-14c-pre] existingStructMesh用データ: 頂点数=', esPositions.length/3, ' index数=', esIndices.length);
      if(esPositions.length > 0 && esIndices.length > 0){
        const esGeo = new THREE.BufferGeometry();
        esGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(esPositions), 3));
        // redMesh/purpleWallMeshと同様、uv属性も明示的に付与しておく(ダミー値でよい。
        // mapは使わないが、シェーダ側の#ifdef USE_UV分岐との整合を他メッシュに揃える)。
        esGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((esPositions.length/3)*2), 2));
        // r002根治修正: setIndex()はJS配列(Array.isArray===true)しか自動でBufferAttribute化しない。
        // Uint32Array等のTypedArrayを直接渡すとgeometry.indexが生配列のままになり、
        // レンダラーがindex.onUploadCallback等のBufferAttribute専用プロパティを参照できず
        // 「Uncaught TypeError: e.onUploadCallback is not a function」で毎フレーム描画に失敗する。
        // (このファイル内の他のsetIndex呼び出し箇所は元からBufferAttributeでラップ済みだった)
        esGeo.setIndex(new THREE.BufferAttribute(new Uint32Array(esIndices), 1));
        esGeo.computeVertexNormals();
        const esMat = new THREE.MeshPhongMaterial({
          color: SHAPE_COLORS_3D.gray, opacity: 1, transparent: false, side: THREE.DoubleSide
        });
        existingStructMesh = new THREE.Mesh(esGeo, esMat);
        // r005: マスター提案の対策。既存躯体の天端が掘削シェルの段差・法面頂部と
        // 高さ方向で完全一致すると、掘削側の輪郭線(navyEdges)が既存躯体の面と
        // 同一平面に来てしまい、あたかも躯体の上に線が乗っているように見える
        // (候補①、山留の天端で実際に再現・確認済み)。ここは表示専用のThree.js
        // Mesh位置(position)を1mmだけ持ち上げるだけで、esPositions/esIndices
        // 自体(体積計算・GLB出力データ、_lastExistingStructGeomsは別途独立して
        // structFrustumsForMeshから再計算されるため無関係)は一切変更しない。
        // r008: マスターが実機で確認(カメラをどの角度に回しても常に張り付いて見える)、
        // 掘削シェルの頂点が既存躯体の天端面と1点で座標一致していることによる本物の
        // z-fighting(奥行き競合)だと確定した。1mm(0.001)では、このシーンの標準的な
        // カメラ距離(orR≈50)における深度バッファの精度に対して不十分だったため、
        // 20mm(0.02)まで増量。既存躯体1個のスケールに対しては誤差レベルで視認できない
        // はずだが、深度バッファのz-fightingを確実に避けるには必要な量。
        existingStructMesh.position.y += 0.02;
      }
    } catch(e) {
      console.error('[既存躯体メッシュ生成エラー]', e);
      existingStructMesh = null;
    }
  }
  console.log('[CP-14c] existingStructMesh 生成完了 (既存躯体あり=', !!existingStructMesh, ')');

  // 透過スライダー用にマテリアル参照を更新、スライダー表示
  // 6D: purpleWallMeshも山留redMeshと同様に配列へ追加し、透過スライダー/
  // ソリッド⇔グラデ切替が同じように効くようにする。
  // 26回目セッション新規: existingStructMeshは_extraMeshesに含めない。理由:
  // toggleMeshSolid()のsolidColors/origColorsが3要素決め打ち配列で、4要素目
  // (既存躯体)が来ると配列外参照でフォールバック色になったり、グラデモードは
  // vertexColors:trueを前提とするが既存躯体側には頂点カラーを設定していない
  // ため表示が壊れる(地雷)。既存躯体は「常にグレーの独立表示」という仕様通り、
  // スライダー/ソリッド切替の対象外として扱う。
  const _extraMeshes = [redMesh, purpleWallMesh].filter(Boolean);
  _meshMaterials = [_cyanMat, ..._extraMeshes.map(m=>m.material)];
  _meshObjs = [cyanMesh, ..._extraMeshes]; // r038: ソリッド⇔グラデ切替時のマテリアル差し替え用
  window._meshSolidMode = false; // グラデがデフォルト
  const _opCtrl = document.getElementById('opacity-ctrl');
  if(_opCtrl) _opCtrl.style.display='';

  // v0.0013: ソリッド/グラデ切替ボタン状態をリセット
  const _solidBtn = document.getElementById('btn-solid-toggle');
  if(_solidBtn) _solidBtn.textContent = '🎨 グラデ → ソリッド';

  // v0.0015: AIS提案①②採用
  // ①「1pxの壁」突破: 擬似太線テクニック（同じLineSegmentsを微小オフセットで3回重ね描画）
  // ②対比色: 暖色面に対し「ディープネイビー」をベースに採用（同化を防ぐ）
  const edgesGeo = new THREE.BufferGeometry();
  edgesGeo.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  const allIdx = new Uint32Array(cyanIdxFinal.length + redIdxFinal.length);
  allIdx.set(cyanIdxFinal);
  allIdx.set(redIdxFinal, cyanIdxFinal.length);
  edgesGeo.setIndex(new THREE.BufferAttribute(allIdx, 1));

  console.log('[CP-15] computeEdgesGeometrySafeGuarded 呼び出し直前 頂点数=', finalPos.length/3, 'index数=', allIdx.length);
  // 新7改修(v0091/r081): 旧閾値8000は「300個の四角形テスト」で三角形数8070となり
  // エッジ線が消える不具合として報告されたが、マスター確認の結果「実案件でも
  // 500個規模はあり得る」とのことで、閾値のみ引き上げ対応(30000)。
  // 三角形数の見積り: テスト実測 8070tri/300個 ≒ 26.9tri/個 → 500個で約13,450tri。
  // 安全マージンを見て30000に設定(以前からある try/catch による二重の安全網は
  // そのまま維持されるため、万一超過してもクラッシュはせずエッジ線省略で済む)。
  const _edgeBaseGeo = computeEdgesGeometrySafeGuarded(edgesGeo, 20, 30000);
  console.log('[CP-16] computeEdgesGeometrySafeGuarded 完了 edge頂点数=', _edgeBaseGeo.attributes.position.count);

  // r003で「既存躯体バウンディングボックス内部に収まる線分を間引く」対策を試みたが、
  // 実座標ログ(r007診断)で検証した結果、掘削シェルの頂点が既存躯体の天端面と
  // 1点だけで座標一致しており、線分がボックス内部に収まるケース自体が存在しない
  // (＝この間引き方式では原理的に対応できない)ことが判明したため撤去。
  // r008: マスターが実機で全方位から確認し、視点に依存しない本物のz-fighting
  // (奥行き競合)と確定。対策は既存躯体メッシュ側の表示専用オフセット(下記
  // existingStructMesh.position.y、20mm)に一本化。
  const _edgeMat = new THREE.LineBasicMaterial({
    color: 0x0a1a3a,   // ディープネイビー（暖色面との対比強化）
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false
  });

  // 擬似太線: わずかにスケールアップした複製を重ねて視覚的太さを稼ぐ
  const edgeGroup = new THREE.Group();
  const navyEdges = new THREE.LineSegments(_edgeBaseGeo, _edgeMat);
  navyEdges.renderOrder = 2;
  edgeGroup.add(navyEdges);

  // 擬似太線レイヤー（中心から法線方向に微小押し出し　＝　頂点法線を使わずスケールで近似）
  const _edgeMat2 = _edgeMat.clone();
  _edgeMat2.opacity = 0.6;
  // r002改修: 従来は navyEdgesThick.scale.set() をワールド原点(0,0,0)基準で適用していたため、
  // 敷地の描画座標が原点から離れているほど(実案件では原点から数十m離れることが普通)、
  // スケール分の位置ズレが大きくなり(距離×0.15%)、輪郭線が本来の位置から数cm単位で
  // 浮いて見える不具合の一因になっていた(既存躯体オブジェクトの直近にズレた線が
  // 「乗って見える」現象と一致する可能性が高い)。ジオメトリ自身の重心(センター)を
  // 基準にスケールするよう、複製ジオメトリを重心分だけ原点へ寄せてからobject側の
  // position.copy(center)で元の位置に戻す方式に変更。距離に依存しない正しい太線化になる。
  const _edgeBox = new THREE.Box3().setFromBufferAttribute(_edgeBaseGeo.attributes.position);
  const _edgeCenter = new THREE.Vector3();
  _edgeBox.getCenter(_edgeCenter);
  const _edgeThickGeo = _edgeBaseGeo.clone();
  _edgeThickGeo.translate(-_edgeCenter.x, -_edgeCenter.y, -_edgeCenter.z);
  const navyEdgesThick = new THREE.LineSegments(_edgeThickGeo, _edgeMat2);
  navyEdgesThick.position.copy(_edgeCenter);
  navyEdgesThick.scale.set(1.0015, 1.0015, 1.0015); // ごく僅かに拡大して輪郭を太く見せる(重心基準)
  navyEdgesThick.renderOrder = 1;
  edgeGroup.add(navyEdgesThick);
  _edgeMaterials = [_edgeMat, _edgeMat2]; // r038: 透過スライダー連動用に参照保持
  updMeshOpacity(document.getElementById('mesh-opacity')?.value||'72'); // 初期表示時点の透過値でエッジ輝度も同期

  console.log('[CP-17] group構築・シーン追加直前');
  const group = new THREE.Group();
  group.add(cyanMesh);
  if(redMesh) group.add(redMesh);
  if(purpleWallMesh) group.add(purpleWallMesh);
  if(existingStructMesh) group.add(existingStructMesh);
  group.add(edgeGroup);
  threeS.add(group);
  console.log('[CP-18] threeS.add(group) 完了');

  // メモリ解放（navyEdgesのEdgesGeometryは独立してるのでedgesGeoは解放OK）
  // ただしcyanGeo/redGeoはメッシュが参照してるのでdisposeしない
  // → Three.jsのGCに任せる
  // cyanGeo.dispose(); ← メッシュが参照中なのでNG
  // redGeo.dispose();  ← 同上
  edgesGeo.dispose(); // EdgesGeometryは既にコピー済みなのでOK

  // B5(2026-08-25引継ぎ20回目マスター指示): 通常計算(isDoboku===false)の3Dプレビュー
  // 限定で、面をダブルクリックすると面積を表示する機能。
  // ・通常計算はcalcAll()で全frustumのnoSlopeを強制trueにしており法面が一切
  //   発生しない(=全て垂直な側面 or 水平な天端/床面の2種類の法線のみ)という
  //   マスター確認済みの前提があるため、法線の「なだらかな変化」を考慮した
  //   角度許容は不要で、ほぼ完全一致(浮動小数点誤差吸収の極小epsilonのみ)で
  //   同一平面を判定する。
  // ・「同一平面の集約→外周ループ抽出→2D投影→シューレース公式」という一般的な
  //   多角形面積計算は行わず、隣接判定でつながった三角形群の面積を単純合計する
  //   だけで済む(コプラナー三角形の面積の総和＝その面全体の面積のため、外周を
  //   明示的に求める必要が無い)。
  if(!isDoboku){
    _setupAreaPickOnDblClick(threeR.domElement, threeC, threeS, cyanMesh, finalPos, cyanIdxFinal);
    // ２(2026-08-25引継ぎ22回目マスター指示): 下部の共有toast()だと他の操作トースト
    // (計算完了メッセージ等)と衝突して一瞬で消えてしまうとの指摘のため、画面上部専用の
    // toastTop()に変更。
    toastTop('💡 面をダブルクリックで面積表示できます', 2500);
  } else {
    _teardownAreaPickOnDblClick(threeR.domElement);
  }

  console.log('[CP-19] initThree_watertight 完全終了');
}

// B5(2026-08-25引継ぎ20回目): ダブルクリック面積表示のセットアップ/解除。
// initThree_watertight は再計算のたびに呼ばれメッシュを作り直すため、古い
// リスナー(古いfinalPos/cyanIdxFinalをクロージャで握っている)を確実に外してから
// 新しいものを付け直す。ハンドラ参照はcanvas要素自体に保持し、複数キャンバスが
// 同時に存在しても互いを取り違えないようにする。
function _teardownAreaPickOnDblClick(cv){
  if(cv._areaDblClickHandler){
    cv.removeEventListener('dblclick', cv._areaDblClickHandler);
    cv._areaDblClickHandler = null;
  }
  if(cv._areaClearHandler){
    cv.removeEventListener('mousedown', cv._areaClearHandler);
    cv._areaClearHandler = null;
  }
  _clearAreaHighlight(cv);
}
// 1(2026-08-25引継ぎ21回目): ハイライトmeshの除去。scene参照はcv側に保持しておき、
// テアダウン時にscene再取得の引数を要求しないで済むようにする。
function _clearAreaHighlight(cv){
  if(cv._areaHighlightMesh){
    const scene = cv._areaHighlightScene;
    if(scene) scene.remove(cv._areaHighlightMesh);
    cv._areaHighlightMesh.geometry.dispose();
    cv._areaHighlightMesh.material.dispose();
    cv._areaHighlightMesh = null;
  }
}
// ３(2026-08-25引継ぎ21回目): クリップボードコピー。file://で開いている場合など
// navigator.clipboard自体が使えない/権限が無い環境向けに、隠しtextarea+
// execCommand('copy')のフォールバックも用意しておく。
function _copyTextToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).catch(()=>_copyViaExecCommand(text));
  }
  return Promise.resolve(_copyViaExecCommand(text));
}
function _copyViaExecCommand(text){
  try{
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(e){ return false; }
}
function _setupAreaPickOnDblClick(cv, camera, scene, mesh, pos, idx){
  _teardownAreaPickOnDblClick(cv);
  cv._areaHighlightScene = scene;

  function triNormal(ia, ib, ic){
    const ax=pos[ia*3],ay=pos[ia*3+1],az=pos[ia*3+2];
    const bx=pos[ib*3],by=pos[ib*3+1],bz=pos[ib*3+2];
    const cx=pos[ic*3],cy=pos[ic*3+1],cz=pos[ic*3+2];
    const v1x=bx-ax,v1y=by-ay,v1z=bz-az, v2x=cx-ax,v2y=cy-ay,v2z=cz-az;
    let nx=v1y*v2z-v1z*v2y, ny=v1z*v2x-v1x*v2z, nz=v1x*v2y-v1y*v2x;
    const len=Math.hypot(nx,ny,nz)||1;
    return [nx/len, ny/len, nz/len];
  }
  function triArea(ia, ib, ic){
    const ax=pos[ia*3],ay=pos[ia*3+1],az=pos[ia*3+2];
    const bx=pos[ib*3],by=pos[ib*3+1],bz=pos[ib*3+2];
    const cx=pos[ic*3],cy=pos[ic*3+1],cz=pos[ic*3+2];
    const v1x=bx-ax,v1y=by-ay,v1z=bz-az, v2x=cx-ax,v2y=cy-ay,v2z=cz-az;
    const nx=v1y*v2z-v1z*v2y, ny=v1z*v2x-v1x*v2z, nz=v1x*v2y-v1y*v2x;
    return 0.5*Math.hypot(nx,ny,nz); // finalPosはm単位なのでそのままm²
  }

  // 辺(頂点ペア)→それを共有する三角形番号のリスト、を一度だけ構築
  const edgeMap = new Map();
  const triCount = idx.length/3;
  for(let t=0;t<triCount;t++){
    const a=idx[t*3], b=idx[t*3+1], c=idx[t*3+2];
    const es=[[a,b],[b,c],[c,a]];
    for(const [p,q] of es){
      const key = p<q ? (p+'_'+q) : (q+'_'+p);
      let arr = edgeMap.get(key);
      if(!arr){ arr=[]; edgeMap.set(key,arr); }
      arr.push(t);
    }
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const NORMAL_DOT_EPS = 0.99999; // ほぼ完全一致のみ許容(法面が無い前提のため角度許容は不要)

  // 1A(2026-08-25引継ぎ21回目マスター指示): ダブルクリックした面を青く強調表示。
  // 選択三角形群だけを抜き出した「非共有・独立バッファ」の別メッシュを重ねる方式
  // (元メッシュ(cyanGeo)とposition配列を共有すると、このハイライトmeshをdispose()
  // した時に共有バッファ側のGPUリソースまで巻き添えで破棄されるおそれがあるため、
  // 座標を複製した専用バッファにして安全に使い回す)。
  function buildHighlightMesh(triSet){
    const hlPos = new Float32Array(triSet.size*9);
    let w=0;
    triSet.forEach(t=>{
      for(let k=0;k<3;k++){
        const vi = idx[t*3+k];
        hlPos[w++]=pos[vi*3]; hlPos[w++]=pos[vi*3+1]; hlPos[w++]=pos[vi*3+2];
      }
    });
    const hlGeo = new THREE.BufferGeometry();
    hlGeo.setAttribute('position', new THREE.BufferAttribute(hlPos,3));
    const hlMat = new THREE.MeshBasicMaterial({
      color: 0x2196f3, transparent:true, opacity:0.85, side:THREE.DoubleSide,
      depthTest:true, polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4
    });
    return new THREE.Mesh(hlGeo, hlMat);
  }

  function handler(e){
    const rect = cv.getBoundingClientRect();
    ndc.x = ((e.clientX-rect.left)/rect.width)*2-1;
    ndc.y = -((e.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    if(!hits.length) return;
    const startTri = hits[0].faceIndex;
    const a0=idx[startTri*3], b0=idx[startTri*3+1], c0=idx[startTri*3+2];
    const startN = triNormal(a0,b0,c0);

    const visited = new Set([startTri]);
    const queue=[startTri];
    let totalArea=0;
    while(queue.length){
      const t = queue.pop();
      const a=idx[t*3], b=idx[t*3+1], c=idx[t*3+2];
      totalArea += triArea(a,b,c);
      const es=[[a,b],[b,c],[c,a]];
      for(const [p,q] of es){
        const key = p<q ? (p+'_'+q) : (q+'_'+p);
        const neighbors = edgeMap.get(key);
        if(!neighbors) continue;
        for(const nt of neighbors){
          if(visited.has(nt)) continue;
          const na=idx[nt*3], nb=idx[nt*3+1], nc=idx[nt*3+2];
          const nn = triNormal(na,nb,nc);
          const dot = startN[0]*nn[0]+startN[1]*nn[1]+startN[2]*nn[2];
          if(dot > NORMAL_DOT_EPS){ visited.add(nt); queue.push(nt); }
        }
      }
    }

    _clearAreaHighlight(cv);
    const hlMesh = buildHighlightMesh(visited);
    scene.add(hlMesh);
    cv._areaHighlightMesh = hlMesh;

    const areaStr = totalArea.toFixed(3);
    _copyTextToClipboard(areaStr).then(()=>{
      // r089(24回目・追加修正・項目6): 三角形の単純合計による近似値のため、
      // 表示にのみ「≒」を付ける(1%程度の誤差があり得るため)。クリップボードに
      // コピーする数値自体はExcel等への貼り付けを考慮しそのまま(無印)にする。
      toast(`📐 面積: ≒${areaStr} m²（三角形${visited.size}枚を集約）／クリップボードにコピーしました`, 3000);
    });
  }
  cv._areaDblClickHandler = handler;
  cv.addEventListener('dblclick', handler);

  // 1A(2026-08-25引継ぎ21回目マスター指示): 「他の場所を1回でもクリックしたら
  // 元に戻す(中クリックでは解除されない)」。中クリック=マウスホイールクリック
  // (e.button===1)の時だけ除外し、それ以外のボタンでのmousedownでハイライトを消す。
  // (パン操作は本ファイルではbutton===2=右クリックに割り当てられているが、
  //  マスター指示の「中クリックでは消えない」を素直に反映し、button===1だけを除外する)
  function clearHandler(e){
    if(e.button === 1) return;
    _clearAreaHighlight(cv);
  }
  cv._areaClearHandler = clearHandler;
  cv.addEventListener('mousedown', clearHandler);
}

function _initThreeBase(objects,frustums){
  disposeThree();
  const pane=document.getElementById('c3d-pane');if(!pane||!window.THREE)return;
  const W=pane.clientWidth,H=pane.clientHeight;
  // r010根治修正: near/far比率の縮小(r009)だけでは、実際の敷地スケール(数十m)での
  // 深度精度不足を解消しきれなかった(マスター実機確認: 中距離でもまだz-fighting発生)。
  // near/farを数値でいじり続けるのは対症療法的なので、Three.js側が公式に提供している
  // 「対数深度バッファ」に切り替える。これはnear/far比が大きいシーンでの深度精度不足を
  // 解決するための標準機能で、通常の(線形/1÷z型の)深度バッファと違い、カメラからの
  // 距離に対してより均等に精度を配分できる。z-fightingへの本質的な対策になるはず。
  threeR=new THREE.WebGLRenderer({antialias:true, logarithmicDepthBuffer:true});
  threeR.setPixelRatio(Math.min(devicePixelRatio,2));threeR.setSize(W,H);threeR.setClearColor(0x06080c);
  pane.appendChild(threeR.domElement);
  // r009根治修正: マスターがカメラ距離依存(遠いと線が出る・近づくと消える)を実機確認、
  // これは既存躯体との1点z-fighting(r008)そのものではなく、カメラのnear/far設定
  // (near=0.001, far=1e6 → 比率10億:1)が原因の深度バッファ精度不足だったと判明。
  // near/farの比率が大きいほど、特に遠距離でのZ値の実効精度が急激に悪化する
  // (パースペクティブ投影の深度バッファは非線形で、遠いほど1刻みが粗くなる)。
  // 実際の現場データは数十〜数百mスケールで収まるため、near=0.01(1cm)・
  // far=100000(100km、通常ありえないレベルまで余裕を持たせた値)に縮小し、
  // 比率を10億:1→1000万:1(約100倍改善)にした。ズームイン下限(orR最小0.001)
  // は変更していないため、実用上ズームインし過ぎて近接クリップされることは無いはず。
  threeS=new THREE.Scene();threeC=new THREE.PerspectiveCamera(45,W/H,.01,1e5);
  threeS.add(new THREE.AmbientLight(0xffffff,.45));
  const dl=new THREE.DirectionalLight(0xffffff,.8);dl.position.set(1,2,1).normalize();threeS.add(dl);
  objects.forEach(o=>threeS.add(o));
  if(frustums && frustums.length > 0){
    let sx=0,sz=0,maxD=0,ax1=Infinity,ax2=-Infinity,az1=Infinity,az2=-Infinity;
    frustums.forEach(f=>{sx+=(f.x1+f.x2)/2;sz+=(f.y1+f.y2)/2;maxD=Math.max(maxD,f.D);
      ax1=Math.min(ax1,f.x1-(f.noSlope?0:f.D));ax2=Math.max(ax2,f.x2+(f.noSlope?0:f.D));
      az1=Math.min(az1,f.y1-(f.noSlope?0:f.D));az2=Math.max(az2,f.y2+(f.noSlope?0:f.D));});
    orCX=sx/frustums.length*S; orCZ=sz/frustums.length*S; orCY=-maxD/2*S;
    const spanX=(ax2-ax1)*S,spanZ=(az2-az1)*S;
    const grid=new THREE.GridHelper(Math.max(spanX,spanZ)*1.8,30,0x4fc3f7,0x2a2f3d);
    grid.position.set(orCX,0,orCZ);grid.material.opacity=.3;grid.material.transparent=true;threeS.add(grid);
    threeGrid=grid;
    threeGrid.visible = window._baseGridVisible === true; // r072マスター指示: デフォルトOFFに変更
    orR=Math.max(spanX,spanZ,maxD*S)*3;
  } else {
    orCX=0; orCY=0; orCZ=0; orR=50;
  }
  updOrbit3();
  const cv=threeR.domElement;
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  cv.addEventListener('mousedown',e=>{
    if(e.button===2){pan3={x:e.clientX,y:e.clientY,cx:orCX,cy:orCY,cz:orCZ};return;}
    drag3={x:e.clientX,y:e.clientY,th:orTh,ph:orPh};
  });
  cv.addEventListener('mousemove',e=>{
    if(pan3){
      const dx=(e.clientX-pan3.x)*orR*0.0015;
      const dy=(e.clientY-pan3.y)*orR*0.0015;
      const ct=Math.cos(orTh),st=Math.sin(orTh); const cp=Math.cos(orPh);
      orCX=pan3.cx-dx*st+dy*cp*ct; orCZ=pan3.cz+dx*ct+dy*cp*st; orCY=pan3.cy+dy*Math.sin(orPh);
      updOrbit3();return;
    }
    if(!drag3)return;
    orTh=drag3.th+(e.clientX-drag3.x)*.006;
    orPh=Math.max(.05,Math.min(Math.PI*.85,drag3.ph-(e.clientY-drag3.y)*.006));
    updOrbit3();
  });
  cv.addEventListener('mouseup',()=>{drag3=null;pan3=null;});
  cv.addEventListener('mouseleave',()=>{drag3=null;pan3=null;});
  cv.addEventListener('wheel',e=>{e.preventDefault();orR*=e.deltaY<0?.9:1.1;orR=Math.max(.001,orR);updOrbit3();},{passive:false});
 (function loop(){
    threeAnim = requestAnimationFrame(loop);
    if(threeR && document.getElementById('calc-modal').classList.contains('show')){
      _sortTransparentTriangles();
      try{
        threeR.render(threeS, threeC);
      }catch(renderErr){
        // r002: render()内で予期しない例外が出た場合の安全装置(特定バグ用の対処療法ではなく、
        // 「毎フレーム例外を吐き続けてブラウザがフリーズする」事態そのものを防ぐ汎用ガード)。
        // 原因調査用に各メッシュのBufferAttributeが正規のインスタンスか診断ログを出し、
        // それ以上render()を呼ばないようループを止める。
        console.error('[RENDER-CRASH] threeR.render()で例外発生。ループを停止します:', renderErr);
        if(threeS){
          threeS.traverse(function(obj){
            if(!obj.isMesh || !obj.geometry) return;
            const geo = obj.geometry;
            const info = {};
            ['position','uv','normal'].forEach(function(name){
              const attr = geo.getAttribute(name);
              info[name] = attr ? {
                isBufferAttribute: attr.isBufferAttribute===true,
                arrayIsTypedArray: ArrayBuffer.isView(attr.array),
                count: attr.count,
                arrayLength: attr.array ? attr.array.length : null,
                itemSize: attr.itemSize
              } : '(なし)';
            });
            const idx = geo.index;
            info.index = idx ? {
              isBufferAttribute: idx.isBufferAttribute===true,
              arrayIsTypedArray: ArrayBuffer.isView(idx.array || idx),
              count: idx.count,
              arrayLength: (idx.array || idx).length
            } : '(なし)';
            console.error('[RENDER-CRASH] mesh=', obj.name || '(no name)', info);
          });
        }
        if(threeAnim){ cancelAnimationFrame(threeAnim); threeAnim=null; }
        console.error('[RENDER-CRASH] アニメーションループを停止しました。上記ログを開発者に共有してください。');
      }
    }
  })();
}
// r054: 透過描画の深度ソート
// depthWrite:falseの状態(op<100%)では、同一メッシュ内の三角形はインデックス順の
// まま描画され、カメラ視点によっては奥の面が手前の面より後に描画されて上書きされる。
// これにより「100%→99%で見た目が急変し、90%〜30%の間はなだらかに変化しない」という
// 不自然さが出ていた。ここでは透過が有効なメッシュについて、毎フレーム(カメラが
// 動いた時のみ)三角形をカメラからの距離順(遠い→近い)にソートし直し、通常の
// アルファブレンディングが正しい順序で積み重なるようにする。
// 不透明時(op>=0.99、天端が正しく隠面消去される必要がある場合)はdepthWrite:trueの
// 通常描画に任せ、ソート処理はスキップする。
let _lastSortCamPos = null;
function _sortTransparentTriangles(){
  if(!_meshObjs || !_meshObjs.length || !threeC) return;
  const camPos = threeC.position;
  if(_lastSortCamPos && camPos.distanceToSquared(_lastSortCamPos) < 1e-8) return;
  if(!_lastSortCamPos) _lastSortCamPos = camPos.clone(); else _lastSortCamPos.copy(camPos);

  _meshObjs.forEach(mesh=>{
    if(!mesh || !mesh.geometry || !mesh.geometry.index) return;
    const mat = mesh.material;
    if(!mat || !mat.transparent || mat.opacity >= 0.99) return; // 不透明時はソート不要

    const geo = mesh.geometry;
    const indexAttr = geo.index;
    const index = indexAttr.array;
    const posAttr = geo.attributes.position;
    const triCount = (index.length / 3) | 0;
    if(triCount < 2) return;

    const triDist = new Float64Array(triCount);
    for(let t=0; t<triCount; t++){
      const i0=index[t*3], i1=index[t*3+1], i2=index[t*3+2];
      const cx = (posAttr.getX(i0)+posAttr.getX(i1)+posAttr.getX(i2))/3;
      const cy = (posAttr.getY(i0)+posAttr.getY(i1)+posAttr.getY(i2))/3;
      const cz = (posAttr.getZ(i0)+posAttr.getZ(i1)+posAttr.getZ(i2))/3;
      const dx=cx-camPos.x, dy=cy-camPos.y, dz=cz-camPos.z;
      triDist[t] = dx*dx+dy*dy+dz*dz;
    }
    // ★ Array.prototype.sort.call(typedArray, ...) は行儀が良くない書き方だったため、
    //   普通の配列でソートしてから書き戻す素直な実装に変更(安全側の保険)
    let order = [];
    for(let t=0;t<triCount;t++) order.push(t);
    order.sort((a,b)=>triDist[b]-triDist[a]);

    const newIndex = new index.constructor(index.length);
    for(let t=0; t<triCount; t++){
      const srcT = order[t];
      newIndex[t*3]   = index[srcT*3];
      newIndex[t*3+1] = index[srcT*3+1];
      newIndex[t*3+2] = index[srcT*3+2];
    }
    index.set(newIndex);
    indexAttr.needsUpdate = true;
  });
}
function updOrbit3(){if(!threeC)return;const sp=Math.sin(orPh),cp=Math.cos(orPh),st=Math.sin(orTh),ct=Math.cos(orTh);threeC.position.set(orCX+orR*sp*ct,orCY+orR*cp+Math.abs(orCY),orCZ+orR*sp*st);threeC.lookAt(orCX,orCY,orCZ);}
function disposeThree(){
  if(threeAnim){cancelAnimationFrame(threeAnim); threeAnim=null;}
  if(threeS){
    threeS.traverse(node => {
      if (node.isMesh || node.isLineSegments) {
        if (node.geometry) {
          try { node.geometry.dispose(); } catch(e){}
        }
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach(m => { try{ m.dispose(); }catch(e){} });
          } else {
            try { node.material.dispose(); } catch(e){}
          }
        }
      }
    });
    threeS = null;
  }
  if(threeR){
    const cv=threeR.domElement;
    if(cv.parentNode) cv.parentNode.removeChild(cv);
    try { threeR.dispose(); } catch(e){}
    threeR=null;
  }
  threeC=null;
  threeGrid=null; // r035: シーン破棄時に参照もクリア（次回生成時に再取得される）
  _meshObjs=[]; _edgeMaterials=[]; // r038: シーン破棄時にメッシュ/エッジ参照もクリア（次回生成時に再取得される）
}

// ────────────────────────────────────────────────────────────────

// r035: 基準高さ(GL=y0)メッシュの表示ON/OFF切替
// 「戻る」ボタンの隣に配置。トグル状態はwindow._baseGridVisibleに保持し、
// 3D再構築（再計算）をまたいでも表示状態を引き継ぐ。
function toggleBaseGridVisibility(){
  window._baseGridVisible = !(window._baseGridVisible === true); // r072: デフォルトOFF前提の安全なトグルに変更
  if(threeGrid){ threeGrid.visible = window._baseGridVisible; }
  const btn = document.getElementById('btn-base-grid-toggle');
  if(btn){
    btn.textContent = window._baseGridVisible ? '▦ メッシュ ON' : '▦ メッシュ OFF';
    btn.style.opacity = window._baseGridVisible ? '1' : '.5';
  }
}

// r062: 3Dイメージ画面のスクショボタン共通ハンドラ。
// SHIFT+CTRLを押しながらのクリックはBlenderでの体積妥当性確認用に
// GLB保存を行う隠しデバッグ機能(通常のスクショはそのまま)。
// exportGLB()は現在計算中のUnion水密メッシュをその場でGLBとして書き出す
// 既存関数(元はvoldiaConfirmGLB経由のLandXML確認ダイアログ付きで使用)を
// デバッグ用途としてダイアログなしで直接呼び出す。
function handleCalc3DScreenshotClick(e){
  if(e && e.shiftKey && e.ctrlKey){
    toast('📦 [デバッグ] GLB保存中...');
    exportGLB();
    return;
  }
  screenshotCalc3D();
}

// r059: 3Dプレビューのスクリーンショット保存。requestAnimationFrameの
// 継続描画ループに依存せず確実に最新フレームを取得するため、キャプチャ直前に
// 明示的に1回render()してからtoDataURL()する(preserveDrawingBuffer不要)。
function screenshotCalc3D(){
  if(!threeR || !threeS || !threeC){ toast('⚠️ 3Dプレビューが準備できていません'); return; }
  try {
    threeR.render(threeS, threeC);
    const dataUrl = threeR.domElement.toDataURL('image/png');
    const ts = new Date();
    const pad = n => String(n).padStart(2,'0');
    const fname = `Voldia_3D_${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.png`;
    const a = document.createElement('a');
    a.href = dataUrl; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('📷 スクリーンショットを保存しました');
  } catch(e) {
    console.error('[SCREENSHOT] 保存失敗', e);
    toast('⚠️ スクリーンショットの保存に失敗しました');
  }
}
// ────────────────────────────────────────────────────────────────
//  buildManifoldUnionGeom v0.0010
//  【Vertex-First Triangle Fill 方式】
//
//  内壁を「消す」のではなく「最初から生成しない」設計。
//
//  Step1: 各錐台の天端・底面コーナー頂点を収集
//  Step2: 錐台ペア間の貫入交点を完全抽出
//         - 天端輪郭×天端輪郭 → getPolygonIntersections（2D平面）
//         - 底面エッジ×他錐台の法面三角形 → Möller-Trumbore（3D）
//         - 法面台形×他錐台の法面台形 → Möller-Trumbore（3D）
//  Step3: 各パネル（天端・底面・法面）輪郭に交点を辺上t値ソートで挿入
//  Step4: earcut三角分割 → 重心でisPointInsideFrustumExcavation判定
//         内部に埋まる面は除去（isDead=true）
//  Step5: THREE.BufferGeometry生成
//
//  戻り値: { positions, cyanIndices, redIndices }
//    cyan = 元のコーナー頂点だけで構成される面（無傷な外壁）
//    red  = 貫入交点を含む面（境界処理済みの新規面）
// ────────────────────────────────────────────────────────────────

// ████████████████████████████████████████████████████████████████
// ██  SECTION 5: 3Dメッシュ生成エンジン ★バグ修正対象          ██
// ██  cleanupNearVertices / buildManifoldUnionGeom               ██
// ██  _intersectPolyWithFrustum / isPointInsideFrustumExcavation ██
// ████████████████████████████████████████████████████████████████
// ================================================================
// v0.0014: 近接頂点クリーニング（普通モード用）
// 30mm（デフォルト）以内の頂点をマージし、極細スリバー面を解消する。
// 空間ハッシュで近傍探索 → 代表頂点に統合 → インデックス再マッピング。
// ================================================================
function cleanupNearVertices(positions, cyanIndices, redIndices, threshM){
  const n = positions.length / 3;
  if(n === 0) return {positions, cyanIndices, redIndices};

  const cellSize = threshM;
  const grid = new Map(); // "ix_iy_iz" -> [vertexIdx,...]
  const cellOf = (x,y,z) => `${Math.floor(x/cellSize)}_${Math.floor(y/cellSize)}_${Math.floor(z/cellSize)}`;

  // 各頂点をグリッドに登録
  for(let i=0;i<n;i++){
    const x=positions[i*3], y=positions[i*3+1], z=positions[i*3+2];
    const key=cellOf(x,y,z);
    if(!grid.has(key)) grid.set(key,[]);
    grid.get(key).push(i);
  }

  // union-find で近接頂点をグループ化
  const parent = new Int32Array(n);
  for(let i=0;i<n;i++) parent[i]=i;
  function find(a){ while(parent[a]!==a){ parent[a]=parent[parent[a]]; a=parent[a]; } return a; }
  function union(a,b){ const ra=find(a), rb=find(b); if(ra!==rb) parent[ra]=rb; }

  const thr2 = threshM*threshM;
  for(let i=0;i<n;i++){
    const x=positions[i*3], y=positions[i*3+1], z=positions[i*3+2];
    const cx=Math.floor(x/cellSize), cy=Math.floor(y/cellSize), cz=Math.floor(z/cellSize);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const key=`${cx+dx}_${cy+dy}_${cz+dz}`;
      const bucket=grid.get(key);
      if(!bucket) continue;
      for(const j of bucket){
        if(j<=i) continue;
        const ddx=positions[j*3]-x, ddy=positions[j*3+1]-y, ddz=positions[j*3+2]-z;
        if(ddx*ddx+ddy*ddy+ddz*ddz <= thr2) union(i,j);
      }
    }
  }

  // 代表頂点（各グループの最初の頂点座標を使用）と新インデックス採番
  const rootToNewIdx = new Map();
  const newPositions = [];
  const remap = new Int32Array(n);
  for(let i=0;i<n;i++){
    const r = find(i);
    if(!rootToNewIdx.has(r)){
      const newIdx = newPositions.length/3;
      newPositions.push(positions[r*3], positions[r*3+1], positions[r*3+2]);
      rootToNewIdx.set(r, newIdx);
    }
    remap[i] = rootToNewIdx.get(r);
  }

  // インデックス再マッピング + 縮退三角形除去
  function remapAndFilter(idxArr){
    const out=[];
    for(let t=0;t<idxArr.length;t+=3){
      const a=remap[idxArr[t]], b=remap[idxArr[t+1]], c=remap[idxArr[t+2]];
      if(a===b || b===c || a===c) continue; // マージで縮退した三角形は除外
      out.push(a,b,c);
    }
    return new Uint32Array(out);
  }

  return {
    positions: new Float32Array(newPositions),
    cyanIndices: remapAndFilter(cyanIndices),
    redIndices: remapAndFilter(redIndices)
  };
}

// ★ 3Dエンジンバージョン（修正のたびに+1すること）

// ════════════════════════════════════════════════════════════
//  r036: classifyPathsSafe — ClipperLibのPolyTree機能を使った
//  堅牢なouter/holes分類。従来のclassifyPaths(pointInPolyベースの
//  偶数/奇数深さ判定)より、穴の中に島があるような複雑なケースでも
//  正確に処理できる。buildSimpleExtrudeGeom(通常計算)専用。
//  土量計算側(buildManifoldUnionGeomの既存classifyPaths呼び出し)は
//  無改変のため、このファイルにはclassifyPathsSafeとして別名で追加し、
//  既存のclassifyPathsとは完全に独立させている。
// ════════════════════════════════════════════════════════════
function classifyPathsSafe(rawPaths, SF) {
  if (!rawPaths || rawPaths.length === 0) return [];
  const cl = new ClipperLib.Clipper();
  cl.StrictlySimple = true;
  for (const path of rawPaths) {
    cl.AddPath(path, ClipperLib.PolyType.ptSubject, true);
  }
  const tree = new ClipperLib.PolyTree();
  cl.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

  const result = [];
  function processNode(node) {
    const childs = node.Childs();
    for (let i = 0; i < childs.length; i++) {
      const outerNode = childs[i];
      const outerPts = outerNode.Contour().map(p => ({ x: p.X / SF, y: p.Y / SF }));
      const holesPts = [];
      const holeChilds = outerNode.Childs();
      for (let j = 0; j < holeChilds.length; j++) {
        const holeNode = holeChilds[j];
        holesPts.push(holeNode.Contour().map(p => ({ x: p.X / SF, y: p.Y / SF })));
        processNode(holeNode);
      }
      result.push({ outer: outerPts, holes: holesPts });
    }
  }
  processNode(tree);
  return result;
}
const VOLDIA3D_VER = "Voldia-3D-r029(base:VoldiaM r069)";
// ⚠️ 注記(セッション16): このVOLDIA3D_VER定数が示す通り、以下しばらくの区間には
// 分岐元アプリ「VoldiaM」(開発版・姉妹アプリ)のコードとコメントがそのまま
// 引き継がれている。コメント中の「rXX」「問題3/5」「Site A/Site C」「21〜27回目
// 引継ぎ・セッション」等はVoldiaM側の独自の版数・セッション通番であり、本ファイル
// (Voldia本体、現在r060)の版数とは無関係(たまたま番号が衝突することがあるが偶然)。
// 将来VoldiaMとの統合可能性がゼロではないため、内容はそのまま残置する。

// ════════════════════════════════════════════════════════════
//  r060: 24回目セッション・マスター実機確認結果への対応（進行中）
//  ────────────────────────────────────────────────────────
//  【実機確認結果1】問題５-B.vold通常計算(normal)モードの3D表示は
//  一見OKだが内部にスリバー(細長い縮退気味の三角形)が大量に集中している
//  箇所がある、との報告(通常.csv・通常の画像.png)。実測(CSVの三角形841枚
//  を面積・アスペクト比で解析)で、真のスリバー(アスペクト比0.01未満、
//  最長辺に対して面積が極端に小さい)が152枚(全体の18%)、うち多数が
//  面積ほぼ完全0の縮退三角形だったことを確認。
//
//  【原因】collapseSliverEdges(量子化グリッドの継ぎ目に生じる極小辺を
//  隣接スリバーごと統合するポスト処理、r047でdoboku側=
//  buildManifoldUnionGeomに導入)が、buildSimpleExtrudeGeom(通常計算)側
//  には一切移植されていなかった(地雷25違反)。r059でconcave-clip対応を
//  移植した際、この既存の非対称性の存在に気づかず見落としていた。
//
//  【対策】collapseSliverEdgesをbuildSimpleExtrudeGeom側にdoboku側と
//  完全同一ロジックで移植(repairTJunctions後、returnの直前に追加)。
//  ハーネス検証(問題５-B.vold, normal): 三角形数841→381に整理され、
//  スリバー(比<0.01)は146→95枚に減少。ただし完全ゼロにはならず、
//  残存95枚のうち一部は「量子化グリッド継ぎ目」由来ではなく辺長が
//  50mm閾値を超える(=collapseSliverEdgesの対象外)ケースと推測される。
//  これは新しく正しく生成されるようになった凹みクリップ境界の
//  earcut三角形分割自体の品質問題である可能性が高く、次回要調査
//  (r055-057でdoboku側に施した対策の追加チューニングが必要かもしれない)。
//
//  【実機確認結果2・未対応】マスターが問題５のオブジェクト2つを両方
//  noSlope(垂直)にした新規ケース(問題５-C、寸法は問題５-Bとは別物、
//  D=1610mm/1910mm程度)で、doboku(土量)モードの内壁の一部
//  (「柱」形状の側壁のうち1面)が正しい位置から外れて飛び出す不具合を
//  実機で確認(問題５_C.png)。実機エクスポートCSV(土量.csv、93三角形)を
//  解析した結果、メッシュ自体は非多様体エッジ0本・スリバーもほぼ無し
//  (トポロジー的には健全)なため、「三角形分割の質」の問題ではなく、
//  「両方のフラスタムがnoSlope(=お互いに凹み形状でありうる)」という
//  新しい組み合わせにおける_getFrustumPlanes/_isConvexPolygon2D
//  判定または凹みグリッドクリップの座標計算そのものに、まだ捕捉できて
//  いないバグが残っている可能性が高い。
//  ⚠️ 該当の.voldファイル(問題５-C)が未提供のため、次回セッションで
//  ハーネス再現・原因調査が必要(マスターに問題５-C.voldの提供を依頼済み)。
//
//  【現状(24回目セッション実機確認後)】
//  ・通常計算(normal)側のスリバー問題は大幅改善(対策済み、完全解消は未確認)。
//  ・doboku側「両方垂直」ケースの内壁飛び出しは未解決、原因調査に
//    問題５-C.voldの提供待ち。
//  ・上記以外(問題５.vold・問題５-B.vold単体noSlopeのケース)は
//    r059の内容から変更なし。
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  r059: 問題5-B性能問題の解消 + buildSimpleExtrudeGeomへの
//        凹みフラスタム対応移植（23回目引継ぎ受け・24回目セッション）
//  ────────────────────────────────────────────────────────
//  【問題5-B(27秒/非多様体1本残存)の真因】
//  デバッグ計測(window._debugConcaveClip)の結果、27秒のうち92%が
//  _intersectPolyWithFrustumConcave内のClipperLib UNION自体だと判明
//  (グリッド判定・point-in-polyループは合計200ms未満で無罪)。
//  内側判定された数万個のセルを1個ずつ独立した4頂点パスとしてUNIONに
//  渡していたため、Clipperの計算量が爆発していた
//  (f0がnoSlope=垂直になったことで、壁パネルがf1の凹み範囲と
//  全高さで重なるようになり、内側セル数が4〜5万個規模に急増したのが
//  引き金)。
//
//  【対策1】contourOf(other, zMm)のメモ化キャッシュを追加。同一
//  フラスタムの複数壁パネル(j違い)がbY/tY共通のため同一zMm列を
//  問い合わせる冗長性を除去(効果は実測わずか、主犯ではなかったが
//  無駄な重複計算そのものなので削除して問題ない)。
//
//  【対策2(本命)】ClipperLibへ渡す前に、同一行(t固定)内で隣接する
//  内側セルをランレングス結合して1本の矩形にまとめてからUNIONする。
//  判定ロジック・各セルの内外判定結果は一切変更せず、Clipperへ渡す
//  パスの「まとめ方」だけを変える最適化。
//  効果(問題５-B.vold, doboku): 25.3秒→0.89秒(約28倍)。しかも
//  副次効果として残存非多様体エッジも1本→0本に解消(境界がジグザグの
//  数万頂点から滑らかな少数矩形の輪郭になったことで、後段のWELD処理が
//  より安定したと推測)。問題５.vold側への回帰なし(0.53秒→0.36秒、
//  非多様体0本のまま)。
//  ※地雷25: WELD-RESIDUAL経由での「非多様体0本」到達である点は
//  r058までと変わらず未確定要素。Node側の結果は依然として仮説であり、
//  マスターの実機確認が必要。
//
//  【buildSimpleExtrudeGeom(通常計算側)への移植】
//  地雷25(両関数への同等修正の徹底)に基づき、r058で
//  buildManifoldUnionGeom側に実装した凹みフラスタム対応一式
//  (_isConvexPolygon2D/_pointInPolySimple/_clipPolyByPlanes/
//  _intersectPolyWithFrustumConcave/dispatcher版_intersectPolyWithFrustum)
//  と、上記【対策1】【対策2】の性能最適化を、buildSimpleExtrudeGeom
//  側にも同一ロジックで移植。凸判定経路(_clipPolyByPlanes)は
//  このファイル既存のepsilon(1e-5系)をそのまま維持し、凸形状での
//  挙動を旧実装と完全一致させている(リスクゼロ)。呼び出し箇所
//  (_intersectPolyWithFrustumの唯一の呼び出し元)も配列ループ+
//  to2D/from2D/dbgTag引数対応に更新済み。
//  ハーネスでの動作確認: 問題５.vold/問題５-B.vold双方でnormalモードが
//  クラッシュなく高速(1秒未満)に完走することを確認。ただし出力される
//  頂点数・面数が修正前(凹み無視の誤った旧実装)から大きく変化して
//  いる(例: 問題５.vold normal 頂点35→80)。これは想定通りの変化
//  (旧実装は凹み多角形を誤って凸近似していたため、そもそも間違った
//  形状を出力していた)だが、buildSimpleExtrudeGeom側の3D出力を
//  マスターが実機で見るのは今回が初めてであり、実機確認が必須。
//  【新規発見・次回要確認】normalモードの縮退三角形カウントが修正後に
//  微増(問題５: 0→1、問題５-B: 0→7)。doboku側では0のまま。新しく
//  正しく生成されるようになった凹みクリップ境界(T字点由来の頂点が
//  多い)に対するearcut三角形分割の質の問題の可能性があり、r055-057で
//  doboku側に施したスリバー対策(共線点除去/Delaunayフリップ)と同種の
//  追加調整が必要になる可能性がある。実害(見た目の破綻)があるかは
//  実機確認待ち。
//
//  【現状(24回目セッション終了時点)】
//  ・問題５.vold/問題５-B.vold ともにdoboku側は高速・非多様体0本
//    (地雷25: Node側の仮説、実機未確認)。
//  ・buildSimpleExtrudeGeom(通常計算)側への同等適用は完了。ただし
//    実機で3D表示を見るのは初回であり、要確認。
//  ・マスターの実機確認は一切まだ。次回セッション最優先。
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  r058: 問題5(22回目引継ぎ) 根本原因の再特定 + 構造修正（進行中）
//  ────────────────────────────────────────────────────────
//  【r057までの理解が誤っていた点】
//  22回目引継ぎでは「Site A(f0底面の穴リング)とSite C(f1側壁クリップ)が
//  使う頂点セットの数が食い違う」（f0が全周N点を無条件に断面化するのに
//  対しf1は交差する辺だけ分割する）という仮説だったが、23回目セッション
//  でデバッグログを突き合わせた結果、これは誤りと判明。実際はSite Cも
//  8辺全部の交差を検出できていた。
//
//  【真の根本原因】_getFrustumPlanes/_intersectPolyWithFrustumが、
//  各辺の法線を「多角形全体の頂点重心方向」で内向き判定し、
//  Sutherland-HodgmanでAND(全平面の交差)を取るという**凸体近似**の
//  実装だった。ユーザーが描く多角形は凹み(reflex頂点)を含みうる正当な
//  形状だが、凹み頂点があると、この凸近似は実際には内側にある点を
//  外側と誤判定することがある(単体テストのRay-casting比較で実証：
//  凹み頂点に隣接する平面が、本当は内側の点を誤って除外していた)。
//  これが「f0自身の壁(fi=0側のSite C)にf1(凹み多角形)で食われる
//  切り欠きが一切生成されない」の直接原因だった。
//
//  影響範囲: _getFrustumPlanes/_intersectPolyWithFrustumは
//  buildManifoldUnionGeom・buildSimpleExtrudeGeom両方に独立実装が
//  存在する(地雷25)。凹み多角形が「other」側(クリップ対象)として
//  渡されるあらゆる箇所に影響する。
//
//  【試したが失敗したアプローチ(次回同じ轍を踏まないための記録)】
//  1. 三角形分割(earcut) + 各三角形を独立した凸ミニ錐台として扱い
//     論理和(OR)で判定 → 対角線(三角形分割で生じる、元ポリゴンには
//     存在しない内部エッジ)に「物理的に正しいテーパー方向」が
//     存在しないことが判明。対角線の2端点は元ポリゴン上で隣接しない
//     ため、それぞれ異なるテーパー方向を持ち、対角線が作る境界面は
//     本質的に非平面(双曲放物面的)になる。片方の端点のテーパー方向
//     だけを採用→過大(遠く離れた点まで誤って内側判定、最大3.5m級)。
//     両端点のテーパー方向をNewell法で平均→今度は過小(逆側で最大
//     3.5m級のギャップ)。単一平面での近似には構造的に無理がある。
//  2. 高さスライス+境界を隣接スライス間で追跡・接続 → 各スライスの
//     断面(1D線分をfrustの2D断面でクリップ)自体は正確だが、区間が
//     高さ方向に分裂/合流するトポロジー変化点の扱いが本質的に曖昧。
//     ・緩い閾値でのマッチング→無関係な区間同士がクロス接続され
//       大きく歪む
//     ・両隣へ無条件に伸ばす(双方向)→伸びた先が無効な範囲にはみ出す
//       (over-inclusion)。スライス数を増やしても誤差が収束しない
//       ことをモンテカルロ検証で確認(各バンドの誤差がO(1/n)でも
//       n個のバンドがあるため合計は収束しない)。
//     ・実際に重なる範囲のみ接続(安全側)→重ならない部分を切り捨てる
//       ため今度は過小(under-inclusion)になり、しかもClipperLibの
//       UNION結果が数十〜数百個の細切れループに分裂する現象も発生。
//  上記2アプローチはいずれも「境界を追跡して繋ぐ」という設計が
//  トポロジー変化に対して脆弱という共通の欠陥を持つ。
//
//  【採用した設計】境界追跡を完全に放棄し、グリッド分割方式に変更。
//  poly(平面の四角形、vb1/vb2が同高さ・vt1/vt2が同高さの台形)を
//  ローカル(s,t)グリッドに細分し、各セル中心が実際にfrust内部にある
//  かを「該当高さのcontourOf(offsetPolygon、凹みもミタリングで
//  正しく扱える) + 2D point-in-polygon(ray-casting、凹み対応)」
//  という、既存で確実に動く方法で判定。内側と判定されたセルだけを
//  ClipperLibでUNIONする。「対応付け」や「追跡」のロジックが一切
//  存在しないため、トポロジー変化由来のバグが原理的に起きない。
//  戻り値は複数ポリゴン(配列)になりうる(f1がf0の境界を複雑に出入り
//  する場合、正しい結果が複数の離れた領域に分かれることがあると
//  モンテカルロ検証で確認済み)。単一ポリゴンへの強制は不可。
//  高さ(t)ごとにcontourOfの計算結果を使い回す最適化と、pol自身の
//  実寸(to2D投影後のUV空間の広がり)に応じてグリッド分割数を動的に
//  決定する仕組み(目標セルサイズ8mm)を導入し、精度と速度を両立。
//
//  【単体テスト】/home/claude/prototype/ 配下にL字型・星型・実際の
//  問題５f1形状(頂点3凹み)・凸形状回帰確認の4種類+モンテカルロ検証を
//  実装し、Node環境で全項目パス確認済み(prototype/test_concave.js)。
//  ただし本体(voldia3d.js)への統合後の検証はハーネスでのみ、かつ
//  buildManifoldUnionGeom(土量計算)側のみ実施。
//
//  【現状(23回目セッション終了時点)】
//  ・問題５.vold(両形状とも法面あり): 非多様体エッジ0本まで到達
//    (WELD-RESIDUAL経由。地雷25: Node側はあくまで仮説、実機未確認)
//    計算時間 約1.2秒。
//  ・問題５-B.vold(f0がnoSlope=垂直寄りに変更): まだ大幅に悪化した
//    状態のまま未解決。非多様体614本→WELD後も1本残存。しかも
//    計算時間27秒と実用に耐えない。原因は時間切れで未調査。
//    次回優先課題。
//  ・buildSimpleExtrudeGeom(通常計算)側は同種の修正が未着手
//    (地雷25: 両関数への同等適用が必要、次回必須)。
//  ・マスターの実機確認は一切まだ。
// ════════════════════════════════════════════════════════════

// r050: 底面生成(同深さグループUNION→他錐台DIFFERENCE)で、Clipperが正しく
// 検出していた穴(内包+深さ差＝浅い錐台の中に深い錐台がすっぽり収まるケースで
// 生じる「ドーナツ」の穴)を、直後のearcut三角形化がclassifyPaths()の
// item.holesを一切参照せず無視していたバグを修正。
// 修正前: 穴が塗りつぶされ、内側の壁との接続部で非多様体エッジが発生していた。
// 修正後: holeIdxを構築してearcutに渡し、hole頂点も含めてregV登録するよう変更。
// (buildSimpleExtrudeGeom側のprocessAndAddFace関数は元から同等の処理をしており
//  無傷。今回のバグはbuildManifoldUnionGeom側の底面生成箇所のみ。)
// マスターの実機確認まだ(地雷25: Node側検証はあくまで仮説)。
//
// ════════════════════════════════════════════════════════════
//  r055: 問題1/問題5(21回目引継ぎ) 根本原因修正
//  ────────────────────────────────────────────────────────
//  【症状】法面あり錐台同士が近接/接触する角で、本来「穴」になる
//  べき箇所に三角形の「壁」スパイクが誤って出現する（非多様体多発）。
//
//  【根本原因】2つの独立した計算経路が同じ境界点を別々に生成していた：
//    (A) 浅い錐台の底面ドーナツ穴リング = 深い錐台の断面を高さ方向に
//        線形補間(contourOf)して算出
//    (B) 深い錐台自身の側壁クリップ(DIFFERENCE)結果
//  数学的には(A)の穴リング頂点は(B)の側壁エッジ上に厳密に一直線上で
//  乗る設計になっている。ところがこの「一直線上の通過点」がearcutに
//  渡ると面積ほぼ0の縮退三角形を生み、SLIVER-SLOPE-AREA判定で捨てられる。
//  捨てられた結果、その境界点が側壁メッシュ側の頂点として登録されず、
//  (A)側だけが期待する接続点を持つ状態になって非多様体エッジが発生。
//  最終的にWELD-RESIDUAL(強制最近傍溶接)が本来無関係な頂点同士を
//  無理やり繋いでしまい、それが「壁のスパイク」として描画される。
//
//  【対処療法にしない理由】WELDの許容範囲チューニングは特定ケースの
//  対症療法に過ぎず、他の形状パターンで別の形で再発する。
//
//  【根本修正】earcutに渡す直前の2Dポリゴン(outer/holes/クリップ後の
//  各パス)から、隣接2辺のなす角がほぼ180°(=ほぼ一直線)の冗長頂点を
//  事前に除去する _removeCollinearPts() を新設。縮退三角形がそもそも
//  発生しない状態にしてから三角形分割することで、SLIVER判定への
//  依存自体を減らす。buildManifoldUnionGeom / buildSimpleExtrudeGeom
//  両方の全earcut呼び出し箇所（底面・天端・側壁2パターン×2関数=計6箇所）
//  に同一ロジックで適用（地雷25: 両関数への同等修正を徹底）。
//  マスターの実機確認まだ。Node側検証はあくまで仮説。
//
//  【r056追記】マスターの実機確認結果:
//    - 問題1: 不正面 解消（確認済み）
//    - 問題3: 不正面は解消したが、スリバー面4本が残存を確認
//      (角度ベース閾値epsDeg=0.05°だと、辺長9m級で実際の垂直ズレが
//       約2.9mmあっても検出漏れすることが判明。角度は辺長でスケール
//       が変わってしまうため判定基準として不適切だった)
//    - 問題5: スパイクは未解消（別原因。下記の別課題を参照）
//  → epsDeg(角度)ベースの判定を epsDist(垂直距離の絶対値、5mm)ベースに
//    全面変更。辺長に依存しない一貫した基準に修正。
//  【未解決の既知課題】問題5のスパイクは、f0の底面ドーナツ穴リングと
//    f1自身の側壁クリップ結果という2つの独立した計算経路が、同一の
//    境界点を数mm未満の誤差でズレて生成してしまうことが原因と判明
//    済み(調査ログで確認)。これは共線点除去では直せない、より構造的な
//    問題で、両経路が同じ境界点を共有する設計に改める必要がある。
//    次セッションでの継続課題。
// ════════════════════════════════════════════════════════════
// ── 共線点除去: ほぼ一直線上の冗長頂点をearcut投入前に除去 ──
// pts: {x,y}または{X,Y}形式の点配列(閉じたリング、始点末尾重複なし想定)
// getX/getY: 座標アクセサ（呼び出し側の点形式に依存しないための抽象化）
// epsDist: 「直線とみなす」垂直距離の許容値。getX/getYが返す座標系と
//          同じ単位（メートル系呼び出し元ならメートル、Clipper整数系
//          呼び出し元ならそのスケール単位）で指定すること。
//
// r055修正メモ①: 当初 dot>0 (=同方向へ直進する共線点のみ除去) という条件を
// 入れていたが、問題1/問題5で実際に検出された縮退三角形の原因は
// 「dot<0のスパイク(折り返し)」パターンだった。dotの符号に関わらず
// 「隣接2点を結ぶ線への実質寄与(面積)がほぼ0」なら除去するよう修正済み。
//
// r055修正メモ②(問題3で発覚): 角度ベースの閾値(epsDeg)は辺の長さに
// よって実際のズレ量(mm)が変動してしまう欠陥があった。9m級の長辺では
// 角度0.05°でも垂直方向に約2.9mmもズレるのに、閾値をわずかに超えて
// 検出漏れしていた。「三角形が縮退しているか」は辺の長さに関係なく
// 絶対的なmm単位で判断すべき性質のものなので、角度(sin)ベースから
// 点と直線の垂直距離(絶対値)ベースに変更。これにより辺長に依存しない
// 一貫した基準で判定できる。
function _removeCollinearPts(pts, getX, getY, epsDist){
  if(!pts || pts.length < 4) return pts; // 三角形以下は弄らない
  let keep = pts.slice();
  for(let pass = 0; pass < 2; pass++){ // 連続する共線点にも対応するため2周
    const m = keep.length;
    if(m < 4) break;
    const next = [];
    for(let i = 0; i < m; i++){
      const prev = keep[(i - 1 + m) % m], cur = keep[i], nxt = keep[(i + 1) % m];
      const abx = getX(nxt) - getX(prev), aby = getY(nxt) - getY(prev); // prev→next
      const abLen = Math.hypot(abx, aby);
      if(abLen < 1e-9){ continue; } // prevとnextが重複＝curは孤立点、除去
      const apx = getX(cur) - getX(prev), apy = getY(cur) - getY(prev); // prev→cur
      const cross = abx * apy - aby * apx;
      const dist = Math.abs(cross) / abLen; // curから直線prev-nextへの垂直距離
      if(dist < epsDist) continue; // 直線からの逸脱が閾値未満＝共線とみなして除去
      next.push(cur);
    }
    if(next.length >= 3) keep = next; else break;
  }
  return keep.length >= 3 ? keep : pts; // 壊れる場合は元のまま返す(安全側)
}
// ════════════════════════════════════════════════════════════
//  r057: 問題3(21回目引継ぎ 続き) スリバー面品質改善
//  ────────────────────────────────────────────────────────
//  【前提】問題3の残存4スリバーのうち3本を調査した結果、これらは
//  T字接続点の縮退三角形バグ(r055/r056)とは別原因と判明。実体は
//  「複数形状のUNIONが作る"くびれ"(ダンベル型)の2D輪郭を、earcutが
//  くびれをまたぐ橋渡し三角形として分割した結果、その対角線の選び方
//  次第で細長い三角形になる」という、triangulationの選択の問題。
//  面積はゼロではなく(=穴は開いていない)、正当な三角形ではあるが、
//  同じ4頂点を使う別の対角線を選べば、面積配分がずっとバランスの
//  取れた形になることを実データで検証済み(マスター提案のエッジフリップ)。
//
//  【採用した判定基準】ドロネー条件(空円条件)。CAD/GIS/TINの世界で
//  標準的に使われる、数学的に定義された唯一の基準。「対角線で分割した
//  2三角形のうち、一方の外接円の内側にもう一方の頂点が入っているか」
//  で判定し、入っていればフリップした方が良い triangulation。
//  Lawsonのフリップアルゴリズムとして知られ、有限回で必ず収束する
//  ことが証明されている(悪化することがない)。
//
//  【安全性】フリップ対象は「ちょうど2つの三角形に共有されている
//  内部エッジ」のみに限定。境界エッジ(1三角形のみ使用)や非多様体
//  エッジ(3つ以上使用)は一切対象外にしているため、外周・穴の
//  トポロジー(形状・体積・穴の有無)には一切影響しない。三角形の
//  「切り方」だけを変える後処理。
//
//  【限界】ポリゴンの境界線自体(穴の輪郭や外周そのもの)に細長い
//  形状が含まれる場合はこの方法では直せない(境界エッジは変更不可の
//  ため)。今回確認した問題3のケースは内部対角線の選択が原因と
//  確認済みなので有効なはずだが、100%の保証ではない。
//  マスターの実機確認まだ。Node側検証はあくまで仮説。
// ════════════════════════════════════════════════════════════
// tris: earcut出力のインデックス配列(flat: i0,i1,i2,i0,i1,i2,...)
// flatPts: 2D座標のflat配列(x0,y0,x1,y1,...)。triのインデックスに対応。
// 戻り値: フリップ後の新しいtris配列(元の配列は変更しない)
function _delaunayFlip(tris, flatPts, maxIter){
  maxIter = maxIter || 30;
  const gx = i => flatPts[i*2], gy = i => flatPts[i*2+1];
  function signedArea2(a,b,c){
    return (gx(b)-gx(a))*(gy(c)-gy(a)) - (gy(b)-gy(a))*(gx(c)-gx(a));
  }
  // dが三角形abc(CCW前提)の外接円の内側にあればtrue(=フリップすべき)
  function inCircleCCW(a,b,c,d){
    const ax=gx(a)-gx(d), ay=gy(a)-gy(d);
    const bx=gx(b)-gx(d), by=gy(b)-gy(d);
    const cx=gx(c)-gx(d), cy=gy(c)-gy(d);
    const aSq=ax*ax+ay*ay, bSq=bx*bx+by*by, cSq=cx*cx+cy*cy;
    const det = ax*(by*cSq - bSq*cy) - ay*(bx*cSq - bSq*cx) + aSq*(bx*cy - by*cx);
    return det > 1e-12;
  }
  let triList = [];
  const nTri0 = tris.length / 3;
  for(let t = 0; t < nTri0; t++){
    const a=tris[t*3], b=tris[t*3+1], c=tris[t*3+2];
    if(signedArea2(a,b,c) < 0) triList.push([b,a,c]); // CCWに正規化
    else triList.push([a,b,c]);
  }
  for(let iter = 0; iter < maxIter; iter++){
    const edgeMap = new Map();
    const key = (a,b) => a < b ? a+'_'+b : b+'_'+a;
    for(let t = 0; t < triList.length; t++){
      const [a,b,c] = triList[t];
      [[a,b,c],[b,c,a],[c,a,b]].forEach(([e0,e1,apex]) => {
        const k = key(e0,e1);
        if(!edgeMap.has(k)) edgeMap.set(k, []);
        edgeMap.get(k).push({t, e0, e1, apex});
      });
    }
    let flippedAny = false;
    const consumedTri = new Set();
    for(const entries of edgeMap.values()){
      if(entries.length !== 2) continue; // 境界/非多様体エッジは対象外(トポロジー維持)
      const [E1, E2] = entries;
      if(E1.t === E2.t) continue;
      if(consumedTri.has(E1.t) || consumedTri.has(E2.t)) continue; // 1周で同じ三角形を2回いじらない
      const a=E1.e0, b=E1.e1, c=E1.apex, d=E2.apex;
      // 四角形a-c-b-dが凸であることを確認(cとdがabの反対側)
      const sideC = signedArea2(a,b,c);
      const sideD = signedArea2(a,b,d);
      if(sideC <= 0 || sideD >= 0) continue; // E1(a,b,c)はCCW登録済みのはずなのでsideC>0、E2はCW側なのでsideD<0が正常
      if(!inCircleCCW(a,b,c,d)) continue; // ドロネー条件を満たしていれば何もしない
      // 対角線をa-bからc-dへフリップ。新しい2三角形(a,c,d)(c,b,d)の向きは
      // 元の(a,b,c)(a,b,d)のCCW/CW関係から一意に決まらないため、都度符号を見て正規化する。
      const area1 = signedArea2(a,c,d), area2 = signedArea2(c,b,d);
      if(Math.abs(area1) <= 1e-12 || Math.abs(area2) <= 1e-12) continue; // 数値的に不健全なら見送り(安全側)
      triList[E1.t] = area1 > 0 ? [a,c,d] : [c,a,d];
      triList[E2.t] = area2 > 0 ? [c,b,d] : [b,c,d];
      consumedTri.add(E1.t); consumedTri.add(E2.t);
      flippedAny = true;
    }
    if(!flippedAny) break;
  }
  const out = [];
  triList.forEach(([a,b,c]) => out.push(a,b,c));
  return out;
}
// ════════════════════════════════════════════════════════════
//  r062: buildManifoldUnionGeom はManifold(manifold-3d)ベース。
//  各frustumをGL(y=0)の蓋+側面(錐台)+底面蓋のwatertight立体として構築し、
//  Manifold.union()で厳密ブーリアン和。結果から3頂点全てGL(y=0)の
//  三角形(蓋)のみ除去してオープントップ形状を得る。
//  旧方式(独立計算される2つの境界をrepairTJunctions/WELD-RESIDUALで
//  事後縫合)は面破損の原因だったため撤回、実機確認済み(26回目引継ぎ)。
//  cyan/red二色分類は本方式では概念自体が消滅するため、redIndicesは常に空配列。
// ════════════════════════════════════════════════════════════

// ── Manifold WASMモジュールのロード ──
// ブラウザ: ESM限定配布のためCDNから動的import()（クラシックscript内でも実行可、type="module"化は不要）
// Nodeテスト: window._manifoldWasmInjectedに事前ロード済みインスタンスを注入すればCDNアクセス不要
//   （vm.createContextサンドボックス内はimport()不可のため、サンドボックス外でロードして注入する）
const MANIFOLD_CDN_URL = 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.1/manifold.js';
let _manifoldWasmPromise = null;
async function _getManifoldWasm(){
  if(typeof window !== 'undefined' && window._manifoldWasmInjected){
    return window._manifoldWasmInjected;
  }
  if(!_manifoldWasmPromise){
    _manifoldWasmPromise = (async () => {
      console.log(`[MANIFOLD] WASMモジュールをCDNから読み込み中: ${MANIFOLD_CDN_URL}`);
      const ManifoldModule = (await import(MANIFOLD_CDN_URL)).default;
      const wasm = await ManifoldModule();
      wasm.setup();
      console.log('[MANIFOLD] WASMモジュール初期化完了');
      return wasm;
    })();
  }
  return _manifoldWasmPromise;
}

// r057(こちらはVoldia本体独自のr057。山留機能はVoldiaM側には無い機能のため):
// Manifold出力三角形の事後分類方式(距離/法線ヒューリスティック→ID追跡→
// ハイブリッド)を撤回、配置モード実績の「境界線＋バッチ角＋実深さから辺ごとに
// 独立した台形パネルを直接構築」方式に統一。Manifold出力形状に非依存なので
// テクスチャ欠け等が原理的に起こらない。本体側はrealYTop/realYBotが実プリズムと
// 同一のため、地形レイキャストなしで厳密一致（配置モードとの差分）。
function _buildYamadomeOverlayGeomData(ydMm, realYTop, realYBot, BATTER_DEG, SC){
  const n = ydMm.length;
  if(n < 3) return null;
  const STRIPE_W = 0.4; // 「粗目」の縦格子: 0.4mごとに1縞(配置モードと統一)
  const CLEAR = 0.01;   // 1cm。実体側(壁)へ食い込まないよう空洞側に確保する最小クリアランス
  const pts = ydMm.map(p => ({ x: p.x * SC, z: p.y * SC }));
  let cenX = 0, cenZ = 0;
  pts.forEach(p => { cenX += p.x; cenZ += p.z; });
  cenX /= n; cenZ /= n;
  // 6D-2(2026-08-28 引継ぎ18回目マスター指摘): 従来はrealYTopが常に単一値(全周
  // 一律)だったため、法面等で実際の壁が低い区間でも山留ハッチがGL付近の高さまで
  // 一律に伸び、壁が存在しない場所に浮いて見える不具合があった。realYTopに配列
  // (頂点ごとの実際の壁高さ)を渡せる後方互換の拡張を追加し、頂点ごとに天端高さを
  // 変えられるようにする(従来通り数値1個で呼べば全周一律のまま動作)。
  const topArr = Array.isArray(realYTop) ? realYTop : null;
  const topAt = i => topArr ? topArr[i] : realYTop;
  const positions = [];
  const uvs = [];
  let cum = 0;
  for(let i=0;i<n;i++){
    const a = pts[i], b = pts[(i+1)%n];
    const aTopY = topAt(i), bTopY = topAt((i+1)%n);
    const segLen = Math.hypot(b.x-a.x, b.z-a.z);
    const midX = (a.x+b.x)/2, midZ = (a.z+b.z)/2;
    const outDx = midX-cenX, outDz = midZ-cenZ;
    const outLen = Math.hypot(outDx,outDz) || 1;
    const odx = outDx/outLen, odz = outDz/outLen; // このエッジの外向き単位法線
    // 本体壁と同一式(tan(BATTER_DEG)×高さ)。頂点ごとに実高さが変わる場合は
    // そのエッジの高さで個別に算出する。
    const aH = Math.max(0.01, aTopY - realYBot), bH = Math.max(0.01, bTopY - realYBot);
    const aBattOut = Math.tan(BATTER_DEG * Math.PI / 180) * aH;
    const bBattOut = Math.tan(BATTER_DEG * Math.PI / 180) * bH;
    // 実体(土)は壁の外側・空洞(見える側)は内側(配置モードr055で確定)。常に内側にCLEARぶん確保。
    const botOut = -CLEAR, aTopOut = aBattOut - CLEAR, bTopOut = bBattOut - CLEAR;
    const aBot=[a.x+odx*botOut, realYBot, a.z+odz*botOut];
    const bBot=[b.x+odx*botOut, realYBot, b.z+odz*botOut];
    const bTop=[b.x+odx*bTopOut, bTopY, b.z+odz*bTopOut];
    const aTop=[a.x+odx*aTopOut, aTopY, a.z+odz*aTopOut];
    positions.push(...aBot, ...bBot, ...bTop,  ...aBot, ...bTop, ...aTop);
    const u0=cum/STRIPE_W, u1=(cum+segLen)/STRIPE_W;
    const v0=realYBot/STRIPE_W, v1a=aTopY/STRIPE_W, v1b=bTopY/STRIPE_W;
    uvs.push(u0,v0, u1,v0, u1,v1b,  u0,v0, u1,v1b, u0,v1a);
    cum += segLen;
  }
  return { positions: new Float32Array(positions), uv: new Float32Array(uvs) };
}
async function buildManifoldUnionGeom(frustums, isDoboku=true, yamadomeOffsetX, yamadomeOffsetY){
  if(!frustums || !frustums.length) return null;

  // r042: r041では frustums._offsetX/_offsetY (配列に生やしたプロパティ)を頼りに
  // していたが、runCalc内でfsが何度もfs=fs.map(...)/filter(...)で再代入される
  // ため、この関数に届く前にプロパティが失われ、常に0扱いになっていた
  // (実機ログで確認)。呼び出し元(initThree_watertight)から明示的な引数として
  // 受け取る方式に変更。配列プロパティは後方互換のフォールバックとしてのみ残す。
  const _ydOffsetX = (yamadomeOffsetX !== undefined ? yamadomeOffsetX : frustums._offsetX) || 0;
  const _ydOffsetY = (yamadomeOffsetY !== undefined ? yamadomeOffsetY : frustums._offsetY) || 0;

  // v0.0013: 縮退フラスタムを除外（面積ゼロ・頂点不足・NaN座標）— 既存踏襲
  frustums = frustums.filter(f => {
    if(!f.ptsMm || f.ptsMm.length < 3) return false;
    if((f.area||0) < 1e-6) return false;
    if(f.D <= 0) return false;
    if(f.ptsMm.some(p => isNaN(p.x) || isNaN(p.y))) return false;
    return true;
  });
  if(!frustums.length) return null;
  console.log(`[3D ${VOLDIA3D_VER}] buildManifoldUnionGeom(Manifold方式) 開始: frustums=${frustums.length} 頂点量子化=${window._vertexQuantMm}mm`);

  // r044-fix②: 入力座標(ptsMm/holesMm)の事前量子化 — 既存踏襲。
  // Manifold方式でも、UI側の浮動小数点誤差で本来同一のはずの境界が
  // わずかにズレて別frustum扱いされる事態を防ぐ効果は変わらず有効。
  (function preQuantizeInput(){
    const inQuantMm = Math.max(window._vertexQuantMm||0, 1);
    const inQF = 1000/inQuantMm;
    function qxy(p){ return { x: Math.round(p.x*inQF)/inQF, y: Math.round(p.y*inQF)/inQF }; }
    frustums.forEach(f=>{
      f.ptsMm = f.ptsMm.map(qxy);
      if(f.holesMm) f.holesMm = f.holesMm.map(h=>h.map(qxy));
    });
  })();

  const SC = 0.001; // mm→m（Three.js単位変換）

  // ── 出力バッファ ──────────────────────────────────────
  const positions = [];
  const cyanIdx   = [];
  const redIdx    = []; // r057: 断面ハッチは独立オーバーレイに全面移行したため常に空
  let _ydOverlayData = null; // r057: 断面ハッチ用の独立オーバーレイ(位置+UV)。yamadome無しならnullのまま。
                              // ★戻り値の_retで参照するため、関数トップレベルで宣言すること
                              // (try{}ブロック内でletすると戻り値側から見えずReferenceErrorになる、実機で踏んだ地雷)
  // 追加2(2026-08-24 引継ぎ18回目マスター指示): 配置モード側の山留テクスチャが
  // 「同じ形状のオブジェクトと重なる場合に地形レイキャストが誤ヒットして消える」
  // 問題への根本対応として、配置モード側は独自レイキャストで高さを推測するのを
  // やめ、本体側のこの実寸値(realYTop/realYBot/BATTER_DEG)をそのまま
  // postMessageで送って使う。そのため同様に関数トップレベルで保持しておく。
  let _ydRealYTop = null, _ydRealYBot = null, _ydBatterDegForMsg = null;

  // v0.0016踏襲: 量子化精度をグローバル変数で制御（UIから変更可能）
  const quantFactor = window._vertexQuantMm > 0
    ? (1000 / window._vertexQuantMm)
    : 200000;
  if(window._vertexQuantMm===0 || window._vertexQuantMm<5){
    console.warn(`[VERT-QUANT] 頂点量子化=${window._vertexQuantMm}mm は精度が高すぎます。`
      + `LandXML(重機施工用)出力ではmm未満の精度は不要かつ非多様体エッジの原因になりやすいため、10mm以上を推奨します。`);
  }
  const vMap = new Map();
  function regV(x, y, z){
    const key = `${Math.round(x*quantFactor)}_${Math.round(y*quantFactor)}_${Math.round(z*quantFactor)}`;
    if(vMap.has(key)) return vMap.get(key);
    const idx = positions.length / 3;
    const qx = window._vertexQuantMm > 0 ? Math.round(x*quantFactor)/quantFactor : x;
    const qy = window._vertexQuantMm > 0 ? Math.round(y*quantFactor)/quantFactor : y;
    const qz = window._vertexQuantMm > 0 ? Math.round(z*quantFactor)/quantFactor : z;
    positions.push(qx, qy, qz);
    vMap.set(key, idx);
    return idx;
  }

  // ── フラスタム断面輪郭ヘルパー（r034〜r048の知見をそのまま踏襲） ──
  // z=0(GL/天端)側だけ量子化値+1mm相当の極小テーパーを持たせる
  // 経緯・mitre上限1.5倍・minOffsetMm下限保証の理由は旧実装のコメント
  // （25回目以前の引継ぎMD）を参照。ロジック自体は無変更で移植。
  // 【問題B対応・2026-08-24】旧実装は角度ベース(DOBOKU_VERTICAL_TAPER_DEG=3°)で
  // taper = f.D * tan(3°) としていたため、掘削が深いほど天端のズレが比例して
  // 増大していた(例: 深さ10mで片側50cm以上)。ファイル冒頭のDOBOKU_VERTICAL_TAPER_FIXED_MM
  // (固定15mm)を使い、深さによらず常に一定量だけ外側にオフセットする方式に変更。
  function contourOf(f, zMm){
    const top = -(f.tl||0);
    const fromTop = zMm - top;
    const ratio = 1.0 - fromTop / f.D; // 天端でratio=1.0、底面でratio=0
    const taper = f.noSlope ? DOBOKU_VERTICAL_TAPER_FIXED_MM : f.D * getSlopeRatio();
    const dist = Math.max(0, f.OD + ratio * taper);
    const q = window._vertexQuantMm;
    const minOffsetMm = (f.noSlope && q > 0 && ratio > 0.999) ? (q / 2 + 1) : 0;
    return f.noSlope ? offsetPolygon(f.ptsMm, dist, false, 1.5, minOffsetMm) : offsetPolygon(f.ptsMm, dist);
  }
  function topContour(f){ return contourOf(f, -(f.tl||0)); }
  function botContour(f){ return contourOf(f, f.D - (f.tl||0)); }
  function tlY(f){ return (f.tl||0) * SC; }
  function botY(f){ return ((f.tl||0) - f.D) * SC; }

  // ── frustum単体を「蓋+側面+底面」のwatertight立体として構築 ──
  // (26回目セッションのmanifold_prototype.js buildCappedFrustumMeshを移植。
  //  輪郭計算はプロトタイプの簡易版contourAtRatioではなく、上記の既存
  //  contourOf/topContour/botContourをそのまま使う — mitre上限・
  //  minOffsetMm下限保証など既存の知見を引き継ぐため)
  function _buildRingLoftMesh(topRing, yTop, botRing, yBot){
    const n = topRing.length;
    const m = botRing.length;
    const verts = [];
    const tris = [];
    topRing.forEach(p => verts.push(p.x * SC, yTop, p.y * SC));
    botRing.forEach(p => verts.push(p.x * SC, yBot, p.y * SC));
    {
      const flat = [];
      topRing.forEach(p => flat.push(p.x, p.y));
      const capTris = earcut(flat, null, 2);
      for(let i=0;i<capTris.length;i+=3) tris.push(capTris[i], capTris[i+1], capTris[i+2]);
    }
    {
      const flat = [];
      botRing.forEach(p => flat.push(p.x, p.y));
      const capTris = earcut(flat, null, 2);
      for(let i=0;i<capTris.length;i+=3) tris.push(n+capTris[i], n+capTris[i+2], n+capTris[i+1]);
    }
    const sideN = Math.min(n, m);
    for(let k=0;k<sideN;k++){
      const k2 = (k+1) % sideN;
      const t0=k, t1=k2, b0=n+k, b1=n+k2;
      tris.push(t0, b0, t1);
      tris.push(t1, b0, b1);
    }
    return { vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris), numProp: 3 };
  }

  // r068: buildCappedFrustumMeshは配列を返す(通常は要素数1)。
  // 天端/底面2リングだけのloftでは、深さ方向の途中で自己交差状況が変わる
  // (コの字ノッチが途中の深さで閉じる等)ケースを正しく表現できないため
  // (AIS_CrashTest2「地雷①③」で確認)、その場合のみ深さを_SLICE_N等分し、
  // 隣接スライス間だけをloftすることでトポロジ変化を薄い1層に閉じ込める。
  // 自己交差が無い通常ケースはr067までと完全に同じ単一メッシュを返す。
  function buildCappedFrustumMesh(f){
    const topRing0 = topContour(f);
    const botRing0 = botContour(f);
    const topS = _sanitizeOffsetRing(topRing0);
    const botS = _sanitizeOffsetRing(botRing0);

    if(!topS.changed && !botS.changed){
      // r065(AIS修正案): topRing0とbotRing0の頂点数が丸め等でズレている場合、
      // _buildRingLoftMeshは少ない方の頂点数(Math.min)に合わせて側面を張って
      // 終了してしまい、メッシュに穴が開いて非多様体(Not manifold)になる。
      // 頂点数が違う場合は_resampleRingByArcLengthで強制的に揃えてから渡す。
      let topR = topRing0, botR = botRing0;
      if(topR.length !== botR.length){
        const M = Math.max(topR.length, botR.length, 8);
        topR = _resampleRingByArcLength(topR, M);
        botR = _resampleRingByArcLength(botR, M);
      }
      return [_buildRingLoftMesh(topR, tlY(f), botR, botY(f))];
    }

    console.warn('[SLICE-LOFT] 深さ方向のトポロジ変化を検出、' + _SLICE_N + '分割でロフトします');
    const topZmm = -(f.tl||0);
    const botZmm = f.D - (f.tl||0);
    const sliceRings = [];
    for(let k=0;k<=_SLICE_N;k++){
      const zMm = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const raw = contourOf(f, zMm);
      const s = _sanitizeOffsetRing(raw);
      sliceRings.push(s.pts);
    }
    const meshes = [];
    for(let k=0;k<_SLICE_N;k++){
      let ringA = sliceRings[k], ringB = sliceRings[k+1];
      if(ringA.length !== ringB.length){
        const M = Math.max(ringA.length, ringB.length, 8);
        ringA = _resampleRingByArcLength(ringA, M);
        ringB = _resampleRingByArcLength(ringB, M);
      }
      const zA = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const zB = topZmm + (botZmm - topZmm) * (k+1) / _SLICE_N;
      meshes.push(_buildRingLoftMesh(ringA, -zA*SC, ringB, -zB*SC));
    }
    return meshes;
  }

  function _meshSignedVolume(vertProperties, triVerts){
    let vol = 0;
    for(let i=0;i<triVerts.length;i+=3){
      const a=triVerts[i]*3, b=triVerts[i+1]*3, c=triVerts[i+2]*3;
      const ax=vertProperties[a], ay=vertProperties[a+1], az=vertProperties[a+2];
      const bx=vertProperties[b], by=vertProperties[b+1], bz=vertProperties[b+2];
      const cx=vertProperties[c], cy=vertProperties[c+1], cz=vertProperties[c+2];
      vol += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
    }
    return vol;
  }

  // ── Manifold WASM 取得 ──
  const wasm = await _getManifoldWasm();
  const { Manifold, Mesh } = wasm;

  const manifoldObjs = [];
  // 6D-6(2026-08-29 引継ぎ18回目マスター指示・根本修正): 2Dヒューリスティック
  // (隣接オブジェクトの生外形までの距離を推測して隠れる高さを逆算する方式)は
  // オブジェクトが増えると破綻する対症療法だったため全廃。Manifoldの
  // originalID()追跡機能(既存の山留クリップで実績あり)を流用し、「union後の
  // どの三角形が紫frustum由来か」を幾何的推測なしに直接判定する方式に変更。
  // これにより、Union計算自体が正しく処理した「隣接オブジェクトに隠れて消える
  // 面」の判定をそのまま流用でき、新しい面を計算し直す必要が無くなる。
  const purpleOriginalIDs = new Set();
  const purpleTriPos = []; // 6D-6: try/finally境界をまたいで後段(_ret構築)から参照するため外側で宣言
  const purpleTriUv = [];
  try {
    frustums.forEach((f, i) => {
      const meshDatas = buildCappedFrustumMesh(f); // r068: 配列(通常は要素数1)
      meshDatas.forEach((meshData, j) => {
        let vol = _meshSignedVolume(meshData.vertProperties, meshData.triVerts);
        if(vol < 0){
          // 法線が内向きだった場合は全三角形の巻き順を反転
          const tv = meshData.triVerts;
          for(let t=0;t<tv.length;t+=3){ const tmp=tv[t]; tv[t]=tv[t+1]; tv[t+1]=tmp; }
        }
        // 6D-7(2026-08-29 引継ぎ18回目マスター指摘・再修正): 実際にnpm install
        // manifold-3d@3.5.1してWASMを直接動かし検証した結果、new Manifold(new
        // Mesh(meshData))のように生メッシュから直接構築した場合、man.originalID()
        // は常に-1を返す(まだ内部的に「original」として確定していない扱いになる)
        // ことが判明した。これでは6D-6のpurpleOriginalIDs追跡が機能しない
        // (実際、これが「山留テクスチャが表示されなくなった」不具合の直接原因)。
        // 正しい方法はManifold.reserveIDs()で事前にIDを予約し、meshDataの
        // runOriginalID/runIndexとして明示的に埋め込んでから構築すること。
        // このIDはunion→intersectionを経た後もgetMesh().runOriginalIDに
        // 正しく残ることをNode上で実証済み(union後: [1,2]、さらにintersection
        // 後も[1,3]のように元IDが保持されることを確認)。
        const reservedID = Manifold.reserveIDs(1);
        meshData.runOriginalID = new Uint32Array([reservedID]);
        meshData.runIndex = new Uint32Array([0, meshData.triVerts.length]);
        const man = new Manifold(new Mesh(meshData));
        if(man.status && man.status() !== 'NoError'){
          const label = meshDatas.length>1 ? ('frustum'+i+'-slice'+j) : ('frustum'+i);
          console.warn('[MANIFOLD] ' + label + 'の単体メッシュがwatertightでない可能性: status=' + man.status());
        }
        if(f.color==='purple') purpleOriginalIDs.add(reservedID);
        manifoldObjs.push(man);
      });
    });

    console.log(`[MANIFOLD] union実行: ${manifoldObjs.length}個のfrustum`);
    const unioned = Manifold.union(manifoldObjs);
    if(unioned.status && unioned.status() !== 'NoError'){
      console.warn(`[MANIFOLD] union結果のstatus異常: ${unioned.status()}`);
    }
    // r039: 山留による垂直クリップ — 山留ポリゴンをGL上下に十分な高さで
    // 押し出した「垂直の柱」を作り、union結果とのintersectionを取る。
    // 「法面込みで完全に組んでから、深さに関係なく同じ平面位置で垂直に
    // カットする」という設計通りの挙動になる。山留が無ければ完全に素通り。
    let unionedFinal = unioned;
    if(typeof yamadome !== 'undefined' && yamadome && yamadome.pts && yamadome.pts.length>=3){
      try {
        const ydMm = getYamadomeMmPolygon(_ydOffsetX, _ydOffsetY);
        console.log('[YAMADOME-DEBUG] offsetX,Y(mm)=', _ydOffsetX, _ydOffsetY, ' オフセット補正後の山留(mm)=', ydMm);
        if(ydMm && ydMm.length>=3){
          let maxTop=0, minBot=0;
          frustums.forEach(f=>{ maxTop=Math.max(maxTop, tlY(f)); minBot=Math.min(minBot, botY(f)); });
          // r047: 山留の傾斜(バッチ角)対応。要望「根切底(最深部)を固定して、
          // 上に向かって外側へ広がるすり鉢型」を実装。LandXMLは垂直面を扱えない
          // ため、完全な垂直だった従来のプリズムをテーパー形状に変更する。
          const BATTER_DEG = 1; // バッチ角1度
          const realYTop = maxTop, realYBot = minBot; // 実際の掘削範囲(安全マージン抜き)
          // 6D-2は撤回(2026-08-29 引継ぎ18回目マスター指摘): 「山留を壁面のある
          // 所で止めてほしい」という要望は、本物の山留オブジェクトの話ではなく
          // 紫垂直面に貼る山留ハッチテクスチャ(6D)の高さの話だった。本物の
          // 山留オブジェクトはGL(realYTop=全frustum中の最大値)まで一律に伸びるのが
          // 正しい挙動(安全のため、実際の掘削が浅い区間があってもシートは地表まで
          // 連続しているべき)。頂点ごとに最寄りの壁の高さへ短縮する変更は誤った
          // 前提に基づく修正だったため撤回し、元の全周一律realYTopに戻す。
          const battHeightM = Math.max(0, realYTop - realYBot);
          const battOffsetMm = Math.tan(BATTER_DEG*Math.PI/180) * battHeightM * 1000;
          window._yamadomeBattOffsetMm = battOffsetMm; // r047: 後段の断面判定の許容誤差計算にも使う
          const ydMmTop = battOffsetMm > 0.01 ? offsetPolygon(ydMm, battOffsetMm) : ydMm;
          const yTopMargin = realYTop + 50, yBotMargin = realYBot - 50; // 50m余裕(垂直方向は絶対にクリップしない安全マージン)

          // r057: 断面ハッチ用オーバーレイを、実際にプリズムへ使うのと同一の
          // realYTop/realYBot/BATTER_DEGから直接構築(Manifoldの出力三角形には
          // 一切依存しない)。
          _ydOverlayData = _buildYamadomeOverlayGeomData(ydMm, realYTop, realYBot, BATTER_DEG, SC);
          _ydRealYTop = realYTop; _ydRealYBot = realYBot; _ydBatterDegForMsg = BATTER_DEG;

          function _mkRingManifold(topRing, yT, botRing, yB){
            const m = _buildRingLoftMesh(topRing, yT, botRing, yB);
            let v = _meshSignedVolume(m.vertProperties, m.triVerts);
            if(v < 0){ const tv=m.triVerts; for(let t=0;t<tv.length;t+=3){ const tmp=tv[t]; tv[t]=tv[t+1]; tv[t+1]=tmp; } }
            return new Manifold(new Mesh(m));
          }
          // 下段(テーパー部): 根切底(実寸・オフセット無し)→実際の上端(拡張済み)
          const lowerManifold = _mkRingManifold(ydMmTop, realYTop, ydMm, realYBot);
          // 上段(安全マージン、垂直のまま延長): 実際の上端(拡張済み)→上方50m
          const upperManifold = _mkRingManifold(ydMmTop, yTopMargin, ydMmTop, realYTop);
          // 下方安全マージン(垂直のまま延長): 根切底(実寸)→下方50m
          const belowManifold = _mkRingManifold(ydMm, realYBot, ydMm, yBotMargin);

          // r048: 断面判定を、距離/法線の閾値によるヒューリスティックから
          // Manifoldの原本ID追跡機能(originalID/runOriginalID)による確実な
          // 判定に全面的に切り替える。何度も閾値調整を繰り返し、その都度
          // 別の見落としが発生していたため、根本的に別のアプローチにした。
          // ydPrismはlower/upper/belowの3つのunion(=「積」扱いでoriginalID()が
          // -1になる)なので、asOriginal()で単一の「原本」として登録し直し、
          // そのIDを最終結果のruns情報と突き合わせることで「この三角形は
          // 山留プリズム由来か」を幾何的推測なしに直接判定できる。
          let ydPrismProduct = Manifold.union([lowerManifold, upperManifold, belowManifold]);
          lowerManifold.delete(); upperManifold.delete(); belowManifold.delete();
          const ydPrism = ydPrismProduct.asOriginal();
          ydPrismProduct.delete();
          const ydPrismID = ydPrism.originalID();
          window._yamadomePrismID = ydPrismID; // 後段の断面判定ループで使う
          if(ydPrism.status && ydPrism.status() !== 'NoError'){
            console.warn('[MANIFOLD] 山留プリズムがwatertightでない可能性: status=' + ydPrism.status());
          }
          console.log('[MANIFOLD] 山留による垂直クリップ(intersection)実行 ydPrismID=', ydPrismID);
          const clipped = Manifold.intersection([unioned, ydPrism]);
          if(clipped.status && clipped.status() !== 'NoError'){
            console.warn('[MANIFOLD] 山留クリップ後のstatus異常: ' + clipped.status());
          }
          ydPrism.delete();
          unionedFinal = clipped;
        }
      } catch(ydErr){
        // r040: 山留クリップで想定外の例外が出ても、3D計算全体を巻き込んで
        // クラッシュさせず、クリップ無しの結果にフォールバックする(安全側)。
        console.warn('[MANIFOLD] 山留クリップに失敗したため、クリップ無しで続行します: ' + (ydErr && ydErr.message));
        unionedFinal = unioned;
      }
    }
    const resultMesh = unionedFinal.getMesh();
    if(unionedFinal !== unioned) unioned.delete();
    unionedFinal.delete();

    // 蓋(GL面, y=0の3頂点で構成される三角形)を除去してオープントップのすり鉢状にする
    const pos = resultMesh.vertProperties;
    const tv  = resultMesh.triVerts;
    let removedCap = 0;
    const EPS_Y = 1e-5;
    // r057: 断面ハッチは独立オーバーレイ(_ydOverlayData)に全面移行したため、
    // ここでの三角形分類(距離/法線ヒューリスティック・ID追跡)は不要になった。
    // 山留クリップ自体(実際の形状のカット)は上のManifold.intersectionで
    // 完了済みなので、以降は単純に全三角形をcyanIdxへ積むだけでよい。
    //
    // 6D-6(2026-08-29 引継ぎ18回目マスター指示): 紫壁面ハッチ用に、
    // resultMesh.runIndex/runOriginalIDから「三角形i番目はどのoriginalID由来か」
    // を引けるテーブルを作る。union/intersectionを経てもManifoldがこの対応を
    // 保持してくれるため、幾何的な再推測は一切不要。
    const triOriginalID = new Int32Array(tv.length/3).fill(-1);
    if(resultMesh.runIndex && resultMesh.runOriginalID){
      const ri = resultMesh.runIndex, roid = resultMesh.runOriginalID;
      for(let r=0;r<roid.length;r++){
        const triStart = ri[r]/3, triEnd = ri[r+1]/3;
        for(let t=triStart;t<triEnd;t++) triOriginalID[t]=roid[r];
      }
    }
    // (purpleTriPos/purpleTriUvは関数スコープ側で宣言済み。ここではpushのみ行う)
    let removedDegenerate = 0; // r095(item12): 量子化で潰れた縮退三角形の除外カウント
    for(let i=0;i<tv.length;i+=3){
      const i0=tv[i], i1=tv[i+1], i2=tv[i+2];
      const y0=pos[i0*3+1], y1=pos[i1*3+1], y2=pos[i2*3+1];
      if(Math.abs(y0)<EPS_Y && Math.abs(y1)<EPS_Y && Math.abs(y2)<EPS_Y){ removedCap++; continue; }
      const gi0 = regV(pos[i0*3], pos[i0*3+1], pos[i0*3+2]);
      const gi1 = regV(pos[i1*3], pos[i1*3+1], pos[i1*3+2]);
      const gi2 = regV(pos[i2*3], pos[i2*3+1], pos[i2*3+2]);
      // r095(item12根本修正): regV()による量子化(mm丸め)で複数頂点が同一座標に
      // 吸着すると、頂点IDが重複した面積ゼロの縮退三角形が生まれることがある。
      // これがcyanIdxに混入すると、直後のfillInteriorHolesAtGLの境界エッジ抽出
      // (一筆書きループ構築)がT字路・行き止まりを起こし、無限ループ防止ガードに
      // 引っかかって穴埋め漏れが発生する(「現状地盤GL」を深くするほど頂点間の
      // 相対位置が量子化の丸め境界に近づきやすくなるため、GLの値によって不規則に
      // 再現する)。ここで縮退三角形をcyanIdx登録前に弾く。
      if(gi0===gi1 || gi1===gi2 || gi2===gi0){ removedDegenerate++; continue; }
      // r027で外向きへ反転する変更を試したが誤りだったためrevert。
      // 土量計算は「上蓋を撤去して上から覗き込む」表示なので、内側が表面に
      // なる向きがそもそも正しい(理屈より実機確認を優先すること)。
      cyanIdx.push(gi0, gi1, gi2);

      // 6D-6: この三角形が紫frustum由来か判定。由来かつ「垂直」(=法線が
      // ほぼ水平、Y成分が小さい)なら、実際にUnionが計算した本物の壁面として
      // ハッチオーバーレイの元データに採用する。
      if(purpleOriginalIDs.has(triOriginalID[i/3])){
        const ax=pos[i0*3],ay=pos[i0*3+1],az=pos[i0*3+2];
        const bx=pos[i1*3],by=pos[i1*3+1],bz=pos[i1*3+2];
        const cx=pos[i2*3],cy=pos[i2*3+1],cz=pos[i2*3+2];
        const ux=bx-ax,uy=by-ay,uz=bz-az;
        const vx=cx-ax,vy=cy-ay,vz=cz-az;
        // 法線 = u×v
        let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
        const nlen=Math.hypot(nx,ny,nz)||1;
        // 6D-9(2026-08-29 引継ぎ18回目マスター指摘・配置モードでの床面上の
        // 「細い三角形の濃い色」報告への対応): Union計算結果には、frustum同士の
        // 境界付近で面積がほぼゼロの縮退三角形(スリバー面)が含まれることがある。
        // このような三角形は法線(u×v)の大きさが元々小さく、正規化すると向きが
        // 不安定になり、本来は床面(水平)のはずが「垂直」と誤判定されて
        // ハッチ付きで採用されてしまうことがある。面積とY方向の広がりの
        // 両方に最小しきい値を設け、縮退三角形を確実に除外する。
        const triArea = nlen * 0.5; // |u×v|/2 = 三角形の面積(m²)
        const yMin=Math.min(ay,by,cy), yMax=Math.max(ay,by,cy);
        const ySpan = yMax - yMin; // この三角形が実際にまたぐ高さ方向の広がり(m)
        if(triArea < 1e-6 || ySpan < 0.02) continue; // 面積1mm²未満 or 高さ方向2cm未満はスリバー扱いで除外
        nx/=nlen; ny/=nlen; nz/=nlen;
        if(Math.abs(ny) < 0.35){ // ほぼ垂直な面のみ(水平な天端/床は除外)
          // 6D-8(2026-08-29 引継ぎ18回目マスター指摘): オフセット方向が逆で、
          // すり鉢の外側(実体/裏面)に貼られていた。cyanMesh側は「上蓋を撤去して
          // 上から覗き込む」表示のため面の向きが直感と逆になっており、この三角形
          // の法線(u×v)は実体側を向いている。空洞側(すり鉢の内側、見える面)に
          // 貼るには符号を反転させる必要がある。
          const PURPLE_HATCH_CLEAR = -0.01; // 1cm。空洞側(内側)へ少し前に出してZファイティング回避
          const ax2=ax+nx*PURPLE_HATCH_CLEAR, ay2=ay+ny*PURPLE_HATCH_CLEAR, az2=az+nz*PURPLE_HATCH_CLEAR;
          const bx2=bx+nx*PURPLE_HATCH_CLEAR, by2=by+ny*PURPLE_HATCH_CLEAR, bz2=bz+nz*PURPLE_HATCH_CLEAR;
          const cx2=cx+nx*PURPLE_HATCH_CLEAR, cy2=cy+ny*PURPLE_HATCH_CLEAR, cz2=cz+nz*PURPLE_HATCH_CLEAR;
          // UV: 法線と鉛直(0,1,0)から水平方向の接線を作り、それに沿った距離をUに、
          // 高さYをVにする(縦縞ハッチと同じ0.4m周期)。
          let tx=-nz, tz=nx; // (0,1,0)×normalの水平成分 = (-nz,0,nx)
          const tlen=Math.hypot(tx,tz)||1;
          tx/=tlen; tz/=tlen;
          const STRIPE_W=0.4;
          purpleTriPos.push(ax2,ay2,az2, bx2,by2,bz2, cx2,cy2,cz2);
          purpleTriUv.push(
            (ax*tx+az*tz)/STRIPE_W, ay/STRIPE_W,
            (bx*tx+bz*tz)/STRIPE_W, by/STRIPE_W,
            (cx*tx+cz*tz)/STRIPE_W, cy/STRIPE_W
          );
        }
      }
    }
    console.log(`[MANIFOLD] union後三角形=${tv.length/3} 蓋除去=${removedCap} 縮退除去=${removedDegenerate} 最終三角形=${cyanIdx.length/3}`);
    console.log(`[PURPLE-WALL] Manifold ID追跡による実面採用: ${purpleTriPos.length/9}三角形`);

    // r066: GL面の内部の穴（ドーナツ状にオブジェクトを配置した際、外周とは
    // 繋がっていない未着手ゾーンとして残る開口）を、基準高さ±0(GL)で自動的に
    // 塞ぐ。マスターの方針: 複雑な地形はCivil3Dの領分なので、判定・充填ロジック
    // は割り切ってシンプルに(泥臭くても確実な方法でOK、ポリゴン規模は
    // 数万には達しない前提)。
    //
    // 手順: ①蓋除去後のcyanIdxから境界エッジ(有向辺(a,b)に対し逆向き(b,a)が
    // どの三角形にも存在しないもの)を列挙 → ②繋いで閉ループ化(外周1つ＋
    // 内部の穴N個になるはず) → ③各ループの2D(x,z)符号付き面積(シューレース)を
    // 比較し、絶対値最大のもの＝本来の外周として現状維持(開けたまま) → ④残りの
    // ループ(＝内部の穴)をearcutでGL(y=0)充填。法線の向き(+Y=上向き)は
    // 生成後に符号を見て自動補正する(_meshSignedVolumeの符号反転と同じ考え方)。
    console.log('[CP-1] fillInteriorHolesAtGL 開始前');
    (function fillInteriorHolesAtGL(){
      const edgeCount = new Map();
      for(let i=0;i<cyanIdx.length;i+=3){
        const tri=[cyanIdx[i],cyanIdx[i+1],cyanIdx[i+2]];
        for(let k=0;k<3;k++){
          const a=tri[k], b=tri[(k+1)%3];
          edgeCount.set(`${a}_${b}`, (edgeCount.get(`${a}_${b}`)||0)+1);
        }
      }
      const boundaryEdges = [];
      for(let i=0;i<cyanIdx.length;i+=3){
        const tri=[cyanIdx[i],cyanIdx[i+1],cyanIdx[i+2]];
        for(let k=0;k<3;k++){
          const a=tri[k], b=tri[(k+1)%3];
          if(!edgeCount.has(`${b}_${a}`)) boundaryEdges.push({a,b});
        }
      }
      if(!boundaryEdges.length) return;

      const nextMap = new Map();
      boundaryEdges.forEach(e=>{
        if(!nextMap.has(e.a)) nextMap.set(e.a, []);
        nextMap.get(e.a).push(e);
      });
      const usedEdge = new Set();
      const loops = [];
      for(const e0 of boundaryEdges){
        const k0 = `${e0.a}_${e0.b}`;
        if(usedEdge.has(k0)) continue;
        const loop = [e0.a];
        let cur = e0.b;
        usedEdge.add(k0);
        let guard = 0;
        while(cur !== e0.a && guard++ < boundaryEdges.length + 5){
          loop.push(cur);
          const candidates = nextMap.get(cur) || [];
          const nextE = candidates.find(e => !usedEdge.has(`${e.a}_${e.b}`));
          if(!nextE){ cur = null; break; }
          usedEdge.add(`${nextE.a}_${nextE.b}`);
          cur = nextE.b;
        }
        if(cur === e0.a) loops.push(loop);
        else console.warn('[HOLE-FILL] 境界ループが閉じませんでした。当該箇所は未処理のままスキップします(頂点数:', loop.length, ')');
      }
      if(loops.length <= 1) return; // 外周のみ、内部の穴なし

      // r067(マスター指摘・ドーナツ形状の根本修正): 旧ロジック(絶対値最大面積の
      // 1つだけ開けたままにし、残りは種類を問わず単純earcut(loop,null)でベタ塗り)
      // は、離れた複数の独立立体(ドーナツ状に並んだ構台等)が絡むと、各立体自身の
      // 内側の穴も・立体同士の隙間も、区別せず全部GLでベタ塗りしてしまい、
      // 意図した「ドーナツの穴」が消えて見た目が完全に塞がってしまっていた。
      // ClipperLibのPolyTree(classifyPathsSafeと同じ機構)で全ループをunionし、
      // 「奇数深さ(=真の空隙、隣接する実体に囲まれた何もない領域)」だけをGL充填
      // 対象とし、その空隙の中にさらに別の実体(偶数深さ)が浮島のようにネスト
      // していれば、earcutのholeIndicesとして正しく除外(その実体は既に自前の
      // ジオメトリを持つため、重ねてGL充填すると二重に塞いでしまうため)。
      const SF = 1000000;
      const cl = new ClipperLib.Clipper();
      cl.StrictlySimple = true;
      loops.forEach(loop => {
        const path = loop.map(vi => ({ X: Math.round(positions[vi*3]*SF), Y: Math.round(positions[vi*3+2]*SF) }));
        cl.AddPath(path, ClipperLib.PolyType.ptSubject, true);
      });
      const tree = new ClipperLib.PolyTree();
      cl.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);

      let filledHoles=0, filledTris=0;

      // voidNode: 奇数深さ(空隙)のPolyNode。その空隙をGLで充填する。
      // 空隙の内側にさらにネストする実体(偶数深さ、voidNode.Childs())があれば
      // earcutのholeとして除外し、その実体の中にさらに空隙(奇数深さ)があれば
      // 再帰的に充填対象とする。
      function fillVoidNode(voidNode){
        const outerContour = voidNode.Contour();
        if(!outerContour || outerContour.length < 3) return;
        const flat = [];
        outerContour.forEach(p => flat.push(p.X/SF, p.Y/SF));
        const holeIdx = [];
        const nestedSolids = voidNode.Childs(); // この空隙の中にある別の実体(偶数深さ)
        nestedSolids.forEach(solidNode => {
          const solidContour = solidNode.Contour();
          if(!solidContour || solidContour.length < 3) return;
          holeIdx.push(flat.length/2);
          solidContour.forEach(p => flat.push(p.X/SF, p.Y/SF));
          // この実体のさらに内側にネストする空隙(奇数深さ)は別途充填する
          solidNode.Childs().forEach(fillVoidNode);
        });

        const tris = earcut(flat, holeIdx.length ? holeIdx : null, 2);
        if(!tris.length) return;

        const globalIdx = [];
        for(let i=0;i<flat.length;i+=2){
          globalIdx.push(regV(flat[i], 0, flat[i+1]));
        }
        // 既存の穴埋めと同じく、実機確認済みの向き判定を踏襲
        const v0i=globalIdx[tris[0]], v1i=globalIdx[tris[1]], v2i=globalIdx[tris[2]];
        const dx1=flat[tris[1]*2]-flat[tris[0]*2], dz1=flat[tris[1]*2+1]-flat[tris[0]*2+1];
        const dx2=flat[tris[2]*2]-flat[tris[0]*2], dz2=flat[tris[2]*2+1]-flat[tris[0]*2+1];
        const flip = (dz1*dx2 - dx1*dz2) >= 0;
        for(let i=0;i<tris.length;i+=3){
          const a=globalIdx[tris[i]], b=globalIdx[tris[i+1]], c=globalIdx[tris[i+2]];
          if(flip) cyanIdx.push(a,c,b); else cyanIdx.push(a,b,c);
          filledTris++;
        }
        filledHoles++;
      }

      // treeの直下(最外周、実体)は充填不要。その子(空隙)から充填を開始する。
      tree.Childs().forEach(topSolid => {
        topSolid.Childs().forEach(fillVoidNode);
      });

      if(filledHoles>0){
        console.log(`[HOLE-FILL] 内部の空隙を${filledHoles}箇所、GL(y=0)で充填(${filledTris}三角形追加、入れ子構造対応版)`);
      }
    })();
    console.log('[CP-2] fillInteriorHolesAtGL 完了');
  } finally {
    // WASMオブジェクトは自動GCされないため明示的に解放（メモリリーク防止、
    // https://github.com/elalish/manifold/discussions/256 参照）
    manifoldObjs.forEach(m => { try{ m.delete(); }catch(e){} });
  }
  console.log('[CP-3] buildManifoldUnionGeom finally 完了');

  // 6D-6(2026-08-29 引継ぎ18回目マスター指示・根本修正): 紫壁面ハッチは
  // 上のcap除去ループで既にManifoldのID追跡により実際に収集済み(purpleTriPos/
  // purpleTriUv)。ここでは単純にFloat32Arrayへ変換するだけでよい。2Dヒューリス
  // ティックによる「隠れる高さ」の再計算は一切行わない(実際にUnionが計算した
  // 本物の面をそのまま採用しているため、隣接オブジェクトの形状がどれだけ複雑
  // でも常に正しい)。
  let _purpleWallOverlay = null;
  let _purpleWallsForPlacement = null; // 配置モード反映用(2026-08-29 引継ぎ18回目マスター指示)
  if(purpleTriPos.length > 0){
    const positions = new Float32Array(purpleTriPos);
    const uv = new Float32Array(purpleTriUv);
    _purpleWallOverlay = { positions, uv };
    // 配置モード送信用データ: 頂点座標は既にSC(mm→m)適用済み・frustum正規化
    // 座標系(=山留のoffsetX/offsetYと同じ基準)なので、そのまま送るだけでよい。
    _purpleWallsForPlacement = { positions, uv };
    console.log(`[PURPLE-WALL] Manifold ID追跡により ${positions.length/9} 三角形を採用`);
  }


  const _ret = {
    positions: new Float32Array(positions),
    cyanIndices: new Uint32Array(cyanIdx),
    redIndices:  new Uint32Array(redIdx),
    yamadomeOverlay: _ydOverlayData, // r057: 断面ハッチ用の独立オーバーレイ(位置+UV)。無ければnull
    purpleWallOverlay: _purpleWallOverlay, // 6D: 紫オブジェクトの垂直壁ハッチオーバーレイ。無ければnull
    // 追加2(2026-08-24 引継ぎ18回目): 配置モードへ山留の実寸を送るための値。
    // yamadome無しなら全てnull。
    yamadomeRealYTop: _ydRealYTop,
    yamadomeRealYBot: _ydRealYBot,
    yamadomeBatterDeg: _ydBatterDegForMsg,
    purpleWallsForPlacement: _purpleWallsForPlacement // 6D配置モード反映用(2026-08-29 引継ぎ18回目)
  };
  console.log('[CP-4] buildManifoldUnionGeom return直前 positions=', _ret.positions.length, 'cyan=', _ret.cyanIndices.length, 'red=', _ret.redIndices.length);
  return _ret;
}

// ════════════════════════════════════════════════════════════
//  r064: 通常計算(buildSimpleExtrudeGeom)をdoboku側(r062/r063)と同じManifold-3d
//  アーキテクチャに統一(各frustumを独立watertight立体として構築→Manifold.union)。
//  27回目引継ぎで、旧ClipperLib方式が抱えていたdoboku側と同じ構造的欠陥
//  (境界不一致によるTJUNCTION-REMAIN破損)のリスクを理由に方針決定・実機確認済み。
//  doboku側との差分は蓋除去の有無のみ: doboku側はGL(z=0)三頂点の三角形を
//  除去してすり鉢状にするが、通常計算はオブジェクトごとに天端高さが違い
//  天端・底面とも実体として残るため蓋除去しない。それ以外のロジック
//  (contourOf/topContour/botContour/buildCappedFrustumMesh/頂点量子化等)は
//  doboku側と意図的に重複させたまま(地雷25: 両者安定するまで共通化しない)。
//  cyan/red二色分類はdoboku側と同じ理由でredIndices常に空配列。
//  holesMm(frustum自身の穴)はdoboku側同様earcutに渡していない未対応のまま。
//  今後対応する場合はdoboku側と必ず並行修正すること(地雷25: 非対称修正禁止)。
// ════════════════════════════════════════════════════════════

async function buildSimpleExtrudeGeom(frustums){
  if(!frustums || !frustums.length) return null;

  frustums = frustums.filter(f => {
    if(!f.ptsMm || f.ptsMm.length < 3) return false;
    if((f.area||0) < 1e-6) return false;
    if(f.D <= 0) return false;
    if(f.ptsMm.some(p => isNaN(p.x) || isNaN(p.y))) return false;
    return true;
  });
  if(!frustums.length) return null;
  console.log(`[3D ${VOLDIA3D_VER}] buildSimpleExtrudeGeom(通常計算・Manifold方式) 開始: frustums=${frustums.length} 頂点量子化=${window._vertexQuantMm}mm`);

  // r044-fix②と同一の入力事前量子化（地雷25: buildManifoldUnionGeomと完全同一ロジックを踏襲）
  (function preQuantizeInput(){
    const inQuantMm = Math.max(window._vertexQuantMm||0, 1);
    const inQF = 1000/inQuantMm;
    function qxy(p){ return { x: Math.round(p.x*inQF)/inQF, y: Math.round(p.y*inQF)/inQF }; }
    frustums.forEach(f=>{
      f.ptsMm = f.ptsMm.map(qxy);
      if(f.holesMm) f.holesMm = f.holesMm.map(h=>h.map(qxy));
    });
  })();

  const SC = 0.001; // mm→m

  const positions = [];
  const cyanIdx   = [];
  const redIdx    = []; // r064: doboku側r062と同じ理由で常に空（貫入交点の概念が消滅）

  const quantFactor = window._vertexQuantMm > 0
    ? (1000 / window._vertexQuantMm)
    : 200000;
  if(window._vertexQuantMm===0 || window._vertexQuantMm<5){
    console.warn(`[VERT-QUANT] 頂点量子化=${window._vertexQuantMm}mm は精度が高すぎます。`
      + `LandXML(重機施工用)出力ではmm未満の精度は不要かつ非多様体エッジの原因になりやすいため、10mm以上を推奨します。`);
  }
  const vMap = new Map();
  function regV(x, y, z){
    const key = `${Math.round(x*quantFactor)}_${Math.round(y*quantFactor)}_${Math.round(z*quantFactor)}`;
    if(vMap.has(key)) return vMap.get(key);
    const idx = positions.length / 3;
    const qx = window._vertexQuantMm > 0 ? Math.round(x*quantFactor)/quantFactor : x;
    const qy = window._vertexQuantMm > 0 ? Math.round(y*quantFactor)/quantFactor : y;
    const qz = window._vertexQuantMm > 0 ? Math.round(z*quantFactor)/quantFactor : z;
    positions.push(qx, qy, qz);
    vMap.set(key, idx);
    return idx;
  }

  // 通常計算のcontourOf: r035〜r059の旧buildSimpleExtrudeGeomから無変更で踏襲。
  // doboku側contourOfにあるDOBOKU_VERTICAL_TAPER_FIXED_MM(2026-08-24問題B対応で
  // 角度ベース3°→固定15mmに変更)の垂直面回避ハックは、GL(z=0)蓋除去ステップの
  // 数値安定化専用なので、蓋除去自体が無い通常計算には不要（意図的に移植しない）。
  function contourOf(f, zMm){
    if(f.noSlope) return offsetPolygon(f.ptsMm, f.OD);
    const top = -(f.tl||0);
    const fromTop = zMm - top;
    // 天端(浅い側)が広く、底面(深い側)に向かって狭まる仕様（法面の通常挙動）
    const ratio = 1.0 - fromTop / f.D;
    const dist = Math.max(0, f.OD + ratio * f.D * getSlopeRatio());
    return offsetPolygon(f.ptsMm, dist);
  }
  function topContour(f){ return contourOf(f, -(f.tl||0)); }
  function botContour(f){ return contourOf(f, f.D - (f.tl||0)); }
  function tlY(f){ return (f.tl||0) * SC; }
  function botY(f){ return ((f.tl||0) - f.D) * SC; }

  // doboku側r062のbuildCappedFrustumMeshと完全同一ロジック（地雷25: 意図的な重複）。
  function _buildRingLoftMesh(topRing, yTop, botRing, yBot){
    const n = topRing.length;
    const m = botRing.length;
    const verts = [];
    const tris = [];
    topRing.forEach(p => verts.push(p.x * SC, yTop, p.y * SC));
    botRing.forEach(p => verts.push(p.x * SC, yBot, p.y * SC));
    {
      const flat = [];
      topRing.forEach(p => flat.push(p.x, p.y));
      const capTris = earcut(flat, null, 2);
      for(let i=0;i<capTris.length;i+=3) tris.push(capTris[i], capTris[i+1], capTris[i+2]);
    }
    {
      const flat = [];
      botRing.forEach(p => flat.push(p.x, p.y));
      const capTris = earcut(flat, null, 2);
      for(let i=0;i<capTris.length;i+=3) tris.push(n+capTris[i], n+capTris[i+2], n+capTris[i+1]);
    }
    const sideN = Math.min(n, m);
    for(let k=0;k<sideN;k++){
      const k2 = (k+1) % sideN;
      const t0=k, t1=k2, b0=n+k, b1=n+k2;
      tris.push(t0, b0, t1);
      tris.push(t1, b0, b1);
    }
    return { vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris), numProp: 3 };
  }

  // r068: buildCappedFrustumMeshは配列を返す(通常は要素数1)。
  // 天端/底面2リングだけのloftでは、深さ方向の途中で自己交差状況が変わる
  // (コの字ノッチが途中の深さで閉じる等)ケースを正しく表現できないため
  // (AIS_CrashTest2「地雷①③」で確認)、その場合のみ深さを_SLICE_N等分し、
  // 隣接スライス間だけをloftすることでトポロジ変化を薄い1層に閉じ込める。
  // 自己交差が無い通常ケースはr067までと完全に同じ単一メッシュを返す。
  function buildCappedFrustumMesh(f){
    const topRing0 = topContour(f);
    const botRing0 = botContour(f);
    const topS = _sanitizeOffsetRing(topRing0);
    const botS = _sanitizeOffsetRing(botRing0);

    if(!topS.changed && !botS.changed){
      // r065(AIS修正案): topRing0とbotRing0の頂点数が丸め等でズレている場合、
      // _buildRingLoftMeshは少ない方の頂点数(Math.min)に合わせて側面を張って
      // 終了してしまい、メッシュに穴が開いて非多様体(Not manifold)になる。
      // 頂点数が違う場合は_resampleRingByArcLengthで強制的に揃えてから渡す。
      let topR = topRing0, botR = botRing0;
      if(topR.length !== botR.length){
        const M = Math.max(topR.length, botR.length, 8);
        topR = _resampleRingByArcLength(topR, M);
        botR = _resampleRingByArcLength(botR, M);
      }
      return [_buildRingLoftMesh(topR, tlY(f), botR, botY(f))];
    }

    console.warn('[SLICE-LOFT] 深さ方向のトポロジ変化を検出、' + _SLICE_N + '分割でロフトします');
    const topZmm = -(f.tl||0);
    const botZmm = f.D - (f.tl||0);
    const sliceRings = [];
    for(let k=0;k<=_SLICE_N;k++){
      const zMm = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const raw = contourOf(f, zMm);
      const s = _sanitizeOffsetRing(raw);
      sliceRings.push(s.pts);
    }
    const meshes = [];
    for(let k=0;k<_SLICE_N;k++){
      let ringA = sliceRings[k], ringB = sliceRings[k+1];
      if(ringA.length !== ringB.length){
        const M = Math.max(ringA.length, ringB.length, 8);
        ringA = _resampleRingByArcLength(ringA, M);
        ringB = _resampleRingByArcLength(ringB, M);
      }
      const zA = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const zB = topZmm + (botZmm - topZmm) * (k+1) / _SLICE_N;
      meshes.push(_buildRingLoftMesh(ringA, -zA*SC, ringB, -zB*SC));
    }
    return meshes;
  }

  function _meshSignedVolume(vertProperties, triVerts){
    let vol = 0;
    for(let i=0;i<triVerts.length;i+=3){
      const a=triVerts[i]*3, b=triVerts[i+1]*3, c=triVerts[i+2]*3;
      const ax=vertProperties[a], ay=vertProperties[a+1], az=vertProperties[a+2];
      const bx=vertProperties[b], by=vertProperties[b+1], bz=vertProperties[b+2];
      const cx=vertProperties[c], cy=vertProperties[c+1], cz=vertProperties[c+2];
      vol += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
    }
    return vol;
  }

  // ── Manifold WASM 取得（_getManifoldWasmはdoboku側と共有・モジュールスコープ、
  //    ここでは呼び出すだけで重複実装しない） ──
  const wasm = await _getManifoldWasm();
  const { Manifold, Mesh } = wasm;

  const manifoldObjs = [];
  try {
    frustums.forEach((f, i) => {
      const meshDatas = buildCappedFrustumMesh(f); // r068: 配列(通常は要素数1)
      meshDatas.forEach((meshData, j) => {
        let vol = _meshSignedVolume(meshData.vertProperties, meshData.triVerts);
        if(vol < 0){
          // 法線が内向きだった場合は全三角形の巻き順を反転
          const tv = meshData.triVerts;
          for(let t=0;t<tv.length;t+=3){ const tmp=tv[t]; tv[t]=tv[t+1]; tv[t+1]=tmp; }
        }
        const man = new Manifold(new Mesh(meshData));
        if(man.status && man.status() !== 'NoError'){
          const label = meshDatas.length>1 ? ('frustum'+i+'-slice'+j) : ('frustum'+i);
          console.warn('[MANIFOLD] ' + label + '(通常計算)の単体メッシュがwatertightでない可能性: status=' + man.status());
        }
        manifoldObjs.push(man);
      });
    });

    console.log(`[MANIFOLD] union実行(通常計算): ${manifoldObjs.length}個のfrustum`);
    const unioned = Manifold.union(manifoldObjs);
    if(unioned.status && unioned.status() !== 'NoError'){
      console.warn(`[MANIFOLD] union結果のstatus異常(通常計算): ${unioned.status()}`);
    }
    const resultMesh = unioned.getMesh();
    unioned.delete();

    // r064: 通常計算はGL(z=0)基準の蓋除去が不要（doboku側との唯一の構造差分）。
    // 天端・底面とも実体として残し、union結果の全三角形をそのままcyanへ出力する。
    const pos = resultMesh.vertProperties;
    const tv  = resultMesh.triVerts;
    for(let i=0;i<tv.length;i+=3){
      const i0=tv[i], i1=tv[i+1], i2=tv[i+2];
      const gi0 = regV(pos[i0*3], pos[i0*3+1], pos[i0*3+2]);
      const gi1 = regV(pos[i1*3], pos[i1*3+1], pos[i1*3+2]);
      const gi2 = regV(pos[i2*3], pos[i2*3+1], pos[i2*3+2]);
      cyanIdx.push(gi0, gi1, gi2);
    }
    console.log(`[MANIFOLD] union後三角形(通常計算)=${tv.length/3} 最終三角形=${cyanIdx.length/3}`);
  } finally {
    // WASMオブジェクトは自動GCされないため明示的に解放（メモリリーク防止）
    manifoldObjs.forEach(m => { try{ m.delete(); }catch(e){} });
  }

  return {
    positions: new Float32Array(positions),
    cyanIndices: new Uint32Array(cyanIdx),
    redIndices:  new Uint32Array(redIdx)
  };
}


