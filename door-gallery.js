/* Shared door photos: catalog identity, selected variant, and document snapshot. */
'use strict';
function doorValue(p,key){return p?.[key] ?? p?.appData?.[key] ?? p?.app_data?.[key] ?? p?.app_data?.[camelToSnake(key)] ?? '';}
function safeDoorImageUrl(value){
  const s=String(value||'');if(!s)return '';
  if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s))return s;
  try{const u=new URL(s,location.origin);return u.protocol==='https:' || (u.origin===location.origin && u.protocol==='http:')?u.href:'';}catch{return '';}
}
function catalogDoorImage(p){
  const asset=doorValue(p,'imageAsset');
  return {id:asset?.id||null,url:safeDoorImageUrl(asset?.url||(window.DoorDesign?.profile(p)?window.DoorDesign.defaultImage(p):doorValue(p,'imageUrl'))),label:[p?.name||'Garage door',!asset?.url?window.DoorDesign?.imageLabel(p):''].filter(Boolean).join(' · ')};
}
function documentDoorImage(li){return safeDoorImageUrl(li?.imageDataUrl||li?.doorImage?.url);}
function doorImageHtml(li){
  const url=documentDoorImage(li);
  return url?'<figure class="doc-door-photo"><img src="'+esc(url)+'" alt="'+esc(li?.doorImage?.label||li.desc||'Selected door')+'"><figcaption>'+esc(li?.imageCaption||'Selected door')+'</figcaption></figure>':'';
}
async function freezeDoorImage(li){
  const src=documentDoorImage(li); if(!src||li.imageDataUrl)return li;
  const img=new Image();img.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Door photo could not be loaded. Check the photo and try saving again.')),10000);
    img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(new Error('Door photo could not be loaded. Check the photo and try saving again.'));};img.src=src;
  });
  const scale=Math.min(1,640/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/jpeg',.85);
  return {...li,imageDataUrl:data,doorImage:{id:li.doorImage?.id||null,label:li.doorImage?.label||li.desc||'Selected door'}};
}

