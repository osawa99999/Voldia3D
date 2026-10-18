// ============================================================
// voldia_main.js — 2D作図エンジン本体 (Voldia_v0118.htmlインラインscriptより分離) / r042(39回目): 死んだ関数・変数を削除(削除一覧は下の【r042 削除一覧】参照) / r041(38回目): 起動フロー改造で不要になった旧コードを削除(削除一覧は下の【r041 削除一覧】参照) / r040(38回目): 起動ダイアログの縮尺既定値を1/100に・方眼紙モードに「戻る」ボタン追加(枠外クリックでは閉じない) / r039(38回目): 起動フローをArecal方式に統合(免責=「了解してはじめる」/ページ・元図の線・縮尺・角度調整を1つの起動ダイアログへ。体積・3D側は無改造) / r038(37回目): ✏修正の四角形を「拡大縮小(直角のまま)・辺の中点◆は平行移動」に変更し、描画ツールと同じオブジェクトスナップを追加 / r037(37回目): ✏修正ボタン(頂点ドラッグ)追加+オブジェクト一覧の青を青灰色に / r036(36回目): グレー(既存躯体)の下端欄を「∞」表示(見た目のみ)
// ============================================================
// 【r042 削除一覧】(39回目。全ファイル=JS5本+HTML2本を横断検索し、呼び出し元ゼロ/書き込みのみ、と確認したものだけを削除。挙動は変えていない)
//  削除した関数: chamferSharpAngles() + MIN_CHAMFER_M(鋭角カットの旧2D版。現役は voldia3d.js の tryChamferMm)
//               checkNorthOriginForExport()(将来のLandXML出力用ガード。未使用)
//  削除した変数: _lastOps(書き込みのみ) / toolsLocked(書き込みのみ。voldia_export.js側の代入1行も削除)
//  残したもの: SHARP_ANGLE_DEG(voldia3d.jsが参照)。
//  ※ 詳細な理由は、各削除箇所に残したコメントを参照。復元が必要になったら r041 のファイルから戻す。
// 【r041 削除一覧】(38回目。r039の起動フロー改造で呼ばれなくなった旧コードを整理。挙動は変えていない)
//  削除した関数: showPgModal() / askVecExtractConsent() / showRotModal()
//     → 起動ダイアログ(showStartupDialog)が、ページ選択・元図の線の確認・角度調整の確認を全部引き受けたため。
//  削除したイベント: rot-yes / rot-no のクリック処理、sc-gridpaper-confirm のクリック処理
//     → 角度調整UIの開始は startRotationUI() に切り出した(rot-yesのボタンを仮想クリックする方式をやめた)。
//        方眼紙の開始は起動ダイアログ(_suStart)が行う。
//  削除したフラグ参照: window._afterPDFLoad / window._gridPaperMode
//     → どこでもtrueにされなくなったため(sc-confirm・setupScGrid・sc-changeの分岐ごと削除)。
//  残したもの: sc-modal(縮尺の「変更」ボタン用)、toolsLocked変数(「廃止予定、互換性のため残す」の既存コメントのまま → r042で削除)
//  ※ HTML側の削除(pg-modal / rot-modal / sc-modalの方眼紙ボタンと空の用紙サイズ欄)は Voldia_v0131.html の冒頭付近コメント参照
// ============================================================

let sortMode = 'no';
let roundMode = 0; // 0=整数, 1〜4=小数桁数

// ████████████████████████████████████████████████████████████████
// ██  SECTION 1: 2D作図エンジン                                  ██
// ██  snap / draw / undo / PDF / スケール / グリッド            ██
// ████████████████████████████████████████████████████████████████
// ================================================================
//  AreCal v0.0107 ベース → VOLDIAM v0.1.0
// ================================================================
pdfjsLib.GlobalWorkerOptions.workerSrc=
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.12.313/pdf.worker.min.js';

const RS=4; // RENDER_SCALE — Arecalと同値（RS=4で面積計算が正確）
let SNAP_PX=16; // スナップ距離px（スライダーで変更可能）
let slopeAngleDeg = 45; // v0.0014: 法面角度（度）デフォルト45°
window._vertexQuantMm = 10; // v0.0024: 頂点量子化(mm) デフォルトを10mmに変更（0=従来5μm精度）

// v0.0014: 法面角度から水平オフセット比を計算
// 45° → ratio=1.0, 60° → ratio=0.577, 35° → ratio=1.428, 73° → ratio=0.325
function getSlopeRatio(){ return 1 / Math.tan(slopeAngleDeg * Math.PI / 180); }

// (24回目)(24回目・追加修正・項目9): 既存ロゴ(横長画像)をファビコンとして設定。
// 単純に<link rel="icon">へ直接そのままセットすると、ブラウザによっては
// 正方形に引き伸ばされて歪むため、64x64の透明キャンバスへアスペクト比を
// 維持したまま中央配置してから使う。ロゴのBase64データは既にヘッダー/
// スプラッシュ画面のimgタグに埋め込み済みのものをそのまま流用し、二重に
// 埋め込まない。
(function setupFavicon(){
  const logoImg = document.querySelector('img[alt="OSAKI Tech Lab"]');
  if(!logoImg || !logoImg.src) return;
  const iconImg = new Image();
  iconImg.onload = function(){
    const canvas = document.createElement('canvas');
    const size = 64;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    // (24回目)(24回目・追加チェック項目4): 従来はロゴを透明背景のまま配置していたが、
    // ロゴが白系の色を含むため、ライトモードのブラウザ(タブバーが白背景)だと
    // 視認できないという指摘を受けた。テーマカラー(濃色)の角丸背景を敷いて
    // アイコンらしい見た目にしつつ、明暗どちらのテーマでも確実に視認できるようにする。
    const radius = size*0.22;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.arcTo(size, 0, size, size, radius);
    ctx.arcTo(size, size, 0, size, radius);
    ctx.arcTo(0, size, 0, 0, radius);
    ctx.arcTo(0, 0, size, 0, radius);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#1a1a1a'; // サイトのテーマカラー(濃色)
    ctx.fillRect(0, 0, size, size);
    let drawWidth, drawHeight;
    if(iconImg.width > iconImg.height){
      drawWidth = size;
      drawHeight = (iconImg.height / iconImg.width) * size;
    } else {
      drawHeight = size;
      drawWidth = (iconImg.width / iconImg.height) * size;
    }
    const scale = 1.3;
    drawWidth *= scale; drawHeight *= scale;
    const x = (size - drawWidth) / 2;
    const y = (size - drawHeight) / 2;
    ctx.drawImage(iconImg, x, y, drawWidth, drawHeight);
    ctx.restore();
    let favicon = document.querySelector('link[rel="icon"]');
    if(!favicon){
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = canvas.toDataURL('image/png');
  };
  iconImg.src = logoImg.src;
})();

// ─── 色定義 ───
const SHAPE_COLORS={
  blue:  {fill:'rgba(0,200,255,.38)',  stroke:'rgba(0,200,255,.9)',   badge:'#0080c0', label:'青'},
  green: {fill:'rgba(0,220,100,.38)',  stroke:'rgba(0,220,100,.9)',   badge:'#00a040', label:'緑'},
  yellow:{fill:'rgba(220,200,0,.38)',  stroke:'rgba(220,200,0,.9)',   badge:'#c0a000', label:'黄'},
  purple:{fill:'rgba(180,60,255,.38)', stroke:'rgba(180,60,255,.9)',  badge:'#9030c0', label:'紫'},
  gray:  {fill:'rgba(150,150,150,.38)',stroke:'rgba(150,150,150,.9)', badge:'#707070', label:'グレー'},
}; // 6A(2026-08-28 引継ぎ18回目): 土量計算での垂直面(山留)指定用にグレーを再追加
// ─── 追加ステート ───
const selectedSet = new Set(); // これを他の let 宣言が集まっている場所の一番上に置いて。
let currentToolColor='blue';  // 現在の描画色
let snapRound=5;               // デフォルト5mm スナップグリッド
let distMode=false;            // 距離測定モード
let distPts=[];                // 距離測定の2点
let selUnionMode=false;        // 選択合成モード
const selUnionSet=new Set();   // 選択合成対象インデックス
let subMode=false;             // 部分削除モード
let subBase=-1;                // 部分削除のベース図形
const subTargets=new Set();    // 部分削除の削除対象
let editCount=0;               // 編集図形カウンタ
const colorFilter={blue:true,green:true,yellow:true,purple:true,gray:true}; // 6A: 5色

let pdfDoc=null,pageNum=1,scaleDenom=40;
// shapes: {type, pts, area, depthBeam, overdig, noSlope, color, enabled}
let shapes=[],cur=null,drawing=false,tool=null,rectLoop=false,polyLoop=false;
// 新3(2026-08-24 引継ぎ17回目): 四角形等の作図中にダブルクリックすると、1回目の
// クリックで頂点確定→2回目のクリックでツール自体がOFFになった直後に、同じ
// ダブルクリックイベント(window 'dblclick')が発火して drawing===false になっており、
// 山留の削除判定をすり抜けてしまう競合が発生していた。作図系の全ツール(四角形/
// 多角形/山留/距離測定/測点設置)が「終了した瞬間」を記録しておき、そこから1秒間は
// 山留ダブルクリック削除を無効化することで、この競合を回避する。
let _toolEndCooldownUntil = 0;
function _startToolEndCooldown(){ _toolEndCooldownUntil = Date.now() + 1000; }
let _lastDrawToolForRepeat=null; // r075: Enterキーでのリピート機能。構台(kotai)・保存系は対象外。
// (24回目)(24回目・追加修正・項目7): 図形作図の完了とEnterキーでの再開の「間」に、
// 距離測定・測点設置・選択合成・部分削除・undo/redo等の別アクションを挟んだ
// 場合はリピートを無効化するための共通関数。各アクションの開始点から呼ぶ。
function _invalidateRepeat(){
  if(_lastDrawToolForRepeat){
    _lastDrawToolForRepeat=null;
    // ステータスバーがリピート案内を表示中だった場合はクリアする
    const tn=document.getElementById('tool-name');
    if(tn && tn.textContent==='⏎ Enterでツールを繰り返し') setToolBar('');
  }
}
let surveyMode=false,surveyPts=[]; // r024(AreCal移植): 測点設置
// r060: ノースアロー（方位角）。画面上=0°、時計回りが正（測量の方位角方式）。
// LandXML出力時の回転・原点(0,0,0)決定にのみ使用。作図・3D表示・配置モードには一切影響しない。
let northAngleDeg=0, originSurveyIdx=null;
let svBase=null,svDir=null; // r025(AreCal移植): 測点オフセットダイアログの基点・方向
let yamadome=null; // 仮想山留ポリゴン（px座標）。1個のみ。
// r037(37回目): ✏修正モード(頂点ドラッグ)。四角形=平行移動のみ / 多角形=自由移動(ドラッグ解除時に自己交差等を判定、不正なら元に戻す)
let editMode=false;
let editDrag=null;   // {si, ri, vi, start:{x,y}, orig:{pts,holes}, moved}
let editHover=null;  // {si, ri, vi}
let yamadomeEditMode=false; // 山留頂点移動モード
let yamadomeEditVtx=-1;     // ドラッグ中の頂点インデックス
let yamadomeEditVtxStart=null; // 新7(2026-08-28 引継ぎ18回目): ドラッグ開始時の頂点初期位置(直交移動の基準)
let rectAngle=0; // 四角形の回転角度（度）
let vecPts=[],vecSegs=[];
let vecGrid=null; // r023: 元図スナップ用の空間インデックス（AreCal移植）
// r042: _lastOps(回転焼き込み時の再抽出用キャッシュ)を削除。書き込みのみで読む箇所が無かった(現行は「元図の線抽出→bakeRotation()がvecPts/vecSegsごと回転」で、再抽出しない)

// r023(AreCal移植): 元図スナップ用 空間インデックス（グリッド分割）
class LineGrid{
  constructor(w,h,cellSize){
    this.cellSize=cellSize;
    this.cols=Math.max(1,Math.ceil(w/cellSize));
    this.rows=Math.max(1,Math.ceil(h/cellSize));
    this.cells=Array.from({length:this.cols*this.rows},()=>[]);
  }
  insert(seg){
    const minX=Math.min(seg.a.x,seg.b.x),maxX=Math.max(seg.a.x,seg.b.x);
    const minY=Math.min(seg.a.y,seg.b.y),maxY=Math.max(seg.a.y,seg.b.y);
    const c0=Math.max(0,Math.floor(minX/this.cellSize)),c1=Math.min(this.cols-1,Math.floor(maxX/this.cellSize));
    const r0=Math.max(0,Math.floor(minY/this.cellSize)),r1=Math.min(this.rows-1,Math.floor(maxY/this.cellSize));
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)this.cells[r*this.cols+c].push(seg);
  }
  getLinesNear(x,y){
    const col=Math.floor(x/this.cellSize),row=Math.floor(y/this.cellSize);
    const set=new Set();
    for(let r=row-1;r<=row+1;r++)for(let c=col-1;c<=col+1;c++){
      if(c>=0&&c<this.cols&&r>=0&&r<this.rows){
        const cell=this.cells[r*this.cols+c];
        for(let i=0;i<cell.length;i++)set.add(cell[i]);
      }
    }
    return Array.from(set);
  }
}

// r023(AreCal移植): 元図ベクター抽出用Workerコード（別スレッドでPDF命令を解析し、メインスレッドを固まらせない）
// save/restore/transform(cm)のCTMスタックを追跡し、Form XObject内の座標も正しく変換する。
// AutoCAD書き出しPDFはブロックや図層をForm XObjectとして扱うことが多く、旧実装(Voldia r022以前)は
// このCTM変換を行っていなかったため、実質的に線を拾えていなかった可能性が高い。
const _vecWorkerCode=`
self.onmessage=function(e){
  const {opsFn,opsArgs,transform,OPS,minLen}=e.data;
  const _minLen=minLen||1.5;
  const lines=[];
  let ctm=[1,0,0,1,0,0],ctmStack=[];
  let pathPts=[],inPath=false;

  function mulM(m1,m2){
    return [
      m1[0]*m2[0]+m1[2]*m2[1], m1[1]*m2[0]+m1[3]*m2[1],
      m1[0]*m2[2]+m1[2]*m2[3], m1[1]*m2[2]+m1[3]*m2[3],
      m1[0]*m2[4]+m1[2]*m2[5]+m1[4], m1[1]*m2[4]+m1[3]*m2[5]+m1[5]
    ];
  }
  function tf(x,y){
    const tx=x*ctm[0]+y*ctm[2]+ctm[4], ty=x*ctm[1]+y*ctm[3]+ctm[5];
    return { x: tx*transform[0]+ty*transform[2]+transform[4],
             y: tx*transform[1]+ty*transform[3]+transform[5] };
  }

  for(let i=0;i<opsFn.length;i++){
    const fn=opsFn[i],args=opsArgs[i];
    switch(fn){
      case OPS.save: ctmStack.push(ctm.slice()); break;
      case OPS.restore: if(ctmStack.length)ctm=ctmStack.pop(); break;
      case OPS.transform: ctm=mulM(args,ctm); break;
      case OPS.paintFormXObjectBegin: ctmStack.push(ctm.slice()); if(args&&args[0])ctm=mulM(args[0],ctm); break;
      case OPS.paintFormXObjectEnd: if(ctmStack.length)ctm=ctmStack.pop(); break;
      case OPS.moveTo: pathPts=[tf(args[0],args[1])]; inPath=true; break;
      case OPS.lineTo: if(inPath)pathPts.push(tf(args[0],args[1])); break;
      case OPS.rectangle:{
        const rx=args[0],ry=args[1],rw=args[2],rh=args[3];
        pathPts=[tf(rx,ry),tf(rx+rw,ry),tf(rx+rw,ry+rh),tf(rx,ry+rh),tf(rx,ry)];
        inPath=true; break;
      }
      case OPS.constructPath:{
        let ai=0; pathPts=[]; inPath=true;
        const subOps=args[0], subArgs=args[1];
        for(let j=0;j<subOps.length;j++){
          const op=subOps[j];
          if(op===OPS.moveTo||op===OPS.lineTo){
            pathPts.push(tf(subArgs[ai++],subArgs[ai++]));
          }else if(op===OPS.curveTo){
            ai+=4; pathPts.push(tf(subArgs[ai++],subArgs[ai++]));
          }else if(op===OPS.curveTo2||op===OPS.curveTo3){
            ai+=2; pathPts.push(tf(subArgs[ai++],subArgs[ai++]));
          }else if(op===OPS.closePath){
            if(pathPts.length)pathPts.push(pathPts[0]);
          }else if(op===OPS.rectangle){
            const rx=subArgs[ai++],ry=subArgs[ai++],rw=subArgs[ai++],rh=subArgs[ai++];
            pathPts.push(tf(rx,ry),tf(rx+rw,ry),tf(rx+rw,ry+rh),tf(rx,ry+rh),tf(rx,ry));
          }
        }
        break;
      }
      case OPS.closePath: if(inPath&&pathPts.length)pathPts.push(pathPts[0]); break;
      case OPS.endPath: inPath=false; pathPts=[]; break;
      case OPS.stroke: case OPS.fill: case OPS.eoFill: case OPS.fillStroke: case OPS.eoFillStroke:
        if(inPath&&pathPts.length>=2){
          for(let j=0;j<pathPts.length-1;j++){
            const a=pathPts[j],b=pathPts[j+1];
            if(Math.hypot(b.x-a.x,b.y-a.y)>_minLen) lines.push({a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}});
          }
        }
        inPath=false; pathPts=[];
        break;
    }
  }

  // ハッシュマップ重複排除(小数点1桁で丸め、始終点の向き違いも同一視)
  const uniq=new Map();
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    const ax=Math.round(l.a.x*10),ay=Math.round(l.a.y*10);
    const bx=Math.round(l.b.x*10),by=Math.round(l.b.y*10);
    const k1=ax+','+ay+'-'+bx+','+by, k2=bx+','+by+'-'+ax+','+ay;
    uniq.set(k1<k2?k1:k2, l);
  }
  self.postMessage({lines:Array.from(uniq.values())});
};
`;
const _vecWorkerUrl=URL.createObjectURL(new Blob([_vecWorkerCode],{type:'application/javascript'}));
let zoom=1,ox=0,oy=0;
let panning=false,psx=0,psy=0;
let spaceDown=false,shiftDown=false;
let animId=null,pdfW=0,pdfH=0;
// r013: プロジェクトファイルに同梱されていた配置モードのオブジェクト状態。
// 配置モードを次に開いた時に一度だけ復元して使う。
let _pendingPlacementRestore = null;

// r013: 配置モードのiframeが開いていれば現在の配置オブジェクト状態を
// 問い合わせる。開いていない/応答が無い場合はnullを返す（＝保存ファイルに
// placementObjectsフィールドは含めない）。
function requestPlacementState(){
  return new Promise(resolve=>{
    const wrap=document.getElementById('placement-overlay');
    const iframeEl=document.getElementById('placement-iframe');
    if(!wrap || !iframeEl || !iframeEl.contentWindow){ resolve(null); return; }
    let done=false;
    const timer=setTimeout(()=>{
      if(done)return; done=true;
      window.removeEventListener('message', onMsg); resolve(null);
    }, 1000);
    function onMsg(ev){
      if(ev.source!==iframeEl.contentWindow) return;
      if(ev.data && ev.data.type==='voldia-placement-state'){
        if(done)return; done=true;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(ev.data.objects || []);
      }
    }
    window.addEventListener('message', onMsg);
    try{ iframeEl.contentWindow.postMessage({type:'voldia-request-placement-state'}, '*'); }
    catch(e){ clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(null); }
  });
}
// r018: 配置モード側の「💾 保存」ボタンからの依頼を受けて、本体のVold保存
// (exportCSV)を呼び出す。ページ読込時に一度だけ登録すればよい（openPlacementMode
// のたびに登録すると開き直すたびにリスナーが増えてしまうため、あえて分離）。
window.addEventListener('message', async (ev)=>{
  if(!ev.data || ev.data.type!=='voldia-request-save') return;
  const iframeEl=document.getElementById('placement-iframe');
  if(!iframeEl || ev.source!==iframeEl.contentWindow) return;
  let ok=true;
  try{ await exportCSV(); }
  catch(e){ console.error(e); ok=false; }
  try{ iframeEl.contentWindow.postMessage({type:'voldia-save-done', ok}, '*'); }catch(e){}
});
let wMidTimer=null;
let rotAngle=0,_rotPage=null;
function isToolsLocked(){
  // sc-modal(縮尺の「変更」)・su-overlay(起動ダイアログ)・rot-ctrl(角度調整中)だけブロック
  const scm=document.getElementById('sc-modal');
  const rotctrl=document.getElementById('rot-ctrl');
  if(scm&&scm.style.display==='block')return true;
  const suo=document.getElementById('su-overlay'); // r039: 起動ダイアログ表示中もツールをロック
  if(suo&&suo.style.display==='flex')return true;
  if(rotctrl&&rotctrl.style.display==='flex')return true;
  return false; // toolsLocked変数は使わない
}
// r042: toolsLocked変数を削除(「廃止予定、互換性のため残す」だったが、書き込み(=false)のみで読む箇所が無かった。isToolsLocked()はこの変数を使わない)

const UNDO_MAX=30;
const undoStack=[];
const redoStack=[]; // r025(マスター指示⑪): Redo（戻すを取消し）機能
function pushUndo(){
  undoStack.push(JSON.stringify({shapes, yamadome, surveyPts}));
  if(undoStack.length>UNDO_MAX)undoStack.shift();
  document.getElementById('undo-btn').disabled=false;
  // 新しい操作が入った時点でredo履歴は無効化する（一般的なUndo/Redoの作法通り）
  redoStack.length=0;
  document.getElementById('redo-btn').disabled=true;
}
function undo(){
  if(!undoStack.length)return;
  _invalidateRepeat();
  // 取消し前の現在状態をredo用に退避
  redoStack.push(JSON.stringify({shapes, yamadome, surveyPts}));
  document.getElementById('redo-btn').disabled=false;
  const state=JSON.parse(undoStack.pop());
  if(state && typeof state==='object' && state.shapes){
    shapes=state.shapes; yamadome=state.yamadome||null; surveyPts=state.surveyPts||[];
  } else { shapes=state; yamadome=null; surveyPts=[]; } // 旧形式互換
  const yb=document.getElementById('yamadome-btn');
  if(yb){yb.style.opacity=yamadome?'0.4':'';}
  if(!undoStack.length)document.getElementById('undo-btn').disabled=true;
  selectedSet.clear(); selUnionSet.clear(); subBase=-1; subTargets.clear();
  updSidebar();redraw();toast('↩ 元に戻しました');
}
function redo(){
  if(!redoStack.length)return;
  _invalidateRepeat();
  // 取消し前(=redo適用前)の現在状態をundoスタックへ戻す
  undoStack.push(JSON.stringify({shapes, yamadome, surveyPts}));
  if(undoStack.length>UNDO_MAX)undoStack.shift();
  document.getElementById('undo-btn').disabled=false;
  const state=JSON.parse(redoStack.pop());
  if(state && typeof state==='object' && state.shapes){
    shapes=state.shapes; yamadome=state.yamadome||null; surveyPts=state.surveyPts||[];
  } else { shapes=state; yamadome=null; surveyPts=[]; }
  const yb=document.getElementById('yamadome-btn');
  if(yb){yb.style.opacity=yamadome?'0.4':'';}
  if(!redoStack.length)document.getElementById('redo-btn').disabled=true;
  selectedSet.clear(); selUnionSet.clear(); subBase=-1; subTargets.clear();
  updSidebar();redraw();toast('↪ 戻すを取消しました');
}

const snapOn={endpoint:true,survey:true,midpoint:true,online:true,intersect:true,vector:true,grid:true,yamadome:true};

const pdfCv   =document.getElementById('pdf-cv');
const pdfCtx  =pdfCv.getContext('2d');
const drawCv  =document.getElementById('draw-cv');
const drawCtx =drawCv.getContext('2d');
const cvWrap  =document.getElementById('cv-wrap');

// トースト
let tTimer=null;
// 26回目セッション: 第3引数を真偽値(large)から文字列style('large'|'graystruct')に
// 拡張。過去呼び出しのtrue/falseは後方互換のため引き続き'large'/通常表示として扱う。
function toast(msg,dur=2200,style=false){
  const el=document.getElementById('toast');
  const isLarge=(style===true||style==='large');
  const isGrayStruct=(style==='graystruct');
  el.textContent=msg;el.classList.add('show');
  el.classList.toggle('large', isLarge);
  el.classList.toggle('graystruct', isGrayStruct);
  clearTimeout(tTimer);tTimer=setTimeout(()=>{el.classList.remove('show');el.classList.remove('large');el.classList.remove('graystruct');},dur);
}
// ２(2026-08-25引継ぎ22回目マスター指示): 画面上部専用トースト。下部の共有toast()と
// 完全に別要素・別タイマー(tTimerTop)を使うので、他のtoast()呼び出しと衝突して
// 一瞬で消される事が無い。B5のヒント表示に使用。
let tTimerTop=null;
function toastTop(msg,dur=2500){
  const el=document.getElementById('toast-top');
  el.textContent=msg;el.classList.add('show');
  clearTimeout(tTimerTop);tTimerTop=setTimeout(()=>{el.classList.remove('show');},dur);
}

