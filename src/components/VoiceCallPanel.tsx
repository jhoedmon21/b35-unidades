import { Megaphone } from "@phosphor-icons/react";
import { useApp } from "../state/AppContext";

/** Llamado de VOZ de la central: panel a pantalla completa con campana.
 *  Aparece cuando la central manda el mensaje «LLAMADA:» por el chat; la
 *  campana (startRing en AppContext) suena hasta que el chofer atiende. */
export default function VoiceCallPanel({ onOpenChat }: { onOpenChat: () => void }) {
  const { voiceCall, dismissVoiceCall } = useApp();
  if (!voiceCall) return null;
  const hasAudio = voiceCall.url != null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4">
      <div className="w-full max-w-sm rounded-2xl border-2 border-fire bg-panel p-6 text-center shadow-2xl">
        <p className="text-[11px] font-bold tracking-[0.22em] text-mut uppercase">
          Llamado de voz · Central B-35
        </p>
        <div
          className="call-pulse mx-auto mt-4 grid h-20 w-20 place-items-center rounded-full bg-fire text-white"
          aria-hidden="true"
        >
          <Megaphone size={34} weight="fill" />
        </div>
        <h2 className="display mt-4 text-2xl font-black leading-tight">La central te llama</h2>
        <p className="mt-1.5 text-[13px] text-mut">
          Una observación o mensaje urgente para el chofer.
        </p>
        {hasAudio && (
          <audio
            className="mt-4 w-full"
            controls
            autoPlay
            src={voiceCall.url ?? undefined}
          >
            Tu navegador no puede reproducir este audio.
          </audio>
        )}
        {!hasAudio && (
          <p className="mt-3 text-[12px] font-semibold text-amber">
            Levanta el mensaje completo desde el chat de abajo.
          </p>
        )}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            className="btn btn-primary w-full px-4 py-3 text-[15px]"
            onClick={() => {
              dismissVoiceCall(); // pone fin a la campana
              onOpenChat();
            }}
          >
            Abrir el chat y responder
          </button>
          <button
            type="button"
            className="btn w-full px-4 py-2.5 text-[13px] text-mut"
            onClick={dismissVoiceCall}
            title="Se cesa la campana de llamada"
          >
            Entendido, ahora paso
          </button>
        </div>
      </div>
    </div>
  );
}
