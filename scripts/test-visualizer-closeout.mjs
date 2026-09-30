import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../visualizer-gallery-premium.js',import.meta.url),'utf8');
function harness(){
 const nodes=new Map(),events=new Map(),canvases=[],messages=[];
 const c={window:{addEventListener:(k,f)=>events.set('window:'+k,f),removeEventListener:k=>events.delete('window:'+k)},STORE:{products:[],savedDesigns:[],customers:[]},route:{page:'visualizer'},CURRENT_TEAM_MEMBER:{id:'owner'},IS_OWNER:true,ASSET_BUCKET:'crm-assets',visState:{doorCount:1,doors:[],activeDoor:0,houseImage:null},render:()=>{},toast:m=>messages.push(m),esc:v=>String(v??''),fmtDate:v=>v,localStorage:{getItem:()=>null},DOOR_STYLE_EXAMPLES:[['single-test','Small door','Reference']],URL:{createObjectURL:f=>'local:'+f.name,revokeObjectURL:()=>{}},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{addEventListener:(name,fn)=>nodes.get(id)[name]=fn});return nodes.get(id);},createElement:type=>{if(type!=='canvas')return {};const x={width:0,height:0,getContext:()=>({drawImage:()=>{},save:()=>{},restore:()=>{},translate:()=>{},rotate:()=>{}}),toDataURL:()=> 'data:image/jpeg;base64,test'};canvases.push(x);return x;},addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),querySelector:()=>null},freshDoorConfig:()=>({width:8,height:7,pos:{x:50,y:55,scale:1,rotation:0,opacity:1}}),resetVisualizer:()=>{},toggleVisApplyToAll:()=>{},getOne:(col,id)=>c.STORE[col]?.find(x=>x.id===id),uploadAsset:async f=>({id:f.name,url:'stored:'+f.name}),console};
 for(const match of source.matchAll(/^([\w$]+)\s*=\s*(?:async )?function/gm))if(!(match[1] in c))c[match[1]]=()=>{};
 c.window.DoorDesign={loadImage:async()=>({naturalWidth:8000,naturalHeight:6000}),prepare:async()=>{}};
 vm.createContext(c);vm.runInContext(source,c);c.visState.doors=[c.freshDoorConfig()];
 return {c,nodes,events,canvases,messages};
}
test('inactive reference models remain searchable, selectable and configurable',async()=>{
 const h=harness(),c=h.c;
 c.document.querySelectorAll=()=>[];
 c.visState.houseImage={url:'home.jpg'};
 c.STORE.products=[
  {id:'catalog_door_amarr_li1000_lincoln',name:'Amarr LI1000 - Lincoln',manufacturer:'Amarr',active:false,catalogKind:'garage_door_model'},
  {id:'unready',name:'Amarr reference only',manufacturer:'Amarr',active:false,catalogKind:'garage_door_model'},
  {id:'spring',name:'Amarr spring',manufacturer:'Amarr',active:false,catalogKind:'spring_size'}
 ];
 vm.runInContext(readFileSync(new URL('../door-design-data.js',import.meta.url),'utf8'),c);
 vm.runInContext(readFileSync(new URL('../door-design-library.js',import.meta.url),'utf8'),c);
 c.window.DoorDesign.prepare=async()=>{};
 c.window.__visCatalogState.search='Amarr';
 const body={innerHTML:''};c.window.renderVisStep3(body);
 assert.match(body.innerHTML,/1 matching models/);
 assert.match(body.innerHTML,/Amarr LI1000 - Lincoln/);
 assert.doesNotMatch(body.innerHTML,/data-product-id="unready"|data-product-id="spring"/);
 c.window.visCatalogReadyOnly(false);c.window.renderVisStep3(body);
 assert.match(body.innerHTML,/2 matching models/);
 await c.window.selectVisReferenceDoor(0,c.STORE.products[0].id);
 assert.equal(c.visState.doors[0].referenceProductId,c.STORE.products[0].id);
 assert.ok(c.window.DoorDesign.choice(c.visState.doors[0]));
 c.window.renderVisStep3(body);assert.match(body.innerHTML,/Window design/);
 assert.equal(c.STORE.products[0].active,false,'reference status remains isolated from sales');
});
test('saved designs recover missing doors and invalid positions without crashing',async()=>{
 const h=harness();h.c.STORE.savedDesigns=[{id:'broken',doorCount:4,houseImageUrl:'home.jpg',doors:[{pos:{x:1000,y:-4,scale:'bad'}}]}];
 await h.c.window.resumeSavedVisualizerDesign('broken');assert.equal(h.c.visState.doors.length,4);assert.equal(h.c.visState.doorCount,4);assert.equal(h.c.visState.doors[0].pos.x,100);assert.equal(h.c.visState.doors[0].pos.y,0);assert.equal(h.c.visState.doors[0].pos.scale,1);
});
test('late upload cannot overwrite a newer selected reference',async()=>{
 const h=harness();let complete;h.c.uploadAsset=()=>new Promise(r=>complete=r);h.c.renderVisStep2({innerHTML:''});
 const uploading=h.nodes.get('f_houseimg').change({target:{files:[{name:'old.jpg',type:'image/jpeg',size:100}]}});await new Promise(r=>setImmediate(r));
 await h.c.window.selectVisReferenceImage('single-test');complete({id:'old',url:'old.jpg'});await uploading;assert.equal(h.c.visState.houseImage.referenceId,'single-test');
});
test('uploaded homes spread multiple doors and corrupt photos never reach storage',async()=>{
 const h=harness();h.c.visState.doorCount=2;h.c.visState.doors=[h.c.freshDoorConfig(),h.c.freshDoorConfig()];h.c.renderVisStep2({innerHTML:''});
 await h.nodes.get('f_houseimg').change({target:{files:[{name:'home.jpg',type:'image/jpeg',size:100}]}});assert.deepEqual(Array.from(h.c.visState.doors,d=>d.pos.x),[25,75]);
 let uploads=0;h.c.uploadAsset=async()=>uploads++;h.c.window.DoorDesign.loadImage=async()=>{throw new Error('Bad image')};await h.nodes.get('f_houseimg').change({target:{files:[{name:'broken.jpg',type:'image/jpeg',size:100}]}});assert.equal(uploads,0);assert.equal(h.c.visState.houseImage.url,'stored:home.jpg');
});
test('preview export preserves detail up to 2048 pixels without distorting proportions',async()=>{
 const h=harness();h.c.visState.houseImage={url:'large.jpg'};await h.c.captureVisPreview();assert.equal(h.canvases[0].width,2048);assert.equal(h.canvases[0].height,1536);
 h.c.window.DoorDesign.loadImage=async()=>({naturalWidth:900,naturalHeight:1200});await h.c.captureVisPreview();assert.equal(h.canvases[1].width,900);assert.equal(h.canvases[1].height,1200,'small originals must not be artificially enlarged');
 h.c.window.DoorDesign.loadImage=async()=>({naturalWidth:6000,naturalHeight:8000});await h.c.captureVisPreview();assert.equal(h.canvases[2].width,1536);assert.equal(h.canvases[2].height,2048);
});
test('pointer cancellation releases drag listeners and ignores a second pointer',()=>{
 const h=harness(),overlay={style:{}};h.nodes.set('visStage',{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),querySelector:()=>overlay});h.c.startDoorDrag({pointerId:1,preventDefault:()=>{}},0);h.events.get('pointermove')({pointerId:2,clientX:90,clientY:90});assert.equal(h.c.visState.doors[0].pos.x,50);h.events.get('pointermove')({pointerId:1,clientX:90,clientY:90});assert.equal(h.c.visState.doors[0].pos.x,90);h.events.get('pointercancel')({pointerId:1});assert.equal(h.events.size,0);
});

