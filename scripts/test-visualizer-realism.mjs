import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../visualizer-gallery-premium.js',import.meta.url),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(source.slice(0,source.indexOf('\n(() => {',source.indexOf('})();'))),context);
const R=context.window.DoorRealism,q=[{x:12,y:18},{x:88,y:8},{x:95,y:90},{x:8,y:84}];
test('perspective maps each texture corner to the matching opening corner',()=>{
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=R.project(q,u,v);assert(Math.abs(p.x-q[i].x)<1e-9);assert(Math.abs(p.y-q[i].y)<1e-9);});
});
test('fit refuses crossed, collapsed, concave and corrupt saved openings',()=>{
 assert(R.valid(q));assert(!R.valid([q[0],q[2],q[1],q[3]]));assert(!R.valid(q.map(()=>({x:50,y:50}))));assert(!R.valid([q[0],q[1],{x:40,y:30},q[3]]));assert(!R.valid([{x:NaN,y:2},...q.slice(1)]));assert(!R.valid([{x:-1,y:2},...q.slice(1)]));
});
test('normalized opening coordinates stay aligned across export sizes',()=>{
 const d={pos:{corners:q}},small=R.corners(d,400,300),large=R.corners(d,1600,1200);small.forEach((p,i)=>{assert.equal(p.x*4,large[i].x);assert.equal(p.y*4,large[i].y);});
});
test('legacy rectangle positions retain rotation and physical aspect ratio',()=>{
 const p=R.corners({pos:{x:50,y:50,widthPct:40,rotation:0,scale:1}},1000,750,.5);assert.equal(p[1].x-p[0].x,400);assert.equal(p[3].y-p[0].y,200);
});
test('inverse perspective preserves texture coordinates across the whole opening',()=>{
 const m=R.inverse(q);
 for(let y=0;y<=10;y++)for(let x=0;x<=10;x++){
  const u=x/10,v=y/10,p=R.project(q,u,v),den=m[6]*p.x+m[7]*p.y+m[8];
  assert(Math.abs((m[0]*p.x+m[1]*p.y+m[2])/den-u)<1e-9);
  assert(Math.abs((m[3]*p.x+m[4]*p.y+m[5])/den-v)<1e-9);
 }
});
function pixelCanvas(){
 let frame;
 return {getContext:()=>({createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData:f=>{frame=f;}}),get frame(){return frame;}};
}
test('perspective replacement has no translucent interior seams and retains image detail',()=>{
 context.document={createElement:pixelCanvas};
 const width=64,height=32,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data.set([x*4,y*8,(x%8<4?20:230),255],i);}
 const tex={width,height,getContext:()=>({getImageData:()=>({data})})},opening=[{x:5,y:7},{x:93,y:9},{x:90,y:91},{x:7,y:87}],mapped=R.warp(tex,opening,100,100),frame=mapped.canvas.frame,m=R.inverse(opening);
 let checked=0;
 for(let y=0;y<frame.height;y++)for(let x=0;x<frame.width;x++){
  const px=mapped.left+x+.5,py=mapped.top+y+.5,den=m[6]*px+m[7]*py+m[8],u=(m[0]*px+m[1]*py+m[2])/den,v=(m[3]*px+m[4]*py+m[5])/den;
  if(u<.05||u>.95||v<.05||v>.95)continue;
  const i=(y*frame.width+x)*4;assert.equal(frame.data[i+3],255,'old door must never show through internal raster boundaries');
  assert(Math.abs(frame.data[i]-Math.max(0,Math.min(width-1,u*width-.5))*4)<=1,'retain continuous photographic detail');checked++;
 }
 assert(checked>4000);
});
test('off-photo and transparent source pixels are bounded and use premultiplied interpolation',()=>{
 context.document={createElement:pixelCanvas};
 const tex={width:2,height:1,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255,0,0,255,0])})})};
 const mapped=R.warp(tex,[{x:-2,y:-2},{x:8,y:-1},{x:7,y:8},{x:-1,y:7}],6,6);
 assert.equal(mapped.left,0);assert.equal(mapped.top,0);assert.equal(mapped.canvas.width,6);assert.equal(mapped.canvas.height,6);
 const pixels=mapped.canvas.frame.data;
 let mixed=false;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&pixels[i+3]<255){assert.equal(pixels[i],255);assert.equal(pixels[i+2],0,'transparent RGB must not cause a colored fringe');mixed=true;}
 assert(mixed);assert.equal(R.warp(tex,[{x:10,y:10},{x:20,y:10},{x:20,y:20},{x:10,y:20}],6,6),null);
});
function photoFixture(pixel){
 const width=256,height=256,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixel(x,y),(y*width+x)*4);
 context.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data})})})};
 return {naturalWidth:width,naturalHeight:height};
}
const fullOpening=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
test('scene lighting follows broad photographic light with bounded exposure and color cast',()=>{
 const house=photoFixture((x,y)=>{const light=Math.round(175+x*.1+y*.08);return [light+2,light,light-2,255];}),light=R.sceneLight(house,fullOpening);
 assert(light.gain>=.82&&light.gain<1);assert(light.across>0&&light.across<=.12);assert(light.down>0&&light.down<=.12);
 assert(light.red>1&&light.red<=1.04);assert(light.blue<1&&light.blue>=.96);
 assert.deepEqual(R.sceneLight(house,fullOpening),light,'cached photo sampling is stable');
});
test('dark or colored old doors cannot dictate the new material finish',()=>{
 for(const pixel of [[20,20,20,255],[180,70,40,255],[200,200,200,0]]){
  const light=R.sceneLight(photoFixture(()=>pixel),fullOpening);
  assert.equal(light.gain,1);assert.equal(light.red,1);assert.equal(light.blue,1);assert.equal(light.across,0);assert.equal(light.down,0);
 }
});
test('unreadable photos fall back to the unchanged renderer',()=>{
 context.document={createElement:()=>({getContext:()=>({drawImage(){throw new Error('tainted photo');}})})};
 assert.equal(R.sceneLight({naturalWidth:256,naturalHeight:256},fullOpening).gain,1);
 assert.equal(R.sceneLight(null,fullOpening).gain,1);
});
test('matte detail is stable and subtle while dark glass and colored material stay intact',()=>{
 function canvas(){let frame;const cv={getContext:()=>({drawImage(){},getImageData(){const data=new Uint8ClampedArray(cv.width*cv.height*4);for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++)data.set(x<300?[205,205,205,255]:x<600?[30,30,30,255]:[160,95,45,255],(y*cv.width+x)*4);return {data};},putImageData:f=>{frame=f;},createLinearGradient:()=>({addColorStop(){}}),fillRect(){}}),get frame(){return frame;}};return cv;}
 context.document={createElement:canvas};
 const a=R.texture({naturalWidth:1000,naturalHeight:160},{realism:{light:1,depth:0}}),b=R.texture({naturalWidth:1000,naturalHeight:160},{realism:{light:1,depth:0}});
 assert.deepEqual(a.frame.data,b.frame.data,'no random noise or shimmer between renders');
 const colors=new Set();for(let x=0;x<1000;x++){
  const i=x*4;assert.equal(a.frame.data[i+3],255);
  if(x<300){assert(Math.abs(a.frame.data[i]-205)<=1);colors.add(a.frame.data[i]);}
  else if(x<600)assert.deepEqual(Array.from(a.frame.data.slice(i,i+3)),[30,30,30]);
  else assert.deepEqual(Array.from(a.frame.data.slice(i,i+3)),[160,95,45]);
 }
 assert(colors.size>1);
});
vm.runInContext(readFileSync(new URL('../door-design-library.js',import.meta.url),'utf8'),context);
test('dark finishes preserve pane reflections without white bleed or bright panel seams',()=>{
 const w=400,h=200,pixels=new Uint8ClampedArray(w*h*4),at=(x,y)=>(y*w+x)*4;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.set([235,235,235,255],at(x,y));
 for(let y=15;y<=45;y++)for(let x=60;x<=150;x++)pixels.set([22,25,28,255],at(x,y));
 pixels.set([246,246,246,255],at(90,30));for(let x=10;x<390;x++)pixels.set([50,50,50,255],at(x,75));pixels.set([190,90,25,255],at(300,100));pixels.set([230,230,230,0],at(200,150));
 context.window.DoorDesign.recolor(pixels,w,h,[18,34,29],null,true);
 assert.deepEqual(Array.from(pixels.slice(at(90,30),at(90,30)+4)),[246,246,246,255],'glass glare is preserved');assert.deepEqual(Array.from(pixels.slice(at(80,20),at(80,20)+4)),[22,25,28,255]);
 assert(pixels[at(200,100)]<30&&pixels[at(200,100)+1]<45,'black cannot retain a white blend');assert(pixels[at(100,75)]<10,'dark panel grooves follow the selected finish');assert(pixels[at(200,100)]>pixels[at(100,75)],'photographic relief survives');
 assert.deepEqual(Array.from(pixels.slice(at(300,100),at(300,100)+4)),[190,90,25,255]);assert.equal(pixels[at(200,150)+3],0);
});
test('foreground masks are bounded, resolution independent and use destination-out only',()=>{
 const strokes=R.foregroundStrokes([{radius:100,points:[{x:30,y:40},{x:-1,y:10},{x:Infinity,y:0},{x:60,y:70}]},{radius:'bad',points:[]}]);assert.equal(strokes.length,1);assert.equal(strokes[0].radius,5);assert.equal(strokes[0].points.length,2);
 const record=[];let mode='source-over';const ctx={save(){record.push('save');},restore(){record.push('restore');},set globalCompositeOperation(v){mode=v;},beginPath(){},moveTo(x,y){record.push([x,y]);},lineTo(x,y){record.push([x,y]);},stroke(){assert.equal(mode,'destination-out');},arc(){},fill(){}};
 R.preserveForeground(ctx,{foreground:strokes},1000,500);assert.deepEqual(record,['save',[300,200],[600,350],'restore']);assert.equal(ctx.lineWidth,100);
});
test('glass reflection stays inside verified panes and preserves inserts, alpha and surrounding panels',()=>{
 const w=100,h=50,pixels=new Uint8ClampedArray(w*h*4),photo={width:20,height:20,data:new Uint8ClampedArray(20*20*4)};
 for(let i=0;i<pixels.length;i+=4)pixels.set([50,60,90,255],i);for(let i=0;i<photo.data.length;i+=4)photo.data.set([150,170,210,255],i);const bright=(10*w+30)*4;pixels.set([240,240,240,255],bright);
 const before=pixels.slice();R.reflectGlass(pixels,w,h,[{x:.2,y:.1,width:.3,height:.25}],photo,[{x:.1,y:.4},{x:.9,y:.4},{x:.9,y:.8},{x:.1,y:.8}]);
 assert(pixels[(10*w+25)*4]>before[(10*w+25)*4]);assert(pixels[(10*w+25)*4]-before[(10*w+25)*4]<10,'reflection remains subtle');assert.deepEqual(Array.from(pixels.slice(bright,bright+4)),[240,240,240,255]);assert.deepEqual(Array.from(pixels.slice((35*w+25)*4,(35*w+25)*4+4)),[50,60,90,255]);
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);const once=pixels.slice(),unrelated=pixels.slice();R.reflectGlass(unrelated,w,h,[],photo,q);assert.deepEqual(unrelated,once);
});
test('dark solid or wood panels cannot qualify as reflective glass',()=>{
 const w=400,h=200,pixels=new Uint8ClampedArray(w*h*4);for(let i=0;i<pixels.length;i+=4)pixels.set([30,30,30,255],i);assert.equal(context.window.DoorDesign.glassGeometry(pixels,w,h).regions.length,0);
});
