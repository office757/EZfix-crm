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
