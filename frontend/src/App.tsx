import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import MaterialViewerPage from "./pages/MaterialViewerPage";
import ResearchPage from "./pages/ResearchPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import SubjectDetailPage from "./pages/SubjectDetailPage";
import SubjectsPage from "./pages/SubjectsPage";
import SearchPage from "./pages/SearchPage";

// mind-elixir 体积较大，进入导图页时才加载
const MindMapPage = lazy(() => import("./pages/MindMapPage"));

function PageFallback() {
  return (
    <div className="card px-6 py-14 text-center text-sm text-ink-400">
      加载中…
    </div>
  );
}

export default function App() {
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
