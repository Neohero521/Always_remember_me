// ===================== 【修复】ST核心API正确导入路径 =====================
// 插件安装后路径：/scripts/extensions/Always_remember_me/index.js
// 目标文件路径：/scripts/script.js  相对路径为 ../../script.js
import { getContext, registerExtensionPanel, generateQuietPrompt } from "../../script.js";
import { executeSlashCommand } from "../../slash-commands.js";

// ===================== 模块导入 =====================
import { readTxtFile, readEpubFile, splitChapters } from './modules/novelParser.js';
import { buildGroupsFromChapters, buildGroupsFromWords, getGroupAnalyzePrompt, getMergeGraphPrompt, extractJSON } from './modules/groupAnalyzer.js';
import { getContinuePrompt, getFirstContinuePrompt, getContinueContext, getFirstPreContext } from './modules/continueWriter.js';
import { sendChapterToChat, batchSendAllChapters } from './modules/chatSender.js';
import { savePluginData, loadPluginData, clearPluginData } from './modules/storage.js';

// ===================== 全局状态管理（封闭作用域，避免全局污染） =====================
const state = {
    chapters: [],
    groups: [],
    knowledgeGraph: {},
    currentChapterId: 0,
    isProcessing: false,
    generatedChapters: [],
    debugLogs: [],
    isEpubLibLoaded: false,
    container: null,
    // 调试日志
    addDebugLog(type, message, details = '') {
        const timestamp = new Date().toLocaleTimeString();
        const log = `[${timestamp}] [${type}] ${message}\n${details ? details + '\n' : ''}`;
        this.debugLogs.unshift(log);
        if (this.debugLogs.length > 5) this.debugLogs.pop();
        this.updateDebugDisplay();
    },
    updateDebugDisplay() {
        if (!this.container) return;
        const debugEl = this.container.querySelector('#debugContent');
        if (debugEl) debugEl.textContent = this.debugLogs.join('\n---\n') || '暂无调试信息';
    }
};

// ===================== 【修复】EPUB库加载（增加完整错误捕获） =====================
async function loadEpubLib() {
    if (state.isEpubLibLoaded || typeof ePub !== 'undefined') {
        state.isEpubLibLoaded = true;
        return true;
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
        script.async = false;
        script.crossOrigin = 'anonymous';
        // 加载成功
        script.onload = () => {
            state.isEpubLibLoaded = true;
            state.addDebugLog('初始化', 'EPUB解析库加载成功');
            resolve(true);
        };
        // 【修复】加载失败捕获，避免未捕获错误导致插件崩溃
        script.onerror = (err) => {
            state.addDebugLog('初始化', 'EPUB解析库加载失败', '仅支持TXT文件上传');
            resolve(false);
        };
        document.head.appendChild(script);
    });
}

