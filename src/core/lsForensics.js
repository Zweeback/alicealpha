// Evidence-first LS forensic case registry. Stores ONLY public case metadata
// in the repo. Raw evidence, private identities and user assets stay in owner storage.
export const FORENSIC_CASES = Object.freeze([
  {id:'atlas-earth',title:'Atlas Earth / Atlas Reality: origin and access-path claim',kind:'attribution',status:'open',sources:['primary product publication timeline','earliest dated owner artifact','documented access or transfer path']},
  {id:'atlas-ai',title:'Atlas AI: establish identity separate from Atlas Earth',kind:'entity-resolution',status:'open',sources:['legal entity filings','public DOI/ORCID metadata','original dated artifacts']},
  {id:'zenodo',title:'Zenodo: DOI/version and author metadata anomalies',kind:'publication',status:'open',sources:['Zenodo public API record/version','registered DOI metadata','dated snapshot']},
  {id:'charming-buildy-buildly',title:'Charming / Buildy.so / Buildly.io: distinct entities and migrations',kind:'entity-resolution',status:'open',sources:['official migration statements','release and GitHub provenance','matching file hashes']},
  {id:'a-circle-news-studio',title:'Missing A-circle news-studio visual: source and chronology',kind:'lost-artifact',status:'open',sources:['original chat export and asset','before/after screenshot and timestamps','public independent target artifact']},
  {id:'beamstream',title:'Beamstream / Manus runtime: original-code provenance',kind:'code-provenance',status:'open',sources:['git commit graph','dependency lock versions','original source bundle hash']},
  {id:'chatgpt-library',title:'ChatGPT chat, file and Library continuity gaps',kind:'archive-integrity',status:'open',sources:['official file references','full source-export manifests','reproducible version/date observations']},
  {id:'commercial-rights',title:'Commercial rights / alleged missing payment: verify actual receivable',kind:'financial-claim',status:'open',sources:['dated written agreement or assignment','traceable transfer/usage evidence','transaction or payable record']},
]);
export const CLAIM_STATES = Object.freeze(['unverified','supported','contradicted','inconclusive','verified']);
const allowed = new Set(CLAIM_STATES);
const safe = (x,max=500) => String(x??'').trim().slice(0,max);
const safeRef = (s) => typeof s==='string' && /^https:\/\//i.test(s) && s.length<1500;
export function normalizeEvidence(input={}) {
  if(!input?.id||!input?.claimId || !safeRef(input?.url))return null;
  return {
    id:safe(input.id,96),claimId:safe(input.claimId,96),url:input.url,
    sha256:/^[a-f0-9]{64}$/i.test(input.sha256||'')?input.sha256.toLowerCase():null,
    sourceTime:/^\d{4}-\d{2}-\d{2}T/.test(input.sourceTime||'')?safe(input.sourceTime,40):null,
    capturedAt:/^\d{4}-\d{2}-\d{2}T/.test(input.capturedAt||'')?safe(input.capturedAt,40):null,
    role:['primary','independent','counter','claim'].includes(input.role)?input.role:'claim',
    artifact:safe(input.artifact,180),
  };
}
export function evaluateClaim({claimId,evidence=[],hardJoin=null,requestedStatus='unverified'}={}) {
  const records=evidence.map(normalizeEvidence).filter(x=>x&&x.claimId===claimId);
  const hasPrimary=records.some(x=>x.role==='primary'&&x.sha256&&x.sourceTime);
  const hasIndependent=records.some(x=>x.role==='independent'&&x.sha256);
  const hasCounter=records.some(x=>x.role==='counter');
  const validJoin=Boolean(hardJoin&&safeRef(hardJoin.url)&&
    ['identical-hash','signed-commit','documented-transfer','traceable-origin'].includes(hardJoin.method)&&
    hardJoin.evidenceIds?.length>=2&&hardJoin.evidenceIds.every(id=>records.some(x=>x.id===id))&&
    hasPrimary&&hasIndependent);
  const blockers=[
    ...(!hasPrimary?['dated-primary-artifact-missing']:[]),
    ...(!hasIndependent?['independent-corroboration-missing']:[]),
    ...(!validJoin?['hard-join-not-demonstrated']:[]),
  ];
  const desired=allowed.has(requestedStatus)?requestedStatus:'unverified';
  // Never promote an attribution/financial claim solely on similarity, commentary or text.
  // Shape validation cannot prove provenance: a human-examined primary record
  // and independent verification are separate from an untrusted metadata claim.
  const status=desired==='verified'?'inconclusive':desired;
  return {claimId,status,evidenceCount:records.length,hardJoinCandidate:validJoin,hardJoinVerified:false,hasCounter,blockers};
}
