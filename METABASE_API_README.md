# 📰 Metabase API Integration - ACCURATE DOCUMENTATION

> **Real** LexisNexis/Metabase API integration based on official implementation. No fictional features.

## 🚨 IMPORTANT: API Reality Check

This documentation has been **completely rewritten** to accurately reflect only the **real** Metabase API capabilities. Previous versions contained invented features that don't actually exist in the Metabase API.

**REAL API ENDPOINTS (Confirmed Working):**
- ✅ `http://metabase.moreover.com/api/v10/articles`
- ✅ `http://metabase.moreover.com/api/v10/revokedArticles`
- ✅ `http://metabase.moreover.com/api/v10/searchArticles` (SEARCH API)

**FAKE ENDPOINTS (Return 404):**
- ❌ Any analytics endpoints  
- ❌ Any trending/sources endpoints

## 📋 REAL API Endpoints

### 🔍 **Metabase API Endpoints**

#### `GET /api/v1/metabase/articles`
**Direct Metabase Articles API**
- **Purpose**: Fetch articles from Metabase API with real parameters only
- **Rate Limit**: 20 seconds minimum between calls (Metabase requirement)
- **Real Parameters**:
  - `key` (required): Your LexisNexis profile ID/API key
  - `limit` (1-500): Number of articles to return (default: 500, max: 500)
  - `sequenceId`: Sequence ID from last article to avoid duplicates
  - `numberOfSlices`: Number of parallel clients for load balancing
  - `sliceIndex`: Which slice this client represents (0-based)
- **Use Case**: Primary article retrieval, daily news ingestion

#### `GET /api/v1/metabase/articles/search`
**Direct Metabase Search API** 🔍
- **Purpose**: **REAL SEARCH** - Fast search across last 100 days of content
- **Rate Limit**: Configured by Product Support
- **Real Parameters**:
  - `key` (required): Your LexisNexis API key
  - `query` (required): Search query with Boolean syntax support
  - `limit` (1-200): Number of articles to return (default: 1)
  - `format`: Response format (xml, json, rss, atom, default: xml)
  - `recent=true`: Only search last 3 days (faster queries)
  - `sequence_id`: Pagination through results (for >200 articles)
  - `filter_duplicates=true`: Remove duplicate articles
  - `duplicate_order=latest`: Show most recent duplicate instead of oldest
  - `sort`: Sort order (asc/desc, default: desc)
  - `relevance_percent` (1-100): Filter by relevance percentage
  - `sort_by_relevance=true`: Sort by relevance instead of sequenceId
  - `show_relevance_score=true`: Include relevance scores in response
  - `show_matching_keywords=true`: Show which keywords matched
- **Query Limit**: 10,000 characters maximum
- **Use Case**: Content discovery, research, targeted news monitoring

#### `GET /api/v1/metabase/articles/revoked`
**Direct Metabase Revoked Articles API**
- **Purpose**: **CRITICAL COMPLIANCE** - Get articles that must be removed
- **Rate Limit**: 20 seconds minimum between calls
- **Real Parameters**:
  - `key` (required): Your LexisNexis profile ID/API key
  - `limit` (1-10,000): Number of revoked articles per request
  - `sequenceId`: Pagination for large revocation lists
- **Use Case**: **Daily compliance requirement** - remove revoked articles
- **⚠️ Critical**: Must be called daily for licensing compliance

#### `POST /api/v1/metabase/articles/compliance`
**License Compliance Click Processing**
- **Purpose**: **REAL FEATURE** - "Click" licensed articles for royalty tracking
- **Body**: Array of articles with `id`, `clickUrl`, and `licenses`
- **Processing**: Makes HTTP requests to article click URLs
- **Use Case**: Automated compliance with licensing requirements

### 🔧 **Local Utility Endpoints**

#### `GET /api/v1/metabase/rate-limit/check`
**Rate Limit Compliance Check**
- **Purpose**: Ensure 20-second minimum between Metabase API calls
- **Parameters**: `lastCallTime`: ISO timestamp of last Metabase call
- **Response**: `canCall` boolean, `waitTime` in milliseconds
- **Use Case**: Prevent rate limit violations, schedule API calls

#### `GET /api/v1/metabase/compliance/status`
**Compliance Workflow Status**
- **Purpose**: Monitor compliance workflow and revoked articles processing
- **Response**: Last compliance check, status, processed articles count
- **Use Case**: Operational monitoring, compliance tracking

#### `GET /api/v1/metabase/cache/stats`
**Cache Performance Monitoring**
- **Purpose**: Monitor local caching performance
- **Response**: Hit rates, memory usage, TTL statistics
- **Use Case**: Cache optimization, performance monitoring

#### `POST /api/v1/metabase/processing/batch`
**Batch Process Cached Articles**
- **Purpose**: Process cached articles with business logic
- **Body**: Array of article IDs to process
- **Processing**: Local analysis of cached article data
- **Use Case**: Sentiment analysis, entity extraction on cached data

#### `GET /api/v1/metabase/analytics/local`
**Local Data Analytics**
- **Purpose**: Analyze locally cached article data
- **Parameters**: Date ranges, processing options
- **Processing**: Client-side analytics on cached articles
- **Use Case**: Business intelligence on cached content

