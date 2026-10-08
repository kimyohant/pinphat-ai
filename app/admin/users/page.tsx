import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { fmtDate } from "@/lib/i18n/config";
import { PROVINCES, type Role } from "@/lib/access";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";
import { createSchool, createUser, setActive, updateUser } from "../actions";

type U = { id: number; name: string; role: Role; school_id: number | null; class_name: string | null; title: string | null; active: number; last_login: string | null };
const ROLES: Role[] = ["student", "teacher", "collector", "assistant", "curator", "community", "admin"];

export default async function UsersPage() {
  const me = await requireRole("admin");
  const { t, locale } = await getT();
  const users = all<U>(`
    SELECT u.*, (SELECT MAX(at) FROM audit_log l WHERE l.user_id = u.id AND l.action = 'login') AS last_login
    FROM users u ORDER BY u.active DESC, CASE u.role WHEN 'admin' THEN 0 WHEN 'curator' THEN 1 WHEN 'assistant' THEN 2 WHEN 'collector' THEN 3 WHEN 'community' THEN 4 WHEN 'teacher' THEN 5 ELSE 6 END, u.name`);
  const schools = all<{ id: number; name: string; province: string | null; students: number; teachers: number }>(`
    SELECT s.*, (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'student' AND u.active = 1) AS students,
                (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'teacher' AND u.active = 1) AS teachers
    FROM schools s ORDER BY s.name`);

  const SchoolSelect = ({ id, value }: { id: string; value: number | null }) => (
    <select id={id} name="schoolId" defaultValue={value ?? ""} aria-label={t.admin.school}>
      <option value="">{t.admin.noSchool}</option>
      {schools.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const RoleSelect = ({ id, value, disabled }: { id: string; value: Role; disabled?: boolean }) => (
    <select id={id} name="role" defaultValue={value} aria-label={t.admin.role} disabled={disabled}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {t.roles[r]}
        </option>
      ))}
    </select>
  );

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.admin.eyebrow}
        title={t.admin.tabUsers}
        lede={t.admin.demoNote}
        stats={[
          { value: users.filter((u) => u.active).length, label: t.admin.active },
          { value: users.filter((u) => !u.active).length, label: t.admin.inactive },
          { value: schools.length, label: t.admin.schoolsTitle },
          { value: schools.reduce((a, s) => a + s.students, 0), label: t.admin.students },
        ]}
      />
      <AdminTabs t={t} active="users" role={me.role} />

      <div className="split">
        <section className="stack">
          <h2>{t.admin.usersTitle}</h2>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>{t.admin.name}</th>
                  <th>{t.admin.role}</th>
                  <th>{t.admin.school}</th>
                  <th>{t.admin.lastLogin}</th>
                  <th>{t.admin.status}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === me.id;
                  return (
                    <tr key={u.id} style={u.active ? undefined : { opacity: 0.6 }}>
                      <td colSpan={3}>
                        <form action={updateUser} className="row" style={{ flexWrap: "wrap" }}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input name="name" type="text" defaultValue={u.name} aria-label={t.admin.name} style={{ flex: "1 1 140px", width: "auto" }} />
                          <RoleSelect id={`role-${u.id}`} value={u.role} disabled={self} />
                          <SchoolSelect id={`school-${u.id}`} value={u.school_id} />
                          <input name="className" type="text" defaultValue={u.class_name ?? ""} placeholder={t.admin.className} aria-label={t.admin.className} style={{ width: 90 }} />
                          <input name="title" type="text" defaultValue={u.title ?? ""} placeholder={t.admin.titleField} aria-label={t.admin.titleField} style={{ flex: "1 1 140px", width: "auto" }} />
                          <button className="btn ghost sm" type="submit">
                            {t.admin.save}
                          </button>
                        </form>
                      </td>
                      <td className="xs">{u.last_login ? fmtDate(u.last_login, locale) : t.admin.never}</td>
                      <td>
                        {self ? (
                          <span className="xs muted" title={t.admin.selfNote}>
                            {t.admin.active}
                          </span>
                        ) : (
                          <form action={setActive.bind(null, u.id, !u.active)}>
                            <button className={`btn sm ${u.active ? "danger" : "ghost"}`} type="submit">
                              {u.active ? t.admin.deactivate : t.admin.activate}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="xs muted">{t.admin.selfNote}</p>
        </section>

        <aside className="stack-lg">
          <form action={createUser} className="card stack">
            <h3>{t.admin.newUser}</h3>
            <label>
              {t.admin.name}
              <input id="new-name" name="name" type="text" required />
            </label>
            <label>
              {t.admin.role}
              <RoleSelect id="new-role" value="teacher" />
            </label>
            <label>
              {t.admin.school}
              <SchoolSelect id="new-school" value={null} />
            </label>
            <div className="grid cols-2">
              <label>
                {t.admin.className}
                <input id="new-class" name="className" type="text" />
              </label>
              <label>
                {t.admin.titleField}
                <input id="new-title" name="title" type="text" />
              </label>
            </div>
            <button className="btn" type="submit">
              {t.admin.create}
            </button>
          </form>

          <section className="card stack">
            <h3>{t.admin.schoolsTitle}</h3>
            {schools.map((s) => (
              <div key={s.id} className="row between small">
                <span>
                  {s.name} <span className="muted">· {s.province}</span>
                </span>
                <span className="xs muted">
                  {t.admin.students} {s.students} · {t.admin.teachers} {s.teachers}
                </span>
              </div>
            ))}
            <form action={createSchool} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <label>
                {t.admin.newSchool}
                <input id="school-name" name="name" type="text" required />
              </label>
              <label>
                {t.admin.province}
                <select id="school-province" name="province" defaultValue={PROVINCES[0]}>
                  {PROVINCES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <button className="btn ghost" type="submit">
                {t.admin.newSchool}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
