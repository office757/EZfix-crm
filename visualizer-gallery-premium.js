/* One compositor for the live view and every exported/saved preview. */
(() => {
'use strict';
const clamp=(v,a,b,f)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):f;
function valid(q){
 if(!Array.isArray(q)||q.length!==4||q.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||p.x<0||p.x>100||p.y<0||p.y>100))return false;
 const cross=q.map((p,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return (b.x-p.x)*(c.y-b.y)-(b.y-p.y)*(c.x-b.x);});
 return cross.every(x=>x>.01)&&Math.abs(q.reduce((s,p,i)=>s+p.x*q[(i+1)%4].y-p.y*q[(i+1)%4].x,0))>2;
}
function corners(d,w,h,ratio=0.875){
 if(valid(d.pos?.corners))return d.pos.corners.map(p=>({x:p.x*w/100,y:p.y*h/100}));
 const p=d.pos||{},dw=w*clamp(p.widthPct,5,100,30)/100*clamp(p.scale,.2,3,1),dh=p.heightPct?h*clamp(p.heightPct,5,100,40)/100*clamp(p.scale,.2,3,1):dw*ratio;
 const a=clamp(p.rotation,-360,360,0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),x=w*clamp(p.x,0,100,50)/100,y=h*clamp(p.y,0,100,55)/100;
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:x+u*dw/2*c-v*dh/2*s,y:y+u*dw/2*s+v*dh/2*c}));
}
// Projective mapping of a unit square onto a convex opening.
function project(q,u,v){
 const [a,b,c,d]=q,dx=b.x-c.x,dy=b.y-c.y,ex=d.x-c.x,ey=d.y-c.y,sx=a.x-b.x+c.x-d.x,sy=a.y-b.y+c.y-d.y,det=dx*ey-ex*dy;
 let g=0,h=0;if(Math.abs(det)>1e-8){g=(sx*ey-ex*sy)/det;h=(dx*sy-sx*dy)/det;}
 const den=g*u+h*v+1;
 return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/den,y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/den};
}
const textureCache=new WeakMap();
const scenePixels=new WeakMap();
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.floor(sorted.length/2)]:null;};
function photoPixels(house){let photo=scenePixels.get(house);if(!photo){const cv=document.createElement('canvas'),scale=256/Math.max(house.naturalWidth,house.naturalHeight);cv.width=Math.max(1,Math.round(house.naturalWidth*scale));cv.height=Math.max(1,Math.round(house.naturalHeight*scale));const ctx=cv.getContext('2d');ctx.drawImage(house,0,0,cv.width,cv.height);photo={width:cv.width,height:cv.height,data:ctx.getImageData(0,0,cv.width,cv.height).data};scenePixels.set(house,photo);}return photo;}
function sceneLight(house,q){
 const neutral={gain:1,red:1,blue:1,across:0,down:0};if(!house)return neutral;
 try{
  const photo=photoPixels(house);
  const opening=q.map(p=>({x:p.x*photo.width,y:p.y*photo.height})),samples=[],left=[],right=[],top=[],bottom=[];
  // Broad neutral material samples only. Never transfer the old door's
  // panels, windows, color, or texture onto the selected replacement.
  for(let y=0;y<11;y++)for(let x=0;x<11;x++){
   const u=.08+x*.084,v=.22+y*.06,p=project(opening,u,v),px=Math.round(p.x),py=Math.round(p.y);
   if(px<0||py<0||px>=photo.width||py>=photo.height)continue;
   const i=(py*photo.width+px)*4,r=photo.data[i],g=photo.data[i+1],b=photo.data[i+2],lum=(r+g+b)/3;
   if(photo.data[i+3]<250||lum<110||lum>246||Math.max(r,g,b)-Math.min(r,g,b)>24)continue;
   samples.push({lum,r:r/lum,b:b/lum});if(u<.4)left.push(lum);if(u>.6)right.push(lum);if(v<.4)top.push(lum);if(v>.65)bottom.push(lum);
  }
  if(samples.length<24)return neutral;
  const mid=median(samples.map(s=>s.lum)),slope=(a,b)=>a.length>=8&&b.length>=8?clamp((median(b)-median(a))/mid,-.12,.12,0):0;
  return {gain:clamp(mid/220,.82,1.06,1),red:clamp(median(samples.map(s=>s.r)),.96,1.04,1),blue:clamp(median(samples.map(s=>s.b)),.96,1.04,1),across:slope(left,right),down:slope(top,bottom)};
 }catch{return neutral;} // Cross-origin/custom photos still render normally.
}
function reflectGlass(pixels,w,h,regions,photo,q){
 if(!photo||!Array.isArray(regions)||!q)return;
 const left=Math.min(...q.map(p=>p.x)),right=Math.max(...q.map(p=>p.x)),top=Math.max(0,Math.min(...q.map(p=>p.y)));
 for(const pane of regions){if(![pane.x,pane.y,pane.width,pane.height].every(Number.isFinite)||pane.width<=0||pane.height<=0)continue;const x0=Math.max(0,Math.floor(pane.x*w)),x1=Math.min(w,Math.ceil((pane.x+pane.width)*w)),y0=Math.max(0,Math.floor(pane.y*h)),y1=Math.min(h,Math.ceil((pane.y+pane.height)*h));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4,lum=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
   // Existing dark catalog panes only. White inserts, frames, clear highlights
   // and frosted material retain their manufacturer appearance.
   if(lum>=115||pixels[i+3]<200)continue;const u=x/w,v=(y-y0)/Math.max(1,y1-y0),sx=Math.round((left+(right-left)*u)*photo.width),sy=Math.round(top*(.12+.75*(1-v))*photo.height),j=(Math.max(0,Math.min(photo.height-1,sy))*photo.width+Math.max(0,Math.min(photo.width-1,sx)))*4,alpha=.09*(.4+.6*(1-v));if(photo.data[j+3]<200)continue;
   for(let ch=0;ch<3;ch++)pixels[i+ch]=pixels[i+ch]*(1-alpha)+photo.data[j+ch]*alpha;
  }
 }
}
// Separate broad illumination from the photographed embossing. Closing fills
// narrow panel grooves; it leaves the larger roof and foreground shadows.
function lightingField(canvas,regions=[],target=false){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,rgba=ctx.getImageData(0,0,w,h).data,values=new Float32Array(w*h),valid=new Uint8Array(w*h),samples=[],colors=[[],[],[]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,lum=(rgba[i]+rgba[i+1]+rgba[i+2])/3,spread=Math.max(rgba[i],rgba[i+1],rgba[i+2])-Math.min(rgba[i],rgba[i+1],rgba[i+2]);
  const pane=regions.some(p=>x/w>=p.x&&x/w<=p.x+p.width&&y/h>=p.y&&y/h<=p.y+p.height);
  values[y*w+x]=lum;
  if(!pane&&rgba[i+3]>200&&lum>12&&(!target||spread<Math.max(22,lum*.14))){valid[y*w+x]=1;if(y>h*.2&&y<h*.94){samples.push(lum);if(x%4===0&&y%4===0&&lum>80)for(let ch=0;ch<3;ch++)colors[ch].push(rgba[i+ch]/lum);}}
 }
 samples.sort((a,b)=>a-b);const base=Math.max(18,samples[Math.floor(samples.length*.82)]||220),supported=!target||(samples.length>w*h*.2&&base>115);
 for(let y=0;y<h;y++){
  const row=[];for(let x=0;x<w;x++)if(valid[y*w+x])row.push(values[y*w+x]);const fill=median(row)||base;
  for(let x=0;x<w;x++)if(!valid[y*w+x])values[y*w+x]=fill;
 }
 function extrema(input,r,max){
  const row=new Float32Array(w*h),out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=max?0:255;for(let k=Math.max(0,x-r);k<=Math.min(w-1,x+r);k++)v=max?Math.max(v,input[y*w+k]):Math.min(v,input[y*w+k]);row[y*w+x]=v;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=max?0:255;for(let k=Math.max(0,y-r);k<=Math.min(h-1,y+r);k++)v=max?Math.max(v,row[k*w+x]):Math.min(v,row[k*w+x]);out[y*w+x]=v;}
  return out;
 }
 const radius=target?Math.max(2,Math.round(w/128)):3,closed=extrema(extrema(values,radius,true),radius,false),r=target?Math.max(3,Math.round(w/24)):6,integral=new Float64Array((w+1)*(h+1)),out=new Float32Array(w*h);
 // A chair, cable or plant can cast a thin, very dark shadow. Keep those
 // original pixels; the closing above is only for the old panel's relief.
 if(target)for(let i=0;i<closed.length;i++)if(valid[i]&&values[i]<base*.6)closed[i]=base;
 for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){sum+=closed[y*w+x];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+sum;}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=Math.max(0,x-r),b=Math.min(w,x+r+1),c=Math.max(0,y-r),d=Math.min(h,y+r+1),sum=integral[d*(w+1)+b]-integral[c*(w+1)+b]-integral[d*(w+1)+a]+integral[c*(w+1)+a];
  const broad=sum/((b-a)*(d-c))/base,original=values[y*w+x]/base,shadow=target&&valid[y*w+x]?clamp((.68-original)/.15,0,1,0):0;
  out[y*w+x]=supported?clamp(broad*(1-shadow)+original*shadow,.12,1.2,1):1;
 }
 return {width:w,height:h,data:out,base,supported,balance:colors.map(c=>clamp(median(c),.75,1.25,1))};
}
const photoMaterialFields=new WeakMap(),photoSceneFields=new WeakMap();
function photoSceneField(house,q,ratio){
 if(!house||!q)return null;let entries=photoSceneFields.get(house);if(!entries){entries=new Map();photoSceneFields.set(house,entries);}const key=JSON.stringify(q);if(entries.has(key))return entries.get(key);
 // Sample the full photograph, rather than a small whole-house thumbnail.
 // Otherwise hard shadow edges become visible blocks in an HD export.
 const photoCanvas=document.createElement('canvas'),processingScale=Math.min(1,2048/Math.max(house.naturalWidth,house.naturalHeight));photoCanvas.width=Math.max(1,Math.round(house.naturalWidth*processingScale));photoCanvas.height=Math.max(1,Math.round(house.naturalHeight*processingScale));const pc=photoCanvas.getContext('2d');pc.drawImage(house,0,0,photoCanvas.width,photoCanvas.height);const photo={width:photoCanvas.width,height:photoCanvas.height,data:pc.getImageData(0,0,photoCanvas.width,photoCanvas.height).data};
 const opening=q.map(p=>({x:p.x*photo.width,y:p.y*photo.height})),nativeWidth=(Math.hypot(opening[1].x-opening[0].x,opening[1].y-opening[0].y)+Math.hypot(opening[2].x-opening[3].x,opening[2].y-opening[3].y))/2;
 const cv=document.createElement('canvas');cv.width=Math.max(128,Math.round(Math.min(1024,nativeWidth)));cv.height=Math.max(64,Math.round(cv.width*ratio));const ctx=cv.getContext('2d'),frame=ctx.createImageData(cv.width,cv.height);
 for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const p=project(opening,(x+.5)/cv.width,(y+.5)/cv.height);window.PhotoDoor.sample(photo.data,photo.width,photo.height,p.x,p.y,frame.data,(y*cv.width+x)*4);}
 ctx.putImageData(frame,0,0);
 const path=String(house.currentSrc||house.src||'').split(/[?#]/)[0],ref=window.PhotoDoor.sources.find(s=>path.endsWith(s.url)&&s.corners.every((p,i)=>Math.hypot(p.x/100-q[i].x,p.y/100-q[i].y)<.008));
 const regions=ref?window.PhotoDoor.paneRegions(ref,frame.data,cv.width,cv.height):window.DoorDesign.glassGeometry(frame.data,cv.width,cv.height).regions;
 const field=lightingField(cv,regions,true);entries.set(key,field);if(entries.size>8)entries.delete(entries.keys().next().value);return field;
}
function fieldAt(field,u,v){if(!field)return 1;const x=Math.max(0,Math.min(field.width-1,u*field.width-.5)),y=Math.max(0,Math.min(field.height-1,v*field.height-.5)),a=Math.floor(x),b=Math.floor(y),fx=x-a,fy=y-b,right=Math.min(field.width-1,a+1),bottom=Math.min(field.height-1,b+1);return field.data[b*field.width+a]*(1-fx)*(1-fy)+field.data[b*field.width+right]*fx*(1-fy)+field.data[bottom*field.width+a]*(1-fx)*fy+field.data[bottom*field.width+right]*fx*fy;}
function photographicTexture(img,d,scene,house,q){
 const preview=d.designPreview,regions=preview.glassRegions||[],key=JSON.stringify(['photo',d.realism||{},scene,regions,q]);let entries=textureCache.get(img);if(!entries){entries=new Map();textureCache.set(img,entries);}const cached=entries.get(key);if(cached?.house===house)return cached.canvas;
 const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);
 let material=photoMaterialFields.get(img);if(!material){const small=document.createElement('canvas');small.width=Math.min(256,cv.width);small.height=Math.max(1,Math.round(small.width*cv.height/cv.width));small.getContext('2d').drawImage(img,0,0,small.width,small.height);material=lightingField(small,regions);photoMaterialFields.set(img,material);}
 let environment=null;try{environment=photoSceneField(house,q,cv.height/cv.width);}catch{}
 const frame=ctx.getImageData(0,0,cv.width,cv.height),pixels=frame.data,light=clamp(d.realism?.light,.65,1.25,1),shadows=clamp(d.realism?.shadows,0,1,1),balance=preview.originalFinish&&/^(White|Gray|Black)$/.test(preview.sourceFinish)?material.balance:[1,1,1];
 for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
  const u=(x+.5)/cv.width,v=(y+.5)/cv.height,i=(y*cv.width+x)*4,pane=regions.some(p=>u>=p.x&&u<=p.x+p.width&&v>=p.y&&v<=p.y+p.height);
  const source=pane?1:fieldAt(material,u,v),target=1+(fieldAt(environment,u,v)-1)*shadows,gain=light*scene.gain*target/source;
  pixels[i]=pixels[i]*gain*scene.red/(pane?1:balance[0]);pixels[i+1]=pixels[i+1]*gain/(pane?1:balance[1]);pixels[i+2]=pixels[i+2]*gain*scene.blue/(pane?1:balance[2]);
 }
 ctx.putImageData(frame,0,0);
 const depth=clamp(d.realism?.depth,0,1,0);if(depth){const g=ctx.createLinearGradient(0,0,0,cv.height);g.addColorStop(0,'rgba(0,0,0,'+depth*.5+')');g.addColorStop(.07,'rgba(0,0,0,0)');g.addColorStop(.98,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,'+depth*.25+')');ctx.fillStyle=g;ctx.fillRect(0,0,cv.width,cv.height);}
 entries.set(key,{canvas:cv,house});if(entries.size>8)entries.delete(entries.keys().next().value);return cv;
}
function texture(img,d,scene={gain:1,red:1,blue:1,across:0,down:0},house=null,q=null){
 if(d.designPreview?.photographic)return photographicTexture(img,d,scene,house,q);
 const regions=d.designPreview?.glassRegions,key=JSON.stringify([d.realism||{},scene,regions,q]);let entries=textureCache.get(img);if(!entries){entries=new Map();textureCache.set(img,entries);}const cached=entries.get(key);if(cached?.house===house)return cached.canvas;
 const cv=document.createElement('canvas');cv.width=Math.min(1600,Math.max(1000,img.naturalWidth));cv.height=Math.max(160,Math.round(cv.width*img.naturalHeight/img.naturalWidth));const ctx=cv.getContext('2d'),look=d.realism||{};
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.filter='brightness('+clamp(look.light,.65,1.25,.96)+') contrast(1.025)';ctx.drawImage(img,0,0,cv.width,cv.height);ctx.filter='none';
 {
  const frame=ctx.getImageData(0,0,cv.width,cv.height),pixels=frame.data;
  for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){
   const i=(y*cv.width+x)*4,gain=scene.gain*(1+scene.across*(x/(cv.width-1)-.5)+scene.down*(y/(cv.height-1)-.5));
   // Subtle matte paint microtexture, anchored to the material coordinates.
   // Keep dark glass and existing wood/color detail intact; never flicker.
   const lum=(pixels[i]+pixels[i+1]+pixels[i+2])/3,spread=Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2]);
   let grain=0;if(lum>110&&spread<24){let hash=(Math.imul(x+17,374761393)^Math.imul(y+29,668265263))>>>0;hash=Math.imul(hash^(hash>>>13),1274126177)>>>0;grain=((hash&1023)/1023-.5)*1.5;}
   pixels[i]=pixels[i]*gain*scene.red+grain;pixels[i+1]=pixels[i+1]*gain+grain;pixels[i+2]=pixels[i+2]*gain*scene.blue+grain;
  }
  if(house&&regions?.length){try{reflectGlass(pixels,cv.width,cv.height,regions,photoPixels(house),q);}catch{}}
  ctx.putImageData(frame,0,0);
 }
 const depth=clamp(look.depth,0,1,.45),w=cv.width,h=cv.height;
 // The door sits behind the jamb: shadows stay INSIDE the opening.
 const shade=(x0,y0,x1,y1,stops)=>{const g=ctx.createLinearGradient(x0,y0,x1,y1);stops.forEach(([at,color])=>g.addColorStop(at,color));ctx.fillStyle=g;ctx.fillRect(0,0,w,h);};
 shade(0,0,0,h,[[0,'rgba(0,0,0,'+(depth*.72)+')'],[.018,'rgba(0,0,0,'+(depth*.22)+')'],[.12,'rgba(0,0,0,0)'],[.97,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,'+(depth*.42)+')']]);
 shade(0,0,w,0,[[0,'rgba(0,0,0,'+(depth*.38)+')'],[.035,'rgba(0,0,0,0)'],[.65,'rgba(255,255,255,.025)'],[.975,'rgba(0,0,0,0)'],[1,'rgba(0,0,0,'+(depth*.28)+')']]);
 entries.set(key,{canvas:cv,house});if(entries.size>8)entries.delete(entries.keys().next().value);return cv;
}
function inverse(q){
 const [a,b,c,d]=q,dx=b.x-c.x,dy=b.y-c.y,ex=d.x-c.x,ey=d.y-c.y,sx=a.x-b.x+c.x-d.x,sy=a.y-b.y+c.y-d.y,det=dx*ey-ex*dy;
 let g=0,h=0;if(Math.abs(det)>1e-8){g=(sx*ey-ex*sy)/det;h=(dx*sy-sx*dy)/det;}
 const A=b.x-a.x+g*b.x,B=d.x-a.x+h*d.x,C=a.x,D=b.y-a.y+g*b.y,E=d.y-a.y+h*d.y,F=a.y;
 // Adjugate suffices: the homogeneous division cancels the determinant.
 return [E-F*h,C*h-B,B*F-C*E,F*g-D,A-C*g,C*D-A*F,D*h-E*g,B*g-A*h,A*E-B*D];
}
const texturePixels=new WeakMap();
function warp(tex,q,w,h){
 const left=Math.max(0,Math.floor(Math.min(...q.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...q.map(p=>p.y))));
 const width=Math.max(0,Math.min(w,Math.ceil(Math.max(...q.map(p=>p.x))))-left),height=Math.max(0,Math.min(h,Math.ceil(Math.max(...q.map(p=>p.y))))-top);
 if(!width||!height)return null;
 const cv=document.createElement('canvas');cv.width=width;cv.height=height;const ctx=cv.getContext('2d'),frame=ctx.createImageData(width,height),out=frame.data,m=inverse(q),tw=tex.width,th=tex.height;
 let src=texturePixels.get(tex);if(!src){src=tex.getContext('2d').getImageData(0,0,tw,th).data;texturePixels.set(tex,src);}
 // Sample each destination pixel once. Triangle clips leave antialiased gaps
 // and reveal the old door; inverse mapping has no internal edges at all.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=left+x+.5,py=top+y+.5,den=m[6]*px+m[7]*py+m[8];if(Math.abs(den)<1e-10)continue;
  const u=(m[0]*px+m[1]*py+m[2])/den,v=(m[3]*px+m[4]*py+m[5])/den;if(u<0||u>1||v<0||v>1)continue;
  const tx=Math.max(0,Math.min(tw-1,u*tw-.5)),ty=Math.max(0,Math.min(th-1,v*th-.5)),ix=Math.floor(tx),iy=Math.floor(ty),fx=tx-ix,fy=ty-iy;
  const a=(iy*tw+ix)*4,b=(iy*tw+Math.min(tw-1,ix+1))*4,c=(Math.min(th-1,iy+1)*tw+ix)*4,d=(Math.min(th-1,iy+1)*tw+Math.min(tw-1,ix+1))*4;
  const wa=(1-fx)*(1-fy)*src[a+3],wb=fx*(1-fy)*src[b+3],wc=(1-fx)*fy*src[c+3],wd=fx*fy*src[d+3],alpha=wa+wb+wc+wd,i=(y*width+x)*4;
  if(alpha>0)for(let ch=0;ch<3;ch++)out[i+ch]=(src[a+ch]*wa+src[b+ch]*wb+src[c+ch]*wc+src[d+ch]*wd)/alpha;
  out[i+3]=alpha;
 }
 ctx.putImageData(frame,0,0);return {canvas:cv,left,top};
}
function foregroundStrokes(value){
 if(!Array.isArray(value))return [];
 return value.slice(0,64).map(s=>({radius:clamp(s?.radius,.2,5,1),points:Array.isArray(s?.points)?s.points.slice(0,200).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=100&&p.y>=0&&p.y<=100).map(p=>({x:p.x,y:p.y})):[]})).filter(s=>s.points.length);
}
function preserveForeground(ctx,d,w,h){
 const strokes=foregroundStrokes(d.foreground);if(!strokes.length)return;
 ctx.save();ctx.globalCompositeOperation='destination-out';ctx.strokeStyle='#000';ctx.fillStyle='#000';ctx.lineCap='round';ctx.lineJoin='round';
 for(const stroke of strokes){const points=stroke.points,r=stroke.radius*w/100;ctx.lineWidth=r*2;ctx.beginPath();
  if(points.length===1){ctx.arc(points[0].x*w/100,points[0].y*h/100,r,0,Math.PI*2);ctx.fill();}
  else{points.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*w/100,p.y*h/100));ctx.stroke();}
 }ctx.restore();
}
function draw(output,img,d,w,h,house){
 const layer=document.createElement('canvas');layer.width=w;layer.height=h;const ctx=layer.getContext('2d');
 const q=corners(d,w,h,img.naturalHeight/img.naturalWidth),normalized=q.map(p=>({x:p.x/w,y:p.y/h})),preview=d.designPreview;
 const exactPhoto=preview?.photographic&&preview.nativeGeometry&&preview.originalFinish&&house&&String(house.currentSrc||house.src||'').split(/[?#]/)[0].endsWith(preview.sourcePhotoUrl)&&preview.sourceCorners.every((p,i)=>Math.hypot(p.x/100-normalized[i].x,p.y/100-normalized[i].y)<.00001)&&clamp(d.realism?.light,.65,1.25,1)===1&&clamp(d.realism?.depth,0,1,0)===0&&clamp(d.realism?.shadows,0,1,1)===1;
 const cut=clamp(d.realism?.cut,0,.22,0),uv=[[cut,0],[1-cut,0],[1,cut],[1,1],[0,1],[0,cut]];
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.save();ctx.beginPath();uv.forEach(([u,v],i)=>{const p=project(q,u,v);ctx[i?'lineTo':'moveTo'](p.x,p.y);});ctx.closePath();ctx.clip();
 if(exactPhoto)ctx.drawImage(house,0,0,w,h);
 else{
 const light=sceneLight(house,normalized),tex=texture(img,d,light,house,normalized);
 const [a,b,c,e]=q,affine=Math.hypot(a.x-b.x+c.x-e.x,a.y-b.y+c.y-e.y)<.05;
 if(affine){ctx.save();ctx.transform((b.x-a.x)/tex.width,(b.y-a.y)/tex.width,(e.x-a.x)/tex.height,(e.y-a.y)/tex.height,a.x,a.y);ctx.drawImage(tex,0,0);ctx.restore();}
 else{const mapped=warp(tex,q,w,h);if(mapped)ctx.drawImage(mapped.canvas,mapped.left,mapped.top);}
 }
 ctx.restore();preserveForeground(ctx,d,w,h);output.save();output.globalAlpha=clamp(d.pos?.opacity,.35,1,1);output.drawImage(layer,0,0);output.restore();
}
const images=new Map();function load(url){if(!images.has(url)){const task=window.DoorDesign.loadImage(url);images.set(url,task);task.catch(()=>images.delete(url));if(images.size>12)images.delete(images.keys().next().value);}return images.get(url);}
window.DoorRealism={valid,corners,project,inverse,warp,sceneLight,texture,reflectGlass,draw,clamp,load,foregroundStrokes,preserveForeground,lightingField,photoSceneField,fieldAt};
})();
(() => {
'use strict';

function homePhotos(){return [...(window.EZFIX_PHOTO_LIBRARY||[]),...(window.EZFIX_INSPIRATION_LIBRARY||[])].map(p=>{const sources=(window.PhotoDoor?.sources||[]).filter(s=>s.photoId===p.id).sort((a,b)=>a.opening-b.opening);return sources.length===p.openings?{...p,corners:sources.map(s=>s.corners)}:p;});}
function preparedHomePhotos(){return homePhotos().filter(p=>p.corners?.length===visState.doorCount);}
function homeReferenceUrl(id){return homePhotos().find(p=>p.id===id)?.url||'/assets/door-styles/'+id+'.png';}
const visCatalogState={search:'',manufacturer:'',collection:'',readyOnly:true,limit:12,tab:'models'};
let visZoom=1,foregroundMode=false,foregroundRadius=1,comparisonMode='slider',comparisonPosition=50;
const persistentDoors=doors=>JSON.parse(JSON.stringify(doors)).map(d=>{delete d.designPreview;return d;});
function designSnapshot(){return {houseImage:visState.houseImage?{...visState.houseImage}:null,doors:persistentDoors(visState.doors.slice(0,visState.doorCount)),doorCount:visState.doorCount,activeDoor:visState.activeDoor};}
let historyState=null,historyHome='',undoStack=[],redoStack=[],lastEditGroup='',lastEditTime=0;
function syncHistory(){const home=visState.houseImage?.id||visState.houseImage?.url||'';if(historyState!==visState||home!==historyHome){historyState=visState;historyHome=home;undoStack=[];redoStack=[];lastEditGroup='';visZoom=1;foregroundMode=false;cornerFitDoor=-1;}}
function editSnapshot(){return JSON.stringify({doors:persistentDoors(visState.doors),doorCount:visState.doorCount,activeDoor:visState.activeDoor,applyToAll:visState.applyToAll});}
function checkpoint(group=''){
 syncHistory();const now=Date.now();if(group&&group===lastEditGroup&&now-lastEditTime<700){lastEditTime=now;return;}
 const snapshot=editSnapshot();if(undoStack.at(-1)!==snapshot){undoStack.push(snapshot);if(undoStack.length>30)undoStack.shift();}redoStack=[];lastEditGroup=group;lastEditTime=now;
 const undo=document.getElementById('visUndoBtn'),redo=document.getElementById('visRedoBtn');if(undo)undo.disabled=!undoStack.length;if(redo)redo.disabled=true;
}
async function restoreHistory(redo=false){
 syncHistory();const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;if(dragCleanup)dragCleanup();to.push(editSnapshot());const saved=JSON.parse(from.pop());visState.doors=saved.doors;visState.doorCount=saved.doorCount;visState.activeDoor=saved.activeDoor;visState.applyToAll=!!saved.applyToAll;lastEditGroup='';
 const target=visState;render();try{await Promise.all(target.doors.slice(0,target.doorCount).map(d=>window.DoorDesign?.prepare(d)));if(target===visState&&route.page==='visualizer')render();}catch(e){if(target===visState)toast(e.message,true);}
}
window.VisualizerEdits={checkpoint,snapshot:designSnapshot,persistentDoors,undo:()=>restoreHistory(),redo:()=>restoreHistory(true)};
window.undoVisEdit=window.VisualizerEdits.undo;window.redoVisEdit=window.VisualizerEdits.redo;
document.addEventListener('keydown',e=>{if(route.page!=='visualizer'||![3,4].includes(visState.step)||!(e.ctrlKey||e.metaKey)||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)||e.target?.isContentEditable)return;if(e.key.toLowerCase()==='z'){e.preventDefault();(e.shiftKey?window.redoVisEdit:window.undoVisEdit)();}});
window.setVisZoom=function(value){visZoom=window.DoorRealism.clamp(value,1,3,1);const stage=document.getElementById('visStage');if(stage)stage.style.width=visZoom*100+'%';};
window.toggleVisForeground=function(){foregroundMode=!foregroundMode;window.__visForegroundMode=foregroundMode;if(foregroundMode)cornerFitDoor=-1;render();};
window.clearVisForeground=function(){const d=visState.doors[visState.activeDoor];if(!d?.foreground?.length)return;checkpoint();delete d.foreground;render();};
window.setVisBrushSize=function(value){foregroundRadius=window.DoorRealism.clamp(value,.2,3,1);};
function editToolbar(){syncHistory();window.__visForegroundMode=foregroundMode;return '<div class="studio-edit-toolbar" role="group" aria-label="Preview editing tools"><button id="visUndoBtn" class="btn btn-sm" onclick="undoVisEdit()" '+(!undoStack.length?'disabled':'')+' aria-label="Undo last design change">↶ Undo</button><button id="visRedoBtn" class="btn btn-sm" onclick="redoVisEdit()" '+(!redoStack.length?'disabled':'')+' aria-label="Redo design change">↷ Redo</button><label>Zoom<select aria-label="Preview zoom" onchange="setVisZoom(this.value)">'+[1,1.5,2,3].map(n=>'<option value="'+n+'" '+(visZoom===n?'selected':'')+'>'+n*100+'%</option>').join('')+'</select></label><button class="btn btn-sm '+(foregroundMode?'btn-primary':'')+'" aria-pressed="'+foregroundMode+'" onclick="toggleVisForeground()">Keep foreground</button>'+(foregroundMode?'<label>Brush size<input type="range" aria-label="Foreground brush size" min=".2" max="3" step=".1" value="'+foregroundRadius+'" oninput="setVisBrushSize(this.value)"></label><button class="btn btn-sm" onclick="clearVisForeground()">Clear foreground</button><p>Brush over an object in front of the door to keep it visible. Undo restores your previous brush stroke.</p>':'')+'</div>';}
window.startVisForegroundStroke=function(e,idx){
 const d=visState.doors[idx],stage=document.getElementById('visStage');if(!foregroundMode||!d||!stage)return;
 e.preventDefault();e.stopPropagation();if(dragCleanup)dragCleanup();if((d.foreground?.length||0)>=64)return toast('Use Undo or clear the foreground brush before adding more strokes.',true);
 const r=stage.getBoundingClientRect(),id=e.pointerId,target=visState;if(!r.width||!r.height)return;checkpoint();let stroke={radius:foregroundRadius,points:[]};d.foreground=[...(d.foreground||[]),stroke];
 const move=ev=>{if(ev.pointerId!==id||target!==visState)return;const p={x:(ev.clientX-r.left)/r.width*100,y:(ev.clientY-r.top)/r.height*100};if(p.x<0||p.x>100||p.y<0||p.y>100)return;const last=stroke.points.at(-1);if(last&&Math.hypot(last.x-p.x,last.y-p.y)<.12)return;if(stroke.points.length>=200){const next={radius:stroke.radius,points:[last,p]};if(d.foreground.length>=64)return;d.foreground.push(next);stroke=next;}else stroke.points.push(p);queueVisPaint();};
 const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);window.removeEventListener('blur',cleanup);dragCleanup=null;};
 const end=ev=>{if(ev.pointerId!==id)return;move(ev);cleanup();if(target===visState&&route.page==='visualizer')render();};move(e);dragCleanup=cleanup;document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);window.addEventListener('blur',cleanup);
};
window.setVisComparison=function(value){comparisonPosition=window.DoorRealism.clamp(value,0,100,50);const after=document.getElementById('visCompareAfter'),line=document.getElementById('visCompareLine');if(after)after.style.clipPath='inset(0 0 0 '+comparisonPosition+'%)';if(line)line.style.left=comparisonPosition+'%';};
window.setVisComparisonMode=function(value){comparisonMode=value==='side'?'side':'slider';render();};
window.__visCatalogState=visCatalogState;
const val=(p,key)=>key==='imageUrl'?(p?.imageAsset?.url||(window.DoorDesign?.profile(p)?window.DoorDesign.defaultImage(p):(p?.imageUrl||p?.appData?.imageUrl||p?.app_data?.image_url||''))):(p?.[key] ?? p?.appData?.[key] ?? p?.app_data?.[key] ?? '');
// Reference models are intentionally inactive for normal sales/AI pricing.
// Their catalog membership, rather than the sales flag, controls this picker.
const referenceDoors=()=>STORE.products.filter(p=>val(p,'catalogKind')==='garage_door_model');
let photoSelectionVersion=0;
const refDoor=d=>d?.referenceProductId?getOne('products',d.referenceProductId):null;
const legacyDoor=d=>d?.modelId?getOne('doorModels',d.modelId):null;
const favoriteKey=()=> 'ezfix:door-favorites:v1:'+(CURRENT_TEAM_MEMBER?.id||'local');
function favoriteIds(){try{const ids=JSON.parse(localStorage.getItem(favoriteKey())||'[]');return new Set(Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[]);}catch{return new Set();}}
function toggleVisFavorite(id){
  if(!referenceDoors().some(p=>p.id===id)&&!window.PhotoDoor?.families.some(f=>'photo-family:'+f.id===id))return;
  const ids=favoriteIds();ids.has(id)?ids.delete(id):ids.add(id);
  try{localStorage.setItem(favoriteKey(),JSON.stringify([...ids]));}catch{return toast('Favorites could not be saved on this device.',true);}
  const focus=document.activeElement?.dataset.favoriteId;render();
  if(focus)[...document.querySelectorAll('[data-favorite-id]')].find(el=>el.dataset.favoriteId===focus)?.focus({preventScroll:true});
}
function visPickerTab(tab){if(!['models','design','favorites'].includes(tab))return;visCatalogState.tab=tab;render();}
window.toggleVisFavorite=toggleVisFavorite;window.visPickerTab=visPickerTab;
window.DoorFavorites={ids:favoriteIds,toggle:toggleVisFavorite};
function favoriteButton(p){const saved=favoriteIds().has(p.id);return '<button type="button" class="vg-star '+(saved?'saved':'')+'" data-favorite-id="'+esc(p.id)+'" aria-pressed="'+saved+'" aria-label="'+(saved?'Remove ':'Save ')+esc(p.name)+' '+(saved?'from':'to')+' favorites" title="'+(saved?'Remove favorite':'Save favorite')+'" onclick="toggleVisFavorite(this.dataset.favoriteId)">'+(saved?'★':'☆')+'</button>';}
function modelCard(p,i,d){
 const ready=!!(val(p,'visualizerOverlayUrl')||window.DoorDesign?.choice({referenceProductId:p.id}));
 const f=window.DoorDesign?.family(p),title=!visCatalogState.search&&f?f.label:p.name;
 return '<article class="vg-model-tile '+(d.referenceProductId===p.id||f&&f.id===window.DoorDesign?.family(refDoor(d))?.id?'selected':'')+'"><button class="vg-door-card" data-product-id="'+esc(p.id)+'" onclick="selectVisReferenceDoor('+i+',this.dataset.productId)"><div class="vg-door-thumb">'+(val(p,'imageUrl')?'<img loading="lazy" src="'+esc(val(p,'imageUrl'))+'" alt="'+esc(p.name)+'">':'🚪')+'<span class="'+(ready?'is-ready':'')+'">'+(ready?'On-home preview':'Reference')+'</span></div><div class="vg-door-copy"><b>'+esc(title)+'</b><span>'+esc(p.manufacturer||'')+'</span><small>'+esc(window.DoorDesign?.imageLabel(p)||'Model photo')+'</small></div></button>'+favoriteButton(p)+'</article>';
}
const overlayUrl=d=>{
  if(d?.photoDesignId)return window.DoorDesign?.overlay(d)||'';
  const p=refDoor(d);
  return p ? ((!d.visualDesignOverride&&val(p,'visualizerOverlayUrl'))||window.DoorDesign?.overlay(d)||val(p,'visualizerOverlayUrl')||'') : (legacyDoor(d)?.doorImageUrl||'');
};
const doorTitle=d=>{
  if(d?.photoDesignId)return window.PhotoDoor?.choice(d)?.f.label||'Garage Door';
  const p=refDoor(d); if(p)return p.name||'Garage Door';
  const m=legacyDoor(d); if(!m)return 'Garage Door';
  const mf=getOne('manufacturers',m.manufacturerId);
  return [mf?.name,m.modelName].filter(Boolean).join(' ')||'Garage Door';
};
const doorCollection=d=>{
  if(d?.photoDesignId)return '';
  const p=refDoor(d); if(p)return val(p,'collection')||'';
  return legacyDoor(d)?.collectionName||'';
};
const doorSpec=d=>{
  const p=refDoor(d); if(!p)return '';
  return [val(p,'collection'),val(p,'material'),val(p,'construction'),val(p,'rValue')?('R-'+val(p,'rValue')):''].filter(Boolean).join(' · ');
};
const visImg=(d,idx,active=false)=>{
 const url=overlayUrl(d);if(!url)return '';
 return '<canvas data-dooridx="'+idx+'" data-source="'+esc(url)+'" role="img" aria-label="Selected door preview" class="vis-door-overlay vis-realistic '+(active?'vis-door-active':'')+'" style="'+visDoorStyle(d)+'" onpointerdown="startDoorDrag(event,'+idx+')"></canvas>';
};
function visDoorStyle(d){return 'left:0;top:0;width:100%;height:100%;transform:none;opacity:1';}
let previewVersion=0;
let paintFrame=0;function queueVisPaint(){if(typeof requestAnimationFrame!=='function')return paintVisDoors();if(paintFrame)return;paintFrame=requestAnimationFrame(()=>{paintFrame=0;paintVisDoors();});}
async function paintVisDoors(){
 const version=++previewVersion,state=visState;
 if(!document.querySelectorAll)return;
 const nodes=[...document.querySelectorAll('.vis-realistic')];
 await Promise.all(nodes.map(async node=>{
  const d=state.doors[Number(node.dataset.dooridx)],src=overlayUrl(d);if(!src)return;
  try{const img=await window.DoorRealism.load(src);if(version!==previewVersion||state!==visState||!node.isConnected)return;
   const house=node.parentElement.querySelector('.vis-house-img');if(!house?.naturalWidth){house?.addEventListener('load',paintVisDoors,{once:true});return;}
   const scale=Math.min(1,1600/Math.max(house.naturalWidth,house.naturalHeight));node.width=Math.max(1,Math.round(house.naturalWidth*scale));node.height=Math.max(1,Math.round(house.naturalHeight*scale));
   window.DoorRealism.draw(node.getContext('2d'),img,d,node.width,node.height,house);
   // Canvas occupies the photo; only the actual door polygon accepts a drag.
   const q=window.DoorRealism.corners(d,100,100,img.naturalHeight/img.naturalWidth*house.naturalWidth/house.naturalHeight);
   node.style.clipPath='polygon('+q.map(p=>p.x+'% '+p.y+'%').join(',')+')';
  }catch(e){if(version===previewVersion){node.setAttribute('aria-label','Door preview could not load');toast(e.message,true);}}
 }));
}
window.setVisFit=function(idx,key,value){const n=Number(value),d=visState.doors[idx];if(!d||!['widthPct','heightPct'].includes(key)||!Number.isFinite(n))return;checkpoint('fit:'+idx+':'+key);delete d.pos.corners;d.pos[key]=Math.max(5,Math.min(100,n));queueVisPaint();};
window.setVisRealism=function(idx,key,value){const d=visState.doors[idx];if(!d||!['light','depth','cut','shadows'].includes(key))return;const n=Number(value);if(!Number.isFinite(n))return;checkpoint('light:'+idx+':'+key);d.realism={...d.realism,[key]:window.DoorRealism.clamp(n,key==='light'?.65:0,key==='light'?1.25:key==='cut'?.22:1,key==='light'?1:key==='shadows'?1:0)};queueVisPaint();};
let cornerFitDoor=-1;
window.toggleVisCornerFit=function(idx){
 const d=visState.doors[idx];if(!d)return;cornerFitDoor=cornerFitDoor===idx?-1:idx;
 if(cornerFitDoor>=0){foregroundMode=false;window.__visForegroundMode=false;}
 if(cornerFitDoor>=0&&!window.DoorRealism.valid(d.pos.corners)){
  checkpoint();
  const img=document.querySelector('#visStage .vis-house-img');const w=img?.naturalWidth||1000,h=img?.naturalHeight||750;
  d.pos.corners=window.DoorRealism.corners(d,w,h,Number(d.height||7)/Number(d.width||8)).map(p=>({x:Math.max(0,Math.min(100,p.x/w*100)),y:Math.max(0,Math.min(100,p.y/h*100))}));
 }render();
};
function cornerHandles(d,idx){if(cornerFitDoor!==idx||!window.DoorRealism.valid(d.pos.corners))return '';return d.pos.corners.map((p,k)=>'<button type="button" class="vis-corner" style="left:'+p.x+'%;top:'+p.y+'%" aria-label="Opening corner '+(k+1)+'; arrow keys to adjust" onpointerdown="startVisCornerDrag(event,'+idx+','+k+')" onkeydown="nudgeVisCorner(event,'+idx+','+k+')">'+(k+1)+'</button>').join('');}
function changeCorner(idx,k,x,y,record=true){const d=visState.doors[idx],q=d.pos.corners.map(p=>({...p}));q[k]={x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y))};if(!window.DoorRealism.valid(q))return false;if(record)checkpoint('corner:'+idx+':'+k);d.pos.corners=q;const handle=document.querySelectorAll('#visStage .vis-corner')[k];if(handle){handle.style.left=q[k].x+'%';handle.style.top=q[k].y+'%';}queueVisPaint();return true;}
window.nudgeVisCorner=function(e,idx,k){const moves={ArrowLeft:[-.2,0],ArrowRight:[.2,0],ArrowUp:[0,-.2],ArrowDown:[0,.2]},m=moves[e.key];if(!m)return;e.preventDefault();const p=visState.doors[idx].pos.corners[k];changeCorner(idx,k,p.x+m[0],p.y+m[1]);};
window.startVisCornerDrag=function(e,idx,k){
 e.preventDefault();e.stopPropagation();if(dragCleanup)dragCleanup();const state=visState,r=document.getElementById('visStage').getBoundingClientRect(),id=e.pointerId;
 let recorded=false;const move=ev=>{if(ev.pointerId!==id||state!==visState)return;if(!recorded){checkpoint();recorded=true;}changeCorner(idx,k,(ev.clientX-r.left)/r.width*100,(ev.clientY-r.top)/r.height*100,false);};
 const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);window.removeEventListener('blur',cleanup);dragCleanup=null;};
 const end=ev=>{if(ev.pointerId!==id)return;cleanup();};dragCleanup=cleanup;document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);window.addEventListener('blur',cleanup);
};

