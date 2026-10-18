// Pantalla 1 — Inicio: dos caminos claros.
// 🚒 CHOFER → correo, clave y unidad (misión completa con despacho).
// 🧑‍🚒 BOMBERO → sin clave: alertas públicas, mapa e hidrantes.
// Sin sesión la app SIEMPRE cae aquí; el arranque nunca se atasca.

import { useEffect, useState } from "react";
import { Flame } from "@phosphor-icons/react";
import { api, ApiError } from "../lib/api";
import { primeAudio } from "../lib/alarm";
import { cx } from "../lib/cx";
import { useApp } from "../state/AppContext";
import type { UnitDTO } from "../lib/types";

export default function Login() {
  const { login, busy, backToGuest } = useApp();
  const [bombero, setBombero] = useState(false); // modo bombero: sin clave
  const [email, setEmail] = useState("conductor@fuegomap.pe");
  const [password, setPassword] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [units, setUnits] = useState<UnitDTO[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listado mínimo (código/nombre) para el selector: ruta pública del login.
    api
      .get<{ units: UnitDTO[] }>("/api/units/auth/units")
      .then((d) => {
        setUnits(d.units);
        setUnitCode((current) => current || d.units[0]?.code || "");
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    primeAudio(); // primer gesto: habilita la sirena
    if (bombero) {
      backToGuest(); // vista pública de emergencias, sin sesión
      return;
    }
    setError(null);
    try {
      await login(email.trim(), password, unitCode);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con la central");
    }
  }

  return (
    <div className="grid h-full overflow-y-auto md:grid-cols-2">
      {/* Panel de marca */}
      <div
        className="relative hidden flex-col items-center justify-center p-8 md:flex"
        style={{
          background:
            "radial-gradient(120% 100% at 30% 0%, color-mix(in srgb, var(--fire) 16%, var(--bg)) 0%, var(--bg) 60%)",
        }}
      >
        <span className="grid h-24 w-24 place-items-center rounded-3xl border border-fire/40 bg-panel/70 shadow-[0_0_60px_-12px_var(--fire)]">
          <Flame size={52} weight="fill" className="text-fire" aria-hidden="true" />
        </span>
        <h1 className="display mt-5 text-5xl font-bold tracking-[0.14em]">
          FUEGO<span className="text-fire">MAP</span>
        </h1>
        <p className="display mt-1 text-[15px] tracking-[0.3em] text-mut uppercase">Unidades</p>
        <p className="mt-6 max-w-xs text-center text-[14px] leading-relaxed text-mut">
          La tablet del vehículo: despachos con alerta sonora, misión con fotos,
          hidrantes de la zona y todo tu equipo — incluso sin señal.
        </p>
      </div>

      {/* Acceso */}
      <div className="grid place-items-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-5 text-center md:hidden">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-fire/50 bg-panel2">
              <Flame size={34} weight="fill" className="text-fire" aria-hidden="true" />
            </span>
            <h1 className="display mt-3 text-4xl font-bold tracking-[0.14em]">
              FUEGO<span className="text-fire">MAP</span>
            </h1>
          </div>

          <form className="card spine-fire space-y-4 p-5" onSubmit={submit}>
            {/* Rol de hoy: chofer (conduce) o bombero (solo alertas, sin clave) */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo ingresas hoy">
              <button
                type="button"
                aria-pressed={!bombero}
                className={cx("btn", bombero && "border-line")}
                style={!bombero ? { background: "var(--fire)", borderColor: "var(--fire)", color: "#071120" } : undefined}
                onClick={() => setBombero(false)}
              >
                🚒 Chofer
              </button>
              <button
                type="button"
                aria-pressed={bombero}
                className={cx("btn", !bombero && "border-line")}
                style={bombero ? { background: "var(--rescue)", borderColor: "var(--rescue)", color: "#071120" } : undefined}
                onClick={() => setBombero(true)}
              >
                🧑‍🚒 Bombero
              </button>
            </div>

            {bombero ? (
              <div className="rounded-xl bg-panel2 px-3 py-3 text-[13px] leading-relaxed text-mut">
                Modo <strong className="text-tx">bombero</strong>: alertas de todas
                las emergencias de la compañía, mapa básico e hidrantes cercanos —
                <strong className="text-tx"> sin clave y sin unidad</strong>.
              </div>
            ) : (
              <>
                <div>
                  <label className="tag mb-1 block text-mut" htmlFor="email">Correo</label>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="tag mb-1 block text-mut" htmlFor="password">Clave</label>
                  <input
                    id="password"
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="tag mb-1 block text-mut" htmlFor="unit">Tu unidad hoy</label>
                  <select
                    id="unit"
                    className="input"
                    required
                    value={unitCode}
                    onChange={(e) => setUnitCode(e.target.value)}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.code}>
                        {u.code} — {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && (
              <p
                role="alert"
                className="spine-danger rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[14px] font-semibold text-danger"
              >
                {error}
              </p>
            )}

            <button
              className={cx("btn btn-primary w-full")}
              style={bombero ? { background: "var(--rescue)", borderColor: "var(--rescue)", color: "#071120" } : undefined}
              type="submit"
              disabled={busy.login}
            >
              {busy.login ? "Entrando…" : bombero ? "🧑‍🚒 VER EMERGENCIAS (sin clave)" : "Entrar"}
            </button>

            <div className="rounded-xl bg-panel2 px-3 py-2.5 text-[12.5px] leading-relaxed text-mut">
              <strong className="text-tx">Demo chofer:</strong> conductor@fuegomap.pe ·{" "}
              <strong className="text-tx">bombero123</strong>
              <br />
              El chofer desbloquea la misión completa (ruta tipo Uber, ETA, fotos y
              aceptación del despacho); el bombero solo ve la información pública.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
