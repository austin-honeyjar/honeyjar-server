# 🧪 End-to-End Integration Testing Plan

## Overview
This document provides a comprehensive testing plan for the queue-based scaling system integration. Follow these steps to validate that your system is working correctly from frontend to backend.

---

## 📋 Pre-Testing Checklist

### ✅ Environment Setup
- [ ] **Redis is running** (Docker container or local)
- [ ] **PostgreSQL is running** (via Docker Compose)
- [ ] **Backend server is started** (`npm run dev` in honeyjar-server)
- [ ] **Frontend is running** (`npm run dev` in honeyjar-app)
- [ ] **Environment variables set**:
  - `REDIS_ENABLED=true` in `.env`
  - All database credentials configured
  - OpenAI API key configured (if testing AI features)

### ✅ Service Health Verification
Run these commands before testing:

```bash
# Check Redis connection
curl http://localhost:3005/api/v1/chat/system/health

# Check queue statistics
curl http://localhost:3005/api/v1/chat/jobs/queue-stats

# Verify database connection
curl http://localhost:3005/api/v1/chat/metrics
```

Expected responses should show:
- Redis: `"status": "connected"`
- Queues: All queues should exist with 0 failed jobs initially
- Database: `"status": "healthy"`

---

## 🔄 Phase 1: Backend Queue System Testing

### Test 1.1: Basic Queue Functionality
**Objective:** Verify that jobs can be queued and processed

**Steps:**
1. Navigate to `honeyjar-server/` directory
2. Run the test script:
   ```bash
   npx tsx test-integration.ts
   ```

**Expected Results:**
- ✅ All 4 queues (intent, security, rag, openai) should process jobs
- ✅ Job completion times should be logged
- ✅ No error messages in console
- ✅ Batch status should eventually show "completed"

**Troubleshooting:**
- If jobs stuck in "waiting": Check Redis connection
- If "connection refused": Ensure Redis is running
- If workers not processing: Check server startup logs for worker registration

### Test 1.2: Queue Performance Under Load
**Objective:** Test system behavior with multiple concurrent requests

**Steps:**
1. Run the stress test:
   ```bash
   npx tsx test-comprehensive-system.ts
   ```

**Expected Results:**
- ✅ Multiple batches should process simultaneously
- ✅ Queue depths should remain manageable (<100 waiting jobs)
- ✅ System should handle 10+ concurrent requests
- ✅ Memory usage should remain stable

### Test 1.3: Queue Statistics and Health Monitoring
**Objective:** Verify monitoring endpoints work correctly

**Steps:**
1. Check queue statistics:
   ```bash
   curl http://localhost:3005/api/v1/chat/jobs/queue-stats | jq
   ```

2. Check system health:
   ```bash
   curl http://localhost:3005/api/v1/chat/system/health | jq
   ```

**Expected Results:**
```json
{
  "success": true,
  "queues": [
    {
      "queueName": "intent",
      "waiting": 0,
      "active": 0,
      "completed": 5,
      "failed": 0,
      "paused": false
    }
    // ... other queues
  ]
}
```

---

## 🖥️ Phase 2: Frontend Integration Testing

### Test 2.1: Test Dashboard Access
**Objective:** Verify frontend can access the new queue testing features

**Steps:**
1. Open your browser to `http://localhost:3000` (or your frontend URL)
2. Ensure you're signed in with Clerk
3. Navigate to the Test Dashboard (`/test-dashboard`)
4. Click on the **"⚡ Queue System"** tab

**Expected Results:**
- ✅ Queue System tab should be visible and clickable
- ✅ Performance monitoring should load (may show "Loading..." initially)
- ✅ Test configuration options should be available
- ✅ No console errors in browser developer tools

### Test 2.2: Dev Mode Queue Monitoring
**Objective:** Test the enhanced dev mode with queue performance monitoring

**Steps:**
1. Enable Dev Mode (if not already enabled)
2. Look for the Dev Mode banner at the top of the page
3. Click the chevron to expand the dev mode panel
4. Verify the Queue System Status widget appears

**Expected Results:**
- ✅ Queue System Status widget should show real-time data
- ✅ System Health should display memory/CPU usage
- ✅ Queue Activity should show recent job counts
- ✅ "🔄 Refresh" button should update the data

### Test 2.3: Quick Queue Test from Dev Mode
**Objective:** Test the instant queue test feature

**Steps:**
1. In the expanded Dev Mode panel
2. Click **"Quick Queue Test"** button
3. Wait for the test to complete
4. Check console for logs and alert message

