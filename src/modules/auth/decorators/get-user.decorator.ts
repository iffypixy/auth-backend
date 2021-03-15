import {createParamDecorator, ExecutionContext} from "@nestjs/common";

import {ExtendedRequest} from "@lib/interfaces";

export const GetUser = createParamDecorator((_, ctx: ExecutionContext) => {
  const req: ExtendedRequest = ctx.switchToHttp().getRequest();

  return req.user;
});