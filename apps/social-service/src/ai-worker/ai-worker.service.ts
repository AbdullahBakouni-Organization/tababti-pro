import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TranslationAiService } from '../translation-ai/translation-ai.service';

@Processor('ai', {
  concurrency: 10,
  limiter: {
    max: 50,
    duration: 1000,
  },
})
@Injectable()
export class AiWorkerService extends WorkerHost {
  private readonly logger = new Logger(AiWorkerService.name);

  constructor(private readonly translationService: TranslationAiService) {
    super();
  }

  async process(
    job: Job<{ text: string }, string[], string>,
  ): Promise<string[]> {
    const startTime = Date.now();
    const { text } = job.data;
    const cleanText = text.trim();

    try {
      await job.updateProgress(10);
      if (/[\u0600-\u06FF]/.test(cleanText)) {
        return this.basicFallback(cleanText);
      }

      await job.updateProgress(30);

      // ✅ EN → AR فقط
      const aiVariants = await this.translationService.transliterate(
        cleanText,
        'en',
        'ar',
      );

      await job.updateProgress(80);

      const results = Array.from(
        new Set([cleanText, cleanText.toLowerCase(), ...aiVariants]),
      )
        .filter((v) => v && v.length >= 2)
        .slice(0, 7); // ✅ حد أقصى

      await job.updateProgress(100);

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ Job ${job.id} completed in ${duration}ms (${results.length} variants)`,
      );

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `❌ Job ${job.id} failed after ${duration}ms`,
        (error as Error).message,
      );

      // ✅ fallback آمن بدل الفشل
      return this.basicFallback(cleanText);
    }
  }

  /**
   * Fallback ذكي بدون AI
   */
  private basicFallback(text: string): string[] {
    const variants = new Set<string>();

    variants.add(text);
    variants.add(text.toLowerCase());

    // حذف تكرار الأحرف (ahhmed → ahmed)
    variants.add(text.toLowerCase().replace(/(.)\1+/g, '$1'));

    return Array.from(variants)
      .filter((v) => v.length >= 2)
      .slice(0, 5);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed`, error.message);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Job ${job.id} started`);
  }
}
