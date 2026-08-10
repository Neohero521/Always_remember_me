/* ============================================================
 * ▌诊断脚本 A：最小化验证
 * 作用：证明「import URL + Tavern Helper 脚本按钮」的加载机制本身是工作的
 * 如果这个脚本能成功（alert/toastr 有反应）→ 说明是小说续写器.js 的代码有问题
 * 如果这个脚本也"加载失败"→ 说明是 Tavern Helper/配置/import 机制问题
 * ============================================================ */

console.log('[Diag A] 🟢 脚本文件已加载（进入全局作用域第一行）');

$(() => {
    console.log('[Diag A] ✅ jQuery ready 回调已触发');
    try { toastr.success('诊断脚本A：jQuery ready 成功！', '诊断A'); } catch (e) { console.warn('[Diag A] toastr 不可用', e); }
    try { alert('【诊断脚本A】✅ 加载成功！\n\n如果您看到了这个弹窗，说明：\n1. Tavern Helper 的 import URL 机制工作正常\n2. jQuery ready 回调工作正常\n3. 接下来需要排查小说续写器.js 代码本身的问题'); } catch (_) {}
});

// 注册脚本按钮（用户配置按钮名="诊断A"）
try {
    if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
        eventOn(getButtonEvent('诊断A'), () => {
            alert('【诊断脚本A】✅ 脚本按钮点击成功！\n\n这证明 eventOn/getButtonEvent 工作正常。');
            toastr.success('诊断A：脚本按钮点击成功');
        });
        console.log('[Diag A] ✅ 已注册脚本按钮，按钮名="诊断A"');
    }
} catch (e) {
    console.warn('[Diag A] 注册脚本按钮失败:', e);
}

try {
    // 暴露全局方便用户手动测试
    window.__diagA = 'OK';
} catch (_) {}

console.log('[Diag A] 🟢 全局作用域代码执行完毕，等待 jQuery ready...');
