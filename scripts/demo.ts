// เพิ่มหรือลบข้อมูลสาธิตชุดขยายของคลังความรู้
//   npm run demo:add    เพิ่มครู เพลง ทาง เสียง และบทสัมภาษณ์สมมติ (ทำครั้งเดียว)
//   npm run demo:clear  ลบข้อมูลสาธิตชุดขยายออกทั้งหมด เมื่อเริ่มใส่ข้อมูลภาคสนามจริง
// ปิดเซิร์ฟเวอร์ dev ก่อนรัน เพื่อไม่ให้สองโปรเซสเขียนฐานข้อมูลพร้อมกัน
import { clearDemoArchive, expandDemoArchive } from "../lib/demo-archive";

const cmd = process.argv[2];
if (cmd === "clear") console.log(`ลบข้อมูลสาธิตแล้ว ${clearDemoArchive()} แถว`);
else console.log(expandDemoArchive() ? "เพิ่มข้อมูลสาธิตชุดขยายแล้ว" : "มีข้อมูลสาธิตชุดขยายอยู่แล้ว ไม่ได้เพิ่มซ้ำ");
