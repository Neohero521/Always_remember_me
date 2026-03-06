import { extensionBasePath } from "./config.js";
import { getExtensionSettings, saveExtensionSettings } from "./utils.js";

// 初始化功能面板
export const initFunctionPanel = async () => {
  try {
    // 避免重复创建
    if ($('#novel-writer-panel').length > 0) {
      console.log(`[小说续写器] 面板已存在，跳过创建`);
      return;
    }

    // 【关键修复】用完整路径加载HTML，绝对不会404
    const panelInnerHtml = await $.get(`${extensionBasePath}/example.html`);
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

    // 绑定面板事件
    bindPanelEvents();
    console.log(`[小说续写器] 功能面板初始化完成`);
  } catch (error) {
    console.error(`[小说续写器] 面板初始化失败:`, error);
  }
};

// 绑定面板事件
const bindPanelEvents = () => {
  const $panel = $('#novel-writer-panel');
  const $mask = $panel.find('.panel-mask');
  const $closeBtn = $('#panel-close-btn');
  const settings = getExtensionSettings();

  // 关闭按钮
  $closeBtn.on('click', closePanel);
  // 点击遮罩关闭
  $mask.on('click', closePanel);
  // ESC键关闭
  $(document).on('keydown', (e) => {
    if (e.key === 'Escape' && settings.panelOpen) {
      closePanel();
    }
  });

  // 阻止面板内部滚动冒泡
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

// 切换面板
export const togglePanel = () => {
  const settings = getExtensionSettings();
  settings.panelOpen ? closePanel() : openPanel();
};
