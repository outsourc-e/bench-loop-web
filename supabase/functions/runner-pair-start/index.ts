import { adminClient, json, postOnly, preflight, randomToken, randomUserCode, requestJson, safeMessage, sha256 } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  const early = preflight(req) || postOnly(req);
  if (early) return early;

  try {
    const body = await requestJson(req, 20_000);
    const deviceName = String(body.device_name || "BenchLoop Runner").trim();
    const publicKey = body.public_key == null ? null : String(body.public_key);
    const capabilities = body.capabilities && typeof body.capabilities === "object" ? body.capabilities : {};
    if (!deviceName || deviceName.length > 100 || (publicKey && publicKey.length > 10_000)) {
      return json({ error: "invalid_device" }, 400);
    }

    const supabase = adminClient();
    const expiresIn = 600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const deviceCode = `blp_${randomToken(32)}`;
    const deviceCodeHash = await sha256(deviceCode);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const userCode = randomUserCode();
      const { error } = await supabase.from("runner_pairing_requests").insert({
        device_code_hash: deviceCodeHash,
        user_code: userCode,
        device_name: deviceName,
        public_key: publicKey,
        capabilities,
        expires_at: expiresAt,
      });
      if (!error) {
        const site = (Deno.env.get("BENCHLOOP_SITE_URL") || "https://bench-loop.com").replace(/\/$/, "");
        return json({
          device_code: deviceCode,
          user_code: userCode,
          verification_uri: `${site}/connect`,
          expires_in: expiresIn,
          interval: 3,
        });
      }
      if (error.code !== "23505") throw error;
    }
    return json({ error: "pairing_capacity" }, 503);
  } catch (error) {
    const message = safeMessage(error);
    return json({ error: message === "payload_too_large" ? message : "pairing_start_failed" }, message === "payload_too_large" ? 413 : 500);
  }
});
