const crypto = require('node:crypto');
const MAX_BYTES = 16384;
function secureEqual(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=crypto.createHash('sha256').update(a).digest();
  const y=crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x,y);
}
module.exports = async function(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method_not_allowed'});}
  const token=process.env.ALICE_BRIDGE_TOKEN;
  const supplied=(req.headers.authorization||'').replace(/^Bearer /i,'');
  if(!token || !secureEqual(supplied,token)) return res.status(401).json({ok:false,error:'unauthorized'});
  if(Number(req.headers['content-length']||0)>MAX_BYTES) return res.status(413).json({ok:false,error:'payload_too_large'});
  let body=req.body;
  if(typeof body==='string') {try{body=JSON.parse(body)}catch(_){return res.status(400).json({ok:false,error:'invalid_json'})}}
  if(!body||typeof body!=='object'||Array.isArray(body)) return res.status(400).json({ok:false,error:'invalid_payload'});
  if(JSON.stringify(body).length>MAX_BYTES) return res.status(413).json({ok:false,error:'payload_too_large'});
  const requestId= typeof body.id==='string' && /^[a-zA-Z0-9_.:-]{1,96}$/.test(body.id) ? body.id : crypto.randomUUID();
  if(body.action === 'handshake') {
     return res.status(200).json({ok:true,id:requestId,protocol:'alice-bridge/1',message:'authenticated',retention:'none',execution:'none'});
  }
  if(body.action === 'validate') {
    const source=body.source, target=body.target, category=body.category;
    const sources=['chat','android','n8n','api'];
    const categories=['note','device.intent','workflow.intent','system.event'];
    if(!sources.includes(source)||!sources.includes(target)||!categories.includes(category)) return res.status(422).json({ok:false,error:'unsupported_envelope'});
    return res.status(200).json({ok:true,id:requestId,valid:true,delivered:false,persisted:false,reason:'storage_and_receivers_not_connected'});
  }
  return res.status(422).json({ok:false,error:'unsupported_action',allowed:['handshake','validate']});
};