// ===================== 【修复】UI渲染（仅在ST面板onRender回调中执行，确保容器存在） =====================
function renderPluginUI(container) {
    state.container = container;
    container.id = 'novel-magic-editor';
    container.innerHTML = `
        <div class="nme-header">
            <h2>📖 小说魔改神器</h2>
            <p class="nme-desc">小说解析 · 知识图谱 · 人设锁定续写 · 一键发送到聊天</p>
        </div>

        <!-- 选项卡导航 -->
        <div class="nme-tabs">
            <button class="nme-tab-btn active" data-tab="import">📂 小说导入</button>
            <button class="nme-tab-btn" data-tab="analyze">📊 图谱分析</button>
            <button class="nme-tab-btn" data-tab="continue">✍️ 续写编辑</button>
            <button class="nme-tab-btn" data-tab="send">📤 发送聊天</button>
        </div>

        <!-- 面板容器 -->
        <div class="nme-panels">
            <!-- 面板1：小说导入 -->
            <div class="nme-panel active" id="panel-import">
                <div class="nme-card">
                    <h3>📂 上传小说文件</h3>
                    <input type="file" id="nme-file-input" accept=".txt,.epub" class="nme-file-input">
                    <p id="nme-upload-status" class="nme-status">支持TXT或EPUB格式，自动识别编码、拆分章节</p>
                </div>
                <div class="nme-card">
                    <h3>📑 章节列表</h3>
                    <select id="nme-chapter-select" class="nme-select" disabled>
                        <option value="">请先上传小说</option>
                    </select>
                    <div class="nme-chapter-content">
                        <h4>章节原文</h4>
                        <textarea id="nme-original-content" class="nme-textarea" readonly placeholder="上传小说后显示原文"></textarea>
                    </div>
                </div>
            </div>

            <!-- 面板2：图谱分析 -->
            <div class="nme-panel" id="panel-analyze">
                <div class="nme-card">
                    <h3>⚙️ 分组设置</h3>
                    <div class="nme-form-row">
                        <label>分组方式：</label>
                        <div class="nme-radio-group">
                            <label class="nme-radio">
                                <input type="radio" name="groupMode" value="chapter" checked>
                                <span>按章节数</span>
                            </label>
                            <label class="nme-radio">
                                <input type="radio" name="groupMode" value="word">
                                <span>按字数</span>
                            </label>
                        </div>
                    </div>
                    <div class="nme-form-row" id="chapter-group-setting">
                        <label>每组章节数：</label>
                        <input type="number" id="group-chapter-size" value="3" min="1" max="10" class="nme-input-number">
                    </div>
                    <div class="nme-form-row hidden" id="word-group-setting">
                        <label>每组字数：</label>
                        <input type="number" id="group-word-size" value="5000" min="1000" max="10000" step="100" class="nme-input-number">
                    </div>
                    <button id="nme-regroup-btn" class="nme-btn nme-btn-secondary" disabled>🔄 生成分组</button>
                </div>
                <div class="nme-card">
                    <h3>📚 分组列表</h3>
                    <div id="nme-group-list" class="nme-group-list">
                        <div class="nme-empty">请先上传小说并生成分组</div>
                    </div>
                    <div class="nme-form-row">
                        <label>分析范围：第</label>
                        <input type="number" id="analyze-start" value="1" min="1" class="nme-input-number small">
                        <label>组 至 第</label>
                        <input type="number" id="analyze-end" value="1" min="1" class="nme-input-number small">
                        <label>组</label>
                    </div>
                    <div class="nme-btn-group">
                        <button id="nme-analyze-btn" class="nme-btn nme-btn-secondary" disabled>🔍 分析范围内分组</button>
                        <button id="nme-merge-btn" class="nme-btn nme-btn-primary" disabled>🧩 合并汇总图谱</button>
                    </div>
                </div>
                <div class="nme-card">
                    <h3>📊 最终知识图谱</h3>
                    <pre id="nme-graph-content" class="nme-pre">请先分析分组并合并汇总图谱</pre>
                    <div class="nme-btn-group">
                        <button id="nme-import-graph-btn" class="nme-btn nme-btn-secondary">📥 导入图谱</button>
                        <button id="nme-export-graph-btn" class="nme-btn nme-btn-secondary">📤 导出图谱</button>
                        <input type="file" id="graph-import-input" accept=".json" class="hidden">
                    </div>
                </div>
            </div>

            <!-- 面板3：续写编辑 -->
            <div class="nme-panel" id="panel-continue">
                <div class="nme-card">
                    <h3>⚙️ 续写参数</h3>
                    <div class="nme-form-row">
                        <label>续写字数：<span id="length-display">2000</span></label>
                        <input type="number" id="continue-length" value="2000" min="500" max="10000" step="100" class="nme-input-number">
                    </div>
                    <div class="nme-form-row">
                        <label>续写自由度：<span id="temperature-value">0.7</span></label>
                        <input type="range" id="temperature" min="0.1" max="1.0" step="0.1" value="0.7" class="nme-slider">
                        <div class="nme-slider-desc">
                            <span>贴合原文</span>
                            <span>自由创作</span>
                        </div>
                    </div>
                </div>
                <div class="nme-card">
                    <h3>✍️ 魔改编辑区</h3>
                    <textarea id="nme-edit-content" class="nme-textarea tall" placeholder="在此修改当前章节内容，续写将基于此内容"></textarea>
                    <button id="nme-run-continue-btn" class="nme-btn nme-btn-primary w-full" disabled>🚀 执行魔改续写</button>
                </div>
                <div class="nme-card">
                    <h3>✨ 续写结果</h3>
                    <textarea id="nme-result-content" class="nme-textarea tall" placeholder="AI生成的续写内容将显示在这里"></textarea>
                    <button id="nme-continue-next-btn" class="nme-btn nme-btn-success w-full" disabled>⏩ 继续续写下一章</button>
                </div>
                <div id="nme-continue-container" class="nme-continue-container"></div>
            </div>

            <!-- 面板4：发送聊天 -->
            <div class="nme-panel" id="panel-send">
                <div class="nme-card">
                    <h3>📤 发送章节到聊天</h3>
                    <div class="nme-form-row">
                        <label>选择发送章节：</label>
                        <select id="nme-send-chapter-select" class="nme-select" disabled>
                            <option value="">请先上传小说</option>
                        </select>
                    </div>
                    <button id="nme-send-single-btn" class="nme-btn nme-btn-primary w-full" disabled>📤 发送选中章节到聊天</button>
                    <div class="nme-divider">或</div>
                    <button id="nme-send-batch-btn" class="nme-btn nme-btn-secondary w-full" disabled>📤 批量发送所有章节到聊天</button>
                    <p id="nme-send-status" class="nme-status"></p>
                </div>
                <div class="nme-card">
                    <h3>🐞 调试信息</h3>
                    <pre id="debugContent" class="nme-pre">暂无调试信息</pre>
                    <button id="nme-copy-debug-btn" class="nme-btn nme-btn-secondary w-full">📋 复制调试信息</button>
                </div>
            </div>
        </div>
    `;

    // 绑定事件
    bindEvents();
    // 刷新UI数据
    refreshUIData();
}

