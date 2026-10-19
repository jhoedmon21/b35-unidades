// ============================================================
//  AppContext — estado central de la tablet:
//  sesión · unidad y su estado · misión activa · conexión (SSE/online)
//  · cola sin internet · alertas de despacho · avisos (toasts)
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, getWithETag } from "../lib/api";
import { stopAlarm } from "../lib/alarm";
import { newOpId } from "../lib/op";
import { ensurePushSubscription, ensurePushSubscriptionPublic } from "../lib/push";
import type {
  AlertsResponse,
  BasicIncidentDTO,
  ChatMsg,
  DangerZoneDTO,
  HydrantDTO,
  MeResponse,
  MissionPayload,
  MissionSummary,
  SyncResponse,
  UnitDTO,
  UnitStatus,
  UserDTO,
} from "../lib/types";
import { cacheMission, getCachedMission, getMeta, saveSyncLocally, setMeta } from "../db/db";
import { enqueueOp, flush, retryAll, subscribeQueue } from "../db/queue";
import { useSSE } from "../hooks/useSSE";
import { useUnitPosition } from "../hooks/useUnitPosition";
import { useWakeLock } from "../hooks/useWakeLock";

type Phase = "checking" | "guest" | "anon" | "ready";
// guest = bomberos sin sesión: la app muestra las emergencias directamente.
// anon = pidiendo credenciales de chofer. ready = chofer con unidad.

export interface Notice {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

interface AppContextValue {
  phase: Phase;
  user: UserDTO | null;
  unit: UnitDTO | null;
  mission: MissionSummary | null;
  missionDetail: MissionPayload | null;
  /** Despacho entrante: dispara la pantalla de alerta con sirena */
  alertMission: MissionSummary | null;
  /** Emergencias activas que alimentan listas y el mapa */
  alerts: BasicIncidentDTO[];
  /** Datos del último /api/app/alerts: hidrantes y zonas para el mapa */
  alertHydrants: HydrantDTO[];
  alertZones: DangerZoneDTO[];
  connected: boolean;
  online: boolean;
  /** Última posición GPS conocida de la tablet */
  position: { lat: number; lng: number; accuracy: number; speed: number | null } | null;
  queue: { pending: number; errors: number };
  wakeLock: { held: boolean; supported: boolean };
  notices: Notice[];
  busy: Record<string, boolean>;
  login: (email: string, password: string, unitCode: string) => Promise<void>;
  logout: () => Promise<void>;
  setStatus: (status: UnitStatus) => Promise<void>;
  acceptMission: () => Promise<void>;
  dismissAlert: () => void;
  refreshMe: () => Promise<void>;
  refreshMission: () => Promise<void>;
  refreshAlerts: () => Promise<void>;
  /** Chat corto con la central (null = aún sin cargar) */
  chat: ChatMsg[] | null;
  /** Mensajes de la central sin leer */
  unreadChat: number;
  refreshChat: () => Promise<void>;
  sendChatMsg: (body: string) => Promise<boolean>;
  /** Nota de voz del chofer hacia la central */
  sendVoiceMsg: (audio: string, caption: string) => Promise<boolean>;
  markChatSeen: () => void;
  /** Ir a la pantalla de credenciales (chofer, desde la vista pública) */
  enterLogin: () => void;
  /** Entrar como bombero sin credenciales (desde el ingreso) */
  backToGuest: () => void;
  syncNow: () => Promise<void>;
  sendLocation: (lat: number, lng: number, accuracy: number) => Promise<void>;
  retryQueue: () => Promise<void>;
  notify: (text: string, tone?: Notice["tone"]) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fuera de AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const phaseRef = useRef<Phase>("checking");
  phaseRef.current = phase;
  const [user, setUser] = useState<UserDTO | null>(null);
  const [unit, setUnit] = useState<UnitDTO | null>(null);
  const [mission, setMission] = useState<MissionSummary | null>(null);
  const [missionDetail, setMissionDetail] = useState<MissionPayload | null>(null);
  const [alertMission, setAlertMission] = useState<MissionSummary | null>(null);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  /** Chat corto con la central — leal por unidad (ChatMsg) */
  const [chat, setChat] = useState<ChatMsg[] | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const alertsEtagRef = useRef<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState({ pending: 0, errors: 0 });
  /** Última posición GPS conocida de la tablet (para el mapa y nuevos hidrantes) */
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number; speed: number | null } | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const missionRef = useRef<MissionSummary | null>(null);
  missionRef.current = mission;
  const unitRef = useRef<UnitDTO | null>(null);
  unitRef.current = unit;

