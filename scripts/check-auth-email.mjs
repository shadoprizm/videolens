const project = 'pjetrkwsypvyndqbxoth';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN in the operator environment.');
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error(`Auth configuration could not be read (${response.status}).`);
const config = await response.json();
const expectedHook = `https://${project}.supabase.co/functions/v1/auth-email-sovereign`;
const healthy = config.hook_send_email_enabled === true &&
  config.hook_send_email_uri === expectedHook &&
  config.rate_limit_email_sent >= 100 &&
  config.external_email_enabled === true &&
  config.security_captcha_enabled === true;
console.log(JSON.stringify({
  healthy,
  provider: config.hook_send_email_enabled ? 'Sovereign Mail hook' : 'SMTP/default provider',
  hookMatches: config.hook_send_email_uri === expectedHook,
  emailsPerHour: config.rate_limit_email_sent,
  resendIntervalSeconds: config.smtp_max_frequency,
  captchaEnabled: config.security_captcha_enabled,
}));
if (!healthy) process.exitCode = 1;
