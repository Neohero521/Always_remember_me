import { generateRaw } from '../../../../script.js';

const ANALYZE_PROMPT = `
你是专业的小说知识图谱构建专家，现在需要你基于提供的小说章节文本，严格按照以下规则生成知识图谱，输出必须100%符合要求。

【强制约束（必须100%遵守）】
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的小说文本内容进行分析和推理，绝对不能引入任何文本中不存在的外部元素、设定、概念。
4. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
5. 如果文本中没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

【必填字段要求】
1. 人物信息：列出所有主要人物（至少3个，不足3个则列出所有），每个对象包含：姓名、别名/称号、性格特征、身份/背景、核心动机、人物关系（数组，每个关系包含关系对象、关系类型、关系强度0-1、关系描述）、人物弧光（成长变化）。
2. 世界观设定：包含时代背景、地理区域、力量体系/规则、社会结构、独特物品或生物、隐藏设定（可能的伏笔）。
3. 核心剧情线：包含主线剧情描述、关键事件列表（按时间顺序，每个事件包含事件名、参与人物、前因、后果、影响）、剧情分支/支线、核心冲突。
4. 文风特点：叙事视角、语言风格、对话特点、常用修辞、节奏特点。
5. 实体关系网络：输出至少5条三元组 (头实体, 关系, 尾实体)，涵盖人物-人物、人物-地点、人物-事件等。
6. 逆向分析洞察：基于片段推断出的隐藏信息、可能的人物真实身份、未明说的规则、前后文矛盾预警、剧情预测等。

【小说章节文本】
{{chapter_content}}
`;

const MERGE_PROMPT = `
你是专业的小说知识图谱合并专家，现在需要你基于提供的多组章节知识图谱，严格按照以下规则合并生成完整的小说知识图谱，输出必须100%符合要求。

【强制约束（必须100%遵守）】
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念。
4. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目。
5. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
6. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。

【必填字段要求】
人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估（合并后的图谱完整性、准确性、一致性评分，1-10分）

【待合并的多组知识图谱】
{{graphs_json}}
`;

export async function analyzeChapter(chapterContent) {
  if (!chapterContent) {
    toast.warning('章节内容为空，无法分析');
    return null;
  }
  try {
    const prompt = ANALYZE_PROMPT.replace('{{chapter_content}}', chapterContent);
    const result = await generateRaw(prompt, false);
    if (!result) {
      toast.error('AI分析失败，无返回结果');
      return null;
    }
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      toast.error('AI返回结果不符合JSON格式要求');
      return null;
    }
    const graph = JSON.parse(jsonMatch[0]);
    return graph;
  } catch (error) {
    console.error('章节分析失败', error);
    toast.error('章节分析失败：' + error.message);
    return null;
  }
}

export async function mergeGraphs(graphs) {
  if (!graphs || graphs.length === 0) {
    toast.warning('没有可合并的知识图谱');
    return null;
  }
  try {
    const graphsJson = JSON.stringify(graphs, null, 2);
    const prompt = MERGE_PROMPT.replace('{{graphs_json}}', graphsJson);
    const result = await generateRaw(prompt, false);
    if (!result) {
      toast.error('AI合并失败，无返回结果');
      return null;
    }
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      toast.error('AI返回结果不符合JSON格式要求');
      return null;
    }
    const mergedGraph = JSON.parse(jsonMatch[0]);
    return mergedGraph;
  } catch (error) {
    console.error('图谱合并失败', error);
    toast.error('图谱合并失败：' + error.message);
    return null;
  }
}
