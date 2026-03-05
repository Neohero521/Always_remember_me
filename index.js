// ===================== ST核心API导入（路径100%正确，带.js后缀） =====================
import { getContext, registerExtensionPanel, generateQuietPrompt, executeSlashCommand } from "../../script.js";

// ===================== 内部模块导入（带完整.js后缀，路径正确） =====================
import { readTxtFile, readEpubFile, splitChapters } from './modules/novelParser.js';
import { buildGroupsFromChapters, buildGroupsFromWords, getGroupAnalyzePrompt, getMergeGraphPrompt, extractJSON } from './modules/groupAnalyzer.js';
import { getContinuePrompt, getFirstContinuePrompt, getContinueContext, getFirstPreContext } from './modules/continueWriter.js';

// ===================== 全局状态（仅声明，无顶层执行） =====================
const state = {
    chapters: [],
    groups: [],
    knowledgeGraph: {},
    currentChapterId: 0,
    isProcessing: false,
    generatedChapters: [],
    debugLogs: [],
    container: null
};

// ===================== 工具函数（仅声明，无顶层执行） =====================
function addDebugLog(type, message, details = '') {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] [${type}] ${message}\n${details ? details + '\n' : ''}`;
    state.debugLogs.unshift(log);
    if (state.debugLogs.length > 5) state.debugLogs.pop();
    updateDebugDisplay();
}

function updateDebugDisplay() {
    if (!state.container) return;
    const debugEl = state.container.querySelector('#debugContent');
    if (debugEl) debugEl.textContent = state.debugLogs.join('\n---\n') || '暂无调试信息';
}

const EXTENSION_ID = 'novel-magic-editor';
async function saveData() {
    try {
        const context = getContext();
        const saveData = {
            chapters: state.chapters,
            groups: state.groups,
            knowledgeGraph: state.knowledgeGraph,
            currentChapterId: state.currentChapterId,
            generatedChapters: state.generatedChapters
        };
        await context.setExtensionSetting(EXTENSION_ID, 'data', JSON.stringify(saveData));
    } catch (err) {
        console.error('保存数据失败', err);
    }
}

async function loadData() {
    try {
        const context = getContext();
        const saved = await context.getExtensionSetting(EXTENSION_ID, 'data');
        if (saved) return JSON.parse(saved);
        return null;
    } catch (err) {
        console.error('加载数据失败', err);
        return null;
    }
}

async function sendChapterToChat(chapter, isBatch = false) {
    const context = getContext();
    const currentChar = context.character;
    if (!currentChar || !currentChar.name) throw new Error('请先选择聊天角色');
    if (!chapter?.fullContent) throw new Error('章节内容为空');

    const charName = currentChar.name.replace(/"/g, '\\"');
    const maxLength = 4000;
    const content = chapter.fullContent;
    const chunks = [];
    for (let i = 0; i < content.length; i += maxLength) chunks.push(content.slice(i, i + maxLength));

    for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx];
        const title = chunks.length > 1 ? `${chapter.title} (${idx+1}/${chunks.length})` : chapter.title;
        const command = `/sendas name="${charName}" ${title}\n\n${chunk}`;
        await executeSlashCommand(command);
        if (isBatch || chunks.length > 1) await new Promise(r => setTimeout(r, 800));
    }
    return true;
}

async function batchSendChapters(onProgress) {
    if (!state.chapters.length) throw new Error('暂无章节可发送');
    let success = 0;
    for (let i = 0; i < state.chapters.length; i++) {
        try {
            if (onProgress) onProgress(i+1, state.chapters.length);
            await sendChapterToChat(state.chapters[i], true);
            success++;
        } catch (err) {
            console.error(`第${i+1}章发送失败`, err);
        }
    }
    return success;
}

// ===================== UI渲染（仅声明，无顶层执行） =====================
function renderUI(container) {
    state.container = container;
    container.id = 'novel-magic-editor';
    container.innerHTML = `
        <div class="nme-header">
            <h2>📖 小说魔改神器</h2>
            <p class="nme-desc">小说解析 · 知识图谱 · 人设锁定续写 · 一键发送到聊天</p>
        </div>

        <div class="nme-tabs">
            <button class="nme-tab-btn active" data-tab="import">📂 小说导入</button>
            <button class="nme-tab-btn" data-tab="analyze">📊 图谱分析</button>
            <button class="nme-tab-btn" data-tab="continue">✍️ 续写编辑</button>
            <button class="nme-tab-btn" data-tab="send">📤 发送聊天</button>
        </div>

        <div class="nme-panels">
            <div class="nme-panel active" id="panel-import">
                <div class="nme-card">
                    <h3>📂 上传小说文件</h3>
                    <input type="file" id="nme-file-input" accept=".txt,.epub" class="nme-file-input">
                    <p id="nme-upload-status" class="nme-status">支持TXT/EPUB，自动识别编码、拆分章节</p>
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

            <div class="nme-panel" id="panel-analyze">
                <div class="nme-card">
                    <h3>⚙️ 分组设置</h3>
                    <div class="nme-form-row">
                        <label>分组方式：</label>
                        <div class="nme-radio-group">
                            <label class="nme-radio"><input type="radio" name="groupMode" value="chapter" checked><span>按章节数</span></label>
                            <label class="nme-radio"><input type="radio" name="groupMode" value="word"><span>按字数</span></label>
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
                        <div class="nme-slider-desc"><span>贴合原文</span><span>自由创作</span></div>
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
    bindEvents();
    refreshUI();
}