// ===================== 事件绑定（封闭作用域，避免全局污染） =====================
function bindEvents() {
    const container = state.container;
    if (!container) return;

    // 选项卡切换
    container.querySelectorAll('.nme-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            container.querySelectorAll('.nme-tab-btn').forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.nme-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            container.getElementById(`panel-${tabId}`).classList.add('active');
        });
    });

    // 分组方式切换
    container.querySelectorAll('input[name="groupMode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isChapterMode = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
            container.getElementById('chapter-group-setting').classList.toggle('hidden', !isChapterMode);
            container.getElementById('word-group-setting').classList.toggle('hidden', isChapterMode);
        });
    });

    // 参数联动
    container.getElementById('continue-length').addEventListener('input', (e) => {
        container.getElementById('length-display').textContent = e.target.value;
    });
    container.getElementById('temperature').addEventListener('input', (e) => {
        container.getElementById('temperature-value').textContent = e.target.value;
    });

    // 文件上传
    container.getElementById('nme-file-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        state.isProcessing = true;
        const fileInput = container.getElementById('nme-file-input');
        const statusEl = container.getElementById('nme-upload-status');
        fileInput.disabled = true;
        try {
            statusEl.textContent = '正在读取小说文件...';
            let novelContent = '';
            if (file.name.toLowerCase().endsWith('.txt')) {
                novelContent = await readTxtFile(file);
            } else if (file.name.toLowerCase().endsWith('.epub')) {
                if (!state.isEpubLibLoaded) {
                    throw new Error('EPUB解析库未加载成功，请刷新页面重试，或使用TXT格式');
                }
                novelContent = await readEpubFile(file);
            } else {
                throw new Error('仅支持TXT和EPUB格式');
            }
            if (!novelContent.trim()) throw new Error('文件内容为空');
            
            statusEl.textContent = '正在拆分章节...';
            const chapters = splitChapters(novelContent);
            state.chapters = chapters;
            state.currentChapterId = 0;
            state.generatedChapters = [];
            state.knowledgeGraph = {};

            // 自动生成分组
            const isChapterMode = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
            if (isChapterMode) {
                const groupSize = parseInt(container.getElementById('group-chapter-size').value);
                state.groups = buildGroupsFromChapters(chapters, groupSize);
            } else {
                const wordSize = parseInt(container.getElementById('group-word-size').value);
                state.groups = buildGroupsFromWords(chapters, wordSize);
            }

            // 刷新UI
            refreshUIData();
            await savePluginData(state);
            statusEl.textContent = `✅ 加载完成，共 ${chapters.length} 章，${state.groups.length} 个分组`;
        } catch (err) {
            statusEl.textContent = `❌ ${err.message}`;
            state.addDebugLog('文件读取失败', err.message);
            console.error(err);
        } finally {
            state.isProcessing = false;
            fileInput.disabled = false;
        }
    });

    // 章节选择切换
    container.getElementById('nme-chapter-select').addEventListener('change', (e) => {
        const chapterId = parseInt(e.target.value);
        if (isNaN(chapterId)) return;
        const chapter = state.chapters.find(ch => ch.id === chapterId);
        if (!chapter) return;
        state.currentChapterId = chapterId;
        container.getElementById('nme-original-content').value = chapter.fullContent;
        container.getElementById('nme-edit-content').value = chapter.editContent;
        // 重置续写区域
        container.getElementById('nme-result-content').value = '';
        container.getElementById('nme-continue-container').innerHTML = '';
        state.generatedChapters = [];
        container.getElementById('nme-continue-next-btn').disabled = true;
    });

    // 生成分组按钮
    container.getElementById('nme-regroup-btn').addEventListener('click', () => {
        if (state.isProcessing) {
            alert('正在处理任务中，请稍候');
            return;
        }
        if (!state.chapters.length) {
            alert('请先上传小说');
            return;
        }
        const isChapterMode = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
        let groups = [];
        if (isChapterMode) {
            const groupSize = parseInt(container.getElementById('group-chapter-size').value);
            groups = buildGroupsFromChapters(state.chapters, groupSize);
        } else {
            const wordSize = parseInt(container.getElementById('group-word-size').value);
            groups = buildGroupsFromWords(state.chapters, wordSize);
        }
        state.groups = groups;
        state.knowledgeGraph = {};
        container.getElementById('nme-graph-content').textContent = '请先分析分组并合并汇总图谱';
        renderGroupList();
        alert(`重新分组成功！共生成${groups.length}个分组`);
    });

    // 分析分组按钮
    container.getElementById('nme-analyze-btn').addEventListener('click', async () => {
        if (state.isProcessing) {
            alert('已有任务进行中，请稍候');
            return;
        }
        const start = parseInt(container.getElementById('analyze-start').value) - 1;
        const end = parseInt(container.getElementById('analyze-end').value) - 1;
        if (isNaN(start) || isNaN(end) || start < 0 || end >= state.groups.length || start > end) {
            alert('请设置正确的分析组范围');
            return;
        }
        const toAnalyze = [];
        for (let idx = start; idx <= end; idx++) {
            if (state.groups[idx].status !== 'success') toAnalyze.push(idx);
        }
        if (toAnalyze.length === 0) {
            alert('所选范围内所有分组均已成功分析');
            return;
        }
        state.isProcessing = true;
        const analyzeBtn = container.getElementById('nme-analyze-btn');
        analyzeBtn.disabled = true;
        try {
            for (let idx of toAnalyze) {
                if (state.groups[idx].status === 'success') continue;
                const group = state.groups[idx];
                const prompt = getGroupAnalyzePrompt(group, state.chapters);
                const temperature = parseFloat(container.getElementById('temperature').value);
                try {
                    state.addDebugLog('分组分析', `开始分析第${idx+1}组`);
                    const result = await generateQuietPrompt(prompt, false, temperature, 4000);
                    const jsonStr = extractJSON(result);
                    const parsed = JSON.parse(jsonStr);
                    const required = ['人物信息', '世界观设定', '核心剧情线', '文风特点'];
                    required.forEach(f => { if (!parsed[f]) parsed[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无'; });
                    group.status = 'success';
                    group.data = parsed;
                    group.error = null;
                    state.addDebugLog('分组分析', `第${idx+1}组分析成功`);
                } catch (err) {
                    group.status = 'failed';
                    group.error = err.message;
                    state.addDebugLog('分组分析', `第${idx+1}组分析失败`, err.message);
                }
                renderGroupList();
                await new Promise(r => setTimeout(r, 500));
            }
            await savePluginData(state);
            alert('分析完成！');
        } catch (err) {
            state.addDebugLog('批量分析失败', err.message);
            alert(`分析失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            analyzeBtn.disabled = false;
            renderGroupList();
        }
    });

    // 合并图谱按钮
    container.getElementById('nme-merge-btn').addEventListener('click', async () => {
        if (state.isProcessing) {
            alert('已有任务进行中，请稍候');
            return;
        }
        const successGroups = state.groups.filter(g => g.status === 'success');
        if (successGroups.length === 0) {
            alert('没有成功分析的分组，请先分析至少一个分组');
            return;
        }
        state.isProcessing = true;
        const mergeBtn = container.getElementById('nme-merge-btn');
        mergeBtn.disabled = true;
        mergeBtn.textContent = '合并中...';
        try {
            const prompt = getMergeGraphPrompt(successGroups);
            const temperature = parseFloat(container.getElementById('temperature').value);
            const result = await generateQuietPrompt(prompt, false, temperature, 8000);
            const jsonStr = extractJSON(result);
            let merged = JSON.parse(jsonStr);
            const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点', '实体关系网络', '逆向分析洞察'];
            requiredFields.forEach(field => {
                if (!merged[field]) merged[field] = field === '人物信息' || field === '实体关系网络' ? [] : '暂无';
            });
            if (!Array.isArray(merged.人物信息)) merged.人物信息 = [];
            if (!Array.isArray(merged.实体关系网络)) merged.实体关系网络 = [];
            state.knowledgeGraph = merged;
            container.getElementById('nme-graph-content').textContent = JSON.stringify(merged, null, 2);
            container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
            await savePluginData(state);
            alert('合并成功！');
        } catch (err) {
            state.addDebugLog('图谱合并失败', err.message);
            alert(`合并失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            mergeBtn.disabled = false;
            mergeBtn.textContent = '🧩 合并汇总图谱';
        }
    });

    // 执行魔改续写按钮
    container.getElementById('nme-run-continue-btn').addEventListener('click', async () => {
        if (state.isProcessing) return;
        if (!state.knowledgeGraph || Object.keys(state.knowledgeGraph).length === 0) {
            alert('请先合并生成/导入知识图谱，以保证人设锁定');
            state.addDebugLog('续写失败', '知识图谱为空');
            return;
        }
        const editContent = container.getElementById('nme-edit-content').value.trim();
        const continueLength = parseInt(container.getElementById('continue-length').value);
        const temperature = parseFloat(container.getElementById('temperature').value);
        if (!editContent) {
            alert('请在魔改编辑区输入内容');
            return;
        }
        if (isNaN(continueLength) || continueLength < 500 || continueLength > 10000) {
            alert('续写字数请设置在500-10000之间');
            return;
        }
        state.isProcessing = true;
        const runBtn = container.getElementById('nme-run-continue-btn');
        runBtn.disabled = true;
        runBtn.textContent = '正在生成续写内容...';
        try {
            const preContext = getFirstPreContext(state.chapters, state.currentChapterId);
            const prompt = getFirstContinuePrompt({
                knowledgeGraph: state.knowledgeGraph,
                preContext,
                editContent,
                continueLength
            });
            state.addDebugLog('续写', '构造提示词完成', `长度: ${prompt.length}`);
            const result = await generateQuietPrompt(prompt, false, temperature, continueLength);
            // 更新状态
            const currentChapter = state.chapters[state.currentChapterId];
            currentChapter.editContent = editContent;
            currentChapter.continueContent = result;
            container.getElementById('nme-result-content').value = result;
            container.getElementById('nme-continue-container').innerHTML = '';
            state.generatedChapters = [result];
            container.getElementById('nme-continue-next-btn').disabled = false;
            await savePluginData(state);
            state.addDebugLog('续写成功', '生成内容长度', result.length);
        } catch (err) {
            state.addDebugLog('续写失败', err.message);
            alert(`续写失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            runBtn.disabled = false;
            runBtn.textContent = '🚀 执行魔改续写';
        }
    });

    // 继续续写按钮
    container.getElementById('nme-continue-next-btn').addEventListener('click', async () => {
        await handleContinueWrite(-1);
    });

    // 发送单章节按钮
    container.getElementById('nme-send-single-btn').addEventListener('click', async () => {
        const chapterId = parseInt(container.getElementById('nme-send-chapter-select').value);
        if (isNaN(chapterId)) return;
        const chapter = state.chapters.find(ch => ch.id === chapterId);
        if (!chapter) return;
        const statusEl = container.getElementById('nme-send-status');
        try {
            statusEl.textContent = '正在发送章节...';
            await sendChapterToChat(chapter);
            statusEl.textContent = `✅ 章节「${chapter.title}」发送成功`;
        } catch (err) {
            statusEl.textContent = `❌ 发送失败：${err.message}`;
            state.addDebugLog('发送失败', err.message);
        }
    });

    // 批量发送按钮
    container.getElementById('nme-send-batch-btn').addEventListener('click', async () => {
        if (!state.chapters.length) {
            alert('请先上传小说');
            return;
        }
        if (!confirm(`确定要批量发送${state.chapters.length}个章节到聊天吗？`)) {
            return;
        }
        const statusEl = container.getElementById('nme-send-status');
        try {
            const successCount = await batchSendAllChapters(state.chapters, (current, total) => {
                statusEl.textContent = `正在发送第${current}/${total}章...`;
            });
            statusEl.textContent = `✅ 批量发送完成，成功${successCount}/${state.chapters.length}章`;
        } catch (err) {
            statusEl.textContent = `❌ 批量发送失败：${err.message}`;
            state.addDebugLog('批量发送失败', err.message);
        }
    });

    // 图谱导入导出
    container.getElementById('nme-export-graph-btn').addEventListener('click', () => {
        const graph = state.knowledgeGraph;
        if (!graph || Object.keys(graph).length === 0) {
            alert('暂无可导出的知识图谱');
            return;
        }
        const jsonStr = JSON.stringify(graph, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `小说知识图谱_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('知识图谱导出成功！');
    });

    container.getElementById('nme-import-graph-btn').addEventListener('click', () => {
        container.getElementById('graph-import-input').click();
    });

    container.getElementById('graph-import-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.json')) {
            alert('仅支持JSON格式的图谱文件');
            return;
        }
        try {
            const text = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsText(file, 'utf-8');
            });
            const graph = JSON.parse(text);
            const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点'];
            requiredFields.forEach(field => {
                if (!graph[field]) graph[field] = field === '人物信息' ? [] : '暂无';
            });
            state.knowledgeGraph = graph;
            container.getElementById('nme-graph-content').textContent = JSON.stringify(graph, null, 2);
            container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
            await savePluginData(state);
            alert('知识图谱导入成功！');
        } catch (err) {
            alert(`导入失败：${err.message}`);
            state.addDebugLog('图谱导入失败', err.message);
        } finally {
            e.target.value = '';
        }
    });

    // 调试复制按钮
    container.getElementById('nme-copy-debug-btn').addEventListener('click', () => {
        const text = state.debugLogs.join('\n---\n');
        navigator.clipboard.writeText(text).then(() => {
            alert('调试信息已复制');
        }).catch(() => {
            alert('复制失败');
        });
    });
}

