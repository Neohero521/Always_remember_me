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

// 默认配置（全规则字段覆盖）
const defaultSettings = {
    chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
    sendTemplate: "/sendas name={{char}} {{pipe}}",
    sendDelay: 100,
    example_setting: false,
    chapterList: [],
    chapterGraphMap: {},
    mergedGraph: {},
    continueWriteChain: [],
    continueChapterIdCounter: 1,
    lastValidationReport: {},
    lastValidatedChapterId: null,
    lastWriteQuality: {},
};

// 全局状态缓存
let currentParsedChapters = [];
let isGeneratingGraph = false;
let isGeneratingWrite = false;
let isRunningValidation = false;
let stopGenerateFlag = false;
let isSending = false;
let stopSending = false;
let continueWriteChain = [];
let continueChapterIdCounter = 1;

// ==============================================
// 规则核心：Schema定义（100%匹配规则必填字段，零修改零遗漏）
// ==============================================

// 单章节知识图谱Schema（严格匹配规则单章节分析8大必填模块）
const graphJsonSchema = {
    name: 'NovelChapterKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": [
            "基础章节信息",
            "人物信息",
            "世界观设定",
            "核心剧情线",
            "文风特点",
            "实体关系网络",
            "变更与依赖信息",
            "逆向分析洞察"
        ],
        "properties": {
            "基础章节信息": {
                "type": "object",
                "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
                "properties": {
                    "章节号": { "type": "number" },
                    "章节版本号": { "type": "string" },
                    "章节节点唯一标识": { "type": "string" },
                    "本章字数": { "type": "number" },
                    "叙事时间线节点": { "type": "string" }
                }
            },
            "人物信息": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "唯一人物ID",
                        "姓名",
                        "别名/称号",
                        "本章更新的性格特征",
                        "本章更新的身份/背景",
                        "本章核心行为与动机",
                        "本章人物关系变更",
                        "本章人物弧光变化"
                    ],
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
                                "required": ["关系对象", "关系类型", "关系强度", "关系描述", "对应原文位置"],
                                "properties": {
                                    "关系对象": { "type": "string" },
                                    "关系类型": { "type": "string" },
                                    "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
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
                "required": [
                    "本章新增/变更的时代背景",
                    "本章新增/变更的地理区域",
                    "本章新增/变更的力量体系/规则",
                    "本章新增/变更的社会结构",
                    "本章新增/变更的独特物品/生物",
                    "本章新增的隐藏设定/伏笔",
                    "对应原文位置"
                ],
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
                "required": [
                    "本章主线剧情描述",
                    "本章关键事件列表",
                    "本章支线剧情",
                    "本章核心冲突进展",
                    "本章未回收伏笔"
                ],
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
                "required": ["叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],
                "properties": {
                    "叙事视角": { "type": "string" },
                    "语言风格": { "type": "string" },
                    "对话特点": { "type": "string" },
                    "常用修辞": { "type": "string" },
                    "节奏特点": { "type": "string" },
                    "与全文文风的匹配度说明": { "type": "string" }
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
            "变更与依赖信息": {
                "type": "object",
                "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
                "properties": {
                    "本章对全局图谱的变更项": { "type": "string" },
                    "本章剧情依赖的前置章节": { "type": "array", "items": { "type": "number" } },
                    "本章内容对后续剧情的影响预判": { "type": "string" },
                    "本章内容与前文的潜在冲突预警": { "type": "string" }
                }
            },
            "逆向分析洞察": {
                "type": "string",
                "description": "基于本章内容推断的隐藏信息、人物潜在真实意图、未明说的规则、伏笔暗示、前后文一致性校验结果"
            }
        }
    }
};

// 全量合并知识图谱Schema（严格匹配规则全量图谱8大必填模块）
const mergeGraphJsonSchema = {
    name: 'MergedNovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": [
            "全局基础信息",
            "人物信息库",
            "世界观设定库",
            "全剧情时间线",
            "全局文风标准",
            "全量实体关系网络",
            "反向依赖图谱",
            "逆向分析与质量评估"
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
                    "required": [
                        "唯一人物ID",
                        "姓名",
                        "所有别名/称号",
                        "全本最终性格特征",
                        "完整身份/背景",
                        "全本核心动机",
                        "全时间线人物关系网",
                        "完整人物弧光",
                        "人物关键事件时间线"
                    ],
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
                                    "对应章节": { "type": "array", "items": { "type": "number" } }
                                }
                            }
                        },
                        "完整人物弧光": { "type": "string" },
                        "人物关键事件时间线": { "type": "array", "items": { "type": "object" } }
                    }
                }
            },
            "世界观设定库": {
                "type": "object",
                "required": [
                    "时代背景",
                    "核心地理区域与地图",
                    "完整力量体系/规则",
                    "社会结构",
                    "核心独特物品/生物",
                    "全本所有隐藏设定/伏笔汇总",
                    "设定变更历史记录"
                ],
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
                                "出现章节": { "type": "number" },
                                "当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "部分回收"] },
                                "预判回收节点": { "type": "string" }
                            }
                        }
                    },
                    "设定变更历史记录": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["变更章节", "变更内容", "生效范围", "变更时间"],
                            "properties": {
                                "变更章节": { "type": "number" },
                                "变更内容": { "type": "string" },
                                "生效范围": { "type": "string" },
                                "变更时间": { "type": "string" }
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
                            "required": ["事件ID", "事件名", "参与人物", "发生章节", "前因", "后果", "对主线的影响"],
                            "properties": {
                                "事件ID": { "type": "string" },
                                "事件名": { "type": "string" },
                                "参与人物": { "type": "string" },
                                "发生章节": { "type": "number" },
                                "前因": { "type": "string" },
                                "后果": { "type": "string" },
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
                "type": "array",
                "minItems": 20,
                "items": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 3,
                    "items": { "type": "string" }
                }
            },
            "反向依赖图谱": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["章节节点", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],
                    "properties": {
                        "章节节点": { "type": "number" },
                        "生效人设状态": { "type": "string" },
                        "生效设定状态": { "type": "string" },
                        "生效剧情状态": { "type": "string" },
                        "依赖的前置节点": { "type": "array", "items": { "type": "number" } }
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

// 前置校验报告Schema（严格匹配规则逆向分析要求）
const validationSchema = {
    name: 'NovelWritePreValidation',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": [
            "基准节点信息",
            "生效人设状态",
            "生效设定状态",
            "生效剧情状态",
            "续写绝对红线",
            "可呼应伏笔清单",
            "潜在矛盾预警与采信标准",
            "可推进剧情方向",
            "文风匹配标准",
            "小数据场景适配规则"
        ],
        "properties": {
            "基准节点信息": {
                "type": "object",
                "required": ["章节号", "章节标题", "叙事时间线节点", "章节版本号"],
                "properties": {
                    "章节号": { "type": "number" },
                    "章节标题": { "type": "string" },
                    "叙事时间线节点": { "type": "string" },
                    "章节版本号": { "type": "string" }
                }
            },
            "生效人设状态": { "type": "string" },
            "生效设定状态": { "type": "string" },
            "生效剧情状态": { "type": "string" },
            "续写绝对红线": {
                "type": "object",
                "required": ["人设红线", "设定禁区", "剧情逻辑底线"],
                "properties": {
                    "人设红线": { "type": "string" },
                    "设定禁区": { "type": "string" },
                    "剧情逻辑底线": { "type": "string" }
                }
            },
            "可呼应伏笔清单": { "type": "array", "items": { "type": "object" } },
            "潜在矛盾预警与采信标准": { "type": "string" },
            "可推进剧情方向": { "type": "array", "items": { "type": "string" } },
            "文风匹配标准": { "type": "string" },
            "小数据场景适配规则": { "type": "string" }
        }
    }
};

