import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { AuthProvider } from "@/contexts/AuthContext";
import "./styles/responsive.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadingProvider>
      <AuthProvider>
        <App />
        <LoadingOverlay />
      </AuthProvider>
    </LoadingProvider>
  </StrictMode>
);
