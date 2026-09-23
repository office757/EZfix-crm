import { createClient } from "npm:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function context(req:Request){
 const h=req.headers.get("Authorization")??""; if(!h.startsWith("Bearer ")) return null;
 const token=h.slice(7); const c=createClient(url,anon,{global:{headers:{Authorization:h}}});
 const {data,error}=await c.auth.getUser(token); if(error||!data.user) return null;
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:member}=await admin.from("team").select("id").eq("auth_user_id",data.user.id).eq("status","active").maybeSingle();
 return member?{admin,member}:null;
}
const TYPES=["text.received","text.sent","text.delivered","text.delivery_failed","text.delivery_unconfirmed"];
Deno.serve(async(req)=>{
 if(req.method!=="GET"&&req.method!=="POST") return Response.json({error:"Method not allowed"},{status:405});
 const ctx=await context(req); if(!ctx) return Response.json({error:"Unauthorized"},{status:401});
 const {data,error}=await ctx.admin.from("inkbox_events").select("id, provider_event_id, event_type, provider_message_id, provider_conversation_id, direction, local_phone_number, remote_phone_number, message_text, message_type, delivery_status, provider_created_at, received_at, processing_status").eq("processing_status","unprocessed").in("event_type",TYPES).order("received_at",{ascending:true}).limit(50);
 if(error) return Response.json({error:"Query failed"},{status:500});
 return Response.json({events:data??[]});
});