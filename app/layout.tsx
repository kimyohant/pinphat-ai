import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai_Looped, Noto_Sans_Lao, Noto_Serif_Thai } from "next/font/google";
import { getUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/access";
import { NavLinks } from "@/components/NavLinks";
import { logout } from "./login/actions";
import "./globals.css";

const body = IBM_Plex_Sans_Thai_Looped({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600"], variable: "--f-body" });
const display = Noto_Serif_Thai({ subsets: ["thai", "latin"], weight: ["500", "700"], variable: "--f-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });
const lao = Noto_Sans_Lao({ subsets: ["lao"], weight: ["500"], variable: "--f-lao" });

export const metadata: Metadata = {
  title: "Pinphat AI",
  description: "แพลตฟอร์มปัญญาประดิษฐ์เพื่อการอนุรักษ์ ถ่ายทอด และส่งเสริมการเรียนรู้ดนตรีพิณพาทย์ล้านช้าง",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="th" className={`${body.variable} ${display.variable} ${mono.variable} ${lao.variable}`}>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => {
                  const a = ((140 + (i * 260) / 7) * Math.PI) / 180;
                  return <circle key={i} cx={15 + 11 * Math.cos(a)} cy={15 + 11 * Math.sin(a)} r={3.2} fill={i < 5 ? "var(--bronze)" : "var(--line)"} />;
                })}
              </svg>
              <span>
                <b>Pinphat AI</b>
                <small className="lao">ພິນພາດລ້ານຊ້າງ</small>
              </span>
            </Link>
            <NavLinks role={user.role} />
            <div className="who">
              {user.id ? (
                <>
                  <span>{user.name}</span>
                  <span className="role">{ROLE_LABEL[user.role]}</span>
                  <form action={logout}>
                    <button className="btn ghost sm" type="submit">ออกจากระบบ</button>
                  </form>
                </>
              ) : (
                <Link className="btn sm" href="/login">เข้าสู่ระบบ</Link>
              )}
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
