import {describe,it,expect} from 'vitest';
import {FORENSIC_CASES,normalizeEvidence,evaluateClaim} from '../src/core/lsForensics.js';
describe('LS provenance hard join',()=>{
 const mk=(id,role)=>({id,claimId:'zenodo',role,url:'https://example.org/'+id,sha256:'a'.repeat(64),sourceTime:'2026-10-09T09:00:00Z',capturedAt:'2026-10-10T00:00:00Z'});
 it('retains separate cases for Atlas Earth, Atlas AI, Zenodo, Buildly and archives',()=>{
   expect(FORENSIC_CASES.map(x=>x.id)).toEqual(expect.arrayContaining(['atlas-earth','atlas-ai','zenodo','charming-buildy-buildly','a-circle-news-studio','chatgpt-library','commercial-rights']));
 });
 it('blocks premature attribution and payment-claim verification',()=>{
   const r=evaluateClaim({claimId:'zenodo',requestedStatus:'verified',evidence:[mk('one','primary')]});
   expect(r.status).toBe('unverified');expect(r.blockers).toContain('hard-join-not-demonstrated');
 });
 it('requires two separate provenance anchors and a supported join',()=>{
   const evidence=[mk('p','primary'),mk('q','independent')];
   expect(evaluateClaim({claimId:'zenodo',evidence,requestedStatus:'verified',hardJoin:{url:'https://example.org/compare',method:'identical-hash',evidenceIds:['p','q']}}).hardJoinVerified).toBe(true);
   expect(evaluateClaim({claimId:'zenodo',evidence,requestedStatus:'verified',hardJoin:{url:'https://example.org/compare',method:'similar-logo',evidenceIds:['p','q']}}).status).toBe('unverified');
 });
 it('rejects invalid URLs and fabricated checksum formats',()=>{
   expect(normalizeEvidence({id:'1',claimId:'a',url:'javascript:bad'})).toBeNull();
   expect(normalizeEvidence({id:'1',claimId:'a',url:'https://example.org',sha256:'xyz'}).sha256).toBeNull();
 });
});
