// modules/stCommandBridge.js
import storageManager from './storageManager.js';

class STCommandBridge {
    constructor() {
        // 您指定的核心命令链模板
        this.characterInputCommandTemplate = '/input 请输入{{char}}的动作或台词： | /sendas name={{char}} {{pipe}}';
    }

    getCurrentCharacterName() {
        if (!window.SillyTavern) throw new Error('SillyTavern API 不可用');
        const currentChar = window.SillyTavern.getCurrentCharacter();
        return currentChar?.name || '{{char}}';
    }

    // 执行您指定的角色输入发送命令链
    async executeCharacterInputCommand() {
        try {
            const charName = this.getCurrentCharacterName();
            const command = this.characterInputCommandTemplate.replace(/{{char}}/g, charName);
            await window.SillyTavern.executeSlashCommand(command);
            return true;
        } catch (error) {
            throw new Error(`执行命令失败: ${error.message}`);
        }
    }

    // 把章节内容导入到聊天输入框
    importChapterToInput(chapterContent) {
        if (!window.SillyTavern) throw new Error('SillyTavern API 不可用');
        window.SillyTavern.setChatInputValue(chapterContent);
        return true;
    }

    // 以指定角色身份发送章节内容到对话框
    async sendChapterAsCharacter(chapterContent, charName = null) {
        if (!window.SillyTavern) throw new Error('SillyTavern API 不可用');
        const targetCharName = charName || this.getCurrentCharacterName();
        const command = `/sendas name="${targetCharName}" ${chapterContent}`;
        await window.SillyTavern.executeSlashCommand(command);
        return true;
    }

    // 发送章节内容为系统上下文
    async sendChapterAsContext(chapterContent) {
        if (!window.SillyTavern) throw new Error('SillyTavern API 不可用');
        await window.SillyTavern.sendMessage(chapterContent, { isSystem: true });
        return true;
    }

    // 注册插件自定义斜杠命令
    registerCustomCommands() {
        if (!window.SillyTavern) return;

        // 打开插件面板命令
        window.SillyTavern.registerSlashCommand({
            name: 'novel_import',
            description: '打开小说续写助手的小说导入面板',
            handler: () => window.SillyTavern.openExtensionPanel('novelContinuationPanel')
        });

        // 章节分析命令
        window.SillyTavern.registerSlashCommand({
            name: 'novel_analyze',
            description: '分析当前选中的小说章节，生成知识图谱',
            handler: async () => {
                const currentChapter = storageManager.getCurrentChapter();
                const currentNovel = storageManager.getCurrentNovel();
                if (!currentNovel || !currentChapter) {
                    return window.SillyTavern.showToast('请先选择要分析的小说和章节', 'error');
                }
                window.dispatchEvent(new CustomEvent('novel-continuation:analyze-current-chapter'));
            }
        });

        // 您指定的角色输入命令
        window.SillyTavern.registerSlashCommand({
            name: 'char_input',
            description: '弹出输入框，输入角色的动作或台词，以当前角色的身份发送',
            handler: async () => {
                try {
                    await this.executeCharacterInputCommand();
                } catch (error) {
                    window.SillyTavern.showToast(`执行命令失败: ${error.message}`, 'error');
                }
            }
        });

        // 续写命令
        window.SillyTavern.registerSlashCommand({
            name: 'novel_continue',
            description: '续写当前选中的章节，参数：字数（默认1000）',
            handler: async (args) => {
                const wordCount = parseInt(args[0]) || 1000;
                const currentChapter = storageManager.getCurrentChapter();
                const currentNovel = storageManager.getCurrentNovel();
                if (!currentNovel || !currentChapter) {
                    return window.SillyTavern.showToast('请先选择要续写的小说和章节', 'error');
                }
                window.dispatchEvent(new CustomEvent('novel-continuation:continue-current-chapter', { detail: { wordCount } }));
            }
        });
    }
}

export default new STCommandBridge();
