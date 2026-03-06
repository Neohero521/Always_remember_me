// 官方规范：扩展唯一标识，必须全局唯一，避免和其他扩展冲突
const MODULE_NAME = 'always_remember_me_novel_importer';
// 官方规范：默认配置，使用structuredClone深拷贝，符合ST持久化规则
const defaultSettings = Object.freeze({
    splitRegex: '^\\s*第[0-9一二三四五六七八九十百千]+章.*$',
    // 直接适配你需要的斜杠命令，无需用户手动修改
    sendCommandTemplate: '/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}',
    sendDelay: 800
});

// 官方规范：唯一正确的ST上下文获取方式，文档明确要求必须用此方法
const getSTContext = () => {
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
        return SillyTavern.getContext();
    }
    console.error(`[${MODULE_NAME}] 错误：未获取到SillyTavern官方上下文`);
    return null;
};

// 官方规范：扩展设置初始化&持久化，完全对齐文档的settings管理规则
function initExtensionSettings() {
    const context = getSTContext();
    if (!context || !context.extensionSettings) return structuredClone(defaultSettings);

    // 官方规范：初始化设置，避免和其他扩展冲突
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    // 官方规范：版本更新后补全新增配置项，避免key缺失报错
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
            context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    return context.extensionSettings[MODULE_NAME];
}

// 官方规范：保存设置，使用文档指定的saveSettingsDebounced方法
function saveExtensionSettings() {
    const context = getSTContext();
    if (context?.saveSettingsDebounced) {
        context.saveSettingsDebounced();
        console.log(`[${MODULE_NAME}] 设置已保存`);
    }
}

// 获取当前角色名称，适配单聊/群聊场景
function getCurrentCharacterName() {
    const context = getSTContext();
    if (!context) return null;
    const { characters, characterId, groupId } = context;

    // 群聊场景兼容
    if (groupId !== undefined && groupId !== null) {
        const currentGroup = context.groups.find(g => g.id === groupId);
        if (currentGroup?.members?.length > 0) {
            const mainCharId = currentGroup.members[0];
            return characters[mainCharId]?.name || null;
        }
    }

    // 单聊场景
    if (characterId !== undefined && characters[characterId]) {
        return characters[characterId].name;
    }

    return null;
}

// 章节拆分核心逻辑
function splitNovelIntoChapters(text, splitRegex) {
    try {
        const regex = new RegExp(splitRegex, 'gm');
        const matches = [...text.matchAll(regex)];
        const chapters = [];

        // 无匹配章节时，全文作为单章节
        if (matches.length === 0) {
            chapters.push({
                title: '全文',
                content: text.trim()
            });
            return chapters;
        }

        // 按章节标题拆分文本
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const startIndex = match.index;
            const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const fullChapterText = text.slice(startIndex, endIndex).trim();
            const [titleLine, ...contentLines] = fullChapterText.split('\n');

            chapters.push({
                title: titleLine.trim(),
                content: contentLines.join('\n').trim()
            });
        }

        console.log(`[${MODULE_NAME}] 成功拆分${chapters.length}个章节`);
        return chapters;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节拆分失败:`, error);
        alert('章节拆分正则表达式格式错误，请检查后重试');
        return [];
    }
}

// 执行斜杠命令发送章节内容
async function sendChapterContent(chapterContent) {
    const settings = initExtensionSettings();
    const charName = getCurrentCharacterName();

    // 前置校验
    if (!charName) {
        alert('请先选择一个角色/群聊，再执行导入操作');
        return false;
    }
    if (!chapterContent.trim()) {
        console.warn(`[${MODULE_NAME}] 章节内容为空，已跳过`);
        return true;
    }

    // 替换模板变量
    let finalCommand = settings.sendCommandTemplate
        .replaceAll('{{char}}', charName)
        .replaceAll('{{content}}', chapterContent)
        .replaceAll('{{pipe}}', chapterContent);

    try {
        const context = getSTContext();
        // 官方规范：使用ST内置的SlashCommandParser执行斜杠命令
        if (!context.SlashCommandParser) {
            throw new Error('未获取到ST斜杠命令解析器，请检查ST版本是否支持');
        }

        await context.SlashCommandParser.parse(finalCommand);
        console.log(`[${MODULE_NAME}] 章节发送成功`);
        return true;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 命令执行失败:`, error);
        alert(`章节发送失败：${error.message}`);
        return false;
    }
}

// 批量导入章节
async function batchImportChapters(chapters) {
    if (chapters.length === 0) {
        alert('没有可导入的章节，请先解析小说文件');
        return;
    }

    if (!confirm(`确定要导入 ${chapters.length} 个章节吗？导入过程中请勿关闭页面`)) {
        return;
    }

    const settings = initExtensionSettings();
    let successCount = 0;

    for (const chapter of chapters) {
        const isSuccess = await sendChapterContent(chapter.content);
        if (isSuccess) {
            successCount++;
        } else {
            const isContinue = confirm(`章节「${chapter.title}」导入失败，是否继续导入剩余章节？`);
            if (!isContinue) break;
        }
        // 防刷屏延迟，避免请求过快
        await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
    }

    alert(`导入完成！成功导入 ${successCount}/${chapters.length} 个章节`);
}

