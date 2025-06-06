import { Router } from 'express';
import { RocketReachService } from '../services/rocketreach.service';
import logger from '../utils/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { 
  validateRequest, 
  sanitizeInput,
  rocketReachPersonLookupSchema,
  rocketReachPersonSearchSchema,
  rocketReachCompanySearchSchema,
  rocketReachCompanyLookupSchema,
  rocketReachBulkLookupSchema,
  rocketReachLookupStatusSchema
} from '../middleware/validation.middleware';
import { rocketReachDBService } from '../services/rocketreachDB.service';

const router = Router();
const rocketReachService = new RocketReachService();

/**
 * @openapi
 * /api/v1/rocketreach/account:
 *   get:
 *     tags:
 *       - RocketReach API
 *     summary: Get account details and usage information
 *     description: |
 *       Retrieve your RocketReach account details including plan information, 
 *       credits remaining, and usage statistics.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     account:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         plan:
 *                           type: string
 *                         credits_remaining:
 *                           type: number
 *                         credits_used:
 *                           type: number
 *                         credits_total:
 *                           type: number
 *                         monthly_reset_date:
 *                           type: string
 *                           format: date
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal server error
 */
router.get('/account', 
  sanitizeInput,
  authMiddleware, 
  async (req, res) => {
    try {
      logger.info('📋 Fetching RocketReach account details', {
        userId: req.user?.id
      });

      const result = await rocketReachService.getAccount();

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error fetching RocketReach account details', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch account details',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/person/lookup:
 *   get:
 *     tags:
 *       - RocketReach API
 *     summary: Lookup a person by various identifiers
 *     description: |
 *       Find a specific person's contact information using identifiers like name, 
 *       email, current employer, or LinkedIn URL. Returns email addresses, phone numbers, 
 *       and professional information.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Full name of the person
 *       - in: query
 *         name: first_name
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: First name (use with last_name)
 *       - in: query
 *         name: last_name
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Last name (use with first_name)
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         description: Known email address
 *       - in: query
 *         name: current_employer
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Current company name
 *       - in: query
 *         name: current_title
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Current job title
 *       - in: query
 *         name: linkedin_url
 *         schema:
 *           type: string
 *           format: uri
 *         description: LinkedIn profile URL
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Location (city, state, or country)
 *     responses:
 *       200:
 *         description: Person lookup completed successfully
 *       400:
 *         description: Invalid parameters or missing required identifiers
 *       404:
 *         description: Person not found
 *       500:
 *         description: Internal server error
 */
router.get('/person/lookup', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachPersonLookupSchema),
  async (req, res) => {
    try {
      const lookupParams = req.validatedData;

      logger.info('🔍 Looking up person via RocketReach API', {
        userId: req.user?.id,
        lookupParams: {
          hasName: !!(lookupParams.name || (lookupParams.first_name && lookupParams.last_name)),
          hasEmail: !!lookupParams.email,
          hasEmployer: !!lookupParams.current_employer,
          hasLinkedIn: !!lookupParams.linkedin_url
        }
      });

      const result = await rocketReachService.lookupPerson(lookupParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error looking up person via RocketReach API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to lookup person',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/person/checkStatus:
 *   get:
 *     tags:
 *       - RocketReach API
 *     summary: Check the status of a person lookup request
 *     description: |
 *       Check the status of an asynchronous person lookup request. 
 *       Returns complete, failed, waiting, searching, or in progress status.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Lookup request ID from previous lookup
 *     responses:
 *       200:
 *         description: Status check completed successfully
 *       400:
 *         description: Invalid or missing lookup ID
 *       404:
 *         description: Lookup request not found
 *       500:
 *         description: Internal server error
 */
router.get('/person/checkStatus', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachLookupStatusSchema),
  async (req, res) => {
    try {
      const { id } = req.validatedData;

      logger.info('⏱️ Checking person lookup status via RocketReach API', {
        userId: req.user?.id,
        lookupId: id
      });

      const result = await rocketReachService.checkPersonLookupStatus(id);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error checking person lookup status', {
        userId: req.user?.id,
        lookupId: req.query.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to check lookup status',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/person/search:
 *   post:
 *     tags:
 *       - RocketReach API
 *     summary: Search for people by criteria
 *     description: |
 *       Search across 700M+ professional profiles using various criteria 
 *       such as name, company, title, location, or keywords. Returns a list 
 *       of matching profiles without contact information.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 description: Person's name
 *               current_employer:
 *                 type: string
 *                 maxLength: 100
 *                 description: Company name
 *               current_title:
 *                 type: string
 *                 maxLength: 100
 *                 description: Job title
 *               location:
 *                 type: string
 *                 maxLength: 100
 *                 description: Geographic location
 *               keyword:
 *                 type: string
 *                 maxLength: 100
 *                 description: Search keyword
 *               start:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 description: Pagination offset
 *               size:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 25
 *                 default: 10
 *                 description: Number of results per page
 *     responses:
 *       200:
 *         description: Search completed successfully
 *       400:
 *         description: Invalid search parameters
 *       500:
 *         description: Internal server error
 */
router.post('/person/search', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachPersonSearchSchema),
  async (req, res) => {
    try {
      const searchParams = req.validatedData;

      logger.info('🔍 Searching people via RocketReach API', {
        userId: req.user?.id,
        searchParams: {
          searchTerms: Object.keys(searchParams).filter(key => searchParams[key as keyof typeof searchParams]),
          start: searchParams.start,
          size: searchParams.size
        }
      });

      const result = await rocketReachService.searchPeople(searchParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error searching people via RocketReach API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to search people',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/bulkLookup:
 *   post:
 *     tags:
 *       - RocketReach API
 *     summary: Bulk lookup multiple people
 *     description: |
 *       Perform bulk lookups for multiple people simultaneously. 
 *       Requires 10-100 lookups per batch and a webhook URL for results.
 *       This is an asynchronous operation - results are delivered to your webhook.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lookups
 *             properties:
 *               lookups:
 *                 type: array
 *                 minItems: 10
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       maxLength: 100
 *                     first_name:
 *                       type: string
 *                       maxLength: 50
 *                     last_name:
 *                       type: string
 *                       maxLength: 50
 *                     current_employer:
 *                       type: string
 *                       maxLength: 100
 *                     current_title:
 *                       type: string
 *                       maxLength: 100
 *                     email:
 *                       type: string
 *                       format: email
 *                     linkedin_url:
 *                       type: string
 *                       format: uri
 *               webhook_id:
 *                 type: string
 *                 format: uuid
 *                 description: Optional webhook ID for results delivery
 *     responses:
 *       200:
 *         description: Bulk lookup request submitted successfully
 *       400:
 *         description: Invalid parameters or insufficient lookups
 *       500:
 *         description: Internal server error
 */
router.post('/bulkLookup', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachBulkLookupSchema),
  async (req, res) => {
    try {
      const bulkParams = req.validatedData;

      logger.info('📦 Starting bulk lookup via RocketReach API', {
        userId: req.user?.id,
        lookupCount: bulkParams.lookups.length,
        hasWebhook: !!bulkParams.webhook_id
      });

      const result = await rocketReachService.bulkLookup(bulkParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error in bulk lookup via RocketReach API', {
        userId: req.user?.id,
        lookupCount: req.body.lookups?.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to submit bulk lookup',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/profile-company/lookup:
 *   get:
 *     tags:
 *       - RocketReach API
 *     summary: Combined person and company lookup
 *     description: |
 *       Lookup both person and company information in a single request.
 *       Returns enriched data including person details and their company information.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Full name of the person
 *       - in: query
 *         name: first_name
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: First name
 *       - in: query
 *         name: last_name
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Last name
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *           format: email
 *         description: Email address
 *       - in: query
 *         name: current_employer
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Company name
 *       - in: query
 *         name: linkedin_url
 *         schema:
 *           type: string
 *           format: uri
 *         description: LinkedIn profile URL
 *     responses:
 *       200:
 *         description: Combined lookup completed successfully
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Internal server error
 */
router.get('/profile-company/lookup', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachPersonLookupSchema),
  async (req, res) => {
    try {
      const lookupParams = req.validatedData;

      logger.info('🔍 Looking up person and company via RocketReach API', {
        userId: req.user?.id,
        lookupParams: {
          hasName: !!(lookupParams.name || (lookupParams.first_name && lookupParams.last_name)),
          hasEmail: !!lookupParams.email,
          hasEmployer: !!lookupParams.current_employer
        }
      });

      const result = await rocketReachService.lookupPersonAndCompany(lookupParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error in combined person-company lookup', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to lookup person and company',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/company/search:
 *   post:
 *     tags:
 *       - RocketReach API
 *     summary: Search for companies by criteria
 *     description: |
 *       Search across millions of companies using criteria such as name, domain, 
 *       industry, location, employee count, revenue, or founding year.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 description: Company name
 *               domain:
 *                 type: string
 *                 maxLength: 100
 *                 description: Company domain
 *               industry:
 *                 type: string
 *                 maxLength: 100
 *                 description: Industry type
 *               location:
 *                 type: string
 *                 maxLength: 100
 *                 description: Geographic location
 *               employees_min:
 *                 type: number
 *                 minimum: 1
 *                 description: Minimum employee count
 *               employees_max:
 *                 type: number
 *                 minimum: 1
 *                 description: Maximum employee count
 *               revenue_min:
 *                 type: string
 *                 description: Minimum revenue (e.g., "1M", "10M")
 *               revenue_max:
 *                 type: string
 *                 description: Maximum revenue (e.g., "100M", "1B")
 *               founded_after:
 *                 type: number
 *                 minimum: 1800
 *                 description: Founded after year
 *               founded_before:
 *                 type: number
 *                 minimum: 1800
 *                 description: Founded before year
 *               start:
 *                 type: number
 *                 minimum: 0
 *                 default: 0
 *                 description: Pagination offset
 *               size:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 25
 *                 default: 10
 *                 description: Number of results per page
 *     responses:
 *       200:
 *         description: Company search completed successfully
 *       400:
 *         description: Invalid search parameters
 *       500:
 *         description: Internal server error
 */
router.post('/company/search', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachCompanySearchSchema),
  async (req, res) => {
    try {
      const searchParams = req.validatedData;

      logger.info('🏢 Searching companies via RocketReach API', {
        userId: req.user?.id,
        searchParams: {
          searchTerms: Object.keys(searchParams).filter(key => searchParams[key as keyof typeof searchParams]),
          start: searchParams.start,
          size: searchParams.size
        }
      });

      const result = await rocketReachService.searchCompanies(searchParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error searching companies via RocketReach API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to search companies',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/company/lookup:
 *   get:
 *     tags:
 *       - RocketReach API
 *     summary: Lookup a company by identifiers
 *     description: |
 *       Find detailed company information using identifiers such as 
 *       company name, domain, or LinkedIn URL. Returns comprehensive 
 *       company data including industry, location, employee count, and more.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Company name
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Company domain (e.g., google.com)
 *       - in: query
 *         name: linkedin_url
 *         schema:
 *           type: string
 *           format: uri
 *         description: LinkedIn company page URL
 *     responses:
 *       200:
 *         description: Company lookup completed successfully
 *       400:
 *         description: Invalid parameters or missing required identifiers
 *       404:
 *         description: Company not found
 *       500:
 *         description: Internal server error
 */
router.get('/company/lookup', 
  sanitizeInput,
  authMiddleware, 
  validateRequest(rocketReachCompanyLookupSchema),
  async (req, res) => {
    try {
      const lookupParams = req.validatedData;

      logger.info('🏢 Looking up company via RocketReach API', {
        userId: req.user?.id,
        lookupParams: {
          hasName: !!lookupParams.name,
          hasDomain: !!lookupParams.domain,
          hasLinkedIn: !!lookupParams.linkedin_url
        }
      });

      const result = await rocketReachService.lookupCompany(lookupParams);

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error looking up company via RocketReach API', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to lookup company',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/account/key:
 *   post:
 *     tags:
 *       - RocketReach API
 *     summary: Create a new API key
 *     description: |
 *       Generate a new API key for your RocketReach account. 
 *       Your previous API key will be immediately invalidated.
 *       Only one API key can be active at a time.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: New API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     api_key:
 *                       type: string
 *                       description: New API key
 *                     message:
 *                       type: string
 *                       description: Success message
 *       401:
 *         description: Unauthorized - Invalid current API key
 *       500:
 *         description: Internal server error
 */
router.post('/account/key', 
  sanitizeInput,
  authMiddleware, 
  async (req, res) => {
    try {
      logger.info('🔑 Creating new RocketReach API key', {
        userId: req.user?.id
      });

      const result = await rocketReachService.createNewApiKey();

      res.json({
        status: 'success',
        data: result
      });
    } catch (error) {
      logger.error('💥 Error creating new RocketReach API key', {
        userId: req.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to create new API key',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
      });
    }
  }
);

/**
 * @openapi
 * /api/v1/rocketreach/webhook/bulk-results:
 *   post:
 *     tags:
 *       - RocketReach Webhooks
 *     summary: Handle bulk lookup results from RocketReach
 *     description: |
 *       Webhook endpoint to receive bulk lookup results from RocketReach.
 *       This endpoint processes completed bulk operations and stores the results.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 description: Bulk job ID
 *               status:
 *                 type: string
 *                 enum: [complete, failed]
 *               results:
 *                 type: array
 *                 description: Array of lookup results
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       400:
 *         description: Invalid webhook payload
 */
router.post('/webhook/bulk-results', 
  sanitizeInput,
  async (req, res) => {
    try {
      const { id, status, results } = req.body;

      logger.info('📥 Received RocketReach bulk webhook', {
        bulkJobId: id,
        status,
        resultCount: results?.length || 0
      });

      if (status === 'complete' && results) {
        // Process each result
        for (const result of results) {
          if (result.person) {
            await rocketReachDBService.storePerson(result.person);
          }
          if (result.company) {
            await rocketReachDBService.storeCompany(result.company);
          }
        }

        // Update bulk lookup status in database
        // TODO: Update rocketreach_bulk_lookups table
        
        logger.info('✅ Bulk webhook results processed', {
          bulkJobId: id,
          processed: results.length
        });
      }

      res.status(200).json({ status: 'received' });
    } catch (error) {
      logger.error('💥 Error processing bulk webhook', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      res.status(500).json({
        status: 'error',
        message: 'Failed to process webhook'
      });
    }
  }
);

export default router; 