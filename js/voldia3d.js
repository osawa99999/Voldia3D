// ============================================================
// voldia3d.js — 3D変換・体積計算ロジック本体 (r104で旧単一ファイルから分離。以降の改修履歴は下の【rNNN】コメントと VOLDIA3D_VER を参照)
// ============================================================
// 【r137】(49回目。r136の実機確認でCrackTorture_v02の下側(地中梁X7・X8の付近)に線が2か所残った件)
//   原因: 5mmを超えて動くため元のままにした図形(5.5〜6.2mmズレの梁)の辺が、格子の位置(位相)の評価から漏れていた。他の直線との5〜10mmの近接が格子の境目で割れて細い面になっても、位相の選択も作り直しの判定も気づけなかった。
//   対策: 元のままにした図形の辺の両端の値も、位相の評価(割れる組の数)に入れる。CrackTorture_v02は不具合1→0。
// 【r136】(49回目。マスター作のテスト図面Voldia_CrackTorture_v02.vold(地中梁の5.5〜6.2mmズレ・27°/53°の斜め梁・境界跨ぎ等を混ぜたもの)で、r135が不具合5→7件と悪化した件)
//   原因: 入口の整えの主方向θを『全辺の円平均』で求めていたため、別方向の斜め梁(27°/53°)に平均が約0.2°引っ張られ、回転座標系が全体でずれた。長い辺が約30mm傾いて(5mmの上限を超え)整えがほぼ効かず、回転だけ掛かって悪化。
//   対策: _alignDominantを、いまの主方向から3°以内の辺だけで求め直す繰り返し(最大8回)に変更=斜めの外れ値に引っ張られない。集中度は『主方向の軸から1.5°以内の辺の長さの割合』に変更。
// 【r135】(49回目。r134の実機確認で、赤丸の位置(同じ図面Voldia_261121_2332.vold)に底面の『裏返った細い三角形1枚(幅6mm・長さ1.4m)』が線として残った件)
//   原因: 10mm格子丸めと座標系の位相(平行移動)の組み合わせで、底面の三角形分割に細い三角形が出て裏返る(5mm以下の格子なら出ない=丸めが原因)。位相は直線の値だけでは決まらない。
//   対策: 位相の候補を上位3×3から最大6通り用意し(_alignFrustumsMmの_alignPhases)、作った結果に不具合(細長い逆勾配・底面の裏返り=_alignDefectCount)が出たら次の候補の位相で作り直す(最初で0件なら1回だけ=通常は時間増なし)。最も不具合の少ない結果を採用。
// 【r134】(49回目。床クラック問題=傾いた格子状基礎などで出る『幅2〜8mm・高さ約2.6mの細長い逆勾配の面』の根本対策P0。提案=Arecal担当 01_床クラック問題_解決提案_v001.md)
//   原因: 別々の図形の『ほぼ同じ直線』が10mm格子丸めで数mmずれ、ほぼ重なる法面どうしの交線が細長い三角形になる(出口側の間引きでは3〜4割しか減らない)。
//   対策: ①getAllFrustums(共有の入口)で_alignFrustumsMm: 主方向θ→ほぼ軸平行(1.5°以内)の辺を真っ直ぐに→図形をまたぐ同一直線を5mm以内で1本にそろえる(移動は頂点ごと・図形ごとに5mmまで。超える図形は元のまま)。
//         そろえた輪郭は世界座標のまま持つ(体積側・2D・保存データには回転の影響なし)。各frustumに_alignTheta(θ)を付ける。
//         ②buildManifoldUnionGeom(外側のラッパー): _alignThetaがあれば全frustum(とグレー・山留)を−θ回転した座標系で3D生成(10mm格子丸めがそろえた直線を壊さない)→結果(positions・山留/紫壁オーバーレイ)を+θで戻す。呼び出し側は変更不要。
//   切り戻し: window._alignEdges=false で入口の整えを止める(従来どおり)。前版=backup/voldia3d_r133.js
// 【r126】(44回目) ①紫の壁ハッチからグレー(既存躯体)と接する部分を除外(_buildGrayPrisms/_clipTriOutsideGrayPrisms。3Dイメージと配置モードの両方。
//   Voldia_261029_1550.vold)。グレーを渡さない呼び出しは従来と完全に同じ。
//   ②掃除(挙動不変): 未使用ローカル(origColors/epsilon/v0i,v1i,v2i)、『撤去予定』のまま残っていた[DIAG-B]診断ブロック(計算のたびに既存躯体の重なりメッシュを
//   もう一度作ってログに出すだけだった。_diagMeshVolume自体は voldia_export.js の[DIAG-B-GLB]が使うので残す)、古い関数名calcAll()→runCalc()のコメント修正。
// 【r125】(44回目。Voldia_261029_1310.vold『隣り合う2オブジェクトの法面に角(とんがり)が出る』)
//   原因・対処は _mergeTouchingSameDepthFrustums のコメント参照。3D表示(buildManifoldUnionGeom)と体積(buildUnionFrustumGeometry→_calcVolumeFallback)の両方に適用。
//   同条件(深さ・天端・余掘り・法面)で接する/重なる非紫・非グレー・穴なしのオブジェクトだけ、オフセット前に1輪郭へ合体。合体しない時は従来と完全に同じ。
//   安全装置: 合体した輪郭が凹形だと既存の層分け(loft)で3Dが壊れることがあるので、合体した1図形を実際に3D化して数値積分と0.5%以内で合う時だけ採用(_mergeSameDepthFrustumsValidated)。合わなければ従来どおり個別。
// 【r124】(44回目。Voldia_261027_1508.vold『3Dイメージで山留ハッチが一部だけ消える』=配置モードでは出る)
//   原因: r117の山留ハッチ絞り込み(_clipYamadomeOverlayToContact)が『三角形の3頂点が辺kの範囲[-0.5m,長さ+0.5m]内』を要求していた。
//         山留に一直線上の頂点(折れ角0°。1508.voldは辺5→辺6)があると、山留でカットした壁は辺5と辺6にまたがる1枚の大きな三角形になり、
//         頂点が辺5の終点を1m以上越える→範囲外で不合格(辺6側も始点より手前で不合格)→辺5(7.7m)のハッチが丸ごと消える。
//         山留の頂点を少し動かすと折れ角がつき壁が辺ごとの三角形に分かれるので出る(マスターの観察と一致)。
//   修正: 3頂点が辺kの面(バッチ角つき傾斜面)の上にあるかだけを見る。範囲は従来どおり s0/s1 を辺の長さ内にクランプ(またがる三角形は各辺で重なる区間だけ採用)。
//         表示専用(形状・体積・GLB・LandXMLは無変更)。失敗時は従来どおり全周表示のまま。
// 【r123】(43回目。マスター案B: 『1度3Dを作り、同一平面なのに必要以上に多い面を整理して作り直す』=現行ロジックへの追加ロジック)
//   背景: 変化点が近い形(Voldia_261027_1412.vold: 168mmと282mm)は薄い層が残り、最後の頂点量子化10mmの丸めで法面が2〜3°傾く(PDFの面が増え3Dに横線)。
//         吸収(多対1)で薄い層を消すと形がずれる(48mm)ので、形を変えずに面だけ整理する別手段が必要だった。
//   実装: _simplifyFrustumManifold。傾斜つきの法面frustum(blue)だけ、層メッシュを量子化格子へ丸め(Mesh.merge)→union→元ID統合
//         (層ごとのoriginalIDが残るとSimplifyが層をまたいで畳まない)→Manifold.simplify(量子化の1.5倍)。
//         採用条件: 三角形が減る/status正常/体積0.1%以内。満たさなければ何もしない。紫・グレー(微テーパー15mm)と量子化0(LandXML用)は対象外。
//   結果: 該当形状1/80〜1/106が109→51三角形・傾き乱れ0。やばい/やばい２/やばい3は全縮尺34〜38三角形(旧59〜60)・体積±0.06%・外形ずれ≤12mm。
//         独立基準のランダム717件で悪化0(三角形数合計13391→13093)、LandXML用1920件は旧と完全一致。
// 【r122b】(43回目。Voldia_261027_1412.vold『法面交差部から上が面だらけ(分割数の爆発)』)
//   原因: 上面/下面の頂点数が違い、途中で頂点数が複数回変わる形(変化点2つ=15→16→17頂点)は、_loftLayerTopoが『中点で2分割して再帰』する。
//         変化点でも何でもない深さ(中点: 225/450/900mm…)に層境界ができ、同じ平面の面が細切れになる(1/100: 層6枚・209三角形→PDFの面が爆発)。
//   修正: 層が3枚以上になる時は、サンプル16点から変化点だけを拾う境界方式(_boundariesPlan→_buildLayersByBoundaries)で層を割り直す
//         (層は変化点と吸収後の端だけで割れる)。境界方式の端吸収にも、_loftLayerTopoと同じ『ずれ量(輪郭線距離)が量子化の1.5倍以内』の判定を追加。
//   結果: 該当形状 1/100: 209→109三角形(外形ずれ最大8mm)。1/118以上は49〜64三角形。
//   残: 変化点が近い(114mm等)形は、吸収するとずれが大きい(48mm)ので薄い層が残り、量子化10mmで法面が2〜3°傾く(1/94〜1/112)。
// 【r122】(43回目。やばい3.vold『耳』=法面の隣り合う面の間に出る針状の余計な面の根本修正。1/71〜1/192で発生、1/193は正常だった)
//   原因: 局所二等分線方式のオフセット(offsetPolygon)は、辺が消える深さを過ぎると、その辺が元と逆向きに反転したまま残る
//         (図形に一直線上の頂点(180°)がある時や星形で発生)。自己交差の面積が出ないとClipperは直さず、反転した辺が針/折り返しとして
//         壁の面に出た(独立基準のClipperOffsetとの外形ずれ: 1/100で最大1290mm・1/150で526mm)。
//   修正: ①offsetPolygon(…, fixInverted=true) で、反転した辺(元の辺と逆向き)を『前後の辺の延長線の交点1点』に置き換える(_collapseInvertedEdges)。
//         contourOfの3か所(Manifold方式/通常計算/_frustumLayerStable)で有効化。頂点数が-1になるので、既存の変化点(多対1)の仕組みに載る。
//         ②変化点が上面/下面の近い(_absorbMm未満)時は、_loftLayerTopoでも薄い層を作らず1枚の多対1loftで繋ぐ(r121と同じ考え方)。
//           ただし吸収で形がずれる量(変化点の深さでの輪郭線どうしの距離)が量子化の1.5倍(量子化0なら2mm)以内の時だけ。
//   検証: 独立基準(ClipperOffset)で、ランダム475形状の外形ずれ>30mmが 17件→新ゲートで通る形は0件(通過の最大20mm)。
//         体積差>0.5%は717件中18→9件、偽の床6→1件。Land Logic(量子化0・紫・グレー)の出力は旧と完全一致(垂直面0件のまま)。
// 【r121】(43回目。1/71・1/160〜1/190の法面の横線の根本修正。対象: _buildLayersByBoundariesの吸収処理・_linearPlanarOKのみ)
//   原因: 上面近くの変化点を吸収する時、変化点の後のリングを上面へ置き直していた→頂点が(深さのずれ×頂点速度)動き線形チェックが誤判定
//   →薄い層(1/71は上面0.11m)→量子化10mmの丸めで法面が傾き横線。さらに生まれたての短い辺(<0.5mm)の向きが信用できず平面チェックも誤判定していた。
//   修正: ①吸収は上面/下面の本物のリングを使い変化点の前後は多対1で繋ぐ ②線形チェックは本来の深さ(zAfter/zBefore) ③0.5mm未満の辺は平面チェックを飛ばす
//   ④吸収距離=_absorbMm()=量子化×30(300mm)。window._eventAbsorbMmで上書き可(検証用)。
//   ⑤対応が作れない変化点は従来の置き直しになるため、従来の距離(_snap=20mm)までしか吸収しない(300mmまで置き直すと体積が4%ずれた)。
//   ⑥新: _frustumLayerStable(f) = 法面が安定して作れるかの事前判定(層の計画だけの予行演習)。作れない形(頂点の対応が作れず
//      従来リサンプル/V1に落ちる形=偽の床・面の爆発・体積ずれが出た形)は、runCalcで既存の自己交差チェックと同じく赤にして中止。
//      マスター方針(43回目): 変な形状でExcel/PDFが出るくらいなら弾く。ただし出せる形は弾かない(まず安定させ、駄目なものだけ弾く)。
// 【r120】(42回目。実機GLBで残った「法面の中段の凹凸・横線」の根本修正。対象: buildCappedFrustumMeshの層の組み立てのみ)
//  原因: 変化点(頂点数が変わる深さ)の隣に薄い層(例:1/100の72mm、1/185の上面から68mm)ができ、頂点量子化(10mm)の丸めが薄い層で相対的に大きく効き、
//   本来45°の法面が数度傾いて波打つ(Node検証: 量子化1mmだと傾きの乱れが0になる=量子化が原因。床=偽の水平面とは別物)。
//  修正: _buildLayersByBoundaries=変化点を全部先に求め、「上面〜変化点〜…〜下面」の各区間を1枚のloftにする(変化点の前後で頂点が少ない側を境界のリングにして
//   多い側は多対1。_buildRingLoftMeshMapped2)。上面/下面から量子化の2倍以内の変化点は、薄い層を作らず吸収。区間が線形/平面から外れる時だけ最もずれたサンプルで割る。
//   変化点が近接/対応が作れない時はnull→従来方式(_buildLayersAdaptiveV1)にフォールバック。
//  結果(やばい.vold Node走査): 1/71〜1/169は偽の床なし・体積誤差0.15%以内・傾き乱れなし。1/100は110→60三角形、傾きの最大ずれ0.091→0.007。
//   1/170〜1/192は上面近傍の薄い層(68mm等)に傾きの小さな乱れが残る(最大数度)。1/70以下は従来どおり(警告で逃げる想定)。
// 【r119】(42回目。1/193で法面が16本の水平な帯に割れ、PDF/Excelの面分割が異常に細かくなる件の根本修正。対象: buildCappedFrustumMeshの層分けのみ)
//  原因: 輪郭に『ピンチ(最短ギャップ<20mm)』があるだけで(頂点数は変わらなくても)全体を一律16等分の層に割っていた。1/193は最短ギャップ11.5mmで発動、1/194は発動せず1枚のloft=境目。
//  修正: _planSliceLayers=頂点数が同じ連続区間は、(1)途中のリングが両端の線形補間と2mm以内 かつ (2)側面が平面(平行な辺同士=ねじれ無し) の限り1枚のloftにまとめる。
//   頂点数が変わる所・線形/平面から外れる所だけが層の境目(固定刻みではなく変化点で割る)。(2)が無いと辺反転のある形で体積が最大5%減った(ランダム形状の回帰テストで実測)。
//  結果: やばい.vold 1/193は37三角形(r118: 427、1/194と同じ綺麗な分割)。1/100は110(r118: 436)。体積は数値積分と0.2%以内。
// 【r118】(42回目。「やばい.vold」3D破綻=偽の床の根本修正。対象: 深さ方向のloft(buildCappedFrustumMesh。buildManifoldUnionGeomとbuildSimpleExtrudeGeomの両方)のみ。体積計算本体・Land Logic・UI無改造)
//  根本原因: 深さの層ごとに輪郭(_sanitizeOffsetRing=ClipperLibの自己Union)を取り、隣り合う2リングを『頂点番号の1対1』でloftしていたが、
//   (1)法面で広げた輪郭の辺が途中で長さゼロに潰れて頂点数が変わる層は、_resampleRingByArcLengthで弧長等分に取り直していた=頂点の対応が崩れ、
//      薄い層にねじれた水平に近い面(=偽の床)ができた(1/100で y=-0.9〜-0.788 の4段)。
//   (2)ClipperLibは輪郭の開始頂点を保証しない。ピンチ判定の層だけ開始頂点が1つずれ、頂点の対応が崩れて偽の床になった(1/85で実測)。
//  修正: (a)_loftLayerTopo=頂点数が変わる深さを二分探索で特定→その深さで層を割り、頂点が少ない側のリングを境界にして、
//        多い側の層だけ『多対1』の対応(潰れる辺=三角形1枚)で張る(_buildRingLoftMeshMapped)。固定刻みの細分化はしない(地雷25b)。
//        対応が作れない(頂点が同位置に重ならない=小さな輪の残る/消える、等)時はnullを返し、従来のリサンプルにフォールバック(console: [TOPO-LOFT])。
//        (b)_alignRingTo=同数の隣接リングは、開始頂点・向きを前のリングに合わせる(ずれが無ければ無変更=通常ケースの出力は従来と同一)。
//  検証(Node+manifold-3d 3.5.1): やばい.vold 縮尺1/70・1/85・1/100・1/120・1/150で水平面が底のみ・体積が数値積分と0.02%以内。1/194は従来と同一。
//   ランダム多角形500件: 出力が旧と完全一致347/改善131/悪化は両方破綻のままの微差2件のみ。破綻(偽の床>0.1m²or体積誤差>0.5%)は190→110。
//  既知の限界: 1/60の層0→1(渦の消滅+頂点の一斉消滅)など、対応が作れない形はフォールバック(従来と同じ挙動)。マスターの実機で最終判定。
// 【r113】(40回目。見た目のみ・計算ロジック無改造) 3D結果画面の右UI整理に伴い、メッシュ/影/色の3ボタンの表示を
//  「文字の差し替え(▦ メッシュ ON/OFF 等)+透明度」から「ボタン色(.on クラス)」に変更。ボタン本体はHTML(Voldia_v0134)に常設
//  (影ボタンはr101以来のJS動的生成をやめた。ensureShadowButtonは既存ボタンがあれば何もしないので、中の複製処理は到達しなくなった=次回の整理候補)。
//  対象: toggleBaseGridVisibility / updateShadowButtonLabel / toggleMeshSolid(2か所)/ ソリッド⇔グラデ復帰時の初期化1か所 / メッシュ状態の同期1か所。
// 【r111 削除一覧】(39回目。全ファイル=JS5本+HTML2本を横断検索し、呼び出し元ゼロと確認した関数だけを削除。挙動は変えていない)
//  isPointInsideFrustumExcavation / getLineSegmentsIntersection / getPolygonIntersections(旧Vertex-First方式の部品)
//  getJSTTimestamp(getVoldiaTimestampに統一済み) / classifyPathsSafe(誰も呼んでいなかった) / _removeCollinearPts / _delaunayFlip(earcut後処理)
//  【r112】_lastExistingStructGeoms(書き込みのみのキャッシュ)も削除(代入6か所+宣言。voldia_main.js側の2か所も削除)。残り未着手: 関数内の未使用ローカル(clipperDifference重複 等)。
//  ※ このファイルの冒頭ヘッダ『r104より分離』は古いまま(別件の小整理)。

// 3D高さ逆算用：2D平面上での点Pから線分ABへの最短距離を求める
// 【問題B対応・2026-08-24マスター指示】LandXMLの垂直面回避ハック(noSlopeオブジェクトの
// 天端側だけ角度ベースの極小テーパーを持たせていた仕組み)を、深さに比例して天端のズレが
// 増大する角度指定方式から、深さによらず常に一定量だけ外側にオフセットする固定値方式に変更。
// 15mmという値は、(a)頂点量子化(既定10mm)で潰れて完全垂直に戻らない下限を確保しつつ、
// (b)土工の施工誤差(±30〜50mm)に対して十分小さい、という両方の条件から選定。
// buildManifoldUnionGeom内のcontourOf()と、(r111で削除済みの)isPointInsideFrustumExcavation()の
// 両方でこの値を使う(旧実装ではisPointInsideFrustumExcavation側だけ独自に
// window._vertexQuantMm+1という別の固定値を使っており、値がズレる余地があったため統一)。
const DOBOKU_VERTICAL_TAPER_FIXED_MM = 15;
// r106(36回目): Land Logic(LandXML用GLB)の「微テーパー量(mm)」を1か所で管理する変数。
// 完全な垂直面(同一XZでYだけ違う頂点)はLandXML(TIN)で扱えないため、天端側だけ外へこの量だけ広げる。
// 現在は他AIの検証待ちで10mmを維持。変更するならこの数値だけを書き換える(Land Logicが起動時にここを読む)。
// ※上のDOBOKU_VERTICAL_TAPER_FIXED_MM(15mm)は別物: 3D表示・体積計算(山留/紫の強制垂直)用で、LandXML出力には使われない。
//   使用箇所の一覧は「Voldia_微勾配10mm_使用箇所一覧」を参照。
const LANDXML_MICRO_TAPER_MM = 10;
window.LANDXML_MICRO_TAPER_MM = LANDXML_MICRO_TAPER_MM;
// r109(37回目): 微テーパー(LandXML用の「壁を倒す量」)を壁の高さ別の可変にした(マスター案: 最小15mm・最大55mm)。
//   倒し量[mm] = clamp( baseMm + perMeterMm × 壁の高さ[m] , minMm , maxMm )  → 1m:15 / 2m:25 / 3m:35 / 4m:45 / 5m以上:55
//   ここ1か所の数値を変えるだけで全体に反映される。LANDXML_MICRO_TAPER_MMは旧版互換(この設定が無い時のみ使用)。
window.LANDXML_TAPER = { minMm: 15, maxMm: 55, baseMm: 5, perMeterMm: 10 };
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
// 【r111 削除】isPointInsideFrustumExcavation() / getLineSegmentsIntersection() / getPolygonIntersections()
//   旧「Vertex-First Triangle Fill」方式(SECTION 5のコメント参照)の部品。全ファイル横断で呼び出し元ゼロを確認して削除
//   (getPolygonIntersectionsだけがgetLineSegmentsIntersectionを呼んでいて、そのgetPolygonIntersections自体が未使用だった)。
//   現行は r062〜 のManifoldベース(buildManifoldUnionGeom)。SECTION 5コメント内に名前が残っているのは経緯の記録。
//   必要になったら r110 のファイルから復元できる。

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
// r134(49回目): 3D生成だけ回転・平行移動した座標系で行う間の座標系。null=通常(世界座標)。buildManifoldUnionGeomのラッパーだけが設定する。
let _frame = null; // {th,tx,ty}: 回転(−th)してから(tx,ty)mm平行移動した座標系。null=世界座標
function getYamadomeMmPolygon(offsetXmm, offsetYmm){
  offsetXmm = offsetXmm || 0; offsetYmm = offsetYmm || 0;
  if(typeof yamadome === 'undefined' || !yamadome || !yamadome.pts || yamadome.pts.length < 3) return null;
  const mmpx = (25.4/72) * scaleDenom / RS;
  let pts = yamadome.pts.map(p => ({x: p.x*mmpx - offsetXmm, y: p.y*mmpx - offsetYmm}));
  if(_frame){ const _c=Math.cos(-_frame.th), _s=Math.sin(-_frame.th); pts = pts.map(p => ({x: p.x*_c - p.y*_s + _frame.tx, y: p.x*_s + p.y*_c + _frame.ty})); } // r134: 回転した座標系の山留
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
// r122(44回目): 『消えた辺(辺イベント)』の処理。局所二等分線方式のオフセットは、辺が消える深さを超えると、その辺が逆向きに
//  反転したまま残る(辺i: 元の向きと逆向き)。自己交差の面積が出ないと下流のClipperは直さず、反転した辺が針/折り返しとして
//  壁の面に出る(=『耳』。やばい.voldで本来の外形から最大0.76m外れた)。消えた辺は、前後の辺の延長線の交点1点に置き換えるのが
//  本来のオフセット輪郭(頂点数-1)。連鎖(消えた辺の隣も消える)は繰り返して処理する。
function _collapseInvertedEdges(p, out){
  let R = out.map(v => ({x: v.x, y: v.y}));
  let O = p.map((v, i) => { const w = p[(i+1) % p.length]; return {x: w.x - v.x, y: w.y - v.y}; });
  for(let guard = 0; guard < p.length + 2; guard++){
    const n = R.length; if(n <= 3) break;
    let hit = -1;
    for(let i=0;i<n;i++){
      const o = O[i], rx = R[(i+1)%n].x - R[i].x, ry = R[(i+1)%n].y - R[i].y;
      const lo = Math.hypot(o.x, o.y), lr = Math.hypot(rx, ry);
      if(lo < 1e-6 || lr < 1e-6) continue;
      if((o.x*rx + o.y*ry) / (lo*lr) < 0){ hit = i; break; }   // 元の辺と逆向き=消えた辺
    }
    if(hit < 0) break;
    // 辺hitが index1 から始まるように回す: [prev, a, b, next, ...]
    const sh = ((hit - 1) % n + n) % n;
    R = R.slice(sh).concat(R.slice(0, sh)); O = O.slice(sh).concat(O.slice(0, sh));
    const a = R[1], b = R[2], o1 = O[0], o2 = O[2];
    const cr = o1.x*o2.y - o1.y*o2.x, l1 = Math.hypot(o1.x,o1.y), l2 = Math.hypot(o2.x,o2.y);
    let P;
    if(Math.abs(cr) < 1e-9 * l1 * l2){ P = {x: (a.x+b.x)/2, y: (a.y+b.y)/2}; }       // 平行(交点なし)→中点
    else{
      const t = ((b.x - a.x)*o2.y - (b.y - a.y)*o2.x) / cr;                          // a + t*o1 = b + s*o2
      P = {x: a.x + t*o1.x, y: a.y + t*o1.y};
    }
    R = [R[0], P].concat(R.slice(3)); O = [O[0], O[2]].concat(O.slice(3));
  }
  return R;
}
function offsetPolygon(pts, dist, isHole = false, maxExpandMult = 5, minOffsetMm = 0, fixInverted = false){
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
  
  const finalOut = cleanPolygonPoints((fixInverted && d !== 0) ? _collapseInvertedEdges(p, out) : out);
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
// r118(42回目): 深さ方向で輪郭の頂点数が変わる層(法面で広げた輪郭の辺が途中で長さゼロに潰れる等)を、
// 弧長リサンプルではなく「頂点の対応(どの頂点がどの頂点に潰れるか)」を保ったまま繋ぐ。
// 旧: 頂点数が違う2リング→_resampleRingByArcLengthで等分点に取り直す→頂点の対応が崩れ、
//     薄い層にねじれた水平に近い面(『やばい.vold』の偽の床)ができていた。
// 新: 頂点数が変わる深さ(zb)を二分探索で特定し、その深さで層を2つに割る。
//     頂点数が少ない側のリングを境界にして、多い側の層だけ『多対1』の対応(潰れる辺=三角形1枚)で張る。
//     どの層も頂点の対応は正しい(消える辺が長さゼロに潰れる所で接続)。固定刻みの細分化はしない。
//     対応が作れない/想定外の時はnullを返し、呼び出し側が従来(リサンプル)にフォールバックする。
// buildManifoldUnionGeomとbuildSimpleExtrudeGeomの両方から使う(地雷25a: 両方に同等に適用)。
// ────────────────────────────────────────────────────────────────
function _ringSignedArea2(r){
  let a = 0;
  for(let i=0;i<r.length;i++){ const p=r[i], q=r[(i+1)%r.length]; a += p.x*q.y - q.x*p.y; }
  return a;
}
// 同じ頂点数の2リングについて、ringをrefに最も近い巡回シフトに回す(向きが逆なら反転してから)。
// 理由(42回目): _sanitizeOffsetRing(ClipperLib)は輪郭の開始頂点・向きを保証しない。隣り合う層で開始頂点がずれると
//   頂点の対応が崩れ、側面がねじれて偽の床になる(『やばい.vold』1/85で実測: 層9→10で1つずれ=平均1780mmずれ)。
//   ずれが無い通常ケースはringをそのまま返す(出力は従来と同一)。
function _alignRingTo(ring, ref){
  const n = ring.length;
  if(n !== ref.length || n === 0) return ring;
  if(_ringSignedArea2(ring) * _ringSignedArea2(ref) < 0) ring = ring.slice().reverse();
  let best = 0, bc = Infinity;
  for(let s=0;s<n;s++){
    let c = 0;
    for(let i=0;i<n;i++){ const q = ring[(i+s)%n]; c += Math.hypot(q.x-ref[i].x, q.y-ref[i].y); }
    if(c < bc - 1e-9){ bc = c; best = s; }
  }
  if(best === 0) return ring;
  const out = [];
  for(let i=0;i<n;i++) out.push(ring[(i+best)%n]);
  return out;
}
// big(頂点が多い)の各頂点 → small(少ない)の最も近い頂点。巡回で単調(0または+1ずつ)かつ全射のときだけ返す。
// さらに、全ての頂点が「ほぼ同じ位置(tolMm以内)」にある時だけ有効とする。
//   理由: 辺が長さゼロに潰れる(=頂点が重なる)変化は、前後のリングで頂点が同位置に重なる。
//   一方、_sanitizeOffsetRingの判定しきい値(面積比1e-4・ピンチ20mm)をまたいで頂点数が変わる場合は、
//   前後のリングが別の形(小さな輪が残る/消える)で、対応は作れない=nullにして従来のリサンプルへ戻す
//   (無理に繋ぐとMeshがNot manifoldになる。ランダム形状の回帰テストで実測)。
function _mapBigToSmall(big, small, tolMm){
  const n = big.length, m = small.length;
  if(m < 3 || n <= m) return null;
  const tol = (tolMm === undefined) ? 0.5 : tolMm;
  const f = new Array(n);
  for(let i=0;i<n;i++){
    let bj = 0, bd = Infinity;
    for(let j=0;j<m;j++){
      const d = Math.hypot(big[i].x-small[j].x, big[i].y-small[j].y);
      if(d < bd){ bd = d; bj = j; }
    }
    if(bd > tol) return null;
    f[i] = bj;
  }
  let ones = 0;
  for(let i=0;i<n;i++){
    const d = ((f[(i+1)%n] - f[i]) % m + m) % m;
    if(d === 1) ones++;
    else if(d !== 0) return null;
  }
  if(ones !== m) return null;
  return f;
}
function _buildRingLoftMeshMapped(topRing, yTop, botRing, yBot, bigIsTop, f, SC){
  const n = topRing.length, m = botRing.length;
  const verts = [], tris = [];
  topRing.forEach(p => verts.push(p.x * SC, yTop, p.y * SC));
  botRing.forEach(p => verts.push(p.x * SC, yBot, p.y * SC));
  {
    const flat = []; topRing.forEach(p => flat.push(p.x, p.y));
    const c = earcut(flat, null, 2);
    for(let i=0;i<c.length;i+=3) tris.push(c[i], c[i+1], c[i+2]);
  }
  {
    const flat = []; botRing.forEach(p => flat.push(p.x, p.y));
    const c = earcut(flat, null, 2);
    for(let i=0;i<c.length;i+=3) tris.push(n+c[i], n+c[i+2], n+c[i+1]);
  }
  if(bigIsTop){ // f: topの頂点番号 → botの頂点番号
    for(let i=0;i<n;i++){
      const i2=(i+1)%n, j=f[i], j2=f[i2];
      tris.push(i, n+j, i2);
      if(j !== j2) tris.push(i2, n+j, n+j2);
    }
  } else {      // f: botの頂点番号 → topの頂点番号
    for(let i=0;i<m;i++){
      const i2=(i+1)%m, j=f[i], j2=f[i2];
      if(j !== j2){ tris.push(j, n+i, j2); tris.push(j2, n+i, n+i2); }
      else tris.push(j, n+i, n+i2);
    }
  }
  return { vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris), numProp: 3 };
}
// r122b: 輪郭(多角形)どうしの距離(ハウスドルフ距離)。頂点が壁の面に沿って滑るだけなら0(=面は正確)。
function _ringOutlineDev(E, R){
  const d2s = (p, a, b) => { const dx = b.x-a.x, dy = b.y-a.y, L2 = dx*dx+dy*dy; const u = L2 > 0 ? Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / L2)) : 0; return Math.hypot(p.x-(a.x+u*dx), p.y-(a.y+u*dy)); };
  const toRing = (p, ring) => { let m = Infinity; for(let k=0;k<ring.length;k++) m = Math.min(m, d2s(p, ring[k], ring[(k+1)%ring.length])); return m; };
  let dev = 0;
  for(const p of E) dev = Math.max(dev, toRing(p, R));
  for(const p of R) dev = Math.max(dev, toRing(p, E));
  return dev;
}
// 吸収(薄い層を作らず端のリングへ多対1で繋ぐ)で許す形のずれ。量子化の1.5倍(量子化0なら2mm)。
function _absorbDevTol(){ const q = window._vertexQuantMm; return (q > 0) ? Math.max(2, 1.5 * q) : 2; }
// ringAt(zMm)=その深さのサニタイズ済み輪郭。plainLoft=同数リング用の従来loft(各関数内の_buildRingLoftMesh)。
// 戻り値: メッシュ配列 / 失敗時null(→呼び出し側が従来のリサンプルにフォールバック)
function _loftLayerTopo(ringAt, zA, ringA, zB, ringB, SC, plainLoft, depth){
  const nA = ringA.length, nB = ringB.length;
  const Y = z => -z * SC;
  if(nA === nB) return [plainLoft(ringA, Y(zA), ringB, Y(zB))];
  if(depth > 6) return null;
  let lo = zA, hi = zB;
  for(let it=0; it<60 && Math.abs(hi-lo) > 1e-5; it++){
    const mid = (lo+hi)/2;
    if(ringAt(mid).length === nA) lo = mid; else hi = mid;
  }
  let ringLo = ringAt(lo), ringHi = ringAt(hi);
  if(!(ringLo.length === nA && ringHi.length === nB)){
    // 同じ層の中で頂点数が複数回変わる(または3種類以上)→中点で2分割して、それぞれ再帰
    const zM = (zA+zB)/2;
    let ringM = ringAt(zM);
    // 中点のリングも、隣のリング(頂点数が同じ方)に開始頂点・向きを合わせる(Clipperの出力順のずれ対策)
    if(ringM.length === nA) ringM = _alignRingTo(ringM, ringA);
    else if(ringM.length === nB) ringM = _alignRingTo(ringM, ringB);
    const a = _loftLayerTopo(ringAt, zA, ringA, zM, ringM, SC, plainLoft, depth+1); if(!a) return null;
    const b = _loftLayerTopo(ringAt, zM, ringM, zB, ringB, SC, plainLoft, depth+1); if(!b) return null;
    return a.concat(b);
  }
  ringLo = _alignRingTo(ringLo, ringA);
  ringHi = _alignRingTo(ringHi, ringB);
  const zb = (lo+hi)/2;
  // r122(44回目): 変化点が上面/下面の近く(_absorbMm未満)なら、薄い層を作らず、上面(A)→下面(B)を1枚の多対1loftで繋ぐ
  //  (薄い層は量子化10mmで法面の傾きが乱れ、横線になる=r121の吸収と同じ考え方。法面2面は厳密、変化点で生まれる小さな辺の面だけ楔形にずれる)。
  //  ただし吸収で形がずれる量(変化点の深さでの、本来のリング と 端リングを多対1で広げて反対端へ線形補間したリング の差)が
  //  許容(量子化の1.5倍。量子化0なら2mm)以内の時だけ。超える形は従来どおり変化点で2層に割る(ランダム星形で最大76mmずれた実測)。
  let nearEnd = false;
  if(Math.min(zb - zA, zB - zb) < _absorbMm()){
    const fq = (nA < nB) ? _mapBigToSmall(ringHi, ringLo) : _mapBigToSmall(ringLo, ringHi);
    if(fq){
      const t = (zb - zA) / (zB - zA);
      // 広げた端リングを反対端へ線形補間したリング(E)と、変化点での本来のリング(R)を、『輪郭線どうしの距離』で比べる
      //  (頂点が壁の面に沿って滑るだけなら面は正確なまま=頂点同士の距離ではなく輪郭線(辺)への距離で見る)
      const E = [], R = (nA < nB) ? ringHi : ringLo;
      if(nA < nB){ for(let i=0;i<nB;i++){ const a0 = ringA[fq[i]], b0 = ringB[i]; E.push({ x: a0.x + (b0.x - a0.x)*t, y: a0.y + (b0.y - a0.y)*t }); } }
      else { for(let i=0;i<nA;i++){ const a0 = ringA[i], b0 = ringB[fq[i]]; E.push({ x: a0.x + (b0.x - a0.x)*t, y: a0.y + (b0.y - a0.y)*t }); } }
      const dev = _ringOutlineDev(E, R);
      nearEnd = dev <= _absorbDevTol();
    }
  }
  if(nA < nB){ // 下へ行くと頂点が増える。境界=少ない側(ringLo)
    const f = _mapBigToSmall(ringHi, ringLo); if(!f) return null;
    if(nearEnd) return [ _buildRingLoftMeshMapped(ringA, Y(zA), ringB, Y(zB), false, f, SC) ];
    return [ plainLoft(ringA, Y(zA), ringLo, Y(zb)),
             _buildRingLoftMeshMapped(ringLo, Y(zb), ringB, Y(zB), false, f, SC) ];
  } else {     // 下へ行くと頂点が減る。境界=少ない側(ringHi)
    const f = _mapBigToSmall(ringLo, ringHi); if(!f) return null;
    if(nearEnd) return [ _buildRingLoftMeshMapped(ringA, Y(zA), ringB, Y(zB), true, f, SC) ];
    return [ _buildRingLoftMeshMapped(ringA, Y(zA), ringHi, Y(zb), true, f, SC),
             plainLoft(ringHi, Y(zb), ringB, Y(zB)) ];
  }
}