// 渲染导入面板（官方规范：模态框结构对齐ST原生UI）
function renderImportModal() {
    // 避免重复渲染面板
    if ($(`#${MODULE_NAME}_modal`).length > 0) {
        console.log(`[${MODULE_NAME}] 面板已存在，无需重复渲染`);
        return;
    }

    const settings = initExtensionSettings();
    // 模态框HTML完全对齐ST原生UI规范
    const modalHtml = `
    <div class="modal fade" id="${MODULE_NAME}_modal" tabindex="-1" role="dialog" aria-hidden="true">
        <div class="modal-dialog modal-lg" role="document">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">小说章节导入助手</h5>
                    <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>
                <div class="modal-body">
                    <!-- 文件上传区域 -->
                    <div class="form-group">
                        <label for="${MODULE_NAME}_file_input">选择小说TXT文件</label>
                        <input type="file" class="form-control" id="${MODULE_NAME}_file_input" accept=".txt">
                        <small class="form-text text-muted">支持UTF-8编码的TXT小说文件</small>
                    </div>

                    <!-- 拆分规则配置 -->
                    <div class="form-group">
                        <label for="${MODULE_NAME}_regex_input">章节拆分正则表达式</label>
                        <input type="text" class="form-control" id="${MODULE_NAME}_regex_input" value="${settings.splitRegex}">
                        <small class="form-text text-muted">默认匹配「第X章」格式，可自定义适配不同小说的标题规则</small>
                    </div>

                    <!-- 发送命令配置 -->
                    <div class="form-group">
                        <label for="${MODULE_NAME}_command_input">发送命令模板</label>
                        <input type="text" class="form-control" id="${MODULE_NAME}_command_input" value="${settings.sendCommandTemplate}">
                        <small class="form-text text-muted">可用变量：{{char}}=当前角色名，{{content}}/{{pipe}}=章节正文内容</small>
                    </div>

                    <!-- 发送延迟配置 -->
                    <div class="form-group">
                        <label for="${MODULE_NAME}_delay_input">发送间隔（毫秒）</label>
                        <input type="number" class="form-control" id="${MODULE_NAME}_delay_input" value="${settings.sendDelay}" min="200" max="5000">
                        <small class="form-text text-muted">数值越大，发送越慢，越不容易触发刷屏限制</small>
                    </div>

                    <button class="btn btn-primary w-100 mb-3" id="${MODULE_NAME}_parse_btn">解析章节</button>

                    <!-- 章节预览区域 -->
                    <div class="form-group">
                        <label>章节预览</label>
                        <div id="${MODULE_NAME}_chapter_list" style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 10px;">
                            <p class="text-muted text-center m-0">请先选择小说文件并点击「解析章节」</p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" data-dismiss="modal">关闭</button>
                    <button class="btn btn-success" id="${MODULE_NAME}_import_selected_btn" disabled>导入选中章节</button>
                    <button class="btn btn-info" id="${MODULE_NAME}_import_all_btn" disabled>导入全部章节</button>
                </div>
            </div>
        </div>
    </div>
    `;

    // 插入到页面body末尾，符合ST模态框规范
    $('body').append(modalHtml);
    console.log(`[${MODULE_NAME}] 导入面板渲染完成`);

    // 缓存当前解析的章节列表
    let currentChapterList = [];
    const $modal = $(`#${MODULE_NAME}_modal`);

    // 解析章节按钮事件
    $modal.find(`#${MODULE_NAME}_parse_btn`).on('click', () => {
        const fileInput = $(`#${MODULE_NAME}_file_input`)[0];
        const file = fileInput.files[0];

        if (!file) {
            alert('请先选择小说TXT文件');
            return;
        }

        // 保存用户自定义配置
        const settings = initExtensionSettings();
        settings.splitRegex = $(`#${MODULE_NAME}_regex_input`).val().trim();
        settings.sendCommandTemplate = $(`#${MODULE_NAME}_command_input`).val().trim();
        settings.sendDelay = parseInt($(`#${MODULE_NAME}_delay_input`).val()) || 800;
        saveExtensionSettings();

        // 读取TXT文件内容
        const fileReader = new FileReader();
        fileReader.onload = (e) => {
            const fileContent = e.target.result;
            currentChapterList = splitNovelIntoChapters(fileContent, settings.splitRegex);
            const $chapterList = $(`#${MODULE_NAME}_chapter_list`);
            $chapterList.empty();

            if (currentChapterList.length === 0) {
                $chapterList.html('<p class="text-muted text-center m-0">未解析到任何章节，请检查正则表达式是否正确</p>');
                $modal.find(`#${MODULE_NAME}_import_selected_btn, #${MODULE_NAME}_import_all_btn`).prop('disabled', true);
                return;
            }

            // 渲染章节复选框列表
            currentChapterList.forEach((chapter, index) => {
                $chapterList.append(`
                <div class="form-check mb-2">
                    <input class="form-check-input ${MODULE_NAME}_chapter_checkbox" type="checkbox" value="${index}" id="${MODULE_NAME}_chapter_${index}" checked>
                    <label class="form-check-label" for="${MODULE_NAME}_chapter_${index}">
                        ${chapter.title} <span class="text-muted">(${chapter.content.length} 字)</span>
                    </label>
                </div>
                `);
            });

            // 启用导入按钮
            $modal.find(`#${MODULE_NAME}_import_selected_btn, #${MODULE_NAME}_import_all_btn`).prop('disabled', false);
        };

        // 兼容中文编码
        fileReader.readAsText(file, 'utf-8');
    });

    // 导入选中章节
    $modal.find(`#${MODULE_NAME}_import_selected_btn`).on('click', async () => {
        const selectedIndexes = $(`.${MODULE_NAME}_chapter_checkbox:checked`).map((_, el) => parseInt(el.value)).get();
        const selectedChapters = selectedIndexes.map(index => currentChapterList[index]);
        await batchImportChapters(selectedChapters);
    });

    // 导入全部章节
    $modal.find(`#${MODULE_NAME}_import_all_btn`).on('click', async () => {
        await batchImportChapters(currentChapterList);
    });
}

