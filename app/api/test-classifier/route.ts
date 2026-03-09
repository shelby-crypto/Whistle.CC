import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 10) ?? "(not set)";

  const diagnostics: Record<string, unknown> = {
    anthropic_api_key_set: hasKey,
    key_prefix: keyPrefix + "...",
    auth_secret_set: !!process.env.AUTH_SECRET,
    nextauth_secret_set: !!process.env.NEXTAUTH_SECRET,
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_role_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  // Quick Anthropic API test
  if (hasKey) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{ role: "user", content: "Say hello in 5 words" }],
      });
      diagnostics.anthropic_api_test = "SUCCESS";
      diagnostics.anthropic_response = response.content[0]?.type === "text" ? response.content[0].text : "(no text)";
    } catch (err) {
      diagnostics.anthropic_api_test = "FAILED";
      diagnostics.anthropic_error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(diagnostics, { status: 200 });
}
