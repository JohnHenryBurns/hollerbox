// Kelly–Lochbaum digital waveguide vocal tract.
// The tract is ~44 concatenated cylinders; sound travels as forward/backward waves
// and scatters at every area discontinuity. Formants EMERGE from the geometry —
// nothing here knows what a formant is.
const fs = require("fs");
const SR = 44100;
const N = 44;            // sections
const STEPS = 2;         // scattering steps per sample (sets tract length)
const C = 350;           // speed of sound, m/s

// section length = C / (SR * STEPS); total tract = N * that
const SECTION_M = C / (SR * STEPS);
const TRACT_CM = N * SECTION_M * 100;

class Tract {
  constructor(n = N) {
    this.n = n;
    this.diam = new Float64Array(n).fill(1.5);   // "diameter" in arbitrary cm-ish units
    this.A    = new Float64Array(n);
    this.R    = new Float64Array(n);             // right-going (toward lips)
    this.L    = new Float64Array(n);             // left-going (toward glottis)
    this.Rin  = new Float64Array(n);
    this.Lin  = new Float64Array(n);
    this.refl = new Float64Array(n);             // refl[i] = junction between i and i+1
    this.glottalReflection = 0.75;
    this.lipReflection     = -0.85;
    this.damp = 0.9995;
    this.out  = 0;
    // ---- side branch: a closed pocket for /l/, an open one for nasals ----
    // These MUST mirror the worklet in index.html — the harness measures through this file,
    // so a drift here means the gate is testing geometry the app does not have.
    this.bN    = 4;                      // pocket sections
    this.bPos  = Math.round(n*0.84);     // taps in front of the tongue tip
    this.bArea = 0.85;                   // small: a wide pocket makes an /r/
    this.bOpen = 0;                      // 0..1 coupling
    this.bEnd  = 0.97;                   // +closed pocket, -0.85 open (nostrils)
    this.bR=new Float64Array(this.bN); this.bL=new Float64Array(this.bN);
    this.bRin=new Float64Array(this.bN); this.bLin=new Float64Array(this.bN);
    // ---- the nasal tract: a second output, out of the nostrils ----
    // This was missing entirely, so a nasal measured here was a tube sealed part-way along
    // with nowhere for the air to go — a closed cavity, not a murmur. Every nasal formant the
    // gate has ever reported was of the wrong system.
    //
    // Mirrors engine/tract-worklet.js: about 11 cm, joining at 44% along, radiating at the far
    // end the way the lips do rather than reflecting the way the lateral pocket does. The
    // numbers must stay in step with the worklet or the harness measures geometry the app does
    // not have.
    const secM = 350/(2*44100);
    this.nN    = Math.max(8, Math.round(0.11/secM));
    this.nPos  = Math.round(n*0.44);
    this.nArea = 2.4;
    this.nEnd  = -0.82;                  // radiating, like the lips
    this.nasal = 0;                      // 0..1 velum opening
    this.nasalOut = 0;
    this.nR=new Float64Array(this.nN); this.nL=new Float64Array(this.nN);
    this.nRin=new Float64Array(this.nN); this.nLin=new Float64Array(this.nN);
    this.calcReflections();
  }

  calcReflections() {
    for (let i = 0; i < this.n; i++) this.A[i] = this.diam[i] * this.diam[i];  // area ∝ d²
    for (let i = 0; i < this.n - 1; i++) {
      const s = this.A[i] + this.A[i + 1];
      this.refl[i] = (s <= 1e-9) ? 0.999 : (this.A[i] - this.A[i + 1]) / s;
    }
  }

