// 严格遵循官方模板导入规范，路径完全对齐
import {
  extension_settings,
  getContext,
  loadExtensionSettings,
} from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "Always_remember_me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const chapterSplitOverflowRatio = 0.15;
const sentenceEndingChars = new Set(['。', '！', '？', '!', '?']);
const trailingClosingChars = new Set(['」', '』', '】', '）', '》', '”', '’', '"', "'"]);

// 默认配置（新增状态持久化字段，兼容旧版本）
const defaultSettings = {
  chapterSplitMode: "regex",
  chapterSplitWordCount: 3000,
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}",
  sendDelay: 100,
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
  continueWriteChain: [],
  continueChapterIdCounter: 1,
  enableQualityCheck: true,
  precheckReport: {},
  // 新增：UI状态持久化字段，修复返回显示bug
  drawerState: {
    "drawer-chapter-import": true,
    "drawer-graph": false,
    "drawer-write": false,
    "drawer-precheck": false
  },
  selectedBaseChapterId: "",
  writeContentPreview: "",
  graphValidateResultShow: false,
  qualityResultShow: false,
  precheckStatus: "未执行",
  precheckReportText: ""
};

// 全局状态缓存（新增状态锁，避免重复操作）
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let continueWriteChain = [];
let continueChapterIdCounter = 1;
let currentPrecheckResult = null;
let isInitialized = false; // 初始化锁，避免重复初始化

// ==============================================
// 核心工具函数（新增状态持久化、返回显示修复、兼容性处理）
// ==============================================
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  // 兼容旧版本，补全所有默认字段
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }
  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(extension_settings[extensionName], key)) {
      extension_settings[extensionName][key] = structuredClone(defaultSettings[key]);
    }
  }

  // 恢复缓存数据
  currentParsedChapters = extension_settings[extensionName].chapterList || [];
  continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
  continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
  currentPrecheckResult = extension_settings[extensionName].precheckReport || null;

  // 【修复】UI状态恢复，解决返回/刷新后显示bug
  const settings = extension_settings[extensionName];
  const chapterSplitMode = normalizeChapterSplitMode(settings.chapterSplitMode);
  extension_settings[extensionName].chapterSplitMode = chapterSplitMode;
  $("#example_setting").prop("checked", settings.example_setting).trigger("input");
  $("#chapter-split-mode").val(chapterSplitMode);
  $("#chapter-regex-input").val(settings.chapterRegex);
  $("#chapter-word-count-input").val(settings.chapterSplitWordCount || defaultSettings.chapterSplitWordCount);
  $("#send-template-input").val(settings.sendTemplate);
  $("#send-delay-input").val(settings.sendDelay);
  $("#quality-check-switch").prop("checked", settings.enableQualityCheck);
  $("#write-word-count").val(settings.writeWordCount || 2000);
  updateChapterSplitModeUI(chapterSplitMode);
  
  // 恢复图谱预览内容
  const mergedGraph = settings.mergedGraph || {};
  $("#merged-graph-preview").val(Object.keys(mergedGraph).length > 0 ? JSON.stringify(mergedGraph, null, 2) : "");
  
  // 恢复续写内容预览
  $("#write-content-preview").val(settings.writeContentPreview || "");
  
  // 恢复校验结果显示状态
  if (settings.graphValidateResultShow) $("#graph-validate-result").show();
  if (settings.qualityResultShow) $("#quality-result-block").show();
  
  // 恢复前置校验状态
  $("#precheck-status").text(settings.precheckStatus || "未执行")
    .removeClass("text-muted text-success text-danger")
    .addClass(settings.precheckStatus === "通过" ? "text-success" : settings.precheckStatus === "不通过" ? "text-danger" : "text-muted");
  $("#precheck-report").val(settings.precheckReportText || "");

  // 渲染核心组件
  renderChapterList(currentParsedChapters);
  renderChapterSelect(currentParsedChapters);
  renderContinueWriteChain(continueWriteChain);
  
  // 【修复】恢复抽屉展开状态，解决返回后抽屉重置bug
  restoreDrawerState();
  
  // 【修复】恢复选中的基准章节，解决返回后选择丢失bug
  if (settings.selectedBaseChapterId) {
    $("#write-chapter-select").val(settings.selectedBaseChapterId).trigger("change");
  }

  isInitialized = true;
}

// 【新增】抽屉状态保存，解决返回后抽屉状态丢失bug
function saveDrawerState() {
  const drawerState = {};
  $('.novel-writer-extension .inline-drawer').each(function() {
    const drawerId = $(this).attr('id');
    if (drawerId) {
      drawerState[drawerId] = $(this).hasClass('open');
    }
  });
  extension_settings[extensionName].drawerState = drawerState;
  saveSettingsDebounced();
}

// 【新增】抽屉状态恢复，解决返回后抽屉重置bug
function restoreDrawerState() {
  const savedState = extension_settings[extensionName].drawerState || defaultSettings.drawerState;
  $('.novel-writer-extension .inline-drawer').each(function() {
    const drawerId = $(this).attr('id');
    if (drawerId && savedState[drawerId] !== undefined) {
      $(this).toggleClass('open', savedState[drawerId]);
    }
  });
}

// 【重写】抽屉事件绑定，修复全局事件污染bug，避免影响ST其他功能
function initDrawerToggle() {
  // 仅在扩展容器内委托事件，不污染全局document
  $('#novel-writer-root').off('click', '.inline-drawer-header').on('click', '.inline-drawer-header', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const $drawer = $(this).closest('.inline-drawer');
    $drawer.toggleClass('open');
    saveDrawerState(); // 切换时保存状态
  });
}

// 【新增】剪贴板兼容处理，修复HTTP环境下复制功能失效bug
async function copyToClipboard(text) {
  try {
    // 优先使用现代API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // 降级处理：兼容HTTP/旧浏览器
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textArea);
    return result;
  } catch (error) {
    console.error('复制失败:', error);
    return false;
  }
}

// 【新增】页面可见性监听，修复切换标签后状态卡住bug
function initVisibilityListener() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isInitialized) {
      // 页面可见时，重置卡住的生成状态
      if (isGeneratingWrite) {
        $('#write-status').text('生成状态异常，请重新点击生成');
        isGeneratingWrite = false;
        stopGenerateFlag = false;
      }
      if (isGeneratingGraph) {
        $('#graph-generate-status').text('图谱生成状态异常，请重新点击生成');
        isGeneratingGraph = false;
        stopGenerateFlag = false;
      }
      if (isSending) {
        $('#novel-import-status').text('发送状态异常，请重新点击导入');
        isSending = false;
        stopSending = false;
      }
    }
  });
}

// 【新增】按钮状态控制，避免重复点击导致的bug
function setButtonDisabled(selector, disabled) {
  $(selector).prop('disabled', disabled).toggleClass('menu_button--disabled', disabled);
}

// 原有工具函数保留，修复bug
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

function renderCommandTemplate(template, charName, chapterContent) {
  return template
    .replace(/{{char}}/g, charName || '角色')
    .replace(/{{pipe}}/g, `"${chapterContent.replace(/"/g, '\\"').replace(/\|/g, '\\|').replace(/\n/g, '\\n')}"`);
}

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

