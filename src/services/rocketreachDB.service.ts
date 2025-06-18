import { db } from '../db';
import { rocketReachPersons, rocketReachCompanies, rocketReachApiCalls, rocketReachBulkLookups } from '../db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import logger from '../utils/logger';
import { RocketReachPerson, RocketReachCompany } from './rocketreach.service';

export class RocketReachDBService {
  
  /**
   * Store person data from RocketReach API
   */
  async storePerson(personData: any, creditsUsed: number = 1): Promise<void> {
    try {
      // Extract person data from RocketReach response
      const rawPerson = personData.person || personData; // Handle both nested and direct structures
      
      if (!rawPerson || !rawPerson.id) {
        logger.warn('No valid person data to store', { personData });
        return;
      }

      const person = {
        id: rawPerson.id,
        name: rawPerson.name,
        firstName: rawPerson.first_name,
        lastName: rawPerson.last_name,
        middleName: rawPerson.middle_name,
        currentEmployer: rawPerson.current_employer,
        currentTitle: rawPerson.current_title,
        linkedinUrl: rawPerson.linkedin_url,
        profilePic: rawPerson.profile_pic,
        location: rawPerson.location,
        city: rawPerson.city,
        state: rawPerson.region || rawPerson.state,
        country: rawPerson.country,
        emails: rawPerson.emails || [],
        phones: rawPerson.phones || [],
        socialMedia: rawPerson.links || rawPerson.social_media || {},
        workHistory: rawPerson.job_history || [],
        education: rawPerson.education || [],
        metadata: {
          birth_year: rawPerson.birth_year,
          recommended_email: rawPerson.recommended_email,
          current_work_email: rawPerson.current_work_email,
          current_employer_id: rawPerson.current_employer_id,
          current_employer_domain: rawPerson.current_employer_domain,
          skills: rawPerson.skills || [],
          tags: rawPerson.tags || [],
          npi_data: rawPerson.npi_data
        },
        creditsUsed,
        updatedAt: new Date()
      };

      await db.insert(rocketReachPersons)
        .values(person)
        .onConflictDoUpdate({
          target: rocketReachPersons.id,
          set: {
            ...person,
            updatedAt: new Date()
          }
        });

      logger.info('✅ Person data stored successfully', {
        personId: person.id,
        name: person.name,
        creditsUsed
      });

    } catch (error) {
      logger.error('💥 Failed to store person data', {
        personId: personData?.id || personData?.person?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Store company data from RocketReach API
   */
  async storeCompany(companyData: any, creditsUsed: number = 1): Promise<void> {
    try {
      // Extract company data from RocketReach response
      const rawCompany = companyData.company || companyData; // Handle both nested and direct structures
      
      if (!rawCompany || !rawCompany.id) {
        logger.warn('No valid company data to store', { companyData });
        return;
      }

      const company = {
        id: rawCompany.id,
        name: rawCompany.name,
        domain: rawCompany.domain,
        linkedinUrl: rawCompany.linkedin_url,
        website: rawCompany.website,
        description: rawCompany.description,
        industry: rawCompany.industry,
        location: rawCompany.location,
        city: rawCompany.city,
        state: rawCompany.state,
        country: rawCompany.country,
        foundedYear: rawCompany.founded_year,
        employees: rawCompany.employees,
        revenue: rawCompany.revenue,
        technologyStack: rawCompany.technology_stack || [],
        socialMedia: rawCompany.social_media || {},
        metadata: {
          alexa_rank: rawCompany.alexa_rank,
          crunchbase_url: rawCompany.crunchbase_url,
          total_funding: rawCompany.total_funding,
          latest_funding: rawCompany.latest_funding,
          ipo_status: rawCompany.ipo_status
        },
        creditsUsed,
        updatedAt: new Date()
      };

      await db.insert(rocketReachCompanies)
        .values(company)
        .onConflictDoUpdate({
          target: rocketReachCompanies.id,
          set: {
            ...company,
            updatedAt: new Date()
          }
        });

      logger.info('✅ Company data stored successfully', {
        companyId: company.id,
        name: company.name,
        creditsUsed
      });

    } catch (error) {
      logger.error('💥 Failed to store company data', {
        companyId: companyData?.id || companyData?.company?.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Log API call for usage tracking and compliance
   */
  async logApiCall(callData: {
    callType: string;
    endpoint: string;
    parameters: any;
    responseStatus: number;
    responseTime: number;
    creditsUsed: number;
    creditsRemaining?: number;
    userId: string;
    errorMessage?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await db.insert(rocketReachApiCalls).values({
        callType: callData.callType as any,
        endpoint: callData.endpoint,
        parameters: callData.parameters,
        responseStatus: callData.responseStatus,
        responseTime: callData.responseTime,
        recordsReturned: callData.metadata?.recordsReturned || 0,
        creditsUsed: callData.creditsUsed,
        creditsRemaining: callData.creditsRemaining,
        errorMessage: callData.errorMessage,
        userId: callData.userId,
        metadata: callData.metadata || {},
        cacheHit: false
      });

      logger.debug('📊 RocketReach API call logged to database', {
        callType: callData.callType,
        creditsUsed: callData.creditsUsed,
        userId: callData.userId
      });

    } catch (error) {
      logger.error('💥 Failed to log API call to database', {
        callType: callData.callType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get credit usage statistics
   */
  async getCreditUsageStats(userId?: string, days: number = 30): Promise<any> {
    try {
      const whereClause = userId 
        ? and(
            eq(rocketReachApiCalls.userId, userId),
            gte(rocketReachApiCalls.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000))
          )
        : gte(rocketReachApiCalls.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000));

      const stats = await db
        .select({
          callType: rocketReachApiCalls.callType,
          totalCalls: sql<number>`count(*)`,
          totalCredits: sql<number>`sum(credits_used)`,
          avgResponseTime: sql<number>`avg(response_time)`
        })
        .from(rocketReachApiCalls)
        .where(whereClause)
        .groupBy(rocketReachApiCalls.callType)
        .orderBy(desc(sql`sum(credits_used)`));

      return {
        period: `${days} days`,
        userId,
        stats,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get credit usage stats', { error });
      throw error;
    }
  }

  /**
   * Get stored person by ID
   */
  async getPersonById(id: number): Promise<any> {
    try {
      const person = await db
        .select()
        .from(rocketReachPersons)
        .where(eq(rocketReachPersons.id, id))
        .limit(1);

      return person[0] || null;
    } catch (error) {
      logger.error('💥 Failed to get person by ID', { id, error });
      return null;
    }
  }

  /**
   * Get stored company by ID
   */
  async getCompanyById(id: number): Promise<any> {
    try {
      const company = await db
        .select()
        .from(rocketReachCompanies)
        .where(eq(rocketReachCompanies.id, id))
        .limit(1);

      return company[0] || null;
    } catch (error) {
      logger.error('💥 Failed to get company by ID', { id, error });
      return null;
    }
  }

  /**
   * Data retention cleanup (run daily)
   */
  async cleanupExpiredData(): Promise<{ personsDeleted: number; companiesDeleted: number }> {
    try {
      // Delete expired person data
      const expiredPersons = await db
        .delete(rocketReachPersons)
        .where(sql`data_retention_date < NOW()`)
        .returning({ id: rocketReachPersons.id });

      // Delete expired company data  
      const expiredCompanies = await db
        .delete(rocketReachCompanies)
        .where(sql`data_retention_date < NOW()`)
        .returning({ id: rocketReachCompanies.id });

      const result = {
        personsDeleted: expiredPersons.length,
        companiesDeleted: expiredCompanies.length
      };

      logger.info('🧹 Data retention cleanup completed', result);
      return result;

    } catch (error) {
      logger.error('💥 Failed to cleanup expired data', { error });
      throw error;
    }
  }

  /**
   * Get recent API calls for dashboard
   */
  async getRecentApiCalls(limit: number = 50, userId?: string): Promise<any[]> {
    try {
      const whereClause = userId 
        ? eq(rocketReachApiCalls.userId, userId)
        : undefined;

      const calls = await db
        .select({
          id: rocketReachApiCalls.id,
          callType: rocketReachApiCalls.callType,
          endpoint: rocketReachApiCalls.endpoint,
          responseStatus: rocketReachApiCalls.responseStatus,
          responseTime: rocketReachApiCalls.responseTime,
          recordsReturned: rocketReachApiCalls.recordsReturned,
          creditsUsed: rocketReachApiCalls.creditsUsed,
          creditsRemaining: rocketReachApiCalls.creditsRemaining,
          errorMessage: rocketReachApiCalls.errorMessage,
          userId: rocketReachApiCalls.userId,
          createdAt: rocketReachApiCalls.createdAt
        })
        .from(rocketReachApiCalls)
        .where(whereClause)
        .orderBy(desc(rocketReachApiCalls.createdAt))
        .limit(limit);

      return calls.map(call => ({
        ...call,
        success: !call.errorMessage && call.responseStatus === 200,
        duration: call.responseTime ? `${call.responseTime}ms` : null
      }));

    } catch (error) {
      logger.error('💥 Failed to get recent API calls', { error });
      return [];
    }
  }

  /**
   * Get storage metrics for dashboard
   */
  async getStorageMetrics(): Promise<any> {
    try {
      // Get record counts for each RocketReach table
      const [personsCount] = await db.select({ count: sql<number>`count(*)` }).from(rocketReachPersons);
      const [companiesCount] = await db.select({ count: sql<number>`count(*)` }).from(rocketReachCompanies);
      const [apiCallsCount] = await db.select({ count: sql<number>`count(*)` }).from(rocketReachApiCalls);
      const [bulkLookupsCount] = await db.select({ count: sql<number>`count(*)` }).from(rocketReachBulkLookups);

      // Calculate total credits used
      const [totalCredits] = await db.select({ 
        total: sql<number>`COALESCE(sum(credits_used), 0)` 
      }).from(rocketReachApiCalls);

      return {
        totalRecords: {
          persons: personsCount?.count || 0,
          companies: companiesCount?.count || 0,
          apiCalls: apiCallsCount?.count || 0,
          bulkLookups: bulkLookupsCount?.count || 0
        },
        totalCreditsUsed: totalCredits?.total || 0,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get storage metrics', { error });
      throw error;
    }
  }

  /**
   * Get recent call metrics for real-time dashboard
   */
  async getRecentCallMetrics(hours: number = 24): Promise<any> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      // Get call statistics by type
      const callStats = await db
        .select({
          callType: rocketReachApiCalls.callType,
          totalCalls: sql<number>`count(*)`,
          totalCredits: sql<number>`sum(credits_used)`,
          avgResponseTime: sql<number>`avg(response_time)`,
          successCount: sql<number>`count(*) FILTER (WHERE response_status = 200)`,
          errorCount: sql<number>`count(*) FILTER (WHERE response_status != 200 OR error_message IS NOT NULL)`
        })
        .from(rocketReachApiCalls)
        .where(gte(rocketReachApiCalls.createdAt, since))
        .groupBy(rocketReachApiCalls.callType);

      // Get total metrics
      const [totalMetrics] = await db
        .select({
          totalCalls: sql<number>`count(*)`,
          totalCredits: sql<number>`sum(credits_used)`,
          avgResponseTime: sql<number>`avg(response_time)`,
          successRate: sql<number>`(count(*) FILTER (WHERE response_status = 200)::float / count(*)) * 100`
        })
        .from(rocketReachApiCalls)
        .where(gte(rocketReachApiCalls.createdAt, since));

      return {
        period: `${hours} hours`,
        callStats,
        totalMetrics: totalMetrics || { totalCalls: 0, totalCredits: 0, avgResponseTime: 0, successRate: 0 },
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('💥 Failed to get recent call metrics', { error });
      throw error;
    }
  }
}

export const rocketReachDBService = new RocketReachDBService(); 