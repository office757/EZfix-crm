(function(){
  const drafts = {};
  async function call(slug,payload){
    const {data:{session}}=await window.SB.auth.getSession();
    if(!session?.access_token) throw new Error('Authentication required');
    const r=await fetch(window.SUPABASE_PROJECT_URL+'/functions/v1/'+slug,{method:'POST',headers:{'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY,'Authorization':'Bearer '+session.access_token},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok) throw new Error(d.error||('AI service failed ('+r.status+')'));
    return d;
  }
  window.EZfixTechAI={
    draftFor:(jobId)=>drafts[jobId]||null,
    async prepare(jobId,requestText){
      const q=String(requestText||'').trim(); if(!q) throw new Error('Tell the AI what document to prepare.');
      const d=await call('ai-technician-assistant',{action:'prepare_service_document',request_text:q,job_id:jobId});
      drafts[jobId]=d.result; return d.result;
    },
    async submit(jobId){
      const draft=drafts[jobId]; if(!draft) throw new Error('Prepare a draft first.');
      const d=await call('ai-service-document-approval',{draft,job_id:jobId});
      delete drafts[jobId]; return d;
    }
  };
})();
