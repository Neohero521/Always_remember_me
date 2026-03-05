// ===================== 全局状态管理 完全复用原HTML逻辑 =====================
const novelState = {
    chapters: [],
    groups: [],
    knowledgeGraph: {},
    currentChapterId: 0,
    novelFullContent: '',
    isProcessing: false,
    baseChapterId: 0,
    generatedChapters: [],
    debugLogs: []
};

// ===================== 调试日志系统 完全保留 =====================
function addDebugLog(type, message, details = '') {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] [${type}] ${message}\n${details ? details + '\n' : ''}`;
    novelState.debugLogs.unshift(log);
    if (novelState.debugLogs.length > 5) novelState.debugLogs.pop();
    updateDebugDisplay();
}

function updateDebugDisplay() {
    const debugEl = document.querySelector('#novel-magic-editor-panel #debugContent');
    if (debugEl) {
        debugEl.textContent = novelState.debugLogs.join('\n---\n') || '暂无调试信息';
    }
}

// ===================== 核心适配：ST原生AI生成API 替换原父级API =====================
async function callSTAIForGenerate(promptToUse, temperature = 0.7, maxTokens = 2000) {
    addDebugLog('AI调用', '尝试调用ST原生生成API', `prompt长度: ${promptToUse.length}`);
    
    // 校验ST API可用性
    if (!window.SillyTavern || !window.SillyTavern.generate) {
        const errorMsg = 'ST生成API未找到，请确认插件运行在SillyTavern环境中';
        addDebugLog('API错误', errorMsg);
        throw new Error(errorMsg);
    }

    try {
        // 调用ST原生生成API，参数对齐原逻辑
        const response = await window.SillyTavern.generate({
            prompt: promptToUse,
            temperature: temperature,
            max_new_tokens: maxTokens,
            stream: false,
            stop: [],
            trim_sentences: false
        });

        // 严格空值校验 完全复用原逻辑
        if (!response || typeof response !== 'string' || response.trim().length === 0) {
            throw new Error('AI返回内容为空，请重试');
        }

        const result = response.trim();
        addDebugLog('API成功', '收到响应', `响应长度: ${result.length}`);
        return result;
    } catch (e) {
        addDebugLog('API错误', '调用生成失败', e.message);
        console.error("ST AI调用失败:", e);
        throw new Error('AI生成失败: ' + e.message);
    }
}

// ===================== 编码与文件读取 100%复用原HTML逻辑 =====================
function scoreDecodedString(str) {
    if (!str || str.length === 0) return -Infinity;
    let chinese = 0, asciiLetter = 0, digit = 0, punctuation = 0, replacement = 0;
    const total = str.length;
    for (let i = 0; i < total; i++) {
        const c = str[i];
        const code = str.charCodeAt(i);
        if (c === '�') {
            replacement++;
        } else if (code >= 0x4e00 && code <= 0x9fff) {
            chinese++;
        } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
            asciiLetter++;
        } else if (code >= 0x30 && code <= 0x39) {
            digit++;
        } else if ('.。,，!！?？:：;；"“”‘\''.includes(c)) {
            punctuation++;
        }
    }
    return chinese * 3 + asciiLetter + digit + punctuation - replacement * 20;
}

function detectBestEncoding(buffer) {
    const encodings = ['utf-8', 'gb18030', 'big5', 'shift-jis', 'utf-16le', 'utf-16be'];
    const sampleSize = Math.min(4 * 1024 * 1024, buffer.length);
    const sample = buffer.slice(0, sampleSize);
    let bestEncoding = 'utf-8';
    let bestScore = -Infinity;
    for (const enc of encodings) {
        try {
            const decoder = new TextDecoder(enc, { fatal: false });
            const decoded = decoder.decode(sample);
            const score = scoreDecodedString(decoded);
            if (score > bestScore) {
                bestScore = score;
                bestEncoding = enc;
            }
        } catch (e) {}
    }
    if (bestScore < 0) return 'utf-8';
    return bestEncoding;
}

async function readTxtFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 50 * 1024 * 1024) {
            reject(new Error('文件过大，请上传小于50MB的TXT文件'));
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                const bestGuess = detectBestEncoding(uint8Array);
                const candidateList = [...new Set([bestGuess, 'gb18030', 'utf-8', 'big5', 'utf-16le', 'utf-16be', 'shift-jis'])];
                let bestContent = '';
                let minReplacement = Infinity;
                for (const enc of candidateList) {
                    try {
                        const decoder = new TextDecoder(enc, { fatal: false });
                        const content = decoder.decode(uint8Array);
                        const replacementCount = (content.match(/�/g) || []).length;
                        if (replacementCount < minReplacement) {
                            minReplacement = replacementCount;
                            bestContent = content;
                        }
                        if (replacementCount === 0) break;
                    } catch (e) {}
                }
                if (!bestContent) throw new Error('所有编码均无法解码文件');
                const processedContent = preprocessNovelContent(bestContent);
                resolve(processedContent);
            } catch (err) {
                reject(new Error('文件解码失败：' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(file);
    });
}

async function readEpubFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 100 * 1024 * 1024) {
            reject(new Error('文件过大，请上传小于100MB的EPUB文件'));
            return;
        }
        // 校验epubjs是否加载完成
        if (typeof ePub === 'undefined') {
            reject(new Error('EPUB解析库加载失败，请刷新页面重试'));
            return;
        }
        const url = URL.createObjectURL(file);
        const book = ePub(url);
        let fullContent = '';
        book.ready.then(() => book.loaded.navigation)
            .then(() => {
                const spineItems = book.spine.items.filter(item => item.href);
                const promises = spineItems.map(item => 
                    book.getChapter(item.href).then(chapter => chapter.textContent || '').catch(() => '')
                );
                return Promise.all(promises);
            })
            .then(chapters => {
                fullContent = chapters.filter(c => c.trim()).join('\n\n');
                URL.revokeObjectURL(url);
                if (!fullContent.trim()) {
                    reject(new Error('EPUB文件内容为空'));
                    return;
                }
                const processedContent = preprocessNovelContent(fullContent);
                resolve(processedContent);
            })
            .catch(err => {
                URL.revokeObjectURL(url);
                reject(new Error('EPUB解析失败：' + err.message));
            });
    });
}

function preprocessNovelContent(content) {
    if (!content) return '';
    content = content.replace(/^\uFEFF/, '');
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const adPatterns = [
        /https?:\/\/[^\s]+/g, /www\.[^\s]+/g, /【.*?】.*?正版.*?/g,
        /本书首发.*?/g, /最新章节.*?/g, /请记住本站.*?/g
    ];
    adPatterns.forEach(pattern => { content = content.replace(pattern, ''); });
    content = content.replace(/[ \t\u3000]+/g, ' ');
    content = content.replace(/\n{3,}/g, '\n\n');
    return content.trim();
}

// ===================== 章节拆分 100%复用原HTML逻辑 =====================
function splitChapters(novelContent) {
    if (!novelContent.trim()) throw new Error('小说内容为空');
    const patterns = [
        /^[\s　]*第[0-9一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟]+[章回节卷部集篇][\s　]*/gm,
        /^[\s　]*[卷部篇集][0-9一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾佰仟]*[\s　]*[章回节][\s　]*/gm,
        /^[\s　]*[0-9]+[.．、][\s　]*/gm,
        /^[\s　]*[一二三四五六七八九十]+[.．、][\s　]*/gm,
        /^[\s　]*(楔子|序章|引子|前言|序言|尾声|番外|后记|附录)[\s　]*/gim
    ];
    const lines = novelContent.split('\n');
    const chapterMarkers = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        for (const pattern of patterns) {
            pattern.lastIndex = 0;
            if (pattern.test(line)) {
                chapterMarkers.push({ index: i, title: line, rawLine: lines[i] });
                break;
            }
        }
    }
    if (chapterMarkers.length === 0) return splitByFixedLength(novelContent);
    const chapters = [];
    if (chapterMarkers[0].index > 0) {
        const prefaceContent = lines.slice(0, chapterMarkers[0].index).join('\n').trim();
        if (prefaceContent) {
            chapters.push({ id: 0, title: '前言/楔子', originalContent: prefaceContent, editContent: prefaceContent, continueContent: '', fullContent: prefaceContent });
        }
    }
    for (let i = 0; i < chapterMarkers.length; i++) {
        const current = chapterMarkers[i];
        const nextIndex = i < chapterMarkers.length - 1 ? chapterMarkers[i + 1].index : lines.length;
        const contentLines = lines.slice(current.index + 1, nextIndex);
        const content = contentLines.join('\n').trim();
        const title = current.title;
        const fullContent = title + '\n' + content;
        const chapterId = (chapters.length > 0 && chapters[0].title === '前言/楔子') ? i + 1 : i;
        chapters.push({ id: chapterId, title, originalContent: content, editContent: fullContent, continueContent: '', fullContent });
    }
    return chapters;
}

function splitByFixedLength(novelContent, wordPerChapter = 8000) {
    const chapters = [];
    const totalLength = novelContent.length;
    const chapterCount = Math.ceil(totalLength / wordPerChapter);
    for (let i = 0; i < chapterCount; i++) {
        const start = i * wordPerChapter;
        const end = Math.min((i + 1) * wordPerChapter, totalLength);
        const content = novelContent.slice(start, end).trim();
        const title = `第${i + 1}章`;
        const fullContent = `${title}\n${content}`;
        chapters.push({ id: i, title, originalContent: content, editContent: fullContent, continueContent: '', fullContent });
    }
    return chapters;
}

// ===================== 分组构建 100%复用原HTML修复后的逻辑 =====================
function buildGroupsFromChapters(groupSize) {
    const chapters = novelState.chapters;
    if (!chapters.length) return [];
    const groups = [];
    for (let i = 0; i < chapters.length; i += groupSize) {
        const startIdx = i;
        const endIdx = Math.min(i + groupSize - 1, chapters.length - 1);
        groups.push({
            id: `group_${i}`,
            startIdx,
            endIdx,
            status: 'pending',
            data: null,
            error: null
        });
    }
    return groups;
}

function buildGroupsFromWords(wordPerGroup) {
    const chapters = novelState.chapters;
    if (!chapters.length) return [];
    const groups = [];
    let currentGroupChapters = [];
    let currentWordCount = 0;
    let groupId = 0;
    chapters.forEach((chapter, idx) => {
        const chapterWordCount = chapter.fullContent.length;
        if (chapterWordCount >= wordPerGroup) {
            if (currentGroupChapters.length > 0) {
                groups.push({
                    id: `group_${groupId}`,
                    startIdx: currentGroupChapters[0],
                    endIdx: currentGroupChapters[currentGroupChapters.length - 1],
                    status: 'pending',
                    data: null,
                    error: null
                });
                groupId++;
                currentGroupChapters = [];
                currentWordCount = 0;
            }
            groups.push({
                id: `group_${groupId}`,
                startIdx: idx,
                endIdx: idx,
                status: 'pending',
                data: null,
                error: null
            });
            groupId++;
        } else {
            if (currentWordCount + chapterWordCount > wordPerGroup && currentGroupChapters.length > 0) {
                groups.push({
                    id: `group_${groupId}`,
                    startIdx: currentGroupChapters[0],
                    endIdx: currentGroupChapters[currentGroupChapters.length - 1],
                    status: 'pending',
                    data: null,
                    error: null
                });
                groupId++;
                currentGroupChapters = [idx];
                currentWordCount = chapterWordCount;
            } else {
                currentGroupChapters.push(idx);
                currentWordCount += chapterWordCount;
            }
        }
    });
    if (currentGroupChapters.length > 0) {
        groups.push({
            id: `group_${groupId}`,
            startIdx: currentGroupChapters[0],
            endIdx: currentGroupChapters[currentGroupChapters.length - 1],
            status: 'pending',
            data: null,
            error: null
        });
    }
    return groups;
}

// ===================== 分组渲染与分析 100%复用原HTML逻辑 =====================
function renderGroupList() {
    const container = document.querySelector('#novel-magic-editor-panel #groupListContainer');
    if (!container) return;
    if (!novelState.groups.length) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-10">请先上传小说，自动生成分组</div>';
        return;
    }
    let html = '';
    novelState.groups.forEach((group, idx) => {
        const startChapterNum = group.startIdx + 1;
        const endChapterNum = group.endIdx + 1;
        let statusText = '', statusClass = '';
        if (group.status === 'pending') {
            statusText = '未分析';
            statusClass = 'group-badge pending';
        } else if (group.status === 'success') {
            statusText = '成功';
            statusClass = 'group-badge success';
        } else {
            statusText = '失败';
            statusClass = 'group-badge failed';
        }
        const actionText = group.status === 'failed' ? '重试' : (group.status === 'success' ? '重析' : '分析');
        html += `
            <div class="flex items-center justify-between bg-white p-2.5 rounded-lg border border-gray-100">
                <span class="text-sm text-gray-700">第${startChapterNum}-${endChapterNum}章</span>
                <div class="flex items-center gap-2">
                    <span class="${statusClass}">${statusText}</span>
                    <button class="text-blue-600 text-sm font-medium analyze-group-btn" data-group-index="${idx}">${actionText}</button>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
    // 绑定分析按钮事件
    document.querySelectorAll('#novel-magic-editor-panel .analyze-group-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = e.target.dataset.groupIndex;
            if (index !== undefined) await analyzeGroup(parseInt(index));
        });
    });
    // 按钮状态更新
    const mergeBtn = document.querySelector('#novel-magic-editor-panel #mergeGroupsBtn');
    if (mergeBtn) {
        const hasSuccess = novelState.groups.some(g => g.status === 'success');
        mergeBtn.disabled = !hasSuccess;
    }
    const totalGroups = novelState.groups.length;
    const startInput = document.querySelector('#novel-magic-editor-panel #analyzeStartGroup');
    const endInput = document.querySelector('#novel-magic-editor-panel #analyzeEndGroup');
    if (startInput && endInput) {
        startInput.max = totalGroups;
        endInput.max = totalGroups;
        if (parseInt(endInput.value) > totalGroups || parseInt(endInput.value) < 1) endInput.value = totalGroups;
        if (parseInt(startInput.value) > totalGroups) startInput.value = 1;
        if (parseInt(startInput.value) < 1) startInput.value = 1;
    }
}

