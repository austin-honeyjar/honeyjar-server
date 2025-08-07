import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Honeyjar API',
      version: '1.0.0',
      description: 'API for Honeyjar application',
    },
    servers: [
      {
        url: 'http://localhost:3005',
        description: 'Development server',
      },
      {
        url: 'https://honeyjar-development-734191217628.us-central1.run.app',
        description: 'Development Cloud Run server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Thread: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the thread',
            },
            userId: {
              type: 'string',
              description: 'ID of the user who owns the thread',
            },
            title: {
              type: 'string',
              description: 'Title of the thread',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the thread was created',
            },
          },
          required: ['id', 'userId', 'title', 'createdAt'],
        },
        Asset: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the asset',
            },
            threadId: {
              type: 'string',
              format: 'uuid',
              description: 'ID of the thread this asset belongs to',
            },
            workflowId: {
              type: 'string',
              format: 'uuid',
              description: 'ID of the workflow that created this asset (optional)',
            },
            organizationId: {
              type: 'string',
              description: 'ID of the organization this asset belongs to (optional)',
            },
            name: {
              type: 'string',
              description: 'Name of the asset',
            },
            type: {
              type: 'string',
              description: 'Type of asset (e.g., "Press Release", "Media Pitch")',
            },
            title: {
              type: 'string',
              description: 'Title of the asset',
            },
            subtitle: {
              type: 'string',
              description: 'Subtitle of the asset (optional)',
            },
            content: {
              type: 'string',
              description: 'Content of the asset',
            },
            author: {
              type: 'string',
              description: 'ID of the user who created the asset',
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata for the asset (optional)',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the asset was created',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the asset was last updated',
            },
          },
          required: ['id', 'threadId', 'name', 'type', 'title', 'content', 'author', 'createdAt', 'updatedAt'],
        },
        Message: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the message',
            },
            threadId: {
              type: 'string',
              format: 'uuid',
              description: 'ID of the thread this message belongs to',
            },
            userId: {
              type: 'string',
              description: 'ID of the user who sent the message',
            },
            role: {
              type: 'string',
              enum: ['user', 'assistant'],
              description: 'Role of the message sender',
            },
            content: {
              type: 'string',
              description: 'Content of the message',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the message was created',
            },
          },
          required: ['id', 'threadId', 'userId', 'role', 'content', 'createdAt'],
        },
        Article: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the article',
            },
            title: {
              type: 'string',
              description: 'Title of the article',
            },
            summary: {
              type: 'string',
              description: 'Brief summary or description of the article',
            },
            content: {
              type: 'string',
              description: 'Full content of the article (optional)',
            },
            url: {
              type: 'string',
              format: 'uri',
              description: 'URL to the original article',
            },
            source: {
              type: 'string',
              description: 'Name of the news source/publication',
            },
            publishedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the article was published',
            },
            updateDate: {
              type: 'string',
              format: 'date-time',
              description: 'When the article was last updated (optional)',
            },
            author: {
              type: 'string',
              description: 'Author of the article (optional)',
            },
            topics: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of topics/categories related to the article',
            },
            licenses: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of license names for compliance tracking',
              example: ['NLA', 'Reuters']
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata about the article (optional)',
              properties: {
                sequenceId: {
                  type: 'string',
                  description: 'Sequence ID for pagination and avoiding duplicates'
                },
                language: {
                  type: 'string',
                  description: 'Language of the article'
                },
                wordCount: {
                  type: 'integer',
                  description: 'Number of words in the article'
                }
              }
            },
          },
          required: ['id', 'title', 'summary', 'url', 'source', 'publishedAt', 'topics', 'licenses'],
        },
        ArticleSearchResponse: {
          type: 'object',
          properties: {
            articles: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Article'
              },
              description: 'Array of articles matching the search criteria',
            },
            totalCount: {
              type: 'integer',
              description: 'Total number of articles available (for pagination)',
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more articles available',
            },
            nextPage: {
              type: 'string',
              description: 'Token or URL for the next page of results (optional)',
            },
            lastSequenceId: {
              type: 'string',
              description: 'Sequence ID from the last article - use this for the next API call to avoid duplicates (optional)',
              example: '1782454301592'
            },
          },
          required: ['articles', 'totalCount', 'hasMore'],
        },
        RevokedArticlesResponse: {
          type: 'object',
          properties: {
            revokedArticles: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of article IDs that have been revoked and should be removed from your system',
            },
            sequenceId: {
              type: 'string',
              description: 'Next sequence ID to use for pagination in subsequent requests',
              example: '12345'
            },
            totalCount: {
              type: 'integer',
              description: 'Total number of revoked articles in this response',
            },
          },
          required: ['revokedArticles', 'sequenceId', 'totalCount'],
        },
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error',
              description: 'Status of the response',
            },
            message: {
              type: 'string',
              description: 'Error message describing what went wrong',
            },
            error: {
              type: 'string',
              description: 'Detailed error information (only in development)',
            },
          },
          required: ['status', 'message'],
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'ok',
              description: 'Health status of the service',
            },
            message: {
              type: 'string',
              example: 'Server is running',
              description: 'Health check message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when the health check was performed',
            },
            environment: {
              type: 'string',
              description: 'Current environment (development, production, etc.)',
            },
          },
          required: ['status', 'message', 'timestamp'],
        },
        TestResult: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Whether the test was successful',
            },
            category: {
              type: 'string',
              enum: ['context', 'security', 'rag', 'workflow', 'integration', 'all'],
              description: 'Test category',
            },
            tests: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Test name',
                  },
                  passed: {
                    type: 'boolean',
                    description: 'Whether the test passed',
                  },
                  duration: {
                    type: 'number',
                    description: 'Test duration in milliseconds',
                  },
                  error: {
                    type: 'string',
                    description: 'Error message if test failed',
                  },
                  data: {
                    type: 'object',
                    description: 'Test result data',
                  },
                },
              },
            },
            summary: {
              type: 'string',
              description: 'Summary of test results',
            },
          },
          required: ['success', 'category', 'tests', 'summary'],
        },
        SecurityClassification: {
          type: 'object',
          properties: {
            securityLevel: {
              type: 'string',
              enum: ['public', 'internal', 'confidential', 'restricted'],
              description: 'Detected security level',
            },
            detectedSensitiveInfo: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Types of sensitive information detected',
            },
            confidence: {
              type: 'number',
              description: 'Confidence score for classification',
            },
            piiDetected: {
              type: 'boolean',
              description: 'Whether PII was detected',
            },
            phiDetected: {
              type: 'boolean',
              description: 'Whether PHI was detected',
            },
            financialDetected: {
              type: 'boolean',
              description: 'Whether financial data was detected',
            },
          },
          required: ['securityLevel', 'detectedSensitiveInfo', 'confidence'],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);

export const swaggerUiOptions = {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Honeyjar API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: -1,
    displayRequestDuration: true,
  },
}; 