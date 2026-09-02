import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SOVEREIGN_REGION } from '@lexops/shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v0.1');
  await app.listen(process.env.PORT ?? 3001);
  console.log(`LexOps Sovereign OS — backend booted in region ${SOVEREIGN_REGION}`);
}
bootstrap();
