// Alerta sonora: sirena de CARRO DE BOMBEROS con WebAudio — dos tonos
// alternados «hi-lo» (el clásico del camión: PAH-PAH–PAH-PAH) con cuerpo
// grave de camión, más vibración en pulsos. Suena hasta que alguien la
// detenga («Entendido»/stopAlarm).
// El audio requiere un gesto del usuario: la app lo desbloquea con el
// primer toque (login, botón Bombero o «Probar alarma»).

let ctx: AudioContext | null = null;
let vibrateTimer: number | null = null;
// Nodos de la sirena en curso (se crean al arrancar y se destruyen al detener)
let siren: {
  osc: OscillatorNode;
  sub: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
} | null = null;
// La sirena debe sonar aunque el navegador aún no lo permita (autoplay):
// con el primer toque se arma y arranca de una vez.
let wantSound = false;
let gestureHook: (() => void) | null = null;

function armGestureUnlock(): void {
  if (gestureHook != null) return;
  const handler = () => {
    if (gestureHook == null) return;
    gestureHook = null;
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
    if (wantSound && siren == null) {
      try {
        startSiren();
      } catch {
        /* sin audio disponible */
      }
    }
  };
  gestureHook = handler;
  window.addEventListener("pointerdown", handler);
  window.addEventListener("keydown", handler);
}

function ensureCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Desbloquea el audio con el primer gesto (requerido por navegadores) */
export function primeAudio(): void {
  try {
    ensureCtx();
  } catch {
    /* sin audio disponible */
  }
}

/** Sirena hi-lo de carro de bomberos: el tono salta entre dos frecuencias
 * (LFO cuadrada ~0.9 Hz sobre la base 580 Hz → 690/470 alternando cada
 * ~0.55 s) con subarmónico grave para el «peso» del camión. */
function startSiren(): void {
  const audio = ensureCtx();
  const t0 = audio.currentTime;

  const osc = audio.createOscillator(); // tono principal
  const sub = audio.createOscillator(); // cuerpo grave (doble de frecuencia base)
  const lfo = audio.createOscillator(); // switch hi-lo (onda cuadrada)
  const lfoGain = audio.createGain();
  const gain = audio.createGain();
  const subGain = audio.createGain();
  const tone = audio.createBiquadFilter();

  // Hi-lo: base 580 ±110 Hz con salto cuadrado (no barrido suave)
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(580, t0);
  lfo.type = "square";
  lfo.frequency.setValueAtTime(0.9, t0); // ciclo completo ~1.1 s (0.55 + 0.55)
  lfoGain.gain.setValueAtTime(110, t0);
  lfo.connect(lfoGain).connect(osc.frequency);

  // Sub: 290 Hz con la MISMA modulación a la mitad (sigue el hi-lo)
  sub.type = "square";
  sub.frequency.setValueAtTime(290, t0);
  subGain.gain.setValueAtTime(0.22, t0);
  lfo.connect(lfoGain).connect(sub.frequency);

  // Filtro pasa-bajos: quita el «chillido» del sawtooth, deja el tono sopa-pa
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(1900, t0);
  tone.Q.setValueAtTime(0.7, t0);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(0.32, t0 + 0.12); // arranque suave

  osc.connect(tone);
  sub.connect(subGain).connect(tone);
  tone.connect(gain).connect(audio.destination);
  osc.start(t0);
  sub.start(t0);
  lfo.start(t0);
  siren = { osc, sub, lfo, gain };
}

function stopSiren(): void {
  if (siren == null || ctx == null) return;
  const { osc, sub, lfo, gain } = siren;
  const t = ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.linearRampToValueAtTime(0.0001, t + 0.18);
    osc.stop(t + 0.2);
    sub.stop(t + 0.2);
    lfo.stop(t + 0.2);
  } catch {
    /* ya estaba parada */
  }
  siren = null;
}

function vibrateBurst(): void {
  if ("vibrate" in navigator) navigator.vibrate([450, 180, 450, 180, 450, 1600]);
}

/** Sirena de carro de bomberos + vibración, hasta stopAlarm() */
export function startAlarm(): void {
  primeAudio();
  wantSound = true;
  if (siren == null) {
    try {
      startSiren(); // suena si el audio ya está permitido por un gesto previo
    } catch {
      /* sin audio aún: el primer toque lo arma */
    }
  }
  armGestureUnlock(); // el bloqueo de autoplay suelta con el primer toque
  vibrateBurst();
  if (vibrateTimer != null) return;
  vibrateTimer = window.setInterval(vibrateBurst, 2800);
}

export function stopAlarm(): void {
  wantSound = false;
  stopSiren();
  if (vibrateTimer != null) {
    clearInterval(vibrateTimer);
    vibrateTimer = null;
  }
  if ("vibrate" in navigator) navigator.vibrate(0);
}

/** Prueba corta desde Ajustes: 2.2 s de sirena y corta sola */
export function testAlarm(): void {
  primeAudio();
  vibrateBurst();
  if (siren == null) {
    startSiren();
    window.setTimeout(() => {
      if (siren != null && vibrateTimer == null) stopSiren();
    }, 2200);
  }
}

// ---------- Llamado de VOZ de la central: «teléfono» en bucle ----------
// Dos golpes agudos y pausa (el clásico ring-ring), suena hasta atender.
let ringTimer: number | null = null;

function ringCycle(): void {
  if (ctx == null) return;
  const t = ctx.currentTime;
  const seq: Array<[number, number]> = [
    [0, 0.13],
    [0.22, 0.13],
    [0.44, 0.3],
  ];
  for (const [offset, dur] of seq) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1120, t + offset);
    if (offset > 0.3) {
      // el tercer golpe desciende un poco: «ring-ring-DAA»
      o.frequency.setValueAtTime(980, t + offset);
    }
    g.gain.setValueAtTime(0.0001, t + offset);
    g.gain.linearRampToValueAtTime(0.34, t + offset + 0.015);
    g.gain.linearRampToValueAtTime(0.0001, t + offset + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t + offset);
    o.stop(t + offset + dur + 0.03);
  }
}

function ringBurst(): void {
  if ("vibrate" in navigator) navigator.vibrate([220, 340, 220, 2200]);
}

/** Campana de llamado de voz: suena hasta stopRing() */
export function startRing(): void {
  primeAudio();
  try {
    ringCycle();
  } catch {
    /* sin audio: el gesto previo de la sesión ya lo permitió */
  }
  armGestureUnlock();
  ringBurst();
  if (ringTimer != null) return;
  ringTimer = window.setInterval(() => {
    try {
      ringCycle();
    } catch {
      /* silencio */
    }
    ringBurst();
  }, 2800);
}

export function stopRing(): void {
  if (ringTimer != null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  if ("vibrate" in navigator) navigator.vibrate(0);
}
