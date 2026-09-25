import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function findAuthUserByEmail(admin: any, email: string) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = (data?.users || []).find((u: any) => String(u.email || "").toLowerCase() === target);
    if (found) return found;
    if (!data?.users || data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, service);
    const { data: caller, error: callerErr } = await admin.from("team").select("id,name,role,status").eq("auth_user_id", user.id).maybeSingle();
    if (callerErr) throw callerErr;
    if (!caller || !["owner", "admin"].includes(String(caller.role).toLowerCase()) || String(caller.status).toLowerCase() !== "active") {
      return json({ error: "Owner/Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "invite").trim().toLowerCase();
    const teamId = String(body.teamId || "").trim();
    if (!teamId) return json({ error: "teamId is required" }, 400);

    const { data: member, error: memberErr } = await admin.from("team").select("id,name,email,role,status,auth_user_id").eq("id", teamId).maybeSingle();
    if (memberErr) throw memberErr;
    if (!member) return json({ error: "Team member not found" }, 404);
    if (caller.role === "admin" && member.role === "owner") return json({ error: "Admins cannot manage an owner account" }, 403);

    if (action === "status") {
      let authUser = null;
      if (member.auth_user_id) {
        const { data, error } = await admin.auth.admin.getUserById(member.auth_user_id);
        if (!error) authUser = data?.user || null;
      }
      return json({
        ok: true,
        teamId: member.id,
        linked: !!member.auth_user_id,
        authUserId: member.auth_user_id || null,
        email: member.email || null,
        emailConfirmedAt: authUser?.email_confirmed_at || null,
        lastSignInAt: authUser?.last_sign_in_at || null,
      });
    }

    if (action !== "invite") return json({ error: "Unsupported action" }, 400);
    if (String(member.status).toLowerCase() !== "active") return json({ error: "Reactivate this team member before inviting access" }, 400);
    if (!member.email) return json({ error: "Team member needs an email address" }, 400);

    if (member.auth_user_id) {
      const { data } = await admin.auth.admin.getUserById(member.auth_user_id);
      return json({
        ok: true,
        alreadyLinked: true,
        teamId: member.id,
        authUserId: member.auth_user_id,
        email: member.email,
        emailConfirmedAt: data?.user?.email_confirmed_at || null,
      });
    }

    const existing = await findAuthUserByEmail(admin, member.email);
    if (existing?.id) {
      const { error: linkExistingErr } = await admin.from("team").update({ auth_user_id: existing.id, updated_at: new Date().toISOString() }).eq("id", member.id).is("auth_user_id", null);
      if (linkExistingErr) throw linkExistingErr;
      await admin.from("audit_log").insert({
        id: crypto.randomUUID(), action: "user_linked", summary: `Linked existing login to ${member.name || member.email}`,
        entity_type: "team", entity_id: member.id, source: "team_admin", created_by_team_id: caller.id, read: false,
      });
      return json({ ok: true, linkedExisting: true, teamId: member.id, authUserId: existing.id, email: member.email, emailConfirmedAt: existing.email_confirmed_at || null });
    }

    const redirectTo = typeof body.redirectTo === "string" && /^https:\/\//i.test(body.redirectTo) ? body.redirectTo : undefined;
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(member.email, {
      redirectTo,
      data: { team_id: member.id, role: member.role, name: member.name },
    });
    if (inviteErr) throw inviteErr;
    if (!invited?.user?.id) throw new Error("Invite did not return a user");

    const { error: linkErr } = await admin.from("team").update({ auth_user_id: invited.user.id, updated_at: new Date().toISOString() }).eq("id", member.id).is("auth_user_id", null);
    if (linkErr) throw linkErr;
    await admin.from("audit_log").insert({
      id: crypto.randomUUID(), action: "user_invited", summary: `Invited ${member.name || member.email} to EZfix CRM`,
      entity_type: "team", entity_id: member.id, source: "team_admin", created_by_team_id: caller.id, read: false,
    });

    return json({ ok: true, invited: true, teamId: member.id, authUserId: invited.user.id, email: member.email });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Team account action failed" }, 400);
  }
});