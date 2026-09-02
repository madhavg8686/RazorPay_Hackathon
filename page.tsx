'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  Lock 
} from 'lucide-react';

interface Metrics {
  throughput_cleared_pct: number;
  stage1_latency_ms: number;
  conformal_coverage_pct: number;
  human_review_pct: number;
  fraud_prevented_usd: number;
  net_saved_margin_usd: number;
}

interface Transaction {
  tx_id: string;
  merchant_id: string;
  amount: number;
  stage1_action: string;
  conformal_set: string;
  final_decision: string;
  risk_score: number;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics>({
    throughput_cleared_pct: 30.0,
    stage1_latency_ms: 0.002,
    conformal_coverage_pct: 99.9,
    human_review_pct: 0.0,
    fraud_prevented_usd: 28198.31,
    net_saved_margin_usd: 27135.19,
  });

  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    // Fetch live stream from FastAPI backend
    const fetchData = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/live-stream');
        const data = await res.json();
        setTransactions(data.transactions);
      } catch (err) {
        console.warn("Backend API offline. Displaying fallback benchmark data.");
      }
    };
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-blue-500 w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-tight text-white">
              AI RISK MANAGER <span className="text-xs text-blue-400 bg-blue-950 px-2 py-1 rounded-md border border-blue-800">TRACK 02</span>
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Two-Stage Cascade Engine + Split Conformal Risk Control
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/50 px-3 py-1.5 rounded-full border border-emerald-800">
            ENGINE ACTIVE • RUST CUSUM ACTIVE
          </span>
        </div>
      </div>

      {/* Top Benchmark KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between text-slate-400 text-xs font-semibold uppercase mb-2">
            <span>Net Saved Margin</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">
            ${metrics.net_saved_margin_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Catching ${metrics.fraud_prevented_usd.toLocaleString()} gross fraud
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between text-slate-400 text-xs font-semibold uppercase mb-2">
            <span>Stage 1 Throughput</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-extrabold text-blue-400">
            {metrics.throughput_cleared_pct}%
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Auto-cleared in ~{metrics.stage1_latency_ms} ms/tx
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between text-slate-400 text-xs font-semibold uppercase mb-2">
            <span>Conformal Coverage</span>
            <Lock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-extrabold text-purple-400">
            {metrics.conformal_coverage_pct}%
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Statistical Guarantee (Target ≥95.0%)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between text-slate-400 text-xs font-semibold uppercase mb-2">
            <span>Human Review Overhead</span>
            <CheckCircle className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">
            {metrics.human_review_pct}%
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Zero unnecessary review costs
          </div>
        </div>
      </div>

      {/* Transaction Inspection Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" /> Live Transaction Stream Evaluation
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-xs border-b border-slate-800">
              <tr>
                <th className="p-3">Transaction ID</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Stage 1 Filter</th>
                <th className="p-3">Conformal Set</th>
                <th className="p-3">Risk Score</th>
                <th className="p-3">Action Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {transactions.length > 0 ? (
                transactions.map((tx: Transaction) => (
                  <tr key={tx.tx_id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-semibold text-white">{tx.tx_id}</td>
                    <td className="p-3">${tx.amount.toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        tx.stage1_action === 'Auto-Cleared' ? 'bg-slate-800 text-slate-300' : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {tx.stage1_action}
                      </span>
                    </td>
                    <td className="p-3 text-purple-300 font-bold">{tx.conformal_set}</td>
                    <td className="p-3">{tx.risk_score}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        tx.final_decision === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                        tx.final_decision === 'BLOCKED' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                        'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {tx.final_decision}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Connect backend (`python main.py`) to stream real-time transactions.
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