#### `GET /api/v1/metabase/sync/status`
**Daily Sync Monitoring**
- **Purpose**: Monitor daily article and revocation sync status
- **Response**: Last sync times, error counts, compliance status
- **Use Case**: Operational monitoring, compliance tracking

## 🔧 **Real API Implementation**

### **Real Error Codes (From Official Documentation)**
The Metabase API returns these actual error codes:
- `1000`: Invalid m parameter
- `1001`: Profile not found
- `1002`: Authentication failure
- `1003`: Authorization failure
- `1004`: Too frequent calls (< 20 seconds)
- `1005`: Unsupported output format
- `1006`: Invalid last_id parameter
- `1007`: Invalid limit parameter
- `1008`: Invalid sequence_id parameter
- `9999`: An error has occurred

### **Real Rate Limiting Rules**
- **Minimum**: 20 seconds between calls (enforced by Metabase)
- **High Volume**: 30 seconds recommended for full English feeds
- **Lower Volume**: Few minutes OK for filtered feeds
- **Violation**: Results in denial of access (Error 1004)

### **Real Load Balancing (Slicing)**
For high-volume scenarios, the API supports client load balancing:
```
numberOfSlices=3&sliceIndex=0  // Client 1 of 3
numberOfSlices=3&sliceIndex=1  // Client 2 of 3  
numberOfSlices=3&sliceIndex=2  // Client 3 of 3
```

### **Real Search API Examples**
```
# Basic search
https://metabase.moreover.com/api/v10/searchArticles?key=YOUR_KEY&query=london

# Advanced search with filters
https://metabase.moreover.com/api/v10/searchArticles?key=YOUR_KEY&query=london%20AND%20sourceCountry:%22United%20Kingdom%22&limit=100&format=json

# Search with relevance filtering
https://metabase.moreover.com/api/v10/searchArticles?key=YOUR_KEY&query=technology&relevance_percent=80&show_relevance_score=true
```

### **Real License Compliance**
Some articles have `<clickUrl>` that must be called for royalty compliance:
```typescript
async function processComplianceClicks(articles: Article[]) {
  for (const article of articles) {
    if (article.clickUrl && article.licenses?.length > 0) {
      try {
        await axios.get(article.clickUrl, { timeout: 30000 });
        console.log(`Compliance click successful for article ${article.id}`);
      } catch (error) {
        console.error(`Compliance click failed for article ${article.id}`);
      }
    }
  }
}
```

## ❌ **REMOVED FICTIONAL FEATURES**

### **Features That DON'T Exist:**
- ❌ Rate limits API endpoint (`/api/v10/rateLimits` - this was incorrectly documented)
- ❌ Analytics endpoints (sentiment, entities, locations)
- ❌ Trending topics endpoint
- ❌ Sources enumeration endpoint
- ❌ Source changes monitoring
- ❌ Custom rate limiting configurations

### **Why Some Features Were Initially Confused:**
- ❌ Adding search parameters to `/articles` endpoint returns `400 Bad Request`
- ✅ Search parameters work correctly on `/searchArticles` endpoint
- The confusion arose from testing search on the wrong endpoint
- Only analytics and trending endpoints actually return `404 Not Found`

## ✅ **PRODUCTION REQUIREMENTS**

### **Daily Compliance Automation**
```typescript
// REQUIRED: Daily revoked articles check
@Cron('0 2 * * *') // Daily at 2 AM
async syncRevokedArticles() {
  const revoked = await metabaseService.getRevokedArticles();
  await database.markArticlesAsRevoked(revoked);
  await cache.removeRevokedArticles(revoked);
  await generateComplianceReport();
}
```

### **Rate Limit Compliance**
```typescript
class MetabaseRateLimiter {
  private lastCallTime: Date | null = null;
  private readonly MIN_INTERVAL = 20000; // 20 seconds

  async canMakeCall(): Promise<boolean> {
    if (!this.lastCallTime) return true;
    
    const elapsed = Date.now() - this.lastCallTime.getTime();
    return elapsed >= this.MIN_INTERVAL;
  }

  async waitIfNeeded(): Promise<void> {
    if (!this.lastCallTime) return;
    
    const elapsed = Date.now() - this.lastCallTime.getTime();
    const waitTime = this.MIN_INTERVAL - elapsed;
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  recordCall(): void {
    this.lastCallTime = new Date();
  }
}
```

### **Environment Configuration**
```bash
# Metabase API Configuration (REAL)
METABASE_API_KEY=your_lexisnexis_profile_id
METABASE_BASE_URL=http://metabase.moreover.com

# Rate Limiting (REAL)
METABASE_MIN_INTERVAL=20000  # 20 seconds minimum

# Redis Caching
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Compliance
ENABLE_DAILY_COMPLIANCE_CHECK=true
ENABLE_CLICK_COMPLIANCE=true
```

## 📞 **Support & Compliance**

### **Compliance Requirements**
- **Daily revoked articles check**: MANDATORY
- **20-second rate limiting**: MANDATORY  
- **License click compliance**: Required for licensed articles
- **Data retention**: Follow LexisNexis policies

### **API Contact Information**
- **LexisNexis Client Services**: For API access and configuration
- **Technical Support**: For integration issues
- **Compliance Questions**: For licensing and legal requirements

---

**This documentation reflects ONLY the real Metabase API capabilities. All fictional features have been removed to ensure accurate integration and compliance.** 