// ข้อความของหน้าครู AI แบบ "ห้องกังวาน" แยกไฟล์จากพจนานุกรมหลักเพื่อให้แก้หน้าอื่นไปพร้อมกันได้ไม่ชนกัน
// ภาษาลาวร่างโดย AI ต้องให้ผู้ใช้ภาษาลาวในทีมวิจัยกวดทานก่อนใช้งานจริง
import type { Locale } from "./config";

const th = {
  phaseIdle: "พร้อมฟังคำถาม",
  phaseTyping: "กำลังฟัง…",
  phaseSearching: "กำลังค้นคลังความรู้…",
  phaseFound: "พบ {n} แหล่งที่มา กำลังเรียบเรียงคำตอบ",
  phaseEmpty: "ไม่พบเรื่องนี้ในคลังที่คุณเข้าถึงได้",
  phaseSpeaking: "กำลังตอบ",
  phaseDone: "ตอบจาก {n} แหล่งที่มา",
  sources: "แหล่งที่มา",
  sourcesLede: "ทุกคำตอบดึงจากชิ้นความรู้ที่ผ่านการรับรอง และอยู่ในระดับสิทธิ์ของคุณเท่านั้น",
  sourcesEmpty: "ถามคำถามแล้ว แหล่งที่มาของคำตอบจะเรียงขึ้นที่นี่ พร้อมรหัสรอบบันทึกที่ตรวจย้อนได้",
  openSource: "เปิดในคลัง",
  you: "คุณ",
  ai: "ครู AI",
  sendHint: "Enter ส่ง · Shift + Enter ขึ้นบรรทัดใหม่",
  grounded: "ตอบจากคลังที่รับรองแล้วเท่านั้น",
  newChat: "เริ่มใหม่",
  swipeSources: "ปัดดูแหล่งที่มา",
  copy: "คัดลอก",
  copied: "คัดลอกแล้ว",
  access: "สิทธิ์ของคุณ",
  retrievalBadge: "ค้นคืนจากคลัง",
  citeHint: "แตะเลขอ้างอิงเพื่อดูว่าข้อความนั้นมาจากบันทึกไหน",
};

type TutorUi = { [K in keyof typeof th]: string };

const en: TutorUi = {
  phaseIdle: "Ready for your question",
  phaseTyping: "Listening…",
  phaseSearching: "Searching the archive…",
  phaseFound: "Sources found: {n} · composing the answer",
  phaseEmpty: "Not in the archive you can access",
  phaseSpeaking: "Answering",
  phaseDone: "Sources used: {n}",
  sources: "Sources",
  sourcesLede: "Every answer is drawn from approved knowledge inside your access level, and nothing else.",
  sourcesEmpty: "Ask a question and its sources line up here, each with a session code you can trace back.",
  openSource: "Open in archive",
  you: "You",
  ai: "AI tutor",
  sendHint: "Enter to send · Shift + Enter for a new line",
  grounded: "Answers only from the approved archive",
  newChat: "New chat",
  swipeSources: "Swipe for sources",
  copy: "Copy",
  copied: "Copied",
  access: "Your access",
  retrievalBadge: "Archive search",
  citeHint: "Tap a citation number to see which recording it came from",
};

const lo: TutorUi = {
  phaseIdle: "ພ້ອມຟັງຄໍາຖາມ",
  phaseTyping: "ກໍາລັງຟັງ…",
  phaseSearching: "ກໍາລັງຄົ້ນຄັງຄວາມຮູ້…",
  phaseFound: "ພົບ {n} ແຫຼ່ງທີ່ມາ ກໍາລັງຮຽບຮຽງຄໍາຕອບ",
  phaseEmpty: "ບໍ່ພົບເລື່ອງນີ້ໃນຄັງທີ່ທ່ານເຂົ້າເຖິງໄດ້",
  phaseSpeaking: "ກໍາລັງຕອບ",
  phaseDone: "ຕອບຈາກ {n} ແຫຼ່ງທີ່ມາ",
  sources: "ແຫຼ່ງທີ່ມາ",
  sourcesLede: "ທຸກຄໍາຕອບດຶງຈາກຊິ້ນຄວາມຮູ້ທີ່ຜ່ານການຮັບຮອງ ແລະ ຢູ່ໃນລະດັບສິດຂອງທ່ານເທົ່ານັ້ນ",
  sourcesEmpty: "ຖາມຄໍາຖາມແລ້ວ ແຫຼ່ງທີ່ມາຂອງຄໍາຕອບຈະລຽງຂຶ້ນທີ່ນີ້ ພ້ອມລະຫັດຮອບບັນທຶກທີ່ກວດຍ້ອນໄດ້",
  openSource: "ເປີດໃນຄັງ",
  you: "ທ່ານ",
  ai: "ຄູ AI",
  sendHint: "Enter ສົ່ງ · Shift + Enter ຂຶ້ນແຖວໃໝ່",
  grounded: "ຕອບຈາກຄັງທີ່ຮັບຮອງແລ້ວເທົ່ານັ້ນ",
  newChat: "ເລີ່ມໃໝ່",
  swipeSources: "ປັດເບິ່ງແຫຼ່ງທີ່ມາ",
  copy: "ສໍາເນົາ",
  copied: "ສໍາເນົາແລ້ວ",
  access: "ສິດຂອງທ່ານ",
  retrievalBadge: "ຄົ້ນຄືນຈາກຄັງ",
  citeHint: "ແຕະເລກອ້າງອີງເພື່ອເບິ່ງວ່າຂໍ້ຄວາມນັ້ນມາຈາກບັນທຶກໃດ",
};

export const TUTOR_UI: Record<Locale, TutorUi> = { th, lo, en };
