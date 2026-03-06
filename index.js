// ==============================
// 官方规范：唯一模块标识，避免和其他扩展冲突
// ==============================
const MODULE_NAME = 'always_remember_me';
const context = SillyTavern.getContext();
const { event_types, SlashCommandParser, lodash } = context;
const { DOMPurify } = SillyTavern.libs;

// ==============================
// 官方规范：默认配置 + 持久化逻辑（完全匹配官方文档示例）
// ==============================
const DEFAULT_SETTINGS = Object.freeze({
    chapterRegex: '第[零一二三四五六七八九十百千\\d]+章.*|楔子|序言|尾声|番外',
    sendCommand: '/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}',
    sendInterval: 1500
});

let currentSettings = {};
let parsedChapters = [];
let selectedChapters = new Set();
let isSending = false;

// 官方规范：加载并初始化配置
function loadSettings() {
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    // 合并默认配置，兼容版本更新新增字段
    currentSettings = lodash.merge(
        structuredClone(DEFAULT_SETTINGS),
        context.extensionSettings[MODULE_NAME]
    );
    console.log(`[${MODULE_NAME}] 配置加载完成`, currentSettings);
}

// 官方规范：保存配置
function saveSettings() {
    context.extensionSettings[MODULE_NAME] = currentSettings;
    context.saveSettingsDebounced();
    console.log(`[${MODULE_NAME}] 配置已保存`);
    toastr.success('配置已保存', MODULE_NAME);
}

// ==============================
// 核心功能：小说文件读取与章节拆分
// ==============================
// 读取TXT文件
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const rawText = DOMPurify.sanitize(e.target.result);
        splitChapters(rawText);
    };
    reader.onerror = () => {
        console.error(`[${MODULE_NAME}] 文件读取失败`);
        toastr.error('文件读取失败，请检查TXT文件编码（需UTF-8）', '错误');
    };
    reader.readAsText(file, 'UTF-8');
}

// 按正则拆分章节
function splitChapters(text) {
    try {
        const chapterReg = new RegExp(`(${currentSettings.chapterRegex})`, 'g');
        const contentParts = text.split(chapterReg).filter(Boolean);
        parsedChapters = [];

        for (let i = 0; i < contentParts.length; i += 2) {
            const title = contentParts[i]?.trim() || `未命名章节 ${parsedChapters.length + 1}`;
            const content = contentParts[i + 1]?.trim() || '';
            if (content) {
                parsedChapters.push({
                    id: parsedChapters.length,
                    title: title,
                    fullContent: `${title}\n${content}`
                });
            }
        }

        selectedChapters.clear();
        renderChapterList();
        console.log(`[${MODULE_NAME}] 章节解析完成，共${parsedChapters.length}章`);
        toastr.success(`成功解析出 ${parsedChapters.length} 章`, '解析完成');
    } catch (err) {
        console.error(`[${MODULE_NAME}] 章节拆分失败`, err);
        toastr.error('章节拆分失败，请检查正则表达式格式', '错误');
    }
}

// 渲染章节列表
function renderChapterList() {
    const listContainer = document.getElementById(`${MODULE_NAME}_chapter_list`);
    const countLabel = document.getElementById(`${MODULE_NAME}_chapter_count`);

    countLabel.textContent = `共 ${parsedChapters.length} 章`;
    if (parsedChapters.length === 0) {
        listContainer.innerHTML = '<div style="padding: 8px; color: var(--text-muted);">暂无解析后的章节，请先上传小说文件</div>';
        return;
    }

    listContainer.innerHTML = parsedChapters.map(chapter => `
    <div style="display: flex; align-items: center; gap: 8px; padding: 6px 4px; border-bottom: 1px solid var(--border-light);">
        <input type="checkbox" id="${MODULE_NAME}_check_${chapter.id}" class="form_checkbox" ${selectedChapters.has(chapter.id) ? 'checked' : ''}>
        <label for="${MODULE_NAME}_check_${chapter.id}" style="flex: 1; margin: 0; cursor: pointer;">${DOMPurify.sanitize(chapter.title)}</label>
    </div>
    `).join('');

    // 绑定复选框事件
    parsedChapters.forEach(chapter => {
        document.getElementById(`${MODULE_NAME}_check_${chapter.id}`).addEventListener('change', (e) => {
            e.target.checked ? selectedChapters.add(chapter.id) : selectedChapters.delete(chapter.id);
        });
    });
}

// ==============================
// 核心功能：执行斜杠命令发送章节（完全调用酒馆原生命令）
// ==============================
// 获取当前角色名称
function getCurrentChar() {
    const { characters, characterId } = context;
    if (characterId === undefined || !characters[characterId]) {
        return null;
    }
    return characters[characterId].name;
}

