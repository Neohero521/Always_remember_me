// modules/knowledgeGraph.js - 100%遵循您的规则
import storageManager from './storageManager.js';

class KnowledgeGraph {
    constructor() {
        this.analyzePromptTemplate = `
请严格按照以下规则，对提供的小说章节文本进行分析，仅输出符合要求的纯JSON格式内容，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须以{开头，以}结尾。

强制约束：
1. 只能基于提供的小说文本内容进行分析和推理，绝对不能引入任何文本中不存在的外部元素、设定、概念。
2. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
3. 如果文本中没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

必填字段要求：
1. 人物信息：列出所有主要人物（至少3个，不足3个则列出所有），每个对象包含：姓名、别名/称号、性格特征、身份/背景、核心动机、人物关系（数组，每个关系包含关系对象、关系类型、关系强度0-1、关系描述）、人物弧光（成长变化）。
2. 世界观设定：包含时代背景、地理区域、力量体系/规则、社会结构、独特物品或生物、隐藏设定（可能的伏笔）。
3. 核心剧情线：包含主线剧情描述、关键事件列表（按时间顺序，每个事件包含事件名、参与人物、前因、后果、影响）、剧情分支/支线、核心冲突。
4. 文风特点：叙事视角、语言风格、对话特点、常用修辞、节奏特点。
5. 实体关系网络：输出至少5条三元组 (头实体, 关系, 尾实体)，涵盖人物-人物、人物-地点、人物-事件等。
6. 逆向分析洞察：基于片段推断出的隐藏信息、可能的人物真实身份、未明说的规则、前后文矛盾预警、剧情预测等。

待分析的小说章节文本：
{{chapterContent}}
`;

        this.mergePromptTemplate = `
请严格按照以下规则，对提供的多组小说章节知识图谱进行合并，仅输出符合要求的纯JSON格式内容，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须以{开头，以}结尾。

强制约束：
1. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念。
2. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目。
3. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
4. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

必填字段要求：
1. 人物信息：合并后的完整人物信息，同单章节分析的字段要求。
2. 世界观设定：合并后的完整世界观设定，同单章节分析的字段要求。
3. 核心剧情线：合并后的完整剧情线，同单章节分析的字段要求。
4. 文风特点：合并后的整体文风特点，同单章节分析的字段要求。
5. 实体关系网络：合并后的完整实体关系三元组，去重后保留所有有效关系。
6. 逆向分析洞察：合并后的完整逆向分析洞察，整合所有章节的推断。
7. 质量评估：对合并后的知识图谱的完整性、准确性、一致性进行评估，指出可能存在的问题。

待合并的多组知识图谱数据：
{{graphsJson}}
`;
    }

    async generateContent(prompt, context) {
        const result = await context.llm.generate(prompt, {
            temperature: 0.3,
            top_p: 0.8,
            max_tokens: 4000,
            frequency_penalty: 0.1,
            presence_penalty: 0.1
        });
        return result.trim();
    }

    parseJsonResponse(response) {
        let jsonStr = response.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
        const jsonMatch = jsonStr.match(/^\{[\s\S]*\}$/);
        if (!jsonMatch) throw new Error('AI返回的内容不是有效的JSON格式');
        return JSON.parse(jsonMatch[0]);
    }

    async analyzeChapter(novelId, chapterId, chapterContent, context) {
        if (!chapterContent) throw new Error('章节内容不能为空');
        const prompt = this.analyzePromptTemplate.replace('{{chapterContent}}', chapterContent);
        const response = await this.generateContent(prompt, context);
        const graph = this.parseJsonResponse(response);
        storageManager.saveChapterGraph(novelId, chapterId, graph);
        return graph;
    }

    async mergeNovelGraphs(novelId, context) {
        const graphs = storageManager.getNovelAllGraphs(novelId);
        const graphList = Object.values(graphs).filter(g => g && !g.merged);
        if (graphList.length === 0) throw new Error('没有可合并的章节知识图谱');

        const prompt = this.mergePromptTemplate.replace('{{graphsJson}}', JSON.stringify(graphList, null, 2));
        const response = await this.generateContent(prompt, context);
        const mergedGraph = this.parseJsonResponse(response);
        storageManager.saveMergedGraph(novelId, mergedGraph);
        return mergedGraph;
    }
}

export default new KnowledgeGraph();
