import { extension_settings, getContext } from '../../../extensions.js';
import { getChapterList, getChapterContent, updateChapterContent } from './novel-parser.js';
import { buildChapterGraph, mergeAllGraphs } from './knowledge-graph.js';
import { generateContinuation, generateNextChapter } from './novel-continuation.js';

let pluginPanel = null;

export async function loadUI() {
  if (!document.body) {
    setTimeout(loadUI, 100);
    return;
  }
  createPluginPanel();
  console.log('[Novel-Continuation-Plugin] UI模块加载完成');
}

function createPluginPanel() {
  if (document.getElementById('novel-continuation-panel')) {
    pluginPanel = document.getElementById('novel-continuation-panel');
    return;
  }
  
  pluginPanel = document.createElement('div');
  pluginPanel.id = 'novel-continuation-panel';
  pluginPanel.className = 'novel-panel hidden';
  pluginPanel.innerHTML = `
    <div class="novel-panel-header">
      <h3>小说续写插件</h3>
      <button id="novel-panel-close" class="novel-close-button">×</button>
    </div>
    <div class="novel-panel-content">
      <div class="novel-section">
        <h4>小说导入</h4>
        <textarea id="novel-import-textarea" placeholder="请粘贴小说全文..." class="novel-textarea"></textarea>
        <div class="novel-button-group">
          <button id="novel-import-button" class="novel-button primary">导入并拆分章节</button>
        </div>
      </div>
      
      <div class="novel-section">
        <h4>章节管理</h4>
        <div id="novel-chapter-list" class="novel-chapter-list">
          <p>暂无章节，请先导入小说</p>
        </div>
      </div>
      
      <div class="novel-section">
        <h4>章节编辑</h4>
        <select id="novel-chapter-select" class="novel-select">
          <option value="">请选择章节</option>
        </select>
        <textarea id="novel-chapter-editor" placeholder="章节内容..." class="novel-textarea"></textarea>
        <div class="novel-button-group">
          <button id="novel-chapter-save" class="novel-button">保存章节</button>
          <button id="novel-chapter-send" class="novel-button">导入到对话框</button>
          <button id="novel-chapter-graph" class="novel-button">生成知识图谱</button>
        </div>
      </div>
      
      <div class="novel-section">
        <h4>小说续写</h4>
        <div class="novel-input-group">
          <label>续写字数：</label>
          <input type="number" id="novel-continue-length" min="500" max="10000" value="1000" class="novel-input">
        </div>
        <div class="novel-button-group">
          <button id="novel-continue-button" class="novel-button primary">续写当前章节</button>
          <button id="novel-next-chapter-button" class="novel-button">续写下一章</button>
        </div>
      </div>
      
      <div class="novel-section">
        <h4>知识图谱</h4>
        <div class="novel-button-group">
          <button id="novel-merge-graph-button" class="novel-button">合并全本图谱</button>
        </div>
        <textarea id="novel-graph-display" placeholder="知识图谱JSON内容..." class="novel-textarea" readonly></textarea>
      </div>
    </div>
  `;
  
  document.body.appendChild(pluginPanel);
  bindPanelEvents();
}

