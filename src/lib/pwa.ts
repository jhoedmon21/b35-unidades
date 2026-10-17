// Wrapper tipado del módulo virtual de vite-plugin-pwa.
// Se importa desde .tsx; si el módulo virtual no está (build sin PWA)
// el hook degrada a un no-op controlado.
import { useRegisterSW as useRegisterSWReal } from "virtual:pwa-register/react";

// Registro directo del SW en desarrollo: el módulo virtual no llega a
// registrar y el dev-sw lo sirve Vite como ES MODULE — hay que declararlo
// así (type: "module") o la evaluación del script falla en silencio
// ("ServiceWorker script evaluation failed"), dejando push sin SW.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker
    .getRegistration("/")
    .then((existing) => existing ?? navigator.serviceWorker.register("/dev-sw.js?dev-sw", { scope: "/", type: "module" }))
    .catch(() => {});
}

export interface PwaUpdate {
  needRefresh: boolean;
  updateServiceWorker: (reload?: boolean) => Promise<void>;
}

export function usePwaUpdate(): PwaUpdate {
  const { needRefresh, updateServiceWorker } = useRegisterSWReal();
  return { needRefresh: needRefresh[0], updateServiceWorker };
}
