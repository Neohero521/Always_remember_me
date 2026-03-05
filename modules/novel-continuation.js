import { getChapterContent, getLatestThreeChapters } from './chapter-parser.js';
import { generateRaw } from '../../../../script.js';

const CURRENT_CONTINUATION_PROMPT = `
你是专业的小说续写作家，现在需要你基于提供的小说内容、知识图谱设定，严格按照以下规则续写小说内容，输出必须100%符合要求。

【续写规则（必须100%遵守）】
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的当前章节内容完美衔接，逻辑自洽，没有矛盾。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线。
6. 字数要求：续写约{{word_count}}字，误差不超过10%。

【小说核心设定（知识图谱）】
{{graph_json}}

【当前章节原文】
{{chapter_content}}
`;

const NEXT_CHAPTER_PROMPT = `
你是专业的小说续写作家，现在需要你基于提供的小说最近三章内容、知识图谱设定，严格按照以下规则续写小说的下一章内容，输出必须100%符合要求。

【续写下一章规则（必须100%遵守）】
1. 人设、世界观：必须严格贴合提供的核心设定，绝对不能出现人设崩塌、世界观矛盾。
2. 剧情衔接：必须与最近三章的内容无缝衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的情节。
3. 文风：必须与原文保持完全一致，包括叙事视角、语言风格、对话方式、节奏特点。
4. 输出要求：只输出续写的正文内容，不要任何章节标题、解释、备注、说明、分割线。
5. 字数要求：续写约{{word_count}}字，误差不超过10%。

【小说核心设定（知识图谱）】
{{graph_json}}

【最近三章原文】
{{latest_chapters_content}}
`;

export async function generateContinuation(config) {
  const { type, chapterIndex, wordCount, chapters, graph } = config;
  if (!chapters || chapters.length === 0) {
    toast.warning('没有可用的小说章节');
    return null;
  }
  if (!graph) {
    toast.warning('没有可用的知识图谱，可能影响续写质量，建议先分析章节并合并图谱');
  }

  try {
    let prompt = '';
    const graphJson = graph ? JSON.stringify(graph, null, 2) : '暂无';
    
    if (type === 'current') {
      const chapterContent = getChapterContent(chapterIndex);
      if (!chapterContent) {
        toast.warning('当前章节内容为空');
        return null;
      }
      prompt = CURRENT_CONTINUATION_PROMPT
        .replace('{{word_count}}', wordCount)
        .replace('{{graph_json}}', graphJson)
        .replace('{{chapter_content}}', chapterContent);
    } else if (type === 'next') {
      const latestChapters = getLatestThreeChapters(chapterIndex);
      if (latestChapters.length === 0) {
        toast.warning('没有可用的章节内容');
        return null;
      }
      const latestContent = latestChapters.map(ch => `【${ch.title}】\n${ch.content}`).join('\n\n');
      prompt = NEXT_CHAPTER_PROMPT
        .replace('{{word_count}}', wordCount)
        .replace('{{graph_json}}', graphJson)
        .replace('{{latest_chapters_content}}', latestContent);
    }

    if (!prompt) {
      toast.error('续写prompt生成失败');
      return null;
    }

    const result = await generateRaw(prompt, false);
    if (!result) {
      toast.error('AI续写失败，无返回结果');
      return null;
    }

    return result.trim();
  } catch (error) {
    console.error('续写生成失败', error);
    toast.error('续写生成失败：' + error.message);
    return null;
  }
}
