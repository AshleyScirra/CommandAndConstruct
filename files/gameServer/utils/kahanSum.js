// Implements the kahan summation algorithm for more precise floating point
// addition. See: https://en.wikipedia.org/wiki/Kahan_summation_algorithm
// This is important for keeping fractional clock times accurate. For example
// adding a fractional dt every tick means continuously summing values, and
// this can accumulate errors surprisingly quickly, causing the clock time to
// drift substantially from the actual time. Kahan summation avoids this problem
// by significantly increasing the precision of summed floating point values.
export class KahanSum {
    #c = 0;
    #y = 0;
    #t = 0;
    #sum = 0;
    Add(v) {
        this.#y = v - this.#c;
        this.#t = this.#sum + this.#y;
        this.#c = (this.#t - this.#sum) - this.#y;
        this.#sum = this.#t;
    }
    Get() {
        return this.#sum;
    }
}
