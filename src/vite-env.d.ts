/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKOS_CLIENT_ID: string;
  readonly VITE_WORKOS_REDIRECT_URI: string;
  readonly VITE_CONVEX_URL: string;
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
