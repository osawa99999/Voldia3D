// 46回目(r136): ホイールクリック移動のテスト。事前に: npm i three@0.128.0 jsdom@22 --no-save
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../voldia_placement_v0085.html'),'utf-8').replace(/<script[\s\S]*?<\/script>/g,'');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true}); const w=dom.window;
w.THREE=require('three/build/three.js'); const T=w.THREE;
const src=fs.readFileSync(path.join(__dirname,'../js/voldia_placement.js'),'utf-8');
const a=src.indexOf('  // ★ ホイールクリック移動 46回目 r136'), b=src.indexOf('  // ★ ホイールクリック移動 ここまで');
if(a<0||b<0){console.log('NG  ブロックが見つからない');process.exit(1)}
const block=src.slice(src.lastIndexOf('  // ====',a),b);
let fail=0; const ok=(c,m)=>{console.log((c?'OK  ':'NG  ')+m); if(!c)fail++};
// スタブ
const canvas=w.document.createElement('canvas'); w.document.body.appendChild(canvas);
w.__cv=canvas; let now=1000; w.performance.now=()=>now;
const STUB=`
 const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(45,1,0.1,1000); camera.position.set(0,30,40);
 const controls={target:new THREE.Vector3(0,0,0),updates:0,update(){this.updates++}};
 const renderer={domElement:window.__cv}; let currentType=null, dragObj=null, _kotaiSavedCam=null;
 let pointerDownPos={x:0,y:0}; const mouse=new THREE.Vector2(); const raycaster=new THREE.Raycaster();
 let __scf=false; function _scfIsOpen(){return __scf}
 let __floors=[]; function _getFloorMeshes(){return __floors}
`;
w.eval(STUB+block+`
 window.__api={camera,controls,moveIcon,scene,_moveIconUpdate,_moveUpdate,_moveBlocked,
  get anim(){return _moveAnim}, setType(t){currentType=t}, setKotai(v){_kotaiSavedCam=v}, setDrag(v){dragObj=v}, setScf(v){__scf=v},
  setFloors(f){__floors=f}, setDown(x,y){pointerDownPos={x,y}}, resetCam(p,t){camera.position.copy(p);controls.target.copy(t);_moveAnim=null}};`);
const A=w.__api;
const floor=(y)=>{const m=new T.Mesh(new T.PlaneGeometry(4000,4000),new T.MeshBasicMaterial({side:T.DoubleSide})); m.rotation.x=-Math.PI/2; m.position.y=y; m.updateMatrixWorld(true); return m};
const F=floor(0); A.setFloors([F]);
w.innerWidth=1000; w.innerHeight=800; // clientX/Y→NDC
const pev=(type,o)=>{const e=new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},o)); canvas.dispatchEvent(e); return e};
const midClick=(x,y,dx=0,dy=0)=>{A.setDown(x,y); pev('pointerup',{button:1,clientX:x+dx,clientY:y+dy})};
const runAnim=()=>{ let g=0; while(A.anim&&g++<100){now+=50; A._moveUpdate()} return g};
const hitAt=(x,y)=>{const m=new T.Vector2((x/1000)*2-1,-(y/800)*2+1); const r=new T.Raycaster(); r.setFromCamera(m,A.camera); return r.intersectObject(F)[0]};

