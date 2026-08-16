import { adminClient, bearer, json, postOnly, preflight, requestJson, safeMessage } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  const early = preflight(req) || postOnly(req);
  if (early) return early;

  try {
    const jwt = bearer(req);
    if (!jwt) return json({ error: "authentication_required" }, 401);
    const supabase = adminClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user) return json({ error: "invalid_session" }, 401);

    const body = await requestJson(req, 10_000);
    const code = String(body.user_code || "").trim().toUpperCase();
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) return json({ error: "invalid_user_code" }, 400);

    const { data: pairing, error: findError } = await supabase
      .from("runner_pairing_requests")
      .select("id, device_name, approved_by, expires_at, consumed_at")
      .eq("user_code", code)
      .maybeSingle();
    if (findError) throw findError;
    if (!pairing || new Date(pairing.expires_at).getTime() <= Date.now()) return json({ error: "invalid_or_expired_code" }, 404);
    if (pairing.consumed_at) return json({ error: "code_already_used" }, 409);
    if (pairing.approved_by && pairing.approved_by !== authData.user.id) return json({ error: "code_already_approved" }, 409);

    if (!pairing.approved_by) {
      const { data: updated, error: updateError } = await supabase
        .from("runner_pairing_requests")
        .update({ approved_by: authData.user.id, approved_at: new Date().toISOString() })
        .eq("id", pairing.id)
        .is("approved_by", null)
        .is("consumed_at", null)
        .select("approved_by")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated || updated.approved_by !== authData.user.id) return json({ error: "code_already_approved" }, 409);
    }

    return json({ approved: true, device_name: pairing.device_name });
  } catch (error) {
    console.error("runner-pair-approve", safeMessage(error));
    return json({ error: "pairing_approval_failed" }, 500);
  }
});
