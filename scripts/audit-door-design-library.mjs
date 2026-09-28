import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),sandbox={window:{}};
vm.runInNewContext(readFileSync(new URL('door-design-data.js',root),'utf8'),sandbox);
const data=sandbox.window.DOOR_DESIGN_DATA;
let checked=0;
for(const [id,profile] of Object.entries(data.profiles)){
 const family=data.families[profile.family];assert.ok(family,id+' family');
 for(const panel of profile.panels)assert.ok(family.panels.some(p=>p.id===panel),id+' panel');
 assert.ok(profile.panels.length||profile.catalogPhoto||profile.awaitingVerifiedPhoto,id+' image');checked++;
}
for(const family of Object.values(data.families))for(const p of family.panels){
 assert.ok(p.variants.length,family.id+' variants');
 for(const v of p.variants){assert.ok(v.single||v.double);for(const k of ['single','double'])if(v[k])assert.ok(data.assets[v[k]],v[k]);}
}
for(const [id,a] of Object.entries(data.assets)){
 assert.ok(!a.external,'All image files must be bundled');
 assert.match(a.file,/^[\w.-]+$/);const file=new URL('assets/door-designs/'+a.file,root);assert.ok(existsSync(file),id);assert.ok(statSync(file).size>100,id+' empty image');
}
const products=Object.keys(data.profiles).map(id=>({id,name:id}));
const imageQueue=[];
const context={window:{DOOR_DESIGN_DATA:data},STORE:{products},getOne:(_,id)=>products.find(p=>p.id===id),esc:String,render(){},toast(m){throw Error(m)},route:{page:'visualizer'},visState:{doors:[],doorCount:1,applyToAll:false,step:3},setTimeout,clearTimeout,
 Image:class{set src(v){this.naturalWidth=400;this.naturalHeight=350;queueMicrotask(()=>this.onload());}},
 document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,c25hcA=='})}};
vm.runInNewContext(readFileSync(new URL('door-design-library.js',root),'utf8'),context);
const lib=context.window.DoorDesign;
for(const p of products)assert.ok(lib.defaultImage(p)||lib.profile(p).awaitingVerifiedPhoto,p.id+' verified image or explicit pending state');
const d={referenceProductId:'catalog_door_c_h_i_overhead_doors_2291_recessed_panel',width:8,height:7};context.visState.doors=[d];
assert.equal(lib.choice(d).panel.id,'flush');
await context.window.setVisDesignOption(0,'panel','long-panel');
assert.equal(d.referenceProductId,'catalog_door_c_h_i_overhead_doors_2294_recessed_panel');
await context.window.setVisDesignOption(0,'model','catalog_door_c_h_i_overhead_doors_2291_recessed_panel');
assert.equal(d.referenceProductId,'catalog_door_c_h_i_overhead_doors_2294_recessed_panel','incompatible model rejected');
const first={referenceProductId:'catalog_door_amarr_li1000_lincoln',width:8,height:7},second={referenceProductId:first.referenceProductId,width:16,height:7};
context.visState.doors=[first,second];context.visState.doorCount=2;context.visState.applyToAll=true;
await context.window.setVisDesignOption(0,'window','frost');
assert.equal(second.visualDesign.window,'frost');assert.equal(second.width,16,'individual opening size preserved');
assert.notEqual(lib.source(lib.choice(first)),lib.source(lib.choice(second)),'single/double source images differ');
assert.equal(first.designPreview.modelId,first.referenceProductId);
const invalid={referenceProductId:'missing-product'};assert.equal(lib.choice(invalid),null);
const withOwner=products.find(p=>p.id===first.referenceProductId);withOwner.visualizerOverlayUrl='https://example.org/owner.png';const ownerDoor={referenceProductId:withOwner.id,width:8,height:7};assert.equal(await lib.prepare(ownerDoor),null,'owner image preserved until a design option is chosen');
console.log(`Door design library: ${checked} profiles, all image references, compatible model switching, size-specific images, apply-all and owner overrides PASS`);
