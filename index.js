// 严格遵循ST扩展导入规范，路径完全兼容
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 扩展基础配置，和仓库名完全一致
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
  // 原有功能配置
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}",
  sendDelay: 100,
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
  // 新增悬浮球配置
  ballPosition: { x: window.innerWidth - 80, y: window.innerHeight - 200 }, // 悬浮球默认位置（右下角）
  panelOpen: false,
};

// 全局状态缓存
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let isDragging = false; // 悬浮球拖拽状态

// ==============================================
// 基础工具函数（保留原有逻辑，兼容原有功能）
// ==============================================
async function loadSettings() {
  const context = getContext();
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  // 初始化默认配置
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], structuredClone(defaultSettings));
  }

  // 补全新增字段
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }

  // 恢复缓存数据
  currentParsedChapters = extension_settings[extensionName].chapterList || [];

  // 更新UI设置值
  $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
  $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
  $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
  $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
  $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));

  // 渲染章节列表与下拉框
  renderChapterList(currentParsedChapters);
  renderChapterSelect(currentParsedChapters);

  // 恢复悬浮球位置
  updateBallPosition();
}

// 模板示例功能保留，兼容官方模板结构
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
// 核心新增：悬浮球+面板 全局UI初始化
// ==============================================
// 初始化悬浮球DOM
function initFloatingBall() {
  // 避免重复创建
  if ($('#novel-writer-ball').length > 0) return;

  // 动态创建悬浮球DOM，直接挂载到body
  const ballHtml = `
    <div id="novel-writer-ball" class="novel-writer-ball" title="小说续写器">
      <i class="fa-solid fa-book-open"></i>
    </div>
  `;
  $('body').append(ballHtml);

  // 绑定悬浮球事件
  bindBallEvents();
  // 恢复保存的位置
  updateBallPosition();
}

// 初始化功能面板DOM
async function initFunctionPanel() {
  // 避免重复创建
  if ($('#novel-writer-panel').length > 0) return;

  // 加载面板HTML（和你之前的example.html完全一致，只是容器改了）
  const panelHtml = await $.get(`${extensionFolderPath}/example.html`);
  // 包裹成全局侧边面板，直接挂载到body
  const fullPanelHtml = `
    <div id="novel-writer-panel" class="novel-writer-panel">
      <div class="panel-mask"></div>
      <div class="panel-content">
        <div class="panel-header">
          <h2>小说续写器</h2>
          <button id="panel-close-btn" class="panel-close-btn">×</button>
        </div>
        <div class="panel-body">
          ${panelHtml}
        </div>
      </div>
    </div>
  `;
  $('body').append(fullPanelHtml);

  // 绑定面板关闭事件
  bindPanelEvents();
}

// 悬浮球事件绑定（点击+拖拽）
function bindBallEvents() {
  const $ball = $('#novel-writer-ball');
  const settings = extension_settings[extensionName];
  let startX, startY, originX, originY;

  // 鼠标按下：开始拖拽
  $ball.on('mousedown touchstart', (e) => {
    isDragging = true;
    $ball.addClass('dragging');
    
    // 获取初始坐标
    const event = e.type === 'touchstart' ? e.touches[0] : e;
    startX = event.clientX;
    startY = event.clientY;
    originX = settings.ballPosition.x;
    originY = settings.ballPosition.y;

    // 阻止默认行为，避免页面滚动
    e.preventDefault();
  });

  // 鼠标移动：拖拽中
  $(document).on('mousemove touchmove', (e) => {
    if (!isDragging) return;

    const event = e.type === 'touchmove' ? e.touches[0] : e;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 计算新位置，限制在窗口内，不超出边界
    let newX = originX + deltaX;
    let newY = originY + deltaY;
    newX = Math.max(20, Math.min(window.innerWidth - 60, newX));
    newY = Math.max(20, Math.min(window.innerHeight - 60, newY));

    // 更新位置
    settings.ballPosition.x = newX;
    settings.ballPosition.y = newY;
    updateBallPosition();
  });

  // 鼠标松开：结束拖拽
  $(document).on('mouseup touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    $('#novel-writer-ball').removeClass('dragging');
    // 保存位置到设置
    saveSettingsDebounced();
  });

  // 点击悬浮球：切换面板显示/隐藏（拖拽时不触发点击）
  $ball.on('click', (e) => {
    if (isDragging) return;
    togglePanel();
    e.preventDefault();
  });
}

// 面板事件绑定
function bindPanelEvents() {
  const $panel = $('#novel-writer-panel');
  const $mask = $panel.find('.panel-mask');
  const $closeBtn = $('#panel-close-btn');

  // 关闭按钮点击
  $closeBtn.on('click', () => closePanel());
  // 点击遮罩关闭面板
  $mask.on('click', () => closePanel());
  // ESC键关闭面板
  $(document).on('keydown', (e) => {
    if (e.key === 'Escape' && extension_settings[extensionName].panelOpen) {
      closePanel();
    }
  });
}

// 更新悬浮球位置
function updateBallPosition() {
  const settings = extension_settings[extensionName];
  $('#novel-writer-ball').css({
    left: `${settings.ballPosition.x}px`,
    top: `${settings.ballPosition.y}px`,
  });
}

// 切换面板显示/隐藏
function togglePanel() {
  const settings = extension_settings[extensionName];
  settings.panelOpen ? closePanel() : openPanel();
}

// 打开面板
function openPanel() {
  $('#novel-writer-panel').addClass('open');
  extension_settings[extensionName].panelOpen = true;
  saveSettingsDebounced();
}

// 关闭面板
function closePanel() {
  $('#novel-writer-panel').removeClass('open');
  extension_settings[extensionName].panelOpen = false;
  saveSettingsDebounced();
}

