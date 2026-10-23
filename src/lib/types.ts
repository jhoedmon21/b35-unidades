// Tipos de FuegoMap Unidades (espejo de los DTO del backend)

export type UnitStatus = "disponible" | "en_ruta" | "en_escena" | "regresando" | "fuera_servicio";
export type UnitType = "bomba" | "cisterna" | "rescate" | "ambulancia" | "auxiliar" | "mando";
export type HydrantSituation = "operativo" | "mantenimiento" | "fuera_servicio";

export interface UserDTO {
  id: number;
  name: string;
  email?: string;
  role: "unidad" | "jefe";
}

export interface UnitDTO {
  id: number;
  code: string;
  name: string;
  type: UnitType;
  status: UnitStatus;
  station: string | null;
  crew: number | null;
  lat: number | null;
  lng: number | null;
  incidentId: number | null;
  itemCount: number;
  statusAt: string;
  statusSource: "unidad" | "operador" | "sistema";
}

export interface IncidentDTO {
  id: number;
  title: string;
  address: string;
  lat: number;
  lng: number;
  severity: "critica" | "alta" | "media" | "baja";
  status: "reportado" | "despachado" | "en_escena" | "controlado" | "cerrado";
  source: string;
  reporterName: string | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  dispatchAt: string | null;
  arrivalAt: string | null;
  closedAt: string | null;
  acceptedAt?: string | null;
  unitId: number | null;
}

export interface HydrantDTO {
  id: number;
  code: string | null;
  lat: number;
  lng: number;
  pressure: string | null;
  diameter: number | null;
  situation: HydrantSituation;
  notes: string | null;
  photoUrl: string | null;
}

export interface EquipmentItemDTO {
  id: number;
  unitId: number;
  name: string;
  category: string;
  quantity: number;
  condition: "bueno" | "regular" | "malo";
  notes: string | null;
  compartment: string | null;
  checkedToday?: boolean;
}

export interface MissionSummary {
  id: number;
  title: string;
  status: IncidentDTO["status"];
  acceptedAt: string | null;
}

export interface MeResponse {
  user: UserDTO;
  /** null = sesión de bombero sin unidad (jefe de guardia) */
  unit: UnitDTO | null;
  mission: MissionSummary | null;
  serverTime: number;
}

export interface MissionPayload {
  incident: IncidentDTO;
  hydrants: Array<HydrantDTO & { meters: number }>;
  risks: Array<{ id: number; name: string; type: string; level: string; meters: number }>;
  /** Ficha de riesgo precargada si la escena cae a ≤300 m (First Due) */
  preplan: {
    preplan: PreplanDTO;
    meters: number;
  } | null;
  otherUnits: Array<{ code: string; name: string; status: UnitStatus }>;
  reporterPhoneMasked: string;
  /** Punto de salida del vehículo (cuartel) — trayecto tipo Uber */
  departure: { lat: number; lng: number; station: string; at: string | null } | null;
}

/** Ficha de riesgo (preplan) — espejo de la central */
export interface PreplanDTO {
  id: number;
  title: string;
  address: string;
  lat: number;
  lng: number;
  status: "activo" | "inactivo";
  layout: string | null;
  hazards: string | null;
  keysInfo: string | null;
  waterSources: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  /** URLs de fotos del edificio (JSON de strings) */
  photos: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DangerZoneDTO {
  id: number;
  name: string;
  kind: string;
  level: "alto" | "medio" | "bajo";
  advisory: string | null;
  /** Tramo del camino peligroso: [[lat, lng], …] */
  path: [number, number][];
}

export interface SyncResponse {
  version: string;
  hydrants: HydrantDTO[];
  equipment: EquipmentItemDTO[];
  /** Tramos peligrosos para el tránsito (curvas, derrumbes…) */
  dangerZones: DangerZoneDTO[];
  config: {
    osrmBaseUrl: string;
    center: { lat: number; lng: number };
    zoom: number;
    coverageMeters: number;
    /** Teléfono de la central para el botón «Llamar al despachador» */
    dispatcherPhone: string;
  };
  serverTime: number;
}

/** Emergencia activa en vista BÁSICA — lo que ven todos los bomberos de la app */
export interface BasicIncidentDTO {
  id: number;
  title: string;
  address: string;
  lat: number;
  lng: number;
  severity: IncidentDTO["severity"];
  status: IncidentDTO["status"];
  createdAt: string;
  dispatchAt: string | null;
  /** Unidad asignada (solo el código en la vista básica) */
  unitCode: string | null;
}

/** GET /api/app/alerts — alerta para TODOS los bomberos (con o sin unidad) */
export interface AlertsResponse {
  version: string;
  incidents: BasicIncidentDTO[];
  hydrants: HydrantDTO[];
  dangerZones: DangerZoneDTO[];
  config: SyncResponse["config"];
  serverTime: number;
}

/** Mensaje del chat corto entre central y unidad */
export interface ChatMsg {
  id: number;
  from: "central" | "unidad";
  body: string;
  at: string;
}

/** Eventos SSE que llegan a la tablet */
export interface UnitLiveEvent {
  type:
    | "hello"
    | "unit_mission"
    | "mission_unaccepted"
    | "unit"
    | "incident"
    | "hydrant"
    | "chat"
    | "unit_logout";
  action?: string;
  id?: number;
  unitId?: number;
  title?: string;
  /** Instantánea mínima incluida en los pings de GPS (evita refetch) */
  unit?: { id: number; code: string; lat: number | null; lng: number | null; status: UnitStatus };
  /** Mensaje de chat difundido en vivo (esta unidad) */
  chat?: { id: number; unitId: number; from: "central" | "unidad"; body: string; at: string };
  at: number;
}