// Pointer cancellation and navigation must never leave a door drag active.
let dragCleanup=null;
startDoorDrag=function(event,idx){
 if(foregroundMode)return window.startVisForegroundStroke(event,idx);
 if(dragCleanup)dragCleanup();
 const stage=document.getElementById('visStage'),target=visState,door=target.doors[idx];
 if(!stage||!door)return;
 const rect=stage.getBoundingClientRect();if(!rect.width||!rect.height)return;
 event.preventDefault();target.activeDoor=idx;
 const pointer=event.pointerId;
 const startX=event.clientX,startY=event.clientY,original=JSON.parse(JSON.stringify(door.pos));let recorded=false;
 const move=ev=>{if(target!==visState||route.page!=='visualizer'||(pointer!==undefined&&ev.pointerId!==pointer))return;
  const dx=(ev.clientX-(Number.isFinite(startX)?startX:rect.left+original.x/100*rect.width))/rect.width*100,dy=(ev.clientY-(Number.isFinite(startY)?startY:rect.top+original.y/100*rect.height))/rect.height*100;
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
  if(!recorded){checkpoint();recorded=true;}
  if(window.DoorRealism.valid(original.corners)){const minX=Math.min(...original.corners.map(p=>p.x)),maxX=Math.max(...original.corners.map(p=>p.x)),minY=Math.min(...original.corners.map(p=>p.y)),maxY=Math.max(...original.corners.map(p=>p.y));const mx=Math.max(-minX,Math.min(100-maxX,dx)),my=Math.max(-minY,Math.min(100-maxY,dy));door.pos.corners=original.corners.map(p=>({x:p.x+mx,y:p.y+my}));}
  else{door.pos.x=Math.max(0,Math.min(100,original.x+dx));door.pos.y=Math.max(0,Math.min(100,original.y+dy));}
  queueVisPaint();
 };
 const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',finish);window.removeEventListener('blur',cleanup);if(dragCleanup===cleanup)dragCleanup=null;};
 const finish=ev=>{if(pointer!==undefined&&ev.pointerId!==pointer)return;cleanup();if(target===visState&&route.page==='visualizer')render();};
 dragCleanup=cleanup;document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);window.addEventListener('blur',cleanup);
};
window.startDoorDrag=startDoorDrag;

