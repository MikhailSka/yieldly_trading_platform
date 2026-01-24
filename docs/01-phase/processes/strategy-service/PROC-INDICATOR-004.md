### PROC-INDICATOR-004: Sync Indicators from Backtesting Service

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Admin (Manual Trigger via Admin Panel)

#### Trigger
Admin manually triggers sync from admin panel to import new indicators from the backtesting library

#### Preconditions
- Admin is authenticated with admin role
- Backtesting Service is available
- Indicator categories exist in database

#### Overview

This process supports a **two-step workflow** for indicator synchronization:
1. **Preview Mode** - Shows what will be imported, allowing admin to review before committing
2. **Import Mode** - Actually imports the new indicators (requires prior preview)

This ensures admins can:
- Review new indicators before they're added
- Verify no incorrect indicators are being imported
- See duplicates that will be skipped
- Understand what's new vs what already exists

---

## Step 1: Preview Sync (Get Differences)

#### Inputs

**API Endpoint:** `GET /api/v1/admin/indicators/sync/preview`

**Query Parameters:**
```
GET /api/v1/admin/indicators/sync/preview?library={talib|pandas_ta|all}
```

**Parameter Details:**
- `library` (string, default: all): Which library to sync from

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/sync/preview` (GET)
2. **Admin Controller validates admin permissions**
   - If not admin → Return 403 Forbidden
3. **Indicator Manager calls Backtesting Service**
   - HTTP GET: `/api/v1/backtesting/indicators?library={library}`
   - Receives list of all available indicators from TA-Lib
4. **Backtesting Service returns raw indicator definitions**
   ```json
   {
     "success": true,
     "data": {
       "library": "talib",
       "indicators": [
         {
           "name": "SMA",
           "fullName": "Simple Moving Average",
           "group": "Overlap Studies",
           "technicalSpec": {
             "parameters": [{"name": "timeperiod", "type": "int", "default": 30, "min": 2, "max": 100000}],
             "inputs": ["close"],
             "outputs": ["sma"],
             "function": "talib.SMA"
           }
         }
       ],
       "totalCount": 158
     }
   }
   ```
5. **Indicator Manager fetches all existing indicators**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT name, library, technical_spec, is_active, last_synced_at
   FROM indicators
   WHERE library = $1 OR $1 = 'all';
   ```
6. **Indicator Manager compares and categorizes indicators**
   - **New Indicators**: In library but NOT in database (by name+library)
   - **Existing Unchanged**: In both, technical_spec matches
   - **Existing Updated**: In both, but technical_spec differs (parameter changes)
   - **Orphaned**: In database but NOT in library (library removed indicator)
7. **For each new indicator, auto-suggest category:**
   - Match TA-Lib group to our categories (if mapping exists)
   - Or use heuristics:
     - Contains "MA", "EMA", "SMA", "DEMA", "TEMA" → Overlap Studies
     - Contains "RSI", "MACD", "STOCH", "MOM", "ROC" → Momentum
     - Contains "BBANDS", "ATR", "NATR", "TRANGE" → Volatility
     - Contains "VOLUME", "OBV", "AD" → Volume
     - Default → Uncategorized (admin must assign)
