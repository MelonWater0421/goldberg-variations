(function(root){
  'use strict';

  const NOTE_NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number(v)||0));
  const midiName=m=>`${NOTE_NAMES[((m%12)+12)%12]}${Math.floor(m/12)-1}`;

  function formatTime(seconds){
    const s=Math.max(0,Math.floor((Number(seconds)||0)+1e-6));
    return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  }

  function silencePhase(curT,track){
    if(!track)return 'active';
    const s0=Number(track.musicStartSec)||0, s1=Number(track.musicEndSec)||Number(track.duration)||0;
    if(curT<Math.max(0,s0-0.12))return 'pre';
    if(curT>s1+0.30)return track.hasApplause?'applause':'post';
    return 'active';
  }

  function secToQ(track,sec){
    const secs=track?.beatGridSecs;
    if(!secs||secs.length<2)return 0;
    const step=Number(track.beatGridQStep)||1;
    if(sec<=secs[0])return 0;
    if(sec>=secs[secs.length-1])return (secs.length-1)*step;
    let lo=0,hi=secs.length-2;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      if(secs[mid+1]<sec)lo=mid+1;
      else if(secs[mid]>sec)hi=mid-1;
      else{lo=mid;break;}
    }
    const t0=secs[lo],t1=secs[lo+1];
    const frac=t1>t0?(sec-t0)/(t1-t0):0;
    return (lo+clamp(frac,0,1))*step;
  }

  function qToSec(track,q){
    const secs=track?.beatGridSecs;
    if(!secs||secs.length<2)return 0;
    const step=Number(track.beatGridQStep)||1;
    const idxFloat=clamp(q/step,0,secs.length-1);
    const i=Math.min(secs.length-2,Math.floor(idxFloat));
    const frac=idxFloat-i;
    return secs[i]+frac*(secs[i+1]-secs[i]);
  }

  function activePillarAt(track,sec){
    const ps=track?.pillars||[];
    if(!ps.length)return {index:0,pillar:1,pass:'A1',sec:0};
    let lo=0,hi=ps.length-1;
    while(lo<hi){
      const mid=(lo+hi+1)>>1;
      if(ps[mid].sec<=sec+0.03)lo=mid;
      else hi=mid-1;
    }
    return {index:lo,...ps[lo]};
  }

  function activeStageAt(stages,sec){
    if(!stages||!stages.length)return 0;
    let found=0;
    for(let i=0;i<stages.length;i++){
      if(stages[i].start<=sec+0.03)found=i;
      else break;
    }
    return found;
  }

  function resolvePillarTargetSec(targetTrack,pillarNum,preferredPass){
    const ps=targetTrack?.pillars||[];
    if(!ps.length)return targetTrack?.musicStartSec||0;
    const exact=ps.find(p=>p.pillar===pillarNum&&p.pass===preferredPass);
    if(exact)return exact.sec;
    const byPillar=ps.find(p=>p.pillar===pillarNum);
    return byPillar?byPillar.sec:(targetTrack?.musicStartSec||0);
  }

  function activeNotesAtQ(track,q){
    const notes=track?.notes||[];
    const sounding=[];
    for(let i=0;i<notes.length;i++){
      const n=notes[i];
      if(n[0]>q+0.04)break;
      if(n[0]+n[1]>=q-0.02)sounding.push(n);
    }
    let crossed=false;
    const v0=sounding.filter(n=>n[3]===0),v1=sounding.filter(n=>n[3]===1);
    for(const a of v0){
      for(const b of v1){
        if(a[2]<b[2]){crossed=true;break;}
      }
      if(crossed)break;
    }
    return {sounding,crossed};
  }

  const api={
    NOTE_NAMES,clamp,midiName,formatTime,silencePhase,
    secToQ,qToSec,activePillarAt,activeStageAt,resolvePillarTargetSec,activeNotesAtQ
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.GOLDBERG_ENGINE=api;
})(typeof window!=='undefined'?window:globalThis);
