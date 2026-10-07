import { one } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { llmEnabled, modelLabel } from "@/lib/llm";
import { HomeView } from "@/components/home/HomeView";

export default async function Home() {
  const [user, { t }] = await Promise.all([getUser(), getT()]);
  const n = (sql: string) => one<{ n: number }>(sql)?.n ?? 0;
  return (
    <HomeView
      t={t}
      data={{
        userName: user.id ? user.name : null,
        ai: { on: llmEnabled(), model: modelLabel() },
        stats: {
          minutes: (n("SELECT COALESCE(SUM(duration_s), 0) AS n FROM assets") / 60).toFixed(1),
          persons: n("SELECT COUNT(*) AS n FROM persons"),
          approved: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'approved'"),
          pending: n("SELECT COUNT(*) AS n FROM segments WHERE status = 'pending'"),
          lessons: n("SELECT COUNT(*) AS n FROM lessons"),
          chunks: n("SELECT COUNT(*) AS n FROM kb_chunks"),
        },
      }}
    />
  );
}
