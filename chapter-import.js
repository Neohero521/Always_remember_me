import { getSTContext, getExtensionSettings, saveExtensionSettings, renderCommandTemplate, updateProgress, showToast } from "./utils.js";
import { globalState } from "./config.js";

// 章节拆分核心逻辑
export const splitNovelIntoChapters = (novelText, regexSource) => {
  try {
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...novelText.matchAll(chapterRegex)];
    const chapters = [];

    if (matches.length === 0) {
      return [{ id: 0, title: '全文', content: novelText, hasGraph: false }];
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : novelText.length;
      const title = matches[i][0].trim();
      const content = novelText.slice(start, end).trim();
      
      if (content) {
        chapters.push({
          id: i,
          title,
          content,
          hasGraph: false
        });
      }
    }

    showToast(`解析完成，共找到 ${chapters.length} 个章节`, "success");
    return chapters;
  } catch (error) {
    console.error('章节拆分失败:', error);
    showToast('章节正则表达式格式错误，请检查', "error");
    return [];
  }
};

// 渲染章节列表
export const renderChapterList = (chapters) => {
  try {
    const $listContainer = $('#novel-chapter-list');
    const settings = getExtensionSettings();
    const graphMap = settings.chapterGraphMap || {};

    if (chapters.length === 0) {
      $listContainer.html('<p class="empty-tip">请上传小说文件并点击「解析章节」</p>');
      return;
    }

    chapters.forEach(chapter => {
      chapter.hasGraph = !!graphMap[chapter.id];
    });

    const listHtml = chapters.map((chapter) => `
      <div class="chapter-item" data-chapter-id="${chapter.id}">
        <div class="chapter-item-main">
          <label class="chapter-checkbox">
            <input type="checkbox" class="chapter-select" data-index="${chapter.id}" checked />
            <span class="chapter-title">${chapter.title}</span>
          </label>
          <span class="chapter-tag ${chapter.hasGraph ? 'tag-success' : 'tag-muted'}">
            ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
          </span>
        </div>
      </div>
    `).join('');

    $listContainer.html(listHtml);
  } catch (error) {
    console.error('渲染章节列表失败:', error);
  }
};

// 渲染续写章节下拉框
export const renderChapterSelect = (chapters) => {
  try {
    const $select = $('#write-chapter-select');
    if (chapters.length === 0) {
      $select.html('<option value="">请先解析章节</option>');
      $('#write-chapter-content').val('').prop('readonly', true);
      return;
    }

    const optionHtml = chapters.map(chapter => `
      <option value="${chapter.id}">${chapter.title}</option>
    `).join('');

    $select.html(`<option value="">请选择续写基准章节</option>${optionHtml}`);
    $('#write-chapter-content').val('').prop('readonly', true);
  } catch (error) {
    console.error('渲染章节下拉框失败:', error);
  }
};

// 批量发送章节
export const sendChaptersBatch = async (chapters) => {
  const context = getSTContext();
  const settings = getExtensionSettings();
  
  if (globalState.isSending) {
    showToast('正在发送中，请等待完成或停止发送', "warning");
    return;
  }
  if (chapters.length === 0) {
    showToast('没有可发送的章节', "warning");
    return;
  }
  const currentCharName = context.characters[context.characterId]?.name;
  if (!currentCharName) {
    showToast('请先选择一个聊天角色', "error");
    return;
  }

  globalState.isSending = true;
  globalState.stopSending = false;
  let successCount = 0;

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (globalState.stopSending) break;

      const chapter = chapters[i];
      const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
      
      await context.executeSlashCommandsWithOptions(command);
      successCount++;

      updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
      
      if (i < chapters.length - 1 && !globalState.stopSending) {
        await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
      }
    }

    showToast(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "success");
  } catch (error) {
    console.error('发送失败:', error);
    showToast(`发送失败: ${error.message}`, "error");
  } finally {
    globalState.isSending = false;
    globalState.stopSending = false;
    updateProgress('novel-import-progress', 'novel-import-status', 0, 0);
  }
};

// 解析并保存章节
export const parseAndSaveChapters = (file, regexSource) => {
  const settings = getExtensionSettings();
  const reader = new FileReader();

  reader.onload = (e) => {
    const novelText = e.target.result;
    globalState.currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
    // 持久化保存
    settings.chapterList = globalState.currentParsedChapters;
    settings.chapterGraphMap = {};
    settings.mergedGraph = {};
    $('#merged-graph-preview').val('');
    saveExtensionSettings();
    // 渲染UI
    renderChapterList(globalState.currentParsedChapters);
    renderChapterSelect(globalState.currentParsedChapters);
  };

  reader.onerror = () => {
    showToast('文件读取失败，请检查文件编码（仅支持UTF-8）', "error");
  };

  reader.readAsText(file, 'UTF-8');
};
