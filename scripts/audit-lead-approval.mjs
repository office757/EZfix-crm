import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {modalDocument,modalSource} from './modal-test-fixture.mjs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const dispatch=readFileSync(new URL('../lead-dispatch.js',import.meta.url),'utf8');
function fixture({lead:overrides={},rpcError,apiError,apiData,saveError,refreshError,waitForApi,role='owner'}={}){
  const dom=modalDocument(),fields={},calls=[],messages=[];
  const lead={id:'test-lead',name:'Synthetic customer',phone:'+15085550123',address:'12 Example St, Example MA 01770',zip:'',...overrides};
  const originalGet=dom.document.getElementById;
  dom.document.getElementById=id=>fields[id]||originalGet(id);
  Object.assign(dom.document,{hidden:false,querySelector:()=>null,head:{append(){}},body:{...dom.document.body,append(){}}});
  const c={...dom,console,window:{addEventListener(){}},setInterval(){},CURRENT_TEAM_MEMBER:{id:'office-test',role},IS_OWNER:role==='owner',VIEW_AS:'',
    STORE:{team:[{id:'tech-test',name:'Test technician',role:'Technician',status:'Active',authUserId:'test-user'}],leadOffers:[],leads:[lead]},
    route:{page:'leads',id:null},dbReady:true,isTechnicianView:()=>role==='technician',isMarketingManager:()=>false,getOne:()=>lead,
    esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),
    render(){},renderDashboard(){},renderJobDetail(){},renderLeads(){},createInvoiceFromJob(){},
    toast:(message,error)=>messages.push({message,error:!!error}),
    dbSet:async(col,id,data)=>{calls.push({kind:'save',col,id,data});if(saveError)throw saveError;Object.assign(lead,data);},
    refreshCollection:async col=>{calls.push({kind:'refresh',col});if(refreshError)throw refreshError;},
    SB:{rpc:async(name,body)=>{calls.push({kind:'rpc',name,body});return {data:{job_id:'test-job'},error:rpcError};},
      functions:{invoke:async(name,{body})=>{calls.push({kind:'api',name,body});if(waitForApi)await waitForApi;return {data:apiData===undefined?{ok:!apiError,offer_id:'test-offer',notification:{sms:{status:'delivered'}}}:apiData,error:apiError};}}}};
  vm.createContext(c);vm.runInContext(modalSource(html),c);
  const show=c.showModal;
  c.showModal=options=>{c.modal=options;show(options);for(const match of options.body.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g))fields[match[1]]={value:match[2]};fields.dispatch_tech={value:'tech-test'};};
  vm.runInContext(dispatch,c);c.render=()=>calls.push({kind:'render'});c.window.Dispatch.offer(lead.id);
  return {c,lead,fields,calls,messages,button:()=>originalGet('modalSaveBtn'),save:()=>originalGet('modalSaveBtn').onclick()};
}
test('approval errors are handled by the dialog and preserve their useful reason',async()=>{
  const h=fixture({lead:{zip:'01770'},rpcError:{message:'Reopen the lead before approving'}});
  await assert.doesNotReject(h.save());assert.equal(h.messages.at(-1).message,'Reopen the lead before approving');
  assert.equal(h.button().disabled,false);assert.equal(h.button().textContent,'Approve & send offer');assert.ok(!h.calls.some(c=>c.kind==='api'));
});
test('an address ZIP is offered for confirmation with its leading zero intact',()=>{
  for(const address of ['12 Example St, Example ma 01770','12 Example St, Example MA 01770-1234']){
    const h=fixture({lead:{address}});assert.equal(h.fields.dispatch_zip.value,address.split(' ').at(-1));assert.match(h.c.modal.body,/Confirm/);
  }
});
test('a separately saved ZIP takes priority over the address text',()=>{
  const h=fixture({lead:{zip:' 01757 '}});assert.equal(h.fields.dispatch_zip.value,'01757');
});
test('street numbers and ambiguous address text never become a guessed ZIP',()=>{
  for(const address of ['01770 Example Street','12 Example St, Example MA','12 Example St 01770','12 Example St, XX 01770','12 Example St, MA 01770 extra']){
    assert.equal(fixture({lead:{address}}).fields.dispatch_zip.value,'');
  }
});
test('missing or invalid ZIP blocks all writes with an actionable error',async()=>{
  for(const zip of ['', '1770','01770<script>','01770-123']){
    const h=fixture();h.fields.dispatch_zip.value=zip;await h.save();assert.equal(h.calls.length,0);assert.match(h.messages.at(-1).message,/ZIP/);assert.ok(h.button());
  }
});
test('missing customer details block dispatch before changing the lead',async()=>{
  for(const lead of [{name:''},{name:'New referral from Partner'},{phone:''},{address:''}]){
    const h=fixture({lead:{zip:'01770',...lead}});await h.save();assert.equal(h.calls.length,0);assert.match(h.messages.at(-1).message,/Review/);
  }
});
test('only the confirmed ZIP is saved before approval and offer creation',async()=>{
  const h=fixture();await h.save();assert.deepEqual(h.calls.slice(0,3).map(c=>c.kind),['save','rpc','api']);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])),{kind:'save',col:'leads',id:'test-lead',data:{zip:'01770'}});
  assert.equal(h.calls[1].name,'approve_lead_for_dispatch');assert.equal(h.calls[2].body.technician_id,'tech-test');assert.equal(h.button(),null);
});
test('an already saved ZIP requires no extra record update',async()=>{
  const h=fixture({lead:{zip:'01770'}});await h.save();assert.ok(!h.calls.some(c=>c.kind==='save'));assert.equal(h.calls.filter(c=>c.kind==='api').length,1);
});
test('a failed ZIP save cannot approve the lead or send an offer',async()=>{
  const h=fixture({saveError:Error('Could not save ZIP')});await h.save();assert.deepEqual(h.calls.map(c=>c.kind),['save']);assert.match(h.messages.at(-1).message,/save ZIP/);
});
test('technician selection is required before writes',async()=>{
  const h=fixture();h.fields.dispatch_tech.value='';await h.save();assert.equal(h.calls.length,0);assert.match(h.messages.at(-1).message,/Choose a technician/);
});
test('the Edge Function response body supplies the conflict reason',async()=>{
  const h=fixture({lead:{zip:'01770'},apiData:null,apiError:{message:'Edge Function returned a non-2xx status code',context:new Response(JSON.stringify({error:'Technician is already booked for this time window'}),{status:409})}});
  await h.save();assert.equal(h.messages.at(-1).message,'Technician is already booked for this time window');assert.ok(h.button());
});
test('network and unreadable response errors still remain handled',async()=>{
  for(const apiError of [{message:'Network unavailable'},{message:'Gateway unavailable',context:new Response('unavailable',{status:502})}]){
    const h=fixture({lead:{zip:'01770'},apiData:null,apiError});await h.save();assert.equal(h.messages.at(-1).message,apiError.message);assert.equal(h.button().disabled,false);
  }
});
test('refresh failure after creation cannot leave a send button that resubmits the offer',async()=>{
  const h=fixture({lead:{zip:'01770'},refreshError:Error('offline')});await h.save();assert.equal(h.button(),null);
  assert.equal(h.calls.filter(c=>c.kind==='api').length,1);assert.ok(h.messages.some(m=>/Offer created/.test(m.message)));assert.ok(h.messages.some(m=>/refresh/i.test(m.message)));
});
test('double taps while sending create exactly one offer',async()=>{
  let finish;const waitForApi=new Promise(resolve=>{finish=resolve;});const h=fixture({lead:{zip:'01770'},waitForApi});
  const pending=h.save();await h.save();finish();await pending;assert.equal(h.calls.filter(c=>c.kind==='api').length,1);
});
test('technician accounts cannot open office approval controls',()=>{
  const h=fixture({role:'technician'});assert.equal(h.button(),null);assert.equal(h.calls.length,0);
});
