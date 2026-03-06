// 官方规范：全局唯一扩展标识，绝对不能和其他扩展重复
const MODULE_NAME = 'always_remember_me_novel_importer';
// 官方规范：默认配置，冻结避免意外修改
const DEFAULT_SETTINGS = Object.freeze({
    splitRegex: '^\\s*第[0-9一二三四五六七八九十百千]+章.*$',
    sendCommandTemplate: '/input 请输入{{char}}的动作或台词：| /sendas name={{char}} {{pipe}}',
    sendDelay: 800
});

// ==================== 官方规范：核心工具函数 ====================
/**
 * 官方文档唯一推荐的ST上下文获取方式
 * @returns {object|null} ST上下文
 */
function getSTContext() {
    try {
        if (typeof window.SillyTavern !== 'undefined' && typeof window.SillyTavern.getContext === 'function') {
            return window.SillyTavern.getContext();
        }
        console.warn(`[${MODULE_NAME}] 暂未获取到SillyTavern上下文`);
        return null;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 获取ST上下文失败:`, error);
        return null;
    }
}

/**
 * 官方文档推荐的设置初始化&持久化
 * @returns {object} 扩展设置
 */
function initSettings() {
    try {
        const context = getSTContext();
        if (!context || !context.extensionSettings) {
            console.warn(`[${MODULE_NAME}] 未获取到设置存储，使用默认配置`);
            return structuredClone(DEFAULT_SETTINGS);
        }

        // 初始化命名空间，避免和其他扩展冲突
        if (!context.extensionSettings[MODULE_NAME]) {
            context.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
        }

        // 补全版本更新后的新增配置
        for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (!Object.prototype.hasOwnProperty.call(context.extensionSettings[MODULE_NAME], key)) {
                context.extensionSettings[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
            }
        }

        console.log(`[${MODULE_NAME}] 配置初始化完成`);
        return context.extensionSettings[MODULE_NAME];
    } catch (error) {
        console.error(`[${MODULE_NAME}] 配置初始化失败:`, error);
        return structuredClone(DEFAULT_SETTINGS);
    }
}

/**
 * 官方文档推荐的设置保存方法
 */
function saveSettings() {
    try {
        const context = getSTContext();
        if (context?.saveSettingsDebounced) {
            context.saveSettingsDebounced();
            console.log(`[${MODULE_NAME}] 配置已保存`);
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] 配置保存失败:`, error);
    }
}

// ==================== 业务核心函数 ====================
/**
 * 获取当前角色名称，兼容单聊/群聊
 * @returns {string|null} 角色名
 */
function getCurrentCharName() {
    try {
        const context = getSTContext();
        if (!context) return null;

        const { characters, characterId, groups, groupId } = context;
        // 群聊兼容
        if (groupId !== undefined && groupId !== null) {
            const currentGroup = groups.find(g => g.id === groupId);
            if (currentGroup?.members?.length > 0) {
                const firstCharId = currentGroup.members[0];
                return characters[firstCharId]?.name || null;
            }
        }
        // 单聊兼容
        if (characterId !== undefined && characters[characterId]) {
            return characters[characterId].name;
        }
        return null;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 获取角色名失败:`, error);
        return null;
    }
}

/**
 * 拆分小说章节
 * @param {string} text 小说全文
 * @param {string} splitRegex 拆分正则
 * @returns {Array<{title: string, content: string}>} 章节列表
 */
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
            const start = match.index;
            const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
            const fullChapter = text.slice(start, end).trim();
            const [title, ...contentLines] = fullChapter.split('\n');

            chapters.push({
                title: title.trim(),
                content: contentLines.join('\n').trim()
            });
        }

        console.log(`[${MODULE_NAME}] 成功拆分${chapters.length}个章节`);
        return chapters;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节拆分失败:`, error);
        alert('章节拆分正则格式错误，请检查后重试');
        return [];
    }
}

/**
 * 执行斜杠命令发送章节
 * @param {string} content 章节内容
 * @returns {Promise<boolean>} 是否成功
 */
async function sendChapter(content) {
    try {
        const settings = initSettings();
        const charName = getCurrentCharName();

        if (!charName) {
            alert('请先选择一个角色/群聊，再执行导入');
            return false;
        }
        if (!content.trim()) {
            console.warn(`[${MODULE_NAME}] 章节内容为空，跳过`);
            return true;
        }

        // 替换模板变量
        const command = settings.sendCommandTemplate
            .replaceAll('{{char}}', charName)
            .replaceAll('{{content}}', content)
            .replaceAll('{{pipe}}', content);

        const context = getSTContext();
        if (!context?.SlashCommandParser) {
            throw new Error('未获取到斜杠命令解析器，请升级SillyTavern版本');
        }

        await context.SlashCommandParser.parse(command);
        console.log(`[${MODULE_NAME}] 章节发送成功`);
        return true;
    } catch (error) {
        console.error(`[${MODULE_NAME}] 章节发送失败:`, error);
        alert(`发送失败：${error.message}`);
        return false;
    }
}

