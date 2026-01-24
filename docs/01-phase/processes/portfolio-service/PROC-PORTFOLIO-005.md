### PROC-PORTFOLIO-005: Get Transactions History

**Service Owner:** Portfolio Service
**Related FR:** FR-PORTFOLIO-003
**Related NFR:** NFR-PERF-001, NFR-API-001
**Related ADR:** ADR-032

#### Trigger
User views transaction history on portfolio page

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Transactions have been synced from connected exchanges

#### Inputs
**API Endpoint:** `GET /api/v1/portfolio/transactions`

**Query Parameters:**
```
GET /api/v1/portfolio/transactions?
  page={number}&
  page_size={number}&
  exchange={exchange}&
  transaction_type={type}&
  asset={symbol}&
  start_date={ISO8601}&
  end_date={ISO8601}&
  sort_by={field}&
  sort_order={asc|desc}
```

**Parameter Details:**
- `page` (integer, default: 1): Page number (1-indexed)
- `page_size` (integer, default: 50, max: 100): Items per page
- `exchange` (string, optional): Filter by exchange (`bybit`, `binance`)
- `transaction_type` (string, optional): Filter by type (`trade`, `deposit`, `withdrawal`, `fee`, `transfer`)
- `asset` (string, optional): Filter by asset symbol (`BTC`, `ETH`, etc.)
- `start_date` (ISO8601, optional): Filter transactions after this date
- `end_date` (ISO8601, optional): Filter transactions before this date
- `sort_by` (string, default: `transaction_timestamp`): Sort field
- `sort_order` (string, default: `desc`): Sort direction (`asc`, `desc`)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/portfolio/transactions` (GET)
2. **API Gateway validates JWT** → Extracts user_id
3. **Portfolio Controller validates query parameters**
   - Validate `page` is positive integer
   - Validate `page_size` is between 1 and 100
   - Validate `exchange` is valid if provided
   - Validate `transaction_type` is valid enum if provided
   - Validate date range is valid (end_date >= start_date)
   - Return 400 if any validation fails
4. **Portfolio Repository fetches transactions**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     t.id,
     t.exchange,
     t.exchange_transaction_id,
     t.transaction_type,
     t.asset,
     t.amount,
     t.price_usd,
     t.value_usd,
     t.fee_amount,
     t.fee_asset,
     t.fee_usd,
     t.trade_pair,
     t.side,
     t.transaction_timestamp,
     t.synced_at,
     t.notes
   FROM transactions t
   WHERE t.user_id = $1
     AND ($2::varchar IS NULL OR t.exchange = $2)
     AND ($3::transaction_type IS NULL OR t.transaction_type = $3)
     AND ($4::varchar IS NULL OR t.asset = $4)
     AND ($5::timestamptz IS NULL OR t.transaction_timestamp >= $5)
     AND ($6::timestamptz IS NULL OR t.transaction_timestamp <= $6)
   ORDER BY
     CASE WHEN $7 = 'transaction_timestamp' AND $8 = 'desc' THEN t.transaction_timestamp END DESC,
     CASE WHEN $7 = 'transaction_timestamp' AND $8 = 'asc' THEN t.transaction_timestamp END ASC,
     CASE WHEN $7 = 'value_usd' AND $8 = 'desc' THEN t.value_usd END DESC,
     CASE WHEN $7 = 'value_usd' AND $8 = 'asc' THEN t.value_usd END ASC,
     CASE WHEN $7 = 'asset' AND $8 = 'asc' THEN t.asset END ASC,
     CASE WHEN $7 = 'asset' AND $8 = 'desc' THEN t.asset END DESC
   LIMIT $9 OFFSET $10;
   ```
