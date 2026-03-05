// index.js
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';
import uiManager from './modules/uiManager.js';

/**
 * SillyTavern 插件初始化入口，加载插件时自动调用
 * @param {Object} context ST提供的插件上下文对象
 */
export async function init(context) {
    console.log('[小说续写助手] 插件加载中...');

    try {
        // 初始化本地存储
        storageManager.initStorage();
        // 注册自定义斜杠命令
        stCommandBridge.registerCustomCommands();
        // 注册侧边栏UI面板
        uiManager.registerPanel();

        console.log('[小说续写助手] 插件加载完成！');
    } catch (error) {
        console.error('[小说续写助手] 插件加载失败:', error);
        throw error;
    }
}

/**
 * 插件卸载钩子，卸载插件时自动调用
 */
export async function exit() {
    console.log('[小说续写助手] 插件已卸载');
}
