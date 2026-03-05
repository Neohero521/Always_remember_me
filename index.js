// index.js - 严格遵循SillyTavern官方插件规范
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';
import uiManager from './modules/uiManager.js';

/**
 * 插件初始化入口，ST加载插件时自动调用
 * @param {Object} context ST官方提供的全局上下文，包含所有核心API
 */
export async function init(context) {
    console.log('[小说续写助手] 插件开始初始化...');

    try {
        // 挂载全局上下文，方便子模块调用
        window.STNovelContinuation = {
            context,
            storageManager,
            stCommandBridge,
            uiManager
        };

        // 初始化核心模块
        storageManager.initStorage();
        stCommandBridge.registerCustomCommands(context);
        await uiManager.registerPanel(context);

        console.log('[小说续写助手] 初始化成功！侧边栏图标已加载');
    } catch (error) {
        console.error('[小说续写助手] 初始化失败:', error);
        throw error;
    }
}

/**
 * 插件卸载钩子，ST卸载插件时自动调用
 */
export async function exit() {
    console.log('[小说续写助手] 插件开始卸载...');
    try {
        delete window.STNovelContinuation;
        uiManager.unregisterPanel();
        console.log('[小说续写助手] 卸载完成');
    } catch (error) {
        console.error('[小说续写助手] 卸载失败:', error);
    }
}
