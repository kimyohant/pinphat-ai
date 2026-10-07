import { getT } from "@/lib/i18n/server";

export async function AccessBadge({ level, revoked }: { level: number | null | undefined; revoked?: boolean }) {
  const { t } = await getT();
  if (revoked) return <span className="badge crit">{t.levels.revoked}</span>;
  if (level == null) return <span className="badge">{t.levels.noConsent}</span>;
  const name = t.levels[level as 1 | 2 | 3 | 4 | 5] ?? t.levels.unknown;
  return (
    <span className={`badge l${level}`} title={t.levelDesc[level as 1 | 2 | 3 | 4 | 5]}>
      L{level} · {name}
    </span>
  );
}