// ================================================================
//  DOMContentLoaded
// ================================================================
document.addEventListener('DOMContentLoaded',()=>{
  // 免責ダイアログ
  // r039: 免責は起動ダイアログの「了解してはじめる」で同意する方式に変更。ここは別窓の「閉じる」(.vold直接読込時は同意モード)
  document.getElementById('disclaimer-ok').addEventListener('click',()=>_discClose());

  // r023(30回目セッション、マスター指示): ライセンス表記(Credits)モーダルの開閉。
  // 免責モーダルの下から開く導線なので、開いている間は免責モーダルの後ろに重ねて表示する
  // (免責モーダルはposition:fixedのdivそのもの、license-modalは.modalクラスのz-index:10000
  // なので、免責モーダル側のz-indexを明示していない=デフォルトスタック順に依存する点に注意。
  // 実機で重なり順がおかしい場合はここのz-indexを見直すこと)。
  document.getElementById('open-license-modal').addEventListener('click',(e)=>{
    e.preventDefault();
    e.stopPropagation(); // r039: drop-hint内へ移設したため、クリックがファイル選択を開かないようにする
    document.getElementById('license-modal').style.display='flex';
  });
  document.getElementById('license-modal-close').addEventListener('click',()=>{
    document.getElementById('license-modal').style.display='none';
  });

  // r041: 旧「回転確認モーダル」(rot-yes/rot-no)のクリック処理を削除。角度調整は起動ダイアログのチェックで決まり、startRotationUI()が開始する
  document.querySelectorAll('.rot-step-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const step=parseFloat(btn.dataset.step);
      previewRot(Math.round((rotAngle+step)*10)/10);
    });
  });
  document.getElementById('rot-ang-input').addEventListener('input',function(){
    const v=parseFloat(this.value);if(!isNaN(v))previewRot(Math.round(v*10)/10);
  });
  document.getElementById('rot-reset').addEventListener('click',()=>previewRot(0));
  document.getElementById('rot-ok').addEventListener('click',async()=>{
    document.getElementById('rot-overlay').style.display='none';
    document.getElementById('rot-ctrl').style.display='none';
    document.getElementById('loading').style.display='block';
    await bakeRotation(rotAngle);
    document.getElementById('loading').style.display='none';
    const baked=rotAngle;rotAngle=0;
    
    toggleSidebars(false); // 👈 ここでロック解除！また自由に使いなさい
    
    fitScreen();
    toast(baked!==0?`✅ 回転 ${baked>=0?'+':''}${baked.toFixed(1)}° 適用`:'✅ 回転なし（そのまま適用）',2500);
  });

  // D&D
  const overlay=document.getElementById('drop-overlay');
  document.addEventListener('dragenter',e=>{
    if(!e.dataTransfer.types.includes('Files'))return;
    overlay.classList.add('active');
    overlay.querySelector('span').textContent=_gridPaperActive?'⚠ 方眼紙モードではPDFを読み込めません。':(pdfDoc?'⛔ PDFは1枚のみ読み込めます（.voldなら読込可）':'📄 PDF または .vold をここにドロップ');
  });
  document.addEventListener('dragleave',e=>{
    if(e.relatedTarget===null||e.relatedTarget===document.documentElement)
      overlay.classList.remove('active');
  });
  document.addEventListener('dragover',e=>e.preventDefault());
  // r013: .vold/.jsonならプロジェクト全体読込、PDFなら従来通りPDF読込に振り分け
  function isVoldFile(f){
    return /\.(vold|json)$/i.test(f.name||'');
  }
  document.addEventListener('drop',e=>{
    e.preventDefault();overlay.classList.remove('active');
    const f=e.dataTransfer.files[0];
    if(!f)return;
    if(isVoldFile(f)){
      // r039: 起動ダイアログを通らない読込は、読込前に免責の別窓で同意確認する
      _requireConsent(()=>{
        if((shapes.length||pdfW) && !confirm('現在の内容を破棄して、このVoldファイルを読み込みますか？')) return;
        loadVoldFile(f);
      });
      return;
    }
    if(pdfDoc){toast('⚠ PDFは1枚のみ。全消去してからお試しください');return;}
    // r022(追1): 方眼紙モードで開始した後はPDFを受け付けられない（実際には
    // 読み込めないのに縮尺入力画面まで進んでしまい紛らわしかったため、
    // ここで明確に拒否する）
    if(_gridPaperActive){toast('⚠ 方眼紙モードではPDFを読み込めません。');return;}
    if(f.type==='application/pdf')loadPDF(f);
    else toast('⚠ PDFファイルか.voldファイルを選択してください');
  });
  const hint=document.getElementById('drop-hint');
  const fin =document.getElementById('file-in');
  // r062: 起動時オーバーレイ(左右パネルブロック)を解除する共通処理。
  // drop-hintを隠す全箇所(PDF読込・方眼紙モード開始・Vold読込)から呼ぶ。
  window.hideUiBlockOverlays = function(){
    document.getElementById('ui-block-left').classList.remove('show');
    document.getElementById('ui-block-right').classList.remove('show');
  };
  window.showUiBlockOverlays = function(){
    document.getElementById('ui-block-left').classList.add('show');
    document.getElementById('ui-block-right').classList.add('show');
  };
  // r066(マスター指摘): 「四角形作図中」等のツールを使用中に保存ボタンを押しても
  // ツールがキャンセルされず、上部のツールバー表示が残ったままだった。
  // 保存パネルを開く際は必ずcancelDraw()でツールを中断し、専用メッセージに切り替える。
  window.toggleIoPanel = function(){
    const btn = document.getElementById('io-toggle-btn');
    const floatPanel = document.getElementById('io-float-panel');
    const willOpen = floatPanel.style.display !== 'block';
    if(willOpen){
      if(typeof cancelDraw==='function') cancelDraw(); // 作図中ツールを強制キャンセル
      setToolBar('出力形式を選択してください（右クリック/ESCでキャンセル）');
      const r = btn.getBoundingClientRect();
      floatPanel.style.top = (r.bottom + 4) + 'px';
      floatPanel.style.left = Math.max(4, r.right - 140) + 'px';
      floatPanel.style.display = 'block';
      showUiBlockOverlays();
    } else {
      floatPanel.style.display = 'none';
      setToolBar('');
      hideUiBlockOverlays();
    }
  };
  // (24回目)(24回目・追加修正・項目4): これまでDOMContentLoadedコールバック内の
  // ローカル関数のままで、外部JS(voldia3d)側からtypeof判定すると常に
  // 'undefined'になり、Vold/DXF出力完了時の自動クローズが無反応だった真因。
  // toggleIoPanelと同じくwindow.に明示公開してグローバルから呼べるようにする。
  window.closeIoPanel = function(){
    const floatPanel = document.getElementById('io-float-panel');
    if(floatPanel.style.display === 'block'){
      floatPanel.style.display = 'none';
      setToolBar('');
      hideUiBlockOverlays();
    }
  };
  // r067(マスター指摘): 右クリックキャンセルが左右パネルのオーバーレイ上でしか
  // 効かず、中央の作図キャンバス上で右クリックしても閉じなかった。画面のどこで
  // 右クリックしても閉じるよう、window全体で拾う1つのリスナーに統一する。
  window.addEventListener('contextmenu', e=>{
    const floatPanel = document.getElementById('io-float-panel');
    if(floatPanel && floatPanel.style.display === 'block'){
      e.preventDefault();
      closeIoPanel();
    }
  });
  // Escでキャンセル
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape') closeIoPanel();
  });
  hint.addEventListener('click',(e)=>{
    fin.click();
  });
  fin.addEventListener('change',()=>{
    if(!fin.files[0])return;
    const f=fin.files[0];
    if(isVoldFile(f)){
      fin.value='';
      // r039: 起動ダイアログを通らない読込は、読込前に免責の別窓で同意確認する
      _requireConsent(()=>{
        if((shapes.length||pdfW) && !confirm('現在の内容を破棄して、このVoldファイルを読み込みますか？')) return;
        loadVoldFile(f);
      });
      return;
    }
    if(pdfDoc){toast('⚠ PDFは1枚のみ。全消去してからお試しください');fin.value='';return;}
    if(_gridPaperActive){toast('⚠ 方眼紙モードではPDFを読み込めません。');fin.value='';return;}
    loadPDF(fin.files[0]);
  });

  // v0.0011: 方眼紙モードボタン
  document.getElementById('grid-paper-btn').addEventListener('click', ()=>{
    // r039: 起動ダイアログを方眼紙モードで開く(ページ/元図の線/角度調整はグレーアウト)
    showStartupDialog(null,true);
  });

  // r041: 「方眼紙モード確定ボタン」(sc-gridpaper-confirm)のクリック処理を削除。方眼紙の開始は起動ダイアログ(_suStart)が行う

  // スケールグリッド
  setupScGrid('sc-grid-modal');
  // sc-input (hidden) keydown is no longer needed (dropdown removed)
  document.getElementById('sc-confirm').addEventListener('click',()=>{
    const denom = document.getElementById('sc-init-in').value;
    const v = denom ? ('1/' + denom) : document.getElementById('sc-input').value;
    if(v){
      applyScale(v);
      document.getElementById('sc-modal').style.display='none';
    }
  });
  document.getElementById('sc-init-in').addEventListener('keydown',e=>{
    if(e.key==='Enter')document.getElementById('sc-confirm').click();
  });
  // v0.0012: 変更ボタン → sc-modalをダイアログ式で開く（通常モード）
  document.getElementById('sc-change').addEventListener('click',()=>{
    // r041: 方眼紙モード用の切替(sc-gridpaper-confirm-wrapの非表示・_gridPaperMode)を削除。このモーダルは「変更」専用になった
    document.getElementById('sc-modal').style.display='flex';
  });

  // ツール
  // r025(マスター指示⑤): ボタン複数回押しでの描画色サイクル機能を廃止。
  // 再クリック時はcycleDrawColor()を呼ばず、startTool側の既存の
  // 「作図中なら一旦cancelDrawしてから開始」ロジックにそのまま委ねる。
  document.getElementById('rect-btn').addEventListener('click',()=>{
    if(distMode)setDistMode(false);
    if(selUnionMode)setSelUnionMode(false);
    if(subMode)setSubMode(false);
    rectAngle=0;startTool('rect');setToolBar('⬛ 四角形作図中（右クリックで終了）');toast('⬛ 四角形 — 1点目をクリック');
  });
  { const _eb=document.getElementById('edit-btn'); if(_eb) _eb.addEventListener('click',()=>setEditMode(!editMode)); } // r037: ✏修正ボタン
  document.getElementById('poly-btn').addEventListener('click',()=>{
    if(distMode)setDistMode(false);
    if(selUnionMode)setSelUnionMode(false);
    if(subMode)setSubMode(false);
    startTool('poly');setToolBar('🔵 多角形作図中（始点クリック or Enter で確定・Shiftで直交）');toast('🔵 多角形 — クリックで点追加');
  });
  // undo ボタン接続
  document.getElementById('undo-btn').addEventListener('click',undo);
  document.getElementById('redo-btn').addEventListener('click',redo); // r025(⑪)
  // Fix7: スケールドロップダウンを外クリックで閉じる
  document.addEventListener('mousedown',e=>{
    if(document.getElementById('calc-modal').classList.contains('show'))return;
    const w=document.getElementById('sc-dropdown-wrap');
    const btn=document.getElementById('sc-change');
    if(w&&w.style.display==='block'&&!w.contains(e.target)&&e.target!==btn){
      w.style.display='none';
    }
  });
  // DXF出力
  document.getElementById('dxf-btn').addEventListener('click',exportDXF3D);
  document.getElementById('xlsx-btn').addEventListener('click',exportXlsx);
  // 距離測定
  document.getElementById('dist-btn').addEventListener('click',()=>setDistMode(!distMode));
  document.getElementById('survey-btn').addEventListener('click',()=>setSurveyMode(!surveyMode));
  // r025(AreCal移植): 測点オフセットダイアログ
  ['up','down','left','right'].forEach(d=>{
    document.getElementById('sv-'+d).addEventListener('click',()=>{
      const map={up:90,down:270,left:180,right:0};svDir=map[d];
      ['up','down','left','right'].forEach(x=>{document.getElementById('sv-'+x).style.background=x===d?'rgba(0,200,255,.3)':'';});
    });
  });
  document.getElementById('sv-cancel').addEventListener('click',()=>{
    document.getElementById('survey-dialog').style.display='none';svBase=null;svDir=null;
    if(surveyMode)setSurveyMode(false);
  });
  document.getElementById('sv-ok').addEventListener('click',()=>{
    const dm=parseFloat(document.getElementById('sv-dist').value);
    const deg=svDir;
    if(deg===null||deg===undefined){toast('⚠ 方向ボタンを選択してください');return;}
    if(!dm||dm<=0){toast('⚠ 距離を入力してください');return;}
    if(!scaleDenom){toast('⚠ 縮尺が未設定のため距離を反映できません');return;}
    const mppSv=(25.4/72)*scaleDenom/1000/RS;
    const pxD=dm/mppSv,rad=deg*Math.PI/180;
    const newPt={x:svBase.x+Math.cos(rad)*pxD,y:svBase.y-Math.sin(rad)*pxD};
    pushUndo();
    // B1(2026-08-25引継ぎ19回目): 1個目の測点設置(=ノースアローが初めて出現する
    // タイミング)かどうかを、push前のsurveyPts.lengthで判定しておく。
    const _isFirstSurveyPt = surveyPts.length===0 && svBase._moveIdx==null;
    if(svBase._moveIdx!=null){
      surveyPts.splice(svBase._moveIdx,1,newPt);
    } else {
      surveyPts.push(newPt);
    }
    document.getElementById('survey-dialog').style.display='none';svBase=null;svDir=null;
    setSurveyMode(false);
    redraw();
    // B1(2026-08-25引継ぎ19回目マスター指示): 1個目の測点設置時だけ、北方向を
    // 設定できることを案内する専用文言にする。
    toast(_isFirstSurveyPt ? '📍 測点が設置されたので、北方向を設定できます' : '📍 測点設置完了', 1500);
  });
  document.getElementById('sv-dist').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('sv-ok').click();});
  // r025(マスター指示⑥): テンキーボタン。sv-distへ直接数字を追記/クリアする(小数点は1個まで)
  document.querySelectorAll('.sv-num-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const inp=document.getElementById('sv-dist');
      const digit=btn.textContent;
      if(digit==='.' && inp.value.includes('.')) return;
      inp.value = (inp.value||'') + digit;
      inp.focus();
    });
  });
  document.getElementById('sv-num-clear').addEventListener('click',()=>{
    document.getElementById('sv-dist').value='';
    document.getElementById('sv-dist').focus();
  });

  // r060: ノースアロー（方位角ウィジェット）— ドラッグ回転・ダブルクリックで数値入力
  (function(){
    const wrap=document.getElementById('north-arrow-wrap');
    const svgEl=document.getElementById('north-arrow-svg');
    const circleEl=document.getElementById('north-arrow-circle');
    if(!wrap||!svgEl)return;
    let dragging=false, moved=false, startX=0, startY=0;
    function angleFromEvent(e){
      // circle要素自身のbboxを使う（回転しても中心はズレない。svg全体だとN文字込みで重心が下寄りになるため不採用）
      const r=(circleEl||svgEl).getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      const dx=e.clientX-cx, dy=e.clientY-cy;
      const a=Math.atan2(dx,-dy)*180/Math.PI; // 画面上=0°、時計回りが正
      return ((a%360)+360)%360;
    }
    wrap.addEventListener('pointerdown',e=>{
      dragging=true;moved=false;startX=e.clientX;startY=e.clientY;
      try{wrap.setPointerCapture(e.pointerId);}catch(_){}
      wrap.style.cursor='grabbing';
    });
    wrap.addEventListener('pointermove',e=>{
      if(!dragging)return;
      if(!moved){
        if(Math.hypot(e.clientX-startX,e.clientY-startY)<4)return; // 誤クリック対策の遊び
        moved=true;
      }
      northAngleDeg=angleFromEvent(e);
      updateNorthArrowUI();
    });
    wrap.addEventListener('pointerup',()=>{dragging=false;wrap.style.cursor='grab';});
    wrap.addEventListener('pointercancel',()=>{dragging=false;wrap.style.cursor='grab';});
    wrap.addEventListener('dblclick',e=>{e.preventDefault();openNorthDialog();});
    updateNorthArrowUI();
  })();
  let naActiveField='na-deg';
  document.querySelectorAll('.na-dms').forEach(inp=>{
    inp.addEventListener('focus',()=>{naActiveField=inp.id;});
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('na-ok').click();});
  });
  document.querySelectorAll('.na-num-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const inp=document.getElementById(naActiveField);
      const digit=btn.textContent;
      if(digit==='.'){
        if(naActiveField!=='na-sec')return; // 度・分は整数のみ、小数は秒だけ許可
        if(inp.value.includes('.'))return;
      }
      inp.value=(inp.value||'')+digit;
      inp.focus();
    });
  });
  document.getElementById('na-num-clear').addEventListener('click',()=>{
    document.getElementById(naActiveField).value='';
    document.getElementById(naActiveField).focus();
  });
  document.getElementById('na-cancel').addEventListener('click',()=>{
    document.getElementById('north-dialog').style.display='none';
  });
  document.getElementById('na-ok').addEventListener('click',()=>{
    const d=parseFloat(document.getElementById('na-deg').value)||0;
    const m=parseFloat(document.getElementById('na-min').value)||0;
    const s=parseFloat(document.getElementById('na-sec').value)||0;
    if(m<0||m>=60||s<0||s>=60){toast('⚠ 分・秒は0〜59.999の範囲で入力してください');return;}
    let deg=d+m/60+s/3600;
    deg=((deg%360)+360)%360;
    northAngleDeg=deg;
    updateNorthArrowUI();
    const sel=document.getElementById('na-origin-select');
    originSurveyIdx=sel.value===''?null:parseInt(sel.value);
    document.getElementById('north-dialog').style.display='none';
    toast('🧭 ノースアロー設定を更新しました',1500);
  });

  document.getElementById('yamadome-btn').addEventListener('click',async()=>{
    if(yamadome){
      const ok=await customConfirm('前に書いた山留は削除されます。よろしいですか。\n※３D処理の問題の為、現状、山留は１つしか配置出来ません。', true);
      if(!ok)return;
      pushUndo();
      yamadome=null;
      const yb=document.getElementById('yamadome-btn');
      if(yb){yb.disabled=false;yb.style.opacity='';}
      updSidebar();redraw();
    }
    startTool('yamadome');
    setToolBar('🏗 山留作図中（Enter or 始点クリックで確定。Shiftで直交）');
    toast('🏗 山留 — クリックで頂点追加');
    document.getElementById('yamadome-btn').classList.add('on');
  });
  // 選択合成
  document.getElementById('sel-union-btn').addEventListener('click',()=>setSelUnionMode(!selUnionMode));
  // 部分削除
  document.getElementById('sub-btn').addEventListener('click',()=>setSubMode(!subMode));

  document.getElementById('clear-btn').addEventListener('click',async()=>{
    if(shapes.length){
      if(!await customConfirm('全ての図形を削除しますか？\nこの操作は元に戻せます（Ctrl+Z）'))return;
      pushUndo();shapes=[];selUnionSet.clear();subBase=-1;subTargets.clear();
      selectedSet.clear();
      yamadome=null;
      surveyPts=[]; // r024(AreCal移植): 測点も全消去対象に含める
      northAngleDeg=0; originSurveyIdx=null; updateNorthArrowUI(); // r060: ノースアローも初期化
      const yb=document.getElementById('yamadome-btn');
      if(yb){yb.disabled=false;yb.style.opacity='';}
      updSidebar();redraw();toast('🗑 オブジェクトを全消去');
    }
  });
  // スナップ距離スライダー
  const _snapSl=document.getElementById('snap-px-slider');
  const _snapLb=document.getElementById('snap-px-label');
  if(_snapSl){
    _snapSl.addEventListener('input',()=>{
      SNAP_PX=parseInt(_snapSl.value)*4;
      if(_snapLb) _snapLb.textContent=_snapSl.value+'px';
    });
  }
  document.getElementById('exp-btn').addEventListener('click',exportCSV);
  document.getElementById('imp-btn').addEventListener('click',async()=>{
    if(shapes.length>0){
      if(!await customConfirm('現在のオブジェクトを破棄して\nデータを読み込みますか？'))return;
    }
    document.getElementById('imp-in').click();
  });
  document.getElementById('imp-in').addEventListener('change',importCSV);

  // 体積計算ボタン
  // 端数調整ボタン
  document.querySelectorAll('.round-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      roundMode=parseInt(btn.dataset.r);
      document.querySelectorAll('.round-btn').forEach(b=>{
        const on=parseInt(b.dataset.r)===roundMode;
        b.style.background=on?'var(--accent)':'#2a2a2a';
        b.style.borderColor=on?'var(--accent)':'#3a3a3a';
        b.style.color=on?'#000':'#aaa';
      });
      updSidebar();
    });
  });

  // スナップグリッド（端数調整mm）ボタン
  document.querySelectorAll('.sr-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      snapRound=parseInt(btn.dataset.r);
      document.querySelectorAll('.sr-btn').forEach(b=>{
        const on=parseInt(b.dataset.r)===snapRound;
        b.style.background=on?'var(--accent)':'#2a2a2a';
        b.style.borderColor=on?'var(--accent)':'#3a3a3a';
        b.style.color=on?'#000':'#aaa';
      });
      toast(`📐 スナップ: ${snapRound===0?'OFF':snapRound+'mm'}`);
    });
  });
  ['no','asc','desc','clr'].forEach(s=>{
    document.getElementById('sort-'+s).addEventListener('click',()=>{
      sortMode=s==='no'?'no':s==='asc'?'area_asc':s==='desc'?'area_desc':'color';
      ['no','asc','desc','clr'].forEach(x=>{
        const b=document.getElementById('sort-'+x);
        const on=x===s;
        b.style.background=on?'var(--accent)':'#2a2a2a';
        b.style.borderColor=on?'var(--accent)':'#3a3a3a';
        b.style.color=on?'#000':'#aaa';
      });
      updSidebar();
    });
  });

  // 色別フィルター
  document.querySelectorAll('.cf-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const col=btn.dataset.c;
      colorFilter[col]=!colorFilter[col];
      btn.style.opacity=colorFilter[col]?'1':'0.25';
      updSidebar();redraw();
    });
  });

