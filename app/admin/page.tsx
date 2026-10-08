import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { INTL_LOCALE, fmt, fmtDateTime } from "@/lib/i18n/config";
import { pct } from "@/lib/format";
import { aiStatus, humanSize, kpis, ops, storage, type Kpi } from "@/lib/admin";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead, DeskLinks } from "@/components/desk/DeskHead";
import { Icon } from "@/components/ui/Icon";
import { runBackup } from "./actions";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ backup?: string }> }) {
  const user = await requireRole("admin", "curator");
  const { backup } = await searchParams;
  const { t, locale } = await getT();
  const num = (v: number) => v.toLocaleString(INTL_LOCALE[locale], { maximumFractionDigits: 2 });
  const k = kpis();
  const o = ops();
  const ai = await aiStatus();
  const st = user.role === "admin" ? storage() : null;
  const M = t.admin as Record<string, string>;
  const KIND: Record<string, string> = { text: t.admin.kindText, image: t.admin.kindImage, video: t.admin.kindVideo };

  const KpiCards = ({ items }: { items: Kpi[] }) => (
    <div className="kpi-grid">
      {items.map((x) => {
        const p = x.target ? Math.min(1, x.value / x.target) : 0;
        return (
          <div key={x.key} className="card kpi">
            <span className="label">{M[x.key]}</span>
            <div className="value">
              <b>{num(x.value)}</b>
              <span>/ {num(x.target)}</span>
            </div>
            <div className={`meter${p >= 1 ? " done" : ""}`} role="img" aria-label={pct(p)}>
              <i style={{ width: `${p * 100}%` }} />
            </div>
            <span className="pct">{pct(p)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.admin.eyebrow}
        title={t.admin.title}
        lede={t.admin.lede}
        stats={[
          { value: o.open, label: t.admin.oOpen },
          { value: o.overdue, label: t.admin.oOverdue, alert: o.overdue > 0 },
          { value: o.pending, label: t.admin.oPending },
          { value: o.editRate == null ? "-" : pct(o.editRate), label: t.admin.oEditRate },
        ]}
      />
      <AdminTabs t={t} active="overview" role={user.role} />
      {backup && <div className="notice ok">{fmt(t.admin.backupDone, { file: backup })}</div>}

      <DeskLinks
        links={[
          { href: "/work", label: t.nav.work, icon: "work", count: o.open },
          { href: "/curate", label: t.work.queueLink, icon: "curate", count: o.pending },
          { href: "/gaps", label: t.work.gapsLink, icon: "gap", count: o.gaps },
          { href: "/consent/requests", label: t.work.requestsLink, icon: "consent", count: o.requests },
        ]}
      />

      <section className="stack">
        <div className="sec-head">
          <div>
            <span className="eyebrow">
              <span className="live" aria-hidden="true" /> {t.common.liveCount}
            </span>
            <h2>{t.admin.kpiTitle}</h2>
            <p className="small">{t.admin.kpiLede}</p>
          </div>
          <a className="btn ghost sm" href="/api/admin/report">
            <Icon name="arrow" size={16} />
            {t.admin.exportCsv}
          </a>
        </div>
        <h3 className="section-title">{t.admin.kOutput}</h3>
        <KpiCards items={k.filter((x) => x.group === "output")} />
        <h3 className="section-title">{t.admin.kOutcome}</h3>
        <KpiCards items={k.filter((x) => x.group === "outcome")} />
      </section>

      <div className="grid cols-2">
        <section className="card">
          <h3>{t.admin.aiTitle}</h3>
          <div className={`status-line ${!ai.configured ? "" : ai.reachable ? "ok" : "crit"}`}>
            <span className="dot" />
            {!ai.configured ? t.admin.aiOff : ai.reachable ? t.admin.aiOk : t.admin.aiDown}
            {ai.generating && <span className="badge warn">{fmt(t.admin.aiGen, { kind: KIND[ai.generating] })}</span>}
          </div>
          <div className="model-list" aria-label={t.admin.aiLoaded}>
            {(["text", "image", "video"] as const).map((kind) => (
              <div key={kind} className={ai.loaded === kind ? "on" : undefined}>
                <b>{KIND[kind]}</b>
                <code>{ai.models[kind]}</code>
                {ai.loaded === kind ? <span className="badge ok">GPU</span> : <span />}
              </div>
            ))}
          </div>
          <p className="xs muted">{ai.busy ? fmt(t.admin.aiBusy, { job: ai.busy }) : t.admin.aiIdle}</p>
        </section>

        {st ? (
          <section className="card">
            <div className="row between">
              <h3>{t.admin.backupTitle}</h3>
              <form action={runBackup}>
                <button className="btn sm" type="submit">
                  <Icon name="shield" size={16} />
                  {t.admin.backupNow}
                </button>
              </form>
            </div>
            <p className="small muted">{t.admin.backupLede}</p>
            <div className="row">
              <span className="badge">{fmt(t.admin.dbSize, { size: humanSize(st.db) })}</span>
              <span className="badge">{fmt(t.admin.mediaSize, { size: humanSize(st.media) })}</span>
            </div>
            {st.backups.length === 0 ? (
              <div className="notice warn">{t.admin.backupNone}</div>
            ) : (
              <div className="model-list" aria-label={t.admin.backups}>
                {st.backups.map((b, i) => (
                  <div key={b.file} className={i === 0 ? "on" : undefined}>
                    <b>{humanSize(b.size)}</b>
                    <code>{b.file}</code>
                    <span className="xs muted">{fmtDateTime(b.at, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="card">
            <h3>{t.admin.opsTitle}</h3>
            <p className="small">
              {t.admin.oConsents} {o.consents} · {t.admin.oRevoked} {o.revoked}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
