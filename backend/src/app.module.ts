import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { HealthModule } from './health/health.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { ScanModule } from './scan/scan.module';
import { SseModule } from './sse/sse.module';
import {
  RepositoryEntity,
  ScanJobEntity,
  CoverageFileEntity,
  ImprovementJobEntity,
} from './infrastructure/persistence/entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.get<string>('DB_PATH', './data/upcover.db'),
        synchronize: true,
        entities: [RepositoryEntity, ScanJobEntity, CoverageFileEntity, ImprovementJobEntity],
      }),
    }),
    SseModule,
    HealthModule,
    RepositoriesModule,
    ScanModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
