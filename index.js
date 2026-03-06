// ==============================
// 常量定义（唯一命名，避免与其他扩展冲突）
// ==============================
const MODULE_NAME = 'always_remember_me_novel_importer';
const { event_types, SlashCommandParser, SlashCommand, ARGUMENT_TYPE } = SillyTavern.getContext();

// 默认配置（支持持久化保存）
const DEFAULT_SETTINGS = Object.freeze({
    chapterRegex: '第[零一二三四五六七八九十百千\\d]+章.*|楔子|序言|尾声|番外',
    sendCommandTemplate: '/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}',
    sendDelay: 1500,
    autoScroll: true
});

// 全局状态
let currentSettings = {};
let parsedChapters = [];
let selectedChapterIds = new Set();
let isSending = false;

// ==============================
// 初始化入口（官方标准：等待APP_READY事件）
// ==============================
async function initExtension() {
    console.log(`[${MODULE_NAME}] 插件加载中...`);
    loadSettings();
    createExtensionUI();
    registerCustomCommands();
    bindEventListeners();
    console.log(`[${MODULE_NAME}] 插件加载完成`);
    toastr.success('小说章节导入助手加载完成', 'Always Remember Me');
}

// 等待应用完全就绪后初始化
SillyTavern.getContext().eventSource.once(event_types.APP_READY, initExtension);

// ==============================
// 配置管理（官方标准持久化方案）
// ==============================
function loadSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    // 初始化配置，合并默认值（兼容更新后新增配置项）
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }
    currentSettings = extensionSettings[MODULE_NAME];
}

function saveSettings() {
    const { saveSettingsDebounced } = SillyTavern.getContext();
    saveSettingsDebounced();
    toastr.success('配置已保存', 'Always Remember Me');
}

// ==============================
// UI创建（适配酒馆原生界面）
// ==============================
function createExtensionUI() {
    const { DOMPurify } = SillyTavern.libs;
    // 扩展面板HTML
    const panelHTML = `
    <div id="${MODULE_NAME}_panel" class="panel-group">
        <div class="panel-title">
            <span>📖 小说章节导入助手</span>
        </div>
        <div class="panel-body">
            <!-- 文件选择区 -->
            <div class="form-group">
                <label>选择小说TXT文件（UTF-8编码）</label>
                <input type="file" id="${MODULE_NAME}_fileInput" accept=".txt" class="form-control">
            </div>

            <!-- 章节拆分配置 -->
            <div class="form-group">
                <label>章节拆分正则表达式</label>
                <input type="text" id="${MODULE_NAME}_regexInput" class="form-control" 
                    value="${DOMPurify.sanitize(currentSettings.chapterRegex)}">
                <div class="form-text">默认适配绝大多数小说的章节标题格式，可自定义修改</div>
            </div>

            <!-- 发送命令模板 -->
            <div class="form-group">
                <label>发送命令模板</label>
                <textarea id="${MODULE_NAME}_commandInput" class="form-control" rows="2">${DOMPurify.sanitize(currentSettings.sendCommandTemplate)}</textarea>
                <div class="form-text">
                    变量说明：{{char}}=当前角色名，{{pipe}}/{{content}}=章节正文内容<br>
                    你的默认命令：<code>/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}</code>
                </div>
            </div>

            <!-- 发送延迟配置 -->
            <div class="form-group">
                <label>批量发送间隔（毫秒）</label>
                <input type="number" id="${MODULE_NAME}_delayInput" class="form-control" 
                    value="${currentSettings.sendDelay}" min="500" max="5000">
                <div class="form-text">防止刷屏报错，建议1000-2000毫秒</div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex-container" style="gap: 8px; margin: 12px 0;">
                <button id="${MODULE_NAME}_parseBtn" class="menu_button">解析章节</button>
                <button id="${MODULE_NAME}_saveConfigBtn" class="menu_button">保存配置</button>
                <button id="${MODULE_NAME}_selectAllBtn" class="menu_button">全选章节</button>
            </div>

            <!-- 章节列表 -->
            <div class="form-group">
                <label>解析后的章节列表 <span id="${MODULE_NAME}_chapterCount">（共0章）</span></label>
                <div id="${MODULE_NAME}_chapterList" class="scrollable-y" 
                    style="max-height: 300px; border: 1px solid var(--border); border-radius: 4px; padding: 8px;">
                    <div class="text-muted">请先选择小说文件并点击「解析章节」</div>
                </div>
            </div>

            <!-- 导入按钮 -->
            <div class="flex-container" style="gap: 8px; margin-top: 12px;">
                <button id="${MODULE_NAME}_sendSelectedBtn" class="menu_button success" ${isSending ? 'disabled' : ''}>
                    导入选中章节
                </button>
                <button id="${MODULE_NAME}_sendAllBtn" class="menu_button primary" ${isSending ? 'disabled' : ''}>
                    导入全部章节
                </button>
            </div>
        </div>
    </div>
    `;

    // 插入到酒馆的扩展面板区域
    const extensionsTab = document.getElementById('extensions_tab');
    if (extensionsTab) {
        extensionsTab.insertAdjacentHTML('beforeend', panelHTML);
    }

    // 绑定UI事件
    bindUIEvents();
}

