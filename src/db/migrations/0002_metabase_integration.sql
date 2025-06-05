-- Migration for Metabase API Integration
-- Creates tables for compliance tracking, article storage, and sync history

-- Create enums for Metabase integration
CREATE TYPE compliance_status AS ENUM ('compliant', 'overdue', 'error');
CREATE TYPE api_call_type AS ENUM ('articles', 'search', 'revoked', 'compliance_clicks');

-- Metabase compliance status tracking
CREATE TABLE metabase_compliance_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_articles_count INTEGER NOT NULL DEFAULT 0,
  articles_processed JSONB NOT NULL DEFAULT '[]',
  status compliance_status NOT NULL DEFAULT 'compliant',
  next_scheduled_check TIMESTAMP WITH TIME ZONE,
  errors JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Metabase articles storage
CREATE TABLE metabase_articles (
  id TEXT PRIMARY KEY, -- Using Metabase article ID as primary key
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  estimated_published_date TIMESTAMP WITH TIME ZONE,
  harvest_date TIMESTAMP WITH TIME ZONE,
  author TEXT,
  topics JSONB NOT NULL DEFAULT '[]',
  licenses JSONB NOT NULL DEFAULT '[]',
  click_url TEXT, -- For compliance clicking
  sequence_id TEXT, -- For pagination
  metadata JSONB NOT NULL DEFAULT '{}', -- Additional Metabase fields
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Metabase revoked articles tracking
CREATE TABLE metabase_revoked_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id TEXT NOT NULL,
  revoked_date TIMESTAMP WITH TIME ZONE NOT NULL,
  sequence_id TEXT, -- From revoked API response
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  compliance_check_id UUID REFERENCES metabase_compliance_status(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Metabase API calls logging for sync history
CREATE TABLE metabase_api_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_type api_call_type NOT NULL,
  endpoint TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  response_status INTEGER,
  response_time INTEGER, -- milliseconds
  articles_returned INTEGER DEFAULT 0,
  error_message TEXT,
  error_code TEXT, -- Metabase error codes (1000-9999)
  sequence_id TEXT, -- Last sequence ID from response
  rate_limit_info JSONB DEFAULT '{}',
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_metabase_compliance_check_date ON metabase_compliance_status(check_date);
CREATE INDEX idx_metabase_compliance_status ON metabase_compliance_status(status);

CREATE INDEX idx_metabase_articles_source ON metabase_articles(source);
CREATE INDEX idx_metabase_articles_published_at ON metabase_articles(published_at);
CREATE INDEX idx_metabase_articles_is_revoked ON metabase_articles(is_revoked);
CREATE INDEX idx_metabase_articles_sequence_id ON metabase_articles(sequence_id);

CREATE INDEX idx_metabase_revoked_article_id ON metabase_revoked_articles(article_id);
CREATE INDEX idx_metabase_revoked_processed ON metabase_revoked_articles(processed);
CREATE INDEX idx_metabase_revoked_date ON metabase_revoked_articles(revoked_date);

CREATE INDEX idx_metabase_api_calls_type ON metabase_api_calls(call_type);
CREATE INDEX idx_metabase_api_calls_created_at ON metabase_api_calls(created_at);
CREATE INDEX idx_metabase_api_calls_status ON metabase_api_calls(response_status);

-- Create trigger to update updated_at timestamp on metabase_articles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_metabase_articles_updated_at BEFORE UPDATE ON metabase_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 