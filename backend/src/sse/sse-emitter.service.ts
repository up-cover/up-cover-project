import { Injectable } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class SseEmitter {
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  private getOrCreate(key: string): Subject<MessageEvent> {
    if (!this.subjects.has(key)) {
      this.subjects.set(key, new Subject<MessageEvent>());
    }
    return this.subjects.get(key)!;
  }

  subscribe(key: string): Observable<MessageEvent> {
    return this.getOrCreate(key).asObservable();
  }

  emit(key: string, eventType: string, data: string | object): void {
    const subject = this.subjects.get(key);
    if (subject) {
      subject.next({ type: eventType, data });
    }
  }
}
