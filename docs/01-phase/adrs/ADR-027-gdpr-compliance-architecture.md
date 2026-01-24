## ADR-027: GDPR Compliance Architecture

### Status
Proposed

### Context
Yieldly must comply with GDPR (General Data Protection Regulation) requirements as it handles personal data of EU users. The platform operates using a microservices architecture where user data is distributed across multiple services and databases. GDPR mandates specific user rights that must be technically implemented:

**Key GDPR Rights:**
1. **Right to Access** (Article 15) - Users can request all personal data held
2. **Right to Rectification** (Article 16) - Users can correct inaccurate data
3. **Right to Erasure** (Article 17) - Users can request deletion ("Right to be Forgotten")
4. **Right to Data Portability** (Article 20) - Users can export data in machine-readable format

**Challenges:**
- Data scattered across 8+ microservices and databases
- Need to aggregate data for exports without coupling services
- Need to cascade deletion across services atomically
- Must preserve audit trails while respecting deletion requests
- Must handle anonymization for analytics/backtesting results

### Decision
Implement a **distributed GDPR compliance system** using event-driven architecture (Azure Service Bus) to orchestrate data operations across microservices while maintaining service independence.

**Phase 1 Implementation:** GDPR orchestration logic integrated into **User Profile Service** (avoids creating additional microservice for infrequent operations).

**Future Consideration:** Extract to dedicated GDPR Orchestrator Service if complexity warrants (Phase 2+).

### Architecture

#### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│              User Profile Service + GDPR Orchestration           │
│  - User profile CRUD                                             │
│  - GDPR export/deletion request handling                         │
│  - Coordinates GDPR operations via Service Bus                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Publishes events to
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Azure Service Bus (Topics)                    │
│  - gdpr.export.requested                                         │
│  - gdpr.deletion.requested                                       │
│  - gdpr.deletion.confirmed                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ Auth Service │    │ Strategy Svc │    │Portfolio Svc │
  │ (Subscriber) │    │ (Subscriber) │    │ (Subscriber) │
  └──────────────┘    └──────────────┘    └──────────────┘
```

**Rationale for Integration into User Profile Service:**
- GDPR operations are infrequent (not performance-critical)
- User Profile Service already owns core user data
- Reduces operational overhead for solo developer
- Fewer microservices to deploy, monitor, and maintain
- Can extract to dedicated service later if complexity grows
- Natural fit: GDPR requests initiated from user profile settings

#### Service Data Ownership

| Service | Data Owned | GDPR Relevance |
|---------|-----------|----------------|
| **Auth Service** | Email, password hash, login history, sessions | ✅ Personal Data |
| **User Profile Service** | Name, bio, avatar, preferences, experience level | ✅ Personal Data |
| **Strategy Service** | User-created strategies, versions, descriptions | ✅ User Content |
| **Broker Connectivity Service** | API keys (encrypted), connection metadata | ✅ Sensitive Data |
| **Portfolio Service** | Portfolio snapshots, transaction history | ✅ Financial Data |
| **Notification Service** | Notification preferences, history | ✅ Personal Preferences |
| **Backtesting Service** | Backtest results, execution logs (stored in `backtesting_db`) | ⚠️ Anonymizable Analytics |
| **Media Service** (Azure Blob) | Avatar images, strategy screenshots | ✅ User Content |
| **Admin Service** | Admin actions log, invite codes used | ⚠️ Audit Trail (partial retention) |

### GDPR Operations

#### 1. Data Export (Right to Access + Data Portability)

**User Flow:**
```
User → Profile Settings → "Export My Data" → Email Confirmation →
Wait (24h) → Download ZIP (7-day availability)
```

**Export Data Format:**

ZIP Structure:
```
user_data_export_2025-10-26.zip
├── README.txt                    (explains contents)
├── auth_data.json
├── profile_data.json
├── strategies.json
├── portfolio_data.json
├── connections.json
├── notifications.json
├── backtests.json
└── media/
    ├── avatar.jpg
    └── strategy_screenshots/
```

**Rate Limiting:**
- One export request per user per 30 days
- Prevent abuse of export functionality

**Security:**
- Download links use Azure Blob SAS tokens (time-limited, read-only)
- Links automatically expire after 7 days
- User must be authenticated to request export
- Email confirmation required before processing

#### 2. Data Deletion (Right to Erasure / Right to be Forgotten)

**User Flow:**
```
User → Profile Settings → "Delete My Account" →
Confirmation Dialog (WARNING) → Email Confirmation →
30-Day Grace Period → Final Deletion
```

**Grace Period (30 Days):**

Purpose:
- Prevent accidental deletions
- Allow users to change their mind
- Comply with financial record retention (if applicable)

During Grace Period:
- Account marked as `pending_deletion`
- User cannot log in
- User can cancel deletion via email link
- No data is deleted yet
- Broker connections automatically disconnected

**Anonymization vs. Hard Deletion:**

| Data Type | Action | Reason |
|-----------|--------|--------|
| Personal identifiers (name, email) | **Hard delete** | No business need |
| Auth credentials | **Hard delete** | Security requirement |
| Strategy code | **Hard delete** | User content, no analytics value |
| Backtest results | **Anonymize** | Valuable for platform analytics |
| Transaction history | **Hard delete** OR **Anonymize** | Depends on regulatory requirements |
| API keys | **Hard delete** | Security requirement |
| Audit logs | **Anonymize** (hash user_id) | Compliance requirement |

Anonymization Strategy:
```sql
-- Example: Anonymize backtest results in backtesting_db (see ADR-002)
UPDATE backtest_results
SET user_id = NULL,
    user_identifier = MD5(user_id::text),  -- One-way hash for grouping
    anonymized_at = NOW()
