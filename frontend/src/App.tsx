import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import ResearchPage from "./pages/ResearchPage";
import ReviewPage from "./pages/ReviewPage";
import SettingsPage from "./pages/SettingsPage";
import SubjectsPage from "./pages/SubjectsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="subjects" element={<SubjectsPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="research" element={<ResearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