/**
 * 批量导入章节
 * @param {Array<{title: string, content: string}>} chapters 章节列表
 */
async function batchImport(chapters) {
    try {
        if (chapters.length === 0) {
            alert('没有可导入的章节');
            return;
        }

        if (!confirm(`确定要导入${chapters.length}个章节吗？导入过程中请勿关闭页面`)) {
            return;
        }

        const settings = initSettings();
        let successCount = 0;

        for (const chapter of chapters) {
            const success = await sendChapter(chapter.content);
            if (success) successCount++;
            else {
                const goOn = confirm(`章节「${chapter.title}」导入失败，是否继续？`);
                if (!goOn) break;
            }
            // 防刷屏延迟
            await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
        }

        alert(`导入完成！成功${successCount}/${chapters.length}个章节`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] 批量导入失败:`, error);
        alert(`批量导入失败：${error.message}`);
    }
}

// ==================== UI渲染函数 ====================
/**
 * 渲染导入模态框，对齐ST原生UI规范
 */
function renderModal() {
    try {
        const $ = window.jQuery;
        // 避免重复渲染
        if ($(`#${MODULE_NAME}_modal`).length > 0) {
            console.log(`[${MODULE_NAME}] 模态框已存在，跳过渲染`);
            return;
        }

        const settings = initSettings();
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
                        <div class="form-group">
                            <label>选择小说TXT文件</label>
                            <input type="file" class="form-control" id="${MODULE_NAME}_file" accept=".txt">
                            <small class="form-text text-muted">支持UTF-8编码的TXT文件</small>
                        </div>
                        <div class="form-group">
                            <label>章节拆分正则</label>
                            <input type="text" class="form-control" id="${MODULE_NAME}_regex" value="${settings.splitRegex}">
                            <small class="form-text text-muted">默认匹配「第X章」格式</small>
                        </div>
                        <div class="form-group">
                            <label>发送命令模板</label>
                            <input type="text" class="form-control" id="${MODULE_NAME}_command" value="${settings.sendCommandTemplate}">
                            <small class="form-text text-muted">变量：{{char}}=角色名，{{content}}/{{pipe}}=章节内容</small>
                        </div>
                        <div class="form-group">
                            <label>发送间隔（毫秒）</label>
                            <input type="number" class="form-control" id="${MODULE_NAME}_delay" value="${settings.sendDelay}" min="200" max="5000">
                            <small class="form-text text-muted">数值越大，发送越慢，越稳定</small>
                        </div>
                        <button class="btn btn-primary w-100 mb-3" id="${MODULE_NAME}_parse">解析章节</button>
                        <div class="form-group">
                            <label>章节预览</label>
                            <div id="${MODULE_NAME}_list" style="max-height: 350px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px; padding: 10px;">
                                <p class="text-muted text-center m-0">请先选择文件并解析章节</p>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-dismiss="modal">关闭</button>
                        <button class="btn btn-success" id="${MODULE_NAME}_import_selected" disabled>导入选中章节</button>
                        <button class="btn btn-info" id="${MODULE_NAME}_import_all" disabled>导入全部章节</button>
                    </div>
                </div>
            </div>
        </div>
        `;

        $('body').append(modalHtml);
        console.log(`[${MODULE_NAME}] 模态框渲染完成`);

        // 缓存章节列表
        let chapterList = [];
        const $modal = $(`#${MODULE_NAME}_modal`);

        // 解析章节
        $modal.find(`#${MODULE_NAME}_parse`).on('click', () => {
            const file = $(`#${MODULE_NAME}_file`)[0].files[0];
            if (!file) {
                alert('请先选择TXT文件');
                return;
            }

            // 保存配置
            const settings = initSettings();
            settings.splitRegex = $(`#${MODULE_NAME}_regex`).val().trim();
            settings.sendCommandTemplate = $(`#${MODULE_NAME}_command`).val().trim();
            settings.sendDelay = parseInt($(`#${MODULE_NAME}_delay`).val()) || 800;
            saveSettings();

            // 读取文件
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                chapterList = splitNovelChapters(text, settings.splitRegex);
                const $list = $(`#${MODULE_NAME}_list`);
                $list.empty();

                if (chapterList.length === 0) {
                    $list.html('<p class="text-muted text-center m-0">未解析到章节，请检查正则</p>');
                    $modal.find(`#${MODULE_NAME}_import_selected, #${MODULE_NAME}_import_all`).prop('disabled', true);
                    return;
                }

                // 渲染章节列表
                chapterList.forEach((chapter, index) => {
                    $list.append(`
                    <div class="form-check mb-2">
                        <input class="form-check-input ${MODULE_NAME}_check" type="checkbox" value="${index}" id="${MODULE_NAME}_check_${index}" checked>
                        <label class="form-check-label" for="${MODULE_NAME}_check_${index}">
                            ${chapter.title} <span class="text-muted">(${chapter.content.length}字)</span>
                        </label>
                    </div>
                    `);
                });

                // 启用导入按钮
                $modal.find(`#${MODULE_NAME}_import_selected, #${MODULE_NAME}_import_all`).prop('disabled', false);
            };
            reader.readAsText(file, 'utf-8');
        });

        // 导入选中
        $modal.find(`#${MODULE_NAME}_import_selected`).on('click', async () => {
            const selected = $(`.${MODULE_NAME}_check:checked`).map((_, el) => parseInt(el.value)).get();
            const selectedChapters = selected.map(i => chapterList[i]);
            await batchImport(selectedChapters);
        });

        // 导入全部
        $modal.find(`#${MODULE_NAME}_import_all`).on('click', async () => {
            await batchImport(chapterList);
        });

        // 全局兜底打开函数
        window[`open${MODULE_NAME}Modal`] = () => {
            $modal.modal('show');
        };

    } catch (error) {
        console.error(`[${MODULE_NAME}] 模态框渲染失败:`, error);
    }
}

