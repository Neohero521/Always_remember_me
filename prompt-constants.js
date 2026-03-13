// 单章节图谱JSON Schema
export const graphJsonSchema = {
    name: 'NovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["基础章节信息", "人物信息", "世界观设定", "核心剧情线", "文风特点", "实体关系网络", "变更与依赖信息", "逆向分析洞察"],
        "properties": {
            "基础章节信息": {
                "type": "object",
                "required": ["章节号", "章节版本号", "章节节点唯一标识", "本章字数", "叙事时间线节点"],
                "properties": {
                    "章节号": { "type": "string"},
                    "章节版本号": { "type": "string", "default": "1.0"},
                    "章节节点唯一标识": { "type": "string"},
                    "本章字数": { "type": "number"},
                    "叙事时间线节点": { "type": "string"}
                }
            },
            "人物信息": {
                "type": "array", "minItems": 1,
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "别名/称号", "本章更新的性格特征", "本章更新的身份/背景", "本章核心行为与动机", "本章人物关系变更", "本章人物弧光变化"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "别名/称号": { "type": "string"},
                        "本章更新的性格特征": { "type": "string"},
                        "本章更新的身份/背景": { "type": "string"},
                        "本章核心行为与动机": { "type": "string"},
                        "本章人物关系变更": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度0-1", "关系描述", "对应原文位置"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度0-1": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系描述": { "type": "string"},
                                    "对应原文位置": { "type": "string"}
                                }
                            }
                        },
                        "本章人物弧光变化": { "type": "string"}
                    }
                }
            },
            "世界观设定": {
                "type": "object",
                "required": ["本章新增/变更的时代背景", "本章新增/变更的地理区域", "本章新增/变更的力量体系/规则", "本章新增/变更的社会结构", "本章新增/变更的独特物品/生物","本章新增的隐藏设定/伏笔", "对应原文位置"],
                "properties": {
                    "本章新增/变更的时代背景": { "type": "string"},
                    "本章新增/变更的地理区域": { "type": "string"},
                    "本章新增/变更的力量体系/规则": { "type": "string"},
                    "本章新增/变更的社会结构": { "type": "string"},
                    "本章新增/变更的独特物品/生物": { "type": "string"},
                    "本章新增的隐藏设定/伏笔": { "type": "string"},
                    "对应原文位置": { "type": "string"}
                }
            },
            "核心剧情线": {
                "type": "object",
                "required": ["本章主线剧情描述", "本章关键事件列表", "本章支线剧情", "本章核心冲突进展", "本章未回收伏笔"],
                "properties": {
                    "本章主线剧情描述": { "type": "string"},
                    "本章关键事件列表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "前因", "后果", "对主线的影响", "对应原文位置"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "前因": { "type": "string"},
                                "后果": { "type": "string"},
                                "对主线的影响": { "type": "string"},
                                "对应原文位置": { "type": "string"}
                            }
                        }
                    },
                    "本章支线剧情": { "type": "string"},
                    "本章核心冲突进展": { "type": "string"},
                    "本章未回收伏笔": { "type": "string"}
                }
            },
            "文风特点": {
                "type": "object",
                "required": ["本章叙事视角", "语言风格", "对话特点", "常用修辞", "节奏特点", "与全文文风的匹配度说明"],
                "properties": {
                    "本章叙事视角": { "type": "string"},
                    "语言风格": { "type": "string"},
                    "对话特点": { "type": "string"},
                    "常用修辞": { "type": "string"},
                    "节奏特点": { "type": "string"},
                    "与全文文风的匹配度说明": { "type": "string"}
                }
            },
            "实体关系网络": {
                "type": "array", "minItems": 5,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "变更与依赖信息": {
                "type": "object",
                "required": ["本章对全局图谱的变更项", "本章剧情依赖的前置章节", "本章内容对后续剧情的影响预判", "本章内容与前文的潜在冲突预警"],
                "properties": {
                    "本章对全局图谱的变更项": { "type": "string"},
                    "本章剧情依赖的前置章节": { "type": "string"},
                    "本章内容对后续剧情的影响预判": { "type": "string"},
                    "本章内容与前文的潜在冲突预警": { "type": "string"}
                }
            },
            "逆向分析洞察": { "type": "string"}
        }
    }
};

