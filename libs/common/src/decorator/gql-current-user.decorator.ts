import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

// ✅ Works in GraphQL resolvers — extracts user from GQL context
export const GqlCurrentUser = createParamDecorator(
  (key: string | undefined, context: ExecutionContext) => {
    const ctx = GqlExecutionContext.create(context);
    const user = ctx.getContext().req.user;
    return key ? user?.[key] : user;
  },
);
