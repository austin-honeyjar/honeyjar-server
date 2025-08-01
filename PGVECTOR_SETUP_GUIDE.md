# 🚀 pgvector Setup Guide

This guide will help you set up and test the new pgvector implementation for 10-100x faster semantic search.

## 🔧 Prerequisites

### 1. Install pgvector Extension

**For PostgreSQL on Ubuntu/Debian:**
```bash
# Add PostgreSQL APT repository
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# Install pgvector
sudo apt-get update
sudo apt-get install postgresql-15-pgvector
```

**For macOS (with Homebrew):**
```bash
brew install pgvector
```

**For Docker:**
```dockerfile
FROM pgvector/pgvector:pg15
# OR add to existing PostgreSQL container:
# RUN apt-get update && apt-get install -y postgresql-15-pgvector
```

### 2. Enable pgvector in Your Database
```sql
-- Connect to your database
psql -d your_database_name -U postgres

-- Enable the extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

## 🚀 Quick Start

### 1. Check Your Environment
```bash
cd honeyjar-server
npm run check:env
```

This will verify:
- ✅ Required environment variables
- ✅ Node.js dependencies  
- ✅ Embedding provider configuration
- ✅ pgvector settings

### 2. Validate Database Setup
```bash
npm run validate:pgvector
```

This will check:
- ✅ pgvector extension status
- ✅ Vector columns in tables
- ✅ Vector indexes
- ✅ Data migration status
- ✅ Vector operations

### 3. Start the Server
```bash
npm run dev
```

Look for these log messages:
```
✅ pgvector extension enabled successfully
✅ pgvector columns added to existing tables  
✅ pgvector indexes created successfully
✅ Existing embeddings migrated to pgvector format
🚀 pgvector extension is ENABLED - semantic search will be 10-100x faster!
```

### 4. Test Performance
```bash
npm run test:pgvector
```

Expected output:
```
🚀 Testing pgvector performance...

📊 Performance Results:
JavaScript method: 1247ms
pgvector method: 23ms
Performance improvement: 54x faster
```

## 🧪 Testing the Implementation

### 1. Test Dev Analysis Endpoint

The `/api/v1/test/dev-analysis` endpoint now uses pgvector automatically:

```bash
curl -X POST http://localhost:3005/api/v1/test/dev-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "content": "test semantic search with pgvector",
    "userId": "test-user",
    "orgId": "test-org",
    "threadId": "test-thread"
  }'
```

### 2. Check RAG Context Sources

Look for these in the response:
- `ragContext.sources` - Should show multiple source types
- Performance metrics should show sub-100ms retrieval times
- Sources should be sorted by relevance score

### 3. Test with Real Chat

1. Go to your chat interface
2. Enable dev mode
3. Send messages and watch the inline analysis
4. RAG context should load much faster with pgvector

## ⚙️ Configuration Options

### Environment Variables

Add to your `.env` file:

```bash
# Embedding Configuration
EMBEDDING_PROVIDER=openai          # openai, local, huggingface, ollama
USE_PGVECTOR=true                 # Enable pgvector for better performance

# OpenAI Settings (if using OpenAI)
OPENAI_API_KEY=your_openai_key

# pgvector Settings
PGVECTOR_INDEX_TYPE=ivfflat       # ivfflat or hnsw
PGVECTOR_INDEX_LISTS=100          # For ivfflat index

# Search Settings
SIMILARITY_THRESHOLD=0.7          # Distance threshold for pgvector
SEARCH_LIMIT=10                   # Default search result limit
```

### Provider Options

**OpenAI (Default):**
- Model: `text-embedding-ada-002`
- Dimensions: 1536
- Best for production

**Local (Future):**
- For offline/private deployments
- Planned: sentence-transformers, Ollama

**Hugging Face (Future):**
- Alternative cloud provider
- Various model options

## 🐛 Troubleshooting

### pgvector Extension Not Found
```
⚠️ pgvector extension not available
```

**Solution:**
1. Install pgvector system-wide (see Prerequisites)
2. Restart PostgreSQL service
3. Enable extension: `CREATE EXTENSION vector;`

### Performance Not Improved
```
Performance improvement: 1x faster
```

**Possible causes:**
1. **No pgvector indexes:** Check `npm run validate:pgvector`
2. **Small dataset:** pgvector shines with 1000+ embeddings
3. **Index not being used:** Verify vector columns have data

### Migration Issues
```
❌ Failed to migrate embedding for id xyz
```

**Solution:**
1. Check embedding format in database
2. Manually fix malformed JSON embeddings
3. Re-run server startup to retry migration

### JavaScript Fallback Active
```
📝 pgvector extension not available - using JavaScript fallback
```

This is normal and expected:
- ✅ System works without pgvector
- ✅ Automatically upgrades when pgvector available
- ✅ No code changes needed

## 📊 Performance Expectations

| Dataset Size | JavaScript | pgvector | Improvement |
|-------------|------------|----------|-------------|
| 100 embeddings | ~50ms | ~5ms | 10x faster |
| 1,000 embeddings | ~500ms | ~15ms | 33x faster |
| 10,000 embeddings | ~5s | ~50ms | 100x faster |
| 100,000 embeddings | ~50s | ~100ms | 500x faster |

## 🔄 Migration Status

The system supports **dual storage** during migration:

- **`embedding`** - Legacy JSON format (backward compatible)
- **`embedding_vector`** - New pgvector format (high performance)
- **`embedding_provider`** - Tracks which service generated embedding

### Safe Migration Process

1. ✅ **No downtime** - existing system continues working
2. ✅ **Automatic migration** - JSON embeddings converted on startup
3. ✅ **Fallback support** - works without pgvector
4. ✅ **Future cleanup** - old columns can be dropped later

## 🎯 Next Steps

### Immediate
1. Run the setup commands above
2. Test performance with your data
3. Monitor logs for any issues

### Future Optimizations
1. **HNSW indexes** for even better accuracy
2. **Local embedding providers** for privacy
3. **Hybrid search** combining keyword + vector
4. **Multi-vector search** for complex queries

## 📋 Verification Checklist

- [ ] pgvector extension installed in PostgreSQL
- [ ] `npm run check:env` passes
- [ ] `npm run validate:pgvector` shows vectors ready
- [ ] Server starts with pgvector enabled
- [ ] `npm run test:pgvector` shows performance improvement
- [ ] Dev analysis endpoint uses vector search
- [ ] RAG context loads faster in chat

## 🆘 Support

If you encounter issues:

1. **Check logs** - Server startup shows pgvector status
2. **Run validation** - `npm run validate:pgvector`
3. **Test fallback** - System works without pgvector
4. **Check environment** - `npm run check:env`

The system is designed to be **robust** - it will work with or without pgvector, automatically upgrading performance when available! 🚀 