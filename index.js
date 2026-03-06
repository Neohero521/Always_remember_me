// 严格遵循官方模板导入规范，路径完全对齐
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 与仓库名称完全一致，确保路径正确
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
// 按要求修改默认配置
const defaultSettings = {
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}", // 按要求修改发送命令
  sendDelay: 100, // 按要求默认间隔100ms
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
};

// 全局状态缓存
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;

// ==============================================
// 基础工具函数（保留模板原有逻辑）
// ==============================================
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  // 初始化默认配置
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // 补全更新后新增的默认字段
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }

  // 恢复缓存数据
  currentParsedChapters = extension_settings[extensionName].chapterList || [];

  // 更新UI中的设置值
  $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
  $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
  $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
  $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
  $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));

  // 渲染章节列表与续写下拉框
  renderChapterList(currentParsedChapters);
  renderChapterSelect(currentParsedChapters);
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

// 模板变量替换
function renderCommandTemplate(template, charName, chapterContent) {
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|')}"`);
}

// 进度更新函数
function updateProgress(progressId, statusId, current, total, textPrefix = "进度") {
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
}

// ==============================================
// 章节管理核心函数（按要求简化章节列表）
// ==============================================
// 章节拆分逻辑
function splitNovelIntoChapters(novelText, regexSource) {
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

    toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说续写器");
    return chapters;
  } catch (error) {
    console.error('章节拆分失败:', error);
    toastr.error('章节正则表达式格式错误，请检查', "小说续写器");
    return [];
  }
}

// 按要求修改：章节列表仅显示标题，不显示内容预览
function renderChapterList(chapters) {
  const $listContainer = $('#novel-chapter-list');
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>');
    return;
  }

  // 更新章节图谱状态
  chapters.forEach(chapter => {
    chapter.hasGraph = !!graphMap[chapter.id];
  });

  // 仅显示标题、选择框、图谱状态，移除内容预览
  const listHtml = chapters.map((chapter) => `
    <div class="chapter-item flex-container alignCenter justifySpaceBetween" data-chapter-id="${chapter.id}">
      <label class="chapter-checkbox flex-container alignCenter gap5">
        <input type="checkbox" class="chapter-select" data-index="${chapter.id}" checked />
        <span class="chapter-title fontBold">${chapter.title}</span>
      </label>
      <span class="text-sm ${chapter.hasGraph ? 'text-success' : 'text-muted'}">
        ${chapter.hasGraph ? '已生成图谱' : '未生成图谱'}
      </span>
    </div>
  `).join('');

  $listContainer.html(listHtml);
}

// 新增：渲染续写模块的章节选择下拉框
function renderChapterSelect(chapters) {
  const $select = $('#write-chapter-select');
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    $('#write-chapter-content').val('').prop('readonly', true);
    return;
  }

  // 生成下拉选项
  const optionHtml = chapters.map(chapter => `
    <option value="${chapter.id}">${chapter.title}</option>
  `).join('');

  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
  // 清空编辑框
  $('#write-chapter-content').val('').prop('readonly', true);
}

// 批量发送章节到对话框
async function sendChaptersBatch(chapters) {
  const context = getContext();
  const settings = extension_settings[extensionName];
  
  // 前置校验
  if (isSending) {
    toastr.warning('正在发送中，请等待完成或停止发送', "小说续写器");
    return;
  }
  if (chapters.length === 0) {
    toastr.warning('没有可发送的章节', "小说续写器");
    return;
  }
  const currentCharName = context.characters[context.characterId]?.name;
  if (!currentCharName) {
    toastr.error('请先选择一个聊天角色', "小说续写器");
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
      
      // 官方原生API执行斜杠命令
      await context.executeSlashCommandsWithOptions(command);
      successCount++;

      // 更新进度
      updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
      
      // 发送间隔（默认100ms）
      if (i < chapters.length - 1 && !stopSending) {
        await new Promise(resolve => setTimeout(resolve, settings.sendDelay));
      }
    }

    toastr.success(`发送完成！成功发送 ${successCount}/${chapters.length} 个章节`, "小说续写器");
  } catch (error) {
    console.error('发送失败:', error);
    toastr.error(`发送失败: ${error.message}`, "小说续写器");
  } finally {
    isSending = false;
    stopSending = false;
    updateProgress('novel-import-progress', 'novel-import-status', 0, 0);
  }
}