// ===================== 续写核心处理函数 =====================
async function handleContinueWrite(preChapterIndex) {
    const container = state.container;
    if (state.isProcessing) {
        alert('已有任务进行中，请稍候');
        return;
    }
    if (!state.knowledgeGraph || Object.keys(state.knowledgeGraph).length === 0) {
        alert('请先合并生成知识图谱');
        return;
    }
    // 获取前置章节内容
    let preChapterContent = '';
    if (preChapterIndex === -1) {
        preChapterContent = container.getElementById('nme-result-content').value.trim();
    } else {
        const preContentEl = container.getElementById(`continue-chapter-${preChapterIndex}-content`);
        if (!preContentEl) return;
        preChapterContent = preContentEl.value.trim();
    }
    if (!preChapterContent) {
        alert('前置章节内容不能为空');
        return;
    }
    // 仅取最近3章上下文
    const editContent = container.getElementById('nme-edit-content').value.trim();
    const latestThreeChapters = getContinueContext(
        state.chapters,
        state.currentChapterId,
        state.generatedChapters,
        editContent
    );
    const continueLength = parseInt(container.getElementById('continue-length').value);
    const temperature = parseFloat(container.getElementById('temperature').value);
    const nextChapterNum = state.currentChapterId + state.generatedChapters.length + 2;
    // 生成Prompt
    const prompt = getContinuePrompt({
        knowledgeGraph: state.knowledgeGraph,
        latestThreeChapters,
        continueLength,
        nextChapterNum
    });
    // 禁用按钮
    state.isProcessing = true;
    container.querySelectorAll('.nme-btn').forEach(btn => btn.disabled = true);
    try {
        state.addDebugLog('续写', `生成第${nextChapterNum}章`, `提示词长度: ${prompt.length}`);
        const result = await generateQuietPrompt(prompt, false, temperature, continueLength);
        // 生成新章节卡片
        const newChapterIndex = preChapterIndex + 1;
        const cardId = `continue-chapter-${newChapterIndex}`;
        const card = document.createElement('div');
        card.className = 'nme-card continue-card';
        card.id = cardId;
        card.innerHTML = `
            <h4>✨ 续写章节 ${nextChapterNum}</h4>
            <textarea id="${cardId}-content" class="nme-textarea tall" placeholder="续写内容">${result}</textarea>
            <button class="nme-btn nme-btn-success continue-next-btn" data-index="${newChapterIndex}">⏩ 继续续写下一章</button>
        `;
        container.getElementById('nme-continue-container').appendChild(card);
        // 绑定事件
        card.querySelector('.continue-next-btn').addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            await handleContinueWrite(index);
        });
        // 更新状态
        state.generatedChapters.push(result);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        state.addDebugLog('续写成功', `第${nextChapterNum}章生成完成`, `长度: ${result.length}`);
        await savePluginData(state);
    } catch (err) {
        state.addDebugLog('续写失败', err.message);
        alert(`续写失败：${err.message}`);
    } finally {
        state.isProcessing = false;
        container.querySelectorAll('.nme-btn').forEach(btn => btn.disabled = false);
    }
}

