### FR-BROKER-003: Remove Broker Connection
**Priority:** Medium
**User Story:** As a user, I want to remove a broker connection so that I can disconnect my exchange account.

**Acceptance Criteria:**
- User can remove any connected broker from account settings
- System displays confirmation dialog before deletion
- System permanently deletes encrypted API credentials from database and Key Vault
- System stops all data synchronization for removed broker
- Portfolio data from removed broker is archived (not deleted)
- User receives confirmation message after successful removal