// 获取选中的章节
function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// ==============================================
// 知识图谱核心函数（保留原有逻辑，续写依赖）
// ==============================================
const graphJsonSchema = {
  name: 'NovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "逆向分析洞察"],
    "properties": {
      "人物信息": {
        "type": "array", "minItems": 3,
        "items": {
          "type": "object",
          "required": ["姓名", "别名/称号", "性格特征", "身份/背景", "核心动机", "人物关系", "人物弧光"],
          "properties": {
            "姓名": { "type": "string" },
            "别名/称号": { "type": "string" },
            "性格特征": { "type": "string" },
            "身份/背景": { "type": "string" },
            "核心动机": { "type": "string" },
            "人物关系": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度", "关系描述"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系描述": { "type": "string" }
                }
              }
            },
            "人物弧光": { "type": "string" }
          }
        }
      },
      "世界观设定": {
        "type": "object",
        "required": ["时代背景", "地理区域", "力量体系/规则", "社会结构", "独特物品或生物", "隐藏设定"],
        "properties": {
          "时代背景": { "type": "string" },
          "地理区域": { "type": "string" },
          "力量体系/规则": { "type": "string" },
          "社会结构": { "type": "string" },
          "独特物品或生物": { "type": "string" },
          "隐藏设定": { "type": "string" }
        }
      },
      "核心剧情线": {
        "type": "object",
        "required": ["主线剧情描述", "关键事件列表", "剧情分支/支线", "核心冲突"],
        "properties": {
          "主线剧情描述": { "type": "string" },
          "关键事件列表": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["事件名", "参与人物", "前因", "后果", "影响"],
              "properties": {
                "事件名": { "type": "string" },
                "参与人物": { "type": "string" },
                "前因": { "type": "string" },
                "后果": { "type": "string" },
                "影响": { "type": "string" }
              }
            }
          },
          "剧情分支/支线": { "type": "string" },
          "核心冲突": { "type": "string" }
        }
      },
      "文风特点": {
        "type": "object",
        "required": ["叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点"],
        "properties": {
          "叙事视角": { "type": "string" },
          "语言风格": { "type": "string" },
          "对话特点": { "type": "string" },
          "常用修辞": { "type": "string" },
          "节奏特点": { "type": "string" }
        }
      },
      "实体关系网络": { "type": "array", "minItems": 5, "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string" } } },
      "逆向分析洞察": { "type": "string" }
    }
  }
};

const mergeGraphJsonSchema = {
  name: 'MergedNovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "逆向分析洞察", "质量评估"],
    "properties": {
      "人物信息": { "type": "array" },
      "世界观设定": { "type": "object" },
      "核心剧情线": { "type": "object" },
      "文风特点": { "type": "object" },
      "实体关系网络": { "type": "array" },
      "逆向分析洞察": { "type": "string" },
      "质量评估": { "type": "string" }
    }
  }
};

// 生成单章节知识图谱
async function generateSingleChapterGraph(chapter) {
  const context = getContext();
  const { generateRaw } = context;

  const systemPrompt = `
触发词：构建知识图谱JSON、小说章节分析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的小说文本分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察
`;

  const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
    const graphData = JSON.parse(result.trim());
    return graphData;
  } catch (error) {
    console.error(`章节${chapter.title}图谱生成失败:`, error);
    toastr.error(`章节${chapter.title}图谱生成失败`, "小说续写器");
    return null;
  }
}

