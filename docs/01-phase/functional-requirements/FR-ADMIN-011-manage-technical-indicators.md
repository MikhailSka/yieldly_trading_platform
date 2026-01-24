# FR-ADMIN-011: Manage Technical Indicators

**Priority:** Medium
**User Story:** As an admin, I want to manage technical indicators so that I can control which indicators are available to users and provide helpful documentation.

**Acceptance Criteria:**
- Admin can view all technical indicators from TA-Lib library
- Admin can enable/disable indicators for user access
- Admin can add descriptions and usage examples for indicators
- Admin can specify common use cases for each indicator
- Admin can set popular parameter values for indicators
- Admin can trigger manual sync from Backtesting Service to update indicator library
- Admin can categorize indicators (Overlap Studies, Momentum, Volume, Volatility, etc.)
- Changes to indicator metadata immediately reflected in user-facing indicator list
- Admin can view indicator usage statistics (which indicators are most used)

**API Endpoints:**
- `GET /api/v1/admin/indicators` - List all indicators with metadata
- `PUT /api/v1/admin/indicators/:name` - Update indicator metadata
- `POST /api/v1/admin/indicators/sync` - Trigger sync from Backtesting Service
- `GET /api/v1/admin/indicators/:name/usage` - View indicator usage statistics

**Database Tables:**
- `indicator_configs` (Strategy Service database)

**Related Services:**
- Strategy Service (manages indicator configurations)
- Backtesting Service (provides indicator definitions from TA-Lib)
