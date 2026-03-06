// index.js - 正确版本
import storageManager from './modules/storageManager.js';
import stCommandBridge from './modules/stCommandBridge.js';

// ST插件初始化入口，必须导出async init函数
export async function init() {
    console.log('[小说章节导入助手] 插件开始加载...');
    try {
        const context = window.SillyTavern?.getContext?.();
        if (!context) {
            throw new Error('无法获取SillyTavern上下文');
        }

        // 初始化核心模块
        storageManager.initStorage();
        stCommandBridge.registerCommands(context);

        // 获取扩展文件夹路径
        const extensionName = "Always_remember_me";
        const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

        // 读取并添加设置页面到扩展设置菜单（左侧栏）
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings").append(settingsHtml);

        console.log('[小说章节导入助手] 插件加载完成！已添加到设置菜单');
    } catch (error) {
        console.error('[小说章节导入助手] 加载失败:', error);
        throw error;
    }
}

// ST插件卸载钩子，必须导出async exit函数
export async function exit() {
    console.log('[小说章节导入助手] 插件卸载');
    try {
        const context = window.SillyTavern?.getContext?.();
        // 移除设置菜单中的扩展内容
        $("#extensions_settings [data-extension='Always_remember_me']").remove();
    } catch (error) {
        console.error('[小说章节导入助手] 卸载失败:', error);
    }
}
