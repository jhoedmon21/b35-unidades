// Pruebas de la geometría de ruta que usa el mapa para:
//  · avanzar el tramo restante sobre el segmento (no saltar de vértice);
//  · detectar que el chofer se salió de la traza y hay que recalcular.
// Ejecutar:  npm test

import { describe, expect, it } from "vitest";
import { distanceToRouteM, nearestRoutePoint } from "../src/lib/osrm";

// Ruta de prueba sobre el ecuador: 0.01° de longitud ≈ 1113 m.
const route = {
  coords: [
    [0, 0],
    [0, 0.01],
    [0, 0.02],
  ] as [number, number][],
};

describe("geometría de la ruta", () => {
  it("proyecta sobre el segmento y no solo sobre los vértices", () => {
    const snap = nearestRoutePoint(route, { lat: 0, lng: 0.005 });
    expect(snap.distanceM).toBeLessThan(1);
    expect(snap.index).toBe(0);
    expect(snap.t).toBeCloseTo(0.5, 2);
    expect(snap.lat).toBeCloseTo(0, 5);
    expect(snap.lng).toBeCloseTo(0.005, 5);
  });

  it("mide el desvío perpendicular en metros", () => {
    // 0.001° de latitud ≈ 111 m al norte de la traza
    const offM = distanceToRouteM(route, { lat: 0.001, lng: 0.005 });
    expect(offM).toBeGreaterThan(105);
    expect(offM).toBeLessThan(115);
  });

  it("un punto sobre la ruta tiene desvío cero (o casi cero)", () => {
    expect(distanceToRouteM(route, { lat: 0, lng: 0.015 })).toBeLessThan(1);
  });

  it("más allá del final mide contra el último punto de la ruta", () => {
    const snap = nearestRoutePoint(route, { lat: 0, lng: 0.03 });
    expect(snap.index).toBe(1);
    expect(snap.t).toBe(1);
    expect(snap.distanceM).toBeGreaterThan(1100);
    expect(snap.distanceM).toBeLessThan(1120);
  });

  it("tolera rutas de un solo punto sin romper el mapa", () => {
    const one = { coords: [[0, 0]] as [number, number][] };
    const snap = nearestRoutePoint(one, { lat: 0, lng: 0.001 });
    expect(snap.index).toBe(0);
    expect(snap.distanceM).toBeGreaterThan(100);
  });
});
