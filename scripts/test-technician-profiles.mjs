import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../technician-profiles.js',import.meta.url),'utf8');
function profiles({office=true,path='team-profiles/tech-a/00000000-0000-4000-8000-000000000101.jpg'}={}){
 const calls=[],portraits=[{dataset:{technicianPhoto:path},innerHTML:''}],member={id:'tech-a',role:'Technician',name:'David Smith',profilePhotoPath:path};
 const c={window:{},STORE:{team:[member]},esc:v=>String(v??'').replaceAll('"','&quot;'),canOperateOffice:()=>office,getOne:()=>member,showModal:v=>calls.push(['modal',v]),toast:v=>calls.push(['toast',v]),SB:{storage:{from:()=>({createSignedUrl:async p=>{calls.push(['sign',p]);return {data:{signedUrl:'https://example.invalid/private-portrait'}};}})},rpc:async()=>{calls.push(['rpc']);return {};}},document:{querySelectorAll:()=>portraits,getElementById:()=>null},Date,Map};
 vm.createContext(c);vm.runInContext(source,c);return {api:c.window.TechnicianProfiles,calls,portraits,member};
}
test('saved portraits sign once, update placeholders and reuse the URL',async()=>{
 const h=profiles();assert.match(h.api.avatar('tech-a','David Smith'),/DS/);h.api.avatar('tech-a','David Smith');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(h.calls.filter(c=>c[0]==='sign').length,1);assert.match(h.portraits[0].innerHTML,/private-portrait/);assert.match(h.api.avatar('tech-a','David Smith'),/<img/);
});
test('foreign or malformed storage paths remain initials without signing',()=>{
 for(const path of ['team-profiles/other/00000000-0000-4000-8000-000000000101.jpg','https://example.invalid/photo','team-profiles/tech-a/../x.jpg']){const h=profiles({path});assert.match(h.api.avatar('tech-a','David Smith'),/>DS</);assert.equal(h.calls.length,0);}
});
test('technicians cannot open the uploader or change another profile',async()=>{const h=profiles({office:false});h.api.open('tech-a');await h.api.upload('tech-a');await h.api.remove('tech-a');assert.equal(h.calls.length,0);});
test('bank withdrawal directs owner to Square and does not submit a transfer',()=>{
 let modal;const c={window:{},IS_OWNER:false,renderWorkspaceHub(){},showModal:v=>modal=v};vm.createContext(c);vm.runInContext(readFileSync(new URL('../business-finance.js',import.meta.url),'utf8'),c);c.window.BusinessFinance.withdraw();assert.equal(modal,undefined);c.IS_OWNER=true;c.window.BusinessFinance.withdraw();assert.match(modal.body,/https:\/\/app.square(up)?\.com\/dashboard\/balances/);assert.match(modal.body,/confirm the transfer in Square/);
});
