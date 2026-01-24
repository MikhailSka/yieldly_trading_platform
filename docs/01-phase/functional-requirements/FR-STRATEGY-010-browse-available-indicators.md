# FR-STRATEGY-010: Browse Available Indicators

**Priority:** High
**User Story:** As a trader, I want to browse available technical indicators so that I can choose appropriate indicators for my trading strategy.

**Acceptance Criteria:**
- User can view list of all enabled technical indicators
- Each indicator displays:
  - Full name and abbreviation
  - Category (Overlap Studies, Momentum, Volume, Volatility)
  - Description of what the indicator measures
  - Usage example code snippet
  - Common use cases
  - Required parameters with descriptions
  - Popular parameter values
- User can filter indicators by category
- User can search indicators by name or description
- User can view detailed information for each indicator
- Indicator list updates when admin enables/disables indicators
- Indicators displayed in user-friendly format suitable for non-technical users

**API Endpoints:**
- `GET /api/v1/indicators` - List enabled indicators
- `GET /api/v1/indicators/:name` - Get detailed indicator information

**UI Components:**
- Indicator browser/selector
- Indicator detail panel with documentation
- Category filter
- Search functionality

**Related Features:**
- FR-STRATEGY-001 (Create new strategy)
- FR-STRATEGY-005 (Use strategy templates)
