import {QdrantClient} from '@qdrant/js-client-rest';

const client = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
})


const result = await client.getCollections();
console.log('List of collections:', result.collections);