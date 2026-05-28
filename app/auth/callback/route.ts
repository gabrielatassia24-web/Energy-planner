import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type       = request.nextUrl.searchParams.get("type");
  const code       = request.nextUrl.searchParams.get("code");

  const home  = new URL("/",      request.url);
  const login = new URL("/login", request.url);

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as "magiclink" | "email" });
      if (!error) return NextResponse.redirect(home);
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(home);
    }
  } catch (err) {
    console.error("auth/callback error:", err);
  }

  return NextResponse.redirect(login);
}
