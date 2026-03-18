import { Controller, Param, Sse } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SseEmitter } from './sse-emitter.service';

@Controller('sse')
export class SseController {
  constructor(private readonly sseEmitter: SseEmitter) {}

  @Sse('repositories/:id')
  repoStream(@Param('id') id: string): Observable<MessageEvent> {
    return this.sseEmitter.subscribe(`repo:${id}`);
  }

  @Sse('improvement-jobs/:jobId')
  jobStream(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return this.sseEmitter.subscribe(`job:${jobId}`);
  }
}
