import { getUser } from "@/lib/auth";
import { ROLE_LEVELS } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { llmEnabled, modelLabel, provider } from "@/lib/llm";
import { TutorChat } from "@/components/TutorChat";

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const user = await getUser();
  const { t, locale } = await getT();
  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.tutor.eyebrow}</span>
        <h1>{t.tutor.title}</h1>
        <p>{t.tutor.lede}</p>
        <div className="row xs">
          <span className="badge l2">
            {fmt(t.tutor.youSee, { levels: ROLE_LEVELS[user.role].map((l) => t.levels[l as 1 | 2 | 3 | 4 | 5]).join(", "), role: t.roles[user.role] })}
          </span>
          <span className={`badge ${llmEnabled() ? "ok" : "warn"}`}>
            {llmEnabled() ? fmt(t.tutor.model, { model: modelLabel(), host: provider() === "unsloth" ? t.tutor.hostUnsloth : "Claude" }) : t.tutor.retrievalOnly}
          </span>
        </div>
      </div>
      {locale !== "th" && <div className="notice small">{t.tutor.answerLang}</div>}
      <TutorChat initial={q} />
    </main>
  );
}
