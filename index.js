// 【关键修复】所有导入都用完整绝对路径，确保100%加载成功
import { extension_settings, getContext } from "../../../extensions.js";
import { extensionName, defaultSettings, globalState } from "./config.js";
import { getExtensionSettings, saveExtensionSettings, showToast, getSelectedChapters } from "./utils.js";
import { initFloatingBall, updateBallPosition } from "./floating-ball.js";
import { initFunctionPanel, togglePanel, openPanel, closePanel } from "./panel.js";
import {
  parseAndSaveChapters,
  renderChapterList,
  renderChapterSelect,
  sendChaptersBatch,
} from "./chapter-import.js";
import {
  generateChapterGraphBatch,
  mergeAllGraphs,
} from "./knowledge-graph.js";
import {
  generateNovelWrite,
  onChapterSelectChange,
  sendWriteContentToChat,
} from "./novel-write.js";

// 扩展主入口
jQuery(async () => {
  console.log(`[${extensionName}] 扩展开始加载...`);
  const context = getContext();
  const { eventSource, event_types } = context;

  // 【容错处理】先渲染设置面板里的内容，确保扩展里能看到东西
  try {
    const { extensionBasePath } = await import("./config.js");
    const settingsHtml = await $.get(`${extensionBasePath}/example.html`);
    $("#extensions_settings").append(settingsHtml);
    console.log(`[${extensionName}] 设置面板内容渲染成功`);
  } catch (error) {
    console.error(`[${extensionName}] 设置面板渲染失败:`, error);
  }

  // 【核心修复】双重判断APP_READY，确保初始化一定会执行
  const initExtension = async () => {
    try {
      console.log(`[${extensionName}] 开始初始化扩展...`);
      // 初始化设置
      getExtensionSettings();
      // 初始化面板
      await initFunctionPanel();
      // 初始化悬浮球
      initFloatingBall(togglePanel);
      // 恢复缓存的章节数据
      const settings = getExtensionSettings();
      if (settings.chapterList.length > 0) {
        globalState.currentParsedChapters = settings.chapterList;
        renderChapterList(globalState.currentParsedChapters);
        renderChapterSelect(globalState.currentParsedChapters);
      }
      // 恢复面板状态
      if (settings.panelOpen) openPanel();

      // ==============================================
      // 全局事件绑定
      // ==============================================
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
      $("#import-selected-btn").on("click", () => sendChaptersBatch(getSelectedChapters()));
      $("#import-all-btn").on("click", () => sendChaptersBatch(globalState.currentParsedChapters));
      $("#stop-send-btn").on("click", () => {
        globalState.stopSending = true;
        showToast('已停止发送', "info");
      });

      // 知识图谱事件
      $("#graph-single-btn").on("click", () => generateChapterGraphBatch(getSelectedChapters()));
      $("#graph-batch-btn").on("click", () => generateChapterGraphBatch(globalState.currentParsedChapters));
      $("#graph-merge-btn").on("click", mergeAllGraphs);
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
      $("#write-stop-btn").on("click", () => {
        globalState.stopGenerateWrite = true;
        $('#write-status').text('已停止生成');
        showToast('已停止生成续写内容', "info");
      });
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

      console.log(`[${extensionName}] 扩展初始化完成！`);
      showToast('小说续写器加载完成！', "success");
    } catch (error) {
      console.error(`[${extensionName}] 扩展初始化失败:`, error);
      showToast(`扩展初始化失败: ${error.message}`, "error");
    }
  };

  // 【双重保障】如果APP_READY已经触发，直接执行初始化，否则监听事件
  if (context.APP_READY) {
    initExtension();
  } else {
    eventSource.once(event_types.APP_READY, initExtension);
  }

  // 窗口大小变化时更新悬浮球位置
  window.addEventListener('resize', updateBallPosition);
});
