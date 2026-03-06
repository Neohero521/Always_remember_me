// 扩展唯一标识
const MODULE_NAME = 'always_remember_me';

// 初始化扩展
async function initExtension() {
    // 等待SillyTavern上下文加载
    if (!window.SillyTavern) {
        toastr.error('SillyTavern上下文未加载，请刷新页面重试');
        return;
    }

    const context = SillyTavern.getContext();
    const {
        eventSource, event_types,
        chat, characterId, characters,
        saveMetadata, SlashCommandParser,
        SlashCommand, SlashCommandNamedArgument,
        SlashCommandArgument, ARGUMENT_TYPE, Popup,
        extensionSettings, saveSettingsDebounced
    } = context;

    // 默认设置
    const defaultSettings = Object.freeze({
        chapterRegex: "(第[\\u4e00-\\u9fa50-9]+章|章节[\\u4e00-\\u9fa50-9]+|[\\d]+章)",
        autoSaveChat: true
    });

    // 加载/初始化设置
    function loadSettings() {
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }
        // 合并新默认值（兼容更新）
        extensionSettings[MODULE_NAME] = SillyTavern.libs.lodash.merge(
            structuredClone(defaultSettings),
            extensionSettings[MODULE_NAME]
        );
        return extensionSettings[MODULE_NAME];
    }
    const settings = loadSettings();

    // -------------------------- 工具函数：章节拆分 --------------------------
    function splitNovelToChapters(novelText) {
        if (!novelText) return [];
        const chapterRegex = new RegExp(settings.chapterRegex, 'g');
        const chapters = [];
        let lastIndex = 0;
        let match;

        while ((match = chapterRegex.exec(novelText)) !== null) {
            const chapterTitle = match[0];
            const chapterContent = novelText.slice(lastIndex, match.index).trim();
            if (chapterContent) {
                chapters.push({ title: chapterTitle, content: chapterContent });
            }
            lastIndex = match.index;
        }

        // 处理最后一个章节
        const lastChapterContent = novelText.slice(lastIndex).trim();
        if (lastChapterContent) {
            chapters.push({ title: '最后章节', content: lastChapterContent });
        }

        return chapters;
    }

    // -------------------------- 核心逻辑：导入章节到聊天 --------------------------
    function importChapterToChat(chapterContent) {
        if (!chapterContent) {
            toastr.warning('章节内容不能为空');
            return;
        }

        const charName = characters[characterId]?.name || '角色';
        // 拼接用户指定的斜杠命令模板
        const inputCommand = `/input 请输入${charName}的动作或台词：| /sendas name=${charName} ${chapterContent}`;
        
        // 执行斜杠命令
        SlashCommandParser.parseCommand(inputCommand);

        // 添加到聊天记录
        const newMessage = {
            is_user: false,
            name: charName,
            send_date: Date.now(),
            mes: chapterContent,
        };
        chat.push(newMessage);

        // 保存聊天元数据
        if (settings.autoSaveChat) {
            saveMetadata().then(() => {
                toastr.success(`✅ 章节已导入对话框（角色：${charName}）`);
                eventSource.emit(event_types.MESSAGE_RECEIVED, newMessage);
            }).catch(err => {
                toastr.error('❌ 保存聊天失败：' + err.message);
            });
        }
    }

    // -------------------------- 注册自定义斜杠命令 --------------------------
    function registerSlashCommands() {
        // 1. /import-chapter 导入章节
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'import-chapter',
            callback: (namedArgs, unnamedArgs) => {
                const content = unnamedArgs.toString().trim();
                importChapterToChat(content);
                return `✅ 章节导入成功（字符数：${content.length}）`;
            },
            aliases: ['导入章节'],
            returns: '导入结果提示',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: '要导入的章节内容',
                    typeList: ARGUMENT_TYPE.STRING,
                    isRequired: true,
                }),
            ],
            helpString: `
                <div>将小说章节内容导入到聊天对话框</div>
                <div><strong>示例：</strong></div>
                <ul>
                    <li><pre><code>/import-chapter 第一章 清晨，主角走出了家门...</code></pre></li>
                </ul>
            `,
        }));

        // 2. /input 生成角色动作/台词指令
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'input',
            callback: (namedArgs, unnamedArgs) => {
                const charName = characters[characterId]?.name || '角色';
                const prompt = unnamedArgs.toString().replace('{{char}}', charName);
                const sendasCommand = `/sendas name=${charName} ${prompt}`;
                SlashCommandParser.parseCommand(sendasCommand);
                return `✅ 已执行指令：${sendasCommand}`;
            },
            aliases: ['输入'],
            returns: '生成的/sendas指令执行结果',
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: '包含{{char}}的动作/台词模板',
                    typeList: ARGUMENT_TYPE.STRING,
                    isRequired: true,
                }),
            ],
            helpString: `
                <div>生成角色动作/台词并调用/sendas命令</div>
                <div><strong>示例：</strong></div>
                <ul>
                    <li><pre><code>/input 请输入{{char}}的动作或台词：</code></pre></li>
                </ul>
            `,
        }));
    }

    // -------------------------- 初始化UI --------------------------
    function setupUI() {
        // 添加“导入小说”按钮到聊天工具栏
        const toolbar = document.querySelector('.chat-toolbar');
        if (!toolbar) return;

        const importBtn = document.createElement('button');
        importBtn.className = 'btn btn-sm btn-secondary import-novel-btn';
        importBtn.innerText = '导入小说';
        importBtn.style.marginLeft = '8px';

        // 点击按钮触发导入逻辑
        importBtn.addEventListener('click', async () => {
            // 弹出文本输入弹窗
            const novelText = await Popup.show.input(
                '导入小说',
                '粘贴小说文本（会自动拆分章节）：',
                ''
            );

            if (!novelText) return;

            // 拆分章节
            const chapters = splitNovelToChapters(novelText);
            if (chapters.length === 0) {
                toastr.warning('未识别到章节，请检查小说格式或调整正则表达式');
                return;
            }

            // 构建章节选择列表
            const chapterOptions = chapters.map((chap, idx) => `${idx + 1}. ${chap.title}`).join('\n');
            const chapterIndexStr = await Popup.show.input(
                '选择章节',
                `共识别到${chapters.length}个章节，输入序号导入（如1）：\n${chapterOptions}`,
                '1'
            );

            const chapterIndex = Number(chapterIndexStr) - 1;
            if (isNaN(chapterIndex) || chapterIndex < 0 || chapterIndex >= chapters.length) {
                toastr.error('章节序号无效');
                return;
            }

            // 导入选中章节
            const targetChapter = chapters[chapterIndex];
            importChapterToChat(targetChapter.content);
        });

        toolbar.appendChild(importBtn);
    }

    // -------------------------- 初始化流程 --------------------------
    // 等待APP就绪后执行
    if (context.appReady) {
        setupUI();
        registerSlashCommands();
    } else {
        eventSource.on(event_types.APP_READY, () => {
            setupUI();
            registerSlashCommands();
        });
    }

    console.log(`[${MODULE_NAME}] 扩展初始化完成`);
}

// 启动扩展
initExtension().catch(err => {
    console.error(`[${MODULE_NAME}] 初始化失败:`, err);
    toastr.error('小说章节导入扩展初始化失败，请查看控制台日志');
});
