import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openLeadModal('),end=html.indexOf('/* ============================================================',start);
assert.ok(start>=0&&end>start);
const renderer=html.slice(start,end);
function fixture(extra={preferred_date:'2026-09-29',preferred_time:'2:00 PM - 4:00 PM'}){
  const fields={},saved=[],row={id:'qa-lead',name:'QA website lead',source:'Website',status:'new',app_data:extra};
  const c={window:{},STORE:{calls:[],leadPartners:[]},IS_OWNER:true,isMarketingManager:()=>false,getOne:()=>c.lead,docPhotosDraft:[],docPhotosDirty:false,
    esc:v=>String(v??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k])),labelize:v=>v,
    LEAD_SOURCES:['Website'],LEAD_STATUSES:['new'],buildCommunicationTimeline:()=>[],photoUploaderHtml:()=>'',handleDocPhotoInput(){},
    showModal:m=>{c.modal=m;for(const match of m.body.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*value="([^"]*)"/g))fields[match[1]]={value:match[2],addEventListener(){}};},
    document:{getElementById:id=>fields[id]??={value:id==='f_source'?'Website':id==='f_status'?'new':'',addEventListener(){}}},
    dbSet:async(col,id,data)=>saved.push({col,id,data}),dbAdd:async()=>assert.fail('existing lead must not be recreated'),toast(){},closeModal(){}};
  vm.createContext(c);vm.runInContext(html.match(/^function snakeToCamel.*$/m)[0]+'\n'+html.match(/^function fromDbRow.*$/m)[0]+'\n'+renderer,c);
  c.lead=c.fromDbRow(row);c.openLeadModal('qa-lead');return {c,fields,saved,row};
}
test('website intake date and time appear in the actual review form',()=>{
  const {fields}=fixture();assert.equal(fields.f_preferred.value,'2026-09-29');assert.equal(fields.f_preferred_time.value,'2:00 PM - 4:00 PM');
});
test('a saved CRM appointment takes priority over the original website request',()=>{
  const {fields}=fixture({preferred_date:'2026-09-29',preferred_appointment:'2026-10-01'});assert.equal(fields.f_preferred.value,'2026-10-01');
});
test('an explicitly cleared CRM appointment is not restored from the website source',()=>{
  for(const preferred_appointment of ['',null]){const {fields}=fixture({preferred_date:'2026-09-29',preferred_appointment});assert.equal(fields.f_preferred.value,'');}
});
test('missing and rejected website dates remain empty for office review',()=>{
  for(const data of [{},{preferred_date:null,preferred_date_input:'8250-02-26',date_needs_review:true}])assert.equal(fixture(data).fields.f_preferred.value,'');
});
test('editing unrelated lead information preserves the displayed website date',async()=>{
  const {c,fields,saved,row}=fixture();const original=JSON.stringify(row);fields.f_notes={value:'Office review note'};
  await c.modal.onSave();assert.equal(saved.length,1);assert.equal(saved[0].col,'leads');assert.equal(saved[0].id,'qa-lead');assert.equal(saved[0].data.preferredAppointment,'2026-09-29');assert.equal(saved[0].data.preferredTime,'2:00 PM - 4:00 PM');assert.equal(JSON.stringify(row),original);
});
test('an intentional date change or clear is passed to the existing save handler',async()=>{
  for(const date of ['2026-10-01','']){const {c,fields,saved}=fixture();fields.f_preferred.value=date;await c.modal.onSave();assert.equal(saved[0].data.preferredAppointment,date);}
});
test('external date content is escaped instead of becoming markup',()=>{
  const {c}=fixture({preferred_date:'"><script>unsafe</script>'});assert.ok(!c.modal.body.includes('<script>'));assert.match(c.modal.body,/&quot;&gt;&lt;script&gt;/);
});
