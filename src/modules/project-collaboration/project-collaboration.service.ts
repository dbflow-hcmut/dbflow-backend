import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  UnauthorizedException,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { Hocuspocus } from '@hocuspocus/server';
import Redis from 'ioredis';
import type { IncomingMessage, Server as HttpServer } from 'http';
import type { Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { ProjectsService } from '../projects/projects.service';
import { S3Service } from '../s3/s3.service';
import * as Y from 'yjs';

const logger = new Logger('ProjectCollaborationService');
const S3_SYNC_INTERVAL_MS = 60000;

interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
}

function isJwtPayload(payload: unknown): payload is JwtPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  return typeof obj.sub === 'string' && typeof obj.email === 'string';
}

@Injectable()
export class ProjectCollaborationService
  implements OnModuleInit, OnModuleDestroy
{
  private hocuspocus: Hocuspocus;
  private webSocketServer?: WebSocketServer;
  private emitDebouncers = new Map<string, NodeJS.Timeout>();
  private fileWriteDebouncers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: Redis,
    private readonly jwtService: JwtService,
    private readonly s3Service: S3Service,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  onModuleInit() {
    logger.log('Initializing Project Collaboration Service...');

    const redis = this.redisClient;
    const jwtService = this.jwtService;
    const projectsService = this.projectsService;
    const s3Service = this.s3Service;
    const trySyncToS3 = this.trySyncToS3.bind(this);
    const changeDebouncers = new Map<string, NodeJS.Timeout>();
    const fileWriteDebouncers = this.fileWriteDebouncers;

    this.hocuspocus = new Hocuspocus({
      async onAuthenticate(data) {
        const { token, requestParameters } = data;
        const projectId = requestParameters.get('projectId');
        const sessionId = requestParameters.get('sessionId');

        if (!projectId || !sessionId) {
          throw new UnauthorizedException('Missing projectId or sessionId');
        }

        try {
          const rawPayload: unknown = jwtService.verify(token);
          if (!isJwtPayload(rawPayload)) {
            throw new UnauthorizedException(
              'You do not have permission to access this document',
            );
          }
          const payload = rawPayload;
          const userId = payload.sub;
          logger.log('Authenticated user:', payload);

          logger.log(
            `Checking permission for user ${userId} on project ${projectId}`,
          );

          const permissionData = await projectsService.getProjectPermissions(
            payload.sub,
            projectId,
          );

          if (!permissionData || !permissionData.permission) {
            throw new UnauthorizedException(
              'You do not have permission to access this document',
            );
          }

          // Auto-add user to members if accessing public project
          // This ensures users accessing via socket are also added to members
          try {
            await projectsService.getProjectInformation(payload.sub, projectId);
          } catch (error) {
            // Ignore errors from getProjectInformation since we already checked permissions
            logger.warn('Could not auto-add user to project members:', error);
          }

          logger.log(
            `User permission for project ${projectId}:`,
            permissionData.permission,
          );

          return {
            user: {
              id: userId,
              email: payload.email,
              permission: permissionData.permission,
            },
          };
        } catch (error) {
          logger.error('Error authenticating user:', error);
          throw new UnauthorizedException(
            'You do not have permission to access this document',
          );
        }
      },

      async onLoadDocument(data) {
        const { documentName, requestParameters } = data;
        const projectId = requestParameters.get('projectId');
        const schemaId = documentName;

        if (!projectId || !schemaId) {
          logger.warn(
            `Missing projectId or schemaId. projectId: ${projectId}, schemaId: ${schemaId}`,
          );
          return null;
        }

        if (schemaId.startsWith('project-presence-')) {
          return new Y.Doc();
        }

        const redisKey = `diagram:${projectId}:${schemaId}`;

        const cached = await redis.get(redisKey);
        if (cached) {
          logger.log(`Load diagram from Redis: ${redisKey}`);
          const ydoc = new Y.Doc();
          Y.applyUpdate(ydoc, Buffer.from(cached, 'base64'));
          return ydoc;
        }

        const currentVersionPrefix = `projects/${projectId}/schemas/${schemaId}/latest`;
        const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;
        const modelS3Key = `${currentVersionPrefix}/model.schema.json`;

        const [diagramData, modelData] = await Promise.all([
          s3Service.getJsonObject(diagramS3Key),
          s3Service.getJsonObject(modelS3Key),
        ]);

        if (!diagramData && !modelData) {
          logger.warn(
            `Schema files not found in S3. diagram: ${diagramS3Key}, model: ${modelS3Key}`,
          );
          return new Y.Doc();
        }

        const ydoc = new Y.Doc();
        const diagramMap = ydoc.getMap('diagram');
        const modelMap = ydoc.getMap('model');

        if (diagramData) {
          logger.log(`Load diagram from S3: ${diagramS3Key}`);
          diagramMap.set('data', JSON.stringify(diagramData));
        } else {
          logger.warn(`Diagram file not found in S3: ${diagramS3Key}`);
        }

        if (modelData) {
          logger.log(`Load model from S3: ${modelS3Key}`);
          modelMap.set('data', JSON.stringify(modelData));
        } else {
          logger.warn(`Model file not found in S3: ${modelS3Key}`);
        }

        const update = Y.encodeStateAsUpdate(ydoc);
        await redis.set(
          redisKey,
          Buffer.from(update).toString('base64'),
          'EX',
          3600,
        );

        return ydoc;
      },

      async onStoreDocument(data) {
        const { document, documentName, requestParameters } = data;
        const projectId = requestParameters?.get('projectId');
        const schemaId = documentName;

        if (!projectId || !schemaId) {
          logger.warn(
            `Missing projectId or schemaId in onStoreDocument. projectId: ${projectId}, schemaId: ${schemaId}`,
          );
          return;
        }

        if (schemaId.startsWith('project-presence-')) {
          return;
        }

        const ydoc = document as Y.Doc;
        const redisKey = `diagram:${projectId}:${schemaId}`;

        try {
          const update = Y.encodeStateAsUpdate(ydoc);
          await redis.set(
            redisKey,
            Buffer.from(update).toString('base64'),
            'EX',
            3600,
          );

          await trySyncToS3(ydoc, projectId, schemaId);
        } catch (error) {
          logger.error(`Failed to store document for ${schemaId}:`, error);
        }
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async onChange(data) {
        const { document, documentName, requestParameters } = data;
        const projectId = requestParameters?.get('projectId');
        const schemaId = documentName;

        if (
          !projectId ||
          !schemaId ||
          schemaId.startsWith('project-presence-')
        ) {
          return;
        }

        const ydoc = document as Y.Doc;
        const redisKey = `diagram:${projectId}:${schemaId}`;

        const existing = changeDebouncers.get(redisKey);
        if (existing) {
          clearTimeout(existing);
        }

        const timeout = setTimeout(() => {
          void (async () => {
            try {
              const syncLockKey = `sync:${redisKey}`;
              const lockAcquired = await redis.set(
                syncLockKey,
                '1',
                'EX',
                5,
                'NX',
              );

              if (!lockAcquired) {
                logger.log(`Skipped sync - already in progress: ${schemaId}`);
                return;
              }

              const update = Y.encodeStateAsUpdate(ydoc);
              await redis.set(
                redisKey,
                Buffer.from(update).toString('base64'),
                'EX',
                3600,
              );
              logger.log(`onChange synced to Redis: ${redisKey}`);

              await redis.del(syncLockKey);

              const existingFileWrite = fileWriteDebouncers.get(redisKey);
              if (existingFileWrite) {
                clearTimeout(existingFileWrite);
              }

              const fileWriteTimeout = setTimeout(() => {
                void (async () => {
                  try {
                    await trySyncToS3(ydoc, projectId, schemaId);
                  } catch (e) {
                    logger.error(
                      `Failed to write schema files for ${schemaId}`,
                      e,
                    );
                  } finally {
                    fileWriteDebouncers.delete(redisKey);
                  }
                })();
              }, S3_SYNC_INTERVAL_MS);

              fileWriteDebouncers.set(redisKey, fileWriteTimeout);
            } catch (e) {
              logger.error(
                `Failed to sync onChange to Redis for ${schemaId}`,
                e,
              );
            } finally {
              changeDebouncers.delete(redisKey);
            }
          })();
        }, 2000);

        changeDebouncers.set(redisKey, timeout);
      },
    });
  }

  attachToHttpServer(
    httpServer: HttpServer,
    pathname = '/project-collaboration',
  ) {
    logger.log(
      `Attaching Project Collaboration to HTTP server at path: ${pathname}`,
    );

    if (!this.hocuspocus) {
      logger.error('Project Collaboration server is not initialized');
      throw new Error('Project Collaboration server is not initialized');
    }

    this.webSocketServer = new WebSocketServer({ noServer: true });
    logger.log('WebSocket server created');

    httpServer.on(
      'upgrade',
      (request: IncomingMessage, socket: Socket, head: Buffer): void => {
        (() => {
          try {
            const url = new URL(
              request.url || '',
              `http://${request.headers.host}`,
            );
            if (url.pathname !== pathname) {
              return;
            }
            logger.debug(`WebSocket upgrade request for: ${url.pathname}`);
            this.webSocketServer!.handleUpgrade(
              request,
              socket,
              head,
              (ws: WebSocket) => {
                this.webSocketServer!.emit('connection', ws, request);
              },
            );
          } catch (error) {
            logger.error('Error handling WebSocket upgrade:', error);
            socket.destroy();
          }
        })();
      },
    );

    this.webSocketServer.on(
      'connection',
      (ws: WebSocket, request: IncomingMessage): void => {
        void this.hocuspocus.handleConnection(ws, request);
      },
    );

    logger.log(
      `Project Collaboration successfully attached to HTTP server at path: ${pathname}`,
    );
    logger.log(
      `WebSocket endpoint ready: ws://localhost:${process.env.PORT || 3000}${pathname}`,
    );
  }

  onModuleDestroy() {
    logger.log('Shutting down Project Collaboration service...');

    this.emitDebouncers.forEach((timeout) => clearTimeout(timeout));
    this.emitDebouncers.clear();
    this.fileWriteDebouncers.forEach((timeout) => clearTimeout(timeout));
    this.fileWriteDebouncers.clear();

    if (this.webSocketServer) {
      this.webSocketServer.close();
      logger.log('Project Collaboration WebSocket server closed');
    }
    if (this.hocuspocus) {
      this.hocuspocus.closeConnections();
      logger.log('Project Collaboration connections closed');
    }

    logger.log('Project Collaboration server stopped');
  }

  private async trySyncToS3(ydoc: Y.Doc, projectId: string, schemaId: string) {
    const redisKey = `diagram:${projectId}:${schemaId}`;
    const lastSyncKey = `lastSync:${redisKey}`;
    const lastSync = await this.redisClient.get(lastSyncKey);
    const now = Date.now();

    if (lastSync && now - parseInt(lastSync) < S3_SYNC_INTERVAL_MS) {
      logger.log(`Skipped S3 sync - recently synced: ${schemaId}`);
      return;
    }

    await this.writeSchemaFilesFromDoc(ydoc, projectId, schemaId);
    await this.redisClient.set(lastSyncKey, now.toString(), 'EX', 3600);
  }

  private async writeSchemaFilesFromDoc(
    ydoc: Y.Doc,
    projectId: string,
    schemaId: string,
  ) {
    const currentVersionPrefix = `projects/${projectId}/schemas/${schemaId}/latest`;
    const diagramS3Key = `${currentVersionPrefix}/diagram.schema.json`;
    const modelS3Key = `${currentVersionPrefix}/model.schema.json`;

    await Promise.allSettled([
      this.writeSchemaFile(
        ydoc.getMap('diagram'),
        diagramS3Key,
        schemaId,
        'diagram',
      ),
      this.writeSchemaFile(ydoc.getMap('model'), modelS3Key, schemaId, 'model'),
    ]);
  }

  private async writeSchemaFile(
    map: Y.Map<unknown>,
    s3Key: string,
    schemaId: string,
    type: 'diagram' | 'model',
  ) {
    if (!map) {
      logger.warn(`Y.Doc map for ${type} is missing for schema ${schemaId}`);
      return;
    }

    const dataStr = map.get('data') as string | undefined;

    if (!dataStr) {
      logger.warn(`No ${type} data found in Y.Doc for ${schemaId}`);
      return;
    }

    try {
      const data: unknown = JSON.parse(dataStr);
      await this.s3Service.putJsonObject(s3Key, data);
      logger.log(`Stored ${type} schema to S3: ${s3Key}`);
    } catch (error) {
      logger.error(`Failed to persist ${type} schema for ${schemaId}`, error);
    }
  }
}
