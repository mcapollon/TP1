"use client";

import { useState } from "react";
import { api, AIAnalysis } from "@/lib/api";
import { Bot, Send, RefreshCw } from "lucide-react";

interface AIAnalysisPanelProps {
  symbol: string;
}

export function AIAnalysisPanel({ symbol }: AIAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (customQuestion?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.aiAnalyze(symbol, customQuestion || undefined);
      if (result.error) {
        setError(result.error);
      } else {
        setAnalysis(result);
      }
    } catch (e: any) {
      setError(e.message || "Erreur lors de l'analyse IA");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      handleAnalyze(question.trim());
      setQuestion("");
    }
  };

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-400" />
          <h3 className="text-sm font-medium text-zinc-400">
            Analyse IA (Approche 2 — OpenRouter)
          </h3>
        </div>
        <button
          onClick={() => handleAnalyze()}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
          Analyser {symbol}
        </button>
      </div>

      {/* Custom question form */}
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Posez une question sur ${symbol} (ex: "Quelles sont les tendances ?")`}
            className="flex-1 px-4 py-2 rounded-lg bg-[#12121a] border border-[#2a2a3e] text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="p-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
          {error.includes("API key") && (
            <p className="text-red-300/60 text-xs mt-1">
              Configurez OPENROUTER_API_KEY dans backend/.env
            </p>
          )}
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="space-y-3">
          {analysis.question && (
            <p className="text-xs text-zinc-500">
              Question: &quot;{analysis.question}&quot;
            </p>
          )}
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-zinc-300 text-sm leading-relaxed">
              {analysis.analysis}
            </div>
          </div>
          <div className="pt-2 border-t border-[#2a2a3e] flex items-center justify-between">
            <span className="text-xs text-zinc-600">
              Modèle: {analysis.model}
            </span>
            <span className="text-xs text-zinc-600">
              {analysis.timestamp
                ? new Date(analysis.timestamp).toLocaleString("fr-FR")
                : ""}
            </span>
          </div>
        </div>
      )}

      {!analysis && !error && !loading && (
        <p className="text-sm text-zinc-600 text-center py-4">
          Cliquez sur &quot;Analyser&quot; ou posez une question pour obtenir une
          analyse IA de {symbol}.
        </p>
      )}
    </div>
  );
}
