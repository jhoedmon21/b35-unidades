// Rutas por carretera con OSRM (configurable por el backend en /sync).
// La ruta de la misión se guarda en caché local: si la señal cae después
// de recibirla, el mapa sigue mostrándola. Con anotaciones por tramo para
// calcular el TIEMPO RESTANTE desde la posición actual (estilo Uber).

export interface RouteInfo {
  distanceM: number;
  durationS: number;
  /** [lat, lng] listos para el Polyline de MapLibre */
  coords: [number, number][];
  /** Distancia acumulada (m) por nodo — durations/distances[idx] = desde la salida */
  cumDistances: number[];
  /** Tiempo acumulado (s) por nodo */
  cumDurations: number[];
  cachedAt: number;
}

export async function fetchRoute(
  baseUrl: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<RouteInfo | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&annotations=duration,distance`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: Array<{
          annotation?: { duration?: number[]; distance?: number[] };
        }>;
      }>;
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) return null;

    const coords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );

    // Anotaciones por segmento → acumuladas por nodo (para el tiempo restante)
    const segDur = route.legs?.[0]?.annotation?.duration;
    const segDist = route.legs?.[0]?.annotation?.distance;
    const cumDistances: number[] = [0];
    const cumDurations: number[] = [0];
    if (segDist && segDur && segDist.length === coords.length - 1) {
      for (let i = 0; i < segDist.length; i++) {
        cumDistances.push(cumDistances[i] + segDist[i]);
        cumDurations.push(cumDurations[i] + segDur[i]);
      }
    } else {
      // Respaldo: reparto proporcional por nodo
      for (let i = 1; i < coords.length; i++) {
        const f = i / (coords.length - 1);
        cumDistances.push(route.distance * f);
        cumDurations.push(route.duration * f);
      }
    }

    return {
      distanceM: route.distance,
      durationS: route.duration,
      coords,
      cumDistances,
      cumDurations,
      cachedAt: Date.now(),
    };
  } catch {
    return null; // sin señal: el llamador usa la caché local
  }
}

/** Distancia (m) entre dos puntos — para ubicar la unidad sobre la ruta */
export type Point = { lat: number; lng: number } | [number, number];

function norm(p: Point): { lat: number; lng: number } {
  return Array.isArray(p) ? { lat: p[0], lng: p[1] } : p;
}

export function haversineM(a: Point, b: Point): number {
  const A = norm(a);
  const B = norm(b);
  const rad = Math.PI / 180;
  const R = 6_371_000;
  const dLat = (B.lat - A.lat) * rad;
  const dLng = (B.lng - A.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Índice del nodo de ruta más cercano a la posición de la unidad */
export function nearestRouteIndex(route: RouteInfo, at: { lat: number; lng: number }): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.coords.length; i++) {
    const d = haversineM(route.coords[i], at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export interface NearestRoutePoint {
  /** Vértice inicial del segmento más cercano de la ruta */
  index: number;
  /** Fracción [0,1] recorrida dentro de ese segmento */
  t: number;
  /** Punto exacto SOBRE la geometría de la ruta (no el vértice) */
  lat: number;
  lng: number;
  /** Distancia (m) desde la posición real hasta ese punto de la ruta */
  distanceM: number;
}

const RAD = Math.PI / 180;
const EARTH_R = 6_371_000;

/**
 * Proyección de un punto sobre un segmento, en metros.
 * Usa una proyección equirectangular local (los tramos de OSRM son cortos,
 * el error es despreciable) y devuelve también la fracción `t` del tramo.
 * `cosLat` se calcula una sola vez por consulta (la ruta puede tener miles
 * de nodos y esto corre en cada fix del GPS de la tablet).
 */
function projectOnSegmentM(
  p: { lat: number; lng: number },
  a: [number, number],
  b: [number, number],
  cosLat: number,
): { t: number; distanceM: number } {
  // Coordenadas del segmento relativas al punto (x = este, y = norte)
  const ax = (a[1] - p.lng) * RAD * cosLat * EARTH_R;
  const ay = (a[0] - p.lat) * RAD * EARTH_R;
  const bx = (b[1] - p.lng) * RAD * cosLat * EARTH_R;
  const by = (b[0] - p.lat) * RAD * EARTH_R;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return { t, distanceM: Math.hypot(ax + t * dx, ay + t * dy) };
}

/**
 * Punto de la ruta más cercano a la unidad, proyectando sobre los SEGMENTOS
 * (no solo sobre los vértices). Es la base para saber si el conductor se
 * desvió y para que el «restante» avance de forma continua (estilo Uber).
 */
export function nearestRoutePoint(route: Pick<RouteInfo, "coords">, at: { lat: number; lng: number }): NearestRoutePoint {
  const coords = route.coords;
  const first = coords[0];
  if (coords.length < 2) {
    return {
      index: 0,
      t: 0,
      lat: first?.[0] ?? at.lat,
      lng: first?.[1] ?? at.lng,
      distanceM: first ? haversineM(first, at) : Infinity,
    };
  }

  const cosLat = Math.cos(at.lat * RAD);
  let best: NearestRoutePoint = {
    index: 0,
    t: 0,
    lat: first[0],
    lng: first[1],
    distanceM: Infinity,
  };
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const { t, distanceM } = projectOnSegmentM(at, a, b, cosLat);
    if (distanceM < best.distanceM) {
      best = {
        index: i,
        t,
        lat: a[0] + (b[0] - a[0]) * t,
        lng: a[1] + (b[1] - a[1]) * t,
        distanceM,
      };
    }
  }
  return best;
}

/** Distancia (m) desde la unidad hasta la ruta — 0 si va sobre ella. */
export function distanceToRouteM(route: Pick<RouteInfo, "coords">, at: { lat: number; lng: number }): number {
  return nearestRoutePoint(route, at).distanceM;
}
