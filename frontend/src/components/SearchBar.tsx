"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";

interface SearchBarProps {
  onSelect: (symbol: string) => void;
  onError?: (message: string) => void;
}

export function SearchBar({ onSelect, onError }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.search(value);
        setResults(data.results || []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (symbol: string) => {
    setQuery(symbol);
    setOpen(false);
    onSelect(symbol);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);

    // If it looks like a ticker symbol (all caps, short), try directly
    // Otherwise, search first to resolve company name → symbol
    try {
      const data = await api.search(q);
      const matches = data.results || [];
      if (matches.length > 0) {
        onSelect(matches[0].symbol);
      } else {
        // No results found
        onError?.(`Aucune action trouvée pour « ${q} ». Vérifiez le nom ou le symbole.`);
      }
    } catch {
      // Search failed, try as raw symbol as last resort
      onSelect(q.toUpperCase());
    }
  };

  return (
    <div ref={wrapperRef} className="relative max-w-2xl mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Rechercher une action (ex: Apple, AAPL, Tesla...)"
            className="w-full pl-12 pr-10 py-3 rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-zinc-700"
            >
              <X className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>
      </form>

      {/* Dropdown */}
      {open && (results.length > 0 || loading) && (
        <div className="absolute top-full mt-2 w-full rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] shadow-xl z-50 overflow-hidden">
          {loading ? (
            <div className="px-4 py-3 text-zinc-400 text-sm">
              Recherche en cours...
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelect(r.symbol)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#2a2a3e] transition-colors text-left"
              >
                <div>
                  <span className="font-semibold text-white">{r.symbol}</span>
                  <span className="ml-2 text-zinc-400 text-sm">{r.name}</span>
                </div>
                <span className="text-xs text-zinc-500">{r.exchange}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
