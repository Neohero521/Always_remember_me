// modules/stCommandBridge.js - 符合ST官方命令注册规范
import storageManager from './storageManager.js';

class STCommandBridge {
    constructor() {
        this.characterInputCommandTemplate = '/input 请输入{{char}}的动作或台词： | /sendas name={{char}} {{pipe}}';
    }

    getCurrentCharacterName(context) {
        const currentChar = context.characters.getCurrentCharacter();
        return currentChar?.name || '{{char}}';
    }

    async executeCharacterInputCommand(context) {
        const charName = this.getCurrentCharacterName(context);
        const command = this.characterInputCommandTemplate.replace(/{{char}}/g, charName);
        await context.slashCommands.execute(command);
        return true;
    }

    importChapterToInput(chapterContent, context) {
        context.chat.setChatInputValue(chapterContent);
        return true;
    }

    async sendChapterAsCharacter(chapterContent, charName = null, context) {
        const targetCharName = charName || this.getCurrentCharacterName(context);
        const command = `/sendas name="${targetCharName}" ${chapterContent}`;
        await context.slashCommands.execute(command);
        return true;
    }

    async sendChapterAsContext(chapterContent, context) {
        await context.chat.sendMessage(chapterContent, { isSystem: true });
        return true;
    }

    registerCustomCommands(context) {
        // 打开插件面板命令
        context.slashCommands.register({
            name: 'novel_import',
            description: '打开小说续写助手面板',
            handler: () => context.sidebar.openPanel('novel-continuation-panel')
        });

        // 章节分析命令
        context.slashCommands.register({
            name: 'novel_analyze',
            description: '分析当前选中的小说章节，生成知识图谱',
            handler: async () => {
                const currentChapter = storageManager.getCurrentChapter();
                const currentNovel = storageManager.getCurrentNovel();
                if (!currentNovel || !currentChapter) {
                    return context.toaster.show('请先选择要分析的小说和章节', 'error');
                }
                window.dispatchEvent(new CustomEvent('novel-continuation:analyze-current-chapter'));
            }
        });

        // 角色输入命令
        context.slashCommands.register({
            name: 'char_input',
            description: '弹出输入框，输入角色的动作或台词，以当前角色的身份发送',
            handler: async () => {
                try {
                    await this.executeCharacterInputCommand(context);
                } catch (error) {
                    context.toaster.show(`执行命令失败: ${error.message}`, 'error');
                }
            }
        });

        // 续写命令
        context.slashCommands.register({
            name: 'novel_continue',
            description: '续写当前选中的章节，参数：字数（默认1000）',
            handler: async (args) => {
                const wordCount = parseInt(args[0]) || 1000;
                const currentChapter = storageManager.getCurrentChapter();
                const currentNovel = storageManager.getCurrentNovel();
                if (!currentNovel || !currentChapter) {
                    return context.toaster.show('请先选择要续写的小说和章节', 'error');
                }
                window.dispatchEvent(new CustomEvent('novel-continuation:continue-current-chapter', { detail: { wordCount } }));
            }
        });
    }
}

export default new STCommandBridge();
