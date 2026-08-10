/* ============================================================
 * ▌诊断脚本 B：小说续写器分段加载诊断
 * 作用：把小说续写器.js 的代码按 SECTION 拆开，每段外面包 try/catch，
 *       看看到底是哪一段抛异常导致"加载失败"。
 * 每一段执行完都会打一段 console.log / alert。
 * ============================================================ */

// ═══════════════════════════════════════════════════════════
// 【第 0 段】 诊断入口：什么业务代码都不加，只看机制
// ═══════════════════════════════════════════════════════════
console.log('%c[Diag B] 🟢 第0段：脚本进入全局作用域', 'color:green;font-weight:bold');
var __B_STAGE = 0;
try { alert('【诊断B-0】✅ 脚本开始执行\n\n如果你看到这个弹窗，说明脚本全局作用域没问题。\n点确定继续加载下一段。'); } catch(_){}

// jQuery ready 作为真正启动时机（官方推荐）
$(function() {
    console.log('%c[Diag B] ✅ jQuery ready 触发，开始逐段加载小说续写器代码', 'color:green;font-weight:bold');

    // ═══════════════════════════════════════════════════════════
    // 【第 1 段】 运行环境补全
    // ═══════════════════════════════════════════════════════════
    __B_STAGE = 1;
    try {
        console.log('%c[Diag B] 🔄 第1段：运行环境补全', 'color:blue');
        // ---------- 和小说续写器完全相同的 SECTION 0.5 代码 ----------
        window.__SCRIPT_NAME = '小说续写器(诊断版B)';
        window.__SCRIPT_ID   = 'novel-writer-diag-b';

        function __safeGet(valueGetter, fallback) {
            try { var v = valueGetter(); return (typeof v === 'undefined') ? fallback : v; }
            catch (_) { return fallback; }
        }
        window.__safeGet = __safeGet;

        function __noOpToastr() { return {
            success: function(){ try{console.log.apply(console,['[toastr][ok]'].concat(Array.prototype.slice.call(arguments)));}catch(_){} },
            error:   function(){ try{console.error.apply(console,['[toastr][err]'].concat(Array.prototype.slice.call(arguments)));}catch(_){} },
            warning: function(){ try{console.warn.apply(console, ['[toastr][warn]'].concat(Array.prototype.slice.call(arguments)));}catch(_){} },
            info:    function(){ try{console.info.apply(console, ['[toastr][info]'].concat(Array.prototype.slice.call(arguments)));}catch(_){} },
        };}
        window.__noOpToastr = __noOpToastr;

        var _jQ   = __safeGet(function(){ return (typeof jQuery !== 'undefined') ? jQuery  : (typeof window.jQuery !== 'undefined') ? window.jQuery  : null; }, null);
        var _Dol  = __safeGet(function(){ return (typeof $      !== 'undefined') ? $       : (typeof window.$      !== 'undefined') ? window.$       : null; }, null);
        var _Tst  = __safeGet(function(){ return (typeof toastr !== 'undefined') ? toastr  : (typeof window.toastr !== 'undefined') ? window.toastr  : null; }, null) || __noOpToastr();

        var __curDoc = (typeof window !== 'undefined' && window.document) ? window.document : null;
        function getDoc() {
            if (__curDoc) return __curDoc;
            try { if (typeof document !== 'undefined') return document; } catch(_){}
            try { if (window && window.document) return window.document; } catch(_){}
            return (typeof document !== 'undefined') ? document : null;
        }
        function setDoc(newDoc) { __curDoc = newDoc || __curDoc; return __curDoc; }
        window.getDoc = getDoc;
        window.setDoc = setDoc;

        var jQuery = _jQ;
        var $      = _Dol;
        var toastr = _Tst;
        // 存到 window 方便后面各段直接用
        window.__jQ = jQuery;
        window.__Dol = $;
        window.__toastr = toastr;

        console.log('%c[Diag B] ✅ 第1段完成：jQuery='+($?'OK':'NULL')+', toastr='+(toastr&&toastr.success?'OK':'NULL')+', getDoc()='+!!getDoc(), 'color:green');
        try { toastr.success('第1段通过','诊断B'); } catch(_){}
        setTimeout(__loadStage2, 50);
    } catch (e) {
        console.error('%c[Diag B] ❌ 第1段崩溃：', 'color:red;font-weight:bold', e);
        try { alert('【诊断B-1】❌ 第1段崩溃\n\n错误：' + (e&&e.message?e.message:e) + '\n\n堆栈：' + (e&&e.stack?e.stack:'')); } catch(_){}
    }

    function __loadStage2() {
    // ═══════════════════════════════════════════════════════════
    // 【第 2 段】 getVariables / replaceVariables / getScriptId 适配层
    // ═══════════════════════════════════════════════════════════
    __B_STAGE = 2;
    try {
        console.log('%c[Diag B] 🔄 第2段：getVariables/replaceVariables 适配层', 'color:blue');
        function getVariables() {
            try { if (typeof getVariables === 'function' && arguments.callee !== getVariables) return getVariables.apply(null, arguments); } catch(_){}
            try { if (typeof window !== 'undefined' && typeof window.getVariables === 'function') return window.getVariables.apply(null, arguments); } catch(_){}
            try { var ST = __safeGet(function(){ return (typeof SillyTavern !== 'undefined') ? SillyTavern : (window && window.SillyTavern); }, null);
                  if (ST && typeof ST.getVariables === 'function') return ST.getVariables.apply(ST, arguments); } catch(_){}
            try { var TH = __safeGet(function(){ return (typeof TavernHelper !== 'undefined') ? TavernHelper : (window && window.TavernHelper); }, null);
                  if (TH && typeof TH.getVariables === 'function') return TH.getVariables.apply(TH, arguments); } catch(_){}
            try { var s = window && window.localStorage ? window.localStorage.getItem(window.__SCRIPT_ID + ':vars') : null; return s ? JSON.parse(s) : {}; } catch(_){ return {}; }
        }
        function replaceVariables(obj) {
            try { if (typeof replaceVariables === 'function' && arguments.callee !== replaceVariables) return replaceVariables.apply(null, arguments); } catch(_){}
            try { if (typeof window !== 'undefined' && typeof window.replaceVariables === 'function') return window.replaceVariables.apply(null, arguments); } catch(_){}
            try { var ST = __safeGet(function(){ return (typeof SillyTavern !== 'undefined') ? SillyTavern : (window && window.SillyTavern); }, null);
                  if (ST && typeof ST.replaceVariables === 'function') return ST.replaceVariables.apply(ST, arguments); } catch(_){}
            try { var TH = __safeGet(function(){ return (typeof TavernHelper !== 'undefined') ? TavernHelper : (window && window.TavernHelper); }, null);
                  if (TH && typeof TH.replaceVariables === 'function') return TH.replaceVariables.apply(TH, arguments); } catch(_){}
            try { if (window && window.localStorage) window.localStorage.setItem(window.__SCRIPT_ID + ':vars', JSON.stringify(obj || {})); } catch(_){}
        }
        function getScriptId() {
            try { if (typeof getScriptId === 'function' && arguments.callee !== getScriptId) return getScriptId.apply(null, arguments); } catch(_){}
            try { if (typeof window !== 'undefined' && typeof window.getScriptId === 'function') return window.getScriptId.apply(null, arguments); } catch(_){}
            return window.__SCRIPT_ID;
        }
        window.getVariables = getVariables;
        window.replaceVariables = replaceVariables;
        window.getScriptId = getScriptId;

        // 轻量测试适配层
        try {
            var t = getVariables({ type: 'script' });
            console.log('[Diag B] getVariables() 测试返回:', typeof t, t !== null && t !== undefined ? '非空' : '空');
        } catch(e) { console.warn('[Diag B] getVariables 测试抛错（不致命）:', e); }

        console.log('%c[Diag B] ✅ 第2段完成：适配层加载', 'color:green');
        setTimeout(__loadStage3, 50);
    } catch (e) {
        console.error('%c[Diag B] ❌ 第2段崩溃：', 'color:red;font-weight:bold', e);
        try { alert('【诊断B-2】❌ 第2段崩溃\n\n错误：' + (e&&e.message?e.message:e) + '\n\n堆栈：' + (e&&e.stack?e.stack:'')); } catch(_){}
    }
    }

    function __loadStage3() {
    // ═══════════════════════════════════════════════════════════
    // 【第 3 段】 脚本按钮注册 + 浮动按钮插入
    // ═══════════════════════════════════════════════════════════
    __B_STAGE = 3;
    try {
        console.log('%c[Diag B] 🔄 第3段：脚本按钮注册 + 浮动按钮', 'color:blue');

        // ---- 先重绑 $/document 到父页面（参照小说续写器的 __bootInit）----
        var pWin  = __safeGet(function(){ return (typeof window !== 'undefined' && window.parent) ? window.parent : null; }, null);
        var pDoc  = __safeGet(function(){ return (pWin && pWin.document) ? pWin.document : ((typeof window !== 'undefined' && window.document) ? window.document : getDoc()); }, getDoc());
        var pJQ   = __safeGet(function(){
            if (window.__Dol) return window.__Dol;
            if (typeof jQuery !== 'undefined' && jQuery) return jQuery;
            if (pWin && typeof pWin.jQuery !== 'undefined') return pWin.jQuery;
            if (typeof $ !== 'undefined' && $) return $;
            if (pWin && typeof pWin.$ !== 'undefined') return pWin.$;
            return null;
        }, null);
        var pTst  = __safeGet(function(){
            if (window.__toastr && window.__toastr.success) return window.__toastr;
            if (typeof toastr !== 'undefined' && toastr && toastr.success) return toastr;
            if (pWin && pWin.toastr && pWin.toastr.success) return pWin.toastr;
            return null;
        }, null) || __noOpToastr();
        if (pJQ)  { window.__Dol = pJQ; }
        if (pDoc) { setDoc(pDoc); }
        if (pTst) { window.__toastr = pTst; }
        console.log('[Diag B] ⚙️  重绑结果：jQuery=' + (window.__Dol?'OK':'NULL') + ', doc=' + (!!getDoc()) + ', toastr=' + (window.__toastr&&window.__toastr.success?'OK':'NULL'));

        var $_ = window.__Dol;
        var doc = getDoc();
        var tst = window.__toastr;

        // ---- 尝试自动添加按钮（官方 API）----
        var buttonRegistered = 0;
        try {
            if (typeof appendInexistentScriptButtons === 'function') {
                appendInexistentScriptButtons([{name: '诊断B', visible: true}]);
                console.log('[Diag B] appendInexistentScriptButtons 调用');
            } else if (typeof window.appendInexistentScriptButtons === 'function') {
                window.appendInexistentScriptButtons([{name: '诊断B', visible: true}]);
                console.log('[Diag B] window.appendInexistentScriptButtons 调用');
            }
        } catch (e) { console.warn('[Diag B] appendInexistentScriptButtons 失败:', e); }

        try {
            if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
                var names = ['诊断B', '小说续写器', '打开小说续写器'];
                for (var i=0; i<names.length; i++) {
                    try {
                        (function(n){
                            eventOn(getButtonEvent(n), function() {
                                tst.success('诊断B 按钮"'+n+'"被点击');
                                alert('【诊断B】✅ 脚本按钮"'+n+'"点击成功！');
                            });
                            buttonRegistered++;
                            console.log('[Diag B] 已注册按钮事件: "'+n+'"');
                        })(names[i]);
                    } catch (e) { console.warn('[Diag B] 注册"'+names[i]+'"失败:', e); }
                }
            }
        } catch (e) { console.warn('[Diag B] 整体注册按钮事件失败:', e); }

        // ---- 插入浮动按钮（用 jQuery）----
        var SID = window.__SCRIPT_ID;
        try {
            if ($_ && doc) {
                if ($_('#' + SID + '-btn').length === 0) {
                    var $floatBtn = $_('<button/>', {
                        id: SID + '-btn',
                        text: '📖 诊断B-小说续写器',
                        css: {
                            position: 'fixed', right: '20px', bottom: '20px',
                            zIndex: 2147483647, padding: '12px 18px',
                            borderRadius: '12px', border: '2px solid #fff',
                            background: 'linear-gradient(135deg,#f97316,#ea580c)',
                            color: '#fff', fontSize: '15px', fontWeight: '700',
                            cursor: 'pointer', boxShadow: '0 4px 20px rgba(249,115,22,.5)'
                        }
                    });
                    $floatBtn.on('click', function() {
                        alert('【诊断B】✅ 浮动按钮被点击！\n\n这证明：\n1. jQuery 能正确操作父页面 DOM\n2. 浮动按钮 CSS 生效\n3. 事件绑定正常\n\n接下来加载 UI_HTML + UI_CSS 大字符串阶段');
                        tst.success('诊断B浮动按钮点击成功');
                        setTimeout(__loadStage4, 200);
                    });
                    $_(doc.body).append($floatBtn);
                    console.log('[Diag B] ✅ 浮动按钮已插入父页面body：#'+SID+'-btn');
                } else {
                    console.log('[Diag B] 浮动按钮已存在，跳过插入');
                }
            } else {
                console.warn('[Diag B] $_或doc不可用，跳过浮动按钮插入。$_=', !!$_, 'doc=', !!doc);
            }
        } catch (e) {
            console.error('[Diag B] ❌ 浮动按钮插入崩溃：', e);
            try { alert('【诊断B-3】❌ 浮动按钮插入崩溃\n\n错误：' + (e&&e.message?e.message:e)); } catch(_){}
        }

        console.log('%c[Diag B] ✅ 第3段完成：脚本按钮注册=' + buttonRegistered + '个，浮动按钮已显示在右下角', 'color:green');
        try { tst.success('第3段通过，右下角有浮动按钮', '诊断B'); } catch(_){}
    } catch (e) {
        console.error('%c[Diag B] ❌ 第3段崩溃：', 'color:red;font-weight:bold', e);
        try { alert('【诊断B-3】❌ 第3段崩溃\n\n错误：' + (e&&e.message?e.message:e) + '\n\n堆栈：' + (e&&e.stack?e.stack:'')); } catch(_){}
    }
    }

    function __loadStage4() {
    // ═══════════════════════════════════════════════════════════
    // 【第 4 段】 UI_CSS / UI_HTML 大字符串加载 & 注入父页面
    // ═══════════════════════════════════════════════════════════
    __B_STAGE = 4;
    console.log('%c[Diag B] 🔄 第4段：准备加载 UI_CSS+UI_HTML 大字符串', 'color:blue');
    try {
        try { alert('【诊断B-4】准备加载 UI_CSS+UI_HTML\n\n这一步是最可能出错的，因为大字符串有几百KB。\n点确定后开始加载，如果卡住/报错就说明问题在 UI_CSS/UI_HTML。'); } catch(_){}

        // 直接 fetch 小说续写器.js 文件，从中抽 UI_CSS 和 UI_HTML 两个大字符串，
        // 这样诊断脚本自己不携带大字符串，体积小
        fetch('https://cdn.jsdelivr.net/gh/Neohero521/Always_remember_me@c913b2a/%E5%B0%8F%E8%AF%B4%E7%BB%AD%E5%86%99%E5%99%A8.js')
        .then(function(r){ return r.text(); })
        .then(function(srcText){
            try {
                console.log('[Diag B] 已下载源码，大小=' + srcText.length + ' 字节');
                // 抽取 const UI_CSS = "..." 和 const UI_HTML = "..."
                var cssMatch = srcText.match(/const UI_CSS = `([\s\S]*?)`;\s*const UI_HTML/m);
                var htmlMatch = srcText.match(/const UI_HTML = `([\s\S]*?)`;\s*\/\* =/m);
                if (!cssMatch || !cssMatch[1]) {
                    throw new Error('从源文件抽取 UI_CSS 失败，match='+!!cssMatch);
                }
                if (!htmlMatch || !htmlMatch[1]) {
                    throw new Error('从源文件抽取 UI_HTML 失败，match='+!!htmlMatch);
                }
                var UI_CSS  = cssMatch[1];
                var UI_HTML = htmlMatch[1];
                console.log('[Diag B] 抽取完成：UI_CSS=' + UI_CSS.length + ' 字节，UI_HTML=' + UI_HTML.length + ' 字节');

                var $_  = window.__Dol;
                var doc = getDoc();
                var tst = window.__toastr;
                var SID = window.__SCRIPT_ID;

                // 注入 CSS
                if ($_ && doc) {
                    $_('<style/>', { id: SID+'-style', 'data-novel-writer': 'true' }).text(UI_CSS).appendTo($_(doc.head));
                    console.log('[Diag B] ✅ UI_CSS 已注入父页面 <head>');
                }
                // 注入 HTML（先放在 body 末尾一个透明的容器里，不展开）
                if ($_ && doc) {
                    var $root = $_('<div/>', {
                        id: SID + '-root',
                        css: {
                            position: 'fixed', left: '50%', top: '50%',
                            transform: 'translate(-50%,-50%)',
                            width: '960px', maxWidth: '95vw',
                            height: '700px', maxHeight: '90vh',
                            background: '#fff', borderRadius: '16px',
                            border: '1px solid #ddd', boxShadow: '0 20px 60px rgba(0,0,0,.4)',
                            zIndex: 2147483646, overflow: 'auto', display: 'none', padding: '24px'
                        }
                    }).html(UI_HTML);
                    var $close = $_('<button/>', {
                        text: '✕ 关闭',
                        css: { position: 'absolute', right: '12px', top: '12px', zIndex: 10,
                               padding: '6px 12px', background: '#f43f5e', color: '#fff',
                               border: 'none', borderRadius: '8px', cursor: 'pointer' }
                    }).on('click', function(){ $root.fadeOut(200); });
                    $root.prepend($close);
                    $_(doc.body).append($root);
                    console.log('[Diag B] ✅ UI_HTML 已注入父页面 body（初始隐藏）');

                    // 展开按钮：给用户点一下就能看见UI
                    var $showBtn = $_('<button/>', {
                        id: SID+'-showui',
                        text: '📖 点我展开小说续写器UI',
                        css: { position:'fixed', right:'20px', bottom:'80px', zIndex:2147483646,
                               padding:'10px 16px', background:'#22c55e', color:'#fff',
                               border:'none', borderRadius:'10px', fontSize:'14px',
                               fontWeight:'700', cursor:'pointer', boxShadow:'0 4px 20px rgba(34,197,94,.5)'}
                    }).on('click', function(){ $root.fadeIn(250); tst.success('UI已展开'); });
                    $_(doc.body).append($showBtn);
                    console.log('[Diag B] ✅ "展开UI"按钮已添加（在浮动按钮上方）');
                }
                try { tst.success('UI_CSS/UI_HTML 加载完成，点绿色按钮展开UI', '诊断B'); } catch(_){}
                console.log('%c[Diag B] ✅ 第4段完成：UI_CSS/UI_HTML 成功抽取并注入父页面', 'color:green;font-weight:bold');
                try { alert('【诊断B-4】✅ UI_CSS+UI_HTML 加载成功！\n\n已在父页面注入 HTML 容器（初始隐藏）。\n屏幕右下角有绿色按钮"📖 点我展开小说续写器UI"，点它可以看到 UI 布局（没有功能，纯展示）。'); } catch(_){}
            } catch (innerE) {
                console.error('%c[Diag B] ❌ 第4段（UI抽取/注入）崩溃：', 'color:red;font-weight:bold', innerE);
                try { alert('【诊断B-4】❌ UI_CSS/UI_HTML 阶段崩溃\n\n错误：' + (innerE&&innerE.message?innerE.message:innerE) + '\n\n堆栈：' + (innerE&&innerE.stack?innerE.stack:'')); } catch(_){}
            }
        })
        .catch(function(err){
            console.error('[Diag B] ❌ fetch 源码失败：', err);
            try { alert('【诊断B-4】❌ fetch 源码失败（CDN/网络？）\n错误：' + (err&&err.message?err.message:err)); } catch(_){}
        });
    } catch (e) {
        console.error('%c[Diag B] ❌ 第4段外围崩溃：', 'color:red;font-weight:bold', e);
        try { alert('【诊断B-4】❌ 第4段外围崩溃\n\n错误：' + (e&&e.message?e.message:e) + '\n\n堆栈：' + (e&&e.stack?e.stack:'')); } catch(_){}
    }
    }
});

// 兜底：万一 jQuery ready 没触发（官方说不可能，但防一手）
setTimeout(function(){
    if (__B_STAGE === 0) {
        console.error('%c[Diag B] ⚠️  jQuery ready 2秒未触发，尝试手动启动', 'color:orange;font-weight:bold');
        try { alert('【诊断B】⚠️ jQuery ready 2秒未触发\n\n可能 jQuery 不可用或 import 机制有问题。\n尝试手动启动...'); } catch(_){}
        try { if (typeof $ === 'function') { $($.fn.ready ? $.fn.ready : null); } } catch(_){}
    }
}, 2000);

console.log('%c[Diag B] 🟢 全局作用域代码执行完毕（完整版本）', 'color:green');
