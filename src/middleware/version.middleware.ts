import { Response, NextFunction } from 'express';
import { config } from '../config/index';
import logger from '../utils/logger';
import { VersionedRequest } from '../types/request';

// Supported API versions
const SUPPORTED_VERSIONS = ['v1'];
const DEFAULT_VERSION = 'v1';

export const versionMiddleware = (
  req: VersionedRequest,
  res: Response,
  next: NextFunction
) => {
  // Get version from Accept header or URL
  const acceptHeader = req.headers.accept || '';
  const urlVersion = req.path.split('/')[2]; // /api/v1/...
  
  let requestedVersion = DEFAULT_VERSION;
  
  // Check Accept header for version
  if (acceptHeader.includes('version=')) {
    const versionMatch = acceptHeader.match(/version=([^,;]+)/);
    if (versionMatch) {
      requestedVersion = versionMatch[1];
    }
  }
  
  // URL version takes precedence
  if (urlVersion && SUPPORTED_VERSIONS.includes(urlVersion)) {
    requestedVersion = urlVersion;
  }

  // Validate version
  if (!SUPPORTED_VERSIONS.includes(requestedVersion)) {
    return res.status(400).json({
      status: 'error',
      message: `Unsupported API version. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      supportedVersions: SUPPORTED_VERSIONS,
    });
  }

  // Add version info to request
  req.apiVersion = requestedVersion;

  // Add version headers to response
  res.setHeader('X-API-Version', requestedVersion);
  res.setHeader('X-API-Versions-Supported', SUPPORTED_VERSIONS.join(', '));
  
  // Add deprecation warning if using older version
  if (requestedVersion !== DEFAULT_VERSION) {
    res.setHeader('Warning', `299 - "Version ${requestedVersion} is not the latest. Consider upgrading to ${DEFAULT_VERSION}."`);
  }

  logger.debug('API version negotiation', {
    requestedVersion,
    urlVersion,
    acceptHeader,
    path: req.path,
  });

  next();
}; 