import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: '192.168.0.90',
      port: 5432,
      username: 'postgres',
      password: '123',
      database: 'quikdb',
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: true, // Disable in production
    }),
  ],
})
export class DatabaseModule implements OnModuleInit {
    private readonly logger = new Logger(DatabaseModule.name);
  
    async onModuleInit() {
      this.logger.log('Connected to PostgreSQL database');
    }
  }
