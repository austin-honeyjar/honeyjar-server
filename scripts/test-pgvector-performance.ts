import { db } from '../src/db';
import { conversationEmbeddings } from '../src/db/schema';
import { sql } from 'drizzle-orm';

async function testPgvectorPerformance() {
  console.log('🚀 Testing pgvector performance...');
  
  // Generate test embedding
  const testEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
  
  // Test JavaScript similarity (old method)
  const startJs = Date.now();
  const allEmbeddings = await db.select({
    id: conversationEmbeddings.id,
    embedding: conversationEmbeddings.embedding,
  }).from(conversationEmbeddings).limit(1000);
  
  const jsResults = allEmbeddings
    .map(row => {
      if (!row.embedding) return null;
      const embedding = JSON.parse(row.embedding);
      const similarity = cosineSimilarity(testEmbedding, embedding);
      return { id: row.id, similarity };
    })
    .filter(Boolean)
    .sort((a, b) => b!.similarity - a!.similarity)
    .slice(0, 10);
  
  const jsTime = Date.now() - startJs;
  
  // Test pgvector similarity (new method)
  const startPgvector = Date.now();
  const pgvectorResults = await db.select({
    id: conversationEmbeddings.id,
    distance: sql<number>`${conversationEmbeddings.embeddingVector} <-> ${`[${testEmbedding.join(',')}]`}::vector`,
  })
  .from(conversationEmbeddings)
  .where(sql`${conversationEmbeddings.embeddingVector} IS NOT NULL`)
  .orderBy(sql`${conversationEmbeddings.embeddingVector} <-> ${`[${testEmbedding.join(',')}]`}::vector`)
  .limit(10);
  
  const pgvectorTime = Date.now() - startPgvector;
  
  console.log('\n📊 Performance Results:');
  console.log(`JavaScript method: ${jsTime}ms`);
  console.log(`pgvector method: ${pgvectorTime}ms`);
  console.log(`Performance improvement: ${Math.round(jsTime / pgvectorTime)}x faster`);
  
  console.log('\n🔍 Result comparison:');
  console.log('JavaScript top 3:', jsResults.slice(0, 3));
  console.log('pgvector top 3:', pgvectorResults.slice(0, 3).map(r => ({ 
    id: r.id, 
    similarity: 1 - r.distance 
  })));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Run the test
testPgvectorPerformance().catch(console.error); 