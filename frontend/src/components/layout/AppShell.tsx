import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import MusicPlayer from "../player/MusicPlayer";
import { useSubjectStore } from "../../stores/subjectStore";

const navItems = [
  { to: "/", label: "主页", icon: "🏠", end: true },
  { to: "/subjects", label: "学科", icon: "📚" },
  { to: "/review", label: "复习计划", icon: "🗓️" },
  { to: "/research", label: "保研", icon: "🎯" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function AppShell() {
  const load = useSubjectStore((state) => state.load);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    void load();
  }, [load]);

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!keyword.trim()) return;
    navigate(`/search?q=${encodeURIComponent(keyword.trim())}`);
  }

  return (
    <div className="flex h-full min-h-screen bg-paper-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-paper-200 bg-white/90 px-3 py-5">
        <div className="mb-5 px-2">
          <div className="text-lg font-bold tracking-tight text-ink-950">
            Learn<span className="text-brand-600">Loop</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">学习与保研规划</p>
        </div>

        <form onSubmit={handleSearch} className="mb-4 px-1">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索资料 / 错题…"
            className="w-full rounded-lg border border-paper-200 px-2.5 py-1.5 text-xs outline-none focus:border-brand-500"
          />
        </form>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-brand-50 font-medium text-brand-600"
                    : "text-ink-600 hover:bg-paper-100",
                ].join(" ")
              }
            >
              <span aria-hidden className="text-base">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-lg bg-paper-100 px-3 py-2.5 text-xs leading-relaxed text-ink-400">
          数据存在本机
          <br />
          学习 + 保研闭环
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>

      <MusicPlayer />
    </div>
  );
}
