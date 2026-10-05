/* Job-first estimates and explicit dispatch assignment state. */
(function(){
'use strict';
window.jobHasEstimateTechnician=function(job){
 if(canOverrideJobWorkflow())return !!job;
 const tech=job?.technicianId&&getOne('team',job.technicianId);
 return !!(job&&!['cancelled','completed'].includes(job.status)&&tech&&tech.role==='Technician'&&techStatus(tech)==='Active'&&!tech.archivedAt);
};
window.prepareEstimateJob=function(customerId,items,onReady){
 const jobs=STORE.jobs.filter(j=>(!customerId||j.customerId===customerId)&&!['cancelled','completed'].includes(j.status));
 const next=onReady||((id)=>openEstimateModal(null,getOne('jobs',id).customerId,id,items));
 showModal({title:'Assign a technician before the estimate',body:`<p>Choose the job for this estimate. Its technician must be assigned first. Dispatch offers must be accepted.</p><label class="field"><span class="lbl">Job</span><select id="estimate_job"><option value="">Choose a job</option>${jobs.map(j=>`<option value="${esc(j.id)}">${esc(j.customerName)} — ${esc(j.title)} · ${jobHasEstimateTechnician(j)?esc(j.technician):'Technician required'}</option>`).join('')}</select></label><button type="button" class="btn" id="estimate_new_job">+ New job & assign technician</button>`,onSave:()=>{
  const id=document.getElementById('estimate_job').value,j=getOne('jobs',id);
  if(!j)return toast('Choose a job',true);
  if(jobHasEstimateTechnician(j)){closeModal();return next(id);}
  openJobModal(id,j.customerId,{requireTechnician:true,onSaved:(savedId)=>{if(jobHasEstimateTechnician(getOne('jobs',savedId)))next(savedId);else{go('jobs',savedId);toast('The technician must accept the offer before you create the estimate.');}}});
 }});
 document.getElementById('estimate_new_job').onclick=()=>openJobModal(null,customerId,{requireTechnician:true,onSaved:next});
 document.getElementById('modalSaveBtn').textContent='Continue';
};
window.offerJobTechnician=async function(job,technicianId){
 const {data,error}=await SB.functions.invoke('lead-dispatch',{body:{action:'offer_job',job_id:job.id,technician_id:technicianId,expected_technician_id:job.technicianId||null}});
 if(error){let detail;try{detail=await error.context?.json();}catch(_){}throw new Error(detail?.error||data?.error||error.message);}
 if(!data?.ok)throw new Error(data?.error||'Could not offer this job');
 await Promise.all(['jobs','leads','leadOffers'].map(refreshCollection));
 if(['failed','unconfirmed','not_configured','invalid_phone','opted_out'].includes(data.notification?.sms?.status))toast('Offer saved in the app. Check SMS delivery in Leads.',true);
 return data;
};
})();
