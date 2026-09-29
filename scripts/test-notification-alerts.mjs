import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const source=fs.readFileSync(new URL('../notification-alerts.js',import.meta.url),'utf8');
function setup({owner=true, rows=[], saved='[]', deny=false, error=false}={}) {
 const elements=[]; const writes=[]; const notices=[]; const storage=new Map([['ezfix-lead-alerts:owner',saved]]);
 const body={appendChild:e=>elements.push(e)};
 const c={IS_OWNER:owner,CURRENT_TEAM_MEMBER:{id:'owner'},isTechnicianView:()=>false,STORE:{leads:[],auditLog:rows},window:{},console:{error(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{activeElement:null,body,createElement:tag=>({tag,style:{},children:[],setAttribute(){},append(...x){this.children.push(...x)},addEventListener(type,fn){this[type]=fn},showModal(){this.open=true},close(){this.open=false},remove(){this.removed=true},focus(){}})},refreshCollection:async()=>{},requireSession:async()=>true,signOutCrm:async()=>{},markEventRead(){},markAllEventsRead(){},renderPreserveScroll(){},refreshNotifBadge(){},toast:m=>notices.push(m),SB:{from:()=>({update:patch=>({in:(_,ids)=>({select:async()=>{writes.push({patch,ids});if(error)return{error:Error('offline')};if(deny)return{data:[]};rows.forEach(r=>{if(ids.includes(r.id))r.read=patch.read});return{data:rows.filter(r=>ids.includes(r.id)).map(r=>({...r}))};}})})})}};
 vm.createContext(c);vm.runInContext(source,c);
 return {c,elements,writes,notices,storage,load:async leads=>{c.STORE.leads=leads;await c.refreshCollection('leads')},dialogs:()=>elements.filter(e=>e.tag==='dialog'&&!e.removed)};
}
test('initial history stays quiet; new owner lead requires explicit acknowledgement',async()=>{
 const x=setup();await x.load([{id:'old',name:'Old'}]);assert.equal(x.dialogs().length,0);
 await x.load([{id:'old'},{id:'new',name:'Julie',phone:'555'}]);const d=x.dialogs()[0];assert.equal(d.open,true);assert.equal(d.children[1].textContent,'Julie · 555');let prevented=false;d.cancel({preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(d.open,true);
 d.children[3].onclick();assert.equal(x.dialogs().length,0);assert.equal(x.writes.length,0);
 await x.load([{id:'old'},{id:'new',name:'Julie'}]);assert.equal(x.dialogs().length,0);
});
test('simultaneous leads queue without replacing the visible alert',async()=>{
 const x=setup();await x.load([]);await x.load([{id:'a',name:'A'},{id:'b',name:'B'}]);assert.equal(x.dialogs().length,1);assert.equal(x.dialogs()[0].children[1].textContent,'A');x.dialogs()[0].children[3].onclick();assert.equal(x.dialogs()[0].children[1].textContent,'B');
});
test('technician and owner technician-preview never receive owner modal',async()=>{
 for(const preview of [false,true]){const x=setup({owner:preview});x.c.isTechnicianView=()=>preview;await x.load([]);await x.load([{id:'new'}]);assert.equal(x.dialogs().length,0);}
});
test('pending acknowledgement survives refresh; personal data is not stored',async()=>{
 const x=setup();await x.load([]);await x.load([{id:'a',name:'Private name'}]);const saved=x.storage.get('ezfix-lead-alerts:owner');assert.equal(saved,'["a"]');const y=setup({saved});await y.load([{id:'a',name:'Private name'}]);assert.equal(y.dialogs().length,1);
});
test('bulk mark-read is batched, confirmed and refresh-safe',async()=>{
 const rows=Array.from({length:205},(_,i)=>({id:String(i),read:false}));const x=setup({rows});await x.c.markAllEventsRead();assert.equal(x.writes.length,3);assert.ok(rows.every(r=>r.read));assert.equal(x.notices.at(-1),'Notifications marked as read');await x.c.markAllEventsRead();assert.equal(x.writes.length,3);
});
test('silent zero-row denial and network failure never announce success',async()=>{
 for(const opts of [{deny:true},{error:true}]){const x=setup({...opts,rows:[{id:'a',read:false}]});await x.c.markAllEventsRead();assert.ok(x.notices.every(n=>n!=='Notifications marked as read'));assert.match(x.notices.at(-1),/Please retry/);}
});
test('individual unread and read operations are verified',async()=>{
 const x=setup({rows:[{id:'a',read:true}]});assert.equal(await x.c.markEventRead('a',false),true);assert.equal(x.c.STORE.auditLog[0].read,false);assert.equal(await x.c.markEventRead('a'),true);assert.equal(x.c.STORE.auditLog[0].read,true);
});
test('lead text is inserted as text, not markup',async()=>{
 const x=setup();await x.load([]);await x.load([{id:'x',name:'<img onerror=alert(1)>'}]);assert.equal(x.dialogs()[0].children[1].textContent,'<img onerror=alert(1)>');assert.equal(x.dialogs()[0].children[1].innerHTML,undefined);
});
