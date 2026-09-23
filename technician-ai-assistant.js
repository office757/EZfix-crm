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
    render(jobId){
      const d=drafts[jobId], items=d?.items||[];
      let h='<div class="panel" style="margin-bottom:14px;border-color:var(--orange)"><div class="panel-head"><h3>AI Service Assistant</h3><span class="badge">Draft + Approval</span></div><div class="panel-body pad"><p class="muted" style="font-size:12.5px;margin-top:0">Describe the receipt, invoice or estimate in English or Hebrew. AI uses the active catalog and tax rules; technician drafts require office/owner approval.</p><textarea id="jobAiRequest" placeholder="Example: תעשה לי קבלה על קפיצים כולל מיסים ב-750" style="min-height:72px">'+window.esc(d?.request||'')+'</textarea><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="jobAiPrepare(\''+jobId+'\')">'+(d?'Rebuild Draft':'Prepare Draft')+'</button>'+(d?'<button class="btn btn-sm" onclick="jobAiSubmit(\''+jobId+'\')">Submit for Approval</button>':'')+'</div>';
      if(d){ h+='<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><div style="display:flex;justify-content:space-between"><b>'+window.esc((d.document_type||'document').replace('_draft','').toUpperCase())+' PREVIEW</b><b>'+window.money(d.totals?.total||0)+'</b></div>'; items.forEach(x=>h+='<div class="kv"><div><b>'+window.esc(x.name)+'</b><div class="muted" style="font-size:11px">'+window.esc(x.description||'')+(x.taxable===false?' · Non-taxable':'')+'</div></div><div>'+window.money(Number(x.qty||0)*Number(x.rate||0))+'</div></div>'); h+='<div class="kv"><div>Subtotal</div><div>'+window.money(d.totals?.subtotal||0)+'</div></div><div class="kv"><div>Tax ('+Number(d.totals?.tax_rate||0)+'%)</div><div>'+window.money(d.totals?.tax||0)+'</div></div><div class="kv"><div><b>Total</b></div><div><b>'+window.money(d.totals?.total||0)+'</b></div></div>'; if((d.warnings||[]).length)h+='<div style="background:#fff3d6;padding:9px;border-radius:8px;font-size:12px;margin-top:8px">'+d.warnings.map(w=>'⚠️ '+window.esc(w)).join('<br>')+'</div>'; h+='</div>'; } return h+'</div></div>';
    },
    async submit(jobId){
      const draft=drafts[jobId]; if(!draft) throw new Error('Prepare a draft first.');
      const d=await call('ai-service-document-approval',{draft,job_id:jobId});
      delete drafts[jobId]; return d;
    }
  };
})();

window.jobAiPrepare=async function(jobId){const el=document.getElementById('jobAiRequest');try{await window.EZfixTechAI.prepare(jobId,el?.value||'');window.render();}catch(e){window.toast(e.message||'AI draft failed',true);}};
window.jobAiSubmit=async function(jobId){if(!confirm('Submit this draft for office/owner approval? No financial document will be created yet.'))return;try{await window.EZfixTechAI.submit(jobId);window.toast('Approval request submitted');window.render();}catch(e){window.toast(e.message||'Approval request failed',true);}};
