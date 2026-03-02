import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchFiles, startSearchRuntime } from "./api";
import type { SearchHit, SearchProvider, SearchQuery } from "./types";

const DEFAULT_DEBOUNCE_MS = 120;

const DEFAULT_QUERY_OPTIONS: Omit<SearchQuery, "keyword"> = {
  offset: 0,
  limit: 50,
  matchPath: false,
  matchCase: false,
  regex: false,
  wholeWord: false,
  sort: "name_asc",
};

const asErrorMessage = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
};

interface UseSearchOptions {
  debounceMs?: number;
}

interface UseSearchResult {
  keyword: string;
  setKeyword: (value: string) => void;
  items: SearchHit[];
  loading: boolean;
  error: string | null;
  provider: SearchProvider | null;
  tookMs: number;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  moveSelection: (delta: number) => void;
  clear: () => void;
}

export function useSearch(options?: UseSearchOptions): UseSearchResult {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<SearchProvider | null>(null);
  const [tookMs, setTookMs] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const requestSeqRef = useRef(0);
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  useEffect(() => {
    void startSearchRuntime().catch(() => {
      // Search can still retry lazily on first query.
    });
  }, []);

  useEffect(() => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setItems([]);
      setLoading(false);
      setError(null);
      setProvider(null);
      setTookMs(0);
      setSelectedIndex(0);
      return;
    }

    const seq = ++requestSeqRef.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchFiles({
        ...DEFAULT_QUERY_OPTIONS,
        keyword: trimmed,
      })
        .then((page) => {
          if (requestSeqRef.current !== seq) return;
          setItems(page.items);
          setProvider(page.provider);
          setTookMs(page.tookMs);
          setSelectedIndex(page.items.length > 0 ? 0 : -1);
        })
        .catch((e) => {
          if (requestSeqRef.current !== seq) return;
          setItems([]);
          setProvider(null);
          setTookMs(0);
          setSelectedIndex(-1);
          setError(asErrorMessage(e));
        })
        .finally(() => {
          if (requestSeqRef.current === seq) {
            setLoading(false);
          }
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [keyword, debounceMs]);

  const clear = useCallback(() => {
    setKeyword("");
    setItems([]);
    setLoading(false);
    setError(null);
    setProvider(null);
    setTookMs(0);
    setSelectedIndex(0);
  }, []);

  const moveSelection = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      setSelectedIndex((current) => {
        const safeCurrent = current < 0 ? 0 : current;
        const next = (safeCurrent + delta + items.length) % items.length;
        return next;
      });
    },
    [items.length],
  );

  return useMemo(
    () => ({
      keyword,
      setKeyword,
      items,
      loading,
      error,
      provider,
      tookMs,
      selectedIndex,
      setSelectedIndex,
      moveSelection,
      clear,
    }),
    [
      clear,
      error,
      items,
      keyword,
      loading,
      moveSelection,
      provider,
      selectedIndex,
      tookMs,
    ],
  );
}
