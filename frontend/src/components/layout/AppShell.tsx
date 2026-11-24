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
    <div className="flex h-full min-h-screen">
      <aside
        className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-paper-200 px-3 py-5 backdrop-blur-xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(251,250,246,.92) 0%, rgba(238,236,246,.9) 100%)",
        }}
      >
        <div className="mb-6 flex items-center gap-2.5 px-1.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white"
            style={{
              background: "linear-gradient(145deg,#4a6fa5,#6c5a9e)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.4), 0 10px 22px -12px rgba(74,111,165,.9)",
            }}
            aria-hidden
          >
            L
          </span>
          <div>
            <div className="text-[15px] font-bold tracking-tight text-ink-950">
              Learn<span className="text-brand-600">Loop</span>
            </div>
            <div className="text-[11px] text-ink-400">学习与保研规划</div>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mb-4 px-0.5">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索资料 / 错题…"
            className="input !py-1.5 text-xs"
          />
        </form>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ["nav-pill", isActive ? "nav-pill-active" : ""].join(" ")
              }
            >
              <span aria-hidden className="text-[15px]">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-white/60 bg-white/45 px-3 py-3 text-[11px] leading-relaxed text-ink-400 backdrop-blur">
          <div className="flex items-center gap-1.5 text-ink-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            数据存在本机
          </div>
          <div className="mt-1">学习 → 批注 → 错题 → 复习 → 保研</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>

      <MusicPlayer />
    </div>
  );
}
