"use client";

import { useEffect, useRef, useState } from 'react';
import Chat, { Bubble, Typing, TypingBubble, useMessages, type MessageProps } from '@chatui/core';
import api from '../../utils/api';
import { ASSISTANT_CFG, CHAT_WIDGET_INITIAL_MESSAGES } from './consts';
import * as marked from 'marked';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [sessionId] = useState<string>(() => crypto.randomUUID());

  const { messages, appendMsg, updateMsg, resetList } = useMessages(CHAT_WIDGET_INITIAL_MESSAGES);

  const appendAssistMsg: typeof appendMsg = (msg) => {
    return appendMsg({
      ...msg, ...ASSISTANT_CFG
    })
  }
  const updateAssistMsg: typeof updateMsg = (id, msg) => {
    return updateMsg(id, { ...msg, ...ASSISTANT_CFG })
  }
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const toggle = () => setOpen((v) => !v);

  const renderMessageContent = (msg: MessageProps) => {
    const { type, content } = msg;

    if (type === "userMsg") {
      return <Bubble content={content.text} />
    }
    if (type === 'loading') {
      return <Typing />
    }

    function renderMarkdown(text: string) {
      // 比如可以用 marked 解析 markdown 格式的字符串
      // return marked.parse(text);
      return marked.parse(text) as string;
    }


    // 先处理自定义：订单列表（避免被当作文本渲染）
    if ((content as any)?.__kind === 'orders') {
      const data = (content as any).data as any[];
      return (
        <div className="mt-2 space-y-2 max-h-64 overflow-auto">
          {data?.length ? (
            data.map((o) => (
              <div key={o.id} className="p-2 rounded border bg-white text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{o.symbol}</span>
                  <span className="text-gray-500">{o.status}</span>
                </div>
                <div className="text-gray-600">
                  {o.type} · {o.method} · 价格: {o.price ?? '-'} · 数量: {o.quantity} · 已成交: {o.filledQuantity}
                </div>
                <div className="text-gray-400 text-xs">{new Date(o.createdAt).toLocaleString()}</div>
              </div>
            ))
          ) : (
            <div className="text-gray-500 text-sm">暂无订单</div>
          )}
        </div>
      );
    }

    if (type === 'text') {
      const text = String((content as any)?.text ?? '');
      console.log('===> text: ', text);
      return <TypingBubble options={{ step: 3, interval: 30 }} content={text} isRichText messageRender={renderMarkdown} />
    }
    if (type === 'image') {
      return (
        <Bubble type="image">
          <img src={(content as any).picUrl} alt="" />
        </Bubble>
      );
    }
    return null;
  };

  const send = async (type: string, val: any) => {
    if (type !== 'text') return;
    const text = String(val || '').trim();
    if (!text) return;

    appendMsg({ type: 'userMsg', content: { text }, position: 'right' });

    try {
      setLoading(true);
      const base = api.defaults.baseURL?.replace(/\/$/, '') || '';
      const sseUrl = `${base}/ai/chat/stream?message=${encodeURIComponent(text)}&sessionId=${encodeURIComponent(sessionId)}`;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const assistantId = crypto.randomUUID();
      // 预置空消息，后续增量更新
      appendAssistMsg({
        _id: assistantId, type: 'loading', content: { text: '' } as any
      });
      let assistantText = '';

      const es = new EventSource(sseUrl, { withCredentials: true } as any);
      eventSourceRef.current = es;

      // 处理返回的事件数据
      es.onmessage = (ev) => {
        const data = ev.data;
        if (data === '[DONE]') {
          setLoading(false);
          es.close();
          eventSourceRef.current = null;
          return;
        }

        try {
          // 解析一次
          let obj: any = JSON.parse(data);
          // 兼容后端可能包了一层字符串的情况（双重 JSON）
          if (typeof obj === 'string') {
            try {
              obj = JSON.parse(obj);
            } catch {
              // 不是 JSON，就当作纯文本
              obj = { type: 'text_chunk', data: String(obj) };
            }
          }

          if (obj?.type === 'orders') {
            // 替换成自定义订单消息
            updateAssistMsg(assistantId, {
              type: 'text',
              content: { __kind: 'orders', data: obj.data } as any,
            });
            return;
          }

          // 兼容后端的流式分片格式 { type: 'text_chunk', data: string }
          if (obj?.type === 'text_chunk' && typeof obj.data === 'string') {
            assistantText += obj.data;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
            return;
          }

          // 兼容 OpenAI/DeepSeek 的 delta 片段
          const delta = obj?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            assistantText += delta;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
            return;
          }

          // 其他可识别的直接文本
          if (typeof obj === 'string') {
            assistantText += obj;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
          }
        } catch {
          // 非 JSON 文本（忽略或直接追加）
          if (typeof data === 'string' && data) {
            assistantText += data;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
          }
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        fallbackNonStream(text, assistantId, assistantText);
      };
    } catch (e) {
      console.error(e);
      fallbackNonStream(text);
    }
  };

  const fallbackNonStream = async (text: string, assistantId?: string, curText?: string) => {
    try {
      const resp = await api.post('/ai/chat', { message: text, sessionId });
      const payload = resp.data;
      if (payload?.type === 'orders') {
        if (assistantId) {
          updateAssistMsg(assistantId, { type: 'text', content: { __kind: 'orders', data: payload.data } as any });
        } else {
          appendAssistMsg({ type: 'text', content: { __kind: 'orders', data: payload.data } as any });
        }
      } else {
        const textOut = payload?.data || '';
        if (assistantId) {
          updateAssistMsg(assistantId, { type: 'text', content: { text: (curText || '') + textOut } as any });
        } else {
          appendAssistMsg({ type: 'text', content: { text: textOut } as any });
        }
      }
    } catch (err) {
      if (assistantId) {
        updateAssistMsg(assistantId, { type: 'text', content: { text: '出错了，请稍后再试。' } as any });
      } else {
        appendAssistMsg({ type: 'text', content: { text: '出错了，请稍后再试。' } as any });
      }
    } finally {
      setLoading(false);
    }
  };

  /** 智能体聊天框 */
  const chatBox = <div className="fixed inset-0 z-40 flex items-end justify-end pointer-events-none" style={{ visibility: open ? undefined : 'hidden' }}>
    {/* 背景蒙层 */}
    <div
      className="absolute inset-0 bg-black/30 pointer-events-auto"
      onClick={toggle}
      aria-label="Close chat overlay"
    />

    {/* 右侧抽屉 */}
    <div className="relative w-full sm:w-[420px] h-[70vh] m-4 bg-white rounded-xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="font-medium">智能助理</div>
        <button onClick={toggle} className="text-gray-500 hover:text-gray-700">关闭</button>
      </div>
      <div className="flex-1 min-h-0">
        <Chat
          navbar={{ title: '' }}
          messages={messages as any}
          renderMessageContent={renderMessageContent}
          onSend={send as any}
          placeholder="输入消息..."
        />
      </div>
    </div>
  </div>

  /** 进入图标 */
  const enterIcon = <button
    onClick={toggle}
    className="fixed bottom-[100px] right-6 z-50 rounded-full overflow-hidden  text-white shadow-lg w-[60px] h-[60px] flex items-center justify-center
      border-2 hover:border-gray-700 hover:scale-125 focus:outline-none transform-gpu transition-all  duration-200 ease-out"
    aria-label="Open chat"
  >
    {/* 背景视频层 */}
    <video
      className="relative  inset-0 w-[65px] h-[65px] object-cover z-0 pointer-events-none"
      src="/chat-widget/ai-icon-video.mp4" // 在public中
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
    />
  </button>

  return (
    <>
      {open ? null : enterIcon}
      <>{chatBox}</>
    </>
  );
}
