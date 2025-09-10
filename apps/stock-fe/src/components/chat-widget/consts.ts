export const ASSISTANT_CFG = {
  user: {
    avatar: '/chat-widget/ai-avatar.png',
  },
};

const ASSISTANT_NAME = 'brooot';

export const CHAT_WIDGET_INITIAL_MESSAGES = [
  {
    type: 'system',
    content: { text: `专属智能助理 ${ASSISTANT_NAME} 为您服务` },
  },
  {
    type: 'text',
    content: {
      text: `Hi，我是你的专属智能助理 ${ASSISTANT_NAME}，有问题请随时找我哦~`,
    },
    ...ASSISTANT_CFG,
  },
];