// --- アイコン
const h0=hitAt(500,500); ok(!!h0,'地面にレイが当たる');
A._moveIconUpdate(canvas,0,[h0]); ok(A.moveIcon.visible,'地面の上: アイコンが出る');
ok(Math.abs(A.moveIcon.position.y-0.05)<1e-6,'アイコンは地面のすぐ上(法線方向に5cm)');
const dist=A.camera.position.distanceTo(h0.point); ok(Math.abs(A.moveIcon.scale.x-dist*0.02)<1e-9,'大きさはカメラ距離に比例(画面上ほぼ一定)');
A._moveIconUpdate(canvas,1,[h0]); ok(!A.moveIcon.visible,'ボタンを押している間(回転・パン中)は隠す');
A._moveIconUpdate(canvas,0,[]); ok(!A.moveIcon.visible,'地面に当たらない所では隠す');
A._moveIconUpdate(w.document.body,0,[h0]); ok(!A.moveIcon.visible,'キャンバス以外(UI・オーバーレイ)の上では隠す');
const rc=w.document.createElement('canvas'); rc.id='radar-canvas'; A._moveIconUpdate(rc,0,[h0]); ok(!A.moveIcon.visible,'レーダー(radar-canvas)の上では隠す');
A.setType('worker'); A._moveIconUpdate(canvas,0,[h0]); ok(!A.moveIcon.visible,'オブジェクト配置中は隠す(既存の配置マーカーと紛らわしい)'); A.setType(null);
A.setKotai({}); A._moveIconUpdate(canvas,0,[h0]); ok(!A.moveIcon.visible,'構台モード中は隠す'); A.setKotai(null);
A.setScf(true); A._moveIconUpdate(canvas,0,[h0]); ok(!A.moveIcon.visible,'足場ダイアログ中は隠す'); A.setScf(false);
A.setDrag({}); A._moveIconUpdate(canvas,0,[h0]); ok(!A.moveIcon.visible,'オブジェクトのドラッグ中は隠す'); A.setDrag(null);
const np=w.document.getElementById('numpad-ui'); if(np){np.style.display='block'; A._moveIconUpdate(canvas,0,[h0]); ok(!A.moveIcon.visible,'テンキー表示中は隠す'); np.style.display='none';}
A._moveIconUpdate(canvas,0,[h0]); ok(A.moveIcon.visible,'条件が戻ればまた出る');
// 傾いた(下向き法線の)面でも上向きにそろう
const tilt={point:new T.Vector3(1,2,3),face:{normal:new T.Vector3(0,-1,0)},object:new T.Object3D()}; A._moveIconUpdate(canvas,0,[tilt]);
ok(new T.Vector3(0,1,0).applyQuaternion(A.moveIcon.quaternion).y>0.99,'下向きの面法線でもアイコンは上向き');

// --- ホイールクリックで移動
A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0));
const p0=A.camera.position.clone(); const target=hitAt(700,400); const d0=p0.distanceTo(target.point);
midClick(700,400); ok(!!A.anim,'中ボタンを動かさず離す→移動開始');
ok(!A.moveIcon.visible,'移動中はアイコンを隠す');
const frames=runAnim(); ok(!A.anim&&frames>=9&&frames<=11,`約0.45秒(50ms刻みで${frames}コマ)で終わる`);
ok(A.controls.target.distanceTo(target.point)<1e-9,'回転・ズームの中心がクリックした点になる');
const d1=A.camera.position.distanceTo(target.point); ok(Math.abs(d1-d0*0.4)<1e-6,`距離は4割(${d0.toFixed(2)}→${d1.toFixed(2)})`);
const v0=p0.clone().sub(target.point).normalize(), v1=A.camera.position.clone().sub(target.point).normalize();
ok(v0.distanceTo(v1)<1e-9,'クリックしたレイの上を寄る(見る向きの関係は保つ)');
ok(A.controls.updates>=9,'毎コマ controls.update() を呼ぶ');
// 途中経過(なめらか=最初と最後は遅い)
A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0)); midClick(700,400); now+=45; A._moveUpdate(); const early=A.camera.position.distanceTo(p0); runAnim();
ok(early<0.1*p0.distanceTo(A.camera.position),'始めはゆっくり(easeInOut)');
// 連続クリックで同じ場所へ収束(3mで止まる)
A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0)); let prev=1e9,monotonic=true,i=0;
for(;i<20;i++){ midClick(500,400); const before=A.camera.position.clone(); runAnim(); const dd=A.camera.position.distanceTo(A.controls.target); if(dd>prev+1e-9)monotonic=false; prev=dd; if(i>0&&Math.abs(dd-3)<1e-6)break }
ok(monotonic&&Math.abs(prev-3)<1e-6,`連続クリック: 単調に寄って最小3mで止まる(${i+1}回)`);
const before2=A.camera.position.clone(); midClick(500,400); runAnim(); ok(A.camera.position.distanceTo(before2)<1e-6||A.camera.position.distanceTo(A.controls.target)<=3+1e-6,'3m以下では、今より遠ざけない');

