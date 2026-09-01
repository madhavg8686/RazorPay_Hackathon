use fraud_spike_detector::{StreamingLayer, Transaction};
use rand::Rng;
use std::time::Instant;

fn generate_synthetic_stream(total_txs: usize, spike_start: usize, spike_duration: usize) -> Vec<Transaction> {
    let mut rng = rand::thread_rng();
    let mut stream = Vec::with_capacity(total_txs);

    for i in 0..total_txs {
        let is_in_spike = i >= spike_start && i < (spike_start + spike_duration);
        let dispute_prob = if is_in_spike { 0.35 } else { 0.01 };

        stream.push(Transaction {
            id: format!("tx_{}", i),
            merchant_id: "merchant_01".to_string(),
            bin: "411111".to_string(),
            is_disputed: rng.gen_bool(dispute_prob),
            timestamp_ms: 1700000000000 + (i as u64 * 10),
        });
    }

    stream
}

fn main() {
    let total_txs = 100_000;
    let spike_start = 40_000;
    let spike_duration = 2_000;

    let stream = generate_synthetic_stream(total_txs, spike_start, spike_duration);

    let alphas = vec![0.01, 0.05, 0.1];
    let drifts = vec![0.1, 0.3, 0.5];
    let thresholds = vec![2.0, 4.0, 6.0];

    println!("Starting Grid Search Simulation...\n");
    println!("| Alpha | Drift | Threshold | False Positives | True Positives | Latency/Tx |");
    println!("|-------|-------|-----------|-----------------|----------------|------------|");

    for &alpha in &alphas {
        for &drift in &drifts {
            for &threshold in &thresholds {
                let layer = StreamingLayer::new(alpha, threshold, drift);
                let start_time = Instant::now();

                let mut fp = 0;
                let mut tp = 0;

                for (idx, tx) in stream.iter().enumerate() {
                    if let Some(_alert) = layer.process_transaction(tx) {
                        let is_in_spike = idx >= spike_start && idx < (spike_start + spike_duration);
                        if is_in_spike {
                            tp += 1;
                        } else {
                            fp += 1;
                        }
                    }
                }

                let latency_ns = start_time.elapsed().as_nanos() / total_txs as u128;
                println!(
                    "| {:<5} | {:<5} | {:<9} | {:<15} | {:<14} | {} ns/tx |",
                    alpha, drift, threshold, fp, tp, latency_ns
                );
            }
        }
    }
}