**Expected Results:**
- ✅ Alert should show: "Queue test successful! Batch ID: batch_..."
- ✅ Console should log: "✅ Queue test successful:" with batch data
- ✅ No error alerts or console errors

---

## 🔗 Phase 3: End-to-End Chat Integration Testing

### Test 3.1: Queue-Based Chat Message Processing
**Objective:** Test the hybrid chat service with real user messages

**Steps:**
1. In the Test Dashboard, go to **Queue System** tab
2. Select **"Realistic Test"** scenario
3. Enter a test message like:
   ```
   Create a press release for our AI startup TechVenture that just raised $5M Series A funding. Include quotes from CEO John Smith and mention our partnership with Microsoft.
   ```
4. Click **"Run Queue Test"**
5. Monitor the batch results in real-time

**Expected Results:**
- ✅ Batch ID should be generated immediately
- ✅ All 4 job types should be queued: intent, security, rag, openai
- ✅ Jobs should process within 10-30 seconds
- ✅ Results should show success for each queue
- ✅ Performance metrics should be displayed

### Test 3.2: Batch Results Polling
**Objective:** Verify that batch results can be retrieved

**Steps:**
1. After running a queue test, note the Batch ID
2. Manually test the batch results endpoint:
   ```bash
   curl "http://localhost:3005/api/v1/chat/batch/[BATCH_ID]/results" | jq
   ```

**Expected Results:**
```json
{
  "status": "completed",
  "results": {
    "intent": { "success": true, "duration": 150 },
    "security": { "success": true, "duration": 80 },
    "rag": { "success": true, "duration": 120 },
    "openai": { "success": true, "duration": 1200 }
  },
  "pendingJobs": []
}
```

### Test 3.3: Error Handling and Recovery
**Objective:** Test system behavior when jobs fail

**Steps:**
1. Temporarily stop Redis:
   ```bash
   docker stop honeyjar-redis  # or your Redis container name
   ```
2. Try to run a queue test from the frontend
3. Restart Redis:
   ```bash
   docker start honeyjar-redis
   ```
4. Run another test to verify recovery

**Expected Results:**
- ✅ Frontend should show appropriate error messages
- ✅ System should not crash
- ✅ After Redis restart, new tests should work normally
- ✅ No memory leaks or hanging processes

---

## 🚀 Phase 4: Performance and Scalability Testing

### Test 4.1: Concurrent User Simulation
**Objective:** Simulate multiple users using the system simultaneously

**Steps:**
1. Open multiple browser tabs/windows
2. In each tab, go to Test Dashboard → Queue System
3. Run queue tests simultaneously from different tabs
4. Monitor system performance via:
   - Dev Mode queue monitoring
   - System health endpoint
   - Server logs

**Expected Results:**
- ✅ All requests should be processed successfully
- ✅ Queue depths should remain manageable
- ✅ Response times should stay under 5 seconds for queuing
- ✅ System memory should remain stable

### Test 4.2: Stress Testing
**Objective:** Test system limits and recovery

**Steps:**
1. In Test Dashboard → Queue System
2. Click **"Stress Test (10x)"** button
3. Monitor queue statistics in real-time
4. Wait for all jobs to complete

**Expected Results:**
- ✅ System should handle 10 concurrent requests
- ✅ Queue depths may spike but should process down to 0
- ✅ Error rate should be <10%
- ✅ System should remain responsive

### Test 4.3: Long-Running Performance Test
**Objective:** Verify system stability over time

**Steps:**
1. Set up a script to run tests every 30 seconds for 10 minutes:
   ```bash
   # Create a simple test loop
   for i in {1..20}; do
     echo "Test iteration $i"
     curl -X POST http://localhost:3005/api/v1/chat/threads/550e8400-e29b-41d4-a716-446655440000/messages/queued \
       -H "Content-Type: application/json" \
       -d '{"content":"Performance test message '$i'","userId":"test-user","orgId":"test-org"}'
     sleep 30
   done
   ```
2. Monitor system health throughout the test

**Expected Results:**
- ✅ Memory usage should remain stable (no memory leaks)
- ✅ Queue processing should remain consistent
- ✅ Response times should not degrade significantly
- ✅ Error rates should remain low

---

## 📊 Phase 5: Performance Monitoring Validation

### Test 5.1: Dashboard Performance Metrics
**Objective:** Verify all performance monitoring features work

