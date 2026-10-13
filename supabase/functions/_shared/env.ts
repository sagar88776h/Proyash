/** Reads function configuration from Deno environment variables (Deno only). */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function listEnv(name: string): string[] {
  return (optionalEnv(name) ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
