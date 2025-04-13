import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Honeyjar API',
      version: '1.0.0',
      description: 'API documentation for the Honeyjar server',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:3005/api',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your Clerk session token in the format: Bearer <token>'
        },
        clerkAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Clerk authentication token',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'error',
            },
            message: {
              type: 'string',
              example: 'Error message',
            },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              example: 'ok',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds',
            },
          },
        },
        CSVTable: {
          type: 'object',
          properties: {
            id: {
              type: 'number',
              description: 'Table ID',
            },
            tableName: {
              type: 'string',
              description: 'Name of the table',
            },
            fileName: {
              type: 'string',
              description: 'Original file name',
            },
            columnNames: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Column names in the table',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            data: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
              description: 'Table data',
            },
          },
        },
        CreateTableRequest: {
          type: 'object',
          required: ['columns', 'data', 'fileName'],
          properties: {
            columns: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Column names',
            },
            data: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              description: 'Table data rows',
            },
            fileName: {
              type: 'string',
              description: 'Original file name',
            },
          },
        },
      },
      parameters: {
        version: {
          in: 'header',
          name: 'Accept',
          description: 'API version',
          schema: {
            type: 'string',
            default: 'application/json; version=v1',
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
      {
        clerkAuth: [],
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check endpoints',
      },
      {
        name: 'Auth',
        description: 'Authentication related endpoints',
      },
      {
        name: 'CSV',
        description: 'CSV table management endpoints',
      },
      {
        name: 'v1',
        description: 'Version 1 of the API',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/routes/**/*.ts'],
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