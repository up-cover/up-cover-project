import { Global, Module } from '@nestjs/common';
import { SseEmitter } from './sse-emitter.service';
import { SseController } from './sse.controller';

@Global()
@Module({
  controllers: [SseController],
  providers: [SseEmitter],
  exports: [SseEmitter],
})
export class SseModule {}
