import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Fish, Loader2, LockKeyhole } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

type Phase = 'checking' | 'login' | 'ready' | 'error';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let alive = true;
    apiGet<{ enabled: boolean; authed: boolean }>('/api/auth/status')
      .then((s) => {
        if (!alive) return;
        setPhase(!s.enabled || s.authed ? 'ready' : 'login');
      })
      .catch((err) => {
        if (!alive) return;
        setMessage(err instanceof Error ? err.message : '无法连接服务');
        setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await apiPost('/api/auth/login', { user, pass });
      setPhase('ready');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'ready') return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f] px-5">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(620px 420px at 50% -10%, rgba(255,77,109,.16), transparent 65%), radial-gradient(500px 400px at 90% 100%, rgba(139,123,255,.10), transparent 65%)',
        }}
      />
      <div className="relative w-full max-w-[360px]">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#ff4d6d]/25 bg-[#ff4d6d]/10">
            <Fish size={20} className="text-[#ff8a9d]" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-wide">大肥鱼番剧</div>
            <div className="text-[11px] text-white/35">BIGFISH ANIME</div>
          </div>
        </div>

        {phase === 'checking' ? (
          <div className="flex items-center gap-2 text-[13px] text-white/50">
            <Loader2 size={16} className="animate-spin" />
            正在连接…
          </div>
        ) : phase === 'error' ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[14px] text-white/70">{message || '无法连接服务'}</div>
            <p className="mt-2 text-[12px] leading-5 text-white/35">
              确认电脑上的大肥鱼服务已经启动，再点重试。
            </p>
            <button
              className="btn mt-4"
              onClick={() => {
                setPhase('checking');
                setMessage('');
                apiGet<{ enabled: boolean; authed: boolean }>('/api/auth/status')
                  .then((s) => setPhase(!s.enabled || s.authed ? 'ready' : 'login'))
                  .catch((err) => {
                    setMessage(err instanceof Error ? err.message : '无法连接服务');
                    setPhase('error');
                  });
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
              <LockKeyhole size={16} className="text-[#ff8a9d]" />
              登录
            </div>
            <p className="mb-5 text-[12px] leading-5 text-white/35">
              输入 config.env 里设置的 AUTH_USER / AUTH_PASS。
            </p>

            <label className="mb-1.5 block text-[11px] text-white/40">用户名</label>
            <input
              className="field mb-3"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="bigfish"
            />

            <label className="mb-1.5 block text-[11px] text-white/40">密码</label>
            <input
              className="field mb-4"
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />

            {message && <div className="mb-3 text-[12px] text-[#ff9aab]">{message}</div>}

            <button
              type="submit"
              disabled={busy || !user || !pass}
              className="btn btn-primary w-full justify-center disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {busy ? '登录中…' : '进入'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-[10.5px] text-white/25">
          公共入口仅自己使用 · 不要分享密码
        </p>
      </div>
    </div>
  );
}
