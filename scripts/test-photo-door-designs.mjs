import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const premium=read('visualizer-gallery-premium.js');
const renderer=premium.slice(0,premium.indexOf('\n(() => {',premium.indexOf('})();')));
function canvas(){
 let pixels=new Uint8ClampedArray();const cv={width:1,height:1};
 const ctx={
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  drawImage(img,...args){const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,raw=img.data||img.getContext('2d').getImageData(0,0,iw,ih).data;const [left,top,sw,sh]=args.length===8?args:[0,0,iw,ih];pixels=new Uint8ClampedArray(cv.width*cv.height*4);for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const sx=Math.min(iw-1,Math.floor(left+x*sw/cv.width)),sy=Math.min(ih-1,Math.floor(top+y*sh/cv.height));pixels.set(raw.slice((sy*iw+sx)*4,(sy*iw+sx)*4+4),(y*cv.width+x)*4);}},
  getImageData:()=>({data:pixels.slice()}),putImageData:f=>{pixels=f.data.slice();},
  createLinearGradient:()=>({addColorStop(){}}),fillRect(){}
 };
 cv.getContext=()=>ctx;cv.toDataURL=()=> 'data:image/png;base64,'+Buffer.from(pixels).toString('base64');return cv;
}
function picture(w=96,h=96,pixel=()=>[220,220,220,255]){
 const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(pixel(x,y),(y*w+x)*4);return {naturalWidth:w,naturalHeight:h,data};
}
function harness(){
 const c={window:{},document:{createElement:canvas},STORE:{products:[]},getOne:()=>null,esc:v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),route:{page:'visualizer'},visState:{doors:[],doorCount:1,activeDoor:0},render(){},toast(){}};
 vm.createContext(c);vm.runInContext(renderer,c);vm.runInContext(read('door-design-library.js'),c);vm.runInContext(read('photo-door-library.js'),c);c.window.DoorDesign.loadImage=async()=>picture();return {c,P:c.window.PhotoDoor,R:c.window.DoorRealism,D:c.window.DoorDesign};
}
const door=(family='square-short',id='photo-101-0',finish='original',width=8)=>({photoDesignId:family,width,height:7,visualDesign:{sourceId:id,finish},pos:{x:50,y:50,opacity:1}});

