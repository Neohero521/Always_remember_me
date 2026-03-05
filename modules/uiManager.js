// modules/uiManager.js
import storageManager from './storageManager.js';
import chapterSplitter from './chapterSplitter.js';
import knowledgeGraph from './knowledgeGraph.js';
import continuationEngine from './continuationEngine.js';
import stCommandBridge from './stCommandBridge.js';

class UIManager {
    constructor() {
        this.panelId = 'novelContinuationPanel';
    }

    // 渲染插件侧边栏面板
    renderPanel() {
        const panel = document.getElementById(this.panelId);
        if (!panel) return;

        const novels = storageManager.getAllNovels();
        const currentNovel = storageManager.getCurrentNovel();
        const currentChapter = storageManager.getCurrentChapter();

        panel.innerHTML = `
<div class="novel-continuation-panel" style="padding: 10px; height: 100%; overflow-y: auto;">
    <h3 style="margin-bottom: 15px; color: var(--primary-text-color);">小说续写助手</h3>

    <!-- 小说导入区域 -->
    <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
        <h4 style="margin-bottom: 10px;">导入小说</h4>
        <input type="file" id="novelFileInput" accept=".txt,.md" style="margin-bottom: 10px; width: 100%;">
        <button id="importNovelBtn" class="menu_button" style="width: 100%;">导入并拆分章节</button>
    </div>

    <!-- 小说列表区域 -->
    <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
        <h4 style="margin-bottom: 10px;">我的小说</h4>
        <div id="novelList" style="max-height: 150px; overflow-y: auto; margin-bottom: 10px;">
            ${novels.length === 0 ? '<p style="color: var(--secondary-text-color); text-align: center;">暂无导入的小说</p>' : 
                novels.map(novel => `
                    <div class="novel-item" data-novel-id="${novel.id}" style="padding: 5px; margin-bottom: 5px; border-radius: 3px; cursor: pointer; background: ${currentNovel?.id === novel.id ? 'var(--highlight-bg-color)' : 'transparent'};">
                        <span style="font-weight: 500;">${novel.title}</span>
                        <span style="font-size: 12px; color: var(--secondary-text-color); margin-left: 10px;">${novel.chapterCount}章</span>
                    </div>
                `).join('')
            }
        </div>
        ${currentNovel ? `
            <button id="deleteNovelBtn" class="menu_button danger" style="width: 100%; margin-top: 5px;">删除当前小说</button>
        ` : ''}
    </div>

    <!-- 章节列表区域 -->
    ${currentNovel ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
            <h4 style="margin-bottom: 10px;">章节列表</h4>
            <div id="chapterList" style="max-height: 200px; overflow-y: auto; margin-bottom: 10px;">
                ${currentNovel.chapters.map(chapter => `
                    <div class="chapter-item" data-chapter-id="${chapter.id}" style="padding: 5px; margin-bottom: 5px; border-radius: 3px; cursor: pointer; background: ${currentChapter?.id === chapter.id ? 'var(--highlight-bg-color)' : 'transparent'};">
                        <span style="font-weight: 500;">${chapter.title}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : ''}

