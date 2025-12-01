#!/usr/bin/env bun
/**
 * Script to initialize Qdrant hybrid collection and index all tools
 *
 * Usage:
 *   bun run scripts/setup-qdrant.ts
 *   bun run scripts/setup-qdrant.ts --force  # Recreate collection even if exists
 */

import { prisma } from "~/services/prisma"
import {
  QDRANT_HYBRID_COLLECTION,
  QDRANT_DENSE_VECTOR_SIZE,
  qdrantClient,
} from "~/services/qdrant"
import { reindexAllHybridTools } from "~/lib/vector-store"

const FORCE_RECREATE = process.argv.includes("--force")

async function createHybridCollection() {
  console.log(`📝 Creating collection "${QDRANT_HYBRID_COLLECTION}"...`)
  await qdrantClient.createCollection(QDRANT_HYBRID_COLLECTION, {
    vectors: {
      dense: {
        size: QDRANT_DENSE_VECTOR_SIZE,
        distance: "Cosine",
      },
    },
    sparse_vectors: {
      sparse: {
        index: {
          on_disk: false,
        },
      },
    },
  })
  console.log(`✅ Collection created with:`)
  console.log(`   - Dense vectors: ${QDRANT_DENSE_VECTOR_SIZE} dimensions (Cosine)`)
  console.log(`   - Sparse vectors: BM25-style (in-memory index)`)
}

async function main() {
  console.log("🚀 Qdrant Setup Script")
  console.log("=".repeat(50))

  // Step 1: Check if collection exists
  console.log("\n📦 Checking Qdrant collection...")
  const existsResult = await qdrantClient.collectionExists(QDRANT_HYBRID_COLLECTION)
  const exists = typeof existsResult === "boolean" ? existsResult : existsResult?.exists

  if (exists && !FORCE_RECREATE) {
    console.log(`✅ Collection "${QDRANT_HYBRID_COLLECTION}" already exists`)

    // Get collection info
    const info = await qdrantClient.getCollection(QDRANT_HYBRID_COLLECTION)
    console.log(`   - Points count: ${info.points_count}`)
    console.log(`   - Vectors count: ${info.vectors_count}`)

    const shouldReindex = await askForReindex()
    if (!shouldReindex) {
      console.log("\n👋 Exiting without changes")
      process.exit(0)
    }
  } else if (exists && FORCE_RECREATE) {
    console.log(`⚠️  Force recreating collection "${QDRANT_HYBRID_COLLECTION}"...`)
    await qdrantClient.deleteCollection(QDRANT_HYBRID_COLLECTION)
    await createHybridCollection()
  } else {
    await createHybridCollection()
  }

  // Step 2: Count tools to index
  console.log("\n📊 Counting published tools...")
  const toolCount = await prisma.tool.count({
    where: { publishedAt: { lte: new Date() } },
  })
  console.log(`   Found ${toolCount} published tools to index`)

  if (toolCount === 0) {
    console.log("\n⚠️  No tools to index. Exiting.")
    process.exit(0)
  }

  // Step 3: Index all tools
  console.log("\n🔄 Indexing tools to hybrid collection...")
  console.log("   This may take a while depending on the number of tools...\n")

  const startTime = Date.now()
  let lastProgressUpdate = 0

  const result = await reindexAllHybridTools(progress => {
    const now = Date.now()
    // Update progress every 500ms or when complete
    if (now - lastProgressUpdate > 500 || progress.processed === progress.total) {
      const percent = Math.round((progress.processed / progress.total) * 100)
      const bar = "█".repeat(Math.floor(percent / 2)) + "░".repeat(50 - Math.floor(percent / 2))
      process.stdout.write(`\r   [${bar}] ${percent}% (${progress.processed}/${progress.total})`)
      lastProgressUpdate = now
    }
  })

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log("\n")

  // Step 4: Report results
  console.log("=".repeat(50))
  console.log("📈 Indexing Complete!")
  console.log(`   ✅ Processed: ${result.processed}/${result.total}`)
  console.log(`   ⏱️  Duration: ${duration}s`)

  if (result.failed.length > 0) {
    console.log(`   ❌ Failed: ${result.failed.length}`)
    console.log(`      Failed tools: ${result.failed.slice(0, 5).join(", ")}${result.failed.length > 5 ? "..." : ""}`)
  }

  // Verify final state
  const finalInfo = await qdrantClient.getCollection(QDRANT_HYBRID_COLLECTION)
  console.log(`\n📦 Final collection state:`)
  console.log(`   - Points: ${finalInfo.points_count}`)
  console.log(`   - Status: ${finalInfo.status}`)

  console.log("\n✨ Done!")
}

async function askForReindex(): Promise<boolean> {
  // In non-interactive mode, default to reindexing
  if (!process.stdin.isTTY) {
    return true
  }

  return new Promise(resolve => {
    process.stdout.write("\n❓ Do you want to reindex all tools? (y/N): ")

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once("data", data => {
      const answer = data.toString().trim().toLowerCase()
      process.stdin.setRawMode(false)
      console.log(answer)
      resolve(answer === "y" || answer === "yes")
    })
  })
}

// Run the script
main()
  .catch(error => {
    console.error("\n❌ Error:", error.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
