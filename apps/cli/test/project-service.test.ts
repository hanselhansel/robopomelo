import { it,expect } from 'vitest';
import { mkdtemp,rm,realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectService } from '../src/services/project.js';
it('creates and reopens a real folder with separate inspect and author authority',async()=>{
 const folder=await realpath(await mkdtemp(join(tmpdir(),'robopomelo-service-')));
 const service=new ProjectService({toolVersion:'test',configDirectory:join(folder,'config')});
 try{
  await service.create(join(folder,'project'),'Receiving');
  const read=await service.read();expect(read.kind).toBe('readable');
  expect(service.status().scopes).toEqual(['inspect']);
  await service.grant(['author','evidence','export'],'autonomous',false);
  const s=await service.snapshot();
  const result=await service.apply({formatVersion:'1.0.0',id:'change-one',projectId:s.deployment.project.id,baseRevision:s.sourceRevision,baseHash:s.sourceHash,actor:{kind:'human',name:'Engineer'},purpose:'State the problem',operations:[{op:'project',fields:{problem:{state:'provided',value:'Receiving handoffs are unclear.'}}}]});
  expect(result.kind).toBe('committed');expect((await service.snapshot()).deployment.project.problem).toMatchObject({value:'Receiving handoffs are unclear.'});
 }finally{await service.close();await rm(folder,{recursive:true,force:true});}
});
it('revokes a remembered grant while retaining its audit record',async()=>{
 const folder=await realpath(await mkdtemp(join(tmpdir(),'robopomelo-revoke-')));
 const service=new ProjectService({toolVersion:'test',configDirectory:join(folder,'config')});
 try{
  await service.create(join(folder,'project'),'Receiving');await service.grant(['author'],'autonomous',true);
  const selected=service.current!;const binding={...selected.root.identity(),projectId:selected.projectId!};
  await service.revoke();
  const grants=await service.trust.show(binding);expect(grants).toHaveLength(1);expect(grants[0]!.revokedAt).not.toBeNull();
  await service.open(join(folder,'project'));expect(service.status().scopes).toEqual(['inspect']);
 }finally{await service.close();await rm(folder,{recursive:true,force:true});}
});
