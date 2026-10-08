import { all } from "@/lib/db";
import { ROLE_LEVELS, type Role } from "@/lib/access";
import { getT } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/config";
import { Icon, type IconName } from "@/components/ui/Icon";
import { loginAs } from "./actions";

const ROLE_ICON: Record<Role, IconName> = {
  public: "home",
  student: "learn",
  teacher: "teach",
  collector: "field",
  assistant: "work",
  admin: "admin",
  curator: "curate",
  community: "consent",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const [{ need }, { t }] = await Promise.all([searchParams, getT()]);
  const users = all<{ id: number; name: string; role: Role; title: string | null }>(
    "SELECT id, name, role, title FROM users WHERE active = 1 AND (role != 'student' OR id = 1) ORDER BY CASE role WHEN 'student' THEN 1 WHEN 'teacher' THEN 2 WHEN 'collector' THEN 3 WHEN 'assistant' THEN 4 WHEN 'curator' THEN 5 WHEN 'community' THEN 6 ELSE 7 END",
  );
  return (
    <main id="main" className="page">
      <div className="page-head">
        <span className="eyebrow">{t.login.eyebrow}</span>
        <h1>{t.login.title}</h1>
        <p>{t.login.lede}</p>
      </div>
      {need && (
        <div className="notice warn">
          {fmt(t.login.need, {
            roles: need
              .split(",")
              .map((r) => t.roles[r as Role] ?? r)
              .join(t.login.or),
          })}
        </div>
      )}
      <div className="grid cols-3">
        {users.map((u) => (
          <form key={u.id} action={loginAs} className="card role-card login-card">
            <input type="hidden" name="userId" value={u.id} />
            <div className="role-head">
              <span className="role-ic">
                <Icon name={ROLE_ICON[u.role]} size={22} />
              </span>
              <span className="who-chip">{t.roles[u.role]}</span>
            </div>
            <div>
              <h3>{u.name}</h3>
              {u.title && <p className="xs muted">{u.title}</p>}
            </div>
            <p>{t.roleDesc[u.role]}</p>
            <div className="row xs">
              <span className="muted">{t.login.sees}</span>
              {ROLE_LEVELS[u.role].map((l) => (
                <span key={l} className={`badge l${l}`}>
                  L{l} · {t.levels[l as 1 | 2 | 3 | 4 | 5]}
                </span>
              ))}
            </div>
            <button className="btn block" type="submit">
              {t.login.enter}
              <Icon name="arrow" size={16} />
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
