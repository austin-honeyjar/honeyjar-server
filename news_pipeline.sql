-- =====================================================================
-- NEWS PIPELINE DATABASE SCHEMA EXTENSIONS
-- =====================================================================
-- Add these tables to your existing database schema
-- Run after reviewing the NEWS_PIPELINE_IMPLEMENTATION_PLAN.md

-- =====================================================================
-- 1. NEWS PIPELINE TABLES
-- =====================================================================

-- News author relevance tracking and scoring
CREATE TABLE news_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  organization TEXT,
  domain TEXT, -- Company domain for contact matching
  relevance_score FLOAT NOT NULL DEFAULT 0.0,
  article_count INTEGER NOT NULL DEFAULT 0,
  recent_activity_score FLOAT NOT NULL DEFAULT 0.0,
  topics JSONB NOT NULL DEFAULT '[]', -- Areas of expertise/coverage
  locations JSONB NOT NULL DEFAULT '[]', -- Geographic coverage areas
  contact_info JSONB DEFAULT '{}', -- Phone, social media, etc.
  last_article_date TIMESTAMP WITH TIME ZONE,
  first_seen_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}', -- Additional scoring factors
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- News pipeline processing runs and logs
CREATE TABLE news_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL, -- 'daily_sync', 'author_scoring', 'cleanup', 'manual'
  status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'partial'
  articles_processed INTEGER DEFAULT 0,
  articles_filtered INTEGER DEFAULT 0, -- Articles that passed filtering
  authors_updated INTEGER DEFAULT 0,
  authors_created INTEGER DEFAULT 0,
  records_cleaned INTEGER DEFAULT 0,
  execution_time INTEGER, -- milliseconds
  sequence_id_start TEXT, -- Starting sequence ID for sync
  sequence_id_end TEXT, -- Ending sequence ID for sync
  error_message TEXT,
  error_code TEXT,
  filters_applied JSONB DEFAULT '{}', -- Record what filters were used
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Production monitoring and alerting events
CREATE TABLE monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'alert', 'error', 'performance', 'compliance', 'health'
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  source TEXT NOT NULL, -- 'news_pipeline', 'compliance', 'api', 'database', 'monitoring'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  affected_services JSONB DEFAULT '[]', -- Which services are impacted
  resolved BOOLEAN DEFAULT false,
  resolved_by TEXT, -- User or system that resolved
  resolved_at TIMESTAMP WITH TIME ZONE,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP WITH TIME ZONE,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Author-Article relationship tracking (for scoring)
CREATE TABLE news_author_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES news_authors(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES metabase_articles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'author', -- 'author', 'contributor', 'editor', 'source'
  relevance_score FLOAT DEFAULT 1.0, -- How relevant this article is to the author
  extracted_from TEXT DEFAULT 'byline', -- 'byline', 'content', 'metadata'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE(author_id, article_id, role)
);

-- =====================================================================
-- 2. PERFORMANCE INDEXES
-- =====================================================================

-- Author scoring and retrieval indexes
CREATE INDEX idx_authors_relevance ON news_authors(relevance_score DESC, updated_at DESC);
CREATE INDEX idx_authors_activity ON news_authors(recent_activity_score DESC, last_article_date DESC);
CREATE INDEX idx_authors_name_search ON news_authors USING gin(to_tsvector('english', name));
CREATE INDEX idx_authors_organization ON news_authors(organization) WHERE organization IS NOT NULL;
CREATE INDEX idx_authors_domain ON news_authors(domain) WHERE domain IS NOT NULL;
CREATE INDEX idx_authors_topics ON news_authors USING gin(topics);

-- Pipeline monitoring indexes
CREATE INDEX idx_pipeline_runs_status ON news_pipeline_runs(status, run_type, started_at DESC);
CREATE INDEX idx_pipeline_runs_recent ON news_pipeline_runs(started_at DESC) WHERE started_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
CREATE INDEX idx_pipeline_runs_errors ON news_pipeline_runs(status, error_code) WHERE status = 'failed';

-- Monitoring and alerting indexes
CREATE INDEX idx_monitoring_events_unresolved ON monitoring_events(resolved, severity, created_at DESC) WHERE resolved = false;
CREATE INDEX idx_monitoring_events_recent ON monitoring_events(created_at DESC, severity) WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days';
CREATE INDEX idx_monitoring_events_source ON monitoring_events(source, event_type, created_at DESC);
CREATE INDEX idx_monitoring_events_critical ON monitoring_events(created_at DESC) WHERE severity = 'critical' AND resolved = false;

-- Author-Article relationship indexes
CREATE INDEX idx_author_articles_author ON news_author_articles(author_id, created_at DESC);
CREATE INDEX idx_author_articles_article ON news_author_articles(article_id);
CREATE INDEX idx_author_articles_relevance ON news_author_articles(author_id, relevance_score DESC);

-- =====================================================================
-- 3. ENHANCED METABASE INDEXES FOR NEWS PIPELINE
-- =====================================================================

-- Additional indexes on existing metabase_articles for news pipeline efficiency
CREATE INDEX idx_metabase_articles_location_filter ON metabase_articles USING gin(metadata) WHERE metadata ? 'locations';
CREATE INDEX idx_metabase_articles_author_extract ON metabase_articles(author, published_at DESC) WHERE author IS NOT NULL;
CREATE INDEX idx_metabase_articles_source_filter ON metabase_articles(source, published_at DESC);
CREATE INDEX idx_metabase_articles_recent_us ON metabase_articles(published_at DESC) WHERE 
  (metadata->'locations' @> '[{"country": {"name": "United States"}}]'::jsonb OR 
   source ILIKE '%US%' OR source ILIKE '%American%') AND 
   published_at > CURRENT_TIMESTAMP - INTERVAL '90 days';

