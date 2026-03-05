export function buildGroupsFromChapters(chapters, groupSize) {
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

export function buildGroupsFromWords(chapters, wordPerGroup) {
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

export function getGroupAnalyzePrompt(group, chapters) {
    let groupContent = '';
    for (let i = group.startIdx; i <= group.endIdx; i++) {
        const ch = chapters[i];
        if (ch) groupContent += `${ch.title}\n${ch.originalContent}\n\n`;
    }
    if (groupContent.length > 20000) groupContent = groupContent.slice(0, 20000) + '……(内容过长已截断)';
    
    return `你是一名精通小说分析和知识图谱治理的专家。请基于以下小说章节内容（第${group.startIdx+1}至${group.endIdx+1}章），运用逆向分析技术，构建一个详细、结构化、高质量的知识图谱JSON。
【强制约束，必须100%遵守】
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
}

export function getMergeGraphPrompt(successGroups) {
    const sampleGroup = successGroups[0];
    const groupSizeDesc = sampleGroup ? `每组${sampleGroup.endIdx - sampleGroup.startIdx + 1}章` : '若干章';
    
    return `你是一名知识图谱合并专家。以下是多组小说章节分析得出的知识图谱JSON（每组基于连续章节，${groupSizeDesc}）。请将它们合并成一个统一、完整、无冲突的图谱。
【强制约束，必须100%遵守】
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
}

export function extractJSON(text) {
    if (!text || typeof text !== 'string') throw new Error('输入内容为空，无法提取JSON');
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    cleaned = cleaned.replace(/^```\s*/gi, '').replace(/```\s*$/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('返回内容中没有找到有效的JSON结构');
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
