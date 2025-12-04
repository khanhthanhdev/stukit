Advanced RAG Best Practices: Qdrant & Gemini Architecture (TypeScript)

This guide outlines the state-of-the-art architecture for building an AI Knowledge Cloud using Retrieval Augmented Generation (RAG). It uses TypeScript, the Vercel AI SDK, and Qdrant.

🏗️ The Architecture

The core philosophy is "Route, Transform, Retrieve." We do not blindly send every user query to the vector database.

graph TD
    User[User Query] --> Router{Query Router<br/>(Gemini 2.5 Flash)}
    
    Router -->|Intent: Recommendation| Expander[Query Expander]
    Router -->|Intent: Comparison| Decomposer[Query Decomposition]
    Router -->|Intent: Search| FilterExt[Metadata Extractor]
    
    Expander --> HybridSearch[Qdrant Hybrid Search<br/>(Dense + Sparse)]
    Decomposer --> MultiSearch[Multi-Step Retrieval]
    FilterExt --> FilteredSearch[Qdrant Search + Filters]
    
    HybridSearch --> Context
    MultiSearch --> Context
    FilteredSearch --> Context
    
    Context --> Generator[Answer Generation<br/>(Gemini 2.5 Flash)]
    Generator --> Final[Final Response]


🛠️ Prerequisites & Tech Stack

Runtime: Node.js / TypeScript

LLM: gemini-2.5-flash (via Vercel AI SDK).

Embeddings: gemini-embedding-001 (via Vercel AI SDK).

Vector DB: Qdrant (Native Hybrid Search).

Sparse Vectors: fastembed (Local sparse vector generation).

Installation:

npm install ai @ai-sdk/google @qdrant/js-client-rest fastembed zod


1. The Query Router

See lib/fused-query-router.ts for the fused implementation using Gemini 2.5 Flash and generateObject.

2. Pre-Retrieval Strategies (TypeScript)

A. Query Expansion (For "Recommendation")

Users often use vague terms. We expand their query to include synonyms and technical terms using Gemini 2.5 Flash.

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function expandQuery(userTask: string) {
  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: `
      You are an AI search optimizer. Generate 5 relevant search keywords or short phrases 
      for the user's task. Return them as a comma-separated string, nothing else.
      
      User Task: "${userTask}"
      Keywords:
    `,
  });
  
  return `${userTask}, ${text}`;
}


B. Query Decomposition (For "Comparison")

Standard search fails at comparison because it retrieves a mix of documents. Decomposition splits the query to ensure we fetch data for both entities.

import { generateObject } from 'ai';
import { z } from 'zod';

export async function decomposeComparison(query: string) {
  const { object } = await generateObject({
    model: google('gemini-2.5-flash'),
    schema: z.object({
      toolNames: z.array(z.string()).describe("The exact names of tools being compared"),
    }),
    prompt: `Identify the entity names (tools) being compared in this query: "${query}"`,
  });

  return object.toolNames; 
}


3. Qdrant Hybrid Search (The Engine)

Hybrid search combines Dense Vectors (Semantic meaning) with Sparse Vectors (Exact Keyword match).

Step 1: Client Setup

Configure the Qdrant client and the embedding models.

import { QdrantClient } from '@qdrant/js-client-rest';
import { embed } from 'ai';
import { google } from '@ai-sdk/google';
import { FastEmbed } from 'fastembed'; // Sparse vector generation

const client = new QdrantClient({ url: 'http://localhost:6333', apiKey: 'YOUR_KEY' });

// Initialize FastEmbed for Sparse Vectors (SPLADE/BM25)
const sparseModel = await FastEmbed.init({ 
  model: 'prithivida/Splade_PP_en_v1' // Standard SPLADE model
});


Step 2: Create Collection

We configure the collection to support both vector types.

async function createCollection() {
  await client.createCollection('ai_tools', {
    vectors: {
      dense: {
        size: 1536, // gemini-embedding-001 size
        distance: 'Cosine',
      },
    },
    sparse_vectors: {
      sparse: {
        index: {
          on_disk: false, // Keep in RAM for speed
        },
      },
    },
  });
}


Step 3: Ingestion (Adding Data)

We must generate Dense (Gemini) and Sparse (FastEmbed) vectors for each document.
Crucial: We use taskType: 'RETRIEVAL_DOCUMENT' for ingestion.

async function addToolToDb(tool: { id: string; name: string; description: string }) {
  const content = `${tool.name} ${tool.description}`;

  // 1. Generate Dense Vector (Gemini)
  const { embedding: denseVector } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-001', {
      taskType: 'RETRIEVAL_DOCUMENT', // OPTIMIZED FOR STORAGE
    }),
    value: content,
  });

  // 2. Generate Sparse Vector (FastEmbed)
  // fastembed returns an async generator or array
  const sparseEmbedding = await sparseModel.embed(content); 
  // Need to extract indices/values from the first result
  const sparseVector = sparseEmbedding[0]; 

  // 3. Upsert to Qdrant
  await client.upsert('ai_tools', {
    points: [
      {
        id: tool.id,
        payload: tool,
        vector: {
          dense: denseVector,
          sparse: {
            indices: Array.from(sparseVector.indices),
            values: Array.from(sparseVector.values),
          },
        },
      },
    ],
  });
}


