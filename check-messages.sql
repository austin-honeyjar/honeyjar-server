-- Check recent messages for the blog article thread
SELECT 
  id,
  role,
  pg_typeof(content) as content_type,
  CASE 
    WHEN content::text LIKE '%Asset Generation%' THEN 'Asset Generation'
    WHEN content::text LIKE '%Asset Review%' THEN 'Asset Review'
    WHEN content::text LIKE '%Blog Post%' THEN 'Blog Post Message'
    ELSE 'Other'
  END as message_category,
  LEFT(content::text, 200) as content_preview,
  created_at
FROM chat_messages 
WHERE thread_id = 'd1628dc1-d042-4359-920a-b0dd00582125'
  AND role = 'assistant'
  AND (content::text LIKE '%Blog Post%' OR content::text LIKE '%Asset%')
ORDER BY created_at DESC 
LIMIT 10;

-- Check the exact structure of the two asset messages
SELECT 
  id,
  content,
  CASE 
    WHEN content::text LIKE '%Asset Generation%' THEN 'Asset Generation'
    WHEN content::text LIKE '%Asset Review%' THEN 'Asset Review'
    ELSE 'Other'
  END as step_type
FROM chat_messages 
WHERE thread_id = 'd1628dc1-d042-4359-920a-b0dd00582125'
  AND role = 'assistant'
  AND content::text LIKE '%Here''s your%Blog Post%'
ORDER BY created_at DESC; 