document.getElementById('calc-btn').addEventListener('click',()=>{
    cancelAllTools(); // (24回目)(24回目・追加修正・項目8): Voldia→3Dイメージ遷移時に全ツールキャンセル
    console.log("--- 体積計算 起動チェック ---");
    console.log("図形数:", shapes.length);
    
    if(!shapes || shapes.length === 0){
      console.warn("調査結果: 図形が0個のため中断");
      toast('⚠ 図形が1つもありません');
      return;
    }
    
    // データの健全性チェック
    const invalid = shapes.filter(s => !s.pts || s.pts.length < 2);
    if(invalid.length > 0) {
      console.error("調査結果: 不正な座標データを持つ図形があります", invalid);
    }

    console.log("showCalcModalを呼び出します...");
    showCalcModal();
  });

  // スナップトグル
  ['endpoint','survey','midpoint','online','intersect','vector','grid','yamadome'].forEach(k=>{
    const btn=document.getElementById('sn-'+k);
    if(!btn) return;
    btn.addEventListener('click',()=>{
      snapOn[k]=!snapOn[k];
      btn.classList.toggle('on',snapOn[k]);
    });
  });

  // v0.0016: 頂点量子化ボタン
  document.querySelectorAll('.vq-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      window._vertexQuantMm = parseInt(btn.dataset.mm);
      document.querySelectorAll('.vq-btn').forEach(b=>{
        const on = b===btn;
        b.style.background = on?'var(--accent)':'#2a2a2a';
        b.style.color = on?'#000':'#aaa';
        b.style.borderColor = on?'var(--accent)':'#3a3a3a';
        b.style.fontWeight = on?'bold':'normal';
      });
      const msg = window._vertexQuantMm===0
        ? '頂点丸め: 0mm（5μm精度・従来通り）'
        : `頂点丸め: ${window._vertexQuantMm}mm（スリバー対策）`;
      toast(msg);
    });
  });
  // r068(20回目引継ぎ・マスター指摘): ①ホバーはtoast(画面固定位置)だと
  // 気づきにくいため、vertical-hover-tipと同じ「カーソル付近に追従表示」方式に変更。
  // ②建築部門は「度」表記の方が馴染みがあるため、「1:0.3 ≒ 73.30度 - 説明」の
  // ように勾配比・度・説明を1行に統一(45.00度だけは1:1.0との対応が厳密に一致
  // するため「=」、それ以外は近似値として「≒」を使う)。
  const SLOPE_INFO = {
    '73.3':  { ratio:'1:0.3', deg:'73.30', desc:'岩盤・硬質地盤向けの急勾配' },
    '51.34': { ratio:'1:0.8', deg:'51.34', desc:'比較的締まった土砂向け' },
    '45':    { ratio:'1:1.0', deg:'45.00', desc:'一般的な標準勾配', exact:true },
    '39.81': { ratio:'1:1.2', deg:'39.81', desc:'普通土の切土でよく使われる勾配' },
    '33.69': { ratio:'1:1.5', deg:'33.69', desc:'盛土・法面保護に多い緩勾配' },
    '26.57': { ratio:'1:2.0', deg:'26.57', desc:'軟弱地盤など特に緩い勾配が必要な場合' }
  };
  function slopeLabel(key) {
    const s = SLOPE_INFO[key];
    if (!s) return '';
    return `${s.ratio} ${s.exact ? '=' : '≒'} ${s.deg}度 - ${s.desc}`;
  }
  document.querySelectorAll('.slope-ang-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      slopeAngleDeg = parseFloat(btn.dataset.ang);
      document.querySelectorAll('.slope-ang-btn').forEach(b=>{
        const on = b===btn;
        b.style.background = on ? 'var(--accent)' : '#2a2a2a';
        b.style.color = on ? '#000' : '#aaa';
        b.style.borderColor = on ? 'var(--accent)' : '#3a3a3a';
        b.style.fontWeight = on ? 'bold' : 'normal';
        b.classList.toggle('active', on);
      });
      toast(slopeLabel(btn.dataset.ang));
    });
    btn.addEventListener('mouseenter', (e)=>{ showSlopeHoverTip(true, e.clientX, e.clientY, btn.dataset.ang); });
    btn.addEventListener('mousemove', (e)=>{ showSlopeHoverTip(true, e.clientX, e.clientY, btn.dataset.ang); });
    btn.addEventListener('mouseleave', ()=>{ showSlopeHoverTip(false); });
  });
  // r068: vertical-hover-tipと同じ「カーソル付近追従」パターンを流用
  function showSlopeHoverTip(show, cx, cy, key) {
    const el = document.getElementById('slope-hover-tip');
    if (!el) return;
    if (show && cx !== undefined) {
      el.textContent = slopeLabel(key);
      el.style.display = 'block';
      // r072(21回目引継ぎ・マスター指摘「右端のボタンでホバーが画面右に切れる」):
      // 従来はcx+14固定オフセットで、右端の法面角度ボタン(3列×2段gridの右列)を
      // ホバーすると画面外に文字がはみ出していた。textContent確定後の実測幅
      // (offsetWidth)を使い、マウスセンター基準(カーソルの真上中央)に配置した上で、
      // 画面左右端でクランプして絶対にはみ出さないようにする。
      const tw = el.offsetWidth;
      let left = cx - tw / 2;
      left = Math.max(4, Math.min(left, window.innerWidth - tw - 4));
      el.style.left = left + 'px';
      el.style.top = (cy - 30) + 'px';
    } else {
      el.style.display = 'none';
    }
  }

  // [FIX 19回目 2026-08-30 マスター報告対応] 3Dプレビュー(calc-modal)や
  // 配置モード(placement-overlay)を表示中に、キーボード操作(Ctrl+Z/Ctrl+Y/
  // Delete等)がVoldia2D側のshapesに誤爆して描画データが消えてしまう不具合。
  // Enterのリピート機能(下記)では既に同種の判定(anyBlocking)でガードして
  // いたが、undo/redo/deleteには適用されていなかったのが原因。
  // 3D/配置モード表示中はVoldia2Dの編集系ショートカットを一切無効化する。
  function _is2DEditBlockedByOverlay(){
    const tag=document.activeElement&&document.activeElement.tagName;
    const isFormFocus = tag==='INPUT'||tag==='TEXTAREA'||(document.activeElement&&document.activeElement.isContentEditable);
    const confirmModalOpen = document.getElementById('confirm-modal') && document.getElementById('confirm-modal').style.display==='flex';
    const calcModalOpen = document.getElementById('calc-modal') && document.getElementById('calc-modal').classList.contains('show');
    const scModalOpen = document.getElementById('sc-modal') && document.getElementById('sc-modal').classList.contains('show');
    const suOpen = document.getElementById('su-overlay') && document.getElementById('su-overlay').style.display==='flex'; // r039
    const ioPanelOpen = document.getElementById('io-float-panel') && document.getElementById('io-float-panel').style.display!=='none';
    const placementOpen = document.getElementById('placement-overlay') && document.getElementById('placement-overlay').style.display!=='none';
    return isFormFocus||confirmModalOpen||calcModalOpen||scModalOpen||suOpen||ioPanelOpen||placementOpen;
  }

  // キーボード
  document.addEventListener('keydown',e=>{
    if(e.key==='Shift')shiftDown=true;
    // [FIX 19回目] 3D/配置モード表示中はundo・redo・削除ショートカットを無効化
    if(_is2DEditBlockedByOverlay() && (((e.key==='z'||e.key==='Z'||e.key==='y'||e.key==='Y')&&(e.ctrlKey||e.metaKey)) || e.key==='Delete' || e.key==='Backspace')){
      return;
    }
    if(e.key==='z'&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault();undo();return;}
    // r025(マスター指示⑪): Redo。Ctrl+Y と Ctrl+Shift+Z の両方に対応
    if(((e.key==='y'||e.key==='Y')&&(e.ctrlKey||e.metaKey))||(e.key==='Z'&&(e.ctrlKey||e.metaKey)&&e.shiftKey)||(e.key==='z'&&(e.ctrlKey||e.metaKey)&&e.shiftKey)){e.preventDefault();redo();return;}
    if(e.key===' '){spaceDown=true;cvWrap.style.cursor='grab';e.preventDefault();}
    if(e.key==='Enter'&&drawing&&(tool==='poly'||tool==='yamadome')&&cur&&cur.pts.length>=2)finishShape();
    // r075: リピート機能(手動・Enterキー)。作図中でない時にEnterを押すと直前に使った
    // ツール(四角形/多角形。構台・保存系は対象外)を再武装する。フォーム入力中や各種
    // モーダル・ダイアログ表示中は誤爆防止のため無効化する。
    if(e.key==='Enter'&&!drawing&&_lastDrawToolForRepeat){
      const tag=document.activeElement&&document.activeElement.tagName;
      const isFormFocus = tag==='INPUT'||tag==='TEXTAREA'||(document.activeElement&&document.activeElement.isContentEditable);
      const confirmModalOpen = document.getElementById('confirm-modal') && document.getElementById('confirm-modal').style.display==='flex';
      const calcModalOpen = document.getElementById('calc-modal') && document.getElementById('calc-modal').classList.contains('show');
      const scModalOpen = document.getElementById('sc-modal') && document.getElementById('sc-modal').classList.contains('show');
    const suOpen = document.getElementById('su-overlay') && document.getElementById('su-overlay').style.display==='flex'; // r039
      const ioPanelOpen = document.getElementById('io-float-panel') && document.getElementById('io-float-panel').style.display!=='none';
      const placementOpen = document.getElementById('placement-overlay') && document.getElementById('placement-overlay').style.display!=='none';
      const anyBlocking = isFormFocus||confirmModalOpen||calcModalOpen||scModalOpen||suOpen||ioPanelOpen||placementOpen||surveyMode||distMode||selUnionMode||subMode||yamadomeEditMode;
      if(!anyBlocking){
        e.preventDefault();
        startTool(_lastDrawToolForRepeat);
        // (24回目)(24回目・追加修正・項目4): finishShape側でリピート案内をステータス
        // バーに常設表示するようにしたのに対応し、再開時は通常の「作図中」表示に
        // 戻す(手動でボタンを押した時と同じ文言に統一)。
        if(_lastDrawToolForRepeat==='rect'){
          setToolBar('⬛ 四角形作図中（右クリックで終了）');
        } else {
          setToolBar('🔵 多角形作図中（始点クリック or Enter で確定・Shiftで直交）');
        }
        toast(`↩ リピート: ${_lastDrawToolForRepeat==='rect'?'四角形':'多角形'}作図を再開`);
      }
    }
    if(e.key==='Escape'){
      if(yamadomeEditMode){yamadomeEditMode=false;yamadomeEditVtx=-1;yamadomeEditVtxStart=null;showSnap(null);setToolBar('');redraw();toast('ESC — 山留編集キャンセル');return;}
      if(surveyMode){setSurveyMode(false);toast('ESC — 測点設置キャンセル');return;}
      if(distMode){setDistMode(false);toast('ESC — 距離測定キャンセル');return;}
      if(selUnionMode){setSelUnionMode(false);toast('ESC — 選択合成キャンセル');return;}
      if(subMode){setSubMode(false);toast('ESC — 部分削除キャンセル');return;}
      if(drawing){cancelDraw();setToolBar('');toast('ESC — キャンセル');return;}
      if(selectedSet.size>0){clearSelection();toast('👆 選択解除');}
      setToolBar('');
    }
    if(tool==='rect'&&cur&&cur.pts.length===1&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
      e.preventDefault();
      rectAngle=Math.round((rectAngle+(e.key==='ArrowUp'?-0.5:0.5))*2)/2; rectAngle=((rectAngle%360)+360)%360;
      // 即時プレビュー更新（redraw全体より高速）
      if(typeof lastMx!=='undefined') { redraw(); drawRectPrev(lastMx, lastMy); }
      else redraw();
      return;
    }
    if((e.key==='Delete'||e.key==='Backspace')&&!drawing&&selectedSet.size>0){
      const tag=document.activeElement&&document.activeElement.tagName;
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      e.preventDefault();
      _invalidateRepeat();
      pushUndo();
      shapes=shapes.filter((_,i)=>!selectedSet.has(i));
      selectedSet.clear();
      updSidebar();redraw();
      toast('🗑 削除 — Ctrl+Zで元に戻せます');
    }
  });
  document.addEventListener('keyup',e=>{
    if(e.key==='Shift')shiftDown=false;
    if(e.key===' '){spaceDown=false;cvWrap.style.cursor='';}
  });

  window.addEventListener('contextmenu',e=>{
    if(e.target!==drawCv)return;e.preventDefault();
    if(!drawing)return;
    if(tool==='rect'){rectLoop=false;cancelDraw();toast('矩形モード終了');}
    else if(tool==='poly'&&cur&&cur.pts.length>0){
      cur.pts.pop();redraw();toast('↩ 点を削除');
    }
  });

  // r065: 山留の削除方法を右クリックからダブルクリックに変更(マスター指示)
  // 新3(2026-08-24 引継ぎ16回目): 四角形/多角形/距離測定/測点設置のいずれかの
  // ツール使用中にダブルクリックすると山留が誤って削除されてしまう不具合を修正。
  // drawingは四角形/多角形/山留自身の作図中フラグ、distMode/surveyModeは
  // それぞれ距離測定/測点設置のモードフラグ。いずれかがtrueの間は山留削除を無効化する。
  window.addEventListener('dblclick',e=>{
    if(e.target!==drawCv)return;
    if(drawing||distMode||surveyMode) return; // 他ツール使用中は山留削除の対象外
    // 新3(2026-08-24 引継ぎ17回目): 上のdrawing等のフラグは、ツール自身が
    // 2クリック目で先にOFFにしてしまっていることがあり(競合の詳細は上部の
    // _startToolEndCooldown定義部コメント参照)、それだけでは不十分だったため追加。
    if(Date.now() < _toolEndCooldownUntil) return;
    if(!(yamadome && yamadome.pts && yamadome.pts.length>=3)) return;
    const{x:lx2,y:ly2}=getLogi(e);
    const HIT2=10/zoom;
    const onEdge2=yamadome.pts.some((p,i)=>{
      const q=yamadome.pts[(i+1)%yamadome.pts.length];
      return Math.hypot(p.x-lx2,p.y-ly2)<HIT2*2;
    }) || pointInPoly(lx2,ly2,yamadome.pts);
    if(!onEdge2) return;
    customConfirm('仮想山留線を削除しますか。').then(ok=>{
      if(!ok)return;
      pushUndo();
      yamadome=null;
      const yb=document.getElementById('yamadome-btn');
      if(yb){yb.disabled=false;yb.style.opacity='';}
      yamadomeEditMode=false;yamadomeEditVtx=-1;yamadomeEditVtxStart=null;showSnap(null);
      setToolBar('');redraw();toast('🏗 山留を削除しました');
    });
  });

  cvWrap.addEventListener('wheel',e=>{
    if(panning){e.preventDefault();return;} // v0.0020: パン中はズーム不可
    showSnap(null); // Fix⑥
    e.preventDefault();
    const f=e.deltaY<0?1.12:.89;
    const r=cvWrap.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    const nz=Math.min(Math.max(zoom*f,.02),40);
    const ratio=nz/zoom;
    ox=mx-(mx-ox)*ratio;oy=my-(my-oy)*ratio;
    zoom=nz;
    applyTrans();
  },{passive:false});

  cvWrap.addEventListener('auxclick',e=>{
    if(e.button!==1)return;
    e.preventDefault();
    if(wMidTimer){clearTimeout(wMidTimer);wMidTimer=null;fitScreen();return;}
    wMidTimer=setTimeout(()=>{wMidTimer=null;},350);
  });

  cvWrap.addEventListener('mousedown',e=>{
    if(document.getElementById('calc-modal').classList.contains('show'))return;
    if(e.button===1||(e.button===0&&spaceDown)){
      e.preventDefault();panning=true;
      const r=cvWrap.getBoundingClientRect();
      psx=(e.clientX-r.left)-ox;psy=(e.clientY-r.top)-oy;
      cvWrap.style.cursor='grabbing';
    }
  });
  document.addEventListener('mousemove',e=>{
    if(document.getElementById('calc-modal').classList.contains('show'))return;
    if(panning){
      const r=cvWrap.getBoundingClientRect();
      ox=(e.clientX-r.left)-psx;oy=(e.clientY-r.top)-psy;
      applyTrans();
    }
  });
  document.addEventListener('mouseup',e=>{
    if(document.getElementById('calc-modal').classList.contains('show'))return;
    if(panning&&(e.button===1||e.button===0)){
      panning=false;cvWrap.style.cursor='';
    }
    // 山留頂点ドラッグ終了
    if(yamadomeEditMode && yamadomeEditVtx>=0){
      yamadomeEditVtx=-1;
      yamadomeEditMode=false;
      yamadomeEditVtxStart=null;
      showSnap(null); // 新7/8(2026-08-28 引継ぎ18回目マスター指摘): ドラッグ終了時にスナップ表示が残るのを解消
      setToolBar('');redraw();
    }
  });

  drawCv.addEventListener('mousedown',onMouseDown,false);
  drawCv.addEventListener('mousemove',onMouseMove,false);
});

// ================================================================
//  v0.0020: カスタム確認ダイアログ（ブラウザ標準confirmの「今後表示しない」チェックボックス回避）
//  v0.0021: AIS監査対応 → 多重呼び出し時のリスナー重複/誤発火を防ぐため
//           呼び出しをPromiseキューで直列化し、addEventListenerは{once:true}化
// ================================================================
let _confirmQueue = Promise.resolve();
// Voldia版: GLB保存前に確認ダイアログを挟む（LandXML/MG機能は未完成のため）
function voldiaConfirmGLB(){
  customConfirm('PowerPointなどで使える３Dデータとして保存します。\nMG重機用のLANDXML形式は現在未完成ですが、よろしいですか。').then(ok=>{
    if(ok) exportGLB();
  });
}

// Voldia版: OKのみの単純な通知ダイアログ（confirm-modalを流用）
function customAlert(msg){
  const run = ()=> new Promise(resolve=>{
    const m=document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-msg').textContent=msg;
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
      resolve();
    };
    yesBtn.addEventListener('click',cleanup,{once:true});
  });
  const next = _confirmQueue.then(run);
  _confirmQueue = next.catch(()=>{});
  return next;
}

function customConfirm(msg, wide){
  const run = ()=> new Promise(resolve=>{
    const m=document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-msg').textContent=msg;
    // 新2(2026-08-24 引継ぎ16回目): 山留の注意書きのように1行が長いメッセージ用に、
    // このダイアログだけ横幅を広げるオプション。他のcustomConfirm呼び出し（短い
    // メッセージ）には影響させないよう、呼び出しごとにクラスを付け外しする。
    const c=m.querySelector('.modal-c');
    if(c) c.classList.toggle('wide', !!wide);
    m.style.display='flex';
    const yesBtn=document.getElementById('confirm-modal-yes');
    const noBtn=document.getElementById('confirm-modal-no');
    yesBtn.addEventListener('click',()=>{m.style.display='none';resolve(true);},{once:true});
    noBtn.addEventListener('click',()=>{m.style.display='none';resolve(false);},{once:true});
  });
  // 直前のダイアログが閉じてから次を開く（多重表示・リスナー競合防止）
  const next = _confirmQueue.then(run);
  _confirmQueue = next.catch(()=>{});
  return next;
}

// ================================================================
//  スケール
// ================================================================
function setupScGrid(id){
  const g=document.getElementById(id);if(!g)return;
  g.querySelectorAll('.sbtn[data-sc]').forEach(b=>{
    if(b.dataset.sc==='custom')return;
    // r041: 方眼紙モード(_gridPaperMode)の分岐と、PDF読込直後の角度確認(_afterPDFLoad→showRotModal)を削除。
    //       どちらも起動ダイアログに移ったため、ここは「変更」ボタン経由の縮尺変更だけになった。
    b.addEventListener('click',()=>{
      applyScale(b.dataset.sc);
      const m=document.getElementById('sc-modal');
      if(m.style.display==='block'||m.style.display==='flex') m.style.display='none';
    });
  });
}
function hlScBtn(str){
  document.querySelectorAll('.sbtn[data-sc]').forEach(b=>{
    b.classList.toggle('on',b.dataset.sc===str);
  });
}
function fitScreen(){
  if(!pdfW||!pdfH)return;
  const cw=cvWrap.clientWidth,ch=cvWrap.clientHeight;
  zoom=Math.min(cw/pdfW,ch/pdfH)*.95;
  ox=(cw-pdfW*zoom)/2;oy=(ch-pdfH*zoom)/2;
  applyTrans();toast('🔍 全体表示');
}

// ================================================================
//  PDF
// ================================================================
function loadPDF(file){
  document.getElementById('loading').style.display='block';
  const rd=new FileReader();
  rd.onload=()=>{
    pdfjsLib.getDocument(new Uint8Array(rd.result)).promise
      .then(pdf=>{
        pdfDoc=pdf;
        document.getElementById('drop-hint').style.display='none';
        document.getElementById('grid-paper-btn').style.display='none';
        hideUiBlockOverlays();
        document.getElementById('loading').style.display='none';
        showStartupDialog(pdf); // r039: ページ選択/元図の線/縮尺/角度調整を起動ダイアログに統合
      })
      .catch(err=>{alert('PDF読込エラー: '+err.message);
        document.getElementById('loading').style.display='none';});
  };
  rd.readAsArrayBuffer(file);
}

// r041: showPgModal() を削除(ページ選択は起動ダイアログに統合済み)

// ================================================================
//  r039(38回目): 起動ダイアログ (Arecal A040 の移植)
//  PDF読込直後に「ページ/元図の線/縮尺/角度調整」を1画面で選ぶ。免責の同意もここ(了解してはじめる)。
//  ・縮尺はこれまで通りapplyScale()に任せる(体積・3D側は一切変更なし)。
//  ・元図の線の抽出→回転焼き込みの順は従来のまま(bakeRotation()がvecPts/vecSegsも回転させる)。
// ================================================================
let _consentGiven=false;       // このセッションで免責に同意済みか
let _discConsentMode=false;    // 免責の別窓が「同意確認」モードか(false=読むだけ)
let _discCb=null;
let _suPdf=null,_suInited=false,_suPaperSeq=0,_suTipOwner=null,_suGridMode=false;
const _SU_TIPS={
  vec:'マウスが線にピタッと吸着する機能を使えるようにします\n（CADから変換されたPDFにのみ有効）\n※読込に時間がかかったり、動作が重くなる場合があります\n※この設定は後から変更できません（有効化には再読込が必要）',
  scale:'PDF図面の縮尺を選んでください。\n間違うと正確な面積・体積が計測出来ません',
  rot:'斜めにスキャンされた図面の角度を補正できます'
};
function _showDisclaimer(consentMode,cb){
  _discConsentMode=!!consentMode;_discCb=cb||null;
  const b=document.getElementById('disclaimer-ok');
  if(b)b.textContent=consentMode?'了解してはじめる':'閉じる';
  document.getElementById('disclaimer-modal').style.display='flex';
}
function _discClose(){
  document.getElementById('disclaimer-modal').style.display='none';
  if(_discConsentMode){
    _consentGiven=true;_discConsentMode=false;
    const f=_discCb;_discCb=null;
    if(f)f();
  }
}
function _requireConsent(cb){
  if(_consentGiven){cb();return;}
  _showDisclaimer(true,cb);
}
function _suEl(id){return document.getElementById(id);}
function _suHideTip(){const t=_suEl('su-tip');if(t)t.style.display='none';_suTipOwner=null;}
function _suShowTip(target){
  const tip=_suEl('su-tip');
  tip.textContent=_SU_TIPS[target.dataset.tip]||'';
  tip.style.display='block';
  const r=target.getBoundingClientRect();
  const tw=tip.offsetWidth,th=tip.offsetHeight;
  let x=r.left,y=r.bottom+8;
  if(x+tw>window.innerWidth-8)x=window.innerWidth-8-tw;
  if(x<8)x=8;
  if(y+th>window.innerHeight-8)y=Math.max(8,r.top-th-8);
  tip.style.left=x+'px';tip.style.top=y+'px';
  _suTipOwner=target;
}
// 用紙サイズ判定(Arecalと同じ)。wPt/hPtはPDFのpt単位(scale=1)
function detectPaperSize(wPt,hPt){
  const mm={w:wPt*25.4/72,h:hPt*25.4/72};
  const sizes=[
    {n:'A0',w:841,h:1189},{n:'A1',w:594,h:841},{n:'A2',w:420,h:594},
    {n:'A3',w:297,h:420},{n:'A4',w:210,h:297},{n:'A5',w:148,h:210},
    {n:'B0',w:1000,h:1414},{n:'B1',w:707,h:1000},{n:'B2',w:500,h:707},
    {n:'B3',w:353,h:500},{n:'B4',w:250,h:353},{n:'B5',w:176,h:250}
  ];
  const TOL=8; // mm誤差許容
  const w=mm.w,h=mm.h;
  if(Math.max(w,h)>1200)return 'A0以上の大きな図面';
  if(Math.max(w,h)<100)return 'かなり小さい図面';
  for(const s of sizes){
    if((Math.abs(w-s.w)<TOL&&Math.abs(h-s.h)<TOL)||(Math.abs(w-s.h)<TOL&&Math.abs(h-s.w)<TOL))
      return s.n+(w<h?'（縦）':'（横）');
  }
  return `不定形（${Math.round(w)}×${Math.round(h)}mm）`;
}
// 任意入力の縮尺分母: 1以上・小数第1位まで。不正ならnull(エラー文は呼び出し側が表示)
function _suParseDenom(raw){
  const v=parseFloat(raw);
  if(isNaN(v)||v<1)return null;
  if(Math.abs(v*10-Math.round(v*10))>1e-6)return null; // 小数第2位以下があれば弾く(例: 12.55→NG、12.5→OK)
  return Math.round(v*10)/10;
}
async function _suUpdatePaper(){
  const seq=++_suPaperSeq;
  const el=_suEl('su-paper');
  if(_suGridMode){el.textContent='用紙: A3（横）';return;}
  if(!_suPdf){el.textContent='';return;}
  try{
    const p=await _suPdf.getPage(parseInt(_suEl('su-page').value)||1);
    if(seq!==_suPaperSeq)return;
    const vp=p.getViewport({scale:1});
    el.textContent='用紙: '+detectPaperSize(vp.width,vp.height);
  }catch(e){if(seq===_suPaperSeq)el.textContent='';}
}
function _suInit(){
  if(_suInited)return;_suInited=true;
  _suEl('su-page').addEventListener('change',_suUpdatePaper);
  _suEl('su-scale').addEventListener('change',()=>{
    const isCustom=_suEl('su-scale').value==='custom';
    _suEl('su-custom-row').style.display=isCustom?'flex':'none';
    _suEl('su-err').textContent='';
    if(isCustom){const ci=_suEl('su-custom');ci.focus();ci.select();}
  });
  _suEl('su-custom').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();_suStart();}});
  _suEl('su-read').addEventListener('click',()=>_showDisclaimer(false));
  _suEl('su-start').addEventListener('click',_suStart);
  // r040: 方眼紙モードで開いた時だけ「戻る」(PDF入力画面へ)。枠の外をクリックしても閉じない(誤操作防止)
  _suEl('su-back').addEventListener('click',()=>{
    _suEl('su-overlay').style.display='none';_suGridMode=false;_suHideTip();
  });
  // 解説: マウスはホバーで表示。タッチ端末は「?」ボタンのタップで表示/非表示(ホバーが無いため)。
  document.querySelectorAll('#su-dlg [data-tip]').forEach(t=>{
    t.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')_suShowTip(t);});
    t.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')_suHideTip();});
  });
  document.querySelectorAll('#su-dlg .su-ic').forEach(b=>{
    b.addEventListener('click',e=>{
      e.stopPropagation();
      if(e.pointerType==='mouse')return; // マウスはホバー表示済み(クリックで消えないように)
      const tip=_suEl('su-tip');
      if(_suTipOwner===b&&tip.style.display==='block')_suHideTip();else _suShowTip(b);
    });
  });
  _suEl('su-overlay').addEventListener('click',e=>{
    if(!e.target.closest('.su-ic'))_suHideTip();
  });
}
// pdf=読込済みPDF(通常) / grid=true で方眼紙モード(ページ・元図の線・角度調整はグレーアウト)
function showStartupDialog(pdf,grid){
  _suGridMode=!!grid;_suPdf=grid?null:pdf;_suInit();
  const sel=_suEl('su-page');sel.innerHTML='';
  if(!grid){
    for(let i=1;i<=pdf.numPages;i++){
      const op=document.createElement('option');op.value=String(i);op.textContent='ページ '+i;sel.appendChild(op);
    }
    sel.value='1';
  }else{
    const op=document.createElement('option');op.value='1';op.textContent='―';sel.appendChild(op);
  }
  sel.disabled=grid||pdf.numPages<=1; // 1ページだけの場合は「ページ 1」のみ表示(選択不要)
  _suEl('su-vec').checked=!grid;  _suEl('su-vec').disabled=!!grid;
  _suEl('su-rot').checked=false;  _suEl('su-rot').disabled=!!grid;
  ['su-row-page','su-row-vec','su-row-rot'].forEach(id=>_suEl(id).classList.toggle('su-off',!!grid));
  // r040: 縮尺の既定値は1/100(マスター指示。毎回の選択の手間を省く)。用紙サイズ表示と見比べて違えば変更する
  _suEl('su-scale').value='1/100';
  _suEl('su-back').style.display=grid?'inline-block':'none';
  _suEl('su-custom-row').style.display='none';
  _suEl('su-custom').value='100';
  _suEl('su-err').textContent='';
  _suHideTip();
  _suUpdatePaper();
  _suEl('su-overlay').style.display='flex';
}
function _suStart(){
  const sv=_suEl('su-scale').value;
  const err=_suEl('su-err');
  let denom=null;
  if(!sv){
    err.textContent='⚠ スケール比を選択してください';
    toast('⚠ スケール比を選択してください');
    _suEl('su-scale').focus();
    return;
  }
  if(sv==='custom'){
    const dv=_suParseDenom(_suEl('su-custom').value.trim());
    if(dv===null){err.textContent='⚠ 1以上の数値で入力してください（小数第1位まで）';_suEl('su-custom').focus();return;}
    denom=dv;
  }else{
    denom=parseFloat(sv.split('/')[1]);
  }
  err.textContent='';
  _consentGiven=true; // 「了解してはじめる」=免責に同意
  _suEl('su-overlay').style.display='none';
  _suHideTip();
  if(_suGridMode){
    // 方眼紙モード: 従来の「この縮尺で方眼紙作図を開始」と同じ処理(applyScale→startGridPaperMode)
    _suGridMode=false;
    applyScale('1/'+denom);
    startGridPaperMode();
    return;
  }
  renderPage({page:parseInt(_suEl('su-page').value)||1,vec:_suEl('su-vec').checked,rot:_suEl('su-rot').checked,denom});
}
// ページの描画後(renderPageから呼ばれる)。縮尺適用 →(元図の線ON なら抽出)→(角度調整ON なら回転UI)
async function _startupAfterRender(pg,o){
  _rotPage=pg; // 回転焼き込み対象
  applyScale('1/'+o.denom);
  if(o.vec){
    await extractVecs(pg);
  }else{
    vecPts=[];vecSegs=[];vecGrid=null;
    updVecLineCountLabel(); // スキップ時は本数表示を0に戻す
    toast('⚠ 元図の読み取りをスキップしました（元図スナップは使用できません）',3000);
  }
  fitScreen();
  if(o.rot){
    // 回転UIを開始。OK確定後はbakeRotation()がvecPts/vecSegs/図形ごと回転する
    startRotationUI();
  }
}

