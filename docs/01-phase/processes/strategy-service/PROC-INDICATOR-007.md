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
