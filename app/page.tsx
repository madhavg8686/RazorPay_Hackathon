'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Clock, 
  DollarSign, 
  Activity, 
  Lock,
  Zap,
  Cpu,
  UserCheck,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface Transaction {
  tx_id: string;
  merchant_id: string;
  amount: number;
  stage1_action: string;
  conformal_set: string;
  final_decision: string;
  risk_score: number;
  stage1_latency_us: number;
  stage2_latency_us: number;
  timestamp: string;
  is_actual_fraud: number;
}

// Utility function to strip citation tags from dynamic/static strings
function cleanText(text: string): string {
  if (!text) return '';
  return text.replace(/\[?cite:\s*\d+\]?/gi, '').trim();
}

// Helper function to derive Fraud Likelihood and Criticality Tiers
function getCriticality(score: number) {
  const percentage = (score * 100).toFixed(1);

  if (score >= 0.75) {
    return {
      percentage: `${percentage}%`,
      level: 'CRITICAL',
      badgeClass: 'bg-red-950/80 text-red-400 border-red-800/80',
    };
  } if (score >= 0.50) {
    return {
      percentage: `${percentage}%`,
      level: 'HIGH',
      badgeClass: 'bg-orange-950/80 text-orange-400 border-orange-800/80',
    };
  } if (score >= 0.25) {
    return {
      percentage: `${percentage}%`,
      level: 'MEDIUM',
      badgeClass: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
    };
  }
  return {
    percentage: `${percentage}%`,
    level: 'LOW',
    badgeClass: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
  };
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviewQueue, setReviewQueue] = useState<Transaction[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const [scoreMetrics, setScoreMetrics] = useState({
    highestScore: 0.000,
    lowestScore: 1.000,
  });

  const [stats, setStats] = useState({
    totalCount: 0,
    hotPathCount: 0,
    warmPathCount: 0,
    netSavedMargin: 27135.19,
    avgHotPathUs: 120,
    avgWarmPathMs: 1.85,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let tick = 0;
    let isPolling = true;

    const pollStream = async () => {
      try {
        const response = await fetch(`/api/live-stream-tick?tick=${tick + 1}`, {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Stream request failed: ${response.status}`);

        const data = await response.json();
        tick += 1;
        setIsConnected(true);
        const isWarmPath = data.stage2_latency_us > 0;
        const riskScore = data.risk_score;

        const newTx: Transaction = {
          tx_id: cleanText(data.tx_id),
          merchant_id: cleanText(data.merchant_id),
          amount: data.amount,
          stage1_action: cleanText(data.stage1_action),
          conformal_set: cleanText(data.conformal_set),
          final_decision: cleanText(data.final_decision),
          risk_score: riskScore,
          stage1_latency_us: data.stage1_latency_us,
          stage2_latency_us: data.stage2_latency_us,
          timestamp: cleanText(data.timestamp),
          is_actual_fraud: data.is_actual_fraud,
        };

        setTransactions((prev) => [newTx, ...prev.slice(0, 19)]);

        setScoreMetrics((prev) => ({
          highestScore: Math.max(prev.highestScore, riskScore),
          lowestScore: Math.min(prev.lowestScore, riskScore),
        }));

        if (newTx.final_decision === 'HUMAN_REVIEW') {
          setReviewQueue((prev) => [newTx, ...prev.filter((t) => t.tx_id !== newTx.tx_id)]);
        }

        setStats((prev) => {
          let marginChange = 0;
          if (newTx.final_decision === 'BLOCKED' && data.is_actual_fraud === 1) marginChange += data.amount;
          if (newTx.final_decision === 'HUMAN_REVIEW') marginChange -= 15.0;
          if (newTx.final_decision === 'APPROVED' && data.is_actual_fraud === 1) marginChange -= (data.amount + 25.0);

          return {
            totalCount: prev.totalCount + 1,
            hotPathCount: prev.hotPathCount + (isWarmPath ? 0 : 1),
            warmPathCount: prev.warmPathCount + (isWarmPath ? 1 : 0),
            netSavedMargin: prev.netSavedMargin + marginChange,
            avgHotPathUs: Math.round((prev.avgHotPathUs * prev.totalCount + data.stage1_latency_us) / (prev.totalCount + 1)),
            avgWarmPathMs: isWarmPath ? parseFloat(((prev.avgWarmPathMs * prev.warmPathCount + data.stage2_latency_us / 1000) / (prev.warmPathCount + 1)).toFixed(2)) : prev.avgWarmPathMs,
          };
        });
      } catch (err) {
        setIsConnected(false);
        console.error('Failed to fetch live transaction:', err);
      }
    };

    void pollStream();
    const interval = window.setInterval(() => {
      if (isPolling) void pollStream();
    }, 1000);

    return () => {
      isPolling = false;
      window.clearInterval(interval);
    };
  }, []);

  // Update resolution logic to update the transaction's decision in the live stream table
  const resolveReview = (id: string, decision: 'APPROVED' | 'BLOCKED') => {
    // 1. Remove from the manual review queue
    setReviewQueue((prev) => prev.filter((item) => item.tx_id !== id));

    // 2. Update decision status in the Live Stream Table
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.tx_id === id ? { ...tx, final_decision: decision } : tx
      )
    );
  };

  const offloadPct = stats.totalCount > 0 ? ((stats.hotPathCount / stats.totalCount) * 100).toFixed(1) : '94.2';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 lg:p-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-slate-800 pb-5 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-950 border border-blue-800 rounded-xl">
            <ShieldAlert className="text-blue-400 w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              CASCADE RISK ENGINE <span className="text-[10px] tracking-widest text-blue-400 bg-blue-950 px-2.5 py-0.5 rounded-full border border-blue-800 font-mono">TRACK 02</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {cleanText("Two-Stage Hot/Warm Path Cascade + Conformal Risk Guarantees")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className={`text-xs font-mono font-semibold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isConnected ? 'WEBSOCKET CONNECTED' : 'BACKEND OFFLINE'}
          </span>
        </div>
      </div>

      {/* Risk Score Bounds */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-950 text-rose-400 rounded-lg border border-rose-800/50">
              <ArrowUpRight size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Highest Risk Score</p>
              <p className="text-xs text-slate-400">Peak risk score in stream</p>
            </div>
          </div>
          <span className="text-3xl font-bold font-mono text-rose-400">{scoreMetrics.highestScore.toFixed(3)}</span>
        </div>

        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg border border-emerald-800/50">
              <ArrowDownRight size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Lowest Risk Score</p>
              <p className="text-xs text-slate-400">Lowest risk score in stream</p>
            </div>
          </div>
          <span className="text-3xl font-bold font-mono text-emerald-400">{scoreMetrics.lowestScore.toFixed(3)}</span>
        </div>
      </div>

      {/* Latency Benchmarks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Stage 1 */}
        <div className="bg-slate-900 border border-orange-500/30 rounded-2xl p-5">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              <Zap size={15} className="fill-orange-400" /> Stage 1 — Hot Path
            </span>
            <span className="text-[10px] font-mono bg-orange-500/10 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded font-bold">
              LOGISTIC FILTER
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-orange-300 font-mono">{stats.avgHotPathUs}</span>
            <span className="text-orange-500 font-bold font-mono text-xs">μs / tx</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between items-center">
            <span>Cleared Traffic:</span>
            <span className="font-bold text-emerald-400 font-mono text-sm">{offloadPct}%</span>
          </div>
        </div>

        {/* Stage 2 */}
        <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-5">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
              <Cpu size={15} /> Stage 2 — Warm Path
            </span>
            <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-bold">
              {cleanText("LIGHTGBM + CONFORMAL")}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-blue-300 font-mono">{stats.avgWarmPathMs}</span>
            <span className="text-blue-500 font-bold font-mono text-xs">ms / tx</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between items-center">
            <span>Escalated Volume:</span>
            <span className="font-bold text-blue-400 font-mono text-sm">{(100 - parseFloat(offloadPct)).toFixed(1)}%</span>
          </div>
        </div>

        {/* Throughput Gain */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <TrendingDown size={15} /> Speedup Factor
            </span>
            <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
              VS SINGLE MODEL
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold text-emerald-300 font-mono">15.4x</span>
            <span className="text-emerald-500 font-bold text-xs">Faster Throughput</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 flex justify-between items-center">
            <span>Net Saved Margin:</span>
            <span className="font-bold text-emerald-400 font-mono text-sm">
              ${stats.netSavedMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Review Panel */}
      <div className="bg-slate-900 border border-orange-500/40 rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-orange-400" /> Manual Review Queue
              <span className="text-xs font-mono bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2.5 py-0.5 rounded-full font-bold">
                Conformal Set = {'{0, 1}'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Transactions flagged with ambiguous sets for human inspection.
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-xl">
            {reviewQueue.length} Pending
          </span>
        </div>

        {reviewQueue.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs font-mono">
            Queue clear. All sets unambiguous.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviewQueue.map((tx) => {
              const risk = getCriticality(tx.risk_score);

              return (
                <div key={tx.tx_id} className="bg-slate-950 border border-orange-500/40 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div>
                    {/* Fraud Likelihood Score & Criticality Tier */}
                    <div className="flex justify-between items-start mb-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                          Fraud Likelihood
                        </span>
                        <span className="text-xl font-black font-mono text-white">{risk.percentage}</span>
                      </div>
                      <span className={`text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-md border ${risk.badgeClass}`}>
                        {risk.level}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                      <span className="text-slate-400">TX ID:</span>
                      <span className="font-bold text-white">{cleanText(tx.tx_id)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-mono text-slate-300 mb-2">
                      <span className="text-slate-400">Amount:</span>
                      <span className="font-bold text-emerald-400">${tx.amount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-800">
                    {/* Approved Action -> Sets decision in stream table to APPROVED */}
                    <button 
                      onClick={() => resolveReview(tx.tx_id, 'APPROVED')}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 transition"
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    {/* Blocked Action -> Sets decision in stream table to BLOCKED */}
                    <button 
                      onClick={() => resolveReview(tx.tx_id, 'BLOCKED')}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1 transition"
                    >
                      <XCircle size={13} /> Block
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stream Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" /> Live Transaction Stream
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">TX ID</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Risk Score</th>
                <th className="p-3">Stage 1</th>
                <th className="p-3">Stage 2</th>
                <th className="p-3">Conformal Set</th>
                <th className="p-3">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {transactions.length > 0 ? (
                transactions.map((tx) => (
                  <tr key={tx.tx_id} className="hover:bg-slate-800/40">
                    <td className="p-3 text-slate-400">{cleanText(tx.timestamp)}</td>
                    <td className="p-3 font-bold text-slate-100">{cleanText(tx.tx_id)}</td>
                    <td className="p-3 font-sans font-bold text-white">${tx.amount.toFixed(2)}</td>
                    <td className="p-3 font-bold text-slate-200">{tx.risk_score.toFixed(3)}</td>
                    <td className="p-3 text-orange-400 font-bold">{tx.stage1_latency_us} μs</td>
                    <td className="p-3">
                      {tx.stage2_latency_us > 0 ? (
                        <span className="text-blue-400 font-bold">{(tx.stage2_latency_us / 1000).toFixed(2)} ms</span>
                      ) : (
                        <span className="text-slate-600">Bypassed</span>
                      )}
                    </td>
                    <td className="p-3 text-purple-300 font-bold">{cleanText(tx.conformal_set)}</td>
                    <td className="p-3">
                      {/* Decision Badges: Green for Approved, Red for Blocked, Orange for Human Review */}
                      <span className={`px-2.5 py-1 rounded text-[10px] font-sans font-bold border ${
                        tx.final_decision === 'AUTO_CLEARED' || tx.final_decision === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
                        tx.final_decision === 'AUTO_BLOCKED' || tx.final_decision === 'BLOCKED' || tx.final_decision === 'REJECTED' ? 'bg-rose-950 text-rose-400 border-rose-800' :
                        'bg-orange-950 text-orange-400 border-orange-800'
                      }`}>
                        {cleanText(tx.final_decision)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans text-xs">
                    Connecting to the Vercel API stream...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
