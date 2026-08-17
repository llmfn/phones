import { AsyncLocalStorage } from 'node:async_hooks';

import type { TraceStep, TraceTurn } from '$lib/schema';

interface TraceRun {
  steps: TraceStep[];
}

export interface StepRecorder {
  setOutput(output: Record<string, unknown>, status?: TraceStep['status']): void;
}

const runs = new AsyncLocalStorage<TraceRun>();

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export async function traceStep<Result>(
  name: string,
  input: Record<string, unknown>,
  operation: (step: StepRecorder) => Result | Promise<Result>,
  label = name.replaceAll('_', ' '),
  layer = 1
): Promise<Result> {
  const run = runs.getStore();
  const step: TraceStep = {
    layer,
    name,
    label,
    input,
    output: {},
    status: 'running',
    latency_ms: 0
  };
  const index = run?.steps.push(step);
  const started = performance.now();
  const recorder: StepRecorder = {
    setOutput(output, status = 'success') {
      step.output = output;
      step.status = status;
    }
  };

  try {
    const result = await operation(recorder);
    if (step.status === 'running') step.status = 'success';
    return result;
  } catch (error) {
    step.output = { error: messageFrom(error) };
    step.status = 'error';
    throw error;
  } finally {
    step.latency_ms = Math.max(0, Math.round(performance.now() - started));
    if (run && index !== undefined) run.steps[index - 1] = step;
  }
}

export async function traceTurn<Result>(
  kind: TraceTurn['kind'],
  input: string,
  operation: () => Result | Promise<Result>
): Promise<{ result?: Result; trace: TraceTurn }> {
  const run: TraceRun = { steps: [] };
  const started = performance.now();
  let result: Result | undefined;
  let error: string | undefined;

  await runs.run(run, async () => {
    try {
      result = await operation();
    } catch (caught) {
      error = messageFrom(caught);
    }
  });

  return {
    result,
    trace: {
      kind,
      input,
      steps: run.steps,
      status: error ? 'error' : 'success',
      latency_ms: Math.max(0, Math.round(performance.now() - started)),
      ...(error ? { error } : {})
    }
  };
}
