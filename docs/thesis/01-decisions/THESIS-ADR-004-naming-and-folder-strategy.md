# THESIS-ADR-004: Naming and Folder Strategy

## Status

Accepted

## Decision

We will implement a structured organization for platform documentation using:

1. **Folder Structure** — Organize by scope (ADRs) or domain (FRs/NFRs)
2. **Naming Conventions** — Encode type, domain, and number in filenames

Folder provides context; filename is self-documenting.

## Folder Strategy

### ADRs Organized by Scope

```
docs/decisions/
  global/                    # Cross-cutting architectural decisions
    ADR-001-SEC-rate-limiting.md
    ADR-002-API-versioning.md
  user-service/              # Service-specific decisions
    ADR-010-SEC-password-hashing.md
    ADR-011-DATA-user-preferences-schema.md
  broker-service/
    ADR-020-INT-alpaca-integration.md
  thesis/                    # Methodology and process decisions
    THESIS-ADR-001-togaf-adaptation.md
    THESIS-ADR-002-document-hierarchy.md
```

**Rationale:**
- Global decisions affect multiple services (authentication strategy, API standards)
- Service-specific decisions are scoped to implementation details
- Thesis decisions document methodology, not platform architecture
- Folder provides scope context; filename provides domain and description

### FRs Organized by Domain Area

```
docs/functional-requirements/
  authentication/
    FR-AUTH-001-registration.md
    FR-AUTH-002-login.md
    FR-AUTH-003-password-reset.md
  profile/
    FR-PROFILE-001-view-profile.md
    FR-PROFILE-002-update-settings.md
  backtesting/
    FR-BACKTEST-001-run-backtest.md
    FR-BACKTEST-002-view-results.md
  portfolio/
    FR-PORTFOLIO-001-track-positions.md
```

**Rationale:**
- Domain-based folders match user mental models (authentication, portfolio, backtesting)
- Related features grouped together for discovery
- Folder structure mirrors user-centric mind map organization
- AI can easily find all requirements for a specific domain

### NFRs Organized by Quality Attribute

```
docs/non-functional-requirements/
  security/
    NFR-SEC-001-password-requirements.md
    NFR-SEC-002-session-management.md
  performance/
    NFR-PERF-001-api-response-time.md
    NFR-PERF-002-database-query-limits.md
  reliability/
    NFR-REL-001-uptime-targets.md
  scalability/
    NFR-SCALE-001-concurrent-users.md
  maintainability/
    NFR-MAINT-001-code-coverage.md
```

**Rationale:**
- Quality attributes are cross-cutting concerns
- Organization by quality type enables holistic review (all security NFRs together)
- Supports compliance verification (gather all security requirements)

## Naming Conventions

### ADR Naming Format

**Pattern:** `ADR-{NUM}-{DOMAIN}-{description}.md`

**Components:**
- `ADR` — Document type prefix
- `{NUM}` — Sequential number (001, 002, etc.)
- `{DOMAIN}` — Technical domain abbreviation
- `{description}` — Kebab-case description

**Domain Abbreviations:**

| Abbreviation | Domain |
|--------------|--------|
| `SEC` | Security |
| `API` | API design |
| `DATA` | Data modeling |
| `INFRA` | Infrastructure |
| `INT` | Integration |
| `PERF` | Performance |
| `ARCH` | General architecture |

**Examples:**
- `ADR-001-SEC-rate-limiting.md` (in `global/`)
- `ADR-010-DATA-user-preferences-schema.md` (in `user-service/`)
- `ADR-020-INT-alpaca-integration.md` (in `broker-service/`)

**Thesis ADR Exception:**

**Pattern:** `THESIS-ADR-{NUM}-{description}.md`

- No domain abbreviation (methodology decisions don't have technical domains)
- Always stored in `thesis/` folder
- For process and methodology decisions, not platform architecture

### FR Naming Format

**Pattern:** `FR-{DOMAIN}-{NUM}-{description}.md`

**Components:**
- `FR` — Document type prefix
- `{DOMAIN}` — Business domain abbreviation (project-specific)
- `{NUM}` — Sequential number within domain (001, 002, etc.)
- `{description}` — Kebab-case description

**Domain is project-specific:**

Unlike ADR/NFR domains (which are general architectural concepts), FR domains are business-specific and will evolve with the project. New domains can be added as the product grows.

The domain abbreviation should:
- Be short (3-8 characters)
- Match the folder name
- Be consistent within the project

**Examples:**
- `FR-AUTH-001-registration.md` (in `authentication/`)
- `FR-BACKTEST-001-run-backtest.md` (in `backtesting/`)
- `FR-PORTFOLIO-001-track-positions.md` (in `portfolio/`)

> **Note:** This ADR does not define the list of FR domains. Domains are created as needed and documented by the folder structure itself. The folder is the source of truth for available domains.

### NFR Naming Format

**Pattern:** `NFR-{DOMAIN}-{NUM}-{description}.md`

**Domain Abbreviations:**

| Abbreviation | Quality Attribute |
|--------------|-------------------|
| `SEC` | Security |
| `PERF` | Performance |
| `REL` | Reliability |
| `SCALE` | Scalability |
| `MAINT` | Maintainability |
| `USABILITY` | Usability |

**Examples:**
- `NFR-SEC-001-password-requirements.md` (in `security/`)
- `NFR-PERF-001-api-response-time.md` (in `performance/`)

## Context

The project initially used flat folder structures with naming conventions only. As the documentation grew:

- `docs/decisions/` had 40+ ADRs with no organization (global vs service-specific unclear)
- `docs/functional-requirements/` became a long list difficult to navigate
- Human developers couldn't find relevant documents efficiently
- AI had to scan many irrelevant files to find what it needed

## Consequences

### Positive

- Folder structure provides intuitive human navigation
- Filenames are self-documenting (domain and description visible)
- AI can use glob patterns to find relevant documents by scope or domain
- Clear conventions reduce decision fatigue when creating new documents
- Sequential numbering within domains prevents conflicts

### Negative

- Must reorganize existing documents into folder structure
- Must maintain consistency when creating new documents
- Deeper folder nesting makes wiki-links slightly longer

### Mitigations

- Templates include naming examples
- This ADR serves as reference for conventions
- Migration can be done incrementally by domain

## Related Documentation

- [[THESIS-ADR-001-togaf-adaptation]] — Document types we use
- [[THESIS-ADR-002-document-hierarchy]] — Source of truth hierarchy
- [[THESIS-ADR-003-functional-requirements-detail-level]] — FR format rationale
- [[THESIS-ADR-005-linking-strategy]] — How documents connect to each other
- [[../00-overview/goals-and-objectives]] — Discoverability as success criterion
