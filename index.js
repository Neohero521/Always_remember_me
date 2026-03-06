import { extension_settings, getContext, saveSettingsDebounced } from "../../../extensions.js";
import { printMessages } from "../../../../script.js";

const extensionName = "always-remember-me";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

let settings = {
    interactive_mode: false
};

// ==================== UI 注入（无需 example.html） ====================
const uiHTML = `
<div id="novel_importer_settings" style="padding:15px;">
    <h3>📖 小说章节导入器（Always Remember Me）</h3>
    <div>
        <label><b>上传小说 TXT 文件：</b></label><br>
        <input type="file" id="novel_file" accept=".txt" style="margin:10px 0;">
    </div>
    <label style="display:block;margin:15px 0;">
        <input type="checkbox" id="interactive_mode"> 交互模式（每章弹出 /input 确认）
    </label>
    <button id="import_novel_btn" class="menu_button">🚀 开始导入章节</button>
    <div id="import_status" style="margin-top:15px; font-weight:bold;"></div>
</div>`;

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    Object.assign(settings, extension_settings[extensionName]);
    $("#interactive_mode").prop("checked", settings.interactive_mode);
}

function saveSettings() {
    extension_settings[extensionName] = settings;
    saveSettingsDebounced();
}

// ==================== 章节拆分（支持中文数字） ====================
function splitChapters(text) {
    const regex = /第[一二三四五六七八九十百千零0-9]+[章节话集]/g;
    const chapters = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            chapters.push(text.slice(lastIndex, match.index).trim());
        }
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) chapters.push(text.slice(lastIndex).trim());

    return chapters.filter(c => c.length > 20); // 过滤空/太短章节
}

// ==================== 导入主函数 ====================
async function importNovel() {
    const fileInput = document.getElementById("novel_file");
    if (!fileInput.files[0]) return alert("❌ 请先选择小说 TXT 文件！");

    const text = await fileInput.files[0].text();
    const chapters = splitChapters(text);

    if (chapters.length === 0) return alert("❌ 未检测到任何章节标题！请检查格式");

    const context = getContext();
    const charName = context.character?.name || "{{char}}";
    const statusEl = document.getElementById("import_status");

    for (let i = 0; i < chapters.length; i++) {
        const chapterText = `【第\( {i + 1}章】\n \){chapters[i]}`;
        statusEl.textContent = `正在导入第 \( {i + 1}/ \){chapters.length} 章...`;

        if (settings.interactive_mode) {
            // 你原本想要的斜杠命令交互模式
            const cmd = `/input 请输入{{char}}的动作或台词（第\( {i + 1}章）：| /sendas name= \){charName} {{pipe}}`;
            await context.SlashCommandParser.parseAndExecute(cmd.replace("{{pipe}}", chapterText));
        } else {
            // 直接导入（更快）
            context.chat.push({
                name: charName,
                is_user: false,
                mes: chapterText,
                send_date: Date.now(),
                extra: {}
            });
        }
    }

    context.saveChat();
    printMessages();
    statusEl.innerHTML = `✅ 导入完成！共 ${chapters.length} 章`;
    toastr.success(`成功导入 ${chapters.length} 个章节`, "小说续写助手");
}

// ==================== 初始化 ====================
jQuery(async () => {
    // 注入设置面板
    $("#extensions_settings").append(uiHTML);

    // 样式微调（如果你 style.css 为空也可以加在这里）
    const extraCSS = `
        #novel_importer_settings button { width: 100%; padding: 12px; font-size: 16px; }
        #novel_importer_settings input[type="file"] { width: 100%; }
    `;
    $("<style>").text(extraCSS).appendTo("head");

    // 事件绑定
    $("#interactive_mode").on("change", e => {
        settings.interactive_mode = e.target.checked;
        saveSettings();
    });

    $("#import_novel_btn").on("click", importNovel);

    await loadSettings();
});