async function renderPage(o){
  if(o) pageNum=o.page; // r039: 起動ダイアログで選んだページ
  // sc-modalが表示されている間はisToolsLockedがtrueになる（toolsLockedは不要）
  document.getElementById('loading').style.display='block';
  try{
    const pg=await pdfDoc.getPage(pageNum);
    _rotPage=pg; // 回転焼き込み用に保存
    const vp=pg.getViewport({scale:RS});
    pdfW=vp.width;pdfH=vp.height;
    // pdfCv はPDFサイズのまま
    pdfCv.width=pdfW;pdfCv.height=pdfH;
    pdfCv.style.width=pdfW+'px';pdfCv.style.height=pdfH+'px';
    // drawCvはPDFより一回り大きくする。用紙の上下左右にDRAW_MARGIN_RATIO分の
    // 余白を持たせ、そのぶんdrawCvだけ左上にずらして配置する。paper空間の原点
    // (0,0)はdrawCvのラスタ上では(dcOffX,dcOffY)になるため、実際の描画は
    // redraw()側でこのオフセット分だけctxを平行移動してから行う(drawCtx.setTransform)。
    const DRAW_MARGIN_RATIO = 0.4; // 用紙の縦横それぞれ40%ぶんを外側の作図可能領域にする
    const dcOffX = Math.round(pdfW * DRAW_MARGIN_RATIO);
    const dcOffY = Math.round(pdfH * DRAW_MARGIN_RATIO);
    window._dcOffX = dcOffX; window._dcOffY = dcOffY;
    drawCv.width = pdfW + dcOffX * 2; drawCv.height = pdfH + dcOffY * 2;
    drawCv.style.width = drawCv.width + 'px'; drawCv.style.height = drawCv.height + 'px';
    drawCv.style.position = 'absolute';
    drawCv.style.left = (-dcOffX) + 'px';
    drawCv.style.top = (-dcOffY) + 'px';
    // ★地雷: scale()は各要素自身のtransform-originを中心に働く。pdfCvと違う
    // 静的位置に置くdrawCvは、transform-originも用紙左上と同じ実座標
    // (dcOffX,dcOffY)に明示的に合わせないと、zoom=1以外で必ずズレる。
    drawCv.style.transformOrigin = dcOffX + 'px ' + dcOffY + 'px';
    await pg.render({canvasContext:pdfCtx,viewport:vp}).promise;
    // r039(38回目): 旧フロー(元図の確認→縮尺→角度確認)は通らない。起動ダイアログの選択で
    // 縮尺適用 →(元図の線ON なら抽出)→(角度調整ON なら回転UI)の順に進める。
    await _startupAfterRender(pg,o);
    document.getElementById('loading').style.display='none';
  }catch(err){
    alert('レンダリングエラー: '+err.message);
    document.getElementById('loading').style.display='none';
  }
}

// r023(AreCal移植): Workerへの一回分の問い合わせをまとめた共通関数
function runVecWorker(opsFn,opsArgs,transform,minLen){
  return new Promise((resolve,reject)=>{
    const w=new Worker(_vecWorkerUrl);
    w.onmessage=ev=>{resolve(ev.data.lines);w.terminate();};
    w.onerror=err=>{reject(err);w.terminate();};
    w.postMessage({opsFn,opsArgs,transform,OPS:pdfjsLib.OPS,minLen});
  });
}

// r041: askVecExtractConsent() を削除(元図の線を読むかどうかは起動ダイアログのチェックで選ぶ。r023→r039)

async function extractVecs(pg){
  vecPts=[];vecSegs=[];vecGrid=null;
  try{
    const vp=pg.getViewport({scale:RS});
    const ops=await pg.getOperatorList();
    // ページ対角線に対する相対値で「短すぎる線」の閾値を決める(用紙サイズに追従させる)
    const minLen=Math.max(2,Math.hypot(vp.width,vp.height)*0.003);
    const lines=await runVecWorker(ops.fnArray,ops.argsArray,vp.transform,minLen);
    vecSegs=lines;
    const u=[];
    for(const l of lines){
      for(const p of [l.a,l.b]){
        if(!u.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<2))u.push(p);
      }
    }
    vecPts=u;
    buildVecGrid();
    toast(`✅ 図面から ${vecSegs.length}本 の元図線を抽出しました`,3000);
  }catch(e){
    console.warn('extractVecs error:',e);
    toast('⚠ 元図ベクター抽出でエラーが発生しました（元図スナップは使用できません）',3500);
  }
}

// r023(AreCal移植): vecSegsから空間インデックスを再構築（抽出直後・回転焼き込み後に呼ぶ）
function buildVecGrid(){
  updVecLineCountLabel(); // r095(20回目引継ぎ新4): 元図線読取り本数のUI表示を更新
  if(!vecSegs.length||!pdfW||!pdfH){vecGrid=null;return;}
  vecGrid=new LineGrid(pdfW,pdfH,60);
  for(const s of vecSegs)vecGrid.insert(s);
}
// r095(20回目引継ぎ新4): スナップ距離スライダーの下に元図線の読取り本数を表示
function updVecLineCountLabel(){
  const el=document.getElementById('vec-line-count');
  if(el)el.textContent=vecSegs.length;
}

// ================================================================
//  変換・スナップ（arecalそのまま）
// ================================================================
function applyTrans(){
  // Fix⑥: 移動・ズーム時にスナップ表示をクリア
  showSnap(null);
  let t=`translate(${ox}px,${oy}px) scale(${zoom})`;
  if(rotAngle!==0){
    const cx=pdfW/2,cy=pdfH/2;
    t=`translate(${ox}px,${oy}px) scale(${zoom}) translate(${cx}px,${cy}px) rotate(${rotAngle}deg) translate(${-cx}px,${-cy}px)`;
  }
  pdfCv.style.transform=t;drawCv.style.transform=t;
  redraw();
}
function getLogi(e){
  const r=cvWrap.getBoundingClientRect();
  let lx=(e.clientX-r.left-ox)/zoom;
  let ly=(e.clientY-r.top-oy)/zoom;
  // PDF回転時の逆変換
  if(rotAngle!==0){
    const cx=pdfW/2,cy=pdfH/2;
    const rad=-rotAngle*Math.PI/180;
    const cosR=Math.cos(rad),sinR=Math.sin(rad);
    const dx=lx-cx,dy=ly-cy;
    lx=cx+dx*cosR-dy*sinR;
    ly=cy+dx*sinR+dy*cosR;
  }
  return{x:lx,y:ly};
}

function getSnap(lx,ly){
  const tol=SNAP_PX/zoom;
  let best=null,bd=tol*1.5;
  // v0.0009改: タイプ別最大有効半径で確実に優先制御
  // tolは現在のスナップ半径(mm)。各タイプに倍率をかけてハードカット
  const TOL_INTERSECT = tol * 1.0;  // 交点: 全域有効（同半径内なら最優先）
  const TOL_ENDPOINT  = tol * 0.85; // 端点: 少し狭い
  const TOL_MIDPOINT  = tol * 0.70; // 中点
  const TOL_ONLINE    = tol * 0.40; // 線上: 大幅に狭い（緊張しないで済む距離）

  function chk(px,py,type,maxR){
    const d=Math.hypot(lx-px,ly-py);
    if(d > maxR) return; // 有効半径外は完全無視
    // 同半径内ならタイプ優先度で比較: survey(測点・最優先)>intersect>endpoint>midpoint>online
    // r064: 元図スナップをvector_endpoint/vector_intersect/vector_onlineに分割(元は一律'vector':2)
    const PRI={survey:5,intersect:4,endpoint:3,yamadome:3,midpoint:2,online:1,vector_intersect:2.3,vector_endpoint:2.2,vector_online:2.1,first:99};
    const score = PRI[type]||1;
    if(best===null || d < bd - 0.5/zoom || (Math.abs(d-bd)<0.5/zoom && score > (PRI[best.type]||1))){
      bd=d; best={x:px,y:py,type};
    }
  }
  // r064(マスター指示): 元図スナップが常に「元図」とだけ表示され、交点/端点/線上の
  // 区別がつかなかったため、type自体をvector_endpoint/vector_intersect/vector_onlineに
  // 分割し、表示ラベルを「元図端点」「元図交点」「元図線上」に差別化する。
  if(snapOn.vector&&vecGrid){
    const nearSegs=vecGrid.getLinesNear(lx,ly);
    if(snapOn.endpoint){for(const s of nearSegs){chk(s.a.x,s.a.y,'vector_endpoint',tol*0.85);chk(s.b.x,s.b.y,'vector_endpoint',tol*0.85);}}
    if(snapOn.intersect){
      for(let i=0;i<nearSegs.length;i++)for(let j=i+1;j<nearSegs.length;j++){
        const p=segIntersect(nearSegs[i].a,nearSegs[i].b,nearSegs[j].a,nearSegs[j].b);
        if(p)chk(p.x,p.y,'vector_intersect',TOL_INTERSECT);
      }
    }
    if(snapOn.online){for(const{a,b}of nearSegs){const p=nearestOnSeg(lx,ly,a,b);if(p)chk(p.x,p.y,'vector_online',TOL_ONLINE);}}
  }else if(snapOn.vector){
    // vecGrid未構築時(旧データ等)のフォールバック: 線形探索（交点探索は重いため省略）
    if(snapOn.endpoint){for(const p of vecPts)chk(p.x,p.y,'vector_endpoint',tol*0.85);}
    if(snapOn.online){for(const{a,b}of vecSegs){const p=nearestOnSeg(lx,ly,a,b);if(p)chk(p.x,p.y,'vector_online',TOL_ONLINE);}}
  }
  // r025(マスター指示⑩): 測点は「端点」に相乗りさせず、独立した'survey'タイプの
  // 専用スナップとする。表示ラベルも「測点」になり、かつ最優先(PRI最高値)で拾う。
  if(snapOn.survey){for(const p of surveyPts)chk(p.x,p.y,'survey',TOL_ENDPOINT);}
  const segs=[];
  // r044: 山留も他図形と同じくスナップ対象にする。yamadome.ptsは既にpx座標(生の
  // in-memory値)なので他のshapesと同じ扱いでよい。segsに合流させることで、
  // 下の交点(intersect)計算ループが山留×他図形の交点も自動的に拾うようになる。
  if(snapOn.yamadome && typeof yamadome !== 'undefined' && yamadome && yamadome.pts && yamadome.pts.length>=2){
    const ypts = yamadome.pts, yn = ypts.length;
    for(let i=0;i<yn;i++){
      const a=ypts[i], b=ypts[(i+1)%yn];
      segs.push({a,b});
      chk(a.x,a.y,'yamadome',TOL_ENDPOINT);
      chk((a.x+b.x)/2,(a.y+b.y)/2,'yamadome',TOL_MIDPOINT);
    }
    for(const{a,b}of ypts.map((p,i)=>({a:p,b:ypts[(i+1)%yn]}))){
      const p=nearestOnSeg(lx,ly,a,b);if(p)chk(p.x,p.y,'yamadome',TOL_ONLINE);
    }
  }
  for(const sh of shapes){
    const pts=sh.pts||[];const n=pts.length;
    for(let i=0;i<n;i++){
      const a=pts[i],b=pts[(i+1)%n];segs.push({a,b});
      if(snapOn.endpoint){chk(a.x,a.y,'endpoint',TOL_ENDPOINT);chk(b.x,b.y,'endpoint',TOL_ENDPOINT);}
      if(snapOn.midpoint){chk((a.x+b.x)/2,(a.y+b.y)/2,'midpoint',TOL_MIDPOINT);}
    }
  }
  if(snapOn.online){for(const{a,b}of segs){const p=nearestOnSeg(lx,ly,a,b);if(p)chk(p.x,p.y,'online',TOL_ONLINE);}}
  if(snapOn.intersect){
    // (動作軽量化・24回目): 交点探索の総当たりO(E²)がオブジェクト数に対して
    // 重すぎたため、事前にカーソル近傍の線分だけへ絞り込んでから総当たりする。
    // 「交点PがカーソルからTOL_INTERSECT以内」ならば、Pはその線分上の点である以上、
    // 線分自体とカーソルの最短距離もTOL_INTERSECT以内のはず(線分上の最近点は
    // Pと同じかPより近い)。よってこの絞り込みは近似ではなく厳密に正しく、
    // 結果はビット単位で従来と同一。近傍線分数kが小さければ計算量はO(E+k²)まで
    // 落ちる(全図形数Eに対しては線形、実際に効くのはカーソル周辺の密度だけ)。
    const nearSegsForIntersect = segs.filter(s => _distPtSeg(lx,ly,s.a,s.b) <= TOL_INTERSECT);
    for(let i=0;i<nearSegsForIntersect.length;i++)for(let j=i+1;j<nearSegsForIntersect.length;j++){
      const p=segIntersect(nearSegsForIntersect[i].a,nearSegsForIntersect[i].b,nearSegsForIntersect[j].a,nearSegsForIntersect[j].b);
      if(p)chk(p.x,p.y,'intersect',TOL_INTERSECT);
    }
  }
  // v0.0012: 方眼スナップ（方眼紙モード時のみ・最低優先度）
  if(_gridPaperActive && snapOn.grid){
    // v0.0013: RS倍canvasに合わせてgridPxもRS倍
    const gridPx = calcGridM(scaleDenom) * 1000 * RS * 72 / (25.4 * scaleDenom);
    const cx = pdfCv.width / 2, cy = pdfCv.height / 2;
    const offX = cx % gridPx, offY = cy % gridPx;
    const gx = Math.round((lx - offX) / gridPx) * gridPx + offX;
    const gy = Math.round((ly - offY) / gridPx) * gridPx + offY;
    const TOL_GRID = tol * 0.55;
    chk(gx, gy, 'grid', TOL_GRID);
  }
  if(drawing&&(tool==='poly'||tool==='yamadome')&&cur&&cur.pts.length>=3){
    const p0=cur.pts[0];
    if(Math.hypot(lx-p0.x,ly-p0.y)<(SNAP_PX*2)/zoom)best={x:p0.x,y:p0.y,type:'first'};
  }
  return best;
}

// (動作軽量化・24回目): 点と線分の「正確な」最短距離。nearestOnSeg()は
// スナップ表示位置の都合でtを[0.05,0.95]にクランプしており、getSnap()の
// intersect絞り込み用途にはそのままだと端点付近でわずかに距離が狂うため、
// クランプ無し(t∈[0,1]のみ)の専用版を用意する。
function _distPtSeg(px,py,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
  if(len2<1e-9)return Math.hypot(px-a.x,py-a.y);
  let t=((px-a.x)*dx+(py-a.y)*dy)/len2;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(px-(a.x+t*dx),py-(a.y+t*dy));
}
function nearestOnSeg(px,py,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
  if(len2<1e-6)return null;
  let t=((px-a.x)*dx+(py-a.y)*dy)/len2;
  t=Math.max(0.05,Math.min(0.95,t));
  return{x:a.x+t*dx,y:a.y+t*dy};
}
function segIntersect(a,b,c,d){
  const r={x:b.x-a.x,y:b.y-a.y},s={x:d.x-c.x,y:d.y-c.y};
  const denom=r.x*s.y-r.y*s.x;
  if(Math.abs(denom)<1e-8)return null;
  const t=((c.x-a.x)*s.y-(c.y-a.y)*s.x)/denom;
  const u=((c.x-a.x)*r.y-(c.y-a.y)*r.x)/denom;
  if(t>=0&&t<=1&&u>=0&&u<=1)return{x:a.x+t*r.x,y:a.y+t*r.y};
  return null;
}
// r095(マスター指摘・20回目引継ぎ1B): 論理座標(lx,ly)→画面(client)座標への変換。
// getLogi()の逆変換(PDF回転時の座標変換も含めて正しく対応)。
function logiToClient(lx,ly){
  const r=cvWrap.getBoundingClientRect();
  let x=lx,y=ly;
  if(rotAngle!==0){
    const cx0=pdfW/2,cy0=pdfH/2;
    const rad=rotAngle*Math.PI/180;
    const cosR=Math.cos(rad),sinR=Math.sin(rad);
    const dx=lx-cx0,dy=ly-cy0;
    x=cx0+dx*cosR-dy*sinR;
    y=cy0+dx*sinR+dy*cosR;
  }
  return{cx:x*zoom+ox+r.left, cy:y*zoom+oy+r.top};
}
function showSnap(snap,cx,cy){
  ['endpoint','survey','midpoint','online','intersect','vector','first'].forEach(k=>{
    const el=document.getElementById('sd-'+k);
    if(el)el.style.display='none';
  });
  // r095(マスター指摘・20回目引継ぎ1B): インジケーター(ドット・ラベルとも)は
  // マウスカーソル位置ではなく、実際のスナップ先の座標(snap.x/snap.y)に表示する。
  // snapがある場合は必ずlogiToClient()で変換した位置を使う(引数cx,cyは
  // スナップ無し時のフォールバック用途のみに限定)。
  let dispCx=cx, dispCy=cy;
  if(snap){
    const p=logiToClient(snap.x,snap.y);
    dispCx=p.cx; dispCy=p.cy;
  }
  // Fix13: スナップインジケーター表示
  const ind=document.getElementById('snap-indicator');
  if(ind){
    if(snap&&dispCx!==undefined){
      const labels={endpoint:'端点',survey:'測点',midpoint:'中点',online:'線上',intersect:'交点',vector_endpoint:'元図端点',vector_intersect:'元図交点',vector_online:'元図線上',grid:'方眼',first:'Snap!',yamadome:'山留'};
      ind.textContent='⬤ '+(labels[snap.type]||'Snap!');
      ind.style.display='block';
      ind.style.left=(dispCx+14)+'px';
      ind.style.top=(dispCy-50)+'px'; // 寸法ラベルと重ならないよう上に
    }else{
      ind.style.display='none';
    }
  }
  if(!snap)return;
  // r064: vector_endpoint/vector_intersect/vector_onlineはラベル表示用に細分化したが、
  // 対応する画面上のドットindicator要素はsd-vector 1つを共有する
  const dotId = snap.type.startsWith('vector_') ? 'sd-vector' : 'sd-'+snap.type;
  const el=document.getElementById(dotId);
  if(!el)return;
  el.style.display='block';el.style.left=dispCx+'px';el.style.top=dispCy+'px';
}

// 新1(2026-08-28 引継ぎ18回目マスター指示→26回目セッションで紫に移設):
// 紫(強制垂直)オブジェクトへのマウスオーバー時に「強制垂直オブジェクト」と
// カーソル付近に表示する
function showVerticalHoverTip(show,cx,cy){
  const el=document.getElementById('vertical-hover-tip');
  if(!el)return;
  if(show&&cx!==undefined){
    el.textContent='🟪 強制垂直オブジェクト';
    el.style.display='block';
    el.style.left=(cx+14)+'px';
    el.style.top=(cy-50)+'px'; // snap-indicatorと重ねないよう同位置に統一(排他利用のため衝突なし)
  }else{
    el.style.display='none';
  }
}

// ================================================================
//  描画ツール
// ================================================================
function startTool(t){
  if(typeof editMode!=='undefined' && editMode) setEditMode(false); // r037: 修正モード中に作図ツールを開始したら修正モードを終了
  if(surveyMode)setSurveyMode(false); // r024(AreCal移植): 他ツール開始で測点モード終了
  // r073(21回目引継ぎ・マスター報告「距離測定→山留の連続押しでボタンが2つONになり、
  // 山留キャンセル後に距離測定が誤発火する」): startTool()はsurveyModeは終了させて
  // いたのにdistMode(距離測定)だけ同じ扱いになっておらず見落としだった。他の作図
  // ツールを開始する時点でdistModeも必ず終了させ、ボタンのON状態とモードの実体を
  // 一致させる。
  if(distMode)setDistMode(false);
  if(drawing){rectLoop=false;polyLoop=false;cancelDraw();}
  // r075マスター指示: 何かを選択したまま別の矩形/多角形を作図しようとすると選択色が
  // 残ったままになる不具合の修正。新規作図開始時に必ず選択状態をクリアする。
  if(selectedSet.size>0){ clearSelection(); }
  tool=t;drawing=true;cur={pts:[]};
  document.getElementById('rect-btn').classList.toggle('on',t==='rect');
  document.getElementById('poly-btn').classList.toggle('on',t==='poly');
  // r075: リピート機能(Enterキー)用に直前使用ツールを記録。構台(kotai)は対象外のためここには来ない。
  if(t==='rect'||t==='poly') _lastDrawToolForRepeat = t;
  else _invalidateRepeat(); // 追加修正・項目7: rect/poly以外のツールに切り替えたらリピート無効化
  // r025(マスター指示④): 連続入力機能を廃止。以前はここでrectLoop/polyLoopを
  // trueにして1つ描き終えても自動的に次の作図に入れていたが、今後は1つ描く
  // 毎に必ずツールボタンを押し直す運用にする（rectLoop/polyLoopは常にfalseの
  // ままにし、下流のループ再突入分岐を無効化する）。
}
function cancelDraw(){
  drawing=false;cur=null;rectLoop=false;polyLoop=false;tool=null;
  _startToolEndCooldown();
  ['rect-btn','poly-btn','yamadome-btn'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn){btn.classList.remove('on');btn.style.background='';btn.style.borderColor='';}
  });
  setToolBar('');showSnap(null);redraw();
}
// (24回目)(24回目・追加修正・項目8): Voldia本体⇔3Dイメージ⇔配置モードの画面遷移時に、
// 前の画面で使いかけだったツール/モードを全キャンセルする共通関数。
// window.に明示公開(closeIoPanelがDOMContentLoaded内ローカル関数のままだった
// せいで外部JSから呼べていなかった教訓を反映し、同じ轍を踏まないようにする)。
window.cancelAllTools = function(){
  _invalidateRepeat();
  if(editMode) setEditMode(false); // r037
  if(drawing) cancelDraw();
  if(distMode) setDistMode(false);
  if(surveyMode) setSurveyMode(false);
  if(selUnionMode) setSelUnionMode(false);
  if(subMode) setSubMode(false);
  if(typeof yamadomeEditMode!=='undefined' && yamadomeEditMode){ yamadomeEditMode=false; yamadomeEditVtx=-1; yamadomeEditVtxStart=null; showSnap(null); }
  if(selectedSet && selectedSet.size>0) clearSelection();
  setToolBar('');
};

