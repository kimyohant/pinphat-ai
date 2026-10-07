"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Role } from "@/lib/access";
import { useT } from "@/lib/i18n/client";
import { NAV, TABS_BY_ROLE, isActive, navFor, navLabel, type NavKey } from "@/lib/nav";
import { Icon } from "@/components/ui/Icon";
import { Brand } from "./Brand";
import { LangQuickToggle, LangSegment, ThemeQuickToggle, ThemeSegment } from "./Prefs";

export type ShellUser = { id: number; name: string; role: Role };

function initials(name: string) {
  // ชื่อไทยไม่มีตัวพิมพ์ใหญ่ ใช้อักษรแรกของคำแรกที่ไม่ใช่คำนำหน้า
  const words = name.replace(/^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.|ครู|อ\.|ผศ\.|รศ\.|ดร\.)\s*/u, "").split(/\s+/);
  return (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "");
}

function Account({ user, signOut }: { user: ShellUser; signOut: () => Promise<void> }) {
  const { t } = useT();
  if (!user.id) {
    return (
      <Link href="/login" className="btn primary block">
        <Icon name="login" size={18} />
        {t.shell.signIn}
      </Link>
    );
  }
  return (
    <div className="account">
      <span className="avatar" aria-hidden="true">
        {initials(user.name)}
      </span>
      <span className="account-who">
        <b>{user.name}</b>
        <small>{t.roles[user.role]}</small>
      </span>
      <form action={signOut}>
        <button className="icon-btn" type="submit" aria-label={t.shell.signOut} title={t.shell.signOut}>
          <Icon name="logout" size={18} />
        </button>
      </form>
    </div>
  );
}

/** แถบข้างบนจอกว้าง */
export function Sidebar({ user, signOut }: { user: ShellUser; signOut: () => Promise<void> }) {
  const { t } = useT();
  const path = usePathname();
  const items = navFor(user.role);
  const groups = [
    { id: "learn", label: t.shell.groupLearn, items: items.filter((i) => i.group === "learn") },
    { id: "work", label: t.shell.groupWork, items: items.filter((i) => i.group === "work") },
  ].filter((g) => g.items.length);
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand" aria-label="Pinphat AI">
        <Brand tagline={t.shell.tagline} />
      </Link>
      <nav aria-label={t.shell.mainNav} className="side-nav">
        {groups.map((g) => (
          <div key={g.id} className="side-group">
            <span className="side-label">{g.label}</span>
            {g.items.map((i) => {
              const on = isActive(path, i.href);
              return (
                <Link key={i.key} href={i.href} className="side-link" aria-current={on ? "page" : undefined}>
                  <Icon name={i.key} />
                  <span>{navLabel(t, i.key, true)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-prefs">
          <span className="side-label">{t.shell.settings}</span>
          <LangSegment />
          <ThemeSegment />
        </div>
        <Account user={user} signOut={signOut} />
      </div>
    </aside>
  );
}

/** หัวจอบนมือถือ: ชื่อระบบ ภาษา และโหมดสี อยู่ในระยะนิ้วโป้งเท่าที่จำเป็น */
export function MobileHeader() {
  const { t } = useT();
  return (
    <header className="m-header">
      <Link href="/" aria-label="Pinphat AI" className="m-brand">
        <Brand tagline={t.shell.tagline} />
      </Link>
      <div className="m-actions">
        <LangQuickToggle />
        <ThemeQuickToggle />
      </div>
    </header>
  );
}

/** แถบล่างบนมือถือ: 4 ปลายทางตามบทบาท และปุ่มเพิ่มเติม */
export function TabBar({ user, signOut }: { user: ShellUser; signOut: () => Promise<void> }) {
  const { t, locale } = useT();
  const path = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  const tabs: NavKey[] = TABS_BY_ROLE[user.role];
  const rest = navFor(user.role).filter((i) => !tabs.includes(i.key));
  const moreOn = rest.some((i) => isActive(path, i.href));

  // ปิดแผ่นเมื่อเปลี่ยนหน้า ไม่อย่างนั้นแผ่นค้างทับหน้าใหม่
  useEffect(() => {
    sheet.current?.close();
  }, [path]);

  return (
    <>
      <nav className="tabbar" aria-label={t.shell.mainNav}>
        {tabs.map((k) => {
          const item = NAV.find((n) => n.key === k)!;
          const on = isActive(path, item.href);
          return (
            <Link key={k} href={item.href} aria-current={on ? "page" : undefined}>
              <span className="tab-ic">
                <Icon name={k} size={22} />
              </span>
              <span className="tab-label">{navLabel(t, k)}</span>
            </Link>
          );
        })}
        <button type="button" aria-haspopup="dialog" aria-current={moreOn ? "page" : undefined} onClick={() => sheet.current?.showModal()}>
          <span className="tab-ic">
            <Icon name="more" size={22} />
          </span>
          <span className="tab-label">{t.shell.more}</span>
        </button>
      </nav>

      <dialog
        ref={sheet}
        className="sheet"
        aria-label={t.shell.more}
        onClick={(e) => {
          // แตะพื้นหลังมืดเพื่อปิด
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="sheet-body">
          <div className="sheet-grip" aria-hidden="true" />
          <div className="row between">
            <h2 className="sheet-title">{t.shell.more}</h2>
            <button type="button" className="icon-btn" aria-label={t.shell.close} onClick={() => sheet.current?.close()}>
              <Icon name="close" />
            </button>
          </div>
          {rest.length > 0 && (
            <div className="sheet-grid">
              {rest.map((i) => (
                <Link key={i.key} href={i.href} className="sheet-tile" aria-current={isActive(path, i.href) ? "page" : undefined}>
                  <Icon name={i.key} size={22} />
                  <span>{navLabel(t, i.key, true)}</span>
                </Link>
              ))}
            </div>
          )}
          <div className="sheet-sec">
            <span className="side-label">{t.shell.language}</span>
            <LangSegment />
          </div>
          <div className="sheet-sec">
            <span className="side-label">{t.shell.theme}</span>
            <ThemeSegment />
          </div>
          {locale !== "th" && <p className="sheet-note">{t.shell.contentNote}</p>}
          <Account user={user} signOut={signOut} />
        </div>
      </dialog>
    </>
  );
}
