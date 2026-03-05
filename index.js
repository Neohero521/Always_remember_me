// index.js - 完全符合ST官方扩展规范
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';
import uiManager from './modules/uiManager.js';

// ST插件初始化入口，必须导出async init函数
export async function init() {
    console.log('[小说续写助手] 插件开始加载...');
    try {
        // 等待ST全局上下文完全加载
        const context = window.SillyTavern?.getContext?.();
        if (!context) {
            throw new Error('无法获取SillyTavern上下文');
        }

        // 初始化核心模块
        storageManager.initStorage();
        stCommandBridge.registerCommands(context);

        // 注册侧边栏面板（官方标准写法，图标显示的核心）
        await context.sidebar.registerPanel({
            id: 'novel-continuation-panel',
            icon: 'fa-book',
            title: '小说续写助手',
            onRender: (container) => uiManager.render(container, context),
            onOpen: (container) => uiManager.render(container, context)
        });

        console.log('[小说续写助手] 插件加载完成！已出现在侧边栏');
    } catch (error) {
        console.error('[小说续写助手] 加载失败:', error);
        throw error;
    }
}

// ST插件卸载钩子，必须导出async exit函数
export async function exit() {
    console.log('[小说续写助手] 插件卸载');
    try {
        const context = window.SillyTavern?.getContext?.();
        await context?.sidebar?.unregisterPanel?.('novel-continuation-panel');
    } catch (error) {
        console.error('[小说续写助手] 卸载失败:', error);
    }
}
