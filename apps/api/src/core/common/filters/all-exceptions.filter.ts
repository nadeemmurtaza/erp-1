import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../prisma/client';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  /**
   * Whole seconds until the refused request may be retried — present only
   * when the exception knows (LoginRateLimitedException, doc 206 §1.2), and
   * mirrored into a `Retry-After` header so a client need not parse the body.
   */
  retryAfterSeconds?: number;
}

/**
 * Turns every thrown value into one predictable JSON shape, and translates
 * Prisma's error codes into the right HTTP status — a duplicate SKU should be
 * a 409 the admin form can show, not an opaque 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toBody(exception, request.url);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${body.statusCode}: ${JSON.stringify(
          body.message,
        )}`,
      );
    }

    if (body.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, path: string): ErrorBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      const retryAfterSeconds =
        payload !== null && typeof payload === 'object'
          ? (payload as { retryAfterSeconds?: unknown }).retryAfterSeconds
          : undefined;

      return {
        statusCode: status,
        message,
        error: HttpStatus[status] ?? 'Error',
        path,
        timestamp,
        ...(typeof retryAfterSeconds === 'number' && Number.isInteger(retryAfterSeconds) && retryAfterSeconds >= 0
          ? { retryAfterSeconds }
          : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return { ...this.fromPrisma(exception), path, timestamp };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'The request does not match what the database expects.',
        error: 'BAD_REQUEST',
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong. Please try again.',
      error: 'INTERNAL_SERVER_ERROR',
      path,
      timestamp,
    };
  }

  private fromPrisma(
    error: Prisma.PrismaClientKnownRequestError,
  ): Pick<ErrorBody, 'statusCode' | 'message' | 'error'> {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          message: target
            ? `A record with this ${target} already exists.`
            : 'This record already exists.',
          error: 'CONFLICT',
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'The requested record was not found.',
          error: 'NOT_FOUND',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A referenced record does not exist.',
          error: 'BAD_REQUEST',
        };
      case 'P2014':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'This record is still referenced by other records.',
          error: 'CONFLICT',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred.',
          error: 'INTERNAL_SERVER_ERROR',
        };
    }
  }
}
