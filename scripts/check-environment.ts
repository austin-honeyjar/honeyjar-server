import { getEmbeddingConfig, ENV_GUIDE } from '../src/config/embedding.config';
import logger from '../src/utils/logger';

function checkEnvironmentSetup() {
  console.log('🔧 Checking environment setup for pgvector and embeddings...\n');
  
  try {
    // Check embedding configuration
    const config = getEmbeddingConfig();
    
    console.log('📋 Current Configuration:');
    console.log(`   Provider: ${config.provider}`);
    console.log(`   Use pgvector: ${config.database.usePgVector}`);
    console.log(`   Index Type: ${config.database.indexType}`);
    console.log(`   Search Threshold: ${config.search.defaultSimilarityThreshold}`);
    console.log(`   Search Limit: ${config.search.defaultLimit}`);
    
    // Check provider-specific settings
    console.log('\n🔌 Provider Configuration:');
    
    if (config.provider === 'openai') {
      const hasApiKey = !!config.openai?.apiKey;
      console.log(`   OpenAI API Key: ${hasApiKey ? '✅ Set' : '❌ Missing'}`);
      console.log(`   Model: ${config.openai?.model}`);
      console.log(`   Dimensions: ${config.openai?.dimensions}`);
      
      if (!hasApiKey) {
        console.log('   ⚠️  Set OPENAI_API_KEY in your .env file');
      }
    }
    
    // Check database configuration
    console.log('\n🗄️  Database Configuration:');
    console.log(`   pgvector enabled: ${config.database.usePgVector ? '✅' : '❌'}`);
    console.log(`   Index type: ${config.database.indexType}`);
    
    if (config.database.indexType === 'ivfflat') {
      console.log(`   Index lists: ${config.database.indexLists}`);
    } else if (config.database.indexType === 'hnsw') {
      console.log(`   Index M: ${config.database.indexM}`);
      console.log(`   Index EF Construction: ${config.database.indexEfConstruction}`);
    }
    
    // Check required environment variables
    console.log('\n🌍 Environment Variables:');
    
    const requiredVars = [
      'DATABASE_URL',
      'OPENAI_API_KEY',
    ];
    
    const optionalVars = [
      'EMBEDDING_PROVIDER',
      'USE_PGVECTOR',
      'SIMILARITY_THRESHOLD',
      'SEARCH_LIMIT',
    ];
    
    requiredVars.forEach(varName => {
      const value = process.env[varName];
      const status = value ? '✅ Set' : '❌ Missing';
      console.log(`   ${varName}: ${status}`);
    });
    
    console.log('\n📝 Optional Variables:');
    optionalVars.forEach(varName => {
      const value = process.env[varName];
      const status = value ? `✅ ${value}` : '📝 Using default';
      console.log(`   ${varName}: ${status}`);
    });
    
    // Check Node.js dependencies
    console.log('\n📦 Dependencies:');
    
    const dependencies = [
      'drizzle-orm',
      'pgvector',
      'openai'
    ];
    
    dependencies.forEach(dep => {
      try {
        require.resolve(dep);
        console.log(`   ✅ ${dep}`);
      } catch (error) {
        console.log(`   ❌ ${dep} - Run: npm install ${dep}`);
      }
    });
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('   1. Set OPENAI_API_KEY in your .env file');
    }
    
    if (!process.env.USE_PGVECTOR) {
      console.log('   2. Set USE_PGVECTOR=true for better performance');
    }
    
    console.log('   3. Run: npm run validate:pgvector to check database setup');
    console.log('   4. Run: npm run dev to start the server with pgvector support');
    
    console.log('\n📋 Environment Variables Guide:');
    console.log(ENV_GUIDE);
    
  } catch (error) {
    console.error('❌ Environment check failed:', error);
    process.exit(1);
  }
}

// Run the check
checkEnvironmentSetup(); 