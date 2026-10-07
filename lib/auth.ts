// การเข้าสู่ระบบแบบสาธิต: เลือกบัญชีทดลองตามบทบาท แล้วเก็บรหัสผู้ใช้ในคุกกี้ที่ลงชื่อด้วย HMAC
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DATA_DIR, db, one } from "./db";
import { ROLE_LEVELS, type Role } from "./access";

export type User = {
  id: number;
  name: string;
  role: Role;
  school_id: number | null;
  class_name: string | null;
  title: string | null;
};

export const GUEST: User = { id: 0, name: "ผู้เยี่ยมชม", role: "public", school_id: null, class_name: null, title: null };
export const COOKIE = "pp_session";

function secret(): string {
  if (process.env.PINPHAT_SECRET) return process.env.PINPHAT_SECRET;
  db(); // ให้แน่ใจว่าโฟลเดอร์ data ถูกสร้างแล้ว
  const file = path.join(DATA_DIR, "secret");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("hex"));
  return fs.readFileSync(file, "utf8").trim();
}

export function sign(userId: number): string {
  const mac = crypto.createHmac("sha256", secret()).update(String(userId)).digest("hex").slice(0, 32);
  return `${userId}.${mac}`;
}

function verify(token: string | undefined): number | null {
  if (!token) return null;
  const [id, mac] = token.split(".");
  if (!id || !mac) return null;
  const expected = sign(Number(id)).split(".")[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? Number(id) : null;
}

export async function getUser(): Promise<User> {
  const id = verify((await cookies()).get(COOKIE)?.value);
  if (!id) return GUEST;
  return one<User>("SELECT id, name, role, school_id, class_name, title FROM users WHERE id = ?", id) ?? GUEST;
}

/** ใช้ในหน้าเว็บ: ถ้าบทบาทไม่ตรง ส่งไปหน้าเข้าสู่ระบบ */
export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await getUser();
  if (!roles.includes(u.role)) redirect(`/login?need=${roles.join(",")}`);
  return u;
}

export function levelsFor(u: User): number[] {
  return ROLE_LEVELS[u.role];
}