async function analyzeGroup(groupIndex) {
    if (novelState.isProcessing) {
        alert('已有任务进行中，请稍候');
        return;
    }
    const group = novelState.groups[groupIndex];
    if (!group) return;
    let groupContent = '';
    for (let i = group.startIdx; i <= group.endIdx; i++) {
        const ch = novelState.chapters[i];
        if (ch) groupContent += `${ch.title}\n${ch.originalContent}\n\n`;
    }
    if (groupContent.length > 20000) groupContent = groupContent.slice(0, 20000) + '……(内容过长已截断)';
    // 完全复用原HTML的Prompt规则
    const prompt = `你是一名精通小说分析和知识图谱治理的专家。请基于以下小说章节内容（第${group.startIdx+1}至${group.endIdx+1}章），运用逆向分析技术，构建一个详细、结构化、高质量的知识图谱JSON。
【触发词：构建知识图谱JSON、小说章节分析】
【强制约束，必须100%遵守，违反将直接作废】
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的小说文本内容进行分析和推理，绝对不能引入任何文本中不存在的外部元素、设定、概念。
4. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
5. 如果文本中没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。
【必填字段要求】
1. 人物信息：列出所有主要人物（至少3个），每个对象包含：姓名、别名/称号、性格特征、身份/背景、核心动机、人物关系（数组，每个关系包含关系对象、关系类型、关系强度0-1、关系描述）、人物弧光（成长变化）。
2. 世界观设定：包含时代背景、地理区域、力量体系/规则、社会结构、独特物品或生物、隐藏设定（可能的伏笔）。
3. 核心剧情线：包含主线剧情描述、关键事件列表（按时间顺序，每个事件包含事件名、参与人物、前因、后果、影响）、剧情分支/支线、核心冲突。
4. 文风特点：叙事视角、语言风格、对话特点、常用修辞、节奏特点。
5. 实体关系网络：输出至少5条三元组 (头实体, 关系, 尾实体)，涵盖人物-人物、人物-地点、人物-事件等。
6. 逆向分析洞察：基于片段推断出的隐藏信息、可能的人物真实身份、未明说的规则、前后文矛盾预警、剧情预测等。
小说章节内容：
${groupContent}
请直接输出纯JSON：`;
    novelState.isProcessing = true;
    try {
        const temperature = parseFloat(document.querySelector('#novel-magic-editor-panel #temperature').value) || 0.7;
        const result = await callSTAIForGenerate(prompt, temperature, 4000);
        const jsonStr = extractJSON(result);
        const parsed = JSON.parse(jsonStr);
        const required = ['人物信息', '世界观设定', '核心剧情线', '文风特点'];
        required.forEach(f => { if (!parsed[f]) parsed[f] = f === '人物信息' || f === '实体关系网络' ? [] : '暂无'; });
        group.status = 'success';
        group.data = parsed;
        group.error = null;
    } catch (err) {
        group.status = 'failed';
        group.error = err.message;
        console.error(`分组${groupIndex}分析失败:`, err);
        addDebugLog('分析失败', `分组${groupIndex}`, err.message);
    } finally {
        novelState.isProcessing = false;
        renderGroupList();
    }
}

