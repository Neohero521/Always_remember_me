import { getContext, extension_settings } from '../../../extensions.js';
import { getCurrentChapter, getChapterContent, addNewChapter } from './novel-parser.js';
import { getFullGraph } from './knowledge-graph.js';

export function loadNovelContinuation() {
  console.log('[Novel-Continuation-Plugin] 续写模块加载完成');
}

export async function generateContinuation(wordCount = null) {
  const context = getContext();
  const settings = extension_settings['Novel-Continuation-Plugin'];
  const targetWordCount = wordCount || settings.defaultContinueLength;
  if (targetWordCount < 500 || targetWordCount > 10000) throw new Error('续写字数必须在500-10000之间');
  
  const currentChapter = getCurrentChapter();
  if (!currentChapter) throw new Error('没有可续写的章节');
  const currentContent = currentChapter.content;
  const fullGraph = await getFullGraph();
  
  const prompt = `
请严格按照以下规则续写小说内容，只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线，字数要求：约${targetWordCount}字，误差不超过10%。

续写规则：
1. 人设锁定：续写内容必须完全贴合以下知识图谱中的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和当前章节的结尾内容、前文剧情完美衔接，逻辑自洽，没有矛盾。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话。

小说完整知识图谱：
${JSON.stringify(fullGraph, null, 2)}

当前需要续写的章节结尾内容：
${currentContent.slice(-1000)}
  `;
  
  const response = await context.generateCompletion(prompt, {
    temperature: 0.7, max_tokens: Math.round(targetWordCount * 2), top_p: 0.9, frequency_penalty: 0.3, presence_penalty: 0.2
  });
  return response.trim();
}

export async function generateNextChapter(chapterTitle, wordCount = null) {
  const context = getContext();
  const settings = extension_settings['Novel-Continuation-Plugin'];
  const targetWordCount = wordCount || settings.defaultContinueLength;
  if (targetWordCount < 500 || targetWordCount > 10000) throw new Error('续写字数必须在500-10000之间');
  
  const chapterList = getChapterList();
  if (chapterList.length === 0) throw new Error('没有可续写的章节');
  const recentChapters = chapterList.slice(-3);
  const recentContent = recentChapters.map(chapter => getChapterContent(chapter.index)).join('\n\n');
  const fullGraph = await getFullGraph();
  
  const prompt = `
请严格按照以下规则续写小说的下一章内容，只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线，字数要求：约${targetWordCount}字，误差不超过10%。

续写规则：
1. 人设、世界观：必须严格贴合提供的知识图谱中的核心设定，绝对不能出现人设崩塌、世界观矛盾。
2. 剧情衔接：必须与最近三章的内容无缝衔接，逻辑自洽，没有矛盾，开启新的章节剧情，同时推动主线发展。
3. 文风：必须与原文保持完全一致的叙事风格、语言习惯、对话方式，和原文无缝衔接。

小说完整知识图谱：
${JSON.stringify(fullGraph, null, 2)}

最近三章的内容：
${recentContent}
  `;
  
  const response = await context.generateCompletion(prompt, {
    temperature: 0.7, max_tokens: Math.round(targetWordCount * 2), top_p: 0.9, frequency_penalty: 0.3, presence_penalty: 0.2
  });
  const chapterContent = response.trim();
  await addNewChapter(chapterTitle, chapterContent);
  return chapterContent;
}
