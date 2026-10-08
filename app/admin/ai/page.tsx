import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { fmt, fmtDateTime } from "@/lib/i18n/config";
import { aiLastChange, aiView, type AiKey, type AiView } from "@/lib/ai-config";
import { modelLabel, provider } from "@/lib/llm";
import { AdminTabs } from "@/components/AdminTabs";
import { DeskHead } from "@/components/desk/DeskHead";
import { Icon } from "@/components/ui/Icon";
import { SecretInput } from "@/components/admin/SecretInput";
import { saveAi, testAi } from "./actions";

type SP = { saved?: string; test?: string; ok?: string; ms?: string; loaded?: string; err?: string; code?: string; msg?: string };

export default async function AiSettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole("admin");
  const [sp, { t, locale }] = await Promise.all([searchParams, getT()]);
  const A = t.aiCfg;
  const v: AiView = aiView();
  const last = aiLastChange();
  const p = provider();
  const fromDb = (Object.keys(v) as (AiKey | "undecryptable")[]).filter((k) => k !== "undecryptable" && v[k as AiKey].source === "db").length;
  const SRC = { db: A.srcDb, env: A.srcEnv, default: A.srcDefault };
  const P_SHORT = { unsloth: "Unsloth", claude: "Claude", none: A.none };
  const keysSet = [v.unslothKey.set, v.claudeKey.set].filter(Boolean).length;

  const Src = ({ k }: { k: AiKey }) => <span className={`src-tag ${v[k].source}`}>{SRC[v[k].source]}</span>;
  const Text = ({ k, label, ph }: { k: AiKey; label: string; ph?: string }) => (
    <label>
      <span className="row between">
        {label}
        <Src k={k} />
      </span>
      <input type="text" name={k} defaultValue={v[k].value} placeholder={ph} autoComplete="off" spellCheck={false} />
    </label>
  );

  const result = (target: "unsloth" | "claude") => {
    if (sp.test !== target) return null;
    if (sp.ok)
      return (
        <div className="notice ok small">
          {target === "unsloth" ? fmt(A.okUnsloth, { ms: sp.ms ?? "-" }) : fmt(A.okClaude, { ms: sp.ms ?? "-" })}
          {sp.loaded && <div>{fmt(A.okLoaded, { m: sp.loaded })}</div>}
        </div>
      );
    return <div className="notice crit small">{sp.err === "notset" ? A.errNotSet : sp.err === "auth" ? fmt(A.errAuth, { code: sp.code ?? "" }) : fmt(A.errReach, { msg: sp.msg ?? "" })}</div>;
  };

  return (
    <main id="main" className="page">
      <DeskHead
        eyebrow={t.admin.eyebrow}
        title={A.title}
        lede={A.lede}
        stats={[
          // ค่าในแถบสถิติต้องสั้น ชื่อเต็มของผู้ให้บริการและโมเดลอยู่ในแบบฟอร์มด้านล่าง
          { value: P_SHORT[p], label: A.statProvider },
          { value: `${keysSet}/2`, label: A.key },
          { value: fromDb, label: A.statSource },
        ]}
      />
      <AdminTabs t={t} active="ai" role={user.role} />

      {sp.saved != null && <div className="notice ok">{Number(sp.saved) ? fmt(A.saved, { n: sp.saved }) : A.savedNone}</div>}
      {v.undecryptable.length > 0 && <div className="notice crit">{fmt(A.undecryptable, { keys: v.undecryptable.join(", ") })}</div>}

      <div className="split">
        <form action={saveAi} className="stack-lg" autoComplete="off">
          <fieldset>
            <legend>{A.providerTitle}</legend>
            <p className="small muted">{A.providerLede}</p>
            <div className="radio-cards" role="radiogroup" aria-label={A.providerTitle}>
              {(["auto", "unsloth", "claude", "none"] as const).map((k) => (
                <label key={k}>
                  <input type="radio" name="provider" value={k} defaultChecked={v.provider.value === k} />
                  <b>{A[k]}</b>
                  <span className="xs muted">{A[`${k}D` as const]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>{A.unslothTitle}</legend>
            <p className="small muted">{A.unslothLede}</p>
            <Text k="unslothUrl" label={A.url} ph={A.urlPh} />
            <SecretInput name="unslothKey" label={A.key} masked={v.unslothKey.value} source={SRC[v.unslothKey.source]} sourceKind={v.unslothKey.source} placeholder={A.keyNew} emptyText={A.keyNone} clearLabel={A.keyClear} showLabel={A.show} hideLabel={A.hide} />
            {p !== "none" && (
              <p className="xs muted">
                {A.statModel}: <b className="mono">{modelLabel()}</b>
              </p>
            )}
            <div className="grid cols-2">
              <Text k="textModel" label={A.textModel} />
              <Text k="textVariant" label={A.textVariant} />
              <Text k="textContext" label={A.textContext} />
              <Text k="imageModel" label={A.imageModel} />
              <Text k="videoModel" label={A.videoModel} />
              <Text k="videoFile" label={A.videoFile} />
              <Text k="sttModel" label={A.sttModel} />
            </div>
            <p className="xs muted">{A.blankHint}</p>
          </fieldset>

          <fieldset>
            <legend>{A.claudeTitle}</legend>
            <p className="small muted">{A.claudeLede}</p>
            <SecretInput name="claudeKey" label={A.key} masked={v.claudeKey.value} source={SRC[v.claudeKey.source]} sourceKind={v.claudeKey.source} placeholder={A.keyNew} emptyText={A.keyNone} clearLabel={A.keyClear} showLabel={A.show} hideLabel={A.hide} />
            <Text k="claudeModel" label={A.claudeModel} />
          </fieldset>

          <div className="row">
            <button className="btn" type="submit">
              <Icon name="check" size={16} />
              {A.save}
            </button>
            {last && <span className="xs muted">{fmt(A.lastChange, { date: fmtDateTime(last.at, locale), name: last.name ?? "-" })}</span>}
          </div>
        </form>

        <aside className="stack-lg">
          <section className="card">
            <h3>{A.test}</h3>
            <p className="xs muted">{A.testHint}</p>
            <form action={testAi.bind(null, "unsloth")}>
              <button className="btn ghost block" type="submit">
                <Icon name="spark" size={16} />
                {A.unslothTitle}
              </button>
            </form>
            {result("unsloth")}
            <form action={testAi.bind(null, "claude")}>
              <button className="btn ghost block" type="submit">
                <Icon name="spark" size={16} />
                {A.claudeTitle}
              </button>
            </form>
            {result("claude")}
          </section>
          <section className="card">
            <h3>
              <Icon name="shield" size={18} /> {A.security}
            </h3>
            <ul className="small" style={{ margin: 0, paddingLeft: "1.1em", display: "grid", gap: "var(--s2)" }}>
              <li>{A.sec1}</li>
              <li>{A.sec2}</li>
              <li>{A.sec3}</li>
              <li>{A.sec4}</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
