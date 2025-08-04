import { db } from '../db';
import { 
  userKnowledgeBase, 
  conversationEmbeddings, 
  assetHistory, 
  userInteractions,
  knowledgeCache,
  userUploads,
  ragDocuments,
  chatThreads,
  workflows
} from '../db/schema';
import { eq, and, desc, sql, gte, lte, isNull, inArray } from 'drizzle-orm';
import logger from '../utils/logger';
import { EmbeddingService } from './embeddingService';
import { getEmbeddingConfig } from '../config/embedding.config';
import { withCache } from './cache.service';
import OpenAI from 'openai';

// Initialize embedding service
const embeddingConfig = getEmbeddingConfig();
const embeddingService = new EmbeddingService(embeddingConfig.provider);

// Initialize OpenAI for chat completions (separate from embeddings)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted';
export type ContentSource = 'admin_global' | 'user_personal' | 'conversation' | 'asset';

export interface SecurityClassification {
  securityLevel: SecurityLevel;
  securityTags: string[];
  containsPii: boolean;
  aiSafe: boolean;
  reason?: string;
}

export interface FileUploadData {
  filename: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  title: string;
  description?: string;
  contentCategory?: string;
  tags?: string[];
}

export interface ProcessedContent {
  extractedText: string;
  processedContent: string;
  aiSafeContent: string;
  securityClassification: SecurityClassification;
  embedding: number[];
}

export interface UserKnowledge {
  userId: string;
  orgId: string;
  companyName?: string;
  companyDescription?: string;
  industry?: string;
  companySize?: string;
  headquarters?: string;
  jobTitle?: string; // User's job title from onboarding
  preferredTone?: string;
  preferredWorkflows?: string[];
  defaultPlatforms?: string[];
  writingStylePreferences?: Record<string, any>;
}

export interface ConversationContext {
  threadId: string;
  workflowId?: string;
  workflowType?: string;
  stepName?: string;
  intent?: string;
  outcome?: 'completed' | 'abandoned' | 'revised';
  securityLevel?: SecurityLevel;
  securityTags?: string[];
}

export interface SmartDefaults {
  companyName?: string;
  industry?: string;
  preferredTone?: string;
  suggestedContent?: string;
  relatedExamples?: Array<{
    type: string;
    content: string;
    context: string;
  }>;
}

export interface SearchResult {
  id: string;
  content: string;
  summary?: string;
  source: 'conversation' | 'asset' | 'upload' | 'rag_document';
  relevanceScore: number;
  context: Record<string, any>;
  createdAt: Date;
  securityLevel: SecurityLevel;
}

export class RAGService {
  
  // MARK: - Security Classification
  