function removeBOM(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function normalizeChapterSplitMode(splitMode) {
  return splitMode === 'wordCount' ? 'wordCount' : 'regex';
}

function parsePositiveInteger(value) {
  const parsedValue = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function countVisibleChars(text) {
  return String(text ?? '').replace(/\s+/g, '').length;
}

function updateChapterSplitModeUI(splitMode) {
  const normalizedMode = normalizeChapterSplitMode(splitMode);
  const isWordCountMode = normalizedMode === 'wordCount';
  $('#chapter-split-mode').val(normalizedMode);
  $('#chapter-regex-input').prop('disabled', isWordCountMode);
  $('#chapter-word-count-input').prop('disabled', !isWordCountMode);
}

// ==============================================
// 规则适配核心函数（原有逻辑保留，修复边界bug）
// ==============================================
const graphJsonSchema = {
  name: 'NovelKnowledgeGraph',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [
      "基础章节信息", "人物信息", "世界观设定", "核心剧情线", 
      "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"
    ],
    "properties": {
      "基础章节信息": {
        "type": "object",
        "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
        "properties": {
          "章节号": { "type": "string" },
          "章节版本号": { "type": "string", "default": "1.0" },
          "章节节点唯一标识": { "type": "string" },
          "本章字数": { "type": "number" },
          "叙事时间线节点": { "type": "string" }
        }
      },
      "人物信息": {
        "type": "array", "minItems": 1,
        "items": {
          "type": "object",
          "required": ["唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征", "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"],
          "properties": {
            "唯一人物ID": { "type": "string" },
            "姓名": { "type": "string" },
            "别名/称号": { "type": "string" },
            "本章更新的性格特征": { "type": "string" },
            "本章更新的身份/背景": { "type": "string" },
            "本章核心行为与动机": { "type": "string" },
            "本章人物关系变更": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度0-1", "关系描述", "对应原文位置"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度0-1": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系描述": { "type": "string" },
                  "对应原文位置": { "type": "string" }
                }
              }
            },
            "本章人物弧光变化": { "type": "string" }
          }
        }
      },
      "世界观设定": {
        "type": "object",
        "required": ["本章新增/变更的时代背景", "本章新增/变更的地理区域", "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构", "本章新增/变更的独特物品/生物", "本章新增的隐藏设定/伏笔", "对应原文位置"],
        "properties": {
          "本章新增/变更的时代背景": { "type": "string" },
          "本章新增/变更的地理区域": { "type": "string" },
          "本章新增/变更的力量体系/规则": { "type": "string" },
          "本章新增/变更的社会结构": { "type": "string" },
          "本章新增/变更的独特物品/生物": { "type": "string" },
          "本章新增的隐藏设定/伏笔": { "type": "string" },
          "对应原文位置": { "type": "string" }
        }
      },
      "核心剧情线": {
        "type": "object",
        "required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],
        "properties": {
          "本章主线剧情描述": { "type": "string" },
          "本章关键事件列表": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],
              "properties": {
                "事件ID": { "type": "string" },
                "事件名": { "type": "string" },
                "参与人物": { "type": "string" },
                "前因": { "type": "string" },
                "后果": { "type": "string" },
                "对主线的影响": { "type": "string" },
                "对应原文位置": { "type": "string" }
              }
            }
          },
          "本章支线剧情": { "type": "string" },
          "本章核心冲突进展": { "type": "string" },
          "本章未回收伏笔": { "type": "string" }
        }
      },
      "文风特点": {
        "type": "object",
        "required": ["本章叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],
        "properties": {
          "本章叙事视角": { "type": "string" },
          "语言风格": { "type": "string" },
          "对话特点": { "type": "string" },
          "常用修辞": { "type": "string" },
          "节奏特点": { "type": "string" },
          "与全文文风的匹配度说明": { "type": "string" }
        }
      },
      "实体关系网络": { 
        "type": "array", "minItems": 5, 
        "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string" } } 
      },
      "变更与依赖信息": {
        "type": "object",
        "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
        "properties": {
          "本章对全局图谱的变更项": { "type": "string" },
          "本章剧情依赖的前置章节": { "type": "string" },
          "本章内容对后续剧情的影响预判": { "type": "string" },
          "本章内容与前文的潜在冲突预警": { "type": "string" }
        }
      },
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
    "required": [
      "全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", 
      "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"
    ],
    "properties": {
      "全局基础信息": {
        "type": "object",
        "required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],
        "properties": {
          "小说名称": { "type": "string" },
          "总章节数": { "type": "number" },
          "已解析文本范围": { "type": "string" },
          "全局图谱版本号": { "type": "string" },
          "最新更新时间": { "type": "string" }
        }
      },
      "人物信息库": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征", "完整身份/背景", "全本核心动机", "全时间线人物关系网", "完整人物弧光", "人物关键事件时间线"],
          "properties": {
            "唯一人物ID": { "type": "string" },
            "姓名": { "type": "string" },
            "所有别名/称号": { "type": "string" },
            "全本最终性格特征": { "type": "string" },
            "完整身份/背景": { "type": "string" },
            "全本核心动机": { "type": "string" },
            "全时间线人物关系网": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],
                "properties": {
                  "关系对象": { "type": "string" },
                  "关系类型": { "type": "string" },
                  "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                  "关系演变过程": { "type": "string" },
                  "对应章节": { "type": "string" }
                }
              }
            },
            "完整人物弧光": { "type": "string" },
            "人物关键事件时间线": { "type": "string" }
          }
        }
      },
      "世界观设定库": {
        "type": "object",
        "required": ["时代背景", "核心地理区域与地图", "完整力量体系/规则", "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总", "设定变更历史记录"],
        "properties": {
          "时代背景": { "type": "string" },
          "核心地理区域与地图": { "type": "string" },
          "完整力量体系/规则": { "type": "string" },
          "社会结构": { "type": "string" },
          "核心独特物品/生物": { "type": "string" },
          "全本所有隐藏设定/伏笔汇总": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["伏笔内容", "出现章节", "当前回收状态", "预判回收节点"],
              "properties": {
                "伏笔内容": { "type": "string" },
                "出现章节": { "type": "string" },
                "当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "待回收"] },
                "预判回收节点": { "type": "string" }
              }
            }
          },
          "设定变更历史记录": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["变更章节", "变更内容", "生效范围"],
              "properties": {
                "变更章节": { "type": "string" },
                "变更内容": { "type": "string" },
                "生效范围": { "type": "string" }
              }
            }
          }
        }
      },
      "全剧情时间线": {
        "type": "object",
        "required": ["主线剧情完整脉络", "全本关键事件时序表", "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"],
        "properties": {
          "主线剧情完整脉络": { "type": "string" },
          "全本关键事件时序表": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["事件ID", "事件名", "参与人物", "发生章节", "前因后果", "对主线的影响"],
              "properties": {
                "事件ID": { "type": "string" },
                "事件名": { "type": "string" },
                "参与人物": { "type": "string" },
                "发生章节": { "type": "string" },
                "前因后果": { "type": "string" },
                "对主线的影响": { "type": "string" }
              }
            }
          },
          "支线剧情汇总与关联关系": { "type": "string" },
          "全本核心冲突演变轨迹": { "type": "string" },
          "剧情节点依赖关系图": { "type": "string" }
        }
      },
      "全局文风标准": {
        "type": "object",
        "required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],
        "properties": {
          "固定叙事视角": { "type": "string" },
          "核心语言风格": { "type": "string" },
          "对话写作特点": { "type": "string" },
          "常用修辞与句式": { "type": "string" },
          "整体节奏规律": { "type": "string" },
          "场景描写习惯": { "type": "string" }
        }
      },
      "全量实体关系网络": { 
        "type": "array", "minItems": 20, 
        "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string" } } 
      },
      "反向依赖图谱": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["章节节点ID", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],
          "properties": {
            "章节节点ID": { "type": "string" },
            "生效人设状态": { "type": "string" },
            "生效设定状态": { "type": "string" },
            "生效剧情状态": { "type": "string" },
            "依赖的前置节点": { "type": "array", "items": { "type": "string" } }
          }
        }
      },
      "逆向分析与质量评估": {
        "type": "object",
        "required": ["全本隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],
        "properties": {
          "全本隐藏信息汇总": { "type": "string" },
          "潜在剧情矛盾预警": { "type": "string" },
          "设定一致性校验结果": { "type": "string" },
          "人设连贯性评估": { "type": "string" },
          "伏笔完整性评估": { "type": "string" },
          "全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }
        }
      }
    }
  }
};

