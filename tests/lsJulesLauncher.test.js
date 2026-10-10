import { describe,it,expect } from 'vitest';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
describe('Jules launcher must not silently start a paid agent',()=>{
 it('defaults to an offline dry-run with approval enabled',()=>{
   const here=dirname(fileURLToPath(import.meta.url));
   const output=execFileSync(process.execPath,[resolve(here,'../tools/ls-jules-session.mjs')],{encoding:'utf8',env:{...process.env,JULES_API_KEY:''}});
   const parsed=JSON.parse(output);
   expect(parsed.mode).toBe('dry-run');
   expect(parsed.status).toBe('NOT_LAUNCHED');
   expect(parsed.plan.requirePlanApproval).toBe(true);
   expect(parsed.plan.issue).toMatch(/\/issues\/113/);
 });
});
