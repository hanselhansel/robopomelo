import {expect,it} from 'vitest';
import {assertDecisionRecorder} from '../src/permissions.js';
it('rejects an agent naming itself as its human delegate',()=>{
 expect(()=>assertDecisionRecorder({kind:'agent',name:'Assistant',onBehalfOf:'Assistant',source:'self'},'Assistant','self')).toThrow(/human|self/i);
});
it('permits explicit supplied external human delegation',()=>{
 expect(()=>assertDecisionRecorder({kind:'agent',name:'Assistant',onBehalfOf:'Warehouse reviewer',source:'Supplied meeting record'},'Warehouse reviewer','Supplied meeting record')).not.toThrow();
});
