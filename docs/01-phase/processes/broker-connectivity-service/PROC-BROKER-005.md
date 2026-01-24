### PROC-BROKER-005: Download Historical Data

**Service Owner:** Broker Connectivity Service
**Related FR:** FR-ADMIN-006
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-021, ADR-025, ADR-032

#### Trigger
Historical Data Service requests data download OR Admin triggers manual download

#### Actor
System (Historical Data Service) or Admin

#### Preconditions
- Exchange API supports historical data endpoint
- Rate limits allow bulk download

#### Inputs
**API Endpoint:** `POST /api/v1/broker/historical/download`

**Request Body:**
```json
{
  "broker": "bybit",
  "symbol": "BTCUSDT",
  "timeframe": "1h",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

#### Process Steps

1. **Historical Data Service makes request** → `/api/v1/broker/historical/download` (POST)
2. **Broker Controller validates date range**
   - Maximum 2 years per request
   - `endDate >= startDate`
3. **Broker Controller calculates number of candles**
   - 1h timeframe, 365 days = 8,760 candles
4. **Broker Controller selects adapter**
5. **Exchange Adapter implements paginated download**
   - Exchanges limit candles per request (typically 1000-1500)
   - Multiple API calls required
6. **For each page:**
7. **Rate Limiter checks limit** (same as PROC-BROKER-003 step 3)
8. **Exchange Adapter makes API call**
   - Bybit: `GET /v5/market/kline?symbol=BTCUSDT&interval=60&start=...&limit=1000`
   - Binance: `GET /api/v3/klines?symbol=BTCUSDT&interval=1h&startTime=...&limit=1000`
9. **Exchange Adapter normalizes OHLCV data**
10. **Broker Controller yields data back to Historical Data Service**
    - Streaming response to avoid memory issues
11. **Historical Data Service saves to TimescaleDB** (separate process)

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "downloadId": "uuid",
    "symbol": "BTCUSDT",
    "broker": "bybit",
    "timeframe": "1h",
    "totalCandles": 8760,
    "status": "in_progress"
  },
  "meta": {
    "timestamp": "2024-12-01T10:00:00Z",
    "version": "v1"
  }
}
```

**Streamed OHLCV Data (camelCase):**
```json
[
  {
    "timestamp": "2024-01-01T00:00:00Z",
    "open": 45000.0,
    "high": 45250.0,
    "low": 44800.0,
    "close": 45100.0,
    "volume": 123.45
  }
]
```

#### Success Criteria
- All historical data downloaded
- Data normalized
- Streamed to Historical Data Service
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Rate limit exceeded | 429 | Pause download, resume after cooldown |
| Invalid date range | 400 | Return "Invalid date range" |
| Exchange API error | 502 | Retry with exponential backoff |
| Timeout | 504 | Resume from last successful timestamp |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Download speed: ~1000 candles/second
- 1 year of 1h data: ~10 seconds
- Uses streaming to avoid memory issues

#### Dependencies
**Cache:**
- Redis (rate limiting)

**External Services:**
- Bybit API: `/v5/market/kline`
- Binance API: `/api/v3/klines`

---