function onMouseDown(e){
  if(isToolsLocked())return;
  if(e.button===1||spaceDown)return;
  if(e.button===2){
    // 測点 右クリック削除（r024: AreCal移植。測点設置モード中もOFF中もどちらも削除可能）
    if(surveyPts.length>0 && !drawing && !distMode){
      const{x:lxS,y:lyS}=getLogi(e);
      const hitR=surveyMode?12:14;
      const hitS=surveyPts.findIndex(p=>Math.hypot(p.x-lxS,p.y-lyS)<hitR/zoom);
      if(hitS>=0){
        pushUndo();surveyPts.splice(hitS,1);redraw();
        if(!surveyMode)toast('🗑 測点を削除',800);
        return;
      }
    }
    if(distMode){
      // v0.0013: 右クリック=1個戻る。戻る点がなければ終了
      if(distPts.length>1){
        distPts.pop();
        const dr=document.getElementById('dist-result');
        const mpp=scaleDenom?(25.4/72)*scaleDenom/1000/RS:0;
        if(distPts.length===1){
          dr.textContent='📏 次の点をクリック';
        } else {
          const p0=distPts[distPts.length-2], p1=distPts[distPts.length-1];
          const dx=(p1.x-p0.x)*mpp, dy=(p1.y-p0.y)*mpp;
          let seg=Math.sqrt(dx*dx+dy*dy);
          let total=0;
          for(let i=1;i<distPts.length;i++){
            const ax=(distPts[i].x-distPts[i-1].x)*mpp, ay=(distPts[i].y-distPts[i-1].y)*mpp;
            total+=Math.sqrt(ax*ax+ay*ay);
          }
          if(mpp&&snapRound>0){seg=Math.round(seg*1000/snapRound)*snapRound/1000;total=Math.round(total*1000/snapRound)*snapRound/1000;}
          const totText=distPts.length>=3?(mpp?`　合計: ${total.toFixed(3)} m`:''):'';
          dr.textContent=mpp?`📏 ${seg.toFixed(3)} m`+totText:`📏 ${Math.hypot(p1.x-p0.x,p1.y-p0.y).toFixed(1)} px`;
        }
        redraw(); toast('↩ 1点戻りました'); return;
      } else {
        setDistMode(false); toast('📏 距離測定終了'); return;
      }
    }
    // v0.0020→r065: 山留の削除はダブルクリックに変更(下記window 'dblclick'リスナー参照)
    if(drawing&&tool==='rect'){rectLoop=false;cancelDraw();return;}
    if(drawing&&tool==='poly'){polyLoop=false;cancelDraw();return;}
    if(drawing&&tool==='yamadome'){cancelDraw();return;}
    if(selectedSet.size>0){clearSelection();return;}
    return;
  }
  const{x:lx,y:ly}=getLogi(e);

  // r037: ✏修正モード中は頂点ドラッグだけを受け付ける(他の作図・選択・山留ドラッグには入らない)
  if(editMode){ if(e.button===0) editMouseDown(lx,ly); return; }

  // 山留 頂点ドラッグ（描画中でない時）
  // 追加1(2026-08-24 引継ぎ18回目マスター報告): distMode(距離測定)・surveyMode
  // (測点設置)の判定が抜けていたため、これらのツール使用中に山留頂点をクリック
  // すると距離測定/測点設置ではなく山留ドラッグが発動してしまっていた。
  // 「山留頂点ドラッグはツール未選択時のみ」という方針に合わせ、他ツール使用中
  // 判定(distMode/surveyMode/selUnionMode/subMode)を追加。
  if(!drawing && !distMode && !surveyMode && !selUnionMode && !subMode && yamadome && yamadome.pts && yamadome.pts.length>=3 && e.button===0){
    // 頂点近くをクリック → ドラッグ移動開始
    const HIT=10/zoom;
    const vi=yamadome.pts.findIndex(p=>Math.hypot(p.x-lx,p.y-ly)<HIT);
    if(vi>=0){
      yamadomeEditMode=true;yamadomeEditVtx=vi;
      // 新7-再修正(マスター指摘): 直交移動の基準点は隣接頂点ではなく、
      // 「ドラッグ移動する頂点の初期位置」固定とする。ドラッグ開始時に記憶。
      yamadomeEditVtxStart={x:yamadome.pts[vi].x,y:yamadome.pts[vi].y};
      setToolBar('🏗 山留の頂点を移動します。頂点を増やすことは出来ません');
      return;
    }
  }

  // 測点設置モード（r025: AreCal移植 — スナップ点のみ・設置はオフセットダイアログ経由）
  if(surveyMode&&e.button===0){
    const snap=getSnap(lx,ly);
    if(!snap){toast('⚠ スナップ点のみ選択可能です（端点・中点・線上・交点・元図など）');return;}
    showSnap(null);
    openSurveyDialog({x:snap.x,y:snap.y});
    return;
  }

  // 距離測定モード（v0.0013: チェーン計測・累計表示・全線残存）
  if(distMode&&e.button===0){
    let{x:lx2,y:ly2}={x:lx,y:ly};
    if(shiftDown&&distPts.length>=1){
      const last=distPts[distPts.length-1];
      const o=s90(last.x,last.y,lx2,ly2);lx2=o.x;ly2=o.y;
    }
    const snap=getSnap(lx2,ly2);
    showSnap(snap,e.clientX,e.clientY);
    const pt=snap?{x:snap.x,y:snap.y}:roundPt({x:lx2,y:ly2});
    // 全点をチェーンで保持（上書きしない）
    distPts.push(pt);
    if(distPts.length===1){
      setStatus('📏 距離計測: 次の点をクリック（Shiftで直交）');
      redraw();
    }
    if(distPts.length>=2){
      const mpp=scaleDenom?(25.4/72)*scaleDenom/1000/RS:0;
      const p0=distPts[distPts.length-2], p1=distPts[distPts.length-1];
      const dx=(p1.x-p0.x)*mpp, dy=(p1.y-p0.y)*mpp;
      let seg=Math.sqrt(dx*dx+dy*dy);
      let total=0;
      for(let i=1;i<distPts.length;i++){
        const ax=(distPts[i].x-distPts[i-1].x)*mpp, ay=(distPts[i].y-distPts[i-1].y)*mpp;
        total+=Math.sqrt(ax*ax+ay*ay);
      }
      if(mpp&&snapRound>0){seg=Math.round(seg*1000/snapRound)*snapRound/1000;total=Math.round(total*1000/snapRound)*snapRound/1000;}
      const dr=document.getElementById('dist-result');
      const segText=mpp?`📏 ${seg.toFixed(3)} m`:`📏 ${Math.hypot(p1.x-p0.x,p1.y-p0.y).toFixed(1)} px`;
      const totText=distPts.length>=3?(mpp?`　合計: ${total.toFixed(3)} m`:''):'';
      dr.textContent=segText+totText;
      dr.style.display='block';
      setStatus('📏 続けてクリックで連続計測（右クリック=1点戻る・ESCで終了）');
      redraw();
    }
    return;
  }

  // 部分削除モード: 図形クリックで選択
  if(subMode&&e.button===0){
    const idx=hitTestShape(lx,ly);
    if(idx>=0)toggleSub(idx);
    return;
  }

  // 選択合成モード: 図形クリックで選択
  if(selUnionMode&&e.button===0){
    const idx=hitTestShape(lx,ly);
    if(idx>=0){
      if(selUnionSet.has(idx))selUnionSet.delete(idx);
      else selUnionSet.add(idx);
      updSelUnionToolbar();updSidebar();redraw();
    }
    return;
  }

  // r025(AreCal移植): 通常モード中に既存測点をクリック → 移動ダイアログ
  if(!drawing&&!distMode&&!selUnionMode&&!subMode&&!surveyMode&&e.button===0&&surveyPts.length>0){
    const hitSv=surveyPts.findIndex(p=>Math.hypot(p.x-lx,p.y-ly)<14/zoom);
    if(hitSv>=0){openSurveyDialog(surveyPts[hitSv],hitSv);return;}
  }

  // Fix15: 通常モード（非作図・非特殊）でクリック選択
  if(!drawing&&!distMode&&!selUnionMode&&!subMode&&e.button===0){
    const idx=hitTestShape(lx,ly);
    if(idx>=0){
      toggleSelected(idx,e.shiftKey);
    }else{
      clearSelection();
    }
    return;
  }
  if(!drawing||!cur)return;
  if(e.detail===2&&(tool==='poly'||tool==='yamadome')&&cur.pts.length>=2){
    finishShape();return;
  }
  // A2(2026-08-25 引継ぎ16回目マスター報告): mousemoveのプレビュー(仮想線)では
  // Shift直交(s90)を適用していたのに、確定クリック側(ここ)では未適用だったため、
  // 見た目は直交でもクリック位置＝実際のマウス座標にそのまま頂点が置かれていた。
  // 距離測定モード(onMouseDown内のdistMode分岐)と同じ考え方で、直交後の座標を
  // スナップ判定にも使うよう修正。
  let lx2=lx, ly2=ly;
  if(shiftDown&&(tool==='poly'||tool==='yamadome')&&cur.pts.length>0){
    const last=cur.pts[cur.pts.length-1];
    ({x:lx2,y:ly2}=s90(last.x,last.y,lx,ly));
  }
  const snap=getSnap(lx2,ly2);
  if(snap&&snap.type==='first'&&cur.pts.length>=3){finishShape();return;}
  showSnap(snap,e.clientX,e.clientY);
  setTimeout(()=>showSnap(null),500);
  const rawPt=snap?{x:snap.x,y:snap.y}:{x:lx2,y:ly2};
  const pt=snap?rawPt:roundPt(rawPt);
  cur.pts.push(pt);
  if(tool==='rect'&&cur.pts.length===2)finishShape();
}

function onMouseMove(e){
  const{x:lx,y:ly}=getLogi(e);
  window.lastMx=lx; window.lastMy=ly; // ArrowKey時プレビュー更新用
  if(editMode){ editMouseMove(e,lx,ly); return; } // r037: ✏修正モード
  // 新1(2026-08-28 引継ぎ18回目): 他モードに切り替わった際にグレーホバー表示が
  // 残らないよう、まず非表示にしてからアイドル時のみ再表示する
  showVerticalHoverTip(false);
  // 距離測定ゴムライン
  if(distMode&&distPts.length===0){
    // Fix3: 1点目クリック前もスナップ表示
    const presnap=getSnap(lx,ly);
    showSnap(presnap,e.clientX,e.clientY);
    return;
  }
  if(distMode&&distPts.length>=1){
    let{x:lx2,y:ly2}={x:lx,y:ly};
    if(shiftDown){const last=distPts[distPts.length-1];const o=s90(last.x,last.y,lx2,ly2);lx2=o.x;ly2=o.y;}
    // Fix3: 距離測定中もオブジェクトスナップ適用
    const dsnap=getSnap(lx2,ly2);
    showSnap(dsnap,e.clientX,e.clientY);
    if(dsnap){lx2=dsnap.x;ly2=dsnap.y;}
    if(animId)cancelAnimationFrame(animId);
    animId=requestAnimationFrame(()=>redrawWithDistLine(lx2,ly2));
    return;
  }
  // r026: 測点設置モード中もスナップ表示を出す（設置可否がひと目でわかるように）
  if(surveyMode){
    const svsnap=getSnap(lx,ly);
    showSnap(svsnap,e.clientX,e.clientY);
    return;
  }
  // 山留頂点ドラッグ中
  if(yamadomeEditMode && yamadomeEditVtx>=0 && yamadome){
    // 新7-再修正(マスター指摘): 直交移動の基準は隣接頂点ではなく、ドラッグ開始時の
    // 頂点初期位置(yamadomeEditVtxStart)。また、スナップは「オブジェクトグリップ
    // (他図形の端点)」のみに限定する。getSnap()は山留自身の辺やオンライン/交点
    // まで拾うため、頂点をどこに動かしても常に何かしらヒットしてしまい
    // 「何もない所でもスナップが出る」原因になっていた。
    let vx=lx,vy=ly;
    if(shiftDown && yamadomeEditVtxStart){
      ({x:vx,y:vy}=s90(yamadomeEditVtxStart.x,yamadomeEditVtxStart.y,vx,vy));
    }
    const tol=SNAP_PX/zoom;
    let gsnap=null,gd=tol*0.85;
    for(const sh of shapes){
      for(const p of (sh.pts||[])){
        const d=Math.hypot(vx-p.x,vy-p.y);
        if(d<gd){gd=d;gsnap={x:p.x,y:p.y,type:'endpoint'};}
      }
    }
    showSnap(gsnap,e.clientX,e.clientY);
    if(gsnap){vx=gsnap.x;vy=gsnap.y;}
    yamadome.pts[yamadomeEditVtx]={x:vx,y:vy};
    if(animId)cancelAnimationFrame(animId);
    animId=requestAnimationFrame(()=>redraw());
    return;
  }
  // 新1(2026-08-28 引継ぎ18回目マスター指示→26回目セッションで紫に移設):
  // ツール未使用時、紫(強制垂直)オブジェクト上にカーソルがある場合、その旨を
  // カーソル付近に表示する。drawing中は既存のプレビュー処理と競合しないよう対象外とする。
  if(!drawing){
    const hoverIdx=hitTestShape(lx,ly);
    const isVertical = hoverIdx>=0 && shapes[hoverIdx].color==='purple' && shapes[hoverIdx].enabled!==false;
    showVerticalHoverTip(isVertical,e.clientX,e.clientY);
  }
  if(!drawing||!cur)return;
  let mx=lx,my=ly;
  // A1(2026-08-25 引継ぎ16回目マスター要望): 山留作図でもShift直交を効かせたいとの
  // ことなので、多角形と同じ条件にtool==='yamadome'を追加。
  if(shiftDown&&(tool==='poly'||tool==='yamadome')&&cur.pts.length>0){
    const last=cur.pts[cur.pts.length-1];
    ({x:mx,y:my}=s90(last.x,last.y,lx,ly));
  }
  const snap=getSnap(mx,my);
  showSnap(snap,e.clientX,e.clientY);
  if(snap){mx=snap.x;my=snap.y;}
  else{// Fix1: スナップがない場合はgridスナップ
    const rp=roundPt({x:mx,y:my});mx=rp.x;my=rp.y;
  }
  if(animId)cancelAnimationFrame(animId);
  animId=requestAnimationFrame(()=>redraw(mx,my));
}

