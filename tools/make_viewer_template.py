# 47回目: voldia_viewer.html(サンプル案)から data/voldia_viewer_template.js を作る。使い方: python3 tools/make_viewer_template.py [tools/voldia_viewer_source.html]  (ソース=サンプル案voldia_viewer.htmlを47回目に修正したもの)
import json,re,sys
src=open(sys.argv[1] if len(sys.argv)>1 else 'tools/voldia_viewer_source.html',encoding='utf-8').read()
tags=re.findall(r'<script src="[^"]+"></script>\n?',src); assert len(tags)==3,tags
for t in tags: src=src.replace(t,'',1)
i=src.find('<script>\n// ===='); assert i>0
src=src[:i]+'<!--VOLDIA_LIBS-->\n'+src[i:]
a='const INLINE_GLB_BASE64 = "";'; b='const INLINE_ANNOTATIONS = [];'; assert src.count(a)==1 and src.count(b)==1
src=src.replace(a,'const INLINE_GLB_BASE64 = "%%VOLDIA_GLB_BASE64%%";').replace(b,'const INLINE_ANNOTATIONS = %%VOLDIA_ANNOTATIONS%%;').replace('<title>Voldia 3D Viewer</title>','<title>%%VOLDIA_TITLE%%</title>')
VER='r3'  # ひな形を直したらここを上げる(配置モード側 voldia_placement.js の VIEWER_TEMPLATE_VER_NEED と同じにする。古いひな形のまま書き出すのを防ぐ)
open('data/voldia_viewer_template.js','w',encoding='utf-8').write('// ひな形の版: '+VER+' (47回目: 影の範囲と向き・吹き出し・空色・影ON/OFF・robots noindex)\nwindow.VOLDIA_VIEWER_TEMPLATE_VER = '+json.dumps(VER)+';\nwindow.VOLDIA_VIEWER_TEMPLATE = '+json.dumps(src,ensure_ascii=False)+';\n')