Step 4: Performing Hybrid Search

We use Qdrant's prefetch and fusion API (RRF).
Crucial: We use taskType: 'RETRIEVAL_QUERY' for the search query.

export async function hybridSearch(userQuery: string) {
  // 1. Generate Query Vectors
  const { embedding: denseQuery } = await embed({
    model: google.textEmbeddingModel('gemini-embedding-001', {
      taskType: 'RETRIEVAL_QUERY', // OPTIMIZED FOR SEARCHING
    }),
    value: userQuery,
  });

  const sparseResult = await sparseModel.embed(userQuery);
  const sparseQuery = sparseResult[0];

  // 2. Execute Hybrid Search (RRF)
  const results = await client.query('ai_tools', {
    prefetch: [
      {
        query: denseQuery,
        using: 'dense',
        limit: 20,
      },
      {
        query: {
            indices: Array.from(sparseQuery.indices),
            values: Array.from(sparseQuery.values),
        },
        using: 'sparse',
        limit: 20,
      },
    ],
    query: {
      fusion: 'rrf', // Reciprocal Rank Fusion
    },
    limit: 5,
  });

  return results.points.map((pt) => pt.payload);
}


4. Best Practices Summary

Feature

Best Practice

Why?

Task Types

Always set taskType

Google embeddings perform significantly better when you distinguish between RETRIEVAL_DOCUMENT (ingestion) and RETRIEVAL_QUERY (search).

Hybrid Search

Always Enable

Dense vectors fail at exact SKUs or unique names (e.g., "Grok 2"). Sparse catches these.

Fusion Algorithm

RRF

It doesn't require tuning weights like "0.7 dense + 0.3 sparse". It works robustly out of the box.

Routing

Use temperature: 0

The Router needs to be deterministic. Do not use creative settings for classification.

5. Main Pipeline

import { routeQuery } from './src/router';

async function main(userInput: string) {
  // 1. Route
  const { intent } = await routeQuery(userInput);
  console.log(`Intent: ${intent}`);

  let context: any[] = [];

  // 2. Execute Strategy
  if (intent === 'recommendation') {
    const expanded = await expandQuery(userInput);
    context = await hybridSearch(expanded);
  } else if (intent === 'comparison') {
    const tools = await decomposeComparison(userInput);
    // Fetch specific tools by name (omitted for brevity)
  }

  // 3. Generate Answer
  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: `Answer based on: ${JSON.stringify(context)}. Question: ${userInput}`,
  });
  
  return text;
}

---

## 6. Alternatives and Categories Search

The system extends Qdrant hybrid search to alternatives and categories, providing semantic search capabilities beyond tools.

### Collections

The system maintains three separate Qdrant collections:
- **Tools Collection** (`tools`): Main tool search with hybrid vectors
- **Alternatives Collection** (`alternatives`): Alternative tool recommendations
- **Categories Collection** (`categories`): Category taxonomy search

All collections use the same hybrid architecture (dense + sparse vectors) for consistency.

### Alternatives Search

Alternatives are indexed with their name, description, and related tool metadata. The search function uses the same hybrid search pattern as tools.

```typescript
import { searchAlternativeVectors } from '~/lib/vector-store';

// Search alternatives with a query
const results = await searchAlternativeVectors('AI writing assistant', {
  limit: 10,
  offset: 0,
  scoreThreshold: 0.3, // Optional minimum relevance score
});

// Results include:
// - id: Alternative ID
// - score: Relevance score (0-1)
// - payload: { id, slug, name, description, relatedToolIds }
```

### Categories Search

Categories are indexed with name, label, and description. This enables semantic category discovery.

```typescript
import { searchCategoryVectors } from '~/lib/vector-store';

// Search categories
const results = await searchCategoryVectors('productivity tools', {
  limit: 10,
  scoreThreshold: 0.2,
});

// Results include:
// - id: Category ID
// - score: Relevance score
// - payload: { id, slug, name, description }
```

### Indexing Alternatives and Categories

Alternatives and categories are automatically indexed when created or updated. Manual reindexing is also available:

```typescript
import { 
  reindexAllAlternatives, 
  reindexAllCategories 
} from '~/lib/vector-store';

// Reindex all alternatives
const progress = await reindexAllAlternatives((progress) => {
  console.log(`Processed: ${progress.processed}/${progress.total}`);
});

// Reindex all categories
await reindexAllCategories();
```

### Fallback Behavior

