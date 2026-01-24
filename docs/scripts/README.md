# Documentation Consolidation Script

This directory contains scripts for managing and consolidating documentation for the Yieldly Trading Platform.

## Overview

The `consolidate-docs.js` script creates consolidated versions of documentation files alongside individual files. This provides two ways to access documentation:

1. **Individual Files**: Detailed, focused documents (e.g., `ADR-001.md`, `PROC-USER-001.md`)
2. **Consolidated Files**: All documents in a category combined into one file (e.g., `000-All-ADRs.md`)

### Why Consolidate?

- **Easier Reading**: Read all related documents in a single file without switching between files
- **Better Searchability**: Search across all documents in a category at once
- **Simplified Distribution**: Share a single file instead of multiple files
- **AI/LLM Context**: Feed entire documentation sets to AI tools for analysis
- **Offline Access**: Download one file for offline reading

### Naming Convention

Consolidated files are prefixed with `000-` to ensure they appear first in directory listings:
- `000-All-ADRs.md`
- `000-All-Functional-Requirements.md`
- `000-All-Processes-User-Service.md`

---

## Usage

### Generate Consolidated Files

```bash
node docs/scripts/consolidate-docs.js
```

Or from the scripts directory:

```bash
cd docs/scripts
node consolidate-docs.js
```

This will create consolidated files in the following locations:

#### Documentation Categories
- `docs/01-phase/adrs/000-All-ADRs.md`
- `docs/01-phase/functional-requirements/000-All-Functional-Requirements.md`
- `docs/01-phase/non-functional-requirements/000-All-Non-Functional-Requirements.md`

#### Process Documentation
- `docs/01-phase/processes/user-service/000-All-Processes-User-Service.md`
- `docs/01-phase/processes/strategy-service/000-All-Processes-Strategy-Service.md`
- `docs/01-phase/processes/backtesting-service/000-All-Processes-Backtesting-Service.md`
- `docs/01-phase/processes/broker-connectivity-service/000-All-Processes-Broker-Connectivity-Service.md`
- `docs/01-phase/processes/portfolio-service/000-All-Processes-Portfolio-Service.md`
- `docs/01-phase/processes/historical-data-service/000-All-Processes-Historical-Data-Service.md`
- `docs/01-phase/processes/notification-service/000-All-Processes-Notification-Service.md`

### Remove Consolidated Files

```bash
node docs/scripts/consolidate-docs.js --cleanup
# or
node docs/scripts/consolidate-docs.js -c
```

Or from the scripts directory:

```bash
cd docs/scripts
node consolidate-docs.js --cleanup
```

This will remove all generated consolidated files, leaving only the individual files.

### Show Help

```bash
node docs/scripts/consolidate-docs.js --help
# or
node docs/scripts/consolidate-docs.js -h
```

---

## Output Format

Each consolidated file contains:

1. **Header Section**
   - Title
   - Description
   - Total document count
   - Generation timestamp
   - Source directory

2. **Table of Contents**
   - Numbered list with links to each document
   - Quick navigation to any section

3. **Document Sections**
   - Each original file's content
   - Source file metadata (filename and path)
   - Horizontal separator between documents

### Example Structure

```markdown
# Architecture Decision Records (ADRs) - Consolidated

This document contains all Architecture Decision Records...

**Total Documents:** 15
**Last Generated:** 2025-11-23T10:30:00.000Z
**Source Directory:** `adrs`

---

## Table of Contents

1. [ADR-001](#adr-001)
2. [ADR-002](#adr-002)
...

---

## ADR-001: Database Selection

**Source File:** `ADR-001.md`
**Path:** `adrs/ADR-001.md`

[Original content of ADR-001.md...]

---

## ADR-002: API Gateway Pattern

**Source File:** `ADR-002.md`
**Path:** `adrs/ADR-002.md`

[Original content of ADR-002.md...]
```

---

## Configuration

The script is configured in `consolidate-docs.js` with the following structure:

### Document Categories

```javascript
categories: [
  {
    name: 'ADRs',                              // Display name
    folder: 'adrs',                            // Source folder
    pattern: /^ADR-.*\.md$/,                   // File pattern to match
    consolidatedFileName: '000-All-ADRs.md',   // Output filename
    title: 'Architecture Decision Records...',  // Document title
    description: 'This document contains...',   // Document description
    sortBy: 'alphabetical'                     // Sort order
  }
]
```

### Process Categories

Process documentation is handled separately with support for subfolders:

```javascript
processCategories: [
  {
    name: 'User Service Processes',
    folder: 'processes/user-service',
    pattern: /^PROC-USER-.*\.md$/,
    consolidatedFileName: '000-All-Processes-User-Service.md',
    title: 'User Service Processes - Consolidated',
    description: 'This document contains...',
    sortBy: 'alphabetical'
  }
]
```

### Adding New Categories

To add a new documentation category:

1. Open `scripts/consolidate-docs.js`
2. Add a new entry to `config.categories` or `config.processCategories`
3. Define the folder, pattern, and output filename
4. Run the script

---

## Sort Options

Documents can be sorted by:

- **`alphabetical`** (default): Sort by filename (A-Z)
- **`creation-date`**: Sort by file creation date (oldest first)

Configure the `sortBy` property for each category.

---

## Features

