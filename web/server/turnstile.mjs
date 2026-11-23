export function turnstileConfig(env, origin) {
  const sitekey = env.TURNSTILE_SITE_KEY || "";
  const secret = env.TURNSTILE_SECRET || "";
  const hostname = new URL(origin).hostname;
  const hostnames = new Set((env.TURNSTILE_HOSTNAMES || "").split(",").map(x => x.trim()).filter(Boolean));
  const enabled = !!(sitekey || secret || env.TURNSTILE_HOSTNAMES);
  const ready = !!(sitekey && secret && hostnames.size === 1 && hostnames.has(hostname));
  return { enabled, ready, sitekey: ready ? sitekey : "", secret, hostname };
}

export async function verifyTurnstile(config, token, action, request = fetch) {
  if (!config.ready || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const response = await request("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ secret: config.secret, response: token }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true && result.action === action && result.hostname === config.hostname;
  } catch {
    return false;
  }
}
