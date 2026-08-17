import { describe, expect, it } from 'vitest';

import { traceStep, traceTurn } from './trace';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('query trace', () => {
  it('keeps overlapping asynchronous runs isolated', async () => {
    async function run(input: string, delay: number) {
      return traceTurn('search', input, () =>
        traceStep(`step_${input}`, { input }, async (step) => {
          await wait(delay);
          step.setOutput({ input });
          return input;
        })
      );
    }

    const [slow, fast] = await Promise.all([run('slow', 15), run('fast', 1)]);

    expect(slow.trace.steps.map((step) => step.name)).toEqual(['step_slow']);
    expect(fast.trace.steps.map((step) => step.name)).toEqual(['step_fast']);
    expect(slow.trace.steps[0].output).toEqual({ input: 'slow' });
    expect(fast.trace.steps[0].output).toEqual({ input: 'fast' });
  });

  it('settles a failed step and returns an inspectable error turn', async () => {
    const { result, trace } = await traceTurn('search', 'broken', () =>
      traceStep('explode', {}, () => {
        throw new Error('pipeline broke');
      })
    );

    expect(result).toBeUndefined();
    expect(trace).toMatchObject({ status: 'error', error: 'pipeline broke' });
    expect(trace.steps[0]).toMatchObject({
      name: 'explode',
      status: 'error',
      output: { error: 'pipeline broke' }
    });
  });
});
