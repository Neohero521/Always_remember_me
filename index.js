// 严格遵循模板导入规范，与官方模板路径完全一致
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";

import { saveSettingsDebounced } from "../../../../script.js";

// 与仓库名称完全一致，确保路径正确
const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
  // 原有导入功能配置
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/input 章节内容：| /sendas name={{char}} {{pipe}}",
  sendDelay: 1500,
  example_setting: false,
  // 新增功能持久化数据
  chapterList: [],
  chapterGraphMap: {}, // 章节ID -> 图谱JSON
  mergedGraph: {},
};

// 全局状态缓存
let currentParsedChapters = [];
let currentEditChapterIndex = -1;
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;

// ==============================================
// 基础工具函数（复用模板原有逻辑）
// ==============================================
// 完全复用模板的设置加载逻辑
async function loadSettings() {
  const context = getContext();
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

  // 重新渲染章节列表
  renderChapterList(currentParsedChapters);
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
function updateProgress(progressId, statusId, current, total, textPrefix = "发送进度") {
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
// 章节管理核心函数
// ==============================================
// 章节拆分核心逻辑
function splitNovelIntoChapters(novelText, regexSource) {
  try {
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...novelText.matchAll(chapterRegex)];
    const chapters = [];

    if (matches.length === 0) {
      return [{ id: 0, title: '全文', content: novelText, hasGraph: false }];
    }

    // 拆分章节标题与内容，添加唯一ID
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

// 渲染章节列表
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

  const listHtml = chapters.map((chapter) => `
    <div class="chapter-item" data-chapter-id="${chapter.id}">
      <div class="chapter-header flex-container alignCenter justifySpaceBetween">
        <label class="chapter-checkbox flex-container alignCenter gap5">
          <input type="checkbox" class="chapter-select" data-index="${chapter.id}" checked />
          <span class="chapter-title fontBold">${chapter.title} ${chapter.hasGraph ? '<span class="text-success">[已生成图谱]</span>' : ''}</span>
        </label>
        <button class="menu_button menu_button--sm chapter-edit-btn" data-index="${chapter.id}">编辑内容</button>
      </div>
      <p class="chapter-preview text-sm text-muted margin0">
        ${chapter.content.slice(0, 120)}${chapter.content.length > 120 ? '...' : ''}
      </p>
    </div>
  `).join('');

  $listContainer.html(listHtml);

  // 绑定编辑事件
  $('.chapter-edit-btn').on('click', function() {
    const chapterId = parseInt($(this).data('index'));
    openChapterEditModal(chapterId);
  });
}

// 打开章节编辑弹窗
function openChapterEditModal(chapterId) {
  const chapter = currentParsedChapters.find(item => item.id === chapterId);
  if (!chapter) {
    toastr.error('未找到对应章节', "小说续写器");
    return;
  }

  currentEditChapterIndex = chapterId;
  $('#edit-chapter-title').text(`编辑章节：${chapter.title}`);
  $('#chapter-content-edit').val(chapter.content);
  $('#chapter-edit-modal').addClass('show');
}

// 保存章节编辑
function saveChapterEdit() {
  if (currentEditChapterIndex === -1) return;

  const newContent = $('#chapter-content-edit').val().trim();
  const chapterIndex = currentParsedChapters.findIndex(item => item.id === currentEditChapterIndex);
  
  if (chapterIndex === -1) return;

  // 更新章节内容
  currentParsedChapters[chapterIndex].content = newContent;
  currentParsedChapters[chapterIndex].hasGraph = false; // 内容修改后标记图谱失效
  // 删除旧图谱
  delete extension_settings[extensionName].chapterGraphMap[currentEditChapterIndex];
  // 持久化保存
  extension_settings[extensionName].chapterList = currentParsedChapters;
  saveSettingsDebounced();
  // 重新渲染
  renderChapterList(currentParsedChapters);
  // 关闭弹窗
  $('#chapter-edit-modal').removeClass('show');
  currentEditChapterIndex = -1;

  toastr.success('章节内容已保存', "小说续写器");
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
      updateProgress('novel-import-progress', 'novel-import-status', i + 1, chapters.length);
      
      // 发送间隔防刷屏
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

// ==============================================
// 知识图谱核心函数（严格遵守你的约束规则）
// ==============================================
// 知识图谱JSON Schema（严格匹配必填字段）
const graphJsonSchema = {
  name: 'NovelKnowledgeGraph',
  description: '小说章节知识图谱JSON结构，严格遵守字段要求',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "逆向分析洞察"],
    "properties": {
      "人物信息": {
        "type": "array",
        "minItems": 3,
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
      "实体关系网络": {
        "type": "array",
        "minItems": 5,
        "items": {
          "type": "array",
          "minItems": 3,
          "maxItems": 3,
          "items": { "type": "string" }
        }
      },
      "逆向分析洞察": { "type": "string" }
    }
  }
};

// 合并图谱JSON Schema
const mergeGraphJsonSchema = {
  name: 'MergedNovelKnowledgeGraph',
  description: '合并后的小说全量知识图谱',
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

  // 严格按照你的要求构建prompt
  const systemPrompt = `
触发词：构建知识图谱JSON、小说章节分析
强制约束（必须100%遵守）：
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的小说文本内容进行分析和推理，绝对不能引入任何文本中不存在的外部元素、设定、概念。
4. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
5. 如果文本中没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。
必填字段要求：
1. 人物信息：列出所有主要人物（至少3个），每个对象包含：姓名、别名/称号、性格特征、身份/背景、核心动机、人物关系（数组，每个关系包含关系对象、关系类型、关系强度0-1、关系描述）、人物弧光（成长变化）。
2. 世界观设定：包含时代背景、地理区域、力量体系/规则、社会结构、独特物品或生物、隐藏设定（可能的伏笔）。
3. 核心剧情线：包含主线剧情描述、关键事件列表（按时间顺序，每个事件包含事件名、参与人物、前因、后果、影响）、剧情分支/支线、核心冲突。
4. 文风特点：叙事视角、语言风格、对话特点、常用修辞、节奏特点。
5. 实体关系网络：输出至少5条三元组 (头实体, 关系, 尾实体)，涵盖人物-人物、人物-地点、人物-事件等。
6. 逆向分析洞察：基于片段推断出的隐藏信息、可能的人物真实身份、未明说的规则、前后文矛盾预警、剧情预测等。
`;

  const userPrompt = `小说章节标题：${chapter.title}\n小说章节内容：${chapter.content}`;

  try {
    // 调用ST原生生成API，强制JSON格式
    const result = await generateRaw({
      systemPrompt,
      prompt: userPrompt,
      jsonSchema: graphJsonSchema,
    });

    // 解析返回的JSON
    const graphData = JSON.parse(result.trim());
    return graphData;
  } catch (error) {
    console.error(`章节${chapter.title}图谱生成失败:`, error);
    toastr.error(`章节${chapter.title}图谱生成失败，格式解析错误`, "小说续写器");
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

      // 跳过已生成的图谱
      if (graphMap[chapter.id]) {
        successCount++;
        continue;
      }

      // 生成图谱
      const graphData = await generateSingleChapterGraph(chapter);
      if (graphData) {
        graphMap[chapter.id] = graphData;
        currentParsedChapters.find(item => item.id === chapter.id).hasGraph = true;
        successCount++;
      }

      // 生成间隔，避免API限流
      if (i < chapters.length - 1 && !stopGenerateFlag) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 持久化保存
    extension_settings[extensionName].chapterGraphMap = graphMap;
    extension_settings[extensionName].chapterList = currentParsedChapters;
    saveSettingsDebounced();
    // 重新渲染
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

  // 严格按照你的要求构建合并prompt
  const systemPrompt = `
触发词：合并知识图谱JSON、图谱合并
强制约束（必须100%遵守）：
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容。
2. 输出必须以{开头，以}结尾，中间是完整的JSON结构，不能有任何其他字符。
3. 只能基于提供的多组知识图谱数据进行合并，绝对不能引入任何数据中不存在的外部元素、设定、概念。
4. 必须严格合并去重，同一个人物、设定、事件不能重复出现，同一个人不同别名必须合并为同一个条目。
5. 必须严格包含所有要求的字段，不能缺失、不能修改字段名。
6. 如果没有对应内容，该字段值设为"暂无"，数组类型设为[]，绝对不能留空或删除字段。
必填字段要求：
人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、逆向分析洞察、质量评估
`;

  const userPrompt = `待合并的多组知识图谱数据：\n${JSON.stringify(graphList, null, 2)}`;

  try {
    toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
    // 调用ST原生生成API
    const result = await generateRaw({
      systemPrompt,
      prompt: userPrompt,
      jsonSchema: mergeGraphJsonSchema,
    });

    // 解析合并后的JSON
    const mergedGraph = JSON.parse(result.trim());
    // 持久化保存
    extension_settings[extensionName].mergedGraph = mergedGraph;
    saveSettingsDebounced();
    // 更新预览
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
// 小说续写核心函数（严格遵守你的续写规则）
// ==============================================
// 生成续写内容
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const writeMode = $('input[name="write-mode"]:checked').val();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};
  const selectedChapters = getSelectedChapters();

  // 前置校验
  if (isGeneratingWrite) {
    toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
    return;
  }

  // 模式校验
  if (writeMode === 'modify') {
    if (selectedChapters.length !== 1) {
      toastr.error('魔改续写模式请选择且仅选择一个章节', "小说续写器");
      return;
    }
  } else if (writeMode === 'next') {
    if (selectedChapters.length < 3) {
      toastr.error('续写下一章模式请至少选择三个连续章节', "小说续写器");
      return;
    }
    // 按章节ID排序，确保顺序正确
    selectedChapters.sort((a, b) => a.id - b.id);
  }

  // 校验合并图谱
  if (Object.keys(mergedGraph).length === 0) {
    toastr.warning('未检测到合并后的知识图谱，建议先合并图谱以保证续写质量', "小说续写器");
  }

  // 构建prompt
  let systemPrompt = '';
  let userPrompt = '';

  // 魔改续写模式
  if (writeMode === 'modify') {
    const targetChapter = selectedChapters[0];
    systemPrompt = `
魔改续写规则（基于当前修改的章节）
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC）。
2. 剧情衔接：续写内容必须和用户修改后的章节内容、前文剧情完美衔接，逻辑自洽，没有矛盾。
3. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式，和原文无缝衔接。
4. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、解释、备注、说明、分割线。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
`;
    userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
当前修改的章节内容：${targetChapter.content}
请基于以上内容，按照规则续写后续内容。
`;
  }
  // 续写下一章模式
  else if (writeMode === 'next') {
    const latestChapters = selectedChapters.slice(-3);
    const chapterContentText = latestChapters.map(chapter => `第${chapter.id+1}章 ${chapter.title}：\n${chapter.content}`).join('\n\n');
    systemPrompt = `
继续续写下一章规则（基于最近三章内容）
1. 人设、世界观：必须严格贴合提供的核心设定，绝对不能出现人设崩塌、世界观矛盾。
2. 剧情衔接：必须与最近三章的内容无缝衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的情节。
3. 文风：必须与原文保持完全一致，包括叙事视角、语言风格、对话方式、节奏特点。
4. 剧情合理：续写内容要符合原小说的世界观，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话。
5. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线。
6. 字数要求：续写约${wordCount}字，误差不超过10%。
`;
    userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
最近三章内容：\n${chapterContentText}
请基于以上内容，按照规则续写下一章的正文内容。
`;
  }

  // 开始生成
  isGeneratingWrite = true;
  stopGenerateFlag = false;
  $('#write-status').text('正在生成续写内容，请稍候...');

  try {
    const result = await generateRaw({
      systemPrompt,
      prompt: userPrompt,
    });

    if (!result.trim()) {
      throw new Error('生成内容为空');
    }

    // 更新预览
    $('#write-content-preview').val(result.trim());
    $('#write-status').text('续写内容生成完成！');
    toastr.success('续写内容生成完成！', "小说续写器");
  } catch (error) {
    console.error('续写生成失败:', error);
    $('#write-status').text(`生成失败: ${error.message}`);
    toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
  }
}

// 获取选中的章节
function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// ==============================================
// 扩展入口（完全与模板的jQuery初始化结构一致）
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

    // 保存用户自定义正则到设置
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
      // 渲染列表
      renderChapterList(currentParsedChapters);
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
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 1500;
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

  // 章节编辑弹窗事件
  $("#edit-save-btn").on("click", saveChapterEdit);
  $("#edit-cancel-btn, #edit-close-btn").on("click", () => {
    $('#chapter-edit-modal').removeClass('show');
    currentEditChapterIndex = -1;
  });
  // 点击遮罩关闭弹窗
  $("#chapter-edit-modal").on("click", (e) => {
    if (e.target.id === 'chapter-edit-modal') {
      $('#chapter-edit-modal').removeClass('show');
      currentEditChapterIndex = -1;
    }
  });

  // ==============================================
  // 知识图谱事件绑定
  // ==============================================
  // 生成选中章节图谱
  $("#graph-single-btn").on("click", () => {
    const selectedChapters = getSelectedChapters();
    generateChapterGraphBatch(selectedChapters);
  });

  // 批量生成全章节图谱
  $("#graph-batch-btn").on("click", () => {
    generateChapterGraphBatch(currentParsedChapters);
  });

  // 停止生成
  $("#graph-stop-btn").on("click", () => {
    if (isGeneratingGraph) {
      stopGenerateFlag = true;
      toastr.info('已停止生成图谱', "小说续写器");
    }
  });

  // 合并图谱
  $("#graph-merge-btn").on("click", mergeAllGraphs);

  // 复制图谱JSON
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

  // 导出图谱JSON文件
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

  // 清空图谱
  $("#graph-clear-btn").on("click", () => {
    extension_settings[extensionName].mergedGraph = {};
    $('#merged-graph-preview').val('');
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });

  // ==============================================
  // 续写生成事件绑定
  // ==============================================
  // 生成续写内容
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