// ===================== UI刷新辅助函数 =====================
function refreshUIData() {
    const container = state.container;
    if (!container) return;
    // 刷新章节选择器
    const chapterSelect = container.getElementById('nme-chapter-select');
    const sendChapterSelect = container.getElementById('nme-send-chapter-select');
    const originalContentEl = container.getElementById('nme-original-content');
    const editContentEl = container.getElementById('nme-edit-content');
    if (state.chapters.length > 0) {
        chapterSelect.innerHTML = '';
        sendChapterSelect.innerHTML = '';
        state.chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = chapter.id;
            option.textContent = `${chapter.id + 1} - ${chapter.title}`;
            chapterSelect.appendChild(option.cloneNode(true));
            sendChapterSelect.appendChild(option);
        });
        chapterSelect.disabled = false;
        sendChapterSelect.disabled = false;
        container.getElementById('nme-regroup-btn').disabled = false;
        container.getElementById('nme-send-single-btn').disabled = false;
        container.getElementById('nme-send-batch-btn').disabled = false;
        // 填充当前章节内容
        const currentChapter = state.chapters[state.currentChapterId];
        if (currentChapter) {
            chapterSelect.value = state.currentChapterId;
            originalContentEl.value = currentChapter.fullContent;
            editContentEl.value = currentChapter.editContent;
        }
    }
    // 刷新分组列表
    renderGroupList();
    // 刷新图谱内容
    if (state.knowledgeGraph && Object.keys(state.knowledgeGraph).length > 0) {
        container.getElementById('nme-graph-content').textContent = JSON.stringify(state.knowledgeGraph, null, 2);
        container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
    }
    // 刷新分析范围
    const totalGroups = state.groups.length;
    const startInput = container.getElementById('analyze-start');
    const endInput = container.getElementById('analyze-end');
    if (totalGroups > 0) {
        startInput.max = totalGroups;
        endInput.max = totalGroups;
        endInput.value = totalGroups;
        container.getElementById('nme-analyze-btn').disabled = false;
    }
}

