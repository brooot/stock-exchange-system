"use client";

import { useEffect, useRef, useState } from 'react';
import Chat, { Bubble, Button, Flex, Typing, TypingBubble, useMessages, type MessageProps } from '@chatui/core';
import api from '../../utils/api';
import { ASSISTANT_CFG, CHAT_WIDGET_INITIAL_MESSAGES } from './consts';
import * as marked from 'marked';
import { SendMessageType } from './types';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [actedMsgIds, setActedMsgIds] = useState<Set<string>>(new Set());

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

  const markActed = (interruptId: string) => {
    if (!interruptId) return;
    setActedMsgIds(prev => {
      const next = new Set(prev);
      next.add(interruptId);
      return next;
    });
  };

  const sendResumeInfo = (interruptId: string, info: any) => {
    markActed(interruptId);
    send(SendMessageType.RESUME, info)
  }

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

    if (type === 'interrupt') {
      const { interruptInfoList } = content;
      const { value, id: interruptId } = interruptInfoList[0]
      const { interruptType, desc } = value
      const isDisabled = interruptId ? actedMsgIds.has(interruptId) : false;
      console.log('===> interruptType: ', interruptType);
      if (interruptType === 'permission') {
        return <div className="prose prose-sm max-w-none">
          <TypingBubble options={{ step: 3, interval: 30 }} content={desc} isRichText messageRender={renderMarkdown}>
            <Flex justify='space-around'>
              <Button color="primary" disabled={isDisabled} onClick={() => {
                sendResumeInfo(interruptId, { approved: true })
              }}>同意</Button>
              <Button disabled={isDisabled} onClick={() => {
                sendResumeInfo(interruptId, { approved: false })
              }}>拒绝</Button>
            </Flex>
          </TypingBubble>
        </div>
      }

      return <Bubble content={desc} />

    }

    if (type === 'text') {
      const text = String((content as any)?.text ?? '');
      console.log('===> text: ', text);
      return (
        <div className="prose prose-sm max-w-none">
          <TypingBubble options={{ step: 3, interval: 30 }} content={text} isRichText messageRender={renderMarkdown} />
        </div>
      )
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

  const send = async (sendMessageType: SendMessageType, val: any) => {
    if (sendMessageType !== SendMessageType.TEXT && sendMessageType !== SendMessageType.RESUME) return;
    const text = sendMessageType === SendMessageType.TEXT ? String(val || '').trim() : '';
    if (sendMessageType === SendMessageType.TEXT && !text) return;

    if (sendMessageType === SendMessageType.TEXT) {
      appendMsg({ type: 'userMsg', content: { text }, position: 'right' });
    }

    try {
      setLoading(true);
      const base = api.defaults.baseURL?.replace(/\/$/, '') || '';
      let payload: Record<string, any> = sendMessageType === SendMessageType.TEXT
        ? { message: text, sessionId }
        : { sessionId, resume: val };
      payload = {
        ...payload,
        type: sendMessageType,
      }
      const sseUrl = `${base}/ai/chat/stream?payload=${encodeURIComponent(JSON.stringify(payload))}`;

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

      es.onmessage = (ev) => {
        const data = ev.data;
        if (data === '[DONE]') {
          setLoading(false);
          es.close();
          eventSourceRef.current = null;
          return;
        }

        try {
          const obj: any = JSON.parse(data);

          if (obj?.type === 'text_chunk' && typeof obj.data === 'string') {
            assistantText += obj.data;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
            return;
          }

          if (obj?.type === 'interrupt' && obj.data?.length) {
            const interruptInfoList = obj.data;
            updateAssistMsg(assistantId, { type: 'interrupt', content: { interruptInfoList } as any });
            return;
          }

          if (typeof obj === 'string') {
            assistantText += obj;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
          }
        } catch {
          if (typeof data === 'string' && data) {
            assistantText += data;
            updateAssistMsg(assistantId, { type: 'text', content: { text: assistantText } as any });
          }
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
      };
    } catch (e) {
      console.error(e);
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
