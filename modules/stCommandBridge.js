// modules/stCommandBridge.js
import storageManager from './storageManager.js';

class STCommandBridge {
    constructor() {
        // 您指定的核心命令链
        this.charInputCommand = '/input 请输入{{char}}的动作或台词： | /sendas name={{char}} {{pipe}}';
    }

    // 获取当前角色名
    getCurrentChar(context) {
        return context.characters?.getCurrentCharacter()?.name || '{{char}}';
    }

    // 导入内容到输入框
    importToInput(content, context) {
        context.chat?.setChatInputValue?.(content);
        return true;
    }

    // 以当前角色身份发送内容
    async sendAsChar(content, context, charName = null) {
        const targetName = charName || this.getCurrentChar(context);
        const command = `/sendas name="${targetName}" ${content}`;
        await context.slashCommands?.execute?.(command);
        return true;
    }

    // 发送为系统上下文
    async sendAsContext(content, context) {
        await context.chat?.sendMessage?.(content, { isSystem: true });
        return true;
    }

    // 执行您指定的角色输入命令链
    async executeCharInputCommand(context) {
        const charName = this.getCurrentChar(context);
        const command = this.charInputCommand.replace(/{{char}}/g, charName);
        await context.slashCommands?.execute?.(command);
        return true;
    }

    // 注册自定义斜杠命令
    registerCommands(context) {
        // 打开插件面板
        context.slashCommands?.register?.({
            name: 'novel_import',
            description: '打开小说续写助手面板',
            handler: () => {
                context.sidebar?.openPanel?.('novel-continuation-panel');
            }
        });

        // 角色输入命令
        context.slashCommands?.register?.({
            name: 'char_input',
            description: '弹出输入框，以当前角色身份发送台词',
            handler: async () => {
                await this.executeCharInputCommand(context);
            }
        });

        // 章节续写命令
        context.slashCommands?.register?.({
            name: 'novel_continue',
            description: '续写当前章节，参数：字数（默认1000）',
            handler: async (args) => {
                // 此处仅注册命令，完整逻辑可按需扩展
                context.toast?.show?.(`续写命令已触发，字数：${args[0] || 1000}`, 'info');
            }
        });
    }
}

export default new STCommandBridge();