// ===================== 事件绑定（仅声明，无顶层执行） =====================
function bindEvents() {
    const container = state.container;
    if (!container) return;

    container.querySelectorAll('.nme-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            container.querySelectorAll('.nme-tab-btn').forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.nme-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            container.getElementById(`panel-${tabId}`).classList.add('active');
        });
    });

    container.querySelectorAll('input[name="groupMode"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isChapter = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
            container.getElementById('chapter-group-setting').classList.toggle('hidden', !isChapter);
            container.getElementById('word-group-setting').classList.toggle('hidden', isChapter);
        });
    });

    container.getElementById('continue-length').addEventListener('input', e => {
        container.getElementById('length-display').textContent = e.target.value;
    });
    container.getElementById('temperature').addEventListener('input', e => {
        container.getElementById('temperature-value').textContent = e.target.value;
    });

    container.getElementById('nme-file-input').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        state.isProcessing = true;
        const fileInput = container.getElementById('nme-file-input');
        const statusEl = container.getElementById('nme-upload-status');
        fileInput.disabled = true;
        try {
            statusEl.textContent = '正在读取文件...';
            let content = '';
            if (file.name.toLowerCase().endsWith('.txt')) {
                content = await readTxtFile(file);
            } else if (file.name.toLowerCase().endsWith('.epub')) {
                if (typeof ePub === 'undefined') {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }
                content = await readEpubFile(file);
            } else {
                throw new Error('仅支持TXT/EPUB格式');
            }
            if (!content.trim()) throw new Error('文件内容为空');
            
            statusEl.textContent = '正在拆分章节...';
            const chapters = splitChapters(content);
            state.chapters = chapters;
            state.currentChapterId = 0;
            state.generatedChapters = [];
            state.knowledgeGraph = {};

            const isChapter = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
            state.groups = isChapter 
                ? buildGroupsFromChapters(chapters, parseInt(container.getElementById('group-chapter-size').value))
                : buildGroupsFromWords(chapters, parseInt(container.getElementById('group-word-size').value));

            await saveData();
            refreshUI();
            statusEl.textContent = `✅ 加载完成，共 ${chapters.length} 章，${state.groups.length} 个分组`;
            addDebugLog('文件加载', `成功加载${chapters.length}章`);
        } catch (err) {
            statusEl.textContent = `❌ ${err.message}`;
            addDebugLog('文件加载失败', err.message);
        } finally {
            state.isProcessing = false;
            fileInput.disabled = false;
        }
    });

    container.getElementById('nme-chapter-select').addEventListener('change', e => {
        const chapterId = parseInt(e.target.value);
        if (isNaN(chapterId)) return;
        const chapter = state.chapters.find(ch => ch.id === chapterId);
        if (!chapter) return;
        state.currentChapterId = chapterId;
        container.getElementById('nme-original-content').value = chapter.fullContent;
        container.getElementById('nme-edit-content').value = chapter.editContent;
        container.getElementById('nme-result-content').value = '';
        container.getElementById('nme-continue-container').innerHTML = '';
        state.generatedChapters = [];
        container.getElementById('nme-continue-next-btn').disabled = true;
    });

    container.getElementById('nme-regroup-btn').addEventListener('click', () => {
        if (state.isProcessing || !state.chapters.length) return;
        const isChapter = container.querySelector('input[name="groupMode"][value="chapter"]').checked;
        state.groups = isChapter 
            ? buildGroupsFromChapters(state.chapters, parseInt(container.getElementById('group-chapter-size').value))
            : buildGroupsFromWords(state.chapters, parseInt(container.getElementById('group-word-size').value));
        state.knowledgeGraph = {};
        container.getElementById('nme-graph-content').textContent = '请先分析分组并合并汇总图谱';
        refreshUI();
        alert(`重新分组成功！共${state.groups.length}个分组`);
    });

    container.getElementById('nme-analyze-btn').addEventListener('click', async () => {
        if (state.isProcessing) return;
        const start = parseInt(container.getElementById('analyze-start').value) - 1;
        const end = parseInt(container.getElementById('analyze-end').value) - 1;
        if (isNaN(start) || isNaN(end) || start < 0 || end >= state.groups.length || start > end) {
            alert('请设置正确的分析范围');
            return;
        }
        const toAnalyze = [];
        for (let i = start; i <= end; i++) {
            if (state.groups[i].status !== 'success') toAnalyze.push(i);
        }
        if (toAnalyze.length === 0) {
            alert('所选范围无待分析分组');
            return;
        }
        state.isProcessing = true;
        const analyzeBtn = container.getElementById('nme-analyze-btn');
        analyzeBtn.disabled = true;
        try {
            for (const idx of toAnalyze) {
                const group = state.groups[idx];
                const prompt = getGroupAnalyzePrompt(group, state.chapters);
                const temperature = parseFloat(container.getElementById('temperature').value);
                try {
                    addDebugLog('分组分析', `开始分析第${idx+1}组`);
                    const result = await generateQuietPrompt(prompt, false, temperature, 4000);
                    const jsonStr = extractJSON(result);
                    const parsed = JSON.parse(jsonStr);
                    ['人物信息', '世界观设定', '核心剧情线', '文风特点'].forEach(f => {
                        if (!parsed[f]) parsed[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无';
                    });
                    group.status = 'success';
                    group.data = parsed;
                } catch (err) {
                    group.status = 'failed';
                    group.error = err.message;
                    addDebugLog('分组分析失败', `第${idx+1}组`, err.message);
                }
                refreshUI();
                await new Promise(r => setTimeout(r, 500));
            }
            await saveData();
            alert('分析完成！');
        } catch (err) {
            addDebugLog('批量分析失败', err.message);
            alert(`分析失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            analyzeBtn.disabled = false;
        }
    });

    container.getElementById('nme-merge-btn').addEventListener('click', async () => {
        if (state.isProcessing) return;
        const successGroups = state.groups.filter(g => g.status === 'success');
        if (successGroups.length === 0) {
            alert('无成功分析的分组');
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
            const merged = JSON.parse(jsonStr);
            ['人物信息', '世界观设定', '核心剧情线', '文风特点', '实体关系网络', '逆向分析洞察'].forEach(f => {
                if (!merged[f]) merged[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无';
            });
            state.knowledgeGraph = merged;
            container.getElementById('nme-graph-content').textContent = JSON.stringify(merged, null, 2);
            container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
            await saveData();
            alert('合并成功！');
        } catch (err) {
            addDebugLog('图谱合并失败', err.message);
            alert(`合并失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            mergeBtn.disabled = false;
            mergeBtn.textContent = '🧩 合并汇总图谱';
        }
    });

    container.getElementById('nme-run-continue-btn').addEventListener('click', async () => {
        if (state.isProcessing) return;
        if (!state.knowledgeGraph || Object.keys(state.knowledgeGraph).length === 0) {
            alert('请先合并生成知识图谱');
            return;
        }
        const editContent = container.getElementById('nme-edit-content').value.trim();
        const continueLength = parseInt(container.getElementById('continue-length').value);
        const temperature = parseFloat(container.getElementById('temperature').value);
        if (!editContent || isNaN(continueLength)) return;

        state.isProcessing = true;
        const runBtn = container.getElementById('nme-run-continue-btn');
        runBtn.disabled = true;
        runBtn.textContent = '生成中...';
        try {
            const preContext = getFirstPreContext(state.chapters, state.currentChapterId);
            const prompt = getFirstContinuePrompt({
                knowledgeGraph: state.knowledgeGraph,
                preContext,
                editContent,
                continueLength
            });
            const result = await generateQuietPrompt(prompt, false, temperature, continueLength);
            const currentChapter = state.chapters[state.currentChapterId];
            currentChapter.editContent = editContent;
            currentChapter.continueContent = result;
            container.getElementById('nme-result-content').value = result;
            container.getElementById('nme-continue-container').innerHTML = '';
            state.generatedChapters = [result];
            container.getElementById('nme-continue-next-btn').disabled = false;
            await saveData();
            addDebugLog('续写成功', `生成内容长度${result.length}`);
        } catch (err) {
            addDebugLog('续写失败', err.message);
            alert(`续写失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            runBtn.disabled = false;
            runBtn.textContent = '🚀 执行魔改续写';
        }
    });

    async function handleContinueWrite(preIndex) {
        if (state.isProcessing || !state.knowledgeGraph) return;
        const container = state.container;
        let preContent = '';
        if (preIndex === -1) {
            preContent = container.getElementById('nme-result-content').value.trim();
        } else {
            const el = container.getElementById(`continue-chapter-${preIndex}-content`);
            if (!el) return;
            preContent = el.value.trim();
        }
        if (!preContent) {
            alert('前置章节内容不能为空');
            return;
        }
        const editContent = container.getElementById('nme-edit-content').value.trim();
        const latestThree = getContinueContext(state.chapters, state.currentChapterId, state.generatedChapters, editContent);
        const continueLength = parseInt(container.getElementById('continue-length').value);
        const temperature = parseFloat(container.getElementById('temperature').value);
        const nextChapterNum = state.currentChapterId + state.generatedChapters.length + 2;
        const prompt = getContinuePrompt({
            knowledgeGraph: state.knowledgeGraph,
            latestThreeChapters: latestThree,
            continueLength,
            nextChapterNum
        });

        state.isProcessing = true;
        container.querySelectorAll('.nme-btn').forEach(btn => btn.disabled = true);
        try {
            const result = await generateQuietPrompt(prompt, false, temperature, continueLength);
            const newIndex = preIndex + 1;
            const cardId = `continue-chapter-${newIndex}`;
            const card = document.createElement('div');
            card.className = 'nme-card';
            card.id = cardId;
            card.innerHTML = `
                <h4>✨ 续写章节 ${nextChapterNum}</h4>
                <textarea id="${cardId}-content" class="nme-textarea tall">${result}</textarea>
                <button class="nme-btn nme-btn-success continue-next-btn" data-index="${newIndex}">⏩ 继续续写下一章</button>
            `;
            container.getElementById('nme-continue-container').appendChild(card);
            card.querySelector('.continue-next-btn').addEventListener('click', async e => {
                await handleContinueWrite(parseInt(e.target.dataset.index));
            });
            state.generatedChapters.push(result);
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await saveData();
        } catch (err) {
            addDebugLog('续写失败', err.message);
            alert(`续写失败：${err.message}`);
        } finally {
            state.isProcessing = false;
            container.querySelectorAll('.nme-btn').forEach(btn => btn.disabled = false);
        }
    }

    container.getElementById('nme-continue-next-btn').addEventListener('click', async () => {
        await handleContinueWrite(-1);
    });

    container.getElementById('nme-send-single-btn').addEventListener('click', async () => {
        const chapterId = parseInt(container.getElementById('nme-send-chapter-select').value);
        const chapter = state.chapters.find(ch => ch.id === chapterId);
        const statusEl = container.getElementById('nme-send-status');
        if (!chapter) return;
        try {
            statusEl.textContent = '正在发送...';
            await sendChapterToChat(chapter);
            statusEl.textContent = `✅ 章节「${chapter.title}」发送成功`;
        } catch (err) {
            statusEl.textContent = `❌ 发送失败：${err.message}`;
            addDebugLog('发送失败', err.message);
        }
    });

    container.getElementById('nme-send-batch-btn').addEventListener('click', async () => {
        if (!state.chapters.length) return;
        if (!confirm(`确定批量发送${state.chapters.length}个章节？`)) return;
        const statusEl = container.getElementById('nme-send-status');
        try {
            const success = await batchSendChapters((current, total) => {
                statusEl.textContent = `正在发送第${current}/${total}章...`;
            });
            statusEl.textContent = `✅ 批量发送完成，成功${success}/${state.chapters.length}章`;
        } catch (err) {
            statusEl.textContent = `❌ 批量发送失败：${err.message}`;
            addDebugLog('批量发送失败', err.message);
        }
    });

    container.getElementById('nme-export-graph-btn').addEventListener('click', () => {
        if (!state.knowledgeGraph || Object.keys(state.knowledgeGraph).length === 0) {
            alert('暂无可导出的图谱');
            return;
        }
        const blob = new Blob([JSON.stringify(state.knowledgeGraph, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `小说知识图谱_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    container.getElementById('nme-import-graph-btn').addEventListener('click', () => {
        container.getElementById('graph-import-input').click();
    });

    container.getElementById('graph-import-input').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = ev => resolve(ev.target.result);
                reader.readAsText(file, 'utf-8');
            });
            const graph = JSON.parse(text);
            state.knowledgeGraph = graph;
            container.getElementById('nme-graph-content').textContent = JSON.stringify(graph, null, 2);
            container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
            await saveData();
            alert('图谱导入成功！');
        } catch (err) {
            alert(`导入失败：${err.message}`);
        } finally {
            e.target.value = '';
        }
    });

    container.getElementById('nme-copy-debug-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(state.debugLogs.join('\n---\n')).then(() => {
            alert('调试信息已复制');
        }).catch(() => {
            alert('复制失败');
        });
    });
}

