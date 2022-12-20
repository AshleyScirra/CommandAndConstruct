
// Client-side equivalent of KahanSum. See kahanSum.js in the server code for more details.
export class KahanSum {
	#c = 0;
	#y = 0;
	#t = 0;
	#sum = 0;
	
	Add(v)
	{
		this.#y = v - this.#c;
		this.#t = this.#sum + this.#y;
		this.#c = (this.#t - this.#sum) - this.#y;
		this.#sum = this.#t;
	}
	
	Get()
	{
		return this.#sum;
	}
}