// 渲染命令模板，替换变量
function renderCommand(chapterContent) {
    const charName = getCurrentChar();
    if (!charName) {
        throw new Error('未选择有效角色，请先打开角色聊天窗口');
    }
    return currentSettings.sendCommand
        .replaceAll('{{char}}', charName)
        .replaceAll('{{pipe}}', chapterContent)
        .replaceAll('{{content}}', chapterContent);
}

// 执行单条章节发送
async function sendSingleChapter(chapter) {
    try {
        const finalCommand = renderCommand(chapter.fullContent);
        console.log(`[${MODULE_NAME}] 执行原生命令:`, finalCommand);
        
        // 官方规范：直接调用酒馆原生斜杠命令解析器，支持管道符|
        await SlashCommandParser.parse(finalCommand);
        return true;
    } catch (err) {
        console.error(`[${MODULE_NAME}] 章节「${chapter.title}」发送失败`, err);
        toastr.error(`「${chapter.title}」发送失败: ${err.message}`, '发送错误');
        return false;
    }
}

// 批量发送章节
async function batchSendChapters(targetChapters) {
    if (isSending) return;
    if (targetChapters.length === 0) {
        toastr.warning('请先选择要发送的章节', '提示');
        return;
    }
    if (!getCurrentChar()) {
        toastr.error('请先打开一个角色聊天窗口，选择有效角色', '错误');
        return;
    }

    isSending = true;
    updateButtonState();
    let successCount = 0;
    const total = targetChapters.length;

    try {
        toastr.info(`开始发送 ${total} 章，请勿关闭页面`, '发送中');
        console.log(`[${MODULE_NAME}] 开始批量发送，共${total}章`);

        for (let i = 0; i < targetChapters.length; i++) {
            const success = await sendSingleChapter(targetChapters[i]);
            success && successCount++;
            // 非最后一章添加发送间隔，防止刷屏
            if (i < targetChapters.length - 1) {
                await new Promise(resolve => setTimeout(resolve, currentSettings.sendInterval));
            }
        }

        toastr.success(`发送完成！成功 ${successCount}/${total} 章`, '完成');
        console.log(`[${MODULE_NAME}] 批量发送完成，成功${successCount}章`);
    } catch (err) {
        console.error(`[${MODULE_NAME}] 批量发送失败`, err);
        toastr.error(`批量发送失败: ${err.message}`, '错误');
    } finally {
        isSending = false;
        updateButtonState();
    }
}

// 更新按钮状态
function updateButtonState() {
    const sendSelectedBtn = document.getElementById(`${MODULE_NAME}_send_selected`);
    const sendAllBtn = document.getElementById(`${MODULE_NAME}_send_all`);
    if (!sendSelectedBtn || !sendAllBtn) return;

    sendSelectedBtn.disabled = isSending;
    sendAllBtn.disabled = isSending;
    sendSelectedBtn.textContent = isSending ? '发送中...' : '发送选中章节';
    sendAllBtn.textContent = isSending ? '发送中...' : '发送全部章节';
}

// ==============================
// 官方规范：创建UI面板（匹配基础模板的设置面板写法）
// ==============================
function createExtensionUI() {
    // 扩展面板HTML，完全适配酒馆原生样式类
    const panelHTML = `
    <div id="${MODULE_NAME}_panel" class="panel-group">
        <div class="panel-title">
            <span>📖 Always Remember Me - 小说章节导入</span>
        </div>
        <div class="panel-body">
            <!-- 1. 文件上传 -->
            <div class="form-group">
                <label>选择小说TXT文件（UTF-8编码）</label>
                <input type="file" id="${MODULE_NAME}_file_input" accept=".txt" class="form-control">
            </div>

            <!-- 2. 章节拆分配置 -->
            <div class="form-group">
                <label>章节拆分正则表达式</label>
                <input type="text" id="${MODULE_NAME}_regex_input" class="form-control" 
                    value="${DOMPurify.sanitize(currentSettings.chapterRegex)}">
                <small class="form-text text-muted">默认适配绝大多数小说章节格式，可自定义修改</small>
            </div>

            <!-- 3. 发送命令配置（你的需求默认值） -->
            <div class="form-group">
                <label>发送命令模板</label>
                <textarea id="${MODULE_NAME}_command_input" class="form-control" rows="2">${DOMPurify.sanitize(currentSettings.sendCommand)}</textarea>
                <small class="form-text text-muted">
                    变量：{{char}}=当前角色名，{{pipe}}/{{content}}=章节正文<br>
                    你的默认命令：<code>/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}</code>
                </small>
            </div>

            <!-- 4. 发送间隔配置 -->
            <div class="form-group">
                <label>批量发送间隔（毫秒）</label>
                <input type="number" id="${MODULE_NAME}_interval_input" class="form-control" 
                    value="${currentSettings.sendInterval}" min="500" max="5000">
                <small class="form-text text-muted">防止刷屏报错，建议1000-2000毫秒</small>
            </div>

            <!-- 操作按钮 -->
            <div class="flex-container" style="gap: 8px; margin: 12px 0;">
                <button id="${MODULE_NAME}_parse_btn" class="menu_button">解析章节</button>
                <button id="${MODULE_NAME}_save_btn" class="menu_button">保存配置</button>
                <button id="${MODULE_NAME}_select_all_btn" class="menu_button">全选/反选</button>
            </div>

            <!-- 章节列表 -->
            <div class="form-group">
                <label>章节列表 <span id="${MODULE_NAME}_chapter_count" class="text-muted">（共0章）</span></label>
                <div id="${MODULE_NAME}_chapter_list" class="scrollable-y" 
                    style="max-height: 300px; border: 1px solid var(--border); border-radius: 4px; padding: 8px;">
                    <div style="color: var(--text-muted);">请先上传小说文件并点击「解析章节」</div>
                </div>
            </div>

            <!-- 发送按钮 -->
            <div class="flex-container" style="gap: 8px; margin-top: 12px;">
                <button id="${MODULE_NAME}_send_selected" class="menu_button success">发送选中章节</button>
                <button id="${MODULE_NAME}_send_all" class="menu_button primary">发送全部章节</button>
            </div>
        </div>
    </div>
    `;

    // 官方规范：插入到酒馆扩展设置面板，确保DOM存在
    const extensionsContainer = document.getElementById('extensions_settings');
    if (extensionsContainer) {
        extensionsContainer.insertAdjacentHTML('beforeend', panelHTML);
        console.log(`[${MODULE_NAME}] UI面板创建成功`);
        bindUIEvents();
    } else {
        console.error(`[${MODULE_NAME}] 未找到扩展面板容器，UI创建失败`);
        toastr.error('扩展面板加载失败，请刷新页面重试', '错误');
    }
}

