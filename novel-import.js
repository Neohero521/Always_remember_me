import { getPluginSettings, readTextFile, splitNovelChapters } from './utils.js';
import { toast } from './toast.js';

export let importedChapters = [];

export const initNovelImport = () => {
  renderImportUI();
  bindImportEvents();
};

const renderImportUI = () => {
  if (document.getElementById('novel-import-container')) return;

  const importHTML = `
    <div id="novel-import-container" class="novel-import-wrapper">
      <div class="novel-import-header">
        <h3>小说续写助手</h3>
        <p>导入txt小说，自动拆分章节，一键发送到对话框</p>
      </div>
      <div class="novel-import-body">
        <div class="file-upload-area">
          <input type="file" id="novel-file-input" accept=".txt" style="display: none;" />
          <button id="select-novel-file-btn" class="menu_button">选择小说文件</button>
          <span id="selected-file-name" style="margin-left: 10px; color: var(--text-muted);">未选择文件</span>
        </div>
        <div class="chapter-split-config">
          <label for="chapter-regex-input">章节拆分正则：</label>
          <input type="text" id="chapter-regex-input" class="text_pole" placeholder="匹配章节标题的正则表达式" />
        </div>
        <div class="import-action-area">
          <button id="import-novel-btn" class="menu_button primary" disabled>导入并拆分章节</button>
        </div>
        <div id="chapter-list-container" class="chapter-list-wrapper" style="margin-top: 15px; display: none;">
          <h4>拆分后的章节列表</h4>
          <div id="chapter-list" class="chapter-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; padding: 10px;">
          </div>
        </div>
      </div>
    </div>
  `;

  const extensionsPanel = document.getElementById('extensionsPanel');
  if (extensionsPanel) {
    const panelWrapper = document.createElement('div');
    panelWrapper.className = 'novel-import-panel';
    panelWrapper.innerHTML = importHTML;
    extensionsPanel.appendChild(panelWrapper);
  } else {
    document.body.insertAdjacentHTML('beforeend', importHTML);
  }
};

const bindImportEvents = () => {
  const selectFileBtn = document.getElementById('select-novel-file-btn');
  const fileInput = document.getElementById('novel-file-input');
  const fileNameSpan = document.getElementById('selected-file-name');
  const importBtn = document.getElementById('import-novel-btn');
  const regexInput = document.getElementById('chapter-regex-input');

  selectFileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const settings = await getPluginSettings();
    const maxSize = settings.maxFileSize * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`文件大小超过${settings.maxFileSize}MB限制`);
      fileInput.value = '';
      fileNameSpan.textContent = '未选择文件';
      importBtn.disabled = true;
      return;
    }

    fileNameSpan.textContent = file.name;
    importBtn.disabled = false;
    if (!regexInput.value) {
      const settings = await getPluginSettings();
      regexInput.value = settings.chapterSplitRegex;
    }
  });

  importBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) {
      toast.error('请先选择小说文件');
      return;
    }
    const splitRegex = regexInput.value.trim();
    if (!splitRegex) {
      toast.error('请输入章节拆分正则');
      return;
    }

    try {
      const content = await readTextFile(file);
      if (!content) {
        toast.error('文件内容为空');
        return;
      }
      const chapters = splitNovelChapters(content, splitRegex);
      if (chapters.length === 0) {
        toast.error('未拆分到任何章节');
        return;
      }

      importedChapters = chapters;
      renderChapterList(chapters);
      document.getElementById('chapter-list-container').style.display = 'block';
      toast.success(`成功拆分${chapters.length}个章节`);
    } catch (error) {
      console.error('小说导入失败', error);
      toast.error(`小说导入失败：${error.message}`);
    }
  });
};

export const renderChapterList = (chapters) => {
  const chapterListContainer = document.getElementById('chapter-list');
  if (!chapterListContainer) return;

  let listHTML = '';
  chapters.forEach((chapter, index) => {
    listHTML += `
      <div class="chapter-item" data-index="${index}" style="padding: 8px; border-bottom: 1px solid var(--border); cursor: pointer;">
        <div class="chapter-title" style="font-weight: 500;">${index + 1}. ${chapter.title}</div>
        <div class="chapter-content-preview" style="font-size: 12px; color: var(--text-muted); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${chapter.content.substring(0, 100)}...
        </div>
        <div class="chapter-actions" style="margin-top: 8px;">
          <button class="menu_button insert-chapter-btn" data-index="${index}">插入到输入框</button>
          <button class="menu_button primary send-chapter-btn" data-index="${index}">发送到对话框</button>
        </div>
      </div>
    `;
  });
  chapterListContainer.innerHTML = listHTML;
  bindChapterActions();
};

const bindChapterActions = () => {
  document.querySelectorAll('.insert-chapter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      const chapter = importedChapters[index];
      if (!chapter) return;

      const { insertToInputBox } = require('./utils.js');
      insertToInputBox(chapter.content);
      toast.success('章节内容已插入到输入框');
    });
  });

  document.querySelectorAll('.send-chapter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(e.target.dataset.index);
      const chapter = importedChapters[index];
      if (!chapter) return;
      sendChapterToDialog(chapter.content);
    });
  });
};

const sendChapterToDialog = async (content) => {
  try {
    const { getPluginSettings, renderTemplate, getCurrentCharName, executeSlashCommand } = require('./utils.js');
    const settings = await getPluginSettings();
    const charName = getCurrentCharName();

    if (!charName) {
      toast.error('未获取到当前角色名称');
      return;
    }

    const command = renderTemplate(settings.defaultCommandTemplate, {
      char: charName,
      pipe: content
    });

    const result = await executeSlashCommand(command);
    if (result) toast.success('章节内容已发送到对话框');
  } catch (error) {
    console.error('发送章节到对话框失败', error);
    toast.error(`发送失败：${error.message}`);
  }
};