// 合并图谱JSON Schema
export const mergeGraphJsonSchema = {
    name: 'MergedNovelKnowledgeGraph',
    strict: true,
    value: {
        "$schema": "http://json-schema.org/draft-04/schema#",
        "type": "object",
        "required": ["全局基础信息", "人物信息库", "世界观设定库", "全剧情时间线", "全局文风标准", "全量实体关系网络", "反向依赖图谱", "逆向分析与质量评估"],
        "properties": {
            "全局基础信息": {
                "type": "object",
                "required": ["小说名称", "总章节数", "已解析文本范围", "全局图谱版本号", "最新更新时间"],
                "properties": {
                    "小说名称": { "type": "string"},
                    "总章节数": { "type": "number"},
                    "已解析文本范围": { "type": "string"},
                    "全局图谱版本号": { "type": "string"},
                    "最新更新时间": { "type": "string"}
                }
            },
            "人物信息库": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["唯一人物ID", "姓名", "所有别名/称号", "全本最终性格特征", "完整身份/背景", "全本核心动机", "全时间线人物关系网", "完整人物弧光", "人物关键事件时间线"],
                    "properties": {
                        "唯一人物ID": { "type": "string"},
                        "姓名": { "type": "string"},
                        "所有别名/称号": { "type": "string"},
                        "全本最终性格特征": { "type": "string"},
                        "完整身份/背景": { "type": "string"},
                        "全本核心动机": { "type": "string"},
                        "全时间线人物关系网": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["关系对象", "关系类型", "关系强度", "关系演变过程", "对应章节"],
                                "properties": {
                                    "关系对象": { "type": "string"},
                                    "关系类型": { "type": "string"},
                                    "关系强度": { "type": "number", "minimum": 0, "maximum": 1 },
                                    "关系演变过程": { "type": "string"},
                                    "对应章节": { "type": "string"}
                                }
                            }
                        },
                        "完整人物弧光": { "type": "string"},
                        "人物关键事件时间线": { "type": "string"}
                    }
                }
            },
            "世界观设定库": {
                "type": "object",
                "required": ["时代背景", "核心地理区域与地图", "完整力量体系/规则", "社会结构", "核心独特物品/生物", "全本所有隐藏设定/伏笔汇总", "设定变更历史记录"],
                "properties": {
                    "时代背景": { "type": "string"},
                    "核心地理区域与地图": { "type": "string"},
                    "完整力量体系/规则": { "type": "string"},
                    "社会结构": { "type": "string"},
                    "核心独特物品/生物": { "type": "string"},
                    "全本所有隐藏设定/伏笔汇总": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["伏笔内容", "出现章节", "当前回收状态", "预判回收节点"],
                            "properties": {
                                "伏笔内容": { "type": "string"},
                                "出现章节": { "type": "string"},
                                "当前回收状态": { "type": "string", "enum": ["未回收", "已回收", "待回收"] },
                                "预判回收节点": { "type": "string"}
                            }
                        }
                    },
                    "设定变更历史记录": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["变更章节", "变更内容", "生效范围"],
                            "properties": {
                                "变更章节": { "type": "string"},
                                "变更内容": { "type": "string"},
                                "生效范围": { "type": "string"}
                            }
                        }
                    }
                }
            },
            "全剧情时间线": {
                "type": "object",
                "required": ["主线剧情完整脉络", "全本关键事件时序表", "支线剧情汇总与关联关系", "全本核心冲突演变轨迹", "剧情节点依赖关系图"],
                "properties": {
                    "主线剧情完整脉络": { "type": "string"},
                    "全本关键事件时序表": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["事件ID", "事件名", "参与人物", "发生章节", "前因后果", "对主线的影响"],
                            "properties": {
                                "事件ID": { "type": "string"},
                                "事件名": { "type": "string"},
                                "参与人物": { "type": "string"},
                                "发生章节": { "type": "string"},
                                "前因后果": { "type": "string"},
                                "对主线的影响": { "type": "string"}
                            }
                        }
                    },
                    "支线剧情汇总与关联关系": { "type": "string"},
                    "全本核心冲突演变轨迹": { "type": "string"},
                    "剧情节点依赖关系图": { "type": "string"}
                }
            },
            "全局文风标准": {
                "type": "object",
                "required": ["固定叙事视角", "核心语言风格", "对话写作特点", "常用修辞与句式", "整体节奏规律", "场景描写习惯"],
                "properties": {
                    "固定叙事视角": { "type": "string"},
                    "核心语言风格": { "type": "string"},
                    "对话写作特点": { "type": "string"},
                    "常用修辞与句式": { "type": "string"},
                    "整体节奏规律": { "type": "string"},
                    "场景描写习惯": { "type": "string"}
                }
            },
            "全量实体关系网络": {
                "type": "array", "minItems": 20,
                "items": { "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": "string"} }
            },
            "反向依赖图谱": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["章节节点ID", "生效人设状态", "生效设定状态", "生效剧情状态", "依赖的前置节点"],
                    "properties": {
                        "章节节点ID": { "type": "string"},
                        "生效人设状态": { "type": "string"},
                        "生效设定状态": { "type": "string"},
                        "生效剧情状态": { "type": "string"},
                        "依赖的前置节点": { "type": "array", "items": { "type": "string"} }
                    }
                }
            },
            "逆向分析与质量评估": {
                "type": "object",
                "required": ["全本隐藏信息汇总", "潜在剧情矛盾预警", "设定一致性校验结果", "人设连贯性评估", "伏笔完整性评估", "全文本逻辑自洽性得分"],
                "properties": {
                    "全本隐藏信息汇总": { "type": "string"},
                    "潜在剧情矛盾预警": { "type": "string"},
                    "设定一致性校验结果": { "type": "string"},
                    "人设连贯性评估": { "type": "string"},
                    "伏笔完整性评估": { "type": "string"},
                    "全文本逻辑自洽性得分": { "type": "number", "minimum": 0, "maximum": 100 }
                }
            }
        }
    }
};

