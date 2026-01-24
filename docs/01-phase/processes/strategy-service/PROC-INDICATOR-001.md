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
