# Strategy Service Processes - Consolidated

This document contains all process documentation for the Strategy Service (including indicators).

**Total Documents:** 24  
**Last Generated:** 2025-11-30T23:58:38.358Z  
**Source Directory:** `processes/strategy-service`


---

## Table of Contents

1. [PROC-INDICATOR-001](#proc-indicator-001)
2. [PROC-INDICATOR-002](#proc-indicator-002)
3. [PROC-INDICATOR-003](#proc-indicator-003)
4. [PROC-INDICATOR-004](#proc-indicator-004)
5. [PROC-INDICATOR-005](#proc-indicator-005)
6. [PROC-INDICATOR-006](#proc-indicator-006)
7. [PROC-INDICATOR-007](#proc-indicator-007)
8. [PROC-STRATEGY-001](#proc-strategy-001)
9. [PROC-STRATEGY-002](#proc-strategy-002)
10. [PROC-STRATEGY-003](#proc-strategy-003)
11. [PROC-STRATEGY-004](#proc-strategy-004)
12. [PROC-STRATEGY-005](#proc-strategy-005)
13. [PROC-STRATEGY-006](#proc-strategy-006)
14. [PROC-STRATEGY-007](#proc-strategy-007)
15. [PROC-STRATEGY-008](#proc-strategy-008)
16. [PROC-STRATEGY-009](#proc-strategy-009)
17. [PROC-STRATEGY-010](#proc-strategy-010)
18. [PROC-STRATEGY-011](#proc-strategy-011)
19. [PROC-STRATEGY-012](#proc-strategy-012)
20. [PROC-STRATEGY-013](#proc-strategy-013)
21. [PROC-STRATEGY-014](#proc-strategy-014)
22. [PROC-STRATEGY-015](#proc-strategy-015)
23. [PROC-STRATEGY-016](#proc-strategy-016)
24. [PROC-STRATEGY-017](#proc-strategy-017)

---

## PROC-INDICATOR-001: List Indicators with Filters

**Source File:** `PROC-INDICATOR-001.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-001.md`

### PROC-INDICATOR-001: List Indicators with Filters

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-001
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032, ADR-029

#### Actor
Authenticated User or Admin

#### Trigger
- **User**: Opens visual strategy constructor/block editor and searches for indicators to add
- **Admin**: Opens indicator management panel to review, edit, or activate/deactivate indicators

#### Use Cases
- **Normal User**: Browse and search indicators to use in visual strategy constructor
- **Admin**: Manage indicators in admin panel (can see inactive indicators)

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `GET /api/v1/indicators`

**Query Parameters:**
```
GET /api/v1/indicators?
  category_id={uuid}
  &library=talib|pandas_ta|custom
  &is_active=true|false (admin only, users always see is_active=true)
  &search={keyword}
  &sort_by=name|popularity
  &favorites_only=true|false
  &include_favorites=true
  &page={number}
  &page_size={number}
```

#### Process Steps
1. **API Gateway receives request**
2. **Authorization check**:
   - If user is **NOT admin** → Force `is_active = true` (users only see active indicators)
   - If user **IS admin** → Allow `is_active` filter (can see inactive for management)
3. **Indicator Manager checks Redis cache** (if no filters except category)
4. **Indicator Repository queries with filters**
   ```sql
   SELECT
     i.id, i.name, i.display_name, i.full_name, i.category_id, i.library,
     i.description, i.usage_example, i.common_use_cases,
     i.is_active, i.technical_spec, i.popular_periods, i.typical_thresholds,
     ic.name as category_name,
     EXISTS(
       SELECT 1 FROM indicator_favorites if
       WHERE if.indicator_id = i.id AND if.user_id = $1
     ) as is_favorited,
     COUNT(DISTINCT siu.strategy_id) as usage_count
   FROM indicators i
   LEFT JOIN indicator_categories ic ON i.category_id = ic.id
   LEFT JOIN strategy_indicator_usage siu ON i.id = siu.indicator_id
   WHERE ($2 IS NULL OR i.category_id = $2)
     AND ($3 IS NULL OR i.library = $3)
     AND ($4 IS NULL OR i.is_active = $4)
     AND ($5 IS NULL OR i.name ILIKE '%' || $5 || '%' OR i.display_name ILIKE '%' || $5 || '%' OR i.full_name ILIKE '%' || $5 || '%')
     AND ($6 IS NULL OR $6 = false OR EXISTS(
       SELECT 1 FROM indicator_favorites if2
       WHERE if2.indicator_id = i.id AND if2.user_id = $1
     ))
   GROUP BY i.id, ic.name
   ORDER BY
     CASE WHEN $7 = 'popularity' THEN COUNT(DISTINCT siu.strategy_id) END DESC,
     CASE WHEN $7 = 'name' THEN i.display_name END ASC;
   ```
   **Parameters:**
   - `$1` = user_id
   - `$2` = category_id (optional)
   - `$3` = library (optional)
   - `$4` = is_active (forced to true for non-admin users)
   - `$5` = search keyword (optional)
   - `$6` = favorites_only (optional, filters to only favorited indicators)
   - `$7` = sort_by (name or popularity)

5. **If include_favorites=true, mark favorited indicators in response**
6. **Return paginated indicator list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "SMA",
      "displayName": "Simple Moving Average",
      "fullName": "Simple Moving Average",
      "categoryId": "uuid",
      "categoryName": "Overlap Studies",
      "library": "talib",
      "description": "Calculates average price over specified period",
      "usageExample": "sma = SMA(close, timeperiod=20)",
      "commonUseCases": ["Trend identification", "Support/resistance"],
      "isActive": true,
      "technicalSpec": {
        "parameters": [
          {
            "name": "timeperiod",
            "type": "integer",
            "default": 30,
            "min": 2,
            "max": 100000,
            "description": "Number of periods"
          }
        ],
        "inputs": ["close"],
        "outputs": ["sma"]
      },
      "popularPeriods": [20, 50, 200],
      "typicalThresholds": null,
      "isFavorited": true,
      "usageCount": 145
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 150,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Indicators retrieved based on filters
- Admin-only filters enforced
- Results paginated correctly
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid category_id | 400 | Return "Invalid category ID" |
| Unauthorized is_active filter | 403 | Return "Admin permissions required" |
| Database error | 500 | Log error, return generic message |

#### Filter Parameters Explained
- **`favorites_only=true`**: Returns ONLY user's favorited indicators
- **`include_favorites=true`**: Returns all matching indicators but marks which ones are favorited (adds `is_favorited` field)
- Both can be used together or separately

#### Example Use Cases

**User searching in visual constructor:**
```
GET /api/v1/indicators?search=moving+average&category_id={trend_category}&include_favorites=true
```
→ User sees all active moving average indicators with favorites marked

**User viewing only favorites:**
```
GET /api/v1/indicators?favorites_only=true
```
→ User sees only their favorited indicators for quick access

**Admin managing inactive indicators:**
```
GET /api/v1/indicators?is_active=false
```
→ Admin sees all inactive indicators to review or activate

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 complex query with JOINs and filters
- Expected Execution Time: P95 < 300ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`, `indicator_categories`, `indicator_favorites`, `strategy_indicator_usage`

---


---

## PROC-INDICATOR-002: Add Indicator to Favorites

**Source File:** `PROC-INDICATOR-002.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-002.md`

### PROC-INDICATOR-002: Add Indicator to Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User clicks "Add to Favorites" (star icon) on an indicator

#### Preconditions
- User is authenticated
- Indicator exists and is active

#### Inputs

**API Endpoint:** `POST /api/v1/indicators/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/indicators/{id}/favorite` (POST)
2. **Indicator Repository adds favorite**
   ```sql
   INSERT INTO indicator_favorites (user_id, indicator_id, favorited_at)
   VALUES ($1, $2, NOW())
   ON CONFLICT (user_id, indicator_id) DO NOTHING;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "favorited": true,
    "favoritedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite added to database
- Idempotent operation (no error if already favorited)
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Indicator not found | 404 | Return "Indicator not found" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (INSERT with ON CONFLICT)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicator_favorites`

---


---

## PROC-INDICATOR-003: Remove Indicator from Favorites

**Source File:** `PROC-INDICATOR-003.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-003.md`

### PROC-INDICATOR-003: Remove Indicator from Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-INDICATOR-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User removes indicator from favorites

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `DELETE /api/v1/indicators/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/indicators/{id}/favorite` (DELETE)
2. **Indicator Favorites Repository removes favorite**
   ```sql
   DELETE FROM indicator_favorites
   WHERE user_id = $1 AND indicator_id = $2;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "favorited": false,
    "message": "Indicator removed from favorites"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite removed from database
- Idempotent operation (no error if not favorited)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (DELETE)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicator_favorites`

---


---

## PROC-INDICATOR-004: Sync Indicators from Backtesting Service

**Source File:** `PROC-INDICATOR-004.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-004.md`

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


---

## PROC-INDICATOR-005: Admin - Edit Indicator

**Source File:** `PROC-INDICATOR-005.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-005.md`

### PROC-INDICATOR-005: Admin - Edit Indicator

**Service Owner:** Strategy Service
**Related FR:** FR-ADMIN-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Admin

#### Trigger
Admin updates indicator metadata or technical specification

#### Preconditions
- User has admin role
- Indicator exists

#### Inputs

**API Endpoint:** `PUT /api/v1/admin/indicators/{id}`

**Request Body:**
```json
{
  "displayName": "string (optional)",
  "fullName": "string (optional)",
  "description": "text (optional)",
  "usageExample": "text (optional)",
  "commonUseCases": "text (optional)",
  "technicalSpec": "object (optional)",
  "popularPeriods": "array (optional)",
  "typicalThresholds": "object (optional)"
}
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/indicators/{id}` (PUT)
2. **Admin Controller validates admin permissions**
3. **Indicator Repository retrieves current indicator**
4. **Indicator Manager merges updates**
5. **Indicator Repository updates indicator**
   ```sql
   UPDATE indicators
   SET display_name = COALESCE($1, display_name),
       full_name = COALESCE($2, full_name),
       description = COALESCE($3, description),
       usage_example = COALESCE($4, usage_example),
       common_use_cases = COALESCE($5, common_use_cases),
       technical_spec = COALESCE($6, technical_spec),
       popular_periods = COALESCE($7, popular_periods),
       typical_thresholds = COALESCE($8, typical_thresholds),
       updated_at = NOW()
   WHERE id = $9
   RETURNING *;
   ```
6. **Cache Manager invalidates indicator cache**
7. **Return updated indicator**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "SMA",
    "displayName": "Simple Moving Average",
    "fullName": "Simple Moving Average",
    "description": "Calculates average price over specified period",
    "usageExample": "sma = SMA(close, timeperiod=20)",
    "commonUseCases": "Trend identification, Support/resistance",
    "technicalSpec": {
      "parameters": [
        {
          "name": "timeperiod",
          "type": "integer",
          "default": 30,
          "min": 2,
          "max": 100000
        }
      ],
      "inputs": ["close"],
      "outputs": ["sma"]
    },
    "popularPeriods": [20, 50, 200],
    "typicalThresholds": null,
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Indicator metadata updated successfully
- Admin customizations preserved
- Cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Indicator not found | 404 | Return "Indicator not found" |
| Invalid technical spec | 400 | Return validation errors |
| Database error | 500 | Log error, rollback transaction |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (fetch current, update)
- Expected Execution Time: P95 < 200ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`

**Cache:**
- Redis - Indicator list cache

#### Notes
- Cannot change `name` field (used as identifier in code)
- Cannot change `library` field (would break existing strategies)
- Cannot change `category_id` (would break categorization)
- Admin can customize `display_name` to make it more user-friendly (e.g., "bollinger_bands" → "Bollinger Bands ®")

---


---

## PROC-INDICATOR-006: Admin - Activate/Deactivate Indicator

**Source File:** `PROC-INDICATOR-006.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-006.md`

### PROC-INDICATOR-006: Admin - Activate/Deactivate Indicator

**Service Owner:** Strategy Service
**Related FR:** FR-ADMIN-005
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Admin

#### Trigger
Admin activates or deactivates an indicator

#### Preconditions
- User has admin role
- Indicator exists

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/indicators/{id}/status`

**Request Body:**
```json
{
  "isActive": "boolean"
}
```

#### Process Steps
1. **API Gateway receives request** → `/api/v1/admin/indicators/{id}/status` (PATCH)
2. **Admin Controller validates admin permissions**
3. **Indicator Repository updates status**
   ```sql
   UPDATE indicators
   SET is_active = $1, updated_at = NOW()
   WHERE id = $2;
   ```
4. **Cache Manager invalidates indicator cache**
5. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "indicatorId": "uuid",
    "name": "SMA",
    "isActive": true,
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Indicator status updated successfully
- Cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Indicator not found | 404 | Return "Indicator not found" |
| Database error | 500 | Log error, rollback transaction |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (UPDATE)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicators`

**Cache:**
- Redis - Indicator list cache

#### Notes
- Deactivating an indicator does NOT affect existing strategies that use it
- Deactivated indicators are hidden from indicator picker for new strategies
- Admin can see inactive indicators in PROC-INDICATOR-001 with `is_active=false` filter

---


---

## PROC-INDICATOR-007: Admin - Manage Indicator Categories

**Source File:** `PROC-INDICATOR-007.md`  
**Path:** `processes\strategy-service\PROC-INDICATOR-007.md`

### PROC-INDICATOR-007: Admin - Manage Indicator Categories

**Service Owner:** Strategy Service (Indicator Management Module)
**Related FR:** FR-STRATEGY-010
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-032

#### Trigger
Admin creates, updates, reorders, or deletes indicator categories for organizing technical indicators

#### Actor
Admin

#### Preconditions
- User has admin role
- For update/delete operations: Category exists

#### Sub-Processes

This process encompasses admin-only category management operations:
1. **Create Indicator Category** - Add a new category
2. **List All Categories** - View all categories with indicators count
3. **Update Category** - Modify category details
4. **Reorder Categories** - Change display order
5. **Delete Category** - Remove a category (with safety checks)

---

## 1. Create Indicator Category

#### Inputs

**API Endpoint:** `POST /api/v1/admin/indicators/categories`

**Request Body:**
```json
{
  "name": "string (required, max 100 chars, e.g., 'Momentum', 'Volatility')",
  "description": "string (optional, max 500 chars)",
  "icon": "string (optional, max 100 chars, icon identifier)",
  "displayOrder": "integer (optional, default: auto-increment from max)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/categories` (POST)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Category Manager validates input**
   - Trim and validate name
   - Name must be unique (case-insensitive)
   - If invalid → Return 400 "Invalid category name"
4. **Category Repository checks for duplicate**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT id, name FROM indicator_categories
   WHERE LOWER(name) = LOWER($1);
   ```
   - If exists → Return 409 "Category already exists"
5. **Category Repository determines display order**
   ```sql
   -- If displayOrder not provided, use max + 1
   SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
   FROM indicator_categories;
   ```
6. **Category Repository creates category**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO indicator_categories (name, description, display_order, icon)
   VALUES ($1, $2, $3, $4)
   RETURNING id, name, description, display_order, icon, created_at, updated_at;
   ```
7. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "category": {
      "categoryId": "uuid",
      "name": "Momentum",
      "description": "Indicators that measure the rate of change in price movements",
      "displayOrder": 2,
      "icon": "trending-up",
      "createdAt": "2024-12-01T12:00:00Z",
      "updatedAt": "2024-12-01T12:00:00Z"
    },
    "message": "Category created successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Duplicate Category):**
```json
{
  "success": false,
  "error": {
    "code": "CATEGORY_ALREADY_EXISTS",
    "message": "A category with this name already exists",
    "details": {
      "existingCategory": {
        "categoryId": "uuid",
        "name": "Momentum",
        "displayOrder": 2
      }
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. List All Categories (Admin View)

#### Inputs

**API Endpoint:** `GET /api/v1/admin/indicators/categories?includeStats={boolean}&page={page}&page_size={page_size}`

**Query Parameters:**
- `includeStats`: Include indicator count and usage stats (optional, default: true)
- `page`: Page number (optional, default: 1)
- `page_size`: Results per page (optional, default: 50, max: 100)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/categories` (GET)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Category Repository retrieves categories with stats and pagination**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     ic.id,
     ic.name,
     ic.description,
     ic.display_order,
     ic.icon,
     ic.created_at,
     ic.updated_at,
     COUNT(i.id) as indicator_count,
     COUNT(i.id) FILTER (WHERE i.is_active = true) as active_indicator_count,
     COUNT(*) OVER() as total_count
   FROM indicator_categories ic
   LEFT JOIN indicators i ON ic.id = i.category_id
   GROUP BY ic.id
   ORDER BY ic.display_order ASC, ic.name ASC
   LIMIT $1 OFFSET $2;
   ```
   **Parameters:**
   - `$1` = page_size
   - `$2` = offset = (page - 1) * page_size
4. **Return paginated category list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "categoryId": "uuid",
      "name": "Trend",
      "description": "Indicators that identify market direction and strength",
      "displayOrder": 1,
      "icon": "arrow-trending-up",
      "indicatorCount": 12,
      "activeIndicatorCount": 10,
      "createdAt": "2024-10-01T10:00:00Z",
      "updatedAt": "2024-10-01T10:00:00Z"
    },
    {
      "categoryId": "uuid",
      "name": "Momentum",
      "description": "Indicators that measure rate of price change",
      "displayOrder": 2,
      "icon": "trending-up",
      "indicatorCount": 8,
      "activeIndicatorCount": 8,
      "createdAt": "2024-10-01T10:00:00Z",
      "updatedAt": "2024-10-01T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3. Update Category

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/indicators/categories/{id}`

**Path Parameters:**
- `{id}`: Category UUID

**Request Body:**
```json
{
  "name": "string (optional, max 100 chars)",
  "description": "string (optional, max 500 chars)",
  "icon": "string (optional, max 100 chars)",
  "displayOrder": "integer (optional)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/categories/{id}` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Category Repository retrieves category**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT id, name, description, display_order, icon
   FROM indicator_categories
   WHERE id = $1;
   ```
   - If not found → Return 404 "Category not found"
4. **Category Manager validates updates**
   - If name is being changed, check for duplicates:
   ```sql
   SELECT id FROM indicator_categories
   WHERE LOWER(name) = LOWER($1) AND id != $2;
   ```
   - If duplicate → Return 409 "Category name already exists"
5. **Category Repository updates category**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE indicator_categories
   SET
     name = COALESCE($1, name),
     description = COALESCE($2, description),
     icon = COALESCE($3, icon),
     display_order = COALESCE($4, display_order),
     updated_at = NOW()
   WHERE id = $5
   RETURNING *;
   ```
6. **Invalidate indicator cache** (if category name changed)
7. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "category": {
      "categoryId": "uuid",
      "name": "Momentum Indicators",
      "description": "Updated description for momentum indicators",
      "displayOrder": 2,
      "icon": "trending-up",
      "updatedAt": "2024-12-01T12:00:00Z"
    },
    "message": "Category updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4. Reorder Categories

#### Inputs

**API Endpoint:** `PUT /api/v1/admin/indicators/categories/reorder`

**Request Body:**
```json
{
  "categoryOrders": [
    {"categoryId": "uuid", "displayOrder": 1},
    {"categoryId": "uuid", "displayOrder": 2},
    {"categoryId": "uuid", "displayOrder": 3}
  ]
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/categories/reorder` (PUT)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Category Manager validates all category IDs exist**
   ```sql
   SELECT id FROM indicator_categories
   WHERE id = ANY($1);
   ```
   - If any missing → Return 400 "One or more categories not found"
4. **Category Repository begins transaction**
5. **Category Repository updates display orders**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE indicator_categories
   SET
     display_order = data.new_order,
     updated_at = NOW()
   FROM (
     SELECT unnest($1::uuid[]) as id,
            unnest($2::int[]) as new_order
   ) as data
   WHERE indicator_categories.id = data.id;
   ```
   **Parameters:**
   - `$1` = array of category IDs
   - `$2` = array of new display orders
6. **Commit transaction**
7. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "categoriesReordered": 5,
    "message": "Category display order updated successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 5. Delete Category

#### Inputs

**API Endpoint:** `DELETE /api/v1/admin/indicators/categories/{id}?reassignTo={categoryId}`

**Path Parameters:**
- `{id}`: Category UUID to delete

**Query Parameters:**
- `reassignTo`: Category UUID to reassign indicators to (optional)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/indicators/categories/{id}` (DELETE)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Category Repository retrieves category**
   ```sql
   SELECT id, name FROM indicator_categories WHERE id = $1;
   ```
   - If not found → Return 404 "Category not found"
4. **Category Repository checks for indicators**
   ```sql
   SELECT COUNT(*) as indicator_count
   FROM indicators
   WHERE category_id = $1;
   ```
   - If `indicator_count > 0` and `reassignTo` is NULL → Return 409 "Category has indicators. Provide reassignTo parameter or reassign indicators first."
5. **If reassignTo provided:**
   - **Validate target category exists:**
   ```sql
   SELECT id FROM indicator_categories WHERE id = $1;
   ```
   - If not found → Return 400 "Target category not found"
   - **Reassign indicators:**
   ```sql
   UPDATE indicators
   SET
     category_id = $1,
     updated_at = NOW()
   WHERE category_id = $2;
   ```
6. **Category Repository deletes category**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   DELETE FROM indicator_categories
   WHERE id = $1
   RETURNING name;
   ```
7. **Invalidate indicator cache**
8. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "categoryName": "Obsolete Category",
    "indicatorsReassigned": 5,
    "reassignedTo": "Trend",
    "message": "Category deleted successfully. 5 indicators reassigned to 'Trend' category."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Category Has Indicators):**
```json
{
  "success": false,
  "error": {
    "code": "CATEGORY_HAS_INDICATORS",
    "message": "Cannot delete category that contains indicators",
    "details": {
      "categoryName": "Momentum",
      "indicatorCount": 8,
      "suggestions": [
        "Use DELETE /api/v1/admin/indicators/categories/{id}?reassignTo={categoryId} to reassign indicators",
        "Or manually reassign indicators via PATCH /api/v1/admin/indicators/{id}"
      ]
    }
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

**Create Category:**
- Category created in database
- Display order assigned
- HTTP 201 Created

**List Categories:**
- Returns all categories with statistics
- Ordered by display_order
- HTTP 200 OK

**Update Category:**
- Category details updated
- Cache invalidated if name changed
- HTTP 200 OK

**Reorder Categories:**
- All display orders updated atomically
- HTTP 200 OK

**Delete Category:**
- Category deleted from database
- Indicators reassigned if specified
- Cache invalidated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Category not found | 404 | Return "Category not found" |
| Duplicate category name | 409 | Return existing category details |
| Category has indicators (delete) | 409 | Return count, suggest reassignment |
| Target category not found (reassign) | 400 | Return "Target category not found" |
| Invalid display order | 400 | Return "Display order must be positive integer" |

#### Standard Indicator Categories

**Recommended Categories:**
1. **Trend** - Identify market direction (SMA, EMA, MACD, ADX)
2. **Momentum** - Measure price change rate (RSI, Stochastic, CCI)
3. **Volatility** - Measure price fluctuation (Bollinger Bands, ATR, Standard Deviation)
4. **Volume** - Analyze trading volume (OBV, Volume SMA, VWAP)
5. **Overlap Studies** - Price-overlaying indicators (Moving Averages, Parabolic SAR)

#### Admin Use Cases

**Use Case 1: Initialize Categories**
```
Admin sets up standard categories:
1. Admin creates "Trend" (displayOrder: 1)
2. Admin creates "Momentum" (displayOrder: 2)
3. Admin creates "Volatility" (displayOrder: 3)
4. Admin creates "Volume" (displayOrder: 4)
5. Indicators auto-categorized during sync
```

**Use Case 2: Reorganize Categories**
```
Admin changes category order:
1. Admin views current order
2. Admin decides to swap Momentum and Volatility
3. Admin calls reorder endpoint with new order
4. UI automatically updates to show new order
```

**Use Case 3: Merge Categories**
```
Admin consolidates categories:
1. Admin decides to merge "Overlap Studies" into "Trend"
2. Admin deletes "Overlap Studies" with reassignTo="Trend"
3. All overlap indicators now under "Trend"
4. UI shows simplified category list
```

**Use Case 4: Update Category Details**
```
Admin improves category descriptions:
1. Admin reviews category list
2. Admin updates "Momentum" description for clarity
3. Admin adds icon identifier
4. Users see improved category information
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operations)

**Process-Specific Notes:**
- **Create Category**: P95 < 150ms
- **List Categories**: P95 < 200ms (with stats)
- **Update Category**: P95 < 100ms (+ cache invalidation)
- **Reorder Categories**: P95 < 200ms (transaction)
- **Delete Category**: P95 < 300ms (with reassignment)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `indicator_categories`, `indicators`

**Cache:**
- Redis - Indicator cache invalidation required on category changes

#### Notes
- **Admin-Only**: All operations in this process require admin role
- **Categories are Required**: Every indicator must have a category_id
- **Display Order**: Controls order in UI dropdowns and category lists
- **No Cascade Delete**: Cannot delete category if it has indicators (must reassign first)
- **Cache Invalidation**: Category name changes require full indicator cache refresh
- **Icon Field**: Stores icon identifier (e.g., "trending-up", "activity", "bar-chart-2")
- **Case Insensitive Names**: Category names checked case-insensitively for uniqueness
- **Transaction Safety**: Reorder operation uses transaction for atomicity
- **Related Processes**:
  - PROC-INDICATOR-001 (List Indicators with Filters) - Filter by category
  - Indicator Sync Process - Auto-assign categories during sync
  - PROC-STRATEGY-006 (Validate Strategy Code) - Category shown in validation errors

---


---

## PROC-STRATEGY-001: List Strategies with Filters

**Source File:** `PROC-STRATEGY-001.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-001.md`

### PROC-STRATEGY-001: List Strategies with Filters

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-004, FR-STRATEGY-005, FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032, ADR-029

#### Trigger
- **User**: Opens strategy list, browses public strategies, or explores strategy templates
- **Admin**: Opens admin panel to manage strategies (can see all strategies regardless of visibility)

#### Actor
Authenticated User or Admin

#### Use Cases
- **Normal User**: Browse own strategies, explore public strategies, or view templates
- **Admin**: Manage all strategies in admin panel (can see private strategies, inactive strategies)

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `GET /api/v1/strategies`

**Query Parameters:**
```
GET /api/v1/strategies?
  scope=my|public|templates
  &is_public=true|false (admin only, users cannot use this)
  &is_template=true|false (admin only, users cannot use this)
  &status=draft|active|archived
  &tags={comma-separated}
  &search={keyword}
  &sort_by=created_at|name|updated_at|popularity|backtest_count
  &favorites_only=true|false
  &include_favorites=true
  &page={number}
  &page_size={number}
```

#### Scope Options
- **my**: User's own strategies only (includes all statuses if owned by user)
- **public**: Strategies marked as public by other users (`is_public=true AND status='active'`)
- **templates**: Official templates created by admins (`is_template=true AND status='active'`)

#### Process Steps

1. **API Gateway receives request**
2. **Authorization check**:
   - If user is **NOT admin** → Apply restrictions:
     - Force appropriate filters based on `scope`:
       - `scope=my`: Filter to `user_id = current_user_id`
       - `scope=public`: Force `is_public = true AND status = 'active'`
       - `scope=templates`: Force `is_template = true AND status = 'active'`
     - Reject request if `is_public` or `is_template` parameters are used (403 Forbidden)
   - If user **IS admin** → Allow all filters (can see private strategies, drafts, inactive)
3. **Strategy Controller parses query parameters**
4. **Strategy Repository queries with filters**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     s.id, s.name, s.description, s.tags, s.status, s.is_public, s.is_template,
     s.backtest_count, s.created_at, s.updated_at, s.image_url,
     COUNT(DISTINCT siu.indicator_id) as indicator_count,
     COALESCE(ss.view_count, 0) as view_count,
     EXISTS(
       SELECT 1 FROM strategy_favorites sf
       WHERE sf.strategy_id = s.id AND sf.user_id = $1
     ) as is_favorited
   FROM strategies s
   LEFT JOIN strategy_indicator_usage siu ON s.id = siu.strategy_id
   LEFT JOIN strategy_statistics ss ON s.id = ss.strategy_id
   WHERE s.deleted_at IS NULL
     AND (
       CASE
         WHEN $2 = 'my' THEN s.user_id = $1
         WHEN $2 = 'public' THEN s.is_public = true AND s.status = 'active'
         WHEN $2 = 'templates' THEN s.is_template = true AND s.status = 'active'
       END
     )
     AND ($3 IS NULL OR s.status = $3)
     AND ($4 IS NULL OR s.is_public = $4)  -- Admin only
     AND ($5 IS NULL OR s.is_template = $5)  -- Admin only
     AND ($6 IS NULL OR s.tags ILIKE '%' || $6 || '%')
     AND ($7 IS NULL OR s.name ILIKE '%' || $7 || '%' OR s.description ILIKE '%' || $7 || '%')
     AND ($8 IS NULL OR $8 = false OR EXISTS(
       SELECT 1 FROM strategy_favorites sf2
       WHERE sf2.strategy_id = s.id AND sf2.user_id = $1
     ))
   GROUP BY s.id, ss.view_count
   ORDER BY
     CASE WHEN $9 = 'popularity' THEN COALESCE(ss.view_count, 0) END DESC,
     CASE WHEN $9 = 'backtest_count' THEN s.backtest_count END DESC,
     CASE WHEN $9 = 'updated_at' THEN s.updated_at END DESC,
     CASE WHEN $9 = 'name' THEN s.name END ASC,
     CASE WHEN $9 = 'created_at' OR $9 IS NULL THEN s.created_at END DESC
   LIMIT $10 OFFSET $11;
   ```
   **Parameters:**
   - `$1` = user_id (current user)
   - `$2` = scope (my, public, templates)
   - `$3` = status (optional, for filtering by status)
   - `$4` = is_public (optional, admin only)
   - `$5` = is_template (optional, admin only)
   - `$6` = tags filter (optional)
   - `$7` = search keyword (optional)
   - `$8` = favorites_only (optional)
   - `$9` = sort_by (optional, defaults to created_at)
   - `$10` = limit (page_size)
   - `$11` = offset (page * page_size)

5. **If include_favorites=true, mark favorited strategies in response**
6. **Return paginated strategy list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "strategyId": "uuid",
      "name": "My SMA Strategy",
      "description": "Simple moving average crossover",
      "tags": ["trend-following", "beginner"],
      "status": "active",
      "isPublic": false,
      "isTemplate": false,
      "backtestCount": 5,
      "indicatorCount": 2,
      "viewCount": 142,
      "imageUrl": "https://storage.example.com/strategies/uuid.png",
      "isFavorited": true,
      "createdAt": "2024-11-01T12:00:00Z",
      "updatedAt": "2024-11-15T14:30:00Z"
    },
    {
      "strategyId": "uuid",
      "name": "RSI Momentum Template",
      "description": "RSI-based momentum strategy for trending markets",
      "tags": ["momentum", "beginner"],
      "status": "active",
      "isPublic": false,
      "isTemplate": true,
      "backtestCount": 0,
      "indicatorCount": 1,
      "viewCount": 1547,
      "imageUrl": null,
      "isFavorited": false,
      "createdAt": "2024-11-20T10:00:00Z",
      "updatedAt": "2024-11-20T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 47,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Strategies retrieved based on scope and filters
- Admin-only filters enforced correctly
- Results paginated correctly
- Only authorized strategies returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Invalid scope parameter | 400 | Return "Invalid scope value. Must be: my, public, or templates" |
| Unauthorized is_public filter | 403 | Return "Admin permissions required to use is_public filter" |
| Unauthorized is_template filter | 403 | Return "Admin permissions required to use is_template filter" |
| Invalid sort_by value | 400 | Return "Invalid sort_by value" |
| Database error | 500 | Log error, return generic message |

#### Filter Parameters Explained
- **`scope`**: Main filter that determines which strategies to show
  - `my`: User's own strategies (all statuses)
  - `public`: Public strategies from other users (active only)
  - `templates`: Official admin-created templates (active only)
- **`favorites_only=true`**: Returns ONLY user's favorited strategies
- **`include_favorites=true`**: Returns all matching strategies but marks which ones are favorited (adds `isFavorited` field)
- **`is_public`** and **`is_template`**: Admin-only filters for management purposes
- Both favorites parameters can be used together or separately

#### Example Use Cases

**User viewing own strategies:**
```
GET /api/v1/strategies?scope=my&status=active
```
→ User sees only their active strategies

**User searching public strategies:**
```
GET /api/v1/strategies?scope=public&search=moving+average&sort_by=popularity
```
→ User sees popular public strategies matching search term

**User viewing templates:**
```
GET /api/v1/strategies?scope=templates&tags=beginner&include_favorites=true
```
→ User sees beginner templates with favorites marked

**User viewing only favorited strategies:**
```
GET /api/v1/strategies?favorites_only=true
```
→ User sees all their favorited strategies (own, public, templates combined)

**Admin managing all templates:**
```
GET /api/v1/strategies?is_template=true&status=draft
```
→ Admin sees draft templates (including inactive ones for review)

**Admin reviewing private strategies:**
```
GET /api/v1/strategies?is_public=false&sort_by=created_at
```
→ Admin sees all private strategies for moderation

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 complex query with JOINs and filters
- Expected Execution Time: P95 < 300ms
- Cache Strategy: Consider caching template list (24-hour TTL) for non-admin users

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_indicator_usage`, `strategy_statistics`, `strategy_favorites`

#### Notes
- **Replaces PROC-STRATEGY-004**: This unified endpoint now handles template browsing
- **Authorization Model**: Similar to PROC-INDICATOR-001, uses role-based filter enforcement
- **Marketplace Ready**: Sorting by popularity and view count enables future marketplace features
- **Security**: Admin-only filters prevent users from bypassing visibility restrictions
- **Future Enhancement**: Consider adding category/difficulty level filters for better template discovery

---


---

## PROC-STRATEGY-002: Get Strategy Details (with Optional Version)

**Source File:** `PROC-STRATEGY-002.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-002.md`

### PROC-STRATEGY-002: Get Strategy Details (with Optional Version)

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005, FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User views strategy details, clicks "Use Template", "Edit Strategy", loads a public strategy, or views a specific version for backtesting

#### Actor
Authenticated User

#### Preconditions
- User is authenticated
- Strategy exists (template, public, or user's own)

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}?version={number}`

**Query Parameters:**
```
GET /api/v1/strategies/{id}?
  version={number} (optional, specific version number to load)
```

**Version Parameter Behavior:**
- If `version` is provided → Load that specific version
- If `version` is NOT provided → Load appropriate default version:
  - Own strategy → Load current version (current_version_id)
  - Template → Load template version (template_version_id)
  - Public → Load published version (published_version_id)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}?version={number}` (GET)
2. **Strategy Controller validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     s.id, s.user_id, s.name, s.description, s.tags, s.status,
     s.is_template, s.is_public, s.created_by_admin, s.version_count,
     s.image_url, s.current_version_id, s.template_version_id,
     s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
3. **Strategy Controller validates user access**
   - If user owns strategy (user_id = current_user_id) → Allow
   - If is_template = true → Allow (read-only)
   - If is_public = true AND status = 'active' → Allow (read-only)
   - Otherwise → Return 403 Forbidden
4. **Version Manager determines which version to load**
   ```
   If version parameter provided:
     target_version_number = version parameter
   Else if user owns strategy:
     target_version_id = current_version_id
   Else if is_template:
     target_version_id = template_version_id
   Else if is_public:
     target_version_id = published_version_id
   ```
5. **Version Manager fetches target version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id, sv.version_number, sv.code, sv.description,
     sv.created_by_user_id, sv.created_at,
     u.username as created_by_username
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1
     AND (
       -- Load by version number if specified
       ($2 IS NOT NULL AND sv.version_number = $2)
       OR
       -- Or load by version ID
       ($3 IS NOT NULL AND sv.id = $3)
     );
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = version_number (if provided)
   - `$3` = version_id (from step 4)
   - If version not found → Return 404 "Version {n} not found"
6. **Strategy Manager gets indicator usage**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT ARRAY_AGG(DISTINCT i.name) as indicators_used
   FROM strategy_indicator_usage siu
   LEFT JOIN indicators i ON siu.indicator_id = i.id
   WHERE siu.strategy_id = $1;
   ```
7. **Determine edit permissions**
   - can_edit = (user owns strategy AND loading current version)
   - read_only = !can_edit
8. **Return full strategy details**

#### Outputs

**Success Response (HTTP 200) - Own Strategy, Current Version:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA", "EMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 5,
      "description": "Latest improvements",
      "isCurrent": true,
      "isTemplate": false,
      "isPublished": false,
      "createdByUsername": "alice",
      "createdAt": "2024-12-05T14:30:00Z"
    },
    "versionCount": 5,
    "isOwner": true,
    "isTemplate": false,
    "isPublic": false,
    "canEdit": true,
    "editMode": "editable",
    "message": "Strategy loaded. You can edit and save changes."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (HTTP 200) - Template:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Official template for simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 2,
      "description": "Tested and stable version",
      "isCurrent": false,
      "isTemplate": true,
      "isPublished": false,
      "createdByUsername": "admin",
      "createdAt": "2024-11-20T12:00:00Z"
    },
    "versionCount": 5,
    "isOwner": false,
    "isTemplate": true,
    "isPublic": false,
    "canEdit": false,
    "editMode": "readonly",
    "message": "Template loaded (version 2). Create your own copy to edit."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Success Response (HTTP 200) - Specific Version for Backtest:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "tags": ["trend-following", "beginner"],
    "indicatorsUsed": ["SMA"],
    "status": "active",
    "version": {
      "versionId": "uuid",
      "versionNumber": 3,
      "description": "Version for backtesting",
      "isCurrent": false,
      "isTemplate": false,
      "isPublished": false,
      "createdByUsername": "alice",
      "createdAt": "2024-11-28T16:45:00Z"
    },
    "versionCount": 5,
    "isOwner": true,
    "isTemplate": false,
    "isPublic": false,
    "canEdit": false,
    "editMode": "readonly",
    "message": "Version 3 loaded for backtesting. This is a read-only snapshot."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 404 - Version Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Strategy version 10 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 10,
      "availableVersions": [1, 2, 3, 4, 5]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You don't have permission to view this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Frontend Behavior

**Editable Mode** (user's own strategy, current version):
- Load into editor with edit permissions
- Show "Save Changes" button
- When user clicks save → Call PROC-STRATEGY-004 to update existing
- Auto-save drafts enabled

**Read-Only Mode** (template, public, or specific version):
- Load into editor in read-only mode
- Show "Save as New Strategy" button
- When user clicks save → Call PROC-STRATEGY-003 to create new strategy
- Syntax highlighting enabled, but no editing

**Backtest Mode** (specific version for backtesting):
- Load version into backtest configuration
- Display version number and description
- Show "Run Backtest" button
- Pass `strategy_version_id` to Backtesting Service

#### Success Criteria
- Strategy data fetched successfully
- Correct version loaded based on context
- User access validated
- Full code and metadata returned
- Edit permissions correctly set
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Strategy deleted | 404 | Return "Strategy no longer available" |
| Access denied | 403 | Return "You don't have permission to view this strategy" |
| Private strategy | 403 | Return "This strategy is private" |
| Database error | 500 | Log error, return generic message |

#### Version Loading Logic Explained

**Own Strategy (no version specified):**
```
User owns strategy → Load current_version_id
→ canEdit = true
→ User can edit and save changes
```

**Template (no version specified):**
```
is_template = true → Load template_version_id
→ canEdit = false
→ User sees the official template version
→ Original creator's current version may be different
```

**Public Strategy (no version specified):**
```
is_public = true → Load published_version_id
→ canEdit = false
→ User sees the public version
→ Original creator's current version may be different
```

**Specific Version (version parameter provided):**
```
version=3 → Load version 3
→ canEdit = false (even for owner, it's a historical snapshot)
→ Read-only view for review or backtesting
```

#### Use Cases

**Use Case 1: Edit Own Strategy**
```
GET /api/v1/strategies/{id}/load
→ Loads current version
→ canEdit = true
→ User edits and saves (PROC-STRATEGY-004)
```

**Use Case 2: Use Template**
```
GET /api/v1/strategies/{template_id}/load
→ Loads template_version_id
→ canEdit = false
→ User modifies and saves as new (PROC-STRATEGY-003)
```

**Use Case 3: Backtest Specific Version**
```
GET /api/v1/strategies/{id}/load?version=3
→ Loads version 3 code
→ canEdit = false
→ User runs backtest on version 3
→ Backtesting Service receives strategy_version_id for v3
```

**Use Case 4: Compare Versions**
```
GET /api/v1/strategies/{id}/load?version=2
→ Load v2 in one window
GET /api/v1/strategies/{id}/load?version=5
→ Load v5 in another window
→ Side-by-side comparison
```

**Use Case 5: View Public Strategy**
```
GET /api/v1/strategies/{public_id}/load
→ Loads published_version_id
→ canEdit = false
→ User can view code, save as their own, or run backtest
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 3 queries (strategy fetch, version fetch, indicators)
- Expected Execution Time: P95 < 200ms
- Full code included in response

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_indicator_usage`, `indicators`, `users`

#### Notes
- **Version-Aware**: Now supports loading specific versions for backtesting
- **Smart Defaults**: Automatically loads appropriate version based on context
- **Edit Permissions**: Only current version of owned strategy is editable
- **Backtest Integration**: Backtesting Service uses strategy_version_id to ensure reproducibility
- **Historical Snapshots**: Old versions loaded as read-only for review
- **Template Stability**: Templates always show template_version_id, not creator's current version
- **Related Processes**:
  - PROC-STRATEGY-003 (Create New Strategy) - Save template/public as new
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Save changes to owned strategy
  - PROC-STRATEGY-011 (View Version History) - List versions before loading
  - PROC-STRATEGY-012 (View Specific Version) - Alternative to load for viewing only
  - Backtesting Service - Run backtest on specific strategy_version_id

---


---

## PROC-STRATEGY-003: Create New Strategy

**Source File:** `PROC-STRATEGY-003.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-003.md`

### PROC-STRATEGY-003: Create New Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-001
**Related NFR:** NFR-PERF-001, NFR-SECURITY-002
**Related ADR:** ADR-024, ADR-032

#### Trigger
User creates new strategy via code editor OR visual block editor

#### Actor
Authenticated User (Trader) or Admin

#### Preconditions
- User is authenticated
- User has not exceeded strategy quota (max 50 strategies per user, unlimited for admins)

#### Creation Methods
1. **Code Editor**: User writes Python code directly
2. **Visual Block Editor**: User drags and drops blocks, system generates Python code

#### Inputs

**API Endpoint:** `POST /api/v1/strategies`

**Request Body:**
```json
{
  "name": "string (required, 3-255 chars)",
  "description": "text (optional, markdown supported)",
  "code": "text (required if creationMethod='code', max 50,000 chars)",
  "visualBlocks": "object (required if creationMethod='visual', block configuration)",
  "creationMethod": "code|visual (required)",
  "tags": "array of strings (optional)",
  "status": "draft|active (optional, defaults to draft)",
  "isPublic": "boolean (optional, defaults to false)",
  "isTemplate": "boolean (admin only, defaults to false)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies` (POST)
2. **Strategy Controller validates input**
   - Check required fields (name, and either code OR visual_blocks)
   - Validate name length (3-255 chars)
   - Validate code length (max 50,000 chars if provided)
   - Validate creation_method is 'code' or 'visual'
3. **If creation_method = 'visual'**:
   - Visual Block Processor converts visual_blocks JSON to Python code
   - Generated code stored in `code` field
4. **Strategy Controller checks quota** (skip if admin)
   ```sql
   SELECT COUNT(*) FROM strategies WHERE user_id = $1 AND deleted_at IS NULL
   ```
   - If count >= 50 AND user is not admin → Return 429 "Strategy quota exceeded"
5. **Code Validator validates Python syntax**
   - Use Python AST parser: `ast.parse(code)`
   - Check for syntax errors
   - Return 400 with line number if error
6. **Code Validator checks security**
   - Scan for prohibited imports: `os`, `subprocess`, `eval`, `exec`, `open`, `__import__`
   - Check only allowed libraries imported (see whitelist)
   - Return 400 if security violation
7. **Code Validator checks required components**
   - Must define `entry_signal()` function
   - Must define `exit_signal()` function
   - Optional: `position_size()`, `stop_loss()`, `take_profit()`
8. **Strategy Manager checks for duplicate name**
   ```sql
   SELECT COUNT(*) FROM strategies
   WHERE user_id = $1 AND name = $2 AND deleted_at IS NULL
   ```
   - If exists → Return 409 "Strategy name already exists"
9. **Strategy Repository creates strategy**
   ```sql
   INSERT INTO strategies (
     user_id, name, description, code, tags,
     status, is_public, is_template, created_by_admin,
     current_version_id, version_count, created_at, updated_at
   ) VALUES (
     $1, $2, $3, $4, $5,
     COALESCE($6, 'draft'), COALESCE($7, false), COALESCE($8, false), $9,
     NULL, 1, NOW(), NOW()
   ) RETURNING id
   ```
10. **Version Manager creates initial version**
    ```sql
    INSERT INTO strategy_versions (
      strategy_id, version_number, code, created_by_user_id, created_at
    ) VALUES ($1, 1, $2, $3, NOW())
    RETURNING id
    ```
11. **Strategy Repository updates current_version_id**
    ```sql
    UPDATE strategies SET current_version_id = $1 WHERE id = $2
    ```
12. **Return strategy details**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "string",
    "description": "string",
    "code": "string",
    "version": 1,
    "createdAt": "2024-12-01T12:00:00Z",
    "validationStatus": "valid"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 400 - Validation Error):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Code validation failed",
    "details": [
      {
        "field": "code",
        "message": "Syntax error at line 15",
        "code": "SYNTAX_ERROR"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy record created
- Initial version created
- Code validated successfully
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Syntax error | 400 | Return error with line number |
| Security violation | 400 | Return "Prohibited library: {name}" |
| Missing required function | 400 | Return "Missing entry_signal() function" |
| Quota exceeded | 429 | Return "Maximum 50 strategies allowed" |
| Duplicate name | 409 | Return "Strategy name already exists" |
| Database error | 500 | Log error, rollback transaction |

#### Allowed Libraries Whitelist
```python
ALLOWED_IMPORTS = [
    'numpy',
    'pandas',
    'talib',  # Technical indicators
    'backtrader',  # Backtesting framework (limited imports)
    'datetime',
    'math',
    'statistics'
]
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SECURITY-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Database Queries: 3 queries per request (quota check, duplicate check, insert)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`

**Libraries:**
- Python AST parser - Code syntax validation
- Regex - Security pattern scanning

---


---

## PROC-STRATEGY-004: Edit Existing Strategy

**Source File:** `PROC-STRATEGY-004.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-004.md`

### PROC-STRATEGY-004: Edit Existing Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-002
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032  

#### Trigger
User saves changes to strategy code or metadata

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User owns the strategy
- Strategy exists
- Strategy is not a template (templates can only be edited by admins)

#### Inputs

**API Endpoint:** `PUT /api/v1/strategies/{id}`

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "code": "string (optional)",
  "tags": ["array (optional)"],
  "riskLevel": "string (optional)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}` (PUT)
2. **Strategy Controller validates ownership**
   ```sql
   SELECT user_id, is_template FROM strategies WHERE strategy_id = $1
   ```
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Cannot edit templates"
3. **Strategy Controller retrieves current strategy**
   ```sql
   SELECT * FROM strategies WHERE strategy_id = $1
   ```
4. **If code is being updated**:
   - **Code Validator validates new code** (same as PROC-STRATEGY-003 steps 4-6)
   - If validation fails → Return 400 with errors
5. **Strategy Manager merges updates**
   - Only update provided fields
   - Preserve existing values for omitted fields
6. **Strategy Manager checks if code changed**
   - Compare `new_code` with `current_code`
   - If code changed → increment version
7. **Strategy Repository updates strategy**
   ```sql
   UPDATE strategies
   SET name = COALESCE($1, name),
       description = COALESCE($2, description),
       code = COALESCE($3, code),
       tags = COALESCE($4, tags),
       risk_level = COALESCE($5, risk_level),
       version = CASE WHEN $3 IS NOT NULL THEN version + 1 ELSE version END,
       updated_at = NOW()
   WHERE strategy_id = $6
   RETURNING *
   ```
8. **If code changed, Version Manager creates new version**
   ```sql
   INSERT INTO strategy_versions (
     strategy_id, version, code, created_at, change_note
   ) VALUES ($1, $2, $3, NOW(), 'User edit')
   ```
9. **Return updated strategy**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "string",
    "code": "string",
    "version": 2,
    "updatedAt": "2024-12-01T12:00:00Z",
    "validationStatus": "valid"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy updated in database
- New version created if code changed
- Updated strategy returned
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy not found | 404 | Return "Strategy not found" |
| Code validation failed | 400 | Return validation errors |
| Cannot edit template | 403 | Return "Templates can only be edited by admins" |
| Database error | 500 | Log error, rollback |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2-4 queries per request (ownership check, fetch current, update, optional version insert)
- Expected Execution Time: P95 < 300ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`

---


---

## PROC-STRATEGY-005: Delete Strategy

**Source File:** `PROC-STRATEGY-005.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-005.md`

### PROC-STRATEGY-005: Delete Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-003
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032  

#### Trigger
User deletes strategy from strategy list

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User owns the strategy
- Strategy is not currently being used in active backtest

#### Inputs

**API Endpoint:** `DELETE /api/v1/strategies/{strategyId}`

#### Process Steps

1. **API Gateway receives request**
2. **Strategy Controller validates ownership**
   ```sql
   SELECT user_id, is_template FROM strategies WHERE strategy_id = $1
   ```
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Cannot delete templates"
3. **Strategy Controller checks for active backtests**
   - Call Backtesting Service: `GET /api/v1/backtests/active?strategy_id={id}`
   - If active backtest exists → Return 409 "Cannot delete strategy with active backtest"
4. **Strategy Repository soft-deletes strategy**
   ```sql
   UPDATE strategies
   SET deleted = true,
       deleted_at = NOW()
   WHERE strategy_id = $1
   RETURNING strategy_id
   ```
5. **Note:** Historical backtest results are preserved even after strategy deletion
6. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "message": "Strategy deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Conflict):**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Cannot delete strategy with active backtest",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as deleted
- Strategy no longer visible in user's list
- Historical backtest results preserved
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Active backtest exists | 409 | Return "Cannot delete strategy with active backtest" |
| Strategy not found | 404 | Return "Strategy not found" |
| Cannot delete template | 403 | Return "Templates cannot be deleted" |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (ownership check, soft delete)
- External Service Call: 1 (Backtesting Service check)
- Expected Execution Time: P95 < 150ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`

**External Services:**
- Backtesting Service - Check for active backtests

---


---

## PROC-STRATEGY-006: Validate Strategy Code

**Source File:** `PROC-STRATEGY-006.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-006.md`

### PROC-STRATEGY-006: Validate Strategy Code

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-007
**Related NFR:** NFR-PERF-001, NFR-SECURITY-002
**Related ADR:** ADR-032  

#### Trigger
User clicks "Validate" button or saves strategy

#### Actor
Authenticated User

#### Preconditions
- Strategy code has been written

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/validate`

**Request Body:**
```json
{
  "code": "string (Python code to validate)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/validate` (POST)
2. **Code Validator parses Python code**
   ```python
   import ast
   try:
       tree = ast.parse(code)
   except SyntaxError as e:
       return {"valid": false, "errors": [{"line": e.lineno, "message": e.msg}]}
   ```
3. **Code Validator checks for prohibited imports**
   ```python
   PROHIBITED = ['os', 'subprocess', 'eval', 'exec', '__import__', 'open', 'file']
   for node in ast.walk(tree):
       if isinstance(node, ast.Import):
           for alias in node.names:
               if alias.name in PROHIBITED:
                   return error
   ```
4. **Code Validator checks for required functions**
   ```python
   required_functions = ['entry_signal', 'exit_signal']
   defined_functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
   missing = set(required_functions) - set(defined_functions)
   if missing:
       return {"valid": false, "errors": [f"Missing required function: {fn}"]}
   ```
5. **Code Validator checks function signatures**
   - `entry_signal(data)` must accept exactly 1 parameter
   - `exit_signal(data)` must accept exactly 1 parameter
6. **Code Validator checks for dangerous patterns**
   - `eval()` calls
   - `exec()` calls
   - File I/O operations
   - Network calls
7. **Return validation result**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "message": "Code validation successful",
    "warnings": [
      "Consider adding stop-loss logic"
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Validation Failure Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      {
        "line": 15,
        "column": 5,
        "message": "Prohibited import: os",
        "severity": "error"
      },
      {
        "line": 42,
        "message": "Missing required function: entry_signal",
        "severity": "error"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Code parsed successfully
- No prohibited imports
- Required functions present
- No dangerous patterns

#### Error Scenarios
- All validation errors returned in structured format
- HTTP 200 OK even if validation fails (validation result in body)

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SECURITY-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Expected Execution Time: P95 < 100ms
- Security scanning must complete within performance budget

#### Dependencies

**Libraries:**
- Python AST parser - Syntax validation
- Regex - Security pattern scanning

---


---

## PROC-STRATEGY-007: Publish Strategy as Public

**Source File:** `PROC-STRATEGY-007.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-007.md`

### PROC-STRATEGY-007: Publish Strategy as Public

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
User publishes their strategy to make it visible to other users

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is not deleted
- Target version exists and is valid
- Strategy status is 'active' (cannot publish drafts)

#### Inputs

**API Endpoint:** `PATCH /api/v1/strategies/{id}/publish`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to publish)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/publish` (PATCH)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates can only be managed by admins"
3. **Strategy Controller validates strategy status**
   - If `status != 'active'` → Return 400 "Only active strategies can be published. Current status: {status}"
4. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 400 "Version {n} not found"
5. **Code Validator validates version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Ensures published versions are safe
   - If validation fails → Return 400 with validation errors
6. **Strategy Repository updates strategy publication status**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_public = true,
     published_version_id = $1,
     updated_at = NOW()
   WHERE id = $2 AND user_id = $3
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = version_id (UUID of target version)
   - `$2` = strategy_id
   - `$3` = user_id (ensure ownership)
7. **Strategy Event Logger logs publication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'published_as_public', NOW(),
     'Strategy published as public',
     jsonb_build_object(
       'versionNumber', $3,
       'publishedVersionId', $4
     )
   );
   ```
8. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Crossover Strategy",
    "description": "Simple moving average crossover for trending markets",
    "status": "active",
    "isTemplate": false,
    "isPublic": true,
    "publishedVersionId": "uuid",
    "publishedVersionNumber": 2,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy published (version 2). You can continue editing without affecting the published version.",
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Not Owner):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Status):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Only active strategies can be published. Current status: draft",
    "details": {
      "strategyId": "uuid",
      "currentStatus": "draft",
      "requiredStatus": "active"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Version):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_VERSION",
    "message": "Strategy version 5 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 5,
      "availableVersions": [1, 2, 3]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as public (`is_public = true`)
- Published version ID updated to target version
- Event logged to strategy_events table
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates can only be managed by admins" |
| Strategy not found | 404 | Return "Strategy not found" |
| Strategy not active | 400 | Return "Only active strategies can be published. Current status: {status}" |
| Version not found | 400 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors with line numbers |
| Already published same version | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Version Control Explained

**Key Concept**: Separating current version from published version

- **current_version_id**: The latest version, user continues editing here
- **published_version_id**: The frozen version shown to all users as public strategy

**Workflow Example:**
1. User creates "My SMA Strategy" → v1 created
2. User tests and refines → v2, v3 created (current_version_id = v3)
3. User publishes v2: `published_version_id = v2`, `is_public = true`
4. Other users browse public strategies → see v2 code
5. User continues experimenting → v4, v5 created
6. Other users still see v2 (stable published version)
7. Later, user re-publishes with v5: `published_version_id = v5`
8. Now other users see v5 when viewing this public strategy

**Benefits:**
- **Stability**: Published version doesn't change unexpectedly
- **Flexibility**: User can experiment without breaking published strategy
- **Version Control**: Can update published version at any time
- **Testing**: Test new versions before making them public

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (ownership validation)

**Process-Specific Notes:**
- Database Queries: 3-4 queries (strategy fetch, version validation, update, event log)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **User-facing Feature**: Any user can publish their own strategies
- **Version Immutability**: Published versions are read-only, user must create new version to change
- **Audit Trail**: All publication events logged to strategy_events
- **Security**: Code validation ensures only safe code is published
- **Marketplace Ready**: Published strategies are discoverable via PROC-STRATEGY-001 with `scope=public`
- **Related Processes**:
  - PROC-STRATEGY-003 (Create New Strategy) - How user creates initial strategy
  - PROC-STRATEGY-004 (Edit Existing Strategy) - How user creates new versions
  - PROC-STRATEGY-001 (List Strategies with Filters) - How users discover published strategies
  - PROC-STRATEGY-014 (Admin - Publish Strategy as Template) - Admin-only template publishing
  - PROC-STRATEGY-008 (Unpublish Strategy) - How to revert publication

---


---

## PROC-STRATEGY-008: Unpublish Strategy

**Source File:** `PROC-STRATEGY-008.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-008.md`

### PROC-STRATEGY-008: Unpublish Strategy

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
User unpublishes their strategy to make it private again

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is currently published (`is_public = true`)
- Strategy is not a template (templates can only be managed by admins)

#### Inputs

**API Endpoint:** `PATCH /api/v1/strategies/{id}/unpublish`

**Request Body:**
```json
{}
```
Note: No body required, action is idempotent

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/unpublish` (PATCH)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates can only be managed by admins"
3. **Strategy Repository updates strategy to unpublish**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_public = false,
     published_version_id = NULL,
     updated_at = NOW()
   WHERE id = $1 AND user_id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = user_id (ensure ownership)
4. **Strategy Event Logger logs unpublication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'unpublished', NOW(),
     'Strategy unpublished (made private)',
     jsonb_build_object(
       'previousPublicStatus', true,
       'previousPublishedVersionId', $3
     )
   );
   ```
5. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Crossover Strategy",
    "description": "Simple moving average crossover for trending markets",
    "status": "active",
    "isTemplate": false,
    "isPublic": false,
    "publishedVersionId": null,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy unpublished. It is now private and only visible to you.",
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Not Owner):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 403 - Template):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Templates can only be managed by admins. Use PROC-STRATEGY-015 to unpublish templates.",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as private (`is_public = false`)
- Published version ID cleared (`published_version_id = NULL`)
- Event logged to strategy_events table
- Strategy no longer visible in public listings (PROC-STRATEGY-001 with `scope=public`)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates can only be managed by admins" |
| Strategy not found | 404 | Return "Strategy not found" |
| Already unpublished | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Use Cases

**Scenario 1: User wants to update public strategy extensively**
1. User unpublishes strategy (this endpoint)
2. User makes extensive edits (PROC-STRATEGY-004)
3. User tests new version
4. User re-publishes with updated version (PROC-STRATEGY-007)

**Scenario 2: User receives negative feedback**
1. User unpublishes strategy immediately
2. User addresses issues in new version
3. Optionally re-publishes improved version later

**Scenario 3: User changes mind about sharing**
1. User unpublishes strategy
2. Strategy becomes private, only visible to user
3. Can re-publish at any time

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (ownership validation)

**Process-Specific Notes:**
- Database Queries: 2-3 queries (strategy fetch, update, event log)
- Expected Execution Time: P95 < 200ms
- No code validation needed (only changing visibility)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_events`

#### Notes
- **User-facing Feature**: Any user can unpublish their own published strategies
- **Idempotent**: Can call multiple times safely (already unpublished returns success)
- **Immediate Effect**: Strategy immediately removed from public listings
- **Audit Trail**: Unpublication event logged for compliance
- **Reversible**: User can re-publish at any time using PROC-STRATEGY-007
- **No Data Loss**: Published version ID preserved in audit log (event_metadata)
- **Related Processes**:
  - PROC-STRATEGY-007 (Publish Strategy as Public) - Reverse operation
  - PROC-STRATEGY-001 (List Strategies with Filters) - Unpublished strategies not in `scope=public`
  - PROC-STRATEGY-015 (Admin - Unpublish Template) - Admin-only template unpublishing

---


---

## PROC-STRATEGY-009: Add Strategy to Favorites

**Source File:** `PROC-STRATEGY-009.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-009.md`

### PROC-STRATEGY-009: Add Strategy to Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User clicks "Add to Favorites" on a strategy

#### Preconditions
- User is authenticated
- Strategy exists and is accessible to user

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/strategies/{id}/favorite` (POST)
2. **Strategy Repository adds favorite**
   ```sql
   INSERT INTO strategy_favorites (user_id, strategy_id, favorited_at)
   VALUES ($1, $2, NOW())
   ON CONFLICT (user_id, strategy_id) DO NOTHING;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "favorited": true,
    "favoritedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite added to database
- Idempotent operation (no error if already favorited)
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (INSERT with ON CONFLICT)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategy_favorites`

---


---

## PROC-STRATEGY-010: Remove Strategy from Favorites

**Source File:** `PROC-STRATEGY-010.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-010.md`

### PROC-STRATEGY-010: Remove Strategy from Favorites

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Actor
Authenticated User

#### Trigger
User clicks "Remove from Favorites"

#### Preconditions
- User is authenticated

#### Inputs

**API Endpoint:** `DELETE /api/v1/strategies/{id}/favorite`

#### Process Steps
1. **API Gateway receives request** → `/api/v1/strategies/{id}/favorite` (DELETE)
2. **Strategy Repository removes favorite**
   ```sql
   DELETE FROM strategy_favorites WHERE user_id = $1 AND strategy_id = $2;
   ```
3. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "favorited": false,
    "message": "Strategy removed from favorites"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

#### Success Criteria
- Favorite removed from database
- Idempotent operation (no error if not favorited)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Database error | 500 | Log error, return generic message |

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 1 query (DELETE)
- Expected Execution Time: P95 < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategy_favorites`

---


---

## PROC-STRATEGY-011: View Strategy Version History

**Source File:** `PROC-STRATEGY-011.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-011.md`

### PROC-STRATEGY-011: View Strategy Version History

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032

#### Trigger
User views version history of their strategy to track changes or select version for revert/backtest

#### Actor
Authenticated User (Strategy Owner) or Admin

#### Preconditions
- User is authenticated
- User owns the strategy OR is admin
- Strategy exists and is not deleted

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/versions`

**Query Parameters:**
```
GET /api/v1/strategies/{id}/versions?
  page={number}
  &page_size={number}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/versions` (GET)
2. **Strategy Controller validates access**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.is_template, s.is_public,
          s.current_version_id, s.template_version_id, s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id AND user is not admin` → Return 403 Forbidden
3. **Version Manager retrieves version history**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id,
     sv.version_number,
     sv.description,
     sv.created_by_user_id,
     sv.created_at,
     u.username as created_by_username,
     LENGTH(sv.code) as code_size_bytes,
     CASE
       WHEN sv.id = $2 THEN 'current'
       WHEN sv.id = $3 THEN 'template'
       WHEN sv.id = $4 THEN 'published'
       ELSE 'archived'
     END as version_status,
     -- Count backtests using this version
     (SELECT COUNT(*) FROM backtests b WHERE b.strategy_version_id = sv.id) as backtest_count
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1
   ORDER BY sv.version_number DESC
   LIMIT $5 OFFSET $6;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = current_version_id
   - `$3` = template_version_id
   - `$4` = published_version_id
   - `$5` = limit (page_size)
   - `$6` = offset (page * page_size)
4. **Return paginated version history**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "strategyName": "My SMA Strategy",
    "currentVersionId": "uuid-v5",
    "templateVersionId": null,
    "publishedVersionId": "uuid-v2",
    "versions": [
      {
        "versionId": "uuid-v5",
        "versionNumber": 5,
        "description": "Optimized entry/exit logic",
        "versionStatus": "current",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 2048,
        "backtestCount": 3,
        "createdAt": "2024-12-05T14:30:00Z"
      },
      {
        "versionId": "uuid-v4",
        "versionNumber": 4,
        "description": "Added stop-loss logic",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1980,
        "backtestCount": 5,
        "createdAt": "2024-12-03T10:15:00Z"
      },
      {
        "versionId": "uuid-v3",
        "versionNumber": 3,
        "description": "Improved indicator parameters",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1856,
        "backtestCount": 2,
        "createdAt": "2024-11-28T16:45:00Z"
      },
      {
        "versionId": "uuid-v2",
        "versionNumber": 2,
        "description": "Tested and stable version",
        "versionStatus": "published",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1756,
        "backtestCount": 12,
        "createdAt": "2024-11-20T12:00:00Z"
      },
      {
        "versionId": "uuid-v1",
        "versionNumber": 1,
        "description": "Initial version",
        "versionStatus": "archived",
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "codeSizeBytes": 1520,
        "backtestCount": 1,
        "createdAt": "2024-11-15T09:00:00Z"
      }
    ]
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 5,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- All versions retrieved for the strategy
- Version status properly labeled (current, template, published, archived)
- Backtest count included for each version
- Results sorted by version number (newest first)
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Not strategy owner (not admin) | 403 | Return "You do not have access to this strategy" |
| Database error | 500 | Log error, return generic message |

#### Version Status Explained

- **current**: This is the latest working version (current_version_id)
- **template**: This version is published as a template (template_version_id)
- **published**: This version is published as public (published_version_id)
- **archived**: Previous version, not currently active

**Note**: A version can have multiple statuses if it's used for multiple purposes (e.g., a version can be both "current" and "published")

#### UI Display Recommendations

**Version Timeline View:**
```
v5 (Current) ← You are here
├─ Dec 5, 2024
├─ "Optimized entry/exit logic"
├─ 3 backtests
└─ 2.0 KB

v4 (Archived)
├─ Dec 3, 2024
├─ "Added stop-loss logic"
├─ 5 backtests
└─ 1.9 KB

v3 (Archived)
├─ Nov 28, 2024
├─ "Improved indicator parameters"
├─ 2 backtests
└─ 1.8 KB

v2 (Published) ← Public users see this
├─ Nov 20, 2024
├─ "Tested and stable version"
├─ 12 backtests
└─ 1.7 KB

v1 (Archived)
├─ Nov 15, 2024
├─ "Initial version"
├─ 1 backtest
└─ 1.5 KB
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 2 queries (strategy validation, version list with JOIN)
- Expected Execution Time: P95 < 200ms
- Code is NOT included in list (only metadata) for performance

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `users`, `backtests`

#### Notes
- **Code Excluded**: Version history does NOT include full code (use PROC-STRATEGY-012 for specific version details)
- **Performance**: Fast listing by excluding large code field
- **Backtest Integration**: Shows how many backtests used each version (helps identify well-tested versions)
- **Admin Access**: Admins can view version history of any strategy (for template management)
- **Related Processes**:
  - PROC-STRATEGY-012 (View Specific Version) - Get full details including code
  - PROC-STRATEGY-013 (Revert to Previous Version) - Restore old version as current
  - PROC-STRATEGY-002 (Load Strategy into Editor) - Load specific version for editing/backtesting

---


---

## PROC-STRATEGY-012: View Specific Strategy Version

**Source File:** `PROC-STRATEGY-012.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-012.md`

### PROC-STRATEGY-012: View Specific Strategy Version

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-024, ADR-032

#### Trigger
User views details of a specific strategy version to review code, compare versions, or prepare for backtest

#### Actor
Authenticated User (Strategy Owner) or Admin

#### Preconditions
- User is authenticated
- User owns the strategy OR is admin
- Strategy exists and is not deleted
- Target version exists

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/versions/{versionNumber}`

**Path Parameters:**
- `{id}`: Strategy UUID
- `{versionNumber}`: Version number (integer, e.g., 1, 2, 3)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/versions/{versionNumber}` (GET)
2. **Strategy Controller validates access**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.name, s.description, s.is_template, s.is_public,
          s.status, s.tags, s.current_version_id, s.template_version_id,
          s.published_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 "Strategy not found"
   - If `user_id != current_user_id AND user is not admin` → Return 403 Forbidden
3. **Version Manager retrieves specific version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT
     sv.id,
     sv.version_number,
     sv.code,
     sv.description,
     sv.created_by_user_id,
     sv.created_at,
     u.username as created_by_username,
     LENGTH(sv.code) as code_size_bytes
   FROM strategy_versions sv
   LEFT JOIN users u ON sv.created_by_user_id = u.id
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = version_number
   - If version not found → Return 404 "Version {n} not found"
4. **Determine version status**
   - Check if this version is current, template, or published
5. **Get backtest statistics for this version**
   ```sql
   SELECT
     COUNT(*) as total_backtests,
     AVG(total_return) as avg_return,
     AVG(sharpe_ratio) as avg_sharpe,
     MAX(created_at) as last_backtest_at
   FROM backtests
   WHERE strategy_version_id = $1 AND status = 'completed';
   ```
6. **Return version details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "strategyName": "My SMA Strategy",
    "strategyDescription": "Simple moving average crossover for trending markets",
    "strategyStatus": "active",
    "strategyTags": ["trend-following", "beginner"],
    "version": {
      "versionId": "uuid",
      "versionNumber": 3,
      "description": "Improved indicator parameters",
      "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    sma_long = SMA(data.close, 50)\n    return sma_short > sma_long\n\ndef exit_signal(data):\n    sma_short = SMA(data.close, 20)\n    sma_long = SMA(data.close, 50)\n    return sma_short < sma_long",
      "codeSizeBytes": 1856,
      "versionStatus": {
        "isCurrent": false,
        "isTemplate": false,
        "isPublished": false,
        "label": "archived"
      },
      "createdByUserId": "uuid",
      "createdByUsername": "alice",
      "createdAt": "2024-11-28T16:45:00Z"
    },
    "backtestStats": {
      "totalBacktests": 2,
      "averageReturn": 12.5,
      "averageSharpe": 1.8,
      "lastBacktestAt": "2024-11-29T10:30:00Z"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 404 - Version Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Strategy version 10 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 10,
      "availableVersions": [1, 2, 3, 4, 5]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this strategy",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Version details retrieved successfully
- Full code included in response
- Version status correctly determined
- Backtest statistics calculated
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Not strategy owner (not admin) | 403 | Return "You do not have access to this strategy" |
| Database error | 500 | Log error, return generic message |

#### Use Cases

**Use Case 1: Review Old Version Before Reverting**
```
User workflow:
1. View version history (PROC-STRATEGY-011)
2. User sees v3 had good backtest results
3. User views v3 details (this endpoint)
4. User reviews code to confirm it's the right version
5. User reverts to v3 (PROC-STRATEGY-013)
```

**Use Case 2: Compare Two Versions**
```
User workflow:
1. User views v2 (this endpoint)
2. User notes code differences
3. User views v5 (this endpoint)
4. User compares side-by-side
5. User decides which approach is better
```

**Use Case 3: Backtest Specific Version**
```
User workflow:
1. User views version history
2. User selects v4 for backtesting
3. User views v4 details (this endpoint)
4. User reviews code is correct
5. User runs backtest on v4 (Backtesting Service uses strategy_version_id)
```

**Use Case 4: Understand Published Version**
```
User workflow:
1. User publishes v2 as public
2. Later, user wants to see what code is public
3. User views published version in history
4. User views v2 details (this endpoint)
5. User sees exact code that other users see
```

#### Version Status Object Explained

```json
"versionStatus": {
  "isCurrent": false,      // Is this the current working version?
  "isTemplate": false,     // Is this the template version?
  "isPublished": false,    // Is this the published public version?
  "label": "archived"      // Human-readable status
}
```

**Possible labels:**
- `"current"` - This is the latest working version
- `"template"` - This version is shown as a template
- `"published"` - This version is shown as public
- `"current, published"` - Both current AND published
- `"archived"` - Old version, not actively used

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- Database Queries: 3 queries (strategy validation, version details, backtest stats)
- Expected Execution Time: P95 < 250ms
- Full code included (can be large, ~2-50 KB typical)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `users`, `backtests`

#### Notes
- **Full Code Included**: Unlike PROC-STRATEGY-011, this includes the complete strategy code
- **Backtest Stats**: Shows how this specific version performed in backtests
- **Admin Access**: Admins can view any strategy version (for template review)
- **Immutable**: Version code is read-only, cannot be modified (only create new version)
- **Code Syntax**: Code returned as-is, frontend can apply syntax highlighting
- **Related Processes**:
  - PROC-STRATEGY-011 (View Version History) - List all versions
  - PROC-STRATEGY-013 (Revert to Previous Version) - Make old version current
  - PROC-STRATEGY-002 (Load Strategy into Editor) - Load version for editing
  - Backtesting Service - Run backtest on specific version

---


---

## PROC-STRATEGY-013: Revert Strategy to Previous Version

**Source File:** `PROC-STRATEGY-013.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-013.md`

### PROC-STRATEGY-013: Revert Strategy to Previous Version

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-008
**Related NFR:** NFR-PERF-001, NFR-SEC-002
**Related ADR:** ADR-024, ADR-032

#### Trigger
User reverts strategy to a previous version after testing or discovering issues with current version

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- User owns the strategy
- Strategy exists and is not deleted
- Target version exists
- Strategy is not a template (templates can only be managed by admins)

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/revert`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to revert to)",
  "description": "string (optional, description for the new version created)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/revert` (POST)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.version_count
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
   - If `user_id != current_user_id` → Return 403 Forbidden
   - If `is_template = true` → Return 403 "Templates cannot be reverted. Contact admin."
3. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 404 "Version {n} not found"
4. **Code Validator validates target version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Ensures reverted code is still safe (security standards may have changed)
   - If validation fails → Return 400 with validation errors
5. **Version Manager creates new version with old code**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   -- New version number = current version_count + 1
   INSERT INTO strategy_versions (
     strategy_id, version_number, code, description,
     created_by_user_id, created_at
   ) VALUES (
     $1,
     (SELECT version_count + 1 FROM strategies WHERE id = $1),
     $2,  -- Code from target version
     COALESCE($3, 'Reverted to version ' || $4),
     $5,  -- Current user ID
     NOW()
   )
   RETURNING id, version_number;
   ```
   **Parameters:**
   - `$1` = strategy_id
   - `$2` = code (from target version)
   - `$3` = description (user-provided or default)
   - `$4` = target version number (for default description)
   - `$5` = user_id
6. **Strategy Repository updates current version**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     current_version_id = $1,  -- New version ID
     version_count = version_count + 1,
     updated_at = NOW()
   WHERE id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = new_version_id (from step 5)
   - `$2` = strategy_id
7. **Strategy Event Logger logs revert event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'version_created', NOW(),
     'Reverted to previous version',
     jsonb_build_object(
       'newVersionNumber', $3,
       'revertedFromVersion', $4,
       'revertedToVersion', $5,
       'action', 'revert'
     )
   );
   ```
8. **Return new version details**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "My SMA Strategy",
    "description": "Simple moving average crossover",
    "oldVersionNumber": 5,
    "revertedToVersionNumber": 3,
    "newVersionNumber": 6,
    "newVersionId": "uuid",
    "message": "Successfully reverted to version 3. Created new version 6 with the code from version 3.",
    "code": "def entry_signal(data):\n    sma_short = SMA(data.close, 20)\n    ...",
    "versionDescription": "Reverted to version 3",
    "createdAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Template):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Templates cannot be reverted. Contact admin to update template version.",
    "details": {
      "isTemplate": true,
      "recommendation": "Admin can use PROC-STRATEGY-014 to publish different version as template"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 404 - Version Not Found):**
```json
{
  "success": false,
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "Strategy version 10 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 10,
      "availableVersions": [1, 2, 3, 4, 5]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Code Validation Failed):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Code validation failed. Version 3 code no longer meets current security standards.",
    "details": [
      {
        "line": 15,
        "message": "Prohibited import: os",
        "severity": "error"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- New version created with code from target version
- Strategy's current_version_id updated to new version
- Version count incremented
- Event logged with revert metadata
- HTTP 201 Created

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy is template | 403 | Return "Templates cannot be reverted. Contact admin." |
| Strategy not found | 404 | Return "Strategy not found" |
| Version not found | 404 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors (old code may not meet current standards) |
| Reverting to current version | 400 | Return "Already on version {n}" |
| Database error | 500 | Log error, rollback transaction |

#### Revert vs Edit Explained

**Revert Creates New Version** (this process):
- Takes code from old version
- Creates NEW version with that code
- Preserves complete history
- Old versions remain unchanged

**Why Not Just Update current_version_id?**
- **Audit Trail**: Every change creates a version
- **Rollback History**: Can see when reverts happened
- **No Data Loss**: Original versions never modified
- **Backtest Integrity**: Existing backtests still reference correct versions

**Example Timeline:**
```
v1 (Initial)
v2 (Improvements)
v3 (More changes)
v4 (Bug introduced) ← current_version_id
User discovers bug, reverts to v3:
v5 (Revert to v3) ← new version created, current_version_id = v5
  └─ Code is identical to v3
  └─ But version number is v5
  └─ Description: "Reverted to version 3"
```

#### Use Cases

**Use Case 1: Bug Discovery**
```
1. User on v5, discovers critical bug
2. User views version history (PROC-STRATEGY-011)
3. User identifies v3 was stable
4. User reverts to v3 (this endpoint)
5. New v6 created with v3 code
6. User can continue editing from stable base
```

**Use Case 2: A/B Testing Different Approaches**
```
1. User on v4 (approach A)
2. User tries approach B, creates v5, v6
3. Backtest results show approach A was better
4. User reverts to v4
5. New v7 created with v4 code
6. User can refine approach A from there
```

**Use Case 3: Accidental Deletion**
```
1. User accidentally deletes important logic in v8
2. User immediately reverts to v7
3. New v9 created with v7 code
4. No work lost, can re-apply intended changes carefully
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-002**: Code validation and security scanning requirements

**Process-Specific Notes:**
- Database Queries: 4-5 queries (ownership check, version fetch, validation, INSERT, UPDATE, event log)
- Expected Execution Time: P95 < 400ms
- Code Validation: < 100ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **Creates New Version**: Revert always creates a new version (preserves history)
- **Code Validation**: Old code must still pass current security standards
- **Template Protection**: Templates cannot be reverted (admin must use PROC-STRATEGY-013)
- **Audit Trail**: Revert action logged with full metadata
- **Idempotent**: Can revert to same version multiple times (each creates new version)
- **Published Strategies**: Reverting does NOT change published_version_id automatically
- **User Decision**: After revert, user can optionally re-publish new version (PROC-STRATEGY-007)
- **Related Processes**:
  - PROC-STRATEGY-011 (View Version History) - Select version to revert to
  - PROC-STRATEGY-012 (View Specific Version) - Review version before reverting
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Alternative to revert
  - PROC-STRATEGY-007 (Publish Strategy) - Re-publish after revert if needed

---


---

## PROC-STRATEGY-014: Admin - Publish Strategy as Template

**Source File:** `PROC-STRATEGY-014.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-014.md`

### PROC-STRATEGY-014: Admin - Publish Strategy as Template

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
Admin publishes a strategy as an official template for all users

#### Actor
Admin

#### Preconditions
- User has admin role
- Strategy exists and is not deleted
- Target version exists and is valid
- Strategy status is 'active' (cannot publish drafts as templates)

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/strategies/{id}/publish-template`

**Request Body:**
```json
{
  "versionNumber": "integer (required, which version to publish as template)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/strategies/{id}/publish-template` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Strategy Repository validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.current_version_id, s.template_version_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
4. **Strategy Controller validates strategy status**
   - If `status != 'active'` → Return 400 "Only active strategies can be published as templates. Current status: {status}"
5. **Version Manager validates target version exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT sv.id, sv.version_number, sv.code, sv.description
   FROM strategy_versions sv
   WHERE sv.strategy_id = $1 AND sv.version_number = $2;
   ```
   - If version not found → Return 400 "Version {n} not found"
6. **Code Validator validates version code** (security check)
   - Same validation as PROC-STRATEGY-003 steps 5-7
   - Extra scrutiny for templates (official content)
   - If validation fails → Return 400 with validation errors
7. **Strategy Repository updates strategy as template**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_template = true,
     template_version_id = $1,
     created_by_admin = true,
     updated_at = NOW()
   WHERE id = $2
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = version_id (UUID of target version)
   - `$2` = strategy_id
8. **Strategy Event Logger logs template publication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'published_as_template', NOW(),
     'Strategy published as official template by admin',
     jsonb_build_object(
       'versionNumber', $3,
       'templateVersionId', $4,
       'adminId', $2
     )
   );
   ```
9. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Official template for simple moving average crossover strategies",
    "status": "active",
    "isTemplate": true,
    "isPublic": false,
    "createdByAdmin": true,
    "templateVersionId": "uuid",
    "templateVersionNumber": 2,
    "currentVersionId": "uuid",
    "currentVersionNumber": 3,
    "message": "Strategy published as template (version 2). Visible to all users in template library. Original creator can continue editing without affecting template.",
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Status):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_STATUS",
    "message": "Only active strategies can be published as templates. Current status: draft",
    "details": {
      "strategyId": "uuid",
      "currentStatus": "draft",
      "requiredStatus": "active"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

**Error Response (HTTP 400 - Invalid Version):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_VERSION",
    "message": "Strategy version 5 not found",
    "details": {
      "strategyId": "uuid",
      "requestedVersion": 5,
      "availableVersions": [1, 2, 3]
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as template (`is_template = true`)
- Template version ID updated to target version
- `created_by_admin` flag set to true
- Event logged to strategy_events table
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Strategy not found | 404 | Return "Strategy not found" |
| Strategy not active | 400 | Return "Only active strategies can be published as templates. Current status: {status}" |
| Version not found | 400 | Return "Strategy version {n} not found" with available versions |
| Code validation failed | 400 | Return validation errors with line numbers |
| Already published same version | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Template Version Control

**Key Concept**: Admin can publish any user's strategy as template without affecting ownership

- **Original creator**: Retains ownership, can continue editing (current_version_id)
- **Template users**: See frozen template version (template_version_id)
- **Admin control**: Can update which version is the template at any time

**Workflow Example:**
1. User "Alice" creates "Advanced SMA Strategy" → v1, v2, v3
2. Admin reviews and likes v2
3. Admin publishes v2 as template: `template_version_id = v2`, `is_template = true`
4. All users can now browse and use this template (seeing v2 code)
5. Alice continues working → v4, v5 created
6. Template users still see v2 (stable, admin-approved version)
7. Alice's current version is v5, but template stays at v2
8. Admin later decides v5 is better → re-publishes as template with v5
9. Template users now see v5

**Benefits:**
- **Quality Control**: Admin approves which versions become templates
- **Stability**: Templates don't change when original creator edits
- **Recognition**: Original creator credited, maintains ownership
- **Flexibility**: Admin can promote community strategies to templates
- **Version Control**: Clear separation between template and working versions

#### Admin Workflow for Creating Templates

**Recommended Process:**
1. Admin creates their own strategy OR finds excellent user strategy
2. Admin tests strategy thoroughly
3. Admin ensures strategy is well-documented (description, tags)
4. Admin sets strategy status to 'active'
5. Admin uses this endpoint to publish specific version as template
6. Template appears in all users' template library (PROC-STRATEGY-001 with `scope=templates`)

**Alternative: Publishing User Strategies as Templates:**
1. Admin discovers high-quality user strategy
2. Admin contacts user for permission (optional, platform policy)
3. Admin publishes user's strategy as template
4. User retains ownership and can continue editing
5. Template library shows strategy with credit to original creator

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operation)

**Process-Specific Notes:**
- Database Queries: 3-4 queries (strategy fetch, version validation, update, event log)
- Expected Execution Time: P95 < 300ms
- Code Validation: < 100ms (extra scrutiny for templates)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_versions`, `strategy_events`

**Libraries:**
- Python AST parser - Code validation
- Regex - Security scanning

#### Notes
- **Admin-Only Feature**: Regular users cannot publish templates
- **Version Immutability**: Template versions are read-only, admin must re-publish to change
- **Audit Trail**: All template publications logged to strategy_events
- **Security**: Code validation with extra scrutiny (templates are official content)
- **Original Creator Rights**: Original creator maintains ownership and edit rights
- **Discovery**: Templates visible to all users via PROC-STRATEGY-001 with `scope=templates`
- **Separate from Public**: A strategy can be both template AND public (different version IDs)
- **Related Processes**:
  - PROC-STRATEGY-001 (List Strategies with Filters) - How users discover templates
  - PROC-STRATEGY-007 (Publish Strategy as Public) - User-facing publication
  - PROC-STRATEGY-015 (Admin - Unpublish Template) - How to revert template status

---


---

## PROC-STRATEGY-015: Admin - Unpublish Template

**Source File:** `PROC-STRATEGY-015.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-015.md`

### PROC-STRATEGY-015: Admin - Unpublish Template

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-005
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-024, ADR-032

#### Trigger
Admin unpublishes a template to remove it from the template library

#### Actor
Admin

#### Preconditions
- User has admin role
- Strategy exists and is currently a template (`is_template = true`)

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/strategies/{id}/unpublish-template`

**Request Body:**
```json
{}
```
Note: No body required, action is idempotent

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/strategies/{id}/unpublish-template` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Strategy Repository validates strategy exists**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id, s.status, s.is_template, s.is_public,
          s.template_version_id, s.created_by_admin
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 Not Found
4. **Strategy Repository updates strategy to unpublish template**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   UPDATE strategies
   SET
     is_template = false,
     template_version_id = NULL,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
   **Parameters:**
   - `$1` = strategy_id

   **Note**: `created_by_admin` flag is NOT cleared - preserves original creator metadata
5. **Strategy Event Logger logs template unpublication event**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   INSERT INTO strategy_events (
     strategy_id, user_id, event_type, event_timestamp,
     event_description, event_metadata
   ) VALUES (
     $1, $2, 'unpublished', NOW(),
     'Template unpublished by admin',
     jsonb_build_object(
       'previousTemplateStatus', true,
       'previousTemplateVersionId', $3,
       'adminId', $2
     )
   );
   ```
6. **Return updated strategy details**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "name": "SMA Crossover Template",
    "description": "Former template, now returned to original creator",
    "status": "active",
    "isTemplate": false,
    "isPublic": false,
    "createdByAdmin": true,
    "templateVersionId": null,
    "currentVersionId": "uuid",
    "currentVersionNumber": 5,
    "message": "Template unpublished. No longer visible in template library. Original creator retains ownership.",
    "updatedAt": "2024-12-01T12:00:00Z"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 403 - Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Admin permissions required",
    "details": null
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

#### Success Criteria
- Strategy marked as non-template (`is_template = false`)
- Template version ID cleared (`template_version_id = NULL`)
- Event logged to strategy_events table
- Strategy no longer visible in template listings (PROC-STRATEGY-001 with `scope=templates`)
- Original creator retains ownership
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Strategy not found | 404 | Return "Strategy not found" |
| Already unpublished | 200 | Return success (idempotent operation) |
| Database error | 500 | Log error, rollback transaction |

#### Use Cases

**Scenario 1: Template contains outdated practices**
1. Admin unpublishes template (this endpoint)
2. Template removed from template library immediately
3. Original creator still owns strategy and can edit
4. Optionally, admin can contact creator about updating
5. Admin can re-publish improved version later (PROC-STRATEGY-014)

**Scenario 2: Template has security issues**
1. Admin discovers security vulnerability in template
2. Admin unpublishes template immediately
3. Template removed from all users' template library
4. Admin fixes issue or contacts original creator
5. Admin publishes corrected version

**Scenario 3: Consolidating template library**
1. Admin reviews all templates
2. Admin unpublishes redundant or low-quality templates
3. Keeps only high-quality, well-maintained templates
4. Improves user experience by reducing noise

**Scenario 4: Original creator requests removal**
1. Original creator contacts admin to remove their strategy from templates
2. Admin unpublishes template
3. Strategy reverted to creator's private control
4. Creator can continue using/editing privately

#### Ownership After Unpublishing

**Important**: Unpublishing a template does NOT delete the strategy or change ownership

- **Original creator**: Retains full ownership and access
- **Strategy status**: Remains active (unless explicitly changed)
- **Visibility**: Becomes private to original creator only
- **created_by_admin flag**: Preserved for historical tracking
- **Audit trail**: Complete history maintained in strategy_events

**If template was admin-created:**
- Strategy ownership remains with admin account
- Admin can delete strategy separately if needed (PROC-STRATEGY-005)
- Or admin can keep it private for future use

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operation)

**Process-Specific Notes:**
- Database Queries: 2-3 queries (strategy fetch, update, event log)
- Expected Execution Time: P95 < 200ms
- No code validation needed (only changing visibility)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `strategies`, `strategy_events`

#### Notes
- **Admin-Only Feature**: Regular users cannot unpublish templates
- **Idempotent**: Can call multiple times safely (already unpublished returns success)
- **Immediate Effect**: Template immediately removed from template library
- **Audit Trail**: Unpublication event logged for compliance
- **Reversible**: Admin can re-publish at any time using PROC-STRATEGY-014
- **No Data Loss**: Template version ID preserved in audit log (event_metadata)
- **Ownership Preserved**: Original creator retains ownership of strategy
- **Graceful Degradation**: If strategy was both template AND public, only template flag is cleared
- **Related Processes**:
  - PROC-STRATEGY-014 (Admin - Publish Strategy as Template) - Reverse operation
  - PROC-STRATEGY-001 (List Strategies with Filters) - Unpublished templates not in `scope=templates`
  - PROC-STRATEGY-008 (Unpublish Strategy) - User-facing unpublish for public strategies

---


---

## PROC-STRATEGY-016: Manage Strategy Tags (User)

**Source File:** `PROC-STRATEGY-016.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-016.md`

### PROC-STRATEGY-016: Manage Strategy Tags (User)

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001
**Related ADR:** ADR-032

#### Trigger
User adds, removes, or searches for tags on their strategies

#### Actor
Authenticated User (Strategy Owner)

#### Preconditions
- User is authenticated
- For add/remove operations: User owns the strategy

#### Sub-Processes

This process encompasses three related operations:
1. **Add Tag to Strategy** - Attach a tag to a strategy
2. **Remove Tag from Strategy** - Detach a tag from a strategy
3. **Search/List Available Tags** - Get tag suggestions for autocomplete

---

## 1. Add Tag to Strategy

#### Inputs

**API Endpoint:** `POST /api/v1/strategies/{id}/tags`

**Request Body:**
```json
{
  "tagName": "string (required, max 50 chars, alphanumeric + hyphens)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags` (POST)
2. **Strategy Controller validates ownership**
   ```sql
   -- Verify against: docs/01-phase/database-schemas/strategy_db_schema.dbml
   SELECT s.id, s.user_id
   FROM strategies s
   WHERE s.id = $1 AND s.deleted_at IS NULL;
   ```
   - If not found → Return 404 "Strategy not found"
   - If `user_id != current_user_id` → Return 403 "You do not own this strategy"
3. **Tag Manager validates tag name**
   - Trim whitespace
   - Convert to lowercase
   - Validate format: `^[a-z0-9-]{1,50}$`
   - If invalid → Return 400 "Invalid tag name format"
4. **Tag Manager finds or creates tag**
   ```sql
   -- Check if tag already exists for this user or as public tag
   SELECT id, name, is_public, created_by_user_id
   FROM tags
   WHERE name = $1
     AND (is_public = true OR created_by_user_id = $2);
   ```
   - If found → Use existing tag_id
   - If not found → Create new private tag:
   ```sql
   INSERT INTO tags (name, created_by_user_id, is_public, usage_count)
   VALUES ($1, $2, false, 0)
   RETURNING id;
   ```
5. **Tag Repository links tag to strategy**
   ```sql
   INSERT INTO strategy_tags (strategy_id, tag_id, tagged_by_user_id)
   VALUES ($1, $2, $3)
   ON CONFLICT (strategy_id, tag_id) DO NOTHING
   RETURNING id;
   ```
6. **Tag Manager increments usage count** (if new link created)
   ```sql
   UPDATE tags
   SET usage_count = usage_count + 1,
       updated_at = NOW()
   WHERE id = $1;
   ```
7. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tag": {
      "tagId": "uuid",
      "name": "trend-following",
      "isPublic": false,
      "createdByUserId": "uuid"
    },
    "message": "Tag added successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 400 - Invalid Tag Name):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TAG_NAME",
    "message": "Tag name must be 1-50 characters, lowercase alphanumeric and hyphens only",
    "details": {
      "providedTag": "Invalid Tag!",
      "validFormat": "^[a-z0-9-]{1,50}$"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. Remove Tag from Strategy

#### Inputs

**API Endpoint:** `DELETE /api/v1/strategies/{id}/tags/{tagId}`

**Path Parameters:**
- `{id}`: Strategy UUID
- `{tagId}`: Tag UUID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags/{tagId}` (DELETE)
2. **Strategy Controller validates ownership**
   - Same as Add Tag step 2
3. **Tag Repository removes link**
   ```sql
   DELETE FROM strategy_tags
   WHERE strategy_id = $1 AND tag_id = $2
   RETURNING id;
   ```
   - If no rows deleted → Return 404 "Tag not found on this strategy"
4. **Tag Manager decrements usage count**
   ```sql
   UPDATE tags
   SET usage_count = usage_count - 1,
       updated_at = NOW()
   WHERE id = $1;
   ```
5. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tagId": "uuid",
    "message": "Tag removed successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3. Search/List Available Tags (Autocomplete)

#### Inputs

**API Endpoint:** `GET /api/v1/tags/search?q={query}&page={page}&page_size={page_size}`

**Query Parameters:**
- `q`: Search query (optional, min 1 char)
- `page`: Page number (optional, default: 1)
- `page_size`: Results per page (optional, default: 20, max: 50)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/tags/search` (GET)
2. **Tag Repository searches tags with pagination**
   ```sql
   -- Get public tags + user's private tags matching query
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.usage_count,
     t.created_by_user_id,
     COUNT(*) OVER() as total_count
   FROM tags t
   WHERE (t.is_public = true OR t.created_by_user_id = $1)
     AND ($2 IS NULL OR t.name ILIKE $2 || '%')
   ORDER BY
     t.is_public DESC,       -- Public tags first
     t.usage_count DESC,     -- Then by popularity
     t.name ASC              -- Then alphabetically
   LIMIT $3 OFFSET $4;
   ```
   **Parameters:**
   - `$1` = user_id
   - `$2` = query (or NULL)
   - `$3` = page_size
   - `$4` = offset = (page - 1) * page_size
3. **Return tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": [
    {
      "tagId": "uuid",
      "name": "trend-following",
      "isPublic": true,
      "usageCount": 45,
      "category": "public"
    },
    {
      "tagId": "uuid",
      "name": "trend-experimental",
      "isPublic": false,
      "usageCount": 2,
      "category": "private"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 47,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4. Get Strategy Tags

#### Inputs

**API Endpoint:** `GET /api/v1/strategies/{id}/tags`

#### Process Steps

1. **API Gateway receives request** → `/api/v1/strategies/{id}/tags` (GET)
2. **Tag Repository retrieves strategy tags**
   ```sql
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.usage_count,
     st.tagged_at,
     st.tagged_by_user_id
   FROM strategy_tags st
   JOIN tags t ON st.tag_id = t.id
   WHERE st.strategy_id = $1
   ORDER BY st.tagged_at ASC;
   ```
3. **Return tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "tags": [
      {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "taggedAt": "2024-11-15T10:00:00Z"
      },
      {
        "tagId": "uuid",
        "name": "my-experimental",
        "isPublic": false,
        "taggedAt": "2024-11-20T14:30:00Z"
      }
    ],
    "total": 2
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

#### Success Criteria

**Add Tag:**
- Tag linked to strategy in strategy_tags table
- Tag usage_count incremented
- HTTP 201 Created

**Remove Tag:**
- Tag unlinked from strategy
- Tag usage_count decremented
- Unused private tags cleaned up
- HTTP 200 OK

**Search Tags:**
- Returns public tags + user's private tags
- Results ordered by relevance
- HTTP 200 OK

**Get Strategy Tags:**
- Returns all tags on strategy
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not strategy owner | 403 | Return "You do not own this strategy" |
| Strategy not found | 404 | Return "Strategy not found" |
| Invalid tag name format | 400 | Return "Invalid tag name format" with validation details |
| Tag already on strategy | 201 | Return success (idempotent) |
| Tag not on strategy (remove) | 404 | Return "Tag not found on this strategy" |
| Duplicate tag (different case) | 400 | Return "Tag already exists" with existing tag info |

#### Tag Naming Rules

**Format Rules:**
- Length: 1-50 characters
- Characters: Lowercase letters (a-z), numbers (0-9), hyphens (-)
- Cannot start or end with hyphen
- No spaces, underscores, or special characters

**Examples:**
- ✅ Valid: "trend-following", "high-risk", "scalping", "rsi-strategy"
- ❌ Invalid: "Trend Following" (uppercase), "high_risk" (underscore), "scalping!" (special char)

**Auto-normalization:**
- Input is automatically trimmed and converted to lowercase
- Users see normalized version in response

#### UI/UX Recommendations

**Tag Input Component:**
```
┌─────────────────────────────────────┐
│ Tags: [trend-following] [scalping]  │ ← Existing tags (removable)
│                                      │
│ Add tag: [trend________________] ⊕  │ ← Input field
│                                      │
│ Suggestions:                         │
│ • trend-following (public, 45 uses) │ ← Autocomplete dropdown
│ • trend-experimental (private, 2)   │
│ • Create new: "trend"                │
└─────────────────────────────────────┘
```

**Tag Display:**
- Public tags: Blue badge with globe icon
- Private tags: Gray badge with lock icon
- Usage count shown on hover

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)

**Process-Specific Notes:**
- **Add Tag**: P95 < 150ms (2-3 queries)
- **Remove Tag**: P95 < 100ms (2 queries)
- **Search Tags**: P95 < 100ms (1 indexed query with ILIKE)
- **Get Strategy Tags**: P95 < 50ms (1 simple JOIN query)

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `tags`, `strategy_tags`, `strategies`

#### Notes
- **Tag Reuse**: Tags are reusable across strategies (many-to-many relationship)
- **Private vs Public**:
  - Users create private tags by default
  - Only admins can create public tags (via PROC-STRATEGY-017)
  - Public tags are visible to all users in autocomplete
  - Private tags are only visible to their creator
- **Case Insensitivity**: Tag names are stored lowercase, searches are case-insensitive
- **Autocomplete**: Search endpoint powers tag autocomplete in UI
- **Tag Lifecycle**: Tags with usage_count = 0 remain in database for future reuse (updated_at tracks last usage)
- **Tag Limits**: No hard limit on tags per strategy (reasonable limit: ~10-15 tags recommended in UI)
- **Related Processes**:
  - PROC-STRATEGY-001 (List Strategies with Filters) - Filter by tags
  - PROC-STRATEGY-017 (Admin - Manage Public Tags) - Create/manage public tags
  - PROC-STRATEGY-003 (Create New Strategy) - Can include initial tags
  - PROC-STRATEGY-004 (Edit Existing Strategy) - Update strategy with tags

---


---

## PROC-STRATEGY-017: Admin - Manage Public Tags

**Source File:** `PROC-STRATEGY-017.md`  
**Path:** `processes\strategy-service\PROC-STRATEGY-017.md`

### PROC-STRATEGY-017: Admin - Manage Public Tags

**Service Owner:** Strategy Service
**Related FR:** FR-STRATEGY-009
**Related NFR:** NFR-PERF-001, NFR-SEC-005
**Related ADR:** ADR-032

#### Trigger
Admin creates, updates, or manages public tags for platform-wide strategy categorization

#### Actor
Admin

#### Preconditions
- User has admin role
- For update/delete operations: Tag exists

#### Sub-Processes

This process encompasses admin-only tag management operations:
1. **Create Public Tag** - Create a new platform-wide tag
2. **List All Tags** - View all public and private tags with admin filters
3. **Convert Tag to Public** - Make a user's private tag public
4. **Merge Duplicate Tags** - Combine duplicate or similar tags
5. **Delete Tag** - Remove a tag (admin only, with safety checks)

---

## 1. Create Public Tag

#### Inputs

**API Endpoint:** `POST /api/v1/admin/tags`

**Request Body:**
```json
{
  "name": "string (required, max 50 chars)",
  "description": "string (optional, max 200 chars)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags` (POST)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden "Admin permissions required"
3. **Tag Manager validates tag name**
   - Trim whitespace, convert to lowercase
   - Validate format: `^[a-z0-9-]{1,50}$`
   - If invalid → Return 400 "Invalid tag name format"
4. **Tag Manager checks for existing tag**
   ```sql
   SELECT id, name, is_public, created_by_user_id
   FROM tags
   WHERE name = $1;
   ```
   - If found and `is_public = true` → Return 409 "Public tag already exists"
   - If found and `is_public = false` → Suggest using "Convert to Public" endpoint
5. **Tag Repository creates public tag**
   ```sql
   INSERT INTO tags (name, created_by_user_id, is_public, usage_count)
   VALUES ($1, NULL, true, 0)
   RETURNING id, name, is_public, created_at;
   ```
   **Parameters:**
   - `$1` = tag_name (normalized)
   - `created_by_user_id` = NULL (system/admin tag)
6. **Return success response**

#### Outputs

**Success Response (HTTP 201):**
```json
{
  "success": true,
  "data": {
    "tag": {
      "tagId": "uuid",
      "name": "mean-reversion",
      "isPublic": true,
      "usageCount": 0,
      "createdAt": "2024-12-01T12:00:00Z"
    },
    "message": "Public tag created successfully. Visible to all users."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Tag Already Exists):**
```json
{
  "success": false,
  "error": {
    "code": "TAG_ALREADY_EXISTS",
    "message": "A tag with this name already exists",
    "details": {
      "existingTag": {
        "tagId": "uuid",
        "name": "mean-reversion",
        "isPublic": false,
        "createdByUserId": "uuid",
        "usageCount": 3
      },
      "suggestion": "Use PATCH /api/v1/admin/tags/{id}/make-public to convert this tag to public"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1",
    "requestId": "req-abc123"
  }
}
```

---

## 2. List All Tags (Admin View)

#### Inputs

**API Endpoint:** `GET /api/v1/admin/tags?visibility={visibility}&sort={sort}&page={page}&limit={limit}`

**Query Parameters:**
- `visibility`: Filter by visibility (optional: "public", "private", "all", default: "all")
- `sort`: Sort order (optional: "name", "usage", "created", default: "usage")
- `page`: Page number (optional, default: 1)
- `limit`: Results per page (optional, default: 50, max: 200)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags` (GET)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tags with filters**
   ```sql
   SELECT
     t.id,
     t.name,
     t.is_public,
     t.created_by_user_id,
     t.usage_count,
     t.created_at,
     t.updated_at,
     u.username as created_by_username,
     COUNT(DISTINCT st.strategy_id) as strategy_count
   FROM tags t
   LEFT JOIN users u ON t.created_by_user_id = u.id
   LEFT JOIN strategy_tags st ON t.id = st.tag_id
   WHERE
     CASE
       WHEN $1 = 'public' THEN t.is_public = true
       WHEN $1 = 'private' THEN t.is_public = false
       ELSE true
     END
   GROUP BY t.id, u.username
   ORDER BY
     CASE
       WHEN $2 = 'name' THEN t.name
       WHEN $2 = 'created' THEN t.created_at::text
       ELSE t.usage_count::text
     END DESC
   LIMIT $3 OFFSET $4;
   ```
   **Parameters:**
   - `$1` = visibility filter
   - `$2` = sort field
   - `$3` = limit
   - `$4` = offset (page - 1) * limit
4. **Return paginated tag list**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "usageCount": 45,
        "strategyCount": 42,
        "createdByUserId": null,
        "createdByUsername": null,
        "createdAt": "2024-10-01T10:00:00Z",
        "updatedAt": "2024-12-01T09:00:00Z"
      },
      {
        "tagId": "uuid",
        "name": "experimental",
        "isPublic": false,
        "usageCount": 3,
        "strategyCount": 3,
        "createdByUserId": "uuid",
        "createdByUsername": "alice",
        "createdAt": "2024-11-15T14:30:00Z",
        "updatedAt": "2024-11-20T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 127,
      "totalPages": 3
    },
    "filters": {
      "visibility": "all",
      "sort": "usage"
    }
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 3. Convert Tag to Public

#### Inputs

**API Endpoint:** `PATCH /api/v1/admin/tags/{id}/make-public`

**Path Parameters:**
- `{id}`: Tag UUID

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/{id}/make-public` (PATCH)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tag**
   ```sql
   SELECT id, name, is_public, created_by_user_id, usage_count
   FROM tags
   WHERE id = $1;
   ```
   - If not found → Return 404 "Tag not found"
   - If already public → Return 200 OK (idempotent)
4. **Tag Manager checks for public tag name conflict**
   ```sql
   SELECT id FROM tags
   WHERE name = $1 AND is_public = true AND id != $2;
   ```
   - If exists → Return 409 "Public tag with this name already exists. Use merge endpoint instead."
5. **Tag Repository converts tag to public**
   ```sql
   UPDATE tags
   SET
     is_public = true,
     updated_at = NOW()
   WHERE id = $1
   RETURNING *;
   ```
6. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tag": {
      "tagId": "uuid",
      "name": "scalping",
      "isPublic": true,
      "usageCount": 7,
      "originalCreator": "alice",
      "convertedAt": "2024-12-01T12:00:00Z"
    },
    "message": "Tag converted to public. Now visible to all users."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 4. Merge Duplicate Tags

#### Inputs

**API Endpoint:** `POST /api/v1/admin/tags/merge`

**Request Body:**
```json
{
  "sourceTagIds": ["uuid", "uuid"],
  "targetTagId": "uuid",
  "makePublic": "boolean (optional, default: false)"
}
```

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/merge` (POST)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Manager validates tags exist**
   ```sql
   SELECT id, name, is_public, usage_count
   FROM tags
   WHERE id = ANY($1);
   ```
   - If any tag not found → Return 404 "One or more tags not found"
4. **Tag Manager validates target tag**
   - Ensure targetTagId is not in sourceTagIds
   - If invalid → Return 400 "Target tag cannot be in source tags"
5. **Tag Repository begins transaction**
6. **Tag Repository reassigns strategy_tags**
   ```sql
   -- Update all strategy_tags pointing to source tags
   UPDATE strategy_tags
   SET tag_id = $1  -- target tag
   WHERE tag_id = ANY($2)  -- source tags
     AND NOT EXISTS (
       -- Avoid duplicates
       SELECT 1 FROM strategy_tags st2
       WHERE st2.strategy_id = strategy_tags.strategy_id
         AND st2.tag_id = $1
     );
   ```
7. **Tag Repository deletes duplicate strategy_tags**
   ```sql
   -- Delete remaining source tag links (duplicates)
   DELETE FROM strategy_tags
   WHERE tag_id = ANY($1);  -- source tags
   ```
8. **Tag Repository updates usage counts**
   ```sql
   -- Recalculate target tag usage
   UPDATE tags
   SET usage_count = (
     SELECT COUNT(*) FROM strategy_tags WHERE tag_id = $1
   ),
   updated_at = NOW()
   WHERE id = $1;
   ```
9. **Tag Repository deletes source tags**
   ```sql
   DELETE FROM tags
   WHERE id = ANY($1);  -- source tags
   ```
10. **Tag Repository optionally makes target public**
    ```sql
    UPDATE tags
    SET is_public = true,
        updated_at = NOW()
    WHERE id = $1 AND $2 = true;
    ```
11. **Commit transaction**
12. **Return merge summary**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "mergeResult": {
      "targetTag": {
        "tagId": "uuid",
        "name": "trend-following",
        "isPublic": true,
        "usageCount": 52
      },
      "mergedTags": [
        {"tagId": "uuid", "name": "trend", "previousUsage": 5},
        {"tagId": "uuid", "name": "trending", "previousUsage": 2}
      ],
      "totalStrategiesUpdated": 7,
      "duplicatesRemoved": 0
    },
    "message": "Successfully merged 2 tags into 'trend-following'. 7 strategies updated."
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

---

## 5. Delete Tag (Admin)

#### Inputs

**API Endpoint:** `DELETE /api/v1/admin/tags/{id}?force={boolean}`

**Path Parameters:**
- `{id}`: Tag UUID

**Query Parameters:**
- `force`: Force delete even if tag is in use (optional, default: false)

#### Process Steps

1. **API Gateway receives request** → `/api/v1/admin/tags/{id}` (DELETE)
2. **Admin Controller validates admin permissions**
   - If user is not admin → Return 403 Forbidden
3. **Tag Repository retrieves tag**
   ```sql
   SELECT id, name, is_public, usage_count
   FROM tags
   WHERE id = $1;
   ```
   - If not found → Return 404 "Tag not found"
4. **Tag Manager checks usage**
   - If `usage_count > 0` and `force != true` → Return 409 "Tag is in use. Use force=true to delete or merge with another tag."
5. **Tag Repository deletes strategy_tags links**
   ```sql
   DELETE FROM strategy_tags
   WHERE tag_id = $1;
   ```
6. **Tag Repository deletes tag**
   ```sql
   DELETE FROM tags
   WHERE id = $1
   RETURNING name;
   ```
7. **Return success response**

#### Outputs

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "tagName": "obsolete-tag",
    "strategiesAffected": 5,
    "message": "Tag deleted successfully"
  },
  "meta": {
    "timestamp": "2024-12-01T12:00:00Z",
    "version": "v1"
  }
}
```

**Error Response (HTTP 409 - Tag In Use):**
```json
{
  "success": false,
  "error": {
    "code": "TAG_IN_USE",
    "message": "Cannot delete tag that is currently in use",
    "details": {
      "tagName": "trend-following",
      "usageCount": 45,
      "strategyCount": 42,
      "suggestions": [
        "Use DELETE /api/v1/admin/tags/{id}?force=true to force deletion",
        "Use POST /api/v1/admin/tags/merge to merge with another tag"
      ]
    }
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

**Create Public Tag:**
- Public tag created in database
- Visible to all users in autocomplete
- HTTP 201 Created

**List All Tags:**
- Returns all tags with admin filters
- Includes creator and usage statistics
- HTTP 200 OK

**Convert to Public:**
- Tag marked as public
- No name conflicts
- HTTP 200 OK

**Merge Tags:**
- All strategy links reassigned to target tag
- Source tags deleted
- Usage counts updated
- HTTP 200 OK

**Delete Tag:**
- Tag deleted from database
- All strategy links removed
- HTTP 200 OK

#### Error Scenarios

| Error | HTTP Code | Handling |
|-------|-----------|----------|
| Not admin | 403 | Return "Admin permissions required" |
| Invalid tag name format | 400 | Return validation details |
| Public tag already exists | 409 | Return existing tag info, suggest conversion |
| Tag not found | 404 | Return "Tag not found" |
| Tag in use (delete) | 409 | Return usage count, suggest force or merge |
| Name conflict (convert) | 409 | Return conflict details, suggest merge |
| Target tag in sources (merge) | 400 | Return "Invalid merge parameters" |

#### Admin Use Cases

**Use Case 1: Create Platform Tags**
```
Admin creates standard tags for categorization:
1. Admin creates "trend-following" (public)
2. Admin creates "mean-reversion" (public)
3. Admin creates "scalping" (public)
4. All users can now use these tags
```

**Use Case 2: Promote Popular User Tag**
```
Admin notices many users creating "swing-trading" tag:
1. Admin uses List Tags to find "swing-trading" variants
2. Admin converts most popular variant to public
3. Admin merges other variants into the public tag
4. All users now see unified "swing-trading" tag
```

**Use Case 3: Clean Up Duplicates**
```
Admin finds duplicate tags:
1. Admin lists all tags, finds "trend", "trends", "trending"
2. Admin decides "trend-following" is the canonical tag
3. Admin merges "trend", "trends", "trending" → "trend-following"
4. All strategies automatically updated
```

**Use Case 4: Remove Obsolete Tag**
```
Admin removes deprecated tag:
1. Admin identifies "old-category" is no longer used
2. Admin checks usage (0 strategies)
3. Admin deletes tag
4. Or if in use: Admin merges into new category first
```

#### Performance Requirements

**Related NFRs:**
- **NFR-PERF-001**: API Response Time (P95 < 500ms for standard operations)
- **NFR-SEC-005**: Access Control (admin-only operations)

**Process-Specific Notes:**
- **Create Public Tag**: P95 < 150ms
- **List All Tags**: P95 < 300ms (paginated, indexed)
- **Convert to Public**: P95 < 100ms
- **Merge Tags**: P95 < 500ms (transaction with multiple updates)
- **Delete Tag**: P95 < 200ms

#### Dependencies

**Database:**
- `strategy_db` (PostgreSQL)
- Tables: `tags`, `strategy_tags`, `strategies`

#### Notes
- **Admin-Only**: All operations in this process require admin role
- **Audit Trail**: All tag management operations should be logged (future: tag_events table)
- **Idempotent**: Convert to public and create operations are idempotent
- **Transaction Safety**: Merge operation uses database transaction for consistency
- **Force Delete**: Deleting a tag in use removes it from all strategies (use with caution)
- **Name Normalization**: All tag names stored lowercase
- **No Cascade Delete**: Deleting a tag does not delete strategies (only unlinks)
- **Related Processes**:
  - PROC-STRATEGY-016 (Manage Strategy Tags) - User-facing tag operations
  - PROC-STRATEGY-001 (List Strategies with Filters) - Filter by public tags
  - PROC-STRATEGY-003 (Create New Strategy) - Use public tags on creation

---