const baseFresh=freshDoorConfig;
freshDoorConfig=function(){
  return {...baseFresh(),referenceProductId:''};
};
window.freshDoorConfig=freshDoorConfig;
const baseDoorCount=typeof setVisDoorCount==='function'?setVisDoorCount:null;
if(baseDoorCount){setVisDoorCount=function(n){if(!Number.isInteger(n)||n<1||n>4||n===visState.doorCount)return;const photo=homePhotos().find(p=>p.id===visState.houseImage?.referenceId);if(visState.houseImage?.kind==='reference'||photo&&photo.openings!==n){visState.houseImage=null;++photoSelectionVersion;}baseDoorCount(n);};window.setVisDoorCount=setVisDoorCount;}

function filteredReferenceDoors(){
  let items=referenceDoors();
  if(visCatalogState.manufacturer) items=items.filter(p=>String(p.manufacturer||'')===visCatalogState.manufacturer);
  if(visCatalogState.collection) items=items.filter(p=>String(val(p,'collection')||'')===visCatalogState.collection);
  if(visCatalogState.readyOnly) items=items.filter(p=>!!(val(p,'visualizerOverlayUrl')||window.DoorDesign?.choice({referenceProductId:p.id})));
  const q=visCatalogState.search.trim().toLowerCase();
  if(q){
    const terms=q.split(/\s+/).filter(Boolean);
    items=items.filter(p=>{
      const hay=[p.name,p.manufacturer,p.model,p.sku,p.details,val(p,'collection'),val(p,'modelNumber'),val(p,'panelStyle'),val(p,'material'),val(p,'construction')].join(' ').toLowerCase();
      return terms.every(t=>hay.includes(t));
    });
  }
  return items.sort((a,b)=>String(a.manufacturer||'').localeCompare(String(b.manufacturer||''))||String(val(a,'collection')||'').localeCompare(String(val(b,'collection')||''))||String(a.name||'').localeCompare(String(b.name||'')));
}
function syncReferenceFields(d,p){
  d.referenceProductId=p?.id||'';
  d.modelId='';
  d.manufacturerId='';
  d.collectionKey=val(p,'collection')||'';
  d.color='';
  delete d.photoDesignId;delete d.visualDesign;delete d.designPreview;delete d.visualDesignOverride;
  window.DoorDesign?.normalize(d);
  d.construction=val(p,'construction')||'';
}
async function selectVisReferenceDoor(idx,id){
  const p=getOne('products',id); if(!p)return;
  const target=visState;
  checkpoint();
  syncReferenceFields(visState.doors[idx],p);
  visCatalogState.tab='design';
  if(visState.applyToAll){
    visState.doors.slice(0,visState.doorCount).forEach((d,i)=>{if(i!==idx)syncReferenceFields(d,p)});
  }
  render();
  try{await Promise.all(target.doors.slice(0,target.doorCount).map(d=>window.DoorDesign?.prepare(d)));if(target===visState&&route.page==='visualizer')render();}catch(e){if(target===visState)toast(e.message,true);}
}
window.selectVisReferenceDoor=selectVisReferenceDoor;
function visCatalogSearch(value){const el=document.activeElement,at=el?.selectionStart;visCatalogState.search=value;visCatalogState.limit=12;if(visCatalogState.tab==='design')visCatalogState.tab='models';render();const input=document.getElementById('visModelSearch');input?.focus();if(typeof at==='number')input?.setSelectionRange(at,at);}
function visCatalogManufacturer(value){visCatalogState.manufacturer=value;visCatalogState.collection='';visCatalogState.limit=12;if(visCatalogState.tab==='design')visCatalogState.tab='models';render();}
function visCatalogCollection(value){visCatalogState.collection=value;visCatalogState.limit=12;render();}
function visCatalogReadyOnly(checked){visCatalogState.readyOnly=!!checked;visCatalogState.limit=12;if(visCatalogState.tab==='design')visCatalogState.tab='models';render();}
window.visCatalogSearch=visCatalogSearch;window.visCatalogManufacturer=visCatalogManufacturer;window.visCatalogCollection=visCatalogCollection;window.visCatalogReadyOnly=visCatalogReadyOnly;

