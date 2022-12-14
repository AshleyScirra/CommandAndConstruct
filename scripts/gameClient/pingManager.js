
// PingManager is responsible for measuring the latency to the server. It does this by
// sending regular "ping" messages. As soon as the server receives a "ping" it immediately
// sends back a "pong" message which also includes the server time. The latency can be
// measured by the time it takes the pong message to come back after a ping. Then the
// client time can be synchronised with the server time by using the server time in pongs
// and adding the latency for an estimate as to what the current server time is.

// How often to send pings, in milliseconds.
const PING_FREQUENCY = 2000;

export class PingManager {

	#gameClient;				// Reference to GameClient
	
	#pingTimerId = -1;			// setTimeout() timer id
	#pingId = 0;				// ID of last ping sent out
	#pingSendTime = 0;			// time last ping was sent out
	
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
		
		// Save the time this ping was sent at.
		this.#pingSendTime = performance.now();
		
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
		
		// Measure the round-trip time for the ping to arrive at the server, and the pong to be returned.
		const roundTripTime = performance.now() - this.#pingSendTime;
		
		// TODO: track timings and sync client clock with server
		console.log(`Pong received, round trip time ${Math.round(roundTripTime)} ms, server time ${time}`);
	}
}