function extractJSON(text) {
    if (!text || typeof text !== 'string') throw new Error('输入内容为空，无法提取JSON');
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    cleaned = cleaned.replace(/^```\s*/gi, '').replace(/```\s*$/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('返回内容中没有找到有效的JSON结构，未匹配到{}');
    }
    let jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z\u4e00-\u9fa5]+)\s*:/g, '$1"$2":');
    jsonStr = jsonStr.replace(/:\s*'([^']*)'/g, ':"$1"');
    try {
        JSON.parse(jsonStr);
        return jsonStr;
    } catch (e) {
        throw new Error(`JSON格式校验失败: ${e.message}`);
    }
}

async function mergeGroups() {
    const successGroups = novelState.groups.filter(g => g.status === 'success');
    if (successGroups.length === 0) {
        alert('没有成功分析的分组，请先分析至少一个分组');
        return;
    }
    const sampleGroup = successGroups[0];
    const groupSizeDesc = sampleGroup ? `每组${sampleGroup.endIdx - sampleGroup.startIdx + 1}章` : '若干章';
    // 完全复用原HTML的合并Prompt规则
    const mergePrompt = `你是一名知识图谱合并专家。以下是多组小说章节分析得出的知识图谱JSON（每组基于连续章节，${groupSizeDesc}）。请将它们合并成一个统一、完整、无冲突的图谱。
【触发词：合并知识图谱JSON、图谱合并】
【强制约束，必须100%遵守，违反将直接作废】
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念。
4. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目。
5. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
6. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。
【必填字段要求】
人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估
各组数据：
${JSON.stringify(successGroups.map(g => g.data), null, 2)}
请直接输出纯JSON：`;
    novelState.isProcessing = true;
    const mergeBtn = document.querySelector('#novel-magic-editor-panel #mergeGroupsBtn');
    const originalText = mergeBtn.textContent;
    mergeBtn.textContent = '合并中...';
    mergeBtn.disabled = true;
    try {
        const temperature = parseFloat(document.querySelector('#novel-magic-editor-panel #temperature').value) || 0.7;
        const result = await callSTAIForGenerate(mergePrompt, temperature, 8000);
        const jsonStr = extractJSON(result);
        let merged = JSON.parse(jsonStr);
        const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点', '实体关系网络', '逆向分析洞察'];
        requiredFields.forEach(field => {
            if (!merged[field]) merged[field] = field === '人物信息' || field === '实体关系网络' ? [] : '暂无';
        });
        if (!Array.isArray(merged.人物信息)) merged.人物信息 = [];
        if (!Array.isArray(merged.实体关系网络)) merged.实体关系网络 = [];
        novelState.knowledgeGraph = merged;
        document.querySelector('#novel-magic-editor-panel #knowledgeGraph').textContent = JSON.stringify(merged, null, 2);
        if (novelState.chapters.length > 0) {
            document.querySelector('#novel-magic-editor-panel #runEditBtn').disabled = false;
        }
        // 持久化图谱
        await savePluginData();
        alert('合并成功！');
    } catch (err) {
        alert('合并失败：' + err.message);
        console.error(err);
        addDebugLog('合并失败', '图谱合并', err.message);
    } finally {
        novelState.isProcessing = false;
        mergeBtn.textContent = originalText;
        mergeBtn.disabled = !successGroups.length;
    }
}

async function analyzeAllPending() {
    if (novelState.isProcessing) return;
    const start = parseInt(document.querySelector('#novel-magic-editor-panel #analyzeStartGroup').value) - 1;
    const end = parseInt(document.querySelector('#novel-magic-editor-panel #analyzeEndGroup').value) - 1;
    if (isNaN(start) || isNaN(end) || start < 0 || end >= novelState.groups.length || start > end) {
        alert('请设置正确的分析组范围');
        return;
    }
    const toAnalyze = [];
    for (let idx = start; idx <= end; idx++) {
        if (novelState.groups[idx].status !== 'success') toAnalyze.push(idx);
    }
    if (toAnalyze.length === 0) {
        alert('所选范围内所有分组均已成功分析');
        return;
    }
    for (let idx of toAnalyze) {
        if (novelState.groups[idx].status === 'success') continue;
        await analyzeGroup(idx);
        await new Promise(r => setTimeout(r, 500));
    }
}

function regroup() {
    if (novelState.isProcessing) {
        alert('正在处理任务中，请稍候再试');
        return;
    }
    const groupSize = parseInt(document.querySelector('#novel-magic-editor-panel #groupSizeInput').value);
    if (isNaN(groupSize) || groupSize < 1) {
        alert('每组章数必须为大于0的整数');
        return;
    }
    if (!novelState.chapters.length) {
        alert('请先上传小说');
        return;
    }
    novelState.groups = buildGroupsFromChapters(groupSize);
    novelState.knowledgeGraph = {};
    document.querySelector('#novel-magic-editor-panel #knowledgeGraph').textContent = '请先分组分析并点击「合并汇总图谱」';
    renderGroupList();
    alert(`重新分组成功！共生成${novelState.groups.length}个分组`);
}

function regroupWord() {
    if (novelState.isProcessing) {
        alert('正在处理任务中，请稍候再试');
        return;
    }
    const wordPerGroup = parseInt(document.querySelector('#novel-magic-editor-panel #groupWordInput').value);
    if (isNaN(wordPerGroup) || wordPerGroup < 1000 || wordPerGroup > 10000) {
        alert('每组字数必须为1000-10000之间的整数');
        return;
    }
    if (!novelState.chapters.length) {
        alert('请先上传小说');
        return;
    }
    novelState.groups = buildGroupsFromWords(wordPerGroup);
    novelState.knowledgeGraph = {};
    document.querySelector('#novel-magic-editor-panel #knowledgeGraph').textContent = '请先分组分析并点击「合并汇总图谱」';
    renderGroupList();
    alert(`按字数重新分组成功！共生成${novelState.groups.length}个分组`);
}

// ===================== 续写核心逻辑 100%复用原HTML修复后的规则 =====================
function getChapterContentByIndex(idx) {
    if (idx < 0) return null;
    if (idx < novelState.baseChapterId) {
        return novelState.chapters[idx]?.editContent || null;
    } else if (idx === novelState.baseChapterId) {
        return document.querySelector('#novel-magic-editor-panel #editContent').value;
    } else {
        const genIndex = idx - novelState.baseChapterId - 1;
        if (genIndex >= 0 && genIndex < novelState.generatedChapters.length) {
            return novelState.generatedChapters[genIndex];
        }
        return null;
    }
}

