import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { listJobs } from "@/lib/studio";
import { UNSLOTH, unslothEnabled } from "@/lib/unsloth";
import { StudioClient } from "@/components/StudioClient";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";

export default async function StudioPage() {
  await requireRole("teacher", "curator", "collector");
  const { t } = await getT();
  const lessons = all<{ id: number; title: string }>("SELECT id, title FROM lessons ORDER BY id");
  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.studio.eyebrow}</span>
        <h1>{t.studio.title}</h1>
        <p>{t.studio.lede}</p>
        <div className="row xs muted">
          <span className="mono">{fmt(t.studio.modelImage, { m: UNSLOTH.image })}</span>
          <span className="mono">{fmt(t.studio.modelVideo, { m: UNSLOTH.video })}</span>
          <span className="mono">{fmt(t.studio.modelText, { m: UNSLOTH.text })}</span>
        </div>
      </div>
      <StudioClient lessons={lessons} initialJobs={listJobs()} enabled={unslothEnabled()} />
    </main>
  );
}
