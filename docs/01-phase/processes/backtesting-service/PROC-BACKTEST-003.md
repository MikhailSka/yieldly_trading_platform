### PROC-BACKTEST-003: Generate Detailed Backtest Report

**Service Owner:** Backtesting Service
**Related FR:** FR-BACKTEST-004
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User clicks "Download Report" button

#### Actor
Authenticated User

#### Preconditions
- Backtest has completed
- User owns backtest

#### Inputs
**API Endpoint:** `POST /api/v1/backtests/{backtestId}/report`

**Request Body:**
```json
{
  "format": "pdf"
}
```

#### Process Steps

1. **API Gateway receives request**
2. **Backtest Controller validates ownership** (same as PROC-BACKTEST-002 step 2)
3. **Backtest Controller checks if report exists in blob storage**
   ```
   Blob path: backtests/reports/{backtestId}.pdf
   ```
   - If exists and recent (< 7 days) → Return cached report URL
4. **Report Formatter fetches all backtest data** (same as PROC-BACKTEST-002)
5. **Report Formatter generates PDF**
   - Use ReportLab library
   - Include:
     - Executive summary
     - Performance metrics table
     - Equity curve chart
     - Trade log table
     - Risk metrics
     - Strategy code (for reference)
6. **Result Publisher uploads to Azure Blob Storage**
   ```python
   blob_client = container_client.get_blob_client(f"reports/{backtestId}.pdf")
   blob_client.upload_blob(pdf_data)
   ```
7. **Result Publisher generates secure download link**
   - SAS token with 7-day expiration
8. **Return download URL**

#### Outputs
**Success Response (ADR-032):**
```json
{
  "success": true,
  "data": {
    "reportUrl": "https://yieldlystorage.blob.core.windows.net/backtests/reports/{id}.pdf?sas_token",
    "expiresAt": "2024-12-08T12:00:00Z",
    "fileSizeBytes": 524288
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- PDF report generated
- Report uploaded to blob storage
- Download URL returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not backtest owner | 403 | Return "Access denied" |
| Backtest not complete | 400 | Return "Backtest not yet complete" |
| Report generation error | 500 | Log error, retry |

#### Performance Requirements
**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- First generation: < 3 seconds (includes PDF generation and upload)
- Cached report: < 200ms (direct URL return)
- Cache TTL: 7 days

#### Dependencies
**Database:**
- `backtest_db` (PostgreSQL) - Tables: `backtest_runs`, `backtest_equity_curve`, `backtest_trades`
- Verify schema: docs/01-phase/database-schemas/backtesting_db_schema.dbml

**Storage:**
- Azure Blob Storage - Container: `backtests`, Path: `reports/{backtestId}.pdf`

**Libraries:**
- ReportLab (PDF generation)
- matplotlib (charts)

---