Both alternatives and categories search fall back to Prisma keyword search if:
- Qdrant returns no results above the score threshold
- Qdrant service is unavailable
- Collection doesn't exist yet

This ensures search always returns results even if vector search fails.

---

## 7. Related Tools Recommendations

The system uses Qdrant's recommendation API to find similar tools based on vector similarity. This is more accurate than keyword-based recommendations.

### Basic Usage

```typescript
import { findRelatedTools } from '~/lib/related-tools';

// Find tools related to a specific tool ID
const related = await findRelatedTools('tool-id-123', {
  limit: 10,
  scoreThreshold: 0.3,
  publishedOnly: true, // Default: true
});

// Results include:
// - tool: Full tool object (ToolMany type)
// - score: Similarity score (0-1)
```

### Filtering Recommendations

You can filter recommendations by category:

```typescript
// Find related tools in the same category
const related = await findRelatedTools('tool-id-123', {
  limit: 5,
  category: 'productivity', // Category slug
  scoreThreshold: 0.4,
});
```

### Finding by Slug

A convenience function is available for slug-based lookups:

```typescript
import { findRelatedToolsBySlug } from '~/lib/related-tools';

// Find related tools by tool slug
const related = await findRelatedToolsBySlug('notion', {
  limit: 10,
});
```

### Batch Recommendations

For processing multiple tools at once:

```typescript
import { findRelatedToolsBatch } from '~/lib/related-tools';

// Get recommendations for multiple tools
const toolIds = ['id1', 'id2', 'id3'];
const allRelated = await findRelatedToolsBatch(toolIds, {
  limit: 5,
  publishedOnly: true,
});

// Returns Map<string, RelatedToolResult[]>
// Key: tool ID, Value: array of related tools
```

### How It Works

1. **Vector Lookup**: Uses Qdrant's `query` API with `recommend` type
2. **Similarity Search**: Finds tools with similar dense vectors (semantic similarity)
3. **Filtering**: Applies category and published status filters
4. **Hydration**: Fetches full tool data from Prisma for returned IDs
5. **Exclusion**: Automatically excludes the source tool from results

The recommendation API uses dense vectors only (not hybrid) for semantic similarity, which is ideal for finding conceptually related tools.

---

## 8. Search Configuration

Search behavior is controlled through a centralized configuration module (`config/search.ts`) that provides environment-appropriate defaults.

### Configuration Types

The system provides four search configuration presets:

```typescript
import { getSearchConfig } from '~/config/search';

// Default configuration (general queries)
const defaultConfig = getSearchConfig('default');
// - limit: 10
// - scoreThreshold: 0.0
// - efSearch: 64 (96 in production)
// - prefetchLimit: 20

// Admin search (more permissive)
const adminConfig = getSearchConfig('admin');
// - limit: 50
// - scoreThreshold: 0.0
// - efSearch: 64 (96 in production)
// - prefetchLimit: 50

// Public search (optimized for speed)
const publicConfig = getSearchConfig('public');
// - limit: 10
// - scoreThreshold: 0.0
// - efSearch: 64 (96 in production)
// - prefetchLimit: 20

// Recommendations (higher quality threshold)
const recConfig = getSearchConfig('recommendation');
// - limit: 20
// - scoreThreshold: 0.3
// - efSearch: 64 (96 in production)
// - prefetchLimit: 30
```

### Configuration Parameters

- **limit**: Maximum number of results to return
- **scoreThreshold**: Minimum relevance score (0-1). Results below this are filtered out
- **efSearch**: HNSW algorithm parameter. Higher = more accurate but slower searches
  - Default: 64 (96 in production)
  - Range: Typically 16-256
- **prefetchLimit**: Number of candidates to fetch for RRF fusion (should be 2-3x the final limit)

### Environment Overrides

The configuration automatically adjusts for production:
- `efSearch` is multiplied by 1.5 in production for better accuracy
- Other parameters remain consistent across environments

### Using Configuration in Search

```typescript
import { getSearchConfig } from '~/config/search';
import { searchAlternativeVectors } from '~/lib/vector-store';

const config = getSearchConfig('public');

const results = await searchAlternativeVectors(query, {
  limit: config.limit,
  scoreThreshold: config.scoreThreshold,
});
```

### Tuning Search Performance

**For Better Accuracy**:
- Increase `efSearch` (e.g., 128 or 256)
- Increase `prefetchLimit` for RRF fusion
- Lower `scoreThreshold` to include more results

**For Better Speed**:
- Decrease `efSearch` (e.g., 32 or 16)
- Decrease `limit` and `prefetchLimit`
- Increase `scoreThreshold` to filter low-quality results early

**Balanced (Recommended)**:
- `efSearch: 64` (default)
- `prefetchLimit: 2-3x limit`
- `scoreThreshold: 0.0` (let Qdrant return all results, filter in application if needed)