-- =====================================================================
-- 4. UTILITY FUNCTIONS
-- =====================================================================

-- Function to calculate author relevance score
CREATE OR REPLACE FUNCTION calculate_author_relevance_score(author_uuid UUID)
RETURNS JSONB AS $$
DECLARE
  recent_articles INTEGER;
  total_articles INTEGER;
  last_article_days INTEGER;
  relevance_score FLOAT;
  activity_score FLOAT;
  result JSONB;
BEGIN
  -- Get article counts
  SELECT COUNT(*) INTO total_articles
  FROM news_author_articles naa
  JOIN metabase_articles ma ON naa.article_id = ma.id
  WHERE naa.author_id = author_uuid AND ma.is_revoked = false;
  
  SELECT COUNT(*) INTO recent_articles
  FROM news_author_articles naa
  JOIN metabase_articles ma ON naa.article_id = ma.id
  WHERE naa.author_id = author_uuid 
    AND ma.is_revoked = false
    AND ma.published_at > CURRENT_TIMESTAMP - INTERVAL '30 days';
  
  -- Calculate days since last article
  SELECT EXTRACT(epoch FROM (CURRENT_TIMESTAMP - MAX(ma.published_at)))/86400 INTO last_article_days
  FROM news_author_articles naa
  JOIN metabase_articles ma ON naa.article_id = ma.id
  WHERE naa.author_id = author_uuid AND ma.is_revoked = false;
  
  -- Calculate scores
  activity_score := LEAST(recent_articles * 5, 100);
  relevance_score := activity_score + 
                    CASE 
                      WHEN last_article_days <= 7 THEN 50
                      WHEN last_article_days <= 30 THEN 30
                      WHEN last_article_days <= 90 THEN 10
                      ELSE 0
                    END;
  
  result := jsonb_build_object(
    'relevance_score', relevance_score,
    'activity_score', activity_score,
    'total_articles', total_articles,
    'recent_articles', recent_articles,
    'last_article_days', COALESCE(last_article_days, 999),
    'calculated_at', CURRENT_TIMESTAMP
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get top authors by topic
CREATE OR REPLACE FUNCTION get_top_authors_by_topic(topic_filter TEXT, author_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  author_id UUID,
  author_name TEXT,
  relevance_score FLOAT,
  article_count INTEGER,
  last_article_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    na.id,
    na.name,
    na.relevance_score,
    na.article_count,
    na.last_article_date
  FROM news_authors na
  WHERE na.topics @> jsonb_build_array(topic_filter)
    AND na.relevance_score > 0
  ORDER BY na.relevance_score DESC, na.updated_at DESC
  LIMIT author_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. DATA MIGRATION NOTES
-- =====================================================================

-- After creating these tables, you may want to:
-- 1. Populate initial author data from existing metabase_articles
-- 2. Run initial scoring calculation
-- 3. Set up initial monitoring events

-- Example: Extract existing authors from metabase articles
-- INSERT INTO news_authors (name, article_count, topics, last_article_date)
-- SELECT DISTINCT 
--   author,
--   COUNT(*) as article_count,
--   jsonb_agg(DISTINCT jsonb_array_elements(topics)) as topics,
--   MAX(published_at) as last_article_date
-- FROM metabase_articles 
-- WHERE author IS NOT NULL AND author != '' AND is_revoked = false
-- GROUP BY author
-- HAVING COUNT(*) >= 2; -- Only authors with 2+ articles

-- =====================================================================
-- 6. TRIGGER FOR AUTO-UPDATING AUTHOR SCORES
-- =====================================================================

-- Trigger function to update author stats when articles are added
CREATE OR REPLACE FUNCTION update_author_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Update article count and last article date
  UPDATE news_authors
  SET 
    article_count = (
      SELECT COUNT(*) 
      FROM news_author_articles naa 
      JOIN metabase_articles ma ON naa.article_id = ma.id
      WHERE naa.author_id = news_authors.id AND ma.is_revoked = false
    ),
    last_article_date = (
      SELECT MAX(ma.published_at)
      FROM news_author_articles naa
      JOIN metabase_articles ma ON naa.article_id = ma.id
      WHERE naa.author_id = news_authors.id AND ma.is_revoked = false
    ),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.author_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on author-article relationship table
CREATE TRIGGER trigger_update_author_stats
  AFTER INSERT OR DELETE ON news_author_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_author_stats_trigger();

-- =====================================================================
-- 7. CLEANUP POLICIES
-- =====================================================================

-- Create policies for automatic cleanup (can be run via cron or scheduled jobs)

-- Clean up old pipeline runs (keep 90 days)
-- DELETE FROM news_pipeline_runs WHERE started_at < CURRENT_TIMESTAMP - INTERVAL '90 days';

-- Clean up old monitoring events (keep 30 days, except critical unresolved)
-- DELETE FROM monitoring_events 
-- WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
--   AND NOT (severity = 'critical' AND resolved = false);

-- Archive old author-article relationships (keep 180 days for scoring purposes)
-- DELETE FROM news_author_articles naa
-- USING metabase_articles ma
-- WHERE naa.article_id = ma.id 
--   AND ma.published_at < CURRENT_TIMESTAMP - INTERVAL '180 days'
--   AND ma.is_revoked = false; -- Keep revoked article relationships for compliance

-- =====================================================================
-- END OF SCHEMA
-- ===================================================================== 