// ============================================================
// voldia_placement.js — 配置モード操作ロジック本体 (voldia_placement_v0075.htmlインラインscriptより分離)
// 41回目: ①左パネルに「📷 範囲スクショ」(範囲をドラッグ→PNG保存。背景変更なし) ②印刷PDF名・範囲スクショ名の日付を yymmdd_hhmm に統一(_fileStamp) ③showToastに表示時間の引数。※配置モードHTMLは voldia_placement_v0080.html
// 45回目(r132): 足場のテクスチャを、マスターの図面から作った画像(data/voldia_scaffold_tex.js。側面・小口。巾木つき)に変更。ジャッキベース部はコード描きのまま。無い時は従来のコード描き。※配置モードHTMLは voldia_placement_v0082.html。前版=backup/voldia_placement_r131_before_tex.js
// 45回目(r131): 足場は地形が傾斜していても傾けない(updateOrientationで常に鉛直)。前版=backup/voldia_placement_r130_before_upright.js
// 45回目(r130): 足場の影を約2倍の長さに(柱0.6→1.2m)・地面から離れた柱(0.3m超)は影なし(着地・ドロップ・クリック回転・復元後に再判定)。前版=backup/voldia_placement_r129_before_float.js
// 45回目(r129): 足場の足元に短い影(見えない小さい柱のcastShadow)。前版=backup/voldia_placement_r128_before_shadow.js
// 45回目(r128): 右UI「仮設構造物」に「🪜 足場(テスト機能)」を追加(段・列・幅の入力ダイアログ→ビテイ式枠組足場風の四角。透かしテクスチャ・影なし。ボックス(custom_box)と同じ扱い)。※配置モードHTMLは voldia_placement_v0081.html。前版=backup/voldia_placement_before_scaffold.js
// ============================================================