function showMoreVisDoors(){
  visCatalogState.limit+=12;
  render();
  const cards=document.querySelectorAll('.vg-door-card');
  cards[Math.max(0,visCatalogState.limit-12)]?.focus({preventScroll:true});
}
window.showMoreVisDoors=showMoreVisDoors;
function setVisOpacity(idx,value){
  const d=visState.doors[idx],opacity=Number(value);
  if(!d||!Number.isFinite(opacity))return;
  checkpoint('opacity:'+idx);
  d.pos.opacity=Math.max(.35,Math.min(1,opacity));
  const overlay=document.querySelector('#visStage [data-dooridx="'+idx+'"]');
  paintVisDoors();
}
window.setVisOpacity=setVisOpacity;
function setVisScale(idx,value){
 const d=visState.doors[idx],scale=Number(value);if(!d||!Number.isFinite(scale))return;
 checkpoint('scale:'+idx);
 d.pos.scale=Math.max(.2,Math.min(3,scale));
 const overlay=document.querySelector('#visStage [data-dooridx="'+idx+'"]');
 delete d.pos.corners;paintVisDoors();
}
window.setVisScale=setVisScale;
function resetVisPosition(){
  const d=visState.doors[visState.activeDoor];if(!d)return;
  checkpoint();
  d.pos={...freshDoorConfig().pos};cornerFitDoor=-1;
  render();
}
window.resetVisPosition=resetVisPosition;const baseVisRotate=typeof nudgeVisRotation==='function'?nudgeVisRotation:()=>{};nudgeVisRotation=function(delta){checkpoint();delete visState.doors[visState.activeDoor].pos.corners;baseVisRotate(delta);};window.nudgeVisRotation=nudgeVisRotation;

async function uploadVisualizerOverlay(productId,input){
  if(!IS_OWNER)return toast('Owner access required',true);
  const file=input?.files?.[0]; if(!file)return;
  try{
    const res=await uploadAsset(file,'visualizer-overlays');
    await dbSet('products',productId,{visualizerOverlayUrl:res.url,visualizerOverlayId:res.id,visualizerOverlayAsset:res});
    visState.doors.forEach(d=>{if(d.referenceProductId===productId){delete d.visualDesignOverride;delete d.designPreview;}});
    toast('Visualizer overlay saved');
    render();
  }catch(e){console.error(e);toast('Overlay upload failed',true)}
}
window.uploadVisualizerOverlay=uploadVisualizerOverlay;

