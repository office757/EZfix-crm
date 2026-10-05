import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
function fixture(role='owner'){
 const context=vm.createContext({CURRENT_TEAM_MEMBER:{role:role==='marketing'?'marketing_manager':role},IS_OWNER:role==='owner',isTechnicianView:()=>role==='technician',isMarketingManager:()=>role==='marketing',marketingAllowedPage:p=>['dashboard','leads','customers','more'].includes(p),route:{page:'jobs'},esc:s=>s});
 vm.runInContext(section('function isOfficeRole()','function renderNav()')+section('function technicianAllowedPage(', 'function technicianWorkspaceId(')+section('function dashboardModuleCategories()','function renderMoreScreen(')+section('function renderWorkNavigation()','function renderLeads('),context);
 return {context,run:s=>JSON.parse(JSON.stringify(vm.runInContext(s,context)))};
}
let n=0;function check(name,fn){fn();n++;console.log('PASS '+name);}
check('Owner sidebar stays open with nested Team and Banking tools',()=>{
 const f=fixture();assert.deepEqual(f.run('sidebarNavItems().map(n=>n.key)'),['quickpay','dashboard','receptionist','calendar','office','invoices','estimates','visualizer','gallery','products','banking','team','settings']);
 f.context.route.page='receptionist';assert.equal(f.run("isSidebarItemActive({key:'receptionist'})"),true);assert.equal(f.run("isSidebarItemActive({key:'ai_manager'})"),false);
 for(const page of ['jobs','leads']){f.context.route.page=page;assert.equal(f.run("isSidebarItemActive({key:'calendar'})"),true);}
 for(const page of ['payroll','reports']){f.context.route.page=page;assert.equal(f.run("isSidebarItemActive({key:'team'})"),true);}
 f.context.route.page='payments';assert.equal(f.run("isSidebarItemActive({key:'banking'})"),true);
 const nav={innerHTML:''};f.context.document={getElementById:()=>nav};f.context.window={};f.context.renderViewAsOptions=()=>{};
 vm.runInContext(section('function renderNav()', 'function openSidebar()'),f.context);f.context.renderNav();assert.doesNotMatch(nav.innerHTML,/<details|<summary/);
 for(const page of ['customers','followups']){f.context.route.page=page;assert.equal(f.run("isSidebarItemActive({key:'office'})"),true);}
});
check('Ashley owns business tool entry points without changing staff access',()=>{
 const ashley=section('function renderAiReceptionist(', 'function ashleyChannelIcon(');
 assert.ok(ashley.includes(`onclick="go('settings')"`));
 assert.ok(ashley.includes("receptionistState.subview='campaigns'"));
 assert.ok(readFileSync(new URL('../premium-workspace-hub.js',import.meta.url),'utf8').includes(`onclick="go('socialposts')"`));
 assert.ok(ashley.includes('Ashley Settings'));
 assert.ok(fixture('office').run('sidebarNavItems().map(n=>n.key)').includes('socialposts'));
 assert.equal(fixture('owner').run('sidebarNavItems().map(n=>n.key).at(-1)'), 'settings');assert.ok(!fixture('owner').run('sidebarNavItems().map(n=>n.key)').includes('socialposts'));for(const role of ['technician','marketing'])for(const key of ['socialposts','settings'])assert.ok(!fixture(role).run('sidebarNavItems().map(n=>n.key)').includes(key));
});
check('Both work tabs keep their existing routes and selected state',()=>{
 const f=fixture();assert.match(f.run('renderWorkNavigation()'),/onclick="go\('jobs'\)"/);assert.match(f.run('renderWorkNavigation()'),/onclick="go\('leads'\)"/);
 f.context.route.page='leads';assert.match(f.run('renderWorkNavigation()'),/aria-current="page" onclick="go\('leads'\)"/);
});
check('Owner launcher keeps gallery tools separate and removes warranties from the menu',()=>{
 const f=fixture(),groups=f.run('dashboardModuleCategories()');assert.equal(groups.length,5);
 const keys=groups.flatMap(g=>g.items.map(n=>n.key));
 for(const key of ['estimates','invoices','quickpay','gallery','visualizer','products','receptionist','ai_system','team'])assert.ok(keys.includes(key),key);
 for(const key of ['inventory','suppliers','ai_manager','communications','attention','expenses','followups','warranties','viscatalog','auditlog','checklist','walog','settings','socialposts','leads','reports','payroll','payments'])assert.ok(!keys.includes(key),key);
 assert.ok(groups.findIndex(g=>g.name==='Useful Tools')<groups.findIndex(g=>g.name==='Team & Payroll'));
 assert.deepEqual(groups.find(g=>g.name==='Useful Tools').items.map(n=>n.key),['products','gallery','visualizer']);
 assert.deepEqual(groups.find(g=>g.name==='Business Workspace').items.map(n=>n.key),['banking']);
 assert.ok(groups.find(g=>g.name==='Office & AI').items.some(n=>n.key==='office'));
 assert.ok(groups.find(g=>g.name==='Office & AI').items.some(n=>n.key==='receptionist'));
});
check('Technician launcher exposes own earnings and allowed document workflows',()=>{
 const f=fixture('technician');assert.deepEqual(f.run('dashboardModuleCategories().flatMap(g=>g.items.map(n=>n.key))').sort(),['earnings','estimates','invoices','quickpay']);
 assert.ok(f.run('sidebarNavItems().map(n=>n.key)').every(k=>!['settings','communications','ai_manager','payments','team'].includes(k)));
 assert.ok(f.run('sidebarNavItems().map(n=>n.key)').includes('customers'));
});
check('Marketing manager retains Leads without gaining Jobs or billing navigation',()=>{
 const f=fixture('marketing');assert.deepEqual(f.run('sidebarNavItems().map(n=>n.key)'),['dashboard','leads','customers']);
 assert.equal(f.run('renderWorkNavigation()'),'');assert.deepEqual(f.run('dashboardModuleCategories()'),[]);
});
check('Office gets billing, payroll and social without account settings',()=>{const f=fixture('office'),keys=f.run('dashboardModuleCategories().flatMap(g=>g.items.map(n=>n.key))');for(const key of ['socialposts','team','suppliers','products','invoices'])assert.ok(keys.includes(key));for(const key of ['payroll','reports'])assert.equal(f.run(`canAccessWorkspaceNav(NAV.find(n=>n.key==='${key}'))`),true);for(const key of ['ai_manager','receptionist','ai_system','settings','viscatalog'])assert.ok(!keys.includes(key));assert.ok(!f.run('sidebarNavItems().map(n=>n.key)').includes('settings'));});
check('Mobile bottom navigation preserves invoice, estimate and Quick Pay routes',()=>{
 const nav=source.slice(source.indexOf('<nav class="bottom-nav'),source.indexOf('</nav>',source.indexOf('<nav class="bottom-nav')));
 for(const key of ['invoices','estimates','quickpay'])assert.ok(nav.includes(`data-page="${key}" onclick="go('${key}')"`));
});
console.log(`Navigation groups audit: ${n}/${n} PASS`);
