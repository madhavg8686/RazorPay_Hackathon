from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
import lightgbm as lgb
import joblib
import time
from datetime import datetime, timezone, timedelta

app = FastAPI(title="Cascade Risk Engine - Live ML Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================================
# LOAD REAL TRAINED MODEL ARTIFACTS AT STARTUP
# =====================================================================
try:
    stage1_scaler = joblib.load("stage1_scaler.joblib")
    stage1_model = joblib.load("stage1_model.joblib")
    stage2_booster = lgb.Booster(model_file="stage2_lgb.txt")
    q_hat = float(np.load("conformal_qhat.npy")[0])
    MODELS_LOADED = True
except Exception as e:
    print(f"Warning: Could not load trained models ({e}). Falling back to dummy scoring.")
    MODELS_LOADED = False

STAGE1_THRESHOLD = 0.05  # Optimized Stage 1 recall threshold


def generate_live_transaction_features(i: int):
    """Simulates realistic incoming transaction vectors for testing live stream."""
    rng = np.random.default_rng(i)
    is_fraud = 1 if i % 7 == 0 else 0

    if is_fraud:
        amount = float(rng.lognormal(mean=4.2, sigma=1.2)) * 80  # Scale to INR
        velocity_1h = int(rng.poisson(lam=3.8))
        hour_of_day = int(rng.choice([0, 1, 2, 3, 22, 23]))
        merchant_risk_cat = int(rng.choice([0, 1, 2], p=[0.1, 0.3, 0.6]))
        device_shared_count = int(rng.binomial(n=1, p=0.45))
        ip_reputation_score = float(rng.beta(a=2, b=5))
        merchant_historical_cb_rate = float(rng.exponential(scale=0.04))
        graph_cluster_risk = float(rng.beta(a=6, b=3))
    else:
        amount = float(rng.lognormal(mean=3.5, sigma=1.0)) * 80
        velocity_1h = int(rng.poisson(lam=1.2))
        hour_of_day = int(rng.integers(0, 24))
        merchant_risk_cat = int(rng.choice([0, 1, 2], p=[0.7, 0.2, 0.1]))
        device_shared_count = int(rng.binomial(n=1, p=0.05))
        ip_reputation_score = float(rng.beta(a=8, b=2))
        merchant_historical_cb_rate = float(rng.exponential(scale=0.005))
        graph_cluster_risk = float(rng.beta(a=2, b=8))

    return {
        "features_s1": [amount / 80, velocity_1h, hour_of_day, merchant_risk_cat],
        "features_s2": [
            amount / 80,
            velocity_1h,
            hour_of_day,
            merchant_risk_cat,
            device_shared_count,
            ip_reputation_score,
            merchant_historical_cb_rate,
            graph_cluster_risk,
        ],
        "raw_amount_inr": round(amount, 2),
        "is_actual_fraud": is_fraud,
    }


@app.get("/api/live-stream-tick")
def get_live_stream_tick(tick: int = 1):
    data = generate_live_transaction_features(tick)

    # Timezone: IST
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    ist_now = datetime.now(ist_tz).strftime("%H:%M:%S")

    # =====================================================================
    # REAL INFERENCE ENGINE EXECUTING YOUR TRAINED PIPELINE
    # =====================================================================
    if MODELS_LOADED:
        # --- STAGE 1: HOT PATH (Microseconds) ---
        t0 = time.perf_counter()
        s1_in = np.array(data["features_s1"]).reshape(1, -1)
        s1_scaled = stage1_scaler.transform(s1_in)
        s1_prob = float(stage1_model.predict_proba(s1_scaled)[0, 1])
        s1_latency_us = int((time.perf_counter() - t0) * 1_000_000)

        # Stage 1 Decision
        if s1_prob < STAGE1_THRESHOLD:
            return {
                "tx_id": f"tx_{tick:04d}",
                "merchant_id": "merchant_123",
                "amount": data["raw_amount_inr"],
                "stage1_action": "Auto-Cleared",
                "conformal_set": "{0}",
                "final_decision": "APPROVED",
                "risk_score": round(s1_prob, 3),
                "stage1_latency_us": s1_latency_us,
                "stage2_latency_us": 0,
                "timestamp": ist_now,
                "is_actual_fraud": data["is_actual_fraud"],
            }

        # --- STAGE 2: WARM PATH (LightGBM + Split Conformal) ---
        t1 = time.perf_counter()
        s2_in = np.array(data["features_s2"]).reshape(1, -1)
        s2_prob = float(stage2_booster.predict(s2_in)[0])
        s2_latency_us = int((time.perf_counter() - t1) * 1_000_000)

        # Conformal Set Construction using q_hat
        p0, p1 = 1.0 - s2_prob, s2_prob
        s0, s1 = 1.0 - p0, 1.0 - p1

        conformal_set = set()
        if s0 <= q_hat:
            conformal_set.add(0)
        if s1 <= q_hat:
            conformal_set.add(1)
        if not conformal_set:
            conformal_set.add(1 if s2_prob >= 0.5 else 0)

        # Final Action Based on Conformal Set
        if conformal_set == {0}:
            final_decision = "APPROVED"
        elif conformal_set == {1}:
            final_decision = "BLOCKED"
        else:
            final_decision = "HUMAN_REVIEW"  # Set is {0, 1}

        return {
            "tx_id": f"tx_{tick:04d}",
            "merchant_id": "merchant_123",
            "amount": data["raw_amount_inr"],
            "stage1_action": "Escalated",
            "conformal_set": str(sorted(list(conformal_set))).replace("[", "{").replace("]", "}"),
            "final_decision": final_decision,
            "risk_score": round(s2_prob, 3),
            "stage1_latency_us": s1_latency_us,
            "stage2_latency_us": s2_latency_us,
            "timestamp": ist_now,
            "is_actual_fraud": data["is_actual_fraud"],
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
