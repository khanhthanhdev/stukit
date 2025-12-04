#!/usr/bin/env bun
/**
 * Script to import categories and sync with Qdrant
 * Categories are used to organize and group related study tools
 * This script will:
 *  1. Validate category data
 *  2. Import/update categories in PostgreSQL
 *  3. Ensure Qdrant categories collection exists
 *  4. Optionally sync categories to Qdrant for search
 *
 * Usage:
 *   bun run scripts/import-categories.ts
 *   bun run scripts/import-categories.ts --dry-run      # Don't create categories, just validate
 *   bun run scripts/import-categories.ts --clean        # Remove existing categories before import
 *   bun run scripts/import-categories.ts --sync-qdrant  # Also sync to Qdrant search service
 *   bun run scripts/import-categories.ts --clean --sync-qdrant
 */

import { categories } from "~/data/categories"
import { prisma } from "~/services/prisma"
import { ensureCategoriesCollection } from "~/services/qdrant"

const DRY_RUN = process.argv.includes("--dry-run")
const CLEAN = process.argv.includes("--clean")
const SYNC_QDRANT = process.argv.includes("--sync-qdrant")

/**
 * Validates category data
 */
const validateCategory = (data: (typeof categories)[0], index: number): string[] => {
  const errors: string[] = []

  if (!data.name?.trim()) {
    errors.push(`Category ${index}: name is required`)
  }

  if (!data.slug?.trim()) {
    errors.push(`Category ${index}: slug is required`)
  }

  if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
    errors.push(
      `Category ${index}: slug must be lowercase with hyphens only (received: "${data.slug}")`,
    )
  }

  return errors
}

/**
 * Creates or updates a single category
 */
const importCategory = async (data: (typeof categories)[0]) => {
  // Try to find existing category by slug
  const existing = await prisma.category.findUnique({
    where: { slug: data.slug },
  })

  if (existing) {
    // Update existing category
    const updated = await prisma.category.update({
      where: { slug: data.slug },
      data: {
        name: data.name,
        label: data.label || null,
        description: data.description || null,
      },
    })
    return { category: updated, isNew: false, isUpdated: true }
  }

  // Create new category
  const category = await prisma.category.create({
    data: {
      name: data.name,
      slug: data.slug,
      label: data.label || null,
      description: data.description || null,
    },
  })

  return { category, isNew: true, isUpdated: false }
}

async function main() {
  console.log("🚀 Category Import Script")
  console.log("=".repeat(50))
  console.log(`📊 Found ${categories.length} categories to import`)
  console.log(`🔧 Mode: ${DRY_RUN ? "DRY RUN" : "IMPORT"}`)
  if (CLEAN) {
    console.log(`🗑️  CLEAN MODE: Existing categories will be removed`)
  }
  if (SYNC_QDRANT) {
    console.log(`🔍 SYNC MODE: Categories will be synced to Qdrant`)
  }
  console.log("")

  // Ensure Qdrant collection exists if syncing
  if (SYNC_QDRANT && !DRY_RUN) {
    try {
      console.log("📡 Ensuring Qdrant categories collection exists...")
      await ensureCategoriesCollection()
      console.log("✅ Qdrant collection ready\n")
    } catch (error) {
      console.error("❌ Failed to ensure Qdrant collection:", error)
      process.exit(1)
    }
  }

  // Validation
  const validationErrors: string[] = []
  categories.forEach((cat, index) => {
    validationErrors.push(...validateCategory(cat, index))
  })

  if (validationErrors.length > 0) {
    console.error("❌ Validation Errors:")
    validationErrors.forEach(error => console.error(`   ${error}`))
    process.exit(1)
  }

  // Check for duplicates
  const slugs = categories.map(c => c.slug)
  const duplicates = slugs.filter((slug, index) => slugs.indexOf(slug) !== index)

  if (duplicates.length > 0) {
    console.error("❌ Duplicate slugs found:")
    duplicates.forEach(slug => console.error(`   ${slug}`))
    process.exit(1)
  }

  console.log("✅ Validation passed\n")

  const results = {
    total: categories.length,
    created: 0,
    updated: 0,
    failed: 0,
  }

  const failedCategories: Array<{ name: string; error: string }> = []

  // Clean up if requested
  if (CLEAN && !DRY_RUN) {
    console.log("🗑️  Removing existing categories...")
    const deleted = await prisma.category.deleteMany({})
    console.log(`   Deleted ${deleted.count} categories\n`)
  }

  // Import categories
  for (let i = 0; i < categories.length; i++) {
    const categoryData = categories[i]
    const progress = `[${i + 1}/${categories.length}]`

    try {
      console.log(`${progress} Processing: ${categoryData.name}`)
      console.log(`   Slug: ${categoryData.slug}`)

      if (DRY_RUN) {
        console.log(`   ✓ Would be created`)
        results.created++
      } else {
        const { category, isNew, isUpdated } = await importCategory(categoryData)

        if (isNew) {
          console.log(`   ✓ Created: ${category.slug}`)
          results.created++
        } else if (isUpdated) {
          console.log(`   ✓ Updated: ${category.slug}`)
          results.updated++
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`   ✗ Failed: ${errorMessage}`)
      results.failed++
      failedCategories.push({ name: categoryData.name, error: errorMessage })
    }

    console.log("")
  }

  // Summary
  console.log("=".repeat(50))
  console.log("📈 Import Summary")
  console.log(`   Total: ${results.total}`)
  console.log(`   ✅ Created: ${results.created}`)
  if (results.updated > 0) {
    console.log(`   ↻ Updated: ${results.updated}`)
  }
  console.log(`   ❌ Failed: ${results.failed}`)

  if (failedCategories.length > 0) {
    console.log("\n❌ Failed Categories:")
    failedCategories.forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error}`)
    })
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN MODE: No categories were actually created")
  } else if (results.created > 0 || results.updated > 0) {
    console.log("\n✨ Categories imported successfully!")

    // Sync to Qdrant if requested
    if (SYNC_QDRANT) {
      console.log("\n📡 Syncing categories to Qdrant...")
      try {
        const allCategories = await prisma.category.findMany({
          orderBy: { name: "asc" },
        })

        console.log(`   Found ${allCategories.length} categories in database`)
        console.log("   Note: Run 'bun run scripts/setup-qdrant.ts' to index categories for search")
      } catch (error) {
        console.error("   ❌ Error fetching categories:", error)
      }
    }
  }

  console.log("")
}

// Run the script
main()
  .catch(error => {
    console.error("\n❌ Fatal Error:", error instanceof Error ? error.message : error)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