// ===================== UI刷新 =====================
function refreshUI() {
    const container = state.container;
    if (!container) return;
    const chapterSelect = container.getElementById('nme-chapter-select');
    const sendSelect = container.getElementById('nme-send-chapter-select');
    const originalEl = container.getElementById('nme-original-content');
    const editEl = container.getElementById('nme-edit-content');

    if (state.chapters.length > 0) {
        chapterSelect.innerHTML = '';
        sendSelect.innerHTML = '';
        state.chapters.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch.id;
            opt.textContent = `${ch.id + 1} - ${ch.title}`;
            chapterSelect.appendChild(opt.cloneNode(true));
            sendSelect.appendChild(opt);
        });
        chapterSelect.disabled = false;
        sendSelect.disabled = false;
        container.getElementById('nme-regroup-btn').disabled = false;
        container.getElementById('nme-send-single-btn').disabled = false;
        container.getElementById('nme-send-batch-btn').disabled = false;
        const current = state.chapters[state.currentChapterId];
        if (current) {
            chapterSelect.value = state.currentChapterId;
            originalEl.value = current.fullContent;
            editEl.value = current.editContent;
        }
    }

    const groupContainer = container.getElementById('nme-group-list');
    if (state.groups.length > 0) {
        let html = '';
        state.groups.forEach((group, idx) => {
            const start = group.startIdx + 1;
            const end = group.endIdx + 1;
            let status = '', statusClass = '';
            if (group.status === 'pending') { status = '未分析'; statusClass = 'status-pending'; }
            else if (group.status === 'success') { status = '成功'; statusClass = 'status-success'; }
            else { status = '失败'; statusClass = 'status-failed'; }
            html += `
                <div class="nme-group-item">
                    <span>第${start}-${end}章</span>
                    <div class="nme-group-item-right">
                        <span class="nme-badge ${statusClass}">${status}</span>
                        <button class="nme-btn nme-btn-xs analyze-single-btn" data-index="${idx}">${group.status === 'success' ? '重析' : '分析'}</button>
                    </div>
                </div>
            `;
        });
        groupContainer.innerHTML = html;
        groupContainer.querySelectorAll('.analyze-single-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                const idx = parseInt(e.target.dataset.index);
                if (state.isProcessing || isNaN(idx)) return;
                const group = state.groups[idx];
                state.isProcessing = true;
                btn.disabled = true;
                try {
                    const prompt = getGroupAnalyzePrompt(group, state.chapters);
                    const temperature = parseFloat(container.getElementById('temperature').value);
                    const result = await generateQuietPrompt(prompt, false, temperature, 4000);
                    const jsonStr = extractJSON(result);
                    const parsed = JSON.parse(jsonStr);
                    ['人物信息', '世界观设定', '核心剧情线', '文风特点'].forEach(f => {
                        if (!parsed[f]) parsed[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无';
                    });
                    group.status = 'success';
                    group.data = parsed;
                    refreshUI();
                    await saveData();
                } catch (err) {
                    group.status = 'failed';
                    group.error = err.message;
                    alert(`分析失败：${err.message}`);
                } finally {
                    state.isProcessing = false;
                    btn.disabled = false;
                }
            });
        });
        const hasSuccess = state.groups.some(g => g.status === 'success');
        container.getElementById('nme-merge-btn').disabled = !hasSuccess;
        container.getElementById('nme-analyze-btn').disabled = false;
        const startInput = container.getElementById('analyze-start');
        const endInput = container.getElementById('analyze-end');
        startInput.max = state.groups.length;
        endInput.max = state.groups.length;
        endInput.value = state.groups.length;
    } else {
        groupContainer.innerHTML = '<div class="nme-empty">请先上传小说并生成分组</div>';
    }

    if (state.knowledgeGraph && Object.keys(state.knowledgeGraph).length > 0) {
        container.getElementById('nme-graph-content').textContent = JSON.stringify(state.knowledgeGraph, null, 2);
        container.getElementById('nme-run-continue-btn').disabled = state.chapters.length === 0;
    }

    updateDebugDisplay();
}

