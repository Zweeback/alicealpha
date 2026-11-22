import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getGLTFLoader } from '../xr/loader.js';

function makeFigure(color, x) {
  const root = new THREE.Group();
  root.position.x = x;
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d3aaa1', roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: color === '#87c9d4' ? '#333f4b' : '#40253b', roughness: 0.7 });
  const add = (geometry, material, px, py, pz = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  add(new THREE.CapsuleGeometry(0.36, 0.84, 10, 24), mat, 0, 0.65);
  add(new THREE.SphereGeometry(0.29, 24, 18), skin, 0, 1.56);
  add(new THREE.SphereGeometry(0.31, 24, 18), hair, 0, 1.72, -0.07).scale.set(1, 0.48, 0.96);
  [-1, 1].forEach((s) => {
    add(new THREE.CapsuleGeometry(0.11, 0.55, 6, 14), mat, s * 0.46, 0.65).rotation.z = -s * 0.16;
    add(new THREE.CapsuleGeometry(0.14, 0.55, 6, 14), mat, s * 0.19, -0.27);
    add(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({color:'#162a35'}), s*0.105, 1.59, 0.26);
  });
  add(new THREE.TorusGeometry(0.18, 0.018, 8, 32), new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9}), 0, 0.68, 0.34);
  return root;
}

function DualScene({ active, onModelStatus }) {
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true}); }
    catch { onModelStatus(['WebGL nicht verfügbar','WebGL nicht verfügbar']); return undefined; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090f');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1.05, 7.7);
    camera.lookAt(0, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xaac2d5, 0x14101c, 2.1));
    const key = new THREE.DirectionalLight('#e2d2cb', 3);
    key.position.set(3,5,5); scene.add(key);
    const fill = new THREE.PointLight('#8174d4', 60, 12);
    fill.position.set(-3, 2, 2); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64),new THREE.MeshStandardMaterial({color:'#131621',roughness:0.9}));
    floor.rotation.x = -Math.PI/2; floor.position.y=-0.94; scene.add(floor);
    const figures=[makeFigure('#87c9d4',-1.35),makeFigure('#cba2e9',1.35)];
    figures.forEach((g)=>scene.add(g));
    const clock = new THREE.Clock();
    let frame;
    let disposed = false;
    sceneRef.current={figures};
    const resize=()=>{
      const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
      renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    };
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    function animate(){
      if(disposed) return;
      const t=clock.getElapsedTime();
      figures.forEach((g,i)=>{
        g.position.y=Math.sin(t*1.1+i*2)*0.025;
        g.rotation.y=Math.sin(t*0.35+i)*0.07;
      });
      renderer.render(scene,camera);
      frame=requestAnimationFrame(animate);
    }
    animate();
    // Each candidate is loaded separately; failed/missing assets leave honest procedural figures.
    const paths=['/avatars/alice-fbx-source.glb','/alice.vrm'];
    paths.forEach((url,i)=>{
      getGLTFLoader().loadAsync(url).then((gltf)=>{
        if(disposed) return;
        const model=gltf.userData.vrm?.scene || gltf.scene;
        const box=new THREE.Box3().setFromObject(model);
        const size=box.getSize(new THREE.Vector3());
        if(!size.y || !Number.isFinite(size.y)) throw Error('invalid model bounds');
        model.scale.multiplyScalar(2.65/size.y);
        model.updateWorldMatrix(true,true);
        const normalized=new THREE.Box3().setFromObject(model);
        const center=normalized.getCenter(new THREE.Vector3());
        model.position.x-=center.x;model.position.y-=normalized.min.y+0.91;model.position.z-=center.z;
        figures[i].clear();
        figures[i].add(model);
        onModelStatus((previous)=>{
          const next=[...previous];next[i]=gltf.userData.vrm?'VRM geladen':'GLB geladen (VRM nicht bestätigt)';return next;
        });
      }).catch(()=>{if(!disposed)onModelStatus((previous)=>{
        const next=[...previous];next[i]='3D-Prozedural · Modelldatei nicht geladen';return next;
      });});
    });
    return ()=>{
      disposed=true;
      observer.disconnect();cancelAnimationFrame(frame);
      renderer.dispose();
      sceneRef.current=null;
    };
  }, [onModelStatus]);
  useEffect(()=>{
    if(!sceneRef.current) return;
    sceneRef.current.figures.forEach((g,i)=>{g.scale.setScalar(active === (i===0?'sami':'elisa')?1.06:1);});
  },[active]);
  return <canvas ref={canvasRef} aria-label="Zwei unabhängig dargestellte 3D-Figuren Sami und Elisa" style={{width:'100%',height:'min(52vh,450px)',display:'block'}} />;
}

