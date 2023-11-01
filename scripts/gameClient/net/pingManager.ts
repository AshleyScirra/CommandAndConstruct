
import { GameClient } from "../gameClient.js";

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

// The "simulation delay" is a deliberate extra delay added to the latency to ensure the
// client can see upcoming messages and interpolate between them, even when there is
// some degree of packet delay variation (PDV).
const SIMULATION_DELAY = 0.08;

export class PingManager {

	#gameClient;				// Reference to GameClient
	
	#pingTimerId = -1;			// setTimeout() timer id
	#pingId = 0;				// ID of last ping sent out
	#pingSendTime = 0;			// time last ping was sent out
	
	#latencyMeasurements: number[] = [];	// array of last latencies measured
	#latency = 0;				// measured latency
	#targetSimulationDelay = 0;	// raw intended client-side delay from server time
	#curSimulationDelay = 0;	// client-side delay with smoothing
	
	#targetServerTimeDiff = 0;	// raw estimated time difference to server
	#curServerTimeDiff = 0;		// server time difference with smoothing
	#curServerTime = 0;			// current estimated server time, updated every tick
	
	constructor(gameClient: GameClient)
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
	OnPong(id: number, time: number)
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
		const roundTripTime = (performance.now() / 1000) - this.#pingSendTime;
		
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
		const currentLocalTime = this.#gameClient.GetGameTime() + this.#gameClient.GetTimeSinceLastTick();
		const prevTargetServerTimeDiff = this.#targetServerTimeDiff;
		this.#targetServerTimeDiff = currentServerTime - currentLocalTime;
		
		// The current server time difference and simulation delay are smoothed so there are no
		// sudden changes if the measurements change. However initialise it on the first measurement
		// so it starts in the right ballpark.
		if (isFirst)
		{
			this.#curServerTimeDiff = this.#targetServerTimeDiff;
			
			this.#targetSimulationDelay = this.#latency + SIMULATION_DELAY;
			this.#curSimulationDelay = this.#targetSimulationDelay;
		}
		else
		{
			// If during the game the calculated server time difference is more than 1 second,
			// assume the client was suspended for some period of time and just jump to the correct
			// time difference so the game can re-sync in the correct state. Otherwise the gradual
			// correction (10ms per 1 second) is too slow to catch up and the game will be frozen
			// or unplayable in the interim.
			if (Math.abs(prevTargetServerTimeDiff - this.#targetServerTimeDiff) > 1)
			{
				this.#curServerTimeDiff = this.#targetServerTimeDiff;
			}
		}
	}
	
	Tick(dt: number)
	{
		// In theory, the server time difference never changes - there is one true value that ought to stay
		// the same throughout the game. However our time measurements aren't perfect and will have some variance.
		// On top of that it's possible the server and client clocks could slowly drift apart over time.
		// Therefore the current server time difference is smoothed so there are no sudden changes even if the
		// target server time difference changes. It is allowed to catch up at a rate of 1%, i.e. changing
		// up to 10ms every 1 second.
		if (this.#curServerTimeDiff < this.#targetServerTimeDiff)
		{
			this.#curServerTimeDiff = Math.min(this.#curServerTimeDiff + 0.01 * dt, this.#targetServerTimeDiff);
		}
		else if (this.#curServerTimeDiff > this.#targetServerTimeDiff)
		{
			this.#curServerTimeDiff = Math.max(this.#curServerTimeDiff - 0.01 * dt, this.#targetServerTimeDiff);
		}
		
		// Similarly the client-side delay will vary depending on latency measurements. This could change more
		// substantially as changing network conditions could cause hundreds of milliseconds change to the latency,
		// and therefore the client-side delay. Therefore it is also smoothed out, but with a faster catch-up
		// rate of 3%, i.e. changing up to 30ms every 1 second.
		if (this.#curSimulationDelay < this.#targetSimulationDelay)
		{
			this.#curSimulationDelay = Math.min(this.#curSimulationDelay + 0.03 * dt, this.#targetSimulationDelay);
		}
		else if (this.#curSimulationDelay > this.#targetSimulationDelay)
		{
			this.#curSimulationDelay = Math.max(this.#curSimulationDelay - 0.03 * dt, this.#targetSimulationDelay);
		}
		
		// Update current estimated server time based on the client game time plus the server time difference.
		this.#curServerTime = this.#gameClient.GetGameTime() + this.#curServerTimeDiff;
	}
	
	// Get the estimated latency (aka ping time) in seconds. This value will vary over time, especially
	// if network conditions change.
	GetLatency()
	{
		return this.#latency;
	}
	
	// Get the estimated packet delay variance (aka PDV) in seconds, which is the difference between the minimum
	// and maximum measured latencies.
	GetPdv()
	{
		let minLatency = Infinity;
		let maxLatency = -Infinity;
		for (const l of this.#latencyMeasurements)
		{
			minLatency = Math.min(minLatency, l);
			maxLatency = Math.max(maxLatency, l);
		}
		
		return maxLatency - minLatency;
	}
	
	// Get the simulation time, i.e. the server time at which the client side should represent the game.
	// This is one of the most important values for the client. This time is what is read from all the value
	// timelines to show a smoothed version of the data coming in from the network. If it is too far behind
	// the server time then there will be unnecessary lag; if it is too close to the server time then messages
	// will arrive late and the game will start to look choppy. The value used is the server time, minus the
	// measured latency to the server, minus an extra fixed delay of SIMULATION_DELAY.
	GetSimulationTime()
	{
		return this.#curServerTime - this.#curSimulationDelay;
	}
}