  /**
   * Classify content security level and detect sensitive information
   */
  async classifyContent(content: string): Promise<SecurityClassification> {
    try {
      // Use AI to analyze content for sensitive information
      const prompt = `Analyze this content for security classification:

Content: "${content.slice(0, 2000)}"

Classify the security level and identify any sensitive information:

1. Security Level (choose one):
   - public: Safe for public disclosure
   - internal: Internal company use only
   - confidential: Sensitive business information
   - restricted: Highly sensitive, legal, financial, or personal data

2. Security Tags (identify any present):
   - pii: Personal identifiable information
   - financial: Financial data or revenue information
   - legal: Legal documents or compliance information
   - proprietary: Trade secrets or proprietary information
   - contact_info: Contact details, emails, phone numbers
   - strategic: Strategic plans or competitive information

3. PII Detection: Does this contain personal information?

Respond in JSON format:
{
  "securityLevel": "level",
  "securityTags": ["tag1", "tag2"],
  "containsPii": boolean,
  "aiSafe": boolean,
  "reason": "explanation"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for consistent classification
        max_tokens: 300,
      });
      const result = JSON.parse(response.choices[0].message?.content || '{}');
      
      // Validate and provide defaults
      return {
        securityLevel: this.validateSecurityLevel(result.securityLevel),
        securityTags: Array.isArray(result.securityTags) ? result.securityTags : [],
        containsPii: Boolean(result.containsPii),
        aiSafe: Boolean(result.aiSafe),
        reason: result.reason || 'Automated classification'
      };
    } catch (error) {
      logger.error('Error classifying content security:', error);
      // Default to restricted for safety
      return {
        securityLevel: 'restricted',
        securityTags: ['unclassified'],
        containsPii: true,
        aiSafe: false,
        reason: 'Classification failed - defaulting to restricted'
      };
    }
  }

  /**
   * Create AI-safe version of content by removing sensitive information
   */
  async createAiSafeContent(content: string, securityClassification: SecurityClassification): Promise<string> {
    if (securityClassification.aiSafe) {
      return content; // Already safe
    }

    try {
      const prompt = `Remove or replace sensitive information from this content while preserving its usefulness for content creation:

Original Content: "${content}"

Security Issues: ${securityClassification.securityTags.join(', ')}

Instructions:
1. Replace PII with placeholders like [PERSON_NAME], [EMAIL], [PHONE]
2. Replace financial data with [AMOUNT], [REVENUE]
3. Replace proprietary info with [COMPANY_SPECIFIC_DETAIL]
4. Keep general structure and context intact
5. Preserve useful information for content creation

Return the sanitized content:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      });
      return response.choices[0].message?.content || '[CONTENT_REDACTED]';
    } catch (error) {
      logger.error('Error creating AI-safe content:', error);
      return '[CONTENT_REDACTED]'; // Safe fallback
    }
  }

  private validateSecurityLevel(level: string): SecurityLevel {
    const validLevels: SecurityLevel[] = ['public', 'internal', 'confidential', 'restricted'];
    return validLevels.includes(level as SecurityLevel) ? level as SecurityLevel : 'restricted';
  }

  // MARK: - File Upload Processing

  /**
   * Process uploaded RAG document (admin or user)
   */
  async processRagDocument(
    uploadData: FileUploadData,
    extractedText: string,
    contentSource: ContentSource,
    uploadedBy: string,
    orgId?: string
  ): Promise<string> {
    try {
      // Process and classify content
      const processed = await this.processContent(extractedText);
      
      // Store in rag_documents table
      const result = await db.insert(ragDocuments).values({
        contentSource,
        uploadedBy,
        orgId: orgId || null,
        filename: uploadData.filename,
        fileType: uploadData.fileType,
        fileSize: uploadData.fileSize,
        filePath: uploadData.filePath,
        title: uploadData.title,
        description: uploadData.description,
        extractedText,
        processedContent: processed.processedContent,
        embeddingVector: `[${processed.embedding.join(',')}]`, // Store as pgvector format
        embeddingProvider: embeddingService.getProviderName(),
        securityLevel: processed.securityClassification.securityLevel,
        securityTags: processed.securityClassification.securityTags,
        aiSafeContent: processed.aiSafeContent,
        contentCategory: uploadData.contentCategory,
        tags: uploadData.tags,
        processingStatus: 'completed',
        processedAt: new Date(),
      }).returning({ id: ragDocuments.id });

      logger.info(`Processed RAG document: ${uploadData.filename} (${contentSource})`);
      return result[0].id;
    } catch (error) {
      logger.error('Error processing RAG document:', error);
      throw error;
    }
  }

  /**
   * Process user upload
   */
  async processUserUpload(
    userId: string,
    orgId: string,
    uploadData: FileUploadData,
    extractedText: string,
    threadId?: string
  ): Promise<string> {
    try {
      const processed = await this.processContent(extractedText);
      
      const result = await db.insert(userUploads).values({
        userId,
        orgId,
        threadId: threadId || null,
        filename: uploadData.filename,
        fileType: uploadData.fileType,
        fileSize: uploadData.fileSize,
        filePath: uploadData.filePath,
        extractedText,
        embeddingVector: `[${processed.embedding.join(',')}]`, // Store as pgvector format
        embeddingProvider: embeddingService.getProviderName(),
        securityLevel: processed.securityClassification.securityLevel,
        securityTags: processed.securityClassification.securityTags,
        aiSafeContent: processed.aiSafeContent,
        containsPii: processed.securityClassification.containsPii,
        processingStatus: 'completed',
        processedAt: new Date(),
      }).returning({ id: userUploads.id });

      logger.info(`Processed user upload: ${uploadData.filename} for user ${userId}`);
      return result[0].id;
    } catch (error) {
      logger.error('Error processing user upload:', error);
      throw error;
    }
  }

  /**
   * Get available RAG documents for a user (admin global + user personal)
   */
  async getAvailableRagDocuments(
    userId: string, 
    orgId: string,
    securityLevel?: SecurityLevel
  ): Promise<any[]> {
    try {
      const securityLevels = this.getAccessibleSecurityLevels(securityLevel || 'internal');
      
      // Get admin global documents
      const globalDocs = await db.select({
        id: ragDocuments.id,
        title: ragDocuments.title,
        description: ragDocuments.description,
        contentCategory: ragDocuments.contentCategory,
        tags: ragDocuments.tags,
        securityLevel: ragDocuments.securityLevel,
        createdAt: ragDocuments.createdAt,
        source: sql<string>`'admin_global'`,
      })
      .from(ragDocuments)
      .where(and(
        eq(ragDocuments.contentSource, 'admin_global'),
        inArray(ragDocuments.securityLevel, securityLevels),
        eq(ragDocuments.processingStatus, 'completed')
      ))
      .orderBy(desc(ragDocuments.createdAt));

      // Get user personal documents
      const userDocs = await db.select({
        id: ragDocuments.id,
        title: ragDocuments.title,
        description: ragDocuments.description,
        contentCategory: ragDocuments.contentCategory,
        tags: ragDocuments.tags,
        securityLevel: ragDocuments.securityLevel,
        createdAt: ragDocuments.createdAt,
        source: sql<string>`'user_personal'`,
      })
      .from(ragDocuments)
      .where(and(
        eq(ragDocuments.contentSource, 'user_personal'),
        eq(ragDocuments.uploadedBy, userId),
        eq(ragDocuments.orgId, orgId),
        inArray(ragDocuments.securityLevel, securityLevels),
        eq(ragDocuments.processingStatus, 'completed')
      ))
      .orderBy(desc(ragDocuments.createdAt));

      return [...globalDocs, ...userDocs];
    } catch (error) {
      logger.error('Error getting available RAG documents:', error);
      return [];
    }
  }

  private async processContent(text: string): Promise<ProcessedContent> {
    // Classify security
    const securityClassification = await this.classifyContent(text);
    
    // Create AI-safe version
    const aiSafeContent = await this.createAiSafeContent(text, securityClassification);
    
    // Generate embedding (use AI-safe content for embedding)
    const embedding = await embeddingService.generateEmbedding(aiSafeContent);
    
    return {
      extractedText: text,
      processedContent: text.replace(/\s+/g, ' ').trim(), // Basic cleanup
      aiSafeContent,
      securityClassification,
      embedding,
    };
  }

  private getAccessibleSecurityLevels(userSecurityLevel: SecurityLevel): SecurityLevel[] {
    const levels: Record<SecurityLevel, SecurityLevel[]> = {
      'public': ['public'],
      'internal': ['public', 'internal'],
      'confidential': ['public', 'internal', 'confidential'],
      'restricted': ['public', 'internal', 'confidential', 'restricted']
    };
    return levels[userSecurityLevel] || ['public'];
  }

  // MARK: - Enhanced Content Search with Security Filtering

  /**
   * Search across all available content with security filtering using pgvector
   */
  async searchSecureContent(
    userId: string,
    orgId: string,
    query: string,
    options: {
      contentTypes?: ('conversation' | 'asset' | 'upload' | 'rag_document')[];
      workflowTypes?: string[];
      securityLevel?: SecurityLevel;
      limit?: number;
      minRelevanceScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const {
        contentTypes = ['conversation', 'asset', 'rag_document'],
        securityLevel = 'internal',
        limit = 10,
        minRelevanceScore = 0.7
      } = options;
      
      // Use pgvector search directly
      const results = await this.searchSecureContentPgVector(userId, orgId, query, {
        contentTypes,
        securityLevel,
        limit,
        maxDistance: 1.0 - minRelevanceScore, // Convert relevance to distance
        usePgVector: true
      });

      // Filter by minimum relevance score
      return results.filter(result => result.relevanceScore >= minRelevanceScore);

    } catch (error) {
      logger.error('Error searching secure content:', error);
      return [];
    }
  }

  /**
   * Enhanced semantic search using pgvector with native PostgreSQL vector operations
   */
  async searchSecureContentPgVector(
    userId: string,
    orgId: string,
    query: string,
    options: {
      contentTypes?: ('conversation' | 'asset' | 'upload' | 'rag_document')[];
      securityLevel?: SecurityLevel;
      limit?: number;
      maxDistance?: number;
      usePgVector?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      contentTypes = ['conversation', 'rag_document', 'upload'],
      securityLevel = 'internal',
      limit = 10,
      maxDistance = 1.0,
      usePgVector = true
    } = options;

    try {
      logger.info(`Performing pgvector search for user ${userId} in org ${orgId}`);
      
      // Generate query embedding
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      const queryVector = `[${queryEmbedding.join(',')}]`;
      
      const accessibleLevels = this.getAccessibleSecurityLevels(securityLevel);
      const results: SearchResult[] = [];

      // Search conversation embeddings with system context prioritization
      if (contentTypes.includes('conversation')) {
        // Create security level filter conditions
        const securityConditions = accessibleLevels.map(level => `security_level = '${level}'`).join(' OR ');
        
        const conversationResults = await db.execute(sql`
          SELECT 
            id,
            content_text as content,
            content_summary,
            workflow_type,
            step_name,
            security_level,
            created_at,
            'conversation' as source_type,
            embedding_vector <-> ${queryVector}::vector as distance,
            CASE 
              WHEN content_text ILIKE '%workflow%' OR content_text ILIKE '%system%' THEN 0.1
              ELSE 1.0 
            END as priority_boost
          FROM conversation_embeddings 
          WHERE user_id = ${userId} 
            AND org_id = ${orgId}
            AND (${sql.raw(securityConditions)})
            AND embedding_vector IS NOT NULL
          ORDER BY 
            priority_boost ASC,
            embedding_vector <-> ${queryVector}::vector ASC
          LIMIT ${Math.ceil(limit * 0.4)}
        `);

        conversationResults.forEach((row: any) => {
          if (row.distance <= maxDistance) {
            results.push({
              id: row.id,
              content: row.content_summary || row.content,
              relevanceScore: 1 - row.distance,
              source: 'conversation',
              context: {
                workflowType: row.workflow_type,
                stepName: row.step_name,
                distance: row.distance
              },
              createdAt: new Date(row.created_at),
              securityLevel: row.security_level
            });
          }
        });
      }

      // Search RAG documents with admin_global prioritization
      if (contentTypes.includes('rag_document')) {
        const securityConditions = accessibleLevels.map(level => `security_level = '${level}'`).join(' OR ');
        
        const documentResults = await db.execute(sql`
          SELECT 
            id,
            processed_content as content,
            filename,
            content_category,
            content_source,
            security_level,
            created_at,
            'document' as source_type,
            embedding_vector <-> ${queryVector}::vector as distance,
            CASE 
              WHEN content_source = 'admin_global' OR content_category = 'system-context' THEN 0.05
              WHEN filename ILIKE '%workflow%' OR processed_content ILIKE '%workflow%' THEN 0.1
              ELSE 1.0 
            END as priority_boost
          FROM rag_documents 
          WHERE (org_id = ${orgId} OR org_id IS NULL)
            AND (${sql.raw(securityConditions)})
            AND embedding_vector IS NOT NULL
            AND processing_status = 'completed'
          ORDER BY 
            priority_boost ASC,
            embedding_vector <-> ${queryVector}::vector ASC
          LIMIT ${Math.ceil(limit * 0.4)}
        `);

        documentResults.forEach((row: any) => {
          if (row.distance <= maxDistance) {
            results.push({
              id: row.id,
              content: row.content,
              relevanceScore: 1 - row.distance,
              source: 'rag_document',
              context: {
                fileName: row.filename,
                contentCategory: row.content_category,
                contentSource: row.content_source,
                distance: row.distance
              },
              createdAt: new Date(row.created_at),
              securityLevel: row.security_level
            });
          }
        });
      }

      // Search user uploads
      if (contentTypes.includes('upload')) {
        const securityConditions = accessibleLevels.map(level => `security_level = '${level}'`).join(' OR ');
        
        const uploadResults = await db.execute(sql`
          SELECT 
            id,
            extracted_text as content,
            filename,
            file_type,
            security_level,
            created_at,
            'upload' as source_type,
            embedding_vector <-> ${queryVector}::vector as distance
          FROM user_uploads 
          WHERE user_id = ${userId} 
            AND org_id = ${orgId}
            AND (${sql.raw(securityConditions)})
            AND embedding_vector IS NOT NULL
            AND processing_status = 'completed'
          ORDER BY embedding_vector <-> ${queryVector}::vector ASC
          LIMIT ${Math.ceil(limit * 0.2)}
        `);

        uploadResults.forEach((row: any) => {
          if (row.distance <= maxDistance) {
            results.push({
              id: row.id,
              content: row.content,
              relevanceScore: 1 - row.distance,
              source: 'upload',
              context: {
                fileName: row.filename,
                fileType: row.file_type,
                distance: row.distance
              },
              createdAt: new Date(row.created_at),
              securityLevel: row.security_level
            });
          }
        });
      }

      // Sort results by relevance score (highest first) with priority boost consideration
      results.sort((a, b) => {
        // Prioritize system context and workflow content
        const aPriority = a.context?.contentSource === 'admin_global' || a.context?.contentCategory === 'system-context' ? 2 : 
                        (a.content.toLowerCase().includes('workflow') ? 1 : 0);
        const bPriority = b.context?.contentSource === 'admin_global' || b.context?.contentCategory === 'system-context' ? 2 : 
                        (b.content.toLowerCase().includes('workflow') ? 1 : 0);
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        return b.relevanceScore - a.relevanceScore;
      });

      logger.info(`pgvector search completed successfully. Found ${results.length} results`);
      return results.slice(0, limit);

    } catch (error) {
      logger.error('pgvector search failed:', error);
      return [];
    }
  }
  
  // MARK: - Embedding Generation
  
  /**
   * Generate embeddings using the configured embedding service
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await embeddingService.generateEmbedding(text);
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }
  
  // MARK: - Knowledge Management
  
  /**
   * Store or update user knowledge base
   */
  async storeUserKnowledge(knowledge: UserKnowledge): Promise<void> {
    try {
      await db.insert(userKnowledgeBase).values({
        userId: knowledge.userId,
        orgId: knowledge.orgId,
        companyName: knowledge.companyName,
        companyDescription: knowledge.companyDescription,
        industry: knowledge.industry,
        companySize: knowledge.companySize,
        headquarters: knowledge.headquarters,
        jobTitle: knowledge.jobTitle,
        preferredTone: knowledge.preferredTone,
        preferredWorkflows: knowledge.preferredWorkflows,
        defaultPlatforms: knowledge.defaultPlatforms,
        writingStylePreferences: knowledge.writingStylePreferences,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [userKnowledgeBase.userId, userKnowledgeBase.orgId],
        set: {
          companyName: knowledge.companyName,
          companyDescription: knowledge.companyDescription,
          industry: knowledge.industry,
          companySize: knowledge.companySize,
          headquarters: knowledge.headquarters,
          jobTitle: knowledge.jobTitle,
          preferredTone: knowledge.preferredTone,
          preferredWorkflows: knowledge.preferredWorkflows,
          defaultPlatforms: knowledge.defaultPlatforms,
          writingStylePreferences: knowledge.writingStylePreferences,
          updatedAt: new Date(),
        },
      });
      
      logger.info(`Updated knowledge base for user ${knowledge.userId}`);
    } catch (error) {
      logger.error('Error storing user knowledge:', error);
      throw error;
    }
  }
  
  /**
   * Get user knowledge base
   */
  async getUserKnowledge(userId: string, orgId: string): Promise<UserKnowledge | null> {
    try {
      const result = await db.select()
        .from(userKnowledgeBase)
        .where(and(
          eq(userKnowledgeBase.userId, userId),
          eq(userKnowledgeBase.orgId, orgId)
        ))
        .limit(1);
      
      if (result.length === 0) return null;
      
      const kb = result[0];
      return {
        userId: kb.userId,
        orgId: kb.orgId,
        companyName: kb.companyName || undefined,
        companyDescription: kb.companyDescription || undefined,
        industry: kb.industry || undefined,
        companySize: kb.companySize || undefined,
        headquarters: kb.headquarters || undefined,
        jobTitle: kb.jobTitle || undefined,
        preferredTone: kb.preferredTone || undefined,
        preferredWorkflows: kb.preferredWorkflows as string[] || undefined,
        defaultPlatforms: kb.defaultPlatforms as string[] || undefined,
        writingStylePreferences: kb.writingStylePreferences as Record<string, any> || undefined,
      };
    } catch (error) {
      logger.error('Error getting user knowledge:', error);
      throw error;
    }
  }
  
  // MARK: - Conversation Tracking
  
  /**
   * Store conversation with embeddings for future retrieval
   */
  async storeConversation(
    userId: string,
    orgId: string,
    context: ConversationContext,
    contentText: string,
    contentSummary?: string,
    structuredData?: Record<string, any>
  ): Promise<string> {
    try {
      // Generate embedding for the conversation
      const embedding = await embeddingService.generateEmbedding(
        context.securityLevel === 'restricted' 
          ? contentSummary || contentText.slice(0, 500) // Use summary for restricted content
          : contentText
      );
      
      const result = await db.insert(conversationEmbeddings).values({
        userId,
        orgId,
        threadId: context.threadId,
        workflowId: context.workflowId,
        contentType: 'conversation',
        contentText,
        contentSummary,
        structuredData,
        embeddingVector: `[${embedding.join(',')}]`, // Store as pgvector format
        embeddingProvider: embeddingService.getProviderName(),
        workflowType: context.workflowType,
        stepName: context.stepName,
        intent: context.intent,
        outcome: context.outcome,
        securityLevel: context.securityLevel,
        securityTags: context.securityTags,
      }).returning({ id: conversationEmbeddings.id });
      
      logger.info(`Stored conversation embedding for user ${userId} with provider ${embeddingService.getProviderName()}`);
      return result[0].id;
    } catch (error) {
      logger.error('Error storing conversation:', error);
      throw error;
    }
  }
  
  /**
   * Store asset history with feedback
   */
  async storeAssetHistory(
    userId: string,
    orgId: string,
    threadId: string,
    workflowId: string | undefined,
    assetData: {
      assetType: string;
      originalContent: string;
      finalContent?: string;
      userSatisfaction?: number;
      feedbackText?: string;
      approved?: boolean;
      successfulPatterns?: Record<string, any>;
      improvementAreas?: Record<string, any>;
    }
  ): Promise<string> {
    try {
      const result = await db.insert(assetHistory).values({
        userId,
        orgId,
        threadId,
        workflowId,
        ...assetData,
      }).returning({ id: assetHistory.id });
      
      logger.info(`Stored asset history for user ${userId}`);
      return result[0].id;
    } catch (error) {
      logger.error('Error storing asset history:', error);
      throw error;
    }
  }
  
  // MARK: - Smart Defaults & Recommendations
  
  /**
   * Get smart defaults for a user and workflow type
   */
  async getSmartDefaults(
    userId: string,
    orgId: string,
    workflowType: string
  ): Promise<SmartDefaults> {
    try {
      // Get user's knowledge base
      const userKb = await this.getUserKnowledge(userId, orgId);
      
      // Get recent successful assets of this type
      const recentAssets = await db.select({
        originalContent: assetHistory.originalContent,
        finalContent: assetHistory.finalContent,
        assetType: assetHistory.assetType,
        userSatisfaction: assetHistory.userSatisfaction,
        createdAt: assetHistory.createdAt,
      })
      .from(assetHistory)
      .where(and(
        eq(assetHistory.userId, userId),
        eq(assetHistory.assetType, workflowType),
        eq(assetHistory.approved, true),
        gte(assetHistory.userSatisfaction, 4)
      ))
      .orderBy(desc(assetHistory.createdAt))
      .limit(3);
      
      // Build smart defaults
      const defaults: SmartDefaults = {
        companyName: userKb?.companyName,
        industry: userKb?.industry,
        preferredTone: userKb?.preferredTone,
      };
      
      // Add related examples from successful assets
      if (recentAssets.length > 0) {
        defaults.relatedExamples = recentAssets.map(asset => ({
          type: asset.assetType || 'Unknown',
          content: asset.finalContent || asset.originalContent,
          context: `Successful ${asset.assetType || 'asset'} (rated ${asset.userSatisfaction}/5)`,
        }));
      }
      
      // Generate suggested content based on user history
      if (userKb?.companyName && userKb?.industry) {
        defaults.suggestedContent = await this.generateSuggestedContent(
          userKb,
          workflowType,
          recentAssets
        );
      }
      
      return defaults;
    } catch (error) {
      logger.error('Error getting smart defaults:', error);
      return {};
    }
  }
  
  /**
   * Generate suggested content based on user history
   */
  private async generateSuggestedContent(
    userKb: UserKnowledge,
    workflowType: string,
    recentAssets: any[]
  ): Promise<string> {
    try {
      let prompt = `Based on the following company information and successful examples, suggest content for a new ${workflowType}:

Company: ${userKb.companyName}
Industry: ${userKb.industry}
Preferred Tone: ${userKb.preferredTone || 'professional'}`;

      if (recentAssets.length > 0) {
        prompt += `\n\nSuccessful examples:\n`;
        recentAssets.slice(0, 2).forEach((asset, index) => {
          prompt += `${index + 1}. ${asset.finalContent?.slice(0, 200)}...\n`;
        });
      }

      prompt += `\n\nProvide a brief, relevant suggestion for starting a new ${workflowType}:`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.7,
      });
      return response.choices[0].message?.content || '';
    } catch (error) {
      logger.error('Error generating suggested content:', error);
      return '';
    }
  }
  
  // MARK: - Context-Aware Retrieval
  
  /**
   * Get relevant context for a current workflow step using pgvector search
   */
  async getRelevantContext(
    userId: string,
    orgId: string,
    currentWorkflowType: string,
    currentStepName: string,
    userQuery?: string
  ): Promise<{
    relatedConversations: SearchResult[];
    similarAssets: SearchResult[];
    userDefaults: SmartDefaults;
  }> {
    try {
      const searchQuery = userQuery || `${currentWorkflowType} ${currentStepName}`;
      
      // Search for similar conversations and assets using pgvector
      const searchResults = await this.searchSecureContentPgVector(userId, orgId, searchQuery, {
        contentTypes: ['conversation', 'rag_document'],
        securityLevel: 'internal',
        limit: 6,
        maxDistance: 0.4, // Higher relevance threshold
        usePgVector: true
      });
      
      // Separate by type
      const relatedConversations = searchResults.filter(r => r.source === 'conversation');
      const similarAssets = searchResults.filter(r => r.source === 'rag_document');
      
      // Get smart defaults
      const userDefaults = await this.getSmartDefaults(userId, orgId, currentWorkflowType);
      
      return {
        relatedConversations,
        similarAssets,
        userDefaults,
      };
    } catch (error) {
      logger.error('Error getting relevant context:', error);
      return {
        relatedConversations: [],
        similarAssets: [],
        userDefaults: {},
      };
    }
  }

  /**
   * DUAL RAG CONTEXT RETRIEVAL - Separate calls for global workflow knowledge and organization context
   */
  async getDualRAGContext(
    userId: string,
    orgId: string,
    workflowType: string,
    stepName: string,
    userInput: string,
    securityLevel: string = 'internal'
  ): Promise<{
    globalWorkflowKnowledge: SearchResult[];
    organizationContext: SearchResult[];
    combinedContext: SearchResult[];
    performance: {
      globalQueryTime: number;
      orgQueryTime: number;
      totalTime: number;
    };
    contextSources: {
      globalSources: number;
      orgSources: number;
      totalRelevance: number;
    };
    userDefaults: SmartDefaults;
  }> {
    const startTime = Date.now();
    
    try {
      logger.info('🔄 DUAL RAG CONTEXT RETRIEVAL STARTED', {
        userId: userId.substring(0, 8),
        orgId: orgId.substring(0, 8),
        workflowType,
        stepName,
        securityLevel,
        queryLength: userInput.length
      });

      // PARALLEL PROCESSING: Execute all RAG calls simultaneously
      const globalQuery = `${workflowType} ${stepName} workflow template best practices process guide`;
      const orgQuery = `${userInput} company brand messaging context previous work`;
      
      const [globalResults, orgResults, userDefaults] = await Promise.all([
        // CALL 1: Global Workflow Knowledge (admin_global documents)
        this.searchSecureContentPgVector(userId, orgId, globalQuery, {
          contentTypes: ['rag_document'],
          securityLevel: securityLevel as SecurityLevel,
          limit: 5,
          maxDistance: 0.4,
          usePgVector: true
        }).then(results => ({
          results,
          queryTime: Date.now() - startTime
        })),
        
        // CALL 2: Organization Context (user_personal, conversations, assets)
        this.searchSecureContentPgVector(userId, orgId, orgQuery, {
          contentTypes: ['rag_document', 'conversation', 'asset'],
          securityLevel: securityLevel as SecurityLevel,
          limit: 5,
          maxDistance: 0.5,
          usePgVector: true
        }).then(results => ({
          results,
          queryTime: Date.now() - startTime
        })),
        
                 // CALL 3: User defaults (parallel with searches) - cached for performance
         withCache(
           `user-defaults:${userId}:${orgId}:${workflowType}`,
           () => this.getSmartDefaults(userId, orgId, workflowType),
           { ttl: 300 } // 5 minutes cache for user defaults
         )
      ]);
      
      // Filter results with timing info
      const globalWorkflowKnowledge = globalResults.results.filter(
        result => result.context?.contentSource === 'admin_global'
      );
      
      const organizationContext = orgResults.results.filter(
        result => result.context?.contentSource === 'user_personal' || 
                 result.source === 'conversation' ||
                 result.source === 'asset'
      );
      
      const globalQueryTime = globalResults.queryTime;
      const orgQueryTime = orgResults.queryTime;

      // Combine and rank by relevance, with global context prioritized for workflow guidance
      const combinedContext = [
        ...globalWorkflowKnowledge.map(r => ({ ...r, priority: 'global' as const })),
        ...organizationContext.map(r => ({ ...r, priority: 'organization' as const }))
      ].sort((a, b) => b.relevanceScore - a.relevanceScore);

      const totalTime = Date.now() - startTime;
      const totalRelevance = combinedContext.reduce((sum, r) => sum + r.relevanceScore, 0);

      const result = {
        globalWorkflowKnowledge,
        organizationContext,
        combinedContext,
        performance: {
          globalQueryTime,
          orgQueryTime,
          totalTime
        },
        contextSources: {
          globalSources: globalWorkflowKnowledge.length,
          orgSources: organizationContext.length,
          totalRelevance
        },
        userDefaults
      };

      logger.info('✅ DUAL RAG CONTEXT RETRIEVAL COMPLETED', {
        userId: userId.substring(0, 8),
        globalSources: globalWorkflowKnowledge.length,
        orgSources: organizationContext.length,
        globalQueryTime,
        orgQueryTime,
        totalTime,
        avgRelevance: totalRelevance / Math.max(combinedContext.length, 1),
        topGlobalRelevance: globalWorkflowKnowledge[0]?.relevanceScore || 0,
        topOrgRelevance: organizationContext[0]?.relevanceScore || 0
      });

      return result;
    } catch (error) {
      logger.error('❌ DUAL RAG CONTEXT RETRIEVAL ERROR', { 
        error: error instanceof Error ? error.message : String(error), 
        userId: userId.substring(0, 8),
        workflowType,
        stepName 
      });
      
      // Return empty context on error
      return {
        globalWorkflowKnowledge: [],
        organizationContext: [],
        combinedContext: [],
        performance: {
          globalQueryTime: 0,
          orgQueryTime: 0,
          totalTime: Date.now() - startTime
        },
        contextSources: {
          globalSources: 0,
          orgSources: 0,
          totalRelevance: 0
        },
        userDefaults: await this.getSmartDefaults(userId, orgId, workflowType).catch(() => ({}))
      };
    }
  }
  
  // MARK: - Learning & Improvement
  
  /**
   * Update user knowledge based on workflow completion
   */
  async updateKnowledgeFromWorkflow(
    userId: string,
    orgId: string,
    workflowData: {
      workflowType: string;
      collectedData: Record<string, any>;
      userSatisfaction?: number;
      completed: boolean;
    }
  ): Promise<void> {
    try {
      const existingKnowledge = await this.getUserKnowledge(userId, orgId);
      
      // Extract learnable information from workflow
      const updates: Partial<UserKnowledge> = {
        userId,
        orgId,
      };
      
      // Update company information if provided
      if (workflowData.collectedData.companyName) {
        updates.companyName = workflowData.collectedData.companyName;
      }
      
      if (workflowData.collectedData.industry) {
        updates.industry = workflowData.collectedData.industry;
      }
      
      if (workflowData.collectedData.tone) {
        updates.preferredTone = workflowData.collectedData.tone;
      }
      
      // Update preferred workflows based on successful completions
      if (workflowData.completed && workflowData.userSatisfaction && workflowData.userSatisfaction >= 4) {
        const currentPreferred = existingKnowledge?.preferredWorkflows || [];
        if (!currentPreferred.includes(workflowData.workflowType)) {
          updates.preferredWorkflows = [...currentPreferred, workflowData.workflowType];
        }
      }
      
      // Store updated knowledge
      if (Object.keys(updates).length > 2) { // More than just userId and orgId
        await this.storeUserKnowledge({
          ...existingKnowledge,
          ...updates,
        } as UserKnowledge);
      }
      
      logger.info(`Updated knowledge from workflow completion for user ${userId}`);
    } catch (error) {
      logger.error('Error updating knowledge from workflow:', error);
    }
  }

  /**
   * Delete a RAG document
   */
  async deleteRagDocument(
    documentId: string, 
    userId: string, 
    orgId?: string
  ): Promise<boolean> {
    try {
      // First check if document exists and user has permission
      const document = await db.select()
        .from(ragDocuments)
        .where(eq(ragDocuments.id, documentId))
        .limit(1);

      if (document.length === 0) {
        throw new Error('Document not found');
      }

      const doc = document[0];

      // Check permissions
      if (doc.contentSource === 'admin_global') {
        // Only admin can delete global docs (for now, we'll allow any user for testing)
        // TODO: Add proper admin check
      } else if (doc.contentSource === 'user_personal') {
        // User can only delete their own documents
        if (doc.uploadedBy !== userId || doc.orgId !== orgId) {
          throw new Error('Permission denied: You can only delete your own documents');
        }
      }

      // Delete the document
      const result = await db.delete(ragDocuments)
        .where(eq(ragDocuments.id, documentId))
        .returning({ id: ragDocuments.id });

      if (result.length === 0) {
        throw new Error('Failed to delete document');
      }

      logger.info(`Deleted RAG document: ${documentId} by user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting RAG document:', error);
      throw error;
    }
  }
  
  // MARK: - Cache Management
  
  /**
   * Clear expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      const result = await db.delete(knowledgeCache)
        .where(lte(knowledgeCache.expiresAt, new Date()))
        .returning({ id: knowledgeCache.id });
      
      logger.info(`Cleaned up ${result.length} expired cache entries`);
      return result.length;
    } catch (error) {
      logger.error('Error cleaning up cache:', error);
      return 0;
    }
  }
}

export const ragService = new RAGService(); 