function redrawWithDistLine(mx,my){
  redraw(mx,my);
  if(!distPts.length)return;
  const ctx=drawCtx;
  ctx.save();
  ctx.strokeStyle='#f0c040';ctx.lineWidth=1.5/zoom;ctx.setLineDash([6/zoom,3/zoom]);
  // 既存点を繋ぐ
  ctx.beginPath();
  ctx.moveTo(distPts[0].x,distPts[0].y);
  for(let i=1;i<distPts.length;i++)ctx.lineTo(distPts[i].x,distPts[i].y);
  // ゴムライン（最後の点→マウス）
  ctx.lineTo(mx,my);
  ctx.stroke();
  ctx.setLineDash([]);
  // 各点に丸
  for(const p of distPts){
    ctx.fillStyle='#f0c040';
    ctx.beginPath();ctx.arc(p.x,p.y,5/zoom,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function s90(x0,y0,mx,my){
  const dx=mx-x0,dy=my-y0;
  const a=Math.atan2(dy,dx);
  const sn=Math.round(a/(Math.PI/2))*(Math.PI/2);
  const d=Math.hypot(dx,dy);
  return{x:x0+Math.cos(sn)*d,y:y0+Math.sin(sn)*d};
}

function finishShape(){
  if(!cur)return;
  const pts=cur.pts;
  // 山留ツールの完了
  if(tool==='yamadome'){
    if(pts.length<3){cancelDraw();return;}
    pushUndo();
    yamadome={pts:[...pts]};
    cur=null; drawing=false; tool=null;
    _startToolEndCooldown();
    document.getElementById('yamadome-btn').classList.remove('on');
    document.getElementById('yamadome-btn').style.opacity='0.4';
    // (24回目)(24回目・追加チェック項目5): 完成後もステータスバーに「山留作図中」が
    // 残り続けるバグを修正(他のfinishShape完了パスと同様setToolBar('')が漏れていた)。
    setToolBar('');
    showSnap(null); // 新8(2026-08-28 引継ぎ18回目マスター指示): 作図完了時に残るsnap表示を即消す
    toast('✅ 仮想山留を設置しました');
    redraw(); return;
  }
  if(tool==='rect'&&pts.length===2){
    const[p0,p1]=pts;
    const rad=rectAngle*Math.PI/180;
    const cosA=Math.cos(rad),sinA=Math.sin(rad);
    // Arecal方式: 逆回転でw/h算出してからrotFで4点生成
    const ddx=p1.x-p0.x,ddy=p1.y-p0.y;
    let w=ddx*cosA+ddy*sinA, h=-ddx*sinA+ddy*cosA;
    if(shiftDown){const s=Math.min(Math.abs(w),Math.abs(h));w=s*Math.sign(w);h=s*Math.sign(h);}
    function rotF(lx,ly){return {x:p0.x+lx*cosA-ly*sinA,y:p0.y+lx*sinA+ly*cosA};}
    cur.pts=[rotF(0,0),rotF(w,0),rotF(w,h),rotF(0,h)].map(roundPt);
  }
  if(cur.pts.length<2){cancelDraw();return;}

  // v0.0009: 自己交差チェック → Clipper SimplifyPolygon で自動分割
  // 面積ゼロチェック → 自動削除
  const ptsToCommit = cur.pts;
  {
    const SF_SI = 1e6; // スケールファクター（px→int）
    const clipPoly = ptsToCommit.map(p=>({X:Math.round(p.x*SF_SI), Y:Math.round(p.y*SF_SI)}));
    const simplified = ClipperLib.Clipper.SimplifyPolygon(
      clipPoly, ClipperLib.PolyFillType.pftNonZero
    );
    const MIN_AREA_M2 = 1e-2; // r061: 極細スリバー対策で0.01m²に引き上げ(旧0.0001m²)

    if(simplified.length === 0){
      // 完全に面積ゼロ
      cancelDraw();
      toast('⚠️ 面積がゼロのため追加しませんでした');
      return;
    } else if(simplified.length === 1){
      // 自己交差なし or 1ピースに収まった → 頂点を戻す
      const area = calcArea(ptsToCommit);
      if(area < MIN_AREA_M2){
        cancelDraw();
        toast('⚠️ 面積が小さすぎるため追加しませんでした');
        return;
      }
      // 通常ルートへ（ptsToCommitはそのまま使用）
    } else {
      // 自己交差あり → 複数ポリゴンに分割して全部追加
      pushUndo();
      let addedCount = 0, skippedCount = 0;
      simplified.forEach((poly, idx) => {
        // Clipper整数→元座標に逆変換
        const newPts = poly.map(p=>roundPt({x:p.X/SF_SI, y:p.Y/SF_SI}));
        const area = calcArea(newPts);
        if(area < MIN_AREA_M2){ skippedCount++; return; }
        const shIdx2 = shapes.length + 1;
        shapes.push({
          type: tool,
          pts: newPts,
          area: area,
          depthBeam: '-1800', overdig: '0', noSlope: true,
          color: currentToolColor, enabled: true,
          name: `${tool==='rect'?'四角形':'多角形'}${shIdx2}`
        });
        addedCount++;
      });
      const prevTool2 = tool;
      cur = null;
      updSidebar();
      let msg = `⚠️ 自己交差を検出。${addedCount}個に分割しました`;
      if(skippedCount > 0) msg += `（${skippedCount}個は面積が小さすぎるため除外）`;
      toast(msg);
      if(rectLoop && prevTool2==='rect'){cur={pts:[]};redraw();return;}
      if(polyLoop && prevTool2==='poly'){cur={pts:[]};redraw();return;}
      drawing=false; tool=null; polyLoop=false;
      _startToolEndCooldown();
      document.getElementById('rect-btn').classList.remove('on');
      document.getElementById('poly-btn').classList.remove('on');
      // (24回目)(24回目・追加修正・項目4): 通常完了パスと同様、ステータスバーの
      // 残留を修正しリピート可の常設表示に統一
      if(_lastDrawToolForRepeat){
        setToolBar(`⏎ Enterでツールを繰り返し`);
      } else {
        setToolBar('');
      }
      redraw();
      showSnap(null); // 新8(2026-08-28 引継ぎ18回目マスター指示): 作図完了時に残るsnap表示を即消す
      return; // 分割ルートはここで終了
    }
  }

  const shIdx=shapes.length+1;
  const sh={type:tool,pts:cur.pts,area:calcArea(cur.pts),
            depthBeam:'-1800',overdig:'0',noSlope:true,
            color:currentToolColor,enabled:true,
            name:`${tool==='rect'?'四角形':'多角形'}${shIdx}`}; // Fix11: 名前付き
  pushUndo();
  shapes.push(sh);
  const prevTool=tool;cur=null;
  updSidebar();
  toast(`✅ 図形${shapes.length} — ${sh.area.toFixed(4)} m²`);
  if(rectLoop&&prevTool==='rect'){cur={pts:[]};redraw();return;}
  if(polyLoop&&prevTool==='poly'){cur={pts:[]};redraw();return;}
  drawing=false;tool=null;polyLoop=false;
  _startToolEndCooldown();
  document.getElementById('rect-btn').classList.remove('on');
  document.getElementById('poly-btn').classList.remove('on');
  // (24回目)(24回目・追加修正・項目4): 完成後も上部に「◯◯作図中」の文言が残る
  // バグを修正。マスター案の通り、リピート可能な旨をここ(ステータスバー)に
  // 常設表示する形に変更(トースト側の同文言は削除)。
  if(_lastDrawToolForRepeat){
    setToolBar(`⏎ Enterでツールを繰り返し`);
  } else {
    setToolBar('');
  }
  redraw();
  showSnap(null); // 新8(2026-08-28 引継ぎ18回目マスター指示): 作図完了時に残るsnap表示を即消す
}
// 点がポリゴン内にあるか（Ray casting）
function pointInPoly(px,py,pts){
  let inside=false;
  const n=pts.length;
  for(let i=0,j=n-1;i<n;j=i++){
    const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;
    if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi))
      inside=!inside;
  }
  return inside;
}

function hitTestShape(lx,ly){
  for(let i=shapes.length-1;i>=0;i--){
    if(shapes[i].enabled===false)continue;
    if(pointInPoly(lx,ly,shapes[i].pts))return i;
  }
  return -1;
}

// ================================================================
//  面積計算
// ================================================================
function calcArea(pts){
  let a=0;const n=pts.length;
  for(let i=0;i<n;i++){const j=(i+1)%n;a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}
  a=Math.abs(a)/2;
  // v0.0011: 方眼紙モードはRS倍なしのcanvasなのでRS^2で割らない
  const rsScale = RS*RS;
  const pt2=a/rsScale;
  const mpp=(25.4/72)*scaleDenom;
  return(pt2*mpp*mpp)/1e6;
}

// px → mm（体積計算用）
function pxToMm(px){
  // v0.0013: 方眼紙モードもRSスケールcanvasを使うので常にRS込みで計算
  return px/RS/72*25.4*scaleDenom;
}

function calcSum(){return shapes.filter(sh=>sh.enabled!==false&&colorFilter[sh.color||'blue']).reduce((s,sh)=>s+sh.area,0);}

// ================================================================
// 【r042 削除】chamferSharpAngles() と MIN_CHAMFER_M — v0.0010「鋭角自動カット」の2D(px座標)側実装。
//   全ファイル横断で呼び出し元ゼロを確認して削除。法面オブジェクトの鋭角カットは、現在 voldia3d.js の
//   tryChamferMm()(ptsMm=mm座標用・最小辺500mm)が担っている(重複=旧実装が残っていた状態)。
//   ※ SHARP_ANGLE_DEG は voldia3d.js(runCalc内)が参照しているので残す。消さないこと。
// ================================================================
const SHARP_ANGLE_DEG = 40;   // この角度以下を鋭角とみなす

// v0.0009: hex色を明るくするヘルパー（選択ハイライト用）
function lightenColor(hex, amount){
  // hex → r,g,b
  const h=hex.replace('#','');
  let r=parseInt(h.slice(0,2),16);
  let g=parseInt(h.slice(2,4),16);
  let b=parseInt(h.slice(4,6),16);
  // 白(255)に向けてamount分だけ補間
  r=Math.min(255,Math.round(r+(255-r)*amount));
  g=Math.min(255,Math.round(g+(255-g)*amount));
  b=Math.min(255,Math.round(b+(255-b)*amount));
  return `rgb(${r},${g},${b})`;
}

// ================================================================
//  サイドバー更新（深さ入力追加）
// ================================================================
function updSidebar(){
  // r051マスター指摘対応: 天端・下端の数値入力に桁区切り(カンマ)を入れる共通関数。
  // updSidebar()関数全体からアクセスできるようここで定義し、描画側・入力確定側の両方で使う。
  function fmtSigned(v){
    const n=parseInt(v);if(isNaN(n))return '\u00b10';
    if(n===0)return '\u00b10';
    return (n>0?'+':'-')+Math.abs(n).toLocaleString('en-US');
  }
  // Voldia版: 法面角度は土量計算時に全オブジェクト共通で使うため、常に有効表示にする
  const slopeRow = document.getElementById('slope-angle-row');
  if(slopeRow){
    slopeRow.style.opacity = '1';
    slopeRow.style.pointerEvents = '';
  }
  const list=document.getElementById('sh-list');
  list.innerHTML='';
  let idxOrder=[...shapes.keys()];
  if(sortMode==='area_asc')  idxOrder.sort((a,b)=>shapes[a].area-shapes[b].area);
  if(sortMode==='area_desc') idxOrder.sort((a,b)=>shapes[b].area-shapes[a].area);
  if(sortMode==='color')     idxOrder.sort((a,b)=>Object.keys(SHAPE_COLORS).indexOf(shapes[a].color||'blue')-Object.keys(SHAPE_COLORS).indexOf(shapes[b].color||'blue'));

  idxOrder.forEach((idx)=>{
    const sh=shapes[idx];
    if(sh.enabled===undefined)sh.enabled=true;
    const col=SHAPE_COLORS[sh.color||'blue']||SHAPE_COLORS.blue;
    const li=document.createElement('li');
    li.dataset.idx=idx; // Fix8: リスト選択用
    li.classList.add('sh-col-'+(sh.color||'blue')); // r037: 色別の行背景(青=青灰色)
    if(sh.noSlope)li.classList.add('noslope-item');
    if(sh._voldiaGeoError)li.classList.add('geo-error-item');
    // v0.0009: 選択ハイライト色をオブジェクト色の明るいバージョンに
    if(selectedSet.has(idx)){
      // badge色を明るく（HSL変換で輝度上げ）
      const badgeColor = col.badge; // 例: '#0080c0'
      li.style.outline=`2px solid ${lightenColor(badgeColor, 0.55)}`;
    }
    else if(selUnionMode&&selUnionSet.has(idx))li.style.outline='2px solid #2196f3';
    else if(subMode&&subBase===idx)li.style.outline='2px solid #e74c3c';
    else if(subMode&&subTargets.has(idx))li.style.outline='2px solid #ff9800';
    else li.style.outline='';
    const areaStr=sh.area.toFixed(2);
    const totalDepth=calcTotalDepth(sh);
    const totalStr=totalDepth>0?`${Math.round(totalDepth)}mm`:'未入力';

    // ヘッダー部分をDOMで構築（innerHTML混在避けるため）
    const header=document.createElement('div');
    header.className='sh-header';

    // 表示/非表示チェックボックス
    const visCb=document.createElement('input');
    visCb.type='checkbox';visCb.checked=sh.enabled!==false;
    visCb.style.cssText='width:13px;height:13px;margin:0;cursor:pointer;accent-color:#4fc3f7;';
    visCb.title='表示/非表示';
    visCb.addEventListener('change',()=>{sh.enabled=visCb.checked;redraw();
      document.getElementById('tot-sum').textContent=`合計面積: ${calcSum().toFixed(4)} m²`;
    });

    // 色バッジ
    const badge=document.createElement('button');
    badge.style.cssText=`width:13px;height:13px;min-width:13px;border-radius:50%;background:${col.badge};border:2px solid ${col.stroke.replace('.85','1')};cursor:pointer;padding:0;`;
    badge.title='色を変更';
    badge.addEventListener('click',()=>{
      const keys=Object.keys(SHAPE_COLORS);
      sh.color=keys[(keys.indexOf(sh.color||'blue')+1)%keys.length];
      // 6B(2026-08-28 引継ぎ18回目→26回目セッションで紫に移設): 紫に変更するたびに
      // 毎回、土量計算時の挙動(垂直面になること)をtoastで案内する
      if(sh.color==='purple') toast('🟪 紫色に設定したオブジェクトは、土量計算時に法面角度を無視して"垂直"となります', 3200, 'large');
      // 26回目セッション新規: グレーは「既存躯体」機能(体積・土量計算から除外)の
      // トリガー色として再定義。設定するたびに毎回toastで案内する
      if(sh.color==='gray') toast('Voldia2Dでグレー色に設定したオブジェクトは、土量計算時に既存躯体として扱われます', 3200, 'graystruct');
      // r020: 自己交差検出による赤表示はあくまで警告であって、計算に進めない
      // 制約自体は次回計算時に改めて判定される。「間違って土量計算を押して
      // しまい赤くなったが直せない」という詰みを避けるため、手動で色を
      // 変更したらこの赤表示は解除できるようにする（救済措置）。
      sh._voldiaGeoError = false;
      pushUndo();updSidebar();redraw();
    });

    const nm=document.createElement('span');
    nm.className='sh-name';
    // 5種類の名称判定
    function getAutoTypeName(s,i){
      if(s.name) return s.name;
      const hasHoles=(s.holes&&s.holes.length>0)||(s.holesMm&&s.holesMm.length>0);
      if(hasHoles) return `中空${i+1}`;
      if(s.type==='rect') return `四角形${i+1}`;
      if(s.type==='poly') return `多角形${i+1}`;
      if(s.type==='merged'||s.name?.startsWith('合成')) return `合成${i+1}`;
      return `その他${i+1}`;
    }
    nm.textContent=getAutoTypeName(sh,idx);
    // 6B(2026-08-28 引継ぎ18回目→26回目セッションで紫に移設): 紫(垂直面)設定の
    // オブジェクトは名称テキストも専用の色にして一覧上で見分けやすくする
    if((sh.color||'blue')==='purple'){ nm.style.color=col.stroke; nm.style.fontStyle='italic'; }
    // クリックで部分削除/選択合成選択
    nm.style.cursor='pointer';
    nm.addEventListener('click',(e)=>{
      // 新4根本原因(2026-08-24 引継ぎ17回目マスター報告): nmクリックが親liの
      // 行クリックハンドラにもバブリングし、同じtoggleSelectedが1クリックで
      // 2回呼ばれていた。SHIFT+クリックで新規に別図形を追加選択する場合、
      // 1回目の呼び出しでselectedSetにidxが追加された直後、2回目の呼び出しが
      // 「既にhasしている」と判定して即座に削除してしまい、結果的に選択が
      // 一切反映されないように見えていた(通常クリックはclear→addの繰り返しで
      // 結果が同じになるため問題が表面化しなかった)。stopPropagationで
      // liへの伝播を止め、二重発火そのものを止める。
      e.stopPropagation();
      if(subMode){toggleSub(idx);return;}
      if(selUnionMode){
        if(selUnionSet.has(idx))selUnionSet.delete(idx);else selUnionSet.add(idx);
        updSelUnionToolbar();updSidebar();redraw();return;
      }
      toggleSelected(idx,e.shiftKey);
    });
    // Fix11: ダブルクリックで名前編集
    nm.addEventListener('dblclick',(e)=>{
      e.stopPropagation();
      const input=document.createElement('input');
      input.type='text';
      input.value=sh.name||nm.textContent;
      input.style.cssText='width:100%;background:#1a2a3a;color:#e0e0e0;border:1px solid #4fc3f7;border-radius:3px;padding:1px 3px;font-size:inherit;';
      nm.replaceWith(input);
      input.focus();input.select();
      const save=()=>{
        if(!sh.name)sh.name=nm.textContent;
        sh.name=input.value.trim()||sh.name;
        updSidebar();
      };
      input.addEventListener('blur',save);
      input.addEventListener('keydown',ev=>{
        if(ev.key==='Enter'){ev.preventDefault();save();}
        if(ev.key==='Escape'){updSidebar();}
      });
    });

    const areaSpan=document.createElement('span');
    areaSpan.className='sh-area';areaSpan.textContent=areaStr+' m²';

    const delBtn=document.createElement('button');
    delBtn.className='delbtn';delBtn.textContent='×';
    delBtn.addEventListener('click',e=>{
      e.stopPropagation();
      pushUndo();shapes.splice(idx,1);updSidebar();redraw();toast(`図形${idx+1}を削除`);
    });

    // noslope 1ボタン（上行に配置）
    const noslopeLabel=sh.noSlope?'垂直':'法面';
    const noslopeClass=sh.noSlope?'noslope-btn active-vertical':'noslope-btn active-hamen';
    const noslopeBtn=document.createElement('button');
    noslopeBtn.className=noslopeClass;
    noslopeBtn.dataset.idx=idx;
    noslopeBtn.textContent=noslopeLabel;
    noslopeBtn.style.cssText='flex-shrink:0;padding:2px 8px;font-size:.68em;border-radius:3px;cursor:pointer;white-space:nowrap;';
    // Voldia版: 個別「垂直/法面」切替は廃止（計算モードで全オブジェクト共通処理）。ボタンは非表示のまま保持のみ
    header.append(visCb,badge,nm,areaSpan,delBtn);

    // 新UI: 天端・下端・余掘・垂直↔法面トグル
    const topVal = (sh.topLevel!==undefined&&sh.topLevel!=='')?sh.topLevel:0;
    const botVal = sh.depthBeam!==undefined?sh.depthBeam:1800;
    const odVal  = sh.overdig!==undefined?sh.overdig:200;
    const depthBlock=document.createElement('div');
    depthBlock.className='depth-block';
    depthBlock.innerHTML=`
      <div style="display:flex;align-items:center;gap:3px;margin-top:4px;flex-wrap:nowrap;">
        <span style="font-size:.62em;color:#999;white-space:nowrap;flex-shrink:0;">天端</span>
        <input type="text" class="depth-inp" data-idx="${idx}" data-key="topLevel"
          value="${fmtSigned(topVal,true)}"
          style="width:38px;flex-shrink:0;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a3e;border-radius:3px;padding:1px 3px;font-size:.72em;text-align:right;font-family:'Consolas',monospace;">
        <span style="font-size:.62em;color:#999;white-space:nowrap;flex-shrink:0;">下端</span>
        <input type="text" class="depth-inp" data-idx="${idx}" data-key="depthBeam"
          value="${sh.color==='gray' ? '\u221e' : fmtSigned(parseInt(botVal)||(-1800),true)}"
          ${sh.color==='gray' ? `data-gray-inf="1" title="既存躯体: 土量計算(3Dイメージ)では、下端が最深の掘削底まで延長されます(描いた下端: ${fmtSigned(parseInt(botVal)||(-1800))})。クリックで描いた下端の値を編集できます"` : ''}
          style="width:38px;flex-shrink:0;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a3e;border-radius:3px;padding:1px 3px;font-size:.72em;text-align:right;font-family:'Consolas',monospace;">
      </div>`;

    li.append(header,depthBlock);
    // v0.0009: li行全体クリックで選択（input/button以外）
    li.addEventListener('click',(e)=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON'||e.target.tagName==='LABEL') return;
      if(subMode){toggleSub(idx);return;}
      if(selUnionMode){
        if(selUnionSet.has(idx))selUnionSet.delete(idx);else selUnionSet.add(idx);
        updSelUnionToolbar();updSidebar();redraw();return;
      }
      toggleSelected(idx,e.shiftKey);
    });
    list.appendChild(li);
  });

  // ── depth-inp イベント（新UI: text入力 + バリデーション）
  list.querySelectorAll('.depth-inp').forEach(inp=>{
    const commit=()=>{
      const i=parseInt(inp.dataset.idx), key=inp.dataset.key;
      const raw=inp.value.replace(/[^0-9+\-]/g,'');
      const n=parseInt(raw);
      if(isNaN(n)){inp.value=key==='overdig'?'±0':'±0';return;}
      // 余掘は負なし
      if(key==='overdig'){
        const v=Math.abs(n);
        shapes[i][key]=v.toString();
        inp.value=v===0?'±0':'+'+v.toLocaleString('en-US');
      } else if(key==='topLevel'){
        // 天端バリデーション
        // depthBeam は符号付き（GL下は負、例：-800）
        // topLevel も符号付き（GL上は正、GL=0、GL下は負）
        // 正しい条件: topLevel > depthBeam（天端は下端より高い）
        const bot = parseInt(shapes[i].depthBeam)||0; // 例: -800
        // MAX65535チェック
        const clamped = Math.max(-65535, Math.min(65535, n));
        if(clamped <= bot){
          // 天端が下端以下はNG
          toast('⚠ 天端は下端より高くする必要があります（無視）');
          const cur = parseInt(shapes[i].topLevel)||0;
          inp.value = fmtSigned(cur);
          return;
        }
        shapes[i][key] = clamped.toString();
        inp.value = fmtSigned(clamped);
      } else if(key==='depthBeam'){
        // 下端: 符号付き数値（正=GL上、負=GL下）を許容
        // 天端との整合チェック: topLevel > depthBeam でないといけない
        const top = parseInt(shapes[i].topLevel)||0;
        if(top <= n){
          toast('⚠ 下端は天端より低くする必要があります（無視）');
          const cur = parseInt(shapes[i].depthBeam)||(-1800);
          inp.value = fmtSigned(cur);
          return;
        }
        shapes[i][key] = n.toString();
        inp.value = fmtSigned(n);
      }
      if(selectedSet.size>1&&selectedSet.has(i)){
        selectedSet.forEach(si=>{if(si!==i)shapes[si][key]=shapes[i][key];});
        updSidebar();
      }
      _lastGeoms=null; _lastExistingStructGeoms=[];
      // 面積0チェック（念のため）
      if(shapes[i].area<=0){pushUndo();shapes.splice(i,1);updSidebar();redraw();toast('⚠ 面積0のオブジェクトを削除しました');return;}
    };
    inp.addEventListener('change',commit);
    // r036(36回目マスター要望): グレー(既存躯体)の下端欄は見た目だけ「∞」表示。実値(depthBeam)は
    // 通常計算でそのまま使うため不変。編集時だけ実値を出し、離れたら∞へ戻す。
    // 他の色へ変更するとupdSidebar()の再描画で通常の数値表示に戻る。
    if(inp.dataset.grayInf==='1'){
      // 「∞」はConsolasだと極小に描かれ読めないため、∞表示中だけ大きめ+記号に強いフォントにする。
      // 行の高さが変わらないよう、変更前の高さを固定する。編集中(実値表示)は元の見た目に戻す。
      const numFont=inp.style.fontFamily, numSize=inp.style.fontSize;
      const h=inp.offsetHeight;
      const showInf=()=>{
        inp.value='\u221e';
        inp.style.fontFamily='"Segoe UI Symbol","Arial Unicode MS",Arial,sans-serif';
        inp.style.fontSize='1.45em';
        inp.style.fontWeight='700';
        inp.style.lineHeight='1';
        if(h>0){inp.style.boxSizing='border-box';inp.style.height=h+'px';}
      };
      const showNum=()=>{
        inp.style.fontFamily=numFont; inp.style.fontSize=numSize;
        inp.style.fontWeight=''; inp.style.lineHeight='';
      };
      showInf();
      inp.addEventListener('focus',()=>{
        const i=parseInt(inp.dataset.idx);
        showNum();
        inp.value=fmtSigned(parseInt(shapes[i].depthBeam)||(-1800));
        inp.select();
      });
      inp.addEventListener('blur',showInf);
    }
    // (24回目・項目5): テキスト確定のEnterがdocumentまで伝播すると、
    // inp.blur()でactiveElementが変わった「後」にグローバルkeydownリスナーの
    // isFormFocusチェックが走ってしまい(blur済みなのでinputと判定されない)、
    // リピート機能が誤発動するバグがあった。stopPropagation()で伝播自体を止める。
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopPropagation();inp.blur();}});
  });
  // ── noslope 1ボタントグル
  list.querySelectorAll('.noslope-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const i=parseInt(btn.dataset.idx);
      const v=!shapes[i].noSlope;
      shapes[i].noSlope=v;
      if(selectedSet.size>1&&selectedSet.has(i)){selectedSet.forEach(si=>{shapes[si].noSlope=v;});}
      _lastGeoms=null; _lastExistingStructGeoms=[];
      btn.textContent=v?'垂直':'法面';
      btn.classList.toggle('active-hamen',!v);
      btn.classList.toggle('active-vertical',v);
      const li=btn.closest('li');
      if(li){li.classList.toggle('noslope-item',v);}
      toast(v?'垂直（四角柱）に設定':'法面（逆錐台）に設定');
      updSidebar(); redraw();
    });
  });

  // 面積0オブジェクトを即時削除
  const zeroIdxs=shapes.map((s,i)=>i).filter(i=>shapes[i].area<=0);
  if(zeroIdxs.length){
    pushUndo();
    shapes=shapes.filter(s=>s.area>0);
    toast('⚠ 面積0のオブジェクトを削除しました');
    // 再帰呼び出しで再描画
    updSidebar();redraw();return;
  }
  document.getElementById('tot-sum').textContent=
    `合計面積（単純和）: ${calcSum().toFixed(2)} m²`;
  // Fix9: オブジェクトがない時ボタン無効化
  const hasAll=shapes.length>0;
  ['exp-btn','dxf-btn','xlsx-btn'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn){btn.disabled=!hasAll;btn.style.opacity=hasAll?'1':'0.4';}
  });
  const clearBtn=document.getElementById('clear-btn');
  if(clearBtn){clearBtn.disabled=!hasAll;clearBtn.style.opacity=hasAll?'1':'0.4';}
  // Voldia版: オブジェクトが無い場合は３Dイメージボタンをグレーアウトして押せなくする
  const calcBtn=document.getElementById('calc-btn');
  if(calcBtn){calcBtn.disabled=!hasAll;calcBtn.style.opacity=hasAll?'1':'0.4';calcBtn.style.cursor=hasAll?'pointer':'not-allowed';}
}

function calcTotalDepth(sh){
  const b=parseFloat(sh.depthBeam);
  const tl=parseFloat(sh.topLevel)||0;
  const c=getConcThick();
  if(isNaN(b))return 0;
  return Math.max(0, tl - b + c);
}

// ================================================================
//  スケール適用
// ================================================================
// ================================================================
// v0.0011: 方眼紙モード
// ================================================================
const GRID_SIZES_M = [1, 2.5, 5, 10, 25, 50, 100];
const GRID_MIN_MM_PAPER = 30; // A3紙面上30mm以上

function calcGridM(scDenom){
  return GRID_SIZES_M.find(g => (g * 1000 / scDenom) >= GRID_MIN_MM_PAPER) ?? 100;
}

let _gridPaperActive = false;

function drawGridPaper(){
  if(!_gridPaperActive) return;
  const gridM = calcGridM(scaleDenom);
  // v0.0013: RS倍のcanvasに合わせてgridPxもRS倍
  // gridPx = gridM[m] * 1000[mm/m] * RS * 72[dpi] / (25.4[mm/inch] * scaleDenom)
  const gridPx = gridM * 1000 * RS * 72 / (25.4 * scaleDenom);

  const cv = pdfCv;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);

  // 背景
  ctx.fillStyle = '#181d28';
  ctx.fillRect(0, 0, cv.width, cv.height);

  // グリッドを中心基準で割付
  const cx = cv.width / 2, cy = cv.height / 2;
  const startX = cx % gridPx;
  const startY = cy % gridPx;

  ctx.strokeStyle = 'rgba(160,175,195,0.35)';
  ctx.lineWidth = RS; // RS倍canvas上でも1pt相当
  for(let x = startX; x <= cv.width; x += gridPx){
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke();
  }
  for(let y = startY; y <= cv.height; y += gridPx){
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke();
  }

  // 中心線
  ctx.strokeStyle = 'rgba(180,200,220,0.55)';
  ctx.lineWidth = RS * 1.2;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cv.height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cv.width, cy); ctx.stroke();

  // ラベル
  ctx.fillStyle = 'rgba(120,160,200,0.7)';
  ctx.font = `${13*RS}px sans-serif`;
  const label = gridM >= 1 ? `${gridM}m` : `${gridM*1000}mm`;
  ctx.fillText(`グリッド: ${label} × ${label}　(1/${Math.round(scaleDenom)})`, 10*RS, 20*RS);
}

function startGridPaperMode(){
  _gridPaperActive = true;
  document.getElementById('drop-hint').style.display = 'none';
  document.getElementById('grid-paper-btn').style.display = 'none';
  hideUiBlockOverlays();

  // v0.0013: PDFモードと完全に同じcanvas設定
  // A3 = 420mm x 297mm、72dpi x RS倍
  const W = Math.round(420 / 25.4 * 72 * RS);
  const H = Math.round(297 / 25.4 * 72 * RS);

  // PDFモードと同じ: canvas解像度=CSSサイズ、transformでズーム制御
  pdfCv.width  = W; pdfCv.height  = H;
  pdfCv.style.width  = W + 'px'; pdfCv.style.height  = H + 'px';

  // drawCvはPDFモードと同じ理由で用紙より一回り大きくする(renderPage()参照)
  const DRAW_MARGIN_RATIO = 0.4;
  const dcOffX = Math.round(W * DRAW_MARGIN_RATIO);
  const dcOffY = Math.round(H * DRAW_MARGIN_RATIO);
  window._dcOffX = dcOffX; window._dcOffY = dcOffY;
  drawCv.width = W + dcOffX * 2; drawCv.height = H + dcOffY * 2;
  drawCv.style.width = drawCv.width + 'px'; drawCv.style.height = drawCv.height + 'px';
  drawCv.style.position = 'absolute';
  drawCv.style.left = (-dcOffX) + 'px';
  drawCv.style.top = (-dcOffY) + 'px';
  // r059-fix: PDFモード側と同じ理由(renderPage()のコメント参照)でtransform-origin
  // をズラす。これが無いとzoom=1以外でpdfCvとdrawCvがズレる。
  drawCv.style.transformOrigin = dcOffX + 'px ' + dcOffY + 'px';

  pdfW = W; pdfH = H;
  fitScreen(); // ← これでtransformのzoom/oxが設定される

  drawGridPaper();
  redraw();
  const snGrid = document.getElementById('sn-grid');
  if(snGrid) snGrid.style.display = '';
  toast(`📐 方眼紙モード開始（1/${Math.round(scaleDenom)}　グリッド${calcGridM(scaleDenom)}m）`);
}

function applyScale(str) {
  str=str.trim();
  const parts=str.split('/');
  if(parts.length===2){
    const num=parseFloat(parts[0]), den=parseFloat(parts[1]);
    if(!den || isNaN(den) || den===0 || isNaN(num) || num===0){
      toast('⚠ スケールが無効です（0や空欄は使えません）');return;
    }
    scaleDenom=den/num;
  } else {
    const v=parseFloat(str);
    if(isNaN(v)||v===0){toast('⚠ スケールが無効です（0や空欄は使えません）');return;}
    scaleDenom=v<1?1/v:v;
  }
  scaleDenom=Math.max(1, scaleDenom);
  document.getElementById('sc-input').value=str;
  document.getElementById('sc-d').textContent=str;
  hlScBtn(str);
  shapes.forEach(s=>{s.area=calcArea(s.pts);});
  updSidebar();
  // v0.0011: 方眼紙モード中はグリッドを再描画
  if(_gridPaperActive) drawGridPaper();
  toast(`📐 スケール ${str} 設定`);
}

// ================================================================
//  描画色サイクル
// ================================================================
function cycleDrawColor(){
  const keys=Object.keys(SHAPE_COLORS);
  currentToolColor=keys[(keys.indexOf(currentToolColor)+1)%keys.length];
  const col=SHAPE_COLORS[currentToolColor];
  const badge=document.getElementById('draw-color-badge');
  const label=document.getElementById('draw-color-label');
  if(badge){badge.style.background=col.badge;badge.style.borderColor=col.stroke.replace('.85','1');}
  if(label){label.textContent=col.label;label.style.color=col.stroke.replace('.85','1');}
  // 6B(2026-08-28 引継ぎ18回目→26回目セッションで紫/グレーの役割を再整理):
  // これから描く図形の色が紫(強制垂直)またはグレー(既存躯体)になった時は専用の
  // 警告を表示する。共有#toast要素を使い回しているため、直後に汎用の「🎨 描画色」
  // トーストを続けて呼ぶと即座に上書きされて警告が一瞬で消えてしまうバグがあった
  // (マスター報告で発覚)。紫/グレー時は汎用トーストを出さず警告のみに一本化する。
  if(currentToolColor==='purple'){
    toast('🟪 紫色に設定したオブジェクトは、土量計算時に法面角度を無視して"垂直"となります', 3200, 'large');
  } else if(currentToolColor==='gray'){
    toast('Voldia2Dでグレー色に設定したオブジェクトは、土量計算時に既存躯体として扱われます', 3200, 'graystruct');
  } else {
    // ボタン自体の色は変えない（ON/OFF状態のみ）
    toast(`🎨 描画色: ${col.label}`);
  }
}

// ================================================================
//  スナップグリッド（snapRound）適用
// ================================================================
// Arecalと同じ実装: 論理px→mm→丸め→論理px
function applySnapRound(v){
  if(!snapRound||!scaleDenom)return v;
  const mmpx=(25.4/72)*scaleDenom/RS; // mm per px
  const mm=v*mmpx;
  return Math.round(mm/snapRound)*snapRound/mmpx;
}
function roundPt(pt){
  return{x:applySnapRound(pt.x),y:applySnapRound(pt.y)};
}

// ================================================================
//  距離測定モード
// ================================================================
function setDistMode(on){
  if(on){
    if(editMode)setEditMode(false); // r037
    if(drawing)cancelDraw();
    if(selUnionMode)setSelUnionMode(false);
    if(subMode)setSubMode(false);
    if(surveyMode)setSurveyMode(false); // r024(AreCal移植)
  }
  distMode=on;distPts=[];
  if(on) _invalidateRepeat();
  if(!on) _startToolEndCooldown();
  document.getElementById('dist-btn').classList.toggle('on',on);
  // B2(2026-08-25引継ぎ19回目マスター報告): distPtsをクリアしただけではキャンバスの
  // 再描画が起きず、次に画面に変化(パン/ズーム等)が起きるまで仮想線(プレビュー線)が
  // 残って見えてしまっていた。即座に消えるようここでredraw()を呼ぶ。
  redraw();
  
  // 余計な警告バーを隠す
  const _dwb=document.getElementById('dist-warn-bar');
  if(_dwb)_dwb.style.display='none';

  if(!on){
    document.getElementById('dist-result').style.display='none';
    setStatus('');
    setToolBar(''); // モード名を消す
  } else {
    setStatus('📏 1点目をクリックしてください');
    setToolBar('📏 距離測定モード'); // モード名を固定
    toast('📏 距離計測: 2点をクリックしてください');
  }
}

