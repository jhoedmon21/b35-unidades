// Chat corto con la central (equipo estilo Bryx). El hilo se carga al abrir,
// vive por SSE (sin polling) y los mensajes de la central avisan con aviso
// arriba aunque estés en otra pantalla.

import { useEffect, useRef, useState } from "react";
import { PaperPlaneTilt, ChatCircle } from "@phosphor-icons/react";
import { useApp } from "../state/AppContext";
import { cx } from "../lib/cx";

export default function Chat() {
  const { chat, refreshChat, sendChatMsg, markChatSeen } = useApp();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void refreshChat();
    markChatSeen();
  }, [refreshChat, markChatSeen]);

  // Autodesplazamiento al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await sendChatMsg(body);
    setBusy(false);
    if (ok) setDraft("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <ChatCircle size={18} className="text-fire" aria-hidden="true" />
        <h1 className="display text-lg font-bold tracking-wider uppercase">Central</h1>
        <span className="text-[11px] text-mut">mensajes de comando</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-line bg-panel p-3">
        {!chat && <p className="text-[13px] text-mut">Cargando mensajes…</p>}
        {chat?.length === 0 && (
          <p className="text-[13px] text-mut">
            Sin mensajes. Escribe a la central — la respuesta llega aquí al instante.
          </p>
        )}
        {chat?.map((m) => (
          <div key={m.id} className={cx("flex", m.from === "unidad" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-xl border px-3 py-2 text-[14px] leading-snug",
                m.from === "unidad" ? "border-fire/50 bg-fire/10 text-tx" : "border-line bg-panel3 text-tx",
              )}
            >
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <p className="mt-0.5 text-right text-[10px] text-mut" suppressHydrationWarning>
                {m.from === "unidad" ? " tú" : " central"} ·{" "}
                {new Date(m.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-2 flex shrink-0 items-center gap-2">
        <input
          className="input flex-1 py-2.5 text-[14px]"
          placeholder="Mensaje a la central…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Escribir mensaje"
          autoComplete="off"
          maxLength={1000}
        />
        <button className="btn btn-primary shrink-0 px-3.5 py-2.5" type="submit" disabled={busy || !draft.trim()}>
          <PaperPlaneTilt size={16} aria-hidden="true" /> {busy ? "…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
