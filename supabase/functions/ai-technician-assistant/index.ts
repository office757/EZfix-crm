import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const n=(v:any)=>Number(v)||0;
const text=(v:any)=>String(v??"").trim();
const lower=(v:any)=>text(v).toLowerCase();
const URL=Deno.env.get("SUPABASE_URL")!, ANON=Deno.env.get("SUPABASE_ANON_KEY")!, SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function parseMoney(request:string,explicit:any){
  const ex=Number(explicit);
  if(Number.isFinite(ex)&&ex>0)return round2(ex);
  const m=request.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/) || request.match(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:dollars?|total|including\s+tax|incl\.?\s*tax)\b/i);
  return m?round2(Number(m[1].replaceAll(",",""))):0;
}
function inferService(q:string){
  const s=lower(q);
  if(/extension/.test(s)&&/spring/.test(s))return {category:"springs",kind:"extension",pair:/pair|both|two|2\s*springs/.test(s)};
  if(/torsion/.test(s)&&/spring/.test(s))return {category:"springs",kind:"torsion",pair:/pair|both|two|2\s*springs/.test(s)};
  if(/spring/.test(s))return {category:"springs",kind:"spring",pair:/pair|both|two|2\s*springs/.test(s)};
  if(/opener|liftmaster|motor/.test(s))return {category:"openers",kind:"opener",pair:false};
  if(/cable/.test(s))return {category:"cables",kind:"cable",pair:false};
  if(/roller/.test(s))return {category:"rollers",kind:"roller",pair:false};
  if(/weather|seal/.test(s))return {category:"weather",kind:"weather seal",pair:false};
  return {category:"repair",kind:"garage door repair",pair:false};
}
function scoreProduct(p:any,svc:any,q:string){
  const hay=lower(`${p.name} ${p.category} ${p.category_id} ${p.details}`), req=lower(q); let score=0;
  if(svc.category==="springs"&&hay.includes("spring"))score+=20;
  if(svc.kind!=="spring"&&hay.includes(svc.kind))score+=20;
  if(svc.pair&&/pair|both/.test(hay))score+=12;
  if(!svc.pair&&/pair|both/.test(hay))score-=4;
  for(const w of req.split(/[^a-z0-9]+/).filter((x:string)=>x.length>4))if(hay.includes(w))score+=1;
  if(lower(p.category_id)==="labor"||lower(p.category)==="labor")score-=15;
  return score;
}
function compute(items:any[],taxRate:number){
  const subtotal=round2(items.reduce((s,x)=>s+n(x.qty)*n(x.rate),0));
  const taxable=round2(items.reduce((s,x)=>s+(x.taxable===false?0:n(x.qty)*n(x.rate)),0));
  const tax=round2(taxable*taxRate/100);
  return {subtotal,tax_rate:taxRate,tax,total:round2(subtotal+tax)};
}
function buildDraft(catalog:any[],request:string,targetTotal:number,taxRate:number){
  const svc=inferService(request);
  const parts=catalog.filter(p=>lower(p.category_id)!=="labor"&&lower(p.category)!=="labor").sort((a,b)=>scoreProduct(b,svc,request)-scoreProduct(a,svc,request));
  const labor=catalog.filter(p=>lower(p.category_id)==="labor"||lower(p.category)==="labor");
  const part=parts[0]||null;
  const laborItem=labor.find(p=>/garage door repair labor/i.test(text(p.name)))||labor.find(p=>/labor/i.test(text(p.name)))||null;
  if(!targetTotal)throw new Error("A positive total is required (for example: $750 including tax).");
  if(!part)throw new Error("No matching active catalog part/service item was found.");
  const partTaxable=part.taxable!==false, laborTaxable=laborItem?laborItem.taxable!==false:false;
  const partCatalog=n(part.rate), laborCatalog=n(laborItem?.rate);
  let partAmount=0,laborAmount=0,allocation="catalog";
  if(partCatalog>0||laborCatalog>0){
    const weightPart=partCatalog>0?partCatalog:0, weightLabor=laborCatalog>0?laborCatalog:0, w=Math.max(1,weightPart+weightLabor);
    const effectiveTax=(weightPart*(partTaxable?taxRate:0)+weightLabor*(laborTaxable?taxRate:0))/w;
    const pretax=targetTotal/(1+effectiveTax/100);
    partAmount=round2(pretax*(weightPart/w)); laborAmount=round2(pretax-partAmount);
  }else{
    allocation="editable_70_30_draft";
    const partShare=.70, laborShare=.30;
    const taxFactor=1+(partShare*(partTaxable?taxRate:0)+laborShare*(laborTaxable?taxRate:0))/100;
    const pretax=targetTotal/taxFactor;
    partAmount=round2(pretax*partShare); laborAmount=round2(pretax-partAmount);
  }
  let items=[{catalog_product_id:part.id,name:part.name,description:part.details||`Garage door ${svc.kind} service`,qty:1,rate:partAmount,taxable:partTaxable,category:part.category||part.category_id||"Parts"}];
  if(laborItem&&laborAmount>0)items.push({catalog_product_id:laborItem.id,name:laborItem.name,description:laborItem.details||"Labor for diagnosed garage door repair work performed.",qty:1,rate:laborAmount,taxable:laborTaxable,category:laborItem.category||"Labor"});
  let totals=compute(items,taxRate),delta=round2(targetTotal-totals.total),guard=0;
  while(Math.abs(delta)>=0.009&&guard++<6){
    const idx=items.length>1?items.length-1:0; items[idx].rate=round2(items[idx].rate+delta/(1+(items[idx].taxable===false?0:taxRate/100))); totals=compute(items,taxRate); delta=round2(targetTotal-totals.total);
  }
  return {document_type:/receipt/i.test(request)?"receipt_draft":/estimate|quote/i.test(request)?"estimate_draft":"invoice_draft",request,service:svc,items,totals,target_total:targetTotal,reconciled:Math.abs(round2(targetTotal-totals.total))<0.01,allocation_method:allocation,warnings:allocation==="editable_70_30_draft"?["Catalog rates for the selected service/labor are $0, so the parts/labor split is an editable draft allocation. The exact customer total and tax math are reconciled; review the split before approval."]:[],draft_only:true,needs_approval:true};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return reply({ok:false,error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))return reply({ok:false,error:"Unauthorized"},401);
    const uc=createClient(URL,ANON,{global:{headers:{Authorization:auth}}}); const {data:{user}}=await uc.auth.getUser(); if(!user)return reply({ok:false,error:"Unauthorized"},401);
    const db=createClient(URL,SERVICE); const {data:member}=await db.from("team").select("id,name,role,status").eq("auth_user_id",user.id).maybeSingle();
    if(!member||lower(member.status)!=="active")return reply({ok:false,error:"Forbidden"},403);
    const role=lower(member.role); if(!["owner","admin","office","dispatcher","technician"].includes(role))return reply({ok:false,error:"Role not permitted"},403);
    const body=await req.json().catch(()=>({})); const action=text(body?.action||"prepare_service_document");
    if(action==="capabilities")return reply({ok:true,role,capabilities:{prepare_service_document:true,persists_financial_document:false,requires_approval:true,technician_scope:"assigned jobs only when job_id/customer_id is supplied"}});
    if(action!=="prepare_service_document")return reply({ok:false,error:"Unsupported action"},400);
    const request=text(body?.request_text); if(!request)return reply({ok:false,error:"request_text required"},400);
    const jobId=text(body?.job_id), customerId=text(body?.customer_id); let job:any=null;
    if(jobId){
      const {data,error}=await db.from("jobs").select("id,customer_id,customer_name,technician_id,technician,title,status,deleted_at").eq("id",jobId).is("deleted_at",null).maybeSingle(); if(error)throw error; if(!data)return reply({ok:false,error:"Job not found"},404); job=data;
      if(role==="technician"&&String(job.technician_id||"")!==String(member.id))return reply({ok:false,error:"Technician may prepare documents only for an assigned job"},403);
    }
    if(role==="technician"&&customerId&&!job)return reply({ok:false,error:"Technician customer context requires an assigned job_id"},403);
    if(job&&customerId&&String(job.customer_id||"")!==customerId)return reply({ok:false,error:"customer_id does not match the assigned job"},400);
    const {data:catalog,error:catErr}=await db.from("products").select("id,name,category,category_id,details,rate,default_qty,taxable,active").eq("active",true); if(catErr)throw catErr;
    const taxRate=Math.max(0,Math.min(25,n(body?.tax_rate)||6.25)); const total=parseMoney(request,body?.total_with_tax||body?.total);
    const draft=buildDraft(catalog||[],request,total,taxRate);
    const result={...draft,job:job?{id:job.id,customer_id:job.customer_id,customer_name:job.customer_name,title:job.title,status:job.status}:null,requested_by:{team_id:member.id,name:member.name,role},can_persist:false,next_step:role==="technician"?"Review the draft, then submit it for office/owner approval before creating or sending a financial document.":"Review and explicitly approve before creating or sending the financial document."};
    await db.from("ai_command_log").insert({user_id:user.id,command:request,classified_intent:"prepare_service_document",action_type:"draft_only",result,status:"completed"}).then(()=>{}).catch(()=>{});
    return reply({ok:true,result});
  }catch(e:any){console.error("ai-technician-assistant",e);return reply({ok:false,error:e?.message||"Assistant failed"},500)}
});
