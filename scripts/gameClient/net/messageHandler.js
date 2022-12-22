
import Globals from "../../globals.js";
import * as MathUtils from "../../utils/clientMathUtils.js";

import { ClientUnit } from "../../clientUnits/clientUnit.js";
import { SteppedValueTimeline } from "./steppedValueTimeline.js";

// The binary message types
const MESSAGE_TYPE_UNIT_UPDATES = 0;	// full and delta unit updates
const MESSAGE_TYPE_EVENTS = 1;			// list of events that have happened

// Flags delta updates, which must match those on the server side.
const FLAG_CHANGED_SPEED =				 (1 << 0);
const FLAG_CHANGED_PLATFORM_ANGLE =		 (1 << 1);
const FLAG_CHANGED_TURRET_OFFSET_ANGLE = (1 << 2);

// This class handles receiving messages from the GameServer (whether it's hosted locally or receiving
// messages over the network). It calls the appropriate GameClient methods for each message.
// This keeps all the message handling logic in its own class rather than cluttering GameClient.
export class GameClientMessageHandler {

	// Private fields
	#gameClient;					// reference to GameClient
	#messageMap;					// Map of message type -> handler function
	
	// Network events are queued until the simulation time catches up with the event time.
	// This is done with a stepped timeline.
	#networkEventTimeline = new SteppedValueTimeline();
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Create map of message types that can be received from GameServer
		// and the function to call to handle each of them.
		this.#messageMap = new Map([
			["create-initial-state", m => this.#OnCreateInitialState(m)],
			["pong", m => this.#OnPong(m)],
			["game-over", m => this.#OnGameOver(m)],
			["stats", m => this.#OnStats(m)]
		]);
	}
	
	HandleGameServerMessage(msg)
	{
		// The host sends game state updates and events as binary ArrayBuffers.
		// If the message is an ArrayBuffer, treat it as a binary update.
		if (msg instanceof ArrayBuffer)
		{
			this.#OnBinaryMessage(msg);
		}
		else		// otherwise treat as JSON message
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
				console.error(`No message handler for message from GameServer type '${messageType}'`);
			}
		}
	}
	
	#OnCreateInitialState(msg)
	{
		this.#gameClient.CreateInitialState(msg);
	}
	
	// Called when received a new binary game state update from GameServer.
	#OnBinaryMessage(arrayBuffer)
	{
		// Catch and log any exceptions that happen while reading data from the server.
		try {
			const dataView = new DataView(arrayBuffer);
			let pos = 0;		// read position in bytes
			
			// Read the message type as a byte.
			const messageType = dataView.getUint8(pos);
			pos += 1;
			
			// Read the message with a different method depending on the message type.
			if (messageType === MESSAGE_TYPE_UNIT_UPDATES)
				this.#OnUnitUpdates(dataView, pos);
			else if (messageType === MESSAGE_TYPE_EVENTS)
				this.#OnNetworkEvents(dataView, pos);
			else
				throw new Error(`unexpected message type '${messageType}'`);
		}
		catch (err)
		{
			console.error("Error reading binary message: ", err);
		}
	}
	
	// Pong messages are responses to pings. Forward them to PingManager.
	#OnPong(m)
	{
		const id = m["id"];
		const time = m["time"];
		
		this.#gameClient.GetPingManager().OnPong(id, time);
	}
	
	// Receiving full and delta data updates about some units.
	#OnUnitUpdates(dataView, pos)
	{
		// Read the server time when the message was sent.
		const serverTime = dataView.getFloat64(pos);
		pos += 8;
		
		// Read the full unit updates that come first.
		pos = this.#ReadFullUnitUpdates(dataView, pos, serverTime);
		
		// Read the delta updates that follow.
		this.#ReadDeltaUnitUpdates(dataView, pos, serverTime);
	}
	
	#ReadFullUnitUpdates(dataView, pos, serverTime)
	{
		// Read the total number of full updates in this update.
		const unitCount = dataView.getUint16(pos);
		pos += 2;

		// For each unit in the data, read the unit's data.
		for (let i = 0; i < unitCount; ++i)
		{
			// Read unit ID.
			const id = dataView.getUint16(pos);
			pos += 2;
			
			// Read player number unit belongs to.
			const player = dataView.getUint8(pos);
			pos += 1;

			// Read the X and Y position.
			const x = dataView.getUint16(pos);
			pos += 2;
			const y = dataView.getUint16(pos);
			pos += 2;
			
			// Read the speed
			const speed = dataView.getUint16(pos);
			pos += 2;

			// Read the platform angle
			const platformAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
			pos += 2;

			// Read the turret offset angle
			const turretOffsetAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
			pos += 2;

			// Look up to see if there is an existing client unit with the given ID.
			let unit = this.#gameClient.GetUnitById(id);
			if (unit)
			{
				// Found existing unit. Add all values to the platform and turret timelines.
				const platform = unit.GetPlatform();
				platform.OnNetworkUpdatePosition(serverTime, x, y);
				platform.OnNetworkUpdateSpeed(serverTime, speed);
				platform.OnNetworkUpdateAngle(serverTime, platformAngle);
				
				const turret = unit.GetTurret();
				turret.OnNetworkUpdateOffsetAngle(serverTime, turretOffsetAngle);
			}
			else
			{
				// There is not yet any client unit with the given ID.
				// Create a new one from the details in the full update.
				unit = ClientUnit.Create(this.#gameClient, {
					id, player,
					x, y, platformAngle, speed,
					turretOffsetAngle
				});
			}
			
			// Set the last update time for the unit (used for timeout).
			unit.SetLastUpdateTime(serverTime);
		}
		
		return pos;
	}
	
	#ReadDeltaUnitUpdates(dataView, pos, serverTime)
	{
		// Read the total number of delta updates in this message.
		const updateCount = dataView.getUint16(pos);
		pos += 2;

		// For each unit in the data, read the unit's data.
		for (let i = 0; i < updateCount; ++i)
		{
			// Read unit ID.
			const unitId = dataView.getUint16(pos);
			pos += 2;
			
			// Look up the unit from the ID.
			// NOTE: if the unit ID is not found, read the rest of the values
			// anyway, since the read position still has to be advanced.
			const unit = this.#gameClient.GetUnitById(unitId);
			
			// Read the delta change flags.
			const deltaChangeFlags = dataView.getUint8(pos);
			pos += 1;
			
			// Check which delta change flags are set and read values accordingly,
			// in exactly the same way (notably also in the same order) as the server writes them.
			if ((deltaChangeFlags & FLAG_CHANGED_SPEED) !== 0)
			{
				const speed = dataView.getUint16(pos);
				pos += 2;
				
				if (unit)
				{
					unit.GetPlatform().OnNetworkUpdateSpeed(serverTime, speed);
				}
			}
			
			if ((deltaChangeFlags & FLAG_CHANGED_PLATFORM_ANGLE) !== 0)
			{
				const platformAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
				pos += 2;
				
				if (unit)
				{
					unit.GetPlatform().OnNetworkUpdateAngle(serverTime, platformAngle);
				}
			}
			
			if ((deltaChangeFlags & FLAG_CHANGED_TURRET_OFFSET_ANGLE) !== 0)
			{
				const offsetAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
				pos += 2;
				
				if (unit)
				{
					unit.GetTurret().OnNetworkUpdateOffsetAngle(serverTime, offsetAngle);
				}
			}
			
			// If the unit was found, set the last update time for the unit (used for timeout).
			if (unit)
				unit.SetLastUpdateTime(serverTime);
		}
	}
	
	#OnNetworkEvents(dataView, pos)
	{
		// Read the server time.
		const serverTime = dataView.getFloat64(pos);
		pos += 8;
		
		// Read the number of events.
		const eventCount = dataView.getUint16(pos);
		pos += 2;
		
		// Read each individual event, collecting the resulting data in to an array.
		const eventList = [];
		
		for (let i = 0; i < eventCount; ++i)
		{
			// Get event type
			const eventType = dataView.getUint8(pos);
			pos += 1;
			
			// Read each type of message with a separate method.
			// Note the types correspond to those listed in NetworkEvent on the server.
			if (eventType === 0)
				pos = this.#ReadProjectileFiredEvent(dataView, pos, eventList);
			else if (eventType === 1)
				pos = this.#ReadProjectileHitEvent(dataView, pos, eventList);
			else if (eventType === 2)
				pos = this.#ReadUnitDestroyedEvent(dataView, pos, eventList);
			else
				throw new Error(`unknown event type '${eventType}'`);
		}
		
		// Now we have a list of events that are meant to happen at a time.
		// Queue them up for the right time using the stepped timeline, using the event
		// list as the timeline value.
		this.#networkEventTimeline.Add(serverTime, eventList)
	}
	
	#ReadProjectileFiredEvent(dataView, pos, eventList)
	{
		// Projectile ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Read X, Y, angle, speed, range and distance travelled.
		const x = dataView.getUint16(pos);
		pos += 2;
		const y = dataView.getUint16(pos);
		pos += 2;
		const angle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
		pos += 2;
		const speed = dataView.getUint16(pos);
		pos += 2;
		const range = dataView.getUint16(pos);
		pos += 2;
		const distanceTravelled = dataView.getUint16(pos);
		pos += 2;
		
		// Add a function to perform this event to the event list.
		eventList.push(lateness => this.#gameClient.OnProjectileFired(lateness, id, x, y, angle, speed, range, distanceTravelled));
		
		return pos;
	}
	
	#ReadProjectileHitEvent(dataView, pos, eventList)
	{
		// Projectile ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Read X, Y
		const x = dataView.getUint16(pos);
		pos += 2;
		const y = dataView.getUint16(pos);
		pos += 2;
		
		// Add a function to perform this event to the event list.
		eventList.push(lateness => this.#gameClient.OnProjectileHit(lateness, id, x, y));
		
		return pos;
	}
	
	#ReadUnitDestroyedEvent(dataView, pos, eventList)
	{
		// Unit ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Add a function to perform this event to the event list.
		eventList.push(lateness => this.#gameClient.OnUnitDestroyedEvent(lateness, id));
		
		return pos;
	}
	
	Tick(simulationTime)
	{
		// Check the stepped value timeline with network events for anything that is now
		// scheduled to happen. Note it is checked repeatedly: GetSteppedValue() will only
		// return one value, but there could be multiple entries behind the simulation time,
		// in which case we want to apply them all ASAP.
		let entry;
		while (entry = this.#networkEventTimeline.GetSteppedValue(simulationTime))
		{
			const eventList = entry.value;
			
			// Calculate how late this event is in seconds. For messages received on time,
			// this will be a small value (just due to the fact client ticks don't line
			// up exactly with server ticks). However if network delays cause an event to
			// be delayed significantly, the lateness can also allow the client to try to
			// catch up, such as by advancing a projectile to where it's meant to be.
			const lateness = simulationTime - entry.timestamp;
			
			// Call every function in the event list with the lateness value.
			for (const func of eventList)
				func(lateness);
		}
	}
	
	// Get information about units, such as their size and image point locations,
	// to send to GameServer.
	GetConstructObjectData()
	{
		// For each entry in the list of all unit object types, get the data
		// for that object type and return all the data in an array.
		return this.#gameClient.GetAllUnitObjectTypes().map(
			objectType => this.#GetConstructObjectDataFor(objectType)
		);
	}
	
	// Get object data for a single Construct object type.
	#GetConstructObjectDataFor(objectType)
	{
		const inst = objectType.getFirstInstance();
		
		// Make sure there is an instance in the layout to get data from.
		if (!inst)
			throw new Error(`need an instance of '${objectType.name}' in the layout`);
		
		// Get instance position in layout co-ordinates
		const x = inst.x;
		const y = inst.y;
		
		// Get the object origin from the first animation frame.
		// Note this is normalized to a [0, 1] range; everything else is in pixels
		// so also get the origin in pixels.
		const firstFrame = inst.animation.getFrames()[0];
		const originX = firstFrame.originX * inst.width;
		const originY = firstFrame.originY * inst.height;
		
		// Get the first image point position, which returns a position in layout co-ordinates.
		// The instance position is then subtracted to make this relative to the object origin.
		const [imgPtX, imgPtY] = inst.getImagePoint(1);
		
		// Get the collision poly points, which also are returned in layout co-ordinates
		// and so made relative to the object origin.
		const collisionPoly = [];
		for (let i = 0, len = inst.getPolyPointCount(); i < len; ++i)
		{
			const [px, py] = inst.getPolyPoint(i);
			collisionPoly.push([px - x, py - y]);
		}
		
		// Return all details as a JSON object.
		return {
			"name": objectType.name,
			"width": inst.width,
			"height": inst.height,
			"origin": [originX, originY],
			"imagePoint": [imgPtX - x, imgPtY - y],
			"collisionPoly": collisionPoly
		};
	}
	
	#OnGameOver(m)
	{
		const winningPlayer = m["winning-player"];
		const didWin = (this.#gameClient.GetPlayer() === winningPlayer);
		this.#gameClient.OnGameOver(didWin);
	}
	
	// Received every 1 second as the server sends stats messages.
	// Display the received statistics in the StatsText object.
	#OnStats(m)
	{
		const runtime = this.#gameClient.GetRuntime();
		const inst = runtime.objects.StatsText.getFirstInstance();
		const pingManager = this.#gameClient.GetPingManager();
		inst.text = `${m["num-units"]} units (${this.#gameClient.GetNumberOfUnitsTicking()} ticking), ${m["num-projectiles"]} projectiles
Net bandwidth: ${Math.round(runtime.objects.Multiplayer.stats.outboundBandwidth / 1024)} kb/s up, ${Math.round(runtime.objects.Multiplayer.stats.inboundBandwidth / 1024)} kb/s down
Server performance: ${m["server-fps"]} FPS, ${Math.round(m["server-thread-usage"] * 100)}% CPU
Client performance: ${runtime.fps} FPS, ${Math.round(runtime.cpuUtilisation * 100)}% CPU
Latency: [b]${Math.round(pingManager.GetLatency() * 1000)} ms[/b] (pdv ${Math.round(pingManager.GetPdv() * 1000)} ms)
Server data: state ${Math.round(m["sent-state-bytes"] / 1024)} kb/s, deltas ${Math.round(m["sent-delta-bytes"] / 1024)} kb/s, events ${Math.round(m["sent-event-bytes"] / 1024)} kb/s, total [b]${Math.round((m["sent-state-bytes"] + m["sent-delta-bytes"] + m["sent-event-bytes"]) / 1024)} kb/s[/b]`;
	}
}