"""
AI Risk Manager - Fraud Detection Engine API

Deployed as a Vercel Python serverless function at /api/index.py
(mapped via vercel.json rewrites: /api/(.*) -> /api/index.py)

NOTE: Vercel serverless functions are stateless and short-lived per request,
so they cannot hold an open WebSocket connection. The original /ws/transactions
WebSocket endpoint has been replaced with a polling endpoint
(/api/live-stream-tick) that the frontend can call on an interval (e.g. every
1s) to get the same "streaming" effect. If you need a true persistent
WebSocket later, that piece would need to run on a separate always-on host
(Railway, Render, Fly.io) rather than Vercel.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import time

app = FastAPI(title="AI Risk Manager - Fraud Detection Engine API")

# Allow CORS for the Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TransactionPayload(BaseModel):
    id: str
    merchant_id: str
    amount: float
    is_disputed: bool


@app.get("/api/metrics")
def get_metrics():
    """Returns Layer 3 System & Financial Benchmarks"""
    return {
        "throughput_cleared_pct": 30.0,
        "stage1_latency_ms": 0.002,
        "conformal_coverage_pct": 99.9,
        "human_review_pct": 0.0,
        "fraud_prevented_usd": 28198.31,
        "net_saved_margin_usd": 27135.19,
    }


def _generate_transaction(i: int) -> dict:
    is_warm_path = i % 3 == 0
    is_fraud = 1 if i % 5 == 0 else 0
    return {
        "tx_id": f"tx_{i:04d}",
        "merchant_id": "merchant_123",
        "amount": round(float(np.random.exponential(50) + 10), 2),
        "stage1_action": "Escalated" if is_warm_path else "Auto-Cleared",
        "conformal_set": (
            "{1}" if (is_warm_path and i % 5 == 0)
            else "{0, 1}" if is_warm_path
            else "{0}"
        ),
        "final_decision": (
            "BLOCKED" if (is_warm_path and i % 5 == 0)
            else "HUMAN_REVIEW" if is_warm_path
            else "APPROVED"
        ),
        "risk_score": round(float(np.random.beta(2, 8 if not is_warm_path else 2)), 3),
        "stage1_latency_us": 120,
        "stage2_latency_us": 1850 if is_warm_path else 0,
        "timestamp": time.strftime("%H:%M:%S"),
        "is_actual_fraud": is_fraud,
    }


@app.get("/api/live-stream")
def get_live_stream():
    """Simulates a batch of real-time transactions processed through the 3 layers"""
    sample_txs = [_generate_transaction(i) for i in range(1, 11)]
    return {"transactions": sample_txs}


@app.get("/api/live-stream-tick")
def get_live_stream_tick(tick: int = 0):
    """
    Single-transaction poll endpoint, replacing the old WebSocket stream.
    Have the frontend call this on a 1s interval (setInterval) with an
    incrementing `tick` query param, and append each result to its live feed.
    """
    return _generate_transaction(tick if tick > 0 else 1)


# Local dev entrypoint only — not used by Vercel, which imports `app` directly.
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