**Steps:**
1. Go to Test Dashboard → Queue System
2. Enable **"Start Monitoring"**
3. Run several queue tests
4. Verify real-time metrics update:
   - System Health indicators
   - Queue Statistics table
   - API Performance metrics

**Expected Results:**
- ✅ Metrics should update every 5 seconds
- ✅ Job counts should increase after running tests
- ✅ Memory/CPU usage should be realistic
- ✅ Response times should be tracked accurately

### Test 5.2: Dev Mode Live Monitoring
**Objective:** Test the dev mode live monitoring features

**Steps:**
1. Enable Dev Mode and expand the panel
2. Verify Queue System Status shows live data
3. Click "🔄 Refresh" to update manually
4. Run a queue test and watch for updates

**Expected Results:**
- ✅ Data should update automatically every 5 seconds
- ✅ Manual refresh should work immediately
- ✅ Queue activity should reflect recent tests
- ✅ System health should show current resource usage

---

## 🛠️ Common Issues and Troubleshooting

### Issue: Jobs Stuck in "Waiting" State
**Symptoms:** Jobs are queued but never process
**Solutions:**
1. Check Redis connection: `curl http://localhost:3005/api/v1/chat/system/health`
2. Verify workers are registered in server logs
3. Restart the backend server
4. Check Bull configuration in `comprehensiveQueues.ts`

### Issue: "Connection Refused" Errors
**Symptoms:** Cannot connect to Redis or database
**Solutions:**
1. Verify Docker containers are running: `docker ps`
2. Check environment variables in `.env`
3. Restart Redis: `docker restart honeyjar-redis`
4. Check network connectivity

### Issue: Frontend Can't Load Queue Data
**Symptoms:** Test dashboard shows loading indefinitely
**Solutions:**
1. Check browser console for errors
2. Verify backend is running and accessible
3. Check CORS configuration
4. Ensure user authentication is working

### Issue: High Memory Usage
**Symptoms:** System performance degrades over time
**Solutions:**
1. Check for job cleanup configuration
2. Monitor Bull queue settings for job retention
3. Restart the server if memory usage is excessive
4. Review job data sizes and optimize if needed

### Issue: Slow Queue Processing
**Symptoms:** Jobs take longer than expected to complete
**Solutions:**
1. Check individual worker performance
2. Verify external API credentials (OpenAI, etc.)
3. Monitor database query performance
4. Consider scaling worker instances

---

## ✅ Test Completion Checklist

Mark each test as complete:

### Backend Tests
- [ ] Basic queue functionality working
- [ ] Queue performance under load acceptable
- [ ] Health monitoring endpoints functional
- [ ] Error handling and recovery working

### Frontend Tests
- [ ] Test dashboard queue tab accessible
- [ ] Dev mode monitoring functional
- [ ] Quick queue test working
- [ ] Real-time updates functioning

### Integration Tests
- [ ] End-to-end message processing working
- [ ] Batch results retrieval functional
- [ ] Error scenarios handled gracefully
- [ ] Multiple user simulation successful

### Performance Tests
- [ ] Concurrent users handled properly
- [ ] Stress testing passed
- [ ] Long-running stability verified
- [ ] Monitoring metrics accurate

---

## 📝 Test Results Documentation

### Performance Baseline
Record these metrics after successful testing:

- **Average Queue Response Time:** _____ ms
- **Queue Processing Time:** _____ ms per job
- **Concurrent User Capacity:** _____ simultaneous users
- **Memory Usage:** _____ MB baseline, _____ MB under load
- **Error Rate:** _____ % under normal conditions

### Scaling Recommendations
Based on test results:

- **Next Scaling Trigger:** Queue depth > _____ or response time > _____ ms
- **Recommended Actions:** Add worker instances / Optimize database / Scale infrastructure
- **Monitoring Alerts:** Set up alerts when error rate > _____ % or memory > _____ MB

---

## 🎯 Success Criteria

Your integration is successful when:

✅ **All queue tests pass without errors**
✅ **Frontend monitoring displays real-time data**
✅ **System handles expected concurrent load**
✅ **Performance metrics are within acceptable ranges**
✅ **Error handling and recovery work correctly**
✅ **Monitoring and alerting systems function properly**

**Congratulations! Your queue-based scaling system is ready for production use.** 🚀

---

## Next Steps After Testing

1. **Monitor in production** using the dashboard tools
2. **Set up alerting** based on your performance baselines
3. **Plan scaling triggers** based on observed queue depths and response times
4. **Document operational procedures** for your team
5. **Schedule regular performance reviews** to track system growth