// ================================================================
//  測点設置モード（r024: AreCal移植）
// ================================================================
function setSurveyMode(on){
  if(on){
    if(editMode)setEditMode(false); // r037
    _invalidateRepeat();
    if(drawing)cancelDraw();
    if(distMode)setDistMode(false);
    if(selUnionMode)setSelUnionMode(false);
    if(subMode)setSubMode(false);
  }
  surveyMode=on;
  if(!on) _startToolEndCooldown();
  document.getElementById('survey-btn').classList.toggle('on',on);
  if(on){
    setStatus('📍 測点設置: 端点・中点・線上・交点・元図などスナップ点をクリック');
    setToolBar('📍 測点設置モード');
    toast('📍 スナップ点をクリックしてください（自由な位置には置けません）',3000);
  } else {
    setStatus('');
    setToolBar('');
    svBase=null;svDir=null;
  }
  redraw();
}

// r025(AreCal移植): 測点オフセットダイアログを開く。moveIdx指定時は既存測点の移動、
// 未指定時は新規設置（基点=クリックしたスナップ点）
function openSurveyDialog(basePt, moveIdx){
  svBase={x:basePt.x,y:basePt.y};
  svBase._moveIdx = (moveIdx!=null) ? moveIdx : null;
  svDir=null;
  document.getElementById('sv-dist').value='';
  ['up','down','left','right'].forEach(d=>{document.getElementById('sv-'+d).style.background='';});
  document.getElementById('survey-dialog').style.display='flex';
  setTimeout(()=>document.getElementById('sv-dist').focus(),50);
}

// ================================================================
//  r060: ノースアロー（方位角）
// ================================================================
function degToDMSStr(deg){
  deg=((deg%360)+360)%360;
  const d=Math.floor(deg);
  const mFull=(deg-d)*60;
  const m=Math.floor(mFull);
  const s=(mFull-m)*60;
  return `${d}°${String(m).padStart(2,'0')}'${s.toFixed(1)}"`;
}
function updateNorthArrowUI(){
  const rotor=document.getElementById('north-arrow-rotor');
  const label=document.getElementById('north-angle-label');
  if(rotor)rotor.style.transform=`rotate(${northAngleDeg}deg)`;
  if(label)label.textContent=degToDMSStr(northAngleDeg);
}
function openNorthDialog(){
  const deg=((northAngleDeg%360)+360)%360;
  const d=Math.floor(deg);
  const mFull=(deg-d)*60;
  const m=Math.floor(mFull);
  const s=(mFull-m)*60;
  document.getElementById('na-deg').value=d;
  document.getElementById('na-min').value=m;
  document.getElementById('na-sec').value=s.toFixed(1);
  const sel=document.getElementById('na-origin-select');
  sel.innerHTML='<option value="">未設定</option>';
  surveyPts.forEach((p,i)=>{
    const opt=document.createElement('option');
    opt.value=String(i);
    opt.textContent=`No.${i+1}`;
    sel.appendChild(opt);
  });
  sel.value=(originSurveyIdx!=null && surveyPts[originSurveyIdx])?String(originSurveyIdx):'';
  const hint=document.getElementById('na-origin-hint');
  if(surveyPts.length===0){sel.disabled=true;hint.style.display='block';}
  else{sel.disabled=false;hint.style.display='none';}
  document.getElementById('north-dialog').style.display='flex';
}
// 【r042 削除】checkNorthOriginForExport() — 将来のLandXML出力用ガード関数(未使用のまま残っていた)。
//   全ファイル横断で呼び出し元ゼロを確認して削除。元の中身: originSurveyIdx==null||!surveyPts[originSurveyIdx] なら
//   toast('⚠ 原点用の測点が未設定です。ノースアロー設定（右上🧭）から測点を選択してください',3500)して false を返す、だけ。
//   LandXML出力本体を作る時に必要なら、その時に書き直す(r041以前のファイルから復元も可)。

// ================================================================
//  選択合成モード
// ================================================================
// Fix2: 選択合成ツールバー更新
function updSelUnionToolbar(){
  if(!selUnionMode)return;
  const n=selUnionSet.size;
  const label=n>=2?`🔗 選択合成モード（${n}個選択中）`:'🔗 選択合成モード（図形をクリックして選択）';
  const actions=n>=2
    ?makeToolBtn('▶ 実行','applySelUnion()','#2196f3')+makeToolBtn('✕ キャンセル','setSelUnionMode(false)','#555')
    :makeToolBtn('✕ キャンセル','setSelUnionMode(false)','#555');
  setToolBar(label,actions);
}

function setSelUnionMode(on){
  selUnionMode=on;selUnionSet.clear();
  if(on && editMode) setEditMode(false); // r037
  if(on) _invalidateRepeat();
  document.getElementById('sel-union-btn').classList.toggle('on',on);
  // do-sel-union removed from right panel (Fix12)
  if(on){
    if(drawing)cancelDraw();
    if(subMode)setSubMode(false);
    if(distMode)setDistMode(false);
    if(surveyMode)setSurveyMode(false); // r024(AreCal移植)
    setStatus('🔗 選択合成: 2つ以上の図形をクリックして選択');
    updSelUnionToolbar();
    toast('🔗 選択合成モード: 図形を2個以上クリックして選択してください',3500);
  }else{
    setStatus('');setToolBar('');
  }
  updSidebar();redraw();
}

async function applySelUnion(){
  const idxArr=[...selUnionSet].filter(i=>i<shapes.length);
  if(idxArr.length<2){toast('⚠ 図形を2つ以上選択してください');return;}

  // 深さの統一チェック
  const depths=idxArr.map(i=>parseFloat(shapes[i].depthBeam)||0);
  const maxD=Math.max(...depths);
  const allSame=depths.every(d=>d===depths[0]);
  if(!allSame){
    if(!await customConfirm(`深さが違うオブジェクトを\n合成しようとしています。\n最も深い値(GL-${maxD}mm)に\n統一されます。\n合成しますか？`)){return;}
  }

  pushUndo();
  const selShapes=idxArr.map(i=>shapes[i]);
  const others=shapes.filter((_,i)=>!selUnionSet.has(i));
  
  // 穴対応版のexecPolyUnionを実行
  const mergedResults = execPolyUnion(selShapes.map(s=>getOuter(s)));
  
  if(!mergedResults || !mergedResults.length){toast('⚠ Union計算失敗');return;}
  
  // 合成後の図形数が選択数と同じ＝実際には合成されていない（角だけ接触など）
  if(mergedResults.length >= idxArr.length){
    toast('⚠ 合成できません（図形が重なっていません）');
    return;
  }
  
  const firstColor = selShapes[0].color||'blue';
  const maxDepthVal = maxD.toString();
  const maxOverdig = Math.max(...selShapes.map(s=>parseFloat(s.overdig)||0)).toString();
  const noSlopeAll = selShapes.every(s=>s.noSlope);

  // AreCal形式(outer+holes)で図形を再構築
  const newShapes = mergedResults.map(item => {
    editCount++;
    const area = calcAreaPts(item.outer) - item.holes.reduce((s, h) => s + calcAreaPts(h), 0);
    return {
      type: 'poly',
      pts: item.outer, // 互換性のため
      outer: item.outer,
      holes: item.holes,
      area: Math.max(0, area),
      depthBeam: maxDepthVal,
      topLevel: selShapes[0].topLevel||'0',
      overdig: maxOverdig,
      noSlope: noSlopeAll,
      color: firstColor,
      enabled: true,
      name: `合成${editCount}`
    };
  });

  shapes = [...others, ...newShapes];
  setSelUnionMode(false);
  updSidebar();
  redraw();
  toast(`✅ 選択合成完了 → ${newShapes.length}図形`);
}