/**
 * 挂载侧边栏按钮，兼容所有ST版本
 */
function mountSidebarButton() {
    try {
        const $ = window.jQuery;
        // 官方所有版本的侧边栏容器选择器
        const selectors = [
            '#extensionsNav',
            '#nav_extensionsList',
            '.extensions-nav-list',
            '#extensions-sidebar',
            '.sidebar-content'
        ];

        let $container = null;
        for (const selector of selectors) {
            const $el = $(selector);
            if ($el.length > 0) {
                $container = $el;
                break;
            }
        }

        if (!$container || $container.length === 0) {
            console.warn(`[${MODULE_NAME}] 未找到侧边栏容器，跳过按钮挂载`);
            return;
        }

        // 避免重复挂载
        if ($container.find(`#${MODULE_NAME}_sidebar_btn`).length === 0) {
            $container.append(`
            <li class="nav-item" id="${MODULE_NAME}_sidebar_btn">
                <a class="nav-link" href="#" data-toggle="modal" data-target="#${MODULE_NAME}_modal">
                    <i class="fa fa-book"></i>
                    <span>小说导入</span>
                </a>
            </li>
            `);
            console.log(`[${MODULE_NAME}] 侧边栏按钮挂载成功`);
        }
    } catch (error) {
        console.error(`[${MODULE_NAME}] 侧边栏按钮挂载失败:`, error);
    }
}

/**
 * 挂载设置面板兜底入口，和官方示例完全一致
 */
function mountSettingsEntry() {
    try {
        const $ = window.jQuery;
        const context = getSTContext();

        if (!context?.eventSource || !context?.event_types) {
            console.warn(`[${MODULE_NAME}] 未获取到事件系统，跳过设置入口挂载`);
            return;
        }

        // 监听设置面板更新事件
        context.eventSource.on(context.event_types.SETTINGS_UPDATED, () => {
            const $panel = $('#extension_settings');
            if ($panel.length > 0 && $panel.find(`#${MODULE_NAME}_settings_entry`).length === 0) {
                $panel.append(`
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
                console.log(`[${MODULE_NAME}] 设置面板入口挂载成功`);
            }
        });
    } catch (error) {
        console.error(`[${MODULE_NAME}] 设置面板入口挂载失败:`, error);
    }
}

// ==================== 官方规范：主初始化函数 ====================
function mainInit() {
    try {
        console.log(`[${MODULE_NAME}] 开始初始化扩展`);
        initSettings();
        renderModal();
        // 重试3次挂载侧边栏，确保DOM完全渲染
        setTimeout(mountSidebarButton, 500);
        setTimeout(mountSidebarButton, 1500);
        setTimeout(mountSidebarButton, 3000);
        mountSettingsEntry();

        console.log(`[${MODULE_NAME}] 扩展初始化完成！`);
        console.log(`[${MODULE_NAME}] 打开方式1：点击侧边栏「小说导入」按钮`);
        console.log(`[${MODULE_NAME}] 打开方式2：扩展设置面板点击「打开导入面板」按钮`);
        console.log(`[${MODULE_NAME}] 打开方式3：控制台输入 open${MODULE_NAME}Modal() 回车`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] 扩展初始化失败:`, error);
    }
}

// ==================== 官方规范：初始化触发时机 ====================
(function () {
    try {
        console.log(`[${MODULE_NAME}] 扩展脚本加载完成，等待ST就绪`);

        // 等待ST上下文就绪
        function waitForSTReady() {
            const context = getSTContext();
            if (context?.eventSource && context?.event_types) {
                // 官方文档强制要求：APP_READY事件触发后再初始化
                context.eventSource.on(context.event_types.APP_READY, mainInit);
            } else {
                setTimeout(waitForSTReady, 200);
            }
        }

        // 等待jQuery加载完成，避免$未定义报错
        function waitForjQuery() {
            if (typeof window.jQuery !== 'undefined') {
                console.log(`[${MODULE_NAME}] jQuery已就绪`);
                waitForSTReady();
            } else {
                setTimeout(waitForjQuery, 200);
            }
        }

        waitForjQuery();
    } catch (error) {
        console.error(`[${MODULE_NAME}] 扩展启动失败:`, error);
    }
})();
