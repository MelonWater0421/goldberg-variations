/* J.S. Bach · Goldberg Variations, BWV 988 (Yunchan Lim · Live at Carnegie Hall, 2025)
 * Interactive Zero-Jargon Architecture Lab & 32-Pillar Multi-Voice Visualizer. */
(()=>{
  'use strict';
  const D=window.GOLDBERG_DATA, M=D.metadata||{}, E=window.GOLDBERG_ENGINE;
  const $=id=>document.getElementById(id);
  const fmt=E.formatTime;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const storageKey=M.storageKey||'goldberg-lim-carnegie-v1';
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}

  const state={
    index:E.clamp(saved.index??0,0,D.tracks.length-1),
    lang:saved.lang==='en'?'en':'zh',
    theme:saved.theme==='light'?'light':'dark',
    speed:[0.75,1,1.25].includes(saved.speed)?saved.speed:1,
    pillarLock:saved.pillarLock!==false,
    continuous:saved.continuous!==false,
    loopStage:false,
    primerOpen:saved.primerOpen!==false,
    matrixFilter:'all',
    ghostBass:false,
    muted:{},
    positions:saved.positions||{}
  };

  const t=(zh,en)=>state.lang==='en'?(en||zh):zh;
  const tr=(obj,field)=>{
    if(!obj)return '';
    return state.lang==='en'?(obj[field+'_en']||obj[field]||''):(obj[field]||'');
  };
  const store=()=>{
    try{
      localStorage.setItem(storageKey,JSON.stringify({
        index:state.index,lang:state.lang,theme:state.theme,speed:state.speed,
        pillarLock:state.pillarLock,continuous:state.continuous,
        primerOpen:state.primerOpen,positions:state.positions
      }));
    }catch{}
  };

  const audio=$('audio');
  audio.volume=0.78;
  audio.playbackRate=state.speed;

  let loadSerial=0, pendingSeek=0, pendingAutoplay=false, toastTimer=null;
  let synthCtx=null, synthNodes=[], synthGains=[], synthTimer=null, synthAnim=null;
  let synthState={active:false,mode:null,startAt:0,q0:0,q1:0,bpm:96,trackIdx:0};
  let primerMode={canon:'v3'};
  let rafId=null, lastLitKeys=new Set(), lastPillarKey='', lastStageIdx=-1;

  const PILLAR_MIDI=[
    55,54,52,50,47,48,50,43,
    55,54,52,50,47,49,50,50,
    50,47,48,47,43,42,47,40,
    48,47,45,43,48,50,38,43
  ];

  const track=()=>D.tracks[state.index];
  const isPlaying=()=>!audio.paused&&!audio.ended;
  const wantsPlayback=()=>isPlaying()||pendingAutoplay;

  function voiceColors(trObj){
    const n=trObj.voiceCount||2;
    if(n===2)return trObj.id===27?['#f59e0b','#38bdf8']:['#f59e0b','#34d399'];
    if(n===3)return ['#f59e0b','#38bdf8','#34d399'];
    return ['#f59e0b','#38bdf8','#c084fc','#34d399'];
  }

  function toast(msg){
    const el=$('toast');
    el.textContent=msg;
    el.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{el.hidden=true;},3200);
  }

  function currentAudioTime(){
    if(audio.readyState>0&&!pendingAutoplay)return audio.currentTime||0;
    return Number.isFinite(pendingSeek)?pendingSeek:(audio.currentTime||0);
  }

  function ensureAudioCtx(){
    if(!synthCtx)synthCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(synthCtx.state==='suspended')synthCtx.resume();
    return synthCtx;
  }

  function stopSynth(){
    synthState.active=false;
    synthState.mode=null;
    if(synthAnim){cancelAnimationFrame(synthAnim);synthAnim=null;}
    if(synthTimer){clearTimeout(synthTimer);synthTimer=null;}
    for(const n of synthNodes){try{n.stop();n.disconnect();}catch{}}
    synthNodes=[];
    synthGains=[];
    document.querySelectorAll('.primer-pillar-box.lit').forEach(el=>el.classList.remove('lit'));
    updateLabButtons();
    renderVisualFrame();
  }

  function schedulePianoNote(ctx,midi,at,dur,dest,tone='voice'){
    const freq=440*Math.pow(2,(midi-69)/12);
    const osc1=ctx.createOscillator(), osc2=ctx.createOscillator();
    const filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    if(tone==='ghost'){
      osc1.type='sine';osc1.frequency.value=freq;
      osc2.type='triangle';osc2.frequency.value=freq*2;
      filter.type='lowpass';filter.frequency.value=900;
      const d=Math.min(Math.max(dur,0.35),1.8);
      gain.gain.setValueAtTime(0,at);
      gain.gain.linearRampToValueAtTime(0.16,at+0.015);
      gain.gain.exponentialRampToValueAtTime(0.002,at+d);
      osc1.connect(filter);osc2.connect(filter);filter.connect(gain);gain.connect(dest);
      osc1.start(at);osc2.start(at);osc1.stop(at+d+0.03);osc2.stop(at+d+0.03);
      synthNodes.push(osc1,osc2);
      return;
    }
    osc1.type='triangle';osc1.frequency.value=freq*0.9992;
    osc2.type='sawtooth';osc2.frequency.value=freq*1.0008;
    const osc2Gain=ctx.createGain();osc2Gain.gain.value=0.28;
    filter.type='lowpass';
    filter.frequency.setValueAtTime(Math.min(4200,freq*5.5),at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(650,freq*1.8),at+Math.min(dur,0.9));
    const d=Math.max(0.12,dur);
    gain.gain.setValueAtTime(0,at);
    gain.gain.linearRampToValueAtTime(0.17,at+0.01);
    gain.gain.exponentialRampToValueAtTime(0.045,at+Math.min(d*0.75,0.65));
    gain.gain.linearRampToValueAtTime(0.0008,at+d+0.04);
    osc1.connect(filter);osc2.connect(osc2Gain);osc2Gain.connect(filter);
    filter.connect(gain);gain.connect(dest);
    osc1.start(at);osc2.start(at);
    osc1.stop(at+d+0.06);osc2.stop(at+d+0.06);
    synthNodes.push(osc1,osc2);
  }

  /* ---------- Build 88-Key Virtual Piano ---------- */
  const keyEls=new Map();
  function buildPiano88(){
    const host=$('piano88');
    host.innerHTML='';
    keyEls.clear();
    const isBlack=m=>[1,3,6,8,10].includes(m%12);
    let whiteCount=0;
    for(let m=21;m<=108;m++)if(!isBlack(m))whiteCount++;
    let wIdx=0;
    for(let m=21;m<=108;m++){
      if(!isBlack(m)){
        const el=document.createElement('div');
        el.className='wk';
        el.style.left=`${(wIdx/whiteCount)*100}%`;
        el.style.width=`${(1/whiteCount)*100}%`;
        el.title=E.midiName(m);
        host.appendChild(el);
        keyEls.set(m,el);
        wIdx++;
      }
    }
    wIdx=0;
    for(let m=21;m<=108;m++){
      if(!isBlack(m)){
        if(m+1<=108&&isBlack(m+1)){
          const bk=document.createElement('div');
          bk.className='bk';
          const wPct=100/whiteCount;
          bk.style.left=`${(wIdx+0.67)*wPct}%`;
          bk.style.width=`${wPct*0.66}%`;
          bk.title=E.midiName(m+1);
          host.appendChild(bk);
          keyEls.set(m+1,bk);
        }
        wIdx++;
      }
    }
  }

  /* ---------- Build 32-Pillar Compass ---------- */
  function renderPillarCompass(){
    const grid=$('pillarGrid');
    grid.innerHTML=D.groundPillars.map(p=>{
      const [num,noteZh,noteEn,solf,deg]=p;
      return `<button class="pillar-cell ${num>16?'part-b':''}" id="pcell-${num}" data-pillar-jump="${num}" title="${t(`第 ${num} 根地基立柱 · 低音 ${noteEn} (${solf}) · 和声 ${deg}`,`Pillar #${num} · Bass ${noteEn} (${solf}) · Harmony ${deg}`)}"><small>#${num}</small><b>${esc(t(noteZh,noteEn.replace(/\d/,'')))}</b><em>${esc(solf)}</em></button>`;
    }).join('');
  }

  /* ---------- Build Zero-Jargon Primer Sandbox ---------- */
  function renderPrimer(){
    const P=D.primer;
    $('primerEyebrow').textContent=t('ZERO-JARGON INTERACTIVE SANDBOX · 零识谱互动入门','ZERO-JARGON INTERACTIVE SANDBOX · LEARN BY EAR');
    $('primerHeadline').textContent=tr(P,'headline');
    $('primerIntro').textContent=tr(P,'intro');
    $('primerBody').hidden=!state.primerOpen;
    $('togglePrimerBody').textContent=state.primerOpen?t('收起入门沙盒 ▲','Hide Sandbox ▲'):t('展开入门沙盒 ▼','Open Sandbox ▼');

    const steps=P.steps||[];
    $('primerBody').innerHTML=steps.map(st=>{
      let viz='', actions='';
      if(st.id==='ground'){
        const first8=D.groundPillars.slice(0,8);
        viz=`<div class="primer-viz"><div class="primer-pillars-demo">${first8.map((p,i)=>`<div class="primer-pillar-box" id="ppbox-${i+1}">${esc(p[1])}<br><small>${esc(p[3])}</small></div>`).join('')}</div></div>`;
        actions=`<div class="primer-actions">
          <button data-primer-demo="bass8" class="gold-soft">${t('🔔 1. 只听8根地基','🔔 1. Bass Pillars Only')}</button>
          <button data-primer-demo="aria8">${t('👑 2. 叠咏叹调','👑 2. + Aria')}</button>
          <button data-primer-demo="var1_8">${t('💃 3. 叠第1变奏','💃 3. + Var. 1')}</button>
          <button data-primer-demo="var30_8">${t('🍻 4. 叠第30民歌','🍻 4. + Var. 30')}</button>
        </div>`;
      }else if(st.id==='canon'){
        viz=`<div class="primer-viz"><canvas id="primerCanonCanvas" class="primer-mini-canvas" height="76"></canvas></div>`;
        actions=`<div class="primer-actions">
          <button data-primer-demo="canon_v3" class="gold-soft">${t('🏃 同向追逐（第3变奏·一度卡农）','🏃 Shadow Chase (Var. 3 Unison)')}</button>
          <button data-primer-demo="canon_v15">${t('🪞 上下倒影（第15变奏·五度镜像）','🪞 Mirror Canon (Var. 15 Inverted)')}</button>
        </div>`;
      }else{
        viz=`<div class="primer-viz"><canvas id="primerCrossCanvas" class="primer-mini-canvas" height="76"></canvas></div>`;
        actions=`<div class="primer-actions">
          <button data-primer-demo="cross_v5" class="gold-soft">${t('⚡ 慢速拆解听交叉（第5变奏）','⚡ Hear Hand-Crossing (Var. 5)')}</button>
          <button data-jump-track="5">${t('▶ 听任奫灿卡内基真实现场','▶ Play Lim Live (Var. 5)')}</button>
        </div>`;
      }
      return `<article class="primer-card"><span class="primer-step-tag">STEP ${st.stepNum} · ${esc(tr(st,'tagline'))}</span><h3>${esc(tr(st,'title'))}</h3><p>${esc(tr(st,'body'))}</p>${viz}${actions}</article>`;
    }).join('');
    drawPrimerStaticCanvases();
  }

  function drawMiniRibbon(canvasId,trIdx,qEnd,voicesToShow,showMirror,playheadQ=-1){
    const c=$(canvasId);if(!c)return;
    const dpr=window.devicePixelRatio||1, w=c.clientWidth||280, h=c.clientHeight||76;
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const trObj=D.tracks[trIdx];if(!trObj)return;
    const notes=trObj.notes.filter(n=>n[0]<qEnd&&voicesToShow.includes(n[3]));
    if(!notes.length)return;
    const pitches=notes.map(n=>n[2]);
    const minP=Math.min(...pitches)-2, maxP=Math.max(...pitches)+2;
    if(showMirror){
      const midY=h/2;
      ctx.strokeStyle='#fbbf2488';ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(0,midY);ctx.lineTo(w,midY);ctx.stroke();ctx.setLineDash([]);
    }
    const cols=['#f59e0b','#38bdf8','#34d399'];
    for(const [st,du,mi,vi] of notes){
      const x=(st/qEnd)*w, nw=Math.max(2.5,(du/qEnd)*w);
      const y=h-6-((mi-minP)/Math.max(1,maxP-minP))*(h-12);
      const active=playheadQ>=st&&playheadQ<=st+du;
      ctx.fillStyle=cols[vi]||'#f59e0b';
      ctx.globalAlpha=active?1:0.78;
      ctx.fillRect(x,y-(active?3.5:2.2),nw,active?7:4.4);
    }
    if(playheadQ>=0&&playheadQ<=qEnd){
      const px=(playheadQ/qEnd)*w;
      ctx.globalAlpha=1;ctx.fillStyle='#fde68a';ctx.fillRect(px-1,0,2,h);
    }
  }

  function drawPrimerStaticCanvases(){
    if(primerMode.canon==='v15')drawMiniRibbon('primerCanonCanvas',15,16,[0,1],true,-1);
    else drawMiniRibbon('primerCanonCanvas',3,24,[0,1],false,-1);
    drawMiniRibbon('primerCrossCanvas',5,24,[0,1],false,-1);
  }

  function playPrimerDemo(kind){
    pauseAudio();
    stopSynth();
    const ctx=ensureAudioCtx();
    const master=ctx.createGain();master.gain.value=0.9;master.connect(ctx.destination);
    const now=ctx.currentTime+0.05;
    synthState.active=true;synthState.mode='primer:'+kind;
    updateLabButtons();

    if(kind==='bass8'||kind==='aria8'||kind==='var1_8'||kind==='var30_8'){
      const trIdx=kind==='aria8'?0:(kind==='var1_8'?1:30);
      const trObj=D.tracks[trIdx];
      const p9=trObj.pillars[8];
      const qEnd=p9?p9.q:(trObj.totalQ/8);
      const durSec=kind==='bass8'?6.4:7.6;
      const secPerPillar=durSec/8;

      // Always ring the 8 canonical pillars clearly!
      for(let i=0;i<8;i++){
        schedulePianoNote(ctx,PILLAR_MIDI[i],now+i*secPerPillar,secPerPillar*0.92,master,kind==='bass8'?'voice':'ghost');
      }
      if(kind!=='bass8'){
        const secPerQ=durSec/qEnd;
        for(const [st,du,mi,vi] of trObj.notes){
          if(st>=qEnd-0.02)break;
          if(vi===trObj.voiceCount-1&&kind!=='var1_8')continue;
          schedulePianoNote(ctx,mi,now+st*secPerQ,Math.min(du,qEnd-st)*secPerQ,master,'voice');
        }
      }
      const anim=()=>{
        if(!synthState.active||synthState.mode!=='primer:'+kind)return;
        const elap=ctx.currentTime-now;
        const pIdx=Math.floor(elap/secPerPillar)+1;
        for(let i=1;i<=8;i++)$(`ppbox-${i}`)?.classList.toggle('lit',i===pIdx&&elap>=0&&elap<durSec);
        if(elap<durSec+0.15)synthAnim=requestAnimationFrame(anim);
        else stopSynth();
      };
      synthAnim=requestAnimationFrame(anim);
      return;
    }

    if(kind==='canon_v3'||kind==='canon_v15'){
      const is15=kind==='canon_v15';
      primerMode.canon=is15?'v15':'v3';
      const trIdx=is15?15:3;
      const trObj=D.tracks[trIdx];
      const qEnd=is15?16:24;
      const durSec=7.5, secPerQ=durSec/qEnd;
      for(const [st,du,mi,vi] of trObj.notes){
        if(st>=qEnd-0.02)break;
        if(vi<=1)schedulePianoNote(ctx,mi,now+st*secPerQ,Math.min(du,qEnd-st)*secPerQ,master,'voice');
      }
      const anim=()=>{
        if(!synthState.active||synthState.mode!=='primer:'+kind)return;
        const elap=ctx.currentTime-now;
        drawMiniRibbon('primerCanonCanvas',trIdx,qEnd,[0,1],is15,Math.max(0,elap/secPerQ));
        if(elap<durSec+0.15)synthAnim=requestAnimationFrame(anim);
        else{stopSynth();drawPrimerStaticCanvases();}
      };
      synthAnim=requestAnimationFrame(anim);
      return;
    }

    if(kind==='cross_v5'){
      const trObj=D.tracks[5], qEnd=24, durSec=7.2, secPerQ=durSec/qEnd;
      for(const [st,du,mi] of trObj.notes){
        if(st>=qEnd-0.02)break;
        schedulePianoNote(ctx,mi,now+st*secPerQ,Math.min(du,qEnd-st)*secPerQ,master,'voice');
      }
      const anim=()=>{
        if(!synthState.active||synthState.mode!=='primer:cross_v5')return;
        const elap=ctx.currentTime-now;
        drawMiniRibbon('primerCrossCanvas',5,qEnd,[0,1],false,Math.max(0,elap/secPerQ));
        if(elap<durSec+0.15)synthAnim=requestAnimationFrame(anim);
        else{stopSynth();drawPrimerStaticCanvases();}
      };
      synthAnim=requestAnimationFrame(anim);
    }
  }

  /* ---------- Voice Dissection Synth Mode ---------- */
  function playLabSynth(){
    if(synthState.active&&synthState.mode==='lab'){stopSynth();return;}
    pauseAudio();
    stopSynth();
    const ctx=ensureAudioCtx();
    const trObj=track();
    const curT=currentAudioTime();
    const curP=E.activePillarAt(trObj,curT);
    const passPillars=trObj.pillars.filter(p=>p.pass===curP.pass);
    const pStart=passPillars[0]||trObj.pillars[0];
    const lastP=passPillars[passPillars.length-1]||trObj.pillars[trObj.pillars.length-1];
    const nextIdx=trObj.pillars.findIndex(p=>p.seq===lastP.seq)+1;
    const q0=pStart.q, q1=nextIdx<trObj.pillars.length?trObj.pillars[nextIdx].q:trObj.totalQ;
    const spanSec=Math.max(6,Math.min(28,(nextIdx<trObj.pillars.length?trObj.pillars[nextIdx].sec:trObj.musicEndSec)-pStart.sec));
    const secPerQ=spanSec/Math.max(1,q1-q0);
    const now=ctx.currentTime+0.06;

    const master=ctx.createGain();master.gain.value=0.92;master.connect(ctx.destination);
    synthGains=[];
    for(let vi=0;vi<trObj.voiceCount;vi++){
      const g=ctx.createGain();
      g.gain.value=state.muted[`${trObj.id}:${vi}`]?0:1;
      g.connect(master);
      synthGains.push(g);
    }
    const ghostGain=ctx.createGain();
    ghostGain.gain.value=state.ghostBass?1:0;
    ghostGain.connect(master);
    synthGains.push(ghostGain);

    for(const [st,du,mi,vi] of trObj.notes){
      if(st+du<=q0+0.01)continue;
      if(st>=q1-0.01)break;
      const s=Math.max(q0,st)-q0;
      const d=Math.min(q1,st+du)-Math.max(q0,st);
      if(d>0.01&&synthGains[vi])schedulePianoNote(ctx,mi,now+s*secPerQ,d*secPerQ,synthGains[vi],'voice');
    }
    for(let k=0;k<passPillars.length;k++){
      const pp=passPillars[k];
      const nextQ=k+1<passPillars.length?passPillars[k+1].q:q1;
      const s=Math.max(0,pp.q-q0), d=Math.max(0.2,nextQ-pp.q);
      schedulePianoNote(ctx,PILLAR_MIDI[pp.pillar-1],now+s*secPerQ,d*secPerQ,ghostGain,'ghost');
    }

    synthState={active:true,mode:'lab',startAt:now,q0,q1,secPerQ,durSec:spanSec,trackIdx:trObj.id};
    updateLabButtons();

    const tick=()=>{
      if(!synthState.active||synthState.mode!=='lab')return;
      const elap=ctx.currentTime-now;
      if(elap>=spanSec+0.08){stopSynth();return;}
      const curQ=q0+Math.max(0,elap)/secPerQ;
      renderVisualFrame(curQ);
      synthAnim=requestAnimationFrame(tick);
    };
    synthAnim=requestAnimationFrame(tick);
  }

  function updateLabButtons(){
    const btn=$('synthPlayBtn');
    if(synthState.active&&synthState.mode==='lab'){
      btn.textContent=t('⏹ 停止拆解试听','⏹ Stop Voice Synth');
    }else{
      btn.textContent=t('🎹 拆解合成试听本段','🎹 Synth-Isolate Voices');
    }
    const gb=$('ghostBassBtn');
    gb.classList.toggle('active',state.ghostBass);
    gb.setAttribute('aria-pressed',String(state.ghostBass));
    gb.textContent=state.ghostBass?t('🔔 黄金地基钟声：已叠加','🔔 Ghost Bass: ON'):t('🔔 叠加黄金地基钟声','🔔 Overlay Ghost Bass');
  }

  /* ---------- Audio Controls ---------- */
  function pauseAudio(){
    pendingAutoplay=false;
    audio.pause();
    updateTransportUI();
  }

  async function playAudio(){
    stopSynth();
    pendingAutoplay=false;
    try{await audio.play();}catch(e){
      if(e.name!=='AbortError')toast(t('请再点击一次播放启动音频。','Click Play again to start audio.'));
    }
    updateTransportUI();
  }

  function applyAudioTime(sec){
    if(!Number.isFinite(sec))return;
    const clamped=E.clamp(sec,0,Math.max(0,(track().duration||0)-0.05));
    pendingSeek=clamped;
    try{if(audio.readyState>0)audio.currentTime=clamped;}catch{}
  }

  function seek(sec,autoplay=false){
    stopSynth();
    const target=E.clamp(sec,0,Math.max(0,(track().duration||0)-0.05));
    applyAudioTime(target);
    state.positions[track().id]=target;
    store();
    renderTelemetry();
    renderVisualFrame();
    drawWaveform();
    if(autoplay)playAudio();
  }

  function loadTrack(idx,{time=null,autoplay=false,preservePillar=false,scroll=false}={}){
    idx=E.clamp(idx,0,D.tracks.length-1);
    const prevTr=track();
    const prevT=currentAudioTime();
    const prevP=E.activePillarAt(prevTr,prevT);

    stopSynth();
    state.index=idx;
    state.loopStage=false;
    const nextTr=track();
    let targetSec=time;
    if(targetSec===null){
      if(preservePillar&&state.pillarLock&&prevT>prevTr.musicStartSec+0.4){
        targetSec=E.resolvePillarTargetSec(nextTr,prevP.pillar,prevP.pass);
      }else{
        targetSec=0;
      }
    }
    const serial=++loadSerial;
    pendingSeek=targetSec;
    pendingAutoplay=autoplay;
    lastPillarKey='';
    lastStageIdx=-1;

    audio.pause();
    audio.src=nextTr.audio;
    audio.playbackRate=state.speed;
    audio.load();
    $('scrub').max=String(nextTr.duration);

    audio.onloadedmetadata=()=>{
      if(serial!==loadSerial)return;
      applyAudioTime(pendingSeek);
      renderTelemetry();
      renderVisualFrame();
      drawWaveform();
      if(pendingAutoplay)playAudio();
    };

    store();
    renderChapterAll();
    if(scroll)$('chapterHero').scrollIntoView({behavior:'smooth',block:'start'});
    if(preservePillar&&state.pillarLock&&time===null&&prevT>prevTr.musicStartSec+0.4){
      toast(t(`已对齐至 ${nextTr.code} · 第 ${prevP.pillar} 根地基立柱`, `Synced to ${nextTr.code_en||nextTr.code} · Pillar #${prevP.pillar}`));
    }
  }

  /* ---------- Render Chapter UI ---------- */
  function passLabel(passCode,topo){
    if(topo==='AB')return passCode==='A1'?t('前半部 A（无反复）','Part A (No Repeat)'):t('后半部 B（无反复）','Part B (No Repeat)');
    const map={
      A1:t('A1 · 前半初奏','A1 · Part A 1st Pass'),
      A2:t('A2 · 前半复奏加花','A2 · Part A Repeat'),
      B1:t('B1 · 后半初奏','B1 · Part B 1st Pass'),
      B2:t('B2 · 后半复奏升华','B2 · Part B Repeat')
    };
    return map[passCode]||passCode;
  }

  function categoryBadge(trObj){
    const map={
      portal:['cat-portal',t('👑 首尾圣殿咏叹调','👑 Framing Aria')],
      character:['cat-character',t('🏛️ 第1位：性格舞曲与体裁','🏛️ Slot 1: Character Genre')],
      virtuoso:['cat-virtuoso',t('⚡ 第2位：双排键炫技杂技','⚡ Slot 2: Two-Manual Virtuosity')],
      canon:['cat-canon',trObj.canonInverted?t(`🪞 第3位：${trObj.canonInterval}度反向镜像卡农`,`🪞 Slot 3: Inverted Canon at ${trObj.canonInterval}`):t(`🏃 第3位：${trObj.canonInterval}度追逐卡农`,`🏃 Slot 3: Canon at Interval ${trObj.canonInterval}`)],
      quodlibet:['cat-quodlibet',t('🍻 第30终曲：双民歌集句狂欢','🍻 Finale: Folk-Song Quodlibet')]
    };
    return map[trObj.category]||['',trObj.category];
  }

  function renderTrackSelector(){
    const sel=$('trackSelect');
    sel.innerHTML=D.tracks.map(x=>`<option value="${x.id}" ${x.id===state.index?'selected':''}>[${String(x.id).padStart(2,'0')}] ${esc(tr(x,'code'))} · ${esc(tr(x,'title'))}</option>`).join('');
    $('prevTrack').disabled=state.index<=0;
    $('nextTrack').disabled=state.index>=D.tracks.length-1;
  }

  function renderSamePillarStrip(){
    const targets=[0,1,13,15,25,30];
    $('samePillarStrip').innerHTML=`<span>${t('⚡ 同柱瞬移对比：','⚡ Same-Pillar Compare:')}</span>`+targets.map(id=>{
      const item=D.tracks[id];
      return `<button data-compare-track="${id}" class="${id===state.index?'active':''}">${esc(tr(item,'code'))}</button>`;
    }).join('');
  }

  function renderChapterHero(){
    const trObj=track();
    const [catCls,catTxt]=categoryBadge(trObj);
    const triadTxt=trObj.triad>=1&&trObj.triad<=10?`<span class="chip">${t(`第 ${trObj.triad} 组三联画`,`Triad #${trObj.triad} of 10`)}</span>`:'';
    const minorTxt=trObj.keyMode==='G minor'?`<span class="chip minor-chip">${t('🌑 G小调情感深渊','🌑 G minor Abyss')}</span>`:'';
    const crossTxt=trObj.voiceCrossings>0?`<span class="chip">${t(`⇄ 声部交叉 ${trObj.voiceCrossings} 处`,`⇄ ${trObj.voiceCrossings} Voice Crossings`)}</span>`:'';
    $('heroBadges').innerHTML=`<span class="chip ${catCls}">${esc(catTxt)}</span>${triadTxt}${minorTxt}<span class="chip">${t(`拍号 ${trObj.meter}`,`Meter ${trObj.meter}`)}</span><span class="chip">${t(`${trObj.voiceCount} 独立声部`,`${trObj.voiceCount} Voices`)}</span><span class="chip">${esc(trObj.manuals)}</span><span class="chip">${t(`现场结构 ${trObj.repeatTopology}`,`Live Form ${trObj.repeatTopology}`)}</span>${crossTxt}`;

    $('chapterTitle').textContent=`${tr(trObj,'code')} · ${tr(trObj,'title')}`;
    $('chapterSubtitle').textContent=tr(trObj,'subtitle');
    $('scorePdfLink').href=trObj.scoreUrl;
    $('scorePdfLink').textContent=t(`📖 原版乐谱第 ${trObj.scorePage} 页 ↗`,`📖 Open Urtext Score p.${trObj.scorePage} ↗`);

    $('hookHeading').textContent=t('👂 小白前 5 秒怎么听？','👂 First 5 Seconds: What to Hear?');
    $('recipeHeading').textContent=t('🏛️ 巴赫的变奏配方','🏛️ Bach’s Architectural Recipe');
    $('limHeading').textContent=t('🎹 任奫灿卡内基现场密码','🎹 Yunchan Lim at Carnegie Hall');
    $('chapterHook').textContent=tr(trObj,'noviceHook');
    $('chapterRecipe').textContent=tr(trObj,'recipe');
    $('chapterLimNote').textContent=tr(trObj,'limNote');
  }

  function renderVoiceControls(){
    const trObj=track(), cols=voiceColors(trObj);
    $('voiceControls').innerHTML=(trObj.voicesMeta||[]).map((vm,vi)=>{
      const muted=Boolean(state.muted[`${trObj.id}:${vi}`]);
      return `<div class="voice-card ${muted?'muted':''}" style="--v-color:${cols[vi]}">
        <div class="voice-info">
          <b><span class="voice-dot"></span>${esc(tr(vm,'name'))}</b>
          <small title="${esc(tr(vm,'role'))}">${esc(tr(vm,'role'))}</small>
        </div>
        <div class="voice-btns">
          <button data-voice-mute="${vi}" class="${muted?'active':''}">${muted?t('已静音','Muted'):t('静音','Mute')}</button>
          <button data-voice-solo="${vi}">${t('独奏','Solo')}</button>
        </div>
      </div>`;
    }).join('');
    updateLabButtons();
  }

  function renderStages(){
    const trObj=track(), stages=trObj.stages||[];
    $('stagesHeading').textContent=t('本章分段导览与关键听点','Structural Stages & Listening Cues');
    $('stagesSub').textContent=t('点击任意段落卡或金色时间胶囊即可精准跳转至任奫灿卡内基现场对应乐句。','Click any stage card or cue pill to jump directly to that phrase in Yunchan Lim’s Carnegie Hall recording.');

    $('stagesGrid').innerHTML=stages.map((s,si)=>{
      const endSec=stages[si+1]?.start??trObj.musicEndSec;
      const cues=(trObj.cues||[]).filter(c=>c.sec>=s.start-0.05&&c.sec<endSec+(si===stages.length-1?5:0));
      return `<article class="stage-card" id="stage-card-${si}">
        <button class="stage-main" data-stage-play="${si}">
          <div class="stage-top">
            <span class="stage-time">${fmt(s.start)} – ${fmt(endSec)}</span>
            <span class="stage-coord">${esc(passLabel(s.pass,trObj.repeatTopology))} · ${t(`第 ${s.pillar} 柱起`,`Pillar #${s.pillar}`)}</span>
            <span class="stage-play-hint">${t('▶ 听此段','▶ Play')}</span>
          </div>
          <h3>${esc(tr(s,'title'))}</h3>
          <span class="stage-focus">${esc(tr(s,'focus'))}</span>
          <p>${esc(tr(s,'desc'))}</p>
        </button>
        ${cues.length?`<div class="stage-cues">${cues.map(c=>`<button class="cue-btn" data-cue-sec="${c.sec}">⏱ ${fmt(c.sec)} · ${esc(tr(c,'label'))}</button>`).join('')}</div>`:''}
        <div class="stage-bar"><span id="stage-prog-${si}"></span></div>
      </article>`;
    }).join('');
  }

  function renderVarCard(x){
    const tags=[];
    if(x.canonInterval)tags.push(`<span class="var-tag canon">${x.canonInverted?t(`${x.canonInterval}度镜像卡农`,`Canon ${x.canonInterval}° Inv.`):t(`${x.canonInterval}度卡农`,`Canon ${x.canonInterval}°`)}</span>`);
    if(x.category==='virtuoso')tags.push(`<span class="var-tag virt">${t('⚡ 双手炫技','⚡ Virtuoso')}</span>`);
    if(x.keyMode==='G minor')tags.push(`<span class="var-tag minor">${t('🌑 G小调','🌑 G minor')}</span>`);
    if(x.limHighlight)tags.push(`<span class="var-tag lim">${t('🌟 必听高光','🌟 Lim Highlight')}</span>`);
    tags.push(`<span class="var-tag">${esc(x.meter)}</span>`);
    return `<button class="${x.category==='portal'?'portal-card':'var-card'} ${x.id===state.index?'current':''}" data-select-track="${x.id}">
      <div class="var-card-top"><span class="var-code">[${String(x.id).padStart(2,'0')}] ${esc(tr(x,'code'))}</span><span class="var-dur">${fmt(x.duration)}</span></div>
      <h4>${esc(tr(x,'title'))}</h4>
      <p>${esc(tr(x,'noviceHook'))}</p>
      <div class="var-tags">${tags.join('')}</div>
    </button>`;
  }

  function renderMatrix(){
    $('matrixEyebrow').textContent=t('ARCHITECTURAL MASTERPLAN · 十组三联画与对称双翼','ARCHITECTURAL MASTERPLAN · 10 TRIADS & SYMMETRIC WINGS');
    $('matrixHeading').textContent=t('哥德堡宇宙全景建筑图（Aria → 10组「体裁 · 炫技 · 卡农」三联画 → Aria da capo）','Complete Cathedral Blueprint (Aria → 10 Triads → Aria da capo)');
    $('matrixSub').textContent=t('巴赫将30首变奏精密编排为10组三联画：每组第1首是性格舞曲/体裁，第2首是双排键炫技杂技，第3首是从一度逐级攀升至九度的卡农阶梯（第30首化作民歌集句狂欢），并在第16变奏对折为上下两翼。','Bach organized the 30 variations into 10 Triads: (1) Genre/Dance, (2) Two-Manual Virtuosity, and (3) Canons ascending from Unison to the Ninth (crowned by the Var. 30 Quodlibet), split into two wings at the Var. 16 French Overture.');

    const filters=[
      ['all',t('全部 32 章（三联画视图）','All 32 (Triad Blueprint)')],
      ['canon',t('🪞 九重卡农阶梯 (1°→9°)','🪞 9 Canons Staircase (1°→9°)')],
      ['virtuoso',t('⚡ 双手交叉炫技 (10首)','⚡ Hand-Crossing Virtuosity')],
      ['character',t('🏛️ 性格舞曲与体裁 (10首)','🏛️ Character & Dances')],
      ['minor',t('🌑 三座G小调深渊 (15/21/25)','🌑 3 G-Minor Abysses')],
      ['lim',t('🌟 任奫灿卡内基必听高光','🌟 Lim Carnegie Highlights')]
    ];
    $('matrixFilters').innerHTML=filters.map(([fid,flab])=>`<button data-matrix-filter="${fid}" class="${state.matrixFilter===fid?'selected':''}">${esc(flab)}</button>`).join('');

    const host=$('matrixContainer');
    if(state.matrixFilter!=='all'){
      const list=D.tracks.filter(x=>{
        if(state.matrixFilter==='canon')return x.category==='canon'||x.category==='quodlibet';
        if(state.matrixFilter==='virtuoso')return x.category==='virtuoso';
        if(state.matrixFilter==='character')return x.category==='character';
        if(state.matrixFilter==='minor')return x.keyMode==='G minor';
        if(state.matrixFilter==='lim')return x.limHighlight;
        return true;
      });
      host.innerHTML=`<div class="filtered-grid">${list.map(renderVarCard).join('')}</div>`;
      return;
    }

    let html=renderVarCard(D.tracks[0]);
    html+=`<div class="matrix-col-headers"><div>${t('三联画','Triad')}</div><div>${t('🏛️ 第1位：性格舞曲 / 器乐体裁','🏛️ Slot 1: Genre / Character Dance')}</div><div>${t('⚡ 第2位：双排键炫技 / 双手交叉','⚡ Slot 2: Two-Manual Virtuosity')}</div><div>${t('🪞 第3位：九重卡农阶梯 (1°→9°) / 集句','🪞 Slot 3: Ascending Canon / Quodlibet')}</div></div>`;
    for(let trNum=1;trNum<=10;trNum++){
      if(trNum===6){
        html+=`<div class="hinge-banner">${t('⛩️ 对称中轴分水岭 · 第16变奏《法国序曲》正式推开下半场大门（Wing II: Var. 16–30）','⛩️ Architectural Midpoint · Variation 16 (French Overture) Opens the Second Wing')}</div>`;
      }
      const base=(trNum-1)*3+1;
      html+=`<div class="triad-row"><div class="triad-label"><span>TRIAD</span><b>#${trNum}</b></div>${renderVarCard(D.tracks[base])}${renderVarCard(D.tracks[base+1])}${renderVarCard(D.tracks[base+2])}</div>`;
    }
    html+=renderVarCard(D.tracks[31]);
    host.innerHTML=html;
  }

  function updateStaticLabels(){
    document.documentElement.lang=state.lang==='en'?'en':'zh-CN';
    document.documentElement.dataset.theme=state.theme;
    $('skipLink').textContent=t('跳到主内容','Skip to content');
    $('consoleTitle').textContent=tr(M,'title')||t('巴赫《哥德堡变奏曲》零基础互动建筑馆','J.S. Bach · Goldberg Variations Interactive Architecture Lab');
    $('recBadge').textContent=tr(M,'recordingLabel')||'Yunchan Lim · Live at Carnegie Hall (2025)';
    $('consoleSub').textContent=t(' · 32根承重地基 · 九重卡农阶梯 · 88键声部透视',' · 32 Pillars · 9 Canons · 88-Key Voice X-Ray');
    $('btnPrimerNav').textContent=t('🎓 零基础三步懂变奏','🎓 3-Step Intro');
    $('btnMatrixNav').textContent=t('🗺️ 32章建筑图','🗺️ 32-Chapter Map');
    $('btnThreads').textContent=t('暗线','Threads');
    $('btnGlossary').textContent=t('词典','Glossary');
    $('btnSources').textContent=t('资料','Sources');
    $('themeBtn').textContent=state.theme==='light'?'☾':'☀';
    $('langBtn').textContent=state.lang==='en'?'中文':'English';

    $('pillarLockBtn').classList.toggle('active',state.pillarLock);
    $('pillarLockBtn').setAttribute('aria-pressed',String(state.pillarLock));
    $('pillarLockBtn').textContent=state.pillarLock?t('🔗 同地基柱瞬移：开','🔗 Same-Pillar Lock: ON'):t('🔗 同地基柱瞬移：关','🔗 Same-Pillar Lock: OFF');

    $('continuousBtn').classList.toggle('active',state.continuous);
    $('continuousBtn').setAttribute('aria-pressed',String(state.continuous));
    $('continuousBtn').textContent=state.continuous?t('整部连播：开','Autoplay All: ON'):t('整部连播：关','Autoplay All: OFF');

    $('loopStageBtn').classList.toggle('active',state.loopStage);
    $('loopStageBtn').setAttribute('aria-pressed',String(state.loopStage));
    $('loopStageBtn').textContent=state.loopStage?t('循环本段：开','Loop Stage: ON'):t('循环本段','Loop Stage');

    $('compassSummaryTitle').textContent=t('🏛️ 32根黄金地基实时罗盘（点击任意立柱跳听 · 所有30首变奏共享同一套地基！）','🏛️ 32-Pillar Ground-Bass Compass (Click any pillar to seek · All 30 variations share these 32 pillars!)');
    $('compassSummaryHint').textContent=t('展开 / 收起','Toggle');

    $('labBadge').textContent=t('声部透视镜','VOICE X-RAY');
    $('labTitle').textContent=t('多声部丝带卷帘 & 88键声部交叉透视琴键','Multi-Voice Contrapuntal Ribbon & 88-Key Crossing Visualizer');
    $('labDesc').textContent=t('播放任奫灿卡内基原声时，下方声部丝带与 88 键钢琴实时同步点亮；也可点击右侧「拆解合成试听」单独静音或独奏任意一根旋律线，或叠加黄金地基钟声！','Synced in real time to Yunchan Lim’s Carnegie Hall audio; or click Synth-Isolate Voices to solo/mute individual contrapuntal threads and overlay the pure 32-pillar Ghost Bass.');
    $('resetVoicesBtn').textContent=t('重置全部声部','Reset Voices');
    $('kbCaptionLeft').textContent=t('88键施坦威音区透视（A0 → C8 · 颜色对应上方独立声部）','88-Key Steinway Register X-Ray (A0 → C8 · Color-coded by voice)');
    $('footThreads').textContent=t('六条建筑暗线','6 Architectural Threads');
    $('footGlossary').textContent=t('零基础术语词典','Beginner Glossary');
    $('footSources').textContent=t('音源与开源乐谱声明','Audio & Score Sources');
    updateTransportUI();
  }

  function updateTransportUI(){
    const curT=currentAudioTime(), dur=track().duration||0;
    $('currentTime').textContent=fmt(curT);
    $('totalTime').textContent=fmt(dur);
    $('scrub').value=String(curT);
    $('play').textContent=wantsPlayback()?t('Ⅱ 暂停原声','Ⅱ Pause'):t('▶ 播放卡内基原声','▶ Play Lim Live');
  }

  /* ---------- Live Telemetry, Waveform, Ribbon & 88-Key Frame ---------- */
  function renderTelemetry(){
    const trObj=track(), curT=currentAudioTime();
    const phase=E.silencePhase(curT,trObj);
    const pObj=E.activePillarAt(trObj,curT);
    const sIdx=E.activeStageAt(trObj.stages,curT);
    const stg=trObj.stages[sIdx]||trObj.stages[0];

    $('liveTrackBadge').textContent=tr(trObj,'code');
    $('livePassBadge').textContent=passLabel(pObj.pass,trObj.repeatTopology);
    $('liveStageTitle').textContent=stg?tr(stg,'title'):tr(trObj,'title');

    const gp=D.groundPillars[pObj.pillar-1]||D.groundPillars[0];
    if(phase==='pre'){
      $('syncBadge').textContent=t('演奏前屏息准备','Pre-Attack Hall Silence');
    }else if(phase==='applause'){
      $('syncBadge').textContent=t('卡内基现场掌声','Carnegie Hall Applause');
    }else if(phase==='post'){
      $('syncBadge').textContent=t('终音静默余响','Final Hall Resonance');
    }else{
      $('syncBadge').textContent=t(`第 ${pObj.pillar}/32 柱 · ${gp[1]} (${gp[3]} · ${gp[4]})`,`Pillar ${pObj.pillar}/32 · ${gp[2]} (${gp[3]} · ${gp[4]})`);
    }

    const pKey=`${trObj.id}:${phase}:${pObj.pillar}`;
    if(pKey!==lastPillarKey){
      lastPillarKey=pKey;
      for(let i=1;i<=32;i++){
        $(`pcell-${i}`)?.classList.toggle('current',phase==='active'&&i===pObj.pillar);
      }
    }

    if(sIdx!==lastStageIdx){
      lastStageIdx=sIdx;
      trObj.stages.forEach((_,i)=>$(`stage-card-${i}`)?.classList.toggle('current',i===sIdx));
    }
    trObj.stages.forEach((s,i)=>{
      const endS=trObj.stages[i+1]?.start??trObj.musicEndSec;
      const pct=endS>s.start?E.clamp(((curT-s.start)/(endS-s.start))*100,0,100):0;
      const bar=$(`stage-prog-${i}`);
      if(bar)bar.style.setProperty('--prog',`${pct.toFixed(1)}%`);
    });

    if(state.loopStage&&isPlaying()&&stg){
      const endS=trObj.stages[sIdx+1]?.start??trObj.musicEndSec;
      if(curT>=endS-0.06)applyAudioTime(stg.start);
    }
  }

  function drawWaveform(){
    const c=$('waveCanvas');if(!c)return;
    const dpr=window.devicePixelRatio||1, w=c.clientWidth||600, h=c.clientHeight||38;
    if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const trObj=track(), pts=trObj.waveform||[], dur=trObj.duration||1, curT=currentAudioTime();
    const n=pts.length;
    for(let i=0;i<n;i++){
      const x=(i/n)*w, barH=Math.max(2,pts[i]*(h-8));
      const sec=(i/n)*dur;
      ctx.fillStyle=sec<=curT?'#f59e0b':'#475569';
      ctx.globalAlpha=sec<=curT?0.95:0.45;
      ctx.fillRect(x,(h-barH)/2,Math.max(1.2,w/n-1),barH);
    }
    ctx.globalAlpha=0.85;
    for(const s of trObj.stages||[]){
      const sx=(s.start/dur)*w;
      ctx.fillStyle='#38bdf8';
      ctx.fillRect(sx,h-5,1.5,5);
    }
    const px=E.clamp(curT/dur,0,1)*w;
    ctx.globalAlpha=1;ctx.fillStyle='#fde68a';
    ctx.fillRect(Math.max(0,px-1),0,2,h);
  }

  function renderVisualFrame(overrideQ=null){
    const trObj=track();
    const curT=currentAudioTime();
    const phase=overrideQ!==null?'active':E.silencePhase(curT,trObj);
    const curQ=overrideQ!==null?overrideQ:E.secToQ(trObj,curT);
    const cols=voiceColors(trObj);

    /* 1. Draw Multi-Voice Contrapuntal Ribbon Canvas */
    const c=$('ribbonCanvas');
    if(c){
      const dpr=window.devicePixelRatio||1, w=c.clientWidth||800, h=c.clientHeight||190;
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
      const ctx=c.getContext('2d');
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);

      const winBehind=4.5, winAhead=15.5, winSpan=winBehind+winAhead;
      const qLeft=curQ-winBehind, qRight=curQ+winAhead;

      // Pitch range of current movement
      let minP=36, maxP=86;
      if(trObj.notes.length){
        if(!trObj._pitchBounds){
          let lo=108,hi=21;
          for(const n of trObj.notes){if(n[2]<lo)lo=n[2];if(n[2]>hi)hi=n[2];}
          trObj._pitchBounds=[Math.max(21,lo-3),Math.min(108,hi+3)];
        }
        [minP,maxP]=trObj._pitchBounds;
      }

      // Draw vertical Pillar gridlines within [qLeft, qRight]
      ctx.font='600 10px ui-monospace, monospace';
      for(const p of trObj.pillars){
        if(p.q<qLeft-1||p.q>qRight+1)continue;
        const x=((p.q-qLeft)/winSpan)*w;
        const isPhraseStart=(p.pillar%8===1);
        ctx.strokeStyle=isPhraseStart?'rgba(245,158,11,0.42)':'rgba(100,116,139,0.22)';
        ctx.lineWidth=isPhraseStart?1.3:1;
        ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
        ctx.fillStyle=isPhraseStart?'#f59e0b':'#64748b';
        ctx.fillText(`${p.pass}·P${p.pillar}`,x+3,12);
      }

      // Mirror axis for inverted canons (Var. 12 & Var. 15)
      if(trObj.canonInverted){
        const midY=h*0.46;
        ctx.strokeStyle='rgba(251,191,36,0.5)';
        ctx.setLineDash([5,4]);ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(0,midY);ctx.lineTo(w,midY);ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle='#fbbf24';
        ctx.fillText(t('🪞 镜像对称轴','🪞 Mirror Axis'),w-98,midY-5);
      }

      // Draw notes
      for(const n of trObj.notes){
        const [st,du,mi,vi]=n;
        if(st+du<qLeft)continue;
        if(st>qRight)break;
        if(state.muted[`${trObj.id}:${vi}`])continue;
        const x=((st-qLeft)/winSpan)*w;
        const nw=Math.max(3,(du/winSpan)*w);
        const y=h-12-((mi-minP)/Math.max(1,maxP-minP))*(h-28);
        const sounding=phase==='active'&&curQ>=st-0.02&&curQ<=st+du+0.02;
        ctx.fillStyle=cols[vi]||'#f59e0b';
        ctx.globalAlpha=sounding?1:0.74;
        const rh=sounding?8.5:5.5;
        ctx.beginPath();
        ctx.roundRect(x,y-rh/2,nw,rh,3);
        ctx.fill();
      }

      // Playhead at winBehind / winSpan
      const phX=(winBehind/winSpan)*w;
      ctx.globalAlpha=1;
      ctx.fillStyle='#fde68a';
      ctx.fillRect(phX-1,0,2,h);
    }

    /* 2. Update 88-Key Virtual Piano & Voice-Crossing Detector */
    for(const m of lastLitKeys){
      const el=keyEls.get(m);
      if(el)el.classList.remove('lit');
    }
    lastLitKeys.clear();

    if(phase!=='active'){
      $('kbActiveNotes').textContent='—';
      $('crossingBadge').hidden=true;
      return;
    }

    const {sounding,crossed}=E.activeNotesAtQ(trObj,curQ);
    const activeLabels=[];
    for(const [,,mi,vi] of sounding){
      if(state.muted[`${trObj.id}:${vi}`])continue;
      const el=keyEls.get(mi);
      if(el){
        el.style.setProperty('--k-color',cols[vi]||'#f59e0b');
        el.classList.add('lit');
        lastLitKeys.add(mi);
      }
      activeLabels.push(E.midiName(mi));
    }
    $('kbActiveNotes').textContent=activeLabels.length?[...new Set(activeLabels)].join(' · '):'—';
    const crossEl=$('crossingBadge');
    crossEl.hidden=!crossed;
    if(crossed)crossEl.textContent=t('⇄ 声部高低交叉中！','⇄ Voices Crossing!');
  }

  function renderChapterAll(){
    renderTrackSelector();
    renderSamePillarStrip();
    renderChapterHero();
    renderVoiceControls();
    renderStages();
    renderMatrix();
    updateTransportUI();
    renderTelemetry();
    renderVisualFrame();
    drawWaveform();
  }

  /* ---------- Modals (Threads, Glossary, Sources) ---------- */
  function openModal(title,html){
    $('dialogTitle').textContent=title;
    $('dialogBody').innerHTML=html;
    if(!$('dialog').open)$('dialog').showModal();
  }

  function showThreads(){
    openModal(t('哥德堡变奏曲 · 六条贯通全曲的建筑暗线','Six Architectural Threads Across the Goldberg Variations'),
      (D.threads||[]).map(th=>`<div class="modal-item"><h3>${esc(tr(th,'title'))}</h3><p>${esc(tr(th,'summary'))}</p><div class="thread-stops">${(th.stops||[]).map(st=>`<button data-modal-jump="${st.track}">▶ [${String(st.track).padStart(2,'0')}] ${esc(tr(st,'label'))}</button>`).join('')}</div></div>`).join(''));
  }

  function showGlossary(){
    openModal(t('零基础秒懂词典（无需五线谱背景）','Zero-Jargon Listener’s Glossary'),
      (D.glossary||[]).map(g=>`<div class="modal-item"><h3>${esc(tr(g,'term'))}</h3><p>${esc(tr(g,'definition'))}</p></div>`).join(''));
  }

  function showSources(){
    openModal(t('录音版本、开源乐谱与声学对齐技术说明','Audio Recording, Open Score & Alignment Methodology'),
      (D.sources||[]).map(s=>`<div class="modal-item"><h3>${esc(tr(s,'title'))}</h3><p>${esc(tr(s,'note'))}</p>${s.url?`<p><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)} ↗</a></p>`:''}</div>`).join(''));
  }

  /* ---------- Event Delegation & Listeners ---------- */
  document.addEventListener('click',ev=>{
    const b=ev.target.closest('button');
    if(!b)return;
    const d=b.dataset;

    if(b.id==='langBtn'){
      state.lang=state.lang==='en'?'zh':'en';
      store();
      updateStaticLabels();
      renderPrimer();
      renderPillarCompass();
      lastPillarKey='';
      renderChapterAll();
      toast(state.lang==='en'?'Switched to English':'已切换为中文');
      return;
    }
    if(b.id==='themeBtn'){
      state.theme=state.theme==='light'?'dark':'light';
      store();
      updateStaticLabels();
      drawWaveform();
      renderVisualFrame();
      return;
    }
    if(b.id==='btnPrimerNav'){
      state.primerOpen=true;store();renderPrimer();
      $('primerSection').scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(b.id==='togglePrimerBody'){
      state.primerOpen=!state.primerOpen;store();renderPrimer();
      return;
    }
    if(b.id==='btnMatrixNav'){
      $('matrixSection').scrollIntoView({behavior:'smooth',block:'start'});
      return;
    }
    if(b.id==='pillarLockBtn'){
      state.pillarLock=!state.pillarLock;store();updateStaticLabels();
      toast(state.pillarLock?t('已开启同地基柱瞬移：切曲时将保持在当前第 N 根立柱','Same-Pillar Lock ON: switching tracks preserves current pillar position'):t('已关闭同地基柱瞬移：切曲时从头播放','Same-Pillar Lock OFF: switching tracks starts from bar 1'));
      return;
    }
    if(b.id==='continuousBtn'){
      state.continuous=!state.continuous;store();updateStaticLabels();
      return;
    }
    if(b.id==='loopStageBtn'){
      state.loopStage=!state.loopStage;updateStaticLabels();
      return;
    }
    if(b.id==='synthPlayBtn'){playLabSynth();return;}
    if(b.id==='ghostBassBtn'){
      state.ghostBass=!state.ghostBass;
      if(synthState.active&&synthState.mode==='lab'&&synthGains.length){
        synthGains[synthGains.length-1].gain.value=state.ghostBass?1:0;
      }
      updateLabButtons();
      return;
    }
    if(b.id==='resetVoicesBtn'){
      const id=track().id;
      for(let vi=0;vi<track().voiceCount;vi++){
        state.muted[`${id}:${vi}`]=false;
        if(synthGains[vi])synthGains[vi].gain.value=1;
      }
      renderVoiceControls();
      renderVisualFrame();
      return;
    }
    if(b.id==='dialogClose'){$('dialog').close();return;}

    if(d.action==='threads'){showThreads();return;}
    if(d.action==='glossary'){showGlossary();return;}
    if(d.action==='sources'){showSources();return;}

    if(d.primerDemo){playPrimerDemo(d.primerDemo);return;}
    if(d.jumpTrack!==undefined){
      loadTrack(+d.jumpTrack,{time:D.tracks[+d.jumpTrack].musicStartSec,autoplay:true,scroll:true});
      return;
    }
    if(d.pillarJump!==undefined){
      const pNum=+d.pillarJump, trObj=track(), curP=E.activePillarAt(trObj,currentAudioTime());
      const targetPass=pNum<=16?(curP.pass.startsWith('A')?curP.pass:'A1'):(curP.pass.startsWith('B')?curP.pass:'B1');
      const sec=E.resolvePillarTargetSec(trObj,pNum,targetPass);
      seek(sec,true);
      return;
    }
    if(d.compareTrack!==undefined){
      const nextIdx=+d.compareTrack, prevP=E.activePillarAt(track(),currentAudioTime());
      const sec=E.resolvePillarTargetSec(D.tracks[nextIdx],prevP.pillar,prevP.pass);
      loadTrack(nextIdx,{time:sec,autoplay:true});
      toast(t(`同柱对比：${D.tracks[nextIdx].code} · 第 ${prevP.pillar} 根立柱`,`Same-Pillar Compare: ${D.tracks[nextIdx].code} · Pillar #${prevP.pillar}`));
      return;
    }
    if(d.voiceMute!==undefined){
      const vi=+d.voiceMute, k=`${track().id}:${vi}`;
      state.muted[k]=!state.muted[k];
      if(synthGains[vi])synthGains[vi].gain.value=state.muted[k]?0:1;
      renderVoiceControls();
      renderVisualFrame();
      return;
    }
    if(d.voiceSolo!==undefined){
      const soloVi=+d.voiceSolo, id=track().id;
      for(let vi=0;vi<track().voiceCount;vi++){
        const m=(vi!==soloVi);
        state.muted[`${id}:${vi}`]=m;
        if(synthGains[vi])synthGains[vi].gain.value=m?0:1;
      }
      renderVoiceControls();
      renderVisualFrame();
      if(!synthState.active)playLabSynth();
      return;
    }
    if(d.stagePlay!==undefined){
      const stg=track().stages[+d.stagePlay];
      if(stg)seek(stg.start,true);
      return;
    }
    if(d.cueSec!==undefined){
      seek(+d.cueSec,true);
      return;
    }
    if(d.matrixFilter){
      state.matrixFilter=d.matrixFilter;
      renderMatrix();
      return;
    }
    if(d.selectTrack!==undefined){
      loadTrack(+d.selectTrack,{autoplay:true,preservePillar:state.pillarLock,scroll:true});
      return;
    }
    if(d.modalJump!==undefined){
      $('dialog').close();
      loadTrack(+d.modalJump,{autoplay:true,preservePillar:false,scroll:true});
    }
  });

  $('play').onclick=()=>wantsPlayback()?pauseAudio():playAudio();
  $('prevTrack').onclick=()=>loadTrack(state.index-1,{autoplay:wantsPlayback(),preservePillar:state.pillarLock});
  $('nextTrack').onclick=()=>loadTrack(state.index+1,{autoplay:wantsPlayback(),preservePillar:state.pillarLock});
  $('back5').onclick=()=>seek(currentAudioTime()-5,wantsPlayback());
  $('forward5').onclick=()=>seek(currentAudioTime()+5,wantsPlayback());

  $('trackSelect').onchange=e=>{
    loadTrack(+e.target.value,{autoplay:wantsPlayback(),preservePillar:state.pillarLock});
  };
  $('speedSelect').onchange=e=>{
    state.speed=+e.target.value||1;
    audio.playbackRate=state.speed;
    store();
  };

  $('scrub').oninput=e=>{
    seek(+e.target.value,wantsPlayback());
  };

  $('waveWrap').addEventListener('mousemove',e=>{
    const r=$('waveWrap').getBoundingClientRect();
    const ratio=E.clamp((e.clientX-r.left)/Math.max(1,r.width),0,1);
    const sec=ratio*(track().duration||0);
    const p=E.activePillarAt(track(),sec);
    const hv=$('waveHover');
    hv.hidden=false;
    hv.style.left=`${E.clamp(e.clientX-r.left-28,4,Math.max(4,r.width-95))}px`;
    hv.textContent=`${fmt(sec)} · P${p.pillar}`;
  });
  $('waveWrap').addEventListener('mouseleave',()=>{$('waveHover').hidden=true;});

  $('ribbonCanvas').addEventListener('click',e=>{
    const r=$('ribbonCanvas').getBoundingClientRect();
    const ratio=E.clamp((e.clientX-r.left)/Math.max(1,r.width),0,1);
    const curQ=E.secToQ(track(),currentAudioTime());
    const clickedQ=(curQ-4.5)+ratio*20.0;
    const targetSec=E.qToSec(track(),E.clamp(clickedQ,0,track().totalQ));
    seek(targetSec,true);
  });

  audio.addEventListener('timeupdate',()=>{
    state.positions[track().id]=audio.currentTime;
    updateTransportUI();
    renderTelemetry();
    drawWaveform();
    if(!isPlaying())renderVisualFrame();
  });
  audio.addEventListener('play',()=>{
    updateTransportUI();
    const loop=()=>{
      if(!isPlaying()){rafId=null;return;}
      renderTelemetry();
      renderVisualFrame();
      rafId=requestAnimationFrame(loop);
    };
    if(!rafId)rafId=requestAnimationFrame(loop);
  });
  audio.addEventListener('pause',updateTransportUI);
  audio.addEventListener('ended',()=>{
    updateTransportUI();
    if(state.continuous&&state.index<D.tracks.length-1){
      loadTrack(state.index+1,{time:0,autoplay:true,preservePillar:false});
    }
  });

  window.addEventListener('resize',()=>{
    drawWaveform();
    renderVisualFrame();
    drawPrimerStaticCanvases();
  });

  /* ---------- Initialize ---------- */
  const compass=$('pillarCompassDetails');
  if(compass)compass.open=window.innerWidth>640;
  $('speedSelect').value=String(state.speed);
  buildPiano88();
  renderPillarCompass();
  updateStaticLabels();
  renderPrimer();
  loadTrack(state.index,{time:state.positions[state.index]||0,autoplay:false,preservePillar:false,scroll:false});
})();