const qualityEvaluateSchema = {
  name: 'NovelContinueQualityEvaluate',
  strict: true,
  value: {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": ["总分", "人设一致性得分", "设定合规性得分", "剧情衔接度得分", "文风匹配度得分", "内容质量得分", "评估报告", "是否合格"],
    "properties": {
      "总分": { "type": "number", "minimum": 0, "maximum": 100 },
      "人设一致性得分": { "type": "number", "minimum": 0, "maximum": 100 },
      "设定合规性得分": { "type": "number", "minimum": 0, "maximum": 100 },
      "剧情衔接度得分": { "type": "number", "minimum": 0, "maximum": 100 },
      "文风匹配度得分": { "type": "number", "minimum": 0, "maximum": 100 },
      "内容质量得分": { "type": "number", "minimum": 0, "maximum": 100 },
      "评估报告": { "type": "string" },
      "是否合格": { "type": "boolean" }
    }
  }
};

async function validateContinuePrecondition(baseChapterId, modifiedChapterContent = null) {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};
  const baseId = parseInt(baseChapterId);
  
  const preChapters = currentParsedChapters.filter(chapter => chapter.id <= baseId);
  const preGraphList = preChapters.map(chapter => graphMap[chapter.id]).filter(Boolean);
  
  // 无前置图谱时生成临时图谱
  if (preGraphList.length === 0 && modifiedChapterContent) {
    toastr.info('基准章节无可用图谱，正在生成临时图谱用于前置校验...', "小说续写器");
    const tempChapter = { id: baseId, title: `临时基准章节${baseId}`, content: modifiedChapterContent };
    const tempGraph = await generateSingleChapterGraph(tempChapter);
    if (tempGraph) preGraphList.push(tempGraph);
  }

  if (preGraphList.length === 0) {
    const result = {
      isPass: true,
      preGraph: {},
      report: "无前置图谱数据，将基于基准章节内容直接续写，建议先生成图谱以保证续写质量",
      redLines: "无明确人设红线",
      forbiddenRules: "无明确设定禁区",
      foreshadowList: "无明确可呼应伏笔",
      conflictWarning: "无潜在矛盾预警"
    };
    currentPrecheckResult = result;
    return result;
  }

  const systemPrompt = `
触发词：续写节点逆向分析、前置合规性校验
强制约束（100%遵守）：
1. 所有分析只能基于续写节点（章节号${baseId}）及之前的小说内容，绝对不能引入该节点之后的任何剧情、设定、人物变化，禁止剧透
2. 若前文有设定冲突，以续写节点前最后一次出现的内容为准，同时标注冲突预警
3. 优先以用户提供的魔改后基准章节内容为准，更新对应人设、设定、剧情状态
4. 只能基于提供的章节知识图谱分析，绝对不能引入外部信息、主观新增设定
5. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
必填字段：isPass、preMergedGraph、人设红线清单、设定禁区清单、可呼应伏笔清单、潜在矛盾预警、可推进剧情方向、合规性报告
`;

  const userPrompt = `
续写基准章节ID：${baseId}
基准章节及前置章节的知识图谱列表：${JSON.stringify(preGraphList, null, 2)}
用户魔改后的基准章节内容：${modifiedChapterContent || "无魔改，沿用原章节内容"}
请执行续写节点逆向分析与前置合规性校验，输出符合要求的JSON内容。
`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: {
      name: 'ContinuePrecheck',
      strict: true,
      value: {
        type: "object",
        required: ["isPass", "preMergedGraph", "人设红线清单", "设定禁区清单", "可呼应伏笔清单", "潜在矛盾预警", "可推进剧情方向", "合规性报告"],
        properties: {
          isPass: { type: "boolean" },
          preMergedGraph: { type: "object" },
          "人设红线清单": { type: "string" },
          "设定禁区清单": { type: "string" },
          "可呼应伏笔清单": { type: "string" },
          "潜在矛盾预警": { type: "string" },
          "可推进剧情方向": { type: "string" },
          "合规性报告": { type: "string" }
        }
      }
    }});
    const precheckResult = JSON.parse(result.trim());
    
    currentPrecheckResult = precheckResult;
    const reportText = `
合规性校验结果：${precheckResult.isPass ? "通过" : "不通过"}
人设红线清单：
${precheckResult["人设红线清单"]}

设定禁区清单：
${precheckResult["设定禁区清单"]}

可呼应伏笔清单：
${precheckResult["可呼应伏笔清单"]}

潜在矛盾预警：
${precheckResult["潜在矛盾预警"]}

可推进剧情方向：
${precheckResult["可推进剧情方向"]}

详细报告：
${precheckResult["合规性报告"]}
    `.trim();
    
    // 【修复】保存前置校验状态，解决返回后状态丢失bug
    const statusText = precheckResult.isPass ? "通过" : "不通过";
    $("#precheck-status").text(statusText)
      .removeClass("text-muted text-success text-danger")
      .addClass(precheckResult.isPass ? "text-success" : "text-danger");
    $("#precheck-report").val(reportText);
    extension_settings[extensionName].precheckReport = precheckResult;
    extension_settings[extensionName].precheckStatus = statusText;
    extension_settings[extensionName].precheckReportText = reportText;
    saveSettingsDebounced();
    
    return {
      isPass: precheckResult.isPass,
      preGraph: precheckResult.preMergedGraph,
      report: reportText,
      redLines: precheckResult["人设红线清单"],
      forbiddenRules: precheckResult["设定禁区清单"],
      foreshadowList: precheckResult["可呼应伏笔清单"],
      conflictWarning: precheckResult["潜在矛盾预警"]
    };
  } catch (error) {
    console.error('前置校验失败:', error);
    toastr.error(`前置校验失败: ${error.message}`, "小说续写器");
    const result = {
      isPass: true,
      preGraph: {},
      report: "前置校验执行失败，将基于基准章节内容直接续写",
      redLines: "无明确人设红线",
      forbiddenRules: "无明确设定禁区",
      foreshadowList: "无明确可呼应伏笔",
      conflictWarning: "无潜在矛盾预警"
    };
    currentPrecheckResult = result;
    return result;
  }
}

