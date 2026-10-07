import { synthNotation, synthTuningSweep } from "@/lib/audio";

// ไฟล์เสียงสังเคราะห์สำหรับทดลองอัปโหลดใน Field Studio (ระบบเสียงสุ่มเล็กน้อยทุกครั้ง)
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const dev = Array.from({ length: 7 }, (_, i) => (i === 0 ? 0 : Math.round((Math.random() * 2 - 1) * 15)));
  const base = 265 + Math.random() * 30;
  const buf =
    kind === "tuning"
      ? synthTuningSweep(base, dev)
      : synthNotation("- ซ - ล | - ดํ - ล | - ซ ล ซ | - ม - ร | - ม - ซ | - ล - ซ | - ม - ร | - - - ด", {
          baseHz: base,
          devCents: dev,
          slotSec: 0.38,
          humanize: 0.01,
        });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "audio/wav",
      "content-disposition": `attachment; filename="pinphat-sample-${kind === "tuning" ? "tuning" : "performance"}.wav"`,
    },
  });
}
