import { useEffect, useRef, useState } from 'react';
import { AvatarWorkbench } from '../avatar/AvatarWorkbench.js';
import { getGLTFLoader } from '../xr/loader.js';
import { collectWorkbenchSnapshot } from './vrmComponentStats.js';

const BASE = import.meta.env.BASE_URL;
const SOURCES = {
  original: `${BASE}avatars/alice-fbx-source.vrm`,
  design: `${BASE}avatars/alice-designsheet-candidate.vrm`,
  glb: `${BASE}avatars/alice-fbx-source.glb`,
};

const css = `
.vca{min-height:100dvh;background:#090b12;color:#eef0fa;font:14px Inter,system-ui,sans-serif;padding:18px}
.vca *{box-sizing:border-box}.vca header{max-width:1500px;margin:0 auto 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.vca h1{font-size:clamp(24px,4vw,40px);margin:4px 0;letter-spacing:-.05em}.vca .eyebrow{color:#91dce5;letter-spacing:.2em;font-size:10px;font-weight:700}
.vca p{color:#9ca4b9}.vca-grid{max-width:1500px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px}
.vca-stage{height:min(76dvh,850px);min-height:420px;border:1px solid #35374d;border-radius:18px;overflow:hidden;background:#111522;position:relative}
.vca-stage canvas{width:100%;height:100%;display:block;touch-action:none}.vca-side{display:flex;flex-direction:column;gap:10px}
.vca-panel{background:#151827;border:1px solid #303449;border-radius:14px;padding:14px}.vca-panel h2{font-size:11px;letter-spacing:.13em;color:#b8a6ff;margin:0 0 10px}
.vca button,.vca label.upload{background:#262a40;border:1px solid #454b68;color:#f3f1ff;border-radius:9px;padding:9px 11px;cursor:pointer;font:inherit;font-size:12px}
.vca button:hover,.vca label.upload:hover{border-color:#9e8be9}.vca button:disabled{opacity:.5}.vca .row{display:flex;gap:7px;flex-wrap:wrap}
.vca input[type=file]{display:none}.vca .upload{display:block;text-align:center;margin-top:8px}
.vca .parts{max-height:260px;overflow:auto}.vca .part{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #ffffff12;font-size:12px}
.vca .part input{accent-color:#b39cff}.vca .muted{font-size:11px;color:#9098ad;line-height:1.5}.vca .status{position:absolute;left:14px;top:14px;background:#101522d9;border:1px solid #3c425a;padding:8px 10px;border-radius:9px;font-size:11px}
.vca .metric{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #ffffff12;font-size:12px}.vca .metric span:first-child{color:#9ca4b9}
@media(max-width:850px){.vca-grid{grid-template-columns:1fr}.vca-stage{height:55dvh;min-height:340px}.vca-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.vca{padding:10px}.vca header{align-items:flex-start}.vca-side{display:flex}.vca-stage{height:48dvh;min-height:300px}}
`;