// ===================== 【强制规范】ST扩展生命周期 顶层导出 =====================
export async function load() {
    try {
        console.log('📖 小说魔改神器 开始加载');
        // 加载持久化数据
        const saved = await loadData();
        if (saved) Object.assign(state, saved);
        // 注册扩展面板
        registerExtensionPanel({
            id: 'novel-magic-editor',
            title: '📖 小说魔改',
            icon: 'fa-book',
            onRender: (container) => renderUI(container),
            onDestroy: async () => await saveData()
        });
        console.log('✅ 小说魔改神器 加载成功');
    } catch (err) {
        console.error('❌ 小说魔改神器 加载失败', err);
        // 抛出具体错误，ST会显示详细信息，不再是模糊的[object Event]
        throw new Error(`插件加载失败: ${err.message || err}`);
    }
}

export async function unload() {
    try {
        console.log('📖 小说魔改神器 卸载中');
        await saveData();
        Object.assign(state, {
            chapters: [], groups: [], knowledgeGraph: {}, currentChapterId: 0,
            isProcessing: false, generatedChapters: [], debugLogs: [], container: null
        });
        console.log('✅ 小说魔改神器 卸载完成');
    } catch (err) {
        console.error('❌ 小说魔改神器 卸载失败', err);
        throw err;
    }
}
