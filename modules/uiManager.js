// modules/uiManager.js - 使用ST官方标准侧边栏API
import storageManager from './storageManager.js';
import chapterSplitter from './chapterSplitter.js';
import knowledgeGraph from './knowledgeGraph.js';
import continuationEngine from './continuationEngine.js';
import stCommandBridge from './stCommandBridge.js';

class UIManager {
    constructor() {
        this.panelId = 'novel-continuation-panel';
        this.panelInstance = null;
        this.context = null;
    }

    // 注册侧边栏面板（官方标准API，修复图标不显示的核心）
    async registerPanel(context) {
        this.context = context;
        this.panelInstance = await context.sidebar.registerPanel({
            id: this.panelId,
            icon: 'fa-book',
            title: '小说续写助手',
            onRender: (container) => this.renderPanel(container),
            onOpen: () => this.renderPanel(this.panelInstance?.container)
        });
        return this.panelInstance;
    }

    // 卸载面板
    unregisterPanel() {
        if (this.panelInstance) {
            this.context?.sidebar?.unregisterPanel(this.panelId);
            this.panelInstance = null;
        }
    }

    // 渲染面板内容
    renderPanel(container) {
        if (!container) return;
        const novels = storageManager.getAllNovels();
        const currentNovel = storageManager.getCurrentNovel();
        const currentChapter = storageManager.getCurrentChapter();
        const { toaster } = this.context;

        container.innerHTML = `
<div class="novel-continuation-panel" style="padding: 12px; height: 100%; overflow-y: auto; box-sizing: border-box;">
    <h3 style="margin: 0 0 16px 0; color: var(--primary-text-color); font-size: 18px;">小说续写助手</h3>

    <!-- 小说导入区域 -->
    <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
        <h4 style="margin: 0 0 10px 0; font-size: 15px;">导入小说</h4>
        <input type="file" id="novel-file-input" accept=".txt,.md" style="margin-bottom: 10px; width: 100%; box-sizing: border-box;">
        <button id="import-novel-btn" class="menu_button" style="width: 100%;">导入并拆分章节</button>
    </div>

    <!-- 小说列表区域 -->
    <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
        <h4 style="margin: 0 0 10px 0; font-size: 15px;">我的小说</h4>
        <div id="novel-list" style="max-height: 160px; overflow-y: auto; margin-bottom: 10px;">
            ${novels.length === 0 
                ? '<p style="color: var(--secondary-text-color); text-align: center; margin: 10px 0; font-size: 13px;">暂无导入的小说</p>' 
                : novels.map(novel => `
                    <div class="novel-item" data-novel-id="${novel.id}" style="padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; cursor: pointer; background: ${currentNovel?.id === novel.id ? 'var(--highlight-bg-color)' : 'transparent'};">
                        <span style="font-weight: 500; font-size: 14px;">${novel.title}</span>
                        <span style="font-size: 12px; color: var(--secondary-text-color); margin-left: 10px;">${novel.chapterCount}章</span>
                    </div>
                `).join('')
            }
        </div>
        ${currentNovel ? `<button id="delete-novel-btn" class="menu_button danger" style="width: 100%;">删除当前小说</button>` : ''}
    </div>

    <!-- 章节列表区域 -->
    ${currentNovel ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
            <h4 style="margin: 0 0 10px 0; font-size: 15px;">章节列表</h4>
            <div id="chapter-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 10px;">
                ${currentNovel.chapters.map(chapter => `
                    <div class="chapter-item" data-chapter-id="${chapter.id}" style="padding: 6px 8px; margin-bottom: 6px; border-radius: 4px; cursor: pointer; background: ${currentChapter?.id === chapter.id ? 'var(--highlight-bg-color)' : 'transparent'};">
                        <span style="font-weight: 500; font-size: 14px;">${chapter.title}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}

