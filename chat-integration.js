import { registerSlashCommand, getContext } from '../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { getChapterList, getChapterContent } from './novel-parser.js';

export function loadChatIntegration() {
  registerChatIntegrationCommands();
  addChatPanelButton();
  console.log('[Novel-Continuation-Plugin] 聊天集成模块加载完成');
}

function registerChatIntegrationCommands() {
  const context = getContext();
  
  // 完全符合您要求的斜杠命令格式
  registerSlashCommand('novel_import_chapter', '导入指定章节到对话框', [{ name: 'chapterIndex', type: 'number', required: true }], (args) => {
    const chapterContent = getChapterContent(args.chapterIndex);
    const sendAsChar = extension_settings['Novel-Continuation-Plugin'].sendAsDefaultChar || '{{char}}';
    context.chatInput = `/input 请输入${sendAsChar}的动作或台词：${chapterContent} | /sendas name=${sendAsChar} {{pipe}}`;
    context.processMessage();
  });
  
  registerSlashCommand('novel_chapter_list', '查看所有章节列表', [], () => {
    const chapters = getChapterList();
    if (chapters.length === 0) {
      context.chatInput = '暂无章节，请先使用 /novel_import 导入小说';
    } else {
      context.chatInput = `小说章节列表：\n${chapters.map(chapter => `${chapter.index}. ${chapter.title}`).join('\n')}\n使用 /novel_import_chapter [章节序号] 导入章节到对话框`;
    }
    context.processMessage();
  });
}

function addChatPanelButton() {
  const chatFuncPanel = document.getElementById('chat-controls');
  if (!chatFuncPanel) {
    setTimeout(addChatPanelButton, 500);
    return;
  }
  
  const novelButton = document.createElement('div');
  novelButton.className = 'flex-container align-items-center justify-content-center fa-stack chat-control-button';
  novelButton.title = '小说续写插件';
  novelButton.innerHTML = `<i class="fa-solid fa-book fa-stack-1x"></i>`;
  
  novelButton.addEventListener('click', () => {
    const novelPanel = document.getElementById('novel-continuation-panel');
    if (novelPanel) novelPanel.classList.toggle('hidden');
  });
  
  chatFuncPanel.appendChild(novelButton);
}