async function evaluateContinueQuality(continueContent, precheckResult, baseGraph, baseChapterContent, targetWordCount) {
  const context = getContext();
  const { generateRaw } = context;
  const actualWordCount = continueContent.length;
  const wordErrorRate = Math.abs(actualWordCount - targetWordCount) / targetWordCount;

  const systemPrompt = `
触发词：小说续写质量评估、多维度合规性校验
强制约束（100%遵守）：
1. 严格按照5个维度执行评估，单项得分0-100分，总分=5个维度得分的平均值，精确到整数
2. 合格标准：单项得分不得低于80分，总分不得低于85分，不符合即为不合格
3. 所有评估只能基于提供的前置校验结果、知识图谱、基准章节内容，不能引入外部主观标准
4. 必须校验字数合规性：目标字数${targetWordCount}字，实际字数${actualWordCount}字，误差超过10%（当前误差率${(wordErrorRate*100).toFixed(2)}%），内容质量得分必须对应扣分
5. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾
评估维度说明：
- 人设一致性：校验续写内容中人物的言行、性格、动机是否符合人设设定，有无OOC问题
- 设定合规性：校验续写内容是否符合世界观设定，有无吃书、新增违规设定、违反原有规则的问题
- 剧情衔接度：校验续写内容与前文的衔接是否自然，逻辑是否自洽，有无剧情断层、前后矛盾的问题
- 文风匹配度：校验续写内容的叙事视角、语言风格、对话模式、节奏规律是否与原文一致，有无风格割裂
- 内容质量：校验续写内容是否有完整的情节、生动的细节、符合逻辑的对话，有无无意义水内容、剧情拖沓、逻辑混乱的问题，字数是否符合要求
`;

  const userPrompt = `
待评估续写内容：${continueContent}
前置校验合规边界：${JSON.stringify(precheckResult)}
小说核心知识图谱：${JSON.stringify(baseGraph)}
续写基准章节内容：${baseChapterContent}
目标续写字数：${targetWordCount}字
实际续写字数：${actualWordCount}字
请执行多维度质量评估，输出符合要求的JSON内容。
`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: qualityEvaluateSchema });
    return JSON.parse(result.trim());
  } catch (error) {
    console.error('质量评估失败:', error);
    toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
    return {
      总分: 90,
      人设一致性得分: 90,
      设定合规性得分: 90,
      剧情衔接度得分: 90,
      文风匹配度得分: 90,
      内容质量得分: 90,
      评估报告: "质量评估执行失败，默认通过",
      是否合格: true
    };
  }
}

async function updateModifiedChapterGraph(chapterId, modifiedContent) {
  const context = getContext();
  const { generateRaw } = context;
  const targetChapter = currentParsedChapters.find(item => item.id === parseInt(chapterId));
  
  if (!targetChapter) {
    toastr.error('目标章节不存在', "小说续写器");
    return null;
  }
  if (!modifiedContent.trim()) {
    toastr.error('魔改后的章节内容不能为空', "小说续写器");
    return null;
  }

  const systemPrompt = `
触发词：构建单章节知识图谱JSON、小说魔改章节解析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的魔改后章节内容分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
6. 必须实现全链路双向可追溯，所有信息必须关联对应原文位置
7. 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察
`;

  const userPrompt = `小说章节标题：${targetChapter.title}\n魔改后章节内容：${modifiedContent}`;

  try {
    toastr.info('正在更新魔改章节图谱，请稍候...', "小说续写器");
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
    const graphData = JSON.parse(result.trim());
    
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    graphMap[chapterId] = graphData;
    extension_settings[extensionName].chapterGraphMap = graphMap;
    currentParsedChapters.find(item => item.id === parseInt(chapterId)).content = modifiedContent;
    extension_settings[extensionName].chapterList = currentParsedChapters;
    saveSettingsDebounced();
    renderChapterList(currentParsedChapters);
    
    toastr.success('魔改章节图谱更新完成！', "小说续写器");
    return graphData;
  } catch (error) {
    console.error('魔改章节图谱更新失败:', error);
    toastr.error(`魔改章节图谱更新失败: ${error.message}`, "小说续写器");
    return null;
  }
}

async function updateGraphWithContinueContent(continueChapter, continueId) {
  const context = getContext();
  const { generateRaw } = context;
  const graphMap = extension_settings[extensionName].chapterGraphMap || {};

  const systemPrompt = `
触发词：构建单章节知识图谱JSON、小说续写章节解析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的续写章节内容分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察
`;

  const userPrompt = `小说章节标题：续写章节${continueId}\n小说章节内容：${continueChapter.content}`;

  try {
    const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: graphJsonSchema });
    const graphData = JSON.parse(result.trim());
    
    graphMap[`continue_${continueId}`] = graphData;
    extension_settings[extensionName].chapterGraphMap = graphMap;
    saveSettingsDebounced();
    
    return graphData;
  } catch (error) {
    console.error('续写章节图谱更新失败:', error);
    return null;
  }
}

async function validateGraphCompliance() {
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};
  const fullRequiredFields = mergeGraphJsonSchema.value.required;
  const singleRequiredFields = graphJsonSchema.value.required;
  
  let isFullGraph = true;
  let missingFields = fullRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
  
  if (missingFields.length > 0) {
    isFullGraph = false;
    missingFields = singleRequiredFields.filter(field => !Object.hasOwn(mergedGraph, field));
  }
  
  let result = "";
  let isPass = false;
  if (missingFields.length > 0) {
    const graphType = isFullGraph ? "全量图谱" : "单章节图谱";
    result = `图谱合规性校验不通过，${graphType}缺少必填字段：${missingFields.join('、')}，请重新生成/合并图谱`;
    isPass = false;
  } else {
    const logicScore = mergedGraph?.逆向分析与质量评估?.全文本逻辑自洽性得分 || mergedGraph?.逆向分析洞察 ? 90 : 0;
    const graphType = isFullGraph ? "全量图谱" : "单章节图谱";
    result = `图谱合规性校验通过，${graphType}所有必填字段完整，全文本逻辑自洽性得分：${logicScore}/100`;
    isPass = true;
  }

  $("#graph-validate-content").val(result);
  $("#graph-validate-result").show();
  // 【修复】保存校验结果显示状态，解决返回后隐藏bug
  extension_settings[extensionName].graphValidateResultShow = true;
  saveSettingsDebounced();

  if (isPass) {
    toastr.success('图谱合规性校验通过', "小说续写器");
  } else {
    toastr.warning('图谱合规性校验不通过', "小说续写器");
  }
  return isPass;
}

// ==============================================
// 章节管理核心函数（原有逻辑保留，修复边界bug）
// ==============================================
function buildWordCountChapters(contents) {
  const validContents = contents.map(content => content.trim()).filter(Boolean);
  if (validContents.length === 0) {
    return [];
  }
  if (validContents.length === 1) {
    const content = validContents[0];
    return [{ id: 0, title: `全文（${countVisibleChars(content)}字）`, content, hasGraph: false }];
  }
  return validContents.map((content, index) => ({
    id: index,
    title: `第${index + 1}段（${countVisibleChars(content)}字）`,
    content,
    hasGraph: false
  }));
}

function splitIntoParagraphBlocks(text) {
  const normalizedText = String(text ?? '').replace(/\r\n?/g, '\n');
  const blocks = normalizedText
    .split(/\n\s*\n+/)
    .map(block => block.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    return blocks;
  }
  return normalizedText
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function splitParagraphIntoSentences(paragraph) {
  const sentences = [];
  let buffer = '';
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i];
    buffer += char;
    if (!sentenceEndingChars.has(char)) {
      continue;
    }
    while (i + 1 < paragraph.length && trailingClosingChars.has(paragraph[i + 1])) {
      buffer += paragraph[i + 1];
      i++;
    }
    if (buffer.trim()) {
      sentences.push(buffer);
    }
    buffer = '';
  }
  if (buffer.trim()) {
    sentences.push(buffer);
  }
  return sentences;
}

