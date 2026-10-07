import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/config";
import { Icon, type IconName } from "@/components/ui/Icon";
import { GongRing } from "./GongRing";

export type HomeData = {
  userName: string | null;
  ai: { on: boolean; model: string };
  stats: { minutes: string; persons: number; approved: number; pending: number; lessons: number; chunks: number };
};

const ROLE_CARDS: { key: "learn" | "tutor" | "teach" | "field" | "curate" | "consent"; href: string; icon: IconName }[] = [
  { key: "learn", href: "/learn", icon: "learn" },
  { key: "tutor", href: "/tutor", icon: "tutor" },
  { key: "teach", href: "/teach", icon: "teach" },
  { key: "field", href: "/field", icon: "field" },
  { key: "curate", href: "/curate", icon: "curate" },
  { key: "consent", href: "/consent", icon: "consent" },
];

export function HomeView({ t, data }: { t: Dict; data: HomeData }) {
  const h = t.home;
  const stats = [
    { v: data.stats.minutes, l: h.statMinutes },
    { v: data.stats.persons, l: h.statPersons },
    { v: data.stats.approved, l: h.statApproved },
    { v: data.stats.pending, l: h.statPending },
    { v: data.stats.lessons, l: h.statLessons },
    { v: data.stats.chunks, l: h.statChunks },
  ];
  const navTitle = (k: (typeof ROLE_CARDS)[number]["key"]) => (k === "tutor" ? t.nav.tutorLong : k === "field" ? t.nav.fieldLong : t.nav[k]);

  return (
    <main id="main" className="page home">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <span className="eyebrow">{h.eyebrow}</span>
          <h1 id="hero-title">
            {h.title1}
            <span className="gold">{h.title2}</span>
          </h1>
          <p className="hero-lede">{h.lede}</p>
          <div className="hero-cta">
            <Link className="btn gold lg" href="/learn">
              <Icon name="learn" size={18} />
              {h.ctaLearn}
            </Link>
            {data.userName ? (
              <Link className="btn ghost lg" href="/tutor">
                <Icon name="tutor" size={18} />
                {h.ctaTutor}
              </Link>
            ) : (
              <Link className="btn ghost lg" href="/login">
                <Icon name="login" size={18} />
                {h.ctaLogin}
              </Link>
            )}
          </div>
          <div className="hero-meta">
            {data.userName && <span>{fmt(h.signedInAs, { name: data.userName })}</span>}
            <span className="badge">
              <span className="dot" aria-hidden="true" />
              {data.ai.on ? fmt(h.aiOn, { model: data.ai.model }) : h.aiOff}
            </span>
          </div>
        </div>
        <GongRing caption={h.artCaption} />
      </section>

      <section aria-label={h.statMinutes}>
        <div className="stats-strip">
          {stats.map((s) => (
            <div key={s.l} className="stat">
              <b>{s.v}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
        <p className="stats-foot">
          <span className="live" aria-hidden="true" />
          {t.common.liveCount}
        </p>
      </section>

      <section className="stack-lg" aria-labelledby="roles-title">
        <div className="sec-head">
          <div>
            <h2 id="roles-title">{h.rolesTitle}</h2>
            <p>{h.rolesLede}</p>
          </div>
          <span className="swipe-hint">
            {t.common.swipe}
            <Icon name="arrow" size={16} />
          </span>
        </div>
        <div className="rail-wrap">
          <div className="rail">
            {ROLE_CARDS.map((r) => (
              <Link key={r.key} href={r.href} className="card role-card">
                <div className="role-head">
                  <span className="role-ic">
                    <Icon name={r.icon} size={22} />
                  </span>
                  <span className="who-chip">{h.who[r.key]}</span>
                </div>
                <h3>{navTitle(r.key)}</h3>
                <p>{h.cards[r.key]}</p>
                <span className="go">
                  {t.common.open}
                  <Icon name="arrow" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="flow" aria-labelledby="flow-title">
        <div className="flow-copy">
          <span className="eyebrow">{h.flowEyebrow}</span>
          <h2 id="flow-title">{h.flowTitle}</h2>
          <p>{h.flowLede}</p>
        </div>
        <div>
          <ol className="steps">
            <li>
              <b>{h.steps.record}</b>
              <span>{h.steps.recordD}</span>
            </li>
            <li>
              <b>{h.steps.consent}</b>
              <span>{h.steps.consentD}</span>
            </li>
            <li>
              <b>{h.steps.curate}</b>
              <span>{h.steps.curateD}</span>
            </li>
            <li>
              <b>{h.steps.index}</b>
              <span>{h.steps.indexD}</span>
            </li>
          </ol>
          <p className="revoke-line">
            <Icon name="shield" size={18} />
            {h.revokeNote}
          </p>
        </div>
      </section>

      <p className="demo-note">
        <span className="badge warn">{t.shell.demo}</span>
        <span>{t.shell.demoNote}</span>
      </p>
    </main>
  );
}
