// 全局变量：扩展唯一标识（避免冲突）
const MODULE_NAME = 'always_remember_me';

// 初始化扩展
async function initExtension() {
  // 获取SillyTavern核心上下文
  const context = SillyTavern.getContext();
  const { 
    eventSource, event_types, 
    chat, characterId, characters,
    saveMetadata, SlashCommandParser,
    SlashCommand, SlashCommandNamedArgument,
    ARGUMENT_TYPE, Popup 
  } = context;

  // 等待APP完全就绪后执行初始化
  if (context.appReady) {
    setupUI(); // 初始化导入小说的UI
    registerSlashCommands(); // 注册自定义斜杠命令
  } else {
    eventSource.on(event_types.APP_READY, () => {
      setupUI();
      registerSlashCommands();
    });
  }

  console.log(`[${MODULE_NAME}] 扩展初始化完成`);
}

// 启动扩展
initExtension().catch(err => {
  console.error(`[${MODULE_NAME}] 初始化失败:`, err);
  toastr.error('小说章节导入扩展初始化失败，请查看控制台日志');
});
