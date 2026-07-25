// The Kelly-Lochbaum waveguide, sample by sample. This file IS the engine: the page
// loads it with audioWorklet.addModule() and lab/ loads the same bytes through a shim.
// It used to live inside a template literal in index.html, which meant every consumer
// re-derived it by regex and its one template interpolation had to be faked. One copy now.
//
// Everything it needs arrives in processorOptions: { n, velar }.

class TractProcessor extends AudioWorkletProcessor {
  constructor(opt){
    super();
    const n = opt.processorOptions.n;
    const CAP = 72;                         // allocate for the longest tract we allow
    this.n=n; this.nMax=CAP; this.steps=2;
    this.diam=new Float64Array(CAP).fill(1.5);
    this.target=new Float64Array(CAP).fill(1.5);
    // PHASE 9. `tgt` is where the keyframes say the tract should be; `diam` is where it has
    // actually got to, and `dv` is how fast it is going. Interpolation used to write straight
    // into diam, which is why the tract could cross 94% of the tongue tip's range in 20 ms and,
    // at a degenerate keyframe pair, cross it in none at all.
    this.tgt=new Float64Array(CAP).fill(1.5);
    this.dv=new Float64Array(CAP);
    this.artTau=0;
    this.A=new Float64Array(CAP);
    this.R=new Float64Array(CAP); this.L=new Float64Array(CAP);
    this.Rin=new Float64Array(CAP); this.Lin=new Float64Array(CAP);
    this.refl=new Float64Array(CAP);
    this.energy=new Float32Array(CAP);
    this.f0=240; this.breath=0.02; this.voicing=0; this.vAmp=0;
    this.phase=0; this.jit=0; this.jitT=0; this.jitCd=0;
    this.glotR=0.75; this.lipR=-0.85; this.damp=0.9995;
    this.gArea=0; this.gAreaMax=0.055; this.glotNow=0.75; this.gflow=0;
    // two-mass fold state
    this.fm1=0.125; this.fm2=0.025; this.fd1=0.25; this.fd2=0.05;
    this.fr1=-0.004; this.fr2=-0.004;          // adducted at rest
    this.fx1=0.002; this.fx2=0; this.fv1=0; this.fv2=0;
    this.fPsNow=9000; this.fDrift=0; this.fUg=0; this.folds=0; this.fPrev=0;
    this.rd=0.9; this.press=0.4; this.jitAmt=1;    // phonation: breathy <-> pressed
    this.makeLF(this.rd); this.lastRd=this.rd;
    // ---- side branch: the closed pocket that gives /l/ its anti-resonance ----
    const secM = 350/(sampleRate*2);
    this.bN    = Math.max(3, Math.round(4*0.00397/secM));  // solved pocket
    this.bPos  = Math.round(n*0.84);    // the pocket sits in front of the tongue tip
    // A wide pocket drags a pole down to ~2 kHz and puts its zero on F3 — which removes the
    // /l/ cue and installs the /r/ one, because that pole-zero pair IS an /r/. Keep it small
    // and short so F3 stays high and the zero sits well above it.
    this.bArea = 0.85; this.bEnd = 0.97;
    this.bOpen = 0; this.bTarget = 0;
    this.bR=new Float64Array(this.bN); this.bL=new Float64Array(this.bN);
    this.bRin=new Float64Array(this.bN); this.bLin=new Float64Array(this.bN);
    // ---- the nasal tract: a long branch at the velum, open at the nostrils ----
    this.nN   = Math.max(8, Math.round(0.11/secM));   // ~11 cm
    // The velopharyngeal port must sit UPSTREAM of a velar closure, or /ŋ/ seals the
    // nose off from the glottis and makes no sound at all.
    this.nPos = Math.round(n*0.44);
    this.nArea= 2.4; this.nEnd = -0.82;               // radiating, like the lips
    this.nasal=0; this.nasalT=0;
    this.nR=new Float64Array(this.nN); this.nL=new Float64Array(this.nN);
    this.nRin=new Float64Array(this.nN); this.nLin=new Float64Array(this.nN);
    this.dcX=0; this.dcY=0; this.tick=0;
    this.charge=0; this.burstN=0; this.burstA=0; this.burstAt=1; this.sealAt=1; this.bnz=0; this.bn1=0; this.bn2=0;
    this.vot=0; this.sealVl=0; this.bco=0.885; this.bgain=5.0;   // aspiration countdown; burst filter, set per place
    // Phase 8.3: how loud this segment is, 1 for stressed and lower for not. It rides the
    // keyframes beside fric and asp, and it stays 1 whenever nobody supplies stress — a chain
    // tapped in by hand or a sustained vowel is unaffected.
    this.lv=1;
    this.voiceless=0; this.nasalOut=0; this.fric=0; this.fz=0; this.hiss=1; this.fy1=0; this.fy2=0; this.fcLast=0;
    this.asp=0; this.ah=0; this.silNow=0;
    this.flow=0; this.flowT=0; this.turb=1; this.turbT=1; this.turbCd=0; this.fh1=0; this.fh2=0; this.fhx=0; this.fhy=0;
    this.seqFrom=null; this.seqFromB=0; this.blend=0.03;
    this.seq=null; this.seqT=0; this.prevClose=1;
    this.velar=Math.round((opt.processorOptions.velar ?? 0.568)*(n-1));
    this.port.onmessage=(e)=>{
      const d=e.data;
      if(d.type==='shape'){
        this.target.set(d.diam);
        if(d.snap) this.diam.set(d.diam);
        if(d.br!==undefined){ this.bTarget=d.br; if(d.snap) this.bOpen=d.br; }
        if(d.nz!==undefined){ this.nasalT=d.nz; if(d.snap) this.nasal=d.nz; }
        if(d.fr!==undefined) this.fric=d.fr*(this.hiss===undefined?1:this.hiss);
        if(d.as!==undefined) this.asp=d.as;
        if(d.vl!==undefined) this.voiceless=d.vl;
      }
      if(d.type==='f0') this.f0=d.value;
      if(d.type==='breath') this.breath=d.value;
      if(d.type==='voicing') this.voicing=d.value;
      if(d.type==='goal'){
        this.seq=d.seq; this.seqT=0; this.voicing=1; this.sinceSil=undefined;
        this.seqFrom=Float64Array.from(this.diam);
        this.seqFromB=this.bOpen;
        // The blend exists to avoid snapping the tract while it is ALREADY sounding.
        // From silence there is nothing to snap, and blending only delays the first
        // closure — which lets the glottis leak before the stop has formed.
        this.blend = this.vAmp>0.02 ? 0.030 : 0.002;
      }
      if(d.type==='stopSeq'){ this.seq=null; this.voicing=0; this.fric=0; this.asp=0; this.vot=0;
        this.lv=1; this.sinceSil=undefined;
        this.flow=0; this.flowT=0; this.turb=1; this.turbT=1; this.turbCd=0;
        this.fh1=0; this.fh2=0; this.fhx=0; this.fhy=0; }
      if(d.type==='tract'){
        // Tract LENGTH is what makes a voice a man, a woman or a child — not pitch. Fewer
        // sections is a shorter tube, so every resonance rises together. Helium is the same
        // knob by another route: sound simply travels faster in it.
        const nn=Math.max(14,Math.min(this.nMax,Math.round(d.n)));
        if(nn!==this.n){
          this.n=nn;
          this.R.fill(0); this.L.fill(0); this.Rin.fill(0); this.Lin.fill(0);
          this.bR.fill(0); this.bL.fill(0); this.nR.fill(0); this.nL.fill(0);
          this.bPos=Math.round(nn*0.84); this.nPos=Math.round(nn*0.44);
          if(d.diam) { this.diam.set(d.diam.slice(0,nn)); this.target.set(d.diam.slice(0,nn)); }
          this.calcRefl();
        }
      }
      if(d.type==='voice'){                        // the tournament varies these
        const v=d.v;
        if(v.rd   !==undefined) this.rd=v.rd;
        if(v.press!==undefined) this.press=v.press;
        if(v.folds!==undefined) this.folds=v.folds;
        if(v.jit !==undefined) this.jitAmt=v.jit;
        if(v.damp!==undefined) this.damp=v.damp;
        if(v.lipR!==undefined) this.lipR=v.lipR;
        if(v.brth!==undefined) this.breath=v.brth;
        if(v.burst!==undefined) this.burstK=v.burst;
        if(v.hiss !==undefined) this.hiss=v.hiss;
        if(v.onset!==undefined) this.onset=v.onset;
        if(v.artT !==undefined) this.artTau=v.artT;
      }
    };
    this.calcRefl();
  }
  calcRefl(){
    const n=this.n;
    for(let i=0;i<n;i++) this.A[i]=this.diam[i]*this.diam[i];
    for(let i=0;i<n-1;i++){
      const s=this.A[i]+this.A[i+1];
      this.refl[i]= s<=1e-9 ? 0.999 : (this.A[i]-this.A[i+1])/s;
    }
  }
  // ---- Liljencrants-Fant glottal flow derivative (Fant, Liljencrants & Lin 1985) ----
  // Rd is one knob across the whole phonation range: ~0.4 pressed, ~1 modal, ~2.5 breathy.
  // A shout is pressed phonation, not loud speech, which is why this matters more than gain.
  makeLF(Rd){
    Rd=Math.max(0.3,Math.min(2.8,Rd));
    const Rap=(-1+4.8*Rd)/100, Rkp=(22.4+11.8*Rd)/100;
    const Rgp=0.25*Rkp/(((0.11*Rd)/(0.5+1.2*Rkp))-Rap);
    const tp=1/(2*Rgp), te=tp*(1+Rkp), ta=Rap;
    let eps=1/Math.max(1e-6,ta), d=1-te;
    for(let i=0;i<50;i++){
      const f=eps*ta-1+Math.exp(-eps*d), df=ta-d*Math.exp(-eps*d);
      const st=f/df; eps-=st;
      if(!isFinite(eps)||eps<=0){ eps=1/Math.max(1e-6,ta); break; }
      if(Math.abs(st)<1e-12) break;
    }
    const wg=Math.PI/tp;
    const A2=-(1/(eps*eps*ta))*(1-Math.exp(-eps*d)*(1+eps*d));
    let a=0;
    for(let i=0;i<60;i++){
      const den=a*a+wg*wg, E=Math.exp(a*te);
      const A1=(E*(a*Math.sin(wg*te)-wg*Math.cos(wg*te))+wg)/den;
      const sc=-1/(E*Math.sin(wg*te));
      const f=A1*sc+A2;
      const h=1e-5, a2=a+h, d2=a2*a2+wg*wg, E2=Math.exp(a2*te);
      const A1b=(E2*(a2*Math.sin(wg*te)-wg*Math.cos(wg*te))+wg)/d2;
      const df=((A1b*(-1/(E2*Math.sin(wg*te)))+A2)-f)/h;
      if(!isFinite(df)||Math.abs(df)<1e-12) break;
      const st=f/df; a-=st;
      if(!isFinite(a)){ a=0; break; }
      if(Math.abs(st)<1e-10) break;
    }
    this.LF={te,ta,eps,alpha:a,wg,scale:-1/(Math.exp(a*te)*Math.sin(wg*te))};
  }
  // ---- Two-mass vocal folds (after Ishizaka & Flanagan 1972) ----
  // The LF model above is a prescribed WAVEFORM — a shape drawn to look like glottal flow.
  // This is an OSCILLATOR: two coupled masses driven by air pressure, which vibrates because
  // the physics makes it. Pitch comes from tension, and rises with breath pressure too, which
  // is why a shout goes sharp. Stiff folds at low pressure simply will not start — phonation
  // threshold pressure, emerging rather than coded.
  //
  // It does NOT generate jitter on its own; a symmetric oscillator settles to a clean limit
  // cycle. What it does is convert one wobble in breath pressure into correctly-proportioned
  // jitter AND shimmer AND waveform change — measured at 0.21% and 2.45%, both in the healthy
  // human range, from a single input. A prescribed waveform makes you choose that ratio.
  setFolds(f0, press){
    // F0 goes as sqrt(tension) — the spring law, which this model reproduces at an exponent
    // of 0.44. Invert it to drive from a pitch target.
    const k1=Math.pow(Math.max(60,f0)/1.04, 2.262);
    this.fk1=k1; this.fk2=k1/10; this.fkc=k1/3.2;
    this.fPs=6500 + 9000*Math.max(0,Math.min(1,press));
  }
  foldStep(){
    const RHO=0.00114, LG=1.4, DT=1/sampleRate;
    if(this.fk1===undefined) this.setFolds(120,0.3);
    const a1=Math.max(0, 2*LG*(this.fr1+this.fx1));
    const a2=Math.max(0, 2*LG*(this.fr2+this.fx2));
    const amin=Math.min(a1,a2);
    let Ug=0, P1=0;
    if(a1>0 && a2>0){
      Ug=amin*Math.sqrt(Math.max(0, 2*this.fPsNow/RHO));
      const r=amin/Math.max(1e-9,a1);
      P1=this.fPsNow*(1-r*r);          // high when convergent, low when divergent
    } else {
      P1=this.fPsNow;                  // closed: full pressure pushes it open again
    }
    const c1=(this.fr1+this.fx1)<=0, c2=(this.fr2+this.fx2)<=0;
    const k1e=c1?this.fk1*3:this.fk1, k2e=c2?this.fk2*3:this.fk2;
    const z1=c1?1.1:0.1, z2=c2?1.1:0.1;
    const r1=2*z1*Math.sqrt(this.fm1*this.fk1), r2=2*z2*Math.sqrt(this.fm2*this.fk2);
    const A1=(P1*LG*this.fd1 - k1e*this.fx1 - r1*this.fv1 - this.fkc*(this.fx1-this.fx2))/this.fm1;
    const A2=(              - k2e*this.fx2 - r2*this.fv2 - this.fkc*(this.fx2-this.fx1))/this.fm2;
    this.fv1+=A1*DT; this.fx1+=this.fv1*DT;
    this.fv2+=A2*DT; this.fx2+=this.fv2*DT;
    const floor=-0.06;
    if(this.fr1+this.fx1<floor){ this.fx1=floor-this.fr1; this.fv1=0; }
    if(this.fr2+this.fx2<floor){ this.fx2=floor-this.fr2; this.fv2=0; }
    this.fUg=Ug;
    return Ug;
  }
  glottal(ph){
    const P=this.LF;
    if(!P) return 0;
    if(ph<P.te) return P.scale*Math.exp(P.alpha*ph)*Math.sin(P.wg*ph);
    return -(1/(P.eps*P.ta))*(Math.exp(-P.eps*(ph-P.te))-Math.exp(-P.eps*(1-P.te)));
  }
  scatter(input){
    const n=this.n;
    // SOURCE-TRACT INTERACTION. The glottis is not a fixed wall — it is an opening whose
    // area changes across every cycle. Wide open at peak flow it lets sound escape backward
    // into the trachea and reflects little; sealed, it reflects almost everything. So the
    // reflection at this end must follow the glottal area:  r = (A1 - Ag)/(A1 + Ag).
    // The consequence is that the wave returning from the tract loads the folds and skews
    // the pulse — the difference between a source playing INTO a tube and one that is part
    // of it.
    const Ag = this.gArea * this.gAreaMax;
    const rg = (this.A[0] - Ag) / (this.A[0] + Ag + 1e-9);
    this.glotNow = Math.max(0.20, Math.min(0.995, rg));
    this.Rin[0]=this.L[0]*this.glotNow + input;
    for(let i=0;i<n-1;i++){
      const w=this.refl[i]*(this.R[i]+this.L[i+1]);
      this.Rin[i+1]=this.R[i]-w;
      this.Lin[i]=this.L[i+1]+w;
    }
    if(this.nasal>0.0005){                 // the velum opens: nasal tract joins the oral one
      const k=Math.max(0,Math.min(n-2,this.nPos));
      const A1=this.A[k], A2=this.A[k+1], An=this.nArea*this.nasal;
      const pj=2*(this.R[k]+this.L[k+1]+this.nL[0])/(A1+A2+An);
      this.Lin[k]   = A1*pj - this.R[k];
      this.Rin[k+1] = A2*pj - this.L[k+1];
      const into = An*pj - this.nL[0];
      for(let j=0;j<this.nN-1;j++){ this.nRin[j+1]=this.nR[j]; this.nLin[j]=this.nL[j+1]; }
      this.nRin[0]=into;
      this.nLin[this.nN-1]=this.nR[this.nN-1]*this.nEnd;
      this.nasalOut=(1+this.nEnd)*this.nR[this.nN-1];      // radiates from the nostrils
      const dn=this.dampNow===undefined?this.damp:this.dampNow;
      for(let j=0;j<this.nN;j++){ this.nR[j]=this.nRin[j]*dn; this.nL[j]=this.nLin[j]*dn; }
    } else this.nasalOut=0;
    if(this.bOpen>0.0005){                 // three-port junction where the branch taps in
      const k=Math.max(0,Math.min(n-2,this.bPos));
      const A1=this.A[k], A2=this.A[k+1], Ab=this.bArea*this.bOpen;
      const pj=2*(this.R[k]+this.L[k+1]+this.bL[0])/(A1+A2+Ab);
      this.Lin[k]   = A1*pj - this.R[k];
      this.Rin[k+1] = A2*pj - this.L[k+1];
      const into = Ab*pj - this.bL[0];
      for(let j=0;j<this.bN-1;j++){ this.bRin[j+1]=this.bR[j]; this.bLin[j]=this.bL[j+1]; }
      this.bRin[0]=into;
      this.bLin[this.bN-1]=this.bR[this.bN-1]*this.bEnd;
      const dmb=this.dampNow===undefined?this.damp:this.dampNow;
      for(let j=0;j<this.bN;j++){ this.bR[j]=this.bRin[j]*dmb; this.bL[j]=this.bLin[j]*dmb; }
    }
    this.Lin[n-1]=this.R[n-1]*this.lipR;
    const out=(1+this.lipR)*this.R[n-1] + (this.nasalOut||0);
    const dm=this.dampNow===undefined?this.damp:this.dampNow;
    for(let i=0;i<n;i++){ this.R[i]=this.Rin[i]*dm; this.L[i]=this.Lin[i]*dm; }
    return out;
  }
  process(inputs,outputs){
    const out=outputs[0][0];
    const n=this.n, sr=sampleRate;
    for(let s=0;s<out.length;s++){
      // ---- articulation ----
      if(this.seq){
        this.seqT += 1/sr;
        const K=this.seq.keys;
        let done=true;
        if(this.seqT < this.blend){          // glide into the first keyframe
          let u=this.seqT/this.blend; u=u*u*(3-2*u);
          const k0=K[0];
          for(let i=0;i<n;i++) this.tgt[i]=this.seqFrom[i]+(k0.d[i]-this.seqFrom[i])*u;
          this.bOpen=this.seqFromB+((k0.b||0)-this.seqFromB)*u;
          done=false;
        } else
        for(let k=1;k<K.length;k++){
          if(this.seqT<=K[k].t){
            const a=K[k-1], b=K[k];
            let u=(this.seqT-a.t)/(b.t-a.t); u=u*u*(3-2*u);
            for(let i=0;i<n;i++) this.tgt[i]=a.d[i]+(b.d[i]-a.d[i])*u;
            this.bOpen=(a.b||0)+((b.b||0)-(a.b||0))*u;
            this.nasal=(a.nz||0)+((b.nz||0)-(a.nz||0))*u;
            this.voiceless=(u<0.5?(a.vl||0):(b.vl||0));
            this.fric=((a.fr||0)+((b.fr||0)-(a.fr||0))*u)*(this.hiss===undefined?1:this.hiss);
            this.asp=(a.as||0)+((b.as||0)-(a.as||0))*u;
            const la=a.lv===undefined?1:a.lv, lb=b.lv===undefined?1:b.lv;
            this.lv=la+(lb-la)*u;
            // A pause is silence, not stillness — the tract goes on moving toward the next
            // sound while no air flows. That movement IS anticipatory coarticulation.
            this.silNow=(u<0.5?(a.sil||0):(b.sil||0));
            done=false; break;
          }
        }
        if(done){
          if(this.seqT>this.seq.end){
            this.seq=null; this.voicing=0; this.lv=1;   // the word is over
            this.fric=0; this.asp=0; this.flow=0; this.flowT=0; this.turb=1; this.turbT=1;
            this.turbCd=0; this.fh1=0; this.fh2=0; this.fhx=0; this.fhy=0;   // the air stops
            this.target.set(this.diam);      // hand the tract back where it stands
          }
          else { const last=K[K.length-1];
                 for(let i=0;i<n;i++) this.tgt[i]=last.d[i];
                 this.bOpen=last.b||0; this.nasal=last.nz||0; this.voiceless=last.vl||0;
                 this.fric=(last.fr||0)*(this.hiss===undefined?1:this.hiss);
                 this.asp=last.as||0; this.silNow=last.sil||0;
                 this.lv=last.lv===undefined?1:last.lv; }
        }
        if(this.seq){                        // only read the contour while one exists
          const F=this.seq.f0;
          let f=F[F.length-1][1];
          for(let k=1;k<F.length;k++) if(this.seqT<=F[k][0]){
            const [t0,v0]=F[k-1],[t1,v1]=F[k];
            // SEMITONES, NOT HERTZ. Pitch is heard logarithmically: a fall from 200 to 100
            // puts its perceptual midpoint at 141, not 150. Interpolating linearly in Hz made
            // every fall in every voice the wrong SHAPE — too slow at the top, too fast at the
            // bottom — while still hitting all the right endpoints, which is exactly why it
            // never showed up as a wrong note.
            f = (t1===t0 || v0<=0 || v1<=0) ? v1
              : v0*Math.pow(v1/v0, (this.seqT-t0)/(t1-t0));
            break;
          }
          this.f0=f;
        }
      } else {
        for(let i=0;i<n;i++) this.tgt[i]=this.diam[i]+(this.target[i]-this.diam[i])*0.0006;
        this.bOpen += (this.bTarget-this.bOpen)*0.0006;
        this.nasal += (this.nasalT-this.nasal)*0.0006;
      }
      // ---- the articulators have mass ----
      // A critically damped second-order follower: it cannot overshoot, cannot teleport, and
      // when there is not enough time it simply does not arrive. That last property is the
      // point. Undershoot is not added here — it is what remains when a bounded thing is asked
      // to move further than it can, which is what a real tongue does in fast speech.
      //
      // artTau = 0 tracks the target exactly, which is the behaviour before this existed.
      if(this.artTau>0){
        const dt=1/sr;
        for(let i=0;i<n;i++){
          // CRITICAL GESTURES ARE STIFFER. A constriction you have to hit — a stop's closure,
          // a fricative's channel — is made with more effort than a vowel target, and in a
          // mass-spring account that is literally a stiffer spring and so a shorter time
          // constant. Articulatory phonology says the same thing in its own words.
          //
          // Criticality here is just how narrow the target is, which needs no extra data and
          // is the right shape anyway: a vowel has no surface to press against and nothing to
          // be precise about, while a sibilant channel is a few millimetres wide and being
          // wrong by one of them is the difference between /z/ and a glide.
          //
          // Without this, a uniform time constant silenced /z/ outright — 0% of a vowel —
          // because undershoot widened the channel past the point where the jet forms. A
          // fricative with no turbulence is not a quieter fricative.
          const tt=this.tgt[i];
          const stiff = tt<0.6 ? Math.max(0.22, tt/0.6) : 1;
          const w=1/(this.artTau*stiff), kk=w*w, cc=2*w;
          // A tongue does not AIM at the palate, it aims past it and the palate stops it. That
          // is why a stop closes even in fast speech while a vowel is free to fall short: the
          // target is beyond the surface and contact clamps it. Without this, a uniform time
          // constant above about 20 ms stops the tract sealing at all — measured, /d/ and /t/
          // reaching 0.308 where 0.14 is needed — and a stop that does not close is not a
          // reduced stop, it is a different sound.
          // Aim past the surface only when the gesture is actually a CLOSURE. Narrowness alone
          // cannot tell one from a tight fricative: /z/ targets 0.062, well under the 0.14 that
          // marks a stop, and aiming past it drove the channel shut — /z/ measured 0.020 and
          // fell silent, because the jet needs the constriction to stay above 0.030. A
          // fricative is not trying to close; it is trying to hold a gap a few millimetres
          // wide, which is the harder thing and the reason sibilants are acquired late.
          // `fric` already says which is which, so nothing new has to be plumbed.
          const goal = (this.fric<0.01 && this.tgt[i]<0.14) ? this.tgt[i]-0.45 : this.tgt[i];
          this.dv[i]+=(kk*(goal-this.diam[i]) - cc*this.dv[i])*dt;
          this.diam[i]+=this.dv[i]*dt;
          if(this.diam[i]<0.02) { this.diam[i]=0.02; if(this.dv[i]<0) this.dv[i]=0; }
        }
      } else {
        for(let i=0;i<n;i++){ this.diam[i]=this.tgt[i]; this.dv[i]=0; }
      }
      this.calcRefl();

      // ---- source ----
      if(--this.jitCd<=0){ this.jitT=Math.random()*2-1; this.jitCd=(sr*0.025)|0; }
      this.jit += (this.jitT-this.jit)*0.004;
      this.phase += (this.f0*(1+this.jit*0.004*this.jitAmt))/sr;
      if(this.phase>=1) this.phase-=1;

      let amp=this.voicing;
      // Behind a closure, oral pressure rises toward subglottal pressure, the pressure drop
      // across the folds collapses, and voicing fades. That is why a voiced stop cannot be
      // held. Driving the glottis at full power into a sealed tube stored energy that had to
      // come out somewhere — which it did, as a 165% overshoot at the release.
      // Pressure only builds if the air has nowhere to go. With the velum open it escapes
      // through the nose, which is exactly why /m/ can be held forever and /b/ cannot —
      // and why applying the stop's voice-bar decay to a nasal silenced it.
      const sealedFor = (this.prevClose<0.14 && this.nasal<0.15) ? (this.charge||0) : 0;
      // A narrow constriction raises oral pressure and cuts the flow across the folds. That
      // is why a voiced fricative is quieter than a vowel — /z/ and /ð/ were louder, which
      // is backwards. Not a full stop's voice bar, but the same physics in miniature.
      const squeeze = (this.prevClose < 0.55 && this.nasal < 0.15)
        ? 1 - 0.62 * Math.min(1, (0.55 - this.prevClose) / 0.42) : 1;
      const voiceBar = 1 - 0.88*sealedFor;
      if(this.seq){
        // The glottis does not pause for a stop. It buzzes the whole way through; the SEAL is
        // what makes the silence, and the release is abrupt because the tube opens, not because
        // an envelope ramps. Fading voicing here was adding a 60 ms rise — which is a /w/.
        // AIRFLOW and VOICING are different things. Air moves through a /s/ for its whole
        // duration; the folds simply are not vibrating. Gating frication on voicing silenced
        // every voiceless fricative, because for those, voicing is zero by definition.
        let flow=1;
        const spin=Math.max(0.025,this.blend+0.010);
        if(this.seqT<spin) flow*=this.seqT/spin;
        const tail=this.seq.end-this.seqT;
        if(tail<0.16) flow*=Math.max(0,tail/0.16);   // short, or it eats a final consonant
        // AND AFTER EVERY PAUSE, NOT JUST AT THE START. The spin-up above is keyed on seqT,
        // the time since the whole utterance began, so it ramps once and never again. After an
        // internal pause the flow went from 0 to 1 with only the 5.7 ms one-pole to soften it —
        // a rise from DIGITAL SILENCE to full amplitude in about nine milliseconds, which the
        // ear hears as a click. Measured across "I love my daughter": silence at 3e-12 before
        // the /l/ of "love" and 1.3e-2 thirty milliseconds later, while a mid-word transition
        // in the same phrase runs 1.5e-2 to 1.5e-2 with no step at all.
        //
        // Reported as a pop "before the L and D", with the guess that it was trapped air
        // released by the tongue rising to the palate. Right place, wrong mechanism: /l/ and
        // /d/ are simply what "love" and "daughter" start with, and every word onset after a
        // pause does this regardless of which sound it is — /m/ in "my" does it too.
        if(this.silNow){ flow=0; this.sinceSil=0; }
        else {
          const on = this.onset===undefined ? 0.035 : this.onset;
          this.sinceSil = (this.sinceSil===undefined ? on : this.sinceSil) + 1/sr;
          if(on>0 && this.sinceSil<on) flow*=this.sinceSil/on;
        }
        this.flowT=flow;
        amp = (this.voiceless||this.vot>0) ? 0 : flow*voiceBar*squeeze*this.lv;
      } else {
        this.flowT = this.voicing;
        amp = (this.voiceless||this.vot>0) ? 0 : this.voicing*voiceBar*squeeze;
      }
      this.flow += ((this.flowT||0)-this.flow)*0.004;
      this.vAmp += (amp-this.vAmp)*0.004;
      // effort presses the folds: Rd falls toward the pressed end at the peak of the word
      let eff=0;
      if(this.seq && this.seq.end>0){
        const u=this.seqT/this.seq.end;
        eff=Math.max(0,Math.sin(Math.PI*Math.min(1,u))); }
      const rdNow=Math.max(0.3, this.rd-(this.rd-0.34)*this.press*eff);
      if(Math.abs(rdNow-this.lastRd)>0.012){ this.makeLF(rdNow); this.lastRd=rdNow; }
      let g;
      if(this.folds>0.5){
        // Breath pressure wobbles in a real speaker, and the folds convert that one wobble
        // into jitter, shimmer and waveform change together. Feed it the wobble; let the
        // physics distribute it.
        this.fDrift += ((Math.random()*2-1) - this.fDrift*0.02)*0.02;
        const eff=Math.max(0, Math.min(1, this.press||0.3));
        this.setFolds(this.f0, eff);
        this.fPsNow=this.fPs*(1 + this.fDrift*0.10);
        const u=this.foldStep();
        // The tract is driven by the DERIVATIVE of flow, which is what LF supplies directly.
        g=(u-this.fPrev)*0.055; this.fPrev=u;
      } else {
        g=this.glottal(this.phase);
      }
      // LF gives the DERIVATIVE of flow; the flow itself is its integral, and flow is a good
      // proxy for how open the folds are. Reset each cycle so it cannot drift.
      this.gflow += g;
      if(this.phase < this.lastPhase) this.gflow = 0;      // new cycle
      this.lastPhase = this.phase;
      // During a VOICELESS sound the folds are abducted — held apart — so the glottis is wide
      // open and reflects little. Deriving the area from flow alone made it zero, i.e. sealed,
      // which is the opposite of the truth and turned the glottis into a mirror.
      // Abduction opens the glottis WIDER than the phonatory cycle ever does — the folds are
      // pulled apart and held there, well beyond their peak opening while vibrating.
      this.gArea = (this.voiceless||this.vot>0)
        ? 2.2
        : Math.max(0, Math.min(1, this.gflow * 0.02));
      // BREATH NOISE IS SHAPED, NOT WHITE. Radiation at the lips is a differentiator —
      // R(z) = 1 - 1/z, +6 dB/octave — which is correct physics and requires the source to roll
      // off to compensate. This term did not: it went in as raw white noise, so the whole voice
      // rose toward Nyquist. Measured tilt 4-20 kHz on a sustained /ɑ/: **+4.4 dB/oct**, where
      // real speech falls. Two poles at a=0.86 is 1059 Hz each, -12 dB/oct, which against
      // radiation's +6 lands at -6 — the published range for aspiration, and what /h/ already
      // measured, because /h/ was the one sound whose noise already went through this filter.
      //
      // THIS IS THE SECOND ATTEMPT. The first shipped as b1671ae with the gain set to 5.139,
      // the reciprocal of the 0.1946 of unit-variance white the filter passes, so the amount of
      // noise would be unchanged and only its colour would move. It was reverted as ea9a62d for
      // breaking the bench and rendering "goal" as static with gaps.
      //
      // Neither symptom survived measurement this time. There is no clipping: peak output is
      // 0.04 against a ceiling of 1. And the "gap" is the /g/ CLOSURE, which is supposed to be
      // silent — 3.2e-4 unfiltered against 7.3e-5 filtered. The unfiltered noise had been
      // leaking audible hiss through stop closures, and removing it reads as the sound dropping
      // out. That is the fix working, not failing.
      //
      // The gain is 1.93 rather than 5.139: matched on PEAK instead of on variance. Lowpassing
      // correlates the noise, so restoring its RMS gives it 2.66x the excursion (crest 1.73 ->
      // 4.61, measured over four million samples), and 5.139/2.66 = 1.93. Chosen on evidence
      // rather than taste — both pass the full gate, but harmonic-to-noise goes 22.8 -> 24.5 dB
      // at this gain against 22.8 -> 16.0 at 5.139, and the presets were calibrated against
      // 22.8. This is the smaller perturbation to a number other things were tuned to.
      this.bh1=(this.bh1||0)*0.86+(Math.random()*2-1)*0.14;
      this.bh =(this.bh ||0)*0.86+this.bh1*0.14;
      let src=(g*0.9 + this.bh*1.93*this.breath*g)*this.vAmp;
      // /h/ is not a constriction fricative — it is turbulence at the GLOTTIS with the tract
      // wide open. It needs a noise path that does not require the folds to be vibrating, or
      // a voiceless /h/ is silent. Which is exactly what it was.
      // Aspiration after a voiceless release. The tract is already open and moving toward
      // the vowel, so this noise is filtered by the vowel's own formants — which is exactly
      // what makes an aspirated /pʰ/ sound aspirated rather than merely late.
      if(this.vot>0){
        this.vh1=(this.vh1||0)*0.86+(Math.random()*2-1)*0.14;
        this.vh =(this.vh ||0)*0.86+this.vh1*0.14;
        src += this.vh*0.55*Math.min(1,this.vot/(sr*0.012));   // fades as voicing returns
        this.vot--;
      }
      if(this.asp>0.001){
        // Aspiration is quiet and takes its colour from the tract it passes through. Loud
        // and broadband is a wall of static, which is what this was.
        this.ah1=(this.ah1||0)*0.86+(Math.random()*2-1)*0.14;
        this.ah =(this.ah ||0)*0.86+this.ah1*0.14;
        src += this.ah*this.asp*this.flow*0.70;   // wider abduction lets more escape backward
      }

      // ---- the tube ----
      let y=0;
      for(let k=0;k<this.steps;k++) y += this.scatter(src/this.steps);
      y/=this.steps;

      // ---- stop release: turbulence when a seal springs open ----
      let mi=1, cl=1e9;                       // the narrowest point IS the place of articulation
      for(let i=1;i<n-1;i++) if(this.diam[i]<cl){ cl=this.diam[i]; mi=i; }
      // A sealed tract is not a lossless cavity. The walls are soft tissue and absorb, so a
      // closure cannot store energy indefinitely and hand it all back at the release.
      this.dampNow = cl<0.14 ? this.damp*0.9975 : this.damp;
      // A stop is silence, then a bang. Charge while the tube is sealed — a stand-in for the
      // pressure a real speaker builds — then spend it the moment the seal breaks.
      if(cl<0.14){
        // THE VELUM VENTS. A nasal seals the mouth exactly as a stop does — /m/ at the lips,
        // /n/ at the ridge, /ŋ/ at the velum — so `cl` alone cannot tell them apart, and this
        // charged behind every one of them and fired a stop burst on release. That is a
        // sealed cavity released under pressure, which is what a CLICK is, and it was heard
        // as one: reported as sounding like a Kalahari bushman rather than like an artifact.
        // The right description, because the burst was not a glitch — it was correct
        // synthesis of an event that should not have been happening.
        //
        // The file already knew this. A hundred lines up, `sealedFor` checks `nasal<0.15`
        // with the comment "pressure only builds if the air has nowhere to go — with the
        // velum open it escapes through the nose, which is exactly why /m/ can be held
        // forever and /b/ cannot". The fact was applied to the voice bar and not to the
        // charge that feeds the burst.
        //
        // A threshold is not enough: the mouth closes before the velum has finished opening,
        // so a hard `nasal<0.15` test still let three of eight bursts through during the
        // approach. Pressure does not vent at a threshold, it vents continuously — so the
        // charge builds at a rate set by how sealed the system is, and what is already there
        // leaks away through an open nose with about a 20 ms time constant.
        const vent=Math.min(1,this.nasal/0.15);
        this.charge=Math.min(1,(this.charge||0)+(1-vent)/(sr*0.05));
        if(vent>0) this.charge*=1-vent/(sr*0.02);
        this.sealAt=mi;
        // Latch the glottal state DURING the closure. Read at the release instead, /t/ and
        // /k/ open after the keyframe midpoint has already handed voicing back, so they
        // looked voiced and got no aspiration at all while /p/ got 55 ms. Whether a stop is
        // aspirated is decided by what the folds were doing behind the seal, not by what
        // they happen to be doing at the instant it breaks.
        this.sealVl=this.voiceless;
      } else if((this.charge||0)>0.12 && cl>0.22){
        this.burstN=Math.floor(sr*0.014);
        // A release near the lips radiates almost directly; one at the velum has a whole
        // mouth in front of it to excite. Scaling by the front cavity is why a labial /b/ is
        // a soft thump and a velar /k/ is a crisp burst.
        const frontFrac=(n-1-(this.sealAt||mi))/n;
        this.burstA=this.charge*(this.burstK===undefined?0.16:this.burstK)
                    *(this.voiceless?2.0:1)*(0.35+1.3*frontFrac);
        this.burstAt=this.sealAt||mi;
        this.charge=0;
        // A burst is coloured by the cavity IN FRONT of the release, so the filter that
        // shapes it has to follow the place. One fixed lowpass at ~860 Hz sat below every
        // front-cavity resonance and erased place outright: b, d and g all measured a
        // 750 Hz peak with ~90% of their energy under 1.5 kHz — the same dark thump three
        // times. Blind listening duly returned g as d and k as t.
        const secCm=35000/(sr*this.steps);
        const frontCm=Math.max(0.45,(n-1-this.burstAt)*secCm);
        // A front cavity only rings if there IS one. The quarter-wave law diverges as the
        // cavity vanishes, so a labial — released AT the lips, with nothing in front of it —
        // came out at the 5200 Hz ceiling: the BRIGHTEST burst of the three places, where a
        // real /b/ is the dullest. Measured: labial 0.79 cm -> 5200 Hz against alveolar
        // 2.78 cm -> 4568 and velar 7.94 cm -> 1599. The two with real cavities were right
        // and the one without was inverted. The blind bench duly returned /b/ as "hiss" —
        // and /p/ as fine, because 70 ms of aspiration follows a /p/ and covers for it.
        // So the resonance fades out as the cavity stops existing, leaving the diffuse,
        // falling-spectrum puff that a labial burst actually is. 950 Hz is where the old
        // fixed lowpass sat (858 Hz) back when /b/ was heard correctly — calibrated against
        // a build known to get this one right, not guessed.
        const res=35000/(4*frontCm)*1.45;
        const w=Math.min(1,Math.max(0,(frontCm-0.8)/1.2));   // 0 at the lips, 1 by 2 cm
        this.bfc=Math.max(900,Math.min(5200,950*(1-w)+res*w));
        this.bco=Math.exp(-2*Math.PI*this.bfc/sr);
        // keep loudness constant as the cutoff moves: a one-pole lowpass passes
        // (1-a)/(1+a) of unit-variance noise, and 0.0610 is what the old 0.885 passed.
        this.bgain=5.0*Math.sqrt(0.0610/((1-this.bco)/(1+this.bco)));
        // VOICE ONSET TIME. English voicing in a stop is carried almost entirely by the gap
        // between the burst and the return of the folds — roughly 60-80 ms for /p t k/
        // against ~10 for /b d g/. The keyframe interpolation was handing voicing back at
        // the midpoint of the glide, about 19 ms, which is squarely in the VOICED range.
        // So /p/ was heard as /b/, /t/ as /d/, /k/ as /t/. VOT also rises from labial to
        // velar, which makes it a place cue in its own right.
        // 58 / 70 / 80 ms labial / alveolar / velar, measured English values. The first
        // fit ran linear in frontFrac and gave the velar 121 ms, which is a stutter.
        if(this.sealVl) this.vot=Math.floor(sr*Math.min(0.085,0.052+0.075*frontFrac));
      }
      if(this.burstN>0){
        const tot=sr*0.014, age=tot-this.burstN;
        const atk=Math.min(1, age/(sr*0.0009));        // ~1 ms rise, so it is not a step
        const k=this.burstN/tot;
        // A velar burst is a compact mid-frequency blob, not white noise. Two poles of
        // lowpass keep the energy where the ear expects it and stop the injection from
        // being a broadband spike — which is what was reading as a click.
        const a=this.bco, w=1-a;
        this.bn1=(this.bn1||0)*a+(Math.random()*2-1)*w;
        this.bn2=(this.bn2||0)*a+this.bn1*w;
        const b=this.bn2*this.burstA*k*k*atk*this.bgain;
        // pressure escapes toward the opening, not equally in both directions
        this.R[this.burstAt]+=b; this.L[this.burstAt]+=b*0.28;
        this.burstN--;
      }
      // ---- frication ----
      // Turbulence is made where the air squeezes through, NOT at the glottis, and it is
      // injected forward so that only the cavity in FRONT of the constriction shapes it.
      // That is the whole reason /s/ is high and /ʃ/ is lower: a shorter front cavity.
      const breath=this.flow;
      // The turbulence window used HARD edges, so the hiss switched on and off between one
      // sample and the next — which draws a vertical stripe in the spectrogram and is heard
      // as a spike. Real airflow rises and falls; fade the edges instead.
      const sm=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
      if(this.fric>0.001 && breath>0.01 && cl>0.030 && cl<0.48){
        const jet=(1-Math.abs(cl-0.19)/0.28) * sm(0.030,0.075,cl) * (1-sm(0.36,0.48,cl));
        if(jet>0){
          // A sibilant is a jet striking the teeth while the short cavity in front of the
          // constriction rings. Four sections cannot ring on their own, so the resonance is
          // made explicit and tuned to that cavity: /s/ high, /ʃ/ lower, from geometry.
          // How much cavity is actually in FRONT of the constriction? A sibilant has a few
          // centimetres of it and an obstacle to strike, which is why it is loud and peaked.
          // A labiodental or dental is made at the lips and teeth — there is nothing in
          // front to ring, so its spectrum is diffuse and low, not a resonance pushed to the
          // ceiling. Treating those as sibilants put /f/ at 6 kHz where a real one sits
          // near 2.4, and /θ/ at 6 kHz against a real 1.75.
          const frontSec = (n-1) - mi;
          // Graded over five sections, a short tract read as cavity-less and its sibilants
          // went broadband — but a child has a perfectly good /s/. The real distinction is
          // binary-ish: is there enough tube in front to propagate a wave, or is the
          // constriction essentially at the lips? Sharp transition, not a ramp.
          const cavity = Math.max(0, Math.min(1, (frontSec - 2.5) / 1.5));
          const frontM=Math.max(0.004, frontSec*(350/(sampleRate*2)));
          const fGeom=Math.max(1500, Math.min(7600, 350/(4*frontM)));
          // Three sections is not a resonator, so it does not get to claim a 7 kHz
          // resonance. Where there is no cavity the sound is diffuse and mid-frequency —
          // blend toward that rather than trusting a quarter-wave formula on a cavity too
          // short for the formula to mean anything.
          const fc=cavity*fGeom + (1-cavity)*2200;
          if(Math.abs(fc-(this.fcLast||0))>40){
            // End correction: radiation loading makes the cavity acoustically longer than it
            // is geometrically, which lowers the resonance. And a real sibilant is a broad
            // plateau, not a spike — so the resonance is deliberately low-Q.
            const w0=2*Math.PI*(fc*0.82)/sampleRate, r=0.86;
            this.fb1=2*r*Math.cos(w0); this.fb2=-r*r; this.fg=(1-r)*1.6;
            this.fcLast=fc;
          }
          // Turbulence is INTERMITTENT. A jet sheds eddies that form and collapse, so the
          // hiss breathes. Stationary white noise is, by definition, structureless — which is
          // exactly what electronic static is. This is the difference between a hiss you make
          // and a hiss a circuit makes.
          if(--this.turbCd<=0){
            this.turbT=0.38+Math.random()*1.20;
            this.turbCd=Math.floor(sampleRate*(0.005+Math.random()*0.022));
          }
          this.turb += ((this.turbT===undefined?1:this.turbT)-this.turb)*0.0055;
          const raw=(Math.random()*2-1)*this.turb;
          const y=raw*this.fg + this.fb1*(this.fy1||0) + this.fb2*(this.fy2||0);
          this.fy2=this.fy1||0; this.fy1=y;
          // A fricative is broadband noise with a resonance ON TOP of it, not a resonator
          // fed by noise. Resonator-only rolls off above the peak, so /ʃ/ lost the long
          // high tail that a real one has — 28% of its energy above 3 kHz against 57%.
          // Resonance only where a cavity exists; broadband where it does not.
          // Mix broadband against resonance by how much cavity there is — but normalise, or
          // a cavity-less fricative simply gets three times the raw noise and comes out
          // three times too loud.
          // I briefly tilted the source down for cavity-less fricatives, reasoning that slow
          // channel turbulence must be low-frequency. The recording says otherwise: /f/ has
          // 65% of its energy above 3 kHz and /ð/ 63%. They are not LOW, they are BROAD —
          // a low peak with a long tail. Flat source, low corner, little resonance.
          const rawT = raw;
          const wRaw = 0.34 + 0.30*(1-cavity);
          const wRes = 0.80*cavity;
          const norm = 0.62/Math.max(0.30, wRaw + wRes*0.55);
          let sig = (rawT*wRaw + y*wRes) * norm;
          // A sibilant has almost nothing below its peak. Without a steep low cut the tract's
          // own low resonances amplify the noise floor, and the result reads as broadband
          // static rather than as an /s/. Two poles of high-pass at about 2.8 kHz.
          // The low cut has to track the sound. A fixed 2.8 kHz corner makes every fricative
          // a sibilant by force: it cannot produce a /ʃ/ at 2.2 kHz or a /θ/ at 1.8 kHz,
          // because it removes exactly the band those live in. Corner follows the front
          // cavity, and the gain is normalised so moving it does not change the level —
          // which is what went wrong the first time this was tried.
          // with no front cavity there is no reason to cut the low end hard either
          // With no cavity the corner was dropping very low and the lows swamped the sound.
          // But a narrow aperture at the lips radiates high frequencies better, not worse —
          // a real /f/ carries 65% of its energy above 3 kHz. Keep the floor up.
          const hc=Math.max(700, Math.min(3200, fc*0.52*(0.62+0.38*cavity)));
          const ha=Math.exp(-2*Math.PI*hc/sampleRate);
          const hgain=0.671/Math.max(0.10, ha);
          this.fh1 = ha*((this.fh1||0) + sig - (this.fhx||0));       this.fhx = sig;
          this.fh2 = ha*((this.fh2||0) + this.fh1 - (this.fhy||0));  this.fhy = this.fh1;
          const at=Math.min(n-2, mi+1);
          // Level rides here too: an unstressed syllable is quieter because less air is
          // moving, and the same air makes the frication. Applying it only to the voiced part
          // would make an unstressed /s/ the loudest thing in the word.
          this.R[at] += this.fh2 * hgain * jet * this.fric * breath * 0.95 * this.lv;
        }
      }
      this.prevClose=cl;

      // DC block
      const yy = y - this.dcX + 0.995*this.dcY;
      this.dcX=y; this.dcY=yy;
      out[s]=Math.max(-1,Math.min(1,yy*0.8));

      // ---- energy readout for the visualiser ----
      if((this.tick & 63)===0){
        for(let i=0;i<n;i++){
          const e=Math.abs(this.R[i])+Math.abs(this.L[i]);
          this.energy[i]=this.energy[i]*0.75+e*0.25;
        }
      }
      if((this.tick % 512)===0){
        this.port.postMessage({e:this.energy, d:Float32Array.from(this.diam),
                               on:this.vAmp>0.02, v:this.voicing, seq:!!this.seq});
      }
      this.tick++;
    }
    return true;
  }
}
registerProcessor('tract', TractProcessor);
