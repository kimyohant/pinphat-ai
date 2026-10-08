"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, sign } from "@/lib/auth";
import { audit, one } from "@/lib/db";

const HOME: Record<string, string> = {
  student: "/learn",
  teacher: "/teach",
  collector: "/field",
  curator: "/curate",
  community: "/consent",
  assistant: "/work",
  admin: "/admin",
};

export async function loginAs(formData: FormData) {
  const id = Number(formData.get("userId"));
  const u = one<{ id: number; role: string }>("SELECT id, role FROM users WHERE id = ? AND active = 1", id);
  if (!u) redirect("/login");
  (await cookies()).set(COOKIE, sign(u.id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  audit(u.id, "login", `user:${u.id}`);
  redirect(HOME[u.role] ?? "/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/");
}
