import { getUser } from "@/lib/auth";
import { ROLE_LEVELS } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { llmEnabled, modelLabel } from "@/lib/llm";
import { TutorChat } from "@/components/TutorChat";
import "./tutor.css";

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, user, { t }] = await Promise.all([searchParams, getUser(), getT()]);
  const meta = {
    levels: ROLE_LEVELS[user.role].map((l) => ({ level: l, name: t.levels[l as 1 | 2 | 3 | 4 | 5] })),
    role: t.roles[user.role],
    model: llmEnabled() ? modelLabel() : null,
  };
  return (
    <main id="main" className="tutor-page">
      <TutorChat initial={q} meta={meta} />
    </main>
  );
}