  const notify = useCallback((text: string, tone: Notice["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n, { id, text, tone }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  const setBusyKey = useCallback((key: string, value: boolean) => {
    setBusy((b) => ({ ...b, [key]: value }));
  }, []);

  // ---------- Sesión ----------

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>("/api/units/me");
      setPhase("ready");
      setUser(me.user);
      setUnit(me.unit);
      setMission(me.mission);
    } catch {
      // Sin credenciales (o central con sesión viva pero sin responder): ingreso
      setPhase("anon");
    }
  }, []);

  // ---------- Misión (con caché offline) ----------

  const refreshMission = useCallback(async () => {
    try {
      const d = await api.get<{ mission: MissionPayload }>("/api/units/me/mission");
      setMissionDetail(d.mission);
      void cacheMission(d.mission);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setMissionDetail(null);
        void cacheMission(null);
      } else {
        // sin señal: mostrar la última misión conocida
        const cached = await getCachedMission();
        if (cached) setMissionDetail(cached);
      }
    }
  }, []);

  // ---------- Alertas globales: TODAS las emergencias, para todos los bomberos ----------

  /** Aplica el payload de alertas: datos vivos para listas, mapa e hidrantes */
  const applyAlerts = useCallback((d: AlertsResponse) => {
    setAlertsData(d);
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const result = await getWithETag<AlertsResponse>("/api/app/alerts", alertsEtagRef.current);
      if (!result) return; // 304: nada cambió
      alertsEtagRef.current = result.etag;
      applyAlerts(result.data);
    } catch {
      /* sin señal: el barrido periódico reintenta */
    }
  }, [applyAlerts]);

  // ---------- Arranque: con sesión entra directo; sin ella, al ingreso ----------

  const boot = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>("/api/units/me");
      setPhase("ready");
      setUser(me.user);
      setUnit(me.unit);
      setMission(me.mission);
      return;
    } catch {
      /* sin sesión válida: pantalla de ingreso del chofer */
    }
    setPhase("anon");
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // ---------- Sync offline (hidrantes + equipo + config) ----------

  const syncNow = useCallback(async () => {
    try {
      const etag = await getMeta<string | null>("syncEtag");
      const result = await getWithETag<SyncResponse>("/api/units/me/sync", etag);
      if (!result) return; // 304: nada cambió
      await saveSyncLocally(result.data);
      await setMeta("syncEtag", result.etag);
    } catch {
      /* sin señal: se reintenta con la cola/efectos */
    }
  }, []);

  // ---------- Cola ----------

  useEffect(() => {
    return subscribeQueue((pending, errors) => setQueue({ pending, errors }));
  }, []);

  const retryQueue = useCallback(async () => {
    const n = await retryAll();
    notify(n > 0 ? `Reintentando ${n} cambios…` : "Nada que reintentar", n > 0 ? "success" : "info");
  }, [notify]);

  // ---------- Conexión ----------

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const ready = phase === "ready";
  const guest = phase === "guest";
  // Público sin sesión al canal abierto; con sesión, al canal de la unidad
  const sseUrl = guest ? "/api/app/events" : "/api/units/me/events";
  const { connected } = useSSE(
    (ev) => {
      void (async () => {
        if (ev.type === "unit_mission" && ev.unitId != null) {
          const me = await api.get<MeResponse>("/api/units/me").catch(() => null);
          if (me) {
            setUnit(me.unit);
            setMission(me.mission);
            if (me.mission && me.mission.acceptedAt == null) {
              setAlertMission(me.mission); // la pantalla de alerta enciende la sirena
              void refreshMission();
            }
          }
        } else if (ev.type === "unit" && ev.id === unit?.id) {
          const snap = ev.unit;
          if (snap) {
            // Ping de GPS del propio evento: parche local sin consulta a la
            // central. Si el estado cambió (o falta la unidad local) refresca
            // todo para traer código/estado/dotación al día.
            if (!unit || snap.status !== unit.status) {
              const me = await api.get<MeResponse>("/api/units/me").catch(() => null);
              if (me?.unit) {
                setUnit(me.unit);
                setMission(me.mission);
              } else if (me) {
                setUnit(null);
                setMission(me.mission);
              }
            } else {
              setUnit((prev) =>
                prev && (prev.lat !== snap.lat || prev.lng !== snap.lng)
                  ? { ...prev, lat: snap.lat, lng: snap.lng }
                  : prev,
              );
            }
            return;
          }
          const me = await api.get<MeResponse>("/api/units/me").catch(() => null);
          if (me?.unit) {
            const fresh = me.unit;
            setUnit((prev) => {
              if (fresh.statusSource === "operador" && prev && fresh.status !== prev.status) {
                notify(`La central puso tu estado en «${fresh.status}»`);
              }
              return fresh;
            });
            setMission(me.mission);
          } else if (me) {
            // La unidad ya no existe o la sesión quedó sin unidad
            setUnit(null);
            setMission(me.mission);
          }
        } else if (ev.type === "incident") {
          // Cada emergencia (nueva o actualizada) avisa a TODOS los bomberos;
          // si es la misión de esta unidad, además refresca el detalle
          void refreshAlerts();
          if (ev.id === missionRef.current?.id) void refreshMission();
        } else if (ev.type === "hydrant") {
          // Con sesión: sync completo; sin ella: la alerta pública trae hidrantes
          if (unitRef.current) void syncNow();
          else void refreshAlerts();
        } else if (ev.type === "chat" && ev.chat) {
          // Mensaje de la central (lo propio ya lo agregó sendChatMsg con su id)
          const msg = ev.chat;
          if (msg.from === "central") {
            // AUDIO:<url> = nota de voz (los «LLAMADA:» antiguos se tratan igual)
            if (msg.body.startsWith("AUDIO:") || msg.body.startsWith("LLAMADA:")) {
              notify("🎤 Nota de voz de la central — escúchala en el Chat", "info");
            } else {
              notify(`💬 ${msg.body.slice(0, 80)}${msg.body.length > 80 ? "…" : ""}`, "info");
            }
            setUnreadChat((n) => n + 1);
          }
          setChat((prev) =>
            prev && !prev.some((m) => m.id === msg.id) ? [...prev, msg] : prev,
          );
        } else if (ev.type === "mission_unaccepted") {
          notify("La central fue avisada: nadie aceptó el despacho", "error");
        } else if (ev.type === "unit_logout") {
          // Cierre remoto: la tablet vuelve al ingreso (bombero o chofer)
          setUser(null);
          setUnit(null);
          setMission(null);
          setMissionDetail(null);
          setAlertMission(null);
          setChat(null);
          setUnreadChat(0);
          stopAlarm();
          setPhase("anon");
        }
      })();
    },
    guest || ready,
    sseUrl,
  );

  // Respaldo si el SSE cae: consulta periódica ligera
  useEffect(() => {
    if ((phase !== "guest" && phase !== "ready") || connected) return;
    const id = setInterval(() => {
      if (!navigator.onLine) return;
      void refreshAlerts();
      if (phase === "ready") {
        void refreshMe();
        if (missionRef.current) void refreshMission();
      }
    }, 20_000);
    return () => clearInterval(id);
  }, [phase, connected, refreshMe, refreshMission, refreshAlerts]);

  // Barrido de alertas aunque el SSE esté conectado (barato: ETag/304).
  // OJO: sin reintentar la sesión — si el bombero eligió la vista pública
  // («Soy bombero»), un 401 al azar lo enviaría al ingreso molestándolo.
  useEffect(() => {
    if (phase !== "guest" && phase !== "ready") return;
    const id = setInterval(() => {
      if (navigator.onLine) void refreshAlerts();
    }, 30_000);
    return () => clearInterval(id);
  }, [phase, refreshAlerts]);

  // Al abrir la app (bombero sin clave) o entrar: traer las emergencias ya
  useEffect(() => {
    if (phase === "guest" || phase === "ready") void refreshAlerts();
  }, [phase, refreshAlerts]);

  // ---------- Wake lock + posición ----------

  const wakeLock = useWakeLock(guest || ready);
  useUnitPosition({
    // Sin unidad (bombero sin clave) no hay a quién reportarle posición
    enabled: ready && Boolean(unit),
    inMission: Boolean(mission),
    onPosition: (lat, lng, accuracy, speed) => {
      setPosition({ lat, lng, accuracy, speed });
      void sendLocationRef.current(lat, lng, accuracy);
    },
  });

  const sendLocation = useCallback(async (lat: number, lng: number, accuracy: number) => {
    try {
      await api.post("/api/units/me/location", { lat, lng, accuracy, at: Date.now() });
    } catch {
      // Sin señal: queda en la cola; solo interesa la última posición
      await enqueueOp({
        opId: newOpId(),
        kind: "location",
        url: "/api/units/me/location",
        method: "POST",
        body: { lat, lng, accuracy },
        dedupeGroup: "location",
      });
    }
  }, []);
  const sendLocationRef = useRef(sendLocation);
  sendLocationRef.current = sendLocation;

  // ---------- Chat corto con la central ----------

  const refreshChat = useCallback(async () => {
    if (!unitRef.current) return;
    try {
      const d = await api.get<{ messages: ChatMsg[] }>("/api/units/me/chat");
      setChat(d.messages ?? []);
    } catch {
      /* offline: se conserva lo que ya hay en pantalla */
    }
  }, []);

  const sendChatMsg = useCallback(
    async (body: string): Promise<boolean> => {
      const clean = body.trim();
      if (!clean) return false;
      try {
        const d = await api.post<{ message: ChatMsg }>("/api/units/me/chat", { body: clean });
        setChat((prev) =>
          prev && !prev.some((m) => m.id === d.message.id) ? [...prev, d.message] : [...(prev ?? []), d.message],
        );
        return true;
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Sin conexión: el mensaje no llegó a la central";
        notify(msg, "error");
        return false;
      }
    },
    [notify],
  );

  /** Nota de voz del chofer hacia la central */
  const sendVoiceMsg = useCallback(
    async (audio: string, caption: string): Promise<boolean> => {
      try {
        const d = await api.post<{ message: ChatMsg }>("/api/units/me/chat", {
          body: caption.trim() || "🎤 Nota de voz del chofer",
          audio,
        });
        setChat((prev) =>
          prev && !prev.some((m) => m.id === d.message.id) ? [...prev, d.message] : [...(prev ?? []), d.message],
        );
        return true;
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Sin conexión: la voz no llegó a la central";
        notify(msg, "error");
        return false;
      }
    },
    [notify],
  );

  const markChatSeen = useCallback(() => setUnreadChat(0), []);

  // ---------- Login / logout ----------

  const login = useCallback(
    async (email: string, password: string, unitCode: string) => {
      setBusyKey("login", true);
      try {
        const d = await api.post<{ user: UserDTO; unit: UnitDTO | null }>("/api/units/auth/login", {
          email,
          password,
          unitCode: unitCode || undefined,
        });
        setUser(d.user);
        setUnit(d.unit);
        setMission(null);
        setMissionDetail(null);
        setChat(null);
        setUnreadChat(0);
        setPhase("ready");
        void refreshAlerts(); // emergencias activas al entrar (todos los roles)
        if (d.unit) {
          // Solo la unidad: push, sync y misión
          void ensurePushSubscription().then((state) => {
            if (state === "denied") notify("Activa las notificaciones para recibir despachos", "error");
          });
          void syncNow();
          const me = await api.get<MeResponse>("/api/units/me").catch(() => null);
          if (me) {
            setUnit(me.unit);
            setMission(me.mission);
            if (me.mission) void refreshMission();
          }
        }
        // Al volver de un corte de señal, arranca el despacho de la cola
        void flush();
      } finally {
        setBusyKey("login", false);
      }
    },
    [notify, refreshAlerts, refreshMission, setBusyKey, syncNow],
  );

  const logout = useCallback(async () => {
    stopAlarm();
    await api.post("/api/units/auth/logout").catch(() => {});
    setUser(null);
    setUnit(null);
    setMission(null);
    setMissionDetail(null);
    setAlertMission(null);
    setChat(null);
    setUnreadChat(0);
    // Vuelve al ingreso: elegir «Soy bombero» o credenciales de chofer
    setPhase("anon");
  }, []);

  // ---------- Push de emergencias (modo bombero, sin sesión) ----------
  // La suscripción Web Push avisa aunque la tablet esté cerrada. Pedir
  // permiso requiere gesto del usuario: se intenta con el clic «Soy
  // bombero» o con el primer toque en la vista pública. Con chofer,
  // login() ya suscribe con unidad.
  const pushOnceRef = useRef(false);
  const subscribePublicPush = useCallback((force = false) => {
    if (pushOnceRef.current) return;
    if (!force && phaseRef.current !== "guest") return; // en el ingreso no molestar
    pushOnceRef.current = true;
    void ensurePushSubscriptionPublic().catch(() => {
      pushOnceRef.current = false; // sin señal: reintentar en el próximo gesto
    });
  }, []);

  useEffect(() => {
    const onFirst = () => subscribePublicPush();
    window.addEventListener("pointerdown", onFirst);
    window.addEventListener("keydown", onFirst);
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
  }, [subscribePublicPush]);

  /** Ir a credenciales de chofer (desde la vista pública) */
  const enterLogin = useCallback(() => setPhase("anon"), []);
  /** Entrar como bombero sin credenciales (desde el ingreso) */
  const backToGuest = useCallback(() => {
    setPhase("guest");
    subscribePublicPush(true); // el clic «Soy bombero» ya es gesto de usuario
  }, [subscribePublicPush]);

  // ---------- Acciones de la unidad ----------

  const setStatus = useCallback(
    async (status: UnitStatus) => {
      if (!unit) return;
      const opId = newOpId();
      const clientAt = Date.now();
      // Cambio optimista: el conductor ve su toque reflejado al instante
      setUnit({ ...unit, status, statusAt: new Date().toISOString(), statusSource: "unidad" });
      try {
        const r = await api.patch<{ unit: UnitDTO }>("/api/units/me/status", { status, opId, clientAt });
        setUnit(r.unit);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 409 || e.status === 401)) {
          if (e.status === 409) notify(e.message, "error");
          void refreshMe();
          return;
        }
        // Red caída: a la cola (idempotente por opId)
        await enqueueOp({
          opId,
          kind: "status",
          url: "/api/units/me/status",
          method: "PATCH",
          body: { status, opId, clientAt },
        });
        notify(`Guardado sin señal — ${queue.pending + 1} cambio(s) pendiente(s)`, "info");
      }
    },
    [unit, notify, refreshMe, queue.pending],
  );

  const acceptMission = useCallback(async () => {
    if (!mission) return;
    const opId = newOpId();
    try {
      await api.post("/api/units/me/mission/accept", { opId });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      await enqueueOp({
        opId,
        kind: "mission_accept",
        url: "/api/units/me/mission/accept",
        method: "POST",
        body: {},
      });
    }
    setMission((m) => (m ? { ...m, acceptedAt: new Date().toISOString() } : m));
    await refreshMission();
  }, [mission, refreshMission]);

  const dismissAlert = useCallback(() => {
    stopAlarm();
    setAlertMission(null);
  }, []);

  // Al iniciar sesión con misión SIN aceptar (p. ej. app recién abierta):
  // el despacho pendiente sigue mostrando la alerta
  useEffect(() => {
    if (ready && mission && mission.acceptedAt == null && mission.status === "despachado") {
      setAlertMission(mission);
      void refreshMission();
    }
  }, [ready, mission, refreshMission]);

  const value = useMemo<AppContextValue>(
    () => ({
      phase,
      user,
      unit,
      mission,
      missionDetail,
      alertMission,
      alerts: alertsData?.incidents ?? [],
      alertHydrants: alertsData?.hydrants ?? [],
      alertZones: alertsData?.dangerZones ?? [],
      connected,
      online,
      position,
      queue,
      wakeLock,
      notices,
      busy,
      login,
      logout,
      setStatus,
      acceptMission,
      dismissAlert,
      refreshMe,
      refreshMission,
      refreshAlerts,
      chat,
      unreadChat,
      refreshChat,
      sendChatMsg,
      sendVoiceMsg,
      markChatSeen,
      enterLogin,
      backToGuest,
      syncNow,
      sendLocation,
      retryQueue,
      notify,
    }),
    [
      phase, user, unit, mission, missionDetail, alertMission, alertsData,
      chat, unreadChat, sendVoiceMsg,
      connected, online, position, queue, wakeLock, notices, busy,
      login, logout, setStatus, acceptMission, dismissAlert,
      refreshMe, refreshMission, refreshAlerts, enterLogin, backToGuest, syncNow, sendLocation, retryQueue, notify,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