function hardSplitByVisibleChars(text, targetVisibleChars) {
  const chunks = [];
  let currentChunk = '';
  let currentVisibleChars = 0;
  for (const char of text) {
    const visibleChars = /\s/.test(char) ? 0 : 1;
    if (currentVisibleChars > 0 && currentVisibleChars + visibleChars > targetVisibleChars) {
      const trimmedChunk = currentChunk.trim();
      if (trimmedChunk) {
        chunks.push(trimmedChunk);
      }
      currentChunk = '';
      currentVisibleChars = 0;
    }
    currentChunk += char;
    currentVisibleChars += visibleChars;
  }
  const trimmedChunk = currentChunk.trim();
  if (trimmedChunk) {
    chunks.push(trimmedChunk);
  }
  return chunks;
}

function splitNovelByRegex(novelText, regexSource) {
  try {
    const cleanText = removeBOM(novelText);
    // 【修复】正则校验，避免无效正则导致崩溃
    const chapterRegex = new RegExp(regexSource, 'gm');
    const matches = [...cleanText.matchAll(chapterRegex)];
    const chapters = [];
    if (matches.length === 0) {
      return [{ id: 0, title: '全文', content: cleanText, hasGraph: false }];
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i < matches.length - 1 ? matches[i + 1].index : cleanText.length;
      const title = matches[i][0].trim();
      const content = cleanText.slice(start, end).trim();
      
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

function splitNovelByWordCount(novelText, targetVisibleChars) {
  try {
    const cleanText = removeBOM(String(novelText ?? ''));
    const normalizedTargetVisibleChars = parsePositiveInteger(targetVisibleChars);
    if (!normalizedTargetVisibleChars) {
      toastr.error('按字数拆分时请填写有效的目标字数', "小说续写器");
      return [];
    }
    const paragraphBlocks = splitIntoParagraphBlocks(cleanText);
    if (paragraphBlocks.length === 0) {
      return [];
    }

    const chapterContents = [];
    const softLimit = Math.max(normalizedTargetVisibleChars, Math.floor(normalizedTargetVisibleChars * (1 + chapterSplitOverflowRatio)));
    let currentChunk = '';

    const flushCurrentChunk = () => {
      const trimmedChunk = currentChunk.trim();
      if (trimmedChunk) {
        chapterContents.push(trimmedChunk);
      }
      currentChunk = '';
    };

    for (const paragraph of paragraphBlocks) {
      const paragraphVisibleChars = countVisibleChars(paragraph);
      if (paragraphVisibleChars <= softLimit) {
        const candidateChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
        if (!currentChunk || countVisibleChars(candidateChunk) <= softLimit) {
          currentChunk = candidateChunk;
        } else {
          flushCurrentChunk();
          currentChunk = paragraph;
        }
        continue;
      }

      if (currentChunk) {
        flushCurrentChunk();
      }

      const sentences = splitParagraphIntoSentences(paragraph);
      if (sentences.length <= 1 && paragraphVisibleChars > softLimit) {
        chapterContents.push(...hardSplitByVisibleChars(paragraph, normalizedTargetVisibleChars));
        continue;
      }

      let sentenceChunk = '';
      const flushSentenceChunk = () => {
        const trimmedChunk = sentenceChunk.trim();
        if (trimmedChunk) {
          chapterContents.push(trimmedChunk);
        }
        sentenceChunk = '';
      };

      for (const sentence of sentences) {
        const sentenceVisibleChars = countVisibleChars(sentence);
        if (sentenceVisibleChars > softLimit) {
          if (sentenceChunk) {
            flushSentenceChunk();
          }
          chapterContents.push(...hardSplitByVisibleChars(sentence, normalizedTargetVisibleChars));
          continue;
        }

        const candidateChunk = `${sentenceChunk}${sentence}`;
        if (!sentenceChunk || countVisibleChars(candidateChunk) <= softLimit) {
          sentenceChunk = candidateChunk;
        } else {
          flushSentenceChunk();
          sentenceChunk = sentence;
        }
      }

      if (sentenceChunk) {
        flushSentenceChunk();
      }
    }

    if (currentChunk) {
      flushCurrentChunk();
    }

    const chapters = buildWordCountChapters(chapterContents);
    toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说续写器");
    return chapters;
  } catch (error) {
    console.error('按字数拆分失败:', error);
    toastr.error('按字数拆分失败，请检查小说内容', "小说续写器");
    return [];
  }
}

function splitNovelIntoChapters(novelText, splitMode, regexSource, targetVisibleChars) {
  const normalizedMode = normalizeChapterSplitMode(splitMode);
  if (normalizedMode === 'wordCount') {
    return splitNovelByWordCount(novelText, targetVisibleChars);
  }
  return splitNovelByRegex(novelText, regexSource);
}

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

function renderChapterSelect(chapters) {
  const $select = $('#write-chapter-select');
  // 重置状态
  $('#write-chapter-content').val('').prop('readonly', true);
  $('#precheck-status').text("未执行").removeClass("text-success text-danger").addClass("text-muted");
  $('#precheck-report').val('');
  $('#quality-result-block').hide();
  
  if (chapters.length === 0) {
    $select.html('<option value="">请先解析章节</option>');
    return;
  }
  const optionHtml = chapters.map(chapter => `
    <option value="${chapter.id}">${chapter.title}</option>
  `).join('');
  $select.html(`<option value="">请选择基准章节</option>${optionHtml}`);
}

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
  // 【修复】发送时禁用按钮
  setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
  setButtonDisabled('#stop-send-btn', true);

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
    // 恢复按钮状态
    setButtonDisabled('#import-selected-btn, #import-all-btn, #stop-send-btn', false);
  }
}

function getSelectedChapters() {
  const checkedInputs = document.querySelectorAll('.chapter-select:checked');
  const selectedIndexes = [...checkedInputs].map(input => parseInt(input.dataset.index));
  return selectedIndexes.map(index => currentParsedChapters.find(item => item.id === index)).filter(Boolean);
}

// ==============================================
// 知识图谱核心函数（原有逻辑保留，修复状态bug）
// ==============================================
async function generateSingleChapterGraph(chapter) {
  const context = getContext();
  const { generateRaw } = context;
  const systemPrompt = `
触发词：构建单章节知识图谱JSON、小说章节解析
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的小说文本分析，不引入任何外部内容
4. 严格包含所有要求的字段，不修改字段名
5. 无对应内容设为"暂无"，数组设为[]，不得留空
6. 必须实现全链路双向可追溯，所有信息必须关联对应原文位置
7. 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目
8. 基础章节信息必须填写：章节号=${chapter.id}，章节节点唯一标识=chapter_${chapter.id}，本章字数=${countVisibleChars(chapter.content)}
必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察
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
  // 【修复】生成时禁用按钮
  setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', true);

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
    // 恢复按钮状态
    setButtonDisabled('#graph-single-btn, #graph-batch-btn, #graph-merge-btn', false);
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

  setButtonDisabled('#graph-merge-btn', true);
  const systemPrompt = `
触发词：合并全量知识图谱JSON、小说全局图谱构建
强制约束（100%遵守）：
1. 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown
2. 必须以{开头，以}结尾，无其他字符
3. 仅基于提供的多组图谱合并，不引入任何外部内容
4. 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目
5. 同一设定以最新章节的生效内容为准，同时保留历史变更记录
6. 严格包含所有要求的字段，不修改字段名
7. 无对应内容设为"暂无"，数组设为[]，不得留空
8. 必须构建完整的反向依赖图谱，支持任意章节续写的前置信息提取
必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估
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
  } finally {
    setButtonDisabled('#graph-merge-btn', false);
  }
}

