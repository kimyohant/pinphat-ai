"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { audit, one, run } from "@/lib/db";
import type { Role } from "@/lib/access";
import { backupNow, mergePerson, mergeVariant, mergeWork, reindexPerson, reindexWork } from "@/lib/admin";

const ROLES: Role[] = ["student", "teacher", "collector", "assistant", "curator", "community", "admin"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function runBackup() {
  const user = await requireRole("admin");
  const file = backupNow();
  audit(user.id, "admin.backup", file);
  redirect(`/admin?backup=${encodeURIComponent(file)}`);
}

// ---------- บัญชีผู้ใช้และโรงเรียน ----------

export async function createUser(formData: FormData) {
  const user = await requireRole("admin");
  const role = str(formData, "role") as Role;
  if (!str(formData, "name") || !ROLES.includes(role)) return;
  const id = run(
    "INSERT INTO users (name, role, school_id, class_name, title, active) VALUES (?, ?, ?, ?, ?, 1)",
    str(formData, "name"),
    role,
    Number(formData.get("schoolId")) || null,
    str(formData, "className") || null,
    str(formData, "title") || null,
  ).id;
  audit(user.id, "admin.user.create", `user:${id}`, role);
  revalidatePath("/admin/users");
}

export async function updateUser(formData: FormData) {
  const user = await requireRole("admin");
  const id = Number(formData.get("userId"));
  const role = str(formData, "role") as Role;
  const target = one<{ role: string }>("SELECT role FROM users WHERE id = ?", id);
  if (!target || !ROLES.includes(role)) return;
  // ผู้ดูแลเปลี่ยนบทบาทตัวเองไม่ได้ กันระบบไม่เหลือผู้ดูแลเลย
  const newRole = id === user.id ? target.role : role;
  run(
    "UPDATE users SET name = ?, role = ?, school_id = ?, class_name = ?, title = ? WHERE id = ?",
    str(formData, "name") || "-",
    newRole,
    Number(formData.get("schoolId")) || null,
    str(formData, "className") || null,
    str(formData, "title") || null,
    id,
  );
  audit(user.id, "admin.user.update", `user:${id}`, newRole !== target.role ? `${target.role} → ${newRole}` : "");
  revalidatePath("/admin/users");
}

/** ปิดบัญชีแทนการลบ เพื่อเก็บประวัติการทำงานไว้ตรวจสอบ */
export async function setActive(id: number, active: boolean) {
  const user = await requireRole("admin");
  if (id === user.id) return;
  run("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, id);
  // งานที่ค้างอยู่กับบัญชีที่ถูกปิด คืนเข้าคิวของทีม
  if (!active) run("UPDATE tasks SET assignee_id = NULL, status = 'open' WHERE assignee_id = ? AND status = 'in_progress'", id);
  audit(user.id, active ? "admin.user.activate" : "admin.user.deactivate", `user:${id}`);
  revalidatePath("/admin/users");
}

export async function createSchool(formData: FormData) {
  const user = await requireRole("admin");
  if (!str(formData, "name")) return;
  const id = run("INSERT INTO schools (name, province) VALUES (?, ?)", str(formData, "name"), str(formData, "province")).id;
  audit(user.id, "admin.school.create", `school:${id}`, str(formData, "name"));
  revalidatePath("/admin/users");
}

// ---------- ทะเบียนคำศัพท์ ----------

export async function saveVocab(formData: FormData) {
  const user = await requireRole("admin", "curator");
  const kind = str(formData, "kind");
  const id = Number(formData.get("id"));
  // ชื่อห้ามว่าง: ตรวจฝั่งเซิร์ฟเวอร์ด้วย ไม่พึ่ง required ของเบราว์เซอร์อย่างเดียว
  const nameField = { work: "title", variant: "name", instrument: "nameTh", person: "displayName" }[kind];
  if (!nameField || !str(formData, nameField)) return;
  if (kind === "work") {
    run("UPDATE works SET title = ?, alt_titles = ?, genre = ?, description = ? WHERE id = ?", str(formData, "title"), str(formData, "altTitles"), str(formData, "genre"), str(formData, "description"), id);
    reindexWork(id);
  } else if (kind === "variant") {
    run("UPDATE variants SET name = ?, work_id = ?, description = ? WHERE id = ?", str(formData, "name"), Number(formData.get("workId")), str(formData, "description"), id);
    reindexWork(Number(formData.get("workId")));
  } else if (kind === "instrument") {
    run(
      "UPDATE instruments SET name_th = ?, name_lo = ?, name_en = ?, family = ?, description = ? WHERE id = ?",
      str(formData, "nameTh"),
      str(formData, "nameLo"),
      str(formData, "nameEn"),
      str(formData, "family"),
      str(formData, "description"),
      id,
    );
  } else if (kind === "person") {
    run(
      "UPDATE persons SET display_name = ?, is_pseudonym = ?, province = ?, district = ?, bio = ? WHERE id = ?",
      str(formData, "displayName"),
      formData.get("pseudonym") ? 1 : 0,
      str(formData, "province"),
      str(formData, "district"),
      str(formData, "bio"),
      id,
    );
    reindexPerson(id);
  } else return;
  audit(user.id, `vocab.${kind}.update`, `${kind}:${id}`);
  revalidatePath("/admin/vocab");
  redirect(`/admin/vocab?tab=${kind}&saved=1#${kind}-${id}`);
}

export async function mergeVocab(formData: FormData) {
  const user = await requireRole("admin", "curator");
  const kind = str(formData, "kind");
  const from = Number(formData.get("id"));
  const into = Number(formData.get("into"));
  if (!into || from === into || formData.get("confirm") !== "yes") return;
  const moved = kind === "work" ? mergeWork(from, into) : kind === "variant" ? mergeVariant(from, into) : kind === "person" ? mergePerson(from, into) : -1;
  if (moved < 0) return;
  audit(user.id, `vocab.${kind}.merge`, `${kind}:${from}`, `into ${kind}:${into}, moved ${moved}`);
  revalidatePath("/admin/vocab");
  redirect(`/admin/vocab?tab=${kind}&merged=${moved}#${kind}-${into}`);
}
