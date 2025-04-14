import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { QuikReportsModule } from './quik_reports/quik_reports.module';
@Module({
  imports: [DatabaseModule, QuikReportsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
