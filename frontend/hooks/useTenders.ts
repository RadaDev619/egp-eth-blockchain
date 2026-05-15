"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { tenderApi } from "@/services/apiClient";
import type { Tender } from "@/types/procurement";

type TendersState = {
  tenders: Tender[];
  loading: boolean;
  error: string | null;
};

export function useTenders(enabled = true) {
  const [state, setState] = useState<TendersState>({
    tenders: [],
    loading: enabled,
    error: null
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState({ tenders: [], loading: false, error: null });
      return [];
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { tenders } = await tenderApi.list();
      setState({ tenders, loading: false, error: null });
      return tenders;
    } catch (error) {
      setState({
        tenders: [],
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load tenders."
      });
      return [];
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      ...state,
      refresh
    }),
    [refresh, state]
  );
}
