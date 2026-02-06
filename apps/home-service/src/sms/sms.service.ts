import 'dotenv/config';
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

interface SmsOptions {
  to: string;
  message: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor() {}

  async sendOTP(phone: string, otp: string): Promise<boolean> {
    try {
      // Format phone for Syria (example: +963XXXXXXXXX)
      const formattedPhone = this.formatSyrianPhone(phone);

      const message = `OTP: ${otp}`;

      // Get httpSMS configuratio
      const smsApiUrl = process.env.SMS_API_URL;
      const smsApiKey = process.env.SMS_API_KEY;
      const fromPhone = process.env.SMS_FROM_PHONE;
      // Method 1: Using httpSMS API
      if (smsApiUrl && smsApiKey && fromPhone) {
        try {
          const response = await axios.post(
            smsApiUrl,
            {
              from: fromPhone,
              to: formattedPhone,
              content: message,
            },
            {
              headers: {
                'x-api-key': smsApiKey,
                'Content-Type': 'application/json',
              },
            },
          );

          this.logger.log(`OTP sent to ${formattedPhone} via httpSMS`);
          return true;
        } catch (apiError) {
          const axiosError = apiError as AxiosError;
          const errorMessage = axiosError.response?.data
            ? JSON.stringify(axiosError.response.data)
            : axiosError.message || 'Unknown error';
          this.logger.error(`httpSMS API error: ${errorMessage}`);

          // Log detailed error info
          if (axiosError.response) {
            this.logger.error(`Status: ${axiosError.response.status}`);
            this.logger.error(
              `Data: ${JSON.stringify(axiosError.response.data)}`,
            );
            this.logger.error(
              `Headers: ${JSON.stringify(axiosError.response.headers)}`,
            );
          }
          throw apiError;
        }
      }

      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send SMS: ${err.message}`);

      throw error;
    }
  }
  /**
   * Format phone number for Syria
   * Syria country code: +963
   */
  private formatSyrianPhone(phone: string): string {
    // Validate input
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number must be a valid string');
    }

    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // If starts with 963, add +
    if (cleaned.startsWith('963')) {
      return '+' + cleaned;
    }

    // If starts with 0, replace with +963
    if (cleaned.startsWith('0')) {
      return '+963' + cleaned.substring(1);
    }

    // If just the number without country code, add +963
    if (cleaned.length === 9) {
      return '+963' + cleaned;
    }

    // Validate phone number length
    if (cleaned.length < 9) {
      throw new Error(
        `Invalid phone number: ${phone}. Syrian phone numbers should be at least 9 digits.`,
      );
    }

    return '+' + cleaned;
  }

  /**
   * Send SMS message to a phone number
   * @param options SMS sending options
   */
  async send(options: SmsOptions): Promise<boolean> {
    try {
      const { to, message } = options;

      // Validate phone number
      if (!to || typeof to !== 'string' || to.trim() === '') {
        throw new Error('Phone number is required and must be a valid string');
      }

      // Validate message
      if (!message || typeof message !== 'string' || message.trim() === '') {
        throw new Error('Message is required and must be a valid string');
      }

      // Format phone for Syria (example: +963XXXXXXXXX)
      const formattedPhone = this.formatSyrianPhone(to.trim());

      // Get httpSMS configuration
      const smsApiUrl = process.env.SMS_API_URL;
      const smsApiKey = process.env.SMS_API_KEY;
      const fromPhone = process.env.SMS_FROM_PHONE;

      // Method 1: Using httpSMS API
      if (smsApiUrl && smsApiKey && fromPhone) {
        try {
          const response = await axios.post(
            smsApiUrl,
            {
              from: fromPhone,
              to: formattedPhone,
              content: message,
            },
            {
              headers: {
                'x-api-key': smsApiKey,
                'Content-Type': 'application/json',
              },
            },
          );

          this.logger.log(`SMS sent to ${formattedPhone} via httpSMS`);
          this.logger.debug(
            `httpSMS Response: ${JSON.stringify(response.data)}`,
          );
          return true;
        } catch (apiError) {
          const axiosError = apiError as AxiosError;
          const errorMessage = axiosError.response?.data
            ? JSON.stringify(axiosError.response.data)
            : axiosError.message || 'Unknown error';
          this.logger.error(`httpSMS API error: ${errorMessage}`);

          // Log detailed error info
          if (axiosError.response) {
            this.logger.error(`Status: ${axiosError.response.status}`);
            this.logger.error(
              `Data: ${JSON.stringify(axiosError.response.data)}`,
            );
            this.logger.error(
              `Headers: ${JSON.stringify(axiosError.response.headers)}`,
            );
          }
          throw apiError;
        }
      }

      // If no SMS configuration is available, log the message
      this.logger.warn(
        `SMS configuration not available. Would send: "${message}" to ${formattedPhone}`,
      );
      return true;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to send SMS: ${err.message}`);
      throw error;
    }
  }

  /**
   * Generate 6-digit OTP
   */
  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
