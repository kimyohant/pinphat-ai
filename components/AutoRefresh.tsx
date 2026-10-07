"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** รีเฟรชข้อมูลหน้าเป็นระยะระหว่างที่มีงานเบื้องหลังกำลังทำ */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