// ████████████████████████████████████████████████████████████████
// ██  SECTION 2: 選択合成・面積・Clipper2D                      ██
// ██  selUnion / calcArea / pointInPoly / chamfer               ██
// ████████████████████████████████████████████████████████████████
// ================================================================
//  選択操作・ツールバー 基本関数
// ================================================================
// 1. オブジェクト選択（クリック/リストクリック）
function toggleSelected(idx, multi=false){
  if(!multi) selectedSet.clear();
  if(selectedSet.has(idx)) selectedSet.delete(idx);
  else selectedSet.add(idx);
  updSidebar();
  redraw();
  // 左パネルで選択図形が見えるようにスクロール
  const listItems=document.getElementById('sh-list').querySelectorAll('li');
  listItems.forEach(li=>{
    if(li.dataset.idx && parseInt(li.dataset.idx)===idx){
      li.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  });
}

// 2. 選択解除
function clearSelection(){
  selectedSet.clear();
  updSidebar();
  redraw();
}

// 3. ツール名バー更新
function setToolBar(name, actions=''){
  const nm=document.getElementById('tool-name');
  const ac=document.getElementById('tool-actions');
  if(nm) nm.textContent=name||'— ツール未選択 —';
  if(ac) ac.innerHTML=actions;
}

// 4. ツールバーボタン生成ヘルパー
function makeToolBtn(label, onclick, color='#2196f3'){
  return `<button onclick="${onclick}" style="padding:4px 12px;background:${color};border:none;border-radius:4px;color:#fff;font-size:.8em;cursor:pointer;font-weight:600;">${label}</button>`;
}

// ================================================================
//  部分削除モード
// ================================================================
// 部分削除ツールバー更新（ベース+ターゲット両方選択時のみ実行ボタン）
function updSubToolbar(){
  if(!subMode)return;
  const hasBase=subBase>=0;
  const hasTarget=subTargets.size>0;
  let label='✂ 部分削除モード';
  if(!hasBase)label+='（①削除されるベース図形をクリック）';
  else if(!hasTarget)label+='（②削除する図形をクリック）';
  else label+=`（ベース+${subTargets.size}個選択済）`;
  const actions=hasBase&&hasTarget
    ?makeToolBtn('✂ 実行','applySubtract()','#e74c3c')+makeToolBtn('✕ キャンセル','setSubMode(false)','#555')
    :makeToolBtn('✕ キャンセル','setSubMode(false)','#555');
  setToolBar(label,actions);
}

function setSubMode(on){
  subMode=on;subBase=-1;subTargets.clear();
  if(on && editMode) setEditMode(false); // r037
  if(on) _invalidateRepeat();
  document.getElementById('sub-btn').classList.toggle('on',on);
  // do-sub removed from right panel - handled by updSubToolbar()
  if(on){
    if(drawing)cancelDraw();
    if(selUnionMode)setSelUnionMode(false);
    if(distMode)setDistMode(false);
    if(surveyMode)setSurveyMode(false); // r024(AreCal移植)
    setStatus('✂ 部分削除: ベース図形 → 削除図形の順にクリック');
    updSubToolbar();
    toast('✂ 部分削除: 最初に削除される図形、次に削除する図形をクリック',4000);
  }else{
    setStatus('');setToolBar('');
  }
  updSidebar();redraw();
}

// ================================================================
//  r037(37回目): ✏修正モード(頂点ドラッグ)
//   ・四角形(type==='rect') … 頂点=向かいの頂点を固定して2辺を平行に動かし拡大縮小(常に直角の長方形) / 辺の中点◆=その辺だけ平行移動
//   ・多角形/その他        … その頂点だけ自由移動(穴(holes)の頂点も可)
//   ・マウスを離した時に判定し、自己交差・辺の接触・同一点・面積過小・穴のはみ出しがあれば
//     「その形状は出来ません」とトーストを出して元の形状に戻す。成功時だけUndo履歴に積む。
//   ・頂点を増やす/減らすことはしない。Shiftで直交移動(多角形)。ESCでキャンセル。
//   ・オブジェクトスナップは描画ツールと同じgetSnap(端点・中点・線上・交点・測点・山留・元図・方眼)。動かしている図形自身には吸着しない。
// ================================================================
function _editRings(sh){ return [sh.pts].concat(sh.holes||[]); }
function _editCopyRings(sh){ return { pts: sh.pts.map(p=>({x:p.x,y:p.y})), holes: sh.holes ? sh.holes.map(h=>h.map(p=>({x:p.x,y:p.y}))) : undefined }; }
// 線分ab と cd が交差・接触するか(端点どうしの接触・共線の重なりも含む)
function _editSegTouch(a,b,c,d){
  const EPS=1e-7;
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const inBox=(p,q,r)=>Math.min(p.x,q.x)-EPS<=r.x&&r.x<=Math.max(p.x,q.x)+EPS&&Math.min(p.y,q.y)-EPS<=r.y&&r.y<=Math.max(p.y,q.y)+EPS;
  const o1=cross(a,b,c),o2=cross(a,b,d),o3=cross(c,d,a),o4=cross(c,d,b);
  if(((o1>EPS&&o2<-EPS)||(o1<-EPS&&o2>EPS))&&((o3>EPS&&o4<-EPS)||(o3<-EPS&&o4>EPS))) return true; // 真の交差
  if(Math.abs(o1)<=EPS&&inBox(a,b,c)) return true;
  if(Math.abs(o2)<=EPS&&inBox(a,b,d)) return true;
  if(Math.abs(o3)<=EPS&&inBox(c,d,a)) return true;
  if(Math.abs(o4)<=EPS&&inBox(c,d,b)) return true;
  return false;
}
// 1つの輪(リング)が単純(自己交差・自己接触・同一点なし)か
function _editRingSimple(r){
  const n=r.length; if(n<3) return false;
  for(let i=0;i<n;i++){ const j=(i+1)%n; if(Math.hypot(r[i].x-r[j].x,r[i].y-r[j].y)<1e-6) return false; }
  for(let i=0;i<n;i++){
    for(let j=i+1;j<n;j++){
      if(j===i+1||(i===0&&j===n-1)) continue; // 隣り合う辺は端点を共有するのが正常
      if(_editSegTouch(r[i],r[(i+1)%n],r[j],r[(j+1)%n])) return false;
    }
  }
  return true;
}
function _editRingsCross(r1,r2){
  for(let i=0;i<r1.length;i++) for(let j=0;j<r2.length;j++)
    if(_editSegTouch(r1[i],r1[(i+1)%r1.length],r2[j],r2[(j+1)%r2.length])) return true;
  return false;
}
// 図形全体(外周+穴)が有効か
function _editShapeValid(sh){
  const MIN_AREA_M2=1e-2; // 作図時(r061)と同じ下限
  if(!_editRingSimple(sh.pts)) return false;
  if(calcArea(sh.pts)<MIN_AREA_M2) return false;
  const holes=sh.holes||[];
  for(let a=0;a<holes.length;a++){
    const h=holes[a];
    if(!_editRingSimple(h)) return false;
    if(h.some(p=>!pointInPoly(p.x,p.y,sh.pts))) return false; // 穴が外周からはみ出し
    if(_editRingsCross(h,sh.pts)) return false;
    for(let b=a+1;b<holes.length;b++) if(_editRingsCross(h,holes[b])) return false;
  }
  return true;
}
// 四角形(type==='rect')が「直角の長方形」か(頂点0→1と0→3が直交し、4点目が平行四辺形になっているか)
function _editRectAxes(sh){
  if(sh.type!=='rect'||!sh.pts||sh.pts.length!==4) return null;
  const p=sh.pts, ex=p[1].x-p[0].x, ey=p[1].y-p[0].y, fx=p[3].x-p[0].x, fy=p[3].y-p[0].y;
  const W=Math.hypot(ex,ey), H=Math.hypot(fx,fy); if(W<1e-6||H<1e-6) return null;
  const u={x:ex/W,y:ey/W}, v={x:fx/H,y:fy/H};
  if(Math.abs(u.x*v.x+u.y*v.y)>1e-6) return null;                       // 直交していない → 多角形として扱う
  if(Math.hypot(p[2].x-(p[1].x+fx),p[2].y-(p[1].y+fy))>1e-6*Math.max(W,H)+1e-6) return null; // 平行四辺形でない
  return {u,v};
}
function _editSignedArea(r){ let a=0; for(let i=0;i<r.length;i++){ const j=(i+1)%r.length; a+=r[i].x*r[j].y-r[j].x*r[i].y; } return a/2; }
function _editHit(lx,ly){
  const HIT=10/zoom; let best=null,bd=HIT;
  for(let si=shapes.length-1;si>=0;si--){
    const sh=shapes[si];
    if(sh.enabled===false||colorFilter[sh.color||'blue']===false) continue;
    _editRings(sh).forEach((ring,ri)=>ring.forEach((p,vi)=>{
      const d=Math.hypot(p.x-lx,p.y-ly); if(d<bd){bd=d;best={kind:'vertex',si,ri,vi};}
    }));
  }
  if(best) return best;
  // 頂点が無ければ、直角四角形の「辺の中点」(その辺だけ平行移動するハンドル)を探す
  bd=HIT;
  for(let si=shapes.length-1;si>=0;si--){
    const sh=shapes[si];
    if(sh.enabled===false||colorFilter[sh.color||'blue']===false) continue;
    if(!_editRectAxes(sh)) continue;
    for(let k=0;k<4;k++){
      const a=sh.pts[k], b=sh.pts[(k+1)%4], d=Math.hypot((a.x+b.x)/2-lx,(a.y+b.y)/2-ly);
      if(d<bd){bd=d;best={kind:'edge',si,ri:0,vi:k};}
    }
  }
  return best;
}
function editMouseDown(lx,ly){
  const h=_editHit(lx,ly);
  if(!h){ return; }
  const sh=shapes[h.si];
  const orig=_editCopyRings(sh);
  const start = h.kind==='edge'
    ? {x:(orig.pts[h.vi].x+orig.pts[(h.vi+1)%4].x)/2, y:(orig.pts[h.vi].y+orig.pts[(h.vi+1)%4].y)/2}
    : {x:_editRings(sh)[h.ri][h.vi].x, y:_editRings(sh)[h.ri][h.vi].y};
  editDrag={kind:h.kind,si:h.si,ri:h.ri,vi:h.vi,start,orig,moved:false,axes:_editRectAxes(sh)};
  setToolBar(editDrag.axes
    ? (h.kind==='edge' ? '✏ 四角形: この辺だけ平行に動かします（ESCでキャンセル）' : '✏ 四角形: 向かいの頂点を固定し、2辺を平行に動かして拡大縮小します（ESCでキャンセル）')
    : '✏ 頂点を移動中（離した時に形状を確認します・ESCでキャンセル）');
}
// オブジェクトスナップ: 描画ツールと同じgetSnap(端点・中点・線上・交点・測点・山留・元図・方眼)を使う。
// ただし「いま動かしている図形自身」には吸着しないよう、その図形の外周を一時的に空にして呼ぶ。
// 多角形は、動かしている頂点以外の自分の頂点(端点)にだけ追加で吸着できる。
function _editSnap(d,vx,vy){
  const sh=shapes[d.si]; const saved=sh.pts; sh.pts=[];
  let snap=null; try{ snap=getSnap(vx,vy); } finally { sh.pts=saved; }
  if(!d.axes && d.ri===0){
    const tol=SNAP_PX/zoom*0.85; let bd=snap?Math.hypot(snap.x-vx,snap.y-vy):tol;
    d.orig.pts.forEach((p,i)=>{ if(i===d.vi) return; const dd=Math.hypot(p.x-vx,p.y-vy); if(dd<=tol && dd<bd){ bd=dd; snap={x:p.x,y:p.y,type:'endpoint'}; } });
  }
  return snap;
}
function editMouseMove(e,lx,ly){
  if(!editDrag){
    const h=_editHit(lx,ly);
    const changed=(!!h!==!!editHover)||(h&&editHover&&(h.kind!==editHover.kind||h.si!==editHover.si||h.ri!==editHover.ri||h.vi!==editHover.vi));
    editHover=h; drawCv.style.cursor=h?'move':'';
    if(changed) redraw();
    return;
  }
  const d=editDrag, sh=shapes[d.si], o=d.orig;
  let vx=lx,vy=ly;
  if(shiftDown && !d.axes) ({x:vx,y:vy}=s90(d.start.x,d.start.y,vx,vy));
  const snap=_editSnap(d,vx,vy);
  showSnap(snap,e.clientX,e.clientY);
  const np=snap?{x:snap.x,y:snap.y}:roundPt({x:vx,y:vy});
  if(d.axes){
    const {u,v}=d.axes, P=o.pts; let q;
    if(d.kind==='edge'){
      // 辺の中点ハンドル: その辺だけを法線方向へ平行移動(隣の2辺は伸び縮みするだけ)
      const k=d.vi, k2=(k+1)%4, ex=P[k2].x-P[k].x, ey=P[k2].y-P[k].y, L=Math.hypot(ex,ey);
      const n={x:-ey/L,y:ex/L}, t=(np.x-d.start.x)*n.x+(np.y-d.start.y)*n.y;
      q=P.map((p,i)=>(i===k||i===k2)?{x:p.x+n.x*t,y:p.y+n.y*t}:{x:p.x,y:p.y});
    } else {
      // 頂点ハンドル: 向かいの頂点を固定し、2辺を平行に動かして拡大縮小(常に直角の長方形のまま)
      const opp=P[(d.vi+2)%4], dx=np.x-opp.x, dy=np.y-opp.y, a=dx*u.x+dy*u.y, b=dx*v.x+dy*v.y;
      q=P.map(p=>{ const rx=p.x-opp.x, ry=p.y-opp.y, cu=rx*u.x+ry*u.y, cv=rx*v.x+ry*v.y;
        const fa=Math.abs(cu)>1e-6?a:0, fb=Math.abs(cv)>1e-6?b:0;
        return {x:opp.x+u.x*fa+v.x*fb, y:opp.y+u.y*fa+v.y*fb}; });
    }
    // 向かい側を越えて反転した場合も、元の巻き方向(頂点の並び)を保つ
    if(_editSignedArea(q)*_editSignedArea(P)<0) q=[q[0],q[3],q[2],q[1]];
    sh.pts=q; if(o.holes) sh.holes=o.holes.map(h=>h.map(p=>({x:p.x,y:p.y}))); // 穴は動かさない(はみ出したら離した時に不可)
  } else {
    const c=_editCopyRings({pts:o.pts,holes:o.holes});
    const rings=[c.pts].concat(c.holes||[]);
    rings[d.ri][d.vi]={x:np.x,y:np.y};
    sh.pts=c.pts; if(c.holes) sh.holes=c.holes;
  }
  d.moved=true;
  if(animId)cancelAnimationFrame(animId);
  animId=requestAnimationFrame(()=>redraw());
}
function _editRestore(d){ const sh=shapes[d.si]; if(!sh) return; sh.pts=d.orig.pts.map(p=>({x:p.x,y:p.y})); if(d.orig.holes) sh.holes=d.orig.holes.map(h=>h.map(p=>({x:p.x,y:p.y}))); else delete sh.holes; }
function editMouseUp(){
  if(!editDrag) return;
  const d=editDrag; editDrag=null; showSnap(null);
  setToolBar('✏ 修正モード');
  const sh=shapes[d.si];
  if(!sh||!d.moved){ redraw(); return; }
  const valid = _editShapeValid(sh); // r037: 四角形も(拡大縮小後の)面積下限・穴のはみ出しを判定
  if(!valid){
    _editRestore(d);
    toast('⚠ その形状は出来ません',2200);
    redraw(); return;
  }
  // 成功: Undoには「変更前」の形で積む(pushUndoは現在状態を保存するため、一旦元に戻してから積み、再度新しい形に戻す)
  const np={pts:sh.pts,holes:sh.holes};
  _editRestore(d); pushUndo();
  sh.pts=np.pts; if(np.holes) sh.holes=np.holes;
  sh.area=calcArea(sh.pts)-(sh.holes||[]).reduce((s,h)=>s+calcArea(h),0);
  updSidebar(); redraw();
}
function setEditMode(on){
  if(on){
    _invalidateRepeat();
    if(drawing)cancelDraw();
    if(distMode)setDistMode(false);
    if(surveyMode)setSurveyMode(false);
    if(selUnionMode)setSelUnionMode(false);
    if(subMode)setSubMode(false);
    if(selectedSet.size>0)clearSelection();
  } else if(editDrag){ _editRestore(editDrag); editDrag=null; }
  editMode=on; editHover=null;
  if(!on) _startToolEndCooldown();
  const b=document.getElementById('edit-btn'); if(b) b.classList.toggle('on',on);
  if(on){
    setStatus('✏ 修正: 頂点をドラッグして移動');
    setToolBar('✏ 修正モード');
    toast('✏ 修正モード: 頂点をドラッグ（四角形は直角のまま拡大縮小・辺の◆は平行移動、多角形は自由。不正な形は元に戻ります）',3600);
  } else {
    setStatus(''); setToolBar(''); showSnap(null); drawCv.style.cursor='';
  }
  redraw();
}
// ドラッグ解除(マウスを離した時)の判定・ESCキャンセル
document.addEventListener('mouseup',e=>{ if(editMode && editDrag && e.button===0) editMouseUp(); });
document.addEventListener('keydown',e=>{
  if(!editMode) return;
  if(e.key==='Escape'){
    if(editDrag){ _editRestore(editDrag); editDrag=null; showSnap(null); setToolBar('✏ 修正モード'); redraw(); toast('✏ 移動をキャンセルしました',1200); }
    else setEditMode(false);
  }
});

function toggleSub(idx){
  if(subBase===-1){subBase=idx;}
  else if(idx===subBase){subBase=-1;subTargets.clear();}
  else{
    if(subTargets.has(idx))subTargets.delete(idx);
    else subTargets.add(idx);
  }
  updSubToolbar(); // Fix2: ベース+ターゲット両方選択時のみ実行ボタン
  updSidebar();redraw();
}

function applySubtract(){
  if(subBase===-1||subTargets.size===0){toast('⚠ 図形を選択してください');return;}
  pushUndo();
  const SF = 10000;
  const toCP = (p) => p.map(v => ({X:Math.round(v.x*SF), Y:Math.round(v.y*SF)}));
  const cl = new ClipperLib.Clipper();
  
  cl.AddPath(toCP(getOuter(shapes[subBase])), ClipperLib.PolyType.ptSubject, true);
  getHoles(shapes[subBase]).forEach(h => cl.AddPath(toCP(h), ClipperLib.PolyType.ptSubject, true));
  [...subTargets].forEach(i => cl.AddPath(toCP(getOuter(shapes[i])), ClipperLib.PolyType.ptClip, true));

  const sol = new ClipperLib.Paths();
  cl.Execute(ClipperLib.ClipType.ctDifference, sol, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  
  if(!sol.length){toast('⚠ 削除結果が空です'); return;}

  const classified = classifyPaths(sol, SF);
  const baseColor = shapes[subBase].color || 'blue';
  const kept = shapes.filter((_, i) => i !== subBase && !subTargets.has(i));
  
  const newShapes = classified.map(item => {
    editCount++;
    return {
      type: 'poly',
      pts: item.outer, // .ptsに戻して互換性を維持
      outer: item.outer,
      holes: item.holes,
      area: calcAreaPts(item.outer) - item.holes.reduce((s, h) => s + calcAreaPts(h), 0),
      depthBeam: shapes[subBase].depthBeam,
      topLevel: shapes[subBase].topLevel||'0',
      overdig: shapes[subBase].overdig,
      noSlope: shapes[subBase].noSlope,
      color: baseColor,
      enabled: true,
      name: `削り取り${editCount}`
    };
  });
  
  shapes = [...kept, ...newShapes];
  setSubMode(false); updSidebar(); redraw();
  toast(`✂ 部分削除完了`);
}

// ================================================================
//  ポリゴン演算（ClipperLib使用）
// ================================================================

// 選択合成: ClipperLibでUnion（頂点省略なし）
function execPolyUnion(ptsList){
  if(!ptsList.length)return[];
  const SF = 10000;
  const toCP = (p) => p.map(v => ({X:Math.round(v.x*SF), Y:Math.round(v.y*SF)}));
  
  const cl = new ClipperLib.Clipper();
  for(const pts of ptsList){
    const path = toCP(pts);
    // 向きをCWに統一して追加
    let a=0; for(let i=0; i<path.length; i++){ const j=(i+1)%path.length; a+=path[i].X*path[j].Y-path[j].X*path[i].Y; }
    if(a<0) path.reverse();
    cl.AddPath(path, ClipperLib.PolyType.ptSubject, true);
  }
  
  const sol = new ClipperLib.Paths();
  cl.Execute(ClipperLib.ClipType.ctUnion, sol, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftPositive);
  
  // AreCal仕分けエンジン(classifyPaths)を呼ぶことで穴あき形状を判定
  return classifyPaths(sol, SF); 
}

// ================================================================
//  ステータスバー
// ================================================================
function setStatus(msg){
  const el=document.getElementById('status-bar');
  if(!el)return;
  if(msg){
    el.textContent=msg;
    el.style.display='inline';
  } else {
    el.textContent='';
    el.style.display='none';
  }
  // ツールバー(tool-name)書き換え処理は重複の原因になるため削除済み
}
function toggleSidebars(disabled) {
  const sidebars = [document.getElementById('sb-left'), document.getElementById('sb')];
  sidebars.forEach(sb => {
    if (sb) {
      sb.style.pointerEvents = disabled ? 'none' : 'auto';
      sb.style.opacity = disabled ? '0.4' : '1'; // 視覚的に操作不可を示す
      sb.style.transition = 'opacity 0.2s';
    }
  });
}

// r041: showRotModal() を削除し、旧rot-yesのクリック処理だった「角度調整UIの開始」をここへ切り出した。
//       _startupAfterRender()が直接呼ぶ(以前はボタンを仮想クリックしていた)。
function startRotationUI(){
  rotAngle=0;
  document.getElementById('rot-overlay').style.display='block';
  document.getElementById('rot-ctrl').style.display='flex';
  toggleSidebars(true); // サイドバーをロック
  fitScreen();
  toast('📐 回転モード: ボタンまたは入力欄で角度を調整してください',4000);
}
function previewRot(angle){
  rotAngle = angle;
  // 入力欄の値だけを更新するようにしたわ。これでエラーも起きないしスッキリよ
  const input = document.getElementById('rot-ang-input');
  if(input) input.value = angle.toFixed(1);
  applyTrans();
}
async function bakeRotation(angle){
  if(!_rotPage||Math.abs(angle)<0.001){rotAngle=0;applyTrans();return;}
  const rad=angle*Math.PI/180;
  const cos=Math.abs(Math.cos(rad)),sin=Math.abs(Math.sin(rad));
  // オリジナルPDFサイズ（RS=4でレンダリング済み）
  const W=pdfW,H=pdfH; // 現在のcanvasサイズ=レンダリング済みサイズ
  // 回転後の新サイズ
  const newW=Math.ceil(W*cos+H*sin),newH=Math.ceil(W*sin+H*cos);
  // 現在のpdfCvをtmpに保存
  const tmp=document.createElement('canvas');
  tmp.width=W;tmp.height=H;
  const tmpCtx=tmp.getContext('2d');
  // 白背景を塗る（黒余白防止）
  tmpCtx.fillStyle='#ffffff';
  tmpCtx.fillRect(0,0,W,H);
  tmpCtx.drawImage(pdfCv,0,0);
  // 新サイズにリサイズ
  pdfW=newW;pdfH=newH;
  [pdfCv,drawCv].forEach(cv=>{
    cv.width=newW;cv.height=newH;
    cv.style.width=newW+'px';cv.style.height=newH+'px';
  });
  // 白背景を塗ってから回転描画
  pdfCtx.fillStyle='#ffffff';
  pdfCtx.fillRect(0,0,newW,newH);
  pdfCtx.save();
  pdfCtx.translate(newW/2,newH/2);
  pdfCtx.rotate(rad);
  pdfCtx.translate(-W/2,-H/2);
  pdfCtx.drawImage(tmp,0,0);
  pdfCtx.restore();
  // 既存の描画点も回転
  const cx=W/2,cy=H/2,cosA=Math.cos(rad),sinA=Math.sin(rad),ncx=newW/2,ncy=newH/2;
  function rotPt(p){const rx=p.x-cx,ry=p.y-cy;return{x:ncx+rx*cosA-ry*sinA,y:ncy+rx*sinA+ry*cosA};}
  vecPts=vecPts.map(rotPt);
  vecSegs=vecSegs.map(({a,b})=>({a:rotPt(a),b:rotPt(b)}));
  buildVecGrid(); // r023(AreCal移植): 回転後の座標でグリッド索引を再構築
  shapes.forEach(sh=>{sh.pts=sh.pts.map(rotPt);sh.area=calcArea(sh.pts);});
  surveyPts=surveyPts.map(rotPt); // r024(AreCal移植): 測点も回転に追従させる
}

function redraw(mx,my){
  // r051マスター指摘対応: ノースアローは測点が1つ以上ある時だけ表示する
  // (今後の機能追加の布石)。redraw()はshapes/surveyPtsが変化する箇所で
  // ほぼ必ず呼ばれるため、ここに置けば追加・削除・全消去・undo/redo・
  // ファイル読込のいずれのタイミングでも自動的に追従する。
  { const _naWrap=document.getElementById('north-arrow-wrap'); if(_naWrap) _naWrap.style.display = surveyPts.length>0 ? '' : 'none'; }
  // r059(作図エリア拡張): drawCvは用紙よりdcOffX/dcOffYぶん大きい。まず
  // identity(平行移動なし)に戻してからラスタ全体をclearRectする(前回の
  // setTransformが残ったままclearRectすると余白部分が消え残るため要注意)。
  drawCtx.setTransform(1, 0, 0, 1, 0, 0);
  drawCtx.clearRect(0,0,drawCv.width,drawCv.height);
  // paper空間の座標(lx,ly)をそのままdrawCvのラスタ座標として使えるよう、
  // ここで改めてオフセット平行移動しておく(以降このredraw内のsave/restoreは
  // 全てこの平行移動を基準に積み重なるので、個々の描画コードはlx,lyを
  // そのまま使えばよい)。
  drawCtx.setTransform(1, 0, 0, 1, window._dcOffX||0, window._dcOffY||0);
  shapes.forEach((sh,idx)=>{
    if(sh.enabled===false)return;
    // 色別フィルター
    if(colorFilter[sh.color||'blue']===false)return;
    
    // 状態判定をフラグにしてdrawShapeへ渡す
    const isSelected = selectedSet.has(idx);
    const isUnionTarget = selUnionMode && selUnionSet.has(idx);
    const isSubBase = subMode && idx === subBase;
    const isSubTarget = subMode && subTargets.has(idx);
    
    drawShape(sh, isSelected || isUnionTarget, isSubBase, isSubTarget);
  });
  
  // 距離測定の点を描画（v0.0013: 全線残存）
  if(distPts.length>0){
    drawCtx.save();
    if(distPts.length>=2){
      drawCtx.strokeStyle='#f0c040';
      drawCtx.lineWidth=1.5/zoom;
      drawCtx.setLineDash([5/zoom,3/zoom]);
      drawCtx.beginPath();
      drawCtx.moveTo(distPts[0].x,distPts[0].y);
      for(let i=1;i<distPts.length;i++) drawCtx.lineTo(distPts[i].x,distPts[i].y);
      drawCtx.stroke();
      drawCtx.setLineDash([]);
    }
    for(const p of distPts){
      drawCtx.beginPath();drawCtx.arc(p.x,p.y,6/zoom,0,Math.PI*2);
      drawCtx.fillStyle='#f0c040';drawCtx.fill();
      drawCtx.strokeStyle='#fff';drawCtx.lineWidth=1.5/zoom;drawCtx.stroke();
    }
    drawCtx.restore();
  }
  if(drawing&&cur){
    if(tool==='poly')drawPolyPrev(mx,my);
    if(tool==='rect')drawRectPrev(mx,my);
    if(tool==='yamadome')drawYamadomePrev(mx,my);
  }
  // 山留の描画（設置済み）
  if(yamadome && yamadome.pts && yamadome.pts.length>=3){
    drawCtx.save();
    drawCtx.beginPath();
    yamadome.pts.forEach((p,i)=>i===0?drawCtx.moveTo(p.x,p.y):drawCtx.lineTo(p.x,p.y));
    drawCtx.closePath();
    drawCtx.strokeStyle='rgba(255,80,80,0.85)';
    drawCtx.lineWidth=2.5/zoom;
    drawCtx.setLineDash([8/zoom,4/zoom]);
    drawCtx.stroke();
    drawCtx.setLineDash([]);
    // 頂点ドット表示
    yamadome.pts.forEach((p,i)=>{
      drawCtx.beginPath();drawCtx.arc(p.x,p.y,(yamadomeEditVtx===i?5:3)/zoom,0,Math.PI*2);
      drawCtx.fillStyle=yamadomeEditVtx===i?'#ffff00':'#ff4444';drawCtx.fill();
    });
    drawCtx.restore();
  }
  // r037: ✏修正モード中は全図形の頂点にハンドル(■)を表示。四角形はさらに辺の中点(◆)=その辺だけ平行移動。
  //       ドラッグ中のハンドルは黄色、ホバー中は白。
  if(editMode){
    drawCtx.save();
    shapes.forEach((sh,si)=>{
      if(sh.enabled===false||colorFilter[sh.color||'blue']===false) return;
      _editRings(sh).forEach((ring,ri)=>ring.forEach((p,vi)=>{
        const act = editDrag && editDrag.kind==='vertex' && editDrag.si===si && editDrag.ri===ri && editDrag.vi===vi;
        const hov = !editDrag && editHover && editHover.kind==='vertex' && editHover.si===si && editHover.ri===ri && editHover.vi===vi;
        const r=((act||hov)?6:4)/zoom;
        drawCtx.beginPath(); drawCtx.rect(p.x-r,p.y-r,2*r,2*r);
        drawCtx.fillStyle = act ? '#ffff00' : (hov ? '#ffffff' : 'rgba(255,255,255,0.75)');
        drawCtx.fill(); drawCtx.strokeStyle='#000'; drawCtx.lineWidth=1/zoom; drawCtx.stroke();
      }));
      if(_editRectAxes(sh)){
        for(let k=0;k<4;k++){
          const a=sh.pts[k], b=sh.pts[(k+1)%4], mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
          const act = editDrag && editDrag.kind==='edge' && editDrag.si===si && editDrag.vi===k;
          const hov = !editDrag && editHover && editHover.kind==='edge' && editHover.si===si && editHover.vi===k;
          const r=((act||hov)?6:4)/zoom;
          drawCtx.beginPath(); drawCtx.moveTo(mx,my-r); drawCtx.lineTo(mx+r,my); drawCtx.lineTo(mx,my+r); drawCtx.lineTo(mx-r,my); drawCtx.closePath();
          drawCtx.fillStyle = act ? '#ffff00' : (hov ? '#ffffff' : 'rgba(120,200,255,0.9)');
          drawCtx.fill(); drawCtx.strokeStyle='#000'; drawCtx.lineWidth=1/zoom; drawCtx.stroke();
        }
      }
    });
    drawCtx.restore();
  }
  // 測点の描画（r024: AreCal移植）
  if(surveyPts.length>0){
    drawCtx.save();
    surveyPts.forEach((p,i)=>{
      drawCtx.beginPath();
      drawCtx.arc(p.x,p.y,6/zoom,0,Math.PI*2);
      drawCtx.fillStyle='rgba(255,60,60,0.92)';
      drawCtx.fill();
      drawCtx.strokeStyle='#fff';drawCtx.lineWidth=1.5/zoom;drawCtx.stroke();
      // (24回目)(24回目・追加チェック項目3): 測点番号が白文字のままだと、PDF等の
      // 白背景の書類上で読めなくなるため黒文字に変更。小さい文字なので、
      // 白エッジも太くしすぎない(strokeを先に描いてfillで上書きする通常の縁取り手順)。
      drawCtx.font='bold '+(13/zoom)+'px sans-serif';
      drawCtx.lineJoin='round';
      drawCtx.lineWidth=2.5/zoom;
      drawCtx.strokeStyle='rgba(255,255,255,0.9)';
      drawCtx.strokeText('No.'+(i+1),p.x+9/zoom,p.y-8/zoom);
      drawCtx.fillStyle='#111';
      drawCtx.fillText('No.'+(i+1),p.x+9/zoom,p.y-8/zoom);
    });
    drawCtx.restore();
  }
}
function drawShape(sh, selected, subBaseHl, subTgtHl){
  const outer = getOuter(sh);
  const holes = getHoles(sh);
  if(!outer || outer.length < 2) return;

  const cl = SHAPE_COLORS[sh.color||'blue'] || SHAPE_COLORS.blue;
  
  let fill = cl.fill;
  let stroke = cl.stroke;
  // 垂直（四角柱）は塗りつぶしを少し濃くして区別
  if(sh.noSlope) fill = cl.fill.replace(/[\d.]+\)$/, '0.52)');

  // 選択状態による色の変化
  if(sh._voldiaGeoError) { fill = 'rgba(255,23,68,.35)'; stroke = 'rgba(255,23,68,.95)'; }
  else if(selected) { fill = 'rgba(255,138,24,.25)'; stroke = 'rgba(255,138,24,.95)'; } // r067(マスター指摘): 薄緑→オレンジ(#FF8A18)
  else if(subBaseHl) { fill = 'rgba(239,83,80,.2)'; stroke = 'rgba(239,83,80,.9)'; }
  else if(subTgtHl) { fill = 'rgba(255,167,38,.15)'; stroke = 'rgba(255,167,38,.9)'; }

  drawCtx.save();
  drawCtx.beginPath();
  
  // 外周を描く
  drawCtx.moveTo(outer[0].x, outer[0].y);
  for(let i=1; i<outer.length; i++) drawCtx.lineTo(outer[i].x, outer[i].y);
  drawCtx.closePath();

  // 穴を描画(省くと中が抜けない)
  holes.forEach(h => {
    if(!h || h.length < 2) return;
    drawCtx.moveTo(h[0].x, h[0].y);
    for(let i=1; i<h.length; i++) drawCtx.lineTo(h[i].x, h[i].y);
    drawCtx.closePath();
  });

  // 'evenodd'充填で穴を白く抜く
  drawCtx.fillStyle = fill;
  drawCtx.fill('evenodd'); 

  drawCtx.strokeStyle = stroke;
  drawCtx.lineWidth = ((selected || subBaseHl || subTgtHl) ? 2.5 : 1.5) / zoom;
  if(subTgtHl) drawCtx.setLineDash([6/zoom, 4/zoom]);
  drawCtx.stroke();

  // 頂点ドット（外周のみ）
  drawCtx.setLineDash([]);
  outer.forEach(p => {
    drawCtx.beginPath(); drawCtx.arc(p.x, p.y, 2.5/zoom, 0, Math.PI*2);
    drawCtx.fillStyle = stroke; drawCtx.fill();
  });
  
  drawCtx.restore();
}
function drawPolyPrev(mx,my){
  const pts=cur.pts;if(!pts.length)return;
  let px=mx,py=my;
  if(mx!==undefined&&shiftDown&&pts.length>0){
    const l=pts[pts.length-1];({x:px,y:py}=s90(l.x,l.y,mx,my));
  }
  drawCtx.save();
  drawCtx.beginPath();drawCtx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++)drawCtx.lineTo(pts[i].x,pts[i].y);
  if(mx!==undefined)drawCtx.lineTo(px,py);
  drawCtx.closePath();
  drawCtx.fillStyle='rgba(255,60,0,.2)';drawCtx.strokeStyle='rgba(255,90,60,.9)';
  drawCtx.lineWidth=1.5/zoom;drawCtx.setLineDash([5/zoom,3/zoom]);
  drawCtx.fill();drawCtx.stroke();drawCtx.setLineDash([]);
  if(mx!==undefined&&pts.length>=2){
    drawCtx.beginPath();drawCtx.moveTo(px,py);drawCtx.lineTo(pts[0].x,pts[0].y);
    drawCtx.strokeStyle='rgba(255,200,0,.3)';drawCtx.lineWidth=1/zoom;
    drawCtx.setLineDash([3/zoom,4/zoom]);drawCtx.stroke();drawCtx.setLineDash([]);
  }
  if(pts.length>=3){
    drawCtx.beginPath();drawCtx.arc(pts[0].x,pts[0].y,6/zoom,0,Math.PI*2);
    drawCtx.strokeStyle='rgba(255,220,0,.9)';drawCtx.lineWidth=2/zoom;drawCtx.stroke();
  }
  for(const p of pts){
    drawCtx.beginPath();drawCtx.arc(p.x,p.y,3/zoom,0,Math.PI*2);
    drawCtx.fillStyle='#ff6644';drawCtx.fill();
  }
  // Fix3: マウス付近に線分長さを白文字黒背景で表示
  if(mx!==undefined&&pts.length>0&&scaleDenom){
    const last=pts[pts.length-1];
    const dmm=Math.round(pxToMm(Math.hypot(px-last.x,py-last.y)));
    if(dmm>0){
      const fs=Math.max(9,12/zoom);
      drawCtx.font=`${fs}px sans-serif`;
      const label=`${dmm}mm`;
      const tw=drawCtx.measureText(label).width;
      drawCtx.fillStyle='rgba(0,0,0,.8)';
      drawCtx.fillRect(px+7/zoom,py-fs-2/zoom,tw+6/zoom,fs+4/zoom);
      drawCtx.fillStyle='#ffffff';
      drawCtx.fillText(label,px+10/zoom,py-2/zoom);
    }
  }
  drawCtx.restore();
}
function drawYamadomePrev(mx,my){
  if(!cur||!cur.pts.length) return;
  const pts=cur.pts;
  drawCtx.save();
  drawCtx.beginPath();
  pts.forEach((p,i)=>i===0?drawCtx.moveTo(p.x,p.y):drawCtx.lineTo(p.x,p.y));
  if(mx!==undefined) drawCtx.lineTo(mx,my);
  drawCtx.closePath();
  drawCtx.strokeStyle='rgba(255,80,80,0.9)';
  drawCtx.lineWidth=2/zoom;
  drawCtx.setLineDash([8/zoom,4/zoom]);
  drawCtx.stroke(); drawCtx.setLineDash([]);
  // 始点ハイライト
  if(pts.length>=3){
    drawCtx.beginPath();drawCtx.arc(pts[0].x,pts[0].y,6/zoom,0,Math.PI*2);
    drawCtx.strokeStyle='rgba(255,220,0,.9)';drawCtx.lineWidth=2/zoom;drawCtx.stroke();
  }
  for(const p of pts){
    drawCtx.beginPath();drawCtx.arc(p.x,p.y,3/zoom,0,Math.PI*2);
    drawCtx.fillStyle='#ff4444';drawCtx.fill();
  }
  drawCtx.restore();
}
function drawRectPrev(mx,my){
  if(!cur.pts.length||mx===undefined)return;
  const p0=cur.pts[0];
  // Fix1: プレビューもスナップに合わせる
  const smx=applySnapRound(mx), smy=applySnapRound(my);
  // v0.0009: 逆回転で正しいw/hを計算（角度付き矩形プレビューバグ修正）
  const rad=rectAngle*Math.PI/180;
  const cosA=Math.cos(rad),sinA=Math.sin(rad);
  const dx=smx-p0.x, dy=smy-p0.y;
  let w=dx*cosA+dy*sinA;   // 逆回転のx成分
  let h=-dx*sinA+dy*cosA;  // 逆回転のy成分
  if(shiftDown){const s=Math.min(Math.abs(w),Math.abs(h));w=s*Math.sign(w);h=s*Math.sign(h);}
  function rotP(dx2,dy2){return {x:p0.x+dx2*cosA-dy2*sinA, y:p0.y+dx2*sinA+dy2*cosA};}
  const rpts=[rotP(0,0),rotP(w,0),rotP(w,h),rotP(0,h)];
  drawCtx.save();
  drawCtx.beginPath();
  drawCtx.moveTo(rpts[0].x,rpts[0].y);
  rpts.slice(1).forEach(p=>drawCtx.lineTo(p.x,p.y));
  drawCtx.closePath();
  drawCtx.fillStyle='rgba(255,60,0,.18)';drawCtx.strokeStyle='rgba(255,90,60,.9)';
  drawCtx.lineWidth=1.5/zoom;drawCtx.setLineDash([5/zoom,3/zoom]);
  drawCtx.fill();drawCtx.stroke();drawCtx.setLineDash([]);
  // 寸法表示
  let wmm=pxToMm(Math.abs(w)), hmm=pxToMm(Math.abs(h));
  if(snapRound>0){wmm=Math.round(wmm/snapRound)*snapRound;hmm=Math.round(hmm/snapRound)*snapRound;}
  const wm=wmm.toFixed(0), hm=hmm.toFixed(0);
  const fs=Math.max(10,13/zoom);
  drawCtx.font=`bold ${fs}px sans-serif`;
  const label=rectAngle?`${wm}×${hm}mm ${rectAngle}°`:`${wm}×${hm}mm`;
  const tw=drawCtx.measureText(label).width;
  const tx=rpts[2].x+8/zoom, ty=rpts[2].y-4/zoom;
  drawCtx.fillStyle='rgba(0,0,0,.75)';
  drawCtx.fillRect(tx-2/zoom,ty-fs,tw+4/zoom,fs+4/zoom);
  drawCtx.fillStyle='#ffffff';
  drawCtx.fillText(label,tx,ty);
  drawCtx.beginPath();drawCtx.arc(p0.x,p0.y,3/zoom,0,Math.PI*2);
  drawCtx.fillStyle='#ff6644';drawCtx.fill();
  drawCtx.restore();
}

// AreCalから移植: Clipperの出力を「外周」と「穴」に仕分ける中心処理
function classifyPaths(rawPaths, SF) {
  const pts = rawPaths.map(p => p.map(v => ({ x: v.X / SF, y: v.Y / SF })));
  const n = pts.length;
  const depth = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p0 = pts[i][0], p1 = pts[i][1];
    // 頂点ではなく辺の中点で内外判定する
    const testPt = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }; 
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (pointInPoly(testPt.x, testPt.y, pts[j])) depth[i]++;
    }
  }
  const result = [];
  pts.forEach((p, i) => { if (depth[i] % 2 === 0) result.push({ outer: p, holes: [] }); });
  pts.forEach((p, i) => {
    if (depth[i] % 2 !== 0) {
      for (const r of result) {
        if (pointInPoly(pts[i][0].x, pts[i][0].y, r.outer)) { r.holes.push(p); break; }
      }
    }
  });
  return result;
}

function polySignedArea(pts){
  let a=0;const n=pts.length;
  for(let i=0;i<n;i++){const j=(i+1)%n;a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y;}
  return a*0.5;
}

// ポリゴンをCW(面積>0)に正規化 — canvas座標系で一貫させる
function normalizeCW(pts){
  return polySignedArea(pts)>0 ? pts.slice() : pts.slice().reverse();
}

// 1mm未満の近接重複点・始終点の重複を除去
function cleanPolygonPoints(pts){
  if(!pts || pts.length < 3) return [];
  const cleaned = [];
  for(let i=0; i<pts.length; i++){
    const p = pts[i];
    // 直前の登録点と0.1mm未満の近接ならスキップしてマージ
    if(cleaned.length > 0){
      const last = cleaned[cleaned.length - 1];
      if(Math.hypot(p.x - last.x, p.y - last.y) < 0.1){
        continue;
      }
    }
    cleaned.push({x: p.x, y: p.y});
  }
  // 始点と終点が重複(閉じている)場合は終点を除去
  if(cleaned.length >= 3){
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if(Math.hypot(first.x - last.x, first.y - last.y) < 0.1){
      cleaned.pop();
    }
  }
  return cleaned;
}

