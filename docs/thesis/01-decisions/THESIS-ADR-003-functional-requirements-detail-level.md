# THESIS-ADR-003: Functional Requirements Detail Level for AI-Assisted Code Generation

## Status

Accepted

## Decision

Adopt enriched functional requirements format following IEEE 830 principles adapted for AI consumption. Each functional requirement will include:

### Required Sections

1. **Business Context** - Explains WHY the feature exists
2. **Functional Description** - What the feature does (traditional user story)
3. **Data Requirements** - Explicit fields, types, constraints, and purpose
4. **Business Rules** - Domain logic separated from acceptance criteria
5. **Acceptance Criteria** - Testable behavior requirements
6. **Error Scenarios** - Edge cases and exception handling
7. **Related Documentation** - Wiki-links to ADRs, NFRs, other FRs

### Format Principles

**Explicit over Implicit**
- State all data fields with types, constraints, and purpose
- Document default values and calculated fields
- Specify validation rules and business constraints

**Descriptive over Prescriptive**
- Focus on WHAT and WHY, not HOW
- Avoid implementation details (no code examples)
- Allow flexibility for tech stack changes

**AI-Optimized Structure**
- Front-load critical information (data requirements first)
- Use consistent formatting for machine parsing
- Include semantic links between related documents

**Business-Focused Language**
- Explain domain concepts and business rules
- Connect features to business objectives
- Document the reasoning behind constraints

## Context

Yieldly is building an algorithmic trading platform with AI-assisted code generation as a core development approach. The project initially adopted Agile-style user stories for functional requirements, which proved insufficient for AI code generation workflows.

### The Problem

Traditional Agile user stories were designed for human development teams where:
- Developers can ask clarifying questions during implementation
- Domain knowledge is shared through conversations and tribal knowledge
- Ambiguity can be resolved through team discussions
- Data models emerge organically through iterative development

AI code generation systems operate fundamentally differently:
- Cannot ask clarifying questions during generation
- Must infer all requirements from written documentation
- Make assumptions when information is missing
- Generate complete implementations in single passes

### What Was Tried Before

**Agile User Stories (Initial Approach)**

Simple user stories with acceptance criteria:
- "As a user, I want to register so that I can access the platform"
- Acceptance criteria focused on behavior: "User must provide valid email address"

Problems encountered:
- No explicit data requirements led to missing critical fields (timezone, locale)
- No business context caused AI to misunderstand feature purpose
- Business rules were implicit in acceptance criteria
- Edge cases and error scenarios were not documented
- AI had to guess database schema, API contracts, and validation rules

**Process Documents with Code Examples (Second Approach)**

Attempted to supplement FRs with Process Documents (PROC) containing reference implementations. See [[THESIS-ADR-001-togaf-adaptation#What We Remove]] for the full explanation.

Problems encountered:
- AI copied example code literally instead of understanding business logic
- Examples became outdated as tech stack evolved
- Prescriptive code conflicted with "documentation as source" principle
- Created maintenance burden keeping examples synchronized
- Did not solve the underlying problem of unclear requirements

### Real-World Impact

During initial prototyping, missing timezone field in user registration caused:
- Charts displayed in UTC instead of user's local time
- Confusion about market hours and trading windows
- Required schema migration and data backfill
- Could have been prevented with explicit data requirements

## Example: Before and After

### Before (Agile User Story)

```markdown
## FR-USER-001: User Registration

As a user, I want to register so that I can access the platform.

**Acceptance Criteria:**
- User must provide valid email address
- Password must meet security requirements
- User receives confirmation email
```

### After (Enriched FR)

```markdown
## FR-USER-001: User Registration

### Business Context

User registration is the entry point to the platform. We collect minimal information upfront to reduce friction, while gathering timezone and locale data critical for correctly displaying market data and charts in the user's context. Email serves as both login identifier and primary communication channel.

### Functional Description

Allow new users to create an account with email and password, receive verification email, and complete account activation.

### Data Requirements

**User Entity:**
- `email` (string, required, unique, max 255 chars, email format validation)
  - Purpose: Login identifier and notification channel
  - Constraint: Case-insensitive uniqueness check

- `password_hash` (string, required, bcrypt format)
  - Purpose: Secure authentication credential storage
  - Never store plaintext password

- `timezone` (string, required, IANA timezone format, default: "UTC")
  - Purpose: Display charts and market hours in user's local time
  - Example: "America/New_York", "Europe/London"

- `locale` (string, optional, ISO 639-1 format, default: "en")
  - Purpose: UI language preference
  - Example: "en", "es", "fr"

- `email_verified` (boolean, required, default: false)
  - Purpose: Track email verification status

- `verification_token` (string, optional, UUID v4)
  - Purpose: One-time token for email verification
  - Expires after 24 hours

- `created_at` (timestamp, required, auto-generated)
- `updated_at` (timestamp, required, auto-updated)

### Business Rules

- Email addresses are case-insensitive (normalize to lowercase)
- Passwords must be at least 12 characters
- Verification tokens expire after 24 hours
- Users cannot log in until email is verified
- Timezone detection attempts browser/IP-based suggestion but requires user confirmation

### Acceptance Criteria

- Given valid email and password, system creates unverified user account
- System sends verification email with unique token link
- System prevents duplicate email registration (case-insensitive)
- Given valid verification token, system marks email as verified
- Given expired token, system prompts user to request new verification email

### Error Scenarios

- Email already registered → Return "Email already in use" error (do not reveal if email exists for security)
- Invalid email format → Return field validation error
- Password too short → Return "Password must be at least 12 characters"
- Verification token expired → Allow user to request new token
- Verification token invalid → Return "Invalid or expired verification link"

### Related Documentation

- [[ADR-SEC-001-authentication-strategy]] - Authentication approach
- [[NFR-SEC-002-password-requirements]] - Password security requirements
- [[FR-USER-002-email-verification]] - Detailed verification flow
- [[PROC-NOTIFY-001-email-delivery]] - Email notification infrastructure (for context only, not prescriptive)
```

## Consequences

### Positive

- AI code generation produces more complete and accurate implementations
- Explicit data requirements eliminate schema guessing
- Business context provides semantic understanding for AI
- Error scenarios prevent incomplete implementations
- Human developers have comprehensive requirements reference without tribal knowledge
- Requirements remain stable across tech stack changes

### Negative

- Higher upfront cost to write requirements (2-3x time investment)
- Requires discipline to maintain detail level consistently
- Risk of over-specification if not balanced with flexibility

### Mitigations

- Template reduces writing time after initial learning
- Time saved in implementation and rework exceeds upfront cost
- Focus on WHAT/WHY, not HOW — avoid implementation details
- Use "should" for preferences, "must" for hard constraints

## Related Documentation

- [[THESIS-ADR-001-togaf-adaptation]] — Parent decision about documentation approach
- [[THESIS-ADR-002-document-hierarchy]] — FRs are Priority 3 in source-of-truth hierarchy
- [[THESIS-ADR-004-naming-and-folder-strategy]] — FR naming and folder conventions
- [[THESIS-ADR-005-linking-strategy]] — Metadata and linking for FRs
- [[FR-TEMPLATE]] — Template updated based on this decision
- [[../00-overview/problem-statement]] — Why AI-friendly documentation matters
- IEEE Std 830-1998: Recommended Practice for Software Requirements Specifications
