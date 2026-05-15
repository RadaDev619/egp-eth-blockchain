"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthenticatedUser, LoginResponse } from "@/types/auth";
import { authApi, clearSessionToken, hasSessionToken, saveSessionToken } from "@/services/apiClient";

type SessionState = {
  user: AuthenticatedUser | null;
  loading: boolean;
  error: string | null;
};

export function useSession() {
  const [state, setState] = useState<SessionState>({
    user: null,
    loading: true,
    error: null
  });

  const refresh = useCallback(async () => {
    if (!hasSessionToken()) {
      setState({ user: null, loading: false, error: null });
      return null;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { user } = await authApi.getMe();
      setState({ user, loading: false, error: null });
      return user;
    } catch (error) {
      clearSessionToken();
      setState({
        user: null,
        loading: false,
        error: error instanceof Error ? error.message : "Session check failed."
      });
      return null;
    }
  }, []);

  const establishSession = useCallback((response: LoginResponse) => {
    saveSessionToken(response.token);
    setState({
      user: response.user,
      loading: false,
      error: null
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      if (hasSessionToken()) {
        await authApi.logout();
      }
    } finally {
      clearSessionToken();
      setState({ user: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      ...state,
      authenticated: Boolean(state.user),
      refresh,
      establishSession,
      logout
    }),
    [establishSession, logout, refresh, state]
  );
}
