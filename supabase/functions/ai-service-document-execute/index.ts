import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:CORS});
const text=(v:any)=>String(v??"").trim();
const lower=(v:any)=>text(v).toLowerCase();
const URL=Deno.env.get("SUPABASE_URL")!,ANON=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 if(req.method!=="POST")return out({ok:false,error:"Method not allowed"},405);
 try{
  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return out({ok:false,error:"Unauthorized"},401);
  const scoped=createClient(URL,ANON,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await scoped.auth.getUser();
  if(!user)return out({ok:false,error:"Unauthorized"},401);

  const admin=createClient(URL,SERVICE,{auth:{persistSession:false}});
  const {data:member}=await admin.from("team").select("id,name,role,status").eq("auth_user_id",user.id).maybeSingle();
  if(!member||lower(member.status)!=="active")return out({ok:false,error:"Forbidden"},403);
  if(!["owner","admin","office","dispatcher"].includes(lower(member.role)))return out({ok:false,error:"Approval execution requires office access"},403);

  const body=await req.json().catch(()=>({}));
  const approvalId=text(body?.approval_id);
  if(!approvalId)return out({ok:false,error:"approval_id required"},400);

  const {data:approval,error:approvalErr}=await admin.from("ai_approvals")
    .select("id,domain,action,status,proposed_value,evidence,created_at")
    .eq("id",approvalId).maybeSingle();
  if(approvalErr)throw approvalErr;
  if(!approval)return out({ok:false,error:"Approval not found"},404);
  if(approval.domain!=="invoices"||approval.action!=="create_service_document")return out({ok:false,error:"Unsupported approval type"},400);
  if(approval.status!=="approved")return out({ok:false,error:"Approval must be approved before execution"},409);

  const proposed=approval.proposed_value||{};
  const documentType=text(proposed.document_type);
  if(!["invoice_draft","estimate_draft"].includes(documentType))return out({ok:false,error:"Only invoice and estimate drafts can be persisted"},400);
  if(proposed.pricing_verified!==true||proposed.catalog_integrity_verified!==true)return out({ok:false,error:"Approval is missing verified pricing/catalog integrity"},409);

  const jobId=text(proposed?.job?.id);
  if(!jobId)return out({ok:false,error:"Approved draft is missing job context"},400);
  const {data:job,error:jobErr}=await admin.from("jobs")
    .select("id,customer_id,customer_name,deleted_at")
    .eq("id",jobId).is("deleted_at",null).maybeSingle();
  if(jobErr)throw jobErr;
  if(!job)return out({ok:false,error:"Job not found"},404);

  const items=Array.isArray(proposed.items)?proposed.items:[];
  if(!items.length)return out({ok:false,error:"Approved draft has no line items"},400);

  const existingMarker="aiApprovalId";
  const targetTable=documentType==="estimate_draft"?"estimates":"invoices";
  const {data:existing}=await admin.from(targetTable)
    .select("id,number,app_data")
    .eq("app_data->>aiApprovalId",approvalId)
    .is("deleted_at",null)
    .limit(1).maybeSingle();
  if(existing)return out({ok:true,already_executed:true,document_type:targetTable==="invoices"?"invoice":"estimate",document:existing});

  const numberRpc=targetTable==="invoices"?"next_invoice_number":"next_estimate_number";
  const {data:numberData,error:numberError}=await admin.rpc(numberRpc);
  if(numberError)throw numberError;
  const number=text(numberData);
  if(!number)return out({ok:false,error:"Could not allocate document number"},500);
  const mappedItems=items.map((x:any)=>({
    desc:text(x.name||x.description||"Service"),
    details:text(x.description||""),
    qty:Number(x.qty)||1,
    rate:Number(x.rate)||0,
    taxable:x.taxable===true,
    productId:text(x.catalog_product_id)||null
  }));
  const appData={
    aiApprovalId:approvalId,
    aiGenerated:true,
    aiPricingVerified:true,
    aiCatalogIntegrityVerified:true,
    aiRequestedBy:proposed.requested_by||null,
    aiRequest:text(proposed.request||""),
    createdFromJobId:jobId
  };
  const common:any={
    id:crypto.randomUUID(),
    number,
    customer_id:job.customer_id||null,
    customer_name:job.customer_name||proposed?.job?.customer_name||"",
    date:new Date().toISOString().slice(0,10),
    tax_rate:Number(proposed?.totals?.tax_rate||0),
    discount:0,
    items:mappedItems,
    app_data:appData
  };
  let inserted:any;
  if(targetTable==="invoices"){
    const {data,error}=await admin.from("invoices").insert({...common,job_id:jobId,due_term:"On Receipt",payments:[],photos:[]}).select("id,number,customer_id,job_id,app_data").single();
    if(error)throw error; inserted=data;
  }else{
    const {data,error}=await admin.from("estimates").insert({...common,converted_job_id:jobId,status:"draft",photos:[]}).select("id,number,customer_id,converted_job_id,app_data").single();
    if(error)throw error; inserted=data;
  }

  const {error:updateApprovalErr}=await admin.from("ai_approvals").update({
    status:"executed",
    decided_at:new Date().toISOString(),
    decided_by_team_id:member.id
  }).eq("id",approvalId).eq("status","approved");
  if(updateApprovalErr)throw updateApprovalErr;

  await admin.from("audit_log").insert({
    id:crypto.randomUUID(),
    action:"ai_service_document_executed",
    summary:`AI-approved ${targetTable==="invoices"?"invoice":"estimate"} ${inserted.number} created from job ${jobId}`,
    entity_type:targetTable,
    entity_id:inserted.id,
    related_type:"ai_approvals",
    related_id:approvalId,
    source:"ai",
    priority:"normal",
    read:false,
    created_by_team_id:member.id
  });

  return out({ok:true,already_executed:false,document_type:targetTable==="invoices"?"invoice":"estimate",document:inserted});
 }catch(e:any){
  console.error("ai-service-document-execute",e);
  return out({ok:false,error:e?.message||"Execution failed"},500);
 }
});