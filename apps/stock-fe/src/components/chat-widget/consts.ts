export const ASSISTANT_CFG = {
  user: {
    avatar: '/chat-widget/ai-avatar.png',
  },
};

const ASSISTANT_NAME = '龙哥的小跟班鸡宝';

export const CHAT_WIDGET_INITIAL_MESSAGES = [
  {
    type: 'system',
    content: { text: `专属智能客服 ${ASSISTANT_NAME} 为您服务` },
  },
  {
    type: 'text',
    content: {
      text: `Hi，俺是你的专属智能助理 ${ASSISTANT_NAME}，有问题请随时找俺哦~`,
    },
    ...ASSISTANT_CFG,
  },
];
