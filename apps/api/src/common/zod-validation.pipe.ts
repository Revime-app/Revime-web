import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from './app-exception.js';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new AppException('VALIDATION_FAILED', 'Les informations envoyées sont invalides.', fields);
  }
}
