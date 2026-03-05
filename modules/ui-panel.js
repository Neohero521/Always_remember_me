import { pluginState } from '../index.js';

const PANEL_ID = 'novel-continuation-panel';
const PANEL_NAME = '小说续写助手';

export function initUI() {
  registerExtensionPanel({
    id: PANEL_ID,
    name: PANEL_NAME,
    icon: 'fa-book',
    html: getPanelHTML(),
    onLoad: () => {
      bindPanelEvents();
    }
  });
}

function getPanelHTML() {
  return `
    <div class="novel-continuation-panel">
      <div class="panel-section">
        <h3>小说导入</h3>
        <div class="file-upload-area">
          <input type="file" id="novel-file-upload" accept=".txt" style="display: none;">
          <button id="upload-btn" class="menu_button">选择小说TXT文件</button>
          <span id="file-name" style="margin-left: 10px;">未选择文件</span>
        </div>
      </div>

      <div class="panel-section">
        <h3>章节列表</h3>
        <div id="chapter-list" class="chapter-list-container">
          <p style="color: var(--text-muted);">请先导入小说文件</p>
        </div>
      </div>

      <div class="panel-section">
        <h3>知识图谱</h3>
        <div class="graph-control-area">
          <button id="merge-graph-btn" class="menu_button">合并所有章节图谱</button>
          <button id="view-graph-btn" class="menu_button" style="margin-left: 10px;">查看合并后图谱</button>
        </div>
        <div id="graph-preview" class="graph-preview-container" style="margin-top: 10px; max-height: 200px; overflow-y: auto; background: var(--input-bg); padding: 10px; border-radius: 4px; display: none;">
          <pre id="graph-content" style="white-space: pre-wrap; word-break: break-all; font-size: 12px;"></pre>
        </div>
      </div>

      <div class="panel-section">
        <h3>续写生成</h3>
        <div class="continuation-setting">
          <div class="setting-row">
            <label>续写类型：</label>
            <select id="continuation-type" class="text_pole">
              <option value="current">当前章节续写</option>
              <option value="next">续写下一章</option>
            </select>
          </div>
          <div class="setting-row" style="margin-top: 10px;">
            <label>续写字数：</label>
            <input type="number" id="continuation-length" class="text_pole" min="500" max="10000" value="${getSetting('default_continuation_length') || 1000}" style="width: 100px;">
          </div>
          <button id="generate-continuation-btn" class="menu_button" style="margin-top: 10px; width: 100%;">生成续写内容</button>
        </div>
      </div>
    </div>
  `;
}

function bindPanelEvents() {
  $('#upload-btn').on('click', () => {
    $('#novel-file-upload').trigger('click');
  });

  $('#novel-file-upload').on('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      $('#file-name').text(file.name);
      document.dispatchEvent(new CustomEvent('novel-file-uploaded', { detail: { file } }));
    }
  });

  $('#merge-graph-btn').on('click', () => {
    document.dispatchEvent(new CustomEvent('graph-merge'));
  });

  $('#view-graph-btn').on('click', () => {
    const { mergedGraph } = pluginState;
    if (!mergedGraph) {
      toast.warning('没有合并后的图谱，请先合并');
      return;
    }
    $('#graph-content').text(JSON.stringify(mergedGraph, null, 2));
    $('#graph-preview').toggle();
  });

  $('#generate-continuation-btn').on('click', () => {
    const type = $('#continuation-type').val();
    const wordCount = parseInt($('#continuation-length').val());
    const { selectedChapterIndex } = pluginState;
    if (selectedChapterIndex < 0) {
      toast.warning('请先选择一个章节');
      return;
    }
    document.dispatchEvent(new CustomEvent('generate-continuation', {
      detail: { type, chapterIndex: selectedChapterIndex, wordCount }
    }));
  });
}

export function renderChapterList(chapters) {
  const container = $('#chapter-list');
  if (!chapters || chapters.length === 0) {
    container.html('<p style="color: var(--text-muted);">未拆分到有效章节</p>');
    return;
  }

  let html = '<ul class="chapter-list">';
  chapters.forEach((chapter) => {
    html += `
      <li class="chapter-item" data-index="${chapter.index}">
        <div class="chapter-title">${chapter.title}</div>
        <div class="chapter-actions">
          <button class="small_menu_button import-btn" data-index="${chapter.index}">导入对话框</button>
          <button class="small_menu_button analyze-btn" data-index="${chapter.index}">分析图谱</button>
          <button class="small_menu_button select-btn" data-index="${chapter.index}">选择</button>
        </div>
      </li>
    `;
  });
  html += '</ul>';
  container.html(html);

  bindChapterListEvents();
}

function bindChapterListEvents() {
  $('.import-btn').on('click', (e) => {
    const index = parseInt($(e.target).data('index'));
    document.dispatchEvent(new CustomEvent('chapter-import', { detail: { index } }));
  });

  $('.analyze-btn').on('click', (e) => {
    const index = parseInt($(e.target).data('index'));
    document.dispatchEvent(new CustomEvent('chapter-analyze', { detail: { index } }));
  });

  $('.select-btn').on('click', (e) => {
    const index = parseInt($(e.target).data('index'));
    $('.chapter-item.selected').removeClass('selected');
    $(`.chapter-item[data-index="${index}"]`).addClass('selected');
    pluginState.selectedChapterIndex = index;
    toast.info(`已选择第${index + 1}章：${pluginState.novelChapters[index].title}`);
  });
}