// r119(42回目): 深さ方向の層分けを「一律16等分」から「必要な所だけ」に変更するための計画関数。
//  旧: 輪郭にピンチ(最短ギャップ<20mm)があるだけで、頂点数が変わらない形でも全体を16本の帯に割っていた。
//      → 法面が16本の水平な帯に割れ、PDF/Excelの面分割が異常に細かくなった(1/193。1/194はピンチ判定に掛からず1枚)。
//  新: 頂点数が同じ連続区間で、途中のリングが両端の線形補間と2mm以内で一致する限り、1枚のloftにまとめる。
//      (法面の頂点は深さに対して直線的に動くので、トポロジー変化・非線形が無ければ1枚で厳密)
//      頂点数が変わる所・線形から外れる所だけが層の境目になる(固定刻みではなく、変化点で割る=地雷25b)。
const _SLICE_LINEAR_TOL_MM = 2;
// A(深さza)とB(深さzb)=同じ頂点数の2リングを1枚のloftで繋いでよいか。
//  (1)側面が平面(平行な辺同士)=ねじれ無し (2)途中のサンプルリングが両端の線形補間と一致。どちらもtol(mm)以内。
//  (1)が無いと辺反転のある形で体積が最大5%減った(ランダム形状の回帰テストで実測)。
function _linearPlanarOK(A, za, B, zb, samples){
  if(A.length !== B.length) return false;
  const H = Math.abs(zb - za);
  if(H < 1e-9) return false;
  for(let i=0;i<A.length;i++){
    const i2 = (i+1) % A.length;
    const ux = A[i2].x - A[i].x, uy = A[i2].y - A[i].y;            // P1-P0
    const vx = B[i].x - A[i].x,  vy = B[i].y - A[i].y;             // P2-P0 (z=H)
    const wx = B[i2].x - A[i].x, wy = B[i2].y - A[i].y;            // P3-P0 (z=H)
    const nx = uy*H, ny = -ux*H, nz = ux*vy - uy*vx;               // n = (ux,uy,0) x (vx,vy,H)
    const nl = Math.hypot(nx, ny, nz);
    if(nl < 1e-9) continue; // A側の辺が長さゼロ(潰れた辺)は平面の拘束なし
    // r121(43回目): 生まれたばかりの辺(長さが0.5mm未満)は向きが信用できない(Clipperの整数丸め0.1µmで向きが狂う)。
    //  その面は三角形(A側が点)に近く、平面の拘束は実質無い=スキップ。(これが無いと、変化点を吸収した直後のリングが毎回非平面と誤判定された)
    if(Math.hypot(ux, uy) < _SLICE_LINEAR_TOL_MM * 0.25) continue;
    if(Math.abs(nx*wx + ny*wy + nz*H) / nl > _SLICE_LINEAR_TOL_MM) return false;
  }
  for(let q=0;q<samples.length;q++){
    const R = samples[q].ring;
    if(R.length !== A.length) return false;
    const t = (samples[q].z - za) / (zb - za);
    for(let i=0;i<A.length;i++){
      const ex = A[i].x + (B[i].x - A[i].x) * t, ey = A[i].y + (B[i].y - A[i].y) * t;
      if(Math.hypot(R[i].x - ex, R[i].y - ey) > _SLICE_LINEAR_TOL_MM) return false;
    }
  }
  return true;
}
function _ringsLinearBetween(rings, a, b, zOf){
  const samples = [];
  for(let m=a+1;m<b;m++) samples.push({ring: rings[m], z: zOf(m)});
  return _linearPlanarOK(rings[a], zOf(a), rings[b], zOf(b), samples);
}
function _planSliceLayers(rings, zOf){
  const N = rings.length - 1, out = [];
  let k = 0;
  while(k < N){
    let j = k + 1;
    if(rings[j].length === rings[k].length){
      while(j < N && rings[j+1].length === rings[k].length && _ringsLinearBetween(rings, k, j+1, zOf)) j++;
    }
    out.push([k, j]);
    k = j;
  }
  return out;
}

// r120(42回目): 頂点数が変わる変化点の前後も、サンプル(1/16深さ)で細切れにせず『変化点で2枚』にまとめる。
//  理由: 変化点の隣に薄い層(例:やばい.vold 1/100の深さ788〜860mmの72mm)ができると、頂点の量子化(10mm)が
//   薄い層で相対的に大きく効いて法面が波打つ(実機GLBで法面の中段に凹凸。量子化1mmだと消えることをNodeで確認)。
//   [連続区間の先頭 pa ... 変化点 zb ... 次の連続区間の末尾 nc] を、zbの上下それぞれ1枚のloftにする。
//   (頂点が少ない側の境界リングを共有。多い側は『多対1』の対応)。線形/平面から外れる等で出来ない時はnull。
function _loftEventSegment(rings, zOf, ringAt, pa, ka, kb, nc, SC, plainLoft){
  const A = rings[pa], B = rings[nc], zA = zOf(pa), zB = zOf(nc), nA = A.length, nB = B.length;
  if(nA === nB) return null;
  let lo = zOf(ka), hi = zOf(kb);
  for(let it=0; it<60 && Math.abs(hi-lo) > 1e-5; it++){
    const mid = (lo+hi)/2;
    if(ringAt(mid).length === nA) lo = mid; else hi = mid;
  }
  let ringLo = ringAt(lo), ringHi = ringAt(hi);
  if(ringLo.length !== nA || ringHi.length !== nB) return null;
  ringLo = _alignRingTo(ringLo, rings[ka]);
  ringHi = _alignRingTo(ringHi, rings[kb]);
  const zb = (lo+hi)/2, Y = z => -z * SC;
  const sA = [], sB = [];
  for(let m=pa+1;m<=ka;m++) sA.push({ring: rings[m], z: zOf(m)});
  for(let m=kb;m<nc;m++) sB.push({ring: rings[m], z: zOf(m)});
  if(nA < nB){
    const f = _mapBigToSmall(ringHi, ringLo); if(!f) return null;
    const E = ringHi.map((_, i) => ringLo[f[i]]);
    if(!_linearPlanarOK(A, zA, ringLo, zb, sA) || !_linearPlanarOK(E, zb, B, zB, sB)) return null;
    return [ plainLoft(A, Y(zA), ringLo, Y(zb)),
             _buildRingLoftMeshMapped(ringLo, Y(zb), B, Y(zB), false, f, SC) ];
  } else {
    const f = _mapBigToSmall(ringLo, ringHi); if(!f) return null;
    const E = ringLo.map((_, i) => ringHi[f[i]]);
    if(!_linearPlanarOK(A, zA, E, zb, sA) || !_linearPlanarOK(ringHi, zb, B, zB, sB)) return null;
    return [ _buildRingLoftMeshMapped(A, Y(zA), ringHi, Y(zb), true, f, SC),
             plainLoft(ringHi, Y(zb), B, Y(zB)) ];
  }
}
// 層(スライス)分岐の組み立て本体。buildManifoldUnionGeomとbuildSimpleExtrudeGeomの両方から呼ぶ(地雷25a)。
//  rings=各サンプル深さのサニタイズ済み輪郭(同頂点数で隣り合うものは開始頂点・向き整列済み)、zOf=サンプル番号→深さ(mm)、
//  ringAt=深さ→輪郭、plainLoft=各関数内の_buildRingLoftMesh。
function _buildLayersAdaptiveV1(rings, zOf, SC, ringAt, plainLoft){
  const L = _planSliceLayers(rings, zOf), meshes = [];
  const isT = lay => rings[lay[0]].length !== rings[lay[1]].length;
  function pushSimple(ka, kb){
    let ringA = rings[ka], ringB = rings[kb];
    const zA = zOf(ka), zB = zOf(kb);
    if(ringA.length !== ringB.length){
      // r118(42回目): 頂点数が変わる深さで層を割り、頂点の対応を保ってloft(旧: 弧長リサンプルで対応が崩れ偽の床)。
      const ms = _loftLayerTopo(ringAt, zA, ringA, zB, ringB, SC, plainLoft, 0);
      if(ms){ ms.forEach(m => meshes.push(m)); return; }
      console.warn('[TOPO-LOFT] 頂点の対応が作れず従来のリサンプルにフォールバックします(層' + ka + ')');
      const M = Math.max(ringA.length, ringB.length, 8);
      ringA = _resampleRingByArcLength(ringA, M);
      ringB = _resampleRingByArcLength(ringB, M);
    }
    meshes.push(plainLoft(ringA, -zA*SC, ringB, -zB*SC));
  }
  for(let i=0;i<L.length;){
    const lay = L[i];
    let used = 0, ms = null;
    if(!isT(lay) && i+1 < L.length && isT(L[i+1])){            // [連続区間][変化点](+[連続区間])
      const nxt = (i+2 < L.length && !isT(L[i+2])) ? L[i+2] : null;
      ms = _loftEventSegment(rings, zOf, ringAt, lay[0], L[i+1][0], L[i+1][1], nxt ? nxt[1] : L[i+1][1], SC, plainLoft);
      used = nxt ? 3 : 2;
    } else if(isT(lay) && i+1 < L.length && !isT(L[i+1])){     // [変化点][連続区間]
      ms = _loftEventSegment(rings, zOf, ringAt, lay[0], lay[0], lay[1], L[i+1][1], SC, plainLoft);
      used = 2;
    }
    if(ms){ ms.forEach(m => meshes.push(m)); i += used; }
    else { pushSimple(lay[0], lay[1]); i++; }
  }
  return meshes;
}

