import fs from 'fs';
import path from 'path';
import { ragService, FileUploadData, ContentSource } from './ragService';
import logger from '../utils/logger';

export interface UploadedFile {
  filename: string;
  originalname: string;
  size: number;
  path: string;
  mimetype: string;
}

export interface FileProcessingResult {
  success: boolean;
  documentId?: string;
  error?: string;
  securityLevel?: string;
  securityTags?: string[];
}

export class FileUploadService {
  
  /**
   * Process admin upload (global RAG document)
   */
  async processAdminUpload(
    file: UploadedFile,
    metadata: {
      title: string;
      description?: string;
      contentCategory?: string;
      tags?: string[];
    },
    uploadedBy: string
  ): Promise<FileProcessingResult> {
    try {
      logger.info(`Processing admin upload: ${file.originalname}`);
      
      // Extract text from file
      const extractedText = await this.extractTextFromFile(file);
      if (!extractedText) {
        return {
          success: false,
          error: 'Could not extract text from file'
        };
      }

      // Prepare upload data
      const uploadData: FileUploadData = {
        filename: file.originalname,
        fileType: this.getFileType(file.mimetype),
        fileSize: file.size,
        filePath: file.path,
        title: metadata.title,
        description: metadata.description,
        contentCategory: metadata.contentCategory,
        tags: metadata.tags,
      };

      // Process through RAG service
      const documentId = await ragService.processRagDocument(
        uploadData,
        extractedText,
        'admin_global',
        uploadedBy
      );

      return {
        success: true,
        documentId,
      };

    } catch (error) {
      logger.error('Error processing admin upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process user upload (personal RAG document)
   */
  async processUserUpload(
    file: UploadedFile,
    metadata: {
      title: string;
      description?: string;
      contentCategory?: string;
      tags?: string[];
    },
    userId: string,
    orgId: string,
    threadId?: string
  ): Promise<FileProcessingResult> {
    try {
      logger.info(`Processing user upload: ${file.originalname} for user ${userId}`);
      
      // Extract text from file
      const extractedText = await this.extractTextFromFile(file);
      if (!extractedText) {
        return {
          success: false,
          error: 'Could not extract text from file'
        };
      }

      // Prepare upload data
      const uploadData: FileUploadData = {
        filename: file.originalname,
        fileType: this.getFileType(file.mimetype),
        fileSize: file.size,
        filePath: file.path,
        title: metadata.title,
        description: metadata.description,
        contentCategory: metadata.contentCategory,
        tags: metadata.tags,
      };

      // Check if this should be a RAG document or user upload
      if (metadata.contentCategory && ['pr_templates', 'style_guides', 'company_info', 'guidelines'].includes(metadata.contentCategory)) {
        // Process as personal RAG document
        const documentId = await ragService.processRagDocument(
          uploadData,
          extractedText,
          'user_personal',
          userId,
          orgId
        );

        return {
          success: true,
          documentId,
        };
      } else {
        // Process as regular user upload
        const uploadId = await ragService.processUserUpload(
          userId,
          orgId,
          uploadData,
          extractedText,
          threadId
        );

        return {
          success: true,
          documentId: uploadId,
        };
      }

    } catch (error) {
      logger.error('Error processing user upload:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract text from various file types
   */
  private async extractTextFromFile(file: UploadedFile): Promise<string> {
    try {
      const fileType = this.getFileType(file.mimetype);
      
      switch (fileType) {
        case 'txt':
        case 'md':
          return await this.extractTextFromPlainFile(file.path);
        
        case 'pdf':
          return await this.extractTextFromPdf(file.path);
        
        case 'docx':
          return await this.extractTextFromDocx(file.path);
        
        case 'json':
          return await this.extractTextFromJson(file.path);
        
        default:
          logger.warn(`Unsupported file type: ${fileType}`);
          return '';
      }
    } catch (error) {
      logger.error('Error extracting text from file:', error);
      return '';
    }
  }

  private async extractTextFromPlainFile(filePath: string): Promise<string> {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error('Error reading plain text file:', error);
      return '';
    }
  }

  private async extractTextFromPdf(filePath: string): Promise<string> {
    try {
      // For now, return placeholder - would need pdf parsing library like pdf-parse
      logger.info('PDF text extraction not implemented - returning placeholder');
      return '[PDF_CONTENT_PLACEHOLDER] - PDF text extraction requires additional library setup';
    } catch (error) {
      logger.error('Error extracting text from PDF:', error);
      return '';
    }
  }

  private async extractTextFromDocx(filePath: string): Promise<string> {
    try {
      // For now, return placeholder - would need docx parsing library
      logger.info('DOCX text extraction not implemented - returning placeholder');
      return '[DOCX_CONTENT_PLACEHOLDER] - DOCX text extraction requires additional library setup';
    } catch (error) {
      logger.error('Error extracting text from DOCX:', error);
      return '';
    }
  }

  private async extractTextFromJson(filePath: string): Promise<string> {
    try {
      const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return JSON.stringify(jsonContent, null, 2);
    } catch (error) {
      logger.error('Error extracting text from JSON:', error);
      return '';
    }
  }

  private getFileType(mimetype: string): string {
    const mimeTypeMap: Record<string, string> = {
      'text/plain': 'txt',
      'text/markdown': 'md',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'application/json': 'json',
      'text/csv': 'csv',
    };
    
    return mimeTypeMap[mimetype] || 'unknown';
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes(): { mimeType: string; extension: string; description: string }[] {
    return [
      { mimeType: 'text/plain', extension: '.txt', description: 'Plain Text' },
      { mimeType: 'text/markdown', extension: '.md', description: 'Markdown' },
      { mimeType: 'application/json', extension: '.json', description: 'JSON' },
      { mimeType: 'text/csv', extension: '.csv', description: 'CSV' },
      { mimeType: 'application/pdf', extension: '.pdf', description: 'PDF (basic support)' },
      { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: '.docx', description: 'Word Document (basic support)' },
    ];
  }

  /**
   * Validate file for upload
   */
  validateFile(file: UploadedFile): { valid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const supportedTypes = this.getSupportedFileTypes().map(t => t.mimeType);
    
    if (file.size > maxSize) {
      return { valid: false, error: 'File size too large (max 10MB)' };
    }
    
    if (!supportedTypes.includes(file.mimetype)) {
      return { valid: false, error: `Unsupported file type: ${file.mimetype}` };
    }
    
    return { valid: true };
  }

  /**
   * Clean up uploaded file
   */
  async cleanupFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Cleaned up file: ${filePath}`);
      }
    } catch (error) {
      logger.error('Error cleaning up file:', error);
    }
  }
}

export const fileUploadService = new FileUploadService(); 