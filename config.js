// 扩展基础配置
export const extensionName = "Always_remember_me";
export const extensionBasePath = `scripts/extensions/third-party/${extensionName}`;

// 默认配置
export const defaultSettings = Object.freeze({
  chapterRegex: "^\\s*第\\s*[0-9零一二三四五六七八九十百千]+\\s*章.*$",
  sendTemplate: "/sendas name={{char}} {{pipe}}",
  sendDelay: 100,
  example_setting: false,
  chapterList: [],
  chapterGraphMap: {},
  mergedGraph: {},
  // 和Cola完全一致的左下角初始位置
  ballPosition: { x: 20, y: window.innerHeight - 180 },
  panelOpen: false,
});

// 知识图谱Schema
export const graphJsonSchema = Object.freeze({
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
});

export const mergeGraphJsonSchema = Object.freeze({
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
});
