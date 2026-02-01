import 'dotenv/config';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';

/**
 * MongoService
 * ------------
 * Centralized MongoDB connection manager.
 *
 * Responsibilities:
 * - Establish MongoDB connection on module initialization
 * - Expose a safe Db instance for consumers
 * - Log connection success and failure explicitly
 * - Gracefully close the connection on shutdown
 *
 * This service is infrastructure-only and MUST NOT
 * contain business logic or repository code.
 */
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name);
  private client!: MongoClient;
  private db!: Db;
  /**
   * Called automatically by NestJS when the module is initialized.
   */
  async onModuleInit(): Promise<void> {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB;
    if (!uri || !dbName) {
      this.logger.error(
        'MongoDB configuration missing (MONGO_URI or MONGO_DB)',
      );
      throw new Error('MongoDB configuration is invalid');
    }
    try {
      this.logger.log('Attempting to connect to MongoDB...');
      this.client = new MongoClient(uri, {
        maxPoolSize: 10, // Limit connections
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      await this.client.connect();
      this.db = this.client.db(dbName);
      // Lightweight connectivity check
      await this.db.command({ ping: 1 });
      this.logger.log(`MongoDB connected successfully (db="${dbName}")`);
    } catch (error) {
      this.logger.error(
        'MongoDB connection failed',
        error instanceof Error ? error.stack : undefined,
      );
      /**
       * IMPORTANT:
       * Throwing here prevents the service from starting
       * in a partially broken state.
       */
      throw error;
    }
  }
  /**
   * Returns the active MongoDB database instance.
   *
   * @throws Error if the database is not initialized
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error(
        'MongoDB not initialized. Ensure MongoService is properly loaded.',
      );
    }
    return this.db;
  }
  /**
   * Called automatically by NestJS during application shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.logger.log('MongoDB connection closed gracefully');
      }
    } catch (error) {
      this.logger.warn(
        'Error while closing MongoDB connection',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
