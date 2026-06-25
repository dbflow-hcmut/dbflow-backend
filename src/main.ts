import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { TransformInterceptor } from '@/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import * as cookieParser from 'cookie-parser';
import { ProjectCollaborationService } from './modules/project-collaboration/project-collaboration.service';
import type { Server as HttpServer } from 'http';

function isHttpServer(server: unknown): server is HttpServer {
  return !!server && typeof (server as HttpServer).on === 'function';
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [process.env.FRONTEND_URL, 'http://localhost:3000'].filter(Boolean),
    credentials: true,
  });

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('DBFlow API')
    .setDescription('API documentation for DBFlow backend')
    .setVersion('1.0')
    .addCookieAuth('access_token', {
      type: 'apiKey',
      in: 'cookie',
      name: 'access_token',
      description: 'JWT token stored in HTTP-only cookie',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
  logger.log(
    `Application is running on: http://localhost:${process.env.PORT ?? 3000}`,
  );

  const rawHttpServer: unknown = app.getHttpServer();
  if (!isHttpServer(rawHttpServer)) {
    throw new Error('Invalid HTTP server instance');
  }
  const httpServer: HttpServer = rawHttpServer;

  const projectCollaborationService = app.get(ProjectCollaborationService);
  projectCollaborationService.attachToHttpServer(
    httpServer,
    '/project-collaboration',
  );
}
void bootstrap();
