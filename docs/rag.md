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

See src/router.ts for the full implementation using Gemini 2.5 Flash and generateObject.

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
