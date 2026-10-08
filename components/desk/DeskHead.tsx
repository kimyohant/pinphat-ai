import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

export type DeskStat = { value: string | number; label: string; alert?: boolean };
export type DeskTab = { key: string; href: string; label: string; icon?: IconName; count?: number };

/** ส่วนหัวของหน้าหลังบ้าน: แถบครามแบบเดียวกับหน้าแรก ตัวเลขสำคัญของโต๊ะนั้นอยู่บนกระจกด้านขวา */
export function DeskHead({ eyebrow, title, lede, stats = [], children }: { eyebrow: string; title: string; lede?: string; stats?: DeskStat[]; children?: React.ReactNode }) {
  return (
    <header className="desk-head">
      <div className="desk-head-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
        {children && <div className="row">{children}</div>}
      </div>
      {stats.length > 0 && (
        <div className="desk-stats">
          {stats.map((s) => (
            <div key={s.label} className={`desk-stat${s.alert ? " alert" : ""}`}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

/** แท็บลอยใต้แถบคราม ใช้คลาส .tabs ของระบบออกแบบ */
export function DeskTabs({ tabs, active, label }: { tabs: DeskTab[]; active: string; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {tabs.map((x) => (
        <Link key={x.key} href={x.href} aria-current={x.key === active ? "page" : undefined}>
          {x.icon && <Icon name={x.icon} size={16} />}
          {x.label}
          {x.count != null && <span className="count">{x.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** ทางลัดไปยังโต๊ะงานอื่นที่คนคนนี้ต้องดูแล พร้อมจำนวนที่รออยู่ */
export function DeskLinks({ links }: { links: { href: string; label: string; icon: IconName; count?: number }[] }) {
  return (
    <div className="desk-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="card desk-link">
          <span className="ico">
            <Icon name={l.icon} size={20} />
          </span>
          <b>{l.label}</b>
          {l.count != null && <span className={`count${l.count ? "" : " zero"}`}>{l.count}</span>}
        </Link>
      ))}
    </div>
  );
}
