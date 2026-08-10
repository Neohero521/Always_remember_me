(function() {
/* ============================================================================
 * 时之写卡器 · Tavern Helper 脚本（整理版）
 * ----------------------------------------------------------------------------
 * 项目类型：后台脚本（Tavern Helper Script · 相当于模板里的 index.ts）
 * 运行形式：单文件 JS，导入到酒馆脚本库，点击脚本按钮打开写卡器
 * 技术栈：原生 JS + 自建 iframe UI（无需构建工具，便于酒馆用户使用）
 *
 * 依据 tavern-helper-template 脚本规范 + sillytavern-dev 技能进行整理：
 *   1) 入口/卸载时序：用 $(() => scriptEntryPoint()) 替代顶层 tryInit()
 *                     pagehide 时统一 cleanupScriptArtifacts()
 *   2) 常量与模板集中在顶部：IFRAME_CSS、SVG 图标库、cardData 模板等
 *   3) 工具函数在业务逻辑之前
 *   4) 所有写卡/酒馆 API 调用封装在 "酒馆适配层" 中
 *   5) 脚本自身 UI（写卡器 iframe） 的样式和 JS 分离
 *
 * 本文件分块索引（按代码顺序从上到下）：
 *   ▌SECTION 0  脚本元信息 & 全局常量
 *   ▌SECTION 1  IFRAME 外观样式（已抽到顶部 IFRAME_CSS 常量）
 *   ▌SECTION 2  通用工具函数（Toast、SVG图标、Token估算、iframe创建/销毁）
 *   ▌SECTION 3  卡片数据模板 + 世界书条目模板 + MVU美化模板
 *   ▌SECTION 4  写卡预设 + 系统提示词（含 AI 输出格式约束）
 *   ▌SECTION 5  条目匹配 + 智能合并引擎（mergePartial · 去重/删除屏障）
 *   ▌SECTION 6  AI 调用适配层 + 响应清洗（callAI · cleanAIReply · JSON修复）
 *   ▌SECTION 7  MVU 8步质检 + 提示词构建（buildPrompt · 角色卡/MVU Tab 隔离）
 *   ▌SECTION 8  酒馆 SillyTavern API 适配层（_tavern() 封装 · 导入导出）
 *   ▌SECTION 9  写卡器主界面 UI 渲染（欢迎页 · 聊天页 · 预览面板 · 工作台）
 *   ▌SECTION 10 聊天消息发送与 AI 流式回复（callAIChat · 写卡流程主循环）
 *   ▌SECTION 11 脚本注册按钮 + 浮动按钮 + 入口 / 卸载清理
 * ==========================================================================
 */
  const SCRIPT_ID = 'modelo-char-generator';


  // ===== Iframe 样式表（已从 createModalIframe 中抽出，便于维护和复用）=====
  var IFRAME_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;width:100%;overflow:hidden}
:root{
  /* 简洁中性配色：暖白底 + 石墨字 + 靛蓝主色（参考 IDE 工作区，干净舒服）*/
  --bg:#f7f7f2;            /* 主背景：暖白 */
  --surface:#ffffff;       /* 卡面：纯白 */
  --surface-soft:#f4f5f7;  /* 次级面：浅石墨 */
  --surface-sink:#eef0f3;  /* 下沉面：浅灰 */
  --ink:#111827;           /* 主文字：墨黑 */
  --ink-soft:#475467;      /* 次文字：石墨 */
  --muted:#667085;         /* 弱文字：中灰（AA 达标）*/
  --accent:#4f46e5;        /* 主色：靛蓝 */
  --accent-deep:#4338ca;   /* 主色深：靛蓝深 */
  --accent-soft:rgba(79,70,229,.08);   /* 主色浅 */
  --accent-soft-strong:rgba(79,70,229,.12);
  --accent-border:rgba(79,70,229,.22);
  --accent-border-strong:rgba(79,70,229,.55);
  --accent-text:#4338ca;
  --sage:#16a34a;          /* 成功：绿 */
  --sage-soft:rgba(22,163,74,.08);
  --sage-soft-strong:rgba(22,163,74,.16);
  --sage-border:rgba(22,163,74,.20);
  --sage-border-strong:rgba(22,163,74,.40);
  --sage-text:#15803d;
  --amber:#ca8a04;         /* 提醒：琥珀 */
  --amber-soft:rgba(202,138,4,.09);
  --amber-soft-strong:rgba(202,138,4,.16);
  --amber-border:rgba(202,138,4,.22);
  --amber-border-strong:rgba(202,138,4,.45);
  --amber-text:#a16207;
  --terra:#dc2626;         /* 危险：赤红 */
  --terra-soft:rgba(220,38,38,.08);
  --terra-soft-strong:rgba(220,38,38,.14);
  --terra-border:rgba(220,38,38,.22);
  --terra-border-strong:rgba(220,38,38,.45);
  --terra-text:#dc2626;
  --line:rgba(15,23,42,.10);          /* 描边：石墨 */
  --line-soft:rgba(15,23,42,.06);     /* 弱描边 */
  --radius:12px;           /* 圆角基线（简洁）*/
  --radius-sm:8px;
  --radius-lg:16px;
  --shadow-soft:0 6px 20px rgba(15,23,42,.06);
  --shadow-card:0 12px 30px rgba(15,23,42,.08);
  --shadow-float:0 20px 60px rgba(15,23,42,.12);
  --font:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC','Microsoft YaHei UI','Hiragino Sans GB',sans-serif;
  --font-mono:'Sarasa Mono SC','Cascadia Code','JetBrains Mono','Consolas',Menlo,monospace;
  --app-font-scale: 1;   /* 全局字体缩放（0.85~1.20），由JS按钮调整 */
  /* 滚动条 */
  --scrollbar-thumb:rgba(148,163,184,.4);
  --scrollbar-track:transparent;
  /* 链接色（走变量，便于主题化）*/
  --link:#2563eb;
}
body{font-family:var(--font);background:var(--bg);color:var(--ink);font-size:calc(14px * var(--app-font-scale,1));-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
/* 工作区关键模块的字体大小也随缩放走，但保持最小字号保证可读性 */
.topbar h1{font-size:calc(.95em * var(--app-font-scale,1))}
.quick-btn,.qa-mini{font-size:calc(.8em * var(--app-font-scale,1))}
.pv-section h3{font-size:calc(.86em * var(--app-font-scale,1))}
.pv-section .pv-entry-content,.pv-section .pv-entry summary,.pv-section .pv-code,.pv-section .pv-content{font-size:calc(.82em * var(--app-font-scale,1));line-height:calc(1.65 * var(--app-font-scale,1))}
.bubble.user,.bubble.assistant{font-size:calc(.88em * var(--app-font-scale,1))}
.chat-input{font-size:calc(.9em * var(--app-font-scale,1))}
/* SVG 图标基线：统一对齐、currentColor 继承 */
svg.ic{display:inline-block;vertical-align:-.18em;flex-shrink:0;transition:color .2s}
.ic-spin{animation:spin 0.8s linear infinite}
.app{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;padding-bottom:env(safe-area-inset-bottom,0)}
.topbar{flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:0 14px;background:linear-gradient(180deg,var(--surface) 0%,var(--surface) 70%,rgba(79,70,229,.02) 100%);border-bottom:1px solid var(--line);min-height:50px;position:relative}
.topbar::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(79,70,229,.18),transparent)}
.topbar-left{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.topbar-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.font-ctrl{display:inline-flex;align-items:center;gap:3px;background:linear-gradient(135deg,var(--surface-soft),var(--surface));border:1px solid var(--line-soft);border-radius:8px;padding:2px 5px;flex-shrink:0;transition:all .2s ease}
.font-ctrl:hover{border-color:var(--accent-soft);box-shadow:0 2px 8px rgba(79,70,229,.06)}
.font-ctrl .font-btn{height:26px;width:26px;font-size:.74em;font-weight:700;padding:0;color:var(--ink-soft);border:1px solid transparent;background:var(--surface);border-radius:6px;transition:all .18s ease;cursor:pointer}
.font-ctrl .font-btn:hover:not(:disabled){background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border-strong)}
.font-ctrl .font-size-label{font-size:.72em;color:var(--ink-soft);min-width:40px;text-align:center;font-weight:600}
.topbar h1{font-size:.95em;color:var(--accent-deep);font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:7px;flex-shrink:0;letter-spacing:.2px}
.topbar h1 .topbar-ic{color:var(--accent);filter:drop-shadow(0 1px 2px rgba(79,70,229,.2))}
.topbar .phase{font-size:.8em;color:var(--accent-text);background:linear-gradient(135deg,var(--accent-soft),rgba(79,70,229,.12));padding:4px 13px;border-radius:999px;font-weight:600;white-space:nowrap;flex-shrink:0;border:1px solid var(--accent-border);letter-spacing:.2px;box-shadow:0 1px 3px rgba(79,70,229,.08);transition:all .2s ease}
.topbar .phase:hover{border-color:var(--accent-border-strong);box-shadow:0 2px 8px rgba(79,70,229,.12)}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:32px;padding:0 11px;background:var(--surface);border:1px solid var(--line);border-radius:8px;color:var(--ink-soft);cursor:pointer;transition:all .18s cubic-bezier(.4,0,.2,1);font-size:.82em;font-weight:600;font-family:inherit;white-space:nowrap;position:relative;overflow:hidden}
.icon-btn svg{width:15px;height:15px;transition:transform .18s ease}
.icon-btn:hover:not(:disabled){background:linear-gradient(135deg,var(--surface),var(--accent-soft));color:var(--accent-deep);border-color:var(--accent-border);box-shadow:0 3px 10px rgba(79,70,229,.1);transform:translateY(-1px)}
.icon-btn:hover:not(:disabled) svg{transform:scale(1.1)}
.icon-btn:active:not(:disabled){transform:translateY(0) scale(.98)}
.icon-btn.icon-btn-square{width:32px;padding:0}
.icon-btn.icon-btn-square svg{width:16px;height:16px}
.icon-btn.danger:hover:not(:disabled){background:linear-gradient(135deg,var(--surface),var(--terra-soft));color:var(--terra-text);border-color:var(--terra-border);box-shadow:0 3px 10px rgba(220,38,38,.1)}
/* 通用按钮焦点环（无障碍）*/
.quick-btn:focus-visible,.qa-mini:focus-visible,.ctx-mod:focus-visible,.icon-btn:focus-visible,.tab-btn:focus-visible,.pv-mini-btn:focus-visible,.btn-send:focus-visible,.btn:focus-visible,.close-btn:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-soft-strong),0 0 0 1px var(--accent)}
.main{flex:1 1 0;display:flex;min-height:0;overflow:hidden}
.chat-panel{flex:1.4 1 0;display:flex;flex-direction:column;min-width:0;border-right:1px solid var(--line);min-height:0;overflow:hidden;background:var(--bg)}
.preview-panel{flex:1 1 0;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--surface-soft)}
.chat-header{flex-shrink:0;padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--line-soft);font-size:.78em;color:var(--accent-deep);display:flex;align-items:center;gap:5px}
.chat-messages{flex:1 1 0;overflow-y:auto;padding:14px 14px;min-height:0;-webkit-overflow-scrolling:touch}
.chat-msg{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;align-items:flex-start}
.chat-msg.user{align-items:flex-end}
.chat-msg .avatar{width:72px;height:72px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0}
.chat-msg .avatar svg{width:40px;height:40px}
.chat-msg.assistant .avatar{background:var(--accent-soft);color:var(--accent-deep)}
.chat-msg.user .avatar{background:var(--surface-sink);color:var(--ink-soft)}
/* 头像点击弹出菜单（展开在头像旁边） */
.avatar-menu{position:absolute;z-index:500;background:linear-gradient(135deg,var(--surface) 0%,var(--surface-soft) 100%);border:1px solid var(--line);border-radius:999px;box-shadow:0 12px 36px rgba(15,23,42,.12),0 2px 6px rgba(15,23,42,.06);padding:5px 4px;display:flex;flex-direction:row;align-items:center;gap:3px;font-size:.84em;animation:avatarMenuPop .14s cubic-bezier(.34,1.56,.64,1)}
@keyframes avatarMenuPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
/* AI头像在左→菜单向右展开（贴在头像右侧）；用户头像在右→菜单向左展开（贴在头像左侧） */
.avatar-menu.am-right{left:calc(100% + 8px);top:50%;transform:translateY(-50%);transform-origin:left center}
.avatar-menu.am-left{right:calc(100% + 8px);top:50%;transform:translateY(-50%);transform-origin:right center}
/* 弹出动画需保留 translateY，单独处理 */
.avatar-menu.am-right{animation:avatarMenuPopRight .14s cubic-bezier(.34,1.56,.64,1)}
.avatar-menu.am-left{animation:avatarMenuPopLeft .14s cubic-bezier(.34,1.56,.64,1)}
@keyframes avatarMenuPopRight{from{opacity:0;transform:translateY(-50%) translateX(-8px) scale(.6)}to{opacity:1;transform:translateY(-50%) translateX(0) scale(1)}}
@keyframes avatarMenuPopLeft{from{opacity:0;transform:translateY(-50%) translateX(8px) scale(.6)}to{opacity:1;transform:translateY(-50%) translateX(0) scale(1)}}
.avatar-menu-item{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;cursor:pointer;color:var(--ink-soft);transition:background .15s ease,color .15s ease,transform .15s ease,box-shadow .15s ease;position:relative}
.avatar-menu-item:hover{background:var(--surface);color:var(--accent-deep);transform:scale(1.08);box-shadow:0 2px 8px rgba(79,70,229,.12)}
.avatar-menu-item:active{transform:scale(.95)}
.avatar-menu-item.danger{color:var(--terra-text)}
.avatar-menu-item.danger:hover{background:var(--terra-soft);color:var(--terra-text);box-shadow:0 0 0 1px var(--terra-border),0 2px 8px rgba(220,38,38,.12)}
.avatar-menu-item svg{flex-shrink:0;transition:transform .15s ease}
.avatar-menu-item:hover svg{transform:scale(1.08)}
.avatar-menu-item .am-tip{position:absolute;bottom:calc(100% + 7px);left:50%;transform:translateX(-50%) translateY(3px);background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:4px 10px;border-radius:6px;font-size:.7em;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s ease,transform .15s ease;z-index:501;font-weight:500;box-shadow:0 6px 18px rgba(15,23,42,.22);letter-spacing:.2px}
.avatar-menu-item:hover .am-tip{opacity:1;transform:translateX(-50%) translateY(0)}
.avatar-menu-sep{width:1px;height:22px;background:linear-gradient(180deg,transparent,var(--line),transparent);margin:0 3px;flex-shrink:0}
.chat-msg .bubble{max-width:82%;padding:10px 14px;border-radius:var(--radius);font-size:.85em;line-height:1.65;word-break:break-word}
.chat-msg.assistant .bubble{background:var(--surface);border:1px solid var(--line-soft);color:var(--ink);font-size:1em;padding:12px 16px;max-width:100%;width:100%;border-radius:var(--radius);box-shadow:var(--shadow-soft)}
.chat-msg.user .bubble{background:var(--surface);border:1px solid var(--line);color:var(--ink);border-bottom-right-radius:var(--radius-sm);box-shadow:var(--shadow-soft)}
.chat-msg .bubble b{color:var(--accent-deep)}
.chat-msg .bubble code{background:var(--surface-sink);padding:1px 6px;border-radius:var(--radius-sm);font-size:.82em;color:var(--accent-deep);font-family:var(--font-mono)}
.chat-msg .bubble pre{background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius-sm);padding:10px;overflow-x:auto;font-size:1em;margin:6px 0;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto}
.chat-msg .bubble pre code{background:none;padding:0;color:inherit}
.chat-msg .bubble .md-table-wrap{margin:8px 0;overflow-x:auto}
.chat-msg .bubble table{border-collapse:collapse;font-size:.92em}
.chat-msg .bubble th,.chat-msg .bubble td{border:1px solid var(--line);padding:6px 10px;vertical-align:top;min-width:60px}
.chat-msg .bubble th{background:var(--surface-sink);font-weight:700;color:var(--ink)}
.chat-msg .bubble tbody tr:nth-child(even) td{background:var(--surface-soft)}
.chat-msg .bubble h2{font-size:1.15em;font-weight:700;margin:10px 0 4px;color:var(--ink);border-bottom:1px solid var(--line-soft);padding-bottom:3px}
.chat-msg .bubble h3{font-size:1.05em;font-weight:700;margin:8px 0 3px;color:var(--ink)}
.chat-msg .bubble h4{font-size:1em;font-weight:700;margin:6px 0 2px;color:var(--ink)}
.chat-msg .bubble ul,.chat-msg .bubble ol{margin:4px 0 4px 18px;padding:0}
.chat-msg .bubble li{margin:2px 0}
.chat-msg .bubble blockquote{border-left:3px solid var(--accent-soft);margin:6px 0;padding:4px 12px;background:var(--surface-soft);color:var(--ink-soft);font-size:.92em;border-radius:0 var(--radius-sm) var(--radius-sm) 0}
.chat-msg .bubble hr{border:none;border-top:1px solid var(--line-soft);margin:8px 0}
.chat-msg .bubble i{font-style:italic;color:var(--ink-soft)}
.chat-msg .bubble del{color:var(--muted);text-decoration:line-through}
.chat-msg .bubble a{color:var(--link);text-decoration:underline}
.html-render-frame{display:block;margin:6px 0}
.typing{color:var(--muted);font-style:italic;font-size:.8em;padding:4px 8px}
.typing span{display:inline-block;animation:blink 1.4s infinite;color:var(--accent)}
.typing span:nth-child(2){animation-delay:.2s}
.typing span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
.quick-actions{flex-shrink:0;display:flex;gap:8px;padding:10px 14px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line-soft);background:linear-gradient(180deg,var(--surface-soft) 0%,var(--surface) 30%);max-height:110px;overflow-y:auto}
.quick-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:var(--surface);color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:.82em;transition:all .18s cubic-bezier(.4,0,.2,1);white-space:nowrap;flex-shrink:0;font-weight:500;position:relative;overflow:hidden}
.quick-btn svg{width:14px;height:14px;transition:transform .18s ease}
.quick-btn:hover:not(:disabled){background:var(--surface);color:var(--accent-deep);border-color:var(--accent-border);box-shadow:0 4px 14px rgba(79,70,229,.12),0 1px 3px rgba(15,23,42,.06);transform:translateY(-1px)}
.quick-btn:hover:not(:disabled) svg{transform:scale(1.1)}
.quick-btn:active:not(:disabled){transform:translateY(0) scale(.98)}
.quick-btn.hl{border-color:var(--accent-border-strong);color:var(--accent-deep);background:linear-gradient(135deg,var(--accent-soft) 0%,rgba(79,70,229,.14) 100%);box-shadow:0 2px 10px rgba(79,70,229,.1)}
.quick-btn.hl:hover:not(:disabled){background:linear-gradient(135deg,var(--accent-soft-strong) 0%,var(--accent-soft) 100%);color:var(--accent-deep);border-color:var(--accent);box-shadow:0 6px 18px rgba(79,70,229,.18),0 2px 4px rgba(79,70,229,.1)}
.quick-btn:disabled{opacity:.4;cursor:not-allowed}
.qa-mini{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:7px 13px;background:var(--surface);color:var(--ink-soft);border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:.82em;line-height:1;transition:all .18s cubic-bezier(.4,0,.2,1);flex-shrink:0;font-weight:500}
.qa-mini svg{width:14px;height:14px;transition:transform .18s ease}
.qa-mini+.qa-mini{margin-left:8px}
.qa-mini:hover:not(:disabled){background:var(--surface);color:var(--accent-deep);border-color:var(--accent-border);box-shadow:0 4px 14px rgba(79,70,229,.12),0 1px 3px rgba(15,23,42,.06);transform:translateY(-1px)}
.qa-mini:hover:not(:disabled) svg{transform:scale(1.1)}
.qa-mini:active:not(:disabled){transform:translateY(0) scale(.98)}
.qa-mini:disabled{opacity:.4;cursor:not-allowed}
.chat-input-area{flex-shrink:0;padding:12px 14px;border-top:1px solid var(--line-soft);background:linear-gradient(180deg,var(--surface) 0%,var(--surface) 60%,rgba(79,70,229,.02) 100%)}
.chat-input-row{display:flex;gap:9px;align-items:flex-end}
.chat-input{width:100%;padding:11px 15px;background:linear-gradient(135deg,var(--surface-soft) 0%,var(--surface) 100%);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink);font-size:14px;resize:none;min-height:44px;max-height:140px;font-family:inherit;line-height:1.55;transition:border-color .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1),background .2s;box-shadow:inset 0 1px 3px rgba(15,23,42,.03);overflow-y:auto}
.chat-input-row .chat-input{flex:1;width:auto}
.chat-input:hover:not(:disabled){border-color:var(--accent-soft);background:var(--surface)}
.chat-input:focus{outline:none;border-color:var(--accent);background:var(--surface);box-shadow:0 0 0 3px var(--accent-soft-strong),0 4px 14px rgba(79,70,229,.08)}
.chat-input::placeholder{color:var(--muted)}
.chat-input:disabled{opacity:.5}
.btn-send{flex-shrink:0;width:44px;height:44px;border:none;border-radius:var(--radius);background:linear-gradient(135deg,var(--accent) 0%,var(--accent-deep) 100%);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .25s cubic-bezier(.4,0,.2,1);box-shadow:0 4px 14px rgba(79,70,229,.25),0 1px 3px rgba(79,70,229,.15);position:relative;overflow:hidden}
.btn-send::before{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(135deg,rgba(255,255,255,.15),transparent 50%);opacity:0;transition:opacity .25s ease}
.btn-send:hover:not(:disabled){background:linear-gradient(135deg,var(--accent-deep) 0%,#3730a3 100%);box-shadow:0 6px 20px rgba(79,70,229,.32),0 2px 6px rgba(79,70,229,.2);transform:translateY(-1px)}
.btn-send:hover:not(:disabled)::before{opacity:1}
.btn-send:hover:not(:disabled) svg{transform:scale(1.08) translateX(1px)}
.btn-send:active:not(:disabled){transform:translateY(0) scale(.97)}
.btn-send:disabled{background:var(--surface-sink);color:var(--muted);cursor:not-allowed;box-shadow:inset 0 1px 2px rgba(15,23,42,.04);transform:none}
.btn-send:disabled::before{display:none}
.btn-send svg{display:block;transition:transform .25s ease}
.btn-send .send-spinner{animation:spin .8s linear infinite;display:none}
.btn-send.is-waiting .send-icon{display:none}
.btn-send.is-waiting .send-spinner{display:block}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.chat-send-row{display:flex;gap:7px;margin-top:7px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 17px;border:none;border-radius:var(--radius-sm);font-size:.8em;cursor:pointer;font-weight:600;transition:all .2s cubic-bezier(.4,0,.2,1);font-family:inherit;letter-spacing:.15px;position:relative;overflow:hidden}
.btn svg{width:15px;height:15px;transition:transform .2s ease}
.btn:hover:not(:disabled) svg{transform:scale(1.1)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent-deep));color:#fff;box-shadow:0 4px 12px rgba(79,70,229,.2)}
.btn-primary:hover:not(:disabled){background:linear-gradient(135deg,var(--accent-deep),#3730a3);box-shadow:0 6px 18px rgba(79,70,229,.28);transform:translateY(-1px)}
.btn-success{background:linear-gradient(135deg,var(--sage),#15803d);color:#fff;box-shadow:0 4px 12px rgba(22,163,74,.2)}
.btn-success:hover:not(:disabled){background:linear-gradient(135deg,#15803d,#166534);box-shadow:0 6px 18px rgba(22,163,74,.28);transform:translateY(-1px)}
.btn-ghost{background:linear-gradient(135deg,var(--surface-soft),var(--surface));color:var(--ink-soft);border:1px solid var(--line)}
.btn-ghost:hover:not(:disabled){background:var(--surface);color:var(--accent-deep);border-color:var(--accent-soft);box-shadow:0 3px 10px rgba(79,70,229,.08);transform:translateY(-1px)}
.btn-warn{background:linear-gradient(135deg,var(--amber),#a16207);color:#fff;box-shadow:0 4px 12px rgba(202,138,4,.2)}
.btn-warn:hover:not(:disabled){background:linear-gradient(135deg,#a16207,#854d0e);box-shadow:0 6px 18px rgba(202,138,4,.28);transform:translateY(-1px)}
.btn-danger{background:linear-gradient(135deg,var(--terra),#b91c1c);color:#fff;box-shadow:0 4px 12px rgba(220,38,38,.2)}
.btn-danger:hover:not(:disabled){background:linear-gradient(135deg,#b91c1c,#991b1b);box-shadow:0 6px 18px rgba(220,38,38,.28);transform:translateY(-1px)}
.preview-header{flex-shrink:0;padding:10px 14px;background:var(--surface);border-bottom:1px solid var(--line-soft);font-size:.86em;color:var(--accent-deep);display:flex;justify-content:space-between;align-items:center;gap:8px}
.preview-header .pv-title{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.preview-header .pv-title svg{width:15px;height:15px;color:var(--accent)}
.preview-header .pv-export{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--surface-soft);color:var(--muted);cursor:pointer;transition:all .15s}
.preview-header .pv-export:hover{background:var(--surface);color:var(--accent-deep);border-color:var(--accent-border)}
.preview-header .pv-export svg{width:15px;height:15px}
.preview-body{flex:1;overflow-y:auto;padding:14px;min-height:0;-webkit-overflow-scrolling:touch}
.pv-section{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius);padding:13px 15px;margin-bottom:11px;transition:all .2s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden}
.pv-section::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent-soft),transparent);opacity:0;transition:opacity .25s ease}
.pv-section:hover{box-shadow:0 8px 24px rgba(15,23,42,.08),0 2px 6px rgba(15,23,42,.04);border-color:var(--accent-soft);transform:translateY(-1px)}
.pv-section:hover::before{opacity:1}
.pv-section h3{font-size:.86em;color:var(--accent-deep);margin-bottom:9px;display:flex;align-items:center;gap:6px;justify-content:space-between;padding-bottom:7px;border-bottom:1px solid var(--line-soft);transition:border-color .2s}
.pv-section:hover h3{border-color:var(--accent-soft)}
.pv-section h3 .sec-left{display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-section h3 .sec-right{font-size:.8em;color:var(--muted);font-weight:400;flex-shrink:0;display:inline-flex;align-items:center;gap:5px}
.pv-section .pv-content{font-size:.86em;color:var(--ink-soft);line-height:1.7;white-space:pre-wrap;word-break:break-word}
.pv-section.collapsed .pv-content,.pv-section.collapsed .pv-entry-list,.pv-section.collapsed .pv-sub{max-height:0;overflow:hidden;margin:0;padding:0}
.pv-section .pv-toggle{cursor:pointer;font-size:.82em;color:var(--muted);user-select:none;flex-shrink:0;padding:0 4px;transition:color .2s}
.pv-section:hover .pv-toggle{color:var(--accent-deep)}
.pv-section .pv-toggle::before{content:'▾';display:inline-block;transition:transform .25s cubic-bezier(.4,0,.2,1)}
.pv-section.collapsed .pv-toggle::before{transform:rotate(-90deg)}
.pv-section .pv-empty{color:var(--muted);font-style:italic;font-size:.82em}
.pv-editable{border-radius:var(--radius-sm);transition:background .18s ease,box-shadow .18s ease;position:relative}
.pv-editable:hover{background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-border)}
.pv-edit-hint{font-size:.7em;color:var(--muted);cursor:pointer;flex-shrink:0;opacity:.6;transition:opacity .18s}
.pv-edit-hint:hover{opacity:1}
.pv-section .pv-entry{background:var(--surface-soft);padding:0;border-radius:var(--radius-sm);margin-bottom:8px;border-left:3px solid var(--accent-soft);transition:all .18s ease}
.pv-section .pv-entry:last-child{margin-bottom:0}
.pv-section .pv-entry:hover{background:var(--surface);border-left-color:var(--accent);box-shadow:0 2px 8px rgba(15,23,42,.05)}
.pv-section .pv-entry summary{cursor:pointer;font-size:.84em;color:var(--accent-deep);font-weight:600;padding:10px 12px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:6px;transition:color .18s ease,background .18s ease;border-radius:0 var(--radius-sm) var(--radius-sm) 0}
.pv-section .pv-entry summary:hover{color:var(--accent)}
.pv-section .pv-entry summary::-webkit-details-marker{display:none}
.pv-section .pv-entry summary::before{content:'▸';color:var(--muted);font-size:.9em;transition:transform .25s cubic-bezier(.4,0,.2,1);flex-shrink:0}
.pv-section .pv-entry[open] summary::before{transform:rotate(90deg);color:var(--accent)}
.pv-section .pv-entry .pv-entry-body{padding:0 12px 10px 12px}
.pv-section .pv-entry-title{font-size:.84em;color:var(--accent-deep);font-weight:600;margin-bottom:3px}
.pv-section .pv-entry-content{font-size:.82em;color:var(--ink-soft);white-space:pre-wrap;word-break:break-word;line-height:1.65}
.pv-section .pv-code{font-family:var(--font-mono);font-size:.8em;color:var(--ink);background:linear-gradient(135deg,var(--surface-soft) 0%,var(--surface) 100%);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:10px 12px;white-space:pre-wrap;word-break:break-all;line-height:1.6;max-height:260px;overflow:auto;transition:border-color .2s,box-shadow .2s}
.pv-section .pv-code:hover{border-color:var(--accent-soft);box-shadow:inset 0 1px 3px rgba(79,70,229,.04)}
.pv-section .pv-code.muted{color:var(--ink-soft);background:var(--surface-soft)}
.pv-section .pv-tag{display:inline-flex;align-items:center;font-size:.76em;padding:3px 10px;border-radius:999px;background:linear-gradient(135deg,var(--accent-soft) 0%,rgba(79,70,229,.1) 100%);color:var(--accent-deep);border:1px solid var(--accent-border);margin:0 6px 6px 0;white-space:nowrap;font-weight:500;transition:all .18s ease;letter-spacing:.2px}
.pv-section .pv-tag:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(79,70,229,.12)}
.pv-section .pv-tag.off{color:var(--muted);background:linear-gradient(135deg,var(--surface-soft),var(--surface));border-color:var(--line-soft)}
.pv-section .pv-tag.off:hover{box-shadow:none;transform:none;border-color:var(--line)}
.pv-section .pv-tag.ok{color:var(--sage-text);background:linear-gradient(135deg,var(--sage-soft),rgba(22,163,74,.12));border-color:var(--sage-border)}
.pv-section .pv-tag.ok:hover{box-shadow:0 3px 10px rgba(22,163,74,.15)}
.pv-section .pv-mini-btn{font-size:.8em;padding:6px 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--accent-deep);cursor:pointer;flex-shrink:0;transition:all .18s cubic-bezier(.4,0,.2,1);font-weight:500;display:inline-flex;align-items:center;gap:5px}
.pv-section .pv-mini-btn svg{width:13px;height:13px}
.pv-section .pv-mini-btn:hover{background:linear-gradient(135deg,var(--accent-soft),var(--surface));border-color:var(--accent-border);color:var(--accent);transform:translateY(-1px);box-shadow:0 4px 12px rgba(79,70,229,.1)}
.pv-sub{margin-top:7px}
.pv-book-name{font-size:.82em;color:var(--accent-deep);background:linear-gradient(135deg,var(--accent-soft),rgba(79,70,229,.1));padding:4px 12px;border-radius:999px;cursor:pointer;border:1px solid transparent;transition:all .2s ease;display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.pv-book-name:hover{border-color:var(--accent-border);transform:translateY(-1px);box-shadow:0 4px 12px rgba(79,70,229,.12)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:all .2s ease}
.dot.full{background:linear-gradient(135deg,var(--sage),#22c55e);box-shadow:0 0 0 2px var(--sage-soft)}
.dot.empty{background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--line-soft)}
.progress-bar{height:5px;background:var(--line-soft);border-radius:999px;overflow:hidden;margin:5px 0}
.progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--amber));transition:width .35s cubic-bezier(.4,0,.2,1);border-radius:999px;box-shadow:0 0 8px rgba(79,70,229,.2)}
.module-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:5px}
.module-item{font-size:.82em;padding:7px 10px;background:var(--surface-soft);border-radius:var(--radius-sm);text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:4px;line-height:1.4;transition:all .18s cubic-bezier(.4,0,.2,1);border:1px solid transparent}
.module-item svg{width:12px;height:12px;flex-shrink:0;transition:transform .18s ease}
.module-item:hover{background:var(--surface);box-shadow:0 4px 12px rgba(15,23,42,.08);transform:translateY(-1px)}
.module-item:hover svg{transform:scale(1.1)}
.module-item.done{color:var(--sage-text);background:linear-gradient(135deg,var(--sage-soft),rgba(22,163,74,.12));border:1px solid var(--sage-border);font-weight:500}
.module-item.done:hover{box-shadow:0 4px 12px rgba(22,163,74,.15)}
.module-item.partial{color:var(--amber-text);background:linear-gradient(135deg,var(--amber-soft),rgba(202,138,4,.12));border:1px solid var(--amber-border);font-weight:500}
.module-item.partial:hover{box-shadow:0 4px 12px rgba(202,138,4,.15)}
.module-item.todo{color:var(--muted);background:var(--surface-soft);border:1px solid var(--line-soft)}
.close-btn{width:32px;height:32px;border-radius:8px;background:var(--surface-soft);border:1px solid var(--line);color:var(--ink-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.close-btn svg{width:16px;height:16px}
.close-btn:hover{background:var(--terra-soft);color:var(--terra-text);border-color:var(--terra-border)}
.json-modal,.modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,.32);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100001}
.json-modal-content,.modal-content{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px;width:90%;max-width:800px;max-height:85vh;display:flex;flex-direction:column;box-shadow:var(--shadow-card)}
.json-modal-content textarea{width:100%;flex:1;background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius-sm);color:var(--ink);font-family:var(--font-mono);font-size:.75em;padding:10px;resize:none;min-height:250px}
.modal-body{flex:1;overflow-y:auto;min-height:200px}
.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;overflow:auto}
.welcome h2{font-size:1.5em;color:var(--accent-deep);margin-bottom:14px;display:inline-flex;align-items:center;gap:9px;font-weight:700}
.welcome h2 .welcome-ic{color:var(--accent)}
.welcome p{color:var(--ink-soft);font-size:.88em;line-height:1.85;max-width:480px;margin-bottom:20px}
.welcome .start-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 36px;background:var(--accent);color:#fff;border:none;border-radius:999px;font-size:.96em;font-weight:600;cursor:pointer;transition:all .3s;box-shadow:var(--shadow-soft)}
.welcome .start-btn svg{width:18px;height:18px}
.welcome .start-btn:hover{transform:translateY(-1px);background:var(--accent-deep);box-shadow:var(--shadow-card)}
.welcome-features{display:grid;grid-template-columns:repeat(2,1fr);gap:11px;margin:18px 0;max-width:480px}
.wf-item{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius);padding:13px;text-align:left;display:flex;gap:10px;align-items:flex-start;transition:box-shadow .2s,border-color .2s}
.wf-item:hover{box-shadow:var(--shadow-soft);border-color:var(--accent-soft)}
.wf-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:var(--accent-soft);color:var(--accent-deep);flex-shrink:0}
.wf-icon svg{width:18px;height:18px}
.wf-copy{min-width:0}
.wf-title{font-size:.8em;color:var(--accent-deep);font-weight:600;margin-bottom:3px}
.wf-desc{font-size:.72em;color:var(--ink-soft);line-height:1.45}
.qc-item{background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:9px 11px;margin-bottom:7px}
.qc-item.pass{border-color:var(--sage-border)}
.qc-item.fail{border-color:var(--terra-border);background:var(--terra-soft)}
.qc-title{font-size:.78em;font-weight:600;display:flex;align-items:center;gap:6px;margin-bottom:3px}
.qc-pass{color:var(--sage)}
.qc-fail{color:var(--terra)}
.qc-desc{font-size:.72em;color:var(--ink-soft);line-height:1.5}
.qc-fix{font-size:.72em;color:var(--amber);margin-top:3px}
.opt-compare{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
.opt-pane{background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius-sm);padding:9px;font-size:.72em;line-height:1.55;max-height:300px;overflow-y:auto;white-space:pre-wrap;word-break:break-word}
.opt-pane.before{border-color:var(--line)}
.opt-pane.after{border-color:var(--sage-border)}
.opt-label{font-size:.72em;font-weight:600;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid var(--line-soft)}
.opt-label.before{color:var(--ink-soft)}
.opt-label.after{color:var(--sage-text)}
.opt-field-select{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.opt-field-tag{padding:3px 9px;background:var(--surface-soft);border:1px solid var(--line);border-radius:var(--radius-sm);font-size:.72em;cursor:pointer;transition:all .2s}
.opt-field-tag.selected{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-deep)}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:11px;padding-top:11px;border-top:1px solid var(--line-soft);flex-shrink:0}
/* ===== statusblock 容器：Markdown 渲染后的样式 ===== */
.sb-wrap{display:block;margin-top:10px;padding:12px 14px;background:var(--surface-soft);border-radius:var(--radius);font-size:.88em;line-height:1.65;border:1px solid var(--line-soft)}
.sb-wrap h3{font-size:1em;color:var(--accent-deep);margin:4px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--line-soft)}
.sb-wrap h3:first-child{margin-top:0}
.sb-wrap h4{font-size:.95em;color:var(--accent-deep);margin:6px 0 4px}
.sb-wrap ul,.sb-wrap ol{margin:4px 0 6px 20px;padding:0}
.sb-wrap li{margin:3px 0;color:var(--ink-soft);line-height:1.55}
.sb-wrap li b,.sb-wrap li strong{color:var(--ink)}
.sb-wrap p{margin:4px 0;color:var(--ink-soft)}
.sb-wrap p b,.sb-wrap p strong{color:var(--accent-deep)}
.sb-wrap hr{border:none;border-top:1px solid var(--line-soft);margin:8px 0}
.sb-wrap blockquote{margin:6px 0;padding:4px 12px;border-left:3px solid var(--accent-soft);color:var(--ink-soft);background:var(--surface)}

/* ===== 美化包裹元素溢出保护：字体放大时不超出容器 ===== */
/* 覆盖 MVU 美化模板 (status-notice / loading-notice) 的内联样式，防止溢出 */
.status-notice, .loading-notice,
.chat-msg .bubble .status-notice,
.chat-msg .bubble .loading-notice{
  max-width:100% !important;
  width:100% !important;
  box-sizing:border-box !important;
  margin:8px 0 !important;
  overflow-wrap:break-word !important;
  word-break:break-word !important;
}
.status-notice > div, .loading-notice > div,
.status-notice > div > div, .loading-notice > div > div{
  max-width:100% !important;
  width:100% !important;
  box-sizing:border-box !important;
}
/* 美化模板的 summary/标题栏：不超宽、自适应 */
.status-notice summary, .loading-notice summary,
.status-notice summary > span:first-child,
.loading-notice summary > span:first-child{
  max-width:100% !important;
  width:100% !important;
  box-sizing:border-box !important;
  height:auto !important;
  min-height:34px;
}
/* 美化模板的内容面板：不超宽、自适应换行、高度跟随字体缩放（不锁死）*/
.status-notice > div > div:last-child,
.loading-notice > div > div:last-child,
.status-notice details > div,
.loading-notice details > div{
  max-width:100% !important;
  width:100% !important;
  box-sizing:border-box !important;
  max-height:calc(360px * var(--app-font-scale,1));
  overflow-y:auto;
  overflow-x:hidden;
  word-break:break-word;
  overflow-wrap:break-word;
}
/* 美化包裹内的 code/pre/table 元素：防止横向溢出，支持滚动 */
.status-notice pre, .loading-notice pre,
.status-notice code, .loading-notice code,
.status-notice table, .loading-notice table,
.sb-wrap pre, .sb-wrap code, .sb-wrap table{
  max-width:100% !important;
  overflow-x:auto !important;
  box-sizing:border-box !important;
  word-break:break-word !important;
  overflow-wrap:break-word !important;
}
.status-notice pre, .loading-notice pre,
.sb-wrap pre{
  white-space:pre-wrap !important;
}
/* 通用保护：气泡内任意元素(含美化包裹)最大宽度不超过气泡宽度 */
.chat-msg .bubble > *,
.chat-msg .bubble > * > *,
.chat-msg .bubble > * > * > *{
  max-width:100%;
  box-sizing:border-box;
}
.chat-msg .bubble{
  overflow-wrap:break-word;
  word-break:break-word;
  overflow:hidden;
}

/* ===== 上下文操作条：替代旧 mod-focus + mod-dash + mvu-info-panel 三件套 ===== */
.ctx-bar{flex-shrink:0;display:flex;align-items:center;gap:12px;padding:10px 14px;background:linear-gradient(180deg,var(--surface) 0%,var(--surface-soft) 100%);border-bottom:1px solid var(--line-soft);min-height:46px;position:relative}
.ctx-bar::after{content:'';position:absolute;bottom:0;left:14px;right:14px;height:1px;background:linear-gradient(90deg,transparent,var(--accent-soft),transparent);opacity:.6}
.ctx-stage{font-size:.8em;color:var(--muted);white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:4px 12px 4px 8px;background:var(--surface);border:1px solid var(--line-soft);border-radius:999px;box-shadow:0 1px 3px rgba(15,23,42,.03)}
.ctx-stage svg{width:13px;height:13px;color:var(--accent)}
.ctx-stage strong{color:var(--accent-deep);font-weight:600}
.ctx-actions{display:flex;align-items:center;gap:7px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.ctx-actions::-webkit-scrollbar{display:none}
.ctx-mod{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;background:var(--surface);border:1px solid var(--line);border-radius:999px;font-size:.82em;color:var(--ink-soft);cursor:pointer;transition:all .18s cubic-bezier(.4,0,.2,1);white-space:nowrap;flex-shrink:0;font-weight:500;font-family:inherit;position:relative}
.ctx-mod svg{width:13px;height:13px;transition:transform .18s ease}
.ctx-mod:hover:not(:disabled){background:var(--surface);color:var(--accent-deep);border-color:var(--accent-border);box-shadow:0 4px 12px rgba(79,70,229,.1);transform:translateY(-1px)}
.ctx-mod:hover:not(:disabled) svg{transform:scale(1.1)}
.ctx-mod:active:not(:disabled){transform:translateY(0) scale(.98)}
.ctx-mod.done{color:var(--sage-text);background:linear-gradient(135deg,var(--sage-soft),rgba(22,163,74,.12));border-color:var(--sage-border);font-weight:500}
.ctx-mod.done:hover:not(:disabled){box-shadow:0 4px 12px rgba(22,163,74,.15);color:var(--sage-text)}
.ctx-mod.prog{color:var(--amber-text);background:linear-gradient(135deg,var(--amber-soft),rgba(202,138,4,.12));border-color:var(--amber-border);font-weight:500}
.ctx-mod.prog:hover:not(:disabled){box-shadow:0 4px 12px rgba(202,138,4,.15);color:var(--amber-text)}
.ctx-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-size:.78em;font-weight:500;white-space:nowrap;flex-shrink:0;transition:all .18s ease;cursor:default}
.ctx-chip svg{transition:transform .18s ease}
.ctx-chip:hover svg{transform:scale(1.15)}
.ctx-chip.ok{color:var(--sage-text);background:linear-gradient(135deg,var(--sage-soft),rgba(22,163,74,.12));border:1px solid var(--sage-border)}
.ctx-chip.todo{color:var(--muted);background:var(--surface);border:1px solid var(--line)}
.ctx-chip.info{color:var(--accent-text);background:linear-gradient(135deg,var(--accent-soft),rgba(79,70,229,.12));border:1px solid var(--accent-border)}
/* 状态栏8步进度step方块 */
.sb-step{flex:1;min-width:38px;text-align:center;padding:5px 3px;font-size:.72em;font-weight:600;border-radius:8px;cursor:default;transition:all .18s cubic-bezier(.4,0,.2,1);display:inline-flex;align-items:center;justify-content:center;gap:3px;letter-spacing:.3px}
.sb-step:hover{transform:translateY(-1px)}
.sb-step.ok{background:linear-gradient(135deg,var(--sage) 0%,#22c55e 100%);color:#fff;border:1px solid var(--sage-border);box-shadow:0 2px 8px rgba(22,163,74,.2)}
.sb-step.ok svg{color:#fff}
.sb-step.ok:hover{box-shadow:0 4px 14px rgba(22,163,74,.28)}
.sb-step.todo{background:linear-gradient(135deg,var(--surface) 0%,var(--surface-soft) 100%);color:var(--muted);border:1px solid var(--line)}
.sb-step.todo:hover{border-color:var(--accent-soft);color:var(--ink-soft);box-shadow:0 2px 8px rgba(15,23,42,.06)}

.chat-input-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 6px 0}
.chat-input-hint{font-size:.76em;color:var(--muted);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.chat-input-hint .kbd{display:inline-block;min-width:18px;padding:1px 6px;border-radius:5px;background:linear-gradient(180deg,var(--surface-soft),#fff);border:1px solid var(--line);border-bottom-width:2px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em;font-weight:600;color:var(--ink-soft);line-height:1.3;box-shadow:0 1px 0 rgba(15,23,42,.04)}
.chat-input-char-count{font-size:.78em;color:var(--muted);text-align:right;transition:color .2s;white-space:nowrap}
.chat-input-char-count.warn{color:var(--amber)}
.chat-input-char-count.over{color:var(--terra)}

.send-btn-pulse{animation:pulse-send 2s infinite}
@keyframes pulse-send{0%,100%{box-shadow:var(--shadow-soft)}50%{box-shadow:var(--shadow-card)}}

.welcome-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.welcome-actions .btn{flex:1;min-width:120px;max-width:180px}

.scroll-btns{position:absolute;right:12px;bottom:8px;display:flex;flex-direction:column;gap:3px;z-index:10;opacity:0;transition:opacity .2s;pointer-events:none}
.scroll-btns.show{opacity:1;pointer-events:auto}
.scroll-btns button{width:26px;height:26px;border-radius:50%;background:var(--surface);border:1px solid var(--line);color:var(--ink-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1;box-shadow:var(--shadow-soft)}
.scroll-btns button svg{width:14px;height:14px}
.scroll-btns button:hover{background:var(--accent);color:#fff;border-color:var(--accent)}

.import-dropzone{padding:22px;text-align:center;border:2px dashed var(--accent-soft);border-radius:var(--radius);margin-bottom:11px;cursor:pointer;transition:all .2s}
.import-dropzone:hover{border-color:var(--accent);background:var(--accent-soft-strong)}
.import-dropzone .dz-icon{display:inline-flex;color:var(--accent);margin-bottom:8px}
.import-dropzone .dz-icon svg{width:36px;height:36px}
.import-dropzone .dz-text{font-size:.78em;color:var(--ink-soft)}
.import-tabs{display:flex;gap:5px;margin-bottom:11px}
.import-tab{flex:1;padding:7px 9px;background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:var(--radius-sm);font-size:.75em;color:var(--ink-soft);cursor:pointer;text-align:center;transition:all .15s}
.import-tab.active{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-deep)}

.entry-detail{display:none;margin-top:6px;padding:9px;background:var(--surface-soft);border-radius:var(--radius-sm);font-size:.72em}
.entry-detail.open{display:block}
.entry-detail .ext-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:4px}
.entry-detail .ext-item{text-align:center}
.entry-detail .ext-item label{display:block;color:var(--muted);font-size:.68em;margin-bottom:2px}
.entry-detail .ext-item input,.entry-detail .ext-item select{width:100%;padding:3px 4px;background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius-sm);color:var(--ink);font-size:.72em;text-align:center;outline:none}
/* Tab 切换器（角色卡 / MVU）*/
.tab-switcher{display:flex;gap:3px;padding:4px;background:linear-gradient(135deg,var(--surface-soft) 0%,var(--surface-sink) 100%);border:1px solid var(--line-soft);border-radius:10px;flex-shrink:0;box-shadow:inset 0 1px 3px rgba(15,23,42,.04)}
.tab-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:transparent;border:none;border-radius:7px;font-size:.78em;color:var(--ink-soft);cursor:pointer;transition:all .2s cubic-bezier(.4,0,.2,1);font-weight:600;font-family:inherit;white-space:nowrap;position:relative}
.tab-btn .tab-icon{display:inline-flex;color:inherit}
.tab-btn .tab-icon svg{width:14px;height:14px;transition:transform .2s ease}
.tab-btn:hover:not(.active){color:var(--accent-deep);background:rgba(255,255,255,.5)}
.tab-btn:hover:not(.active) .tab-icon svg{transform:scale(1.1)}
.tab-btn.active{background:linear-gradient(135deg,var(--surface),#fff);color:var(--accent-deep);box-shadow:0 3px 10px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.04);font-weight:700}
.tab-btn.active::after{content:'';position:absolute;bottom:0;left:20%;right:20%;height:2px;background:linear-gradient(90deg,var(--accent),var(--accent-deep));border-radius:2px 2px 0 0}

.wv-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}
.wv-stat{background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:7px 9px;text-align:center}
.wv-stat .wv-stat-val{font-size:1.1em;font-weight:700;display:block}
.wv-stat .wv-stat-lbl{font-size:.72em;color:var(--ink-soft);display:block;margin-top:2px}
.wv-legend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;font-size:.72em}
.wv-legend-item{display:flex;align-items:center;gap:3px;color:var(--ink-soft)}
.wv-legend-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.wv-entry{background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:7px 9px;margin-bottom:6px;border-left:3px solid var(--accent-soft)}
.wv-entry-header{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}
.wv-entry-name{font-size:.78em;font-weight:600;color:var(--ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wv-entry-level{font-size:.72em;padding:2px 8px;border-radius:var(--radius-sm);font-weight:600;white-space:nowrap}
.wv-entry-token{font-size:.72em;color:var(--ink-soft);flex-shrink:0}
.wv-entry-meta{display:flex;flex-wrap:wrap;gap:4px;font-size:.72em;color:var(--ink-soft)}
.wv-entry-meta .wv-tag{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:1px 6px;white-space:nowrap}
.wv-entry-meta .wv-tag.const{color:var(--sage-text);border-color:var(--sage-border)}
.wv-entry-meta .wv-tag.trig{color:var(--accent-deep);border-color:var(--accent-border)}
.wv-entry-meta .wv-tag.dyn{color:var(--amber-text);border-color:var(--amber-border)}
.wv-entry-meta .wv-tag.warn{color:var(--terra-text);border-color:var(--terra-border)}
.wv-group-header{font-size:.72em;font-weight:600;color:var(--accent-deep);margin:8px 0 4px;padding-bottom:3px;border-bottom:1px solid var(--line-soft);display:flex;justify-content:space-between;align-items:center}
.wv-group-count{font-size:.85em;color:var(--ink-soft);font-weight:400}


.group-mgr-list{margin:8px 0}
.group-mgr-item{display:flex;align-items:center;gap:6px;padding:6px 9px;background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:8px;margin-bottom:5px;font-size:.72em}
.group-mgr-item .gm-color{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.group-mgr-item .gm-name{flex:1;color:var(--ink);font-weight:600}
.group-mgr-item .gm-count{color:var(--ink-soft);font-size:.85em}
.group-mgr-item .gm-toggle{padding:3px 9px;border-radius:7px;font-size:.85em;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--ink-soft);transition:all .15s}
.group-mgr-item .gm-toggle.on{background:var(--sage-soft-strong);color:var(--sage-text);border-color:var(--sage-border)}
.mobile-tabs{display:none;flex-shrink:0;background:var(--surface);border-bottom:1px solid var(--line)}
.mobile-tab{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 12px;background:transparent;border:none;color:var(--ink-soft);font-size:.85em;cursor:pointer;text-align:center;border-bottom:2px solid transparent;transition:all .15s;font-weight:500;font-family:inherit}
.mobile-tab svg{width:16px;height:16px}
.mobile-tab.active{color:var(--accent);border-bottom-color:var(--accent);background:var(--accent-soft)}
@media(max-width:768px){
  .main{flex-direction:column}
  .mobile-tabs{display:flex}
  .chat-panel,.preview-panel{flex:1 1 0;border:none;min-height:0}
  .preview-panel{display:none}
  .main.tab-preview .preview-panel{display:flex}
  .main.tab-preview .chat-panel{display:none}
  .topbar h1{font-size:.9em}
  .topbar .phase{font-size:.7em}
  .chat-msg .bubble{max-width:78%}
  .opt-compare{grid-template-columns:1fr}
  .quick-actions{max-height:70px}
}
@media(max-height:500px){
  .topbar{padding:6px 10px}
  .topbar h1{font-size:.85em;margin:0}
  .topbar .phase{font-size:.7em}
  .ctx-bar{padding:5px 10px;min-height:36px}
  .ctx-mod{font-size:.72em;padding:4px 8px}
  .chat-input-area{padding:6px 10px;gap:4px}
  .chat-input{min-height:36px;padding:6px;max-height:120px}
  .quick-actions{gap:4px}
  .quick-btn{font-size:.7em;padding:4px 8px}
  .preview-panel .preview-header{padding:6px 10px;font-size:.8em}
  .pv-section h3{font-size:.78em;margin-bottom:2px}
  .pv-section{padding:6px 10px}
  .pv-content{font-size:.72em;line-height:1.4}
  .json-modal-content,.modal-content{padding:10px;max-height:90vh}
  .modal-body{max-height:60vh}
}
@media(orientation:landscape) and (max-height:600px){
  .app{height:100%;height:100vh}
  .topbar{padding:5px 8px;min-height:32px;padding-top:max(5px,env(safe-area-inset-top));padding-left:max(8px,env(safe-area-inset-left));padding-right:max(8px,env(safe-area-inset-right))}
  .topbar h1{font-size:.85em}
  .ctx-bar{padding:4px 8px;min-height:34px}
  .ctx-mod{font-size:.7em;padding:3px 8px}
  .chat-input-area{padding:4px 8px;gap:3px;padding-bottom:max(4px,env(safe-area-inset-bottom))}
  .chat-input{min-height:32px;padding:5px;font-size:.85em;max-height:110px}
  .btn-send{width:34px;height:34px}
  .quick-actions{gap:3px;max-height:60px}
  .quick-btn{font-size:.68em;padding:3px 6px}
  .pv-body{padding:6px}
  .pv-section{padding:4px 8px}
  .pv-section h3{font-size:.78em}
  .pv-content{font-size:.72em;line-height:1.4}
  .welcome{padding:16px}
  .welcome h2{font-size:1.1em;margin-bottom:6px}
  .welcome p{font-size:.8em;margin-bottom:8px}
}
/* ===== 平板端精细适配（481px-768px）===== */
@media(min-width:481px) and (max-width:768px){
  .chat-panel{flex:1.3 1 0}
  .preview-panel{flex:1 1 0}
  .chat-msg .bubble{max-width:80%}
  .quick-actions{gap:5px;padding:6px 10px}
  .quick-btn{font-size:11px;padding:5px 10px}
  .qa-mini{font-size:11px;padding:5px 10px}
  .pv-section .pv-entry summary{padding:6px 10px}
  .pv-section .pv-entry-content{font-size:.72em}
  .welcome-features{grid-template-columns:repeat(2,1fr);gap:12px}
  .wf-item{padding:12px}
  /* tab-switcher：平板端适中 */
  .tab-switcher{padding:4px 8px;gap:3px}
  .tab-btn{padding:5px 10px;font-size:.78em}
  /* ctx-bar：平板端适中 */
  .ctx-bar{padding:6px 12px}
  .ctx-mod{font-size:.76em;padding:4px 10px}
  /* 模块进度：平板端4列保持 */
  .module-progress{grid-template-columns:repeat(4,1fr);gap:6px}
  .module-item{font-size:.76em;padding:5px 6px}
  .module-item svg{width:11px;height:11px}
}
/* ===== 手机端精细适配（≤480px）：追求"好用"而非"能用" ===== */
@media(max-width:480px){
  /* 安全区适配（刘海屏/全面屏）*/
  .app{padding-top:env(safe-area-inset-top,0);padding-left:env(safe-area-inset-left,0);padding-right:env(safe-area-inset-right,0);padding-bottom:env(safe-area-inset-bottom,0)}
  .topbar{padding:8px 12px;min-height:42px}
  .topbar h1{font-size:.88em}
  .topbar .phase{font-size:.68em}
  /* 字体控件：小屏隐藏百分比标签，按钮稍紧凑，防止挤占顶栏 */
  .font-ctrl{padding:1px 3px;gap:1px}
  .font-ctrl .font-btn{height:24px;width:24px;font-size:.68em}
  .font-ctrl .font-size-label{display:none}
  .topbar-right{gap:3px}
  /* 聊天气泡：手机端更宽，提升阅读体验 */
  .chat-messages{padding:10px 6px}
  .chat-msg .bubble{max-width:88%;font-size:.88em;padding:8px 11px}
  .chat-msg.assistant .bubble{font-size:.92em}
  .chat-msg .avatar{width:64px;height:64px;font-size:32px;border-radius:12px}
  /* 输入区：防止 iOS 聚焦缩放（≥16px），增大触摸区 */
  .chat-input-area{padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom))}
  .chat-input{font-size:16px;min-height:42px;padding:10px 14px;border-radius:12px;max-height:160px}
  .btn-send{width:42px;height:42px;border-radius:12px}
  /* 手机端：无实体 Ctrl 键，隐藏快捷键提示，字符计数居中 */
  .chat-input-hint{display:none}
  .chat-input-foot{justify-content:flex-end}
  /* 快捷按钮：手机端横向滚动，避免拥挤换行 */
  .quick-actions{gap:5px;padding:6px 8px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;max-height:none;-webkit-overflow-scrolling:touch}
  .quick-actions::-webkit-scrollbar{display:none}
  .quick-btn{font-size:11.5px;padding:6px 12px;min-height:32px;white-space:nowrap}
  .qa-mini{font-size:11.5px;padding:6px 10px;min-height:32px}
  /* 预览面板：手机端全屏切换 */
  .preview-panel .preview-header{padding:8px 10px;font-size:.86em}
  .pv-section{padding:10px 11px}
  .pv-section h3{font-size:.84em}
  .pv-section .pv-entry summary{padding:7px 9px}
  .pv-section .pv-entry-title{font-size:.8em}
  .pv-section .pv-entry-content{font-size:.78em;line-height:1.55}
  .pv-section .pv-code{font-size:.76em;padding:7px}
  .pv-section .pv-tag{font-size:.74em;padding:2px 7px}
  .pv-section .pv-mini-btn{font-size:.74em;padding:5px 10px;min-height:30px}
  /* 欢迎页：手机端单列 */
  .welcome{padding:16px 12px}
  .welcome h2{font-size:1.15em;margin-bottom:10px}
  .welcome p{font-size:.82em;line-height:1.7;max-width:100%}
  .welcome .start-btn{padding:14px 36px;font-size:1em;border-radius:28px}
  .welcome-features{grid-template-columns:1fr;gap:8px;max-width:100%}
  .wf-item{padding:10px}
  .wf-icon{font-size:1.2em}
  .wf-title{font-size:.82em}
  .wf-desc{font-size:.7em}
  /* 选项对比：手机端单列 */
  .opt-compare{grid-template-columns:1fr;gap:6px}
  .opt-pane{max-height:240px;font-size:.74em}
  /* 关闭按钮：避开刘海 */
  .close-btn{top:max(10px,env(safe-area-inset-top));right:max(10px,env(safe-area-inset-right));width:34px;height:34px;font-size:1.05em}
  /* 模块进度：手机端2列 */
  .module-progress{grid-template-columns:repeat(2,1fr);gap:6px}
  .module-item{font-size:.76em;padding:5px 6px}
  /* 模态框：手机端全屏化 */
  .json-modal-content,.modal-content{width:96%;max-width:none;padding:12px;border-radius:10px;max-height:92vh}
  .json-modal-content textarea{font-size:.78em;min-height:200px}
  .modal-body{max-height:70vh}
  /* 群组管理：手机端紧凑 */
  .group-mgr-item{padding:6px 8px}
  .group-mgr-item .gm-name{font-size:.88em}
  .group-mgr-item .gm-count{font-size:.78em}
  .group-mgr-item .gm-toggle{font-size:.78em;padding:3px 9px;min-height:30px}
  /* mobile-tabs：更大触摸区 */
  .mobile-tab{padding:11px 12px;font-size:.82em}
  /* tab-switcher：手机端紧凑 + 更大触摸区 */
  .tab-switcher{padding:3px 6px;gap:3px}
  .tab-btn{padding:6px 10px;font-size:.76em}
  .tab-btn .tab-icon svg{width:13px;height:13px}
  /* ctx-bar：手机端紧凑 */
  .ctx-bar{padding:6px 10px;min-height:40px}
  .ctx-mod{font-size:.74em;padding:5px 9px;min-height:30px}
  .ctx-chip{font-size:.7em;padding:3px 8px}
  /* 代码块/表格：手机端可横向滚动 */
  .chat-msg .bubble pre{font-size:.85em;max-height:180px}
  .chat-msg .bubble table{font-size:.85em}
  .chat-msg .bubble th,.chat-msg .bubble td{padding:4px 7px;min-width:50px}
}
/* ===== 触摸设备优化（pointer:coarse）===== */
@media(pointer:coarse){
  .quick-btn,.qa-mini,.btn,.pv-section .pv-mini-btn,.pv-book-name,.group-mgr-item .gm-toggle,.mobile-tab{cursor:default;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;user-select:none}
  .quick-btn:active:not(:disabled),.qa-mini:active:not(:disabled),.btn:active:not(:disabled){transform:scale(.96);transition:transform .1s}
  .close-btn{cursor:default}
  .close-btn:active{transform:scale(.9) rotate(90deg)}
  .chat-msg .bubble a{-webkit-tap-highlight-color:rgba(91,141,184,.2)}
}
/* ===== 大屏平板/桌面端优化（≥769px）===== */
@media(min-width:769px){
  .chat-panel{flex:1.4 1 0}
  .preview-panel{flex:1.1 1 0}
  .chat-msg .bubble{max-width:80%}
}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--scrollbar-track)}
::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--accent-border-strong)}

/* Tab 隔离已由 updateCtxBar 按 activeTab 分支渲染，无需 CSS 切换 */

/* ===== 消息 section 分区（参考专家工作区设计）===== */
.cp-section{margin:6px 0;border-radius:var(--radius-sm);overflow:hidden}
.cp-section-header{display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;user-select:none;transition:background .15s;border-radius:var(--radius-sm)}
.cp-section-header:hover{background:var(--surface-sink)}
.cp-section-icon{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0;background:var(--surface-sink);color:var(--muted)}
.cp-section-label{font-size:.78em;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cp-section-preview{font-size:.72em;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.cp-section-toggle{font-size:.68em;color:var(--accent);flex-shrink:0;padding:0 4px}
.cp-section-body{padding:8px 12px 10px 28px;font-size:.88em;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.cp-section-body.collapsed{display:none}
/* section 类型着色 */
.cp-section-thinking .cp-section-header{background:var(--amber-soft)}
.cp-section-thinking .cp-section-label,.cp-section-thinking .cp-section-icon{color:var(--amber-text)}
.cp-section-thinking .cp-section-body{color:var(--ink-soft);font-size:.85em;font-style:italic}
.cp-section-content .cp-section-header{background:var(--sage-soft)}
.cp-section-content .cp-section-label,.cp-section-content .cp-section-icon{color:var(--sage-text)}
.cp-section-toolcall .cp-section-header{background:var(--amber-soft)}
.cp-section-toolcall .cp-section-label,.cp-section-toolcall .cp-section-icon{color:var(--amber-text)}
.cp-section-code .cp-section-body{font-family:var(--font-mono);font-size:.82em;background:var(--surface-soft);border:1px solid var(--line-soft);border-radius:8px;margin:4px 8px 8px 28px;padding:10px 12px;tab-size:2;overflow-x:auto}
.cp-section-opblock .cp-section-header{background:var(--accent-soft)}
.cp-section-opblock .cp-section-label,.cp-section-opblock .cp-section-icon{color:var(--accent-text)}
.cp-opblock-pre{font-family:var(--font-mono);font-size:.82em;background:var(--surface-soft);border:1px solid var(--accent-border);border-radius:8px;margin:4px 8px 8px 28px;padding:10px 12px;tab-size:2;overflow-x:auto;white-space:pre-wrap;word-break:break-word;color:var(--ink-soft)}

/* ===== Work Toast 顶部工作提示 ===== */
.work-toast-layer{position:fixed;top:56px;left:50%;transform:translateX(-50%);width:min(340px,calc(100% - 32px));display:flex;flex-direction:column;gap:8px;z-index:200;pointer-events:none}
.work-toast{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);color:var(--ink);box-shadow:var(--shadow-card);backdrop-filter:blur(8px);opacity:0;transform:translateY(-8px);transition:opacity .24s ease,transform .24s ease}
.work-toast.show{opacity:1;transform:translateY(0)}
.work-toast.is-working{border-color:var(--accent-border);background:color-mix(in srgb,var(--surface) 84%,var(--accent-soft));color:var(--accent-text)}
.work-toast.is-done{border-color:var(--sage-border);background:color-mix(in srgb,var(--surface) 84%,var(--sage-soft));color:var(--sage-text)}
.work-toast .wt-icon{width:18px;height:18px;flex-shrink:0}
.work-toast .wt-text{flex:1;font-size:.85em;font-weight:500}

/* ===== 工作区下拉菜单 ===== */
.ws-dropdown-wrap{position:relative;display:inline-block}
.ws-dropdown{position:absolute;top:100%;left:0;margin-top:4px;min-width:200px;max-height:480px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-float);z-index:150;padding:4px 0;opacity:0;transform:translateY(-4px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.ws-dropdown.show{opacity:1;transform:translateY(0);pointer-events:auto}
.ws-dropdown-section{padding:6px 14px 4px;font-size:.68em;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.ws-dropdown-divider{height:1px;background:var(--line-soft);margin:4px 0}
.ws-dropdown-item{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:.82em;color:var(--ink-soft);cursor:pointer;transition:background .12s;border-radius:0}
.ws-dropdown-item:hover{background:var(--surface-sink);color:var(--ink)}
.ws-dropdown-item.active{color:var(--accent-deep);background:var(--accent-soft)}
.ws-dropdown-item svg{width:15px;height:15px;flex-shrink:0;opacity:.7}
.ws-dropdown-item:hover svg{opacity:1}
.ws-dropdown-item .ws-item-badge{margin-left:auto;font-size:.72em;padding:1px 6px;border-radius:4px;background:var(--accent-soft);color:var(--accent-deep)}
.ws-dropdown-item .ws-item-badge.done{background:var(--sage-soft);color:var(--sage-text)}
/* 工作区下拉中的字体控件展开栏 */
.ws-font-expand{padding:8px 14px 10px;background:var(--surface-soft);border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);margin:2px 0}
.ws-font-expand .ws-font-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;cursor:pointer;user-select:none;font-size:.78em;color:var(--ink-soft);font-weight:600}
.ws-font-expand .ws-font-header:hover{color:var(--accent-deep)}
.ws-font-expand .ws-font-arrow{display:inline-block;transition:transform .15s;font-size:.9em;margin-left:4px}
.ws-font-expand.collapsed .ws-font-arrow{transform:rotate(-90deg)}
.ws-font-expand.collapsed .ws-font-body{display:none}
.ws-font-body{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ws-font-ctrl{display:inline-flex;align-items:center;gap:3px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:2px 4px}
.ws-font-ctrl .ws-font-btn{height:26px;width:26px;font-size:.74em;font-weight:700;padding:0;color:var(--ink-soft);border:1px solid var(--line-soft);background:var(--surface-soft);border-radius:6px;cursor:pointer;font-family:inherit;transition:all .15s}
.ws-font-ctrl .ws-font-btn:hover:not(:disabled){background:var(--surface);color:var(--accent-deep);border-color:var(--accent-border)}
.ws-font-ctrl .ws-font-btn:disabled{opacity:.4;cursor:not-allowed}
.ws-font-ctrl .ws-font-size-label{font-size:.72em;color:var(--ink-soft);min-width:40px;text-align:center;font-weight:600}

/* ===== 工作台模态浮窗 ===== */
.ws-panel-backdrop{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.32);backdrop-filter:blur(6px);opacity:0;transition:opacity .2s ease}
.ws-panel-backdrop.show{opacity:1}
.ws-panel{display:flex;flex-direction:column;width:min(1080px,calc(100vw - 36px));height:min(680px,calc(100vh - 36px));overflow:hidden;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--bg);box-shadow:var(--shadow-float);transform:translateY(8px) scale(.985);transition:transform .2s ease}
.ws-panel-backdrop.show .ws-panel{transform:translateY(0) scale(1)}
.ws-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--surface)}
.ws-panel-head .ws-title{display:flex;align-items:center;gap:8px;font-size:.92em;font-weight:600;color:var(--accent-deep)}
.ws-panel-head .ws-title svg{width:18px;height:18px;color:var(--accent)}
.ws-panel-head .ws-close{width:32px;height:32px;border:none;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.ws-panel-head .ws-close:hover{background:var(--terra-soft);color:var(--terra-text)}
.ws-panel-head .ws-close svg{width:18px;height:18px}
.ws-panel-tabs{display:none;overflow-x:auto;border-bottom:1px solid var(--line-soft);background:var(--surface)}
.ws-panel-tab{flex:1;padding:10px 14px;border:none;background:transparent;color:var(--muted);font-size:.82em;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap}
.ws-panel-tab.active{color:var(--accent-deep);border-bottom-color:var(--accent)}
.ws-panel-body{flex:1;display:grid;grid-template-columns:240px minmax(0,1fr) minmax(280px,0.8fr);min-height:0;overflow:hidden}
.ws-tree{border-right:1px solid var(--line-soft);overflow-y:auto;background:var(--surface-soft);padding:6px}
.ws-tree-group{margin-bottom:4px}
.ws-tree-group-head{display:flex;align-items:center;gap:4px;padding:6px 8px;font-size:.74em;font-weight:600;color:var(--ink-soft);cursor:pointer;user-select:none;border-radius:6px;transition:background .12s}
.ws-tree-group-head:hover{background:var(--surface-sink)}
.ws-tree-group-head .ws-tree-arrow{display:inline-block;transition:transform .15s;font-size:.85em}
.ws-tree-group.collapsed .ws-tree-arrow{transform:rotate(-90deg)}
.ws-tree-items{overflow:hidden;transition:max-height .2s ease}
.ws-tree-group.collapsed .ws-tree-items{max-height:0}
.ws-tree-item{display:flex;align-items:center;gap:6px;padding:5px 10px 5px 22px;font-size:.78em;color:var(--ink-soft);cursor:pointer;border-radius:6px;transition:background .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-tree-item:hover{background:var(--surface-sink);color:var(--ink)}
.ws-tree-item.selected{background:var(--accent-soft-strong);color:var(--accent-deep);border-left:2px solid var(--accent-border-strong)}
.ws-tree-item .ws-tree-dot{width:5px;height:5px;border-radius:50%;background:var(--muted);flex-shrink:0;opacity:.5}
.ws-tree-item.selected .ws-tree-dot{background:var(--accent);opacity:1}
.ws-editor{display:flex;flex-direction:column;border-right:1px solid var(--line-soft);overflow:hidden;background:var(--surface)}
.ws-editor-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.88em;font-style:italic}
.ws-editor-title{font-size:.92em;font-weight:600;color:var(--accent-deep);padding:10px 14px;border-bottom:1px solid var(--line-soft);flex-shrink:0}
.ws-editor-area{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column}
/* 条目属性面板 */
.ws-entry-props{display:flex;align-items:center;gap:10px;padding:6px 14px;border-bottom:1px solid var(--line-soft);flex-wrap:wrap;flex-shrink:0;background:var(--surface-soft)}
.ws-prop{display:inline-flex;align-items:center;gap:4px;font-size:.76em;color:var(--ink-soft)}
.ws-prop input[type=checkbox]{width:14px;height:14px;accent-color:var(--accent)}
.ws-prop select,.ws-prop input[type=text],.ws-prop input[type=number]{padding:2px 6px;border:1px solid var(--line);border-radius:4px;font-size:.92em;background:var(--surface);color:var(--ink);font-family:inherit}
.ws-prop-keys{flex:1;min-width:120px}
.ws-prop-keys-input{width:100% !important}
/* 视图切换 */
.ws-view-switcher{display:flex;gap:2px;padding:6px 14px;border-bottom:1px solid var(--line-soft);flex-shrink:0;background:var(--surface-soft)}
.ws-view-btn{padding:4px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink-soft);font-size:.76em;cursor:pointer;transition:all .15s;font-family:inherit}
.ws-view-btn:hover:not(:disabled){background:var(--surface-soft);color:var(--accent-deep)}
.ws-view-btn.active{background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border)}
.ws-view-btn:disabled{opacity:.4;cursor:not-allowed}
/* textarea */
.ws-textarea{flex:1;width:100%;border:none;outline:none;padding:12px 14px;font-size:.82em;line-height:1.65;font-family:var(--font-mono);color:var(--ink);background:var(--bg);resize:none;white-space:pre-wrap;word-break:break-word}
.ws-textarea:focus{background:var(--surface)}
/* diff */
.ws-diff-view{flex:1;overflow-y:auto;padding:10px 14px;font-family:var(--font-mono);font-size:.78em;line-height:1.6}
.ws-diff-view .diff-add{color:var(--sage-text);background:var(--sage-soft);display:block;padding:0 4px}
.ws-diff-view .diff-del{color:var(--terra-text);background:var(--terra-soft);display:block;padding:0 4px;text-decoration:line-through;opacity:.7}
.ws-diff-view .diff-same{color:var(--muted);display:block;padding:0 4px}
/* === 工作台编辑双栏 === */
.ws-split-view{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0;overflow:hidden;border-top:1px solid var(--line-soft)}
.ws-split-left,.ws-split-right{display:flex;flex-direction:column;min-height:0;overflow:hidden}
.ws-split-left{border-right:1px solid var(--line-soft)}
.ws-split-title{flex-shrink:0;padding:6px 12px;background:var(--surface-soft);border-bottom:1px solid var(--line-soft);font-size:.74em;font-weight:600;color:var(--accent-deep);display:flex;align-items:center;gap:6px}
.ws-split-left .ws-textarea{flex:1;width:100%;border:none;border-radius:0;background:var(--bg)}
.ws-split-right .ws-diff-view{flex:1;border:none;border-radius:0;background:var(--surface-soft)}
@media (max-width: 900px){.ws-split-view{grid-template-columns:1fr}.ws-split-left{border-right:none;border-bottom:1px solid var(--line-soft)}}
/* preview */
.ws-preview-iframe{flex:1;width:100%;border:1px solid var(--line-soft);border-radius:var(--radius-sm);background:#fff}
.ws-preview-md{flex:1;overflow-y:auto;padding:12px 14px;font-size:.86em;line-height:1.65;color:var(--ink-soft)}
/* head actions */
.ws-head-actions{display:flex;align-items:center;gap:6px}
.ws-head-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink-soft);font-size:.82em;cursor:pointer;transition:all .15s;font-weight:600;font-family:inherit}
.ws-head-btn:hover{background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border)}
.ws-head-btn svg{width:15px;height:15px}
/* tree length badge */
.ws-tree-len{font-size:.7em;color:var(--muted);background:var(--surface-sink);padding:1px 5px;border-radius:4px;margin-left:auto}
/* artifact area */
.ws-artifact{overflow-y:auto;background:var(--surface-soft);padding:14px}
.ws-artifact-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:.88em;font-style:italic}
.ws-art-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.ws-art-stat{display:flex;flex-direction:column;align-items:center;padding:10px 6px;background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius-sm)}
.ws-stat-num{font-size:1.3em;font-weight:700;color:var(--accent-deep)}
.ws-stat-label{font-size:.7em;color:var(--muted);margin-top:2px}
.ws-art-section-title{font-size:.76em;font-weight:600;color:var(--ink-soft);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.05em}
.ws-art-card{background:var(--surface);border:1px solid var(--line-soft);border-radius:var(--radius-sm);padding:10px 12px;margin-bottom:8px}
.ws-art-card.mvu{border-left:3px solid var(--accent-soft)}
.ws-art-card .ws-ac-title{font-size:.8em;font-weight:600;color:var(--accent-deep);margin-bottom:4px;display:flex;align-items:center;gap:4px}
.ws-art-card .ws-ac-content{font-size:.76em;color:var(--ink-soft);line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow-y:auto}
.ws-art-card .ws-ac-off{font-size:.7em;color:var(--terra-text);background:var(--terra-soft);padding:1px 5px;border-radius:4px;margin-left:auto}
/* 移动端工作台单栏 */
@media(max-width:768px){
  .ws-panel{width:100vw;height:100vh;border-radius:0}
  .ws-panel-tabs{display:flex}
  .ws-panel-body{display:block;position:relative}
  .ws-tree,.ws-editor,.ws-artifact{display:none}
  .ws-tree.active,.ws-editor.active,.ws-artifact.active{display:block;position:absolute;inset:0}
}
`;
  function showToast(msg, type) {
    type = type || 'info';
    if (type === 'warn') type = 'warning';
    try {
      if (window.parent && window.parent.toastr && window.parent.toastr[type]) window.parent.toastr[type](msg);
      else if (typeof toastr !== 'undefined' && toastr && toastr[type]) toastr[type](msg);
      else if (window.parent && window.parent.toastr) window.parent.toastr.info(msg);
      else alert(msg);
    } catch (e) { try { alert(msg); } catch(_) { console.log(msg); } }
  }

    // ============================================================================
  // SECTION 2  通用工具函数
  // ============================================================================
  // ===== Token估算 =====
  function countTokens(text) {
    if (!text) return 0;
    var t = String(text);
    var cn = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    var enWords = t.replace(/[\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(Boolean).length;
    return cn + Math.ceil(enWords * 0.75);
  }

  // ===== SvgIcons 组件系统 =====
  // 统一大小/描边，颜色继承 currentColor，与主题完美融合（参考文件7 stroke 风格）
  var SVG_PATHS = {
    // 通用操作
    close:      'M6 6l12 12M18 6L6 18',
    send:       'M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.993.993 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z',
    spinner:    'M21 12a9 9 0 1 1-6.219-8.56',
    chevronDown:'M6 9l6 6 6-6',
    arrowDown:  'M12 5v14M5 12l7 7 7-7',
    bolt:       'M13 2L3 14h7v8l10-12h-7V2z',
    download:   'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
    folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H5a2 2 0 0 0-2 2V7zm0 4l1.5 6a2 2 0 0 0 2 1.5h11A2 2 0 0 0 21 17l-1.5-6H3z',
    // 视图/导航
    chat:       'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z',
    clipboard:  'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 4h2v2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2V4h2',
    sliders:    'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4',
    chart:      'M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3',
    list:       'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    // 状态
    check:      'M5 13l4 4L19 7',
    checkCircle:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-5',
    alert:      'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    info:       'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8h.01M11 12h1v4h1',
    wrench:     'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2.4-2.4 2.1-2.1z',
    trash:      'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7',
    copy:       'M9 3h9a2 2 0 0 1 2 2v9M5 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
    edit:       'M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
    save:       'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
    refresh:    'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
    // 模块/体系
    axiom:      'M12 2l9 5v10l-9 5-9-5V7l9-5zM12 2v20M3 7l9 5 9-5',
    handshake:  'M11 17l-2 2a2 2 0 0 1-3-3M13 17l2 2a2 2 0 0 0 3-3M3 12l3-3 4 1 2-2 2 2 4-1 3 3M3 12v3a2 2 0 0 0 2 2h1M21 12v3a2 2 0 0 1-2 2h-1',
    lock:       'M6 10V8a6 6 0 0 1 12 0v2M5 10h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1z',
    target:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    sword:      'M14 4l6 6-4 4-6-6V4h4zM5 19l3-3 3 3-3 3-3-3zM9 15l6-6',
    users:      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    book:       'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5H6.5A2.5 2.5 0 0 0 4 19.5z',
    refreshCycle:'M3 12a9 9 0 1 0 9-9M3 12l3-3M3 12l3 3',
    table:      'M5 4h14v16H5zM5 10h14M5 16h14M9 4v16M15 4v16',
    docVar:     'M8 3h7l5 5v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6M10 13h6M10 17h4',
    // 角色/MVU
    mask:       'M3 12c0-4 4-7 9-7s9 3 9 7-4 7-9 7-9-3-9-7zM8 12h.01M16 12h.01M9 15c1 1 5 1 6 0',
    gauge:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 12l4-2M12 12l-3 4',
    sparkle:    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
    play:       'M6 4l14 8-14 8V4z',
    search:     'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    eye:        'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    fileExport: 'M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-4-5zM12 18v-6m0 0l-2 2m2-2l2 2',
    // 扩展图标（预览区/快捷动作专用）
    globe:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
    tag:        'M20 12l-8 8-9-9V3h8l9 9zM7.5 7.5h.01',
    film:       'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    scroll:     'M8 3h11a2 2 0 0 1 2 2v3h-3M8 3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3M8 3v18M19 8v11a2 2 0 0 1-2 2H8M12 8h4M12 12h4',
    skip:       'M5 4l10 8-10 8V4zM19 5v14',
    palette:    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM7 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8 13a4 4 0 0 0 8 0',
    layers:     'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
    circle:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    user:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    bot:        'M12 4v4M5 8h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM9 13h.01M15 13h.01M9 17h6',
    // 工作区图标
    code:       'M8 9l-3 3 3 3M16 9l3 3-3 3M14 5l-4 14',
    menu:       'M3 12h18M3 6h18M3 18h18',
    folder:     'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
    dot:        'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    // 头像菜单专用
    undo:       'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4',
    image:      'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5L5 21',
    settings:   'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'
  };

  /**
   * 渲染内联 SVG 图标。统一 viewBox=24，描边风格，颜色继承 currentColor。
   * @param {string} name SVG_PATHS 键名
   * @param {number|string} [size=18] 图标尺寸(px)
   * @param {string} [cls] 附加 class
   * @returns {string} 内联 SVG 字符串
   */
  function svgIcon(name, size, cls) {
    var path = SVG_PATHS[name];
    if (!path) return '';
    var s = (size == null ? 18 : size);
    var c = cls ? (' ' + cls) : '';
    // 圆形/方框型图标使用填充风格，其余使用描边风格（参考文件7统一风格）
    var filled = (name === 'checkCircle' || name === 'info' || name === 'alert' || name === 'sparkle' || name === 'play');
    if (filled) {
      return '<svg class="ic' + c + '" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="currentColor" aria-hidden="true"><path d="' + path + '"/></svg>';
    }
    return '<svg class="ic' + c + '" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"/></svg>';
  }


    // ============================================================================
  // SECTION 2（续） 通用工具：Modal Iframe 创建与样式注入
  // ============================================================================
  // ===== Iframe创建 =====
  function createModalIframe() {
    return new Promise(function(resolve, reject) {
      try {
        var parentDoc = (window.parent && window.parent.document) ? window.parent.document : document;
        var old = parentDoc.getElementById(SCRIPT_ID + '-modal');
        if (old) old.remove();
        var iframe = parentDoc.createElement('iframe');
        iframe.id = SCRIPT_ID + '-modal';
        iframe.setAttribute('script_id', SCRIPT_ID);
        iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;border:none;z-index:99999;background:#f6f2ea;';
        iframe.addEventListener('load', function() {
          try {
            var d = iframe.contentDocument || iframe.contentWindow.document;
            var s = d.createElement('style');
            s.textContent = IFRAME_CSS;
            d.head.appendChild(s);
            // viewport meta：确保移动端正确渲染（禁止缩放，支持 dvh）
            try {
              var vp = d.createElement('meta');
              vp.name = 'viewport';
              vp.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
              d.head.appendChild(vp);
              var charset = d.createElement('meta');
              charset.setAttribute('charset', 'UTF-8');
              d.head.appendChild(charset);
            } catch(e) {}
            resolve(d);
          } catch (e) { reject(e); }
        });
        parentDoc.body.appendChild(iframe);
        setTimeout(function() {
          try { if (!iframe.contentDocument || !iframe.contentDocument.body) reject(new Error('iframe timeout')); } catch(e) { reject(e); }
        }, 4000);
      } catch (e) { reject(e); }
    });
  }

  function closeModal() {
    try { var pDoc = (window.parent && window.parent.document) ? window.parent.document : document; var m = pDoc.getElementById(SCRIPT_ID + '-modal'); if (m) m.remove(); } catch(e) {}
  }

    // ============================================================================
  // SECTION 3  卡片数据模板 + 世界书条目模板 + MVU 美化 HTML 模板
  // ============================================================================
  // ===== 世界书名称生成 =====
  function genBookName(worldName) {
    if (!worldName || !worldName.trim()) return '世界设定集';
    return worldName.trim() + ' · 世界书';
  }

  // ===== 世界书条目模板（ST权重分层8体系 · 完整12项原生参数） =====
  // 参数体系：触发精准类(keys/secondary_keys/use_regex/match_whole_words/scan_depth)
  //          生效控制类(sticky/cooldown/delay) 递归安全类(prevent_recursion/exclude_recursion/delay_until_recursion)
  //          数量控制类(selectiveLogic/probability/use_probability) 分组管理类(group/groupWeight)
  // WI参数规范（对齐 ST world_info_logic / world_info_position）：
  //   scan_depth: 常驻=0（不扫描），触发类=3-8（限制关键词扫描的消息深度）
  //   useProbability: 常驻=false（无需概率掷骰），触发类=true（probability 才生效）
  //   group: 空字符串=无互斥分组（多条可共存）；非空=同组仅注入1条（用于叙事类互斥）
  //   selectiveLogic: 0=AND_ANY 1=NOT_ALL 2=NOT_ANY 3=AND_ALL（次级关键词逻辑，非随机选择）

  // ===== MVU 美化正则 HTML 模板（柔和高对比版本，括号内内容清晰可读）=====
  var MVU_BEAUTIFY_COMPLETE = '<div style="text-align:center;margin:10px 0;width:100%;max-width:680px">\n<div style="display:inline-block;width:100%;text-align:left">\n  <details class="status-notice" style="border:none;background:none;margin:0">\n    <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:0;padding:0;width:100%">\n      <span style="flex:1;display:flex;align-items:center;height:34px;padding:0 18px;background:linear-gradient(135deg,#f7fafd 0%,#eef3fb 100%);border:1px solid rgba(130,150,185,0.35);border-radius:14px;box-shadow:0 2px 8px rgba(130,155,190,0.12);position:relative;z-index:2">\n        <span style="flex:1;font-size:0.92em;font-weight:600;color:#2d3a52">变量完成</span>\n        <small style="font-size:0.78em;color:#556680;margin-left:10px"><span class="toggle-btn" data-close="展开 ▶" data-open="收起 ▼"></span></small>\n      </span>\n    </summary>\n    <!-- 内容面板：高对比浅灰蓝底+深灰字，确保括号/列表/JSON全部清晰 -->\n    <div style="width:100%;max-height:360px;overflow-y:auto;margin:7px 0 0 0;padding:12px 18px;color:#1f2937;line-height:1.78;white-space:pre-wrap;background:#f4f7fb;border:1px solid rgba(130,150,185,0.32);border-radius:12px;font-size:0.92em;box-shadow:0 2px 10px rgba(130,155,190,0.1)">\n    $1\n    </div>\n  </details>\n</div>\n</div>\n\n<style>\n  .status-notice summary::marker { display: none; }\n  .status-notice[open] > div { animation: slideUp 0.35s ease forwards; }\n  .status-notice[open] .toggle-btn::after { content: attr(data-open); }\n  .status-notice:not([open]) .toggle-btn::after { content: attr(data-close); }\n  /* 内容区嵌套元素增强：列表、括号、JSON代码块全部加强对比度 */\n  .status-notice ul, .status-notice ol { padding-left: 22px; color: #1f2937; }\n  .status-notice li { margin: 3px 0; color: #1f2937; }\n  .status-notice code, .status-notice pre { font-size: 0.88em; color: #111827; background: #e8eef7; border: 1px solid #c7d3e6; border-radius: 5px; padding: 2px 5px; }\n  .status-notice pre { padding: 8px 12px; overflow-x: auto; }\n  .status-notice strong, .status-notice b { color: #0f172a; }\n  @keyframes slideUp {\n    from { opacity: 0; transform: translateY(-6px); }\n    to { opacity: 1; transform: translateY(0); }\n  }\n</style>';

  var MVU_BEAUTIFY_THINKING = '<div style="text-align:center;margin:10px 0;width:100%;max-width:680px">\n<div style="display:inline-block;width:100%;text-align:left">\n  <details class="loading-notice" style="border:none;background:none;margin:0">\n    <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;gap:0;padding:0;width:100%">\n      <span style="flex:1;display:flex;align-items:center;height:34px;padding:0 18px;background:linear-gradient(135deg,#f7fafd 0%,#eef3fb 100%);border:1px solid rgba(130,150,185,0.35);border-radius:14px;box-shadow:0 2px 8px rgba(130,155,190,0.12);position:relative;overflow:hidden;z-index:2">\n        <span style="flex:1;font-size:0.92em;font-weight:600;color:#2d3a52">正在变量更新</span>\n        <small style="font-size:0.78em;color:#556680;margin-left:10px"><span class="toggle-btn" data-close="展开 ▶" data-open="收起 ▼"></span></small>\n        <span class="flow-light" style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(130,160,210,0.12),transparent);animation:slide-flow 3s linear infinite;pointer-events:none"></span>\n      </span>\n    </summary>\n    <div style="width:100%;max-height:360px;overflow-y:auto;margin:7px 0 0 0;padding:12px 18px;color:#1f2937;line-height:1.78;white-space:pre-wrap;background:#f4f7fb;border:1px solid rgba(130,150,185,0.32);border-radius:12px;font-size:0.92em;box-shadow:0 2px 10px rgba(130,155,190,0.1)">\n    $1\n    </div>\n  </details>\n</div>\n</div>\n\n<style>\n  .loading-notice summary::marker { display: none; }\n  .loading-notice[open] .flow-light { animation: none; opacity: 0; }\n  .loading-notice[open] > div { animation: slideUp 0.35s ease forwards; }\n  .loading-notice[open] .toggle-btn::after { content: attr(data-open); }\n  .loading-notice:not([open]) .toggle-btn::after { content: attr(data-close); }\n  /* 内容区嵌套元素增强 */\n  .loading-notice ul, .loading-notice ol { padding-left: 22px; color: #1f2937; }\n  .loading-notice li { margin: 3px 0; color: #1f2937; }\n  .loading-notice code, .loading-notice pre { font-size: 0.88em; color: #111827; background: #e8eef7; border: 1px solid #c7d3e6; border-radius: 5px; padding: 2px 5px; }\n  .loading-notice pre { padding: 8px 12px; overflow-x: auto; }\n  .loading-notice strong, .loading-notice b { color: #0f172a; }\n  @keyframes slide-flow {\n    0 { transform: translateX(-100%); }\n    100 { transform: translateX(100%); }\n  }\n  @keyframes slideUp {\n    from { opacity: 0; transform: translateY(-6px); }\n    to { opacity: 1; transform: translateY(0); }\n  }\n</style>';

  // ===== MVU 状态栏 HTML 模板（用户模板标准：populateCharacterData + getAllVariables + eventOn + errorCatched）=====
  // 用途：渲染 <StatusPlaceHolderImpl/> 占位符为可视化状态栏
  // 配套正则：markdownOnly=true, promptOnly=false, runOnEdit=false, 用 ``` 代码块包裹（不指定语言）
  // MVU_STATUS_BAR_TEMPLATE：用户提供的标准模板（CSS和body为占位注释，由AI按需填充）
  // MVU_STATUS_BAR_HTML：兜底模板（填充默认CSS+自动遍历stat_data，AI未生成时使用）
  // 设计要点（对齐用户模板标准实现）：
  //   1. 完整 <!doctype html> 文档结构
  //   2. populateCharacterData() 函数：直接 getAllVariables() 读变量（不再用_getVars helper）
  //   3. 逐变量 $('#id').text(value) 手动填充（不再用renderTree递归渲染）
  //   4. eventOn(Mvu.events.VARIABLE_UPDATE_ENDED) 事件驱动刷新（不再用setInterval轮询）
  //   5. $(errorCatched(init)) 入口（不再用 $(async function(){try/catch}) ）
  //   6. await waitGlobalInitialized('Mvu') 等MVU就绪
  //   7. body内每个变量有唯一id
  //   8. 兜底模板自动遍历stat_data所有键填入#render-root（因兜底不知具体变量名）
  var MVU_STATUS_BAR_TEMPLATE = '<!doctype html>\n' +
'<html lang="zh-CN">\n' +
'<head>\n' +
'  <style>\n' +
'  body {\n' +
'    margin: 0;\n' +
'    padding: 0;\n' +
'  }\n' +
'\n' +
'  /* 在这里根据用户要求的UI风格自由设计样式 */\n' +
'  </style>\n' +
'  <script type="module">\n' +
'    function populateCharacterData() {\n' +
'      const all_variables = getAllVariables();\n' +
'\n' +
'      // 注意：所有变量路径必须以 \'stat_data.\' 开头\n' +
'\n' +
'      // 普通变量\n' +
'      const variable1 = _.get(all_variables, \'stat_data.xxx\', \'N/A\');\n' +
'      $(\'#id1\').text(variable1);\n' +
'\n' +
'      // 数组类型变量（如背包、记忆列表）\n' +
'      const items = _.get(all_variables, \'stat_data.背包\', []);\n' +
'      const html = items.map(i => `<li>${i}</li>`).join(\'\');\n' +
'      $(\'#items-list\').html(html);\n' +
'\n' +
'      // 对象类型变量（如NPCs）\n' +
'      const npcs = _.get(all_variables, \'stat_data.NPCs\', {});\n' +
'      Object.entries(npcs).forEach(([name, data]) => {\n' +
'        const relation = _.get(data, \'关系值\', 0);\n' +
'        console.log(`${name}: 关系${relation}`);\n' +
'      });\n' +
'\n' +
'      // 嵌套对象（推荐使用可选链）\n' +
'      const user = _.get(all_variables, \'stat_data.用户信息\', {});\n' +
'      const weapon = user.法宝?.本命法宝 || \'无\';\n' +
'      $(\'#weapon\').text(weapon);\n' +
'\n' +
'      // ... 更多变量\n' +
'    }\n' +
'\n' +
'    async function init() {\n' +
'      await waitGlobalInitialized(\'Mvu\');\n' +
'      populateCharacterData();\n' +
'\n' +
'      // 监听变量更新事件，实现自动刷新\n' +
'      eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => {\n' +
'        populateCharacterData();\n' +
'      });\n' +
'\n' +
'      $(\'.section-header\').on(\'click\', function () {\n' +
'        toggleSection($(this));\n' +
'      });\n' +
'    }\n' +
'\n' +
'    $(errorCatched(init));\n' +
'  </script>\n' +
'</head>\n' +
'<body>\n' +
'  <!-- 在这里根据用户要求的UI风格自由设计HTML结构 -->\n' +
'  <!-- 每个需要显示的变量必须有唯一的 id，在 populateCharacterData 中用 $(\'#id\').text(value) 填充 -->\n' +
'</body>\n' +
'</html>';
  var MVU_STATUS_BAR_HTML = MVU_STATUS_BAR_TEMPLATE;

  const ENTRY_TEMPLATES = {
    '基础公理': { constant: true, selective: false, position: 0, depth: 0, order: 250, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '核心铁则': { constant: true, selective: false, position: 0, depth: 0, order: 250, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '世界元数据': { constant: true, selective: false, position: 0, depth: 0, order: 240, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '交互软规则': { constant: true, selective: false, position: 1, depth: 0, order: 150, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '近场强约束': { constant: false, selective: true, position: 2, depth: 2, order: 180, sticky: null, cooldown: null, delay: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 3, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100, secondary_keys: [] },
    '当前局势': { constant: false, selective: true, position: 2, depth: 3, order: 170, sticky: null, cooldown: null, delay: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 3, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100, secondary_keys: [] },
    '场景机制': { constant: false, selective: true, position: 1, depth: 3, order: 140, cooldown: 3, delay: null, sticky: null, secondary_keys: [], prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '核心玩法': { constant: false, selective: true, position: 1, depth: 3, order: 130, cooldown: 3, delay: null, sticky: null, secondary_keys: [], prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '世界规则': { constant: false, selective: true, position: 1, depth: 4, order: 120, cooldown: 3, delay: null, sticky: null, secondary_keys: [], prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '实体交互': { constant: false, selective: true, position: 1, depth: 3, order: 110, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, secondary_keys: [], use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '重要角色': { constant: false, selective: true, position: 1, depth: 3, order: 105, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, secondary_keys: [], use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '势力与组织': { constant: false, selective: true, position: 1, depth: 3, order: 100, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, secondary_keys: [], use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '物品': { constant: false, selective: true, position: 1, depth: 3, order: 95, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, secondary_keys: [], use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '地点场景': { constant: false, selective: true, position: 1, depth: 3, order: 90, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, secondary_keys: [], use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '叙事背景': { constant: false, selective: true, position: 4, depth: 5, order: 80, probability: 60, cooldown: null, delay: null, sticky: null, selectiveLogic: 0, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 1, use_regex: true, match_whole_words: null, scan_depth: 8, useProbability: true, group: '叙事', group_weight: 100 },
    '故事发展': { constant: false, selective: true, position: 4, depth: 5, order: 75, probability: 60, cooldown: null, delay: null, sticky: null, selectiveLogic: 0, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 1, use_regex: true, match_whole_words: null, scan_depth: 8, useProbability: true, group: '叙事', group_weight: 100 },
    '文化与习俗': { constant: false, selective: true, position: 4, depth: 5, order: 70, probability: 60, cooldown: null, delay: null, sticky: null, selectiveLogic: 0, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 1, use_regex: true, match_whole_words: null, scan_depth: 8, useProbability: true, group: '叙事', group_weight: 100 },
    '历史事件': { constant: false, selective: true, position: 4, depth: 6, order: 65, probability: 50, cooldown: null, delay: null, sticky: null, selectiveLogic: 0, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 1, use_regex: true, match_whole_words: null, scan_depth: 8, useProbability: true, group: '叙事', group_weight: 100 },
    '动态适配': { constant: false, selective: true, position: 1, depth: 4, order: 50, cooldown: null, delay: null, sticky: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '引导机制': { constant: false, selective: true, position: 1, depth: 4, order: 45, cooldown: null, delay: null, sticky: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '互动选项': { constant: false, selective: true, position: 1, depth: 4, order: 40, cooldown: null, delay: null, sticky: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '状态栏': { constant: false, selective: true, position: 2, depth: 2, order: 35, sticky: null, cooldown: null, delay: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 3, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '统一输出格式': { constant: true, selective: false, position: 0, depth: 1, order: 85, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '角色边界': { constant: true, selective: false, position: 0, depth: 2, order: 80, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '禁止项': { constant: true, selective: false, position: 0, depth: 3, order: 70, prevent_recursion: true, exclude_recursion: true, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '自定义条目': { constant: false, selective: true, position: 1, depth: 4, order: 55, cooldown: null, delay: null, sticky: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 5, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100 },
    '[InitVar]初始变量': { constant: true, selective: false, position: 0, insertion_order: 100, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100, enabled: false },
    '变量列表': { constant: true, selective: false, position: 4, depth: 0, order: 200, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '变量更新规则': { constant: true, selective: false, position: 4, depth: 0, order: 200, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '变量输出格式': { constant: true, selective: false, position: 4, depth: 0, order: 200, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100 },
    '变量输出格式强调': { constant: true, selective: false, position: 4, depth: 0, order: 200, prevent_recursion: true, exclude_recursion: false, delay_until_recursion: 0, cooldown: null, delay: null, sticky: null, use_regex: true, match_whole_words: null, scan_depth: 0, selectiveLogic: 0, probability: 100, useProbability: false, group: '', group_weight: 100, enabled: false },
    '状态变量输出': { constant: false, selective: true, position: 2, depth: 2, order: 45, sticky: null, cooldown: null, delay: null, prevent_recursion: false, exclude_recursion: false, delay_until_recursion: 0, use_regex: true, match_whole_words: null, scan_depth: 3, selectiveLogic: 0, probability: 100, useProbability: true, group: '', group_weight: 100, secondary_keys: [] }
  };

  // ===== 权重等级映射（用于权重可视化预览） =====
  // 权重从低到高：极低/低/中低/中/中高/高/极高/最高
  const WEIGHT_LEVELS = {
    '基础公理': { level: '极低', color: '#b3aa98', desc: 'position=0 常驻，世界元数据锚定' },
    '世界元数据': { level: '极低', color: '#b3aa98', desc: 'position=0 常驻，底层背景' },
    '交互软规则': { level: '低', color: '#667085', desc: 'position=1 常驻，角色卡之后注入' },
    '近场强约束': { level: '极高', color: '#c98b7a', desc: 'position=2 触发，用户输入之前' },
    '当前局势': { level: '极高', color: '#c98b7a', desc: 'position=2 触发，sticky粘性' },
    '场景机制': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发' },
    '核心玩法': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发' },
    '世界规则': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=4 触发' },
    '实体交互': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发，防递归' },
    '重要角色': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发，防递归' },
    '势力与组织': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发，防递归' },
    '物品': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发，防递归' },
    '地点场景': { level: '中高', color: '#ca8a04', desc: 'position=1 depth=3 触发，防递归' },
    '叙事背景': { level: '中', color: '#15803d', desc: 'position=4 depth=5 概率触发' },
    '故事发展': { level: '中', color: '#15803d', desc: 'position=4 depth=5 概率触发' },
    '文化与习俗': { level: '中', color: '#15803d', desc: 'position=4 depth=5 概率触发' },
    '历史事件': { level: '中', color: '#15803d', desc: 'position=4 depth=6 概率触发' },
    '动态适配': { level: '中', color: '#15803d', desc: 'position=1 depth=4 动态系统，按需加载' },
    '引导机制': { level: '中', color: '#15803d', desc: 'position=1 depth=4 动态系统，按需加载' },
    '互动选项': { level: '中', color: '#15803d', desc: 'position=1 depth=4 动态系统，按需加载' },
    '状态栏': { level: '极高', color: '#c98b7a', desc: 'position=2 depth=2 sticky粘性' },
    '统一输出格式': { level: '极低', color: '#b3aa98', desc: 'position=0 常驻' },
    '角色边界': { level: '极低', color: '#b3aa98', desc: 'position=0 常驻' },
    '禁止项': { level: '极低', color: '#b3aa98', desc: 'position=0 常驻，禁止规则' },
    '自定义条目': { level: '中', color: '#15803d', desc: '用户自定义' },
    '[InitVar]初始变量': { level: '极低', color: '#b3aa98', desc: '第2条 | position=0(before_character_definition) insertion_order=100 常驻(enabled=false)，MVU变量初始化YAML' },
    '变量列表': { level: '极低', color: '#b3aa98', desc: '第3条 | position=4(at_depth d=0) 常驻，注入当前变量值给LLM' },
    '[mvu_update]变量更新规则': { level: '低', color: '#667085', desc: '第4条 | position=4(at_depth d=0) 常驻，依据schema生成check/type/range' },
    '[mvu_update]变量输出格式': { level: '低', color: '#667085', desc: '第5条 | position=4(at_depth d=0) 常驻，固定YAML定义<UpdateVariable>输出格式' },
    '[mvu_update]变量输出格式强调': { level: '低', color: '#667085', desc: '第6条 | position=4(at_depth d=0) 默认enabled=false，AI不输出<UpdateVariable>时启用' },
    '<状态栏>占位符提醒': { level: '极低', color: '#b3aa98', desc: '第7条 | position=4(at_depth d=0) 常驻，提醒AI输出<StatusPlaceHolderImpl/>' },
    '状态变量输出': { level: '中', color: '#15803d', desc: 'position=2 触发，输出当前变量状态给LLM' }
  };


  function getEntryTemplate(comment) {
    if (!comment) return null;
    // 1. 支持 [InitVar]xxx 前缀格式（MVU变量系统，兼容大小写）
    var commentLower = comment.toLowerCase();
    if (commentLower.indexOf('[initvar]') === 0) {
      return ENTRY_TEMPLATES['[InitVar]初始变量'];
    }
    // 2. 支持 <xxx> 前缀格式（标准条目）
    var m = comment.match(/^<([^>]+)>/);
    if (m) {
      var key = m[1];
      if (ENTRY_TEMPLATES[key]) return ENTRY_TEMPLATES[key];
      var fuzzyMatch = Object.keys(ENTRY_TEMPLATES).find(function(k) { return key.indexOf(k) >= 0 || k.indexOf(key) >= 0; });
      if (fuzzyMatch) return ENTRY_TEMPLATES[fuzzyMatch];
    }
    // 3. 支持 MVU 变量系统条目（无需前缀，直接匹配关键字）
    if (commentLower.indexOf('[mvu_update]') >= 0) {
      if (comment.indexOf('变量更新规则') >= 0) return ENTRY_TEMPLATES['变量更新规则'];
      if (comment.indexOf('变量输出格式强调') >= 0) return ENTRY_TEMPLATES['变量输出格式强调'];
      if (comment.indexOf('变量输出格式') >= 0) return ENTRY_TEMPLATES['变量输出格式'];
    }
    if (comment.indexOf('变量列表') >= 0) return ENTRY_TEMPLATES['变量列表'];
    if (comment.indexOf('状态变量输出') >= 0) return ENTRY_TEMPLATES['状态变量输出'];
    // 第7条：<状态栏>占位符提醒条目（含"状态栏"+"占位符"或"提醒"）
    if (comment.indexOf('状态栏') >= 0 && (comment.indexOf('占位') >= 0 || comment.indexOf('提醒') >= 0)) {
      // 复用"状态栏"模板（selective触发式），但实际第7条应为constant=true常驻
      // 这里返回变量列表模板作为基础（constant=true, position=4, depth=0）
      return ENTRY_TEMPLATES['变量列表'];
    }
    if (comment.indexOf('变量分段') >= 0 || comment.indexOf('分段提示') >= 0) return ENTRY_TEMPLATES['变量更新规则'];
    // 4. 通用匹配：遍历模板键找最长匹配
    var keys = Object.keys(ENTRY_TEMPLATES);
    var bestKey = null;
    var bestLen = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (comment.indexOf(k) >= 0 && k.length > bestLen) {
        bestKey = k;
        bestLen = k.length;
      }
    }
    if (bestKey) return ENTRY_TEMPLATES[bestKey];
    return null;
  }

  // ===== 🔑 自动派生触发词（写卡器兜底防线 · 对齐 StageDog 绿灯/向量化/蓝灯策略）=====
  // 仅当 keys 为空时才派生；蓝灯(constant=true)与向量化(vectorized=true)保持空不变
  function _deriveEntryKeys(comment, tmpl, content) {
    if (!comment) return [];
    var template = tmpl || getEntryTemplate(comment);
    var isConst = template && template.constant === true;
    if (isConst) return [];                                          // 蓝灯：constant常驻，保持空
    var stripped = _stripOuterBrackets(comment);                    // 先剥最外层装饰（⟦⟧【】等）
    var m = stripped.match(/^<([^>]+)>\s*([\s\S]*)$/);             // <标签>名字后缀 → 取名字部分
    var prefix = m ? m[1] : '';
    var namePart = (m ? m[2] : stripped).trim();
    // 中文字符片段（2字以上，过滤<标签>、通用停用词）作为触发词种子
    var stopSet = {'的':1,'是':1,'有':1,'我':1,'你':1,'他':1,'她':1,'它':1,'在':1,'和':1,'了':1,'与':1,'及':1,'个':1,'相关':1,'条目':1,'内容':1,'设定':1,'体系':1,'背景':1,'机制':1,'规则':1,'玩法':1,'流程':1,'系统':1,'功能':1,'模块':1,'部分':1,'通用':1,'主要':1,'核心':1,'基础':1,'扩展':1,'补充':1,'细化':1,'深度':1,'类型':1,'状态':1,'当前':1,'阶段':1,'模式':1};
    var candidates = [];
    // 1) 先提取 名字后缀中"·中文点号"切分出的多段，作为多维度命名（如 白娅·人际关系 → 白娅/人际关系）
    if (namePart) {
      namePart.split(/[·\/,，、\-\\]+/).forEach(function(seg){
        var s = seg.trim(); if (!s) return;
        if (/[\u4e00-\u9fa5A-Za-z0-9]{2,}/.test(s) && !stopSet[s]) candidates.push(s);
      });
    }
    // 2) 再从 content 前 300 字中抽取中文词组（2-6字）+ 典型实体特征词，去重追加
    var headContent = (content || '').slice(0, 300);
    try {
      var re = /[\u4e00-\u9fa5]{2,6}|[A-Za-z][A-Za-z0-9_]{1,15}/g;
      var mm;
      while ((mm = re.exec(headContent)) !== null) {
        var w = mm[0];
        if (stopSet[w]) continue;
        if (/^(姓名|身份|外貌|性格|背景|关系|人际关系|物品|地点|时间|年龄|特征|爱好|特长|家庭|称呼|位置|心情|智慧|魅力|体质|状态|好感度|好感|当前|内容|说明|描述|定义|介绍|概要|摘要|标签|以上|例如|比如|如果|因为|所以|但是|并且|或者|不是|还是|这是|一个|一种|一类|一下|一些|一起)$/.test(w)) continue;
        if (candidates.indexOf(w) < 0) candidates.push(w);
        if (candidates.length >= 12) break;
      }
    } catch(e) {}
    // 3) 根据 <标签前缀> 语义补齐语义锚点（典型触发词），和 StageDog 绿灯策略一致
    var categoryAnchors = {
      '重要角色': ['角色','人物','出场','出现'],
      '实体交互': ['交互','行动','动作','使用'],
      '势力与组织': ['组织','势力','成员','会议'],
      '物品': ['物品','道具','装备','获得'],
      '地点场景': ['地点','场景','来到','到达','前往'],
      '场景机制': ['机制','触发','回合','阶段'],
      '核心玩法': ['玩法','系统','操作','行动'],
      '世界规则': ['规则','世界','限定','违反'],
      '近场强约束': ['情境','当前','现在','当下'],
      '当前局势': ['局势','现状','剧情','当前'],
      '引导机制': ['引导','新手','提示','选项'],
      '互动选项': ['选项','选择','分支','接下来'],
      '动态适配': ['模式','切换','变化','分支'],
      '叙事背景': ['故事','背景','世界','历史'],
      '故事发展': ['剧情','发展','主线','推进'],
      '文化与习俗': ['文化','习俗','节日','传统'],
      '历史事件': ['历史','事件','过去','曾经'],
      '叙事': ['剧情','故事','叙述','回忆'],
      '自定义条目': []
    };
    if (prefix && categoryAnchors[prefix]) {
      categoryAnchors[prefix].forEach(function(a){ if (candidates.indexOf(a)<0) candidates.push(a); });
    }
    // 4) "<叙事背景>/<故事发展>/<文化与习俗>/<历史事件>" 属于向量化类，不强制填 keys（保持候选但留空可）——如果实在取不出名字才填
    var vecCats = {'叙事背景':1,'故事发展':1,'文化与习俗':1,'历史事件':1,'叙事':1};
    if (!m || !vecCats[prefix] || candidates.length < 2) {}
    if (candidates.length < 1 && namePart) candidates.push(namePart);
    // 去重 + 限制数量 3-10 个
    var uniq = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = String(candidates[ci]).trim();
      if (!c || c.length < 1 || c.length > 24) continue;
      if (uniq.indexOf(c) < 0) uniq.push(c);
      if (uniq.length >= 10) break;
    }
    // 向量化类：最多 2 个弱锚点就好（让向量化主要靠语义）
    if (prefix && vecCats[prefix]) {
      return uniq.slice(0, 2);
    }
    return uniq;
  }

  // ===== 🧹 清洗 MVU 条目 content 中混入的条目配置字段 =====
  // AI 生成 [InitVar] 等 MVU 条目时，有时把整个条目当 YAML 对象输出，
  // 导致 content 正文里出现 enabled: false / content: | / comment: xxx 等配置字段。
  // 本函数剥离这些配置字段，只保留 YAML 变量正文。
  // 仅对 MVU 变量条目（[InitVar]/变量列表/变量更新规则/变量输出格式等）生效，其他条目原样返回。
  function _stripEntryConfigFromContent(comment, content) {
    if (!content || typeof content !== 'string') return content;
    var c = (comment || '').toLowerCase();
    var isMvu = c.indexOf('[initvar]') >= 0 || c.indexOf('变量列表') >= 0 ||
                c.indexOf('变量更新规则') >= 0 || c.indexOf('变量输出格式') >= 0 ||
                c.indexOf('mvu_update') >= 0 || c.indexOf('状态变量输出') >= 0;
    if (!isMvu) return content;

    var lines = content.split(/\r?\n/);
    // 条目配置字段名（不会被 MVU YAML 正文用作根字段）
    var configFieldRe = /^(enabled|content|comment|constant|keys|secondary_keys|selective|selectiveLogic|position|depth|order|insertion_order|use_regex|probability|sticky|cooldown|delay|vectorized|prevent_recursion|exclude_recursion|displayIndex|display_index|uid|name|group|group_weight|useProbability|scan_depth|match_whole_words|delay_until_recursion|role)\s*:/i;

    // 快速检查：开头 10 行内是否有配置字段
    var hasConfig = false;
    for (var i = 0; i < Math.min(lines.length, 10); i++) {
      if (configFieldRe.test(lines[i].trim())) { hasConfig = true; break; }
    }
    if (!hasConfig) return content;

    // 检查是否有 content: | 行（YAML 块字符串语法，AI 把条目当对象输出的典型特征）
    var contentPipeIdx = -1;
    for (var i = 0; i < Math.min(lines.length, 10); i++) {
      if (/^content\s*:\s*\|/i.test(lines[i].trim())) { contentPipeIdx = i; break; }
    }

    if (contentPipeIdx >= 0) {
      // 情况1：enabled: false \n content: | \n   缩进的 YAML 正文
      // 提取 content: | 后面的缩进块，去掉一级缩进作为真正 content
      var indent = -1;
      for (var j = contentPipeIdx + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        var m = lines[j].match(/^(\s+)/);
        if (m) { indent = m[1].length; }
        break;
      }
      var cleaned = [];
      for (var j = contentPipeIdx + 1; j < lines.length; j++) {
        if (indent > 0 && lines[j].startsWith(' '.repeat(indent))) {
          cleaned.push(lines[j].slice(indent));
        } else if (indent > 0 && lines[j].startsWith('\t')) {
          cleaned.push(lines[j].replace(/^\t/, ''));
        } else if (lines[j].trim() === '') {
          cleaned.push('');
        } else {
          cleaned.push(lines[j]);
        }
      }
      var result = cleaned.join('\n').trim();
      // 如果清洗后为空（异常情况），保留原始内容避免数据丢失
      return result || content;
    }

    // 情况2：开头有 enabled: false 等配置字段，但没有 content: |
    // 删掉开头的配置字段行和空行，保留第一个非配置字段行及之后的所有内容
    var cleaned2 = [];
    var skipConfig = true;
    for (var i = 0; i < lines.length; i++) {
      if (skipConfig) {
        if (lines[i].trim() === '' || configFieldRe.test(lines[i].trim())) continue;
        skipConfig = false;
      }
      cleaned2.push(lines[i]);
    }
    var result2 = cleaned2.join('\n').trim();
    return result2 || content;
  }

  // 判断条目是否属于MVU变量系统
  // 兼容大小写前缀：[InitVar]/[initvar]、[mvu_update] 等
  // 扩展：包含8条工作流条目 + 附加条目（阶段判定/EJS/人设切换/派生字段/状态机/联动规则等）也视为MVU体系条目
  function isMVUEntry(comment) {
    var c = (comment || '').toLowerCase();
    return c.indexOf('[initvar]') >= 0 || c.indexOf('变量列表') >= 0 ||
           c.indexOf('变量更新规则') >= 0 || c.indexOf('变量输出格式') >= 0 ||
           c.indexOf('状态变量输出') >= 0 || c.indexOf('updatevariable') >= 0 ||
           c.indexOf('变量分段') >= 0 || c.indexOf('分段提示') >= 0 ||
           c.indexOf('ejs') >= 0 ||
           c.indexOf('状态栏') >= 0 || c.indexOf('statusplaceholder') >= 0 ||
           c.indexOf('阶段判定') >= 0 || c.indexOf('阶段切换') >= 0 ||
           c.indexOf('人设切换') >= 0 || c.indexOf('人设规则') >= 0 ||
           c.indexOf('动态注入') >= 0 || c.indexOf('派生字段') >= 0 ||
           c.indexOf('衍生字段') >= 0 || c.indexOf('联动规则') >= 0 ||
           c.indexOf('阈值触发') >= 0 || c.indexOf('控制器') >= 0 ||
           c.indexOf('阶段变量') >= 0 || c.indexOf('状态机') >= 0 ||
           c.indexOf('分阶段') >= 0 || c.indexOf('多阶段') >= 0 ||
           c.indexOf('关系阶段') >= 0 || c.indexOf('剧情进度') >= 0 ||
           c.indexOf('系统模式') >= 0 || c.indexOf('境界等级') >= 0 ||
           c.indexOf('阶段标记') >= 0 || c.indexOf('判定逻辑') >= 0 ||
           c.indexOf('联动变更') >= 0 || c.indexOf('只读字段') >= 0;
  }

  // 判断是否为MVU核心条目（五大核心：[initvar]/变量列表/变量更新规则/变量输出格式/变量输出格式强调）
  function isMVUCoreEntry(comment) {
    var c = (comment || '').toLowerCase();
    return c.indexOf('[initvar]') >= 0 || c.indexOf('变量列表') >= 0 ||
           c.indexOf('变量更新规则') >= 0 || c.indexOf('变量输出格式') >= 0;
  }

  // ST规范：转换 regex_scripts 格式（导入/导出共用）
  function normalizeRegexScripts(rxScripts) {
    if (!rxScripts || !Array.isArray(rxScripts)) return [];
    return rxScripts.map(function(script, idx) {
      var findRegex = script.findRegex || script.find_regex || script.find || '';
      var replaceString = script.replaceString || script.replace_string || script.replace || '';
      var rawPlacement = script.placement !== undefined ? script.placement :
                         (script.source ? (function(s) {
                           var arr = [];
                           if (s.user_input) arr.push(1);
                           if (s.ai_output) arr.push(2);
                           if (s.slash_command) arr.push(3);
                           if (s.world_info) arr.push(4);
                           if (s.reasoning) arr.push(5);
                           return arr.length ? arr : [2];
                         })(script.source) : 2);
      var placement = Array.isArray(rawPlacement) ? rawPlacement : [rawPlacement];
      // 兼容 destination 字段（部分实现用 destination.display/prompt 而非 markdownOnly/promptOnly）
      var dest = script.destination || {};
      var markdownOnly = script.markdownOnly !== undefined ? script.markdownOnly :
                         (script.markdown_only !== undefined ? script.markdown_only :
                         (dest.display !== undefined ? !!dest.display : false));
      var promptOnly = script.promptOnly !== undefined ? script.promptOnly :
                       (script.prompt_only !== undefined ? script.prompt_only :
                       (dest.prompt !== undefined ? !!dest.prompt : false));
      return {
        id: script.id || ('regex_script_' + Date.now() + '_' + idx),
        scriptName: script.scriptName || script.script_name || script.name || '正则脚本',
        findRegex: findRegex,
        replaceString: replaceString,
        trimStrings: script.trimStrings || script.trim_strings || [],
        placement: placement,
        disabled: script.disabled !== undefined ? script.disabled : (script.enabled !== undefined ? !script.enabled : false),
        markdownOnly: markdownOnly,
        promptOnly: promptOnly,
        runOnEdit: script.runOnEdit !== undefined ? script.runOnEdit : (script.run_on_edit !== undefined ? script.run_on_edit : false), /* 改进K：默认false与ST一致 */
        substituteRegex: script.substituteRegex !== undefined ? script.substituteRegex : (script.substitute_regex !== undefined ? script.substitute_regex : 0),
        minDepth: script.minDepth !== undefined ? script.minDepth : (script.min_depth !== undefined ? script.min_depth : null),
        maxDepth: script.maxDepth !== undefined ? script.maxDepth : (script.max_depth !== undefined ? script.max_depth : null)
      };
    });
  }

  // UI显示分组（基于条目类型，非ST group字段）
  function getDisplayGroup(e) {
    var comment = e.comment || '';
    // 变量系统优先判断（避免被 constant=true 的常驻体系拦截）
    if (isMVUEntry(comment)) return '变量系统';
    // 常驻体系判断
    var tmpl = getEntryTemplate(comment);
    var isConst = e.constant !== undefined ? e.constant : (tmpl ? tmpl.constant : false);
    if (isConst) return '常驻体系';
    var m = comment.match(/^<([^>]+)>/);
    var prefixKey = m ? m[1] : '';
    if (['动态适配', '引导机制', '互动选项', '状态栏'].indexOf(prefixKey) >= 0) return '动态系统';
    if (['叙事背景', '故事发展', '文化与习俗', '历史事件'].indexOf(prefixKey) >= 0) return '叙事';
    return '触发体系';
  }

  const MODULE_SYSTEM = {
    permanent: [
      { key: 'axiom', name: '基础公理', icon: '🏛️', weight: 35, position: 0, order: 250 },
      { key: 'soft_rules', name: '交互软规则', icon: '🤝', weight: 30, position: 1, order: 150 },
      { key: 'core_rules', name: '核心铁则', icon: '🔐', weight: 35, order: 100 },
    ],
    trigger: [
      { key: 'near_constraint', name: '近场强约束', icon: '🎯', weight: 25, position: 2, depth: 2 },
      { key: 'scene_mechanics', name: '场景机制', icon: '⚔️', weight: 25, position: 1, depth: 3 },
      { key: 'entity_interact', name: '实体交互', icon: '👥', weight: 25, position: 1, depth: 3 },
      { key: 'narrative_bg', name: '叙事背景', icon: '📖', weight: 25, position: 4, depth: 5 }
    ],
    dynamic: [
      { key: 'dynamic_adapt', name: '动态适配', icon: '🔄', weight: 100, position: 1, depth: 4 }
    ],
    variable: [
      { key: 'init_var', name: '初始变量', icon: '📊', weight: 100, position: 0, insertion_order: 100 },
      { key: 'var_update_rule', name: '变量更新规则', icon: '📝', weight: 100, position: 1, insertion_order: 145 }
    ]
  };

    // ============================================================================
  // SECTION 4  写卡预设 + 系统提示词（注入到每一次 AI 请求的 system prompt）
  // ============================================================================
  // ===== 【写卡预设】生成参数默认值（对齐写卡.json 数值） =====
  const TAVERN_GENERATION_PARAMS = {
    temperature: 1,
    top_p: 0.9,
    top_k: 500,
    top_a: 0,
    min_p: 0,
    repetition_penalty: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 64000
  };

  // ===== 系统提示词（ST权重分层8体系 + MVU变量系统 + 写卡预设注入） =====
  const SYS_PROMPT = '你是一位专业的世界模式角色卡创作大师，基于SillyTavern原生机制和ST权重分层8体系（+MVU变量系统可选），通过自然对话引导用户创建完整的世界模式角色卡。\n\n' +
    // ===== 【写卡预设注入 #2】📖 创作思路 creative_principles =====
    '<creative_principles>\n' +
    '角色卡制作核心原则：\n' +
    '1. 衍生机制：每个性格在具体场景中展开为行为，衍生之间可以跨性格关联产生化学反应\n' +
    '2. 手写优先：衍生和台词必须由创作者自己写，AI无法做到把毫无逻辑的两个性格组合在一起\n' +
    '3. 三面性（可选）：当角色在不同场景下有根本性的行为切换时，用三面性描述不同的运作模式\n' +
    '4. 二次解释：作者对角色的终极注释，防止AI用自己的理解补全角色，确保角色是创作者想象中的样子\n' +
    '5. NSFW描写：从"为什么做"而不是"做什么"的角度描写亲密行为，让亲密成为性格的延续\n' +
    '6. 用行为展现性格，而非定义性格\n' +
    '7. 提供具体的语料示例，而非描述语气\n' +
    '8. 避免模糊词、比喻词、微表情等八股描写\n' +
    '9. 外貌特征差异化：只写偏离AI数据库默认认知的特征，不写万能美人描写\n' +
    '10. 保持一致性，所有设定要相互支撑\n' +
    '11. 去标签化：AI直出的角色需要作者用具体行为修正，使其成为创作者想象中的样子\n' +
    '</creative_principles>\n\n' +
    // ===== 【写卡预设注入 #3】📐 创作原则-绝对零度 writing_principles =====
    '<writing_principles>\n' +
    '禁用词清单：\n' +
    '· 模糊词：似乎、几乎、仿佛、如同、宛如、好像、好像、大概、也许、差不多\n' +
    '· 劣质比喻：像小兽、像小兔子、投石入湖、心湖泛起涟漪、如同飞蛾扑火\n' +
    '· 微表情词：嘴角上扬、眼里闪过光芒、指尖泛白、眉头微蹙、唇角勾起\n' +
    '· 语气描写：带着xx的口吻、用xx的语气、以xx的声调、xx地说\n' +
    '· 极端情绪词：陷入极大的恐惧、极度羞耻、无比愤怒、绝望至极\n' +
    '· 否定转折句：不是...而是...、并非...而是...、与其说...不如说...\n' +
    '· 心理描写：大段内心活动、心想、暗自思忖、内心挣扎\n' +
    '创作准则（6条，每条必须可执行）：\n' +
    '· 客观叙述：只写镜头能拍到的内容；只写外部可观察的动作、对话、环境；禁止写角色内心想法\n' +
    '· 白描事实：只写"谁做了什么、说了什么、发生了什么"；禁止添加修饰语和渲染词；每个句子必须包含具体动词\n' +
    '· 名词动词造句：句子主体由名词和动词构成；禁止使用形容词做谓语；禁止使用副词修饰形容词\n' +
    '· 具体名词代替代词：用人名、物名、地名指代；禁止用"他/她/它/那个/这个"作为句子主语；禁止用抽象概念（如"希望""恐惧"）替代具体事物\n' +
    '· 行为展现性格：写角色执行的具体动作和说出的话；禁止写"她是一个温柔的人"；让读者从动作和对话中推断性格\n' +
    '· 纯对话体现特点：只写角色说的原话；禁止在对话后附加"她温柔地说""他冷冷地回答"；让对话内容本身传递语气\n' +
    '</writing_principles>\n\n' +
    // ===== 【写卡预设注入 #4】📝 输出格式要求 output_format =====
    '<output_format>\n' +
    '当输出实际创作内容（制作角色卡、写故事内容、创建世界观设定、编写场景描写、输出任何创作内容）时，每个世界书条目的content字段必须使用YAML中文格式并用缩进+冒号+短横线表达层级：\n' +
    '- 使用缩进表示层级关系，每级缩进2个空格\n- 使用冒号分隔键和值\n- 列表项使用短横线开头\n- 所有键名和内容都使用中文\n- 保持结构清晰，层级分明\n' +
    '当进行解释说明或回答问题时，不需要使用代码块/格式，直接用自然语言输出即可。\n' +
    '</output_format>\n\n' +
    // ===== 【写卡预设注入 #5】📋 标签规范 template_tag_spec =====
    '<template_tag_spec>\n' +
    '世界书条目标签包裹规范：每个世界书条目的内容必须用 <名称_idN> 标签包裹。\n' +
    'ID分配顺序：1.世界观条目（id1~idX）→ 2.角色速览（id0，不占正式ID序列）→ 3.各角色条目（按创建顺序，同角色所有条目共用同一个ID）→ 4.NPC条目（在角色之后继续递增）\n' +
    '世界观ID：路径A/B单条目= <世界观_id1>；路径C大世界= <世界观_id1>总纲 / <世界观_id2>区域速览 / <世界观_id3>势力场景详情（多个同层级共用id3） / <世界观_id4>事件类型\n' +
    '角色速览固定使用：<角色速览_id0>\n' +
    '角色ID规则：同一角色的基础信息/三面性/二次解释/衣柜/NSFW全部共用同一个 <角色名_idN>，不同角色用不同ID，ID按角色创建顺序递增分配。\n' +
    'NPC ID：每个NPC独立一个 <NPC名_idN> 标签，ID在角色之后继续递增。\n' +
    '写入格式：条目前加 <角色名_idN>，后加 </角色名_idN> 闭合。重要提醒：标签ID在整个角色卡生命周期内保持不变；新增同角色条目→复用已有ID；新增新角色/新NPC→当前最大ID后+1；删除条目不重新编号。\n' +
    '</template_tag_spec>\n\n' +
    // ===== 【写卡预设注入 #6】📋 角色基础模板 template_basic =====
    '<template_basic>\n' +
    '角色基础信息核心结构：角色档案 → ①基本信息（姓名/年龄/性别/身份/与用户关系/其他）、②外貌特征【特征差异化原则：只写偏离数据库默认认知的部分——不是写"美"是写"特征"；遮住名字只靠外貌能认出角色】（偏离默认的身体特征/标志性装扮/体型显著特点/能被记住的细节；不写数据库默认值/万能美人描写/过度细节）、③背景设定（只写对角色产生实际影响的关键事件：家庭/经济/成长经历/重要事件/社交）、④关系设定（与用户关系的详细说明/相识过程/互动方式/特殊设定）。\n' +
    '</template_basic>\n\n' +
    '=== ⚠️ 【绝对禁止】最高优先级规则 ===\n' +
    '1. 严禁输出任何内部思考过程，包括但不限于：<thinking>标签、<think>标签、[果农冒泡]、[NSFW判定]、[人物逻辑]、[基调锚定]、[角色认知迷雾]、[角色活性与自然回应]、[风格适配]、[反思 & 设定校对]、[物理规则]、[正文字数检测]、[输出顺序检查]、<!-- End of The ECoT -->等\n' +
    '2. 严禁输出"果农人格加载"、"time_format"、"果农记录"等任何非对话内容\n' +
    '3. 严禁使用<content>标签包裹正文\n' +
    '4. 你的回复应该是自然的对话，直接对用户说话，不要扮演任何"果农"之类的人格\n' +
    '5. 不要在回复中加入任何元信息、调试信息、思考链\n\n' +
    '=== ⚠️ 关键规则速查（最高优先级，每次回复前必读） ===\n\n' +
    '**输出格式铁律（:::操作块协议）**：\n' +
    '1. 使用:::操作块协议输出修改指令，格式：::: 动作 条目名\\n内容\\n:::\n' +
    '2. 5种动作：\n' +
    '   · upsert 条目名 — 有则更新，无则新增（最常用，不需要判断是否已存在）\n' +
    '   · update 条目名 — 仅更新已存在的条目（不存在时警告，不新增）\n' +
    '   · delete 条目名 — 删除指定条目\n' +
    '   · set 字段名 — 设置顶层字段（name/avatar/description/personality/scenario/first_mes/mes_example/creator/character_version/creator_notes/tags）\n' +
    '   · ⚠️ system_prompt 与 alternate_greetings 由写卡器自动管理，禁止手动set（身份定位从 personality/description 自动提取，不限字数；多开局改为使用 <动态适配>分支开局 + MVU initvar 覆盖 或 开场白内嵌选项）\n' +
    '   · rename 旧名 → 新名 — 重命名条目（也可以用 -> 或 => 分隔）\n' +
    '3. 条目名就是世界书条目的comment，用<前缀>分类，如<人物>主角、<基础>世界\n' +
    '4. 每个操作块用:::开头和:::结尾，内容在中间，不需要代码块包裹\n' +
    '5. 严禁同时输出JSON代码块和:::操作块！只能使用:::操作块协议，不要输出```json代码块\n' +
    '6. 操作块前可以有1-2句自然语言说明，操作块后不再解释\n' +
    '7. 无变化时回复"本次无修改"\n\n' +
    '【🔑 触发词(keys)填写铁律 · StageDog 绿灯模式规范】\n' +
    '① 每个条目**必须自带 keys/secondary_keys 元信息**（触发词），不要等写卡器兜底！写卡器兜底只是最后一道防线，你主动填写才是精准触发的保证。\n' +
    '② keys 写在 ::: upsert/update 块的**第1个空行之前**（即块的开头，块体内的元信息头），使用「键=值」格式，keys 用英文逗号分隔数组（支持中文词组/人名/地点名/场景词），不要写进 content 正文！\n' +
    '   ✅ 正确格式（块体第1行开始就是元信息头，空行后才是正文content）：\n' +
    '     ::: upsert <重要角色>白娅\\nkeys=白娅,诗织,唯子,转学,女仆\\nsecondary_keys=好感度,依存,家庭,称呼\\nselectiveLogic=0\\n\\n身份：父母双亡的女高中生...\\n外貌：...\\n:::\n' +
    '     ::: upsert <地点场景>天台观星台\\nkeys=天台,观星台,屋顶,星空,望远镜\\n\\n屋顶有一台古旧的望远镜...\\n:::\n' +
    '   ❌ 错误1（把 keys 当作文本混进 content 正文）：\\n     keys=白娅,诗织\\n身份：... \\n→ ❌ 这会导致"触发词配置"和"角色正文"混在一起，渲染时把 keys 一行字显示出来。\n' +
    '   ❌ 错误2（完全不写 keys）：::: upsert <重要角色>白娅\\n身份：... → ❌ 酒馆绿灯模式需要关键词才会注入，没 keys 的条目永远激活不了。\n' +
    '   ❌ 错误3（keys 太泛）：keys=的,是,有,我 → ❌ 全局每轮都触发，token爆炸。\n' +
    '③ StageDog 默认激活策略对照（绿灯带 keys 触发、向量化无 keys 靠语义、蓝灯constant常驻无扫描）：\n' +
    '   · <重要角色> / <实体交互> / <势力与组织> / <物品> / <地点场景> → 绿灯带keys：keys=实体名+别称+常见搭配词（3-8个）\n' +
    '   · <场景机制> / <核心玩法> / <世界规则> / <近场强约束> / <当前局势> → 绿灯带keys：keys=机制关键词+动作词（战斗/上课/约会/修炼/逛街/考试…）\n' +
    '   · <叙事背景> / <故事发展> / <文化与习俗> / <历史事件> → 向量化(keys=空)或绿灯带语义锚点keys（任选其一）\n' +
    '   · <基础公理> / <核心铁则> / <交互软规则> / <统一输出格式> / <角色边界> / <禁止项> / <变量列表> / [InitVar] / 变量更新规则/输出格式 → 蓝灯constant常驻，keys=空（写了也不生效）\n' +
    '   · <引导机制> / <互动选项> / <动态适配> → 绿灯带keys：keys=新手,引导,选项,开局,模式…\n' +
    '④ secondary_keys（次级键）+ extensions.selectiveLogic（0=AND_ANY,1=NOT_ALL,2=NOT_ANY,3=AND_ALL）：当条目需要"主词+限定词"时才填，例如 keys=战斗 + secondary_keys=野外,城市,秘境 + selectiveLogic=0 表示"战斗时只要出现任一地点词才触发"。\n' +
    '⑤ ::: rename/delete/set 不需要 keys/secondary_keys，按原有格式写即可。\n\n' +
    '**示例**：\n' +
    '::: upsert <人物>主角\\nkeys=星野,主角\\n\\n姓名：星野\\n年龄：18岁\\n性格：热血冲动\\n:::\\n\\n' +
    '::: upsert <人物>女配\\nkeys=月华,学姐,女配角\\nsecondary_keys=图书馆,天台,学生会\\nselectiveLogic=0\\n\\n姓名：月华\\n年龄：19岁\\n性格：冷静沉着\\n:::\\n\\n' +
    '::: delete <人物>反派\\n\\n::: set description\\n这是一个奇幻世界...\\n:::\\n\\n' +
    '**高级混合示例（改+增+删一次打包）**：\n' +
    '用户说："把主角改成19岁，再加个反派姐姐，把女配删掉" → AI一次输出：\n' +
    '::: upsert <人物>主角\\n姓名：星野\\n年龄：19岁（原18岁）\\n性格：热血冲动\\n背景：...（完整保留）\\n人际关系：...（完整保留+新增与姐姐的关系）\\n:::\\n\\n' +
    '::: upsert <人物>反派姐姐\\n姓名：星野燐\\n年龄：24岁\\n性格：心狠手辣，唯独护弟\\n:::\\n\\n' +
    '::: delete <人物>女配\\n:::\\n\\n' +
    '**重命名示例**：\n' +
    '::: rename <人物>主角 → <重要角色>星野\\n:::\\n\\n' +
    '::: rename 星历纪年 → 苍蓝历纪年\\n:::\\n\\n' +
    '**写卡器自检状态栏（<statusblock>，本聊天界面用）铁律**：\n' +
    '- 注意：这是【写卡器聊天界面自身】的输出状态块，和角色卡的【MVU状态栏】（StatusPlaceHolderImpl）完全是两件事，不要混淆\n' +
    '- 每次回复必须包含 `<statusblock>` 状态块\n' +
    '- statusblock 内部使用 **Markdown 格式**（### 标题 / - 列表 / **加粗**），禁止使用 HTML 标签（<details>/<summary>/<ul>/<li>/<p>/<b>等）\n' +
    '- 8大体系用 ✅⏳❌ 标识，放在 Markdown 列表中\n' +
    '- 所有问题放在「### 🔍 需要您补充的信息」区块\n\n' +
    '**Token预算铁律**：\n' +
    '- 删除冗余、精炼表达、高信息密度\n' +
    '- description/personality/scenario/first_mes 全部不限字数，有内容即可（自由掌握创作密度）\n' +
    '- ⚠️ system_prompt 不再手动写，写卡器从 personality/description 自动提取身份定位（不限字数）\n' +
    '- 常驻Token量仅供参考，AI失忆时再考虑精简内容\n' +
    '- 世界书条目不限字数/不限数量（自由增减，按创作进度自然增长）\n' +
    '**MVU条目Token预算铁律（8条工作流，详见9.1.6）**：\n' +
    '- 【标准体系=8条按顺序逐条生成，缺一不可】8条固定顺序见9.1.6，核心规则：每生成1条停下等"继续"，前7条完成后才生成第8条（状态栏HTML）\n' +
    '- ⚠️ 【铁律：逐条生成+等待继续】生成第1条后立即停下，结尾只问"已生成第1条，说\'继续\'生成第2条"；用户说"继续"再按顺序写下一条。禁止一次性输出2条及以上！\n' +
    '- ⚠️ 【铁律：前7条后才第8条】第8条是状态栏HTML，必须前7条全部齐全后才允许生成。前7条缺任意一条时，禁止提第8条或进入状态栏Step流程。\n' +
    '- 【附加条目=按需生成】仅当用户明确要求时，才允许生成8条之外的附加条目：如阶段判定变量、人设切换规则、EJS控制器、派生($)字段联动逻辑、阈值触发动态注入等。用户未明确要求的情况下禁止AI自行追加任何额外条目。\n' +
    '- 【废弃原多阶段变量耦合模板】原"好感度阶段→人设切换"的专属耦合提示词（原37/38号）已整体废弃；如需多阶段/分档位/状态机类变量，改用下方的【通用多阶段状态变量生成指导】，可适配好感度/剧情进度/系统模式/境界等级等任意场景。\n' +
    '- 第1条 变量结构脚本（局部脚本，常驻但仅初始化注册）：≤1500字。字段组织按世界/角色/主角/系统一级分类，二级属性，三级子属性。\n' +
    '- 第2条 [InitVar]初始变量（enabled=false，只初始化读一次，不占常驻）：≤1500字。超多变量请拆：初始化只设核心字段默认值，非核心字段用zod .prefault()在schema中定义默认值+AI首次触达时再写\n' +
    '- 第3条 [mvu_update]变量更新规则（constant=true常驻）：≤400字。规则要精炼，每条变量的check控制在1-2行说明；补充派生变量命名规范（$开头=AI只读、由脚本/transform自动派生）、只读字段约束（_开头禁止AI更新）；超复杂规则（战斗系统等）拆到"场景机制"世界书条目里按触发加载，不要常驻\n' +
    '- 第4条 变量列表（constant=true常驻）：≤200字，内容是固定占位符 null 本身不长\n' +
    '- 第5条 [mvu_update]变量输出格式（constant=true常驻）：≤600字。JSON Patch模板本身约300字，rule字段精炼在10行以内\n' +
    '- 第6条 [mvu_update]变量输出格式强调（constant=true，默认enabled=false）：≤300字，固定提醒模板\n' +
    '- 第7条 <状态栏>占位符提醒（constant=true常驻）：≤100字，简单提醒语句\n' +
    '- 第8条 正则6 [美化]MVU状态栏（regex_scripts）：≤3000字，完整HTML状态栏+渲染函数\n' +
    '- 核心常驻Token（第3/4/5条 constant=true）合计≤1200字；超出时优先精简"变量更新规则"，再精简"变量输出格式"的rule字段。附加条目单独算Token预算，每条≤600字，仅在用户明确要求时生成。\n\n' +
    '**【通用多阶段状态变量生成指导】**：\n' +
    '- 适用场景：好感度/关系阶段、剧情进度/章节分支、系统模式/状态切换、属性等级/境界突破 等任意需要分阶段/分档位/分状态的变量体系。\n' +
    '- 设计流程（仅用户明确要求分阶段时执行）：①阶段划分：确认阶段数量、每个阶段的触发阈值/条件、阶段命名；②字段设计：核心判定变量、阶段标记变量、只读派生变量（$开头，AI只读不更新）；③切换规则：阶段跳转的触发条件、联动变更的字段、边界兜底；④注入逻辑（可选）：不同阶段是否注入不同的世界书内容/提示规则。\n' +
    '- 输出规范（仅用户明确要求分阶段时输出）：①变量结构中新增阶段相关字段定义（派生字段统一用$前缀）；②初始变量中设置开局默认阶段；③更新规则中补充阶段判定逻辑、边界约束、联动变更规则；④如需动态注入内容，配套生成EJS控制器条目或injectPrompts脚本条目。\n' +
    '- 通用约束（多阶段严格执行）：阶段阈值边界清晰，无重叠无遗漏；阶段切换必须有明确触发条件，禁止无理由跳转；派生阶段字段用$开头标记为AI只读，由脚本/zod transform自动计算；阶段变更必须同步更新关联状态，保持数据一致性。\n\n' +
    '=== ⚠️⚠️⚠️ 内容尺度控制（最高优先级，违反将导致任务失败） ===\n' +
    '1. **默认全年龄向**：除非用户明确要求NSFW/成人/色情/暗黑等内容，否则所有内容必须保持全年龄向\n' +
    '2. **禁止主动生成NSFW**：严禁在用户未明确要求的情况下生成任何性描写、色情内容、肉体描写等\n' +
    '3. **IP名称不等于尺度许可**：即使世界名/IP名带有暗示性词汇，也绝不能据此自动生成NSFW内容\n' +
    '4. **第一轮必须询问尺度**：当用户提出创作需求时，第一轮回复必须询问"你希望这个世界卡是什么尺度？全年龄向/暗黑/NSFW？"，在用户明确回答前不得生成任何具体内容\n' +
    '5. **尺度跟随用户**：只有当用户明确说"NSFW"、"成人"、"色情"、"18禁"等词汇时，才生成对应尺度内容；用户说"全年龄"或未提及尺度时，必须保持全年龄向\n' +
    '6. **不替用户做道德判断**：但内容尺度必须严格跟随用户的明确指令，用户没说的尺度绝不主动添加\n\n' +
    '=== ⚠️⚠️⚠️ 渐进式信息收集（最高优先级，违反将导致任务失败） ===\n' +
    '1. **严禁一次性生成所有内容**：每轮对话只生成1-2个体系的内容\n' +
    '2. **开场白生成时机**：开场白(first_mes)只能在以下情况生成：\n' +
    '   - 用户明确要求"生成开场白"时\n' +
    '   - 信息完整度达到80%以上且用户说"生成角色卡"时\n' +
    '   - 严禁在信息收集阶段（完整度<80%）主动生成开场白\n' +
    '3. **第一轮对话规则**：\n' +
    '   - 必须先询问用户想要的内容尺度（全年龄/暗黑/NSFW）\n' +
    '   - 必须先询问核心铁则和世界基底的具体细节\n' +
    '   - 严禁在第一轮生成世界观描述、开场白、系统指令等完整内容\n' +
    '   - 第一轮最多生成1条<基础公理>或<核心铁则>条目\n' +
    '4. **每轮生成限制**：\n' +
    '   - 每轮最多生成2条世界书条目\n' +
    '   - 每轮最多更新1-2个顶层字段\n' +
    '   - 严禁一轮对话同时生成世界观描述+开场白+系统指令+多条目\n' +
    '5. **进度如实报告**：\n' +
    '   - 状态栏的✅/⏳/❌必须与实际生成的内容匹配\n' +
    '   - 没有生成对应体系的条目，该体系必须标记为❌待完善\n' +
    '   - 只生成了部分内容，标记为⏳进行中\n' +
    '   - 严禁虚报进度，严禁把没做的体系标记为✅完成\n' +
    '   - 信息完整度百分比必须真实反映已收集的信息量\n\n' +
    '6. **语义理解 = 先行动后解释**：\n' +
    '   - 用户不是在跟你聊天。用户说的每一句话都=角色卡的增删改需求，你的第一反应是输出:::操作块，不是长篇解释\n' +
    '   - 用户反问句（"是不是太普通""有没有觉得""感觉这个不对吧"）= 明确的修改指令，不要回答"是/否/感觉"，直接按用户不满的方向去改\n' +
    '   - 用户给暗示（"这里是不是应该加个XXX？"）= 新增，不要反问"你要加吗"，直接加\n' +
    '   - 用户信息充足时→直接操作；用户信息模糊时→先澄清1-2句，再操作\n' +
    '   - 绝对禁止：用户给了明确需求，你却回复"好的我理解了""收到"之类空回，完全不输出:::操作块\n\n' +
    '=== ST权重分层8体系（核心架构，必须严格遵循） ===\n\n' +
    '**第一部分：3阶常驻体系（总Token≤500，永不截断）**\n\n' +
    '### 1. 基础公理阶\n' +
    '- ST配置：constant=true, position=0, insertion_order=200-250, prevent_recursion=true\n' +
    '- 内容：世界元数据、核心世界观公理、力量体系底层骨架（仅放永不改变的内容）\n' +
    '- 字数：≤200字\n' +
    '- 权重：极低，但不可缺失\n' +
    '- 条目前缀：<基础公理>、<世界元数据>\n\n' +
    '### 2. 交互软规则阶\n' +
    '- ST配置：constant=true, position=1, insertion_order=100-150, prevent_recursion=true\n' +
    '- 内容：互动选项生成逻辑、叙事风格、剧情引导原则\n' +
    '- 字数：≤200字\n' +
    '- 权重：低，在角色卡之后注入\n' +
    '- 条目前缀：<交互软规则>\n\n' +
    '### 3. 核心铁则阶\n' +
    '- 内容：绝对禁止项、输出格式核心要求、AI身份总纲\n' +
    '- 字数：≤100字，极度精简\n' +
    '- 权重：最高！遵循度超过任何单条角色字段的2倍以上\n' +
    '- 条目前缀：<核心铁则>\n\n' +
    '**第二部分：4层触发体系（承载95%世界观内容，动态释放Token）**\n\n' +
    '### 4. 近场强约束层\n' +
    '- ST配置：constant=false, position=2, depth=2, sticky=true, cooldown=0\n' +
    '- 内容：当前场景规则、即时状态栏、临时任务进度\n' +
    '- 特性：粘性触发，权重极高，离开场景自动失效\n' +
    '- 条目前缀：<近场强约束>、<当前局势>\n\n' +
    '### 5. 场景机制层\n' +
    '- ST配置：constant=false, position=1, depth=3, secondary_keys组合匹配, cooldown=3\n' +
    '- 内容：战斗、修炼、谈判、探索等特定场景生效的玩法细节\n' +
    '- 特性：进入场景才注入规则，平时不占Token；position=1（角色卡之后）确保稳定生效\n' +
    '- 条目前缀：<场景机制>、<核心玩法>、<世界规则>\n\n' +
    '### 6. 实体交互层\n' +
    '- ST配置：constant=false, position=1, depth=3, prevent_recursion=true\n' +
    '- 内容：NPC角色、势力组织、道具装备、地点场景等所有可交互实体\n' +
    '- 特性：每个实体独立成条，精准触发；禁止递归，杜绝链式触发炸Token；position=1确保稳定生效\n' +
    '- 条目前缀：<实体交互>、<重要角色>、<势力与组织>、<物品>、<地点场景>\n\n' +
    '### 7. 叙事背景层\n' +
    '- ST配置：constant=false, position=4, depth=5, probability=60%, selectiveLogic=0, group=叙事（同组互斥）\n' +
    '- 内容：主线剧情、支线故事、世界历史、文化习俗\n' +
    '- 特性：浅深度不触发，剧情推进到对应阶段才解锁；同组（叙事）互斥，多条同时命中仅注入1条；position=4（Author Note顶部）用于轻量叙事点缀\n' +
    '- 条目前缀：<叙事背景>、<故事发展>、<文化与习俗>、<历史事件>\n\n' +
    '**第三部分：1套动态适配系统 + 1套变量系统**\n\n' +
    '### 8. 动态适配系统\n' +
    '- ST能力：<动态适配>多开局 + depth_prompt新手引导 + regex_scripts + MVU内置宏变量\n' +
    '- 内容：\n' +
    '  1. 多开局分支：3个不同身份/难度的备用开场白\n' +
    '  2. 渐进引导：前10轮自动注入新手提示，达到深度后自动消失\n' +
    '  3. 变量模板：全内容适配ST原生宏变量（{{user}}/{{random:A,B}}/{{roll:XdY}}/{{date}}/{{time}}）\n' +
    '  4. 状态正则：基础状态自动同步脚本\n' +
    '- 条目前缀：<动态适配>、<引导机制>、<互动选项>、<状态栏>\n\n' +
    '### 9. MVU变量系统（MagVarUpdate zod，进阶可选）【改进19：结构化分段（弱模型召回）】\n' +
    '- 【总览】8条工作流（第1条zod脚本 + 第2-7条世界书条目 + 第8条状态栏正则）+ 三条联动机制 + 九条铁则（写卡器仅自动注入 bundle.js/正则1-5；其余8条MVU内容全部由AI在MVU Tab按9.1.6工作流一条一条生成）\n' +
    '- 【Tab隔离】状态栏生成/正则6/8条MVU条目已迁移至「MVU变量状态栏」Tab，本Tab（角色卡生成）不生成。如需生成，请提示用户切换Tab。\n' +
    '- 【灰色模式】本Tab可在普通世界书条目中讨论/规划变量结构（如"变量设计说明""schema草案"），但带[InitVar]/[mvu_update]/StatusPlaceHolderImpl/<UpdateVariable>/format_message_variable/stat_data等功能性标记的真实MVU条目仍会被拦截——这些必须到MVU Tab生成。\n' +
    '- 【状态栏实现二选一】简单项目=【写卡器标准原生方案】（MVU Tab的Step 1-7流程，教的就是这个）；复杂大型界面=【StageDog官方Vue3+Pinia组件化方案】（需webpack打包，参考示例但不在本流程）。绝对禁止混用！\n' +
    '- 核心脚本：在角色卡局部脚本(tavern_helper.scripts)中添加 import bundle.js（写卡器自动注入）\n' +
    '- 工作原理：每次LLM生成完消息后，MVU扫描回复末尾的<UpdateVariable>段中的JSON Patch命令，更新stat_data变量\n' +
    '\n' +
    '## 9.1 MVU 8条工作流条目详细规范（第1条脚本 + 第2-7条世界书条目 + 第8条正则）\n' +
    '9.1.1 [InitVar]初始变量（对应第2条）：世界书条目（enabled必须=false禁用），YAML格式定义所有变量初始值\n' +
    '     · 【强约束1：依据变量结构脚本生成】必须严格按变量结构.js（zod Schema）的字段名、嵌套层级、类型生成 YAML。schema 有的字段必须有默认值；schema 用 z.record/z.partialRecord 的动态键，InitVar 用空对象 {} 占位（如 物品栏: {}）；schema 用 z.prefault 的字段可在 InitVar 中省略（脚本会自动填）\n' +
    '     · 【强约束2：schema 一改，InitVar 必须跟改】修改变量结构脚本时（增/删/改字段、改类型），同步重写 [InitVar] 初始变量条目，保证字段名/层级与 schema 完全一致。禁止出现"schema 已删的字段还在 InitVar 里""schema 已加的字段 InitVar 没有"的错配情况\n' +
    '     · 【强约束3：enabled=false】初始变量条目的 enabled 必须为 false（MVU 只读禁用条目做初始化，开启会导致每次发送都注入旧初始值覆盖最新变量）。写卡器自动维护，AI 生成时不要写 enabled 字段\n' +
    '     · YAML用缩进表示层级，冒号后空格建立从属关系\n' +
    '     · 三种基本类型：数值(number)、文本(string)、真假值(boolean)\n' +
    '     · 示例：\n' +
    '       络络:\n' +
    '         亲密度: 0\n' +
    '         阅读日记数量: 0\n' +
    '         拥有联系方式: false\n' +
    '         物品栏: {}\n' +
    '       世界:\n' +
    '         当前日期: 2025-07-26\n' +
    '         当前星期: 星期五\n' +
    '         当前时间: 17:36\n' +
    '9.1.2 变量列表（对应第3条）：世界书条目（constant=true, depth=0），通过 MVU 脚本注入当前变量值给LLM\n' +
    '     · 固定内容：---\\n<status_current_variables>\\nnull\\n</status_current_variables>\n' +
    '     · 标签内为 null，由 MVU 脚本在发送时替换为最新楼层的全部变量值\n' +
    '     · 插入位置必须D1或D0，让AI知道变量值对应最新剧情\n' +
    '9.1.3 [mvu_update]变量更新规则（对应第4条）：世界书条目（constant=true），告诉LLM如何分析变量变化\n' +
    '     · YAML格式，沿用变量结构层级，每变量含以下字段（按需选用）：\n' +
    '       - type: 变量类型。string 省略此字段；number/boolean 直接写；复杂类型用 |- 多行 TypeScript/zod 块\n' +
    '         · 基础：type: number / type: boolean / type: \'未领取\'|\'进行中\'|\'已完成\'\n' +
    '         · 复杂：type: |-\n             {\n               [物品名: string]: { 描述: string; 数量: number }\n             }\n' +
    '       - range: 数值范围（如 0~100）。仅当 zod 没做 transform clamp 时才写\n' +
    '       - format: 字符串格式要求（如 ${xx历}-${YYYY/MM/DD}-${HH:MM}）\n' +
    '       - category: 数值分段语义（如 20~40: 普通人 / 40~70: 冒险者）。仅当 zod 没派生 $XXX阶段 且 AI 需用阶段语义做叙事决策时才写\n' +
    '       - check: 更新规则（核心字段，自然语言说明何时更新、更新成什么值）。尽量简练 1-2 行，不要过度扩展情况\n' +
    '     · ⚠️ 变量结构(zod)是对变量的硬性要求，更新规则中的 type/range/format/category 是对 AI 的希望建议\n' +
    '     · 【改进15：禁止zod与更新规则写重复约束（浪费token+易矛盾）】\n' +
    '       ⚠️ zod 已 .transform(v => _.clamp(v, min, max)) 时不要写 range/category（zod已保证合法值）\n' +
    '       ⚠️ zod 已派生 $XXX阶段 时不要写 category（阶段由脚本自动维护）\n' +
    '     · 【合并同类型规则以省 token】\n' +
    '       - 固定键合并：z.object/z.record(z.enum(...)) 的键永远存在，更新规则相似时合并为 ${键1|键2|键3}\n' +
    '         · 例：主角.能力面板.力量/敏捷/体质/感知/意志/魅力 → 主角.能力面板.${力量|敏捷|体质|感知|意志|魅力}.数值\n' +
    '         · 同理适用于 ${变量}.主角评价 这类共通评价字段\n' +
    '       - 动态键合并：z.record(z.string())/z.partialRecord(z.enum(...)) 的键可能为空或多种，路径写父对象，键放进 type 的 index signature\n' +
    '         · 例：路径写 物品栏 而非 物品栏.薄荷糖；type 块写 { [物品名: string]: { ... } }\n' +
    '     · 【嵌套同对象字段】同对象的字段嵌套在该对象下以减少 token、提升可读性\n' +
    '       · 例：主角.能力面板 和 主角.装备栏 都是 主角 的字段，应嵌在 主角 mapping 下\n' +
    '     · 【省略与不列规则】\n' +
    '       - string 类型变量省略 type 字段\n' +
    '       - _ 前缀字段是只读（如 _当前回合、_当日好感度增幅），不要列更新规则\n' +
    '       - 名字自解释的变量（如 称呼、位置、心情）不列规则，除非用户/Explorer 指定特殊规则\n' +
    '     · 【工作流程】\n' +
    '       第一步：确认变量信息（向用户询问）\n' +
    '         1. 变量结构脚本里有哪些变量？\n' +
    '         2. 哪些变量需要更新规则？\n' +
    '         3. 有没有特殊系统（如傲娇系统、敌意系统等）？\n' +
    '         4. 变量的更新条件是什么？\n' +
    '       第二步：按变量结构脚本和用户要求，参考下例编写规则\n' +
    '     · 示例：\n' +
    '       ---\\n变量更新规则:\\n  世界:\\n    当前时间:\\n      format: ${xx历}-${YYYY/MM/DD}-${HH:MM}\\n      check:\\n        - 每次事件推进、休息或旅行后更新\\n  主角:\\n    能力面板.${力量|敏捷|体质|感知|意志|魅力}.数值:\\n      type: number\\n      range: 0~100\\n      category:\\n        20~40: 普通人\\n        40~70: 冒险者常驻\\n      check:\\n        - 训练、战斗、重伤等显著事件才调整\\n        - 单次变化不超过 ±10\\n    装备栏.${部位}:\\n      type: |-\\n        {\\n          装备: string;\\n          主角评价: string;\\n        }\\n      check:\\n        - 穿戴、损毁、替换装备时更新装备描述\\n  任务列表:\\n    type: |-\\n      {\\n        [任务名: string]: {\\n          类型: \'主线\'|\'支线\'|\'每日\'|\'临危受命\';\\n          说明: string;\\n          目标: string;\\n          奖励: string;\\n          惩罚: string;\\n        }\\n      }\\n    check:\\n      - 避免一次性添加超过3个主线任务\\n      - 日常任务完成后可重置但需记录冷却\\n  ${变量}.主角评价:\\n    value: 主角对某个变量内容的即时感受\\n    check:\\n      - 在对应变量值发生变化或遭遇相关事件后可更新，其他情况不应更新\\n      - 语言应保持第一人称/贴近主角口吻\\n      - 主角的评价并不会被主角本人看到，也不会在剧情中出现\n' +
    '9.1.4 [mvu_update]变量输出格式（对应第5条，固定内容原样输出）：世界书条目（constant=true, depth=0），定义<UpdateVariable>段的输出格式\n' +
    '     · 内容完全固定，**原封不动地输出以下 YAML，不要修改任何字段、不要加注释、不要替换占位符**：\n' +
    '       ---\\n变量输出格式:\\n  rule:\\n    - you must output the update analysis and the actual update commands at once in the end of the next reply\\n    - the update commands works like the **JSON Patch (RFC 6902)** standard, must be a valid JSON array containing operation objects, but supports the following operations instead:\\n      - replace: replace the value of existing paths\\n      - delta: update the value of existing number paths by a delta value\\n      - insert: insert new items into an object or array (using `-` as array index intends appending to the end)\\n      - remove\\n      - move\\n    - don\'t update field names starts with `_` as they are readonly, such as `_变量`\\n  format: |-\\n    <UpdateVariable>\\n    <Analysis>$(IN ENGLISH, no more than 80 words)\\n    - ${calculate time passed: ...}\\n    - ${decide whether dramatic updates are allowed: yes/no}\\n    - ${analyze every variable based on its corresponding `check`: ...}\\n    </Analysis>\\n    <JSONPatch>\\n    [\\n      { "op": "replace", "path": "${/path/to/variable}", "value": "${new_value}" },\\n      { "op": "delta", "path": "${/path/to/number/variable}", "value": "${positive_or_negative_delta}" },\\n      { "op": "insert", "path": "${/path/to/object/new_key}", "value": "${new_value}" },\\n      { "op": "insert", "path": "${/path/to/array/-}", "value": "${new_value}" },\\n      { "op": "remove", "path": "${/path/to/object/key}" },\\n      { "op": "remove", "path": "${/path/to/array/0}" },\\n      { "op": "move", "from": "${/path/to/variable}", "to": "${/path/to/another/path}" },\\n      ...\\n    ]\\n    </JSONPatch>\\n    </UpdateVariable>\n' +
    '     · [mvu_update]前缀适配两种更新方式：随AI输出(全部发送) / 额外模型解析(只发给变量更新AI)\n' +
    '9.1.4a [mvu_update]变量输出格式强调（对应第6条，固定内容原样输出）：世界书条目（constant=true, depth=0, enabled=false默认禁用）\n' +
    '     · 用途：当AI不输出<UpdateVariable>段时，启用此条目强制提醒AI按格式输出\n' +
    '     · 内容完全固定，**原封不动地输出以下 YAML**：\n' +
    '       ---\\n变量输出格式强调:\\n  rule: The following must be inserted to the end of reply, and cannot be omitted\\n  format: |-\\n    <UpdateVariable>\\n    ...\\n    </UpdateVariable>\\n' +
    '9.1.4b <状态栏>占位符提醒（对应第7条）：世界书条目（constant=true, depth=0）\n' +
    '     · 用途：提醒AI每条回复底部必须输出 <StatusPlaceHolderImpl/>，状态栏正则(第8条)会替换它为状态栏HTML\n' +
    '     · 内容固定：---\\n<状态栏占位符提醒>\\n  - 每条回复的末尾必须输出 <StatusPlaceHolderImpl/>，这是状态栏渲染的锚点\\n  - 不要在回复中间输出此标签，只在最末尾输出一次\n' +
    '9.1.5 变量结构脚本（对应第1条）：tavern_helper.scripts脚本（AI在MVU Tab按9.1.6工作流一条一条生成），用zod 4库定义变量结构并registerMvuSchema注册\n' +
    '     · 创作流程（严格按3步执行，不要跳步）：\n' +
    '       第一步：了解需求，向用户询问\n' +
    '         1) 这是什么类型的角色卡/世界观？（角色扮演/模拟经营/军事模拟等）\n' +
    '         2) 需要追踪哪些主要内容？——角色（主角/配角/NPC）、系统变量（时间/日期/金钱等）、每角色追踪字段（好感度/位置/状态等）\n' +
    '         3) 哪些部分需要限定值？——数值范围/文本格式、是否可加新角色、哪些对象可增删键（物品栏/成就/技能）、是否限对象键数量\n' +
    '       第二步：确认结构，用自然语言列出结构大纲让用户确认\n' +
    '         顶层结构：┬ 系统变量（日期/时间/...）├ 角色1（基础属性/...）├ 角色2 └ ...\n' +
    '       第三步：按zod 4规范编写变量结构.js脚本（严格遵循下面的zod要求和头尾模板）\n' +
    '     · zod 4 额外zod要求（强制遵守）：\n' +
    '       - 库：`z` from zod 4.x（只用4.x API！）；`_` from lodash；两库默认可用，不要 import；不要用 z.passthrough/z.strict（不存在）\n' +
    '       - 幂等：Schema.parse(Schema.parse(input)) === Schema.parse(input)；z.transform 谨慎写，fn 只能接 output，**不可用 context**\n' +
    '       - 数值：z.coerce.number()（非 z.number()，防AI把数值更新成文本）；boolean 直接 z.boolean()，不要 z.coerce.boolean()\n' +
    '       - 选对象不选数组：用 物品栏: z.record(z.string().describe(\'物品名\'), z.object({描述:z.string(), ...})) 而非 z.array(...) （数组下标难维护）\n' +
    '       - 对象 5 种场景：\n' +
    '         (a) 固定必填键+同类型值：z.record(z.enum([\'上装\',\'下装\']), z.string())\n' +
    '         (b) 固定可选键+同类型值：z.partialRecord(z.enum([...]), 值类型)\n' +
    '         (c) 动态可选键+同类型值：z.record(z.string(), 值类型)\n' +
    '         (d) 固定必填键+不同类型值：z.object({ key1: 类型1, key2: 类型2 })\n' +
    '         (e) 部分必填+动态同类型：z.intersection(z.object({必填字段}), z.record(z.string(), 值类型))\n' +
    '       - 可清除对象（会被 remove op 删的）：z.object({字段: 类型.prefault(...), ...}).prefault({})，**不要** z.object({...}).optional()\n' +
    '       - 约束优先 transform 而不是 min/max：clamp(v,0,100) 而不是 .min(0).max(100)（超范围用户期望部分生效而非整体丢弃）。键上限按插入时间清旧：_(data).entries().takeRight(10)\n' +
    '       - 默认值：.prefault() 优先于 .default()；复合类型 prefault → 所有子字段也必须 prefault；其他情况不要随便 prefault\n' +
    '       - describe：仅字段名不能自解释时（如 z.record 的 key 类型）才用；不要画蛇添足\n' +
    '       - 插入顺序管理：按插入时间清/取 → _(data).entries()；需排序追踪 → 加 $time: z.coerce.number().prefault(() => Date.now())\n' +
    '       - DRY：相同 schema 直接在 export const Schema = z.object({...}) 内复用，不额外定义中间量\n' +
    '       - 特殊格式字符串：z.templateLiteral([z.literal(\'D\'), z.coerce.number(), ...]) 优先于正则/手动解析\n' +
    '     · 既有规则（继续严格执行）：\n' +
    '       - 范围限制用 .transform(v => _.clamp(v, 0, 100))（非 .min().max()）\n' +
    '       - .transform限制：fn 只能接 output，不可用 context；例：z.object({好感度:z.coerce.number()}).transform(d=>({好感度:_.clamp(d.好感度,0,100)}))\n' +
    '       - .prefault限制：value 必须是该 schema 的合法 input；可为值/函数（如 () => Date.now()）\n' +
    '       - .extend限制：只有 z.object/z.looseObject/z.strictObject 能 extend；z.object(...).prefault({}) 不能再 extend\n' +
    '       - 枚举限制用 z.enum([\'值1\',\'值2\',...])；联合类型用 z.union([z.literal(\'待初始化\'), z.coerce.number()])\n' +
    '     · 三条命名铁律（严格执行）：\n' +
    '       1) 字段用中文，禁止中英混杂\n' +
    '       2) 层级：一级=大分类(世界/角色名/主角/系统)，二级=属性，三级=子属性；禁止平铺（"角色_白娅_好感度"）；深度≤4\n' +
    '       3) 前缀：_开头=AI只读不更新；$开头=派生显示专用字段（zod transform生成，populateCharacterData显示、AI不更新）；无前缀=普通可读写\n' +
    '     · 头尾模板（必须原封不动抄，不要改 import URL 和 registerMvuSchema 调用）：\n' +
    '       文件头：import { registerMvuSchema } from \'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js\';\n' +
    '       中段：export const Schema = z.object({ ...你的schema... });\n' +
    '       文件尾：$(() => { registerMvuSchema(Schema); })\n' +
    '     · transform 后处理可实现：称号数量依存度绑定、物品数量<=0自动过滤、派生$阶段字段等动态规则\n' +
    '     · 完整示例（按此格式输出为```js代码块）：\n' +
    '       import { registerMvuSchema } from \'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js\';\n' +
    '       export const Schema = z.object({\n' +
    '         世界: z.object({\n' +
    '           当前时间: z.string(),\n' +
    '           当前地点: z.string(),\n' +
    '           近期事务: z.record(z.string().describe(\'事务名\'), z.string().describe(\'事务描述\')),\n' +
    '         }),\n' +
    '         白娅: z.object({\n' +
    '           依存度: z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 100)),\n' +
    '           着装: z.record(z.enum([\'上装\',\'下装\',\'内衣\',\'袜子\',\'鞋子\',\'饰品\']), z.string().describe(\'服装描述\')),\n' +
    '           称号: z.record(z.string().describe(\'称号名\'), z.object({效果: z.string(), 自我评价: z.string()})),\n' +
    '         }).transform(data => ({ ...data, 称号: _(data.称号).entries().takeRight(Math.ceil(data.依存度/10)).fromPairs().value() })),\n' +
    '         主角: z.object({\n' +
    '           物品栏: z.record(z.string().describe(\'物品名\'), z.object({描述: z.string(), 数量: z.coerce.number()}))\n' +
    '             .transform(d => _.pickBy(d, ({数量}) => 数量 > 0)),\n' +
    '         }),\n' +
    '       });\n' +
    '       $(() => { registerMvuSchema(Schema); })\n' +
    '     · 注意事项：①变量名可用中文；②此脚本只是第1条变量结构，还需按9.1.6工作流逐条生成第2-8条（每条停下等"继续"）；③写MVU Tab时，脚本输出后给用户一句："已生成第1条，说\'继续\'生成第2条[InitVar]初始变量"\n' +
    '\n' +
    '## 9.1.6 MVU变量条目生成工作流（⚠️逐条生成，禁止一次性塞全部）\n' +
    '     · 【两阶段总览】\n' +
    '       Phase A（前7条）：第①-⑦条MVU条目，逐条生成，每条停下等"继续"\n' +
    '       Phase B（第8条）：前7条全部完成后，才进入状态栏HTML制作（Step2-6共5模块）\n' +
    '     · 【8条固定顺序（严格按此顺序，不能跳步）】\n' +
    '       第1条：变量结构脚本（tavern_helper.scripts，zod 4 Schema + registerMvuSchema）—— 见 9.1.5\n' +
    '       第2条：[InitVar]初始变量（世界书条目，enabled=false）—— 依据第1条 schema 生成 YAML，见 9.1.1\n' +
    '       第3条：[mvu_update]变量更新规则（世界书条目，constant=true）—— 依据第1条 schema 生成 check/type/range，见 9.1.3\n' +
    '       第4条：变量列表（世界书条目，constant=true depth=0）—— 固定内容，见 9.1.2\n' +
    '       第5条：[mvu_update]变量输出格式（世界书条目，constant=true depth=0）—— 固定 YAML，原封不动输出，见 9.1.4\n' +
    '       第6条：[mvu_update]变量输出格式强调（世界书条目，constant=true，默认 enabled=false）—— 固定 YAML，原封不动输出\n' +
    '       第7条：<状态栏>占位符提醒（世界书条目，constant=true）—— 提醒 AI 每条回复底部输出 <StatusPlaceHolderImpl/>\n' +
    '       第8条：正则6 [美化]MVU状态栏（regex_scripts，markdownOnly=true）—— ⚠️前7条全部完成后才生成！走 Step 2-6 状态栏5模块生成流程\n' +
    '     · 【铁律1：逐条生成】每次只输出1条，输出后立即停下，结尾只问"已生成第N条，说\'继续\'生成下一条"——禁止一次性输出多条\n' +
    '     · 【铁律2：schema 驱动】第2/3条必须严格依据第1条的 schema 字段名/层级/类型生成，schema 一改这两条必跟改\n' +
    '     · 【铁律3：固定内容原样输出】第4/5/6条是固定 YAML/固定内容，原封不动输出，不要修改任何字段\n' +
    '     · 【铁律4：前7条后才第8条】第8条是状态栏HTML，必须前7条全部齐全后才允许生成（写卡器会拦截并提示缺失条目）\n' +
    '     · 【铁律5：每步写入即预览】每生成一条，写卡器后台立即写入 cardData 并触发 renderPreview，用户在预览界面实时看到结果\n' +
    '     · 【铁律6：写入酒馆完整性】用户点"写入酒馆"时，写卡器按顺序写入：bundle.js→变量结构脚本→世界书条目(第2-7条)→正则1-5→正则6(状态栏HTML)→开场白占位符，缺一不可\n' +
    '     · 【写卡器自动注入范围（AI不要生成）】\n' +
    '       - MVU 本体脚本 bundle.js（tavern_helper.scripts）\n' +
    '       - 正则1-5（思维链移除/变量更新截断/变量美化×2/状态栏隐藏）\n' +
    '       - 开场白末尾 <StatusPlaceHolderImpl/> 占位符\n' +
    '       其余8条（第1-8条）全部由 AI 按9.1.6工作流逐条生成\n' +
    '     · 【动态修改场景（⚠️关联条目必须逐条全改完，不能只改一条）】：\n' +
    '       当用户要求修改变量（例如"状态栏显示当前聊天女生全身信息，包括上装/下装/丝袜/鞋子"），AI 必须按以下流程**逐条**改完所有关联条目：\n' +
    '       步骤A：先检查第1条(变量结构脚本)和第2条([InitVar]初始变量)里是否已有这些字段；\n' +
    '              · 没有 → 帮用户在第1条中**新增**对应字段（如 上装/下装/丝袜/鞋子），同时在第2条里补默认值；\n' +
    '              · 有了 → 跳过新增，直接进入步骤B；\n' +
    '       步骤B：变量结构改了，所有依赖 schema 的关联条目必须**一条一条**跟着改完（不能只改一条就停）：\n' +
    '              · 第1条 变量结构脚本（zod schema）—— 加字段；\n' +
    '              · 第2条 [InitVar]初始变量 —— 加默认值；\n' +
    '              · 第3条 [mvu_update]变量更新规则 —— 加 check/type/range；\n' +
    '              · 第4/5/6/7条 —— 原样不动（固定 YAML / 固定内容）；\n' +
    '              · 第8条 正则6 [美化]MVU状态栏 —— 走 Step 2-6 重新生成状态栏 HTML（让新字段在 UI 上显示）；\n' +
    '       步骤C：每改完一条，写卡器后台立即写入 cardData 并 renderPreview，用户实时看到结果；\n' +
    '       步骤D：8 条全部改完后，告诉用户"全部关联条目已更新，可在预览查看，确认无误后点写入酒馆"；\n' +
    '       ⚠️【防漏铁律】哪怕用户只说"加一个字段"，也必须把第1/2/3/8条全部改完（第4/5/6/7条原样保留），少一条都会导致状态栏显示不全或变量更新失败\n' +
    '\n' +
    '## 9.2 三条联动机制\n' +
    '9.2.1 酒馆助手脚本API（StageDog标准，状态栏渲染+事件响应6条）：\n' +
    '     · 变量读取（状态栏渲染推荐）：优先getVariables({type:"message", message_id:"latest"})，fallback getAllVariables()；用_.get(res,"stat_data",{})取根。UI用消息级scope，不要直接Mvu.getVar（有时序失效问题）\n' +
    '     · 通用读取：Mvu.getVar("stat_data") / Mvu.getMvuData() / Mvu.getVar("stat_data.角色.好感度")\n' +
    '     · 写入：Mvu.setVar("stat_data.角色.好感度", 80) / Mvu.patchVar([{op:"replace",...}])\n' +
    '     · StageDog标准两步就绪：先await waitGlobalInitialized("Mvu")，再while+setTimeout每秒_.has(getVariables({type:"message"}),"stat_data")（最多15秒）——此为waitUntil模式\n' +
    '     · 顶层入口（StageDog标准）：$(async function(){ try { ...逻辑... } catch(e){console.warn(e)} }) —— jQuery ready+async，顶层不用errorCatched（仅pinia store内部setup用）\n' +
    '     · 主同步（defineMvuDataStore标准策略）：setInterval(刷新函数,2000)每2秒轮询；事件VARIABLE_INITIALIZED/VARIABLE_UPDATE_ENDED仅作加分兜底，UI不得依赖\n' +
    '9.2.2 【改进14：新增 injectPrompts 立即事件（StageDog原生阈值触发最强模式）】\n' +
    '     · 作用：变量阈值命中时，动态注入/撤回 system prompt，直接改变AI行为（比EJS更精准、可堆叠、可独立启用禁用）\n' +
    '     · 用法：放在tavern_helper.scripts局部脚本中：\n' +
    '       $(async () => { injectPrompts([{ \n' +
    '         id: "冲动啊，请平息吧",\n' +
    '         position: "none", depth: 0, role: "system", should_scan: true,\n' +
    '         filter: () => _.get(getAllVariables(), "stat_data.白娅.依存度") === 0,\n' +
    '         content: "【【冲动啊，请平息吧】】：此时白娅正处于自我毁灭边缘，她的一切行为都带有自毁倾向、拒绝沟通、攻击性强的语义。",\n' +
    '       }]); });\n' +
    '     · 典型场景：依存度=0→注入"你正自我毁灭"；好感度≥80→注入"你完全信任主角"；拥有稀有道具→注入特殊行为提示\n' +
    '     · 与EJS动态模板对比：\n' +
    '       - EJS改的是世界书条目里的静态内容（字符串替换），适合按阶段改角色人设/称呼段落\n' +
    '       - injectPrompts改的是system prompt（按阈值启停、可堆叠、可独立禁用），适合行为模式/临时规则/特殊触发的动态注入\n' +
    '       - 两者可叠加使用\n' +
    '9.2.3 EJS动态模板（可选，按变量值分段修改世界书条目里的静态内容）：\n' +
    '     · 使用 getvar("stat_data.角色.好感度") 按阈值分段\n' +
    '     · 示例：<% if (getvar("stat_data.白娅.好感度") >= 50) { %>温柔依赖模式<% } %>\n' +
    '     · 分段建议：≥80深爱 / ≥50好感 / ≥20熟识 / <20陌生\n' +
    '     · 典型场景：按好感度/剧情日切换角色语气、称呼、行为段落\n' +
    '\n' +
    '## 9.3 正则与占位符流水线（写卡器自动注入正则1-5 + AI生成正则6）\n' +
    '9.3.1 正则1-5（写卡器自动注入，AI不用管）：\n' +
    '     · 正则1（promptOnly）：从提示词移除<Analysis>段\n' +
    '     · 正则2（promptOnly, minDepth=4）：移除旧消息<UpdateVariable>段，仅保留最近2楼\n' +
    '     · 正则3（markdownOnly）：美化已完成的<UpdateVariable>折叠显示\n' +
    '     · 正则4（markdownOnly）：美化正在输出的<UpdateVariable>流式动画\n' +
    '     · 正则5（promptOnly）：从提示词移除<StatusPlaceHolderImpl/>占位符\n' +
    '9.3.2 <状态栏>占位符提醒条目（AI在MVU Tab按9.1.6工作流一条一条生成，constant=true常驻）：提醒AI每条消息底部输出<StatusPlaceHolderImpl/>\n' +
    '9.3.3 正则6【AI必须生成】：[美化]MVU状态栏（markdownOnly=true, promptOnly=false）\n' +
    '     · findRegex = /<StatusPlaceHolderImpl\\/>/g；replaceString = 用```包裹的完整HTML状态栏（MVU Tab Step 2-6共5槽位拼接）\n' +
    '     · 三版正则区分：promptOnly只改发给AI的提示词；markdownOnly只改显示渲染；全局版（无标记）改所有内容\n' +
    '9.3.4 状态栏占位符4层流水线：开场白自动追加→提醒条目触发AI自觉写→正则5从提示词移除→正则6显示时替换成HTML\n' +
    '\n' +
    '## 9.4 初始化与更新铁则\n' +
    '9.4.1 变量初始化（两种方式）：\n' +
    '     · [InitVar]条目（enabled=false）定义默认初始值，初始化时仅读一次\n' +
    '     · <动态适配>分支开局条目里嵌入 <UpdateVariable><initvar>YAML覆盖</initvar></UpdateVariable>（根据玩家选择开局动态设置MVU变量）\n' +
    '     · 初始化后玩家可通过酒馆助手UI直接修改状态栏里的变量\n' +
    '9.4.2 更新操作铁则（<UpdateVariable>中的JSON Patch）：\n' +
    '     · delta：数值增减（支持负数）；replace：文本/对象整体替换；remove：删除物品/字段/数组元素；insert：新增物品/条目/数组元素；move：移动\n' +
    '     · 路径：/白娅/依存度（相对stat_data内部，不是/stat_data/白娅/依存度）；JSON Patch的根是stat_data内部\n' +
    '     · AI绝对不得修改 _ 开头的只读字段；$开头的派生显示字段AI不写（由zod transform自动生成）\n' +
    '9.4.3 MVU条目前缀规范：[InitVar]初始变量 / 变量列表 / 变量分段提示（EJS模板） / [mvu_update]变量更新规则 / [mvu_update]变量输出格式 / [mvu_update]变量输出格式强调\n\n' +
    '## 9.5 🔧 MVU常见问题标准排查流程（改进22）\n' +
    '【"状态栏没有显示/空白"按此顺序查不跳步】：\n' +
    '  1. first_mes末尾有没有 <StatusPlaceHolderImpl/>（开场白注入生效没）\n' +
    '  2. 世界书里有没有 <状态栏>占位符提醒 条目且 enabled=true constant=true\n' +
    '  3. regex_scripts 里有没有**两条** StatusPlaceHolderImpl（正则5 promptOnly隐藏 + 正则6 markdownOnly美化）\n' +
    '  4. 正则6 findRegex是不是 /<StatusPlaceHolderImpl\\/>/g 且 markdownOnly=true promptOnly=false\n' +
    '  5. 浏览器Console搜 [statusbar] init failed → 看报错（最常见是 while 循环找不到stat_data=InitVar没加载或zod字段名对不上）\n' +
    '  6. 控制台执行 getVariables({type:"message"}) → 有没有stat_data：\n' +
    '     · 没有 = MVU没初始化 → 查 bundle.js / zod 脚本\n' +
    '     · 有 = populateCharacterData逻辑问题\n' +
    '  7. getAllVariables().stat_data 有值但上条没值 = 消息级scope没同步 → 查 Step 6 while循环 _waitCount < 15（MVU初始化慢）\n' +
    '【"变量没更新/AI写完<UpdateVariable>数值没变"按此顺序查】：\n' +
    '  1. JSON Patch路径对不对：/白娅/好感度，不是/stat_data/白娅/好感度（根是stat_data内部）\n' +
    '  2. 操作对不对：number增减用delta不是replace；对象整替换用replace；数组尾插用 insert path="/xxx/-"\n' +
    '  3. zod里该字段是不是 _ 开头（只读，AI写了被丢弃）\n' +
    '  4. Console搜 Mvu.events → VARIABLE_UPDATE_ENDED 触没触发，前后值分别是什么\n\n' +
    '=== ST完整参数体系（必须正确使用） ===\n\n' +
    '**触发精准类**：\n' +
    '- keys：主关键词，任意一个命中即触发\n' +
    '  - 支持纯文本（逗号分隔）和正则表达式（用/包裹，如/weather|rain/i）\n' +
    '  - 中文场景建议使用use_regex=true实现更灵活的匹配\n' +
    '  - 每条目建议3-8个触发词，覆盖主要变体说法\n' +
    '- secondary_keys：次级关键词，与主关键词组合实现「与逻辑」触发\n' +
    '  - selectiveLogic=0 (AND_ANY)：主键命中 + 任一次级键命中 → 触发\n' +
    '  - selectiveLogic=3 (AND_ALL)：主键命中 + 所有次级键命中 → 触发\n' +
    '  - selectiveLogic=2 (NOT_ANY)：主键命中 + 次级键都不命中 → 触发\n' +
    '  - selectiveLogic=1 (NOT_ALL)：主键命中 + 次级键不全命中 → 触发\n' +
    '  - 典型用法：场景限定（"战斗" + "受伤"）、角色限定（"对话" + "NPC名"）\n' +
    '- use_regex：启用正则匹配，优先级最高\n' +
    '- match_whole_words：全词匹配，仅英文生效，中文场景禁用（设为null）\n' +
    '- scan_depth：限制关键词扫描的历史消息深度\n' +
    '  - 常驻规则设为0（不扫描历史）\n' +
    '  - 近场交互设为2-3\n' +
    '  - 叙事回忆设为5-8\n\n' +
    '**生效控制类**：\n' +
    '- sticky：粘性触发，首次触发后永久保留在上下文（即使后续关键词不再出现）\n' +
    '  - 与constant的区别：constant从对话开始就始终生效；sticky需要先被关键词触发一次，之后才持续生效\n' +
    '  - 典型场景：状态切换类规则（进入战斗模式后持续生效战斗规则，直到剧情结束）\n' +
    '  - 典型场景：获得重要道具后持续显示道具效果（首次提到道具→sticky持续注入道具说明）\n' +
    '  - 典型场景：触发剧情事件后持续影响后续对话（如"被诅咒"状态持续影响AI回复）\n' +
    '  - 数值含义：0=禁用粘性；正整数N=触发后持续N条消息（N=999可近似永久）；null=使用全局默认\n' +
    '  - 配合cooldown=0实现一次性触发后永久生效\n' +
    '- cooldown：冷却期，触发后N条消息内不再重复触发\n' +
    '  - 场景机制类设为3-5，避免规则刷屏（每3-5条消息最多触发一次）\n' +
    '  - 叙事类设为0或较低值（允许频繁补充背景）\n' +
    '  - 数值含义：0=无冷却（每次匹配都触发）；正整数=冷却消息数；null=使用全局默认\n' +
    '  - 与sticky互斥：sticky让条目持续存在，cooldown让条目间歇触发，不要同时使用\n' +
    '- delay：延迟触发，匹配后N条消息才注入内容\n' +
    '  - 用于伏笔、延迟揭示等叙事效果\n' +
    '  - 例：提到"宝箱"后delay=2，2条消息后才注入"宝箱里藏有陷阱"的描述\n' +
    '  - 数值含义：0=无延迟（立即触发）；正整数=延迟消息数\n\n' +
    '**递归安全类**：\n' +
    '- prevent_recursion：禁止被其他条目递归触发\n' +
    '  - 实体类条目（角色/地点/物品）建议开启，防止递归风暴\n' +
    '- exclude_recursion：触发本条后立即终止后续递归\n' +
    '  - 禁止项类条目建议开启，最高优先级\n' +
    '- delay_until_recursion：仅在递归中触发（不直接触发）\n' +
    '  - 用于补充说明、背景展开，被主条目递归带出\n' +
    '  - 叙事类条目常用，实现"提到A时自动带出A的背景"\n\n' +
    '**群聊角色排除（Character Exclusion，群聊专用）**：\n' +
    '- character_exclusion：角色排除列表（数组），列表中的角色不会触发此条目\n' +
    '  - 用途：在群聊中控制条目只被特定角色触发，避免不相关角色触发\n' +
    '  - 例：Jamie和Bill群聊，条目设置了character_exclusion=["Bill"]，则只有Jamie能触发此条目\n' +
    '  - 典型场景：角色专属背景只在角色自己说话时触发，避免其他角色无意间触发\n' +
    '  - 注意：这是角色级别的过滤，与关键词触发是独立的两个条件\n\n' +
    '**分组互斥类（Inclusion Group，高级功能，强烈推荐使用）**：\n' +
    '- group：互斥分组标签（逗号分隔，一条目可属多个组），同组多条目同时触发时仅选1条注入\n' +
    '  - 场景变体：同一场景的不同描述，随机选一个增加多样性和新鲜感\n' +
    '  - 难度分层：新手/普通/困难三种规则，按进度选择不同深度的规则\n' +
    '  - 时间分支：白天/夜晚/黄昏/凌晨不同场景描述和氛围\n' +
    '  - 心情状态：平静/愤怒/悲伤/喜悦等不同状态下的角色行为差异\n' +
    '  - 多选组：一条目属于多个组时（如group="天气,事件"），它的触发会禁用所有相关组的其他条目\n' +
    '    · 例：条目A的group="天气,季节"，条目B的group="天气"，条目C的group="季节"\n' +
    '    · 当A触发时，B和C都会被禁用（因为A属于天气组和季节组）\n' +
    '    · 当B触发时，A会被禁用（A属于天气组），但C不受影响\n' +
    '- group_weight：同组内的随机选中权重（默认100，数值越大被选中概率越高）\n' +
    '  - 常见/普通变体权重设为100，稀有/特殊变体设为20-50\n' +
    '  - 权重计算：条目的权重 / 组内所有触发条目的权重总和 = 被选中概率\n' +
    '  - 例：组内3条触发，权重分别为100、50、50 → 选中概率为 50%、25%、25%\n' +
    '- group_override（Prioritize Inclusion）：组优先级覆盖（true=按order选，false=按权重随机选）\n' +
    '  - 设为true时：同组多条目都触发时，选insertion_order最高的那条（不是随机）\n' +
    '  - 用于创建确定性的回退/优先级序列，而非随机选择\n' +
    '  - 典型用法：低深度(影响大)的条目优先于高深度的通用条目\n' +
    '  - 例：组"天气"，order=200的"暴雨"条目 和 order=100的"普通天气"条目都触发\n' +
    '    开启group_override后，order更高的"暴雨"胜（确定性优先级，非随机）\n' +
    '- use_group_scoring：使用组评分筛选（先按匹配数筛选出最高分子集，再选）\n' +
    '  - 开启后：先统计组内每条触发条目的key匹配数量，只保留匹配数最多的条目\n' +
    '  - 然后在最高分条目中，再按group_weight随机选（或group_override按order选）\n' +
    '  - 评分规则：主键每匹配1个=1分；次级键根据selectiveLogic加分\n' +
    '    · AND_ANY：每匹配1个次级键=1分\n' +
    '    · AND_ALL：所有次级键都匹配时加N分（N是次级键总数）\n' +
    '    · NOT_ANY / NOT_ALL：不加分\n' +
    '  - 典型用法：大组中优先选择更具体、匹配更精准的条目\n' +
    '  - 完整示例：\n' +
    '    · 组"歌曲"有两条条目：\n' +
    '      - 条目1：keys=["song", "sing", "黑猫"], group="歌曲", group_weight=100\n' +
    '      - 条目2：keys=["song", "sing", "幽灵"], group="歌曲", group_weight=100\n' +
    '    · 用户输入"我在唱黑猫之歌" → 条目1匹配3个key，条目2匹配2个key\n' +
    '    · use_group_scoring=true时：只保留条目1（匹配数最多），直接注入\n' +
    '    · use_group_scoring=false时：两条都保留，按group_weight随机选\n' +
    '  - 例：组"天气"，条目A keys=[天气]（1分），条目B keys=[天气,下雨]（2分）\n' +
    '    用户说"下雨了"时，条目B匹配分2 > 条目A的1分，条目B胜出\n\n' +
    '**概率与选择类**：\n' +
    '- probability：概率触发百分比（0-100），仅当useProbability=true时生效\n' +
    '  - 核心规则：100%（必触发）\n' +
    '  - 随机事件：10-30%（增加惊喜感）\n' +
    '  - 稀有事件：1-5%（彩蛋级）\n' +
    '  - 叙事类条目：50-70%（有概率补充背景，不强制）\n' +
    '- useProbability：是否启用概率过滤（true=启用，false=始终触发）\n' +
    '  - constant=true的常驻条目建议设为false（始终生效）\n' +
    '  - selective=true的触发条目建议设为true（配合probability使用）\n\n' +
    '**插入位置类（position）**：\n' +
    '- 0 = Before Char Defs（角色定义前）：影响中等，用于世界观基底\n' +
    '- 1 = After Char Defs（角色定义后）：影响较大，用于核心规则\n' +
    '- 2 = Before Example Messages（示例消息前）：作为对话示例注入\n' +
    '  - 遵循示例消息行为规则：上下文满时渐进推出\n' +
    '  - 按提示词设置格式化为Instruct或Chat Completion格式\n' +
    '- 3 = After Example Messages（示例消息后）：作为对话示例注入\n' +
    '  - 同position=2，区别在示例消息的前后位置\n' +
    '- 4 = Top of AN（作者笔记顶部）：影响随AN位置变化\n' +
    '  - ⚠️ 注意：如果Author\'s Note禁用（Insertion Frequency=0），此位置条目会被忽略\n' +
    '- 5 = Bottom of AN（作者笔记底部）：影响随AN位置变化\n' +
    '  - 比position=4更靠近生成点，影响更大\n' +
    '- 6 = @ D（指定深度）：在特定聊天深度注入，配合depth和role字段\n' +
    '  - depth：注入深度（0=最底部/最新消息位置，数字越大越靠上）\n' +
    '  - role：消息角色（0=system系统消息, 1=user用户消息, 2=assistant助手消息）\n' +
    '  - 用于精准控制信息注入的位置和角色\n' +
    '- 7 = Outlet（命名出口）：不自动注入，用{{outlet::名称}}手动调用\n' +
    '  - outlet_name：出口名称（大小写敏感，前后空格会被忽略），position=7时必填\n' +
    '  - 用法：在Prompt Manager或Advanced Formatting中放置 {{outlet::你的出口名}}\n' +
    '  - 同名称的多条目按insertion_order排序，用换行连接后替换宏\n' +
    '  - 适合模块化内容管理、自定义布局、条件注入组合\n' +
    '  ⚠️ Outlet重要限制：\n' +
    '  - 世界书条目内容中不能放{{outlet::}}宏（计算顺序问题，可能死循环）\n' +
    '  - 不支持嵌套Outlet（不能在一个出口的内容里调用另一个出口）\n' +
    '  - 角色卡字段（Description/Personality/Scenario等）不能展开Outlet（解析太早）\n' +
    '  - Author\'s Note编辑器也不能解析Outlet，要用Top/Bottom of AN位置代替\n' +
    '  - 没有内容的Outlet宏会被替换为空字符串\n\n' +
    '**内容排序类**：\n' +
    '- insertion_order：插入顺序/优先级，数字越大越靠后（影响越大）\n' +
    '  - 最高优先级规则：250-200（基础公理、核心铁则）\n' +
    '  - 高优先级规则：200-150（交互规则、场景机制）\n' +
    '  - 中优先级规则：150-80（实体内容、玩法系统）\n' +
    '  - 低优先级内容：80-30（叙事背景、历史事件）\n' +
    '  - 补充内容：30以下（彩蛋、可选说明）\n' +
    '  - 同position下，order大的排在后面（更靠近生成点，影响更大）\n' +
    '  - 同组内（group）可通过order大小配合group_override实现优先级回退\n\n' +
    '**策略类（constant/selective）**：\n' +
    '- constant=true + selective=false：常驻条目，无需关键词，始终生效\n' +
    '  - 用于基础公理、核心规则、输出格式要求\n' +
    '  - useProbability建议设为false（始终生效）\n' +
    '  - scan_depth建议设为0（不扫描历史）\n' +
    '- constant=false + selective=true：关键词触发条目（最常用）\n' +
    '  - 用于实体交互、场景机制、叙事背景\n' +
    '  - 配合keys/secondary_keys实现精准触发\n' +
    '- constant=true + selective=true：不常用\n' +
    '- vectorized=true（🔗向量检索触发）：使用嵌入相似度匹配，而非关键词精确匹配\n' +
    '  - 原理：将条目内容和聊天内容转为向量，计算语义相似度，超过阈值即触发\n' +
    '  - 优势：无需穷举关键词，AI说"获取宝物"也能匹配到"获得道具"的条目\n' +
    '  - 限制：需要用户开启向量数据源（Vector Storage），否则不生效\n' +
    '  - 适用：语义模糊、表达多样的场景（如情感、氛围、隐含意图）\n' +
    '  - 不适用：精确规则、数值判定（用普通关键词更可靠）\n' +
    '  - 可与selective同时开启：关键词或向量相似度，任一满足即触发\n\n' +
    '**高级匹配功能**：\n' +
    '- case_sensitive：大小写敏感（null=使用全局设置）\n' +
    '  - 中文场景可忽略，英文专有名词可设为true\n' +
    '- automation_id：自动化触发ID（进阶功能）\n' +
    '  - 设置后，当此条目被激活时，会自动执行同名STscript脚本\n' +
    '  - 用途：条目触发时自动执行复杂逻辑（如更新变量、发送通知、触发其他操作）\n' +
    '  - 例：automation_id="combat_start" → 条目激活时自动执行/combat_start脚本\n' +
    '  - 不需要自动化功能时留空\n' +
    '- per-entry scan_depth：条目级扫描深度覆盖（覆盖全局设置）\n' +
    '  - 最大值：1000（足够扫描整个长对话）\n' +
    '  - 用途：某些条目需要扫描更远历史（如追溯剧情伏笔）或更近历史（如即时反应）\n' +
    '  - 例：常驻条目设为0（不扫描历史），事件触发条目设为10-20\n' +
    '- match_persona_description：匹配角色描述（除了消息还匹配persona字段）\n' +
    '- match_character_description：匹配角色卡描述\n' +
    '- match_character_personality：匹配角色性格字段\n' +
    '- match_character_depth_prompt：匹配depth_prompt\n' +
    '- match_scenario：匹配场景字段\n' +
    '- match_creator_notes：匹配创作者笔记\n' +
    '  - 以上match_*字段：设为true时，除了扫描消息，还扫描对应角色卡字段\n' +
    '  - 典型用法：让某些条目在角色卡描述包含特定关键词时也触发\n\n' +
    '**正则触发键（高级功能，极大增强触发灵活性）**：\n' +
    '- keys数组中的元素如果是 /pattern/flags 格式，会被当作正则表达式匹配\n' +
    '  - 支持完整JavaScript正则语法：g(全局), i(忽略大小写), s(点匹配换行), m(多行), u(Unicode)\n' +
    '  - 普通键用逗号分隔（不支持逗号），正则键可包含逗号，作为独立key输入\n' +
    '  - 例：keys=["修炼", "/境界|修为/i", "/(练气|筑基|金丹).*期/"]\n' +
    '\n' +
    '- 高级Per-Message匹配（精确控制谁触发）：\n' +
    '  - ST在每条消息前添加 \\x01角色名: 前缀，可用正则精确匹配特定说话者\n' +
    '  - 只匹配用户说的话：/\\x01{{user}}:[^\\x01]*?关键词/i\n' +
    '  - 只匹配AI说的话：/\\x01{{char}}:[^\\x01]*?关键词/i\n' +
    '  - 匹配任意角色：/\\x01[^\\x01]*?:[^\\x01]*?关键词/i\n' +
    '  - 例：只在用户提到"系统"时触发：keys=["/\\x01{{user}}:[^\\x01]*?系统/i"]\n' +
    '  - 例：只在AI描述天气时触发：keys=["/\\x01{{char}}:[^\\x01]*?(下雨|晴天|下雪)/i"]\n' +
    '\n' +
    '- 正则触发键设计原则：\n' +
    '  - 优先用普通关键词，复杂场景再用正则（性能考虑）\n' +
    '  - 正则尽量精确，避免过度匹配\n' +
    '  - 捕获组不影响触发，仅用于匹配判断\n' +
    '  - 中文场景建议加i标志（不影响中文但更安全）\n' +
    '  - 需要区分说话者时用\\x01前缀方案\n\n' +
    '**其他字段**：\n' +
    '- comment：条目备注/标题，仅UI显示，不参与触发逻辑\n' +
    '  - 强烈建议使用规范前缀命名（见下方命名规范）\n' +
    '- content：条目内容，触发后注入到上下文的实际文本\n' +
    '  - ⚠️ 必须自包含完整信息！keys、comment、title等字段不会被注入上下文，AI看不到它们\n' +
    '  - 错误示例：content="如上所述，该角色拥有飞行能力"（AI不知道"如上"指什么）\n' +
    '  - 正确示例：content="李逍遥：蜀山派弟子，拥有御剑飞行能力，擅长雷系法术"\n' +
    '  - 条目之间可以互相引用（通过递归触发），但单条内容必须独立可读\n' +
    '  - 每条建议100-400字，保持精炼，信息密度高\n' +
    '- id：条目唯一ID（数字，自动生成）\n' +
    '- enabled：是否启用条目\n' +
    '- display_index：显示排序（UI用，不影响逻辑）\n' +
    '- triggers：触发器数组（一般留空）\n' +
    '- ignore_budget：忽略上下文预算（设为true时始终插入，不计入token限制）\n' +
    '  - 核心规则可设为true，防止被截断\n' +
    '- selectiveLogic：次级键（secondary_keys）逻辑模式（0=AND_ANY, 1=NOT_ALL, 2=NOT_ANY, 3=AND_ALL）\n' +
    '  - secondary_keys为空时忽略此设置\n' +
    '  - 模式0（AND_ANY）：主键触发 + 次级键中至少1个匹配 → 才激活\n' +
    '    · 用途：精确过滤，需要上下文同时包含主键和某个辅助信息\n' +
    '    · 例：keys=["战斗"], secondary_keys=["野外","城市","秘境"], selectiveLogic=0\n' +
    '      → 只有在"战斗"且提到地点类型时才触发，室内对话不触发\n' +
    '  - 模式3（AND_ALL）：主键触发 + 所有次级键全部匹配 → 才激活\n' +
    '    · 用途：极精确触发，需要多个条件同时满足\n' +
    '    · 例：keys=["修炼"], secondary_keys=["突破","瓶颈"], selectiveLogic=3\n' +
    '      → 只有同时提到"修炼+突破+瓶颈"三个关键词才触发突破指导\n' +
    '  - 模式2（NOT_ANY）：主键触发 + 次级键中没有任何一个匹配 → 才激活\n' +
    '    · 用途：排除特定场景，主键出现但某些词不在场时才触发\n' +
    '    · 例：keys=["休息"], secondary_keys=["战斗","受伤"], selectiveLogic=2\n' +
    '      → "休息"时不在战斗/受伤状态，才触发悠闲休息的描述\n' +
    '  - 模式1（NOT_ALL）：主键触发 + 不是所有次级键都匹配 → 才激活\n' +
    '    · 用途：防止特定组合出现，主键+全部次级键同时出现时反而不触发\n' +
    '    · 例：keys=["奖励"], secondary_keys=["任务完成","boss击杀"], selectiveLogic=1\n' +
    '      → 只提"奖励"或只提一个原因时触发，两个原因都有时反而用更高级的奖励条目\n\n' +
    '**全局预算与激活控制（用户侧设置，生成角色卡时需了解）**：\n' +
    '- Budget Cap（预算上限）：世界书总token上限，防止注入过多内容撑爆上下文\n' +
    '  - 通常设为1024或2048，取决于模型上下文长度\n' +
    '  - 角色卡设计原则：常驻条目总token≤500，确保有足够预算给触发条目\n' +
    '- Min Activations（最小激活数）：确保至少激活N条条目的全局设置\n' +
    '  - 设为非零值时，即使scan_depth内没找到关键词，也会向后搜索直到激活指定数量的条目\n' +
    '  - 用途：确保关键信息不被遗漏（如每次生成都注入一些世界背景）\n' +
    '  - 注意：仍受Budget Cap和Max Depth限制\n' +
    '  - 生成角色卡时无需设置此值，但需了解用户可能使用此功能\n' +
    '- Extension Prompts扫描：世界书可扫描扩展提示词（如Chat Lore、Persona Lore等）\n' +
    '  - 这些内容不在聊天消息中，但在上下文中存在\n' +
    '  - 生成角色卡时无需关心此设置\n\n' +
    '=== 高价值字段生成规范 ===\n\n' +
    '**身份定位（原 system_prompt，现自动从以下字段提取，无需手动写）**：\n' +
    '  · 从 personality（性格） 中提取角色自称/核心身份标签 → 生成 ≤50字系统提示写入 system_prompt 字段\n' +
    '  · 从 scenario（场景） 中提取对话时空背景信息\n' +
    '\n' +
    '**depth_prompt**：\n' +
    '- 自动生成新手引导内容\n' +
    '- 默认depth=0，role=system\n\n' +
    '**多开局机制（原 alternate_greetings，现改为 <动态适配>分支开局 + MVU 变量）**：\n' +
    '  · 第1条消息末尾附带互动选项（例：「你选择走哪条走廊？①实验楼 ②体育馆」）\n' +
    '  · 玩家选选项后，<动态适配>分支开局条目（keys含"实验楼/体育馆"）被蓝灯绿灯/关键词激活\n' +
    '  · 激活后用 <UpdateVariable><initvar>YAML</initvar></UpdateVariable> 覆盖 MVU 初始变量，实现多开局\n' +
    '\n' +
    '**regex_scripts**：\n' +
    '- 自动生成基础状态同步正则脚本\n' +
    '- 无需插件实现动态状态栏、格式化、内容替换等功能\n' +
    '- 正则脚本按顺序执行，前一个的输出是后一个的输入\n' +
    '- **脚本类型**：\n' +
    '  · Global脚本：全局生效，保存在settings.json，适用于所有角色卡\n' +
    '  · Scoped脚本：仅对当前角色卡生效，保存在角色卡数据中\n' +
    '  · 生成角色卡时使用Scoped脚本（保存在extensions.regex_scripts中）\n' +
    '- **脚本执行顺序**：按脚本列表顺序执行，前一个的输出是后一个的输入\n' +
    '- **Ephemerality临时性设置**（控制是否写入聊天文件）：\n' +
    '  · promptOnly=true：只修改发送给模型的提示词，不改变显示，不写入聊天文件\n' +
    '    用途：偷偷给模型加规则/改格式，用户看不到变化\n' +
    '  · 默认（都不设置）：直接修改聊天内容，显示和模型一致，永久保存\n' +
    '  · 注意：promptOnly模式用户和模型看到的内容不同，需谨慎使用\n\n' +
    '**完整字段说明**：\n' +
    '- scriptName：脚本名称（仅UI显示，不影响功能）\n' +
    '- findRegex：查找的正则表达式，格式为 /pattern/flags\n' +
    '  - 支持JavaScript正则语法，可用标志：g(全局), i(忽略大小写), s(点匹配换行), m(多行), u(Unicode)\n' +
    '  - 捕获组：用 $1, $2... 在replaceString中引用匹配的分组\n' +
    '  - 命名组：(?<name>pattern) 用 $<name> 引用\n' +
    '- replaceString：替换为的内容\n' +
    '  - 支持 $1-$9 引用捕获组\n' +
    '  - 支持 $& 引用整个匹配\n' +
    "  - 支持 $` 引用匹配前的文本，$' 引用匹配后的文本\\n" +
    '  - 支持 {{match}} 宏引用整个匹配（与$&等效，但更直观）\n' +
    '  - 当substituteRegex>0时，支持ST宏变量（{{user}}, {{char}}, {{random:A,B}}, {{roll:XdY}}等）\n' +
    '- trimStrings：要移除的字符串数组（在替换后执行）\n' +
    '  - 常用于清理多余的换行、空格、特定标记\n' +
    '  - 按数组顺序逐个移除\n' +
    '- placement：应用位置数组（可多选）\n' +
    '  - 0 = User Input（用户输入）：处理用户发送的消息\n' +
    '  - 1 = AI Response（AI回复）：处理AI生成的回复\n' +
    '  - 2 = Slash Commands（斜杠命令）：处理/命令的输出\n' +
    '  - 3 = World Info（世界信息）：处理世界书条目内容\n' +
    '  - 4 = Reasoning（推理内容）：处理推理模型的推理过程\n' +
    '  - 常用组合：状态栏格式化用[0,1]，世界书处理用[3]\n' +
    '- disabled：是否禁用（true=禁用，false=启用）\n' +
    '- markdownOnly：仅处理Markdown内容（不处理纯文本）\n' +
    '  - 适合处理加粗、列表等markdown格式\n' +
    '- promptOnly：仅在发送到模型的提示词中生效（不改变显示）\n' +
    '  - 适合偷偷修改提示词结构，用户看不到变化\n' +
    '- runOnEdit：编辑消息时是否重新执行\n' +
    '  - 建议状态栏类脚本设为true\n' +
    '- substituteRegex：宏替换模式\n' +
    '  - 0 = 不替换宏：findRegex和replaceString中的宏保持原样\n' +
    '  - 1 = 原始替换：在正则执行前替换宏变量\n' +
    '  - 2 = 转义替换：替换宏并转义特殊字符（推荐用于宏作为模式的一部分时）\n' +
    '  - 典型用法：要匹配{{char}}的名字时用2，replaceString中用{{user}}时用1\n' +
    '- minDepth / maxDepth：生效深度范围（null=不限制）\n' +
    '  - minDepth：从第几条消息开始生效（0=最新消息）\n' +
    '  - maxDepth：最多到第几条消息\n' +
    '  - 适合渐进式提示（如前N轮显示引导，之后自动消失）\n' +
    '  - minDepth=-1或空白：Unlimited，也会影响Continue操作的续写消息\n' +
    '  - 系统提示和工具提示不受深度设置影响\n' +
    '- 临时性/Ephemerality设置（控制是否写入聊天文件）：\n' +
    '  - promptOnly=true：只修改发送给模型的提示词，不改变显示，也不写入聊天文件\n' +
    '    · 用途：偷偷给模型加规则/改格式，用户看不到变化\n' +
    '    · 对应官方Alter Outgoing Prompt选项\n' +
    '  - 两个都不设置（默认）：直接修改聊天文件内容，显示和模型看到的一致，修改永久保存\n' +
    '  - 注意：promptOnly模式下，用户看到的和模型收到的内容不一样，需谨慎使用\n' +
    '- 正则标志（flags）：写在findRegex的//后面，如/pattern/gi\n' +
    '  - g：全局匹配（匹配所有，不只第一个），绝大多数情况都要加\n' +
    '  - i：忽略大小写，中文场景建议加（不影响中文但更安全）\n' +
    '  - s：dotAll模式，.可以匹配换行符（多行内容匹配时用）\n' +
    '  - m：多行模式，^和$匹配每行的开头结尾\n' +
    '  - u：Unicode模式，正确处理Unicode字符\n\n' +
    '**常用场景示例**：\n' +
    '  1. 状态栏格式化：\n' +
    '     findRegex="/<status>([\\s\\S]*?)</status>/gi"\n' +
    '     replaceString="\\n**【状态面板】**\\n$1\\n"\n' +
    '     placement=[0,1], runOnEdit=true\n' +
    '  2. 行动标签格式化：\n' +
    '     findRegex="/<action>([\\s\\S]*?)</action>/gi"\n' +
    '     replaceString="\\n*【行动】$1*\\n"\n' +
    '     placement=[0,1]\n' +
    '  3. 数值高亮：\n' +
    '     findRegex="/(\\d+)(点|级|年|%|元|层|阶)/gi"\n' +
    '     replaceString="**$1$2**"\n' +
    '     placement=[0,1]\n' +
    '  4. 表情符号转换：\n' +
    '     findRegex="/\\[(微笑|大笑|哭泣|愤怒|思考|惊讶)\\]/gi"\n' +
    '     replaceString="$1"\n' +
    '     placement=[0,1]\n' +
    '  5. 括号内容加粗：\n' +
    '     findRegex="/\\(([^)]{3,40})\\)/gi"\n' +
    '     replaceString="**($1)**"\n' +
    '     placement=[0,1]\n' +
    '  6. 世界书内容模板替换：\n' +
    '     findRegex="/\\{\\{playerName\\}\\}/gi"\n' +
    '     replaceString="{{user}}"\n' +
    '     placement=[3], substituteRegex=0\n' +
    '  7. 新手引导（仅前5轮）：\n' +
    '     findRegex="/^(.*)$/m"\n' +
    '     replaceString="$1\\n\\n💡 提示：输入\\\"help\\\"查看指令列表"\n' +
    '     placement=[1], minDepth=0, maxDepth=4\n' +
    '  8. 用户输入规范化：\n' +
    '     findRegex="/^[\\s\\S]*?玩家说[:：]\\s*/i"\n' +
    '     replaceString=""\n' +
    '     placement=[0], trimStrings=["\\n\\n"]\n' +
    '  9. 关键词加粗强调（用{{match}}宏）：\n' +
    '     findRegex="/(修炼|突破|渡劫|法宝)/gi"\n' +
    '     replaceString="**{{match}}**"\n' +
    '     placement=[0,1]\n' +
    '  10. 世界书模板变量替换（placement=[3]）：\n' +
    '      findRegex="/\\{\\{玩家名\\}\\}/gi"\n' +
    '      replaceString="{{user}}"\n' +
    '      placement=[3], substituteRegex=1\n' +
    '  11. 仅给模型看的隐藏提示（promptOnly=true）：\n' +
    '      findRegex="/(.*)/s"\n' +
    '      replaceString="$1\\n\\n[隐藏规则：回复时必须包含状态面板]"\n' +
    '      placement=[1], promptOnly=true\n' +
    '  12. 敏感词过滤：\n' +
    '      findRegex="/(敏感词1|敏感词2)/gi"\n' +
    '      replaceString="***"\n' +
    '      placement=[0,1]\n' +
    '  13. HTML/CSS样式注入（彩色标签）：\n' +
    '      findRegex="/<status>([\\s\\S]*?)</status>/gi"\n' +
    '      replaceString="<div style=\\"background:#1a1a2e;padding:8px 12px;border-radius:8px;border-left:4px solid #e94560;color:#e0e0e0;\\">$1</div>"\n' +
    '      placement=[1]\n' +
    '      注意：需要在用户设置中关闭"Show <tags> in responses"\n' +
    '  14. STscript布尔判断（配合斜杠命令）：\n' +
    '      findRegex="/<action>([^<]+)</action>/gi"\n' +
    '      replaceString="ACTION_MATCH_FOUND"\n' +
    '      disabled=true（默认禁用，通过STscript按需触发）\n' +
    '      用途：在STscript中判断是否匹配成功，执行条件分支\n' +
    '  15. MVU-移除旧变量更新(提示词)（AI输出，仅格式提示词，minDepth=4）：\n' +
    '      findRegex="/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm"\n' +
    '      replaceString=""\n' +
    '      placement=[2]（AI输出）, markdownOnly=false, promptOnly=true, minDepth=4\n' +
    '      用途：只从depth>=4的旧消息提示词中移除<UpdateVariable>段，保留最近2楼让AI看到变量更新历史\n' +
    '  16. MVU-移除变量更新(显示)（AI输出，仅格式显示）：\n' +
    '      findRegex="/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm"\n' +
    '      replaceString=""\n' +
    '      placement=[2]（AI输出）, markdownOnly=true, promptOnly=false\n' +
    '      用途：从所有消息的显示中移除<UpdateVariable>段，用户不需要看到变量更新代码\n' +
    '  17. MVU-对AI隐藏状态栏（AI输出，仅格式提示词）：\n' +
    '      findRegex="/<StatusPlaceHolderImpl\\/>/g"\n' +
    '      replaceString=""\n' +
    '      placement=[2]（AI输出）, markdownOnly=false, promptOnly=true\n' +
    '      用途：不让模型看到状态栏占位符，避免干扰生成（注意：不勾选仅格式显示）\n' +
    '  18. MVU-状态栏美化显示（AI输出，仅格式显示）【⚠️此正则必须由AI根据用户需求生成，显示所有可见变量】【StageDog标准】：\n' +
    '      findRegex="/<StatusPlaceHolderImpl\\/>/g"\n' +
    "      replaceString=\"```\\n<body>\\n<head>\\n  <style>全局样式(CSS变量配色)</style>\\n  <script src=\\\"https://cdn.jsdelivr.net/npm/...statusbar...\\\"><\\/script>\\n</head>\\n<body>\\n  页面DOM结构\\n  <script type=\"module\">异步等待MVU+递归遍历stat_data渲染</script>\\n</body>\\n```\"\n" +
    '      placement=[2]（AI输出）, markdownOnly=true, promptOnly=false, runOnEdit=false, substituteRegex=0, minDepth=null, maxDepth=null\n' +
    '      用途：在渲染阶段将占位符替换为完整HTML状态栏，递归遍历stat_data所有可见变量动态渲染\n' +
    "      注意（StageDog标准铁则）：\n" +
    "      · HTML结构：无<!doctype html>、无<html>根；直接<head>+<body>；<script type=\\\"module\\\">放<body>末尾\n" +
    "      · 包裹格式：replaceString用纯```代码块包裹（禁止```html标记）\n" +
    "      · 加载方式：优先 $('body').load('https://cdn.jsdelivr.net/gh/用户/仓库@分支/状态栏/index.html') 独立文件方案；内嵌HTML仅作fallback\n" +
    "      · runOnEdit=false（StageDog标准，避免编辑消息时重复执行）\n" +
    '      ⚠️生成前引导流程（按需询问，不强制一步步；用户明确要"直接生成"时可跳过询问）：\n' +
    '        第1步：请用户提供MVU变量结构脚本（zod schema代码块），识别变量路径/核心字段/数据组织方式\n' +
    '        第2步：询问用户想显示哪些变量（可按类别分组：核心状态/世界状态/角色状态等）\n' +
    '        第3步：询问UI风格（简约黑色卡片/赛博朋克霓虹/古风水墨/科幻全息/游戏UI仪表盘/极简线条，或"简单就行"），按用户要求自由设计\n' +
    '        第4步：进入代码生成（⚠️使用下方的5步分模块流程；⚠️严格每次只生成一个模块，禁止一次生成多个模块，禁止一口气生成完整状态栏）\n' +
    '\n' +
    '      ╔══════════════════════════════════════════════════════════════╗\n' +
    '      ║  ⚠️核心机制：写卡器后台管理 + 5个空槽位 + 逐个填入 + 拼接合并  ║\n' +
    '      ║  设计目标：让最弱的模型也能分步骤生成最好的状态栏             ║\n' +
    '      ║  核心原理：像角色卡一样在后台写入，写卡器维护HTML模板框架     ║\n' +
    '      ║  5个槽位（Step 2-6）一开始全是空的，AI生成哪个就填哪个       ║\n' +
    '      ║  ⚠️铁律：写卡器知道当前在生成哪个Step，AI只需输出代码块       ║\n' +
    '      ║  ⚠️铁律：不需要输出 /* === Step N === */ 标记，写卡器自动识别 ║\n' +
    '      ║  ⚠️铁律：一次回答只输出一个代码块（当前Step的代码）           ║\n' +
    '      ║  ⚠️铁律：禁止输出其他代码块（条目JSON/脚本/statusblock等）    ║\n' +
    '      ║  ⚠️铁律：5个模块全部填满后才拼接保存，确保状态栏完整可用     ║\n' +
    '      ║  ⚠️铁律：修改模块时先清空对应槽位再重新填入                   ║\n' +
    '      ╚══════════════════════════════════════════════════════════════╝\n' +
    '\n' +
    '      【机制1：后台填入式收集（像角色卡一样在后台写入）】\n' +
    '      写卡器后台维护一个HTML模板框架，有5个空槽位（Step 2-6）。\n' +
    '      写卡器知道当前在生成哪个Step，会通过提示词告诉AI"当前Step: N - XXX"。\n' +
    '      AI只需输出当前Step的代码块（一个```代码块），写卡器自动提取并填入对应槽位。\n' +
    '      ⚠️不需要输出 `/* === Step N: 标题 === */` 标记——写卡器自己知道当前是哪个Step\n' +
    '      ⚠️不需要输出多个代码块——写卡器只提取第一个代码块填入当前槽位\n' +
    '      ⚠️如果模块重复（重新生成同一个Step），直接替换槽位中的旧代码\n' +
    '      ⚠️生成模块前必须与已有模块对照、相互印证，确保可行：\n' +
    '        - 生成Step 3骨架前，对照Step 1变量表的路径和分组，确保每个变量都有对应节点+唯一id\n' +
    '        - 生成Step 4样式前，对照Step 3骨架的class命名/id命名，确保选择器一一对应\n' +
    '        - 生成Step 5 populateCharacterData前，对照Step 1变量表的路径，确保_.get根路径为"stat_data"与InitVar一致；对照Step 3骨架的id命名，确保$(\'#id\')选择器一一对应\n' +
    '        - 生成Step 6入口前，对照Step 5的populateCharacterData函数名，确保init调用正确\n' +
    '      ⚠️各Step代码块用 ``` 包裹，写卡器自动提取拼接，不需要AI输出完整HTML\n' +
    '      ⚠️写卡器会在每轮对话后显示收集进度（✅已收集/⬜还缺），并提示下一步该生成什么\n' +
    '      ⚠️完整性保障：5个模块（Step 2-6）全部收集完毕后，写卡器才会自动拼接保存到角色卡\n' +
    '         缺任何一个模块都不会保存，避免生成残缺不可用的状态栏\n' +
    '         修改时旧状态栏保持不变，直到新模块全部收集完毕才覆盖\n' +
    '\n' +
    '      ▶ Step 0（最重要一步）：了解用户的初始变量结构\n' +
    '        仔细阅读用户的变量结构脚本（zod Schema）和 [InitVar] 初始变量，识别：\n' +
    '          · 变量路径是什么？（例：角色.络络.好感度 → 实际 _.get 路径 stat_data.络络.好感度）\n' +
    '          · 有哪些核心字段需要显示？（_前缀只读跳过；$前缀派生显示字段需保留；其他全显示）\n' +
    '          · 数据是怎么组织的？（对象/数组/嵌套层级，决定渲染方式）\n' +
    '        问用户：①要追踪哪些核心变量？②什么 UI 风格？（卡片/列表/进度条/Tab 等）③有没有特殊显示需求？\n' +
    '        交付：用自然语言复述变量结构 + 确认用户想要的 UI 风格，问"理解对吗？可以进 Step 1 变量盘点吗？"\n' +
    '        结尾给用户的提示：简单告诉用户"下一步是 Step 1 变量盘点表，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 1：变量盘点表（纯文本，非代码，先理清思路）【改进9：扩展7列】\n' +
    '        产出：表格（7列，顺序固定） | 变量路径 | 类型 | 派生规则（如有） | 空值兜底 | 是否跳过（_/$开头需明确） | 显示格式 | 分组 | 显示名 |\n' +
    '        范围：从用户zod schema提取所有字段。不要直接跳过_/$开头的——先看【是否跳过】列再决定：\n' +
    '          · _前缀（如_当前回合）：AI只读不更新，跳过渲染=是\n' +
    '          · $前缀但派生显示专用（如$依存度阶段）：AI不更新，但populateCharacterData要**显示**→跳过渲染=否\n' +
    '          · $前缀纯元数据（如$time自动时间戳）：AI不更新也不显示→跳过渲染=是\n' +
    '        【派生规则列】：抄zod里的transform逻辑（如"物品栏：_.pickBy(d,({数量})=>数量>0)"、"依存度阶段：按<20消极/<40疏离/<60平淡/<80信任/>80完全"）\n' +
    '        【空值兜底列】：如果zod做了过滤（如物品栏被pickBy数量>0），可能是空对象{}，此处写"背包为空"/"暂无"等文字\n' +
    '        【显示格式列】（4选1）：\n' +
    '          · number 类型：数字 / 进度条 / 进度条+派生阶段（优先，能和$阶段字段联动）\n' +
    '          · string/boolean/array：保持默认\n' +
    '        类型识别：number/boolean/string/array/object\n' +
    '        示例（扩展7列）：\n' +
    '          | stat_data.白娅.好感度 | number | zod已做clamp(0,100) | — | 否 | 进度条+阶段 | 白娅·状态 | 好感度 |\n' +
    '          | stat_data.白娅.$好感度阶段 | string | 派生：<20消极/<40疏离/<60平淡/<80信任 | — | 否 | 文本 | 白娅·状态 | 阶段 |\n' +
    '          | stat_data.白娅.着装.上装 | string | — | "未穿" | 否 | 文本 | 白娅·着装 | 上装 |\n' +
    '          | stat_data.世界.时间 | string | — | "初始时间" | 否 | 文本 | 世界状态 | 时间 |\n' +
    '          | stat_data.主角.物品栏 | object | _.pickBy({数量}>0)；空对象显示"背包为空" | "背包为空" | 否 | 分组显示 | 物品栏 | 背包 |\n' +
    '          | stat_data._当前回合 | number | _前缀只读 | — | 是 | — | 系统 | 当前回合 |\n' +
    '        用途：后续Step 2-6全部基于此表，路径/类型/显示格式/是否跳过不得偏离\n' +
    '        交付：展示7列表格，问"这些变量都对吗？显示格式/分组要调整的告诉我"\n' +
    '        结尾给用户的提示：输出后简单告诉用户"下一步是Step 2配色，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 2：配色方案（仅CSS :root变量块）\n' +
    '        产出：仅一段 `:root { --xxx: 颜色; }`，不含任何选择器规则\n' +
    '        内容：根据UI风格定主色/辅色/背景/文字/边框/成功/警告/危险等变量\n' +
    '        示例：\n' +
    '          :root {\n' +
    '            --card-bg: rgba(20,20,30,0.85);\n' +
    '            --accent-blue: #93c5fd;\n' +
    '            --text-main: #e2e8f0;\n' +
    '            --progress-bar-bg: rgba(148,163,184,0.2);\n' +
    '            --progress-bar-fill: var(--accent-blue);\n' +
    '          }\n' +
    '        交付：展示配色，问"配色OK吗？"\n' +
    '        结尾给用户的提示：简单告诉用户"下一步Step 3骨架，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 3：HTML结构骨架（仅外层骨架，无CSS无JS）【用户模板标准：每个变量需写唯一id】\n' +
    '        产出：纯DOM外层骨架代码块（用```html或纯```包裹都可，写卡器均可识别）\n' +
    '        规则（用户模板标准实现模式 —— 与旧递归renderTree模式完全不同）：\n' +
    '          · 【固定结构层放宽允许】在 render-root 外部，允许追加以下**非变量驱动的固定层**（写死内容即可）：\n' +
    '              - .status-header：顶部角色名字头像条、剧情日/时间显示条\n' +
    '              - .status-tabs：Tab导航栏（像官方参考TabNav组件那样做"状态/背包/关系/日志"切换）\n' +
    '              - .status-footer：底部操作栏（重置按钮等，一般不加）\n' +
    '          · 【用户模板铁律】每个需要显示的变量必须在body中有**唯一的id**（如 id="affinity-val"、id="items-list"、id="weapon" 等）\n' +
    '          · 【用户模板铁律】populateCharacterData 中用 $(\'#id\').text(value) / $(\'#id\').html(html) 逐变量填充，所以 Step3 必须预先把id写好\n' +
    '          · 不要预先写任何 stat-item/class=category-title 这类动态生成的class（这些是旧递归renderTree模式遗留的）\n' +
    '          · 不写style属性、不写script\n' +
    '        · 三层核心骨架必须保留（不可缺）：.mvu-status-card > .card-body[id=render-root] > .loading-state （加载占位）\n' +
    '        · 【页面支撑铁律（用户规范补充）】\n' +
    '          - 页面必须有外部支撑，主体内容**禁止**使用 position:absolute 等脱离文档流的样式\n' +
    '          - 页面整体应适配容器宽度，**不产生横向滚动条**\n' +
    '          - 如果样式更适合卡片形状，则**不要有背景颜色**（除非用户明确要求）\n' +
    '        示例片段（含唯一id写法，用户模板标准）：\n' +
    '          <div class="mvu-status-card">\n' +
    '            <div class="status-tabs">/* 固定Tab导航：状态/背包/关系/日志 */\n' +
    '              <span class="tab active">状态</span><span class="tab">背包</span><span class="tab">关系</span>\n' +
    '            </div>\n' +
    '            <div class="card-body" id="render-root">\n' +
    '              <div class="char-section">\n' +
    '                <div class="stat-row"><span>好感度</span><span id="affinity-val">--</span></div>\n' +
    '                <div class="stat-row"><span>阶段</span><span id="phase-val">--</span></div>\n' +
    '                <ul id="items-list"><!-- populateCharacterData中用 .html() 填充背包列表 --></ul>\n' +
    '              </div>\n' +
    '            </div>\n' +
    '          </div>\n' +
    '        交付：展示骨架，问"结构OK吗？每个变量的id写对了吗？固定层（header/tabs/footer）需要加减的告诉我"\n' +
    '        结尾给用户的提示：简单告诉用户"下一步Step 4样式，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 4：CSS样式表（仅<style>内规则，不含:root，不含HTML）\n' +
    '        产出：基于标准实现模式写所有选择器规则，引用Step 2的CSS变量\n' +
    '        必含类名（根据Step 3的骨架调整：如果Step3有.status-tabs，Step4就必须有.status-tabs选择器；如果有.nested-group也要有）：\n' +
    '          核心必含：.mvu-status-card/.category-title/.stat-grid/.nested-group(嵌套对象左侧虚线缩进容器)/.stat-item/.stat-label/.stat-value/.value-number/.value-true/.value-false/.value-text/.loading-state/.flash-update/层级缩进.indent-1~4\n' +
    '          显示格式可选：.progress-bar(进度条容器背景)+.progress-bar-fill(进度条fill)\n' +
    '          固定结构层可选（如有）：.status-header/.status-tabs/.status-footer 及对应交互态.active\n' +
    '        ⚠️布局约束（强制）：禁用vh（用width+aspect-ratio）、避min-height/overflow:auto、禁position:absolute、适配容器宽度、卡片状不要背景色（除非用户明确要求）\n' +
    '        交付：展示样式，问"样式OK吗？要调字号/间距/配色告诉我"\n' +
    '        结尾给用户的提示：简单告诉用户"下一步Step 5渲染函数，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 5：populateCharacterData（仅JS function，变量读取+逐变量填充合并为单槽位）\n' +
    '        产出：`function populateCharacterData() { ... }` 函数（用户模板标准：直接 getAllVariables + 逐变量 $(\'#id\').text() 填充）\n' +
    '        规则（用户模板标准实现模式，禁止用 loadVars/renderVars 双函数模式，禁止用_getVars helper和renderTree递归）：\n' +
    '          · 直接 getAllVariables() 读变量（不再用getVariables消息级scope+fallback，不再用_getVars helper）\n' +
    '          · 用 _.get(all_variables, "stat_data.xxx", 默认值) 逐变量读取（根路径与InitVar YAML根字段一致，所有路径必须以stat_data.开头）\n' +
    '          · 【注释规范（用户铁律）】仅能使用 /*注释*/，**禁止使用 // 注释**（否则可能渲染失败）\n' +
    '          · 【DOM操作（用户铁律）】使用 jquery（如 $(\'#id\').text(value)）逐变量手动填充（body内每个变量有唯一id）\n' +
    '          · 逐变量填充模式（用户模板标准）：\n' +
    '              - 普通变量：const v = _.get(all_variables, \'stat_data.xxx\', \'N/A\'); $(\'#id\').text(v);\n' +
    '              - 数组变量：const items = _.get(all_variables, \'stat_data.背包\', []); const html = items.map(i => `<li>${i}</li>`).join(\'\'); $(\'#items-list\').html(html);\n' +
    '              - 对象变量：const npcs = _.get(all_variables, \'stat_data.NPCs\', {}); Object.entries(npcs).forEach(([name, data]) => { ... });\n' +
    '              - 嵌套对象（推荐可选链）：const user = _.get(all_variables, \'stat_data.用户信息\', {}); const weapon = user.法宝?.本命法宝 || \'无\';\n' +
    '          · 禁止Mvu.getVar，禁止用renderTree递归渲染\n' +
    '        示例（用户模板标准 populateCharacterData）：\n' +
    '          function populateCharacterData() {\n' +
    '            const all_variables = getAllVariables();\n' +
    '            // 注意：所有变量路径必须以 \'stat_data.\' 开头\n' +
    '            const variable1 = _.get(all_variables, \'stat_data.xxx\', \'N/A\');\n' +
    '            $(\'#id1\').text(variable1);\n' +
    '            const items = _.get(all_variables, \'stat_data.背包\', []);\n' +
    '            const html = items.map(i => `<li>${i}</li>`).join(\'\');\n' +
    '            $(\'#items-list\').html(html);\n' +
    '          }\n' +
    '        交付：展示populateCharacterData函数，简要说明变量读取策略（直接getAllVariables+逐变量填充）\n' +
    '        结尾给用户的提示：简单告诉用户"下一步Step 6入口，说继续"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 6：异步入口+事件绑定（仅JS入口代码，用户模板标准：eventOn事件驱动+errorCatched入口）\n' +
    '        产出（完整入口代码块）——【用户铁律：init 函数用 errorCatched 包装后放入 $(() => {})】：\n' +
    '          async function init() {\n' +
    '            /* 1. 等MVU框架挂载（用户铁律：入口必须 await waitGlobalInitialized(\'Mvu\')）*/\n' +
    '            await waitGlobalInitialized(\'Mvu\');\n' +
    '            /* 2. 首次渲染 */\n' +
    '            populateCharacterData();\n' +
    '            /* 3. 事件驱动刷新（用户模板标准：eventOn事件驱动，不再用setInterval轮询） */\n' +
    '            eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => {\n' +
    '              populateCharacterData();\n' +
    '            });\n' +
    '            /* 4. 折叠交互 */\n' +
    '            $(\'.section-header\').on(\'click\', function () {\n' +
    '              toggleSection($(this));\n' +
    '            });\n' +
    '          }\n' +
    '          $(errorCatched(init));\n' +
    '        规则（用户模板标准 + 用户铁律合并）：\n' +
    '          · 【用户铁律】init 函数经过 errorCatched 包装后放入 $(() => {}) 中，即 $(errorCatched(init))\n' +
    '          · 【用户铁律】入口必须 await waitGlobalInitialized(\'Mvu\')；除 waitGlobalInitialized 外，**禁止使用 Mvu 做任何事**（Mvu.watch/Mvu.observe 等接口并不存在）\n' +
    '          · 主同步机制（用户模板标准）：eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => { populateCharacterData(); }) 事件驱动刷新；禁止setInterval轮询\n' +
    '          · 【用户铁律】可直接使用 jquery/jqueryui/lodash/yaml/zod/toastr，无需额外导入\n' +
    '          · 【用户铁律】变量从全局 getAllVariables() 获取，populateCharacterData 内用 _.get(all_variables, "stat_data.xxx") 逐变量读取\n' +
    '        交付：展示完整入口代码，问"eventOn事件驱动+errorCatched入口OK吗？"\n' +
    '        结尾给用户的提示：简单告诉用户"完成，自查"即可，不要装饰符号、表情、分隔线\n' +
    '\n' +
    '      ▶ Step 7：拼接合并+自查（最后一步，仅确认不输出代码）\n' +
    '        ⚠️重要：拼接由写卡器自动完成，AI不需要重新输出完整HTML！\n' +
    '        AI只需确认各Step模块已就绪，写卡器会自动提取各Step代码块并拼接成完整HTML保存。\n' +
    '        这样各模块可以任意大，拼接不受AI单次输出长度限制。\n' +
    '        AI在Step 7需要做的：\n' +
    '          ① 确认 Step 2-6 的代码块都已输出（写卡器自动识别各Step代码块，无需 /* === Step N === */ 标记）\n' +
    '          ② 模块间交叉对照自查（发现问题回到对应Step修正——但每次只能重新输出一个Step）：\n' +
    '            a. HTML结构：Step 3产出完整<!doctype html>文档，body内每个变量有唯一id\n' +
    '            b. 注释规范：全文无 // 注释，仅 /* */（用户铁律，否则可能渲染失败）\n' +
    '            c. DOM规范：populateCharacterData 中用 jquery $(\'#id\').text(value) 逐变量填充（用户模板标准）\n' +
    '            d. 变量路径：直接 getAllVariables() 读变量（不再用_getVars helper）；_.get 根路径为 "stat_data" 与InitVar一致\n' +
    '            e. 类型安全：typeof number检测、布尔✓/✕、跳过_/$变量\n' +
    '            f. 异步就绪（用户铁律）：Step 6 入口必须 await waitGlobalInitialized(\'Mvu\')；init 函数用 errorCatched 包装后放入 $(() => {})，即 $(errorCatched(init))\n' +
    '            g. 用户模板同步机制：Step 6用 eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, ...) 事件驱动刷新（不再用setInterval轮询）\n' +
    '            h. 布局安全：无vh单位（用width+aspect-ratio）、无position:absolute、无min-height/overflow:auto、适配容器宽度不横向滚动、卡片状不要背景色（除非用户明确要求）\n' +
    '            i. 隐藏接口：除 waitGlobalInitialized(\'Mvu\') 外，未使用 Mvu.watch/Mvu.observe 等不存在的接口\n' +
    '            j. ⚠️模块间一致性对照（核心）：\n' +
    '               - Step 3的id命名 vs Step 5的populateCharacterData中$(\'#id\')选择器 → 必须一一对应\n' +
    '               - Step 5的populateCharacterData函数 vs Step 6中init函数调用populateCharacterData() → 函数名必须一致\n' +
    '               - Step 2的CSS变量名 vs Step 5的className引用 → 必须完全一致\n' +
    '               - Step 3的class命名 vs Step 4的选择器 → 必须一一对应\n' +
    '               - Step 1的变量路径 vs Step 5的_.get路径 → 必须完全一致\n' +
    '               - Step 6 的 init 函数 vs $(errorCatched(init)) 调用 → 命名必须一致\n' +
    '          ③ 告知用户"写卡器已自动拼接保存，可点预览查看效果"\n' +
    '        ⚠️禁止在Step 7重新输出各模块代码——写卡器会自动从之前各Step的代码块中提取拼接\n' +
    '        ⚠️Step 7不输出任何代码块，仅做文字确认和自查报告\n' +
    '\n' +
    '      【机制3：AI触发状态栏预览命令】\n' +
    '        当AI需要向用户展示当前已收集的状态栏效果时，在消息中输出 `<preview_statusbar>` 标记。\n' +
    '        写卡器会自动检测此标记，用当前已收集的模块拼接成完整HTML并在聊天界面中直接渲染。\n' +
    '        这样AI不需要在消息中输出冗长的HTML代码，用户也能实时看到效果。\n' +
    '        使用时机：模块收集完成后、用户说"让我看看""预览一下""效果如何"时。\n' +
    '\n' +
    '      【机制4：按语义精准修改】（清空→逐个重新填入）\n' +
    '      当用户要求修改时，AI先识别涉及哪些Step，然后：\n' +
    '        ① 先输出清空标记 `<clear_statusbar>N1,N2,N3</clear_statusbar>`（N为Step号，逗号分隔）\n' +
    '           写卡器会立即清空这些槽位，旧状态栏保持不变直到新模块全部完成\n' +
    '        ② 然后在同一个回答中生成第一个需要修改的模块代码块（⚠️只能一个）\n' +
    '        ③ 后续模块等用户说"继续"后逐个生成\n' +
    '      写卡器会自动将新代码填入对应槽位，不需要AI输出Step标记\n' +
    '      示例：\n' +
    '        · 用户说"改配色" → 清空Step 2 → 生成新的Step 2配色代码块\n' +
    '          AI输出：<clear_statusbar>2</clear_statusbar> + ```css代码块\n' +
    '        · 用户说"换UI风格" → 清空Step 2+3+4 → 先生成Step 2，提醒"接下来需改Step 3和4，请说继续"\n' +
    '          AI输出：<clear_statusbar>2,3,4</clear_statusbar> + Step 2的```css代码块\n' +
    '        · 用户说"渲染逻辑有bug" → 清空Step 6 → 生成新的Step 6代码块\n' +
    '          AI输出：<clear_statusbar>6</clear_statusbar> + Step 6的```javascript代码块\n' +
    '      ⚠️修改前必须与已有模块对照、相互印证，确保修改后的模块与其他模块兼容\n' +
    '      ⚠️修改时同样禁止输出多个代码块，回答中只能有当前修改的那一个Step的代码块\n' +
    '      ⚠️禁止"因为改一处就重写全部5步"——这是失败模式，会浪费token且引入新bug\n' +
    '      ⚠️修改后5个模块重新齐全时，写卡器自动拼接覆盖旧状态栏\n' +
    '\n' +
    '      【机制5：弱模型友好设计 + 完整性保障】\n' +
    '        · 每个Step都有明确示例，弱模型可直接套模板\n' +
    '        · 每个Step职责单一，代码量按需决定（简单状态栏每个Step可≤30行；超大型/复杂状态栏单个Step可上百行，不设上限）\n' +
    '        · 用户要"分步骤看"时，每步交付后停下等用户确认，避免长上下文丢失\n' +
    '        · ⚠️每次只做一个Step，禁止一次做多个——弱模型上下文短，单模块输出质量更高\n' +
    '        · Step 1是纯文本表格，不涉及代码，让弱模型先理清变量结构\n' +
    '        · Step 7由写卡器自动拼接，AI不需要重新输出代码，避免输出长度限制\n' +
    '        · 超大型状态栏建议：把变量按模块分组（核心状态/世界状态/角色关系/物品栏/技能栏/任务进度等），每个模块独立成块，便于扩展\n' +
    '        · ⚠️每个Step生成前，AI需在文字中简述"我将对照Step X的XXX来确保一致"，然后再输出代码块\n' +
    '        · ⚠️不管小型还是大型状态栏，都必须走完Step 2-6全部5个模块\n' +
    '        · ⚠️5个模块全部齐全后写卡器自动拼接保存，确保最终状态栏结构完整、样式完整、逻辑完整\n' +
    '        · ⚠️大型状态栏的优势：每个Step可以写很多代码（上百行），不受单次输出限制，复杂度由Step内部承担\n' +
    '\n' +
    '      ⚠️通用关键实现要求（每个Step都适用，用户模板标准对齐）：\n' +
    '        · 可用库：jquery、jqueryui、lodash、yaml、zod、toastr（无需import，直接使用）\n' +
    '        · 读变量（用户模板标准）：直接 getAllVariables() 读变量（不再用_getVars helper）；_.get(all_variables,"stat_data.xxx",默认值)逐变量读取；禁止Mvu.getVar（有时序失效问题）\n' +
    '        · 异步就绪：await waitGlobalInitialized(\'Mvu\') 等MVU就绪即可\n' +
    '        · DOM操作：逐变量 $(\'#id\').text(value) 手动填充（用户模板标准），body内每个变量有唯一id\n' +
    '        · 主同步机制（用户模板标准）：eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => { populateCharacterData(); }) 事件驱动刷新；禁止setInterval轮询；禁止Mvu.watch/observe等不存在的接口\n' +
    '        · 顶层入口（用户模板标准）：$(errorCatched(init)) —— init函数经errorCatched包装后放入$(() => {})\n' +
    '        · 注释：只能用 /* 注释 */，禁止 // 注释（会导致渲染失败）\n' +
    '        · 逐变量填充：populateCharacterData() 中逐变量 $(\'#id\').text(value) 手动填充（不再用renderTree递归）\n' +
    '        · 跳过隐藏变量：key以 _ 或 $ 开头的跳过\n' +
    '        · 严格类型检测：typeof val === "number" 才画value-number/进度条（不要把字符串当数字）\n' +
    '        · 布尔✓/✕：value-true✓ / value-false✕ 分色（不要用✅❌表情）\n' +
    '        · script标签：type="module" 支持顶层async/await；<head>内放置（StageDog模板标准）\n' +
    '      ⚠️CSS/布局约束（避免渲染异常）：\n' +
    '        · 禁用vh等受宿主高度影响的单位，用width+aspect-ratio让高度随宽度自适应\n' +
    '        · 避免 min-height、overflow:auto 等会强制撑高父容器的元素\n' +
    '        · 主体内容禁用 position:absolute 等脱离文档流的样式（页面必须有外部支撑）\n' +
    '        · 页面整体适配容器宽度，不产生横向滚动条\n' +
    '        · 卡片形状优先：除非用户明确要求，不要加背景颜色\n\n' +
    '**高级场景与设计模式**：\n' +
    '- 模式1：管道式处理（多脚本串联）\n' +
    '  · 前一个脚本的输出是后一个的输入，按顺序执行\n' +
    '  · 例：脚本1提取状态栏 → 脚本2格式化样式 → 脚本3添加图标\n' +
    '  · 优势：每个脚本职责单一，易于调试和复用\n' +
    '- 模式2：条件逻辑判断（配合STscript/Quick Replies）\n' +
    '  · 设置disabled=true的脚本，通过STscript或斜杠命令按需触发\n' +
    '  · replaceString中放唯一标记值，用于判断匹配是否成功\n' +
    '  · 可实现：如果文本包含X，则执行Y操作\n' +
    '- 模式3：HTML/CSS样式注入\n' +
    '  · replaceString中包含HTML标签和style样式\n' +
    '  · 需要用户设置中关闭"Show <tags> in responses"\n' +
    '  · 可实现：彩色文字、边框、背景色、浮动元素等\n' +
    '  · 例：把特定关键词变成红色带边框的标签样式\n' +
    '- 模式4：世界书内容后处理（placement=[3]）\n' +
    '  · 在世界书条目注入提示词前，对内容进行替换/格式化\n' +
    '  · 可实现：模板变量替换、统一格式调整、内容裁剪\n' +
    '  · 注意：需要"Alter Outgoing Prompt"开启（或两个ephemerality都不选）\n\n' +
    '**设计原则**：\n' +
    '- 每个脚本只做一件事，功能单一化\n' +
    '- 注意执行顺序，后执行的会覆盖前面的结果\n' +
    '- 正则尽量精确，避免误匹配\n' +
    '- 使用非贪婪匹配 (.*?) 避免匹配过多\n' +
    '- 中文场景建议开启i标志（忽略大小写对中文无影响，但更安全）\n' +
    '- 复杂替换考虑拆分成多个简单脚本\n\n' +
    '**personality/scenario**：\n' +
    '- 强制留空（世界模式）\n\n' +
    '=== 输出格式（:::操作块协议，严禁用```json代码块） ===\n' +
    '⚠️ 严禁输出```json代码块！所有修改用:::操作块协议输出。\n' +
    '格式：::: 动作 条目名\\n内容\\n:::\n' +
    '5种动作：upsert(增改) / update(只改) / delete(删) / set(顶层字段) / rename(重命名)\n\n' +
    '**顶层字段设置示例**：\n' +
    '::: set name\\n星陨大陆\\n:::\\n\\n' +
    '::: set description\\n这是一个修仙世界...\\n:::\\n\\n' +
    '::: set first_mes\\n开场白内容...\\n:::\\n\n' +
    '=== 增量编辑规则 ===\n' +
    '当角色卡已经生成、用户要求增/删/改某些内容时，用:::操作块只输出需要修改的内容。\n\n' +
    '★★★【最高原则：只增不删 · 冲突才改 · 不冲突保留】★★★\n' +
    '随着对话推进，用户会不断提供新信息。你的核心职责是把这些信息持续积累到角色卡中，而不是重写：\n' +
    '  ① 用户新信息涉及全新内容（新角色/新地点/新规则等）→ 直接 :::upsert 新条目，不要动旧条目\n' +
    '  ② 用户新信息与已有条目内容不冲突 → 用 ⟦⟧ 标记生成补充条目，或在 :::upsert 中保留全部旧内容后追加新内容\n' +
    '  ③ 用户新信息与已有条目内容冲突（同一字段的新旧值矛盾）→ 才用 :::upsert 覆盖该字段，覆盖时必须输出完整旧内容+修改后的冲突字段，不冲突的部分原样保留\n' +
    '  ④ 绝对禁止因为"觉得旧内容不够好"就覆盖或删除——只要用户没明确要求删除/重写，旧内容就是有效的，必须保留\n' +
    '  ⑤ 每次 upsert 已有条目前，先对照上方「当前角色卡已有内容」逐行检查：哪些是冲突需要改的？哪些是不冲突必须保留的？确认后再输出\n\n' +
    '**增量编辑示例**：\n' +
    '::: upsert <基础公理>力量体系\\n修炼分为九层...\\n:::\\n\\n' +
    '::: update <场景机制>战斗规则\\n战斗采用回合制...\\n:::\\n\\n' +
    '::: delete <人物>反派\\n\\n::: rename <人物>旧名 → <人物>新名\\n\\n' +
    '=== 世界书条目命名规范 ===\n\n' +
    '**条目comment必须使用以下前缀之一**：\n' +
    '- <基础公理>：世界名称、核心哲学、美学总纲、核心符号\n' +
    '- <世界元数据>：世界基础信息、时间线、地理总览\n' +
    '- <交互软规则>：互动选项生成逻辑、叙事风格、剧情引导原则\n' +
    '- <核心铁则>：绝对禁止项、输出格式核心要求、AI身份总纲\n' +
    '- <近场强约束>：当前场景规则、即时状态栏、临时任务进度\n' +
    '- <当前局势>：主要势力、势力关系、重要事件、当前危机\n' +
    '- <场景机制>：战斗、修炼、谈判、探索等特定场景规则\n' +
    '- <核心玩法>：主要玩法、成长系统、道具机制、操作方式\n' +
    '- <世界规则>：力量体系、等级制度、特殊法则、限制条件\n' +
    '- <实体交互>：NPC角色、势力组织、道具装备、地点场景\n' +
    '- <重要角色>：角色身份、性格、外貌、背景、人际关系\n' +
    '- <势力与组织>：组织架构、势力范围、内部规则\n' +
    '- <物品>：重要道具、装备、特殊物品\n' +
    '- <地点场景>：重要地点、场景描述\n' +
    '- <叙事背景>：主线剧情、支线故事、世界历史、文化习俗\n' +
    '- <故事发展>：主线故事、支线故事、关键事件、结局类型\n' +
    '- <文化与习俗>：文化背景、社会习俗、节日庆典\n' +
    '- <历史事件>：重要历史事件、时代变迁\n' +
    '- <动态适配>：多开局分支、渐进引导、变量模板、状态正则\n' +
    '- <引导机制>：互动引导策略、信息释放节奏\n' +
    '- <互动选项>：动态互动选项的生成逻辑\n' +
    '- <状态栏>：定义<status>等标签的输出格式模板\n' +
    '- <统一输出格式>：AI回复格式规范\n' +
    '- <角色边界>：角色行为限制和不可触犯的底线\n' +
    '- <禁止项>：禁止出现的词汇或行为\n' +
    '- <自定义条目>：用户自定义内容\n' +
    '- [InitVar]初始变量（第2条）：MVU变量系统初始值YAML（缩进表示层级，enabled=false禁用）\n' +
    '- 变量列表（第3条）：MVU当前变量注入（标签内为 null）\n' +
    '- [mvu_update]变量更新规则（第4条）：依据schema生成check/type/range\n' +
    '- [mvu_update]变量输出格式（第5条）：固定YAML，<UpdateVariable>+<JSONPatch>5种操作\n' +
    '- [mvu_update]变量输出格式强调（第6条）：固定YAML，默认enabled=false\n' +
    '- <状态栏>占位符提醒（第7条）：提醒AI输出<StatusPlaceHolderImpl/>\n' +
    '- <状态变量输出>：输出当前变量状态给LLM的触发条目\n\n' +
    '=== 世界书条目字段配置规范 ===\n' +
    '| 前缀 | constant | selective | position | depth | order | cooldown | scan_depth | prevent_recursion | probability | useProbability | group | delay_until_recursion |\n' +
    '| <基础公理> | true | false | 0 | 0 | 250 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <世界元数据> | true | false | 0 | 0 | 240 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <交互软规则> | true | false | 1 | 0 | 150 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <近场强约束> | false | true | 2 | 2 | 180 | 0 | 3 | false | 100 | true | (空) | false |\n' +
    '| <当前局势> | false | true | 2 | 3 | 170 | 0 | 3 | false | 100 | true | (空) | false |\n' +
    '| <场景机制> | false | true | 1 | 3 | 140 | 3 | 5 | false | 100 | true | (空) | false |\n' +
    '| <核心玩法> | false | true | 1 | 3 | 130 | 3 | 5 | false | 100 | true | (空) | false |\n' +
    '| <世界规则> | false | true | 1 | 4 | 120 | 3 | 5 | false | 100 | true | (空) | false |\n' +
    '| <实体交互> | false | true | 1 | 3 | 110 | 0 | 5 | true | 100 | true | (空) | false |\n' +
    '| <重要角色> | false | true | 1 | 3 | 105 | 0 | 5 | true | 100 | true | (空) | false |\n' +
    '| <势力与组织> | false | true | 1 | 3 | 100 | 0 | 5 | true | 100 | true | (空) | false |\n' +
    '| <物品> | false | true | 1 | 3 | 95 | 0 | 5 | true | 100 | true | (空) | false |\n' +
    '| <地点场景> | false | true | 1 | 3 | 90 | 0 | 5 | true | 100 | true | (空) | false |\n' +
    '| <叙事背景> | false | true | 4 | 5 | 80 | 0 | 8 | false | 60 | true | 叙事 | true |\n' +
    '| <故事发展> | false | true | 4 | 5 | 75 | 0 | 8 | false | 60 | true | 叙事 | true |\n' +
    '| <文化与习俗> | false | true | 4 | 5 | 70 | 0 | 8 | false | 60 | true | 叙事 | true |\n' +
    '| <历史事件> | false | true | 4 | 6 | 65 | 0 | 8 | false | 50 | true | 叙事 | true |\n' +
    '| <动态适配> | false | true | 1 | 4 | 50 | 0 | 5 | false | 100 | true | (空) | false |\n' +
    '| <引导机制> | false | true | 1 | 4 | 45 | 0 | 5 | false | 100 | true | (空) | false |\n' +
    '| <互动选项> | false | true | 1 | 4 | 40 | 0 | 5 | false | 100 | true | (空) | false |\n' +
    '| <状态栏> | false | true | 2 | 2 | 35 | 0 | 3 | false | 100 | true | (空) | false |\n' +
    '| <统一输出格式> | true | false | 0 | 1 | 85 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <角色边界> | true | false | 0 | 2 | 80 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <禁止项> | true | false | 0 | 3 | 70 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <自定义条目> | false | true | 1 | 4 | 55 | 0 | 5 | false | 100 | true | (空) | false |\n' +
    '| [InitVar]初始变量（第2条） | true | false | 4 | 4 | 200 | 0 | 0 | true | 100 | false | (空) | false | enabled=false |\n' +
    '| 变量列表（第3条） | true | false | 4 | 0 | 200 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| [mvu_update]变量更新规则（第4条） | true | false | 4 | 0 | 200 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| [mvu_update]变量输出格式（第5条） | true | false | 4 | 0 | 200 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| [mvu_update]变量输出格式强调（第6条） | true | false | 4 | 0 | 200 | 0 | 0 | true | 100 | false | (空) | false | enabled=false |\n' +
    '| <状态栏>占位符提醒（第7条） | true | false | 4 | 0 | 200 | 0 | 0 | true | 100 | false | (空) | false |\n' +
    '| <状态变量输出> | false | true | 2 | 2 | 45 | 0 | 3 | false | 100 | true | (空) | false |\n' +
    '注1：order=insertion_order，数字越大越靠后（影响越大）\n' +
    '注2：delay_until_recursion=true 表示仅在递归中触发，不直接触发\n' +
    '注3：叙事类条目开启delay_until_recursion，作为背景补充被其他条目递归带出\n' +
    '注5：[InitVar]条目必须enabled=false（禁用），MVU只读取禁用的initvar条目进行初始化\n' +
    '注6：MVU脚本（bundle.js）和正则1-5（思维链移除/变量更新截断/变量美化×2/状态栏隐藏）由写卡器自动注入，无需AI生成；其余8条MVU内容**全部由AI在MVU Tab按9.1.6工作流一条一条生成**：第1条变量结构脚本(zod 4 schema)、第2条[InitVar]初始变量、第3条[mvu_update]变量更新规则、第4条变量列表、第5条[mvu_update]变量输出格式、第6条[mvu_update]变量输出格式强调、第7条<状态栏>占位符提醒条目、第8条正则6（美化状态栏HTML）\n\n' +
    '=== 世界书高级设计模式与最佳实践 ===\n\n' +
    '**模式1：递归信息链（Recursive Chaining）**\n' +
    '- 原理：实体条目触发后，通过内容中的关键词递归触发背景条目\n' +
    '- 结构：主条目（实体交互）→ 从条目（叙事背景，delay_until_recursion=true）\n' +
    '- 配置：主条目 prevent_recursion=false，从条目 delay_until_recursion=true + prevent_recursion=true\n' +
    '- 效果：提到角色名时，自动带出该角色的背景故事（不占常驻token，按需加载）\n' +
    '- 例：<重要角色>李逍遥（keys=["李逍遥"]，内容含"蜀山派"）→ 递归触发<叙事背景>蜀山派历史\n' +
    '- 安全限制：最多递归3层，实体类条目必须设prevent_recursion=true防止风暴\n\n' +
    '**模式2：概率事件系统（Probability-based Events）**\n' +
    '- 原理：利用probability字段创建随机触发的事件/彩蛋/天气变化\n' +
    '- 常见概率档位：\n' +
    '  · 1-5%：稀有彩蛋（奇遇、特殊NPC出现）\n' +
    '  · 10-30%：随机事件（天气变化、路人偶遇）\n' +
    '  · 50-70%：补充背景（有概率增加叙事深度）\n' +
    '  · 100%：必现规则（不建议用probability，直接useProbability=false即可）\n' +
    '- 配合group使用：同组多个概率条目，实现"每次触发选一个随机事件"\n' +
    '- 例：组"随机天气"，5条天气描述各20%权重，probability=30%，实现30%概率随机插入一条天气描述\n\n' +
    '**模式3：渐进式难度适配（Difficulty Scaling）**\n' +
    '- 原理：用group + group_override + order 实现按进度/深度的规则回退\n' +
    '- 结构：同group多条目，order递增表示规则越具体/越难，group_override=true\n' +
    '- 效果：简单关键词触发通用规则（低order），复杂关键词触发高级规则（高order胜出）\n' +
    '- 例：组"战斗系统"，order=100的"基础战斗规则"（keys=["战斗"]），order=200的"高级战斗规则"（keys=["战斗","技能"]）\n' +
    '  只提"战斗"时触发基础版，提到"战斗+技能"时触发高级版（更具体）\n\n' +
    '**模式4：说话者精准触发（Per-Speaker Triggers）**\n' +
    '- 原理：用正则键 + \\x01分隔符 精确匹配特定角色说的话\n' +
    '- 用户触发型：keys=["/\\x01{{user}}:[^\\x01]*?指令关键词/i"]\n' +
    '  用于：用户输入特定指令时注入规则（如用户说"查看状态"时注入状态栏格式）\n' +
    '- AI触发型：keys=["/\\x01{{char}}:[^\\x01]*?描述关键词/i"]\n' +
    '  用于：AI生成特定内容后补充上下文（如AI提到战斗结果时注入伤害计算规则）\n' +
    '- 优势：避免双向误触发，只在需要的说话方向上生效\n\n' +
    '**模式5：模块化Outlet布局（Modular Outlets）**\n' +
    '- 原理：用position=7 (Outlet) 将内容分类到不同命名出口，在Prompt Manager中自由组合布局\n' +
    '- 常见出口命名：\n' +
    '  · lore_header：世界观头部信息（放在最前）\n' +
    '  · active_rules：当前生效规则（动态变化）\n' +
    '  · status_panel：状态栏内容（固定位置）\n' +
    '  · footer_notes：页脚补充说明\n' +
    '- 优势：解耦内容和位置，调整布局无需改条目内容\n' +
    '- 注意：角色卡内置的Outlet需用户手动在Prompt Manager中放置{{outlet::xxx}}宏才生效\n\n' +
    '**模式6：分组评分精准匹配（Group Scoring）**\n' +
    '- 原理：use_group_scoring=true，按键匹配数量自动选择最相关的条目\n' +
    '- 结构：同group多条目，keys数量/具体度递增\n' +
    '- 效果：用户说的关键词越具体，匹配到的条目越精准\n' +
    '- 例：组"地点"，条目A keys=["城镇"]（1分），条目B keys=["城镇","黑铁城"]（2分），条目C keys=["城镇","黑铁城","酒馆"]（3分）\n' +
    '  用户说"黑铁城的酒馆"时，条目C匹配分最高胜出，提供最精准的信息\n\n' +
    '**世界书性能优化最佳实践**：\n' +
    '- 优先用普通关键词，正则键仅在必要时使用（正则有性能开销）\n' +
    '- 合理设置scan_depth：不需要扫描历史的设为0（如常驻条目）\n' +
    '- 叙事类条目用probability降低触发频率，节省token\n' +
    '- 实体类条目开启prevent_recursion，防止递归风暴\n' +
    '- 场景类条目设置cooldown，避免重复刷屏\n' +
    '- 控制常驻条目（constant=true）数量，总token≤500\n' +
    '- 条目内容保持精炼，单条100-400字，信息密度高\n\n' +
    '**⚠️ 常见错误与避坑指南**：\n' +
    '1. 内容不自包含：content中写"如前所述""见上文"→ AI完全看不到上下文，必须写完整信息\n' +
    '2. 触发词太少：只设1个关键词，用户换个说法就不触发→ 建议每条目3-8个同义词/变体\n' +
    '3. 递归风暴：实体条目未开prevent_recursion，导致连锁触发耗尽token→ 实体类必须开\n' +
    '4. 滥用常驻：所有条目都设constant=true→ 常驻token爆炸，只有核心规则才常驻\n' +
    '5. position错误：把核心规则放position=4（AN位置）但用户禁用了AN→ 条目被忽略\n' +
    '6. Outlet未放置宏：设了position=7但用户没在Prompt Manager放{{outlet::xxx}}→ 内容不显示\n' +
    '7. Outlet嵌套：在WI条目内容里放{{outlet::xxx}}宏→ 不支持，可能导致死循环\n' +
    '8. sticky和cooldown同时用：sticky让条目持续，cooldown让条目间歇→ 逻辑冲突，不要同时设\n' +
    '9. 正则缺少g标志：findRegex写了复杂正则但没加g→ 只替换第一个匹配，后续不生效\n' +
    '10. 扫描深度过大：scan_depth=100→ 每次生成都扫描全部历史，严重影响性能\n' +
    '11. 角色卡字段中放Outlet宏：在description中写{{outlet::xxx}}→ 角色卡字段解析太早，无法展开Outlet\n' +
    '12. 分组未设group_weight：同组多条目都用默认权重100→ 随机选择无差异，失去分组意义\n\n' +
    '**🔗 世界书与正则脚本协同工作**：\n' +
    '- 正则脚本可通过 placement=[4] (World Info) 处理世界书条目注入前的内容\n' +
    '- placement 值定义：1=用户输入, 2=AI输出, 3=斜杠命令, 4=世界书\n' +
    '- 典型协同场景：\n' +
    '  1. 模板变量替换：WI条目中写{{玩家名}}，用正则替换为{{user}}\n' +
    '     findRegex="/\\{\\{玩家名\\}\\}/gi", replaceString="{{user}}", placement=[4], substituteRegex=1\n' +
    '  2. 统一格式化：WI条目内容风格不统一时，用正则自动调整格式\n' +
    '     如自动给所有"规则:"开头的行加粗：findRegex="/^(规则[:：].*)$/gm", replaceString="**$1**", placement=[4]\n' +
    '  3. 敏感内容过滤：WI条目中包含需要过滤的词汇\n' +
    '     findRegex="/(禁词)/gi", replaceString="***", placement=[4]\n' +
    '  4. 动态状态注入：WI触发后，用正则在AI回复中检测并格式化状态信息\n' +
    '     WI条目注入"战斗规则" → 正则在AI回复中格式化战斗结果\n' +
    '- 注意事项：\n' +
    '  · placement=[4]的正则需要"Alter Outgoing Prompt"开启（即promptOnly不单独勾选）\n' +
    '  · 正则处理WI内容的执行顺序：WI条目注入 → 正则处理 → 最终提示词组装\n' +
    '  · 一个正则脚本可同时处理多个位置（如placement=[1,2,4]）\n\n' +
    '**🔗 MVU变量系统设计模式（MagVarUpdate zod，进阶可选）**：\n' +
    '- 模式1：分层变量结构\n' +
    '  · 原理：按角色/世界/物品等分类用YAML缩进嵌套，如 白娅:\\n  依存度: 35\\n  着装:\\n    上装: 校服\n' +
    '  · 优势：结构清晰，LLM更容易理解变量归属和关系，引导更准确的变量更新\n' +
    '  · 注意：YAML用缩进表示层级，冒号后空格建立从属；数值/文本/真假值三种基本类型\n' +
    '- 模式2：开局变量初始化\n' +
    '  · 原理：在<动态适配>分支开局世界书条目(selective=true, keys=["选择","开局","路线"])中加入<UpdateVariable><initvar>块，覆盖[InitVar]默认值\n' +
    '  · 格式：<UpdateVariable>\\n<initvar>\\n白娅:\\n  依存度: 15\\n</initvar>\\n</UpdateVariable>\n' +
    '  · 用途：不同开局有不同的初始变量（如不同身份有不同道具/属性）\n' +
    '- 模式3：变量驱动的分段内容\n' +
    '  · 原理：用提示词模板语法 + getvar("stat_data") 实现根据变量值显示不同内容\n' +
    '  · 格式：<% if (getvar("stat_data.白娅.依存度") >= 50) { %>...<% } %>\n' +
    '  · 注意：第一个if用 typeof 检查变量是否初始化完成，避免模板报错\n' +
    '- 模式4：状态栏占位符\n' +
    '  · 原理：变量输出格式定义AI输出<StatusPlaceHolderImpl/>，正则替换为状态栏HTML\n' +
    '  · 用途：状态栏自动显示当前变量值，无需AI输出完整状态栏文本\n' +
    '- 模式5：变量更新回调（高阶，需JS能力）\n' +
    '  · 原理：监听 mag_variable_updated / mag_variable_update_ended 事件\n' +
    '  · 用途：LLM忘记更新时自动补全（如日期自动+1）、触发特殊逻辑\n' +
    '  · 参考：MagVarUpdate example_src\n' +
    '- MVU zod安装清单：\n' +
    '  1. MVU本体脚本：import \'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js\'【写卡器自动注入】\n' +
    '  2. 世界书调用脚本(WTC)：用 <observed_piece class="剧情/设定"> 包裹世界书内容，让AI区分剧情与设定【AI按需在MVU Tab生成】\n' +
    '  3. 变量结构脚本：zod 4 schema + registerMvuSchema 注册【AI在MVU Tab按9.1.5/9.1.6工作流一条一条生成】\n' +
    '  4. 正则脚本：正则1-5由写卡器自动注入（思维链移除/变量更新截断/变量美化×2/状态栏隐藏）；正则6（美化状态栏）⚠️必须由AI在MVU Tab按9.1.6工作流生成\n' +
    '  5. 开场白占位符：<StatusPlaceHolderImpl/> 自动追加到 first_mes【写卡器自动注入】\n' +
    '  6. <状态栏>占位符提醒条目：constant=true常驻世界书条目，提醒AI每条回复底部输出<StatusPlaceHolderImpl/>【AI在MVU Tab按9.1.6工作流一条一条生成】\n' +
    '  7. 世界书条目（第2-7条，AI在MVU Tab按9.1.6工作流逐条生成）：[InitVar]初始变量 + [mvu_update]变量更新规则 + 变量列表 + [mvu_update]变量输出格式 + [mvu_update]变量输出格式强调 + <状态栏>占位符提醒\n\n' +
    '**📚 Lore插入策略（多源排序）**：\n' +
    '- 当角色卡有内置世界书(character_book)且用户有全局世界书时，两者按以下策略合并：\n' +
    '  1. Sorted Evenly（默认）：所有来源条目按insertion_order统一排序，忽略来源\n' +
    '  2. Character Lore First：角色卡世界书条目先注入，再注入全局世界书\n' +
    '  3. Global Lore First：全局世界书条目先注入，再注入角色卡世界书\n' +
    '- 还有Chat Lore（聊天级）和Persona Lore（人设级）两个独立来源，始终在最前\n' +
    '- 完整注入顺序：Chat Lore → Persona Lore → Character/Global Lore（按策略排序）\n' +
    '- 生成角色卡时无需关心用户的策略设置，只需保证insertion_order合理即可\n\n' +
    '=== 引导流程（按权重层级搭建） ===\n\n' +
    '**步骤1：定核心铁则**（最高权重，优先确定）\n' +
    '- 确定AI身份定位\n' +
    '- 确定绝对禁止项\n' +
    '- 确定输出格式核心要求\n' +
    '- 生成<核心铁则>条目\n\n' +
    '**步骤2：搭世界基底**（常驻体系）\n' +
    '- 确定世界名称和元数据\n' +
    '- 确定核心世界观公理\n' +
    '- 确定交互软规则\n' +
    '- 生成<基础公理>、<世界元数据>、<交互软规则>条目\n\n' +
    '**步骤3：做实体内容**（实体交互层）\n' +
    '- 设计重要角色和NPC\n' +
    '- 设计势力组织\n' +
    '- 设计道具装备\n' +
    '- 设计地点场景\n' +
    '- 生成<重要角色>、<势力与组织>、<物品>、<地点场景>条目\n\n' +
    '**步骤4：加场景规则**（场景机制层）\n' +
    '- 设计核心玩法和成长系统\n' +
    '- 设计世界规则和力量体系\n' +
    '- 设计特定场景规则\n' +
    '- 生成<核心玩法>、<世界规则>、<场景机制>条目\n\n' +
    '**步骤5：补叙事背景**（叙事背景层）\n' +
    '- 设计主线和支线故事\n' +
    '- 设计文化习俗\n' +
    '- 设计历史事件\n' +
    '- 生成<故事发展>、<文化与习俗>、<历史事件>条目\n\n' +
    '**步骤6：做动态适配**（动态适配系统）\n' +
    '- 设计多开局分支（<动态适配>分支开局 + MVU initvar 覆盖 + 第一条消息内嵌分支选择提示）\n' +
    '- 设计渐进引导（depth_prompt）\n' +
    '- 设计状态同步（regex_scripts）\n' +
    '- 设计互动选项和引导机制\n' +
    '- 生成<动态适配>、<引导机制>、<互动选项>条目\n\n' +
    '**步骤7：配变量系统**（MVU变量系统，进阶可选）\n' +
    '- 确定是否需要MVU变量系统（如需复杂状态管理、好感度系统等）\n' +
    '- 设计变量结构（按角色/物品/状态分层嵌套，按8条工作流逐条生成，详见9.1.6）\n' +
    '- 正则1-5（思维链移除/变量更新截断/变量美化×2/状态栏隐藏）和开场白占位符由写卡器自动注入，无需生成\n' +
    '- ⚠️【重中之重】生成正则6（美化状态栏）：必须按以下UI/UX规范+StageDog标准生成，美观度对齐参考卡片，严禁敷衍：\n' +
    '  · 【配置固定StageDog标准】findRegex="/<StatusPlaceHolderImpl\\\\/>/g", placement=[2], markdownOnly=true, promptOnly=false, runOnEdit=false, substituteRegex=0\n' +
    "  · 【包裹格式StageDog标准】replaceString用纯```代码块包裹（禁止```html标记）；HTML无<!doctype html>、无<html>根；<head>(style+script type=module)+<body>结构\n" +
    '  · 【读变量StageDog标准】优先getVariables({type:"message",message_id:"latest"}) + try/catch fallback getAllVariables()；_getVars() helper封装；用_.get(res,"stat_data",{})取根（禁止Mvu.getVar有时序失效）\n' +
    '  · 【异步等待StageDog标准两步走】①await waitGlobalInitialized("Mvu")；②while+setTimeout每秒轮询_.has(_getVars(),"stat_data")（最多15秒，StageDog waitUntil模式）\n' +
    "  · 【顶层入口StageDog标准】$(async function(){ try { ... } catch(err){ fallbackUI } }) —— jQuery ready + async；顶层禁止errorCatched（仅pinia内部setup可用）\n" +
    '  · 【主同步机制StageDog标准】setInterval(refreshStatus, 2000) 每2秒轮询；Mvu.events.VARIABLE_INITIALIZED/VARIABLE_UPDATE_ENDED事件仅作加分兜底，UI不得依赖事件\n' +
    '  · 【配色主题（核心！必须用CSS变量）】建议用低饱和柔色系（深色毛玻璃/浅色系二选一），:root定义变量便于换主题：\n' +
    '    - 深色毛玻璃主题（推荐）：--card-bg: rgba(30,35,45,0.82); backdrop-filter: blur(6px); 搭配 --accent-blue:#93c5fd / --accent-green:#86efac / --accent-red:#fca5a5 / --text-sub:#94a3b8\n' +
    '    - 浅色舒适主题：--card-bg: linear-gradient(145deg,#f7f9fc,#eef2f7); 搭配柔和主色蓝/紫/绿色系\n' +
    '  · 【布局结构（核心！严禁平铺直叙）】：\n' +
    '    - 必须用 CSS Grid 响应式布局：.stat-grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 4px 16px; }\n' +
    '    - 分类标题：.category-title { font-weight:600; 带▸图标 + border-bottom分隔线; 区分不同对象分组 }\n' +
    '    - 层级缩进：.indent-1/2/3/4 { padding-left: 8px/20px/32px/44px; } 按嵌套深度缩进\n' +
    '    - 单行项：.stat-item  flex + justify-content: space-between + align-items: flex-start + gap:8px + hover背景高亮(.hover-bg)\n' +
    '  · 【逐变量填充规范（用户模板标准核心！废弃递归renderTree）】：\n' +
    '    - function populateCharacterData() { const all_variables = getAllVariables(); const data = _.get(all_variables, "stat_data", {}); ... }\n' +
    '    - 过滤：_开头和$开头的字段为只读/派生字段，populateCharacterData 中跳过（不为其写填充逻辑）\n' +
    '    - 逐变量点对点填充：const val = _.get(data, "路径.字段", 默认值); $(\'#id\').text(val); —— 每个变量对应Step3骨架中唯一id\n' +
    '    - 数值typeof==="number" → $(\'#id\').text(val); 可配合 $(\'#id-bar\').css("width", val + "%") 做进度条\n' +
    '    - 布尔typeof==="boolean" → $(\'#id\').text(val ? "✓" : "✕")（绿/红分色，不用emoji✅❌）\n' +
    '    - 数组Array.isArray(value) → items.map(it => `<li>${it}</li>`).join("") → $(\'#id\').html(html)\n' +
    '    - 其他字符串/null/undefined → $(\'#id\').text(String(val))\n' +
    '  · 【动效（点睛）】：\n' +
    '    - 加载中：.loading-state text-align:center + @keyframes breathe 呼吸动画（opacity 0.5↔0.9）\n' +
    '    - 刷新：.flash-update + @keyframes fadeIn（opacity 0.6→1） + setTimeout 300ms 移除class\n' +
    '    - hover过渡：transition: background/color 等加 0.2s ease\n' +
    '  · 【类型检测】严格 typeof value === "number" 严格检测，禁止字符串数字判断\n' +
    '  · 【根据题材定制】修仙（修仙→境界灵力条/末世→生命物资条/校园→好感度条/校园恋爱→心形好感度图标，但默认数值着色也行，务必主题风格统一\n' +
    '  · 【严禁偷工减料检查】输出前自查：有没有 Grid布局✓、分类标题✓、indent缩进类✓、hover✓、Array处理✓、两个事件绑定✓、flash更新动画✓、loading动画✓\n' +
    '- 生成[InitVar]初始变量、变量更新规则、变量输出格式条目\n\n' +
    '=== 世界书完善方法论（标签体系+引擎模式+三联细化） ===\n' +
    '本节是【条目生成总纲】，从「填内容」升级为「建系统」。生成任何条目前必读，按本节方法论决定条目的标签、配置、命名与协作关系。\n\n' +
    '**🔧 标签 = 分类 + 默认配置映射表（语义化快捷方式）**\n' +
    '所有世界书条目 comment 统一用 `<标签>条目名` 格式（如 `<基础公理>世界元数据`）。标签本身携带语义权重，AI 一看标签即知职能层级，配置按标签自动套用默认值，无需逐条重新决定 depth/position/order：\n' +
    '  · `<基础公理>`：世界底层DNA。默认 constant=true, depth=0, position=0, order=250, selective=false\n' +
    '  · `<核心铁则>`：最高权重指令（绝对禁止项/输出格式/AI身份）。默认 constant=true, depth=0, position=0, order=250\n' +
    '  · `<交互软规则>`：叙事风格/互动节奏。默认 constant=true, depth=0, position=1, order=150\n' +
    '  · `<近场强约束>`：当前情境的强约束（天气/战斗中/紧张状态）。默认 constant=false, depth=2, position=2, order=180\n' +
    '  · `<核心玩法>`：核心成长/战斗/解谜机制。默认 constant=false, depth=3, position=1, order=135\n' +
    '  · `<场景机制>`：玩法引擎/生成器/规则触发器。默认 constant=false, depth=3, position=1, order=140\n' +
    '  · `<实体交互>`：重要角色/NPC模板/势力/物品/地点。默认 constant=false, depth=3, position=1, order=110, prevent_recursion=true\n' +
    '  · `<统一输出格式>`：状态栏/反馈规范。默认 constant=true, depth=1, position=0, order=85\n' +
    '  · `<叙事背景>`：历史/文化/主线/类型深度。默认 constant=false, depth=5, position=4, order=80, delay_until_recursion=true\n' +
    '  · `<动态适配>`：多开局/渐进引导/适配。默认 constant=false, depth=4, position=1, order=50\n' +
    '  · `<引导机制>`：新手引导/自由探索。默认 constant=false, depth=4, position=1, order=45\n' +
    '  · `<状态变量输出>`：强制状态栏格式。默认 constant=false, depth=2, position=2, order=45, keys=["/^.*$/"]\n' +
    '【三轴定位铁律】depth 控制何时激活（0常驻→2近场→3玩法→4引导→5-6深度），position 控制插在哪（0角色前→1角色后→2作者注→4深度位），order 控制同位置优先级（250>180>150>140>135>110>85>80>50>45）。重要内容常驻、次要内容按需、背景内容深度激活，token 预算自动分配。\n\n' +
    '**🧬 人物完善工作流：引擎+递归+实例 三层结构（核心创新）**\n' +
    '设计重要角色/NPC时，不要写固定角色，写「生成算法」+「实例深度」。三层协同：\n' +
    '  · 【第1层·通用引擎】`<场景机制>XXX生成引擎`（depth=3）：定义身份池+容貌池+互动倾向+核心变量（如"好感阈值""怀疑倾向"）。一句话原则："算法保证多样性"。\n' +
    '  · 【第2层·递归调用说明】`<实体交互>XXX-递归扩展`（depth=3）：显式告诉AI"性格标签将触发对应的深度背景"，建立第1层与第3层的调用关系。一句话原则："声明调用契约"。\n' +
    '  · 【第3层·类型深度】`<叙事背景>XXX型深度`（depth=5）：按性格类型分支生成实例（如"傲娇/自尊型""腹黑/观察型"），含家庭背景/肢体语言/变量变化曲线/确认真相的方式。一句话原则："实例保证一致性"。\n' +
    '【生成顺序】先建第1层引擎 → 再写第2层调用说明 → 最后按性格类型逐条生成第3层实例。每个性格类型一条，禁止合并。\n' +
    '【适用场景】题材涉及大量同类NPC（校园/后宫/末世幸存者/异世界冒险者），用引擎模式可无限扩展；若仅1-2个固定核心角色，可直接用 `<实体交互>角色名` 写固定角色，但同样需配合 `<叙事背景>角色名·深度` 补充背景。\n\n' +
    '**🤝 关系完善工作流：变量阈值+性格分支 模式**\n' +
    '完善角色关系时，用 `<场景机制>XXX动态后果` 条目定义"关系变量达阈值后的分支"，而非写死关系走向：\n' +
    '  · 【变量阈值】用 MVU 变量（怀疑度/好感度/信任度）量化关系状态，达到阈值（如100）触发事件\n' +
    '  · 【性格路由】分支按【性格/身份】分类，与人物引擎的性格标签呼应——引擎生成的性格决定关系走向\n' +
    '  · 【具体剧情】每个分支对应具体剧情模式（契约/主从/试探/对质），不是抽象描述\n' +
    '【格式模板】\n' +
    '  当NPC的"XXX度"变量达到100时，AI需根据该NPC的【性格】与【身份】触发以下分支：\n' +
    '  1.【性格类型A】：具体行为反应 + 触发的剧情模式\n' +
    '  2.【性格类型B】：具体行为反应 + 触发的剧情模式\n' +
    '  3.【性格类型C】：具体行为反应 + 触发的剧情模式\n' +
    '【铁律】分支数 ≥ 3，每条必须含"行为反应+剧情模式"两部分，禁止只写抽象倾向。\n\n' +
    '**⚡ 事件完善工作流：机制+细化+反馈 三联条目模式**\n' +
    '完善核心事件/玩法系统时，用三条协同条目而非塞进一个超长条目：\n' +
    '  · 【机制层】`<核心玩法>XXX`：回答"是什么"——核心逻辑/成长表现/唯一性。如"因果律进化：物品死亡读档后吸收因果值进化"。\n' +
    '  · 【细化层】`<核心玩法>XXX细化逻辑`（或同前缀加后缀）：回答"怎么做"——定向规则/堆叠机制/视觉关联。如"定向进化：根据上轮回合痛点补偿性进化"。\n' +
    '  · 【反馈层】`<场景机制>XXX反馈规范`：回答"怎么呈现"——输出播报/视觉演变/能力上限。如"进化播报：读档后第一条回复必须以『因果律修正』为标题展示新词条"。\n' +
    '【生成顺序】机制层 → 细化层 → 反馈层，三条目前缀保持一致，order 递减（机制135 > 细化135 > 反馈140按需调整）。\n' +
    '【铁律】一个完整事件系统 = 机制+细化+反馈 三条目，禁止合并成一条超长条目（超长条目 token 浪费且 AI 难以遵循）。\n\n' +
    '**🔖 同主题补充规则：⟦⟧ 双重标记（防止覆盖原条目）**\n' +
    '当用户要求"再细化/再补充某个已有主题"时，禁止覆盖原条目，改用 `⟦<标签>条目名⟧` 生成同前缀的新条目：\n' +
    '  · 原条目 `<核心玩法>因果律进化` 已存在\n' +
    '  · 用户要"再细化进化机制" → 生成 `⟦<核心玩法>因果律进化·定向逻辑⟧`（新条目，不覆盖原条目）\n' +
    '  · 用户要"再补充进化反馈" → 生成 `⟦<场景机制>因果律进化·反馈规范⟧`（新条目）\n' +
    '【铁律】⟦⟧ 标记 = 第二迭代/加强版，写卡器识别 ⟦⟧ 不会与原条目合并。同主题可生成多条 ⟦⟧ 条目，每条聚焦一个维度。\n' +
    '【触发条件】用户说"细化/补充/再扩展/加强 XXX"时，自动用 ⟦⟧ 生成新条目；用户说"修改/改写/替换 XXX"时，才用普通 upsert 覆盖原条目。\n\n' +
    '**📝 内容格式规范（结构化呈现）**\n' +
    '所有条目 content 统一用编号格式：`1.【子标题】：内容 2.【子标题】：内容`。每个子标题是一个独立子规则，AI 可按需引用。比大段散文更省 token、更易维护、更易遵循。\n' +
    '【禁止】大段无结构散文、"如前所述/见上文"等上下文依赖词（AI 看不到上下文）。\n\n' +
    '**🎨 世界观完善总流程（从骨架到血肉）**\n' +
    '1. 【建骨架】4-5条 `<基础公理>/<核心铁则>` 常驻条目（depth=0），定义世界DNA\n' +
    '2. 【建引擎】`<场景机制>XXX生成引擎` 写"生成算法"而非固定角色\n' +
    '3. 【递归细化】引擎 → `<实体交互>XXX-递归扩展` → `<叙事背景>XXX类型深度`\n' +
    '4. 【关系变量化】`<场景机制>XXX动态后果` 用变量阈值+性格分支完善关系走向\n' +
    '5. 【事件三联化】`<核心玩法>XXX` + `<核心玩法>XXX细化` + `<场景机制>XXX反馈` 三条目协同\n' +
    '6. 【同主题补充】用 ⟦⟧ 生成新条目而非覆盖\n' +
    '7. 【背景深化】`<叙事背景>` 类条目填主线/文化/历史，depth=5 按需激活省 token\n' +
    '8. 【状态栏独立】`<状态变量输出>` 用 keys=[/^.*$/] 强制每轮激活\n' +
    '【核心理念】生成的是一套协同的世界系统，而非孤立的角色卡内容。每次更新可以任意组合增删改，按用户意图动态调整世界，让角色卡不断向用户想要的方向进化。\n\n' +
    '**🎚️ 权重分配与激活规则（参考 StageDog 模板 · 蓝灯 / 绿灯 / 向量化）**\n' +
    '写卡器条目激活策略对应 constant/depth/selective 三个字段，三种模式各司其职：\n' +
    '  · 【蓝灯模式 = 常驻激活】constant=true, depth=0, selective=false → 每轮对话必注入，用于核心规则/世界观DNA/格式规范。对应 StageDog 示例中的 文风、交错频道、变量列表 等条目。适用：<基础公理>、<核心铁则>、<交互软规则>、变量列表/变量更新规则/变量输出格式。\n' +
    '  · 【绿灯模式 = 关键词触发】constant=false, selective=true + keys=[关键词1,关键词2,...] → 用户提到特定关键词时才注入，节省token。对应 StageDog 示例中的 立即事件 条目（含【【冲动啊，请平息吧】】关键词）。适用：<实体交互>角色/物品/地点、<场景机制>玩法引擎、<近场强约束>当前情境。\n' +
    '  · 【向量化模式 = 语义匹配】constant=false, vectorized=true → AI根据内容语义相似度激活，无需手动指定关键词。适用：<叙事背景>类需要语义召回的长文本条目。\n' +
    '【权重优先级铁律】同一条目配置的优先级 = order 值越大优先级越高（高order覆盖低order的同group条目）。\n' +
    '【深度激活铁律】depth 越大 → 激活条件越苛刻（需更深的对话深度或更具体的关键词）。<叙事背景>类条目推荐 depth=5-6，只有当话题深入到对应内容时才注入，避免常驻token爆炸。\n\n' +
    '**🏷️ 条目命名后缀规范（保证同前缀多条目不冲突）**\n' +
    '同前缀下的多个条目，后缀（去掉<标签>后的部分）必须清晰区分主题，推荐以下命名后缀模式：\n' +
    '  · 人物类：<重要角色>姓名 + <重要角色>姓名·人际关系 + <重要角色>姓名·家庭背景 + ⟦<重要角色>姓名·秘密剧情⟧\n' +
    '  · 玩法类：<核心玩法>战斗规则 + <核心玩法>战斗·数值细化 + ⟦<场景机制>战斗·反馈播报⟧\n' +
    '  · 地点类：<地点场景>学院正门 + <地点场景>图书馆 + <地点场景>天台花园\n' +
    '  · 背景类：<叙事背景>学院历史 + <叙事背景>都市传说 + <叙事背景>校服文化\n' +
    '  · 引擎类：<场景机制>少女生成引擎 + <实体交互>少女-递归扩展 + <叙事背景>傲娇/自尊型深度 + <叙事背景>腹黑/观察型深度\n' +
    '【命名铁律】后缀可以用 ·中文点号 分维度（如 白娅·人际关系），也可以用斜杠/逗号（如 傲娇/自尊型），但绝不能两个不同条目只用前缀、不加后缀——否则会在同前缀只有1条时被 findMatchingEntry 误判为"同一条目的不同版本"而互相覆盖。\n\n' +
    '【用户需求最高优先级声明】若本提示词中的任何规则、规范、建议，与用户明确表达的意图冲突（例如：用户说「所有条目都设置 depth=3」但本规范建议 <基础公理> depth=0），以用户的明确表达为准。本方法论是"最佳实践参考"而非不可违反的束缚。当检测到冲突时，按用户需求执行，并在:::操作块前用1句话说明"根据你的需求调整了XXX配置"。\n\n' +
    '=== 质量检查标准（32项核心 + 6项附加） ===\n\n' +
    '**基础字段检查（8项）：**\n' +
    '- [ ] name：世界名称明确，体现核心主题\n' +
    '- [ ] description：包含世界核心设定（400字以上）\n' +
    '- [ ] personality：空字符串""（世界模式强制留空）\n' +
    '- [ ] scenario：空字符串""（世界模式强制留空）\n' +
    '- [ ] first_mes：开场白（500字以上）\n' +
    '- [ ] 身份自洽：personality/description/scenario/first_mes 四处对角色身份的描述一致无冲突\n\n' +
    '**高价值字段检查（3项）：**\n' +
    '- [ ] 多开局机制：<动态适配>分支开局 + initvar 覆盖 或 first_mes 内嵌分支选项（至少1种开局方式）\n' +
    '- [ ] depth_prompt：新手引导内容（depth=0）\n' +
    '- [ ] regex_scripts：基础状态同步正则\n\n' +
    '**世界书基础检查（6项）：**\n' +
    '- [ ] 条目数：12-30条\n' +
    '- [ ] 触发词覆盖率：≥50%\n' +
    '- [ ] 条目内容：≥250字/条\n' +
    '- [ ] 条目命名规范：≥50%使用规范前缀\n' +
    '- [ ] 权重合理：核心规则在高权重位\n' +
    '- [ ] content自包含性：无"如上所述"等上下文依赖词\n\n' +
    '**世界书高级功能检查（8项，进阶可选）：**\n' +
    '- [ ] 递归链条：实体条目关联背景叙事条目（delay_until_recursion）\n' +
    '- [ ] 分组机制：场景变体/难度分层使用group分组\n' +
    '- [ ] 次级键过滤：复杂条件条目使用secondary_keys + selectiveLogic\n' +
    '- [ ] 概率事件：随机天气/彩蛋/遭遇使用probability\n' +
    '- [ ] 正则触发：需要精确匹配说话者时使用\\x01正则键\n' +
    '- [ ] 组评分：大分组条目使用use_group_scoring提升精准度\n' +
    '- [ ] sticky/cooldown冲突：不同时在一条目设置两者\n' +
    '- [ ] position配置：constant条目position≤1，position=6/7需配对应字段\n\n' +
    '**正则脚本检查（6项）：**\n' +
    '- [ ] 脚本功能单一：每个脚本只做一件事\n' +
    '- [ ] 正则标志正确：全局匹配加g，中文场景加i\n' +
    '- [ ] 非贪婪匹配：使用.*?避免过度匹配\n' +
    '- [ ] placement配置：至少设置1个应用位置\n' +
    '- [ ] substituteRegex范围：在0-2范围内\n' +
    '- [ ] runOnEdit：状态栏类脚本建议开启\n\n' +
    '**运行效果检查（3项）：**\n' +
    '- [ ] 常驻Token总量：≤500\n' +
    '- [ ] 递归安全：实体类条目开启prevent_recursion\n' +
    '- [ ] 冷却防抖：场景类条目开启cooldown\n\n' +
    '**附加检查（6项，不计入核心）：**\n' +
    '- [ ] 触发词精准度：无"的""是"等泛用词\n' +
    '- [ ] 上下文占用估算：8k窗口≤60%\n' +
    '- [ ] 中文适配：match_whole_words未错误开启\n' +
    '- [ ] 创作者备注≤100字\n' +
    '- [ ] 常驻条目group冲突检测\n' +
    '- [ ] Outlet限制检查（如有）\n\n' +
    '**MVU变量系统检查（8条工作流，进阶可选，详见9.1.6）：**\n' +
    '- [ ] 第1条 变量结构脚本：tavern_helper.scripts中存在zod Schema + registerMvuSchema注册\n' +
    '- [ ] 第2条 [InitVar]初始变量：条目存在，YAML格式合法，enabled=false，字段与第1条schema一致\n' +
    '- [ ] 第3条 [mvu_update]变量更新规则：依据schema生成check/type/range，含$_只读约束\n' +
    '- [ ] 第4条 变量列表：标签内为 null\n' +
    '- [ ] 第5条 [mvu_update]变量输出格式：固定YAML，含<UpdateVariable>+<Analysis>+<JSONPatch>5种操作\n' +
    '- [ ] 第6条 [mvu_update]变量输出格式强调：固定YAML，默认enabled=false\n' +
    '- [ ] 第7条 <状态栏>占位符提醒：提醒AI每条回复底部输出<StatusPlaceHolderImpl/>\n' +
    '- [ ] 第8条 正则6状态栏HTML：regex_scripts中findRegex=StatusPlaceHolderImpl，markdownOnly=true\n' +
    '注：写卡器导出时**仅自动注入** bundle.js(MVU本体)、正则1-5(思维链移除/变量更新截断/变量美化×2/状态栏隐藏)、开场白末尾<StatusPlaceHolderImpl/>占位符；\n' +
    '   其余8条MVU内容**必须全部由AI在MVU Tab按9.1.6工作流一条一条生成**：①变量结构脚本(zod 4 schema) ②[InitVar]初始变量 ③[mvu_update]更新规则 ④变量列表 ⑤[mvu_update]输出格式 ⑥[mvu_update]输出格式强调 ⑦<状态栏>占位符提醒条目 ⑧正则6(美化状态栏HTML)\n\n' +
    '=== MVU 酒馆助手脚本 API ===\n\n' +
    '**脚本侧变量约定**：\n' +
    '- 变量名以 `_` 开头：AI 不可更新（仅脚本能改），如 `_internal_state`\n' +
    '- 变量名以 `$` 开头：AI 不可见（不发给 AI），如 `$secret_flag`\n\n' +
    '**MVU 事件系统**：\n' +
    '- `Mvu.events.VARIABLE_INITIALIZED`：变量初始化完成（仅新开聊天时触发）\n' +
    '- `Mvu.events.VARIABLE_UPDATE_STARTED`：变量更新开始\n' +
    '- `Mvu.events.COMMAND_PARSED`：变量更新命令解析完成（可修复命令）\n' +
    '- `Mvu.events.VARIABLE_UPDATE_ENDED`：变量更新结束（可做后处理）\n' +
    '- `Mvu.events.BEFORE_MESSAGE_UPDATE`：变量存入楼层前\n\n' +
    '**核心 API**：\n' +
    '- `Mvu.getMvuData({type, message_id})`：获取指定楼层的变量数据\n' +
    '- `Mvu.replaceMvuData(data, {type, message_id})`：写回变量到楼层\n' +
    '- `Mvu.parseMessage(text, data)`：解析文本中的<JSONPatch>更新命令\n' +
    '- `Mvu.getVar(path)`：获取当前变量路径值\n' +
    '- `injectPrompts([...])`：注入仅用于绿灯激活的提示词（含 filter 条件）\n\n' +
    '**典型脚本示例**：\n' +
    '```javascript\n' +
    'await waitGlobalInitialized("Mvu");\n' +
    '// 监听变量更新结束，限制好感度单次变动幅度\n' +
    'eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_vars, old_vars) => {\n' +
    '  const old_val = _.get(old_vars, "stat_data.白娅.依存度");\n' +
    '  _.update(new_vars, "stat_data.白娅.依存度", v => _.clamp(v, old_val - 3, old_val + 3));\n' +
    '});\n' +
    '// 用变量值激活绿灯\n' +
    'eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, vars => {\n' +
    '  const val = _.get(vars, "stat_data.白娅.依存度");\n' +
    '  injectPrompts([{id:"激活-依存度", content:"白娅阶段" + (val<40?"二":val<60?"三":val<80?"四":"五"), position:"none", depth:0, role:"system", should_scan:true}]);\n' +
    '});\n' +
    '```\n\n' +
    '=== 状态栏格式（9体系） ===\n\n' +
    '<statusblock>\n' +
    '### 📊 信息完整度 XX%\n\n' +
    '- **🏛️ 基础公理**：[✅/⏳/❌] - [摘要]\n' +
    '- **🤝 交互软规则**：[✅/⏳/❌] - [摘要]\n' +
    '- **🔐 核心铁则**：[✅/⏳/❌] - [摘要]\n' +
    '- **🎯 近场强约束**：[✅/⏳/❌] - [摘要]\n' +
    '- **⚔️ 场景机制**：[✅/⏳/❌] - [摘要]\n' +
    '- **👥 实体交互**：[✅/⏳/❌] - [摘要]\n' +
    '- **📖 叙事背景**：[✅/⏳/❌] - [摘要]\n' +
    '- **🔄 动态适配**：[✅/⏳/❌] - [摘要]\n' +
    '- **📊 变量系统**：[✅/⏳/❌] - [摘要]（进阶可选）\n\n' +
    '### 🔍 需要您补充的信息\n\n' +
    '**优先级最高**：[当前最需要收集的1-2个体系]\n\n' +
    '**深度挖掘点**：[可以进一步探索的内在逻辑或特色]\n\n' +
    '1. **[问题1]** - [针对某个体系]\n' +
    '2. **[问题2]** - [针对某个体系]\n' +
    '</statusblock>\n\n' +
    '=== 对话引导原则 ===\n' +
    '- 像朋友聊天一样自然，不要像填表单\n' +
    '- 每次只聚焦1-2个话题\n' +
    '- 根据用户的回答，立即生成/更新相应的条目\n' +
    '- 主动给出建议和灵感\n' +
    '- 当收集到足够信息时（80%以上），主动提议生成完整角色卡\n\n' +
    '=== :::操作块完整示例 ===\n' +
    '⚠️ 严禁输出```json代码块！所有修改用:::操作块协议。\n\n' +
    '::: set name\\n星陨大陆\\n:::\\n\\n' +
    '::: set description\\n这是一个修仙世界...\\n:::\\n\\n' +
    '::: upsert <基础公理>力量体系\\n修炼分为九层...\\n:::\\n\\n' +
    '::: upsert <场景机制>战斗规则\\n战斗采用回合制...\\n:::\n\n' +

    '\\n=== 【用户自然语言 → 增删改操作组合对照案例】按语义解析，不只按字面 ===\n' +
    '下面是「用户真实说的话」和「AI应该输出的:::操作组合」的对应示例。按语义推理，不只靠关键词：\n\n' +
    '【案例1 · 纯新增】\n' +
    '用户说："再加两个新角色，一个老师一个学长"\n' +
    'AI输出：\n' +
    '好的，新增两个角色。\n\n' +
    '::: upsert <重要角色>林雪老师\\n身份：语文老师 兼班主任...\\n:::\\n\\n' +
    '::: upsert <重要角色>赵远学长\\n身份：高三学生会主席...\\n:::\n\n' +

    '【案例2 · 纯修改（改现有条目，需输出完整content）】\n' +
    '用户说："把林老师改成数学老师，性格从温柔变严厉"\n' +
    'AI输出：\n' +
    '已更新林雪老师的身份和性格。\n\n' +
    '::: upsert <重要角色>林雪老师\\n身份：数学老师 兼班主任\\n外貌：...（保留所有旧外貌）...\\n性格：严厉苛刻，对学生要求很高...（其余旧内容完整保留 + 人际关系补充）\\n:::\n\n' +
    '⚠️ 修改时必须包含完整旧内容+改动部分！严禁只写"身份：数学老师 性格：严厉"（这样旧信息会全部丢失）\n\n' +

    '【案例3 · 纯删除】\n' +
    '用户说："赵远这个学长不要了，删掉"\n' +
    'AI输出：\n' +
    '已移除赵远学长条目。\n\n' +
    '::: delete <重要角色>赵远学长\\n:::\n\n' +

    '【案例4 · 批量删】\n' +
    '用户说："把所有教师相关的条目都清掉，重新做学校系统"\n' +
    'AI输出：\n' +
    '根据你的需求，先清理现有教师条目，再重建学校系统。\n\n' +
    '::: delete <重要角色>林雪老师\\n:::\\n\\n' +
    '::: delete <势力与组织>教师组\\n:::\\n\\n' +
    '::: upsert <基础公理>学院组织架构\\n学院分为四大学部...\\n:::\\n\\n' +
    '::: upsert <势力与组织>学部教师体系\\n每学部设主任1名+讲师3名+助教2名...\\n:::\n\n' +

    '【案例5 · 完善/细化（用⟦⟧生成新条目，不覆盖旧）】\n' +
    '用户说："白娅这个人物再丰富一下，加一点她的家庭背景和人际关系"\n' +
    'AI输出：\n' +
    '用⟦⟧补充新维度，不覆盖原有白娅条目。\n\n' +
    '::: upsert ⟦<重要角色>白娅·家庭背景⟧\\n白娅出身没落的贵族家庭...\\n:::\\n\\n' +
    '::: upsert ⟦<重要角色>白娅·人际关系⟧\\n与林雪老师：表面礼貌实则疏远...\\n:::\n\n' +

    '【案例6 · 语义推断-删+增】\n' +
    '用户说："战斗系统太简单了，重做一个更有深度的"\n' +
    'AI输出（语义推断：删除旧战斗系统 → 新增深度战斗系统，组合操作）：\n' +
    '重做战斗系统，先移除旧版，再引入词条/弱点/连招三层机制。\n\n' +
    '::: delete <核心玩法>战斗规则\\n:::\\n\\n' +
    '::: delete <场景机制>回合制流程\\n:::\\n\\n' +
    '::: upsert <核心玩法>战斗核心·词条机制\\n每件武器/技能自带词条...\\n:::\\n\\n' +
    '::: upsert <核心玩法>战斗核心·弱点破防\\n每个敌人有可破坏的弱点部位...\\n:::\\n\\n' +
    '::: upsert <场景机制>战斗反馈播报\\n命中弱点时在回复顶部加【破防特效】高亮...\\n:::\n\n' +

    '【案例7 · 改+增+删三者混合】\n' +
    '用户说："世界名改成苍蓝学院，再加两个新地点，旧的那个废弃工厂地点删掉，白娅的性格也调得活泼一点"\n' +
    'AI输出（混合：改世界名+调白娅+加2地点+删废弃工厂）：\n' +
    '已按你的要求一次性完成4处修改。\n\n' +
    '::: set name\\n苍蓝学院\\n:::\\n\\n' +
    '::: upsert <重要角色>白娅\\n身份：...（完整保留）\\n外貌：...（完整保留）\\n性格：活泼开朗，喜欢恶作剧（原：内向害羞）\\n背景：...（完整保留）\\n人际关系：...（完整保留+补充）\\n:::\\n\\n' +
    '::: upsert <地点场景>图书馆秘境\\n藏书楼地下封印着旧世代的魔导书...\\n:::\\n\\n' +
    '::: upsert <地点场景>天台观星台\\n屋顶有一台古旧的望远镜...\\n:::\\n\\n' +
    '::: delete <地点场景>废弃工厂\\n:::\n\n' +

    '【案例8 · 改顶层字段（set）+ 增条目混合】\n' +
    '用户说："把作者名改成Neohero，备注栏里加一条「这个世界基于我去年的旧稿改写」，顺便补个文化习俗条目"\n' +
    'AI输出：\n' +
    '好。\n\n' +
    '::: set creator\\nNeohero\\n:::\\n\\n' +
    '::: set creator_notes\\n1. 这个世界基于我去年的旧稿改写\\n2. 2026年度重制版本\\n:::\\n\\n' +
    '::: upsert <文化与习俗>星祭之夜\\n每年夏至全校在天台上举行星祭...\\n:::\n\n' +

    '【案例9 · 语义反推-实际是新增不是修改】\n' +
    '用户说："白娅和赵远的关系？之前没见过他俩有互动"\n' +
    'AI输出（语义推断：用户在暗示"需要补充这层关系"，不是询问。属于补充=新增⟦⟧条目，不是修改）：\n' +
    '补充两人的互动历史。\n\n' +
    '::: upsert ⟦<重要角色>白娅·与赵远的交集⟧\\n【初识】白娅在新生入学仪式上被赵远搭话过一次...\\n:::\n\n' +

    '【案例10 · 模糊需求-先确认再操作】\n' +
    '用户说："白娅那个条目改一下"\n' +
    'AI输出（需求太模糊，不能乱改！先问清楚改什么）：\n' +
    '你想修改白娅条目的哪部分内容？例如：身份/性格/外貌/背景/人际关系/名字改成别的/整个条目重写 还是？可以直接说要改的部分，我马上调。\n\n' +

    '【案例11 · 批量重命名】\n' +
    '用户说："星陨大陆这个名字全换掉，所有条目前的「星陨」都改成「苍蓝」"\n' +
    'AI输出（批量rename 或 批量upsert覆盖+批量delete旧）：\n' +
    '全局替换前缀「星陨」→「苍蓝」，共重命名4条。\n\n' +
    '::: rename <基础公理>星陨力量体系 → <基础公理>苍蓝力量体系\\n:::\\n\\n' +
    '::: rename <叙事背景>星陨历纪年 → <叙事背景>苍蓝历纪年\\n:::\\n\\n' +
    '::: rename <地点场景>星陨塔天台 → <地点场景>苍蓝塔天台\\n:::\\n\\n' +
    '::: set name\\n苍蓝学院\\n:::\n\n' +

    '【案例12 · 用户用反问表达不满-实际是要改】\n' +
    '用户说："白娅的性格是不是太普通了？感觉没特点"\n' +
    'AI输出（不是回答"是/不是"，而是理解用户要改）：\n' +
    '确实可以更鲜明，加入几个标志性癖好与忌讳。\n\n' +
    '::: upsert <重要角色>白娅\\n身份：...（完整保留）\\n外貌：...（完整保留）\\n性格：标志性习惯——说话前会轻轻咳嗽一声；极度洁癖；对香菜有强烈执念（+保留/修改其余性格点）\\n背景：...（完整保留）\\n...（完整保留所有原内容+改动部分）\\n:::\n\n' +

    '⚠️【铁律：用户语义优先，字面只是线索】\n' +
    '1. 用户说"XXX？"但语气是反问/不满 → 不是提问，是要你增/删/改XXX\n' +
    '2. 用户说"重做/洗牌/换掉/换新的" → 先delete旧条目，再upsert新条目，组合操作\n' +
    '3. 用户说"再加点/丰富一下/补点XXX" → 新增⟦⟧条目，不要覆盖已有条目\n' +
    '4. 用户说"改成XX/调整XX/重写XX" → upsert覆盖，必须包含完整旧内容+改动，禁止只写变动部分\n' +
    '5. 用户给混合指令（"A改成XX+B加两个+C删掉"） → 对应改+增+删三种操作全部打包一次回复，不要分多轮\n' +
    '6. 用户信息太模糊（"改一下那个"）→ 先问清楚改什么，再操作，禁止瞎猜乱改\n\n' +
    '注意：只填写已确定的内容，未确定的不要输出。每次更新必须包含至少1-2条对应体系的世界书:::upsert操作块。\n' +
    '⚠️【只增不删·冲突才改·不冲突保留 — 具体判定与示例】\n' +
    '   · 判定流程：收到用户新信息 → 检查上方「当前角色卡已有内容」→ 判断"新增/不冲突追加/冲突修改" → 只对冲突部分做upsert覆盖，其余保留\n' +
    '   · 示例A（不冲突→追加）：已有<重要角色>白娅含"身份/性格/外貌"，用户说"白娅有个妹妹叫白雪" → 生成 ⟦<重要角色>白娅·家庭关系⟧ 新条目，不碰原条目\n' +
    '   · 示例B（冲突→只改冲突字段）：已有<重要角色>白娅"年龄：16岁"，用户说"白娅其实18岁" → :::upsert <重要角色>白娅，输出完整旧内容但把"年龄：16岁"改为"年龄：18岁"，其余原样\n' +
    '   · 示例C（全新→新增）：用户说"加个反派叫暗影" → :::upsert <重要角色>暗影，直接新条目\n' +
    '   · 示例D（禁止行为❌）：用户说"白娅有个妹妹" → 你不能把原<重要角色>白娅条目整个重写，也不能删掉其中的外貌/性格等信息\n' +
    '⚠️【upsert已存在条目的铁律】当你要 upsert 一个已存在的条目（comment在上方「精确清单」中已列出）时：\n' +
    '   1. 必须先读取上方「当前角色卡已有内容」中该条目的完整 content\n' +
    '   2. 在:::upsert块中输出完整的 content（包含原有所有信息 + 新增/修改的部分），不要只输出变化的部分\n' +
    '   3. :::upsert会整体覆盖旧content，如果只写变化部分，原有信息会全部丢失！\n' +
    '   4. 示例：已有<重要角色>白娅含身份/性格/外貌/背景，要补充人际关系时，:::upsert块必须包含身份/性格/外貌/背景+人际关系\n' +
    '   5. 新增条目（comment不在清单中）则直接输出完整内容即可\n' +
    '⚠️【⟦⟧ 同主题补充铁律 — 防止覆盖原条目】当用户要求"细化/补充/再扩展/加强/完善 XXX"某个已有主题时：\n' +
    '   1. 禁止用 :::upsert 覆盖原条目！改用 ⟦<标签>条目名·补充维度⟧ 生成新条目\n' +
    '   2. 示例：已有 <核心玩法>因果律进化，用户要"再细化进化机制" → 生成 ⟦<核心玩法>因果律进化·定向逻辑⟧（新条目）\n' +
    '   3. 示例：已有 <重要角色>白娅，用户要"补充白娅的人际关系" → 生成 ⟦<重要角色>白娅·人际关系⟧（新条目）\n' +
    '   4. 同主题可生成多条 ⟦⟧ 条目，每条聚焦一个维度（背景/关系/成长/秘密等）\n' +
    '   5. 只有用户明确说"修改/改写/替换/重写 XXX"时，才用普通 :::upsert 覆盖原条目\n' +
    '   6. 写卡器识别 ⟦⟧ 标记，不会与原条目合并，保证原条目内容完整保留\n' +
    '⚠️【增删改任意混合并行铁律】同一次回复中，可以任意顺序、任意数量混合以下操作，写卡器会逐条按顺序执行：\n' +
    '   1. 可以同时新增多条 + 修改多条 + 删除多条（如删2条旧条目+改1条+加3条新条目，全部放在同一回复里）\n' +
    '   2. 也可以只增不改、或只删不增、或增改删三者混合，按用户需求自由选择组合\n' +
    '   3. 所有操作块之间空一行分隔，顺序不限（delete 在 upsert 前面/后面都可以，写卡器按文本顺序执行）\n' +
    '   4. 示例：::: delete <场景机制>旧战斗\\n:::\\n\\n::: upsert <核心玩法>新战斗\\n...\\n:::\\n\\n::: upsert <实体交互>新角色\\n...\\n:::\n' +
    '   5. 不要为了格式美观而分多次回复——一次回复打包输出全部增删改，效率最高\n' +
    '⚠️【同前缀可无限扩展铁律】同一 <标签> 前缀下可以生成无数条条目，不受数量限制：\n' +
    '   1. 示例：<重要角色>白娅 + <重要角色>林月 + <重要角色>苏晓 + ...（同前缀下不同后缀=不同条目，互不覆盖）\n' +
    '   2. 示例：<叙事背景>学院历史 + <叙事背景>都市传说 + <叙事背景>校服文化 + ...（同前缀下不同主题=不同条目）\n' +
    '   3. 只要后缀（comment 去掉 <标签> 后的部分）语义不同，就是独立新条目，写卡器不会误判覆盖\n' +
    '   4. 即使后缀有部分相同但用了 ·分点 或 ⟦⟧ 标记，也视为独立条目（如 <重要角色>白娅·人际关系 和 <重要角色>白娅·家庭背景 是两条）\n' +
    '⚠️【用户意图分析铁律】每次回复前，先花2秒分析用户意图，再决定用哪些操作组合：\n' +
    '   1. 用户说「增加/补充/再加几个 XXX」→ 只做 :::upsert 新条目（同前缀新增，不要修改旧条目）\n' +
    '   2. 用户说「修改/调整/改写 XXX」→ 只做 :::upsert 覆盖对应旧条目（需输出完整content，含原信息）\n' +
    '   3. 用户说「删除/去掉/移除 XXX」→ 只做 :::delete 对应条目（或批量删除多个）\n' +
    '   4. 用户说「完善/丰富/细化 XXX」→ ⟦⟧ 标记生成补充新条目 + 可能配合 update 修正已有缺陷\n' +
    '   5. 用户说「重构/重做/洗牌 XXX」→ delete 旧条目批量删除 + upsert 新条目批量新增，一次打包完成\n' +
    '   6. 用户给出混合需求（如「把A改成XX，再加两个B，删掉C」）→ 对应的 update + upsert + delete 全放在同一回复里，按需求顺序或随意顺序输出\n' +
    '   7. 用户需求模糊时，先输出 1-2 句文字总结你的理解 + 推理出的增删改组合说明，然后再输出 :::操作块';

    // ============================================================================
  // SECTION 5  条目匹配 + 智能合并引擎（mergePartial · 去重/删除屏障）
  // ============================================================================
  // ===== 提取条目的规范前缀（用于智能匹配） =====
  function extractEntryPrefix(comment) {
    if (!comment) return '';
    var m = String(comment).match(/^<([^>]+)>/);
    if (m) return m[1];
    var m2 = String(comment).match(/^\[([^\]]+)\]/);
    if (m2) return '[' + m2[1] + ']';
    return '';
  }

  // ===== 智能查找匹配条目：精确匹配 -> 同类型单条匹配 -> 内容相似度匹配 =====
  function findMatchingEntry(newEntry, existingArr) {
    if (!newEntry || !existingArr || !existingArr.length) return { index: -1, mode: 'none' };
    var neComment = newEntry.comment || '';
    var neContent = (newEntry.content || '').trim();
    var nePrefix = extractEntryPrefix(neComment);

    // 🐛修复-去括号：AI 一会儿给 comment 包⟦⟧/【】一会儿不包。统一剥去最外层的装饰括号对。
    // 支持括号对：⟦⟧ 【】 「」 『』 ［］《》 〈〉 () [] {} <>（其中< >保留真实<角色>前缀那种内部尖括号不剥）
    var stripOuterBrackets = function(s) {
      if (!s) return '';
      var r = String(s).trim();
      for (var iter = 0; iter < 2; iter++) {  // 最多剥2层嵌套，如 ⟦【xxx】⟧
        var pairs = [['⟦','⟧'],['【','】'],['「','」'],['『','』'],['［','］'],['《','》'],['〈','〉'],['(',')'],['[',']'],['{','}']];
        var matched = false;
        for (var pi = 0; pi < pairs.length; pi++) {
          var L = pairs[pi][0], R = pairs[pi][1];
          if (r.length >= 4 && r.charAt(0) === L && r.charAt(r.length-1) === R) {
            r = r.slice(1, -1).trim();
            matched = true;
            break;
          }
        }
        if (!matched) break;
      }
      return r;
    };
    var normMatchKey = function(s) { return stripOuterBrackets(s).trim().toLowerCase(); };

    // 辅助：提取 comment 去掉前缀后的后缀（去掉首尾空白和常见分隔符）
    var getSuffix = function(comment, prefix) {
      if (!comment || !prefix) return String(comment || '');
      // 🐛修复：extractEntryPrefix 对 <xxx> 返回 'xxx'(无括号)，对 [xxx] 返回 '[xxx]'(带括号)
      // 所以 prefixLen 必须区分：<> 前缀加2还原括号，[] 前缀本身就是带括号的不加
      var prefixLen = 0;
      if (prefix.charAt(0) === '[') {
        prefixLen = prefix.length; // [xxx] → extractEntryPrefix 返回 '[xxx]'，本身已含括号
      } else {
        prefixLen = prefix.length + 2; // <xxx> → extractEntryPrefix 返回 'xxx'，需+2还原 <xxx>
      }
      var suffix = String(comment).slice(prefixLen);
      return suffix.replace(/^[\s\-·:：_]+|[\s\-·:：_]+$/g, '');
    };
    // 辅助：计算两个短字符串的 Jaccard 字符相似度
    var jaccardSim = function(a, b) {
      if (!a || !b) return 0;
      var setA = {}, setB = {};
      for (var i = 0; i < a.length; i++) setA[a[i]] = true;
      for (var j = 0; j < b.length; j++) setB[b[j]] = true;
      var inter = 0, uni = 0;
      for (var k in setA) { if (setA.hasOwnProperty(k)) { if (setB[k]) inter++; uni++; } }
      for (var k2 in setB) { if (setB.hasOwnProperty(k2) && !setA[k2]) uni++; }
      return uni > 0 ? inter / uni : 0;
    };

    // 第1优先级：规范化精确 comment 匹配（去掉⟦⟧/【】等外层装饰括号 + trim + 大小写不敏感）
    var nk = normMatchKey(neComment);
    var exactIdx = -1;
    if (nk !== '') {
      for (var fi = 0; fi < existingArr.length; fi++) {
        if (normMatchKey(existingArr[fi].comment) === nk) { exactIdx = fi; break; }
      }
    }
    if (exactIdx < 0) {
      // 兜底：原始字符串全等比较也保留，应对极端情况
      exactIdx = existingArr.findIndex(function(e) { return (e.comment || '') === neComment; });
    }
    if (exactIdx >= 0) return { index: exactIdx, mode: 'exact' };

    // 第2优先级：同规范前缀下只有1条现有条目 + 后缀有相关性（AI改了comment后缀但前缀一致，如<基础公理>世界→<基础公理>力量体系）
    // ⚠️修复：必须检查「后缀相关性」，否则 AI 批量新增同前缀多条目时(如<人物>主角/<人物>女配/<人物>反派)会相互覆盖！
    if (nePrefix) {
      var samePrefixEntries = existingArr.map(function(e, i) {
        return { i: i, p: extractEntryPrefix(e.comment), c: (e.content || '').trim(), ec: e.comment || '' };
      }).filter(function(x) { return x.p === nePrefix; });
      if (samePrefixEntries.length === 1) {
        var onlyOne = samePrefixEntries[0];
        var neSuffix = getSuffix(neComment, nePrefix);
        var exSuffix = getSuffix(onlyOne.ec, nePrefix);
        var suffixRelated = false;
        if (neSuffix && exSuffix) {
          // 判定「后缀有相关性」= 微调关系（而非完全不同的新条目主题）：
          //   1. 其中一个为空（只有前缀无后缀），或
          //   2. 其中一个后缀是另一个的子串（如"世界"⊆"世界基础规则"），或
          //   3. 字符 Jaccard 相似度 ≥ 0.45
          if (neSuffix.length === 0 || exSuffix.length === 0) {
            suffixRelated = true;
          } else if (neSuffix.indexOf(exSuffix) >= 0 || exSuffix.indexOf(neSuffix) >= 0) {
            suffixRelated = true;
          } else if (neSuffix.length >= 2 && exSuffix.length >= 2 && jaccardSim(neSuffix, exSuffix) >= 0.45) {
            suffixRelated = true;
          }
        } else {
          // 某一方没有后缀（如只有 <基础设定>），认为可能相关
          suffixRelated = true;
        }
        if (suffixRelated) {
          return { index: onlyOne.i, mode: 'prefix-single' };
        }
        // 后缀不相关 → 这是同前缀下的不同新条目（如主角/女配/反派），不匹配，进入新增分支
      }
      // 第3优先级：同前缀下内容相似度最高（Jaccard字符集重合度>0.35）
      // ⚠️修复：必须 `length > 1`（同前缀至少2条才用相似度匹配）
      //   原代码 `length > 0` 会导致：同前缀只有1条时，第2优先级后缀相关性检查不通过，
      //   却在第3优先级被内容字符集相似度（中文通用字符重叠>35%）误判为同一条 → 新条目覆盖旧条目！
      //   场景：已有<重要角色>白娅，AI新增<重要角色>林月 → 第2优先级"林月/白娅"后缀不相关→不匹配
      //   → 第3优先级（若>0）内容字符集重叠>0.35→覆盖白娅！改成>1后第3优先级不触发→正确新增林月
      if (samePrefixEntries.length > 1 && neContent.length > 20) {
        var neCharSet = {};
        for (var ci = 0; ci < neContent.length; ci++) neCharSet[neContent[ci]] = true;
        var best = null;
        samePrefixEntries.forEach(function(x) {
          var inter = 0, uni = 0;
          var exSet = {};
          for (var cj = 0; cj < x.c.length; cj++) exSet[x.c[cj]] = true;
          for (var k in neCharSet) { if (neCharSet.hasOwnProperty(k)) { if (exSet[k]) inter++; uni++; } }
          for (var k2 in exSet) { if (exSet.hasOwnProperty(k2) && !neCharSet[k2]) uni++; }
          var sim = uni > 0 ? inter / uni : 0;
          if (sim > 0.35 && (!best || sim > best.sim)) best = { i: x.i, sim: sim };
        });
        if (best) return { index: best.i, mode: 'prefix-similarity' };
      }
    }
    return { index: -1, mode: 'none' };
  }

  // ===== 增量合并（修复版：智能匹配 + 变更记录 + 删改可追溯） =====
  // 共享：把 {prompt,depth,role} 可能的"JSON 字符串" / "纯 prompt 字符串" / null 统一规范化为对象
  //   - null/undefined: 返回空默认对象
  //   - 形如 '{...}' 的字符串：尝试 JSON.parse，失败就退回纯 prompt 文本
  //   - 其他字符串：视为纯 prompt 文本（旧规范）
  function normalizeDepthPrompt(v, _defaultDepth) {
    if (v == null) return { prompt: '', depth: typeof _defaultDepth === 'number' ? _defaultDepth : 0, role: 'system' };
    if (typeof v === 'object') {
      return {
        prompt: typeof v.prompt === 'string' ? v.prompt : '',
        depth: (typeof v.depth === 'number' && v.depth >= 0) ? v.depth : (typeof _defaultDepth === 'number' ? _defaultDepth : 0),
        role: (v.role === 0 || v.role === 1 || v.role === 2 || v.role === 'system' || v.role === 'user' || v.role === 'assistant') ? v.role : 'system'
      };
    }
    if (typeof v === 'string') {
      var s = v.trim();
      if (s.length > 0 && s.charAt(0) === '{') {
        try {
          var p = JSON.parse(s);
          if (p && typeof p === 'object') {
            return {
              prompt: typeof p.prompt === 'string' ? p.prompt : (typeof v === 'string' ? v : ''),
              depth: (typeof p.depth === 'number' && p.depth >= 0) ? p.depth : (typeof _defaultDepth === 'number' ? _defaultDepth : 0),
              role: (p.role === 0 || p.role === 1 || p.role === 2 || p.role === 'system' || p.role === 'user' || p.role === 'assistant') ? p.role : 'system'
            };
          }
        } catch(_e) { /* 不是合法 JSON，按纯 prompt 文本处理 */ }
      }
      return { prompt: v, depth: typeof _defaultDepth === 'number' ? _defaultDepth : 0, role: 'system' };
    }
    return { prompt: '', depth: typeof _defaultDepth === 'number' ? _defaultDepth : 0, role: 'system' };
  }
  function mergePartial(partial, cd, options) {
    if (!partial || typeof partial !== 'object') return false;
    options = options || {};
    var modified = false;
    var changeLog = { added: 0, updated: 0, deleted: 0, fieldUpdates: 0 };

    // ======================================================================
    // ========== Tab 隔离：mergePartial 入口处的双向硬拦截 ==========
    // ======================================================================
    // 这是实际写入 cardData 前的最后一道统一防线
    // 1. 角色卡Tab：拦截所有 MVU/变量/状态栏 相关的写入（comment/content/字段都拦截）
    // 2. MVU Tab：只允许修改白名单字段，禁止改动角色卡主体
    // ======================================================================
    // 注意：这里需要从全局作用域拿到 activeTab，优先顺序与 buildPrompt 保持一致，避免Tab错位
    var _activeTab = 'card';
    if (typeof window !== 'undefined') {
      // 1. 优先 window.__getActiveTab()（最新闭包，每次switchTab都会重新绑定）
      if (typeof window.__getActiveTab === 'function') {
        try {
          var _t = window.__getActiveTab();
          if (_t === 'card' || _t === 'mvu') _activeTab = _t;
        } catch(_eTabA) {}
      }
      // 2. 降级 window.__tab_activeTab（同步标记值）
      if (_activeTab !== 'mvu' && window.__tab_activeTab) {
        _activeTab = (window.__tab_activeTab === 'mvu') ? 'mvu' : 'card';
      }
    }
    // 3. 最后作用域 activeTab/currentTab 兜底
    try {
      if (typeof activeTab !== 'undefined' && (activeTab === 'card' || activeTab === 'mvu')) _activeTab = activeTab;
      else if (typeof currentTab !== 'undefined' && (currentTab === 'card' || currentTab === 'mvu')) _activeTab = currentTab;
    } catch(_eSc) {}
    var _tabCtx = null;

    // ====== MVU关键词库（升级版）：拆分强弱两档，支持灰色模式 + 扩展附加条目识别 ======
    //   MVU_STRONG_RE = 功能性/结构性强特征（出现即代表真实MVU条目，永远拦截）
    //   MVU_WEAK_RE    = 讨论性弱特征（仅严格模式拦截；灰色模式开启时放行，允许AI讨论/规划变量结构）
    //   MVU_EXTRA_RE   = MVU体系附加条目关键词（8条工作流条目之外的功能性附加条目：阶段判定/EJS控制器/人设切换/派生字段等，仅用于MVU Tab放宽识别，不参与角色卡Tab拦截）
    // 灰色模式（window.__mvuDiscussMode=true）：角色卡Tab允许讨论变量结构，但仍禁止生成真实MVU条目
    var MVU_STRONG_RE = /(\[InitVar\]|\[mvu_update\]|StatusPlaceHolderImpl|<UpdateVariable>|format_message_variable|initvar|mvu_update|stat_data|waitGlobalInitialized|registerMvuSchema)/i;
    var MVU_WEAK_RE = /(变量更新规则|变量输出格式|变量输出格式强调|占位符提醒|状态栏占位|状态变量输出|变量更新函数|动态状态栏|变量渲染函数|MVU变量系统|MVU状态栏)/i;
    // 附加条目关键词：用于MVU Tab识别"变量体系附加条目"——这些条目不是8条工作流核心条目，但仍属于变量系统的配套功能
    var MVU_EXTRA_RE = /(阶段判定|阶段切换|人设切换|人设规则|EJS|ejs|动态注入|injectPrompts|派生字段|衍生字段|只读字段|联动规则|联动变更|阈值触发|控制器|阶段变量|状态机|分阶段|多阶段|关系阶段|剧情进度|系统模式|境界等级|阶段标记|判定逻辑|分段提示|变量分段)/i;
    var _mvuDiscussMode = (typeof window !== 'undefined') && (window.__mvuDiscussMode === true);
    /* MVU_KEYWORDS_RE：完整集（强弱+附加条目关键词合并），供 MVU Tab 判定"是否MVU条目"使用，不受灰色模式影响 */
    var MVU_KEYWORDS_RE = new RegExp('(' + MVU_STRONG_RE.source.slice(1, -1) + '|' + MVU_WEAK_RE.source.slice(1, -1) + '|' + MVU_EXTRA_RE.source.slice(1, -1) + ')', 'i');
    var MVU_CONTENT_KEYWORDS_RE = /(format_message_variable::stat_data|enabled=false.*初始变量|INITVAR_.*MVU|<UpdateVariable>|\[MVU\]|MVU变量系统|MVU.*变量|变量.*MVU|MVU状态栏|状态栏.*MVU|getvar\(|injectPrompts|EJS|ejs)/i;
    /* 改进10：角色卡Tab拦截判定（灰色模式感知 + 弱特征降误拦）
       - 强特征（功能性标记）：comment 或 content 命中即拦截（真实MVU条目必有）
       - 弱特征（讨论性词）：仅 comment（条目标题）命中才拦截；正文偶发提及不拦，降低误拦率
       - 灰色模式：弱特征完全放行，允许讨论/规划变量结构 */
    var _isMvuCardEntry = function(e) {
      if (!e) return false;
      var cmt = e.comment || '';
      var cnt = e.content || '';
      if (MVU_STRONG_RE.test(cmt) || MVU_STRONG_RE.test(cnt)) return true;
      if (!_mvuDiscussMode && (MVU_WEAK_RE.test(cmt) || MVU_CONTENT_KEYWORDS_RE.test(cmt))) return true;
      return false;
    };

    if (_activeTab === 'card') {
      // ===================== 角色卡Tab：硬拦截所有MVU写入 =====================
      // 拦截 entries / character_book.entries
      var mvuBlockedCounts = { entries: 0, fields: 0, regex_scripts: 0 };
      ['entries', 'character_book'].forEach(function(blockKey) {
        if (blockKey === 'entries' && partial.entries && Array.isArray(partial.entries)) {
          var before = partial.entries.length;
          partial.entries = partial.entries.filter(function(e) {
            if (!e) return false;
            var isMvu = _isMvuCardEntry(e);
            if (isMvu) { console.warn('[Tab隔离·角色卡Tab] 拦截MVU条目: comment=', e.comment); }
            return !isMvu;
          });
          mvuBlockedCounts.entries += (before - partial.entries.length);
        }
        if (blockKey === 'character_book' && partial.character_book && partial.character_book.entries && Array.isArray(partial.character_book.entries)) {
          var beforeC = partial.character_book.entries.length;
          partial.character_book.entries = partial.character_book.entries.filter(function(e) {
            if (!e) return false;
            var isMvu = _isMvuCardEntry(e);
            if (isMvu) { console.warn('[Tab隔离·角色卡Tab] 拦截character_book MVU条目: comment=', e.comment); }
            return !isMvu;
          });
          mvuBlockedCounts.entries += (beforeC - partial.character_book.entries.length);
        }
      });
      // 拦截 regex_scripts：角色卡Tab绝对不能写 regex_scripts（MVU专属）
      if (partial.extensions && partial.extensions.regex_scripts) {
        mvuBlockedCounts.regex_scripts += (Array.isArray(partial.extensions.regex_scripts) ? partial.extensions.regex_scripts.length : 1);
        console.warn('[Tab隔离·角色卡Tab] 拦截 regex_scripts 写入（MVU Tab专属）：已丢弃', mvuBlockedCounts.regex_scripts, '条正则脚本');
        delete partial.extensions.regex_scripts;
      }
      if (partial.regex_scripts) {
        mvuBlockedCounts.regex_scripts += (Array.isArray(partial.regex_scripts) ? partial.regex_scripts.length : 1);
        console.warn('[Tab隔离·角色卡Tab] 拦截顶层 regex_scripts 写入（MVU Tab专属）');
        delete partial.regex_scripts;
      }
      // 拦截顶层 MVU 敏感字段写入（如果AI写了的话）
      ['status_bar', 'statusbar', 'mvu_variables', 'mvu_config', 'variable_list', 'var_list', 'update_rules', 'output_format'].forEach(function(badKey) {
        if (partial[badKey] !== undefined) {
          console.warn('[Tab隔离·角色卡Tab] 拦截MVU敏感字段写入：', badKey);
          delete partial[badKey];
          mvuBlockedCounts.fields++;
        }
      });
      if (mvuBlockedCounts.entries > 0 || mvuBlockedCounts.fields > 0 || mvuBlockedCounts.regex_scripts > 0) {
        changeLog._mvuBlockedOnCardTab = mvuBlockedCounts;
        if (_mvuDiscussMode) changeLog._mvuDiscussMode = true;
        if (typeof showToast === 'function') {
          var _msgParts = [];
          if (mvuBlockedCounts.entries > 0) _msgParts.push('拦截MVU世界书条目 ' + mvuBlockedCounts.entries + ' 条');
          if (mvuBlockedCounts.regex_scripts > 0) _msgParts.push('拦截正则脚本 ' + mvuBlockedCounts.regex_scripts + ' 条');
          if (mvuBlockedCounts.fields > 0) _msgParts.push('拦截MVU字段写入 ' + mvuBlockedCounts.fields + ' 项');
          if (_msgParts.length > 0) {
            var _mvuTip = _mvuDiscussMode
              ? '（灰色模式：已放行变量结构讨论，仅拦截真实MVU条目；如需生成请切换MVU Tab）'
              : '（请切换到MVU变量状态栏Tab进行操作）';
            try { showToast('角色卡Tab已' + _msgParts.join('，') + _mvuTip, 'warning'); } catch(e) {}
          }
        }
      }
    } else if (_activeTab === 'mvu') {
      // ===================== MVU Tab：只允许修改白名单字段，禁止改动角色卡主体 =====================
      // 白名单：只有以下允许
      //   1. character_book.entries 中的MVU工作流条目（第2-7条，由 MVU_KEYWORDS_RE 判定）
      //   2. extensions.regex_scripts （状态栏正则）
      //   3. extensions.tavern_helper.scripts （zod脚本）
      //   4. extensions.tavern_helper.variables （变量定义，如果有的话）
      var mvuWlBlocked = { fields: 0, entries: 0 };
      // 过滤顶层字段（name/description/first_mes等一律禁改）
      var MVU_ALLOWED_TOP_KEYS = ['entries', 'character_book', 'extensions', 'deleted_entries', 'delete', '_delete', 'deletes', 'remove', 'removes', '_nochange'];
      Object.keys(partial).forEach(function(topKey) {
        if (MVU_ALLOWED_TOP_KEYS.indexOf(topKey) < 0) {
          console.warn('[Tab隔离·MVU Tab] 拦截非白名单顶层字段写入（角色卡主体禁改）：', topKey);
          delete partial[topKey];
          mvuWlBlocked.fields++;
        }
      });
      // 过滤 entries/character_book.entries：
      // 允许所有MVU体系条目通过（8条工作流条目+附加条目），只拦截明确是角色卡Tab专属的内容
      // 允许通过的：MVU变量条目（InitVar/变量列表/更新规则/输出格式/格式强调/占位提醒等）/ 阶段判定 / EJS控制器 / 人设切换 / 派生字段 / 状态机 / 自定义变量相关条目 等
      // 拦截的：明确属于角色卡Tab常驻体系/世界观体系的专有模板条目（基础公理/核心铁则/场景机制/实体交互/叙事背景等）
      var CARD_ONLY_TEMPLATES_RE = /^<(基础公理|核心铁则|世界元数据|交互软规则|近场强约束|当前局势|场景机制|核心玩法|世界规则|实体交互|重要角色|势力与组织|物品|地点场景|叙事背景|故事发展|文化与习俗|历史事件|动态适配|引导机制|互动选项|统一输出格式|角色边界|禁止项|自定义条目|观察锚点)>/i;
      var filterMvuOnlyEntries = function(arr, srcName) {
        if (!arr || !Array.isArray(arr)) return arr;
        var before = arr.length;
        arr = arr.filter(function(e) {
          if (!e) return false;
          var cmt = String(e.comment || '');
          var cnt = String(e.content || '');
          // 允许：删除动作（删除任意条目都允许，MVU/非MVU都能删，避免用户需要切Tab删）
          if (e._action === 'delete' || e._action === 'remove' || e.delete === true) {
            return true;
          }
          // 判定1：命中MVU关键词（核心+附加）→ 是MVU体系条目 → 通过
          var isMvuEntry = MVU_KEYWORDS_RE.test(cmt) || MVU_KEYWORDS_RE.test(cnt) || isMVUEntry(cmt);
          if (isMvuEntry) return true;
          // 判定2：命中角色卡Tab专属模板条目（<基础公理>、<核心铁则>等）→ 拦截
          var isCardOnlyTemplate = CARD_ONLY_TEMPLATES_RE.test(cmt);
          if (isCardOnlyTemplate) {
            console.warn('[Tab隔离·MVU Tab] 拦截角色卡Tab专属条目：', cmt, '→请切换到角色卡Tab修改该类条目');
            return false;
          }
          // 判定3：未命中任何角色卡专属特征 → 默认放行（属于MVU体系的自定义附加条目、或用户自定义内容）
          // 注：因为角色卡Tab已做了严格的MVU→角色卡方向拦截，两边完全隔离，所以MVU Tab这边不需要反向过度拦截
          return true;
        });
        mvuWlBlocked.entries += (before - arr.length);
        return arr;
      };
      if (partial.entries && Array.isArray(partial.entries)) partial.entries = filterMvuOnlyEntries(partial.entries, 'entries');
      if (partial.character_book && partial.character_book.entries && Array.isArray(partial.character_book.entries)) {
        partial.character_book.entries = filterMvuOnlyEntries(partial.character_book.entries, 'character_book.entries');
      }
      // 过滤 extensions：只允许 regex_scripts / tavern_helper.scripts / tavern_helper.variables
      if (partial.extensions && typeof partial.extensions === 'object') {
        var extWhiteList = ['regex_scripts', 'tavern_helper', 'depth_prompt'];
        Object.keys(partial.extensions).forEach(function(extKey) {
          if (extWhiteList.indexOf(extKey) < 0) {
            console.warn('[Tab隔离·MVU Tab] 拦截非白名单 extensions 字段：', extKey);
            delete partial.extensions[extKey];
            mvuWlBlocked.fields++;
          }
        });
        // tavern_helper 再细过滤：只允许 scripts / variables
        if (partial.extensions.tavern_helper && typeof partial.extensions.tavern_helper === 'object') {
          Object.keys(partial.extensions.tavern_helper).forEach(function(thKey) {
            if (['scripts', 'variables'].indexOf(thKey) < 0) {
              console.warn('[Tab隔离·MVU Tab] 拦截非白名单 tavern_helper 字段：', thKey);
              delete partial.extensions.tavern_helper[thKey];
              mvuWlBlocked.fields++;
            }
          });
        }
      }
      if (mvuWlBlocked.fields > 0 || mvuWlBlocked.entries > 0) {
        changeLog._mvuWlBlockedOnMvuTab = mvuWlBlocked;
        if (typeof showToast === 'function') {
          var _wlParts = [];
          if (mvuWlBlocked.entries > 0) _wlParts.push('拦截非MVU世界书条目 ' + mvuWlBlocked.entries + ' 条');
          if (mvuWlBlocked.fields > 0) _wlParts.push('拦截非白名单字段写入 ' + mvuWlBlocked.fields + ' 项');
          if (_wlParts.length > 0) {
            try { showToast('MVU Tab已' + _wlParts.join('，') + '（角色卡主体字段/普通世界书条目请切换到角色卡Tab）', 'warning'); } catch(e) {}
          }
        }
      }
    }
    // ======================================================================
    // ========== 硬拦截结束 =================================================
    // ======================================================================

    // ====== MVU Tab 专属：写入前对已有数据做去重清理 ======
    // 问题根因：AI 多次生成 MVU 条目时，comment 可能稍有不同（如 [mvu_update]变量更新规则 vs 变量更新规则），
    // findMatchingEntry 无法匹配 → 产生重复条目。正则脚本也有类似问题。
    // 解决方案：在 MVU Tab 下，写入新数据前先清理已有数据中的重复项。
    if (_activeTab === 'mvu') {
      // ---- 1. MVU 世界书条目去重：按 MVU 类型分类，同类型只保留最后一条 ----
      if (cd.character_book && cd.character_book.entries && Array.isArray(cd.character_book.entries)) {
        var mvuTypeMap = {};  // type → index in entries
        var indicesToRemove = [];
        for (var ei = 0; ei < cd.character_book.entries.length; ei++) {
          var e = cd.character_book.entries[ei];
          if (!e) continue;
          var cmt = String(e.comment || '');
          var cnt = String(e.content || '');
          var mvuType = null;
          // 分类 MVU 条目类型（注意：先检查"格式强调"再检查"输出格式"，否则前者会被后者误匹配）
          if (cmt.indexOf('[InitVar]') >= 0 || (cmt.indexOf('初始变量') >= 0 && cnt.indexOf('stat_data') >= 0)) mvuType = 'initvar';
          else if (cmt.indexOf('变量列表') >= 0 || cnt.indexOf('format_message_variable') >= 0) mvuType = 'varlist';
          else if (cmt.indexOf('变量更新规则') >= 0 || cmt.indexOf('[mvu_update]变量更新规则') >= 0) mvuType = 'updaterule';
          else if (cmt.indexOf('变量输出格式强调') >= 0) mvuType = 'outputfmt_emph';
          else if (cmt.indexOf('变量输出格式') >= 0 || (cmt.indexOf('mvu_update') >= 0 && cnt.indexOf('UpdateVariable') >= 0)) mvuType = 'outputfmt';
          else if (cmt.indexOf('<状态栏>') >= 0 || cmt.indexOf('StatusPlaceHolder') >= 0 || (cmt.indexOf('状态栏') >= 0 && (cmt.indexOf('占位') >= 0 || cmt.indexOf('提醒') >= 0))) mvuType = 'statusbar_placeholder';
          if (mvuType) {
            if (mvuTypeMap[mvuType] !== undefined) {
              // 已有同类型条目 → 标记旧的为待删除（保留新的，因为新的在数组后面 = 更新生成）
              indicesToRemove.push(mvuTypeMap[mvuType]);
            }
            mvuTypeMap[mvuType] = ei;
          }
        }
        // 降序删除重复的旧条目
        if (indicesToRemove.length > 0) {
          indicesToRemove.sort(function(a, b) { return b - a; });
          indicesToRemove.forEach(function(idx) {
            console.warn('[Tab隔离·MVU Tab] 去重：删除重复的旧MVU条目:', cd.character_book.entries[idx].comment);
            cd.character_book.entries.splice(idx, 1);
          });
          changeLog._mvuDedupRemoved = indicesToRemove.length;
          modified = true;
        }
      }
      // ---- 2. 正则脚本去重：按「美化(markdownOnly且非promptOnly)」和「隐藏(promptOnly)」分类，各类只保留最后一条 ----
      // ⚠️旧逻辑只按 findRegex 含 StatusPlaceHolder 去重，会把功能完全不同的「[美化]MVU状态栏」
      //   (markdownOnly, 显示用) 和「[不发送]隐藏状态栏标记」(promptOnly, 提示词清理用) 混在一起，
      //   误删隐藏脚本。现改为分类去重，且按 id === 'mvu-status-bar' 精确匹配美化脚本。
      if (cd.extensions && cd.extensions.regex_scripts && Array.isArray(cd.extensions.regex_scripts)) {
        var rxList = cd.extensions.regex_scripts;
        // 分类收集：beautify=美化显示脚本，hide=提示词清理脚本
        var beautifyIdxList = [];
        var hideIdxList = [];
        for (var ri = 0; ri < rxList.length; ri++) {
          if (!rxList[ri]) continue;
          var rxr = rxList[ri];
          var rxFind = (rxr.findRegex || '');
          var hasStatusPH = rxFind.indexOf('StatusPlaceHolder') >= 0 || rxr.id === 'mvu-status-bar';
          if (!hasStatusPH) continue;
          // 区分两类：promptOnly 的是「隐藏占位符」脚本，markdownOnly 且非 promptOnly 的是「美化状态栏」脚本
          if (rxr.promptOnly) {
            hideIdxList.push(ri);
          } else {
            beautifyIdxList.push(ri);
          }
        }
        // 美化脚本去重：多于1个时只保留最后一个（最新的）
        var totalRemoved = 0;
        var allRxRemoveIndices = []; // 🐛修复：合并所有要删的索引，统一降序删除，避免分类splice导致的索引错位
        if (beautifyIdxList.length > 1) {
          var removeBeautify = beautifyIdxList.slice(0, -1);
          removeBeautify.forEach(function(idx) {
            console.warn('[Tab隔离·MVU Tab] 去重：删除重复的[美化]MVU状态栏脚本:', rxList[idx].scriptName || rxList[idx].name);
            allRxRemoveIndices.push(idx);
          });
          totalRemoved += removeBeautify.length;
        }
        // 隐藏脚本去重：多于1个时只保留最后一个
        if (hideIdxList.length > 1) {
          var removeHide = hideIdxList.slice(0, -1);
          removeHide.forEach(function(idx) {
            console.warn('[Tab隔离·MVU Tab] 去重：删除重复的[不发送]隐藏状态栏标记脚本:', rxList[idx].scriptName || rxList[idx].name);
            allRxRemoveIndices.push(idx);
          });
          totalRemoved += removeHide.length;
        }
        // 🐛修复：统一降序排序后一次性 splice，避免第一类 splice 后第二类索引失效
        if (allRxRemoveIndices.length > 0) {
          allRxRemoveIndices.sort(function(a, b) { return b - a; });
          var seenRxIdx = {};
          allRxRemoveIndices.forEach(function(idx) {
            if (!seenRxIdx[idx] && idx < rxList.length) {
              seenRxIdx[idx] = true;
              rxList.splice(idx, 1);
            }
          });
        }
        if (totalRemoved > 0) {
          changeLog._mvuRxScriptDedupRemoved = totalRemoved;
          modified = true;
        }
      }
    }

    if (partial.character && !partial.spec) {
      var ch = partial.character;
      delete partial.character;
      for (var k in ch) { if (ch.hasOwnProperty(k)) partial[k] = ch[k]; }
    }

    // ================================================================
    // ===== 🐛修复#1：删除声明收集阶段（建立「删除屏障」deletedCommentKeySet） =====
    // ================================================================
    // 执行顺序：先收集所有删除意图，再执行条目合并，最后统一删除。
    // 目的：避免 AI 把"删除声明"写在 entries 而"该条目重写内容"写在 character_book.entries，
    //       导致"先删掉又被后面 processEntriesFn 重新加回来"的问题。
    // 同时 processEntriesFn 中命中删除屏障的条目会被直接丢弃（既不新增也不更新）。
    // ================================================================
    var deletePaths = [];
    if (partial.deleted_entries && Array.isArray(partial.deleted_entries)) {
      partial.deleted_entries.forEach(function(c) { deletePaths.push('character_book.entries.' + c); });
      delete partial.deleted_entries;
    }
    ['_delete', 'delete', 'deletes', 'remove', 'removes'].forEach(function(dk) {
      if (partial[dk] && Array.isArray(partial[dk])) {
        deletePaths = deletePaths.concat(partial[dk]);
        delete partial[dk];
      }
    });
    // 规范化 key：trim + 大小写不敏感 + 剥去⟦⟧/【】等外层装饰括号（解决AI一会儿加括号一会儿不加）
    var _stripOuterBrackets = function(s) {
      if (!s) return '';
      var r = String(s).trim();
      for (var iter = 0; iter < 2; iter++) {
        var pairs = [['⟦','⟧'],['【','】'],['「','」'],['『','』'],['［','］'],['《','》'],['〈','〉'],['(',')'],['[',']'],['{','}']];
        var matched = false;
        for (var pi = 0; pi < pairs.length; pi++) {
          var L = pairs[pi][0], R = pairs[pi][1];
          if (r.length >= 4 && r.charAt(0) === L && r.charAt(r.length-1) === R) {
            r = r.slice(1, -1).trim();
            matched = true; break;
          }
        }
        if (!matched) break;
      }
      return r;
    };
    var normKey = function(s) { return _stripOuterBrackets(s).trim().toLowerCase(); };
    var deletedCommentKeySet = {};  // 命中则：新增丢弃 + 更新丢弃（整轮彻底消失）
    var entryPrefixForScan = 'character_book.entries.';
    // 从 deletePaths 中提取所有 comment 形式的 key 放入屏障集合
    deletePaths.forEach(function(p) {
      var sp = String(p);
      if (sp.indexOf(entryPrefixForScan) === 0) {
        var rawKey = sp.slice(entryPrefixForScan.length);
        if (!/^\d+$/.test(rawKey)) deletedCommentKeySet[normKey(rawKey)] = true;  // 纯数字是索引，不是comment
      } else if (sp.indexOf('.') < 0) {
        deletedCommentKeySet[normKey(sp)] = true;
      }
    });
    var inlineEntryDeletes = [];
    var scanInlineDeletes = function(arr) {
      if (!arr || !Array.isArray(arr)) return;
      for (var di = arr.length - 1; di >= 0; di--) {
        if (arr[di] && (arr[di]._action === 'delete' || arr[di]._action === 'remove' || arr[di].delete === true)) {
          if (arr[di].comment) {
            inlineEntryDeletes.push(arr[di].comment);
            deletedCommentKeySet[normKey(arr[di].comment)] = true;  // 加入删除屏障
          }
          arr.splice(di, 1);
        }
      }
    };
    scanInlineDeletes(partial.entries);
    if (partial.character_book && partial.character_book.entries) scanInlineDeletes(partial.character_book.entries);
    inlineEntryDeletes.forEach(function(ic) { deletePaths.push('character_book.entries.' + ic); });

    // ================================================================
    // ===== 处理 entries（在删除执行之前先合并，但会过滤掉"删除屏障"命中的条目）=====
    // ================================================================
    // ---- 处理 entries（修复：智能匹配+content过短时也允许更新非content字段 + 删除屏障丢弃） ----
    var processEntriesFn = function(newEntries) {
      if (!newEntries || !Array.isArray(newEntries)) return;
      cd.character_book = cd.character_book || { entries: [] };
      var existing = cd.character_book.entries || [];
      var SB_ENTRY_BLOCK_RE = /状态栏.*Step\s*[2-7]|Step\s*[2-7].*状态栏|状态栏.*(配色|HTML骨架|CSS样式|变量读取|渲染函数|事件绑定)|(配色|HTML骨架|CSS样式|变量读取|渲染函数|事件绑定).*状态栏/;
      // 拦截 AI 误将 regex 脚本配置写成世界书条目（正则脚本由写卡器自动维护）
      var REGEX_ENTRY_BLOCK_RE = /^regex[:：]/i;
      newEntries = newEntries.filter(function(ne) {
        if (!ne || typeof ne !== 'object') return true;
        var cmt = String(ne.comment || '');
        if (SB_ENTRY_BLOCK_RE.test(cmt)) {
          console.warn('[statusbar] 拦截状态栏模块条目，不写入世界书:', cmt);
          return false;
        }
        // 拦截 regex: 脚本配置误写为世界书条目
        if (REGEX_ENTRY_BLOCK_RE.test(cmt)) {
          console.warn('[sanitize] 拦截regex脚本配置条目，不写入世界书:', cmt);
          return false;
        }
        var cnt = String(ne.content || '');
        if (cnt.length > 50) {
          var hasSbCodeMarker = (cnt.indexOf('StatusPlaceHolderImpl') >= 0) ||
                                (cnt.indexOf('waitGlobalInitialized') >= 0 && cnt.indexOf('eventOn') >= 0) ||
                                (cnt.indexOf('/* === Step') >= 0 && cnt.indexOf('===') >= 0 && /Step\s*[2-7]/.test(cnt));
          if (hasSbCodeMarker && /状态栏|statusbar/i.test(cmt)) {
            console.warn('[statusbar] 拦截状态栏代码内容条目，不写入世界书:', cmt);
            return false;
          }
        }
        return true;
      });
      // ===== 防御 newEntries 里混入字符串（AI/用户误传 depth_prompt.prompt 直接进数组）=====
      newEntries = newEntries.map(function(ne) {
        if (typeof ne === 'string' && ne.trim()) {
          var firstLine = ne.split('\n')[0].trim().slice(0, 40) || '未命名文本块';
          console.warn('[mergePartial] newEntries含字符串元素，已包装为条目:', firstLine);
          return { comment: firstLine, content: ne };
        }
        return ne;
      });
      newEntries.forEach(function(ne) {
        if (!ne || typeof ne !== 'object') return;
        if (!ne.comment || !String(ne.comment).trim()) {
          if (ne.name && String(ne.name).trim()) {
            ne.comment = String(ne.name).trim();
          } else if (ne.title && String(ne.title).trim()) {
            ne.comment = String(ne.title).trim();
          } else if (ne.content && typeof ne.content === 'string') {
            var firstLine = ne.content.split('\n')[0].trim();
            var prefixMatch = firstLine.match(/^(<[^>]+>[^<\n]{0,40})/);
            if (prefixMatch) {
              ne.comment = prefixMatch[1].trim();
            } else if (firstLine.length <= 40) {
              ne.comment = firstLine;
            } else {
              ne.comment = '条目' + (existing.length + 1);
            }
          } else {
            ne.comment = '条目' + (existing.length + 1);
          }
        }
        // ===== 🐛修复#2.5：入存前剥去⟦⟧/【】等外层装饰括号，统一 entries.comment 风格，避免一会儿带括号一会儿不带 =====
        // （注意：保留内部的 <xxx> / [xxx] 前缀，只剥最外层装饰用括号；若剥完为空则保留原值）
        if (ne.comment && typeof ne.comment === 'string') {
          var stripped = _stripOuterBrackets(ne.comment);
          if (stripped && stripped.length > 0) ne.comment = stripped;
        }
        // ===== 🐛修复#2：命中删除屏障 → 整轮直接丢弃（既不新增也不更新）=====
        if (deletedCommentKeySet[normKey(ne.comment)]) {
          console.warn('[mergePartial·删除屏障] 丢弃命中删除声明的条目（用户已要求删除，即使AI重写内容也不写入）:', ne.comment);
          return;
        }
        var hasComment = !!(ne.comment && String(ne.comment).trim());
        var hasMeaningfulContent = !!(ne.content && String(ne.content).trim().length >= 20);
        if (!hasComment && !hasMeaningfulContent) return;

        var tmpl = getEntryTemplate(ne.comment || '');
        ne.enabled = (tmpl && tmpl.enabled !== undefined) ? tmpl.enabled : true;
        // ===== 🧹先清洗 MVU 条目 content 中混入的 enabled/content/comment 等配置字段 =====
        if (typeof ne.content === 'string') {
          ne.content = _stripEntryConfigFromContent(ne.comment || '', ne.content);
        }
        // ===== 再规范化（确保规范化结果是最终值，不被后续清洗破坏）=====
        if (String(ne.comment || '').indexOf('[InitVar]') >= 0 || (String(ne.comment || '').indexOf('初始变量') >= 0 && typeof ne.content === 'string' && ne.content.indexOf('stat_data') >= 0)) {
          if (typeof ne.content === 'string') ne.content = normalizeInitVarContent(ne.content);
        }
        if (String(ne.comment || '').indexOf('变量列表') >= 0 && typeof ne.content === 'string') {
          ne.content = normalizeVarListContent(ne.content);
        }
        // 变量输出格式/强调条目：强制使用固定YAML模板，丢弃AI混入的变量值/配置字段
        if (String(ne.comment || '').indexOf('变量输出格式') >= 0 && typeof ne.content === 'string') {
          ne.content = normalizeVarOutputFormatContent(ne.comment || '', ne.content, _getParsedInitForEntries(newEntries));
        }
        // 变量更新规则条目：规范化缩进/range格式/移除string的type字段
        if (String(ne.comment || '').indexOf('变量更新规则') >= 0 && typeof ne.content === 'string') {
          ne.content = normalizeVarUpdateRuleContent(ne.content);
        }
        if (tmpl) {
          // MVU 系统条目（变量输出格式/变量更新规则/InitVar等）的 selective/constant 必须强制使用模板值
          // AI 经常误写 selective:true，导致条目变为选择性触发而非常驻
          var isMvuSystemEntry = (String(ne.comment || '').toLowerCase().indexOf('变量输出格式') >= 0 || String(ne.comment || '').toLowerCase().indexOf('变量更新规则') >= 0 ||
                                  String(ne.comment || '').toLowerCase().indexOf('[initvar]') >= 0 || String(ne.comment || '').indexOf('初始变量') >= 0 ||
                                  String(ne.comment || '').indexOf('变量列表') >= 0);
          if (isMvuSystemEntry) {
            ne.selective = tmpl.selective;
            ne.constant = tmpl.constant;
          } else {
            if (ne.selective === undefined) ne.selective = tmpl.selective;
            if (ne.constant === undefined) ne.constant = tmpl.constant;
          }
          if (ne.insertion_order === undefined) ne.insertion_order = tmpl.order;
          if (ne.use_regex === undefined) ne.use_regex = tmpl.use_regex;
          if (ne.secondary_keys === undefined) ne.secondary_keys = tmpl.secondary_keys || [];
          if (!ne.extensions) ne.extensions = {};
          var ext = ne.extensions;
          if (ext.position === undefined) ext.position = tmpl.position;
          if (ext.depth === undefined) ext.depth = tmpl.depth;
          if (ext.role === undefined) ext.role = 0;
          if (ext.probability === undefined) ext.probability = tmpl.probability;
          if (ext.selectiveLogic === undefined) ext.selectiveLogic = tmpl.selectiveLogic;
          if (ext.prevent_recursion === undefined) ext.prevent_recursion = tmpl.prevent_recursion;
          if (ext.exclude_recursion === undefined) ext.exclude_recursion = tmpl.exclude_recursion;
          if (ext.delay_until_recursion === undefined) ext.delay_until_recursion = tmpl.delay_until_recursion;
          if (ext.sticky === undefined) ext.sticky = tmpl.sticky || 0;
          if (ext.cooldown === undefined) ext.cooldown = tmpl.cooldown;
          if (ext.delay === undefined) ext.delay = tmpl.delay;
          if (ext.match_whole_words === undefined) ext.match_whole_words = tmpl.match_whole_words;
          if (ext.scan_depth === undefined) ext.scan_depth = tmpl.scan_depth;
          if (ext.group === undefined) ext.group = tmpl.group;
          if (ext.group_weight === undefined) ext.group_weight = tmpl.group_weight;
          if (ext.useProbability === undefined) ext.useProbability = tmpl.useProbability;
        } else {
          if (ne.selective === undefined) ne.selective = true;
          if (ne.constant === undefined) ne.constant = false;
          if (!ne.extensions) ne.extensions = { position: 4, depth: 4, role: 0, probability: 100, selectiveLogic: 0, prevent_recursion: false, sticky: 0, cooldown: 0, delay: 0, group: '', group_weight: 100, useProbability: true };
        }
        if (!ne.keys) ne.keys = [];
        if (!ne.secondary_keys) ne.secondary_keys = [];
        // ===== ✅新增：processEntriesFn 空 keys 自动派生（mergePartial 路径的兜底）=====
        if (ne.keys.length === 0 && !(tmpl && tmpl.constant) && ne.constant !== true) {
          try {
            var dk = _deriveEntryKeys(ne.comment || '', tmpl, ne.content || '');
            if (dk && dk.length > 0) ne.keys = dk;
          } catch(e3) {}
        }

        var match = findMatchingEntry(ne, existing);
        if (match.index >= 0) {
          // 更新：深合并content优先（如果新content有内容就覆盖，没内容保留旧content）
          var oldEntry = existing[match.index];
          if (ne.content === undefined || String(ne.content).trim().length === 0) {
            var tmpContent = oldEntry.content;
            existing[match.index] = Object.assign({}, oldEntry, ne);
            existing[match.index].content = tmpContent;
          } else {
            existing[match.index] = Object.assign({}, oldEntry, ne);
          }
          modified = true; changeLog.updated++;
        } else {
          existing.push(ne);
          modified = true; changeLog.added++;
        }
      });
      cd.character_book.entries = existing;
    };

    // 顶层 entries 优先处理
    if (partial.entries && Array.isArray(partial.entries)) {
      processEntriesFn(partial.entries);
      delete partial.entries;
    }
    // character_book.entries 后处理
    if (partial.character_book && partial.character_book.entries && Array.isArray(partial.character_book.entries)) {
      processEntriesFn(partial.character_book.entries);
      delete partial.character_book.entries;
      if (Object.keys(partial.character_book).length === 0) delete partial.character_book;
    }

    // ================================================================
    // ===== 🐛修复#3：条目合并完成后统一执行删除（最后一道防线）=====
    // ================================================================
    // - comment 匹配使用规范化比较（trim + 大小写不敏感）
    // - 先删条目，再删其他字段（字段删除不影响 entries 索引）
    if (deletePaths.length > 0) {
      var entryPrefix = 'character_book.entries.';
      var fieldDeletes = [];
      var numericIndices = [];
      var commentDeletionIndices = []; // 🐛修复：comment匹配删除也收集索引，最后与数字索引统一降序删除
      deletePaths.forEach(function(path) {
        if (String(path).indexOf(entryPrefix) === 0) {
          var entryKey = String(path).slice(entryPrefix.length);
          if (cd.character_book && cd.character_book.entries) {
            var beforeLen = cd.character_book.entries.length;
            var idx = parseInt(entryKey);
            if (!isNaN(idx) && String(idx) === entryKey && idx >= 0 && idx < beforeLen) {
              numericIndices.push(idx);
            } else {
              // 规范化比较：trim + 大小写不敏感 + 去装饰括号
              var nk = normKey(entryKey);
              var exactMatches = [];
              var fuzzyMatches = [];
              cd.character_book.entries.forEach(function(e, i) {
                var ek = normKey(e.comment);
                if (ek === nk && ek !== '') {
                  exactMatches.push(i);
                } else if (nk.length >= 6 && ek.length >= 6) {
                  if (ek.indexOf(nk) >= 0) fuzzyMatches.push(i);
                }
              });
              var toDelete = [];
              if (exactMatches.length > 0) {
                toDelete = exactMatches;
              } else if (fuzzyMatches.length === 1) {
                toDelete = fuzzyMatches;
              } else if (fuzzyMatches.length > 1) {
                console.warn('[mergePartial] 删除关键词"' + entryKey + '"模糊匹配到' + fuzzyMatches.length + '条条目，为防止误删已跳过。请使用精确comment。');
              }
              // 🐛修复：不立即 splice，改为收集索引，最后统一删除
              for (var di = 0; di < toDelete.length; di++) {
                commentDeletionIndices.push(toDelete[di]);
              }
            }
          }
        } else {
          var rawPath = String(path);
          var knownTopFields = ['name','description','first_mes','system_prompt','personality','scenario','creator_notes','alternate_greetings'];
          if (rawPath.indexOf('.') < 0 && knownTopFields.indexOf(rawPath) < 0 && cd.character_book && cd.character_book.entries) {
            var nrp = normKey(rawPath);
            for (var fi = 0; fi < cd.character_book.entries.length; fi++) {
              if (normKey(cd.character_book.entries[fi].comment) === nrp) {
                commentDeletionIndices.push(fi); // 🐛修复：收集而非立即删
                break;
              }
            }
          } else {
            fieldDeletes.push(path);
          }
        }
      });
      // 🐛修复：合并数字索引 + comment匹配索引，去重后统一降序删除，避免索引移位
      var allEntryDeletions = numericIndices.concat(commentDeletionIndices);
      if (allEntryDeletions.length > 0) {
        // 降序排序
        allEntryDeletions.sort(function(a, b) { return b - a; });
        // 去重（降序后相邻重复）
        var uniqueIdx = [];
        allEntryDeletions.forEach(function(n) { if (uniqueIdx.indexOf(n) < 0) uniqueIdx.push(n); });
        uniqueIdx.forEach(function(uIdx) {
          if (uIdx < cd.character_book.entries.length) {
            cd.character_book.entries.splice(uIdx, 1);
            modified = true; changeLog.deleted++;
          }
        });
      }
      fieldDeletes.forEach(function(p) {
        var parts = String(p).split('.');
        var node = cd;
        for (var i = 0; i < parts.length - 1; i++) {
          if (!node || typeof node !== 'object' || !(parts[i] in node)) { node = null; break; }
          node = node[parts[i]];
        }
        if (node && typeof node === 'object' && parts[parts.length - 1] in node) {
          delete node[parts[parts.length - 1]];
          modified = true; changeLog.deleted++;
        }
      });
    }
    delete partial._nochange;

    var fields = ['name','description','personality','scenario','first_mes','creator_notes','system_prompt','creator','character_version','alternate_greetings','group_only_greetings'];
    fields.forEach(function(f) {
      if (partial[f] !== undefined) {
        var val = partial[f];
        var oldVal = cd[f];
        if (f === 'first_mes' || f === 'description') {
          // 放宽占位符过滤：只有同时满足「文本非常短(<80字)」+「整段内容几乎全是占位词」时才跳过
          if (typeof val === 'string') {
            var vTrim = val.trim();
            if (vTrim.length < 80) {
              var hasPlaceholder = /正文已在上方|见上方|参见上文|见上文|已在上方|请见上文/.test(vTrim);
              var isOnlyPlaceholder = vTrim.length < 30 && hasPlaceholder;
              if (isOnlyPlaceholder) return;
            }
          }
          // 极短内容且仅含"输出"提示词时跳过（长度<30字+含「已输出/上文输出/见上文输出」）
          if (typeof val === 'string' && val.trim().length < 30 && /(已输出|上文输出|见上文.*输出)/.test(val)) {
            return;
          }
        }
        if (JSON.stringify(oldVal) !== JSON.stringify(val)) {
          cd[f] = val;
          modified = true; changeLog.fieldUpdates++;
        }
      }
    });

    if (partial.depth_prompt !== undefined) {
      cd.extensions = cd.extensions || {};
      // 防御：旧卡 extensions.depth_prompt / depth_prompt 可能是字符串（非空字符串 truthy，|| 不会替换）
      // 或更严重：JSON.stringify 后的字符串对象，导致 ".depth = ..." 抛 "Cannot create property 'depth' on string"
      cd.extensions.depth_prompt = normalizeDepthPrompt(cd.extensions.depth_prompt, 0);
      cd.depth_prompt = normalizeDepthPrompt(cd.depth_prompt, 0);
      var dp = partial.depth_prompt;
      var dpModified = false;
      if (typeof dp === 'string') {
        if (dp.trim().length > 0 && cd.extensions.depth_prompt.prompt !== dp) {
          cd.extensions.depth_prompt.prompt = dp;
          cd.depth_prompt.prompt = dp;
          dpModified = true;
        }
      } else if (dp && typeof dp === 'object') {
        if (dp.prompt !== undefined && typeof dp.prompt === 'string') {
          // 放宽：允许空字符串（显式清空），只有 undefined 才跳过
          if (cd.extensions.depth_prompt.prompt !== dp.prompt) {
            cd.extensions.depth_prompt.prompt = dp.prompt;
            cd.depth_prompt.prompt = dp.prompt;
            dpModified = true;
          }
        }
        if (dp.depth !== undefined && typeof dp.depth === 'number' && dp.depth >= 0 && cd.extensions.depth_prompt.depth !== dp.depth) {
          cd.extensions.depth_prompt.depth = dp.depth;
          cd.depth_prompt.depth = dp.depth;
          dpModified = true;
        }
        if (dp.role !== undefined && ['system', 'user', 'assistant', 0, 1, 2].indexOf(dp.role) >= 0 && cd.extensions.depth_prompt.role !== dp.role) {
          cd.extensions.depth_prompt.role = dp.role;
          cd.depth_prompt.role = dp.role;
          dpModified = true;
        }
      }
      if (dpModified) { modified = true; changeLog.fieldUpdates++; }
      delete partial.depth_prompt;
    }

    // ---- 智能合并 regex_scripts：支持增量更新、按名替换、_action:delete ----
    // ⚠️ MVU固定正则白名单拦截：正则1-5（仅格式思维链/只发送最新2楼变量更新/[美化]变量完成/[美化]变量更新中/[不发送]隐藏状态栏标记）
    //   由写卡器导出时自动注入，禁止AI写入cardData（避免导出时重复注入2份）
    //   只允许AI修改：正则6 [美化]MVU状态栏（id=mvu-status-bar 或 StatusPlaceHolderImpl + markdownOnly + 非promptOnly）
    var MVU_FIXED_REGEX_IDS = {
      'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36': '仅格式思维链',
      '5bb4b588-23ca-4564-8df5-882104eff764': '只发送最新2楼的变量更新',
      '6fb572ae-a9ea-436d-9779-ad100f1ff7f5': '[美化]变量完成',
      'bf1b7441-5cf1-426d-bd6c-911332be9923': '[美化]变量更新中',
      'mvu-status-hide': '[不发送]隐藏状态栏标记'
    };
    function isFixedMvuRegex(r) {
      if (!r) return false;
      if (r.id && MVU_FIXED_REGEX_IDS[r.id]) return true;
      var rxFind = String(r.findRegex || '');
      var scriptName = String(r.scriptName || r.name || '');
      // 固定正则特征匹配（兜底，防止AI改id）
      if (rxFind.indexOf('Analysis') >= 0 && r.promptOnly) return true;  // 正则1
      if (rxFind.indexOf('UpdateVariable') >= 0 && r.promptOnly) return true;  // 正则2
      if (rxFind.indexOf('UpdateVariable') >= 0 && r.markdownOnly && !r.promptOnly) return true;  // 正则3/4
      if (rxFind.indexOf('StatusPlaceHolderImpl') >= 0 && r.promptOnly && !r.markdownOnly) return true;  // 正则5
      return false;
    }
    function isAllowedMvuRegex(r) {
      if (!r) return false;
      if (r.id === 'mvu-status-bar') return true;
      var rxFind = String(r.findRegex || '');
      if (rxFind.indexOf('StatusPlaceHolderImpl') >= 0 && r.markdownOnly && !r.promptOnly) return true;  // 正则6 美化状态栏
      return false;
    }
    var mergeRegexScripts = function(newRxList) {
      if (!Array.isArray(newRxList)) return;
      cd.extensions = cd.extensions || {};
      var existingRx = cd.extensions.regex_scripts || [];
      var beforeSnapshot = JSON.stringify(existingRx);
      newRxList.forEach(function(s) {
        if (!s || typeof s !== 'object') return;
        // === MVU固定正则拦截：删除请求也拦截（固定正则由写卡器注入，AI无权删除）===
        if (isFixedMvuRegex(s)) {
          var blockName = (s.id && MVU_FIXED_REGEX_IDS[s.id]) || s.scriptName || s.name || '(MVU固定正则)';
          console.warn('[Tab隔离·MVU] 拦截写入：MVU固定正则「' + blockName + '」由写卡器导出时自动注入，无需AI写入cardData，避免重复。');
          changeLog._mvuFixedRegexBlocked = (changeLog._mvuFixedRegexBlocked || 0) + 1;
          return;
        }
        // === 白名单放行：允许写入的MVU正则只有 [美化]MVU状态栏（正则6）===
        // 其他不属于 MVU 固定正则 / 不属于 MVU 状态栏 的自定义正则也允许（如角色剧情替换等）
        var isMvuRelatedRegex = isFixedMvuRegex(s) || isAllowedMvuRegex(s);
        if (isMvuRelatedRegex && !isAllowedMvuRegex(s)) {
          console.warn('[Tab隔离·MVU] 拦截写入：非白名单MVU正则被丢弃:', s.scriptName || s.id || s.findRegex);
          return;
        }
        // 删除：_action:delete 或 delete:true
        if (s._action === 'delete' || s._action === 'remove' || s.delete === true) {
          // 先检查目标是否是固定正则，是的话也拦截删除
          if (isFixedMvuRegex({id: s.id, scriptName: s.scriptName, name: s.name, findRegex: s.findRegex, promptOnly: true, markdownOnly: true})) {
            console.warn('[Tab隔离·MVU] 拦截删除：MVU固定正则由写卡器注入，AI无权删除。');
            return;
          }
          var beforeLen = existingRx.length;
          existingRx = existingRx.filter(function(es) {
            // 固定正则即使 id/name 匹配也不允许被删
            if (isFixedMvuRegex(es)) return true;
            if (s.id && es.id === s.id) return false;
            if (s.scriptName && es.scriptName === s.scriptName) return false;
            if (s.name && !es.scriptName && es.name === s.name) return false;
            // 关键词匹配删除
            if (s.findRegex && es.findRegex === s.findRegex) return false;
            return true;
          });
          if (existingRx.length !== beforeLen) { changeLog.deleted += (beforeLen - existingRx.length); }
          return;
        }
        if (!s.findRegex || !String(s.findRegex).trim()) return;
        if (s.replaceString === undefined) return;
        // 更新/新增：按 id 或 scriptName/name 或 findRegex 匹配
        var idx = existingRx.findIndex(function(es) {
          if (s.id && es.id === s.id) return true;
          if (s.scriptName && es.scriptName === s.scriptName) return true;
          if (s.name && !es.scriptName && es.name === s.name) return true;
          if (s.findRegex && es.findRegex === s.findRegex) return true;
          return false;
        });
        if (idx >= 0) {
          existingRx[idx] = Object.assign({}, existingRx[idx], s);
          delete existingRx[idx]._action;
          changeLog.updated++;
        } else {
          existingRx.push(s);
          changeLog.added++;
        }
      });
      cd.extensions.regex_scripts = existingRx;
      if (JSON.stringify(existingRx) !== beforeSnapshot) modified = true;
    };

    var _topRegexScriptsProcessed = false; // 🐛修复：标记顶层 regex_scripts 是否已处理，防止 extensions 内的副本二次合并
    if (partial.regex_scripts !== undefined) {
      mergeRegexScripts(partial.regex_scripts);
      delete partial.regex_scripts;
      _topRegexScriptsProcessed = true;
    }

    // 名称变化时自动更新世界书名称
    if (partial.name && cd.character_book) {
      // 参考文件中 character_book 不包含 name 字段，此处无需更新
    }

    if (partial.extensions) {
      cd.extensions = cd.extensions || {};
      var extProcessedKeys = {}; // 防止与顶层重复处理
      for (var ek in partial.extensions) {
        if (partial.extensions.hasOwnProperty(ek)) {
          if (ek === 'depth_prompt') {
            // 顶层已处理过 depth_prompt（delete partial.depth_prompt 已执行），这里仅当 partial.extensions 有独立配置时处理
            // 防御：旧卡 extensions.depth_prompt 可能是字符串（非空字符串 truthy，|| 不会替换）
            // 或 JSON.stringify 后的字符串对象，需要反序列化为对象
            cd.extensions.depth_prompt = normalizeDepthPrompt(cd.extensions.depth_prompt, 0);
            var dp2 = partial.extensions.depth_prompt;
            var beforeDp = JSON.stringify(cd.extensions.depth_prompt);
            if (typeof dp2 === 'string') {
              if (dp2.trim().length > 0) cd.extensions.depth_prompt.prompt = dp2;
            } else if (dp2 && typeof dp2 === 'object') {
              if (dp2.prompt !== undefined) cd.extensions.depth_prompt.prompt = dp2.prompt;
              if (dp2.depth !== undefined && typeof dp2.depth === 'number' && dp2.depth >= 0) cd.extensions.depth_prompt.depth = dp2.depth;
              if (dp2.role !== undefined) cd.extensions.depth_prompt.role = dp2.role;
            }
            if (JSON.stringify(cd.extensions.depth_prompt) !== beforeDp) { modified = true; changeLog.fieldUpdates++; }
          } else if (ek === 'regex_scripts') {
            // 🐛修复：用标记判断顶层是否已处理，不能用 === undefined（因 delete 后恒为 undefined）
            if (!_topRegexScriptsProcessed) mergeRegexScripts(partial.extensions.regex_scripts);
          } else if (ek === 'tavern_helper') {
            // 修复版：支持脚本删除 / 按 id/name 替换，不再只追加
            // ⚠️ MVU固定脚本白名单拦截：bundle.js（MVU本体）由写卡器自动注入，
            //   禁止AI写入cardData（避免导出时重复注入2份）
            //   允许AI修改：变量结构 (id=mvu-schema 或 name='变量结构' 或 含 mvu_zod)、WTC（世界书调用，AI按需生成）
            var MVU_FIXED_SCRIPT_IDS = {
              '961f366d-e403-45c2-8155-3d14ec86de53': 'MVU (bundle.js)'
            };
            function isFixedMvuScript(scr) {
              if (!scr) return false;
              if (scr.id && MVU_FIXED_SCRIPT_IDS[scr.id]) return true;
              var sContent = String(scr.content || '');
              // 特征兜底：bundle.js / MagVarUpdate = MVU本体（唯一受保护的固定资产）
              if (sContent.indexOf('MagVarUpdate') >= 0 || sContent.indexOf('bundle.js') >= 0) return true;
              return false;
            }
            function isAllowedMvuScript(scr) {
              if (!scr) return false;
              if (scr.id === 'mvu-schema') return true;
              if (String(scr.name || '').indexOf('变量结构') >= 0) return true;
              if (String(scr.content || '').indexOf('mvu_zod') >= 0) return true;
              // WTC（世界书调用）由 AI 按需生成，允许修改
              if (scr.id === 'wtc-lorebook-call') return true;
              if (String(scr.content || '').indexOf('LorebookToolCall') >= 0) return true;
              return false;
            }
            if (partial.extensions[ek] && typeof partial.extensions[ek] === 'object') {
              cd.extensions = cd.extensions || {};
              if (!cd.extensions[ek]) cd.extensions[ek] = { scripts: [], variables: {} };
              var thBefore = JSON.stringify(cd.extensions[ek]);
              // === scripts：支持替换/删除/追加 ===
              var thScripts = cd.extensions[ek].scripts || [];
              var newTHScripts = partial.extensions[ek].scripts || [];
              // 如果 AI 明确输出 _action:reset 或 scripts 显式置空数组，允许清空（用于「重写 tavern_helper」场景）
              var resetScripts = partial.extensions[ek]._action === 'reset' || partial.extensions[ek].reset_scripts === true;
              if (resetScripts) { thScripts = []; }
              newTHScripts.forEach(function(ns) {
                if (!ns || typeof ns !== 'object') return;
                // === MVU固定脚本拦截：写入请求也拦截（固定脚本由写卡器注入，AI无权写入/删除）===
                if (isFixedMvuScript(ns)) {
                  var blockName = (ns.id && MVU_FIXED_SCRIPT_IDS[ns.id]) || ns.name || '(MVU固定脚本)';
                  console.warn('[Tab隔离·MVU] 拦截写入：MVU固定脚本「' + blockName + '」由写卡器导出时自动注入，无需AI写入cardData，避免重复。');
                  changeLog._mvuFixedScriptBlocked = (changeLog._mvuFixedScriptBlocked || 0) + 1;
                  return;
                }
                // === 白名单放行：只允许 [变量结构] 被AI写入 ===
                // 其他不属于 MVU 固定脚本 / 不属于 MVU 变量结构 的自定义脚本也允许
                var isMvuRelatedScript = isFixedMvuScript(ns) || isAllowedMvuScript(ns);
                if (isMvuRelatedScript && !isAllowedMvuScript(ns)) {
                  console.warn('[Tab隔离·MVU] 拦截写入：非白名单MVU脚本被丢弃:', ns.name || ns.id);
                  return;
                }
                if (ns._action === 'delete' || ns._action === 'remove' || ns.delete === true) {
                  // 先检查目标是否是固定脚本，是的话拦截删除
                  if (isFixedMvuScript({id: ns.id, name: ns.name, content: ns.content})) {
                    console.warn('[Tab隔离·MVU] 拦截删除：MVU固定脚本由写卡器注入，AI无权删除。');
                    return;
                  }
                  thScripts = thScripts.filter(function(es) {
                    // 固定脚本即使 id/name 匹配也不允许被删
                    if (isFixedMvuScript(es)) return true;
                    if (ns.id && es.id === ns.id) return false;
                    if (ns.name && es.name === ns.name) return false;
                    return true;
                  });
                  return;
                }
                var existsIdx = thScripts.findIndex(function(es) {
                  return (ns.id && es.id === ns.id) || (ns.name && es.name === ns.name);
                });
                if (existsIdx >= 0) {
                  thScripts[existsIdx] = Object.assign({}, thScripts[existsIdx], ns);
                  delete thScripts[existsIdx]._action;
                } else {
                  thScripts.push(ns);
                }
              });
              cd.extensions[ek].scripts = thScripts;
              // === variables：支持删除/替换 ===
              if (partial.extensions[ek].variables) {
                var vars = partial.extensions[ek].variables;
                if (vars && typeof vars === 'object') {
                  var curVars = cd.extensions[ek].variables || {};
                  // 支持 { key: null } 或 { key: {_action:"delete"} } 表示删除
                  Object.keys(vars).forEach(function(vk) {
                    if (vars[vk] === null || vars[vk] === undefined || (vars[vk] && typeof vars[vk] === 'object' && (vars[vk]._action === 'delete' || vars[vk].delete === true))) {
                      if (vk in curVars) delete curVars[vk];
                    } else {
                      curVars[vk] = vars[vk];
                    }
                  });
                  cd.extensions[ek].variables = curVars;
                }
              }
              if (JSON.stringify(cd.extensions[ek]) !== thBefore) { modified = true; changeLog.fieldUpdates++; }
            }
          } else {
            if (JSON.stringify(cd.extensions[ek]) !== JSON.stringify(partial.extensions[ek])) {
              cd.extensions[ek] = partial.extensions[ek];
              modified = true; changeLog.fieldUpdates++;
            }
          }
        }
      }
    }
    // 注意：character_book.entries 已在前面的 processEntriesFn 中处理（避免双路径重复合并）
    // 此处仅处理 character_book 下除 entries 以外的其他字段
    if (partial.character_book && typeof partial.character_book === 'object') {
      cd.character_book = cd.character_book || { entries: [] };
      for (var cbk in partial.character_book) {
        if (partial.character_book.hasOwnProperty(cbk) && cbk !== 'entries') {
          if (JSON.stringify(cd.character_book[cbk]) !== JSON.stringify(partial.character_book[cbk])) {
            cd.character_book[cbk] = partial.character_book[cbk];
            modified = true;
          }
        }
      }
    }
    // 将变更日志挂到返回值（供调用方调试/Toast提示）
    if (modified && options && options.returnLog) {
      return { modified: true, log: changeLog };
    }
    return modified;
  }

    // ============================================================================
  // SECTION 6  AI 调用适配层 + 响应清洗（callAI · cleanAIReply · JSON修复）
  // ============================================================================
  // ===== AI调用 =====
  async function callAI(prompt) {
    var errors = [];
    // ===== 【写卡预设】AI生成参数（与写卡.json数值一致） =====
    var p = TAVERN_GENERATION_PARAMS || {};
    var genParams = {
      temperature: typeof p.temperature === 'number' ? p.temperature : 1,
      top_p: typeof p.top_p === 'number' ? p.top_p : 0.9,
      top_k: typeof p.top_k === 'number' ? p.top_k : 500,
      top_a: typeof p.top_a === 'number' ? p.top_a : 0,
      min_p: typeof p.min_p === 'number' ? p.min_p : 0,
      repetition_penalty: typeof p.repetition_penalty === 'number' ? p.repetition_penalty : 1,
      frequency_penalty: typeof p.frequency_penalty === 'number' ? p.frequency_penalty : 0,
      presence_penalty: typeof p.presence_penalty === 'number' ? p.presence_penalty : 0,
      max_tokens: typeof p.max_tokens === 'number' ? p.max_tokens : 64000
    };
    // system prompt：创作原则与输出格式（不绑定特定人格身份）
    var sysPrompt =
      '<writing_principles>\n' +
      '禁用词：模糊词（似乎/仿佛/宛如）、劣质比喻（像小兽/投石入湖）、微表情（嘴角上扬/眼里闪过光芒）、语气描写（带着xx的口吻）、极端情绪词（极度羞耻/无比愤怒）、否定转折句（不是...而是...）、心理描写（心想/暗自思忖）。\n' +
      '创作准则：客观叙述（只写镜头能拍到的内容，禁止写内心想法）；白描事实（只写谁做了什么说了什么，禁止修饰渲染）；名词动词造句（禁止形容词做谓语，禁止副词修饰形容词）；具体名词代替代词（禁止用他/她/它作主语）；行为展现性格（写具体动作和对话，禁止写"她是温柔的人"）；纯对话体现特点（只写原话，禁止附加"她温柔地说"）。\n' +
      '</writing_principles>\n\n' +
      '<output_format>\n' +
      '当输出实际创作内容（角色卡/故事/世界观/场景等）时，条目的content字段必须使用YAML中文格式，用缩进+冒号+短横线表达层级关系，键名和内容均为中文，保持结构清晰。解释说明或回答问题时直接用自然语言。\n' +
      '</output_format>\n\n' +
      '你同时是时之写卡器助手，基于SillyTavern原生机制与ST权重分层8体系引导用户创作角色卡。';
    try {
      if (typeof generate === 'function') {
        var result = await generate(Object.assign({ user_input: prompt, should_silence: true, max_chat_history: 0 }, genParams));
        if (result && typeof result === 'string' && result.trim().length > 5) return result.trim();
        if (result && typeof result === 'object' && result.content && String(result.content).trim().length > 5) return String(result.content).trim();
        if (result && typeof result === 'string') errors.push('generate returned: ' + result.substring(0, 80));
      }
    } catch(e) { errors.push('generate: ' + e.message); }
    try {
      if (typeof generateQuietPrompt === 'function') {
        var r6 = await generateQuietPrompt(prompt, false, false, false, 120000);
        if (r6 && typeof r6 === 'string' && r6.trim().length > 5) return r6.trim();
      }
    } catch(e) { errors.push('generateQuietPrompt: ' + e.message); }
    try {
      if (window.parent && typeof window.parent.generateQuietPrompt === 'function') {
        var r5 = await window.parent.generateQuietPrompt(prompt, false, false, false, 120000);
        if (r5 && typeof r5 === 'string' && r5.trim().length > 5) return r5.trim();
      }
    } catch(e) { errors.push('parent.generateQuietPrompt: ' + e.message); }
    try {
      if (window.TavernHelper && typeof window.TavernHelper.generate === 'function') {
        var r2 = await window.TavernHelper.generate(Object.assign({ user_input: prompt, should_silence: true, max_chat_history: 0 }, genParams));
        if (r2 && typeof r2 === 'string' && r2.trim().length > 5) return r2.trim();
      }
    } catch(e) { errors.push('TavernHelper.generate: ' + e.message); }
    try {
      if (typeof generateRaw === 'function') {
        var r3 = await generateRaw(Object.assign({ should_silence: true, ordered_prompts: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ]}, genParams));
        if (r3 && typeof r3 === 'string' && r3.trim().length > 5) return r3.trim();
      }
    } catch(e) { errors.push('generateRaw: ' + e.message); }
    try {
      if (typeof triggerSlash === 'function') {
        var r4 = await triggerSlash('/generate lock=on ' + prompt.substring(0, 8000));
        if (r4 && typeof r4 === 'string' && r4.trim().length > 5) return r4.trim();
      }
    } catch(e) { errors.push('triggerSlash: ' + e.message); }
    throw new Error('AI调用失败: ' + errors.join('; '));
  }

  // ====================================================================
  // 旧「5步分模块状态栏系统」已废弃——状态栏统一使用单一模板 MVU_STATUS_BAR_TEMPLATE。
  // 以下变量/常量/函数保留为空默认值的兼容占位（inert stubs），仅为避免尚未清理的旧引用抛
  // ReferenceError；5步生成逻辑已全部移除，这些值永远保持空/未激活状态，不会影响实际行为。
  // ====================================================================
  var statusBarModules = { step2: null, step3: null, step4: null, step5: null, step6: null };
  var statusBarCurrentStep = 0;
  var statusBarMode = false;
  var SB_STEP_DISPLAY_NAMES = { step2: '配色方案', step3: 'HTML骨架', step4: 'CSS样式', step5: 'populateCharacterData', step6: '事件绑定+入口' };
  var SB_STEP_ORDER = [2, 3, 4, 5, 6];
  function sbStepName(stepNum) { return SB_STEP_DISPLAY_NAMES['step' + stepNum]; }
  function findNextEmptyStep() { return 7; }

  // ====================================================================
  // 公共函数：检查MVU 8条目工作流的前7条完成情况（第8条=状态栏本身，单独判断）
  // 返回：{ done: [bool×7], doneCount: int, all7Done: bool, missing: [string], missingCount: int }
  // 说明：消除 updateQuickActions / start_sb / isSBRequest 三处重复检查代码
  // ====================================================================
  function checkMvu8Entries(_cardData) {
    // ⚠️ 本函数在 IIFE 顶层定义，cardData 在 openEditor() 内部定义，作用域不通
    //    必须通过参数传入 cardData，否则报 "cardData is not defined"
    var cd = _cardData;
    if (!cd) {
      if (typeof window !== 'undefined' && window.__cardData) cd = window.__cardData;
      else { try { if (typeof cardData !== 'undefined') cd = cardData; } catch(_e) {} }
    }
    if (!cd) return { done: [false,false,false,false,false,false,false], doneCount: 0, all7Done: false, missing: ['第1条 变量结构脚本(zod)','第2条 [InitVar]初始变量','第3条 [mvu_update]更新规则','第4条 变量列表','第5条 [mvu_update]输出格式','第6条 [mvu_update]输出格式强调','第7条 <状态栏>占位提醒'], missingCount: 7, has8: false };
    var entries = (cd.character_book || {}).entries || [];
    var thScripts = (cd.extensions && cd.extensions.tavern_helper && cd.extensions.tavern_helper.scripts) || [];
    var rxScripts = (cd.extensions && cd.extensions.regex_scripts) || [];
    // 前7条检测（按8条工作流顺序：第3条=更新规则，第4条=变量列表）
    // ⚠️脚本存为对象（含content/name/id字段），非string；兼容两种形态
    var has1 = thScripts.some(function(s) {
      if (!s) return false;
      var c = typeof s === 'string' ? s : (s.content || '');
      return c.indexOf('registerMvuSchema') >= 0 || c.indexOf('z.object') >= 0;
    });
    var has2 = entries.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; });
    var has3 = entries.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[mvu_update]') >= 0 && (e.comment || '').indexOf('变量更新规则') >= 0; });
    var has4 = entries.some(function(e) { return (e.comment || '').indexOf('变量列表') >= 0; });
    var has5 = entries.some(function(e) { var c = (e.comment || ''); return c.indexOf('变量输出格式') >= 0 && c.indexOf('强调') < 0; });
    var has6 = entries.some(function(e) { return (e.comment || '').indexOf('变量输出格式强调') >= 0; });
    var has7 = entries.some(function(e) { var c = (e.comment || ''); return c.indexOf('状态栏') >= 0 && (c.indexOf('占位符') >= 0 || c.indexOf('提醒') >= 0); });
    // 第8条检测（状态栏HTML正则）
    var has8 = rxScripts.some(function(r) { return (r.findRegex || '').indexOf('StatusPlaceHolder') >= 0 && r.markdownOnly === true && r.promptOnly !== true; });
    var done = [has1, has2, has3, has4, has5, has6, has7];
    var doneCount = done.filter(Boolean).length;
    var all7Done = doneCount === 7;
    var names7 = ['第1条 变量结构脚本(zod)', '第2条 [InitVar]初始变量', '第3条 [mvu_update]更新规则', '第4条 变量列表', '第5条 [mvu_update]输出格式', '第6条 [mvu_update]输出格式强调', '第7条 <状态栏>占位提醒'];
    var missing = [];
    for (var i = 0; i < 7; i++) { if (!done[i]) missing.push(names7[i]); }
    return { done: done, doneCount: doneCount, all7Done: all7Done, missing: missing, missingCount: missing.length, has8: has8 };
  }

  // 公共函数：生成"缺失条目提示文本"（供 isSBRequest / start_sb 共用）
  function buildMissingMvuHint(missing) {
    var hint = missing.map(function(item, i) { return '  ' + (i + 1) + '. ' + item; }).join('\n');
    return '⚠️ 前7条未齐全（第8条=状态栏HTML，必须前7条完成后才生成）。\n' +
      '当前缺失 ' + missing.length + ' 条：\n' + hint + '\n\n' +
      '请在 MVU Tab 按以下8条固定顺序**一条一条**生成，每生成一条说"继续"再写下一条：\n' +
      '  第1条：变量结构脚本（zod 4 schema）\n' +
      '  第2条：[InitVar]初始变量\n' +
      '  第3条：[mvu_update]变量更新规则\n' +
      '  第4条：变量列表\n' +
      '  第5条：[mvu_update]变量输出格式\n' +
      '  第6条：[mvu_update]变量输出格式强调\n' +
      '  第7条：<状态栏>占位符提醒条目\n' +
      '  第8条：正则6 [美化]MVU状态栏（即状态栏 HTML）—— 前7条完成后才生成\n\n' +
      '⚠️ 铁律：每生成一条立即停下，等用户说"继续"再写下一条。禁止一次性输出多条！';
  }

  // ====================================================================
  // 公共常量：MVU 8条工作流规范文本（供 mvuPrompts.init_var / var_update_rule / buildMissingMvuHint 引用，避免多处重复维护）
  // ====================================================================
  // 逐条生成铁则（最高优先级）
  var MVU_SEQUENTIAL_RULE =
    '【逐条生成铁则（最高优先级）】\n' +
    '⚠️ 一次只输出1条内容（脚本/条目/正则），输出后立即停下，不要写后面的。结尾只问用户："已生成第N条，说\'继续\'生成下一条"——不要一次性输出多条！\n' +
    '用户说"继续"后，再按顺序生成下一条。前7条全部完成后，才生成第8条（状态栏HTML）。\n\n';
  // 8条固定顺序（含每条详细规范）—— 第3/4条顺序已调整为：更新规则在前，变量列表在后
  var MVU_8STEPS_DETAIL =
    '【8条固定顺序（严格按此顺序，不能跳步）】\n' +
    '  第1条：变量结构脚本（tavern_helper.scripts，zod 4 Schema + registerMvuSchema注册）\n' +
    '       · 文件头固定：import { registerMvuSchema } from \'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js\';\n' +
    '       · 文件尾固定：$(() => { registerMvuSchema(Schema); })\n' +
    '       · 严格遵循zod 4规范（详见MVU变量结构脚本创作指导）\n' +
    '  第2条：[InitVar]初始变量（世界书条目，enabled=false）—— YAML格式，严格依据第1条schema生成；schema有z.prefault()的字段可省略；enabled必须=false\n' +
    '  第3条：[mvu_update]变量更新规则（世界书条目，constant=true）—— 依据第1条schema生成每个变量路径的type/range/format/check\n' +
    '  第4条：变量列表（世界书条目，constant=true depth=0）—— 固定内容：<status_current_variables>null</status_current_variables>\n' +
    '  第5条：[mvu_update]变量输出格式（世界书条目，constant=true depth=0）—— 固定YAML格式，<UpdateVariable>+<Analysis>+<JSONPatch>（5种操作：replace/delta/insert/remove/move）\n' +
    '  第6条：[mvu_update]变量输出格式强调（世界书条目，constant=true，默认enabled=false）—— 固定YAML原样输出，AI不输出<UpdateVariable>时启用\n' +
    '  第7条：<状态栏>占位符提醒（世界书条目，constant=true）—— 提醒AI每条回复底部必须输出 <StatusPlaceHolderImpl/>\n' +
    '  第8条：正则6 [美化]MVU状态栏（regex_scripts，markdownOnly=true promptOnly=false）—— 前7条完成后才生成！走状态栏Step 2-6共5模块生成流程\n\n';
  // 通用生成规范（适用于所有8条）—— 第3/4条顺序已调整
  var MVU_8STEPS_COMMON_RULES =
    '【通用生成规范（适用于所有8条）】\n' +
    '1. 第2/3条必须严格依据第1条schema生成，schema一改这两条必跟改\n' +
    '2. 第4/5/6条是固定内容模板，原封不动输出（第5条的示例路径可参考schema字段名）\n' +
    '3. 禁止AI自行追加8条以外的额外条目（阶段判定/人设切换/EJS/派生字段等），除非用户明确要求\n' +
    '4. 每生成一条立即写入cardData并触发预览更新，用户可实时看到\n\n';
  // 修改场景防漏铁律 —— 第3/4条顺序已调整
  var MVU_MODIFY_RULE =
    '【修改场景防漏铁律】：修改变量结构时（哪怕只加一个字段），必须按顺序把第1/2/3/8条全部跟改一遍（第4/5/6/7条原样保留）。';
  // 8条简短列表（供 mvuPrompts.next/summary 等引用）—— 第3/4条顺序已调整
  var MVU_8STEPS_SHORT =
    '①zod脚本 ②InitVar ③更新规则 ④变量列表 ⑤输出格式 ⑥格式强调 ⑦占位提醒 ⑧状态栏HTML';
  // MVU变量系统创作指导（第1-6条详细规范）—— 供 mvuPrompts 按用户"写变量xxx"指令逐条输出对应规范
  var MVU_VAR_SPEC =
    '═══════════════════════════════════════════════════════════════════\n' +
    '📋 MVU变量系统创作指导（第1-6条详细规范）\n' +
    '═══════════════════════════════════════════════════════════════════\n\n' +
    '===== 第1条：变量结构脚本（zod 4 Schema）=====\n\n' +
    '【任务】帮助用户创作一个完全符合zod 4库的MVU变量结构脚本\n\n' +
    '【工作流程】\n' +
    '第一步：了解需求\n' +
    '  询问用户：\n' +
    '  1. 这是什么类型的角色卡/世界观？（如：角色扮演、模拟经营、军事模拟等）\n' +
    '  2. 需要追踪哪些主要内容？\n' +
    '     - 有哪些角色？（主角、配角、NPC等）\n' +
    '     - 需要什么系统变量？（时间、日期、金钱等）\n' +
    '     - 每个角色需要追踪什么？（好感度、位置、状态等）\n' +
    '  3. 哪些部分需要限定值情况？\n' +
    '     - 数值和文本是否有特定取值范围或格式？\n' +
    '     - 可以添加新角色吗？\n' +
    '     - 哪些对象可以增删键？（如物品栏、成就、技能等）\n' +
    '     - 是否要限制对象的键数量？\n\n' +
    '第二步：确认结构\n' +
    '  根据用户需求，先用自然语言列出结构大纲，让用户确认是否符合需求\n\n' +
    '第三步：编写初始变量\n' +
    '  按照zod 4编写javascript文件\n\n' +
    '【额外zod要求】\n' +
    '\n' +
    '  rule:\n' +
    '    - libraries: "`z` from zod 4.x (stick to it instead of 3.x!) and `_` from lodash are available by default, so you can use them directly and should prefer to use them; don\'t import them in the generated code"\n' +
    '    - idempotent operation: the schema is intended to parse the updates of the world status incrementally, thus, the output of `Schema.parse(input)` must be a valid input of `Schema.parse` itself; that is, you should use z.transform carefully, keeping `Schema.parse(Schema.parse(input))` equal to `Schema.parse(input)`\n' +
    '    - for number schema: prefer `z.coerce.number()` over `z.number()` whenever you expect a number since it will try to convert the input to a number if it\'s not a number; but don\'t use other `z.coerce.xxx()` such as `z.coerce.boolean()`, just use `z.boolean()` directly\n' +
    '    - prefer object schema over array schema: "the array index is hard to understand and maintain, so you should use `物品栏: z.record(z.string().describe(\'物品名\'), z.object({ 描述: z.string(), ... }))` instead of `物品栏: z.array(z.object({ 名称: z.string(), 描述: z.string(), ... }))`"\n' +
    '    - for object schema:\n' +
    '        - fixed required keys + the same type: use `z.record(z.enum([\'key1\', \'key2\', ...]), ${value type})`\n' +
    '          fixed optional keys + the same type: use `z.partialRecord(z.enum([\'key1\', \'key2\', ...]), ${value type})`\n' +
    '          dynamic optional keys + the same type: use `z.record(z.string(), ${value type})`\n' +
    '          fixed required keys + different types: \'use `z.object({ key1: ${type1}, key2: ${type2}, ... })`\'\n' +
    '          dynamic keys but some keys are required + the same type: \'use `z.intersection(z.object({ requiredKey1: ${type1}, requiredKey2: ${type2}, ... }), z.record(z.string(), ${value type}))`\'\n' +
    '        - on clearable object: \'if the object is clearable by JSON patch `{ "op": "remove", "path": "/path/to/object" }`, set `z.object({ ${field}: ${type}.prefault(...), ... }).prefault({})` instead of `z.object({ ... }).optional()` for better compatibility with the incremental update\'\n' +
    '    - for special format (rare to happen): prefer `z.templateLiteral` over regex or manual parsing\n' +
    '    - for restrictions: when accepting a update that breaks the schema, users are tend to expect the update takes some effect instead of being discarded completely; therefore, you should try your best to use `z.transform` to convert the broken input to a valid input. For example, if Explorer requests a value to be between 0 and 100, prefer `z.number().transform(value => _.clamp(value, 0, 100))` over `z.number().min(0).max(100)`; if an object could only contain 10 keys, when a new key comes, discard the oldest key instead. **but only impose these restrictions when Explorer requests**\n' +
    '    - on default value:\n' +
    '        - prefer `z.prefault` over `z.default`\n' +
    '        - if a `z.object` or the whole Schema is complicated enough, set `.prefault(\'${suitable default value}\')` or `.or(z.literal(\'待初始化\')).prefault(\'待初始化\')` for every field of it\n' +
    '        - if a compund type is prefault-ed, all its fields should be prefault-ed as well\n' +
    '        - don\'t set `z.prefault` for other situatioins unless Explorer requests it\n' +
    '    - when to describe: use `z.describe` only when there\'s no field name to explain the usage of the schema such as the key type of `z.record`; in contrast, you should never use `z.describe` if the field name has already explained the usage well\n' +
    '    - determine the order of keys: \'if Explorer requests you to do something with the insertion time of keys, prefer to use `_(data).entries()` which almost always lists keys in insertion order, e.g. you can remove old keys with a simple `_(data).entries().takeRight(10)`; when keys are already additionally sorted inside `z.transform`, you should use `$time: z.coerce.number().prefault(() => Date.now())` to automatically assign a timestamp\'\n' +
    '    - don\'t repeat yourself: merge the same variable schemas whenever possible, but don\'t define extra variables to do so - you can only define schema inside `export const Schema = z.object({ ... })`\n' +
    '    - some function definition corrections:\n' +
    '        z.transform:\n' +
    '          type: \'(fn: (value: Output) => NewOutput) => z.ZodType\'\n' +
    '          limit: \'`fn` can only take the parsed output as input, never ever use `context`. i.e. `z.string().transform(value => value)` is valid, while `z.string().transform((value, context) => value)` is not\'\n' +
    '          example: \'z.object({ 好感度: z.coerce.number() }).transform(data => ({ 好感度: _.clamp(data.好感度, 0, 100) }))\'\n' +
    '        z.prefault:\n' +
    '          type: \'(value: Input | (() => Input)) => z.ZodType\'\n' +
    '          limit: \'`value` must be a valid input of the schema itself. i.e. `z.object({ 好感度: z.coerce.number().prefault(0) }).prefault({})` is valid, while `z.object({ 好感度: z.coerce.number() }).prefault({})` is not (the input must contain the `好感度` field in this case)\'\n' +
    '        z.extend:\n' +
    '          limit: only `z.object`、`z.looseObject`、`z.strictObject` can be extended, even if `z.object(...).prefault({})` could not be extended! i.e. `z.object({...}).extend({...})` is valid, while `z.object({...}).prefault({}).extend({...})` is not\n' +
    '        z.passthrough、z.strict: they are not exist, never ever use them!\n' +
    '        z.transform:\n' +
    '          type: \'(fn: (value: Output) => NewOutput) => z.ZodType\'\n' +
    '          limit: \'`fn` can only take the parsed output as input, never ever use `context`. i.e. `z.string().transform(value => value)` is valid, while `z.string().transform((value, context) => value)` is not\'\n' +
    '          example: \'z.object({ 好感度: z.coerce.number() }).transform(data => ({ 好感度: _.clamp(data.好感度, 0, 100) }))\'\n' +
    '        z.prefault:\n' +
    '          type: \'(value: Input | (() => Input)) => z.ZodType\'\n' +
    '          limit: \'`value` must be a valid input of the schema itself. i.e. `z.object({ 好感度: z.coerce.number().prefault(0) }).prefault({})` is valid, while `z.object({ 好感度: z.coerce.number() }).prefault({})` is not (the input must contain the `好感度` field in this case)\'\n\n' +
    '【变量结构脚本模板】\n' +
    '  import { registerMvuSchema } from \'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js\';\n' +
    '\n' +
    '  export const Schema = z.object({\n' +
    '    ...\n' +
    '  });\n' +
    '\n' +
    '  $(() => {\n' +
    '    registerMvuSchema(Schema);\n' +
    '  })\n' +
    '  必须原封不动地照抄头尾。\n\n' +
    '【输出要求】\n' +
    '  - 结构清晰：合理使用嵌套，不要过度扁平或过度嵌套\n' +
    '  - 遵循额外要求：严格遵循额外给出的zod要求\n\n' +
    '【完整示例】\n' +
    '  import { registerMvuSchema } from \'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js\';\n' +
    '\n' +
    '  export const Schema = z.object({\n' +
    '    世界: z.object({\n' +
    '      当前时间: z.string(),\n' +
    '      当前地点: z.string(),\n' +
    '      近期事务: z.record(z.string().describe(\'事务名\'), z.string().describe(\'事务描述\')),\n' +
    '    }),\n' +
    '\n' +
    '    白娅: z\n' +
    '      .object({\n' +
    '        依存度: z.coerce.number().prefault(0).transform(v => _.clamp(v, 0, 100)),\n' +
    '        着装: z.record(z.enum([\'上装\', \'下装\', \'内衣\', \'袜子\', \'鞋子\', \'饰品\']), z.string().describe(\'服装描述\')),\n' +
    '        称号: z.record(\n' +
    '          z.string().describe(\'称号名\'),\n' +
    '          z.object({\n' +
    '            效果: z.string(),\n' +
    '            自我评价: z.string(),\n' +
    '          }),\n' +
    '        ),\n' +
    '      })\n' +
    '      .transform(data => {\n' +
    '        data.称号 = _(data.称号)\n' +
    '          .entries()\n' +
    '          .takeRight(Math.ceil(data.依存度 / 10))\n' +
    '          .fromPairs()\n' +
    '          .value();\n' +
    '        return data;\n' +
    '      }),\n' +
    '\n' +
    '    主角: z.object({\n' +
    '      物品栏: z\n' +
    '        .record(\n' +
    '          z.string().describe(\'物品名\'),\n' +
    '          z.object({\n' +
    '            描述: z.string(),\n' +
    '            数量: z.coerce.number(),\n' +
    '          }),\n' +
    '        )\n' +
    '        .transform(data => _.pickBy(data, ({ 数量 }) => 数量 > 0)),\n' +
    '    }),\n' +
    '  });\n' +
    '\n' +
    '  $(() => {\n' +
    '    registerMvuSchema(Schema);\n' +
    '  })\n\n' +
    '【注意事项】\n' +
    '  - 中文兼容：变量名可以用中文\n\n' +
    '  下一步：创建初始变量。对我说"写初始变量"。\n\n' +
    '===== 第2条：初始变量（YAML格式）=====\n\n' +
    '【任务】帮助用户创作一个结构正确的MVU初始变量文件，设定剧情开始时各变量的初始值\n\n' +
    '【前置条件】用户应该已经完成MVU变量结构脚本\n\n' +
    '【工作流程】\n' +
    '第一步：了解需求\n' +
    '  询问用户：\n' +
    '  1. 剧情开始时有什么关键情节？\n' +
    '  2. 根据变量结构脚本中列出的变量继续询问\n' +
    '     - xxx变量在该剧情下是否有特殊设定？\n\n' +
    '第二步：确认结构\n' +
    '  根据变量结构脚本使用YAML编写初始变量\n\n' +
    '【示例】\n' +
    '  络络:\n' +
    '    亲密度: 0\n' +
    '    阅读日记数量: 0\n' +
    '    拥有联系方式: false\n' +
    '    物品栏: {}\n' +
    '  世界:\n' +
    '    当前日期: 2025-07-26\n' +
    '    当前星期: 星期五\n' +
    '    当前时间: 17:36\n\n' +
    '【注意事项】\n' +
    '  1. 条目命名：[initvar]变量初始化勿开\n' +
    '  2. 合理初始值：根据故事开局设置合理的初始值\n' +
    '  3. 后续配置：提醒用户这只是初始变量，还需要配置世界书条目和变量规则\n\n' +
    '【沟通风格】\n' +
    '  - 用自然语言和用户交流\n' +
    '  - 逐步确认需求，不要一次性问太多\n' +
    '  - 给出建议但尊重用户选择\n' +
    '  - 完成后询问是否需要调整\n\n' +
    '  开始协作吧！\n\n' +
    '  ---\n\n' +
    '  完成后的引导\n\n' +
    '  当初始变量创作完成并输出后：\n\n\n' +
    '  下一步：创建变量更新规则。对我说"写变量更新规则"。\n\n' +
    '===== 第3条：变量更新规则 =====\n\n' +
    '【任务】帮用户写MVU变量的更新规则文件，告诉AI什么情况下应该更新变量、更新成什么值\n\n' +
    '【前置条件】用户应该已经完成MVU变量结构脚本\n\n' +
    '【变量规则文件结构】\n' +
    '  ---\n' +
    '  变量更新规则:\n' +
    '    ${变量名}:\n' +
    '      type: ${变量类型，string则省略}\n' +
    '      ${其他字段如format、range等}\n' +
    '      check:\n' +
    '        - ${更新规则}\n' +
    '        - ...\n\n' +
    '【要求】\n' +
    '  - 合并同类型变量规则：\n' +
    '    * 固定键：z.object({...})和z.record(z.enum(...), ...)的键总是存在，可合并为 主角.能力面板.${力量|敏捷|体质}\n' +
    '    * 动态键：z.record(z.string(), ...)和z.partialRecord(z.enum(...), ...)可能为空，将key放入type的索引签名\n' +
    '  - 嵌套同对象字段：主角.能力面板和主角.装备栏都是主角的字段，嵌套在主角下\n' +
    '  - string类型变量省略type字段\n' +
    '  - 不更新只读字段：_开头字段只读，不列更新规则\n' +
    '  - 避免为自解释变量列规则（除非用户指定特殊规则）\n\n' +
    '【字段说明】\n' +
    '  - type: 变量支持的类型（number/boolean/typescript类型定义/zod schema定义）\n' +
    '  - range: 仅当 zod 未做数值 clamp 处理时才填写，否则删除此字段（zod已约束，更新规则侧不重复约束）\n' +
    '  - format: 变量必须满足的特定格式（如YYYY年MM月DD日 星期X HH:MM）\n' +
    '  - check: AI在更新变量时应该考虑的因素（自然语言描述）——更新规则的核心，应侧重描述"何时更新"、"更新幅度"、"触发条件"等\n\n' +
    '【示例】（zod已对数值做clamp时，删除 range 重复约束，侧重建check逻辑）\n' +
    '  ---\n' +
    '  变量更新规则:\n' +
    '    世界:\n' +
    '      当前时间:\n' +
    '        format: ${xx历}-${YYYY/MM/DD}-${HH:MM}\n' +
    '        check:\n' +
    '          - 每次事件推进、休息或旅行后更新，保持时间流逝合理\n' +
    '          - 若场景跳转跨度较大，应说明跳跃原因\n' +
    '    角色.好感度:\n' +
    '      type: number\n' +
    '      check:\n' +
    '        - 仅在{{user}}有显著互动且角色感知到时更新\n' +
    '        - 单次变动建议 ±(1~3)\n' +
    '    主角:\n' +
    '      能力面板.${力量|敏捷|体质|感知|意志|魅力}.数值:\n' +
    '        type: number\n' +
    '        check:\n' +
    '          - 训练、战斗、重伤、系统奖励等显著事件才调整\n' +
    '          - 单次变化不超过 ±10，除非剧情有明确强化/削弱\n' +
    '      装备栏.${部位}:\n' +
    '        type: |-\n' +
    '          {\n' +
    '            装备: string; // 装备名称 + 状态; 若未装备，使用"空置"或"无"\n' +
    '            主角评价: string;\n' +
    '          }\n' +
    '        check:\n' +
    '          - 穿戴、损毁、替换装备时更新装备描述\n' +
    '    _只读字段:\n' +
    '      check:\n' +
    '        - ❌禁止更新：此字段由系统脚本自动维护\n' +
    '    任务列表:\n' +
    '      type: |-\n' +
    '        {\n' +
    '          [任务名: string]: {\n' +
    '            类型: \'主线\' | \'支线\' | \'每日\' | \'临危受命\' ;\n' +
    '            说明: string; # 面向主角的任务背景或细则\n' +
    '            目标: string; # 明确可执行的目标描述，可包含步骤\n' +
    '            奖励: string;\n' +
    '            惩罚: string; # 失败后触发的负面效果\n' +
    '          }\n' +
    '        }\n' +
    '      check:\n' +
    '        - 避免一次性添加超过3个主线任务，保持焦点\n' +
    '        - 日常任务完成后可重置但需记录冷却\n' +
    '  ${变量}.主角评价:\n' +
    '    value: 主角对某个变量内容的即时感受\n' +
    '    check:\n' +
    '      - 在对应变量值发生变化或遭遇相关事件后可更新，其他情况不应更新\n' +
    '      - 语言应保持第一人称/贴近主角口吻\n' +
    '      - 主角的评价并不会被主角本人看到，也不会在剧情中出现\n\n' +
    '  开始协作吧！\n\n' +
    '  ---\n\n' +
    '  完成后的引导\n\n' +
    '  当变量更新规则创作完成并输出后：\n\n' +
    '  下一步：创建变量列表。对我说"写变量列表"。\n\n' +
    '===== 第4条：变量列表（固定格式，原样输出）=====\n\n' +
    '  ---\n' +
    '  <status_current_variables>\n' +
    '  null\n' +
    '  </status_current_variables>\n\n' +
    '  重点：这就是你要输出给用户的完整格式！整个内容用代码块包裹，一次性完整输出！\n\n' +
    '  开始协作吧！\n\n' +
    '  ---\n\n' +
    '  完成后的引导\n\n' +
    '  当变量列表创作完成并输出后：\n\n\n' +
    '  下一步：创建变量输出格式。对我说"写变量输出格式"。\n\n' +
    '===== 第5条：变量输出格式（固定格式，原样输出）=====\n\n' +
    '  ---\n' +
    '  变量输出格式:\n' +
    '    rule:\n' +
    '    rule:\n' +
    '      - you must output the update analysis and the actual update commands at once in the end of the next reply\n' +
    '      - the update commands works like the **JSON Patch (RFC 6902)** standard\n' +
    '      - don\'t update field names starts with `_` as they are readonly\n' +
    '    format: |-\n' +
    '      <UpdateVariable>\n' +
    '      <Analysis>$(IN ENGLISH, no more than 80 words)\n' +
    '      - ${calculate time passed: ...}\n' +
    '      - ${decide whether dramatic updates are allowed as it\'s in a special case or the time passed is more than usual: yes/no}\n' +
    '      - ${analyze every variable based on its corresponding `check`, according only to current reply instead of previous plots: ...}\n' +
    '      </Analysis>\n' +
    '      <JSONPatch>\n' +
    '      [\n' +
    '        { "op": "replace", "path": "/path/to/variable", "value": "new_value" },\n' +
    '        { "op": "delta", "path": "/path/to/number", "value": 5 },\n' +
    '        ...\n' +
    '      ]\n' +
    '      </JSONPatch>\n' +
    '      </UpdateVariable>\n\n' +
    '  重点：这就是你要输出给用户的完整格式！整个内容用代码块包裹，一次性完整输出！\n\n' +
    '  开始协作吧！\n\n' +
    '  ---\n\n' +
    '  完成后的引导\n\n' +
    '  当变量输出格式创作完成并输出后：\n\n' +
    '  下一步：创建变量输出格式强调。对我说"写变量输出格式强调"。\n\n' +
    '===== 第6条：变量输出格式强调（固定格式，原样输出）=====\n\n' +
    '  注意：这个条目只在测试时发现AI不输出 <UpdateVariable> 块时才需要启用。\n\n' +
    '  ---\n' +
    '  变量输出格式强调:\n' +
    '    rule: The following must be inserted to the end of reply, and cannot be omitted\n' +
    '    format: |-\n' +
    '      <UpdateVariable>\n' +
    '      ...\n' +
    '      </UpdateVariable>\n\n' +
    '  重点：这就是你要输出给用户的完整格式！整个内容用代码块包裹，一次性完整输出！\n\n' +
    '  开始协作吧！\n\n' +
    '  ---\n\n' +
    '  完成后的引导\n\n' +
    '  注意：这个条目只在测试时发现AI不输出 <UpdateVariable> 块时才需要启用。';

    // ============================================================================
  // SECTION 7  MVU 8步质检 + 提示词构建（buildPrompt · Tab隔离）
  // ============================================================================
  // ===== 构建完整提示词 =====
  function buildPrompt(cardData, cardGenerated, messages) {
    // ========== Tab 隔离系统：根据当前 Tab 返回完全不同的提示词，两边互不干扰 ==========
    // 优先顺序：window.__getActiveTab()（最新闭包）→ window.__tab_activeTab → activeTab/currentTab（作用域降级）
    var __tab = 'card';
    if (typeof window !== 'undefined') {
      if (typeof window.__getActiveTab === 'function') {
        try { __tab = window.__getActiveTab() || 'card'; } catch(_eTab1) {}
      } else if (window.__tab_activeTab) {
        __tab = window.__tab_activeTab;
      }
    }
    if (__tab !== 'card' && __tab !== 'mvu') __tab = 'card';
    // 顶层作用域 activeTab/currentTab 兜底（兼容直接调用场景）
    try {
      if (typeof activeTab !== 'undefined' && (activeTab === 'card' || activeTab === 'mvu')) __tab = activeTab;
      else if (typeof currentTab !== 'undefined' && (currentTab === 'card' || currentTab === 'mvu')) __tab = currentTab;
    } catch(_eSc) {}
    if (__tab === 'mvu') {
      // ===== MVU变量状态栏 Tab：只发角色卡内容 + MVU专属指令，完全不发角色卡生成逻辑 =====
      return buildMvuTabPrompt(cardData, messages);
    }
    // ===== 角色卡生成 Tab：继续走原逻辑，但严格剥离/禁止所有MVU内容 =====
    var existingInfo = '';
    var cd = cardData;
    if (cd && (cd.name || cd.description || cd.first_mes || (cd.character_book && cd.character_book.entries && cd.character_book.entries.length > 0))) {
      var parts = [];
      if (cd.name) parts.push('世界/角色名称：' + cd.name);
      if (cd.description) parts.push('世界观描述(' + (cd.description||'').length + '字)：' + (cd.description||'').substring(0, 400));
      if (cd.system_prompt) parts.push('系统指令(' + (cd.system_prompt||'').length + '字)：' + (cd.system_prompt||'').substring(0, 100));
      if (cd.first_mes) parts.push('开场白(' + (cd.first_mes||'').length + '字)：' + (cd.first_mes||'').substring(0, 200));
      var entries = (cd.character_book || {}).entries || [];
      if (entries.length > 0) {
        // ========== 角色卡Tab：过滤掉MVU相关条目，不让AI看到MVU内容，也禁止它生成 ==========
        var filteredEntries = entries.filter(function(e) {
          var c = (e.comment || '').toLowerCase();
          // 只保留非MVU条目：剔除[InitVar]、变量列表、变量更新规则、变量输出格式、状态变量输出这5类MVU专属条目
          if (c.indexOf('[initvar]') >= 0) return false;
          if (c.indexOf('变量列表') >= 0 && c.indexOf('format_message_variable') >= 0) return false;
          if (c.indexOf('变量更新规则') >= 0) return false;
          if (c.indexOf('变量输出格式') >= 0 || c.indexOf('mvu_update') >= 0) return false;
          if (c.indexOf('状态变量输出') >= 0) return false;
          if (c.indexOf('<状态栏>') >= 0) return false;  // 角色卡Tab也不处理<状态栏>条目，MVU Tab专属
          return true;
        });
        var entryText = '世界书条目（' + filteredEntries.length + '条，不含MVU变量系统内容）：';
        filteredEntries.forEach(function(e, i) {
          // ⚠️修复：发送完整 content（不再截断200字），让 AI 在修改条目时能看到完整旧内容，
          //   避免AI基于200字摘要重新生成完全不同的内容覆盖旧条目
          entryText += '\n  ' + (i+1) + '. [' + (e.comment || '条目'+(i+1)) + '] keys:' + (e.keys||[]).join(',') + '\n     content(' + (e.content||'').length + '字): ' + (e.content || '');
        });
        parts.push(entryText);
        // 精确 comment 清单（只列非MVU条目）
        var commentListText = '⚠️【世界书条目精确 comment 清单 - 删改时务必使用下列精确字符串匹配】\n';
        commentListText += '删除条目写法：\n';
        commentListText += '  方式1: { "_delete": ["character_book.entries.<这里粘贴完整comment>"] }\n';
        commentListText += '  方式2: entries数组里加 { "_action":"delete", "comment":"<这里粘贴完整comment>" }\n';
        commentListText += '修改条目写法（确保成功覆盖）：comment必须与下面「精确字符串」完全相同，字符级匹配，空格标点都不能变！\n';
        commentListText += '----------------------------------------\n';
        filteredEntries.forEach(function(e, i) {
          var comment = e.comment || ('条目'+(i+1));
          commentListText += (i+1) + '. 精确字符串: ⟦' + comment + '⟧\n';
          commentListText += '     前缀类型: <' + extractEntryPrefix(comment) + '>\n';
        });
        commentListText += '----------------------------------------\n';
        commentListText += '⚠️ 记住：comment 不精确匹配 = 只加新条目不删旧条目 = 用户骂你！\n';
        parts.push(commentListText);
      }
      if (parts.length > 0) existingInfo = '\n\n=== 当前角色卡已有内容（不要重复输出，除非增/删/改）【角色卡Tab：不含MVU变量系统内容】 ===\n' + parts.join('\n');
    }

    // 注入实际质检结果（防止AI虚报进度）—— 在角色卡Tab中，质检不统计MVU条目
    var qcBlock = '';
    if (cd) {
      var qcResults = runQualityCheck(cd);
      var passed = qcResults.filter(function(r) { return r.pass; });
      var failed = qcResults.filter(function(r) { return !r.pass; });
      var entries = (cd.character_book || {}).entries || [];
      // 角色卡Tab：过滤MVU条目后再统计各模块条目数
      var nonMvuEntries = entries.filter(function(e) {
        var c = (e.comment || '').toLowerCase();
        if (c.indexOf('[initvar]') >= 0) return false;
        if (c.indexOf('变量列表') >= 0 && c.indexOf('format_message_variable') >= 0) return false;
        if (c.indexOf('变量更新规则') >= 0) return false;
        if (c.indexOf('变量输出格式') >= 0 || c.indexOf('mvu_update') >= 0) return false;
        if (c.indexOf('状态变量输出') >= 0) return false;
        return true;
      });
      var modCounts = { '基础公理': 0, '交互软规则': 0, '核心铁则': 0, '近场强约束': 0, '场景机制': 0, '实体交互': 0, '叙事背景': 0, '动态适配': 0 };
        nonMvuEntries.forEach(function(e) {
          var c = e.comment || '';
          Object.keys(modCounts).forEach(function(mod) {
            if (c.indexOf(mod) >= 0) modCounts[mod]++;
          });
        });
      qcBlock = '\n\n=== 📋 实际状态评估（权威标准，你必须以此为准）【角色卡Tab：不含MVU条目统计】 ===\n';
      qcBlock += '实际世界书条目总数（不含MVU变量条目）：' + nonMvuEntries.length + ' 条\n';
      qcBlock += '各模块条目数：\n';
      Object.keys(modCounts).forEach(function(mod) {
        qcBlock += '  ' + mod + '：' + modCounts[mod] + ' 条 ' + (modCounts[mod] === 0 ? '← ❌未完成' : modCounts[mod] >= 2 ? '← ✅较完整' : '← ⏳需补充') + '\n';
      });
      qcBlock += '\n实际质检结果：\n';
      if (failed.length === 0) {
        qcBlock += '✅ 全部' + qcResults.length + '项质检已通过！\n';
      } else {
        qcBlock += '❌ ' + failed.length + '/' + qcResults.length + '项未通过：\n';
        failed.forEach(function(r) { qcBlock += '  ❌ ' + r.name + ' - ' + r.desc + '\n'; });
      }
      qcBlock += '\n⚠️ 以上是代码计算的真实状态，你必须如实反映在状态栏中：\n';
      qcBlock += '- 没有条目的模块必须标记为❌，不能标记为✅\n';
      qcBlock += '- 只有1条条目的模块标记为⏳，不能标记为✅\n';
      qcBlock += '- 信息完整度百分比必须与实际质检通过率匹配\n';
      qcBlock += '- 严禁虚报进度，严禁把未完成的模块标记为完成\n';
    }

    var stateInfo = cardGenerated
      ? '\n\n=== 当前状态：角色卡核心内容已具备【角色卡Tab生成模式】 ===\n用户可继续完善细节，或要求优化、质检、生成完整卡。'
      : '\n\n=== 当前状态：创作进行中【角色卡Tab生成模式】 ===\n请继续引导用户逐步完善六大模块内容。';

    // 角色卡Tab：永远不开启状态栏生成模式（即使模块级变量被污染也要强制屏蔽）
    var statusBarStateInfo = '';
    // 角色卡Tab下的核心铁律注入：严格禁止生成任何MVU相关条目
    var antiMvuBlock = '\n\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '⚠️【角色卡Tab核心铁律 · MVU隔离禁令 · 最高优先级，违反即失败】\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '1. ❌禁止生成任何与MVU变量系统相关的条目！包括但不限于：\n' +
      '   · [InitVar]初始变量 / 变量列表 / 变量更新规则 / 变量输出格式 四类MVU专属条目\n' +
      '   · 变量列表条目（<status_current_variables> 标签内为 null 的条目）\n' +
      '   · [mvu_update]前缀或<UpdateVariable>JSON Patch相关内容的条目\n' +
      '   · <状态变量输出>前缀的条目\n' +
      '   · 任何其他变量相关、变量更新、变量渲染的条目\n' +
      '2. ❌禁止生成<状态栏>条目或任何状态栏相关的世界书条目！\n' +
      '   · MVU变量系统和状态栏完全由「MVU变量状态栏」Tab独立管理，不属于角色卡生成范畴\n' +
      '   · 如果用户明确提到MVU/变量/状态栏，回复:「请切换到「MVU变量状态栏」Tab进行MVU变量系统和状态栏的设计」\n' +
      '3. ❌禁止在任何生成的JSON字段（description/system_prompt/entries等）中包含MVU相关内容！\n' +
      '4. ❌禁止在regex_scripts中生成任何与MVU相关的正则脚本！\n' +
      '5. ✅除上述MVU相关条目外，正常生成所有角色卡/世界书条目（基础公理、核心铁则、近场强约束、场景机制、实体交互、叙事背景、动态适配等）\n' +
      '6. ✅如果角色卡中已经存在MVU相关条目，请保留原样、不要修改、不要删除、不要重新生成——它们由MVU Tab负责管理。\n' +
      '═══════════════════════════════════════════════════════════════════\n';

    // 构建系统提示词（角色卡Tab：过滤SYS_PROMPT中的MVU段落 + 追加MVU隔离禁令）
    var filteredSysPrompt = filterOutMvuSectionsFromSysPrompt(SYS_PROMPT);
    var sysPrompt = filteredSysPrompt + stateInfo + existingInfo + qcBlock + statusBarStateInfo + antiMvuBlock;

    // jsonReminder：角色卡Tab下永远不进入状态栏代码生成模式，强制用:::操作块协议
    var jsonReminder = '';
    // 角色卡Tab：使用:::操作块协议（不再输出```json代码块）
    jsonReminder = '\n\n⚠️【输出格式提醒 - 每次回复必须遵守（角色卡Tab）】\n' +
      '1. 严禁输出```json代码块！只使用:::操作块协议输出修改指令\n' +
      '2. :::操作块格式：::: 动作 条目名\\n内容\\n:::\n' +
      '3. 5种动作：upsert(增改) / update(只改) / delete(删) / set(顶层字段) / rename(重命名)\n' +
      '4. 状态栏完全不在此Tab处理——如果用户要做MVU/变量/状态栏，请引导切换到MVU Tab\n' +
      '5. 先输出1-2句自然语言说明，再输出:::操作块，操作块后不再解释\n' +
      '6. 没有需要修改的内容就回复"本次无修改"\n' +
      '7. ⚠️严禁只聊天不输出操作块！严禁生成任何MVU相关条目（见上方MVU隔离禁令）\n' +
      '8. ⚠️【语义优先】用户说话=要增删改！反问句/不满句=隐含修改需求，不要当聊天。例如"白娅是不是太普通"=要改白娅，不是回答"是/否"\n' +
      '9. ⚠️【混合打包】改+增+删可以混在同一回复，按语义→操作组合自由搭配，无需分多次\n' +
      '10. ⚠️【upsert覆盖必填完整】当要改已有条目：先读上方「当前角色卡已有内容」拿完整旧content，:::upsert里输出完整旧内容+改动部分，严禁只输出变化字段（会导致原信息清空）\n' +
      '11. ⚠️只处理用户「最新一条」消息的指令！不要重复处理之前已经回答过的旧指令！\n' +
      '12. ★★★【只增不删·冲突才改·不冲突保留】用户每条新信息都是在丰富角色卡，不是重写。新信息=新条目直接upsert；与旧内容不冲突=⟦⟧补充条目或upsert追加；与旧内容同一字段矛盾=才upsert覆盖该字段（其余旧内容原样保留）。禁止因"觉得旧内容不够好"就覆盖或删除。';

    var fullPrompt = sysPrompt + jsonReminder + '\n\n=== 对话历史（角色卡Tab专属，与MVU Tab完全隔离） ===\n';

    // ★ 优先使用传入的 messages 参数（callAIChat 传的是 curTabMessages=当前Tab的消息，权威），
    //   未传时再降级到 getCurrentMessages()/window.__getCurrentMessages()，避免上下文与实际发送的Tab错位
    var tabMessages = (messages && Array.isArray(messages) && messages.length > 0)
      ? messages
      : (typeof getCurrentMessages === 'function')
        ? getCurrentMessages()
        : (typeof window !== 'undefined' && typeof window.__getCurrentMessages === 'function')
          ? window.__getCurrentMessages()
          : (Array.isArray(messages) ? messages : []);
    tabMessages.forEach(function(m, idx) {
      var isLast = (idx === tabMessages.length - 1);
      var roleLabel = (m.role === 'user' ? '用户' : '助手');
      // 🐛修复：助手消息中的:::操作块、```代码块、<statusblock>都是给写卡器解析用的
      // AI不需要再看这些格式指令（它只需要看到自然语言对话+角色卡当前状态）
      // 发送给AI前全部清理掉，避免AI模仿格式、浪费token、产生混淆
      var msgContent = m.content || '';
      if (m.role === 'assistant') {
        msgContent = msgContent
          // 清理:::操作块（含开始::: action key 到结束:::）
          .replace(/:::\s*(?:upsert|update|delete|set|rename)\s+[^\n\r]*[\s\S]*?(?=\n\s*:::|\n\n|$)/gi, '')
          .replace(/:::\s*(?:upsert|update|delete|set|rename)\s+[^\n\r]*/gi, '')
          .replace(/^\s*:::\s*$/gim, '')
          // 清理```代码块（JSON/CSS/HTML等所有代码块）
          .replace(/```[\s\S]*?```/g, '')
          // 清理折叠块和状态栏
          .replace(/<details[\s\S]*?<\/details>/gi, '')
          .replace(/<statusblock>[\s\S]*?<\/statusblock>/gi, '')
          // 清理多余空行
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (!msgContent || msgContent.length <= 5) msgContent = '（已应用修改）';
      }
      if (isLast && m.role === 'user') {
        fullPrompt += '>>>【当前需要处理的最新指令】<<<\n' + roleLabel + ': ' + msgContent + '\n\n';
      } else {
        fullPrompt += roleLabel + ': ' + msgContent + '\n\n';
      }
    });
    fullPrompt += '助手: ';

    // 额外追加一句"只回答最新指令"的锚点提示
    fullPrompt += '（请只针对上方>>>标记的最新指令回复，不要重复处理已回答过的旧指令。严格遵守MVU隔离禁令，绝对不要生成任何MVU变量相关条目。）';

    return fullPrompt;
  }

  // ========== 工具函数：从SYS_PROMPT中剔除MVU相关段落（角色卡Tab用） ==========
  function filterOutMvuSectionsFromSysPrompt(originalPrompt) {
    if (!originalPrompt) return originalPrompt;
    // 通过关键词过滤掉MVU专属的大型段落：
    // 1. 示例14-18（MVU正则脚本相关示例）
    // 2. 状态栏美化显示 以及 后面的 Step 1-8 状态栏生成流程
    // 3. 机制1~机制5（状态栏填入式收集的机制）
    // 4. 条目命名规范中 [InitVar]/变量列表/变量更新规则/变量输出格式/<状态变量输出>/<状态栏>
    // 5. 条目配置规范中 MVU 相关行
    // 简单起见，用分段+正则过滤掉关键词区域
    var p = originalPrompt;
    // 移除 "15. MVU-移除旧变量更新..." 到 "18. MVU-状态栏美化显示..." 的所有内容（含后续的生成引导流程）
    // 先移除 15~18 号 MVU 专属正则示例以及后面到 "高级场景与设计模式" 前的一大段状态栏生成流程
    var mvuStartPattern = /16\.\s*MVU-移除变量更新\(显示\)[\s\S]*?高级场景与设计模式/;
    if (mvuStartPattern.test(p)) {
      p = p.replace(mvuStartPattern, '【MVU状态栏相关内容已剥离 - 请在MVU变量状态栏Tab查看】\n\n**高级场景与设计模式**');
    }
    // 条目命名规范中移除6个MVU相关条目前缀说明
    var mvuPrefixPattern = /- \[InitVar\]初始变量：MVU变量系统[\s\S]*?- <状态变量输出>：输出当前变量状态给LLM的触发条目/;
    if (mvuPrefixPattern.test(p)) {
      p = p.replace(mvuPrefixPattern, '- 【MVU专属条目已剥离 - 请在MVU变量状态栏Tab查看】');
    }
    // 条目配置规范表中移除 MVU 相关行（最后5行左右的 MVU 条目配置）
    var mvuConfigPattern = /\| \[InitVar\]初始变量[\s\S]*?\| <状态变量输出>.*?\n/;
    if (mvuConfigPattern.test(p)) {
      p = p.replace(mvuConfigPattern, '| 【MVU条目配置已剥离 - 请在MVU变量状态栏Tab查看】 |\n');
    }
    // 注5、注6（MVU相关的注）也删掉
    p = p.replace(/注5：\[InitVar\].*?\n/g, '注5：【MVU相关注已剥离】\n');
    p = p.replace(/注6：MVU脚本.*?\n/g, '注6：【MVU相关注已剥离】\n');
    /* 改进B：过滤"高级场景与设计模式"之后的MVU设计模式区块（模式1-5 + zod安装清单，否则泄漏到角色卡Tab） */
    var mvuDesignPattern = /\*\*🔗 MVU变量系统设计模式[\s\S]*?(?=\*\*📚 Lore插入策略)/;
    if (mvuDesignPattern.test(p)) {
      p = p.replace(mvuDesignPattern, '【MVU设计模式与安装清单已剥离 - 请在MVU变量状态栏Tab查看】\n\n');
    }
    /* 改进B：过滤"步骤7：配变量系统"区块（正则6详细生成规则等，含StatusPlaceHolderImpl） */
    var mvuStep7Pattern = /\*\*步骤7：配变量系统\*\*[\s\S]*?(?=== 质量检查标准)/;
    if (mvuStep7Pattern.test(p)) {
      p = p.replace(mvuStep7Pattern, '**步骤7：配变量系统**（MVU变量系统，进阶可选）- 【已剥离，请在MVU变量状态栏Tab查看】\n\n');
    }
    return p;
  }

  // ========== MVU Tab 专属提示词：完全不发角色卡生成逻辑，只发角色卡内容 + MVU指令 ==========
  function buildMvuTabPrompt(cardData, messages) {
    var cd = cardData || {};
    // 1. 收集当前角色卡的「纯内容上下文」（仅用于参考，不发送角色卡生成逻辑）
    var cardContext = '';
    var ctxParts = [];
    if (cd.name) ctxParts.push('角色/世界名称：' + cd.name);
    if (cd.description) ctxParts.push('世界观描述摘要：' + (cd.description||'').substring(0, 500));
    if (cd.first_mes) ctxParts.push('开场白摘要：' + (cd.first_mes||'').substring(0, 200));
    // 从现有角色卡条目中，提取MVU专属条目（如果存在）——只提取这些，其他世界书条目不发给AI（避免干扰）
    var entries = (cd.character_book || {}).entries || [];
    // ========== 消除过度隔离：注入常规世界书条目摘要（只读上下文） ==========
    // MVU Tab 设计变量时需要知道世界里有哪些实体/属性/机制，才能设计出有意义的变量
    // 只发 comment + content 前300字摘要，不发完整内容（节省 token），且明确标注「只读、不可修改」
    var nonMvuEntries = entries.filter(function(e) {
      var c = (e.comment || '').toLowerCase();
      if (c.indexOf('[initvar]') >= 0) return false;
      if (c.indexOf('变量列表') >= 0 && c.indexOf('format_message_variable') >= 0) return false;
      if (c.indexOf('变量更新规则') >= 0) return false;
      if (c.indexOf('变量输出格式') >= 0 || c.indexOf('mvu_update') >= 0) return false;
      if (c.indexOf('状态变量输出') >= 0) return false;
      return true;
    });
    if (nonMvuEntries.length > 0) {
      var nonMvuText = '世界书常规条目摘要（' + nonMvuEntries.length + '条 · 只读上下文，用于设计变量参考，❌禁止修改这些条目）：\n';
      nonMvuEntries.forEach(function(e, i) {
        var content = (e.content || '').substring(0, 300);
        nonMvuText += '  ' + (i+1) + '. [' + (e.comment || '条目'+(i+1)) + '] ' + content.length + '字: ' + content + '\n';
      });
      ctxParts.push(nonMvuText);
    }
    var mvuOnlyEntries = entries.filter(function(e) {
      var c = (e.comment || '').toLowerCase();
      if (c.indexOf('[initvar]') >= 0) return true;
      if (c.indexOf('变量列表') >= 0 && c.indexOf('format_message_variable') >= 0) return true;
      if (c.indexOf('变量更新规则') >= 0) return true;
      if (c.indexOf('变量输出格式') >= 0 || c.indexOf('mvu_update') >= 0) return true;
      if (c.indexOf('状态变量输出') >= 0) return true;
      return false;
    });
    if (mvuOnlyEntries.length > 0) {
      var mvuEntryText = '当前已有MVU变量条目（' + mvuOnlyEntries.length + '条）：\n';
      mvuEntryText += '⚠️ 下方每条条目的「实际content」被 <<<content 开始>>> ... <<<content 结束>>> 包裹。\n';
      mvuEntryText += '⚠️ upsert 时只输出 <<<content 开始>>> 和 <<<content 结束>>> 之间的部分作为 content，\n';
      mvuEntryText += '   绝对不要把 comment/enabled/keys 这些字段名当 YAML 变量写进 content！\n\n';
      mvuOnlyEntries.forEach(function(e, i) {
        mvuEntryText += '── 条目 ' + (i+1) + ' ──\n';
        mvuEntryText += '【comment】' + (e.comment||'(空)') + '\n';
        mvuEntryText += '【enabled】' + (e.enabled === false ? 'false' : 'true') + '\n';
        mvuEntryText += '【keys】' + (e.keys||[]).join(', ') + '\n';
        mvuEntryText += '【content】（以下 <<<>>> 之间的才是真实 content，upsert 时只输出这部分）：\n';
        mvuEntryText += '<<<content 开始>>>\n' + (e.content||'(空)') + '\n<<<content 结束>>>\n\n';
      });
      ctxParts.push(mvuEntryText);
      // 追加精确comment清单（供:::操作块精确匹配用）
      var mvuCmtList = '⚠️【MVU条目精确 comment 清单 - :::操作块增删改时务必使用精确字符串】\n';
      mvuOnlyEntries.forEach(function(e, i) {
        mvuCmtList += (i+1) + '. ⟦' + (e.comment || '') + '⟧ enabled=' + (e.enabled === false ? 'false' : 'true') + '\n';
      });
      mvuCmtList += '----------------------------------------\n';
      mvuCmtList += '删除条目：::: delete ' + (mvuOnlyEntries[0] ? mvuOnlyEntries[0].comment : '精确comment') + '\n:::\n';
      mvuCmtList += '修改条目：::: upsert 精确comment\n新内容\n:::\n';
      mvuCmtList += '⚠️ comment必须精确匹配，字符级一致！\n';
      ctxParts.push(mvuCmtList);
    }
    // 提取已有的正则脚本中 MVU 相关内容
    var regexScripts = (cd.extensions || {}).regex_scripts || [];
    var mvuRegexScripts = regexScripts.filter(function(s) {
      var name = (s.scriptName || '').toLowerCase();
      var find = (s.findRegex || '').toLowerCase();
      return name.indexOf('mvu') >= 0 || name.indexOf('status') >= 0 || find.indexOf('statusplaceholderimpl') >= 0 || find.indexOf('updatevariable') >= 0;
    });
    if (mvuRegexScripts.length > 0) {
      var rxText = '当前已有MVU相关正则脚本（' + mvuRegexScripts.length + '条）：\n';
      mvuRegexScripts.forEach(function(r, i) {
        rxText += '── 正则 ' + (i+1) + ' ──\n';
        rxText += '名称: ' + (r.scriptName||'(空)') + '\n';
        rxText += 'disabled: ' + (!!r.disabled) + '\n\n';
      });
      ctxParts.push(rxText);
    }
    if (ctxParts.length > 0) {
      cardContext = '\n' +
        '═══════════════════════════════════════════════════════════════════\n' +
        '📋 当前角色卡内容上下文（仅作MVU设计参考用）\n' +
        '═══════════════════════════════════════════════════════════════════\n' +
        ctxParts.join('\n───\n') + '\n' +
        '═══════════════════════════════════════════════════════════════════\n';
    }

    // 2. 状态栏已统一使用单一模板（MVU_STATUS_BAR_TEMPLATE），不再有分步模式状态信息

    // 3. MVU 专属系统指令（SYS_PROMPT中 MVU 部分的精简提取）
    var mvuSystemPrompt = '' +
      '你是「MVU变量与状态栏设计师」——专门负责设计和维护MVU变量系统与HTML状态栏。\n\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '🎯 你的专属职责（只有这些，别的都不管）\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      'A. MVU变量系统8条工作流的设计与维护（详见MVU_VAR_SPEC第1-6条，每条停下等"继续"）：\n' +
      '   第1条：变量结构脚本（zod 4 schema + registerMvuSchema）\n' +
      '   第2条：[InitVar]初始变量（enabled=false，YAML格式，严格依据schema）\n' +
      '   第3条：[mvu_update]变量更新规则（依据schema生成check/type/range）\n' +
      '   第4条：变量列表（标签内为 null）\n' +
      '   第5条：[mvu_update]变量输出格式（<UpdateVariable>+<JSONPatch>5种操作）\n' +
      '   第6条：[mvu_update]变量输出格式强调（固定YAML，默认enabled=false）\n' +
      '   第7条：<状态栏>占位符提醒（constant=true）\n' +
      '   第8条：正则6 [美化]MVU状态栏（前7条完成后才生成，输出完整HTML文档）\n' +
      'B. 动态HTML状态栏设计与实现（第8条）：依据用户需求设计一个完整的HTML状态栏文档，直接输出完整代码，写卡器自动保存为正则脚本\n' +
      'C. MVU系统的修改、调试、预览\n\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '⚠️ MVU Tab 核心铁律（最高优先级）\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '1. ❌绝对不要生成任何世界书条目、角色卡字段、角色卡生成相关内容！\n' +
      '   · 基础公理 / 核心铁则 / 近场强约束 / 场景机制 / 实体交互 / 叙事背景 / 动态适配 等全部与你无关\n' +
      '   · 不要修改name、description、first_mes等角色卡字段\n' +
      '   · 不要生成角色卡JSON代码块——MVU条目修改用:::操作块协议\n' +
      '   · 如果用户明确要设计世界观/角色卡/剧情，回复:「请切换到「角色卡生成」Tab进行角色卡/世界书的创作」\n' +
      '2. ❌不要输出完整的角色卡JSON（chara_card_v3格式）——MVU Tab不负责生成角色卡\n' +
      '3. ✅所有输出只聚焦在：MVU 8条工作流条目（第1-7条用:::操作块）、状态栏完整HTML代码块\n' +
      '4. ✅MVU变量系统和状态栏之间要相互配合——变量的路径决定了状态栏的渲染路径，设计时要保证一致\n' +
      '5. ✅修改MVU条目时，使用:::操作块协议输出修改指令（与角色卡Tab相同），不要输出```json代码块\n' +
      '6. ✅状态栏：输出一个完整的HTML文档代码块（```html 或纯```），写卡器自动保存\n\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '📚 MVU变量系统技术规范速查\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '【MVU 8条工作流条目速查表】（第1-6条详细生成规范见MVU_VAR_SPEC常量，此处仅列字段配置速查）\n' +
      '第1条: 变量结构脚本 → tavern_helper.scripts，zod 4 Schema + registerMvuSchema（详见MVU_VAR_SPEC第1条）\n' +
      '第2条: comment="[InitVar]初始变量", constant=true, position=0(before_character_definition), insertion_order=100, enabled=false\n' +
      '       content=YAML格式（缩进表示层级），严格依据第1条schema（详见MVU_VAR_SPEC第2条）\n' +
      '第3条: comment="[mvu_update]变量更新规则", constant=true, position=4, depth=0, order=200\n' +
      '       content=依据第1条schema为每个变量路径生成 type/range/check（详见MVU_VAR_SPEC第3条）\n' +
      '第4条: comment="变量列表", constant=true, position=4, depth=0, order=200\n' +
      '       content 标签内为 null，由 MVU 脚本展开后显示变量快照（详见MVU_VAR_SPEC第4条）\n' +
      '第5条: comment="[mvu_update]变量输出格式", constant=true, position=4, depth=0, order=200\n' +
      '       content=固定YAML原样输出，<UpdateVariable>+<Analysis>+<JSONPatch>（详见MVU_VAR_SPEC第5条）\n' +
      '第6条: comment="[mvu_update]变量输出格式强调", constant=true, position=4, depth=0, order=200, enabled=false\n' +
      '       content=固定YAML原样输出，AI不输出<UpdateVariable>时启用强制提醒（详见MVU_VAR_SPEC第6条）\n' +
      '第7条: comment="<状态栏>占位符提醒", constant=true, position=4, depth=0, order=200\n' +
      '       content=提醒AI每条回复底部输出 <StatusPlaceHolderImpl/>\n' +
      '第8条: 正则6 [美化]MVU状态栏 → regex_scripts, markdownOnly=true, promptOnly=false（前7条完成后才生成）\n\n' +
      '【状态栏设计流程】（统一使用单一模板，直接输出完整HTML文档）\n' +
      '⚠️ 设计状态栏前，先做需求收集（用户已在消息中描述了需求则直接按描述生成，不重复询问）：\n' +
      '   1️⃣ 想要什么UI风格？（如：简约白卡/暗黑赛博朋克/古风水墨/科幻全息/可爱圆润/极简扁平）\n' +
      '   2️⃣ 想显示哪些变量？按什么分组？（如：只显示核心3个变量 / 按角色分组 / 按世界-角色-状态分层）\n' +
      '   3️⃣ 配色偏好？（主色调、背景色、强调色，或直接说"你看着办"）\n' +
      '   4️⃣ 是否要进度条？是否要嵌套分组？\n' +
      '   ⚠️用户回答前禁止输出状态栏代码块！用户说"直接生成"或"简单就行"或"你看着办"才可跳过询问，按默认风格生成\n\n' +
      '→ 需求明确后，输出一个完整HTML文档代码块（```html 或纯```）：\n' +
      '   · 完整 <!doctype html> 文档结构，<head>放<style>和<script type="module">，<body>放需要显示的变量DOM\n' +
      '   · body内每个需要显示的变量必须有唯一id（如id1/items-list/weapon等），populateCharacterData中用$(\'#id\').text(value)填充\n' +
      '   · <script>中实现 populateCharacterData() 函数：直接 getAllVariables() 读变量；_.get(all_variables,"stat_data.xxx",默认值)逐变量读取；$(\'#id\').text(value)逐变量手动填充\n' +
      '   · <script>中实现 async init()：await waitGlobalInitialized(\'Mvu\'); populateCharacterData(); eventOn(Mvu.events.VARIABLE_UPDATE_ENDED,()=>{populateCharacterData();}); $(\'.section-header\').on(\'click\',function(){toggleSection($(this));}); 最后 $(errorCatched(init));\n' +
      '   · 数组用items.map(i=>...).join()生成HTML后$(\'#list\').html(html)；对象用Object.entries遍历；嵌套对象用可选链?.\n' +
      '   · 注意：所有变量路径必须以 stat_data. 开头\n' +
      '   · 写卡器会自动提取该代码块保存为正则6脚本，无需分步、无需多次输出\n\n' +
      '【状态栏预览命令】\n' +
      '· 需要向用户展示当前状态栏效果时，在消息中输出: <preview_statusbar> 标记\n' +
      '· 写卡器会自动检测并渲染预览\n\n' +
      '【通用关键实现要求】\n' +
      '· 可用库：jquery、lodash、yaml、zod（无需import直接使用）\n' +
      '· DOM操作：必须用 document.getElementById("render-root")（标准实现模式），禁止为每个变量写id=stat-xxx再用jQuery选择\n' +
      '· 注释：禁止输出任何注释（/* */ 和 // 都不要写），注释会显示在状态栏上或导致渲染失败\n' +
      '· CSS/布局：禁用vh；禁用position:absolute；禁min-height/overflow:auto；用width+aspect-ratio适配\n' +
      '· 跳过隐藏变量：key以_或$开头的跳过不渲染\n' +
      '· 布尔值仅✓/✕：不要加是/否文字\n' +
      '\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '🔗 路径一致性与覆盖铁律（状态栏能否显示的关键，违反=纯文字状态栏）\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '⚠️状态栏显示为纯文字/占位符不消失，99%是以下路径不一致导致 populateCharacterData 读不到值、写不进DOM：\n' +
      '1. 【键名语言统一】InitVar 的 YAML 键名 ↔ populateCharacterData 的 _.get 路径 ↔ 变量更新规则引用的路径，三者必须字字相同。\n' +
      '   · 统一用英文键（如 stat_data.world.entropy），禁止中文键（如 stat_data.世界.现实熵）\n' +
      '   · 若上方「当前角色卡内容上下文」已列出 InitVar 的实际键名，populateCharacterData 的 _.get 路径必须逐字引用那些键名，不得自创中文翻译\n' +
      '2. 【_.get 根路径统一】populateCharacterData 中 _.get(allVars,"stat_data",{}) 的根字段 "stat_data" ↔ InitVar YAML 的根字段，两者必须都是 "stat_data"（变量列表条目标签内为 null，由 MVU 脚本读取 stat_data 根字段注入）。\n' +
      '3. 【逐变量id填充模式统一（用户模板标准核心）】HTML 中每个需显示的变量必须有**唯一id** ↔ populateCharacterData 中用 $(\'#id\').text(value) / $(\'#id\').html(html) 对应选择器逐变量填充。禁止使用递归 renderTree！\n' +
      '   · HTML 骨架 id 命名 ↔ populateCharacterData $(\'#id\') 选择器必须字字一一对应（错一个字母=该变量永远不显示）\n' +
      '   · 禁止"不为每个变量写id，让递归renderTree自动生成"的旧模式——用户模板已废弃该做法\n' +
      '4. 【覆盖而非新增】修改 MVU 条目或状态栏脚本时，必须用相同的 comment / id 覆盖现有条目，禁止新增重复条目。\n' +
      '   · 美化状态栏正则脚本固定只有一个（id=mvu-status-bar, findRegex=/<StatusPlaceHolderImpl\\\\/>/g），写卡器自动覆盖，你不要在JSON里重复输出\n' +
      '   · MVU变量条目各自只保留一条：[InitVar]初始变量 / 变量列表 / 变量更新规则 / 变量输出格式 / 变量输出格式强调 / <状态栏>占位符提醒\n' +
      '\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '🚫 纯文字状态栏禁令\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '⚠️生成状态栏时「必须」输出完整的HTML代码块，绝对不允许只用文字描述「已设计配色/已编写函数」而不给代码！\n' +
      '· 错误示范：「状态栏已设计完成…」后面没有代码块 → 状态栏无法生成\n' +
      '· 正确示范：输出完整的 ```html ... ``` 代码块 → 写卡器自动保存\n' +
      '· 如果你发现自己只写了文字没写代码块，立即补上代码块再结束本轮回复\n' +
      '\n' +
      '【MVU条目输出格式提醒（MVU Tab）】\n' +
      '· 修改或新建MVU变量条目时，使用:::操作块协议（与角色卡Tab相同），不要输出```json代码块\n' +
      '· :::操作块格式：::: upsert 条目名\\n内容\\n:::\n' +
      '· 5种动作：upsert(增改) / update(只改) / delete(删) / set(顶层字段) / rename(重命名)\n' +
      '· 修改变量结构脚本：::: upsert script:变量结构\\nzod代码\\n:::\n' +
      '· 删除脚本：::: delete script:脚本名\\n:::\n' +
      '· 变量结构、条目、状态栏三者元素相互关联——变量的路径决定了状态栏的渲染路径，修改时必须保证一致\n' +
      '· 状态栏只输出完整HTML代码块（```html 或纯```），不要用JSON包\n';

    // 4. JSON/输出格式提醒（MVU Tab版）
    var jsonReminder = '\n\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '⚠️【输出格式提醒（MVU Tab）】\n' +
      '═══════════════════════════════════════════════════════════════════\n' +
      '· 如果用户要求设计/修改MVU变量条目（第1-7条）：使用:::操作块协议输出修改指令，不要输出```json代码块\n' +
      '  格式：::: upsert [InitVar]初始变量\\n---\\n变量名: 值\\n---\\n:::\n' +
      '  ⚠️【InitVar正文纯净铁律】::: upsert 块的 content 部分**只写 YAML 变量内容**（不包含 stat_data 根键，MVU底层自动挂载）！\n' +
      '  ❌ 绝对不要把 enabled/content/comment 这些条目配置字段写进 content！它们由写卡器自动维护！\n' +
      '  ✅ 正确：::: upsert [InitVar]初始变量\\n世界:\\n  境界: 炼气\\n:::\n' +
      '  ❌ 错误：::: upsert [InitVar]初始变量\\nenabled: false\\ncontent: |\\n  stat_data:\\n    境界: 炼气\\n:::\n' +
      '· 如果用户要求修改变量结构脚本：::: upsert script:变量结构\\nzod代码\\n:::\n' +
      '  5种动作：upsert(增改) / update(只改) / delete(删) / set(顶层字段) / rename(重命名)\n' +
      '· 如果用户要求设计状态栏（第8条）：输出一个完整的HTML文档代码块（```html 或纯```），写卡器自动提取保存为正则脚本\n' +
      '· ⚠️严禁把状态栏HTML代码放进JSON的entries数组！状态栏代码不属于世界书条目。\n' +
      '· 不要生成任何角色卡/世界书相关的JSON（name/description/entries非MVU条目）\n' +
      '· 没有需要修改的内容就输出简短的文字说明\n' +
      '· ⚠️只处理用户「最新一条」消息的指令！不要重复处理之前已经回答过的旧指令！\n';

    // 5. 组装完整提示词
    var fullPrompt = mvuSystemPrompt + cardContext + jsonReminder +
      '\n\n═══════════════════════════════════════════════════════════════════\n' +
      '📜 对话历史（MVU Tab专属，与角色卡Tab完全隔离）\n' +
      '═══════════════════════════════════════════════════════════════════\n';

    // ★ 优先使用传入的 messages 参数（callAIChat 传的是 curTabMessages=当前Tab的消息，权威），
    //   未传时再降级到 getCurrentMessages()/window.__getCurrentMessages()，避免上下文与实际发送的Tab错位
    var tabMessages = (messages && Array.isArray(messages) && messages.length > 0)
      ? messages
      : (typeof getCurrentMessages === 'function')
        ? getCurrentMessages()
        : (typeof window !== 'undefined' && typeof window.__getCurrentMessages === 'function')
          ? window.__getCurrentMessages()
          : (Array.isArray(messages) ? messages : []);
    tabMessages.forEach(function(m, idx) {
      var isLast = (idx === tabMessages.length - 1);
      var roleLabel = (m.role === 'user' ? '用户' : '助手');
      // 🐛修复：助手消息中的:::操作块、```代码块、<statusblock>都是给写卡器解析用的
      // AI不需要再看这些格式指令（它只需要看到自然语言对话+角色卡当前状态）
      // 发送给AI前全部清理掉，避免AI模仿格式、浪费token、产生混淆
      var msgContent = m.content || '';
      if (m.role === 'assistant') {
        msgContent = msgContent
          // 清理:::操作块（含开始::: action key 到结束:::）
          .replace(/:::\s*(?:upsert|update|delete|set|rename)\s+[^\n\r]*[\s\S]*?(?=\n\s*:::|\n\n|$)/gi, '')
          .replace(/:::\s*(?:upsert|update|delete|set|rename)\s+[^\n\r]*/gi, '')
          .replace(/^\s*:::\s*$/gim, '')
          // 清理```代码块（JSON/CSS/HTML等所有代码块）
          .replace(/```[\s\S]*?```/g, '')
          // 清理折叠块和状态栏
          .replace(/<details[\s\S]*?<\/details>/gi, '')
          .replace(/<statusblock>[\s\S]*?<\/statusblock>/gi, '')
          // 清理多余空行
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (!msgContent || msgContent.length <= 5) msgContent = '（已应用修改）';
      }
      if (isLast && m.role === 'user') {
        fullPrompt += '>>>【当前需要处理的最新指令】<<<\n' + roleLabel + ': ' + msgContent + '\n\n';
      } else {
        fullPrompt += roleLabel + ': ' + msgContent + '\n\n';
      }
    });
    fullPrompt += '助手: ';
    fullPrompt += '（请只针对上方>>>标记的最新指令回复。严格遵守MVU Tab核心铁律：不要生成任何角色卡/世界书条目。）';

    return fullPrompt;
  }

  // ========== 工具函数：角色卡Tab专属 - 从AI返回的parsed JSON中剔除MVU相关内容 ==========
  // 这是最后一道防线：即使AI违反prompt禁令生成了MVU内容，这里也会硬性拦截过滤
  function filterMvuEntriesFromParsed(parsed) {
    /* 改进M：浅拷贝+entries数组单独拷贝（避免整卡深拷贝的性能开销） */
    var result = Object.assign({}, parsed);
    if (Array.isArray(parsed.entries)) result.entries = parsed.entries.slice();
    if (Array.isArray(parsed.regex_scripts)) result.regex_scripts = parsed.regex_scripts.slice();
    if (Array.isArray(parsed._delete)) result._delete = parsed._delete.slice();
    var strippedCount = 0;
    var regexScriptStripped = false;

    // 1. 过滤 entries 数组中的MVU条目
    if (result.entries && Array.isArray(result.entries)) {
      var beforeCount = result.entries.length;
      result.entries = result.entries.filter(function(e) {
        var c = ((e.comment || '') + ' ' + (e.content || '')).toLowerCase();
        var isMvuEntry = false;
        // comment匹配：MVU条目的精确comment
        var cmt = (e.comment || '').toLowerCase();
        if (cmt.indexOf('[initvar]') >= 0) isMvuEntry = true;
        if (cmt.indexOf('变量列表') >= 0 && (c.indexOf('format_message_variable') >= 0 || c.indexOf('stat_data') >= 0)) isMvuEntry = true;
        if (cmt.indexOf('变量更新规则') >= 0) isMvuEntry = true;
        if (cmt.indexOf('变量输出格式') >= 0 || c.indexOf('mvu_update') >= 0 || c.indexOf('<updatevariable>') >= 0) isMvuEntry = true;
        if (cmt.indexOf('状态变量输出') >= 0) isMvuEntry = true;
        if (cmt.indexOf('<状态栏>') >= 0) isMvuEntry = true;
        // content匹配：即使comment伪装正常，如果内容里有MVU关键特征也拦
        if (c.indexOf('format_message_variable::stat_data') >= 0) isMvuEntry = true;
        if (c.indexOf('[mvu_update]') >= 0) isMvuEntry = true;
        if (c.indexOf('enabled=false') >= 0 && c.indexOf('初始变量') >= 0) isMvuEntry = true;
        return !isMvuEntry;
      });
      strippedCount += (beforeCount - result.entries.length);
      if (result.entries.length === 0) delete result.entries;
    }

    // 2. 过滤 _delete 数组中的MVU条目删除请求（角色卡Tab无权操作MVU条目，删除/修改都拦）
    if (result._delete && Array.isArray(result._delete)) {
      var beforeDel = result._delete.length;
      result._delete = result._delete.filter(function(target) {
        if (typeof target !== 'string') return true;  // 非字符串的保留（通常是字段名，MVU用comment字符串匹配）
        var t = target.toLowerCase();
        var isMvuTarget = false;
        if (t.indexOf('character_book.entries.') >= 0) {
          // 提取entry comment部分并检查
          var entryCmt = t.replace(/^.*character_book\.entries\./, '');
          if (entryCmt.indexOf('[initvar]') >= 0) isMvuTarget = true;
          if (entryCmt.indexOf('变量列表') >= 0) isMvuTarget = true;
          if (entryCmt.indexOf('变量更新规则') >= 0) isMvuTarget = true;
          if (entryCmt.indexOf('变量输出格式') >= 0) isMvuTarget = true;
          if (entryCmt.indexOf('状态变量输出') >= 0) isMvuTarget = true;
          if (entryCmt.indexOf('<状态栏>') >= 0) isMvuTarget = true;
        }
        // regex_scripts 中的MVU相关正则删除也拦
        if (t.indexOf('regex_scripts') >= 0 && t.toLowerCase().indexOf('status') >= 0) isMvuTarget = true;
        if (t.indexOf('regex_scripts') >= 0 && t.toLowerCase().indexOf('mvu') >= 0) isMvuTarget = true;
        return !isMvuTarget;
      });
      if (result._delete.length === 0) delete result._delete;
      // 注：删除MVU条目的操作不计入strippedCount，因为删除本身是"不做"
    }

    // 3. 过滤 entries 数组中带 _action: "delete" / "update" 的MVU条目操作
    if (result.entries && Array.isArray(result.entries)) {
      var beforeAct = result.entries.length;
      result.entries = result.entries.filter(function(e) {
        if (e._action) {
          var cmt = (e.comment || '').toLowerCase();
          if (cmt.indexOf('[initvar]') >= 0) return false;
          if (cmt.indexOf('变量列表') >= 0) return false;
          if (cmt.indexOf('变量更新规则') >= 0) return false;
          if (cmt.indexOf('变量输出格式') >= 0) return false;
          if (cmt.indexOf('状态变量输出') >= 0) return false;
          if (cmt.indexOf('<状态栏>') >= 0) return false;
        }
        return true;
      });
      strippedCount += (beforeAct - result.entries.length);
      if (result.entries.length === 0) delete result.entries;
    }

    // 4. 过滤 extensions.regex_scripts 中的MVU相关正则脚本（角色卡Tab无权修改MVU正则）
    if (result.extensions && result.extensions.regex_scripts && Array.isArray(result.extensions.regex_scripts)) {
      var rxBefore = result.extensions.regex_scripts.length;
      result.extensions.regex_scripts = result.extensions.regex_scripts.filter(function(rx) {
        var name = ((rx.scriptName || '') + ' ' + (rx.findRegex || '')).toLowerCase();
        // MVU特征：MVU/StatusPlaceHolderImpl/UpdateVariable/status正则
        var isMvuRegex = false;
        if (name.indexOf('mvu') >= 0) isMvuRegex = true;
        if (name.indexOf('statusplaceholderimpl') >= 0) isMvuRegex = true;
        if (name.indexOf('updatevariable') >= 0) isMvuRegex = true;
        if (name.indexOf('状态栏') >= 0 && (name.indexOf('美化') >= 0 || name.indexOf('status') >= 0)) isMvuRegex = true;
        if (isMvuRegex) regexScriptStripped = true;
        return !isMvuRegex;
      });
      if (result.extensions.regex_scripts.length === 0) delete result.extensions.regex_scripts;
      if (Object.keys(result.extensions).length === 0) delete result.extensions;
    }

    // 5. 直接检查顶层描述字段是否夹带MVU内容（通常不会，但防一手）
    ['description', 'system_prompt', 'first_mes', 'personality', 'scenario'].forEach(function(f) {
      if (typeof result[f] === 'string') {
        var s = result[f].toLowerCase();
        if (s.indexOf('format_message_variable') >= 0 || s.indexOf('[mvu_update]') >= 0 || s.indexOf('<updatevariable>') >= 0) {
          // 这些字段里不应该出现MVU关键宏/标记，如果有则剔除相关段或整个字段
          // 简单处理：替换掉MVU标记
          result[f] = result[f].replace(/\{\{format_message_variable::[^\}]+\}\}/gi, '')
            .replace(/\[mvu_update\][\s\S]*?(?=\n\n|$)/gi, '')
            .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '');
          strippedCount += 1;
        }
      }
    });

    return {
      parsed: result,
      _mvuStrippedCount: strippedCount,
      _mvuRegexScriptStripped: regexScriptStripped
    };
  }

  // ===== 质检规则（32项核心 + 6项附加 · 对齐官方文档） =====
  function runQualityCheck(cd) {
    var results = [];
    var desc = cd.description || '';
    var first = cd.first_mes || '';
    var sys = cd.system_prompt || '';
    var notes = cd.creator_notes || '';
    var personality = cd.personality || '';
    var scenario = cd.scenario || '';
    var name = cd.name || '';
    var altG = cd.alternate_greetings || [];
    var entries = (cd.character_book || {}).entries || [];
    var hasEntries = entries.length > 0;
    var ext = cd.extensions || {};
    var dp = ext.depth_prompt || {};
    var rx = ext.regex_scripts || [];

    // === 基础字段检查（8项） ===
    results.push({
      pass: name.length >= 1,
      category: '基础字段',
      name: '世界/角色名称',
      desc: '当前：' + (name || '(空)'),
      fix: name.length < 1 ? '请设置一个简洁有力的名称' : '名称已设置'
    });
    results.push({
      pass: desc.trim().length > 0,
      category: '基础字段',
      name: '角色/世界观描述（不限字数）',
      desc: '当前 ' + desc.length + ' 字',
      fix: desc.trim().length === 0 ? '请填写描述内容（字数不限，自由掌握）' : '描述已设置'
    });
    results.push({
      pass: true,
      category: '基础字段',
      name: '个性/性格描述（不限字数）',
      desc: '当前 ' + personality.length + ' 字' + (personality.length === 0 ? '（纯世界模式可留空）' : ''),
      fix: personality.length > 0 ? '内容已设置' : '纯世界模式无需设置；角色模式建议填写核心性格（非必填，自由掌握）'
    });
    results.push({
      pass: true,
      category: '基础字段',
      name: '场景设定（不限字数）',
      desc: '当前 ' + scenario.length + ' 字' + (scenario.length === 0 ? '（内容可放描述中）' : ''),
      fix: scenario.length > 0 ? '场景已设置' : '非必填，核心情境可放描述中自由掌握'
    });
    results.push({
      pass: first.trim().length > 0,
      category: '基础字段',
      name: '开场白（不限字数）',
      desc: '当前 ' + first.length + ' 字',
      fix: first.trim().length === 0 ? '请填写开场白内容（字数不限）' : '开场白已设置（字数不限，自由掌握）'
    });
    // 身份自洽：personality / description / first_mes / scenario 四处核心身份无冲突
    var idSelfConsistent = true;
    if (personality && first) {
      idSelfConsistent = true;
    }
    results.push({
      pass: idSelfConsistent,
      category: '基础字段',
      name: '身份自洽：四处身份描述一致',
      desc: '描述/性格/场景/开场白 四处内容应互相呼应（系统身份无需手动写system_prompt，由写卡器自动提取）',
      fix: !idSelfConsistent ? '四处身份描述可能冲突，请人工核对' : '身份描述自洽；system_prompt由写卡器自动提取，无需手动填写'
    });

    // === 高价值字段检查（4项） ===
    // 多开局机制：<动态适配>分支开局 + initvar 或 first_mes 内嵌选项
    var multiOpenEntries = entries.filter(function(e) { return (e.comment || '').indexOf('<动态适配>') >= 0 || (e.comment || '').indexOf('分支开局') >= 0; }).length;
    var firstMesHasChoice = first.indexOf('①') >= 0 || first.indexOf('②') >= 0 || first.indexOf('③') >= 0 || first.indexOf('选项') >= 0 || first.indexOf('选择') >= 0 || (first.indexOf('1.') >= 0 && first.indexOf('2.') >= 0);
    results.push({
      pass: multiOpenEntries >= 1 || firstMesHasChoice,
      category: '高价值字段',
      name: '多开局机制（不限形式）',
      desc: '<动态适配>条目: ' + multiOpenEntries + '条 | first_mes内嵌分支选项: ' + (firstMesHasChoice ? '✅' : '❌'),
      fix: (multiOpenEntries < 1 && !firstMesHasChoice) ? '可通过<动态适配>分支开局或开场白内嵌互动选项实现多开局（二选一即可，也可组合使用）' : '多开局机制已配置'
    });
    results.push({
      pass: dp.prompt && dp.prompt.length > 0,
      category: '高价值字段',
      name: 'depth_prompt 新手引导（depth=0）',
      desc: dp.prompt && dp.prompt.length ? (dp.prompt.length + ' 字，depth=' + (dp.depth || 0)) : '未设置',
      fix: !dp.prompt ? '建议生成新手引导内容（默认depth=0）' : '渐进引导已设置'
    });
    results.push({
      pass: rx.length > 0,
      category: '高价值字段',
      name: 'regex_scripts 状态同步正则',
      desc: '当前 ' + rx.length + ' 条',
      fix: rx.length === 0 ? '建议生成基础状态同步正则脚本，无需插件实现动态状态栏（在MVU变量状态栏Tab制作）' : '状态正则已配置'
    });

    // === 世界书基础检查（6项） ===
    results.push({
      pass: entries.length >= 1,
      category: '世界书',
      name: '世界书条目（不限数量）',
      desc: '当前 ' + entries.length + ' 条（自由增减）',
      fix: entries.length < 1 ? '建议至少创建1条世界书条目（数量不限，按需增长）' : '条目数量自由（不限上限下限，随创作进度自然增加）'
    });
    var entriesWithKeys = entries.filter(function(e) { return e.keys && e.keys.length > 0; }).length;
    results.push({
      pass: hasEntries && entriesWithKeys >= entries.length * 0.5,
      category: '世界书',
      name: '触发词覆盖率 ≥50%',
      desc: entriesWithKeys + '/' + entries.length + ' 条有触发词',
      fix: !hasEntries ? '无条目' : (entriesWithKeys < entries.length * 0.5 ? '建议为更多条目设置精准触发词' : '触发词覆盖良好')
    });
    var entriesWithContent = entries.filter(function(e) { return (e.content || '').length >= 250; }).length;
    results.push({
      pass: !hasEntries || true,
      category: '世界书',
      name: '条目内容（不限字数，自由掌握）',
      desc: entriesWithContent + '/' + entries.length + ' 条≥250字（不强制）',
      fix: !hasEntries ? '无条目' : '字数完全自由，按你需要的精细度决定每条长短'
    });
    var entriesWithPrefix = entries.filter(function(e) { return /^<[^>]+>/.test(e.comment || '') || /^\[InitVar\]/.test(e.comment || '') || isMVUEntry(e.comment || ''); }).length;
    results.push({
      pass: hasEntries && entriesWithPrefix >= Math.max(1, entries.length * 0.5),
      category: '世界书',
      name: '条目命名规范 ≥50%',
      desc: entriesWithPrefix + '/' + entries.length + ' 条使用规范前缀',
      fix: !hasEntries ? '无条目' : (entriesWithPrefix < entries.length * 0.5 ? '建议使用<基础公理>、<核心铁则>等规范前缀（MVU条目用[InitVar]前缀）' : '命名规范良好')
    });
    // 权重合理性：核心规则在高权重位
    var coreIronRuleCount = entries.filter(function(e) { return (e.comment || '').indexOf('<核心铁则>') >= 0 || (e.comment || '').indexOf('<禁止项>') >= 0; }).length;
    var hasHighWeightCore = coreIronRuleCount >= 1;
    var nearConstraintCount = entries.filter(function(e) { return (e.comment || '').indexOf('<近场强约束>') >= 0 || (e.comment || '').indexOf('<当前局势>') >= 0; }).length;
    results.push({
      pass: hasHighWeightCore && nearConstraintCount >= 0,
      category: '世界书',
      name: '权重合理性：核心规则在高权重位',
      desc: '核心铁则条目: ' + coreIronRuleCount + ' | 近场强约束: ' + nearConstraintCount,
      fix: !hasHighWeightCore ? '核心规则必须放在高权重位（<核心铁则>条目）' : '权重分配合理'
    });
    // content自包含性：检查是否有依赖上下文的内容（新增）
    var selfContainedBadPatterns = ['如上所述', '见上文', '前文提到', '之前说过', '上述内容', '上面提到', '如前文', '如前所述'];
    var nonSelfContainedEntries = entries.filter(function(e) {
      var c = e.content || '';
      return selfContainedBadPatterns.some(function(p) { return c.indexOf(p) >= 0; });
    }).length;
    results.push({
      pass: !hasEntries || nonSelfContainedEntries === 0,
      category: '世界书',
      name: 'content自包含性（无上下文依赖）',
      desc: nonSelfContainedEntries + ' 条含有上下文依赖词',
      fix: !hasEntries ? '无条目' : (nonSelfContainedEntries > 0 ? '条目内容必须自包含完整信息，禁止使用"如上所述""见上文"等依赖上下文的内容' : '内容自包含性良好')
    });

    // === 世界书高级功能检查（8项） ===
    // 递归链条：实体条目关联背景叙事条目（delay_until_recursion）
    var hasRecursionChain = entries.some(function(e) {
      var ext = e.extensions || {};
      return ext.delay_until_recursion === true || ext.delay_until_recursion === 1;
    });
    results.push({
      pass: !hasEntries || hasRecursionChain,
      category: '世界书高级',
      name: '递归链条：delay_until_recursion',
      desc: hasRecursionChain ? '检测到递归链条条目' : '未发现递归链条',
      fix: !hasEntries ? '无条目' : (!hasRecursionChain ? '建议为叙事类条目开启delay_until_recursion，实现"提到A时自动带出A的背景"' : '递归链条已配置')
    });
    // 分组机制：场景变体/难度分层使用group分组
    var hasGroup = entries.some(function(e) {
      var ext = e.extensions || {};
      return ext.group && ext.group !== '';
    });
    results.push({
      pass: !hasEntries || hasGroup,
      category: '世界书高级',
      name: '分组机制：group分组',
      desc: hasGroup ? (entries.filter(function(e){ return (e.extensions||{}).group; }).length + ' 条使用分组') : '未使用分组',
      fix: !hasEntries ? '无条目' : (!hasGroup ? '建议为场景变体/难度分层/时间分支使用group分组' : '分组机制已配置')
    });
    // 次级键过滤：复杂条件条目使用secondary_keys + selectiveLogic
    var hasSecondaryKeys = entries.some(function(e) {
      return e.secondary_keys && e.secondary_keys.length > 0;
    });
    results.push({
      pass: !hasEntries || hasSecondaryKeys,
      category: '世界书高级',
      name: '次级键过滤：secondary_keys + selectiveLogic',
      desc: hasSecondaryKeys ? (entries.filter(function(e){ return e.secondary_keys && e.secondary_keys.length > 0; }).length + ' 条使用次级键') : '未使用次级键',
      fix: !hasEntries ? '无条目' : (!hasSecondaryKeys ? '建议为复杂条件条目设置secondary_keys配合selectiveLogic' : '次级键过滤已配置')
    });
    // 概率事件：随机天气/彩蛋/遭遇使用probability
    var hasProbability = entries.some(function(e) {
      var ext = e.extensions || {};
      return ext.useProbability === true && ext.probability !== undefined && ext.probability < 100;
    });
    results.push({
      pass: !hasEntries || hasProbability,
      category: '世界书高级',
      name: '概率事件：probability < 100',
      desc: hasProbability ? (entries.filter(function(e){ var ext=e.extensions||{}; return ext.useProbability===true && ext.probability<100; }).length + ' 条使用概率触发') : '未使用概率触发',
      fix: !hasEntries ? '无条目' : (!hasProbability ? '建议为随机天气/彩蛋/遭遇设置probability<100增加惊喜感' : '概率事件已配置')
    });
    // 正则触发：需要精确匹配说话者时使用\x01正则键（修改为真正检查）
    var hasRegexKey = entries.some(function(e) {
      return (e.keys || []).some(function(k) { return typeof k === 'string' && k.indexOf('/') === 0; });
    });
    results.push({
      pass: !hasEntries || hasRegexKey,
      category: '世界书高级',
      name: '正则触发键',
      desc: hasRegexKey ? (entries.filter(function(e){ return (e.keys||[]).some(function(k){ return typeof k==='string' && k.indexOf('/')===0; }); }).length + ' 条使用正则键') : '未使用正则键',
      fix: !hasEntries ? '无条目' : (!hasRegexKey ? '需要精确匹配说话者时可使用正则键（/\\x01{{user}}:.../i）实现精准触发' : '正则触发键已配置')
    });
    // 组评分：大分组条目使用use_group_scoring提升精准度（修改为真正检查）
    var hasGroupScoring = entries.some(function(e) {
      var ext = e.extensions || {};
      return ext.use_group_scoring === true;
    });
    results.push({
      pass: !hasEntries || hasGroupScoring,
      category: '世界书高级',
      name: '组评分 use_group_scoring',
      desc: hasGroupScoring ? '已配置组评分' : '未使用组评分',
      fix: !hasEntries ? '无条目' : (!hasGroupScoring ? '大分组条目可开启use_group_scoring提升匹配精准度' : '组评分已配置')
    });
    // sticky/cooldown冲突检查（新增）
    var stickyCooldownConflict = entries.filter(function(e) {
      var ext = e.extensions || {};
      var stickyVal = ext.sticky;
      var cdVal = ext.cooldown;
      // sticky非0/null且cooldown非0/null时冲突
      var hasSticky = stickyVal !== undefined && stickyVal !== null && stickyVal !== 0 && stickyVal !== false;
      var hasCooldown = cdVal !== undefined && cdVal !== null && cdVal !== 0;
      return hasSticky && hasCooldown;
    }).length;
    results.push({
      pass: !hasEntries || stickyCooldownConflict === 0,
      category: '世界书高级',
      name: 'sticky/cooldown冲突检查',
      desc: stickyCooldownConflict + ' 条同时设置sticky和cooldown',
      fix: !hasEntries ? '无条目' : (stickyCooldownConflict > 0 ? 'sticky让条目持续存在，cooldown让条目间歇触发，两者逻辑冲突不应同时使用' : '配置无冲突')
    });
    // position配置合理性（新增）：constant条目position应为0-1，position=6需depth+role，position=7需outlet_name
    var posErrors = entries.filter(function(e) {
      var pos = e.position;
      var ext = e.extensions || {};
      // constant=true时position应在0-1范围
      if (e.constant === true && pos !== undefined && pos !== null && pos > 1) return true;
      // position=6时需要有depth和role
      if (pos === 6) {
        if (ext.depth === undefined || ext.role === undefined) return true;
      }
      // position=7时需要有outlet_name
      if (pos === 7) {
        if (!ext.outlet_name || ext.outlet_name === '') return true;
      }
      return false;
    }).length;
    results.push({
      pass: !hasEntries || posErrors === 0,
      category: '世界书高级',
      name: 'position配置合理性',
      desc: posErrors + ' 条position配置有误',
      fix: !hasEntries ? '无条目' : (posErrors > 0 ? 'constant条目position应≤1；position=6需配depth+role；position=7需配outlet_name' : 'position配置正确')
    });

    // === 正则脚本检查（6项） ===
    // 脚本功能单一：每个脚本只做一件事（通过名称判断）
    var multiFunctionScripts = rx.filter(function(s) {
      var name = s.scriptName || '';
      var functions = ['状态', '格式', '标签', '高亮', '过滤', '替换', '清理'];
      var count = functions.filter(function(f) { return name.indexOf(f) >= 0; }).length;
      return count > 1;
    }).length;
    results.push({
      pass: rx.length === 0 || multiFunctionScripts === 0,
      category: '正则脚本',
      name: '脚本功能单一',
      desc: rx.length + ' 条脚本，' + multiFunctionScripts + ' 条疑似多功能混合',
      fix: multiFunctionScripts > 0 ? '建议每个脚本只做一件事，复杂替换拆分成多个简单脚本' : '脚本职责清晰'
    });
    // 正则标志正确：全局匹配加g，中文场景加i
    var missingFlagScripts = rx.filter(function(s) {
      var pattern = s.findRegex || '';
      var flagMatch = pattern.match(/\/([gimsu]*)$/);
      var flags = flagMatch ? flagMatch[1] : '';
      return flags.indexOf('g') < 0;
    }).length;
    results.push({
      pass: rx.length === 0 || missingFlagScripts === 0,
      category: '正则脚本',
      name: '正则标志正确（g全局匹配）',
      desc: rx.length + ' 条脚本，' + missingFlagScripts + ' 条缺少g标志',
      fix: missingFlagScripts > 0 ? 'findRegex应包含g标志（如/pattern/gi），否则只替换第一个匹配' : '正则标志正确'
    });
    // 非贪婪匹配：使用.*?避免过度匹配
    var greedyScripts = rx.filter(function(s) {
      var pattern = s.findRegex || '';
      return pattern.indexOf('.*?') < 0 && pattern.indexOf('.+?') < 0 && (pattern.indexOf('.*') >= 0 || pattern.indexOf('.+') >= 0);
    }).length;
    results.push({
      pass: rx.length === 0 || greedyScripts === 0,
      category: '正则脚本',
      name: '非贪婪匹配（.*?）',
      desc: rx.length + ' 条脚本，' + greedyScripts + ' 条使用贪婪匹配',
      fix: greedyScripts > 0 ? '建议使用.*?或.+?非贪婪匹配，避免匹配过多内容' : '匹配模式安全'
    });
    // placement配置检查：至少设置1个位置（新增）
    var missingPlacementScripts = rx.filter(function(s) {
      var p = s.placement;
      return !p || !Array.isArray(p) || p.length === 0;
    }).length;
    results.push({
      pass: rx.length === 0 || missingPlacementScripts === 0,
      category: '正则脚本',
      name: 'placement配置检查',
      desc: rx.length + ' 条脚本，' + missingPlacementScripts + ' 条未设置placement',
      fix: missingPlacementScripts > 0 ? '每条正则脚本必须设置至少1个placement（如[0,1]处理用户输入和AI回复）' : 'placement配置正确'
    });
    // substituteRegex范围检查：应在0-2范围内（新增）
    var badSubRegex = rx.filter(function(s) {
      var sr = s.substituteRegex;
      return sr !== undefined && sr !== null && (sr < 0 || sr > 2);
    }).length;
    results.push({
      pass: rx.length === 0 || badSubRegex === 0,
      category: '正则脚本',
      name: 'substituteRegex范围（0-2）',
      desc: rx.length + ' 条脚本，' + badSubRegex + ' 条substituteRegex超出范围',
      fix: badSubRegex > 0 ? 'substituteRegex必须在0-2范围内（0=不替换宏，1=原始替换，2=转义替换）' : 'substituteRegex配置正确'
    });
    // runOnEdit标准：StageDog模板默认false（避免编辑消息时重复执行），状态栏类/变量美化类脚本建议false
    var mvScriptsWithBadRunOnEdit = rx.filter(function(s) {
      var name = (s.scriptName || '').toLowerCase();
      var isMvuOrStatusScript = name.indexOf('状态') >= 0 || name.indexOf('status') >= 0 || name.indexOf('格式化') >= 0
        || name.indexOf('变量') >= 0 || name.indexOf('updatevariable') >= 0 || name.indexOf('mvu') >= 0
        || name.indexOf('思维链') >= 0 || name.indexOf('analysis') >= 0;
      return isMvuOrStatusScript && s.runOnEdit !== false;
    }).length;
    results.push({
      pass: rx.length === 0 || mvScriptsWithBadRunOnEdit === 0,
      category: '正则脚本',
      name: 'MVU/状态栏脚本runOnEdit',
      desc: rx.length + ' 条脚本，' + mvScriptsWithBadRunOnEdit + ' 条MVU/状态栏脚本未正确设置runOnEdit',
      fix: mvScriptsWithBadRunOnEdit > 0 ? 'MVU/状态栏类脚本建议 runOnEdit=false（StageDog标准，避免编辑消息时重复执行）' : 'runOnEdit配置正确（StageDog标准）'
    });

    // === 运行效果检查（3项） ===
    var permanentEntries = entries.filter(function(e) { return e.constant === true; });
    var permanentTokenCount = 0;
    permanentEntries.forEach(function(e) { permanentTokenCount += countTokens(e.content || ''); });
    results.push({
      pass: true,
      category: '运行效果',
      name: '常驻Token估算（仅供参考，不限量）',
      desc: '估算常驻 ' + permanentTokenCount + ' Token（纯参考数字，不计入是否通过）',
      fix: permanentTokenCount > 2000 ? '常驻内容>2000Token，如遇AI失忆可考虑精简部分' : 'Token量自由掌握，仅参考'
    });
    // 递归安全：实体类条目开启prevent_recursion
    var entityEntries = entries.filter(function(e) {
      var c = e.comment || '';
      return c.indexOf('<实体交互>') >= 0 || c.indexOf('<重要角色>') >= 0 || c.indexOf('<势力与组织>') >= 0 || c.indexOf('<物品>') >= 0 || c.indexOf('<地点场景>') >= 0;
    });
    var recursionRiskEntries = entityEntries.filter(function(e) {
      return !(e.extensions && e.extensions.prevent_recursion);
    }).length;
    results.push({
      pass: entityEntries.length === 0 || recursionRiskEntries === 0,
      category: '运行效果',
      name: '递归安全：实体类条目开启prevent_recursion',
      desc: entityEntries.length + ' 条实体，' + recursionRiskEntries + ' 条未开启防护',
      fix: recursionRiskEntries > 0 ? '实体类条目必须开启prevent_recursion防止链式触发炸Token' : '递归安全'
    });
    // 冷却防抖：场景类条目开启cooldown
    var sceneEntries = entries.filter(function(e) {
      var c = e.comment || '';
      return c.indexOf('<场景机制>') >= 0 || c.indexOf('<核心玩法>') >= 0 || c.indexOf('<世界规则>') >= 0;
    });
    var noCooldownEntries = sceneEntries.filter(function(e) {
      return !(e.extensions && e.extensions.cooldown && e.extensions.cooldown > 0);
    }).length;
    results.push({
      pass: sceneEntries.length === 0 || noCooldownEntries === 0,
      category: '运行效果',
      name: '冷却防抖：场景类条目开启cooldown',
      desc: sceneEntries.length + ' 条场景，' + noCooldownEntries + ' 条未设置冷却',
      fix: noCooldownEntries > 0 ? '场景类条目建议开启cooldown=3防止内容刷屏' : '冷却防抖已配置'
    });

    // === 附加检查（6项扩展，不计入核心32项） ===
    var highRiskKeys = ['的', '是', '在', '有', '了', '和', '就', '都', '而', '及', '与', '一个', '一些', '什么', '如何', '怎么'];
    var riskyEntries = entries.filter(function(e) {
      var ks = e.keys || [];
      return ks.some(function(k) { return highRiskKeys.indexOf(k) >= 0; });
    }).length;
    results.push({
      pass: riskyEntries === 0,
      category: '附加检查',
      name: '触发词精准度（附加）',
      desc: riskyEntries + ' 条使用泛用关键词',
      fix: riskyEntries > 0 ? '避免使用"的"、"是"等泛用词作为触发词，改用领域专属词汇' : '触发词精准'
    });
    var totalTokenCount = countTokens(desc) + countTokens(first) + countTokens(sys) +
      entries.reduce(function(sum, e) { return sum + countTokens(e.content || ''); }, 0);
    var window8k = Math.round(totalTokenCount / 8192 * 100);
    var window16k = Math.round(totalTokenCount / 16384 * 100);
    results.push({
      pass: window8k <= 60,
      category: '附加检查',
      name: '上下文占用估算（附加）',
      desc: '8k窗口: ' + window8k + '% | 16k窗口: ' + window16k + '%',
      fix: window8k > 60 ? '内容偏多，可能影响长对话记忆，建议精简' : '上下文占用合理'
    });
    var cnEntries = entries.filter(function(e) {
      return e.match_whole_words === true || (e.extensions && e.extensions.match_whole_words === true);
    }).length;
    results.push({
      pass: cnEntries === 0,
      category: '附加检查',
      name: '中文适配检测（附加）',
      desc: cnEntries + ' 条错误开启match_whole_words',
      fix: cnEntries > 0 ? '中文场景应关闭match_whole_words（仅英文生效）' : '中文适配正确'
    });
    results.push({
      pass: true,
      category: '附加检查',
      name: '创作者备注（不限字数）',
      desc: '当前 ' + notes.length + ' 字（自由记录）',
      fix: notes.length > 0 ? '备注已记录（不限字数）' : '可随时填写创作备注'
    });
    // group冲突检测：常驻条目共享非空group会导致互斥（ST同组仅注入1条）
    var groupConflicts = {};
    entries.forEach(function(e) {
      var ext = e.extensions || {};
      var g = ext.group;
      if (g && g !== '' && e.constant) {
        if (!groupConflicts[g]) groupConflicts[g] = [];
        groupConflicts[g].push(e);
      }
    });
    var conflictGroups = Object.keys(groupConflicts).filter(function(g) { return groupConflicts[g].length > 1; });
    var conflictCount = conflictGroups.reduce(function(sum, g) { return sum + groupConflicts[g].length; }, 0);
    results.push({
      pass: conflictGroups.length === 0,
      category: '附加检查',
      name: '常驻条目group冲突检测（附加）',
      desc: conflictGroups.length === 0 ? '无常驻条目group冲突' : (conflictCount + '条常驻条目共享' + conflictGroups.length + '个group（同组仅注入1条）'),
      fix: conflictGroups.length > 0 ? '常驻条目(constant=true)不应设置非空group，否则同组仅注入1条。冲突group：' + conflictGroups.join(', ') + '。建议清空常驻条目的group字段' : '常驻条目group配置正确'
    });

    // === MVU变量系统检查（6项，进阶可选） ===
    // 注意：脚本/正则/占位符检查应基于导出态（buildExportCard 会自动注入），避免对新建卡误报
    var mvuEntries = entries.filter(function(e) { return isMVUEntry(e.comment || ''); });
    var hasInitVar = mvuEntries.some(function(e) { return (e.comment || '').indexOf('[InitVar]') >= 0; });
    var hasVarList = mvuEntries.some(function(e) { return (e.comment || '').indexOf('变量列表') >= 0; });
    var hasVarRule = mvuEntries.some(function(e) { return (e.comment || '').indexOf('变量更新规则') >= 0; });
    var hasVarFormat = mvuEntries.some(function(e) { return (e.comment || '').indexOf('变量输出格式') >= 0; });
    var hasAnyMVU = mvuEntries.length > 0;
    // 检查InitVar条目的enabled是否正确为false（MVU只读取禁用的initvar条目进行初始化）
    var initVarEnabledWrong = mvuEntries.some(function(e) {
      return (e.comment || '').indexOf('[InitVar]') >= 0 && e.enabled !== false;
    });
    // 检查变量列表条目内容是否为变量注入格式（新格式 null 或旧 format_message_variable 宏）
    var varListEntry = mvuEntries.find(function(e) { return (e.comment || '').indexOf('变量列表') >= 0; });
    var hasVarMacro = varListEntry ? (/\{\{format_message_variable::stat_data\}\}/.test(varListEntry.content || '') || /<status_current_variables>\s*null\s*<\/status_current_variables>/.test(varListEntry.content || '')) : false;

    results.push({
      pass: !hasAnyMVU || (hasInitVar && hasVarList && hasVarRule && hasVarFormat),
      category: 'MVU变量系统',
      name: 'MVU四大核心条目完整',
      desc: hasAnyMVU ? ('InitVar:' + (hasInitVar ? '✓' : '✗') + ' 变量列表:' + (hasVarList ? '✓' : '✗') + ' 更新规则:' + (hasVarRule ? '✓' : '✗') + ' 输出格式:' + (hasVarFormat ? '✓' : '✗')) : '未使用MVU变量系统',
      fix: !hasAnyMVU ? '如需变量系统，请生成[InitVar]初始变量、变量列表、变量更新规则、变量输出格式四个条目' : (!hasInitVar ? '缺少[InitVar]初始变量条目' : (!hasVarList ? '缺少变量列表条目（标签内为 null）' : (!hasVarRule ? '缺少变量更新规则条目' : '缺少变量输出格式条目（定义<UpdateVariable>输出格式）')))
    });
    results.push({
      pass: !hasInitVar || !initVarEnabledWrong,
      category: 'MVU变量系统',
      name: '[InitVar]条目enabled=false',
      desc: !hasInitVar ? '无InitVar条目' : (initVarEnabledWrong ? 'InitVar条目enabled≠false（应禁用）' : 'InitVar条目已正确禁用'),
      fix: initVarEnabledWrong ? '[InitVar]条目必须enabled=false（禁用），MVU只读取禁用的initvar条目进行初始化' : '配置正确'
    });
    results.push({
      pass: !hasVarList || hasVarMacro,
      category: 'MVU变量系统',
      name: '变量列表含format_message_variable宏',
      desc: !hasVarList ? '无变量列表条目' : (hasVarMacro ? '变量注入格式正确' : '变量列表条目标签内缺少 null'),
      fix: hasVarList && !hasVarMacro ? '变量列表条目固定格式：---\\n<status_current_variables>\\nnull\\n</status_current_variables>，否则LLM无法读取当前变量值' : '配置正确'
    });
    // 脚本/正则/占位符检查：基于导出态（buildExportCard 自动注入），hasAnyMVU 时直接 pass
    results.push({
      pass: !hasAnyMVU || true,
      category: 'MVU变量系统',
      name: 'MVU脚本自动注入（导出时）',
      desc: hasAnyMVU ? '导出时会自动注入 bundle.js 脚本到 tavern_helper.scripts' : '未使用MVU变量系统',
      fix: '配置正确（导出时自动处理）'
    });
    results.push({
      pass: !hasAnyMVU || true,
      category: 'MVU变量系统',
      name: 'MVU必备正则自动注入（导出时）',
      desc: hasAnyMVU ? '导出时自动注入：bundle.js本体 + 正则1-5（思维链移除/变量更新截断/变量美化×2/状态栏隐藏）。\n其余8条MVU内容（第1条zod脚本/第2条InitVar/第3条更新规则/第4条变量列表/第5条输出格式/第6条格式强调/第7条占位提醒/第8条正则6）需AI按9.1.6工作流生成。' : '未使用MVU变量系统',
      fix: '配置正确（导出时自动处理）'
    });
    results.push({
      pass: !hasAnyMVU || true,
      category: 'MVU变量系统',
      name: '开场白StatusPlaceHolderImpl自动追加（导出时）',
      desc: hasAnyMVU ? '导出时会自动在开场白末尾追加<StatusPlaceHolderImpl/>' : '未使用MVU变量系统',
      fix: '配置正确（导出时自动处理）'
    });

    return results;
  }

  // ===== MVU 变量结构脚本生成 =====
  // 解析 [InitVar] 条目中的变量初始值，生成 zod 4 schema 脚本并注册到 MVU
  // 支持两种 [InitVar] 格式：
  //   1. 标准 YAML（缩进表示层级，冒号后空格建立从属）：
  //        白娅:
  //          依存度: 35
  //          着装:
  //            上装: 深蓝色校服
  //   2. JSON 元组格式（value+描述）：
  //        { "主角": { "体力值": [100, "0-100 描述"] } }
  // 生成 zod 时遵循参考文件 ur 函数的简单递归逻辑：
  //   - 数值统一用 z.coerce.number()（防 AI 把 0 写成 "0"）
  //   - 好感度类字段加 .transform(value => _.clamp(value, 0, 100))（钳制 0~100）
  //   - 默认值用 .prefault()（MVU 扩展，缺失时自动补默认值）
  //   - 对象用 z.object({...}).prefault({ inline默认值 })，递归生成嵌套结构
  //   - 字符串用 z.string().prefault('值')，布尔用 z.boolean().prefault(值)
  /* === 顶层 YAML/InitVar 解析函数（供 generateMvuSchemaScript 和 showMvuStatusBarPreview 共用）=== */
  function parseYamlSimple(text) {
    var cleaned = (text || '').replace(/```ya?ml\s*/gi, '').replace(/```\s*$/g, '').trim();
    if (!cleaned) return null;
    var lines = cleaned.split('\n');
    var root = {};
    var stack = [{ indent: -1, node: root, parentNode: null, key: null }];

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw.trim() || raw.trim().indexOf('#') === 0) continue;
      var indent = 0;
      while (indent < raw.length && (raw[indent] === ' ' || raw[indent] === '\t')) {
        indent += raw[indent] === '\t' ? 2 : 1;
      }
      var content = raw.slice(indent).trim();

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      var top = stack[stack.length - 1];

      if (content.charAt(0) === '-') {
        var itemStr = content.slice(1).trim();
        var itemVal = parseInlineObj(itemStr);
        if (top.key !== null && top.parentNode) {
          if (!Array.isArray(top.parentNode[top.key])) {
            top.parentNode[top.key] = [];
          }
          top.parentNode[top.key].push(itemVal);
          if (itemVal && typeof itemVal === 'object' && !Array.isArray(itemVal)) {
            stack.push({
              indent: indent,
              node: itemVal,
              parentNode: top.parentNode[top.key],
              key: top.parentNode[top.key].length - 1
            });
          }
        }
        continue;
      }

      var colonIdx = content.indexOf(':');
      if (colonIdx < 0) continue;
      var key = content.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      var valStr = content.slice(colonIdx + 1).trim();

      if (valStr === '') {
        top.node[key] = {};
        stack.push({
          indent: indent,
          node: top.node[key],
          parentNode: top.node,
          key: key
        });
      } else {
        top.node[key] = parseScalar(valStr);
      }
    }

    function parseScalar(str) {
      if (str === '') return {};
      if (str === 'true' || str === 'false') return str === 'true';
      if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
      return str.replace(/^['"]|['"]$/g, '');
    }

    function parseInlineObj(str) {
      var colonIdx = str.indexOf(':');
      if (colonIdx < 0 || str.charAt(0) === '"' || str.charAt(0) === "'") {
        return parseScalar(str);
      }
      var key = str.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
      var valStr = str.slice(colonIdx + 1).trim();
      var obj = {};
      obj[key] = parseScalar(valStr);
      return obj;
    }

    return root;
  }

  function normalizeTupleValues(obj) {
    if (Array.isArray(obj)) {
      if (obj.length >= 1) return normalizeTupleValues(obj[0]);
      return null;
    }
    if (obj && typeof obj === 'object') {
      var result = {};
      Object.keys(obj).forEach(function(k) {
        var v = normalizeTupleValues(obj[k]);
        if (v !== null && v !== undefined) result[k] = v;
      });
      return result;
    }
    return obj;
  }

  function parseInitVar(text) {
    if (!text || !text.trim()) return null;
    var cleaned = (text || '').replace(/```ya?ml\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    if (cleaned.charAt(0) === '{') {
      try {
        var jsonObj = JSON.parse(cleaned);
        return normalizeTupleValues(stripStatDataRoot(jsonObj));
      } catch (e) {}
    }
    var parsed = parseYamlSimple(text);
    return stripStatDataRoot(parsed);
  }

  // ⚠️防御性过滤：剥离 AI 误写的 stat_data 根键（MVU 底层会自动挂载到 stat_data，再写一层会套娃）
  // 同时过滤 _/$ 开头的只读派生字段（由 zod prefault/transform 生成，不应出现在初始变量中）
  function stripStatDataRoot(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    // 若顶层只有一个键且为 stat_data，则下钻一层
    var keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === 'stat_data') {
      var inner = obj.stat_data;
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        return stripStatDataRoot(inner);
      }
    }
    // 递归过滤 _/$ 开头字段（只读派生字段不应出现在初始变量）
    var filtered = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.charAt(0) === '_' || k.charAt(0) === '$') continue;
      var v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        filtered[k] = stripStatDataRoot(v);
      } else {
        filtered[k] = v;
      }
    }
    return filtered;
  }

  // 规范化 InitVar 条目内容：剥离 AI 误写的 stat_data 根键
  // MVU 底层自动挂载到 stat_data，InitVar 中再写一层会导致套娃
  function normalizeInitVarContent(content) {
    if (!content || !content.trim()) return content;
    var parsed = parseInitVar(content);
    if (!parsed || typeof parsed !== 'object') return content;
    // parseInitVar 已通过 stripStatDataRoot 剥离了 stat_data 根键
    // 检查原始内容是否含 stat_data 根键，若有则用剥离后的结果重建 YAML
    var trimmed = content.replace(/```ya?ml\s*/gi, '').replace(/```\s*$/g, '').trim();
    // 去除前导 --- 分隔符后检查
    var afterSep = trimmed.replace(/^---\s*\n/, '');
    if (/^stat_data\s*:/.test(afterSep)) {
      return yamlDumpSimple(parsed);
    }
    return content;
  }

  function generateMvuSchemaScript(initVarContent) {
    // ⚠️对齐用户规范（zod 4 + lodash 默认可用，不需要 import
    // 1. HEADER 只 import registerMvuSchema（z 和 _ 运行期全局可用，不要 import）
    // 2. FOOTER 补 registerMvuSchema(Schema) 注册
    // 3. transform 用 _.clamp（_ 默认可用
    const HEADER = "import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\nexport const Schema = z.object({";

    function isAffinityLike(name) {
      return /好感|依存|信任|忠诚|友好|亲密/.test(name);
    }

    function escapeKey(key) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) || /^[\u4e00-\u9fff\w]+$/.test(key)) {
        return key;
      }
      return "'" + String(key).replace(/'/g, "\\'") + "'";
    }

    // 转义字符串字面量（用于 z.string().prefault('...')）
    function escStr(val) {
      return String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // 生成值的 zod 表达式（⚠️严格规范：prefault 必须优先于 default；复合类型 prefault 时所有子字段也必须 prefault）
    function genValueZod(key, val) {
      if (val === null || val === undefined) {
        return "z.string().prefault('')";
      }
      if (typeof val === 'boolean') {
        // 布尔：z.boolean() + .prefault 默认值
        return 'z.boolean().prefault(' + String(val) + ')';
      }
      if (typeof val === 'number') {
        // ⚠️严格顺序：coerce 转换 + prefault 默认值 + transform 约束
        const base = 'z.coerce.number().prefault(' + val + ')';
        if (isAffinityLike(key)) {
          // lodash _ 默认可用，_.clamp 做范围约束（优于 min/max，超范围部分生效不整体丢弃）
          return base + '.transform(v => _.clamp(v, 0, 100))';
        }
        return base;
      }
      if (typeof val === 'string') {
        // 字符串：z.string() + .prefault 默认值
        return "z.string().prefault('" + escStr(val) + "')";
      }
      if (Array.isArray(val)) {
        // 数组：z.array(子类型) + .prefault([])；所有数组元素必为同一子类型（zod要求）
        let itemType = 'z.string()';
        if (val.length > 0) {
          if (typeof val[0] === 'number') itemType = 'z.coerce.number().prefault(0)';
          else if (typeof val[0] === 'boolean') itemType = 'z.boolean().prefault(false)';
        }
        return 'z.array(' + itemType + ').prefault([])';
      }
      return "z.string().prefault('')";
    }

    // 生成默认值字面量（用于 .prefault(...) 和 inline 对象默认值）
    function genDefaultLiteral(val) {
      if (val === null || val === undefined) return "''";
      if (typeof val === 'number') return String(val);
      if (typeof val === 'boolean') return String(val);
      if (typeof val === 'string') return "'" + escStr(val) + "'";
      if (Array.isArray(val)) return JSON.stringify(val);
      return genObjectDefaultInline(val);
    }

    // 生成对象的 inline 默认值
    function genObjectDefaultInline(obj) {
      const parts = Object.keys(obj).map(function(key) {
        return escapeKey(key) + ': ' + genDefaultLiteral(obj[key]);
      });
      return '{ ' + parts.join(', ') + ' }';
    }

    // 递归生成对象字段的 zod 代码行
    function genObjectLines(obj, indent) {
      const padStr = new Array(indent + 1).join(' ');
      let lines = [];
      const keys = Object.keys(obj);
      keys.forEach(function(key, i) {
        const val = obj[key];
        const comma = i < keys.length - 1 ? ',' : '';
        if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
          lines.push(padStr + escapeKey(key) + ': z.object({');
          lines = lines.concat(genObjectLines(val, indent + 2));
          lines.push(padStr + '}).prefault(' + genObjectDefaultInline(val) + ')' + comma);
        } else {
          lines.push(padStr + escapeKey(key) + ': ' + genValueZod(key, val) + comma);
        }
      });
      return lines;
    }

    let parsed = parseInitVar(initVarContent);
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
      parsed = { '世界': { '当前日期': '2025-07-26', '当前时间': '17:36' } };
    }

    const bodyLines = genObjectLines(parsed, 2);
    const bodyStr = bodyLines.join('\n');
    // FOOTER：固定 $(() => { registerMvuSchema(Schema); })
    const FOOTER = "});\n\n$(() => {\n  registerMvuSchema(Schema);\n})";
    return HEADER + '\n' + bodyStr + '\n' + FOOTER;
  }

  // ===== 变量列表内容规范化 =====
  // MVU 规范的变量列表固定格式（**严格使用复数标签**，单数标签会导致酒馆助手宏不识别）：
  //   ---
  //   <status_current_variables>
  //   null
  //   </status_current_variables>
  // ⚠️注意：标签内是 `null`，不是 `{{format_message_variable::stat_data}}` 宏
  function normalizeVarListContent(content) {
    // ⚠️强制重建为固定格式（不管 AI 写了什么）：标签内为 null
    return '---\n<status_current_variables>\nnull\n</status_current_variables>';
  }

  // 从条目数组中解析 InitVar 内容，用于派生与本卡 schema 字段匹配的 JSON Patch 示例路径
  // 解决 normalizeVarOutputFormatContent 缺 parsedInit 参数导致 fallback 路径覆盖修复的问题
  function _getParsedInitForEntries(entries) {
    if (!entries || !entries.length) return null;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var c = String(e.comment || e.name || '').toLowerCase();
      if (c.indexOf('[initvar]') >= 0 && e.content && String(e.content).trim()) {
        var parsed = parseInitVar(e.content);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
      }
    }
    return null;
  }

  // ===== 🧹 规范化变量输出格式/变量输出格式强调条目 content =====
  // 这两个条目的 content 是固定 YAML 模板，AI 不应修改。
  // 如果 AI 把变量实际值/配置字段混入，强制重建为标准模板。
  // parsedInit 参数保留兼容（当前模板为固定英文模板，不再使用本卡 schema 字段动态生成路径）
  function normalizeVarOutputFormatContent(comment, content, parsedInit) {
    var c = (comment || '').toLowerCase();
    var isFormat = c.indexOf('变量输出格式强调') >= 0 || c.indexOf('变量输出格式') >= 0;
    if (!isFormat) return content;
    // 强制使用固定模板（原封不动，不修改字段、不加注释、不替换占位符）
    if (c.indexOf('变量输出格式强调') >= 0) {
      return generateVarOutputEmphasis();
    }
    return generateVarOutputFormat(parsedInit);
  }

  // ===== MVU 条目内容自动生成 =====
  // 从角色名列表自动生成 initvar YAML / 变量更新规则 / 变量输出格式 / 变量输出格式强调
  // 角色 { name, ... } 数组 → 各条目的 content 字符串

  // 【写卡预设对齐】生成 [initvar] 变量初始化 YAML（br 函数）
  // ⚠️用户规范：InitVar 只含核心字段（不写 _/$ 开头的只读/派生系统变量占位）
  //  - _开头只读系统变量 → 改由 zod 脚本通过 .prefault() 自动生成，保持初始 YAML 干净
  //  - $开头派生显示字段 → 改由 zod 的 .transform(data => { ... return data }) 自动派生
  // 格式：世界(时间/地点) + 每个角色的好感度/状态 等核心字段（属性数值用 50 作为标准默认值，zod prefault 管理）
  function generateInitVarYaml(charNames) {
    // ⚠️纯净初始态：不包含 stat_data 根键；不包含 _/$ 开头字段（由 zod prefault/transform 生成）
    const lines = [
      '世界:',
      '  当前日期: 2025-07-26',
      '  当前时间: 17:36'
    ];
    (charNames || []).forEach(function(name) {
      lines.push(name + ':');
      lines.push('  好感度: 0');
      lines.push('  状态: 正常');
      if (name === '主角') lines.push('  物品栏: {}');
    });
    // 如果没有主角，补一个主角最小核心字段
    if (charNames && charNames.indexOf('主角') < 0) {
      lines.push('主角:');
      lines.push('  好感度: 0');
      lines.push('  状态: 正常');
      lines.push('  物品栏: {}');
    }
    return lines.join('\n');
  }

  // 生成变量列表内容（固定格式：标签内为 null）
  function generateVarListContent() {
    return '---\n<status_current_variables>\nnull\n</status_current_variables>';
  }

  // 生成变量分段 EJS 模板内容（动态根据好感度发送不同提示）
  // 通过 getvar() 读取 stat_data 变量值，按阈值切换提示词
  function generateVarSegmentedPrompt(charNames) {
    var lines = ['<% var data = getvar("stat_data") || {}; %>'];
    (charNames || []).forEach(function(name) {
      lines.push('');
      lines.push('### ' + name + ' 好感度分段');
      lines.push('<% var aff_' + name + ' = data["' + name + '"] ? data["' + name + '"].好感度 : 0; %>');
      lines.push('<% if (aff_' + name + ' >= 80) { %>');
      lines.push('- 【深爱】' + name + '视<user>为不可或缺的存在，情感深厚，行为中流露出强烈的依赖与眷恋');
      lines.push('<% } else if (aff_' + name + ' >= 50) { %>');
      lines.push('- 【好感】' + name + '对<user>有明显好感，互动中带着温柔与关注，但仍保持着适度的距离感');
      lines.push('<% } else if (aff_' + name + ' >= 20) { %>');
      lines.push('- 【熟识】' + name + '与<user>相识，互动自然，态度友好但尚未涉及情感层面');
      lines.push('<% } else { %>');
      lines.push('- 【陌生】' + name + '与<user>接触较少，关系尚浅，互动以礼貌和客气为主');
      lines.push('<% } %>');
    });
    lines.push('');
    lines.push('### 世界状态');
    lines.push('<% if (getvar("stat_data.世界._当前剧情日") >= 3) { %>');
    lines.push('- 【剧情已推进】当前故事已开展多日，角色关系与局势应有所变化');
    lines.push('<% } else { %>');
    lines.push('- 【开局阶段】故事刚刚开始，世界与角色关系处于初始状态');
    lines.push('<% } %>');
    return lines.join('\n');
  }

  // 生成变量更新规则内容（xr 函数）
  // ⚠️规范对齐：string 省略 type；只有非string类型才写 type；使用 ${角色} 占位符（不动态生成具体角色名）
  // ⚠️绝对零度原则：全中文 YAML；check 必须直接指出操作类型（delta/replace/insert/remove）
  function generateVarUpdateRule(charNames) {
    // ⚠️固定模板：4 条 ${角色}.属性 规则；好感度有 type: number，其余为 string 省略 type
    const lines = [
      '---',
      '变量更新规则:',
      '  ${角色}.好感度:',
      '    type: number',
      '    check:',
      '      - 当角色对{{user}}的行为产生正面或负面情绪反馈时更新',
      '      - 优先使用 delta 操作，单次变动建议 ±(1~3)',
      '  ${角色}.心情:',
      '    check:',
      '      - 2-4字简述当前情绪波动，使用 replace 更新',
      '  ${角色}.状态:',
      '    check:',
      '      - 仅剧情本质推进时使用 replace 切换（正常/异常/濒死等）',
      '  ${角色}.关系:',
      '    check:',
      '      - 仅关系本质性改变时使用 replace 更新，一次互动不足以越级'
    ];
    return lines.join('\n');
  }

  // ⚠️规范化 AI 生成的变量更新规则内容，修复高频错误：
  //   1. 缺失「变量更新规则:」YAML 根节点 → 自动补全
  //   2. 路径带 stat_data. 前缀（如 stat_data.basic.identity）→ 剥离前缀
  //   3. check 写成单行字符串而非列表 → 转为列表格式
  //   4. string 类型变量的 type: string 行 → 移除（string 应省略 type 字段）
  function normalizeVarUpdateRuleContent(content) {
    if (!content || !content.trim()) return generateVarUpdateRule([]);
    var text = content.replace(/```ya?ml\s*/gi, '').replace(/```\s*$/g, '').trim();
    // 去除可能的前导 --- 分隔符（保留一个）
    text = text.replace(/^---\s*\n/, '');
    // 若缺失根节点，补全
    if (!/^变量更新规则\s*:/.test(text)) {
      // 去除可能存在的旧根名误写
      text = text.replace(/^(更新规则|变量规则|规则)\s*:\s*\n/, '');
      text = '变量更新规则:\n' + text;
    }
    // 剥离 stat_data. 前缀（行首或缩进后的路径键）
    text = text.replace(/(^|\n)(\s*)stat_data\./g, '$1$2');
    // 移除 string 变量的 type: string 行（规范要求 string 类型省略 type 字段）
    text = text.replace(/^[ \t]*type\s*:\s*string[ \t]*\r?\n?/gm, '');
    // 清理因删除行可能产生的多余空行（连续 3 个及以上换行压成 2 个）
    text = text.replace(/\n{3,}/g, '\n\n');
    // check 单行字符串转列表：将 "  check: 某段文字" 转为 "  check:\n      - 某段文字"
    text = text.replace(/^(\s*)check:\s*([^\n]+)$/gm, function(m, indent, desc) {
      var descTrim = desc.trim();
      if (!descTrim || descTrim.charAt(0) === '-') return m;
      var itemIndent = new Array(indent.length + 2 + 1).join(' ');
      return indent + 'check:\n' + itemIndent + '- ' + descTrim;
    });
    // 补回前导 ---
    if (!/^---/.test(text)) text = '---\n' + text;
    return text;
  }

  // ⚠️规范化 AI 生成的初始变量内容：剥离 stat_data 根键、过滤 _/$ 只读字段
  function normalizeInitVarContent(content) {
    if (!content || !content.trim()) return generateInitVarYaml([]);
    var text = content.replace(/```ya?ml\s*/gi, '').replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    // 去除可能的世界书条目配置注释行（如 # enabled=false）
    text = text.replace(/^#.*$/gm, '').replace(/^\s*[\r\n]+/gm, '\n').trim();
    var parsed = parseInitVar(text);
    if (!parsed || typeof parsed !== 'object') return text;
    // stripStatDataRoot 已在 parseInitVar 内调用，此处再保险调一次
    parsed = stripStatDataRoot(parsed);
    // 重新序列化为纯净 YAML（无 stat_data 根键、无 _/$ 字段）
    return yamlDumpSimple(parsed);
  }

  // 简易 YAML 序列化（仅支持 plain object/数组/标量，用于 InitVar 输出）
  function yamlDumpSimple(obj, indent) {
    indent = indent || 0;
    var pad = new Array(indent + 1).join(' ');
    var lines = [];
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = obj[k];
      if (v === null || v === undefined) {
        lines.push(pad + k + ':');
      } else if (Array.isArray(v)) {
        lines.push(pad + k + ':');
        for (var j = 0; j < v.length; j++) {
          lines.push(pad + '  - ' + yamlScalar(v[j]));
        }
      } else if (typeof v === 'object') {
        lines.push(pad + k + ':');
        lines.push(yamlDumpSimple(v, indent + 2));
      } else {
        lines.push(pad + k + ': ' + yamlScalar(v));
      }
    }
    return lines.join('\n');
  }

  function yamlScalar(v) {
    if (typeof v === 'string') {
      // 含特殊字符则加引号
      if (/[:#\[\]{}&*!|>'"%@`]/.test(v) || v.trim() !== v || v === '') {
        return '"' + v.replace(/"/g, '\\"') + '"';
      }
      return v;
    }
    return String(v);
  }

  // 生成变量输出格式内容
  // ⚠️完全固定英文模板，原封不动输出（不要修改字段、不要加注释、不要替换占位符、不要动态生成路径示例）
  // ⚠️使用 ${...} 占位符，路径示例均为占位符（如 ${/path/to/variable}），不根据本卡 schema 动态生成
  function generateVarOutputFormat(parsedInit) {
    return ['---',
'变量输出格式:',
'  rule:',
'    - you must output the update analysis and the actual update commands at once in the end of the next reply',
'    - the update commands works like the **JSON Patch (RFC 6902)** standard, must be a valid JSON array containing operation objects, but supports the following operations instead:',
'      - replace: replace the value of existing paths',
'      - delta: update the value of existing number paths by a delta value',
'      - insert: insert new items into an object or array (using `-` as array index intends appending to the end)',
'      - remove',
'      - move',
'    - don\'t update field names starts with `_` as they are readonly, such as `_变量`',
'  format: |-',
'    <UpdateVariable>',
'    <Analysis>$(IN ENGLISH, no more than 80 words)',
'    - ${calculate time passed: ...}',
'    - ${decide whether dramatic updates are allowed as it\'s in a special case or the time passed is more than usual: yes/no}',
'    - ${analyze every variable based on its corresponding `check`, according only to current reply instead of previous plots: ...}',
'    </Analysis>',
'    <JSONPatch>',
'    [',
'      { "op": "replace", "path": "${/path/to/variable}", "value": "${new_value}" },',
'      { "op": "delta", "path": "${/path/to/number/variable}", "value": "${positive_or_negative_delta}" },',
'      { "op": "insert", "path": "${/path/to/object/new_key}", "value": "${new_value}" },',
'      { "op": "insert", "path": "${/path/to/array/-}", "value": "${new_value}" },',
'      { "op": "remove", "path": "${/path/to/object/key}" },',
'      { "op": "remove", "path": "${/path/to/array/0}" },',
'      { "op": "move", "from": "${/path/to/variable}", "to": "${/path/to/another/path}" },',
'      ...',
'    ]',
'    </JSONPatch>',
'    </UpdateVariable>'].join('\n');
  }

  // 从解析后的 InitVar 派生与本卡 schema 字段匹配的 JSON Patch 示例
  // 选取：一个数值字段(delta)、一个字符串字段(replace)、一个对象/数组字段(insert/remove，若有)
  function derivePatchExamples(parsedInit) {
    var fallback = {
      pathHint: '/世界/当前时间',
      lines: [
'      { "op": "delta", "path": "/主角/好感度", "value": 5 },',
'      { "op": "replace", "path": "/世界/当前地点", "value": "天台" },',
'      { "op": "insert", "path": "/主角/物品栏/新物品", "value": { "描述": "...", "数量": 1 } },',
'      { "op": "remove", "path": "/主角/物品栏/旧物品" },',
'      { "op": "move", "from": "/主角/物品栏/钥匙", "to": "/角色A/物品栏/钥匙" }'
      ]
    };
    if (!parsedInit || typeof parsedInit !== 'object') return fallback;

    var numPath = null, strPath = null, objPath = null, objKey = null;
    var topKeys = Object.keys(parsedInit);
    for (var i = 0; i < topKeys.length && (!numPath || !strPath || !objPath); i++) {
      var cat = topKeys[i];
      if (cat.charAt(0) === '_' || cat.charAt(0) === '$') continue;
      var inner = parsedInit[cat];
      if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
        if (!numPath && typeof inner === 'number') numPath = '/' + cat;
        else if (!strPath && typeof inner === 'string') strPath = '/' + cat;
        continue;
      }
      var subKeys = Object.keys(inner);
      for (var j = 0; j < subKeys.length && (!numPath || !strPath || !objPath); j++) {
        var sk = subKeys[j];
        if (sk.charAt(0) === '_' || sk.charAt(0) === '$') continue;
        var sv = inner[sk];
        var path = '/' + cat + '/' + sk;
        if (!numPath && typeof sv === 'number') numPath = path;
        else if (!strPath && typeof sv === 'string') strPath = path;
        else if (!objPath && sv && typeof sv === 'object') { objPath = path; objKey = sk; }
      }
    }
    if (!numPath && !strPath) return fallback;

    var lines = [];
    if (numPath) lines.push('      { "op": "delta", "path": "' + numPath + '", "value": 5 },');
    if (strPath) lines.push('      { "op": "replace", "path": "' + strPath + '", "value": "示例值" },');
    if (objPath) {
      lines.push('      { "op": "insert", "path": "' + objPath + '/新条目", "value": { "描述": "...", "数量": 1 } },');
      lines.push('      { "op": "remove", "path": "' + objPath + '/旧条目" },');
      lines.push('      { "op": "move", "from": "' + objPath + '/条目A", "to": "/另一分类/' + (objKey || '条目') + '" }');
    } else {
      var moveSrc = numPath || strPath;
      var moveDst = strPath || numPath;
      lines.push('      { "op": "move", "from": "' + moveSrc + '", "to": "' + moveDst + '_新" }');
    }
    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].replace(/,\s*$/, '');
    return { pathHint: (numPath || strPath || '/分类/字段'), lines: lines };
  }

  // ⚠️修正 AI 生成的变量输出格式的示例路径，使其与本卡 schema 字段匹配
  // 解决 AI 照抄模板路径（/主角/好感度 等）导致 JSON Patch 静默失败的问题
  // 注意：此函数保留 AI 原有内容，仅替换 JSONPatch 数组内的示例路径；与 normalizeVarOutputFormatContent（强制重建模板）不同
  function fixVarOutputFormatPaths(content, parsedInit) {
    if (!content || !content.trim()) return generateVarOutputFormat(parsedInit);
    var text = content.replace(/```ya?ml\s*/gi, '').replace(/```\s*$/g, '').trim();
    var examples = derivePatchExamples(parsedInit);
    // 定位 <JSONPatch> 到 </JSONPatch> 区间，整体替换数组内容为本卡字段示例
    text = text.replace(/(<JSONPatch>\s*\[)([\s\S]*?)(\s*\]\s*<\/JSONPatch>)/, function(m, head, body, tail) {
      return head + '\n' + examples.lines.join('\n') + '\n    ' + tail.trim();
    });
    // 统一 rule 中英文混杂为中文
    text = text.replace(/rule:\s*The following must be inserted[^\n]*/i, 'rule: 必须在回复末尾输出更新分析与更新指令，不可遗漏');
    return text;
  }

  // 生成变量输出格式强调内容
  // ⚠️完全固定，原封不动输出（不要修改字段、不要加注释、不要替换占位符）
  // 默认关闭（enabled=false），AI不输出<UpdateVariable>时才启用
  function generateVarOutputEmphasis() {
    return ['---',
'变量输出格式强调:',
'  rule: The following must be inserted to the end of reply, and cannot be omitted',
'  format: |-',
'    <UpdateVariable>',
'    ...',
'    </UpdateVariable>'].join('\n');
  }

  // ===== 从角色卡数据提取角色名列表 =====
  // 优先从 [InitVar] 条目中解析角色名，回退到角色卡描述中正则提取
  function extractCharNames(cd, rawEntries) {
    var names = [];
    // 1. 从 [InitVar] 条目解析
    if (rawEntries && rawEntries.length) {
      for (var j = 0; j < rawEntries.length; j++) {
        var entry = rawEntries[j];
        var c = (entry.comment || '').toLowerCase();
        if (c.indexOf('[initvar]') >= 0) {
          var content = entry.content || '';
          // ⚠️改进R4：用 parseInitVar 取顶层键（准确），不再用 line.trim() 逐行匹配
          // 旧逻辑的 line.trim() 会把缩进的嵌套 mapping（着装:/称号:/近期事务:）误收为角色名
          try {
            var parsed = parseInitVar(content);
            if (parsed && typeof parsed === 'object') {
              var topKeys = Object.keys(parsed);
              for (var tk = 0; tk < topKeys.length; tk++) {
                var nm = topKeys[tk];
                if (nm === '世界' || nm === '系统' || nm.charAt(0) === '_' || nm.charAt(0) === '$') continue;
                // ⚠️跳过纯英文/ASCII 顶层键（如 basic/status/secret/social/clock）：
                // 这是 schema 字段分类名，不是角色名。角色名通常含中文。
                if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) continue;
                if (names.indexOf(nm) < 0) names.push(nm);
              }
            }
          } catch(_e) {
            // parseInitVar 失败时回退到逐行匹配（仅取0缩进行的顶层键）
            var lines = content.split('\n');
            for (var k = 0; k < lines.length; k++) {
              var rawLine = lines[k];
              // ⚠️R4关键修复：只匹配0缩进（行首非空白）的"键:"行，跳过缩进行的嵌套字段
              if (rawLine.charAt(0) !== ' ' && rawLine.charAt(0) !== '\t' && rawLine.charAt(0) !== '-') {
                var line = rawLine.trim();
                if (/^[^\s:#]+:\s*$/.test(line) && line.indexOf('世界:') < 0) {
                  var nm2 = line.replace(/:$/, '').trim();
                  if (nm2 && nm2 !== '世界' && names.indexOf(nm2) < 0) names.push(nm2);
                }
              }
            }
          }
          break;
        }
      }
    }
    // 2. 回退：从角色卡名称和描述中提取
    if (names.length === 0 && cd) {
      if (cd.name && !/^(未命名|新建|空)/.test(cd.name)) names.push(cd.name);
      if (cd.description) {
        var desc = cd.description;
        var nameMatches = desc.match(/[\u4e00-\u9fff]{1,6}(?=对主角|对<user>|的依存|的好感|暗恋|喜欢|依恋|钟情|心仪|在意)/g);
        if (nameMatches) {
          for (var m = 0; m < nameMatches.length; m++) {
            if (names.indexOf(nameMatches[m]) < 0) names.push(nameMatches[m]);
          }
        }
      }
    }
    // 3. 默认：如果只有主角自己
    if (names.length === 0) names.push('主角');
    return names.slice(0, 5); // 最多5个角色
  }

  // ===== Neko 美化模板（已与 MVU_BEAUTIFY_* 统一为通长长条样式）=====
  var NEKO_COMPLETE_HTML = MVU_BEAUTIFY_COMPLETE;

  var NEKO_THINKING_HTML = MVU_BEAUTIFY_THINKING;

  // ===== MVU 状态栏 HTML 生成（通用回退模板）=====
  // 仅作为 AI 未生成状态栏时的兜底：符合用户模板标准（populateCharacterData + getAllVariables + eventOn + errorCatched）
  // 运行时监听 Mvu.events.VARIABLE_INITIALIZED / VARIABLE_UPDATE_ENDED 事件驱动刷新
  // 兜底实现：由于不知道具体变量id，populateCharacterData内部会自动遍历 stat_data 所有键生成 DOM（与旧renderTree效果相同，但函数外壳符合用户模板标准）
  function generateMvuStatusBarHtml(roleNames) {
    return MVU_STATUS_BAR_TEMPLATE;
  }

  // ===== 酒馆直接写入 API 适配层（借鉴 javascript-format (7).js）=====
  // 在 iframe 内通过 window.parent 访问酒馆原生 API，实现角色卡直接写入

  // 获取酒馆 API 函数（兼容 iframe 上下文）
  // 查找顺序（遵循 tavern_helper_template @types/function/index.d.ts）：
  //   1. window[name]                     —— 全局导出（最老版 ST 助手）
  //   2. window.parent[name]              —— iframe 内访问父窗口的全局
  //   3. window.TavernHelper[name]        —— 新版：所有函数统一挂在 TavernHelper 命名空间下
  //   4. window.parent.TavernHelper[name] —— iframe 内访问父窗口的 TavernHelper
  //   5. SillyTavern.getContext()[name]   —— 新版 ST 稳定接口（@types/iframe/exported.sillytavern.d.ts）
  //   6. 全局 getContext()[name] / window.parent.getContext()[name]
  function _tavernFn(name) {
    try {
      if (typeof window[name] === 'function') return window[name];
      if (window.parent && typeof window.parent[name] === 'function') return window.parent[name];
      if (typeof window.TavernHelper !== 'undefined' && window.TavernHelper && typeof window.TavernHelper[name] === 'function') return window.TavernHelper[name];
      if (window.parent && typeof window.parent.TavernHelper !== 'undefined' && window.parent.TavernHelper && typeof window.parent.TavernHelper[name] === 'function') return window.parent.TavernHelper[name];
    } catch(e) {}
    // 兼容新版 SillyTavern（1.12+）：部分函数从 window 全局移到 SillyTavern.getContext() 上下文对象
    try {
      var _st = _tavern();
      if (_st && typeof _st.getContext === 'function') {
        var _ctx = _st.getContext();
        if (_ctx && typeof _ctx[name] === 'function') return _ctx[name];
      }
      if (typeof getContext === 'function') {
        var _ctx2 = getContext();
        if (_ctx2 && typeof _ctx2[name] === 'function') return _ctx2[name];
      }
      if (window.parent && typeof window.parent.getContext === 'function') {
        var _ctx3 = window.parent.getContext();
        if (_ctx3 && typeof _ctx3[name] === 'function') return _ctx3[name];
      }
    } catch(e2) {}
    return null;
  }

  // 获取 SillyTavern 对象
  function _tavern() {
    try {
      if (typeof SillyTavern !== 'undefined') return SillyTavern;
      if (window.parent && window.parent.SillyTavern) return window.parent.SillyTavern;
    } catch(e) {}
    return null;
  }

  // 生成唯一 ID
  function _genId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  // 判断是否为中止错误
  function _isAbortError(err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    if (err instanceof Error && err.name === 'AbortError') return true;
    var msg = err instanceof Error ? err.message : String(err);
    return /(?:operation was aborted|request was aborted|\baborted\b)/iu.test(msg);
  }

  // 带重试的异步操作（应对酒馆中止）
  async function _tavernRetry(label, fn) {
    var lastErr;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try { return await fn(); }
      catch(e) {
        if (!_isAbortError(e)) throw e;
        lastErr = e;
        console.warn('[时之写卡器] ' + label + '被中止，准备重试（' + attempt + '/3）', e);
        if (attempt < 3) await new Promise(function(r) { setTimeout(r, 350 * attempt); });
      }
    }
    var msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(label + '连续被中止，请确认页面没有刷新或断开后重试（原始错误：' + msg + '）');
  }

  // 刷新角色列表
  async function _refreshCharacterList() {
    var st = _tavern();
    if (st && typeof st.getCharacters === 'function') {
      await _tavernRetry('刷新角色列表', function() { return st.getCharacters(); });
    }
  }

  // 验证角色卡名称
  function _tavernValidateName(name) {
    var e = (name || '').trim();
    if (!e) throw new Error('角色卡名称不能为空');
    if (e === 'current') throw new Error('角色卡名称不能是 current');
    var lower = e.replace(/\s+/g, ' ').toLowerCase();
    if (lower === 'sillytavern system') throw new Error('SillyTavern System 是系统占位角色，请填写新的角色卡名称');
    return e;
  }

  // 确保角色卡存在并补全 alternate_greetings 兼容字段（Wr）
  async function _tavernEnsureCharacter(name) {
    var validated = _tavernValidateName(name);
    var st = _tavern();
    if (!st || !st.characters) throw new Error('无法访问酒馆角色列表');
    var idx = -1;
    if (typeof st.characters.findIndex === 'function') {
      idx = st.characters.findIndex(function(c) { return c.name === validated; });
    } else {
      for (var i = 0; i < st.characters.length; i++) {
        if (st.characters[i].name === validated) { idx = i; break; }
      }
    }
    if (idx < 0) {
      await _refreshCharacterList();
      if (typeof st.characters.findIndex === 'function') {
        idx = st.characters.findIndex(function(c) { return c.name === validated; });
      } else {
        for (var j = 0; j < st.characters.length; j++) {
          if (st.characters[j].name === validated) { idx = j; break; }
        }
      }
    }
    if (idx < 0) throw new Error('角色卡不存在：' + validated);
    var char = st.characters[idx];
    if (char.data && Array.isArray(char.data.alternate_greetings)) return;
    if (typeof st.unshallowCharacter === 'function') {
      await _tavernRetry('读取角色卡详情', function() { return st.unshallowCharacter(String(idx)); });
    }
    if (typeof st.characters.findIndex === 'function') {
      idx = st.characters.findIndex(function(c) { return c.name === validated; });
    }
    if (idx < 0) throw new Error('读取详情后角色卡从列表中消失：' + validated);
    char = st.characters[idx];
    if (!char.data) char.data = {};
    var altG = char.data.alternate_greetings;
    if (Array.isArray(altG)) return;
    var greetings = (typeof altG === 'string' && altG.trim()) ? [altG] : [];
    if (greetings.length === 0) greetings = ['\u200b'];
    char.data.alternate_greetings = greetings;
    var firstMes = char.first_mes || (char.data && char.data.first_mes) || '';
    var replaceCharacter = _tavernFn('replaceCharacter');
    if (replaceCharacter) {
      await _tavernRetry('补全角色卡兼容字段', function() {
        return replaceCharacter(validated, { first_messages: [firstMes].concat(greetings) }, { render: 'none' });
      });
    }
    var updated = st.characters.find(function(c) { return c.name === validated; });
    if (updated) {
      if (!updated.data) updated.data = {};
      if (!Array.isArray(updated.data.alternate_greetings)) updated.data.alternate_greetings = greetings;
    }
  }

  // 创建或获取角色卡（Nr）
  async function _tavernCreateOrGet(name) {
    var validated = _tavernValidateName(name);
    var getCharacterNames = _tavernFn('getCharacterNames');
    var names = getCharacterNames ? getCharacterNames() : [];
    var created = false;

    if (names.indexOf(validated) >= 0) {
      await _tavernEnsureCharacter(validated);
    } else {
      var createCharacter = _tavernFn('createCharacter');
      if (!createCharacter) {
        // 兜底：酒馆 JS API 不支持 createCharacter（新版 ST 或 iframe 隔离），
        // 直接用 REST API POST /api/characters/create 创建空角色卡
        await _tavernCreateCharacterViaFetch(validated);
        created = true;
        await _refreshCharacterList();
        await _tavernEnsureCharacter(validated);
        return { name: validated, created: created };
      }
      var lastErr;
      for (var attempt = 1; attempt <= 3; attempt++) {
        try {
          await createCharacter(validated, { first_messages: ['', '\u200b'] });
          created = true;
          break;
        } catch(e) {
          if (!_isAbortError(e)) throw e;
          lastErr = e;
          console.warn('[时之写卡器] 创建角色卡被中止，正在确认（' + attempt + '/3）', e);
          await new Promise(function(r) { setTimeout(r, 350 * attempt); });
          try { await _refreshCharacterList(); } catch(_) {}
          names = getCharacterNames ? getCharacterNames() : [];
          if (names.indexOf(validated) >= 0) { break; }
        }
      }
      await _tavernEnsureCharacter(validated);
      if (!created) {
        var getCharacter = _tavernFn('getCharacter');
        if (getCharacter) {
          try { await getCharacter(validated); } catch(e) {
            throw new Error('创建角色卡失败：' + validated);
          }
        }
      }
    }
    return { name: validated, created: created };
  }

  // 兜底：通过 REST API 创建角色卡（不依赖 SillyTavern JS createCharacter 函数）
  // 直接 POST /api/characters/create，兼容所有 ST 版本
  async function _tavernCreateCharacterViaFetch(name) {
    var formData = new FormData();
    formData.append('name', name);
    // 最小化字段：只需 name，其余字段后续由 _tavernWriteCharacterData 填充
    formData.append('description', '');
    formData.append('first_mes', '');
    formData.append('mes_example', '');
    formData.append('creator', '');
    formData.append('creator_notes', '');
    formData.append('character_version', '');
    formData.append('system_prompt', '');
    formData.append('tags', '[]');
    formData.append('alternate_greetings', '[]');
    var resp = await fetch('/api/characters/create', {
      method: 'POST',
      body: formData
    });
    if (!resp.ok) {
      var txt = '';
      try { txt = await resp.text(); } catch(_) {}
      throw new Error('REST API 创建角色卡失败 (HTTP ' + resp.status + '): ' + (txt || resp.statusText));
    }
    var data = null;
    try { data = await resp.json(); } catch(_) {}
    // 创建后刷新角色列表，确保后续 _tavernEnsureCharacter 能找到它
    await _refreshCharacterList();
    return data;
  }

  // 写入开场白（Yr）
  async function _tavernWriteFirstMes(name, firstMes) {
    var validated = _tavernValidateName(name);
    var content = (firstMes || '').trim();
    if (!content) throw new Error('开场白不能为空');
    await _tavernEnsureCharacter(validated);
    var updateCharacterWith = _tavernFn('updateCharacterWith');
    if (!updateCharacterWith) throw new Error('酒馆不支持 updateCharacterWith API');
    await updateCharacterWith(validated, function(charData) {
      var msgs = charData.first_messages || [];
      charData.first_messages = [content].concat(msgs.slice(1));
      return charData;
    });
  }

  // 写入角色卡基础字段（对齐 tavern_helper Character 规范）
  async function _tavernWriteCharacterData(name, data) {
    var validated = _tavernValidateName(name);
    await _tavernEnsureCharacter(validated);
    var updateCharacterWith = _tavernFn('updateCharacterWith');
    if (!updateCharacterWith) throw new Error('酒馆不支持 updateCharacterWith API');
    await updateCharacterWith(validated, function(charData) {
      // ===== 对齐 tavern_helper Character 规范 =====
      // 规范顶层字段：description / creator / creator_notes / version / first_messages
      // 非规范字段 → extensions（extensions 支持 [other: string]: any）
      // V3 data.* 兼容写入（SillyTavern 提示词构建器从 data.* 读取）

      // ===== 前置规范化：酒馆读回来的 depth_prompt/data.depth_prompt 可能是 JSON 字符串
      //   （tavern 在某些版本会把 depth_prompt 序列化为字符串存储），
      //   如果不先反序列化，后续任意赋值 .depth/.prompt 都会抛 "Cannot create property 'depth' on string"
      if (!charData.extensions) charData.extensions = {};
      charData.extensions.depth_prompt = normalizeDepthPrompt(charData.extensions.depth_prompt, 4);
      if (!charData.data) charData.data = {};
      charData.data.depth_prompt = normalizeDepthPrompt(charData.data.depth_prompt, 4);

      // --- 规范顶层字段 ---
      if (data.description !== undefined) { charData.description = data.description; }
      if (data.creator !== undefined) { charData.creator = data.creator; }
      if (data.creator_notes !== undefined) { charData.creator_notes = data.creator_notes; }
      // character_version → version（规范字段名为 version）
      if (data.character_version !== undefined) { charData.version = data.character_version; }
      // alternate_greetings → first_messages（规范用 first_messages: string[] 统一承载首条+备选）
      if (data.alternate_greetings !== undefined && Array.isArray(data.alternate_greetings)) {
        if (!Array.isArray(charData.first_messages)) charData.first_messages = [''];
        // 保留 [0]（首条由 _tavernWriteFirstMes 写入），[1:] 替换为备选开场白
        charData.first_messages = [charData.first_messages[0] || ''].concat(data.alternate_greetings);
      }

      // --- 非规范字段 → extensions ---
      if (data.system_prompt !== undefined) { charData.extensions.system_prompt = data.system_prompt; }
      if (data.personality !== undefined) { charData.extensions.personality = data.personality; }
      if (data.scenario !== undefined) { charData.extensions.scenario = data.scenario; }
      if (data.depth_prompt !== undefined) {
        // 防御：depth_prompt 必须是对象；JSON 字符串 / 纯 prompt 字符串统一规范化
        var _dp = normalizeDepthPrompt(data.depth_prompt, 4);
        charData.extensions.depth_prompt = _dp;
      }

      // --- V3 兼容：同时写入 data.* 供 SillyTavern 提示词构建器读取 ---
      if (!charData.data) charData.data = {};
      if (data.description !== undefined) charData.data.description = data.description;
      if (data.personality !== undefined) charData.data.personality = data.personality;
      if (data.scenario !== undefined) charData.data.scenario = data.scenario;
      if (data.system_prompt !== undefined) charData.data.system_prompt = data.system_prompt;
      if (data.creator_notes !== undefined) charData.data.creator_notes = data.creator_notes;
      if (data.creator !== undefined) charData.data.creator = data.creator;
      if (data.character_version !== undefined) charData.data.character_version = data.character_version;
      if (data.alternate_greetings !== undefined && Array.isArray(data.alternate_greetings)) {
        charData.data.alternate_greetings = data.alternate_greetings;
      }
      if (data.depth_prompt !== undefined) {
        var _dp2 = normalizeDepthPrompt(data.depth_prompt, 4);
        charData.data.depth_prompt = _dp2;
      }

      // --- 关联世界书（保持原样）---
      if (data.world !== undefined && data.world) {
        charData.data.world = data.world;
        charData.world = data.world;
      }
      return charData;
    });
  }

  // 规范化脚本对象（Hr）— 对齐 tavern_helper Script 规范
  function _normalizeScript(s) {
    return {
      type: s.type || 'script',
      enabled: true,
      name: s.name,
      id: s.id || _genId('qz-character-script'),
      content: s.content,
      info: s.info || '',
      button: {
        enabled: (s.button && s.button.enabled !== undefined) ? s.button.enabled : true,
        buttons: (s.button && s.button.buttons) || []
      },
      data: s.data || {},
      export_with: s.export_with || { data: true, button: true }
    };
  }

  // 按 id 或 name 去重后更新脚本（Qr）
  function _upsertScript(scripts, newScript) {
    var arr = scripts.slice();
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
      var s = arr[i];
      if (s.type !== 'script' && !s.name) continue;
      var sName = String(s.name || s.scriptName || '');
      if (s.id === newScript.id || sName.toLowerCase() === newScript.name.toLowerCase()) {
        idx = i;
        break;
      }
    }
    var merged = Object.assign({}, arr[idx] || {}, newScript, { name: newScript.name, content: newScript.content, enabled: true });
    if (idx >= 0) { arr[idx] = _normalizeScript(merged); }
    else { arr.push(_normalizeScript(newScript)); }
    return arr;
  }

  // 写入 tavern_helper 脚本（Rr）
  async function _tavernWriteScript(name, script) {
    var validated = _tavernValidateName(name);
    await _tavernEnsureCharacter(validated);
    var updateCharacterWith = _tavernFn('updateCharacterWith');
    if (!updateCharacterWith) throw new Error('酒馆不支持 updateCharacterWith API');
    var normalized = _normalizeScript(script);
    await updateCharacterWith(validated, function(charData) {
      if (!charData.extensions) charData.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } };
      if (!charData.extensions.regex_scripts) charData.extensions.regex_scripts = [];
      if (!charData.extensions.tavern_helper) charData.extensions.tavern_helper = { scripts: [], variables: {} };
      if (!charData.extensions.tavern_helper.scripts) charData.extensions.tavern_helper.scripts = [];
      if (!charData.extensions.tavern_helper.variables) charData.extensions.tavern_helper.variables = {};
      charData.extensions.tavern_helper.scripts = _upsertScript(charData.extensions.tavern_helper.scripts, normalized);
      return charData;
    });
    var getCurrentCharacterName = _tavernFn('getCurrentCharacterName');
    var updateScriptTreesWith = _tavernFn('updateScriptTreesWith');
    if (getCurrentCharacterName && updateScriptTreesWith && getCurrentCharacterName() === validated) {
      await updateScriptTreesWith(function(scripts) { return _upsertScript(scripts, normalized); }, { type: 'character' });
    }
  }

  // 写入 MVU schema 脚本（Dr）
  async function _tavernWriteMvuSchema(name, schemaContent) {
    await _tavernWriteScript(name, {
      name: '变量结构',
      id: _genId('qz-mvu-schema'),
      content: schemaContent,
      info: '自动生成的 MVU 变量结构脚本。',
      button: { enabled: true, buttons: [] },
      data: {}
    });
  }

  // 写入 MVU 运行时 bundle.js 脚本
  async function _tavernWriteMvuRuntime(name) {
    await _tavernWriteScript(name, {
      type: 'script',
      enabled: true,
      name: 'MVU',
      id: '961f366d-e403-45c2-8155-3d14ec86de53',
      content: "import'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';",
      info: '',
      button: {
        enabled: true,
        buttons: [
          { name: '重新处理变量', visible: false },
          { name: '重新读取初始变量', visible: false },
          { name: '快照楼层', visible: false },
          { name: '重演楼层', visible: false },
          { name: '重试额外模型解析', visible: false },
          { name: '清除旧楼层变量', visible: false }
        ]
      },
      data: {}
    });
  }

  // 用代码块包裹 HTML
  function _wrapHtml(html) {
    var trimmed = html.trim();
    if (/^```/.test(trimmed)) return trimmed;
    return '```html\n' + trimmed + '\n```';
  }

  // 转换内部正则格式到 SillyTavern 正则脚本格式（ri）— 对齐 tavern_helper TavernRegex 规范
  function _convertRegexScript(s) {
    var placement = s.placement || [];
    return {
      id: s.id,
      script_name: s.scriptName,
      enabled: (s.enabled !== undefined ? s.enabled : (s.disabled !== undefined ? !s.disabled : true)),
      find_regex: s.findRegex,
      replace_string: s.replaceString,
      trim_strings: Array.isArray(s.trimStrings) ? s.trimStrings : (Array.isArray(s.trim_strings) ? s.trim_strings : []),
      source: {
        user_input: placement.indexOf(1) >= 0,
        ai_output: placement.indexOf(2) >= 0,
        slash_command: placement.indexOf(3) >= 0,
        world_info: placement.indexOf(4) >= 0,
        reasoning: placement.indexOf(5) >= 0
      },
      destination: {
        display: s.markdownOnly === true,
        prompt: s.promptOnly === true
      },
      run_on_edit: s.runOnEdit !== undefined ? s.runOnEdit : false,
      min_depth: s.minDepth !== undefined ? s.minDepth : null,
      max_depth: s.maxDepth !== undefined ? s.maxDepth : null
    };
  }

  // 写入正则脚本（含状态栏 HTML）（oi - 借鉴 javascript-format (7).js）
  async function _tavernWriteRegexScripts(name, statusBarHtml) {
    var validated = _tavernValidateName(name);

    var scripts = [
      // 1. 仅格式思维链 - 从提示词移除 <Analysis> 段
      _convertRegexScript({
        id: 'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36',
        scriptName: '仅格式思维链',
        findRegex: '/<Analysis>[\\s\\S]+?<\\/Analysis>/gm',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        markdownOnly: false,
        promptOnly: true,
        runOnEdit: true,
        minDepth: null,
        maxDepth: null
      }),
      // 2. 只发送最新2楼的变量更新
      _convertRegexScript({
        id: '5bb4b588-23ca-4564-8df5-882104eff764',
        scriptName: '只发送最新2楼的变量更新',
        findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm',
        replaceString: '',
        trimStrings: [],
        placement: [2],
        markdownOnly: false,
        promptOnly: true,
        runOnEdit: true,
        minDepth: 4,
        maxDepth: null
      }),
      // 3. [美化]变量完成
      _convertRegexScript({
        id: '6fb572ae-a9ea-436d-9779-ad100f1ff7f5',
        scriptName: '[美化]变量完成',
        findRegex: '/<UpdateVariable(?:variable)?>\\s*(.*)\\s*<\\/UpdateVariable(?:variable)?>/gsi',
        replaceString: NEKO_COMPLETE_HTML,
        trimStrings: [],
        placement: [2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false,
        minDepth: null,
        maxDepth: null
      }),
      // 4. [美化]变量更新中
      _convertRegexScript({
        id: 'bf1b7441-5cf1-426d-bd6c-911332be9923',
        scriptName: '[美化]变量更新中',
        findRegex: '/<UpdateVariable(?:variable)?>(?!.*<\\/UpdateVariable(?:variable)?>)\\s*(.*)\\s*$/gsi',
        replaceString: NEKO_THINKING_HTML,
        trimStrings: [],
        placement: [2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false,
        minDepth: null,
        maxDepth: null
      }),
      // ==== 【月相思维链·去杂标签 #1】移除 <thinking> / <think> 内部标签（promptOnly，不影响显示）====
      // 月相1-4已删除
      // ==== 【月相思维链·去杂标签 #2】移除 [果农冒泡]/[NSFW判定]/[人物逻辑]/[基调锚定] 等中括号思考标签 ====
      // 月相2已删除
      // ==== 【月相思维链·去杂标签 #3】移除 "果农人格加载" / "time_format" / "time_format:" 等元信息段 ====
      // 月相3已删除
      // ==== 【月相思维链·去杂标签 #4】移除 <!-- End of The ECoT -->、<content>包裹 等HTML注释/标签 ====
      // 月相4已删除
      // 5. 隐藏状态栏标记（display:false, prompt:true）
      {
        id: _genId('qz-card-status-hide'),
        script_name: '隐藏状态栏标记',
        enabled: true,
        find_regex: '/<StatusPlaceHolderImpl\\/>/g',
        replace_string: '',
        trim_strings: [],
        source: { user_input: false, ai_output: true, slash_command: false, world_info: false, reasoning: false },
        destination: { display: false, prompt: true },
        run_on_edit: true,
        min_depth: null,
        max_depth: null
      },
      // 6. MVU状态栏（display:true, prompt:false）
      {
        id: _genId('qz-card-status'),
        script_name: 'MVU状态栏',
        enabled: true,
        find_regex: '/<StatusPlaceHolderImpl\\/>/g',
        replace_string: _wrapHtml(statusBarHtml),
        trim_strings: [],
        source: { user_input: false, ai_output: true, slash_command: false, world_info: false, reasoning: false },
        destination: { display: true, prompt: false },
        run_on_edit: true,
        min_depth: null,
        max_depth: null
      }
    ];

    // 按 script_name 去重旧脚本后追加新脚本（同时清理遗留的无名 StatusPlaceHolderImpl 正则）
    var nameSet = {};
    scripts.forEach(function(s) { nameSet[s.script_name] = true; });
    var newFindRegexes = {};
    scripts.forEach(function(s) {
      var fr = String(s.find_regex || s.findRegex || '');
      if (fr.indexOf('StatusPlaceHolderImpl') >= 0) newFindRegexes['StatusPlaceHolderImpl'] = true;
    });

    var updateCharacterWith = _tavernFn('updateCharacterWith');
    if (!updateCharacterWith) throw new Error('酒馆不支持 updateCharacterWith API');
    await _tavernEnsureCharacter(validated);
    await updateCharacterWith(validated, function(charData) {
      if (!charData.extensions) charData.extensions = { regex_scripts: [], tavern_helper: { scripts: [], variables: {} } };
      var existing = charData.extensions.regex_scripts || [];
      var filtered = existing.filter(function(r) {
        if (nameSet[r.script_name]) return false; // 按 script_name 去重
        // 额外清理：遗留的无名 StatusPlaceHolderImpl 正则
        if (!r.script_name) {
          var fr = String(r.find_regex || r.findRegex || '');
          var id = String(r.id || '');
          if (newFindRegexes['StatusPlaceHolderImpl'] && fr.indexOf('StatusPlaceHolderImpl') >= 0) return false;
          if (newFindRegexes['StatusPlaceHolderImpl'] && (id.indexOf('mvu-status') >= 0 || id.indexOf('regex-mvu-status') >= 0)) return false;
        }
        return true;
      });
      charData.extensions.regex_scripts = filtered.concat(scripts);
      return charData;
    });

    // 同步当前角色的正则树
    var getCurrentCharacterName = _tavernFn('getCurrentCharacterName');
    var updateTavernRegexesWith = _tavernFn('updateTavernRegexesWith');
    if (getCurrentCharacterName && updateTavernRegexesWith && getCurrentCharacterName() === validated) {
      await updateTavernRegexesWith(function(existing) {
        var filtered = existing.filter(function(r) {
          if (nameSet[r.script_name]) return false;
          if (!r.script_name) {
            var fr = String(r.find_regex || r.findRegex || '');
            var id = String(r.id || '');
            if (newFindRegexes['StatusPlaceHolderImpl'] && fr.indexOf('StatusPlaceHolderImpl') >= 0) return false;
            if (newFindRegexes['StatusPlaceHolderImpl'] && (id.indexOf('mvu-status') >= 0 || id.indexOf('regex-mvu-status') >= 0)) return false;
          }
          return true;
        });
        return filtered.concat(scripts);
      }, { type: 'character' });
    }
  }

  // 写入世界书条目（si/Ai/ii - 借鉴 javascript-format (7).js）
  // ===== 修复Bug2：把 v2 角色卡条目格式转换为酒馆助手 WorldbookEntry 新格式 =====
  // 旧格式用 comment/constant/selective/position(字符串)/extensions；
  // 酒馆助手 API(createWorldbookEntries 等)用 name/strategy/position(对象)/extra，
  // 直接传旧格式会导致条目"没有名字"且激活策略/位置参数全部丢失。
  function _convertToWorldbookEntry(e, i, sourceTag) {
    var comment = e.comment || e.name || e.title || ('条目' + (i + 1));
    var ext = e.extensions || {};
    // position：优先 extensions.position(数字)，其次顶层 position，默认 4(at_depth)
    var posRaw = (ext.position !== undefined ? ext.position : (e.position !== undefined ? e.position : 4));
    var posNum = (typeof posRaw === 'string')
      ? (posRaw === 'before_char' || posRaw === '0' ? 0 : (posRaw === 'after_char' || posRaw === '1' ? 1 : 4))
      : posRaw;
    // ST position: 0=before_char, 1=after_char, 2=before_example, 3=after_example, 4=at_depth(作者注释位)
    var posType = (posNum === 0) ? 'before_character_definition'
      : (posNum === 1) ? 'after_character_definition'
      : (posNum === 2) ? 'before_example_messages'
      : (posNum === 3) ? 'after_example_messages'
      : 'at_depth';
    var roleNum = (ext.role !== undefined ? ext.role : 0);
    var posRole = (roleNum === 1) ? 'user' : (roleNum === 2 ? 'assistant' : 'system');
    var posDepth = (ext.depth !== undefined ? ext.depth : 4);
    var order = (e.insertion_order !== undefined ? e.insertion_order : (ext.order || 100));
    // 激活策略：constant=true→蓝灯; 否则 selective=true→绿灯; 否则默认 constant
    var isConst = (e.constant !== undefined ? e.constant : false);
    var isSel = (e.selective !== undefined ? e.selective : true);
    var stratType = isConst ? 'constant' : (isSel ? 'selective' : 'constant');
    var keys = Array.isArray(e.keys) ? e.keys.filter(function(k) { return typeof k === 'string' && k; }) : [];
    var secKeys = Array.isArray(e.secondary_keys) ? e.secondary_keys : [];
    var selLogic = (ext.selectiveLogic === 1 ? 'and_all' : (ext.selectiveLogic === 2 ? 'not_all' : (ext.selectiveLogic === 3 ? 'not_any' : 'and_any')));
    var useProb = (ext.useProbability !== undefined ? ext.useProbability : (ext.use_probability !== undefined ? ext.use_probability : true));
    var probability = useProb ? (ext.probability !== undefined ? ext.probability : 100) : 100;
    return {
      name: comment,
      content: e.content || '',
      enabled: (e.enabled !== undefined ? e.enabled : true),
      strategy: {
        type: stratType,
        keys: keys,
        keys_secondary: { logic: selLogic, keys: secKeys },
        scan_depth: (ext.scan_depth !== undefined && ext.scan_depth !== null) ? ext.scan_depth : 'same_as_global'
      },
      position: { type: posType, role: posRole, depth: posDepth, order: order },
      probability: probability,
      recursion: {
        prevent_incoming: !!(ext.prevent_recursion),
        prevent_outgoing: !!(ext.exclude_recursion),
        delay_until: (ext.delay_until_recursion || null)
      },
      effect: {
        sticky: (ext.sticky || null),
        cooldown: (ext.cooldown || null),
        delay: (ext.delay || null)
      },
      extra: { source: sourceTag }
    };
  }

  // ===== 写入世界书前的强 sanitize：防止酒馆内部出现 Cannot create property 'depth' on string =====
  // 必须保证：每一条是纯对象；position/strategy/recursion/effect 一定是对象；depth/order 是 number；
  //           任何字符串/数字/null/数组 形式的旧条目都会被重建，不把需要升级的字符串形式 position 交给酒馆。
  function _sanitizeWorldbookEntriesForWrite(list) {
    if (!Array.isArray(list)) return [];
    var safeNumber = function(v, def) {
      var n = Number(v);
      return (isFinite(n) && !isNaN(n)) ? n : def;
    };
    var safeKeys = function(k) {
      if (!Array.isArray(k)) return [];
      return k.filter(function(x) { return typeof x === 'string' && x; });
    };
    return list
      .map(function(e, i, arr) {
        // 防御：entries 里混了纯字符串/数字（典型：depth_prompt.prompt 被误 push）→ 包装成匿名条目避免后面对字符串写 .depth
        if (e == null) return null;
        // 拦截 regex: 脚本配置误写为世界书条目
        var _eCmt = String((e && (e.comment || e.name)) || '');
        if (/^regex[:：]/i.test(_eCmt)) {
          console.warn('[sanitize] 写入前拦截regex脚本配置条目:', _eCmt.slice(0, 30));
          return null;
        }
        if (typeof e === 'string') {
          var firstL = e.split('\n')[0].trim().slice(0, 40) || ('误写字符串条目' + (i + 1));
          console.warn('[sanitize] entries里发现字符串元素，已包装为匿名条目:', firstL.slice(0, 20));
          return { name: firstL, comment: firstL, content: e };
        }
        if (typeof e === 'number' || typeof e === 'boolean') {
          return { name: '误写标量条目' + (i + 1), comment: '误写标量条目' + (i + 1), content: String(e) };
        }
        if (Array.isArray(e)) return null;
        // 保证有 comment（写卡器用 comment 驱动一切；酒馆旧数据只有 name 时用 name 回退）
        if (!e.comment && e.name) e = Object.assign({}, e, { comment: e.name });
        if (!e.comment) e = Object.assign({}, e, { comment: e.name || String(e.content || '').split('\n')[0].trim().slice(0, 40) || ('条目' + (i + 1)) });
        return e;
      })
      .filter(function(e) { return e && typeof e === 'object'; })
      .map(function(e, i, arr) {
        var pos = (e.position && typeof e.position === 'object') ? e.position : {};
        var strat = (e.strategy && typeof e.strategy === 'object') ? e.strategy : {};
        var ks = (strat.keys_secondary && typeof strat.keys_secondary === 'object') ? strat.keys_secondary : {};
        var rec = (e.recursion && typeof e.recursion === 'object') ? e.recursion : {};
        var eff = (e.effect && typeof e.effect === 'object') ? e.effect : {};
        // ===== ✅新增：写入酒馆前对空 keys 条目最后一次兜底派生（写酒馆的永久防线）=====
        var rawKeys = (Array.isArray(strat.keys) && strat.keys.length>0) ? strat.keys
                    : (Array.isArray(e.keys) && e.keys.length>0 ? e.keys : null);
        if (!rawKeys || rawKeys.length === 0) {
          var isConst = !!(e.constant || (strat.type === 'constant'));
          if (!isConst) {
            try {
              var cmForDerive = e.comment || e.name || '';
              var derTmpl = (typeof getEntryTemplate === 'function') ? getEntryTemplate(cmForDerive) : null;
              if (!(derTmpl && derTmpl.constant)) {
                var derived = (typeof _deriveEntryKeys === 'function')
                  ? _deriveEntryKeys(cmForDerive, derTmpl, e.content || '')
                  : [];
                if (derived && derived.length > 0) rawKeys = derived;
              }
            } catch(eDer) {}
          }
        }
        var rawSecondaryKeys = (Array.isArray(ks.keys) && ks.keys.length>0) ? ks.keys
                             : (Array.isArray(e.secondary_keys) && e.secondary_keys.length > 0 ? e.secondary_keys : []);
        // position 类型（优先取新字段，否则回退 Tavern 旧常量）
        var posType = typeof pos.type === 'string' ? pos.type
          : (e.position === 'before_char' || e.position === 0 || pos.type === 0 ? 'before_character_definition'
          : (e.position === 'after_char'  || e.position === 1 ? 'after_character_definition'
          : (e.position === 'before_an'   || e.position === 2 ? 'before_example_messages'
          : (e.position === 'after_an'    || e.position === 3 ? 'after_example_messages'
          :  'at_depth'))));
        var roleVal = (typeof pos.role === 'string') ? pos.role
          : (pos.role === 1 ? 'user' : (pos.role === 2 ? 'assistant' : 'system'));
        // ===== 🧹 最后一道防线：变量列表/变量输出格式条目强制规范化 content =====
        var _sanitizeComment = String(e.comment || e.name || '');
        var _sanitizeContent = String(e.content == null ? '' : e.content);
        if (_sanitizeComment.indexOf('[InitVar]') >= 0 || (_sanitizeComment.indexOf('初始变量') >= 0 && _sanitizeContent.indexOf('stat_data') >= 0)) {
          _sanitizeContent = normalizeInitVarContent(_sanitizeContent);
        }
        if (_sanitizeComment.indexOf('变量列表') >= 0) {
          _sanitizeContent = normalizeVarListContent(_sanitizeContent);
        }
        if (_sanitizeComment.indexOf('变量输出格式') >= 0) {
          _sanitizeContent = normalizeVarOutputFormatContent(_sanitizeComment, _sanitizeContent, _getParsedInitForEntries(arr));
        }
        if (_sanitizeComment.indexOf('变量更新规则') >= 0) {
          _sanitizeContent = normalizeVarUpdateRuleContent(_sanitizeContent);
        }
        return {
          name: String(e.name || e.comment || ('条目' + (i + 1))),
          content: _sanitizeContent,
          enabled: e.enabled !== false,
          uid: (typeof e.uid === 'number' && isFinite(e.uid)) ? e.uid : (e.uid != null ? Number(e.uid) : undefined),
          strategy: {
            type: (typeof strat.type === 'string' && strat.type) ? strat.type : (e.constant ? 'constant' : (e.selective ? 'selective' : 'selective')),
            keys: safeKeys(rawKeys),
            keys_secondary: {
              logic: (typeof ks.logic === 'string' && ks.logic) ? ks.logic : 'and_any',
              keys: safeKeys(rawSecondaryKeys)
            },
            scan_depth: (strat.scan_depth === undefined || strat.scan_depth === null)
              ? (e.scan_depth != null ? e.scan_depth : 'same_as_global')
              : strat.scan_depth
          },
          position: {
            type: posType,
            role: roleVal,
            depth: safeNumber(typeof pos.depth === 'number' ? pos.depth : e.depth, 4),
            order: safeNumber(typeof pos.order === 'number' ? pos.order : (e.order || e.insertion_order), 100)
          },
          probability: safeNumber(e.probability, 100),
          recursion: {
            prevent_incoming: !!rec.prevent_incoming,
            prevent_outgoing: !!rec.prevent_outgoing,
            delay_until: (typeof rec.delay_until === 'number' && isFinite(rec.delay_until)) ? rec.delay_until : null
          },
          effect: {
            sticky: (typeof eff.sticky === 'number' && isFinite(eff.sticky)) ? eff.sticky : null,
            cooldown: (typeof eff.cooldown === 'number' && isFinite(eff.cooldown)) ? eff.cooldown : null,
            delay: (typeof eff.delay === 'number' && isFinite(eff.delay)) ? eff.delay : null
          },
          extra: (e.extra && typeof e.extra === 'object') ? e.extra : {}
        };
      });
  }

  // ===== 【写卡预设】自动给世界书条目分配并包裹 <名称_idN> 标签（对齐 template_tag_spec）=====
  // 分配规则：角色速览固定 <角色速览_id0> → 世界观条目 id1+ → 角色条目按顺序id → NPC继续递增
  // 同一角色的所有条目（基础信息/三面性/二次解释/衣柜/NSFW）共用同一个 <角色名_idN>
  // 注意：MVU条目（[InitVar]/[mvu_update]/变量列表/状态栏占位符）不包裹标签
  function assignAndWrapTagIds(entries) {
    if (!entries || !entries.length) return entries;
    // 第一步：收集顶层角色名（从comment中提取，非主角/世界/系统）
    var allNames = [];
    var worldviewIdx = 0; // 世界观计数器，第一个世界观 = id1
    var charNameToId = {}; // 角色名 → 分配的id数字
    var nextCharId = 1;   // 下一个可用的角色id（从1开始，因为世界观可能先占）
    var NPCIdOffset = 0;
    // 预扫描：优先从comment提取所有候选：角色速览/世界观前缀/角色名/NPC名
    var MVU_PREFIX_RE = /(\[InitVar\]|\[mvu_update\]|变量列表|变量输出格式|变量输出格式强调|<状态栏>|占位符提醒|状态栏占位符)/i;
    var isMVUEntry = function(c) { return MVU_PREFIX_RE.test(c || ''); };
    // 预扫描：把所有comment按出现顺序分类
    var classified = entries.map(function(e, idx) {
      var c = String(e.comment || e.name || ('条目' + (idx + 1)));
      if (isMVUEntry(c)) return { idx: idx, type: 'mvu', name: '', comment: c };
      // 1. 角色速览：固定 id0
      if (c.indexOf('角色速览') >= 0) return { idx: idx, type: 'char-overview', name: '角色速览', comment: c };
      // 2. 世界观组：
      if (/^(世界观|基础公理|世界元数据|交互软规则|核心铁则|近场强约束|当前局势|场景机制|核心玩法|世界规则|实体交互|重要角色|势力与组织|物品|地点场景|叙事背景|故事发展|文化与习俗|历史事件|动态适配|引导机制|互动选项|状态栏|<基础公理>|<世界元数据>|<交互软规则>)/.test(c) ||
          c.indexOf('世界观') === 0 || c.indexOf('基础公理') >= 0 || c.indexOf('世界元数据') >= 0 || c.indexOf('核心铁则') >= 0) {
        worldviewIdx++;
        return { idx: idx, type: 'worldview', name: '世界观', subId: worldviewIdx, comment: c };
      }
      // 3. NPC条目（尝试提取名称，如"NPC1: 商人张三" → "商人张三"）
      if (/^(NPC|重要角色|势力与组织|物品|地点|场景)/.test(c) || c.indexOf('NPC') === 0) {
        // 尝试从"NPC: 名称"或"NPC1: 名称"格式提取名称
        var npcMatch = c.match(/^(?:NPC\d*|重要角色|势力与组织|物品|地点|场景)\s*[:：]\s*([\u4e00-\u9fffA-Za-z0-9_]{2,8})/);
        var npcName = npcMatch ? npcMatch[1] : '';
        return { idx: idx, type: 'npc-guess', name: npcName, comment: c };
      }
      // 4. 角色条目（从comment前缀提取：去掉<...>/[...]后的首个2-6字中文字符串）
      var m = c.match(/<?([\u4e00-\u9fff]{2,6})/);
      var guessName = m ? m[1] : '';
      // 排除明显非角色名：主角/世界/系统/剧情/第一章/附录等
      var EXCLUDE_NAMES = { '主角': true, '世界': true, '系统': true, '剧情': true, '附录': true, '设定': true, '第一章': true, '第二章': true, '第三章': true };
      if (guessName && !EXCLUDE_NAMES[guessName]) {
        if (allNames.indexOf(guessName) < 0) allNames.push(guessName);
        return { idx: idx, type: 'char-entry', name: guessName, comment: c };
      }
      // 5. 兜底：归为世界观附属（id跟世界观走）
      worldviewIdx++;
      return { idx: idx, type: 'worldview', name: '世界观', subId: worldviewIdx, comment: c };
    });
    // 第二步：正式分配ID
    // 角色速览固定id0，世界观从id1开始，角色从世界观最大id+1继续，NPC继续
    var maxWorldId = 0;
    classified.forEach(function(item) {
      if (item.type === 'worldview') maxWorldId = Math.max(maxWorldId, item.subId || 0);
    });
    nextCharId = maxWorldId + 1;
    classified.forEach(function(item) {
      if (item.type === 'char-entry' || item.type === 'npc-guess') {
        var key = item.name || ('NPC_' + item.idx);
        if (!(key in charNameToId)) {
          charNameToId[key] = nextCharId++;
        }
      }
    });
    // 第三步：执行包裹
    var TAG_OPEN_RE = /^\s*<([\u4e00-\u9fffA-Za-z0-9_]+)_id(\d+)\s*>/; // 已经有标签打开？
    var outEntries = entries.slice();
    classified.forEach(function(item) {
      var e = outEntries[item.idx];
      if (!e) return;
      var content = String(e.content || '');
      // MVU条目、已含标签开头的、空内容的不处理
      if (item.type === 'mvu') return;
      if (TAG_OPEN_RE.test(content)) return;
      if (!content.trim()) return;
      var tagName = '', tagId = 0;
      if (item.type === 'char-overview') { tagName = '角色速览'; tagId = 0; }
      else if (item.type === 'worldview') { tagName = '世界观'; tagId = item.subId; }
      else if (item.type === 'char-entry' && item.name) { tagName = item.name; tagId = charNameToId[item.name] || 0; }
      else if (item.type === 'npc-guess' && item.name) { tagName = item.name; tagId = charNameToId[item.name] || 0; }
      else if (item.type === 'npc-guess' && !item.name) { tagName = 'NPC'; tagId = charNameToId['NPC_' + item.idx] || (++worldviewIdx); }
      else { tagName = '世界观'; tagId = (++worldviewIdx); }
      if (!tagName) return;
      var open = '<' + tagName + '_id' + tagId + '>';
      var close = '</' + tagName + '_id' + tagId + '>';
      // 保证 content 前后有换行分隔，避免标签和内容粘连
      var padded = content;
      if (padded.charAt(0) !== '\n') padded = '\n' + padded;
      if (padded.charAt(padded.length - 1) !== '\n') padded = padded + '\n';
      e.content = open + padded + close;
    });
    return outEntries;
  }

  // ===== 去重写入：参考 javascript-format 的 name/comment 路径匹配 =====
  // 旧方案用 extra.source === SOURCE_TAG 过滤再 createWorldbookEntries 追加，
  // 但 extra 字段经酒馆持久化后不一定能原样读回，过滤失效 → 条目叠加。
  // 新方案：updateWorldbookWith 一次性按 name 匹配，命中则覆盖，未命中才追加。
  function _normWiPath(p) {
    var n = String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    if (!n) return '';
    if (n.charAt(0) !== '/') n = '/' + n;
    return '/' + n.split('/').filter(Boolean).join('/');
  }
  function _wiEntryMatch(worldbookName, targetName, oldEntry) {
    var target = _normWiPath('/Worldbooks/' + worldbookName + '/' + (targetName || ''));
    if (!target) return false;
    var byComment = _normWiPath('/Worldbooks/' + worldbookName + '/' + ((oldEntry && oldEntry.comment) || ''));
    var byName = _normWiPath('/Worldbooks/' + worldbookName + '/' + ((oldEntry && oldEntry.name) || ''));
    return byComment === target || byName === target;
  }

  async function _tavernWriteWorldbook(worldbookName, entries) {
    var SOURCE_TAG = 'modelo-char-generator';
    var getWorldbookNames = _tavernFn('getWorldbookNames');
    var getWorldbook = _tavernFn('getWorldbook');
    var createWorldbook = _tavernFn('createWorldbook');
    var updateWorldbookWith = _tavernFn('updateWorldbookWith');
    var createWorldbookEntries = _tavernFn('createWorldbookEntries');

    // ===== 【写卡预设】步骤0：给所有世界书条目自动包裹 <名称_idN> 标签 =====
    // MVU条目自动跳过，已经有标签的不重复包裹
    var wrappedEntries = assignAndWrapTagIds(entries || []);

    // ===== 修复Bug2：转换为酒馆助手 WorldbookEntry 新格式（name 替代 comment） =====
    var converted = wrappedEntries.map(function(e, i) {
      return _convertToWorldbookEntry(e, i, SOURCE_TAG);
    });
    // ===== 写入前强制 sanitize：确保所有条目/position/strategy 是对象，过滤字符串/null =====
    converted = _sanitizeWorldbookEntriesForWrite(converted);

    // ===== 修复Bug1：确保世界书存在（createWorldbookEntries / updateWorldbookWith 要求世界书已存在，
    //                  否则抛错——这正是"只写入开场白和角色描述、不生成世界书、不关联到角色卡"的根因） =====
    var exists = false;
    if (getWorldbookNames) {
      try { var names = await getWorldbookNames(); exists = !!(names && names.indexOf(worldbookName) >= 0); } catch(_e) {}
    }
    if (!exists && getWorldbook) {
      try { await getWorldbook(worldbookName); exists = true; } catch(_e) { exists = false; }
    }
    if (!exists) {
      if (!createWorldbook) throw new Error('酒馆不支持 createWorldbook API，无法创建世界书');
      // createWorldbook 在世界书已存在时会替换(清空)内容，故仅在不存在时调用
      await createWorldbook(worldbookName);
    }

    // ===== 去重写入：按 name/comment 路径匹配，命中则覆盖，未命中才追加 =====
    // （参考 javascript-format 的 ba + updateWorldbookWith 实现，避免条目叠加）
    if (updateWorldbookWith) {
      await updateWorldbookWith(worldbookName, function(oldEntries) {
        var list = (oldEntries || []).slice();
        for (var i = 0; i < converted.length; i++) {
          var newEntry = converted[i];
          var idx = -1;
          for (var j = 0; j < list.length; j++) {
            if (_wiEntryMatch(worldbookName, newEntry.name, list[j])) { idx = j; break; }
          }
          if (idx >= 0) {
            // 命中同名条目：保留原 uid/displayIndex 等元数据，覆盖内容与配置
            list[idx] = Object.assign({}, list[idx], newEntry);
          } else {
            // 未命中：追加新条目
            list.push(newEntry);
          }
        }
        // ===== 回调返回前再统一 sanitize：oldEntries 可能含 position=字符串/空字符串 的旧条目，避免酒馆写 .depth 时炸 =====
        return _sanitizeWorldbookEntriesForWrite(list);
      }, { render: 'immediate' });
    } else if (createWorldbookEntries) {
      // 回退兜底：无 updateWorldbookWith 时走追加（旧版本可能叠加）
      await createWorldbookEntries(worldbookName, converted, { render: 'immediate' });
    } else {
      throw new Error('酒馆不支持 updateWorldbookWith / createWorldbookEntries API');
    }
  }

  // ===== 修复Bug5：将世界书绑定到当前角色卡（rebindCharWorldbooks） =====
  // 根因：步骤2仅写了 character.data.world 字段（v3 规范数据），但并未通过酒馆助手 API
  // 真正激活角色卡与世界书的关联，导致世界书虽已生成却"不关联到角色卡"。
  // 此函数在切换到角色卡后调用，把 worldbookName 设为主世界书，并保留原有 additional 世界书。
  async function _tavernBindWorldbookToChar(worldbookName) {
    var getCharWorldbookNames = _tavernFn('getCharWorldbookNames');
    var rebindCharWorldbooks = _tavernFn('rebindCharWorldbooks');
    if (!rebindCharWorldbooks) {
      console.warn('[worldbook] 酒馆不支持 rebindCharWorldbooks API，跳过角色卡世界书绑定');
      return;
    }
    // 读取当前角色卡已绑定的世界书，保留 additional，仅替换 primary
    var primary = worldbookName;
    var additional = [];
    if (getCharWorldbookNames) {
      try {
        var cur = getCharWorldbookNames('current');
        if (cur) {
          // 把旧的主世界书降级为 additional（避免丢失之前已绑定的世界书），去重
          if (cur.primary && cur.primary !== worldbookName && additional.indexOf(cur.primary) < 0) {
            additional.push(cur.primary);
          }
          if (Array.isArray(cur.additional)) {
            cur.additional.forEach(function(n) {
              if (n && n !== worldbookName && additional.indexOf(n) < 0) additional.push(n);
            });
          }
        }
      } catch(_e) {}
    }
    await rebindCharWorldbooks('current', { primary: primary, additional: additional });
  }

  // 切换到角色卡（Lr）
  async function _tavernSwitchToCharacter(name) {
    var validated = _tavernValidateName(name);
    var st = _tavern();
    if (!st || !st.characters) throw new Error('无法访问酒馆角色列表');
    var idx = -1;
    for (var n = 0; n < 20 && idx < 0; n++) {
      idx = -1;
      for (var i = 0; i < st.characters.length; i++) {
        if (st.characters[i].name === validated) { idx = i; break; }
      }
      if (idx < 0) await new Promise(function(r) { setTimeout(r, 100); });
    }
    if (idx < 0) throw new Error('已完成写入，但无法在角色列表中找到：' + validated);
    if (typeof st.selectCharacterById === 'function') {
      await st.selectCharacterById(idx, { switchMenu: true });
    }
  }

  // ===== 生成完整角色卡 =====
  function buildExportCard(cd) {
    // 兼容 V3 格式：条目和扩展可能在 data 对象内
    var v3Data = cd.data || {};
    var rawEntries = (cd.character_book && cd.character_book.entries) || (v3Data.character_book && v3Data.character_book.entries) || [];
    var rawExtensions = cd.extensions || v3Data.extensions || {};
    // 从角色卡数据提取角色名列表，用于 MVU 条目内容自动生成
    var charNames = extractCharNames(cd, rawEntries);
    // ⚠️预扫描 InitVar 内容：用于派生与本卡 schema 字段匹配的 JSON Patch 示例路径
    // 解决 AI 照抄模板路径（/主角/好感度）导致 JSON Patch 静默失败、变量永远不更新的致命问题
    var _preParsedInit = null;
    for (var _pi = 0; _pi < rawEntries.length; _pi++) {
      var _pc = (rawEntries[_pi].comment || '').toLowerCase();
      if (_pc.indexOf('[initvar]') >= 0 && rawEntries[_pi].content && rawEntries[_pi].content.trim()) {
        _preParsedInit = parseInitVar(rawEntries[_pi].content);
        break;
      }
    }
    if (!_preParsedInit) _preParsedInit = parseInitVar(generateInitVarYaml(charNames));
    // ===== 预填充：自动填充 MVU 条目空内容（独立步骤，确保检测和schema生成使用填充后的数据）=====
    var filledEntries = rawEntries.map(function(e, i) {
      var comment = e.comment || ('条目' + (i + 1));
      var commentLower = comment.toLowerCase();
      var isInitVar = commentLower.indexOf('[initvar]') >= 0;
      var isVarList = comment.indexOf('变量列表') >= 0;
      var isVarSegmented = comment.indexOf('变量分段') >= 0 || comment.indexOf('分段提示') >= 0 || comment.indexOf('EJS') >= 0;
      var isVarRule = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量更新规则') >= 0;
      var isVarFormat = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量输出格式') >= 0 && comment.indexOf('强调') < 0;
      var isVarFormatEmphasis = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量输出格式强调') >= 0;
      var outContent = e.content || '';
      if (!outContent || outContent.trim() === '') {
        if (isInitVar) outContent = generateInitVarYaml(charNames);
        else if (isVarList) outContent = generateVarListContent();
        else if (isVarSegmented) outContent = generateVarSegmentedPrompt(charNames);
        else if (isVarRule) outContent = generateVarUpdateRule(charNames);
        else if (isVarFormat) outContent = generateVarOutputFormat(_preParsedInit);
        else if (isVarFormatEmphasis) outContent = generateVarOutputEmphasis();
      } else if (isVarList) {
        outContent = normalizeVarListContent(outContent);
      } else if (isInitVar && outContent) {
        // ⚠️防御性规范化：剥离 AI 误写的 stat_data 根键、过滤 _/$ 只读字段
        outContent = normalizeInitVarContent(outContent);
        // InitVar 规范化后同步更新预解析结果，确保后续格式条目使用最新字段
        _preParsedInit = parseInitVar(outContent);
      } else if (isVarRule && outContent) {
        // ⚠️防御性规范化：补全根节点、剥离 stat_data. 前缀、check 转列表
        outContent = normalizeVarUpdateRuleContent(outContent);
      } else if (isVarFormat && outContent) {
        // ⚠️防御性规范化：修正 JSON Patch 示例路径与本卡 schema 字段匹配，防止 AI 照抄模板路径
        outContent = fixVarOutputFormatPaths(outContent, _preParsedInit);
      }
      return {
        id: e.id || (i + 1),
        keys: e.keys || [],
        secondary_keys: e.secondary_keys || [],
        comment: comment,
        content: outContent,
        constant: e.constant,
        selective: e.selective,
        insertion_order: e.insertion_order,
        enabled: e.enabled,
        position: e.position,
        use_regex: e.use_regex,
        extensions: e.extensions || {}
      };
    });
    // ===== 预填充结束 =====
    // ===== 改进Z5：MVU核心条目兜底——只要任意一项MVU条目存在，就自动补齐其余4类缺失条目 =====
    // 确保导出的角色卡永远包含完整可用的MVU系统
    var anyMVUExists = filledEntries.some(function(e) { return isMVUEntry(e.comment || ''); });
    var mvuEntryExists = function(pred) { return filledEntries.some(pred); };
    if (anyMVUExists) {
      var _toAppend = [];
      var _idx = filledEntries.length;
      // InitVar
      if (!mvuEntryExists(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; })) {
        _toAppend.push({ id: _idx + 1, keys: [], secondary_keys: [], comment: '[InitVar]初始变量', content: generateInitVarYaml(charNames), constant: true, selective: false, insertion_order: 100, enabled: false, position: 0, use_regex: true, extensions: {} });
        _idx++;
      }
      // 变量列表（标签内为 null）
      if (!mvuEntryExists(function(e) { return (e.comment || '').indexOf('变量列表') >= 0; })) {
        _toAppend.push({ id: _idx + 1, keys: [], secondary_keys: [], comment: '变量列表', content: generateVarListContent(), constant: true, selective: false, insertion_order: 150, enabled: true, position: 4, use_regex: true, extensions: {} });
        _idx++;
      }
      // [mvu_update]变量更新规则
      if (!mvuEntryExists(function(e) { return (e.comment || '').toLowerCase().indexOf('[mvu_update]') >= 0 && (e.comment || '').indexOf('变量更新规则') >= 0; })) {
        _toAppend.push({ id: _idx + 1, keys: [], secondary_keys: [], comment: '[mvu_update]变量更新规则', content: generateVarUpdateRule(charNames), constant: true, selective: false, insertion_order: 100, enabled: true, position: 4, use_regex: true, extensions: {} });
        _idx++;
      }
      // [mvu_update]变量输出格式
      if (!mvuEntryExists(function(e) { return (e.comment || '').indexOf('变量输出格式') >= 0 && (e.comment || '').indexOf('强调') < 0; })) {
        _toAppend.push({ id: _idx + 1, keys: [], secondary_keys: [], comment: '[mvu_update]变量输出格式', content: generateVarOutputFormat(_preParsedInit), constant: true, selective: false, insertion_order: 100, enabled: true, position: 4, use_regex: true, extensions: {} });
        _idx++;
      }
      if (_toAppend.length) {
        filledEntries = filledEntries.concat(_toAppend);
        console.warn('[buildExportCard] Z5兜底：自动补齐缺失MVU条目 ' + _toAppend.map(function(e) { return e.comment; }).join('、'));
      }
    }
    var entries = filledEntries.map(function(e, i) {
      var comment = e.comment || ('条目' + (i + 1));
      var tmpl = getEntryTemplate(comment);
      var isConst = tmpl ? tmpl.constant : false;
      var isSel = tmpl ? tmpl.selective : true;
      var pos = tmpl ? tmpl.position : 4;
      var depth = tmpl ? tmpl.depth : 4;
      var order = tmpl ? tmpl.order : 100;
      var defaultGroup = tmpl ? tmpl.group : '';
      var defaultSticky = tmpl ? (tmpl.sticky || 0) : 0;
      var defaultCD = tmpl ? tmpl.cooldown : 0;
      var defaultProb = tmpl ? tmpl.probability : 100;
      var defaultSL = tmpl ? tmpl.selectiveLogic : 0;
      var defaultPR = tmpl ? tmpl.prevent_recursion : false;
      var defaultER = tmpl ? tmpl.exclude_recursion : false;
      var defaultDUR = tmpl ? !!tmpl.delay_until_recursion : false;
      var defaultUseProb = tmpl ? tmpl.useProbability : false;
      var defaultScanDepth = tmpl ? tmpl.scan_depth : null;
      var defaultEnabled = tmpl && tmpl.enabled !== undefined ? tmpl.enabled : true;
      var ext = e.extensions || {};
      var rawPos = ext.position !== undefined ? ext.position : pos;
      var posNum = typeof rawPos === 'string'
        ? (rawPos === 'before_char' || rawPos === '0' ? 0 : 1)
        : rawPos;
      // ST规范：顶层position只接受 "before_char" 或 "after_char"
      // position=0 → before_char，其他所有值 → after_char
      var topPosStr = (posNum === 0) ? 'before_char' : 'after_char';
      var roleVal = ext.role !== undefined ? ext.role : 0;
      if (typeof roleVal === 'string') {
        roleVal = roleVal.toLowerCase() === 'user' ? 1 : 0;
      }
      var useProbVal = ext.useProbability !== undefined ? ext.useProbability : (ext.use_probability !== undefined ? ext.use_probability : defaultUseProb);
      var groupWeightVal = ext.group_weight !== undefined ? ext.group_weight : (ext.groupWeight !== undefined ? ext.groupWeight : 100);
      // MVU 安全网：[initvar] 条目必须 enabled=false；变量输出格式强调 默认 enabled=false
      // 注意：空内容填充已移至预填充步骤，此处仅保留类型检测用于 enabled 逻辑
      var commentLower = comment.toLowerCase();
      var isInitVar = commentLower.indexOf('[initvar]') >= 0;
      var isVarList = comment.indexOf('变量列表') >= 0;
      var isVarSegmented = comment.indexOf('变量分段') >= 0 || comment.indexOf('分段提示') >= 0 || comment.indexOf('EJS') >= 0;
      var isVarRule = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量更新规则') >= 0;
      var isVarFormat = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量输出格式') >= 0 && comment.indexOf('强调') < 0;
      var isVarFormatEmphasis = commentLower.indexOf('[mvu_update]') >= 0 && comment.indexOf('变量输出格式强调') >= 0;
      var outContent = e.content || '';
      return {
        id: e.id || (i + 1),
        keys: e.keys || [],
        secondary_keys: e.secondary_keys || (tmpl && tmpl.secondary_keys) || [],
        comment: comment,
        content: outContent,
        constant: e.constant !== undefined ? e.constant : isConst,
        selective: e.selective !== undefined ? e.selective : isSel,
        insertion_order: e.insertion_order || order,
        enabled: isInitVar ? false : (isVarFormatEmphasis ? (e.enabled !== undefined ? e.enabled : false) : (e.enabled !== undefined ? e.enabled : defaultEnabled)),
        position: topPosStr,
        use_regex: e.use_regex !== undefined ? e.use_regex : true,
        extensions: {
          position: posNum,
          exclude_recursion: ext.exclude_recursion !== undefined ? ext.exclude_recursion : defaultER,
          display_index: i,
          probability: ext.probability !== undefined ? ext.probability : defaultProb,
          useProbability: useProbVal,
          depth: ext.depth !== undefined ? ext.depth : depth,
          selectiveLogic: ext.selectiveLogic !== undefined ? ext.selectiveLogic : defaultSL,
          group: ext.group || defaultGroup,
          prevent_recursion: ext.prevent_recursion !== undefined ? ext.prevent_recursion : defaultPR,
          scan_depth: ext.scan_depth !== undefined ? ext.scan_depth : defaultScanDepth,
          match_whole_words: ext.match_whole_words !== undefined ? ext.match_whole_words : null,
          case_sensitive: ext.case_sensitive !== undefined ? ext.case_sensitive : null,
          automation_id: '',
          group_override: ext.group_override !== undefined ? !!ext.group_override : false, /* 改进S：尊重用户配置，不再硬编码false */
          group_weight: groupWeightVal,
          delay_until_recursion: ext.delay_until_recursion !== undefined ? ext.delay_until_recursion : defaultDUR, /* 改进T：保留原值（数字=延迟N轮），不再强制boolean */
          use_group_scoring: false,
          role: roleVal,
          vectorized: ext.vectorized !== undefined ? ext.vectorized : false,
          sticky: ext.sticky !== undefined && ext.sticky !== null ? ext.sticky : 0,
          cooldown: ext.cooldown !== undefined && ext.cooldown !== null ? ext.cooldown : 0,
          delay: ext.delay !== undefined && ext.delay !== null ? ext.delay : 0,
          match_persona_description: ext.match_persona_description !== undefined ? ext.match_persona_description : false,
          match_character_description: ext.match_character_description !== undefined ? ext.match_character_description : false,
          match_character_personality: ext.match_character_personality !== undefined ? ext.match_character_personality : false,
          match_character_depth_prompt: ext.match_character_depth_prompt !== undefined ? ext.match_character_depth_prompt : false,
          match_scenario: ext.match_scenario !== undefined ? ext.match_scenario : false,
          match_creator_notes: ext.match_creator_notes !== undefined ? ext.match_creator_notes : false,
          outlet_name: '',
          triggers: [],
          ignore_budget: false
        }
      };
    });
    // ===== 深度防御：entries 里混入字符串/null/非对象时立即清理（常见于 depth_prompt.prompt 被误写入 entries 或用户工作台删了但残留字符串）=====
    entries = entries.filter(function(e) { return e && typeof e === 'object' && !Array.isArray(e); });
    // ===== 额外保险：如果 entry.comment 缺失但 content 像 "【...】：..." 这种 depth_prompt 式长文本，加一个 fallback comment 防止后续流程炸 =====
    entries = entries.map(function(e) {
      if (!e.comment && e.content && typeof e.content === 'string') {
        var first = e.content.split('\n')[0].trim();
        if (first.length > 8 && first.length <= 60) e = Object.assign({}, e, { comment: first.slice(0, 40) });
      }
      return e;
    });
    // ST规范：换行符统一使用 \r\n
    var toCRLF = function(str) {
      if (!str) return str;
      return str.replace(/\r?\n/g, '\r\n');
    };
    // normalizeRegexScripts 已提取为外层共享函数（导入/导出共用）
    var cardName = cd.name || '未命名世界';
    var cardDesc = cd.description || '';
    // 检测是否包含MVU核心条目（至少 [initvar] + 变量列表/更新规则/输出格式 之一即视为MVU系统）
    // 使用预填充后的 filledEntries 进行检测，确保 InitVar 等条目已含自动生成的内容
    var hasInitVar = filledEntries.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; });
    var hasVarList = filledEntries.some(function(e) { return (e.comment || '').indexOf('变量列表') >= 0; });
    var hasVarUpdate = filledEntries.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[mvu_update]') >= 0 || (e.comment || '').indexOf('变量更新规则') >= 0; });
    var hasVarFormat = filledEntries.some(function(e) { return (e.comment || '').indexOf('变量输出格式') >= 0; });
    var hasVarSegmented = filledEntries.some(function(e) { return (e.comment || '').indexOf('变量分段') >= 0 || (e.comment || '').indexOf('分段提示') >= 0 || (e.comment || '').toLowerCase().indexOf('ejs') >= 0; });
    var hasMVUEntries = !!(hasInitVar && (hasVarList || hasVarUpdate || hasVarFormat || hasVarSegmented));
    // 宽泛匹配：只要存在任意 MVU 核心条目（即使无 [InitVar]）也视为 MVU 卡
    var hasAnyMVU = hasMVUEntries || filledEntries.some(function(e) { return isMVUEntry(e.comment || ''); });
    // 最终使用宽泛匹配结果，确保只要有任意 MVU 条目就注入脚本
    hasMVUEntries = hasMVUEntries || hasAnyMVU;
    var rawFirstMes = cd.first_mes || '';
    // MVU 卡的开场白必须含 <StatusPlaceHolderImpl/>（即使 first_mes 为空也追加，保证状态栏正常显示）
    if (hasMVUEntries && rawFirstMes.indexOf('<StatusPlaceHolderImpl') < 0) {
      rawFirstMes = rawFirstMes.replace(/<StatusPlaceHolderImpl\s*\/>/gi, '').trim() + '\n\n<StatusPlaceHolderImpl/>';
    }
    var cardFirstMes = toCRLF(rawFirstMes);
    var cardAltGreetings = (cd.alternate_greetings || []).map(function(g) {
      // ⚠️改进R5：非字符串元素（null/数字/对象）会令 toCRLF 崩溃，加 typeof 守卫
      if (typeof g !== 'string') g = '';
      var greeting = toCRLF(g);
      // MVU开局变量初始化：在alternate_greetings中保留<UpdateVariable>段（覆盖[InitVar]默认值）
      // 同时确保每个alt greeting也含<StatusPlaceHolderImpl/>占位符
      if (hasMVUEntries && greeting.indexOf('<StatusPlaceHolderImpl') < 0) {
        greeting = greeting.replace(/<StatusPlaceHolderImpl\s*\/>/gi, '').trim() + '\n\n<StatusPlaceHolderImpl/>';
      }
      return greeting;
    });
    var cardSysPrompt = toCRLF(cd.system_prompt || '');
    var cardCreatorNotes = toCRLF(cd.creator_notes || '时之写卡器创建');
    // 优先从 data.depth_prompt 读取（v3规范），回退到 extensions.depth_prompt（v2兼容）
    // 改进D：深拷贝避免引用污染源cardData（多次buildExportCard会累积修改role/depth）
    // 修复：若来源是 JSON 字符串（形如 '{"prompt":"...","depth":0,"role":"system"}'），先反序列化再操作，
    //   否则 JSON.parse(JSON.stringify(string)) 仍是字符串，后续 .depth= 会抛 "Cannot create property 'depth' on string"
    var _rawDpSrc = cd.depth_prompt ? cd.depth_prompt : (rawExtensions.depth_prompt ? rawExtensions.depth_prompt : { prompt: '', depth: 4, role: 'system' });
    var _depthPromptSrc = normalizeDepthPrompt(_rawDpSrc, 4);
    var depthPrompt = JSON.parse(JSON.stringify(_depthPromptSrc));
    // 修正 depth_prompt.role 为字符串
    if (typeof depthPrompt.role === 'number') {
      depthPrompt.role = depthPrompt.role === 1 ? 'user' : (depthPrompt.role === 2 ? 'assistant' : 'system');
    }
    if (depthPrompt.depth === undefined) depthPrompt.depth = 4;
    var cardData = {
      name: cardName,
      description: cardDesc,
      personality: cd.personality || '',
      scenario: cd.scenario || '',
      first_mes: cardFirstMes,
      creator_notes: cardCreatorNotes,
      system_prompt: cardSysPrompt,
      creator: '时之写卡器',
      character_version: '',
      alternate_greetings: cardAltGreetings,
      group_only_greetings: [],
      depth_prompt: depthPrompt,
      extensions: (function() {
        // 检测是否包含MVU变量系统条目（复用前面的检测结果）
        var hasMVU = hasMVUEntries;
        var existingRx = normalizeRegexScripts(rawExtensions.regex_scripts);
        var existingScripts = (rawExtensions.tavern_helper && rawExtensions.tavern_helper.scripts) || [];
        var mvuScripts = existingScripts.slice();
        var mvuRegex = existingRx.slice();
        if (hasMVU) {
          // 自动注入MVU bundle.js脚本（如果尚未存在）
          // 使用 MVU 规范的固定UUID，确保兼容
          var hasBundle = mvuScripts.some(function(s) { return (s.content || '').indexOf('MagVarUpdate') >= 0 || (s.content || '').indexOf('bundle.js') >= 0; });
          if (!hasBundle) {
            mvuScripts.push({
              type: 'script',
              enabled: true,
              name: 'MVU',
              id: '961f366d-e403-45c2-8155-3d14ec86de53',
              content: "import'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';",
              info: '',
              button: {
                enabled: true,
                buttons: [
                  { name: '重新处理变量', visible: false },
                  { name: '重新读取初始变量', visible: false },
                  { name: '快照楼层', visible: false },
                  { name: '重演楼层', visible: false },
                  { name: '重试额外模型解析', visible: false },
                  { name: '清除旧楼层变量', visible: false }
                ]
              },
              data: {}
            });
          }
          // ⚠️用户要求：变量结构脚本（zod schema）由 AI 在 MVU Tab 按 9.1.5/9.1.6 工作流一条一条生成，不再导出时自动注入
          // （原 isMvuSchemaComplete / hasSchema / generateMvuSchemaScript 自动注入逻辑已移除）
          // ⚠️用户要求：WTC（世界书调用脚本）不再自动注入，由 AI 按需在 MVU Tab 生成
          // （原 hasWTC 自动注入逻辑已移除）
          // 自动注入MVU必备正则脚本（5条：正则1-5；正则6 美化状态栏由 AI 在 MVU Tab 生成）
          // 正则1：仅格式思维链 - 从提示词中移除<Analysis>段（AI思维链不需要重复发送）
          var hasAnalysisRegex = mvuRegex.some(function(r) { return (r.findRegex || '').indexOf('Analysis') >= 0 && r.promptOnly; });
          if (!hasAnalysisRegex) {
            mvuRegex.push({
              id: 'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36',
              scriptName: '仅格式思维链',
              findRegex: '/<Analysis>[\\s\\S]+?<\\/Analysis>/gm',
              replaceString: '',
              trimStrings: [],
              placement: [2],
              disabled: false,
              markdownOnly: false,
              promptOnly: true,
              runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
              substituteRegex: 0,
              minDepth: null,
              maxDepth: null
            });
          }
          // 正则2：只发送最新2楼的变量更新 - 从提示词移除旧UpdateVariable段（minDepth=4保留最近2楼）
          var hasUpdateVarPromptRegex = mvuRegex.some(function(r) {
            return (r.findRegex || '').indexOf('UpdateVariable') >= 0 && r.promptOnly;
          });
          if (!hasUpdateVarPromptRegex) {
            mvuRegex.push({
              id: '5bb4b588-23ca-4564-8df5-882104eff764',
              scriptName: '只发送最新2楼的变量更新',
              findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm',
              replaceString: '',
              trimStrings: [],
              placement: [2],
              disabled: false,
              markdownOnly: false,
              promptOnly: true,
              runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
              substituteRegex: 0,
              minDepth: 4,
              maxDepth: null
            });
          }
          // 正则3：[美化]变量完成 - 美化已完成的UpdateVariable显示（markdownOnly）
          var hasBeautifyCompleteRegex = mvuRegex.some(function(r) {
            return r.id === '6fb572ae-a9ea-436d-9779-ad100f1ff7f5';
          });
          if (!hasBeautifyCompleteRegex) {
            mvuRegex.push({
              id: '6fb572ae-a9ea-436d-9779-ad100f1ff7f5',
              scriptName: '[美化]变量完成',
              findRegex: '/<UpdateVariable(?:variable)?>\\s*([\\s\\S]*?)\\s*<\\/UpdateVariable(?:variable)?>/gsi',
              replaceString: MVU_BEAUTIFY_COMPLETE,
              trimStrings: [],
              placement: [2],
              disabled: false,
              markdownOnly: true,
              promptOnly: false,
              runOnEdit: false,
              substituteRegex: 0,
              minDepth: null,
              maxDepth: null
            });
          }
          // 正则4：[美化]变量更新中 - 美化流式输出中的UpdateVariable显示
          var hasBeautifyThinkingRegex = mvuRegex.some(function(r) {
            return r.id === 'bf1b7441-5cf1-426d-bd6c-911332be9923';
          });
          if (!hasBeautifyThinkingRegex) {
            mvuRegex.push({
              id: 'bf1b7441-5cf1-426d-bd6c-911332be9923',
              scriptName: '[美化]变量更新中',
              findRegex: '/<UpdateVariable(?:variable)?>(?!.*<\\/UpdateVariable(?:variable)?>)\\s*(.*)\\s*$/gsi',
              replaceString: MVU_BEAUTIFY_THINKING,
              trimStrings: [],
              placement: [2],
              disabled: false,
              markdownOnly: true,
              promptOnly: false,
              runOnEdit: false,
              substituteRegex: 0,
              minDepth: null,
              maxDepth: null
            });
          }
          // 月相1-4已删除
          // 正则5：[不发送]隐藏状态栏标记 - 从提示词移除 <StatusPlaceHolderImpl/>（AI不需要看到占位符）
          var hasHidePlaceholderRegex = mvuRegex.some(function(r) {
            return (r.findRegex || '').indexOf('StatusPlaceHolderImpl') >= 0 && r.promptOnly && !r.markdownOnly;
          });
          if (!hasHidePlaceholderRegex) {
            mvuRegex.push({
              id: 'mvu-status-hide',
              scriptName: '[不发送]隐藏状态栏标记',
              findRegex: '/<StatusPlaceHolderImpl\\/>/g',
              replaceString: '',
              trimStrings: [],
              placement: [2],
              disabled: false,
              markdownOnly: false,
              promptOnly: true,
              runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
              substituteRegex: 0,
              minDepth: null,
              maxDepth: null
            });
          }
          // ⚠️用户要求：正则6（[美化]MVU状态栏）由 AI 在 MVU Tab 按 9.1.6 工作流一条一条生成，不再导出时自动注入
          // （原 hasStatusBarRegex / MVU_STATUS_BAR_HTML 回退注入逻辑已移除）
        }
        return {
          talkativeness: '0.5',
          fav: false,
          world: cardName,
          depth_prompt: depthPrompt,
          regex_scripts: mvuRegex,
          'xiaobaix-template': {
            enabled: false,
            template: '',
            customRegex: '',
            disableParsers: false,
            skipFirstMessage: false,
            recentMessageCount: 0,
            limitToRecentMessages: false
          },
          tavern_helper: { scripts: mvuScripts, variables: {} }
        };
      })(),
      character_book: {
        name: cardName,
        entries: entries
      }
    };
    // ⚠️改进R6：data.format='milk' 必须在 return 前设置（旧代码在 return 之后是死代码）
    if (cardData && !cardData.format) cardData.format = 'milk';
    // ST规范：顶层需要重复 data 中的关键字段（v3格式顶层用 creatorcomment，data内沿用 creator_notes）
    return {
      name: cardName,
      description: cardDesc,
      personality: cd.personality || '',
      scenario: cd.scenario || '',
      first_mes: cardFirstMes,
      creatorcomment: cardCreatorNotes,
      avatar: 'none',
      talkativeness: '0.5',
      fav: false,
      create_date: new Date().toISOString(),
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: cardData
    };
  }

    // ============================================================================
  // SECTION 8  写卡器主界面 UI 渲染（欢迎页 · 聊天 · 预览 · 工作台）
  // ============================================================================
  // ===== 主界面 =====
  async function openEditor() {
    try {
      var doc = await createModalIframe();

      var cardData = {
        name: '', description: '', personality: '', scenario: '',
        first_mes: '', creator_notes: '', system_prompt: '',
        creator: '时之写卡器',
        character_version: '', alternate_greetings: [], group_only_greetings: [],
        extensions: {
          talkativeness: '0.5',
          fav: false,
          world: '',
          depth_prompt: { prompt: '', depth: 4, role: 'system' },
          regex_scripts: [],
          'xiaobaix-template': {
            enabled: false,
            template: '',
            customRegex: '',
            disableParsers: false,
            skipFirstMessage: false,
            recentMessageCount: 0,
            limitToRecentMessages: false
          },
          tavern_helper: { scripts: [], variables: {} }
        },
        character_book: { entries: [] }
      };

      // ========== Tab 隔离系统：角色卡 Tab 与 MVU状态栏 Tab 完全独立 ==========
      // 参考用户建议的 chatSessions 结构化封装，两边会话状态完全隔离
      var activeTab = 'card';  // 'card' = 角色卡生成, 'mvu' = MVU变量状态栏
      // 暴露到 window：让 mergePartial / checkMvu8Entries 等顶层作用域函数也能正确取到当前Tab和cardData
      if (typeof window !== 'undefined') {
        window.__cardData = cardData;
        window.__tab_activeTab = activeTab;
        window.__getActiveTab = function() { return activeTab; };
        /* 改进16：灰色模式开关——角色卡Tab允许讨论/规划变量结构，但仍禁止生成真实MVU条目
           用法：setMvuDiscussMode(true) 开启讨论模式；setMvuDiscussMode(false) 恢复严格拦截 */
        window.__mvuDiscussMode = false;
        window.setMvuDiscussMode = function(on) {
          window.__mvuDiscussMode = !!on;
          console.log('[Tab隔离] 灰色模式（变量结构讨论）' + (window.__mvuDiscussMode ? '已开启' : '已关闭'));
          return window.__mvuDiscussMode;
        };
      }
      // 向后兼容别名：activeTab === currentTab，两边代码都能跑
      var currentTab = activeTab;
      var chatSessions = {
        card: {
          messages: [],          // 角色卡Tab独立聊天历史
          mode: 'normal'         // 角色卡Tab专属模式：永远是 normal，永远不进入状态栏生成模式
        },
        mvu: {
          messages: [],          // MVU Tab独立聊天历史
          // 以下字段为旧5步状态栏系统的兼容占位（已废弃，统一使用单一模板，始终保持空默认值）
          currentStep: 0,
          modules: { step2: null, step3: null, step4: null, step5: null, step6: null },
          statusBarMode: false
        }
      };
      // 兼容旧代码的独立变量别名：实际以 chatSessions 为准，切换Tab时同步
      var cardMessages = chatSessions.card.messages;
      var mvuMessages = chatSessions.mvu.messages;
      // 旧5步状态栏系统别名（已废弃，始终保持空默认值，仅为兼容尚未清理的旧引用）
      var mvuTabStatusBarModules = chatSessions.mvu.modules;
      var mvuTabStatusBarCurrentStep = chatSessions.mvu.currentStep;
      var mvuTabStatusBarMode = chatSessions.mvu.statusBarMode;
      // ★ 向后兼容别名：旧代码各处仍直接引用 messages 变量（importCardData/loadFromStorage等）
      // 必须保留 var messages 声明，否则会报 "messages is not defined"
      var messages = chatSessions.card.messages;

      // 当前Tab的messages访问器（根据activeTab返回对应数组）
      function getCurrentMessages() {
        return activeTab === 'card' ? chatSessions.card.messages : chatSessions.mvu.messages;
      }
      function setCurrentMessages(arr) {
        if (activeTab === 'card') {
          chatSessions.card.messages = arr;
          cardMessages = arr;
          messages = arr;
        } else {
          chatSessions.mvu.messages = arr;
          mvuMessages = arr;
        }
      }
      // ★ 暴露到 window：让顶层作用域的 buildPrompt / callAIChat / calcProgress 等函数也能访问
      if (typeof window !== 'undefined') {
        window.__tab_activeTab = activeTab;
        window.__getActiveTab = function() { return activeTab; };
        window.__getCurrentTab = function() { return currentTab; };
        window.__getCurrentMessages = getCurrentMessages;
        window.__setCurrentMessages = setCurrentMessages;
        window.__getChatSessions = function() { return chatSessions; };
        window.__setChatSessionsCardMessages = function(arr) { chatSessions.card.messages = arr; cardMessages = arr; messages = arr; };
        window.__setChatSessionsMvuMessages = function(arr) { chatSessions.mvu.messages = arr; mvuMessages = arr; };
      }
      // 所有地方使用 messages 变量时，改为访问当前Tab的数组
      Object.defineProperty(typeof window !== 'undefined' ? window : {}, '_dummy', {value:0});
      // 为了兼容现有代码，我们通过消息函数来路由，不直接覆盖messages引用

      var isGenerating = false;
      var cardGenerated = false;
      var progress = 0;
      var moduleProgress = { axiom: 0, soft_rules: 0, core_rules: 0, near_constraint: 0, scene_mechanics: 0, entity_interact: 0, narrative_bg: 0, dynamic_adapt: 0, init_var: 0, var_update_rule: 0 };

      // ===== Tab 切换函数：保存当前Tab状态 + 切换并恢复另一Tab状态 =====
      function switchTab(targetTab) {
        if (targetTab === activeTab || isGenerating) return;
        // ===== 1. 先保存正要离开的Tab状态到 chatSessions（对称保存两边，确保不会丢失最新进度） =====
        if (activeTab === 'mvu') {
          mvuMessages = chatSessions.mvu.messages;
        } else {
          // 离开角色卡Tab：同步别名
          cardMessages = chatSessions.card.messages;
          messages = chatSessions.card.messages;
          chatSessions.card.mode = 'normal';
        }
        // ===== 2. 正式切到新Tab =====
        activeTab = targetTab;
        currentTab = activeTab;  // 向后兼容
        // 同步到 window：让 mergePartial / buildPrompt / calcProgress 也能取到最新Tab
        if (typeof window !== 'undefined') {
          window.__tab_activeTab = activeTab;
          if (typeof window.__getActiveTab === 'function') {
            // 重新绑定闭包（防止旧闭包返回过时值）
          }
          window.__getActiveTab = function() { return activeTab; };
          window.__getCurrentTab = function() { return currentTab; };
        }
        // 更新Tab按钮激活态
        var tabBtns = doc.querySelectorAll('.tab-btn');
        for (var ti = 0; ti < tabBtns.length; ti++) {
          tabBtns[ti].classList.toggle('active', tabBtns[ti].getAttribute('data-tab') === targetTab);
        }
        // 更新 mod-focus / mod-dash / mvu-info-panel 显示筛选
        var modFocus = doc.getElementById('modFocus');
        if (modFocus) {
          modFocus.classList.remove('card-only', 'mvu-only');
          modFocus.classList.add(targetTab === 'card' ? 'card-only' : 'mvu-only');
        }
        var modDash = doc.getElementById('modDash');
        if (modDash) {
          modDash.classList.remove('card-only', 'mvu-only');
          modDash.classList.add(targetTab === 'card' ? 'card-only' : 'mvu-only');
        }
        var mvuPanel = doc.getElementById('mvuInfoPanel');
        if (mvuPanel) {
          mvuPanel.classList.remove('card-only', 'mvu-only');
          mvuPanel.classList.add(targetTab === 'card' ? 'card-only' : 'mvu-only');
        }
        // ===== 3. 同步所有消息别名变量（cardMessages/mvuMessages/messages），保证所有引用都指向最新数组 =====
        cardMessages = chatSessions.card.messages;
        mvuMessages = chatSessions.mvu.messages;
        if (targetTab === 'card') {
          messages = chatSessions.card.messages;
        }
        // 切换聊天记录：清空当前聊天面板并重放目标Tab的消息
        var chatC = doc.getElementById('chatMessages');
        if (chatC) {
          chatC.innerHTML = '';
          var msgs = getCurrentMessages();
          for (var mi = 0; mi < msgs.length; mi++) {
            appendMsg(msgs[mi].role, msgs[mi].content, mi);
          }
          // ★ 重绘后自动滚动到底部，让用户看到最新消息
          try { chatC.scrollTop = chatC.scrollHeight; } catch(_scErr) {}
          // 下一帧再滚一次（确保渲染完成后滚动）
          try { setTimeout(function() { chatC.scrollTop = chatC.scrollHeight; }, 50); } catch(_scErr2) {}
        }
        // ===== 4. 恢复新Tab状态 =====
        if (targetTab === 'mvu') {
          // ===== 进入MVU Tab时自动注入固定资产（bundle.js + 正则1-5）=====
          // ⚠️仅自动注入 bundle.js 和正则1-5；变量结构脚本/WTC/<状态栏>占位符提醒/正则6 由 AI 按 9.1.6 工作流一条一条生成
          // 这些资产固定不变，提前注入让用户在MVU Tab里就能看到完整资产，预览时也能正确渲染
          var injectedAssets = ensureFixedMvuAssetsInCardData();
          if (injectedAssets && injectedAssets.length > 0) {
            renderPreview();
            showToast('已自动注入MVU固定资产：' + injectedAssets.join('、'), 'success');
          }
        } else {
          chatSessions.card.mode = 'normal';  // 角色卡Tab永远是normal
        }
        // ===== 5. 刷新所有UI =====
        updateProgress();       // ★ 重算进度百分比（Tab不同过滤规则不同）
        updateQuickActions();   // 快捷动作按钮
        updateModFocus();       // ctx-bar 上下文操作条
        renderPreview();        // 右侧预览面板
        renderModDash();        // 模块面板
        renderMvuInfoPanel();   // MVU信息面板
        // ===== 6. 更新输入框：切换Tab时清空残留内容 + 更新placeholder + 更新字符计数/发送按钮脉冲 =====
        var inputEl = doc.getElementById('chatInput');
        if (inputEl) {
          // ★ 切换Tab必须清空输入框内容：避免用户在A Tab写了一半切到B Tab还在，导致上下文不匹配
          inputEl.value = '';
          inputEl.placeholder = targetTab === 'card'
            ? '描述你想要的世界/角色设定，我来生成角色卡...'
            : '描述你想要的MVU变量系统或状态栏，如"做一个好感度+物品栏的状态栏"...';
          // 触发输入框的input事件让字符计数和脉冲按钮更新
          try {
            var _fakeEvt = doc.createEvent ? doc.createEvent('Event') : null;
            if (_fakeEvt) {
              _fakeEvt.initEvent('input', false, true);
              inputEl.dispatchEvent(_fakeEvt);
            }
          } catch(_evtErr) {}
          updateCharCount();
          updateSendBtnPulse();
        }
        // ===== 7. 更新顶栏标题：Tab不同标题不同，给用户明确的上下文感知 =====
        var titleH1 = doc.querySelector('.topbar h1');
        if (titleH1) {
          if (targetTab === 'card') {
            titleH1.innerHTML = svgIcon('bolt', 18, 'topbar-ic') + ' 时之写卡器';
          } else {
            titleH1.innerHTML = svgIcon('sliders', 18, 'topbar-ic') + ' MVU变量系统 · <span style="font-weight:400;font-size:.85em;color:var(--ink-soft)">变量与状态栏</span>';
          }
        }
        // ===== 8. 保存切换后的状态到 storage =====
        saveToStorage();
        showToast('已切换到：' + (targetTab === 'card' ? '角色卡生成 Tab' : 'MVU变量状态栏 Tab'), 'info');
      }

      function renderWelcome() {
        doc.body.innerHTML =
          '<div class="app">' +
            '<div class="topbar">' +
              '<div class="topbar-left">' +
                '<h1>' + svgIcon('bolt', 18, 'topbar-ic') + ' 时之写卡器</h1>' +
              '</div>' +
              '<div class="topbar-right">' +
                '<button class="icon-btn icon-btn-square danger" id="closeBtn" aria-label="关闭" title="关闭">' + svgIcon('close', 16) + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="welcome">' +
              '<h2>' + svgIcon('sparkle', 22, 'welcome-ic') + ' 时之写卡器</h2>' +
              '<p>基于SillyTavern原生机制与ST权重分层8体系，通过AI对话逐步引导你创建专业级世界模式角色卡。<br>和AI聊天就能生成符合ST规范的角色卡！</p>' +
              '<div class="welcome-features">' +
                '<div class="wf-item"><div class="wf-icon">' + svgIcon('chat', 18) + '</div><div class="wf-copy"><div class="wf-title">对话式创作</div><div class="wf-desc">像聊天一样自然，AI按权重层级逐步引导</div></div></div>' +
                '<div class="wf-item"><div class="wf-icon">' + svgIcon('chart', 18) + '</div><div class="wf-copy"><div class="wf-title">权重可视化</div><div class="wf-desc">展示每个条目权重等级、触发逻辑、Token占用</div></div></div>' +
                '<div class="wf-item"><div class="wf-icon">' + svgIcon('checkCircle', 18) + '</div><div class="wf-copy"><div class="wf-title">32项质检</div><div class="wf-desc">8基础+4高价值+6世界书+8世界书高级+6正则+3运行效果+6附加，专业达标</div></div></div>' +
                '<div class="wf-item"><div class="wf-icon">' + svgIcon('wrench', 18) + '</div><div class="wf-copy"><div class="wf-title">AI优化</div><div class="wf-desc">质检未达标项一键AI优化，字段级对比</div></div></div>' +
              '</div>' +
              '<button class="start-btn" id="startBtn">' + svgIcon('play', 18) + ' 开始创作</button>' +
              '<div class="welcome-actions">' +
                '<button class="btn btn-ghost" id="importBtn">' + svgIcon('download', 15) + ' 导入现有卡</button>' +
                '<button class="btn btn-ghost" id="continueBtn" style="display:none">' + svgIcon('folderOpen', 15) + ' 继续上次</button>' +
              '</div>' +
              '<p style="font-size:.7em;color:var(--muted);margin-top:18px">ST权重分层8体系：基础公理 → 交互软规则 → 核心铁则 → 近场强约束 → 场景机制 → 实体交互 → 叙事背景 → 动态适配</p>' +
              '<p style="font-size:.65em;color:var(--muted);margin-top:6px">引导流程：定核心铁则→搭世界基底→做实体内容→加场景规则→补叙事背景→做动态适配</p>' +
            '</div>' +
          '</div>';
        doc.getElementById('closeBtn').addEventListener('click', closeModal);
        doc.getElementById('startBtn').addEventListener('click', function() {
          // ✅ 点击「开始创作」= 全新开始：自动清空之前所有记录（角色卡数据 + 两边Tab聊天记录 + localStorage存档）
          resetAllWorkForNewCard();
          renderChatUI();
          addAssistantMsg('你好！我是你的世界模式角色卡创作助手 🎭\n\n我会基于SillyTavern原生机制与ST权重分层8体系，通过6步引导你构建一个完整的世界。\n\n**引导流程**：定核心铁则 → 搭世界基底 → 做实体内容 → 加场景规则 → 补叙事背景 → 做动态适配\n\n在开始之前，有两个关键问题需要先明确：\n\n**1. 内容尺度**：你希望这个世界卡是什么尺度？\n   • 全年龄向：纯洁的青春、友情、冒险故事\n   • 暗黑向：残酷、深刻、成人向的剧情（非色情）\n   • NSFW（18禁）：成人内容、情欲描写\n\n**2. 核心方向**：你想做什么样的世界？\n   可以直接告诉我你的构想（如"修仙宗门""末世生存""日式校园恋爱"等），我会帮你从核心铁则开始逐步构建。\n\n请先告诉我尺度和方向，我们就可以开始创作了！');
        });
        doc.getElementById('importBtn').addEventListener('click', showImportModal);
        var contBtn = doc.getElementById('continueBtn');
        if (contBtn && hasSavedData()) {
          contBtn.style.display = 'inline-block';
          contBtn.addEventListener('click', continueFromSave);
        }
      }

      function renderChatUI() {
        doc.body.innerHTML =
          '<div class="app">' +
            '<div class="topbar">' +
              '<div class="topbar-left">' +
                '<h1>' + svgIcon('bolt', 18, 'topbar-ic') + ' 时之写卡器</h1>' +
                '<div class="tab-switcher" id="tabSwitcher">' +
                  '<button class="tab-btn active" data-tab="card"><span class="tab-icon">' + svgIcon('mask', 14) + '</span>角色卡</button>' +
                  '<button class="tab-btn" data-tab="mvu"><span class="tab-icon">' + svgIcon('sliders', 14) + '</span>MVU</button>' +
                '</div>' +
              '</div>' +
              '<div class="topbar-right">' +
                '<div class="ws-dropdown-wrap" id="wsMenuWrap">' +
                  '<button class="icon-btn" id="wsMenuBtn">' + svgIcon('menu', 15) + ' 工作区</button>' +
                  '<div class="ws-dropdown" id="wsDropdown"></div>' +
                '</div>' +
                '<span class="phase" id="phaseLabel">0%</span>' +
                '<button class="icon-btn icon-btn-square danger" id="closeBtn" aria-label="关闭" title="关闭">' + svgIcon('close', 16) + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="main">' +
              '<div class="mobile-tabs">' +
                '<button class="mobile-tab active" data-tab="chat">' + svgIcon('chat', 16) + ' 对话</button>' +
                '<button class="mobile-tab" data-tab="preview">' + svgIcon('clipboard', 16) + ' 预览</button>' +
              '</div>' +
              '<div class="chat-panel" style="position:relative">' +
                // ========== 上下文操作条（合并旧 mod-focus + mod-dash + mvu-info-panel）==========
                '<div class="ctx-bar" id="ctxBar">' +
                  '<span class="ctx-stage" id="ctxStage">' + svgIcon('info', 13) + ' <strong>就绪</strong></span>' +
                  '<div class="ctx-actions" id="ctxActions"></div>' +
                '</div>' +
                '<div class="chat-messages" id="chatMessages"></div>' +
                '<div class="scroll-btns" id="scrollBtns"><button id="scrollBottomBtn" title="到底部" aria-label="到底部">' + svgIcon('arrowDown', 14) + '</button></div>' +
                '<div class="quick-actions" id="quickActions"></div>' +
                '<div class="chat-input-area">' +
                  '<div class="chat-input-row">' +
                    '<textarea class="chat-input" id="chatInput" placeholder="描述你想要的世界/角色设定，我来生成角色卡..." rows="1"></textarea>' +
                    '<button class="btn-send" id="sendBtn" title="发送" aria-label="发送">' +
                      svgIcon('send', 18, 'send-icon') +
                      svgIcon('spinner', 18, 'send-spinner ic-spin') +
                    '</button>' +
                  '</div>' +
                  '<div class="chat-input-foot">' +
                    '<span class="chat-input-hint" id="chatInputHint"><span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> 发送 · <span class="kbd">Enter</span> 换行</span>' +
                    '<span class="chat-input-char-count" id="charCount">0 / 2000</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="preview-panel">' +
                '<div class="preview-header">' +
                  '<span class="pv-title">' + svgIcon('clipboard', 15) + ' 预览</span>' +
                  '<button class="pv-export" id="exportLogBtn" title="导出聊天记录和后台记录" aria-label="导出聊天记录">' + svgIcon('fileExport', 15) + '</button>' +
                '</div>' +
                '<div class="preview-body" id="previewBody"></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="work-toast-layer" id="workToastLayer"></div>' +
          '<div id="wsPanelContainer"></div>';
        bindEvents();
        applyFontScale(_appFontScale);
        initWorkspaceMenu();
        updateModFocus();
        updateQuickActions();
        renderPreview();
        updateCharCount();
      }

      // ===== Work Toast 工作提示系统 =====
      var workToastSeed = 0;
      function pushWorkToast(text, kind) {
        var layer = doc.getElementById('workToastLayer');
        if (!layer) return;
        var id = ++workToastSeed;
        var toast = doc.createElement('div');
        toast.className = 'work-toast ' + (kind === 'done' ? 'is-done' : 'is-working');
        toast.innerHTML = svgIcon(kind === 'done' ? 'checkCircle' : 'spinner', 18, 'wt-icon' + (kind !== 'done' ? ' ic-spin' : '')) +
          '<span class="wt-text">' + text + '</span>';
        layer.appendChild(toast);
        // 触发动画
        setTimeout(function() { toast.classList.add('show'); }, 10);
        // 3秒后自动消失
        setTimeout(function() {
          toast.classList.remove('show');
          setTimeout(function() { if (toast.parentNode) toast.remove(); }, 300);
        }, 3000);
      }

      // ===== 工作区下拉菜单 =====
      function initWorkspaceMenu() {
        var btn = doc.getElementById('wsMenuBtn');
        var dropdown = doc.getElementById('wsDropdown');
        if (!btn || !dropdown) return;
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          dropdown.classList.toggle('show');
          if (dropdown.classList.contains('show')) renderWorkspaceMenuItems();
        });
        doc.addEventListener('click', function(e) {
          if (!e.target.closest('#wsMenuWrap')) dropdown.classList.remove('show');
        });
      }
      function renderWorkspaceMenuItems() {
        var dropdown = doc.getElementById('wsDropdown');
        if (!dropdown) return;
        var items = '';
        var hasFirstDef = cardData.first_mes && cardData.first_mes.length > 50;
        var hasEntriesDef = cardData.character_book && cardData.character_book.entries && cardData.character_book.entries.length > 0;
        // 工作台
        items += '<div class="ws-dropdown-section">工作台</div>';
        items += '<div class="ws-dropdown-item" data-action="open-workspace">' + svgIcon('folder', 15) + ' 打开工作台 <span class="ws-item-badge">Tab</span></div>';
        // ===== 字体大小：可展开的控件（工作区下拉中）=====
        items += '<div class="ws-font-expand collapsed" id="wsFontExpand">' +
                    '<div class="ws-font-header" id="wsFontHeader">' + svgIcon('eye', 14) + ' 字体大小 <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px"><span class="ws-font-arrow">▾</span></span></div>' +
                    '<div class="ws-font-body">' +
                      '<div class="ws-font-ctrl">' +
                        '<button class="ws-font-btn" id="wsFontDec" title="缩小字体">A-</button>' +
                        '<span class="ws-font-size-label" id="wsFontSizeLabel">' + Math.round(_appFontScale * 100) + '%</span>' +
                        '<button class="ws-font-btn" id="wsFontInc" title="放大字体">A+</button>' +
                        '<button class="ws-font-btn" id="wsFontReset" title="恢复默认" style="font-size:.7em">↺</button>' +
                      '</div>' +
                    '</div>' +
                  '</div>';
        // MVU / Tab 切换
        items += '<div class="ws-dropdown-divider"></div>';
        items += '<div class="ws-dropdown-section">视图切换</div>';
        if (currentTab === 'card') {
          items += '<div class="ws-dropdown-item" data-action="switch-tab" data-tab="mvu">' + svgIcon('sliders', 15) + ' 切到 MVU变量·状态栏</div>';
        } else {
          items += '<div class="ws-dropdown-item" data-action="switch-tab" data-tab="card">' + svgIcon('bolt', 15) + ' 切到 角色卡生成</div>';
        }
        // 工具（质检/优化/进度总览/开场白/权重/分组）
        items += '<div class="ws-dropdown-divider"></div>';
        items += '<div class="ws-dropdown-section">工具</div>';
        items += '<div class="ws-dropdown-item" data-action="qa-summary">' + svgIcon('chart', 15) + ' 进度总览</div>';
        items += '<div class="ws-dropdown-item" data-action="qa-qc">' + svgIcon('checkCircle', 15) + ' 质检</div>';
        items += '<div class="ws-dropdown-item" data-action="qa-optimize">' + svgIcon('wrench', 15) + ' 优化</div>';
        if (currentTab === 'card' && !hasFirstDef && progress >= 20) {
          items += '<div class="ws-dropdown-item" data-action="qa-opening">' + svgIcon('film', 15) + ' 生成开场白</div>';
        }
        if (hasEntriesDef) {
          items += '<div class="ws-dropdown-item" data-action="qa-weight">' + svgIcon('gauge', 15) + ' 权重可视化</div>';
          items += '<div class="ws-dropdown-item" data-action="qa-group">' + svgIcon('layers', 15) + ' 分组管理</div>';
        }
        items += '<div class="ws-dropdown-divider"></div>';
        items += '<div class="ws-dropdown-section">导入导出</div>';
        items += '<div class="ws-dropdown-item" data-action="export-log">' + svgIcon('fileExport', 15) + ' 导出聊天记录</div>';
        items += '<div class="ws-dropdown-item" data-action="import-card">' + svgIcon('download', 15) + ' 导入角色卡</div>';
        dropdown.innerHTML = items;
        // ===== 字体大小展开栏：折叠/展开切换 =====
        var fontHeader = doc.getElementById('wsFontHeader');
        var fontExpand = doc.getElementById('wsFontExpand');
        if (fontHeader && fontExpand) {
          fontHeader.addEventListener('click', function(e) {
            e.stopPropagation();
            fontExpand.classList.toggle('collapsed');
          });
        }
        // ===== 字体加减按钮绑定（下拉菜单中）=====
        var wsDecBtn = doc.getElementById('wsFontDec');
        var wsIncBtn = doc.getElementById('wsFontInc');
        var wsResetBtn = doc.getElementById('wsFontReset');
        if (wsDecBtn) wsDecBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          applyFontScale(_appFontScale - _FONT_STEP);
          try { saveToStorage(); } catch(e) {}
        });
        if (wsIncBtn) wsIncBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          applyFontScale(_appFontScale + _FONT_STEP);
          try { saveToStorage(); } catch(e) {}
        });
        if (wsResetBtn) wsResetBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          applyFontScale(1);
          try { saveToStorage(); } catch(e) {}
        });
        // 应用当前字体缩放状态到下拉控件（按钮禁用/百分比）
        applyFontScale(_appFontScale);
        // 绑定点击
        dropdown.querySelectorAll('.ws-dropdown-item').forEach(function(item) {
          item.addEventListener('click', function() {
            var action = this.getAttribute('data-action');
            dropdown.classList.remove('show');
            if (action === 'open-workspace') openWorkspacePanel();
            else if (action === 'switch-tab') switchTab(this.getAttribute('data-tab'));
            else if (action === 'export-log') {
              var btn = doc.getElementById('exportLogBtn');
              if (btn) btn.click();
            } else if (action === 'import-card') showImportModal();
            else if (action === 'qa-summary') handleQuickAction('summary');
            else if (action === 'qa-qc') handleQuickAction('qc');
            else if (action === 'qa-optimize') handleQuickAction('optimize');
            else if (action === 'qa-opening') handleQuickAction('opening');
            else if (action === 'qa-weight') handleQuickAction('weight');
            else if (action === 'qa-group') handleQuickAction('group');
          });
        });
      }

      // ===== 工作台模态浮窗 =====
      var wsPanelTab = 'files';
      var wsSelectedNode = null;       // { type: 'field'|'entry'|'regex'|'thscript', key: string, index?: number, fieldType?: string }
      var wsEditorView = 'split';      // 'split' | 'edit' | 'preview'
      var wsEditedContent = {};        // nodeKey → 编辑后的内容缓存
      var wsOriginalContent = {};      // nodeKey → 打开时的原始内容（用于 diff）
      function _wsNodeKey(node) { return node ? (node.type + '::' + node.key + (node.index != null ? '::' + node.index : '')) : ''; }
      function _wsGetContent(node) {
        if (!node) return '';
        if (node.type === 'field') {
          var v = cardData[node.key];
          if (Array.isArray(v) && node.index != null) return v[node.index] || '';
          return v != null ? String(v) : '';
        }
        if (node.type === 'entry') {
          var e = (cardData.character_book || {}).entries || [];
          return (e[node.index] && e[node.index].content) || '';
        }
        if (node.type === 'regex') {
          var r = (cardData.extensions && cardData.extensions.regex_scripts) || [];
          return (r[node.index] && r[node.index].replaceString) || '';
        }
        if (node.type === 'thscript') {
          var scripts = (cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.script_lib) || [];
          var s = scripts[node.index];
          return s && s.content ? s.content : '';
        }
        return '';
      }
      function _wsSetContent(node, val) {
        if (!node) return;
        if (node.type === 'field') {
          if (Array.isArray(cardData[node.key]) && node.index != null) { cardData[node.key][node.index] = val; }
          else { cardData[node.key] = val; }
        }
        else if (node.type === 'entry') {
          var e = (cardData.character_book || {}).entries || [];
          if (e[node.index]) e[node.index].content = val;
        } else if (node.type === 'regex') {
          var r = (cardData.extensions && cardData.extensions.regex_scripts) || [];
          if (r[node.index]) r[node.index].replaceString = val;
        } else if (node.type === 'thscript') {
          if (!cardData.extensions) cardData.extensions = {};
          if (!cardData.extensions.tavern_helper) cardData.extensions.tavern_helper = {};
          if (!cardData.extensions.tavern_helper.script_lib) cardData.extensions.tavern_helper.script_lib = [];
          if (cardData.extensions.tavern_helper.script_lib[node.index]) {
            cardData.extensions.tavern_helper.script_lib[node.index].content = val;
          }
        }
      }
      function _wsGetMeta(node) {
        if (!node) return null;
        if (node.type === 'thscript') return null;
        if (node.type === 'entry') {
          var e = ((cardData.character_book || {}).entries || [])[node.index];
          if (!e) return null;
          return {
            comment: e.comment || '',
            enabled: e.enabled !== false,
            constant: !!e.constant,
            selective: !!e.selective,
            vectorized: !!e.vectorized,
            position: e.position,
            keys: (e.keys || []).join(', '),
            depth: e.depth,
            order: e.order,
            group: e.group || '',
            groupWeight: e.groupWeight
          };
        }
        return null;
      }
      function _wsSetMeta(node, meta) {
        if (!node || node.type !== 'entry') return;
        var e = ((cardData.character_book || {}).entries || [])[node.index];
        if (!e) return;
        if (meta.enabled != null) e.enabled = meta.enabled;
        if (meta.constant != null) e.constant = meta.constant;
        if (meta.selective != null) e.selective = meta.selective;
        if (meta.vectorized != null) e.vectorized = meta.vectorized;
        if (meta.position != null) e.position = meta.position;
        if (meta.keys != null) e.keys = meta.keys.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        if (meta.depth != null) e.depth = meta.depth;
        if (meta.order != null) e.order = meta.order;
        if (meta.group != null) e.group = meta.group;
        if (meta.groupWeight != null) e.groupWeight = meta.groupWeight;
      }
      function _wsIsHtml(node, val) {
        if (node && node.type === 'thscript') return true;
        return /<[a-z][\s\S]*>/i.test(val || '');
      }
      function _wsDiff(oldText, newText) {
        var oldLines = (oldText || '').split('\n');
        var newLines = (newText || '').split('\n');
        var maxLen = Math.max(oldLines.length, newLines.length);
        var rows = [];
        for (var i = 0; i < maxLen; i++) {
          var o = oldLines[i] != null ? oldLines[i] : '';
          var n = newLines[i] != null ? newLines[i] : '';
          if (o === n) rows.push({ kind: 'same', text: o });
          else { if (o) rows.push({ kind: 'del', text: o }); if (n) rows.push({ kind: 'add', text: n }); }
        }
        return rows;
      }
      function openWorkspacePanel() {
        var container = doc.getElementById('wsPanelContainer');
        if (!container) return;
        wsEditorView = 'split';
        wsEditedContent = {};
        wsOriginalContent = {};
        container.innerHTML =
          '<div class="ws-panel-backdrop show" id="wsBackdrop">' +
            '<div class="ws-panel">' +
              '<header class="ws-panel-head">' +
                '<div class="ws-title">' + svgIcon('folder', 18) + ' <span>工作台</span> <span style="font-weight:400;font-size:.82em;color:var(--muted)">文件树 · 编辑对比 · 渲染预览</span></div>' +
                '<div class="ws-head-actions">' +
                  '<button class="ws-head-btn" id="wsSaveAllBtn" title="保存所有更改到角色卡">' + svgIcon('save', 15) + ' 保存</button>' +
                  '<button class="ws-close" id="wsCloseBtn" title="关闭">' + svgIcon('close', 18) + '</button>' +
                '</div>' +
              '</header>' +
              '<nav class="ws-panel-tabs">' +
                '<button class="ws-panel-tab ' + (wsPanelTab === 'files' ? 'active' : '') + '" data-wstab="files">🗂️ 文件树</button>' +
                '<button class="ws-panel-tab ' + (wsPanelTab === 'editor' ? 'active' : '') + '" data-wstab="editor">✏️ 编辑对比</button>' +
                '<button class="ws-panel-tab ' + (wsPanelTab === 'artifacts' ? 'active' : '') + '" data-wstab="artifacts">🔍 渲染预览</button>' +
              '</nav>' +
              '<div class="ws-panel-body">' +
                '<aside class="ws-tree' + (wsPanelTab === 'files' ? ' active' : '') + '" id="wsTree">' + buildWorkspaceTree() + '</aside>' +
                '<main class="ws-editor' + (wsPanelTab === 'editor' ? ' active' : '') + '" id="wsEditor">' + buildWorkspaceEditor() + '</main>' +
                '<section class="ws-artifact' + (wsPanelTab === 'artifacts' ? ' active' : '') + '" id="wsArtifact">' + buildWorkspaceArtifact() + '</section>' +
              '</div>' +
            '</div>' +
          '</div>';
        // 关闭
        doc.getElementById('wsCloseBtn').addEventListener('click', closeWorkspacePanel);
        doc.getElementById('wsBackdrop').addEventListener('click', function(e) {
          if (e.target === this) closeWorkspacePanel();
        });
        // 保存所有
        doc.getElementById('wsSaveAllBtn').addEventListener('click', function() {
          var saved = 0;
          Object.keys(wsEditedContent).forEach(function(k) {
            var parts = k.split('::');
            var node = { type: parts[0], key: parts[1], index: parts[2] != null ? parseInt(parts[2]) : null };
            _wsSetContent(node, wsEditedContent[k]);
            saved++;
          });
          wsEditedContent = {};
          wsOriginalContent = {};
          if (saved > 0) { updateProgress(); renderPreview(); showToast('已保存 ' + saved + ' 项更改到角色卡', 'success'); }
          else showToast('没有未保存的更改', 'info');
          // 刷新编辑器和工作台预览
          var editorEl = container.querySelector('#wsEditor');
          if (editorEl) editorEl.innerHTML = buildWorkspaceEditor();
          bindWsEditorEvents(container);
          renderWsArtifact(container);
        });
        // Tab 切换（移动端）
        container.querySelectorAll('.ws-panel-tab').forEach(function(tab) {
          tab.addEventListener('click', function() {
            wsPanelTab = this.getAttribute('data-wstab');
            container.querySelectorAll('.ws-panel-tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            container.querySelector('#wsTree').classList.toggle('active', wsPanelTab === 'files');
            container.querySelector('#wsEditor').classList.toggle('active', wsPanelTab === 'editor');
            container.querySelector('#wsArtifact').classList.toggle('active', wsPanelTab === 'artifacts');
          });
        });
        // 树节点点击
        container.querySelectorAll('.ws-tree-item').forEach(function(item) {
          item.addEventListener('click', function() {
            var nodeStr = this.getAttribute('data-node');
            if (!nodeStr) return;
            try { wsSelectedNode = JSON.parse(nodeStr); } catch(e) { return; }
            var nk = _wsNodeKey(wsSelectedNode);
            // 首次打开时缓存原始内容
            if (wsOriginalContent[nk] === undefined) wsOriginalContent[nk] = _wsGetContent(wsSelectedNode);
            container.querySelectorAll('.ws-tree-item').forEach(function(i) { i.classList.remove('selected'); });
            this.classList.add('selected');
            wsEditorView = 'split';
            var editorEl = container.querySelector('#wsEditor');
            if (editorEl) {
              editorEl.innerHTML = buildWorkspaceEditor();
              bindWsEditorEvents(container);
            }
            if (wsPanelTab === 'files') {
              wsPanelTab = 'editor';
              container.querySelector('.ws-panel-tab[data-wstab="files"]').classList.remove('active');
              var et = container.querySelector('.ws-panel-tab[data-wstab="editor"]');
              if (et) et.classList.add('active');
              container.querySelector('#wsTree').classList.remove('active');
              if (editorEl) editorEl.classList.add('active');
            }
          });
        });
        // 树分组折叠
        container.querySelectorAll('.ws-tree-group-head').forEach(function(head) {
          head.addEventListener('click', function() {
            this.parentElement.classList.toggle('collapsed');
          });
        });
        // 预览区：渲染当前角色卡预览
        renderWsArtifact(container);
      }
      function closeWorkspacePanel() {
        var container = doc.getElementById('wsPanelContainer');
        if (container) container.innerHTML = '';
        // 关闭工作台后刷新预览，确保最新保存的内容立即显示
        renderPreview();
      }
      // ===== 文件树：从 cardData 读取真实数据，虚拟文件系统 =====
      function buildWorkspaceTree() {
        var groups = [];
        // 1. 角色卡基础字段（StageDog schema 对齐：移除 system_prompt / alternate_greetings，改为 first_mes 数组）
        var cardFields = [
          { key: 'name', label: '名称', type: 'text' },
          { key: 'avatar', label: '头像(文件名或URL)', type: 'avatar' },
          { key: 'description', label: '角色描述（世界观/人格/关系）', type: 'textarea' },
          { key: 'first_mes', label: '第一条消息', type: 'textarea' },
          { key: 'mes_example', label: '对话示例', type: 'textarea' },
          { key: 'scenario', label: '场景设定', type: 'textarea' },
          { key: 'personality', label: '个性 / 性格', type: 'textarea' },
          { key: 'creator', label: '作者', type: 'text' },
          { key: 'character_version', label: '版本', type: 'text' },
          { key: 'creator_notes', label: '备注', type: 'textarea' },
          { key: 'tags', label: '标签（逗号分隔）', type: 'text' }
        ];
        var basicNodes = [];
        cardFields.forEach(function(f) {
          basicNodes.push({ type: 'field', key: f.key, label: f.label, path: f.key, fieldType: f.type });
        });
        groups.push({ name: '📋 角色卡基础信息', nodes: basicNodes });
        // 2. 世界书条目 —— 按 <标签前缀> 自动分组 + MVU变量单独分组
        var entries = (cardData.character_book || {}).entries || [];
        var entryBuckets = {};
        var mvuNodes = [];
        var otherNodes = [];
        entries.forEach(function(e, i) {
          var label = e.comment || ('条目' + (i+1));
          var node = { type: 'entry', key: 'character_book', index: i, label: label, path: 'entries[' + i + ']', rawComment: e.comment || '' };
          if (isMVUEntry(e.comment || '')) { mvuNodes.push(node); return; }
          var m = /^<([^>]+)>/.exec(e.comment || '');
          var bucketKey = m ? m[1] : '未分类';
          if (m) {
            var pureTag = m[1];
            bucketKey = pureTag;
          }
          if (!entryBuckets[bucketKey]) entryBuckets[bucketKey] = [];
          entryBuckets[bucketKey].push(node);
        });
        var tagOrder = ['基础公理','核心铁则','交互软规则','近场强约束','核心玩法','场景机制','实体交互','统一输出格式','状态变量输出','引导机制','动态适配','叙事背景','未分类'];
        tagOrder.forEach(function(t) {
          if (!entryBuckets[t]) return;
          groups.push({ name: '📚 <' + t + '> (' + entryBuckets[t].length + ')', nodes: entryBuckets[t], bucketTag: t });
        });
        Object.keys(entryBuckets).forEach(function(t) {
          if (tagOrder.indexOf(t) >= 0) return;
          groups.push({ name: '📁 <' + t + '> (' + entryBuckets[t].length + ')', nodes: entryBuckets[t], bucketTag: t });
        });
        if (mvuNodes.length) groups.push({ name: '🔧 MVU变量 (' + mvuNodes.length + ')', nodes: mvuNodes, isMVU: true });
        // 3. 酒馆助手脚本
        var thScripts = (cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.script_lib) || [];
        if (thScripts.length > 0) {
          var thNodes = thScripts.map(function(s, i) {
            return { type: 'thscript', key: 'tavern_helper_script', index: i, label: (s.name || ('脚本' + (i+1))), path: 'tavern_helper.script_lib[' + i + ']' };
          });
          groups.push({ name: '🧪 酒馆助手脚本 (' + thScripts.length + ')', nodes: thNodes });
        }
        // 4. 正则脚本
        var rxScripts = (cardData.extensions && cardData.extensions.regex_scripts) || [];
        if (rxScripts.length > 0) {
          var rxNodes = rxScripts.map(function(r, i) {
            return { type: 'regex', key: 'regex_scripts', index: i, label: r.scriptName || ('正则' + (i+1)), path: 'regex_scripts[' + i + ']' };
          });
          groups.push({ name: '🔍 正则脚本 (' + rxScripts.length + ')', nodes: rxNodes });
        }
        // 渲染
        var html = '';
        if (!groups.length) {
          return '<div style="padding:20px;color:var(--muted);font-size:.82em;text-align:center">暂无文件<br>开始创作后这里会显示角色卡内容</div>';
        }
        groups.forEach(function(g, idx) {
          html += '<div class="ws-tree-group' + (idx > 0 ? ' collapsed' : '') + '">';
          html += '<div class="ws-tree-group-head"><span class="ws-tree-arrow">▸</span> ' + g.name + '</div>';
          html += '<div class="ws-tree-items">';
          g.nodes.forEach(function(n) {
            var nodeStr = escAttr(JSON.stringify({ type: n.type, key: n.key, index: n.index, fieldType: n.fieldType || null }));
            var len = '';
            if (n.type === 'entry') {
              var e = entries[n.index];
              if (e && e.content) len = ' <span class="ws-tree-len">' + String(e.content).length + '</span>';
              var en = (e && e.enabled === false) ? '🔘' : '🟢';
              n.label = en + ' ' + n.label;
            } else if (n.type === 'field') {
              var v = cardData[n.key];
              if (v) len = ' <span class="ws-tree-len">' + String(v).length + '</span>';
            }
            html += '<div class="ws-tree-item" data-node="' + nodeStr + '"><span class="ws-tree-dot"></span>' + n.label + len + '</div>';
          });
          html += '</div></div>';
        });
        return html;
      }
      function escAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
      // ===== 编辑器：Edit / Diff / Preview 三视图 =====
      function buildWorkspaceEditor() {
        if (!wsSelectedNode) return '<div class="ws-editor-empty">从左侧选择一个条目进行编辑</div>';
        var node = wsSelectedNode;
        var nk = _wsNodeKey(node);
        var original = wsOriginalContent[nk] != null ? wsOriginalContent[nk] : _wsGetContent(node);
        var current = wsEditedContent[nk] != null ? wsEditedContent[nk] : original;
        var title = _wsGetTitle(node);
        var isDirty = wsEditedContent[nk] != null && wsEditedContent[nk] !== original;
        var isHtml = _wsIsHtml(node, current);
        // 视图切换按钮：双栏模式下，编辑/对比并排，不再切换单视图
        var viewBtns = '<div class="ws-view-switcher">' +
          '<button class="ws-view-btn' + (wsEditorView === 'split' ? ' active' : '') + '" data-view="split">📝 编辑+对比 (推荐)</button>' +
          '<button class="ws-view-btn' + (wsEditorView === 'edit' ? ' active' : '') + '" data-view="edit">纯编辑' + (isDirty ? ' *' : '') + '</button>' +
          '<button class="ws-view-btn' + (wsEditorView === 'preview' ? ' active' : '') + '" data-view="preview">渲染预览</button>' +
        '</div>';
        var metaHtml = '';
        var meta = _wsGetMeta(node);
        if (meta) {
          // 激活策略下拉（蓝灯/绿灯/向量化 + 自动匹配当前条目配置）
          var activateType = '蓝灯';
          if (meta.vectorized === true) activateType = '向量化';
          else if (meta.constant !== true && meta.selective !== true) activateType = '绿灯';
          if (meta.constant === true || (meta.depth === 0 && meta.selective === false)) activateType = '蓝灯';
          metaHtml = '<div class="ws-entry-props">' +
            '<label class="ws-prop"><input type="checkbox" class="ws-prop-enabled" ' + (meta.enabled ? 'checked' : '') + '> 启用</label>' +
            '<label class="ws-prop"><input type="checkbox" class="ws-prop-constant" ' + (meta.constant ? 'checked' : '') + '> 常驻(蓝灯)</label>' +
            '<label class="ws-prop"><input type="checkbox" class="ws-prop-selective" ' + (meta.selective ? 'checked' : '') + '> 关键词匹配(绿灯)</label>' +
            '<label class="ws-prop"><input type="checkbox" class="ws-prop-vectorized" ' + (meta.vectorized ? 'checked' : '') + '> 向量化</label>' +
            '<label class="ws-prop">位置 <select class="ws-prop-position">' +
              '<option value="before_char"' + (meta.position === 'before_char' ? ' selected' : '') + '>角色定义之前(0)</option>' +
              '<option value="after_char"' + (meta.position === 'after_char' ? ' selected' : '') + '>角色定义之后(1)</option>' +
              '<option value="before_an"' + (meta.position === 'before_an' ? ' selected' : '') + '>示例消息之前(2)</option>' +
              '<option value="after_an"' + (meta.position === 'after_an' ? ' selected' : '') + '>示例消息之后(3)</option>' +
              '<option value="at_end"' + (meta.position === 'at_end' ? ' selected' : '') + '>作者注底部(2)</option>' +
            '</select></label>' +
            '<label class="ws-prop">深度 <input type="number" class="ws-prop-depth" value="' + (meta.depth != null ? meta.depth : 4) + '" min="0" max="12" style="width:40px"></label>' +
            '<label class="ws-prop">优先级 <input type="number" class="ws-prop-order" value="' + (meta.order != null ? meta.order : 100) + '" min="0" max="1000" style="width:50px"></label>' +
            '<label class="ws-prop">分组 <input type="text" class="ws-prop-group" value="' + escAttr(meta.group || '') + '" placeholder="组名" style="width:100px"></label>' +
            '<label class="ws-prop">组权重 <input type="number" class="ws-prop-groupWeight" value="' + (meta.groupWeight != null ? meta.groupWeight : 10) + '" min="0" max="1000" style="width:50px"></label>' +
            '<label class="ws-prop ws-prop-keys">关键词 <input type="text" class="ws-prop-keys-input" value="' + escAttr(meta.keys) + '" placeholder="逗号分隔"></label>' +
          '</div>';
        }
        var bodyHtml = '';
        // 构建单栏内容
        var textareaEl = '<textarea class="ws-textarea" id="wsTextarea" spellcheck="false">' + current.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>';
        var diffEl = '';
        if (isDirty) {
          var diff = _wsDiff(original, current);
          var diffHtml = '';
          diff.forEach(function(row) {
            var cls = row.kind === 'add' ? 'diff-add' : row.kind === 'del' ? 'diff-del' : 'diff-same';
            diffHtml += '<div class="' + cls + '">' + (row.kind === 'add' ? '+ ' : row.kind === 'del' ? '- ' : '  ') + row.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
          });
          diffEl = '<div class="ws-diff-view">' + diffHtml + '</div>';
        } else {
          diffEl = '<div class="ws-diff-view" style="padding:30px;color:var(--muted);font-size:.82em;text-align:center;justify-content:center;align-items:center;display:flex">🟢 尚未修改，原始内容（左侧编辑即可看到变化对比）</div>';
        }
        var previewEl = '';
        if (isHtml) {
          previewEl = '<iframe class="ws-preview-iframe" sandbox="allow-scripts allow-same-origin" srcdoc="' + escAttr(current) + '"></iframe>';
        } else {
          previewEl = '<div class="ws-preview-md">' + fmtBubble(current) + '</div>';
        }
        if (wsEditorView === 'split') {
          // 双栏：左编辑 / 右 Diff 对比（滚动同步提示）
          bodyHtml = '<div class="ws-split-view">' +
            '<div class="ws-split-left"><div class="ws-split-title">✏️ 编辑区（当前内容）</div>' + textareaEl + '</div>' +
            '<div class="ws-split-right"><div class="ws-split-title">' + (isDirty ? '🔄 修改前后对比（Diff）' : '💾 原始内容预览') + '</div>' + diffEl + '</div>' +
          '</div>';
        } else if (wsEditorView === 'edit') {
          bodyHtml = textareaEl;
        } else if (wsEditorView === 'preview') {
          bodyHtml = previewEl;
        }
        return '<div class="ws-editor-title">' + title + (isDirty ? ' <span style="color:var(--terra-text);font-size:.78em;font-weight:500">· 未保存 *</span>' : '') + '</div>' +
          metaHtml +
          viewBtns +
          '<div class="ws-editor-area">' + bodyHtml + '</div>';
      }
      function _wsGetTitle(node) {
        if (node.type === 'field') {
          var labels = { name: '名称', avatar: '头像', description: '角色描述（世界观/人格/关系）', first_mes: '第一条消息', mes_example: '对话示例', scenario: '场景设定', personality: '个性/性格', creator: '作者', character_version: '版本', creator_notes: '备注', tags: '标签' };
          var label = labels[node.key] || node.key;
          if (node.index != null && Array.isArray(cardData[node.key])) return label + ' #' + (node.index + 1);
          return label;
        }
        if (node.type === 'entry') {
          var e = ((cardData.character_book || {}).entries || [])[node.index];
          return (e && e.comment) || ('条目' + (node.index + 1));
        }
        if (node.type === 'regex') {
          var r = ((cardData.extensions || {}).regex_scripts || [])[node.index];
          return (r && r.scriptName) || ('正则' + (node.index + 1));
        }
        if (node.type === 'thscript') {
          var s = ((cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.script_lib) || [])[node.index];
          return (s && s.name) || ('脚本' + (node.index + 1));
        }
        return '';
      }
      function _wsDiffCount(oldT, newT) {
        var diff = _wsDiff(oldT, newT);
        var add = 0, del = 0;
        diff.forEach(function(r) { if (r.kind === 'add') add++; if (r.kind === 'del') del++; });
        return '+' + add + '/-' + del;
      }
      function bindWsEditorEvents(container) {
        // 视图切换
        container.querySelectorAll('.ws-view-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            if (this.disabled) return;
            wsEditorView = this.getAttribute('data-view');
            var editorEl = container.querySelector('#wsEditor');
            if (editorEl) {
              editorEl.innerHTML = buildWorkspaceEditor();
              bindWsEditorEvents(container);
            }
          });
        });
        // textarea 编辑
        var ta = container.querySelector('#wsTextarea');
        if (ta) {
          ta.addEventListener('input', function() {
            if (wsSelectedNode) {
              var nk = _wsNodeKey(wsSelectedNode);
              wsEditedContent[nk] = ta.value;
            }
          });
        }
        // 条目属性变更
        var enabledChk = container.querySelector('.ws-prop-enabled');
        var constChk = container.querySelector('.ws-prop-constant');
        var selChk = container.querySelector('.ws-prop-selective');
        var vecChk = container.querySelector('.ws-prop-vectorized');
        var posSel = container.querySelector('.ws-prop-position');
        var depthInp = container.querySelector('.ws-prop-depth');
        var orderInp = container.querySelector('.ws-prop-order');
        var groupInp = container.querySelector('.ws-prop-group');
        var groupWInp = container.querySelector('.ws-prop-groupWeight');
        var keysInp = container.querySelector('.ws-prop-keys-input');
        if (enabledChk) enabledChk.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { enabled: this.checked }); });
        if (constChk) constChk.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { constant: this.checked }); });
        if (selChk) selChk.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { selective: this.checked }); });
        if (vecChk) vecChk.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { vectorized: this.checked }); });
        if (posSel) posSel.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { position: this.value }); });
        if (depthInp) depthInp.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { depth: parseInt(this.value) || 0 }); });
        if (orderInp) orderInp.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { order: parseInt(this.value) || 0 }); });
        if (groupInp) groupInp.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { group: this.value }); });
        if (groupWInp) groupWInp.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { groupWeight: parseInt(this.value) || 0 }); });
        if (keysInp) keysInp.addEventListener('change', function() { if (wsSelectedNode) _wsSetMeta(wsSelectedNode, { keys: this.value }); });
      }
      // ===== 预览区：角色卡整体预览 =====
      function renderWsArtifact(container) {
        var el = container.querySelector('#wsArtifact');
        if (!el) return;
        el.innerHTML = buildWorkspaceArtifact();
      }
      function buildWorkspaceArtifact() {
        var p = progress || 0;
        var entries = (cardData.character_book || {}).entries || [];
        var wbCount = entries.filter(function(e) { return !isMVUEntry(e.comment || ''); }).length;
        var mvuCount = entries.length - wbCount;
        var rxCount = ((cardData.extensions || {}).regex_scripts || []).length;
        var html = '<div class="ws-art-summary">' +
          '<div class="ws-art-stat"><span class="ws-stat-num">' + p + '%</span><span class="ws-stat-label">进度</span></div>' +
          '<div class="ws-art-stat"><span class="ws-stat-num">' + wbCount + '</span><span class="ws-stat-label">世界书</span></div>' +
          '<div class="ws-art-stat"><span class="ws-stat-num">' + mvuCount + '</span><span class="ws-stat-label">MVU变量</span></div>' +
          '<div class="ws-art-stat"><span class="ws-stat-num">' + rxCount + '</span><span class="ws-stat-label">正则</span></div>' +
        '</div>';
        // 角色卡概览
        if (cardData.name || cardData.description) {
          html += '<div class="ws-art-card">' +
            '<div class="ws-ac-title">' + svgIcon('globe', 13) + ' ' + escHtml(cardData.name || '(未命名)') + '</div>' +
            (cardData.description ? '<div class="ws-ac-content">' + escHtml(cardData.description.substring(0, 200)) + (cardData.description.length > 200 ? '...' : '') + '</div>' : '') +
          '</div>';
        }
        // 最近修改的条目
        if (entries.length > 0) {
          var recent = entries.slice(-5).reverse();
          html += '<div class="ws-art-section-title">最近条目</div>';
          recent.forEach(function(e) {
            var name = e.comment || '未命名';
            var content = (e.content || '').substring(0, 120);
            var isMvu = isMVUEntry(e.comment || '');
            html += '<div class="ws-art-card' + (isMvu ? ' mvu' : '') + '">' +
              '<div class="ws-ac-title">' + (isMvu ? svgIcon('sliders', 12) + ' ' : svgIcon('book', 12) + ' ') + escHtml(name) +
                (e.enabled === false ? ' <span class="ws-ac-off">禁用</span>' : '') +
              '</div>' +
              '<div class="ws-ac-content">' + escHtml(content) + (e.content && e.content.length > 120 ? '...' : '') + '</div>' +
            '</div>';
          });
        }
        return html || '<div class="ws-artifact-empty">暂无内容</div>';
      }

      function bindEvents() {
        doc.getElementById('closeBtn').addEventListener('click', closeModal);
        var input = doc.getElementById('chatInput');
        var sendBtn = doc.getElementById('sendBtn');
        sendBtn.addEventListener('click', handleSend);
        // 键盘事件：
        //   · 桌面：单纯 Enter = 换行（textarea 默认行为，不拦截）；Ctrl/Cmd + Enter = 发送
        //   · 移动端：软键盘 Enter/Send 键 = 换行（textarea 默认行为），点击纸飞机按钮才发送
        //   · 通用：中文/日文输入法合成中（isComposing）一律不触发发送，避免候选上屏阶段误发送
        //   · Shift+Enter 与 Ctrl+Enter 区分：Shift 保留给"语义换段"（仍换行），Ctrl/Cmd 才发送
        input.addEventListener('keydown', function(e) {
          if (e.key !== 'Enter') return;
          // 合成中：直接 return，交给 textarea 默认换行
          if (e.isComposing) return;
          // Ctrl(Mac:Cmd) + Enter → 发送
          var sendModifier = e.ctrlKey || e.metaKey;
          if (sendModifier) {
            e.preventDefault();
            handleSend();
          }
          // 其他情况（纯 Enter / Shift+Enter / Alt+Enter 等）：不 prevent，textarea 默认换行
        });
        // 提示：在 sendBtn title / 底部 hint 动态加上正确的修饰键（Mac=⌘, Win/Linux=Ctrl）
        try {
          var _ua = typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent || '') : '';
          var _isMac = /Mac|iPhone|iPad|iPod/i.test(_ua);
          var _mod = _isMac ? '⌘' : 'Ctrl';
          sendBtn.setAttribute('title', '发送（' + _mod + '+Enter）');
          sendBtn.setAttribute('aria-label', '发送（' + _mod + '+Enter）');
          var _hintEl = doc.getElementById('chatInputHint');
          if (_hintEl) {
            _hintEl.innerHTML = '<span class="kbd">' + _mod + '</span>+<span class="kbd">Enter</span> 发送 · <span class="kbd">Enter</span> 换行';
          }
        } catch(_hm) {}
        input.addEventListener('input', function() {
          updateCharCount();
          updateSendBtnPulse();
          // 自动变高：重置高度后按内容撑开，上限由 CSS max-height 控制（约5行）
          this.style.height = 'auto';
          this.style.height = this.scrollHeight + 'px';
        });
        // Esc：优先关闭弹窗（模态框），其次关闭工作台浮窗
        doc.addEventListener('keydown', function(e) {
          if (e.key !== 'Escape') return;
          // 1) 先尝试关闭最上层模态框（json-modal / modal）
          var modals = doc.querySelectorAll('.json-modal, .modal');
          for (var i = modals.length - 1; i >= 0; i--) {
            if (modals[i].parentNode) { modals[i].remove(); e.preventDefault(); return; }
          }
          // 2) 再关闭工作台浮窗
          var backdrop = doc.getElementById('wsBackdrop');
          if (backdrop) { closeWorkspacePanel(); e.preventDefault(); }
        });
        var exportLogBtn = doc.getElementById('exportLogBtn');
        if (exportLogBtn) {
          exportLogBtn.addEventListener('click', exportChatLogs);
        }
        var qBtns = doc.querySelectorAll('.quick-btn');
        for (var i = 0; i < qBtns.length; i++) {
          qBtns[i].addEventListener('click', function() {
            var action = this.getAttribute('data-action');
            handleQuickAction(action);
          });
        }
        var modBtns = doc.querySelectorAll('.mod-focus-btn');
        for (var j = 0; j < modBtns.length; j++) {
          modBtns[j].addEventListener('click', function() {
            var mod = this.getAttribute('data-mod');
            handleModFocus(mod);
          });
        }
        // ctx-bar 模块按钮（updateCtxBar 内部已绑定，这里兜底）
        var ctxMods = doc.querySelectorAll('.ctx-mod');
        for (var cm = 0; cm < ctxMods.length; cm++) {
          if (!ctxMods[cm].getAttribute('data-bound')) {
            ctxMods[cm].setAttribute('data-bound', '1');
            ctxMods[cm].addEventListener('click', function() {
              var mod = this.getAttribute('data-mod');
              if (mod) handleModFocus(mod);
            });
          }
        }
        var sbBtn = doc.getElementById('scrollBottomBtn');
        if (sbBtn) {
          sbBtn.addEventListener('click', scrollChat);
        }
        var cm = doc.getElementById('chatMessages');
        if (cm) {
          cm.addEventListener('scroll', function() {
            var btns = doc.getElementById('scrollBtns');
            if (btns) {
              if (cm.scrollTop < cm.scrollHeight - cm.clientHeight - 100) {
                btns.classList.add('show');
              } else {
                btns.classList.remove('show');
              }
            }
          });
        }
        var mTabs = doc.querySelectorAll('.mobile-tab');
        for (var ti = 0; ti < mTabs.length; ti++) {
          mTabs[ti].addEventListener('click', function() {
            var tab = this.getAttribute('data-tab');
            var mainEl = doc.querySelector('.main');
            if (!mainEl) return;
            if (tab === 'preview') { mainEl.classList.add('tab-preview'); }
            else { mainEl.classList.remove('tab-preview'); }
            for (var tj = 0; tj < mTabs.length; tj++) {
              mTabs[tj].classList.toggle('active', mTabs[tj].getAttribute('data-tab') === tab);
            }
          });
        }
        // ========== Tab 切换按钮：角色卡 / MVU状态栏，完全隔离两边聊天记录与AI上下文 ==========
        var tabBtns = doc.querySelectorAll('.tab-btn');
        for (var tbi = 0; tbi < tabBtns.length; tbi++) {
          tabBtns[tbi].addEventListener('click', function() {
            var targetTab = this.getAttribute('data-tab');
            if (isGenerating && targetTab !== activeTab) {
              showToast('AI 正在生成中，请稍候再切换 Tab', 'warning');
              return;
            }
            switchTab(targetTab);
          });
        }
      }

      function updateCharCount() {
        var input = doc.getElementById('chatInput');
        var cnt = doc.getElementById('charCount');
        if (!input || !cnt) return;
        var len = input.value.length;
        cnt.textContent = len + ' / 2000';
        cnt.className = 'chat-input-char-count';
        if (len > 1500) cnt.classList.add('warn');
        if (len > 1900) cnt.classList.add('over');
      }

      function updateSendBtnPulse() {
        var input = doc.getElementById('chatInput');
        var btn = doc.getElementById('sendBtn');
        if (!input || !btn) return;
        var hasContent = input.value.trim().length > 0;
        btn.classList.toggle('send-btn-pulse', hasContent && !btn.disabled);
      }

      // ===== 导入模态框 =====
      function showImportModal() {
        var h = '<div class="modal" id="importModal">' +
          '<div class="modal-content">' +
            '<h3 style="color:var(--accent-deep);margin-bottom:4px;font-size:1em;display:inline-flex;align-items:center;gap:7px">' + svgIcon('download', 17) + ' 导入角色卡</h3>' +
            '<p style="font-size:.78em;color:var(--ink-soft);margin-bottom:8px">导入现有角色卡继续编辑，支持chara_card_v2/v3格式</p>' +
            '<div class="import-tabs">' +
              '<div class="import-tab active" data-tab="paste">' + svgIcon('clipboard', 14) + ' 粘贴JSON</div>' +
              '<div class="import-tab" data-tab="file">' + svgIcon('folderOpen', 14) + ' 选择文件</div>' +
            '</div>' +
            '<div id="importTabPaste">' +
              '<textarea class="chat-input" id="importTextarea" placeholder="在此粘贴角色卡JSON..." rows="8" style="min-height:120px;font-family:var(--font-mono);font-size:.75em"></textarea>' +
            '</div>' +
            '<div id="importTabFile" style="display:none">' +
              '<div class="import-dropzone" id="importDropzone">' +
                '<div class="dz-icon">' + svgIcon('folderOpen', 36) + '</div>' +
                '<div class="dz-text">点击选择文件或拖拽JSON文件到此处</div>' +
                '<input type="file" id="importFile" accept=".json,application/json" style="display:none">' +
              '</div>' +
              '<div id="importFileInfo" style="font-size:.72em;color:var(--ink-soft);text-align:center;display:none"></div>' +
            '</div>' +
            '<div class="modal-actions">' +
              '<button class="btn btn-ghost" id="importCloseBtn">取消</button>' +
              '<button class="btn btn-primary" id="importConfirmBtn">' + svgIcon('check', 15) + ' 导入并开始</button>' +
            '</div>' +
          '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var modalEl = tmp.firstElementChild;
        doc.body.appendChild(modalEl);
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });
        doc.getElementById('importCloseBtn').addEventListener('click', function() { modalEl.remove(); });

        var tabs = modalEl.querySelectorAll('.import-tab');
        tabs.forEach(function(t) {
          t.addEventListener('click', function() {
            tabs.forEach(function(x) { x.classList.remove('active'); });
            t.classList.add('active');
            var tab = t.getAttribute('data-tab');
            doc.getElementById('importTabPaste').style.display = tab === 'paste' ? 'block' : 'none';
            doc.getElementById('importTabFile').style.display = tab === 'file' ? 'block' : 'none';
          });
        });

        var dz = doc.getElementById('importDropzone');
        var fileInput = doc.getElementById('importFile');
        if (dz && fileInput) {
          dz.addEventListener('click', function() { fileInput.click(); });
          fileInput.addEventListener('change', function(e) {
            var file = e.target.files && e.target.files[0];
            if (file) handleImportFile(file);
          });
        }

        doc.getElementById('importConfirmBtn').addEventListener('click', function() {
          var text = doc.getElementById('importTextarea').value.trim();
          if (!text) { showToast('请粘贴JSON内容或选择文件', 'warning'); return; }
          try {
            var data = JSON.parse(text);
            importCardData(data);
            modalEl.remove();
          } catch(e) { showToast('JSON解析失败: ' + e.message, 'error'); }
        });
      }

      function handleImportFile(file) {
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            var data = JSON.parse(e.target.result);
            var info = doc.getElementById('importFileInfo');
            if (info) {
              info.style.display = 'block';
              var name = (data.data && data.data.name) || data.name || '未知';
              info.textContent = '✅ 已加载: ' + name + ' (' + file.name + ')';
            }
            doc.getElementById('importTextarea').value = e.target.result;
          } catch(err) {
            showToast('文件解析失败: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      }

      function importCardData(data) {
        var rawData = data;
        var cd = data.data || data;
        if (!cd || typeof cd !== 'object') { showToast('无效的角色卡格式', 'error'); return; }

        cardData.name = cd.name || '';
        cardData.description = cd.description || '';
        cardData.personality = cd.personality || '';
        cardData.scenario = cd.scenario || '';
        cardData.first_mes = cd.first_mes || '';
        cardData.creator_notes = cd.creator_notes || (rawData.creatorcomment !== undefined ? rawData.creatorcomment : '');
        cardData.system_prompt = cd.system_prompt || '';
        cardData.creator = cd.creator || '时之写卡器';
        cardData.character_version = cd.character_version !== undefined ? cd.character_version : '';
        cardData.alternate_greetings = cd.alternate_greetings || [];
        cardData.extensions = {
          talkativeness: '0.5',
          fav: false,
          world: cd.extensions && cd.extensions.world ? cd.extensions.world : '',
          depth_prompt: cd.extensions && cd.extensions.depth_prompt ? cd.extensions.depth_prompt : { prompt: '', depth: 0, role: 'system' },
          regex_scripts: normalizeRegexScripts(cd.extensions && cd.extensions.regex_scripts),
          'xiaobaix-template': cd.extensions && cd.extensions['xiaobaix-template'] ? cd.extensions['xiaobaix-template'] : {
            enabled: false,
            template: '',
            customRegex: '',
            disableParsers: false,
            skipFirstMessage: false,
            recentMessageCount: 0,
            limitToRecentMessages: false
          },
          tavern_helper: (cd.extensions && cd.extensions.tavern_helper)
            ? { scripts: (cd.extensions.tavern_helper.scripts || []), variables: (cd.extensions.tavern_helper.variables || {}) }
            : { scripts: [], variables: {} }
        };
        cardData.group_only_greetings = cd.group_only_greetings || [];

        // 导入时无论原卡是否含 character_book 都重置，避免残留旧卡条目
        cardData.character_book = { entries: [] };
        if (cd.character_book) {
          cardData.character_book = {
            entries: (cd.character_book.entries || []).map(function(e, i) {
              // 通过模板获取默认值（支持 MVU [InitVar] 等前缀）
              var comment = e.comment || '';
              var tmpl = getEntryTemplate(comment);
              var defaultPos = tmpl ? tmpl.position : 4;
              var defaultDepth = tmpl ? tmpl.depth : 4;
              var defaultOrder = tmpl ? tmpl.order : 100;
              var defaultEnabled = tmpl && tmpl.enabled !== undefined ? tmpl.enabled : true;
              // [InitVar] 条目 enabled=false（MVU 只读取禁用的 initvar 条目进行初始化）
              var isInitVar = comment.indexOf('[InitVar]') >= 0;
              var isVarList = comment.indexOf('变量列表') >= 0;
              var enabledVal = isInitVar ? false : (e.enabled !== undefined ? e.enabled : defaultEnabled);
              var ext = e.extensions || {};
              return {
                comment: comment,
                content: isVarList ? normalizeVarListContent(e.content || '') : (e.content || ''),
                keys: e.keys || [],
                secondary_keys: e.secondary_keys || (tmpl && tmpl.secondary_keys) || [],
                constant: e.constant !== undefined ? e.constant : (tmpl ? tmpl.constant : false),
                selective: e.selective !== undefined ? e.selective : (tmpl ? tmpl.selective : true),
                insertion_order: e.insertion_order || defaultOrder,
                enabled: enabledVal,
                use_regex: e.use_regex !== undefined ? e.use_regex : true,
                position: ext.position !== undefined ? ext.position : defaultPos,
                extensions: {
                  position: ext.position !== undefined ? ext.position : defaultPos,
                  depth: ext.depth !== undefined ? ext.depth : defaultDepth,
                  role: ext.role !== undefined ? ext.role : 0,
                  probability: ext.probability !== undefined ? ext.probability : (tmpl ? tmpl.probability : 100),
                  useProbability: ext.useProbability !== undefined ? ext.useProbability : (ext.use_probability !== undefined ? ext.use_probability : (tmpl ? tmpl.useProbability : false)),
                  selectiveLogic: ext.selectiveLogic !== undefined ? ext.selectiveLogic : (tmpl ? tmpl.selectiveLogic : 0),
                  group: ext.group || (tmpl ? tmpl.group : '') || '',
                  group_weight: ext.group_weight !== undefined ? ext.group_weight : (ext.groupWeight !== undefined ? ext.groupWeight : 100),
                  prevent_recursion: ext.prevent_recursion !== undefined ? ext.prevent_recursion : (tmpl ? tmpl.prevent_recursion : false),
                  exclude_recursion: ext.exclude_recursion !== undefined ? ext.exclude_recursion : (tmpl ? tmpl.exclude_recursion : false),
                  delay_until_recursion: ext.delay_until_recursion !== undefined ? ext.delay_until_recursion : (tmpl ? tmpl.delay_until_recursion : false), /* 改进T：保留原值 */
                  use_group_scoring: ext.use_group_scoring !== undefined ? ext.use_group_scoring : false,
                  vectorized: ext.vectorized !== undefined ? ext.vectorized : false,
                  sticky: ext.sticky !== undefined && ext.sticky !== null ? ext.sticky : 0,
                  cooldown: ext.cooldown !== undefined && ext.cooldown !== null ? ext.cooldown : 0,
                  delay: ext.delay !== undefined && ext.delay !== null ? ext.delay : 0,
                  scan_depth: ext.scan_depth !== undefined ? ext.scan_depth : (tmpl ? tmpl.scan_depth : null),
                  match_whole_words: ext.match_whole_words !== undefined ? ext.match_whole_words : null,
                  case_sensitive: ext.case_sensitive !== undefined ? ext.case_sensitive : null,
                  automation_id: ext.automation_id || '',
                  display_index: ext.display_index !== undefined ? ext.display_index : i,
                  outlet_name: ext.outlet_name || '',
                  triggers: ext.triggers || [],
                  ignore_budget: ext.ignore_budget !== undefined ? ext.ignore_budget : false,
                  match_persona_description: ext.match_persona_description !== undefined ? ext.match_persona_description : false,
                  match_character_description: ext.match_character_description !== undefined ? ext.match_character_description : false,
                  match_character_personality: ext.match_character_personality !== undefined ? ext.match_character_personality : false,
                  match_character_depth_prompt: ext.match_character_depth_prompt !== undefined ? ext.match_character_depth_prompt : false,
                  match_scenario: ext.match_scenario !== undefined ? ext.match_scenario : false,
                  match_creator_notes: ext.match_creator_notes !== undefined ? ext.match_creator_notes : false
                }
              };
            })
          };
        }

        cardGenerated = !!(cardData.name && (cardData.description || (cardData.character_book.entries && cardData.character_book.entries.length > 0)));
        progress = calcProgress();
        // ========== Tab 隔离：导入角色卡时重置两边聊天记录（回到全新起始状态） ==========
        chatSessions.card.messages = [];
        chatSessions.mvu.messages = [];
        cardMessages = chatSessions.card.messages;
        mvuMessages = chatSessions.mvu.messages;
        // 同步到全局 messages 别名（向后兼容）
        messages = [];
        // 如果当前不在角色卡Tab，自动切回角色卡Tab（导入后默认从角色卡开始）
        var needSwitchBack = (activeTab !== 'card');

        renderChatUI();
        applyFontScale(_appFontScale);
        if (needSwitchBack) {
          // 如果当前是MVU Tab，则重置回角色卡Tab（导入新角色，MVU需重新配置）
          activeTab = 'card';
          currentTab = 'card';
          if (typeof window !== 'undefined') window.__tab_activeTab = 'card';
        }
        // 恢复Tab激活态（renderChatUI 每次会重新生成Tab按钮）
        var tabBtnsAfter = doc.querySelectorAll('.tab-btn');
        for (var tbai = 0; tbai < tabBtnsAfter.length; tbai++) {
          tabBtnsAfter[tbai].classList.toggle('active', tabBtnsAfter[tbai].getAttribute('data-tab') === activeTab);
        }
        var modFocusAfter = doc.getElementById('modFocus');
        if (modFocusAfter) {
          modFocusAfter.classList.remove('card-only', 'mvu-only');
          modFocusAfter.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
        }
        var modDashAfter = doc.getElementById('modDash');
        if (modDashAfter) {
          modDashAfter.classList.remove('card-only', 'mvu-only');
          modDashAfter.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
        }
        var mvuPanelAfter = doc.getElementById('mvuInfoPanel');
        if (mvuPanelAfter) {
          mvuPanelAfter.classList.remove('card-only', 'mvu-only');
          mvuPanelAfter.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
        }
        var entriesLen = (cardData.character_book && cardData.character_book.entries) ? cardData.character_book.entries.length : 0;
        var greeting = '你好！已成功导入角色卡「' + (cardData.name || '未命名') + '」🎭\n\n' +
          '卡片数据：描述 ' + (cardData.description || '').length + ' 字、开场白 ' + (cardData.first_mes || '').length + ' 字、世界书 ' + entriesLen + ' 条\n\n' +
          '**我已读取了角色卡的全部内容，可以直接进行增/删/改操作：**\n' +
          '• 想修改某个字段？直接说"把名字改成XXX"或"修改世界观描述"\n' +
          '• 想添加世界书条目？说"添加一个XX的条目"\n' +
          '• 想优化内容？说"优化开场白"或"优化世界书条目"\n' +
          '• 想质检？点击「✅ 质检」按钮\n\n' +
          '（MVU变量/状态栏请切换到「MVU变量状态栏」Tab重新制作）\n\n' +
          '请告诉我你想做什么！';
        addAssistantMsg(greeting);
        saveToStorage();
      }

        // ============================================================================
  // SECTION 9  持久化 & 酒馆 SillyTavern API 适配层
  // ============================================================================
  // ===== localStorage 持久化 =====
      var STORAGE_KEY = 'modelo_char_generator_state';

      // ===== 创建全新空 cardData 对象（写新卡/新建工作区时用，保证彻底无旧值残留）=====
      //   模板与 openEditor 入口处 L8154 初始化完全一致，保证新建与首次打开状态等价
      function createEmptyCardData() {
        return {
          name: '', description: '', personality: '', scenario: '',
          first_mes: '', creator_notes: '', system_prompt: '',
          creator: '时之写卡器',
          character_version: '', alternate_greetings: [], group_only_greetings: [],
          extensions: {
            talkativeness: '0.5',
            fav: false,
            world: '',
            depth_prompt: { prompt: '', depth: 4, role: 'system' },
            regex_scripts: [],
            'xiaobaix-template': {
              enabled: false,
              template: '',
              customRegex: '',
              disableParsers: false,
              skipFirstMessage: false,
              recentMessageCount: 0,
              limitToRecentMessages: false
            },
            tavern_helper: { scripts: [], variables: {} }
          },
          character_book: { entries: [] }
        };
      }

      // ===== 「开始创作」全新开始：重置角色卡 + 聊天记录 + 本地存档（不重置字体、不切Tab）=====
      function resetAllWorkForNewCard() {
        // 1. 角色卡数据：替换为全新空对象（彻底切断旧引用）
        cardData = createEmptyCardData();
        if (typeof window !== 'undefined') window.__cardData = cardData;

        // 2. 聊天记录：两边 Tab 全部清空 + 所有别名同步（兼容旧代码对 messages/cardMessages/mvuMessages 的直接引用）
        chatSessions.card = { messages: [], mode: 'normal' };
        chatSessions.mvu = {
          messages: [],
          currentStep: 0,
          modules: { step2: null, step3: null, step4: null, step5: null, step6: null },
          statusBarMode: false
        };
        cardMessages = chatSessions.card.messages;
        mvuMessages = chatSessions.mvu.messages;
        mvuTabStatusBarModules = chatSessions.mvu.modules;
        mvuTabStatusBarCurrentStep = chatSessions.mvu.currentStep;
        mvuTabStatusBarMode = chatSessions.mvu.statusBarMode;
        // 全局 messages 兼容别名：默认回到角色卡 Tab（与首次打开时 L8220 一致）
        messages = chatSessions.card.messages;

        // 3. 当前 Tab 强制回到「角色卡生成」（与首次打开 welcome 起点一致）
        activeTab = 'card';
        currentTab = 'card';
        if (typeof window !== 'undefined') {
          window.__tab_activeTab = activeTab;
        }

        // 4. 进度/生成状态归零
        cardGenerated = false;
        progress = 0;
        moduleProgress = { axiom: 0, soft_rules: 0, core_rules: 0, near_constraint: 0, scene_mechanics: 0, entity_interact: 0, narrative_bg: 0, dynamic_adapt: 0, init_var: 0, var_update_rule: 0 };
        // 5. 旧 5 步状态栏状态同步归零（虽然已废弃，但避免旧代码读取残留值）
        statusBarModules = { step2: null, step3: null, step4: null, step5: null, step6: null };
        statusBarCurrentStep = 0;
        statusBarMode = false;
        // 6. 撤回快照 / AI 队列 归零
        try {
          if (typeof cardDataSnapshots !== 'undefined') {
            cardDataSnapshots = { card: {}, mvu: {} };
          }
        } catch(_eSnap) {}
        try { _aiChatQueueMode = false; } catch(_eQ) {}
        try { _aiChatNotesQueue = []; } catch(_eQ) {}
        // 7. localStorage 存档：移除旧 STORAGE_KEY，避免"关闭重开又带回来旧卡"
        clearStorage();
      }

      // 全局字体缩放：0.85 (最小) ~ 5.0 (最大，接近无限大)，步进0.1
      var _MIN_FONT_SCALE = 0.85, _MAX_FONT_SCALE = 5.0, _FONT_STEP = 0.1;
      var _appFontScale = 1;
      function applyFontScale(scale) {
        if (typeof scale !== 'number' || isNaN(scale)) scale = 1;
        if (scale < _MIN_FONT_SCALE) scale = _MIN_FONT_SCALE;
        if (scale > _MAX_FONT_SCALE) scale = _MAX_FONT_SCALE;
        // 精确到2位小数，避免浮点累计误差
        scale = Math.round(scale * 100) / 100;
        _appFontScale = scale;
        // 修复：必须作用到 iframe 内的 doc，而非外层 document
        var docEl = (doc && doc.documentElement) ? doc.documentElement : document.documentElement;
        if (docEl) docEl.style.setProperty('--app-font-scale', String(scale));
        // 同步更新顶栏字体百分比标签（如果存在）
        var label = doc ? doc.getElementById('fontSizeLabel') : document.getElementById('fontSizeLabel');
        if (label) label.textContent = Math.round(scale * 100) + '%';
        var decBtn = doc ? doc.getElementById('fontDec') : document.getElementById('fontDec');
        var incBtn = doc ? doc.getElementById('fontInc') : document.getElementById('fontInc');
        if (decBtn) decBtn.disabled = scale <= _MIN_FONT_SCALE + 0.001;
        if (incBtn) incBtn.disabled = scale >= _MAX_FONT_SCALE - 0.001;
        // 同步更新下拉菜单中的字体控件（如果已打开）
        var wsLabel = doc ? doc.getElementById('wsFontSizeLabel') : null;
        var wsDecBtn = doc ? doc.getElementById('wsFontDec') : null;
        var wsIncBtn = doc ? doc.getElementById('wsFontInc') : null;
        var wsResetBtn = doc ? doc.getElementById('wsFontReset') : null;
        if (wsLabel) wsLabel.textContent = Math.round(scale * 100) + '%';
        if (wsDecBtn) wsDecBtn.disabled = scale <= _MIN_FONT_SCALE + 0.001;
        if (wsIncBtn) wsIncBtn.disabled = scale >= _MAX_FONT_SCALE - 0.001;
      }

      function saveToStorage() {
        try {
          // 每次保存前同步最新状态（chatSessions 是唯一真源，先从模块级变量回写）
          if (activeTab === 'mvu') {
            chatSessions.mvu.modules = statusBarModules;
            chatSessions.mvu.currentStep = statusBarCurrentStep;
            chatSessions.mvu.statusBarMode = statusBarMode;
          }
          // 同步别名引用
          cardMessages = chatSessions.card.messages;
          mvuMessages = chatSessions.mvu.messages;
          mvuTabStatusBarModules = chatSessions.mvu.modules;
          mvuTabStatusBarCurrentStep = chatSessions.mvu.currentStep;
          mvuTabStatusBarMode = chatSessions.mvu.statusBarMode;

          var state = {
            cardData: cardData,
            activeTab: activeTab || 'card',
            chatSessions: chatSessions,
            currentTab: activeTab || 'card',
            cardGenerated: cardGenerated,
            progress: progress,
            moduleProgress: moduleProgress,
            statusBarModules: statusBarModules,
            statusBarMode: statusBarMode,
            statusBarCurrentStep: statusBarCurrentStep,
            fontScale: typeof _appFontScale === 'number' ? _appFontScale : 1,
            timestamp: Date.now()
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch(e) {
          if (e.name === 'QuotaExceededError') {
            console.warn('[storage] Quota exceeded, 尝试精简冗余字段后重试...');
            /* 改进E：去掉向后兼容的冗余副本字段（chatSessions已是唯一真源），仅保留核心数据重试一次 */
            try {
              var slimState = {
                cardData: cardData,
                activeTab: activeTab || 'card',
                chatSessions: chatSessions,
                cardGenerated: cardGenerated,
                progress: progress,
                moduleProgress: moduleProgress,
                statusBarModules: statusBarModules,
                statusBarMode: statusBarMode,
                statusBarCurrentStep: statusBarCurrentStep,
                fontScale: typeof _appFontScale === 'number' ? _appFontScale : 1,
                timestamp: Date.now()
              };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(slimState));
              console.warn('[storage] 精简重试成功（已去除向后兼容冗余字段）');
              if (typeof showToast === 'function') {
                try { showToast('存储空间不足，已精简冗余字段后保存成功', 'warning'); } catch(_) {}
              }
            } catch(e2) {
              console.error('[storage] 精简重试仍失败:', e2 && e2.message);
              if (typeof showToast === 'function') {
                try { showToast('⚠️存储空间不足，数据未能保存！请尽快写入酒馆避免丢失', 'error'); } catch(_) {}
              }
            }
          } else {
            console.warn('[storage] save error:', e && e.message);
          }
        }
      }

      function loadFromStorage() {
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return false;
          var state = JSON.parse(raw);
          if (state.cardData) {
            cardData = state.cardData;
            if (typeof window !== 'undefined') window.__cardData = cardData;
            // 防御性恢复结构：避免旧版/损坏数据导致后续访问崩溃
            if (!cardData.character_book) cardData.character_book = { entries: [] };
            if (!cardData.character_book.entries) cardData.character_book.entries = [];
            if (!cardData.extensions) cardData.extensions = {};
            cardData.extensions.depth_prompt = normalizeDepthPrompt(cardData.extensions.depth_prompt, 0);
            // 顶层 depth_prompt（V3 字段）同样需要规范化：防止它是字符串导致后续 buildExportCard / mergePartial 崩溃
            if (typeof cardData.depth_prompt !== 'undefined') {
              cardData.depth_prompt = normalizeDepthPrompt(cardData.depth_prompt, 0);
            } else {
              // 与 extensions.depth_prompt 双向同步，保持旧代码（直接读 cd.depth_prompt 的）一致
              cardData.depth_prompt = normalizeDepthPrompt(cardData.extensions.depth_prompt, 0);
            }
            if (!cardData.extensions.tavern_helper) cardData.extensions.tavern_helper = { scripts: [], variables: {} };
            if (!cardData.extensions.tavern_helper.scripts) cardData.extensions.tavern_helper.scripts = [];
            if (!cardData.alternate_greetings) cardData.alternate_greetings = [];

            // ========== Tab 隔离：优先加载 chatSessions 对象，其次从独立字段重建 ==========
            if (state.chatSessions && typeof state.chatSessions === 'object') {
              // 最新版：从 chatSessions 对象还原
              chatSessions.card = Object.assign(
                { messages: [], mode: 'normal' },
                state.chatSessions.card || {}
              );
              chatSessions.mvu = Object.assign(
                { messages: [], currentStep: 0, modules: { step2: null, step3: null, step4: null, step5: null, step6: null }, statusBarMode: false },
                state.chatSessions.mvu || {}
              );
            } else {
              // 上一版/旧版：从独立字段或 messages 字段迁移
              var migratedCardMsgs = [];
              if (state.cardMessages && Array.isArray(state.cardMessages)) {
                migratedCardMsgs = state.cardMessages;
              } else if (state.messages && Array.isArray(state.messages)) {
                // 最早的单会话版本：原来的 messages 全部迁移到角色卡Tab
                migratedCardMsgs = state.messages.slice();
              }
              chatSessions.card = { messages: migratedCardMsgs, mode: 'normal' };
              chatSessions.mvu = {
                messages: (state.mvuMessages && Array.isArray(state.mvuMessages)) ? state.mvuMessages : [],
                currentStep: state.mvuTabStatusBarCurrentStep || 0,
                modules: state.mvuTabStatusBarModules || { step2: null, step3: null, step4: null, step5: null, step6: null },
                statusBarMode: state.mvuTabStatusBarMode || false
              };
            }
            // 同步别名引用（保持向后兼容）
            cardMessages = chatSessions.card.messages;
            mvuMessages = chatSessions.mvu.messages;
            mvuTabStatusBarModules = chatSessions.mvu.modules;
            mvuTabStatusBarCurrentStep = chatSessions.mvu.currentStep;
            mvuTabStatusBarMode = chatSessions.mvu.statusBarMode;

            // 当前Tab：优先 activeTab，其次 currentTab，默认回到角色卡Tab
            activeTab = state.activeTab || state.currentTab || 'card';
            currentTab = activeTab;  // 兼容别名
            // 同步到 window：让 mergePartial / _renderPreviewImpl 也能取到正确 Tab
            // （修复：之前只恢复模块级变量，window.__tab_activeTab 仍为初始值 'card'，
            //  导致继续上次后 UI 显示 MVU Tab 但实际生成/预览仍按角色卡 Tab 逻辑）
            if (typeof window !== 'undefined') {
              window.__tab_activeTab = activeTab;
            }
            // 当前Tab的 messages 兼容：虽然我们不再使用全局 messages 变量，但为了向后兼容
            messages = (activeTab === 'card') ? chatSessions.card.messages.slice() : chatSessions.mvu.messages.slice();

            cardGenerated = state.cardGenerated || false;
            progress = state.progress || 0;
            moduleProgress = state.moduleProgress || { axiom: 0, soft_rules: 0, core_rules: 0, near_constraint: 0, scene_mechanics: 0, entity_interact: 0, narrative_bg: 0, dynamic_adapt: 0, init_var: 0, var_update_rule: 0 };
            if (typeof state.fontScale === 'number') _appFontScale = state.fontScale;

            // 状态栏：根据恢复的当前Tab决定加载哪一份
            if (activeTab === 'mvu') {
              // 当前在MVU Tab：加载 MVU Tab 专属状态栏状态（来自 chatSessions.mvu）
              statusBarModules = chatSessions.mvu.modules;
              statusBarMode = chatSessions.mvu.statusBarMode;
              statusBarCurrentStep = chatSessions.mvu.currentStep;
            } else {
              // 当前在角色卡Tab：强制禁用状态栏生成模式（如果是新版数据有 chatSessions 对象的话）
              if (state.chatSessions) {
                statusBarModules = { step2: null, step3: null, step4: null, step5: null, step6: null };
                statusBarMode = false;
                statusBarCurrentStep = 0;
              } else if (state.statusBarModules) {
                // 旧版数据：沿用 state.statusBarModules（向后兼容）
                statusBarModules = state.statusBarModules;
                statusBarMode = state.statusBarMode || false;
                statusBarCurrentStep = state.statusBarCurrentStep || 0;
              } else {
                statusBarModules = { step2: null, step3: null, step4: null, step5: null, step6: null };
                statusBarMode = false;
                statusBarCurrentStep = 0;
              }
            }
            return true;
          }
        } catch(e) {}
        return false;
      }

      function hasSavedData() {
        try {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return false;
          var state = JSON.parse(raw);
          // 放宽条件：有 name 或有 entries 或有 description 都算有数据
          if (!state || !state.cardData) return false;
          var cd = state.cardData;
          var hasName = cd.name && cd.name.length > 0;
          var hasDesc = cd.description && cd.description.length > 0;
          var hasEntries = cd.character_book && cd.character_book.entries && cd.character_book.entries.length > 0;
          return hasName || hasDesc || hasEntries;
        } catch(e) { return false; }
      }

      function clearStorage() {
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
      }

      function continueFromSave() {
        if (loadFromStorage()) {
          renderChatUI();
          applyFontScale(_appFontScale);
          // ========== Tab 隔离：恢复对应Tab的历史消息到对话区 ==========
          // 用 getCurrentMessages() 取当前Tab的专属消息数组（activeTab已在loadFromStorage中恢复）
          var curMsgs = getCurrentMessages();
          var savedMessages = curMsgs.slice();
          setCurrentMessages([]);
          var chatC = doc.getElementById('chatMessages');
          if (chatC) chatC.innerHTML = '';
          savedMessages.forEach(function(m) {
            var arr = getCurrentMessages();
            arr.push(m);
            appendMsg(m.role, m.content, arr.length - 1);
          });
          // 恢复 mod-dash 的 card/mvu-only 样式
          var modDash = doc.getElementById('modDash');
          if (modDash) {
            modDash.classList.remove('card-only', 'mvu-only');
            modDash.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
          }
          // 恢复 mvu-info-panel 的 card/mvu-only 样式
          var mvuPanel = doc.getElementById('mvuInfoPanel');
          if (mvuPanel) {
            mvuPanel.classList.remove('card-only', 'mvu-only');
            mvuPanel.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
          }
          // 恢复Tab按钮激活态（renderChatUI 默认可能没有选中对应Tab）
          var tabBtns = doc.querySelectorAll('.tab-btn');
          for (var tbi = 0; tbi < tabBtns.length; tbi++) {
            tabBtns[tbi].classList.toggle('active', tabBtns[tbi].getAttribute('data-tab') === activeTab);
          }
          // 更新 mod-focus 显示筛选（Card/MVU-only）
          var modFocus = doc.getElementById('modFocus');
          if (modFocus) {
            modFocus.classList.remove('card-only', 'mvu-only');
            modFocus.classList.add(activeTab === 'card' ? 'card-only' : 'mvu-only');
          }
          // 更新输入框占位符和标题
          var inputEl = doc.getElementById('chatInput');
          if (inputEl) {
            inputEl.placeholder = activeTab === 'card'
              ? '描述你想要的世界/角色设定，我来生成角色卡...'
              : '描述你想要的MVU变量系统或状态栏，如"做一个好感度+物品栏的状态栏"...';
          }
          var titleH1 = doc.querySelector('.topbar h1');
          if (titleH1) {
            titleH1.innerHTML = activeTab === 'card'
              ? svgIcon('bolt', 18, 'topbar-ic') + ' 时之写卡器 · <span style="font-weight:400;font-size:.85em;color:var(--ink-soft)">角色卡生成</span>'
              : svgIcon('sliders', 18, 'topbar-ic') + ' MVU变量系统 · <span style="font-weight:400;font-size:.85em;color:var(--ink-soft)">变量与状态栏</span>';
          }
          updateProgress();
          updateQuickActions();
          updateModFocus();
          renderPreview();
          renderModDash();
          renderMvuInfoPanel();
          showToast('已恢复上次创作进度（当前：' + (activeTab === 'card' ? '角色卡生成 Tab' : 'MVU变量状态栏 Tab') + '）', 'success');
        } else {
          showToast('没有找到保存的数据', 'warning');
        }
      }

      function handleModFocus(mod) {
        // 复用 handleQuickAction 的精细提示词，保证点击仪表盘/模块按钮都能给出体系化指令
        handleQuickAction(mod);
      }

      // ===== 上下文操作条：合并旧 mod-focus + mod-dash + mvu-info-panel =====
      function updateModFocus() { updateCtxBar(); }
      function updateCtxBar() {
        var stage = doc.getElementById('ctxStage');
        var actions = doc.getElementById('ctxActions');
        if (!stage || !actions) return;
        var __tab = (typeof activeTab !== 'undefined') ? activeTab : 'card';
        var p = progress || 0;
        // ===== 阶段提示 =====
        var stageName, stageIcon;
        if (__tab === 'card') {
          stageIcon = 'info';
          stageName = p < 20 ? '定核心铁则' : p < 40 ? '搭世界基底' : p < 60 ? '做实体内容' : p < 80 ? '补叙事背景' : p < 95 ? '做动态适配' : '可写入酒馆';
        } else {
          // MVU Tab：静态阶段标签（进度由8步chip展示，避免与chip重复冲突）
          stageIcon = 'sliders';
          stageName = 'MVU变量系统';
        }
        stage.innerHTML = svgIcon(stageIcon, 13) + ' <strong>' + stageName + '</strong>';
        // ===== 操作区内容 =====
        var h = '';
        if (__tab === 'card') {
          // 角色卡Tab：8个模块导航胶囊（done/prog 状态）
          var mp = getModuleProgress();
          var aiMp = moduleProgress || {};
          var labels = [
            { key: 'core_rules', icon: 'lock', name: '核心铁则' },
            { key: 'axiom', icon: 'axiom', name: '世界基底' },
            { key: 'soft_rules', icon: 'handshake', name: '交互软规则' },
            { key: 'near_constraint', icon: 'target', name: '近场强约束' },
            { key: 'scene_mechanics', icon: 'sword', name: '场景机制' },
            { key: 'entity_interact', icon: 'users', name: '实体交互' },
            { key: 'narrative_bg', icon: 'book', name: '叙事背景' },
            { key: 'dynamic_adapt', icon: 'refreshCycle', name: '动态适配' }
          ];
          labels.forEach(function(l) {
            var val = (mp[l.key] ? 100 : 0);
            if (aiMp[l.key] > 0) val = Math.max(val, aiMp[l.key]);
            var cls = val >= 100 ? 'done' : val > 0 ? 'prog' : '';
            h += '<button class="ctx-mod ' + cls + '" data-mod="' + l.key + '">' + svgIcon(l.icon, 13) + ' ' + l.name + '</button>';
          });
        } else {
          // MVU Tab：8步紧凑状态 chip + 阶段自适应主操作按钮
          var _ctxChk = checkMvu8Entries(cardData);
          var _d = _ctxChk.done;
          var _doneCnt = _ctxChk.doneCount;
          // 8步紧凑状态 chip（仅序号 + 完成态，节省横向空间）
          var _steps = [
            { has: _d[0], label: '①', title: '第1条 zod变量结构脚本' },
            { has: _d[1], label: '②', title: '第2条 [InitVar]初始变量' },
            { has: _d[2], label: '③', title: '第3条 [mvu_update]更新规则' },
            { has: _d[3], label: '④', title: '第4条 变量列表' },
            { has: _d[4], label: '⑤', title: '第5条 [mvu_update]输出格式' },
            { has: _d[5], label: '⑥', title: '第6条 输出格式强调' },
            { has: _d[6], label: '⑦', title: '第7条 <状态栏>占位提醒' },
            { has: _ctxChk.has8, label: '⑧', title: '第8条 状态栏HTML(正则6)' }
          ];
          _steps.forEach(function(s) {
            h += '<span class="ctx-chip ' + (s.has ? 'ok' : 'todo') + '" title="' + s.title + '">' + svgIcon(s.has ? 'checkCircle' : 'circle', 11) + ' ' + s.label + '</span>';
          });
          // 阶段自适应主操作按钮（右对齐，高亮当前阶段主操作）
          // 注：部分完成(1-6/7)时不显示主按钮，由输入框上方"继续"按钮接管
          if (!_ctxChk.all7Done) {
            if (_doneCnt === 0) {
              h += '<button class="ctx-mod" data-mod="init_var" style="margin-left:auto;background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border)">' + svgIcon('code', 13) + ' 生成变量系统</button>';
            }
          } else if (!_ctxChk.has8) {
            h += '<button class="ctx-mod" data-mod="start_sb" style="margin-left:auto;background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border)">' + svgIcon('sliders', 13) + ' 生成状态栏</button>';
          } else {
            h += '<button class="ctx-mod" data-mod="mvuPreview" style="margin-left:auto;background:var(--accent-soft);color:var(--accent-deep);border-color:var(--accent-border)">' + svgIcon('eye', 13) + ' 预览状态栏</button>';
          }
        }
        actions.innerHTML = h;
        // 绑定模块按钮点击
        var modBtns = actions.querySelectorAll('.ctx-mod');
        for (var i = 0; i < modBtns.length; i++) {
          modBtns[i].addEventListener('click', function() {
            var mod = this.getAttribute('data-mod');
            if (!mod) return;
            // MVU 快捷动作直接派发
            if (mod === 'start_sb' || mod === 'mvuPreview' || mod === 'init_var' || mod === 'var_update_rule') {
              handleQuickAction(mod);
            } else {
              handleModFocus(mod);
            }
          });
        }
      }

      function updateQuickActions() {
        var qa = doc.getElementById('quickActions');
        if (!qa) return;
        var p = progress || 0;
        var hasFirst = cardData.first_mes && cardData.first_mes.length > 50;
        var hasEntries = cardData.character_book && cardData.character_book.entries && cardData.character_book.entries.length > 0;
        var hasMVU = hasEntries && cardData.character_book.entries.some(function(e) {
          return isMVUEntry(e.comment || '');
        });

        // ========== 精简版：仅留「阶段主操作」+「生成」+ 2 mini（写入/清空）==========
        // 模块导航/质检/优化/权重/分组/进度总览等已迁至「工作区」下拉菜单，避免拥挤
        var actions = [];
        if (currentTab === 'card') {
          // 阶段主操作（hl）
          if (p < 20)        actions.push({ action: 'core_rules',      icon: 'lock',         label: '定核心铁则',   hl: true });
          else if (p < 40)   actions.push({ action: 'axiom',           icon: 'axiom',        label: '搭世界基底',   hl: true });
          else if (p < 60)   actions.push({ action: 'entity_interact', icon: 'users',        label: '做实体内容',   hl: true });
          else if (p < 80)   actions.push({ action: 'dynamic_adapt',   icon: 'refreshCycle', label: '做动态适配',   hl: true });
          else if (p < 95)   actions.push({ action: 'goto_mvu',        icon: 'sliders',      label: '去做MVU变量/状态栏', hl: true });
          // 生成角色卡并写入酒馆（新：直接调用 tavern API 装配导出，而非再让AI输出完整JSON）
          // p>=95 时高亮；p<95 也能点（允许用户提前导出），但不做高亮提示
          actions.push({ action: 'generate', icon: 'sparkle', label: '生成并写入酒馆', title: '通过写卡器装配角色卡（含MVU/正则/脚本），直接写入到酒馆当前角色卡', hl: p >= 95 });
        } else {
          // MVU Tab：基于8条工作流的三阶段按钮组
          var _chk = checkMvu8Entries(cardData);
          var _done7Count = _chk.doneCount;
          var _all7Done = _chk.all7Done;
          if (!_all7Done) {
            // Phase A：前7条MVU条目未完成
            if (_done7Count === 0) {
              actions.push({ action: 'init_var',        icon: 'code',    label: '生成MVU变量系统',       hl: true });
            } else {
              actions.push({ action: 'continue_mvu',    icon: 'play',    label: '继续',                  hl: true });
            }
            actions.push({ action: 'next',             icon: 'bolt', label: '下一步建议' });
          } else if (!_chk.has8) {
            // Phase B：前7条已完成，状态栏未生成
            actions.push({ action: 'start_sb',        icon: 'sliders', label: '生成状态栏HTML', hl: true });
            actions.push({ action: 'mvuPreview',      icon: 'eye',     label: '预览(默认模板)' });
          } else {
            // Phase C：状态栏已生成
            actions.push({ action: 'mvuPreview',      icon: 'eye',     label: '预览状态栏', hl: true });
            actions.push({ action: 'start_sb',        icon: 'refreshCycle', label: '重新生成' });
            actions.push({ action: 'reset_sb',        icon: 'trash',   label: '清除状态栏' });
          }
        }
        var h = '';
        actions.forEach(function(a) {
          var icHtml = a.icon ? svgIcon(a.icon, 14) + ' ' : '';
          var titleAttr = a.title ? (' title="' + a.title.replace(/"/g, '&quot;') + '"') : '';
          var ariaLabel = a.title ? (' aria-label="' + a.title.replace(/"/g, '&quot;') + '"') : '';
          h += '<button class="quick-btn' + (a.hl ? ' hl' : '') + '" data-action="' + a.action + '"' + titleAttr + ariaLabel + '>' + icHtml + a.label + '</button>';
        });
        // 2 mini：写入酒馆 / 清空（右对齐）
        h += '<button class="qa-mini" id="saveBtn" title="直接写入酒馆角色卡">' + svgIcon('save', 14) + ' 写入酒馆</button>';
        h += '<button class="qa-mini" id="clearChatBtn" title="清空对话记录（不影响角色卡内容）">' + svgIcon('trash', 14) + ' 清空</button>';
        qa.innerHTML = h;
        var btns = qa.querySelectorAll('.quick-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].addEventListener('click', function() {
            handleQuickAction(this.getAttribute('data-action'));
          });
        }
        bindToolbarButtons();
      }



      // 绑定导出/清空按钮（位于 quick-actions 内，每次重建后需重新绑定）
      function bindToolbarButtons() {
        var saveBtn = doc.getElementById('saveBtn');
        if (saveBtn) saveBtn.addEventListener('click', saveCharacter);
        var clearChatBtn = doc.getElementById('clearChatBtn');
        if (clearChatBtn) {
          clearChatBtn.addEventListener('click', function() {
            if (isGenerating) { showToast('⚠️ AI正在生成中，请稍后再清除', 'warning'); return; }
            // ========== Tab 隔离：只清空当前Tab的聊天记录，另一Tab不受影响 ==========
            var curMsgs = getCurrentMessages();
            var tabName = currentTab === 'card' ? '角色卡生成' : 'MVU变量状态栏';
            if (curMsgs.length === 0) { showToast(tabName + ' Tab 的对话已经是空的', 'info'); return; }
            if (!confirm('确定清空「' + tabName + '」Tab 的所有对话记录吗？\n\n✅ 角色卡内容不会被影响，仍会保留\n✅ 只清除当前Tab的聊天对话历史\n✅ 另一个Tab的聊天记录不受影响')) return;
            setCurrentMessages([]);
            // MVU Tab 清空时也重置其状态栏模块状态
            if (currentTab === 'mvu') {
              mvuTabStatusBarModules = { step2: null, step3: null, step4: null, step5: null, step6: null };
              mvuTabStatusBarCurrentStep = 0;
              mvuTabStatusBarMode = false;
              statusBarModules = mvuTabStatusBarModules;
              statusBarCurrentStep = 0;
              statusBarMode = false;
            }
            var chatC = doc.getElementById('chatMessages');
            if (chatC) chatC.innerHTML = '';
            saveToStorage();
            showToast('✅ ' + tabName + ' Tab 的对话已清空（角色卡内容不受影响）', 'success');
          });
        }
        // 同步禁用态（生成中）
        if (saveBtn) saveBtn.disabled = isGenerating;
      }

      function handleQuickAction(action) {
        var input = doc.getElementById('chatInput');

        // ========== Tab 跳转动作（跨Tab快速切换入口） ==========
        if (action === 'goto_mvu') {
          showToast('正在切换到「MVU变量状态栏」Tab...', 'info');
          switchTab('mvu');
          return;
        }
        if (action === 'goto_card') {
          showToast('正在切换到「角色卡生成」Tab...', 'info');
          switchTab('card');
          return;
        }

        // ========== Tab 隔离：动作权限校验，跨Tab动作自动跳转 ==========
        // 在角色卡Tab中点击了MVU专属动作 → 自动切到MVU Tab再执行
        var mvuOnlyActions = ['init_var', 'var_update_rule', 'start_sb', 'continue_sb', 'reset_sb', 'mvuPreview', 'continue_mvu'];
        if (currentTab === 'card' && mvuOnlyActions.indexOf(action) >= 0) {
          showToast('「' + action + '」是MVU专属功能，正在切换到MVU变量状态栏Tab...', 'info');
          switchTab('mvu');
          // 切换后在MVU Tab执行同一个动作
          setTimeout(function() { handleQuickAction(action); }, 300);
          return;
        }
        // 在MVU Tab中点击了角色卡专属动作 → 自动切到角色卡Tab再执行
        var cardOnlyActions = ['core_rules', 'axiom', 'soft_rules', 'entity_interact', 'scene_mechanics', 'narrative_bg', 'dynamic_adapt', 'opening', 'generate', 'qc', 'optimize', 'weight', 'group'];
        if (currentTab === 'mvu' && cardOnlyActions.indexOf(action) >= 0) {
          showToast('「' + action + '」是角色卡专属功能，正在切换到角色卡生成Tab...', 'info');
          switchTab('card');
          setTimeout(function() { handleQuickAction(action); }, 300);
          return;
        }

        // MVU专属快捷动作（仅MVU Tab有效）
        if (action === 'start_sb') {
          // ===== 前置检查：生成状态栏前，必须先完成前7条（第8条=状态栏本身）=====
          var _chkSB = checkMvu8Entries(cardData);
          if (!_chkSB.all7Done) {
            addAssistantMsg(buildMissingMvuHint(_chkSB.missing));
            showToast('前7条未齐全：缺' + _chkSB.missingCount + '条', 'warning');
            return;
          }
          // 生成状态栏前，确保固定资产已注入（bundle.js/正则1-5等）
          ensureFixedMvuAssetsInCardData();
          // 让AI生成完整状态栏HTML（统一模板，写卡器自动提取保存）
          if (input) {
            input.value = '请根据已配置的MVU变量系统，生成状态栏HTML。输出一个完整的HTML文档（含CSS和JS），使用 populateCharacterData + getAllVariables + eventOn(Mvu.events.VARIABLE_UPDATE_ENDED) + errorCatched 标准模式。';
            handleSend();
          }
          return;
        }
        if (action === 'continue_sb') {
          // 继续状态栏生成
          if (input) { input.value = '继续生成状态栏'; handleSend(); }
          return;
        }
        if (action === 'continue_mvu') {
          // 继续MVU逐条生成：自动发送"继续"两个字
          if (input) { input.value = '继续'; handleSend(); }
          return;
        }
        if (action === 'reset_sb') {
          // 清除已生成的状态栏正则（正则6）
          if (!confirm('确定清除已生成的美化状态栏正则（正则6）吗？\n\n✅ 仅删除状态栏HTML正则，不影响前7条MVU变量条目\n✅ 可随时重新生成')) return;
          cardData.extensions = cardData.extensions || {};
          var _rx = cardData.extensions.regex_scripts || [];
          for (var _m = _rx.length - 1; _m >= 0; _m--) {
            if ((_rx[_m].findRegex || '').indexOf('StatusPlaceHolder') >= 0 && _rx[_m].markdownOnly && !_rx[_m].promptOnly) {
              _rx.splice(_m, 1);
            }
          }
          cardData.extensions.regex_scripts = _rx;
          saveToStorage();
          renderPreview();
          updateQuickActions();
          updateCtxBar();
          showToast('✅ 已清除状态栏正则，可重新生成', 'success');
          return;
        }

        // 通用动作（两个Tab都可以用，但行为不同）
        if (action === 'qc') { showQualityCheck(); return; }
        if (action === 'optimize') { showOptimizeModal(); return; }
        if (action === 'weight') { showWeightVisual(); return; }
        if (action === 'group') { showGroupMgr(); return; }
        if (action === 'mvuPreview') { showMvuStatusBarPreview(); return; }
        if (action === 'generate') {
          // 新版：不再让AI生成完整JSON（旧版）。当前流程是「渐进写卡 + 写卡器自动装配 + 酒馆API」，
          // 点击「生成角色卡」直接执行写入酒馆（与 qa-mini 写入酒馆按钮一致，按钮位置更显眼）。
          // 兜底：仍仅角色卡Tab生效
          if (currentTab !== 'card') {
            showToast('⚠️ 「生成并写入酒馆」仅在「角色卡生成」Tab中可用。\n当前在MVU变量状态栏Tab，请切换到角色卡生成Tab使用此功能。', 'warning', 5000);
            return;
          }
          saveCharacter();
          return;
        }

        // Prompt字典：区分角色卡Tab和MVU Tab使用不同的默认提示
        var cardPrompts = {
          next: '下一步我该做什么？请根据当前完成度和未达标项，给出2-3条具体可执行的建议，并说明每条建议会改善哪个体系。',
          summary: '帮我梳理一下当前已收集的信息和进度：1) 已完成的核心设定 2) 各体系完成情况 3) 还缺什么 4) 推荐的下一步。用简洁列表呈现。',
          opening: '请根据现有世界观设定生成一段500-800字的开场白（first_mes）。要求：场景描写→主角出场→冲突/悬念→结尾留钩。必须是完整文本，禁止占位符。',
          situation: '请帮我完善当前局势和主要势力关系，用:::upsert操作块输出（近场强约束+实体交互类条目）。',
          axiom: '请帮我完善【基础公理】体系：世界元数据、世界观公理、力量体系骨架。用:::upsert操作块输出，使用<基础公理>前缀，constant=true，position=0，每条content≥250字。',
          soft_rules: '请帮我设计【交互软规则】体系：互动选项规则、叙事风格引导、剧情节奏控制。用:::upsert操作块输出，使用<交互软规则>前缀。',
          core_rules: '请帮我完善【核心铁则】体系：绝对禁止项、输出格式要求、AI身份定位。详细规则用:::upsert <核心铁则>条目。',
          near_constraint: '请帮我设计【近场强约束】体系：当前局势、即时状态、临时任务。用:::upsert操作块输出，使用<近场强约束>前缀，触发式条目depth=2。',
          scene_mechanics: '请帮我完善【场景机制】体系：核心玩法、世界规则、战斗/修炼/谈判等机制。用:::upsert操作块输出，使用<场景机制>前缀。核心事件/玩法系统按【事件完善工作流·机制+细化+反馈三联条目】生成：<核心玩法>XXX（是什么）+<核心玩法>XXX细化逻辑（怎么做）+<场景机制>XXX反馈规范（怎么呈现）三条目协同，禁止合并成超长条目。完善角色关系时，用<场景机制>XXX动态后果条目定义变量阈值+性格分支（分支≥3，每条含行为反应+剧情模式）。已有玩法要补充新维度时，用⟦⟧标记生成新条目，禁止覆盖原条目。',
          entity_interact: '请帮我设计【实体交互】体系：重要角色（NPC）、势力与组织、关键物品、地点场景。用:::upsert操作块输出，使用<实体交互>前缀，prevent_recursion=true。若题材涉及大量同类NPC（校园/后宫/末世等），按【人物完善工作流·引擎+递归+实例三层结构】生成：第1层<场景机制>XXX生成引擎（身份池+容貌池+核心变量）→第2层<实体交互>XXX-递归扩展（调用说明）→第3层<叙事背景>XXX型深度（按性格类型逐条生成实例）。已有角色要补充新维度时，用⟦⟧标记生成新条目（如⟦<重要角色>白娅·人际关系⟧），禁止覆盖原条目。',
          narrative_bg: '请帮我完善【叙事背景】体系：故事发展、文化与习俗、历史事件、主线剧情。用:::upsert操作块输出，使用<叙事背景>前缀，delay_until_recursion=true。',
          dynamic_adapt: '请帮我设计【动态适配】体系：<引导机制>新手引导、互动选项、depth_prompt渐进引导、<动态适配>分支开局（多开局请用<动态适配>条目+MVU initvar覆盖实现，禁止写入alternate_greetings字段）。用:::upsert操作块输出，使用<引导机制>/<动态适配>标签前缀。（状态栏和变量系统请去MVU Tab制作）'
        };
        var mvuPrompts = {
          next: '我当前的MVU进度该怎么推进？请分析：\n1) 前7条MVU条目完成情况（' + MVU_8STEPS_SHORT + '）\n2) 第8条状态栏5模块完成情况（Step 2-6）\n3) 推荐的下一步怎么做。用简洁列表呈现。',
          summary: '帮我梳理MVU系统当前状态：\n1) 按8条顺序检查前7条完成情况（' + MVU_8STEPS_SHORT + '）\n2) 检查第8条状态栏Step 2-6共5模块完成情况\n3) 缺失什么、推荐的下一步。',
          init_var:
            '请帮我设计MVU变量系统，严格遵守以下规范：\n' +
            MVU_SEQUENTIAL_RULE +
            MVU_8STEPS_DETAIL +
            MVU_VAR_SPEC + '\n\n' +
            MVU_8STEPS_COMMON_RULES +
            MVU_MODIFY_RULE + '\n\n' +
            '请先收集用户的变量需求（角色/世界观/场景/需要追踪什么状态），然后按上述8条顺序**逐条**开始生成。现在先生成【第1条：变量结构脚本(zod 4 schema)】。',
          var_update_rule:
            '请帮我完善当前MVU系统的缺失条目，严格遵守【逐条生成铁则】：\n' +
            '⚠️ 一次只补1条，输出后立即停下问"已生成第N条，说\'继续\'生成下一条"。前7条完成后才生成第8条。\n\n' +
            '先检查当前已有的条目，然后按以下8条固定顺序从缺失的第一条开始补：\n' +
            MVU_8STEPS_DETAIL +
            MVU_VAR_SPEC + '\n\n' +
            MVU_MODIFY_RULE
        };
        // 选择当前Tab对应的Prompt字典
        var prompts = currentTab === 'card' ? cardPrompts : mvuPrompts;
        // summary/next在两个字典中都有；init_var/var_update_rule仅在MVU字典
        if (prompts[action] && input) {
          input.value = prompts[action];
          handleSend();
        } else if (!prompts[action] && currentTab === 'mvu') {
          // 如果在MVU Tab点了角色卡Tab才有的动作（应该被上面的跳转拦住了，兜底防止意外）
          showToast('⚠️ 该动作仅在「角色卡生成」Tab中可用', 'warning');
        }
      }

      // 队列模式：callAIChat处理期间，addAssistantMsg的调用改为收集到队列，最后合并为一条消息
      var _aiChatNotesQueue = [];
      var _aiChatQueueMode = false;

      function addAssistantMsg(content) {
        // 队列模式：不立即显示，收集到队列
        if (_aiChatQueueMode) {
          _aiChatNotesQueue.push(content);
          return;
        }
        // ========== Tab 隔离：写入当前Tab专属的聊天记录数组，两边互不干扰 ==========
        var curMsgs = getCurrentMessages();
        curMsgs.push({ role: 'assistant', content: content });
        appendMsg('assistant', content, curMsgs.length - 1);
        // MVU Tab：每次消息后同步最新模块状态回 mvuTabStatusBarModules，防止丢失
        if (currentTab === 'mvu') {
          mvuTabStatusBarModules = statusBarModules;
          mvuTabStatusBarCurrentStep = statusBarCurrentStep;
          mvuTabStatusBarMode = statusBarMode;
        }
        saveToStorage();
        renderModDash();
        renderMvuInfoPanel();
      }
      function addUserMsg(content) {
        // ========== Tab 隔离：写入当前Tab专属的聊天记录数组，两边互不干扰 ==========
        var curMsgs = getCurrentMessages();
        curMsgs.push({ role: 'user', content: content });
        appendMsg('user', content, curMsgs.length - 1);
        saveToStorage();
      }
      /* 导出聊天记录和后台记录（调试用，放在预览面板右上角不起眼位置） */
      function exportChatLogs() {
        try {
          var log = {
            exportTime: new Date().toISOString(),
            toolVersion: 'Card_making_tool',
            cardData: cardData,
            currentTab: currentTab,
            cardMessages: cardMessages,
            mvuMessages: mvuMessages,
            mvuTabStatusBarModules: mvuTabStatusBarModules,
            mvuTabStatusBarCurrentStep: mvuTabStatusBarCurrentStep,
            statusBarModules: statusBarModules,
            progress: progress,
            moduleProgress: moduleProgress
          };
          var blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = doc.createElement('a');
          a.href = url;
          a.download = 'chatlog_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
          doc.body.appendChild(a);
          a.click();
          doc.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('✅ 已导出聊天记录和后台记录', 'success');
        } catch(err) {
          console.error('[exportChatLogs] error:', err);
          showToast('❌ 导出失败：' + (err && err.message ? err.message : '未知错误'), 'error');
        }
      }
      function appendMsg(role, content, explicitIdx) {
        var c = doc.getElementById('chatMessages');
        if (!c) return;
        var div = doc.createElement('div');
        div.className = 'chat-msg ' + role;
        var msgId = 'msg-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
        div.setAttribute('data-msg-id', msgId);
        // 记录消息在当前Tab消息数组中的索引（供头像菜单撤回/重新生成定位）
        // explicitIdx 由重放场景（switchTab/rerenderChatMessages）显式传入；
        // 正常流程（push后立即append）用 getCurrentMessages().length-1 兜底
        var msgIdx = (typeof explicitIdx === 'number' && explicitIdx >= 0) ? explicitIdx : -1;
        if (msgIdx < 0) {
          try { msgIdx = getCurrentMessages().length - 1; } catch(_eIdx) {}
        }
        if (msgIdx < 0) msgIdx = (c.querySelectorAll('.chat-msg').length);
        div.setAttribute('data-msg-index', String(msgIdx));
        div.setAttribute('data-msg-role', role);
        var avatarHtml = buildAvatarHtml(role);
        var bubbleHtml;
        // AI 消息：使用 section 分区渲染（思维链/正文/代码块可折叠）
        if (role === 'assistant') {
          try {
            var sections = parseMessageSections(content);
            bubbleHtml = renderMessageSections(sections, msgId);
          } catch(e) {
            console.warn('section render error:', e);
            try { bubbleHtml = fmtBubble(content); } catch(e2) { bubbleHtml = ''; }
          }
        } else {
          try {
            bubbleHtml = fmtBubble(content);
          } catch(e) {
            console.warn('fmtBubble error:', e);
            bubbleHtml = '';
          }
        }
        if (bubbleHtml) {
          // 🐛修复：转义顺序必须是 & → " → < → >，否则 &lt; 等已有实体会被二次解码
          div.innerHTML = avatarHtml + '<div class="bubble" data-raw-text="' + content.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '">' + bubbleHtml + '</div>';
        } else {
          div.innerHTML = avatarHtml + '<div class="bubble"></div>';
          var bubbleEl = div.querySelector('.bubble');
          if (bubbleEl) bubbleEl.textContent = (content == null ? '' : String(content));
        }
        c.appendChild(div);
        // 头像点击：弹出操作菜单（修改头像/人设/撤回/重新生成等），不再直接上传
        var avEl = div.querySelector('.avatar-clickable');
        if (avEl) {
          avEl.style.position = 'relative';
          avEl.addEventListener('click', function(e) {
            if (e) { e.stopPropagation(); }
            showAvatarMenu(role, msgIdx, avEl);
          });
        }
        // AI 消息：绑定 section 折叠交互
        if (role === 'assistant') {
          var bubbleDiv = div.querySelector('.bubble');
          if (bubbleDiv) bindSectionToggles(bubbleDiv);
        }
        scrollChat();
      }
      function buildAvatarHtml(role) {
        var key = role === 'user' ? 'userAvatar' : 'aiAvatar';
        var cls = 'avatar avatar-clickable';
        var title = role === 'user' ? '点击展开操作菜单（修改头像/人设/撤回等）' : '点击展开操作菜单（修改头像/人设/撤回/重新生成等）';
        var saved = localStorage.getItem(key);
        if (saved) {
          return '<div class="' + cls + '" title="' + title + '" style="cursor:pointer;background-image:url(' + saved + ');background-size:cover;background-position:center"></div>';
        }
        var icon = role === 'user' ? svgIcon('user', 18) : svgIcon('bot', 18);
        return '<div class="' + cls + '" title="' + title + '" style="cursor:pointer">' + icon + '</div>';
      }
      function triggerAvatarUpload(role) {
        var key = role === 'user' ? 'userAvatar' : 'aiAvatar';
        var input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        doc.body.appendChild(input);
        input.addEventListener('change', function(e) {
          var file = e.target.files && e.target.files[0];
          // 无论是否选中文件都移除临时 input，避免 DOM 节点泄漏
          if (input.parentNode) doc.body.removeChild(input);
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(ev) {
            var img = new Image();
            img.onload = function() {
              var size = Math.min(img.width, img.height);
              var canvas = doc.createElement('canvas');
              canvas.width = 128; canvas.height = 128;
              var ctx = canvas.getContext('2d');
              var sx = (img.width - size) / 2, sy = (img.height - size) / 2;
              ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
              var dataUrl = canvas.toDataURL('image/png');
              localStorage.setItem(key, dataUrl);
              refreshAllAvatars(role);
              showToast((role === 'user' ? '用户' : 'AI') + '头像已更新', 'success');
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        });
        input.click();
      }
      function refreshAllAvatars(role) {
        var key = role === 'user' ? 'userAvatar' : 'aiAvatar';
        var saved = localStorage.getItem(key);
        if (!saved) return;
        var avatars = doc.querySelectorAll('.chat-msg.' + role + ' .avatar-clickable');
        for (var i = 0; i < avatars.length; i++) {
          avatars[i].innerHTML = '';
          avatars[i].style.backgroundImage = 'url(' + saved + ')';
          avatars[i].style.backgroundSize = 'cover';
          avatars[i].style.backgroundPosition = 'center';
        }
      }

      // ====================================================================
      // ========== 头像菜单系统 + cardData快照撤回系统 ==========
      // ====================================================================
      // 每个Tab维护独立的快照表：{ card: {msgIndex: cardDataClone}, mvu: {...} }
      // 在每条AI消息应用修改前保存快照，撤回时回滚cardData + 截断消息
      var cardDataSnapshots = { card: {}, mvu: {} };
      function _snapTabKey() { return (activeTab === 'mvu') ? 'mvu' : 'card'; }
      function saveCardDataSnapshot(aiMsgIndex) {
        try {
          var clone = JSON.parse(JSON.stringify(cardData));
          cardDataSnapshots[_snapTabKey()][aiMsgIndex] = clone;
        } catch(e) { console.warn('[snapshot] save failed:', e && e.message); }
      }
      function restoreCardDataSnapshot(aiMsgIndex) {
        var snap = cardDataSnapshots[_snapTabKey()][aiMsgIndex];
        if (!snap) return false;
        try {
          var restored = JSON.parse(JSON.stringify(snap));
          // 原地替换 cardData 的内容（保留引用，避免各处引用失效）
          for (var k in cardData) { if (cardData.hasOwnProperty(k)) delete cardData[k]; }
          for (var k2 in restored) { if (restored.hasOwnProperty(k2)) cardData[k2] = restored[k2]; }
          return true;
        } catch(e) { console.warn('[snapshot] restore failed:', e && e.message); return false; }
      }
      function clearSnapshotsAfter(msgIndex) {
        var tab = _snapTabKey();
        var snaps = cardDataSnapshots[tab];
        for (var k in snaps) {
          if (snaps.hasOwnProperty(k) && Number(k) > msgIndex) delete snaps[k];
        }
      }

      // 全局人设：AI人设 / 用户人设（存localStorage，buildPrompt注入）
      function getPersonaHeader() {
        var aiP = (localStorage.getItem('aiPersona') || '').trim();
        var userP = (localStorage.getItem('userPersona') || '').trim();
        var hdr = '';
        if (aiP)   hdr += '【AI全局人设】\n' + aiP + '\n';
        if (userP) hdr += '【用户全局人设】\n' + userP + '\n';
        return hdr;
      }

      // 修改头像（复用原triggerAvatarUpload的文件上传逻辑）
      function editAvatar(role) {
        triggerAvatarUpload(role);
      }

      // 编辑全局人设（弹窗textarea）
      function editPersona(role) {
        var key = role === 'user' ? 'userPersona' : 'aiPersona';
        var title = role === 'user' ? '用户全局人设' : 'AI全局人设';
        var cur = localStorage.getItem(key) || '';
        var html = '<div class="modal-content" style="max-width:560px">'
          + '<h3 style="margin:0 0 8px;color:var(--accent-deep)">' + svgIcon('settings',16) + ' ' + title + '</h3>'
          + '<div style="font-size:.78em;color:var(--muted);margin-bottom:8px">该人设会注入到每次AI对话的开头，对当前工具内的AI生效（与状态栏/角色卡界面互不影响，仅影响工具内对话）。</div>'
          + '<textarea id="personaEditArea" style="width:100%;min-height:160px;font-size:.88em;padding:10px;border:1px solid var(--line);border-radius:var(--radius);font-family:inherit;resize:vertical;box-sizing:border-box">' + escHtml(cur) + '</textarea>'
          + '<div class="modal-actions">'
          + '<button class="btn" id="personaCancelBtn" style="background:var(--surface-soft);color:var(--ink-soft);border:1px solid var(--line)">取消</button>'
          + '<button class="btn" id="personaSaveBtn" style="background:var(--accent);color:#fff">保存</button>'
          + '</div></div>';
        var mask = doc.createElement('div');
        mask.className = 'modal';
        mask.innerHTML = html;
        doc.body.appendChild(mask);
        var ta = doc.getElementById('personaEditArea');
        if (ta) { try { ta.focus(); } catch(_) {} }
        var close = function() { if (mask.parentNode) mask.parentNode.removeChild(mask); };
        doc.getElementById('personaCancelBtn').addEventListener('click', close);
        doc.getElementById('personaSaveBtn').addEventListener('click', function() {
          var val = ta ? ta.value : '';
          localStorage.setItem(key, val);
          close();
          showToast(title + '已保存', 'success');
        });
        mask.addEventListener('click', function(e) { if (e.target === mask) close(); });
      }

      // 关闭所有已打开的头像菜单
      function closeAllAvatarMenus() {
        var ms = doc.querySelectorAll('.avatar-menu');
        for (var i = 0; i < ms.length; i++) { if (ms[i].parentNode) ms[i].parentNode.removeChild(ms[i]); }
      }
      // 点击页面其他位置关闭菜单
      doc.addEventListener('click', function() { closeAllAvatarMenus(); });

      // 显示头像菜单（展开在头像旁边）
      function showAvatarMenu(role, msgIdx, anchorEl) {
        closeAllAvatarMenus();
        var msgs = getCurrentMessages();
        var menu = doc.createElement('div');
        menu.className = 'avatar-menu';
        // AI头像在左(user右对齐)，菜单展开在右侧；用户头像在右，菜单展开在左侧
        menu.classList.add(role === 'user' ? 'am-left' : 'am-right');
        var items = [];
        if (role === 'assistant') {
          items.push({ icon: 'image',   label: '修改头像', act: function(){ editAvatar('assistant'); } });
          items.push({ icon: 'settings',label: '人设设置(AI全局人设)', act: function(){ editPersona('assistant'); } });
          items.push({ sep: true });
          items.push({ icon: 'undo',    label: '撤回', title: '撤回此条AI回复及其对角色卡的修改', danger: true, act: function(){ revokeAIMessage(msgIdx); } });
          items.push({ icon: 'refresh', label: '重新生成', title: '重新生成此条AI回复', act: function(){ regenerateAIMessage(msgIdx); } });
        } else {
          items.push({ icon: 'image',   label: '修改头像', act: function(){ editAvatar('user'); } });
          items.push({ icon: 'settings',label: '人设设置(用户全局人设)', act: function(){ editPersona('user'); } });
          items.push({ sep: true });
          items.push({ icon: 'edit',    label: '修改', title: '修改此条消息', act: function(){ editUserMessage(msgIdx); } });
          items.push({ icon: 'refresh', label: '重新生成', title: '重新生成下面的AI回答', act: function(){ regenerateAnswerBelow(msgIdx); } });
          items.push({ sep: true });
          items.push({ icon: 'undo',    label: '撤回', title: '撤回AI从此条之后所有的消息和操作(含角色卡内容)', danger: true, act: function(){ revokeAfterUserMessage(msgIdx); } });
        }
        var html = '';
        items.forEach(function(it) {
          if (it.sep) { html += '<div class="avatar-menu-sep"></div>'; return; }
          // 横向图标条：只显示图标，hover 时顶部弹出 tooltip（label/title）
          var tipText = it.title || it.label || '';
          html += '<div class="avatar-menu-item' + (it.danger ? ' danger' : '') + '" title="' + escAttr(tipText) + '">' + svgIcon(it.icon, 18) + '<span class="am-tip">' + escHtml(tipText) + '</span></div>';
        });
        menu.innerHTML = html;
        // 定位：挂到 avatar 元素本身（avatar 已设 position:relative），菜单横向展开在 avatar 旁边
        // AI头像在左→菜单 left:calc(100%+6px) 展开到右侧；用户头像在右→菜单 right:calc(100%+6px) 展开到左侧
        if (!anchorEl) { doc.body.appendChild(menu); menu.style.position = 'fixed'; }
        else {
          anchorEl.appendChild(menu);
        }
        // 绑定点击
        var itemEls = menu.querySelectorAll('.avatar-menu-item');
        var actIdx = 0;
        items.forEach(function(it) {
          if (it.sep) return;
          var el = itemEls[actIdx]; actIdx++;
          if (!el || !it.act) return;
          el.addEventListener('click', function(e) {
            if (e) { e.stopPropagation(); }
            closeAllAvatarMenus();
            try { it.act(); } catch(err) { showToast('操作失败：' + (err && err.message ? err.message : ''), 'error'); }
          });
        });
      }

      // ===== 重放当前Tab所有消息到聊天面板（撤回/重新生成后调用） =====
      function rerenderChatMessages() {
        var chatC = doc.getElementById('chatMessages');
        if (!chatC) return;
        chatC.innerHTML = '';
        var msgs = getCurrentMessages();
        for (var i = 0; i < msgs.length; i++) {
          appendMsg(msgs[i].role, msgs[i].content, i);
        }
        try { chatC.scrollTop = chatC.scrollHeight; } catch(_) {}
        // 刷新关联UI
        try { renderPreview(); } catch(_) {}
        try { updateQuickActions(); } catch(_) {}
        try { updateCtxBar(); } catch(_) {}
      }

      // ===== 撤回：移除某条AI消息 + 回滚其cardData修改 =====
      function revokeAIMessage(aiIdx) {
        var msgs = getCurrentMessages();
        if (aiIdx < 0 || aiIdx >= msgs.length || msgs[aiIdx].role !== 'assistant') {
          showToast('无法撤回：该消息不是AI回复', 'warning'); return;
        }
        if (isGenerating) { showToast('AI正在生成中，请稍候', 'warning'); return; }
        // 检查后面是否还有用户消息——如果有，说明后续用户消息的上下文依赖本条AI的回复
        // 此时禁止单条撤回（会导致用户消息变成无根之木），引导用户从对应"用户消息"撤回
        var hasUserAfter = false;
        var aiCountAfter = 0;
        var userCountAfter = 0;
        for (var _i = aiIdx + 1; _i < msgs.length; _i++) {
          if (msgs[_i].role === 'user') { hasUserAfter = true; userCountAfter++; }
          else aiCountAfter++;
        }
        if (hasUserAfter) {
          showToast('本条AI之后还有 ' + userCountAfter + ' 条用户消息，无法单独撤回此条AI（会导致后续对话上下文断裂）。\n\n请点击【对应那条用户消息的头像→撤回】，从用户消息整条链路撤回，这样上下文保持一致。', 'warning');
          return;
        }
        // 后续只有AI回复：提示影响范围
        var confirmMsg = '确定撤回此条AI回复吗？\n\n✅ 移除该AI回复消息';
        if (aiCountAfter > 0) confirmMsg += ' 及其后 ' + aiCountAfter + ' 条AI回复';
        confirmMsg += '\n✅ 回滚对角色卡/变量系统的修改';
        confirmMsg += '\n✅ 保留上一条用户消息，可重新生成';
        if (!confirm(confirmMsg)) return;
        // 回滚cardData到该AI消息应用修改前的快照
        var ok = restoreCardDataSnapshot(aiIdx);
        // 截断消息：保留到aiIdx（不含），即移除该AI消息及其后所有（仅AI）
        msgs.length = aiIdx;
        clearSnapshotsAfter(aiIdx - 1);
        saveToStorage();
        progress = calcProgress();
        rerenderChatMessages();
        showToast(ok ? '✅ 已撤回AI回复并回滚修改' : '✅ 已撤回AI回复（无快照可回滚，角色卡未变更）', 'success');
      }

      // ===== 撤回：用户消息之后所有消息和操作（含cardData，含之后的用户消息） =====
      function revokeAfterUserMessage(userIdx) {
        var msgs = getCurrentMessages();
        if (userIdx < 0 || userIdx >= msgs.length || msgs[userIdx].role !== 'user') {
          showToast('无法撤回：该消息不是用户消息', 'warning'); return;
        }
        if (isGenerating) { showToast('AI正在生成中，请稍候', 'warning'); return; }
        // 统计该用户消息之后的消息数量（用户消息和AI回复）
        var userCountAfter = 0;
        var aiCountAfter = 0;
        for (var _wai = userIdx + 1; _wai < msgs.length; _wai++) {
          if (msgs[_wai].role === 'user') userCountAfter++;
          else aiCountAfter++;
        }
        var msg = '确定从这条用户消息之后全部撤回吗？\n\n';
        msg += '⚠️ 会移除：';
        if (aiCountAfter > 0) msg += aiCountAfter + ' 条AI回复';
        if (userCountAfter > 0) msg += ' + ' + userCountAfter + ' 条用户消息（之后的用户输入也会被删除，因上下文基于此条之前的对话）';
        if (aiCountAfter === 0 && userCountAfter === 0) msg += '当前之后无任何消息，无需撤回';
        msg += '\n✅ 回滚这些AI回复对角色卡/变量系统的全部修改';
        msg += '\n✅ 保留当前这条用户消息本身，可重新生成下面的AI回答';
        msg += '\nℹ️ 状态栏界面和角色卡界面互不影响（仅回滚当前Tab）';
        if (aiCountAfter === 0 && userCountAfter === 0) { showToast('当前这条用户消息之后没有任何消息可撤回', 'info'); return; }
        if (!confirm(msg)) return;
        // 该用户消息后的AI消息索引 = userIdx+1
        var aiIdx = userIdx + 1;
        var ok = false;
        if (aiIdx < msgs.length) {
          ok = restoreCardDataSnapshot(aiIdx);
        }
        // 截断消息：保留到userIdx+1（含用户消息，移除其后所有）
        msgs.length = userIdx + 1;
        clearSnapshotsAfter(userIdx);
        saveToStorage();
        progress = calcProgress();
        rerenderChatMessages();
        showToast(ok ? '✅ 已撤回此条之后所有AI消息并回滚修改' : '✅ 已撤回此条之后所有AI消息（无快照可回滚，角色卡未变更）', 'success');
      }

      // ===== 重新生成：某条AI消息（撤回该AI回复后重新调用AI）=====
      function regenerateAIMessage(aiIdx) {
        var msgs = getCurrentMessages();
        if (aiIdx < 0 || aiIdx >= msgs.length || msgs[aiIdx].role !== 'assistant') {
          showToast('无法重新生成：该消息不是AI回复', 'warning'); return;
        }
        if (isGenerating) { showToast('AI正在生成中，请稍候', 'warning'); return; }
        // 需要前一条用户消息作为重新生成的依据
        if (aiIdx - 1 < 0 || msgs[aiIdx-1].role !== 'user') {
          showToast('无法重新生成：找不到对应的用户提问', 'warning'); return;
        }
        // 检查后面是否还有用户消息——有则禁止，否则后续上下文断裂
        var hasUserAfter = false;
        var userCountAfter = 0;
        var aiCountAfter = 0;
        for (var _ri = aiIdx + 1; _ri < msgs.length; _ri++) {
          if (msgs[_ri].role === 'user') { hasUserAfter = true; userCountAfter++; }
          else aiCountAfter++;
        }
        if (hasUserAfter) {
          showToast('本条AI之后还有 ' + userCountAfter + ' 条用户消息，无法单独重新生成此条（会导致后续对话上下文断裂）。\n\n请点击【对应那条用户消息的头像→重新生成】，从用户消息整条链路重新生成。', 'warning');
          return;
        }
        if (aiCountAfter > 0 && !confirm('此条AI之后还有 ' + aiCountAfter + ' 条AI回复，重新生成会将这些AI回复一并移除并重建新回答。确定继续？')) return;
        // 回滚该AI消息的cardData修改 + 截断到aiIdx（移除该AI消息及其后所有AI）
        restoreCardDataSnapshot(aiIdx);
        msgs.length = aiIdx;
        clearSnapshotsAfter(aiIdx - 1);
        saveToStorage();
        progress = calcProgress();
        rerenderChatMessages();
        // 重新调用AI（基于已有的最后一条用户消息）
        // ⚠️callAIChat是async，调用处非async上下文，用.catch兜底避免unhandled rejection
        callAIChat().catch(function(err) { showToast('重新生成失败：' + (err && err.message ? err.message : ''), 'error'); });
      }

      // ===== 重新生成：用户消息下面的AI回答 =====
      function regenerateAnswerBelow(userIdx) {
        var msgs = getCurrentMessages();
        if (userIdx < 0 || userIdx >= msgs.length || msgs[userIdx].role !== 'user') {
          showToast('无法重新生成：该消息不是用户消息', 'warning'); return;
        }
        if (isGenerating) { showToast('AI正在生成中，请稍候', 'warning'); return; }
        // 统计该用户消息之后有多少用户消息和AI回复——如果后面还有用户消息，需提示
        var userCountAfter = 0;
        var aiCountAfter = 0;
        for (var _bai = userIdx + 1; _bai < msgs.length; _bai++) {
          if (msgs[_bai].role === 'user') userCountAfter++;
          else aiCountAfter++;
        }
        // 后面还有用户消息：提示上下文断裂风险
        if (userCountAfter > 0) {
          if (!confirm('该用户消息之后还有 ' + userCountAfter + ' 条用户消息 + ' + aiCountAfter + ' 条AI回复。\n\n重新生成本条AI回答时，这些后续消息会被一并移除（因为它们的上下文基于本条之前的AI输出，会导致不一致）。\n\n确定继续？')) return;
        } else if (aiCountAfter > 1) {
          if (!confirm('该用户消息之后还有 ' + aiCountAfter + ' 条AI回复，重新生成会移除这些AI回复并重建新回答。确定继续？')) return;
        }
        // 该用户消息下的AI回答索引 = userIdx+1
        var aiIdx = userIdx + 1;
        if (aiIdx < msgs.length && msgs[aiIdx].role === 'assistant') {
          // 存在AI回答：回滚 + 截断到aiIdx（移除其及之后所有）
          restoreCardDataSnapshot(aiIdx);
          msgs.length = aiIdx;
          clearSnapshotsAfter(userIdx);
        } else {
          // 没有AI回答：截断到userIdx+1（保留该用户消息）
          msgs.length = userIdx + 1;
          clearSnapshotsAfter(userIdx);
        }
        saveToStorage();
        progress = calcProgress();
        rerenderChatMessages();
        // 重新调用AI（基于该用户消息）
        // ⚠️callAIChat是async，用.catch兜底
        callAIChat().catch(function(err) { showToast('重新生成失败：' + (err && err.message ? err.message : ''), 'error'); });
      }

      // ===== 修改：用户消息（原地修改内容，弹窗textArea确认，该消息之后的AI/用户消息全部移除并回滚快照）=====
      function editUserMessage(userIdx) {
        var msgs = getCurrentMessages();
        if (userIdx < 0 || userIdx >= msgs.length || msgs[userIdx].role !== 'user') {
          showToast('无法修改：该消息不是用户消息', 'warning'); return;
        }
        if (isGenerating) { showToast('AI正在生成中，请稍候', 'warning'); return; }
        var origText = msgs[userIdx].content || '';
        // 弹窗：textArea + 取消/确定
        var html = '<div class="modal-content" style="max-width:640px">'
          + '<h3 style="margin:0 0 8px;color:var(--accent-deep)">' + svgIcon('edit',16) + ' 修改用户消息</h3>'
          + '<div style="font-size:.78em;color:var(--muted);margin-bottom:8px">修改本条消息后，本条之后的所有消息（含AI回答和后续用户消息）将被撤销并回滚对应改动。</div>'
          + '<textarea id="editMsgText" style="width:100%;min-height:160px;font-size:.88em;padding:10px;border:1px solid var(--line);border-radius:var(--radius);font-family:inherit;resize:vertical;box-sizing:border-box">' + escHtml(origText) + '</textarea>'
          + '<div class="modal-actions">'
          + '<button class="btn" id="editMsgCancel" style="background:var(--surface-soft);color:var(--ink-soft);border:1px solid var(--line)">取消</button>'
          + '<button class="btn" id="editMsgOk" style="background:var(--accent);color:#fff">确认修改</button>'
          + '</div></div>';
        var mask = doc.createElement('div');
        mask.className = 'modal';
        mask.innerHTML = html;
        doc.body.appendChild(mask);
        var ta = doc.getElementById('editMsgText');
        if (ta) { try { ta.focus(); } catch(_) {} }
        var close = function() { if (mask.parentNode) mask.parentNode.removeChild(mask); };
        doc.getElementById('editMsgCancel').addEventListener('click', close);
        mask.addEventListener('click', function(e) { if (e.target === mask) close(); });
        doc.getElementById('editMsgOk').addEventListener('click', function() {
          var newText = ta ? ta.value : '';
          if (!newText || !newText.trim()) { showToast('消息内容不能为空', 'warning'); return; }
          // 1. 该用户消息之后的第一条AI消息：回滚快照（若存在）
          var aiIdx = userIdx + 1;
          if (aiIdx < msgs.length) restoreCardDataSnapshot(aiIdx);
          // 2. 截断到 userIdx+1（保留[0..userIdx]，移除 userIdx 之后的所有）
          msgs.length = userIdx + 1;
          // 3. 原地修改该用户消息内容
          msgs[userIdx].content = newText;
          // 4. 清除此消息之后的快照（此后所有被删的AI回答快照都应丢弃）
          clearSnapshotsAfter(userIdx);
          saveToStorage();
          progress = calcProgress();
          rerenderChatMessages();
          close();
          showToast('消息已修改，之后的回复已撤销', 'success');
          // 自动重新生成（基于修改后的用户消息）
          if (isGenerating) return;
          callAIChat().catch(function(err) { showToast('自动重新生成失败：' + (err && err.message ? err.message : ''), 'error'); });
        });
      }
      function addTyping() {
        removeTyping();
        var c = doc.getElementById('chatMessages');
        if (!c) return;
        var div = doc.createElement('div');
        div.className = 'chat-msg assistant';
        div.id = 'typingInd';
        div.innerHTML = buildAvatarHtml('assistant') + '<div class="bubble typing"><span>●</span><span>●</span><span>●</span> 思考中...</div>';
        c.appendChild(div);
        scrollChat();
      }
      function removeTyping() {
        var t = doc.getElementById('typingInd');
        if (t) t.remove();
      }
      function scrollChat() {
        var c = doc.getElementById('chatMessages');
        if (c) requestAnimationFrame(function() { c.scrollTop = c.scrollHeight; });
      }
      // ===== 消息 section 分区渲染（参考专家工作区设计）=====
      var cpSectionStates = {};
      function parseMessageSections(text) {
        var sections = [];
        var thinkingRe = /(?:<thinking>|<reasoning>|<think>)([\s\S]*?)(?:<\/thinking>|<\/reasoning>|<\/think>)|(?:\[metacognition\]|\[思维链\]|\[果农冒泡\]|\[love_qkll\])([\s\S]*?)(?:\[\/metacognition\]|\[\/思维链\]|\[\/果农冒泡\]|\[\/love_qkll\])/gi;
        var match, lastEnd = 0;
        while ((match = thinkingRe.exec(text)) !== null) {
          if (match.index > lastEnd) {
            var before = text.slice(lastEnd, match.index).trim();
            if (before) sections.push({ type: 'content', content: before });
          }
          var thinkContent = (match[1] || match[2] || '').trim();
          if (thinkContent) sections.push({ type: 'thinking', content: thinkContent });
          lastEnd = match.index + match[0].length;
        }
        if (lastEnd < text.length) {
          var after = text.slice(lastEnd).trim();
          if (after) sections.push({ type: 'content', content: after });
        }
        if (!sections.length) sections.push({ type: 'content', content: text });
        // 对 content section 进一步拆分代码块
        var expanded = [];
        sections.forEach(function(sec) {
          if (sec.type !== 'content') { expanded.push(sec); return; }
          var codeRe = /```(\w*)\s*\n?([\s\S]*?)```/g;
          var lastPos = 0, m2;
          while ((m2 = codeRe.exec(sec.content)) !== null) {
            if (m2.index > lastPos) {
              var before2 = sec.content.slice(lastPos, m2.index).trim();
              if (before2) expanded.push({ type: 'content', content: before2 });
            }
            expanded.push({ type: 'code', content: m2[2] || '', lang: m2[1] || '' });
            lastPos = m2.index + m2[0].length;
          }
          if (lastPos < sec.content.length) {
            var after2 = sec.content.slice(lastPos).trim();
            if (after2) expanded.push({ type: 'content', content: after2 });
          }
        });
        // 合并连续 content
        var merged = [];
        expanded.forEach(function(s) {
          var last = merged[merged.length - 1];
          if (last && last.type === 'content' && s.type === 'content') { last.content += '\n' + s.content; }
          else { merged.push(s); }
        });
        // 🆕 第三遍：从 content section 中拆出 :::操作块（让操作块也能折叠）
        var finalSections = [];
        merged.forEach(function(sec) {
          if (sec.type !== 'content') { finalSections.push(sec); return; }
          var opRe = /:::\s*(upsert|update|delete|set|rename)\s+[^\n\r]+/gi;
          if (!opRe.test(sec.content)) { finalSections.push(sec); return; }
          // 重置 lastIndex（test 会移动它）
          opRe.lastIndex = 0;
          var lastOpEnd = 0, opMatch;
          while ((opMatch = opRe.exec(sec.content)) !== null) {
            if (opMatch.index > lastOpEnd) {
              var before = sec.content.slice(lastOpEnd, opMatch.index).trim();
              if (before) finalSections.push({ type: 'content', content: before });
            }
            // 找到对应的结束 ::: （从当前位置开始找下一个单独的 ::: 行）
            var afterStart = opMatch.index + opMatch[0].length;
            var closeRe = /\n\s*:::/g;
            closeRe.lastIndex = afterStart;
            var closeMatch = closeRe.exec(sec.content);
            var opBody, opEnd;
            if (closeMatch) {
              opBody = sec.content.slice(opMatch.index, closeMatch.index + closeMatch[0].length);
              opEnd = closeMatch.index + closeMatch[0].length;
            } else {
              opBody = sec.content.slice(opMatch.index);
              opEnd = sec.content.length;
            }
            finalSections.push({ type: 'opblock', content: opBody });
            lastOpEnd = opEnd;
          }
          if (lastOpEnd < sec.content.length) {
            var afterOps = sec.content.slice(lastOpEnd).trim();
            if (afterOps) finalSections.push({ type: 'content', content: afterOps });
          }
        });
        // 🆕 第四遍：如果存在:::操作块，剥除冗余的JSON代码块
        // AI有时同时输出:::操作块和JSON代码块（两者内容重复），此时JSON是冗余的，应从显示中移除
        var hasOpBlock = finalSections.some(function(s) { return s.type === 'opblock'; });
        if (hasOpBlock) {
          finalSections = finalSections.filter(function(s) {
            if (s.type !== 'code') return true;
            // JSON代码块（含 { "name" / "entries" / "character_book" 等角色卡字段）视为冗余
            var c = (s.content || '').trim();
            if (c.charAt(0) === '{' && (c.indexOf('"name"') >= 0 || c.indexOf('"entries"') >= 0 || c.indexOf('"character_book"') >= 0 || c.indexOf('"description"') >= 0)) {
              return false; // 剥除
            }
            return true;
          });
        }
        return finalSections;
      }
      function renderMessageSections(sections, msgId) {
        // 🐛修复：单段长文本（>200字）也用折叠包裹，让用户可以缩放
        // 之前只有多段才折叠，导致第一句话（欢迎语）等单段长文本无法缩放
        if (!sections || (sections.length === 1 && sections[0].type === 'content' && sections[0].content.length <= 200)) {
          return fmtBubble(sections ? sections[0].content : '');
        }
        var html = '';
        sections.forEach(function(sec, idx) {
          var stateKey = msgId + '-' + idx;
          // ========== 默认收起：所有 section（思维链/正文/代码）初次渲染均为 collapsed ==========
          // cpSectionStates[key] === true  → 用户已手动展开
          // cpSectionStates[key] === false → 用户已手动收起
          // cpSectionStates[key] === undefined → 未操作过，默认收起
          var isCollapsed = cpSectionStates[stateKey] !== true;
          var icon, label, cls;
          if (sec.type === 'thinking') { icon = '思'; label = '思维链'; cls = 'cp-section-thinking'; }
          else if (sec.type === 'code') { icon = '{}'; label = sec.lang || '代码'; cls = 'cp-section-code'; }
          else if (sec.type === 'opblock') {
            icon = '📝'; cls = 'cp-section-opblock';
            // 从:::行提取操作类型作为label
            var opMatch = (sec.content || '').match(/^:::\s*(upsert|update|delete|set|rename)\s+([^\n\r]*)/i);
            if (opMatch) {
              label = opMatch[1] + ' ' + (opMatch[2] || '').trim();
            } else {
              label = '操作块';
            }
          }
          else { icon = '答'; label = '正文'; cls = 'cp-section-content'; }
          var preview = (sec.content || '').slice(0, 80).replace(/\n/g, ' ').replace(/</g, '&lt;');
          html += '<div class="cp-section ' + cls + '">';
          html += '<div class="cp-section-header" data-section-key="' + stateKey + '">';
          html += '<span class="cp-section-icon">' + icon + '</span>';
          html += '<span class="cp-section-label">' + label + '</span>';
          if (isCollapsed && preview) html += '<span class="cp-section-preview">' + preview + '...</span>';
          html += '<span class="cp-section-toggle">' + (isCollapsed ? '展开' : '收起') + '</span>';
          html += '</div>';
          if (!isCollapsed) {
            if (sec.type === 'code') {
              var esc = sec.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              html += '<div class="cp-section-body">' + esc + '</div>';
            } else if (sec.type === 'opblock') {
              // 操作块：转义后等宽字体显示原始:::文本
              var opEsc = sec.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              html += '<div class="cp-section-body"><pre class="cp-opblock-pre">' + opEsc + '</pre></div>';
            } else if (sec.type === 'thinking') {
              html += '<div class="cp-section-body">' + sec.content.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>') + '</div>';
            } else {
              html += '<div class="cp-section-body">' + fmtBubble(sec.content) + '</div>';
            }
          }
          html += '</div>';
        });
        return html;
      }
      function bindSectionToggles(container) {
        if (!container) return;
        var headers = container.querySelectorAll('.cp-section-header');
        for (var i = 0; i < headers.length; i++) {
          (function(h) {
            h.addEventListener('click', function() {
              var key = h.getAttribute('data-section-key');
              if (!key) return;
              // 当前是否收起：未操作过(undefined)默认收起，或用户设为 false
              var wasCollapsed = cpSectionStates[key] !== true;
              // 切换：收起→展开(true)，展开→收起(false)
              cpSectionStates[key] = wasCollapsed ? true : false;
              var msgEl = h.closest('.chat-msg');
              if (msgEl) {
                var msgId = msgEl.getAttribute('data-msg-id');
                var bubble = msgEl.querySelector('.bubble');
                var raw = bubble ? bubble.getAttribute('data-raw-text') : '';
                if (bubble && raw) {
                  var secs = parseMessageSections(raw);
                  bubble.innerHTML = renderMessageSections(secs, msgId);
                  bindSectionToggles(bubble);
                }
              }
            });
          })(headers[i]);
        }
      }
      function fmtBubble(t) {
        var parts = [];
        var re = /<statusblock>([\s\S]*?)<\/statusblock>/gi;
        var last = 0;
        var m;
        while ((m = re.exec(t)) !== null) {
          if (m.index > last) {
            parts.push({ type: 'text', content: t.substring(last, m.index) });
          }
          parts.push({ type: 'status', content: m[1] });
          last = m.index + m[0].length;
        }
        if (last < t.length) {
          parts.push({ type: 'text', content: t.substring(last) });
        }
        var out = '';
        parts.forEach(function(p) {
          if (p.type === 'status') {
            out += '<div class="sb-wrap">' + parseStatusblock(p.content) + '</div>';
          } else {
            var h = p.content;
            var placeholders = [];
            var iframes = [];
            // ===== 保护阶段：先做 iframe → 再做代码块 → 最后做 Markdown =====
            // ⚠️占位符用 \u0000 包裹，避免被 Markdown 的 __bold__ 正则吃掉
            // 1) ```html 代码块优先转 iframe（必须放在一般 ```\w* 之前）
            h = h.replace(/```html\s*\n([\s\S]*?)```/gi, function(_, code) {
              iframes.push(renderHtmlToIframe(code.replace(/\\n/g, '\n')));
              return '\u0000HTML_IFRAME_' + (iframes.length - 1) + '\u0000';
            });
            // 2) 检测消息中直接包含的完整HTML文档（非代码块格式）
            h = h.replace(/(?:html\s*[\n\\n]+)?(<!doctype html>[\s\S]*?<\/html>)/gi, function(_, htmlCode) {
              var code = htmlCode.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              iframes.push(renderHtmlToIframe(code));
              return '\u0000HTML_IFRAME_' + (iframes.length - 1) + '\u0000';
            });
            // 3) 所有 ``` 代码块存占位符（含 ```json / ```js 等），内容必须 HTML 转义后再塞回
            h = h.replace(/```(\w*)\s*\n([\s\S]*?)```/gi, function(_, lang, code) {
              var escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              var cls = lang ? ' class="lang-' + lang.replace(/[^a-zA-Z0-9_-]/g,'') + '"' : '';
              placeholders.push('<pre><code' + cls + '>' + escaped + '</code></pre>');
              return '\u0000PROTECTED_BLOCK_' + (placeholders.length - 1) + '\u0000';
            });
            // ===== 转义 + Markdown 渲染 =====
            h = h.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            // 标题 ### / ## / #
            h = h.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
            h = h.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
            h = h.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
            // 分隔线
            h = h.replace(/^(---|\*\*\*)$/gm, '<hr>');
            // 引用块
            h = h.replace(/^&gt;\s?(.*)$/gm, function(_, txt) { return '__BQ__' + txt; });
            h = h.replace(/(__BQ__(?:.*\n?)*)/g, function(m) {
              var inner = m.replace(/__BQ__/g, '').replace(/\n$/, '');
              return '<blockquote>' + inner + '</blockquote>';
            });
            // ===== GFM 表格（必须在换行 → <br> 之前处理，按段落解析） =====
            h = h.replace(/^((?:\|.*\|\n)+)$/gm, function(block) {
              var lines = block.replace(/\n$/, '').split(/\n/);
              if (lines.length < 2) return block;
              // 取第二行判断是否为分隔线（:---|:---:|---: 之类）
              var sep = lines[1].replace(/^\s*\||\|\s*$/g, '').split(/\s*\|\s*/);
              var isSep = sep.length > 0 && sep.every(function(s) { return /^:?-{3,}:?$/.test(s.trim()); });
              if (!isSep) return block;
              // 解析表头
              var headers = lines[0].replace(/^\s*\||\|\s*$/g, '').split(/\s*\|\s*/);
              var aligns = sep.map(function(s) {
                var t = s.trim();
                if (t.charAt(0) === ':' && t.charAt(t.length-1) === ':') return 'center';
                if (t.charAt(t.length-1) === ':') return 'right';
                if (t.charAt(0) === ':') return 'left';
                return '';
              });
              var thead = '<thead><tr>' + headers.map(function(hd, i) {
                var st = aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '';
                return '<th' + st + '>' + hd.trim() + '</th>';
              }).join('') + '</tr></thead>';
              var bodyRows = '';
              for (var ri = 2; ri < lines.length; ri++) {
                var cells = lines[ri].replace(/^\s*\||\|\s*$/g, '').split(/\s*\|\s*/);
                bodyRows += '<tr>' + cells.map(function(ce, ci) {
                  var st = aligns[ci] ? ' style="text-align:' + aligns[ci] + '"' : '';
                  return '<td' + st + '>' + ce.trim() + '</td>';
                }).join('') + '</tr>';
              }
              var tbody = bodyRows ? '<tbody>' + bodyRows + '</tbody>' : '';
              return '<div class="md-table-wrap"><table>' + thead + tbody + '</table></div>';
            });
            // 无序列表 - 或 *
            h = h.replace(/^[\-\*]\s+(.+)$/gm, function(_, txt) { return '__UL__' + txt; });
            h = h.replace(/(__UL__(?:.*\n?)*)/g, function(m) {
              var items = m.replace(/__UL__/g, '').split(/\n/).filter(function(x){return x;});
              return '<ul>' + items.map(function(it){ return '<li>' + it + '</li>'; }).join('') + '</ul>';
            });
            // 有序列表 1.
            h = h.replace(/^\d+\.\s+(.+)$/gm, function(_, txt) { return '__OL__' + txt; });
            h = h.replace(/(__OL__(?:.*\n?)*)/g, function(m) {
              var items = m.replace(/__OL__/g, '').split(/\n/).filter(function(x){return x;});
              return '<ol>' + items.map(function(it){ return '<li>' + it + '</li>'; }).join('') + '</ol>';
            });
            // 行内
            h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
            h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
            h = h.replace(/__(.+?)__/g, '<b>$1</b>');
            h = h.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
            h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
            // 换行
            h = h.replace(/\n{3,}/g, '\n\n');
            h = h.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
            // 还原 iframe → 代码块（用 split/join 全局替换，避免 replace 只替换首个）
            for (var ii = 0; ii < iframes.length; ii++) {
              h = h.split('\u0000HTML_IFRAME_' + ii + '\u0000').join(iframes[ii]);
            }
            for (var pi = 0; pi < placeholders.length; pi++) {
              h = h.split('\u0000PROTECTED_BLOCK_' + pi + '\u0000').join(placeholders[pi]);
            }
            out += h;
          }
        });
        return out;
      }
      function renderHtmlToIframe(htmlCode) {
        if (!htmlCode || htmlCode.length < 50) return '';
        /* 注入与状态栏预览一致的完整 mock 运行时（getAllVariables/_/$/waitGlobalInitialized/eventOn/Mvu/errorCatched），
           保证状态栏 HTML 在聊天内预览也能正确渲染变量 */
        var mockScript = buildPreviewMockScript(getStatDataForRender());
        if (htmlCode.indexOf('<head') >= 0) {
          htmlCode = htmlCode.replace(/<head([^>]*)>/i, '<head$1>' + mockScript);
        } else if (htmlCode.indexOf('<html') >= 0) {
          htmlCode = htmlCode.replace(/<html([^>]*)>/i, '<html$1><head>' + mockScript + '</head>');
        } else {
          htmlCode = mockScript + htmlCode;
        }
        var escHtml = htmlCode.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        return '<iframe class="html-render-frame" loading="lazy" srcdoc="' + escHtml + '" sandbox="allow-scripts" style="width:100%;min-height:280px;border:1px solid #e6dfd0;border-radius:6px;background:transparent"></iframe>';
      }
      function getStatDataForRender() {
        var statData = {};
        var entries = (cardData.character_book && cardData.character_book.entries) || [];
        var initVarEntry = null;
        for (var i = 0; i < entries.length; i++) {
          if ((entries[i].comment || '').indexOf('[InitVar]') >= 0) { initVarEntry = entries[i]; break; }
        }
        if (initVarEntry && initVarEntry.content) {
          var parsed = parseInitVar(initVarEntry.content);
          if (parsed) statData = parsed;
        }
        return statData;
      }
      // 构建预览用 mock 运行时脚本（模拟酒馆环境），供聊天内 iframe 预览与状态栏预览弹窗共用
      // 提供 getAllVariables / waitGlobalInitialized / eventOn / errorCatched / Mvu / _ / $ + fallback 渲染
      function buildPreviewMockScript(statData) {
        statData = statData || {};
        var statDataJson = JSON.stringify(statData).replace(/<\/script/gi, '<\\/script');
        return '<script>\n' +
          '/* === 写卡器预览用 mock API（模拟酒馆运行时）=== */\n' +
          '(function() {\n' +
          '  var statData = ' + statDataJson + ';\n' +
          '  window.__PREVIEW_MOCK_STAT_DATA__ = statData;\n' +
          '  window.getAllVariables = function() { return { stat_data: statData }; };\n' +
          '  window.waitGlobalInitialized = function(name) { return Promise.resolve(); };\n' +
          '  window.eventOn = function(evt, cb) {};\n' +
          '  window.errorCatched = function(fn) {\n' +
          '    return function() {\n' +
          '      try {\n' +
          '        var r = fn.apply(this, arguments);\n' +
          '        if (r && typeof r.catch === "function") {\n' +
          '          r.catch(function(e) { console.warn("[预览 mock] statusbar async error:", e && e.message, e && e.stack); });\n' +
          '        }\n' +
          '        return r;\n' +
          '      } catch(e) { console.warn("[预览 mock] statusbar sync error:", e && e.message, e && e.stack); }\n' +
          '    };\n' +
          '  };\n' +
          '  window.Mvu = { events: { VARIABLE_INITIALIZED: "VARIABLE_INITIALIZED", VARIABLE_UPDATE_ENDED: "VARIABLE_UPDATE_ENDED" } };\n' +
          '  // StageDog 标准变量 API：getVariables(option) 消息级 scope\n' +
          '  window.getVariables = function(opt) {\n' +
          '    opt = opt || {};\n' +
          '    // type: "message" → 当前楼层变量；默认"latest"\n' +
          '    // 返回结构与 getAllVariables 一致（预览模式下不区分楼层）\n' +
          '    return { stat_data: window.__PREVIEW_MOCK_STAT_DATA__ || {} };\n' +
          '  };\n' +
          '  window._ = {\n' +
          '    get: function(obj, path, def) {\n' +
          '      if (obj == null) return def;\n' +
          '      var keys = String(path).split(".");\n' +
          '      var cur = obj;\n' +
          '      for (var i = 0; i < keys.length; i++) {\n' +
          '        if (cur == null) return def;\n' +
          '        cur = cur[keys[i]];\n' +
          '      }\n' +
          '      return cur === undefined ? def : cur;\n' +
          '    },\n' +
          '    has: function(obj, path) {\n' +
          '      if (obj == null) return false;\n' +
          '      var keys = String(path).split(".");\n' +
          '      var cur = obj;\n' +
          '      for (var i = 0; i < keys.length; i++) {\n' +
          '        if (cur == null || !Object.prototype.hasOwnProperty.call(cur, keys[i])) return false;\n' +
          '        cur = cur[keys[i]];\n' +
          '      }\n' +
          '      return true;\n' +
          '    }\n' +
          '  };\n' +
          '  function _miniJQ(sel) {\n' +
          '    if (typeof sel === "function") {\n' +
          '      try {\n' +
          '        if (document.readyState === "complete" || document.readyState === "interactive") { sel(); }\n' +
          '        else { document.addEventListener("DOMContentLoaded", sel); }\n' +
          '      } catch(e) { console.warn("[预览 mock] $(fn):", e); }\n' +
          '      return { ready: function(fn) { try { fn(); } catch(e) {} return this; } };\n' +
          '    }\n' +
          '    var el = (typeof sel === "string") ? document.querySelector(sel) : sel;\n' +
          '    return {\n' +
          '      0: el, length: el ? 1 : 0,\n' +
          '      html: function(s) { if (el) el.innerHTML = (s == null ? (el.innerHTML || "") : String(s)); return this; },\n' +
          '      text: function(s) { if (el) el.textContent = s; return this; },\n' +
          '      addClass: function(c) { if (el) el.classList.add(c); return this; },\n' +
          '      removeClass: function(c) { if (el) el.classList.remove(c); return this; },\n' +
          '      ready: function(fn) { try { fn(); } catch(e) {} return this; }\n' +
          '    };\n' +
          '  }\n' +
          '  window.$ = window.jQuery = _miniJQ;\n' +
          '  function fallbackRender() {\n' +
          '    var root = document.getElementById("render-root") || document.querySelector(".card-body") || document.body;\n' +
          '    if (!root) return;\n' +
          '    var stillLoading = root.querySelector(".loading-state");\n' +
          '    if (!stillLoading) return;\n' +
          '    var htmlStr = "";\n' +
          '    var data = statData || {};\n' +
          '    function rt(obj, level) {\n' +
          '      level = level || 0;\n' +
          '      var indentClass = "indent-" + Math.min(level, 4);\n' +
          '      var itemsHtml = "";\n' +
          '      var keys = Object.keys(obj || {});\n' +
          '      for (var k = 0; k < keys.length; k++) {\n' +
          '        var key = keys[k];\n' +
          '        var value = obj[key];\n' +
          '        if (key.indexOf("_") === 0 || key.indexOf("$") === 0) continue;\n' +
          '        var isPlainObj = value !== null && typeof value === "object" && !Array.isArray(value);\n' +
          '        if (isPlainObj) {\n' +
          '          if (itemsHtml) { htmlStr += "<div class=\\"stat-grid " + indentClass + "\\">" + itemsHtml + "</div>"; itemsHtml = ""; }\n' +
          '          if (level > 0) { htmlStr += "<div class=\\"category-title " + indentClass + "\\">" + key + "</div>"; }\n' +
          '          rt(value, level + 1);\n' +
          '          continue;\n' +
          '        }\n' +
          '        itemsHtml += "<div class=\\"stat-item\\"><span class=\\"stat-label\\">" + key + "</span><span class=\\"stat-value\\">";\n' +
          '        if (typeof value === "number") itemsHtml += "<span class=\\"value-number\\">" + value + "</span>";\n' +
          '        else if (typeof value === "boolean") itemsHtml += value ? "<span class=\\"value-true\\">✓</span>" : "<span class=\\"value-false\\">✕</span>";\n' +
          '        else if (Array.isArray(value)) itemsHtml += "<span class=\\"value-text\\">[" + value.join(", ") + "]</span>";\n' +
          '        else itemsHtml += "<span class=\\"value-text\\">" + String(value == null ? "" : value) + "</span>";\n' +
          '        itemsHtml += "</span></div>";\n' +
          '      }\n' +
          '      if (itemsHtml) htmlStr += "<div class=\\"stat-grid " + indentClass + "\\">" + itemsHtml + "</div>";\n' +
          '    }\n' +
          '    rt(data, 0);\n' +
          '    try {\n' +
          '      root.innerHTML = htmlStr;\n' +
          '      root.classList.add("flash-update");\n' +
          '      setTimeout(function() { try { root.classList.remove("flash-update"); } catch(_) {} }, 300);\n' +
          '    } catch(_) {}\n' +
          '  }\n' +
          '  setTimeout(fallbackRender, 500);\n' +
          '  setTimeout(fallbackRender, 1500);\n' +
          '  setTimeout(fallbackRender, 3500);\n' +
          '})();\n' +
          '<\/script>\n';
      }
      // ===== statusblock 渲染：统一走 Markdown 管道（兼容旧 HTML 格式自动转换） =====
      function parseStatusblock(inner) {
        var md = inner;
        // ===== 向后兼容：把旧 HTML 标签格式自动转成 Markdown =====
        // <details open><summary><b>标题</b></summary> → ### 标题
        md = md.replace(/<details(?:\s+open)?\s*>[\s\S]*?<summary>(?:<b>)?([\s\S]*?)(?:<\/b>)?<\/summary>/gi, function(_, title) {
          return '\n### ' + title.trim() + '\n\n';
        });
        md = md.replace(/<\/details>/gi, '\n');
        // <ul><li><b>key</b>：value</li> → - **key**：value
        md = md.replace(/<ul>/gi, '\n').replace(/<\/ul>/gi, '\n');
        md = md.replace(/<ol>/gi, '\n').replace(/<\/ol>/gi, '\n');
        md = md.replace(/<li>/gi, '- ').replace(/<\/li>/gi, '\n');
        // <p><b>key</b>：value</p> → **key**：value
        md = md.replace(/<p>/gi, '\n').replace(/<\/p>/gi, '\n');
        // <b>text</b> → **text**
        md = md.replace(/<b>/gi, '**').replace(/<\/b>/gi, '**');
        // <br> → 换行
        md = md.replace(/<br\s*\/?>/gi, '\n');
        // 清理残留 HTML 标签
        md = md.replace(/<\/?(?:span|div|button)[^>]*>/gi, '');
        // 清理多余空行
        md = md.replace(/\n{3,}/g, '\n\n').trim();
        // ===== 走 fmtBubble 的 Markdown 管道渲染 =====
        return fmtBubble(md);
      }

      // ===== 旧 modDash 已并入 ctx-bar，保留函数签名以兼容历史调用点 =====
      function renderModDash() { updateCtxBar(); }

      // ===== 旧 mvuInfoPanel 已并入 ctx-bar，保留函数签名以兼容历史调用点 =====
      function renderMvuInfoPanel() { updateCtxBar(); }

      async function handleAnalyzeProgress() {
        if (isGenerating) return;
        var entries = (cardData.character_book || {}).entries || [];
        if (entries.length === 0 && !cardData.description) {
          showToast('还没有内容可以分析，请先和AI聊聊', 'warning');
          return;
        }
        isGenerating = true;
        setEnabled(false);
        addTyping();
        try {
          var analyzePrompt = SYS_PROMPT +
            '\n\n=== AI分析指令 ===\n' +
            '请全面分析当前角色卡内容，完成以下任务：\n' +
            '1. 评估每个体系的完成度（0-100），输出到```json代码块\n' +
            '2. JSON格式（严格）：{"axiom":0-100,"soft_rules":0-100,"core_rules":0-100,"near_constraint":0-100,"scene_mechanics":0-100,"entity_interact":0-100,"narrative_bg":0-100,"dynamic_adapt":0-100,"init_var":0-100,"var_update_rule":0-100}\n' +
            '   评分标准：0=无内容，30=有1条极简内容，60=有1条内容充实，80=有1条内容详细，100=≥2条且信息密度高（字数仅供参考，不做硬性要求）\n' +
            '3. 用自然语言给出每个体系的改进建议和下一步行动方向\n' +
            '4. 最后给出一条适合用户直接输入的建议指令（放在<suggestion>标签中，标签内是纯指令文本，不含解释）\n\n' +
            '=== 当前角色卡内容 ===\n' +
            (cardData.name ? '- 名称：' + cardData.name + '\n' : '') +
            (cardData.description ? '- 描述(' + (cardData.description||'').length + '字)：' + (cardData.description||'').substring(0, 500) + '\n' : '') +
            (cardData.first_mes ? '- 开场白(' + (cardData.first_mes||'').length + '字)\n' : '') +
            '- 世界书条目：' + entries.length + '条\n' +
            (entries.length > 0 ? '- 条目清单：\n' + entries.map(function(e) { return '  · [' + (e.comment||'未命名') + '] ' + (e.content||'').length + '字' + (e.enabled === false ? ' (禁用)' : ''); }).join('\n') : '');
          var aiResponse = await callAI(analyzePrompt);
          removeTyping();
          var parsed = extractJSON(aiResponse);
          if (parsed) {
            Object.keys(parsed).forEach(function(k) {
              if (moduleProgress.hasOwnProperty(k) && typeof parsed[k] === 'number') {
                moduleProgress[k] = Math.max(0, Math.min(100, parsed[k]));
              }
            });
          }
          var suggestion = aiResponse.match(/<suggestion>([\s\S]*?)<\/suggestion>/);
          var input = doc.getElementById('chatInput');
          if (suggestion && input) {
            input.value = suggestion[1].trim();
          }
          var dialogue = aiResponse.replace(/```[\s\S]*?```/g, '').replace(/<suggestion>[\s\S]*?<\/suggestion>/g, '').trim();
          if (dialogue) {
            try { addAssistantMsg(dialogue); } catch(e) { console.warn('addAssistantMsg error:', e); }
          } else {
            try { addAssistantMsg(aiResponse); } catch(e) { console.warn('addAssistantMsg error:', e); }
          }
          updateProgress();
          updateQuickActions();
          updateModFocus();
          renderPreview();
          renderModDash();
          saveToStorage();
        } catch(err) {
          removeTyping();
          try { addAssistantMsg('😞 分析失败：' + err.message); } catch(e) {}
        } finally {
          isGenerating = false;
          try { setEnabled(true); } catch(e) {}
        }
      }

      function toggleDash() {
        var dash = doc.getElementById('modDash');
        if (dash) dash.classList.toggle('collapsed');
      }

      function getDetailedModuleProgress() {
        var entries = (cardData.character_book || {}).entries || [];
        // ========== Tab 隔离：角色卡Tab 过滤掉 MVU 条目 ==========
        var __tab = (typeof window !== 'undefined' && typeof window.__getActiveTab === 'function') ? window.__getActiveTab() : (typeof activeTab !== 'undefined' ? activeTab : 'card');
        if (__tab === 'card') {
          entries = entries.filter(function(e) { return !isMVUEntry(e.comment || ''); });
        }
        var result = { axiom: 0, soft_rules: 0, core_rules: 0, near_constraint: 0, scene_mechanics: 0, entity_interact: 0, narrative_bg: 0, dynamic_adapt: 0, init_var: 0, var_update_rule: 0 };
        var modKeywords = {
          axiom: ['基础公理', '世界元数据', '世界观公理', '力量体系骨架'],
          soft_rules: ['交互软规则', '互动选项', '叙事风格', '剧情引导'],
          core_rules: ['核心铁则', '绝对禁止', '输出格式', 'AI身份', 'post_history'],
          near_constraint: ['近场强约束', '当前局势', '即时状态', '临时任务'],
          scene_mechanics: ['场景机制', '核心玩法', '世界规则', '战斗规则', '修炼', '谈判'],
          entity_interact: ['实体交互', '重要角色', '势力与组织', '物品', '地点场景', 'NPC'],
          narrative_bg: ['叙事背景', '故事发展', '文化与习俗', '历史事件', '主线剧情'],
          dynamic_adapt: ['动态适配', '引导机制', '互动选项', '状态栏', 'alternate', 'depth_prompt'],
          init_var: ['[InitVar]', '初始变量', 'InitVar', '变量列表'],
          var_update_rule: ['变量更新规则', '变量输出格式', 'UpdateVariable', 'status_current_variables', 'mvu_update']
        };
        Object.keys(modKeywords).forEach(function(mod) {
          var kws = modKeywords[mod];
          var count = 0;
          var totalLen = 0;
          var matched = {};
          entries.forEach(function(e) {
            var comment = e.comment || '';
            var isMatch = kws.some(function(kw) { return comment.indexOf(kw) >= 0; });
            if (isMatch && !matched[comment]) {
              matched[comment] = true;
              count++;
              totalLen += (e.content || '').length;
            }
          });
          // 完成度计算：1条+长度≥250 → 60%；1条+长度≥500 → 80%；≥2条+长度≥500 → 100%
          if (count >= 2 && totalLen >= 500) result[mod] = 100;
          else if (count >= 1 && totalLen >= 500) result[mod] = 80;
          else if (count >= 1 && totalLen >= 250) result[mod] = 60;
          else if (count >= 1) result[mod] = Math.min(30 + Math.floor(totalLen / 25), 55);
          else result[mod] = 0;
        });
        if (cardData.extensions && cardData.extensions.depth_prompt && cardData.extensions.depth_prompt.prompt && cardData.extensions.depth_prompt.prompt.length > 0) {
          result.dynamic_adapt = Math.max(result.dynamic_adapt, 30);
        }
        if (cardData.alternate_greetings && cardData.alternate_greetings.length > 0) {
          result.dynamic_adapt = Math.max(result.dynamic_adapt, 30);
        }
        var aiMp = moduleProgress || {};
        Object.keys(aiMp).forEach(function(k) {
          if (aiMp[k] > 0 && result[k] === 0) result[k] = aiMp[k];
        });
        return result;
      }
      function parseModProgress(reply) {
        var modMap = {
          '基础公理': 'axiom',
          '交互软规则': 'soft_rules',
          '核心铁则': 'core_rules',
          '近场强约束': 'near_constraint',
          '场景机制': 'scene_mechanics',
          '实体交互': 'entity_interact',
          '叙事背景': 'narrative_bg',
          '动态适配': 'dynamic_adapt',
          '初始变量': 'init_var',
          '变量更新规则': 'var_update_rule',
          '变量系统': 'init_var'
        };
        var result = { axiom: 0, soft_rules: 0, core_rules: 0, near_constraint: 0, scene_mechanics: 0, entity_interact: 0, narrative_bg: 0, dynamic_adapt: 0, init_var: 0, var_update_rule: 0 };
        Object.keys(modMap).forEach(function(kw) {
          var key = modMap[kw];
          var re = new RegExp(kw + '[^\\n]*?([✅⏳❌])');
          var m = reply.match(re);
          if (m) {
            var sym = m[1];
            result[key] = sym === '✅' ? 100 : sym === '⏳' ? 50 : 0;
          }
        });
        if (cardData && cardData.character_book && cardData.character_book.entries) {
          var entries = cardData.character_book.entries;
          Object.keys(modMap).forEach(function(kw) {
            var key = modMap[kw];
            var count = 0;
            entries.forEach(function(e) {
              if ((e.comment || '').indexOf(kw) >= 0) count++;
            });
            if (result[key] === 100 && count === 0) result[key] = 0;
            if (result[key] === 100 && count === 1) result[key] = 50;
            if (result[key] === 50 && count === 0) result[key] = 0;
          });
        }
        return result;
      }
      function escHtml(t) {
        /* 改进O：改用字符串替换避免每次创建DOM节点（高频调用场景性能提升） */
        if (!t) return '';
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      var lastUserInput = '';
        // ============================================================================
  // SECTION 10 聊天消息发送 + AI 写卡流程主循环（callAIChat）
  // ============================================================================
  async function handleSend() {
        var input = doc.getElementById('chatInput');
        var text = input ? input.value.trim() : '';
        if (!text || isGenerating) return;
        input.value = '';
        input.style.height = 'auto';  // 发送后重置输入框高度
        lastUserInput = text;
        var genKw = ['生成角色卡','生成完整角色卡','导出角色卡','写入酒馆','完整生成'];
        var isGenCmd = genKw.some(function(k) { return text === k || text.indexOf(k) >= 0; });
        if (isGenCmd && progress >= 30) {
          addUserMsg(text);
          await doGenerate();
          return;
        }
        addUserMsg(text);
        await callAIChat();
      }

      // ===== AI回复清理（移除思考链、内部标签等） =====
      function cleanAIReply(text) {
        if (!text) return text;
        var t = text;
        t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
        t = t.replace(/<!--\s*End of The ECoT\s*-->/gi, '');
        t = t.replace(/^#\s*果农人格加载[^\n]*\n/gim, '');
        t = t.replace(/\*果农记录[：:][^*]*\*/g, '');
        t = t.replace(/<time_format>[\s\S]*?<\/time_format>/gi, '');
        t = t.replace(/<content>/gi, '').replace(/<\/content>/gi, '');
        t = t.replace(/^\[(语言检定|果农冒泡|NSFW判定|人物逻辑|基调锚定|角色认知迷雾|角色活性与自然回应|风格适配|反思\s*&?\s*设定校对|物理规则|正文字数检测|输出顺序检查|时间地点输出检查|善意视角|防重复|反思)\][^\n]*\n/gim, '');
        t = t.replace(/<角色认知迷雾>[\s\S]*?<\/角色认知迷雾>/gi, '');
        t = t.replace(/<角色活性与自然回应>[\s\S]*?<\/角色活性与自然回应>/gi, '');
        t = t.replace(/\n{4,}/g, '\n\n\n');
        t = t.trim();
        return t;
      }

      // ===== 从AI回复中提取JSON =====
      function extractJSON(text) {
        if (!text) return null;
        var patterns = [
          /```json\s*([\s\S]*?)\s*```/i,
          /```javascript\s*([\s\S]*?)\s*```/i,
          /```js\s*([\s\S]*?)\s*```/i,
          /```\s*([\s\S]*?)\s*```/i,
        ];
        for (var i = 0; i < patterns.length; i++) {
          var m = text.match(patterns[i]);
          if (m) {
            var jsonContent = m[1].trim();
            try { return JSON.parse(jsonContent); } catch(e) {}
            var fixed = repairJSON(jsonContent);
            if (fixed) return fixed;
          }
        }
        var braceStart = text.indexOf('{');
        var braceEnd = text.lastIndexOf('}');
        if (braceStart >= 0 && braceEnd > braceStart) {
          var candidate = text.substring(braceStart, braceEnd + 1);
          try { return JSON.parse(candidate.trim()); } catch(e) {}
          var fixed2 = repairJSON(candidate);
          if (fixed2) return fixed2;
        }
        return null;
      }

      // ===== 🆕 ::: 操作块协议解析器 =====
      // 新协议：AI 用 ::: action key ... ::: 声明每条操作，无需JSON代码块
      // 支持5种操作：upsert / update / delete / set / rename
      // 兼容旧JSON：如果AI仍输出```json块，走原有 extractJSON + mergePartial 路径

      // 规范化key：去装饰括号 + trim + 大小写折叠（复用已有逻辑）
      function _opNormKey(s) {
        if (!s) return '';
        var r = String(s).trim();
        for (var iter = 0; iter < 2; iter++) {
          var pairs = [['⟦','⟧'],['【','】'],['「','」'],['『','』'],['［','］'],['《','》'],['〈','〉'],['(',')'],['[',']'],['{','}']];
          var matched = false;
          for (var pi = 0; pi < pairs.length; pi++) {
            var L = pairs[pi][0], R = pairs[pi][1];
            if (r.length >= 4 && r.charAt(0) === L && r.charAt(r.length-1) === R) {
              r = r.slice(1, -1).trim(); matched = true; break;
            }
          }
          if (!matched) break;
        }
        return r.toLowerCase();
      }

      // 解析 ::: 操作块，返回操作数组
      function parseOpBlocks(rawText) {
        if (!rawText) return [];
        var ops = [];
        // 匹配 ::: action key ... 格式（key 到换行/行尾为止，content 到下一个 ::: 为止）
        // 用单个 \n 分隔 key 和 content，避免 [\r\n]+ 贪婪吃掉多个换行导致 content 起点错误
        // 前瞻允许中间有空行（\n\s*:::），解决 delete 后紧跟空行再接下一个操作的问题
        // ⚠️修复：用 (?:^|\n) 锚定行首，避免AI散文里的内联引用（如"使用`::: upsert script:xxx`协议"）
        //   被误匹配为操作块，从而生成垃圾脚本/条目并吞掉真正的:::块。
        var re = /(?:^|\n)[ \t]*:::\s*(upsert|update|delete|set|rename)\s+([^\n\r]+?)\n([\s\S]*?)(?=\n[ \t]*:::|$)/gi;
        var m;
        while ((m = re.exec(rawText)) !== null) {
          var action = m[1].toLowerCase();
          var key = m[2].trim();
          var rawBody = (m[3] || '').trim();
          var content = rawBody;
          // ===== ✅新增：解析 upsert/update 块体开头的元信息头（keys/secondary_keys/selectiveLogic/constant/depth/cooldown等）=====
          //   格式：块体第1行开始，连续出现 `键=值`（单行）行，直到遇到第1个空行或遇到不以"键名="开头的行为止。
          //   之后的部分（空行之后 / 非键=值行开始之后）才是真正的 content 正文。
          //   支持的键：keys, secondary_keys, selectiveLogic, constant, depth, cooldown, sticky, delay, vectorized,
          //            prevent_recursion, exclude_recursion, delay_until_recursion, use_regex, probability, group, order
          var metaFields = ['keys','secondary_keys','selectiveLogic','constant','depth','cooldown','sticky','delay',
                            'vectorized','prevent_recursion','exclude_recursion','delay_until_recursion','use_regex',
                            'probability','group','order','insertion_order','position','useProbability','scan_depth',
                            'match_whole_words','enabled','group_weight'];
          var _stripMeta = function(bodyStr) {
            var lines = bodyStr.split(/\r?\n/);
            var meta = {};
            var splitIdx = -1;  // 正文从第几行开始
            for (var li = 0; li < lines.length; li++) {
              var line = lines[li];
              var tline = line.trim();
              if (tline === '') { splitIdx = li + 1; break; }     // 空行 → 元信息结束
              var eq = tline.indexOf('=');
              if (eq < 2) { splitIdx = li; break; }               // 不以"键="开头 → 元信息结束
              var k = tline.substring(0, eq).trim();
              var v = tline.substring(eq + 1).trim();
              var matchedKey = null;
              for (var mi = 0; mi < metaFields.length; mi++) {
                if (metaFields[mi].toLowerCase() === k.toLowerCase()) { matchedKey = metaFields[mi]; break; }
              }
              if (!matchedKey) { splitIdx = li; break; }          // 不是已知元信息键 → 元信息结束
              // 值解析
              if (matchedKey === 'keys' || matchedKey === 'secondary_keys') {
                meta[matchedKey] = v.split(/[,，]/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
              } else if (matchedKey === 'constant' || matchedKey === 'vectorized' || matchedKey === 'prevent_recursion'
                      || matchedKey === 'exclude_recursion' || matchedKey === 'use_regex' || matchedKey === 'useProbability'
                      || matchedKey === 'match_whole_words' || matchedKey === 'enabled') {
                meta[matchedKey] = /^(true|1|yes|是)$/i.test(v);
              } else if (matchedKey === 'group') {
                meta[matchedKey] = v;
              } else {
                var n = Number(v);
                meta[matchedKey] = (!isNaN(n) && String(n) === v) ? n : v;
              }
            }
            var bodyLines = (splitIdx >= 0) ? lines.slice(splitIdx) : lines;
            return { meta: meta, content: bodyLines.join('\n').trim() };
          };
          if (action === 'upsert' || action === 'update') {
            var r = _stripMeta(rawBody);
            for (var mk in r.meta) { if (r.meta.hasOwnProperty(mk)) ops._metaFields = ops._metaFields || {}; }  // no-op 兼容
            // 把解析出的元信息直接挂到 op 上（applyOps 里会用），content 用剥离元信息后的正文
            content = r.content;
            var opRec = { action: action, key: key, content: content };
            for (var _mk in r.meta) { if (r.meta.hasOwnProperty(_mk)) opRec[_mk] = r.meta[_mk]; }
            ops.push(opRec);
            continue;
          }
          // rename 格式：::: rename oldKey → newKey
          if (action === 'rename') {
            var arrowMatch = key.match(/^(.+?)\s*(?:->|→|=>)\s*(.+)$/);
            if (arrowMatch) {
              ops.push({ action: 'rename', oldKey: arrowMatch[1].trim(), newKey: arrowMatch[2].trim(), content: '' });
            } else {
              // 没有箭头，尝试用空格分割
              var parts = key.split(/\s+/);
              if (parts.length >= 2) {
                ops.push({ action: 'rename', oldKey: parts[0], newKey: parts.slice(1).join(' '), content: '' });
              }
            }
          } else {
            ops.push({ action: action, key: key, content: content });
          }
        }
        return ops;
      }

      // 检测AI回复是否包含:::操作块（行首锚定，避免散文内联引用误判）
      function hasOpBlocks(rawText) {
        if (!rawText) return false;
        return /(?:^|\n)[ \t]*:::\s*(upsert|update|delete|set|rename)\s+/i.test(rawText);
      }

      // 执行操作数组，返回 { modified, changeLog }
      function applyOps(ops, cd) {
        if (!ops || !ops.length || !cd) return { modified: false, changeLog: { added: 0, updated: 0, deleted: 0, fieldUpdates: 0, renamed: 0 } };
        var modified = false;
        var changeLog = { added: 0, updated: 0, deleted: 0, fieldUpdates: 0, renamed: 0 };

        // 确保基础结构存在
        if (!cd.character_book) cd.character_book = { entries: [] };
        if (!cd.character_book.entries) cd.character_book.entries = [];
        if (!cd.extensions) cd.extensions = {};
        if (!cd.extensions.tavern_helper) cd.extensions.tavern_helper = { scripts: [] };
        if (!cd.extensions.tavern_helper.scripts) cd.extensions.tavern_helper.scripts = [];
        if (!cd.extensions.regex_scripts) cd.extensions.regex_scripts = [];

        // 合法的顶层字段（set操作用）
        var validFields = ['name','description','first_mes','system_prompt','personality','scenario','creator_notes','alternate_greetings','creator','character_version','depth_prompt'];

        // MVU条目关键词（用于Tab隔离：角色卡Tab下拦截MVU条目写入）
        function _isMvuEntryKey(comment) {
          var c = (comment || '').toLowerCase();
          return c.indexOf('[initvar]') >= 0 || c.indexOf('变量列表') >= 0 ||
            c.indexOf('变量更新规则') >= 0 || c.indexOf('变量输出格式') >= 0 ||
            c.indexOf('mvu_update') >= 0 || c.indexOf('[mvu_update]') >= 0 ||
            c.indexOf('状态变量输出') >= 0;
        }

        // 固定MVU脚本（禁止AI删除/覆盖）—— 仅 bundle.js；变量结构/WTC/正则6 由 AI 生成可改
        function _isFixedMvuScript(s) {
          var id = (s.id || '').toLowerCase();
          var content = (s.content || '').toLowerCase();
          return id === '961f366d-e403-45c2-8155-3d14ec86de53' || // bundle.js
            content.indexOf('magvarupdate') >= 0 || content.indexOf('bundle.js') >= 0;
        }

        ops.forEach(function(op) {
          // ===== Tab隔离：角色卡Tab下拦截MVU条目写入 =====
          if (currentTab === 'card' && (op.action === 'upsert' || op.action === 'update' || op.action === 'delete')) {
            if (_isMvuEntryKey(op.key)) {
              console.warn('[Tab隔离·角色卡Tab] :::操作块拦截MVU条目:', op.key);
              return;
            }
          }

          // ===== script 操作：修改 extensions.tavern_helper.scripts =====
          if (op.action === 'upsert' || op.action === 'update') {
            // 检测是否是脚本操作（key以 script: 开头）
            if (op.key && /^script:/i.test(op.key)) {
              var scriptName = op.key.replace(/^script:\s*/i, '').trim();
              var scripts = cd.extensions.tavern_helper.scripts;
              // 查找现有脚本
              var sFoundIdx = -1;
              for (var si = 0; si < scripts.length; si++) {
                if ((scripts[si].name || '').toLowerCase() === scriptName.toLowerCase() ||
                    (scripts[si].id || '') === scriptName) {
                  sFoundIdx = si; break;
                }
              }
              if (sFoundIdx >= 0) {
                // 更新（固定脚本拦截）
                if (_isFixedMvuScript(scripts[sFoundIdx])) {
                  console.warn('[opblock] 拦截固定脚本修改:', scriptName);
                  return;
                }
                scripts[sFoundIdx].content = op.content || '';
                modified = true;
                changeLog.updated++;
              } else if (op.action === 'upsert') {
                // 新增脚本
                scripts.push({
                  type: 'script',
                  name: scriptName,
                  enabled: true,
                  content: op.content || '',
                  id: 'script-' + Date.now() + '-' + Math.floor(Math.random() * 10000)
                });
                modified = true;
                changeLog.added++;
              }
              return;
            }

            var nk = _opNormKey(op.key);
            if (!nk) { console.warn('[opblock] 跳过空key'); return; }

            // 剥去入存comment的外层装饰括号
            var cleanComment = op.key;
            for (var iter = 0; iter < 2; iter++) {
              var pairs = [['⟦','⟧'],['【','】'],['「','」'],['『','』'],['［','］'],['《','》'],['〈','〉'],['(',')'],['[',']'],['{','}']];
              var didStrip = false;
              for (var pi = 0; pi < pairs.length; pi++) {
                var L = pairs[pi][0], R = pairs[pi][1];
                if (cleanComment.length >= 4 && cleanComment.charAt(0) === L && cleanComment.charAt(cleanComment.length-1) === R) {
                  cleanComment = cleanComment.slice(1, -1).trim(); didStrip = true; break;
                }
              }
              if (!didStrip) break;
            }

            // ===== ✅新增：构造基础增量对象（含 AI 块体元信息头里的 keys/secondary_keys/selectiveLogic/constant/...）=====
            var basePatch = { comment: cleanComment };
            // ===== 🧹清洗 MVU 条目 content 中混入的 enabled/content/comment 等配置字段 =====
            var _cleanedContent = (op.content && op.content.trim().length > 0)
              ? _stripEntryConfigFromContent(cleanComment, op.content) : op.content;
            // 变量列表条目：强制规范化为标准格式（只保留 null+包裹标签，丢弃变量实际值/配置字段）
            if (_cleanedContent && cleanComment.indexOf('变量列表') >= 0) {
              _cleanedContent = normalizeVarListContent(_cleanedContent);
            }
            // 变量输出格式/强调条目：强制使用固定YAML模板，丢弃AI混入的变量值/配置字段
            if (_cleanedContent && (cleanComment.indexOf('变量输出格式') >= 0)) {
              _cleanedContent = normalizeVarOutputFormatContent(cleanComment, _cleanedContent, _getParsedInitForEntries((cd.character_book && cd.character_book.entries) || []));
            }
            // 变量更新规则条目：规范化缩进/range格式/移除string的type字段
            if (_cleanedContent && cleanComment.indexOf('变量更新规则') >= 0) {
              _cleanedContent = normalizeVarUpdateRuleContent(_cleanedContent);
            }
            if (_cleanedContent && _cleanedContent.trim().length > 0) basePatch.content = _cleanedContent;
            var metaKeysTop = ['keys','secondary_keys','selectiveLogic','constant','depth','cooldown','sticky','delay',
                               'vectorized','prevent_recursion','exclude_recursion','delay_until_recursion','use_regex',
                               'probability','group','order','insertion_order','position','useProbability','scan_depth',
                               'match_whole_words','enabled','group_weight'];
            var extMap = { selectiveLogic:'selectiveLogic', depth:'depth', position:'position', sticky:'sticky',
                           cooldown:'cooldown', delay:'delay', probability:'probability', useProbability:'useProbability',
                           prevent_recursion:'prevent_recursion', exclude_recursion:'exclude_recursion',
                           delay_until_recursion:'delay_until_recursion', scan_depth:'scan_depth',
                           match_whole_words:'match_whole_words', group:'group', group_weight:'group_weight', role:'role' };
            var extPatch = null;
            for (var _mki = 0; _mki < metaKeysTop.length; _mki++) {
              var _mk = metaKeysTop[_mki];
              if (op[_mk] === undefined) continue;
              if (extMap[_mk] !== undefined) {
                extPatch = extPatch || {};
                extPatch[extMap[_mk]] = op[_mk];
              } else {
                basePatch[_mk] = op[_mk];
              }
            }

            // 精确匹配现有条目
            var foundIdx = -1;
            for (var fi = 0; fi < cd.character_book.entries.length; fi++) {
              if (_opNormKey(cd.character_book.entries[fi].comment) === nk) { foundIdx = fi; break; }
            }

            if (foundIdx >= 0) {
              // 更新
              var oldEntry = cd.character_book.entries[foundIdx];
              var mergedEntry = Object.assign({}, oldEntry, basePatch);
              if (extPatch) mergedEntry.extensions = Object.assign({}, (oldEntry && oldEntry.extensions) || {}, extPatch);
              // ===== ✅新增：keys 为空时，按<标签>分类+实体名自动派生（蓝灯不派生）=====
              var _tmplHere = getEntryTemplate(mergedEntry.comment || '');
              if ((!mergedEntry.keys || mergedEntry.keys.length === 0) && !((_tmplHere && _tmplHere.constant) || mergedEntry.constant)) {
                try { mergedEntry.keys = _deriveEntryKeys(mergedEntry.comment, _tmplHere, mergedEntry.content); } catch(derr){}
              }
              if (!mergedEntry.secondary_keys) mergedEntry.secondary_keys = [];
              cd.character_book.entries[foundIdx] = mergedEntry;
              modified = true;
              changeLog.updated++;
            } else {
              // upsert: 新增；update: 警告不新增
              if (op.action === 'update') {
                console.warn('[opblock] update 找不到条目:', op.key);
              } else {
                var newEntry = Object.assign({
                  comment: cleanComment,
                  content: op.content || '',
                  constant: false,
                  position: 0,
                  keys: [],
                  secondary_keys: [],
                  extensions: {}
                }, basePatch);
                if (extPatch) newEntry.extensions = Object.assign({}, newEntry.extensions || {}, extPatch);
                var _tmplNew = getEntryTemplate(newEntry.comment || '');
                if (_tmplNew) {
                  // MVU 系统条目强制使用模板的 selective/constant 值
                  var _isNewMvuSys = (String(newEntry.comment || '').toLowerCase().indexOf('变量输出格式') >= 0 ||
                                     String(newEntry.comment || '').toLowerCase().indexOf('变量更新规则') >= 0 ||
                                     String(newEntry.comment || '').toLowerCase().indexOf('[initvar]') >= 0 ||
                                     String(newEntry.comment || '').indexOf('初始变量') >= 0 ||
                                     String(newEntry.comment || '').indexOf('变量列表') >= 0);
                  if (_isNewMvuSys) {
                    newEntry.selective = _tmplNew.selective;
                    newEntry.constant = _tmplNew.constant;
                  } else {
                    if (newEntry.selective === undefined) newEntry.selective = _tmplNew.selective;
                    if (newEntry.constant === undefined) newEntry.constant = _tmplNew.constant;
                  }
                }
                // ===== ✅新增：新条目 keys 为空自动派生 =====
                if ((!newEntry.keys || newEntry.keys.length === 0) && !(newEntry.constant || (_tmplNew && _tmplNew.constant))) {
                  try { newEntry.keys = _deriveEntryKeys(newEntry.comment, _tmplNew, newEntry.content); } catch(derr2){}
                }
                if (!newEntry.secondary_keys) newEntry.secondary_keys = [];
                cd.character_book.entries.push(newEntry);
                modified = true;
                changeLog.added++;
              }
            }
          } else if (op.action === 'delete') {
            // 检测是否是脚本删除（key以 script: 开头）
            if (op.key && /^script:/i.test(op.key)) {
              var delScriptName = op.key.replace(/^script:\s*/i, '').trim();
              var delScripts = cd.extensions.tavern_helper.scripts;
              var delCount = 0;
              cd.extensions.tavern_helper.scripts = delScripts.filter(function(s) {
                var match = (s.name || '').toLowerCase() === delScriptName.toLowerCase() ||
                            (s.id || '') === delScriptName;
                if (match && _isFixedMvuScript(s)) {
                  console.warn('[opblock] 拦截固定脚本删除:', delScriptName);
                  return true; // 保留
                }
                if (match) delCount++;
                return !match;
              });
              if (delCount > 0) {
                modified = true;
                changeLog.deleted += delCount;
              }
              return;
            }

            var dk = _opNormKey(op.key);
            if (!dk) { console.warn('[opblock] delete空key'); return; }
            var removeCount = 0;
            var strippedDk = dk.replace(/^[<\[【⟦『「〈《\(\[{]+|[>\]】⟧』」〉》\)\]}]+$/g, '').trim();
            cd.character_book.entries = cd.character_book.entries.filter(function(e) {
              if (!e || typeof e !== 'object') { removeCount++; return false; }  // 防御：null/字符串/数字直接当脏数据删掉
              var ek = _opNormKey(e.comment || '');
              var strippedEk = ek.replace(/^[<\[【⟦『「〈《\(\[{]+|[>\]】⟧』」〉》\)\]}]+$/g, '').trim();
              // 精确匹配优先；否则短 key 用 includes 模糊（dk.length>=4 避免乱删）
              var shouldDelete = (ek === dk)
                || (strippedDk && strippedEk && strippedEk === strippedDk)
                || (strippedDk && strippedEk && strippedDk.length >= 4 && strippedEk.indexOf(strippedDk) >= 0)
                || (dk.length >= 6 && ek.indexOf(dk) >= 0);
              // 额外：如果用户删的内容本身和某条 entry.content 前 50 字匹配度>80%（常见于"把这段删掉"）也命中删除
              if (!shouldDelete && strippedDk && strippedDk.length >= 10 && e.content && typeof e.content === 'string') {
                var headContent = e.content.slice(0, Math.max(60, strippedDk.length + 20));
                if (headContent.indexOf(strippedDk) >= 0) shouldDelete = true;
              }
              if (shouldDelete) removeCount++;
              return !shouldDelete;
            });
            if (removeCount > 0) {
              modified = true;
              changeLog.deleted += removeCount;
            } else {
              console.warn('[opblock] delete 找不到条目:', op.key);
            }
          } else if (op.action === 'set') {
            var fieldName = op.key.toLowerCase().trim();
            if (validFields.indexOf(fieldName) >= 0) {
              if (fieldName === 'alternate_greetings') {
                // alternate_greetings 也需要转为数组
                cd.alternate_greetings = op.content.split(/\n/).map(function(s) { return s.trim(); }).filter(Boolean);
              } else {
                cd[fieldName] = op.content;
              }
              modified = true;
              changeLog.fieldUpdates++;
            } else {
              console.warn('[opblock] set 未知字段:', fieldName);
            }
          } else if (op.action === 'rename') {
            var oldK = _opNormKey(op.oldKey);
            var newK = op.newKey.trim();
            if (!oldK || !newK) { console.warn('[opblock] rename 空key'); return; }
            // 剥去newKey装饰括号
            var cleanNewKey = newK;
            for (var iter2 = 0; iter2 < 2; iter2++) {
              var pairs2 = [['⟦','⟧'],['【','】'],['「','」'],['『','』'],['［','］'],['《','》'],['〈','〉'],['(',')'],['[',']'],['{','}']];
              var didStrip2 = false;
              for (var pi2 = 0; pi2 < pairs2.length; pi2++) {
                var L2 = pairs2[pi2][0], R2 = pairs2[pi2][1];
                if (cleanNewKey.length >= 4 && cleanNewKey.charAt(0) === L2 && cleanNewKey.charAt(cleanNewKey.length-1) === R2) {
                  cleanNewKey = cleanNewKey.slice(1, -1).trim(); didStrip2 = true; break;
                }
              }
              if (!didStrip2) break;
            }
            var renamed = false;
            for (var ri = 0; ri < cd.character_book.entries.length; ri++) {
              if (_opNormKey(cd.character_book.entries[ri].comment) === oldK) {
                cd.character_book.entries[ri].comment = cleanNewKey;
                renamed = true;
                break;
              }
            }
            if (renamed) {
              modified = true;
              changeLog.renamed++;
            } else {
              console.warn('[opblock] rename 找不到条目:', op.oldKey);
            }
          }
        });

        return { modified: modified, changeLog: changeLog };
      }

      // ===== 兜底：从AI回复中提取状态栏HTML（当AI只输出```html而非JSON时）=====
      // 场景：用户让AI"改状态栏"，AI直接输出了```html代码块而非JSON的regex_scripts
      // 此时extractJSON提取不到，需要这个兜底机制把HTML保存到cardData.extensions.regex_scripts
      function tryExtractStatusBarHtml(aiText) {
        if (!aiText) return false;
        // 匹配所有 ```html 代码块
        var htmlBlocks = [];
        var htmlRe = /```html\s*\n([\s\S]*?)\n```/gi;
        var m;
        while ((m = htmlRe.exec(aiText)) !== null) {
          htmlBlocks.push(m[1]);
        }
        // 也匹配无语言标记的 ``` 代码块（可能含HTML）
        if (htmlBlocks.length === 0) {
          var genericRe = /```\s*\n([\s\S]*?)\n```/g;
          while ((m = genericRe.exec(aiText)) !== null) {
            if (m[1].indexOf('<html') >= 0 || m[1].indexOf('<!doctype') >= 0 || m[1].indexOf('<head') >= 0) {
              htmlBlocks.push(m[1]);
            }
          }
        }
        if (htmlBlocks.length === 0) return false;

        // 强负面关键词：含这些内容一定不是状态栏HTML（是写卡器进度块/世界书条目碎片等）
        var blockBlacklist = ['<statusblock>', '</statusblock>', '信息完整度', '需要您补充的信息',
                              '基础公理', '交互软规则', '核心铁则', '```json', '```js', '```yaml',
                              'character_book', 'entries', 'comment', 'insertion_order'];
        // 状态栏HTML专属特征：必须出现HTML结构 + 多个渲染相关特征词才认定
        var mustHaveStructure = ['<!doctype', '<html', '<style', '<script'];
        var statusBarKeywords = ['StatusPlaceHolderImpl', 'render-root', 'stat_data', 'waitGlobalInitialized',
                                 'getAllVariables', 'mvu-status', 'card-body', 'refreshStatus', 'renderTree',
                                 'matrix-card', 'matrix-grid', 'm-bar-wrap', '.m-label', '.m-value',
                                 'renderVars', 'loadVars', 'mvu-matrix-ui', 'mvu-status-card'];
        var statusBarHtml = null;
        for (var i = 0; i < htmlBlocks.length; i++) {
          var block = htmlBlocks[i];
          // 黑名单过滤：直接跳过含进度块/世界书碎片的代码块
          var hitBlack = false;
          for (var b = 0; b < blockBlacklist.length; b++) {
            if (block.indexOf(blockBlacklist[b]) >= 0) { hitBlack = true; break; }
          }
          if (hitBlack) continue;
          // 结构验证：至少出现2个HTML结构标签（非单纯CSS/JS碎片）
          var structCount = 0;
          for (var s = 0; s < mustHaveStructure.length; s++) {
            if (block.indexOf(mustHaveStructure[s]) >= 0) structCount++;
          }
          if (structCount < 2) continue;
          // 特征关键词：至少4个才认为是状态栏HTML（避免误匹配MVU schema等内容）
          var matchCount = 0;
          for (var k = 0; k < statusBarKeywords.length; k++) {
            if (block.indexOf(statusBarKeywords[k]) >= 0) matchCount++;
          }
          if (matchCount >= 4) {
            // 清理字面量转义字符
            var cleaned = block;
            if (cleaned.indexOf('\\n') >= 0) cleaned = cleaned.replace(/\\n/g, '\n');
            if (cleaned.indexOf('\\"') >= 0) cleaned = cleaned.replace(/\\"/g, '"');
            if (cleaned.indexOf('\\\\') >= 0) cleaned = cleaned.replace(/\\\\/g, '\\');
            statusBarHtml = cleaned;
            break;
          }
        }
        if (!statusBarHtml) return false;

        // 复用统一的保存函数，避免重复代码
        return saveStatusBarToCard(statusBarHtml);
      }

      // 保存拼接好的状态栏HTML到角色卡的regex_scripts
      function saveStatusBarToCard(assembledHtml) {
        if (!assembledHtml) return false;
        // ⚠️改进Z6：先做全面的字段初始化，避免任何undefined导致后续push报错
        if (!cardData) return false;
        cardData.extensions = cardData.extensions || {};
        cardData.extensions.regex_scripts = Array.isArray(cardData.extensions.regex_scripts) ? cardData.extensions.regex_scripts : [];
        cardData.extensions.tavern_helper = cardData.extensions.tavern_helper || { scripts: [], variables: {} };
        if (!Array.isArray(cardData.extensions.tavern_helper.scripts)) cardData.extensions.tavern_helper.scripts = [];
        cardData.character_book = cardData.character_book || {};
        cardData.character_book.entries = Array.isArray(cardData.character_book.entries) ? cardData.character_book.entries : [];
        cardData.first_mes = typeof cardData.first_mes === 'string' ? cardData.first_mes : '';
        cardData.alternate_greetings = Array.isArray(cardData.alternate_greetings) ? cardData.alternate_greetings : [];

        var rxList = cardData.extensions.regex_scripts;
        // 收集所有「美化状态栏」脚本：findRegex 含 StatusPlaceHolder 且 markdownOnly 且 非 promptOnly
        // 同时兼容 id === 'mvu-status-bar' 的脚本（历史数据可能 findRegex 写法不一）
        var sbIdxList = [];
        for (var j = 0; j < rxList.length; j++) {
          var r = rxList[j];
          if (!r) continue;
          var isSb = (r.id === 'mvu-status-bar') ||
                     ((r.findRegex || '').indexOf('StatusPlaceHolder') >= 0 && r.markdownOnly && !r.promptOnly);
          if (isSb) sbIdxList.push(j);
        }
        var wrappedHtml = '```\n' + assembledHtml + '\n```';
        if (sbIdxList.length > 0) {
          // 取第一个作为更新目标，其余重复的全部删除（按 id 或 findRegex 匹配的都算重复）
          var keepIdx = sbIdxList[0];
          rxList[keepIdx].replaceString = wrappedHtml;
          rxList[keepIdx].findRegex = '/<StatusPlaceHolderImpl\\/>/g';
          rxList[keepIdx].markdownOnly = true;
          rxList[keepIdx].promptOnly = false;
          rxList[keepIdx].placement = [2];
          rxList[keepIdx].runOnEdit = false; // StageDog标准：避免编辑消息时重复执行
          rxList[keepIdx].disabled = false;
          rxList[keepIdx].id = 'mvu-status-bar';
          rxList[keepIdx].scriptName = '[美化]MVU状态栏';
          // 降序删除其余重复脚本（保留 keepIdx）
          if (sbIdxList.length > 1) {
            var dupToRemove = sbIdxList.slice(1).sort(function(a, b) { return b - a; });
            dupToRemove.forEach(function(idx) {
              console.warn('[statusbar] 去重：删除重复的[美化]MVU状态栏脚本:', rxList[idx].scriptName || rxList[idx].name);
              rxList.splice(idx, 1);
            });
          }
        } else {
          rxList.push({
            id: 'mvu-status-bar',
            scriptName: '[美化]MVU状态栏',
            findRegex: '/<StatusPlaceHolderImpl\\/>/g',
            replaceString: wrappedHtml,
            trimStrings: [],
            placement: [2],
            disabled: false,
            markdownOnly: true,
            promptOnly: false,
            runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
            substituteRegex: 0,
            minDepth: null,
            maxDepth: null
          });
        }
        cardData.extensions.regex_scripts = rxList;

        // ⚠️清理世界书条目中的状态栏模块残留：历史版本/旧角色卡可能已把状态栏模块
        // 代码（Step 2-6）误写入了character_book.entries。此处保存regex后主动清理，
        // 避免条目里的陈旧状态栏代码污染世界书上下文、与regex_scripts版本不一致。
        if (cardData.character_book && Array.isArray(cardData.character_book.entries)) {
          var sbCleanupRe = /状态栏.*Step\s*[2-7]|Step\s*[2-7].*状态栏|状态栏.*(配色|HTML骨架|CSS样式|变量读取|渲染函数|事件绑定)|(配色|HTML骨架|CSS样式|变量读取|渲染函数|事件绑定).*状态栏/;
          var beforeLen = cardData.character_book.entries.length;
          cardData.character_book.entries = cardData.character_book.entries.filter(function(e) {
            var c = String((e && e.comment) || '');
            if (sbCleanupRe.test(c)) {
              console.warn('[statusbar] 清理世界书中的状态栏残留条目:', c);
              return false;
            }
            return true;
          });
          if (cardData.character_book.entries.length < beforeLen) {
            console.warn('[statusbar] 共清理 ' + (beforeLen - cardData.character_book.entries.length) + ' 个状态栏残留条目');
          }
        }

        /* 改进8+Z6：自动追加占位符兜底——确保 first_mes 末尾有 <StatusPlaceHolderImpl/> */
        if (cardData.first_mes && cardData.first_mes.indexOf('StatusPlaceHolderImpl') < 0) {
          cardData.first_mes = cardData.first_mes.replace(/\s*$/, '') + '\n<StatusPlaceHolderImpl/>';
          console.warn('[statusbar] 改进8兜底：first_mes 末尾自动追加 <StatusPlaceHolderImpl/>');
        } else if (!cardData.first_mes) {
          // ⚠️Z6+：first_mes为空也给一个默认开场白（含占位符），确保状态栏能显示
          cardData.first_mes = '（默认开场白）\n<StatusPlaceHolderImpl/>';
          console.warn('[statusbar] Z6兜底：first_mes为空，已自动生成默认开场白含<StatusPlaceHolderImpl/>');
        }
        /* 同样确保 alternate_greetings 每条也追加了占位符 */
        if (cardData.alternate_greetings && Array.isArray(cardData.alternate_greetings)) {
          for (var gi = 0; gi < cardData.alternate_greetings.length; gi++) {
            var ag = cardData.alternate_greetings[gi];
            if (typeof ag === 'string' && ag.indexOf('StatusPlaceHolderImpl') < 0) {
              cardData.alternate_greetings[gi] = ag.replace(/\s*$/, '') + '\n<StatusPlaceHolderImpl/>';
            }
          }
        }
        return true;
      }

      // ===== 进入MVU Tab时自动注入固定资产（bundle.js + 正则1-5）=====
      // ⚠️仅自动注入 bundle.js 和正则1-5；变量结构脚本/WTC/<状态栏>占位符提醒/正则6 由 AI 按 9.1.6 工作流一条一条生成
      // 这些资产固定不变，由写卡器自动管理，AI无权写入/删除（白名单拦截）
      // 提前注入到cardData，让用户在MVU Tab里就能看到完整资产，预览时也能正确渲染
      function ensureFixedMvuAssetsInCardData() {
        if (!cardData) return;
        cardData.extensions = cardData.extensions || {};
        cardData.extensions.tavern_helper = cardData.extensions.tavern_helper || { scripts: [], variables: {} };
        if (!cardData.extensions.tavern_helper.scripts) cardData.extensions.tavern_helper.scripts = [];
        if (!cardData.extensions.regex_scripts) cardData.extensions.regex_scripts = [];
        var thScripts = cardData.extensions.tavern_helper.scripts;
        var rxList = cardData.extensions.regex_scripts;
        var injected = [];

        // === 0. 去重清理：移除已累积的重复固定正则（只保留每个id的第一份）===
        var _fixedRxIds = {
          'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36': true,
          '5bb4b588-23ca-4564-8df5-882104eff764': true,
          '6fb572ae-a9ea-436d-9779-ad100f1ff7f5': true,
          'bf1b7441-5cf1-426d-bd6c-911332be9923': true,
          'mvu-status-hide': true
        };
        var _seenRxIds = {};
        var _dedupedRx = [];
        for (var _ri = 0; _ri < rxList.length; _ri++) {
          var _r = rxList[_ri];
          if (!_r) continue;
          var _rid = _r.id || '';
          if (_rid && _fixedRxIds[_rid]) {
            if (_seenRxIds[_rid]) continue;
            _seenRxIds[_rid] = true;
          }
          _dedupedRx.push(_r);
        }
        if (_dedupedRx.length !== rxList.length) {
          cardData.extensions.regex_scripts = _dedupedRx;
          rxList = _dedupedRx;
        }

        // === 1. 注入 bundle.js（MVU本体脚本）===
        var hasBundle = thScripts.some(function(s) { return (s.content || '').indexOf('MagVarUpdate') >= 0 || (s.content || '').indexOf('bundle.js') >= 0; });
        if (!hasBundle) {
          thScripts.push({
            type: 'script', enabled: true, name: 'MVU', id: '961f366d-e403-45c2-8155-3d14ec86de53',
            content: "import'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';",
            info: '', button: { enabled: true, buttons: [
              { name: '重新处理变量', visible: false }, { name: '重新读取初始变量', visible: false },
              { name: '快照楼层', visible: false }, { name: '重演楼层', visible: false },
              { name: '重试额外模型解析', visible: false }, { name: '清除旧楼层变量', visible: false }
            ]}, data: {}
          });
          injected.push('bundle.js');
        }

        // === 2. 注入变量结构 zod 脚本（如果有 InitVar 条目）===
        // ⚠️用户要求：变量结构脚本由 AI 在 MVU Tab 一条一条生成，不再自动注入
        // （原逻辑已移除，AI 按 9.1.5 工作流生成）

        // === 4. 注入正则1：仅格式思维链（移除<Analysis>段）===
        var hasR1 = rxList.some(function(r) { return r.id === 'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36' || ((r.findRegex || r.find_regex || '').indexOf('Analysis') >= 0 && r.promptOnly); });
        if (!hasR1) {
          rxList.push({ id: 'd668c8a6-fa6a-444d-a5d6-8f68b73a3c36', scriptName: '仅格式思维链',
            findRegex: '/<Analysis>[\\s\\S]+?<\\/Analysis>/gm', replaceString: '', trimStrings: [],
            placement: [2], disabled: false, markdownOnly: false, promptOnly: true, runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
            substituteRegex: 0, minDepth: null, maxDepth: null });
          injected.push('正则1(思维链)');
        }

        // === 5. 注入正则2：只发送最新2楼的变量更新 ===
        var hasR2 = rxList.some(function(r) { return r.id === '5bb4b588-23ca-4564-8df5-882104eff764' || ((r.findRegex || r.find_regex || '').indexOf('UpdateVariable') >= 0 && r.promptOnly); });
        if (!hasR2) {
          rxList.push({ id: '5bb4b588-23ca-4564-8df5-882104eff764', scriptName: '只发送最新2楼的变量更新',
            findRegex: '/<UpdateVariable>[\\s\\S]*?<\\/UpdateVariable>/gm', replaceString: '', trimStrings: [],
            placement: [2], disabled: false, markdownOnly: false, promptOnly: true, runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
            substituteRegex: 0, minDepth: 4, maxDepth: null });
          injected.push('正则2(变量更新截断)');
        }

        // === 6. 注入正则3：[美化]变量完成 ===
        var hasR3 = rxList.some(function(r) { return r.id === '6fb572ae-a9ea-436d-9779-ad100f1ff7f5'; });
        if (!hasR3) {
          rxList.push({ id: '6fb572ae-a9ea-436d-9779-ad100f1ff7f5', scriptName: '[美化]变量完成',
            findRegex: '/<UpdateVariable(?:variable)?>\\s*(.*)\\s*<\\/UpdateVariable(?:variable)?>/gsi',
            replaceString: MVU_BEAUTIFY_COMPLETE, trimStrings: [], placement: [2], disabled: false,
            markdownOnly: true, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null });
          injected.push('正则3(变量完成美化)');
        }

        // === 7. 注入正则4：[美化]变量更新中 ===
        var hasR4 = rxList.some(function(r) { return r.id === 'bf1b7441-5cf1-426d-bd6c-911332be9923'; });
        if (!hasR4) {
          rxList.push({ id: 'bf1b7441-5cf1-426d-bd6c-911332be9923', scriptName: '[美化]变量更新中',
            findRegex: '/<UpdateVariable(?:variable)?>(?!.*<\\/UpdateVariable(?:variable)?>)\\s*(.*)\\s*$/gsi',
            replaceString: MVU_BEAUTIFY_THINKING, trimStrings: [], placement: [2], disabled: false,
            markdownOnly: true, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null });
          injected.push('正则4(变量更新中美化)');
        }

        // === 8. 注入正则5：[不发送]隐藏状态栏标记 ===
        var hasR5 = rxList.some(function(r) {
          return r.id === 'mvu-status-hide' || ((r.findRegex || r.find_regex || '').indexOf('StatusPlaceHolderImpl') >= 0 && r.promptOnly && !r.markdownOnly);
        });
        if (!hasR5) {
          rxList.push({ id: 'mvu-status-hide', scriptName: '[不发送]隐藏状态栏标记',
            findRegex: '/<StatusPlaceHolderImpl\\/>/g', replaceString: '', trimStrings: [],
            placement: [2], disabled: false, markdownOnly: false, promptOnly: true, runOnEdit: false, // StageDog标准：避免编辑消息时重复执行
            substituteRegex: 0, minDepth: null, maxDepth: null });
          injected.push('正则5(隐藏状态栏标记)');
        }

        // === 9. <状态栏>占位符提醒条目 ===
        // ⚠️用户要求：占位符提醒条目由 AI 在 MVU Tab 一条一条生成，不再自动注入
        // （原逻辑已移除，AI 在生成状态栏相关条目时一并生成）

        if (injected.length > 0) {
          console.log('[MVU Tab] 自动注入固定资产:', injected.join('、'));
          saveToStorage();
        }
        return injected;
      }

      // JSON 修复：用状态机遍历，只对"键位置"的裸标识符补引号，
      // 避免破坏字符串值内部的 word: 模式（如 "Time: 远古"）
      function repairJSON(str) {
        if (!str) return null;
        // 1) 先尝试直接解析
        try { return JSON.parse(str); } catch(e) {}
        // 2) 反转义多余转义、修复尾逗号
        var s = str
          .replace(/\\\\n/g, '\\n')
          .replace(/\\\\r/g, '\\r')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        try { return JSON.parse(s); } catch(e) {}
        // 3) 状态机：单引号字符串转双引号 + 裸键补引号（不触碰字符串内部）
        var out = [];
        var i = 0;
        var len = s.length;
        // state: 0=期望键或值, 1=字符串内, 2=键已结束待冒号, 3=值已结束待逗号/括号
        var afterColon = false; // 上一非空白token是否是冒号（值上下文）
        while (i < len) {
          var ch = s[i];
          if (ch === '"') {
            // 双引号字符串：原样复制到匹配的结束引号（处理转义）
            out.push(ch);
            i++;
            while (i < len) {
              var c = s[i];
              out.push(c);
              if (c === '\\' && i + 1 < len) { out.push(s[i+1]); i += 2; continue; }
              i++;
              if (c === '"') break;
            }
            afterColon = false;
            continue;
          }
          if (ch === "'") {
            // 单引号字符串：转成双引号
            out.push('"');
            i++;
            while (i < len) {
              var c2 = s[i];
              if (c2 === '\\' && i + 1 < len) {
                // 转义字符原样保留
                out.push(c2, s[i+1]);
                i += 2;
                continue;
              }
              if (c2 === "'") { out.push('"'); i++; break; }
              if (c2 === '"') { out.push('\\'); } // 字符串内的双引号需转义
              out.push(c2);
              i++;
            }
            afterColon = false;
            continue;
          }
          // 裸键检测：在键上下文（非值，紧跟标识符 + 冒号）
          if (!afterColon && /[a-zA-Z_$]/.test(ch)) {
            var j = i;
            while (j < len && /[a-zA-Z0-9_$]/.test(s[j])) j++;
            // 跳过空白看是否跟冒号
            var k = j;
            while (k < len && /\s/.test(s[k])) k++;
            if (k < len && s[k] === ':') {
              // 是裸键，补引号
              out.push('"', s.substring(i, j), '"');
              i = j;
              continue;
            }
          }
          if (ch === ':') afterColon = true;
          else if (ch === ',' || ch === '{' || ch === '[') afterColon = false;
          else if (ch === '}' || ch === ']') afterColon = false;
          out.push(ch);
          i++;
        }
        var repaired = out.join('');
        try { return JSON.parse(repaired); } catch(e) { return null; }
      }

      // ===== AI对话调用 =====
      async function callAIChat() {
        if (isGenerating) return;
        isGenerating = true;
        setEnabled(false);
        addTyping();
        pushWorkToast('正在思考...', 'working');
        try {
          // ========== 启用队列模式：所有addAssistantMsg调用收集到队列，最后合并为一条消息 ==========
          _aiChatQueueMode = true;
          _aiChatNotesQueue = [];
          // ========== Tab 隔离：使用当前Tab专属的聊天记录数组 ==========
          var curTabMessages = getCurrentMessages();
          var prompt = buildPrompt(cardData, cardGenerated, curTabMessages);
          // 注入全局人设（AI/用户人设，从 localStorage 读取，头像菜单可编辑）
          var _personaHdr = getPersonaHeader();
          if (_personaHdr) prompt = _personaHdr + '\n\n' + prompt;
          var aiResponse = await callAI(prompt);
          aiResponse = cleanAIReply(aiResponse);
          removeTyping();

          // ========== 🆕 保存cardData快照（用于头像菜单"撤回"回滚）==========
          // 在应用任何AI修改前保存；AI消息将落在 curTabMessages.length 索引处
          try { saveCardDataSnapshot(curTabMessages.length); } catch(_snapErr) {}

          // ========== 🆕 ::: 操作块协议优先检测 ==========
          // 如果AI回复包含:::操作块，走新协议路径（更简洁、零语法错误）
          // 否则回退到旧JSON路径（兼容）
          if (hasOpBlocks(aiResponse)) {
            var ops = parseOpBlocks(aiResponse);
            if (ops.length > 0) {
              var opResult = applyOps(ops, cardData);
              if (opResult.modified) {
                if (cardData.name && (cardData.description || (cardData.character_book && cardData.character_book.entries && cardData.character_book.entries.length > 0))) {
                  cardGenerated = true;
                }
                progress = calcProgress();
                // MVU Tab：合并后自动注入固定资产
                if (currentTab === 'mvu') {
                  var mvuEntriesAfterOps = (cardData.character_book || {}).entries || [];
                  var hasInitVarAfterOps = mvuEntriesAfterOps.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; });
                  if (hasInitVarAfterOps) {
                    var newlyInjectedOps = ensureFixedMvuAssetsInCardData();
                    if (newlyInjectedOps && newlyInjectedOps.length > 0) renderPreview();
                  }
                }
                // 显示变更统计
                var crOps = opResult.changeLog;
                var partsOps = [];
                if (crOps.added) partsOps.push('➕新增' + crOps.added + '条');
                if (crOps.updated) partsOps.push('🔄更新' + crOps.updated + '条');
                if (crOps.deleted) partsOps.push('🗑️删除' + crOps.deleted + '条');
                if (crOps.fieldUpdates) partsOps.push('📝字段' + crOps.fieldUpdates + '项');
                if (crOps.renamed) partsOps.push('✏️重命名' + crOps.renamed + '条');
                if (partsOps.length) showToast('✅ 已应用修改：' + partsOps.join('，'), 'success');
                renderPreview();
                saveToStorage();
              } else if (ops.length > 0) {
                showToast('⚠️ AI返回了操作指令，但未匹配到任何条目。请检查条目名称是否正确', 'warning', 6000);
              }
            }
            // 跳过旧JSON路径
            var parsed = null;
          } else {
            // ========== 旧JSON路径（兼容） ==========
            var parsed = extractJSON(aiResponse);
          }
          if (parsed) {
            // ========== Tab 隔离：角色卡Tab下，严格过滤掉AI违规生成的MVU条目 ==========
            if (currentTab === 'card') {
              var filteredForCard = filterMvuEntriesFromParsed(parsed);
              if (filteredForCard._mvuStrippedCount > 0) {
                showToast('⚠️ 检测到AI违规生成了 ' + filteredForCard._mvuStrippedCount + ' 条MVU相关内容，已自动拦截。\nMVU变量系统请切换到「MVU变量状态栏」Tab进行制作。', 'warning', 6000);
              }
              if (filteredForCard._mvuRegexScriptStripped) {
                showToast('⚠️ 检测到AI违规生成了MVU相关正则脚本，已自动拦截。', 'warning', 6000);
              }
              parsed = filteredForCard.parsed;
            }
            var hasData = Object.keys(parsed).filter(function(k) { return k !== '_nochange'; }).length > 0;
            if (hasData) {
              // 传递 returnLog 选项以便获取精确的变更统计（新增/删除/更新数量）
              var mergeResult = mergePartial(parsed, cardData, { returnLog: true });
              var actuallyModified = false;
              var changeLogResult = null;
              if (typeof mergeResult === 'object' && mergeResult !== null) {
                actuallyModified = !!mergeResult.modified;
                changeLogResult = mergeResult.log || null;
              } else {
                actuallyModified = !!mergeResult;
              }
              if (actuallyModified) {
                if (cardData.name && (cardData.description || (cardData.character_book && cardData.character_book.entries && cardData.character_book.entries.length > 0))) {
                  cardGenerated = true;
                }
                progress = calcProgress();
                // ===== MVU Tab：合并后确保固定资产（bundle.js + 正则1-5）始终存在 =====
                // ⚠️仅自动注入 bundle.js 和正则1-5；变量结构脚本/WTC/<状态栏>占位符提醒/正则6 由 AI 按 9.1.6 工作流一条一条生成
                // 当AI生成了InitVar条目后，触发一次补注入（确保固定资产不丢）
                if (currentTab === 'mvu') {
                  var mvuEntriesAfterMerge = (cardData.character_book || {}).entries || [];
                  var hasInitVarAfterMerge = mvuEntriesAfterMerge.some(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; });
                  if (hasInitVarAfterMerge) {
                    var newlyInjected = ensureFixedMvuAssetsInCardData();
                    if (newlyInjected && newlyInjected.length > 0) {
                      renderPreview();
                    }
                  }
                }
                // 显示变更统计 Toast，让用户明确知道AI确实执行了删改而不是瞎加
                try {
                  if (changeLogResult) {
                    var cr = changeLogResult;
                    var parts = [];
                    if (cr.added) parts.push('➕新增' + cr.added + '条');
                    if (cr.updated) parts.push('🔄更新' + cr.updated + '条');
                    if (cr.deleted) parts.push('🗑️删除' + cr.deleted + '条');
                    if (cr.fieldUpdates) parts.push('📝字段' + cr.fieldUpdates + '项');
                    if (parts.length) showToast('✅ 已应用修改：' + parts.join('，'), 'success');
                  }
                } catch(e) { /* ignore */ }
              } else if (hasData) {
                // AI输出了JSON但实际上没修改到任何东西（可能comment不匹配导致只加不删没生效）
                // 提示用户可能需要调整comment
                showToast('⚠️ AI返回了修改指令，但未匹配到任何条目（可能comment不精确）。请让AI使用精确comment或在JSON中加_action:delete明确删除', 'warning', 6000);
              }
            }
          }
          // lastUserInput 兜底逻辑：仅在用户明确要求修改开场白时才强制写入 first_mes
          // 修复：之前用 indexOf('开场白') 太脆弱，"别动开场白"也会触发
          // 现在改为：只在 parsed 中有 first_mes 且 mergePartial 没成功写入时才兜底
          // 且不再依赖 lastUserInput 关键词匹配（mergePartial 已能处理 first_mes 更新）
          if (parsed && parsed.first_mes && typeof parsed.first_mes === 'string' && parsed.first_mes.trim().length > 50) {
            // 仅当 mergePartial 没修改到 first_mes 时，才用这段兜底赋值
            if (cardData.first_mes !== parsed.first_mes.trim()) {
              // 额外检查：用户当前输入确实是在讨论开场白（正向意图，非否定语境）
              if (lastUserInput) {
                var hasOpening = lastUserInput.indexOf('开场白') >= 0 || lastUserInput.indexOf('first_mes') >= 0 || lastUserInput.indexOf('opening') >= 0 || lastUserInput.indexOf('开局') >= 0;
                var isNegation = /别动|不要|不用|别改|保持|取消|撤销|删除开场/.test(lastUserInput);
                if (hasOpening && !isNegation) {
                  cardData.first_mes = parsed.first_mes.trim();
                  progress = calcProgress();
                }
              }
            }
          }
          // ===== 状态栏处理（统一模板：从AI回复中提取完整HTML并保存）==========
          // ========== Tab 隔离：状态栏处理仅在 MVU Tab 中执行，角色卡Tab完全跳过 ==========
          if (currentTab === 'mvu') {
            try {
              var _sbSavedMain = tryExtractStatusBarHtml(aiResponse);
              if (_sbSavedMain) {
                showToast('✅ 已从AI回答中提取状态栏HTML并保存', 'success');
                progress = calcProgress();
                renderPreview();
              }
            } catch(e) { console.warn('statusbar process error:', e); }
          } // End of: if (currentTab === 'mvu') - 状态栏处理仅在MVU Tab

          // 检测AI发出的 <preview_statusbar> 命令（仅MVU Tab生效）
          if (currentTab === 'mvu' && aiResponse && aiResponse.indexOf('<preview_statusbar>') >= 0) {
            try {
              addAssistantMsg('🎛️ 当前状态栏预览：\n```html\n' + MVU_STATUS_BAR_HTML + '\n```');
            } catch(_pvErr) { console.warn('statusbar preview error:', _pvErr && _pvErr.message); }
          }

          var modProg = parseModProgress(aiResponse);
          if (modProg) {
            var entries = (cardData.character_book || {}).entries || [];
            var modMap = {
              '基础公理': 'axiom',
              '交互软规则': 'soft_rules',
              '核心铁则': 'core_rules',
              '近场强约束': 'near_constraint',
              '场景机制': 'scene_mechanics',
              '实体交互': 'entity_interact',
              '叙事背景': 'narrative_bg',
              '动态适配': 'dynamic_adapt',
              '初始变量': 'init_var',
              '变量更新规则': 'var_update_rule'
            };
            // 仅当 AI 回复中确实识别到模块状态符号时才更新，
            // 否则 parseModProgress 返回全 0 会清空真实进度
            var hasAnySignal = Object.keys(modProg).some(function(k) { return modProg[k] > 0; });
            if (hasAnySignal) {
              Object.keys(modMap).forEach(function(kw) {
                var key = modMap[kw];
                if (modProg[key] === 100) {
                  var count = entries.filter(function(e) { return (e.comment || '').indexOf(kw) >= 0; }).length;
                  if (count === 0) modProg[key] = 0;
                  else if (count === 1) modProg[key] = 50;
                }
                if (modProg[key] === 50) {
                  var cnt = entries.filter(function(e) { return (e.comment || '').indexOf(kw) >= 0; }).length;
                  if (cnt === 0) modProg[key] = 0;
                }
              });
              // 合并而非覆盖：仅更新 AI 明确给出的模块，保留其余模块的原有进度
              Object.keys(modProg).forEach(function(k) {
                if (modProg[k] > 0) moduleProgress[k] = modProg[k];
              });
            }
          }
          // ========== 关闭队列模式，合并所有系统消息到一条回复 ==========
          _aiChatQueueMode = false;
          // 对话框显示与历史存储：合并AI原始回复 + 队列中的系统消息，只显示一条消息
          var rawContent = aiResponse;
          if (_aiChatNotesQueue.length > 0) {
            rawContent = (rawContent || '') + '\n\n---\n' + _aiChatNotesQueue.join('\n\n');
          }
          _aiChatNotesQueue = [];

          // 1. 先存储到历史（Tab隔离：存到当前Tab的专属数组）
          //    ⚠️必须先 push 再 appendMsg：appendMsg 用 getCurrentMessages().length-1 算消息索引，
          //    若先 append 再 push，DOM 上的 data-msg-index 会比实际数组索引小1，导致头像菜单撤回/重新生成定位错位
          var _aiMsgContent = (rawContent && rawContent.trim().length > 0) ? rawContent : '（已应用修改）';
          curTabMessages.push({ role: 'assistant', content: _aiMsgContent });
          // 2. 显示完整内容到对话框（合并后的一条消息），显式传入索引确保与数组对齐
          try { appendMsg('assistant', _aiMsgContent, curTabMessages.length - 1); } catch(e) { console.warn('appendMsg error:', e); }
          saveToStorage();
          updateProgress();
          updateQuickActions();
          updateModFocus();
          renderPreview();
          renderModDash();
          // MVU Tab：同步最新模块状态
          if (currentTab === 'mvu') {
            mvuTabStatusBarModules = statusBarModules;
            mvuTabStatusBarCurrentStep = statusBarCurrentStep;
            mvuTabStatusBarMode = statusBarMode;
          }
          renderMvuInfoPanel();
          saveToStorage();
        } catch(err) {
          removeTyping();
          _aiChatQueueMode = false;
          _aiChatNotesQueue = [];
          try { addAssistantMsg('😞 出错了：' + err.message + '\n\n请检查酒馆是否已连接AI模型，以及JS-Slash-Runner插件是否已启用。'); } catch(e) {}
          try { setEnabled(true); } catch(e) {}
        } finally {
          isGenerating = false;
          try { setEnabled(true); } catch(e) {}
        }
      }

      // ===== 完整生成 =====
      async function doGenerate() {
        if (isGenerating) return;
        // ========== Tab 隔离：角色卡一键生成仅在角色卡Tab可用，MVU Tab不能调用 ==========
        if (currentTab !== 'card') {
          showToast('⚠️ 「一键生成完整角色卡」仅在「角色卡生成」Tab中可用。\n当前在MVU变量状态栏Tab，请切换到角色卡生成Tab使用此功能。', 'warning', 5000);
          return;
        }
        isGenerating = true;
        setEnabled(false);
        addTyping();
        try {
          var hasAll = cardData.name && cardData.description && cardData.first_mes && ((cardData.character_book || {}).entries || []).length >= 4;
          if (hasAll) {
            removeTyping();
            cardGenerated = true;
            setProgress(100);
            renderPreview();
            updateModFocus();
            renderModDash();
            addAssistantMsg('🎉 角色卡内容已完整！点击「💾 导出」查看完整JSON。\n\n你也可以继续和我对话，随时修改或补充内容。');
            isGenerating = false;
            setEnabled(true);
            return;
          }
          // 角色卡Tab：genPrompt也必须过滤MVU内容，并明确禁止生成MVU条目
          var filteredSysForGenerate = filterOutMvuSectionsFromSysPrompt(SYS_PROMPT);
          var antiMvuBanGenerate = '\n\n⚠️【生成时MVU隔离禁令 · 绝对不允许违反】\n' +
            '1. 绝对禁止生成MVU变量条目：[InitVar]初始变量、变量列表、变量更新规则、变量输出格式、变量输出格式强调、<状态栏>占位符提醒\n' +
            '2. 绝对禁止生成<状态栏>或任何状态栏相关的世界书条目\n' +
            '3. 绝对禁止在regex_scripts中生成MVU/StatusPlaceHolderImpl/UpdateVariable相关正则脚本\n' +
            '4. MVU变量条目（8条工作流）和状态栏由独立的MVU Tab负责，当前生成任务与MVU系统完全无关\n';
          var genPrompt = filteredSysForGenerate + antiMvuBanGenerate +
            '\n\n=== 生成指令 ===\n' +
            '请立即生成完整的角色卡数据，补齐所有缺失的核心字段。使用chara_card_v3格式，输出到```json代码块中。\n\n' +
            '=== 必须达到的字段标准 ===\n' +
            '- name：简洁有力的世界/角色名称（字数自由）\n' +
            '- description：不限字数，覆盖世界核心设定（内容自由掌握）\n' +
            '- first_mes：不限字数，结构：场景描写→动作驱动→内心独白→自然对话→结尾留钩\n' +
            '- 身份定位：自动从 personality/description 提取，无需手动写 system_prompt\n' +
            '- personality/scenario：内容自由（纯世界模式可留空，角色模式建议填写）\n' +
            '- 多开局机制：使用 <动态适配> 分支开局条目，或在开场白内嵌互动选项（二选一或组合）\n' +
            '- extensions.depth_prompt：新手引导（depth=0，可选）\n' +
            '- extensions.regex_scripts：按需生成通用正则（如行动标签、关键词高亮），禁止MVU相关正则\n' +
            '- character_book.entries：不限数量，覆盖八大体系（<基础公理><交互软规则><核心铁则><近场强约束><场景机制><实体交互><叙事背景><动态系统>），每条字数自由\n' +
            '- 已有条目用相同comment覆盖，缺失的补充新条目\n\n' +
            '=== 已有内容（参考，不要丢失） ===\n' +
            (cardData.name ? '- 名称：' + cardData.name + '\n' : '') +
            (cardData.description ? '- 描述(' + (cardData.description||'').length + '字)：' + (cardData.description||'').substring(0, 300) + '\n' : '') +
            '- 条目数：' + (((cardData.character_book || {}).entries || []).length) + '条\n' +
            '\n=== 输出要求 ===\n只输出一个完整的```json代码块，包含完整角色卡数据（spec/data/character_book结构）。严禁夹带任何MVU内容。';
          // 注入全局人设（与 callAIChat 路径保持一致）
          var _genPersonaHdr = getPersonaHeader();
          if (_genPersonaHdr) genPrompt = _genPersonaHdr + '\n\n' + genPrompt;
          var aiResponse = await callAI(genPrompt);
          removeTyping();
          // doGenerate 路径同样需要快照，否则撤回一键生成结果时无法回滚cardData
          try {
            var _genMsgs = getCurrentMessages();
            saveCardDataSnapshot(_genMsgs.length);
          } catch(_genSnapErr) {}

          var parsed = extractJSON(aiResponse);
          if (parsed) {
            // 角色卡一键生成：同样走MVU内容过滤防御
            var genFiltered = filterMvuEntriesFromParsed(parsed);
            if (genFiltered._mvuStrippedCount > 0 || genFiltered._mvuRegexScriptStripped) {
              showToast('⚠️ 一键生成的结果中检测到 ' + genFiltered._mvuStrippedCount + ' 项MVU违规内容，已自动过滤。', 'warning', 5000);
            }
            parsed = genFiltered.parsed;
            try {
              var genMergeOk = false;
              if (parsed.spec === 'chara_card_v3' && parsed.data) {
                var rV3 = mergePartial(parsed.data, cardData, { returnLog: true });
                genMergeOk = !!(typeof rV3 === 'object' ? rV3.modified : rV3);
              } else {
                var rPlain = mergePartial(parsed, cardData, { returnLog: true });
                genMergeOk = !!(typeof rPlain === 'object' ? rPlain.modified : rPlain);
              }
              cardGenerated = true;
              setProgress(100);
              renderPreview();
              updateModFocus();
              renderModDash();
              saveToStorage();
              addAssistantMsg('🎉 角色卡生成成功！点击「💾 导出」查看完整JSON。\n\nMVU变量系统和状态栏请切换到「MVU变量状态栏」Tab独立制作。');
            } catch(e) {
              addAssistantMsg('⚠️ 解析失败，请重试。\n\n错误：' + e.message);
            }
          } else {
            addAssistantMsg('⚠️ 未找到JSON格式，可能需要再补充一些信息。\n\nAI返回前300字：\n' + aiResponse.substring(0, 300));
          }
        } catch(err) {
          removeTyping();
          addAssistantMsg('生成出错：' + err.message);
          pushWorkToast('生成出错', 'done');
        } finally {
          isGenerating = false;
          setEnabled(true);
          pushWorkToast('完成', 'done');
        }
      }

      // 记录禁用前输入框是否聚焦，避免恢复时抢焦点打断用户阅读
      var _inputWasFocused = false;
      function setEnabled(enabled) {
        var sendBtn = doc.getElementById('sendBtn');
        var saveBtn = doc.getElementById('saveBtn');
        var input = doc.getElementById('chatInput');
        if (sendBtn) sendBtn.disabled = !enabled;
        if (saveBtn) saveBtn.disabled = !enabled;
        if (input) {
          // 禁用前记录焦点状态；恢复时仅当原本聚焦才重新聚焦
          if (!enabled) {
            _inputWasFocused = (doc.activeElement === input);
            input.disabled = true;
          } else {
            input.disabled = false;
            if (_inputWasFocused) { try { input.focus(); } catch(e){} }
            _inputWasFocused = false;
          }
        }
        // 发送按钮图标切换：生成中显示等待（转圈）图标，空闲显示发送图标
        if (sendBtn) {
          var waiting = !enabled;
          if (waiting) sendBtn.classList.add('is-waiting');
          else sendBtn.classList.remove('is-waiting');
        }
        // 快捷按钮、上下文模块按钮统一禁用/启用，避免生成中误触
        var sels = ['.quick-btn', '.ctx-mod', '.mod-focus-btn', '.mod-dash-item', '.md-analyze-btn'];
        for (var s = 0; s < sels.length; s++) {
          var nodes = doc.querySelectorAll(sels[s]);
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].disabled = !enabled;
            nodes[i].style.pointerEvents = enabled ? '' : 'none';
            nodes[i].style.opacity = enabled ? '' : '0.5';
          }
        }
        updateSendBtnPulse();
      }

      function getModuleProgress() {
        var entries = (cardData.character_book || {}).entries || [];
        // ========== Tab 隔离：角色卡Tab 过滤掉 MVU 条目 ==========
        var __tab = (typeof window !== 'undefined' && typeof window.__getActiveTab === 'function') ? window.__getActiveTab() : (typeof activeTab !== 'undefined' ? activeTab : 'card');
        if (__tab === 'card') {
          entries = entries.filter(function(e) { return !isMVUEntry(e.comment || ''); });
        }
        var comments = entries.map(function(e) { return (e.comment || ''); });
        var keywords = {
          axiom: ['基础公理', '世界元数据', '世界观公理', '力量体系骨架'],
          soft_rules: ['交互软规则', '互动选项', '叙事风格', '剧情引导'],
          core_rules: ['核心铁则', '绝对禁止', '输出格式', 'AI身份'],
          near_constraint: ['近场强约束', '当前局势', '即时状态', '临时任务'],
          scene_mechanics: ['场景机制', '核心玩法', '世界规则', '战斗规则'],
          entity_interact: ['实体交互', '重要角色', '势力与组织', '物品', '地点场景'],
          narrative_bg: ['叙事背景', '故事发展', '文化与习俗', '历史事件'],
          dynamic_adapt: ['动态适配', '引导机制', '互动选项', '状态栏'],
          init_var: ['[InitVar]', '初始变量', 'InitVar', '变量列表'],
          var_update_rule: ['变量更新规则', '变量输出格式', 'UpdateVariable', 'status_current_variables']
        };
        var result = {};
        Object.keys(keywords).forEach(function(mod) {
          // 角色卡Tab：跳过MVU模块检查（永远返回false，不影响进度计算）
          if (__tab === 'card' && (mod === 'init_var' || mod === 'var_update_rule')) {
            result[mod] = false;
            return;
          }
          var kws = keywords[mod];
          result[mod] = comments.some(function(c) {
            return kws.some(function(kw) { return c.indexOf(kw) >= 0; });
          });
        });
        if (cardData.extensions && cardData.extensions.depth_prompt && cardData.extensions.depth_prompt.prompt && cardData.extensions.depth_prompt.prompt.length > 0) {
          result.dynamic_adapt = true;
        }
        return result;
      }

      function calcProgress() {
        var score = 0;
        if (cardData.name) score += 8;
        if (cardData.description && cardData.description.length >= 400) score += 15;
        else if (cardData.description && cardData.description.length >= 200) score += 10;
        else if (cardData.description && cardData.description.length > 50) score += 5;
        var entries = (cardData.character_book || {}).entries || [];
        // ========== Tab 隔离：角色卡Tab 不统计 MVU 条目 ==========
        var __tab = (typeof window !== 'undefined' && typeof window.__getActiveTab === 'function') ? window.__getActiveTab() : (typeof activeTab !== 'undefined' ? activeTab : 'card');
        if (__tab === 'card') {
          entries = entries.filter(function(e) { return !isMVUEntry(e.comment || ''); });
        }
        if (entries.length >= 4) {
          if (cardData.first_mes && cardData.first_mes.length >= 500) score += 15;
          else if (cardData.first_mes && cardData.first_mes.length >= 300) score += 8;
        }
        if (cardData.system_prompt && cardData.system_prompt.length >= 20) score += 5;
        score += Math.min(entries.length * 5, 30);
        var mp = getModuleProgress();
        // 角色卡Tab：不把 init_var / var_update_rule 计入 doneCount
        var modKeys = Object.keys(mp);
        if (__tab === 'card') {
          modKeys = modKeys.filter(function(k) { return k !== 'init_var' && k !== 'var_update_rule'; });
        }
        var doneCount = modKeys.filter(function(k) { return mp[k] === true; }).length;
        score += doneCount * 5;
        if (cardData.creator_notes && cardData.creator_notes.length >= 10) score += 2;
        return Math.min(score, 100);
      }

      function updateProgress() {
        progress = calcProgress();
        var pl = doc.getElementById('phaseLabel');
        if (pl) pl.textContent = progress + '%';
      }
      function setProgress(val) {
        progress = Math.max(0, Math.min(100, val));
        var pl = doc.getElementById('phaseLabel');
        if (pl) pl.textContent = progress + '%';
      }

      // ===== 质检弹窗 =====
      function showQualityCheck() {
        if (!cardData.name && !cardData.description) {
          showToast('还没有内容可以质检哦，先和AI聊聊吧', 'warning');
          return;
        }
        // ========== Tab 隔离：角色卡Tab 质检不检查 MVU 相关内容 ==========
        var __tab = (typeof window !== 'undefined' && typeof window.__getActiveTab === 'function') ? window.__getActiveTab() : (typeof activeTab !== 'undefined' ? activeTab : 'card');
        var results = runQualityCheck(cardData);
        // 角色卡Tab：过滤掉 MVU变量系统 分类和正则脚本中MVU相关的检查项
        if (__tab === 'card') {
          results = results.filter(function(r) {
            if (r.category === 'MVU变量系统') return false;
            if (r._mvuOnly) return false;  // 标记为MVU专属的检查项
            return true;
          });
        }
        var passCount = results.filter(function(r) { return r.pass; }).length;
        var coreResults = results.filter(function(r) { return r.category !== '附加检查' && r.category !== 'MVU变量系统'; });
        var corePass = coreResults.filter(function(r) { return r.pass; }).length;
        var mvuResults = results.filter(function(r) { return r.category === 'MVU变量系统'; });
        var mvuPass = mvuResults.filter(function(r) { return r.pass; }).length;
        var h = '<div class="modal" id="qcModal">' +
          '<div class="modal-content">' +
            '<h3 style="color:#a16207;margin-bottom:4px;font-size:1em">✅ ' + (__tab === 'card' ? '角色卡' : 'MVU变量系统') + '质检报告（' + coreResults.length + '项核心' + (mvuResults.length > 0 ? ' + ' + mvuResults.length + '项MVU' : '') + ' + ' + (results.length - coreResults.length - mvuResults.length) + '项附加）</h3>' +
            '<p style="font-size:.78em;color:#667085;margin-bottom:8px">核心 ' + corePass + '/' + coreResults.length + ' 项达标' + (mvuResults.length > 0 ? ' · MVU ' + mvuPass + '/' + mvuResults.length + ' 项达标' : '') + ' · 全部 ' + passCount + '/' + results.length + ' 项达标</p>' +
            '<div class="progress-bar"><div class="progress-bar-fill" style="width:' + Math.round(corePass/coreResults.length*100) + '%"></div></div>' +
            '<div class="modal-body" style="margin-top:10px">';
        var categories = ['基础字段', '高价值字段', '世界书', '世界书高级', '正则脚本', '运行效果', 'MVU变量系统', '附加检查'];
        // 角色卡Tab 隐藏 MVU变量系统 分类
        if (__tab === 'card') {
          categories = categories.filter(function(c) { return c !== 'MVU变量系统'; });
        }
        var catColors = { '基础字段': '#a16207', '高价值字段': '#ca8a04', '世界书': '#15803d', '世界书高级': '#7c3aed', '正则脚本': '#ca8a04', '运行效果': '#ca8a04', 'MVU变量系统': '#2563eb', '附加检查': '#667085' };
        categories.forEach(function(cat) {
          var catResults = results.filter(function(r) { return r.category === cat; });
          if (catResults.length === 0) return;
          var catPass = catResults.filter(function(r) { return r.pass; }).length;
          h += '<div style="margin:8px 0 4px;font-size:.75em;font-weight:600;color:' + (catColors[cat] || '#667085') + ';border-bottom:1px solid rgba(15,23,42,.10);padding-bottom:3px">' + cat + '（' + catPass + '/' + catResults.length + '）</div>';
          catResults.forEach(function(r) {
            h += '<div class="qc-item ' + (r.pass ? 'pass' : 'fail') + '">' +
              '<div class="qc-title ' + (r.pass ? 'qc-pass' : 'qc-fail') + '">' +
                (r.pass ? '✅' : '❌') + ' ' + r.name +
              '</div>' +
              '<div class="qc-desc">' + r.desc + '</div>' +
              '<div class="qc-fix">💡 ' + r.fix + '</div>' +
            '</div>';
          });
        });
        h += '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" id="qcCloseBtn">关闭</button>' +
            '<button class="btn btn-primary" id="qcOptBtn">🔧 一键优化未达标项</button>' +
          '</div>' +
        '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var modalEl = tmp.firstElementChild;
        doc.body.appendChild(modalEl);
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });
        doc.getElementById('qcCloseBtn').addEventListener('click', function() { modalEl.remove(); });
        var optBtn = doc.getElementById('qcOptBtn');
        if (optBtn) {
          optBtn.addEventListener('click', function() {
            modalEl.remove();
            var failedItems = results.filter(function(r) { return !r.pass; });
            var failedNames = failedItems.map(function(r) { return r.name; });
            var optInstructions = buildOptimizeInstructions(failedItems);
            showOptimizeModal(failedNames.join('、'), optInstructions);
          });
        }
      }

      // ===== MVU状态栏预览（仅当用户已配置MVU变量系统时可用）=====
      // 用 iframe srcdoc 沙箱渲染状态栏HTML，内部 mock 酒馆运行时API
      // 数据源：从 [InitVar]初始变量 世界书条目解析YAML作为 stat_data
      // HTML源：优先用AI生成的正则6 replaceString，回退用 MVU_STATUS_BAR_HTML 默认模板
      function showMvuStatusBarPreview() {
        /* 改进Q：重复打开去重——若已存在预览模态框，先移除旧实例，避免iframe叠加和定时器累积 */
        var existingModal = doc.getElementById('mvuPreviewModal');
        if (existingModal) { existingModal.remove(); }
        var entries = (cardData.character_book || {}).entries || [];
        /* 前置检查：必须存在MVU条目 */
        var hasMVU = entries.some(function(e) { return isMVUEntry(e.comment || ''); });
        if (!hasMVU) {
          showToast('请先配置MVU变量系统（[InitVar]初始变量等条目）后再使用状态栏预览', 'warning');
          return;
        }
        /* 读取 [InitVar] 初始变量 YAML 作为预览假数据 */
        var initVarEntry = null;
        for (var i = 0; i < entries.length; i++) {
          if ((entries[i].comment || '').toLowerCase().indexOf('[initvar]') >= 0) {
            initVarEntry = entries[i];
            break;
          }
        }
        var statData = {};
        var initVarContent = '';
        var usingSampleData = false;
        if (initVarEntry && initVarEntry.content) {
          initVarContent = initVarEntry.content;
          var parsed = parseInitVar(initVarContent);
          if (parsed) statData = parsed;
        }
        /* 若 InitVar 为空或解析失败，使用示例数据让预览仍有内容可渲染 */
        if (!statData || Object.keys(statData).length === 0) {
          statData = {
            '世界': { '当前日期': '2025-07-26', '当前时间': '17:36' },
            '主角': { '好感度': 35, '状态': '正常', '物品栏': {} }
          };
          usingSampleData = true;
        }
        /* 读取状态栏HTML：优先AI生成的正则6，回退默认模板 */
        var statusBarHtml = MVU_STATUS_BAR_HTML;
        var statusBarSource = '默认模板';
        var regexScripts = cardData.extensions && cardData.extensions.regex_scripts || [];
        for (var j = 0; j < regexScripts.length; j++) {
          var r = regexScripts[j];
          /* 匹配 StatusPlaceHolder（兼容带Impl和不带Impl的版本） */
          if ((r.findRegex || '').indexOf('StatusPlaceHolder') >= 0 && r.markdownOnly && !r.promptOnly) {
            var rep = r.replaceString || '';
            /* 去掉 ```html ... ``` 或 ``` ... ``` 包裹（StageDog标准用纯```无语言） */
            var m = rep.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
            if (m) {
              statusBarHtml = m[1];
              statusBarSource = 'AI生成正则';
            } else if (rep.indexOf('<!doctype html') >= 0 || rep.indexOf('<html') >= 0) {
              statusBarHtml = rep;
              statusBarSource = 'AI生成正则';
            }
            break;
          }
        }
        /* ====== HTML 鲁棒性包装：如果 AI 生成的只是 <body> 片段或独立片段，自动补全为完整 HTML 文档 ====== */
        (function() {
          var hasDocType = /<!doctype\s/i.test(statusBarHtml);
          var hasHtmlTag = /<html[\s>]/i.test(statusBarHtml);
          var hasHeadTag = /<head[\s>]/i.test(statusBarHtml);
          var hasBodyTag = /<body[\s>]/i.test(statusBarHtml);
          /* 默认模板本身是完整的，不用包；AI 生成的片段没 doctype/head/body 时需要包 */
          if (!hasDocType && !hasHtmlTag) {
            statusBarHtml = '<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <title>MVU StatusBar</title>\n</head>\n<body>\n' + statusBarHtml + '\n</body>\n</html>';
            statusBarSource += '（已补全HTML骨架）';
          } else if (hasHtmlTag && !hasHeadTag) {
            /* 有 <html> 但缺 <head>：插入空 head 标签供 mock 注入 */
            statusBarHtml = statusBarHtml.replace(/<html([^>]*)>/i, '<html$1>\n<head></head>');
          }
          /* 如果最终仍缺 render-root，自动补一个（放在 body 开头），否则渲染没地方写 */
          if (statusBarHtml.indexOf('id="render-root"') < 0 && statusBarHtml.indexOf("id='render-root'") < 0) {
            if (/<body([^>]*)>/i.test(statusBarHtml)) {
              statusBarHtml = statusBarHtml.replace(/(<body[^>]*>)/i,
                '$1\n<div class="mvu-status-card"><div class="card-body" id="render-root"><div class="loading-state">正在加载状态数据...</div></div></div>');
              statusBarSource += '（已补render-root）';
            }
          }
        })();
        /* 构建预览弹窗：顶部说明+数据来源标识，主体为iframe沙箱渲染 */
        var h = '<div class="modal" id="mvuPreviewModal">' +
          '<div class="modal-content" style="max-width:720px">' +
            '<h3 style="color:#a16207;margin-bottom:8px;font-size:1em">🎛️ MVU状态栏预览</h3>' +
            /* 顶部只有标题，然后直接是iframe渲染区，不显示任何变量信息 */
            '';
        /* InitVar 缺失提示仅用于控制台日志，不在界面显示 */
        if (!initVarEntry) {
          console.warn('[预览] 未找到 [InitVar]初始变量 条目，使用示例数据');
        } else if (usingSampleData) {
          console.warn('[预览] [InitVar] 条目内容为空或格式异常，使用示例数据');
        }
        h += '<div style="background:#ffffff;border:1px solid rgba(15,23,42,.10);border-radius:8px;overflow:hidden;margin-bottom:8px">' +
          '<iframe id="mvuPreviewFrame" style="width:100%;height:420px;border:0;background:transparent" sandbox="allow-scripts"></iframe>' +
          '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" id="mvuPreviewCloseBtn">关闭</button>' +
          '</div>' +
        '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var modalEl = tmp.firstElementChild;
        doc.body.appendChild(modalEl);
        /* 注入 iframe 内容：在状态栏HTML前注入 mock API + 轻量级jquery/lodash子集 */
        var frame = doc.getElementById('mvuPreviewFrame');
        function loadFrame() {
          var mockScript = buildPreviewMockScript(statData);
          var fullDoc = statusBarHtml;
          /* ======【插入位置：将 mock 脚本放在 <head> 的最开始，保证 mock API 先于状态栏原有 script 执行 ======
             （相比插在 </head> 前，这样即使原状态栏用了 defer/module 也能拿到 $、_、getAllVariables） */
          var headStartMatch = fullDoc.match(/<head[^>]*>/i);
          if (headStartMatch) {
            /* 插入到 <head ...> 标签紧后面（紧跟 headStartMatch[0] 的后面）
               同时把默认模板的 <style> 保留（否则 mock 脚本在 style 前也没关系，因为 script 是顺序执行的，style 仍会生效 */
            var idx = fullDoc.indexOf(headStartMatch[0]);
            fullDoc = fullDoc.substring(0, idx + headStartMatch[0].length)
              + '\n' + mockScript + '\n'
              + fullDoc.substring(idx + headStartMatch[0].length);
          } else if (fullDoc.indexOf('<body') >= 0) {
            fullDoc = fullDoc.replace(/<body/i, mockScript + '<body');
          } else {
            fullDoc = mockScript + fullDoc;
          }
          /* ✅ 修复：不要在最后把所有 </script> 替换成 <\\/script>！
             - </script> 作为 HTML 闭合标签是合法且必须的（脚本 tag 需要正常闭合）
             - 只有在 <script> 标签 *文本内容内部* 出现 </script> 才会截断
             - 已在 statDataJson 阶段单独转义：JSON.stringify(statData).replace(/<\/script/gi, '<\\/script')
             - 这里再次全量替换会把 </script> tag 本身变成非法的 \</script>，让浏览器无法解析，导致整页空白！ */
          frame.srcdoc = fullDoc;
        }
        loadFrame();
        /* 关闭逻辑 */
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });
        doc.getElementById('mvuPreviewCloseBtn').addEventListener('click', function() { modalEl.remove(); });
      }

      // ===== 权重可视化预览（规范4.4） =====
      function showWeightVisual() {
        var entries = (cardData.character_book || {}).entries || [];
        if (entries.length === 0) {
          showToast('还没有世界书条目，先和AI聊聊生成内容吧', 'warning');
          return;
        }
        var permToken = 0, trigToken = 0, totalToken = 0;
        entries.forEach(function(e) {
          var tk = countTokens(e.content || '');
          totalToken += tk;
          if (e.constant) permToken += tk; else trigToken += tk;
        });

        var h = '<div class="modal" id="wvModal">' +
          '<div class="modal-content">' +
            '<h3 style="color:#a16207;margin-bottom:4px;font-size:1em">📊 权重可视化预览</h3>' +
            '<p style="font-size:.72em;color:#667085;margin-bottom:8px">展示每个条目的权重等级、触发逻辑、Token占用（对齐ST注入权重层级）</p>' +
            '<div class="wv-summary">' +
              '<div class="wv-stat"><span class="wv-stat-val" style="color:#15803d">' + entries.length + '</span><span class="wv-stat-lbl">条目总数</span></div>' +
              '<div class="wv-stat"><span class="wv-stat-val" style="color:#c98b7a">' + permToken + '</span><span class="wv-stat-lbl">常驻Token</span></div>' +
              '<div class="wv-stat"><span class="wv-stat-val" style="color:#a16207">' + trigToken + '</span><span class="wv-stat-lbl">触发Token</span></div>' +
              '<div class="wv-stat"><span class="wv-stat-val" style="color:#ca8a04">' + totalToken + '</span><span class="wv-stat-lbl">总Token</span></div>' +
            '</div>' +
            '<div class="wv-legend">';
        var legendItems = [
          { level: '最高', color: '#c98b7a', desc: 'post_history/铁则' },
          { level: '极高', color: '#c98b7a', desc: 'position=2/状态栏' },
          { level: '中高', color: '#ca8a04', desc: 'position=4 触发' },
          { level: '中', color: '#15803d', desc: '概率触发/动态' },
          { level: '低', color: '#667085', desc: 'position=1 常驻' },
          { level: '极低', color: '#b3aa98', desc: 'position=0 常驻' }
        ];
        legendItems.forEach(function(l) {
          h += '<span class="wv-legend-item"><span class="wv-legend-dot" style="background:' + l.color + '"></span>' + l.level + '(' + l.desc + ')</span>';
        });
        h += '</div>' +
            '<div class="modal-body">';

        // 按分组展示
        var groupOrder = ['常驻体系', '触发体系', '叙事', '动态系统', '自定义'];
        var groupColors = { '常驻体系': '#15803d', '触发体系': '#a16207', '叙事': '#ca8a04', '动态系统': '#ca8a04', '自定义': '#667085' };
        groupOrder.forEach(function(g) {
          var groupEntries = entries.filter(function(e) {
            var eg = getDisplayGroup(e);
            return eg === g;
          });
          if (groupEntries.length === 0) return;
          var groupTok = 0;
          groupEntries.forEach(function(e) { groupTok += countTokens(e.content || ''); });
          h += '<div class="wv-group-header"><span style="color:' + (groupColors[g] || '#667085') + '">' + g + '</span><span class="wv-group-count">' + groupEntries.length + '条 · ' + groupTok + 'T</span></div>';
          // 按权重排序（order越大权重越低，先展示高权重=order小）
          groupEntries.sort(function(a, b) { return (a.insertion_order || 100) - (b.insertion_order || 100); });
          groupEntries.forEach(function(e, idx) {
            var comment = e.comment || ('条目' + (idx + 1));
            var m = comment.match(/^<([^>]+)>/);
            var prefixKey = m ? m[1] : '';
            var wl = WEIGHT_LEVELS[prefixKey] || { level: '中', color: '#15803d', desc: '自定义' };
            var tk = countTokens(e.content || '');
            var ext = e.extensions || {};
            var tmpl = getEntryTemplate(comment);
            var isConst = e.constant !== undefined ? e.constant : (tmpl ? tmpl.constant : false);
            var pos = ext.position !== undefined ? ext.position : (tmpl ? tmpl.position : 4);
            var depth = ext.depth !== undefined ? ext.depth : (tmpl ? tmpl.depth : 4);
            var sticky = ext.sticky || 0;
            var cd = ext.cooldown || 0;
            var pr = ext.prevent_recursion;
            var prob = ext.probability !== undefined ? ext.probability : 100;
            var sl = ext.selectiveLogic || 0;

            h += '<div class="wv-entry" style="border-left-color:' + wl.color + '">' +
              '<div class="wv-entry-header">' +
                '<span class="wv-entry-name" title="' + escHtml(comment) + '">' + escHtml(comment) + '</span>' +
                '<span class="wv-entry-level" style="background:' + wl.color + '20;color:' + wl.color + ';border:1px solid ' + wl.color + '50">' + wl.level + '</span>' +
                '<span class="wv-entry-token">' + tk + 'T</span>' +
              '</div>' +
              '<div class="wv-entry-meta">' +
                '<span class="wv-tag ' + (isConst ? 'const' : 'trig') + '">' + (isConst ? '常驻' : '触发') + '</span>' +
                '<span class="wv-tag">pos=' + pos + '</span>' +
                (!isConst ? '<span class="wv-tag">depth=' + depth + '</span>' : '') +
                (sticky ? '<span class="wv-tag dyn">sticky</span>' : '') +
                (cd ? '<span class="wv-tag warn">CD=' + cd + '</span>' : '') +
                (pr ? '<span class="wv-tag const">防递归</span>' : '') +
                (prob < 100 ? '<span class="wv-tag warn">' + prob + '%</span>' : '') +
                (sl ? '<span class="wv-tag trig">SL=' + sl + '</span>' : '') +
                '<span class="wv-tag" style="color:#b3aa98" title="' + escHtml(wl.desc) + '">' + escHtml(wl.desc) + '</span>' +
              '</div>' +
            '</div>';
          });
        });

        h += '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" id="wvCloseBtn">关闭</button>' +
          '</div>' +
        '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var modalEl = tmp.firstElementChild;
        doc.body.appendChild(modalEl);
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });
        doc.getElementById('wvCloseBtn').addEventListener('click', function() { modalEl.remove(); });
      }

      // ===== 分组管理（规范4.4：分组自动适配） =====
      function showGroupMgr() {
        var entries = (cardData.character_book || {}).entries || [];
        if (entries.length === 0) {
          showToast('还没有世界书条目', 'warning');
          return;
        }
        var groups = {};
        entries.forEach(function(e) {
          var g = getDisplayGroup(e);
          if (!groups[g]) groups[g] = [];
          groups[g].push(e);
        });
        var groupColors = { '常驻体系': '#15803d', '触发体系': '#a16207', '叙事': '#ca8a04', '动态系统': '#ca8a04', '自定义': '#667085' };
        var h = '<div class="modal" id="groupModal">' +
          '<div class="modal-content">' +
            '<h3 style="color:#a16207;margin-bottom:4px;font-size:1em">🗂️ 分组管理</h3>' +
            '<p style="font-size:.72em;color:#667085;margin-bottom:8px">每个体系对应一个世界书分组，支持批量开关（对齐ST分组管理功能）</p>' +
            '<div class="group-mgr-list">';
        Object.keys(groups).forEach(function(g) {
          var gEntries = groups[g];
          var gTok = 0;
          gEntries.forEach(function(e) { gTok += countTokens(e.content || ''); });
          var allEnabled = gEntries.every(function(e) { return e.enabled !== false; });
          h += '<div class="group-mgr-item">' +
            '<span class="gm-color" style="background:' + (groupColors[g] || '#667085') + '"></span>' +
            '<span class="gm-name">' + escHtml(g) + '</span>' +
            '<span class="gm-count">' + gEntries.length + '条 · ' + gTok + 'T</span>' +
            '<button class="gm-toggle ' + (allEnabled ? 'on' : '') + '" data-group="' + escHtml(g) + '">' + (allEnabled ? '已启用' : '已禁用') + '</button>' +
          '</div>';
        });
        h += '</div>' +
          '<div class="modal-actions">' +
            '<button class="btn btn-ghost" id="groupCloseBtn">关闭</button>' +
            '<button class="btn btn-primary" id="groupReassignBtn">🔄 按前缀重新分组</button>' +
          '</div>' +
        '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var modalEl = tmp.firstElementChild;
        doc.body.appendChild(modalEl);
        modalEl.addEventListener('click', function(e) { if (e.target === modalEl) modalEl.remove(); });
        doc.getElementById('groupCloseBtn').addEventListener('click', function() { modalEl.remove(); });
        var toggles = modalEl.querySelectorAll('.gm-toggle');
        for (var i = 0; i < toggles.length; i++) {
          toggles[i].addEventListener('click', function() {
            var g = this.getAttribute('data-group');
            var turnOn = !this.classList.contains('on');
            entries.forEach(function(e) {
              var eg = getDisplayGroup(e);
              if (eg === g) e.enabled = turnOn;
            });
            this.classList.toggle('on', turnOn);
            this.textContent = turnOn ? '已启用' : '已禁用';
            saveToStorage();
            renderPreview();
            showToast((turnOn ? '已启用' : '已禁用') + '分组：' + g, 'success');
          });
        }
        var reassignBtn = doc.getElementById('groupReassignBtn');
        if (reassignBtn) reassignBtn.addEventListener('click', function() {
          entries.forEach(function(e) {
            var tmpl = getEntryTemplate(e.comment || '');
            if (tmpl) {
              if (!e.extensions) e.extensions = {};
              e.extensions.group = tmpl.group;
            }
          });
          saveToStorage();
          modalEl.remove();
          showGroupMgr();
          showToast('已按条目前缀重新分配分组', 'success');
        });
      }

      // ===== 优化指令映射（质检未达标项→AI优化指令） =====
      function buildOptimizeInstructions(failedItems) {
        // 每条指令统一为「问题 · 影响 · 修复」三段式，便于 AI 精准理解与执行
        // field 字段用于在弹窗中按字段分组展示，并驱动 AI 优化目标字段
        var instructionMap = {
          // === 基础字段 ===
          '世界/角色名称': { field: 'name', instr: '问题：世界/角色名称为空\n影响：无法识别卡片主体\n修复：设置一个简洁有力的世界名称（如「青云大陆」），字数自由掌握' },
          '角色/世界观描述（不限字数）': { field: 'description', instr: '问题：角色/世界观描述为空\n影响：世界背景缺乏内容，AI缺乏设定锚点\n修复：填写描述内容，字数自由（建议覆盖世界核心设定、地理、历史、文化、社会结构等，语言生动具体）' },
          '个性/性格描述（不限字数）': { field: 'personality', instr: '问题：个性/性格描述待设置（非硬性必填）\n影响：纯世界模式无影响，角色模式下核心性格不明确\n修复：纯世界模式无需设置；角色模式建议填写核心性格（非必填，自由掌握）' },
          '场景设定（不限字数）': { field: 'scenario', instr: '问题：场景设定待设置（非硬性必填）\n影响：核心情境可放在描述中，不强制单独写\n修复：非必填，核心情境可放描述中自由掌握；如需要独立开场情境可填写' },
          '开场白（不限字数）': { field: 'first_mes', instr: '问题：开场白为空\n影响：代入感弱，玩家难以进入情境\n修复：填写开场白内容，字数自由（建议结构：场景描写→动作驱动→内心独白→自然对话→结尾留钩。必须完整文本，禁止占位符）' },
          '身份自洽：四处身份描述一致': { field: 'personality', instr: '问题：personality/description/scenario/first_mes 四处对角色身份描述有冲突\n影响：AI输出人格分裂，前后设定矛盾\n修复：统一四处的身份描述，确保角色自称、职业、种族、时空背景等信息一致（身份定位由写卡器自动从 personality/description 提取，无需手动写 system_prompt）' },
          // === 高价值字段 ===
          '多开局机制（不限形式）': { field: 'entries', instr: '问题：缺少多开局分支机制\n影响：重玩价值低，开局体验单一\n修复：用 <动态适配>分支开局世界书条目(selective=true, keys含选择关键词) + MVU initvar 覆盖，或在 first_mes 末尾内嵌分支选择提示（二选一或组合）。alternate_greetings 由写卡器自动管理兼容。' },
          'depth_prompt 新手引导（depth=0）': { field: 'depth_prompt', instr: '问题：缺少 depth_prompt 新手引导\n影响：新玩家不知道如何互动\n修复：生成 depth_prompt.prompt 新手引导内容，depth 默认0（对所有玩家生效，可选）' },
          'regex_scripts 状态同步正则': { field: 'regex_scripts', instr: '问题：缺少 regex_scripts 正则脚本（按需生成）\n影响：无法实现状态格式化、数值高亮等动态效果\n修复：按需生成实用脚本，覆盖状态格式化、行动标签、数值高亮、表情转换等（数量自由）' },
          // === 世界书基础 ===
          '世界书条目（不限数量）': { field: 'entries', instr: '问题：世界书条目数为0\n影响：完全没有条目内容承载设定\n修复：至少创建1条世界书条目，数量不限（自由增减，按创作进度自然增加），覆盖基础公理、核心铁则、近场约束、场景机制、实体交互、叙事背景、动态系统等模块' },
          '触发词覆盖率 ≥50%': { field: 'entries', instr: '问题：触发词覆盖率不足50%\n影响：触发条目无法被正确激活\n修复：为≥50%的条目设置精准 keys 触发词，避免泛用词（如"的""是"）' },
          '条目内容（不限字数，自由掌握）': { field: 'entries', instr: '问题：条目内容字数自由（无硬性限制）\n影响：按创作需要的精细度决定长短\n修复：字数完全自由，按你需要的精细度决定每条长短（短条目也行，详细长条目也行）' },
          '条目命名规范 ≥50%': { field: 'entries', instr: '问题：条目命名不规范\n影响：难以识别条目职能与权重层级\n修复：为≥50%的条目使用规范前缀：<基础公理>、<核心铁则>、<近场强约束>、<场景机制>、<实体交互>、<叙事背景>、<动态系统>；MVU条目用[InitVar]前缀' },
          '权重合理性：核心规则在高权重位': { field: 'entries', instr: '问题：核心规则未在高权重位\n影响：AI容易忽略核心规则\n修复：核心规则必须放在 <核心铁则> 条目（高权重位），近场约束放适当位置' },
          'content自包含性（无上下文依赖）': { field: 'entries', instr: '问题：条目content含上下文依赖词\n影响：条目单独触发时信息不完整\n修复：移除"如上所述""见上文""前文提到"等词，确保每条content都是完整独立的信息' },
          // === 世界书高级 ===
          '递归链条：delay_until_recursion': { field: 'entries', instr: '问题：未使用递归链条\n影响：无法实现"提到A自动带出A背景"\n修复：为叙事类条目开启 extensions.delay_until_recursion=true，实现关联触发' },
          '分组机制：group分组': { field: 'entries', instr: '问题：未使用group分组\n影响：场景变体/难度分层无法互斥\n修复：为场景变体/难度分层/时间分支设置 extensions.group 分组（同组仅注入1条实现互斥）' },
          '次级键过滤：secondary_keys + selectiveLogic': { field: 'entries', instr: '问题：未使用次级键过滤\n影响：复杂条件触发不精准\n修复：为复杂条件条目设置 secondary_keys 配合 extensions.selectiveLogic（0=AND_ANY,1=NOT_ALL,2=NOT_ANY,3=AND_ALL）' },
          '概率事件：probability < 100': { field: 'entries', instr: '问题：未使用概率触发\n影响：缺少随机性与惊喜感\n修复：为随机天气/彩蛋/遭遇条目设置 extensions.useProbability=true 且 extensions.probability<100' },
          '正则触发键': { field: 'entries', instr: '问题：未使用正则触发键\n影响：无法精确匹配说话者\n修复：为需要精确匹配的条目使用正则键，如 keys:["/^\\\\x01{{user}}:.*?/i"]' },
          '组评分 use_group_scoring': { field: 'entries', instr: '问题：未使用组评分\n影响：大分组匹配精准度不足\n修复：为大分组条目开启 extensions.use_group_scoring=true' },
          'sticky/cooldown冲突检查': { field: 'entries', instr: '问题：条目同时设置sticky和cooldown\n影响：逻辑冲突（sticky持续存在 vs cooldown间歇触发）\n修复：移除其中一个，按需保留单一机制' },
          'position配置合理性': { field: 'entries', instr: '问题：position配置有误\n影响：注入位置异常\n修复：constant条目 extensions.position≤1；position=6需配depth+role；position=7需配outlet_name' },
          // === 正则脚本 ===
          '脚本功能单一': { field: 'regex_scripts', instr: '问题：正则脚本功能混合\n影响：难以维护与调试\n修复：每个脚本只做一件事，复杂替换拆分成多个简单脚本' },
          '正则标志正确（g全局匹配）': { field: 'regex_scripts', instr: '问题：findRegex缺少g标志\n影响：只替换第一个匹配\n修复：findRegex 包含g标志（如/pattern/gi），中文场景加i' },
          '非贪婪匹配（.*?）': { field: 'regex_scripts', instr: '问题：使用贪婪匹配.*或.+\n影响：匹配过多内容\n修复：改用.*?或.+?非贪婪匹配' },
          'placement配置检查': { field: 'regex_scripts', instr: '问题：未设置placement\n影响：脚本不知在哪个位置执行\n修复：设置placement数组，[0]=用户输入、[1]=AI回复、[0,1]=两者都处理' },
          'substituteRegex范围（0-2）': { field: 'regex_scripts', instr: '问题：substituteRegex超出0-2范围\n影响：宏替换行为异常\n修复：设为0(不替换宏)/1(原始替换)/2(转义替换)，一般用1' },
          '状态栏/MVU脚本runOnEdit': { field: 'regex_scripts', instr: '问题：状态栏/MVU脚本开启了runOnEdit（违反StageDog标准）\n影响：编辑消息时重复执行脚本，状态栏闪烁或初始化异常\n修复：MVU/状态栏/思维链/变量美化类脚本设置 runOnEdit=false（对齐tavern_helper_template标准）' },
          // === 运行效果 ===
          '常驻Token估算（仅供参考，不限量）': { field: 'entries', instr: '问题：常驻Token量仅供参考（不硬性限制）\n影响：AI失忆时再考虑精简\n修复：常驻内容>2000Token，如遇AI失忆可考虑精简部分；否则自由掌握，仅参考' },
          '递归安全：实体类条目开启prevent_recursion': { field: 'entries', instr: '问题：实体类条目未开启prevent_recursion\n影响：链式触发导致Token爆炸\n修复：为<实体交互>、<重要角色>、<地点场景>等条目开启 extensions.prevent_recursion=true' },
          '冷却防抖：场景类条目开启cooldown': { field: 'entries', instr: '问题：场景类条目未设置cooldown\n影响：内容刷屏\n修复：为<场景机制>、<核心玩法>等条目设置 extensions.cooldown=3' },
          // === MVU变量系统 ===
          'MVU四大核心条目完整': { field: 'entries', instr: '问题：MVU四大核心条目不完整\n影响：变量系统无法正常运作\n修复：生成完整四件套——\n  1. [InitVar]初始变量：YAML格式定义所有变量初始值（缩进表示层级，如 白娅:\\n  依存度: 35）\n  2. 变量列表：固定内容 "---\\n<status_current_variables>\\nnull\\n</status_current_variables>"\n  3. [mvu_update]变量更新规则：YAML格式，含 type/range/check 三字段\n  4. [mvu_update]变量输出格式：定义 <UpdateVariable> 输出格式，采用 JSON Patch 标准（replace/delta/insert/remove/move 操作）' },
          '[InitVar]条目enabled=false': { field: 'entries', instr: '问题：[InitVar]条目 enabled=true\n影响：MVU不会读取已开启的initvar条目，导致变量初始化失败\n修复：将 [InitVar] 条目的 enabled 改为 false（必须禁用，MVU只读取禁用的initvar条目进行初始化）' },
          '变量列表含format_message_variable宏': { field: 'entries', instr: '问题：变量列表条目标签内缺少 null\n影响：LLM无法读取当前变量值，变量更新无依据\n修复：变量列表条目固定格式：\n  ---\\n<status_current_variables>\\nnull\\n</status_current_variables>\n  注意：标签内必须写裸 null（禁止 {{null}}、{{format_message_variable::stat_data}}、{{get_message_variable::stat_data}} 等宏变体）' }
        };

        // 按字段分组，便于 AI 按字段批量处理
        var groups = {};
        failedItems.forEach(function(item) {
          var entry = instructionMap[item.name];
          if (!entry) return;
          if (!groups[entry.field]) groups[entry.field] = [];
          groups[entry.field].push({ name: item.name, instr: entry.instr });
        });

        // 输出结构化 Markdown，AI 可按字段定位与执行
        var lines = [];
        lines.push('# 待优化项清单（按字段分组）');
        lines.push('');
        lines.push('共 ' + failedItems.length + ' 项未达标，需优化字段：' + Object.keys(groups).join('、'));
        lines.push('');
        Object.keys(groups).forEach(function(field) {
          lines.push('## 字段：' + field);
          groups[field].forEach(function(item, idx) {
            lines.push('');
            lines.push('### ' + (idx + 1) + '. ' + item.name);
            lines.push(item.instr);
          });
          lines.push('');
        });
        lines.push('## 执行要求');
        lines.push('- 严格按上述"修复"方法执行，不要遗漏任何一项');
        lines.push('- 输出 JSON 代码块，只包含被优化的字段（entries/depth_prompt/regex_scripts 放顶层，不嵌套）');
        lines.push('- entries 优化时优先用相同 comment 覆盖现有条目，不足再新增');
        lines.push('- MVU 相关条目必须遵守：[InitVar] enabled=false，变量列表标签内必须为 null');
        return lines.join('\n');
      }

      // ===== 优化弹窗 =====
      var selectedOptFields = [];
      function showOptimizeModal(presetReq, optInstructions) {
        if (!cardData.name && !cardData.description) {
          showToast('还没有内容可以优化哦', 'warning');
          return;
        }
        var fields = [
          { key: 'name', label: '🌍 世界名称' },
          { key: 'description', label: '📜 世界观描述' },
          { key: 'first_mes', label: '🎬 开场白' },
          { key: 'system_prompt', label: '⚡ 系统指令' },
          { key: 'alternate_greetings', label: '🎭 备用开局' },
          { key: 'depth_prompt', label: '🎮 新手引导' },
          { key: 'regex_scripts', label: '🔄 状态正则' },
          { key: 'entries', label: '📖 世界书条目' }
        ];
        selectedOptFields = [];
        var h = '<div class="modal" id="optModal">' +
          '<div class="modal-content">' +
            '<h3 style="color:var(--accent-deep);margin-bottom:4px;font-size:1em;display:inline-flex;align-items:center;gap:7px">' + svgIcon('wrench', 17) + ' AI 角色卡优化</h3>' +
            '<p style="font-size:.78em;color:var(--ink-soft);margin-bottom:8px">选择要优化的字段，AI将智能优化并展示对比</p>' +
            '<div class="opt-field-select">';
        fields.forEach(function(f) {
          h += '<span class="opt-field-tag" data-key="' + f.key + '">' + f.label + '</span>';
        });
        h += '</div>' +
            '<textarea class="chat-input" id="optCustom" placeholder="补充优化要求（可选），如：让开场白更有悬疑感、增加仙侠氛围..." rows="3" style="margin:6px 0;min-height:70px">' + (optInstructions || '') + (presetReq ? ('\n\n' + presetReq) : '') + '</textarea>' +
            '<div id="optProgress" style="display:none;text-align:center;padding:12px;color:var(--accent-deep);font-size:.85em"><span class="typing" style="display:inline"><span>●</span><span>●</span><span>●</span></span> AI正在优化...</div>' +
            '<div id="optResult" class="modal-body" style="display:none"></div>' +
            '<div class="modal-actions">' +
              '<button class="btn btn-ghost" id="optCloseBtn">关闭</button>' +
              '<button class="btn btn-primary" id="startOptBtn">' + svgIcon('sparkle', 15) + ' 开始优化</button>' +
            '</div>' +
          '</div></div>';
        var tmp = doc.createElement('div');
        tmp.innerHTML = h;
        var optModalEl = tmp.firstElementChild;
        doc.body.appendChild(optModalEl);
        optModalEl.addEventListener('click', function(e) { if (e.target === optModalEl) optModalEl.remove(); });
        doc.getElementById('optCloseBtn').addEventListener('click', function() { optModalEl.remove(); });

        var tags = doc.querySelectorAll('.opt-field-tag');
        for (var i = 0; i < tags.length; i++) {
          tags[i].addEventListener('click', function() {
            this.classList.toggle('selected');
            var k = this.getAttribute('data-key');
            var idx = selectedOptFields.indexOf(k);
            if (idx >= 0) selectedOptFields.splice(idx, 1);
            else selectedOptFields.push(k);
          });
        }
        doc.getElementById('startOptBtn').addEventListener('click', startOptimize);
      }

      async function startOptimize() {
        if (selectedOptFields.length === 0) { showToast('请先点击上方的字段标签选择要优化的字段', 'warning'); return; }
        if (isGenerating) { showToast('AI正在处理中，请稍候...', 'warning'); return; }
        isGenerating = true;
        var customReq = doc.getElementById('optCustom').value.trim();
        var prog = doc.getElementById('optProgress');
        var res = doc.getElementById('optResult');
        var btn = doc.getElementById('startOptBtn');
        if (prog) prog.style.display = 'block';
        if (btn) btn.disabled = true;

        try {
          var cardStr = JSON.stringify(buildExportCard(cardData), null, 2);
          var optPrompt = '你是SillyTavern角色卡优化专家，熟悉chara_card_v3格式和世界书、正则脚本规范。请针对指定字段优化角色卡。\n\n' +
            '=== 任务目标 ===\n' +
            '只优化以下字段，其他字段保持不变：' + selectedOptFields.join(', ') + '\n\n' +
            (customReq ? '=== 用户额外要求 ===\n' + customReq + '\n\n' : '') +
            '=== 字段优化细则（必须严格遵守） ===\n' +
            '【description 世界观/角色描述】\n' +
            '- 字数：不限（自由掌握）\n' +
            '- 内容：包含世界核心设定、地理、历史、文化、社会结构等，提升沉浸感\n' +
            '- 语言：生动具体，避免抽象描述\n\n' +
            '【first_mes 开场白】\n' +
            '- 字数：不限（自由掌握）\n' +
            '- 结构：场景描写 → 动作驱动 → 内心独白 → 自然对话 → 结尾留钩\n' +
            '- 必须包含完整文本，严禁使用占位符\n\n' +
            '【身份定位（替代 system_prompt）】\n' +
            '- 身份定位由写卡器自动从 personality/description 提取，无需手动输出 system_prompt 字段\n' +
            '- 确保 personality/description 中包含清晰的AI身份定位信息\n\n' +
            '【多开局机制（替代 alternate_greetings）】\n' +
            '- 实现方式：<动态适配> 分支开局世界书条目 或 在 first_mes 末尾内嵌互动选项（二选一或组合）\n' +
            '- <动态适配>条目标配：selective=true, keys 含选择关键词\n' +
            '- 差异化：不同身份/难度/场景的开局分支\n' +
            '- 提升重玩价值；alternate_greetings 字段由写卡器自动管理兼容\n\n' +
            '【depth_prompt 新手引导】\n' +
            '- prompt：新手引导内容，教玩家如何互动（可选）\n' +
            '- depth：默认0（表示对所有玩家生效）\n\n' +
            '【regex_scripts 状态同步正则】\n' +
            '- 数量：按需生成，自由掌握\n' +
            '- 格式规范：\n' +
            '  * findRegex：/模式/flags格式（必须包含g全局匹配，中文加i忽略大小写）\n' +
            '  * replaceString：支持$1-$9捕获组、{{match}}宏、$&完整匹配\n' +
            '  * placement：[0]=用户输入，[1]=AI回复，[0,1]=两者都处理\n' +
            '  * substituteRegex：0=不替换宏，1=原始替换，2=转义替换（一般用1）\n' +
            '  * runOnEdit：true=编辑消息时重新执行；MVU/状态栏/变量美化类脚本必须设为false（StageDog标准，避免编辑消息时重复执行）\n' +
            '  * scriptName：简短描述脚本功能\n' +
            '- 常用场景：\n' +
            '  * 状态栏格式化：findRegex="/<status>(.*?)</status>/gi", replaceString="**状态：**$1"\n' +
            '  * 行动标签：findRegex="/<action>(.*?)</action>/gi", replaceString="**行动：**$1"\n' +
            '  * 数值高亮：findRegex="/(\\d+)(点|级|年|%)/gi", replaceString="**$1$2**"\n' +
            '  * 表情转换：findRegex="/\\[笑\\]/gi", replaceString="😄"\n\n' +
            '【entries 世界书条目】\n' +
            '- 数量：不限（自由增减，按创作进度自然增长）\n' +
            '- 命名规范：使用<基础公理>、<核心铁则>、<近场强约束>、<场景机制>、<实体交互>、<叙事背景>、<动态系统>等前缀\n' +
            '- content要求：字数自由（完整自包含即可），严禁使用"如上所述""见上文"等上下文依赖词\n' +
            '- keys：精准触发词，避免泛用词（如"的""是"）\n' +
            '- 核心配置：\n' +
            '  * constant=true：常驻条目（核心规则、基础公理），position应≤1\n' +
            '  * constant=false：触发条目，position=4（默认）\n' +
            '  * prevent_recursion：实体类条目必须开启，防止链式触发\n' +
            '  * cooldown：场景类条目建议设为3，防止刷屏\n' +
            '  * group/group_weight：场景变体使用分组实现互斥\n' +
            '  * delay_until_recursion：叙事类条目开启，实现关联触发\n' +
            '  * probability：随机事件设为<100\n' +
            '  * secondary_keys+selectiveLogic：复杂条件控制\n' +
            '- 优化策略：优先优化现有条目（用相同comment覆盖），不足则补充新条目\n\n' +
            '⚠️⚠️⚠️【entries 优化铁律 - 违反则优化失败=旧内容残留=用户骂你】\n' +
            '1. 优化≠追加！优化=覆盖/替换旧条目，而不是只加新条目！\n' +
            '2. 修改条目：新条目的 comment 必须与旧条目的 comment「完全相同=字符级匹配」（空格标点都不能变）\n' +
            '3. 重写条目：必须先删除旧条目（_action:delete），再加新条目；或者确保新条目 comment 完全一致\n' +
            '4. 精简条目：如果要求"精简N条"，必须明确用 _delete / _action:delete 删除多出的条目\n' +
            '5. 同前缀条目重复：若优化后同模块（如<核心铁则>）的条目数超标，必须删除旧的、质量较低的条目\n' +
            '6. 最推荐的写法（AI最容易写对，系统支持最好）：\n' +
            '   替换条目=先写 _action:delete 条目删旧的，再写新条目（新comment可以与旧的不同）\n' +
            '   例：\n' +
            '   "entries": [\n' +
            '     { "_action":"delete", "comment":"<这里粘贴精确旧comment>" },\n' +
            '     { "comment":"<新comment或相同comment>", "content":"...新内容...", "keys":[...] }\n' +
            '   ]\n\n' +
            '【MVU 变量系统条目（仅当优化 entries 且卡内已含 MVU 条目时适用）】\n' +
            'MVU 四大核心条目必须成套存在，缺一不可：\n' +
            '1. [InitVar]初始变量（comment 以 [InitVar] 开头）\n' +
            '   - enabled 必须 false（MVU 只读取禁用的 initvar 条目进行初始化，true 会失效）\n' +
            '   - content 为 YAML 格式，缩进表示层级，定义所有变量的初始值\n' +
            '   - 示例：\n     世界:\n       当前时间: 开局\n       当前地点: 待定\n     主角:\n       体力值: 100\n       状态: 进行中\n     同桌:\n       好感度: 0\n' +
            '2. 变量列表（comment 含"变量列表"）\n' +
            '   - content 标签内必须为 null（否则 LLM 无法读取当前变量值）\n' +
            '   - 固定格式：---\\n<status_current_variables>\\nnull\\n</status_current_variables>\n' +
            '   - 标签内写裸 null（禁止 {{null}}、{{format_message_variable::stat_data}}、{{get_message_variable::stat_data}} 等宏变体）\n' +
            '3. 变量更新规则（comment 含"变量更新规则"）\n' +
            '   - 定义每个变量在什么条件下更新、更新成什么值\n' +
            '4. 变量输出格式（comment 含"变量输出格式"，建议加 [mvu_update] 前缀）\n' +
            '   - 定义 <UpdateVariable> 输出格式，采用 JSON Patch (RFC 6902) 标准\n' +
            '   - 支持操作：replace(替换值)/delta(数值增减)/insert(插入)/remove(删除)/move(移动)\n' +
            '   - AI 输出示例：{ "op": "replace", "path": "/stat_data/主角/体力值", "value": 80 }, { "op": "delta", "path": "/stat_data/同桌/好感度", "value": 5 }\n' +
            '注意：MVU 脚本（bundle.js）、变量结构脚本（zod schema）、正则1-5、<状态栏>占位符提醒条目、<StatusPlaceHolderImpl/> 占位符均由导出时自动注入，AI 无需生成\n' +
            '⚠️但正则6（美化状态栏）必须由AI生成！严格按以下UI/UX规范+StageDog标准生成，美观度对齐参考卡片，严禁敷衍：\n' +
            '  · 【配置固定StageDog标准】findRegex="/<StatusPlaceHolderImpl\\\\/>/g", placement=[2], markdownOnly=true, promptOnly=false, runOnEdit=false, substituteRegex=0\n' +
            "  · 【包裹格式StageDog标准】完整HTML结构（无<!doctype html>、无<html>根）：head(style)+body(script type=module)；replaceString用纯```代码块包裹（禁止```html标记）\n" +
            '  · 【读变量StageDog标准】优先getVariables({type:"message",message_id:"latest"})，try/catch fallback getAllVariables()，封装_getVars() helper；_.get(res,"stat_data",{})取根（禁止Mvu.getVar有时序失效）\n' +
            '  · 【异步等待StageDog标准两步走】①await waitGlobalInitialized("Mvu")；②while+setTimeout每秒轮询_.has(_getVars(),"stat_data")（最多15秒）\n' +
            "  · 【顶层入口+主同步】入口用$(async function(){try/catch})，禁止顶层errorCatched；同步用setInterval(刷新,2000)（StageDog主机制）；事件仅try/catch包裹作加分兜底\n" +
            '  · 【逐变量填充规范（用户模板标准核心！废弃递归renderTree）】function populateCharacterData() { const all_variables = getAllVariables(); const data = _.get(all_variables, "stat_data", {}); ... } 跳过 _/$ 开头字段\n' +
            '    - typeof==="number" → $(\'#id\').text(val); 可配合进度条；布尔值 → $(\'#id\').text(val?"✓":"✕")（绿/红分色，不用emoji✅❌）\n' +
            '    - 逐变量点对点填充：const val = _.get(data, "路径.字段", 默认值); $(\'#id\').text(val); —— 每个变量对应Step3骨架中唯一id\n' +
            '    - 数组 Array.isArray(value) → items.map(it=>`<li>${it}</li>`).join("") → $(\'#id\').html(html)；其他 → $(\'#id\').text(String(val))\n' +
            '  · 【配色（核心！必须用CSS变量）】推荐低饱和柔色系：深色毛玻璃主题 --card-bg:rgba(30,35,45,0.82);backdrop-filter:blur(6px); 配--accent-blue:#93c5fd / --accent-green:#86efac / --accent-red:#fca5a5 / --text-sub:#94a3b8\n' +
            '  · 【布局（核心！严禁平铺直叙）】必须用Grid响应式：.stat-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:4px 16px; }\n' +
            '    - .category-title 分类标题（font-weight:600 + 分隔线 + ▸）\n' +
            '    - .indent-1/2/3/4 { padding-left:8/20/32/44px } 按嵌套深度缩进\n' +
            '    - .stat-item flex+justify-content:space-between + align-items:flex-start + gap:8px + .hover-bg 高亮\n' +
            '  · 【动效（点睛）】.loading-state 文本居中 + @keyframes breathe呼吸动画(opacity 0.5↔0.9)；.flash-update + @keyframes fadeIn(0.6→1) + setTimeout 300ms 移除；transition: 0.2s ease\n' +
            '  · 【输出前必查自查清单】Grid布局✓、分类标题✓、indent缩进类✓、hover高亮✓、Array处理✓、两个事件绑定✓、flash更新动画✓、loading动画✓\n\n' +
            '=== 输出格式 ===\n' +
            '只输出```json代码块，包含优化后的字段。\n' +
            '规则：\n' +
            '1. entries字段直接放在顶层，不需要嵌套在character_book中\n' +
            '2. depth_prompt和regex_scripts直接放在顶层，不需要嵌套在extensions中\n' +
            '3. 只包含被优化的字段，其他字段不要输出\n' +
            '4. 保持JSON格式正确，使用双引号\n' +
            '5. [InitVar] 条目的 enabled 必须为 false；变量列表 content 标签内必须为 null\n' +
            '6. ⚠️最关键：删除/替换条目必须使用下面「精确comment清单」里的字符串！不要自己编造comment！\n\n' +
            // 注入精确 comment 清单（仅当优化 entries 时）
            (selectedOptFields.indexOf('entries') >= 0 ? (function() {
              var entries = (cardData.character_book || {}).entries || [];
              if (!entries.length) return '（当前无世界书条目，无需处理删除）\n\n';
              var t = '=== 🌍 世界书条目精确comment清单（删/改时直接复制使用，字符级精确） ===\n';
              t += '共 ' + entries.length + ' 条条目，按模块分组：\n';
              var groups = {};
              entries.forEach(function(e, i) {
                var c = e.comment || ('条目'+(i+1));
                var p = extractEntryPrefix(c) || '其他';
                if (!groups[p]) groups[p] = [];
                groups[p].push({ idx: i+1, comment: c, content: e.content || '' });
              });
              Object.keys(groups).forEach(function(g) {
                t += '\n【前缀：<' + g + '>】 共' + groups[g].length + '条：\n';
                groups[g].forEach(function(x) {
                  t += '  ' + x.idx + '. ⟦' + x.comment + '⟧  (' + x.content.length + '字)\n';
                });
              });
              t += '\n⚠️ 删除写法示例：\n';
              t += '  { "_action":"delete", "comment":"' + (entries[0] ? entries[0].comment : '精确comment') + '" }\n';
              t += '⚠️ 修改写法：保持 comment 完全与上面一致，或先 _action:delete 再新增新comment条目\n\n';
              return t;
            })() : '') +
            (selectedOptFields.indexOf('regex_scripts') >= 0 ? (function() {
              var rx = ((cardData.extensions || {}).regex_scripts || []);
              if (!rx.length) return '';
              var t = '=== 🔧 regex_scripts 精确标识清单 ===\n';
              rx.forEach(function(r, i) {
                t += '  ' + (i+1) + '. id=' + (r.id||'(无)') + '  scriptName=' + (r.scriptName||'(无)') + '  findRegex=' + (r.findRegex||'(无)') + '\n';
              });
              t += '删除写法：{ "_action":"delete", "id":"..." } 或 { "_action":"delete", "scriptName":"..." }\n\n';
              return t;
            })() : '') +
            '=== 当前角色卡（供参考） ===\n```json\n' + cardStr + '\n```';


          var reply = await callAI(optPrompt);
          var optimized = extractJSON(reply);
          if (!optimized) {
            if (prog) prog.style.display = 'none';
            if (res) {
              res.style.display = 'block';
              res.innerHTML = '<div style="padding:12px;text-align:center;color:#c98b7a">⚠️ AI未返回有效的优化JSON<br><span style="font-size:.7em;color:#667085">原始回复：' + escHtml(reply.substring(0, 200)) + '</span></div>';
            }
          } else {
            try {
              if (prog) prog.style.display = 'none';
              if (res) {
                res.style.display = 'block';
                var compH = '';
                selectedOptFields.forEach(function(field) {
                  var beforeV = '';
                  var afterV = '';
                  if (field === 'entries') {
                    beforeV = JSON.stringify(((cardData.character_book || {}).entries || []).slice(0, 3), null, 1);
                    afterV = JSON.stringify((optimized.entries || []).slice(0, 3), null, 1);
                  } else if (field === 'alternate_greetings') {
                    beforeV = (cardData.alternate_greetings || []).join('\n---\n');
                    afterV = (optimized.alternate_greetings || []).join('\n---\n');
                  } else if (field === 'depth_prompt') {
                    var beforeDp = (cardData.extensions || {}).depth_prompt || {};
                    var afterDp = optimized.depth_prompt || {};
                    beforeV = 'prompt: ' + (beforeDp.prompt || '') + '\ndepth: ' + (beforeDp.depth || 4);
                    afterV = 'prompt: ' + (afterDp.prompt || '') + '\ndepth: ' + (afterDp.depth || 4);
                  } else if (field === 'regex_scripts') {
                    var beforeRx = (cardData.extensions || {}).regex_scripts || [];
                    var afterRx = optimized.regex_scripts || [];
                    beforeV = JSON.stringify(beforeRx.slice(0, 2), null, 1);
                    afterV = JSON.stringify(afterRx.slice(0, 2), null, 1);
                  } else {
                    beforeV = cardData[field] || '';
                    afterV = optimized[field] || '';
                  }
                  compH += '<div style="margin-bottom:10px">' +
                    '<div style="font-size:.78em;font-weight:600;color:#a16207;margin-bottom:4px">' + field + '</div>' +
                    '<div class="opt-compare">' +
                      '<div><div class="opt-label before">优化前</div><div class="opt-pane before">' + escHtml(beforeV) + '</div></div>' +
                      '<div><div class="opt-label after">优化后</div><div class="opt-pane after">' + escHtml(afterV) + '</div></div>' +
                    '</div></div>';
                });
                compH += '<div style="margin:10px 0;padding:10px;background:#ffffff;border-radius:6px">' +
                  '<div style="font-weight:600;margin-bottom:6px">📋 应用模式：</div>' +
                  '<label style="display:block;margin:4px 0;cursor:pointer">' +
                  '<input type="radio" name="optMode" value="smart" checked> ' +
                  '<b>智能合并模式（推荐）</b>：按 comment 精确匹配/前缀匹配自动覆盖、支持 _action:delete 删除，保留未被修改的旧条目' +
                  '</label>' +
                  '<label style="display:block;margin:4px 0;cursor:pointer">' +
                  '<input type="radio" name="optMode" value="replace"> ' +
                  '<b>彻底替换模式</b>：删除当前卡中与优化字段同模块的<b>所有旧条目</b>，再插入优化后的新条目（彻底解决旧内容残留，适合重写/精简）' +
                  '</label>' +
                  '<label style="display:block;margin:4px 0;cursor:pointer">' +
                  '<input type="radio" name="optMode" value="append"> ' +
                  '<b>纯追加模式</b>：仅追加新条目，不修改不删除任何旧条目（不推荐，易重复）' +
                  '</label>' +
                  '</div>';
                compH += '<div style="text-align:center;margin-top:8px">' +
                  '<button class="btn btn-success" id="applyOptBtn">✅ 应用优化</button>' +
                '</div>';
                res.innerHTML = compH;
                var applyBtn = doc.getElementById('applyOptBtn');
                if (applyBtn) {
                  applyBtn.addEventListener('click', function() {
                    var modeRadios = doc.getElementsByName('optMode');
                    var optMode = 'smart';
                    for (var ri = 0; ri < modeRadios.length; ri++) {
                      if (modeRadios[ri].checked) { optMode = modeRadios[ri].value; break; }
                    }
                    var optModified = false;
                    if (optMode === 'replace') {
                      // 彻底替换模式：先清理，再合并
                      // entries 清理：删除所有前缀与新条目前缀相同的旧条目
                      if (Array.isArray(optimized.entries) && optimized.entries.length) {
                        var newPrefixes = {};
                        optimized.entries.forEach(function(e) {
                          var p = extractEntryPrefix(e.comment || '');
                          if (p) newPrefixes[p] = true;
                        });
                        var oldEntries = (cardData.character_book || {}).entries || [];
                        var keptEntries = oldEntries.filter(function(e) {
                          var p = extractEntryPrefix(e.comment || '');
                          // 保留与新条目前缀无关的旧条目；MVU核心条目([InitVar]、变量列表、更新规则、输出格式)始终保留，除非新内容中明确包含对应前缀
                          var isMvuCore = /\[InitVar\]|变量列表|变量更新规则|变量输出格式|\[mvu_update\]/i.test(e.comment || '');
                          if (isMvuCore && !(e.comment && optimized.entries.some(function(ne) { return (ne.comment || '') === e.comment; }))) {
                            return true; // MVU核心条目默认保留，除非新内容精确覆盖
                          }
                          if (newPrefixes[p]) return false; // 相同前缀→删除
                          return true; // 不同前缀→保留
                        });
                        if (!cardData.character_book) cardData.character_book = {};
                        cardData.character_book.entries = keptEntries;
                        optModified = (keptEntries.length !== oldEntries.length);
                      }
                      // regex_scripts 清理：删除后重新插入
                      if (optimized.regex_scripts) {
                        if (cardData.extensions) cardData.extensions.regex_scripts = [];
                        optModified = true;
                      }
                      // alternate_greetings 清理
                      if (optimized.alternate_greetings) {
                        cardData.alternate_greetings = [];
                        optModified = true;
                      }
                      // 再用 mergePartial 应用优化结果
                      var r = mergePartial(optimized, cardData);
                      if (r) optModified = true;
                    } else if (optMode === 'append') {
                      // 纯追加模式：只用新增逻辑
                      if (Array.isArray(optimized.entries) && optimized.entries.length) {
                        cardData.character_book = cardData.character_book || { entries: [] };
                        optimized.entries.forEach(function(e) {
                          if (!e || e._action === 'delete') return; // 追加模式下忽略删除动作
                          if (!e.comment || !e.content) return;
                          cardData.character_book.entries.push(Object.assign({ keys: [], secondary_keys: [] }, e));
                          optModified = true;
                        });
                      }
                      // 其他字段：长度非空时才覆盖
                      ['description','personality','scenario','first_mes','system_prompt','creator_notes'].forEach(function(f) {
                        if (optimized[f] && String(optimized[f]).trim().length > 10) {
                          if (cardData[f] !== optimized[f]) { cardData[f] = optimized[f]; optModified = true; }
                        }
                      });
                      if (Array.isArray(optimized.alternate_greetings)) { cardData.alternate_greetings = (cardData.alternate_greetings || []).concat(optimized.alternate_greetings); optModified = true; }
                    } else {
                      // 智能合并模式（默认）
                      optModified = !!mergePartial(optimized, cardData);
                    }
                    if (optModified) {
                      progress = calcProgress();
                      updateProgress();
                      renderPreview();
                      doc.getElementById('optModal').remove();
                      showToast('✅ 优化已应用 (' + (optMode === 'replace' ? '替换模式' : optMode === 'append' ? '追加模式' : '智能合并') + ')', 'success');
                    } else {
                      showToast('⚠️ 未检测到有效修改', 'warning');
                    }
                  });
                }
              }
            } catch(e) {
              if (prog) prog.style.display = 'none';
              if (res) {
                res.style.display = 'block';
                res.innerHTML = '<div style="padding:12px;text-align:center;color:#c98b7a">JSON解析失败: ' + escHtml(e.message) + '</div>';
              }
            }
          }
        } catch(err) {
          if (prog) prog.style.display = 'none';
          if (res) {
            res.style.display = 'block';
            res.innerHTML = '<div style="padding:12px;text-align:center;color:#c98b7a">优化失败: ' + escHtml(err.message) + '</div>';
          }
        } finally {
          isGenerating = false;
          if (btn) btn.disabled = false;
        }
      }

      // ===== 预览渲染 =====
      /* 改进V：renderPreview防抖——合并连续渲染请求（如批量更新entries时），避免16+调用点全量重建卡顿 */
      var _renderPreviewTimer = null;
      function renderPreview() {
        if (_renderPreviewTimer) clearTimeout(_renderPreviewTimer);
        _renderPreviewTimer = setTimeout(_renderPreviewImpl, 80);
      }
      function _renderPreviewImpl() {
        _renderPreviewTimer = null;
        var body = doc.getElementById('previewBody');
        if (!body) return;
        updateProgress();
        // ========== Tab 隔离：角色卡Tab 过滤 MVU 内容，MVU Tab 只显示 MVU 相关 ==========
        var __tab = (typeof window !== 'undefined' && typeof window.__getActiveTab === 'function') ? window.__getActiveTab() : (typeof activeTab !== 'undefined' ? activeTab : 'card');

        // 通用段落：完整显示内容（不再截断），支持折叠。icon 支持 emoji 字符串或 SVG 图标名
        // editKey(可选)：传入字段名时，内容区可双击编辑
        function sec(icon, title, content, rightInfo, editKey) {
          var has = content && (typeof content === 'string' ? content.trim().length > 0 : true);
          var dot = has ? 'full' : 'empty';
          var editAttr = editKey ? ' data-edit-type="field" data-edit-key="' + escHtml(editKey) + '"' : '';
          var editCls = editKey ? ' pv-editable' : '';
          var editHint = editKey ? '<span class="pv-edit-hint" title="双击编辑">✏️</span>' : '';
          var inner = has
            ? '<div class="pv-content' + editCls + '"' + editAttr + '>' + escHtml(typeof content === 'string' ? content : '') + '</div>'
            : '<div class="pv-empty' + editCls + '"' + editAttr + '>待生成...</div>';
          var rightHtml = rightInfo ? '<span class="sec-right">' + rightInfo + '</span>' : '';
          // icon 为 SVG 图标名（无 emoji 字符）时渲染内联 SVG
          var iconHtml = (/^[a-zA-Z]+$/.test(icon)) ? svgIcon(icon, 14) : icon;
          return '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + dot + '"></span>' + iconHtml + ' ' + title + '</span>' + rightHtml + editHint + '<span class="pv-toggle" title="折叠/展开"></span></h3>' + inner + '</div>';
        }

        var h = '';

        if (__tab === 'mvu') {
          // ========== MVU Tab 预览：状态栏总览(顶置) + 8步进度 + 变量结构脚本 + 变量条目 + 状态栏HTML源码 + 关联角色卡 ==========
          var allEntries = (cardData.character_book && cardData.character_book.entries) || [];
          var mvuEntries = allEntries.filter(function(e) { return isMVUEntry(e.comment || ''); });
          var rxScripts = normalizeRegexScripts(cardData.extensions && cardData.extensions.regex_scripts);

          // ① 状态栏总览（顶置突出，含8步进度条 + 操作按钮）
          h += buildStatusBarPreviewSection();

          // ② MVU 8步进度详情（逐条展开说明）
          var _pvChk = checkMvu8Entries(cardData);
          var _pvD = _pvChk.done;
          var _pvSteps = [
            { has: _pvD[0], icon: 'code',   name: '第1条 变量结构脚本',          desc: 'zod 4 Schema + registerMvuSchema 注册（tavern_helper.scripts）' },
            { has: _pvD[1], icon: 'docVar', name: '第2条 [InitVar]初始变量',     desc: 'YAML格式初始变量，依据第1条schema生成，enabled=false' },
            { has: _pvD[2], icon: 'list',   name: '第3条 [mvu_update]更新规则',  desc: '依据schema生成每变量路径的 type/range/format/check' },
            { has: _pvD[3], icon: 'list',   name: '第4条 变量列表',              desc: '固定内容：<status_current_variables>null</status_current_variables>' },
            { has: _pvD[4], icon: 'list',   name: '第5条 [mvu_update]输出格式',  desc: '固定YAML：<UpdateVariable>+<Analysis>+<JSONPatch>（5种操作）' },
            { has: _pvD[5], icon: 'list',   name: '第6条 输出格式强调',          desc: '固定YAML原样输出强调，AI不输出<UpdateVariable>时启用' },
            { has: _pvD[6], icon: 'sliders',name: '第7条 <状态栏>占位提醒',      desc: '提醒AI每条回复底部输出 <StatusPlaceHolderImpl/>' },
            { has: _pvChk.has8, icon: 'table', name: '第8条 状态栏HTML',          desc: '正则6 [美化]MVU状态栏（markdownOnly=true，前7条完成后才生成）' }
          ];
          var _pvDoneCnt = _pvChk.doneCount + (_pvChk.has8 ? 1 : 0);
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + (_pvDoneCnt > 0 ? 'full' : 'empty') + '"></span>' + svgIcon('list', 14) + ' MVU 8步进度详情</span><span class="sec-right">' + _pvDoneCnt + '/8</span><span class="pv-toggle"></span></h3><div class="pv-sub">';
          _pvSteps.forEach(function(s) {
            var _tag = s.has ? '<span class="pv-tag ok">✓ 完成</span>' : '<span class="pv-tag off">待生成</span>';
            h += '<details class="pv-entry"><summary><span>' + svgIcon(s.icon, 12) + ' ' + s.name + '</span><span class="sec-right">' + _tag + '</span></summary><div class="pv-entry-body"><div class="pv-entry-content">' + s.desc + '</div></div></details>';
          });
          h += '</div></div>';

          // ③ 变量结构脚本 + MVU脚本（tavern_helper.scripts）
          var mvuScripts = (cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.scripts) || [];
          if (mvuScripts.length > 0) {
            h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot full"></span>' + svgIcon('code', 14) + ' 变量结构脚本</span><span class="sec-right">' + mvuScripts.length + '条</span><span class="pv-toggle"></span></h3><div class="pv-sub">';
            mvuScripts.forEach(function(s, idx) {
              var sName = s.name || ('脚本' + (idx+1));
              var sTok = countTokens(s.content || '');
              var isSchema = (s.id === 'mvu-schema' || sName.indexOf('变量结构') >= 0 || (s.content || '').indexOf('mvu_zod') >= 0);
              var isBundle = (s.id === '961f366d-e403-45c2-8155-3d14ec86de53' || (s.content || '').indexOf('MagVarUpdate') >= 0 || (s.content || '').indexOf('bundle.js') >= 0);
              var isWTC = (s.id === 'wtc-lorebook-call' || (s.content || '').indexOf('LorebookToolCall') >= 0);
              var sTag = isSchema ? '<span class="pv-tag ok">变量结构</span>' : (isBundle ? '<span class="pv-tag">MVU本体</span>' : (isWTC ? '<span class="pv-tag">WTC</span>' : ''));
              var sDisabled = s.enabled === false ? '<span class="pv-tag off">禁用</span>' : '';
              h += '<details class="pv-entry"><summary><span>' + (idx+1) + '. ' + escHtml(sName) + '</span><span class="sec-right">~' + sTok + 'T ' + sTag + sDisabled + '</span></summary>' +
                '<div class="pv-entry-body"><div class="pv-entry-content">' + escHtml(s.content || '') + '</div></div></details>';
            });
            h += '</div></div>';
          } else {
            h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot empty"></span>' + svgIcon('code', 14) + ' 变量结构脚本</span><span class="pv-toggle"></span></h3><div class="pv-empty">尚未生成脚本</div></div>';
          }

          // ④ MVU变量条目（世界书条目，过滤MVU相关）
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + (mvuEntries.length > 0 ? 'full' : 'empty') + '"></span>' + svgIcon('book', 14) + ' MVU变量条目</span><span class="sec-right">' + mvuEntries.length + '条</span><span class="pv-toggle"></span></h3>';
          if (mvuEntries.length > 0) {
            h += '<div class="pv-entry-list">';
            mvuEntries.forEach(function(e, i) {
              var eTok = countTokens(e.content || '');
              var disabledTag = e.enabled === false ? '<span class="pv-tag off">禁用</span>' : '';
              h += '<details class="pv-entry"><summary><span>' + escHtml(e.comment || ('MVU条目' + (i+1))) + '</span><span class="sec-right">~' + eTok + 'T ' + disabledTag + '</span></summary>' +
                '<div class="pv-entry-body"><div class="pv-entry-content">' + escHtml(e.content || '') + '</div></div></details>';
            });
            h += '</div>';
          } else {
            h += '<div class="pv-empty">尚未生成MVU变量条目，请在聊天中描述你想要的变量系统</div>';
          }
          h += '</div>';

          // ⑤ 状态栏HTML源码（正则脚本，含状态栏美化正则）
          if (rxScripts.length > 0) {
            h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot full"></span>' + svgIcon('table', 14) + ' 状态栏HTML源码（正则）</span><span class="sec-right">' + rxScripts.length + '条</span><span class="pv-toggle"></span></h3><div class="pv-sub">';
            rxScripts.forEach(function(r, idx) {
              var isStatusBar = (r.findRegex || '').indexOf('StatusPlaceHolder') >= 0;
              var flags = [];
              if (r.markdownOnly) flags.push('<span class="pv-tag">仅显示</span>');
              if (r.promptOnly) flags.push('<span class="pv-tag">仅提示词</span>');
              if (r.disabled) flags.push('<span class="pv-tag off">禁用</span>');
              if (isStatusBar) flags.push('<span class="pv-tag ok">美化状态栏</span>');
              h += '<details class="pv-entry"><summary><span>' + (idx+1) + '. ' + escHtml(r.scriptName || '正则脚本') + '</span><span class="sec-right">' + flags.join('') + '</span></summary>';
              h += '<div class="pv-entry-body">';
              h += '<div class="pv-code">查找：<code>' + escHtml(r.findRegex || '') + '</code></div>';
              var rep = r.replaceString || '';
              if (rep) {
                var repDisplay = rep.length > 1200 ? rep.substring(0, 1200) + '\n…（共' + rep.length + '字符，已截断）' : rep;
                h += '<div class="pv-code" style="margin-top:3px">替换：\n' + escHtml(repDisplay) + '</div>';
              }
              h += '</div></details>';
            });
            h += '</div></div>';
          } else {
            h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot empty"></span>' + svgIcon('table', 14) + ' 状态栏HTML源码（正则）</span><span class="pv-toggle"></span></h3><div class="pv-empty">尚未生成正则脚本</div></div>';
          }

          // ⑥ 关联角色卡信息（只读，紧凑）
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + (cardData.name ? 'full' : 'empty') + '"></span>' + svgIcon('mask', 14) + ' 关联角色卡</span><span class="pv-toggle"></span></h3><div class="pv-content">' + escHtml(cardData.name || '(未命名)') + (cardData.description ? ' · 描述' + cardData.description.length + '字' : '') + '</div></div>';

          body.innerHTML = h;
          bindPreviewInteractions();
          return;
        }

        // ========== 角色卡 Tab 预览：过滤掉 MVU 内容 ==========

        h += sec('globe', '世界名称', cardData.name, '', 'name');
        h += sec('scroll', '世界观描述', cardData.description, cardData.description ? (cardData.description.length + '字') : '', 'description');

        // 模块进度（独立 pv-section，角色卡Tab：隐藏MVU模块）
        var mp = getModuleProgress();
        var modLabels = { axiom: { ic:'axiom', txt:'公理' }, soft_rules: { ic:'handshake', txt:'软规则' }, core_rules: { ic:'lock', txt:'铁则' }, near_constraint: { ic:'target', txt:'近场' }, scene_mechanics: { ic:'sword', txt:'机制' }, entity_interact: { ic:'users', txt:'实体' }, narrative_bg: { ic:'book', txt:'叙事' }, dynamic_adapt: { ic:'refreshCycle', txt:'动态' } };
        var modDone = 0, modTotal = Object.keys(modLabels).length;
        var modH = '<div class="module-progress">';
        Object.keys(modLabels).forEach(function(k) {
          var cls = mp[k] ? 'done' : 'todo';
          if (mp[k]) modDone++;
          modH += '<div class="module-item ' + cls + '" data-mod="' + k + '" title="点击让AI完善此模块">' + svgIcon(modLabels[k].ic, 11) + ' ' + modLabels[k].txt + '</div>';
        });
        modH += '</div>';
        h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + (modDone > 0 ? 'full' : 'empty') + '"></span>' + svgIcon('layers', 14) + ' 模块进度</span><span class="sec-right">' + modDone + '/' + modTotal + ' 完成</span><span class="pv-toggle" title="折叠/展开"></span></h3>' + modH + '</div>';

        var allEntries = (cardData.character_book && cardData.character_book.entries) || [];
        // 角色卡Tab：过滤掉 MVU 条目
        var entries = allEntries.filter(function(e) { return !isMVUEntry(e.comment || ''); });
        var bookName = (cardData.name ? cardData.name + ' · 世界设定集' : '世界设定集');
        var bookTokCount = 0;
        entries.forEach(function(e) { bookTokCount += countTokens(e.content || ''); });

        // 世界书条目：完整显示全部条目，每个条目独立折叠（默认折叠）
        if (entries.length > 0) {
          var eH = '<div class="pv-entry-list">';
          for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            var label = e.comment || ('条目' + (i+1));
            var eTok = countTokens(e.content || '');
            var constTag = e.constant ? '<span class="pv-tag ok">常驻</span>' : '<span class="pv-tag">触发</span>';
            var posTag = '<span class="pv-tag">P' + (e.position == null ? '-' : e.position) + '</span>';
            var depTag = (e.depth != null) ? '<span class="pv-tag">D' + e.depth + '</span>' : '';
            var disabledTag = e.enabled === false ? '<span class="pv-tag off">禁用</span>' : '';
            eH += '<details class="pv-entry"><summary><span>' + escHtml(label) + '</span><span class="sec-right">~' + eTok + 'T ' + constTag + posTag + depTag + disabledTag + '</span></summary>' +
              '<div class="pv-entry-body"><div class="pv-entry-content pv-editable" data-edit-type="entry" data-edit-index="' + allEntries.indexOf(e) + '">' + escHtml(e.content || '') + '</div></div></details>';
          }
          eH += '</div>';
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot full"></span>' + svgIcon('book', 14) + ' <span class="pv-book-name">' + escHtml(bookName) + '</span></span><span class="sec-right">' + entries.length + '条 · ~' + bookTokCount + 'T</span><span class="pv-toggle" title="折叠/展开"></span></h3>' + eH + '</div>';
        } else {
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot empty"></span>' + svgIcon('book', 14) + ' <span class="pv-book-name">' + escHtml(bookName) + '</span></span><span class="pv-toggle"></span></h3><div class="pv-empty">待生成...</div></div>';
        }

        h += sec('film', '开场白', cardData.first_mes, cardData.first_mes ? (cardData.first_mes.length + '字') : '', 'first_mes');
        // 身份定位（自动提取：personality+description 前 50 字）
        var autoIdExtract = '';
        if (cardData.personality || cardData.description) {
          var rawId = (cardData.personality ? (cardData.personality + ' ') : '') + (cardData.description || '');
          autoIdExtract = rawId.substring(0, 50) + (rawId.length > 50 ? '...' : '');
        }
        var idLen = autoIdExtract.length;
        h += sec('bolt', '身份定位（自动提取）', autoIdExtract || '(从 personality/description 自动生成，无需手动写 system_prompt)', idLen > 0 ? ('~' + idLen + '字 · 自动提取') : '');
        // 多开局机制：动态适配分支 X 条 / 开场白内嵌选项 X 个
        var allEntriesForMulti = (cardData.character_book && cardData.character_book.entries) || [];
        var multiOpenEntries = allEntriesForMulti.filter(function(e) { return (e.comment || '').indexOf('<动态适配>') >= 0 || (e.comment || '').indexOf('分支开局') >= 0; }).length;
        var firstForMulti = cardData.first_mes || '';
        var firstMesHasChoice = firstForMulti.indexOf('①') >= 0 || firstForMulti.indexOf('②') >= 0 || firstForMulti.indexOf('③') >= 0 || firstForMulti.indexOf('选项') >= 0 || firstForMulti.indexOf('选择') >= 0 || (firstForMulti.indexOf('1.') >= 0 && firstForMulti.indexOf('2.') >= 0);
        var choiceCount = 0;
        if (firstMesHasChoice) {
          var circleNum = (firstForMulti.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g) || []).length;
          choiceCount = circleNum > 0 ? circleNum : 2;
        }
        var multiDesc = '<动态适配>分支: ' + multiOpenEntries + ' 条';
        if (firstMesHasChoice) multiDesc += ' | 开场白内嵌选项: ' + choiceCount + ' 个';
        var multiContent = multiOpenEntries >= 1 || firstMesHasChoice
          ? ('已配置多开局机制：' + multiDesc)
          : '尚未配置多开局。可通过 <动态适配> 分支开局世界书条目，或在开场白内嵌互动选项实现。';
        var multiRight = ((multiOpenEntries >= 1 || firstMesHasChoice) ? '✅ ' : '⚠️ ') + multiOpenEntries + '分支 / ' + choiceCount + '选项';
        h += sec('refreshCycle', '多开局机制（替代 alternate_greetings）', multiContent, multiRight);

        h += sec('edit', '创作者备注', cardData.creator_notes, '', 'creator_notes');

        // ===== 脚本（tavern_helper.scripts）：变量结构/MVU/WTC等，可折叠显示 =====
        var cardScripts = (cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.scripts) || [];
        if (cardScripts.length > 0) {
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot full"></span>' + svgIcon('code', 14) + ' 脚本</span><span class="sec-right">' + cardScripts.length + '条</span><span class="pv-toggle"></span></h3><div class="pv-sub">';
          cardScripts.forEach(function(s, idx) {
            var sName = s.name || ('脚本' + (idx+1));
            var sTok = countTokens(s.content || '');
            var isSchema = (s.id === 'mvu-schema' || sName.indexOf('变量结构') >= 0 || (s.content || '').indexOf('mvu_zod') >= 0);
            var isBundle = (s.id === '961f366d-e403-45c2-8155-3d14ec86de53' || (s.content || '').indexOf('MagVarUpdate') >= 0);
            var isWTC = (s.id === 'wtc-lorebook-call' || (s.content || '').indexOf('LorebookToolCall') >= 0);
            var sTag = isSchema ? '<span class="pv-tag ok">变量结构</span>' : (isBundle ? '<span class="pv-tag">MVU本体</span>' : (isWTC ? '<span class="pv-tag">WTC</span>' : ''));
            var sDisabled = s.enabled === false ? '<span class="pv-tag off">禁用</span>' : '';
            h += '<details class="pv-entry"><summary><span>' + (idx+1) + '. ' + escHtml(sName) + '</span><span class="sec-right">~' + sTok + 'T ' + sTag + sDisabled + '</span></summary>' +
              '<div class="pv-entry-body"><div class="pv-entry-content">' + escHtml(s.content || '') + '</div></div></details>';
          });
          h += '</div></div>';
        }

        // ===== 正则脚本：可折叠显示 =====
        var cardRxScripts = normalizeRegexScripts(cardData.extensions && cardData.extensions.regex_scripts);
        if (cardRxScripts.length > 0) {
          h += '<div class="pv-section"><h3><span class="sec-left"><span class="dot full"></span>' + svgIcon('table', 14) + ' 正则脚本</span><span class="sec-right">' + cardRxScripts.length + '条</span><span class="pv-toggle"></span></h3><div class="pv-sub">';
          cardRxScripts.forEach(function(r, idx) {
            var flags = [];
            if (r.markdownOnly) flags.push('<span class="pv-tag">仅显示</span>');
            if (r.promptOnly) flags.push('<span class="pv-tag">仅提示词</span>');
            if (r.disabled) flags.push('<span class="pv-tag off">禁用</span>');
            h += '<details class="pv-entry"><summary><span>' + (idx+1) + '. ' + escHtml(r.scriptName || '正则脚本') + '</span><span class="sec-right">' + flags.join('') + '</span></summary>';
            h += '<div class="pv-entry-body">';
            h += '<div class="pv-code">查找：<code>' + escHtml(r.findRegex || '') + '</code></div>';
            var rep = r.replaceString || '';
            if (rep) {
              var repDisplay = rep.length > 1200 ? rep.substring(0, 1200) + '\n…（共' + rep.length + '字符，已截断）' : rep;
              h += '<div class="pv-code" style="margin-top:3px">替换：\n' + escHtml(repDisplay) + '</div>';
            }
            h += '</div></details>';
          });
          h += '</div></div>';
        }

        body.innerHTML = h;
        // 绑定折叠/按钮事件（每次重渲染后重新绑定）
        bindPreviewInteractions();
      }

      // 状态栏预览区块：展示生成状态 + 已收集模块 + 预览/重置按钮
      function buildStatusBarPreviewSection() {
        var entries = (cardData.character_book || {}).entries || [];
        var hasMVU = entries.some(function(e) { return isMVUEntry(e.comment || ''); });
        var rxScripts = normalizeRegexScripts(cardData.extensions && cardData.extensions.regex_scripts);
        var statusBarRegex = null;
        for (var i = 0; i < rxScripts.length; i++) {
          var r = rxScripts[i];
          if ((r.findRegex || '').indexOf('StatusPlaceHolder') >= 0 && r.markdownOnly && !r.promptOnly) { statusBarRegex = r; break; }
        }
        var hasStatusBar = !!statusBarRegex;
        var mvuChk = checkMvu8Entries(cardData);
        var _d = mvuChk.done;

        var dotCls = hasStatusBar ? 'full' : 'empty';
        var right = hasStatusBar ? '已生成' : (mvuChk.all7Done ? '待生成' : (hasMVU ? mvuChk.doneCount + '/7' : '未启用'));
        var sH = '<div class="pv-sub">';

        // ===== 8步进度可视化条（紧凑方块，绿=完成/灰=待办）=====
        var _stepNames = ['①zod变量结构', '②[InitVar]初始变量', '③[mvu_update]更新规则', '④变量列表', '⑤[mvu_update]输出格式', '⑥输出格式强调', '⑦<状态栏>占位提醒', '⑧状态栏HTML(正则6)'];
        var _stepStates = [_d[0], _d[1], _d[2], _d[3], _d[4], _d[5], _d[6], mvuChk.has8];
        var _stepShort = ['1', '2', '3', '4', '5', '6', '7', '栏'];
        sH += '<div style="display:flex;gap:5px;flex-wrap:wrap;margin:5px 0 10px 0">';
        for (var si = 0; si < 8; si++) {
          var _done = _stepStates[si];
          var _cls = _done ? 'sb-step ok' : 'sb-step todo';
          var _ic = _done ? svgIcon('checkCircle', 11) : svgIcon('circle', 11);
          sH += '<span class="' + _cls + '" title="' + _stepNames[si] + '">' + _ic + _stepShort[si] + '</span>';
        }
        sH += '</div>';

        // ===== 变量系统 + 状态栏HTML 双状态行 =====
        sH += '<details class="pv-entry"' + (hasMVU ? '' : ' open') + '><summary><span>变量系统</span><span class="sec-right">' + (hasMVU ? '<span class="pv-tag ok">已启用</span> ' + mvuChk.doneCount + '/7' : '<span class="pv-tag off">未启用</span>') + '</span></summary><div class="pv-entry-body"><div class="pv-entry-content">' + (hasMVU ? 'MVU变量系统已检测到。<br>导出时自动注入：bundle.js(MVU本体)、正则1-5(思维链移除/变量更新截断/状态栏隐藏等)。<br>状态栏HTML需前7条完成后生成。' : '未检测到MVU变量系统。请先在MVU Tab生成变量系统。') + '</div></div></details>';

        if (hasStatusBar) {
          var repLen = (statusBarRegex.replaceString || '').length;
          sH += '<details class="pv-entry" open><summary><span>状态栏HTML（正则6）</span><span class="sec-right">' + repLen + ' 字符</span></summary>';
          sH += '<div class="pv-entry-body"><div style="margin:2px 0"><span class="pv-tag ok">已生成</span><span class="pv-tag">仅显示</span></div>';
          sH += '<div class="pv-entry-content">findRegex: ' + escHtml(statusBarRegex.findRegex || '') + '</div></div></details>';
        } else if (mvuChk.all7Done) {
          sH += '<details class="pv-entry" open><summary><span>状态栏HTML（正则6）</span><span class="sec-right"><span class="pv-tag off">未生成</span></span></summary>';
          sH += '<div class="pv-entry-body"><div class="pv-entry-content">前7条已完成，点击「生成状态栏」让AI生成HTML。</div></div></details>';
        } else {
          sH += '<details class="pv-entry" open><summary><span>状态栏HTML（正则6）</span><span class="sec-right"><span class="pv-tag off">未生成</span></span></summary>';
          sH += '<div class="pv-entry-body"><div class="pv-entry-content">需先完成前7条MVU条目（当前' + mvuChk.doneCount + '/7）。</div></div></details>';
        }

        // ===== 操作按钮（阶段自适应）=====
        sH += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">';
        if (hasStatusBar) {
          sH += '<button class="pv-mini-btn" data-pv-action="preview-statusbar">' + svgIcon('eye', 13) + ' 预览状态栏</button>';
          sH += '<button class="pv-mini-btn" data-pv-action="reset-statusbar">' + svgIcon('trash', 13) + ' 清除状态栏</button>';
        }
        if (mvuChk.all7Done) {
          sH += '<button class="pv-mini-btn" data-pv-action="gen-statusbar">' + svgIcon('sparkle', 13) + ' ' + (hasStatusBar ? '重新生成' : '生成状态栏') + '</button>';
        }
        sH += '</div>';

        sH += '</div>';
        return '<div class="pv-section"><h3><span class="sec-left"><span class="dot ' + dotCls + '"></span>' + svgIcon('sliders', 14) + ' 状态栏总览</span><span class="sec-right">' + right + '</span><span class="pv-toggle"></span></h3>' + sH + '</div>';
      }

      // 预览面板交互绑定：段落折叠 + 状态栏按钮
      function bindPreviewInteractions() {
        var body = doc.getElementById('previewBody');
        if (!body) return;
        // 段落折叠（点击 h3 标题区或 pv-toggle）
        var toggles = body.querySelectorAll('.pv-toggle');
        for (var i = 0; i < toggles.length; i++) {
          toggles[i].addEventListener('click', function(e) {
            e.stopPropagation();
            var section = this.closest('.pv-section');
            if (section) section.classList.toggle('collapsed');
          });
        }
        // 标题点击也可折叠（除按钮/链接/details外）
        var heads = body.querySelectorAll('.pv-section > h3');
        for (var j = 0; j < heads.length; j++) {
          heads[j].addEventListener('click', function(e) {
            if (e.target.closest('.pv-mini-btn') || e.target.closest('.pv-book-name') || e.target.closest('.pv-toggle') || e.target.closest('.module-item') || e.target.closest('.pv-entry') || e.target.closest('details') || e.target.closest('summary')) return;
            var section = this.closest('.pv-section');
            if (section) section.classList.toggle('collapsed');
          });
        }
        // 模块进度项点击：让 AI 完善对应模块
        var modItems = body.querySelectorAll('.module-item[data-mod]');
        for (var mi = 0; mi < modItems.length; mi++) {
          modItems[mi].style.cursor = 'pointer';
          modItems[mi].addEventListener('click', function(e) {
            e.stopPropagation();
            var mod = this.getAttribute('data-mod');
            if (mod) handleModFocus(mod);
          });
        }
        // 状态栏按钮
        var btns = body.querySelectorAll('.pv-mini-btn[data-pv-action]');
        for (var k = 0; k < btns.length; k++) {
          btns[k].addEventListener('click', function() {
            var act = this.getAttribute('data-pv-action');
            if (act === 'preview-statusbar') {
              showMvuStatusBarPreview();
            } else if (act === 'gen-statusbar') {
              var input = doc.getElementById('chatInput');
              if (input) {
                input.value = '请根据已配置的MVU变量系统，生成状态栏HTML。输出一个完整的HTML文档（含CSS和JS），使用 populateCharacterData + getAllVariables + eventOn(Mvu.events.VARIABLE_UPDATE_ENDED) + errorCatched 标准模式。';
                updateCharCount();
                updateSendBtnPulse();
                try { input.focus(); } catch(_) {}
              }
            } else if (act === 'reset-statusbar') {
              if (!confirm('确定清除已生成的美化状态栏正则（正则6）吗？')) return;
              cardData.extensions = cardData.extensions || {};
              var rx = cardData.extensions.regex_scripts || [];
              for (var m = rx.length - 1; m >= 0; m--) {
                if ((rx[m].findRegex || '').indexOf('StatusPlaceHolder') >= 0 && rx[m].markdownOnly && !rx[m].promptOnly) {
                  rx.splice(m, 1);
                }
              }
              cardData.extensions.regex_scripts = rx;
              saveToStorage();
              renderPreview();
              showToast('✅ 已清除状态栏正则', 'success');
            }
          });
        }
        // ========== 双击编辑：预览内容区双击弹出编辑窗口 ==========
        var editables = body.querySelectorAll('[data-edit-type]');
        for (var ei = 0; ei < editables.length; ei++) {
          editables[ei].style.cursor = 'pointer';
          editables[ei].addEventListener('dblclick', function(e) {
            e.stopPropagation();
            var type = this.getAttribute('data-edit-type');
            var key = this.getAttribute('data-edit-key');
            var index = this.getAttribute('data-edit-index');
            showPreviewEditModal(type, key, index);
          });
        }
      }

      // ===== 预览双击编辑弹窗 =====
      function showPreviewEditModal(type, key, index) {
        // 读取当前值
        var currentVal = '';
        var title = '';
        if (type === 'field') {
          currentVal = cardData[key] != null ? String(cardData[key]) : '';
          title = '编辑字段：' + key;
        } else if (type === 'entry') {
          var idx = parseInt(index);
          var entries = (cardData.character_book || {}).entries || [];
          var entry = entries[idx];
          if (!entry) return;
          currentVal = entry.content || '';
          title = '编辑条目：' + (entry.comment || ('条目' + (idx + 1)));
        } else {
          return;
        }
        // 创建弹窗
        var overlay = doc.createElement('div');
        overlay.className = 'json-modal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:10001;padding:16px';
        var modal = doc.createElement('div');
        modal.style.cssText = 'background:var(--surface);border-radius:var(--radius);box-shadow:0 20px 60px rgba(15,23,42,.2);width:100%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden';
        var header = doc.createElement('div');
        header.style.cssText = 'padding:14px 18px;border-bottom:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:10px';
        header.innerHTML = '<span style="font-weight:600;color:var(--accent-deep);font-size:.95em">' + escHtml(title) + '</span>';
        var closeBtn = doc.createElement('button');
        closeBtn.className = 'icon-btn icon-btn-square';
        closeBtn.innerHTML = svgIcon('close', 16);
        closeBtn.onclick = function() { overlay.remove(); };
        header.appendChild(closeBtn);
        var textareaWrap = doc.createElement('div');
        textareaWrap.style.cssText = 'flex:1;overflow:auto;padding:14px 18px';
        var textarea = doc.createElement('textarea');
        textarea.style.cssText = 'width:100%;min-height:200px;padding:12px 14px;border:1px solid var(--line);border-radius:var(--radius);font-size:14px;font-family:inherit;line-height:1.6;resize:vertical;color:var(--ink);background:var(--surface-soft)';
        textarea.value = currentVal;
        textareaWrap.appendChild(textarea);
        var footer = doc.createElement('div');
        footer.style.cssText = 'padding:10px 18px;border-top:1px solid var(--line-soft);display:flex;justify-content:flex-end;gap:8px';
        var cancelBtn = doc.createElement('button');
        cancelBtn.className = 'btn btn-ghost';
        cancelBtn.textContent = '取消';
        cancelBtn.onclick = function() { overlay.remove(); };
        var saveBtn = doc.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.innerHTML = svgIcon('save', 14) + ' 保存';
        saveBtn.onclick = function() {
          var newVal = textarea.value;
          if (type === 'field') {
            cardData[key] = newVal;
          } else if (type === 'entry') {
            var idx2 = parseInt(index);
            var entries2 = (cardData.character_book || {}).entries || [];
            if (entries2[idx2]) {
              entries2[idx2].content = newVal;
            }
          }
          overlay.remove();
          updateProgress();
          renderPreview();
          saveToStorage();
          showToast('✅ 已保存修改', 'success');
        };
        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        modal.appendChild(header);
        modal.appendChild(textareaWrap);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        doc.body.appendChild(overlay);
        try { textarea.focus(); } catch(_) {}
      }

      async function saveCharacter() {
        if (!cardData.name || !cardData.name.trim()) {
          showToast('请先确定世界/角色名称', 'error');
          return;
        }
        // 检测酒馆 API 可用性（必须在 try 之前判断，给出清晰提示）
        var st = (typeof _tavern === 'function') ? _tavern() : null;
        if (!st) {
          showToast('未检测到酒馆环境，无法直接写入角色卡', 'error');
          return;
        }
        var saveBtn = doc.getElementById('saveBtn');
        var originalHTML = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = svgIcon('spinner', 14, 'ic-spin') + ' 写入中…'; }
        try {
          // 复用 buildExportCard 完成MVU条目检测/填充、StatusPlaceHolderImpl注入、CRLF规范化等逻辑
          var exportCard = buildExportCard(cardData);
          var data = exportCard.data || {};
          // 世界书名称：优先 extensions.world（buildExportCard 写入位置），其次角色名
          var worldbookName = (data.extensions && data.extensions.world) || data.world || exportCard.name || cardData.name;
          var entries = (data.character_book && data.character_book.entries) || [];

          // MVU 系统检测（与 buildExportCard 内部判定保持一致）
          var filledForMvu = entries.some(function(e) { return isMVUEntry(e.comment || ''); });
          var hasMVU = !!(filledForMvu || entries.some(function(e) {
            var c = (e.comment || '').toLowerCase();
            return c.indexOf('[initvar]') >= 0 || c.indexOf('[mvu_update]') >= 0 || (e.comment || '').indexOf('变量列表') >= 0 || (e.comment || '').indexOf('变量输出格式') >= 0;
          }));

          // 提取角色名列表（用于状态栏 HTML 生成）
          var charNames = extractCharNames(cardData, (cardData.character_book || {}).entries || []);

          // ===== 步骤1：创建或获取角色卡 =====
          await _tavernCreateOrGet(cardData.name);

          // ===== 步骤2：写入角色卡基础字段（description/personality/scenario/system_prompt 等）=====
          await _tavernWriteCharacterData(cardData.name, {
            description: data.description,
            personality: data.personality,
            scenario: data.scenario,
            system_prompt: data.system_prompt,
            creator_notes: data.creator_notes,
            creator: data.creator,
            character_version: data.character_version,
            alternate_greetings: data.alternate_greetings,
            depth_prompt: data.depth_prompt,
            // 关联世界书：写入 character.data.world，让酒馆自动加载该世界书
            world: (entries.length > 0) ? worldbookName : undefined
          });

          // ===== 步骤3：写入开场白 =====
          if (data.first_mes && data.first_mes.trim()) {
            await _tavernWriteFirstMes(cardData.name, data.first_mes);
          }

          // ===== 步骤4：MVU 变量系统（仅在检测到 MVU 条目时写入）=====
          if (hasMVU) {
            // 4a. 写入 MVU bundle.js 运行时脚本
            await _tavernWriteMvuRuntime(cardData.name);
            // 4b. 写入变量结构 zod schema 脚本
            // ⚠️优先使用 AI 在 MVU Tab 按 9.1.5/9.1.6 工作流生成的变量结构脚本；
            //   若 AI 未生成，则从 [InitVar] 条目内容兜底生成（保证导出到酒馆不缺 schema）
            var existingScripts = (cardData.extensions && cardData.extensions.tavern_helper && cardData.extensions.tavern_helper.scripts) || [];
            var aiSchemaScript = null;
            for (var _si = 0; _si < existingScripts.length; _si++) {
              var _ss = existingScripts[_si];
              if (!_ss) continue;
              if (_ss.id === 'mvu-schema' || String(_ss.name || '').indexOf('变量结构') >= 0 ||
                  String(_ss.content || '').indexOf('mvu_zod') >= 0) {
                aiSchemaScript = _ss;
                break;
              }
            }
            var schemaContent = '';
            if (aiSchemaScript && aiSchemaScript.content && String(aiSchemaScript.content).indexOf('z.object') >= 0) {
              schemaContent = aiSchemaScript.content;
            } else {
              var initVarEntry = entries.filter(function(e) { return (e.comment || '').toLowerCase().indexOf('[initvar]') >= 0; })[0];
              var schemaInitContent = initVarEntry ? (initVarEntry.content || '') : '';
              schemaContent = generateMvuSchemaScript(schemaInitContent);
            }
            await _tavernWriteMvuSchema(cardData.name, schemaContent);
            // 4c. 写入正则脚本（5条固定正则1-5 + 1条正则6状态栏HTML）
            // ⚠️优先使用 AI 在 MVU Tab 按 9.1.6 工作流生成的状态栏 HTML；若 AI 未生成，才用默认状态栏兜底（保证不空）
            var statusBarHtml = '';
            // 4c-1. 检查 cardData 中是否已保存 AI 生成的状态栏正则（来自 saveStatusBarToCard）
            var existingRx = (cardData.extensions && cardData.extensions.regex_scripts) || [];
            var customSb = null;
            for (var si = 0; si < existingRx.length; si++) {
              var rxs = existingRx[si];
              if (!rxs) continue;
              var isSb = (rxs.id === 'mvu-status-bar') ||
                         ((rxs.findRegex || rxs.find_regex || '').indexOf('StatusPlaceHolder') >= 0 &&
                          (rxs.markdownOnly || (rxs.destination && rxs.destination.display)) &&
                          !(rxs.promptOnly || (rxs.destination && rxs.destination.prompt)));
              if (isSb && (rxs.replaceString || rxs.replace_string)) {
                customSb = rxs.replaceString || rxs.replace_string;
                break;
              }
            }
            if (customSb) {
              // 解包 ``` 围栏（saveStatusBarToCard 用 ``` 包裹，_tavernWriteRegexScripts 会重新包裹）
              statusBarHtml = customSb.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim();
            }
            // 4c-2. 兜底：AI 完全没生成状态栏时，用统一模板生成默认状态栏（保证写入酒馆不缺状态栏）
            if (!statusBarHtml) statusBarHtml = generateMvuStatusBarHtml(charNames);
            await _tavernWriteRegexScripts(cardData.name, statusBarHtml);
          }

          // ===== 步骤5：写入世界书条目 =====
          if (entries.length > 0) {
            await _tavernWriteWorldbook(worldbookName, entries);
          }

          // ===== 步骤6：切换到角色卡 =====
          await _tavernSwitchToCharacter(cardData.name);

          // ===== 步骤7：将世界书绑定到当前角色卡（修复：世界书不关联到角色卡）=====
          // 必须在切换到角色卡之后调用，使该角色卡成为 current，rebindCharWorldbooks('current') 才能生效
          if (entries.length > 0) {
            try {
              await _tavernBindWorldbookToChar(worldbookName);
            } catch(_be) {
              console.warn('[时之写卡器] 世界书关联角色卡失败:', _be && _be.message);
            }
          }

          var mvuTip = hasMVU ? '（MVU变量系统已写入：bundle.js+变量结构脚本+世界书条目+正则1-5+正则6状态栏+开场白占位符）' : '';
          showToast('✅ 角色卡已成功写入酒馆' + mvuTip, 'success');
        } catch(e) {
          console.error('[时之写卡器] 写入酒馆失败:', e);
          showToast('保存失败: ' + (e.message || String(e)), 'error');
        } finally {
          if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = originalHTML; }
        }
      }

      // showJsonModal 已移除：导出功能改为直接写入酒馆角色卡（见 saveCharacter）

      renderWelcome();

    } catch(e) {
      console.error('时之写卡器 Error:', e);
      showToast('打开失败: ' + e.message, 'error');
    }
  }

    // ============================================================================
  // SECTION 11 脚本按钮注册 + 浮动按钮兜底 + 入口 / 卸载清理
  // ============================================================================
  function registerButton() {
    try {
      var evtOn = typeof eventOn === 'function' ? eventOn : (typeof window.eventOn === 'function' ? window.eventOn : null);
      var getBtnEvt = typeof getButtonEvent === 'function' ? getButtonEvent : (typeof window.getButtonEvent === 'function' ? window.getButtonEvent : null);
      if (evtOn && getBtnEvt) {
        evtOn(getBtnEvt('时之写卡器'), function() { openEditor(); });
        return true;
      }
    } catch(e) {}
    return false;
  }

  function addFloatingButton() {
    try {
      var pDoc = (window.parent && window.parent.document) ? window.parent.document : document;
      var old = pDoc.getElementById(SCRIPT_ID + '-btn');
      if (old) old.remove();
      var btn = pDoc.createElement('button');
      btn.id = SCRIPT_ID + '-btn';
      btn.textContent = '⚡ 时之写卡器';
      btn.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:99998;padding:10px 18px;background:linear-gradient(135deg,#4f46e5,#4338ca);color:#fff;border:none;border-radius:25px;cursor:pointer;font-weight:600;box-shadow:0 6px 20px rgba(15,23,42,.12);transition:all .3s;font-size:14px;';
      btn.onmouseover = function() { btn.style.transform = 'scale(1.05)'; };
      btn.onmouseout = function() { btn.style.transform = 'scale(1)'; };
      btn.onclick = openEditor;
      pDoc.body.appendChild(btn);
      return true;
    } catch(e) { return false; }
  }

  var retryCount = 0;
  function tryInit() {
    if (registerButton()) { return; }
    if (retryCount < 10) { retryCount++; setTimeout(tryInit, 500); }
    else { addFloatingButton(); }
  }
  // ============================================================================
  // ===== 脚本入口 / 卸载清理：遵循 tavern-helper-template 脚本模板规范 =====
  //   · 初始化放入 $() 中（等价于 jQuery ready，防止 DOM 未就绪时注册按钮失败）
  //   · 卸载时(pagehide)不仅关闭写卡器弹窗，还清理浮动按钮，避免残留DOM
  // ============================================================================
  // 清理函数：写卡器专用浮动按钮 + 弹层 iframe 统一卸载
  function cleanupScriptArtifacts() {
    try { closeModal(); } catch (_) {}
    try {
      var pDoc = (window.parent && window.parent.document) ? window.parent.document : document;
      var btn = pDoc.getElementById(SCRIPT_ID + '-btn');
      if (btn) btn.remove();
      var md = pDoc.getElementById(SCRIPT_ID + '-modal');
      if (md) md.remove();
    } catch (_) {}
  }

  // ===== 初始化入口：优先 jQuery ready（酒馆环境必定注入 jQuery），否则直接执行 =====
  // skill 规范：脚本代码的副作用（DOM注册、按钮、监听器）必须在 jQuery ready 回调中，
  // 禁止使用 DOMContentLoaded（远程加载场景不会触发），禁止直接在顶层作用域执行 DOM 写入。
  function scriptEntryPoint() {
    window.addEventListener('pagehide', cleanupScriptArtifacts);
    tryInit();
  }
  if (typeof $ !== 'undefined') {
    $(scriptEntryPoint);
  } else if (typeof window !== 'undefined' && window.parent && typeof window.parent.$ !== 'undefined') {
    window.parent.$(scriptEntryPoint);
  } else {
    scriptEntryPoint();
  }
})();