    <!-- 章节操作区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
            <h4 style="margin: 0 0 10px 0; font-size: 15px;">章节操作</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                <button id="import-to-input-btn" class="menu_button">导入到输入框</button>
                <button id="send-as-char-btn" class="menu_button">以角色发送</button>
                <button id="send-as-context-btn" class="menu_button">发送为上下文</button>
                <button id="char-input-cmd-btn" class="menu_button">角色输入命令</button>
            </div>
            <div>
                <h5 style="margin: 0 0 6px 0; font-size: 13px;">章节内容预览</h5>
                <textarea id="chapter-content-preview" style="width: 100%; height: 100px; resize: vertical; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); color: var(--input-text-color); box-sizing: border-box;" readonly>${currentChapter.content.substring(0, 500)}${currentChapter.content.length > 500 ? '...' : ''}</textarea>
            </div>
        </div>
    ` : ''}

    <!-- 知识图谱区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
            <h4 style="margin: 0 0 10px 0; font-size: 15px;">知识图谱</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <button id="analyze-chapter-btn" class="menu_button">分析当前章节</button>
                <button id="merge-graph-btn" class="menu_button">合并全本图谱</button>
            </div>
            <div id="graph-preview" style="max-height: 150px; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); font-size: 13px;">
                ${storageManager.getChapterGraph(currentNovel.id, currentChapter.id) ? '<p style="color: var(--success-color); margin: 0;">✅ 已生成当前章节知识图谱</p>' : '<p style="color: var(--secondary-text-color); text-align: center; margin: 0;">暂无分析数据</p>'}
                ${storageManager.getMergedGraph(currentNovel.id) ? '<p style="color: var(--success-color); margin: 5px 0 0 0;">✅ 已生成全本合并知识图谱</p>' : ''}
            </div>
        </div>
    ` : ''}

    <!-- 续写操作区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
            <h4 style="margin: 0 0 10px 0; font-size: 15px;">AI续写</h4>
            <div style="margin-bottom: 12px;">
                <label style="display: block; margin-bottom: 6px; font-size: 13px;">续写字数</label>
                <input type="number" id="continue-word-count" value="1000" min="500" max="10000" step="100" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); color: var(--input-text-color); box-sizing: border-box;">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                <button id="continue-chapter-btn" class="menu_button">续写当前章节</button>
                <button id="continue-next-chapter-btn" class="menu_button">续写下一章</button>
            </div>
            <div id="continue-result" style="max-height: 200px; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg-color); font-size: 13px;">
                <p style="color: var(--secondary-text-color); text-align: center; margin: 0;">续写结果将显示在这里</p>
            </div>
        </div>
    ` : ''}
</div>
        `;

        this.bindEvents(container, toaster);
    }

    // 绑定交互事件
    bindEvents(container, toaster) {
        // 导入小说
        container.querySelector('#import-novel-btn')?.addEventListener('click', async () => {
            const file = container.querySelector('#novel-file-input').files[0];
            if (!file) return toaster.show('请先选择小说文件', 'error');
            try {
                toaster.show('正在导入并拆分章节...', 'info');
                const result = await chapterSplitter.handleFileUpload(file);
                toaster.show(`导入成功！共拆分${result.chapterCount}个章节`, 'success');
                storageManager.setCurrentNovel(result.novelId);
                this.renderPanel(container);
            } catch (error) {
                toaster.show(`导入失败：${error.message}`, 'error');
            }
        });

        // 选择小说
        container.querySelectorAll('.novel-item').forEach(item => {
            item.addEventListener('click', () => {
                storageManager.setCurrentNovel(item.dataset.novelId);
                this.renderPanel(container);
            });
        });

        // 删除小说
        container.querySelector('#delete-novel-btn')?.addEventListener('click', () => {
            const currentNovel = storageManager.getCurrentNovel();
            if (!currentNovel) return;
            if (confirm(`确定要删除《${currentNovel.title}》吗？此操作不可恢复！`)) {
                storageManager.deleteNovel(currentNovel.id);
                toaster.show('删除成功', 'success');
                this.renderPanel(container);
            }
        });

        // 选择章节
        container.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                storageManager.setCurrentChapter(item.dataset.chapterId);
                this.renderPanel(container);
            });
        });

        // 导入到输入框
        container.querySelector('#import-to-input-btn')?.addEventListener('click', () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            stCommandBridge.importChapterToInput(currentChapter.content, this.context);
            toaster.show('已导入到输入框', 'success');
        });

        // 以角色发送
        container.querySelector('#send-as-char-btn')?.addEventListener('click', async () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            try {
                await stCommandBridge.sendChapterAsCharacter(currentChapter.content, null, this.context);
                toaster.show('已以角色身份发送', 'success');
            } catch (error) {
                toaster.show(`发送失败：${error.message}`, 'error');
            }
        });

        // 发送为上下文
        container.querySelector('#send-as-context-btn')?.addEventListener('click', async () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            try {
                await stCommandBridge.sendChapterAsContext(currentChapter.content, this.context);
                toaster.show('已发送为上下文', 'success');
            } catch (error) {
                toaster.show(`发送失败：${error.message}`, 'error');
            }
        });

        // 执行角色输入命令
        container.querySelector('#char-input-cmd-btn')?.addEventListener('click', async () => {
            try {
                await stCommandBridge.executeCharacterInputCommand(this.context);
            } catch (error) {
                toaster.show(`执行命令失败：${error.message}`, 'error');
            }
        });

        // 分析章节
        container.querySelector('#analyze-chapter-btn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentNovel || !currentChapter) return;
            try {
                toaster.show('正在分析章节，生成知识图谱...', 'info');
                await knowledgeGraph.analyzeChapter(currentNovel.id, currentChapter.id, currentChapter.content, this.context);
                toaster.show('章节分析完成', 'success');
                this.renderPanel(container);
            } catch (error) {
                toaster.show(`分析失败：${error.message}`, 'error');
            }
        });

        // 合并全本图谱
        container.querySelector('#merge-graph-btn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            if (!currentNovel) return;
            try {
                toaster.show('正在合并全本知识图谱...', 'info');
                await knowledgeGraph.mergeNovelGraphs(currentNovel.id, this.context);
                toaster.show('全本图谱合并完成', 'success');
                this.renderPanel(container);
            } catch (error) {
                toaster.show(`合并失败：${error.message}`, 'error');
            }
        });

        // 续写当前章节
        container.querySelector('#continue-chapter-btn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            const wordCount = parseInt(container.querySelector('#continue-word-count').value) || 1000;
            if (!currentNovel || !currentChapter) return;
            try {
                toaster.show(`正在续写章节，约${wordCount}字...`, 'info');
                const result = await continuationEngine.continueSingleChapter(currentNovel.id, currentChapter.id, wordCount, this.context);
                toaster.show('续写完成', 'success');
                container.querySelector('#continue-result').innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result}</pre>`;
                stCommandBridge.importChapterToInput(result, this.context);
            } catch (error) {
                toaster.show(`续写失败：${error.message}`, 'error');
            }
        });

        // 续写下一章
        container.querySelector('#continue-next-chapter-btn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const wordCount = parseInt(container.querySelector('#continue-word-count').value) || 2000;
            if (!currentNovel) return;
            try {
                toaster.show(`正在续写下一章，约${wordCount}字...`, 'info');
                const result = await continuationEngine.continueNextChapter(currentNovel.id, wordCount, this.context);
                toaster.show(`下一章续写完成，已自动添加到章节列表`, 'success');
                container.querySelector('#continue-result').innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result.content}</pre>`;
                this.renderPanel(container);
            } catch (error) {
                toaster.show(`续写失败：${error.message}`, 'error');
            }
        });
    }
}

export default new UIManager();
