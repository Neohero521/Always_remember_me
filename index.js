// 严格遵循模板导入规范，路径与官方模板完全一致
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 【关键修复1】导入ST原生斜杠命令处理核心函数，全版本兼容
import { processSlashCommand } from "../../slash-commands.js";

// 与仓库名称完全一致，确保路径正确
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// 【关键修复2】修正默认命令模板，用/echo替代/input，实现无交互批量发送
const defaultSettings = {
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/echo {{content}} | /sendas name={{char}} {{pipe}}",
  sendDelay: 1500,
  example_setting: false,
};

// 全局状态缓存
let currentParsedChapters = [];
let isSending = false;
let stopSending = false;

// 完全复用模板的设置加载逻辑
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = defaultSettings[key];
    }
  }

  $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
  $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
  $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
  $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
}

// 模板示例功能保留
function onExampleInput(event) {
  const value = Boolean($(event.target).prop("checked"));
  extension_settings[extensionName].example_setting = value;
  saveSettingsDebounced();
}

function onButtonClick() {
  toastr.info(
    `The checkbox is ${ extension_settings[extensionName].example_setting ? "checked" : "not checked" }`,
    "Extension Example"
  );
}

// 章节拆分逻辑
function splitNovelIntoChapters(novelText, regexSource) {
  try {
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...novelText.matchAll(chapterRegex)];
    const chapters = [];

    if (matches.length === 0) {
      return [{ title: '全文', content: novelText }];
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : novelText.length;
      const title = matches[i][0].trim();
      const content = novelText.slice(start, end).trim();
      
      if (content) {
        chapters.push({ title, content });
      }
    }

    toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说导入");
    return chapters;
  } catch (error) {
    console.error('章节拆分失败:', error);
    toastr.error('章节正则表达式格式错误，请检查', "小说导入");
    return [];
  }
}

// 渲染章节列表
function renderChapterList(chapters) {
  const $listContainer = $('#novel-chapter-list');

  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">未解析到任何章节，请检查正则表达式</p>');
    return;
  }

  const listHtml = chapters.map((chapter, index) => `
    <div class="chapter-item flex-container flexColumn margin-b5 padding5 borderR5">
      <label class="chapter-checkbox flex-container alignCenter gap5">
        <input type="checkbox" class="chapter-select" data-index="${index}" checked />
        <span class="chapter-title fontBold">${chapter.title}</span>
      </label>
      <p class="chapter-preview text-sm text-muted margin0 padding-l25">
        ${chapter.content.slice(0, 100)}${chapter.content.length > 100 ? '...' : ''}
      </p>
    </div>
  `).join('');

  $listContainer.html(listHtml);
}

// 【关键修复3】优化命令模板变量替换，修复特殊字符转义问题
function renderCommandTemplate(template, charName, chapterContent) {
  // 转义双引号，避免破坏命令结构
  const escapedContent = chapterContent.replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{content}}/g, escapedContent)
    .replace(/{{pipe}}/g, `"${escapedContent}"`);
}

// 更新发送进度
function updateSendProgress(current, total) {
  const $progressEl = $('#novel-import-progress');
  const $statusEl = $('#novel-import-status');

  if (total === 0) {
    $progressEl.css('width', '0%');
    $statusEl.text('');
    return;
  }

  const percent = Math.floor((current / total) * 100);
  $progressEl.css('width', `${percent}%`);
  $statusEl.text(`发送进度: ${current}/${total} (${percent}%)`);
}

// 【关键修复4】替换报错的执行方法，用ST原生processSlashCommand
async function sendChaptersBatch(chapters) {
  const { characters, characterId } = getContext();
  const settings = extension_settings[extensionName];
  
  // 前置校验
  if (isSending) {
    toastr.warning('正在发送中，请等待完成或停止发送', "小说导入");
    return;
  }
  if (chapters.length === 0) {
    toastr.warning('没有可发送的章节', "小说导入");
    return;
  }
  const currentCharName = characters[characterId]?.name;
  if (!currentCharName) {
    toastr.error('请先选择一个聊天角色', "小说导入");
    return;
  }

  // 初始化发送状态
  isSending = true;
  stopSending = false;
  let successCount = 0;

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (stopSending) break;

      const chapter = chapters[i];
      const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
      
      // 【核心修复】使用ST原生官方函数执行斜杠命令，全版本兼容
      const isSuccess = await processSlashCommand(command);
      if (isSuccess) {
        successCount++;
      } else {
        toastr.warning(`第${i+1}章「${chapter.title}」发送失败`, "小说导入");
      }

      // 更新进度
      updateSendProgress(i + 1, chapters.length);
      
      // 发送间隔防刷屏
      if (i < chapters.length - 1 && !stopSending) {
        await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
      }
    }

    toastr.success(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "小说导入");
  } catch (error) {
    console.error('发送失败:', error);
    toastr.error(`发送失败: ${error.message}`, "小说导入");
  } finally {
    isSending = false;
    stopSending = false;
    updateSendProgress(0, 0);
  }
}

// 停止发送
function stopChapterSending() {
  if (isSending) {
    stopSending = true;
    toastr.info('已停止发送', "小说导入");
  }
}

// 扩展入口，完全与模板的jQuery初始化结构一致
jQuery(async () => {
  // 与模板完全一致：加载外部HTML文件，追加到ST扩展设置面板
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 保留模板原有事件绑定
  $("#my_button").on("click", onButtonClick);
  $("#example_setting").on("input", onExampleInput);

  // 解析章节
  $("#parse-chapter-btn").on("click", () => {
    const file = $("#novel-file-upload")[0].files[0];
    const regexSource = $("#chapter-regex-input").val().trim();

    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说导入");
      return;
    }

    // 保存用户自定义正则到设置
    extension_settings[extensionName].chapterRegex = regexSource;
    saveSettingsDebounced();

    // 读取文件并解析
    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
      renderChapterList(currentParsedChapters);
    };
    reader.onerror = () => {
      toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说导入");
    };
    reader.readAsText(file, 'UTF-8');
  });

  // 全选/全不选
  $("#select-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", true);
  });
  $("#unselect-all-btn").on("click", () => {
    $(".chapter-select").prop("checked", false);
  });

  // 保存模板设置
  $("#send-template-input").on("change", (e) => {
    extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
    saveSettingsDebounced();
  });
  $("#send-delay-input").on("change", (e) => {
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 1500;
    saveSettingsDebounced();
  });

  // 导入选中章节
  $("#import-selected-btn").on("click", () => {
    if (currentParsedChapters.length === 0) {
      toastr.warning('请先解析章节', "小说导入");
      return;
    }
    const selectedIndexes = [...$(".chapter-select:checked")].map(input => parseInt($(input).data("index")));
    const selectedChapters = selectedIndexes.map(index => currentParsedChapters[index]);
    sendChaptersBatch(selectedChapters);
  });

  // 导入全部章节
  $("#import-all-btn").on("click", () => {
    if (currentParsedChapters.length === 0) {
      toastr.warning('请先解析章节', "小说导入");
      return;
    }
    sendChaptersBatch(currentParsedChapters);
  });

  // 停止发送
  $("#stop-send-btn").on("click", stopChapterSending);

  // 与模板完全一致：初始化加载设置
  loadSettings();
});