function bindPanelEvents() {
  const context = getContext();
  
  document.getElementById('novel-panel-close').addEventListener('click', () => {
    pluginPanel.classList.add('hidden');
  });
  
  document.getElementById('novel-import-button').addEventListener('click', async () => {
    const novelText = document.getElementById('novel-import-textarea').value;
    if (!novelText.trim()) { alert('请输入小说内容'); return; }
    try {
      const { parseNovel } = await import('./novel-parser.js');
      const chapters = await parseNovel(novelText);
      alert(`成功导入并拆分${chapters.length}个章节`);
      refreshChapterList();
      refreshChapterSelect();
    } catch (error) {
      alert(`导入失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-chapter-save').addEventListener('click', async () => {
    const chapterIndex = parseInt(document.getElementById('novel-chapter-select').value);
    const newContent = document.getElementById('novel-chapter-editor').value;
    if (isNaN(chapterIndex) || !newContent.trim()) { alert('请选择章节并输入内容'); return; }
    try {
      const { updateChapterContent } = await import('./novel-parser.js');
      await updateChapterContent(chapterIndex, newContent);
      alert('章节保存成功');
      refreshChapterList();
    } catch (error) {
      alert(`保存失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-chapter-send').addEventListener('click', async () => {
    const chapterIndex = parseInt(document.getElementById('novel-chapter-select').value);
    if (isNaN(chapterIndex)) { alert('请选择章节'); return; }
    const chapterContent = getChapterContent(chapterIndex);
    const sendAsChar = extension_settings['Novel-Continuation-Plugin'].sendAsDefaultChar || '{{char}}';
    context.chatInput = `/input 请输入${sendAsChar}的动作或台词：${chapterContent} | /sendas name=${sendAsChar} {{pipe}}`;
    context.processMessage();
    pluginPanel.classList.add('hidden');
  });
  
  document.getElementById('novel-chapter-graph').addEventListener('click', async () => {
    const chapterIndex = parseInt(document.getElementById('novel-chapter-select').value);
    if (isNaN(chapterIndex)) { alert('请选择章节'); return; }
    try {
      const content = getChapterContent(chapterIndex);
      const graph = await buildChapterGraph(content);
      document.getElementById('novel-graph-display').value = JSON.stringify(graph, null, 2);
    } catch (error) {
      alert(`生成图谱失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-continue-button').addEventListener('click', async () => {
    const wordCount = parseInt(document.getElementById('novel-continue-length').value);
    try {
      const continuation = await generateContinuation(wordCount);
      const chapterIndex = parseInt(document.getElementById('novel-chapter-select').value);
      if (!isNaN(chapterIndex)) {
        const currentContent = getChapterContent(chapterIndex);
        const newContent = currentContent + '\n\n' + continuation;
        const { updateChapterContent } = await import('./novel-parser.js');
        await updateChapterContent(chapterIndex, newContent);
        document.getElementById('novel-chapter-editor').value = newContent;
        alert('续写完成，已追加到当前章节');
      } else {
        context.chatInput = continuation;
        context.processMessage();
        pluginPanel.classList.add('hidden');
      }
    } catch (error) {
      alert(`续写失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-next-chapter-button').addEventListener('click', async () => {
    const wordCount = parseInt(document.getElementById('novel-continue-length').value);
    const chapterTitle = prompt('请输入新章节标题');
    if (!chapterTitle) { alert('请输入章节标题'); return; }
    try {
      await generateNextChapter(chapterTitle, wordCount);
      alert(`新章节《${chapterTitle}》生成成功`);
      refreshChapterList();
      refreshChapterSelect();
    } catch (error) {
      alert(`生成下一章失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-merge-graph-button').addEventListener('click', async () => {
    try {
      const mergedGraph = await mergeAllGraphs();
      document.getElementById('novel-graph-display').value = JSON.stringify(mergedGraph, null, 2);
    } catch (error) {
      alert(`合并图谱失败：${error.message}`);
    }
  });
  
  document.getElementById('novel-chapter-select').addEventListener('change', (e) => {
    const chapterIndex = parseInt(e.target.value);
    if (isNaN(chapterIndex)) {
      document.getElementById('novel-chapter-editor').value = '';
      return;
    }
    const content = getChapterContent(chapterIndex);
    document.getElementById('novel-chapter-editor').value = content;
  });
}

function refreshChapterList() {
  const chapterList = getChapterList();
  const container = document.getElementById('novel-chapter-list');
  if (chapterList.length === 0) {
    container.innerHTML = '<p>暂无章节，请先导入小说</p>';
    return;
  }
  container.innerHTML = chapterList.map(chapter => `
    <div class="novel-chapter-item">
      <span>${chapter.index}. ${chapter.title}</span>
    </div>
  `).join('');
}

function refreshChapterSelect() {
  const chapterList = getChapterList();
  const select = document.getElementById('novel-chapter-select');
  select.innerHTML = '<option value="">请选择章节</option>' + chapterList.map(chapter => `
    <option value="${chapter.index}">${chapter.index}. ${chapter.title}</option>
  `).join('');
}
