import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const BUSINESS_TRANSFER="+17742445533";
const digits=(v:any)=>String(v||"").replace(/\D/g,"").slice(-10),clean=(v:any)=>typeof v==="string"&&v.trim()?v.trim():null;
const partyOf=(x:any)=>String(x?.party||x?.speaker||"").toLowerCase();
const textOf=(t:any)=>Array.isArray(t)?t.map((x:any)=>String(x?.text||"")).join("\n"):typeof t==="string"?t:"";
const localLines=(t:any)=>Array.isArray(t)?t.filter((x:any)=>["local","assistant","agent"].includes(partyOf(x))).map((x:any)=>String(x?.text||"")):[];
const localTextOf=(t:any)=>localLines(t).join("\n");
const remoteTextOf=(t:any)=>Array.isArray(t)?t.filter((x:any)=>["remote","caller","user"].includes(partyOf(x))).map((x:any)=>String(x?.text||"")).join("\n"):typeof t==="string"?t:"";
function guardrails(t:any,assignmentAllowed:boolean){
 const local=localTextOf(t), lines=localLines(t);
 const paymentAmountPrompt=/\b(payment amount|exact amount|dollar amount|amount (?:would|do|should) you (?:like|want|use)|how much (?:would|do|should) you (?:like|want) to pay)\b/i.test(local);
 const paymentSchedulingClaim=lines.some((line:string)=>/\b(?:schedule|arrange|set up|book)\b.{0,35}\b(?:payment|payment amount|dollar amount)\b|\b(?:payment|payment amount|dollar amount)\b.{0,35}\b(?:schedule|arrange|set up|book)\b/i.test(line));
 const definitiveBookingRe=/\b(?:your appointment (?:is|has been) (?:booked|scheduled|confirmed|reserved)|you(?:['’]re| are) (?:booked|scheduled|confirmed|reserved)|i(?:['’]ve| have) (?:booked|scheduled|confirmed|reserved)|i(?:['’]ll| will| can(?: help)?) (?:book|schedule|arrange|reserve)|your service (?:is|has been) (?:booked|scheduled|confirmed|reserved)|(?:technician|tech) (?:will|is going to) (?:arrive|be there))\b/i;
 const qualificationRe=/\b(?:request|requested|preference|preferred|tentative|pending|subject to|availability|once .{0,24}confirm|will confirm|need to confirm|not confirmed|follow up to confirm)\b/i;
 const unverifiedLines=lines.filter((line:string)=>definitiveBookingRe.test(line)&&!qualificationRe.test(line));
 const unverified=unverifiedLines.length>0;
 let unsupportedPricing=false;
 for(const line of lines){
  const refusal=/(?:can't|cannot|unable|don't|do not|not able).{0,35}(?:quote|price|cost)|(?:price|cost|amount).{0,35}(?:approved estimate|existing estimate|invoice|business system|confirm)/i.test(line);
  const amountClaim=/\$\s*\d|\b(?:price|cost|charge|total|quote|estimate)\s*(?:is|would be|will be|comes to|around|about)?\s*\$?\s*\d/i.test(line);
  if(amountClaim&&!refusal){unsupportedPricing=true;break;}
 }
 const assignmentClaim=/\b(?:i(?:['’]ve| have)?\s*(?:assigned|dispatched)|i(?:['’]ll| will)\s+(?:assign|dispatch|send)|(?:your|the)\s+(?:technician|tech)\s+(?:is|will be)|(?:technician|tech)\s+[A-Z][a-z]+\s+(?:is|will be))\b/i.test(local);
 const unauthorizedAssignment=assignmentClaim&&!assignmentAllowed;
 const evidence:string[]=[];
 if(paymentAmountPrompt)evidence.push("Local assistant requested a payment amount during appointment intake.");
 if(paymentSchedulingClaim)evidence.push("Local assistant treated a payment as something to schedule or arrange during service intake.");
 if(unsupportedPricing)evidence.push("Local assistant stated a specific price or amount without verified CRM pricing evidence.");
 if(unverified)evidence.push("Local assistant used definitive booking language without same-line confirmation or availability qualification.");
 if(unauthorizedAssignment)evidence.push("Local assistant claimed technician assignment while server-side assignment permission is disabled.");
 return {payment_amount_prompt_detected:paymentAmountPrompt,payment_scheduling_claim_detected:paymentSchedulingClaim,unsupported_pricing_detected:unsupportedPricing,unverified_definitive_scheduling_detected:unverified,unverified_scheduling_lines:unverifiedLines.slice(0,3),unauthorized_assignment_claim_detected:unauthorizedAssignment,assignment_permission_enabled:assignmentAllowed,requires_review:evidence.length>0,evidence:evidence.length?evidence.join(" "):null};
}
function parse(text:string){
 const one=text.replace(/\s+/g," ").trim();
 const human=/(?:speak|talk|transfer|connect).{0,35}(?:human|person|someone|owner|manager|representative)|(?:human|person|someone|owner|manager|representative).{0,35}(?:please|now|talk|speak)/i.test(one);
 const preferred=clean(one.match(/\b((?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this morning|this afternoon|this evening)(?:.{0,70}?(?:between\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:and|to|-)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|morning|afternoon|evening))?)/i)?.[1]);
 return {human_transfer_requested:human,transfer_number:human?BUSINESS_TRANSFER:null,name:clean(one.match(/(?:my name is|this is|name(?: is|:))\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2})/i)?.[1]),phone:clean(one.match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/)?.[0]),email:clean(one.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]),address:clean(one.match(/(?:(?:service|property) address(?: is|:)|address(?: is|:)|located at|live at|property(?: is)? at)\s+(.{5,100}?)(?=(?:\s+(?:phone|email|garage|door|need|issue|problem|appointment|$)))/i)?.[1]),service_requested:clean(one.match(/(?:need|calling (?:about|for)|looking for|issue(?: is|:)|problem(?: is|:)|service(?: is|:))\s+(.{3,140}?)(?=(?:\s+(?:my name|name is|phone|email|address|located|appointment|$)))/i)?.[1]),preferred_service_window:preferred};
}
function missingFields(ex:any){const out:string[]=[];if(!ex.name)out.push("name");if(!ex.phone)out.push("callback_phone");if(!ex.address)out.push("service_address");if(!ex.service_requested)out.push("service_requested");if(!ex.preferred_service_window)out.push("preferred_service_window");return out;}
function transferStatus(c:any,ex:any){const fw=Array.isArray(c?.provider_data?.forwardings)?c.provider_data.forwardings:[];const ok=fw.some((x:any)=>["forwarded","connected","answered","completed"].includes(String(x?.status||"").toLowerCase()));if(ok)return "forwarded";if(fw.length)return "failed";if(ex?.human_transfer_requested)return "requested_unfulfilled";return "not_requested";}
function outcomeFor(c:any,g:any,ex:any,linkType:string|null,txStatus:string){const missed=(String(c?.status||"").toLowerCase()==="canceled"||String(c?.provider_data?.hangupReason||"").toLowerCase()==="missed")&&!textOf(c?.transcript);if(missed)return "missed";if(txStatus==="forwarded")return "human_transferred";if(ex?.human_transfer_requested)return "human_transfer_requested";if(g?.requires_review)return "guardrail_review";if(linkType==="customer")return "linked_customer";if(linkType==="lead")return "lead_created_or_linked";if(ex?.service_requested)return "service_request_captured";return String(c?.status||"").toLowerCase()==="completed"?"completed":"needs_review";}
function assignmentState(c:any,allowed:boolean,techs:any[]){const requested=clean(c?.provider_data?.requested_technician_id||c?.provider_data?.assignment?.technician_id||c?.lead_extraction?.requested_technician_id);if(!requested)return {permitted:allowed,requested_technician_id:null,assigned_technician_id:null,status:"not_requested"};if(!allowed)return {permitted:false,requested_technician_id:requested,assigned_technician_id:null,status:"blocked_permission"};const tech=techs.find((x:any)=>x.id===requested&&String(x.status||"").toLowerCase()==="active");if(!tech)return {permitted:true,requested_technician_id:requested,assigned_technician_id:null,status:"invalid_technician"};return {permitted:true,requested_technician_id:requested,assigned_technician_id:tech.id,assigned_technician_name:tech.name,status:"assigned"};}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return new Response(JSON.stringify({ok:false,error:"Unauthorized"}),{status:401,headers:cors});
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await uc.auth.getUser();if(!user)return new Response(JSON.stringify({ok:false,error:"Unauthorized"}),{status:401,headers:cors});
  const db=createClient(url,service);const {data:team}=await db.from("team").select("id,status").eq("auth_user_id",user.id).maybeSingle();if(!team||String(team.status).toLowerCase()!=="active")return new Response(JSON.stringify({ok:false,error:"Forbidden"}),{status:403,headers:cors});
  const [{data:perm},{data:techs}]=await Promise.all([db.from("ai_permissions").select("enabled,level,auto_limit").eq("domain","ai_receptionist").eq("action","assign_technician").maybeSingle(),db.from("team").select("id,name,status,role").ilike("role","technician")]);
  const assignmentAllowed=!!perm?.enabled;
  const {data:recentCalls,error:recentErr}=await db.from("calls").select("id,transcript,lead_extraction,remote_number,provider_data,status,outcome,lead_id,customer_id").not("provider_call_id","is",null).order("created_at",{ascending:false}).limit(100);if(recentErr)throw recentErr;let guardrailFlagged=0,metadataRefreshed=0;
  for(const c of recentCalls||[]){
   const parsed:any=parse(remoteTextOf(c.transcript));if(!parsed.phone&&clean(c.remote_number))parsed.phone=clean(c.remote_number);const g=guardrails(c.transcript,assignmentAllowed),tx=transferStatus(c,parsed),asgn=assignmentState(c,assignmentAllowed,techs||[]),missing=missingFields(parsed),prior=(c.lead_extraction&&typeof c.lead_extraction==="object")?c.lead_extraction:{};
   const next={...prior,...parsed,missing_fields:missing,caller_details_complete:missing.length===0,assignment:asgn,transfer_status:tx,receptionist_guardrails:g};if(g.requires_review)guardrailFlagged++;
   const linkType=c.customer_id?"customer":c.lead_id?"lead":null,outcome=outcomeFor(c,g,parsed,linkType,tx);
   if(JSON.stringify(prior)!==JSON.stringify(next)||c.outcome!==outcome){const {error:e}=await db.from("calls").update({lead_extraction:next,outcome}).eq("id",c.id);if(e)throw e;metadataRefreshed++;}
  }
  const {data:calls,error}=await db.from("calls").select("*").not("provider_call_id","is",null).is("lead_id",null).is("customer_id",null).order("created_at",{ascending:true}).limit(50);if(error)throw error;
  const [{data:customers},{data:leads}]=await Promise.all([db.from("customers").select("id,phone").is("deleted_at",null),db.from("leads").select("id,phone,source_call_id,assigned_technician_id,assignment_status").is("deleted_at",null)]);
  let created=0,linkedLead=0,linkedCustomer=0,skipped=0,assignmentsApplied=0;
  for(const c of calls||[]){
   const txText=remoteTextOf(c.transcript),ex:any=parse(txText);if(!ex.phone&&clean(c.remote_number))ex.phone=clean(c.remote_number);const g=guardrails(c.transcript,assignmentAllowed),tx=transferStatus(c,ex),asgn=assignmentState(c,assignmentAllowed,techs||[]);ex.missing_fields=missingFields(ex);ex.caller_details_complete=ex.missing_fields.length===0;ex.assignment=asgn;ex.transfer_status=tx;ex.receptionist_guardrails=g;const caller=clean(c.remote_number),d=digits(ex.phone||caller);
   const customer=d?(customers||[]).find((x:any)=>digits(x.phone)===d):null;
   if(customer){const outcome=outcomeFor(c,g,ex,"customer",tx);const {error:e}=await db.from("calls").update({customer_id:customer.id,lead_id:null,lead_extraction_status:"linked_customer",lead_extraction:ex,lead_extracted_at:new Date().toISOString(),outcome}).eq("id",c.id);if(e)throw e;linkedCustomer++;continue;}
   let lead:any=d?(leads||[]).find((x:any)=>digits(x.phone)===d):null;if(!lead&&c.provider_call_id)lead=(leads||[]).find((x:any)=>x.source_call_id===c.provider_call_id)||null;
   const enough=!!(ex.name||ex.phone||ex.email||ex.address||ex.service_requested);
   if(!lead&&enough){
    const id="lead_call_"+crypto.randomUUID().replaceAll("-","").slice(0,20);
    const notes=["AI receptionist call via Inkbox",ex.human_transfer_requested?`Caller requested a human. Transfer target: ${BUSINESS_TRANSFER}`:"",tx==="requested_unfulfilled"?"Live transfer was not recorded by the phone provider; human follow-up required.":"",g?.requires_review?"Receptionist guardrail review required.":"",ex.missing_fields?.length?`Missing caller details: ${ex.missing_fields.join(", ")}.`:"",c.summary?String(c.summary):"",textOf(c.transcript)?"Transcript available in Call History.":""].filter(Boolean).join("\n");
    const insert:any={id,name:ex.name||"New phone lead",email:ex.email,phone:ex.phone||caller,address:ex.address,notes,service_requested:ex.service_requested,source:"AI Receptionist",source_provider:"inkbox",source_channel:"phone",source_call_id:c.provider_call_id,status:"new",assignment_status:asgn.assigned_technician_id?"assigned":"unassigned"};if(asgn.assigned_technician_id)insert.assigned_technician_id=asgn.assigned_technician_id;
    const {data:n,error:e}=await db.from("leads").insert(insert).select("id,assigned_technician_id,assignment_status").single();if(e)throw e;lead=n;created++;if(asgn.assigned_technician_id)assignmentsApplied++;
   }else if(lead){linkedLead++;if(asgn.assigned_technician_id&&!lead.assigned_technician_id){const {error:aerr}=await db.from("leads").update({assigned_technician_id:asgn.assigned_technician_id,assignment_status:"assigned",updated_at:new Date().toISOString()}).eq("id",lead.id);if(aerr)throw aerr;lead={...lead,assigned_technician_id:asgn.assigned_technician_id,assignment_status:"assigned"};assignmentsApplied++;}}else skipped++;
   const outcome=outcomeFor(c,g,ex,lead?"lead":null,tx);const {error:u}=await db.from("calls").update({customer_id:null,lead_id:lead?.id||null,lead_extraction_status:lead?"created_or_linked":"needs_review",lead_extraction:ex,lead_extracted_at:new Date().toISOString(),outcome}).eq("id",c.id);if(u)throw u;
  }
  return new Response(JSON.stringify({ok:true,created,linkedLead,linkedCustomer,skipped,processed:(calls||[]).length,guardrailFlagged,metadataRefreshed,assignmentPermissionEnabled:assignmentAllowed,assignmentsApplied}),{headers:cors});
 }catch(e:any){console.error(e);return new Response(JSON.stringify({ok:false,error:e?.message||String(e)}),{status:500,headers:cors})}
});