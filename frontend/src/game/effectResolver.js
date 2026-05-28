export function createEffectQueueRunner({ resolveJob, onError }) {
  const queue = []
  let resolving = false

  async function process() {
    if (resolving) return
    resolving = true

    while (queue.length) {
      const job = queue.shift()
      try {
        await resolveJob(job)
      } catch (error) {
        onError?.(error, job)
      }
    }

    resolving = false
  }

  function enqueue(job) {
    queue.push(job)
    process()
  }

  return { enqueue, process, queue }
}