// 续写质量评估Schema（严格匹配规则5维度评估体系）
const qualityEvaluationSchema = {
    name: 'NovelWriteQualityEvaluation',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": [
            "人设一致性得分",
            "设定合规性得分",
            "剧情衔接度得分",
            "文风匹配度得分",
            "内容质量得分",
            "总分",
            "是否合格",
            "问题明细",
            "修正建议"
        ],
        "properties": {
            "人设一致性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "设定合规性得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "剧情衔接度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "文风匹配度得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "内容质量得分": { "type": "number", "minimum": 0, "maximum": 100 },
            "总分": { "type": "number", "minimum": 0, "maximum": 100 },
            "是否合格": { "type": "boolean" },
            "问题明细": { "type": "string" },
            "修正建议": { "type": "string" }
        }
    }
};

// ==============================================
// 基础工具函数（规则约束落地辅助）
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
    continueWriteChain = extension_settings[extensionName].continueWriteChain || [];
    continueChapterIdCounter = extension_settings[extensionName].continueChapterIdCounter || 1;
    const lastValidatedChapterId = extension_settings[extensionName].lastValidatedChapterId;

    // 更新UI中的设置值
    $("#example_setting").prop("checked", extension_settings[extensionName].example_setting).trigger("input");
    $("#chapter-regex-input").val(extension_settings[extensionName].chapterRegex);
    $("#send-template-input").val(extension_settings[extensionName].sendTemplate);
    $("#send-delay-input").val(extension_settings[extensionName].sendDelay);
    $("#merged-graph-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph, null, 2));
    $("#graph-dependency-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph?.反向依赖图谱 || [], null, 2));
    $("#graph-history-preview").val(JSON.stringify(extension_settings[extensionName].mergedGraph?.世界观设定库?.设定变更历史记录 || [], null, 2));
    $("#validation-report").val(JSON.stringify(extension_settings[extensionName].lastValidationReport, null, 2));
    // 修复：添加默认值，避免字段缺失导致空白
    $("#validation-redline").val(JSON.stringify(extension_settings[extensionName].lastValidationReport?.续写绝对红线 || {}, null, 2));
    $("#validation-foreshadow").val(JSON.stringify(extension_settings[extensionName].lastValidationReport?.可呼应伏笔清单 || [], null, 2));
    $("#write-quality-report").val(JSON.stringify(extension_settings[extensionName].lastWriteQuality, null, 2));

    // 渲染UI
    renderChapterList(currentParsedChapters);
    renderChapterSelect(currentParsedChapters);
    renderValidateChapterSelect(currentParsedChapters);
    renderContinueWriteChain(continueWriteChain);

    // 生成按钮状态控制（硬锁：未校验禁用）
    updateWriteButtonStatus(lastValidatedChapterId);
}

// 小数据场景判断（规则专项适配）
function isSmallDataScene() {
    return currentParsedChapters.length < 3;
}

// 生成按钮状态更新（规则硬锁：未校验不可生成）
function updateWriteButtonStatus(validatedChapterId) {
    const selectedChapterId = $('#write-chapter-select').val();
    const isValidationMatch = validatedChapterId && selectedChapterId && validatedChapterId == selectedChapterId;
    if (isValidationMatch) {
        $('#write-generate-btn').prop('disabled', false).removeAttr('title');
    } else {
        $('#write-generate-btn').prop('disabled', true).attr('title', '请先执行对应章节的前置校验，校验通过后方可生成续写');
    }
}

// 模板示例功能保留
function onExampleInput(event) {
    const value = Boolean($(event.target).prop("checked"));
    extension_settings[extensionName].example_setting = value;
    saveSettingsDebounced();
}

function onButtonClick() {
    toastr.info(
        `The checkbox is ${extension_settings[extensionName].example_setting ? "checked" : "not checked"}`,
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

// 续写内容后处理（规则强制：只保留纯正文，去除所有多余内容）
function cleanWriteContent(content) {
    return content
        .replace(/^#.*$/gm, '')           // 去除所有标题
        .replace(/```[\s\S]*?```/g, '')   // 去除代码块
        .replace(/^\s*【.*?】\s*$/gm, '') // 去除注释标记
        .replace(/^\s*注：.*$/gm, '')     // 去除备注
        .replace(/^\s*作者：.*$/gm, '')   // 去除作者信息
        .replace(/^\s*---*\s*$/gm, '')    // 去除分割线
        .trim();
}

// ==============================================
// 章节管理核心函数
// ==============================================

// 章节拆分逻辑（规则版本号适配）
function splitNovelIntoChapters(novelText, regexSource) {
    try {
        const chapterRegex = new RegExp(regexSource, 'gm');
        const matches = [...novelText.matchAll(chapterRegex)];
        const chapters = [];
        if (matches.length === 0) {
            return [{ id: 0, title: '全文', content: novelText, hasGraph: false, version: '1.0' }];
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
                    hasGraph: false,
                    version: '1.0'
                });
            }
        }
        toastr.success(`解析完成，共找到 ${chapters.length} 个章节`, "小说续写器");
        // 小数据场景提示
        if (isSmallDataScene()) {
            toastr.info("检测到章节不足3章，已自动启用小数据场景专项适配规则", "小说续写器");
        }
        return chapters;
    } catch (error) {
        console.error('章节拆分失败:', error);
        toastr.error('章节正则表达式格式错误，请检查', "小说续写器");
        return [];
    }
}

// 刷新图谱状态：根据graphMap重新设置每个章节的hasGraph并重新渲染
function refreshGraphStatus() {
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    currentParsedChapters.forEach(chapter => {
        chapter.hasGraph = !!graphMap[chapter.id];
    });
    renderChapterList(currentParsedChapters);
    toastr.success('图谱状态已刷新', "小说续写器");
}

// 章节列表渲染
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

    // 显示标题、选择框、图谱状态
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

// 渲染续写模块的章节选择下拉框
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
    // 更新按钮状态
    updateWriteButtonStatus(extension_settings[extensionName].lastValidatedChapterId);
}

