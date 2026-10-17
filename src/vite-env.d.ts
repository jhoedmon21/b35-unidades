/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Tipos del módulo virtual de registro PWA (React) — espejo de la API de
// vite-plugin-pwa. El archivo se mantiene AMBIENTE (sin imports top-level)
// para que el "declare module" sea una declaración global real.
declare module "virtual:pwa-register/react" {
  export interface RegisterSWOptions {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [
      boolean,
      import("react").Dispatch<import("react").SetStateAction<boolean>>,
    ];
    offlineReady: [
      boolean,
      import("react").Dispatch<import("react").SetStateAction<boolean>>,
    ];
    /** Recarga para que el nuevo service worker tome el control */
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