// r120(42回目・本命): 変化点(頂点数が変わる深さ)を全部先に求め、「変化点と変化点の間」を1枚のloftにする。
//  V1(上のサンプル単位の組み立て)は、変化点が2つ続く形(1/71)で変化点の間に薄い層ができ、量子化(10mm)で法面が波打った。
//  ・境界=[上面][変化点…][下面]。変化点の前後で頂点が少ない側のリングを境界のメッシュ用リングにして、多い側は多対1で繋ぐ。
//  ・変化点が上面/下面から_EVENT_SNAP_MM以内なら、その薄い層は作らず上面/下面に吸収する(ずれ<量子化以下)。
//  ・区間が線形/平面から外れる時だけ、最もずれたサンプルで割る(固定刻みではない)。
//  ・対応が作れない/想定外ならnull=呼び出し側がV1にフォールバック。
// 変化点が上面/下面からこの距離以内なら、その薄い層は作らず上面/下面に吸収する(頂点量子化の2倍=量子化より細かい差)。
function _eventSnapMm(){ return Math.max(5, 2 * (window._vertexQuantMm || 10)); }
// r121(43回目): 上面/下面から変化点までの距離がこれ未満なら、薄い層を作らず上面/下面の本物のリングへ多対1で繋ぐ(吸収)。
//  既定=量子化の30倍(10mmなら300mm)。薄い層の法面の傾きノイズ≒atan(量子化/厚さ)が約2°以内に収まる厚さ。
function _absorbMm(){
  if(typeof window._eventAbsorbMm === 'number') return window._eventAbsorbMm;
  // 頂点量子化0(Land Logic/LandXML用の構築)は量子化ノイズが無いので、薄い層を吸収する必要が無い=従来どおり_snap(20mm)のまま
  //  (LandXML用の形を、量子化が効く3D表示用の都合で変えない)
  const q = window._vertexQuantMm;
  if(!(q > 0)) return _eventSnapMm();
  return Math.max(20, 30 * q);
}
function _buildRingLoftMeshMapped2(topRing, yTop, ftop, botRing, yBot, fbot, n, SC){
  const nT = topRing.length;
  const verts = [], tris = [];
  topRing.forEach(p => verts.push(p.x * SC, yTop, p.y * SC));
  botRing.forEach(p => verts.push(p.x * SC, yBot, p.y * SC));
  {
    const flat = []; topRing.forEach(p => flat.push(p.x, p.y));
    const c = earcut(flat, null, 2);
    for(let i=0;i<c.length;i+=3) tris.push(c[i], c[i+1], c[i+2]);
  }
  {
    const flat = []; botRing.forEach(p => flat.push(p.x, p.y));
    const c = earcut(flat, null, 2);
    for(let i=0;i<c.length;i+=3) tris.push(nT+c[i], nT+c[i+2], nT+c[i+1]);
  }
  for(let i=0;i<n;i++){
    const i2 = (i+1) % n;
    const t0 = ftop ? ftop[i] : i, t1 = ftop ? ftop[i2] : i2;
    const b0 = fbot ? fbot[i] : i, b1 = fbot ? fbot[i2] : i2;
    if(t0 !== t1 && b0 !== b1){ tris.push(t0, nT+b0, t1); tris.push(t1, nT+b0, nT+b1); }
    else if(t0 === t1 && b0 !== b1){ tris.push(t0, nT+b0, nT+b1); }
    else if(t0 !== t1 && b0 === b1){ tris.push(t0, nT+b0, t1); }
  }
  return { vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris), numProp: 3 };
}
function _buildLayersByBoundaries(rings, zOf, SC, ringAt, plainLoft){
  const N = rings.length - 1, Y = z => -z * SC;
  // 1) 境界の収集
  let bnd = [{ z: zOf(0), zAfter: zOf(0), before: null, after: rings[0] }];
  for(let k=0;k<N;k++){
    if(rings[k].length === rings[k+1].length) continue;
    let lo = zOf(k), hi = zOf(k+1);
    for(let it=0; it<60 && Math.abs(hi-lo) > 1e-5; it++){
      const mid = (lo+hi)/2;
      if(ringAt(mid).length === rings[k].length) lo = mid; else hi = mid;
    }
    let rLo = ringAt(lo), rHi = ringAt(hi);
    if(rLo.length !== rings[k].length || rHi.length !== rings[k+1].length) return null; // 同じ層で複数回変化→V1へ
    rLo = _alignRingTo(rLo, rings[k]);
    rHi = _alignRingTo(rHi, rings[k+1]);
    bnd.push({ z: (lo+hi)/2, zBefore: lo, zAfter: hi, before: rLo, after: rHi });
  }
  bnd.push({ z: zOf(N), zBefore: zOf(N), before: rings[N], after: null });
  // 2) 上面/下面に近すぎる変化点は吸収(薄い層を作らない)
  //  r121(43回目): 吸収は『変化点の後(前)のリングを上面(下面)の位置へ置き直す』方式だった。置き直しで頂点が
  //   (深さのずれ×頂点速度)だけ動き、線形チェックが『非線形』と誤判定→薄い層(1/71の上面0.11m)→量子化10mmで横線、が根本原因。
  //   新方式: 上面(下面)のメッシュ用リングは『上面(下面)の本物のリング(rings[0]/rings[N])』を使い、変化点の前後は
  //   多対1の対応(_mapBigToSmall)で繋ぐ。薄い層を作らず、法面の2面(消える辺の両隣)は平面のまま正確。
  //   ずれるのは『変化点で生まれる(消える)小さな辺の面』だけ(吸収距離以内の楔形)。
  //   線形チェックは本来の深さ(zAfter/zBefore)のリングで行う。対応が作れない時は従来の置き直しに戻す。
  const _snap = _eventSnapMm();
  const _abs = _absorbMm();
  function evMap(ev){
    if(!ev.before || !ev.after) return null;
    if(ev.before.length < ev.after.length){ const f = _mapBigToSmall(ev.after, ev.before); return f ? { fAfter: f } : null; }
    if(ev.before.length > ev.after.length){ const f = _mapBigToSmall(ev.before, ev.after); return f ? { fBefore: f } : null; }
    return null;
  }
  // 対応が作れない変化点は、従来の『置き直し』(ずれ=距離×頂点速度)になるので、従来の距離(_snap)までしか吸収しない
  //  (300mmまで置き直すと形が大きくずれる。ランダム形状で体積誤差4.4%を実測=r121検証)。
  let _mpTop = null, _mpBot = null;
  // 吸収で形がずれる量(変化点の深さでの、本来のリング と 端リングを多対1で広げて反対側の境界のリングへ線形補間したリング の
  //  輪郭線どうしの距離)が許容(_absorbDevTol)を超える時は吸収しない(やばい形状で最大48mmずれた実測)。
  function absorbDev(end, zEnd, far, zFar, ev, mp, endIsTop){
    const evFam = endIsTop ? ev.after : ev.before;               // 変化点で端と反対側にあるリング族
    const endSmall = endIsTop ? (ev.before.length < ev.after.length) : (ev.after.length < ev.before.length);
    const f = endIsTop ? (endSmall ? mp.fAfter : mp.fBefore) : (endSmall ? mp.fBefore : mp.fAfter);
    if(!f) return Infinity;
    const zEv = ev.z, t = (zEv - zFar) / (zEnd - zFar);           // far(zFar) → end(zEnd) の線形補間を zEv で評価
    const E = [], R = endSmall ? evFam : (endIsTop ? ev.before : ev.after);
    if(endSmall){ for(let i=0;i<far.length;i++){ const e = end[f[i]], a = far[i]; E.push({ x: a.x + (e.x - a.x)*t, y: a.y + (e.y - a.y)*t }); } }
    else        { for(let i=0;i<end.length;i++){ const e = end[i], a = far[f[i]]; E.push({ x: a.x + (e.x - a.x)*t, y: a.y + (e.y - a.y)*t }); } }
    return _ringOutlineDev(E, R);
  }
  if(bnd.length > 2 && bnd[1].z - bnd[0].z < _abs){
    _mpTop = evMap(bnd[1]);
    if(!_mpTop && bnd[1].z - bnd[0].z >= _snap) _mpTop = 'no';
    else if(_mpTop && absorbDev(rings[0], bnd[0].z, bnd[2].before, bnd[2].zBefore !== undefined ? bnd[2].zBefore : bnd[2].z, bnd[1], _mpTop, true) > _absorbDevTol() && bnd[1].z - bnd[0].z >= _snap) _mpTop = 'no';
  }
  if(bnd.length > 2 && bnd[bnd.length-1].z - bnd[bnd.length-2].z < _abs){
    const T = bnd[bnd.length-3];
    _mpBot = evMap(bnd[bnd.length-2]);
    if(!_mpBot && bnd[bnd.length-1].z - bnd[bnd.length-2].z >= _snap) _mpBot = 'no';
    else if(_mpBot && absorbDev(rings[N], bnd[bnd.length-1].z, T.after, T.zAfter !== undefined ? T.zAfter : T.z, bnd[bnd.length-2], _mpBot, false) > _absorbDevTol() && bnd[bnd.length-1].z - bnd[bnd.length-2].z >= _snap) _mpBot = 'no';
  }
  if(_mpTop !== 'no' && bnd.length > 2 && bnd[1].z - bnd[0].z < _abs){
    const ev = bnd[1], mp = _mpTop;
    bnd[0].after = ev.after; bnd[0].zAfter = ev.zAfter;
    if(mp){ bnd[0].M = rings[0]; if(mp.fAfter) bnd[0].fAfter = mp.fAfter; else bnd[0].fBotOver = mp.fBefore; }
    bnd.splice(1,1);
  }
  if(_mpBot !== 'no' && bnd.length > 2 && bnd[bnd.length-1].z - bnd[bnd.length-2].z < _abs){
    const L = bnd[bnd.length-1], ev = bnd[bnd.length-2], mp = _mpBot;
    L.before = ev.before; L.zBefore = ev.zBefore;
    if(mp){ L.M = rings[N]; if(mp.fBefore) L.fBefore = mp.fBefore; else L.fTopOver = mp.fAfter; }
    bnd.splice(bnd.length-2,1);
  }
  for(let i=1;i<bnd.length-1;i++) if(bnd[i].z - bnd[i-1].z < _snap) return null; // 変化点が近接→V1へ
  // 3) 各境界のメッシュ用リングと対応
  for(let i=0;i<bnd.length;i++){
    const b = bnd[i];
    if(b.M) continue; // 吸収で上面/下面の本物のリングが決まっている
    if(!b.before){ b.M = b.after; continue; }
    if(!b.after){ b.M = b.before; continue; }
    if(b.before.length === b.after.length){ b.M = b.after; continue; }
    if(b.before.length < b.after.length){ b.M = b.before; b.fAfter = _mapBigToSmall(b.after, b.before); if(!b.fAfter) return null; }
    else { b.M = b.after; b.fBefore = _mapBigToSmall(b.before, b.after); if(!b.fBefore) return null; }
  }
  // 4) 区間が線形/平面から外れる時は、最もずれたサンプルで割る
  function samplesIn(zt, zb, n){
    const out = [];
    for(let m=1;m<N;m++){ const z = zOf(m); if(z > zt + 1e-6 && z < zb - 1e-6 && rings[m].length === n) out.push({m, ring: rings[m], z}); }
    return out;
  }
  for(let guard=0; guard<64; guard++){
    let split = -1, splitM = -1;
    for(let i=0;i<bnd.length-1;i++){
      const A = bnd[i].after, B = bnd[i+1].before;
      if(A.length !== B.length) return null;
      const zA_ = (bnd[i].zAfter !== undefined) ? bnd[i].zAfter : bnd[i].z;
      const zB_ = (bnd[i+1].zBefore !== undefined) ? bnd[i+1].zBefore : bnd[i+1].z;
      const smp = samplesIn(zA_, zB_, A.length);
      if(!smp.length) continue;
      if(_linearPlanarOK(A, zA_, B, zB_, smp)) continue;
      // 最もずれたサンプル(ずれが無ければ中央のサンプル)
      let bestM = smp[Math.floor(smp.length/2)].m, bestD = -1;
      smp.forEach(q => {
        const t = (q.z - zA_) / (zB_ - zA_); let d = 0;
        for(let v=0;v<A.length;v++){ d = Math.max(d, Math.hypot(q.ring[v].x - (A[v].x + (B[v].x - A[v].x)*t), q.ring[v].y - (A[v].y + (B[v].y - A[v].y)*t))); }
        if(d > bestD + 1e-9){ bestD = d; bestM = q.m; }
      });
      split = i; splitM = bestM; break;
    }
    if(split < 0) break;
    bnd.splice(split+1, 0, { z: zOf(splitM), zBefore: zOf(splitM), zAfter: zOf(splitM), before: rings[splitM], after: rings[splitM], M: rings[splitM] });
  }
  // r122b: 層の最小の厚さ(mm)を記録(事前判定_frustumLayerStableが、薄い層=量子化で法面が傾く層、を弾くかの判断に使う)
  { let mn = Infinity; for(let i=0;i+1<bnd.length;i++) mn = Math.min(mn, bnd[i+1].z - bnd[i].z); window._lastMinLayerMm = mn; }
  // 5) メッシュ生成
  const meshes = [];
  for(let i=0;i<bnd.length-1;i++){
    const T = bnd[i], Bt = bnd[i+1];
    const n = Math.max(T.after.length, T.M.length, Bt.M.length);
    let ftop = T.fAfter || null, fbot = Bt.fBefore || null;
    // 対応表は合成する(例: 下面が頂点多 → 区間の頂点数のリング → 上側の境界の少ない側リング)
    if(Bt.fTopOver) ftop = T.fAfter ? Bt.fTopOver.map(j => T.fAfter[j]) : Bt.fTopOver;   // 下面を本物のリングにした(下面側が頂点多)
    if(T.fBotOver) fbot = Bt.fBefore ? T.fBotOver.map(j => Bt.fBefore[j]) : T.fBotOver;   // 上面を本物のリングにした(上面側が頂点多)
    if(!ftop && !fbot && T.M.length === Bt.M.length) meshes.push(plainLoft(T.M, Y(T.z), Bt.M, Y(Bt.z)));
    else meshes.push(_buildRingLoftMeshMapped2(T.M, Y(T.z), ftop, Bt.M, Y(Bt.z), fbot, n, SC));
  }
  return meshes;
}
function _buildLayersAdaptive(rings, zOf, SC, ringAt, plainLoft){
  let r = null;
  try{ r = _buildLayersByBoundaries(rings, zOf, SC, ringAt, plainLoft); }catch(e){ console.warn('[LAYERS] 境界方式で例外、従来方式へ: ' + e); r = null; }
  if(r) return r;
  console.warn('[LAYERS-V1] 境界方式で作れず従来方式(V1)へ');
  return _buildLayersAdaptiveV1(rings, zOf, SC, ringAt, plainLoft);
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
// ============================================================
// r125(44回目): 角問題 — 同じ条件で隣り合う/重なるオブジェクトを、法面オフセットの『前』に1つのポリゴンへ合体する。
//   症状(Voldia_261029_1310.vold): 見た目が同じ台形でも、1個で描くと3Dがきれいで、四角形+三角形の2個に分けて描くと
//         三角形の鋭角(45°)の角から細長いとんがり(法面の角)が出る。実際の根切ではこうならない。
//   原因: 各オブジェクトを個別にオフセット(マイター)してから合体していた。三角形の鋭角は、合体後は台形の鈍角(135°)の内側の点になるのに、
//         個別にマイターすると鋭角のまま 1/sin(22.5°)=2.6倍 先まで伸びる。『オフセットの合体 ≠ 合体のオフセット』(マイターでは成り立たない)。
//         体積(_calcVolumeFallback)も同じ作りなので、とんがり分の体積が表示値に乗っていた。
//   対処: 同条件(深さD・天端tl・余掘りOD・法面noSlope)のオブジェクトで、ポリゴンが接する/重なるものを先に1つへ合体してからオフセットする。
//         ・対象外(従来どおり): 紫・グレー、穴付き、オフセット0(noSlope かつ OD=0 なら合体の有無で同じ形)、深さ等の条件が違うもの
//         ・2個ずつClipperで合体を試し『ちょうど1つの輪郭(穴なし・角つまみなし)になる』ものだけ繋ぐ。ならなければ何もしない
//         ・触れ合っていないオブジェクトは配列ごと元のまま(同じオブジェクトを返す)＝既存の形・体積は一切変わらない
//   限界: 深さが違う隣接オブジェクトは対象外(同じ高さでもオフセット量が違うので、合体してからのオフセットは成り立たない)。
function _mergeTouchingSameDepthFrustums(frustums){
  try{
    if(!frustums || frustums.length < 2) return frustums;
    const SF = 100; // 0.01mm
    const toPath = pts => { const r = pts.map(p => ({X:Math.round(p.x*SF), Y:Math.round(p.y*SF)}));
      let a = 0; for(let i=0;i<r.length;i++){ const j=(i+1)%r.length; a += r[i].X*r[j].Y - r[j].X*r[i].Y; }
      if(a < 0) r.reverse(); return r; };
    const unionOf = paths => { const cl = new ClipperLib.Clipper(); paths.forEach(pa => cl.AddPath(pa, ClipperLib.PolyType.ptSubject, true));
      const sol = new ClipperLib.Paths(); cl.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero); return sol; };
    // 1個の輪郭(穴なし・角つまみ=同じ頂点の重複なし)ならそのパス、それ以外はnull
    const single = sol => { if(!sol || sol.length !== 1) return null; const pa = sol[0]; if(pa.length < 3) return null;
      if(!ClipperLib.Clipper.Orientation(pa)) return null;
      const seen = new Set(); for(const q of pa){ const k = q.X+'_'+q.Y; if(seen.has(k)) return null; seen.add(k); }
      return pa; };
    const groups = new Map();
    frustums.forEach((f,i) => {
      if(!f || f.color === 'gray' || f.color === 'purple') return;
      if(f.noSlope && !(f.OD > 0)) return;
      if(f.holesMm && f.holesMm.length) return;
      if(!f.ptsMm || f.ptsMm.length < 3) return;
      const key = [f.D, f.tl||0, f.OD||0, f.noSlope?1:0].join('|');
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    });
    const drop = new Set(), repl = new Map();
    groups.forEach(idxs => {
      if(idxs.length < 2) return;
      const paths = new Map(idxs.map(i => [i, toPath(frustums[i].ptsMm)]));
      const par = new Map(idxs.map(i => [i, i]));
      const find = i => { while(par.get(i) !== i){ par.set(i, par.get(par.get(i))); i = par.get(i); } return i; };
      for(let a=0;a<idxs.length;a++) for(let b=a+1;b<idxs.length;b++){
        if(find(idxs[a]) === find(idxs[b])) continue;
        if(single(unionOf([paths.get(idxs[a]), paths.get(idxs[b])]))) par.set(find(idxs[b]), find(idxs[a]));
      }
      const clusters = new Map();
      idxs.forEach(i => { const r = find(i); if(!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(i); });
      clusters.forEach(mem => {
        if(mem.length < 2) return;
        const pa = single(unionOf(mem.map(i => paths.get(i))));
        if(!pa) return; // 全体でも1輪郭にならなければ従来どおり
        let pts = pa.map(q => ({x:q.X/SF, y:q.Y/SF}));
        pts = _cleanOutlineMm(pts, _cleanTol()); // r128(47回目): 合体した直後の輪郭にも同じクリーニング(結合部にできた一直線の点・近接点を除く)
        let ar = 0; for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; ar += pts[i].x*pts[j].y - pts[j].x*pts[i].y; }
        const base = frustums[mem[0]];
        const mf = Object.assign({}, base, {
          ptsMm: pts, holesMm: [], area: Math.abs(ar)/2/1e6,
          x1: Math.min(...mem.map(i => frustums[i].x1)), x2: Math.max(...mem.map(i => frustums[i].x2)),
          y1: Math.min(...mem.map(i => frustums[i].y1)), y2: Math.max(...mem.map(i => frustums[i].y2)),
          _mergedFrom: mem.length, _members: mem.map(i => frustums[i])
        });
        repl.set(mem[0], mf); mem.slice(1).forEach(i => drop.add(i));
      });
    });
    if(!repl.size) return frustums; // 何も合体しない時は元の配列をそのまま返す
    const out = []; frustums.forEach((f,i) => { if(drop.has(i)) return; out.push(repl.has(i) ? repl.get(i) : f); });
    if(frustums._offsetX !== undefined){ out._offsetX = frustums._offsetX; out._offsetY = frustums._offsetY; }
    console.log(`[MERGE-SAME-DEPTH] 同条件で接する/重なるオブジェクトを法面オフセット前に合体: ${frustums.length}個→${out.length}個`);
    return out;
  }catch(e){
    console.warn('[MERGE-SAME-DEPTH] 合体に失敗したため従来どおり個別に処理します:', e);
    return frustums;
  }
}
// r125: 合体した輪郭が安全に3D化できるかの自己チェック付きラッパー。
//   背景: 合体で輪郭が凹形(L字など)になると、既存の層分け(loft)が苦手な形になり3Dメッシュが壊れることがある(乱数テストで体積が1/3になる例)。
//         個別オブジェクトのままなら壊れない形でも壊れるので、合体は『安全と確認できた時だけ』使う。
//   方法: 合体した1図形を実際に3D化し、独立した数値積分(_calcVolumeFallback)の体積と0.5%以内で一致するかを見る。合わない/例外なら、その合体は取りやめて元のオブジェクトに戻す(＝従来と同じ)。
//   同じ入力なら必ず同じ判定(体積側・3D側で結果が食い違わないよう、判定はキャッシュ)。
// r127(47回目): 合体した1図形の3Dに「あってはいけない面」が無いかを見る(偽の床・逆勾配)。
//   背景: 合体で凹形になった輪郭が法面オフセットの途中でトポロジー変化(スリット閉塞など)を起こすと、深さ方向のloftが破綻して
//         ①途中の高さに水平な薄い面(偽の床) ②法面が張り出す向きの面(逆勾配=オーバーハング) が出る。どちらも体積にはほぼ出ないため、
//         体積の一致(_MERGE_VALID_TOL)だけでは検出できない。同じ深さの1図形(合体図形)の掘削形状には、本来どちらも出ない。
//   判定(掘削空間の外向きの法線。床ny=-1・法面ny<0): ①|ny|>0.99で、最低点+5mm〜最高点-5mmの間にある水平面 ②ny>0.05で|ny|≤0.99の斜面(逆勾配)。
//   法線の向きは符号付き体積の符号でそろえる(向きが逆のメッシュでも同じ判定)。面積0に近い縮退(1e-7㎡未満)は数えない。
function _cavityMeshDefects(res){
  const P = res && res.positions, lists = [res && res.cyanIndices, res && res.redIndices].filter(a => a && a.length);
  const out = {fake:0, rev:0, fakeA:0, revA:0};
  if(!P || !lists.length) return out;
  let yMin = Infinity, yMax = -Infinity; for(let i=1;i<P.length;i+=3){ if(P[i] < yMin) yMin = P[i]; if(P[i] > yMax) yMax = P[i]; }
  const faces = []; let vol = 0;
  lists.forEach(I => { for(let t=0;t+2<I.length;t+=3){
    const a=I[t]*3, b=I[t+1]*3, c=I[t+2]*3;
    const ux=P[b]-P[a], uy=P[b+1]-P[a+1], uz=P[b+2]-P[a+2], vx=P[c]-P[a], vy=P[c+1]-P[a+1], vz=P[c+2]-P[a+2];
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx, L=Math.sqrt(nx*nx+ny*ny+nz*nz);
    const y0=P[a+1]-yMax; vol += (P[a]*nx + y0*ny + P[a+2]*nz) / 6; // 天端基準(開いたすり鉢でも符号が決まる)
    if(L/2 < 1e-7) continue;
    faces.push({ny: ny/L, A: L/2, ym: (P[a+1]+P[b+1]+P[c+1])/3});
  }});
  const sgn = vol < 0 ? -1 : 1;
  for(const f of faces){
    const ny = f.ny * sgn;
    if(Math.abs(ny) > 0.99){ if(f.ym > yMin + 0.005 && f.ym < yMax - 0.005){ out.fake++; out.fakeA += f.A; } }
    else if(ny > 0.05){ out.rev++; out.revA += f.A; }
  }
  return out;
}
// r128(47回目): 全体の3Dの欠陥点数(提案書P2)。非多様体の辺(3枚以上の面が1辺を共有=穴あきや重なり)・逆勾配・偽の床(同じ深さの時だけ)。メッシュが作れない時は大きな点数。
function _sceneDefects(res, sameDepth){
  const o = {nm:0, fake:0, rev:0, fakeA:0, revA:0, score:0};
  if(!res || !res.positions){ o.score = 1e6; return o; }
  const lists = [res.cyanIndices, res.redIndices].filter(a => a && a.length), E = new Map();
  lists.forEach(I => { for(let t=0;t+2<I.length;t+=3){ const a=I[t], b=I[t+1], c=I[t+2];
    [[a,b],[b,c],[c,a]].forEach(([u,v]) => { if(u===v) return; const k = u<v ? u+'_'+v : v+'_'+u; E.set(k, (E.get(k)||0)+1); }); } });
  for(const c of E.values()) if(c > 2) o.nm++;
  const d = _cavityMeshDefects(res); o.rev = d.rev; o.revA = d.revA;
  if(sameDepth){ o.fake = d.fake; o.fakeA = d.fakeA; }
  o.score = o.nm*1000 + (o.revA + o.fakeA)*10 + (o.rev + o.fake)*0.01;
  return o;
}
function _openTopMeshVolumeMm3(res){
  const P = res.positions, idxLists = [res.cyanIndices, res.redIndices].filter(a => a && a.length);
  if(!P || !idxLists.length) return 0;
  let yTop = -Infinity; for(let i=1;i<P.length;i+=3) if(P[i] > yTop) yTop = P[i];
  let v = 0;
  idxLists.forEach(I => { for(let t=0;t+2<I.length;t+=3){
    const a=I[t]*3, b=I[t+1]*3, c=I[t+2]*3;
    const ax=P[a], ay=P[a+1]-yTop, az=P[a+2], bx=P[b], by=P[b+1]-yTop, bz=P[b+2], cx=P[c], cy=P[c+1]-yTop, cz=P[c+2];
    v += (ax*(by*cz-bz*cy) - ay*(bx*cz-bz*cx) + az*(bx*cy-by*cx)) / 6;
  }});
  return Math.abs(v) * 1e9; // m3→mm3
}
const _MERGE_VALID_TOL = 0.005; // 0.5%
// r131(48回目): 合体判定キャッシュ(window._mergeValidCache)のキーに「判定の入力の全部」を入れる(テスト担当の報告: 法面を切り替えると前の法面の判定が使い回され、結果が新規計算と変わる)。
//   原因: キーに法面角度が無く(個別・全体とも)、個別のキーには isDoboku・taperMm・色、全体のキーには taperMm・穴(holesMm)も無かった。キャッシュはページ再読込まで消えない。
//   方針: キャッシュを消して回避するのではなく、判定が読む値をすべてキーに入れる(読む値の洗い出し: _buildManifoldUnionGeomRaw/_calcVolumeFallback/_frustumLayerStable
//         が読むのは 図形の ptsMm・D・tl・OD・noSlope・taperMm・holesMm・color と、法面(getSlopeRatio)・isDoboku・window._vertexQuantMm・オフセット)。
//   入力が増えたら、ここ(_mergeCtxSig=共通の条件 / _mergeShapeSig=図形ごと)に足す。
function _mergeCtxSig(isDoboku){
  let sr = -1; try{ sr = Math.round(getSlopeRatio() * 1e6); }catch(e){}
  return [sr, isDoboku !== false ? 1 : 0, window._vertexQuantMm || 0];
}
function _mergeShapeSig(f, withHoles){
  const q = pts => pts.map(p => [Math.round(p.x*100), Math.round(p.y*100)]);
  return [q(f.ptsMm), f.D, f.tl||0, f.OD||0, f.noSlope?1:0, f.taperMm||0, f.color==='purple'?1:0, withHoles ? (f.holesMm||[]).map(q) : 0];
}
async function _mergeSameDepthFrustumsValidated(frustums, offsetXmm, offsetYmm, isDoboku){
  const merged = _mergeTouchingSameDepthFrustums(frustums);
  if(merged === frustums) return frustums;
  window._mergeValidCache = window._mergeValidCache || new Map();
  const out = []; let kept = 0;
  for(const f of merged){
    if(!f._mergedFrom){ out.push(f); continue; }
    const key = JSON.stringify([_mergeShapeSig(f, false), offsetXmm||0, offsetYmm||0, _mergeCtxSig(isDoboku)]); // r131: 法面・isDoboku・taperMm・色もキーに入れた
    let ok = window._mergeValidCache.get(key);
    if(ok === undefined){
      ok = false; let cacheIt = true;
      try{
        const probe = Object.assign({}, f, {ptsMm: f.ptsMm.map(p => ({x:p.x, y:p.y})), holesMm: []}); // buildManifoldUnionGeomは入力を量子化で書き換えるのでコピーで試す
        // r127(47回目) 事前: 合体した輪郭の層分けが安定して作れない形(r121b _frustumLayerStable)は、3Dを作る前に合体を取りやめる
        if(!_frustumLayerStable(probe)){
          console.warn('[MERGE-SAME-DEPTH] 合体した輪郭は深さ方向の層分けが安定して作れない形のため、この合体は取りやめて個別のまま処理します');
        }else{
          const num = _calcVolumeFallback([probe], offsetXmm, offsetYmm);
          const res = await buildManifoldUnionGeom([probe], isDoboku !== false, offsetXmm, offsetYmm, {_noMerge:true});
          if(res && res.positions && num > 0){
            const vol = _openTopMeshVolumeMm3(res);
            ok = Math.abs(vol - num) / num <= _MERGE_VALID_TOL;
            if(!ok) console.warn(`[MERGE-SAME-DEPTH] 合体した輪郭の3Dが数値積分と合わない(メッシュ ${(vol/1e9).toFixed(3)}m3 / 数値 ${(num/1e9).toFixed(3)}m3)ため、この合体は取りやめて個別のまま処理します`);
            // r127(47回目) 事後: 体積が合っても、偽の床(途中の水平面)や逆勾配(張り出す法面)があれば取りやめる(体積には出ない欠陥)
            if(ok){
              const dfx = _cavityMeshDefects(res);
              if(dfx.fake > 0 || dfx.rev > 0){
                ok = false;
                console.warn(`[MERGE-SAME-DEPTH] 合体した輪郭の3Dに 偽の床${dfx.fake}枚(${dfx.fakeA.toFixed(3)}㎡)・逆勾配${dfx.rev}枚(${dfx.revA.toFixed(3)}㎡) があるため、この合体は取りやめて個別のまま処理します`);
              }
            }
          }
        }
      }catch(e){ ok = false; cacheIt = false; } // 例外(Manifold未ロード等)は一時的な失敗かもしれないのでキャッシュしない
      if(cacheIt) window._mergeValidCache.set(key, ok);
    }
    if(ok){ out.push(f); kept++; } else out.push(...f._members);
  }
  if(!kept) return frustums;
  if(frustums._offsetX !== undefined){ out._offsetX = frustums._offsetX; out._offsetY = frustums._offsetY; }
  // r128(47回目) 全体チェック(提案書P2): 個々の合体は安全でも、全体を組み立てると偽の床・逆勾配・非多様体の辺が出ることがある。
  //   合体した全体と、合体しない全体の両方を3D化して欠陥点数を比べ、合体の方が悪ければ合体を全部取りやめる(3D側・体積側とも、この関数の結果を共有するので食い違わない)。
  const sceneKey = 'S|' + JSON.stringify([frustums.filter(f => f && f.color !== 'gray').map(f => _mergeShapeSig(f, true)), offsetXmm||0, offsetYmm||0, _mergeCtxSig(isDoboku)]); // r131: 法面・taperMm・穴もキーに入れた
  let sceneOk = window._mergeValidCache.get(sceneKey);
  if(sceneOk === undefined){
    sceneOk = true; let cacheScene = true;
    try{
      const cp = list => { const a = list.map(f => Object.assign({}, f, {ptsMm: f.ptsMm.map(p => ({x:p.x, y:p.y})), holesMm: (f.holesMm||[]).map(h => h.map(p => ({x:p.x, y:p.y})))}));
        if(frustums._offsetX !== undefined){ a._offsetX = frustums._offsetX; a._offsetY = frustums._offsetY; } return a; };
      const sameDepth = new Set(frustums.filter(f => f && f.color !== 'gray' && !f.noSlope).map(f => f.D + '|' + (f.tl||0))).size === 1;
      const dM = _sceneDefects(await buildManifoldUnionGeom(cp(out), isDoboku !== false, offsetXmm, offsetYmm, {_noMerge:true}), sameDepth);
      if(dM.score > 0){
        const dU = _sceneDefects(await buildManifoldUnionGeom(cp(frustums), isDoboku !== false, offsetXmm, offsetYmm, {_noMerge:true}), sameDepth);
        sceneOk = dM.score <= dU.score;
        if(!sceneOk) console.warn(`[MERGE-SAME-DEPTH] 合体した全体の3Dに欠陥(非多様体${dM.nm}・逆勾配${dM.rev}・偽の床${dM.fake} / 点数${dM.score.toFixed(2)})があり、合体しない方(点数${dU.score.toFixed(2)})が良いため、合体は全部取りやめて個別のまま処理します`);
      }
    }catch(e){ sceneOk = true; cacheScene = false; }
    if(cacheScene) window._mergeValidCache.set(sceneKey, sceneOk);
  }
  if(!sceneOk) return frustums;
  return out;
}
async function buildUnionFrustumGeometry(frustums, offsetXmm, offsetYmm){
  // 26回目セッション新規: 「既存躯体」機能 ― グレー色のオブジェクトは掘削対象
  // ではなく、既にそこにコンクリートがある扱い。個別ジオメトリ・体積計算からは
  // 分離し、後段で掘削体積との重複分だけを差し引く。
  const excavFrustums = await _mergeSameDepthFrustumsValidated(frustums.filter(f => f.color !== 'gray'), offsetXmm, offsetYmm, true); // r125: 角問題(同条件で接するオブジェクトは法面オフセット前に合体)
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
// r115(41回目): 日付のファイル名表記を「yymmdd_hhmm」(年月日と時分をアンダーバーで区切る)に統一(マスター指示)。
// 旧: getJSTDateStr()(CSV専用・YYYY-MM-DD)を削除(呼び出しはCSV出力1か所だけで、getVoldiaTimestamp()に置き換えた)。
// 旧: getVoldiaTimestamp()はYYMMDDHHMMSS(12桁・秒まで)だったのを、分までの「yymmdd_hhmm」に変更。
// 対象: .vold / DXF / CSV / GLB / LANDXML / データ出力ZIP / 3Dスクショ(配置モードのPDFは別ファイルvoldia_placement.js側で同じ書式)。
// 時刻は常にJST(ホストのタイムゾーン設定に依存しない「+9時間してUTC表記で読む」方式は従来のまま)。
function getVoldiaTimestamp(){
  const d=new Date();
  const jst=new Date(d.getTime()+9*60*60*1000);
  const s=jst.toISOString(); // "YYYY-MM-DDTHH:MM:SS.sssZ"
  return s.slice(2,4)+s.slice(5,7)+s.slice(8,10)+'_'+s.slice(11,13)+s.slice(14,16);
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
  const v = parseInputNum(document.getElementById('conc-thick'));
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



// 48回目: ここにあった古い _ringSelfIntersects(ptsMm, SF)(r010: ClipperLibのSimplifyPolygonで面積・輪郭数の変化を見る版)は、後ろの同名の関数
//   _ringSelfIntersects(p)(隣り合わない辺どうしの交差を見る版)に上書きされ、一度も使われていなかったため削除した(全文は backup/voldia3d_r131.js)。

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

// r122b(43回目): 変化点が複数ある時の層分け。_loftLayerTopoは複数回変わる時『中点で2分割』して再帰するため、
//  変化点でも何でもない深さ(中点)に層境界ができ、同じ平面の面が細切れになる(やばい形状: 変化点2つで層6枚→PDFの面が爆発)。
//  サンプル16点から変化点だけを拾う境界方式(_buildLayersByBoundaries)なら、層は変化点(と吸収後の端)だけで割れる。
//  作れない時はnull(呼び出し側が従来の_loftLayerTopoの結果へ戻す)。
function _boundariesPlan(contour, topZ, botZ, SC, plainLoft){
  try{
    const rings = [];
    for(let k=0;k<=_SLICE_N;k++) rings.push(_sanitizeOffsetRing(contour(topZ + (botZ - topZ) * k / _SLICE_N)).pts);
    for(let k=1;k<rings.length;k++){ if(rings[k].length === rings[k-1].length) rings[k] = _alignRingTo(rings[k], rings[k-1]); }
    return _buildLayersByBoundaries(rings, kk => topZ + (botZ - topZ) * kk / _SLICE_N, SC, z => _sanitizeOffsetRing(contour(z)).pts, plainLoft) || null;
  }catch(e){ return null; }
}

// r123(43回目): 法面の『同一平面なのに必要以上に多い面』の整理(マスター案B=3Dを作ってから面をクリーニングする追加ロジック)。
//  薄い層が残ると、最後の頂点量子化(10mm丸め)で、同じ勾配の面が細い帯に分かれ、帯ごとに法面が2〜3°傾く(PDFの面が増え3Dに横線が出る)。
//  層のメッシュは量子化前は厳密に同一平面なので、量子化前にSimplifyしても畳める面が無い。そこで『このfrustumの層を同じ格子(量子化)へ
//  先に丸めてから、ManifoldのSimplify(許容=量子化の1.5倍)で同一平面と見なせる三角形をまとめる』。丸め済みの座標は、後段の
//  regV(同じ格子への丸め)で変わらない=他のfrustumとのunion以降の流れは従来どおり。
//  対象: 傾斜つきの法面のfrustum(blue)だけ。紫(垂直面の微テーパー15mm)・グレーは、許容と同程度の傾きを潰して垂直面に戻す恐れがあるので対象外。
//  量子化0(Land Logic/LandXML)は量子化ノイズが無いので対象外(LandXML用の形は従来どおり)。
//  採用条件(安全装置): 三角形が減る/status正常/体積が0.1%以内。満たさなければ何もしない(=従来と完全に同じ出力)。
function _simplifyFrustumManifold(Manifold, Mesh, meshDatas, mans, f){
  try{
    const q = window._vertexQuantMm;
    if(!(q > 0) || f.noSlope || window._noFrustumSimplify) return mans;
    const qf = 1000 / q;
    const qMans = meshDatas.map(md => {
      const vp = new Float32Array(md.vertProperties.length);
      for(let i=0;i<vp.length;i++) vp[i] = Math.round(md.vertProperties[i] * qf) / qf;
      const ms = new Mesh({ numProp: md.numProp || 3, vertProperties: vp, triVerts: md.triVerts.slice() });
      if(ms.merge) ms.merge();   // 丸めで同一座標になった頂点を同一頂点に統合(縮退した辺を畳めるようにする。regVの統合と同じ効果)
      return new Manifold(ms);
    });
    const uo = mans.length > 1 ? Manifold.union(mans) : mans[0];       // 従来の(丸め前の)このfrustum
    const nOrig = uo.numTri();
    const uq0 = qMans.length > 1 ? Manifold.union(qMans) : qMans[0];   // 格子へ丸めたもの
    // 層ごとの元ID(originalID)が残ったままだとSimplifyは層の境界をまたいで面をまとめない → 1つのメッシュとして作り直す(ID統合)
    const gm = uq0.getMesh(), np = gm.numProp || 3, nv = gm.vertProperties.length / np;
    const vp3 = new Float32Array(nv * 3);
    for(let i=0;i<nv;i++){ vp3[i*3] = gm.vertProperties[i*np]; vp3[i*3+1] = gm.vertProperties[i*np+1]; vp3[i*3+2] = gm.vertProperties[i*np+2]; }
    const uq = new Manifold(new Mesh({ numProp: 3, vertProperties: vp3, triVerts: gm.triVerts.slice() }));
    const vq = uq.volume();
    const s2 = uq.simplify(1.5 * q / 1000);                            // メートル単位(SC=0.001)
    const ok = s2 && (!s2.status || s2.status() === 'NoError') && s2.numTri() > 0 && s2.numTri() < nOrig
      && Math.abs(s2.volume() - uo.volume()) <= Math.max(1e-6, Math.abs(uo.volume()) * 0.001);
    if(ok){
      console.log(`[SIMPLIFY] 法面の面を整理: ${nOrig}→${s2.numTri()}三角形 (格子${q}mm・許容${q*1.5}mm)`);
      return [s2];
    }
    console.warn(`[SIMPLIFY] 見送り: 元${nOrig}→丸め後${uq.numTri()}→整理後${s2 ? s2.numTri() : '-'}三角形 体積 元${uo.volume().toFixed(4)} 丸め後${vq.toFixed(4)} 整理後${s2 ? s2.volume().toFixed(4) : '-'} status=${s2 && s2.status ? s2.status() : '-'}`);
    return mans;
  }catch(e){ console.warn('[SIMPLIFY] 失敗(元のまま続行): ' + e); return mans; }
}

// r121(43回目): 法面(深さ方向のloft)が『安定して作れるか』の事前判定(作る前の予行演習。メッシュは作らず、層の計画だけ試す)。
//  作れない(=頂点の対応が作れず従来のリサンプルに落ちる/境界方式で組めずV1に落ちる)形は、偽の床・面の爆発・体積ずれが出る
//  (ランダム形状2000件超の検証: フォールバックが出た形は全て破綻、出なかった形に破綻はほぼ無し)。
//  マスター方針(43回目): 変な形状でExcel/PDFが出るくらいなら弾く。ただし出せる形は弾かない(まず安定させ、それでも駄目なものだけ)。
//  contourOfはbuildManifoldUnionGeom/buildSimpleExtrudeGeom内の同名ローカル関数と同一(地雷25a。変えたら3か所揃える)。
function _frustumLayerStable(f0){
  try{
    // 本番(buildManifoldUnionGeom)は入力座標を頂点量子化の格子へ事前に丸めてから作る。判定も同じ丸め後の形で行う(r044-fix②と同じ)。
    const _inQF = 1000 / Math.max(window._vertexQuantMm || 0, 1);
    const f = Object.assign({}, f0, { ptsMm: f0.ptsMm.map(p => ({ x: Math.round(p.x * _inQF) / _inQF, y: Math.round(p.y * _inQF) / _inQF })) });
    const SC = 0.001, tl = f.tl || 0;
    const contour = zMm => {
      const top = -tl, fromTop = zMm - top, ratio = 1.0 - fromTop / f.D;
      const taper = f.noSlope ? (typeof f.taperMm === 'number' ? f.taperMm : DOBOKU_VERTICAL_TAPER_FIXED_MM) : f.D * getSlopeRatio();
      const _negTaper = f.noSlope && typeof f.taperMm === 'number' && f.taperMm < 0;
      const dist = _negTaper ? (f.OD + ratio * taper) : Math.max(0, f.OD + ratio * taper);
      const q = window._vertexQuantMm;
      const minOffsetMm = (f.noSlope && q > 0 && ratio > 0.999) ? (q / 2 + 1) : 0;
      return f.noSlope ? offsetPolygon(f.ptsMm, dist, false, 1.5, minOffsetMm, true) : offsetPolygon(f.ptsMm, dist, false, 5, 0, true);
    };
    const plain = () => ({ vertProperties: new Float32Array(0), triVerts: new Uint32Array(0), numProp: 3 });
    const topZ = -tl, botZ = f.D - tl;
    const topRing0 = contour(topZ), botRing0 = contour(botZ);
    const topS = _sanitizeOffsetRing(topRing0), botS = _sanitizeOffsetRing(botRing0);
    const ringAt = z => _sanitizeOffsetRing(contour(z)).pts;
    if(!topS.changed && !botS.changed){
      if(topRing0.length === botRing0.length) return true;
      if(_loftLayerTopo(ringAt, topZ, topRing0, botZ, botRing0, SC, plain, 0)) return true;
      return !!_boundariesPlan(contour, topZ, botZ, SC, plain);   // 従来の層分けが作れなくても、境界方式で作れるなら安定
    }
    const sliceRings = [];
    for(let k=0;k<=_SLICE_N;k++) sliceRings.push(ringAt(topZ + (botZ - topZ) * k / _SLICE_N));
    for(let k=1;k<sliceRings.length;k++){
      if(sliceRings[k].length === sliceRings[k-1].length) sliceRings[k] = _alignRingTo(sliceRings[k], sliceRings[k-1]);
    }
    let r = null;
    try{ r = _buildLayersByBoundaries(sliceRings, kk => topZ + (botZ - topZ) * kk / _SLICE_N, SC, ringAt, plain); }catch(e){ r = null; }
    return !!r;
  }catch(e){
    return true; // 判定不能は通す(誤って弾くより、従来どおり計算する)
  }
}

function shapeToFrustum(sh){
  const outer = getOuter(sh);
  if(!outer || outer.length < 3) return null;
  
  if(sh.depthBeam==='' || sh.overdig==='') return null;
  const b = parseFloat(sh.depthBeam); // 符号付き（正=GL上、負=GL下）
  const o = parseFloat(sh.overdig);
  if(isNaN(b) || isNaN(o) || o < 0) return null;
  
  const c = ( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
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
  _cleanFrustumsMm(result); // r128(47回目): 3D・体積・各種出力の共通の入口でクリーニング(2D上の図形は変えない)
  _alignFrustumsMm(result); // r134(49回目): 床クラック問題P0=ほぼ同じ直線の辺をそろえる(世界座標のまま。3D生成は回転座標系=buildManifoldUnionGeomのラッパー)
  result._offsetX=minX;
  result._offsetY=minY;
  return result;
}

// ============================================================
// r128(47回目): 3D化の前の「形状のクリーニング」(提案書P3 + マスターM1・M2)
//   背景: 2Dで頂点をスナップしても、回転・丸めで「ほぼ一直線の点」「数mmしか離れていない近接頂点」「隣の図形とわずかにずれた頂点」ができる。
//         これらは肉眼ではほぼ区別できないが、法面オフセット(Clipper)や層分け(loft)で細い面・逆勾配・偽の床の原因になる(提案書の乱数テストで確認)。
//   方針(マスター): 2D上の図形はそのまま。3D化・体積・各種出力の入口(getAllFrustums)と、合体した輪郭(_mergeTouchingSameDepthFrustums)にだけ通す。
//         許容差は5mm(土工事では5mm以下は意味を持たない=マスター)。window._cleanTolMm で変更でき、0にすると無効。
//   1) 同じ図形の隣り合う近接頂点(許容差未満)を1点に統合 2) ほぼ一直線の頂点を除去(Douglas-Peucker。元の輪郭から許容差を超えて外れない保証付き)
//   3) 図形どうしの近接頂点を1点に合わせる(既存躯体=グレーは描いた形状そのままなので動かさず、他をグレーに合わせる) 4) 頂点が他の図形の辺の近く(許容差未満)なら、その辺の上へ寄せる
//   安全装置: 面積が1%以上変わる・向きが変わる・新しい自己交差ができる場合は、その図形だけ元に戻す。穴あきの図形は触らない。
// ============================================================
let _cleanTolMmDefault = 5;
function _cleanTol(){ const v = (typeof window !== 'undefined' && typeof window._cleanTolMm === 'number') ? window._cleanTolMm : _cleanTolMmDefault; return v > 0 ? v : 0; }
function _ringSignedAreaMm2(p){ let a = 0; for(let i=0;i<p.length;i++){ const j=(i+1)%p.length; a += p[i].x*p[j].y - p[j].x*p[i].y; } return a/2; }
function _segDistMm(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy; let t = L2>0 ? ((px-ax)*dx+(py-ay)*dy)/L2 : 0; t = Math.max(0, Math.min(1, t));
  const qx=ax+t*dx, qy=ay+t*dy; return {d: Math.hypot(px-qx, py-qy), t, qx, qy, len: Math.sqrt(L2)};
}
function _ringSelfIntersects(p){ // 隣り合わない辺どうしの交差(端点だけの接触は数えない)
  const n=p.length, cr=(ax,ay,bx,by,cx,cy)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
  for(let i=0;i<n;i++){ const a=p[i], b=p[(i+1)%n];
    for(let j=i+2;j<n;j++){ if(i===0 && j===n-1) continue; const c=p[j], d=p[(j+1)%n];
      const d1=cr(a.x,a.y,b.x,b.y,c.x,c.y), d2=cr(a.x,a.y,b.x,b.y,d.x,d.y), d3=cr(c.x,c.y,d.x,d.y,a.x,a.y), d4=cr(c.x,c.y,d.x,d.y,b.x,b.y);
      if(((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))) return true; } }
  return false;
}
function _dpRing(p, tol){ // 輪のDouglas-Peucker: 除いた点は、残った線から許容差以内
  const n=p.length; if(n<=3) return p;
  let i0=0; for(let i=1;i<n;i++) if(p[i].x<p[i0].x || (p[i].x===p[i0].x && p[i].y<p[i0].y)) i0=i;
  let i1=i0, best=-1; for(let i=0;i<n;i++){ const d=Math.hypot(p[i].x-p[i0].x, p[i].y-p[i0].y); if(d>best){ best=d; i1=i; } }
  const keep=new Uint8Array(n); keep[i0]=1; keep[i1]=1;
  const chain=(s,e)=>{ const st=[[s,e]];
    while(st.length){ const [a,b]=st.pop(); const len=((b-a)+n)%n; if(len<2) continue; let idx=-1, maxd=tol;
      for(let k=1;k<len;k++){ const m=(a+k)%n; const r=_segDistMm(p[m].x,p[m].y,p[a].x,p[a].y,p[b].x,p[b].y); if(r.d>maxd){ maxd=r.d; idx=m; } }
      if(idx>=0){ keep[idx]=1; st.push([a,idx],[idx,b]); } } };
  chain(i0,i1); chain(i1,i0);
  return p.filter((_,i)=>keep[i]);
}
// 1個の輪郭(mm, [{x,y}])をクリーニングして返す(変化なし/やめた時は同じ配列を返す)
function _cleanOutlineMm(pts, tol){
  if(!(tol>0) || !pts || pts.length<4) return pts;
  let p = pts.map(q=>({x:q.x, y:q.y}));
  for(let guard=0; guard<p.length*3 && p.length>3; guard++){ // 隣り合う近接頂点を中点に統合
    let hit=-1; for(let i=0;i<p.length;i++){ const j=(i+1)%p.length; if(Math.hypot(p[i].x-p[j].x, p[i].y-p[j].y) < tol){ hit=i; break; } }
    if(hit<0) break; const j=(hit+1)%p.length; const m={x:(p[hit].x+p[j].x)/2, y:(p[hit].y+p[j].y)/2};
    if(j===0){ p[0]=m; p.pop(); } else p.splice(hit,2,m);
  }
  p = _dpRing(p, tol);
  if(p.length<3) return pts;
  const a0=_ringSignedAreaMm2(pts), a1=_ringSignedAreaMm2(p);
  if(Math.sign(a0)!==Math.sign(a1) || Math.abs(a1-a0) > Math.abs(a0)*0.01) return pts; // 形が1%以上変わる/向きが変わる → やめる
  if(p.length!==pts.length && _ringSelfIntersects(p) && !_ringSelfIntersects(pts)) return pts;
  return p.length===pts.length && p.every((q,i)=>q.x===pts[i].x && q.y===pts[i].y) ? pts : p;
}
function _setFrustumPtsMm(f, pts){ // 輪郭を差し替え、外接(x1,x2,y1,y2=OD等を含む既存の値)を同じだけずらす
  const mn=(a,k)=>Math.min(...a.map(q=>q[k])), mx=(a,k)=>Math.max(...a.map(q=>q[k]));
  f.x1 += mn(pts,'x')-mn(f.ptsMm,'x'); f.x2 += mx(pts,'x')-mx(f.ptsMm,'x'); f.y1 += mn(pts,'y')-mn(f.ptsMm,'y'); f.y2 += mx(pts,'y')-mx(f.ptsMm,'y');
  f.ptsMm = pts;
}
// 図形どうしの頂点合わせ。frs=getAllFrustums()の配列(ptsMmを直接書き換える)。戻り値={welded,projected,reverted}
function _weldFrustumsMm(frs, tol){
  const st={welded:0, projected:0, reverted:0};
  const ok = f => f && f.ptsMm && f.ptsMm.length>=3 && !(f.holesMm && f.holesMm.length);
  const backup = new Map(); frs.forEach((f,i)=>{ if(ok(f)) backup.set(i, f.ptsMm.map(q=>({x:q.x,y:q.y}))); });
  const items=[]; frs.forEach((f,fi)=>{ if(ok(f)) f.ptsMm.forEach((q,vi)=>items.push({fi,vi,x:q.x,y:q.y,gray:f.color==='gray'})); });
  if(items.length<2) return st;
  const key=(a,b)=>a+','+b, grid=new Map();
  items.forEach((it,k)=>{ it.kx=Math.floor(it.x/tol); it.ky=Math.floor(it.y/tol); const kk=key(it.kx,it.ky); if(!grid.has(kk)) grid.set(kk,[]); grid.get(kk).push(k); });
  const par=items.map((_,i)=>i), find=i=>{ while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
  items.forEach((it,k)=>{ for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++){ const l=grid.get(key(it.kx+dx,it.ky+dy)); if(!l) continue;
    for(const m of l){ if(m<=k) continue; const o=items[m]; if(o.fi===it.fi) continue; if(Math.hypot(o.x-it.x,o.y-it.y)<tol) par[find(m)]=find(k); } } });
  const cl=new Map(); items.forEach((it,k)=>{ const r=find(k); if(!cl.has(r)) cl.set(r,[]); cl.get(r).push(k); });
  cl.forEach(mem=>{
    if(mem.length<2 || new Set(mem.map(k=>items[k].fi)).size<2) return;
    const an=mem.find(k=>items[k].gray); let cx,cy;
    if(an!==undefined){ cx=items[an].x; cy=items[an].y; } else { cx=mem.reduce((s,k)=>s+items[k].x,0)/mem.length; cy=mem.reduce((s,k)=>s+items[k].y,0)/mem.length; }
    if(mem.some(k=>Math.hypot(items[k].x-cx, items[k].y-cy) >= tol)) return; // 連鎖で大きく広がる群は触らない
    mem.forEach(k=>{ const it=items[k]; if(it.gray) return; if(it.x!==cx || it.y!==cy){ frs[it.fi].ptsMm[it.vi]={x:cx,y:cy}; st.welded++; } });
  });
  // 頂点が他の図形の辺の近く(許容差未満)なら、その辺の上へ寄せる(端点のごく近くは頂点合わせで済んでいる)
  const bb = frs.map(f=>ok(f)?{x1:Math.min(...f.ptsMm.map(q=>q.x))-tol, x2:Math.max(...f.ptsMm.map(q=>q.x))+tol, y1:Math.min(...f.ptsMm.map(q=>q.y))-tol, y2:Math.max(...f.ptsMm.map(q=>q.y))+tol}:null);
  frs.forEach((fa,ia)=>{ if(!ok(fa) || fa.color==='gray') return;
    fa.ptsMm.forEach((q,vi)=>{ let bestD=tol, bestQ=null;
      frs.forEach((fb,ib)=>{ if(ib===ia || !bb[ib] || q.x<bb[ib].x1 || q.x>bb[ib].x2 || q.y<bb[ib].y1 || q.y>bb[ib].y2) return;
        const m=fb.ptsMm.length; for(let e=0;e<m;e++){ const a=fb.ptsMm[e], b=fb.ptsMm[(e+1)%m]; const r=_segDistMm(q.x,q.y,a.x,a.y,b.x,b.y);
          if(r.d<bestD && r.d>1e-6 && r.t*r.len>1e-3 && (1-r.t)*r.len>1e-3){ bestD=r.d; bestQ={x:r.qx,y:r.qy}; } } });
      if(bestQ){ fa.ptsMm[vi]=bestQ; st.projected++; } });
  });
  // 安全装置: 面積が1%以上変わる・向きが変わる・新しい自己交差ができた図形は元に戻す
  frs.forEach((f,i)=>{ if(!backup.has(i)) return; const b=backup.get(i);
    const changed = f.ptsMm.some((q,k)=>q.x!==b[k].x || q.y!==b[k].y); if(!changed) return;
    const a0=_ringSignedAreaMm2(b), a1=_ringSignedAreaMm2(f.ptsMm);
    if(Math.sign(a0)!==Math.sign(a1) || Math.abs(a1-a0)>Math.abs(a0)*0.01 || (_ringSelfIntersects(f.ptsMm) && !_ringSelfIntersects(b))){ f.ptsMm=b; st.reverted++; }
  });
  return st;
}
// getAllFrustums()の結果(frs)に、クリーニング一式を通す。_setFrustumPtsMmで外接も更新する
function _cleanFrustumsMm(frs, tol){
  tol = (tol===undefined) ? _cleanTol() : tol;
  if(!(tol>0) || !frs || !frs.length) return frs;
  let removed=0;
  const cleanEach = () => frs.forEach(f=>{ if(!f || f.color==='gray' || !f.ptsMm || (f.holesMm && f.holesMm.length)) return;
    const c=_cleanOutlineMm(f.ptsMm, tol); if(c!==f.ptsMm){ removed += f.ptsMm.length-c.length; _setFrustumPtsMm(f, c); } });
  cleanEach();
  // 頂点合わせの結果(_weldFrustumsMmはptsMmを直接書き換える)に合わせて外接を更新するため、前後のptsMmを比べる
  const before = frs.map(f=>f && f.ptsMm ? f.ptsMm.map(q=>({x:q.x,y:q.y})) : null);
  const w = _weldFrustumsMm(frs, tol);
  frs.forEach((f,i)=>{ if(!before[i] || f.ptsMm.every((q,k)=>q.x===before[i][k].x && q.y===before[i][k].y)) return; const np=f.ptsMm; f.ptsMm=before[i]; _setFrustumPtsMm(f, np); });
  cleanEach(); // 頂点を合わせた結果できた一直線の点も除く
  if(removed || w.welded || w.projected || w.reverted) console.log(`[CLEAN] 形状のクリーニング(許容差${tol}mm): 一直線/近接の頂点を${removed}個除去・図形どうしの頂点を${w.welded}個合わせ・辺へ${w.projected}個寄せ・やめた図形${w.reverted}個`);
  return frs;
}
// ============================================================
// r134(49回目): 床クラック問題の根本対策P0 = 入口の整え(_alignFrustumsMm)と、回転した座標系での3D生成(buildManifoldUnionGeomのラッパー)
// 設計の要点(提案MD 6章): そろえは「辺の方向と位置だけ」を見る一般的な整え(特定の形の特別扱いはしない)。移動は頂点ごと・図形ごとに5mmまで(超える図形は元のまま)。
// 世界座標でそろえてそのまま10mm格子丸めに通すと効果が約1/4に落ちるため、3D生成は主方向θの回転座標系のまま行い、結果だけ戻す。
// ============================================================
const _ALIGN_AXIS_TOL_DEG = 1.5, _ALIGN_MOVE_CAP_MM = 5, _ALIGN_CLUSTER_MM = 5, _ALIGN_MIN_STRENGTH = 0.5;
function _alignRot(p, th){ const c=Math.cos(th), s=Math.sin(th); return {x:p.x*c-p.y*s, y:p.x*s+p.y*c}; }
// 辺の長さで重みを付けた主方向(0〜90°周期=4倍角の円平均)。斜めの辺(別方向の図形)に平均が引っ張られないよう、いまの主方向から3°以内の辺だけで求め直すのを繰り返す(最大8回)。
// 戻り値の集中度 = 最終的な主方向の軸から1.5°以内にある辺の長さの割合(0〜1。小さい=辺の向きが散らばる)
function _alignDominant(rings){
  const E=[]; let tot=0;
  for(const R of rings) for(let k=0;k<R.length;k++){ const a=R[k], b=R[(k+1)%R.length], dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy); if(L>0){ E.push({L,t:Math.atan2(dy,dx)}); tot+=L; } }
  if(!(tot>0)) return {theta:0, strength:0};
  const mean=(sel)=>{ let sx=0,sy=0; for(const e of sel){ sx+=e.L*Math.cos(4*e.t); sy+=e.L*Math.sin(4*e.t); } return Math.atan2(sy,sx)/4; };
  const off=(t,th)=>{ let d=((t-th)%(Math.PI/2)+Math.PI/2)%(Math.PI/2); return Math.min(d,Math.PI/2-d)*180/Math.PI; };
  let th=mean(E);
  for(let it=0; it<8; it++){ const sel=E.filter(e=>off(e.t,th)<=3); if(!sel.length) break; const nt=mean(sel); const conv=Math.abs(off(nt,th))<1e-9; th=nt; if(conv) break; }
  let inl=0; for(const e of E) if(off(e.t,th)<=_ALIGN_AXIS_TOL_DEG) inl+=e.L;
  return { theta: th, strength: inl/tot };
}
// frs=getAllFrustums()の配列(ptsMm/holesMmを世界座標のまま書き換え、外接も更新)。グレー(既存躯体)は触らない。戻り値={theta,aligned,reverted,maxMoveMm,hLines,vLines}かnull
function _alignFrustumsMm(frs){
  if(window._alignEdges === false || !frs || frs.length < 2) return null;
  const idx=[]; frs.forEach((f,i)=>{ if(f && f.color!=='gray' && f.ptsMm && f.ptsMm.length>=3 && !f._alignTheta) idx.push(i); });
  if(idx.length < 2) return null;
  const all=[]; idx.forEach(i=>{ all.push(frs[i].ptsMm); (frs[i].holesMm||[]).forEach(h=>all.push(h)); });
  const dom=_alignDominant(all);
  if(!(dom.strength >= _ALIGN_MIN_STRENGTH)){ console.log(`[ALIGN] 辺の向きが散らばる図面のため入口の整えは行いません(主方向の集中度${dom.strength.toFixed(2)}<${_ALIGN_MIN_STRENGTH})`); return null; }
  const th=dom.theta;
  // 1) −θ回転(元の位置をx0,y0に保持)
  const S=idx.map(i=>[frs[i].ptsMm].concat(frs[i].holesMm||[]).map(r=>r.map(p=>{ const q=_alignRot(p,-th); return {x:q.x,y:q.y,x0:q.x,y0:q.y}; })));
  // 2) 水平/垂直に近い辺(1.5°以内)のうち、端点の差の半分が移動上限以内のもの(丸めによるずれと見なせる辺)だけ集める
  const H=[], V=[];
  S.forEach((rings,si)=>rings.forEach((P,ri)=>{ const n=P.length;
    for(let k=0;k<n;k++){ const a=P[k], b=P[(k+1)%n], ang=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI, m=((ang%90)+90)%90, off=Math.min(m,90-m);
      if(off>_ALIGN_AXIS_TOL_DEG) continue;
      const isH=Math.abs(Math.sin(ang*Math.PI/180))<0.5;
      if((isH?Math.abs(b.y-a.y):Math.abs(b.x-a.x))/2 > _ALIGN_MOVE_CAP_MM) continue;
      (isH?H:V).push({si,ri,a:k,b:(k+1)%n,v:isH?(a.y+b.y)/2:(a.x+b.x)/2}); } }));
  // 3) 図形をまたいで、ほぼ同じ直線(値の幅が5mm以内)を1本にそろえる。
  // 4) 図形ごとの移動上限: 元の位置から5mmを超えて動く頂点がある図形は、元のまま(何もしない)。元のままにした図形の辺は、そろえる直線の平均に加えない(平均を引っ張って他の図形を余計に動かさない)ので、
  //    外してから組み直す(最大6回。外れる図形が増えなくなったら確定)。
  const _clMm=(typeof window._alignClusterMm==='number')?window._alignClusterMm:_ALIGN_CLUSTER_MM; // 試験用に上書き可(既定5mm)
  const cluster=arr=>{ const s2=arr.slice().sort((p,q)=>p.v-q.v); let i=0; while(i<s2.length){ let j=i; while(j+1<s2.length && s2[j+1].v-s2[i].v<=_clMm) j++; const m=s2.slice(i,j+1).reduce((u,e)=>u+e.v,0)/(j-i+1); for(let k=i;k<=j;k++) s2[k].v=m; i=j+1; } };
  const avg=a=>a.reduce((u,v)=>u+v,0)/a.length;
  const out=new Array(S.length).fill(null), worstOf=new Array(S.length).fill(0), dropped=new Set();
  let Hc=[], Vc=[];
  for(let iter=0; iter<6; iter++){
    Hc=H.filter(e=>!dropped.has(e.si)).map(e=>({...e})); Vc=V.filter(e=>!dropped.has(e.si)).map(e=>({...e}));
    cluster(Hc); cluster(Vc);
    const acc=S.map(rings=>rings.map(P=>P.map(()=>({xs:[],ys:[]}))));
    for(const e of Hc){ acc[e.si][e.ri][e.a].ys.push(e.v); acc[e.si][e.ri][e.b].ys.push(e.v); }
    for(const e of Vc){ acc[e.si][e.ri][e.a].xs.push(e.v); acc[e.si][e.ri][e.b].xs.push(e.v); }
    let changed=false;
    S.forEach((rings,si)=>{ if(dropped.has(si)){ out[si]=null; return; }
      const Q=rings.map((P,ri)=>P.map((p,k)=>({x:acc[si][ri][k].xs.length?avg(acc[si][ri][k].xs):p.x, y:acc[si][ri][k].ys.length?avg(acc[si][ri][k].ys):p.y})));
      let worst=0; Q.forEach((R,ri)=>R.forEach((q,k)=>{ worst=Math.max(worst,Math.hypot(q.x-rings[ri][k].x0,q.y-rings[ri][k].y0)); }));
      worstOf[si]=worst;
      if(worst>_ALIGN_MOVE_CAP_MM){ dropped.add(si); out[si]=null; changed=true; } else out[si]=Q; });
    if(!changed) break;
  }
  let maxMove=0, aligned=0; const reverted=dropped.size, moves=worstOf.map(w=>+w.toFixed(2));
  out.forEach((Q,si)=>{ if(Q){ aligned++; maxMove=Math.max(maxMove,worstOf[si]); } });
  const res=out;
  if(aligned<2) return null; // 図形をまたぐそろえが成り立たない(1個だけ等)なら従来どおり
  // 5) そろえた輪郭を世界座標(+θ)に戻して書き込む(外接も更新)。元のまま(null)の図形は触らない
  res.forEach((Q,si)=>{ if(!Q) return; const f=frs[idx[si]];
    _setFrustumPtsMm(f, Q[0].map(q=>_alignRot(q,th)));
    if(f.holesMm && f.holesMm.length) f.holesMm = Q.slice(1).map(R=>R.map(q=>_alignRot(q,th))); });
  // 6) 10mm格子の位相(座標系の平行移動)を選ぶ: ほぼ同じ(5mm以上10mm未満離れた)直線どうしが格子丸めの境目で別々のマスに割れると、10mmの細い面→細長い面になる。
  //    割れる組が最も少なく、丸めの境目から最も遠い位相を、1/4mm刻みで探す(x・yは独立)。格子は_vertexQuantMm(=3D生成の入口の丸め)と同じ。
  const Q=Math.max(window._vertexQuantMm||0,1);
  // 候補は上位3つ(2mm以上離す)。実際に作った結果に不具合(細長い逆勾配・底面の裏返り)が出たら、次の候補の位相で作り直す(buildManifoldUnionGeomのラッパー)。
  const phases=(vals)=>{ const u=[...new Set(vals.map(v=>Math.round(v*1e4)/1e4))].sort((a,b)=>a-b); const sc=[];
    for(let t=0;t<Q;t+=0.25){ let split=0, marg=Infinity;
      for(let i=0;i<u.length;i++){ const f=(((u[i]+t)/Q)%1+1)%1; marg=Math.min(marg,Math.abs(f-0.5)*Q); // 境目(k+0.5)までの距離
        if(i+1<u.length && u[i+1]-u[i]<Q && Math.round((u[i]+t)/Q)!==Math.round((u[i+1]+t)/Q)) split++; }
      sc.push({t,split,marg}); }
    sc.sort((a,b)=>a.split-b.split || b.marg-a.marg);
    const out=[]; for(const c of sc){ if(out.every(o=>Math.min(Math.abs(o.t-c.t),Q-Math.abs(o.t-c.t))>=2)) out.push(c); if(out.length>=3) break; }
    return out; };
  // 元のまま(5mm超で整えなかった)図形の辺も、格子の位置の評価に入れる: そのままだと他の直線との5〜10mmの近接が評価から漏れ、格子の境目で割れて細い面になる。両端の値を別々に入れる(傾いた辺は両端で値が違う)。
  const xAll=Vc.map(e=>e.v), yAll=Hc.map(e=>e.v);
  for(const e of H){ if(dropped.has(e.si)){ yAll.push(S[e.si][e.ri][e.a].y0, S[e.si][e.ri][e.b].y0); } }
  for(const e of V){ if(dropped.has(e.si)){ xAll.push(S[e.si][e.ri][e.a].x0, S[e.si][e.ri][e.b].x0); } }
  const pxL=phases(xAll), pyL=phases(yAll);
  const px=pxL[0], py=pyL[0];
  const combos=[]; for(let a=0;a<pxL.length;a++) for(let b=0;b<pyL.length;b++) combos.push({tx:pxL[a].t, ty:pyL[b].t, r:a+b});
  combos.sort((u,v)=>u.r-v.r); const phaseList=combos.slice(0,6).map(c=>({tx:c.tx,ty:c.ty}));
  frs.forEach(f=>{ if(f){ f._alignTheta = th; f._alignTx = px.t; f._alignTy = py.t; f._alignPhases = phaseList; } });
  console.log(`[ALIGN] 入口の整え(r134): 主方向${(th*180/Math.PI).toFixed(2)}°(集中度${dom.strength.toFixed(2)})・${aligned}図形をそろえ・元のまま${reverted}図形・水平${H.length}/垂直${V.length}本・頂点の最大移動${maxMove.toFixed(1)}mm・格子の位相(${px.t},${py.t})mm(割れる組 x${px.split}/y${py.split}・候補${phaseList.length}個)`);
  return { theta: th, tx: px.t, ty: py.t, phases: phaseList, aligned, reverted, maxMoveMm: maxMove, hLines: H.length, vLines: V.length, moves, strength: dom.strength, splitX: px.split, splitY: py.split };
}
// 回転の出入り(ラッパー用)。frustum・グレーを座標系(−θ回転→(tx,ty)平行移動)へ(外接は輪郭から作り直す=ODぶん広げる)。_alignThetaは0にして入れ子の呼び出しで二重に回さない
function _alignFrameOf(frs){ if(_frame!==null || !frs) return null; for(const f of frs){ const t=f && f._alignTheta; if(typeof t==='number' && isFinite(t) && Math.abs(t)>1e-9){ const ph=(f._alignPhases && f._alignPhases.length) ? f._alignPhases : [{tx:f._alignTx||0, ty:f._alignTy||0}]; return {th:t, tx:ph[0].tx, ty:ph[0].ty, phases:ph}; } } return null; }
// 作った結果の不具合を数える(回転座標系のまま・位置はm): ①細長い逆勾配の面(高さ1mm超・幅20mm未満・上向き成分0.05〜0.99) ②底面(水平・深さ5mm超)の裏返り(上向きの水平面)。0なら健全
function _alignDefectCount(r){
  if(!r || !r.positions) return 0; const P=r.positions; let bad=0;
  for(const L of [r.cyanIndices, r.redIndices]){ if(!L) continue;
    for(let t=0;t+2<L.length;t+=3){ const a=L[t]*3,b=L[t+1]*3,c=L[t+2]*3;
      const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],wx=P[c]-P[a],wy=P[c+1]-P[a+1],wz=P[c+2]-P[a+2];
      const nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx, n=Math.hypot(nx,ny,nz); if(n<1e-12) continue;
      const e=Math.max(Math.hypot(ux,uy,uz),Math.hypot(wx,wy,wz),Math.hypot(P[c]-P[b],P[c+1]-P[b+1],P[c+2]-P[b+2])), y=ny/n;
      const hh=Math.max(P[a+1],P[b+1],P[c+1])-Math.min(P[a+1],P[b+1],P[c+1]);
      if(y>0.05 && y<=0.99 && n/e<0.02 && hh>0.001) bad++;
      else if(y>0.99 && hh<0.0005 && P[a+1]<-0.005) bad++; } }
  return bad;
}
function _alignToFrame(f, fr){
  const _rd=v=>Math.round(v*1e4)/1e4; // 往復の浮動小数点ノイズ(1e-11mm級)を0.1μmに丸めて消す=同じ直線の頂点が10mm格子丸めの境目で割れない
  const rp=p=>{ const q=_alignRot(p,-fr.th); return {x:_rd(q.x+fr.tx), y:_rd(q.y+fr.ty)}; }, pts=f.ptsMm.map(rp), o=f.OD||0;
  const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
  return Object.assign({}, f, { ptsMm: pts, holesMm: (f.holesMm||[]).map(h=>h.map(rp)),
    x1:Math.min(...xs)-o, x2:Math.max(...xs)+o, y1:Math.min(...ys)-o, y2:Math.max(...ys)+o, _alignTheta:0 });
}
// 結果の位置(x,z。単位m・原点は回転の中心=ローカル座標の原点)を元の座標系へ戻す(平行移動を引いて+θ回転)。同じ配列が複数のフィールドに入っていても1回だけ
function _alignRotateResultBack(r, fr){
  const c=Math.cos(fr.th), s=Math.sin(fr.th), tx=fr.tx*0.001, ty=fr.ty*0.001, done=new Set();
  const rotArr=a=>{ if(!a || done.has(a) || typeof a.length!=='number') return; done.add(a);
    for(let i=0;i+2<a.length;i+=3){ const x=a[i]-tx, z=a[i+2]-ty; a[i]=x*c-z*s; a[i+2]=x*s+z*c; } };
  rotArr(r.positions);
  for(const k of ['yamadomeOverlay','purpleWallOverlay','purpleWallsForPlacement']){ if(r[k]) rotArr(r[k].positions); }
}

// ============================================================
// r100(36回目): 既存躯体(グレー)「底面∞」の共通関数群
// 仕様(マスター合意): 3Dイメージの土量計算(doboku)系統のみ、既存躯体の下端を
// 「サイト最深の下端」にちょうど(余白0)揃えて延長する。通常計算には適用しない。
// 余白0にする理由: (1)_calcExistingStructureOverlapVolumeは全frustumのmaxDepthまで
// 10mm刻みでスライスするため、最深より深く延ばすと最終スライスの切れ方が変わり
// 体積がズレうる (2)buildExistingStructureOverlapMeshのブレークポイントはSetで
// 許容誤差なしの重複排除なので、下端が最深とビット一致していないと極薄区間ができる。
// → extendGrayToBottomMmで「D-(tl||0)===最深」のビット一致を作る(小数mmで丸め誤差により
//   不可能な場合のみ+0.01mmの保険。整数mmでは常に完全一致)。
// 体積計算本体(_calcVolumeFallback等)は一切変更していない(入力のDを延ばすだけ)。
// 呼び出し元: runCalc(doboku) / voldia_export.js の buildVoldiaGLBBytes・
// buildExistingStructureOverlapGLBBytes。最深値の算出規則はここに一本化する。
// ============================================================
// list: 「botDepth = f.D-(f.tl||0)」が成り立つ座標系に揃ったfrustum配列
function siteDeepestBottomMm(list){
  let deepest = 0;
  (list||[]).forEach(f=>{
    const d = f.D - (f.tl||0);
    if(d > deepest) deepest = d;
  });
  return deepest;
}
// 既存躯体1個の下端をdeepestまで延長(浅い場合のみ)。D-(tl||0)===deepestを保証する
function extendGrayToBottomMm(f, deepest){
  const tl = f.tl||0;
  if(!(deepest > f.D - tl)) return f;
  let D = deepest + tl;
  for(let i=0; i<4 && (D - tl) !== deepest; i++) D += deepest - (D - tl);
  if((D - tl) === deepest) return {...f, D};
  // 小数mm入力(0.1mm刻み等)では、浮動小数の丸めで「D-tl」を最深と完全一致させられない
  // ケースがある(36回目のNode検証で0.1mm刻み入力の約1.3%。整数mmは0件)。その場合に
  // 1e-13級の近接ブレークポイントができると輪郭評価(EPS=1e-3)が壊れるため、確実に
  // 別の深さと見なせる0.01mmだけ深くする。体積への影響は最大でも0.01mm×重複面積程度。
  const D2 = deepest + tl + GRAY_INF_FALLBACK_MARGIN_MM;
  return {...f, D: D2, _grayInfMargin: true};
}
const GRAY_INF_FALLBACK_MARGIN_MM = 0.01;
// 生frustum(getAllFrustums直後)から、runCalc(doboku)と同じ規則で最深値を求める
// (buildVoldiaGLBBytes用。runCalc本体は処理済みfsをsiteDeepestBottomMmに直接渡す)
function computeDobokuSiteBottomFromRaw(rawFs, concVal, glOffMm){
  const glOff = glOffMm || 0;
  const list = [];
  (rawFs||[]).forEach(f=>{
    const tl = f.tl||0;
    if(f.color === 'gray'){
      const Dg = f.D - concVal;                 // 描いた形状そのまま(捨てコンなし)
      if(!(Dg > 0)) return;
      let tlg = tl, Dgg = Dg;
      if(glOff){
        tlg = Math.min(tl, glOff);
        Dgg = tlg - (tl - Dg);                  // 下端は不動(r016)
        if(!(Dgg > 0)) return;
      }
      list.push({D: Dgg, tl: tlg - glOff}); // r107: runCalc本体と同じ「現状地盤=0」座標系(glOff=0なら従来と同じ)
    }else{
      if(!(tl - f.D + concVal < 0)) return;     // runCalc同様: 下端がGLより上は除外
      let d = (tl === 0) ? f.D : f.D - tl;
      if(!(d > 0)) return;
      if(glOff){ d = d + glOff; if(!(d > 0)) return; }
      list.push({D: d, tl: 0});
    }
  });
  return siteDeepestBottomMm(list);
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
  if(typeof updateOutputButtons==='function') updateOutputButtons(); // r115: GLB出力/LANDXML出力ボタンを計算前の状態(非表示)に戻す
  const _ba0=document.getElementById('btn-analyze-structure');if(_ba0)_ba0.classList.remove('show');
  const _be0=document.getElementById('btn-analyze-earthwork');if(_be0)_be0.classList.remove('show');
  ['btn-calc-run','btn-calc-doboku'].forEach(id=>{
    const b=document.getElementById(id);if(b){b.disabled=false;b.textContent=id==='btn-calc-doboku'?'⚡ 土量計算':'⚡ 通常計算';}
  });
  
  _lastGeoms = null;
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
// r112: _lastExistingStructGeoms(26回目新設の既存躯体キャッシュ)を削除。27回目からexport側が読まなくなり、書き込みのみだった(詳細は buildMeshFromGeoms 付近の【r112 削除】コメント)。
let _meshMaterials=[]; // 透過スライダー制御用マテリアル参照（現在アクティブなもの＝グラデ時はPhong/ソリッド時はBasic）
let _meshObjs=[]; // r038: ソリッド⇔グラデ切替時にマテリアルを丸ごと差し替えるためのメッシュ本体参照
let _existingStructMat=null; // r110(37回目): 既存躯体メッシュのマテリアル参照(透過スライダー連動用)
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
// (runCalc()内、天端0正規化の直後)。通常計算・配置モードへの反映は別途相談(次の段階)。
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
  // r110(37回目、マスター要望): 既存躯体(グレー)も透過スライダーに連動させる。
  // 従来は「常にグレーの独立表示」仕様でスライダー対象外だったため、他が透けても躯体だけ不透明のままだった。
  // ソリッド⇔グラデ切替の対象外(頂点カラーを持たない)という扱いは変えず、不透明度と深度書込だけ連動させる。
  if(_existingStructMat){
    _existingStructMat.opacity = op;
    _existingStructMat.transparent = op < 0.99;
    _existingStructMat.depthWrite = wantDepthWrite;
    _existingStructMat.needsUpdate = true;
  }
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
    if(btn) btn.classList.remove('on'); // r113: 色ボタン OFF=ソリッド
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
    if(btn) btn.classList.add('on'); // r113: 色ボタン ON=グラデ
    // r103: マテリアルが新規に作り直されたので、影ON中なら影の設定(shadowSide等)を掛け直す
    try{ if(window._shadowVisible === true) applyShadowState(); }catch(e){}
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
  if(typeof updateOutputButtons==='function') updateOutputButtons(); // r115
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
  // r109(37回目): 現状地盤GLは「入力欄に見えている値=適用する値」を計算の度に保証する。onchangeでしか反映
  // されない作りだと、ブラウザの入力欄復元や.vold読込の後に、表示は-1200なのに適用値は0という食い違いが起きる。
  { const _glEl = document.getElementById('gl-offset-mm'); if(_glEl && typeof onGlOffsetChange === 'function') onGlOffsetChange(); }
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
  const concVal=( v => isNaN(v) ? 110 : v)(parseInputNum(document.getElementById('conc-thick')));
  // Voldia版: 個別「垂直/法面」「余掘」UIを廃止し、計算モードで全オブジェクト一律に統一
  if(mode==='normal'){
    fs = fs.map(f=>({...f, noSlope:true}));
  } else if(mode==='doboku'){
    const globalOD=( v => isNaN(v) ? 200 : Math.max(0,v))(parseInputNum(document.getElementById('global-overdig')));
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
      const {pts, deleted} = tryChamferMm(f.ptsMm);
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
        const bottom = (f.tl||0) - f.D; // 描いた通りの不動の下端(GL基準)
        const clippedTl = Math.min(f.tl||0, glOff);
        // r107(37回目): 青・山留は「現状地盤=0(天端0)」の座標系で組まれている(D+=glOff)が、
        // 既存躯体はGL基準(描いた値)のままだったため、GL≠0で青との高さが glOff だけ食い違っていた
        // (体積計算・3D表示・Land Logic共通の不具合)。切り下げ(clip)まではGL基準で行い、
        // その後に全体を -glOff だけ平行移動して現状地盤=0の座標系へ揃える。
        // 平行移動なので大きさ(D)は不変(r016の「大きさを変えない」仕様はそのまま守る)。
        return {...f, tl: clippedTl - glOff, D: clippedTl - bottom};
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
  // r100(36回目): 既存躯体の底面∞。土量計算(doboku)のみ、既存躯体の下端を
  // サイト最深の下端(余白0)まで延長する。ここで延ばしたfsから体積計算(A)(B)・
  // 3D表示・_lastGeoms系が全て派生するため、この1箇所で本体側は完結する。
  if(mode==='doboku' && _grayFsUntouched.length){
    const _siteBot = siteDeepestBottomMm(fs.concat(_grayFsUntouched));
    _grayFsUntouched = _grayFsUntouched.map(f=>extendGrayToBottomMm(f, _siteBot));
    console.log('[GRAY-INF] 既存躯体の底面を最深まで延長 最深=' + _siteBot + 'mm 既存躯体=' + _grayFsUntouched.length + '個(うち丸め誤差回避の+0.01mm適用=' + _grayFsUntouched.filter(f=>f._grayInfMargin).length + '個)');
  }
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
  // r121(43回目): 法面が安定して作れない形状の事前判定(上の自己交差チェックと同じ扱い=赤にして中止)。
  {
    const unstableFs = fs.filter(f => !_frustumLayerStable(f));
    if(unstableFs.length){
      const badIdx2 = new Set(unstableFs.map(f=>f.srcIdx));
      unstableFs.forEach(f => { if(shapes[f.srcIdx]) shapes[f.srcIdx]._voldiaGeoError = true; });
      fs = fs.filter(f => !badIdx2.has(f.srcIdx));
      updSidebar(); redraw();
      const names2 = unstableFs.map(f => (shapes[f.srcIdx]&&shapes[f.srcIdx].name) || '(無名)');
      console.warn('[UNSTABLE-SHAPE] 法面が安定して作れない形状を弾きました: ' + names2.join(','));
      await customAlert(
        `法面が安定して作れない形状がある場合、この計算モードでは計算出来ません\n\n`
        + `対象：${names2.slice(0,5).join('、')}${names2.length>5?` 他${names2.length-5}件`:''}\n\n`
        + `計算出来ない図形は赤色にしたので、分割して描きなおしてください`
      );
      btn.disabled=false; btn.textContent=mode==='doboku'?'⚡ 土量計算':'⚡ 通常計算';
      closeCalcModal();
      return;
    }
  }
  // 新3(2026-08-28 引継ぎ18回目マスター指示→26回目セッションで紫に移設): 毎回出る
  // 「値は参考値です」トーストはres-box常設の.vol-cautionに一本化するため廃止。
  // 代わりに、土量計算で紫(垂直面強制)オブジェクトが存在する場合のみ、起動
  // (ページ読み込み)毎に1回だけ目立つ横長トーストで注意喚起する。
  // r100(36回目マスター仕様): 土量計算の実行時、既存躯体が1個以上あれば毎回トーストを出す。
  // 紫の初回警告と同時に出る場合は、共有toastが上書きされないよう上部専用toastTopに出す。
  if(mode==='doboku' && fs.some(f=>f.color==='gray')){
    const _grayMsg = '既存躯体の底面は、最深の掘削底まで∞(延長)として扱われます';
    if(!_purpleCalcWarnShown && fs.some(f=>f.color==='purple')) toastTop(_grayMsg, 4000);
    else toast(_grayMsg, 3600, 'graystruct');
  }
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
    if(typeof updateOutputButtons==='function') updateOutputButtons(); // r115: 通常計算=GLB出力 / 土量計算=GLB出力+LANDXML出力(測点が無ければグレーアウト)
    // r098(34回目セッション、Land Logic用): LandXML向け試験出力(js/voldia_landlogic.js、
    // Shift+Lトリガー)が、この土量計算で確定したfrustum一式(法面勾配込み)と
    // 正規化オフセットをそのまま再利用できるよう、ここでキャッシュしておく。
    // 既存の表示/積算ロジック自体には一切影響しない(参照するだけの追加行)。
    window._lastCalcFrustumsForLandLogic = fs;
    window._lastCalcOffsetXForLandLogic = _yamadomeOffsetX;
    window._lastCalcOffsetYForLandLogic = _yamadomeOffsetY;
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
let threeDirLight=null; // r101: 影ON/OFF用に平行光源の参照を保持
let threeAmbLight=null; // r102: 影ON時に環境光を弱めて明暗差を出すための参照
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
        ? await buildManifoldUnionGeom(excavFrustumsForMesh, isDoboku, yamadomeOffsetX, yamadomeOffsetY, {grayFrustums: structFrustumsForMesh, decimateTolMm: (typeof window._planarDecimateTolMm==='number' ? window._planarDecimateTolMm : 5)}) // r126: 紫の壁ハッチからグレー(既存躯体)接触部分を除くため渡す
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

  // 【r112 削除】26回目に追加した「既存躯体の描いた形状そのまま」ジオメトリのキャッシュ(_lastExistingStructGeoms)を組み立てるブロックを削除。
  //   経緯: 26回目にGLB出力の専用ノード(Voldia_ExistingStructure)用として新設 → 27回目(voldia_export.js r010)で、export側は
  //   このキャッシュに頼らず fs(図形リスト)から毎回作り直す方式に変わり、以後このキャッシュは書き込みだけで誰にも読まれていなかった。
  //   全ファイル(JS5本+ライブラリ/モデル/アセット4本+HTML2本)を横断して読み手ゼロを確認して削除。
  //   ※ 専用ノード自体は今も出力される(voldia_export.js が fs から作る。voldia_placement.js が Voldia_ExistingStructure として受け取る)。
  //   ※ ここで呼んでいた buildFrustumGeometry() は外部状態を書き換えない(引数も複製)ことを確認済みなので、削除で挙動は変わらない。
  //   ※ structFrustumsForMesh 自体は、下の表示(esPositions/esIndices等)でまだ使っている。

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
  _existingStructMat = null;
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
        _existingStructMat = esMat; // r110: 透過スライダー連動用に参照を保持
        // r005: マスター提案の対策。既存躯体の天端が掘削シェルの段差・法面頂部と
        // 高さ方向で完全一致すると、掘削側の輪郭線(navyEdges)が既存躯体の面と
        // 同一平面に来てしまい、あたかも躯体の上に線が乗っているように見える
        // (候補①、山留の天端で実際に再現・確認済み)。ここは表示専用のThree.js
        // Mesh位置(position)を1mmだけ持ち上げるだけで、esPositions/esIndices
        // 自体(体積計算・GLB出力データ、(旧)_lastExistingStructGeomsは別途独立して
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
  if(_solidBtn) _solidBtn.classList.add('on'); // r113: 3D生成のたびグラデ(=色ON)に戻る
  // r113: メッシュ(基準グリッド)のON/OFFは再計算をまたいで保持される(window._baseGridVisible)ので、ボタン色もそれに合わせる
  { const _gridBtn = document.getElementById('btn-base-grid-toggle'); if(_gridBtn) _gridBtn.classList.toggle('on', window._baseGridVisible === true); }

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
  // r117(41回目・マスター指摘): 既存躯体(グレーの箱)にもエッジ線を付ける。従来は掘削側(navyEdges)にしか線が無く、
  //   3Dの透過を上げると既存躯体だけ輪郭が消えて見えなくなっていた。掘削側と同じ線マテリアル(_edgeMat/_edgeMat2)を共有するので、
  //   透過スライダーによる線の明るさ・濃さの連動も同じになる。既存躯体メッシュの子にするので、表示専用の20mm持ち上げもそのまま効く。
  if(existingStructMesh){
    try {
      const _esEdgeGeo = computeEdgesGeometrySafeGuarded(existingStructMesh.geometry, 20, 30000);
      if(_esEdgeGeo && _esEdgeGeo.attributes.position && _esEdgeGeo.attributes.position.count > 0){
        const _esEdges = new THREE.LineSegments(_esEdgeGeo, _edgeMat);
        _esEdges.renderOrder = 2;
        existingStructMesh.add(_esEdges);
        // 擬似太線(掘削側と同じ作り: 重心基準でごく僅かに拡大した複製)
        const _esBox = new THREE.Box3().setFromBufferAttribute(_esEdgeGeo.attributes.position);
        const _esCenter = new THREE.Vector3(); _esBox.getCenter(_esCenter);
        const _esThickGeo = _esEdgeGeo.clone(); _esThickGeo.translate(-_esCenter.x, -_esCenter.y, -_esCenter.z);
        const _esEdgesThick = new THREE.LineSegments(_esThickGeo, _edgeMat2);
        _esEdgesThick.position.copy(_esCenter); _esEdgesThick.scale.set(1.0015, 1.0015, 1.0015); _esEdgesThick.renderOrder = 1;
        existingStructMesh.add(_esEdgesThick);
      }
    } catch(e) {
      console.warn('[既存躯体エッジ] 生成に失敗したため、線なしで続行します:', e);
    }
  }
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
  // ・通常計算はrunCalc()で全frustumのnoSlopeを強制trueにしており法面が一切
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
  threeAmbLight=new THREE.AmbientLight(0xffffff,.45);threeS.add(threeAmbLight);
  const dl=new THREE.DirectionalLight(0xffffff,.8);dl.position.set(1,2,1).normalize();threeS.add(dl);
  threeDirLight=dl; // r101: 影ON/OFF用(影はデフォルトOFF。ONにした時だけshadow設定を有効化)
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
  // r101(36回目): 影ON/OFFボタンの用意と、前回のON/OFF状態の反映(デフォルトOFF)
  try{ ensureShadowButton(); applyShadowState(); }catch(e){ console.warn('[SHADOW] 初期化で例外(影なしで続行):', e); }
  const cv=threeR.domElement;
  cv.addEventListener('contextmenu',e=>e.preventDefault());
  // r138(50回目): ホイール(中ボタン)を押すと、ブラウザの「自動スクロール」(十字✥のポインタ)が始まり、動かさずに離すと残ったままになっていた。
  //   中ボタンのmousedownの既定動作を止める(2Dの作図画面は元々 e.preventDefault 済み)。回転(中ボタンドラッグ)はそのまま。auxclickも止める。
  cv.addEventListener('auxclick',e=>{ if(e.button===1) e.preventDefault(); });
  cv.addEventListener('mousedown',e=>{
    if(e.button===1) e.preventDefault();
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
  threeDirLight=null; // r101
  threeAmbLight=null; // r102
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
    btn.classList.toggle('on', window._baseGridVisible === true); // r113: ON/OFFはボタン色で表す
  }
}

// ============================================================
// r101(36回目): 3Dイメージの「影」ON/OFF(デフォルトOFF)
// 仕様(マスター指示): デフォルトOFF、ボタンを押すと影を表示。
// ・既存の平行光源(dl)の向きは変えず、shadow設定だけON/OFFする(見た目の明るさは不変)。
// ・OFF時はrenderer.shadowMap.enabled=false・castShadow/receiveShadow=falseで、
//   影のための描画は一切走らない(動作軽量化方針の維持)。
// ・ON時もshadowMap.autoUpdate=falseで、ON/再構築の時に1回だけ影マップを作る
//   (ライトとメッシュ形状は不動で、カメラだけ動くため毎フレーム更新は不要)。
// ・対数深度バッファ(logarithmicDepthBuffer)併用: three r128は非透視投影を
//   vIsPerspectiveで判定しgl_FragCoord.zを使うため、平行光源の影と共存できる(r128ソースで確認)。
// ・ソリッド表示(MeshBasicMaterial)は光源計算を行わないため、影は付かない(グラデ表示で有効)。
// ・影はメッシュ自身への落ち影(自己影)のみ。地面の受け面は設けていない。
// ============================================================
const SHADOW_MAP_SIZE = 1024;      // 影マップの解像度(px)
const SHADOW_BASE_AMBIENT = 0.45;  // 影OFF時の環境光(初期化時の値と同じ)
const SHADOW_BASE_DIRECT  = 0.8;   // 影OFF時の平行光(初期化時の値と同じ)
const SHADOW_CASTER_FRONT_ONLY = true;   // 影マップに書くのは光に向いた面だけ(縞=シャドウアクネ対策)
const SHADOW_NORMAL_BIAS_TEXELS = 3;     // 受ける面を法線方向へ持ち上げる量(影マップ何画素分か)。縞が残れば増、影が浮けば減
const SHADOW_DEPTH_BIAS = -0.0005;       // 深さ方向の微小補正(影マップの深さ0〜1に対する比)
const SHADOW_AMBIENT_RATIO = 0.55; // 影ON時の環境光の倍率。小さいほど影が濃い(1.0=従来の明るさ=影が薄い)
// 影ON直後の2フレーム後に、キャンバス/影マップのサイズとGLエラーを1回だけログ出力する診断。
// 「WebGL warning: Drawing to a destination rect smaller than the viewport rect」の原因切り分け用。
function _shadowDiagOnce(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    try{
      if(!threeR || !threeDirLight) return;
      const cv = threeR.domElement, gl = threeR.getContext();
      const sm = threeDirLight.shadow.map;
      console.log('[SHADOW-DIAG] canvas(buffer)=' + cv.width + 'x' + cv.height
        + ' css=' + cv.clientWidth + 'x' + cv.clientHeight
        + ' dpr=' + window.devicePixelRatio + ' pixelRatio=' + threeR.getPixelRatio()
        + ' shadowMap=' + (sm ? sm.width + 'x' + sm.height : 'なし')
        + ' maxTex=' + gl.getParameter(gl.MAX_TEXTURE_SIZE)
        + ' glError=' + gl.getError());
    }catch(e){ console.warn('[SHADOW-DIAG] 診断で例外', e); }
  }));
}
function updateShadowButtonLabel(){
  const b = document.getElementById('btn-shadow-toggle');
  if(!b) return;
  const on = window._shadowVisible === true;
  b.classList.toggle('on', on); // r113: ON/OFFはボタン色で表す(文字は常に「影」)
}
function ensureShadowButton(){
  let b = document.getElementById('btn-shadow-toggle');
  if(!b){
    const g = document.getElementById('btn-base-grid-toggle');
    if(!g || !g.parentNode) return; // 基準ボタンが無い画面では何もしない
    b = g.cloneNode(false);
    b.id = 'btn-shadow-toggle';
    b.removeAttribute('onclick'); // 複製元のインライン onclick(メッシュ切替)を引き継がない
    b.onclick = toggleShadowVisibility;
    b.title = '影の表示ON/OFF(グラデ表示時のみ有効)';
    // 見た目をID指定のCSSに依存している場合に備え、必要なら計算済みスタイルを写す
    if(!g.className && !g.getAttribute('style')){
      const cs = getComputedStyle(g);
      ['fontSize','fontFamily','fontWeight','padding','border','borderRadius','background','color','cursor'].forEach(k=>{ b.style[k] = cs[k]; });
    }
    g.parentNode.insertBefore(b, g.nextSibling);
    // r103(マスター要望): 上2個(戻る・メッシュ)/下2個(影・スクショ)に揃える。
    // 「メッシュ」ボタンの直後に全幅の改行用要素を挟み、影ボタン以降を必ず2段目へ送る。
    if(!document.getElementById('btn-row-break-shadow')){
      const br = document.createElement('div');
      br.id = 'btn-row-break-shadow';
      br.style.cssText = 'flex-basis:100%;height:0;width:0;margin:0;padding:0;border:0;';
      g.parentNode.insertBefore(br, b);
    }
    // r102(36回目): ボタンが1個増えて、行の右端(スクショボタン)が画面外に出て押せなくなった。
    // 行を折り返し可能にする(幅が足りない時だけ2段になる。足りていれば見た目は従来のまま)。
    const row = g.parentNode;
    const rcs = getComputedStyle(row);
    if(rcs.display !== 'flex' && rcs.display !== 'inline-flex') row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    const gap = parseFloat(rcs.columnGap) || 0;
    if(gap <= 0){ row.style.rowGap = '6px'; }
    b.style.marginLeft = '0'; // 2段目の先頭になるため左の余白は不要
  }
  updateShadowButtonLabel();
}
function applyShadowState(){
  if(!threeR || !threeS || !threeDirLight) return;
  const on = window._shadowVisible === true;
  const dl = threeDirLight;
  // 光源計算を行うPhongメッシュ(掘削形状・山留ハッチ・紫壁・既存躯体など)だけが対象
  const targets = [];
  threeS.traverse(o=>{ if(o.isMesh && o.material && o.material.isMeshPhongMaterial) targets.push(o); });
  _meshObjs.forEach(m=>{ if(targets.indexOf(m) < 0) targets.push(m); });
  targets.forEach(m=>{
    const was = m.userData._shadowOn === true;
    m.castShadow = on; m.receiveShadow = on; m.userData._shadowOn = on;
    // シェーダの影有無が変わる時だけ再コンパイルさせる(デフォルトOFFのままなら何もしない)
    if(was !== on && m.material) m.material.needsUpdate = true;
    // r103: 影を落とす(影マップに書く)のは光に向いた面だけにする。掘削形状は閉じた立体で、
    // 器の内側(光を受ける面)は法線が光に背を向けた面=「受ける側」なので、これを影マップに
    // 書かないことで、自分自身の面が自分に影を落とす縞模様(シャドウアクネ)を根本から避ける。
    // 不都合があればSHADOW_CASTER_FRONT_ONLYをfalseにすると従来(両面を書く)に戻る。
    if(m.material) m.material.shadowSide = (on && SHADOW_CASTER_FRONT_ONLY) ? THREE.FrontSide : null;
  });
  threeR.shadowMap.enabled = on;
  threeR.shadowMap.type = THREE.PCFSoftShadowMap;
  threeR.shadowMap.autoUpdate = false;
  dl.castShadow = on;
  if(on){
    const box = new THREE.Box3();
    targets.forEach(m=>box.expandByObject(m));
    if(!box.isEmpty()){
      const sph = box.getBoundingSphere(new THREE.Sphere());
      const c = sph.center, r = Math.max(sph.radius, 1e-3);
      const dir = new THREE.Vector3(1,2,1).normalize(); // 元のライト方向と同一(明るさ不変)
      dl.position.copy(c).addScaledVector(dir, r*2);
      dl.target.position.copy(c);
      if(dl.target.parent !== threeS) threeS.add(dl.target);
      dl.target.updateMatrixWorld(); dl.updateMatrixWorld();
      // r103: 影カメラをライト空間でボックスの8隅にぴったり合わせる(球で囲むより解像度が上がり、
      // 奥行き範囲も狭まる)。three側が毎回やる位置合わせ(position=ライト位置・target向き・up=Y)と同じ姿勢を先に作って測る。
      const sc = dl.shadow.camera;
      sc.position.copy(dl.position); sc.up.set(0,1,0); sc.lookAt(dl.target.position); sc.updateMatrixWorld(true);
      const mn = new THREE.Vector3(Infinity,Infinity,Infinity), mx = new THREE.Vector3(-Infinity,-Infinity,-Infinity), cv3 = new THREE.Vector3();
      for(let i=0;i<8;i++){
        cv3.set(i&1?box.max.x:box.min.x, i&2?box.max.y:box.min.y, i&4?box.max.z:box.min.z).applyMatrix4(sc.matrixWorldInverse);
        mn.min(cv3); mx.max(cv3);
      }
      const padXY = Math.max(mx.x-mn.x, mx.y-mn.y) * 0.02 + 1e-6;
      const padZ  = (mx.z-mn.z) * 0.05 + 1e-3;
      sc.left = mn.x-padXY; sc.right = mx.x+padXY; sc.bottom = mn.y-padXY; sc.top = mx.y+padXY;
      sc.near = Math.max(1e-3, -mx.z - padZ); sc.far = -mn.z + padZ;
      sc.updateProjectionMatrix();
      // r102: 影マップは1024に軽量化(2048だとGPUメモリ負荷が大きく、環境によって確保に失敗する疑い)。
      // 既存の影マップがあれば破棄して作り直し、サイズ不一致(viewport>描画先)を起こさない。
      const ms = Math.min(SHADOW_MAP_SIZE, (threeR.capabilities && threeR.capabilities.maxTextureSize) || SHADOW_MAP_SIZE);
      dl.shadow.mapSize.set(ms, ms);
      if(dl.shadow.map){ try{ dl.shadow.map.dispose(); }catch(e){} dl.shadow.map = null; }
      // r103: バイアスは「影マップ1画素(テクセル)の大きさ」基準にする(縞が出たのは固定係数が小さすぎたため)。
      // normalBias=受ける面を法線方向へ数テクセル持ち上げて比較(影の浮きが出にくい)、bias=深さ方向の微小補正。
      const texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / ms;
      dl.shadow.normalBias = texel * SHADOW_NORMAL_BIAS_TEXELS;
      dl.shadow.bias = SHADOW_DEPTH_BIAS;
      dl.shadow.radius = 2;
    }
    threeR.shadowMap.needsUpdate = true;
    // r102: 影の明暗差を強める。環境光を弱め、平行光を足して「光が当たる面の明るさ」は不変に保つ
    // (当たる面=環境光+平行光の合計を固定)。影の中・光に背を向けた面だけが暗くなる。
    if(threeAmbLight){
      threeAmbLight.intensity = SHADOW_BASE_AMBIENT * SHADOW_AMBIENT_RATIO;
      dl.intensity = SHADOW_BASE_DIRECT + SHADOW_BASE_AMBIENT * (1 - SHADOW_AMBIENT_RATIO);
    }
    _shadowDiagOnce();
  }else{
    if(threeAmbLight){ threeAmbLight.intensity = SHADOW_BASE_AMBIENT; dl.intensity = SHADOW_BASE_DIRECT; }
    // 元の配置(原点基準・向き同一)へ戻す
    dl.position.set(1,2,1).normalize();
    dl.target.position.set(0,0,0);
    dl.target.updateMatrixWorld(); dl.updateMatrixWorld();
  }
}
function toggleShadowVisibility(){
  window._shadowVisible = !(window._shadowVisible === true); // デフォルトOFF前提の安全なトグル
  applyShadowState();
  updateShadowButtonLabel();
  if(window._shadowVisible && window._meshSolidMode){
    toast('ソリッド表示では影は付きません(グラデ表示に戻すと影が出ます)');
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
  showScreenshotDialog(); // r116: 背景色(黒/白/透明)を選んでからスクショ
}

// r059: 3Dプレビューのスクリーンショット保存。requestAnimationFrameの
// 継続描画ループに依存せず確実に最新フレームを取得するため、キャプチャ直前に
// 明示的に1回render()してからtoDataURL()する(preserveDrawingBuffer不要)。
// r116(41回目): 背景色を「黒/白/透明」から選べるようにした(マスター要望: 黒背景は印刷時のトナーを無駄に使う)。
//   ボタン(handleCalc3DScreenshotClick)→ 背景選択ダイアログ(#ss-overlay)→ 押した色で確定 → screenshotCalc3D(bg)。
//   黒 = 画面と同じ背景(従来のスクショと同じ見た目) / 白 = 背景だけ白(方眼は画面のまま) / 透明 = 背景と方眼を除いたPNG(PowerPoint等に貼る用)。
//   透明の作り方: レンダラーはα無し(不透明)のまま、背景を「黒」と「白」で2回描いて、2枚の差から各ピクセルの不透明度を逆算する
//   (半透明の面・アンチエイリアスの縁も正しく抜ける。レンダラーの設定は変えないので3D表示への影響なし)。
let _ssInited=false;
function _ssEl(id){return document.getElementById(id);}
function _ssClose(){const o=_ssEl('ss-overlay');if(o)o.style.display='none';}
function showScreenshotDialog(){
  if(!threeR || !threeS || !threeC){ toast('⚠️ 3Dプレビューが準備できていません'); return; }
  if(!_ssInited){
    _ssInited=true;
    _ssEl('ss-overlay').addEventListener('click',e=>{ if(e.target===_ssEl('ss-overlay')) _ssClose(); }); // 枠の外を押したら中止
    document.querySelectorAll('#ss-dlg [data-bg]').forEach(btn=>{
      btn.addEventListener('click',()=>{ const bg=btn.getAttribute('data-bg'); _ssClose(); screenshotCalc3D(bg); }); // 押したら確定
    });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && _ssEl('ss-overlay').style.display==='flex'){ e.stopPropagation(); e.preventDefault(); _ssClose(); }
    },true);
  }
  _ssEl('ss-overlay').style.display='flex';
}
function _ssGrab(clearHex){ // 指定の背景色で1回描画し、結果を2Dキャンバスに複写して返す(preserveDrawingBuffer不要: 描画と同じ処理内で複写する)
  threeR.setClearColor(clearHex,1);
  threeR.render(threeS,threeC);
  const src=threeR.domElement;
  const cv=document.createElement('canvas'); cv.width=src.width; cv.height=src.height;
  cv.getContext('2d').drawImage(src,0,0);
  return cv;
}
function screenshotCalc3D(bg){
  if(!threeR || !threeS || !threeC){ toast('⚠️ 3Dプレビューが準備できていません'); return; }
  const grids=threeS.children.filter(o=>o.type==='GridHelper'); // 画面の方眼(透明PNGでは宙に浮いてしまうので消す)
  const gridVis=grids.map(g=>g.visible);
  try {
    let outCv;
    if(bg==='transparent'){
      grids.forEach(g=>{g.visible=false;});
      const cb=_ssGrab(0x000000), cw=_ssGrab(0xffffff);
      const w=cb.width, h=cb.height;
      const ib=cb.getContext('2d').getImageData(0,0,w,h);
      const iw=cw.getContext('2d').getImageData(0,0,w,h);
      const B=ib.data, W=iw.data;
      for(let i=0;i<B.length;i+=4){
        const diff=((W[i]-B[i])+(W[i+1]-B[i+1])+(W[i+2]-B[i+2]))/3; // 0=完全に不透明 … 255=完全に透明
        let a=1-diff/255; if(a<0)a=0; if(a>1)a=1;
        if(a<0.004){ B[i]=0;B[i+1]=0;B[i+2]=0;B[i+3]=0; }
        else{
          B[i]=Math.min(255,Math.round(B[i]/a)); B[i+1]=Math.min(255,Math.round(B[i+1]/a)); B[i+2]=Math.min(255,Math.round(B[i+2]/a));
          B[i+3]=Math.round(a*255);
        }
      }
      cb.getContext('2d').putImageData(ib,0,0);
      outCv=cb;
    } else {
      outCv=_ssGrab(bg==='white' ? 0xffffff : 0x06080c); // 黒=画面の背景色(従来のスクショと同じ)
    }
    const dataUrl=outCv.toDataURL('image/png');
    const fname=`Voldia_3D_${getVoldiaTimestamp()}.png`; // r115: 日付表記を yymmdd_hhmm に統一
    const a=document.createElement('a');
    a.href=dataUrl; a.download=fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('📷 スクリーンショットを保存しました（背景: '+(bg==='white'?'白':bg==='transparent'?'透明':'黒')+'）');
  } catch(e) {
    console.error('[SCREENSHOT] 保存失敗', e);
    toast('⚠️ スクリーンショットの保存に失敗しました');
  } finally {
    grids.forEach((g,i)=>{g.visible=gridVis[i];});
    threeR.setClearColor(0x06080c,1); // 画面の背景色に戻す
    threeR.render(threeS,threeC);
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

// 【r111 削除】classifyPathsSafe(rawPaths,SF) — r036で「buildSimpleExtrudeGeom(通常計算)専用」として追加された、ClipperLib PolyTree版のouter/holes分類。
//   全ファイル横断で呼び出し元ゼロ(コメントの意図と違い、実際には誰も呼んでいなかった)ので削除。
//   現役は従来の classifyPaths()(複数箇所から使用中)。必要になったら r110 のファイルから復元できる。
// r138(50回目): 3Dイメージで、ホイール(中ボタン)を押して何もせず離すと十字ポインタ(ブラウザの自動スクロール)が残る件を修正(中ボタンのmousedown/auxclickで既定動作を止める)。前版=backup/voldia3d_r137.js
// ===== 改版履歴(新しい順・1行=1改版)。以前は下の VOLDIA3D_VER の行末に1行で続けて書いていた。48回目に1改版1行へ分割して整理(本文は元のまま・欠落なし) =====
// r133(48回目): _guardedDecimateMesh の取りこぼし対策(テスト担当の破壊テスト報告): ①ずれの測定を2段(N=4→余裕×1.3→ぎりぎりだけN=32)。N=4だけだと許容5mmを最大+15%超えた(5.73mm)②元は逆勾配でなかった面が縮約で逆勾配(ny>0.05)になる縮約を拒否(山留の細い壁面で逆勾配が増えていた)。前版=backup/voldia3d_r132.js
// r132(48回目): コード整理=挙動を変えない削除。①書き込みだけで誰にも読まれないwindow変数 _yamadomeBattOffsetMm・_yamadomePrismID ②後ろの同名関数に上書きされて使われなかった古い _ringSelfIntersects(ptsMm, SF) ③未使用の分割代入 ok。削除の一覧と残したものは引継ぎ書の「コード整理記録」。前版=backup/voldia3d_r131.js
// r131(48回目): 合体判定キャッシュのキーに法面角度・isDoboku・taperMm・色・穴を追加(_mergeCtxSig/_mergeShapeSig。法面を切り替えると前の法面の判定が使い回されていた=テスト担当の報告)。
// r130(48回目): 問題7=許容つきの間引き(_guardedDecimateMesh。許容5mm=3Dイメージだけ。window._planarDecimateTolMm=0で誤差0=r129に戻る。Land Logic・欠陥スキャンは誤差0のまま)。
// r129(47回目): 同一平面の三角形を形を変えずに減らす(_decimatePlanarMesh=誤差0のエッジ縮約)。
// r128(47回目): 形状破綻の対策(提案書P2・P3・M1〜M2)=①3D化の入口(getAllFrustums)と合体した輪郭に「形状のクリーニング」(許容差5mm: 一直線の点・近接頂点の除去、図形どうしの頂点合わせ、辺への寄せ。安全装置付き) ②合体した全体の3Dを合体なしと比べ、悪ければ合体を全部取りやめる(_sceneDefects)。
// r127(47回目): 「偽の床」再来(2階建て問題)の修正=合体した図形の安全チェックを強化(事前=_frustumLayerStableで層分けが不安定な合体を取りやめ・事後=3Dに途中の水平面(偽の床)や逆勾配の面があれば取りやめ=_cavityMeshDefects)。体積の一致だけでは薄い面を検出できないため。
// r126(44回目): 紫の壁ハッチからグレー接触部分を除外+掃除。
// r125(44回目): 角問題=同条件で接する/重なるオブジェクトを法面オフセット前に合体(_mergeTouchingSameDepthFrustums。3D・体積の両方)。
// r124(44回目): 山留ハッチ消えの根本修正=山留の一直線上の頂点でまたがる壁の三角形を、辺ごとに重なる区間で採用(_clipYamadomeOverlayToContact)。
// r123(43回目): マスター案B実装=3Dを作ってから同一平面の細かい面を整理(_simplifyFrustumManifold: 法面frustumを量子化格子へ丸め→ID統合→ManifoldのSimplify)。 r122b(43回目): 変化点が複数ある形の層分けを境界方式へ(_boundariesPlan)・吸収のずれ判定(_absorbDevTol)を境界方式にも追加。
// r122: 「耳」の根本修正=オフセット輪郭の『消えた辺(辺イベント)』処理(_collapseInvertedEdges)を追加し、変化点が上面/下面の近い時の多対1吸収を_loftLayerTopoにも入れた(吸収で形がずれる量を輪郭線の距離で測り、量子化の1.5倍以内の時だけ)。 r121b(43回目): 安定して作れない形状の事前判定(_frustumLayerStable)を追加。
// r121: 変化点を上面/下面へ吸収する方式を作り直し(本物の上面/下面リングへ多対1で繋ぐ・吸収距離=量子化の30倍=300mm・線形チェックは本来の深さで)。薄い層が出来ず1/71・1/160〜1/190の法面の横線が消える。
// r120(42回目): 変化点の前後を薄い層に割らず「変化点と変化点の間を1枚」に(法面の中段の波打ち対策)。
// r119(42回目): 深さ方向の層分けを「一律16等分」→「変化点だけ」に(1/193の法面の細かい帯をなくす)。
// r118(42回目): 「やばい.vold」偽の床の根本修正(深さ方向loftの頂点の対応を保つ。ファイル冒頭【r118】参照)。
// r117(41回目): ①既存躯体にエッジ線(透過を上げても輪郭が見える) ②山留ハッチを掘削が接する区間だけに(表示専用・失敗時は従来どおり全周)。
// r116(41回目): 3Dスクショに背景色(黒/白/透明)の選択ダイアログ。
// r115(41回目): ファイル名の日付を yymmdd_hhmm に統一(getVoldiaTimestamp。getJSTDateStrは削除)・3D結果画面のGLB出力/LANDXML出力ボタンの表示切替フック(updateOutputButtons)。計算ロジック無改造。
// r114(40回目): 捨てコン+砕石・余掘りの読み取りを parseInputNum() 経由に(桁区切り表示対応。値の意味・フォールバックは従来のまま)。
// r113(40回目): 3D結果画面のメッシュ/影/色ボタンをボタン色表示に変更(計算ロジック無改造)。
// r112(39回目): _lastExistingStructGeoms(書き込みのみ)を削除(挙動不変)。
// r111(39回目): 死んだ関数7個を削除(挙動不変。削除一覧は冒頭【r111 削除一覧】)。
// r110(37回目): 既存躯体も透過スライダーに連動。
// r109(37回目): 現状地盤GLを計算の度に入力欄から同期 + 微テーパーを壁の高さ別の可変設定(LANDXML_TAPER)に。
// r108(37回目): 負のtaperMm(既存躯体=天端が内へ狭まる)に対応(contourOf)。
// r107(37回目): 現状地盤GL≠0のとき既存躯体だけGL基準のままで青・山留と高さが食い違う不具合を修正(runCalc/computeDobokuSiteBottomFromRaw)。
// r106(36回目): LandXML微テーパー量を変数LANDXML_MICRO_TAPER_MMに集約。
// r105(36回目): 山留ラインと重なる紫の辺は山留面優先(紫の壁なし・段差対策)。
// r104(36回目): 山留ラインと重なる紫壁ハッチを除外(山留優先・ハッチ二重表示対策)。
// r103(36回目): 影の縞対策(光に向いた面のみ影マップへ・影カメラをボックスにフィット・テクセル基準バイアス)・ボタン2段(2+2)。
// r102(36回目): 影の明暗を強化・影マップ1024化・ボタン行の折り返し・影の診断ログ。
// r101: 3Dイメージの影ON/OFF(デフォルトOFF)。
// r100: 既存躯体の底面∞(doboku系統のみ)。
// r099(35回目): frustum個別テーパーf.taperMm対応
// ===== ここまで改版履歴 =====
const VOLDIA3D_VER = "Voldia-3D-r138(base:VoldiaM r069)"; // 改版履歴は直上のコメント
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
// 【r111 削除】_removeCollinearPts(pts,getX,getY,epsDist) — earcut投入前に共線点(ほぼ一直線上の冗長頂点)を除去していた(r055/r056)。
//   全ファイル横断で呼び出し元ゼロを確認して削除(上の経緯コメントは残す)。削除の直接の経緯(いつ呼ばれなくなったか)は未確認。
//   必要になったら r110 のファイルから復元できる。
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
// 【r111 削除】_delaunayFlip(tris, flatPts, maxIter) — earcut出力の細長い三角形を直すLawsonフリップ後処理。
//   全ファイル横断で呼び出し元ゼロを確認して削除(上の r057 コメントは経緯として残す)。
//   buildManifoldUnionGeom / buildSimpleExtrudeGeom が Manifold方式(r062〜)になった後は、earcut→フリップの経路を通らない。
//   (削除の直接の経緯=いつ呼ばれなくなったかは未確認)。必要になったら r110 のファイルから復元できる。
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
// r117(41回目): 山留ハッチ(_buildYamadomeOverlayGeomData が作る辺ごとの台形パネル)を、掘削形状が山留面に接している区間だけに絞る。
// 接している=最終メッシュ(山留のプリズムでカット済み)の三角形のうち、3頂点とも「山留の辺kの傾斜面」の上にあるもの。
//   傾斜面の位置: 辺から外向きに tan(バッチ角)×(高さ-最深部) だけ離れた面(プリズムと同じ式)。許容は max(4mm, 量子化幅×2.5)。
// その三角形の、辺に沿った範囲[s0,s1]を集めて(2cm以内の隙間はつなぐ)、その区間だけパネルを作り直す(位置・UVとも線形補間)。
// 戻り値: 新しい{positions,uv} / 接する所が1つも見つからない・形が想定と違う時はnull(=呼び出し側は従来どおり全周表示)。
function _clipYamadomeOverlayToContact(ov, ydMm, pos, idxList, realYBot, realYTop, BATTER_DEG, SC, quantStep){
  const n = ydMm.length;
  if(!ov || !ov.positions || !ov.uv || ov.positions.length !== n*18 || ov.uv.length !== n*12) return null; // 1辺=2三角形(18+12個)の前提
  const tanB = Math.tan(BATTER_DEG*Math.PI/180);
  const hTop = Math.max(0, realYTop - realYBot);
  const tol = Math.max(0.004, quantStep*2.5);
  const pts = ydMm.map(p => ({x:p.x*SC, z:p.y*SC}));
  let area2 = 0;
  for(let i=0;i<n;i++){ const a=pts[i], b=pts[(i+1)%n]; area2 += a.x*b.z - b.x*a.z; }
  const sgn = area2 > 0 ? 1 : -1; // 外向き法線の向き(反時計回りなら(dz,-dx))
  const edges = pts.map((a,i) => {
    const b = pts[(i+1)%n]; const dx=b.x-a.x, dz=b.z-a.z; const len=Math.hypot(dx,dz)||1e-9;
    const ux=dx/len, uz=dz/len;
    return {a, len, ux, uz, nx: sgn*uz, nz: -sgn*ux, iv: []};
  });
  const yLo = realYBot - tol, yHi = realYTop + tol;
  idxList.forEach(idx => {
    for(let t=0;t+2<idx.length;t+=3){
      const i0=idx[t]*3, i1=idx[t+1]*3, i2=idx[t+2]*3;
      const y0=pos[i0+1], y1=pos[i1+1], y2=pos[i2+1];
      if(y0<yLo||y1<yLo||y2<yLo||y0>yHi||y1>yHi||y2>yHi) continue;
      for(let k=0;k<n;k++){
        const e = edges[k]; let ok = true, smin = Infinity, smax = -Infinity;
        for(let q=0;q<3 && ok;q++){
          const o = q===0?i0:(q===1?i1:i2);
          const x=pos[o], y=pos[o+1], z=pos[o+2];
          const rx=x-e.a.x, rz=z-e.a.z;
          const dist = rx*e.nx + rz*e.nz;
          const expd = tanB * Math.min(hTop, Math.max(0, y - realYBot));
          const s = rx*e.ux + rz*e.uz;
          // r124: 辺の範囲(s)での足切りをやめ、辺の面(距離)の上にあるかだけを見る。山留に一直線上の頂点(折れ角0°)があると、
          //       山留でカットした壁は1枚の大きな三角形が辺kと辺k+1にまたがって作られる→頂点が辺kの範囲外に出て不合格→辺ごと全滅(ハッチ消え)。
          //       範囲はこの後の s0/s1 のクランプ(辺の長さ内)で絞るので、またがる三角形は各辺で重なる区間だけ採用される。
          if(Math.abs(dist-expd) > tol){ ok = false; break; }
          if(s<smin) smin=s; if(s>smax) smax=s;
        }
        if(ok){ const s0=Math.max(0,smin), s1=Math.min(e.len,smax); if(s1 - s0 > 0.0005) e.iv.push([s0,s1]); }
      }
    }
  });
  const outP = [], outU = [];
  const lerp = (p,q,t) => p.map((v,k) => v + (q[k]-v)*t);
  for(let i=0;i<n;i++){
    const e = edges[i]; if(!e.iv.length) continue;
    e.iv.sort((p,q) => p[0]-q[0]);
    const merged = [e.iv[0].slice()];
    for(let j=1;j<e.iv.length;j++){ const last=merged[merged.length-1]; if(e.iv[j][0] <= last[1] + 0.02){ if(e.iv[j][1]>last[1]) last[1]=e.iv[j][1]; } else merged.push(e.iv[j].slice()); }
    const o=i*18, u=i*12, P=k=>[ov.positions[o+k*3],ov.positions[o+k*3+1],ov.positions[o+k*3+2]], U=k=>[ov.uv[u+k*2],ov.uv[u+k*2+1]];
    const aBot=P(0), bBot=P(1), bTop=P(2), aTop=P(5);      // 1パネル=[aBot,bBot,bTop],[aBot,bTop,aTop]
    const uaBot=U(0), ubBot=U(1), ubTop=U(2), uaTop=U(5);
    merged.forEach(([s0,s1]) => {
      const t0=s0/e.len, t1=s1/e.len;
      const A0=lerp(aBot,bBot,t0), B0=lerp(aBot,bBot,t1), B1=lerp(aTop,bTop,t1), A1=lerp(aTop,bTop,t0);
      const uA0=lerp(uaBot,ubBot,t0), uB0=lerp(uaBot,ubBot,t1), uB1=lerp(uaTop,ubTop,t1), uA1=lerp(uaTop,ubTop,t0);
      outP.push(...A0,...B0,...B1,  ...A0,...B1,...A1);
      outU.push(...uA0,...uB0,...uB1,  ...uA0,...uB1,...uA1);
    });
  }
  if(!outP.length) return null;
  return { positions: new Float32Array(outP), uv: new Float32Array(outU) };
}
// ============================================================
// r105(36回目): 山留ラインと紫オブジェクトの辺が重なる所は「山留面優先、紫の壁は無し」にする(マスター方針)。
// 症状: 山留の壁(1°のバッチ角が付いた微傾斜)と紫の壁(微テーパー)が、同じ場所に別々の壁として2枚できる。
//   青の下に露出する紫の壁(深い所)と、山留の壁(浅い所)が切り替わる深さで、数mm〜10mmの「段差」ができ、
//   ハッチも水平に分断された(36回目の実機報告)。LandXML用GLBでも同じ場所に壁が2枚できていた。
// 対処: 紫オブジェクトの辺のうち、山留ポリゴンの辺と「平行・同じ向き・距離が許容内・範囲が重なる」ものを、
//   山留の面より外側(PUSH量)まで押し出す。山留プリズムとのintersectionで外側は切り落とされるため、
//   その辺には紫の壁が残らず、山留の壁だけが全深さで連続する。隣の辺は交点を取り直して自然に延長する。
// 影響: 山留の外側を足すだけ(その外側は山留で切られる)なので、3D表示・Land Logicの形状だけに作用する。
//   体積計算(_calcVolumeFallback等)は一切触らない(入力が別系統のため)。
// 調整値(1か所): PURPLE_YIELD_TOL_MM / PURPLE_YIELD_PUSH_MM / PURPLE_YIELD_ANGLE_DEG
// ============================================================
const PURPLE_YIELD_TOL_MM = 50;       // 山留の辺との距離がこれ以内なら「重なっている」(バッチ角の振れ+量子化+描画のずれを見込む)
const PURPLE_YIELD_PUSH_MM = 100;     // 山留の面よりさらに外側へ押し出す量(山留のバッチ壁の最大振れ(約44mm@2.5m)より大きく)
const PURPLE_YIELD_ANGLE_DEG = 2;     // 平行とみなす角度差
function _purpleYieldToYamadome(frustums, ydMm){
  if(!ydMm || ydMm.length < 3) return {frustums, changedEdges:0, changedObjs:0};
  const area2 = pts => { let a=0; for(let i=0;i<pts.length;i++){ const p=pts[i], q=pts[(i+1)%pts.length]; a += p.x*q.y - q.x*p.y; } return a; };
  const outN = (a,b,ccw) => { const dx=b.x-a.x, dy=b.y-a.y, l=Math.hypot(dx,dy)||1; return ccw ? {x:dy/l,y:-dx/l} : {x:-dy/l,y:dx/l}; };
  const ydCCW = area2(ydMm) > 0;
  const sinTol = Math.sin(PURPLE_YIELD_ANGLE_DEG*Math.PI/180);
  let changedEdges = 0, changedObjs = 0;
  const out = frustums.map(f => {
    if(f.color !== 'purple' || !f.ptsMm || f.ptsMm.length < 3) return f;
    const pts = f.ptsMm, n = pts.length, ccw = area2(pts) > 0;
    const shift = new Array(n).fill(0);
    let any = false;
    for(let i=0;i<n;i++){
      const a = pts[i], b = pts[(i+1)%n];
      const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy); if(len < 1e-6) continue;
      const ux=dx/len, uy=dy/len, nP = outN(a,b,ccw);
      for(let j=0;j<ydMm.length;j++){
        const c = ydMm[j], d = ydMm[(j+1)%ydMm.length];
        const ex=d.x-c.x, ey=d.y-c.y, el=Math.hypot(ex,ey); if(el < 1e-6) continue;
        const vx=ex/el, vy=ey/el;
        if(Math.abs(ux*vy - uy*vx) > sinTol) continue;                 // 平行でない
        const nY = outN(c,d,ydCCW);
        if(nP.x*nY.x + nP.y*nY.y <= 0) continue;                       // 向きが逆(山留の反対側の壁)
        const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
        const dist = Math.abs((mx-c.x)*nY.x + (my-c.y)*nY.y);          // 辺の中点と山留の辺(直線)の距離
        if(dist > PURPLE_YIELD_TOL_MM) continue;
        const sA=(a.x-c.x)*vx+(a.y-c.y)*vy, sB=(b.x-c.x)*vx+(b.y-c.y)*vy;
        if(Math.min(sA,sB) > el || Math.max(sA,sB) < 0) continue;      // 範囲が重ならない
        // 紫の辺の直線を、山留の辺の直線+PUSHの位置まで外側へ(すでに外側ならそのまま)
        const t = (c.x-a.x)*nP.x + (c.y-a.y)*nP.y + PURPLE_YIELD_PUSH_MM;
        if(t > shift[i]) shift[i] = t;
      }
      if(shift[i] > 0) any = true;
    }
    if(!any) return f;
    // 各辺を個別にshift[i]だけ外側へ動かし、隣り合う辺の直線の交点を新しい頂点にする
    const lines = pts.map((a,i)=>{ const b=pts[(i+1)%n]; const nP=outN(a,b,ccw);
      return {px:a.x+nP.x*shift[i], py:a.y+nP.y*shift[i], dx:b.x-a.x, dy:b.y-a.y, nx:nP.x, ny:nP.y}; });
    const np = [];
    for(let k=0;k<n;k++){
      const L0 = lines[(k-1+n)%n], L1 = lines[k];
      const cr = L0.dx*L1.dy - L0.dy*L1.dx;
      if(Math.abs(cr) < 1e-9*Math.hypot(L0.dx,L0.dy)*Math.hypot(L1.dx,L1.dy)){
        // 平行(同一直線上の連続辺): 元の頂点を、この点で接する辺の移動量の大きい方へ動かす
        const sh = Math.max(shift[(k-1+n)%n], shift[k]); np.push({x:pts[k].x + L1.nx*sh, y:pts[k].y + L1.ny*sh}); continue;
      }
      const tt = ((L1.px-L0.px)*L1.dy - (L1.py-L0.py)*L1.dx) / cr;
      np.push({x:L0.px + L0.dx*tt, y:L0.py + L0.dy*tt});
    }
    if(typeof _ringSelfIntersects === 'function' && _ringSelfIntersects(np)){
      console.warn('[PURPLE-YIELD] 押し出し後の外周が自己交差するため、この紫オブジェクトは元の形のままにします');
      return f;
    }
    changedObjs++; changedEdges += shift.filter(v=>v>0).length;
    const xs=np.map(p=>p.x), ys=np.map(p=>p.y);
    return {...f, ptsMm:np, x1:Math.min(...xs), x2:Math.max(...xs), y1:Math.min(...ys), y2:Math.max(...ys)};
  });
  return {frustums: out, changedEdges, changedObjs};
}
// ============================================================
// r104(36回目): 山留ラインと紫オブジェクトの辺が重なった所は「山留ライン優先」にする。
// 症状: 紫の壁ハッチ(purpleWallOverlay)と山留のハッチ(yamadomeOverlay)は別々に作られるため、
// 辺が重なる(数mm〜十数mm差)と同じ位置に2枚のハッチが重なり、縞が二重に見えていた
// (36回目のNode再現: 紫壁の三角形のうち山留面から7〜10mm以内のものが該当。他の辺は5m以上離れていて無関係)。
// 対処: 山留のハッチ壁(1壁=2三角形=6頂点)から壁ごとの平面と範囲を求め、紫壁ハッチの三角形のうち
// 3頂点とも「同じ山留壁の面から許容距離以内かつその壁の範囲内」のものを落とす(=紫の辺は無しとして扱う)。
// 表示用ハッチだけの処理で、掘削形状メッシュ・体積計算・GLB(Land Logic含む)には一切影響しない。
// 限界: 三角形単位の判定のため、紫の壁が山留の辺より長く部分的にしか重ならない場合、
//       重なっていない部分を含む三角形は残る(その三角形の重なり部分は二重のまま)。
// ============================================================
const PURPLE_YD_MERGE_TOL_MM = 30; // 許容距離(mm)。微テーパー帯(10〜20mm)+頂点量子化(10mm)を見込む
function _dropPurpleWallsOnYamadome(positions, uv, ydPositions, tol){
  if(!positions || !ydPositions || ydPositions.length < 18) return {positions, uv, dropped:0};
  const walls = [];
  for(let o=0; o+18<=ydPositions.length; o+=18){
    const pts = [];
    for(let k=0;k<6;k++){
      const p=[ydPositions[o+k*3], ydPositions[o+k*3+1], ydPositions[o+k*3+2]];
      if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]) < 1e-7)) pts.push(p);
    }
    if(pts.length !== 4) continue;               // 想定外の構造(壁=4隅)でなければ判定しない
    pts.sort((a,b)=>a[1]-b[1]);
    const b0=pts[0], b1=pts[1];                  // 下端の2隅
    const ex=b1[0]-b0[0], ez=b1[2]-b0[2], el=Math.hypot(ex,ez);
    if(el < 1e-9) continue;
    const e=[ex/el, ez/el];
    const u=[pts[2][0]-b0[0],pts[2][1]-b0[1],pts[2][2]-b0[2]], w=[b1[0]-b0[0],b1[1]-b0[1],b1[2]-b0[2]];
    let n=[u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
    const nl=Math.hypot(n[0],n[1],n[2]); if(nl < 1e-12) continue; n=n.map(v=>v/nl);
    let smin=Infinity, smax=-Infinity;
    pts.forEach(p=>{ const sv=(p[0]-b0[0])*e[0]+(p[2]-b0[2])*e[1]; if(sv<smin)smin=sv; if(sv>smax)smax=sv; });
    walls.push({b0, n, e, smin, smax, yBot:pts[0][1], yTop:pts[3][1]});
  }
  if(!walls.length) return {positions, uv, dropped:0};
  const onWall = (px,py,pz,W) => {
    const d = Math.abs((px-W.b0[0])*W.n[0] + (py-W.b0[1])*W.n[1] + (pz-W.b0[2])*W.n[2]);
    if(d > tol) return false;
    const sv = (px-W.b0[0])*W.e[0] + (pz-W.b0[2])*W.e[1];
    return sv >= W.smin - tol && sv <= W.smax + tol && py >= W.yBot - tol && py <= W.yTop + tol;
  };
  const keepPos = [], keepUv = []; let dropped = 0;
  for(let t=0; t+9<=positions.length; t+=9){
    const drop = walls.some(W => onWall(positions[t],positions[t+1],positions[t+2],W)
      && onWall(positions[t+3],positions[t+4],positions[t+5],W)
      && onWall(positions[t+6],positions[t+7],positions[t+8],W));
    if(drop){ dropped++; continue; }
    for(let k=0;k<9;k++) keepPos.push(positions[t+k]);
    if(uv) for(let k=0;k<6;k++) keepUv.push(uv[(t/9)*6+k]);
  }
  return {positions:new Float32Array(keepPos), uv:uv?new Float32Array(keepUv):uv, dropped};
}
// ============================================================
// r126(44回目): 紫(山留壁)の壁ハッチのうち、グレー(既存躯体)と接する/内側にある部分を切り落とす。
//   症状(Voldia_261029_1550.vold): 紫の掘削とグレーの既存躯体を並べると、紫の壁のうちグレーと接する面にも山留ハッチ(縞)が出る。
//         既存躯体は掘削時に躯体ごと出る(土の壁ではない)ので、その面に山留は不要。
//   原因: 3D表示の合体は buildManifoldUnionGeom(excavFrustumsForMesh)=グレーを除いて作るので、紫の壁ハッチの採取(Manifold ID追跡)は
//         グレーの存在を知らず、紫由来の垂直面を全部ハッチ対象にしていた。
//   対処: 呼び出し側から grayFrustums(平面形+高さ)を受け取り、紫の壁三角形から『グレーの角柱(許容tol拡張)の内側の部分』を幾何的に切り落とす。
//         壁の一部だけがグレーと重なる/グレーの方が浅い、といった場合は、重ならない部分(別の高さ・別の位置)だけが残る。
//   ・グレーは土量計算で noSlope:true, OD:0(垂直・平面形そのまま)として扱われているので、平面形=ptsMm、高さ=[tl-D, tl]でよい。
//   ・グレーを渡さない呼び出し(Land Logic・個別体積など)は何も変わらない(従来と同じ値)。
function _buildGrayPrisms(grayFrustums, SC, tol){
  const prisms = [];
  (grayFrustums || []).forEach(g => {
    try{
      if(!g || !g.ptsMm || g.ptsMm.length < 3) return;
      const pts = g.ptsMm.map(p => [p.x*SC, p.y*SC]);
      let a2 = 0; for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; a2 += pts[i][0]*pts[j][1] - pts[j][0]*pts[i][1]; }
      if(a2 < 0) pts.reverse(); // (x,z)で反時計回りに揃える
      const flat = []; pts.forEach(p => flat.push(p[0], p[1]));
      const tris = earcut(flat, null, 2);
      const yTop = (g.tl||0)*SC + tol, yBot = ((g.tl||0) - g.D)*SC - tol;
      for(let t=0;t+2<tris.length;t+=3){
        let A = pts[tris[t]], B = pts[tris[t+1]], C = pts[tris[t+2]];
        const cr = (B[0]-A[0])*(C[1]-A[1]) - (B[1]-A[1])*(C[0]-A[0]);
        if(Math.abs(cr) < 1e-12) continue;
        if(cr < 0){ const tmp = B; B = C; C = tmp; }
        const tri = [A, B, C], H = [];
        for(let k=0;k<3;k++){
          const p0 = tri[k], p1 = tri[(k+1)%3];
          const ex = p1[0]-p0[0], ez = p1[1]-p0[1], len = Math.hypot(ex, ez);
          // 反時計回りの三角形の辺kの外向き法線は (ez,-ex)/len。tol分だけ外へ広げた半空間 fn<=0 が『内側』
          H.push(p => (ez*(p[0]-p0[0]) - ex*(p[2]-p0[1]))/len - tol);
        }
        H.push(p => p[1] - yTop);   // 上端より上は外
        H.push(p => yBot - p[1]);   // 下端より下は外
        prisms.push(H);
      }
    }catch(e){ console.warn('[PURPLE-WALL] グレー躯体の角柱化に失敗(この躯体は無視):', e); }
  });
  return prisms;
}
// 凸多角形(3D点列)を fn の正側(keepPositive)/非正側で切る(Sutherland-Hodgman)
function _clipPolyByFn(poly, fn, keepPositive){
  const out = [], n = poly.length;
  for(let i=0;i<n;i++){
    const a = poly[i], b = poly[(i+1)%n], da = fn(a), db = fn(b);
    const ina = keepPositive ? da > 0 : da <= 0, inb = keepPositive ? db > 0 : db <= 0;
    if(ina) out.push(a);
    if(ina !== inb){ const t = da/(da-db); out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]); }
  }
  return out;
}
// 多角形の集合から、凸な角柱(半空間H全部の内側)を引いた残り(=角柱の外側にある部分)を返す
function _subtractPrism(polys, H){
  const out = [];
  polys.forEach(poly => {
    let rest = poly;
    for(const fn of H){
      const outside = _clipPolyByFn(rest, fn, true);
      if(outside.length >= 3) out.push(outside);
      rest = _clipPolyByFn(rest, fn, false);
      if(rest.length < 3) break;
    }
  });
  return out;
}
// 壁の三角形[[x,y,z]x3]からグレーの角柱の内側を切り落とし、残りを三角形の配列で返す(全部消えたら[])
function _clipTriOutsideGrayPrisms(tri, prisms){
  let polys = [tri];
  for(const H of prisms){ polys = _subtractPrism(polys, H); if(!polys.length) return []; }
  const out = [];
  polys.forEach(pg => { for(let i=1;i+1<pg.length;i++) out.push([pg[0], pg[i], pg[i+1]]); });
  return out;
}