// 渲染前置校验模块的章节选择下拉框
function renderValidateChapterSelect(chapters) {
    const $select = $('#validate-chapter-select');
    if (chapters.length === 0) {
        $select.html('<option value="">请先解析章节</option>');
        return;
    }
    const optionHtml = chapters.map(chapter => `
        <option value="${chapter.id}">${chapter.title}</option>
    `).join('');
    $select.html(`<option value="">请选择续写基准节点</option>${optionHtml}`);
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
// 规则核心：知识图谱核心函数（100%落地规则约束）
// ==============================================

// 生成单章节知识图谱（严格匹配规则单章节分析要求）
async function generateSingleChapterGraph(chapter) {
    const context = getContext();
    const { generateRaw } = context;
    const isSmallData = isSmallDataScene();

    const systemPrompt = `
触发词：构建单章节知识图谱JSON、小说单章节解析

强制约束（100%遵守，违反则输出完全无效）：
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须严格以 { 开头、以 } 结尾，哪怕有一个多余字符都视为无效。
2. 所有内容必须100%基于提供的小说章节文本，绝对不能引入任何文本中不存在的外部人物、设定、概念、剧情元素，绝对不能使用任何外部知识库内容。
3. 必须严格保留所有要求的字段，不能缺失、不能修改字段名；无对应内容时，字符串字段必须设为"暂无"，数组字段必须设为[]，绝对不能留空或删除字段。
4. 必须实现全链路双向可追溯，所有人设、设定、事件、伏笔信息，必须100%关联对应的原文位置（格式：原文第X段，内容：XXX），禁止任何无来源的信息录入。
5. 必须保证语义与结构一致性，同一个人物、设定、事件不能重复出现，同一人物的不同别名/称号必须合并为同一个唯一实体条目，绝对不能重复创建。
6. 实体关系网络必须生成不少于5条三元组，格式为(头实体, 关系, 尾实体)，覆盖人物、设定、事件、地点等维度。
${isSmallData ? `7. 小数据场景专项约束：深度挖掘有限文本中的隐性信息，包括人物口头禅、习惯性动作、潜在性格特质、隐藏的关系暗示、文风细节特征，禁止遗漏任何隐性信息。` : ''}

必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察
`;

    const userPrompt = `小说章节ID：${chapter.id}\n小说章节标题：${chapter.title}\n章节版本号：${chapter.version}\n小说章节内容：${chapter.content}`;

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
                // 已有图谱，跳过生成但计数成功（保留旧图谱）
                successCount++;
                continue;
            }

            const graphData = await generateSingleChapterGraph(chapter);
            if (graphData) {
                graphMap[chapter.id] = graphData;
                // 更新章节的hasGraph状态（用于实时渲染）
                const foundChapter = currentParsedChapters.find(item => item.id === chapter.id);
                if (foundChapter) foundChapter.hasGraph = true;
                successCount++;
            }
            // 如果graphData为null，失败，不修改graphMap和hasGraph

            if (i < chapters.length - 1 && !stopGenerateFlag) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        extension_settings[extensionName].chapterGraphMap = graphMap;
        extension_settings[extensionName].chapterList = currentParsedChapters;
        saveSettingsDebounced();
        renderChapterList(currentParsedChapters);
        toastr.success(`图谱生成完成！成功生成 ${successCount}/${chapters.length} 个章节图谱`, "小说续写器");
        if (successCount < chapters.length) {
            toastr.warning(`有 ${chapters.length - successCount} 个章节生成失败，请检查错误提示`, "小说续写器");
        }
    } catch (error) {
        console.error('批量生成图谱失败:', error);
        toastr.error(`图谱生成失败: ${error.message}`, "小说续写器");
    } finally {
        isGeneratingGraph = false;
        stopGenerateFlag = false;
        updateProgress('graph-progress', 'graph-generate-status', 0, 0);
    }
}

// 合并多章节知识图谱（严格匹配规则全量图谱要求）
async function mergeAllGraphs() {
    const context = getContext();
    const { generateRaw } = context;
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    const graphList = Object.values(graphMap);
    const isSmallData = isSmallDataScene();

    if (graphList.length === 0) {
        toastr.warning('没有可合并的章节图谱，请先生成图谱', "小说续写器");
        return;
    }

    const systemPrompt = `
触发词：合并全量知识图谱JSON、小说全局图谱构建

强制约束（100%遵守，违反则输出完全无效）：
1. 输出必须为纯JSON格式，绝对不能包含任何前置文本、后置说明、注释、markdown代码块、换行符以外的多余内容，必须严格以 { 开头、以 } 结尾，哪怕有一个多余字符都视为无效。
2. 所有内容必须100%基于提供的多组章节图谱合并，绝对不能引入任何外部人物、设定、概念、剧情元素，绝对不能使用任何外部知识库内容。
3. 必须严格去重：同一人物的不同别名/称号必须合并为同一个唯一实体条目，绝对不能重复创建人物；同一设定出现多次的，必须以最新章节的内容为最终生效版本，同时完整保留所有历史变更记录，包括变更章节、变更内容、生效范围、变更时间。
4. 必须严格保留所有要求的字段，不能缺失、不能修改字段名；无对应内容时，字符串字段必须设为"暂无"，数组字段必须设为[]，绝对不能留空或删除字段。
5. 必须构建完整的反向依赖图谱，以每个章节节点为核心，标注该节点生效的人设、设定、剧情状态，以及依赖的前置节点，用于任意章节续写的前置信息提取。
6. 全量实体关系网络必须生成不少于20条三元组，按人物、设定、事件、地点分类，覆盖全本核心关联关系。
${isSmallData ? `7. 小数据场景专项约束：基于有限文本做结构化信息增强，完整挖掘所有隐性信息，明确全局约束边界，禁止无限制新增设定、人物。` : ''}

必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估
`;

    const userPrompt = `小说总章节数：${currentParsedChapters.length}\n待合并的多组章节知识图谱：\n${JSON.stringify(graphList, null, 2)}`;

    try {
        toastr.info('开始合并知识图谱，请稍候...', "小说续写器");
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: mergeGraphJsonSchema });
        const mergedGraph = JSON.parse(result.trim());

        // 保存合并图谱
        extension_settings[extensionName].mergedGraph = mergedGraph;
        saveSettingsDebounced();

        // 更新UI
        $('#merged-graph-preview').val(JSON.stringify(mergedGraph, null, 2));
        $('#graph-dependency-preview').val(JSON.stringify(mergedGraph.反向依赖图谱, null, 2));
        $('#graph-history-preview').val(JSON.stringify(mergedGraph.世界观设定库?.设定变更历史记录 || [], null, 2));

        toastr.success('知识图谱合并完成！反向依赖图谱与设定变更记录已同步生成', "小说续写器");
        return mergedGraph;
    } catch (error) {
        console.error('图谱合并失败:', error);
        toastr.error(`图谱合并失败: ${error.message}`, "小说续写器");
        return null;
    }
}

// ==============================================
// 规则核心：续写节点逆向分析与前置校验（硬锁不可跳过）
// ==============================================

