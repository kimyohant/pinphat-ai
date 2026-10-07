// ระดับสิทธิ์การเข้าถึง 5 ระดับ และบทบาทผู้ใช้ (ใช้ได้ทั้งฝั่ง server และ client)

export type Role = "public" | "student" | "teacher" | "collector" | "curator" | "community";

export const ROLE_LABEL: Record<Role, string> = {
  public: "ผู้เยี่ยมชม",
  student: "นักเรียน",
  teacher: "ครูดนตรี",
  collector: "ผู้เก็บข้อมูลภาคสนาม",
  curator: "ผู้เชี่ยวชาญตรวจรับรอง",
  community: "ผู้ประสานงานชุมชน",
};

export const LEVELS = [
  { level: 1, name: "สาธารณะ", short: "L1", desc: "ทุกคนเข้าถึงได้ เผยแพร่แบบระบุชื่อครู ไม่ใช้เชิงพาณิชย์" },
  { level: 2, name: "สถานศึกษา", short: "L2", desc: "ครูและนักเรียนที่ลงทะเบียนผ่านโรงเรียนในโครงการ" },
  { level: 3, name: "นักวิจัย", short: "L3", desc: "นักวิจัยที่ทำข้อตกลงการใช้ข้อมูลและผ่านจริยธรรมการวิจัย" },
  { level: 4, name: "ชุมชนเท่านั้น", short: "L4", desc: "สมาชิกชุมชนเจ้าของความรู้ เช่น เพลงที่ใช้ในพิธีกรรม" },
  { level: 5, name: "ปิด / เก็บรักษา", short: "L5", desc: "เก็บไว้เพื่ออนุรักษ์เท่านั้น ไม่เข้าดัชนี AI และไม่แสดงผล" },
] as const;

export function levelName(level: number): string {
  return LEVELS.find((l) => l.level === level)?.name ?? "ไม่ทราบ";
}

/** ระดับที่แต่ละบทบาทเห็นได้ (ระดับ 4 ไม่ได้สูงกว่า 3 แต่เป็นสิทธิ์อีกแบบหนึ่ง จึงใช้เป็นชุด ไม่ใช่เพดาน) */
export const ROLE_LEVELS: Record<Role, number[]> = {
  public: [1],
  student: [1, 2],
  teacher: [1, 2],
  collector: [1, 2, 3],
  curator: [1, 2, 3, 4],
  community: [1, 2, 4],
};

export function canSee(role: Role, level: number | null | undefined): boolean {
  if (level == null) return false;
  return ROLE_LEVELS[role].includes(level);
}

export const TK_LABELS = [
  { code: "TK A", name: "TK Attribution", th: "ต้องระบุชื่อครูและชุมชนทุกครั้ง" },
  { code: "TK NC", name: "TK Non-Commercial", th: "ห้ามใช้เชิงพาณิชย์" },
  { code: "TK CO", name: "TK Community Use Only", th: "ใช้ภายในชุมชนเท่านั้น" },
  { code: "TK S", name: "TK Seasonal", th: "บรรเลงได้เฉพาะช่วงเวลาหรือเทศกาล" },
  { code: "TK SS", name: "TK Secret / Sacred", th: "ศักดิ์สิทธิ์ ต้องขออนุญาตก่อนใช้" },
  { code: "TK CS", name: "TK Culturally Sensitive", th: "อ่อนไหวทางวัฒนธรรม ใช้อย่างระมัดระวัง" },
] as const;

export const PROVINCES = ["อุดรธานี", "เลย", "หนองคาย", "หนองบัวลำภู", "บึงกาฬ", "สกลนคร", "นครพนม", "มุกดาหาร"] as const;

export const CONTENT_TYPES: Record<string, string> = {
  performance: "การบรรเลง",
  teaching: "บรรเลงช้าเพื่อการสอน",
  tuning: "ตีไล่เสียง (วัดระบบเสียง)",
  interview: "สัมภาษณ์",
  photo: "ภาพถ่าย",
  other: "อื่น ๆ",
};

export const CHECKLIST = [
  { key: "consent", label: "ได้รับความยินยอมและบันทึกหลักฐานแล้ว", required: true },
  { key: "tuning", label: "บันทึกการตีไล่เสียงรายลูก", required: true },
  { key: "performance", label: "บรรเลงความเร็วปกติ", required: true },
  { key: "teaching", label: "บรรเลงช้าเพื่อการสอน", required: false },
  { key: "interview", label: "สัมภาษณ์ประวัติการสืบทอด", required: true },
  { key: "photo", label: "ถ่ายภาพเครื่องดนตรีรายชิ้น", required: false },
] as const;
