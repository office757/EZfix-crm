import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8'),theme=fs.readFileSync('workspace-theme.js','utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const source=slice('function isOfficeRole()','function renderNav()')+slice('function technicianAllowedPage(','function technicianWorkspaceId(')+theme.slice(0,theme.indexOf('/* Shared presentation only.'));
function fixture(role,preview=false){
 const c=vm.createContext({CURRENT_TEAM_MEMBER:{role},IS_OWNER:role==='owner',isTechnicianView:()=>role==='technician'||preview,isMarketingManager:()=>role==='marketing_manager',marketingAllowedPage:p=>['dashboard','leads','customers','more'].includes(p)});
 vm.runInContext(source,c);return {section:page=>JSON.parse(JSON.stringify(c.workspacePageSection(page))),run:expr=>JSON.parse(JSON.stringify(vm.runInContext(expr,c)))};
}
let checks=0;function check(label,fn){fn();console.log('PASS '+label);checks++;}
check('Owner has related navigation across all sidebar workspaces',()=>{
 const f=fixture('owner');
 for(const key of f.run('sidebarNavItems().map(n=>n.key)').filter(k=>!['dashboard'].includes(k))){const s=f.section(key);assert.ok(s,key);assert.ok(s.items.some(n=>n.key===key),key);assert.equal(new Set(s.items.map(n=>n.key)).size,s.items.length);}
 assert.equal(f.section('receptionist').active,'receptionist');assert.equal(f.section('ai_system').active,'receptionist');
 assert.equal(f.section('calls').active,'receptionist');
 assert.equal(f.section('dashboard'),null);assert.equal(f.section('more'),null);
});
check('Technicians and owner technician preview cannot gain office, finance or team pages',()=>{
 for(const f of [fixture('technician'),fixture('owner',true)]){
  assert.deepEqual(f.section('invoices').items.map(n=>n.key),['quickpay','estimates','invoices']);
  assert.deepEqual(f.section('earnings').items.map(n=>n.key),['earnings']);
  assert.equal(f.section('office'),null);assert.equal(f.section('communications'),null);assert.equal(f.section('settings'),null);assert.equal(f.section('inventory'),null);
 }
});
check('Office account retains operational access without owner AI or settings',()=>{
 const f=fixture('office');assert.ok(f.section('office').items.some(n=>n.key==='followups'));for(const role of ['owner','office'])assert.deepEqual(fixture(role).section('office').items.map(n=>n.key),['office','customers','followups']);for(const role of ['owner','office'])assert.deepEqual(fixture(role).section('calendar').items.map(n=>n.key),['leads','jobs','calendar']);
 assert.ok(!f.section('office').items.some(n=>['ai_manager','receptionist','ai_system'].includes(n.key)));
 assert.equal(f.section('settings'),null);
 assert.ok(f.section('payroll').items.some(n=>n.key==='reports'));
});
check('Marketing accounts only see their allowed work pages',()=>{
 const f=fixture('marketing_manager');assert.deepEqual(f.section('leads').items.map(n=>n.key),['leads','customers']);assert.equal(f.section('invoices'),null);assert.equal(f.section('team'),null);
});
check('Related links connect marketing to existing project gallery',()=>{
 assert.deepEqual(fixture('owner').section('socialposts').related.map(n=>n.key),['gallery']);
});
console.log(`Workspace page navigation: ${checks}/${checks} PASS`);