async function runPreWriteValidation(baseChapterId) {
    const context = getContext();
    const { generateRaw } = context;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const baseChapter = currentParsedChapters.find(item => item.id == baseChapterId);
    const isSmallData = isSmallDataScene();

    // 前置校验
    if (isRunningValidation) {
        toastr.warning('正在执行前置校验中，请等待完成', "小说续写器");
        return null;
    }
    if (Object.keys(mergedGraph).length === 0) {
        toastr.error('请先合并全量知识图谱，再执行前置校验', "小说续写器");
        return null;
    }
    if (!baseChapter) {
        toastr.error('基准章节不存在', "小说续写器");
        return null;
    }

    isRunningValidation = true;
    stopGenerateFlag = false;
    $('#validation-status').text('正在执行续写节点逆向分析与前置校验，请稍候...');
    updateProgress('validation-progress', 'validation-status', 1, 1, "校验进度");

    try {
        const systemPrompt = `
触发词：续写节点逆向分析与前置校验、续写合规边界生成

强制约束（100%遵守，违反则输出完全无效）：
1. 所有分析内容只能来自续写节点（章节号${baseChapterId}）之前的所有文本内容与全量知识图谱，绝对不能引入、提及、暗示续写节点之后的任何剧情、设定、人物变化，绝对不能提前剧透后续内容，哪怕合并图谱里有后续内容也绝对不能使用。
2. 必须以续写节点为终点，提取该节点时间线之前最终生效的人设、设定、剧情状态，若前文有设定冲突，必须以续写节点前最后一次出现的内容为准，同时明确标注冲突预警与采信标准。
3. 必须明确续写的合规边界，输出续写绝对不能违反的人设红线、设定禁区、剧情逻辑底线，绝对不能模糊，必须清晰可执行。
4. 所有内容必须100%基于提供的全量知识图谱与原文内容，绝对不能引入任何外部信息、主观新增设定。
5. 必须严格保留所有要求的字段，不能缺失、不能修改字段名；无对应内容时，字符串字段必须设为"暂无"，数组字段必须设为[]，绝对不能留空或删除字段。
${isSmallData ? `6. 小数据场景专项约束：深度挖掘有限文本中的隐性约束，明确续写的核心边界，禁止无限制新增设定、人物，保证续写与现有文本高度贴合，严格遵循现有文本的叙事范式。` : ''}

必填字段：基准节点信息、生效人设状态、生效设定状态、生效剧情状态、续写绝对红线、可呼应伏笔清单、潜在矛盾预警与采信标准、可推进剧情方向、文风匹配标准、小数据场景适配规则
`;

        const userPrompt = `全量知识图谱：${JSON.stringify(mergedGraph, null, 2)}\n续写基准章节ID：${baseChapterId}\n基准章节完整内容：${baseChapter.content}\n基准章节版本号：${baseChapter.version}`;

        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: validationSchema });
        const validationReport = JSON.parse(result.trim());

        // 检查并补全可能缺失的字段（确保UI不为空）
        if (!validationReport.续写绝对红线) {
            validationReport.续写绝对红线 = { 人设红线: "暂无", 设定禁区: "暂无", 剧情逻辑底线: "暂无" };
            toastr.warning("模型返回的校验报告中缺少「续写绝对红线」，已自动填充为「暂无」", "小说续写器");
        }
        if (!validationReport.可呼应伏笔清单) {
            validationReport.可呼应伏笔清单 = [];
            toastr.warning("模型返回的校验报告中缺少「可呼应伏笔清单」，已自动填充为空数组", "小说续写器");
        }

        // 保存校验报告与校验过的章节ID
        extension_settings[extensionName].lastValidationReport = validationReport;
        extension_settings[extensionName].lastValidatedChapterId = baseChapterId;
        saveSettingsDebounced();

        // 更新UI（添加默认值防止字段缺失）
        $('#validation-report').val(JSON.stringify(validationReport, null, 2));
        $('#validation-redline').val(JSON.stringify(validationReport.续写绝对红线 || {}, null, 2));
        $('#validation-foreshadow').val(JSON.stringify(validationReport.可呼应伏笔清单 || [], null, 2));
        $('#validation-status').text('前置校验完成！已生成续写合规边界，可开始续写');
        updateProgress('validation-progress', 'validation-status', 0, 0);

        // 同步续写模块的基准章节选择
        $('#write-chapter-select').val(baseChapterId).trigger('change');
        // 更新生成按钮状态
        updateWriteButtonStatus(baseChapterId);

        toastr.success('续写节点前置校验完成！已明确续写合规边界与红线规则', "小说续写器");
        return validationReport;
    } catch (error) {
        console.error('前置校验失败:', error);
        $('#validation-status').text(`前置校验失败: ${error.message}`);
        updateProgress('validation-progress', 'validation-status', 0, 0);
        toastr.error(`前置校验失败: ${error.message}`, "小说续写器");
        return null;
    } finally {
        isRunningValidation = false;
        stopGenerateFlag = false;
    }
}

// ==============================================
// 规则核心：续写质量评估与闭环优化
// ==============================================

async function evaluateWriteQuality(writeContent, baseChapterId, validationReport, mergedGraph, writeScene, targetWordCount) {
    const context = getContext();
    const { generateRaw } = context;
    const actualWordCount = writeContent.length;
    const wordErrorRate = Math.abs((actualWordCount - targetWordCount) / targetWordCount) * 100;

    const systemPrompt = `
触发词：小说续写质量评估、续写合规性校验

强制约束（100%遵守，违反则输出完全无效）：
1. 评估只能基于提供的全量知识图谱、前置校验报告、基准章节内容、续写内容，绝对不能引入任何外部标准。
2. 严格按照5个维度执行评估，每个维度满分100分，**单项得分不得低于80分，总分不得低于85分**，只要有一个单项低于80分，或总分低于85分，必须判定为不合格。
3. 字数强制校验：续写内容字数误差超过±10%的，内容质量得分直接记0分，整体判定为不合格。
4. 出现严重人设崩塌(OOC)、设定吃书、剧情前后矛盾的，直接判定为不合格，所有单项得分不得超过60分。
5. 必须如实标注续写内容存在的所有问题，给出针对性的、可执行的修正建议，绝对不能模糊敷衍。
6. 必须严格保留所有要求的字段，不能缺失、不能修改字段名。

评估维度：
1. 人设一致性：校验续写内容中人物的言行、性格、动机是否符合人设设定，有无OOC问题，是否违反人设红线
2. 设定合规性：校验续写内容是否符合世界观设定，有无吃书、新增违规设定、违反原有规则、触碰设定禁区的问题
3. 剧情衔接度：校验续写内容与前文的衔接是否自然，逻辑是否自洽，有无剧情断层、前后矛盾、违反剧情逻辑底线的问题，是否符合${writeScene}场景的衔接要求
4. 文风匹配度：校验续写内容的叙事视角、语言风格、对话模式、节奏规律是否与原文一致，有无风格割裂
5. 内容质量：校验续写内容是否有完整的情节、生动的细节、符合逻辑的对话，有无无意义水内容、剧情拖沓、逻辑混乱的问题，字数是否符合要求

本次校验基础数据：
- 目标字数：${targetWordCount}字
- 实际字数：${actualWordCount}字
- 字数误差率：${wordErrorRate.toFixed(2)}%
- 续写场景：${writeScene}

必填字段：人设一致性得分、设定合规性得分、剧情衔接度得分、文风匹配度得分、内容质量得分、总分、是否合格、问题明细、修正建议
`;

    const userPrompt = `
全量知识图谱：${JSON.stringify(mergedGraph)}
前置校验合规边界报告：${JSON.stringify(validationReport)}
基准章节ID：${baseChapterId}
续写内容：${writeContent}
`;

    try {
        const result = await generateRaw({ systemPrompt, prompt: userPrompt, jsonSchema: qualityEvaluationSchema });
        const qualityReport = JSON.parse(result.trim());
        return qualityReport;
    } catch (error) {
        console.error('质量评估失败:', error);
        toastr.error(`质量评估失败: ${error.message}`, "小说续写器");
        return null;
    }
}

// 续写内容自动同步到知识图谱（规则闭环要求）
async function saveWriteContentToGraph(writeContent, chainId) {
    const targetChapter = continueWriteChain.find(item => item.id == chainId);
    if (!targetChapter) {
        toastr.error('目标续写章节不存在', "小说续写器");
        return false;
    }

    // 构建虚拟章节
    const virtualChapter = {
        id: `continue-${chainId}`,
        title: targetChapter.title,
        content: targetChapter.content,
        version: '1.0'
    };

    // 生成单章节图谱
    const chapterGraph = await generateSingleChapterGraph(virtualChapter);
    if (!chapterGraph) {
        toastr.error('续写章节图谱生成失败', "小说续写器");
        return false;
    }

    // 更新到章节图谱Map
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    graphMap[virtualChapter.id] = chapterGraph;
    extension_settings[extensionName].chapterGraphMap = graphMap;
    saveSettingsDebounced();

    // 重新合并全量图谱
    await mergeAllGraphs();

    toastr.success('续写内容已同步更新到全量知识图谱，闭环治理完成', "小说续写器");
    return true;
}

