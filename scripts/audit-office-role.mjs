import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
const html=fs.readFileSync('index.html','utf8');
const helpers=html.slice(html.indexOf('function isOfficeRole()'),html.indexOf('const NAV = ['));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const elements={},writes=[],scripts=[];
const c={window:{},CURRENT_TEAM_MEMBER:{id:'office',name:'Secretary',role:'office'},IS_OWNER:false,isTechnicianView:()=>c.CURRENT_TEAM_MEMBER.role==='technician',esc,STORE:{tasks:[],leadOffers:[],galleryProjects:[],socialPosts:[]},getOne:(col,id)=>(c.STORE[col]||[]).find(x=>x.id===id),showModal:m=>c.modal=m,closeModal(){},toast:m=>c.notice=m,render(){},dbAdd:async(...args)=>writes.push(args),dbSet:async(...args)=>writes.push(args),document:{createElement:()=>({}),body:{append:script=>scripts.push(script)},querySelector:()=>null,getElementById:id=>elements[id]??={value:''},querySelectorAll:s=>s==='.social-platform:checked'?[{value:'instagram'}]:[]},safeDoorImageUrl:v=>v,fmtDate:v=>v};
vm.createContext(c);vm.runInContext(helpers+fs.readFileSync('office-workspace.js','utf8'),c);
assert.equal(scripts[0]?.src,'/whatsapp-linked-device.js');
const office=c.window.OfficeWorkspace,content={innerHTML:''},actions={innerHTML:''};
office.renderOffice(content,actions);for(const key of ['communications','calls','calendar','inventory','suppliers','products','team','payroll','gallery','payments','estimates','invoices','socialposts'])assert.ok(content.innerHTML.includes(`data-workspace-link="${key}"`),key);
assert.ok(!actions.innerHTML.includes('addUser'));
office.post();c.document.getElementById('social_title').value='New installation';c.document.getElementById('social_caption').value='Project update';c.document.getElementById('social_status').value='draft';await c.modal.onSave();assert.equal(writes[0][0],'socialPosts');assert.equal(writes[0][1].platforms[0],'instagram');
writes.length=0;c.document.getElementById('social_status').value='posted_manual';await c.modal.onSave();assert.equal(writes.length,0);assert.match(c.notice,/published post link/);
c.STORE.socialPosts=[{id:'post',title:'<script>bad</script>',caption:'Test <unsafe>',status:'ready',platforms:['instagram'],photos:[]}];office.renderSocial(content,actions);assert.ok(content.innerHTML.includes('&lt;script&gt;'));assert.ok(!content.innerHTML.includes('<script>'));assert.ok(content.innerHTML.includes('Account connection pending'));
c.CURRENT_TEAM_MEMBER.role='technician';c.emptyState=()=>'Denied';office.renderSocial(content,actions);assert.equal(content.innerHTML,'Denied');

// Execute the production email authorization handler with an isolated provider stub.
// No network or real email is used.
const emailJs=stripTypeScriptTypes(fs.readFileSync('supabase/functions/send-crm-email/index.ts','utf8').replace(/^import .*\n/gm,''));
async function emailRequest(role,body={to:'qa@example.invalid',subject:'QA',text:'Synthetic test'}){
 let handler,submitted=0;
 const query=table=>{const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>({data:table==='team'?role?{id:'member',role,status:'active'}:null:null}),insert:async()=>({error:null})};return q;};
 const db={from:query,auth:{getUser:async()=>({data:{user:{id:'user'}}})}};
 const env={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',RESEND_API_KEY:'fake'};
 const context={Response,Request,TextEncoder,crypto:globalThis.crypto,console,Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},createClient:()=>db,fetch:async()=>{submitted++;return Response.json({id:'synthetic-provider-id'});}};
 vm.runInNewContext(emailJs,context);
 const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,submitted};
}
assert.deepEqual(await emailRequest('office'),{status:200,submitted:1});
assert.deepEqual(await emailRequest('owner'),{status:200,submitted:1});
assert.deepEqual(await emailRequest('marketing_manager'),{status:403,submitted:0});
assert.deepEqual(await emailRequest('technician'),{status:403,submitted:0});
assert.deepEqual(await emailRequest(null),{status:403,submitted:0});
assert.deepEqual(await emailRequest('office',{to:'qa@example.invalid',subject:'QA',text:'QA',approval_id:'unapproved'}),{status:403,submitted:0});
// Exercise the SMS authorization block without contacting a carrier.
const sms=fs.readFileSync('supabase/functions/send-inkbox-sms/index.ts','utf8'),start=sms.indexOf('  const role = String(member.role'),end=sms.indexOf('\n  if (receiptInvoiceId)',start);
const gate=vm.runInNewContext('(async function(member){const approvalId="",entityType="",entityId="",to="+12025550148";const resolveParty=async()=>({ambiguous:true});const admin={};const json=(data,status)=>status;'+sms.slice(start,end)+';return 200;})');
for(const [role,status] of [['owner',200],['office',200],['marketing_manager',403],['technician',403],['dispatcher',403]])assert.equal(await gate({role}),status);
console.log('Office role: workspace routes, social persistence, escaped content, email handler and SMS authorization PASS');
