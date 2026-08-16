/// <reference lib="deno.ns" />

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

export function postOnly(req: Request): Response | null {
  return req.method === "POST" ? null : json({ error: "method_not_allowed" }, 405);
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !key) throw new Error("missing_supabase_server_environment");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requestJson(req: Request, maxBytes = 2_000_000): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new Error("payload_too_large");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("payload_too_large");
  const parsed = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json_object");
  return parsed as Record<string, unknown>;
}

export function bearer(req: Request): string | null {
  const value = req.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : null;
}

export function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function randomUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected_error";
}
