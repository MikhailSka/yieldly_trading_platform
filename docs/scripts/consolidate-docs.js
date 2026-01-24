const fs = require('fs');
const path = require('path');

/**
 * Configuration for document consolidation
 *
 * This script creates consolidated documentation files alongside individual files.
 * Files named with "000-" prefix ensure they appear first in directory listings.
 *
 * Output mode: 'in-place' - Creates consolidated files in source directories
 */
const config = {
  docsBasePath: path.join(__dirname, '..', '01-phase'),

  categories: [
    {
      name: 'ADRs',
      folder: 'adrs',
      pattern: /^ADR-.*\.md$/,
      consolidatedFileName: '000-All-ADRs.md',
      title: 'Architecture Decision Records (ADRs) - Consolidated',
      description: 'This document contains all Architecture Decision Records for the Yieldly Trading Platform.',
      sortBy: 'alphabetical' // or 'creation-date'
    },
    {
      name: 'Functional Requirements',
      folder: 'functional-requirements',
      pattern: /^FR-.*\.md$/,
      consolidatedFileName: '000-All-Functional-Requirements.md',
      title: 'Functional Requirements - Consolidated',
      description: 'This document contains all Functional Requirements for the Yieldly Trading Platform.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Non-Functional Requirements',
      folder: 'non-functional-requirements',
      pattern: /^NFR-.*\.md$/,
      consolidatedFileName: '000-All-Non-Functional-Requirements.md',
      title: 'Non-Functional Requirements - Consolidated',
      description: 'This document contains all Non-Functional Requirements for the Yieldly Trading Platform.',
      sortBy: 'alphabetical'
    }
  ],

  // Process documentation with subfolders
  processCategories: [
    {
      name: 'User Service Processes',
      folder: 'processes/user-service',
      pattern: /^PROC-USER-.*\.md$/,
      consolidatedFileName: '000-All-Processes-User-Service.md',
      title: 'User Service Processes - Consolidated',
      description: 'This document contains all process documentation for the User Service.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Strategy Service Processes',
      folder: 'processes/strategy-service',
      pattern: /^PROC-(STRATEGY|INDICATOR)-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Strategy-Service.md',
      title: 'Strategy Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Strategy Service (including indicators).',
      sortBy: 'alphabetical'
    },
    {
      name: 'Backtesting Service Processes',
      folder: 'processes/backtesting-service',
      pattern: /^PROC-BACKTEST-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Backtesting-Service.md',
      title: 'Backtesting Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Backtesting Service.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Broker Connectivity Service Processes',
      folder: 'processes/broker-connectivity-service',
      pattern: /^PROC-BROKER-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Broker-Connectivity-Service.md',
      title: 'Broker Connectivity Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Broker Connectivity Service.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Portfolio Service Processes',
      folder: 'processes/portfolio-service',
      pattern: /^PROC-PORTFOLIO-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Portfolio-Service.md',
      title: 'Portfolio Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Portfolio Service.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Historical Data Service Processes',
      folder: 'processes/historical-data-service',
      pattern: /^PROC-HISTORICAL-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Historical-Data-Service.md',
      title: 'Historical Data Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Historical Data Service.',
      sortBy: 'alphabetical'
    },
    {
      name: 'Notification Service Processes',
      folder: 'processes/notification-service',
      pattern: /^PROC-NOTIF(Y)?-.*\.md$/,
      consolidatedFileName: '000-All-Processes-Notification-Service.md',
      title: 'Notification Service Processes - Consolidated',
      description: 'This document contains all process documentation for the Notification Service.',
      sortBy: 'alphabetical'
    }
  ]
};

/**
 * Read all files from a directory matching a pattern
 */
function getMatchingFiles(dirPath, pattern) {
  try {
    if (!fs.existsSync(dirPath)) {
      console.warn(`  ⚠ Directory does not exist: ${dirPath}`);
      return [];
    }

    const files = fs.readdirSync(dirPath);
    return files
      .filter(file => pattern.test(file))
      .map(file => path.join(dirPath, file))
      .sort(); // Sort alphabetically for consistent ordering
  } catch (error) {
    console.error(`  ✗ Error reading directory ${dirPath}:`, error.message);
    return [];
  }
}

/**
 * Read and process a single file
 */
function readFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const stats = fs.statSync(filePath);
    return {
      fileName,
      content,
      filePath,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  } catch (error) {
    console.error(`  ✗ Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Generate table of contents from files
 */
function generateTableOfContents(files) {
  const toc = ['## Table of Contents\n'];

  files.forEach((file, index) => {
    const fileName = path.basename(file.fileName, '.md');
    const anchor = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    toc.push(`${index + 1}. [${fileName}](#${anchor})`);
  });

  toc.push('\n---\n');
  return toc.join('\n');
}

