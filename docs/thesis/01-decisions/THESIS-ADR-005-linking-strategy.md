# THESIS-ADR-005: Linking Strategy

## Status

Accepted

## Decision

We will use multiple redundant discovery mechanisms for document relationships:

1. **Folder Structure** — Navigate by browsing directories
2. **Filename Patterns** — Search by naming convention (glob)
3. **Text Search** — Search content within files (grep)
4. **Wiki-Links** — Explicit relationships between specific documents
5. **Metadata Tags** — Cross-cutting classification (hidden at end of document)
6. **Generated Index** — Aggregated metadata for fast queries

Multiple paths to the same information make discovery easier for both AI and humans. Each mechanism serves different use cases.

## Discovery Methods

### 1. Folder Structure

**How it works:** Browse directories to find documents by category.

```bash
# List all authentication requirements
ls docs/functional-requirements/authentication/

# List all security decisions
ls docs/decisions/global/*-SEC-*.md

# Tree view of all decisions
tree docs/decisions/
```

**Best for:**
- Human browsing
- Understanding project structure
- Finding all documents in a domain

### 2. Filename Patterns (Glob)

**How it works:** Search by naming convention patterns.

```bash
# Find all FRs related to authentication
glob "docs/**/FR-AUTH-*.md"

# Find all security ADRs across all scopes
glob "docs/decisions/**/ADR-*-SEC-*.md"

# Find all NFRs
glob "docs/non-functional-requirements/**/*.md"
```

**Best for:**
- AI document discovery
- Filtering by document type
- Cross-folder searches

### 3. Text Search (Grep)

**How it works:** Search for keywords within file content.

```bash
# Find documents mentioning "password"
grep -r "password" docs/ --include="*.md"

# Find documents mentioning a specific service
grep -r "user-service" docs/ --include="*.md"

# Find all wiki-links to a specific document
grep -r "\[\[FR-AUTH-001" docs/
```

**Best for:**
- Finding documents by topic
- Discovering relationships
- Searching for specific terms

### 4. Wiki-Links (Obsidian-Style)

**Format:** `[[document-name]]` or `[[path/to/document]]`

**How it works:** Explicit links in Related Documentation sections.

```markdown
## Related Documentation

- [[FR-AUTH-001-registration]] — User registration business logic
- [[ADR-015-SEC-password-hashing]] — Why bcrypt was chosen
- [[user-service-api.yaml]] — API specification
```

**Best for:**
- Humans navigating between related documents
- AI following explicit dependencies
- Graph visualization in Obsidian

**Rationale:**
- Explicit syntax distinguishes links from regular text
- Bidirectional link detection (Obsidian shows backlinks)
- AI can programmatically extract and follow links

### 5. Metadata Tags (Hidden Block)

**Format:** HTML comment block at the **end** of document (invisible in Obsidian reading view).

**Why at the end:**
- Document content is not cluttered with YAML header
- Clean reading experience in Obsidian
- Metadata is still machine-readable

**Schema:**

```markdown
<!-- Document content above -->

## Related Documentation

- [[linked-doc-1]]
- [[linked-doc-2]]

<!--
@meta
id: FR-AUTH-001
domain: authentication
roles: [trader, admin]
tags: [email, verification, onboarding]
related-services: [user-service, notification-service]
status: approved
-->
```

**Field Descriptions:**

| Field | Purpose | Example |
|-------|---------|---------|
| `id` | Unique document identifier | `FR-AUTH-001` |
| `domain` | Business or technical domain | `authentication` |
| `roles` | User roles affected | `[trader, admin]` |
| `tags` | Cross-cutting topics | `[email, verification]` |
| `related-services` | Services involved | `[user-service]` |
| `status` | Document lifecycle | `draft`, `approved` |

**Best for:**
- Cross-cutting queries (find all docs for "admin" role)
- Filtering by status
- Index generation

### 6. Generated Index File

**How it works:** Script extracts metadata from all documents into single searchable file.

**Location:** `docs/index.yaml`

**Format:**

```yaml
documents:
  - id: FR-AUTH-001
    type: functional-requirement
    path: docs/functional-requirements/authentication/FR-AUTH-001-registration.md
    domain: authentication
    roles: [trader, admin]
    tags: [email, verification, onboarding]
    related-services: [user-service, notification-service]
    status: approved

  - id: ADR-015-SEC-password-hashing
    type: architecture-decision
    path: docs/decisions/user-service/ADR-015-SEC-password-hashing.md
    domain: security
    scope: user-service
    tags: [authentication, hashing]
    status: accepted
```

