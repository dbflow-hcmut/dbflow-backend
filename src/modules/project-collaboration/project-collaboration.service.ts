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
import * as Y from 'yjs';
import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { FOLDER_STORAGE_PROJECT } from '@/common/constants';

const logger = new Logger('ProjectCollaborationService');

interface JwtPayload {
  sub: string;
  id: string;
  email: string;
}

function isJwtPayload(payload: unknown): payload is JwtPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  return (
    typeof obj.sub === 'string' &&
    typeof obj.id === 'string' &&
    typeof obj.email === 'string'
  );
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
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  onModuleInit() {
    logger.log('Initializing Project Collaboration Service...');

    const redis = this.redisClient;
    const jwtService = this.jwtService;
    const projectsService = this.projectsService;
    const writeSchemaFilesFromDoc = this.writeSchemaFilesFromDoc.bind(this);
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

          const userProject = await projectsService.getUserProjectPermission(
            payload.id,
            projectId,
          );

          if (!userProject) {
            throw new UnauthorizedException(
              'You do not have permission to access this document',
            );
          }

          logger.log(
            `User permission for project ${projectId}:`,
            userProject.permission,
          );

          return {
            user: {
              id: userId,
              email: payload.email,
              permission: userProject.permission,
            },
          };
        } catch {
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

        const redisKey = `diagram:${projectId}:${schemaId}`;

        const cached = await redis.get(redisKey);
        if (cached) {
          logger.log(`Load diagram from Redis: ${redisKey}`);
          const ydoc = new Y.Doc();
          Y.applyUpdate(ydoc, Buffer.from(cached, 'base64'));
          return ydoc;
        }

        const schemaFolder = path.join(
          FOLDER_STORAGE_PROJECT,
          projectId,
          schemaId,
        );
        const diagramPath = path.join(schemaFolder, 'diagram.schema.json');
        const modelPath = path.join(schemaFolder, 'model.schema.json');

        const hasDiagram = await fsExtra.pathExists(diagramPath);
        const hasModel = await fsExtra.pathExists(modelPath);

        if (!hasDiagram && !hasModel) {
          logger.warn(
            `Schema files not found. diagram: ${diagramPath}, model: ${modelPath}`,
          );
          return new Y.Doc();
        }

        const ydoc = new Y.Doc();
        const diagramMap = ydoc.getMap('diagram');
        const modelMap = ydoc.getMap('model');

        if (hasDiagram) {
          logger.log(`Load diagram from File: ${diagramPath}`);
          const diagramData: unknown = await fsExtra.readJSON(diagramPath);
          diagramMap.set('data', JSON.stringify(diagramData));
        } else {
          logger.warn(`Diagram file not found: ${diagramPath}`);
        }

        if (hasModel) {
          logger.log(`Load model from File: ${modelPath}`);
          const modelData: unknown = await fsExtra.readJSON(modelPath);
          modelMap.set('data', JSON.stringify(modelData));
        } else {
          logger.warn(`Model file not found: ${modelPath}`);
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

        const ydoc = document as Y.Doc;
        const redisKey = `diagram:${projectId}:${schemaId}`;
        const lastSyncKey = `lastSync:${redisKey}`;
        const schemaFolder = path.join(
          FOLDER_STORAGE_PROJECT,
          projectId,
          schemaId,
        );

        const schemaExists = await fsExtra.pathExists(schemaFolder);
        if (!schemaExists) {
          logger.warn(
            `Schema folder cleaned up, skip storing document: ${schemaId}`,
          );
          await Promise.allSettled([
            redis.del(redisKey),
            redis.del(lastSyncKey),
          ]);
          return;
        }

        try {
          const lastSync = await redis.get(lastSyncKey);
          const now = Date.now();

          if (lastSync && now - parseInt(lastSync) < 10000) {
            logger.log(`Skipped store - recently synced: ${schemaId}`);
            return;
          }

          const update = Y.encodeStateAsUpdate(ydoc);
          await redis.set(
            redisKey,
            Buffer.from(update).toString('base64'),
            'EX',
            3600,
          );
          await redis.set(lastSyncKey, now.toString(), 'EX', 10);

          await writeSchemaFilesFromDoc(ydoc, schemaFolder, schemaId);
        } catch (error) {
          logger.error(`Failed to store document for ${schemaId}:`, error);
        }
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      async onChange(data) {
        const { document, documentName, requestParameters } = data;
        const projectId = requestParameters?.get('projectId');
        const schemaId = documentName;

        if (!projectId || !schemaId) {
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
              const schemaFolder = path.join(
                FOLDER_STORAGE_PROJECT,
                projectId,
                schemaId,
              );
              const schemaExists = await fsExtra.pathExists(schemaFolder);

              if (!schemaExists) {
                logger.warn(
                  `Schema folder cleaned up, skip syncing changes: ${schemaId}`,
                );
                return;
              }

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
                    await writeSchemaFilesFromDoc(ydoc, schemaFolder, schemaId);
                  } catch (e) {
                    logger.error(
                      `Failed to write schema files for ${schemaId}`,
                      e,
                    );
                  } finally {
                    fileWriteDebouncers.delete(redisKey);
                  }
                })();
              }, 10000);

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

  private async writeSchemaFilesFromDoc(
    ydoc: Y.Doc,
    schemaFolder: string,
    schemaId: string,
  ) {
    const diagramPath = path.join(schemaFolder, 'diagram.schema.json');
    const modelPath = path.join(schemaFolder, 'model.schema.json');

    await Promise.allSettled([
      this.writeSchemaFile(
        ydoc.getMap('diagram'),
        diagramPath,
        schemaId,
        'diagram',
      ),
      this.writeSchemaFile(ydoc.getMap('model'), modelPath, schemaId, 'model'),
    ]);
  }

  private async writeSchemaFile(
    map: Y.Map<unknown>,
    filePath: string,
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
      await fsExtra.writeJSON(filePath, data, { spaces: 2 });
      logger.log(`Stored ${type} schema to: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to persist ${type} schema for ${schemaId}`, error);
    }
  }
}
