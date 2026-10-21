import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { apiGet, apiPost, hashColor, relativeTime } from '../lib/api';
import { useLocalState } from '../lib/hooks';
import { useToast } from './Toast';
import type { Comment } from '../lib/types';

export default function Comments({ commentKey }: { commentKey: string }) {
  const toast = useToast();
  const [list, setList] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [nick, setNick] = useLocalState('bf-nickname', '');
  const [reply, setReply] = useState<Comment | null>(null);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    apiGet<Comment[]>(`/api/comments?key=${encodeURIComponent(commentKey)}`)
      .then((data) => alive && setList(data))
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [commentKey]);

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const item = await apiPost<Comment>('/api/comments', {
        key: commentKey,
        author: nick.trim() || '匿名鱼',
        text: value,
        parentId: reply?.id,
      });
      setList((prev) => [item, ...prev]);
      setText('');
      setReply(null);
      toast('评论已发布', 'success');
    } catch (err: any) {
      toast(err.message || '发送失败', 'error');
    } finally {
      setSending(false);
    }
  };

  const startReply = (c: Comment) => {
    setReply(c);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  return (
    <section className="panel p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold">
        <MessageCircle size={17} className="text-[#ff8a9d]" />
        评论
        <span className="text-[12px] font-normal text-white/35">{list.length}</span>
      </div>

      <div className="flex gap-3">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-black/70"
          style={{ background: hashColor(nick || '匿名鱼') }}
        >
          {(nick || '匿').slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <input
            className="input mb-2 h-9 max-w-[180px] text-[12.5px]"
            placeholder="昵称（可留空）"
            maxLength={24}
            value={nick}
            onChange={(e) => setNick(e.target.value)}
          />
          {reply && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white/55">
              <span className="clamp-1">回复 @{reply.author}：{reply.text}</span>
              <button className="ml-2 shrink-0 text-white/40 hover:text-white" onClick={() => setReply(null)}>
                <X size={13} />
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            className="input min-h-[78px] resize-y text-[13px]"
            placeholder="说点什么…（支持回复，后续可接入弹幕同步）"
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            }}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11.5px] text-white/30">Ctrl / ⌘ + Enter 发送</span>
            <button className="btn btn-primary h-9 px-4 text-[13px]" disabled={sending || !text.trim()} onClick={submit}>
              <Send size={14} />
              发布
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-white/[0.06] pt-4">
        {!loaded && <div className="skeleton h-16 rounded-lg" />}
        {loaded && list.length === 0 && (
          <div className="py-6 text-center text-[12.5px] text-white/30">
            还没有评论，来做第一个留言的人。
          </div>
        )}
        {list.map((c) => (
          <div key={c.id} className="flex gap-3">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-bold text-black/70"
              style={{ background: hashColor(c.author) }}
            >
              {c.author.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[12px] text-white/40">
                <span className="font-medium text-white/75">{c.author}</span>
                <span>{relativeTime(c.createdAt)}</span>
                {c.parentId && <span className="rounded bg-white/10 px-1.5 py-0.5">回复</span>}
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-white/80">
                {c.text}
              </div>
              <button
                className="mt-1 text-[11.5px] text-white/35 hover:text-white/70"
                onClick={() => startReply(c)}
              >
                回复
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