// --- 移動しないケース
A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0));
midClick(700,400,10,0); ok(!A.anim,'5px以上動かした(=パンのドラッグ)なら移動しない');
midClick(700,400,3,3); ok(!!A.anim,'4.2px(5px未満)は移動する'); A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0));
A.setDown(700,400); pev('pointerup',{button:0,clientX:700,clientY:400}); ok(!A.anim,'左クリックでは移動しない');
A.setDown(700,400); pev('pointerup',{button:2,clientX:700,clientY:400}); ok(!A.anim,'右クリックでは移動しない');
A.setDown(700,400); w.document.body.dispatchEvent(new w.MouseEvent('pointerup',{button:1,clientX:700,clientY:400,bubbles:true})); ok(!A.anim,'キャンバス以外での中ボタンでは移動しない');
A.setKotai({}); midClick(700,400); ok(!A.anim,'構台モード中は移動しない'); A.setKotai(null);
A.setScf(true); midClick(700,400); ok(!A.anim,'足場ダイアログ中は移動しない'); A.setScf(false);
A.setDrag({}); midClick(700,400); ok(!A.anim,'ドラッグ中は移動しない'); A.setDrag(null);
A.setFloors([]); midClick(700,400); ok(!A.anim,'地面が無い所(空)では移動しない'); A.setFloors([F]);
A.setType('worker'); midClick(700,400); ok(!!A.anim,'オブジェクト配置待ちの間でも、ホイールクリックの移動は効く'); A.setType(null); A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0));

// --- 移動中の割り込み
midClick(700,400); now+=100; A._moveUpdate(); ok(!!A.anim,'移動中');
canvas.dispatchEvent(new w.MouseEvent('wheel',{bubbles:true})); ok(!A.anim,'ホイールで移動を中断(利用者の操作を優先)');
midClick(700,400); pev('pointerdown',{button:0}); ok(!A.anim,'クリック/ドラッグで移動を中断');
midClick(700,400); w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp'})); ok(!A.anim,'矢印キーで移動を中断');
midClick(700,400); w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a'})); ok(!!A.anim,'矢印以外のキーでは中断しない'); A.resetCam(new T.Vector3(0,100,100),new T.Vector3(0,0,0));

// --- 点が今のカメラより高い所(丘)でも、カメラが点の下へ潜らない
const hill=floor(80); A.setFloors([hill]); A.resetCam(new T.Vector3(0,60,100),new T.Vector3(0,0,0));
const hm=new T.Vector2(0,-0.3); const rr=new T.Raycaster(); rr.setFromCamera(hm,A.camera); const hh=rr.intersectObject(hill)[0];
// 低いカメラ(y=60)から、高さ80の面を見上げるレイ=カメラの上を向くので当たらないのが普通 → 下向きレイになる面で確認
A.setFloors([floor(0)]); A.resetCam(new T.Vector3(0,2,100),new T.Vector3(0,0,0)); midClick(500,600); runAnim();
ok(A.camera.position.y>=A.controls.target.y-1e-9,`低いカメラでもカメラは点の高さ以上(cam.y=${A.camera.position.y.toFixed(3)} / target.y=${A.controls.target.y.toFixed(3)})`);
// 非常に遠い点(広い図形=2km)
A.setFloors([F]); A.resetCam(new T.Vector3(0,1500,0.01),new T.Vector3(0,0,0)); const far=hitAt(500,780); midClick(500,780); runAnim(); ok(A.controls.target.distanceTo(far.point)<1e-6,'2km級の広さでも、遠い点が中心になる');
console.log(fail===0?'\nALL OK':'\nFAIL x'+fail); process.exit(fail?1:0);
