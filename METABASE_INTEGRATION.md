# Metabase API Integration

This document describes the integration with the Metabase/Moreover API for news content and compliance management.

## Overview

The Metabase API integration provides access to news articles and implements the required compliance procedures for content management, including article revocations that must be handled daily.

## Environment Variables

Add these to your `.env` file:

```env
# Metabase API Configuration
METABASE_API_KEY=your_metabase_api_key_here
METABASE_BASE_URL=http://metabase.moreover.com
```

## API Endpoints

### 1. Search Articles (`GET /api/v1/partners/articles/search`)

Search for news articles using various filters.

**Parameters:**
- `query` (optional): Search term or topic
- `limit` (optional): Number of articles (1-10,000, default: 100)
- `sortBy` (optional): Sort order (relevance, date, popularity)
- `startDate` (optional): Filter from date (YYYY-MM-DD)
- `endDate` (optional): Filter until date (YYYY-MM-DD)
- `sources` (optional): Comma-separated list of news sources

**Example:**
```bash
GET /api/v1/partners/articles/search?query=artificial%20intelligence&limit=50&sortBy=date
```

### 2. Get Revoked Articles (`GET /api/v1/partners/articles/revoked`) ⚠️ **CRITICAL**

**⚠️ COMPLIANCE REQUIREMENT:** This endpoint MUST be called daily to remain compliant with Metabase licensing.

Retrieves article IDs that have been revoked and must be removed from your system.

**Parameters:**
- `limit` (optional): Number of revoked articles (1-10,000, default: 1000)
- `sequenceId` (optional): Pagination token (start with "0")

**Important Notes:**
- Call this endpoint daily
- Remove matching article IDs from your system immediately
- Handle duplicates (same article may be revoked multiple times)
- Store the `sequenceId` from the response for next request

**Year Jump Sequence IDs:**
- 2020: "00000000"
- 2021: "11111111"
- 2022: "22222222" 
- 2023: "333333333"
- 2024: "444444444"

**Example:**
```bash
GET /api/v1/partners/articles/revoked?limit=1000&sequenceId=0
```

### 3. Get Article by ID (`GET /api/v1/partners/articles/{articleId}`)

Retrieve specific article details by ID.

**Example:**
```bash
GET /api/v1/partners/articles/123456789
```

### 4. Get Trending Topics (`GET /api/v1/partners/topics/trending`)

Get trending topics extracted from recent articles.

**Parameters:**
- `limit` (optional): Number of topics (1-50, default: 10)

### 5. Get News Sources (`GET /api/v1/partners/sources`)

Get list of available news sources.

## Testing with Swagger

1. **Start the server:**
   ```bash
   cd honeyjar-server
   npm run dev
   ```

2. **Access Swagger UI:**
   Open: `http://localhost:3005/api-docs`

3. **Authenticate:**
   - Click "Authorize" button (🔒)
   - Enter your Bearer token (JWT)

4. **Test the APIs:**
   - Navigate to "Metabase API" section
   - Try the different endpoints
   - **Start with `/partners/articles/search`** for basic testing
   - **Important:** Test `/partners/articles/revoked` for compliance

## Compliance Workflow

### Daily Revocation Check (REQUIRED)

```javascript
// Example daily compliance check
async function dailyComplianceCheck() {
  try {
    let sequenceId = getStoredSequenceId(); // Get from your storage
    
    do {
      const response = await fetch(`/api/v1/partners/articles/revoked?limit=10000&sequenceId=${sequenceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      const { revokedArticles, sequenceId: nextSequenceId } = data.data;
      
      // Remove revoked articles from your system
      await removeRevokedArticles(revokedArticles);
      
      // Store the new sequence ID
      storeSequenceId(nextSequenceId);
      sequenceId = nextSequenceId;
      
    } while (revokedArticles.length > 0);
    
    console.log('Daily compliance check completed');
  } catch (error) {
    console.error('Compliance check failed:', error);
    // Implement alert system - this is critical!
  }
}

// Run this daily (e.g., via cron job)
setInterval(dailyComplianceCheck, 24 * 60 * 60 * 1000); // Daily
```

### Content Updates

When you receive content updates:

1. **Check `updateDate`** against stored versions
2. **If newer:** Replace the stored article with the update
3. **Update metadata** including `updateDate`
4. **Handle duplicates** based on `id` and `updateDate`

## Response Formats

### Article Object
```json
{
  "id": "string",
  "title": "string",
  "summary": "string",
  "content": "string",
  "url": "string",
  "source": "string",
  "publishedAt": "ISO date string",
  "updateDate": "ISO date string",
  "author": "string",
  "topics": ["array", "of", "strings"],
  "metadata": {
    "language": "string",
    "country": "string",
    "region": "string",
    "wordCount": "number"
  }
}
```

### Revoked Articles Response
```json
{
  "status": "success",
  "data": {
    "revokedArticles": ["id1", "id2", "id3"],
    "sequenceId": "12345",
    "totalCount": 3
  }
}
```

## Error Handling

- **401 Unauthorized:** Check your API key and authentication
- **429 Rate Limited:** Implement exponential backoff
- **500 Server Error:** Check logs and retry with backoff
- **Network errors:** Implement retry logic for compliance calls

## Portal Access

For additional documentation and source lists:

1. **Reset Password:** https://portal.moreover.com/resetPassword.html
2. **Login:** https://portal.moreover.com
3. **Support Videos:** https://solutions.nexis.com/support/nexis-data-plus/metabase

## Important Reminders

1. **Daily compliance calls are mandatory** - implement monitoring/alerts
2. **Store article IDs** from your content feeds to match against revocations
3. **Handle duplicates** appropriately
4. **Monitor API limits** and implement rate limiting
5. **Implement robust error handling** for compliance calls
6. **Log all compliance activities** for audit purposes

## Sample Implementation

See the `PartnersService` class in `src/services/partners.service.ts` for a complete implementation example. 