    <!-- 章节操作区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
            <h4 style="margin-bottom: 10px;">章节操作</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <button id="importToInputBtn" class="menu_button">导入到输入框</button>
                <button id="sendAsCharBtn" class="menu_button">以角色发送</button>
                <button id="sendAsContextBtn" class="menu_button">发送为上下文</button>
                <button id="charInputCmdBtn" class="menu_button">角色输入命令</button>
            </div>
            <div style="margin-bottom: 10px;">
                <h5 style="margin-bottom: 5px;">章节内容预览</h5>
                <textarea id="chapterContentPreview" style="width: 100%; height: 100px; resize: vertical; padding: 5px; border: 1px solid var(--border-color); border-radius: 3px; background: var(--input-bg-color); color: var(--input-text-color);" readonly>${currentChapter.content.substring(0, 500)}${currentChapter.content.length > 500 ? '...' : ''}</textarea>
            </div>
        </div>
    ` : ''}

    <!-- 知识图谱区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
            <h4 style="margin-bottom: 10px;">知识图谱</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <button id="analyzeChapterBtn" class="menu_button">分析当前章节</button>
                <button id="mergeGraphBtn" class="menu_button">合并全本图谱</button>
            </div>
            <div id="graphPreview" style="max-height: 150px; overflow-y: auto; padding: 5px; border: 1px solid var(--border-color); border-radius: 3px; background: var(--input-bg-color);">
                ${storageManager.getChapterGraph(currentNovel.id, currentChapter.id) ? '<p style="color: var(--success-color);">已生成当前章节知识图谱</p>' : '<p style="color: var(--secondary-text-color); text-align: center;">暂无分析数据</p>'}
                ${storageManager.getMergedGraph(currentNovel.id) ? '<p style="color: var(--success-color);">已生成全本合并知识图谱</p>' : ''}
            </div>
        </div>
    ` : ''}

    <!-- 续写操作区域 -->
    ${currentChapter ? `
        <div class="panel-section" style="margin-bottom: 20px; padding: 10px; border: 1px solid var(--border-color); border-radius: 5px;">
            <h4 style="margin-bottom: 10px;">AI续写</h4>
            <div style="margin-bottom: 10px;">
                <label style="display: block; margin-bottom: 5px;">续写字数</label>
                <input type="number" id="continueWordCount" value="1000" min="500" max="10000" step="100" style="width: 100%; padding: 5px; border: 1px solid var(--border-color); border-radius: 3px; background: var(--input-bg-color); color: var(--input-text-color);">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                <button id="continueChapterBtn" class="menu_button">续写当前章节</button>
                <button id="continueNextChapterBtn" class="menu_button">续写下一章</button>
            </div>
            <div id="continueResult" style="max-height: 200px; overflow-y: auto; padding: 5px; border: 1px solid var(--border-color); border-radius: 3px; background: var(--input-bg-color);">
                <p style="color: var(--secondary-text-color); text-align: center;">续写结果将显示在这里</p>
            </div>
        </div>
    ` : ''}