let visWorkspaceTab='designer',savedDesignSearch='';
window.setVisWorkspaceTab=function(tab){visWorkspaceTab=tab==='saved'?'saved':'designer';render();};
window.searchSavedVisualizerDesigns=function(value){savedDesignSearch=value;const caret=document.activeElement?.selectionStart;render();const input=document.getElementById('savedDesignSearch');input?.focus();if(typeof caret==='number')input?.setSelectionRange(caret,caret);};
const originalResetVisualizer=resetVisualizer;
resetVisualizer=function(){visWorkspaceTab='designer';visCatalogState.tab='models';originalResetVisualizer();};
window.resetVisualizer=resetVisualizer;
renderVisualizer=function(content,actions){
 if(visState.step>2&&!visState.houseImage)visState.step=2;
 const saved=visWorkspaceTab==='saved';
 actions.innerHTML=saved&&IS_OWNER?'<button class="btn" onclick="go(\'viscatalog\')">Door image library</button>':'<button class="btn" onclick="resetVisualizer()">New design</button>';
 const steps=['Door size','Home image','Design door','Review & save'];
 content.innerHTML='<div class="studio-shell"><div class="studio-workspace-tabs" role="group" aria-label="Visualizer workspace"><button class="'+(!saved?'active':'')+'" onclick="setVisWorkspaceTab(\'designer\')">Designer</button><button class="'+(saved?'active':'')+'" onclick="setVisWorkspaceTab(\'saved\')">Saved designs <span>'+(STORE.savedDesigns||[]).length+'</span></button></div>'+
 (!saved?'<div class="vis-steps">'+steps.map((label,i)=>'<button class="vis-step '+(visState.step===i+1?'active':'')+' '+(visState.step>i+1?'done':'')+'" '+(i+1>visState.step?'disabled':'onclick="visState.step='+(i+1)+';render()"')+'><span class="vis-step-num">'+(visState.step>i+1?'✓':i+1)+'</span><span class="vis-step-label">'+label+'</span></button>').join('')+'</div>':'')+'<div id="visStepBody"></div></div>';
 const body=document.getElementById('visStepBody');
 if(saved){
  const term=savedDesignSearch.toLowerCase(),designs=[...(STORE.savedDesigns||[])].filter(d=>[d.designName,getOne('customers',d.customerId)?.name].some(x=>String(x||'').toLowerCase().includes(term))).sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
  body.innerHTML='<section class="studio-library"><header><div><h2>Saved customer designs</h2><p>Open a design to continue with its home photo and selected doors.</p></div><button class="btn btn-primary" onclick="resetVisualizer()">+ New design</button></header><input id="savedDesignSearch" aria-label="Search saved designs" placeholder="Search by design or customer…" value="'+esc(savedDesignSearch)+'" oninput="searchSavedVisualizerDesigns(this.value)"><div class="vg-saved-grid">'+designs.map(d=>{
   const customer=getOne('customers',d.customerId),preview=d.previewImageUrl||d.houseImage?.url||d.houseImageUrl||'';
   return '<article class="vg-saved-card">'+(preview?'<img src="'+esc(preview)+'" alt="Saved customer design">':'<div class="vg-saved-placeholder">Design</div>')+'<div class="vg-saved-copy"><span>'+esc(customer?.name||'Unlinked design')+'</span><b>'+esc(d.designName||customer?.name||'Garage door design')+'</b><small>'+((d.doors||[]).length||1)+' door(s) · '+esc(fmtDate(d.updatedAt||d.createdAt))+'</small><div><button class="btn btn-sm btn-primary" data-design-id="'+esc(d.id)+'" onclick="resumeSavedVisualizerDesign(this.dataset.designId)">Open design</button>'+(IS_OWNER?'<button class="btn btn-sm" data-design-id="'+esc(d.id)+'" onclick="deleteSavedVisualizerDesign(this.dataset.designId)">Delete</button>':'')+'</div></div></article>';
  }).join('')+'</div>'+(!designs.length?'<div class="vg-empty-state"><b>No saved designs here yet</b><p>Create a design, then save it from Review.</p></div>':'')+'</section>';return;
 }
 if(visState.step===1)return renderVisStep1(body);
 if(visState.step===2)return renderVisStep2(body);
 if(visState.step===3)return renderVisStep3(body);
 renderVisStep4(body);
};
window.renderVisualizer=renderVisualizer;
async function resumeSavedVisualizerDesign(id){
 const d=getOne('savedDesigns',id);if(!d)return toast('Saved design not found',true);
 const selection=++photoSelectionVersion;
 const house=d.houseImage?.url?{...d.houseImage}:d.houseImageId?{id:d.houseImageId,url:d.houseImageUrl}:d.houseImageUrl?{url:d.houseImageUrl}:null;
 if(house?.id?.startsWith(ASSET_BUCKET+'/')){
  try{const {data,error}=await SB.storage.from(ASSET_BUCKET).createSignedUrl(house.id.slice(ASSET_BUCKET.length+1),3600);if(error||!data?.signedUrl)throw error;house.url=data.signedUrl;}catch{return toast('The home photo could not be loaded. Try again.',true);}
 }
 const count=Math.max(1,Math.min(4,Math.trunc(Number(d.doorCount)||d.doors?.length||1)));
 const savedDoors=Array.isArray(d.doors)?d.doors:[];
 const doors=Array.from({length:count},(_,i)=>{const x=savedDoors[i]&&typeof savedDoors[i]==='object'?savedDoors[i]:{},base=freshDoorConfig(),pos={...base.pos,...x.pos};for(const [key,min,max] of [['x',0,100],['y',0,100],['scale',.2,3],['rotation',-360,360],['opacity',.35,1],['widthPct',5,100],['heightPct',5,100]]){if(pos[key]===undefined)continue;const n=Number(pos[key]);if(Number.isFinite(n))pos[key]=Math.max(min,Math.min(max,n));else if(base.pos[key]!==undefined)pos[key]=base.pos[key];else delete pos[key];}if(!window.DoorRealism.valid(pos.corners))delete pos.corners;const door={...base,...x,pos,foreground:window.DoorRealism.foregroundStrokes(x.foreground)};delete door.designPreview;return door;});
 if(selection!==photoSelectionVersion)return;
 visState={step:house?3:2,doorCount:count,doors,activeDoor:0,applyToAll:false,houseImage:house,presetCustomerId:d.customerId||'',presetLeadId:'',presetJobId:'',compareList:[],savedDesignId:d.id,designName:d.designName||''};
 visWorkspaceTab='designer';visCatalogState.tab=doors[0].photoDesignId||doors[0].referenceProductId?'design':'models';const target=visState;render();
 try{await Promise.all(doors.map(d=>window.DoorDesign?.prepare(d)));if(selection===photoSelectionVersion&&target===visState){render();toast('Saved design loaded');}}catch(e){if(selection===photoSelectionVersion&&target===visState)toast(e.message,true);}
}
window.resumeSavedVisualizerDesign=resumeSavedVisualizerDesign;

async function deleteSavedVisualizerDesign(id){
  if(!IS_OWNER)return toast('Owner access required',true);
  if(!confirm('Delete this saved design?'))return;
  await dbDelete('savedDesigns',id); toast('Saved design deleted'); render();
}
window.deleteSavedVisualizerDesign=deleteSavedVisualizerDesign;

openSaveDesignModal=function(){
  const defaultCustomer=visState.presetCustomerId?getOne('customers',visState.presetCustomerId):null;
  showModal({title:'Save this design',body:'<label class="field"><span class="lbl">Design name</span><input id="f_visdesignname" value="'+esc(visState.designName||(defaultCustomer?defaultCustomer.name+' Garage Door Design':'Garage Door Design'))+'"></label><label class="field"><span class="lbl">Link to customer (optional)</span>'+customerPickerHtml(visState.presetCustomerId)+'</label><p class="muted" style="font-size:12px">The exact door selections, positions and home photo are saved so this design can be resumed later.</p>',onSave:async()=>{
    const customerId=document.getElementById('f_customer').value;
    const designName=document.getElementById('f_visdesignname').value.trim()||'Garage Door Design';
    const target=visState,snapshot=designSnapshot(),savedId=target.savedDesignId;
    const previewUrl=await captureVisPreview({snapshot});
    const record={customerId:customerId||null,designName,houseImage:snapshot.houseImage,houseImageId:snapshot.houseImage?.id||null,houseImageUrl:snapshot.houseImage?.url||null,doorCount:snapshot.doorCount,doors:snapshot.doors,previewImageUrl:previewUrl};
    const id=savedId?(await dbSet('savedDesigns',savedId,record),savedId):await dbAdd('savedDesigns',record);
    if(target===visState){target.savedDesignId=id;target.designName=designName;}
    toast('Design saved'); closeModal();render();
  }});
};
window.openSaveDesignModal=openSaveDesignModal;

renderVisStep1=function(body){
 visState.doors.forEach(d=>{if(d.customSize){d.width=d.customWidth||d.width;d.height=d.customHeight||d.height;d.customSize=false;}});
 body.innerHTML=`<section class="studio-setup"><div class="studio-setup-heading"><span>01 / OPENINGS</span><h2>Start with the garage doors</h2><p>Set the number of openings and their dimensions.</p></div><div class="studio-count"><b>Number of doors</b><div>${[1,2,3,4].map(n=>`<button class="${visState.doorCount===n?'active':''}" aria-pressed="${visState.doorCount===n}" onclick="setVisDoorCount(${n})">${n} ${n===1?'door':'doors'}</button>`).join('')}</div></div><div class="studio-dimensions">${visState.doors.slice(0,visState.doorCount).map((d,i)=>`<section><h3>Door ${i+1}</h3><div><label>Width · ft<input type="number" aria-label="Door ${i+1} width" min="4" max="30" step=".5" value="${esc(d.customSize?d.customWidth:d.width)}" onchange="visState.doors[${i}].width=this.value;visState.doors[${i}].customSize=false"></label><span>×</span><label>Height · ft<input type="number" aria-label="Door ${i+1} height" min="4" max="20" step=".5" value="${esc(d.customSize?d.customHeight:d.height)}" onchange="visState.doors[${i}].height=this.value;visState.doors[${i}].customSize=false"></label></div></section>`).join('')}</div><footer><span>Typical openings: 8 × 7 ft or 16 × 7 ft</span><button class="btn btn-primary" onclick="continueVisualizerSetup()">Choose home photo →</button></footer></section>`;
};
window.continueVisualizerSetup=function(){
 if(visState.doors.slice(0,visState.doorCount).some(d=>{const w=Number(d.customSize?d.customWidth:d.width),h=Number(d.customSize?d.customHeight:d.height);return !Number.isFinite(w)||!Number.isFinite(h)||w<4||w>30||h<4||h>20;}))return toast('Enter a width of 4–30 ft and a height of 4–20 ft.',true);
 visState.step=2;render();
};
renderVisStep2=function(body){
 body.innerHTML=`<section class="studio-setup studio-photo"><div class="studio-setup-heading"><span>02 / HOME IMAGE</span><h2>Your customer’s home</h2><p>Take a photo, upload one, or start with an EZfix reference below.</p></div><div class="studio-photo-actions"><label for="f_housecamera"><span>◎</span><b>Take a photo</b><small>Use your phone camera</small></label><label for="f_houseimg"><span>↥</span><b>Upload a photo</b><small>JPG, PNG or WebP · up to 15 MB</small></label></div><input hidden type="file" accept="image/*" capture="environment" id="f_housecamera"><input hidden type="file" accept="image/jpeg,image/png,image/webp" id="f_houseimg"><div class="studio-reference-heading"><h3>Or use an EZfix reference</h3><span>Real installation photographs</span></div><div class="studio-reference-grid">${[...preparedHomePhotos().filter(p=>!p.aiGenerated).map(p=>[p.id,p.name,'Real installation · prepared opening fit'])].map(([id,name,detail])=>`<button class="studio-reference ${visState.houseImage?.referenceId===id?'selected':''}" data-reference="${id}" aria-pressed="${visState.houseImage?.referenceId===id}" onclick="selectVisReferenceImage(this.dataset.reference)"><img src="${homeReferenceUrl(id)}" alt="${esc(name)} reference" loading="lazy"><b>${esc(name)}</b><small>${esc(detail)}</small></button>`).join('')}</div>${visState.houseImage?`<div class="studio-photo-selection"><img src="${esc(visState.houseImage.url)}" alt="Selected home image"><div><span>Selected image</span><b>${esc(visState.houseImage.name||'Customer photo')}</b><small>${visState.houseImage.kind==='reference'?'EZfix illustration · choose an actual catalog model next':visState.houseImage.kind==='inspiration'?'AI inspiration':visState.houseImage.kind==='installation'?'Real door photo':'Customer photo'}</small></div></div>`:''}<footer><button class="btn" onclick="visState.step=1;render()">← Door size</button><button class="btn btn-primary" ${visState.houseImage?'':'disabled'} onclick="visState.step=3;render()">Choose door design →</button></footer></section>`;
 const upload=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const selection=++photoSelectionVersion,target=visState;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)return toast('Choose a JPG, PNG or WebP photo smaller than 15 MB.',true);
  try{const localUrl=URL.createObjectURL(file);try{await window.DoorDesign.loadImage(localUrl);}finally{URL.revokeObjectURL(localUrl);}if(selection!==photoSelectionVersion||target!==visState)return;toast('Uploading home photo…');const asset=await uploadAsset(file,'visualizer');if(selection!==photoSelectionVersion||target!==visState)return;visState.houseImage={...asset,name:file.name,kind:'customer'};visState.doors.slice(0,visState.doorCount).forEach((d,i)=>{delete d.foreground;d.pos={...freshDoorConfig().pos,x:(i+.5)*100/visState.doorCount,widthPct:Math.min(60,80/visState.doorCount)};});cornerFitDoor=-1;render();}catch(err){if(selection===photoSelectionVersion&&target===visState)toast(err.message||'Home photo upload failed',true);}
 };
 document.getElementById('f_houseimg').addEventListener('change',upload);
 document.getElementById('f_housecamera').addEventListener('change',upload);
};
window.selectVisReferenceImage=async function(id){
 const photo=homePhotos().find(p=>p.id===id),ref=photo?[photo.id,photo.name]:DOOR_STYLE_EXAMPLES.find(x=>x[0]===id);if(!ref)return;
 const selection=++photoSelectionVersion,target=visState;
 try{
  if(photo){
   if(photo.openings!==visState.doorCount)return toast('Choose a photo with the same number of openings.',true);
   await window.DoorDesign.loadImage(photo.url);if(selection!==photoSelectionVersion||target!==visState)return;
   visState.houseImage={url:photo.url,kind:photo.aiGenerated?'inspiration':'installation',referenceId:id,name:photo.name};
   visState.doors.slice(0,visState.doorCount).forEach((d,i)=>{delete d.foreground;d.pos={...freshDoorConfig().pos,x:(i+.5)*100/visState.doorCount,widthPct:Math.min(60,80/visState.doorCount)};if(window.DoorRealism.valid(photo.corners?.[i]))d.pos.corners=photo.corners[i].map(p=>({...p}));d.realism={light:d.photoDesignId?1:.96,depth:d.photoDesignId?0:.45,shadows:1,cut:photo.cut||0};});cornerFitDoor=-1;render();return;
  }
  const count=visState.doorCount,cols=count===1?1:2,rows=Math.ceil(count/cols),url='/assets/door-styles/'+id+'.png';
  let background=url;
  if(count>1){const img=await window.DoorDesign.loadImage(url),canvas=document.createElement('canvas');canvas.width=1600;canvas.height=Math.round(1600/cols*rows*.75);const ctx=canvas.getContext('2d');ctx.fillStyle='#eef0eb';ctx.fillRect(0,0,canvas.width,canvas.height);for(let i=0;i<count;i++)ctx.drawImage(img,i%cols*canvas.width/cols,Math.floor(i/cols)*canvas.height/rows,canvas.width/cols,canvas.height/rows);background=canvas.toDataURL('image/jpeg',.88);}
  if(selection!==photoSelectionVersion||target!==visState)return;
  visState.houseImage={url:background,kind:'reference',referenceId:id,name:ref[1]+' · EZfix reference'};
  const single=id.startsWith('single-');
  visState.doors.slice(0,count).forEach((d,i)=>{delete d.foreground;d.pos={x:(i%cols*100+50)/cols,y:(Math.floor(i/cols)*100+(single?50:48))/rows,widthPct:(single?62.5:88)/cols,heightPct:(single?75:60)/rows,scale:1,rotation:0,opacity:1};});cornerFitDoor=-1;
  render();
 }catch(err){if(selection===photoSelectionVersion&&target===visState)toast(err.message||'Reference image could not be loaded.',true);}
};

