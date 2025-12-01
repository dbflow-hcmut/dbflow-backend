import { Module } from "@nestjs/common";
import { ProjectCollaborationService } from "./project-collaboration.service";
import { JwtModule } from "@nestjs/jwt";
import { RedisModule } from "@/redis/redis.module";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
    RedisModule,
    ProjectsModule,
  ],
  providers: [ProjectCollaborationService],
  exports: [ProjectCollaborationService],
})
export class ProjectCollaborationModule {}