function speak(text, agent, setVoiceState) {
  if (!('speechSynthesis' in window)) { setVoiceState('Sprachausgabe nicht verfügbar'); return; }
  const synth=window.speechSynthesis;
  synth.cancel();
  const voices=synth.getVoices().filter(v=>v.lang.toLowerCase().startsWith('de'));
  const first=voices[0], second=voices.find(v=>v.voiceURI!==first?.voiceURI);
  const selected=agent==='sami'?first:(second||first);
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang='de-DE';
  if(selected) utterance.voice=selected;
  utterance.rate=agent==='sami'?0.9:0.82;
  utterance.pitch=agent==='sami'?0.8:1.15;
  utterance.onstart=()=>setVoiceState(agent==='sami'?'Sami spricht':second?'Elisa spricht · getrennte Browserstimme':'Elisa spricht · Pitchvariante derselben Browserstimme');
  utterance.onend=()=>setVoiceState('Bereit');
  utterance.onerror=()=>setVoiceState('Audioausgabe fehlgeschlagen');
  synth.speak(utterance);
}

export default function DualStudio(){
  const [text,setText]=useState('');
  const [status,setStatus]=useState('Noch kein Modellaufruf');
  const [result,setResult]=useState(null);
  const [active,setActive]=useState(null);
  const [voiceState,setVoiceState]=useState('Noch kein Audiotest');
  const [modelStatus,setModelStatus]=useState(['3D-Prozedural','3D-Prozedural']);
  const [listening,setListening]=useState(false);
  const controllerRef=useRef(null);
  const submit=async(value)=>{
    const prompt=String(value||'').trim();
    if(!prompt) return;
    controllerRef.current?.abort();
    const controller=new AbortController();controllerRef.current=controller;
    setResult(null);setStatus('Zwei unabhängige Anfragen laufen ...');
    try{
      const response=await fetch('/api/dual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:prompt}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'HTTP '+response.status);
      setResult(data);setStatus(data.status==='ok'?'Zwei Agentenantworten angekommen':data.status==='partial'?'Eine Antwort fehlgeschlagen':'Keine Modelle verfügbar');
    }catch(error){if(error.name!=='AbortError'){setStatus('Nicht einsatzbereit: '+error.message);setResult(null);}}
  };
  const listen=()=>{
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setVoiceState('Spracherkennung in diesem Browser nicht verfügbar');return;}
    const r=new Recognition();r.lang='de-DE';r.continuous=false;r.interimResults=false;
    r.onstart=()=>setListening(true);
    r.onerror=()=>{setListening(false);setVoiceState('Mikrofon fehlgeschlagen');};
    r.onend=()=>setListening(false);
    r.onresult=e=>{const words=e.results?.[0]?.[0]?.transcript||'';setText(words);void submit(words);};
    r.start();
  };
  useEffect(()=>()=>{controllerRef.current?.abort();window.speechSynthesis?.cancel();},[]);
  const panel={background:'#171923',border:'1px solid #363a53',padding:'16px',borderRadius:'16px',flex:'1 1 260px'};
  const button={background:'#d9deed',color:'#12141d',border:0,borderRadius:9,padding:'10px 14px',cursor:'pointer'};
  return <main style={{minHeight:'100vh',background:'#07090f',color:'#edf1f9',fontFamily:'system-ui,sans-serif',padding:16}}>
    <header style={{maxWidth:950,margin:'0 auto'}}>
      <h1 style={{fontSize:'clamp(22px,4vw,38px)',margin:'10px 0'}}>Alice · Doppelraum</h1>
      <p style={{color:'#adb3ca',maxWidth:800}}>Zwei echte, getrennte Modellanfragen an Sami und Elisa. Zwei gerenderte 3D-Figuren, experimentelle Browserstimmen. Kein aktiver Hintergrundagent, kein autonomer Dateizugriff.</p>
    </header>
    <div style={{maxWidth:950,margin:'0 auto',border:'1px solid #363a53',borderRadius:18,overflow:'hidden'}}>
      <DualScene active={active} onModelStatus={setModelStatus}/>
      <div style={{display:'flex',gap:12,justifyContent:'space-around',padding:12,background:'#11131d',fontSize:13}}>
        <span><strong>Sami</strong> · {modelStatus[0]}</span><span><strong>Elisa</strong> · {modelStatus[1]}</span>
      </div>
    </div>
    <form onSubmit={e=>{e.preventDefault();void submit(text);}} style={{maxWidth:950,margin:'18px auto',display:'flex',gap:8,flexWrap:'wrap'}}>
      <input aria-label="Nachricht an beide Agentinnen" value={text} onChange={e=>setText(e.target.value)} placeholder="Frage an Sami und Elisa ..." style={{flex:'1 1 260px',padding:14,borderRadius:10,border:'1px solid #555d75',background:'#171923',color:'#fff',fontSize:15}}/>
      <button style={button} type="submit">Beide ansprechen</button>
      <button style={button} type="button" onClick={listen} aria-label="Mikrofon starten">{listening?'Höre zu ...':'Mikrofon'}</button>
      <button style={button} type="button" onClick={()=>{window.speechSynthesis?.cancel();setActive(null);setVoiceState('Gestoppt');controllerRef.current?.abort();setStatus('Gestoppt');}}>Stopp</button>
    </form>
    <section role="status" style={{maxWidth:950,margin:'0 auto 12px',color:'#c5cbd9'}}>{status} · Audio: {voiceState}</section>
    <section style={{display:'flex',maxWidth:950,margin:'0 auto',gap:12,flexWrap:'wrap'}}>
      {['sami','elisa'].map((id)=>{
        const data=result?.agents?.find(a=>a.id===id);
        return <article key={id} style={panel}>
          <h2 style={{marginTop:0}}>{id==='sami'?'Sami · Analyse':'Elisa · Exploration'}</h2>
          <p style={{whiteSpace:'pre-wrap',lineHeight:1.6,minHeight:70}}>{data?.status==='ok'?data.reply:data?.status==='error'?'Anfrage fehlgeschlagen. Kein erfundener Ersatztext.':'Noch keine echte Agentenantwort.'}</p>
          <small style={{display:'block',color:'#adb3ca',marginBottom:10}}>{data?.status==='ok'?data.provider+' / '+data.model:'Nicht verifiziert'}</small>
          <button style={button} type="button" disabled={data?.status!=='ok'} onClick={()=>{setActive(id);speak(data.reply,id,setVoiceState);}}>Stimme abspielen</button>
        </article>;
      })}
    </section>
    <footer style={{maxWidth:950,margin:'18px auto',color:'#9ba3bd',fontSize:12}}>Experimenteller Prototyp auf einem separaten Entwicklungsbranch. Reale VRM-Modellqualität, unabhängige TTS-Stimmen und Deployment müssen auf dem Zielgerät geprüft werden.</footer>
  </main>;
}
