import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID ?? "",
    client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? "Failed to refresh Google access token");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    refreshToken: data.refresh_token ?? refreshToken,
  };
}

const nextAuth = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: "true",
          scope: SCOPES,
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: persist tokens onto the JWT
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          error: undefined,
        };
      }

      // Still valid — keep using the current access token
      if (
        typeof token.expiresAt === "number" &&
        Date.now() < token.expiresAt * 1000 - 30_000
      ) {
        return token;
      }

      // No refresh token: cannot refresh, surface error
      if (!token.refreshToken || typeof token.refreshToken !== "string") {
        return { ...token, error: "RefreshAccessTokenError" };
      }

      try {
        const refreshed = await refreshGoogleAccessToken(token.refreshToken);
        return {
          ...token,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
          refreshToken: refreshed.refreshToken,
          error: undefined,
        };
      } catch {
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      (session as { error?: string }).error =
        typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
});

export const { auth, signIn, signOut } = nextAuth;
export const { GET, POST } = nextAuth.handlers;