// ==============================
// UI事件绑定
// ==============================
function bindUIEvents() {
    // 文件上传
    document.getElementById(`${MODULE_NAME}_file_input`).addEventListener('change', handleFileUpload);

    // 解析章节按钮
    document.getElementById(`${MODULE_NAME}_parse_btn`).addEventListener('click', () => {
        const fileInput = document.getElementById(`${MODULE_NAME}_file_input`);
        if (!fileInput.files[0]) {
            toastr.warning('请先选择小说TXT文件', '提示');
            return;
        }
        // 更新配置后重新解析
        currentSettings.chapterRegex = document.getElementById(`${MODULE_NAME}_regex_input`).value.trim();
        currentSettings.sendCommand = document.getElementById(`${MODULE_NAME}_command_input`).value.trim();
        currentSettings.sendInterval = parseInt(document.getElementById(`${MODULE_NAME}_interval_input`).value) || DEFAULT_SETTINGS.sendInterval;
        saveSettings();
        // 重新触发文件解析
        handleFileUpload({ target: { files: fileInput.files } });
    });

    // 保存配置按钮
    document.getElementById(`${MODULE_NAME}_save_btn`).addEventListener('click', () => {
        currentSettings.chapterRegex = document.getElementById(`${MODULE_NAME}_regex_input`).value.trim();
        currentSettings.sendCommand = document.getElementById(`${MODULE_NAME}_command_input`).value.trim();
        currentSettings.sendInterval = parseInt(document.getElementById(`${MODULE_NAME}_interval_input`).value) || DEFAULT_SETTINGS.sendInterval;
        saveSettings();
    });

    // 全选/反选按钮
    document.getElementById(`${MODULE_NAME}_select_all_btn`).addEventListener('click', () => {
        if (parsedChapters.length === 0) return;
        const isAllSelected = selectedChapters.size === parsedChapters.length;
        isAllSelected ? selectedChapters.clear() : parsedChapters.forEach(chap => selectedChapters.add(chap.id));
        renderChapterList();
    });

    // 发送选中章节
    document.getElementById(`${MODULE_NAME}_send_selected`).addEventListener('click', () => {
        const targetChapters = parsedChapters.filter(chap => selectedChapters.has(chap.id));
        batchSendChapters(targetChapters);
    });

    // 发送全部章节
    document.getElementById(`${MODULE_NAME}_send_all`).addEventListener('click', () => {
        batchSendChapters([...parsedChapters]);
    });

    // 切换聊天时重置选中状态
    context.eventSource.on(event_types.CHAT_CHANGED, () => {
        selectedChapters.clear();
        renderChapterList();
    });
}

// ==============================
// 官方规范：插件初始化入口（APP_READY事件触发，确保应用完全加载）
// ==============================
function initExtension() {
    console.log(`[${MODULE_NAME}] 开始初始化插件`);
    loadSettings();
    createExtensionUI();
    console.log(`[${MODULE_NAME}] 插件初始化完成！`);
    toastr.success('小说章节导入插件加载完成', 'Always Remember Me');
}

// 官方规范：等待应用完全就绪后执行初始化（和基础模板完全一致）
context.eventSource.once(event_types.APP_READY, initExtension);
