import { levelName } from "@/lib/access";

export function AccessBadge({ level, revoked }: { level: number | null | undefined; revoked?: boolean }) {
  if (revoked) return <span className="badge crit">ถอนความยินยอมแล้ว</span>;
  if (level == null) return <span className="badge">ไม่มีความยินยอม</span>;
  return <span className={`badge l${level}`}>L{level} · {levelName(level)}</span>;
}