const doorGalleryState={view:'doors',search:'',size:'',color:'',type:'',manufacturer:'',page:0};
function galleryDoorProducts(){return STORE.products.filter(p=>doorValue(p,'catalogKind')==='garage_door_model');}
function gallerySize(p){return doorValue(p,'doorSize')||doorValue(p,'fullSize')||'';}
function galleryColor(p){return doorValue(p,'doorColor')||doorValue(p,'color')||'';}
function galleryType(p){return doorValue(p,'doorType')||doorValue(p,'panelStyle')||'';}
function filteredGalleryDoors(){
  const q=doorGalleryState.search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return galleryDoorProducts().filter(p=>(!doorGalleryState.size||gallerySize(p)===doorGalleryState.size)&&(!doorGalleryState.color||galleryColor(p)===doorGalleryState.color)&&(!doorGalleryState.type||galleryType(p)===doorGalleryState.type)&&(!doorGalleryState.manufacturer||p.manufacturer===doorGalleryState.manufacturer)&&q.every(t=>[p.name,p.manufacturer,p.model,gallerySize(p),galleryColor(p),galleryType(p),doorValue(p,'collection')].join(' ').toLowerCase().includes(t))).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function setDoorGalleryFilter(key,value){
  const focused=document.activeElement?.id,caret=document.activeElement?.selectionStart;
  doorGalleryState[key]=value;doorGalleryState.page=0;render();
  if(focused){const input=document.getElementById(focused);input?.focus();if(typeof caret==='number')input?.setSelectionRange?.(caret,caret);}
}
function doorGallerySelect(label,key,values){
  const unique=[...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
  return '<label><span>'+label+'</span><select onchange="setDoorGalleryFilter(\''+key+'\',this.value)"><option value="">All '+label.toLowerCase()+'</option>'+unique.map(v=>'<option value="'+esc(v)+'" '+(doorGalleryState[key]===v?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select></label>';
}
const originalProjectGallery=renderGallery;
const DOOR_STYLE_EXAMPLES=[['classic-white','Classic White','White raised panels'],['modern-black','Modern Black','Flush panels · vertical windows'],['wood-carriage','Wood-look Carriage','Walnut finish · top windows'],['glass-fullview','Full-view Glass','Black frame · frosted glass'],['single-white','Single · Classic White','Single-car · raised panels'],['single-black','Single · Modern Black','Single-car · flush panels · vertical windows'],['single-gray','Single · Charcoal Gray','Single-car · long panels · top windows'],['single-wood','Single · Wood-look Carriage','Single-car · walnut finish · top windows']];
renderGallery=function(content,actions){
  if(galleryFilter.presenting)return originalProjectGallery(content,actions);
  if(doorGalleryState.view==='projects')originalProjectGallery(content,actions);
  else if(doorGalleryState.view==='inspiration'){
    actions.innerHTML='';
    content.innerHTML='<section class="dg-heading"><div><span>Style Inspiration</span><h2>Explore garage door styles</h2><p>AI-generated style illustrations. Select an actual catalog model to confirm the specifications and prepare an estimate.</p></div></section><div class="dg-grid">'+DOOR_STYLE_EXAMPLES.map(([id,name,detail])=>'<article class="dg-card"><img class="dg-style-image" src="/assets/door-styles/'+id+'.png" alt="'+name+' garage door illustration"><div class="dg-card-body"><small>AI illustration</small><h3>'+name+'</h3><p>'+detail+'</p></div></article>').join('')+'</div>';
  }
  else {
    actions.innerHTML=canOperateOffice()?'<button class="btn" onclick="go(\'viscatalog\')">Manage Visualizer</button><button class="btn btn-primary" onclick="openGalleryProjectModal()">+ Upload Photos</button>':'';
    const all=galleryDoorProducts(),filtered=filteredGalleryDoors(),pageSize=24;
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));doorGalleryState.page=Math.min(doorGalleryState.page,pages-1);
    const shown=filtered.slice(doorGalleryState.page*pageSize,(doorGalleryState.page+1)*pageSize);
    content.innerHTML='<section class="dg-heading"><div><span>EZfix Showroom</span><h2>Find the right garage door</h2><p>Browse models, compare finishes, and add the selected door to an estimate.</p></div><div><b>'+all.length+'</b><span>Catalog models</span></div></section>'+
      '<div class="dg-filters"><label class="dg-search"><span>Search models</span><input id="doorGallerySearch" placeholder="Model, collection, style…" value="'+esc(doorGalleryState.search)+'" oninput="setDoorGalleryFilter(\'search\',this.value)"></label>'+doorGallerySelect('Sizes','size',all.map(gallerySize))+doorGallerySelect('Colors','color',all.map(galleryColor))+doorGallerySelect('Types','type',all.map(galleryType))+doorGallerySelect('Manufacturers','manufacturer',all.map(p=>p.manufacturer))+'</div>'+
      '<div class="dg-results"><span>'+filtered.length+' matching models</span><button class="btn btn-sm" onclick="Object.assign(doorGalleryState,{search:\'\',size:\'\',color:\'\',type:\'\',manufacturer:\'\',page:0});render()">Clear filters</button></div>'+
      (shown.length?'<div class="dg-grid">'+shown.map(p=>{
        const img=catalogDoorImage(p),meta=[gallerySize(p),galleryColor(p),galleryType(p)].filter(Boolean);
        return '<article class="dg-card"><button class="dg-picture" data-product-id="'+esc(p.id)+'" onclick="viewDoorModel(this.dataset.productId)">'+(img.url?'<img src="'+esc(img.url)+'" loading="lazy" alt="'+esc(p.name)+'">':'<span class="dg-awaiting">Photo coming soon<small>'+esc(p.manufacturer||'Garage door')+'</small></span>')+'</button><div class="dg-card-body"><small>'+esc([p.manufacturer,doorValue(p,'collection')].filter(Boolean).join(' · '))+'</small><h3>'+esc(p.name)+'</h3><small>'+esc(!doorValue(p,'imageAsset')?.url?window.DoorDesign?.imageLabel(p)||'':'')+'</small><p>'+esc(meta.join(' · ')||'Select a model to view details')+'</p><button class="btn btn-sm" data-product-id="'+esc(p.id)+'" onclick="viewDoorModel(this.dataset.productId)">View Door</button></div></article>';
      }).join('')+'</div>':emptyState('🖼️','No matching doors','Try another size, color or type.'))+
      (pages>1?'<div class="dg-pagination"><button class="btn" '+(!doorGalleryState.page?'disabled':'')+' onclick="doorGalleryState.page--;render();window.scrollTo(0,0)">Previous</button><span>Page '+(doorGalleryState.page+1)+' of '+pages+'</span><button class="btn" '+(doorGalleryState.page>=pages-1?'disabled':'')+' onclick="doorGalleryState.page++;render();window.scrollTo(0,0)">Next</button></div>':'');
  }
  content.insertAdjacentHTML('afterbegin','<div class="dg-tabs" role="group" aria-label="Gallery view"><button class="'+(doorGalleryState.view==='doors'?'active':'')+'" onclick="doorGalleryState.view=\'doors\';render()">Door Catalog</button><button class="'+(doorGalleryState.view==='projects'?'active':'')+'" onclick="doorGalleryState.view=\'projects\';render()">Project Photos</button><button class="'+(doorGalleryState.view==='inspiration'?'active':'')+'" onclick="doorGalleryState.view=\'inspiration\';render()">Style Inspiration</button></div>');
};
window.renderGallery=renderGallery;
function viewDoorModel(id){
  const p=getOne('products',id);if(!p)return;
  const photos=STORE.galleryProjects.filter(g=>doorValue(g,'referenceProductId')===id);
  const img=catalogDoorImage(p);
  showModal({title:p.name,wide:true,body:(img.url?'<img class="dg-model-image" src="'+esc(img.url)+'" alt="'+esc(p.name)+'">':'')+'<p class="muted" style="font-size:11px">'+esc(!doorValue(p,'imageAsset')?.url?window.DoorDesign?.imageLabel(p)||'':'')+'</p><div class="dg-model-specs">'+[['Manufacturer',p.manufacturer],['Collection',doorValue(p,'collection')],['Size',gallerySize(p)],['Color',galleryColor(p)],['Type',galleryType(p)],['Construction',doorValue(p,'construction')]].filter(x=>x[1]).map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+'</div><p>'+esc(p.details||'')+'</p>'+(photos.length?'<h3>Photos of this model</h3><div class="dg-linked-photos">'+photos.map(g=>{const ph=(g.photos||[]).find(x=>x.id===g.coverPhotoId)||(g.photos||[])[0];return ph?'<button data-gallery-id="'+esc(g.id)+'" onclick="createEstimateFromGallery(this.dataset.galleryId)"><img src="'+esc(ph.url)+'" alt="'+esc(g.title)+'"><span>'+esc([g.doorColor,gallerySize(g)].filter(Boolean).join(' · ')||g.title)+'</span><small>Use this door in an estimate</small></button>':'';}).join('')+'</div>':'')+(canOperateOffice()?'<button class="btn" data-product-id="'+esc(id)+'" onclick="closeModal();openGalleryProjectModal(null,null,this.dataset.productId)">+ Add Model Photos</button>':''),onSave:async()=>{closeModal();openEstimateModal(null,undefined,undefined,[doorCatalogLine(p)]);}});
  document.getElementById('modalSaveBtn').textContent='Use in Estimate';
}
function doorCatalogLine(p){return {desc:p.name,details:p.details||'',qty:p.defaultQty||1,rate:Number(p.rate)||0,taxable:p.taxable!==false,productId:p.id,catalogItemId:p.id,doorImage:catalogDoorImage(p)};}
function createEstimateFromGallery(id){
  const g=getOne('galleryProjects',id),p=g?getOne('products',doorValue(g,'referenceProductId')):null;
  if(!p)return toast('Link this photo to a catalog model first',true);
  const ph=(g.photos||[]).find(x=>x.id===g.coverPhotoId)||(g.photos||[]).find(x=>x.tag==='After')||(g.photos||[])[0];
  const line=doorCatalogLine(p),specs=[g.doorColor?'Color: '+g.doorColor:'',gallerySize(g)?'Size: '+gallerySize(g):'',galleryType(g)?'Style: '+galleryType(g):''].filter(Boolean);
  line.details=[line.details,...specs].filter(Boolean).join('\n');line.galleryProjectId=g.id;
  if(ph){line.doorImage={id:ph.id,url:ph.url,label:g.title};line.imageCaption=specs.join(' · ')||g.title;}
  closeModal();openEstimateModal(null,undefined,undefined,[line]);
}

function renderSocialPosts(content,actions){
  if(window.OfficeWorkspace)return OfficeWorkspace.renderSocial(content,actions);
  actions.innerHTML='';if(!IS_OWNER){content.innerHTML=emptyState('🔒','Owner access only','');return;}
  content.innerHTML='<section class="dg-heading"><div><span>Social Media</span><h2>Social Media Posts</h2><p>Instagram, Facebook and Google Business Profile — together in one place.</p></div></section><div class="social-platforms">'+[['Instagram','◎','Photos & reels'],['Facebook','f','Page posts & project updates'],['Google Business Profile','G','Business updates & project photos']].map(([name,mark,detail])=>'<article><div class="social-mark">'+mark+'</div><h3>'+name+'</h3><p>'+detail+'</p><span class="social-status">Connection planned</span><button class="btn" disabled>Connect in final setup</button></article>').join('')+'</div><section class="social-roadmap"><h3>Publishing workspace</h3><p>Account connections and publishing will be enabled in the final integration stage, after the core CRM is complete.</p><div><span>1. Choose photos</span><span>2. Write the post</span><span>3. Select platforms</span><span>4. Review & publish</span></div></section>';
}