function createContinueChapterCard(chapterIndex, content) {
    const cardId = `continue-chapter-${chapterIndex}`;
    const card = document.createElement('div');
    card.className = 'continue-chapter-card';
    card.id = cardId;
    card.innerHTML = `
        <div class="continue-chapter-header">
            <span>✨ 续写章节 ${chapterIndex + 1}</span>
            <span>可编辑</span>
        </div>
        <textarea class="continue-chapter-content" id="${cardId}-content"
            placeholder="AI生成的续写内容将显示在这里">${content}</textarea>
        <div class="continue-chapter-footer">
            <button class="continue-chapter-btn btn-click"
                data-chapter-index="${chapterIndex}">
                ⏩ 继续续写下一章
            </button>
        </div>
    `;
    card.querySelector('.continue-chapter-btn').addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.chapterIndex);
        await handleContinueWrite(index);
    });
    return card;
}

async function handleContinueWrite(preChapterIndex) {
    if (novelState.isProcessing) {
        alert('已有任务进行中，请稍候');
        return;
    }
    if (!novelState.knowledgeGraph || Object.keys(novelState.knowledgeGraph).length === 0) {
        alert('请先合并生成/导入知识图谱，以保证人设锁定');
        addDebugLog('续写错误', '知识图谱为空', '请先合并或导入图谱');
        return;
    }
    let preChapterContent = '';
    if (preChapterIndex === -1) {
        preChapterContent = document.querySelector('#novel-magic-editor-panel #resultContent').value.trim();
    } else {
        const preContentEl = document.querySelector(`#novel-magic-editor-panel #continue-chapter-${preChapterIndex}-content`);
        if (!preContentEl) {
            alert('未找到前置章节内容');
            return;
        }
        preChapterContent = preContentEl.value.trim();
    }
    if (!preChapterContent) {
        alert('前置章节内容不能为空');
        return;
    }
    // 完全复用原HTML的上下文规则：仅取最近3章
    const originalChapterList = novelState.chapters
        .slice(0, novelState.currentChapterId + 1)
        .map(ch => ch.editContent.trim());
    const continueChapterList = [];
    const firstContinueContent = document.querySelector('#novel-magic-editor-panel #resultContent').value.trim();
    if (firstContinueContent) continueChapterList.push(firstContinueContent);
    const continueChapterElements = document.querySelectorAll('#novel-magic-editor-panel [id^="continue-chapter-"][id$="-content"]');
    const sortedContinueElements = Array.from(continueChapterElements).sort((a, b) => {
        const idxA = parseInt(a.id.match(/continue-chapter-(\d+)-content/)[1]);
        const idxB = parseInt(b.id.match(/continue-chapter-(\d+)-content/)[1]);
        return idxA - idxB;
    });
    sortedContinueElements.forEach(el => {
        const content = el.value.trim();
        if (content) continueChapterList.push(content);
    });
    const fullChapterList = [...originalChapterList, ...continueChapterList];
    const latestThreeChapters = fullChapterList.slice(-3);
    const preContext = latestThreeChapters.join('\n\n');
    const continueLength = parseInt(document.querySelector('#novel-magic-editor-panel #continueLength').value);
    const temperature = parseFloat(document.querySelector('#novel-magic-editor-panel #temperature').value);
    if (isNaN(continueLength) || continueLength < 500 || continueLength > 10000) { 
        alert('续写字数请设置在500-10000之间'); 
        addDebugLog('续写错误', '字数超出范围', continueLength);
        return; 
    }
    const nextChapterNum = preChapterIndex + 3;
    // 完全复用原HTML的续写Prompt规则
    const prompt = `你是专业的小说续写作家，请基于以下最近三章的内容以及小说的核心设定，续写下一章（第${nextChapterNum}章）。要求：
1. 人设、世界观必须严格贴合提供的核心设定。
2. 剧情必须与最近三章的内容无缝衔接，逻辑自洽，没有矛盾。
3. 文风必须与原文保持一致。
4. 只输出续写的正文，不要任何额外文字。
5. 字数约${continueLength}字，误差不超过10%。
----------------------
原小说核心设定：
${JSON.stringify(novelState.knowledgeGraph, null, 2)}
最近三章内容：
${preContext}
----------------------
请直接输出续写的正文内容：`;
    novelState.isProcessing = true;
    document.querySelectorAll('#novel-magic-editor-panel .continue-chapter-btn, #novel-magic-editor-panel #continueNextBtn, #novel-magic-editor-panel #runEditBtn').forEach(btn => {
        btn.disabled = true;
        btn.textContent = '生成中...';
    });
    const uploadStatus = document.querySelector('#novel-magic-editor-panel #uploadStatus');
    uploadStatus.textContent = '正在调用AI生成续写内容，请稍候...';
    try {
        addDebugLog('续写', '构造提示词完成', `提示词长度: ${prompt.length} | 上下文章节数: ${latestThreeChapters.length}`);
        const continueResult = await callSTAIForGenerate(prompt, temperature, continueLength);
        const newChapterIndex = preChapterIndex + 1;
        const newCard = createContinueChapterCard(newChapterIndex, continueResult);
        document.querySelector('#novel-magic-editor-panel #continueChaptersContainer').appendChild(newCard);
        novelState.generatedChapters.push(continueResult);
        newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        uploadStatus.textContent = `✅ 续写完成，已生成第${nextChapterNum}章`;
        addDebugLog('续写成功', `生成第${nextChapterNum}章`, `长度: ${continueResult.length}`);
        await savePluginData();
    } catch (err) {
        alert(`续写失败：${err.message}\n请查看调试信息获取详情。`);
        uploadStatus.textContent = `❌ 续写失败：${err.message}`;
        console.error(err);
        addDebugLog('续写异常', err.message, err.stack || '');
    } finally {
        novelState.isProcessing = false;
        document.querySelectorAll('#novel-magic-editor-panel .continue-chapter-btn').forEach(btn => {
            btn.disabled = false;
            btn.textContent = '⏩ 继续续写下一章';
        });
        document.querySelector('#novel-magic-editor-panel #continueNextBtn').disabled = false;
        document.querySelector('#novel-magic-editor-panel #continueNextBtn').textContent = '⏩ 继续续写下一章';
        document.querySelector('#novel-magic-editor-panel #runEditBtn').disabled = false;
        document.querySelector('#novel-magic-editor-panel #runEditBtn').textContent = '🚀 执行魔改续写';
    }
}

// ===================== 核心新增：ST /sendas 命令发送章节功能 =====================
async function sendChapterToChat(chapterId, isBatch = false) {
    // 校验ST斜杠命令API
    if (!window.SillyTavern || !window.SillyTavern.executeSlashCommand) {
        alert('ST斜杠命令API不可用，请确认插件运行环境');
        return;
    }
    // 获取当前角色
    const context = window.SillyTavern.getContext();
    const currentChar = context.character;
    if (!currentChar || !currentChar.name) {
        alert('请先选择一个聊天角色，再发送章节');
        return;
    }
    // 获取章节内容
    const chapter = novelState.chapters.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.fullContent.trim()) {
        alert('章节内容为空');
        return;
    }
    try {
        // 构造/sendas命令，完全符合你提供的格式
        const charName = currentChar.name.replace(/"/g, '\\"');
        // 超长章节自动拆分（单条消息不超过4000字，避免上下文超限）
        const maxLength = 4000;
        const content = chapter.fullContent;
        const chunks = [];
        for (let i = 0; i < content.length; i += maxLength) {
            chunks.push(content.slice(i, i + maxLength));
        }
        // 逐块发送
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunk = chunks[idx];
            const chunkTitle = chunks.length > 1 ? `${chapter.title} (${idx+1}/${chunks.length})` : chapter.title;
            const command = `/sendas name="${charName}" ${chunkTitle}\n\n${chunk}`;
            await window.SillyTavern.executeSlashCommand(command);
            // 批量发送加延迟，避免触发限流
            if (isBatch || chunks.length > 1) {
                await new Promise(r => setTimeout(r, 800));
            }
        }
        if (!isBatch) {
            alert(`✅ 章节「${chapter.title}」已发送到聊天`);
        }
        return true;
    } catch (err) {
        console.error('发送章节失败:', err);
        addDebugLog('发送失败', `章节${chapterId}`, err.message);
        if (!isBatch) {
            alert(`发送失败：${err.message}`);
        }
        return false;
    }
}

