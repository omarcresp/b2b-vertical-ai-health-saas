import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProviderWithAuthKit } from "./ConvexProviderWithAuthKit";
import "./index.css";
import "./i18n";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { AppRouterProvider } from "./router";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
      staleTime: Infinity,
      gcTime: 10_000,
    },
  },
});
convexQueryClient.connect(queryClient);

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error('Missing root element with id "root".');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthKitProvider
        clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}
        redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI}
      >
        <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
          <QueryClientProvider client={queryClient}>
            <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
              <AppRouterProvider queryClient={queryClient} />
            </ConvexProviderWithAuthKit>
          </QueryClientProvider>
        </ThemeProvider>
      </AuthKitProvider>
    </ErrorBoundary>
  </StrictMode>,
);
