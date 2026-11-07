#!/usr/bin/env python3
"""Live, credential-free diagnostic of public Alice backend. Never fabricate LLM availability."""
import json,urllib.request,urllib.error,datetime
out={"checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"url":"https://alicealpha.onrender.com/api/health"}
try:
 req=urllib.request.Request(out["url"],headers={"User-Agent":"GLaDOS-DE-live-probe/1.0"})
 with urllib.request.urlopen(req,timeout=60) as r: payload=json.loads(r.read(128000))
 out.update({"http_status":r.status,"reachable":True,
 "chat_operational":payload.get("chat",{}).get("operational"),
 "available_providers":payload.get("chat",{}).get("availableProviders"),
 "realtime_operational":payload.get("realtimeOperational")})
except Exception as e:
 out.update({"reachable":False,"error":type(e).__name__,"detail":str(e)[:140]})
print(json.dumps(out,ensure_ascii=False,indent=2))
with open("alice-health-proof.json","w") as f:json.dump(out,f,indent=2)