// 续写质量评估JSON Schema
export const qualityEvaluateSchema = {
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
            "评估报告": { "type": "string"},
            "是否合格": { "type": "boolean"}
        }
    }
};

// 续写前置校验JSON Schema
export const PRECHECK_JSON_SCHEMA = {
    name: 'ContinuePrecheck',
    strict: true,
    value: {
        type: "object",
        required: ["isPass", "preMergedGraph", "人设红线清单", "设定禁区清单", "可呼应伏笔清单", "潜在矛盾预警", "可推进剧情方向", "合规性报告"],
        properties: {
            isPass: { type: "boolean"},
            preMergedGraph: { type: "object"},
            "人设红线清单": { type: "string"},
            "设定禁区清单": { type: "string"},
            "可呼应伏笔清单": { type: "string"},
            "潜在矛盾预警": { type: "string"},
            "可推进剧情方向": { type: "string"},
            "合规性报告": { type: "string"}
        }
    }
};

// 固定提示词常量
export const BATCH_MERGE_GRAPH_SYSTEM_PROMPT = `触发词：合并批次知识图谱JSON、小说批次图谱构建 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的当前批次的多组章节图谱合并，不引入任何外部内容 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目 同一设定以当前批次内最新章节的生效内容为准，同时保留历史变更记录 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须构建完整的反向依赖图谱，支持后续合并与续写 必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估`;

export const MERGE_ALL_GRAPH_SYSTEM_PROMPT = `触发词：合并全量知识图谱JSON、小说全局图谱构建 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的多组图谱合并，不引入任何外部内容 严格去重，同一人物/设定/事件不能重复，不同别名合并为同一条目 同一设定以最新章节的生效内容为准，同时保留历史变更记录 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须构建完整的反向依赖图谱，支持任意章节续写的前置信息提取 必填字段：全局基础信息、人物信息库、世界观设定库、全剧情时间线、全局文风标准、全量实体关系网络、反向依赖图谱、逆向分析与质量评估`;

