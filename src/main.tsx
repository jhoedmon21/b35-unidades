import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Tipografía auto-hospedada (se precachea en el SW: funciona sin señal)
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
// Mapa
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App";
import { AppProvider } from "./state/AppContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

// Basename del router: en su propio dominio es «/»; bajo el prefijo /app/
// de la central (mismo origen vía rewrite) es «/app». Detectado por URL.
const basename = window.location.pathname.startsWith("/app") ? "/app" : "/";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