  step(input) {
    const n = this.n;
    // glottis boundary: partial reflection back into the tract, plus the source
    this.Rin[0] = this.L[0] * this.glottalReflection + input;
    // internal scattering junctions (one-multiply Kelly–Lochbaum form)
    for (let i = 0; i < n - 1; i++) {
      const w = this.refl[i] * (this.R[i] + this.L[i + 1]);
      this.Rin[i + 1] = this.R[i] - w;
      this.Lin[i]     = this.L[i + 1] + w;
    }
    // ---- three-port junction where the branch taps in ----
    // pj = 2*sum(u_in)/sum(A);  u_out_i = A_i*pj - u_in_i.  Ab=0 reduces to the line above.
    if (this.bOpen > 0.0005) {
      const k = Math.max(0, Math.min(n - 2, this.bPos));
      const A1 = this.A[k], A2 = this.A[k + 1], Ab = this.bArea * this.bOpen;
      const pj = 2 * (this.R[k] + this.L[k + 1] + this.bL[0]) / (A1 + A2 + Ab);
      this.Lin[k]     = A1 * pj - this.R[k];
      this.Rin[k + 1] = A2 * pj - this.L[k + 1];
      const intoBranch = Ab * pj - this.bL[0];
      // propagate the branch: uniform tube, reflective far end
      for (let j = 0; j < this.bN - 1; j++) { this.bRin[j + 1] = this.bR[j]; this.bLin[j] = this.bL[j + 1]; }
      this.bRin[0] = intoBranch;
      this.bLin[this.bN - 1] = this.bR[this.bN - 1] * this.bEnd;
      for (let j = 0; j < this.bN; j++) { this.bR[j] = this.bRin[j] * this.damp; this.bL[j] = this.bLin[j] * this.damp; }
    }
    // ---- the velum opens: the nasal tract joins the oral one ----
    this.nasalOut = 0;
    if (this.nasal > 0.0005) {
      const k = Math.max(0, Math.min(n - 2, this.nPos));
      const A1 = this.A[k], A2 = this.A[k + 1], An = this.nArea * this.nasal;
      const pj = 2 * (this.R[k] + this.L[k + 1] + this.nL[0]) / (A1 + A2 + An);
      this.Lin[k]     = A1 * pj - this.R[k];
      this.Rin[k + 1] = A2 * pj - this.L[k + 1];
      const into = An * pj - this.nL[0];
      for (let j = 0; j < this.nN - 1; j++) { this.nRin[j + 1] = this.nR[j]; this.nLin[j] = this.nL[j + 1]; }
      this.nRin[0] = into;
      this.nLin[this.nN - 1] = this.nR[this.nN - 1] * this.nEnd;
      this.nasalOut = (1 + this.nEnd) * this.nR[this.nN - 1];   // out of the nostrils
      for (let j = 0; j < this.nN; j++) { this.nR[j] = this.nRin[j] * this.damp; this.nL[j] = this.nLin[j] * this.damp; }
    }
    // lip boundary: mostly reflected (open end), the rest radiates out
    this.Lin[n - 1] = this.R[n - 1] * this.lipReflection;
    this.out = (1 + this.lipReflection) * this.R[n - 1] + this.nasalOut;
    // propagate one section with a little loss
    for (let i = 0; i < n; i++) {
      this.R[i] = this.Rin[i] * this.damp;
      this.L[i] = this.Lin[i] * this.damp;
    }
    return this.out;
  }

  // advance one audio sample (STEPS scattering steps), return radiated pressure
  sample(input) {
    let o = 0;
    for (let s = 0; s < STEPS; s++) o += this.step(input / STEPS);
    return o / STEPS;
  }
}

// ---- Rosenberg glottal flow pulse: opening half-cosine, faster closing quarter-cosine ----
function rosenberg(phase, OQ = 0.6, SQ = 2.8) {
  const T1 = OQ * SQ / (1 + SQ);        // opening fraction of the period
  const T2 = OQ / (1 + SQ);             // closing fraction
  if (phase < T1) return 0.5 * (1 - Math.cos(Math.PI * phase / T1));
  if (phase < T1 + T2) return Math.cos(Math.PI * (phase - T1) / (2 * T2));
  return 0;
}

// ---- WAV out ----
function writeWav(path, data) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(data.length * 2, 40);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path, b);
}

// ---- formant measurement: impulse-excite the tract, find spectral peaks ----
function measureFormants(diamProfile, maxF = 4000) {
  const t = new Tract();
  if (diamProfile) { t.diam.set(diamProfile); t.calcReflections(); }
  const L = 16384;
  const ir = new Float64Array(L);
  ir[0] = t.sample(1);
  for (let i = 1; i < L; i++) ir[i] = t.sample(0);
  // Hann-windowed DFT, peak pick
  const spec = [];
  for (let f = 150; f <= maxF; f += 5) {
    let re = 0, im = 0;
    for (let i = 0; i < L; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / L);
      const a = 2 * Math.PI * f * i / SR;
      re += ir[i] * w * Math.cos(a); im -= ir[i] * w * Math.sin(a);
    }
    spec.push([f, Math.hypot(re, im)]);
  }
  const peaks = [];
  for (let i = 2; i < spec.length - 2; i++)
    if (spec[i][1] > spec[i-1][1] && spec[i][1] > spec[i+1][1] &&
        spec[i][1] > spec[i-2][1] && spec[i][1] > spec[i+2][1])
      peaks.push(spec[i]);
  peaks.sort((a, b) => b[1] - a[1]);
  return peaks.slice(0, 4).map(p => p[0]).sort((a, b) => a - b);
}

module.exports = { Tract, rosenberg, writeWav, measureFormants, SR, N, STEPS, TRACT_CM };

// ================= VALIDATION =================
// The canonical test: a UNIFORM tube, closed at the glottis and open at the lips,
// is a quarter-wave resonator. Its resonances must land at odd multiples of c/4L —
// i.e. 500, 1500, 2500 Hz for a 17.5 cm adult male tract. That is the neutral schwa.
if (require.main === module) {
  console.log(`tract: ${N} sections x ${(SECTION_M*1000).toFixed(2)} mm = ${TRACT_CM.toFixed(1)} cm`);
  console.log(`theory for a uniform tube: c/4L = ${(C/(4*TRACT_CM/100)).toFixed(0)} Hz, then odd multiples\n`);
  const uniform = new Float64Array(N).fill(1.5);
  const f = measureFormants(uniform);
  console.log("measured resonances of the uniform tube:", f.map(x => x + " Hz").join("  "));
  const expect = [497, 1491, 2486];
  const err = f.slice(0,3).map((v,i) => Math.abs(v - expect[i]) / expect[i] * 100);
  console.log("error vs theory:", err.map(e => e.toFixed(1) + "%").join("  "));
  console.log(err.every(e => e < 8) ? "\nPASS — the tube resonates where physics says it should." : "\nFAIL");
}
