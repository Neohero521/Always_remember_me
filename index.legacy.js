const { pluginName, pluginDisplayName, pluginVersion } = require('./config.js');
const { initPlugin, registerSettings, registerCommands, registerPanel } = require('./main.js');
const { toast } = require('./toast.js');

(function () {
  'use strict';

  $(document).ready(async function () {
    try {
      console.log(`[${pluginName}] 正在加载兼容模式插件 v${pluginVersion}`);
      
      await registerSettings();
      await registerCommands();
      await registerPanel();
      await initPlugin();

      toast.success(`${pluginDisplayName} 兼容模式加载成功！`);
      console.log(`[${pluginName}] 兼容模式加载完成 v${pluginVersion}`);
    } catch (error) {
      console.error(`[${pluginName}] 兼容模式加载失败`, error);
      toast.error(`${pluginDisplayName} 兼容模式加载失败：${error.message}`);
    }
  });
})();
