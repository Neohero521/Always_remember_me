// 扩展唯一标识，避免与其他扩展冲突
const MODULE_NAME = 'novel-chapter-importer';
// 默认配置
const defaultSettings = Object.freeze({
    splitRegex: '^\\s*第[0-9一二三四五六七八九十百千]+章.*$',
    sendCommandTemplate: '/sendas name={{char}} {{content}}',
});

// 兼容获取ST全局上下文
const getSTContext = () => {
    if (typeof SillyTavern !== 'undefined') {
        return SillyTavern.getContext?.() || SillyTavern;
    }
    console.error(`[${MODULE_NAME}] 未获取到SillyTavern上下文`);
    return null;
};

// 初始化配置
function initSettings() {
    const context = getSTContext();
    if (!context) return defaultSettings;

    const { extensionSettings } = context;
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

// 保存配置
function saveSettings() {
    const context = getSTContext();
    if (!context) return;
    context.saveSettingsDebounced?.();
}

// 获取当前角色名
function getCurrentCharName() {
    const context = getSTContext();
    if (!context) return null;
    const { characters, characterId } = context;
    if (characterId === undefined || !characters[characterId]) return null;
    return characters[characterId].name;
}

// 章节拆分
function splitNovelChapters(text, splitRegex) {
    try {
        const regex = new RegExp(splitRegex, 'gm');
        const matches = [...text.matchAll(regex)];
        const chapters = [];

        if (matches.length === 0) {
            chapters.push({ title: '全文', content: text.trim() });
            return chapters;
        }

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const startIndex = match.index;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const fullChapter = text.slice(startIndex, endIndex).trim();
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

// 执行发送命令
async function executeSendCommand(chapterContent) {
    const settings = initSettings();
    const charName = getCurrentCharName();

    if (!charName) {
        alert('请先选择一个角色，再执行导入操作');
        return false;
    }
    if (!chapterContent.trim()) {
        console.warn(`[${MODULE_NAME}] 章节内容为空，跳过发送`);
        return true;
    }

    let command = settings.sendCommandTemplate
        .replaceAll('{{char}}', charName)
        .replaceAll('{{content}}', chapterContent)
        .replaceAll('{{pipe}}', chapterContent);

    try {
        const context = getSTContext();
        const { SlashCommandParser } = context;
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
    if (!confirm(`确定要导入 ${chapters.length} 个章节吗？`)) {
        return;
    }

    let successCount = 0;
    for (const chapter of chapters) {
        const success = await executeSendCommand(chapter.content);
        if (success) {
            successCount++;
        } else {
            if (!confirm(`章节「${chapter.title}」导入失败，是否继续导入剩余章节？`)) {
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    alert(`导入完成！成功导入 ${successCount}/${chapters.length} 个章节`);
}

// 渲染导入面板
function renderImportPanel() {
    // 避免重复渲染面板
    if ($(`#${MODULE_NAME}-panel`).length > 0) return;

    const settings = initSettings();
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
                <div class="form-group">
                    <label for="${MODULE_NAME}-file">选择小说TXT文件</label>
                    <input type="file" id="${MODULE_NAME}-file" class="form-control" accept=".txt">
                </div>
                <div class="form-group">
                    <label for="${MODULE_NAME}-regex">章节拆分正则表达式</label>
                    <input type="text" id="${MODULE_NAME}-regex" class="form-control" value="${settings.splitRegex}">
                    <small class="form-text text-muted">默认匹配「第X章」格式，可自定义适配不同小说标题</small>
                </div>
                <div class="form-group">
                    <label for="${MODULE_NAME}-command">发送命令模板</label>
                    <input type="text" id="${MODULE_NAME}-command" class="form-control" value="${settings.sendCommandTemplate}">
                    <small class="form-text text-muted">可用变量：{{char}}=当前角色名，{{content}}/{{pipe}}=章节内容</small>
                </div>
                <button id="${MODULE_NAME}-split" class="btn btn-primary">解析章节</button>
                <hr>
                <h4>章节预览</h4>
                <div id="${MODULE_NAME}-chapter-list" class="form-group" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                    <p>请先选择小说文件并点击「解析章节」</p>
                </div>
                <button id="${MODULE_NAME}-import" class="btn btn-success" disabled>导入选中章节</button>
                <button id="${MODULE_NAME}-import-all" class="btn btn-info" disabled>导入全部章节</button>
            </div>
        </div>
    </div>
    `;

    $('body').append(panelHtml);
    const $panel = $(`#${MODULE_NAME}-panel`);
    let currentChapters = [];

    // 关闭面板
    $panel.find('.close, [data-dismiss="modal"]').on('click', () => {
        $panel.modal('hide');
    });

    // 解析章节
    $panel.find(`#${MODULE_NAME}-split`).on('click', () => {
        const fileInput = $(`#${MODULE_NAME}-file`)[0];
        const file = fileInput.files[0];
        if (!file) {
            alert('请先选择小说TXT文件');
            return;
        }

        const settings = initSettings();
        settings.splitRegex = $(`#${MODULE_NAME}-regex`).val().trim();
        settings.sendCommandTemplate = $(`#${MODULE_NAME}-command`).val().trim();
        saveSettings();

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            currentChapters = splitNovelChapters(text, settings.splitRegex);
            
            const $list = $(`#${MODULE_NAME}-chapter-list`);
            $list.empty();

            if (currentChapters.length === 0) {
                $list.html('<p>未解析到任何章节，请检查正则表达式是否正确</p>');
                $(`#${MODULE_NAME}-import, #${MODULE_NAME}-import-all`).prop('disabled', true);
                return;
            }

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

            $(`#${MODULE_NAME}-import, #${MODULE_NAME}-import-all`).prop('disabled', false);
        };
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

    console.log(`[${MODULE_NAME}] 面板渲染完成`);
}

// 添加侧边栏按钮（兼容多版本）
function addSidebarButton() {
    // 兼容多个常见的侧边栏扩展导航容器ID
    const sidebarSelectors = [
        '#extensionsNav',
        '#extensions-sidebar',
        '.extensions-nav-list',
        '#nav_extensionsList',
        '.sidebar-content'
    ];

    let $sidebar = null;
    for (const selector of sidebarSelectors) {
        const $target = $(selector);
        if ($target.length > 0) {
            $sidebar = $target;
            break;
        }
    }

    // 没找到侧边栏容器，输出日志，走兜底入口
    if (!$sidebar || $sidebar.length === 0) {
        console.warn(`[${MODULE_NAME}] 未找到侧边栏容器，已启用兜底入口`);
        return;
    }

    // 避免重复添加按钮
    if ($sidebar.find(`#${MODULE_NAME}-toggle`).length === 0) {
        $sidebar.append(`
        <li id="${MODULE_NAME}-toggle" class="nav-item">
            <a class="nav-link" href="#" data-toggle="modal" data-target="#${MODULE_NAME}-panel">
                <i class="fa fa-book"></i>
                <span>小说导入</span>
            </a>
        </li>
        `);
        console.log(`[${MODULE_NAME}] 侧边栏按钮添加成功`);
    }
}

// 添加兜底入口：扩展设置面板里的打开按钮
function addFallbackEntry() {
    const context = getSTContext();
    if (!context) return;

    // 监听扩展设置面板打开事件，添加按钮
    const { eventSource, event_types } = context;
    eventSource?.on(event_types.SETTINGS_UPDATED, () => {
        const $extensionSettings = $('#extension_settings');
        if ($extensionSettings.length > 0 && $extensionSettings.find(`#${MODULE_NAME}-open-btn`).length === 0) {
            $extensionSettings.append(`
            <div class="panel panel-default" id="${MODULE_NAME}-settings">
                <div class="panel-heading">小说章节导入助手</div>
                <div class="panel-body">
                    <button id="${MODULE_NAME}-open-btn" class="btn btn-primary" data-toggle="modal" data-target="#${MODULE_NAME}-panel">
                        打开小说导入面板
                    </button>
                </div>
            </div>
            `);
        }
    });
}

// 扩展主初始化
function initExtension() {
    const context = getSTContext();
    if (!context) {
        console.error(`[${MODULE_NAME}] 初始化失败：未获取到SillyTavern上下文`);
        return;
    }

    initSettings();
    renderImportPanel();
    addSidebarButton();
    addFallbackEntry();

    console.log(`[${MODULE_NAME}] 扩展初始化完成`);
}

// 等待ST应用完全加载后初始化（官方标准写法，避免提前执行报错）
const context = getSTContext();
if (context?.eventSource && context?.event_types) {
    context.eventSource.on(context.event_types.APP_READY, initExtension);
} else {
    // 兜底：延迟初始化，避免上下文还没加载
    setTimeout(() => {
        const retryContext = getSTContext();
        if (retryContext?.eventSource && retryContext?.event_types) {
            retryContext.eventSource.on(retryContext.event_types.APP_READY, initExtension);
        } else {
            console.error(`[${MODULE_NAME}] 初始化失败：SillyTavern全局对象不存在`);
        }
    }, 1000);
}
