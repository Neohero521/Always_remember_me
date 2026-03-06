// 严格遵循ST扩展导入规范
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName, defaultSettings } from "./config.js";
import { getExtensionSettings, saveExtensionSettings, showToast } from "./utils.js";
import { initFloatingBall, updateBallPosition } from "./floating-ball.js";
import { initFunctionPanel, togglePanel, openPanel, closePanel } from "./panel.js";
import {
  currentParsedChapters,
  parseAndSaveChapters,
  renderChapterList,
  renderChapterSelect,
  getSelectedChapters,
  sendChaptersBatch,
  stopChapterSending
} from "./chapter-import.js";
import {
  generateChapterGraphBatch,
  mergeAllGraphs,
  stopGraphGenerate
} from "./knowledge-graph.js";
import {
  generateNovelWrite,
  stopWriteGenerate,
  sendWriteContentToChat,
  onChapterSelectChange
} from "./novel-write.js";

// 扩展主入口
jQuery(async () => {
  const context = getContext();
  const { eventSource, event_types } = context;

  // 【兼容原有逻辑】保留设置面板里的入口，双入口兼容
  const { extensionFolderPath } = await import("./config.js");
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 【核心初始化】等ST完全加载完成后，初始化所有模块
  eventSource.once(event_types.APP_READY, async () => {
    // 初始化设置
    getExtensionSettings();
    // 初始化面板
    await initFunctionPanel();
    // 初始化悬浮球，传入面板切换回调
    initFloatingBall(togglePanel);
    // 恢复缓存的章节数据
    const settings = getExtensionSettings();
    if (settings.chapterList.length > 0) {
      currentParsedChapters = settings.chapterList;
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
    }
    // 恢复面板状态
    if (settings.panelOpen) openPanel();

    console.log(`[${extensionName}] 小说续写器初始化完成，模块化加载成功`);

    // ==============================================
    // 全局事件绑定（所有模块的事件统一在这里绑定）
    // ==============================================
    // 模板原有事件
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
      parseAndSaveChapters(file, regexSource);
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
    $("#import-selected-btn").on("click", () => sendChaptersBatch(getSelectedChapters(currentParsedChapters)));
    $("#import-all-btn").on("click", () => sendChaptersBatch(currentParsedChapters));
    $("#stop-send-btn").on("click", stopChapterSending);

    // 知识图谱事件
    $("#graph-single-btn").on("click", () => generateChapterGraphBatch(getSelectedChapters(currentParsedChapters)));
    $("#graph-batch-btn").on("click", () => generateChapterGraphBatch(currentParsedChapters));
    $("#graph-merge-btn").on("click", mergeAllGraphs);
    $("#graph-stop-btn").on("click", stopGraphGenerate);
    $("#graph-copy-btn").on("click", async () => {
      const graphText = $('#merged-graph-preview').val();
      if (!graphText) {
        showToast('没有可复制的图谱内容', "warning");
        return;
      }
      await navigator.clipboard.writeText(graphText);
      showToast('图谱JSON已复制到剪贴板', "success");
    });
    $("#graph-export-btn").on("click", () => {
      const graphText = $('#merged-graph-preview').val();
      if (!graphText) {
        showToast('没有可导出的图谱内容', "warning");
        return;
      }
      const blob = new Blob([graphText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '小说知识图谱.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('图谱JSON已导出', "success");
    });
    $("#graph-clear-btn").on("click", () => {
      settings.mergedGraph = {};
      $('#merged-graph-preview').val('');
      saveExtensionSettings();
      showToast('已清空合并图谱', "success");
    });

    // 续写模块事件
    $("#write-chapter-select").on("change", onChapterSelectChange);
    $("#write-generate-btn").on("click", generateNovelWrite);
    $("#write-stop-btn").on("click", stopWriteGenerate);
    $("#write-copy-btn").on("click", async () => {
      const writeText = $('#write-content-preview').val();
      if (!writeText) {
        showToast('没有可复制的续写内容', "warning");
        return;
      }
      await navigator.clipboard.writeText(writeText);
      showToast('续写内容已复制到剪贴板', "success");
    });
    $("#write-send-btn").on("click", sendWriteContentToChat);
    $("#write-clear-btn").on("click", () => {
      $('#write-content-preview').val('');
      $('#write-status').text('');
      showToast('已清空续写内容', "success");
    });
  });

  // 窗口大小变化时更新悬浮球位置
  window.addEventListener('resize', updateBallPosition);
});
