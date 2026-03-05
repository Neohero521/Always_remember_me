// index.js - 完全对齐Cola插件的初始化逻辑，零报错兼容
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';
import uiManager from './modules/uiManager.js';

/**
 * ST插件初始化入口（Cola插件同款标准写法）
 * @param {Object} context ST官方注入的全局上下文，包含所有可用API
 */
export async function init(context) {
    console.log('[小说续写助手] 开始加载...');
    
    try {
        // 挂载上下文到全局（仅内部使用，避免重复传参）
        window.STNovelContext = context;

        // 初始化核心模块（分步执行，单模块报错不影响整体加载）
        try {
            storageManager.initStorage();
            console.log('[小说续写助手] 存储模块初始化成功');
        } catch (e) {
            console.warn('[小说续写助手] 存储模块初始化异常', e);
        }

        try {
            stCommandBridge.registerCommands(context);
            console.log('[小说续写助手] 命令模块注册成功');
        } catch (e) {
            console.warn('[小说续写助手] 命令模块注册异常', e);
        }

        try {
            // 注册侧边栏面板（Cola插件同款全版本兼容API，图标显示的核心）
            await context.registerSidebarPanel({
                id: 'novel-continuation-panel',
                icon: 'fa-book',
                title: '小说续写助手',
                onRender: (container) => uiManager.render(container, context),
                onOpen: (container) => uiManager.render(container, context)
            });
            console.log('[小说续写助手] 侧边栏面板注册成功！图标已加载');
        } catch (e) {
            console.error('[小说续写助手] 面板注册失败', e);
            throw e; // 面板注册失败必须抛出，否则无图标
        }

        console.log('[小说续写助手] 插件加载完成！');
    } catch (error) {
        console.error('[小说续写助手] 插件加载致命错误', error);
        throw error;
    }
}

/**
 * 插件卸载钩子（ST标准要求）
 */
export async function exit() {
    console.log('[小说续写助手] 插件已卸载');
    if (window.STNovelContext) {
        delete window.STNovelContext;
    }
}