console.log('%c[Voldia] ' + location.pathname.split('/').pop() + ' 読み込み完了', 'color:#0f0;font-weight:bold;');
  window.addEventListener('contextmenu', e => e.preventDefault());

  let tTimer;
  function showToast(msg, ms) { // 41回目: 表示時間を任意指定できるように(省略時は従来どおり3秒)
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(tTimer);
    tTimer = setTimeout(() => { el.style.opacity = '0'; }, ms || 3000);
  }
  // 41回目: 出力ファイル名の日付 yymmdd_hhmm(本体側 getVoldiaTimestamp と同じ書式。iframe内なので自前で持つ)
  function _fileStamp() {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  // ==========================================
  // 1. Three.js 基本セットアップ
  // ==========================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x3a4045);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 30, 40);

  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  // r053: 山留マーカーパネル(地形面から数cm浮かせただけ)がdepthTest:trueで
  // 地形に埋もれて完全に不可視になる不具合の根本原因が、near=0.1/far=1000という
  // near:far比1万倍の設定による通常デプスバッファの精度不足(カメラから
  // 数十m離れた位置では数cm単位の前後関係を判定しきれない)と判明したため、
  // 対数デプスバッファを有効化。PUSH_OUT等のオフセット量を増やす対処療法では
  // 根本解決しないため、この方式で統一する。
  renderer.setSize(window.innerWidth, window.innerHeight);
  // r076(21回目引継ぎ4回目・マスター報告「オブジェクトを置くまで矢印キーが効かない」):
  // 親ページ側(display:none復帰時)のiframe.focus()呼び出しで主要因は解消したが、
  // OS側の別ウインドウへの切替→復帰など、親ページのdisplay切替を経由しない
  // フォーカス喪失パターンも起こり得るため、保険としてこちら側にも自動フォーカス
  // 復帰策を入れておく。マウスがこの画面上にある間は、このドキュメントが
  // フォーカスを失っていたら能動的に取り戻す(hasFocus()チェックのみなので
  // 負荷はごく小さい)。
  window.focus();
  window.addEventListener('mousemove', () => { if (!document.hasFocus()) window.focus(); }, { passive: true });
  
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; 
  
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.maxPolarAngle = Math.PI / 2 - 0.01; 
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.update();

  // r012(27回目セッション根治修正): 環境光0.7+直射光1.0の合計1.7倍が、完全水平で
  // 直射光をほぼ正面から受ける面(既存躯体の天端など)では0.565(#909090相当)×1.7≈0.96
  // まで明るさが積み上がり、ほぼ白飛びしていたことが判明(レイキャスト診断でマテリアル
  // 色自体は正しく#909090のままだったため、データではなく露出オーバーと確定)。
  // 斜面が多い地形側は正面から光を受ける面が少なく目立たなかっただけで、今後どんな
  // 水平な物体を追加しても同じ問題が起きうる根本原因だったため、ライト全体の強度を
  // 白飛びしない範囲まで下げる(合計最大1.3倍、0.565×1.3≈0.73で白飛びしない)。
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(30, 50, -20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.left = -50; dirLight.shadow.camera.right = 50;
  dirLight.shadow.camera.top = 50; dirLight.shadow.camera.bottom = -50;
  // r068(20回目引継ぎ・マスター指摘「影が浮いて見える」=peter panning対策):
  // bias/normalBiasは固定値ではなく、シャドウカメラのフラスタムサイズ(mapRange)に
  // 応じて動的に再計算する(1030行目付近updateShadowBias()参照)。ここでの初期値は
  // 起動直後の描画1フレーム分の仮値で、直後にupdateShadowBias()で上書きされる。
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.02;
  // r068(20回目引継ぎ・マスター指摘「影が浮いて見える」対策): shadow.bias/normalBiasを
  // シャドウマップの「テクセル1個あたりの実距離(texelSize)」に比例させて動的計算する。
  // 固定値だとmapRange(=描画対象敷地の実サイズ、スケール1/30と1/100で数十倍違う)が
  // 変わるたびに最適値がズレる(マスター実測: 1/100で最適だった値が1/30だと縞模様の
  // shadow acneに変わる)。normalBiasは法線方向のオフセットで、特に垂直面(掘削壁面)
  // のような光源に対して浅い角度の面でのpeter panning(影が壁際から離れて浮く)対策に
  // bias(深度方向オフセット)より効果的なので、normalBiasを主役・biasは補助に留める。
  // 全オブジェクト共通のdirLight.shadow設定なので、ボックス・作業員等も含め
  // castShadow=trueの全メッシュに一括で効く。
  function updateShadowBias() {
    // r071(20回目引継ぎ・マスター実機調整結果): normalBiasを使うと(値が大きすぎたため)
    // 影が縮んで台形状に切れる不具合が出た。マスターが実際に色々な値を試した結果、
    // normalBias=0にして、bias側だけをtexelSize比例のごく小さい値(×0.003)にするのが
    // 一番きれいに出ることを確認済み。この値をそのまま採用する。
    const texelSize = (dirLight.shadow.camera.right - dirLight.shadow.camera.left) / dirLight.shadow.mapSize.width;
    dirLight.shadow.normalBias = 0;
    // r072(21回目引継ぎ・マスター指摘「1/1000など超広域だと地面がシマシマになる」対策):
    // 係数0.003の単純比例だと、texelSizeが非常に大きい(=敷地が広大でmapRangeが巨大)
    // 領域ではまだシマシマ(shadow acne)がわずかに残ることがマスター実機で判明。
    // texelSizeが大きいほど係数自体もわずかに引き上げる(が上限は設けて過補正=
    // peter panning再発は防ぐ)、緩やかな非線形補正を追加。1/40クラスの通常規模では
    // texelSizeが小さいため実質的に元の0.003とほぼ同じ値になり、挙動は変わらない。
    const biasFactor = 0.003 + Math.min(texelSize * 0.02, 0.012);
    dirLight.shadow.bias = -texelSize * biasFactor;
    // r070(20回目引継ぎ・マスター指摘「影が消えた/暗くなった」の原因究明):
    // このアプリはrenderer.shadowMap.autoUpdate=false(510行目付近)で、影は
    // needsUpdate=trueを明示的に立てた時だけ再計算される設計。bias/normalBiasを
    // 変更しても、このフラグを立てないと古いシャドウマップのまま反映されず、
    // さらにmapSizeを1024→2048に変更した際に既存のシャドウマップ用レンダー
    // ターゲットが不整合を起こしていた可能性が高い(マスター指摘「太陽が沈んだ」
    // ような暗転はこれが原因と推定)。mapSize変更に対応するため既存のshadow.map
    // を明示的に破棄して確実に再生成させ、needsUpdate=trueで再描画をトリガーする。
    if (dirLight.shadow.map) { dirLight.shadow.map.dispose(); dirLight.shadow.map = null; }
    if (typeof renderer !== 'undefined' && renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
  }
  updateShadowBias();
  scene.add(dirLight); // r071: 私の前回編集(r068)でこの行を誤って消してしまっていた。復元。

  // r071: 影の精度セレクタ(軽量1024/標準2048/高画質4096)。切替時はmapSizeを
  // 変更してからupdateShadowBias()を呼ぶ(内部でmap破棄+needsUpdateも行う)。
  document.querySelectorAll('.shadow-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size);
      dirLight.shadow.mapSize.width = size;
      dirLight.shadow.mapSize.height = size;
      document.querySelectorAll('.shadow-q-btn').forEach(b => {
        const on = b === btn;
        b.style.background = on ? '#d0d0d0' : '#2a2a2a';
        b.style.color = on ? '#000' : '#aaa';
        b.style.borderColor = on ? '#d0d0d0' : '#3a3a3a';
        b.style.fontWeight = on ? 'bold' : 'normal';
        b.classList.toggle('active', on);
      });
      updateShadowBias();
    });
  });

  const dirtColor = 0x79553d;

  let defaultGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: dirtColor }));
  defaultGround.rotation.x = -Math.PI / 2;
  defaultGround.receiveShadow = true;
  scene.add(defaultGround);

  let gridHelper = new THREE.GridHelper(100, 50, 0x555555, 0x333333);
  scene.add(gridHelper);

  const markerGeo = new THREE.RingGeometry(1.2, 1.5, 32);
  markerGeo.rotateX(-Math.PI / 2);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x4caf50, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const placementMarker = new THREE.Mesh(markerGeo, markerMat);
  placementMarker.raycast = function() {}; 
  placementMarker.visible = false;
  scene.add(placementMarker);

  let terrainMeshes = [defaultGround];
  // r019: 地形の入れ替えバグ修正用。terrainMeshesはterrain(gltf.scene)の
  // 「子」を保持しているだけで、実際にsceneへaddされているのはterrain
  // グループ自体。以前はscene.remove(m)をterrainMeshesの各要素に対して
  // 呼んでいたが、mの親はscene直下ではなくterrainなので何も削除されず、
  // 地形を読み直すたびに古い地形がシーンに残り続けていた（配置モードを
  // 開き直してもiframeがリロードされなくなったことで、この既存バグが
  // 初めて表面化した）。ルートグループ自体を追跡して削除するよう修正。
  let _terrainRoot = null;
  let terrainEdges2D = [];

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

    // r025(マスター指示・追加2): index参照が頂点位置ではなく「頂点番号」ベースだと、
    // 同一位置でも別インデックスに重複した頂点(ExtrudeGeometryの面ごとの複製等)が
    // あった場合に隣接三角形として認識できず、本来同一平面で消えるはずの分割線が
    // 残ってしまう(ミイラの包帯状に見える原因)。頂点の「量子化した座標」をキーに
    // することで、インデックスが別でも同じ位置なら同一頂点として扱い、正しく
    // 平面度判定できるようにする。
    const Q = 1e4; // 0.1mm相当の量子化
    const qkey = (x,y,z) => Math.round(x*Q)+'_'+Math.round(y*Q)+'_'+Math.round(z*Q);

    const edgeMap = new Map();
    for (let t = 0; t < triCount; t++) {
      const tri = [idx ? idx[t*3] : t*3, idx ? idx[t*3+1] : t*3+1, idx ? idx[t*3+2] : t*3+2];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e+1)%3];
        const pa = qkey(pos[a*3],pos[a*3+1],pos[a*3+2]);
        const pb = qkey(pos[b*3],pos[b*3+1],pos[b*3+2]);
        const key = pa < pb ? (pa + '|' + pb) : (pb + '|' + pa);
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

  function buildFatEdgeLines(geometry, angleThresholdDeg, color, opacity, radius) {
    const idxAttr0 = geometry.index;
    const triCount0 = idxAttr0 ? (idxAttr0.count / 3) : (geometry.attributes.position.count / 3);
    const EDGE_TRI_LIMIT = 8000;
    let edgesGeo;
    if (triCount0 > EDGE_TRI_LIMIT) {
      edgesGeo = new THREE.BufferGeometry();
      edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    } else {
      try {
        edgesGeo = computeEdgesGeometrySafe(geometry, angleThresholdDeg);
      } catch (err) {
        edgesGeo = new THREE.BufferGeometry();
        edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      }
    }
    const posAttr = edgesGeo.attributes.position;
    const segCount = posAttr.count / 2;
    if (segCount === 0) {
      const empty = new THREE.Group();
      empty.raycast = function(){};
      return empty;
    }
    const cylGeo = new THREE.CylinderGeometry(radius, radius, 1, 5, 1, false);
    cylGeo.translate(0, 0.5, 0); 
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.InstancedMesh(cylGeo, mat, segCount);
    mesh.raycast = function(){}; 
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    for (let i = 0; i < segCount; i++) {
      p0.fromBufferAttribute(posAttr, i * 2);
      p1.fromBufferAttribute(posAttr, i * 2 + 1);
      dir.subVectors(p1, p0);
      const len = dir.length();
      if (len < 1e-6) { m.compose(p0, quat.identity(), new THREE.Vector3(0, 0, 0)); mesh.setMatrixAt(i, m); continue; }
      dir.normalize();
      quat.setFromUnitVectors(up, dir);
      m.compose(p0, quat, new THREE.Vector3(1, len, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ==========================================
  // 1.5. 「使い方」パネル 開閉トグル(r062: ホバー式→クリック式に変更)
  // ==========================================
  (function () {
    const btn = document.getElementById('help-btn');
    const tooltip = document.getElementById('help-tooltip');
    const overlay = document.getElementById('help-block-overlay');
    function openHelp() {
      tooltip.classList.add('show');
      overlay.classList.add('show');
    }
    function closeHelp() {
      tooltip.classList.remove('show');
      overlay.classList.remove('show');
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // ボタン自身のクリックがoverlayへ伝播して即座に閉じるのを防ぐ
      if (tooltip.classList.contains('show')) closeHelp(); else openHelp();
    });
    overlay.addEventListener('click', closeHelp); // 画面の他の場所(overlay部分)クリックで閉じる
  })();

  // ==========================================
  // 2. GLB読み込み
  // ==========================================
  const gltfLoader = new THREE.GLTFLoader();

  document.getElementById('glb-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('loading').style.display = 'flex';
    const reader = new FileReader();
    reader.onload = function(event) {
      loadTerrainFromArrayBuffer(event.target.result);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });

  function loadTerrainFromArrayBuffer(arrayBuffer, isVoldia) {
    // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
    document.getElementById('loading').style.display = 'flex';
    gltfLoader.parse(arrayBuffer, '', function(gltf) {
        // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
        
        if (defaultGround) scene.remove(defaultGround);
        if (gridHelper) scene.remove(gridHelper);
        // r020: customGround(周辺${range}m拡張床)や内側の穴埋め床は、terrain
        // (gltf.scene)の子ではなくscene直下に個別追加されているため、
        // _terrainRootを消すだけでは残ってしまい、地形を読み直すたびに
        // 蓄積して「新旧の床が混ざる」症状の真因になっていた。ここで
        // terrainMeshesの中身も改めて確実に削除・破棄する。
        terrainMeshes.forEach(m=>{
          scene.remove(m); // terrain配下の子に対しては無害な空振り、scene直下のcustomGround等には有効
          if(m.geometry) m.geometry.dispose();
          if(m.material){
            if(Array.isArray(m.material)) m.material.forEach(mm=>mm.dispose());
            else m.material.dispose();
          }
        });
        if (_terrainRoot){
          scene.remove(_terrainRoot); // r019: 実際にsceneに追加されているルートを削除
          _terrainRoot.traverse(c=>{
            if(c.geometry) c.geometry.dispose();
            if(c.material){
              if(Array.isArray(c.material)) c.material.forEach(m=>m.dispose());
              else c.material.dispose();
            }
          });
        }
        terrainMeshes = [];
        terrainEdges2D = [];

        const terrain = gltf.scene;
        _terrainRoot = terrain;
        
        const edgeCounts = new Map();
        const edgeCoords = new Map();

        const terrainTargets = [];
        // r051(v0084対応): 通常計算→配置モードでは「GL平面(Voldia_GLPlane)」と
        // 「押し出しオブジェクト本体(Voldia_FixedObjects)」の2ノード構成でGLBが送られてくる。
        // FixedObjectsは複数の独立した立体を含み得るため、GL面境界ループ検出(customGround生成)
        // に混ぜると誤動作する。別枠(fixedObjTargets)に分離し、境界検出の対象からは外す。
        const fixedObjTargets = [];
        // 26回目セッション新規: 既存躯体(グレー)ノード。fixedObjTargetsと全く同じ
        // 理由(境界検出誤動作防止)で別枠に分離する。マスター指示により「体積とは
        // 無関係、通常の地面や躯体を表示するのと同じ段階でオブジェクトを作るだけ」。
        const existingStructTargets = [];
        terrain.traverse(child => {
          if (child.isMesh && child.geometry.index && !child.userData.isEdgeDecoration) {
            if (child.name === 'Voldia_FixedObjects') {
              fixedObjTargets.push(child);
            } else if (child.name === 'Voldia_ExistingStructure') {
              existingStructTargets.push(child);
            } else {
              terrainTargets.push(child);
            }
          }
        });
        // r011: 診断ログ(terrainTargets/existingStructTargetsのbbox比較)により、
        // 既存躯体の下端が捨てコン厚さ分深くなり地形床面とy座標が一致してz-fighting
        // (白い板)を起こしていたことが判明・修正済み(このforEachループ内の
        // position.yオフセットと、voldia_export.js側のr011修正を参照)。
        // 縮退三角形は0件で無関係と判明したため、診断ログ自体は撤去。
        // 追加(2026-08-25引継ぎ19回目 B3対応): 通常計算→配置モードでは
        // Voldia_GLPlane(地面, y=0)とVoldia_FixedObjects(オブジェクト天端がy=0の
        // ケースがある)が同一平面に来てZファイティングを起こすとの報告。
        // customGround(953行目付近)が既存踏襲しているy=-0.01の微小オフセット
        // トリックと同じ考え方で、GLPlane側だけを気づかれない程度にわずかに
        // 下げてコード上の平面衝突を避ける(ジオメトリの座標自体は変えず
        // メッシュのposition.yだけをずらすので他の計算には影響しない)。
        terrainTargets.forEach(child => {
          if(child.name === 'Voldia_GLPlane') child.position.y = -0.01;
        });
        terrainTargets.forEach(child => {
            const pos = child.geometry.attributes.position.array;
            const idx = child.geometry.index.array;
            const newIdx = [];
            const EPS = 0.01; 

            for (let i = 0; i < idx.length; i += 3) {
              const i0 = idx[i], i1 = idx[i+1], i2 = idx[i+2];
              const p0 = { x: pos[i0*3], y: pos[i0*3+1], z: pos[i0*3+2] };
              const p1 = { x: pos[i1*3], y: pos[i1*3+1], z: pos[i1*3+2] };
              const p2 = { x: pos[i2*3], y: pos[i2*3+1], z: pos[i2*3+2] };
              
              // r073マスター指摘対応(配置モードのドーナツ穴埋め根本原因): 以前はここで
              // y≈0(GL面)の三角形を無条件に間引き、下のcustomGround/innerGround側で
              // 平らな板として代替表示していた。ドーナツの穴(内側の島)の天端がGL面に
              // ちょうど乗る形状の場合、本来はVoldia本体側で修正済みの正しい(平らとは
              // 限らない)キャップ形状があるのに、それを間引いて平らな板で置き換えて
              // しまうため「本体は直ったのに配置モードだけ穴が塞がって見える」原因に
              // なっていた。GL面の三角形も間引かずそのまま残すことで、本体と同じ
              // 正しい形状をそのまま表示する(下のinnerGround生成処理も合わせて削除)。
              
              newIdx.push(i0, i2, i1); 

              const addEdge = (u, v) => {
                if (Math.abs(u.y) >= EPS || Math.abs(v.y) >= EPS) return;
                const kU = `${Math.round(u.x*1000)}_${Math.round(u.z*1000)}`;
                const kV = `${Math.round(v.x*1000)}_${Math.round(v.z*1000)}`;
                if (kU === kV) return;
                const key = kU < kV ? `${kU}|${kV}` : `${kV}|${kU}`;
                edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
                edgeCoords.set(key, [u, v]);
              };
              addEdge(p0, p1); addEdge(p1, p2); addEdge(p2, p0);
            }
            
            child.geometry.setIndex(newIdx);
            child.geometry.computeVertexNormals();

            child.receiveShadow = true;
            child.castShadow = true;
            child.material = new THREE.MeshPhongMaterial({
              // r073マスター指摘対応(仮説③): FrontSideだと法線の向き次第で見えなくなる
              // 面が出てしまう可能性があったため、地形本体と同様DoubleSideに変更
              // [FIX 19回目 2026-08-31 v2] MeshLambertMaterialにflatShadingを付けても
              // (three.js r128では非対応のためコンソールに警告が出て無視されるだけで)
              // 効果が無かった。本体側(voldia3d_voldia_r093.js)のcyanMatと同じ
              // MeshPhongMaterialに変更し、flatShadingが実際に効くようにする。
              color: dirtColor, side: THREE.DoubleSide, flatShading: true, shininess: 10
            });

            const line = buildFatEdgeLines(child.geometry, 25, 0x0a1a3a, 0.75, 0.035);
            line.userData.isEdgeDecoration = true; 
            child.add(line);

            child.userData.isRealTerrainPit = true;
            terrainMeshes.push(child);
        });

        // r051(v0084対応): 通常計算の押し出しオブジェクト(柱・擁壁等)は、GL面境界ループ検出は行わず
        // そのままの形状で固定表示する。terrainMeshesに加えることで、地形と同様にレイキャスト対象
        // (=クレーン等の設置面、_getFloorMeshes()経由)になる=「上面のみの当たり判定」を実現する。
        // placedObjects配列には加えないため、ドラッグ移動やオブジェクト衝突回避システムの対象にはならない。
        fixedObjTargets.forEach(child => {
            child.geometry.computeVertexNormals();
            child.receiveShadow = true;
            child.castShadow = true;
            child.material = new THREE.MeshPhongMaterial({ color: 0x8a8f98, side: THREE.DoubleSide, flatShading: true, shininess: 10 }); // [FIX 19回目 v2] 同上理由
            child.userData.isFixedCalcObject = true;
            // r051マスター指摘対応: 通常計算オブジェクト(柱・擁壁等)にも地形と同じ輪郭線を追加
            const fixedLine = buildFatEdgeLines(child.geometry, 25, 0x0a1a3a, 0.75, 0.035);
            fixedLine.userData.isEdgeDecoration = true;
            child.add(fixedLine);
            terrainMeshes.push(child);
        });

        // 26回目セッション新規: 既存躯体(グレー)。fixedObjTargetsと同様に
        // 地形扱い(レイキャスト対象=クレーン等の設置面)にするが、色は仕様通り
        // 常時グレー(SHAPE_COLORS_3D.grayと同じ#909090系)で固定する。
        existingStructTargets.forEach(child => {
            child.geometry.computeVertexNormals();
            child.receiveShadow = true;
            child.castShadow = true;
            child.material = new THREE.MeshPhongMaterial({
              color: 0x909090, side: THREE.DoubleSide, flatShading: true, shininess: 10,
              // r013(28回目セッション): 「白い天端の上に黒い対角線が乗って見える」不具合。
              // シャドウ品質(mapSize)を変えても線が変わらず、Yオフセット量を増やすと
              // 薄くなり最終的に消えることをマスター実機で確認済み → シャドウアクネでは
              // なく正真正銘のz-fighting(掘削シェル側の本来の面/頂点と、既存躯体の天端が
              // 空間的にほぼ一致していることが根本原因。3Dイメージ側r008と同根の設計上の
              // 問題で、掘削シェル生成が既存躯体の存在を一切考慮しないためどうしても起こる)。
              // Yオフセット(下記)を主たる対策としつつ、GPU側のポリゴンオフセットも
              // 併用して余白を持たせる(特定のカメラ距離やスケールでオフセット量が
              // ギリギリになっても粘れるようにするための二重の安全策で、値の勘だけに
              // 頼らないための措置)。
              // r014(28回目セッション): 60mmオフセットで通常視点では解消したが、
              // マスター確認で「カメラを遠ざけると薄く再発する」ことが判明。これは
              // 対数深度バッファであっても遠距離では深度分解能自体が粗くなるため、
              // 固定のワールド座標オフセットだけでは絶対的な余白が相対的に足りなく
              // なる典型パターン(r053のnear:far比コメントと同じ理屈)。距離が伸びても
              // スロープ込みで効くpolygonOffset側を主対策として強化する方が筋がいいため、
              // factor/unitsを-4→-10に引き上げ。
              polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10
            });
            child.userData.isExistingStructure = true;
            // r011(27回目セッション): 既存躯体の天端が地形(掘削シェル)の頂点と
            // Y座標で一致し、地形側のエッジ表現(buildFatEdgeLines、帯状ポリゴン)が
            // 既存躯体の面とz-fightingを起こして白い板のように浮いて見える不具合が
            // あった(3Dイメージ側のr008と同根)。表示専用でわずかに(20mm)持ち上げて
            // 面の完全一致を避ける。エッジ装飾(esLine)はchild.addで子要素にしている
            // ため、この位置移動に追従して一緒にずれるので見た目上の整合性は保たれる。
            // r013(28回目セッション): マスター実機検証の結果、+10mmで薄くなり+50mmで
            // 完全に消えることを確認。20mmでは不足だったため、確認済みの閾値に安全マージンを
            // 足した60mmに引き上げる(表示専用オフセットのため体積計算等には影響しない)。
            child.position.y += 0.06;
            const esLine = buildFatEdgeLines(child.geometry, 25, 0x0a1a3a, 0.75, 0.035);
            esLine.userData.isEdgeDecoration = true;
            child.add(esLine);
            terrainMeshes.push(child);
        });

        scene.add(terrain);

        const segments = [];
        for (const [key, count] of edgeCounts.entries()) {
          if (count === 1) segments.push(edgeCoords.get(key));
        }

        const adj = new Map();
        const ptsMap = new Map();
        for (const [u, v] of segments) {
          const kU = `${Math.round(u.x*1000)}_${Math.round(u.z*1000)}`;
          const kV = `${Math.round(v.x*1000)}_${Math.round(v.z*1000)}`;
          if(!adj.has(kU)) adj.set(kU, []);
          if(!adj.has(kV)) adj.set(kV, []);
          adj.get(kU).push(kV);
          adj.get(kV).push(kU);
          ptsMap.set(kU, u);
          ptsMap.set(kV, v);
        }

        const loops = [];
        const visited = new Set();
        for (const kStart of adj.keys()) {
          if (visited.has(kStart)) continue;
          const loop = [];
          let curr = kStart;
          let prev = null;
          while (true) {
            loop.push(ptsMap.get(curr));
            visited.add(curr);
            const nexts = adj.get(curr);
            let next = null;
            for (const n of nexts) {
              if (n !== prev && !visited.has(n)) {
                next = n; break;
              }
            }
            if (!next) break; 
            prev = curr; curr = next;
          }
          loops.push(loop);
        }
        // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照

        const box = new THREE.Box3().setFromObject(terrain);
        const minX = box.min.x, maxX = box.max.x;
        const minZ = box.min.z, maxZ = box.max.z;
        terrainMinY = box.min.y; // r062: 鋼材柱の下端(地形全体の絶対最低点)に使用

        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const range = 30; 

        const loopData = [];
        for (const loop of loops) {
          if (loop.length < 3) continue;
          let area = 0;
          for (let i = 0; i < loop.length; i++) {
            const p1 = loop[i];
            const p2 = loop[(i + 1) % loop.length];
            area += p1.x * p2.z - p2.x * p1.z;
          }
          area /= 2;
          if (area > 0) loop.reverse();
          loopData.push({ loop: loop, area: Math.abs(area) });
        }
        loopData.sort((a, b) => b.area - a.area);

        const mat = new THREE.MeshPhongMaterial({ color: dirtColor, side: THREE.DoubleSide, flatShading: true, shininess: 10 }); // [FIX 19回目 v2] 同上理由

        // r067(20回目引継ぎ⑤・マスター指摘対応): customGroundの穴あけは従来
        // 「最大面積の1ループ(outerLoop)だけ」を穴にしており、innerLoopsは
        // ミニマップ用の輪郭線(terrainEdges2D)にしか使われていなかった。
        // このため四角形1・2・3のように複数の独立した掘削形状がある場合、
        // 最大面積以外の形状(今回は四角形2)には穴が開かず蓋がされてしまっていた。
        // 各ループの代表点についてPoint-in-Polygon判定を行い、他の何個のループに
        // 包含されているか(depth)を数える。depthが偶数(0,2,4...)=独立した外周
        // または「島の中の穴」は穴として扱い、depthが奇数(1,3...)=他の外周の
        // 内側にある「島」は穴として扱わない(地形メッシュ自身のキャップが
        // そのまま見えるべき箇所のため)。
        function pointInPolygon(pt, poly) {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
            if (((zi > pt.z) !== (zj > pt.z)) && (pt.x < (xj - xi) * (pt.z - zi) / (zj - zi) + xi)) inside = !inside;
          }
          return inside;
        }
        loopData.forEach(d => {
          const testPt = d.loop[0];
          let depth = 0;
          loopData.forEach(other => {
            if (other === d) return;
            if (pointInPolygon(testPt, other.loop)) depth++;
          });
          d.depth = depth;
        });
        const outerLoops = loopData.filter(d => d.depth % 2 === 0).map(d => d.loop);
        const islandLoops = loopData.filter(d => d.depth % 2 === 1).map(d => d.loop);

        if (loopData.length > 0) {
          const shape = new THREE.Shape();
          shape.moveTo(minX - range, minZ - range);
          shape.lineTo(minX - range, maxZ + range);
          shape.lineTo(maxX + range, maxZ + range);
          shape.lineTo(maxX + range, minZ - range);
          shape.lineTo(minX - range, minZ - range);

          outerLoops.forEach(loop => {
            const hole = new THREE.Path();
            hole.moveTo(loop[0].x, loop[0].z);
            for (let i = 1; i < loop.length; i++) {
              hole.lineTo(loop[i].x, loop[i].z);
            }
            hole.lineTo(loop[0].x, loop[0].z);
            shape.holes.push(hole);

            for (let i = 0; i < loop.length; i++) {
              const p1 = loop[i];
              const p2 = loop[(i + 1) % loop.length];
              terrainEdges2D.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z });
            }
          });

          const geo = new THREE.ShapeGeometry(shape);
          geo.rotateX(Math.PI / 2);

          const shapeIdx = geo.getIndex();
          if (shapeIdx) {
            const idxArray = shapeIdx.array;
            for (let i = 0; i < idxArray.length; i += 3) {
              const tmp = idxArray[i];
              idxArray[i] = idxArray[i + 2];
              idxArray[i + 2] = tmp;
            }
          }
          geo.computeVertexNormals();

          const customGround = new THREE.Mesh(geo, mat);
          customGround.userData.isCustomGroundCollar = true;
          customGround.receiveShadow = true;
          customGround.position.y = -0.01;

          const gLine = buildFatEdgeLines(geo, 25, 0x0a1a3a, 0.5, 0.03);
          customGround.add(gLine);

          scene.add(customGround);
          terrainMeshes.push(customGround);

          // r073マスター指摘対応: 以前はここで内側のループ(ドーナツの穴など)ごとに
          // 平らな板(innerGround)を生成してGL面に敷いていたが、これが「本体では直った
          // ドーナツ穴埋めが配置モードだけ塞がって見える」原因だった(上の三角形間引き
          // 廃止と対で、地形自身の正しい形状に任せるよう変更)。ミニマップ用の輪郭線
          // (terrainEdges2D)だけは表示価値があるので引き続き登録する。
          for (const inner of islandLoops) {
            for (let i = 0; i < inner.length; i++) {
              const p1 = inner[i];
              const p2 = inner[(i + 1) % inner.length];
              terrainEdges2D.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z });
            }
          }
        }

        const sizeX = (maxX - minX) / 2;
        const sizeZ = (maxZ - minZ) / 2;
        mapRange = Math.max(50, sizeX, sizeZ) + range + 5; 
        mapCenter = { x: cx, z: cz };
        // r051マスター指摘対応: 構台作図開始時の全体表示はcustomGround拡張分を含めず、
        // 元のオブジェクト(地形)自体の範囲だけにフィットさせたいので専用に保持しておく。
        kotaiFitRange = Math.max(sizeX, sizeZ, 5);

        dirLight.position.set(cx + mapRange * 0.5, 100, cz - mapRange * 0.5);
        dirLight.target.position.set(cx, 0, cz);
        scene.add(dirLight.target);

        dirLight.shadow.camera.left = -mapRange;
        dirLight.shadow.camera.right = mapRange;

        // r012: 診断ログ(シーン全体ダンプ・Alt+クリックのレイキャスト)により、
        // 白い板の正体は「別オブジェクトの混入」でも「z-fighting」でもなく、
        // 完全水平な面(既存躯体の天端)にライトが正面から当たって白飛びしていた
        // ことが判明・修正済み(このファイル冒頭のライト強度調整を参照)。
        // 診断ログ自体は用済みのため撤去。

        dirLight.shadow.camera.top = mapRange;
        dirLight.shadow.camera.bottom = -mapRange;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.camera.updateProjectionMatrix();
        updateShadowBias(); // r068: mapRangeが変わるたびbias/normalBiasを追従させる

        controls.target.set(cx, 0, cz);
        camera.position.set(cx, 30, cz + 60);
        controls.update();

        // r030: postMessageの到着順序は「地形GLB→測点座標」の想定だが、地形側は
        // gltfLoader.parseが非同期のため、測点座標が先に処理されて古い(または
        // まだ存在しない)地形に対してレイキャストしてしまうケースがあった。
        // ここ(地形読込完了の直後)で直近の測点座標を使って必ず再配置し直すことで、
        // 到着順序に関わらず常に最新の地形と一致させる。
        if (_lastSurveyPoints.length > 0) placeSurveyFlags(_lastSurveyPoints);
        if (_lastYamadomeLine.length > 0) placeYamadomeMarker(_lastYamadomeLine, _lastYamadomeRealYTop, _lastYamadomeRealYBot, _lastYamadomeBatterDeg);
        // [FIX 19回目 2026-08-30] 紫→青など、紫壁面が無くなった時に
        // ここで呼び出し自体をスキップすると、古いpurpleWallMarkerGroupが
        // 消えずに残ってしまうバグがあった(placePurpleWallMarkers自身は空データでも
        // まず古いグループを消してくれるので、呼ぶこと自体は常に必要)。
        placePurpleWallMarkers(_lastPurpleWalls || { positions: [], uv: [] });

        document.getElementById('loading').style.display = 'none';
        document.getElementById('load-glb-btn').style.display = 'none';

        renderer.shadowMap.needsUpdate = true; 
    });
  }

  let _voldiaTerrainReceived = false;
  const _voldiaParent = (window.parent !== window) ? window.parent : window.opener;

  // r013: 配置モードのオブジェクト状態の保存・復元。
  // 位置(x,z)はspawnObject()にそのまま渡して既存の地形レイキャスト＋落下
  // アニメーションに任せる（同じ地形なら同じ高さに自然に着地するはず）。
  // Y座標を保存値で強制上書きしないのは、fallingObjects側の物理演算が
  // 毎フレームtargetYへ動かし続けるため、直後に固定しても数フレーム後に
  // 上書きされてしまうから。回転(yaw)は物理演算の斜面追従で一時的に変わる
  // ことがあるため、着地が落ち着く頃合いを見て少し遅れて再適用する。
  function serializePlacedObjects(){
    return placedObjects.map(obj => {
      const u = obj.userData || {};
      const d = {
        type: u.type,
        x: obj.position.x, z: obj.position.z,
        rotY: obj.rotation.y,
        yaw: u.yaw || 0,
        scaleMultiplier: u.scaleMultiplier || 1,
        radiusValue: u.radiusValue || 0,
        color: u.color
      };
      if(u.type === 'text_balloon') d.text = u.text || '';
      if(u.type === 'custom_box'){
        d.boxW = u.boxW; d.boxD = u.boxD; d.boxH = u.boxH; d.boxColor = u.boxColor;
      }
      if(u.type === 'scaffold'){ d.scfSteps = u.scfSteps; d.scfSpans = u.scfSpans; d.scfWidth = u.scfWidth; } // r128: 足場
      if(u.type === 'kotai') d.kotaiPoints = u.kotaiPoints || [];
      if(u.type === 'h_pile') d.heightM = u.heightM || 0;
      return d;
    });
  }

  function _applyArrowScale(mesh, m){
    let upper = null;
    mesh.traverse(c => { if (c.userData.isUpper) upper = c; });
    if(upper){
      upper.scale.set(m, m, m);
      const ARROW_HEAD_RADIUS = 0.7; // createArrowMesh()のheadRadiusと同じ値
      upper.position.y = 1.0 + (m - 1) * ARROW_HEAD_RADIUS;
    }
  }

  function restorePlacedObjects(dataArr){
    if(!Array.isArray(dataArr) || !dataArr.length) return;
    // r065(AIS修正案): 復元時のレイキャスト対象がterrainMeshes固定だったため、
    // 構台の上に乗っていたtext_balloon等が構台をすり抜けて地面まで落下する
    // バグがあった。手動配置時と同じ_getFloorMeshes()(地形+構台(可視時))に変更する。
    // あわせて、構台(kotai)を他タイプより先に復元し、_getFloorMeshes()が
    // ちゃんと構台を含んだ状態でtext_balloon等の着地判定を行えるようにする
    // (保存順序に依存しないための安定ソート)。
    const sortedDataArr = dataArr.slice().sort((a, b) => {
      const aK = (a && a.type === 'kotai') ? 0 : 1;
      const bK = (b && b.type === 'kotai') ? 0 : 1;
      return aK - bK;
    });
    sortedDataArr.forEach(d => {
      if(!d || !d.type) return;
      let mesh;
      if(d.type === 'text_balloon'){
        mesh = createTextBalloonMesh(d.text || '');
        mesh.userData = { isRoot:true, type:'text_balloon', yaw:0, isFallen:false, radiusValue:0, isPlaced:true, text:d.text||'' };
        mesh.position.set(d.x, 50, d.z);
        scene.add(mesh);
        placedObjects.push(mesh);
        const fr = new THREE.Raycaster();
        fr.set(new THREE.Vector3(d.x, 100, d.z), new THREE.Vector3(0, -1, 0));
        const hit = fr.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);
        fallingObjects.push({ mesh, targetY: hit.length ? hit[0].point.y : 0, normal: new THREE.Vector3(0,1,0), speed:0, isBouncing:false, vx:0, vz:0 });
      } else if(d.type === 'kotai'){
        const pts = (d.kotaiPoints || []).map(p => new THREE.Vector3(p.x, 0, p.z));
        if(pts.length >= 3){ _buildKotaiMesh(pts); mesh = placedObjects[placedObjects.length - 1]; }
        else return;
      } else if(d.type === 'h_pile'){
        const heightM = d.heightM || (HPILE_TOP_Y - terrainMinY);
        mesh = createHPileMesh(heightM);
        mesh.position.set(d.x, HPILE_TOP_Y, d.z);
        mesh.userData = { isRoot: true, type: 'h_pile', yaw: 0, isFallen: true, radiusValue: 0, isPlaced: true, heightM, color: '#8d6e63' };
        addEdgeLines(mesh);
        scene.add(mesh);
        placedObjects.push(mesh);
      } else {
        const prevType = currentType, prevBoxParams = boxParams, prevBoxColor = boxColor, prevScfParams = scaffoldParams;
        if(d.type === 'custom_box'){
          boxParams = { boxW:d.boxW, boxD:d.boxD, boxH:d.boxH };
          boxColor = d.boxColor;
        }
        if(d.type === 'scaffold'){ scaffoldParams = { steps:String(d.scfSteps), spans:String(d.scfSpans), width:String(d.scfWidth) }; } // r128: 足場
        currentType = d.type;
        spawnObject(d.x, d.z);
        currentType = prevType; boxParams = prevBoxParams; boxColor = prevBoxColor; scaffoldParams = prevScfParams;
        mesh = placedObjects[placedObjects.length - 1];
      }
      mesh.rotation.y = d.rotY || 0;
      mesh.userData.yaw = d.yaw || 0;
      mesh.userData.radiusValue = d.radiusValue || 0;
      mesh.userData.isPlaced = true;
      if(d.scaleMultiplier && d.scaleMultiplier !== 1){
        mesh.userData.scaleMultiplier = d.scaleMultiplier;
        if(d.type === 'arrow') _applyArrowScale(mesh, d.scaleMultiplier);
      }
      // 落下・斜面追従アニメーションが収まった頃に回転を再適用（物理演算に
      // 上書きされるのを防ぐ、簡易的な後追い補正）
      setTimeout(()=>{ mesh.rotation.y = d.rotY || 0; if (mesh.userData.type === 'scaffold') _scfUpdateShadowPosts(mesh); renderer.shadowMap.needsUpdate = true; }, 1200); // r130: 足場は回転後に空中の柱の影を再判定
    });
    renderer.shadowMap.needsUpdate = true;
  }

  // r126(44回目): 配置モード中にファイル(.vold等)をドロップされても読み込まない。