export const CONTINUE_CHAPTER_GRAPH_SYSTEM_PROMPT = `触发词：构建单章节知识图谱JSON、小说续写章节解析 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的续写章节内容分析，不引入任何外部内容 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;

// 提示词生成函数
export function getSingleChapterGraphPrompt(chapter, isModified = false) {
    const trigger = isModified ? '构建单章节知识图谱JSON、小说魔改章节解析' : '构建单章节知识图谱JSON、小说章节解析';
    const contentDesc = isModified ? '魔改后章节内容' : '小说章节内容';
    return `触发词：${trigger} 强制约束（100%遵守）： 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown 必须以{开头，以}结尾，无其他字符 仅基于提供的${contentDesc}分析，不引入任何外部内容 严格包含所有要求的字段，不修改字段名 无对应内容设为"暂无"，数组设为[]，不得留空 必须实现全链路双向可追溯，所有信息必须关联对应原文位置 同一人物、设定、事件不能重复出现，同一人物的不同别名必须合并为同一个唯一实体条目 基础章节信息必须填写：章节号=${chapter.id}，章节节点唯一标识=chapter_${chapter.id}，本章字数=${chapter.content.length} 必填字段：基础章节信息、人物信息、世界观设定、核心剧情线、文风特点、实体关系网络、变更与依赖信息、逆向分析洞察`;
}

export function getPrecheckSystemPrompt(baseId) {
    return `触发词：续写节点逆向分析、前置合规性校验 强制约束（100%遵守）： 所有分析只能基于续写节点（章节号${baseId}）及之前的小说内容，绝对不能引入该节点之后的任何剧情、设定、人物变化，禁止剧透 若前文有设定冲突，以续写节点前最后一次出现的内容为准，同时标注冲突预警 优先以用户提供的魔改后基准章节内容为准，更新对应人设、设定、剧情状态 只能基于提供的章节知识图谱分析，绝对不能引入外部信息、主观新增设定 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾 必填字段：isPass、preMergedGraph、人设红线清单、设定禁区清单、可呼应伏笔清单、潜在矛盾预警、可推进剧情方向、合规性报告`;
}

export function getQualityEvaluateSystemPrompt(targetWordCount, actualWordCount, wordErrorRate) {
    return `触发词：小说续写质量评估、多维度合规性校验 强制约束（100%遵守）： 严格按照5个维度执行评估，单项得分0-100分，总分=5个维度得分的平均值，精确到整数 合格标准：单项得分不得低于80分，总分不得低于85分，不符合即为不合格 所有评估只能基于提供的前置校验结果、知识图谱、基准章节内容，不能引入外部主观标准 必须校验字数合规性：目标字数${targetWordCount}字，实际字数${actualWordCount}字，误差超过10%（当前误差率${(wordErrorRate*100).toFixed(2)}%），内容质量得分必须对应扣分 输出必须为纯JSON格式，无任何前置/后置内容、注释、markdown，必须以{开头、以}结尾 评估维度说明： ● 人设一致性：校验续写内容中人物的言行、性格、动机是否符合人设设定，有无OOC问题 ● 设定合规性：校验续写内容是否符合世界观设定，有无吃书、新增违规设定、违反原有规则的问题 ● 剧情衔接度：校验续写内容与前文的衔接是否自然，逻辑是否自洽，有无剧情断层、前后矛盾的问题 ● 文风匹配度：校验续写内容的叙事视角、语言风格、对话模式、节奏规律是否与原文一致，有无风格割裂 ● 内容质量：校验续写内容是否有完整的情节、生动的细节、符合逻辑的对话，有无无意义水内容、剧情拖沓、逻辑混乱的问题，字数是否符合要求`;
}

export function getNovelWriteSystemPrompt(options) {
    const { redLines, forbiddenRules, baseLastParagraph, foreshadowList, wordCount, conflictWarning } = options;
    return `小说续写规则（100%遵守）：人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${redLines}设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${forbiddenRules}文本衔接：续写内容必须紧接在基准章节的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。基准章节的最后一段内容是："${baseLastParagraph}"续写必须从这段文字之后直接开始，不能重复这段内容。剧情承接：续写内容必须承接前文剧情，合理呼应以下伏笔：${foreshadowList}，开启新的章节内容，且与上述文本衔接要求一致。文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线字数要求：续写约${wordCount}字，误差不超过10%矛盾规避：必须规避以下潜在剧情矛盾：${conflictWarning}小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
}

export function getContinueWriteSystemPrompt(options) {
    const { redLines, forbiddenRules, targetLastParagraph, foreshadowList, wordCount, conflictWarning, targetChapterTitle } = options;
    return `小说续写规则（100%遵守）： 人设锁定：续写内容必须完全贴合小说的核心人物设定，绝对不能出现人设崩塌（OOC），严格遵守以下人设红线：${redLines} 设定合规：续写内容必须完全符合小说的世界观设定，绝对不能出现吃书、新增违规设定、违反原有规则的问题，严格遵守以下设定禁区：${forbiddenRules} 文本衔接：续写内容必须紧接在上一章（续写章节 ${targetChapterTitle}）的最后一段之后开始，从那个地方继续写下去，确保文本连续，逻辑自洽。上一章的最后一段内容是："${targetLastParagraph}"续写必须从这段文字之后直接开始，不能重复这段内容。 剧情承接：续写内容必须承接前文所有剧情，合理呼应以下伏笔：${foreshadowList}，开启新章节，且与上述文本衔接要求一致，不得重复前文已有的情节。 文风统一：续写内容必须完全贴合原小说的叙事风格、语言习惯、对话方式、节奏特点，和原文无缝衔接，无风格割裂 剧情合理：续写内容要符合原小说的世界观设定，推动主线剧情发展，有完整的情节起伏、生动的细节、符合人设的对话 输出要求：只输出续写的正文内容，不要任何标题、章节名、解释、备注、说明、分割线 字数要求：续写约${wordCount}字，误差不超过10% 矛盾规避：必须规避以下潜在剧情矛盾：${conflictWarning} 小数据适配：若前文内容较少，严格遵循现有文本的叙事范式、对话模式、剧情节奏，不做风格跳脱的续写，不无限新增设定与人物`;
}
