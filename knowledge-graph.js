import { getContext } from '../../../script.js';
import { getCurrentChapter, getChapterList, getChapterContent } from './novel-parser.js';

export function loadKnowledgeGraph() {
  console.log('[Novel-Continuation-Plugin] 知识图谱模块加载完成');
}

export async function buildChapterGraph(chapterContent = null) {
  const context = getContext();
  const content = chapterContent || getCurrentChapter()?.content;
  if (!content) throw new Error('章节内容不能为空');
  
  const prompt = `
请严格按照以下规则分析小说章节内容，输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须以{开头，以}结尾。

强制约束：
1. 只能基于提供的小说文本内容进行分析和推理，绝对不能引入任何文本中不存在的外部元素、设定、概念。
2. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
3. 如果文本中没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

必填字段要求：
1. 人物信息：列出所有主要人物（至少3个，不足3个则补充次要人物，没有则设为[]），每个对象包含：姓名、别名/称号、性格特征、身份/背景、核心动机、人物关系（数组，每个关系包含关系对象、关系类型、关系强度0-1、关系描述）、人物弧光（成长变化）。
2. 世界观设定：包含时代背景、地理区域、力量体系/规则、社会结构、独特物品或生物、隐藏设定（可能的伏笔）。
3. 核心剧情线：包含主线剧情描述、关键事件列表（按时间顺序，每个事件包含事件名、参与人物、前因、后果、影响）、剧情分支/支线、核心冲突。
4. 文风特点：叙事视角、语言风格、对话特点、常用修辞、节奏特点。
5. 实体关系网络：输出至少5条三元组 (头实体, 关系, 尾实体)，涵盖人物-人物、人物-地点、人物-事件等，不足5条则补充合理的，没有则设为[]。
6. 逆向分析洞察：基于片段推断出的隐藏信息、可能的人物真实身份、未明说的规则、前后文矛盾预警、剧情预测等。

小说章节内容：
${content}
  `;
  
  const response = await context.generateCompletion(prompt, {
    temperature: 0.3, max_tokens: 4000, top_p: 0.9, frequency_penalty: 0.2, presence_penalty: 0.1
  });
  
  let graph;
  try {
    const jsonMatch = response.trim().match(/^\{[\s\S]*\}$/);
    if (!jsonMatch) throw new Error('AI返回内容不是有效的JSON');
    graph = JSON.parse(jsonMatch[0]);
    
    const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点', '实体关系网络', '逆向分析洞察'];
    for (const field of requiredFields) {
      if (!(field in graph)) {
        graph[field] = field === '人物信息' || field === '实体关系网络' ? [] : '暂无';
      }
    }
    if (!Array.isArray(graph['人物信息'])) graph['人物信息'] = [];
    if (!Array.isArray(graph['实体关系网络'])) graph['实体关系网络'] = [];
  } catch (error) {
    console.error('[Novel-Continuation-Plugin] 知识图谱解析失败', error);
    graph = {
      "人物信息": [],
      "世界观设定": { "时代背景": "暂无", "地理区域": "暂无", "力量体系/规则": "暂无", "社会结构": "暂无", "独特物品或生物": "暂无", "隐藏设定（可能的伏笔）": "暂无" },
      "核心剧情线": { "主线剧情描述": "暂无", "关键事件列表": [], "剧情分支/支线": [], "核心冲突": "暂无" },
      "文风特点": { "叙事视角": "暂无", "语言风格": "暂无", "对话特点": "暂无", "常用修辞": "暂无", "节奏特点": "暂无" },
      "实体关系网络": [],
      "逆向分析洞察": "暂无"
    };
  }
  return graph;
}

export async function mergeAllGraphs() {
  const chapterList = getChapterList();
  if (chapterList.length === 0) throw new Error('没有可合并的章节');
  
  const graphs = [];
  for (const chapter of chapterList) {
    const content = getChapterContent(chapter.index);
    const graph = await buildChapterGraph(content);
    graphs.push(graph);
  }
  
  const prompt = `
请严格按照以下规则合并多组小说知识图谱，输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须以{开头，以}结尾。

强制约束：
1. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念。
2. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目。
3. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
4. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

必填字段要求：
1. 人物信息
2. 世界观设定
3. 核心剧情线
4. 文风特点
5. 实体关系网络
6. 逆向分析洞察
7. 质量评估（合并后的图谱完整性、准确性、一致性评估）

待合并的知识图谱列表：
${JSON.stringify(graphs, null, 2)}
  `;
  
  const context = getContext();
  const response = await context.generateCompletion(prompt, {
    temperature: 0.2, max_tokens: 8000, top_p: 0.95, frequency_penalty: 0.1, presence_penalty: 0.05
  });
  
  let mergedGraph;
  try {
    const jsonMatch = response.trim().match(/^\{[\s\S]*\}$/);
    if (!jsonMatch) throw new Error('AI返回内容不是有效的JSON');
    mergedGraph = JSON.parse(jsonMatch[0]);
    
    const requiredFields = ['人物信息', '世界观设定', '核心剧情线', '文风特点', '实体关系网络', '逆向分析洞察', '质量评估'];
    for (const field of requiredFields) {
      if (!(field in mergedGraph)) {
        mergedGraph[field] = field === '人物信息' || field === '实体关系网络' ? [] : '暂无';
      }
    }
    if (!Array.isArray(mergedGraph['人物信息'])) mergedGraph['人物信息'] = [];
    if (!Array.isArray(mergedGraph['实体关系网络'])) mergedGraph['实体关系网络'] = [];
  } catch (error) {
    console.error('[Novel-Continuation-Plugin] 图谱合并失败', error);
    mergedGraph = {
      "人物信息": [], "世界观设定": "暂无", "核心剧情线": "暂无", "文风特点": "暂无",
      "实体关系网络": [], "逆向分析洞察": "暂无", "质量评估": "合并失败，无有效图谱数据"
    };
  }
  return mergedGraph;
}

export async function getFullGraph() {
  return await mergeAllGraphs();
}
