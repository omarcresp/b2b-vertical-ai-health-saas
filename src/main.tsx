import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProviderWithAuthKit } from "./ConvexProviderWithAuthKit";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "./components/theme-provider";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
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
          <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
            <App />
          </ConvexProviderWithAuthKit>
        </ThemeProvider>
      </AuthKitProvider>
    </ErrorBoundary>
  </StrictMode>,
);
