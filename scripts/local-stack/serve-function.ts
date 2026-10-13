// Serves one edge function on a local port for the Docker-free stack:
//   deno run --allow-net --allow-env --allow-read --config supabase/functions/deno.json \
//     scripts/local-stack/serve-function.ts <name> <port>
const [name, port] = Deno.args;
if (!name || !port) throw new Error('usage: serve-function.ts <name> <port>');
const mod = await import(new URL(`../../supabase/functions/${name}/handler.ts`, import.meta.url).href);
Deno.serve({ hostname: '127.0.0.1', port: Number(port) }, mod.handler);
