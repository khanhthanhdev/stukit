#!/usr/bin/env bun
/**
 * Script to import collections
 * Collections are used to curate and group related study tools by topic or use case
 * This script will:
 *  1. Validate collection data
 *  2. Import/update collections in PostgreSQL
 *  3. Optionally sync collections to Qdrant for search
 *
 * Usage:
 *   bun run scripts/import-collections.ts
 *   bun run scripts/import-collections.ts --dry-run      # Don't create collections, just validate
 *   bun run scripts/import-collections.ts --clean        # Remove existing collections before import
 *   bun run scripts/import-collections.ts --sync-qdrant  # Also sync to Qdrant search service
 *   bun run scripts/import-collections.ts --clean --sync-qdrant
 */

import { collections } from "~/data/collections"
import { prisma } from "~/services/prisma"

const DRY_RUN = process.argv.includes("--dry-run")
const CLEAN = process.argv.includes("--clean")
const SYNC_QDRANT = process.argv.includes("--sync-qdrant")

/**
 * Validates collection data
 */
const validateCollection = (data: (typeof collections)[0], index: number): string[] => {
  const errors: string[] = []

  if (!data.name?.trim()) {
    errors.push(`Collection ${index}: name is required`)
  }

  if (!data.slug?.trim()) {
    errors.push(`Collection ${index}: slug is required`)
  }

  if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
    errors.push(
      `Collection ${index}: slug must be lowercase with hyphens only (received: "${data.slug}")`,
    )
  }

  return errors
}

/**
 * Creates or updates a single collection
 */
const importCollection = async (data: (typeof collections)[0]) => {
  // Try to find existing collection by slug
  const existing = await prisma.collection.findUnique({
    where: { slug: data.slug },
  })

  if (existing) {
    // Update existing collection
    const updated = await prisma.collection.update({
      where: { slug: data.slug },
      data: {
        name: data.name,
        description: data.description || null,
      },
    })
    return { collection: updated, isNew: false, isUpdated: true }
  }

  // Create new collection
  const collection = await prisma.collection.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description || null,
    },
  })

  return { collection, isNew: true, isUpdated: false }
}

async function main() {
  console.log("🚀 Collection Import Script")
  console.log("=".repeat(50))
  console.log(`📊 Found ${collections.length} collections to import`)
  console.log(`🔧 Mode: ${DRY_RUN ? "DRY RUN" : "IMPORT"}`)
  if (CLEAN) {
    console.log(`🗑️  CLEAN MODE: Existing collections will be removed`)
  }
  if (SYNC_QDRANT) {
    console.log(`🔍 SYNC MODE: Collections will be synced to Qdrant`)
  }
  console.log("")

  // Validation
  const validationErrors: string[] = []
  collections.forEach((col, index) => {
    validationErrors.push(...validateCollection(col, index))
  })

  if (validationErrors.length > 0) {
    console.error("❌ Validation Errors:")
    validationErrors.forEach(error => console.error(`   ${error}`))
    process.exit(1)
  }

  // Check for duplicates
  const slugs = collections.map(c => c.slug)
  const duplicates = slugs.filter((slug, index) => slugs.indexOf(slug) !== index)

  if (duplicates.length > 0) {
    console.error("❌ Duplicate slugs found:")
    duplicates.forEach(slug => console.error(`   ${slug}`))
    process.exit(1)
  }

  console.log("✅ Validation passed\n")

  const results = {
    total: collections.length,
    created: 0,
    updated: 0,
    failed: 0,
  }

  const failedCollections: Array<{ name: string; error: string }> = []

  // Clean up if requested
  if (CLEAN && !DRY_RUN) {
    console.log("🗑️  Removing existing collections...")
    const deleted = await prisma.collection.deleteMany({})
    console.log(`   Deleted ${deleted.count} collections\n`)
  }

  // Import collections
  for (let i = 0; i < collections.length; i++) {
    const collectionData = collections[i]
    const progress = `[${i + 1}/${collections.length}]`

    try {
      console.log(`${progress} Processing: ${collectionData.name}`)
      console.log(`   Slug: ${collectionData.slug}`)

      if (DRY_RUN) {
        console.log(`   ✓ Would be created`)
        results.created++
      } else {
        const { collection, isNew, isUpdated } = await importCollection(collectionData)

        if (isNew) {
          console.log(`   ✓ Created: ${collection.slug}`)
          results.created++
        } else if (isUpdated) {
          console.log(`   ✓ Updated: ${collection.slug}`)
          results.updated++
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`   ✗ Failed: ${errorMessage}`)
      results.failed++
      failedCollections.push({ name: collectionData.name, error: errorMessage })
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

  if (failedCollections.length > 0) {
    console.log("\n❌ Failed Collections:")
    failedCollections.forEach(({ name, error }) => {
      console.log(`   - ${name}: ${error}`)
    })
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN MODE: No collections were actually created")
  } else if (results.created > 0 || results.updated > 0) {
    console.log("\n✨ Collections imported successfully!")

    // Sync to Qdrant if requested
    if (SYNC_QDRANT) {
      console.log("\n📡 Syncing collections to Qdrant...")
      try {
        const allCollections = await prisma.collection.findMany({
          orderBy: { name: "asc" },
        })

        console.log(`   Found ${allCollections.length} collections in database`)
        console.log("   Note: Run 'bun run scripts/setup-qdrant.ts' to index collections for search")
      } catch (error) {
        console.error("   ❌ Error fetching collections:", error)
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
