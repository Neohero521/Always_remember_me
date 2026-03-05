// modules/stCommandBridge.js - 对齐Cola插件的命令写法
class STCommandBridge {
    constructor() {
        // 您指定的核心命令链
        this.charInputCommand = '/input 请输入{{char}}的动作或台词： | /sendas name={{char}} {{pipe}}';
    }

    get ST() {
        return window.SillyTavern;
    }

    // 获取当前角色名
    getCurrentChar() {
        return this.ST.characters?.getCurrentCharacter()?.name || '{{char}}';
    }

    // 导入内容到输入框
    importToInput(content) {
        this.ST.chat?.setChatInputValue?.(content);
        return true;
    }

    // 以当前角色身份发送内容
    async sendAsChar(content, charName = null) {
        const targetName = charName || this.getCurrentChar();
        const command = `/sendas name="${targetName}" ${content}`;
        await this.ST.slashCommands?.execute?.(command);
        return true;
    }

    // 发送为系统上下文
    async sendAsContext(content) {
        await this.ST.chat?.sendMessage?.(content, { isSystem: true });
        return true;
    }

    // 执行您指定的角色输入命令链
    async executeCharInputCommand() {
        const charName = this.getCurrentChar();
        const command = this.charInputCommand.replace(/{{char}}/g, charName);
        await this.ST.slashCommands?.execute?.(command);
        return true;
    }

    // 注册自定义斜杠命令
    registerCommands() {
        const { slashCommands, sidebar, toaster } = this.ST;
        const { storageManager } = window.STNovelPlugin;

        // 打开插件面板命令
        slashCommands?.register?.({
            name: 'novel_import',
            description: '打开小说续写助手面板',
            handler: () => sidebar?.openPanel?.('novel-continuation-panel')
        });

        // 角色输入快捷命令
        slashCommands?.register?.({
            name: 'char_input',
            description: '弹出输入框，以当前角色身份发送台词',
            handler: async () => {
                try {
                    await this.executeCharInputCommand();
                } catch (error) {
                    toaster?.show?.(`执行命令失败: ${error.message}`, 'error');
                }
            }
        });

        // 章节续写命令
        slashCommands?.register?.({
            name: 'novel_continue',
            description: '续写当前选中的章节，参数：字数（默认1000）',
            handler: async (args) => {
                const wordCount = parseInt(args[0]) || 1000;
                const currentChapter = storageManager.getCurrentChapter();
                const currentNovel = storageManager.getCurrentNovel();
                if (!currentNovel || !currentChapter) {
                    return toaster?.show?.('请先选择要续写的小说和章节', 'error');
                }
                toaster?.show?.(`开始续写当前章节，约${wordCount}字`, 'info');
            }
        });
    }
}

export default new STCommandBridge();