5. **Portfolio Repository counts total matching records**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT COUNT(*)
   FROM transactions t
   WHERE t.user_id = $1
     AND ($2::varchar IS NULL OR t.exchange = $2)
     AND ($3::transaction_type IS NULL OR t.transaction_type = $3)
     AND ($4::varchar IS NULL OR t.asset = $4)
     AND ($5::timestamptz IS NULL OR t.transaction_timestamp >= $5)
     AND ($6::timestamptz IS NULL OR t.transaction_timestamp <= $6);
   ```
6. **Portfolio Controller calculates summary statistics**
   ```sql
   -- IMPORTANT: Verify against schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml
   SELECT
     COUNT(*) as total_count,
     SUM(CASE WHEN transaction_type = 'trade' AND side = 'buy' THEN value_usd ELSE 0 END) as total_bought_usd,
     SUM(CASE WHEN transaction_type = 'trade' AND side = 'sell' THEN value_usd ELSE 0 END) as total_sold_usd,
     SUM(CASE WHEN transaction_type = 'deposit' THEN value_usd ELSE 0 END) as total_deposited_usd,
     SUM(CASE WHEN transaction_type = 'withdrawal' THEN value_usd ELSE 0 END) as total_withdrawn_usd,
     SUM(COALESCE(fee_usd, 0)) as total_fees_usd
   FROM transactions
   WHERE user_id = $1
     AND ($2::timestamptz IS NULL OR transaction_timestamp >= $2)
     AND ($3::timestamptz IS NULL OR transaction_timestamp <= $3);
   ```
7. **Portfolio Controller formats response**
8. **Return paginated transactions with summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid-1",
        "exchange": "bybit",
        "exchangeTransactionId": "tx_123456",
        "transactionType": "trade",
        "asset": "BTC",
        "amount": 0.5,
        "priceUsd": 45000.00,
        "valueUsd": 22500.00,
        "fee": {
          "amount": 0.0001,
          "asset": "BTC",
          "valueUsd": 4.50
        },
        "trade": {
          "pair": "BTCUSDT",
          "side": "buy"
        },
        "transactionTimestamp": "2024-12-16T10:30:00Z",
        "syncedAt": "2024-12-16T11:00:00Z"
      },
      {
        "id": "uuid-2",
        "exchange": "binance",
        "exchangeTransactionId": "dep_789012",
        "transactionType": "deposit",
        "asset": "USDT",
        "amount": 10000.00,
        "priceUsd": 1.00,
        "valueUsd": 10000.00,
        "fee": null,
        "trade": null,
        "transactionTimestamp": "2024-12-15T14:00:00Z",
        "syncedAt": "2024-12-15T15:00:00Z"
      },
      {
        "id": "uuid-3",
        "exchange": "bybit",
        "exchangeTransactionId": "tx_345678",
        "transactionType": "trade",
        "asset": "ETH",
        "amount": 2.0,
        "priceUsd": 3000.00,
        "valueUsd": 6000.00,
        "fee": {
          "amount": 6.00,
          "asset": "USDT",
          "valueUsd": 6.00
        },
        "trade": {
          "pair": "ETHUSDT",
          "side": "sell"
        },
        "transactionTimestamp": "2024-12-14T09:15:00Z",
        "syncedAt": "2024-12-14T10:00:00Z"
      }
    ],
    "summary": {
      "totalTransactions": 156,
      "periodStats": {
        "totalBoughtUsd": 85000.00,
        "totalSoldUsd": 42000.00,
        "totalDepositedUsd": 50000.00,
        "totalWithdrawnUsd": 5000.00,
        "totalFeesUsd": 125.50,
        "netFlowUsd": 45000.00
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 156,
    "totalPages": 4,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "exchange": null,
      "transactionType": null,
      "asset": null,
      "startDate": null,
      "endDate": null
    }
  }
}
```

**Success Response (200 OK) - With Filters:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid-1",
        "exchange": "bybit",
        "transactionType": "trade",
        "asset": "BTC",
        "amount": 0.5,
        "valueUsd": 22500.00,
        "trade": {
          "pair": "BTCUSDT",
          "side": "buy"
        },
        "transactionTimestamp": "2024-12-16T10:30:00Z"
      }
    ],
    "summary": {
      "totalTransactions": 45,
      "periodStats": {
        "totalBoughtUsd": 45000.00,
        "totalSoldUsd": 0,
        "totalFeesUsd": 45.00
      }
    }
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 45,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "filters": {
      "exchange": "bybit",
      "transactionType": "trade",
      "asset": "BTC",
      "startDate": "2024-12-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z"
    }
  }
}
```

**Success Response (200 OK) - Empty:**
```json
{
  "success": true,
  "data": {
    "transactions": [],
    "summary": {
      "totalTransactions": 0,
      "periodStats": null
    },
    "message": "No transactions found. Transactions are synced from your connected exchanges."
  },
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range",
    "details": [
      {
        "field": "end_date",
        "message": "End date must be after start date",
        "code": "INVALID_DATE_RANGE"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-16T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Transactions retrieved for authenticated user
- Filters applied correctly
- Pagination working
- Summary statistics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid exchange filter | 400 | Return "Invalid exchange" |
| Invalid transaction_type | 400 | Return "Invalid transaction type" |
| Invalid date format | 400 | Return "Invalid date format. Use ISO8601" |
| Invalid date range | 400 | Return "End date must be after start date" |
| Invalid page_size | 400 | Return "Page size must be between 1 and 100" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-API-001**: Pagination and List Optimization

**Process-Specific Notes:**
- Database Queries: 3 queries (data, count, summary)
- Target P95 latency: < 300ms
- Index on `(user_id, transaction_timestamp)` for efficient queries
- Summary statistics cached for 5 minutes

#### Dependencies

**Database:**
- `portfolio_db` (PostgreSQL) - Tables: `transactions`
- Verify schema: docs/01-phase/database-schemas/portfolio_db_schema.dbml

#### Notes

**Transaction Types:**
- `trade`: Buy or sell trade on exchange
- `deposit`: Funds deposited to exchange
- `withdrawal`: Funds withdrawn from exchange
- `fee`: Standalone fee (e.g., funding fees)
- `transfer`: Transfer between exchanges (future)

**Data Synchronization:**
- Transactions are synced via PROC-PORTFOLIO-010 (Sync Transactions from Exchange)
- New transactions are pulled periodically or on-demand
- `synced_at` indicates when we imported the transaction

**Export Support:**
- This endpoint supports CSV export via Accept header
- `Accept: text/csv` returns CSV format (for tax reporting)

**Use Cases:**
1. User reviewing recent trading activity
2. User filtering transactions for specific asset
3. User exporting transactions for tax purposes
4. User reconciling deposits/withdrawals

**Related Processes:**
- PROC-PORTFOLIO-010: Sync Transactions from Exchange (populates this data)
- PROC-PORTFOLIO-006: Get P&L Report (uses transaction data)
- PROC-PORTFOLIO-011: Calculate/Update Cost Basis (uses transaction data)

---
