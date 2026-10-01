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
test('new doors default to nine feet and home examples are exactly five single and five double',async()=>{
 const {c}=harness();assert.equal(Number(c.freshDoorConfig().width),9);assert.equal(Number(c.freshDoorConfig().customWidth),9);
 vm.runInContext(readFileSync(new URL('../door-design-library.js',import.meta.url),'utf8'),c);vm.runInContext(readFileSync(new URL('../photo-door-library.js',import.meta.url),'utf8'),c);
 const gallery=readFileSync(new URL('../door-gallery.js',import.meta.url),'utf8').match(/window\.EZFIX_PHOTO_LIBRARY=(\[[^\n]+\]);/)[1];c.window.EZFIX_PHOTO_LIBRARY=JSON.parse(gallery);c.window.DoorDesign.loadImage=async()=>({naturalWidth:1600,naturalHeight:1200});
 const body={innerHTML:''};c.renderVisStep2(body);const groups=body.innerHTML.split('<section class="studio-home-examples">').slice(1);assert.equal(groups.length,2);assert(groups.every(g=>(g.match(/data-reference="/g)||[]).length===5));assert.match(groups[0],/Single garage doors/);assert.match(groups[1],/Double garage doors/);assert.equal((body.innerHTML.match(/data-reference="/g)||[]).length,10);
 await c.window.selectVisReferenceImage('installation-017','16');assert.equal(Number(c.visState.doors[0].width),16);await c.window.selectVisReferenceImage('installation-007','9');assert.equal(Number(c.visState.doors[0].width),9);
 c.visState.doors[0].width=10;await c.window.selectVisReferenceImage('installation-017','16');assert.equal(Number(c.visState.doors[0].width),10,'a manually entered custom width is retained');
 const original=JSON.stringify(c.visState.doors[0].pos.corners);c.visState.doors[0].pos.corners[0].x+=2;c.window.resetVisPosition();assert.equal(JSON.stringify(c.visState.doors[0].pos.corners),original,'reset restores the actual fitted reference opening');
});
test('neutral photograph picker preserves existing saved catalog configurations',async()=>{
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
 vm.runInContext(readFileSync(new URL('../photo-door-library.js',import.meta.url),'utf8'),c);
 c.window.DoorDesign.prepare=async()=>{};
 c.window.__visCatalogState.search='Short';
 const body={innerHTML:''};c.window.renderVisStep3(body);
 assert.match(body.innerHTML,/3 design families · 50 real door references/);
 assert.match(body.innerHTML,/Square Short Panel/);
 assert.doesNotMatch(body.innerHTML,/aria-label="Manufacturer"|Amarr LI1000/);
 assert.doesNotMatch(body.innerHTML,/data-product-id="unready"|data-product-id="spring"/);
 c.window.visCatalogReadyOnly(false);c.window.renderVisStep3(body);
 assert.match(body.innerHTML,/3 design families · 50 real door references/);
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
 const h=harness(),overlay={style:{}};h.nodes.set('visStage',{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),querySelector:()=>overlay});h.c.startDoorDrag({pointerId:1,preventDefault:()=>{}},0);h.events.get('pointermove')({pointerId:2,clientX:90,clientY:90});assert.equal(h.c.visState.doors[0].pos.x,50);h.events.get('pointermove')({pointerId:1,clientX:90,clientY:90});assert.equal(h.c.visState.doors[0].pos.x,90);h.events.get('pointercancel')({pointerId:1});assert.equal(h.events.has('pointermove'),false);assert.equal(h.events.has('pointerup'),false);assert.equal(h.events.has('pointercancel'),false);assert.equal(h.events.has('window:blur'),false);assert.equal(h.events.has('keydown'),true,'the permanent undo shortcut remains available');
});

