/* Shared visual designs. Model IDs and insulation stay in the existing Products catalog. */
(() => {
'use strict';
const data=window.DOOR_DESIGN_DATA;
const value=(p,k)=>p?.[k]??p?.appData?.[k]??p?.app_data?.[k]??'';
const finishes={original:{label:'As shown',color:null}};
function profile(p){return data?.profiles[p?.id]||null;}
function family(p){return data?.families[profile(p)?.family]||null;}
function choice(d){
 const p=getOne('products',d?.referenceProductId),pr=profile(p),f=family(p);if(!f)return null;
 const conf=d.visualDesign||{},allowed=f.panels.filter(x=>!x.section&&pr.panels.includes(x.id));
 const panel=allowed.find(x=>x.id===conf.panel)||allowed[0];if(!panel)return null;
 const variant=panel.variants.find(x=>x.id===conf.window)||panel.variants[0];
 const finish=finishes[conf.finish]?conf.finish:'original';
 const width=Number(d.customSize?d.customWidth:d.width)||8,height=Number(d.customSize?d.customHeight:d.height)||7;
 return {p,pr,f,panel,variant,finish,width,height,key:[p.id,panel.id,variant.id,finish,width,height].join('|')};
}
function assetUrl(id){const a=data?.assets[id];return a?(a.external?a.url:'/assets/door-designs/'+(a.file||id+'.jpg')):'';}
function source(c){if(!c)return '';const v=c.variant;return assetUrl((c.width>=12?v.double:v.single)||v.single||v.double);}
function defaultImage(p){return source(choice({referenceProductId:p?.id,width:8,height:7}))||assetUrl(profile(p)?.catalogPhoto);}
function overlay(d){const c=choice(d);return c?(d.designPreview?.key===c.key?d.designPreview.url:source(c)):'';}
function normalize(d){const c=choice(d);if(c)d.visualDesign={panel:c.panel.id,window:c.variant.id,finish:c.finish};return c;}
const cache=new Map();
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>reject(new Error('Door image could not be loaded. Please try again.')),15000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);reject(new Error('Door image could not be loaded. Please try again.'))};img.src=url;});}
async function prepare(d){
 const c=normalize(d);if(!c)return null;if(value(c.p,'visualizerOverlayUrl')&&!d.visualDesignOverride)return null;if(d.designPreview?.key===c.key)return d.designPreview;
 const key=c.key;
 let promise=cache.get(key);
 if(!promise){promise=(async()=>{
  const img=await loadImage(source(c));const cv=document.createElement('canvas');cv.width=800;cv.height=Math.round(800*Math.min(2,Math.max(.25,c.height/c.width)));const ctx=cv.getContext('2d');
  ctx.drawImage(img,0,0,cv.width,cv.height);
  return {key,url:cv.toDataURL('image/png'),label:[c.panel.label,c.variant.label,finishes[c.finish].label].join(' · '),illustrative:!!c.panel.illustrative||c.finish!=='original',modelId:c.p.id};
 })();cache.set(key,promise);promise.catch(()=>cache.delete(key));if(cache.size>40)cache.delete(cache.keys().next().value);}
 const preview=await promise;if(choice(d)?.key===key)d.designPreview=preview;return preview;
}
function modelLabel(p){return [value(p,'modelNumber')||p.name,value(p,'insulationType'),value(p,'rValue')?'R-'+value(p,'rValue'):'',value(p,'layers')?value(p,'layers')+' layers':''].filter(Boolean).join(' · ');}
function windowLabel(panel,variant){return variant.id===panel.id?'Closed / no windows':variant.label;}
function controls(d,idx){
 const c=normalize(d);if(!c)return '';
 const models=STORE.products.filter(p=>profile(p)?.family===c.f.id);
 const panels=c.f.panels.filter(x=>!x.section&&models.some(p=>profile(p).panels.includes(x.id)));
 const compatible=models.filter(p=>profile(p).panels.includes(c.panel.id));
 const option=(id,label,sel)=>'<option value="'+esc(id)+'" '+(id===sel?'selected':'')+'>'+esc(label)+'</option>';
 const tile=(key,id,label,url,sel)=>'<button type="button" class="vd-choice '+(sel?'active':'')+'" aria-pressed="'+sel+'" data-choice="'+esc(id)+'" onclick="setVisDesignOption('+idx+',\''+key+'\',this.dataset.choice)"><img loading="lazy" src="'+esc(url)+'" alt=""><span>'+esc(label)+'</span></button>';
 return '<section class="vd-config"><div class="vd-config-head"><b>Design your door</b><span>'+esc(c.f.label)+'</span></div><div class="vd-config-fields">'+
 '<div class="vd-design-group"><label>Panel / design<select id="visPanelSelect" onchange="setVisDesignOption('+idx+',\'panel\',this.value)">'+panels.map(p=>option(p.id,p.label,c.panel.id)).join('')+'</select></label><div class="vd-choice-grid">'+panels.map(p=>tile('panel',p.id,p.label,source({...c,variant:p.variants[0]}),p.id===c.panel.id)).join('')+'</div></div>'+
 '<div class="vd-design-group"><label>Windows<select id="visWindowSelect" onchange="setVisDesignOption('+idx+',\'window\',this.value)">'+c.panel.variants.map(v=>option(v.id,windowLabel(c.panel,v),c.variant.id)).join('')+'</select></label>'+(c.panel.variants.length>1?'<div class="vd-choice-grid vd-windows">'+c.panel.variants.map(v=>tile('window',v.id,windowLabel(c.panel,v),source({...c,variant:v}),v.id===c.variant.id)).join('')+'</div>':'')+'</div>'+
 '<label>Width (ft)<input id="visDesignWidth" type="number" min="4" max="30" step=".5" value="'+c.width+'" onchange="setVisDesignOption('+idx+',\'width\',this.value)"></label>'+
 '<label>Height (ft)<input id="visDesignHeight" type="number" min="4" max="20" step=".5" value="'+c.height+'" onchange="setVisDesignOption('+idx+',\'height\',this.value)"></label>'+
 '<label>Model / insulation<select id="visInsulationSelect" onchange="setVisDesignOption('+idx+',\'model\',this.value)">'+compatible.map(p=>option(p.id,modelLabel(p),c.p.id)).join('')+'</select></label>'+
 '</div>'+
 '<p class="vd-disclosure">'+(c.panel.illustrative?'Illustrative design preview. Confirm the exact panel, window and finish availability for this model.':'Manufacturer design image. Layout preview based on the manufacturer design. Panel proportions vary with size.')+'</p></section>';
}
async function setOption(idx,key,val){
 const d=visState.doors[idx],c=normalize(d);if(!c)return;
 if(key==='panel'){
  const pan=c.f.panels.find(p=>p.id===val);if(!pan)return;
  const compatible=STORE.products.filter(p=>profile(p)?.family===c.f.id&&profile(p).panels.includes(val));
  const next=compatible.find(p=>p.id===c.p.id)||compatible.find(p=>String(value(p,'rValue'))===String(value(c.p,'rValue'))&&String(value(p,'layers'))===String(value(c.p,'layers')))||compatible[0];if(!next)return;
  d.referenceProductId=next.id;d.construction=value(next,'construction');d.visualDesign={...d.visualDesign,panel:val,window:pan.variants.some(v=>v.id===d.visualDesign.window)?d.visualDesign.window:pan.variants[0].id};
 }else if(key==='model'){
  const next=getOne('products',val);if(profile(next)?.family!==c.f.id||!profile(next).panels.includes(c.panel.id))return;d.referenceProductId=val;d.construction=value(next,'construction');
 }else if(key==='window'){if(!c.panel.variants.some(v=>v.id===val))return;d.visualDesign.window=val;
 }else if(key==='width'||key==='height'){const n=Number(val);if(!Number.isFinite(n)||n<4||n>(key==='width'?30:20))return toast('Enter a valid door dimension.',true);d.width=c.width;d.height=c.height;d.customSize=false;d[key]=n;
 }else if(key==='finish'){if(!finishes[val])return;d.visualDesign.finish=val;}else return;
 d.visualDesignOverride=true;
 if(visState.applyToAll)visState.doors.slice(0,visState.doorCount).forEach(x=>{if(x!==d){x.referenceProductId=d.referenceProductId;x.modelId='';x.visualDesign={...d.visualDesign};x.visualDesignOverride=true;x.construction=d.construction;}});
 render();
 try{await Promise.all(visState.doors.slice(0,visState.doorCount).map(prepare));if(route.page==='visualizer'&&(visState.step===3||visState.step===4))render();}catch(e){toast(e.message,true);}
}
function groupModels(items){const map=new Map();for(const p of items){const f=family(p),key=f?f.id+'|'+profile(p).panels.join(','):p.id;if(!map.has(key))map.set(key,p);}return [...map.values()];}
function description(d){const c=choice(d);if(!c)return '';return [c.panel.label,c.variant.label,finishes[c.finish].label+' finish'+(c.finish!=='original'?' preview':''),c.panel.illustrative?'Illustrative configuration — verify availability':'Manufacturer design'].join(' · ');}
function imageLabel(p){const f=family(p),pr=profile(p);return pr?.awaitingVerifiedPhoto?'Verified model photo pending':f?.panels.some(x=>x.illustrative)?'Model illustration':pr?.photoScope==='Collection example'?'Manufacturer collection example':f?.panels.some(x=>x.section)?'Manufacturer panel sample':'Manufacturer reference';}
window.DoorDesign={imageLabel,data,profile,family,choice,source,defaultImage,overlay,normalize,prepare,controls,groupModels,description,loadImage};
window.setVisDesignOption=setOption;
})();