// ==============================================
// 规则核心：分场景续写生成函数（全场景专项规则适配）
// ==============================================

// 魔改内容增量图谱更新与校验刷新（规则魔改续写要求）
async function updateModifyChapterGraph(chapterId, modifiedContent) {
    const targetChapter = currentParsedChapters.find(item => item.id == chapterId);
    if (!targetChapter) {
        toastr.error('目标章节不存在', "小说续写器");
        return false;
    }

    // 更新章节内容与版本号
    targetChapter.content = modifiedContent;
    targetChapter.version = (parseFloat(targetChapter.version) + 0.1).toFixed(1);
    targetChapter.hasGraph = false;

    // 重新生成该章节图谱
    const newGraph = await generateSingleChapterGraph(targetChapter);
    if (!newGraph) {
        toastr.error('魔改章节图谱更新失败', "小说续写器");
        return false;
    }

    // 更新图谱Map
    const graphMap = extension_settings[extensionName].chapterGraphMap || {};
    graphMap[chapterId] = newGraph;
    extension_settings[extensionName].chapterGraphMap = graphMap;
    extension_settings[extensionName].chapterList = currentParsedChapters;
    saveSettingsDebounced();

    // 重新合并全量图谱
    await mergeAllGraphs();

    // 自动重新执行前置校验（规则魔改续写要求：更新校验边界）
    await runPreWriteValidation(chapterId);

    toastr.success('魔改内容图谱更新完成！全量图谱与前置校验边界已同步刷新', "小说续写器");
    return true;
}

// 核心续写生成函数（分场景专项规则落地）
async function generateNovelWrite() {
    const context = getContext();
    const { generateRaw } = context;
    const selectedChapterId = $('#write-chapter-select').val();
    const editedChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const writeScene = $('#write-scene-select').val();
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const validationReport = extension_settings[extensionName].lastValidationReport || {};
    const validatedChapterId = extension_settings[extensionName].lastValidatedChapterId;
    const isSmallData = isSmallDataScene();

    // 规则强制硬锁：必须执行对应章节的前置校验，绝对不能跳过
    if (!validatedChapterId || validatedChapterId != selectedChapterId) {
        toastr.error('规则强制要求：必须先执行对应基准章节的前置校验，校验通过后方可生成续写内容，绝对不能跳过校验', "小说续写器");
        return;
    }

    // 基础前置校验
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
        toastr.warning('未检测到合并后的知识图谱，续写质量无法保证', "小说续写器");
    }

    // 分场景专项规则构建
    let sceneSpecialRules = '';
    let baseContent = editedChapterContent;

    // 原位续写：获取光标位置，拆分前后文，要求衔接前后
    if (writeScene === 'in-place') {
        const editBox = document.getElementById('write-chapter-content');
        const cursorPos = editBox.selectionStart;
        const preContent = editedChapterContent.slice(0, cursorPos);
        const afterContent = editedChapterContent.slice(cursorPos);
        baseContent = preContent;
        sceneSpecialRules = `
【原位续写专项规则（100%遵守）】
1. 必须严格承接续写位置的当前场景、人物对话、动作、情绪状态，续写的第一句必须与前文最后一句（${preContent.slice(-100)}）无缝衔接，无任何逻辑断层。
2. 必须遵循前置校验输出的该节点的人设、设定、剧情状态，续写内容要符合人物当前的心境与行为逻辑，推动当前场景的剧情自然发展。
3. 必须贴合该章节的叙事节奏与文风，不能出现与本章风格不符的内容。
4. 续写内容完成后，必须能够自然承接该章节续写位置之后的原有内容（${afterContent.slice(0, 100)}），绝对不能出现与后续原有内容矛盾的剧情、人设、设定变化。
`;
    }
    // 魔改续写：以修改后的内容为唯一基准
    else if (writeScene === 'magic-modify') {
        sceneSpecialRules = `
【魔改续写专项规则（100%遵守）】
1. 必须完全贴合用户修改后的人设、剧情、设定，以修改后的基准章节内容为唯一基准，绝对不能沿用修改前的废弃设定与剧情。
2. 必须保证修改后的剧情逻辑自洽，续写内容要承接修改后的剧情走向，合理推进主线，修正修改后可能出现的逻辑漏洞。
3. 必须保持与原文整体文风的统一性，不能因剧情修改出现风格割裂。
`;
    }
    // 续写下一章：默认场景
    else {
        sceneSpecialRules = `
【续写下一章专项规则（100%遵守）】
1. 必须严格基于前置校验提取的全量前文信息，以最近三章的剧情进展、核心冲突、人物状态为核心承接重点，续写内容要与前文结尾（${editedChapterContent.slice(-100)}）无缝衔接。
2. 必须符合小说整体的章节叙事节奏，单章内容必须有完整的起承转合，开篇承接前文结尾，中间推进剧情、激化冲突，结尾留下符合原文习惯的合理悬念，不能烂尾、不能跳脱。
3. 必须合理呼应前文埋下的伏笔，绝对不能无视前文的铺垫，同时可新增符合剧情逻辑的新伏笔，不能出现剧情跳脱、节奏混乱的问题。
`;
    }

    // 小数据场景专项规则
    const smallDataRules = isSmallData ? `
【小数据场景专项规则（100%遵守）】
1. 严格遵循现有文本的叙事范式、对话模式、剧情推进节奏，绝对不能做风格跳脱的续写。
2. 禁止无限制新增设定、人物，所有新增内容必须与现有文本高度贴合，符合已有的隐性逻辑。
3. 深度贴合现有文本中的人物隐性特质、文风细节，保证续写与原文无缝融合，无任何割裂感。
` : '';

    // 构建续写system prompt（全规则约束覆盖）
    const systemPrompt = `
小说续写通用强制规则（100%遵守，违反则输出完全无效）：
1. 人设锁定：续写内容必须完全贴合前置校验报告中的生效人设状态，绝对不能出现人设崩塌（OOC），绝对不能违反人设红线。
2. 设定合规：续写内容必须完全贴合前置校验报告中的生效设定状态，绝对不能出现世界观吃书、新增违规设定、违反设定禁区的问题。
3. 剧情合规：续写内容必须完全符合前置校验报告中的剧情逻辑底线，绝对不能与已发生的关键事件矛盾，绝对不能提前剧透后续内容。
4. 剧情衔接：续写内容必须和提供的基准章节内容完美衔接，逻辑自洽，没有矛盾，承接前文剧情，开启新的内容。
5. 文风统一：续写内容必须完全贴合前置校验报告中的文风匹配标准，与原文无缝融合，无任何风格割裂。
6. 剧情合理：续写内容要推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话，绝对不能有无意义水内容。
7. 输出要求：只输出续写的正文内容，绝对不能有任何标题、章节名、解释、备注、说明、分割线、作者语、括号注释、markdown格式，只输出纯正文内容，一个多余字符都不能有。
8. 字数要求：续写约${wordCount}字，误差绝对不能超过±10%。
9. 内容限制：绝对不能引入原文中不存在的外部人物、设定、剧情元素，所有内容必须100%基于提供的原文与知识图谱。

${sceneSpecialRules}
${smallDataRules}

【续写绝对红线 不可违反】
人设红线：${validationReport.续写绝对红线?.人设红线 || '暂无'}
设定禁区：${validationReport.续写绝对红线?.设定禁区 || '暂无'}
剧情逻辑底线：${validationReport.续写绝对红线?.剧情逻辑底线 || '暂无'}

【必须合理呼应的伏笔清单】
${JSON.stringify(validationReport.可呼应伏笔清单 || [])}
`;

    const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
