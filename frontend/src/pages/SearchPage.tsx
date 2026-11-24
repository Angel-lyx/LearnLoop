import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { searchApi, type SearchResult } from "../lib/api";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [keyword, setKeyword] = useState(initial);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = params.get("q")?.trim() ?? "";
    if (!q) {
      setResult(null);
      return;
    }
    setLoading(true);
    searchApi
      .query(q)
      .then((data) => {
        setResult(data);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "搜索失败"),
      )
      .finally(() => setLoading(false));
  }, [params]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setParams(keyword.trim() ? { q: keyword.trim() } : {});
  }

  const total = result
    ? result.subjects.length +
      result.materials.length +
      result.mistakes.length +
      result.maps.length
    : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-950">搜索</h1>
        <p className="mt-1 text-sm text-ink-400">跨学科、资料、错题与导图检索</p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="输入关键词，例如：极限"
          className="min-w-0 flex-1 input text-sm outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          搜索
        </button>
      </form>

      {loading && <p className="text-sm text-ink-400">搜索中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && !loading && (
        <div className="space-y-4">
          <p className="text-xs text-ink-400">共找到 {total} 条结果</p>

          <Section title="学科" count={result.subjects.length}>
            {result.subjects.map((item) => (
              <Link
                key={item.id}
                to={`/subjects/${item.id}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-800 hover:bg-paper-100"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </Link>
            ))}
          </Section>

          <Section title="资料" count={result.materials.length}>
            {result.materials.map((item) => (
              <Link
                key={item.id}
                to={`/materials/${item.id}`}
                className="block rounded-lg px-3 py-2 text-sm text-ink-800 hover:bg-paper-100"
              >
                {item.title}
              </Link>
            ))}
          </Section>

          <Section title="错题" count={result.mistakes.length}>
            {result.mistakes.map((item) => (
              <Link
                key={item.id}
                to={`/subjects/${item.subject_id}?tab=mistakes`}
                className="block rounded-lg px-3 py-2 text-sm text-ink-800 hover:bg-paper-100"
              >
                {item.question}
              </Link>
            ))}
          </Section>

          <Section title="导图" count={result.maps.length}>
            {result.maps.map((item) => (
              <Link
                key={item.id}
                to={`/maps/${item.id}`}
                className="block rounded-lg px-3 py-2 text-sm text-ink-800 hover:bg-paper-100"
              >
                {item.title}
              </Link>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="card p-3">
      <h2 className="px-2 pb-1 text-xs font-medium text-ink-400">
        {title}（{count}）
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}