async function batchSendAllChapters() {
    if (!novelState.chapters.length) {
        alert('请先上传小说，再批量发送');
        return;
    }
    if (!confirm(`确定要批量发送${novelState.chapters.length}个章节到聊天吗？`)) {
        return;
    }
    const sendStatus = document.querySelector('#novel-magic-editor-panel #uploadStatus');
    let successCount = 0;
    for (let i = 0; i < novelState.chapters.length; i++) {
        sendStatus.textContent = `正在发送第${i+1}/${novelState.chapters.length}章...`;
        const result = await sendChapterToChat(novelState.chapters[i].id, true);
        if (result) successCount++;
    }
    sendStatus.textContent = `✅ 批量发送完成，成功${successCount}/${novelState.chapters.length}章`;
    alert(`批量发送完成！成功发送${successCount}个章节`);
}

// ===================== 持久化存储 适配ST插件API =====================
async function savePluginData() {
    if (!window.SillyTavern || !window.SillyTavern.saveData) return;
    try {
        await window.SillyTavern.saveData('novel-magic-editor-state', JSON.stringify({
            chapters: novelState.chapters,
            groups: novelState.groups,
            knowledgeGraph: novelState.knowledgeGraph,
            currentChapterId: novelState.currentChapterId,
            novelFullContent: novelState.novelFullContent
        }));
    } catch (err) {
        console.error('保存插件数据失败:', err);
    }
}

async function loadPluginData() {
    if (!window.SillyTavern || !window.SillyTavern.loadData) return;
    try {
        const savedData = await window.SillyTavern.loadData('novel-magic-editor-state');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            Object.assign(novelState, parsed);
            // 刷新UI
            renderChapterSelect();
            renderGroupList();
            if (novelState.knowledgeGraph && Object.keys(novelState.knowledgeGraph).length > 0) {
                document.querySelector('#novel-magic-editor-panel #knowledgeGraph').textContent = JSON.stringify(novelState.knowledgeGraph, null, 2);
            }
        }
    } catch (err) {
        console.error('加载插件数据失败:', err);
    }
}

// ===================== UI渲染与事件绑定 =====================
function renderChapterSelect() {
    const chapterSelect = document.querySelector('#novel-magic-editor-panel #chapterSelect');
    const originalContent = document.querySelector('#novel-magic-editor-panel #originalContent');
    const editContent = document.querySelector('#novel-magic-editor-panel #editContent');
    if (!chapterSelect) return;
    if (!novelState.chapters.length) {
        chapterSelect.innerHTML = '<option value="">请先上传小说</option>';
        chapterSelect.disabled = true;
        originalContent.value = '';
        editContent.value = '';
        return;
    }
    chapterSelect.innerHTML = '';
    novelState.chapters.forEach(chapter => {
        const option = document.createElement('option');
        option.value = chapter.id;
        option.textContent = `${chapter.id + 1} - ${chapter.title}`;
        chapterSelect.appendChild(option);
    });
    chapterSelect.disabled = false;
    // 选中当前章节
    chapterSelect.value = novelState.currentChapterId;
    const currentChapter = novelState.chapters[novelState.currentChapterId];
    if (currentChapter) {
        originalContent.value = currentChapter.fullContent;
        editContent.value = currentChapter.editContent;
    }
    // 按钮状态更新
    const runEditBtn = document.querySelector('#novel-magic-editor-panel #runEditBtn');
    if (novelState.knowledgeGraph && Object.keys(novelState.knowledgeGraph).length > 0) {
        runEditBtn.disabled = false;
    } else {
        runEditBtn.disabled = true;
    }
}

