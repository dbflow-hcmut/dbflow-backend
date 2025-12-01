import { Module } from '@nestjs/common';  
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity } from './entity/project.entity';
import { SchemaEntity } from './entity/schema.entity';
import { UserProjectEntity } from './entity/user-project.entity';
import { ProjectInvitationEntity } from './entity/project-invitation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      SchemaEntity,
      UserProjectEntity,
      ProjectInvitationEntity,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