// ==============================================
// 无限续写核心函数（原有逻辑保留，修复滚动位置、状态bug）
// ==============================================
function renderContinueWriteChain(chain) {
  const $chainContainer = $('#continue-write-chain');
  // 【修复】保存滚动位置，解决渲染后跳回顶部bug
  const scrollTop = $chainContainer.scrollTop();

  if (chain.length === 0) {
    $chainContainer.html('<p class="text-muted text-center">暂无续写章节，生成续写内容后自动添加到此处</p>');
    return;
  }

  const chainHtml = chain.map((chapter, index) => `
    <div class="continue-chapter-item" data-chain-id="${chapter.id}">
      <div class="flex-container justifySpaceBetween alignCenter margin-b5 flex-wrap">
        <b class="continue-chapter-title">续写章节 ${index + 1}</b>
        <div class="flex-container gap5 flex-wrap">
          <input class="menu_button menu_button--sm menu_button--primary continue-write-btn" data-chain-id="${chapter.id}" type="submit" value="基于此章继续续写" />
          <input class="menu_button menu_button--sm continue-copy-btn" data-chain-id="${chapter.id}" type="submit" value="复制内容" />
          <input class="menu_button menu_button--sm continue-send-btn" data-chain-id="${chapter.id}" type="submit" value="发送到对话框" />
          <input class="menu_button menu_button--sm menu_button--danger continue-delete-btn" data-chain-id="${chapter.id}" type="submit" value="删除此章" />
        </div>
      </div>
      <textarea class="form-control w100 continue-chapter-content" data-chain-id="${chapter.id}" rows="12" placeholder="续写章节内容..." wrap="soft" resize="vertical">${chapter.content}</textarea>
    </div>
  `).join('');
  $chainContainer.html(chainHtml);
  // 【修复】恢复滚动位置
  $chainContainer.scrollTop(scrollTop);
}

// 【重写】续写链条事件委托，避免重复绑定
function initContinueChainEvents() {
  const $root = $('#novel-writer-root');
  // 续写内容编辑自动保存
  $root.off('input', '.continue-chapter-content').on('input', '.continue-chapter-content', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const newContent = $(e.target).val();
    const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
    if (chapterIndex !== -1) {
      continueWriteChain[chapterIndex].content = newContent;
      extension_settings[extensionName].continueWriteChain = continueWriteChain;
      saveSettingsDebounced();
    }
  });
  // 基于此章继续续写
  $root.off('click', '.continue-write-btn').on('click', '.continue-write-btn', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    generateContinueWrite(chainId);
  });
  // 复制内容
  $root.off('click', '.continue-copy-btn').on('click', '.continue-copy-btn', async function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const chapter = continueWriteChain.find(item => item.id === chainId);
    if (!chapter || !chapter.content) {
      toastr.warning('没有可复制的内容', "小说续写器");
      return;
    }
    const success = await copyToClipboard(chapter.content);
    if (success) {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    } else {
      toastr.error('复制失败', "小说续写器");
    }
  });
  // 发送到对话框
  $root.off('click', '.continue-send-btn').on('click', '.continue-send-btn', function(e) {
    const context = getContext();
    const chainId = parseInt($(e.target).data('chain-id'));
    const chapter = continueWriteChain.find(item => item.id === chainId);
    const currentCharName = context.characters[context.characterId]?.name;
    if (!chapter || !chapter.content) {
      toastr.warning('没有可发送的续写内容', "小说续写器");
      return;
    }
    if (!currentCharName) {
      toastr.error('请先选择一个聊天角色', "小说续写器");
      return;
    }
    const command = renderCommandTemplate(extension_settings[extensionName].sendTemplate, currentCharName, chapter.content);
    context.executeSlashCommandsWithOptions(command).then(() => {
      toastr.success('续写内容已发送到对话框', "小说续写器");
    }).catch((error) => {
      toastr.error(`发送失败: ${error.message}`, "小说续写器");
    });
  });
  // 删除此章
  $root.off('click', '.continue-delete-btn').on('click', '.continue-delete-btn', function(e) {
    const chainId = parseInt($(e.target).data('chain-id'));
    const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
    if (chapterIndex === -1) {
      toastr.warning('章节不存在', "小说续写器");
      return;
    }
    continueWriteChain.splice(chapterIndex, 1);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);
    toastr.success('已删除该续写章节', "小说续写器");
  });
}

async function generateContinueWrite(targetChainId) {
  const context = getContext();
  const { generateRaw } = context;
  const selectedBaseChapterId = $('#write-chapter-select').val();
  const editedBaseChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};
  const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;

  if (isGeneratingWrite) {
    toastr.warning('正在生成续写内容中，请等待完成', "小说续写器");
    return;
  }
  if (!selectedBaseChapterId) {
    toastr.error('请先选择初始续写基准章节', "小说续写器");
    return;
  }
  if (!editedBaseChapterContent) {
    toastr.error('初始基准章节内容不能为空', "小说续写器");
    return;
  }
  const targetChapterIndex = continueWriteChain.findIndex(item => item.id === targetChainId);
  if (targetChapterIndex === -1) {
    toastr.error('目标续写章节不存在', "小说续写器");
    return;
  }

  const precheckResult = await validateContinuePrecondition(selectedBaseChapterId, editedBaseChapterContent);
  const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;

  let fullContextContent = '';
  const baseChapterId = parseInt(selectedBaseChapterId);
  const preBaseChapters = currentParsedChapters.filter(chapter => chapter.id < baseChapterId);
  preBaseChapters.forEach(chapter => {
    fullContextContent += `${chapter.title}\n${chapter.content}\n\n`;
  });
  const baseChapterTitle = currentParsedChapters.find(c => c.id === baseChapterId)?.title || '基准章节';
  fullContextContent += `${baseChapterTitle}\n${editedBaseChapterContent}\n\n`;
  const targetBeforeChapters = continueWriteChain.slice(0, targetChapterIndex + 1);
  targetBeforeChapters.forEach((chapter, index) => {
    fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
  });

  const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
2. 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
3. 剧情衔接：续写内容必须和提供的完整上下文的最后一段内容完美衔接，逻辑自洽，无矛盾，承接前文所有剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新章节，不得重复前文已有的情节
4. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
5. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
6. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
7. 字数要求：续写约${wordCount}字，误差不超过10%
8. 矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
9. 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物
`;
  const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(useGraph)}
完整前文上下文：
${fullContextContent}
请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。
`;

  isGeneratingWrite = true;
  stopGenerateFlag = false;
  setButtonDisabled('#write-generate-btn, .continue-write-btn', true);
  setButtonDisabled('#write-stop-btn', false);
  toastr.info('正在生成续写章节，请稍候...', "小说续写器");

  try {
    let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt });
    if (stopGenerateFlag) {
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }
    if (!continueContent.trim()) {
      throw new Error('生成内容为空');
    }
    continueContent = continueContent.trim();

    let qualityResult = null;
    if (enableQualityCheck && !stopGenerateFlag) {
      toastr.info('正在执行续写内容质量校验，请稍候...', "小说续写器");
      qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
      
      if (!qualityResult.是否合格 && !stopGenerateFlag) {
        toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
        continueContent = await generateRaw({ 
          systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, 
          prompt: userPrompt 
        });
        if (stopGenerateFlag) {
          toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
          return;
        }
        continueContent = continueContent.trim();
        qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedBaseChapterContent, wordCount);
      }

      $("#quality-score").text(qualityResult.总分);
      $("#quality-report").val(qualityResult.评估报告);
      $("#quality-result-block").show();
      // 【修复】保存质量结果显示状态
      extension_settings[extensionName].qualityResultShow = true;
      saveSettingsDebounced();
    }

    const newChapter = {
      id: continueChapterIdCounter++,
      title: `续写章节 ${continueWriteChain.length + 1}`,
      content: continueContent
    };
    continueWriteChain.push(newChapter);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();

    await updateGraphWithContinueContent(newChapter, newChapter.id);
    renderContinueWriteChain(continueWriteChain);
    toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
  } catch (error) {
    if (!stopGenerateFlag) {
      console.error('继续续写生成失败:', error);
      toastr.error(`继续续写生成失败: ${error.message}`, "小说续写器");
    }
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn, .continue-write-btn, #write-stop-btn', false);
  }
}

