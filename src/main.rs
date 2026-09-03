use rdkafka::config::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;

pub(crate) use fraud_spike_detector::{StreamingLayer, Transaction};

#[derive(Debug, Clone, Serialize)]
pub struct EscalatedPayload {
    pub transaction: Transaction,
    pub spike_severity: f64,
}

pub struct StreamingPipeline {
    consumer: StreamConsumer,
    producer: FutureProducer,
    streaming_layer: Arc<StreamingLayer>,
    output_topic: String,
}

impl StreamingPipeline {
    pub fn new(
        brokers: &str,
        group_id: &str,
        input_topic: &str,
        output_topic: &str,
        streaming_layer: Arc<StreamingLayer>,
    ) -> Self {
        let consumer: StreamConsumer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("group.id", group_id)
            .set("enable.auto.commit", "true")
            .set("auto.offset.reset", "latest")
            .create()
            .expect("Consumer creation failed");

        consumer.subscribe(&[input_topic]).expect("Subscription failed");

        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "1000")
            .create()
            .expect("Producer creation failed");

        Self {
            consumer,
            producer,
            streaming_layer,
            output_topic: output_topic.to_string(),
        }
    }

    pub async fn run(&self) {
        println!("🚀 Streaming Layer active. Processing transaction stream...");
        let mut backoff_ms = 100;

        loop {
            match self.consumer.recv().await {
                Err(e) => {
                    eprintln!("Kafka error: {:?}", e);
                    tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    backoff_ms = (backoff_ms * 2).min(5000); // Cap at 5s
                }
                Ok(m) => {
                    backoff_ms = 100; // Reset on success
                    if let Some(payload) = m.payload() {
                        if let Ok(tx) = serde_json::from_slice::<Transaction>(payload) {
                            if let Some(alert) = self.streaming_layer.process_transaction(&tx) {
                                println!(
                                    "[SPIKE DETECTED] Entity: {} | Severity: {:.2}",
                                    alert.entity_id, alert.severity
                                );
                                self.forward_to_ml_layer(tx, alert.severity).await;
                            }
                        }
                    }
                    let _ = self.consumer.commit_message(&m, CommitMode::Async);
                }
            }
        }
    }

    async fn forward_to_ml_layer(&self, tx: Transaction, severity: f64) {
        let payload = EscalatedPayload {
            transaction: tx,
            spike_severity: severity,
        };

        if let Ok(json_bytes) = serde_json::to_vec(&payload) {
            let record = FutureRecord::to(&self.output_topic)
                .key(&payload.transaction.merchant_id)
                .payload(&json_bytes);

            let _ = self.producer.send(record, Duration::from_secs(0)).await;
        }
    }
}

#[tokio::main]
async fn main() {
    let streaming_layer = Arc::new(StreamingLayer::new(0.05, 4.0, 0.5));

    let pipeline = StreamingPipeline::new(
        "localhost:9092",
        "fraud-streaming-group",
        "raw-transactions",
        "ml-stage1-hotpath",
        streaming_layer,
    );

    pipeline.run().await;
}