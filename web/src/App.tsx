import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import SearchPage from './pages/Search';
import Detail from './pages/Detail';
import Catalog from './pages/Catalog';
import Player from './pages/Player';
import Library from './pages/Library';
import Sources from './pages/Sources';
import Airing from './pages/Airing';
import Schedule from './pages/Schedule';
import Ranking from './pages/Ranking';

function ScrollTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname, search]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <div className="app-shell">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'radial-gradient(900px 500px at 14% -8%, rgba(255,77,109,0.10), transparent 62%), radial-gradient(800px 500px at 94% 4%, rgba(139,123,255,0.09), transparent 60%), radial-gradient(700px 600px at 60% 100%, rgba(255,154,98,0.05), transparent 60%)',
          }}
        />
        <ScrollTop />
        <Sidebar />

        <div className="app-body">
          <Header />
          <main className="relative z-10">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/airing" element={<Airing />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/catalog/:id" element={<Catalog />} />
              <Route path="/detail/:sourceId/:vodId" element={<Detail />} />
              <Route path="/play/:sourceId/:vodId/:line/:ep" element={<Player />} />
              <Route path="/library" element={<Library />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <footer className="relative z-10 mt-20 border-t border-white/[0.06] py-9">
            <div className="container-page flex flex-col items-start justify-between gap-3 text-[12px] text-white/30 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-white/50">🐟 大肥鱼番剧</span>
                <span className="text-white/15">/</span>
                <span>不存储任何视频文件，内容来自用户自行配置的第三方接口</span>
                <span className="text-white/15">/</span>
                <span>评分与放送数据来自 B 站番剧</span>
              </div>
              <span>为故事停留 · v0.8.0</span>
            </div>
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
