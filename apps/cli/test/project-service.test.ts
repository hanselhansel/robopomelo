import { it,expect } from 'vitest';
import { mkdtemp,rm,realpath,rename,mkdir,writeFile,readFile } from 'node:fs/promises';
import { stringify } from 'yaml';
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
it('refuses to create into a replaced expected root before any write',async()=>{
 const folder=await realpath(await mkdtemp(join(tmpdir(),'robopomelo-expected-')));
 const service=new ProjectService({toolVersion:'test',configDirectory:join(folder,'config')});
 try{
  const path=join(folder,'project');await mkdir(path);
  const pinned=await (await import('@robopomelo/project-fs')).SafeRoot.open(path);const expectedRoot=pinned.identity();await pinned.close();
  await rename(path,path+'-original');await mkdir(path);
  await expect(service.create(path,'Receiving',false,[],{expectedRoot})).rejects.toMatchObject({code:'ROOT_CHANGED'});
  await expect(readFile(join(path,'deployment.yaml'))).rejects.toMatchObject({code:'ENOENT'});
  expect(service.status().projectOpen).toBe(false);
 }finally{await service.close();await rm(folder,{recursive:true,force:true});}
});
it('keeps the current selection when an opened root or project identity differs from what was expected',async()=>{
 const folder=await realpath(await mkdtemp(join(tmpdir(),'robopomelo-expected-')));
 const service=new ProjectService({toolVersion:'test',configDirectory:join(folder,'config')});
 try{
  const first=join(folder,'first'),second=join(folder,'second');
  await service.create(first,'First');const firstEpoch=service.epoch;const firstRoot=service.current!.root.identity();const firstId=service.current!.projectId;
  await service.create(second,'Second');const secondRoot=service.current!.root.identity();
  await expect(service.open(first,[],undefined,{root:secondRoot})).rejects.toMatchObject({code:'ROOT_CHANGED'});
  expect(service.status().root).toBe(second);
  await expect(service.open(first,[],undefined,{root:firstRoot,projectId:'someone-else'})).rejects.toMatchObject({code:'PROJECT_CHANGED'});
  expect(service.status().root).toBe(second);
  const opened=await service.open(first,[],undefined,{root:firstRoot,projectId:firstId});
  expect(opened.root).toBe(first);expect(service.epoch).not.toBe(firstEpoch);
  const deployment=structuredClone((await service.snapshot()).deployment);deployment.project.id='replacement-project';
  await writeFile(join(first,'deployment.yaml'),stringify(deployment));
  await expect(service.open(first,[],undefined,{root:firstRoot,projectId:firstId})).rejects.toMatchObject({code:'PROJECT_CHANGED'});
 }finally{await service.close();await rm(folder,{recursive:true,force:true});}
});