renderVisStep3=function(body){
  const i=visState.activeDoor,d=visState.doors[i],c=window.DoorDesign?.choice(d),photo=window.PhotoDoor?.choice(d),selected=photo?{id:'photo-family:'+photo.f.id,name:photo.f.label}:refDoor(d);
  const all=window.PhotoDoor?.families||[],favorites=all.filter(f=>favoriteIds().has('photo-family:'+f.id));
  const terms=visCatalogState.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=all.filter(f=>(!visCatalogState.collection||f.group===visCatalogState.collection)&&terms.every(t=>(f.label+' '+f.group).toLowerCase().includes(t))&&(visCatalogState.tab!=='favorites'||favoriteIds().has('photo-family:'+f.id)));
  const groups=[...new Set(all.map(f=>f.group))];
  const collectionBody=`<div class="vg-filter-grid"><input id="visModelSearch" aria-label="Search door designs" placeholder="Search Short Panel, Long Panel, carriage…" value="${esc(visCatalogState.search)}" oninput="visCatalogSearch(this.value)"><select aria-label="Door style family" onchange="visCatalogCollection(this.value)"><option value="">All designs</option>${groups.map(x=>'<option '+(visCatalogState.collection===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select><button class="btn btn-sm ${visCatalogState.tab==='favorites'?'btn-primary':''}" onclick="visPickerTab('${visCatalogState.tab==='favorites'?'models':'favorites'}')">★ Favorites (${favorites.length})</button></div><div class="vg-results-count">${list.length} design families · ${window.PhotoDoor?.sources.length||0} real door references</div><div class="vg-door-grid">${list.map(f=>{const source=window.PhotoDoor.preferred(f.id,d),active=d.photoDesignId===f.id;return '<article class="vg-model-tile '+(active?'selected':'')+'"><button class="vg-door-card" data-design-id="'+f.id+'" onclick="selectVisPhotoDesign('+i+',this.dataset.designId)"><div class="vg-door-thumb"><img data-photo-thumb="'+source.id+'" alt="'+esc(f.label)+'"><span class="is-ready">Real photograph</span></div><div class="vg-door-copy"><b>'+esc(f.label)+'</b><span>'+esc(f.group)+'</span><small>'+window.PhotoDoor.sources.filter(s=>s.family===f.id).length+' photographed references</small></div></button>'+favoriteButton({id:'photo-family:'+f.id,name:f.label})+'</article>';}).join('')}</div>${!list.length?'<div class="vg-empty-state"><b>No matching designs</b><p>Change the search or style filter.</p></div>':''}`;
  body.innerHTML=`<div class="vg-layout">
    <section class="vg-canvas-card">
      <div class="vg-stage-head"><div><b>${visState.houseImage.kind==='reference'?'Your EZfix reference':'Your home. Your new door.'}</b><span>Drag to position · use Fit 4 corners for angled photos</span></div><button class="btn btn-sm" onclick="visState.step=2;render()">Change image</button></div>
      ${editToolbar()}<div class="studio-viewport" aria-label="Scrollable home preview"><div class="vis-stage vg-stage ${foregroundMode?'studio-brush-mode':''}" id="visStage" style="width:${visZoom*100}%" onpointerdown="if(window.__visForegroundMode)startVisForegroundStroke(event,visState.activeDoor)"><img src="${esc(visState.houseImage.url)}" class="vis-house-img" crossorigin="anonymous" alt="Home preview" draggable="false">${visState.doors.slice(0,visState.doorCount).map((dd,idx)=>visImg(dd,idx,idx===i)).join('')}${cornerHandles(d,i)}${!overlayUrl(d)?'<div class="vg-stage-empty">Choose a photographed door design to preview it here.</div>':''}</div></div>
      <details class="studio-fit-panel"><summary>Fit door ${i+1} to the opening <span>${d.width} × ${d.height} ft</span></summary><div class="studio-fit-tools"><label>Width<input aria-label="Opening width" type="range" min="5" max="100" step=".5" value="${d.pos.widthPct||30}" oninput="setVisFit(${i},'widthPct',this.value)"></label><label>Height<input aria-label="Opening height" type="range" min="5" max="100" step=".5" value="${d.pos.heightPct||40}" oninput="setVisFit(${i},'heightPct',this.value)"></label><div><button class="btn btn-sm" onclick="nudgeVisRotation(-2)" aria-label="Rotate counterclockwise">↶</button><button class="btn btn-sm" onclick="nudgeVisRotation(2)" aria-label="Rotate clockwise">↷</button><button class="btn btn-sm" onclick="resetVisPosition()">Reset position</button></div><button type="button" class="btn btn-sm" onclick="toggleVisCornerFit(${i})">${cornerFitDoor===i?'Done fitting corners':'Fit 4 corners'}</button><p class="muted">Place corners 1–4 inside the door frame, clockwise from top left.</p><label>Natural light<input aria-label="Door lighting" type="range" min=".65" max="1.25" step=".01" value="${d.realism?.light??.96}" oninput="setVisRealism(${i},'light',this.value)"></label><label>Recess & shadow<input aria-label="Door recess shadow" type="range" min="0" max="1" step=".02" value="${d.realism?.depth??.45}" oninput="setVisRealism(${i},'depth',this.value)"></label>${photo?'<label>Photo shadows<input aria-label="Photo shadow strength" type="range" min="0" max="1" step=".05" value="'+(d.realism?.shadows??1)+'" oninput="setVisRealism('+i+',\'shadows\',this.value)"></label>':''}<label>Angled upper corners<input aria-label="Angled opening corners" type="range" min="0" max=".22" step=".01" value="${d.realism?.cut??0}" oninput="setVisRealism(${i},'cut',this.value)"></label><details><summary>Transparency</summary><input aria-label="Door opacity" type="range" min=".35" max="1" step=".05" value="${d.pos.opacity}" oninput="setVisOpacity(${i},this.value)"></details></div></details>
      <p class="studio-preview-note">${visState.houseImage.kind==='reference'?'EZfix style illustration. ':''}Layout and finish preview · confirm the supplied product and finish.</p>
    </section>
    <section class="vg-picker-card studio-configurator">
      <div class="vg-picker-title"><div><span class="vg-eyebrow">EZfix door studio</span><h3>Design Door ${i+1}</h3><p>${d.width}′ wide × ${d.height}′ tall${photo?' · '+photo.source.columns+' panels × '+photo.source.sections+' sections':''}</p></div>${selected?favoriteButton(selected):''}</div>
      ${visState.doorCount>1?'<div class="vis-door-tabs">'+visState.doors.slice(0,visState.doorCount).map((dd,idx)=>'<button class="vis-door-tab '+(i===idx?'active':'')+'" onclick="visState.activeDoor='+idx+';visPickerTab((visState.doors['+idx+'].photoDesignId||visState.doors['+idx+'].referenceProductId)?\'design\':\'models\')">Door '+(idx+1)+'</button>').join('')+'</div>':''}
      <details id="studioCollections" class="studio-option" name="door-configuration" ${!selected||visCatalogState.tab!=='design'?'open':''}><summary><span>Door design</span><b>${esc(c?.f.label||doorCollection(d)||'Choose a design')}</b></summary><div class="studio-option-body">${collectionBody}</div></details>
      ${selected?(window.DoorDesign?.controls(d,i)||'<div class="vg-empty-state"><b>Manufacturer reference</b><p>This model has a reference photo. Its configuration options have not been verified yet.</p></div>'):'<p class="studio-selection-hint">Choose a photographed design to see its window layouts and colors.</p>'}
      ${visState.doorCount>1?'<label class="vg-apply-all"><input type="checkbox" '+(visState.applyToAll?'checked':'')+' onchange="toggleVisApplyToAll(this.checked)"> Apply design to all doors</label>':''}
    </section>
  </div><div class="vg-footer-actions"><button class="btn" onclick="visState.step=2;render()">← Home image</button><span>Step 3 of 4 · Design your door</span><button class="btn btn-primary" ${!visState.doors.slice(0,visState.doorCount).every(x=>x.photoDesignId||x.referenceProductId||x.modelId)?'disabled':''} onclick="visState.step=4;render()">Review & Save →</button></div>`;
};
const renderRealismStep3=renderVisStep3;renderVisStep3=function(body){renderRealismStep3(body);window.PhotoDoor?.hydrate(body);queueVisPaint();};window.renderVisStep3=renderVisStep3;