### ✅ In-Place Generation
Consolidated files are created in the same directory as source files, making them easy to find and maintain.

### ✅ Non-Destructive
The script never modifies or deletes individual files. It only creates or removes consolidated files.

### ✅ Automatic Table of Contents
Each consolidated file includes a clickable table of contents for easy navigation.

### ✅ Source Tracking
Each document section includes metadata showing the original source file.

### ✅ Process Title Extraction
For process documentation, the script extracts the process title from the content for better headings.

### ✅ Error Handling
Gracefully handles missing directories, unreadable files, and other errors.

### ✅ Cleanup Mode
Easy removal of all consolidated files with `--cleanup` flag.

---

## Best Practices

### When to Consolidate

Run the consolidation script:
- After adding new documentation files
- Before major reviews or presentations
- When sharing documentation with external parties
- Periodically (e.g., weekly) to keep consolidated files up to date

### When to Use Consolidated Files

Use consolidated files when:
- Reading through all related documentation
- Searching across multiple documents
- Sharing documentation externally
- Feeding to AI/LLM tools for analysis
- Creating PDF exports

### When to Use Individual Files

Use individual files when:
- Editing or updating documentation
- Reviewing specific documents
- Tracking changes in version control
- Working on focused areas

### Git Workflow

**Option 1: Commit Consolidated Files (Recommended)**
```bash
# Generate consolidated files
node scripts/consolidate-docs.js

# Commit both individual and consolidated files
git add docs/
git commit -m "Update documentation and regenerate consolidated files"
```

**Option 2: Ignore Consolidated Files**
```bash
# Add to .gitignore
echo "000-All-*.md" >> .gitignore

# Developers run consolidation locally when needed
node scripts/consolidate-docs.js
```

We recommend **Option 1** to ensure consolidated files are always available in the repository.

---

## Integration

### Pre-commit Hook

Automatically regenerate consolidated files before commits:

```bash
# .husky/pre-commit or .git/hooks/pre-commit
#!/bin/sh
node docs/scripts/consolidate-docs.js
git add docs/**/*000-All-*.md
```

### CI/CD Pipeline

Add to your CI/CD workflow:

```yaml
# GitHub Actions example
- name: Generate consolidated documentation
  run: node docs/scripts/consolidate-docs.js

- name: Check for changes
  run: git diff --exit-code || (echo "Consolidated docs need updating" && exit 1)
```

### npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "docs:consolidate": "node docs/scripts/consolidate-docs.js",
    "docs:cleanup": "node docs/scripts/consolidate-docs.js --cleanup",
    "docs:help": "node docs/scripts/consolidate-docs.js --help"
  }
}
```

Then run:
```bash
npm run docs:consolidate
npm run docs:cleanup
```

---

## Troubleshooting

### Issue: Script fails with "Directory does not exist"

**Solution**: Ensure the documentation directories exist:
```bash
mkdir -p docs/01-phase/adrs
mkdir -p docs/01-phase/functional-requirements
mkdir -p docs/01-phase/processes/user-service
```

### Issue: No files found matching pattern

**Solution**: Check that your files match the pattern defined in config:
- ADRs should start with `ADR-`
- Functional Requirements should start with `FR-`
- Process files should start with `PROC-USER-`, `PROC-STRATEGY-`, etc.

### Issue: Consolidated file is empty

**Solution**: Ensure individual files have content and are readable. Check file permissions.

### Issue: Table of contents links don't work

**Solution**: The script generates GitHub-flavored markdown anchors. Ensure your markdown viewer supports anchor links.

---

## Examples

### Example Output

After running `node docs/scripts/consolidate-docs.js`:

```
======================================================================
Document Consolidation Script
======================================================================
Base Path: D:\GitHub\yieldly_trading_platform\docs\01-phase
Output Mode: In-place (consolidated files in source directories)
======================================================================

📄 Processing Document Categories:

ADRs:
  Found 15 files
  ✓ Created: adrs/000-All-ADRs.md
  ✓ Size: 145.32 KB

Functional Requirements:
  Found 28 files
  ✓ Created: functional-requirements/000-All-Functional-Requirements.md
  ✓ Size: 256.78 KB

⚙️  Processing Process Documentation:

User Service Processes:
  Found 15 files
  ✓ Created: processes/user-service/000-All-Processes-User-Service.md
  ✓ Size: 89.45 KB

Strategy Service Processes:
  Found 17 files
  ✓ Created: processes/strategy-service/000-All-Processes-Strategy-Service.md
  ✓ Size: 102.67 KB

======================================================================
✅ Consolidation Complete!
======================================================================

Consolidated files are named with "000-" prefix to appear first
in directory listings alongside individual files.
```

---

## Contributing

When adding new documentation types:

1. Add configuration to `config.categories` or `config.processCategories`
2. Follow the naming convention: `000-All-[Category-Name].md`
3. Use descriptive patterns to match files
4. Test the consolidation before committing
5. Update this README with the new category

---

## License

This script is part of the Yieldly Trading Platform documentation tooling.

---

## Support

For issues or questions:
- Check this README first
- Review the script's inline comments
- Run `node scripts/consolidate-docs.js --help`
- Contact the Platform Architecture Team

---

**Last Updated:** 2025-11-23
**Version:** 2.0
**Maintainer:** Platform Architecture Team