// 挂载侧边栏按钮（兼容所有ST主流版本，对齐官方扩展规范）
function mountSidebarButton() {
    // 官方所有版本的侧边栏扩展容器选择器，按优先级排序
    const sidebarContainerSelectors = [
        '#extensionsNav', // 最新版ST官方容器
        '#nav_extensionsList', // 稳定版ST容器
        '.extensions-nav-list', // 旧版ST容器
        '#extensions-sidebar', // 第三方主题容器
        '.sidebar-content' // 兜底通用容器
    ];

    let $targetContainer = null;
    for (const selector of sidebarContainerSelectors) {
        const $container = $(selector);
        if ($container.length > 0) {
            $targetContainer = $container;
            break;
        }
    }

    // 未找到容器，输出日志，走兜底入口
    if (!$targetContainer || $targetContainer.length === 0) {
        console.warn(`[${MODULE_NAME}] 未找到侧边栏容器，已启用兜底设置面板入口`);
        return;
    }

    // 避免重复添加按钮
    if ($targetContainer.find(`#${MODULE_NAME}_sidebar_btn`).length === 0) {
        $targetContainer.append(`
        <li class="nav-item" id="${MODULE_NAME}_sidebar_btn">
            <a class="nav-link" href="#" data-toggle="modal" data-target="#${MODULE_NAME}_modal">
                <i class="fa fa-book"></i>
                <span>小说导入</span>
            </a>
        </li>
        `);
        console.log(`[${MODULE_NAME}] 侧边栏按钮挂载成功`);
    }
}

// 官方规范：兜底入口-扩展设置面板添加按钮（和官方示例完全一致）
function mountSettingsPanelEntry() {
    const context = getSTContext();
    if (!context?.eventSource || !context?.event_types) return;

    // 监听设置面板更新事件，挂载入口按钮
    context.eventSource.on(context.event_types.SETTINGS_UPDATED, () => {
        const $extensionSettingsPanel = $('#extension_settings');
        if ($extensionSettingsPanel.length > 0 && $extensionSettingsPanel.find(`#${MODULE_NAME}_settings_entry`).length === 0) {
            $extensionSettingsPanel.append(`
            <div class="panel panel-default" id="${MODULE_NAME}_settings_entry">
                <div class="panel-heading">小说章节导入助手</div>
                <div class="panel-body">
                    <p>一键导入小说TXT文件，自动拆分章节，批量发送到聊天对话框</p>
                    <button class="btn btn-primary" data-toggle="modal" data-target="#${MODULE_NAME}_modal">
                        打开导入面板
                    </button>
                </div>
            </div>
            `);
            console.log(`[${MODULE_NAME}] 设置面板兜底入口挂载成功`);
        }
    });
}

// 官方规范：扩展主入口，必须在APP_READY事件触发后执行
function mainInit() {
    try {
        console.log(`[${MODULE_NAME}] 开始初始化扩展`);
        initExtensionSettings();
        renderImportModal();
        mountSidebarButton();
        mountSettingsPanelEntry();
        console.log(`[${MODULE_NAME}] 扩展初始化完成！`);
        console.log(`[${MODULE_NAME}] 打开方式：1. 点击侧边栏「小说导入」按钮 2. 扩展设置面板点击「打开导入面板」`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] 扩展初始化失败:`, error);
    }
}

// 官方规范：严格监听APP_READY事件，等ST完全加载后再初始化（文档强制要求）
const context = getSTContext();
if (context?.eventSource && context?.event_types) {
    // 官方推荐写法：APP_READY事件触发后执行初始化
    context.eventSource.once(context.event_types.APP_READY, mainInit);
} else {
    // 兜底延迟初始化，兼容特殊场景
    setTimeout(() => {
        const retryContext = getSTContext();
        if (retryContext?.eventSource && retryContext?.event_types) {
            retryContext.eventSource.once(retryContext.event_types.APP_READY, mainInit);
        } else {
            console.error(`[${MODULE_NAME}] 初始化失败：SillyTavern环境异常`);
        }
    }, 2000);
}
