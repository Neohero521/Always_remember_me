// index.js - 100%对齐Cola插件的入口规范，零报错兼容所有ST正式版
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';
import uiManager from './modules/uiManager.js';
import chapterSplitter from './modules/chapterSplitter.js';
import knowledgeGraph from './modules/knowledgeGraph.js';
import continuationEngine from './modules/continuationEngine.js';

// 全局挂载模块（和Cola插件写法完全一致）
window.STNovelPlugin = {
    storageManager,
    stCommandBridge,
    uiManager,
    chapterSplitter,
    knowledgeGraph,
    continuationEngine
};

/**
 * ST插件初始化入口（Cola同款标准写法）
 * @param {Object} context ST注入的上下文
 */
export async function init(context) {
    console.log('[小说续写助手] 插件开始初始化...');

    try {
        // 等待ST完全加载，确保全局API可用（解决初始化报错的核心）
        if (!window.SillyTavern) {
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (window.SillyTavern) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }

        // 初始化核心模块
        storageManager.initStorage();
        console.log('[小说续写助手] 存储模块初始化完成');

        stCommandBridge.registerCommands();
        console.log('[小说续写助手] 命令注册完成');

        // 注册侧边栏面板（Cola同款API，图标显示的核心）
        await window.SillyTavern.sidebar.registerPanel({
            id: 'novel-continuation-panel',
            icon: 'fa-solid fa-book',
            title: '小说续写助手',
            onRender: (container) => uiManager.render(container),
            onOpen: (container) => uiManager.render(container)
        });

        console.log('[小说续写助手] 侧边栏面板注册成功！图标已加载');
        console.log('[小说续写助手] 插件初始化完成！');
    } catch (error) {
        console.error('[小说续写助手] 初始化失败:', error);
        throw error;
    }
}

/**
 * 插件卸载钩子（ST标准要求）
 */
export async function exit() {
    console.log('[小说续写助手] 插件开始卸载');
    try {
        await window.SillyTavern.sidebar.unregisterPanel('novel-continuation-panel');
        delete window.STNovelPlugin;
        console.log('[小说续写助手] 插件卸载完成');
    } catch (error) {
        console.error('[小说续写助手] 卸载失败:', error);
    }
}
