# Always Remember Me (小说章节导入扩展)
SillyTavern 扩展，支持导入小说文本并自动拆分章节，通过自定义斜杠命令将章节内容导入聊天对话框。

## 功能
1. 粘贴小说文本自动拆分章节（支持“第X章”“章节X”等常见格式）
2. 自定义斜杠命令 `/import-chapter` 直接导入章节内容
3. 斜杠命令 `/input` 快速生成角色动作/台词指令并调用 `/sendas`
4. 一键导入选中章节到当前聊天对话框

## 安装
1. 将本扩展文件夹放入 SillyTavern 的 `data/<user-handle>/extensions` 目录
2. 或放入 `/scripts/extensions/third-party` 目录（全局生效）
3. 打开 SillyTavern → 扩展管理 → 启用“Always Remember Me (小说章节导入)”

## 使用
1. 在聊天界面点击“导入小说”按钮
2. 粘贴小说文本，点击确定后选择要导入的章节
3. 或直接使用斜杠命令：
   - `/import-chapter 章节内容`：直接导入指定内容到对话框
   - `/input 请输入{{char}}的动作或台词：`：生成角色指令并执行

## 自定义
- 可修改扩展设置中的 `chapterRegex` 正则表达式，适配不同小说章节格式
- 支持调整样式文件自定义按钮/弹窗外观

## 注意事项
- 确保小说文本格式符合正则匹配规则，否则可能无法拆分章节
- 扩展仅在 SillyTavern 客户端运行，无需服务端插件
