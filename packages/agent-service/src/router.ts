import {
  normalizeProviderError,
  ProvidersExhaustedError,
} from "./errors";
import type {
  AgentRequest,
  AgentResult,
  EmbeddingProvider,
  ImageProvider,
  ProviderAttemptRecorder,
  ProviderRoutes,
  TextProvider,
} from "./types";

export interface RouteExecution {
  readonly request: AgentRequest;
  readonly taskAttempt: number;
  readonly taskId: string;
}

export class ProviderRouter {
  constructor(
    private readonly routes: ProviderRoutes,
    private readonly attempts: ProviderAttemptRecorder,
  ) {}

  async execute(execution: RouteExecution): Promise<AgentResult> {
    switch (execution.request.capability) {
      case "text":
        const textRequest = execution.request.request;
        return {
          capability: "text",
          output: await this.tryRoute(
            this.routes.text,
            execution,
            (provider) => provider.generate(textRequest),
          ),
        };
      case "image":
        const imageRequest = execution.request.request;
        return {
          capability: "image",
          output: await this.tryRoute(
            this.routes.image,
            execution,
            (provider) => provider.generate(imageRequest),
          ),
        };
      case "embedding":
        const embeddingRequest = execution.request.request;
        return {
          capability: "embedding",
          output: await this.tryRoute(
            this.routes.embedding,
            execution,
            (provider) => provider.embed(embeddingRequest),
          ),
        };
    }
  }

  private async tryRoute<
    Provider extends TextProvider | ImageProvider | EmbeddingProvider,
    Result,
  >(
    providers: readonly Provider[],
    execution: RouteExecution,
    call: (provider: Provider) => Promise<Result>,
  ): Promise<Result> {
    const failures = [];

    for (const [routePosition, provider] of providers.entries()) {
      const attemptId = await this.attempts.startProviderAttempt({
        capability: execution.request.capability,
        providerId: provider.id,
        routePosition,
        taskAttempt: execution.taskAttempt,
        taskId: execution.taskId,
      });

      try {
        const result = await call(provider);
        await this.attempts.finishProviderAttempt(attemptId, {
          status: "succeeded",
        });
        return result;
      } catch (error) {
        const failure = normalizeProviderError(error);
        failures.push(failure);
        await this.attempts.finishProviderAttempt(attemptId, {
          errorCode: failure.code,
          errorMessage: failure.message,
          status: "failed",
        });
      }
    }

    throw new ProvidersExhaustedError(
      execution.request.capability,
      failures,
    );
  }
}
