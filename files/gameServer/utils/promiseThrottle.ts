
// This class can limit how many async operations happen in parallel. For example
// a promise throttle with a maxParallel of 10, given 100 tasks, will do only up to
// 10 simultaneous tasks at a time, only starting new tasks when going under the limit.
// This can also be used with a maxParallel of 1 to serialize a list of async tasks.
type QueueEntry = {
	func: Function,
	resolve: Function,
	reject: Function
};

export class PromiseThrottle
{
	#maxParallel;
	#queue: Array<QueueEntry>;
	#activeCount;

	constructor(maxParallel = 1)
	{
		this.#maxParallel = maxParallel;	// max simulateous tasks allowed
		this.#queue = [];					// array of { func, resolve, reject } for queued tasks
		this.#activeCount = 0;				// current number of active tasks
	}

	Add(func: Function)
	{
		// Return a promise that resolves/rejects according to how the given
		// callback resolves/rejects
		return new Promise((resolve, reject) =>
		{
			this.#queue.push({ func, resolve, reject });

			this.#MaybeStartNext();
		});
	}

	async #MaybeStartNext()
	{
		if (!this.#queue.length)
			return;		// no more jobs

		if (this.#activeCount >= this.#maxParallel)
			return;		// already running maximum number of jobs

		// Take a new task from the queue and start it
		this.#activeCount++;
		const job = this.#queue.shift()!;

		try {
			const result = await job.func();

			job.resolve(result);
		}
		catch (err)
		{
			job.reject(err);
		}

		// Job finished; maybe start another
		this.#activeCount--;
		this.#MaybeStartNext();
	}
};