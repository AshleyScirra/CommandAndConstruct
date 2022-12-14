
import Globals from "../globals.js";
import * as MathUtils from "../utils/clientMathUtils.js";

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
		// Read the game time. TODO: use this to help smooth game state.
		const gameTime = dataView.getFloat32(pos);
		pos += 4;
		
		// Read the full unit updates that come first.
		pos = this.#ReadFullUnitUpdates(dataView, pos);
		
		// Read the delta updates that follow.
		this.#ReadDeltaUnitUpdates(dataView, pos);
	}
	
	#ReadFullUnitUpdates(dataView, pos)
	{
		// Read the total number of full updates in this update.
		const unitCount = dataView.getUint16(pos);
		pos += 2;

		// For each unit in the data, read the unit's data.
		for (let i = 0; i < unitCount; ++i)
		{
			// Read unit ID.
			// NOTE: if the unit ID is not found, read the rest of the values
			// anyway, since the read position still has to be advanced.
			const unitId = dataView.getUint16(pos);
			pos += 2;

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

			// Now all the data has been read, look up the unit by its ID,
			// and if found update it with these details.
			const unit = this.#gameClient.GetUnitById(unitId);
			if (unit)
			{
				// Update platform position, speed and angle.
				const platform = unit.GetPlatform();
				platform.SetPosition(x, y);
				platform.SetSpeed(speed);
				platform.SetAngle(platformAngle);
				
				// Update turret offset angle.
				const turret = unit.GetTurret();
				turret.SetOffsetAngle(turretOffsetAngle);
				
				// Tell unit it received a full update.
				unit.OnFullUpdate();
			}
		}
		
		return pos;
	}
	
	#ReadDeltaUnitUpdates(dataView, pos)
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
					unit.GetPlatform().SetSpeed(speed);
			}
			
			if ((deltaChangeFlags & FLAG_CHANGED_PLATFORM_ANGLE) !== 0)
			{
				const platformAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
				pos += 2;
				
				if (unit)
				{
					unit.GetPlatform().SetAngle(platformAngle);
					
					// Update the turret to follow the platform.
					unit.GetTurret().Update();

					// If this unit has a selection box, update that too.
					unit.UpdateSelectionBox();
				}
			}
			
			if ((deltaChangeFlags & FLAG_CHANGED_TURRET_OFFSET_ANGLE) !== 0)
			{
				const offsetAngle = MathUtils.Uint16ToAngle(dataView.getUint16(pos));
				pos += 2;
				
				if (unit)
				{
					unit.GetTurret().SetOffsetAngle(offsetAngle);
					unit.GetTurret().Update();
				}
			}
		}
	}
	
	#OnNetworkEvents(dataView, pos)
	{
		// Read the game time. TODO: use this to help smooth game state.
		const gameTime = dataView.getFloat32(pos);
		pos += 4;
		
		// Read the number of events.
		const eventCount = dataView.getUint16(pos);
		pos += 2;
		
		// Read each individual event.
		for (let i = 0; i < eventCount; ++i)
		{
			// Get event type
			const eventType = dataView.getUint8(pos);
			pos += 1;
			
			// Read each type of message with a separate method.
			// Note the types correspond to those listed in NetworkEvent on the server.
			if (eventType === 0)
				pos = this.#ReadProjectileFiredEvent(dataView, pos);
			else if (eventType === 1)
				pos = this.#ReadProjectileHitEvent(dataView, pos);
			else if (eventType === 2)
				pos = this.#ReadUnitDestroyedEvent(dataView, pos);
			else
				throw new Error(`unknown event type '${eventType}'`);
		}
	}
	
	#ReadProjectileFiredEvent(dataView, pos)
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
		
		this.#gameClient.OnProjectileFired(id, x, y, angle, speed, range, distanceTravelled);
		return pos;
	}
	
	#ReadProjectileHitEvent(dataView, pos)
	{
		// Projectile ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		// Read X, Y
		const x = dataView.getUint16(pos);
		pos += 2;
		const y = dataView.getUint16(pos);
		pos += 2;
		
		this.#gameClient.OnProjectileHit(id, x, y);
		return pos;
	}
	
	#ReadUnitDestroyedEvent(dataView, pos)
	{
		// Unit ID
		const id = dataView.getUint16(pos);
		pos += 2;
		
		this.#gameClient.OnUnitDestroyed(id);
		return pos;
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
		inst.text = `Unit count: ${m["num-units"]}
Projectile count: ${m["num-projectiles"]}
Server state: ${Math.round(m["sent-state-bytes"] / 1024)} kb/s
Server deltas: ${Math.round(m["sent-delta-bytes"] / 1024)} kb/s
Server events: ${Math.round(m["sent-event-bytes"] / 1024)} kb/s
Net bandwidth: ${Math.round(runtime.objects.Multiplayer.stats.outboundBandwidth / 1024)} kb/s up, ${Math.round(runtime.objects.Multiplayer.stats.inboundBandwidth / 1024)} kb/s down
Server compression: ${Math.max(100 - Math.round(runtime.objects.Multiplayer.stats.outboundBandwidth * 100 / (m["sent-state-bytes"] + m["sent-delta-bytes"] + m["sent-event-bytes"])), 0)}%
Server performance: ${m["server-fps"]} FPS, ${Math.round(m["server-thread-usage"] * 100)}% CPU`;
	}
}