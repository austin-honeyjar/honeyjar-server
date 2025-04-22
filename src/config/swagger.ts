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