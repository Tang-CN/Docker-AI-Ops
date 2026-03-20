import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { ValidateIdPipe } from "../pipes/validate-id.pipe";

export const ContainerId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const id = req.params?.id || req.body?.id || req.query?.id;
    const pipe = new ValidateIdPipe();
    return pipe.transform(id);
  }
);
