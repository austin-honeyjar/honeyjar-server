import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

// Enhanced security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.clerk.dev"],
      frameSrc: ["'self'", "https://clerk.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

// Rate limiting
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per window (reasonable for production with monitoring)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again later',
  // Skip validation in Cloud Run environment
  validate: { trustProxy: false, xForwardedForHeader: false },
  // Use IP detection appropriate for Cloud Run
  keyGenerator: (req, _res) => {
    // In Cloud Run, the X-Forwarded-For header contains the real client IP
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    const ip = xForwardedFor ? xForwardedFor.split(',')[0].trim() : req.ip || 'unknown-ip';
    return ip;
  }
}); 