// 批量生成章节图谱
async function generateChapterGraphBatch(chapters) {
  if (isGeneratingGraph) {
    toastr.warning('正在生成图谱中，请等待完成', "小说续写器");
    return;
  }
  if (chapters.length === 0) {
    toastr.warning('没有可生成图谱的章节', "小说续写器");
    return;
  }

  isGeneratingGraph = true;
  stopGenerateFlag = false;
  let successCount = 0;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (stopGenerateFlag) break;
      const chapter = chapters[i];
      updateProgress('graph-progress', 'graph-generate-status', i + 1, chapters.length, "图谱生成进度");

      if (graphMap[chapter.id]) {
        successCount++;
        continue;
      }

      const graphData = await generateSingleChapterGraph(chapter);
      if (graphData) {
        graphMap[chapter.id] = graphData;
        currentParsedChapters.find(item => item.id === chapter.id).hasGraph = true;
        successCount++;
      }

      if (i < chapters.length - 1 && !stopGenerateFlag) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    extension_settings[extensionName].chapterGraphMap = graphMap;
    extension_settings[extensionName].chapterList = currentParsedChapters;
    saveSettingsDebounced();
    renderChapterList(currentParsedChapters);

    toastr.success(`图谱生成完成！成功生成 ${successCount}/${chapters.length} 个章节图谱`, "小说续写器");
  } catch (error) {
    console.error('批量生成图谱失败:', error);
    toastr.error(`图谱生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingGraph = false;
    stopGenerateFlag = false;
    updateProgress('graph-progress', 'graph-generate-status', 0, 0);
  }
}

// 合并多章节知识图谱
async function mergeAllGraphs() {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  const graphList = Object.values(graphMap);

  if (graphList.length === 0) {
    toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
    return;
  }

  const systemPrompt = `
触发词：合并知识图谱JSON、图谱合并
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的多组图谱合并，不引入任何外部内容
4. 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目
5. 严格包含所有要求的字段，不修改字段名
6. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估
`;

  const userPrompt = `待合并的多组知识图谱：\n${JSON.stringify(graphList, null, 2)}`;

  try {
    toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: mergeGraphJsonSchema });
    const mergedGraph = JSON.parse(result.trim());
    
    extension_settings[extensionName].mergedGraph = mergedGraph;
    saveSettingsDebounced();
    $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));

    toastr.success('知识图谱合并完成！', "小说续写器");
    return mergedGraph;
  } catch (error) {
    console.error('图谱合并失败:', error);
    toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
    return null;
  }
}

// ==============================================
// 小说续写核心函数（按要求重写，简化流程）
// ==============================================
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};

  // 前置校验
  if (isGeneratingWrite) {
    toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
    return;
  }
  if (!selectedChapterId) {
    toastr.error('请先选择续写基准章节', "小说续写器");
    return;
  }
  if (!editedChapterContent) {
    toastr.error('基准章节内容不能为空', "小说续写器");
    return;
  }
  if (Object.keys(mergedGraph).length === 0) {
    toastr.warning('未检测到合并后的知识图谱，建议先合并图谱以保证续写质量', "小说续写器");
  }

  // 构建续写prompt，严格遵守续写规则
  const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的章节内容。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
`;

  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。
`;

  // 开始生成
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写章节，请稍候...');

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt });
    if (!result.trim()) {
      throw new Error('生成内容为空');
    }

    // 更新预览
    $('#write-content-preview').val(result.trim());
    $('#write-status').text('续写章节生成完成！');
    toastr.success('续写章节生成完成！', "小说续写器");
  } catch (error) {
    console.error('续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
  }
}

// ==============================================
// 扩展入口（完全对齐官方模板结构）
// ==============================================
jQuery(async () => {
  // 与模板完全一致：加载外部HTML文件，追加到ST扩展设置面板
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 保留模板原有事件绑定
  $("#my_button").on("click", onButtonClick);
  $("#example_setting").on("input", onExampleInput);

  // ==============================================
  // 章节管理事件绑定
  // ==============================================
  // 解析章节
  $("#parse-chapter-btn").on("click", () => {
    const file = $("#novel-file-upload")[0].files[0];
    const regexSource = $("#chapter-regex-input").val().trim();

    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说续写器");
      return;
    }

    // 保存用户自定义正则
    extension_settings[extensionName].chapterRegex = regexSource;
    saveSettingsDebounced();

    // 读取文件并解析
    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
      // 持久化保存
      extension_settings[extensionName].chapterList = currentParsedChapters;
      // 清空旧图谱
      extension_settings[extensionName].chapterGraphMap = {};
      extension_settings[extensionName].mergedGraph = {};
      $('#merged-graph-preview').val('');
      saveSettingsDebounced();
      // 渲染列表与下拉框
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
    };
    reader.onerror = () => {
      toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
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

  // 保存模板和间隔设置
  $("#send-template-input").on("change", (e) => {
    extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
    saveSettingsDebounced();
  });
  $("#send-delay-input").on("change", (e) => {
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
    saveSettingsDebounced();
  });

  // 导入选中章节
  $("#import-selected-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    sendChaptersBatch(selectedChapters);
  });

  // 导入全部章节
  $("#import-all-btn").on("click", () => {
    sendChaptersBatch(currentParsedChapters);
  });

  // 停止发送
  $("#stop-send-btn").on("click", () => {
    if (isSending) {
      stopSending = true;
      toastr.info('已停止发送', "小说续写器");
    }
  });

  // ==============================================
  // 知识图谱事件绑定
  // ==============================================
  $("#graph-single-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    generateChapterGraphBatch(selectedChapters);
  });

  $("#graph-batch-btn").on("click", () => {
    generateChapterGraphBatch(currentParsedChapters);
  });

  $("#graph-merge-btn").on("click", mergeAllGraphs);

  $("#graph-copy-btn").on("click", () => {
    const graphText = $('#merged-graph-preview').val();
    if (!graphText) {
      toastr.warning('没有可复制的图谱内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(graphText).then(() => {
      toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  $("#graph-export-btn").on("click", () => {
    const graphText = $('#merged-graph-preview').val();
    if (!graphText) {
      toastr.warning('没有可导出的图谱内容', "小说续写器");
      return;
    }
    const blob = new Blob([graphText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '小说知识图谱.json';
    a.click();
    URL.revokeObjectURL(url);
    toastr.success('图谱JSON已导出', "小说续写器");
  });

  $("#graph-clear-btn").on("click", () => {
    extension_settings[extensionName].mergedGraph = {};
    $('#merged-graph-preview').val('');
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });

  // ==============================================
  // 续写模块事件绑定（按新需求重写）
  // ==============================================
  // 章节选择联动：选中章节后，自动填充内容到编辑框
  $("#write-chapter-select").on("change", () => {
    const selectedChapterId = $(this).val();
    if (!selectedChapterId) {
      $('#write-chapter-content').val('').prop('readonly', true);
      return;
    }

    // 找到对应章节
    const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
    if (targetChapter) {
      // 填充内容，取消只读
      $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
    }
  });

  // 生成续写章节按钮
  $("#write-generate-btn").on("click", generateNovelWrite);

  // 停止生成
  $("#write-stop-btn").on("click", () => {
    if (isGeneratingWrite) {
      stopGenerateFlag = true;
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成续写内容', "小说续写器");
    }
  });

  // 复制续写内容
  $("#write-copy-btn").on("click", () => {
    const writeText = $('#write-content-preview').val();
    if (!writeText) {
      toastr.warning('没有可复制的续写内容', "小说续写器");
      return;
    }
    navigator.clipboard.writeText(writeText).then(() => {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    }).catch(() => {
      toastr.error('复制失败', "小说续写器");
    });
  });

  // 发送续写内容到对话框
  $("#write-send-btn").on("click", () => {
    const context = getContext();
    const writeText = $('#write-content-preview').val();
    const currentCharName = context.characters[context.characterId]?.name;

    if (!writeText) {
      toastr.warning('没有可发送的续写内容', "小说续写器");
      return;
    }
    if (!currentCharName) {
      toastr.error('请先选择一个聊天角色', "小说续写器");
      return;
    }

    // 用指定模板发送
    const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
    context.executeSlashCommandsWithOptions(command).then(() => {
      toastr.success('续写内容已发送到对话框', "小说续写器");
    }).catch((error) => {
      toastr.error(`发送失败: ${error.message}`, "小说续写器");
    });
  });

  // 清空续写内容
  $("#write-clear-btn").on("click", () => {
    $('#write-content-preview').val('');
    $('#write-status').text('');
    toastr.success('已清空续写内容', "小说续写器");
  });

  // 与模板完全一致：初始化加载设置
  loadSettings();
});
