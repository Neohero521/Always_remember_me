import { initUI, renderChapterList } from './modules/ui-panel.js';
import { registerCommands } from './modules/command-handler.js';
import { parseNovelText } from './modules/chapter-parser.js';
import { importNovelFile } from './modules/file-import.js';
import { analyzeChapter, mergeGraphs } from './modules/knowledge-graph.js';
import { generateContinuation } from './modules/novel-continuation.js';

export const pluginState = {
  novelChapters: [],
  currentGraphs: [],
  mergedGraph: null,
  selectedChapterIndex: -1
};

export async function init() {
  try {
    initUI();
    registerCommands();
    bindEvents();
    console.log('小说续写助手插件加载成功');
    toast.success('小说续写助手插件加载成功');
  } catch (error) {
    console.error('小说续写助手插件加载失败', error);
    toast.error('小说续写助手插件加载失败：' + error.message);
  }
}

function bindEvents() {
  document.addEventListener('novel-file-uploaded', async (e) => {
    const file = e.detail.file;
    const text = await importNovelFile(file);
    if (!text) return;
    const chapters = parseNovelText(text);
    pluginState.novelChapters = chapters;
    renderChapterList(chapters);
    toast.success(`成功拆分${chapters.length}个章节`);
  });

  document.addEventListener('chapter-analyze', async (e) => {
    const chapterIndex = e.detail.index;
    const chapter = pluginState.novelChapters[chapterIndex];
    if (!chapter) return;
    const graph = await analyzeChapter(chapter.content);
    if (graph) {
      pluginState.currentGraphs[chapterIndex] = graph;
      toast.success(`第${chapterIndex + 1}章知识图谱分析完成`);
    }
  });

  document.addEventListener('graph-merge', async () => {
    const validGraphs = pluginState.currentGraphs.filter(g => g);
    if (validGraphs.length === 0) {
      toast.warning('没有可合并的知识图谱');
      return;
    }
    const mergedGraph = await mergeGraphs(validGraphs);
    if (mergedGraph) {
      pluginState.mergedGraph = mergedGraph;
      toast.success('知识图谱合并完成');
    }
  });

  document.addEventListener('generate-continuation', async (e) => {
    const { type, chapterIndex, wordCount } = e.detail;
    const config = {
      type,
      chapterIndex,
      wordCount,
      chapters: pluginState.novelChapters,
      graph: pluginState.mergedGraph || pluginState.currentGraphs[chapterIndex]
    };
    const continuation = await generateContinuation(config);
    if (continuation) {
      $('#send_textarea').val(continuation).trigger('input');
      toast.success('续写内容生成完成，已填充到输入框');
    }
  });

  document.addEventListener('chapter-import', (e) => {
    const chapterIndex = e.detail.index;
    const chapter = pluginState.novelChapters[chapterIndex];
    const charName = getContext().character?.name || '角色';
    if (!chapter) {
      toast.warning('章节不存在');
      return;
    }
    const command = `/input ${chapter.content.replace(/\n/g, '\\n')} | /sendas name=${charName}`;
    $('#send_textarea').val(command).trigger('input');
    toast.success('章节内容已填充到输入框，发送即可导入对话框');
  });
}
