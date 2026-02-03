import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import 'dotenv/config';
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
          this.logger.debug(
            `httpSMS Response: ${JSON.stringify(response.data)}`,
          );
          return true;
        } catch (apiError) {
          this.logger.error(
            `httpSMS API error: ${apiError.response?.data || apiError.message}`,
          );

          // Log detailed error info
          if (apiError.response) {
            this.logger.error(`Status: ${apiError.response.status}`);
            this.logger.error(
              `Data: ${JSON.stringify(apiError.response.data)}`,
            );
            this.logger.error(
              `Headers: ${JSON.stringify(apiError.response.headers)}`,
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

    return '+' + cleaned;
  }

  /**
   * Generate 6-digit OTP
   */
  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
