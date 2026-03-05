/**
 * 初始化工具模块
 */
export function initUtils() {
  // 兼容酒馆全局toastr通知
  if (!window.toastr) {
    window.toastr = {
      success: (msg, title) => console.log(`[成功] ${title || ''} ${msg}`),
      error: (msg, title) => console.error(`[错误] ${title || ''} ${msg}`),
      warning: (msg, title) => console.warn(`[警告] ${title || ''} ${msg}`),
      info: (msg, title) => console.info(`[提示] ${title || ''} ${msg}`)
    };
  }
}

/**
 * 获取当前聊天的角色名称
 * @returns {string} 角色名称
 */
export function getCurrentCharacter() {
  try {
    // 酒馆标准API获取当前角色
    const context = window.SillyTavern?.getContext?.();
    return context?.character?.name || context?.chatId?.split('-')[0] || '';
  } catch (error) {
    console.error('获取角色名称失败', error);
    return '';
  }
}

/**
 * 执行酒馆斜杠命令
 * @param {string} command 要执行的斜杠命令
 */
export async function executeSlashCommand(command) {
  try {
    // 酒馆标准命令执行API
    if (window.SillyTavern?.executeSlashCommand) {
      await window.SillyTavern.executeSlashCommand(command);
    } else {
      // 兼容旧版本，手动注入到输入框并触发发送
      const $input = $('#send_textarea');
      $input.val(command);
      // 触发发送事件
      const enterEvent = new $.Event('keydown');
      enterEvent.key = 'Enter';
      enterEvent.ctrlKey = true;
      $input.trigger(enterEvent);
    }
  } catch (error) {
    console.error('执行命令失败', error);
    throw error;
  }
}