function renderPluginUI(container) {
    container.id = 'novel-magic-editor-panel';
    container.innerHTML = `
        <!-- 标题区域 -->
        <div class="text-center mb-5">
            <h1 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-1">📖 小说魔改神器</h1>
            <p class="text-gray-500 text-xs">导入 · 灵活分组图谱 · 无限续写 · 一键发送到聊天</p>
        </div>
        <!-- 选项卡导航 -->
        <div class="flex border-b border-gray-200 mb-4 bg-white rounded-t-2xl sticky top-0 z-10 shadow-sm" id="tabNav">
            <button id="tabEditBtn" class="tab-button flex-1 py-3.5 text-center text-sm font-medium text-gray-700 border-b-2 border-transparent tab-active" data-tab="edit">✏️ 魔改编辑</button>
            <button id="tabGraphBtn" class="tab-button flex-1 py-3.5 text-center text-sm font-medium text-gray-700 border-b-2 border-transparent" data-tab="graph">📊 分组图谱</button>
            <button id="tabToolsBtn" class="tab-button flex-1 py-3.5 text-center text-sm font-medium text-gray-700 border-b-2 border-transparent" data-tab="tools">⚙️ 工具/导出</button>
        </div>
        <!-- 面板容器 -->
        <div class="relative flex-1 w-full" id="tabPanelContainer">
            <!-- 面板1：魔改编辑 -->
            <div id="panelEdit" class="tab-panel space-y-4">
                <!-- 上传与状态区域 -->
                <div class="card-item" id="uploadCard">
                    <label class="block text-sm font-semibold text-gray-800 mb-3">📂 上传小说文件</label>
                    <input type="file" id="novelFile" accept=".txt,.epub"
                        class="block w-full text-sm text-gray-600 file:mr-4 file:py-3 file:px-5 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 cursor-pointer">
                    <p id="uploadStatus" class="mt-3 text-xs text-gray-500">支持TXT或EPUB，自动提取章节</p>
                </div>
                <!-- 章节选择与发送 -->
                <div class="card-item">
                    <label class="block text-sm font-semibold text-gray-800 mb-3">📑 选择魔改章节</label>
                    <div class="flex gap-2 mb-3">
                        <select id="chapterSelect" class="flex-1 rounded-xl border-gray-300 border py-3.5 px-4 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white" disabled>
                            <option value="">请先上传小说</option>
                        </select>
                        <button id="sendChapterBtn" class="bg-blue-100 hover:bg-blue-200 text-blue-700 py-2.5 px-4 rounded-xl text-sm font-medium transition btn-click disabled:opacity-50" disabled>📤 发送到聊天</button>
                    </div>
                    <button id="batchSendBtn" class="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 py-2.5 rounded-xl text-sm font-medium transition btn-click disabled:opacity-50" disabled>📤 批量发送所有章节到聊天</button>
                </div>
                <!-- 原文与编辑区 -->
                <div class="card-item overflow-hidden p-0">
                    <div class="bg-gray-50 px-5 py-3 border-b border-gray-100 flex justify-between">
                        <span class="font-semibold text-gray-800 text-sm">📜 原章节原文</span>
                        <span class="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">只读</span>
                    </div>
                    <textarea id="originalContent"
                        class="w-full h-36 p-5 text-sm resize-none focus:outline-none scrollbar-hide bg-gray-50/50"
                        readonly placeholder="上传小说并选择章节后显示原文"></textarea>
                </div>
                <div class="card-item overflow-hidden p-0">
                    <div class="bg-gray-50 px-5 py-3 border-b border-gray-100">
                        <span class="font-semibold text-gray-800 text-sm">✍️ 魔改编辑区 (可修改)</span>
                    </div>
                    <textarea id="editContent"
                        class="w-full h-36 p-5 text-sm resize-none focus:outline-none scrollbar-hide"
                        placeholder="在此处修改剧情，续写将基于此内容"></textarea>
                </div>
                <!-- 执行按钮 -->
                <button id="runEditBtn"
                    class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-4 rounded-xl shadow-md transition-all disabled:bg-gray-400 disabled:cursor-not-allowed text-base flex items-center justify-center gap-2 btn-click" disabled>
                    🚀 执行魔改续写
                </button>
                <!-- 续写结果区域 -->
                <div class="card-item overflow-hidden p-0" id="firstResultCard">
                    <div class="bg-gray-50 px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
                        <span class="font-semibold text-gray-800 text-sm">✨ 魔改续写结果 (下一章)</span>
                        <span class="text-xs text-gray-500 bg-white px-2 py-0.5 rounded-full border border-gray-200">可编辑</span>
                    </div>
                    <textarea id="resultContent"
                        class="w-full h-56 p-5 text-base leading-relaxed resize-none focus:outline-none scrollbar-hide"
                        placeholder="AI生成的后续内容将显示在这里"></textarea>
                    <div class="p-3.5 border-t border-gray-100 flex justify-end bg-gray-50/50">
                        <button id="continueNextBtn"
                            class="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-7 rounded-full text-sm shadow-sm transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-1.5 btn-click min-h-[40px]" disabled>
                            ⏩ 继续续写下一章
                        </button>
                    </div>
                </div>
                <!-- 无限续写章节容器 -->
                <div id="continueChaptersContainer" class="space-y-4"></div>
            </div>
            <!-- 面板2：分组知识图谱 -->
            <div id="panelGraph" class="tab-panel hidden space-y-4">
                <!-- 分组控制卡片 -->
                <div class="card-item">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-800 text-base">⚙️ 分组控制</h3>
                        <span class="bg-blue-100 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">手动调节</span>
                    </div>
                    <!-- 分组方式选择 -->
                    <div class="flex items-center gap-4 mb-3 flex-wrap">
                        <span class="text-sm text-gray-700 font-medium">分组方式：</span>
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="groupMode" id="groupModeChapter" value="chapter" checked class="accent-blue-600">
                            <span class="text-sm text-gray-700">按章节数</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="groupMode" id="groupModeWord" value="word" class="accent-blue-600">
                            <span class="text-sm text-gray-700">按字数</span>
                        </label>
                    </div>
                    <!-- 按章节数分组 -->
                    <div id="chapterGroupContainer" class="flex flex-wrap items-center gap-3 mb-4">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm text-gray-700">每组</span>
                            <input type="number" id="groupSizeInput" value="3" min="1" max="10" step="1" class="w-16 border border-gray-300 rounded-lg py-2.5 px-2 text-sm text-center">
                            <span class="text-sm text-gray-700">章</span>
                        </div>
                        <button id="reGroupBtn" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 py-2.5 px-5 rounded-xl text-sm font-medium transition btn-click">🔄 重新分组</button>
                    </div>
                    <!-- 按字数分组 -->
                    <div id="wordGroupContainer" class="flex flex-wrap items-center gap-3 mb-4 hidden">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm text-gray-700">每组</span>
                            <input type="number" id="groupWordInput" value="5000" min="1000" max="10000" step="100" class="w-20 border border-gray-300 rounded-lg py-2.5 px-2 text-sm text-center">
                            <span class="text-sm text-gray-700">字</span>
                        </div>
                        <button id="reGroupWordBtn" class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 py-2.5 px-5 rounded-xl text-sm font-medium transition btn-click">🔄 重新分组</button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm text-gray-700">分析组范围：第</span>
                        <input type="number" id="analyzeStartGroup" value="1" min="1" class="w-16 border border-gray-300 rounded-lg py-2.5 px-2 text-sm text-center">
                        <span class="text-sm text-gray-700">组 至 第</span>
                        <input type="number" id="analyzeEndGroup" value="1" min="1" class="w-16 border border-gray-300 rounded-lg py-2.5 px-2 text-sm text-center">
                        <span class="text-sm text-gray-700">组</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-3">分析按钮将仅处理所选范围内的未成功分组</p>
                </div>
                <!-- 分组列表卡片 -->
                <div class="card-item">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-gray-800 text-base">📚 章节分组列表</h3>
                    </div>
                    <div id="groupListContainer" class="max-h-64 overflow-auto scrollbar-hide border border-gray-200 rounded-xl p-2 space-y-2 bg-gray-50/30">
                        <div class="text-center text-gray-400 text-sm py-10">请先上传小说，自动生成分组</div>
                    </div>
                    <div class="flex mt-4 gap-3">
                        <button id="analyzeAllGroupsBtn" class="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 py-3 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none btn-click">🔍 分析范围内未分析</button>
                        <button id="mergeGroupsBtn" class="flex-1 bg-green-100 hover:bg-green-200 text-green-700 py-3 rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none btn-click" disabled>🧩 合并汇总图谱</button>
                    </div>
                </div>
                <!-- 汇总图谱展示卡片 -->
                <div class="card-item">
                    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <div class="flex items-center gap-2">
                            <h3 class="font-semibold text-gray-800 text-base">📊 最终整合知识图谱</h3>
                            <span class="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-full font-medium">逆向增强</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <label for="graphImportFile" class="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-medium py-2 px-3.5 rounded-lg transition-all btn-click cursor-pointer">📥 导入图谱</label>
                            <input type="file" id="graphImportFile" accept=".json" class="hidden">
                            <button id="graphExportBtn" class="bg-green-100 hover:bg-green-200 text-green-700 text-xs font-medium py-2 px-3.5 rounded-lg transition-all btn-click">📤 导出图谱</button>
                        </div>
                    </div>
                    <pre id="knowledgeGraph" class="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-xl max-h-[50vh] overflow-auto border border-gray-200 font-mono">请先分组分析并点击「合并汇总图谱」</pre>
                    <p class="text-xs text-gray-500 mt-3">基于成功分析的分组，由AI合并去重，构建完整人设、世界观、关系网 | 导入导出可保留分析结果，无需重复分析</p>
                </div>
            </div>
            <!-- 面板3：工具/导出 -->
            <div id="panelTools" class="tab-panel hidden space-y-4">
                <!-- 续写参数卡片 -->
                <div class="card-item">
                    <h3 class="font-semibold text-gray-800 text-base mb-4 flex items-center gap-1">⚙️ 续写参数</h3>
                    <div class="space-y-5">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">续写字数 <span class="text-blue-600 font-mono font-semibold" id="lengthDisplay">2000</span></label>
                            <input type="number" id="continueLength" value="2000" min="500" max="10000" step="100"
                                class="block w-full rounded-xl border-gray-300 border py-3 px-4 focus:ring-blue-500 focus:border-blue-500 text-sm">
                        </div>
                        <div>
                            <div class="flex justify-between text-sm font-medium text-gray-700 mb-2">
                                <span>续写自由度</span>
                                <span id="temperatureValue" class="text-blue-600 font-semibold">0.7</span>
                            </div>
                            <input type="range" id="temperature" min="0.1" max="1.0" step="0.1" value="0.7"
                                class="block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
                            <div class="flex justify-between text-xs text-gray-500 mt-2">
                                <span>贴合原文</span>
                                <span>自由创作</span>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- 导出卡片 -->
                <div class="card-item">
                    <h3 class="font-semibold text-gray-800 text-base mb-4">📥 导出全本</h3>
                    <button id="exportBtn"
                        class="w-full bg-white hover:bg-gray-50 text-blue-700 border-2 border-blue-200 hover:border-blue-600 font-semibold py-4 px-4 rounded-xl shadow-sm transition-all disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 text-base flex items-center justify-center gap-2 btn-click" disabled>
                        📤 导出魔改后的全本小说
                    </button>
                    <div id="exportStatus" class="text-xs text-center text-gray-500 mt-3"></div>
                </div>
                <div class="text-xs text-gray-500 text-center px-2">
                    * 续写前请确保已合并生成/导入知识图谱，保证人设锁定
                </div>
                <!-- 调试信息卡片 -->
                <div class="card-item">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold text-gray-800 text-base">🐞 调试信息</h3>
                        <button id="copyDebugBtn" class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs px-3 py-1.5 rounded-lg font-medium btn-click">📋 复制</button>
                    </div>
                    <div id="debugContent" class="bg-gray-50 p-4 rounded-xl text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto border border-gray-200">
                        暂无调试信息，执行续写后显示
                    </div>
                    <p class="text-xs text-gray-500 mt-3">记录最近5次API调用状态及错误</p>
                </div>
            </div>
        </div>
        <div class="h-6"></div>
    `;
    // 绑定所有事件
    bindEvents(container);
}

