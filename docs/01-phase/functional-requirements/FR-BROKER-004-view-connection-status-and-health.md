### FR-BROKER-004: View Connection Status and Health
**Priority:** Medium
**User Story:** As a user, I want to view the status of my broker connections so that I know if there are any issues.

**Acceptance Criteria:**
- User can view list of all connected brokers
- Each connection displays:
  - Broker name (Bybit, Binance)
  - Status indicator (Connected, Disconnected, Error)
  - Last successful connection timestamp
  - Health check result
- System updates status automatically every 5 minutes
- User can manually refresh connection status
- Error status displays helpful error message