</div>
        `;

        this.bindEvents();
    }

    // 绑定UI交互事件
    bindEvents() {
        // 导入小说
        document.getElementById('importNovelBtn')?.addEventListener('click', async () => {
            const file = document.getElementById('novelFileInput').files[0];
            if (!file) return window.SillyTavern.showToast('请先选择小说文件', 'error');
            try {
                window.SillyTavern.showToast('正在导入并拆分章节...', 'info');
                const result = await chapterSplitter.handleFileUpload(file);
                window.SillyTavern.showToast(`导入成功！共拆分${result.chapterCount}个章节`, 'success');
                storageManager.setCurrentNovel(result.novelId);
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 选择小说
        document.querySelectorAll('.novel-item').forEach(item => {
            item.addEventListener('click', () => {
                storageManager.setCurrentNovel(item.dataset.novelId);
                this.renderPanel();
            });
        });

        // 删除小说
        document.getElementById('deleteNovelBtn')?.addEventListener('click', () => {
            const currentNovel = storageManager.getCurrentNovel();
            if (!currentNovel) return;
            if (confirm(`确定要删除小说《${currentNovel.title}》吗？此操作不可恢复！`)) {
                storageManager.deleteNovel(currentNovel.id);
                window.SillyTavern.showToast('删除成功', 'success');
                this.renderPanel();
            }
        });

        // 选择章节
        document.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                storageManager.setCurrentChapter(item.dataset.chapterId);
                this.renderPanel();
            });
        });

        // 导入到输入框
        document.getElementById('importToInputBtn')?.addEventListener('click', () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            try {
                stCommandBridge.importChapterToInput(currentChapter.content);
                window.SillyTavern.showToast('已导入到输入框', 'success');
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 以角色发送
        document.getElementById('sendAsCharBtn')?.addEventListener('click', async () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            try {
                await stCommandBridge.sendChapterAsCharacter(currentChapter.content);
                window.SillyTavern.showToast('已以角色身份发送', 'success');
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 发送为上下文
        document.getElementById('sendAsContextBtn')?.addEventListener('click', async () => {
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentChapter) return;
            try {
                await stCommandBridge.sendChapterAsContext(currentChapter.content);
                window.SillyTavern.showToast('已发送为上下文', 'success');
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 执行角色输入命令
        document.getElementById('charInputCmdBtn')?.addEventListener('click', async () => {
            try {
                await stCommandBridge.executeCharacterInputCommand();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 分析章节
        document.getElementById('analyzeChapterBtn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentNovel || !currentChapter) return;
            try {
                window.SillyTavern.showToast('正在分析章节，生成知识图谱...', 'info');
                await knowledgeGraph.analyzeChapter(currentNovel.id, currentChapter.id, currentChapter.content);
                window.SillyTavern.showToast('章节分析完成，知识图谱已生成', 'success');
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 合并全本图谱
        document.getElementById('mergeGraphBtn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            if (!currentNovel) return;
            try {
                window.SillyTavern.showToast('正在合并全本知识图谱...', 'info');
                await knowledgeGraph.mergeNovelGraphs(currentNovel.id);
                window.SillyTavern.showToast('全本知识图谱合并完成', 'success');
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 续写当前章节
        document.getElementById('continueChapterBtn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            const wordCount = parseInt(document.getElementById('continueWordCount').value) || 1000;
            if (!currentNovel || !currentChapter) return;
            try {
                window.SillyTavern.showToast(`正在续写章节，约${wordCount}字...`, 'info');
                const result = await continuationEngine.continueSingleChapter(currentNovel.id, currentChapter.id, wordCount);
                window.SillyTavern.showToast('续写完成', 'success');
                document.getElementById('continueResult').innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result}</pre>`;
                stCommandBridge.importChapterToInput(result);
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 续写下一章
        document.getElementById('continueNextChapterBtn')?.addEventListener('click', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const wordCount = parseInt(document.getElementById('continueWordCount').value) || 2000;
            if (!currentNovel) return;
            try {
                window.SillyTavern.showToast(`正在续写下一章，约${wordCount}字...`, 'info');
                const result = await continuationEngine.continueNextChapter(currentNovel.id, wordCount);
                window.SillyTavern.showToast(`下一章续写完成，已自动添加到章节列表`, 'success');
                document.getElementById('continueResult').innerHTML = `<pre style="white-space: pre-wrap; margin: 0; font-size: 13px;">${result.content}</pre>`;
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        // 监听斜杠命令触发的自定义事件
        window.addEventListener('novel-continuation:analyze-current-chapter', async () => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            if (!currentNovel || !currentChapter) return;
            try {
                await knowledgeGraph.analyzeChapter(currentNovel.id, currentChapter.id, currentChapter.content);
                window.SillyTavern.showToast('章节分析完成', 'success');
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });

        window.addEventListener('novel-continuation:continue-current-chapter', async (e) => {
            const currentNovel = storageManager.getCurrentNovel();
            const currentChapter = storageManager.getCurrentChapter();
            const { wordCount } = e.detail;
            if (!currentNovel || !currentChapter) return;
            try {
                const result = await continuationEngine.continueSingleChapter(currentNovel.id, currentChapter.id, wordCount);
                window.SillyTavern.showToast('续写完成', 'success');
                stCommandBridge.importChapterToInput(result);
                this.renderPanel();
            } catch (error) {
                window.SillyTavern.showToast(error.message, 'error');
            }
        });
    }

    // 注册插件面板到ST
    registerPanel() {
        if (!window.SillyTavern) return;
        window.SillyTavern.registerExtensionPanel({
            id: this.panelId,
            icon: 'fa-book-open',
            title: '小说续写助手',
            onRender: () => this.renderPanel(),
            onOpen: () => this.renderPanel()
        });
    }
}

export default new UIManager();