/**
 * Extract process title from markdown content
 */
function extractProcessTitle(content) {
  // Look for the first heading (### or ##)
  const match = content.match(/^###?\s+(.+)$/m);
  return match ? match[1] : null;
}

/**
 * Consolidate files into a single document
 */
function consolidateCategory(category) {
  console.log(`\n${category.name}:`);

  const sourceDir = path.join(config.docsBasePath, category.folder);
  const filePaths = getMatchingFiles(sourceDir, category.pattern);

  if (filePaths.length === 0) {
    console.log(`  ⚠ No files found matching pattern ${category.pattern}`);
    return;
  }

  console.log(`  Found ${filePaths.length} files`);

  // Read all files
  const files = filePaths
    .map(readFile)
    .filter(file => file !== null);

  if (files.length === 0) {
    console.log(`  ✗ No files could be read`);
    return;
  }

  // Sort files based on configuration
  if (category.sortBy === 'creation-date') {
    files.sort((a, b) => a.createdAt - b.createdAt);
  }
  // Default is alphabetical (already sorted)

  // Build consolidated document
  const sections = [
    `# ${category.title}\n`,
    `${category.description}\n`,
    `**Total Documents:** ${files.length}  `,
    `**Last Generated:** ${new Date().toISOString()}  `,
    `**Source Directory:** \`${category.folder}\`\n`,
    '\n---\n',
    generateTableOfContents(files)
  ];

  // Add each file's content
  files.forEach((file, index) => {
    const fileName = path.basename(file.fileName, '.md');
    const separator = index < files.length - 1 ? '\n---\n' : '';

    // Try to extract title from content for processes
    const processTitle = extractProcessTitle(file.content);
    const heading = processTitle || fileName;

    sections.push(
      `## ${heading}\n`,
      `**Source File:** \`${file.fileName}\`  `,
      `**Path:** \`${path.relative(config.docsBasePath, file.filePath)}\`\n`,
      file.content,
      separator
    );
  });

  // Write consolidated file in the same directory
  const outputPath = path.join(sourceDir, category.consolidatedFileName);
  const consolidatedContent = sections.join('\n');
  fs.writeFileSync(outputPath, consolidatedContent, 'utf8');

  const sizeKB = (consolidatedContent.length / 1024).toFixed(2);
  console.log(`  ✓ Created: ${path.relative(config.docsBasePath, outputPath)}`);
  console.log(`  ✓ Size: ${sizeKB} KB`);
}

/**
 * Main execution
 */
function main() {
  console.log('='.repeat(70));
  console.log('Document Consolidation Script');
  console.log('='.repeat(70));
  console.log(`Base Path: ${config.docsBasePath}`);
  console.log(`Output Mode: In-place (consolidated files in source directories)`);
  console.log('='.repeat(70));

  // Process regular categories (ADRs, FRs, NFRs)
  console.log('\n📄 Processing Document Categories:');
  config.categories.forEach(consolidateCategory);

  // Process process documentation categories
  console.log('\n⚙️  Processing Process Documentation:');
  config.processCategories.forEach(consolidateCategory);

  console.log('\n' + '='.repeat(70));
  console.log('✅ Consolidation Complete!');
  console.log('='.repeat(70));
  console.log('\nConsolidated files are named with "000-" prefix to appear first');
  console.log('in directory listings alongside individual files.\n');
}

/**
 * Clean up - Remove all consolidated files
 */
function cleanup() {
  console.log('='.repeat(70));
  console.log('Cleanup: Removing Consolidated Files');
  console.log('='.repeat(70));

  let removedCount = 0;

  const allCategories = [...config.categories, ...config.processCategories];

  allCategories.forEach(category => {
    const sourceDir = path.join(config.docsBasePath, category.folder);
    const consolidatedPath = path.join(sourceDir, category.consolidatedFileName);

    if (fs.existsSync(consolidatedPath)) {
      fs.unlinkSync(consolidatedPath);
      console.log(`  ✓ Removed: ${path.relative(config.docsBasePath, consolidatedPath)}`);
      removedCount++;
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Cleanup Complete! Removed ${removedCount} files.`);
  console.log('='.repeat(70));
}

// Run the script
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--cleanup') || args.includes('-c')) {
    cleanup();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node consolidate-docs.js [options]

Options:
  (no args)         Run consolidation (default)
  --cleanup, -c     Remove all consolidated files
  --help, -h        Show this help message

Description:
  This script consolidates individual markdown files into single documents
  for easier reading and distribution. Consolidated files are created in
  the same directory as source files with "000-" prefix.

Examples:
  node consolidate-docs.js           # Create consolidated files
  node consolidate-docs.js --cleanup # Remove consolidated files
    `);
  } else {
    main();
  }
}

module.exports = { consolidateCategory, cleanup, config };
