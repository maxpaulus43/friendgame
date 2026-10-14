// Everything that touches phone hardware lives here: motion, compass, tilt,
// location, microphone, audio output, camera images and the screen wake lock.
//
// iOS rules worth knowing:
//  - Motion/orientation permission must be requested from inside a tap handler,
//    before any `await`, or Safari silently refuses.
//  - AudioContext must be created/resumed inside a tap handler too.
//  - All of this needs HTTPS (localhost is fine for development).

const st = {
  motion: null, // true | false | null (unknown)
  geo: null, // { lat, lon } | false
  mic: null, // MediaStream
  audio: null, // AudioContext
};

const hasMotionApi = typeof DeviceMotionEvent !== 'undefined';
const hasOrientationApi = typeof DeviceOrientationEvent !== 'undefined';

// Call synchronously from a tap. `needs` is a list of: motion, orientation, geo, mic, audio.
export async function prepare(needs = []) {
  const want = new Set(needs);
  const errors = [];

  // --- synchronous, gesture-bound part ---
  if (want.has('audio') || want.has('mic')) audioCtx();
  let permP = null;
  if (want.has('motion') || want.has('orientation')) {
    const reqs = [];
    if (hasMotionApi && typeof DeviceMotionEvent.requestPermission === 'function')
      reqs.push(DeviceMotionEvent.requestPermission().catch(() => 'denied'));
    if (hasOrientationApi && typeof DeviceOrientationEvent.requestPermission === 'function')
      reqs.push(DeviceOrientationEvent.requestPermission().catch(() => 'denied'));
    permP = reqs.length ? Promise.all(reqs) : Promise.resolve(['granted']);
  }
  const micP = want.has('mic') ? getMic().catch((e) => e) : null;

  // --- async part ---
  if (permP) {
    const res = await permP;
    st.motion = res.includes('granted');
    if (!st.motion) errors.push('Motion access was blocked. In Safari: tap "aA" → Website Settings, or reload and allow.');
  }
  if (micP) {
    const r = await micP;
    if (r instanceof Error) errors.push(micError(r));
  }
  if (want.has('geo')) {
    try {
      st.geo = await getLocation();
    } catch {
      st.geo = false;
      errors.push('No location. You\'ll point at compass directions instead of friends.');
    }
  }
  return { errors };
}

export const motionGranted = () => st.motion !== false;
export const location = () => st.geo || null;

function micError(e) {
  if (e?.name === 'NotAllowedError') return 'Microphone access was blocked. Allow it in Safari settings and try again.';
  if (e?.name === 'NotReadableError' || e?.name === 'AbortError')
    return 'The mic is busy — probably a call on this phone. Move the call to another device.';
  return `Microphone unavailable (${e?.message || e}).`;
}

// ---- motion & orientation -------------------------------------------------

export function onMotion(fn) {
  const handler = (e) => fn(e);
  window.addEventListener('devicemotion', handler);
  return () => window.removeEventListener('devicemotion', handler);
}

// fn({ beta, gamma }) — beta: front/back tilt, gamma: left/right tilt (degrees)
export function onTilt(fn) {
  const handler = (e) => {
    if (e.beta === null || e.gamma === null) return;
    fn({ beta: e.beta, gamma: e.gamma });
  };
  window.addEventListener('deviceorientation', handler);
  return () => window.removeEventListener('deviceorientation', handler);
}

// fn({ heading, accuracy }) — heading in degrees clockwise from north.
export function onHeading(fn) {
  const ios = (e) => {
    if (typeof e.webkitCompassHeading === 'number') fn({ heading: e.webkitCompassHeading, accuracy: e.webkitCompassAccuracy });
  };
  const abs = (e) => {
    if (e.alpha !== null) fn({ heading: (360 - e.alpha) % 360, accuracy: null });
  };
  const absolute = 'ondeviceorientationabsolute' in window;
  window.addEventListener('deviceorientation', ios);
  if (absolute) window.addEventListener('deviceorientationabsolute', abs);
  return () => {
    window.removeEventListener('deviceorientation', ios);
    if (absolute) window.removeEventListener('deviceorientationabsolute', abs);
  };
}

// ---- location -------------------------------------------------------------

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 30 * 60_000 },
    );
  });
}

// ---- audio ----------------------------------------------------------------

export function audioCtx() {
  if (!st.audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    st.audio = new AC();
  }
  if (st.audio.state !== 'running') st.audio.resume().catch(() => {});
  return st.audio;
}

export async function getMic() {
  if (st.mic && st.mic.getAudioTracks().some((t) => t.readyState === 'live')) return st.mic;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can\'t use the microphone (needs HTTPS).');
  // Let iOS keep playing sound through the speaker while recording.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  } catch {}
  st.mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  return st.mic;
}

export function hasMic() {
  return !!st.mic && st.mic.getAudioTracks().some((t) => t.readyState === 'live');
}

// Turn off the mic so the orange dot goes away between rounds.
export function releaseMic() {
  st.mic?.getTracks().forEach((t) => t.stop());
  st.mic = null;
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'auto';
  } catch {}
}

export function playTone(freq, ms = 1400) {
  const ctx = audioCtx();
  if (!ctx) return Promise.resolve();
  const t0 = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.6, t0 + 0.05);
  gain.gain.setValueAtTime(0.6, t0 + ms / 1000 - 0.15);
  gain.gain.linearRampToValueAtTime(0, t0 + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.05);
  return new Promise((r) => setTimeout(r, ms + 80));
}

export function pitchTracker(stream) {
  const ctx = audioCtx();
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  return {
    read() {
      analyser.getFloatTimeDomainData(buf);
      return detectPitch(buf, ctx.sampleRate);
    },
    stop() {
      src.disconnect();
    },
  };
}

// Autocorrelation pitch detection. Returns { freq, rms } (freq null if unvoiced).
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return { freq: null, rms };
  const minLag = Math.floor(sampleRate / 1100);
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / 65));
  const c = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i + lag];
    c[lag] = sum;
  }
  let d = minLag;
  while (d < maxLag && c[d] > c[d + 1]) d++;
  let best = -1;
  let pos = -1;
  for (let i = d; i <= maxLag; i++) {
    if (c[i] > best) {
      best = c[i];
      pos = i;
    }
  }
  if (pos <= 0 || best < c[0] * 0.3) return { freq: null, rms };
  const x1 = c[pos - 1];
  const x2 = c[pos];
  const x3 = c[pos + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const t = a ? pos - b / (2 * a) : pos;
  return { freq: sampleRate / t, rms };
}

// Cents away from target, folded into [-600, 600) so any octave counts.
export function foldedCents(freq, target) {
  let c = 1200 * Math.log2(freq / target);
  c = ((c % 1200) + 1200) % 1200;
  return c >= 600 ? c - 1200 : c;
}

export function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

// ---- camera ---------------------------------------------------------------

// Shrink a camera photo so it uploads quickly over cell data.
export async function shrinkImage(file, max = 960, quality = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---- screen ---------------------------------------------------------------

let wakeLock = null;
export async function keepAwake() {
  try {
    if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && keepAwake.enabled) keepAwake();
});

export function buzz(pattern = 30) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