前置校验合规边界：${JSON.stringify(validationReport)}
基准章节核心内容：${baseContent}

请基于以上内容，按照规则续写后续的正文内容。
`;

    // 开始生成
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    $('#write-status').text('正在生成续写章节，请稍候...');
    $('#write-quality-report').val('');
    $('#write-content-preview').val('');
    updateProgress('write-progress', 'write-status', 1, 1, "生成进度");

    try {
        let finalWriteContent = '';
        let finalQualityReport = null;
        let retryCount = 0;

        // 规则强制：不合格内容必须重新生成，直到合格或用户停止
        // 但每次生成后立即显示内容，让用户看到进度
        while (true) {
            if (stopGenerateFlag) break;

            // 生成内容
            const result = await generateRaw({ systemPrompt, prompt: userPrompt });
            if (!result.trim()) {
                throw new Error('生成内容为空');
            }

            // 后处理：只保留纯正文
            const currentWriteContent = cleanWriteContent(result.trim());

            // 执行质量评估
            const qualityReport = await evaluateWriteQuality(
                currentWriteContent,
                selectedChapterId,
                validationReport,
                mergedGraph,
                writeScene,
                wordCount
            );
            if (!qualityReport) {
                throw new Error('质量评估失败');
            }

            // 无论合格与否，都更新预览和报告（让用户看到当前生成的内容）
            $('#write-content-preview').val(currentWriteContent);
            $('#write-quality-report').val(JSON.stringify(qualityReport, null, 2));

            // 校验是否合格（规则强制：单项≥80，总分≥85）
            if (qualityReport.是否合格) {
                finalWriteContent = currentWriteContent;
                finalQualityReport = qualityReport;
                break;
            } else {
                retryCount++;
                toastr.info(`续写内容不合格，正在重新生成（第${retryCount}次），问题：${qualityReport.问题明细}`, "小说续写器");
                // 优化prompt，加入修正建议，针对性修正
                userPrompt += `\n上次生成不合格，问题明细：${qualityReport.问题明细}\n修正建议：${qualityReport.修正建议}\n请严格按照修正建议重新生成符合所有规则的续写内容。`;
                // 继续循环
            }
        }

        if (stopGenerateFlag) {
            $('#write-status').text('已停止生成');
            updateProgress('write-progress', 'write-status', 0, 0);
            return;
        }

        // 如果循环结束且合格，则已经显示最终内容；如果不合格但停止，也保留了最后生成的内容
        // 保存质量报告（如果合格，finalQualityReport存在；如果不合格但停止了，可能没有finalQualityReport，但已经显示了）
        if (finalQualityReport) {
            extension_settings[extensionName].lastWriteQuality = finalQualityReport;
            saveSettingsDebounced();
        }

        // 只有合格才自动添加到续写链条并同步图谱
        if (finalQualityReport && finalQualityReport.是否合格) {
            // 自动添加到无限续写链条
            const newChapter = {
                id: continueChapterIdCounter++,
                title: `续写章节 ${continueWriteChain.length + 1}`,
                content: finalWriteContent,
                baseChapterId: selectedChapterId,
                qualityReport: finalQualityReport,
                createTime: new Date().toISOString()
            };
            continueWriteChain.push(newChapter);

            // 持久化保存
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
            saveSettingsDebounced();

            // 渲染续写链条
            renderContinueWriteChain(continueWriteChain);

            // 规则强制：评估通过的内容必须自动同步更新到知识图谱，实现闭环治理
            await saveWriteContentToGraph(finalWriteContent, newChapter.id);

            $('#write-status').text(`续写章节生成完成！质量总分：${finalQualityReport.总分}分，已合格并同步更新到知识图谱`);
            toastr.success(`续写章节生成完成！质量总分：${finalQualityReport.总分}分，已合格并同步更新到知识图谱`, "小说续写器");
        } else {
            // 如果不合格但停止了，提示用户
            $('#write-status').text('生成已停止，最后生成的内容为不合格，可手动修改或继续生成');
            toastr.warning('续写内容不合格，已停止生成。您可查看报告并调整后重新生成。', "小说续写器");
        }

        updateProgress('write-progress', 'write-status', 0, 0);
    } catch (error) {
        console.error('续写生成失败:', error);
        $('#write-status').text(`生成失败: ${error.message}`);
        updateProgress('write-progress', 'write-status', 0, 0);
        toastr.error(`续写生成失败: ${error.message}`, "小说续写器");
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
    }
}

// ==============================================
// 无限续写核心函数
// ==============================================

// 渲染无限续写链条
function renderContinueWriteChain(chain) {
    const $chainContainer = $('#continue-write-chain');
    if (chain.length === 0) {
        $chainContainer.html('<p class="text-muted text-center">暂无续写章节，生成合格续写内容后自动添加到此处</p>');
        return;
    }

    // 生成所有续写章节的HTML
    const chainHtml = chain.map((chapter, index) => `
        <div class="continue-chapter-item" data-chain-id="${chapter.id}">
            <div class="flex-container justifySpaceBetween alignCenter margin-b5">
                <b class="continue-chapter-title">续写章节 ${index + 1} | 质量分：${chapter.qualityReport?.总分 || '暂无'}分 | ${chapter.qualityReport?.是否合格 ? '已合格' : '不合格'}</b>
                <div class="flex-container gap5">
                    <input class="menu_button menu_button--sm menu_button--primary continue-write-btn" data-chain-id="${chapter.id}" type="submit" value="基于此章继续续写" />
                    <input class="menu_button menu_button--sm continue-copy-btn" data-chain-id="${chapter.id}" type="submit" value="复制内容" />
                    <input class="menu_button menu_button--sm continue-send-btn" data-chain-id="${chapter.id}" type="submit" value="发送到对话框" />
                    <input class="menu_button menu_button--sm continue-delete-btn" data-chain-id="${chapter.id}" type="submit" value="删除此章" />
                </div>
            </div>
            <textarea class="form-control w100 continue-chapter-content" data-chain-id="${chapter.id}" rows="10" placeholder="续写章节内容...">${chapter.content}</textarea>
        </div>
    `).join('');

    $chainContainer.html(chainHtml);

    // 绑定章节内容编辑事件（自动保存）
    $('.continue-chapter-content').on('input', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        const newContent = $(e.target).val();
        const chapterIndex = continueWriteChain.findIndex(item => item.id === chainId);
        if (chapterIndex !== -1) {
            continueWriteChain[chapterIndex].content = newContent;
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            saveSettingsDebounced();
        }
    });

    // 绑定继续续写按钮事件
    $('.continue-write-btn').on('click', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        generateContinueWrite(chainId);
    });

    // 绑定复制按钮事件
    $('.continue-copy-btn').on('click', function(e) {
        const chainId = parseInt($(e.target).data('chain-id'));
        const chapter = continueWriteChain.find(item => item.id === chainId);
        if (!chapter || !chapter.content) {
            toastr.warning('没有可复制的内容', "小说续写器");
            return;
        }
        navigator.clipboard.writeText(chapter.content).then(() => {
            toastr.success('续写内容已复制到剪贴板', "小说续写器");
        }).catch(() => {
            toastr.error('复制失败', "小说续写器");
        });
    });

    // 绑定发送到对话框按钮事件
    $('.continue-send-btn').on('click', function(e) {
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

    // 绑定删除此章按钮事件
    $('.continue-delete-btn').on('click', function(e) {
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

// 无限续写生成逻辑
async function generateContinueWrite(targetChainId) {
    const context = getContext();
    const { generateRaw } = context;
    const selectedBaseChapterId = $('#write-chapter-select').val();
    const editedBaseChapterContent = $('#write-chapter-content').val().trim();
    const wordCount = parseInt($('#write-word-count').val()) || 2000;
    const mergedGraph = extension_settings[extensionName].mergedGraph || {};
    const validationReport = extension_settings[extensionName].lastValidationReport || {};
    const validatedChapterId = extension_settings[extensionName].lastValidatedChapterId;
    const isSmallData = isSmallDataScene();

    // 规则强制硬锁：必须执行前置校验
    if (!validatedChapterId || validatedChapterId != selectedBaseChapterId) {
        toastr.error('规则强制要求：必须先执行对应基准章节的前置校验，校验通过后方可生成续写内容', "小说续写器");
        return;
    }

    // 前置校验
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

    if (Object.keys(mergedGraph).length === 0) {
        toastr.warning('未检测到合并后的知识图谱，续写质量无法保证', "小说续写器");
    }

    // 拼接完整上下文：基准前所有章节 + 魔改基准章 + 链条中到目标章的所有内容
    let fullContextContent = '';

    // 1. 拼接基准章节之前的所有导入章节
    const baseChapterId = parseInt(selectedBaseChapterId);
    const preBaseChapters = currentParsedChapters.filter(chapter => chapter.id < baseChapterId);
    preBaseChapters.forEach(chapter => {
        fullContextContent += `${chapter.title}\n${chapter.content}\n\n`;
    });

    // 2. 拼接用户魔改后的基准章节内容
    const baseChapterTitle = currentParsedChapters.find(c => c.id === baseChapterId)?.title || '基准章节';
    fullContextContent += `${baseChapterTitle}\n${editedBaseChapterContent}\n\n`;

    // 3. 拼接链条中到目标章节为止的所有续写内容（含目标章）
    const targetBeforeChapters = continueWriteChain.slice(0, targetChapterIndex + 1);
    targetBeforeChapters.forEach((chapter, index) => {
        fullContextContent += `续写章节 ${index + 1}\n${chapter.content}\n\n`;
    });

    // 小数据场景专项规则
    const smallDataRules = isSmallData ? `