test('real homes preserve one original photo and a separate fitted opening for each door',async()=>{
 const h=harness(),a=[{x:10,y:20},{x:40,y:20},{x:40,y:70},{x:10,y:70}],b=a.map(p=>({x:p.x+50,y:p.y}));
 h.c.visState.doorCount=2;h.c.visState.doors=[h.c.freshDoorConfig(),h.c.freshDoorConfig()];h.c.window.EZFIX_PHOTO_LIBRARY=[{id:'real',name:'Twin doors',url:'/assets/real.jpg',openings:2,corners:[a,b]}];
 await h.c.window.selectVisReferenceImage('real');assert.equal(h.c.visState.houseImage.url,'/assets/real.jpg');assert.equal(h.canvases.length,0);assert.equal(h.c.visState.doors[1].pos.corners[0].x,60);h.c.visState.doors[0].pos.corners[0].x=12;assert.equal(a[0].x,10);
});
test('wrong opening count never silently replaces the selected home',async()=>{
 const h=harness();h.c.visState.houseImage={url:'existing.jpg'};h.c.window.EZFIX_PHOTO_LIBRARY=[{id:'twin',name:'Twin',url:'twin.jpg',openings:2}];await h.c.window.selectVisReferenceImage('twin');assert.equal(h.c.visState.houseImage.url,'existing.jpg');assert.match(h.messages[0],/same number/);
});
