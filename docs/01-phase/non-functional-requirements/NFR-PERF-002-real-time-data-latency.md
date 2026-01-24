### NFR-PERF-002: Real-Time Data Latency
**Priority:** High
**Requirement:** Real-time price updates must be delivered to users within 1 second of exchange update.

**Measurement:**
- Target: P95 latency < 1 second from exchange to frontend
- Monitoring: Custom latency tracking per WebSocket message
- Tracked: All real-time price feeds
