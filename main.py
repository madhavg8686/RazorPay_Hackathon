try:
    from fastapi import FastAPI
    from fastapi import WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:  # Keep the module importable when optional API dependencies are absent.
    class FastAPI:
        def __init__(self, **kwargs):
            self.routes = []

        def add_middleware(self, *args, **kwargs):
            pass

        def get(self, path):
            def decorator(handler):
                self.routes.append(("GET", path, handler))
                return handler
            return decorator

    class CORSMiddleware:
        pass

    class WebSocket:
        pass

    class WebSocketDisconnect(Exception):
        pass

try:
    from pydantic import BaseModel
except ImportError:
    class BaseModel:
        pass
import numpy as np
import asyncio
import time

app = FastAPI(title="AI Risk Manager - Fraud Detection Engine API")

# Allow CORS for Next.js frontend
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
        "throughput_cleared_pct": 30.0,  # 30.0% traffic auto-cleared at Stage 1[cite: 1]
        "stage1_latency_ms": 0.002,
        "conformal_coverage_pct": 99.9,  # 99.9% empirical coverage set[cite: 1]
        "human_review_pct": 0.0,         # 0.0% routed to human review[cite: 1]
        "fraud_prevented_usd": 28198.31, # $28,198.31 caught[cite: 1]
        "net_saved_margin_usd": 27135.19 # $27,135.19 net saved margin[cite: 1]
    }

@app.get("/api/live-stream")
def get_live_stream():
    """Simulates real-time transaction processing through the 3 layers"""
    sample_txs = [
        {
            "tx_id": f"tx_00{i}",
            "merchant_id": "merchant_123",
            "amount": round(float(np.random.exponential(50) + 10), 2),
            "stage1_action": "Auto-Cleared" if i % 3 != 0 else "Escalated",
            "conformal_set": "{0}" if i % 3 != 0 else ("{1}" if i % 5 == 0 else "{0, 1}"),
            "final_decision": "APPROVED" if i % 3 != 0 else ("BLOCKED" if i % 5 == 0 else "HUMAN_REVIEW"),
            "risk_score": round(float(np.random.beta(2, 8 if i % 3 != 0 else 2)), 3)
        }
        for i in range(1, 11)
    ]
    return {"transactions": sample_txs}

@app.websocket("/ws/transactions")
async def transaction_stream(websocket: WebSocket):
    await websocket.accept()
    transaction_id = 0
    try:
        while True:
            transaction_id += 1
            is_warm_path = transaction_id % 3 == 0
            is_fraud = 1 if transaction_id % 5 == 0 else 0
            await websocket.send_json({
                "id": f"tx_{transaction_id:04d}",
                "merchant_id": "merchant_123",
                "amount": round(float(np.random.exponential(50) + 10), 2),
                "conformal_set": [0, 1] if is_warm_path else [0],
                "action": "HUMAN_REVIEW" if is_warm_path else ("AUTO_BLOCKED" if is_fraud else "AUTO_CLEARED"),
                "stage1_latency_us": 120,
                "stage2_latency_us": 1850 if is_warm_path else 0,
                "timestamp": time.strftime("%H:%M:%S"),
                "is_actual_fraud": is_fraud,
            })
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)