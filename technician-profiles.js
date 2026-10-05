/* Private technician portraits, managed by authorized office staff. */
(function(){
'use strict';
const cache=new Map();
const validPath=(path,id)=>typeof path==='string'&&path.startsWith('team-profiles/'+id+'/')&&/^team-profiles\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.jpg$/.test(path);
const arg=v=>esc(JSON.stringify(String(v)));
window.TechnicianProfiles={
 avatar(id,name){
  const member=STORE.team.find(t=>t.id===id)||(!id&&STORE.team.find(t=>t.name===name));
  const label=member?.name||name||'Technician',initials=label.split(/\s+/).slice(0,2).map(n=>n[0]||'').join('').toUpperCase();
  const path=member?.profilePhotoPath;
  let item=cache.get(path);
  if(member&&validPath(path,member.id)&&(!item||item.expires<Date.now())){
   item={url:'',expires:Date.now()+60000};cache.set(path,item);
   SB.storage.from('crm-assets').createSignedUrl(path,3600).then(({data,error})=>{
    if(error||!data?.signedUrl)return;item.url=data.signedUrl;item.expires=Date.now()+3300000;
    // Replace only portrait placeholders; do not rerender or disrupt open editors.
    document.querySelectorAll('[data-technician-photo]').forEach(el=>{if(el.dataset.technicianPhoto===path)el.innerHTML='<img src="'+esc(item.url)+'" alt="'+esc(label)+'" loading="lazy" onerror="this.hidden=true">';});
   }).catch(()=>{});
  }
  return '<span class="cal-reference-avatar technician-profile-avatar" data-technician-photo="'+esc(validPath(path,member?.id)?path:'')+'">'+(item?.url?'<img src="'+esc(item.url)+'" alt="'+esc(label)+'" loading="lazy" onerror="this.hidden=true">':esc(initials))+'</span>';
 },
 editButton(member){return canOperateOffice()?'<button type="button" class="btn btn-sm" onclick="TechnicianProfiles.open('+arg(member.id)+')">Profile photo</button>':'';},
 open(id){
  if(!canOperateOffice())return;const member=getOne('team',id);if(!member||member.role!=='Technician')return;
  showModal({title:'Profile photo · '+esc(member.name),body:'<div class="technician-profile-editor">'+this.avatar(id,member.name)+'</div><label class="field"><span class="lbl">Choose a portrait</span><input id="technicianPortraitFile" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="muted">JPG, PNG or WebP, up to 10 MB. Saved as a square portrait and shown in the team list and calendar.</p><button class="btn btn-primary" id="technicianPortraitUpload" onclick="TechnicianProfiles.upload('+arg(id)+')">Upload & save photo</button>'+(member.profilePhotoPath?'<button class="btn" onclick="TechnicianProfiles.remove('+arg(id)+')">Remove profile photo</button>':'')+'<p id="technicianPortraitStatus" role="status" aria-live="polite"></p>'});
 },
 async upload(id){
  if(!canOperateOffice())return;const file=document.getElementById('technicianPortraitFile')?.files?.[0],button=document.getElementById('technicianPortraitUpload'),status=document.getElementById('technicianPortraitStatus');
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)return toast('Choose a JPG, PNG or WebP photo up to 10 MB.',true);
  button.disabled=true;status.textContent='Preparing portrait…';
  try{
   const bitmap=await createImageBitmap(file);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
   const side=Math.min(bitmap.width,bitmap.height);canvas.getContext('2d').drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,512,512);bitmap.close();
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)throw Error('Could not prepare this image.');
   const path='team-profiles/'+id+'/'+crypto.randomUUID()+'.jpg';status.textContent='Saving photo…';
   const {error}=await SB.storage.from('crm-assets').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(error)throw error;
   const result=await SB.rpc('set_technician_profile_photo',{p_team_id:id,p_path:path});if(result.error)throw result.error;
   await refreshCollection('team');if(status.isConnected)status.textContent='Profile photo saved.';toast('Profile photo saved');if(button.isConnected)closeModal();render();
  }catch(e){if(status.isConnected)status.textContent=e.message;toast(e.message,true);}finally{if(button.isConnected)button.disabled=false;}
 },
 async remove(id){
  if(!canOperateOffice())return;
  try{const {error}=await SB.rpc('set_technician_profile_photo',{p_team_id:id,p_path:null});if(error)throw error;await refreshCollection('team');closeModal();render();toast('Profile photo removed');}catch(e){toast(e.message,true);}
 }
};
})();