**Usage:**

```bash
# Find all authentication documents
yq '.documents[] | select(.domain == "authentication")' docs/index.yaml

# Find documents by tag
yq '.documents[] | select(.tags[] == "email")' docs/index.yaml

# Find documents by role
yq '.documents[] | select(.roles[] == "admin")' docs/index.yaml

# Find documents by service
yq '.documents[] | select(.related-services[] == "user-service")' docs/index.yaml
```

**Best for:**
- AI queries without reading all files
- Complex filtering (domain + role + tag)
- Reduced token usage

## How Multiple Methods Work Together

### Example: AI Task "Implement user registration"

AI has multiple paths to find relevant documents:

| Method | Query | Finds |
|--------|-------|-------|
| **Folder** | `ls docs/functional-requirements/authentication/` | All auth FRs |
| **Glob** | `glob "docs/**/FR-AUTH-*.md"` | All auth FRs by pattern |
| **Grep** | `grep -r "registration" docs/` | Docs mentioning registration |
| **Index** | `yq '.documents[] \| select(.domain == "authentication")'` | Auth docs with metadata |
| **Wiki-links** | Follow `[[FR-AUTH-001]]` references | Explicit dependencies |

**Redundancy = Reliability:**
- If one method fails, others still work
- Different methods suit different starting points
- AI can cross-verify results

### Example: Human exploring "what affects email?"

| Method | Action | Result |
|--------|--------|--------|
| **Grep** | `grep -r "email" docs/` | All mentions of email |
| **Index** | `yq '... \| select(.tags[] == "email")'` | Docs tagged with email |
| **Obsidian** | Search "email" in vault | Visual results with context |
| **Wiki-links** | Check backlinks to email-related docs | What references them |

### Example: Finding all documents for a service

| Method | Query |
|--------|-------|
| **Folder** | `ls docs/decisions/user-service/` |
| **Grep** | `grep -r "user-service" docs/` |
| **Index** | `yq '... \| select(.related-services[] == "user-service")'` |

## Context

Previous approach relied only on folder structure and naming. This worked for basic navigation but failed for:

- **Cross-cutting queries** — "Find all security-related documents" required reading every file
- **Role-based filtering** — "What can a Trader do?" not captured in naming
- **Topic search** — Finding all docs about "email" was manual
- **AI efficiency** — High token usage reading irrelevant documents

Multiple redundant methods solve these problems while maintaining simplicity.

## Consequences

### Positive

- Multiple discovery paths = easier to find documents
- Folder/glob/grep work without any tooling
- Index enables complex queries
- Wiki-links provide explicit graph for humans
- Hidden metadata keeps documents clean
- AI can choose most efficient method for each task

### Negative

- Must maintain metadata blocks in documents
- Must regenerate index after document changes
- Wiki-links require maintenance when documents move

### Mitigations

- Metadata is optional — folder/naming/grep still work without it
- Pre-commit hook regenerates index automatically
- Linter checks for broken wiki-links
- Templates include metadata block

## Implementation Notes

### Metadata Block Extraction

```bash
# Extract metadata from a file
grep -Pzo '(?s)<!--\s*@meta.*?-->' docs/path/to/file.md
```

### Index Generation Script

```bash
#!/bin/bash
# scripts/generate-index.sh

echo "documents:" > docs/index.yaml

for file in docs/**/*.md; do
  # Extract @meta block and parse
  meta=$(grep -Pzo '(?s)<!--\s*@meta\n(.*)-->' "$file" | head -n -1 | tail -n +2)

  if [ -n "$meta" ]; then
    echo "  - path: $file" >> docs/index.yaml
    echo "$meta" | sed 's/^/    /' >> docs/index.yaml
  fi
done
```

### Wiki-Link Validation

```bash
# Find broken wiki-links
grep -roh '\[\[[^]]*\]\]' docs/ | sort -u | while read link; do
  target=$(echo "$link" | sed 's/\[\[\(.*\)\]\]/\1/')
  if ! find docs/ -name "$target.md" -o -name "$target.yaml" | grep -q .; then
    echo "Broken: $link"
  fi
done
```

## Related Documentation

- [[THESIS-ADR-001-togaf-adaptation]] — Document types we use
- [[THESIS-ADR-002-document-hierarchy]] — Source of truth hierarchy
- [[THESIS-ADR-003-functional-requirements-detail-level]] — FR format
- [[THESIS-ADR-004-naming-and-folder-strategy]] — Folder structure and naming conventions
- [[../00-overview/goals-and-objectives]] — Explicit relationships as success criterion

