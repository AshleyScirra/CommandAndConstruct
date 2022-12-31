
// The binary message types
const MESSAGE_TYPE_UNIT_UPDATES = 0;	// full and delta unit updates
const MESSAGE_TYPE_EVENTS = 1;			// list of events that have happened
 
// The amount of time over which all units in the game will have a full update sent
// out by the server, currently set to every 2 seconds.
const UNIT_FULL_UPDATE_PERIOD = 2;

// This class handles receiving messages from clients. It calls the appropriate GameServer methods
// for each message, and also sends the binary unit full and delta update messages.
// This keeps all the message handling logic in its own class rather than cluttering GameServer.
export class ServerMessageHandler {

	// Private fields
	#gameServer;			// reference to GameServer
	#messageMap;			// Map of message type -> handler function
	
	// A set of all units pending a full update (which sends all the unit data).
	// The set will be filled with all units every UNIT_FULL_UPDATE_PERIOD,
	// and then gradually drained over time as updates are sent out.
	#unitsPendingFullUpdate = new Set();
	#numUnitFullUpdatesPerTick = 0;	// number of unit full updates to send out per tick
	
	// A set of units that have changed this tick, so need to send delta updates.
	#unitsPendingDeltaUpdate = new Set();
	
	// Array of NetworkEvents waiting to send over the network.
	#networkEvents = [];
	
	// A 256kb binary data buffer to use for sending binary updates to clients
	#dataArrayBuffer = new ArrayBuffer(262144);
	#dataView = new DataView(this.#dataArrayBuffer);
	
