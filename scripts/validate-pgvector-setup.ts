import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { conversationEmbeddings, ragDocuments, userUploads } from '../src/db/schema';

async function validatePgvectorSetup() {
  console.log('🔍 Validating pgvector setup and migration...');
  
  try {
    // Check if pgvector extension is installed
    const extensionCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) as pgvector_installed;
    `);
    
    const pgvectorInstalled = extensionCheck[0]?.pgvector_installed;
    console.log(`\n📦 pgvector Extension: ${pgvectorInstalled ? '✅ INSTALLED' : '❌ NOT INSTALLED'}`);
    
    if (!pgvectorInstalled) {
      console.log('⚠️  To install pgvector, run in your PostgreSQL database:');
      console.log('   CREATE EXTENSION vector;');
      console.log('   Or install it system-wide first if not available.');
    }
    
    // Check table schemas and vector columns
    console.log('\n🗄️  Table Schema Validation:');
    
    const tables = ['conversation_embeddings', 'rag_documents', 'user_uploads', 'asset_history', 'knowledge_cache'];
    
    for (const tableName of tables) {
      const columnCheck = await db.execute(sql`
        SELECT 
          column_name,
          data_type,
          is_nullable
        FROM information_schema.columns 
        WHERE table_name = ${tableName} 
        AND column_name IN ('embedding', 'embedding_vector', 'embedding_provider')
        ORDER BY column_name;
      `);
      
      console.log(`\n   📋 ${tableName}:`);
      if (columnCheck.length > 0) {
        columnCheck.forEach((col: any) => {
          const icon = col.column_name === 'embedding_vector' && col.data_type.includes('vector') ? '🚀' : '📝';
          console.log(`      ${icon} ${col.column_name}: ${col.data_type}`);
        });
      } else {
        console.log('      ❌ No embedding columns found');
      }
    }
    
    // Check vector indexes
    console.log('\n🔍 Vector Index Status:');
    
    if (pgvectorInstalled) {
      const indexCheck = await db.execute(sql`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE indexname LIKE '%embedding_vector%'
        ORDER BY tablename, indexname;
      `);
      
      if (indexCheck.length > 0) {
        indexCheck.forEach((idx: any) => {
          const indexType = idx.indexdef.includes('ivfflat') ? 'ivfflat' : 
                           idx.indexdef.includes('hnsw') ? 'hnsw' : 'btree';
          console.log(`   ✅ ${idx.tablename}.${idx.indexname} (${indexType})`);
        });
      } else {
        console.log('   ⚠️  No vector indexes found');
      }
    } else {
      console.log('   ⏭️  Skipped (pgvector not installed)');
    }
    
    // Check data migration status
    console.log('\n📊 Data Migration Status:');
    
    const migrationStats = await db.execute(sql`
      SELECT 
        'conversation_embeddings' as table_name,
        COUNT(*) as total_rows,
        COUNT(embedding) as text_embeddings,
        COUNT(embedding_vector) as vector_embeddings,
        COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END) as unmigrated
      FROM conversation_embeddings
      
      UNION ALL
      
      SELECT 
        'rag_documents',
        COUNT(*),
        COUNT(embedding),
        COUNT(embedding_vector),
        COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END)
      FROM rag_documents
      
      UNION ALL
      
      SELECT 
        'user_uploads',
        COUNT(*),
        COUNT(embedding),
        COUNT(embedding_vector),
        COUNT(CASE WHEN embedding IS NOT NULL AND embedding_vector IS NULL THEN 1 END)
      FROM user_uploads;
    `);
    
    migrationStats.forEach((stat: any) => {
      const migrationComplete = stat.total_rows === 0 || stat.unmigrated === 0;
      const icon = migrationComplete ? '✅' : '⚠️';
      console.log(`   ${icon} ${stat.table_name}:`);
      console.log(`      Total: ${stat.total_rows}, Text: ${stat.text_embeddings}, Vector: ${stat.vector_embeddings}, Unmigrated: ${stat.unmigrated}`);
    });
    
    // Performance readiness check
    console.log('\n⚡ Performance Readiness:');
    
    const totalVectorEmbeddings = migrationStats.reduce((sum: number, stat: any) => sum + parseInt(stat.vector_embeddings || 0), 0);
    
    if (pgvectorInstalled && totalVectorEmbeddings > 0) {
      console.log('   🚀 READY for high-performance vector search!');
      console.log(`      Found ${totalVectorEmbeddings} vector embeddings across all tables`);
      console.log('      Run: npm run test:pgvector to benchmark performance');
    } else if (pgvectorInstalled) {
      console.log('   📝 pgvector installed but no vector data found');
      console.log('      Add some embeddings and they will be automatically stored in vector format');
    } else {
      console.log('   🔄 Using JavaScript fallback for similarity search');
      console.log('      Install pgvector extension for 10-100x performance improvement');
    }
    
    // Test a simple vector operation if possible
    if (pgvectorInstalled) {
      try {
        console.log('\n🧪 Testing vector operations...');
        
        // Test basic vector operations
        await db.execute(sql`
          SELECT '[1,2,3]'::vector <-> '[1,2,4]'::vector as distance;
        `);
        
        console.log('   ✅ Vector operations working correctly');
        
        // Test if we can perform a similarity search
        const sampleQuery = await db.execute(sql`
          SELECT COUNT(*) as searchable_vectors
          FROM conversation_embeddings 
          WHERE embedding_vector IS NOT NULL
          LIMIT 1;
        `);
        
        const searchableCount = parseInt(String(sampleQuery[0]?.searchable_vectors || 0));
        
        if (searchableCount > 0) {
          console.log(`   🔍 ${searchableCount} vectors ready for similarity search`);
        } else {
          console.log('   📝 No vectors available for search yet');
        }
        
      } catch (vectorTestError) {
        console.log('   ❌ Vector operation test failed:', vectorTestError);
      }
    }
    
    console.log('\n🎉 Validation complete!');
    
    // Summary recommendations
    console.log('\n💡 Recommendations:');
    if (!pgvectorInstalled) {
      console.log('   1. Install pgvector extension for dramatic performance improvements');
    }
    if (totalVectorEmbeddings === 0) {
      console.log('   2. Start using the application to generate embeddings');
    }
    console.log('   3. Monitor performance with: npm run test:pgvector');
    console.log('   4. Check vector search in dev-analysis endpoint');
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// Run the validation
validatePgvectorSetup().catch(console.error); 