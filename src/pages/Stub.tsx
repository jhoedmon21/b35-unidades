// Pantalla provisoria de las funciones que llegan en las siguientes etapas
// (mapa/ruta, hidrantes en campo, visor 3D del vehículo, historial).

import { Link } from "react-router-dom";
import { Compass } from "@phosphor-icons/react";

export default function Stub({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card p-6 text-center">
        <Compass size={44} weight="duotone" className="mx-auto text-mut" aria-hidden="true" />
        <h1 className="display mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-mut">{detail}</p>
        <p className="mt-3 text-[12.5px] text-mut2">
          Los datos de fondo ya se descargan en cada sincronización (hidrantes, equipo, teselas del mapa),
          así que esta pantalla saldrá rápido en la etapa siguiente.
        </p>
        <Link to="/inicio" className="btn mt-4">← Volver a inicio</Link>
      </div>
    </div>
  );
}
