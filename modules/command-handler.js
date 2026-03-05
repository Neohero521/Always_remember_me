export function registerCommands() {
  registerSlashCommand({
    name: 'input',
    description: '将指定内容填充到输入框，支持管道传递',
    handler: (args, value) => {
      const inputContent = args.join(' ') || value;
      if (!inputContent) {
        toast.warning('/input 命令需要指定内容');
        return;
      }
      const formattedContent = inputContent.replace(/\\n/g, '\n');
      $('#send_textarea').val(formattedContent).trigger('input');
      return formattedContent;
    }
  });

  registerSlashCommand({
    name: 'sendas',
    description: '以指定角色身份发送消息，格式：/sendas name=角色名 消息内容，支持管道输入',
    handler: (args, value) => {
      const nameMatch = args.find(arg => arg.startsWith('name='));
      const charName = nameMatch ? nameMatch.replace('name=', '') : getContext().character?.name;
      if (!charName) {
        toast.error('/sendas 命令需要指定name参数，或当前已选择角色');
        return;
      }
      const messageContent = value || args.filter(arg => !arg.startsWith('name=')).join(' ');
      if (!messageContent) {
        toast.warning('/sendas 命令需要指定消息内容');
        return;
      }
      sendMessage(charName, messageContent.trim());
      return messageContent;
    }
  });

  console.log('小说续写助手斜杠命令注册完成');
}