// ==============================
// 核心功能：文件解析与章节拆分
// ==============================
// 读取TXT文件
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const { DOMPurify } = SillyTavern.libs;
        // 清理内容，防止XSS
        const rawContent = DOMPurify.sanitize(e.target.result);
        parseChapters(rawContent);
    };
    reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件格式', '错误');
    };
    reader.readAsText(file, 'UTF-8');
}

// 拆分章节
function parseChapters(content) {
    try {
        const regex = new RegExp(`(${currentSettings.chapterRegex})`, 'g');
        const parts = content.split(regex).filter(Boolean);
        parsedChapters = [];

        // 合并标题与正文
        for (let i = 0; i < parts.length; i += 2) {
            const title = parts[i]?.trim() || `未命名章节 ${parsedChapters.length + 1}`;
            const content = parts[i + 1]?.trim() || '';
            if (title && content) {
                parsedChapters.push({
                    id: parsedChapters.length,
                    title: title,
                    content: `${title}\n${content}`
                });
            }
        }

        // 重置选中状态
        selectedChapterIds.clear();
        renderChapterList();
        toastr.success(`成功解析出 ${parsedChapters.length} 章`, '解析完成');
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节解析失败:`, error);
        toastr.error('章节解析失败，请检查正则表达式是否正确', '错误');
    }
}

// 渲染章节列表
function renderChapterList() {
    const listContainer = document.getElementById(`${MODULE_NAME}_chapterList`);
    const countLabel = document.getElementById(`${MODULE_NAME}_chapterCount`);
    const { DOMPurify } = SillyTavern.libs;

    countLabel.textContent = `（共${parsedChapters.length}章）`;

    if (parsedChapters.length === 0) {
        listContainer.innerHTML = '<div class="text-muted">暂无解析后的章节</div>';
        return;
    }

    // 生成列表HTML
    listContainer.innerHTML = parsedChapters.map(chapter => `
    <div class="flex-container align-items-center" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); gap: 8px;">
        <input type="checkbox" id="${MODULE_NAME}_chapter_${chapter.id}" 
            class="form_checkbox" ${selectedChapterIds.has(chapter.id) ? 'checked' : ''}>
        <label for="${MODULE_NAME}_chapter_${chapter.id}" style="flex: 1; margin: 0; cursor: pointer;">
            ${DOMPurify.sanitize(chapter.title)}
        </label>
    </div>
    `).join('');

    // 绑定复选框事件
    parsedChapters.forEach(chapter => {
        const checkbox = document.getElementById(`${MODULE_NAME}_chapter_${chapter.id}`);
        checkbox?.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedChapterIds.add(chapter.id);
            } else {
                selectedChapterIds.delete(chapter.id);
            }
        });
    });
}

// ==============================
// 核心功能：命令执行与章节发送
// ==============================
// 获取当前角色名称
function getCurrentCharName() {
    const { characters, characterId } = SillyTavern.getContext();
    if (characterId === undefined || !characters[characterId]) {
        return null;
    }
    return characters[characterId].name;
}

// 替换模板变量
function renderCommandTemplate(template, chapterContent) {
    const charName = getCurrentCharName();
    if (!charName) {
        throw new Error('未选择有效角色，请先打开一个角色聊天');
    }
    return template
        .replaceAll('{{char}}', charName)
        .replaceAll('{{pipe}}', chapterContent)
        .replaceAll('{{content}}', chapterContent);
}

// 执行单条发送命令
async function sendChapter(chapter) {
    try {
        const charName = getCurrentCharName();
        if (!charName) {
            throw new Error('未选择有效角色');
        }

        // 渲染命令模板
        const command = renderCommandTemplate(currentSettings.sendCommandTemplate, chapter.content);
        console.log(`[${MODULE_NAME}] 执行命令:`, command);

        // 调用酒馆官方斜杠命令解析器执行命令
        await SlashCommandParser.parse(command);

        // 自动滚动到底部
        if (currentSettings.autoScroll) {
            const chatContainer = document.getElementById('chat');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }

        return true;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节发送失败:`, error);
        toastr.error(`「${chapter.title}」发送失败: ${error.message}`, '发送错误');
        return false;
    }
}

