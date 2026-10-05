/* Topic-driven AI drafts. Saving and publishing remain explicit actions. */
(function(){
'use strict';
let photos=[],session=0,busy=false;
const allowed=()=>canOperateOffice();
const arg=v=>esc(JSON.stringify(String(v)));
window.SocialPostComposer={
 markup(title=''){return `<section class="social-ai-composer"><h4>AI post assistant</h4><p class="muted">Choose a topic to create a complete caption and a matching illustrative image.</p><label class="field"><span class="lbl">What is this post about?</span><input id="social_ai_topic" maxlength="250" value="${esc(title)}" placeholder="Garage door springs, opener replacement, new doors…"></label><label class="field"><span class="lbl">Details to include (optional)</span><textarea id="social_ai_notes" maxlength="1500" rows="2" placeholder="Service area, benefits, tone or a specific offer you approve"></textarea></label><div class="field-row"><label class="field"><span class="lbl">Write for</span><select id="social_ai_platform"><option value="google_business">Google Business Profile</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></label><label class="social-ai-image-choice"><input type="checkbox" id="social_ai_image" checked> Generate matching image</label></div><button type="button" class="btn btn-primary" id="socialAiGenerate" onclick="SocialPostComposer.generate()">Generate post & image</button><p id="socialAiStatus" role="status" aria-live="polite"></p></section>`;},
 setPhotos(list){photos=list;session++;busy=false;},
 async generate(){
  if(!allowed()||busy)return;
  const topic=document.getElementById('social_ai_topic')?.value.trim();if(!topic)return toast('Enter a post topic.',true);
  const current=session,button=document.getElementById('socialAiGenerate'),status=document.getElementById('socialAiStatus');busy=true;button.disabled=true;status.textContent='Writing your post and preparing the image…';
  try{
   const platform=document.getElementById('social_ai_platform').value;
   const {data,error}=await SB.functions.invoke('generate-social-post',{body:{topic,notes:document.getElementById('social_ai_notes').value,platform,generate_image:document.getElementById('social_ai_image').checked}});
   if(error||!data?.ok){let message=data?.error;try{message=(await error?.context?.json())?.error||message;}catch{}throw new Error(message||'AI generation could not complete. Your current draft is unchanged.');}
   if(current!==session||!document.getElementById('social_title'))return;
   document.getElementById('social_title').value=data.title;document.getElementById('social_caption').value=data.caption;
   const platformToggle=[...document.querySelectorAll('.social-platform')].find(el=>el.value===platform);if(platformToggle)platformToggle.checked=true;
   if(data.photo){
    photos.push(data.photo);document.querySelectorAll('.social-photo').forEach(el=>el.checked=false);
    const label=document.createElement('label');label.innerHTML=`<input type="checkbox" class="social-photo" value="${esc(data.photo.id)}" checked><img src="${esc(safeDoorImageUrl(data.photo.url))}" alt="${esc(data.photo.label)}"><small>AI illustration</small><button type="button" class="btn btn-sm" onclick="event.preventDefault();SocialPostComposer.download(${arg(data.photo.id)})">Download image</button>`;
    const picker=document.getElementById('socialPhotoPicker');picker.querySelector('p')?.remove();picker.prepend(label);
   }
   status.textContent=data.image_error||'Draft ready. Review the caption and image, then save or copy them for publishing.';
  }catch(e){if(current===session&&document.getElementById('socialAiStatus'))status.textContent=e.message;}
  finally{if(current===session){busy=false;if(button.isConnected)button.disabled=false;}}
 },
 async download(id){
  if(!allowed())return;const photo=photos.find(p=>p.id===id);if(!photo?.path)return;
  try{const {data,error}=await SB.storage.from(ASSET_BUCKET).download(photo.path);if(error)throw error;const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='EZfix-marketing-image.jpg';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{toast('Could not download the image.',true);}
 }
};
})();
