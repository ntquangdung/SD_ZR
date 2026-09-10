import { createContext } from "react";

export type AuthUser = {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  role?: number;
  allowedAccountId?: string;
} | null;

export interface AuthContextValue {
  user: AuthUser;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