test('real homes preserve one original photo and a separate fitted opening for each door',async()=>{
 const h=harness(),a=[{x:10,y:20},{x:40,y:20},{x:40,y:70},{x:10,y:70}],b=a.map(p=>({x:p.x+50,y:p.y}));
 h.c.visState.doorCount=2;h.c.visState.doors=[h.c.freshDoorConfig(),h.c.freshDoorConfig()];h.c.window.EZFIX_PHOTO_LIBRARY=[{id:'real',name:'Twin doors',url:'/assets/real.jpg',openings:2,corners:[a,b]}];
 await h.c.window.selectVisReferenceImage('real');assert.equal(h.c.visState.houseImage.url,'/assets/real.jpg');assert.equal(h.canvases.length,0);assert.equal(h.c.visState.doors[1].pos.corners[0].x,60);h.c.visState.doors[0].pos.corners[0].x=12;assert.equal(a[0].x,10);
});
test('wrong opening count never silently replaces the selected home',async()=>{
 const h=harness();h.c.visState.houseImage={url:'existing.jpg'};h.c.window.EZFIX_PHOTO_LIBRARY=[{id:'twin',name:'Twin',url:'twin.jpg',openings:2}];await h.c.window.selectVisReferenceImage('twin');assert.equal(h.c.visState.houseImage.url,'existing.jpg');assert.match(h.messages[0],/same number/);
});
test('prepared chamfered homes preserve the real frame when a photographed door is repainted',async()=>{
 const h=harness(),c=h.c;vm.runInContext(readFileSync(new URL('../door-design-library.js',import.meta.url),'utf8'),c);vm.runInContext(readFileSync(new URL('../photo-door-library.js',import.meta.url),'utf8'),c);c.window.DoorDesign.loadImage=async()=>({naturalWidth:1600,naturalHeight:1200});c.window.EZFIX_PHOTO_LIBRARY=[{id:'installation-106',name:'Twin carriage doors',url:'/assets/installation-photos/installation-106.jpg',openings:2}];c.visState.doorCount=2;c.visState.doors=[c.freshDoorConfig(),c.freshDoorConfig()];await c.window.selectVisReferenceImage('installation-106');assert(c.visState.doors.every(d=>d.realism.cut===.12));assert(c.visState.doors.every(d=>c.window.DoorRealism.valid(d.pos.corners)));
});
test('undo and redo restore a full edit, coalesce sliders and discard stale redo',async()=>{
 const h=harness(),c=h.c;c.visState.houseImage={url:'home.jpg'};c.visState.doors[0].designPreview={key:'old',url:'large-cache'};
 c.window.setVisRealism(0,'light',.75);c.window.setVisRealism(0,'light',.8);await c.window.undoVisEdit();assert.equal(c.visState.doors[0].realism,undefined);assert.equal(c.visState.doors[0].designPreview,undefined);
 await c.window.redoVisEdit();assert.equal(c.visState.doors[0].realism.light,.8);await c.window.undoVisEdit();c.window.setVisRealism(0,'depth',.6);await c.window.redoVisEdit();assert.equal(c.visState.doors[0].realism.light,undefined);assert.equal(c.visState.doors[0].realism.depth,.6);
});
test('undo history belongs to its home and cannot restore a previous customer photo',async()=>{
 const h=harness(),c=h.c;c.visState.houseImage={url:'first.jpg'};c.window.setVisFit(0,'widthPct',60);c.visState.houseImage={url:'second.jpg'};await c.window.undoVisEdit();assert.equal(c.visState.doors[0].pos.widthPct,60);
 c.window.setVisFit(0,'heightPct',50);c.visState={...c.visState,doors:[c.freshDoorConfig()]};await c.window.undoVisEdit();assert.equal(c.visState.doors[0].pos.heightPct,undefined);
});
test('foreground strokes use photo coordinates at zoom and undo restores the door',async()=>{
 const h=harness(),c=h.c;c.visState.houseImage={url:'home.jpg'};h.nodes.set('visStage',{style:{},getBoundingClientRect:()=>({left:40,top:20,width:400,height:200})});c.window.toggleVisForeground();
 c.window.startVisForegroundStroke({pointerId:3,clientX:140,clientY:70,preventDefault(){},stopPropagation(){}},0);h.events.get('pointermove')({pointerId:4,clientX:340,clientY:170});h.events.get('pointermove')({pointerId:3,clientX:340,clientY:170});h.events.get('pointercancel')({pointerId:3,clientX:340,clientY:170});
 assert.deepEqual(JSON.parse(JSON.stringify(c.visState.doors[0].foreground[0].points)),[{x:25,y:25},{x:75,y:75}]);assert.equal(h.events.has('pointermove'),false);await c.window.undoVisEdit();assert.equal(c.visState.doors[0].foreground,undefined);await c.window.redoVisEdit();assert.equal(c.visState.doors[0].foreground[0].points.length,2);
});
test('saving captures one immutable image and specification and omits derived preview caches',async()=>{
 const h=harness(),c=h.c;let modal,complete,record,requested;c.showModal=m=>modal=m;c.closeModal=()=>{};c.customerPickerHtml=()=>'';c.dbAdd=async(col,r)=>{record=r;return 'saved'};h.nodes.set('f_customer',{value:'customer'});h.nodes.set('f_visdesignname',{value:'Front door'});
 c.visState.houseImage={url:'home-a.jpg'};c.visState.doors[0].width=16;c.visState.doors[0].foreground=[{radius:1,points:[{x:30,y:40}]}];c.visState.doors[0].designPreview={url:'derived-megabytes',key:'old'};c.captureVisPreview=options=>{requested=options.snapshot;return new Promise(r=>complete=r)};
 c.window.openSaveDesignModal();const saving=modal.onSave();c.visState.houseImage.url='home-b.jpg';c.visState.doors[0].width=8;c.visState.doors[0].foreground[0].points[0].x=90;complete('image-of-home-a');await saving;
 assert.equal(requested.houseImage.url,'home-a.jpg');assert.equal(record.houseImageUrl,'home-a.jpg');assert.equal(record.doors[0].width,16);assert.equal(record.doors[0].foreground[0].points[0].x,30);assert.equal(record.doors[0].designPreview,undefined);assert.equal(record.previewImageUrl,'image-of-home-a');assert.equal(c.visState.savedDesignId,'saved');
});
test('lossless export supports source resolution up to 4K and never uses later edits',async()=>{
 const h=harness(),c=h.c;const requested=[];c.visState.houseImage={url:'original.jpg'};const snapshot=c.window.VisualizerEdits.snapshot();c.visState.houseImage.url='later.jpg';c.window.DoorDesign.loadImage=async url=>{requested.push(url);return {naturalWidth:6000,naturalHeight:4000}};
 await c.captureVisPreview({snapshot,maxEdge:4096,format:'png'});assert.equal(requested[0],'original.jpg');assert.equal(h.canvases[0].width,4096);assert.equal(h.canvases[0].height,2731);
});
test('comparison movement is bounded and the undo shortcut does not hijack form editing',()=>{
 const h=harness(),c=h.c;h.nodes.set('visCompareAfter',{style:{}});h.nodes.set('visCompareLine',{style:{}});c.window.setVisComparison(150);assert.equal(h.nodes.get('visCompareLine').style.left,'100%');c.window.setVisComparison(-10);assert.equal(h.nodes.get('visCompareAfter').style.clipPath,'inset(0 0 0 0%)');
 c.visState.step=3;let prevented=0;h.events.get('keydown')({ctrlKey:true,key:'z',target:{tagName:'INPUT'},preventDefault:()=>prevented++});assert.equal(prevented,0);
});
test('foreground belongs to its photo and is cleared when another photo is selected',async()=>{
 const h=harness(),c=h.c;c.visState.houseImage={url:'old.jpg'};c.visState.doors[0].foreground=[{radius:1,points:[{x:30,y:40}]}];await c.window.selectVisReferenceImage('single-test');assert.equal(c.visState.doors[0].foreground,undefined);
 c.visState.doors[0].foreground=[{radius:1,points:[{x:30,y:40}]}];c.renderVisStep2({innerHTML:''});await h.nodes.get('f_houseimg').change({target:{files:[{name:'new.jpg',type:'image/jpeg',size:100}]}});assert.equal(c.visState.doors[0].foreground,undefined);
});
test('apply-to-all prepares every finish immediately and preserves independent opening fits',async()=>{
 const h=harness(),c=h.c;const id='model';c.STORE.products=[{id}];c.visState.houseImage={url:'twin.jpg'};c.visState.doorCount=2;c.visState.doors=[{...c.freshDoorConfig(),referenceProductId:id,visualDesign:{finish:'black'},visualDesignOverride:true},{...c.freshDoorConfig(),pos:{...c.freshDoorConfig().pos,x:75}}];let prepared=0;c.window.DoorDesign.normalize=()=>{};c.window.DoorDesign.prepare=async d=>{prepared++;d.designPreview={key:'black',url:'prepared-black'}};
 await c.window.toggleVisApplyToAll(true);assert.equal(prepared,2);assert.equal(c.visState.doors[1].visualDesign.finish,'black');assert.equal(c.visState.doors[1].designPreview.url,'prepared-black');assert.equal(c.visState.doors[1].pos.x,75);await c.window.undoVisEdit();assert.equal(c.visState.doors[1].referenceProductId,'');assert.equal(c.visState.applyToAll,false);
});
