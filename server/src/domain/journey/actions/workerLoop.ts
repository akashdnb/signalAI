import type { JourneyActionWorker } from "./worker.js";

export interface JourneyActionWorkerLoopConfig {
  /**
   * Number of independent worker loops running concurrently.
   */
  concurrency: number;

  /**
   * Delay after an empty queue before polling again.
   */
  pollIntervalMs: number;

  /**
   * Maximum delay after an empty queue.
   *
   * This lets the worker back off instead of hammering Postgres
   * when there is no work.
   */
  maxPollIntervalMs?: number;
}

export interface JourneyActionWorkerLoopLogger {
  info?(message: string, metadata?: Record<string, unknown>): void;
  error?(message: string, metadata?: Record<string, unknown>): void;
}

export interface JourneyActionWorkerLoopStats {
  processed: number;
  emptyPolls: number;
  errors: number;
}

const DEFAULT_CONFIG: JourneyActionWorkerLoopConfig = {
  concurrency: 1,
  pollIntervalMs: 250,
  maxPollIntervalMs: 5000,
};

export class JourneyActionWorkerLoop {
  private readonly config: Required<JourneyActionWorkerLoopConfig>;

  private readonly stats: JourneyActionWorkerLoopStats = {
    processed: 0,
    emptyPolls: 0,
    errors: 0,
  };

  private running = false;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;

  constructor(
    private readonly worker: Pick<
      JourneyActionWorker,
      "processOne"
    >,
    config: Partial<JourneyActionWorkerLoopConfig> = {},
    private readonly logger: JourneyActionWorkerLoopLogger = {},
  ) {
    const concurrency =
      config.concurrency ?? DEFAULT_CONFIG.concurrency;

    const pollIntervalMs =
      config.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs;

    const maxPollIntervalMs =
      config.maxPollIntervalMs ??
      DEFAULT_CONFIG.maxPollIntervalMs ??
      pollIntervalMs;

    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error("Worker concurrency must be >= 1");
    }

    if (
      !Number.isFinite(pollIntervalMs) ||
      pollIntervalMs < 0
    ) {
      throw new Error("Worker pollIntervalMs must be >= 0");
    }

    if (
      !Number.isFinite(maxPollIntervalMs) ||
      maxPollIntervalMs < pollIntervalMs
    ) {
      throw new Error(
        "Worker maxPollIntervalMs must be >= pollIntervalMs",
      );
    }

    this.config = {
      concurrency,
      pollIntervalMs,
      maxPollIntervalMs,
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  getStats(): JourneyActionWorkerLoopStats {
    return {
      ...this.stats,
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return this.stopPromise ?? Promise.resolve();
    }

    this.running = true;

    this.stopPromise = new Promise<void>((resolve) => {
      this.resolveStop = resolve;
    });

    this.logger.info?.("Journey action worker started", {
      concurrency: this.config.concurrency,
      pollIntervalMs: this.config.pollIntervalMs,
      maxPollIntervalMs: this.config.maxPollIntervalMs,
    });

    const workers = Array.from(
      { length: this.config.concurrency },
      (_, index) => this.runWorker(index),
    );

    await Promise.all(workers);

    this.running = false;

    const resolve = this.resolveStop;
    this.resolveStop = null;

    if (resolve) {
      resolve();
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.logger.info?.("Stopping journey action worker");

    this.running = false;

    const promise = this.stopPromise;

    if (promise) {
      await promise;
    }
  }

  private async runWorker(workerIndex: number): Promise<void> {
    let emptyPollDelay = this.config.pollIntervalMs;

    while (this.running) {
      try {
        const result = await this.worker.processOne();

        /*
         * processOne() returns:
         *
         * {
         *   claimed: boolean,
         *   acknowledged: boolean,
         *   actionId?: string
         * }
         *
         * Some older implementations may return boolean.
         * Supporting both keeps the loop decoupled from the worker
         * implementation details.
         */
        const processed =
          typeof result === "boolean"
            ? result
            : result?.claimed === true;

        if (processed) {
          this.stats.processed += 1;

          emptyPollDelay = this.config.pollIntervalMs;

          this.logger.info?.(
            "Journey action processed",
            {
              workerIndex,
              result,
            },
          );

          continue;
        }

        this.stats.emptyPolls += 1;

        await this.sleep(emptyPollDelay);

        emptyPollDelay = Math.min(
          Math.max(
            this.config.pollIntervalMs,
            emptyPollDelay * 2,
          ),
          this.config.maxPollIntervalMs,
        );
      } catch (error) {
        this.stats.errors += 1;

        this.logger.error?.(
          "Journey action worker iteration failed",
          {
            workerIndex,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );

        /*
         * Never let a provider/database error kill the worker loop.
         *
         * Reset polling delay so that a temporary failure does not
         * inherit a long empty-queue backoff.
         */
        emptyPollDelay = this.config.pollIntervalMs;

        /*
         * Avoid a tight error loop.
         */
        await this.sleep(
          this.config.pollIntervalMs,
        );
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0 || !this.running) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);

      /*
       * Do not keep Node alive solely because of a worker sleep.
       */
      if (
        typeof timer === "object" &&
        timer !== null &&
        "unref" in timer &&
        typeof timer.unref === "function"
      ) {
        timer.unref();
      }
    });
  }
}

export function createJourneyActionWorkerLoop(
  worker: Pick<JourneyActionWorker, "processOne">,
  config: Partial<JourneyActionWorkerLoopConfig> = {},
  logger: JourneyActionWorkerLoopLogger = {},
): JourneyActionWorkerLoop {
  return new JourneyActionWorkerLoop(
    worker,
    config,
    logger,
  );
}
