import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { successful } from "../utils/response.util";

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // 如果已经是统一格式（包含 code 字段），直接返回
        if (
          data &&
          typeof data === "object" &&
          "code" in data &&
          "message" in data
        ) {
          return data;
        }
        return successful(200, data === undefined ? null : data, "ok");
      })
    );
  }
}