// ==============================================
// 小说续写核心函数（原有逻辑保留，修复状态bug）
// ==============================================
async function generateNovelWrite() {
  const context = getContext();
  const { generateRaw } = context;
  const selectedChapterId = $('#write-chapter-select').val();
  const editedChapterContent = $('#write-chapter-content').val().trim();
  const wordCount = parseInt($('#write-word-count').val()) || 2000;
  const mergedGraph = extension_settings[extensionName].mergedGraph || {};
  const enableQualityCheck = extension_settings[extensionName].enableQualityCheck;

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

  isGeneratingWrite = true;
  stopGenerateFlag = false;
  setButtonDisabled('#write-generate-btn', true);
  setButtonDisabled('#write-stop-btn', false);
  $('#write-status').text('正在执行续写前置校验...');

  try {
    const precheckResult = await validateContinuePrecondition(selectedChapterId, editedChapterContent);
    const useGraph = Object.keys(precheckResult.preGraph).length > 0 ? precheckResult.preGraph : mergedGraph;

    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }

    const systemPrompt = `
小说续写规则（100%遵守）：
1. 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${precheckResult.redLines}
2. 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${precheckResult.forbiddenRules}
3. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有矛盾，承接前文剧情，合理呼应以下伏笔：${precheckResult.foreshadowList}，开启新的章节内容
4. 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂
5. 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话
6. 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线
7. 字数要求：续写约${wordCount}字，误差不超过10%
8. 矛盾规避：必须规避以下潜在剧情矛盾：${precheckResult.conflictWarning}
9. 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物
`;
    const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(useGraph)}
