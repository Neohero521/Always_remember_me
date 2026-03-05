import { extension_settings } from '../../../extensions.js';
import { saveData, loadData } from '../../../script.js';

let novelChapters = [];
let currentNovelInfo = { title: '暂无', author: '暂无', chapterCount: 0 };

export function loadNovelParser() {
  loadSavedChapters();
  console.log('[Novel-Continuation-Plugin] 小说解析模块加载完成');
}

async function loadSavedChapters() {
  const savedData = await loadData('novel_continuation_chapters');
  if (savedData) {
    novelChapters = savedData.chapters || [];
    currentNovelInfo = savedData.info || currentNovelInfo;
  }
}

async function saveChapters() {
  await saveData('novel_continuation_chapters', { info: currentNovelInfo, chapters: novelChapters });
}

export async function parseNovel(novelText) {
  if (!novelText || typeof novelText !== 'string') throw new Error('小说文本不能为空');
  
  const splitRegex = new RegExp(extension_settings['Novel-Continuation-Plugin'].chapterSplitRegex, 'gm');
  const matches = [...novelText.matchAll(splitRegex)];
  
  if (matches.length === 0) {
    novelChapters = [{ index: 0, title: '全文', content: novelText.trim(), graph: null }];
  } else {
    novelChapters = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const startIndex = match.index;
      const endIndex = i < matches.length - 1 ? matches[i + 1].index : novelText.length;
      const chapterContent = novelText.slice(startIndex, endIndex).trim();
      const title = match[0].trim();
      novelChapters.push({ index: i, title: title, content: chapterContent, graph: null });
    }
  }
  
  currentNovelInfo.chapterCount = novelChapters.length;
  const firstLine = novelText.split('\n')[0].trim();
  if (firstLine.includes('《') && firstLine.includes('》')) {
    currentNovelInfo.title = firstLine.match(/《(.*?)》/)[1] || '暂无';
  }
  const authorMatch = novelText.match(/作者：?(.*)/);
  if (authorMatch) currentNovelInfo.author = authorMatch[1].trim();
  
  await saveChapters();
  
  if (extension_settings['Novel-Continuation-Plugin'].autoGenerateGraph) {
    const { buildChapterGraph } = await import('./knowledge-graph.js');
    for (let i = 0; i < novelChapters.length; i++) {
      novelChapters[i].graph = await buildChapterGraph(novelChapters[i].content);
    }
    await saveChapters();
  }
  
  return novelChapters;
}

export function getChapterList() {
  return novelChapters.map(chapter => ({ index: chapter.index, title: chapter.title }));
}

export function getChapterContent(chapterIndex) {
  const chapter = novelChapters.find(c => c.index === chapterIndex);
  return chapter ? chapter.content : '章节不存在';
}

export function getCurrentChapter() {
  return novelChapters[novelChapters.length - 1] || null;
}

export async function updateChapterContent(chapterIndex, newContent) {
  const chapter = novelChapters.find(c => c.index === chapterIndex);
  if (!chapter) throw new Error('章节不存在');
  chapter.content = newContent;
  if (extension_settings['Novel-Continuation-Plugin'].autoGenerateGraph) {
    const { buildChapterGraph } = await import('./knowledge-graph.js');
    chapter.graph = await buildChapterGraph(newContent);
  }
  await saveChapters();
  return chapter;
}

export async function addNewChapter(title, content) {
  const newIndex = novelChapters.length;
  const newChapter = { index: newIndex, title: title, content: content, graph: null };
  if (extension_settings['Novel-Continuation-Plugin'].autoGenerateGraph) {
    const { buildChapterGraph } = await import('./knowledge-graph.js');
    newChapter.graph = await buildChapterGraph(content);
  }
  novelChapters.push(newChapter);
  currentNovelInfo.chapterCount = novelChapters.length;
  await saveChapters();
  return newChapter;
}