export default function VRMComponentsApp(){
  const canvasRef=useRef(null), workbenchRef=useRef(null);
  const [status,setStatus]=useState('Initialisiere Komponenten-Labor …');
  const [error,setError]=useState('');
  const [stats,setStats]=useState({type:'procedural',boneCount:0,meshCount:0,bones:[],morphs:[]});
  const [parts,setParts]=useState([]);
  const [source,setSource]=useState('alice-fbx-source.vrm');
  const [busy,setBusy]=useState(false);
  const refresh=()=>{
    const w=workbenchRef.current;
    if(!w?.model)return;
    const snapshot=collectWorkbenchSnapshot(w);
    setParts(snapshot.parts);
    setStats(snapshot.stats);
  };
  useEffect(()=>{
    let alive=true;
    try{
      const w=new AvatarWorkbench(canvasRef.current,()=>{if(alive)refresh();});
      workbenchRef.current=w;
      const load=async()=>{
        try{
          const response=await fetch(SOURCES.original);
          if(!response.ok)throw new Error('VRM-Datei nicht erreichbar: HTTP '+response.status);
          const bytes=await response.arrayBuffer();
          const gltf=await getGLTFLoader().parseAsync(bytes,'');
          if(!alive)return;
          const vrm=gltf.userData?.vrm||null;
          w.setModel(vrm?.scene||gltf.scene,vrm,vrm?'vrm':'glb');
          setSource('alice-fbx-source.vrm');
          setStatus(vrm?'Original-VRM geladen':'GLB/VRM-Szene geladen · VRM-Erweiterung nicht aktiv');
          refresh();
        }catch(e){if(!alive)return;setStatus('Prozeduraler Startkörper aktiv');setError(String(e.message||e));refresh();}
      };
      load();
    }catch(e){setError(String(e.message||e));setStatus('WebGL konnte nicht gestartet werden');}
    return()=>{alive=false;workbenchRef.current?.dispose();workbenchRef.current=null;};
  },[]);
  const loadBuiltIn=async key=>{
    setBusy(true);setError('');setStatus('Lade '+key+' …');
    try{
      const response=await fetch(SOURCES[key]);if(!response.ok)throw new Error('HTTP '+response.status);
      const bytes=await response.arrayBuffer();const gltf=await getGLTFLoader().parseAsync(bytes,'');
      const vrm=gltf.userData?.vrm||null;
      workbenchRef.current.setModel(vrm?.scene||gltf.scene,vrm,vrm?'vrm':'glb');
      setSource(key==='original'?'alice-fbx-source.vrm':key==='design'?'alice-designsheet-candidate.vrm':'alice-fbx-source.glb');
      setStatus(vrm?'VRM geladen · '+key:'GLB geladen · '+key);
      refresh();
    }catch(e){setError(String(e.message||e));setStatus('Laden fehlgeschlagen');}
    finally{setBusy(false);}
  };
  const upload=async e=>{const f=e.target.files?.[0];if(!f)return;setBusy(true);setError('');try{await workbenchRef.current.loadFile(f);setSource(f.name);setStatus('Importiert · '+f.name);refresh();}catch(x){setError(String(x.message||x));}finally{setBusy(false);e.target.value='';}};
  const toggle=(uuid,visible)=>{workbenchRef.current?.model?.traverse(o=>{if(o.uuid===uuid)o.visible=visible;});setParts(p=>p.map(x=>x.uuid===uuid?{...x,visible}:x));};
  const exportModel=async()=>{try{const blob=await workbenchRef.current.exportGLB();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='alice-components-edit.glb';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('GLB exportiert');}catch(e){setError(String(e.message||e));}};
  return <main className="vca"><style>{css}</style><header><div><div className="eyebrow">ALICE · VRM COMPONENT LAB / MVP</div><h1>3D-Komponenten-App</h1><p>Modell laden · Meshes ein-/ausblenden · prüfen · als GLB exportieren</p></div><a href="./?viewer=vrm" style={{color:'#c6b9ff'}}>Zum VRM-Viewer ↗</a></header>
  <section className="vca-grid"><div className="vca-stage"><canvas ref={canvasRef}/><div className="status">{status}</div></div><aside className="vca-side">
    <section className="vca-panel"><h2>MODELLQUELLE</h2><div className="muted">{source}</div><div className="row" style={{marginTop:10}}><button disabled={busy} onClick={()=>loadBuiltIn('original')}>Original VRM</button><button disabled={busy} onClick={()=>loadBuiltIn('design')}>Design-WIP</button><button disabled={busy} onClick={()=>loadBuiltIn('glb')}>Quell-GLB</button></div><label className="upload"><input type="file" accept=".vrm,.glb" onChange={upload}/>Eigene VRM / GLB importieren</label></section>
    <section className="vca-panel"><h2>KOMPONENTEN / MESHES</h2><div className="parts">{parts.map(p=><label className="part" key={p.uuid}><input type="checkbox" checked={p.visible} onChange={e=>toggle(p.uuid,e.target.checked)}/><span>{p.name}</span></label>)}</div><p className="muted">Jede Mesh-Komponente lässt sich separat sichtbar oder unsichtbar schalten. Das Original-Rig bleibt beim Laden erhalten.</p></section>
    <section className="vca-panel"><h2>MODELLAUDIT</h2><div className="metric"><span>Format</span><b>{stats.type}</b></div><div className="metric"><span>Meshes</span><b>{stats.meshCount}</b></div><div className="metric"><span>Bones</span><b>{stats.boneCount}</b></div><div className="metric"><span>Morph Targets</span><b>{stats.morphs?.length||0}</b></div><div className="metric"><span>Rig-Knoten</span><b>{stats.bones?.length||0}</b></div></section>
    <section className="vca-panel"><h2>EXPORT / EDITOR</h2><div className="row"><button onClick={()=>workbenchRef.current?.resetPose()}>Pose zurücksetzen</button><button onClick={exportModel}>GLB exportieren</button><button onClick={()=>workbenchRef.current?.undo()}>Sculpt rückgängig</button></div><p className="muted">Orbit: ziehen · Zoom: Pinch/Mausrad. Der Sculpt-Editor und Bone-Editor sind im Workbench-Kern vorhanden; dieser MVP bindet zuerst Mesh-Komponenten und Export an.</p>{error&&<p role="alert" style={{color:'#ffb4bd'}}>{error}</p>}</section>
  </aside></section></main>;
}
