
// PingManager is responsible for measuring the latency to the server. It does this by
// sending regular "ping" messages. As soon as the server receives a "ping" it immediately
// sends back a "pong" message which also includes the server time. The latency can be
// measured by the time it takes the pong message to come back after a ping. Then the
// client time can be synchronised with the server time by using the server time in pongs
// and adding the latency for an estimate as to what the current server time is.

// How often to send pings, in milliseconds.
const PING_FREQUENCY = 2000;

// Number of latency measurements to average out.
const LATENCY_AVERAGE_COUNT = 10;

export class PingManager {

	#gameClient;				// Reference to GameClient
	
	#pingTimerId = -1;			// setTimeout() timer id
	#pingId = 0;				// ID of last ping sent out
	#pingSendTime = 0;			// time last ping was sent out
	
	#latencyMeasurements = [];	// array of last latencies measured
	#latency = 0;				// measured latency
	
	#targetServerTimeDiff = 0;	// raw estimated time difference to server
	#curServerTimeDiff = 0;		// server time difference with smoothing
	#curServerTime = 0;			// current estimated server time, updated every tick
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
	}
	
	Start()
	{
		// Send the first ping, which also sets a timer to send the next ping.
		this.#SendPing();
	}
	
	Release()
	{
		// Clear any timer for sending pings.
		if (this.#pingTimerId !== -1)
		{
			clearTimeout(this.#pingTimerId);
			this.#pingTimerId = -1;
		}
	}
	
	// Send a ping to the server.
	#SendPing()
	{
		// Get a new ID for this ping by incrementing a number.
		this.#pingId++;
		
		// Save the time this ping was sent at (in seconds).
		this.#pingSendTime = performance.now() / 1000;
		
		// Send the ping to the server. Note it's important to use the unreliable transmission
		// channel, as other modes may retransmit if the message is lost, which will not reflect
		// the true network transmission time. It's better that lost pings are just not counted
		// towards the timing measurements.
		this.#gameClient.SendToServer({
			"type": "ping",
			"id": this.#pingId
		}, "u");
		
		// Set a timer to send the next ping.
		this.#pingTimerId = setTimeout(() => this.#SendPing(), PING_FREQUENCY);
	}
	
	// Received a pong back from the server, in response to a ping.
	OnPong(id, time)
	{
		// The server sends a pong with the same ID as the ping it received.
		// If the ID is not the one we were expecting, ignore it so it doesn't mess up the measurements.
		// Note if the round trip time is more than PING_FREQUENCY this will never successfully receive
		// a pong, but in that case the network is probably so dire the game is unplayable anyway.
		if (id !== this.#pingId)
			return;
		
		// Reset the ping ID as we are no longer expecting a pong.
		this.#pingId = -1;
		
		// Measure the round-trip time for the ping to arrive at the server, and the pong to be returned.
		const currentLocalTime = performance.now() / 1000;
		const roundTripTime = currentLocalTime - this.#pingSendTime;
		
		// The latency, i.e. the one-way time, is estimated as half the round trip time.
		const latency = roundTripTime / 2;
		
		// Add this latency to an array of measurements. If there are more measurements than we want,
		// then drop the oldest one.
		const isFirst = (this.#latencyMeasurements.length === 0);
		this.#latencyMeasurements.push(latency);
		
		if (this.#latencyMeasurements.length > LATENCY_AVERAGE_COUNT)
			this.#latencyMeasurements.shift();
		
		// Take an average of the last few latency measurements and use that as the measured latency.
		// This should smooth out any spikes as well as gradually tracking changes in network conditions.
		this.#latency = 0;
		for (const l of this.#latencyMeasurements)
			this.#latency += l;
		this.#latency /= this.#latencyMeasurements.length;
		
		// Estimate the current server time right now based on the received timestamp plus the latency.
		// Calculate the estimated time difference between the client time and the server time.
		const currentServerTime = time + latency;
		this.#targetServerTimeDiff = currentServerTime - currentLocalTime;
		
		// The current server time difference is smoothed so there are no sudden changes if the
		// measured time difference changes. However initialise it on the first measurement so it's
		// in the right ballpark.
		if (isFirst)
			this.#curServerTimeDiff = this.#targetServerTimeDiff;
	}
	
	Tick(dt)
	{
		// Our time measurements aren't perfect and will have some variance. On top of that it's possible
		// the server and client clocks could slowly drift apart over time. Therefore the current server
		// time difference is smoothed so there are no sudden changes even if the target server time difference
		// changes. It is allowed to catch up at a rate of 1%, i.e. up to 10ms change every 1 second.
		if (this.#curServerTimeDiff < this.#targetServerTimeDiff)
		{
			this.#curServerTimeDiff = Math.min(this.#curServerTimeDiff + 0.01 * dt, this.#targetServerTimeDiff);
		}
		else if (this.#curServerTimeDiff > this.#targetServerTimeDiff)
		{
			this.#curServerTimeDiff = Math.max(this.#curServerTimeDiff - 0.01 * dt, this.#targetServerTimeDiff);
		}
		
		// Update current estimated server time based on local clock plus the server time difference.
		this.#curServerTime = performance.now() + this.#curServerTimeDiff;
	}
	
	GetLatency()
	{
		return this.#latency;
	}
	
	GetServerTime()
	{
		return this.#curServerTime;
	}
}