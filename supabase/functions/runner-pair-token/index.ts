import { adminClient, json, postOnly, preflight, randomToken, requestJson, safeMessage, sha256 } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  const early = preflight(req) || postOnly(req);
  if (early) return early;

  try {
    const body = await requestJson(req, 10_000);
    const deviceCode = String(body.device_code || "");
    if (!/^blp_[A-Za-z0-9_-]{40,60}$/.test(deviceCode)) return json({ error: "invalid_device_code" }, 400);

    const supabase = adminClient();
    const token = `blr_${randomToken(32)}`;
    const { data, error } = await supabase.rpc("exchange_runner_pairing", {
      p_device_code_hash: await sha256(deviceCode),
      p_token_hash: await sha256(token),
    });
    if (error) {
      const reason = String(error.message || "pairing_failed");
      if (reason.includes("authorization_pending")) return json({ error: "authorization_pending" }, 428);
      if (reason.includes("expired_token")) return json({ error: "expired_token" }, 410);
      if (reason.includes("device_code_consumed")) return json({ error: "device_code_consumed" }, 409);
      if (reason.includes("invalid_device_code")) return json({ error: "invalid_device_code" }, 400);
      throw error;
    }
    const device = Array.isArray(data) ? data[0] : data;
    if (!device) throw new Error("device_exchange_failed");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("handle")
      .eq("id", device.owner_id)
      .single();
    if (profileError) throw profileError;

    return json({
      token,
      device_id: String(device.device_id),
      handle: profile.handle,
      paired_at: device.paired_at,
    });
  } catch (error) {
    console.error("runner-pair-token", safeMessage(error));
    return json({ error: "pairing_exchange_failed" }, 500);
  }
});
