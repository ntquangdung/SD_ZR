import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LoadingContext } from "./loadingContextValue";

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

  const showLoading = useCallback((key: string) => {
    setLoadingStates((prev) => ({ ...prev, [key]: true }));
  }, []);

  const closeLoading = useCallback((key: string) => {
    setLoadingStates((prev) => {
      const newStates = { ...prev };
      delete newStates[key];
      return newStates;
    });
  }, []);

  const isLoading = useCallback((key: string) => {
    return loadingStates[key] || false;
  }, [loadingStates]);

  const isAnyLoading = useCallback(() => {
    return Object.values(loadingStates).some((loading) => loading);
  }, [loadingStates]);

  const value = useMemo(
    () => ({ loadingStates, showLoading, closeLoading, isLoading, isAnyLoading }),
    [loadingStates, showLoading, closeLoading, isLoading, isAnyLoading],
  );

  return (
    <LoadingContext.Provider
      value={value}
    >
      {children}
    </LoadingContext.Provider>
  );
};
