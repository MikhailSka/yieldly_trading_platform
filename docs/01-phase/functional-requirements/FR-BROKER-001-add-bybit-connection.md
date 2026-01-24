### FR-BROKER-001: Add Bybit Connection
**Priority:** High
**User Story:** As a user, I want to connect my Bybit account so that I can access my portfolio and market data.

**Acceptance Criteria:**
- User can add Bybit connection via API credentials form
- User must provide API Key and API Secret
- System validates credentials by making test API call
- System stores credentials encrypted in database using Azure Key Vault
- System requests read-only permissions only
- System displays connection status (Connected, Disconnected, Error)
- Connection health checked every 5 minutes
- User can test connection manually at any time
- System displays last successful connection timestamp
