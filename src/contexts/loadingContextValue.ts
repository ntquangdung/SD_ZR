import { createContext } from "react";

export interface LoadingContextValue {
  loadingStates: Record<string, boolean>;
  showLoading: (key: string) => void;
  closeLoading: (key: string) => void;
  isLoading: (key: string) => boolean;
  isAnyLoading: () => boolean;
}

export const LoadingContext = createContext<LoadingContextValue | undefined>(
  undefined,
);