function designSpecRows(d){
 const p=refDoor(d),c=window.DoorDesign?.choice(d);
 if(c?.photographic)return [['Size',c.width+' × '+c.height+' ft'],['Door design',c.f.label],['Panel layout',c.source.columns+' panels across · '+c.source.sections+' sections'],['Color',c.finish==='original'?c.source.finish+' · as photographed':c.color.label],['Windows & inserts',c.variant.label],['Window placement',c.variant.placement],['Hardware',c.source.hardware?'As photographed':'None'],['Product name',d.productDescription||'']].filter(x=>x[1]);
 return [['Size',(d.customSize?d.customWidth:d.width)+' × '+(d.customSize?d.customHeight:d.height)+' ft'],['Brand',p?.manufacturer||getOne('manufacturers',legacyDoor(d)?.manufacturerId)?.name||''],['Collection',doorCollection(d)],['Construction',c?window.DoorDesign.modelLabel(c.p):doorTitle(d)],['Door design',c?.panel.label||''],['Color',c?.color.label||d.color||'As shown'],['Window placement',c?(window.DoorDesign.isClosed(c.panel,c.variant)?'Closed':'Top'):''],['Window design',c?.variant.label||''],['Glass',c?.glass?.label||'As shown'],['Hardware',c?.hardware?.label||'None']].filter(x=>x[1]);
}
function summaryCard(d,idx){
 const img=overlayUrl(d)||val(refDoor(d),'imageUrl');
 return '<article class="vg-summary-card studio-spec-card"><header><b>Door '+(idx+1)+'</b><button class="btn btn-sm" aria-label="Edit Door '+(idx+1)+'" onclick="visState.activeDoor='+idx+';visState.step=3;visPickerTab(\'design\')">Edit</button></header>'+(img?'<img src="'+esc(img)+'" alt="Configured door '+(idx+1)+'">':'')+'<dl>'+designSpecRows(d).map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></article>';
}
function reviewComparison(doors){
 const home=esc(visState.houseImage.url),after=doors.map((d,idx)=>visImg(d,idx)).join('');
 return '<div class="studio-compare-controls" role="group" aria-label="Before and after view"><button class="btn btn-sm '+(comparisonMode==='slider'?'btn-primary':'')+'" aria-pressed="'+(comparisonMode==='slider')+'" onclick="setVisComparisonMode(\'slider\')">Slide to compare</button><button class="btn btn-sm '+(comparisonMode==='side'?'btn-primary':'')+'" aria-pressed="'+(comparisonMode==='side')+'" onclick="setVisComparisonMode(\'side\')">Side by side</button></div><div class="studio-comparison '+(comparisonMode==='slider'?'show-slider':'show-side')+'"><section class="studio-compare-slider"><div class="studio-compare-image" onpointerdown="startVisComparisonDrag(event)"><img src="'+home+'" class="vis-house-img" crossorigin="anonymous" alt="Original home photo" draggable="false"><div id="visCompareAfter" class="studio-compare-after" style="clip-path:inset(0 0 0 '+comparisonPosition+'%)"><img src="'+home+'" class="vis-house-img" crossorigin="anonymous" alt="Home with selected door" draggable="false">'+after+'</div><span class="studio-compare-label before">Before</span><span class="studio-compare-label after">After</span><div id="visCompareLine" class="studio-compare-line" style="left:'+comparisonPosition+'%"><span aria-hidden="true">↔</span></div></div><label class="studio-compare-adjust">Slide to compare<input id="visCompareRange" type="range" aria-label="Before and after split" min="0" max="100" step=".1" value="'+comparisonPosition+'" oninput="setVisComparison(this.value)"></label></section><div class="studio-beforeafter"><section><h3>Before</h3><div class="studio-review-image"><img src="'+home+'" class="vis-house-img" crossorigin="anonymous" alt="Before the door design"></div></section><section><h3>After</h3><div class="studio-review-image" id="visBaWrap"><img src="'+home+'" class="vis-house-img" crossorigin="anonymous" alt="After design background">'+after+'</div></section></div></div>';
}
window.startVisComparisonDrag=function(e){
 if(e.button>0)return;const bounds=e.currentTarget.getBoundingClientRect(),id=e.pointerId;if(!bounds.width)return;e.preventDefault();if(dragCleanup)dragCleanup();
 const move=ev=>{if(ev.pointerId!==id)return;window.setVisComparison((ev.clientX-bounds.left)/bounds.width*100);const input=document.getElementById('visCompareRange');if(input)input.value=comparisonPosition;};
 const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',end);document.removeEventListener('pointercancel',end);window.removeEventListener('blur',cleanup);dragCleanup=null;};
 const end=ev=>{if(ev.pointerId!==id)return;move(ev);cleanup();};move(e);dragCleanup=cleanup;document.addEventListener('pointermove',move);document.addEventListener('pointerup',end);document.addEventListener('pointercancel',end);window.addEventListener('blur',cleanup);
};
renderVisStep4=function(body){
 const doors=visState.doors.slice(0,visState.doorCount),configured=doors.every(d=>d.photoDesignId||d.referenceProductId||d.modelId);
 body.innerHTML=`<section class="studio-review"><div class="studio-review-heading"><span>04 / REVIEW & SAVE</span><h2>Your new garage door</h2><p>Review the image and the full specification before saving or creating an estimate.</p></div>${reviewComparison(doors)}<p class="studio-preview-note">Preview colors and proportions may vary from the installed door.${doors.some(d=>{const c=window.DoorDesign?.choice(d);return !c?.photographic&&(c?.glass||c?.hardware);})?' Selected glass and hardware are listed below. Their appearance in the preview remains as shown in the original catalog image.':''}</p><div class="vg-review-actions studio-review-actions"><button class="btn" onclick="visState.step=3;render()">← Edit design</button><button class="btn" onclick="openSaveDesignModal()">Save Design</button><button class="btn" onclick="downloadVisPdf()">Save as PDF</button><button class="btn" id="visDownloadImage" onclick="downloadVisImage()">Download HD image</button><button class="btn" onclick="window.print()">Print</button><button class="btn" onclick="shareDesign()">Share</button><button class="btn btn-primary" ${configured?'':'disabled'} onclick="createEstimateFromDesign()">Create Estimate</button></div><div class="studio-spec-grid">${doors.map(summaryCard).join('')}</div></section>`;
};
const renderRealismStep4=renderVisStep4;renderVisStep4=function(body){renderRealismStep4(body);queueVisPaint();};window.renderVisStep4=renderVisStep4;
window.downloadVisPdf=async function(){
 if(!window.jspdf)return toast('PDF tools are still loading. Please try again.',true);
 try{
  const snapshot=designSnapshot(),name=visState.designName||'Your door selection';
  const after=await captureVisPreview({snapshot}),house=await window.DoorDesign.loadImage(snapshot.houseImage.url),cv=document.createElement('canvas');cv.width=Math.min(1600,house.naturalWidth);cv.height=Math.round(cv.width*house.naturalHeight/house.naturalWidth);cv.getContext('2d').drawImage(house,0,0,cv.width,cv.height);
  const pdf=new window.jspdf.jsPDF({unit:'pt',format:'letter'}),margin=36,w=258,ratio=house.naturalHeight/house.naturalWidth,iw=Math.min(w,290/ratio),h=iw*ratio;
  pdf.setFont('helvetica','bold');pdf.setFontSize(21);pdf.text('EZfix | Garage door design',margin,46);pdf.setFontSize(10);pdf.setTextColor(105);pdf.text(name,margin,66);
  pdf.text('BEFORE',margin,94);pdf.text('AFTER',318,94);pdf.addImage(cv.toDataURL('image/jpeg',.95),'JPEG',margin+(w-iw)/2,106,iw,h);pdf.addImage(after,'JPEG',318+(w-iw)/2,106,iw,h);
  let y=125+h;pdf.setFontSize(9);pdf.setFont('helvetica','normal');pdf.text('Layout preview. Confirm the supplied product, finish, glass and hardware.',margin,y);y+=28;
  for(const [idx,d] of snapshot.doors.entries()){
   if(y>620){pdf.addPage();y=44;}pdf.setTextColor(30);pdf.setFont('helvetica','bold');pdf.setFontSize(13);pdf.text('Door '+(idx+1),margin,y);y+=20;pdf.setFontSize(10);
   for(const [label,value] of designSpecRows(d)){const lines=pdf.splitTextToSize(String(value).replace(/×/g,'x'),390);if(y+lines.length*12>745){pdf.addPage();y=44;}pdf.setFont('helvetica','normal');pdf.setTextColor(110);pdf.text(label,margin,y);pdf.setTextColor(30);pdf.text(lines,155,y);y+=Math.max(18,lines.length*12+5);}y+=20;
  }
  pdf.save(name.replace(/[^a-z0-9_-]/gi,'-')+'.pdf');
 }catch(err){toast(err.message||'The design PDF could not be created.',true);}
};

shareDesign=function(){
  const lines=visState.doors.slice(0,visState.doorCount).filter(d=>d.photoDesignId||d.referenceProductId||d.modelId).map((d,i)=>'Door '+(i+1)+': '+doorTitle(d)+(doorCollection(d)?' · '+doorCollection(d):'')+' · '+designSpecRows(d).map(x=>x.join(': ')).join(' · ')).join('\n');
  shareOrCopy('Your garage door design',"Here's the garage door design we put together at "+COMPANY.name+":\n\n"+lines+"\n\nQuestions or ready to move forward? Call "+COMPANY.phone+".",'');
};
window.shareDesign=shareDesign;

seeSimilarInstallations=function(){
  const d=visState.doors[visState.activeDoor]||visState.doors[0],p=refDoor(d);
  const collection=(p?val(p,'collection'):legacyDoor(d)?.collectionName)||'';
  const mf=p?.manufacturer||'';
  const matches=STORE.galleryProjects.filter(g=>(collection&&String(g.doorCollection||'').toLowerCase().includes(collection.toLowerCase()))||(mf&&String(g.doorManufacturer||'').toLowerCase()===mf.toLowerCase()));
  showModal({title:'Similar EZfix Installations',body:matches.length?matches.map(g=>{const cover=(g.photos||[]).find(ph=>ph.id===g.coverPhotoId)||(g.photos||[])[0];return '<button class="vg-similar-row" onclick="closeModal();premiumViewGalleryProject(\''+g.id+'\')">'+(cover?'<img src="'+esc(cover.url)+'">':'')+'<span><b>'+esc(g.title)+'</b><small>'+esc([g.doorManufacturer,g.doorCollection,g.city].filter(Boolean).join(' · '))+'</small></span></button>'}).join(''):'<p class="muted">No matching completed installations yet. Gallery matches will appear automatically as projects are added.</p>',onSave:async()=>closeModal()});
  document.getElementById('modalSaveBtn').textContent='Close';
};
window.seeSimilarInstallations=seeSimilarInstallations;

captureVisPreview=async function(options={}){
  const snapshot=options.snapshot?JSON.parse(JSON.stringify(options.snapshot)):designSnapshot();if(!snapshot.houseImage)return null;
  await Promise.all(snapshot.doors.map(d=>window.DoorDesign?.prepare(d)));
  const house=await window.DoorDesign.loadImage(snapshot.houseImage.url);
  const maxEdge=window.DoorRealism.clamp(options.maxEdge,512,4096,2048),canvas=document.createElement('canvas');const resize=Math.min(1,maxEdge/Math.max(house.naturalWidth,house.naturalHeight));canvas.width=Math.max(1,Math.round(house.naturalWidth*resize));canvas.height=Math.max(1,Math.round(house.naturalHeight*resize));const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(house,0,0,canvas.width,canvas.height);
  for(const d of snapshot.doors){
    const src=overlayUrl(d);if(!src)continue;
    try{const img=await window.DoorDesign.loadImage(src);window.DoorRealism.draw(ctx,img,d,canvas.width,canvas.height,house);}catch(e){throw new Error('The selected door image could not be included. Please retry before saving.');}
  }
  return options.format==='png'?canvas.toDataURL('image/png'):canvas.toDataURL('image/jpeg',.95);
};
window.captureVisPreview=captureVisPreview;
let imageExportBusy=false;
window.downloadVisImage=async function(){
 if(imageExportBusy)return;const snapshot=designSnapshot();if(!snapshot.houseImage)return toast('Choose a home photo first.',true);const name=(visState.designName||'EZfix-door-design').replace(/[^a-z0-9_-]/gi,'-'),button=document.getElementById('visDownloadImage');imageExportBusy=true;if(button)button.disabled=true;
 try{toast('Preparing high-resolution image…');const url=await captureVisPreview({snapshot,maxEdge:4096,format:'png'}),a=document.createElement('a');a.href=url;a.download=name+'.png';a.click();toast('High-resolution PNG is ready');}catch(e){toast(e.message||'The image could not be downloaded. Please try again.',true);}finally{imageExportBusy=false;if(button?.isConnected)button.disabled=false;}
};

createEstimateFromDesign=async function(){
  const doors=visState.doors.slice(0,visState.doorCount).filter(d=>d.photoDesignId||d.referenceProductId||d.modelId);
  if(!doors.length||doors.length!==visState.doorCount)return toast('Choose a design for every door first',true);
  if(doors.some(d=>d.referenceProductId&&(!refDoor(d)||refDoor(d).active===false)))return toast('A selected door is no longer available. Choose an active catalog model.',true);
  try{await Promise.all(doors.map(d=>window.DoorDesign?.prepare(d)));}catch(e){return toast(e.message,true);}
  const items=doors.map((d,i)=>{
    const p=refDoor(d),m=legacyDoor(d),size=d.customSize?(d.customWidth+"'x"+d.customHeight+"'"):(d.width+"'x"+d.height+"'");
    if(d.photoDesignId){const c=window.PhotoDoor.choice(d);return {desc:(doors.length>1?'Garage door #'+(i+1)+' — ':'')+(d.productDescription?.trim()||c.f.label),details:'Size: '+size+'\n'+window.PhotoDoor.description(d),visualDesign:{...d.visualDesign,photoDesignId:d.photoDesignId},qty:1,rate:0,taxable:true,doorImage:{id:null,url:overlayUrl(d),label:c.f.label+' · '+window.PhotoDoor.description(d)}};}
    if(p){
      const design=window.DoorDesign?.choice(d)?.panel?.label||val(p,'panelStyle');
      const specs=[val(p,'collection')?'Collection: '+val(p,'collection'):'','Size: '+size,design?'Design: '+design:'',val(p,'material')?'Material: '+val(p,'material'):'',val(p,'construction')?'Construction: '+val(p,'construction'):'',val(p,'rValue')?'R-Value: '+val(p,'rValue'):''].filter(Boolean).join('\n');
      return {desc:(doors.length>1?'Garage door #'+(i+1)+' — ':'')+(p.name||'Garage Door'),details:[specs,window.DoorDesign?.description(d)].filter(Boolean).join('\n'),visualDesign:d.visualDesign?{...d.visualDesign}:undefined,qty:1,rate:0,taxable:true,productId:p.id,catalogItemId:p.id,doorImage:overlayUrl(d)?{id:null,url:overlayUrl(d),label:p.name+' · '+(window.DoorDesign?.description(d)||'Selected door')}:catalogDoorImage(p)};
    }
    const mf=getOne('manufacturers',m?.manufacturerId),details=[m?.collectionName?'Collection: '+m.collectionName:'','Size: '+size,d.color?'Color: '+d.color:''].filter(Boolean).join('\n');
    return {desc:(doors.length>1?'Garage door #'+(i+1)+' — ':'')+[mf?.name,m?.modelName].filter(Boolean).join(' '),details,qty:1,rate:Number(m?.basePrice)||0,taxable:true};
  });
  openEstimateModal(null,visState.presetCustomerId||undefined,undefined,items);
  toast('Estimate started from design — set door price and add hardware/labor');
};
window.createEstimateFromDesign=createEstimateFromDesign;

