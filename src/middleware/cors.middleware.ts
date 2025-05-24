import cors from 'cors';

const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : [
      'http://localhost:3000', 
      'http://localhost:5173',  // Vite default port
      'http://localhost:3001',
      'https://app.development.honey-jar.dev',
      'https://honey-jar.dev',
      'https://clerk.honey-jar.dev'
    ];

const isDev = process.env.NODE_ENV === 'development';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }

    // In development mode, be more permissive with CORS
    if (isDev) {
      console.log('CORS: Development mode, allowing origin:', origin);
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS: Blocked request from origin:', origin);
      console.warn('CORS: Allowed origins are:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'X-Requested-With',
    'Origin',
    'x-organization-id',
    'x-clerk-auth-status'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  credentials: true,
  maxAge: 86400 // 24 hours
}); 