// ============================================================
// r129(47回目): 同一平面の三角形を、形を変えずに減らす「平面メッシュの間引き」(マスター指摘の問題7)
//   背景: 3Dイメージ上で同一平面に見える法面が、必要以上に細かい三角形に分かれていた(層ごとの分割・隣の図形の頂点・合体の継ぎ目に残った頂点が原因)。
//         本来、四角い法面は2枚の三角形で足りる。三角形が多いと、PDF・Excel・GLB・LandXMLの面が増え、検算もしにくい。
//   方式: 誤差0のエッジ縮約。頂点vを、次の場合だけ隣の頂点uへ寄せる(vを消す)。形・体積・面の向きは変わらない。
//     (a) vの周りが全部同じ平面(内部の頂点) → どの隣へ寄せてもよい
//     (b) vが、2つの平面(または開いた縁)の境目の「一直線の途中」にある(共線) → 境目に沿った隣(2つの端)のどちらかへ寄せる
//     3つ以上の面が集まる角・折れ曲がる所・曲がる境目は寄せない。
//   安全条件: 寄せた後の三角形が裏返らない(法線の内積≈1)・つぶれない・非多様体(辺が3枚以上)を作らない(リンク条件)。1つでも破れる時はその頂点は寄せない。
//   (r130: 3Dイメージだけは、さらに許容つきの間引き=_guardedDecimateMesh を使う。この関数=誤差0は、許容0の呼び出しと、許容つきが失敗した時の代わりに使う)
//   使う側: buildManifoldUnionGeom の結果(cyan/redの面リスト)。positionsは書き換えない(使われなくなった頂点が残るだけ。他の配列から番号で参照されても壊れない)。window._planarDecimate=false で無効。
// ============================================================
function _decimatePlanarMesh(positions, lists, opt){
  const EPS = (opt && opt.eps) || 1e-4, NRM = 1 - 1e-6, K = 4294967296;
  const P = positions, tri = [], lst = [];
  lists.forEach((I, li) => { if(!I) return; for(let t=0;t+2<I.length;t+=3){ tri.push([I[t], I[t+1], I[t+2]]); lst.push(li); } });
  const T = tri.length; if(T < 4) return {before:T, after:T, collapsed:0};
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], len=a=>Math.sqrt(dot(a,a));
  const pos = v => [P[v*3], P[v*3+1], P[v*3+2]];
  const nrm = (a,b,c) => { const A=pos(a),B=pos(b),C=pos(c); const n=cross(sub(B,A),sub(C,A)); const L=len(n); return L>0 ? [n[0]/L,n[1]/L,n[2]/L,L/2] : [0,0,0,0]; };
  // 領域: 辺を共有し、同じリスト・同じ平面(法線がほぼ同じ・頂点が平面上)の三角形をつなぐ
  const alive = new Uint8Array(T).fill(1), tn = tri.map(t => nrm(t[0],t[1],t[2]));
  const edges = new Map();
  tri.forEach((t,i) => { for(let k=0;k<3;k++){ const a=t[k], b=t[(k+1)%3]; const key = a<b ? a*K+b : b*K+a; let l=edges.get(key); if(!l){ l=[]; edges.set(key,l); } l.push(i); } });
  const par = tri.map((_,i)=>i), find = i => { while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
  const planeDist = (t, n, p0) => Math.max(...tri[t].map(v => Math.abs(dot(sub(pos(v),p0), n))));
  edges.forEach(l => { if(l.length !== 2) return; const [x,y]=l; if(lst[x]!==lst[y] || tn[x][3]===0 || tn[y][3]===0) return;
    if(dot(tn[x],tn[y]) >= NRM && planeDist(y, tn[x], pos(tri[x][0])) < EPS) par[find(x)] = find(y); });
  const reg = tri.map((_,i)=>find(i));
  const vinc = new Map(); tri.forEach((t,i) => t.forEach(v => { if(!vinc.has(v)) vinc.set(v,new Set()); vinc.get(v).add(i); }));
  let collapsed = 0;
  const neighbors = v => { const nb = new Map(); for(const t of vinc.get(v)){ if(!alive[t]) continue; for(const u of tri[t]) if(u!==v){ if(!nb.has(u)) nb.set(u,[]); nb.get(u).push(t); } } return nb; };
  const tryVertex = v => {
    const inc = [...vinc.get(v)].filter(t => alive[t]); if(!inc.length) return false;
    if(new Set(inc.map(t=>reg[t])).size > 2 || inc.some(t => tn[t][3]===0)) return false;
    const nb = neighbors(v); const crease = [];
    for(const [u,ts] of nb){ if(ts.length===1) crease.push(u); else if(ts.length===2){ if(reg[ts[0]]!==reg[ts[1]]) crease.push(u); } else return false; }
    let cands;
    if(crease.length===0) cands = [...nb.keys()];
    else if(crease.length===2){ const A=pos(crease[0]), B=pos(crease[1]), V=pos(v), ab=sub(B,A), av=sub(V,A), L2=dot(ab,ab); if(L2<=0) return false;
      const t=dot(av,ab)/L2; if(t<=1e-6 || t>=1-1e-6 || len(cross(av,ab))/Math.sqrt(L2) > EPS) return false; cands = crease.slice(); }
    else return false;
    for(const u of cands){
      const S = nb.get(u), apex = new Set(S.map(t => tri[t].find(x => x!==v && x!==u)));
      const Nu = new Set(); for(const t of vinc.get(u)){ if(!alive[t]) continue; for(const x of tri[t]) if(x!==u && x!==v) Nu.add(x); }
      let common = 0; for(const x of nb.keys()) if(x!==u && Nu.has(x)) common++;
      if(common !== apex.size) continue; // リンク条件(非多様体を作らない)
      let good = true;
      for(const t of inc){ if(S.includes(t)) continue; const nt = tri[t].map(x => x===v?u:x); const n2 = nrm(nt[0],nt[1],nt[2]); if(n2[3] < 1e-12 || dot(n2, tn[t]) < NRM){ good=false; break; } }
      if(!good) continue;
      for(const t of inc){ if(S.includes(t)){ alive[t]=0; tri[t].forEach(x => vinc.get(x).delete(t)); } else { tri[t] = tri[t].map(x => x===v?u:x); vinc.get(v).delete(t); vinc.get(u).add(t); } }
      collapsed++; return true;
    }
    return false;
  };
  const verts = [...vinc.keys()];
  for(let pass=0; pass<30; pass++){ let any=false; for(const v of verts){ if(vinc.get(v).size && tryVertex(v)) any=true; } if(!any) break; }
  let after = 0; const out = lists.map(() => []);
  for(let i=0;i<T;i++) if(alive[i]){ out[lst[i]].push(tri[i][0], tri[i][1], tri[i][2]); after++; }
  return {before:T, after, collapsed, lists: out.map((a,li) => (lists[li] && lists[li].constructor !== Array) ? new lists[li].constructor(a) : a)};
}
// ============================================================
// r130(48回目): 許容つきの間引き(_guardedDecimateMesh)=問題7(ずれた平面)の対応。マスター決定: 許容5mm。
//   背景: r129の間引きは「誤差0」でしか三角形を減らせず、丸め(10mm格子)でわずかにずれた平面・境目の頂点が残っていた(R1/R2/ymd_1508など)。
//   方式: r129と同じ縮約(頂点vを隣のuへ寄せて消す。vの周りが全部ほぼ同じ平面=内部の頂点 / 2つの平面の境目のほぼ一直線の途中=共線の頂点)。
//         頂点は動かさない(消すだけ)ので、角度の浅い境目での誤差の増幅は起きない。positionsは書き換えない。
//         「ほぼ同じ平面」= 近接する三角形を、全頂点が当てはめた平面から tolM 以内・法線の差が angDeg 以内の間でまとめた領域。
//   安全条件: r129の条件(リンク条件=非多様体を作らない・裏返り/つぶれなし)に加え、
//         ①寄せる前後の局所のずれ(密な標本点で両方向)を測り、それまでの積み上げ(三角形ごとに保持)と足して tolM を超える寄せは行わない。
//         ②三角形の法線は元の法線から angDeg 以内。
//   限界: ずれの上限は標本点による測定+積み上げ(安全側)で管理しており、数学的な証明ではない。r133で標本の取りこぼし(N=4で最大+15%)を、余裕×1.3+ぎりぎりの時だけN=32の測り直しで抑えた。
//   r133: 逆勾配になる縮約の拒否も追加(元は逆勾配でなかった面が、縮約の傾きで ny>0.05 になる縮約は行わない)。
//   使う側: buildManifoldUnionGeom の opts.decimateTolMm(mm)。省略=0=従来(r129=誤差0)。0より大きい時だけ使う。Land Logic(LandXML)と欠陥スキャンは指定しない(誤差0のまま)。
//   戻り: {before,after,collapsed,lists,budget(m)}。大きすぎる時(>20000面)はnull(呼び出し側がr129へ戻す)。
// ============================================================
function _guardedDecimateMesh(positions, lists, tolM, angDeg){
  const P = positions, K = 4294967296, cosA = Math.cos(angDeg*Math.PI/180), tri = [], lst = [], t0 = Date.now(), TIME_MS = 6000;
  lists.forEach((I, li) => { if(!I) return; for(let t=0;t+2<I.length;t+=3){ tri.push([I[t], I[t+1], I[t+2]]); lst.push(li); } });
  const T = tri.length; if(T < 4) return {before:T, after:T, collapsed:0, budget:0};
  if(T > 20000) return null;
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], len=a=>Math.sqrt(dot(a,a));
  const pos = v => [P[v*3], P[v*3+1], P[v*3+2]];
  // 点-三角形の最短距離
  const ptTri = (p,a,b,c) => {
    const ab=sub(b,a), ac=sub(c,a), ap=sub(p,a); const d1=dot(ab,ap), d2=dot(ac,ap); if(d1<=0&&d2<=0) return len(ap);
    const bp=sub(p,b); const d3=dot(ab,bp), d4=dot(ac,bp); if(d3>=0&&d4<=d3) return len(bp);
    const vc=d1*d4-d3*d2; if(vc<=0&&d1>=0&&d3<=0){ const v=d1/(d1-d3); return len(sub(p,add(a,mul(ab,v)))); }
    const cp=sub(p,c); const d5=dot(ab,cp), d6=dot(ac,cp); if(d6>=0&&d5<=d6) return len(cp);
    const vb=d5*d2-d1*d6; if(vb<=0&&d2>=0&&d6<=0){ const w=d2/(d2-d6); return len(sub(p,add(a,mul(ac,w)))); }
    const va=d3*d6-d5*d4; if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){ const w=(d4-d3)/((d4-d3)+(d5-d6)); return len(sub(p,add(b,mul(sub(c,b),w)))); }
    const sm=va+vb+vc; if(Math.abs(sm)<1e-30) return Math.min(len(ap),len(bp),len(sub(p,c)));
    const den=1/sm; return len(sub(p,add(a,add(mul(ab,vb*den),mul(ac,vc*den)))));
  };
  const nrm = (a,b,c) => { const n=cross(sub(pos(b),pos(a)),sub(pos(c),pos(a))); const L=len(n); return L>0 ? [n[0]/L,n[1]/L,n[2]/L,L/2] : [0,0,0,0]; };
  const tn=[], ta=[]; tri.forEach(t => { const n=nrm(t[0],t[1],t[2]); tn.push([n[0],n[1],n[2]]); ta.push(n[3]); }); // 元の法線・面積(以後も更新しない=元の法線との差で裏返りを見る)
  // 領域: 辺でつながる同じリストの三角形を、全頂点が当てはめ平面から tolM 以内・法線差 angDeg 以内の間でまとめる(隣同士の比較の連鎖にしない)
  const fitOk = triList => {
    let S=[0,0,0], C=[0,0,0], A=0;
    for(const t of triList){ S=add(S,mul(tn[t],ta[t])); const g=mul(add(add(pos(tri[t][0]),pos(tri[t][1])),pos(tri[t][2])),1/3); C=add(C,mul(g,ta[t])); A+=ta[t]; }
    const L=len(S); if(L<1e-18||A<=0) return false; const n=mul(S,1/L); C=mul(C,1/A);
    for(const t of triList){ if(dot(tn[t],n)<cosA) return false; for(const v of tri[t]) if(Math.abs(dot(sub(pos(v),C),n))>tolM) return false; }
    return true;
  };
  const par = tri.map((_,i)=>i), find = i => { while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; }, members = tri.map((_,i)=>[i]);
  const edges = new Map(); tri.forEach((t,i) => { for(let k=0;k<3;k++){ const a=t[k], b=t[(k+1)%3], key = a<b ? a*K+b : b*K+a; let l=edges.get(key); if(!l){ l=[]; edges.set(key,l); } l.push(i); } });
  const pairs = []; edges.forEach(l => { if(l.length!==2) return; const [x,y]=l; if(lst[x]!==lst[y]||ta[x]===0||ta[y]===0) return; pairs.push([x,y,dot(tn[x],tn[y])]); });
  pairs.sort((p,q)=>q[2]-p[2]);
  for(let pass=0; pass<6; pass++){ let any=false;
    for(const [x,y] of pairs){ const rx=find(x), ry=find(y); if(rx===ry) continue; if(members[rx].length+members[ry].length>600) continue; if(Date.now()-t0>TIME_MS) break;
      const trial=members[rx].concat(members[ry]); if(fitOk(trial)){ par[ry]=rx; members[rx]=trial; members[ry]=null; any=true; } }
    if(!any||Date.now()-t0>TIME_MS) break; }
  const reg = tri.map((_,i)=>find(i));
  // 局所のずれ: 旧い扇形と新しい扇形を、密な標本点(4x4の重心座標)で両方向に測った最大距離
  const localDev = (Fold, Fnew, N) => {
    if(!Fnew.length) return Infinity; N = N || 4;
    const samp = Tl => { const s=[]; for(const q of Tl) for(let i=0;i<=N;i++) for(let j=0;j<=N-i;j++){ const a=i/N, b=j/N, c=1-a-b; s.push(add(add(mul(q[0],a),mul(q[1],b)),mul(q[2],c))); } return s; };
    const f = (S,Tl) => { let mx=0; for(const p of S){ let m=1e9; for(const q of Tl){ const d=ptTri(p,q[0],q[1],q[2]); if(d<m) m=d; if(m<1e-12) break; } if(m>mx) mx=m; } return mx; };
    return Math.max(f(samp(Fold),Fnew), f(samp(Fnew),Fold));
  };
  const alive = new Uint8Array(T).fill(1), err = new Float64Array(T), coords = t => t.map(pos);
  const vinc = new Map(); tri.forEach((t,i) => t.forEach(v => { if(!vinc.has(v)) vinc.set(v,new Set()); vinc.get(v).add(i); }));
  const neighbors = v => { const nb = new Map(); for(const t of vinc.get(v)){ if(!alive[t]) continue; for(const u of tri[t]) if(u!==v){ if(!nb.has(u)) nb.set(u,[]); nb.get(u).push(t); } } return nb; };
  let collapsed = 0, budget = 0;
  const tryVertex = v => {
    const inc = [...vinc.get(v)].filter(t => alive[t]); if(!inc.length) return false;
    if(new Set(inc.map(t=>reg[t])).size > 2 || inc.some(t => ta[t]===0)) return false;
    const nb = neighbors(v), crease = [];
    for(const [u,ts] of nb){ if(ts.length===1) crease.push(u); else if(ts.length===2){ if(reg[ts[0]]!==reg[ts[1]]) crease.push(u); } else return false; }
    let cands;
    if(crease.length===0) cands = [...nb.keys()];
    else if(crease.length===2){ const A=pos(crease[0]), B=pos(crease[1]), V=pos(v), ab=sub(B,A), av=sub(V,A), L2=dot(ab,ab); if(L2<=0) return false;
      const sc=dot(av,ab)/L2; if(sc<=1e-6||sc>=1-1e-6||len(cross(av,ab))/Math.sqrt(L2)>tolM) return false; cands = crease.slice(); }
    else return false;
    let best = null; const emax = Math.max(...inc.map(t=>err[t]));
    for(const u of cands){
      const S = nb.get(u), apex = new Set(S.map(t => tri[t].find(x => x!==v && x!==u)));
      const Nu = new Set(); for(const t of vinc.get(u)){ if(!alive[t]) continue; for(const x of tri[t]) if(x!==u && x!==v) Nu.add(x); }
      let common = 0; for(const x of nb.keys()) if(x!==u && Nu.has(x)) common++;
      if(common !== apex.size) continue; // リンク条件(非多様体を作らない)
      let good = true; const newT = [];
      for(const t of inc){ if(S.includes(t)) continue; const nt = tri[t].map(x => x===v?u:x); const n2 = nrm(nt[0],nt[1],nt[2]); if(n2[3] < 1e-12 || dot(n2, tn[t]) < cosA){ good=false; break; }
        // r133: 元は逆勾配(ny>0.05)でなかった面が、縮約の傾き(最大3°)で逆勾配になる縮約は行わない(山留の垂直に近い細い壁面で、法線が不安定なため起きていた=テスト担当の報告(3))
        if(n2[1] > 0.05 && Math.abs(n2[1]) <= 0.99 && !(tn[t][1] > 0.05 && Math.abs(tn[t][1]) <= 0.99)){ good=false; break; }
        newT.push([t,nt]); }
      if(!good) continue;
      // r133: ずれの測定を2段にする。N=4の標本は最大点を取りこぼし、真の値より小さく出る(反例CEG1: 4.88mmに見えて実際は5.50mm=+12%)。
      //   ①N=4で測る。積み上げ(emax+d4)がもう許容を超えるなら、細かく測るほど値は大きくなる(N=32の標本はN=4の標本を含む)ので確実に拒否。
      //   ②N=4で×1.3の余裕を足しても許容に収まるなら、そのまま受け入れる(積み上げには×1.3を入れる)。
      //   ③余裕を足すと許容を超えるぎりぎりの時だけ、N=32で測り直す(×1.05の余裕)。測り直しは少数なので、全部をN=32にするより速い。
      const oldC = inc.map(t=>coords(tri[t])), newC = newT.map(x=>coords(x[1]));
      let d = localDev(oldC, newC, 4); if(!(emax + d <= tolM)) continue;
      if(emax + d*1.3 <= tolM) d = d*1.3; else { d = localDev(oldC, newC, 32) * 1.05; if(!(emax + d <= tolM)) continue; }
      const en = emax + d; // 積み上げ=これまでの上限+今回のずれ(余裕込み)
      if(!best || d < best.d) best = {u,S,newT,d,en};
    }
    if(!best) return false;
    for(const t of inc) if(best.S.includes(t)){ alive[t]=0; tri[t].forEach(x => vinc.get(x).delete(t)); }
    for(const [t,nt] of best.newT){ tri[t]=nt; vinc.get(v).delete(t); vinc.get(best.u).add(t); err[t]=best.en; }
    if(best.en > budget) budget = best.en; collapsed++; return true;
  };
  const verts = [...vinc.keys()];
  for(let pass=0; pass<30; pass++){ let any=false; for(const v of verts){ if(Date.now()-t0>TIME_MS) break; if(vinc.get(v).size && tryVertex(v)) any=true; } if(!any||Date.now()-t0>TIME_MS) break; }
  let after = 0; const out = lists.map(() => []);
  for(let i=0;i<T;i++) if(alive[i]){ out[lst[i]].push(tri[i][0], tri[i][1], tri[i][2]); after++; }
  return {before:T, after, collapsed, budget, lists: out.map((a,li) => (lists[li] && lists[li].constructor !== Array) ? new lists[li].constructor(a) : a)};
}
// r129(47回目): 本体(_buildManifoldUnionGeomRaw)の結果に、平面メッシュの間引き(同一平面の余分な三角形を、形を変えずに減らす)を通す。
async function buildManifoldUnionGeom(frustums, isDoboku=true, yamadomeOffsetX, yamadomeOffsetY, opts){
  // r134(49回目): 入口の整え(_alignFrustumsMm)で_alignThetaが付いていれば、−θ回転した座標系で3D生成して結果を+θで戻す(呼び出し側は変更不要)。
  let fr = (opts && opts._noFrameRotate) ? null : _alignFrameOf(frustums);
  if(!fr) return _buildManifoldUnionGeomDecimated(frustums, isDoboku, yamadomeOffsetX, yamadomeOffsetY, opts);
  const fr2 = frustums.map(f=>_alignToFrame(f,fr));
  if(frustums._offsetX!==undefined) fr2._offsetX = frustums._offsetX;
  if(frustums._offsetY!==undefined) fr2._offsetY = frustums._offsetY;
  const opts2 = Object.assign({}, opts||{});
  if(opts2.grayFrustums) opts2.grayFrustums = opts2.grayFrustums.map(f=>_alignToFrame(f,fr));
  // 位相の候補を順に試す: 最初の位相で不具合が0ならそれで確定(通常はここで終わり=1回だけ)。不具合が出たら次の候補で作り直し、最も不具合の少ない結果を採用する。
  let best=null, bestBad=Infinity, bestFr=fr;
  for(let k=0; k<fr.phases.length; k++){
    const fk={th:fr.th, tx:fr.phases[k].tx, ty:fr.phases[k].ty};
    const frK = k===0 ? fr2 : frustums.map(f=>_alignToFrame(f,fk));
    if(frustums._offsetX!==undefined) frK._offsetX = frustums._offsetX;
    if(frustums._offsetY!==undefined) frK._offsetY = frustums._offsetY;
    const optsK = Object.assign({}, opts2);
    if(opts && opts.grayFrustums && k>0) optsK.grayFrustums = opts.grayFrustums.map(f=>_alignToFrame(f,fk));
    let rk=null; _frame=fk;
    try{ rk = await _buildManifoldUnionGeomDecimated(frK, isDoboku, yamadomeOffsetX, yamadomeOffsetY, optsK); }
    finally{ _frame=null; }
    const bad=_alignDefectCount(rk);
    if(k>0) console.log(`[ALIGN] 位相の候補${k+1}/${fr.phases.length}(${fk.tx},${fk.ty})mmで作り直し: 不具合 ${bestBad}→${bad}`);
    if(bad<bestBad){ best=rk; bestBad=bad; bestFr=fk; }
    if(bestBad===0) break;
  }
  const r = best; fr = bestFr;
  if(r) _alignRotateResultBack(r, fr);
  return r;
}
async function _buildManifoldUnionGeomDecimated(frustums, isDoboku=true, yamadomeOffsetX, yamadomeOffsetY, opts){
  const r = await _buildManifoldUnionGeomRaw(frustums, isDoboku, yamadomeOffsetX, yamadomeOffsetY, opts);
  if(r && r.positions && window._planarDecimate !== false){
    try{
      // r130(48回目): opts.decimateTolMm(mm)>0 の時だけ、許容つきの間引き(_guardedDecimateMesh。形が最大でその許容まで動く)。省略・0=従来のr129(誤差0)。
      //   許容つきを使うのは3Dイメージ(runCalcの呼び出し)だけ。Land Logic(LandXML)・欠陥スキャン・単体チェックは指定しない=誤差0のまま。
      const tolMm = (opts && typeof opts.decimateTolMm === 'number') ? opts.decimateTolMm : 0;
      let d = null, guarded = false;
      if(tolMm > 0){ try{ d = _guardedDecimateMesh(r.positions, [r.cyanIndices, r.redIndices], tolMm/1000, 3); guarded = !!d; }catch(e){ console.warn('[DECIMATE] 許容つきの間引きに失敗(誤差0の間引きに切り替えます)', e); d = null; } }
      if(!d) d = _decimatePlanarMesh(r.positions, [r.cyanIndices, r.redIndices]);
      if(d && d.collapsed > 0 && d.lists){ r.cyanIndices = d.lists[0]; r.redIndices = d.lists[1];
        console.log(guarded ? `[DECIMATE] 同一平面に近い三角形を間引き(許容${tolMm}mm): ${d.before}→${d.after}面(形が最大${(d.budget*1000).toFixed(1)}mm動いた可能性があります)` : `[DECIMATE] 同一平面の三角形を間引き: ${d.before}→${d.after}面(形は変わりません)`); }
    }catch(e){ console.warn('[DECIMATE] 間引きに失敗(そのまま使います)', e); }
  }
  return r;
}
async function _buildManifoldUnionGeomRaw(frustums, isDoboku=true, yamadomeOffsetX, yamadomeOffsetY, opts){
  if(!frustums || !frustums.length) return null;
  // r098(34回目セッション、Land Logic用): 通常はGL(y=0)の蓋を除去する(土量計算の
  // 「上から覗き込む」表示仕様)が、Land Logic側は既存躯体グループに対して
  // 「蓋は残し、床を消す」の逆仕様が必要なため、opts.removeGLCap=falseで
  // 除去そのものをスキップできるようにする。省略時(既存の全呼び出し)は
  // これまで通りtrue扱いなので、既存の表示/積算ロジックへの影響は無い。
  const _removeGLCap = !(opts && opts.removeGLCap === false);

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
  if(!(opts && opts._noMerge)) frustums = await _mergeSameDepthFrustumsValidated(frustums, _ydOffsetX, _ydOffsetY, isDoboku); // r125: 角問題(同条件で接するオブジェクトは法面オフセット前に合体)
  // r105(36回目): 山留ラインと重なる紫の辺は山留面優先(紫の壁は作らない)。山留が無ければ何もしない。
  {
    const _yr = _purpleYieldToYamadome(frustums, getYamadomeMmPolygon(_ydOffsetX, _ydOffsetY));
    if(_yr.changedObjs > 0){
      frustums = _yr.frustums;
      console.log(`[PURPLE-YIELD] 山留ラインと重なる紫の辺を${_yr.changedEdges}本、山留面より${PURPLE_YIELD_PUSH_MM}mm外側へ押し出しました(山留面優先、紫オブジェクト${_yr.changedObjs}個)`);
    }
  }
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
  let _ydMmForClip = null; // r117(41回目): 山留ハッチを「掘削が山留面に接する区間」だけに絞る処理(戻り値の直前)で使う山留ポリゴン(mm)

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
    // r099(35回目): frustum個別のテーパー量f.taperMm(数値)があれば優先。未指定なら従来どおり
    // 共有定数DOBOKU_VERTICAL_TAPER_FIXED_MM(15mm)。Land Logicが「微テーパー量=頂点量子化単位の
    // 整数倍」にして、格子丸めで10mm/20mmに割れるのを避けるために使う。既存の呼び出しは無影響。
    const taper = f.noSlope ? (typeof f.taperMm === 'number' ? f.taperMm : DOBOKU_VERTICAL_TAPER_FIXED_MM) : f.D * getSlopeRatio();
    // r108(37回目): taperMmが負の時(既存躯体: 天端が内へ狭まる向き)は0クランプしない。
    //   Manifold.differenceで「引かれる側」の既存躯体が天端で外へ広がると、床の上へ張り出して
    //   オーバーハング(上から見て下向きの面=TIN規則違反)になるため、向きを逆にする。
    //   正のtaperMmや従来の呼び出し(taperMm未指定・正値)は従来どおり max(0, …) で完全に不変。
    const _negTaper = f.noSlope && typeof f.taperMm === 'number' && f.taperMm < 0;
    const dist = _negTaper ? (f.OD + ratio * taper) : Math.max(0, f.OD + ratio * taper);
    const q = window._vertexQuantMm;
    const minOffsetMm = (f.noSlope && q > 0 && ratio > 0.999) ? (q / 2 + 1) : 0;
    return f.noSlope ? offsetPolygon(f.ptsMm, dist, false, 1.5, minOffsetMm, true) : offsetPolygon(f.ptsMm, dist, false, 5, 0, true);
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
        // r118(42回目): 頂点数が違う時も、頂点の対応を保って繋ぐ(失敗時のみ従来のリサンプル)。
        const _topZ = -(f.tl||0), _botZ = f.D - (f.tl||0);
        const _ms = _loftLayerTopo(z => _sanitizeOffsetRing(contourOf(f, z)).pts, _topZ, topR, _botZ, botR, SC, _buildRingLoftMesh, 0);
        if(_ms && _ms.length <= 2) return _ms;
        if(_ms){ const _bm = _boundariesPlan(z => contourOf(f, z), _topZ, _botZ, SC, _buildRingLoftMesh); if(_bm && _bm.length < _ms.length) return _bm; return _ms; }
        console.warn('[TOPO-LOFT] 頂点の対応が作れず従来のリサンプルにフォールバックします');
        const M = Math.max(topR.length, botR.length, 8);
        topR = _resampleRingByArcLength(topR, M);
        botR = _resampleRingByArcLength(botR, M);
      }
      return [_buildRingLoftMesh(topR, tlY(f), botR, botY(f))];
    }

    console.warn('[SLICE-LOFT] 輪郭にピンチ/トポロジ変化を検出、変化点だけで層を分けてロフトします(' + _SLICE_N + '点で調査)');
    const topZmm = -(f.tl||0);
    const botZmm = f.D - (f.tl||0);
    const sliceRings = [];
    for(let k=0;k<=_SLICE_N;k++){
      const zMm = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const raw = contourOf(f, zMm);
      const s = _sanitizeOffsetRing(raw);
      sliceRings.push(s.pts);
    }
    // r118(42回目): 同じ頂点数で並ぶ隣のリングは、開始頂点・向きを前のリングに合わせる(Clipperの出力順のずれ対策)。
    for(let k=1;k<sliceRings.length;k++){
      if(sliceRings[k].length === sliceRings[k-1].length) sliceRings[k] = _alignRingTo(sliceRings[k], sliceRings[k-1]);
    }
    // r119/r120(42回目): 一律16等分ではなく、変化点(頂点数が変わる/線形・平面から外れる)だけで層を分ける。
    return _buildLayersAdaptive(sliceRings, kk => topZmm + (botZmm - topZmm) * kk / _SLICE_N, SC,
      z => _sanitizeOffsetRing(contourOf(f, z)).pts, _buildRingLoftMesh);
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
      const _frMans = [];   // r123: このfrustumの層ごとのManifold(後で整理してmanifoldObjsへ)
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
        _frMans.push(man);
      });
      _simplifyFrustumManifold(Manifold, Mesh, meshDatas, _frMans, f).forEach(m => manifoldObjs.push(m));
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
          const ydMmTop = battOffsetMm > 0.01 ? offsetPolygon(ydMm, battOffsetMm) : ydMm;
          const yTopMargin = realYTop + 50, yBotMargin = realYBot - 50; // 50m余裕(垂直方向は絶対にクリップしない安全マージン)

          // r057: 断面ハッチ用オーバーレイを、実際にプリズムへ使うのと同一の
          // realYTop/realYBot/BATTER_DEGから直接構築(Manifoldの出力三角形には
          // 一切依存しない)。
          _ydOverlayData = _buildYamadomeOverlayGeomData(ydMm, realYTop, realYBot, BATTER_DEG, SC);
          _ydRealYTop = realYTop; _ydRealYBot = realYBot; _ydBatterDegForMsg = BATTER_DEG;
          _ydMmForClip = ydMm;

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
    // r126: 紫の壁ハッチから切り落とすグレー(既存躯体)の角柱。許容は頂点量子化(10mm)×2.5=25mm
    const _grayPrisms = _buildGrayPrisms(opts && opts.grayFrustums, SC, 0.025);
    let removedDegenerate = 0; // r095(item12): 量子化で潰れた縮退三角形の除外カウント
    for(let i=0;i<tv.length;i+=3){
      const i0=tv[i], i1=tv[i+1], i2=tv[i+2];
      const y0=pos[i0*3+1], y1=pos[i1*3+1], y2=pos[i2*3+1];
      if(_removeGLCap && Math.abs(y0)<EPS_Y && Math.abs(y1)<EPS_Y && Math.abs(y2)<EPS_Y){ removedCap++; continue; }
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
          // UV: 法線と鉛直(0,1,0)から水平方向の接線を作り、それに沿った距離をUに、
          // 高さYをVにする(縦縞ハッチと同じ0.4m周期)。
          let tx=-nz, tz=nx; // (0,1,0)×normalの水平成分 = (-nz,0,nx)
          const tlen=Math.hypot(tx,tz)||1;
          tx/=tlen; tz/=tlen;
          const STRIPE_W=0.4;
          // r126: グレー(既存躯体)の角柱の内側は切り落とす(グレーを渡されていなければ三角形そのまま=従来と同じ)
          const _pieces = _grayPrisms.length
            ? _clipTriOutsideGrayPrisms([[ax,ay,az],[bx,by,bz],[cx,cy,cz]], _grayPrisms)
            : [[[ax,ay,az],[bx,by,bz],[cx,cy,cz]]];
          for(const pc of _pieces){
            const p0=pc[0], p1=pc[1], p2=pc[2];
            if(_grayPrisms.length){ // 切り落とし後の破片にも、元と同じスリバー除外(面積1mm²未満/高さ2cm未満)を適用
              const ux2=p1[0]-p0[0],uy2=p1[1]-p0[1],uz2=p1[2]-p0[2], vx2=p2[0]-p0[0],vy2=p2[1]-p0[1],vz2=p2[2]-p0[2];
              const ar=Math.hypot(uy2*vz2-uz2*vy2, uz2*vx2-ux2*vz2, ux2*vy2-uy2*vx2)*0.5;
              if(ar < 1e-6 || (Math.max(p0[1],p1[1],p2[1]) - Math.min(p0[1],p1[1],p2[1])) < 0.02) continue;
            }
            purpleTriPos.push(p0[0]+nx*PURPLE_HATCH_CLEAR,p0[1]+ny*PURPLE_HATCH_CLEAR,p0[2]+nz*PURPLE_HATCH_CLEAR,
                              p1[0]+nx*PURPLE_HATCH_CLEAR,p1[1]+ny*PURPLE_HATCH_CLEAR,p1[2]+nz*PURPLE_HATCH_CLEAR,
                              p2[0]+nx*PURPLE_HATCH_CLEAR,p2[1]+ny*PURPLE_HATCH_CLEAR,p2[2]+nz*PURPLE_HATCH_CLEAR);
            purpleTriUv.push(
              (p0[0]*tx+p0[2]*tz)/STRIPE_W, p0[1]/STRIPE_W,
              (p1[0]*tx+p1[2]*tz)/STRIPE_W, p1[1]/STRIPE_W,
              (p2[0]*tx+p2[2]*tz)/STRIPE_W, p2[1]/STRIPE_W
            );
          }
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
    let positions = new Float32Array(purpleTriPos);
    let uv = new Float32Array(purpleTriUv);
    // r104(36回目): 山留ラインと重なる紫の壁ハッチは落とす(山留ライン優先。ハッチの二重表示対策)
    if(_ydOverlayData && _ydOverlayData.positions){
      const fl = _dropPurpleWallsOnYamadome(positions, uv, _ydOverlayData.positions, PURPLE_YD_MERGE_TOL_MM * SC);
      if(fl.dropped > 0){
        console.log(`[PURPLE-WALL] 山留ラインと重なる紫壁ハッチを${fl.dropped}三角形除外(山留優先、許容${PURPLE_YD_MERGE_TOL_MM}mm)`);
        positions = fl.positions; uv = fl.uv;
      }
    }
    if(positions.length > 0){
      _purpleWallOverlay = { positions, uv };
      // 配置モード送信用データ: 頂点座標は既にSC(mm→m)適用済み・frustum正規化
      // 座標系(=山留のoffsetX/offsetYと同じ基準)なので、そのまま送るだけでよい。
      _purpleWallsForPlacement = { positions, uv };
      console.log(`[PURPLE-WALL] Manifold ID追跡により ${positions.length/9} 三角形を採用`);
    }
  }


  // r117(41回目・マスター要望): 山留ハッチを、掘削形状が山留面に実際に接している区間だけに絞る(表示専用)。
  // 従来は山留ラインの全周に、最深部〜GLの全高で一律に貼っていたため、オブジェクトが接していない区間(離れた掘削の間など)にも
  // ハッチが宙に浮いて出ていた。山留でカットされた最終メッシュのうち、山留面(バッチ角つきの傾斜面)の上に乗っている三角形を探し、
  // その範囲(山留の辺に沿った区間)にだけハッチを残す。
  // 安全策: ①形状・体積・GLB・LANDXMLには一切触れない(ハッチ表示用データの差し替えだけ) ②紫壁ハッチの重なり除外は、上でクリップ前のデータで済ませてある
  //         ③接している所が1つも見つからない/例外が出た時は、従来どおり全周に貼る ④配置モードの山留は別の作りなので無影響
  let _ydOverlayShown = _ydOverlayData;
  if(_ydOverlayData && _ydMmForClip && _ydRealYBot !== null && _ydRealYTop !== null){
    try {
      const _clipped = _clipYamadomeOverlayToContact(_ydOverlayData, _ydMmForClip, positions, [cyanIdx, redIdx], _ydRealYBot, _ydRealYTop, _ydBatterDegForMsg, SC, 1 / quantFactor);
      if(_clipped){
        console.log(`[YAMADOME-CLIP] 山留ハッチを接している区間だけに絞りました: パネル ${_ydOverlayData.positions.length/9}→${_clipped.positions.length/9} 三角形`);
        _ydOverlayShown = _clipped;
      } else {
        console.log('[YAMADOME-CLIP] 山留面に接する区間を特定できなかったため、従来どおり全周に表示します');
      }
    } catch(e) {
      console.warn('[YAMADOME-CLIP] 絞り込みに失敗したため、従来どおり全周に表示します:', e);
    }
  }

  const _ret = {
    positions: new Float32Array(positions),
    cyanIndices: new Uint32Array(cyanIdx),
    redIndices:  new Uint32Array(redIdx),
    yamadomeOverlay: _ydOverlayShown, // r057: 断面ハッチ用の独立オーバーレイ(位置+UV)。無ければnull
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
    return offsetPolygon(f.ptsMm, dist, false, 5, 0, true);
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
        // r118(42回目): 頂点数が違う時も、頂点の対応を保って繋ぐ(失敗時のみ従来のリサンプル)。
        const _topZ = -(f.tl||0), _botZ = f.D - (f.tl||0);
        const _ms = _loftLayerTopo(z => _sanitizeOffsetRing(contourOf(f, z)).pts, _topZ, topR, _botZ, botR, SC, _buildRingLoftMesh, 0);
        if(_ms && _ms.length <= 2) return _ms;
        if(_ms){ const _bm = _boundariesPlan(z => contourOf(f, z), _topZ, _botZ, SC, _buildRingLoftMesh); if(_bm && _bm.length < _ms.length) return _bm; return _ms; }
        console.warn('[TOPO-LOFT] 頂点の対応が作れず従来のリサンプルにフォールバックします');
        const M = Math.max(topR.length, botR.length, 8);
        topR = _resampleRingByArcLength(topR, M);
        botR = _resampleRingByArcLength(botR, M);
      }
      return [_buildRingLoftMesh(topR, tlY(f), botR, botY(f))];
    }

    console.warn('[SLICE-LOFT] 輪郭にピンチ/トポロジ変化を検出、変化点だけで層を分けてロフトします(' + _SLICE_N + '点で調査)');
    const topZmm = -(f.tl||0);
    const botZmm = f.D - (f.tl||0);
    const sliceRings = [];
    for(let k=0;k<=_SLICE_N;k++){
      const zMm = topZmm + (botZmm - topZmm) * k / _SLICE_N;
      const raw = contourOf(f, zMm);
      const s = _sanitizeOffsetRing(raw);
      sliceRings.push(s.pts);
    }
    // r118(42回目): 同じ頂点数で並ぶ隣のリングは、開始頂点・向きを前のリングに合わせる(Clipperの出力順のずれ対策)。
    for(let k=1;k<sliceRings.length;k++){
      if(sliceRings[k].length === sliceRings[k-1].length) sliceRings[k] = _alignRingTo(sliceRings[k], sliceRings[k-1]);
    }
    // r119/r120(42回目): 一律16等分ではなく、変化点(頂点数が変わる/線形・平面から外れる)だけで層を分ける。
    return _buildLayersAdaptive(sliceRings, kk => topZmm + (botZmm - topZmm) * kk / _SLICE_N, SC,
      z => _sanitizeOffsetRing(contourOf(f, z)).pts, _buildRingLoftMesh);
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
      const _frMans = [];   // r123: このfrustumの層ごとのManifold(後で整理してmanifoldObjsへ)
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
        _frMans.push(man);
      });
      _simplifyFrustumManifold(Manifold, Mesh, meshDatas, _frMans, f).forEach(m => manifoldObjs.push(m));
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
    let removedDegenerate = 0; // r033b(34回目セッション、item3「通常計算側の同型不具合」対応):
    // 29〜30回目セッションでbuildManifoldUnionGeom(配置モード側)にだけ入れていた
    // 「regV()の量子化(mm丸め)で複数頂点が同一座標に吸着し、頂点IDが重複した
    // 面積ゼロの縮退三角形が生まれることがある」ガードを、通常計算側(この関数)にも
    // 同じパターンで追加する。this関数はfillInteriorHolesAtGLを通らないため
    // item12本来の症状(穴埋め漏れ)は出ないはずで、Excel/PDF側もvoldia_export.jsの
    // 縮退三角形フィルタ(最短辺100mm未満・面積/最長辺²<0.01のIGNORE化、31回目
    // セッションr033)がほぼ確実に無害化してくれる想定だが、「同じコードパターンに
    // 片方だけガードが無い」非対称自体をLandXML化の前提条件として解消しておく
    // (マスター指示、34回目セッション)。
    for(let i=0;i<tv.length;i+=3){
      const i0=tv[i], i1=tv[i+1], i2=tv[i+2];
      const gi0 = regV(pos[i0*3], pos[i0*3+1], pos[i0*3+2]);
      const gi1 = regV(pos[i1*3], pos[i1*3+1], pos[i1*3+2]);
      const gi2 = regV(pos[i2*3], pos[i2*3+1], pos[i2*3+2]);
      if(gi0===gi1 || gi1===gi2 || gi2===gi0){ removedDegenerate++; continue; }
      cyanIdx.push(gi0, gi1, gi2);
    }
    console.log(`[MANIFOLD] union後三角形(通常計算)=${tv.length/3} 縮退除去=${removedDegenerate} 最終三角形=${cyanIdx.length/3}`);
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


