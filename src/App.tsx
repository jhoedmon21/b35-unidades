// Enrutamiento + actualizaciones PWA controladas:
// la nueva versión se aplica SOLO cuando no hay misión activa.
//
// UNA SOLA VENTANA — el mapa: Inicio, Misión, Chat y Ajustes dejaron de ser
// pantallas; todo vive como paneles flotantes sobre /mapa (MapOverlays).
// Solo queda un modal global: la ALARMA de despacho del chofer.
// La vista para bomberos fue retirada: la tablet es del chofer.

import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Alert from "./pages/Alert";
import Login from "./pages/Login";
import MapPage from "./pages/Map";
import { usePwaUpdate } from "./lib/pwa";
import { useApp } from "./state/AppContext";

export default function App() {
  const { phase, mission, alertMission, notify } = useApp();
  const location = useLocation();

  // Con misión activa NUNCA se recarga la app; en cuanto cierre, se aplica
  const { needRefresh, updateServiceWorker } = usePwaUpdate();
  useEffect(() => {
    if (needRefresh && !mission) {
      void updateServiceWorker(true);
    } else if (needRefresh) {
      notify("Hay una actualización — se aplicará al cerrar la misión", "info");
    }
  }, [needRefresh, mission, updateServiceWorker, notify]);

  if (phase === "checking") {
    return (
      <div className="grid h-full place-items-center bg-bg">
        <div className="text-center">
          <div className="display text-3xl font-bold tracking-widest">
            FUEGO<span className="text-fire">MAP</span>
          </div>
          <p className="mt-2 text-sm text-mut">Conectando con la central…</p>
        </div>
      </div>
    );
  }

  if (phase === "anon") return <Login />;

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/mapa" replace />} />
        <Route path="/alerta" element={<Alert />} />
        <Route
          path="/mapa"
          element={
            <div className="h-dvh w-full overflow-hidden">
              <MapPage />
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/mapa" replace />} />
      </Routes>
      {/* Un solo modal de despacho: la copia overlay solo cuando NO estamos
          en /alerta (ahí la ruta ya lo muestra — dos montados se apilaban y
          el «Ver sin aceptar» de arriba interceptaba el «ACEPTAR» de abajo). */}
      {alertMission && location.pathname !== "/alerta" && <Alert overlay />}
    </>
  );
}
