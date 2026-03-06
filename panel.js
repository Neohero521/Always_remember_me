import { extensionBasePath } from "./config.js";
import { getExtensionSettings, saveExtensionSettings } from "./utils.js";

// 初始化面板
export const initFunctionPanel = async () => {
  if ($('#novel-writer-panel').length > 0) return;

  // 【关键修复】用完整路径加载HTML，避免404
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
          <button id="panel-close-btn" class="panel-close-btn" title="关闭">
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

  // 绑定关闭事件
  bindPanelEvents();
  console.log(`[小说续写器] 功能面板初始化完成`);
};

// 绑定面板事件
const bindPanelEvents = () => {
  const $panel = $('#novel-writer-panel');
  const $mask = $panel.find('.panel-mask');
  const $closeBtn = $('#panel-close-btn');

  $closeBtn.on('click', closePanel);
  $mask.on('click', closePanel);
  $(document).on('keydown', (e) => {
    if (e.key === 'Escape' && getExtensionSettings().panelOpen) closePanel();
  });

  $('.panel-body').on('scroll wheel touchmove', (e) => e.stopPropagation());
};

export const openPanel = () => {
  const settings = getExtensionSettings();
  $('#novel-writer-panel').addClass('open');
  settings.panelOpen = true;
  saveExtensionSettings();
};

export const closePanel = () => {
  const settings = getExtensionSettings();
  $('#novel-writer-panel').removeClass('open');
  settings.panelOpen = false;
  saveExtensionSettings();
};

export const togglePanel = () => {
  getExtensionSettings().panelOpen ? closePanel() : openPanel();
};
