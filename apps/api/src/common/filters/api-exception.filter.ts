import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details: string[] | null;
  };
  path: string;
  timestamp: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const { statusCode, message, details, code } =
      this.normalizeException(exception);

    const payload: ApiErrorEnvelope = {
      success: false,
      error: {
        code,
        message,
        details,
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(payload);
  }

  private normalizeException(exception: unknown) {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        details: null as string[] | null,
      };
    }

    const statusCode = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return {
        statusCode,
        code: this.statusToCode(statusCode),
        message: response,
        details: null as string[] | null,
      };
    }

    const responseObject = response as {
      message?: string | string[];
      error?: string;
    };

    const message = Array.isArray(responseObject.message)
      ? (responseObject.message[0] ?? exception.message)
      : (responseObject.message ?? exception.message);

    return {
      statusCode,
      code: this.statusToCode(statusCode),
      message,
      details: Array.isArray(responseObject.message)
        ? responseObject.message
        : null,
    };
  }

  private statusToCode(statusCode: number): string {
    const codeByStatus: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
    };

    return (
      codeByStatus[statusCode] ??
      (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'HTTP_ERROR')
    );
  }
}
