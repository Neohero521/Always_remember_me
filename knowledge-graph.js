import { getSTContext, getExtensionSettings, saveExtensionSettings, updateProgress, getSelectedChapters, showToast } from "./utils.js";
import { globalState, graphJsonSchema, mergeGraphJsonSchema } from "./config.js";
import { renderChapterList } from "./chapter-import.js";

// 生成单章节图谱
export const generateSingleChapterGraph = async (chapter) => {
  const context = getSTContext();
  const { generateRaw } = context;

  const systemPrompt = `
触发词：构建知识图谱JSON、小说章节分析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown代码块
2. 必须以{开头，以}结尾，无任何其他字符
3. 仅基于提供的小说文本内容分析，绝对不能引入任何文本中不存在的外部元素、设定、概念
4. 必须严格包含所有要求的字段，不能缺失、不能修改字段名
5. 无对应内容设为"暂无"，数组类型设为[]，绝对不能留空或删除字段
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察
`;

  const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
    const graphData = JSON.parse(result.trim());
    return graphData;
  } catch (error) {
    console.error(`章节${chapter.title}图谱生成失败:`, error);
    showToast(`章节${chapter.title}图谱生成失败`, "error");
    return null;
  }
};

// 批量生成图谱
export const generateChapterGraphBatch = async (chapters) => {
  if (globalState.isGeneratingGraph) {
    showToast('正在生成图谱中，请等待完成', "warning");
    return;
  }
  if (chapters.length === 0) {
    showToast('没有可生成图谱的章节', "warning");
    return;
  }

  const settings = getExtensionSettings();
  globalState.isGeneratingGraph = true;
  globalState.stopGenerateGraph = false;
  let successCount = 0;
  const graphMap = settings.chapterGraphMap || {};

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (globalState.stopGenerateGraph) break;
      const chapter = chapters[i];
      updateProgress('graph-progress', 'graph-generate-status', i + 1, chapters.length, "图谱生成进度");

      if (graphMap[chapter.id]) {
        successCount++;
        continue;
      }

      const graphData = await generateSingleChapterGraph(chapter);
      if (graphData) {
        graphMap[chapter.id] = graphData;
        globalState.currentParsedChapters.find(item => item.id === chapter.id).hasGraph = true;
        successCount++;
      }

      if (i < chapters.length - 1 && !globalState.stopGenerateGraph) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    settings.chapterGraphMap = graphMap;
    settings.chapterList = globalState.currentParsedChapters;
    saveExtensionSettings();
    renderChapterList(globalState.currentParsedChapters);

    showToast(`图谱生成完成！成功生成 ${successCount}/${chapters.length} 个章节图谱`, "success");
  } catch (error) {
    console.error('批量生成图谱失败:', error);
    showToast(`图谱生成失败: ${error.message}`, "error");
  } finally {
    globalState.isGeneratingGraph = false;
    globalState.stopGenerateGraph = false;
    updateProgress('graph-progress', 'graph-generate-status', 0, 0);
  }
};

// 合并所有图谱
export const mergeAllGraphs = async () => {
  const context = getSTContext();
  const { generateRaw } = context;
  const settings = getExtensionSettings();
  const graphMap = settings.chapterGraphMap || {};
  const graphList = Object.values(graphMap);

  if (graphList.length === 0) {
    showToast('没有可合并的章节图谱，请先生成图谱', "warning");
    return;
  }

  const systemPrompt = `
触发词：合并知识图谱JSON、图谱合并
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown代码块
2. 必须以{开头，以}结尾，无任何其他字符
3. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念
4. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目
5. 必须严格包含所有要求的字段，不能缺失、不能修改字段名
6. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估
`;

  const userPrompt = `待合并的多组知识图谱数据：\n${JSON.stringify(graphList, null, 2)}`;

  try {
    showToast('开始合并知识图谱，请稍候...', "info");
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: mergeGraphJsonSchema });
    const mergedGraph = JSON.parse(result.trim());
    
    settings.mergedGraph = mergedGraph;
    saveExtensionSettings();
    $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));

    showToast('知识图谱合并完成！', "success");
    return mergedGraph;
  } catch (error) {
    console.error('图谱合并失败:', error);
    showToast(`图谱合并失败: ${error.message}`, "error");
    return null;
  }
};
