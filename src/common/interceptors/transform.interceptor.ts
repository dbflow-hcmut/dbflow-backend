import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<D> {
  meta: { statusCode: number; message: string | string[] };
  data: D;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardResponse<T>> {
    const http = context.switchToHttp();
    const res = http.getResponse<{ statusCode?: number }>();
    return next.handle().pipe(
      map((data) => ({
        meta: { statusCode: res.statusCode ?? 200, message: 'success' },
        data,
      })),
    );
  }
}
