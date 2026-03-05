// ===================== 【已修复】ST API导入路径 =====================
import { getContext } from "../../../script.js";

const EXTENSION_ID = 'novel-magic-editor';

export async function savePluginData(data) {
    const context = getContext();
    try {
        const serializableData = {
            chapters: data.chapters,
            groups: data.groups,
            knowledgeGraph: data.knowledgeGraph,
            currentChapterId: data.currentChapterId,
            generatedChapters: data.generatedChapters
        };
        await context.setExtensionSetting(EXTENSION_ID, 'savedState', JSON.stringify(serializableData));
        return true;
    } catch (err) {
        console.error('保存插件数据失败:', err);
        return false;
    }
}

export async function loadPluginData() {
    const context = getContext();
    try {
        const savedData = await context.getExtensionSetting(EXTENSION_ID, 'savedState');
        if (savedData) {
            return JSON.parse(savedData);
        }
        return null;
    } catch (err) {
        console.error('读取插件数据失败:', err);
        return null;
    }
}

export async function clearPluginData() {
    const context = getContext();
    try {
        await context.setExtensionSetting(EXTENSION_ID, 'savedState', null);
        return true;
    } catch (err) {
        console.error('清除插件数据失败:', err);
        return false;
    }
}
