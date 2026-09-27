(() => {
'use strict';

const visCatalogState={search:'',manufacturer:'',collection:'',readyOnly:false};
window.__visCatalogState=visCatalogState;
const val=(p,key)=>p?.[key] ?? p?.appData?.[key] ?? p?.app_data?.[key] ?? '';
const referenceDoors=()=>STORE.products.filter(p=>val(p,'catalogKind')==='garage_door_model');
const refDoor=d=>d?.referenceProductId?getOne('products',d.referenceProductId):null;
const legacyDoor=d=>d?.modelId?getOne('doorModels',d.modelId):null;
const overlayUrl=d=>{
  const p=refDoor(d);
  return p ? (val(p,'visualizerOverlayUrl')||'') : (legacyDoor(d)?.doorImageUrl||'');
};
const doorTitle=d=>{
  const p=refDoor(d); if(p)return p.name||'Garage Door';
  const m=legacyDoor(d); if(!m)return 'Garage Door';
  const mf=getOne('manufacturers',m.manufacturerId);
  return [mf?.name,m.modelName].filter(Boolean).join(' ')||'Garage Door';
};
const doorCollection=d=>{
  const p=refDoor(d); if(p)return val(p,'collection')||'';
  return legacyDoor(d)?.collectionName||'';
};
const doorSpec=d=>{
  const p=refDoor(d); if(!p)return '';
  return [val(p,'collection'),val(p,'material'),val(p,'construction'),val(p,'rValue')?('R-'+val(p,'rValue')):''].filter(Boolean).join(' · ');
};
const visImg=(d,idx,active=false)=>{
  const url=overlayUrl(d); if(!url)return '';
  return '<img data-dooridx="'+idx+'" src="'+esc(url)+'" class="vis-door-overlay '+(active?'vis-door-active':'')+'" style="left:'+d.pos.x+'%;top:'+d.pos.y+'%;transform:translate(-50%,-50%) rotate('+d.pos.rotation+'deg) scale('+d.pos.scale+');opacity:'+d.pos.opacity+'" onpointerdown="startDoorDrag(event,'+idx+')">';
};

const baseFresh=freshDoorConfig;
freshDoorConfig=function(){
  return {...baseFresh(),referenceProductId:''};
};
window.freshDoorConfig=freshDoorConfig;

function filteredReferenceDoors(){
  let items=referenceDoors();
  if(visCatalogState.manufacturer) items=items.filter(p=>String(p.manufacturer||'')===visCatalogState.manufacturer);
  if(visCatalogState.collection) items=items.filter(p=>String(val(p,'collection')||'')===visCatalogState.collection);
  if(visCatalogState.readyOnly) items=items.filter(p=>!!val(p,'visualizerOverlayUrl'));
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
  d.construction=val(p,'construction')||'';
}
function selectVisReferenceDoor(idx,id){
  const p=getOne('products',id); if(!p)return;
  syncReferenceFields(visState.doors[idx],p);
  if(visState.applyToAll){
    visState.doors.slice(0,visState.doorCount).forEach((d,i)=>{if(i!==idx)syncReferenceFields(d,p)});
  }
  render();
}
window.selectVisReferenceDoor=selectVisReferenceDoor;
function visCatalogSearch(value){visCatalogState.search=value;render();}
function visCatalogManufacturer(value){visCatalogState.manufacturer=value;visCatalogState.collection='';render();}
function visCatalogCollection(value){visCatalogState.collection=value;render();}
function visCatalogReadyOnly(checked){visCatalogState.readyOnly=!!checked;render();}
window.visCatalogSearch=visCatalogSearch;window.visCatalogManufacturer=visCatalogManufacturer;window.visCatalogCollection=visCatalogCollection;window.visCatalogReadyOnly=visCatalogReadyOnly;

async function uploadVisualizerOverlay(productId,input){
  if(!IS_OWNER)return toast('Owner access required',true);
  const file=input?.files?.[0]; if(!file)return;
  try{
    const res=await uploadAsset(file,'visualizer-overlays');
    await dbSet('products',productId,{visualizerOverlayUrl:res.url,visualizerOverlayId:res.id});
    toast('Visualizer overlay saved');
    render();
  }catch(e){console.error(e);toast('Overlay upload failed',true)}
}
window.uploadVisualizerOverlay=uploadVisualizerOverlay;

const baseRenderVisualizer=renderVisualizer;
renderVisualizer=function(content,actions){
  baseRenderVisualizer(content,actions);
  if(visState.step!==1)return;
  const designs=[...(STORE.savedDesigns||[])].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!designs.length)return;
  const body=document.getElementById('visStepBody'); if(!body)return;
  const library=document.createElement('section'); library.className='vg-saved-library';
  library.innerHTML='<div class="vg-saved-head"><div><span>Saved Designs</span><h3>Continue a customer design</h3></div><b>'+designs.length+'</b></div><div class="vg-saved-grid">'+designs.map(d=>{
    const customer=d.customerId?getOne('customers',d.customerId):null;
    const name=d.designName||customer?.name||'Garage Door Design';
    const doors=Array.isArray(d.doors)?d.doors:[];
    const preview=d.previewImageUrl||d.houseImageUrl||'';
    return '<article class="vg-saved-card">'+(preview?'<img src="'+esc(preview)+'" alt="">':'<div class="vg-saved-placeholder">Design</div>')+'<div class="vg-saved-copy"><span>'+(customer?esc(customer.name):'Unlinked design')+'</span><b>'+esc(name)+'</b><small>'+doors.length+' door'+(doors.length===1?'':'s')+(d.createdAt?' · '+fmtDate(d.createdAt):'')+'</small><div><button class="btn btn-sm btn-primary" onclick="resumeSavedVisualizerDesign(\''+d.id+'\')">Resume</button>'+(IS_OWNER?'<button class="btn btn-sm" onclick="deleteSavedVisualizerDesign(\''+d.id+'\')">Delete</button>':'')+'</div></div></article>';
  }).join('')+'</div>';
  body.parentNode.insertBefore(library,body);
};
window.renderVisualizer=renderVisualizer;

function resumeSavedVisualizerDesign(id){
  const d=getOne('savedDesigns',id); if(!d)return toast('Saved design not found',true);
  const doors=Array.isArray(d.doors)&&d.doors.length?JSON.parse(JSON.stringify(d.doors)):[freshDoorConfig()];
  visState={step:d.houseImageUrl?3:2,doorCount:Number(d.doorCount)||doors.length||1,doors,activeDoor:0,applyToAll:false,houseImage:d.houseImageUrl?{id:d.houseImageId||null,url:d.houseImageUrl}:null,presetCustomerId:d.customerId||'',presetLeadId:'',presetJobId:'',compareList:[]};
  render(); toast('Saved design loaded');
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
  showModal({title:'Save this design',body:'<label class="field"><span class="lbl">Design name</span><input id="f_visdesignname" value="'+esc(defaultCustomer?defaultCustomer.name+' Garage Door Design':'Garage Door Design')+'"></label><label class="field"><span class="lbl">Link to customer (optional)</span>'+customerPickerHtml(visState.presetCustomerId)+'</label><p class="muted" style="font-size:12px">The exact door selections, positions and home photo are saved so this design can be resumed later.</p>',onSave:async()=>{
    const customerId=document.getElementById('f_customer').value;
    const designName=document.getElementById('f_visdesignname').value.trim()||'Garage Door Design';
    let previewUrl=null; try{previewUrl=await captureVisPreview()}catch(e){console.warn('preview capture failed',e)}
    await dbAdd('savedDesigns',{customerId:customerId||null,designName,houseImageId:visState.houseImage?.id||null,houseImageUrl:visState.houseImage?.url||null,doorCount:visState.doorCount,doors:JSON.parse(JSON.stringify(visState.doors.slice(0,visState.doorCount))),previewImageUrl:previewUrl});
    toast('Design saved'); closeModal();
  }});
};
window.openSaveDesignModal=openSaveDesignModal;

renderVisStep3=function(body){
  const i=visState.activeDoor,d=visState.doors[i],selected=refDoor(d);
  const refs=filteredReferenceDoors(),shown=refs.slice(0,80);
  const all=referenceDoors();
  const manufacturers=[...new Set(all.map(p=>p.manufacturer).filter(Boolean))].sort();
  const collections=[...new Set(all.filter(p=>!visCatalogState.manufacturer||p.manufacturer===visCatalogState.manufacturer).map(p=>val(p,'collection')).filter(Boolean))].sort();
  body.innerHTML=`
    <div class="vg-layout">
      <section class="vg-canvas-card">
        <div class="vg-stage-head"><div><b>Position Door ${i+1}</b><span>Drag the door directly on the home photo</span></div><span class="vg-ready-badge ${overlayUrl(d)?'ready':'not-ready'}">${overlayUrl(d)?'Visualizer Ready':'Reference only'}</span></div>
        <div class="vis-stage vg-stage" id="visStage">
          <img src="${esc(visState.houseImage.url)}" class="vis-house-img">
          ${visState.doors.slice(0,visState.doorCount).map((dd,idx)=>visImg(dd,idx,idx===i)).join('')}
          ${!overlayUrl(d)?'<div class="vg-stage-empty">Choose a Visualizer Ready door or have the owner upload an overlay for the selected model.</div>':''}
        </div>
        ${visState.doorCount>1?'<div class="vis-door-tabs">'+visState.doors.slice(0,visState.doorCount).map((dd,idx)=>'<button class="vis-door-tab '+(i===idx?'active':'')+'" onclick="visState.activeDoor='+idx+';render()">Door '+(idx+1)+'</button>').join('')+'</div>':''}
        <div class="vg-position-tools">
          <button class="btn btn-sm" onclick="nudgeVisScale(-0.05)">− Size</button>
          <button class="btn btn-sm" onclick="nudgeVisScale(0.05)">+ Size</button>
          <button class="btn btn-sm" onclick="nudgeVisRotation(-2)">↺ Rotate</button>
          <button class="btn btn-sm" onclick="nudgeVisRotation(2)">↻ Rotate</button>
          <label>Opacity <input type="range" min=".35" max="1" step=".05" value="${d.pos.opacity}" oninput="visState.doors[${i}].pos.opacity=Number(this.value);render()"></label>
        </div>
      </section>
      <section class="vg-picker-card">
        <div class="vg-picker-title"><div><h3>Choose Garage Door</h3><p>253-model reference catalog · selling price stays in Estimate/Invoice</p></div><span>${refs.length} match${refs.length===1?'':'es'}</span></div>
        <div class="vg-filter-grid">
          <input placeholder="Search model, collection, material…" value="${esc(visCatalogState.search)}" oninput="visCatalogSearch(this.value)">
          <select onchange="visCatalogManufacturer(this.value)"><option value="">All manufacturers</option>${manufacturers.map(x=>'<option '+(visCatalogState.manufacturer===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select>
          <select onchange="visCatalogCollection(this.value)"><option value="">All collections</option>${collections.map(x=>'<option '+(visCatalogState.collection===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select>
          <label class="vg-ready-filter"><input type="checkbox" ${visCatalogState.readyOnly?'checked':''} onchange="visCatalogReadyOnly(this.checked)"> Visualizer Ready only</label>
        </div>
        ${selected?`<div class="vg-selected-door">
          <div class="vg-selected-image">${val(selected,'imageUrl')?'<img src="'+esc(val(selected,'imageUrl'))+'" alt="">':'🚪'}</div>
          <div><b>${esc(selected.name)}</b><div>${esc(doorSpec(d))}</div>${overlayUrl(d)?'<span class="vg-success">Overlay ready</span>':'<span class="vg-warning">Overlay needed for on-home preview</span>'}</div>
          ${IS_OWNER?`<label class="btn btn-sm vg-upload-btn">Upload overlay<input type="file" accept="image/png,image/webp,image/jpeg" hidden onchange="uploadVisualizerOverlay('${esc(selected.id)}',this)"></label>`:''}
        </div>`:''}
        <div class="vg-door-grid">
          ${shown.map(p=>`<button class="vg-door-card ${d.referenceProductId===p.id?'selected':''}" data-product-id="${esc(p.id)}" onclick="selectVisReferenceDoor(${i},this.dataset.productId)">
            <div class="vg-door-thumb">${val(p,'imageUrl')?'<img loading="lazy" src="'+esc(val(p,'imageUrl'))+'" alt="">':'🚪'}<span class="${val(p,'visualizerOverlayUrl')?'is-ready':''}">${val(p,'visualizerOverlayUrl')?'Ready':'Reference'}</span></div>
            <div class="vg-door-copy"><b>${esc(p.name)}</b><span>${esc([p.manufacturer,val(p,'collection')].filter(Boolean).join(' · '))}</span></div>
          </button>`).join('')}
        </div>
        ${refs.length>shown.length?'<div class="vg-more-note">Showing first '+shown.length+' results — refine the search to narrow the catalog.</div>':''}
        ${visState.doorCount>1?'<label class="vg-apply-all"><input type="checkbox" '+(visState.applyToAll?'checked':'')+' onchange="toggleVisApplyToAll(this.checked)"> Apply selected design to all doors</label>':''}
      </section>
    </div>
    <div class="vg-footer-actions"><button class="btn" onclick="visState.step=2;render()">← Home Photo</button><button class="btn btn-primary" ${!visState.doors.slice(0,visState.doorCount).some(x=>x.referenceProductId||x.modelId)?'disabled':''} onclick="visState.step=4;render()">Review Design →</button></div>`;
};
window.renderVisStep3=renderVisStep3;

function summaryCard(d,idx){
  const p=refDoor(d),m=legacyDoor(d);
  const size=d.customSize?(d.customWidth+"' × "+d.customHeight+"'"):(d.width+"' × "+d.height+"'");
  const title=p?.name||m?.modelName||'Door not selected';
  const meta=p?[p.manufacturer,val(p,'collection'),val(p,'material'),val(p,'rValue')?('R-'+val(p,'rValue')):'']:[getOne('manufacturers',m?.manufacturerId)?.name,m?.collectionName];
  return '<article class="vg-summary-card"><span>Door '+(idx+1)+'</span><b>'+esc(title)+'</b><div>'+esc(meta.filter(Boolean).join(' · '))+'</div><small>'+esc(size)+'</small></article>';
}
renderVisStep4=function(body){
  const configured=visState.doors.slice(0,visState.doorCount).filter(d=>d.referenceProductId||d.modelId);
  body.innerHTML=`
    <div class="vg-review-grid">
      <section class="vg-canvas-card">
        <div class="vg-stage-head"><div><b>Before / After</b><span>Drag the divider to compare the original home and your design</span></div></div>
        <div class="vis-ba-wrap vg-review-stage" id="visBaWrap">
          <img src="${esc(visState.houseImage.url)}" class="vis-ba-after-bg">
          ${visState.doors.slice(0,visState.doorCount).map((dd,idx)=>{const u=overlayUrl(dd);return u?'<img src="'+esc(u)+'" class="vis-door-overlay" style="left:'+dd.pos.x+'%;top:'+dd.pos.y+'%;transform:translate(-50%,-50%) rotate('+dd.pos.rotation+'deg) scale('+dd.pos.scale+');opacity:'+dd.pos.opacity+';position:absolute">':''}).join('')}
          <div class="vis-ba-before-wrap" id="visBaBeforeWrap" style="clip-path:inset(0 50% 0 0)"><img src="${esc(visState.houseImage.url)}" class="vis-ba-before-bg"></div>
          <div class="vis-ba-handle" id="visBaHandle" style="left:50%" onpointerdown="startBaDrag(event)"></div>
          <div class="vis-ba-label" style="left:8px">BEFORE</div><div class="vis-ba-label" style="right:8px">AFTER</div>
        </div>
      </section>
      <aside class="vg-review-panel"><h3>Design Summary</h3><div class="vg-summary-list">${visState.doors.slice(0,visState.doorCount).map(summaryCard).join('')}</div></aside>
    </div>
    <div class="vg-review-actions">
      <button class="btn" onclick="visState.step=3;render()">← Edit Design</button>
      <button class="btn" onclick="addVisToCompare()">Compare</button>
      <button class="btn" onclick="seeSimilarInstallations()">Similar Installations</button>
      <button class="btn" onclick="shareDesign()">Share</button>
      <button class="btn" onclick="openSaveDesignModal()">Save Design</button>
      <button class="btn btn-primary" ${configured.length?'':'disabled'} onclick="createEstimateFromDesign()">Create Estimate</button>
    </div>
    ${visState.compareList.length?'<div class="panel vg-compare-strip"><div class="panel-head"><h3>Compare ('+visState.compareList.length+'/4)</h3></div><div class="panel-body">'+visState.compareList.map((c,ci)=>'<button class="btn" onclick="restoreVisCompare('+ci+')">Design '+String.fromCharCode(65+ci)+'</button>').join('')+'</div></div>':''}
  `;
};
window.renderVisStep4=renderVisStep4;

shareDesign=function(){
  const lines=visState.doors.slice(0,visState.doorCount).filter(d=>d.referenceProductId||d.modelId).map((d,i)=>'Door '+(i+1)+': '+doorTitle(d)+(doorCollection(d)?' · '+doorCollection(d):'')).join('\n');
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

captureVisPreview=async function(){
  if(!visState.houseImage)return null;
  const house=new Image();house.crossOrigin='anonymous';await new Promise((ok,bad)=>{house.onload=ok;house.onerror=bad;house.src=visState.houseImage.url});
  const canvas=document.createElement('canvas');canvas.width=house.naturalWidth;canvas.height=house.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(house,0,0);
  for(const d of visState.doors.slice(0,visState.doorCount)){
    const src=overlayUrl(d);if(!src)continue;
    try{const img=new Image();img.crossOrigin='anonymous';await new Promise((ok,bad)=>{img.onload=ok;img.onerror=bad;img.src=src});const dw=canvas.width*.3*d.pos.scale,dh=dw*(img.naturalHeight/img.naturalWidth),cx=d.pos.x/100*canvas.width,cy=d.pos.y/100*canvas.height;ctx.save();ctx.globalAlpha=d.pos.opacity;ctx.translate(cx,cy);ctx.rotate(d.pos.rotation*Math.PI/180);ctx.drawImage(img,-dw/2,-dh/2,dw,dh);ctx.restore()}catch(e){console.warn('Visualizer overlay could not be included in saved preview',e)}
  }
  return canvas.toDataURL('image/jpeg',.86);
};
window.captureVisPreview=captureVisPreview;

createEstimateFromDesign=function(){
  const doors=visState.doors.slice(0,visState.doorCount).filter(d=>d.referenceProductId||d.modelId);
  if(!doors.length)return toast('Choose at least one door first');
  const items=doors.map((d,i)=>{
    const p=refDoor(d),m=legacyDoor(d),size=d.customSize?(d.customWidth+"'x"+d.customHeight+"'"):(d.width+"'x"+d.height+"'");
    if(p){
      const specs=[val(p,'collection')?'Collection: '+val(p,'collection'):'','Size: '+size,val(p,'panelStyle')?'Design: '+val(p,'panelStyle'):'',val(p,'material')?'Material: '+val(p,'material'):'',val(p,'construction')?'Construction: '+val(p,'construction'):'',val(p,'rValue')?'R-Value: '+val(p,'rValue'):''].filter(Boolean).join('\n');
      return {desc:(doors.length>1?'Garage door #'+(i+1)+' — ':'')+(p.name||'Garage Door'),details:specs,qty:1,rate:0,taxable:true,productId:p.id,catalogItemId:p.id};
    }
    const mf=getOne('manufacturers',m?.manufacturerId),details=[m?.collectionName?'Collection: '+m.collectionName:'','Size: '+size,d.color?'Color: '+d.color:''].filter(Boolean).join('\n');
    return {desc:(doors.length>1?'Garage door #'+(i+1)+' — ':'')+[mf?.name,m?.modelName].filter(Boolean).join(' '),details,qty:1,rate:Number(m?.basePrice)||0,taxable:true};
  });
  openEstimateModal(null,visState.presetCustomerId||undefined,undefined,items);
  toast('Estimate started from design — set door price and add hardware/labor');
};
window.createEstimateFromDesign=createEstimateFromDesign;

const visAdminState={search:'',manufacturer:'',collection:'',readiness:'all'};
window.__visAdminState=visAdminState;
function setVisAdminFilter(key,value){visAdminState[key]=value;if(key==='manufacturer')visAdminState.collection='';render()}
window.setVisAdminFilter=setVisAdminFilter;
async function clearVisualizerOverlay(productId){
  if(!IS_OWNER)return toast('Owner access required',true);
  if(!confirm('Remove the Visualizer overlay from this model? The reference product will remain.'))return;
  await dbSet('products',productId,{visualizerOverlayUrl:null,visualizerOverlayId:null});
  toast('Overlay removed'); render();
}
window.clearVisualizerOverlay=clearVisualizerOverlay;
renderVisCatalog=function(content,actions){
  if(!IS_OWNER){content.innerHTML=emptyState('🔒','Owner access only','');return}
  actions.innerHTML='<button class="btn btn-primary" onclick="go(\'visualizer\')">Open Visualizer</button>';
  const all=referenceDoors(),ready=all.filter(p=>!!val(p,'visualizerOverlayUrl'));
  const manufacturers=[...new Set(all.map(p=>p.manufacturer).filter(Boolean))].sort();
  const collections=[...new Set(all.filter(p=>!visAdminState.manufacturer||p.manufacturer===visAdminState.manufacturer).map(p=>val(p,'collection')).filter(Boolean))].sort();
  let list=all;
  if(visAdminState.manufacturer)list=list.filter(p=>p.manufacturer===visAdminState.manufacturer);
  if(visAdminState.collection)list=list.filter(p=>val(p,'collection')===visAdminState.collection);
  if(visAdminState.readiness==='ready')list=list.filter(p=>!!val(p,'visualizerOverlayUrl'));
  if(visAdminState.readiness==='missing')list=list.filter(p=>!val(p,'visualizerOverlayUrl'));
  const q=visAdminState.search.trim().toLowerCase();
  if(q){const ts=q.split(/\s+/).filter(Boolean);list=list.filter(p=>{const hay=[p.name,p.manufacturer,p.model,p.sku,p.details,val(p,'collection'),val(p,'modelNumber'),val(p,'material'),val(p,'construction')].join(' ').toLowerCase();return ts.every(t=>hay.includes(t))})}
  list=list.sort((a,b)=>String(a.manufacturer||'').localeCompare(String(b.manufacturer||''))||String(val(a,'collection')||'').localeCompare(String(val(b,'collection')||''))||String(a.name||'').localeCompare(String(b.name||'')));
  const shown=list.slice(0,120);
  content.innerHTML=`<div class="vga-hero"><div><span>Visualizer Catalog</span><h2>Reference Door Readiness</h2><p>Reference data stays in Products. This page only manages the real overlay image used on customer home photos.</p></div><div class="vga-stats"><div><b>${all.length}</b><span>Reference Models</span></div><div><b>${ready.length}</b><span>Visualizer Ready</span></div><div><b>${all.length-ready.length}</b><span>Need Overlay</span></div></div></div>
  <div class="vga-controls"><input placeholder="Search model, collection, material…" value="${esc(visAdminState.search)}" oninput="setVisAdminFilter('search',this.value)"><select onchange="setVisAdminFilter('manufacturer',this.value)"><option value="">All manufacturers</option>${manufacturers.map(x=>'<option '+(visAdminState.manufacturer===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select><select onchange="setVisAdminFilter('collection',this.value)"><option value="">All collections</option>${collections.map(x=>'<option '+(visAdminState.collection===x?'selected':'')+'>'+esc(x)+'</option>').join('')}</select><select onchange="setVisAdminFilter('readiness',this.value)"><option value="all" ${visAdminState.readiness==='all'?'selected':''}>All readiness</option><option value="ready" ${visAdminState.readiness==='ready'?'selected':''}>Visualizer Ready</option><option value="missing" ${visAdminState.readiness==='missing'?'selected':''}>Missing Overlay</option></select></div>
  <div class="vga-result-line"><b>${list.length}</b> matching model${list.length===1?'':'s'}${list.length>shown.length?' · showing first '+shown.length:''}</div>
  <div class="vga-grid">${shown.map(p=>{const img=val(p,'imageUrl'),overlay=val(p,'visualizerOverlayUrl');return '<article class="vga-card"><div class="vga-image">'+(overlay?'<img src="'+esc(overlay)+'" alt="" class="vga-overlay-img">':img?'<img src="'+esc(img)+'" alt="">':'<div class="vga-placeholder">Garage Door</div>')+'<span class="'+(overlay?'ready':'missing')+'">'+(overlay?'Ready':'Needs Overlay')+'</span></div><div class="vga-copy"><small>'+esc([p.manufacturer,val(p,'collection')].filter(Boolean).join(' · '))+'</small><b>'+esc(p.name)+'</b><p>'+esc([val(p,'material'),val(p,'construction'),val(p,'rValue')?('R-'+val(p,'rValue')):''].filter(Boolean).join(' · '))+'</p><div class="vga-actions"><label class="btn btn-sm">'+(overlay?'Replace Overlay':'Upload Overlay')+'<input hidden type="file" accept="image/png,image/webp,image/jpeg" onchange="uploadVisualizerOverlay(\''+esc(p.id)+'\',this)"></label>'+(overlay?'<button class="btn btn-sm" onclick="clearVisualizerOverlay(\''+esc(p.id)+'\')">Remove</button>':'')+(val(p,'officialUrl')?'<a class="btn btn-sm" href="'+esc(val(p,'officialUrl'))+'" target="_blank" rel="noopener">Official</a>':'')+'</div></div></article>'}).join('')}</div>`;
};
window.renderVisCatalog=renderVisCatalog;

function galleryCover(p){return (p.photos||[]).find(ph=>ph.id===p.coverPhotoId)||(p.photos||[]).find(ph=>ph.tag==='After')||(p.photos||[])[0]}
function galleryBefore(p){return (p.photos||[]).find(ph=>ph.tag==='Before')}
function galleryAfter(p){return (p.photos||[]).find(ph=>ph.tag==='After')||galleryCover(p)}
function premiumViewGalleryProject(id){galleryFilter.presenting=true;galleryFilter.presentIdx=[...STORE.galleryProjects].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0)).findIndex(p=>p.id===id);galleryFilter.presentPhotoIdx=0;render()}
window.premiumViewGalleryProject=premiumViewGalleryProject;

