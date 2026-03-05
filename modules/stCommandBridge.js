// modules/stCommandBridge.js
class STCommandBridge {
    constructor() {
        this.charInputCommand = '/input 请输入{{char}}的动作或台词： | /sendas name={{char}} {{pipe}}';
    }

    getCurrentChar(context) {
        return context.characters?.getCurrentCharacter()?.name || '{{char}}';
    }

    importToInput(content, context) {
        context.chat?.setChatInputValue?.(content);
        return true;
    }

    async sendAsChar(content, charName = null, context) {
        const targetName = charName || this.getCurrentChar(context);
        const command = `/sendas name="${targetName}" ${content}`;
        await context.slashCommands?.execute?.(command);
        return true;
    }

    async sendAsContext(content, context) {
        await context.chat?.sendMessage?.(content, { isSystem: true });
        return true;
    }

    async executeCharInputCommand(context) {
        const charName = this.getCurrentChar(context);
        const command = this.charInputCommand.replace(/{{char}}/g, charName);
        await context.slashCommands?.execute?.(command);
        return true;
    }

    registerCommands(context) {
        const { slashCommands, sidebar, toaster, storageManager } = context;

        window.STNovelPlugin = {
            storageManager: (await import('./storageManager.js')).default,
            chapterSplitter: (await import('./chapterSplitter.js')).default,
            knowledgeGraph: (await import('./knowledgeGraph.js')).default,
            continuationEngine: (await import('./continuationEngine.js')).default,
            stCommandBridge: this
        };

        slashCommands?.register?.({
            name: 'novel_import',
            description: '打开小说续写助手面板',
            handler: () => sidebar?.openPanel?.('novel-continuation-panel')
        });

        slashCommands?.register?.({
            name: 'char_input',
            description: '弹出输入框，以当前角色身份发送台词',
            handler: async () => {
                try {
                    await this.executeCharInputCommand(context);
                } catch (error) {
                    toaster?.show?.(`执行命令失败: ${error.message}`, 'error');
                }
            }
        });
    }
}

export default new STCommandBridge();