【小数据场景专项规则（100%遵守）】
1. 严格遵循现有文本的叙事范式、对话模式、剧情推进节奏，绝对不能做风格跳脱的续写。
2. 禁止无限制新增设定、人物，所有新增内容必须与现有文本高度贴合，符合已有的隐性逻辑。
3. 深度贴合现有文本中的人物隐性特质、文风细节，保证续写与原文无缝融合。
` : '';

    // 构建续写prompt
    const systemPrompt = `
小说续写通用强制规则（100%遵守，违反则输出完全无效）：
1. 人设锁定：续写内容必须完全贴合前置校验报告中的生效人设状态，绝对不能出现人设崩塌（OOC），绝对不能违反人设红线。
2. 设定合规：续写内容必须完全贴合前置校验报告中的生效设定状态，绝对不能出现世界观吃书、新增违规设定、违反设定禁区的问题。
3. 剧情合规：续写内容必须完全符合前置校验报告中的剧情逻辑底线，绝对不能与已发生的关键事件矛盾，绝对不能提前剧透后续内容。
4. 剧情衔接：续写内容必须和提供的完整上下文的最后一段内容完美衔接，逻辑自洽，无矛盾，承接前文所有剧情，开启新章节，不得重复前文已有的情节。
5. 文风统一：续写内容必须完全贴合前置校验报告中的文风匹配标准，与原文无缝融合，无任何风格割裂。
6. 剧情合理：续写内容要推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话，绝对不能有无意义水内容。
7. 输出要求：只输出续写的正文内容，绝对不能有任何标题、章节名、解释、备注、说明、分割线、作者语、括号注释、markdown格式，只输出纯正文内容，一个多余字符都不能有。
8. 字数要求：续写约${wordCount}字，误差绝对不能超过±10%。
9. 内容限制：绝对不能引入原文中不存在的外部人物、设定、剧情元素，所有内容必须100%基于提供的原文与知识图谱。

${smallDataRules}

【续写绝对红线 不可违反】
人设红线：${validationReport.续写绝对红线?.人设红线 || '暂无'}
设定禁区：${validationReport.续写绝对红线?.设定禁区 || '暂无'}
剧情逻辑底线：${validationReport.续写绝对红线?.剧情逻辑底线 || '暂无'}

【必须合理呼应的伏笔清单】
${JSON.stringify(validationReport.可呼应伏笔清单 || [])}
`;

    const userPrompt = `
小说核心设定知识图谱：${JSON.stringify(mergedGraph)}
前置校验合规边界：${JSON.stringify(validationReport)}

完整前文上下文：
${fullContextContent}