const baseApplyAll=toggleVisApplyToAll;
toggleVisApplyToAll=async function(checked){
 checkpoint();
 const selected=visState.doors[visState.activeDoor];
 if(selected?.photoDesignId){visState.applyToAll=!!checked;const target=visState;if(checked)target.doors.slice(0,target.doorCount).forEach(d=>{if(d!==selected){window.PhotoDoor.copyDesign(selected,d);const source=window.PhotoDoor.preferred(d.photoDesignId,d,window.PhotoDoor.choice(selected).source.layout);if(source)d.visualDesign.sourceId=source.id;d.realism={...d.realism,light:1,depth:0,shadows:1};}});render();if(checked)try{await Promise.all(target.doors.slice(0,target.doorCount).map(d=>window.DoorDesign.prepare(d)));if(target===visState&&route.page==='visualizer')render();}catch(e){if(target===visState)toast(e.message,true);}return;}
 if(!selected?.referenceProductId)return baseApplyAll(checked);
 visState.applyToAll=!!checked;
 if(checked)visState.doors.slice(0,visState.doorCount).forEach(d=>{if(d!==selected){syncReferenceFields(d,refDoor(selected));d.visualDesign=selected.visualDesign?{...selected.visualDesign}:undefined;d.visualDesignOverride=!!selected.visualDesignOverride;delete d.designPreview;}});
 const target=visState;render();if(checked)try{await Promise.all(target.doors.slice(0,target.doorCount).map(d=>window.DoorDesign?.prepare(d)));if(target===visState&&route.page==='visualizer')render();}catch(e){if(target===visState)toast(e.message,true);}
};
window.toggleVisApplyToAll=toggleVisApplyToAll;

const visAdminState={search:'',manufacturer:'',collection:'',readiness:'all'};
window.__visAdminState=visAdminState;
function setVisAdminFilter(key,value){visAdminState[key]=value;if(key==='manufacturer')visAdminState.collection='';render()}
window.setVisAdminFilter=setVisAdminFilter;
async function clearVisualizerOverlay(productId){
  if(!IS_OWNER)return toast('Owner access required',true);
  if(!confirm('Remove the Visualizer overlay from this model? The reference product will remain.'))return;
  await dbSet('products',productId,{visualizerOverlayUrl:null,visualizerOverlayId:null,visualizerOverlayAsset:null});
  toast('Overlay removed'); render();
}
window.clearVisualizerOverlay=clearVisualizerOverlay;
renderVisCatalog=function(content,actions){
  if(!IS_OWNER){content.innerHTML=emptyState('🔒','Owner access only','');return}
  actions.innerHTML='<button class="btn btn-primary" onclick="go(\'visualizer\')">Open Visualizer</button>';
  const all=referenceDoors(),ready=all.filter(p=>!!(val(p,'visualizerOverlayUrl')||window.DoorDesign?.choice({referenceProductId:p.id})));
  const manufacturers=[...new Set(all.map(p=>p.manufacturer).filter(Boolean))].sort();
  const collections=[...new Set(all.filter(p=>!visAdminState.manufacturer||p.manufacturer===visAdminState.manufacturer).map(p=>val(p,'collection')).filter(Boolean))].sort();
  let list=all;
  if(visAdminState.manufacturer)list=list.filter(p=>p.manufacturer===visAdminState.manufacturer);
  if(visAdminState.collection)list=list.filter(p=>val(p,'collection')===visAdminState.collection);
  if(visAdminState.readiness==='ready')list=list.filter(p=>!!(val(p,'visualizerOverlayUrl')||window.DoorDesign?.choice({referenceProductId:p.id})));
  if(visAdminState.readiness==='missing')list=list.filter(p=>!val(p,'visualizerOverlayUrl')&&!window.DoorDesign?.choice({referenceProductId:p.id}));
  const q=visAdminState.search.trim().toLowerCase();
  if(q){const ts=q.split(/\s+/).filter(Boolean);list=list.filter(p=>{const hay=[p.name,p.manufacturer,p.model,p.sku,p.details,val(p,'collection'),val(p,'modelNumber'),val(p,'material'),val(p,'construction')].join(' ').toLowerCase();return ts.every(t=>hay.includes(t))})}
  list=list.sort((a,b)=>String(a.manufacturer||'').localeCompare(String(b.manufacturer||''))||String(val(a,'collection')||'').localeCompare(String(val(b,'collection')||''))||String(a.name||'').localeCompare(String(b.name||'')));
  const shown=list.slice(0,120);
  content.innerHTML=`<div class="vga-hero"><div><span>Visualizer Catalog</span><h2>Reference Door Readiness</h2><p>Reference data stays in Products. This page only manages the real overlay image used on customer home photos.</p></div><div class="vga-stats"><div><b>${all.length}</b><span>Reference Models</span></div><div><b>${ready.length}</b><span>Visualizer Ready</span></div><div><b>${all.length-ready.length}</b><span>Need Overlay</span></div></div></div>
  <div class="vga-controls"><input placeholder="Search model, collection, material…" value="${esc(visAdminState.search)}" oninput="setVisAdminFilter('search',this.value)"><select onchange="setVisAdminFilter('manufacturer',this.value)"><option value="">All manufacturers</option>${manufacturers.map(x=>'<option '+(visAdminState.manufacturer===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select><select onchange="setVisAdminFilter('collection',this.value)"><option value="">All collections</option>${collections.map(x=>'<option '+(visAdminState.collection===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select><select onchange="setVisAdminFilter('readiness',this.value)"><option value="all" ${visAdminState.readiness==='all'?'selected':''}>All readiness</option><option value="ready" ${visAdminState.readiness==='ready'?'selected':''}>Visualizer Ready</option><option value="missing" ${visAdminState.readiness==='missing'?'selected':''}>Missing Overlay</option></select></div>
  <div class="vga-result-line"><b>${list.length}</b> matching model${list.length===1?'':'s'}${list.length>shown.length?' · showing first '+shown.length:''}</div>
  <div class="vga-grid">${shown.map(p=>{const img=val(p,'imageUrl'),overlay=val(p,'visualizerOverlayUrl'),isReady=!!(overlay||window.DoorDesign?.choice({referenceProductId:p.id}));return '<article class="vga-card"><div class="vga-image">'+(overlay?'<img src="'+esc(overlay)+'" alt="" class="vga-overlay-img">':img?'<img src="'+esc(img)+'" alt="">':'<div class="vga-placeholder">Garage Door</div>')+'<span class="'+(isReady?'ready':'missing')+'">'+(isReady?'Ready':'Needs Overlay')+'</span></div><div class="vga-copy"><small>'+esc([p.manufacturer,val(p,'collection')].filter(Boolean).join(' · '))+'</small><b>'+esc(p.name)+'</b><p>'+esc([val(p,'material'),val(p,'construction'),val(p,'rValue')?('R-'+val(p,'rValue')):''].filter(Boolean).join(' · '))+'</p><div class="vga-actions"><label class="btn btn-sm">'+(overlay?'Replace Overlay':'Upload Overlay')+'<input hidden type="file" accept="image/png,image/webp,image/jpeg" onchange="uploadVisualizerOverlay(\''+esc(p.id)+'\',this)"></label>'+(overlay?'<button class="btn btn-sm" onclick="clearVisualizerOverlay(\''+esc(p.id)+'\')">Remove</button>':'')+(val(p,'officialUrl')?'<a class="btn btn-sm" href="'+esc(val(p,'officialUrl'))+'" target="_blank" rel="noopener">Official</a>':'')+'</div></div></article>'}).join('')}</div>`;
};
window.renderVisCatalog=renderVisCatalog;

function galleryCover(p){return (p.photos||[]).find(ph=>ph.id===p.coverPhotoId)||(p.photos||[]).find(ph=>ph.tag==='After')||(p.photos||[])[0]}
function galleryBefore(p){return (p.photos||[]).find(ph=>ph.tag==='Before')}
function galleryAfter(p){return (p.photos||[]).find(ph=>ph.tag==='After')||galleryCover(p)}
function premiumViewGalleryProject(id){galleryFilter.presenting=true;galleryFilter.presentIdx=[...STORE.galleryProjects].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).findIndex(p=>p.id===id);galleryFilter.presentPhotoIdx=0;galleryFilter.singlePhoto=false;render()}
window.premiumViewGalleryProject=premiumViewGalleryProject;

renderGallery=function(content,actions){
  actions.innerHTML=canOperateOffice()?'<button class="btn btn-sm" onclick="shareGallery()">Share Gallery</button><button class="btn btn-sm" onclick="startGalleryPresentation()">Present</button><button class="btn btn-primary" onclick="openGalleryProjectModal()">+ New Project</button>':'';
  if(galleryFilter.presenting)return renderGalleryPresentation(content);
  let list=[...STORE.galleryProjects].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)||(b.createdAt-a.createdAt));
  if(galleryFilter.category)list=list.filter(p=>p.category===galleryFilter.category);
  const q=String(galleryFilter.search||'').trim().toLowerCase();
  if(q)list=list.filter(p=>[p.title,p.category,p.city,p.description,p.doorManufacturer,p.doorCollection,p.doorColor,p.panelStyle,p.windowStyle,...(p.tags||[])].some(v=>String(v||'').toLowerCase().includes(q)));
  const cats=['',...GALLERY_CATEGORIES];
  const ba=STORE.galleryProjects.filter(p=>galleryBefore(p)&&galleryAfter(p)).length;
  content.innerHTML=`
    <div class="pg-hero"><div><span>EZfix Showroom</span><h2>Completed Garage Door Projects</h2><p>Use this with customers to compare real styles, colors and completed installations.</p></div><div class="pg-stats"><div><b>${STORE.galleryProjects.length}</b><span>Projects</span></div><div><b>${ba}</b><span>Before / After</span></div><div><b>${new Set(STORE.galleryProjects.map(p=>p.city).filter(Boolean)).size}</b><span>Locations</span></div></div></div>
    <div class="pg-controls"><div class="pg-chips">${cats.map(c=>'<button class="'+(galleryFilter.category===c?'active':'')+'" onclick="galleryFilter.category=\''+esc(c)+'\';render()">'+esc(c||'All')+'</button>').join('')}</div><div class="search-box"><input placeholder="Search style, color, city…" value="${esc(galleryFilter.search||'')}" oninput="galleryFilter.search=this.value;renderPreserveScroll()"></div></div>
    ${list.length?'<div class="pg-grid">'+list.map(p=>{const cover=galleryCover(p),before=galleryBefore(p),after=galleryAfter(p);return '<article class="pg-card"><button class="pg-card-main" onclick="premiumViewGalleryProject(\''+p.id+'\')">'+(cover?'<img loading="lazy" src="'+esc(cover.url)+'" alt="">':'<div class="pg-no-photo">Project</div>')+'<div class="pg-card-overlay"><div><span>'+esc(p.category||'Completed Project')+'</span><h3>'+esc(p.title)+'</h3><p>'+esc([p.doorManufacturer,p.doorCollection,p.doorColor,p.city].filter(Boolean).join(' · '))+'</p></div>'+(before&&after?'<b>Before / After</b>':'')+'</div></button>'+(canOperateOffice()?'<button class="pg-edit" onclick="openGalleryProjectModal(\''+p.id+'\')">Edit</button>':'')+'</article>'}).join('')+'</div>':emptyState('🖼️','No matching projects','Try another filter or add a completed project.')}`;
};
window.renderGallery=renderGallery;

renderGalleryPresentation=function(content){
  const list=[...STORE.galleryProjects].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
  if(!list.length){galleryFilter.presenting=false;content.innerHTML=emptyState('🖼️','No projects to present','');return}
  const idx=Math.max(0,Math.min(galleryFilter.presentIdx||0,list.length-1)),p=list[idx],photos=p.photos||[],pi=Math.max(0,Math.min(galleryFilter.presentPhotoIdx||0,Math.max(0,photos.length-1))),before=galleryBefore(p),after=galleryAfter(p),photo=photos[pi]||after;
  content.innerHTML=`
    <div class="pg-present">
      <div class="pg-present-top"><button class="btn btn-sm" onclick="galleryFilter.presenting=false;render()">Close Showroom</button><div><b>${idx+1} / ${list.length}</b><span>${esc(p.category||'Project')}</span></div>${canOperateOffice()?'<button class="btn btn-sm" onclick="galleryFilter.presenting=false;render();openGalleryProjectModal(\''+p.id+'\')">Edit Project</button>':'<span></span>'}</div>
      <div class="pg-present-stage">
        ${before&&after&&!galleryFilter.singlePhoto?'<div class="pg-ba"><figure><figcaption>BEFORE</figcaption><img src="'+esc(before.url)+'"></figure><figure><figcaption>AFTER</figcaption><img src="'+esc(after.url)+'"></figure></div>':photo?'<img class="pg-feature" src="'+esc(photo.url)+'">':'<div class="pg-no-photo">No photo</div>'}
      </div>
      ${photos.length>1?'<div class="pg-thumbs">'+photos.map((ph,n)=>'<button class="'+(n===pi?'active':'')+'" onclick="galleryFilter.presentPhotoIdx='+n+';galleryFilter.singlePhoto=true;render()"><img src="'+esc(ph.url)+'"></button>').join('')+'</div>':''}
      <div class="pg-present-copy"><span>${esc([p.category,p.city].filter(Boolean).join(' · '))}</span><h1>${esc(p.title)}</h1>${p.description?'<p>'+esc(p.description)+'</p>':''}<div class="pg-specs">${[['Manufacturer',p.doorManufacturer],['Collection / Model',p.doorCollection],['Color',p.doorColor],['Panel / Design',p.panelStyle],['Windows',p.windowStyle],['Insulation',p.insulation]].filter(x=>x[1]).map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')}</div></div>
      <div class="pg-present-nav"><button class="btn" onclick="galleryFilter.presentIdx=${(idx-1+list.length)%list.length};galleryFilter.presentPhotoIdx=0;galleryFilter.singlePhoto=false;render()">← Previous</button><button class="btn btn-primary" onclick="galleryFilter.presentIdx=${(idx+1)%list.length};galleryFilter.presentPhotoIdx=0;galleryFilter.singlePhoto=false;render()">Next Project →</button></div>
    </div>`;
};
window.renderGalleryPresentation=renderGalleryPresentation;
})();
