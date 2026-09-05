import { expect, it } from 'vitest';
import { capabilities } from '@robopomelo/spec';
import { assertCapabilitySupport, checkCapabilityOperation } from '../src/mutation-capability.js';
const skill=capabilities.find(c=>c.id==='frame-robot-deployment')!;
it('fails closed for mismatched, invalid and unsupported capability ranges or stages',()=>{
 for(const specRange of ['^2.0.0','1.1.0','*','not-a-range'])expect(()=>assertCapabilitySupport({...skill,specRange},'1.0.0')).toThrow(expect.objectContaining({code:'UNSUPPORTED_CAPABILITY'}));
 for(const stage of ['experimental','beta','deprecated','removed'] as const)expect(()=>assertCapabilitySupport({...skill,stage},'1.0.0')).toThrow(expect.objectContaining({code:'UNSUPPORTED_CAPABILITY'}));
 expect(()=>assertCapabilitySupport({...skill,available:false},'1.0.0')).toThrow(expect.objectContaining({code:'UNSUPPORTED_CAPABILITY'}));
 expect(()=>assertCapabilitySupport(skill,'1.0.0')).not.toThrow();
 expect(()=>assertCapabilitySupport({...skill,specRange:'1.0.0'},'1.0.0')).not.toThrow();
});
it('checks exact field declarations and requires collection-wide authority for add/remove',()=>{
 const fields=['project.scope','kpis.baseline'];
 expect(()=>checkCapabilityOperation({op:'project',fields:{scope:null}},fields)).not.toThrow();
 expect(()=>checkCapabilityOperation({op:'project',fields:{outcome:null}},fields)).toThrow(expect.objectContaining({code:'FIELD_NOT_ALLOWED'}));
 expect(()=>checkCapabilityOperation({op:'update',collection:'kpis',id:'metric',fields:{baseline:null}},fields)).not.toThrow();
 expect(()=>checkCapabilityOperation({op:'remove',collection:'kpis',id:'metric'},fields)).toThrow(expect.objectContaining({code:'FIELD_NOT_ALLOWED'}));
 expect(()=>checkCapabilityOperation({op:'remove',collection:'kpis',id:'metric'},['kpis.*'])).not.toThrow();
});
