import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
function fixture(role='owner'){
 const context=vm.createContext({CURRENT_TEAM_MEMBER:{role:role==='marketing'?'marketing_manager':role},IS_OWNER:role==='owner',isTechnicianView:()=>role==='technician',isMarketingManager:()=>role==='marketing',marketingAllowedPage:p=>['dashboard','leads','customers','more'].includes(p),route:{page:'jobs'},esc:s=>s});
 vm.runInContext(section('function isOfficeRole()','function renderNav()')+section('function dashboardModuleCategories()','function renderMoreScreen(')+section('function renderWorkNavigation()','function renderLeads('),context);
 return {context,run:s=>JSON.parse(JSON.stringify(vm.runInContext(s,context)))};
}
let n=0;function check(name,fn){fn();n++;console.log('PASS '+name);}
check('Owner sidebar keeps one Jobs & Leads entry and removes duplicate document links',()=>{
 const f=fixture();assert.deepEqual(f.run('sidebarNavItems().map(n=>n.key)'),['dashboard','communications','jobs','customers','calendar','payments','settings','banking','socialposts','office']);
 f.context.route.page='leads';assert.equal(f.run("isSidebarItemActive({key:'jobs'})"),true);
});
check('Both work tabs keep their existing routes and selected state',()=>{
 const f=fixture();assert.match(f.run('renderWorkNavigation()'),/onclick="go\('jobs'\)"/);assert.match(f.run('renderWorkNavigation()'),/onclick="go\('leads'\)"/);
 f.context.route.page='leads';assert.match(f.run('renderWorkNavigation()'),/aria-current="page" onclick="go\('leads'\)"/);
});
check('Owner launcher keeps gallery tools separate and removes warranties from the menu',()=>{
 const f=fixture(),groups=f.run('dashboardModuleCategories()');assert.equal(groups.length,6);
 const keys=groups.flatMap(g=>g.items.map(n=>n.key));
 for(const key of ['estimates','invoices','quickpay','gallery','visualizer','products','inventory','suppliers','ai_manager','receptionist','ai_system','team','reports','payroll'])assert.ok(keys.includes(key),key);
 for(const key of ['attention','expenses','followups','warranties','viscatalog','auditlog','checklist','walog','settings','leads'])assert.ok(!keys.includes(key),key);
 assert.deepEqual(groups.find(g=>g.name==='Gallery & Visualizer').items.map(n=>n.key),['gallery','visualizer']);
 assert.deepEqual(groups.find(g=>g.name==='Business Workspace').items.map(n=>n.key),['banking','socialposts','office']);
});
check('Technician launcher exposes own earnings and allowed document workflows',()=>{
 const f=fixture('technician');assert.deepEqual(f.run('dashboardModuleCategories().flatMap(g=>g.items.map(n=>n.key))').sort(),['earnings','estimates','invoices','quickpay']);
 assert.ok(f.run('sidebarNavItems().map(n=>n.key)').every(k=>!['settings','communications','ai_manager','payments','team'].includes(k)));
});
check('Marketing manager retains Leads without gaining Jobs or billing navigation',()=>{
 const f=fixture('marketing');assert.deepEqual(f.run('sidebarNavItems().map(n=>n.key)'),['dashboard','leads','customers']);
 assert.equal(f.run('renderWorkNavigation()'),'');assert.deepEqual(f.run('dashboardModuleCategories()'),[]);
});
check('Office gets billing, payroll and social without account settings',()=>{const f=fixture('office'),keys=f.run('dashboardModuleCategories().flatMap(g=>g.items.map(n=>n.key))');for(const key of ['payroll','reports','socialposts','team','suppliers','products','invoices'])assert.ok(keys.includes(key));for(const key of ['ai_manager','receptionist','ai_system','settings','viscatalog'])assert.ok(!keys.includes(key));assert.ok(!f.run('sidebarNavItems().map(n=>n.key)').includes('settings'));});
check('Mobile bottom navigation preserves invoice, estimate and Quick Pay routes',()=>{
 const nav=source.slice(source.indexOf('<nav class="bottom-nav'),source.indexOf('</nav>',source.indexOf('<nav class="bottom-nav')));
 for(const key of ['invoices','estimates','quickpay'])assert.ok(nav.includes(`data-page="${key}" onclick="go('${key}')"`));
});
console.log(`Navigation groups audit: ${n}/${n} PASS`);
