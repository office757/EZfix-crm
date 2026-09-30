import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function signJobCompletion('),html.indexOf('window.signJobCompletion ='));
function fixture({workflowVersion=1,ready=true,saveError=false}={}) {
 const job={id:'job',title:'Test',customerName:'Synthetic',workflowVersion,status:'work_finished'};
 const events=[],timers=[];let sign;
 const context={window:{},getOne:()=>job,SB:{rpc:async name=>{
   events.push(name);if(name==='dispatch_job_ready')return {data:ready};
   if(saveError)return {error:new Error('Save denied')};return {data:null};
 }},refreshCollection:async()=>{events.push('refresh');job.status='completed';},
 updateJobStatusWithHistory:async(_id,status)=>{if(saveError)throw Error('Save denied');events.push('legacy-save');job.status=status;},
 openSignatureModal:(_title,_name,cb)=>{sign=cb;},logAudit:()=>events.push('audit'),toast:()=>events.push('toast'),closeModal:()=>events.push('close'),
 render:()=>events.push('render:'+job.status),setTimeout:fn=>timers.push(fn),promptWarrantyForJob:()=>events.push('warranty')};
 vm.createContext(context);vm.runInContext(source,context);
 return {job,events,timers,start:()=>context.signJobCompletion('job'),save:()=>sign?.('data:image/png;base64,fixture','Synthetic')};
}
for(const workflowVersion of [1,0]) {
 const f=fixture({workflowVersion});await f.start();await f.save();
 assert.ok(f.events.includes('render:completed'),'Completed state renders without Realtime');
 assert.ok(f.events.indexOf('render:completed')>f.events.indexOf(workflowVersion?'refresh':'legacy-save'));
 assert.equal(f.events.at(-1),'render:completed');
 assert.equal(f.timers.length,1);f.timers[0]();assert.equal(f.events.at(-1),'warranty');
 const denied=fixture({workflowVersion,saveError:true});await denied.start();await assert.rejects(denied.save(),/Save denied/);
 assert.ok(!denied.events.some(e=>e.startsWith('render:')));assert.equal(denied.timers.length,0);assert.equal(denied.job.status,'work_finished');
}
const unready=fixture({ready:false});await unready.start();assert.equal(await unready.save(),undefined);assert.ok(!unready.events.includes('complete_dispatch_job'));
console.log('Job completion refresh: dispatch and legacy success, both save failures, readiness rejection PASS');
