// 扩展唯一标识，避免与其他扩展冲突，建议和你的仓库名一致
const MODULE_NAME = 'novel-chapter-importer';
// 默认配置，支持用户自定义后持久化保存
const defaultSettings = Object.freeze({
    // 默认章节拆分正则，适配绝大多数「第X章」格式的小说，可自定义
    splitRegex: '^\\s*第[0-9一二三四五六七八九十百千]+章.*$',
    // 斜杠命令模板，完全兼容你提供的命令格式，支持变量替换
    // {{char}}=当前角色名，{{content}}=章节内容，{{pipe}}=管道符传参
    sendCommandTemplate: '/sendas name={{char}} {{content}}',
});

// 获取SillyTavern全局上下文，官方推荐的标准用法
const getSTContext = () => SillyTavern.getContext();

// 初始化&校验扩展配置，确保配置持久化
function initSettings() {
    const { extensionSettings } = getSTContext();
    // 初始化配置
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    // 补全更新后新增的配置项，避免版本更新报错
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

// 保存用户自定义配置到ST
function saveSettings() {
    const { saveSettingsDebounced } = getSTContext();
    saveSettingsDebounced();
}

// 获取当前选中的角色名称，用于替换{{char}}变量
function getCurrentCharName() {
    const { characters, characterId } = getSTContext();
    // 处理群聊/未选角色的边界情况
    if (characterId === undefined || !characters[characterId]) {
        return null;
    }
    return characters[characterId].name;
}

// 核心：小说文本章节拆分逻辑
function splitNovelChapters(text, splitRegex) {
    try {
        const regex = new RegExp(splitRegex, 'gm');
        const matches = [...text.matchAll(regex)];
        const chapters = [];

        // 未匹配到章节标题时，全文作为单章节处理
        if (matches.length === 0) {
            chapters.push({
                title: '全文',
                content: text.trim(),
            });
            return chapters;
        }

        // 按章节标题拆分文本，生成章节列表
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const startIndex = match.index;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const fullChapter = text.slice(startIndex, endIndex).trim();
            // 拆分章节标题和正文
            const [title, ...contentLines] = fullChapter.split('\n');
            chapters.push({
                title: title.trim(),
                content: contentLines.join('\n').trim(),
            });
        }

        return chapters;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节拆分失败:`, error);
        alert('章节拆分正则格式错误，请检查后重试');
        return [];
    }
}

// 核心：执行斜杠命令，发送章节内容到对话框
async function executeSendCommand(chapterContent) {
    const settings = initSettings();
    const charName = getCurrentCharName();

    // 前置校验
    if (!charName) {
        alert('请先选择一个角色，再执行导入操作');
        return false;
    }
    if (!chapterContent.trim()) {
        console.warn(`[${MODULE_NAME}] 章节内容为空，跳过发送`);
        return true;
    }

    // 替换命令模板中的变量
    let command = settings.sendCommandTemplate
        .replaceAll('{{char}}', charName)
        .replaceAll('{{content}}', chapterContent)
        .replaceAll('{{pipe}}', chapterContent);

    try {
        const { SlashCommandParser } = getSTContext();
        // 官方标准API，执行斜杠命令
        await SlashCommandParser.parse(command);
        return true;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 命令执行失败:`, error);
        alert(`章节发送失败：${error.message}`);
        return false;
    }
}

