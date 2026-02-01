type Task<T> = () => Promise<T>;

export function createUploadQueue(concurrency = 2) {
  let running = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (running >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    next();
  };

  const enqueue = <T>(task: Task<T>) =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        running += 1;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            running -= 1;
            runNext();
          });
      };
      queue.push(run);
      runNext();
    });

  return { enqueue };
}
