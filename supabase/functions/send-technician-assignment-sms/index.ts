import { Inkbox } from "npm:@inkbox/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const IDENTITY="ashley-ezfixgaragedoorsinc",LOCAL="+14139613223";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"content-type":"application/json"}});

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return json({error:"unauthorized"},401);

  const scoped=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await scoped.auth.getUser(auth.slice(7));
  if(!user)return json({error:"unauthorized"},401);

  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:caller}=await db.from("team").select("id,role,status").eq("auth_user_id",user.id).eq("status","active").maybeSingle();
  if(!caller||!["owner","admin","dispatcher"].includes(String(caller.role).toLowerCase()))return json({error:"forbidden"},403);

  const b=await req.json().catch(()=>null),jobId=String(b?.job_id||"").trim(),techId=String(b?.technician_id||"").trim();
  if(!jobId||!techId)return json({error:"job_id_and_technician_id_required"},400);

  const [{data:job},{data:tech}]=await Promise.all([
    db.from("jobs").select("id,job_number,customer_id,customer_name,title,scheduled_date,appointment_window,technician_id").eq("id",jobId).is("deleted_at",null).maybeSingle(),
    db.from("team").select("id,name,phone,status").eq("id",techId).maybeSingle()
  ]);
  if(!job||job.technician_id!==techId)return json({error:"assignment_mismatch"},409);
  if(!tech||tech.status!=="active")return json({error:"technician_unavailable"},409);

  const digits=String(tech.phone||"").replace(/\D/g,"");
  const to=digits.length===10?"+1"+digits:digits.length===11&&digits.startsWith("1")?"+"+digits:"";
  if(!/^\+1\d{10}$/.test(to))return json({error:"invalid_technician_phone"},409);

  const dedupe=`tech_assignment:${jobId}:${techId}`;
  const message=`EZfix: New job assigned — ${job.scheduled_date||"date pending"}${job.appointment_window?" · "+job.appointment_window:""}. Customer: ${job.customer_name||"Customer"}. ${job.title||"Service call"}. Check CRM for full details.`.slice(0,500);

  const {data:prior}=await db.from("sms_messages")
    .select("id,provider_status")
    .eq("message_type","technician_assignment")
    .contains("provider_event_ids",[dedupe])
    .limit(1).maybeSingle();

  let smsId=prior?.id||("sms_"+crypto.randomUUID());
  const priorStatus=String(prior?.provider_status||"").toLowerCase();
  if(prior&&priorStatus&&!["failed","error"].includes(priorStatus)){
    return json({ok:true,duplicateSafe:true,smsId,status:priorStatus});
  }

  const now=new Date().toISOString();
  if(prior){
    await db.from("sms_messages").update({
      customer_id:job.customer_id||null,remote_phone_number:to,normalized_remote_phone:to,
      message_text:message,provider_status:"retrying",failed_at:null,failure_reason:null,updated_at:now
    }).eq("id",smsId);
  }else{
    const {error:insertErr}=await db.from("sms_messages").insert({
      id:smsId,provider:"inkbox",channel:"sms",provider_event_ids:[dedupe],direction:"outbound",
      local_phone_number:LOCAL,remote_phone_number:to,normalized_remote_phone:to,message_text:message,
      message_type:"technician_assignment",provider_status:"pending",customer_id:job.customer_id||null,
      created_at:now,updated_at:now
    });
    if(insertErr){
      if(insertErr.code==="23505"){
        const {data:race}=await db.from("sms_messages").select("id,provider_status").eq("message_type","technician_assignment").contains("provider_event_ids",[dedupe]).limit(1).maybeSingle();
        return json({ok:true,duplicateSafe:true,smsId:race?.id||null,status:race?.provider_status||"pending"});
      }
      return json({ok:false,error:"assignment_attempt_create_failed"},500);
    }
  }

  try{
    const inkbox=new Inkbox({apiKey:Deno.env.get("INKBOX_API_KEY")!});
    const identity=await inkbox.getIdentity(IDENTITY);
    const sent:any=await identity.sendText({to,text:message});
    const sentAt=new Date().toISOString(),status=String(sent.deliveryStatus||"queued").toLowerCase();
    await db.from("sms_messages").update({
      provider_message_id:sent.id??null,provider_conversation_id:sent.conversationId??null,
      provider_status:status,provider_created_at:sent.createdAt??sentAt,sent_at:sentAt,
      delivered_at:status==="delivered"?sentAt:null,updated_at:sentAt
    }).eq("id",smsId);
    return json({ok:true,accepted:true,status,smsId});
  }catch(e){
    const failedAt=new Date().toISOString(),reason=(e instanceof Error?e.message:String(e)).slice(0,500);
    console.error("technician assignment sms failed",e);
    await db.from("sms_messages").update({provider_status:"failed",failed_at:failedAt,failure_reason:reason,updated_at:failedAt}).eq("id",smsId);
    return json({ok:false,error:"technician_assignment_sms_failed",smsId,retryable:true},502);
  }
});