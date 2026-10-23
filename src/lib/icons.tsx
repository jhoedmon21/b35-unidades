// Glifos SVG (Phosphor, los mismos de la central) serializados a HTML
// estático para los pines del mapa — los marcadores de MapLibre en la
// tablet son strings HTML, no elementos React.
// El lenguaje de iconos es idéntico al de MapView en la central:
//   incendio → llama · gas → extintor · vehicular → auto · médica → ambulancia
//   derrumbe → casco · eléctrico → rayo · inundación → lluvia · árbol → árbol
//   rescate de personas → salvavidas · resto → sirena

import { renderToStaticMarkup } from "react-dom/server";
import type { Icon } from "@phosphor-icons/react";
import {
  Ambulance,
  Car,
  CloudRain,
  Drop,
  FireExtinguisher,
  Flag,
  Flame,
  HardHat,
  Lifebuoy,
  Lightning,
  PawPrint,
  Siren,
  Tree,
  Truck,
  Van,
} from "@phosphor-icons/react";
import type { UnitType } from "./types";

const INCIDENT_ICONS: Array<[RegExp, Icon]> = [
  [/incendio|fuego|forestal|quemad/i, Flame],
  [/gas|glp|explosiv|granada|munic/i, FireExtinguisher],
  [/vehicular|colisi|choque|volcad|atropell|volque/i, Car],
  [/m[eé]dic|salud|lesion|paciente|ambulancia|infarto/i, Ambulance],
  [/derrumbe|colapso|demolici|construcc/i, HardHat],
  [/el[eé]ctric|cable|poste|tensi|alta tensi/i, Lightning],
  [/inundac|huaico|huayco|lluvia|ribera|r[ií]o|crecida/i, CloudRain],
  [/[aá]rbol|rama|ca[ií]da de [aá]rbol/i, Tree],
  [/animal|serpie|abej|avispa|perro|gato/i, PawPrint],
  [/rescate|atrapad|encerrad|ascensor/i, Lifebuoy],
];

/** SVG del tipo de emergencia (sirena genérica si el título no calza) */
export function incidentSvg(title: string | undefined, size = 15): string {
  let Icon: Icon = Siren;
  if (title) {
    for (const [re, ic] of INCIDENT_ICONS) {
      if (re.test(title)) {
        Icon = ic;
        break;
      }
    }
  }
  return renderToStaticMarkup(<Icon size={size} weight="fill" />);
}

/** Gota de agua (hidrantes) */
export function dropSvg(size = 13): string {
  return renderToStaticMarkup(<Drop size={size} weight="fill" />);
}

/** Bandera (punto de salida del vehículo) */
export function flagSvg(size = 14): string {
  return renderToStaticMarkup(<Flag size={size} weight="fill" />);
}

const UNIT_ICONS: Partial<Record<UnitType, Icon>> = {
  bomba: Truck,
  cisterna: Truck,
  rescate: Lifebuoy,
  ambulancia: Ambulance,
  auxiliar: Van,
  mando: Flag,
};

/** SVG por tipo de unidad (camión por defecto) */
export function unitTypeSvg(type: UnitType | undefined, size = 12, color?: string): string {
  const Icon = (type && UNIT_ICONS[type]) || Truck;
  return renderToStaticMarkup(<Icon size={size} weight="fill" color={color} />);
}