8. **Generate preview report**
9. **Return preview response**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "previewId": "preview-uuid-123",
    "library": "talib",
    "generatedAt": "2024-12-01T12:00:00Z",
    "expiresAt": "2024-12-01T13:00:00Z",
    "summary": {
      "totalInLibrary": 158,
      "totalInDatabase": 150,
      "newIndicators": 8,
      "existingUnchanged": 145,
      "existingUpdated": 5,
      "orphanedIndicators": 0
    },
    "newIndicators": [
      {
        "name": "TEMA",
        "fullName": "Triple Exponential Moving Average",
        "suggestedDisplayName": "Triple Exponential Moving Average",
        "suggestedCategory": {
          "categoryId": "uuid",
          "categoryName": "Overlap Studies"
        },
        "technicalSpec": {
          "parameters": [{"name": "timeperiod", "type": "int", "default": 30, "min": 2, "max": 100000}],
          "inputs": ["close"],
          "outputs": ["tema"]
        },
        "willBeImportedAs": "inactive"
      },
      {
        "name": "KAMA",
        "fullName": "Kaufman Adaptive Moving Average",
        "suggestedDisplayName": "Kaufman Adaptive Moving Average",
        "suggestedCategory": {
          "categoryId": "uuid",
          "categoryName": "Overlap Studies"
        },
        "technicalSpec": {
          "parameters": [{"name": "timeperiod", "type": "int", "default": 30, "min": 2, "max": 100000}],
          "inputs": ["close"],
          "outputs": ["kama"]
        },
        "willBeImportedAs": "inactive"
      }
    ],
    "existingUpdated": [
      {
        "name": "MACD",
        "indicatorId": "uuid",
        "currentIsActive": true,
        "changes": {
          "technicalSpec": {
            "before": {"parameters": [...]},
            "after": {"parameters": [...]}
          }
        },
        "willUpdate": ["technicalSpec", "fullName", "lastSyncedAt"],
        "willPreserve": ["displayName", "description", "usageExample", "isActive", "categoryId"]
      }
    ],
    "existingUnchanged": {
      "count": 145,
      "note": "These indicators already exist and have no technical changes"
    },
    "orphanedIndicators": {
      "count": 0,
      "note": "Indicators in database that no longer exist in library",
      "indicators": []
    },
    "duplicatesSkipped": {
      "count": 150,
      "note": "These indicators already exist in the database and will be skipped during import"
    },
    "warnings": [],
    "instructions": {
      "toImport": "POST /api/v1/admin/indicators/sync with previewId to import new indicators",
      "note": "New indicators will be imported as INACTIVE. Admin must configure and activate them."
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## Step 2: Execute Import

#### Inputs

**API Endpoint:** `POST /api/v1/admin/indicators/sync`

**Request Body:**
```json
{
  "previewId": "preview-uuid-123 (required - from preview step)",
  "importOptions": {
    "importNew": true,
    "updateExisting": true,
    "skipIndicators": ["INDICATOR_NAME_TO_SKIP"]
  }
}
```

**Parameter Details:**
- `previewId` (uuid, required): The preview ID from Step 1. Ensures admin reviewed before importing.
- `importOptions.importNew` (boolean, default: true): Import new indicators
- `importOptions.updateExisting` (boolean, default: true): Update existing indicators with changed technical specs
- `importOptions.skipIndicators` (array, optional): List of indicator names to skip

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/sync` (POST)
2. **Admin Controller validates admin permissions**
   - If not admin → Return 403 Forbidden
3. **Indicator Manager validates preview**
   ```sql
   -- Check preview exists and not expired (stored in Redis or temp table)
   GET indicator_sync_preview:{previewId}
   ```
   - If preview not found → Return 400 "Preview not found. Please generate a new preview."
   - If preview expired → Return 400 "Preview expired. Please generate a new preview."
4. **Indicator Manager retrieves preview data**
   - Get the cached comparison from Step 1
5. **Indicator Manager begins transaction**
6. **If importNew is true, for each new indicator:**
   - Skip if in `skipIndicators` list
   - Auto-assign category based on suggestions
   - Generate display_name from fullName
   - **Insert as INACTIVE** (is_active = false):
     ```sql
     -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
     INSERT INTO indicators (
       category_id, name, display_name, full_name, library, technical_spec,
       is_active, last_synced_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       false,  -- IMPORTANT: New indicators are INACTIVE until admin configures them
       NOW(), NOW(), NOW()
     )
     ON CONFLICT (name, library) DO NOTHING  -- Skip duplicates
     RETURNING id;
     ```
7. **If updateExisting is true, for each updated indicator:**
   - Skip if in `skipIndicators` list
   - **Preserve admin-configured fields**
   - Update only technical fields:
     ```sql
     -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
     UPDATE indicators
     SET technical_spec = $1,
         full_name = $2,
         last_synced_at = NOW(),
         updated_at = NOW()
     WHERE name = $3 AND library = $4;
     ```
8. **Update last_synced_at for unchanged indicators:**
   ```sql
   UPDATE indicators
   SET last_synced_at = NOW()
   WHERE name = ANY($1) AND library = $2;
   ```
9. **Commit transaction**
10. **Cache Manager invalidates indicator cache**
11. **Delete preview from cache**
12. **Return import summary**

#### Outputs

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "syncId": "uuid",
    "library": "talib",
    "startedAt": "2024-12-01T12:05:00Z",
    "completedAt": "2024-12-01T12:05:01.250Z",
    "durationMs": 1250,
    "statistics": {
      "totalProcessed": 158,
      "newIndicatorsAdded": 8,
      "existingIndicatorsUpdated": 5,
      "unchangedIndicators": 145,
      "skippedByUser": 0,
      "duplicatesSkipped": 0,
      "errors": 0
    },
    "newIndicators": [
      {
        "indicatorId": "uuid",
        "name": "TEMA",
        "displayName": "Triple Exponential Moving Average",
        "categoryName": "Overlap Studies",
        "isActive": false,
        "configureUrl": "/api/v1/admin/indicators/{indicatorId}"
      },
      {
        "indicatorId": "uuid",
        "name": "KAMA",
        "displayName": "Kaufman Adaptive Moving Average",
        "categoryName": "Overlap Studies",
        "isActive": false,
        "configureUrl": "/api/v1/admin/indicators/{indicatorId}"
      }
    ],
    "updatedIndicators": [
      {
        "indicatorId": "uuid",
        "name": "MACD",
        "updatedFields": ["technicalSpec", "fullName"]
      }
    ],
    "message": "Sync completed. 8 new indicators added as INACTIVE. Please configure and activate them.",
    "nextSteps": [
      "Review new indicators at /admin/indicators?status=inactive",
      "Configure description, usage examples, and thresholds for each",
      "Activate indicators when ready for users"
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:05:01.250Z",
    "version": "v1"
  }
}
```

**Error Response (400 - Preview Required):**
```json
{
  "success": false,
  "error": {
    "code": "PREVIEW_REQUIRED",
    "message": "Preview not found or expired. Please generate a new preview before importing.",
    "details": {
      "previewEndpoint": "GET /api/v1/admin/indicators/sync/preview",
      "reason": "This ensures you review changes before importing"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:05:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (503 - Service Unavailable):**
```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Backtesting Service is currently unavailable",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

#### Success Criteria
- Preview shows accurate diff between library and database
- No indicators imported without preview approval
- New indicators added as INACTIVE
- Existing admin customizations preserved
- Duplicates detected and skipped (no duplicates imported)
- Cache invalidated after import

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Backtesting Service unavailable | 503 | Log error, return service unavailable message |
| Preview not found | 400 | Return "Preview not found. Please generate a new preview." |
| Preview expired | 400 | Return "Preview expired (1 hour TTL). Please generate a new preview." |
| Invalid indicator data | 400 | Skip indicator, log warning, continue with others |
| Database error | 500 | Rollback transaction, return error |
| Duplicate indicator | - | Skip silently (handled by ON CONFLICT DO NOTHING) |

#### Deduplication Logic

**Primary Key**: `(name, library)` combination is unique

**Duplicate Detection:**
- During preview: Shows count of existing indicators that will be skipped
- During import: Uses `ON CONFLICT (name, library) DO NOTHING`
- Example:
  - `SMA` from `talib` already exists → Skipped during import
  - `SMA` from `pandas_ta` does not exist → Can be imported

**Unique constraint** on `indicators` table:
```sql
UNIQUE (name, library)
```

#### Admin Customization Preservation

The sync process **NEVER overwrites** these admin-configured fields:
- `display_name` - Admin's user-friendly name (auto-generated on first insert, then editable)
- `description` - Admin's detailed explanation
- `usage_example` - Admin's code example
- `common_use_cases` - Admin's trading use cases
- `popular_periods` - Admin's recommended period values
- `typical_thresholds` - Admin's threshold recommendations
- `is_active` - Admin's enable/disable status
- `category_id` - Admin's category assignment (only auto-assigned on first insert)

The sync process **ONLY updates** these technical fields:
- `technical_spec` - From Backtesting Service (parameter definitions, function signature)
- `full_name` - From Backtesting Service (official indicator name)
- `last_synced_at` - Timestamp of last sync

#### New Indicator Workflow

```
1. Admin triggers preview
   ↓
2. Admin reviews new indicators on frontend
   ↓
3. Admin triggers import (with previewId)
   ↓
4. New indicators added as INACTIVE
   ↓
5. Admin configures each indicator:
   - Set description
   - Add usage examples
   - Set popular periods
   - Set typical thresholds
   - Assign correct category
   ↓
6. Admin activates indicator (is_active = true)
   ↓
7. Users can now see and use the indicator
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Preview Step**: P95 < 3 seconds for 150 indicators
- **Import Step**: P95 < 5 seconds for 150 indicators
- **Backtesting Service Call**: < 2 seconds
- **Database Operations**: Batch inserts/updates where possible
- **Preview Cache TTL**: 1 hour (admin must import within 1 hour of preview)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`, `indicator_categories`

**Cache:**
- Redis - Preview data cache (`indicator_sync_preview:{previewId}`, TTL 1 hour)
- Redis - Indicator list cache (invalidated after import)

**External Services:**
- Backtesting Service - `GET /api/v1/backtesting/indicators`

#### Notes

- **No Automatic Sync**: Unlike the previous version, this process is admin-triggered only. No scheduled jobs.
- **Preview Required**: Import cannot be performed without a valid preview. This prevents accidental imports.
- **Preview Expiration**: Previews expire after 1 hour to ensure admin reviews current state.
- **Inactive by Default**: New indicators are never visible to users until admin configures and activates them.
- **Duplicate Safety**: The unique constraint and ON CONFLICT clause ensure no duplicates can be created.
- **Audit Trail**: Consider logging sync events to `strategy_events` table for audit purposes.

#### Related Processes

- **PROC-INDICATOR-005**: Admin - Update Indicator (configure and activate new indicators)
- **PROC-INDICATOR-007**: Admin - Manage Indicator Categories (create categories for new indicators)
- **PROC-BACKTEST-004**: Expose Indicator Definitions (source of indicator data)

---
