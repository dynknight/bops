"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useState } from "react";

export function LoginButton() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-6">
      <button
        className="rounded-full bg-ink px-4 py-2 text-[14px] font-medium text-white"
        onClick={() => {
          setError(null);
          const supabase = createBrowserSupabase();
          void supabase.auth
            .signInWithOAuth({ provider: "github", options: { redirectTo: `${location.origin}/auth/callback` } })
            .then(({ error: signInError }) => {
              if (signInError) setError(signInError.message);
            });
        }}
      >
        Continue with GitHub
      </button>
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </div>
  );
}