// 批量发送章节
async function batchSendChapters(chapters) {
    if (isSending) return;
    if (chapters.length === 0) {
        toastr.warning('请先选择要导入的章节', '提示');
        return;
    }
    if (!getCurrentCharName()) {
        toastr.error('请先打开一个角色聊天窗口，选择有效角色', '错误');
        return;
    }

    // 锁定发送状态
    isSending = true;
    updateSendButtonState();

    let successCount = 0;
    const totalCount = chapters.length;

    try {
        toastr.info(`开始导入 ${totalCount} 章，请勿关闭页面`, '导入中');
        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];
            const success = await sendChapter(chapter);
            if (success) {
                successCount++;
            }
            // 最后一章不需要延迟
            if (i < chapters.length - 1) {
                await new Promise(resolve => setTimeout(resolve, currentSettings.sendDelay));
            }
        }
        toastr.success(`导入完成！成功导入 ${successCount}/${totalCount} 章`, '导入完成');
    } catch (error) {
        console.error(`[${MODULE_NAME}] 批量导入失败:`, error);
        toastr.error(`批量导入失败: ${error.message}`, '错误');
    } finally {
        // 解锁发送状态
        isSending = false;
        updateSendButtonState();
    }
}

// 更新发送按钮状态
function updateSendButtonState() {
    const sendSelectedBtn = document.getElementById(`${MODULE_NAME}_sendSelectedBtn`);
    const sendAllBtn = document.getElementById(`${MODULE_NAME}_sendAllBtn`);
    if (sendSelectedBtn && sendAllBtn) {
        sendSelectedBtn.disabled = isSending;
        sendAllBtn.disabled = isSending;
        sendSelectedBtn.textContent = isSending ? '导入中...' : '导入选中章节';
        sendAllBtn.textContent = isSending ? '导入中...' : '导入全部章节';
    }
}

// ==============================
// 事件绑定
// ==============================
function bindUIEvents() {
    // 文件选择
    document.getElementById(`${MODULE_NAME}_fileInput`).addEventListener('change', handleFileSelect);
    // 解析按钮
    document.getElementById(`${MODULE_NAME}_parseBtn`).addEventListener('click', () => {
        const fileInput = document.getElementById(`${MODULE_NAME}_fileInput`);
        if (!fileInput.files[0]) {
            toastr.warning('请先选择小说TXT文件', '提示');
            return;
        }
        // 更新配置后重新解析
        currentSettings.chapterRegex = document.getElementById(`${MODULE_NAME}_regexInput`).value.trim();
        currentSettings.sendCommandTemplate = document.getElementById(`${MODULE_NAME}_commandInput`).value.trim();
        currentSettings.sendDelay = parseInt(document.getElementById(`${MODULE_NAME}_delayInput`).value) || DEFAULT_SETTINGS.sendDelay;
        saveSettings();
        // 重新触发文件读取
        handleFileSelect({ target: { files: fileInput.files } });
    });
    // 保存配置按钮
    document.getElementById(`${MODULE_NAME}_saveConfigBtn`).addEventListener('click', () => {
        currentSettings.chapterRegex = document.getElementById(`${MODULE_NAME}_regexInput`).value.trim();
        currentSettings.sendCommandTemplate = document.getElementById(`${MODULE_NAME}_commandInput`).value.trim();
        currentSettings.sendDelay = parseInt(document.getElementById(`${MODULE_NAME}_delayInput`).value) || DEFAULT_SETTINGS.sendDelay;
        saveSettings();
    });
    // 全选按钮
    document.getElementById(`${MODULE_NAME}_selectAllBtn`).addEventListener('click', () => {
        if (parsedChapters.length === 0) return;
        const allSelected = selectedChapterIds.size === parsedChapters.length;
        if (allSelected) {
            selectedChapterIds.clear();
        } else {
            parsedChapters.forEach(chapter => selectedChapterIds.add(chapter.id));
        }
        renderChapterList();
    });
    // 导入选中章节
    document.getElementById(`${MODULE_NAME}_sendSelectedBtn`).addEventListener('click', () => {
        const selectedChapters = parsedChapters.filter(chapter => selectedChapterIds.has(chapter.id));
        batchSendChapters(selectedChapters);
    });
    // 导入全部章节
    document.getElementById(`${MODULE_NAME}_sendAllBtn`).addEventListener('click', () => {
        batchSendChapters([...parsedChapters]);
    });
}

function bindEventListeners() {
    // 切换聊天时重置状态
    const { eventSource } = SillyTavern.getContext();
    eventSource.on(event_types.CHAT_CHANGED, () => {
        selectedChapterIds.clear();
        renderChapterList();
    });
}

// ==============================
// 注册自定义斜杠命令（官方新标准）
// ==============================
function registerCustomCommands() {
    // 注册快速导入命令
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'novel-import',
        callback: async () => {
            document.getElementById(`${MODULE_NAME}_fileInput`)?.click();
            return '已打开小说文件选择窗口';
        },
        aliases: ['导入小说'],
        returns: '操作提示',
        helpString: `
            <div>快速打开小说章节导入助手的文件选择窗口</div>
            <div><strong>示例:</strong> <pre><code class="language-stscript">/novel-import</code></pre></div>
        `,
    }));
}