// ==============================================
// 原有功能核心函数（完全保留，无任何改动）
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

// 章节列表渲染（仅显示标题）
function renderChapterList(chapters) {
  const $listContainer = $('#novel-chapter-list');
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  if (chapters.length === 0) {
    $listContainer.html('<p class="text-muted text-center">请上传小说文件并点击「解析章节」</p>');
    return;
  }

  chapters.forEach(chapter => {
    chapter.hasGraph = !!graphMap[chapter.id];
  });

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

// 续写章节下拉框渲染
function renderChapterSelect(chapters) {
  const $select = $('#write-chapter-select');
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    $('#write-chapter-content').val('').prop('readonly', true);
    return;
  }

  const optionHtml = chapters.map(chapter => `
    <option value="${chapter.id}">${chapter.title}</option>
  `).join('');

  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
  $('#write-chapter-content').val('').prop('readonly', true);
}

// 批量发送章节
async function sendChaptersBatch(chapters) {
  const context = getContext();
  const settings = extension_settings[extensionName];
  
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

  isSending = true;
  stopSending = false;
  let successCount = 0;

  try {
    for (let i = 0; i < chapters.length; i++) {
      if (stopSending) break;

      const chapter = chapters[i];
      const command = renderCommandTemplate(settings.sendTemplate, currentCharName, chapter.content);
      
      await context.executeSlashCommandsWithOptions(command);
      successCount++;

      updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length, "发送进度");
      
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

// 获取选中章节
function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// 知识图谱相关函数（完全保留原有逻辑）
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

// 续写生成函数（完全保留原有逻辑）
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};

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

  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写章节，请稍候...');

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt });
    if (!result.trim()) {
      throw new Error('生成内容为空');
    }

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
// 扩展入口（核心改造：ST就绪后初始化全局UI）
// ==============================================
jQuery(async () => {
  const context = getContext();
  const { eventSource, event_types } = context;

  // 【兼容原有逻辑】保留设置面板里的入口，双入口兼容
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 【核心改造】等ST完全加载完成后，初始化悬浮球和全局面板
  eventSource.once(event_types.APP_READY, async () => {
    // 初始化全局UI
    await initFunctionPanel();
    initFloatingBall();
    // 加载设置
    loadSettings();
    console.log(`[${extensionName}] 小说续写器初始化完成，悬浮球已加载`);

    // ==============================================
    // 所有原有功能的事件绑定（完全保留，无改动）
    // ==============================================
    // 模板原有事件
    $("#my_button").on("click", onButtonClick);
    $("#example_setting").on("input", onExampleInput);

    // 章节管理事件
    $("#parse-chapter-btn").on("click", () => {
      const file = $("#novel-file-upload")[0].files[0];
      const regexSource = $("#chapter-regex-input").val().trim();

      if (!file) {
        toastr.warning('请先选择小说TXT文件', "小说续写器");
        return;
      }

      extension_settings[extensionName].chapterRegex = regexSource;
      saveSettingsDebounced();

      const reader = new FileReader();
      reader.onload = (e) => {
        const novelText = e.target.result;
        currentParsedChapters = splitNovelIntoChapters(novelText, regexSource);
        extension_settings[extensionName].chapterList = currentParsedChapters;
        extension_settings[extensionName].chapterGraphMap = {};
        extension_settings[extensionName].mergedGraph = {};
        $('#merged-graph-preview').val('');
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        renderChapterSelect(currentParsedChapters);
      };
      reader.onerror = () => {
        toastr.error('文件读取失败，请检查文件编码（仅支持UTF-8）', "小说续写器");
      };
      reader.readAsText(file, 'UTF-8');
    });

    $("#select-all-btn").on("click", () => {
      $(".chapter-select").prop("checked", true);
    });
    $("#unselect-all-btn").on("click", () => {
      $(".chapter-select").prop("checked", false);
    });

    $("#send-template-input").on("change", (e) => {
      extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
      saveSettingsDebounced();
    });
    $("#send-delay-input").on("change", (e) => {
      extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
      saveSettingsDebounced();
    });

    $("#import-selected-btn").on("click", () => {
      const selectedChapters = getSelectedChapters();
      sendChaptersBatch(selectedChapters);
    });
    $("#import-all-btn").on("click", () => {
      sendChaptersBatch(currentParsedChapters);
    });
    $("#stop-send-btn").on("click", () => {
      if (isSending) {
        stopSending = true;
        toastr.info('已停止发送', "小说续写器");
      }
    });

    // 知识图谱事件
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

    // 续写模块事件
    $("#write-chapter-select").on("change", function() {
      const selectedChapterId = $(this).val();
      if (!selectedChapterId) {
        $('#write-chapter-content').val('').prop('readonly', true);
        return;
      }
      const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
      if (targetChapter) {
        $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
      }
    });
    $("#write-generate-btn").on("click", generateNovelWrite);
    $("#write-stop-btn").on("click", () => {
      if (isGeneratingWrite) {
        stopGenerateFlag = true;
        $('#write-status').text('已停止生成');
        toastr.info('已停止生成续写内容', "小说续写器");
      }
    });
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

      const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, writeText);
      context.executeSlashCommandsWithOptions(command).then(() => {
        toastr.success('续写内容已发送到对话框', "小说续写器");
      }).catch((error) => {
        toastr.error(`发送失败: ${error.message}`, "小说续写器");
      });
    });
    $("#write-clear-btn").on("click", () => {
      $('#write-content-preview').val('');
      $('#write-status').text('');
      toastr.success('已清空续写内容', "小说续写器");
    });
  });
});