function renderGroupList() {
    const container = state.container;
    if (!container) return;
    const groupContainer = container.getElementById('nme-group-list');
    if (!state.groups.length) {
        groupContainer.innerHTML = '<div class="nme-empty">请先上传小说并生成分组</div>';
        return;
    }
    let html = '';
    state.groups.forEach((group, idx) => {
        const startNum = group.startIdx + 1;
        const endNum = group.endIdx + 1;
        let statusText = '', statusClass = '';
        if (group.status === 'pending') {
            statusText = '未分析';
            statusClass = 'status-pending';
        } else if (group.status === 'success') {
            statusText = '成功';
            statusClass = 'status-success';
        } else {
            statusText = '失败';
            statusClass = 'status-failed';
        }
        html += `
            <div class="nme-group-item">
                <span>第${startNum}-${endNum}章</span>
                <div class="nme-group-item-right">
                    <span class="nme-badge ${statusClass}">${statusText}</span>
                    <button class="nme-btn nme-btn-xs analyze-group-btn" data-index="${idx}">${group.status === 'success' ? '重析' : '分析'}</button>
                </div>
            </div>
        `;
    });
    groupContainer.innerHTML = html;
    // 绑定单组分析按钮
    groupContainer.querySelectorAll('.analyze-group-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = parseInt(e.target.dataset.index);
            if (isNaN(idx)) return;
            if (state.isProcessing) {
                alert('已有任务进行中，请稍候');
                return;
            }
            const group = state.groups[idx];
            state.isProcessing = true;
            btn.disabled = true;
            try {
                const prompt = getGroupAnalyzePrompt(group, state.chapters);
                const temperature = parseFloat(container.getElementById('temperature').value);
                const result = await generateQuietPrompt(prompt, false, temperature, 4000);
                const jsonStr = extractJSON(result);
                const parsed = JSON.parse(jsonStr);
                const required = ['人物信息', '世界观设定', '核心剧情线', '文风特点'];
                required.forEach(f => { if (!parsed[f]) parsed[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无'; });
                group.status = 'success';
                group.data = parsed;
                group.error = null;
                state.addDebugLog('分组分析', `第${idx+1}组分析成功`);
            } catch (err) {
                group.status = 'failed';
                group.error = err.message;
                state.addDebugLog('分组分析', `第${idx+1}组分析失败`, err.message);
                alert(`分析失败：${err.message}`);
            } finally {
                state.isProcessing = false;
                btn.disabled = false;
                renderGroupList();
                // 更新合并按钮状态
                const hasSuccess = state.groups.some(g => g.status === 'success');
                container.getElementById('nme-merge-btn').disabled = !hasSuccess;
            }
        });
    });
    // 更新合并按钮状态
    const hasSuccess = state.groups.some(g => g.status === 'success');
    container.getElementById('nme-merge-btn').disabled = !hasSuccess;
}

