import { Module } from '@nestjs/common';
import { UsersModule } from '@/modules/users/users.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { AdminModule } from '@/modules/admin/admin.module';
import { S3Module } from '@/modules/s3/s3.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '@/modules/users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT || 5432),
        username: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        database: process.env.POSTGRES_DB || 'dbflow',
        entities: [UserEntity],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    UsersModule,
    AdminModule,
    S3Module,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
