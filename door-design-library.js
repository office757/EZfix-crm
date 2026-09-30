/* Shared visual designs. Model IDs and insulation stay in the existing Products catalog. */
(() => {
'use strict';
const data=window.DOOR_DESIGN_DATA;
const value=(p,k)=>p?.[k]??p?.appData?.[k]??p?.app_data?.[k]??'';
const originalFinish={id:'original',label:'As shown',hex:''};
const isClosed=(panel,v)=>v.id===panel.id||/closed|no windows/i.test(v.label);
function profile(p){return data?.profiles[p?.id]||null;}
function family(p){return data?.families[profile(p)?.family]||null;}
function choice(d){
 const p=getOne('products',d?.referenceProductId),pr=profile(p),f=family(p);if(!f)return null;
 const conf=d.visualDesign||{},allowed=f.panels.filter(x=>!x.section&&pr.panels.includes(x.id));
 const panel=allowed.find(x=>x.id===conf.panel)||allowed[0];if(!panel)return null;
 const variant=panel.variants.find(x=>x.id===conf.window)||panel.variants[0];
 const catalog=window.DOOR_CONFIG_OPTIONS?.[f.id]||{},options=catalog.panels?.[panel.id]||{};
 const colors=[originalFinish,...(options.colors||[])],color=colors.find(x=>x.id===conf.finish)||originalFinish,finish=color.id;
 const glass=(catalog.glass||[]).find(x=>x.id===conf.glass)||null,hardware=(catalog.hardware||[]).find(x=>x.id===conf.hardware)||null;
 const width=Number(d.customSize?d.customWidth:d.width)||8,height=Number(d.customSize?d.customHeight:d.height)||7;
 return {p,pr,f,panel,variant,finish,color,colors,catalog,options,glass,hardware,width,height,key:['finish-v3',p.id,panel.id,variant.id,finish,width,height].join('|')};
}
function assetUrl(id){const a=data?.assets[id];return a?(a.external?a.url:'/assets/door-designs/'+(a.file||id+'.jpg')):'';}
function source(c){if(!c)return '';const v=c.variant;return assetUrl((c.width>=12?v.double:v.single)||v.single||v.double);}
function defaultImage(p){return source(choice({referenceProductId:p?.id,width:8,height:7}))||assetUrl(profile(p)?.catalogPhoto);}
function overlay(d){const c=choice(d);return c?(d.designPreview?.key===c.key?d.designPreview.url:source(c)):'';}
function normalize(d){const c=choice(d);if(c)d.visualDesign={panel:c.panel.id,window:c.variant.id,finish:c.finish,glass:isClosed(c.panel,c.variant)?'':c.glass?.id||'',hardware:c.hardware?.id||''};return c;}
const cache=new Map();
function glassGeometry(rgba,w,h){
 const mask=new Uint8Array(w*h),regions=[],seen=new Uint8Array(w*h),limit=Math.floor(h*.35),queue=new Int32Array(w*limit);
 for(let y=0;y<limit;y++)for(let x=0;x<w;x++){
  const start=y*w+x,i=start*4;if(seen[start]||(rgba[i]+rgba[i+1]+rgba[i+2])/3>=100||rgba[i+3]<200)continue;
  let n=1,at=0,minX=x,maxX=x,minY=y,maxY=y;queue[0]=start;seen[start]=1;
  while(at<n){const p=queue[at++],px=p%w,py=Math.floor(p/w);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
   for(const next of [px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<limit-1?p+w:-1]){if(next<0||seen[next])continue;const j=next*4;if(rgba[j+3]>=200&&(rgba[j]+rgba[j+1]+rgba[j+2])/3<100){seen[next]=1;queue[n++]=next;}}
  }
  if(n<w*h*.0003||maxY-minY<h*.015||maxX-minX<w*.012||maxX-minX>w*.65||maxY-minY>h*.28)continue;
  regions.push({x:minX/w,y:minY/h,width:(maxX-minX+1)/w,height:(maxY-minY+1)/h});
  // Keep the complete pane, including bright reflections and insert bars.
  // Thin embossed panel lines cannot qualify as a pane above.
  for(let yy=Math.max(0,minY-1);yy<=Math.min(h-1,maxY+1);yy++)for(let xx=Math.max(0,minX-1);xx<=Math.min(w-1,maxX+1);xx++)mask[yy*w+xx]=1;
 }
 return {mask,regions};
}
const glassMask=(rgba,w,h)=>glassGeometry(rgba,w,h).mask;
function recolor(rgba,w,h,rgb,sample,windows){
 const glass=windows?glassMask(rgba,w,h):null;
 for(let i=0;i<rgba.length;i+=4){
  if(!rgba[i+3]||glass?.[i/4])continue;
  const lum=(rgba[i]+rgba[i+1]+rgba[i+2])/3,spread=Math.max(rgba[i],rgba[i+1],rgba[i+2])-Math.min(rgba[i],rgba[i+1],rgba[i+2]);if(spread>45)continue;
  const target=rgb||[sample[i],sample[i+1],sample[i+2]],targetLum=(target[0]+target[1]+target[2])/3,shade=lum/235,highlight=Math.max(0,lum-225)*(.15+.45*(1-targetLum/255));
  for(let ch=0;ch<3;ch++)rgba[i+ch]=Math.min(255,target[ch]*shade+highlight);
 }
}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>reject(new Error('Door image could not be loaded. Please try again.')),15000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(new Error('Door image could not be loaded. Please try again.'))};img.src=url;});}
async function prepare(d){
 const c=normalize(d);if(!c)return null;if(value(c.p,'visualizerOverlayUrl')&&!d.visualDesignOverride)return null;if(d.designPreview?.key===c.key)return d.designPreview;
 const key=c.key;
 let promise=cache.get(key);
 if(!promise){promise=(async()=>{
  const img=await loadImage(source(c));const cv=document.createElement('canvas');cv.width=Math.min(1600,Math.max(800,img.naturalWidth));cv.height=Math.round(cv.width*Math.min(2,Math.max(.25,c.height/c.width)));const ctx=cv.getContext('2d');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,cv.width,cv.height);
  const panes=!isClosed(c.panel,c.variant)&&typeof ctx.getImageData==='function'?glassGeometry(ctx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height).regions:[];
  if(c.finish!=='original'){
   const pixels=ctx.getImageData(0,0,cv.width,cv.height),rgba=pixels.data;
   let rgb=/^#[0-9a-f]{6}$/i.test(c.color.hex)?c.color.hex.slice(1).match(/../g).map(x=>parseInt(x,16)):null,texture=null;
   if(!rgb&&c.color.image){const swatch=await loadImage(c.color.image),tile=document.createElement('canvas');tile.width=cv.width;tile.height=cv.height;const tc=tile.getContext('2d');tc.drawImage(swatch,0,0,tile.width,tile.height);texture=tc.getImageData(0,0,tile.width,tile.height).data;}
   if(rgb||texture){recolor(rgba,cv.width,cv.height,rgb,texture,!isClosed(c.panel,c.variant));ctx.putImageData(pixels,0,0);}
  }
  return {key,url:cv.toDataURL('image/png'),glassRegions:panes,label:[c.panel.label,c.variant.label,c.color.label].join(' · '),illustrative:!!c.panel.illustrative||c.finish!=='original',modelId:c.p.id};
 })();cache.set(key,promise);promise.catch(()=>cache.delete(key));if(cache.size>40)cache.delete(cache.keys().next().value);}
 const preview=await promise;if(choice(d)?.key===key)d.designPreview=preview;return preview;
}
function modelLabel(p){return [value(p,'modelNumber')||p.name,value(p,'insulationType'),value(p,'rValue')?'R-'+value(p,'rValue'):'',value(p,'layers')?value(p,'layers')+' layers':''].filter(Boolean).join(' · ');}
function windowLabel(panel,variant){return variant.id===panel.id?'Closed / no windows':variant.label;}
function optionSection(label,current,body){return '<details class="studio-option" name="door-configuration"><summary><span>'+esc(label)+'</span><b>'+esc(current)+'</b></summary><div class="studio-option-body">'+body+'</div></details>';}
function controls(d,idx){
 const c=normalize(d);if(!c)return '';
 const models=STORE.products.filter(p=>profile(p)?.family===c.f.id);
 const panels=c.f.panels.filter(x=>!x.section&&models.some(p=>profile(p).panels.includes(x.id)));
 const compatible=models.filter(p=>profile(p).panels.includes(c.panel.id));
 const option=(id,label,sel)=>'<option value="'+esc(id)+'" '+(id===sel?'selected':'')+'>'+esc(label)+'</option>';
 const tile=(key,id,label,url,sel,hex)=>'<button type="button" class="vd-choice '+(sel?'active':'')+'" aria-pressed="'+sel+'" data-choice="'+esc(id)+'" onclick="setVisDesignOption('+idx+',\''+key+'\',this.dataset.choice)">'+(url?'<img loading="lazy" src="'+esc(url)+'" alt="">':'<i class="studio-color-chip" style="background:'+(/^#[0-9a-f]{6}$/i.test(hex)?hex:'#f0efee')+'"></i>')+'<span>'+esc(label)+'</span></button>';
 const select=(id,key,items,selected)=>'<select id="'+id+'" aria-label="'+key+'" onchange="setVisDesignOption('+idx+',\''+key+'\',this.value)">'+items.map(x=>option(x.id,x.label,selected)).join('')+'</select>';
 const closed=isClosed(c.panel,c.variant),windows=c.panel.variants.filter(v=>isClosed(c.panel,v)===closed),hasWindows=c.panel.variants.some(v=>!isClosed(c.panel,v));
 let body=optionSection('Door design',c.panel.label,select('visPanelSelect','panel',panels,c.panel.id)+'<div class="vd-choice-grid">'+panels.map(p=>tile('panel',p.id,p.label,source({...c,variant:p.variants[0]}),p.id===c.panel.id)).join('')+'</div>');
 body+=optionSection('Color',c.color.label,select('visColorSelect','finish',c.colors,c.finish)+'<div class="vd-choice-grid studio-color-grid">'+c.colors.map(x=>tile('finish',x.id,x.label,x.image,x.id===c.finish,x.hex)).join('')+'</div>');
 if(hasWindows&&c.panel.variants.some(v=>isClosed(c.panel,v)))body+=optionSection('Window placement',closed?'Closed':'Top',select('visPlacementSelect','placement',[{id:'closed',label:'Closed / no windows'},{id:'top',label:'Top section'}],closed?'closed':'top'));
 body+=optionSection('Window design',windowLabel(c.panel,c.variant),select('visWindowSelect','window',windows.map(v=>({id:v.id,label:windowLabel(c.panel,v)})),c.variant.id)+'<div class="vd-choice-grid vd-windows">'+windows.map(v=>tile('window',v.id,windowLabel(c.panel,v),source({...c,variant:v}),v.id===c.variant.id)).join('')+'</div>');
 if(!closed&&c.catalog.glass?.length)body+=optionSection('Glass',c.glass?.label||'As shown',select('visGlassSelect','glass',[{id:'',label:'As shown'},...c.catalog.glass],c.glass?.id||'')+'<div class="vd-choice-grid">'+c.catalog.glass.map(x=>tile('glass',x.id,x.label,x.image,x.id===c.glass?.id)).join('')+'</div>');
 body+=optionSection('Construction',modelLabel(c.p),select('visInsulationSelect','model',compatible.map(p=>({id:p.id,label:modelLabel(p)})),c.p.id));
 if(c.catalog.hardware?.length)body+=optionSection('Decorative hardware',c.hardware?.label||'None',select('visHardwareSelect','hardware',[{id:'',label:'None'},...c.catalog.hardware],c.hardware?.id||'')+'<div class="vd-choice-grid">'+c.catalog.hardware.map(x=>tile('hardware',x.id,x.label,x.image,x.id===c.hardware?.id)).join('')+'</div>');
 return '<section class="vd-config">'+body+'<p class="vd-disclosure">'+(c.panel.illustrative?'Illustrative design. Confirm model availability.':'Manufacturer panel and window references. Colors are a visual approximation.')+(c.glass||c.hardware?' Glass and hardware are recorded in the specification; the home preview keeps the catalog image for these details.':'')+'</p></section>';
}
async function setOption(idx,key,val){
 const d=visState.doors[idx],c=normalize(d);if(!c)return;
 const target=visState,mark=()=>window.VisualizerEdits?.checkpoint();
 if(key==='panel'){
  const pan=c.f.panels.find(p=>p.id===val);if(!pan)return;
  const compatible=STORE.products.filter(p=>profile(p)?.family===c.f.id&&profile(p).panels.includes(val));
  const next=compatible.find(p=>p.id===c.p.id)||compatible.find(p=>String(value(p,'rValue'))===String(value(c.p,'rValue'))&&String(value(p,'layers'))===String(value(c.p,'layers')))||compatible[0];if(!next)return;
  mark();d.referenceProductId=next.id;d.construction=value(next,'construction');d.visualDesign={...d.visualDesign,panel:val,window:pan.variants.some(v=>v.id===d.visualDesign.window)?d.visualDesign.window:pan.variants[0].id};
 }else if(key==='model'){
  const next=getOne('products',val);if(profile(next)?.family!==c.f.id||!profile(next).panels.includes(c.panel.id))return;mark();d.referenceProductId=val;d.construction=value(next,'construction');
 }else if(key==='window'){if(!c.panel.variants.some(v=>v.id===val))return;mark();d.visualDesign.window=val;d.visualDesign.glass='';
 }else if(key==='placement'){if(!['closed','top'].includes(val))return;const v=c.panel.variants.find(x=>isClosed(c.panel,x)===(val==='closed'));if(!v)return;mark();d.visualDesign.window=v.id;d.visualDesign.glass='';
 }else if(key==='glass'||key==='hardware'){if(val&&!(c.catalog[key]||[]).some(x=>x.id===val))return;if(key==='glass'&&isClosed(c.panel,c.variant))return;mark();d.visualDesign[key]=val;
 }else if(key==='width'||key==='height'){const n=Number(val);if(!Number.isFinite(n)||n<4||n>(key==='width'?30:20))return toast('Enter a valid door dimension.',true);mark();d.width=c.width;d.height=c.height;d.customSize=false;d[key]=n;
 }else if(key==='finish'){if(!c.colors.some(x=>x.id===val))return;mark();d.visualDesign.finish=val;}else return;
 d.visualDesignOverride=true;
 if(visState.applyToAll)visState.doors.slice(0,visState.doorCount).forEach(x=>{if(x!==d){x.referenceProductId=d.referenceProductId;x.modelId='';x.visualDesign={...d.visualDesign};x.visualDesignOverride=true;x.construction=d.construction;}});
 render();
 try{await Promise.all(target.doors.slice(0,target.doorCount).map(prepare));if(target===visState&&route.page==='visualizer'&&(visState.step===3||visState.step===4))render();}catch(e){if(target===visState)toast(e.message,true);}
}
function groupModels(items){const map=new Map();for(const p of items){const f=family(p),key=f?f.id:p.id;if(!map.has(key))map.set(key,p);}return [...map.values()];}
function description(d){const c=choice(d);if(!c)return '';return [c.panel.label,windowLabel(c.panel,c.variant),c.color.label+' finish',c.glass?'Glass: '+c.glass.label:'',c.hardware?'Hardware: '+c.hardware.label:'',c.panel.illustrative?'Illustrative configuration — verify availability':'Manufacturer design'].filter(Boolean).join(' · ');}
function imageLabel(p){const f=family(p),pr=profile(p);return pr?.awaitingVerifiedPhoto?'Verified model photo pending':f?.panels.some(x=>x.illustrative)?'Model illustration':pr?.photoScope==='Collection example'?'Manufacturer collection example':f?.panels.some(x=>x.section)?'Manufacturer panel sample':'Manufacturer reference';}
window.DoorDesign={imageLabel,data,profile,family,choice,source,defaultImage,overlay,normalize,prepare,controls,groupModels,description,loadImage,optionSection,modelLabel,isClosed,recolor,glassMask,glassGeometry};
window.setVisDesignOption=setOption;
})();