// ===================== 【核心修复】ST插件规范：导出顶层load/unload函数 =====================
/**
 * ST插件启用时调用
 * @returns {Promise<void>}
 */
export async function load() {
    try {
        console.log('📖 小说魔改神器插件加载中...');
        // 预加载EPUB库（非阻塞）
        loadEpubLib().catch(() => {});
        // 加载持久化数据
        const savedData = await loadPluginData();
        if (savedData) {
            Object.assign(state, savedData);
        }
        // 注册扩展面板
        registerExtensionPanel({
            id: 'novel-magic-editor',
            title: '📖 小说魔改',
            icon: 'fa-book',
            onRender: (container) => {
                renderPluginUI(container);
            },
            onDestroy: async () => {
                await savePluginData(state);
            }
        });
        console.log('✅ 小说魔改神器插件加载成功');
    } catch (err) {
        console.error('❌ 小说魔改神器插件加载失败', err);
        // 抛出错误让ST捕获，避免静默失败
        throw err;
    }
}

/**
 * ST插件禁用时调用
 * @returns {Promise<void>}
 */
export async function unload() {
    try {
        console.log('📖 小说魔改神器插件卸载中...');
        // 保存数据
        await savePluginData(state);
        // 清空状态
        Object.assign(state, {
            chapters: [],
            groups: [],
            knowledgeGraph: {},
            currentChapterId: 0,
            isProcessing: false,
            generatedChapters: [],
            debugLogs: [],
            container: null
        });
        console.log('✅ 小说魔改神器插件卸载成功');
    } catch (err) {
        console.error('❌ 小说魔改神器插件卸载失败', err);
        throw err;
    }
}
