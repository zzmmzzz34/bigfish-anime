import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0c10] px-5">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
          <div className="text-[15px] font-semibold text-white/80">页面出了点问题</div>
          <div className="mt-2 text-[12px] leading-5 text-white/35">
            {this.state.error.message || '未知错误'}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              刷新页面
            </button>
            <button className="btn" onClick={() => { window.location.href = '/'; }}>
              回首页
            </button>
          </div>
        </div>
      </div>
    );
  }
}