// 批量导入章节
async function importChapters(chapters) {
    if (chapters.length === 0) {
        alert('没有可导入的章节');
        return;
    }

    // 二次确认，避免误操作
    if (!confirm(`确定要导入 ${chapters.length} 个章节吗？`)) {
        return;
    }

    let successCount = 0;
    for (const chapter of chapters) {
        const success = await executeSendCommand(chapter.content);
        if (success) {
            successCount++;
        } else {
            // 失败时支持中断/继续
            if (!confirm(`章节「${chapter.title}」导入失败，是否继续导入剩余章节？`)) {
                break;
            }
        }
        // 发送延迟，避免请求过快导致ST处理异常，可自行调整
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    alert(`导入完成！成功导入 ${successCount}/${chapters.length} 个章节`);
}

// 渲染导入面板UI
function renderImportPanel() {
    const settings = initSettings();
    // 面板HTML结构，适配ST原生UI风格
    const panelHtml = `
    <div id="${MODULE_NAME}-panel" class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">小说章节导入助手</h3>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <!-- 文件上传 -->
                <div class="form-group">
                    <label for="${MODULE_NAME}-file">选择小说TXT文件</label>
                    <input type="file" id="${MODULE_NAME}-file" class="form-control" accept=".txt">
                </div>
                <!-- 拆分正则配置 -->
                <div class="form-group">
                    <label for="${MODULE_NAME}-regex">章节拆分正则表达式</label>
                    <input type="text" id="${MODULE_NAME}-regex" class="form-control" value="${settings.splitRegex}">
                    <small class="form-text text-muted">默认匹配「第X章」格式，可自定义适配不同小说标题</small>
                </div>
                <!-- 斜杠命令模板配置 -->
                <div class="form-group">
                    <label for="${MODULE_NAME}-command">发送命令模板</label>
                    <input type="text" id="${MODULE_NAME}-command" class="form-control" value="${settings.sendCommandTemplate}">
                    <small class="form-text text-muted">可用变量：{{char}}=当前角色名，{{content}}/{{pipe}}=章节内容</small>
                </div>
                <button id="${MODULE_NAME}-split" class="btn btn-primary">解析章节</button>
                <hr>
                <!-- 章节预览 -->
                <h4>章节预览</h4>
                <div id="${MODULE_NAME}-chapter-list" class="form-group" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                    <p>请先选择小说文件并点击「解析章节」</p>
                </div>
                <!-- 导入按钮 -->
                <button id="${MODULE_NAME}-import" class="btn btn-success" disabled>导入选中章节</button>
                <button id="${MODULE_NAME}-import-all" class="btn btn-info" disabled>导入全部章节</button>
            </div>
        </div>
    </div>
    `;

    // 将面板插入到页面
    $('body').append(panelHtml);
    const $panel = $(`#${MODULE_NAME}-panel`);
    let currentChapters = []; // 存储当前解析的章节列表

    // 关闭面板事件
    $panel.find('.close, [data-dismiss="modal"]').on('click', () => {
        $panel.modal('hide');
    });

    // 解析章节按钮点击事件
    $panel.find(`#${MODULE_NAME}-split`).on('click', () => {
        const fileInput = $(`#${MODULE_NAME}-file`)[0];
        const file = fileInput.files[0];
        if (!file) {
            alert('请先选择小说TXT文件');
            return;
        }

        // 保存用户自定义配置
        const settings = initSettings();
        settings.splitRegex = $(`#${MODULE_NAME}-regex`).val().trim();
        settings.sendCommandTemplate = $(`#${MODULE_NAME}-command`).val().trim();
        saveSettings();

        // 读取TXT文件内容
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            currentChapters = splitNovelChapters(text, settings.splitRegex);
            
            // 渲染章节列表
            const $list = $(`#${MODULE_NAME}-chapter-list`);
            $list.empty();

            if (currentChapters.length === 0) {
                $list.html('<p>未解析到任何章节，请检查正则表达式是否正确</p>');
                $(`#${MODULE_NAME}-import, #${MODULE_NAME}-import-all`).prop('disabled', true);
                return;
            }

            // 生成章节复选框
            currentChapters.forEach((chapter, index) => {
                $list.append(`
                <div class="form-check">
                    <input class="form-check-input ${MODULE_NAME}-chapter-checkbox" type="checkbox" value="${index}" id="${MODULE_NAME}-chapter-${index}" checked>
                    <label class="form-check-label" for="${MODULE_NAME}-chapter-${index}">
                        ${chapter.title} (${chapter.content.length} 字)
                    </label>
                </div>
                `);
            });

            // 启用导入按钮
            $(`#${MODULE_NAME}-import, #${MODULE_NAME}-import-all`).prop('disabled', false);
        };
        // 兼容中文编码
        reader.readAsText(file, 'utf-8');
    });

    // 导入选中章节
    $panel.find(`#${MODULE_NAME}-import`).on('click', async () => {
        const selectedIndexes = $(`.${MODULE_NAME}-chapter-checkbox:checked`).map((_, el) => parseInt(el.value)).get();
        const selectedChapters = selectedIndexes.map(index => currentChapters[index]);
        await importChapters(selectedChapters);
    });

    // 导入全部章节
    $panel.find(`#${MODULE_NAME}-import-all`).on('click', async () => {
        await importChapters(currentChapters);
    });
}

// 扩展初始化入口
function initExtension() {
    initSettings();
    renderImportPanel();

    // 在ST侧边栏扩展导航区添加入口按钮
    const $sidebar = $('#extensionsNav');
    if ($sidebar.find(`#${MODULE_NAME}-toggle`).length === 0) {
        $sidebar.append(`
        <li id="${MODULE_NAME}-toggle" class="nav-item">
            <a class="nav-link" href="#" data-toggle="modal" data-target="#${MODULE_NAME}-panel">
                <i class="fa fa-book"></i>
                <span>小说导入</span>
            </a>
        </li>
        `);
    }

    console.log(`[${MODULE_NAME}] 扩展初始化完成`);
}

// 官方标准写法：等待ST应用完全加载后，再初始化扩展
const { eventSource, event_types } = getSTContext();
eventSource.on(event_types.APP_READY, initExtension);