请基于以上完整的前文内容和知识图谱，按照规则续写后续的新章节正文，确保和前文最后一段内容完美衔接，不重复前文情节。
`;

    // 开始生成
    isGeneratingWrite = true;
    stopGenerateFlag = false;
    toastr.info('正在生成续写章节，请稍候...', "小说续写器");

    try {
        let finalWriteContent = '';
        let finalQualityReport = null;
        let retryCount = 0;

        // 规则强制：不合格必须重生成，但每次生成后显示内容
        while (true) {
            if (stopGenerateFlag) break;

            const result = await generateRaw({ systemPrompt, prompt: userPrompt });
            if (!result.trim()) {
                throw new Error('生成内容为空');
            }

            const currentWriteContent = cleanWriteContent(result.trim());

            // 质量评估
            const qualityReport = await evaluateWriteQuality(
                currentWriteContent,
                selectedBaseChapterId,
                validationReport,
                mergedGraph,
                'next',
                wordCount
            );
            if (!qualityReport) {
                throw new Error('质量评估失败');
            }

            // 显示当前生成的内容和报告
            $('#write-content-preview').val(currentWriteContent);
            $('#write-quality-report').val(JSON.stringify(qualityReport, null, 2));

            if (qualityReport.是否合格) {
                finalWriteContent = currentWriteContent;
                finalQualityReport = qualityReport;
                break;
            } else {
                retryCount++;
                toastr.info(`续写内容不合格，正在重新生成（第${retryCount}次）`, "小说续写器");
                userPrompt += `\n上次生成不合格，问题明细：${qualityReport.问题明细}\n修正建议：${qualityReport.修正建议}\n请严格按照修正建议重新生成。`;
            }
        }

        if (stopGenerateFlag) {
            toastr.info('已停止生成', "小说续写器");
            return;
        }

        // 只有合格才自动添加
        if (finalQualityReport && finalQualityReport.是否合格) {
            // 新增到续写链条
            const newChapter = {
                id: continueChapterIdCounter++,
                title: `续写章节 ${continueWriteChain.length + 1}`,
                content: finalWriteContent,
                baseChapterId: selectedBaseChapterId,
                qualityReport: finalQualityReport,
                createTime: new Date().toISOString()
            };
            continueWriteChain.push(newChapter);

            // 持久化保存
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
            saveSettingsDebounced();

            // 重新渲染链条
            renderContinueWriteChain(continueWriteChain);

            // 自动同步到知识图谱
            await saveWriteContentToGraph(finalWriteContent, newChapter.id);

            toastr.success(`续写章节生成完成！质量总分：${finalQualityReport.总分}分，已合格并同步更新到知识图谱`, "小说续写器");
        } else {
            toastr.warning('续写内容不合格，已停止生成。您可查看报告并调整后重新生成。', "小说续写器");
        }
    } catch (error) {
        console.error('继续续写生成失败:', error);
        toastr.error(`继续续写生成失败: ${error.message}`, "小说续写器");
    } finally {
        isGeneratingWrite = false;
        stopGenerateFlag = false;
    }
}

// ==============================================
// 扩展入口（完全对齐官方模板结构）
// ==============================================

jQuery(async () => {
    // 加载外部HTML文件，追加到ST扩展设置面板
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

            // 清空旧数据
            extension_settings[extensionName].chapterGraphMap = {};
            extension_settings[extensionName].mergedGraph = {};
            extension_settings[extensionName].lastValidationReport = {};
            extension_settings[extensionName].lastValidatedChapterId = null;
            extension_settings[extensionName].lastWriteQuality = {};

            // 更新UI
            $('#merged-graph-preview').val('');
            $('#graph-dependency-preview').val('');
            $('#graph-history-preview').val('');
            $('#validation-report').val('');
            $('#validation-redline').val('');
            $('#validation-foreshadow').val('');
            $('#write-quality-report').val('');

            // 清空旧续写链条
            continueWriteChain = [];
            continueChapterIdCounter = 1;
            extension_settings[extensionName].continueWriteChain = continueWriteChain;
            extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
            renderContinueWriteChain(continueWriteChain);

            saveSettingsDebounced();

            // 渲染UI
            renderChapterList(currentParsedChapters);
            renderChapterSelect(currentParsedChapters);
            renderValidateChapterSelect(currentParsedChapters);
            updateWriteButtonStatus(null);
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

    // 刷新图谱状态
    $("#refresh-graph-status-btn").on("click", refreshGraphStatus);

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

    // 图谱导入按钮点击事件
    $("#graph-import-btn").on("click", () => {
        $("#graph-file-upload").click();
    });

    // 图谱文件上传处理逻辑
    $("#graph-file-upload").on("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const graphData = JSON.parse(event.target.result.trim());

                // 验证图谱核心字段
                const requiredFields = ["全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"];
                const hasAllRequired = requiredFields.every(field => Object.hasOwn(graphData, field));
                if (!hasAllRequired) {
                    throw new Error("图谱格式错误，缺少核心必填字段");
                }

                // 保存到扩展设置
                extension_settings[extensionName].mergedGraph = graphData;
                saveSettingsDebounced();

                // 更新预览框
                $('#merged-graph-preview').val(JSON.stringify(graphData, null, 2));
                $('#graph-dependency-preview').val(JSON.stringify(graphData.反向依赖图谱, null, 2));
                $('#graph-history-preview').val(JSON.stringify(graphData.世界观设定库?.设定变更历史记录 || [], null, 2));

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
        a.download = '小说全量知识图谱.json';
        a.click();
        URL.revokeObjectURL(url);
        toastr.success('图谱JSON已导出', "小说续写器");
    });

    $("#graph-clear-btn").on("click", () => {
        extension_settings[extensionName].mergedGraph = {};
        extension_settings[extensionName].chapterGraphMap = {};
        extension_settings[extensionName].lastValidationReport = {};
        extension_settings[extensionName].lastValidatedChapterId = null;

        $('#merged-graph-preview').val('');
        $('#graph-dependency-preview').val('');
        $('#graph-history-preview').val('');
        $('#validation-report').val('');
        $('#validation-redline').val('');
        $('#validation-foreshadow').val('');

        currentParsedChapters.forEach(chapter => chapter.hasGraph = false);
        renderChapterList(currentParsedChapters);
        updateWriteButtonStatus(null);

        saveSettingsDebounced();
        toastr.success('已清空所有图谱数据与校验记录', "小说续写器");
    });

    // ==============================================
    // 前置校验事件绑定
    // ==============================================

    $("#run-validation-btn").on("click", () => {
        const selectedChapterId = $('#validate-chapter-select').val();
        if (!selectedChapterId) {
            toastr.error('请选择续写基准节点', "小说续写器");
            return;
        }
        // 执行前置校验
        runPreWriteValidation(selectedChapterId);
    });

    // ==============================================
    // 续写模块事件绑定
    // ==============================================

    // 场景切换提示更新
    $("#write-scene-select").on("change", function(e) {
        const scene = $(e.target).val();
        let tipText = '';
        let modifyBtnDisplay = 'none';
        switch (scene) {
            case 'in-place':
                tipText = '【原位续写】：请在下方基准章节内容编辑框中，将光标放在要续写的位置，续写内容将无缝衔接光标前后的内容';
                modifyBtnDisplay = 'none';
                break;
            case 'magic-modify':
                tipText = '【魔改续写】：请修改下方基准章节内容，修改完成后点击「更新魔改内容图谱」，系统将自动更新图谱与校验边界，再生成续写';
                modifyBtnDisplay = 'inline-block';
                break;
            default:
                tipText = '【续写下一章】：基于基准章节及前文完整内容，续写全新章节，需有完整起承转合与结尾悬念';
                modifyBtnDisplay = 'none';
                break;
        }
        $('#scene-tip').text(tipText);
        $('#update-modify-graph-btn').css('display', modifyBtnDisplay);
    });

    // 章节选择联动
    $("#write-chapter-select").on("change", function(e) {
        const selectedChapterId = $(e.target).val();
        if (!selectedChapterId) {
            $('#write-chapter-content').val('').prop('readonly', true);
        } else {
            // 找到对应章节
            const targetChapter = currentParsedChapters.find(item => item.id == selectedChapterId);
            if (targetChapter) {
                // 填充章节内容，强制取消只读
                $('#write-chapter-content').val(targetChapter.content).prop('readonly', false);
            }
        }
        // 更新生成按钮状态
        updateWriteButtonStatus(extension_settings[extensionName].lastValidatedChapterId);
    });

    // 魔改内容图谱更新按钮
    $("#update-modify-graph-btn").on("click", () => {
        const selectedChapterId = $('#write-chapter-select').val();
        const modifiedContent = $('#write-chapter-content').val().trim();
        if (!selectedChapterId) {
            toastr.error('请先选择基准章节', "小说续写器");
            return;
        }
        if (!modifiedContent) {
            toastr.error('章节内容不能为空', "小说续写器");
            return;
        }
        updateModifyChapterGraph(selectedChapterId, modifiedContent);
    });

    // 生成续写章节按钮
    $("#write-generate-btn").on("click", generateNovelWrite);

    // 停止生成
    $("#write-stop-btn").on("click", () => {
        if (isGeneratingWrite) {
            stopGenerateFlag = true;
            $('#write-status').text('已停止生成');
            updateProgress('write-progress', 'write-status', 0, 0);
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
        $('#write-quality-report').val('');
        updateProgress('write-progress', 'write-status', 0, 0);
        extension_settings[extensionName].lastWriteQuality = {};
        saveSettingsDebounced();
        toastr.success('已清空续写内容', "小说续写器");
    });

    // 清空所有续写章节
    $("#clear-chain-btn").on("click", () => {
        continueWriteChain = [];
        continueChapterIdCounter = 1;
        extension_settings[extensionName].continueWriteChain = continueWriteChain;
        extension_settings[extensionName].continueChapterIdCounter = continueChapterIdCounter;
        saveSettingsDebounced();
        renderContinueWriteChain(continueWriteChain);
        toastr.success('已清空所有续写章节', "小说续写器");
    });

    // 初始化加载设置
    loadSettings();
});