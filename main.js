import { registerSlashCommand, getContext } from '../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { loadNovelParser } from './novel-parser.js';
import { loadKnowledgeGraph } from './knowledge-graph.js';
import { loadNovelContinuation } from './novel-continuation.js';
import { loadUI } from './ui.js';
import { loadChatIntegration } from './chat-integration.js';
import { loadUtils } from './utils.js';

export async function init() {
  console.log('[Novel-Continuation-Plugin] 插件开始加载');
  
  loadUtils();
  loadNovelParser();
  loadKnowledgeGraph();
  loadNovelContinuation();
  loadChatIntegration();
  await loadUI();
  registerSlashCommands();
  
  console.log('[Novel-Continuation-Plugin] 插件加载完成');
}

function registerSlashCommands() {
  const context = getContext();
  
  registerSlashCommand('novel_import', '导入小说文本并拆分章节', [], () => {
    context.chatInput = '/input 请粘贴小说全文： | /run novel_parse {{pipe}}';
    context.processMessage();
  });
  
  registerSlashCommand('novel_parse', '解析小说文本并拆分章节', [{ name: 'novelText', type: 'string', required: true }], async (args) => {
    const { parseNovel } = await import('./novel-parser.js');
    const chapters = await parseNovel(args.novelText);
    context.chatInput = `成功拆分${chapters.length}个章节，使用 /novel_chapter_list 查看章节列表`;
    context.processMessage();
  });
  
  registerSlashCommand('novel_send', '将指定章节发送到对话框', [{ name: 'chapterIndex', type: 'number', required: true }], async (args) => {
    const { getChapterContent } = await import('./novel-parser.js');
    const chapterContent = getChapterContent(args.chapterIndex);
    const sendAsChar = extension_settings['Novel-Continuation-Plugin'].sendAsDefaultChar || '{{char}}';
    context.chatInput = `/sendas name=${sendAsChar} ${chapterContent}`;
    context.processMessage();
  });
  
  registerSlashCommand('novel_continue', '续写当前章节', [{ name: 'wordCount', type: 'number', required: false }], async (args) => {
    const { generateContinuation } = await import('./novel-continuation.js');
    const wordCount = args.wordCount || extension_settings['Novel-Continuation-Plugin'].defaultContinueLength;
    const continuation = await generateContinuation(wordCount);
    context.chatInput = continuation;
    context.processMessage();
  });
  
  registerSlashCommand('novel_graph', '生成当前章节的知识图谱', [], async () => {
    const { buildChapterGraph } = await import('./knowledge-graph.js');
    const graph = await buildChapterGraph();
    context.chatInput = JSON.stringify(graph, null, 2);
    context.processMessage();
  });
  
  registerSlashCommand('novel_graph_merge', '合并所有章节的知识图谱', [], async () => {
    const { mergeAllGraphs } = await import('./knowledge-graph.js');
    const mergedGraph = await mergeAllGraphs();
    context.chatInput = JSON.stringify(mergedGraph, null, 2);
    context.processMessage();
  });
}