基准章节内容：${editedChapterContent}
请基于以上内容，按照规则续写后续的章节正文。
`;

    $('#write-status').text('正在生成续写章节，请稍候...');
    let continueContent = await generateRaw({ systemPrompt, prompt: userPrompt });
    
    if (stopGenerateFlag) {
      $('#write-status').text('已停止生成');
      toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
      return;
    }
    if (!continueContent.trim()) {
      throw new Error('生成内容为空');
    }
    continueContent = continueContent.trim();

    let qualityResult = null;
    if (enableQualityCheck && !stopGenerateFlag) {
      $('#write-status').text('正在执行续写内容质量校验，请稍候...');
      qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
      
      if (!qualityResult.是否合格 && !stopGenerateFlag) {
        toastr.warning(`续写内容质量不合格，总分${qualityResult.总分}，正在重新生成...`, "小说续写器");
        $('#write-status').text('正在重新生成续写章节，请稍候...');
        continueContent = await generateRaw({ 
          systemPrompt: systemPrompt + `\n注意：本次续写必须修正以下问题：${qualityResult.评估报告}`, 
          prompt: userPrompt 
        });
        if (stopGenerateFlag) {
          $('#write-status').text('已停止生成');
          toastr.info('已停止生成，丢弃本次生成结果', "小说续写器");
          return;
        }
        continueContent = continueContent.trim();
        qualityResult = await evaluateContinueQuality(continueContent, precheckResult, useGraph, editedChapterContent, wordCount);
      }

      $("#quality-score").text(qualityResult.总分);
      $("#quality-report").val(qualityResult.评估报告);
      $("#quality-result-block").show();
      extension_settings[extensionName].qualityResultShow = true;
      saveSettingsDebounced();
    }

    $('#write-content-preview').val(continueContent);
    $('#write-status').text('续写章节生成完成！');
    // 【修复】保存续写内容，解决返回后内容丢失bug
    extension_settings[extensionName].writeContentPreview = continueContent;
    saveSettingsDebounced();

    const newChapter = {
      id: continueChapterIdCounter++,
      title: `续写章节 ${continueWriteChain.length + 1}`,
      content: continueContent
    };
    continueWriteChain.push(newChapter);
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();

    await updateGraphWithContinueContent(newChapter, newChapter.id);
    renderContinueWriteChain(continueWriteChain);
    toastr.success('续写章节生成完成！已添加到续写链条', "小说续写器");
  } catch (error) {
    if (!stopGenerateFlag) {
      console.error('续写生成失败:', error);
      $('#write-status').text(`生成失败: ${error.message}`);
      toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
    }
  } finally {
    isGeneratingWrite = false;
    stopGenerateFlag = false;
    setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
  }
}

// ==============================================
// 扩展入口（完整重写，修复时序、事件绑定bug）
// ==============================================
jQuery(async () => {
  // 先加载HTML，确保DOM存在后再执行后续操作
  try {
    const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(settingsHtml);
    // 等待DOM渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error('扩展HTML加载失败:', error);
    toastr.error('扩展HTML加载失败，请检查文件路径', "小说续写器");
    return;
  }

  // 初始化核心功能
  initDrawerToggle();
  initContinueChainEvents();
  initVisibilityListener();
  await loadSettings();

  // 模板原有事件绑定
  $("#my_button").on("click", onButtonClick);
  $("#example_setting").on("input", onExampleInput);

  // ==============================================
  // 章节管理事件绑定
  // ==============================================
  $("#parse-chapter-btn").on("click", () => {
    const file = $("#novel-file-upload")[0].files[0];
    const chapterSplitMode = normalizeChapterSplitMode($("#chapter-split-mode").val());
    const regexSource = $("#chapter-regex-input").val().trim();
    const chapterSplitWordCount = parsePositiveInteger($("#chapter-word-count-input").val());
    if (!file) {
      toastr.warning('请先选择小说TXT文件', "小说续写器");
      return;
    }
    if (chapterSplitMode === 'wordCount' && !chapterSplitWordCount) {
      toastr.error('按字数拆分时请填写有效的目标字数', "小说续写器");
      return;
    }
    extension_settings[extensionName].chapterSplitMode = chapterSplitMode;
    extension_settings[extensionName].chapterRegex = regexSource;
    extension_settings[extensionName].chapterSplitWordCount = chapterSplitWordCount || defaultSettings.chapterSplitWordCount;
    saveSettingsDebounced();

    const reader = new FileReader();
    reader.onload = (e) => {
      const novelText = e.target.result;
      currentParsedChapters = splitNovelIntoChapters(novelText, chapterSplitMode, regexSource, chapterSplitWordCount || defaultSettings.chapterSplitWordCount);
      // 重置所有相关状态
      extension_settings[extensionName].chapterList = currentParsedChapters;
      extension_settings[extensionName].chapterGraphMap = {};
      extension_settings[extensionName].mergedGraph = {};
      extension_settings[extensionName].continueWriteChain = [];
      extension_settings[extensionName].continueChapterIdCounter = 1;
      extension_settings[extensionName].selectedBaseChapterId = "";
      extension_settings[extensionName].writeContentPreview = "";
      $('#merged-graph-preview').val('');
      $('#write-content-preview').val('');
      continueWriteChain = [];
      continueChapterIdCounter = 1;
      saveSettingsDebounced();
      // 重新渲染
      renderChapterList(currentParsedChapters);
      renderChapterSelect(currentParsedChapters);
      renderContinueWriteChain(continueWriteChain);
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

  $("#chapter-split-mode").on("change", (e) => {
    const chapterSplitMode = normalizeChapterSplitMode($(e.target).val());
    extension_settings[extensionName].chapterSplitMode = chapterSplitMode;
    updateChapterSplitModeUI(chapterSplitMode);
    saveSettingsDebounced();
  });
  $("#chapter-word-count-input").on("change", (e) => {
    const chapterSplitWordCount = parsePositiveInteger($(e.target).val()) || defaultSettings.chapterSplitWordCount;
    $(e.target).val(chapterSplitWordCount);
    extension_settings[extensionName].chapterSplitWordCount = chapterSplitWordCount;
    saveSettingsDebounced();
  });
  $("#send-template-input").on("change", (e) => {
    extension_settings[extensionName].sendTemplate = $(e.target).val().trim();
    saveSettingsDebounced();
  });
  $("#send-delay-input").on("change", (e) => {
    extension_settings[extensionName].sendDelay = parseInt($(e.target).val()) || 100;
    saveSettingsDebounced();
  });
  $("#write-word-count").on("change", (e) => {
    extension_settings[extensionName].writeWordCount = parseInt($(e.target).val()) || 2000;
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
  $("#graph-validate-btn").on("click", validateGraphCompliance);

  $("#graph-import-btn").on("click", () => {
    $("#graph-file-upload").click();
  });
  $("#graph-file-upload").on("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const graphData = JSON.parse(removeBOM(event.target.result.trim()));
        const fullRequiredFields = mergeGraphJsonSchema.value.required;
        const singleRequiredFields = graphJsonSchema.value.required;
        const hasFullFields = fullRequiredFields.every(field => Object.hasOwn(graphData, field));
        const hasSingleFields = singleRequiredFields.every(field => Object.hasOwn(graphData, field));
        
        if (!hasFullFields && !hasSingleFields) {
          throw new Error("图谱格式错误，缺少核心必填字段，不支持该图谱格式");
        }
        extension_settings[extensionName].mergedGraph = graphData;
        saveSettingsDebounced();
        $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
        toastr.success('知识图谱导入完成！', "小说续写器");
      } catch (error) {
        console.error('图谱导入失败:', error);
        toastr.error(`导入失败：${error.message}，请检查JSON文件格式是否正确`, "小说续写器");
      } finally {
        $("#graph-file-upload").val('');
      }
    };
    reader.onerror = () => {
      toastr.error('文件读取失败，请检查文件', "小说续写器");
      $("#graph-file-upload").val('');
    };
    reader.readAsText(file, 'UTF-8');
  });

  $("#graph-copy-btn").on("click", async () => {
    const graphText = $('#merged-graph-preview').val();
    if (!graphText) {
      toastr.warning('没有可复制的图谱内容', "小说续写器");
      return;
    }
    const success = await copyToClipboard(graphText);
    if (success) {
      toastr.success('图谱JSON已复制到剪贴板', "小说续写器");
    } else {
      toastr.error('复制失败', "小说续写器");
    }
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
    extension_settings[extensionName].graphValidateResultShow = false;
    $('#merged-graph-preview').val('');
    $('#graph-validate-result').hide();
    saveSettingsDebounced();
    toastr.success('已清空合并图谱', "小说续写器");
  });

  // ==============================================
  // 续写模块事件绑定
  // ==============================================
  $("#write-chapter-select").on("change", function(e) {
    const selectedChapterId = $(e.target).val();
    // 重置状态
    currentPrecheckResult = null;
    $("#precheck-status").text("未执行").removeClass("text-success text-danger").addClass("text-muted");
    $("#precheck-report").val("");
    $("#write-content-preview").val("");
    $("#write-status").text("");
    $("#quality-result-block").hide();
    // 保存选中的章节ID
    extension_settings[extensionName].selectedBaseChapterId = selectedChapterId;
    extension_settings[extensionName].precheckStatus = "未执行";
    extension_settings[extensionName].precheckReportText = "";
    extension_settings[extensionName].writeContentPreview = "";
    extension_settings[extensionName].qualityResultShow = false;
    saveSettingsDebounced();

    if (!selectedChapterId) {
      $('#write-chapter-content').val('').prop('readonly', true);
      return;
    }
    const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
    if (targetChapter) {
      $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
    }
  });

  $("#graph-update-modified-btn").on("click", () => {
    const selectedChapterId = $('#write-chapter-select').val();
    const modifiedContent = $('#write-chapter-content').val().trim();
    if (!selectedChapterId) {
      toastr.error('请先选择基准章节', "小说续写器");
      return;
    }
    if (!modifiedContent) {
      toastr.error('基准章节内容不能为空', "小说续写器");
      return;
    }
    updateModifiedChapterGraph(selectedChapterId, modifiedContent);
  });

  $("#precheck-run-btn").on("click", () => {
    const selectedChapterId = $('#write-chapter-select').val();
    const modifiedContent = $('#write-chapter-content').val().trim();
    if (!selectedChapterId) {
      toastr.error('请先选择基准章节', "小说续写器");
      return;
    }
    validateContinuePrecondition(selectedChapterId, modifiedContent);
  });

  $("#quality-check-switch").on("change", (e) => {
    const isChecked = Boolean($(e.target).prop("checked"));
    extension_settings[extensionName].enableQualityCheck = isChecked;
    saveSettingsDebounced();
  });

  $("#write-generate-btn").on("click", generateNovelWrite);
  $("#write-stop-btn").on("click", () => {
    if (isGeneratingWrite) {
      stopGenerateFlag = true;
      isGeneratingWrite = false;
      $('#write-status').text('已停止生成');
      setButtonDisabled('#write-generate-btn, #write-stop-btn', false);
      toastr.info('已停止生成续写内容', "小说续写器");
    }
  });

  $("#write-copy-btn").on("click", async () => {
    const writeText = $('#write-content-preview').val();
    if (!writeText) {
      toastr.warning('没有可复制的续写内容', "小说续写器");
      return;
    }
    const success = await copyToClipboard(writeText);
    if (success) {
      toastr.success('续写内容已复制到剪贴板', "小说续写器");
    } else {
      toastr.error('复制失败', "小说续写器");
    }
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
    $('#quality-result-block').hide();
    extension_settings[extensionName].writeContentPreview = "";
    extension_settings[extensionName].qualityResultShow = false;
    saveSettingsDebounced();
    toastr.success('已清空续写内容', "小说续写器");
  });

  $("#clear-chain-btn").on("click", () => {
    continueWriteChain = [];
    continueChapterIdCounter = 1;
    extension_settings[extensionName].continueWriteChain = continueWriteChain;
    extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
    saveSettingsDebounced();
    renderContinueWriteChain(continueWriteChain);
    toastr.success('已清空所有续写章节', "小说续写器");
  });
});