//   配置モードは親画面の上に重なったiframeなので、ドロップ先がここ(iframe内)になり、親画面のドロップ処理には届かない。
//   何もしないと、ブラウザがiframe内でそのファイルを開こうとしてしまうので、既定動作を止めて、2Dモードに戻すよう案内する。
window.addEventListener('dragover', function(e){ e.preventDefault(); });
window.addEventListener('drop', function(e){
  e.preventDefault();
  var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(!f) return;
  showToast('⚠ 配置モード中は.voldを読み込めません。配置モードを閉じて2Dモードに戻してから、もう一度ドロップしてください。', 6000);
});
window.addEventListener('message', function(ev) {
    const d = ev.data;
    if (!d || !d.type) return;
    if (d.type === 'voldia-request-ready') {
      if (!_voldiaTerrainReceived && _voldiaParent) {
        _voldiaParent.postMessage({ type: 'voldia-placement-ready' }, '*');
      }
    } else if (d.type === 'voldia-terrain-glb' && d.buffer) {
      _voldiaTerrainReceived = true;
      loadTerrainFromArrayBuffer(d.buffer, true);
    } else if (d.type === 'voldia-request-placement-state') {
      if (_voldiaParent) {
        _voldiaParent.postMessage({ type: 'voldia-placement-state', objects: serializePlacedObjects() }, '*');
      }
    } else if (d.type === 'voldia-restore-placement-state' && Array.isArray(d.objects)) {
      restorePlacedObjects(d.objects);
    } else if (d.type === 'voldia-survey-points' && Array.isArray(d.points)) {
      // r025(マスター指示・追1): Voldia本体で設置した測点の実座標を受け取り、
      // 配置モードのテレイン上に旗を自動配置する
      // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
      _lastSurveyPoints = d.points; // r030: 地形読込完了後の再配置用に保持
      // 新6(2026-08-24 引継ぎ19回目マスター指示): 測点が1つ以上ある時だけ
      // ノースアロー(2Dコンパス)を表示する、本体側と同じ条件。
      if(typeof d.northAngleDeg === 'number' && !isNaN(d.northAngleDeg)) _northAngleDeg = d.northAngleDeg;
      placeSurveyFlags(d.points);
      updateCompassVisibility();
    } else if (d.type === 'voldia-yamadome-line' && Array.isArray(d.points)) {
      // r044: Voldia本体で描いた山留ラインの実座標を受け取り、目印として
      // 地形上に色付きの線オブジェクトを描画する(山留③の壁面本体とは別の、
      // 位置確認用の軽量マーカー)
      // 追加2(2026-08-24 引継ぎ18回目): 実寸値(realYTop/realYBot/batterDeg)も
      // 一緒に受け取る(地形読込完了時の再配置でも使うため保持しておく)
      _lastYamadomeLine = d.points;
      _lastYamadomeRealYTop = d.realYTop;
      _lastYamadomeRealYBot = d.realYBot;
      _lastYamadomeBatterDeg = d.batterDeg;
      placeYamadomeMarker(d.points, d.realYTop, d.realYBot, d.batterDeg);
    } else if (d.type === 'voldia-purple-walls' && d.positions) {
      // 6D-6配置モード反映・根本修正版(2026-08-29 引継ぎ18回目マスター指示):
      // 2Dヒューリスティックによる再計算をやめ、本体側でManifoldのID追跡により
      // 実際に採用された壁面三角形(positions/uv)をそのまま受け取って描画するだけ。
      // 座標は既に配置モードと同じ基準・スケールに変換済みなので変換不要。
      _lastPurpleWalls = { positions: d.positions, uv: d.uv };
      placePurpleWallMarkers(_lastPurpleWalls);
    } else if (d.type === 'voldia-save-done') {
      const btn = document.getElementById('voldia-save-btn');
      btn.textContent = d.ok ? '✓ 出力完了' : '⚠ 出力失敗';
      setTimeout(() => { btn.disabled = false; btn.textContent = '📤 Vold出力'; }, 1800);
    }
  });
  if (_voldiaParent) {
    _voldiaParent.postMessage({ type: 'voldia-placement-ready' }, '*');
  }

  document.getElementById('voldia-back-btn').addEventListener('click', () => {
    // 追2(2026-08-24 引継ぎ15回目): 「Voldiaに戻る」時に使用中のツールが
    // キャンセルされず、再度配置モードに戻った時にツールボタンが押しっぱなし
    // 表示のままになる不具合を修正。exitPlacementMode()は既存の一元管理関数
    // （.pal-btnのactive解除・各ツールの後片付けを含む）なので、それをここで
    // 呼んでからclose通知を送るだけでよい。iframe自体は生かしたまま保持する
    // 設計（r016）には影響しない＝配置済みオブジェクトは消えない。
    exitPlacementMode();
    if (_voldiaParent) {
      _voldiaParent.postMessage({ type: 'voldia-placement-close' }, '*');
    }
  });

  // r018: 配置モードから直接、本体側のVold保存を呼び出せるようにする
  // （毎回「Voldiaに戻る」を押してから保存、という手間が分かりにくいため）。
  // 実際のファイル生成・ダウンロードは本体側(exportCSV)が行う。配置モードの
  // オブジェクト状態自体、本体がexportCSV内でこのiframeに問い合わせて
  // 取得する仕組みが既にあるので、ここでは「保存して」と頼むだけでよい。
  const saveBtn = document.getElementById('voldia-save-btn');
  saveBtn.addEventListener('click', () => {
    if (!_voldiaParent) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '出力中...';
    _voldiaParent.postMessage({ type: 'voldia-request-save' }, '*');
  });

  // r022(追3): 印刷機能。3D表示(WebGLキャンバス)をJPEGとして直接キャプチャし、
  // 外部ライブラリを増やさずに自前でA3横PDF(1ページ・画像のみ)を組み立てて
  // ダウンロードする。「表示画面のスクショでOK」との指示なので、UIパネル等は
  // 含めず3Dビューのみを対象にした（renderer.domElementを直接キャプチャする
  // 方が、DOM全体をラスタライズするより確実で軽い）。
  function _buildSingleImagePDF(jpegDataURL, pageWpt, pageHpt){
    // dataURL → バイナリ
    const base64 = jpegDataURL.split(',')[1];
    const bin = atob(base64);
    const jpegBytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) jpegBytes[i] = bin.charCodeAt(i);

    // JPEGヘッダからピクセル幅・高さを読み取る(SOFマーカーを探す)
    let imgW=0, imgH=0;
    for(let i=2;i<jpegBytes.length-9;){
      if(jpegBytes[i]!==0xFF) { i++; continue; }
      const marker = jpegBytes[i+1];
      if(marker===0xD8||marker===0x01||(marker>=0xD0&&marker<=0xD7)){ i+=2; continue; }
      if(marker===0xD9) break; // EOI
      const segLen = (jpegBytes[i+2]<<8) | jpegBytes[i+3];
      if((marker>=0xC0&&marker<=0xC3)||(marker>=0xC5&&marker<=0xC7)||(marker>=0xC9&&marker<=0xCB)||(marker>=0xCD&&marker<=0xCF)){
        imgH = (jpegBytes[i+5]<<8) | jpegBytes[i+6];
        imgW = (jpegBytes[i+7]<<8) | jpegBytes[i+8];
        break;
      }
      i += 2 + segLen;
    }
    if(!imgW||!imgH){ imgW=pageWpt; imgH=pageHpt; } // 万一読めなければページいっぱいで代用

    // ページ内にアスペクト比を保って収める（上下左右中央寄せ）
    const margin = 20; // pt
    const availW = pageWpt - margin*2, availH = pageHpt - margin*2;
    const scale = Math.min(availW/imgW, availH/imgH);
    const drawW = imgW*scale, drawH = imgH*scale;
    const x = (pageWpt - drawW)/2, y = (pageHpt - drawH)/2;

    const enc = new TextEncoder();
    const parts = []; // {bytes: Uint8Array}[]
    let offset = 0;
    const offsets = [0]; // 1-indexed object offsets（offsets[1]がobj1の位置）
    function push(strOrBytes){
      const b = (typeof strOrBytes === 'string') ? enc.encode(strOrBytes) : strOrBytes;
      parts.push(b); offset += b.length;
    }
    function beginObj(n){ offsets[n] = offset; push(`${n} 0 obj\n`); }

    push('%PDF-1.4\n');

    beginObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    beginObj(2); push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    beginObj(3); push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
    beginObj(4);
    push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
    push(jpegBytes);
    push('\nendstream\nendobj\n');
    const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    beginObj(5); push(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    const xrefStart = offset;
    let xref = 'xref\n0 6\n0000000000 65535 f \n';
    for(let n=1;n<=5;n++){ xref += String(offsets[n]).padStart(10,'0') + ' 00000 n \n'; }
    push(xref);
    push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

    const total = new Uint8Array(offset);
    let p=0; for(const part of parts){ total.set(part, p); p += part.length; }
    return total;
  }

  // 41回目: 範囲スクショ。ボタン→画面全体が範囲選択モード(トーストで案内)→ドラッグで範囲指定→指を離すとその範囲を
  // そのままPNG保存。背景色の変更は無し(印刷と同じく3Dビュー(WebGLキャンバス)だけが対象で、パネル類は写らない)。
  // 中止: Esc / 右クリック / もう一度ボタン。選択中は下の3Dビュー・オブジェクトには一切触れない(全画面の選択面が操作を受ける)。
  (function () {
    const btn = document.getElementById('voldia-shot-btn');
    const ov = document.getElementById('shot-select-overlay');
    const box = document.getElementById('shot-select-box');
    let active = false, drag = null;
    function setActive(on) {
      active = on; drag = null;
      ov.style.display = on ? 'block' : 'none';
      box.style.display = 'none';
      btn.classList.toggle('active', on);
    }
    function rectOf(d) {
      return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
    }
    function drawBox() {
      const r = rectOf(drag);
      box.style.display = 'block';
      box.style.left = r.x + 'px'; box.style.top = r.y + 'px';
      box.style.width = r.w + 'px'; box.style.height = r.h + 'px';
    }
    function capture(r) {
      renderer.render(scene, camera); // 描画と同じ処理内で複写する(preserveDrawingBuffer未設定のため)
      const cv = renderer.domElement, cr = cv.getBoundingClientRect();
      const kx = cv.width / cr.width, ky = cv.height / cr.height; // 画面px→キャンバスpx(高DPI対応)
      let sx = Math.round((r.x - cr.left) * kx), sy = Math.round((r.y - cr.top) * ky);
      let sw = Math.round(r.w * kx), sh = Math.round(r.h * ky);
      if (sx < 0) { sw += sx; sx = 0; } if (sy < 0) { sh += sy; sy = 0; }
      sw = Math.min(sw, cv.width - sx); sh = Math.min(sh, cv.height - sy);
      if (sw < 2 || sh < 2) { showToast('⚠ 範囲が3Dビューの外です'); return; }
      const out = document.createElement('canvas'); out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
      const a = Object.assign(document.createElement('a'), { href: out.toDataURL('image/png'), download: `Voldia_Place_${_fileStamp()}.png` });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showToast('📷 範囲スクショを保存しました');
    }
    btn.addEventListener('click', () => {
      if (active) { setActive(false); showToast('範囲スクショを中止しました'); return; }
      setActive(true);
      showToast('📷 スクショしたい範囲をドラッグで選択してください（Esc/右クリックで中止）', 6000);
    });
    ov.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); ov.setPointerCapture(e.pointerId);
      drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      drawBox();
    });
    ov.addEventListener('pointermove', e => {
      if (!drag) return;
      drag.x1 = e.clientX; drag.y1 = e.clientY; drawBox();
    });
    ov.addEventListener('pointerup', e => {
      if (!drag || e.button !== 0) return;
      drag.x1 = e.clientX; drag.y1 = e.clientY;
      const r = rectOf(drag);
      setActive(false);
      if (r.w < 8 || r.h < 8) { showToast('⚠ 範囲が小さすぎます。もう一度ボタンを押して選び直してください'); return; }
      capture(r);
    });
    ov.addEventListener('contextmenu', e => { e.preventDefault(); setActive(false); showToast('範囲スクショを中止しました'); });
    document.addEventListener('keydown', e => {
      if (active && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setActive(false); showToast('範囲スクショを中止しました'); }
    }, true);
  })();

  document.getElementById('voldia-print-btn').addEventListener('click', () => {
    const btn = document.getElementById('voldia-print-btn');
    try{
      renderer.render(scene, camera); // toDataURL直前に強制再描画（preserveDrawingBuffer未設定のため）
      const jpegDataURL = renderer.domElement.toDataURL('image/jpeg', 0.92);
      // A3横 = 420mm×297mm → pt換算(1mm=72/25.4pt)
      const MM2PT = 72/25.4;
      const pageW = 420*MM2PT, pageH = 297*MM2PT;
      const pdfBytes = _buildSingleImagePDF(jpegDataURL, pageW, pageH);
      const blob = new Blob([pdfBytes], {type:'application/pdf'});
      const url = URL.createObjectURL(blob);
      const stamp = _fileStamp(); // 41回目: 他の出力ファイルと同じ yymmdd_hhmm に統一
      const a = Object.assign(document.createElement('a'), {href:url, download:`Vold3DScreen_${stamp}.pdf`});
      a.click(); URL.revokeObjectURL(url);
      btn.textContent = '✓ 印刷完了';
      setTimeout(()=>{ btn.textContent = '🖨 印刷(A3 PDF)'; }, 1800);
    }catch(e){
      console.error(e);
      btn.textContent = '⚠ 失敗';
      setTimeout(()=>{ btn.textContent = '🖨 印刷(A3 PDF)'; }, 1800);
    }
  });

  // ==========================================






  function addEdgeLines(obj) {
    const meshes = [];
    obj.traverse(child => {
      if (child.isMesh && !child.userData.isRadiusMesh && !child.userData.isBillboard && !child.userData.isEdgeDecoration && !child.userData.isDragMarker && !child.userData.isDragHitbox) {
        meshes.push(child);
      }
    });
    meshes.forEach(mesh => {
      const edges = computeEdgesGeometrySafe(mesh.geometry, 30);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x111111 }));
      line.raycast = function(){};
      mesh.add(line);
    });
  }

  // ★ 矢印（地面追従、厚み付き3Dモデル、水平旋回）の生成

  // r072(21回目引継ぎ): ミニBHはbox-primitiveの寄せ集めでは限界があった(2回連続で
  // マスターから「反映されてない/形が違う」との指摘)ため、マスター提供の実測参考
  // モデル「ローポリミニ.glb」の頂点データ(MINI_BH_GEO)から直接BufferGeometryを







  // r025(マスター指示①): 80tクローラークレーンの外形を充実化。
  // ・ブームのトラス(matTruss)テクスチャ表現は気に入っているとのことでそのまま維持
  // ・ワイヤー/フックの再現はしない
  // ・色は既存のmatDark/matCraneBody/matGlassをそのまま流用(変更なし)
  // ・AreCal 2Dイラスト・実写真を参考に、下部走行体(クローラー)にスプロケット/
  //   アイドラーの円柱を追加して機械らしさを出し、上部旋回体を「デッキ(エンジン
  //   ハウス相当)＋カウンターウェイト」の2段構成にしてボリューム感を出し、
  //   ブーム基部にペデスタル(台座)を追加してブームがせり上がって生えている
  //   構造を再現した。

  // r025(マスター指示・追1): 測点フラグ。Voldia本体の測点(実座標mm→m変換済み)を
  // 受け取り、テレイン上(GL, y=0)に自動配置する。ポールはまっすぐ垂直に立てる
  // (参考画像のイラストは斜めだが、それは絵の見栄え用の傾きなので採用しない)。
  let surveyFlags = [];
  let _lastSurveyPoints = []; // r030: 地形GLBの非同期読込完了と測点postMessageの到着順が
  // 保証されないため(親から同時送信・iframe側はgltfLoader.parseが非同期)、直近の測点座標を
  // 保持しておき、地形読込が完了するたび(loadTerrainFromArrayBuffer末尾)に必ず再配置し直す。
  // 新6(2026-08-24 引継ぎ19回目): 本体から受け取ったノースアロー方位角(度、画面上=0・時計回り正)
  let _northAngleDeg = 0;
  function updateCompassVisibility(){
    const wrap = document.getElementById('placement-compass-wrap');
    if(wrap) wrap.style.display = (_lastSurveyPoints && _lastSurveyPoints.length>0) ? '' : 'none';
  }
  let yamadomeMarker = null;
  let _lastYamadomeLine = []; // r044: 山留ラインも測点と同じ理由で直近座標を保持し、
  // 地形読込完了のたびに再配置し直す。
  // 追加2(2026-08-24 引継ぎ18回目): 本体側の実寸値も同様に保持(地形読込完了時の再配置で使う)
  let _lastYamadomeRealYTop = null, _lastYamadomeRealYBot = null, _lastYamadomeBatterDeg = 1;
  // 6D配置モード反映(2026-08-29 引継ぎ18回目マスター指示→26回目セッションで紫に移設): 紫壁面マーカー
  let purpleWallMarkerGroup = null;
  let _lastPurpleWalls = null;
  function placeSurveyFlags(points) {
    // r025(マスター指示・追1直し): y=0固定だと浮いてしまう(テレインは平坦でないため)。
    // 既存オブジェクトと同じspawn+fallingObjects物理演算に乗せて、実際の地形面まで
    // 落下させるようにする。
    surveyFlags.forEach(f => scene.remove(f));
    surveyFlags = [];
    // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
    points.forEach(p => {
      const flag = createSurveyFlag(p.no);
      flag.position.set(p.x, 50, p.z);
      scene.add(flag);
      surveyFlags.push(flag);

      fallRaycaster.set(new THREE.Vector3(p.x, 100, p.z), new THREE.Vector3(0, -1, 0));
      const intersects = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
      let targetY = 0, normal = new THREE.Vector3(0, 1, 0);
      if (intersects.length > 0) {
        targetY = intersects[0].point.y;
        normal = intersects[0].face.normal.clone();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[0].object.matrixWorld);
        normal.applyMatrix3(normalMatrix).normalize();
      }
      // r036: 調査用DEBUGログは削除。詳細は Voldia_過去ログ_2026-08-09.md 参照
      fallingObjects.push({ mesh: flag, targetY, normal, speed: 0, isBouncing: false, vx: 0, vz: 0 });
    });
    renderer.shadowMap.needsUpdate = true;
  }
  let _yamadomeHatchTex = null;
  function _getYamadomeHatchTexture(){
    // r045: 本体側(voldia3d_voldia_rXXX.js)の断面ハッチと統一感を出すため、
    // 同じ「粗目の縦格子」パターンを配置モード側にも用意する。
    if (_yamadomeHatchTex) return _yamadomeHatchTex;
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,120,40,0.95)';
    ctx.fillRect(0, 0, 22, 64);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    _yamadomeHatchTex = tex;
    return tex;
  }
  function placeYamadomeMarker(points, realYTop, realYBot, batterDeg) {
    // 追加2(2026-08-24 引継ぎ18回目マスター指示): 従来はここで地形へレイキャストして
    // 天端(GL±0固定)・根切底(推測)の高さを求めていたが、「配置済みの通常計算
    // オブジェクトと全く同じ形状の山留を描くと、レイキャストがそのオブジェクトの
    // 上面に誤ヒットしてしまい山留パネルが消える(再現性不明に見えていたのはこれが
    // 原因)」というバグの温床だった。マスター指示により、地形レイキャストによる
    // 高さ推測そのものを廃止し、本体側(buildManifoldUnionGeom)で実際に計算済みの
    // realYTop/realYBotをpostMessageでそのまま受け取って使う方式に変更。
    // 併せて「厳密に地形に合わせる必要はなく、根切形状より少し手前に出ていて
    // 気づかれなければ良い」というマスター方針の通り、位置合わせの精度要求を下げつつ
    // (＝地形との整合を気にしなくてよくなる分、実装は単純かつ堅牢になる)、
    // 式自体は本体の_buildYamadomeOverlayGeomData()と同一にして厳密一致させている。
    // ★本体側と同じロジックの意図的な複製(重複)。片方だけ式を変えると再びズレる
    // 不整合が起きるので、変更時は両方(本体r0XX.jsの_buildYamadomeOverlayGeomDataと
    // ここ)を必ずセットで直すこと。
    if (yamadomeMarker) { scene.remove(yamadomeMarker); yamadomeMarker = null; }
    if (!points || points.length < 3) return;
    if (typeof realYTop !== 'number' || typeof realYBot !== 'number') {
      // 本体が土量計算を一度も実行していない(通常計算のみ等)場合はここに来る。
      // 誤った推測値で描画するより、何も描かない方が安全。
      console.warn('[YAMADOME] realYTop/realYBot未受信のため山留パネル描画をスキップ(土量計算未実行の可能性)');
      return;
    }
    const STRIPE_W = 0.4; // 本体側と統一(0.4mごとに1縞)
    const CLEAR = 0.01; // 1cm。本体と統一(空洞側に確保するクリアランス)
    const n = points.length;
    const group = new THREE.Group();
    group.userData = { isRoot: true, type: 'yamadome_marker' };
    const hatchTex = _getYamadomeHatchTexture();
    let cenX = 0, cenZ = 0;
    points.forEach(p => { cenX += p.x; cenZ += p.z; });
    cenX /= n; cenZ /= n;
    const BATTER_DEG = (typeof batterDeg === 'number') ? batterDeg : 1; // 本体側と統一
    const h = Math.max(0.01, realYTop - realYBot);
    const battOut = Math.tan(BATTER_DEG * Math.PI / 180) * h;
    let cum = 0; // 境界線に沿った累積距離(m) — ハッチのUがずれないようパネル間で通しにする
    for (let i = 0; i < n; i++) {
      try {
      const a = points[i], b = points[(i + 1) % n];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
      const outDx = midX - cenX, outDz = midZ - cenZ;
      const outLen = Math.hypot(outDx, outDz) || 1;
      const odx = outDx / outLen, odz = outDz / outLen; // このエッジの外向き単位法線
      const botOut = -CLEAR, topOut = battOut - CLEAR;
      const aBot = new THREE.Vector3(a.x + odx * botOut, realYBot, a.z + odz * botOut);
      const bBot = new THREE.Vector3(b.x + odx * botOut, realYBot, b.z + odz * botOut);
      const bTop = new THREE.Vector3(b.x + odx * topOut, realYTop, b.z + odz * topOut);
      const aTop = new THREE.Vector3(a.x + odx * topOut, realYTop, a.z + odz * topOut);
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array([
        aBot.x, aBot.y, aBot.z,  bBot.x, bBot.y, bBot.z,  bTop.x, bTop.y, bTop.z,
        aBot.x, aBot.y, aBot.z,  bTop.x, bTop.y, bTop.z,  aTop.x, aTop.y, aTop.z,
      ]);
      const u0 = cum / STRIPE_W, u1 = (cum + segLen) / STRIPE_W;
      const v0 = realYBot / STRIPE_W, v1 = realYTop / STRIPE_W;
      const uvArr = new Float32Array([
        u0, v0,  u1, v0,  u1, v1,
        u0, v0,  u1, v1,  u0, v1,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        map: hatchTex, color: 0xffffff, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false, depthTest: true
      });
      const panel = new THREE.Mesh(geo, mat);
      panel.renderOrder = 10; // 地形(既定renderOrder=0)より後に描画してZファイティングのちらつきを軽減
      group.add(panel);
      cum += segLen;
      } catch (e) {
        console.error('[YAMADOME-PANEL] edge', i, 'で例外', e);
      }
    }
    yamadomeMarker = group;
    scene.add(yamadomeMarker);
  }

  // 6D-6配置モード反映・根本修正版(2026-08-29 引継ぎ18回目マスター指示):
  // 「紫矩形で発生する垂直面と同じ形状の面(Manifoldが既に正しく計算済み)を
  // 少し前に出してテクスチャを貼るだけ」というマスターの指摘の通り、本体側で
  // ManifoldのoriginalID追跡により実際に採用された壁面三角形(positions/uv)を
  // そのまま受け取ってメッシュ化するだけ。座標系変換・2Dヒューリスティックに
  // よる再計算は一切不要になった(隣接オブジェクトがどれだけ複雑でも、Union
  // 計算自体が正しく処理した結果をそのまま流用するため常に正しい)。
  function placePurpleWallMarkers(wallData) {
    if (purpleWallMarkerGroup) { scene.remove(purpleWallMarkerGroup); purpleWallMarkerGroup = null; }
    if (!wallData || !wallData.positions || !wallData.positions.length) return;
    const hatchTex = _getYamadomeHatchTexture();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wallData.positions), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wallData.uv), 2));
    geo.computeVertexNormals();
    // 6D-10(2026-08-30 引継ぎ18回目マスター共有・検討書ベース): 入隅部分で
    // 隣接する三角形が独立にオフセットされることで交差(突き抜け)しており、
    // depthWrite:falseの半透明のため前後関係に関わらず両方描画されて色が
    // 濃く(黒ずんで)見えていた。depthWrite:trueにして手前の面が奥の面を
    // 隠すようにし、二重ブレンドを軽減する(暫定対応)。
    const mat = new THREE.MeshBasicMaterial({
      map: hatchTex, color: 0xffffff, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: true, depthTest: true
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10;
    mesh.userData = { isRoot: true, type: 'purple_wall_marker' };
    purpleWallMarkerGroup = mesh;
    scene.add(purpleWallMarkerGroup);
  }
  window.addEventListener('pointermove', e => {
    if (surveyFlags.length === 0) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(surveyFlags, true);
    const tip = document.getElementById('flag-hover-tip');
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.isRoot) obj = obj.parent;
      if (obj && obj.userData.type === 'survey_flag') {
        tip.style.display = 'block';
        tip.textContent = '📍 No.' + obj.userData.no;
        tip.style.left = (e.clientX + 14) + 'px';
        tip.style.top = (e.clientY - 28) + 'px';
        return;
      }
    }
    tip.style.display = 'none';
  });






  // ==========================================
  // ★ 地形に沿う作業半径・線描画ロジック
  // ==========================================
  const fallRaycaster = new THREE.Raycaster();
  // (動作軽量化・23回目): 吹き出し/矢印の支持判定の間引き間隔(フレーム数)。
  // 6フレームに1回(60fps環境で約100ms間隔)でも体感の遅延は無視できるレベル。
  const FALL_CHECK_INTERVAL_FRAMES = 6;
  let _animFrameCount = 0;
  
  function getSnappedLinePoints(p1, p2) {
    const points = [];
    const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const segments = Math.max(1, Math.ceil(dist / 0.5)); 
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const px = p1.x + (p2.x - p1.x) * t;
      const pz = p1.z + (p2.z - p1.z) * t;
      
      fallRaycaster.set(new THREE.Vector3(px, 100, pz), new THREE.Vector3(0, -1, 0));
      const hits = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
      let py = p1.y + (p2.y - p1.y) * t; 
      if (hits.length > 0) {
        py = hits[0].point.y + 0.15; 
      }
      points.push(new THREE.Vector3(px, py, pz));
    }
    return points;
  }

  function updateWorkingRadius(craneObj) {
    if (craneObj.userData.radiusMesh) {
      scene.remove(craneObj.userData.radiusMesh);
      craneObj.userData.radiusMesh.geometry.dispose();
      craneObj.userData.radiusMesh.material.dispose();
      craneObj.userData.radiusMesh = null;
    }
    
    const r = craneObj.userData.radiusValue;
    if (!r || r <= 0) return;

    const points = [];
    const segments = 64; 
    const cx = craneObj.position.x;
    const cz = craneObj.position.z;
    const upVector = new THREE.Vector3(0, -1, 0);
    
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const px = cx + Math.cos(theta) * r;
      const pz = cz + Math.sin(theta) * r;
      
      fallRaycaster.set(new THREE.Vector3(px, 100, pz), upVector);
      const hits = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
      if (hits.length > 0) {
        points.push(new THREE.Vector3(px, hits[0].point.y + 0.15, pz)); 
      } else {
        points.push(new THREE.Vector3(px, craneObj.position.y, pz));
      }
    }
    points.push(points[0].clone());
    
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0);
    const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.15, 4, false);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.6 });
    const ringMesh = new THREE.Mesh(tubeGeo, ringMat);
    ringMesh.raycast = function(){}; 
    ringMesh.userData.isRadiusMesh = true;
    
    ringMesh.visible = !craneObj.userData.isFallen;
    
    scene.add(ringMesh);
    craneObj.userData.radiusMesh = ringMesh;
  }

  // ==========================================
  // ★ テンキーUI操作ロジック
  // ==========================================
  let currentTargetCrane = null;
  let numpadValue = "";

  function openNumpad(craneObj) {
    currentTargetCrane = craneObj;
    numpadValue = "";
    document.getElementById('numpad-display').innerText = "0";
    document.getElementById('numpad-ui').style.display = "block";
    controls.enabled = false;
  }

  function closeNumpad() {
    document.getElementById('numpad-ui').style.display = "none";
    currentTargetCrane = null;
    controls.enabled = true;
  }

  document.querySelectorAll('.numpad-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = e.target.innerText;
      if (val === 'C') {
        numpadValue = "";
        document.getElementById('numpad-display').innerText = "0";
      } else if (val.includes('OK')) {
        applyWorkingRadius();
        closeNumpad();
      } else {
        if (numpadValue.length < 5) {
          if (val === '.' && numpadValue.includes('.')) return; 
          numpadValue += val;
          document.getElementById('numpad-display').innerText = numpadValue;
        }
      }
    });
  });

  document.getElementById('numpad-cancel').addEventListener('click', closeNumpad);

  function applyWorkingRadius() {
    if (!currentTargetCrane) return;
    const r = parseFloat(numpadValue);
    
    if (isNaN(r) || r <= 0) {
      if (currentTargetCrane.userData.radiusMesh) {
        scene.remove(currentTargetCrane.userData.radiusMesh);
        currentTargetCrane.userData.radiusMesh = null;
      }
      currentTargetCrane.userData.radiusValue = 0;
      return;
    }
    
    currentTargetCrane.userData.radiusValue = r;
    updateWorkingRadius(currentTargetCrane);
  }

  // ==========================================
  // ★ カスタムボックス用 UIロジック
  // ==========================================
  let boxParams = { boxW: "1.0", boxD: "1.0", boxH: "1.0" };
  let activeBoxParam = null; 
  let isFreshSelection = false; 
  let boxColor = 0xe74c3c;

  document.querySelectorAll('.box-input-group').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.box-input-group').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      activeBoxParam = el.dataset.target;
      isFreshSelection = true; 
    });
  });

  document.querySelectorAll('.b-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.b-color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      boxColor = parseInt(btn.dataset.color, 16);
    });
  });

  document.querySelectorAll('.box-numpad-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!activeBoxParam) return; 
      
      const val = e.target.innerText;
      let curr = boxParams[activeBoxParam];
      
      if (val === 'C') {
        curr = "0";
        isFreshSelection = false;
      } else {
        if (isFreshSelection) {
          curr = ""; 
          isFreshSelection = false;
        }
        if (curr === "0" && val !== ".") curr = "";
        if (curr.length < 5) {
          if (val === '.' && curr.includes('.')) return;
          if (curr === "" && val === ".") curr = "0";
          curr += val;
        }
      }
      if (curr === "") curr = "0";
      boxParams[activeBoxParam] = curr;
      document.getElementById('box-val-' + activeBoxParam).innerText = curr;
    });
  });

  document.getElementById('box-btn-cancel').addEventListener('click', () => {
    exitPlacementMode();
  });

  document.getElementById('box-btn-ok').addEventListener('click', () => {
    document.getElementById('box-input-ui').style.display = 'none';
    currentType = 'custom_box';
    document.getElementById('placement-mode-msg').style.display = 'block';
    document.getElementById('placement-msg-text').innerText = "ボックスの配置場所をクリックしてください";
    document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
    setTimeout(() => { controls.enabled = true; }, 10);
  });

  // ==========================================
  // ★ 足場(テスト機能) 45回目 r128
  //   ビテイ式枠組足場(通称ビティ足場)風の「四角」。高さ=1.7m×段+ジャッキベース0.2m・長さ=1.8m×列・奥行=幅(0.6/0.9/1.2m)。
  //   流れはボックス(custom_box)と同じ: ボタン(scaffold_input)→入力ダイアログ→配置待ち(scaffold)→クリックでspawnObject。
  //   見た目: 側面は「透かし」テクスチャ(支柱・手すり・X筋違・幅木・ベース板。銀灰色。alphaTestで抜く)、各段の床板は薄い箱。本体は影を出さない(castShadow=false)。足元だけ「見えない小さい柱」で短い影を落とす(r129)。
  //   当たり判定・選択は全面(箱形)のまま。保存はuserData.scfSteps/scfSpans/scfWidth。
  // ==========================================
  const SCF = { H_STEP: 1.7, W_SPAN: 1.8, H_BASE: 0.2, MAX_STEPS: 30, MAX_SPANS: 50, SHADOW_POST: { w: 0.15, h: 1.2 }, FLOAT_TOL: 0.3 };
  let scaffoldParams = { steps: "2", spans: "3", width: "0.9" }; // 前回の入力値を覚えておく(ダイアログを開き直した時の初期値)
  let activeScfParam = null;
  let scfFresh = false;

  function _scfUi() { return document.getElementById('scaffold-input-ui'); }
  function _scfIsOpen() { const u = _scfUi(); return !!u && u.style.display === 'block'; }

  function _scfRefreshInfo() {
    const s = parseInt(scaffoldParams.steps, 10) || 0, n = parseInt(scaffoldParams.spans, 10) || 0;
    const w = parseFloat(document.getElementById('scf-width').value) || 0.9;
    const el = document.getElementById('scf-info');
    if (!el) return;
    if (s < 1 || n < 1) { el.textContent = '段・列は1以上を入力してください'; return; }
    const H = SCF.H_STEP * s + SCF.H_BASE, L = SCF.W_SPAN * n;
    el.textContent = `高さ ${H.toFixed(1)}m(1.7×${s}段+0.2) ／ 長さ ${L.toFixed(1)}m(1.8×${n}列) ／ 幅 ${w.toFixed(1)}m`;
  }

  function _scfSelectParam(key) {
    document.querySelectorAll('.scf-input-group').forEach(e => e.classList.toggle('active', e.dataset.target === key));
    activeScfParam = key;
    scfFresh = true; // 次の数字入力で一度クリアして入力し直す(ボックスと同じ動き)
  }

  function _scfInput(val) { // val: '0'〜'9' / 'C' / '⌫'
    if (!activeScfParam) _scfSelectParam('steps');
    let curr = scaffoldParams[activeScfParam];
    if (val === 'C') { curr = "0"; scfFresh = false; }
    else if (val === '⌫') { curr = curr.slice(0, -1); scfFresh = false; }
    else {
      if (scfFresh) { curr = ""; scfFresh = false; }
      if (curr === "0") curr = "";
      if (curr.length < 2) curr += val; // 段・列とも最大2桁
    }
    if (curr === "") curr = "0";
    scaffoldParams[activeScfParam] = curr;
    document.getElementById('scf-val-' + activeScfParam).innerText = curr;
    _scfRefreshInfo();
  }

  function _scfOpenDialog() {
    _scfUi().style.display = 'block';
    controls.enabled = false;
    document.getElementById('scf-val-steps').innerText = scaffoldParams.steps;
    document.getElementById('scf-val-spans').innerText = scaffoldParams.spans;
    document.getElementById('scf-width').value = scaffoldParams.width;
    _scfSelectParam('steps');
    scfFresh = true;
    _scfRefreshInfo();
  }

  document.querySelectorAll('.scf-input-group').forEach(el => {
    el.addEventListener('click', () => _scfSelectParam(el.dataset.target));
  });
  document.querySelectorAll('.scf-numpad-btn').forEach(btn => {
    btn.addEventListener('click', () => _scfInput(btn.textContent.trim()));
  });
  document.getElementById('scf-width').addEventListener('change', e => { scaffoldParams.width = e.target.value; _scfRefreshInfo(); });
  document.getElementById('scf-btn-cancel').addEventListener('click', () => { exitPlacementMode(); });
  document.getElementById('scf-btn-ok').addEventListener('click', () => {
    const s = parseInt(scaffoldParams.steps, 10), n = parseInt(scaffoldParams.spans, 10);
    if (!(s >= 1 && s <= SCF.MAX_STEPS)) { showToast(`⚠ 段数は1〜${SCF.MAX_STEPS}で入力してください`); _scfSelectParam('steps'); return; }
    if (!(n >= 1 && n <= SCF.MAX_SPANS)) { showToast(`⚠ 列数は1〜${SCF.MAX_SPANS}で入力してください`); _scfSelectParam('spans'); return; }
    scaffoldParams.steps = String(s); scaffoldParams.spans = String(n);
    scaffoldParams.width = document.getElementById('scf-width').value || "0.9";
    _scfUi().style.display = 'none';
    currentType = 'scaffold';
    document.getElementById('placement-mode-msg').style.display = 'block';
    document.getElementById('placement-msg-text').innerText = "足場の配置場所をクリックしてください";
    document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
    setTimeout(() => { controls.enabled = true; }, 10);
  });
  // ダイアログ中のキーボード: 数字(テンキー含む)・Backspace・Enter(配置)・Esc(キャンセル)。矢印キーは足場ダイアログ中にカメラを動かさない。
  // キャプチャ段階で受けて、他のkeydown(リピート・矢印カメラ・Esc)には渡さない。幅のドロップダウンにフォーカスがある間は何も奪わない。
  window.addEventListener('keydown', (e) => {
    if (!_scfIsOpen()) return;
    const onSelect = document.activeElement && document.activeElement.tagName === 'SELECT';
    if (e.key.startsWith('Arrow')) { e.stopPropagation(); return; }
    if (onSelect) { if (e.key === 'Enter' || e.key === 'Escape') { e.stopPropagation(); } return; }
    if (/^[0-9]$/.test(e.key)) { e.stopPropagation(); e.preventDefault(); _scfInput(e.key); }
    else if (e.key === 'Backspace') { e.stopPropagation(); e.preventDefault(); _scfInput('⌫'); }
    else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); document.getElementById('scf-btn-ok').click(); }
    else if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); document.getElementById('scf-btn-cancel').click(); }
  }, true);

  // --- 足場の絵(銀灰色・透かし)。タイルは1スパン(1.8m)×1段(1.7m)=128×128、ベース部は1.8m×0.2m=128×32。端でつながって1本の支柱・1本の棒になるよう半分ずつ描く。
  let _scfTex = null;
  function _scfMakeTextures() {
    if (_scfTex) return _scfTex;
    const aniso = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    const mk = (w, h, draw) => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const c = cv.getContext('2d'); c.clearRect(0, 0, w, h); draw(c);
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.needsUpdate = true;
      return t;
    };
    const LIGHT = '#d3d8dc', MID = '#a3aab1', DARK = '#6b737a';
    const bar = (c, x0, y0, x1, y1, w) => { // 濃い縁+明るい本体の棒
      c.lineCap = 'butt';
      c.strokeStyle = DARK; c.lineWidth = w + 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = LIGHT; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    };
    const body = mk(128, 128, c => {
      bar(c, 4, 64, 124, 120, 4); bar(c, 124, 64, 4, 120, 4);        // 筋違(X)
      bar(c, 0, 62, 128, 62, 4); bar(c, 0, 92, 128, 92, 3);          // 手すり(上段・中段)
      c.fillStyle = MID; c.fillRect(0, 121, 128, 7);                  // 幅木(床板の縁)
      c.fillStyle = LIGHT; c.fillRect(0, 0, 4, 128); c.fillRect(124, 0, 4, 128); // 支柱(両端)
      c.fillStyle = DARK; c.fillRect(4, 0, 1, 128); c.fillRect(123, 0, 1, 128);
    });
    const base = mk(128, 32, c => {
      c.fillStyle = MID; c.fillRect(0, 0, 128, 3);                    // 根がらみ風の横材
      c.fillStyle = LIGHT; c.fillRect(0, 0, 4, 26); c.fillRect(124, 0, 4, 26); // ジャッキの軸
      c.fillStyle = DARK; c.fillRect(0, 26, 6, 6); c.fillRect(122, 26, 6, 6);  // ベース板
    });
    // r132: マスターの図面から作った画像(data/voldia_scaffold_tex.js)があればそれを使う(側面=side・小口=end)。無い時はコード描き(上のbody)で、小口も同じ絵。
    let sideT = body, endT = body;
    if (window.SCAFFOLD_TEX && window.SCAFFOLD_TEX.side && window.SCAFFOLD_TEX.end) {
      const load = (url) => { const tx = new THREE.TextureLoader().load(url); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = aniso; return tx; };
      sideT = load(window.SCAFFOLD_TEX.side);
      endT = load(window.SCAFFOLD_TEX.end);
    }
    _scfTex = { body: sideT, end: endT, base };
    return _scfTex;
  }

  // 足元が地面から離れている柱(根切りの縁で足場が中途半端に空中に出た時など)は、影を切る(r130・マスター要望)。
  //   各柱の足元から真上→真下にレイを飛ばして地面(_getFloorMeshes)の高さを調べ、足元との差がFLOAT_TOL(0.3m)を超える柱、または真下に地面が無い柱は castShadow=false。
  //   着地・ドロップ・クリック回転・.vold復元の後に呼ぶ(ドラッグ中は重いので呼ばない)。
  function _scfUpdateShadowPosts(obj) {
    if (!obj) return;
    obj.updateMatrixWorld(true);
    const floors = _getFloorMeshes();
    const SH = SCF.SHADOW_POST;
    obj.traverse(c => {
      if (!c.userData || !c.userData.isScfShadowPost) return;
      const foot = c.localToWorld(new THREE.Vector3(0, -SH.h / 2, 0)); // 柱の足元(傾きも反映)
      fallRaycaster.set(new THREE.Vector3(foot.x, foot.y + 500, foot.z), new THREE.Vector3(0, -1, 0));
      const hits = fallRaycaster.intersectObjects(floors, true).filter(h => h.object.isMesh);
      c.castShadow = hits.length > 0 && (foot.y - hits[0].point.y) <= SCF.FLOAT_TOL;
    });
    renderer.shadowMap.needsUpdate = true;
  }

  function createScaffoldMesh(steps, spans, widthM) {
    const L = SCF.W_SPAN * spans, W = widthM, HB = SCF.H_BASE, HS = SCF.H_STEP * steps;
    const T = _scfMakeTextures();
    const g = new THREE.Group();
    const panel = (w, h, repU, repV, tex, x, y, z, rotY) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repU, uv.getY(i) * repV); // タイルをスパン数×段数だけ繰り返す
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.y = rotY;
      m.castShadow = false; m.receiveShadow = false; // 影なし(マスター確定)
      g.add(m);
    };
    // 長辺(±z)・短辺(±x)の本体(段)とベース部
    panel(L, HS, spans, steps, T.body, 0, HB + HS / 2, W / 2, 0);
    panel(L, HS, spans, steps, T.body, 0, HB + HS / 2, -W / 2, Math.PI);
    panel(W, HS, 1, steps, T.end, L / 2, HB + HS / 2, 0, Math.PI / 2);
    panel(W, HS, 1, steps, T.end, -L / 2, HB + HS / 2, 0, -Math.PI / 2);
    panel(L, HB, spans, 1, T.base, 0, HB / 2, W / 2, 0);
    panel(L, HB, spans, 1, T.base, 0, HB / 2, -W / 2, Math.PI);
    panel(W, HB, 1, 1, T.base, L / 2, HB / 2, 0, Math.PI / 2);
    panel(W, HB, 1, 1, T.base, -L / 2, HB / 2, 0, -Math.PI / 2);
    // 各段の床板(薄い箱。最上段の床板の上面=全体の高さ)
    for (let k = 1; k <= steps; k++) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(L - 0.04, 0.05, W - 0.04), new THREE.MeshLambertMaterial({ color: 0x9aa1a8 }));
      deck.position.set(0, HB + SCF.H_STEP * k - 0.025, 0);
      deck.castShadow = false; deck.receiveShadow = false;
      g.add(deck);
    }
    // 足元だけの短い影(マスター要望・45回目r129): 各支柱の足元に「見えない小さい柱」を置き、影の計算にだけ参加させる。
    //   色・深度を書かない(colorWrite/depthWrite=false)ので描画には出ない。three r128の影パスは object.visible と material.visible だけを見て
    //   専用の深度マテリアルで描くため、この柱でも本物の影(太陽の向き・地形の傾き・PCFSoftのぼかし)が落ちる。足場本体(板・床板)は影を落とさないまま。
    //   柱の寸法: 幅0.15m角・高さ1.2m(r130で0.6→1.2m=影の長さ約2倍。影の解像度=作業エリア幅÷2048。細すぎると薄くなるため太めにしてある)。選択・クリックの判定には出さない。
    const SH = SCF.SHADOW_POST;
    for (let i = 0; i <= spans; i++) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(SH.w, SH.h, SH.w),
          new THREE.MeshLambertMaterial({ colorWrite: false, depthWrite: false })
        );
        post.position.set(Math.min(L / 2 - SH.w / 2, Math.max(-L / 2 + SH.w / 2, -L / 2 + SCF.W_SPAN * i)), SH.h / 2, sz * (W / 2 - SH.w / 2)); // 両端は箱からはみ出さないよう内側に寄せる(当たり判定の寸法を変えない)
        post.castShadow = true; post.receiveShadow = false;
        post.raycast = function () {};
        post.userData.isScfShadowPost = true;
        g.add(post);
      }
    }
    return g;
  }

  // ==========================================
  // ★ オブジェクトの衝突・重なり回避ロジック
  // ==========================================
  function getBoundingBox(obj) {
    const box = new THREE.Box3();
    obj.traverse(child => {
      if (child.isMesh && !child.userData.isRadiusMesh && !child.userData.isBillboard && !child.userData.isDragMarker && !child.userData.isDragHitbox) {
        const geometry = child.geometry;
        if (geometry) {
          if (!geometry.boundingBox) geometry.computeBoundingBox();
          const childBox = geometry.boundingBox.clone();
          childBox.applyMatrix4(child.matrixWorld);
          box.union(childBox);
        }
      }
    });
    // r015: 当たり判定用ボックスを各辺35%ずつ内側に縮小。ファイル復元時は
    // 「配置→地形に着地→少し遅れて保存済みの向きを再適用」という順序に
    // なっており、衝突判定が実際に走る瞬間の向きと最終的な向きがズレる
    // ことがある（重機は向きによって世界座標AABBの大きさ・形が変わる
    // ため）。多少の食い込みを許容する余裕を持たせておくことで、この
    // 向きのズレによる誤判定（本来重ならないのに押し出される／本来
    // 重なるのに素通りする）の影響を和らげる。
    if(!box.isEmpty()){
      const size = new THREE.Vector3();
      box.getSize(size);
      const inset = size.multiplyScalar(0.35 * 0.5); // 各辺35%(片側17.5%ずつ)
      box.min.add(inset);
      box.max.sub(inset);
    }
    return box;
  }

  function checkOverlapSimple(obj) {
    if (obj.userData.type === 'text_balloon' || obj.userData.type === 'arrow') return false; 
    const objBox = getBoundingBox(obj);
    for (const other of placedObjects) {
      // r065: 構台は「載る面」であって障害物ではないため、通常の衝突判定からは除外する
      if (other === obj || !other.userData.isPlaced || other.userData.type === 'text_balloon' || other.userData.type === 'arrow' || other.userData.type === 'kotai') continue;
      const otherBox = getBoundingBox(other);
      if (objBox.intersectsBox(otherBox)) {
        return true;
      }
    }
    return false;
  }

  function resolveKotaiOverlap(obj) {
    // r065: 構台が非表示の間に配置/移動したオブジェクトが、構台を再表示した際に
    // 衝突しないよう先回りでスライドさせる。checkOverlapSimple/resolveOverlapは
    // 構台を除外しているため、この専用チェックで補う。
    if (!obj || obj.userData.type === 'text_balloon' || obj.userData.type === 'arrow' || obj.userData.type === 'kotai') return;
    if (kotaiMeshes.length === 0) return;
    let overlap = true, attempts = 0;
    while (overlap && attempts < 30) {
      overlap = false;
      obj.updateMatrixWorld(true);
      const objBox = getBoundingBox(obj);
      for (const km of kotaiMeshes) {
        km.updateMatrixWorld(true);
        const kBox = getBoundingBox(km);
        if (objBox.intersectsBox(kBox)) {
          overlap = true;
          const c1 = new THREE.Vector3(); objBox.getCenter(c1);
          const c2 = new THREE.Vector3(); kBox.getCenter(c2);
          let dx = c1.x - c2.x, dz = c1.z - c2.z;
          if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
          const len = Math.hypot(dx, dz) || 1;
          obj.position.x += (dx / len) * 1.0;
          obj.position.z += (dz / len) * 1.0;
          break;
        }
      }
      attempts++;
    }
  }

  function resolveOverlap(obj) {
    if (obj.userData.type === 'text_balloon' || obj.userData.type === 'arrow') return; 
    let overlap = true;
    let attempts = 0;
    while (overlap && attempts < 30) {
      overlap = false;
      obj.updateMatrixWorld(true);
      const objBox = getBoundingBox(obj);
      
      for (const other of placedObjects) {
        if (other === obj || !other.userData.isPlaced || other.userData.type === 'text_balloon' || other.userData.type === 'arrow' || other.userData.type === 'kotai') continue;
        other.updateMatrixWorld(true);
        const otherBox = getBoundingBox(other);
        
        if (objBox.intersectsBox(otherBox)) {
          overlap = true;
          const c1 = new THREE.Vector3();
          objBox.getCenter(c1);
          const c2 = new THREE.Vector3();
          otherBox.getCenter(c2);
          
          let dx = c1.x - c2.x;
          let dz = c1.z - c2.z;
          if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) {
            dx = Math.random() - 0.5;
            dz = Math.random() - 0.5;
          }
          const len = Math.hypot(dx, dz);
          const pushDist = 1.0; 
          obj.position.x += (dx / len) * pushDist;
          obj.position.z += (dz / len) * pushDist;
          break; 
        }
      }
      attempts++;
    }
  }

  function checkFallenStatus(obj, isDrop = false) {
    if (obj.userData.type === 'scaffold' && isDrop) _scfUpdateShadowPosts(obj); // r130: 足場の空中の柱は影なし(着地・ドロップ時のみ判定。ドラッグ中は重いので呼ばない)
    const excemptTypes = ['bh_mini', 'bh_025', 'bh_045', 'bh_07', 'bh_12', 'custom_box', 'scaffold', 'conebar', 'worker', 'guard', 'text_balloon', 'arrow'];
    if (excemptTypes.includes(obj.userData.type)) return;

    const isFallen = obj.userData.normal.y < 0.995; 
    
    if (isFallen !== obj.userData.isFallen) {
      obj.userData.isFallen = isFallen;
      
      obj.traverse(child => {
        if (child.isMesh && child.material && !child.userData.isRadiusMesh && !child.userData.isBillboard && !child.userData.isDragMarker && !child.userData.isDragHitbox) {
          if (isFallen) {
            child.material.emissive.setHex(0xaa0000); 
          } else {
            child.material.emissive.setHex(0x000000); 
          }
        }
      });
      
      if (obj.userData.radiusMesh) {
        obj.userData.radiusMesh.visible = !isFallen;
      }
    }

    if (isDrop && isFallen) {
      showToast('⚠️ 倒れているオブジェクトがあります');
    }
  }

  function removeObject(mesh) {
    scene.remove(mesh);
    if (mesh.userData.radiusMesh) {
      scene.remove(mesh.userData.radiusMesh);
      mesh.userData.radiusMesh.geometry.dispose();
      mesh.userData.radiusMesh.material.dispose();
    }
    // r065(AIS修正案): scene.remove()だけではgeometry/materialのGPUメモリが
    // 解放されず、削除を繰り返すとメモリリークするバグを修正。子要素(当たり判定
    // ヒットボックス・輪郭線・テキストスプライト等)も含めて全てdispose()する。
    mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
    const idx = placedObjects.indexOf(mesh);
    if (idx !== -1) placedObjects.splice(idx, 1);
    renderer.shadowMap.needsUpdate = true; 
  }

  // ==========================================
  // ★ 仮囲い（線引き）ステート管理とカラーピッカー
  // ==========================================
  let currentLinePoints = []; 
  let currentLineMesh = null; 
  let previewLineMesh = null; 
  let fenceLines = []; 
  let fenceToDelete = null;
  let currentLineColor = 0xf1c40f; 
  let _lineCloseHover = false; // r025: 始点付近ホバー中かどうか（マスター指示: 線を始点クリックで閉じる機能）
  const LINE_CLOSE_DIST = 1.0; // r025: 始点への吸着判定距離（ワールド座標,メートル）

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLineColor = parseInt(btn.dataset.color, 16);
    });
  });

  function updateCurrentLineMesh() {
    if (currentLineMesh) {
      scene.remove(currentLineMesh);
      currentLineMesh = null;
    }
    if (currentLinePoints.length < 2) return;
    
    currentLineMesh = new THREE.Group();
    currentLineMesh.userData.isFenceLine = true;
    
    for (let i = 0; i < currentLinePoints.length - 1; i++) {
      const pts = getSnappedLinePoints(currentLinePoints[i], currentLinePoints[i+1]);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
      const geo = new THREE.TubeGeometry(curve, pts.length, 0.15, 6, false);
      const mat = new THREE.MeshBasicMaterial({ color: currentLineColor }); 
      const mesh = new THREE.Mesh(geo, mat);
      currentLineMesh.add(mesh);
    }
    scene.add(currentLineMesh);
  }

  function updatePreviewLine(targetPoint) {
    if (previewLineMesh) {
      scene.remove(previewLineMesh);
      previewLineMesh.geometry.dispose();
      previewLineMesh.material.dispose();
      previewLineMesh = null;
    }
    if (currentLinePoints.length === 0) return;
    
    const lastPt = currentLinePoints[currentLinePoints.length - 1];
    const pts = getSnappedLinePoints(lastPt, targetPoint);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
    const geo = new THREE.TubeGeometry(curve, pts.length, 0.15, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: currentLineColor, transparent: true, opacity: 0.5 });
    previewLineMesh = new THREE.Mesh(geo, mat);
    previewLineMesh.raycast = function(){};
    scene.add(previewLineMesh);
  }

  // ==========================================
  // ★ モード終了・ツールリセットの一元管理
  // ==========================================
  function exitPlacementMode() {
    if (!currentType) return;
    const t = currentType;
    currentType = null;
    
    if (t === 'line') {
      if (currentLinePoints.length > 1) {
        fenceLines.push(currentLineMesh);
      } else if (currentLineMesh) {
        scene.remove(currentLineMesh);
      }
      if (previewLineMesh) scene.remove(previewLineMesh);
      currentLineMesh = null;
      previewLineMesh = null;
      currentLinePoints = [];
      _lineCloseHover = false;
      document.getElementById('line-close-tip').style.display = 'none';
    }

    if (t === 'kotai') {
      _kotaiCleanupListeners();
      _kotaiClearPreview();
      _kotaiRestoreCamera();
      kotaiPoints = [];
    }

    if (t === 'h_pile') {
      _hpileExit();
    }

    cancelTextInput(); 
    document.getElementById('box-input-ui').style.display = 'none';
    { const _su = document.getElementById('scaffold-input-ui'); if(_su) _su.style.display = 'none'; } // r128: 足場ダイアログ
    controls.enabled = true;
    
    document.querySelectorAll('.pal-btn').forEach(b => b.classList.remove('active'));
    placementMarker.visible = false;
    document.getElementById('placement-mode-msg').style.display = 'none';
    document.getElementById('line-color-picker').style.display = 'none';
    document.getElementById('finish-line-btn').style.display = 'none';
  }

  function finishLine() {
    exitPlacementMode();
  }

  document.getElementById('finish-line-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    finishLine();
  });

  document.getElementById('custom-confirm-yes').addEventListener('click', () => {
    if (fenceToDelete) {
      scene.remove(fenceToDelete);
      fenceLines.splice(fenceLines.indexOf(fenceToDelete), 1);
      fenceToDelete.traverse(child => {
        if(child.isMesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
      showToast('🗑️ 線を削除しました');
      fenceToDelete = null;
    }
    document.getElementById('custom-confirm-overlay').style.display = 'none';
    controls.enabled = true;
  });

  document.getElementById('custom-confirm-no').addEventListener('click', () => {
    fenceToDelete = null;
    document.getElementById('custom-confirm-overlay').style.display = 'none';
    controls.enabled = true;
  });

  // ==========================================
  // ★ テキスト入力UIロジック
  // ==========================================
  let pendingTextPos = null;
  let editingBalloonObj = null; // r025: 右クリック編集対象（新規作成時はnull）

  function cancelTextInput() {
    document.getElementById('text-input-ui').style.display = 'none';
    pendingTextPos = null;
    editingBalloonObj = null;
    controls.enabled = true;
  }

  document.getElementById('text-btn-cancel').addEventListener('click', () => {
    editingBalloonObj = null;
    exitPlacementMode();
  });

  document.getElementById('text-btn-ok').addEventListener('click', () => {
    const text = document.getElementById('text-input-area').value.trim();
    if (text && editingBalloonObj) {
      // r025: 編集モード。ビルボード（テキスト部分）だけ差し替え、位置/dot/pole等は維持
      const oldBillboard = editingBalloonObj.children.find(c => c.userData.isBillboard);
      if (oldBillboard) {
        editingBalloonObj.remove(oldBillboard);
        oldBillboard.geometry.dispose();
        oldBillboard.material.map.dispose();
        oldBillboard.material.dispose();
      }
      const freshGroup = createTextBalloonMesh(text);
      const newBillboard = freshGroup.children.find(c => c.userData.isBillboard);
      editingBalloonObj.add(newBillboard);
      editingBalloonObj.userData.text = text;
      renderer.shadowMap.needsUpdate = true; 
    } else if (text && pendingTextPos) {
      const balloon = createTextBalloonMesh(text);
      balloon.position.copy(pendingTextPos);
      balloon.userData = { isRoot: true, type: 'text_balloon', yaw: 0, isFallen: false, radiusValue: 0, isPlaced: true, text: text };
      scene.add(balloon);
      placedObjects.push(balloon);
      renderer.shadowMap.needsUpdate = true; 
    }
    const _wasBalloonPlaced = !!(text && pendingTextPos && !editingBalloonObj);
    cancelTextInput();
    exitPlacementMode(); 
    if (_wasBalloonPlaced) showToast('✅ 吹き出しを設置しました　⏎ Enterでリピート可');
  });


  // ==========================================
  // 4. UIロジックと配置管理
  // ==========================================
  let currentType = null;
  let _lastPalBtnForRepeat = null; // r051: Enterキーでのリピート機能。構台(kotai)・保存系は対象外。
  const placedObjects = []; 

  document.querySelectorAll('.pal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // r051: リピート機能(手動・Enterキー)用に直前選択ボタンを記録。構台(kotai)は対象外。
      if(btn.dataset.type !== 'kotai') _lastPalBtnForRepeat = btn;
      const nextType = btn.dataset.type;
      const isSame = (currentType === nextType);

      if (currentType) exitPlacementMode();
      
      if (isSame) return; 
      
      btn.classList.add('active');
      currentType = nextType;
      
      if (currentType === 'custom_box_input') {
        document.getElementById('box-input-ui').style.display = 'block';
        controls.enabled = false;
        
        boxParams = { boxW: "1.0", boxD: "1.0", boxH: "1.0" };
        activeBoxParam = null; 
        isFreshSelection = false; 
        document.querySelectorAll('.box-input-group').forEach(e => e.classList.remove('active'));
        document.getElementById('box-val-boxW').innerText = "1.0";
        document.getElementById('box-val-boxD').innerText = "1.0";
        document.getElementById('box-val-boxH').innerText = "1.0";
        
        boxColor = 0xe74c3c;
        document.querySelectorAll('.b-color-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.b-color-btn[data-color="0xe74c3c"]').classList.add('active');
        return;
      }

      if (currentType === 'scaffold_input') { // r128: 足場(テスト機能)の入力ダイアログ
        _scfOpenDialog();
        return;
      }

      const msg = document.getElementById('placement-mode-msg');
      msg.style.display = 'block';
      
      if (currentType === 'line') {
        document.getElementById('placement-msg-text').innerText = "1点目をクリックしてください";
        document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
        document.getElementById('line-color-picker').style.display = "flex";
        document.getElementById('finish-line-btn').style.display = "none";
      } else if (currentType === 'text_balloon' || currentType === 'arrow') {
        document.getElementById('placement-msg-text').innerText = "配置場所をクリックしてください";
        document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
        document.getElementById('line-color-picker').style.display = "none";
        document.getElementById('finish-line-btn').style.display = "none";
      } else if (currentType === 'h_pile') {
        document.getElementById('placement-msg-text').innerText = "3Dビュー上の配置位置をクリックしてください";
        document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
        document.getElementById('line-color-picker').style.display = "none";
        document.getElementById('finish-line-btn').style.display = "none";
        _hpileEnter();
      } else if (currentType === 'kotai') {
        // r062: 構台。真上カメラへ切替、多角形描画モードへ入る
        document.getElementById('placement-msg-text').innerText = "頂点をクリックしてください（0.5mグリッドにスナップ）";
        document.getElementById('placement-msg-sub').innerText = "始点クリックまたはダブルクリックで確定／Escでキャンセル";
        document.getElementById('line-color-picker').style.display = "none";
        document.getElementById('finish-line-btn').style.display = "none";
        enterKotaiMode();
      } else {
        document.getElementById('placement-msg-text').innerText = "✨ 選択したオブジェクトを配置してください";
        document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
        document.getElementById('line-color-picker').style.display = "none";
        document.getElementById('finish-line-btn').style.display = "none";
      }
    });
  });

  // r051: リピート機能(手動・Enterキー)。何も選択していない状態でEnterを押すと
  // 直前に使ったパレット項目(構台=kotaiは対象外)を再選択する。テキスト入力欄
  // フォーカス中や各種ダイアログ表示中は誤爆防止のため無効化する。
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (currentType) return; // 何か選択中(配置待ち)なら何もしない
    if (!_lastPalBtnForRepeat) return;
    const tag = document.activeElement && document.activeElement.tagName;
    const isFormFocus = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);
    const textUiOpen = document.getElementById('text-input-ui') && document.getElementById('text-input-ui').style.display !== 'none';
    const boxUiOpen = document.getElementById('box-input-ui') && document.getElementById('box-input-ui').style.display !== 'none';
    const confirmOverlayOpen = document.getElementById('custom-confirm-overlay') && document.getElementById('custom-confirm-overlay').style.display !== 'none';
    const kotaiConfirmOpen = document.getElementById('kotai-confirm-overlay') && document.getElementById('kotai-confirm-overlay').style.display !== 'none';
    if (isFormFocus || textUiOpen || boxUiOpen || _scfIsOpen() || confirmOverlayOpen || kotaiConfirmOpen) return;
    e.preventDefault();
    _lastPalBtnForRepeat.click();
    showToast(`↩ リピート: ${_lastPalBtnForRepeat.textContent.trim()}`);
  });

  // r072(21回目引継ぎ・マスター要望「作業エリアが広いとホイールだけのズームでは
  // 拡大操作に限界がある」対策): カーソルキーでカメラの前後左右移動を追加。
  // 移動量はカメラ〜注視点の現在距離に比例させ、どのズームレベルでも体感速度が
  // 一定になるようにする。構台モード中は専用のカメラ制御(_kotaiSavedCam!==null)
  // と競合するため対象外。フォーム入力中も誤爆防止で無効化。
  // r075(21回目引継ぎ3回目・マスター報告「オブジェクトをクリックするまで動かない/
  // 他ウインドウに切替えて戻ると再び動かなくなる」): 診断ログで原因判明。
  // camera.position/controls.targetの更新自体は毎回正しく実行されていた
  // (distの値が押すたびに変化することで確認できた)が、実際の再描画は
  // animate()内のrequestAnimationFrameループ任せになっていた。ブラウザは
  // ウインドウ(OSフォーカス)が外れている間rAFを間引く/止めるため、その間は
  // 画面が更新されず「動いていないように見える」。クリック(≒ウインドウに
  // フォーカスが戻る操作)をきっかけにrAFが再開し、それまでの蓄積分が一気に
  // 反映されて「クリックしたら動いた」ように見えていた、が真相。
  // 対策: rAFループを待たず、キー入力のたびにここで直接1回描画する。
  window.addEventListener('keydown', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tag = document.activeElement && document.activeElement.tagName;
    const isFormFocus = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);
    if (isFormFocus) return;
    if (typeof _kotaiSavedCam !== 'undefined' && _kotaiSavedCam) return; // 構台モード中は対象外
    e.preventDefault();
    const dist = camera.position.distanceTo(controls.target);
    const step = dist * 0.06;
    const forward = new THREE.Vector3(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1); else forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const move = new THREE.Vector3();
    if (e.key === 'ArrowUp') move.copy(forward);
    else if (e.key === 'ArrowDown') move.copy(forward).negate();
    else if (e.key === 'ArrowLeft') move.copy(right); // r073(21回目引継ぎ・マスター指摘「左右逆」): 符号を反転して修正
    else if (e.key === 'ArrowRight') move.copy(right).negate();
    move.multiplyScalar(step);
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
    renderer.render(scene, camera); // r075: rAFループを待たず即座に反映
  });

  const radarCanvas = document.getElementById('radar-canvas');
  const radarCtx = radarCanvas.getContext('2d');
  let mapRange = 50; 
  let mapCenter = { x: 0, z: 0 };
  let kotaiFitRange = 50; // r051: 構台開始時の全体表示用(customGround拡張分を含まない)
  let terrainMinY = 0; // r062: 地形全体の絶対最低点(鋼材柱の下端に使用)
  let kotaiMeshes = []; // r063: 構台メッシュ一覧。存在する間は配置先を構台に一本化する
  let kotaiVisible = true;
  function _getFloorMeshes(){
    // r065: 構台は地形の「代わり」ではなく「追加の面」。組み合わせて渡すことで
    // 地面には常に置けつつ、構台がある場所ではレイの最近傍ヒット(構台の方が
    // 地形より手前)が自然に優先される。以前の「構台のみ」方式は構台の外側で
    // 着地先が見つからず無限落下する不具合があったため撤回。
    return (kotaiMeshes.length > 0 && kotaiVisible) ? [...terrainMeshes, ...kotaiMeshes] : terrainMeshes;
  }

  function worldToRadar(wx, wz) {
    const u = ((wx - mapCenter.x + mapRange) / (mapRange * 2)) * radarCanvas.width;
    const v = ((wz - mapCenter.z + mapRange) / (mapRange * 2)) * radarCanvas.height;
    return { u, v };
  }
  function radarToWorld(u, v) {
    const wx = (u / radarCanvas.width) * (mapRange * 2) - mapRange + mapCenter.x;
    const wz = (v / radarCanvas.height) * (mapRange * 2) - mapRange + mapCenter.z;
    return { wx, wz };
  }

  const fallingObjects = [];

  function spawnObject(wx, wz) {
    let mesh;
    // r064: 実機カタログ全幅/全高[m](コマツPC60=0.25/PC120=0.45/PC200=0.7/PC350=1.2)
    // r065(20回目引継ぎ・マスター提供の実寸図面): ミニBHはマスターが提示した
    // 寸法図(全幅1450mm/全高2343mm)の実測値に直接合わせる。前回の推定値(0.9m/2.2m)
    // より全幅がだいぶ広い(1t未満級ではなく、1.5〜2t級相当の図面と思われる)。
    if (currentType === 'bh_mini') mesh = createBackhoe(1.45, 2.343, false);
    else if (currentType === 'bh_025') mesh = createBackhoe(2.225, 2.59);
    else if (currentType === 'bh_045') mesh = createBackhoe(2.49, 2.715);
    else if (currentType === 'bh_07') mesh = createBackhoe(2.80, 3.04);
    else if (currentType === 'bh_12') mesh = createBackhoe(3.19, 3.28);
    // r064: 実機カタログ全幅/全高[m](コマツD31PX=8t、D51PX=13t、D65PX=20t相当。
    // 13t→20tクラスは実機でも全幅がほぼ変わらない(輸送幅規制で頭打ち)ためそのまま反映)
    else if (currentType === 'bd_08t') mesh = createBulldozer(2.25, 2.80);
    else if (currentType === 'bd_13t') mesh = createBulldozer(2.99, 3.03);
    else if (currentType === 'bd_20t') mesh = createBulldozer(2.99, 3.19);
    else if (currentType === 'dump_4t') mesh = createDump(false);
    else if (currentType === 'dump_10t') mesh = createDump(true);
    else if (currentType === 'mx_10t') mesh = createMixerTruck();
    else if (currentType === 'cp_10t') mesh = createPumpTruck();
    else if (currentType === 'arrow') mesh = createArrowMesh();
    else if (currentType === 'scaffold') { // r128: 足場(テスト機能)
      mesh = createScaffoldMesh(parseInt(scaffoldParams.steps, 10) || 1, parseInt(scaffoldParams.spans, 10) || 1, parseFloat(scaffoldParams.width) || 0.9);
    }
    else if (currentType === 'custom_box') {
      const bw = parseFloat(boxParams.boxW) || 1.0;
      const bd = parseFloat(boxParams.boxD) || 1.0;
      const bh = parseFloat(boxParams.boxH) || 1.0;
      mesh = createCustomBoxMesh(bw, bd, bh, boxColor);
    }
    else if (currentType.startsWith('rt_') || currentType === 'cr_80t') {
      if (currentType === 'cr_80t') mesh = createCrawlerCrane();
      else mesh = createRoughTerrainCrane(currentType);
    }
    else if (currentType === 'worker') mesh = createWorker(false);
    else if (currentType === 'guard') mesh = createWorker(true);
    else if (currentType === 'conebar') mesh = createConeBar();

    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });

    mesh.position.set(wx, 50, wz); 
    mesh.userData = { isRoot: true, type: currentType, color: getTypeColor(currentType), yaw: 0, isFallen: false, radiusValue: 0, isPlaced: false };
    if(currentType === 'scaffold'){ // r128
      mesh.userData.scfSteps = parseInt(scaffoldParams.steps, 10) || 1;
      mesh.userData.scfSpans = parseInt(scaffoldParams.spans, 10) || 1;
      mesh.userData.scfWidth = parseFloat(scaffoldParams.width) || 0.9;
    }
    if(currentType === 'custom_box'){
      mesh.userData.boxW = parseFloat(boxParams.boxW) || 1.0;
      mesh.userData.boxD = parseFloat(boxParams.boxD) || 1.0;
      mesh.userData.boxH = parseFloat(boxParams.boxH) || 1.0;
      mesh.userData.boxColor = boxColor;
    }
    
    if (currentType !== 'text_balloon' && currentType !== 'line' && currentType !== 'arrow' && currentType !== 'scaffold') { // r128: 足場は透かし表示なので縁取り線を付けない
      addEdgeLines(mesh);
    }

    scene.add(mesh);
    placedObjects.push(mesh);

    fallRaycaster.set(new THREE.Vector3(wx, 100, wz), new THREE.Vector3(0, -1, 0));
    const intersects = fallRaycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);

    let targetY = -Infinity;
    let normal = new THREE.Vector3(0, 1, 0); 

    if (intersects.length > 0) {
      targetY = intersects[0].point.y;
      normal = intersects[0].face.normal.clone();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[0].object.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();
    }

    fallingObjects.push({ mesh: mesh, targetY: targetY, normal: normal, speed: 0, isBouncing: false, vx: 0, vz: 0 });
  }

  radarCanvas.addEventListener('mousedown', e => {
    if (!currentType) return; 
    const rect = radarCanvas.getBoundingClientRect();
    const u = e.clientX - rect.left;
    const v = e.clientY - rect.top;
    const { wx, wz } = radarToWorld(u, v);
    
    if (currentType === 'line') {
      fallRaycaster.set(new THREE.Vector3(wx, 100, wz), new THREE.Vector3(0, -1, 0));
      const hits = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
      if (hits.length > 0) {
        // r025: 始点付近クリックで線を閉じて終了（マスター指示）
        if (currentLinePoints.length >= 2 && hits[0].point.distanceTo(currentLinePoints[0]) < LINE_CLOSE_DIST) {
          currentLinePoints.push(currentLinePoints[0].clone());
          updateCurrentLineMesh();
          finishLine();
          return;
        }
        currentLinePoints.push(hits[0].point);
        if (currentLinePoints.length === 1) {
          document.getElementById('placement-msg-text').innerText = "次の点をクリックしてください";
          document.getElementById('placement-msg-sub').innerText = "（右クリックで1つ戻る）";
          document.getElementById('finish-line-btn').style.display = "inline-block";
        }
        updateCurrentLineMesh();
      }
    } else if (currentType !== 'kotai' && currentType !== 'h_pile' && currentType !== 'text_balloon' && currentType !== 'custom_box_input' && currentType !== 'scaffold_input') {
      spawnObject(wx, wz);
      exitPlacementMode(); 
    }
  });

  // ==========================================
  // ★ r062: 鋼材柱 (H鋼杭)
  // ==========================================
  // 標準的なH形鋼の断面(300x300、フランジ厚15mm、ウェブ厚10mmを想定)を
  // アウトライン1本(穴なし)で表現し、縦方向(Y軸)に押し出す。

  const HPILE_TOP_Y = 0.4; // r062: 鋼材柱の天端固定値(GL+0.4)。配置時・ドラッグ移動後・復元時で共有

  function placeHPile(wx, wz) {
    const topY = HPILE_TOP_Y;
    const heightM = topY - terrainMinY;
    if (heightM <= 0) { showToast('⚠️ 地形の高さが不正なため鋼材柱を配置できません'); return; }
    const mesh = createHPileMesh(heightM);
    mesh.position.set(wx, topY, wz);
    mesh.userData = { isRoot: true, type: 'h_pile', yaw: 0, isFallen: true, radiusValue: 0, isPlaced: true, heightM, color: '#8d6e63' };
    addEdgeLines(mesh);
    scene.add(mesh);
    placedObjects.push(mesh);
    renderer.shadowMap.needsUpdate = true;
  }

  // r064: 鋼材柱は3Dビューを直接クリックして配置する(PLAN-VIEW/レーダー配置は廃止)。
  // クリック位置は常に地形(terrainMeshes)へのレイキャストで取得する(構台があっても
  // 構台面ではなく実際の地面位置に設置するため、_getFloorMeshes()は使わない)。
  // 正確なポイント選択のためカーソルをクロスヘアに変更する。
  function _hpileOnPointerDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const m = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(m, camera);
    const hits = rc.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
    if (!hits.length) return;
    placeHPile(hits[0].point.x, hits[0].point.z);
    exitPlacementMode();
  }
  function _hpileEnter() {
    renderer.domElement.style.cursor = 'crosshair';
    renderer.domElement.addEventListener('pointerdown', _hpileOnPointerDown);
  }
  function _hpileExit() {
    renderer.domElement.style.cursor = '';
    renderer.domElement.removeEventListener('pointerdown', _hpileOnPointerDown);
  }

  // ==========================================
  // ★ r062: 構台（真上カメラ + 多角形描画 → 厚み0.4m/天端+1mの3Dオブジェクト化）
  // ==========================================
  let kotaiPoints = [];
  let kotaiPreviewMesh = null;
  let kotaiPointMarkers = [];
  let _kotaiSavedCam = null; // { pos, target }
  const KOTAI_TOP_Y = 0.4;   // 天端 GL+0.4m
  const KOTAI_THICK = 0.4;   // 厚み0.4m
  const kotaiGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y=0(GL)平面

  function _kotaiRaycastGround(clientX, clientY) {
    const m = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(m, camera);
    const pt = new THREE.Vector3();
    const hit = rc.ray.intersectPlane(kotaiGroundPlane, pt);
    return hit ? pt : null;
  }

  // r064: 旧・角度スナップ(_kotaiApplyOrtho、15°/90°+1m距離丸め)を廃止。
  // 1m単位の距離スナップだと斜め線を引いた後に始点へぴったり戻れない不具合が
  // あったため(角度と距離を独立に丸めると座標が無理数的にズレる)、根本的に
  // 「0.5mグリッド上の格子点しか置けない」方式に変更した。
  // 直前点からの移動方向は、以下の4系統・計16方向(各系統を4象限に展開)のみ許可する:
  //   ・縦横(カーディナル)  : (du,dv)=(±1,0)/(0,±1)
  //   ・縦1×横1 = 45°      : (du,dv)=(±1,±1)
  //   ・縦2×横1 = 63.434949°: (du,dv)=(±1,±2)
  //   ・縦1×横2 = 26.565051°: (du,dv)=(±2,±1)
  // du,dvは0.5m単位のセル数。原点は最初にクリックした点(kotaiPoints[0])で、
  // 各点は直前点からセル単位の整数移動しかしないため、原点からの相対座標は
  // 常に0.5mグリッドの格子点に厳密に一致する(始点へのぴったり復帰を保証)。
  const KOTAI_GRID = 0.5; // 1m→0.5mに変更(マスター指示)
  const KOTAI_DIRS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],       // 縦横
    [1, 1], [1, -1], [-1, 1], [-1, -1],     // 45度
    [1, 2], [1, -2], [-1, 2], [-1, -2],     // 63.434949度
    [2, 1], [2, -1], [-2, 1], [-2, -1],     // 26.565051度
  ];
  function _kotaiApplyGridSnap(prevPt, pt) {
    const rawDu = (pt.x - prevPt.x) / KOTAI_GRID;
    const rawDv = (pt.z - prevPt.z) / KOTAI_GRID;
    if (Math.hypot(rawDu, rawDv) < 1e-6) return prevPt.clone();
    const rawAngle = Math.atan2(rawDv, rawDu);
    let best = KOTAI_DIRS[0], bestDiff = Infinity;
    for (const dir of KOTAI_DIRS) {
      const angle = Math.atan2(dir[1], dir[0]);
      let diff = Math.abs(rawAngle - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) { bestDiff = diff; best = dir; }
    }
    const [du, dv] = best;
    let k = Math.round((rawDu * du + rawDv * dv) / (du * du + dv * dv));
    if (k < 1) k = 1; // 0長を避け、最低1マスは進む
    return new THREE.Vector3(prevPt.x + du * k * KOTAI_GRID, 0, prevPt.z + dv * k * KOTAI_GRID);
  }

  let _kotaiCamCenter = null; // {x,z} 現在の注視点(パンで移動)
  let _kotaiCamHeight = 20;   // 現在のカメラ高さ(ホイールでズーム)
  let _kotaiPanning = false;
  let _kotaiPanLast = null;

  function enterKotaiMode() {
    kotaiPoints = [];
    _kotaiSavedCam = { pos: camera.position.clone(), target: controls.target.clone() };
    controls.enabled = false;
    // r051マスター指摘対応: 拡張範囲(customGround)込みのmapRangeではなく、
    // 元のオブジェクト(地形)自体の範囲(kotaiFitRange)だけを見渡す高さにする
    _kotaiCamHeight = Math.max(kotaiFitRange * 2.2, 8);
    _kotaiCamCenter = { x: mapCenter.x, z: mapCenter.z };
    camera.up.set(0, 0, -1);
    _kotaiApplyCamera();

    renderer.domElement.addEventListener('pointerdown', _kotaiOnPointerDown);
    renderer.domElement.addEventListener('pointermove', _kotaiOnPointerMove);
    renderer.domElement.addEventListener('pointerup', _kotaiOnPointerUp);
    renderer.domElement.addEventListener('dblclick', _kotaiOnDblClick);
    renderer.domElement.addEventListener('wheel', _kotaiOnWheel, { passive: false });
    window.addEventListener('keydown', _kotaiOnKeyDown);
  }

  function _kotaiApplyCamera() {
    camera.position.set(_kotaiCamCenter.x, _kotaiCamHeight, _kotaiCamCenter.z);
    camera.lookAt(_kotaiCamCenter.x, 0, _kotaiCamCenter.z);
  }

  function _kotaiOnWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    _kotaiCamHeight = Math.min(Math.max(_kotaiCamHeight * factor, 3), mapRange * 8);
    _kotaiApplyCamera();
  }

  function _kotaiCleanupListeners() {
    renderer.domElement.removeEventListener('pointerdown', _kotaiOnPointerDown);
    renderer.domElement.removeEventListener('pointermove', _kotaiOnPointerMove);
    renderer.domElement.removeEventListener('pointerup', _kotaiOnPointerUp);
    renderer.domElement.removeEventListener('dblclick', _kotaiOnDblClick);
    renderer.domElement.removeEventListener('wheel', _kotaiOnWheel);
    window.removeEventListener('keydown', _kotaiOnKeyDown);
    _kotaiPanning = false;
    _kotaiPanLast = null;
  }

  function _kotaiRestoreCamera() {
    if (_kotaiSavedCam) {
      camera.position.copy(_kotaiSavedCam.pos);
      camera.up.set(0, 1, 0);
      controls.target.copy(_kotaiSavedCam.target);
      controls.update();
      _kotaiSavedCam = null;
    }
    controls.enabled = true;
  }

  function _kotaiClearPreview() {
    if (kotaiPreviewMesh) { scene.remove(kotaiPreviewMesh); kotaiPreviewMesh = null; }
    kotaiPointMarkers.forEach(m => scene.remove(m));
    kotaiPointMarkers = [];
  }

  function _kotaiAddPointMarker(pt) {
    const geo = new THREE.SphereGeometry(0.35, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb300 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pt).setY(0.05);
    m.raycast = function(){};
    scene.add(m);
    kotaiPointMarkers.push(m);
  }

  function _kotaiUpdatePreviewLine(hoverPt) {
    if (kotaiPreviewMesh) { scene.remove(kotaiPreviewMesh); kotaiPreviewMesh = null; }
    if (kotaiPoints.length === 0) return;
    const pts = kotaiPoints.map(p => new THREE.Vector3(p.x, 0.05, p.z));
    if (hoverPt) pts.push(new THREE.Vector3(hoverPt.x, 0.05, hoverPt.z));
    if (pts.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffb300, linewidth: 2 });
    kotaiPreviewMesh = new THREE.Line(geo, mat);
    kotaiPreviewMesh.raycast = function(){};
    scene.add(kotaiPreviewMesh);
  }

  function _kotaiOnPointerDown(e) {
    e.stopPropagation();
    if (e.button === 1) { e.preventDefault(); _kotaiPanning = true; _kotaiPanLast = { x: e.clientX, y: e.clientY }; return; }
    if (e.button === 2) { _kotaiShowExitConfirm(); return; }
    if (e.button !== 0) return;
    let pt = _kotaiRaycastGround(e.clientX, e.clientY);
    if (!pt) return;
    if (kotaiPoints.length > 0) {
      pt = _kotaiApplyGridSnap(kotaiPoints[kotaiPoints.length - 1], pt);
    }
    // 始点付近クリックで閉じる
    if (kotaiPoints.length >= 4 && pt.distanceTo(kotaiPoints[0]) < LINE_CLOSE_DIST) {
      finishKotai();
      return;
    }
    kotaiPoints.push(pt);
    _kotaiAddPointMarker(pt);
    _kotaiUpdatePreviewLine(null);
  }

  function _kotaiOnPointerMove(e) {
    if (_kotaiPanning) {
      // レイキャストベースでドラッグ量をワールド座標に変換(カメラ向きに依存しない安全な方式)
      const oldGround = _kotaiRaycastGround(_kotaiPanLast.x, _kotaiPanLast.y);
      const newGround = _kotaiRaycastGround(e.clientX, e.clientY);
      if (oldGround && newGround) {
        _kotaiCamCenter.x -= (newGround.x - oldGround.x);
        _kotaiCamCenter.z -= (newGround.z - oldGround.z);
        _kotaiApplyCamera();
      }
      _kotaiPanLast = { x: e.clientX, y: e.clientY };
      return;
    }
    if (kotaiPoints.length === 0) return;
    let pt = _kotaiRaycastGround(e.clientX, e.clientY);
    if (!pt) return;
    if (kotaiPoints.length > 0) pt = _kotaiApplyGridSnap(kotaiPoints[kotaiPoints.length - 1], pt);
    _kotaiUpdatePreviewLine(pt);
  }

  function _kotaiOnPointerUp(e) {
    if (e.button === 1) { _kotaiPanning = false; _kotaiPanLast = null; }
  }

  function _kotaiOnDblClick(e) {
    e.stopPropagation();
    if (kotaiPoints.length >= 4) finishKotai();
  }

  function _kotaiOnKeyDown(e) {
    if (e.key === 'Escape') {
      // r060(20回目引継ぎ③B修正): 確認ダイアログ表示中にEscを押すと、ダイアログは
      // 開いたままなのにexitPlacementMode()だけ実行されてしまい、その後Y/Nどちらを
      // 押しても構台作図がすでに終了済みという不具合があった。ダイアログ表示中は
      // 「いいえ」ボタンと同じ扱い(ダイアログを閉じてコールバックを破棄するのみ)にし、
      // exitPlacementMode()は呼ばない。
      const overlay = document.getElementById('kotai-confirm-overlay');
      if (overlay && overlay.style.display !== 'none') {
        overlay.style.display = 'none';
        _kotaiConfirmCallback = null;
        return;
      }
      exitPlacementMode();
    }
  }

  let _kotaiConfirmCallback = null;
  function _kotaiShowConfirm(msg, onYes) {
    document.getElementById('kotai-confirm-msg').textContent = msg;
    _kotaiConfirmCallback = onYes;
    document.getElementById('kotai-confirm-overlay').style.display = 'flex';
  }
  function _kotaiShowExitConfirm() {
    _kotaiShowConfirm('構台作図を終了しますか？', finishKotai);
  }

  function deleteKotaiMesh(mesh) {
    scene.remove(mesh);
    mesh.traverse(c => {
      if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); }
      if (c.isLineSegments) { c.geometry.dispose(); c.material.dispose(); }
    });
    const pi = placedObjects.indexOf(mesh);
    if (pi >= 0) placedObjects.splice(pi, 1);
    const ki = kotaiMeshes.indexOf(mesh);
    if (ki >= 0) kotaiMeshes.splice(ki, 1);
    renderer.shadowMap.needsUpdate = true; // r062: 削除後、影が残ったままになる問題の対策
    _kotaiUpdateToggleBtn();
    showToast('🗑️ 構台を削除しました');
  }

  function _kotaiUpdateToggleBtn() {
    const btn = document.getElementById('kotai-toggle-btn');
    if (!btn) return;
    if (kotaiMeshes.length === 0) { btn.style.display = 'none'; return; }
    btn.style.display = 'inline-block';
    btn.textContent = kotaiVisible ? '🏗️ 構台 表示中' : '🏗️ 構台 非表示中';
  }
  function _boxIntersectsAnyKotai(obj) {
    obj.updateMatrixWorld(true);
    const objBox = getBoundingBox(obj);
    return kotaiMeshes.some(km => {
      km.updateMatrixWorld(true);
      return objBox.intersectsBox(getBoundingBox(km));
    });
  }

  document.getElementById('kotai-toggle-btn').addEventListener('click', () => {
    if (!kotaiVisible) {
      // r065: 再表示前に、構台と実際にバウンディングボックスが重なるオブジェクトが
      // ないか確認する(鋼材柱は貫通する前提のため対象外)。配置時にresolveKotaiOverlapで
      // 先回り回避しているため、通常はここに引っかからない想定の最終安全策。
      const blocking = placedObjects.some(o =>
        o.userData.type !== 'kotai' && o.userData.type !== 'h_pile' && o.userData.isPlaced &&
        _boxIntersectsAnyKotai(o)
      );
      if (blocking) {
        showToast('⚠️ オブジェクトに当たるため、構台を表示できません');
        return;
      }
      kotaiVisible = true;
      kotaiMeshes.forEach(m => { m.visible = true; });
    } else {
      kotaiVisible = false;
      kotaiMeshes.forEach(m => { m.visible = false; });
      // r065: 構台の上に乗っていたオブジェクトは当たり判定を失うので地形へ落下させる
      placedObjects.forEach(o => {
        if (o.userData.type === 'kotai' || o.userData.type === 'h_pile' || !o.userData.isPlaced) return;
        if (!_boxIntersectsAnyKotai(o)) return;
        fallRaycaster.set(new THREE.Vector3(o.position.x, 100, o.position.z), new THREE.Vector3(0, -1, 0));
        const hits = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
        if (hits.length) {
          o.userData.isPlaced = false;
          fallingObjects.push({ mesh: o, targetY: hits[0].point.y, normal: new THREE.Vector3(0, 1, 0), speed: 0, isBouncing: false, vx: 0, vz: 0 });
        }
      });
    }
    renderer.shadowMap.needsUpdate = true; // r062: 表示/非表示切替直後に影が更新されない問題の対策
    _kotaiUpdateToggleBtn();
  });


  // r064: 自己交差など「表示に問題が出る形状」の検出。ClipperLib等の外部ライブラリを
  // 使わず、非隣接エッジ同士の単純な線分交差判定(CCW法)で十分実用的に検出できる。
  function _segmentsProperlyIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) { return (c.z - a.z) * (b.x - a.x) - (b.z - a.z) * (c.x - a.x); }
    const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function _kotaiPolygonSelfIntersects(points) {
    const n = points.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const a1 = points[i], a2 = points[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue; // 隣接エッジ(頂点共有)は除外
        const b1 = points[j], b2 = points[(j + 1) % n];
        if (_segmentsProperlyIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  function _buildKotaiMesh(points) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].z);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].z);
    shape.lineTo(points[0].x, points[0].z);

    const geo = new THREE.ExtrudeGeometry(shape, { depth: KOTAI_THICK, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); // z=0面(輪郭)がy=0、z=KOTAI_THICK面がy=-KOTAI_THICK
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = KOTAI_TOP_Y; // 輪郭(y=0)がKOTAI_TOP_Yに来る→天端がKOTAI_TOP_Y、下端がKOTAI_TOP_Y-KOTAI_THICK
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      isRoot: true, type: 'kotai', yaw: 0, isFallen: true, radiusValue: 0, isPlaced: true,
      color: '#78909c', kotaiPoints: points.map(p => ({ x: p.x, z: p.z }))
    };
    addEdgeLines(mesh);
    scene.add(mesh);
    placedObjects.push(mesh);
    kotaiMeshes.push(mesh); // r063: 配置先レイキャストを構台に一本化するための登録
    renderer.shadowMap.needsUpdate = true;
    _kotaiUpdateToggleBtn();
  }

  function finishKotai() {
    if (kotaiPoints.length < 4) {
      // r066: 点が3つ以下の状態で「終了しますか？」にYesした場合、従来は
      // 何もせず放置され(placement modeに閉じ込められる)ループの一因になっていた。
      // 作れる形状が無いのだから、素直に配置モードを抜ける。
      kotaiPoints = [];
      _kotaiClearPreview();
      exitPlacementMode();
      return;
    }
    // r066(マスター指摘): 自己交差形状のまま頂点を残していると、右クリック→
    // 「終了しますか？」→Yes→finishKotai()→異常形状で弾かれる→まだ終了扱いに
    // ならず点も残る…という抜け出せないループになっていた。異常形状を検出したら
    // 作図中のライン・頂点マーカーをその場で消去し、すぐにやり直せる状態にする。
    if (_kotaiPolygonSelfIntersects(kotaiPoints)) {
      showToast('⚠️ この形状は作図出来ません（線をやり直してください）');
      kotaiPoints = [];
      _kotaiClearPreview();
      return;
    }
    _buildKotaiMesh(kotaiPoints);
    exitPlacementMode();
  }

  document.getElementById('kotai-confirm-yes').addEventListener('click', () => {
    document.getElementById('kotai-confirm-overlay').style.display = 'none';
    const cb = _kotaiConfirmCallback; _kotaiConfirmCallback = null;
    if (cb) cb();
  });
  document.getElementById('kotai-confirm-no').addEventListener('click', () => {
    document.getElementById('kotai-confirm-overlay').style.display = 'none';
    _kotaiConfirmCallback = null;
  });

  function getTypeColor(type) {
    if (!type) return '#ffffff';
    if (type === 'line') return '#f1c40f'; 
    if (type.startsWith('bh_')) return '#f39c12';
    if (type.startsWith('bd_')) return '#f39c12';
    if (type.startsWith('dump_')) return '#bdc3c7';
    if (type.startsWith('rt_') || type === 'cr_80t') return '#1f5c87';
    if (type === 'custom_box') return '#' + boxColor.toString(16).padStart(6, '0');
    if (type === 'scaffold') return '#aab2b9'; // r128: 足場(銀灰色)
    if (type === 'arrow') return '#ff0000';
    if (type === 'text_balloon') return '#ffffff'; 
    if (type === 'worker') return '#2e7d32'; 
    if (type === 'guard') return '#1565c0'; 
    if (type === 'conebar') return '#e74c3c'; 
    if (type === 'h_pile') return '#8d6e63';
    return '#ffffff'; 
  }

  // ==========================================
  // 5. ドラッグ移動 ＆ クリック回転 ＆ モード分離
  // ==========================================
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  let dragObj = null;
  let dragOffset = new THREE.Vector3();
  let isDragging = false;
  let pointerDownPos = { x: 0, y: 0 };
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 

  function updateOrientation(obj) {
    if (obj.userData.type === 'text_balloon') {
      return; 
    }
    // r131(マスター要望): 足場は地形が傾斜していても傾けない(常に鉛直。回転は向き(yaw)だけ)。他の設置物は従来どおり地形の傾きに追従。
    const n = (obj.userData.type === 'scaffold') ? new THREE.Vector3(0, 1, 0) : (obj.userData.normal || new THREE.Vector3(0, 1, 0));
    const yaw = obj.userData.yaw || 0;
    const qNormal = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    obj.quaternion.copy(qNormal).multiply(qYaw);
  }

  window.addEventListener('dblclick', e => {
    if (currentType) return; 
    
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    // ★ コメントと矢印のダブルクリック判定（サイズ拡大）
    const objHits = raycaster.intersectObjects(placedObjects, true).filter(h => h.object.isMesh || h.object.isSprite);
    if (objHits.length > 0) {
      let obj = objHits[0].object;
      while (obj && !obj.userData.isRoot) { obj = obj.parent; }
      if (obj) {
        if (obj.userData.type === 'kotai') {
          _kotaiShowConfirm('構台を削除しますか？', () => deleteKotaiMesh(obj));
          return;
        } else if (obj.userData.type === 'arrow') {
          let upper = null;
          obj.traverse(c => { if (c.userData.isUpper) upper = c; });
          if (upper) {
            let currentM = obj.userData.scaleMultiplier || 1;
            currentM = (currentM % 3) + 1;
            obj.userData.scaleMultiplier = currentM;
            upper.scale.set(currentM, currentM, currentM);
            // r011: upperGroupはローカル原点(headRadius=0.7だけ下に張り出した
            // 円錐形状の中心)を基準に拡大されるため、倍率を上げるほど矢印の
            // 下端がポール高さ(1.0)より下、最悪地面下まで沈む
            // （headRadius×倍率が沈み込み量）。ポール高さはそのままに、
            // 沈んだ分だけ上に持ち上げて元の見た目の高さを維持する。
            const ARROW_HEAD_RADIUS = 0.7; // createArrowMesh()のheadRadiusと同じ値
            upper.position.y = 1.0 + (currentM - 1) * ARROW_HEAD_RADIUS;
          }
          renderer.shadowMap.needsUpdate = true;
          return; 
        } else if (obj.userData.type === 'text_balloon') {
          obj.children.forEach(child => {
            if (child.userData.isBillboard) {
              child.userData.scaleMultiplier = (child.userData.scaleMultiplier % 3) + 1;
              const m = child.userData.scaleMultiplier;
              child.scale.set(m, m, 1);
            }
          });
          renderer.shadowMap.needsUpdate = true;
          return;
        }
      }
    }

    for (const fenceGroup of fenceLines) {
      const hits = raycaster.intersectObjects(fenceGroup.children, true);
      if (hits.length > 0) {
        fenceToDelete = fenceGroup;
        document.getElementById('custom-confirm-overlay').style.display = 'flex';
        controls.enabled = false;
        break;
      }
    }
  });

  window.addEventListener('pointerdown', e => {
    pointerDownPos = { x: e.clientX, y: e.clientY };

    if (e.target.tagName !== 'CANVAS' || e.target.id === 'radar-canvas') return;
    if (document.getElementById('numpad-ui').style.display === 'block') return; 
    if (document.getElementById('custom-confirm-overlay').style.display === 'flex') return; 
    if (document.getElementById('text-input-ui').style.display === 'block') return; 
    if (document.getElementById('box-input-ui').style.display === 'block') return;
    if (_scfIsOpen()) return; // r128: 足場ダイアログ中
    
    if (e.button !== 0 && e.button !== 2) return; 

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    if (e.button === 2) {
      if (currentType === 'line') {
        controls.enabled = false; 
        if (currentLinePoints.length > 0) {
          currentLinePoints.pop();
          updateCurrentLineMesh();
          if (currentLinePoints.length === 0) {
            document.getElementById('placement-msg-text').innerText = "1点目をクリックしてください";
            document.getElementById('placement-msg-sub').innerText = "（右クリックでキャンセル）";
            document.getElementById('finish-line-btn').style.display = "none";
            if(previewLineMesh) { scene.remove(previewLineMesh); previewLineMesh = null; }
          } else {
            raycaster.setFromCamera(mouse, camera);
            const terrainHits = raycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);
            if (terrainHits.length > 0) {
              updatePreviewLine(terrainHits[0].point);
            }
          }
        } else {
          exitPlacementMode();
        }
        return;
      } else if (currentType) {
        controls.enabled = false; 
        exitPlacementMode(); 
        return;
      } else {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(placedObjects, true).filter(h => h.object.isMesh || h.object.isSprite);
        if (intersects.length > 0) {
          let obj = intersects[0].object;
          while (obj && !obj.userData.isRoot) { obj = obj.parent; }
          if (obj && (obj.userData.type.startsWith('rt_') || obj.userData.type === 'cr_80t')) {
            controls.enabled = false; 
            if (obj.userData.isFallen) {
              showToast('⚠️ クレーンが傾いているため作業半径を設定できません');
              controls.enabled = true; 
            } else {
              openNumpad(obj);
            }
            return;
          } else if (obj && obj.userData.type === 'text_balloon') {
            // r025: 吹き出し右クリック編集（既存分岐に無かったため未実装だった）
            controls.enabled = false;
            editingBalloonObj = obj;
            document.getElementById('text-input-area').value = obj.userData.text || '';
            document.getElementById('text-input-ui').style.display = 'block';
            setTimeout(() => document.getElementById('text-input-area').focus(), 10);
            return;
          }
        }
      }
    }

    if (e.button === 0 && !currentType) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(placedObjects, true).filter(h => h.object.isMesh || h.object.isSprite);
      if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        let isBoom = hitObj.userData.isBoom === true || hitObj.userData.isDragMarker === true;

        let obj = hitObj;
        let upper = null;
        while (obj && !obj.userData.isRoot) {
          if (obj.userData.isUpper) upper = obj;
          obj = obj.parent;
        }
        if (obj && obj.userData.type !== 'kotai') {
          dragObj = obj; isDragging = false; controls.enabled = false;

          if (hitObj.userData.isDragMarker && upper) {
            dragObj.userData.isBoomDragging = true;
            dragObj.userData.dragUpper = upper;
            dragPlane.constant = -obj.position.y;
            
            upper.traverse(c => {
              if (c.userData.isDragMarker) {
                c.scale.set(1.5, 1.5, 1.5);
                c.material.color.setHex(0xff3333);
              }
            });
          } else if (isBoom && upper && obj.userData.type !== 'arrow') { 
            dragObj.userData.isBoomDragging = true;
            dragObj.userData.dragUpper = upper;
            dragPlane.constant = -obj.position.y;
            
            upper.traverse(c => {
              if (c.userData.isDragMarker) {
                c.scale.set(1.5, 1.5, 1.5);
                c.material.color.setHex(0xff3333);
              }
            });
          } else {
            dragObj.userData.isBoomDragging = false;
            dragObj.userData.isPlaced = false;
            dragPlane.constant = -obj.position.y;
            const intersectPt = new THREE.Vector3();
            raycaster.ray.intersectPlane(dragPlane, intersectPt);
            if (intersectPt) { dragOffset.copy(intersectPt).sub(obj.position); }
          }
        }
      }
    }
  });

  let _lastPointerClientX = 0, _lastPointerClientY = 0; // [FIX 19回目] clientX権限エラー対策の退避用
  window.addEventListener('pointermove', e => {
    // [FIX 19回目 2026-08-30] file://運用時にFirefoxで稀に発生する
    // 「Permission denied to access property "clientX"」への対策。
    // 直前は無防備にe.clientXへアクセスしていたため、これがUncaughtで
    // 投げられるとこのリスナーの残り処理(以降のドラッグ配置操作など)が
    // 丸ごと止まっていた。取得に失敗したら直前の座標を使い回して継続する。
    let cx, cy;
    try { cx = e.clientX; cy = e.clientY; }
    catch(permErr) { cx = _lastPointerClientX; cy = _lastPointerClientY; console.warn('[FIX] pointermoveでclientX/Y取得に失敗。直前座標で継続します。', permErr); }
    _lastPointerClientX = cx; _lastPointerClientY = cy;
    mouse.x = (cx / window.innerWidth) * 2 - 1;
    mouse.y = -(cy / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const terrainHits = raycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);

    // r073(21回目引継ぎ・マスター要望「構台にマウスオーバーで削除方法を表示」):
    // 作図中(currentTypeあり)やドラッグ中は誤解を招くため対象外。構台の上に
    // カーソルが乗っている間だけ、カーソル追従で操作方法を案内する。
    const kotaiDeleteTip = document.getElementById('kotai-delete-tip');
    if (!currentType && !dragObj && kotaiMeshes.length > 0 && kotaiVisible && terrainHits.length > 0 && kotaiMeshes.includes(terrainHits[0].object)) {
      kotaiDeleteTip.style.display = 'block';
      kotaiDeleteTip.style.left = (cx + 14) + 'px';
      kotaiDeleteTip.style.top = (cy - 28) + 'px';
    } else {
      kotaiDeleteTip.style.display = 'none';
    }

    if (currentType === 'line' && currentLinePoints.length > 0) {
      if (terrainHits.length > 0) {
        // r025: 始点(currentLinePoints[0])付近なら、閉じる候補としてスナップ＋ツールチップ表示
        const closeTip = document.getElementById('line-close-tip');
        if (currentLinePoints.length >= 2 && terrainHits[0].point.distanceTo(currentLinePoints[0]) < LINE_CLOSE_DIST) {
          _lineCloseHover = true;
          updatePreviewLine(currentLinePoints[0]); // 始点にスナップした線を表示
          closeTip.style.display = 'block';
          closeTip.style.left = (cx + 14) + 'px';
          closeTip.style.top = (cy - 28) + 'px';
        } else {
          _lineCloseHover = false;
          closeTip.style.display = 'none';
          updatePreviewLine(terrainHits[0].point);
        }
      }
    } else if (previewLineMesh) {
      scene.remove(previewLineMesh);
      previewLineMesh = null;
      _lineCloseHover = false;
      document.getElementById('line-close-tip').style.display = 'none';
    }

    if (currentType && !dragObj && currentType !== 'text_balloon' && currentType !== 'arrow' && currentType !== 'custom_box_input' && currentType !== 'scaffold_input' && currentType !== 'kotai') {
      if (terrainHits.length > 0) {
        placementMarker.visible = true;
        placementMarker.position.copy(terrainHits[0].point);
        placementMarker.position.y += 0.2; 
        
        const normal = terrainHits[0].face.normal.clone();
        const nMat = new THREE.Matrix3().getNormalMatrix(terrainHits[0].object.matrixWorld);
        normal.applyMatrix3(nMat).normalize();
        
        const qNormal = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        placementMarker.quaternion.copy(qNormal);
        
        placementMarker.material.color.set(getTypeColor(currentType));
      } else {
        placementMarker.visible = false;
      }
    } else {
      placementMarker.visible = false;
    }

    if (!dragObj) return;

    // r073(21回目引継ぎ・マスター指摘「1372オブジェクト規模で発生」): 上でcx/cyに
    // 退避済みなのに、この行だけe.clientX/e.clientYへ直接再アクセスしていたのが
    // 見落としだった。オブジェクト数が多く1回のイベント処理が重くなるほど、
    // イベントオブジェクトの寿命中に再アクセスして権限エラーになる確率が
    // 上がっていたと考えられる。cx/cyを使うよう統一して修正。
    const dist = Math.hypot(cx - pointerDownPos.x, cy - pointerDownPos.y);
    if (dist > 5) isDragging = true;

    if (isDragging) {
      const intersectPt = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersectPt);
      
      if (intersectPt) {
        if (dragObj.userData.isBoomDragging) {
          const upper = dragObj.userData.dragUpper;
          const localPt = intersectPt.clone().applyMatrix4(new THREE.Matrix4().copy(dragObj.matrixWorld).invert());
          const dx = localPt.x - upper.position.x;
          const dz = localPt.z - upper.position.z;
          upper.rotation.y = Math.atan2(dx, dz);
          renderer.shadowMap.needsUpdate = true; 
          return;
        }

        const newPos = intersectPt.sub(dragOffset);
        
        if (dragObj.userData.type === 'text_balloon') {
          fallRaycaster.set(new THREE.Vector3(newPos.x, 100, newPos.z), new THREE.Vector3(0, -1, 0));
          const targets = [...terrainMeshes, ...placedObjects.filter(o => o !== dragObj && o.userData.type !== 'text_balloon')];
          const hits = fallRaycaster.intersectObjects(targets, true).filter(h => h.object.isMesh && !h.object.userData.isRadiusMesh && !h.object.userData.isBillboard && !h.object.userData.isDragHitbox);
          if (hits.length > 0) {
            newPos.y = hits[0].point.y;
          } else {
            newPos.y = 0;
          }
          dragObj.position.copy(newPos);
        } else if (dragObj.userData.type === 'h_pile') {
          // r062: ドラッグ中プレビューも天端をHPILE_TOP_Y固定のままにする
          // (release時と挙動を揃え、ドラッグ中だけ一瞬地形面まで沈んで見える違和感を防ぐ)
          newPos.y = HPILE_TOP_Y;
          dragObj.position.copy(newPos);
        } else {
          fallRaycaster.set(new THREE.Vector3(newPos.x, 100, newPos.z), new THREE.Vector3(0, -1, 0));
          const hits = fallRaycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);
          
          if (hits.length > 0) {
            newPos.y = hits[0].point.y;
            const normal = hits[0].face.normal.clone();
            const nMat = new THREE.Matrix3().getNormalMatrix(hits[0].object.matrixWorld);
            normal.applyMatrix3(nMat).normalize();
            
            dragObj.userData.normal = normal;
            updateOrientation(dragObj);
          } else {
            newPos.y = 0;
            dragObj.userData.normal = new THREE.Vector3(0, 1, 0);
            updateOrientation(dragObj);
          }
          dragObj.position.copy(newPos);
          checkFallenStatus(dragObj, false);
        }
        renderer.shadowMap.needsUpdate = true; 
      }
    }
  });

  window.addEventListener('pointerup', e => {
    // r051マスター指摘対応: 構台作図中に右クリック(終了確認ダイアログ表示)すると、
    // この汎用処理がcontrols.enabledを無条件でtrueに戻してしまい、以降視点回転が
    // 復活してしまう不具合の修正。構台モード中は対象外にする。
    if (e.button === 2 && currentType !== 'kotai' && !document.getElementById('numpad-ui').style.display.includes('block') && !document.getElementById('custom-confirm-overlay').style.display.includes('flex') && !document.getElementById('text-input-ui').style.display.includes('block') && !document.getElementById('box-input-ui').style.display.includes('block') && !_scfIsOpen()) {
       controls.enabled = true;
    }

    if (!dragObj) {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist < 5 && e.button === 0 && e.target.tagName === 'CANVAS' && e.target.id !== 'radar-canvas') {
        if (currentType) {
          mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
          mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          
          if (currentType === 'text_balloon') {
            const allHits = raycaster.intersectObjects([...placedObjects, ...terrainMeshes], true).filter(h => h.object.isMesh && !h.object.userData.isRadiusMesh && !h.object.userData.isBillboard && !h.object.userData.isDragMarker && !h.object.userData.isDragHitbox);
            if (allHits.length > 0) {
              const hit = allHits[0];
              pendingTextPos = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
              document.getElementById('text-input-area').value = "";
              document.getElementById('text-input-ui').style.display = "block";
              setTimeout(() => document.getElementById('text-input-area').focus(), 10);
              controls.enabled = false;
              return;
            }
          } else if (currentType === 'custom_box_input' || currentType === 'scaffold_input') {
            // ダイアログ操作中のためスキップ
          } else {
            const terrainHits = raycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);
            if (terrainHits.length > 0) {
              if (currentType === 'line') {
                // r025: 始点付近ホバー中のクリックは「閉じる」扱い（マスター指示）
                if (_lineCloseHover && currentLinePoints.length >= 2) {
                  currentLinePoints.push(currentLinePoints[0].clone());
                  updateCurrentLineMesh();
                  document.getElementById('line-close-tip').style.display = 'none';
                  finishLine();
                  return;
                }
                currentLinePoints.push(terrainHits[0].point);
                if (currentLinePoints.length === 1) {
                  document.getElementById('placement-msg-text').innerText = "次の点をクリックしてください";
                  document.getElementById('placement-msg-sub').innerText = "（右クリックで1つ戻る）";
                  document.getElementById('finish-line-btn').style.display = "inline-block";
                }
                updateCurrentLineMesh();
                updatePreviewLine(terrainHits[0].point);
              } else {
                spawnObject(terrainHits[0].point.x, terrainHits[0].point.z);
                exitPlacementMode(); 
              }
            }
          }
        } else {
          mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
          mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const objHits = raycaster.intersectObjects(placedObjects, true).filter(h => h.object.isMesh || h.object.isSprite);
          if (objHits.length > 0) {
            let obj = objHits[0].object;
            while (obj && !obj.userData.isRoot) { obj = obj.parent; }
            if (obj) {
              if (obj.userData.type === 'text_balloon' || obj.userData.type === 'arrow' || obj.userData.type === 'kotai') {
                // シングルクリックによる処理は削除
              } else {
                obj.userData.yaw = (obj.userData.yaw || 0) - Math.PI / 12;
                updateOrientation(obj);
                if (obj.userData.type === 'scaffold') _scfUpdateShadowPosts(obj); // r130
              }
              renderer.shadowMap.needsUpdate = true; 
            }
          }
        }
      }
    }

    if (dragObj) {
      if (dragObj.userData.isBoomDragging) {
        dragObj.userData.dragUpper.traverse(c => {
          if (c.userData.isDragMarker) {
            c.scale.set(1, 1, 1);
            c.material.color.setHex(0x00aaff);
          }
        });

        dragObj.userData.isBoomDragging = false;
        dragObj = null;
        isDragging = false;
        controls.enabled = true;
        renderer.shadowMap.needsUpdate = true; 
        return;
      }
      if (!isDragging && e.button === 0 && !currentType) {
        if (dragObj.userData.type === 'text_balloon' || dragObj.userData.type === 'arrow') {
          // シングルクリックでの処理削除
        } else {
          dragObj.userData.yaw = (dragObj.userData.yaw || 0) - Math.PI / 12;
          updateOrientation(dragObj);
          if (dragObj.userData.type === 'scaffold') _scfUpdateShadowPosts(dragObj); // r130
        }
      }

      if (dragObj.userData.type === 'text_balloon') {
        fallRaycaster.set(new THREE.Vector3(dragObj.position.x, 100, dragObj.position.z), new THREE.Vector3(0, -1, 0));
        const targets = [...terrainMeshes, ...placedObjects.filter(o => o !== dragObj && o.userData.type !== 'text_balloon')];
        const hits = fallRaycaster.intersectObjects(targets, true).filter(h => h.object.isMesh && !h.object.userData.isRadiusMesh && !h.object.userData.isBillboard && !h.object.userData.isDragMarker && !h.object.userData.isDragHitbox);
        if (hits.length === 0) {
          removeObject(dragObj);
          showToast('🗑️ オブジェクトを削除しました');
        } else {
          dragObj.position.y = hits[0].point.y;
          dragObj.userData.isPlaced = true;
        }
      } else if (dragObj.userData.type === 'h_pile') {
        // r062: 鋼材柱は地形/構台の高さに関わらず天端をHPILE_TOP_Y(GL+0.4)に固定する。
        // 以前は他オブジェクトと同じ着地処理(_getFloorMeshesの高さにY座標を合わせる)を
        // 通っていたため、構台が無い場所へドラッグすると天端が実際の地形面まで
        // 下がってしまっていた(根本原因)。鋼材柱は常に垂直固定のため向き(normal)の
        // 再計算・傾き判定(checkFallenStatus)も対象外とする。
        // r066(マスター指摘): 鋼材柱には誤操作時の削除手段が無かったため、地形の
        // 範囲外(地面が無い場所)へドラッグしたら削除する仕様を追加。判定は構台の
        // 有無に関わらず常に地形そのもの(terrainMeshes)で行う(鋼材柱は元々
        // 構台を無視して常に実地形基準、というA3までの設計方針と一貫させるため)。
        fallRaycaster.set(new THREE.Vector3(dragObj.position.x, 100, dragObj.position.z), new THREE.Vector3(0, -1, 0));
        const groundHits = fallRaycaster.intersectObjects(terrainMeshes, true).filter(h => h.object.isMesh);
        if (groundHits.length === 0) {
          removeObject(dragObj);
          showToast('🗑️ オブジェクトを削除しました');
        } else {
          resolveOverlap(dragObj);
          if (!kotaiVisible) resolveKotaiOverlap(dragObj);
          dragObj.position.y = HPILE_TOP_Y;
          dragObj.userData.isPlaced = true;
        }
      } else {
        resolveOverlap(dragObj);
        if (!kotaiVisible) resolveKotaiOverlap(dragObj); // r065: 構台非表示時は再表示時の衝突を先回りで回避

        fallRaycaster.set(new THREE.Vector3(dragObj.position.x, 100, dragObj.position.z), new THREE.Vector3(0, -1, 0));
        const hits = fallRaycaster.intersectObjects(_getFloorMeshes(), true).filter(h => h.object.isMesh);
        
        if (hits.length === 0) {
          removeObject(dragObj);
          showToast('🗑️ オブジェクトを削除しました');
        } else {
          dragObj.position.y = hits[0].point.y;
          const normal = hits[0].face.normal.clone();
          const nMat = new THREE.Matrix3().getNormalMatrix(hits[0].object.matrixWorld);
          normal.applyMatrix3(nMat).normalize();
          dragObj.userData.normal = normal;
          updateOrientation(dragObj);

          dragObj.userData.isPlaced = true; 
          checkFallenStatus(dragObj, true);
          if (dragObj.userData.radiusValue) {
            updateWorkingRadius(dragObj);
          }
        }
      }

      dragObj = null;
      isDragging = false;
      controls.enabled = true; 
      renderer.shadowMap.needsUpdate = true; 
    }
  });

  // ==========================================
  // 6. メインループ
  // ==========================================
  function animate() {
    requestAnimationFrame(animate);

    // r025(マスター指示): 旗が風になびくプルプルギミック。旗布(isFlagCloth)を
    // 微小に回転させるだけの軽量処理（各旗で位相をずらして自然に見せる）
    if (surveyFlags.length > 0) {
      const t = performance.now() * 0.001;
      surveyFlags.forEach((flag, i) => {
        const cloth = flag.children.find(c => c.userData.isFlagCloth);
        if (cloth) {
          const phase = i * 1.7;
          cloth.rotation.y = Math.sin(t * 3 + phase) * 0.12;
          cloth.rotation.z = Math.sin(t * 4.3 + phase) * 0.05;
        }
      });
    }

    // (動作軽量化・23回目): 吹き出し/矢印の「地面が消えて落下すべきか」判定を軽量化。
    // ①元コードは対象オブジェクトごとに毎フレームtargets配列を再構築していたが、
    //   `o !== obj`によるobj自身の除外は、typeフィルタ(text_balloon/arrow除外)が
    //   objの型と一致するため既に成立しており冗長だった → targetsをループの外で
    //   1回だけ構築するよう変更(結果は従来と同一)。
    // ②この判定は「地形/他オブジェクトの支持状況」という低頻度にしか変化しない
    //   状態の監視なので、間引いても体感の遅延は実質ゼロ。毎フレーム→
    //   FALL_CHECK_INTERVAL_FRAMESフレームに1回に変更。
    if ((_animFrameCount % FALL_CHECK_INTERVAL_FRAMES) === 0) {
      let supportTargetsCache = null;
      placedObjects.forEach(obj => {
        if ((obj.userData.type === 'text_balloon' || obj.userData.type === 'arrow') && obj.userData.isPlaced) {
          if (!supportTargetsCache) {
            supportTargetsCache = [...terrainMeshes, ...placedObjects.filter(o => o.userData.type !== 'text_balloon' && o.userData.type !== 'arrow')];
          }
          fallRaycaster.set(new THREE.Vector3(obj.position.x, 100, obj.position.z), new THREE.Vector3(0, -1, 0));
          const hits = fallRaycaster.intersectObjects(supportTargetsCache, true).filter(h => h.object.isMesh && !h.object.userData.isRadiusMesh && !h.object.userData.isBillboard && !h.object.userData.isDragMarker && !h.object.userData.isDragHitbox);
          if (hits.length > 0) {
            const targetY = hits[0].point.y;
            if (obj.position.y > targetY + 0.2) { 
              obj.userData.isPlaced = false;
              fallingObjects.push({ mesh: obj, targetY: targetY, normal: new THREE.Vector3(0,1,0), speed: 0, isBouncing: false, vx: 0, vz: 0 });
            }
          } else {
             if (obj.position.y > -50) {
               obj.userData.isPlaced = false;
               fallingObjects.push({ mesh: obj, targetY: -Infinity, normal: new THREE.Vector3(0,1,0), speed: 0, isBouncing: false, vx: 0, vz: 0 });
             }
          }
        }
      });
    }
    _animFrameCount++;

    if (fallingObjects.length > 0) {
      renderer.shadowMap.needsUpdate = true; 
    }

    for (let i = fallingObjects.length - 1; i >= 0; i--) {
      const drop = fallingObjects[i];
      
      if (drop.isBouncing) {
        drop.speed += 0.2; 
        drop.mesh.position.y -= drop.speed;
        drop.mesh.position.x += drop.vx;
        drop.mesh.position.z += drop.vz;
        drop.mesh.rotation.set(drop.mesh.rotation.x + 0.1, drop.mesh.rotation.y + 0.2, drop.mesh.rotation.z + 0.1);
        
        if (drop.mesh.position.y < -50) {
          removeObject(drop.mesh);
          fallingObjects.splice(i, 1);
        }
        continue;
      }

      drop.speed += 0.2; 
      drop.mesh.position.y -= drop.speed;
      
      if (drop.mesh.userData.type !== 'text_balloon' && drop.mesh.userData.type !== 'arrow') {
        drop.mesh.updateMatrixWorld(true);
        if (checkOverlapSimple(drop.mesh)) {
          drop.isBouncing = true;
          drop.speed = -3; 
          drop.vx = (Math.random() - 0.5) * 2;
          drop.vz = (Math.random() - 0.5) * 2;
          showToast('💥 衝突！オブジェクトが弾かれました');
          continue;
        }
      }
      
      if (drop.targetY !== -Infinity && drop.mesh.position.y <= drop.targetY) {
        drop.mesh.position.y = drop.targetY; 
        
        // r035(マスター指示): 測点フラグは地形が傾斜していても常に鉛直に直立させたい
        // (他の設置物は地形の傾きに追従して傾ける現行仕様のままでOK)。
        if (drop.mesh.userData.type !== 'text_balloon' && drop.mesh.userData.type !== 'arrow' && drop.mesh.userData.type !== 'survey_flag') {
          drop.mesh.userData.normal = drop.normal;
          updateOrientation(drop.mesh);
          
          drop.mesh.updateMatrixWorld(true);
          if (checkOverlapSimple(drop.mesh)) {
            drop.isBouncing = true;
            drop.speed = -3;
            drop.vx = (Math.random() - 0.5) * 2;
            drop.vz = (Math.random() - 0.5) * 2;
            showToast('💥 衝突！オブジェクトが弾かれました');
            continue;
          }
          checkFallenStatus(drop.mesh, true); 
        }

        if (!kotaiVisible) resolveKotaiOverlap(drop.mesh); // r065: 構台非表示時は再表示時の衝突を先回りで回避

        drop.mesh.userData.isPlaced = true; 
        fallingObjects.splice(i, 1); 
      } else if (drop.mesh.position.y < -50) {
        removeObject(drop.mesh);
        fallingObjects.splice(i, 1);
        showToast('🗑️ オブジェクトを削除しました');
      }
    }

    radarCtx.clearRect(0, 0, radarCanvas.width, radarCanvas.height);

    if (terrainEdges2D && terrainEdges2D.length > 0) {
      radarCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      radarCtx.lineWidth = 1;
      radarCtx.beginPath();
      terrainEdges2D.forEach(edge => {
        const p1 = worldToRadar(edge.x1, edge.z1);
        const p2 = worldToRadar(edge.x2, edge.z2);
        radarCtx.moveTo(p1.u, p1.v);
        radarCtx.lineTo(p2.u, p2.v);
      });
      radarCtx.stroke();
    }

    radarCtx.strokeStyle = 'rgba(255,255,255,0.1)'; radarCtx.lineWidth = 1;
    radarCtx.beginPath(); radarCtx.moveTo(108, 0); radarCtx.lineTo(108, 216); radarCtx.stroke();
    radarCtx.beginPath(); radarCtx.moveTo(0, 108); radarCtx.lineTo(216, 108); radarCtx.stroke();

    placedObjects.forEach(obj => {
      if (obj.userData.type === 'text_balloon') {
        obj.children.forEach(child => {
          if (child.userData.isBillboard) {
            child.quaternion.copy(camera.quaternion);
          }
        });
        return; 
      }
      
      let angle = -(obj.userData.yaw || 0);
      if (obj.userData.type === 'arrow') {
        let upper = null;
        obj.traverse(c => { if (c.userData.isUpper) upper = c; });
        if (upper) {
          angle -= upper.rotation.y;
        }
      }

      const pos = worldToRadar(obj.position.x, obj.position.z);
      
      radarCtx.save();
      radarCtx.translate(pos.u, pos.v);
      radarCtx.rotate(angle);
      radarCtx.fillStyle = obj.userData.color;
      radarCtx.fillRect(-4, -4, 8, 8);
      radarCtx.strokeStyle = '#fff'; radarCtx.lineWidth = 2;
      radarCtx.beginPath(); radarCtx.moveTo(0, 0); radarCtx.lineTo(0, -8); radarCtx.stroke();
      radarCtx.restore();
    });

    // 新6(2026-08-24 引継ぎ19回目): ノースアロー(2Dコンパス)をカメラの水平回転に
    // 追従させる。北の世界方位角(北=0°・時計回り正、本体の2D画面と同じ規約)から
    // カメラの現在の水平方位角を引いた分だけアイコンを回転させる。
    // ★符号(向き)は理屈上の導出であり実機未確認。実際にカメラを回してみて
    // 矢印が正しく北を指し続けないようなら、下の「- camAngleDeg」の符号を反転すること。
    {
      const compassWrap = document.getElementById('placement-compass-wrap');
      if(compassWrap && compassWrap.style.display !== 'none'){
        const vdx = controls.target.x - camera.position.x;
        const vdz = controls.target.z - camera.position.z;
        const camAngleDeg = Math.atan2(vdx, -vdz) * 180 / Math.PI;
        const rotor = document.getElementById('placement-compass-rotor');
        if(rotor) rotor.style.transform = `rotate(${_northAngleDeg - camAngleDeg}deg)`;
      }
    }

    // r060(20回目引継ぎ③A修正): controls.update()はcontrols.enabled=falseでも
    // OrbitControls内部が保持するスファリカル座標からcamera.positionを毎フレーム
    // 再計算してしまうため、enterKotaiMode()で真上視点に手動セットしたカメラ姿勢が
    // 直後のこの呼び出しで上書きされ、「平面ではない変な角度」になっていた。
    // 構台モード中(_kotaiSavedCamが非null)はこの再計算をスキップする。
    if (!_kotaiSavedCam) controls.update();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();

