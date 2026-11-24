import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import { setUnauthorizedHandler } from "./lib/api";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import MaterialViewerPage from "./pages/MaterialViewerPage";
import ResearchPage from "./pages/ResearchPage";
import ReviewPage from "./pages/ReviewPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import SubjectDetailPage from "./pages/SubjectDetailPage";
import SubjectsPage from "./pages/SubjectsPage";
import { useAuthStore } from "./stores/authStore";

// mind-elixir 体积较大，进入导图页时才加载
const MindMapPage = lazy(() => import("./pages/MindMapPage"));

function PageFallback() {
  return (
    <div className="card px-6 py-14 text-center text-sm text-ink-400">
      加载中…
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-ink-400">正在载入…</div>
    </div>
  );
}

function Workspace() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="subjects/:id" element={<SubjectDetailPage />} />
        <Route path="materials/:id" element={<MaterialViewerPage />} />
        <Route
          path="maps/:id"
          element={
            <Suspense fallback={<PageFallback />}>
              <MindMapPage />
            </Suspense>
          }
        />
        <Route path="review" element={<ReviewPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="research" element={<ResearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.user);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const markSignedOut = useAuthStore((state) => state.markSignedOut);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 任何接口返回 401 都说明会话没了，直接退回登录页
  useEffect(() => {
    setUnauthorizedHandler(markSignedOut);
    return () => setUnauthorizedHandler(null);
  }, [markSignedOut]);

  if (!ready) return <Splash />;
  if (!user) return <LoginPage />;

  // 换账号时用 key 强制重挂载，避免看到上一个账号的缓存数据
  return <Workspace key={user.id} />;
}