function bindEvents(container) {
    // 选项卡切换
    const tabButtons = container.querySelectorAll('.tab-button');
    const tabPanels = container.querySelectorAll('.tab-panel');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            // 重置所有状态
            tabButtons.forEach(b => b.classList.remove('tab-active'));
            tabPanels.forEach(p => p.classList.add('hidden'));
            // 激活当前
            btn.classList.add('tab-active');
            container.querySelector(`#panel${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`).classList.remove('hidden');
        });
    });
    // 分组方式切换
    container.querySelector('#groupModeChapter').addEventListener('change', () => {
        container.querySelector('#chapterGroupContainer').classList.remove('hidden');
        container.querySelector('#wordGroupContainer').classList.add('hidden');
    });
    container.querySelector('#groupModeWord').addEventListener('change', () => {
        container.querySelector('#chapterGroupContainer').classList.add('hidden');
        container.querySelector('#wordGroupContainer').classList.remove('hidden');
    });
    // 参数联动
    container.querySelector('#continueLength').addEventListener('input', (e) => {
        container.querySelector('#lengthDisplay').textContent = e.target.value;
    });
    container.querySelector('#temperature').addEventListener('input', (e) => {
        container.querySelector('#temperatureValue').textContent = e.target.value;
    });
    // 文件上传
    container.querySelector('#novelFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        novelState.isProcessing = true;
        const novelFileInput = container.querySelector('#novelFile');
        const runEditBtn = container.querySelector('#runEditBtn');
        const exportBtn = container.querySelector('#exportBtn');
        const chapterSelect = container.querySelector('#chapterSelect');
        const continueNextBtn = container.querySelector('#continueNextBtn');
        const sendChapterBtn = container.querySelector('#sendChapterBtn');
        const batchSendBtn = container.querySelector('#batchSendBtn');
        const uploadStatus = container.querySelector('#uploadStatus');
        // 禁用按钮
        novelFileInput.disabled = true;
        runEditBtn.disabled = true;
        exportBtn.disabled = true;
        chapterSelect.disabled = true;
        continueNextBtn.disabled = true;
        sendChapterBtn.disabled = true;
        batchSendBtn.disabled = true;
        try {
            uploadStatus.textContent = '正在读取小说文件...';
            let novelContent = '';
            if (file.name.toLowerCase().endsWith('.txt')) {
                novelContent = await readTxtFile(file);
            } else if (file.name.toLowerCase().endsWith('.epub')) {
                novelContent = await readEpubFile(file);
            } else {
                throw new Error('仅支持TXT和EPUB格式');
            }
            if (!novelContent.trim()) throw new Error('文件内容为空');
            novelState.novelFullContent = novelContent;
            uploadStatus.textContent = '文件读取成功，正在拆分章节...';
            const chapters = splitChapters(novelContent);
            novelState.chapters = chapters;
            // 自动生成分组
            if (container.querySelector('#groupModeWord').checked) {
                const defaultWordSize = parseInt(container.querySelector('#groupWordInput').value) || 5000;
                novelState.groups = buildGroupsFromWords(defaultWordSize);
            } else {
                const defaultSize = parseInt(container.querySelector('#groupSizeInput').value) || 3;
                novelState.groups = buildGroupsFromChapters(defaultSize);
            }
            // 刷新UI
            renderGroupList();
            renderChapterSelect();
            // 重置续写区域
            container.querySelector('#resultContent').value = '';
            container.querySelector('#continueChaptersContainer').innerHTML = '';
            novelState.baseChapterId = novelState.currentChapterId;
            novelState.generatedChapters = [];
            continueNextBtn.disabled = true;
            // 启用按钮
            exportBtn.disabled = false;
            sendChapterBtn.disabled = false;
            batchSendBtn.disabled = false;
            uploadStatus.textContent = `✅ 加载完成，共 ${chapters.length} 章，${novelState.groups.length} 个分组`;
            // 持久化数据
            await savePluginData();
        } catch (err) {
            uploadStatus.textContent = `❌ ${err.message}`;
            console.error(err);
            novelState.chapters = [];
            novelState.groups = [];
            renderChapterSelect();
            renderGroupList();
        } finally {
            novelState.isProcessing = false;
            novelFileInput.disabled = false;
        }
    });
    // 章节选择
    container.querySelector('#chapterSelect').addEventListener('change', (e) => {
        const chapterId = parseInt(e.target.value);
        if (isNaN(chapterId)) return;
        const chapter = novelState.chapters.find(c => c.id === chapterId);
        if (!chapter) return;
        novelState.currentChapterId = chapterId;
        container.querySelector('#originalContent').value = chapter.fullContent;
        container.querySelector('#editContent').value = chapter.editContent;
        // 重置续写区域
        container.querySelector('#resultContent').value = '';
        container.querySelector('#continueChaptersContainer').innerHTML = '';
        novelState.baseChapterId = chapterId;
        novelState.generatedChapters = [];
        container.querySelector('#continueNextBtn').disabled = true;
    });
    // 发送章节按钮
    container.querySelector('#sendChapterBtn').addEventListener('click', async () => {
        const chapterId = parseInt(container.querySelector('#chapterSelect').value);
        if (isNaN(chapterId)) return;
        await sendChapterToChat(chapterId);
    });
    // 批量发送按钮
    container.querySelector('#batchSendBtn').addEventListener('click', batchSendAllChapters);
    // 魔改续写按钮
    container.querySelector('#runEditBtn').addEventListener('click', async () => {
        if (novelState.isProcessing) return;
        if (!novelState.knowledgeGraph || Object.keys(novelState.knowledgeGraph).length === 0) {
            alert('请先合并生成/导入知识图谱，以保证人设锁定');
            addDebugLog('续写错误', '知识图谱为空', '请先合并或导入图谱');
            return;
        }
        const editText = container.querySelector('#editContent').value.trim();
        const continueLength = parseInt(container.querySelector('#continueLength').value);
        const temperature = parseFloat(container.querySelector('#temperature').value);
        if (!editText) { 
            alert('请在魔改编辑区输入修改后的内容'); 
            addDebugLog('续写错误', '编辑区内容为空');
            return; 
        }
        if (isNaN(continueLength) || continueLength < 500 || continueLength > 10000) { 
            alert('续写字数请设置在500-10000之间'); 
            addDebugLog('续写错误', '字数超出范围', continueLength);
            return; 
        }
        novelState.isProcessing = true;
        const runEditBtn = container.querySelector('#runEditBtn');
        const uploadStatus = container.querySelector('#uploadStatus');
        runEditBtn.disabled = true;
        runEditBtn.textContent = '正在生成续写内容...';
        uploadStatus.textContent = '正在调用AI生成续写内容，请稍候...';
        try {
            // 完全复用原HTML的魔改续写逻辑
            async function runMagicEdit(editContent, continueLength, temperature) {
                if (!novelState.chapters.length) throw new Error('请先上传小说');
                const currentChapter = novelState.chapters[novelState.currentChapterId];
                // 仅取前2章+当前章，完全复用原规则
                const preContextStart = Math.max(0, novelState.currentChapterId - 2);
                let preContext = '';
                for (let i = preContextStart; i < novelState.currentChapterId; i++) {
                    preContext += `${novelState.chapters[i].title}\n${novelState.chapters[i].originalContent}\n\n`;
                }
                const maxPreContextLength = 6000;
                preContext = preContext.length > maxPreContextLength ? preContext.slice(-maxPreContextLength) : preContext;
                const prompt = `你是专业的小说续写作家，严格遵循以下规则完成续写任务：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）
2. 剧情衔接：续写内容必须和用户修改后的章节内容、前文剧情完美衔接，逻辑自洽，没有矛盾
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话
5. 输出要求：只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线
6. 字数要求：续写约${continueLength}字，误差不超过10%
----------------------
原小说核心设定：
${JSON.stringify(novelState.knowledgeGraph, null, 2)}
前文剧情铺垫（当前章节之前的内容）：
${preContext}
用户修改后的当前章节内容（从这里的结尾开始续写，不要重复已有内容）：
${editContent}
----------------------
请直接输出续写的正文内容：`;
                addDebugLog('续写', '构造提示词完成', `提示词长度: ${prompt.length}`);
                const result = await callSTAIForGenerate(prompt, temperature, continueLength);
                return result;
            }
            const continueResult = await runMagicEdit(editText, continueLength, temperature);
            const currentChapter = novelState.chapters[novelState.currentChapterId];
            currentChapter.editContent = editText;
            currentChapter.continueContent = continueResult;
            container.querySelector('#resultContent').value = continueResult;
            uploadStatus.textContent = '✅ 魔改续写完成';
            container.querySelector('#continueChaptersContainer').innerHTML = '';
            novelState.baseChapterId = novelState.currentChapterId;
            novelState.generatedChapters = [continueResult];
            container.querySelector('#continueNextBtn').disabled = false;
            addDebugLog('续写成功', '生成内容长度', continueResult.length);
            await savePluginData();
        } catch (err) {
            alert(`续写失败：${err.message}\n请查看调试信息获取详情。`);
            uploadStatus.textContent = `❌ 续写失败：${err.message}`;
            console.error(err);
            addDebugLog('续写异常', err.message, err.stack || '');
        } finally {
            novelState.isProcessing = false;
            runEditBtn.disabled = false;
            runEditBtn.textContent = '🚀 执行魔改续写';
        }
    });
    // 继续续写按钮
    container.querySelector('#continueNextBtn').addEventListener('click', async () => {
        await handleContinueWrite(-1);
    });
    // 分组相关按钮
    container.querySelector('#reGroupBtn').addEventListener('click', regroup);
    container.querySelector('#reGroupWordBtn').addEventListener('click', regroupWord);
    container.querySelector('#analyzeAllGroupsBtn').addEventListener('click', analyzeAllPending);
    container.querySelector('#mergeGroupsBtn').addEventListener('click', mergeGroups);
    // 图谱导入导出
    container.querySelector('#graphExportBtn').addEventListener('click', () => {
        const graph = novelState.knowledgeGraph;
        if (!graph || Object.keys(graph).length === 0) {
            alert('暂无可导出的知识图谱，请先合并生成图谱');
            addDebugLog('导出错误', '图谱导出失败', '暂无可导出的知识图谱');
            return;
        }
        try {
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
            addDebugLog('导出成功', '知识图谱导出成功', `文件名: ${a.download}`);
            alert('知识图谱导出成功！');
        } catch (err) {
            addDebugLog('导出错误', '图谱导出失败', err.message);
            alert(`导出失败：${err.message}`);
        }
    });
    container.querySelector('#graphImportFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.json')) {
            alert('仅支持JSON格式的知识图谱文件');
            addDebugLog('导入错误', '图谱导入失败', '不支持的文件格式');
            return;
        }
        novelState.isProcessing = true;
        try {
            addDebugLog('导入', '开始导入知识图谱', `文件名: ${file.name}`);
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.onerror = () => reject(new Error('文件读取失败'));
                reader.readAsText(file, 'utf-8');
            });
            const graph = JSON.parse(text);
            const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点'];
            requiredFields.forEach(field => {
                if (!graph[field]) graph[field] = field === '人物信息' ? [] : '暂无';
            });
            if (!Array.isArray(graph.人物信息)) graph.人物信息 = [];
            if (!graph.实体关系网络) graph.实体关系网络 = [];
            if (!Array.isArray(graph.实体关系网络)) graph.实体关系网络 = [];
            novelState.knowledgeGraph = graph;
            container.querySelector('#knowledgeGraph').textContent = JSON.stringify(graph, null, 2);
            if (novelState.chapters.length > 0) {
                container.querySelector('#runEditBtn').disabled = false;
            }
            addDebugLog('导入成功', '知识图谱导入成功', `导入后字段: ${Object.keys(graph).join(', ')}`);
            await savePluginData();
            alert('知识图谱导入成功！可直接使用续写功能，无需重新分析');
        } catch (err) {
            addDebugLog('导入错误', '图谱导入失败', err.message);
            alert(`导入失败：${err.message}`);
        } finally {
            novelState.isProcessing = false;
            e.target.value = '';
        }
    });
    // 导出小说
    container.querySelector('#exportBtn').addEventListener('click', () => {
        try {
            if (!novelState.chapters.length) throw new Error('请先上传小说');
            let fullContent = '';
            novelState.chapters.forEach(chapter => {
                fullContent += chapter.editContent + '\n\n';
            });
            const resultContent = container.querySelector('#resultContent').value.trim();
            if (resultContent || novelState.generatedChapters.length > 0) {
                fullContent += '【以下为AI续写章节】\n\n';
                if (resultContent) {
                    fullContent += `第${novelState.currentChapterId + 2}章（续写）\n${resultContent}\n\n`;
                }
                novelState.generatedChapters.forEach((chapter, index) => {
                    const chapterNum = novelState.currentChapterId + 3 + index;
                    let finalContent = chapter;
                    if (index >= 0) {
                        const contentEl = container.querySelector(`#continue-chapter-${index}-content`);
                        if (contentEl) finalContent = contentEl.value.trim();
                    }
                    fullContent += `第${chapterNum}章（续写）\n${finalContent}\n\n`;
                });
            }
            const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '魔改后的小说.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            container.querySelector('#exportStatus').textContent = '✅ 导出成功！小说已保存到本地';
            setTimeout(() => { container.querySelector('#exportStatus').textContent = ''; }, 3000);
        } catch (err) {
            container.querySelector('#exportStatus').textContent = `❌ 导出失败：${err.message}`;
            console.error(err);
        }
    });
    // 调试复制按钮
    container.querySelector('#copyDebugBtn').addEventListener('click', () => {
        const text = novelState.debugLogs.join('\n---\n');
        navigator.clipboard.writeText(text).then(() => {
            alert('调试信息已复制到剪贴板');
        }).catch(() => {
            alert('复制失败，请手动选择复制');
        });
    });
    // 编辑区实时保存
    container.querySelector('#editContent').addEventListener('input', () => {
        if (novelState.chapters[novelState.currentChapterId]) {
            novelState.chapters[novelState.currentChapterId].editContent = container.querySelector('#editContent').value;
        }
    });
}

