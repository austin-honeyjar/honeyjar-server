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
        url: 'https://honeyjar-server-sandbox-734191217628.us-central1.run.app',
        description: 'Sandbox Cloud Run server',
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