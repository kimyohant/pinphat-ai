"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * ช่องใส่คีย์แบบใส่ได้แต่อ่านกลับไม่ได้: หน้าเว็บได้รับแค่ค่าที่ปิดไว้ (••••a1f9) ไม่เคยได้คีย์จริง
 * ช่องว่างตอนส่งฟอร์มหมายถึงคงคีย์เดิมไว้
 */
export function SecretInput(p: {
  name: string;
  label: string;
  masked: string;
  source: string;
  sourceKind: "db" | "env" | "default";
  placeholder: string;
  emptyText: string;
  clearLabel: string;
  showLabel: string;
  hideLabel: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="secret">
      <span className="row between secret-head">
        <b>{p.label}</b>
        <span className={`src-tag ${p.sourceKind}`}>{p.source}</span>
      </span>
      <span className={`secret-now${p.masked ? "" : " none"}`}>
        <Icon name={p.masked ? "lock" : "close"} size={14} />
        <span className="mono">{p.masked || p.emptyText}</span>
      </span>
      <span className="secret-field">
        <input
          type={show ? "text" : "password"}
          name={p.name}
          placeholder={p.placeholder}
          aria-label={`${p.label}: ${p.placeholder}`}
          // กันเบราว์เซอร์เติมรหัสผ่านของผู้ดูแลลงช่องคีย์ API
          autoComplete="new-password"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
        />
        <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-pressed={show}>
          {show ? p.hideLabel : p.showLabel}
        </button>
      </span>
      {p.sourceKind === "db" && (
        <label className="check small">
          <input type="checkbox" name="clear" value={p.name} /> {p.clearLabel}
        </label>
      )}
    </div>
  );
}
