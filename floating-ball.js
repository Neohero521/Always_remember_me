import { getExtensionSettings, saveExtensionSettings } from "./utils.js";
import { globalState } from "./config.js";

// 初始化悬浮球
export const initFloatingBall = (togglePanelCallback) => {
  try {
    // 避免重复创建
    if ($('#novel-writer-ball').length > 0) {
      console.log(`[小说续写器] 悬浮球已存在，跳过创建`);
      return;
    }

    // 保存面板切换回调
    globalState.panelToggleCallback = togglePanelCallback;

    // 创建悬浮球DOM（CSS只写基础样式，位置完全由JS控制）
    const ballHtml = `
      <div id="novel-writer-ball" class="novel-writer-ball" title="小说续写器">
        <i class="fa-solid fa-book-open"></i>
      </div>
    `;
    $('body').append(ballHtml);

    // 绑定事件
    bindBallEvents();
    // 恢复保存的位置
    updateBallPosition();

    console.log(`[小说续写器] 悬浮球初始化完成，位置：左下角`);
  } catch (error) {
    console.error(`[小说续写器] 悬浮球初始化失败:`, error);
  }
};

// 绑定悬浮球事件
const bindBallEvents = () => {
  const $ball = $('#novel-writer-ball');
  const settings = getExtensionSettings();
  let startX, startY, originX, originY;

  // 鼠标按下/触摸开始
  $ball.on('mousedown touchstart', (e) => {
    globalState.isDragging = true;
    $ball.addClass('dragging');
    
    const event = e.type === 'touchstart' ? e.touches[0] : e;
    startX = event.clientX;
    startY = event.clientY;
    originX = settings.ballPosition.x;
    originY = settings.ballPosition.y;

    e.preventDefault();
    e.stopPropagation();
  });

  // 鼠标移动/触摸移动
  $(document).on('mousemove touchmove', (e) => {
    if (!globalState.isDragging) return;

    const event = e.type === 'touchmove' ? e.touches[0] : e;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 边界限制，绝对不会跑出屏幕
    let newX = originX + deltaX;
    let newY = originY + deltaY;
    newX = Math.max(20, Math.min(window.innerWidth - 60, newX));
    newY = Math.max(20, Math.min(window.innerHeight - 60, newY));

    // 更新位置
    settings.ballPosition.x = newX;
    settings.ballPosition.y = newY;
    updateBallPosition();
  });

  // 鼠标松开/触摸结束
  $(document).on('mouseup touchend', () => {
    if (!globalState.isDragging) return;
    globalState.isDragging = false;
    $('#novel-writer-ball').removeClass('dragging');
    saveExtensionSettings();
  });

  // 点击悬浮球切换面板
  $ball.on('click', (e) => {
    if (globalState.isDragging) return;
    if (globalState.panelToggleCallback) globalState.panelToggleCallback();
    e.preventDefault();
    e.stopPropagation();
  });
};

// 更新悬浮球位置（唯一控制位置的方法）
export const updateBallPosition = () => {
  try {
    const settings = getExtensionSettings();
    $('#novel-writer-ball').css({
      left: `${settings.ballPosition.x}px`,
      top: `${settings.ballPosition.y}px`,
      right: 'auto',
      bottom: 'auto',
    });
  } catch (error) {
    console.error(`[小说续写器] 更新悬浮球位置失败:`, error);
  }
};

// 窗口大小变化时重新限制边界
window.addEventListener('resize', () => {
  try {
    const settings = getExtensionSettings();
    settings.ballPosition.x = Math.max(20, Math.min(window.innerWidth - 60, settings.ballPosition.x));
    settings.ballPosition.y = Math.max(20, Math.min(window.innerHeight - 60, settings.ballPosition.y));
    updateBallPosition();
    saveExtensionSettings();
  } catch (error) {
    console.error(`[小说续写器] 窗口resize处理失败:`, error);
  }
});
