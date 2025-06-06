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
      const person = {
        id: personData.id,
        name: personData.name,
        firstName: personData.first_name,
        lastName: personData.last_name,
        middleName: personData.middle_name,
        currentEmployer: personData.current_employer,
        currentTitle: personData.current_title,
        linkedinUrl: personData.linkedin_url,
        profilePic: personData.profile_pic,
        location: personData.location,
        city: personData.city,
        state: personData.region,
        country: personData.country,
        emails: personData.emails || [],
        phones: personData.phones || [],
        socialMedia: personData.links || {},
        workHistory: personData.job_history || [],
        education: personData.education || [],
        metadata: {
          birth_year: personData.birth_year,
          recommended_email: personData.recommended_email,
          current_work_email: personData.current_work_email,
          current_employer_id: personData.current_employer_id,
          current_employer_domain: personData.current_employer_domain,
          skills: personData.skills || [],
          tags: personData.tags || [],
          npi_data: personData.npi_data
        },
        creditsUsed,
        dataRetentionDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year retention
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
        personId: personData.id,
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
      const company = {
        id: companyData.id,
        name: companyData.name,
        domain: companyData.domain,
        linkedinUrl: companyData.linkedin_url,
        website: companyData.website,
        description: companyData.description,
        industry: companyData.industry,
        location: companyData.location,
        city: companyData.city,
        state: companyData.state,
        country: companyData.country,
        foundedYear: companyData.founded_year,
        employees: companyData.employees,
        revenue: companyData.revenue,
        technologyStack: companyData.technology_stack || [],
        socialMedia: companyData.social_media || {},
        metadata: {
          alexa_rank: companyData.alexa_rank,
          crunchbase_url: companyData.crunchbase_url,
          total_funding: companyData.total_funding,
          latest_funding: companyData.latest_funding,
          ipo_status: companyData.ipo_status
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
        companyId: companyData.id,
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
}

export const rocketReachDBService = new RocketReachDBService(); 