	constructor(gameServer)
	{
		this.#gameServer = gameServer;
		
		// Map of message types that can be received from the client
		// and the function to call to handle them.
		this.#messageMap = new Map([
			["ping", m => this.#OnPing(m)],
			["move-units", m => this.#OnMoveUnits(m)],
			["release", m => this.#OnRelease(m)]
		]);
	}
	
	SendToRuntime(msg, transmissionMode, transferList)
	{
		this.#gameServer.SendToRuntime(msg, transmissionMode, transferList);
	}
	
	// Main method for handling a message from a client.
	HandleMessage(msg)
	{
		// Look up the function to call for this message type in the message map.
		const messageType = msg["type"];
		const handlerFunc = this.#messageMap.get(messageType);

		if (handlerFunc)
		{
			// Call the message handler function with the provided message.
			handlerFunc(msg);
		}
		else
		{
			// Messages should always have a handler, so log an error if it's not found.
			console.error(`[GameServer] No message handler for type '${messageType}'`);
		}
	}
	
	#OnMoveUnits(msg)
	{
		const player = msg["player"];
		const units = msg["units"];
	
		this.#gameServer.MoveUnits(player, units);
	}
	
	// Called when receiving a ping from a specific player. The server sends a "pong" message back
	// with the game time, which allows clients to synchronize to the server time.
	#OnPing(msg)
	{
		const id = msg["id"];
		const player = msg["player"];

		// Send a pong back to the same player with the same ID and the current time on the server.
		// Note the server game time only increments every tick. In order to take a more accurate
		// measurement, include the time since the last tick in the transmitted time. This allows
		// ping times to properly count time passing in between ticks.
		this.SendToRuntime({
			"type": "pong",
			"id": id,
			"time": this.#gameServer.GetGameTime() + this.#gameServer.GetTimeSinceLastTick()
		}, "u", player);
	}
	
	// Called when the runtime is ending the game.
	#OnRelease(msg)
	{
		// Only player 0 - the single player or multiplayer host - can terminate GameServer.
		if (msg["player"] !== 0)
			return;

		// Just terminate this entire worker. We could write code that releases everything in
		// GameServer, but there isn't really any point if the whole worker is terminated anyway.
		self.close();
	}
	
	// Calculate how many units to send a full update for every server tick to get them
	// all sent out in the UNIT_FULL_UPDATE_PERIOD. Round the number up to make sure there
	// is always at least 1 unit sent out every update, and that it errs on the side of
	// finishing slightly ahead of the deadline, rather than slightly behind.
	UpdateNumFullUpdatesPerTick()
	{
		const updatePeriodTicks = this.#gameServer.GetTickRate() * UNIT_FULL_UPDATE_PERIOD;
		this.#numUnitFullUpdatesPerTick = Math.ceil(this.#gameServer.GetTotalUnitCount() / updatePeriodTicks);
	}
	
	// When some value in a unit changes, it calls this method to add it to a set of
	// units for sending delta updates over the network.
	AddUnitForDeltaUpdate(unit)
	{
		this.#unitsPendingDeltaUpdate.add(unit);
	}
	
	// When a unit is destroyed, ensure it is removed from any pending messages.
	RemoveUnit(unit)
	{
		this.#unitsPendingFullUpdate.delete(unit);
		this.#unitsPendingDeltaUpdate.delete(unit);
	}
	
	// Send full and delta unit updates in one message. They both use the same transmission mode
	// and sending them together allows compression to work more effectively.
	SendUnitUpdates()
	{
		// Send data with some unit full updates. These contain all the information about
		// a unit, such as its position, angle, speed and turret offset angle. Each tick this is
		// called to send only some full updates; it will work its way through all units over the
		// time period UNIT_FULL_UPDATE_PERIOD in order to limit the total bandwidth used.
		
		// From the queue of units pending a full update, fill up an array with the number to send this tick.
		const sendUnits = [];
		for (const unit of this.#unitsPendingFullUpdate)
		{
			sendUnits.push(unit);
			this.#unitsPendingFullUpdate.delete(unit);
			
			// Stop when hitting the limit for the number of units to send this tick.
			if (sendUnits.length >= this.#numUnitFullUpdatesPerTick)
				break;
		}
		
		// The last update, when #unitsPendingFullUpdate becomes empty, may not have filled up
		// the sendUnits array with enough units. In this case we can start over sending the next
		// round of units in this update to top it up. (This also happens on the very first tick.)
		if (sendUnits.length < this.#numUnitFullUpdatesPerTick)
		{
			// Iterate all units in the game.
			for (const unit of this.#gameServer.allUnits())
			{
				// For the first few units, top up the sendUnits array so they are included
				// in this tick's full update.
				if (sendUnits.length < this.#numUnitFullUpdatesPerTick)
				{
					sendUnits.push(unit);
				}
				else
				{
					// Once sendUnits reaches the limit, add the rest of the units to the
					// set of units to be sent out over the next UNIT_FULL_UPDATE_PERIOD.
					this.#unitsPendingFullUpdate.add(unit);
				}
			}
			
			// Also recalculate the number of units to be sending per tick to adapt it to
			// the current number of units.
			this.UpdateNumFullUpdatesPerTick();
		}
		
		// If for some reason there are no full updates to send (maybe every single unit was destroyed?)
		// *and* no delta updates, then skip sending any update.
		if (sendUnits.length === 0 && this.#unitsPendingDeltaUpdate.size === 0)
		{
			return;
		}
		
		const dataView = this.#dataView;
		let pos = 0;		// write position in bytes
		
		// Write the message type as a byte.
		dataView.setUint8(pos, MESSAGE_TYPE_UNIT_UPDATES);
		pos += 1;
		
		// Write the server time at the tick this message was sent.
		dataView.setFloat64(pos, this.#gameServer.GetGameTime());
		pos += 8;
		
		// Write the total number of full updates to be sent in this update.
		dataView.setUint16(pos, sendUnits.length);
		pos += 2;
		
		// For each unit, write the full data about the unit.
		for (const unit of sendUnits)
		{
			pos = unit.WriteFullUpdate(dataView, pos);
			
			// If this unit is in the delta update list, remove it - it already just wrote
			// its full information so there's no point following with a delta update.
			this.#unitsPendingDeltaUpdate.delete(unit);
		}
		
		// Save size of state data for stats
		this.#gameServer.AddStatStateData(pos);
		const stateDataEndPos = pos;
		
		// Continue on to writing delta updates following on from the full updates.
		// These are a list of specific values that have changed in units this tick, such as
		// the platform angle, or the turret offset angle. Values that have not changed are
		// not transmitted here, in order to save bandwidth.
		
		// Write the number of delta updates.
		dataView.setUint16(pos, this.#unitsPendingDeltaUpdate.size);
		pos += 2;
		
		// Write each delta update.
		for (const unit of this.#unitsPendingDeltaUpdate)
		{
			pos = unit.WriteDeltaUpdate(dataView, pos);
		}
		
		// Clear all units pending delta updates now they have been written.
		this.#unitsPendingDeltaUpdate.clear();
		
		// Save size of delta data for stats
		this.#gameServer.AddStatDeltaData(pos - stateDataEndPos);
		
		// Finished writing the unit update data.
		// Copy out a new ArrayBuffer with just the data written.
		const arrayBuffer = this.#dataArrayBuffer.slice(0, pos);
		
		// Send the binary data with the game state update to the runtime.
		// The arrayBuffer is transferred to save a copy, as it isn't needed here any more.
		// This also uses reliable unordered transmission. Unreliable transmission is tempting
		// but many of the updates are important enough to be worth retransmitting: both full
		// unit updates, and delta updates for details like speed which have on-going movement
		// on the client, should be retransmitted if lost to try to minimuse the error before
		// the next full update arrives. However by allowing unordered transmission we still
		// allow for newer updates to arrive sooner, which will allow the client to update
		// the state of units even more promptly.
		this.SendToRuntime(arrayBuffer, "r", null, [arrayBuffer])
	}
	
	AddNetworkEvent(networkEvent)
	{
		this.#networkEvents.push(networkEvent);
	}
	
	SendNetworkEvents()
	{
		// Skip if there are no network events to send.
		if (this.#networkEvents.length === 0)
			return;
		
		const dataView = this.#dataView;
		let pos = 0;		// write position in bytes
		
		// Write the message type as a byte.
		dataView.setUint8(pos, MESSAGE_TYPE_EVENTS);
		pos += 1;
		
		// Write the server time at the tick these events happened.
		dataView.setFloat64(pos, this.#gameServer.GetGameTime());
		pos += 8;
		
		// Write the number of events.
		dataView.setUint16(pos, this.#networkEvents.length);
		pos += 2;
		
		// Write each event individually.
		for (const networkEvent of this.#networkEvents)
		{
			pos = networkEvent.Write(dataView, pos);
		}
		
		// Clear all the network events now they have been written.
		this.#networkEvents.length = 0;
		
		// Finished writing network events.
		// Copy out a new ArrayBuffer with just the data written.
		const arrayBuffer = this.#dataArrayBuffer.slice(0, pos);
		this.#gameServer.AddStatEventData(arrayBuffer.byteLength);		// measure data sent for stats
		
		// Send the binary data with the list of events to the runtime.
		// The arrayBuffer is transferred to save a copy, as it isn't needed here any more.
		// This also uses reliable but unordered transmission. Events must arrive at clients,
		// but they don't have to be received in the correct order. Clients can compensate
		// for late events.
		this.SendToRuntime(arrayBuffer, "r", null, [arrayBuffer]);
	}
}