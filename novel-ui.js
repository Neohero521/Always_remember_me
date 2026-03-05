import { parseNovelChapters, generateChapterCommand } from './novel-import.js';
import { getCurrentCharacter, executeSlashCommand } from './utils.js';

let currentChapters = [];
let selectedChapterIds = new Set();

// 加载小说导入面板
export function loadNovelUI() {
  const panelHTML = `
    <div id="novel-continuation-panel" class="novel-panel hidden">
      <div class="novel-panel-header">
        <h3>小说续写助手</h3>
        <button id="novel-panel-close" class="menu_button">×</button>
      </div>
      <div class="novel-panel-content">
        <!-- 文件上传区域 -->
        <div class="novel-upload-area">
          <p>上传小说TXT文件，自动拆分章节</p>
          <input type="file" id="novel-file-upload" accept=".txt" />
          <label for="novel-file-upload" class="menu_button">选择小说文件</label>
        </div>

        <!-- 章节列表区域 -->
        <div class="novel-chapter-area">
          <div class="chapter-header">
            <h4>章节列表</h4>
            <div class="chapter-actions">
              <button id="select-all-chapters" class="menu_button">全选</button>
              <button id="import-selected-chapters" class="menu_button primary">导入选中章节到对话框</button>
            </div>
          </div>
          <div id="chapter-list" class="chapter-list">
            <p class="empty-tip">暂无章节，请先上传小说文件</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // 注入面板到页面
  $('body').append(panelHTML);
  // 绑定事件
  bindPanelEvents();
}

// 注册侧边栏按钮
export function registerNovelButton() {
  const buttonHTML = `
    <div id="novel-continuation-button" class="flex-container align-items-center justify-content-left gap5 padding5 hoverable">
      <i class="fa-solid fa-book-open"></i>
      <span>小说续写助手</span>
    </div>
  `;

  // 注入到酒馆侧边栏（和参考案例按钮注入逻辑对齐）
  $('#nav_drawer').append(buttonHTML);
  $('#novel-continuation-button').on('click', () => {
    $('#novel-continuation-panel').toggleClass('hidden');
  });
}

// 绑定面板交互事件
function bindPanelEvents() {
  // 关闭面板
  $('#novel-panel-close').on('click', () => {
    $('#novel-continuation-panel').addClass('hidden');
  });

  // 文件上传解析
  $('#novel-file-upload').on('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      currentChapters = parseNovelChapters(text);
      selectedChapterIds.clear();
      renderChapterList();
      toastr.success(`成功解析 ${currentChapters.length} 个章节`, "解析完成");
    } catch (error) {
      toastr.error(`文件解析失败: ${error.message}`, "解析错误");
    }
  });

  // 全选/取消全选
  $('#select-all-chapters').on('click', () => {
    if (selectedChapterIds.size === currentChapters.length) {
      selectedChapterIds.clear();
    } else {
      currentChapters.forEach(chapter => selectedChapterIds.add(chapter.id));
    }
    renderChapterList();
  });

  // 导入选中章节到对话框
  $('#import-selected-chapters').on('click', async () => {
    if (selectedChapterIds.size === 0) {
      toastr.warning("请先选择要导入的章节", "提示");
      return;
    }

    const charName = getCurrentCharacter();
    if (!charName) {
      toastr.error("未获取到当前角色，请先进入聊天页面", "错误");
      return;
    }

    // 按顺序导入选中的章节
    const sortedChapters = currentChapters
      .filter(chapter => selectedChapterIds.has(chapter.id))
      .sort((a, b) => a.id - b.id);

    for (const chapter of sortedChapters) {
      const command = generateChapterCommand(charName, chapter.content);
      await executeSlashCommand(command);
      // 延迟避免命令冲突
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    toastr.success(`成功导入 ${sortedChapters.length} 个章节到对话框`, "导入完成");
  });

  // 章节单选/取消
  $('#chapter-list').on('change', '.chapter-checkbox', (e) => {
    const chapterId = parseInt($(e.target).data('id'));
    if (e.target.checked) {
      selectedChapterIds.add(chapterId);
    } else {
      selectedChapterIds.delete(chapterId);
    }
  });
}

// 渲染章节列表
function renderChapterList() {
  const $chapterList = $('#chapter-list');
  $chapterList.empty();

  if (currentChapters.length === 0) {
    $chapterList.html('<p class="empty-tip">暂无章节，请先上传小说文件</p>');
    return;
  }

  currentChapters.forEach(chapter => {
    const isSelected = selectedChapterIds.has(chapter.id);
    const chapterItem = `
      <div class="chapter-item">
        <input type="checkbox" class="chapter-checkbox" data-id="${chapter.id}" id="chapter-${chapter.id}" ${isSelected ? 'checked' : ''} />
        <label for="chapter-${chapter.id}" class="chapter-title">${chapter.title}</label>
        <span class="chapter-length">${Math.round(chapter.content.length / 1000)}k 字</span>
      </div>
    `;
    $chapterList.append(chapterItem);
  });
}
