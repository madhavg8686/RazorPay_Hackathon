use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use pyo3::prelude::*;
use pyo3::types::PyDict;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Transaction {
    pub id: String,
    pub merchant_id: String,
    pub bin: String,
    pub is_disputed: bool,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpikeAlert {
    pub entity_id: String,
    pub timestamp_ms: u64,
    pub severity: f64,
}

pub struct EntityState {
    pub alpha: f64,
    pub ewma_dispute_rate: f64,
    pub ewma_variance: f64,
    pub total_count: u64,
    pub cusum_pos: f64,
}

impl EntityState {
    pub fn new(alpha: f64) -> Self {
        Self {
            alpha,
            ewma_dispute_rate: 0.0,
            ewma_variance: 0.0,
            total_count: 0,
            cusum_pos: 0.0,
        }
    }

    pub fn update_and_detect(&mut self, is_disputed: bool, threshold: f64, drift: f64) -> Option<f64> {
        let val = if is_disputed { 1.0 } else { 0.0 };
        self.total_count += 1;

        // EWMA Dispute Rate & Volatility
        let delta = val - self.ewma_dispute_rate;
        self.ewma_dispute_rate += self.alpha * delta;
        self.ewma_variance = (1.0 - self.alpha) * (self.ewma_variance + self.alpha * delta * delta);

        let volatility = self.ewma_variance.sqrt();

        // CUSUM detector logic
        self.cusum_pos = (self.cusum_pos + (volatility - drift)).max(0.0);

        if self.cusum_pos > threshold {
            let severity = self.cusum_pos;
            self.cusum_pos = 0.0; // Reset state after triggering alert
            Some(severity)
        } else {
            None
        }
    }
}

pub struct StreamingLayer {
    states: DashMap<String, EntityState>,
    alpha: f64,
    cusum_threshold: f64,
    cusum_drift: f64,
}

impl StreamingLayer {
    pub fn new(alpha: f64, cusum_threshold: f64, cusum_drift: f64) -> Self {
        Self {
            states: DashMap::new(),
            alpha,
            cusum_threshold,
            cusum_drift,
        }
    }

    pub fn process_transaction(&self, tx: &Transaction) -> Option<SpikeAlert> {
        let mut entry = self.states.entry(tx.merchant_id.clone())
            .or_insert_with(|| EntityState::new(self.alpha));

        if let Some(severity) = entry.update_and_detect(tx.is_disputed, self.cusum_threshold, self.cusum_drift) {
            Some(SpikeAlert {
                entity_id: tx.merchant_id.clone(),
                timestamp_ms: tx.timestamp_ms,
                severity,
            })
        } else {
            None
        }
    }
}

// =====================================================================
// PyO3 Python Bindings
// =====================================================================

#[derive(Clone)]
#[pyclass]
pub struct PyTransaction {
    #[pyo3(get, set)]
    pub id: String,
    #[pyo3(get, set)]
    pub merchant_id: String,
    #[pyo3(get, set)]
    pub bin: String,
    #[pyo3(get, set)]
    pub is_disputed: bool,
    #[pyo3(get, set)]
    pub timestamp_ms: u64,
}

#[pymethods]
impl PyTransaction {
    #[new]
    pub fn new(id: String, merchant_id: String, bin: String, is_disputed: bool, timestamp_ms: u64) -> Self {
        PyTransaction {
            id,
            merchant_id,
            bin,
            is_disputed,
            timestamp_ms,
        }
    }
}

#[pyclass]
pub struct PySpikeAlert {
    #[pyo3(get, set)]
    pub entity_id: String,
    #[pyo3(get, set)]
    pub timestamp_ms: u64,
    #[pyo3(get, set)]
    pub severity: f64,
}

#[pyclass]
pub struct PyStreamingLayer {
    layer: StreamingLayer,
}

#[pymethods]
impl PyStreamingLayer {
    #[new]
    pub fn new(alpha: f64, cusum_threshold: f64, cusum_drift: f64) -> Self {
        PyStreamingLayer {
            layer: StreamingLayer::new(alpha, cusum_threshold, cusum_drift),
        }
    }

    pub fn process_transaction(&self, tx: &PyTransaction) -> Option<PyObject> {
        let transaction = Transaction {
            id: tx.id.clone(),
            merchant_id: tx.merchant_id.clone(),
            bin: tx.bin.clone(),
            is_disputed: tx.is_disputed,
            timestamp_ms: tx.timestamp_ms,
        };

        if let Some(alert) = self.layer.process_transaction(&transaction) {
            Python::with_gil(|py| {
                let alert_dict = PyDict::new_bound(py);
                alert_dict.set_item("entity_id", &alert.entity_id).ok();
                alert_dict.set_item("timestamp_ms", alert.timestamp_ms).ok();
                alert_dict.set_item("severity", alert.severity).ok();
                Some(alert_dict.into())
            })
        } else {
            None
        }
    }

    pub fn process_transaction_batch(&self, transactions: Vec<PyObject>) -> PyResult<Vec<PyObject>> {
        Python::with_gil(|py| {
            let mut results = Vec::new();

            for tx_obj in transactions {
                let tx: PyTransaction = tx_obj.extract(py)?;
                let transaction = Transaction {
                    id: tx.id.clone(),
                    merchant_id: tx.merchant_id.clone(),
                    bin: tx.bin.clone(),
                    is_disputed: tx.is_disputed,
                    timestamp_ms: tx.timestamp_ms,
                };

                if let Some(alert) = self.layer.process_transaction(&transaction) {
                    let alert_dict = PyDict::new_bound(py);
                    alert_dict.set_item("entity_id", &alert.entity_id)?;
                    alert_dict.set_item("timestamp_ms", alert.timestamp_ms)?;
                    alert_dict.set_item("severity", alert.severity)?;
                    results.push(alert_dict.into());
                }
            }

            Ok(results)
        })
    }
}

#[pyfunction]
pub fn process_transaction_batch_json(json_list: Vec<String>, alpha: f64, threshold: f64, drift: f64) -> PyResult<Vec<PyObject>> {
    let streaming_layer = StreamingLayer::new(alpha, threshold, drift);
    
    Python::with_gil(|py| {
        let mut results = Vec::new();

        for json_str in json_list {
            if let Ok(tx) = serde_json::from_str::<Transaction>(&json_str) {
                if let Some(alert) = streaming_layer.process_transaction(&tx) {
                    let alert_dict = PyDict::new_bound(py);
                    alert_dict.set_item("entity_id", &alert.entity_id)?;
                    alert_dict.set_item("timestamp_ms", alert.timestamp_ms)?;
                    alert_dict.set_item("severity", alert.severity)?;
                    results.push(alert_dict.into());
                }
            }
        }

        Ok(results)
    })
}

#[pymodule]
fn fraud_spike_detector(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<PyTransaction>()?;
    m.add_class::<PySpikeAlert>()?;
    m.add_class::<PyStreamingLayer>()?;
    m.add_function(wrap_pyfunction!(process_transaction_batch_json, m)?)?;
    Ok(())
}