renderGallery=function(content,actions){
  actions.innerHTML=IS_OWNER?'<button class="btn btn-sm" onclick="shareGallery()">Share Gallery</button><button class="btn btn-sm" onclick="startGalleryPresentation()">Present</button><button class="btn btn-primary" onclick="openGalleryProjectModal()">+ New Project</button>':'';
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
    ${list.length?'<div class="pg-grid">'+list.map(p=>{const cover=galleryCover(p),before=galleryBefore(p),after=galleryAfter(p);return '<article class="pg-card"><button class="pg-card-main" onclick="premiumViewGalleryProject(\''+p.id+'\')">'+(cover?'<img loading="lazy" src="'+esc(cover.url)+'" alt="">':'<div class="pg-no-photo">Project</div>')+'<div class="pg-card-overlay"><div><span>'+esc(p.category||'Completed Project')+'</span><h3>'+esc(p.title)+'</h3><p>'+esc([p.doorManufacturer,p.doorCollection,p.doorColor,p.city].filter(Boolean).join(' · '))+'</p></div>'+(before&&after?'<b>Before / After</b>':'')+'</div></button>'+(IS_OWNER?'<button class="pg-edit" onclick="openGalleryProjectModal(\''+p.id+'\')">Edit</button>':'')+'</article>'}).join('')+'</div>':emptyState('🖼️','No matching projects','Try another filter or add a completed project.')}`;
};
window.renderGallery=renderGallery;

renderGalleryPresentation=function(content){
  const list=[...STORE.galleryProjects].sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
  if(!list.length){galleryFilter.presenting=false;content.innerHTML=emptyState('🖼️','No projects to present','');return}
  const idx=Math.max(0,Math.min(galleryFilter.presentIdx||0,list.length-1)),p=list[idx],photos=p.photos||[],pi=Math.max(0,Math.min(galleryFilter.presentPhotoIdx||0,Math.max(0,photos.length-1))),before=galleryBefore(p),after=galleryAfter(p),photo=photos[pi]||after;
  content.innerHTML=`
    <div class="pg-present">
      <div class="pg-present-top"><button class="btn btn-sm" onclick="galleryFilter.presenting=false;render()">Close Showroom</button><div><b>${idx+1} / ${list.length}</b><span>${esc(p.category||'Project')}</span></div>${IS_OWNER?'<button class="btn btn-sm" onclick="galleryFilter.presenting=false;render();openGalleryProjectModal(\''+p.id+'\')">Edit Project</button>':'<span></span>'}</div>
      <div class="pg-present-stage">
        ${before&&after?'<div class="pg-ba"><figure><figcaption>BEFORE</figcaption><img src="'+esc(before.url)+'"></figure><figure><figcaption>AFTER</figcaption><img src="'+esc(after.url)+'"></figure></div>':photo?'<img class="pg-feature" src="'+esc(photo.url)+'">':'<div class="pg-no-photo">No photo</div>'}
      </div>
      ${photos.length>1?'<div class="pg-thumbs">'+photos.map((ph,n)=>'<button class="'+(n===pi?'active':'')+'" onclick="galleryFilter.presentPhotoIdx='+n+';render()"><img src="'+esc(ph.url)+'"></button>').join('')+'</div>':''}
      <div class="pg-present-copy"><span>${esc([p.category,p.city].filter(Boolean).join(' · '))}</span><h1>${esc(p.title)}</h1>${p.description?'<p>'+esc(p.description)+'</p>':''}<div class="pg-specs">${[['Manufacturer',p.doorManufacturer],['Collection / Model',p.doorCollection],['Color',p.doorColor],['Panel / Design',p.panelStyle],['Windows',p.windowStyle],['Insulation',p.insulation]].filter(x=>x[1]).map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')}</div></div>
      <div class="pg-present-nav"><button class="btn" onclick="galleryFilter.presentIdx=${(idx-1+list.length)%list.length};galleryFilter.presentPhotoIdx=0;render()">← Previous</button><button class="btn btn-primary" onclick="galleryFilter.presentIdx=${(idx+1)%list.length};galleryFilter.presentPhotoIdx=0;render()">Next Project →</button></div>
    </div>`;
};
window.renderGalleryPresentation=renderGalleryPresentation;
})();