// ===================== 插件生命周期 适配ST规范 =====================
// 插件初始化
async function init() {
    console.log('📖 小说魔改神器插件初始化');
    // 动态引入epubjs
    if (typeof ePub === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
        script.async = false;
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('epubjs加载失败'));
        });
    }
}

// 插件加载
async function load() {
    console.log('📖 小说魔改神器插件加载');
    // 注册扩展面板
    if (window.SillyTavern && window.SillyTavern.registerExtensionPanel) {
        window.SillyTavern.registerExtensionPanel({
            id: 'novel-magic-editor',
            title: '📖 小说魔改',
            icon: 'fa-book',
            onRender: (container) => {
                renderPluginUI(container);
                // 加载持久化数据
                loadPluginData();
            },
            onDestroy: () => {
                // 清理数据
                savePluginData();
            }
        });
    }
}

// 插件卸载
async function unload() {
    console.log('📖 小说魔改神器插件卸载');
    // 保存数据
    await savePluginData();
    // 清理面板
    if (window.SillyTavern && window.SillyTavern.unregisterExtensionPanel) {
        window.SillyTavern.unregisterExtensionPanel('novel-magic-editor');
    }
}

// 导出插件对象
window.novelMagicEditorPlugin = {
    init,
    load,
    unload,
    info: {
        name: 'Novel-Magic-Editor',
        display_name: '📖 小说魔改神器',
        version: '1.0.0',
        author: 'Neohero521',
        description: '小说章节魔改、知识图谱分析、无限续写插件'
    }
};
