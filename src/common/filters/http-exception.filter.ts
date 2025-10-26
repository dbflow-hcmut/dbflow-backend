import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { StandardResponse } from '@/common/interceptors/transform.interceptor';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
    }>();
    const request = ctx.getRequest<{ method: string; url: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorData: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as
        | string
        | { message?: string | string[]; error?: unknown };
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        message = res.message ?? message;
        errorData = res.error ?? undefined;
      }
      this.logger.warn(
        `HttpException ${status} at ${request.method} ${request.url}: ${JSON.stringify(message)}`,
      );
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error at ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    const body: StandardResponse<unknown> = {
      meta: {
        statusCode: status,
        message,
      },
      data: errorData,
    };

    response.status(status).json(body);
  }
}