WHERE user_id = :deleted_user_id;

-- Also anonymize related trade records
UPDATE backtest_trades
SET user_id = NULL
WHERE backtest_id IN (
    SELECT id FROM backtest_results WHERE user_id = :deleted_user_id
);
```

**Cancellation Flow:**

```
User receives deletion email → Clicks "Cancel Deletion" →
Validates cancellation token → Reactivates account →
User can log in again
```

#### 3. Data Rectification (Right to Rectification)

Implementation:
- User can directly edit profile data (name, bio, preferences)
- No special GDPR process needed - standard update APIs
- Changes logged in audit trail

#### 4. Consent Management (GDPR Article 7)

**Cookie Consent:**
```
On first visit → Cookie consent banner →
User accepts/rejects → Store preference →
Apply cookie policy
```

Cookie Types:
- Essential: Authentication, session (cannot be rejected)
- Functional: Preferences, theme (can be rejected)
- Analytics: Azure Monitor, usage tracking (can be rejected)

**Privacy Policy & Terms:**
- User must accept during registration
- Version tracked (privacy_policy_v1, terms_v1)
- User must re-accept if policies change significantly

Acceptance Tracking:
```sql
CREATE TABLE user_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    consent_type    VARCHAR(50) NOT NULL,
    consent_version VARCHAR(20) NOT NULL,
    accepted_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),

    UNIQUE (user_id, consent_type, consent_version)
);
```

### Monitoring & Compliance

**Metrics to Track:**
- GDPR export requests per month
- Average export processing time
- GDPR deletion requests per month
- Deletion completion rate (should be 100%)
- Failed deletions (investigate immediately)

**Alerts:**
- Export processing > 24 hours (SLA violation)
- Deletion confirmation missing from any service (critical)
- Spike in deletion requests (investigate reason)

### Audit Logging (Compliance)

**What to log (immutable, 3-year retention):**
- All GDPR export requests (who, when, completed)
- All GDPR deletion requests (who, when, completed)
- Consent acceptance events (what, when, version, IP)
- Data breach incidents (if any)
- Admin access to user data (when, who, reason)

Audit Log Storage:
- Separate append-only database or Azure Table Storage
- Encrypted at rest
- Admin-only access
- Automated archival after 3 years

### Data Breach Response Plan

**In case of data breach (GDPR Article 33):**

1. **Detect & Contain** (within 24 hours)
   - Identify affected data
   - Stop the breach
   - Preserve evidence

2. **Assess Severity** (within 24 hours)
   - Risk to user rights and freedoms?
   - Sensitive data exposed?
   - Number of users affected

3. **Notify Authorities** (within 72 hours)
   - Report to relevant Data Protection Authority (DPA)
   - Required if high risk to users

4. **Notify Affected Users** (without undue delay)
   - If high risk to users
   - Explain nature of breach
   - Explain steps taken
   - Explain steps users should take

5. **Document Incident**
   - Full incident report
   - Lessons learned
   - Remediation steps

### Data Protection Officer (DPO)

**Phase 1 (MVP):**
- Solo developer acts as DPO
- DPO contact: privacy@yieldly.io (or founder email)

**Phase 2 (Growth):**
- Designate formal DPO if:
  - Regular monitoring of data subjects at large scale
  - Processing sensitive data at scale
  - Required by law

### International Data Transfers

**Current Approach:**
- All data stored in **Azure West Europe** (primary)
- Backup in **Azure North Europe**
- No data transfer outside EU

**Third-Party Services (Data Processing Agreements required):**
- Auth0: GDPR-compliant, EU data residency option
- SendGrid: GDPR-compliant, EU data residency option
- Azure: GDPR-compliant, EU regions

### Privacy by Design Principles

1. **Data Minimization:** Collect only necessary data
2. **Purpose Limitation:** Use data only for stated purposes
3. **Storage Limitation:** Delete data when no longer needed
4. **Accuracy:** Allow users to correct their data
5. **Integrity & Confidentiality:** Encrypt data, secure access
6. **Accountability:** Document compliance measures

### Documentation Requirements

**User-Facing:**
- Privacy Policy (clear, accessible)
- Cookie Policy
- Terms of Service
- Data export instructions
- Data deletion instructions

**Internal:**
- Data Processing Inventory (what data, why, how long)
- Data Flow Diagrams (where data goes)
- GDPR procedures documentation
- Incident response plan
- Vendor GDPR compliance verification

### Implementation Checklist

**Phase 1 (MVP Launch):**
- [ ] Implement data export functionality
- [ ] Implement account deletion with grace period
- [ ] Create Privacy Policy & Terms of Service
- [ ] Implement cookie consent banner
- [ ] Set up audit logging
- [ ] Document data flows
- [ ] Verify third-party GDPR compliance
- [ ] Set up GDPR request monitoring

**Phase 2 (Ongoing):**
- [ ] Regular privacy audits (yearly)
- [ ] Update policies as needed
- [ ] Train team on GDPR (when team grows)
- [ ] Review and improve processes

### Related ADRs
- ADR-007: Security and Access Control (data encryption, access control)
- ADR-008: Database Backup and Recovery (data retention)
- ADR-019: Azure Service Bus (event-driven GDPR operations)
- ADR-026: Invite and Referral Code System (invite data anonymization)
