// ไอคอนเส้นชุดเดียวทั้งระบบ วาดเองให้เข้ากับเครื่องดนตรีในวง ไม่ยืมชุดสำเร็จรูปที่หน้าตาเหมือนทุกแอป
export type IconName =
  | "home"
  | "learn"
  | "tutor"
  | "archive"
  | "teach"
  | "studio"
  | "field"
  | "curate"
  | "consent"
  | "work"
  | "admin"
  | "users"
  | "log"
  | "gap"
  | "more"
  | "sun"
  | "moon"
  | "device"
  | "globe"
  | "logout"
  | "login"
  | "arrow"
  | "back"
  | "check"
  | "lock"
  | "play"
  | "close"
  | "spark"
  | "shield"
  | "wave";

const P: Record<IconName, React.ReactNode> = {
  // บัญชีผู้ใช้: สองคนยืนซ้อนกัน
  users: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <circle cx="16.5" cy="9.5" r="2.3" />
      <path d="M15.5 14.4c2.3 0 4.2 1.5 4.8 4.1" />
    </>
  ),
  // บันทึกการใช้งาน: แผ่นรายการมีเส้นเวลา
  log: (
    <>
      <path d="M6 4h12v16H6z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </>
  ),
  // ช่องว่างความรู้: วงฆ้องที่ขาดหนึ่งลูก
  gap: (
    <>
      <path d="M12 4a8 8 0 1 1-7.4 5" />
      <circle cx="5.2" cy="6.6" r="1.4" />
    </>
  ),
  // ผู้ดูแลระบบ: แผงปรับค่า (แถบเลื่อนสามเส้น)
  admin: (
    <>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <circle cx="9" cy="7" r="1.8" />
      <circle cx="15" cy="12" r="1.8" />
      <circle cx="8" cy="17" r="1.8" />
    </>
  ),
  // ถาดงาน: กล่องรับงานของหลังบ้าน
  work: (
    <>
      <path d="M5 5h14l1 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5z" />
      <path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />,
  // ระนาด: ลูกระนาดยาวไล่สั้นลง วางบนราง
  learn: (
    <>
      <path d="M3 17.5c3-1 15-1 18 0" />
      <path d="M5.5 15.8V8.5M9 15.4V7M12.5 15.2V6M16 15.4V7.5M19 15.8V9" />
    </>
  ),
  tutor: (
    <>
      <path d="M20 12.2c0 3.9-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 20l1.2-3.6C4.4 15.2 4 13.8 4 12.2c0-3.9 3.6-7 8-7s8 3.1 8 7z" />
      <path d="M12 9.2v.01M9 12.2h6" />
    </>
  ),
  archive: (
    <>
      <path d="M4 5.5h16v4H4z" />
      <path d="M5.5 9.5V19h13V9.5M10 13h4" />
    </>
  ),
  teach: (
    <>
      <path d="M4 5h16v10H4zM8 19l4-4 4 4" />
      <path d="M8 9h5M8 11.5h8" />
    </>
  ),
  studio: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m4.5 16 4.5-4.5 4 4 2.5-2.5 4 4" />
      <circle cx="15.5" cy="9" r="1.4" />
    </>
  ),
  field: (
    <>
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5M9 20.5h6" />
    </>
  ),
  curate: (
    <>
      <path d="M12 3.5 14.2 5l2.6-.1.9 2.5 2.1 1.6-.8 2.5.8 2.5-2.1 1.6-.9 2.5-2.6-.1L12 20.5 9.8 19l-2.6.1-.9-2.5-2.1-1.6.8-2.5-.8-2.5 2.1-1.6.9-2.5L9.8 5z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  consent: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18" cy="12" r="1.3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  device: (
    <>
      <rect x="3.5" y="5" width="17" height="11" rx="1.5" />
      <path d="M9 20h6M12 16v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" />
    </>
  ),
  logout: <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14M10 12h10M16.5 8.5 20 12l-3.5 3.5" />,
  login: <path d="M10 4.5h7.5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H10M4 12h10M10.5 8.5 14 12l-3.5 3.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  spark: <path d="M12 3.5c.6 3.9 2.2 5.6 6 6.5-3.8.9-5.4 2.6-6 6.5-.6-3.9-2.2-5.6-6-6.5 3.8-.9 5.4-2.6 6-6.5zM18.5 15.5c.3 1.6.9 2.3 2.5 2.6-1.6.3-2.2 1-2.5 2.6-.3-1.6-.9-2.3-2.5-2.6 1.6-.3 2.2-1 2.5-2.6z" />,
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6z" />,
  wave: <path d="M3 12h2l2-5 3 10 3-14 3 12 2-6 1 3h2" />,
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
