import { expect,it } from 'vitest';
import { startServer } from '../../apps/cli/src/server/start.js';
async function fixture(){return startServer({toolVersion:'1.0.0-rc.1',routes:[{method:'GET',path:'/api/project',handler:async()=>({message:'private project'})}]});}
it('binds loopback on an ephemeral port and consumes bootstrap only once',async()=>{
 const server=await fixture();
 try{
  expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const secret=new URL(server.bootstrapUrl).hash.slice(1);
  const headers={'Origin':server.url,'Content-Type':'application/json'};
  const first=await fetch(server.url+'/api/session',{method:'POST',headers,body:JSON.stringify({secret})});
  expect(first.status).toBe(200);const result=await first.json();
  expect(result.data.credential).toBeTypeOf('string');expect(result.data.csrf).toBeTypeOf('string');
  expect((await fetch(server.url+'/api/session',{method:'POST',headers,body:JSON.stringify({secret})})).status).toBe(403);
 }finally{await server.close();}
});
it('denies foreign origin and unauthenticated reads even without an Origin',async()=>{
 const server=await fixture();
 try{
  expect((await fetch(server.url+'/api/project')).status).toBe(403);
  expect((await fetch(server.url+'/api/project',{headers:{Origin:'https://foreign.example'}})).status).toBe(403);
  expect((await fetch(server.url+'/api/project',{headers:{Host:'foreign.example'}})).status).toBe(403);
 }finally{await server.close();}
});
it('requires credentials CSRF and current project epoch for writes',async()=>{
 let writes=0;
 const server=await startServer({toolVersion:'test',routes:[{method:'POST',path:'/api/patch/apply',handler:async()=>{writes++;return {applied:true};}}]});
 try{
  const response=await fetch(server.url+'/api/session',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json'},body:JSON.stringify({secret:new URL(server.bootstrapUrl).hash.slice(1)})});
  const {data}=await response.json();
  const headers={Origin:server.url,'Content-Type':'application/json',Authorization:`Bearer ${data.credential}`,'X-RP-Project-Epoch':'0'};
  expect((await fetch(server.url+'/api/patch/apply',{method:'POST',headers,body:'{}'})).status).toBe(403);
  expect((await fetch(server.url+'/api/patch/apply',{method:'POST',headers:{...headers,'X-RP-CSRF':data.csrf},body:'{}'})).status).toBe(200);
  server.setProjectStatus({projectOpen:true,root:'/selected',projectEpoch:'1'});
  expect((await fetch(server.url+'/api/patch/apply',{method:'POST',headers:{...headers,'X-RP-CSRF':data.csrf},body:'{}'})).status).toBe(409);
  expect(writes).toBe(1);
 }finally{await server.close();}
});
it('returns structured domain failures without stack traces',async()=>{
 const {DomainError}=await import('../../packages/core/src/errors.js');
 const server=await startServer({toolVersion:'test',routes:[{method:'GET',path:'/api/project',handler:async()=>{throw new DomainError('SCOPE_REQUIRED','Required scope: inspect');}}]});
 try{
  const response=await fetch(server.url+'/api/session',{method:'POST',headers:{Origin:server.url,'Content-Type':'application/json'},body:JSON.stringify({secret:new URL(server.bootstrapUrl).hash.slice(1)})});
  const {data}=await response.json();
  const result=await fetch(server.url+'/api/project',{headers:{Authorization:`Bearer ${data.credential}`,'X-RP-Project-Epoch':'0'}});
  expect(result.status).toBe(403);const body=await result.json();expect(body.error.code).toBe('SCOPE_REQUIRED');expect(body.error).not.toHaveProperty('stack');
 }finally{await server.close();}
});