test('50 unique real sources have valid crops and neutral, manufacturer-free identity',()=>{
 const {P,R}=harness();assert.equal(P.sources.length,50);assert.equal(P.families.length,8);assert.equal(new Set(P.sources.map(s=>s.id)).size,50);
 for(const s of P.sources){assert(R.valid(s.corners),s.id);assert(P.families.some(f=>f.id===s.family));assert(P.layouts[s.layout]);assert(Number.isInteger(s.columns)&&s.columns>0);assert(Number.isInteger(s.sections)&&s.sections>0);assert(s.url.startsWith('/assets/installation-photos/'));const path=new URL('..'+s.url,import.meta.url);assert(existsSync(path));assert.equal(readFileSync(path).readUInt16BE(0),0xffd8);assert(!s.manufacturer&&!s.modelId&&!s.sku&&!s.aiGenerated);}
 assert.doesNotMatch(JSON.stringify(P.families),/Amarr|Clopay|Lincoln|manufacturer/i);
});
test('native product geometry uses four rows and real glass on the supplied long-panel photo',()=>{
 const {P}=harness(),c=P.choice(door('square-long','photo-017-0','original',16));assert.equal(c.source.columns,4);assert.equal(c.source.sections,4);assert.equal(c.source.layout,'clear');assert.equal(c.source.repeat,1);assert.equal(c.variant.source.id,'photo-017-0');
 assert.equal(P.sources.find(s=>s.id==='photo-078-0').sections,6);
 assert.equal(P.sources.find(s=>s.id==='photo-106-0').layout,'eight-lite');
});
test('second-section glazing stays in its real section and retains its pixels when painted',()=>{
 const {P}=harness(),d=door('square-short','photo-090-0','black'),c=P.choice(d),img=picture(100,100,(x,y)=>y>28&&y<43&&x>5&&x<24?[210,225,235,255]:[30,75,140,255]),panes=P.paneRegions(c.source,img.data,100,100),i=(35*100+15)*4,before=Array.from(img.data.slice(i,i+4));assert(panes.every(p=>p.y>=.25));P.paint(img.data,100,100,c,panes);assert.deepEqual(Array.from(img.data.slice(i,i+4)),before);
});
test('single and double doors reflow whole photographed panels rather than stretching their count',()=>{
 const {P,R}=harness(),single=P.sources.find(s=>s.id==='photo-101-0'),double=P.sources.find(s=>s.id==='photo-023-0');
 const wide=P.adaptSource(single,16);assert.equal(wide.columns,8);assert.equal(wide.repeat,2);assert.equal(wide.sections,4);
 const narrow=P.adaptSource(double,8);assert.equal(narrow.columns,4);assert.equal(narrow.repeat,1);const halfway=R.project(double.corners,.5,0);assert.equal(narrow.corners[1].x,halfway.x);assert.equal(narrow.corners[1].y,halfway.y);
 const long=P.choice(door('square-long','photo-140-0','original',16));assert.equal(long.source.columns,4);assert.equal(long.source.sections,4);
});
test('vertical windows keep their physical width when a flush door is widened',()=>{
 const {P}=harness(),img=picture(),s=P.adaptSource(P.sources.find(s=>s.id==='photo-099-0'),16);assert.equal(s.repeat,1);assert.equal(s.bodyScale,2);
 const panes=P.paneRegions(s,img.data,96,96);assert.equal(panes.length,4);assert.equal(panes[0].width,.155/2);assert.equal(panes[0].x,1-.23/2);assert.equal(panes[0].height,.155);
});
test('unknown saved selections and corrupt dimensions fall back to a usable real design',()=>{
 const {P}=harness(),d=door();d.width='not-a-number';d.height=Infinity;d.visualDesign={sourceId:'unknown',finish:'neon'};const c=P.normalize(d);assert.equal(c.width,9);assert.equal(c.height,7);assert.equal(c.finish,'original');assert.equal(d.visualDesign.type,'photographic');assert(P.sources.some(s=>s.id===d.visualDesign.sourceId));assert.equal(P.choice({photoDesignId:'invented'}),null);
 const wood=P.choice(door('wood-carriage','photo-086-0','black',16));assert.equal(wood.finish,'original');assert.equal(wood.colors.length,1);
});
test('preparation returns a door-only lossless overlay and never displays the whole source home',async()=>{
 const {P,D}=harness(),d=door();assert.equal(D.overlay(d),'');assert(!d.designPreview);const p=await P.prepare(d);assert(p.url.startsWith('data:image/png'));assert.equal(D.overlay(d),p.url);assert.equal(p.sourcePhotoUrl,'/assets/installation-photos/installation-101.jpg');assert.equal(p.nativeGeometry,true);assert.equal(p.columns,4);assert.equal(p.sections,4);
 const widened=door('square-short','photo-101-0','original',16);assert.equal((await P.prepare(widened)).nativeGeometry,false);
});
test('narrowing a double door preserves its native vertical resolution',async()=>{
 const {P,D}=harness();D.loadImage=async()=>picture(400,700);const d=door('square-short','photo-015-0','original',9),s=P.choice(d).source,q=s.corners.map(p=>({x:p.x*4,y:p.y*7}));
 const preview=await P.prepare(d),height=Math.max(Math.hypot(q[3].x-q[0].x,q[3].y-q[0].y),Math.hypot(q[2].x-q[1].x,q[2].y-q[1].y));
 assert(Math.abs(preview.nativeHeight-height)<1);assert(preview.nativeHeight>preview.nativeWidth*2);assert(P.surface(preview));assert(!JSON.stringify(preview).includes('painting'));
});
test('dark paint retains photographic satin highlights without painting glass or hardware',()=>{
 const {P}=harness(),w=80,h=80,d=door('carriage-short','photo-057-0','black'),c=P.choice(d),rgba=picture(w,h,(x,y)=>x<16&&y<16?[45,65,90,255]:x===40&&y===40?[22,22,22,255]:y===60?[244,244,244,255]:y===61?[160,160,160,255]:[220,220,220,255]).data,panes=[{x:0,y:0,width:.2,height:.2}],field={width:1,height:1,data:[1],base:220},profile=P.paintProfile(rgba,w,h,c,panes,field),at=(x,y)=>(y*w+x)*4;
 P.paint(rgba,w,h,c,panes,profile);assert(rgba[at(60,60)]>rgba[at(60,50)]+12);assert(rgba[at(60,61)]<rgba[at(60,50)]);assert.deepEqual(Array.from(rgba.slice(at(8,8),at(8,8)+4)),[45,65,90,255]);assert.deepEqual(Array.from(rgba.slice(at(40,40),at(40,40)+4)),[22,22,22,255]);
});
test('light paint on a dark photograph retains relief without amplifying satin grain',()=>{
 const {P}=harness(),w=80,h=80,d=door('carriage-vertical','photo-106-0','white',9),c=P.choice(d),panes=[{x:0,y:0,width:.2,height:.2}],rgba=picture(w,h,(x,y)=>x<16&&y<16?[18,45,90,255]:x===40&&y===40?[2,2,2,255]:y===60?[48,48,48,255]:y===61?[12,12,12,255]:[36,36,36,255]).data,field={width:1,height:1,data:[1],base:36},profile=P.paintProfile(rgba,w,h,c,panes,field),at=(x,y)=>(y*w+x)*4;
 P.paint(rgba,w,h,c,panes,profile);const body=rgba[at(60,50)],highlight=rgba[at(60,60)],recess=rgba[at(60,61)];assert(body>225);assert(highlight>body&&highlight-body<=20);assert(recess<body&&body-recess<=40);assert.deepEqual(Array.from(rgba.slice(at(8,8),at(8,8)+4)),[18,45,90,255]);assert.deepEqual(Array.from(rgba.slice(at(40,40),at(40,40)+4)),[2,2,2,255]);
 const native=P.sources.find(s=>s.id==='photo-106-0'),regions=P.paneRegions(native,rgba,w,h);assert(regions.every(p=>p.y+p.height>=.276),'protect the real bottom grid and glass');
});
test('extending a photographed chamfer cannot cover the actual outer window lites',()=>{
 const {P,R}=harness(),s=P.adaptSource(P.sources.find(s=>s.id==='photo-106-0'),9),raw={width:100,height:100,q:[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],data:picture(100,100,(x,y)=>[x*2,y*2,80,255]).data};
 for(const [u,v] of [[.935,.085],[.104,.09]]){const actual=new Float64Array(4),expected=new Float64Array(4),q=R.project(raw.q,u,v);P.sampleSource(raw,s,u,v,actual,0);P.sample(raw.data,raw.width,raw.height,q.x,q.y,expected,0);assert.deepEqual(actual,expected);}
});
test('the direct compositor samples fine photographic detail without an intermediate resized texture',()=>{
 const {P,R}=harness(),w=96,h=80,raw={width:w,height:h,q:[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],data:picture(w,h,x=>{const l=x%2?235:25;return [l,l,l,255]}).data},surface={raw,source:{repeat:1},panes:[],painting:null,material:{width:1,height:1,data:[1],base:220,balance:[1,1,1]}},d={designPreview:{photographic:true,originalFinish:true,sourceFinish:'White',sourceMaterial:'painted-steel'},realism:{light:1,depth:0,shadows:1}},q=[{x:3,y:8},{x:109,y:3},{x:112,y:91},{x:7,y:94}],scene={gain:1,red:1,blue:1};
 const result=R.warpPhotograph({naturalWidth:w,naturalHeight:h},surface,d,q,120,100,scene,null),pixels=result.canvas.getContext('2d').getImageData(0,0,result.canvas.width,result.canvas.height).data,m=R.inverse(q);let checked=0;
 for(let y=10;y<result.canvas.height-10;y++)for(let x=10;x<result.canvas.width-10;x++){const px=result.left+x+.5,py=result.top+y+.5,den=m[6]*px+m[7]*py+m[8],u=(m[0]*px+m[1]*py+m[2])/den,v=(m[3]*px+m[4]*py+m[5])/den;if(u<.05||u>.95||v<.05||v>.95)continue;const a=new Float64Array(4);P.sampleSource(raw,surface.source,u,v,a,0);assert(Math.abs(pixels[(y*result.canvas.width+x)*4]-a[0])<1);checked++;}assert(checked>4000);
});
test('closed long panels use the photographed solid section and cannot retain the glass row',async()=>{
 const {P,D}=harness(),closed=P.sources.find(s=>s.id==='photo-017-0-closed');assert.equal(closed.panelFill,'closed-top');assert.equal(closed.photoId,'installation-017');assert.equal(closed.layout,'closed');assert.equal(closed.band,null);
 D.loadImage=async()=>picture(100,100,(_,y)=>y<44?[20,20,20,255]:[210,210,210,255]);const d=door('square-long',closed.id,'original',16),preview=await P.prepare(d);assert.equal(preview.nativeGeometry,false);assert.equal(preview.columns,4);assert.equal(preview.sections,4);assert.equal(preview.glassRegions.length,0);
 const texture=P.rectify(await D.loadImage(),closed,100),pixels=texture.getContext('2d').getImageData(0,0,texture.width,texture.height).data;assert(pixels[(Math.floor(texture.height*.1)*texture.width+Math.floor(texture.width*.5))*4]>200,'first section is actual painted material, rather than glass or a drawn panel');
});
test('a late photo load cannot attach an obsolete finish to the active design',async()=>{
 const {P,D}=harness();let resolve;D.loadImage=()=>new Promise(r=>resolve=r);const d=door(),old=P.prepare(d);d.visualDesign.finish='black';const current=P.prepare(d);resolve(picture());await old;await current;assert.equal(d.designPreview.key,P.choice(d).key);assert.match(d.designPreview.key,/black/);const first=d.designPreview;assert.equal(await P.prepare(d),first);
});
test('a failed source request can be retried without a permanently rejected cache',async()=>{
 const {P,D}=harness(),d=door();D.loadImage=async()=>{throw Error('Photo unavailable');};await assert.rejects(P.prepare(d),/Photo unavailable/);assert.equal(D.overlay(d),'');D.loadImage=async()=>picture();assert((await P.prepare(d)).url.startsWith('data:image/png'));
});
test('repainting preserves photographed glazing, bright reflections, hardware and embossing',()=>{
 const {P}=harness(),w=100,h=100,panes=[{x:.1,y:.05,width:.2,height:.15}],d=door('carriage-short','photo-057-0','black'),c=P.choice(d),rgba=picture(w,h,(x,y)=>x>=10&&x<30&&y>=5&&y<20?[175,200,235,255]:x===50&&y===40?[22,22,22,255]:y===70?[100,100,100,255]:[220,220,220,255]).data,before=rgba.slice(),at=(x,y)=>(y*w+x)*4;
 P.paint(rgba,w,h,c,panes);assert.deepEqual(Array.from(rgba.slice(at(15,10),at(15,10)+4)),Array.from(before.slice(at(15,10),at(15,10)+4)));assert.deepEqual(Array.from(rgba.slice(at(50,40),at(50,40)+4)),[22,22,22,255]);assert(rgba[at(50,60)]<50);assert(rgba[at(50,70)]<rgba[at(50,60)]);for(let i=3;i<rgba.length;i+=4)assert.equal(rgba[i],255);
});
test('native finish retains the exact photograph while a new finish changes its cache key',()=>{
 const {P}=harness(),d=door(),img=picture(),before=img.data.slice();P.paint(img.data,96,96,P.choice(d),[]);assert.deepEqual(img.data,before);const original=P.choice(d).key;d.visualDesign.finish='white';P.paint(img.data,96,96,P.choice(d),[]);assert.deepEqual(img.data,before);d.visualDesign.finish='black';assert.notEqual(P.choice(d).key,original);
});
test('neutral paint loses the source blue cast without changing photographed pane reflections',()=>{
 const {R}=harness(),img=picture(96,96,(x,y)=>x>9&&x<28&&y<20?[18,45,85,255]:[180,210,230,255]),d={designPreview:{photographic:true,originalFinish:true,sourceFinish:'White',glassRegions:[{x:.09,y:0,width:.22,height:.22}]},realism:{light:1,depth:0}},tex=R.texture(img,d),pixels=tex.getContext('2d').getImageData(0,0,96,96).data,body=(60*96+60)*4,pane=(10*96+15)*4;
 assert(Math.abs(pixels[body]-pixels[body+2])<=2);assert.deepEqual(Array.from(pixels.slice(pane,pane+4)),[18,45,85,255]);
});
test('colored steel retains its photographed paint hue without importing a local sunset cast',()=>{
 const {R}=harness(),img=picture(96,96,(x,y)=>x>74?[160,110,30,255]:[35,105,55,255]),d={designPreview:{photographic:true,originalFinish:true,sourceFinish:'Green',sourceMaterial:'painted-steel',glassRegions:[]},realism:{light:1,depth:0}},tex=R.texture(img,d),pixels=tex.getContext('2d').getImageData(0,0,96,96).data,plain=(60*96+30)*4,warm=(60*96+85)*4;
 assert(Math.abs(pixels[plain]/pixels[plain+1]-pixels[warm]/pixels[warm+1])<.02);assert(pixels[warm+1]>pixels[warm],'retain green paint instead of the old orange reflection');
});
test('natural wood retains individual grain colors during lighting transfer',()=>{
 const {R}=harness(),img=picture(96,96,x=>x<48?[105,65,35,255]:[70,80,45,255]),d={designPreview:{photographic:true,originalFinish:true,sourceFinish:'Brown',sourceMaterial:'wood',glassRegions:[]},realism:{light:1,depth:0}},tex=R.texture(img,d),pixels=tex.getContext('2d').getImageData(0,0,96,96).data,a=(50*96+25)*4,b=(50*96+75)*4;
 assert(pixels[a]>pixels[a+1]);assert(pixels[b]<pixels[b+1]);
});
test('scene illumination preserves thin real shadows and excludes old windows and panel grooves',()=>{
 const {R}=harness(),cv=canvas();cv.width=128;cv.height=128;const img=picture(128,128,(x,y)=>y<18||x===109&&y>105?[40,40,40,255]:x===48?[170,170,170,255]:[220,220,220,255]);cv.getContext('2d').drawImage(img);const field=R.lightingField(cv,[],true);assert(field.supported);assert(R.fieldAt(field,.5,.05)<.25);assert(R.fieldAt(field,109.5/128,115.5/128)<.25);assert(R.fieldAt(field,48.5/128,.6)>.95);
 const masked=R.lightingField(cv,[{x:0,y:0,width:1,height:.15}],true);assert(R.fieldAt(masked,.5,.05)>.9);assert.equal(R.fieldAt({width:2,height:1,data:[0,1]},.5,.5),.5,'bilinear shadow sampling must not introduce pixel blocks');
});
test('unsupported old paint colors cannot tint or imprint a new white door',()=>{
 const {R}=harness(),cv=canvas();cv.width=64;cv.height=64;cv.getContext('2d').drawImage(picture(64,64,()=>[160,65,25,255]));const field=R.lightingField(cv,[],true);assert.equal(field.supported,false);assert.equal(R.fieldAt(field,.5,.5),1);
});
test('window choices use available real sources and optional product names are escaped',()=>{
 const {P,D}=harness(),d=door();d.productDescription='Custom "door" <img onerror=bad>';
 const html=D.controls(d,0);assert.match(html,/Windows &amp; inserts/);assert.match(html,/Photographed reference/);assert.match(html,/&lt;img onerror=bad&gt;/);assert.doesNotMatch(html,/Construction|R-Value|Amarr|Clopay/);for(const layout of P.choice(d).panel.variants)assert(P.sources.some(s=>s.id===layout.id));
});
test('apply-to-all keeps each home opening, real source and dimension independent',async()=>{
 const {c,P,D}=harness(),a=door('square-short','photo-039-0'),b=door('square-short','photo-039-1');a.pos.corners=P.sources.find(s=>s.id===a.visualDesign.sourceId).corners;b.pos.corners=P.sources.find(s=>s.id===b.visualDesign.sourceId).corners;b.height=8;c.visState={doors:[a,b],doorCount:2,activeDoor:0,applyToAll:true,houseImage:{referenceId:'installation-039'}};const fits=JSON.stringify([a.pos,b.pos]);D.prepare=async()=>{};await c.window.selectVisPhotoDesign(0,'square-short');assert.equal(a.visualDesign.sourceId,'photo-039-0');assert.equal(b.visualDesign.sourceId,'photo-039-1');assert.equal(JSON.stringify([a.pos,b.pos]),fits);assert.equal(b.height,8);await c.window.setVisPhotoOption(0,'layout','clear');assert.equal(b.visualDesign.sourceId,'photo-039-1');
});
test('copying a photographic design removes catalog identity and preserves the editable product name',()=>{
 const {P}=harness(),from=door();from.productDescription='My supplied door';const to={referenceProductId:'catalog-product',modelId:'old',manufacturerId:'brand',designPreview:{url:'old'},visualDesignOverride:true};P.copyDesign(from,to);assert.equal(to.referenceProductId,'');assert.equal(to.manufacturerId,'');assert.equal(to.modelId,'');assert.equal(to.productDescription,'My supplied door');assert(!to.designPreview&&!to.visualDesignOverride);assert.equal(to.photoDesignId,from.photoDesignId);assert.notEqual(to.visualDesign,from.visualDesign);
});
test('the photographic library loads before the compositor and follows the existing build order',()=>{
 const html=read('index.html');assert.equal((html.match(/src="\/photo-door-library.js"/g)||[]).length,1);assert(html.indexOf('src="/door-design-library.js"')<html.indexOf('src="/photo-door-library.js"'));assert(html.indexOf('src="/photo-door-library.js"')<html.indexOf('src="/visualizer-gallery-premium.js"'));
});
