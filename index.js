// 【严格对齐官方模板】SillyTavern扩展入口文件
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

// 扩展基础配置（和仓库名完全一致，绝对不能错）
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认配置
const defaultSettings = {
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}",
  sendDelay: 100,
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
  ballPosition: { x: 20, y: window.innerHeight - 180 },
  panelOpen: false,
};

// 全局状态缓存
let globalState = {
  currentParsedChapters: [],
  isGeneratingGraph: false,
  stopGenerateGraph: false,
  isGeneratingWrite: false,
  stopGenerateWrite: false,
  isSending: false,
  stopSending: false,
  isDragging: false,
  dragStartPos: { x: 0, y: 0 },
  dragStartTime: 0,
  panelToggleCallback: null,
};

// ==============================================
// 入口主函数（DOM就绪后执行）
// ==============================================
jQuery(async () => {
  console.log(`[${extensionName}] 扩展开始加载...`);
  const context = getContext();
  const { eventSource, event_types } = context;

  // ==============================================
  // 第一步：加载设置面板UI（官方模板强制要求）
  // ==============================================
  let exampleHtml = "";
  try {
    exampleHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(exampleHtml);
    console.log(`[${extensionName}] 设置面板UI加载成功`);
  } catch (error) {
    console.error(`[${extensionName}] 加载example.html失败:`, error);
    toastr.error(`扩展加载失败：找不到example.html文件，请检查仓库文件`, "小说续写器");
    return; // 核心文件加载失败，直接终止
  }

  // ==============================================
  // 第二步：初始化设置
  // ==============================================
  const loadSettings = () => {
    try {
      extension_settings[extensionName] = extension_settings[extensionName] || {};
      for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extension_settings[extensionName], key)) {
          extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
        }
      }
      globalState.currentParsedChapters = extension_settings[extensionName].chapterList || [];
      $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
      $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
      $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
      $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
      $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));
      console.log(`[${extensionName}] 设置加载完成`);
      return extension_settings[extensionName];
    } catch (error) {
      console.error(`[${extensionName}] 加载设置失败:`, error);
      return structuredClone(defaultSettings);
    }
  };

  let settings = loadSettings();

  // ==============================================
  // 第三步：通用工具函数
  // ==============================================
  const saveExtensionSettings = () => {
    try {
      saveSettingsDebounced();
    } catch (error) {
      console.error(`[${extensionName}] 保存设置失败:`, error);
    }
  };

  const showToast = (message, type = "info", title = "小说续写器") => {
    try {
      toastr[type](message, title);
    } catch (error) {
      console.log(`[${title}] ${message}`);
    }
  };

  const renderCommandTemplate = (template, charName, chapterContent) => {
    return template
      .replace(/{{char}}/g, charName || '角色')
      .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|')}"`);
  };

  const updateProgress = (progressId, statusId, current, total, textPrefix = "进度") => {
    const $progressEl = $(`#${progressId}`);
    const $statusEl = $(`#${statusId}`);
    if (total === 0) {
      $progressEl.css('width', '0%');
      $statusEl.text('');
      return;
    }
    const percent = Math.floor((current / total) * 100);
    $progressEl.css('width', `${percent}%`);
    $statusEl.text(`${textPrefix}: ${current}/${total} (${percent}%)`);
  };

  const getSelectedChapters = () => {
    const checkedInputs = document.querySelectorAll('.chapter-select:checked');
    const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
    return selectedIndexes.map(index => globalState.currentParsedChapters.find(item => item.id === index)).filter(Boolean);
  };

  // ==============================================
  // 第四步：面板控制函数（【核心修复】先定义，再使用）
  // ==============================================
  const openPanel = () => {
    const $panel = $('#novel-writer-panel');
    if ($panel.length === 0) {
      showToast('面板未初始化，请刷新页面重试', "error");
      return;
    }
    $panel.addClass('open');
    settings.panelOpen = true;
    saveExtensionSettings();
    console.log(`[${extensionName}] 面板已打开`);
  };

  const closePanel = () => {
    const $panel = $('#novel-writer-panel');
    $panel.removeClass('open');
    settings.panelOpen = false;
    saveExtensionSettings();
    console.log(`[${extensionName}] 面板已关闭`);
  };

  const togglePanel = () => {
    const $panel = $('#novel-writer-panel');
    if ($panel.length === 0) {
      showToast('面板未初始化，请刷新页面重试', "error");
      return;
    }
    settings.panelOpen ? closePanel() : openPanel();
  };

  // ==============================================
  // 第五步：初始化功能面板
  // ==============================================
  const initFunctionPanel = async () => {
    try {
      if ($('#novel-writer-panel').length > 0) {
        console.log(`[${extensionName}] 面板已存在，跳过创建`);
        return true;
      }
      const fullPanelHtml = `
        <div id="novel-writer-panel" class="novel-writer-panel">
          <div class="panel-mask"></div>
          <div class="panel-content">
            <div class="panel-header">
              <div class="panel-title-group">
                <i class="fa-solid fa-book-open panel-title-icon"></i>
                <h2>小说续写器</h2>
              </div>
              <button id="panel-close-btn" class="panel-close-btn" title="关闭面板">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="panel-body">
              ${exampleHtml}
            </div>
          </div>
        </div>
      `;
      $('body').append(fullPanelHtml);

      // 绑定关闭事件
      $('#panel-close-btn').on('click', closePanel);
      $('.panel-mask').on('click', closePanel);
      $(document).on('keydown', (e) => {
        if (e.key === 'Escape' && settings.panelOpen) closePanel();
      });
      $('.panel-body').on('scroll wheel touchmove', (e) => e.stopPropagation());

      console.log(`[${extensionName}] 功能面板初始化完成`);
      return true;
    } catch (error) {
      console.error(`[${extensionName}] 初始化面板失败:`, error);
      showToast(`面板初始化失败: ${error.message}`, "error");
      return false;
    }
  };

  // ==============================================
  // 第六步：初始化悬浮球（【核心修复】事件委托+拖拽点击区分）
  // ==============================================
  const initFloatingBall = () => {
    try {
      if ($('#novel-writer-ball').length > 0) {
        console.log(`[${extensionName}] 悬浮球已存在，跳过创建`);
        return;
      }
      // 创建悬浮球DOM
      const ballHtml = `
        <div id="novel-writer-ball" class="novel-writer-ball" title="小说续写器">
          <i class="fa-solid fa-book-open"></i>
        </div>
      `;
      $('body').append(ballHtml);

      // 初始化位置
      updateBallPosition();
      console.log(`[${extensionName}] 悬浮球初始化完成`);
    } catch (error) {
      console.error(`[${extensionName}] 初始化悬浮球失败:`, error);
      showToast(`悬浮球初始化失败: ${error.message}`, "error");
    }
  };

  // 更新悬浮球位置
  const updateBallPosition = () => {
    try {
      $('#novel-writer-ball').css({
        left: `${settings.ballPosition.x}px`,
        top: `${settings.ballPosition.y}px`,
        right: 'auto',
        bottom: 'auto',
      });
    } catch (error) {
      console.error(`[${extensionName}] 更新悬浮球位置失败:`, error);
    }
  };

  // 【核心修复】全局事件委托，永久生效，不会因为DOM重绘失效
  // 1. 鼠标按下/触摸开始
  $(document).on('mousedown touchstart', '#novel-writer-ball', (e) => {
    globalState.isDragging = false;
    const event = e.type === 'touchstart' ? e.touches[0] : e;
    globalState.dragStartPos = { x: event.clientX, y: event.clientY };
    globalState.dragStartTime = Date.now();
    e.preventDefault();
    e.stopPropagation();
  });

  // 2. 鼠标移动/触摸移动
  $(document).on('mousemove touchmove', '#novel-writer-ball', (e) => {
    if (!globalState.dragStartPos) return;
    const event = e.type === 'touchmove' ? e.touches[0] : e;
    const deltaX = event.clientX - globalState.dragStartPos.x;
    const deltaY = event.clientY - globalState.dragStartPos.y;

    // 【核心修复】移动超过5px才算拖拽，避免轻微移动导致点击失效
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      globalState.isDragging = true;
      $('#novel-writer-ball').addClass('dragging');
    }

    if (globalState.isDragging) {
      let newX = settings.ballPosition.x + deltaX;
      let newY = settings.ballPosition.y + deltaY;
      // 边界限制，不超出屏幕
      newX = Math.max(20, Math.min(window.innerWidth - 60, newX));
      newY = Math.max(20, Math.min(window.innerHeight - 60, newY));
      // 更新位置
      $('#novel-writer-ball').css({
        left: `${newX}px`,
        top: `${newY}px`,
        right: 'auto',
        bottom: 'auto',
      });
    }
    e.preventDefault();
    e.stopPropagation();
  });

  // 3. 鼠标松开/触摸结束
  $(document).on('mouseup touchend', '#novel-writer-ball', (e) => {
    if (globalState.isDragging) {
      // 拖拽结束，保存位置
      const event = e.type === 'touchend' ? e.changedTouches[0] : e;
      settings.ballPosition.x = parseFloat($('#novel-writer-ball').css('left'));
      settings.ballPosition.y = parseFloat($('#novel-writer-ball').css('top'));
      saveExtensionSettings();
    }
    // 重置状态
    globalState.isDragging = false;
    globalState.dragStartPos = null;
    $('#novel-writer-ball').removeClass('dragging');
    e.preventDefault();
    e.stopPropagation();
  });

  // 4. 【核心修复】点击事件，单独绑定，排除拖拽情况
  $(document).on('click', '#novel-writer-ball', (e) => {
    // 拖拽状态不触发点击
    if (globalState.isDragging) return;
    // 点击时间超过200ms算长按，不触发点击
    const clickDuration = Date.now() - globalState.dragStartTime;
    if (clickDuration > 200) return;
    // 执行面板切换
    togglePanel();
    e.preventDefault();
    e.stopPropagation();
  });

  // 窗口大小变化更新边界
  window.addEventListener('resize', () => {
    settings.ballPosition.x = Math.max(20, Math.min(window.innerWidth - 60, settings.ballPosition.x));
    settings.ballPosition.y = Math.max(20, Math.min(window.innerHeight - 60, settings.ballPosition.y));
    updateBallPosition();
    saveExtensionSettings();
  });

  // ==============================================
  // 第七步：核心业务功能
  // ==============================================
  const splitNovelIntoChapters = (novelText, regexSource) => {
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
          chapters.push({ id: i, title, content, hasGraph: false });
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

  const renderChapterList = (chapters) => {
    try {
      const $listContainer = $('#novel-chapter-list');
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
      renderChapterSelect(chapters);
    } catch (error) {
      console.error('渲染章节列表失败:', error);
    }
  };

  const renderChapterSelect = (chapters) => {
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

  const sendChaptersBatch = async (chapters) => {
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

  // ==============================================
  // 第八步：全局事件绑定
  // ==============================================
  const bindEvents = () => {
    // 模板示例事件
    $("#my_button").on("click", () => {
      showToast(`复选框状态：${settings.example_setting ? "已勾选" : "未勾选"}`);
    });
    $("#example_setting").on("input", (e) => {
      settings.example_setting = Boolean($(e.target).prop("checked"));
      saveExtensionSettings();
    });

    // 章节管理事件
    $("#parse-chapter-btn").on("click", () => {
      const file = $("#novel-file-upload")[0].files[0];
      const regexSource = $("#chapter-regex-input").val().trim();
      if (!file) {
        showToast('请先选择小说TXT文件', "warning");
        return;
      }
      settings.chapterRegex = regexSource;
      saveExtensionSettings();
      const reader = new FileReader();
      reader.onload = (e) => {
        const novelText = e.target.result;
        globalState.currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
        settings.chapterList = globalState.currentParsedChapters;
        settings.chapterGraphMap = {};
        settings.mergedGraph = {};
        $('#merged-graph-preview').val('');
        saveExtensionSettings();
        renderChapterList(globalState.currentParsedChapters);
      };
      reader.onerror = () => {
        showToast('文件读取失败，请检查文件编码（仅支持UTF-8）', "error");
      };
      reader.readAsText(file, 'UTF-8');
    });

    $("#select-all-btn").on("click", () => $(".chapter-select").prop("checked", true));
    $("#unselect-all-btn").on("click", () => $(".chapter-select").prop("checked", false));
    $("#send-template-input").on("change", (e) => {
      settings.sendTemplate = $(e.target).val().trim();
      saveExtensionSettings();
    });
    $("#send-delay-input").on("change", (e) => {
      settings.sendDelay = parseInt($(e.target).val()) || 100;
      saveExtensionSettings();
    });
    $("#import-selected-btn").on("click", () => sendChaptersBatch(getSelectedChapters()));
    $("#import-all-btn").on("click", () => sendChaptersBatch(globalState.currentParsedChapters));
    $("#stop-send-btn").on("click", () => {
      globalState.stopSending = true;
      showToast('已停止发送', "info");
    });

    // 续写章节选择联动
    $("#write-chapter-select").on("change", function() {
      const selectedChapterId = $(this).val();
      if (!selectedChapterId) {
        $('#write-chapter-content').val('').prop('readonly', true);
        return;
      }
      const targetChapter = globalState.currentParsedChapters.find(item => item.id == selectedChapterId);
      if (targetChapter) {
        $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
      }
    });

    console.log(`[${extensionName}] 事件绑定完成`);
  };

  bindEvents();

  // ==============================================
  // 第九步：ST就绪后初始化全局UI（严格时序）
  // ==============================================
  const initExtension = async () => {
    try {
      console.log(`[${extensionName}] ST已就绪，开始初始化全局UI`);
      // 【严格时序】先初始化面板，完成后再初始化悬浮球
      const panelInitSuccess = await initFunctionPanel();
      if (!panelInitSuccess) {
        throw new Error("面板初始化失败");
      }
      initFloatingBall();
      // 恢复缓存数据
      if (globalState.currentParsedChapters.length > 0) {
        renderChapterList(globalState.currentParsedChapters);
      }
      // 恢复面板状态
      if (settings.panelOpen) openPanel();
      console.log(`[${extensionName}] 扩展初始化完成！`);
      showToast('小说续写器加载完成！', "success");
    } catch (error) {
      console.error(`[${extensionName}] 扩展初始化失败:`, error);
      showToast(`扩展初始化失败: ${error.message}`, "error");
    }
  };

  // 双重保障，确保ST就绪后执行
  if (context.APP_READY) {
    initExtension();
  } else {
    eventSource.once(event_types.APP_READY, initExtension);
  }
});
