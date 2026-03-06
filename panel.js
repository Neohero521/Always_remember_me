import { extensionFolderPath } from "./config.js";
import { getExtensionSettings, saveExtensionSettings } from "./utils.js";

// 全局状态
let panelElement = null;

// 初始化功能面板
export const initFunctionPanel = async () => {
  // 避免重复创建
  if ($('#novel-writer-panel').length > 0) {
    panelElement = $('#novel-writer-panel')[0];
    return;
  }

  // 加载面板内部UI结构
  const panelInnerHtml = await $.get(`${extensionFolderPath}/example.html`);
  // 包裹成全局侧边面板（美化后的结构）
  const fullPanelHtml = `
    <div id="novel-writer-panel" class="novel-writer-panel">
      <div class="panel-mask"></div>
      <div class="panel-content">
        <div class="panel-header">
          <div class="panel-title-group">
            <i class="fa-solid fa-book-open panel-title-icon"></i>
            <h2>小说续写器</h2>
          </div>
          <button id="panel-close-btn" class="panel-close-btn" title="关闭面板">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="panel-body">
          ${panelInnerHtml}
        </div>
      </div>
    </div>
  `;
  $('body').append(fullPanelHtml);
  panelElement = $('#novel-writer-panel')[0];

  // 绑定面板事件
  bindPanelEvents();
  console.log(`[小说续写器] 功能面板初始化完成`);
};

// 绑定面板事件
const bindPanelEvents = () => {
  const $panel = $('#novel-writer-panel');
  const $mask = $panel.find('.panel-mask');
  const $closeBtn = $('#panel-close-btn');
  const settings = getExtensionSettings();

  // 关闭按钮点击
  $closeBtn.on('click', closePanel);
  // 点击遮罩关闭面板
  $mask.on('click', closePanel);
  // ESC键关闭面板
  $(document).on('keydown', (e) => {
    if (e.key === 'Escape' && settings.panelOpen) {
      closePanel();
    }
  });

  // 面板内部滚动阻止冒泡
  $('.panel-body').on('scroll wheel touchmove', (e) => {
    e.stopPropagation();
  });
};

// 打开面板
export const openPanel = () => {
  const settings = getExtensionSettings();
  $('#novel-writer-panel').addClass('open');
  settings.panelOpen = true;
  saveExtensionSettings();
};

// 关闭面板
export const closePanel = () => {
  const settings = getExtensionSettings();
  $('#novel-writer-panel').removeClass('open');
  settings.panelOpen = false;
  saveExtensionSettings();
};

// 切换面板显示/隐藏
export const togglePanel = () => {
  const settings = getExtensionSettings();
  settings.panelOpen ? closePanel() : openPanel();
};
