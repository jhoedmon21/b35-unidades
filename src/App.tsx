// Enrutamiento + actualizaciones PWA controladas:
// la nueva versión se aplica SOLO cuando no hay misión activa.

import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Shell from "./components/Shell";
import Alert from "./pages/Alert";
import EmergencyAlert from "./pages/EmergencyAlert";
import Home from "./pages/Home";
import Login from "./pages/Login";
import MapPage from "./pages/Map";
import Chat from "./pages/Chat";
import Mission from "./pages/Mission";
import Settings from "./pages/Settings";
import Stub from "./pages/Stub";
import { usePwaUpdate } from "./lib/pwa";
import { useApp } from "./state/AppContext";

export default function App() {
  const { phase, unit, mission, alertMission, activeAlert, notify } = useApp();
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
        <Route path="/" element={<Navigate to="/inicio" replace />} />
        <Route path="/inicio" element={<Shell><Home /></Shell>} />
        <Route
          path="/mision"
          element={unit ? <Shell><Mission /></Shell> : <Navigate to="/inicio" replace />}
        />
        <Route path="/alerta" element={<Alert />} />
        <Route
          path="/mensajes"
          element={unit ? <Shell><Chat /></Shell> : <Navigate to="/inicio" replace />}
        />
        <Route path="/ajustes" element={<Shell><Settings /></Shell>} />
        <Route
          path="/mapa"
          element={
            <Shell fullBleed>
              <MapPage />
            </Shell>
          }
        />
        <Route
          path="/equipo"
          element={
            <Shell>
              <Stub
                title="Equipo del vehículo"
                detail="Visor 3D del carro con compartimentos y checklist de revisión. Los datos ya se sincronizan; el visor llega en la siguiente etapa."
              />
            </Shell>
          }
        />
        <Route
          path="/historial"
          element={
            <Shell>
              <Stub title="Historial de misiones" detail="Misiones atendidas por esta unidad — en la siguiente etapa." />
            </Shell>
          }
        />
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
      {/* Un solo modal de despacho: la copia overlay solo cuando NO estamos
          en /alerta (ahí la ruta ya lo muestra — dos montados se apilaban y
          el «Ver sin aceptar» de arriba interceptaba el «ACEPTAR» de abajo). */}
      {alertMission && location.pathname !== "/alerta" && <Alert overlay />}
      {/* Alerta de emergencia para todos los bomberos. En /inicio la muestra
          la tarjeta inline de la propia sección (sin tapar la pantalla). */}
      {!alertMission && activeAlert && location.pathname !== "/inicio" && <EmergencyAlert />}
    </>
  );
}
